; Debug module: the hidden in-cartridge scene select, the cartridge's
; equivalent of the browser's `?start=` test presets. See
; docs/agents/snes-port/debug.md.
;
;  - title.asm   title-screen code (Up Up Down Down Left Right Left Right)
;                read from the title program's own frame (IRQ) and the
;                scene-select screen, a standalone program drawn with the
;                cartridge's dialogue font and window art
;  - pilot.asm   the autopilot: NEW GAME through the native game select and
;                name editor, the quick-boot redirect of the first event
;  - recipe.asm  the preset recipes (generated from engine/quick-start.js by
;                snes/gen/debug.mjs) executed natively in field/world frames
;
; State lives in SRAM work ($31:7600, $200 bytes); the module has no WRAM
; block. A preset is "armed" only between a choice in the scene select and
; the end of its recipe; every title entry disarms it, so ordinary play and
; saves never see any of this.

incsrc "debug/defines.asm"

; ---------------------------------------------------------------------------
; SRAM work (!SRAM_WORK_DEBUG, $31:7600-$31:77FF; contents undefined at boot)
!dbg_magic       = !SRAM_WORK_DEBUG+$00 ; word: !DBG_MAGIC while a preset is armed
!dbg_preset      = !SRAM_WORK_DEBUG+$02 ; byte: armed preset id (!DEBUG_PRESET_*)
!dbg_phase       = !SRAM_WORK_DEBUG+$03 ; byte: !DBG_PH_*
!dbg_pc          = !SRAM_WORK_DEBUG+$04 ; word: recipe pointer (debug bank)
!dbg_timer       = !SRAM_WORK_DEBUG+$06 ; word: op timer
!dbg_state       = !SRAM_WORK_DEBUG+$08 ; word: op sub-state (0 at op start)
!dbg_frames      = !SRAM_WORK_DEBUG+$0A ; word: frames since the preset was armed
!dbg_status      = !SRAM_WORK_DEBUG+$0C ; byte: !DBG_ST_* (kept after disarm, for tests)
!dbg_error       = !SRAM_WORK_DEBUG+$0D ; byte: failing op (or $F0+ boot phase)
!dbg_err_pc      = !SRAM_WORK_DEBUG+$0E ; word: recipe pointer of the failure
!dbg_marks       = !SRAM_WORK_DEBUG+$10 ; word: last MARK slot+1 (browser capture points passed)
!dbg_done_frame  = !SRAM_WORK_DEBUG+$12 ; word: !dbg_frames when the recipe ended
!dbg_code_step   = !SRAM_WORK_DEBUG+$14 ; byte: title code progress (0-8)
!dbg_code_timer  = !SRAM_WORK_DEBUG+$15 ; byte: frames since the last code press
!dbg_code_prev   = !SRAM_WORK_DEBUG+$16 ; word: pad 1 at the previous title frame
!dbg_cursor      = !SRAM_WORK_DEBUG+$18 ; byte: scene-select cursor (preset id)
!dbg_drawn       = !SRAM_WORK_DEBUG+$19 ; byte: cursor drawn on screen ($FF none)
!dbg_menu_prev   = !SRAM_WORK_DEBUG+$1A ; word: pad at the previous menu frame
!dbg_repeat      = !SRAM_WORK_DEBUG+$1C ; byte: direction auto-repeat counter
!dbg_menu_active = !SRAM_WORK_DEBUG+$1D ; byte: 1 while the scene-select screen runs
!dbg_last        = !SRAM_WORK_DEBUG+$1E ; byte: last launched preset (cursor start)
!dbg_last_valid  = !SRAM_WORK_DEBUG+$1F ; byte: $A5 when !dbg_last is valid
!dbg_tmp0        = !SRAM_WORK_DEBUG+$20 ; word scratch
!dbg_tmp1        = !SRAM_WORK_DEBUG+$22 ; word
!dbg_tmp2        = !SRAM_WORK_DEBUG+$24 ; word
!dbg_tmp3        = !SRAM_WORK_DEBUG+$26 ; word
!dbg_stable      = !SRAM_WORK_DEBUG+$28 ; word: frames a condition has held
!dbg_pulse       = !SRAM_WORK_DEBUG+$2A ; word: text-advance / confirm pulse timer
!dbg_hooks_done  = !SRAM_WORK_DEBUG+$2C ; word: HOOK op: bit0 ANY done, bit1 preset done
!dbg_op_frames   = !SRAM_WORK_DEBUG+$2E ; word: frames spent in the current op (timeouts)
!dbg_hook_args   = !SRAM_WORK_DEBUG+$30 ; word kind, word payload (debug_call_hook)
!dbg_menu_frames = !SRAM_WORK_DEBUG+$34 ; word: menu-autopilot frame counter
!dbg_boot_ok     = !SRAM_WORK_DEBUG+$36 ; word: frame the boot reached its room
!dbg_newgame     = !SRAM_WORK_DEBUG+$38 ; byte: native new-game init ran for this preset
!dbg_soft        = !SRAM_WORK_DEBUG+$3A ; word: soft waits that expired (module logic missing)
!dbg_soft_pc     = !SRAM_WORK_DEBUG+$3C ; word: recipe pointer of the first one
; $3E-$FF free
!DBG_TEST_LOG    = !SRAM_WORK_DEBUG+$100 ; test builds: hook log (word count, 4-byte entries), +$FE SCENE count

