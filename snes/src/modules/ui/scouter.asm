; Power-level readouts for the native Analyzer spell (engine/scouter.js).
; Included in the UI code bank.
;
; The cartridge has no scouter (cut on the maintainer's request to save
; CPU, OBJ, cells and extended data; the browser keeps its scouter). Goku's
; configuration ring keeps the native Targeting item, there is no scan,
; joke or continuous reading, and the old saved switch (!ui_p_flags bit 6)
; is ignored. Analyzer works like a scouter instead: when a party member's
; Analyzer lands on an actor (the game's spell landing, C0:3F9B in
; scouter-readouts.asm), that actor gets the browser's readout, a power
; number above a reticle, which blinks in and expires after
; !UI_SC_LIFETIME frames (scouter-readouts.asm, scouter-obj.asm).

; ---------------------------------------------------------------------------
; Sylphid's powers granted ($7E:CFAB >= 2: Analyzer exists) and Goku active:
; carry set. Any DB (long addressing), M16; keeps X/Y.
!UI_SC_SYLPHID = $CFAB
ui_sc_owned:
	LDA.l $7E0000|!UI_SC_SYLPHID
	AND.w #$00FF
	CMP.w #$0002
	BCC .no
	LDA.l !persist_goku_active
	AND.w #$00FF
	BEQ .no
	SEC
	RTS
.no
	CLC
	RTS

; New game / load: no readout survives a session.
ui_sc_load:
	JSR ui_sc_leave
	STZ.w !ui_sc&$FFFF
	RTS
