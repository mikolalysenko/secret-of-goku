; The clash ball (vegeta-clash.js drawTrainingClash): a disc of radius 1-32
; with a blue rim, the enemy's ring (purple Galick Gun, gold Final Flash),
; light blue and a white core. One quadrant per radius is generated
; (snes/gen/vegeta.mjs) and drawn four times with OBJ flips, behind the
; fighters (the browser draws the clash behindBody), OBJ palette 5.
;
; VRAM: the OBJ region of actor slot 4 (a clone, held inactive): buffer A
; tiles $0A0-$0AB/$0B0-$0BB, buffer B $100-$10B/$110-$11B (name table 1).
; Double-buffered like Vegeta's poses (a new radius shows once uploaded).


; Draw the ball: A = radius (0 = none), centre in !vs_ball_cx/cy.
vg_draw_ball:
	AND.w #$00FF
	BNE +
	RTS
+	CMP.w #33
	BCC +
	LDA.w #32
+	SEP #$20
	CMP.l !vs_ball_front
	BEQ .front
	CMP.l !vs_ball_back
	BEQ .swap
	STA.l !vs_ball_want
	LDA.l !vs_ball_front
	BNE .front                     ; keep the last complete radius
	REP #$20
	RTS
.swap
	LDA.l !vs_ball_front
	PHA
	LDA.l !vs_ball_back
	STA.l !vs_ball_front
	PLA
	STA.l !vs_ball_back
	LDA.l !vs_ball_buf
	EOR.b #$01
	STA.l !vs_ball_buf
	LDA.l !vs_ball_front
.front
	REP #$20
	AND.w #$00FF
	STA.l !vs_draw_frame           ; radius
	; table entry (5 bytes per radius, radius 1 first)
	DEC
	STA !vg_t0
	ASL : ASL
	CLC
	ADC !vg_t0
	TAX
	LDA.l vegeta_ball_table,X
	AND.w #$00FF
	STA.l !vs_draw_n
	LDA.l vegeta_ball_table+3,X
	STA.l !vs_draw_ptr
	LDA.l !vs_ball_buf
	AND.w #$00FF
	BEQ +
	LDA.w #!VBALL_B_TILE
	BRA ++
+	LDA.w #!VBALL_A_TILE
++	STA.l !vs_draw_tile
	; ball palette (enemy ring by tier)
	JSR vg_ball_palette
	; centre on screen (OBJ rows show one line below their Y)
	LDA.l !vs_ball_cx
	SEC
	SBC.l !vs_cam_x
	STA.l !vs_draw_x
	LDA.l !vs_ball_cy
	SEC
	SBC.l !vs_cam_y
	DEC
	STA.l !vs_draw_y
	; four quadrants: (+x,+y), (-x,+y) h, (+x,-y) v, (-x,-y) hv
	LDA.w #$0000
	STA.l !vs_s6                   ; quadrant
.quad
	LDA.w #0
	STA.l !vs_draw_i
.block
	LDA.l !vs_draw_i
	CMP.l !vs_draw_n
	BCC +
	JMP .nextQuad
+	ASL
	CLC
	ADC.l !vs_draw_ptr
	TAX
	LDA.l !DATA_VEGETA,X
	PHA
	AND.w #$00FF
	STA !vg_t0                     ; bx
	PLA
	XBA
	AND.w #$00FF
	STA !vg_t1                     ; by
	; x: q bit 0 -> -(bx) - 15 (h flip)
	LDA.l !vs_s6
	AND.w #$0001
	BEQ +
	LDA !vg_t0
	CLC
	ADC.w #15
	EOR.w #$FFFF
	INC
	BRA ++
+	LDA !vg_t0
++	CLC
	ADC.l !vs_draw_x
	STA.w !core_spr_x&$FFFF
	LDA.l !vs_s6
	AND.w #$0002
	BEQ +
	LDA !vg_t1
	CLC
	ADC.w #15
	EOR.w #$FFFF
	INC
	BRA ++
