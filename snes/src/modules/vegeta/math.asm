; Integer helpers (M16/X16, DB = $7E). Products and quotients use the CPU's
; multiplier/divider ($4202-$4206, results in $4214/$4216) as combat does:
; the game's interrupt handlers never use them, and module NMIs only run
; after the frame's logic.

; Scratch for the 32-bit routines (WRAM, call-local; never live across a
; call of another module).
!vm_a0 = !vg_t0        ; 32-bit operand / result low
!vm_a1 = !vg_t1        ;                       high
!vm_b0 = !vg_t2        ; 32-bit operand low
!vm_b1 = !vg_t3        ;                high

; A = |A| (signed 16-bit).
vg_abs:
	CMP.w #$8000
	BCC +
	EOR.w #$FFFF
	INC
+	RTS

; A = sign(A): $FFFF, 0 or 1.
vg_sign:
	CMP.w #$0000
	BEQ +
	BMI .neg
	LDA.w #$0001
+	RTS
.neg
	LDA.w #$FFFF
	RTS

; face(dx, dy) of joch-trial.js: A = dx, X = dy (signed) -> A = 0 down,
; 1 right, 2 left, 3 up. |dx| > |dy| picks the side.
vg_face:
	STA !vg_t0
	STX !vg_t1
	JSR vg_abs
	STA !vg_t2
	TXA
	JSR vg_abs
	CMP !vg_t2
	BCS .vertical                 ; |dy| >= |dx|
	LDA !vg_t0
	BMI .left
	LDA.w #$0001
	RTS
.left
	LDA.w #$0002
	RTS
.vertical
	LDA !vg_t1
	BMI .up
	LDA.w #$0000
	RTS
.up
	LDA.w #$0003
	RTS

; A = dx, X = dy (signed) -> A = dx*dx + dy*dy, saturated at $FFFF.
; Clobbers vm scratch.
vg_dist2:
	JSR vg_abs
	CMP.w #$0100
	BCS .sat
	STA !vg_t0
	TXA
	JSR vg_abs
	CMP.w #$0100
	BCS .sat
	STA !vg_t1
	LDA !vg_t0
	JSR vg_square8
	STA !vg_t2
	LDA !vg_t1
	JSR vg_square8
	CLC
	ADC !vg_t2
	BCS .sat
	RTS
.sat
	LDA.w #$FFFF
	RTS

; A = n (0-255) -> A = n*n (16-bit). Preserves X/Y.
vg_square8:
	PHX
	PHY
	TAX
	TAY
	JSR vg_mul8
	PLY
	PLX
	RTS

; X * Y (both 0-255) -> A (16-bit). Clobbers X/Y.
vg_mul8:
	SEP #$20
	TXA
	STA.l $004202
	TYA
	STA.l $004203                 ; product 8 cycles later
	REP #$20
	NOP
	NOP
	NOP
	LDA.l $004216
	RTS

; Unsigned 16 x 16 -> 32: A * X -> vm_a0 (low) / vm_a1 (high), from the
; four 8 x 8 products. Preserves X; clobbers vm_b0/vm_b1, Y.
vg_mul16:
	STA !vm_b0                    ; a
	STX !vm_b1                    ; b
	PHX
	SEP #$20
	LDA !vm_b0                    ; al * bl
	STA.l $004202
	LDA !vm_b1
	STA.l $004203
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	STA !vm_a0
	SEP #$20
	LDA !vm_b1+1                  ; al * bh
	STA.l $004203
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	STA !vm_a1
	SEP #$20
	LDA !vm_b0+1                  ; ah * bl
	STA.l $004202
	LDA !vm_b1
	STA.l $004203
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	CLC
	ADC !vm_a1                    ; cross = al*bh + ah*bl (17 bits)
	TAX
	LDA.w #$0000
	ROL
	XBA
	STA !vm_a1                    ; the cross sum's carry, << 8 into the high word
	SEP #$20
	LDA !vm_b1+1                  ; ah * bh
	STA.l $004203
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	CLC
	ADC !vm_a1
	STA !vm_a1
	TXA                           ; low += cross << 8, high += cross >> 8 + carry
	XBA
	AND.w #$FF00
	CLC
	ADC !vm_a0
	STA !vm_a0
	TXA
	XBA
	AND.w #$00FF
	ADC !vm_a1
	STA !vm_a1
	PLX
	RTS

; Unsigned 32 / 16 -> 16: (vm_a1:vm_a0) / X -> A (quotient, saturated at
; $FFFF), X preserved. Clobbers vm scratch, Y.
vg_div32:
	STX !vm_b0
	LDA !vm_a1
	CMP !vm_b0
	BCC +
	LDA.w #$FFFF                  ; the quotient needs 17+ bits (or X = 0)
	RTS
+	CPX.w #256
	BCC +
	JMP .wide
+
	; 8-bit divisor: two 16 / 8 divisions, a byte of the low word each
	; (the high word and then each remainder are < X, so they fit a byte)
	XBA
	AND.w #$FF00
	STA !vm_b1
	LDA !vm_a0
	XBA
	AND.w #$00FF
	ORA !vm_b1
	STA.l $004204
	SEP #$20
	TXA
	STA.l $004206                 ; quotient and remainder 16 cycles later
	REP #$20
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	LDA.l $004214
	XBA
	AND.w #$FF00
	STA !vm_a1                    ; quotient high byte
	LDA.l $004216
	XBA
	AND.w #$FF00
	STA !vm_b1
	LDA !vm_a0
	AND.w #$00FF
	ORA !vm_b1
	STA.l $004204
	SEP #$20
	TXA
	STA.l $004206
	REP #$20
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	LDA.l $004214
	ORA !vm_a1
	RTS
.wide
	; 16-bit divisor: 16 steps of long division from the high word
	STA !vm_b1                    ; remainder
	LDY.w #16
.loop
	ASL !vm_a0
	ROL !vm_b1
	BCS .sub                      ; remainder overflowed 16 bits: >= divisor
	LDA !vm_b1
	CMP !vm_b0
	BCC .next
.sub
	LDA !vm_b1
	SEC
	SBC !vm_b0
	STA !vm_b1
	INC !vm_a0                    ; quotient bit (the low bit is 0 after the shift)
.next
	DEY
	BNE .loop
	LDA !vm_a0
	RTS

; round(A * num / den) for unsigned A: X = num, Y = den. A = result.
vg_scale:
	PHY
	JSR vg_mul16
	PLX
	; + den/2 for rounding
	TXA
	LSR
	CLC
	ADC !vm_a0
	STA !vm_a0
	LDA !vm_a1
	ADC.w #$0000
	STA !vm_a1
	JMP vg_div32
