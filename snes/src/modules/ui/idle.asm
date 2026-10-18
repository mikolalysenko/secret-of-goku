; Idle field frames (included last in the UI bank). After a full field
; frame, !UIS_IDLE says nothing is shown, queued, cooling down, pending or
; moved; the next field frames then only count (main.asm ui_field_frame)
; until an event starts, R is held or a public API call clears the bit
; (ui_api_enter, ui_charge_tick; world, ring and menu frames and loads clear
; it too). !UIS_PLACE tells the field NMI that placement has channel work.
ui_field_idle:
	LDA.w !ui_wp&$FFFF                ; placement's vblank work
	AND.w #!UIW_NOW|!UIW_TAKEN|!UIW_FORCED
	BEQ .noPlace
	LDA.w #!UIS_PLACE
	TSB.w !ui_state&$FFFF
	BRA .busy
.noPlace
	LDA.w #!UIS_PLACE
	TRB.w !ui_state&$FFFF
	LDA.w !ui_cur&$FFFF               ; the radio
	ORA.w !ui_qn&$FFFF
	ORA.w !ui_cool&$FFFF
	ORA.w !ui_bcool&$FFFF
	ORA.w !ui_rcool&$FFFF
	ORA.w !ui_held&$FFFF
	ORA.w !ui_warned&$FFFF
	ORA.w !ui_phase&$FFFF             ; the window
	ORA.w !ui_wp&$FFFF                ; placement's session
	ORA.w !ui_claims&$FFFF            ; world flight's leftovers
	ORA.w !ui_band&$FFFF
	ORA.w !ui_ff_state&$FFFF          ; fast-forward
	BNE .busy
	LDA.w !ui_sc&$FFFF                ; a scan waits for Goku
	AND.w #!UISC_PENDING
	BNE .busy
	LDA.w !ui_state&$FFFF
	AND.w #!UIS_DRAWN|!UIS_ATLAS|!UIS_HDMA
	BNE .busy
	STZ.w !ui_lastmap&$FFFF           ; the map history restarts with a message
	LDA.w #!UIS_IDLE
	TSB.w !ui_state&$FFFF
	RTL
.busy
	LDA.w #!UIS_IDLE
	TRB.w !ui_state&$FFFF
	RTL
