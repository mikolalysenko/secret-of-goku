; The boss's bursts (boss-victory.js drawBossVictory): from deathAge t = 36
; to 283 twelve gold discs with white hearts around Frieza's point, 27
; frames each, radius max(2, min(15, t + 3, 28 - t)), over everything the
; view drew before them. The generator draws each radius (orbit-fx.mjs:
; extended data orbit_bursts, 32x32 with the centre at (15, 15)); even
; bursts take beam slot 3 (OBJ $04C), odd ones slot 4 ($080), which
; Frieza's beams no longer need, their pictures through the beam
; pictures' queue keyed $C000 | radius. A burst shows the picture its slot
; holds (a frame late when the queue had no room for the new one).
; DB = $32, M16/X16.

; Frame side (fc_win, first: the bursts are drawn over everything).
vb_draw:
	LDA.w !fn_age
	SEC : SBC.w #!FNT_V_IMPACT
	CMP.w #!OFX_VBURST_FIRST
	BCC +
	CMP.w #!OFX_VBURST_END
	BCC ++
+	RTS
++	STA.w !vb_t
	LDX.w #(!OFX_VBURSTS-1)*8
-	JSR .one
	TXA
	SEC : SBC.w #8
	TAX
	BPL -
	RTS
; burst X / 8: its picture wanted, drawn if its slot holds a burst's
.one
	LDA.w !vb_t
	SEC : SBC.l !XDATA_ORBIT_VBURST,X  ; t - its start
	BMI .out
	CMP.w #27
	BCS .out
	; r = max(2, min(15, t + 3, 28 - t))
	STA.w !d_t0
	CLC : ADC.w #3
	CMP.w #15
	BCC +
	LDA.w #15
+	STA.w !d_t1
	LDA.w #28
	SEC : SBC.w !d_t0
	CMP.w !d_t1
	BCS +
	STA.w !d_t1
+	LDA.w !d_t1
	CMP.w #2
	BCS +
	LDA.w #2
+	ORA.w #$C000                   ; its picture's key
	PHA
	LDA.l !XDATA_ORBIT_VBURST+6,X      ; its slot * 2
	TAY
	PLA
	STA.w !vb_want-6,Y
	LDA.w !bs_have,Y
	AND.w #$C000
	CMP.w #$C000
	BEQ .put
.out
	RTS
.put
	PHX
	LDA.w !b_x
	CLC : ADC.l !XDATA_ORBIT_VBURST+2,X
	SEC : SBC.w #15
	STA.w !d_x
	LDA.w !b_y
	CLC : ADC.l !XDATA_ORBIT_VBURST+4,X
	SEC : SBC.w #15
	STA.w !d_y
	LDA.w #$04C|(!OFX_PAL_GOLD<<9)|!OA_PRI
	CPY.w #8
	BCC +
	LDA.w #$080|(!OFX_PAL_GOLD<<9)|!OA_PRI
+	STA.w !d_ta
	LDA.w #$0001
	STA.w !d_big
	JSR ofx_put
	PLX
	RTS

; First in the frame's queue (beam_queue): each burst picture its slot
; lacks. The vblank sends them before any beam picture (vb_nmi).
vb_queue:
	LDA.w !vb_want                 ; (nothing wanted: the fight, the
	AND.w !vb_want+2               ; struggle)
	CMP.w #$FFFF
	BNE +
	RTS
	; (a vblank has room for about one: a slot holding no burst's picture
	; yet goes first, else they take turns)
+	LDA.w !bs_have+8
	AND.w #$C000
	CMP.w #$C000
	BNE .four
	LDA.w !bs_have+6
	AND.w #$C000
	CMP.w #$C000
	BNE .three
	LDA.w !fn_age
	LSR
	BCC .three
.four
	LDY.w #8                       ; slot 4, then 3
	JSR .one
	LDY.w #6
	BRA .one
.three
	LDY.w #6                       ; slot 3, then 4
	JSR .one
	LDY.w #8
.one
	LDA.w !bq_n
	CMP.w #4
	BCS .out
	LDA.w !vb_want-6,Y
	CMP.w #$FFFF
	BEQ .out
	CMP.w !bs_have,Y
	BEQ .out
	STA.w !bg_tmp+12               ; key
	AND.w #$00FF
	DEC : DEC                      ; radius - 2
	XBA : ASL                      ; * 512
	CLC : ADC.w #(!XDATA_ORBIT_BURSTS)&$FFFF
	STA.w !bg_tmp+8
	LDA.w !bq_n
	ASL : ASL : ASL
	TAX
	TYA
	STA.w !BQ_E+0,X
	LDA.w !bg_tmp+8 : STA.w !BQ_E+2,X
	LDA.w #(!XDATA_ORBIT_BURSTS)>>16 : STA.w !BQ_E+4,X
	LDA.w !bg_tmp+12 : STA.w !BQ_E+6,X
	INC.w !bq_n
.out
	RTS

; Vblank (orbit_nmi_cells, before the beams' pictures): the queue's first
; entries while they are the bursts' (a burst lives 27 frames, its radius
; changing each: a growing beam's outer chain shows its last picture
; meanwhile). M16/X16.
vb_nmi:
	LDA.w !bq_i
	CMP.w !bq_n
	BCS .out
	ASL : ASL : ASL
	TAY
	LDA.w !BQ_E+6,Y                ; a burst's key: $C000 | radius
	AND.w #$C000
	CMP.w #$C000
	BNE .out
	LDA.w #5
	JSR orbit_nmi_room
	BCS .out
	LDA.w !bq_i
	ASL : ASL : ASL
	TAY
	LDX.w !BQ_E+0,Y
	LDA.l beam_slot_vram,X
	STA.w !n_vram
	LDA.w !BQ_E+6,Y
	STA.w !bs_have,X
	LDA.w !BQ_E+2,Y
	STA.w !n_src
	LDA.w !BQ_E+4,Y
	STA.w !n_bank
	LDA.w #4
	STA.w !n_rows
	LDA.w #128
	STA.w !n_len
	JSR orbit_nmi_rows
	INC.w !bq_i
	BRA vb_nmi
.out
	RTS
