; The Emperor's execution (frieza-intro.js createEmperorBeamView): a
; piercing ray from stage right through his chest (ages 0-27), the whole
; picture black but for his silhouette while it hits (6-21: white, pink at
; 13-14), and impact sparks out of both sides of his chest (6-35).
; The black frame: the main screen keeps only sprites (TM = OBJ) on a black
; backdrop without colour math, every native sprite outside his body is
; hidden and his take the silhouette palette (the browser paints his actual
; OAM cells, sampled from the PPU, the same way). The ray is fx's Death Beam
; (3 px, white core); the sparks fx's impact-spark cells.

; His box around the chest, in screen pixels (OAM top-left corners).
!FZE_BOX_L = 40
!FZE_BOX_R = 24
!FZE_BOX_T = 56
!FZE_BOX_B = 8

fz_emperor_shot:
	LDA !fz_sflags
	AND.w #!FZSF_TARGET
	BNE +
	RTS
+	; the chest: his screen anchor, feet + shadow height - 15
	LDX !fz_sbase
	LDA $E020,X
	STA !fz_t0                        ; chest x
	LDA $E074,X
	AND.w #$007F
	CLC
	ADC $E022,X
	SEC
	SBC.w #15
	STA !fz_t1                        ; chest y
	; the ray: its head comes in from x = 280 by age 6, then leaves to the left
	LDA !fz_sage
	CMP.w #!FRIEZA_INTRO_BEAM_END
	BCS .sparks
	CMP.w #!FRIEZA_INTRO_HIT+1
	BCS .through
	; head = round(280 + (chest.x - 280) * age / 6)
	LDA !fz_t0
	SEC
	SBC.w #280
	STA !fz_m6
	JSR fz_abs
	STA !fz_m0
	LDA !fz_sage
	STA !fz_m1
	JSR fz_mul16
	LDA !fz_m2
	CLC
	ADC.w #3                          ; Math.round: halves up (toward +x)
	LDX !fz_m6
	BPL +
	DEC                               ; a negative offset rounds its half down
+	LDX.w #6
	JSR fz_divmod
	LDA !fz_m5
	LDX !fz_m6
	BPL +
	EOR.w #$FFFF
	INC
+	CLC
	ADC.w #280
	BRA .ray
.through
	; head = chest.x - (age - 6) * 80
	SEC
	SBC.w #!FRIEZA_INTRO_HIT
	STA !fz_m0
	ASL
	ASL
	CLC
	ADC !fz_m0                        ; * 5
	ASL
	ASL
	ASL
	ASL                               ; * 80
	EOR.w #$FFFF
	SEC
	ADC !fz_t0
.ray
	; from (280, chest.y) leftwards to max(0, head)
	BPL +
	LDA.w #0
+	EOR.w #$FFFF
	SEC
	ADC.w #280                        ; length = 280 - head
	BEQ .sparks
	BMI .sparks
	STA !fz_t5
	LDA !fz_t1
	STA !fz_t4                        ; y
	LDA !fz_sage
	STA !fz_t6
	JSR fz_fx_ray_screen
.sparks
	LDA !fz_sage
	SEC
	SBC.w #!FRIEZA_INTRO_HIT
	BMI .black
	CMP.w #30
	BCS .black
	STA !fz_t2                        ; t
	; x = chest.x +- (3 + min(9, t >> 1)), frame floor(t / 3), white below 10
	LSR
	CMP.w #9
	BCC +
	LDA.w #9
+	CLC
	ADC.w #3
	STA !fz_t3
	LDA !fz_t2
	LDX.w #3
	JSR fz_divmod
	LDA !fz_m5
	STA !fz_t6                        ; frame
	LDA !fz_t0
	SEC
	SBC !fz_t3
	STA !fz_ax
	LDA !fz_t1
	STA !fz_ay
	JSR .spark
	LDA !fz_t0
	CLC
	ADC !fz_t3
	STA !fz_ax
	JSR .spark
.black
	LDA !fz_sage
	CMP.w #!FRIEZA_INTRO_HIT
	BCC .out
	CMP.w #!FRIEZA_INTRO_BLACK_END
	BCS .out
	JMP fz_emperor_black
.out
	RTS
.spark
	LDA !fz_t2
	CMP.w #10
	LDA.w #0                          ; white-hot first, then pink
	BCC +
	LDA.w #1
+	LDX !fz_t6
	JMP fz_fx_spark_screen

; The black frame of the hit: his body cells keep only the silhouette
; colour, every other native sprite is hidden, and the vblank blanks the
; layers and the backdrop (FZT_WHITE with the black mode).
fz_emperor_black:
	; the silhouette palette: white, pink at ages 13-14
	LDA.w #4
	LDX !fz_sage
	CPX.w #13
	BCC +
	CPX.w #15
	BCS +
	LDA.w #5
+	SEP #$20
	STA !fz_spr_var
	REP #$20
	JSR fz_spr_palette
	LDA !fz_spr_pal
	AND.w #$0007
	ASL
	STA !fz_t2                        ; palette bits of the attribute byte
	; native slots [0, native)
	LDA.w !core_oam_native&$FFFF
	CMP.w #129
	BCC +
	LDA.w #128
+	ASL
	ASL
	TAX
.slot
	DEX
	DEX
	DEX
	DEX
	BMI .done
	LDA.w $0800,X                     ; x (byte), y (byte)
	AND.w #$00FF
	SEC
	SBC !fz_t0
	CLC
	ADC.w #!FZE_BOX_L
	CMP.w #!FZE_BOX_L+!FZE_BOX_R
	BCS .hide
	LDA.w $0801,X
	AND.w #$00FF
	CMP.w #$00E0
	BCC +
	ORA.w #$FF00                      ; above the top edge: y - 256
+	SEC
	SBC !fz_t1
	CLC
	ADC.w #!FZE_BOX_T
	CMP.w #!FZE_BOX_T+!FZE_BOX_B
	BCS .hide
	; his: the silhouette palette
	SEP #$20
	LDA.w $0803,X
	AND.b #$F1
	ORA !fz_t2
	STA.w $0803,X
	REP #$20
	BRA .slot
.hide
	LDA.w #$E0FF
	STA.w $0800,X
	BRA .slot
.done
	SEP #$20
	LDA.b #1
	STA.l !fzv_mode                   ; black (0 = the victory whiteout)
	LDA.b #!FZT_WHITE
	TSB !fz_tflags
	REP #$20
	RTS
