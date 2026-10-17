; Autopilot (included by module.asm in the debug code bank). Drives the
; cartridge's own NEW GAME exactly as engine/quick-boot.js drives the
; browser player, then hands over to the preset's recipe:
;   PH_MENU      game select and name editor (core menu frames): Up until
;                NEW GAME is selected, B to open the editor, B to type a
;                letter, Start to accept. The title preset stops here.
;   PH_BOOT      first field frames: when the new game's first event (100)
;                starts, its pointer moves to the preset's boot script
;                (quick-boot.js's event 400/106 bytes, in this bank), the
;                native equivalent of the browser's temporary byte patch.
;   PH_BOOTWAIT  the script runs natively until its staging room is idle;
;                then slot 0 becomes GOKU (crownGoku) and the recipe starts.
;   PH_RECIPE    recipe.asm, in field and world frames.
; While armed, the physical pad is hidden from the game; Start+Select+L+R
; aborts (and the game soft-resets as usual).

; Arm the autopilot for !dbg_preset (from the scene-select screen, any DB).
debug_arm:
	LDA.w #$0000
	STA.l !dbg_pc
	STA.l !dbg_timer
	STA.l !dbg_state
	STA.l !dbg_frames
	STA.l !dbg_marks
	STA.l !dbg_done_frame
	STA.l !dbg_err_pc
	STA.l !dbg_stable
	STA.l !dbg_pulse
	STA.l !dbg_hooks_done
	STA.l !dbg_op_frames
	STA.l !dbg_menu_frames
	STA.l !dbg_boot_ok
	SEP #$20
	STA.l !dbg_error
	STA.l !dbg_newgame
	LDA.b #!DBG_PH_MENU
	STA.l !dbg_phase
	LDA.b #!DBG_ST_RUNNING
	STA.l !dbg_status
	REP #$20
	LDA.w #!DBG_MAGIC
	STA.l !dbg_magic
	RTS

; X = !dbg_preset * 8 (debug_preset_table record).
debug_preset_x:
	LDA.l !dbg_preset
	AND.w #$00FF
	ASL
	ASL
	ASL
	TAX
	RTS

; ---------------------------------------------------------------------------
; modules_menu_frame (in vblank after the menu's uploads; M16/X16, DB = $7E).
debug_menu_frame:
	JSR debug_armed
	BCS +
	RTL
+	JSR debug_take_input
	BCC +
	RTL
+	LDA.l !dbg_frames
	INC
	STA.l !dbg_frames
	LDA.l !dbg_phase
	AND.w #$00FF
	CMP.w #!DBG_PH_RECIPE
	BNE +
	JSR debug_recipe_run            ; the title preset's recipe (in the editor)
	RTL
+	CMP.w #!DBG_PH_MENU
	BEQ +
	RTL
+	LDA.l !dbg_menu_frames
	INC
	STA.l !dbg_menu_frames
	CMP.w #3000
	BCC +
	LDA.w #$00F1
	JSR debug_fail
	RTL
+	SEP #$20
	LDA $A202
	CMP.b #$03
	REP #$20
	BEQ .editor
	; Game select: move to NEW GAME, then B (one pulse every 8 frames so the
	; menus' 4-frame input poll sees a press and a release).
	LDA.w #$0000
	STA.l !dbg_stable
	LDA.l !dbg_menu_frames
	AND.w #$0007
	BNE .out
	SEP #$20
	LDA $A211
	REP #$20
	AND.w #$00FF
	BEQ +
	LDA.w #!PAD_UP
	JSR debug_press
	RTL
+	LDA.w #!PAD_B
	JSR debug_press
	RTL
.editor
	JSR debug_preset_x
	LDA.l debug_preset_table+6,X
	AND.w #$00FF
	CMP.w #!DEBUG_BOOT_EDITOR
	BNE .name
	; title: the browser captures the name editor 180 frames after B.
	LDA.l !dbg_stable
	INC
	STA.l !dbg_stable
	CMP.w #120
	BCC .out
	LDA.l debug_preset_table,X
	STA.l !dbg_pc
	JSR debug_op_reset
	SEP #$20
	LDA.b #!DBG_PH_RECIPE
	STA.l !dbg_phase
	REP #$20
	RTL
.name
	LDA.l !dbg_menu_frames
	AND.w #$0007
	BNE .out
	SEP #$20
	LDA $A1CC                       ; name length
	REP #$20
	AND.w #$00FF
	BNE +
	LDA.w #!PAD_B                   ; type a letter (slot 0 is set later)
	JSR debug_press
	RTL
+	LDA.w #!PAD_START
	JSR debug_press
.out
	RTL

; modules_new_game: the native NEW GAME initializer ran.
debug_new_game:
	JSR debug_armed
	BCC +
	SEP #$20
	LDA.b #$01
	STA.l !dbg_newgame
	REP #$20
+	RTL

; ---------------------------------------------------------------------------
; modules_field_frame (after story_field_frame; M16/X16, DB = $7E, D = 0).
debug_field_frame:
	JSR debug_armed
	BCS +
	RTL
+	JSR debug_take_input
	BCC +
	RTL
+	LDA.l !dbg_frames
	INC
	STA.l !dbg_frames
	SEP #$20
	LDA.l !dbg_phase
	REP #$20
	AND.w #$00FF
	CMP.w #!DBG_PH_MENU
	BNE +
	JSR debug_field_start
	RTL
+	CMP.w #!DBG_PH_BOOT
	BNE +
	JSR debug_boot_redirect
	RTL
+	CMP.w #!DBG_PH_BOOTWAIT
	BNE +
	JSR debug_boot_wait
	RTL
+	CMP.w #!DBG_PH_RECIPE
	BNE +
	JSR debug_recipe_run
+	RTL

; modules_world_frame (world flight; M16/X16, DB = $7E, D = 0). The boot
; script's legend fly-over and the flight preset run here.
debug_world_frame:
	JSR debug_armed
	BCS +
	RTL
+	JSR debug_take_input
	BCC +
	RTL
+	LDA.l !dbg_frames
	INC
	STA.l !dbg_frames
	SEP #$20
	LDA.l !dbg_phase
	CMP.b #!DBG_PH_RECIPE
	REP #$20
	BNE +
	JSR debug_recipe_run
	RTL
+	LDA.l !dbg_op_frames
	INC
	STA.l !dbg_op_frames
	RTL

; First field frame of the new game.
debug_field_start:
	LDA.w #$0000
	STA.l !dbg_op_frames
	STA.l !dbg_stable
	JSR debug_preset_x
	LDA.l debug_preset_table+6,X
	AND.w #$00FF
	CMP.w #!DEBUG_BOOT_SCRIPT
	BEQ .script
	CMP.w #!DEBUG_BOOT_OPENING
	BEQ .opening
	LDA.w #$00F2                    ; the title preset never reaches the field
	JMP debug_fail
.opening
	; The browser's editor holds BOY (title module prefill) when Start is
	; pressed; the autopilot typed a placeholder letter.
	LDX.w #$000A
-	LDA.l debug_boy_name,X
	STA.l $7ECC00,X
	DEX
	DEX
	BPL -
	JSR debug_preset_x
	LDA.l debug_preset_table,X
	STA.l !dbg_pc
	JSR debug_op_reset
	SEP #$20
	LDA.b #!DBG_PH_RECIPE
	STA.l !dbg_phase
	REP #$20
	RTS
.script
	SEP #$20
	LDA.b #!DBG_PH_BOOT
	STA.l !dbg_phase
	REP #$20
	JMP debug_boot_redirect
debug_boy_name:
	db $9C,$A9,$B3,$00,$00,$00,$00,$00,$00,$00,$00,$00   ; BOY

; PH_BOOT: event 100 started (pointer still at its first byte; the
; interpreter only runs inside the next frame's logic) -> boot script.
debug_boot_redirect:
	LDA.l !dbg_op_frames
	INC
	STA.l !dbg_op_frames
	CMP.w #3000
	BCC +
	LDA.w #$00F3
	JMP debug_fail
+	SEP #$20
	LDA $D0
	REP #$20
	AND.w #$00FF
	BEQ .out
	LDA $D1
	CMP.w #!DEBUG_EVENT100&$FFFF
	BNE .out
	SEP #$20
	LDA $D3
	CMP.b #!DEBUG_EVENT100>>16
	REP #$20
	BNE .out
	JSR debug_preset_x
	LDA.l debug_preset_table+2,X
	STA $D1
	SEP #$20
	LDA.b #!DBG_BANK
	STA $D3
	LDA.b #!DBG_PH_BOOTWAIT
	STA.l !dbg_phase
	REP #$20
	LDA.w #$0000
	STA.l !dbg_op_frames
	STA.l !dbg_stable
.out
	RTS

; PH_BOOTWAIT: the staging room is loaded, its script ended and the field
; idle for a few frames (quick-boot.js ready()). Crown, then the recipe.
debug_boot_wait:
	LDA.l !dbg_op_frames
	INC
	STA.l !dbg_op_frames
	CMP.w #!DBG_OP_TIMEOUT
	BCC +
	LDA.w #$00F4
	JMP debug_fail
+	JSR debug_preset_x
	LDA $DC
	AND.w #$01FF
	CMP.l debug_preset_table+4,X
	BNE .no
	JSR debug_field_idle
	BCC .no
	LDA.l $7EE000
	AND.w #$0001
	BEQ .no
	LDA.l !dbg_stable
	INC
	STA.l !dbg_stable
	CMP.w #$0004
	BCC .out
	; crownGoku; Goku is active when the script recorded his arrival (CF10)
	JSR debug_preset_x
	LDA.l debug_preset_table+6,X
	AND.w #$0200                    ; flags byte bit 1 (high byte of the word)
	CMP.w #$0200
	JSR debug_crown
	JSR debug_preset_x
	LDA.l debug_preset_table,X
	STA.l !dbg_pc
	JSR debug_op_reset
	LDA.l !dbg_frames
	STA.l !dbg_boot_ok
	SEP #$20
	LDA.b #!DBG_PH_RECIPE
	STA.l !dbg_phase
	REP #$20
	RTS
.no
	LDA.w #$0000
	STA.l !dbg_stable
.out
	RTS