+	LDA !vg_t1
++	CLC
	ADC.l !vs_draw_y
	STA.w !core_spr_y&$FFFF
	; tile = buffer + 2i; flips from the quadrant
	LDA.l !vs_draw_i
	ASL
	CLC
	ADC.l !vs_draw_tile
	ORA.w #(!VBALL_PAL<<9)|(3<<12)
	STA !vg_t2
	LDA.l !vs_s6
	AND.w #$0001
	BEQ +
	LDA !vg_t2
	ORA.w #$4000
	STA !vg_t2
+	LDA.l !vs_s6
	AND.w #$0002
	BEQ +
	LDA !vg_t2
	ORA.w #$8000
	STA !vg_t2
+	LDA !vg_t2
	STA.w !core_spr_tile&$FFFF
	STZ.w !core_spr_size&$FFFF
	JSL core_oam_add
	LDA.l !vs_draw_i
	INC
	STA.l !vs_draw_i
	JMP .block
.nextQuad
	LDA.l !vs_s6
	INC
	STA.l !vs_s6
	CMP.w #4
	BCS +
	JMP .quad
+	RTS

; Palette 5 in the game's buffer: blue[0], the enemy ring, blue[2], white.
vg_ball_palette:
	LDA.w #$5CA4
	STA.l $7E0600+((128+(!VBALL_PAL*16)+1)*2)
	LDA.w #!VEGETA_BALL_PURPLE
	LDX !vg_tier-1
	CPX.w #$0100
	BCC +
	LDA.w #!VEGETA_BALL_GOLD
+	STA.l $7E0600+((128+(!VBALL_PAL*16)+2)*2)
	LDA.w #$7FB1
	STA.l $7E0600+((128+(!VBALL_PAL*16)+3)*2)
	LDA.w #$7FFF
	STA.l $7E0600+((128+(!VBALL_PAL*16)+4)*2)
	RTS

; NMI: upload the requested radius into the back buffer. DB = $7E.
vg_ball_nmi:
	LDA.l !vs_ball_want
	AND.w #$00FF
	BNE +
	RTS
+	JSL core_vblank_lines
	CMP.w #10
	BCS +
	RTS
+	LDA.l !vs_ball_want
	AND.w #$00FF
	DEC
	STA !vg_t0
	ASL : ASL
	CLC
	ADC !vg_t0
	TAX
	LDA.l vegeta_ball_table,X
	AND.w #$00FF
	XBA
	LSR : LSR                      ; n * 64
	STA !vg_t1
	LDA.l vegeta_ball_table+1,X
	STA !vg_t2                     ; data offset
	; back buffer VRAM word address (tile * 16 + $6000)
	LDA.l !vs_ball_buf
	AND.w #$00FF
	BNE +
	LDA.w #$6000+(!VBALL_B_TILE*16)
	BRA ++
+	LDA.w #$6000+(!VBALL_A_TILE*16)
++	STA !vg_t3
	TAY
	LDX !vg_t2
	LDA !vg_t1
	JSR vg_dma_ball
	LDA !vg_t2
	CLC
	ADC !vg_t1
	TAX
	LDA !vg_t3
	CLC
	ADC.w #$0100
	TAY
	LDA !vg_t1
	JSR vg_dma_ball
	SEP #$20
	LDA.l !vs_ball_want
	STA.l !vs_ball_back
	LDA.b #0
	STA.l !vs_ball_want
	REP #$20
	RTS

; As vg_dma, from the ball tiles: A = bytes, X = offset, Y = VRAM word.
vg_dma_ball:
	PHA
	SEP #$20
	LDA.b #$80
	STA.l $002115
	REP #$20
	TYA
	STA.l $002116
	LDA.w #$1801
	STA.l $004360
	TXA
	CLC
	ADC.w #vegeta_ball_tiles
	STA.l $004362
	SEP #$20
	LDA.b #vegeta_ball_tiles>>16
	STA.l $004364
	REP #$20
	PLA
	STA.l $004365
	SEP #$20
	LDA.b #$40
	STA.l $00420B
	REP #$20
	RTS
