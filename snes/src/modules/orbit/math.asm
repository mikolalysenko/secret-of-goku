; Integer helpers shared by the fight code (engine/orbit-pixels.js and the
; distance tests of frieza-combat.js / frieza-orbit.js). DB = $32, M16/X16.

incsrc "orbit/vectors.asm"

!OBK #= !CODE_ORBIT&$FF0000        ; this code bank (long reads of its tables)

; orbitHeading(dx, dy): A16 = dx, X16 = dy (signed) -> A16 = 0-15, the
; sixteen 8.8 vectors' largest dot product (lower heading on ties within a
; quadrant). (0, 0) -> 0.
orbit_heading:
	STA.w !m_t0                    ; dx
	STX.w !m_t1                    ; dy
	JSR orbit_abs
	STA.w !m_t2                    ; |dx|
	TXA
	JSR orbit_abs
	STA.w !m_t3                    ; |dy|
-	LDA.w !m_t2                    ; scale both to 8 bits
	ORA.w !m_t3
	CMP.w #$0100
	BCC +
	LSR.w !m_t2
	LSR.w !m_t3
	BRA -
+	; The pairwise boundaries of the 8.8 vectors (256,0) (229,114)
	; (181,181) (114,229) (0,256): move on while ay*A > ax*X.
	LDY.w #$0000
	LDA.w #114 : LDX.w #27 : JSR .next : BCC .k
	INY
	LDA.w #67 : LDX.w #48 : JSR .next : BCC .k
	INY
	LDA.w #48 : LDX.w #67 : JSR .next : BCC .k
	INY
	LDA.w #27 : LDX.w #114 : JSR .next : BCC .k
	INY
.k
	TYA
	LDX.w !m_t0
	BPL .xpos
	LDX.w !m_t1                    ; dx < 0: 8 - k (dy >= 0), 8 + k (dy < 0)
	BMI +
	EOR.w #$FFFF
	SEC : ADC.w #$0008
	BRA .done
+	CLC : ADC.w #$0008
	BRA .done
.xpos
	LDX.w !m_t1
	BPL .done                      ; k
	EOR.w #$FFFF                   ; dy < 0: 16 - k
	SEC : ADC.w #$0010
.done
	AND.w #$000F
	RTS
.next
	STX.w !m_t4
	SEP #$20
	STA.w $4202
	LDA.w !m_t3
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216                    ; ay * A
	STA.w !m_t5
	SEP #$20
	LDA.w !m_t4
	STA.w $4202
	LDA.w !m_t2
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w !m_t5
	CMP.w $4216                    ; ay*A > ax*X ?
	BEQ .le
	BCC .le
	SEC
	RTS
.le
	CLC
	RTS

orbit_abs:
	CMP.w #$0000
	BPL +
	EOR.w #$FFFF : INC
+	RTS

; Whole-pixel step of heading Y16 at one speed table: A16 = the table's
; address (orbit_steps_N) -> X16 = dx, Y16 = dy (signed).
orbit_step:
	STA.w !m_t0
	TYA
	AND.w #$000F
	ASL
	CLC : ADC.w !m_t0
	TAX
	LDA.l !OBK,X
	PHA
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	TAX
	PLA
	XBA
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	TAY
	RTS

; The 8.8 vector of heading A16 -> X16 = vx, Y16 = vy.
orbit_vec:
	AND.w #$000F
	ASL : ASL
	TAX
	LDA.l orbit_vectors+2,X
	TAY
	LDA.l orbit_vectors,X
	TAX
	RTS