!DBG_MAGIC  = $4244                   ; 'DB'
!DBG_PH_MENU     = $01                ; native game select / name editor
!DBG_PH_BOOT     = $02                ; first event (100) not redirected yet
!DBG_PH_BOOTWAIT = $03                ; boot script running until its room
!DBG_PH_RECIPE   = $04                ; recipe ops
!DBG_ST_IDLE    = $00
!DBG_ST_RUNNING = $01
!DBG_ST_DONE    = $02
!DBG_ST_FAILED  = $03
!DBG_ST_ABORTED = $04
!DBG_OP_TIMEOUT = 9000                ; frames any single wait may take
!DBG_BANK = (!CODE_DEBUG>>16)
!DBG_BASE = !CODE_DEBUG-$8000          ; $AF0000: recipe and script reads

pushpc
org !CODE_DEBUG
debug_code_start:

incsrc "title.asm"
incsrc "pilot.asm"
incsrc "recipe.asm"

; ---------------------------------------------------------------------------
; Shared helpers (M16/X16, DB = $7E, D = 0 unless noted).

; Carry set while a preset is armed.
debug_armed:
	LDA.l !dbg_magic
	CMP.w #!DBG_MAGIC
	BEQ +
	CLC
	RTS
+	SEC
	RTS

; Disarm with status A (low byte). Input is the player's again.
debug_disarm:
	SEP #$20
	STA.l !dbg_status
	REP #$20
	LDA.w #$0000
	STA.l !dbg_magic
	RTS

; Fail with op/phase A (low byte) at the current recipe pointer.
debug_fail:
	SEP #$20
	STA.l !dbg_error
	REP #$20
	LDA.l !dbg_pc
	STA.l !dbg_err_pc
	LDA.w #!DBG_ST_FAILED
	JMP debug_disarm

; Field vectors installed ($0100-$0107 = JML $00C0A8 / JML $01C1CF): the
; field loop owns the frame. Carry set when true.
debug_field_vectors:
	LDA.l $000100
	CMP.w #$A85C
	BNE .no
	LDA.l $000102
	CMP.w #$00C0
	BNE .no
	LDA.l $000104
	CMP.w #$CF5C
	BNE .no
	LDA.l $000106
	CMP.w #$00C1
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; The field is idle: no event, no fade, no pending load, no menu (the
; conditions core_event_pump starts a native event under). Carry set.
debug_field_idle:
	JSR debug_field_vectors
	BCC .no
	SEP #$20
	LDA $D0
	BNE .no8
	LDA $EC
	AND.b #$FE
	BNE .no8
	LDA $E4
	CMP.b #$01
	BNE .no8
	LDA $E5
	CMP.b #$01
	BNE .no8
	LDA $FF
	BNE .no8
	LDA $E8
	AND.b #$04
	BNE .no8
	REP #$20
	SEC
	RTS
.no8
	REP #$20
.no
	CLC
	RTS

; canAttack (engine/mana-mod.js; story_compute_can_act): Goku active and
; controllable in the field. Carry set when true.
debug_can_act:
	SEP #$20
	LDA.l !persist_goku_active
	REP #$20
	AND.w #$00FF
	BEQ .no
	JSR debug_field_vectors
	BCC .no
	SEP #$20
	LDA $E4
	CMP.b #$01
	BNE .no8
	LDA $E5
	CMP.b #$01
	BNE .no8
	LDA.l $7EE000
	AND.b #$01
	BEQ .no8
	LDA.l $7EE02C
	AND.b #$01
	BEQ .no8
	LDA $EC
	AND.b #$FE
	BNE .no8
	LDA $ED
	AND.b #$40
	BNE .no8
	LDA $D0
	BNE .no8
	LDA.l $7EE190
	AND.b #$70
	BNE .no8
	LDA.l $7EE191
	AND.b #$D5
	BNE .no8
	LDA.l $7EE011                    ; native hurt poses 8C-8F
	CMP.b #$8C
	BCC +
	CMP.b #$90
	BCC .no8
+	REP #$20
	LDA.w #!STORY_Q_ENDING_ACTIVE
	JSR debug_story_query
	BNE .no
	SEC
	RTS
.no8
	REP #$20
.no
	CLC
	RTS

; A = story query id (< $80) -> A = value (Z set when 0). Calls the story
; module's query table like story_query; unimplemented queries answer 0.
debug_story_query:
	PHX
	PHY
	AND.w #$007F
	STA.l !dbg_tmp3
	ASL
	CLC
	ADC.l !dbg_tmp3
	TAX
	LDA.l story_query_table,X
	CMP.w #story_query_zero&$FFFF
	BNE +
	LDA.l story_query_table+1,X
	CMP.w #(story_query_zero>>8)&$FFFF
	BNE +
	LDA.w #$0000
	BRA .out
