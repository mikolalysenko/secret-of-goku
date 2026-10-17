; Public API for other modules (combat, flight, story, scenes). See
; docs/agents/snes-port/goku.md. Entry points are JSL-callable from any bank
; with any DB; they preserve DB, D and the caller's M/X unless noted.
; Request fields (goku_form, goku_act*, goku_mode*, goku_lift, goku_ctl,
; goku_cell_req) may also be written directly with DB = $7E.

; One-time state set-up (zeroed WRAM means "cell 0 in VRAM" otherwise).
goku_ensure_init:
	PHP
	SEP #$20
	LDA.l $7E0000|!goku_inited
	BNE .done
	LDA.b #$01
	STA.l $7E0000|!goku_inited
	REP #$20
	LDA.w #!GOKU_NONE
	STA.l $7E0000|!vram_cell
	STA.l $7E0000|!up_cell
	LDA.w #$0000
	STA.l $7E0000|!hud_form
.done
	PLP
	RTS

; goku_api_set_form: A (low byte) = 0 base, 1 Super Saiyan. Takes effect on
; the next rendered frame (cells, palette, HUD portrait). Play the
; transformation itself with goku_act = GOKU_K_TRANSFORM / GOKU_K_REVERT.
goku_api_set_form:
	PHP
	SEP #$20
	AND.b #$01
	STA.l $7E0000|!goku_form
	PLP
	RTL

; goku_api_active: C set while Goku stands in for the boy this frame.
goku_api_active:
	PHP
	SEP #$20
	LDA.l $7E0000|!replacing
	BEQ .no
	PLP
	SEC
	RTL
.no
	PLP
	CLC
	RTL

; goku_api_cell: A = sheet (0 base, 1 Super Saiyan, 2 SSJ lead jab),
; X = column, Y = row -> A16 = cell id, $FFFF when the sheet has no art there.
; Exit M16 X16.
goku_api_cell:
	REP #$30
	AND.w #$0003
	ASL
	PHX
	TAX
	LDA.l goku_sheet_base,X
	STA.l $7E0000|!t_a
	PLA
	ASL
	ASL
	CLC
	ADC.l $7E0000|!t_a
	STA.l $7E0000|!t_a
	TYA
	AND.w #$0003
	CLC
	ADC.l $7E0000|!t_a
	ASL
	TAX
	LDA.l goku_cell_index,X
	RTL

; goku_api_hand: hand socket of the displayed pose, in screen pixels.
; Out: C set and A16 = x, X16 = y when the current cell has an authored
; socket (charge, beam and blast poses); C clear otherwise. Exit M16 X16.
goku_api_hand:
	PHB
	PEA $7E7E
	PLB
	PLB
	REP #$30
	LDA !p_sheet
	AND.w #$00FF
	CMP.w #2
	BCS .none                ; lead-jab sheet: no sockets
	CMP.w #1
	BEQ .ssj
	LDX.w #goku_sockets_goku&$FFFF
	BRA .scan
.ssj
	LDX.w #goku_sockets_ssj&$FFFF
.scan
	; entries: column, then (x,y) for rows 0-3; $FF ends the table
	LDA.l !DATA_GOKU,X
	AND.w #$00FF
	CMP.w #$00FF
	BEQ .none
	SEP #$20
	CMP !p_col
	REP #$20
	BEQ .found
	TXA
	CLC
	ADC.w #9
	TAX
	BRA .scan
.found
	LDA !p_rowout
	AND.w #$0003
	ASL
	STA !t_a
	TXA
	SEC
	ADC !t_a
	TAX
	LDA.l !DATA_GOKU,X
	AND.w #$00FF
	STA !t_a                 ; local x
	LDA.l !DATA_GOKU+1,X
	AND.w #$00FF
	STA !t_b                 ; local y
	; cell origin: (anchor x - 16, feet - 31 - lift), feet = $E022 - $E045
	LDA $E020
	SEC
	SBC.w #16
	CLC
	ADC !t_a
	PHA
	LDA $E022
	SEC
	SBC $E045
	SEC
	SBC !p_lift
	SEC
	SBC.w #31
	CLC
	ADC !t_b
	TAX
	PLA
	PLB
	SEC
	RTL
.none
	PLB
	CLC
	RTL
