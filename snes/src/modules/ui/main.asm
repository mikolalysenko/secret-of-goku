; Core callbacks and shared helpers (included in the UI code bank).
; Core callback convention: JSL, P = M16/X16, DB = $7E, D = 0, return RTL
; (NMI callbacks: DB = $80). Public API routines (radio.asm) also accept any
; DB and M/X and preserve DB/D.

; Title entry (core cleared !RAM_UI). Nothing is drawn; BG3 belongs to the
; title program.
ui_title_boot:
	LDA.w #!UIS_INIT
	STA.w !ui_state&$FFFF
	LDA.w #!UI_MAGIC
	STA.w !ui_magic&$FFFF
	JSR ui_unstage
	RTL

; Nothing staged in !ui_s_map and no cached radar trigonometry (SRAM
; staging is undefined at power-on).
ui_unstage:
	LDA.w #$0000
	STA.l !ui_s_bmode
	STA.l !ui_s_bstep
	STA.l !ui_s_trig
	STA.l !ui_ff_upload
	RTS

; !RAM_UI must have been set up by this cartridge: a savestate made by
; another build (no UI module, or another layout) carries stale or random
; WRAM here, which would drive the queue and the IRQ chain. Clear the block
; when the marker or !ui_state is off. DB = $7E, M16/X16; keeps A/X/Y.
ui_ram_check:
	PHA
	LDA.w !ui_magic&$FFFF
	CMP.w #!UI_MAGIC
	BNE .reset
	LDA.w !ui_state&$FFFF
	AND.w #(!UIS_DRAWN|!UIS_ATLAS|!UIS_HDMA|!UIS_INIT|!UIS_IDLE|!UIS_PLACE|!UIS_TEXT)^$FFFF
	BNE .reset
	LDA.w !ui_qn&$FFFF
	CMP.w #!UI_QMAX+1
	BCS .reset
	PLA
	RTS
.reset
	PHX
	LDX.w #$00BE
	LDA.w #$0000
-	STA.l !RAM_UI,X
	DEX : DEX
	BPL -
	LDA.w #!UIS_INIT
	STA.w !ui_state&$FFFF
	LDA.w #!UI_MAGIC
	STA.w !ui_magic&$FFFF
	JSR ui_unstage
	PLX
	PLA
	RTS

; NMI / IRQ side (any DB): Z set when the block is set up.
macro ui_ram_ok_long()
	LDA.l !ui_magic
	CMP.w #!UI_MAGIC
endmacro

; New game: persistent fields start at zero (core cleared !SRAM_LIVE).
ui_new_game:
	JSR ui_ram_check
	JSR ui_reset_session
	JSR ui_sc_load
	RTL

; A GAME FILE was loaded (core restored or cleared !SRAM_LIVE): drop
; transient messages from the previous session.
ui_load:
	JSR ui_ram_check
	JSR ui_reset_session
	JSR ui_sc_load
	RTL

