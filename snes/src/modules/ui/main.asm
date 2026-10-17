; Core callbacks and shared helpers (included in the UI code bank).
; Core callback convention: JSL, P = M16/X16, DB = $7E, D = 0, return RTL
; (NMI callbacks: DB = $80). Public API routines (radio.asm) also accept any
; DB and M/X and preserve DB/D.

; Title entry (core cleared !RAM_UI). Nothing is drawn; BG3 belongs to the
; title program.
ui_title_boot:
	LDA.w #!UIS_INIT
	STA.w !ui_state&$FFFF
	RTL

; New game: persistent fields start at zero (core cleared !SRAM_LIVE).
ui_new_game:
	JSR ui_reset_session
	RTL

; A GAME FILE was loaded (core restored or cleared !SRAM_LIVE): drop
; transient messages from the previous session.
ui_load:
	JSR ui_reset_session
	RTL

ui_reset_session:
	STZ.w !ui_cur&$FFFF
	STZ.w !ui_qn&$FFFF
	STZ.w !ui_held&$FFFF
	STZ.w !ui_warned&$FFFF
	STZ.w !ui_cool&$FFFF
	STZ.w !ui_bcool&$FFFF
	STZ.w !ui_rcool&$FFFF
	STZ.w !ui_lastmap&$FFFF
	STZ.w !ui_charge_in&$FFFF
	RTS

; ---------------------------------------------------------------------------
; Field frame (also dialogue, events, Mode 7 arenas).
ui_field_frame:
	INC.w !ui_frame&$FFFF
	LDA.w !ui_claims&$FFFF            ; back from world flight
	ORA.w !ui_band&$FFFF
	BEQ +
	JSR ui_world_leave
+
if defined("UI_TEST")
	JSR ui_test_poll
endif
	JSR ui_radio_tick
	JSR ui_window_update
	RTL

; Field vblank (DB = $80, forced blank): arm the palette HDMA.
ui_field_nmi:
	JMP ui_window_nmi

; World flight frame: the radio keeps its policy running; the field window
; is not drawn in Mode 7 (the world panel is a separate renderer).
ui_world_frame:
	INC.w !ui_frame&$FFFF
if defined("UI_TEST")
	JSR ui_test_poll
endif
	JSR ui_window_leave_field
	JSR ui_radio_tick
	JSR ui_world_update
	RTL

ui_world_nmi:
	JMP ui_world_vblank

; Ring menus: the field loop is paused; the window hides (never over a ring).
ui_ring_frame:
	JSR ui_window_leave_field
	RTL

; Full-screen menus (status page).
ui_menu_frame:
	RTL

; ---------------------------------------------------------------------------
; Helpers

; Goku has replaced the boy (arrival impact). Z clear when active.
ui_goku_active:
	LDA.l !persist_goku_active
	AND.w #$00FF
	RTS

; Current map (+1, so 0 means none) in A16.
ui_map_id:
	LDA.w $00DC
	INC
	RTS

; Native field state allowing the window on the ground: the browser's
; canAttack (mana-mod.js) plus the radio's own guards ($2C battle-message
; window, BG3 scroll and mode). Carry set = visible.
ui_field_can_show:
	LDX.w #ui_field_checks-ui_checks
	JSR ui_check_list
	BCC .no
	SEP #$20
	LDA.w $E011                       ; native hurt poses $8C-$8F
	CMP.b #$8C
	BCC .ok
	CMP.b #$90
	BCC .no8
.ok
	REP #$20
	SEC
	RTS
.no8
	REP #$20
.no
	CLC
	RTS

; World flight: the browser's guards ($FE fade, $8C, $E2 landing, events,
; menus). Carry set = visible.
ui_world_can_show:
	LDX.w #ui_world_checks-ui_checks
	JMP ui_check_list

; Goku active, no hide request, and every (byte & mask) == value entry of
; the list at ui_checks+X holds. Carry set = all hold.
ui_check_list:
	JSR ui_goku_active
	BEQ .no
	LDA.w !ui_block&$FFFF
	BNE .no
