; Integer-width Shenron cells in the ending's second code area.
; DB = $32. The frame thread only selects COMPLETE back-buffer uploads.
; Two 96-tile buffers at $6200/$6800; name table 1's Balls and stars stay
; at $6000/$67C0. Native actor cells are held throughout the flight.
flight_scale_reset:
	REP #$30
	STZ.w !fl_dshown
	STZ.w !fl_dbuf
	STZ.w !fl_doff
	STZ.w !fl_dready
	LDA.w #1
	STA.w !fl_dnext
	STZ.w !fl_doffset
	LDX.w #0
.copy
	LDA.l ending_flight_dragon_oam,X
	STA.w !FL_DRAGON,X
	INX : INX
	CPX.w #98
	BCC .copy
	JSR flight_scale_rows
	RTL

flight_scale_frame:
	REP #$30
	LDA.w !fl_dready
	BEQ .out
	LDA.w !fl_dwant
	CMP.w !fl_dnext
	BCC .out
	LDA.w !fl_dnext
	STA.w !fl_dshown
	LDA.w !fl_dbuf
	EOR.w #1
	STA.w !fl_dbuf
	XBA
	LSR
	STA.w !fl_doffset
	JSR flight_scale_rows
	; Start the next size immediately, usually 5-12 frames ahead. A test
	; clock jump can skip straight to the requested size on the next upload.
	LDA.w !fl_dshown
	INC
	CMP.w !fl_dwant
	BCS +
	LDA.w !fl_dwant
+	STA.w !fl_dnext
	STZ.w !fl_doff
	STZ.w !fl_dready
.out
	RTL

; Five row counts and the active cache pointer, once per size change.
flight_scale_rows:
	LDX.w !fl_doffset
	LDA.w !FL_DRAGON+92,X
	STA.w !fl_drows
	LDA.w !FL_DRAGON+94,X
	STA.w !fl_drows+2
	LDA.w !FL_DRAGON+96,X
	STA.w !fl_drows+4
	TXA
	CLC
	ADC.w #!FL_DRAGON
	STA.w !fl_dptr
	RTS

; Before matrix-building work, at most 1 KiB per vblank. A full copy
; needs three vblanks. Ten lines before line 258 cover DMA, setup and
; return, leaving the other ending/core work its usual margin.
flight_scale_nmi:
	REP #$30
	; The first smaller width is not needed until 76. Let the initial
	; palette fade finish before using any of its vblank budget.
	LDA.l !ending_age
	CMP.w #60
	BCS +
	RTL
+
	LDA.w !fl_dnext
	CMP.w #25
	BCC +
	RTL
+	LDA.w !fl_dready
	BEQ +
	RTL
+	LDA.w !fl_dnext
	ASL : ASL : ASL
	TAX
	LDA.l ending_flight_dragon_dma+4,X
	SEC
	SBC.w !fl_doff
	BNE +
	JMP .template
+
	CMP.w #$0401
	BCC +
	LDA.w #$0400
+	STA.w !s_nmitmp+4
	JSL core_vblank_lines
	CMP.w #10
	BCS +
	RTL
+
	LDA.w !fl_doff
	LSR
	CLC
	ADC.w #!FL_OBJ+$200
	LDY.w !fl_dbuf
	BNE +
	CLC
	ADC.w #$600
+	STA.w $2116
	LDA.l ending_flight_dragon_dma,X
	CLC
	ADC.w !fl_doff
	STA.w $4372
	LDA.w !s_nmitmp+4
	STA.w $4375
	LDA.w #$1801
	STA.w $4370
	SEP #$20
	LDA.l ending_flight_dragon_dma+2,X
	STA.w $4374
	LDA.b #$80
	STA.w $2115
.trigger
	STA.w $420B
	REP #$20
	LDA.w !fl_doff
	CLC
	ADC.w !s_nmitmp+4
	STA.w !fl_doff
	CMP.l ending_flight_dragon_dma+4,X
	BEQ +
	RTL
+	; Upload the matching OAM template only after all cells landed.
.template
	JSL core_vblank_lines
	CMP.w #6
	BCS +
	RTL
+
	LDA.w !fl_doffset
	EOR.w #$0080
	TAY
	STA.w !s_nmitmp+6
	LDA.w !fl_dnext
	XBA
	CLC
	ADC.w !s_nmitmp+6
	TAX
	; SRAM is on the A bus: CPU stores (DMA's WMDATA targets WRAM).
	; Unroll the 98-byte copy to keep it below four scanlines.
!i = 0
while !i < 98
	LDA.l ending_flight_dragon_oam+!i,X
	STA.w !FL_DRAGON+!i,Y
	!i #= !i+2
endwhile
	LDA.w #1
	STA.w !fl_dready
.out
	RTL
