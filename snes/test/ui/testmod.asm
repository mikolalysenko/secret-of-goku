; UI_TEST builds only (node snes/build.mjs -DUI_TEST=1): a test client of
; the UI API standing in for modules that are not merged yet (combat,
; flight, world, story, destroy). Lua drives it through !RAM_UI words:
;   !ui_test   command (cleared when done), !ui_test_a / !ui_test_x args,
;   result: !ui_test_a = carry (0/1)
;   !ui_test_charge  nonzero: ui_charge_tick(flags) every frame
; Commands: 1 say, 2 interrupt, 3 barrier, 4 ceiling escape, 5 dismiss,
; 6 power intro super, 7 power intro flight, 8 restore first flight,
; 9 set inputs (A set, X clear), 10 quest collected (A palace, X = stub
; quest status held | collected<<8), 11 hide (A bits), 12 unhide (A bits),
; 13 destroy reaction (A id, X map), 14 multiply, 15 story event, 16 window
; choice, 17 weighted gi, 18 native Analyzer store, 19 generic power, 20 retire UI DMA, 21 palette ownership.
; Isolation: while !ui_s_tiso is nonzero the radio's public calls from other
; modules (a Frieza hint, a story hook...) are ignored and counted at
; !ui_s_tiso+2, so a scripted session sees only its own lines (lib.lua
; enter() sets it).
!ui_test_charge = !RAM_UI+$48
!ui_s_tiso = !SRAM_WORK_UI+$33C

ui_test_poll:
	LDA.w !ui_test_charge&$FFFF
	BEQ +
	JSL ui_charge_tick
+	LDA.w !ui_test&$FFFF
	BNE .cmd
	RTS
.cmd
	ASL
	TAX
	LDA.w !ui_test_a&$FFFF
	JSR (ui_test_cmds,X)
	LDA.w #$0000
	ROL
	STA.w !ui_test_a&$FFFF
	STZ.w !ui_test&$FFFF
	RTS

ui_test_cmds:
	dw ui_t_none, ui_t_say, ui_t_interrupt, ui_t_barrier, ui_t_ceiling, ui_t_dismiss
	dw ui_t_super, ui_t_flight, ui_t_restore, ui_t_inputs, ui_t_quest, ui_t_hide, ui_t_unhide
	dw ui_t_react, ui_t_mul, ui_t_event, ui_t_choice, ui_t_weighted, ui_t_analyzer, ui_t_power, ui_t_retire, ui_t_palette

