; Integer helpers (M16/X16, DB = $7E). Software arithmetic only: the
; hardware multiplier/divider registers are left to the game.

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
	STX !vg_t3
	LDA.w #$0000
-	CPY.w #$0000
	BEQ +
	PHA
	TYA
	LSR
	TAY
	PLA
	BCC .skip
	CLC
	ADC !vg_t3
.skip
	ASL !vg_t3
	BRA -
+	RTS

; Unsigned 16 x 16 -> 32: A * X -> vm_a0 (low) / vm_a1 (high). Clobbers
; vm_b0/vm_b1, Y.
vg_mul16:
	STA !vm_b0
	STX !vm_b1                    ; multiplier (shifted right)
	STZ !vm_a0
	STZ !vm_a1
	LDY.w #$0000                  ; high word of the shifted multiplicand
.loop
	LDA !vm_b1
	BEQ .done
	LSR
	STA !vm_b1
	BCC .shift
	LDA !vm_a0
	CLC
	ADC !vm_b0
	STA !vm_a0
	TYA
	ADC !vm_a1
	STA !vm_a1
.shift
	ASL !vm_b0
	TYA
	ROL
	TAY
	BRA .loop
.done
	RTS

; Unsigned 32 / 16 -> 16: (vm_a1:vm_a0) / X -> A (quotient, saturated at
; $FFFF), X preserved. Clobbers vm scratch, Y.
vg_div32:
	STX !vm_b0
	LDA.w #$0000
	STA !vm_b1                    ; remainder
	LDY.w #32
.loop
	ASL !vm_a0
	ROL !vm_a1
	ROL !vm_b1
	BCS .sub                      ; remainder overflowed 16 bits: always >= divisor
	LDA !vm_b1
	CMP !vm_b0
	BCC .next
.sub
	LDA !vm_b1
	SEC
	SBC !vm_b0
	STA !vm_b1
	INC !vm_a0                    ; quotient bit (low bit is 0 after the shift)
.next
	DEY
	BNE .loop
	LDA !vm_a1
	BNE .sat
	LDA !vm_a0
	RTS
.sat
	LDA.w #$FFFF
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