; A16 = signed a (|a| < 1024) * signed b (8.8, |b| <= 256) / 256 (toward
; zero; the browser's ">> 8" floors: below a pixel). In: A = a, X = b.
orbit_mul88:
	STA.w !m_t0
	STX.w !m_t1
	EOR.w !m_t1
	STA.w !m_t2                    ; product sign in bit 15
	TXA
	JSR orbit_abs
	CMP.w #$0100
	BCC .small
	LDA.w !m_t0                    ; |b| = 256: a itself
	JSR orbit_abs
	BRA .sign
.small
	STA.w !m_t1
	LDA.w !m_t0
	JSR orbit_abs
	STA.w !m_t3
	SEP #$20
	LDA.w !m_t1
	STA.w $4202
	LDA.w !m_t3
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	XBA : AND.w #$00FF
	STA.w !m_t0                    ; (lo * b) >> 8
	SEP #$20
	LDA.w !m_t3+1
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	CLC : ADC.w !m_t0
.sign
	BIT.w !m_t2
	BPL +
	EOR.w #$FFFF : INC
+	RTS

; Carry set when dx^2 + dy^2 < r^2: A16 = dx, X16 = dy, Y16 = r (< 256).
orbit_near:
	JSR orbit_abs
	STA.w !m_t0
	CPY.w !m_t0
	BEQ .far
	BCC .far
	TXA
	JSR orbit_abs
	STA.w !m_t1
	CPY.w !m_t1
	BEQ .far
	BCC .far
	STY.w !m_t2
	SEP #$20
	LDA.w !m_t0
	STA.w $4202
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	STA.w !m_t3
	SEP #$20
	LDA.w !m_t1
	STA.w $4202
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	CLC : ADC.w !m_t3
	BCS .far
	STA.w !m_t3
	SEP #$20
	LDA.w !m_t2
	STA.w $4202
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w !m_t3
	CMP.w $4216
	BCS .far
	SEC
	RTS
.far
	CLC
	RTS

; sweptDistance(p; a -> b) < r for a short step (|b - a| <= 12): the two
; ends and the midpoint. In: sw_px/py, sw_ax/ay, sw_bx/by, Y16 = r.
; Carry set when within.
orbit_swept:
	STY.w !sw_r
	LDA.w !sw_px : SEC : SBC.w !sw_ax : PHA
	LDA.w !sw_py : SEC : SBC.w !sw_ay : TAX
	PLA
	JSR orbit_near
	BCS .out
	LDA.w !sw_ax : CLC : ADC.w !sw_bx : CMP.w #$8000 : ROR : STA.w !m_t4
	LDA.w !sw_ay : CLC : ADC.w !sw_by : CMP.w #$8000 : ROR : STA.w !m_t5
	LDA.w !sw_px : SEC : SBC.w !m_t4 : PHA
	LDA.w !sw_py : SEC : SBC.w !m_t5 : TAX
	PLA
	LDY.w !sw_r
	JSR orbit_near
	BCS .out
	LDA.w !sw_px : SEC : SBC.w !sw_bx : PHA
	LDA.w !sw_py : SEC : SBC.w !sw_by : TAX
	PLA
	LDY.w !sw_r
	JSR orbit_near
.out
	RTS

; A ray from (sw_ax, sw_ay) along heading Y16 for A16 pixels: carry set when
; (sw_px, sw_py) is within sw_r of it (frieza.js sweptDistance against a
; long segment: across the axis inside it, or near its start).
orbit_ray_hit:
	STA.w !sw_len
	TYA
	JSR orbit_vec                  ; X = vx, Y = vy
	STX.w !m_t6
	STY.w !m_t7
	; along = (p - a) . v
	LDA.w !sw_px : SEC : SBC.w !sw_ax
	STA.w !sw_dx
	LDX.w !m_t6
	JSR orbit_mul88
	STA.w !m_t4
	LDA.w !sw_py : SEC : SBC.w !sw_ay
	STA.w !sw_dy
	LDX.w !m_t7
	JSR orbit_mul88
	CLC : ADC.w !m_t4
	STA.w !sw_along
	BMI .start                     ; behind the start: distance to the start
	CMP.w !sw_len
	BCS .no                        ; past the end (the rays run off screen)
	; across = |(p - a) x v| = |dx * vy - dy * vx|
	LDA.w !sw_dx
	LDX.w !m_t7
	JSR orbit_mul88
	STA.w !m_t4
	LDA.w !sw_dy
	LDX.w !m_t6
	JSR orbit_mul88
	SEC : SBC.w !m_t4
	JSR orbit_abs
	CMP.w !sw_r
	BCS .no
	SEC
	RTS
.start
	LDA.w !sw_dx
	LDX.w !sw_dy
	LDY.w !sw_r
	JMP orbit_near
.no
	CLC
	RTS

; Math.round(Math.hypot(dx, dy)): A16 = dx, X16 = dy (|dx|, |dy| < 256) ->
; A16. The integer square root of dx^2 + dy^2 (17 bits) bit by bit, then
; up when the remainder exceeds the root (n >= r^2 + r + 1: the root's
; fraction is at least one half; it is never exactly a half).
orbit_hypot:
	JSR orbit_abs
	STA.w !m_t0
	TXA
	JSR orbit_abs
	STA.w !m_t1
	SEP #$20
	LDA.w !m_t0 : STA.w $4202 : STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	STA.w !m_t2                    ; n (low word)
	STZ.w !m_t3                    ; n (high word)
	SEP #$20
	LDA.w !m_t1 : STA.w $4202 : STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	CLC : ADC.w !m_t2
	STA.w !m_t2
	BCC +
	INC.w !m_t3
+	STZ.w !m_t4                    ; res (32 bits: m_t4, m_t5)
	STZ.w !m_t5
	STZ.w !m_t6                    ; bit = 1 << 16
	LDA.w #$0001
	STA.w !m_t7
.root
	; t = res + bit; n >= t ?
	LDA.w !m_t4 : CLC : ADC.w !m_t6 : STA.w !m_t0
	LDA.w !m_t5 : ADC.w !m_t7 : STA.w !m_t1
	LDA.w !m_t3
	CMP.w !m_t1
	BCC .less
	BNE .more
	LDA.w !m_t2
	CMP.w !m_t0
	BCC .less
.more
	; n -= t; res = (res >> 1) + bit
	LDA.w !m_t2 : SEC : SBC.w !m_t0 : STA.w !m_t2
	LDA.w !m_t3 : SBC.w !m_t1 : STA.w !m_t3
	LSR.w !m_t5 : ROR.w !m_t4
	LDA.w !m_t4 : CLC : ADC.w !m_t6 : STA.w !m_t4
	LDA.w !m_t5 : ADC.w !m_t7 : STA.w !m_t5
	BRA .next
.less
	LSR.w !m_t5 : ROR.w !m_t4
.next
	; bit >>= 2
	LSR.w !m_t7 : ROR.w !m_t6
	LSR.w !m_t7 : ROR.w !m_t6
	LDA.w !m_t6
	ORA.w !m_t7
	BNE .root
	; round: remainder (< 2^16 here) > root -> root + 1
	LDA.w !m_t2
	CMP.w !m_t4
	BEQ +
	BCC +
	LDA.w !m_t4
	INC
	RTS
+	LDA.w !m_t4
	RTS