; From ui_api_enter (stack: gate return, D, DB, P, the caller's JSL return):
; carry set when the test isolates the radio and the caller is not this
; bank. Keeps A/X/Y.
ui_test_gate:
	PHA
	LDA.l !ui_s_tiso
	BEQ .open
	LDA 11,S                          ; the caller's bank
	AND.w #$00FF
	CMP.w #ui_code_start>>16
	BEQ .open
	LDA.l !ui_s_tiso+2
	INC
	STA.l !ui_s_tiso+2
	PLA
	SEC
	RTS
.open
	PLA
	CLC
	RTS

ui_t_none:
	SEC
	RTS
ui_t_say:
	LDX.w !ui_test_x&$FFFF
	JSL ui_say
	RTS
ui_t_interrupt:
	LDX.w !ui_test_x&$FFFF
	JSL ui_interrupt
	RTS
ui_t_barrier:
	LDX.w !ui_test_x&$FFFF
	JSL ui_barrier
	RTS
ui_t_ceiling:
	LDX.w !ui_test_x&$FFFF
	JSL ui_ceiling_escape
	RTS
ui_t_dismiss:
	LDX.w !ui_test_x&$FFFF
	JSL ui_dismiss
	RTS
ui_t_super:
	LDX.w !ui_test_x&$FFFF
	JSL ui_power_intro_super
	RTS
ui_t_flight:
	LDX.w !ui_test_x&$FFFF
	JSL ui_power_intro_flight
	RTS
ui_t_restore:
	LDX.w !ui_test_x&$FFFF
	JSL ui_restore_first_flight
	RTS
ui_t_inputs:
	LDX.w !ui_test_x&$FFFF
	JSL ui_set_inputs
	CLC
	RTS
ui_t_quest:
	LDX.w !ui_test_x&$FFFF
	STX.w !ui_stub_q&$FFFF
	JSL ui_hook_quest_collected
	RTS
ui_t_hide:
	LDX.w !ui_test_x&$FFFF
	JSL ui_hide
	CLC
	RTS
ui_t_unhide:
	LDX.w !ui_test_x&$FFFF
	JSL ui_unhide
	CLC
	RTS
ui_t_react:
	LDX.w !ui_test_x&$FFFF
	JSL ui_destroy_reaction
	RTS
; A = U: the radar's rotation products with !ui_ma / !ui_mb set by the test
; (results in !ui_k5 / !ui_k6).
ui_t_mul:
	JSR ui_mul2r11
	SEC
	RTS
; Story API for the fast-forward test: queue event A (carry = queued), and
; ask whether the interpreter's window holds a choice (carry = choice).
ui_t_event:
if defined("UI_HAVE_STORY")
	LDX.w #$0000
	JSL story_api_request
	REP #$30
else
	CLC
endif
	RTS
ui_t_choice:
if defined("UI_HAVE_STORY")
	JSL story_api_window_has_choice
	REP #$30
else
	CLC
endif
	RTS
; The weighted gi (story query EQUIP_WEIGHTED, answered by combat): carry.
ui_t_weighted:
if defined("STORY_Q_EQUIP_WEIGHTED")
	LDA.w #!STORY_Q_EQUIP_WEIGHTED
	JSR ui_story_query
	CMP.w #$0001
else
	CLC
endif
	RTS

; Execute the real patched native store. The Lua test resumes this client
; at C0:3FB2, before the unrelated native crystal-orb event dispatch.
ui_t_analyzer:
	TAY
	LDA.w #$0017
	SEP #$20
	JML $C03FAD
ui_t_analyzer_return:
	CLC
	RTS

; A=max HP, X argument = actor index | multiplier<<8. Keep native stats.
ui_t_power:
	PHA
	LDA.w !ui_test_x&$FFFF
	XBA : AND.w #$00FF : STA.w !sc_mod&$FFFF
	LDA.w !ui_test_x&$FFFF
	AND.w #$00FF : ASL : TAY : XBA : TAX
	LDA.w $E184,X : PHA
	PHX
	LDA $05,S : STA.w $E184,X
	LDA.w #$FFFF : STA.w !sc_fmt&$FFFF,Y
	STZ.w !sc_keyf&$FFFF
	PHY
	JSR ui_sc_power
	PLY
	LDA.w !sc_fmt&$FFFF,Y : STA.w !ui_test_x&$FFFF
	PLX
	PLA : STA.w $E184,X
	PLA
	CLC
	RTS

; Exercise queue compaction before a mode transition: two UI rows interleaved
; with unrelated transfers. None reaches hardware; restore the idle queue.
ui_t_retire:
	LDA.l !core_dma_count
	BEQ +
	SEC
	RTS
+	LDA.l !fx_ccell : PHA
	LDA.w #$8000 : STA.l !fx_ccell
	LDA.w #1 : STA.w !sc_pending&$FFFF
	LDX.w #0
-	LDA.l ui_t_transfers,X : STA.l !core_dma_table,X
	INX : INX : CPX.w #32 : BCC -
	LDA.w #4 : STA.l !core_dma_count
	LDA.w #224 : STA.l !core_dma_bytes
	; A new map must cancel stale UI rows even if the frame already missed
	; its deadline. Force the completed-frame check to yield after retirement.
	LDA.w #!UISC_ACTIVE|!UISC_RESIDENT : TSB.w !ui_sc&$FFFF
	LDA.w $00DC : EOR.w #$FFFF : STA.w !sc_map&$FFFF
	LDA.w !RAM_COMBAT+$C6&$FFFF : PHA
	LDA.w !RAM_COMBAT+$C4&$FFFF : DEC : STA.w !RAM_COMBAT+$C6&$FFFF
	JSL ui_sc_draw_frame
	PLA : STA.w !RAM_COMBAT+$C6&$FFFF
	LDA.l !core_dma_count : CMP.w #2 : BNE .bad
	LDA.l !core_dma_bytes : CMP.w #96 : BNE .bad
	LDX.w #0
-	LDA.l !core_dma_table,X : CMP.l ui_t_transfers,X : BNE .bad
	LDA.l !core_dma_table+8,X : CMP.l ui_t_transfers+16,X : BNE .bad
	INX : INX : CPX.w #8 : BCC -
	LDA.l !fx_ccell : CMP.w #$FFFF : BNE .bad
	LDA.w !sc_pending&$FFFF : BNE .bad
	LDY.w #0
	BRA .done
.bad
	LDY.w #1
.done
	LDA.w #0 : STA.l !core_dma_count : STA.l !core_dma_bytes
	STA.w !sc_pending&$FFFF
	PLA : STA.l !fx_ccell
	TYA : LSR
	RTS
ui_t_transfers:
	dw $7D22,$00D8,$4000,32
	dw $7D22,$00D8,$7220,64
	dw $7D22,$00D8,$4900,64
	dw $7D62,$00D8,$7320,64

; A previous frame's FX colour map does not own any palette this frame.
ui_t_palette:
	LDA.l !fx_tick : PHA
	LDX.w #0
-	LDA.l fx_overlay_spare,X : AND.w #$00FF : BNE +
	INX : BRA -
+	PHX
	LDA.l !fx_nmipal,X : PHA
	LDA.w #2 : STA.l !fx_nmipal,X
	STZ.w !ui_tmp5&$FFFF
	LDA.w !core_tick&$FFFF : DEC : STA.l !fx_tick
	LDA.w #$00FF : STA.w !ui_tmp0&$FFFF
	JSR ui_sc_palette
	LDA.w !sc_pal&$FFFF : BNE .bad
	LDA.w !core_tick&$FFFF : STA.l !fx_tick
	LDA.w #$00FF : STA.w !ui_tmp0&$FFFF
	JSR ui_sc_palette
	LDA.w !sc_pal&$FFFF : CMP.w #$3400 : BEQ .done
.bad
	INC.w !ui_tmp5&$FFFF
.done
	PLA : PLY : TYX : STA.l !fx_nmipal,X
	PLA : STA.l !fx_tick
	STZ.w !sc_pal&$FFFF
	LDA.w !ui_tmp5&$FFFF : LSR
	RTS
