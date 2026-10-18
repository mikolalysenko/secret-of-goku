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
; choice, 17 weighted gi.
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
	dw ui_t_react, ui_t_mul, ui_t_event, ui_t_choice, ui_t_weighted

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