+	PHB
	PEA $7E7E : PLB : PLB
	PHK
	PER .back-1
	SEP #$20
	LDA.l story_query_table+2,X
	PHA
	REP #$20
	LDA.l story_query_table,X
	DEC
	PHA
	RTL
.back
	REP #$30
	PLB
.out
	AND.w #$00FF
	PLY
	PLX
	CMP.w #$0000
	RTS

; Hide the physical pad from the game (the autopilot drives it) and, while
; armed, let Start+Select+L+R through as an abort (the game then soft-resets
; as usual). Carry set when the run was aborted.
debug_take_input:
	LDA.l !core_pad
	AND.w #$F0F0
	CMP.w #!PAD_START|!PAD_SELECT|!PAD_L|!PAD_R
	BNE +
	LDA.w #!DBG_ST_ABORTED
	JSR debug_disarm
	SEC
	RTS
+	LDA.w !core_pad_mask&$FFFF
	ORA.w #$FFF0
	STA.w !core_pad_mask&$FFFF
	CLC
	RTS

; Inject A (pad bits) into the game's next pad read.
debug_press:
	ORA.w !core_pad_inject&$FFFF
	STA.w !core_pad_inject&$FFFF
	RTS

; Text advance (the browser's R fast-forward, which confirms prose and stops
; at choices): pulse B on a button wait ($D0 = $83) unless the window holds
; a choice.
debug_advance:
	SEP #$20
	LDA $D0
	CMP.b #$83
	REP #$20
	BNE .out
	JSL story_api_window_has_choice
	BCS .out
	LDA.l !dbg_pulse
	INC
	STA.l !dbg_pulse
	AND.w #$0007
	BNE .out
	LDA.w #!PAD_B
	JSR debug_press
.out
	RTS

; Slot 0 becomes GOKU with the boy's name, BOY, in its tail (native-names.js
; crownGoku with the title editor's default name). Carry set: Goku has also
; arrived, as the browser's arrival infers once CF10 > 0 (arrival.js
; restore: complete, no crater): Goku active and the title module's arrival
; bit, without its crater/pod scenery bit.
debug_crown:
	PHP
	LDX.w #$000A
-	LDA.l debug_crown_name,X
	STA.l $7ECC00,X
	DEX
	DEX
	BPL -
	PLP
	BCC .out
	SEP #$20
	LDA.b #$01
	STA.l !persist_goku_active
if defined("persist_title_arrival")
	LDA.l !persist_title_arrival
	ORA.b #$01
	STA.l !persist_title_arrival
endif
	REP #$20
.out
	RTS
debug_crown_name:
	db $A1,$A9,$A5,$AF,$00,$00,$9C,$A9,$B3,$00,$00,$00   ; GOKU / BOY

; Hook stub: modules that implement nothing answer "done".
debug_hook_stub:
	CLC
	RTL

; Test builds (-DDEBUG_TEST): hooks as another module would define them.
; Every call appends (kind, preset, payload word) to a log at
; !DBG_TEST_LOG (word count, then 4-byte entries); a SCENE call answers
; "not yet" 30 times per wait before it lets the recipe go on.
if defined("DEBUG_TEST")
!DEBUG_PRESET_HOOK_ANY = debug_test_hook_any
!DEBUG_PRESET_HOOK_BEAST = debug_test_hook_beast
debug_test_hook_any:
	PHA
	PHX
	PHY
	LDA.l !DBG_TEST_LOG
	CMP.w #63
	BCS .full
	ASL
	ASL
	TAX
	LDA $05,S                       ; kind
	SEP #$20
	STA.l !DBG_TEST_LOG+2,X
	LDA $03,S                       ; preset
	STA.l !DBG_TEST_LOG+3,X
	REP #$20
	LDA $01,S                       ; payload
	STA.l !DBG_TEST_LOG+4,X
	LDA.l !DBG_TEST_LOG
	INC
	STA.l !DBG_TEST_LOG
.full
	PLY
	PLX
	PLA
	CLC
	RTL
debug_test_hook_beast:
	CMP.w #!DEBUG_HOOK_SCENE
	BNE .done
	LDA.l !DBG_TEST_LOG+$FE         ; SCENE answers so far
	INC
	STA.l !DBG_TEST_LOG+$FE
	CMP.w #31
	BCS .done
	SEC
	RTL
.done
	CLC
	RTL
endif

; Tables generated from engine/quick-start.js (snes/gen/debug.mjs).
incsrc "debug/presets.asm"

debug_tiles:
	incbin "debug/tiles.bin"
debug_tiles_end:
debug_bg1:
	incbin "debug/bg1.bin"
debug_bg2:
	incbin "debug/bg2.bin"

debug_code_end:
assert debug_code_end <= !CODE_DEBUG+$7F00, "debug bank overflow (hook table at +$7F00)"
pullpc

; Addresses for tests and tools (symbol file).
debug_addresses = !SRAM_WORK_DEBUG