.loop
	LDA.l ui_checks,X
	CMP.w #$FFFF
	BEQ .yes
	TAY
	SEP #$20
	LDA.w $0000,Y                     ; DB = $7E: WRAM
	AND.l ui_checks+2,X
	CMP.l ui_checks+3,X
	REP #$20
	BNE .no
	INX : INX : INX : INX
	BRA .loop
.yes
	SEC
	RTS
.no
	CLC
	RTS

ui_checks:
; Ground: the browser's canAttack (mana-mod.js) plus the radio's guards.
ui_field_checks:
	dw $0100 : db $FF,$5C             ; NMI trampoline JML $00C0A8: the field
	dw $0101 : db $FF,$A8
	dw $0102 : db $FF,$C0
	dw $00D0 : db $FF,$00             ; no event
	dw $00E4 : db $FF,$01             ; no fade
	dw $00E5 : db $FF,$01
	dw $00EC : db $FE,$00             ; no menu / transition
	dw $00ED : db $40,$00             ; no ring opening request
	dw $002C : db $0F,$00             ; native window / effect HDMA
	dw $1D04 : db $60,$00             ; native window drawing or open
	dw $0029 : db $04,$00             ; Mode 7 arena (BG3 only below line 196)
	dw $003E : db $FF,$00             ; BG3 scrolled (quakes, special scenes)
	dw $003F : db $FF,$00
	dw $0040 : db $FF,$00
	dw $E000 : db $01,$01             ; Goku's actor active
	dw $E02C : db $01,$01             ; and owned by player 1
	dw $E190 : db $70,$00             ; incapacitating / covering status
	dw $E191 : db $D5,$00
	dw $FFFF
ui_world_checks:
	dw $00FE : db $C0,$00             ; world fade
	dw $008C : db $FF,$00
	dw $00E2 : db $01,$00             ; landing
	dw $00D0 : db $FF,$00             ; no event
	dw $00EC : db $7E,$00             ; no menu
	dw $FFFF

; Default display name for {n} codes: the native slot, or the retail
; default when it is empty. A16 = n -> X16 = address (bank $7E) of a
; zero-terminated name (max 6 letters). Uses the shared name buffer.
!ui_name_buf = !RAM_UI+$B8          ; 8 bytes (+$B8-$BF)
ui_default_name:
	PHP
	REP #$30
	AND.w #$0003
	STA.w !ui_tmp5&$FFFF
	ASL : ASL : STA.w !ui_tmp4&$FFFF   ; n*4
	ASL : CLC : ADC.w !ui_tmp4&$FFFF   ; n*12
	TAX
	LDA.w !ui_tmp5&$FFFF
	CMP.w #$0003
	BNE +
	LDX.w #$0006                      ; the boy keeps his name at $CC06 (native-names.js)
+	SEP #$20
	LDY.w #$0000
.copy
	LDA.w $CC00,X
	BEQ .end
	CMP.b #$FF
	BEQ .end
	STA.w !ui_name_buf&$FFFF,Y
	INX
	INY
	CPY.w #$0006
	BCC .copy
.end
	LDA.b #$00
	STA.w !ui_name_buf&$FFFF,Y
	CPY.w #$0000
	BNE .done
	; empty: retail default (Primm / Popoi / Randi; GOKU for slot 0)
	REP #$20
	LDA.w !ui_tmp5&$FFFF
	ASL : STA.w !ui_tmp4&$FFFF
	ASL : CLC : ADC.w !ui_tmp4&$FFFF   ; n*6
	TAX
	SEP #$20
	LDY.w #$0000
.def
	LDA.l ui_default_names,X
	BEQ .defEnd
	STA.w !ui_name_buf&$FFFF,Y
	INX
	INY
	CPY.w #$0006
	BCC .def
.defEnd
	LDA.b #$00
	STA.w !ui_name_buf&$FFFF,Y
.done
	REP #$30
	LDX.w #!ui_name_buf&$FFFF
	PLP
	RTL
