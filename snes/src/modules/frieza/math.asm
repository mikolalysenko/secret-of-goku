; Integer geometry for the fight (frieza-combat.js on whole pixels).
; Angles are 16-bit: 65536 per turn, 0 = +x (right), 16384 = +y (down),
; as Math.atan2(dy, dx) on the screen. M16/X16, DB = $7E.

; Unsigned 8x8 -> 16 through the CPU multiplier: A8 x X8 (low bytes).
fz_mul8:
	SEP #$20
	STA.l $004202
	TXA
	STA.l $004203
	REP #$20
	NOP
	NOP
	NOP
	NOP
	LDA.l $004216
	RTS

; A16 = |A16|.
fz_abs:
	BPL +
	EOR.w #$FFFF
	INC
+	RTS

; Unsigned 16x16 -> 32: !fz_m0 * !fz_m1 -> !fz_m2 (low), !fz_m3 (high).
fz_mul16:
	LDA !fz_m0
	AND.w #$00FF
	LDX !fz_m1
	JSR fz_mul8                       ; lo*lo
	STA !fz_m2
	STZ !fz_m3
	LDA !fz_m0
	XBA
	AND.w #$00FF
	LDX !fz_m1
	JSR fz_mul8                       ; hi*lo
	JSR .add8
	LDA !fz_m1
	XBA
	AND.w #$00FF
	TAX
	LDA !fz_m0
	AND.w #$00FF
	JSR fz_mul8                       ; lo*hi
	JSR .add8
	LDA !fz_m1
	XBA
	AND.w #$00FF
	TAX
	LDA !fz_m0
	XBA
	AND.w #$00FF
	JSR fz_mul8                       ; hi*hi
	CLC
	ADC !fz_m3
	STA !fz_m3
	RTS
.add8
	; (m3:m2) += A16 << 8
	STA !fz_m4
	XBA
	AND.w #$FF00
	CLC
	ADC !fz_m2
	STA !fz_m2
	LDA !fz_m4
	XBA
	AND.w #$00FF
	ADC !fz_m3
	STA !fz_m3
	RTS

; C set when dx^2 + dy^2 < r^2: A16 = dx, X16 = dy (signed), Y16 = r
; (r < 256). Far points leave early.
fz_dist_lt:
	STY !fz_m5
	JSR fz_abs
	CMP !fz_m5
	BCS .no
	STA !fz_m0
	TXA
	JSR fz_abs
	CMP !fz_m5
	BCS .no
	STA !fz_m1
	TAX
	JSR fz_mul8                       ; dy^2
	STA !fz_m2
	LDA !fz_m0
	TAX
	JSR fz_mul8                       ; dx^2
	CLC
	ADC !fz_m2
	BCS .no
	STA !fz_m2
	LDA !fz_m5
	TAX
	JSR fz_mul8                       ; r^2
	CMP !fz_m2
	BEQ .no
	BCC .no
	SEC
	RTS
.no
	CLC
	RTS

; C set when dx^2 + dy^2 <= r^2 (A16 = dx, X16 = dy, Y16 = r < 255).
fz_dist_le:
	INY
	JSR fz_dist_lt                    ; < (r+1)^2 would also take r^2+1..
	BCC .no
	; exact: recompute with r^2 + 1 as the bound
	LDA !fz_m5
	DEC
	TAX
	JSR fz_mul8                       ; r^2
	CMP !fz_m2                        ; dx^2 + dy^2 (left by fz_dist_lt)
	BCC .no
	SEC
	RTS
.no
	CLC
	RTS

; 32-bit dx^2 + dy^2 (A16 = dx, X16 = dy) -> !fz_m6 (low), !fz_m7 (high).
fz_dist2:
	STX !fz_m4
	JSR fz_abs
	STA !fz_m0
	STA !fz_m1
	JSR fz_mul16
	LDA !fz_m2
	STA !fz_m6
	LDA !fz_m3
	STA !fz_m7
	LDA !fz_m4
	JSR fz_abs
	STA !fz_m0
	STA !fz_m1
	JSR fz_mul16
	LDA !fz_m2
	CLC
	ADC !fz_m6
	STA !fz_m6
	LDA !fz_m3
	ADC !fz_m7
	STA !fz_m7
	RTS

; atan2(dy, dx): A16 = dx, X16 = dy (signed) -> A16 = angle.
fz_atan2:
	STA !fz_m0                        ; dx
	STX !fz_m1                        ; dy
	JSR fz_abs
	STA !fz_m2                        ; |dx|
	TXA
	JSR fz_abs
	STA !fz_m3                        ; |dy|
	ORA !fz_m2
	BNE +
	LDA.w #$0000
	RTS
+	; ratio of the smaller to the larger, 0-256
	LDA !fz_m3
	CMP !fz_m2
	BEQ .le
	BCC .le
	; |dy| > |dx|: 16384 - A(|dx|/|dy|)
	LDA !fz_m2
	LDX !fz_m3
	JSR .ratio
	EOR.w #$FFFF
	SEC
	ADC.w #16384
	BRA .quad
.le
	LDA !fz_m3
	LDX !fz_m2
	JSR .ratio
.quad
	; dx < 0: pi - a
	LDX !fz_m0
	BPL +
	EOR.w #$FFFF
	SEC
	ADC.w #32768
+	; dy < 0: -a
	LDX !fz_m1
	BPL +
	EOR.w #$FFFF
	INC
+	RTS
; A16 = small, X16 = large (small <= large, large > 0) -> A16 = atan(small/large)
.ratio
	STA !fz_m4
	STX !fz_m5
-	LDA !fz_m5
	CMP.w #256
	BCC +
	LSR !fz_m5
	LSR !fz_m4
	BRA -
+	LDA !fz_m5
	BNE +
	LDA.w #1
	STA !fz_m5
+	LDA !fz_m4
	XBA
	AND.w #$FF00
	STA.l $004204
	SEP #$20
	LDA !fz_m5
	STA.l $004206
	REP #$20
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	LDA.l $004214                     ; 0-256
	CMP.w #257
	BCC +
	LDA.w #256
+	ASL
	TAX
	LDA.l frieza_atan_table,X
	RTS

; Step of `speed` pixels along angle A16 (frieza-combat.js pixelStep:
; round(cos * speed), round(sin * speed)). X16 = speed table (0 = 3 px,
; 1 = 4 px, 2 = 7 px). Out: !fz_m0 = dx, !fz_m1 = dy (signed).
fz_step:
	XBA
	AND.w #$00FF                      ; 256 directions
	STA !fz_m4
	TXA
	XBA
	ORA !fz_m4                        ; table offset: speed * 256 + direction
	TAX
	LDA.l frieza_cos_table,X
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	STA !fz_m0
	LDA.l frieza_sin_table,X
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	STA !fz_m1
	RTS