ui_reset_session:
	LDA.w #!UIS_IDLE|!UIS_TEXT
	TRB.w !ui_state&$FFFF
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
; Field frame (also dialogue, events, Mode 7 arenas). Idle (idle.asm: the
; last full frame left nothing shown, queued, pending or moved), outside
; events and with R up, nothing can start but a public API call, which
; clears !UIS_IDLE: only the frame count moves.
ui_field_frame:
	LDA.w !ui_state&$FFFF
	AND.w #!UIS_IDLE
	BEQ .full
	LDA.w $00D0                       ; an event (placement, fast-forward)
	AND.w #$00FF
	BNE .full
	LDA.l !core_pad                   ; R (fast-forward, Frieza's input lock)
	AND.w #!PAD_R
	BNE .full
if defined("UI_TEST")
	LDA.w !ui_test&$FFFF              ; (the test mailbox)
	ORA.w !ui_test_charge&$FFFF
	BNE .full
endif
if not(defined("UI_CHARGE_IDLE_SLOW"))
	LDA.w !ui_charge_in&$FFFF
	BEQ .idle
	; A charge API call previously forced foreign-state validation. Keep
	; that guarantee even when the old idle bit came from a savestate.
	JSR ui_ram_check
	LDA.w !ui_state&$FFFF
	AND.w #!UIS_IDLE
	BEQ .full
	; Fortress completion also updates persistent first-flight advice.
	; All other pending radio/window/scouter work already clears UIS_IDLE.
	LDA.w !ui_in&$FFFF
	AND.w #!UII_FORTRESS_GONE
	BNE .full
	JSR ui_idle_charge
.idle
endif
	INC.w !ui_frame&$FFFF
	RTL
.full
	JSR ui_ram_check
	JSR ui_status_leave
	INC.w !ui_frame&$FFFF
	JSR ui_fast_forward
	LDA.w !ui_claims&$FFFF            ; back from world flight
	ORA.w !ui_band&$FFFF
	BEQ +
	JSR ui_world_leave
+
if defined("UI_TEST")
	JSR ui_test_poll
endif
	JSR ui_sc_frame
	JSR ui_radio_tick
	JSR ui_window_update
	JSR ui_place_frame
	JMP ui_field_idle

; Field vblank (DB = $80, forced blank): switch the window HDMA channels
; for a moved native window, arm the radio's palette HDMA. Nothing to do
; unless the radio's HDMA is armed or placement holds the channels.
ui_field_nmi:
	LDA.l !ui_state
	AND.w #!UIS_HDMA|!UIS_PLACE
	BNE .work
	RTL
.work
	%ui_ram_ok_long()
	BNE +
	JSR ui_place_nmi
	JMP ui_window_nmi
+	RTL

; World flight frame: the radio keeps its policy running; the field window
; is not drawn in Mode 7 (the world panel is a separate renderer).
ui_world_frame:
	JSR ui_ram_check
	LDA.w #!UIS_IDLE                  ; (the field comes back through a full frame)
	TRB.w !ui_state&$FFFF
	INC.w !ui_frame&$FFFF
if defined("UI_TEST")
	JSR ui_test_poll
endif
	JSR ui_window_leave_field
	JSR ui_radio_tick
	JSR ui_world_update
	RTL

; Native world graphics reload (including a return from Start's map).
; Same calling convention as frame callbacks; discard the old dial's
; displaced-native cache before the loader replaces its OAM and palettes.
ui_world_reload:
	JSR ui_ram_check
	JSR ui_world_leave
	STZ.w !ui_band_was&$FFFF
	RTL

ui_world_nmi:
	%ui_ram_ok_long()
	BNE +
	JMP ui_world_vblank
+	RTL

; Ring menus: the field loop is paused; the window hides (never over a ring).
ui_ring_frame:
	JSR ui_ram_check
	LDA.w #!UIS_IDLE
	TRB.w !ui_state&$FFFF
	JSR ui_status_leave
	JSR ui_window_leave_field
	RTL

; Full-screen menus: Goku's STATUS page (in vblank after the menu's
; uploads).
ui_menu_frame:
	JSR ui_ram_check
	LDA.w #!UIS_IDLE
	TRB.w !ui_state&$FFFF
	JSR ui_status_frame
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
; window, BG3 scroll and mode). Carry set = visible. DB = $7E (WRAM).
ui_field_can_show:
	LDA.w $002C                       ; native window / effect HDMA
	AND.w #$000F
	BNE ui_attack_no
	LDA.w $1D04                       ; native window drawing or open
	AND.w #$0060
	BNE ui_attack_no
	LDA.w $0029                       ; Mode 7 arena (BG3 only below line 196)
	AND.w #$0004
	BNE ui_attack_no
	LDA.w $003E                       ; BG3 scrolled (quakes, special scenes):
	BNE ui_attack_no                  ; $3E, $3F
	LDA.w $0040                       ; and $40
	AND.w #$00FF
	BNE ui_attack_no
; The browser's canAttack alone. Carry set = Goku can act.
ui_can_attack:
	JSR ui_goku_active
	BEQ ui_attack_no
	LDA.w !ui_block&$FFFF
	BNE ui_attack_no
	LDA.w $0100                       ; NMI trampoline JML $00C0A8: the field
	CMP.w #$A85C
	BNE ui_attack_no
	LDA.w $0102
	AND.w #$00FF
	CMP.w #$00C0
	BNE ui_attack_no
	LDA.w $00D0                       ; no event
	AND.w #$00FF
	BNE ui_attack_no
	LDA.w $00E4                       ; no fade ($E4, $E5 = 1)
	CMP.w #$0101
	BNE ui_attack_no
	LDA.w $00EC                       ; no menu or transition ($EC & $FE), no
	AND.w #$40FE                      ; ring opening request ($ED & $40)
	BNE ui_attack_no
	LDA.w $E000                       ; Goku's actor active
	LSR
	BCC ui_attack_no
	LDA.w $E02C                       ; and owned by player 1
	LSR
	BCC ui_attack_no
	LDA.w $E190                       ; incapacitating / covering status
	AND.w #$D570                      ; ($E190 & $70, $E191 & $D5)
	BNE ui_attack_no
	LDA.w $E011                       ; native hurt poses $8C-$8F
	AND.w #$00FF
	CMP.w #$008C
	BCC .ok
	CMP.w #$0090
	BCC ui_attack_no
.ok
	SEC
	RTS
ui_attack_no:
	CLC
	RTS

; World flight: the browser's guards ($FE fade, $8C, $E2 landing, events,
; menus). Carry set = visible.
ui_world_can_show:
	JSR ui_goku_active
	BEQ .no
	LDA.w !ui_block&$FFFF
	BNE .no
	SEP #$20                          ; ui_world_checks, unrolled
	LDA.w $00FE
	AND.b #$C0                        ; world fade
	ORA.w $008C
	BNE .no8
	LDA.w $00E2
	AND.b #$01                        ; landing
	ORA.w $00D0                       ; no event
	BNE .no8
	LDA.w $00EC
	AND.b #$7E                        ; no menu
	BNE .no8
	REP #$20
	SEC
	RTS
.no8
	REP #$20
.no
	CLC
	RTS

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
