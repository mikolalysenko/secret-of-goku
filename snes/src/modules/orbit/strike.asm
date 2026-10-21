; The distant bodies' strikes (strikeOrbitScenery, shatterOrbitBody; see
; scenery.asm), in the orbit's third code area: the main bank calls the far
; entries with JSL; the places come from scenery.asm (sc_update_far).
; DB = $32, M16/X16.

sc_tick_boss_far:
	JSR sc_tick_boss : RTL
sc_strike_seg_far:
	JSR sc_strike_seg : RTL
sc_strike_ray_far:
	JSR sc_strike_ray : RTL
sc_strike_lane_far:
	JSR sc_strike_lane : RTL

; math.asm's orbit_abs and orbit_vec, here for this bank.
sx_abs:
	CMP.w #$0000
	BPL +
	EOR.w #$FFFF : INC
+	RTS
sx_vec:
	AND.w #$000F
	ASL : ASL
	TAX
	LDA.l orbit_vectors+2,X
	TAY
	LDA.l orbit_vectors,X
	TAX
	RTS

; ---------------------------------------------------------------------------
; Frieza's shots against the bodies (tickOrbit, after the ricochets, on the
; ages and places of his last step): a beam younger than 30 (min(360,
; age 30) long, 12 wide), a laser younger than 30 (350, 2), an orb's last
; step (12; it ends there).
sc_tick_boss:
	LDA.w !sc_dead
	AND.w #$0007
	CMP.w #$0007
	BNE +
	RTS                            ; (no body left)
+	LDX.w #(!BS_N-1)*16
.slot
	LDA.w !FS_BOSS+!bs_kind,X
	BEQ .next
	LDY.w !FS_BOSS+!bs_age,X
	BEQ .next                      ; (not moved yet: no previous place)
	CPY.w #330
	BCS .next
	JSR sc_boss_shot
.next
	TXA : SEC : SBC.w #16 : TAX
	BPL .slot
	RTS
; Frieza's shot X16 (kind A16, age Y16) against the bodies. Keeps X.
sc_boss_shot:
	CMP.w #!WK_ORB
	BEQ .orb
	CMP.w #!WK_DISC
	BEQ .out
	CPY.w #30
	BCS .out
	PHX
	LDA.w !FS_BOSS+!bs_x,X : STA.w !sw_ax
	LDA.w !FS_BOSS+!bs_y,X : STA.w !sw_ay
	LDA.w !FS_BOSS+!bs_head,X : STA.w !sc_h
	; a beam min(360, 30 age) long and 12 wide, a laser 350 and 2
	LDA.w !FS_BOSS+!bs_kind,X
	CMP.w #!WK_BEAM
	BNE .laser
	TYA
	ASL
	STA.w !sc_d1                   ; 2 age
	ASL : ASL : ASL : ASL
	SEC : SBC.w !sc_d1             ; 30 age
	CMP.w #360
	BCC +
	LDA.w #360
+	STA.w !sc_d1
	LDY.w #12
	BRA .ray
.laser
	LDA.w #350
	STA.w !sc_d1
	LDY.w #2
.ray
	LDA.w #$8001                   ; Frieza's, a beam (every hit)
	JSR sc_strike_ray
	PLX
.out
	RTS
.orb
	PHX
	LDA.w !FS_BOSS+!bs_px,X : STA.w !sw_ax
	LDA.w !FS_BOSS+!bs_py,X : STA.w !sw_ay
	LDA.w !FS_BOSS+!bs_x,X : STA.w !sw_bx
	LDA.w !FS_BOSS+!bs_y,X : STA.w !sw_by
	LDA.w #1
	LDY.w #12
	JSR sc_strike_seg
	PLX
	BCC +
	LDA.w #999
	STA.w !FS_BOSS+!bs_age,X
+	RTS

; ---------------------------------------------------------------------------
; strikeOrbitScenery against the bodies.
;   sc_strike_seg: the step (sw_ax, sw_ay) -> (sw_bx, sw_by), Y16 = width,
;     A16 = owner (0 Goku, 1 Frieza, 2 countered), bit 15 a beam;
;   sc_strike_lane: a ricochet's latest 12 px: origin (sw_ax, sw_ay),
;     heading sc_h, X16 = its age (1-45), Y16 = width, A16 = owner;
;   sc_strike_ray: from (sw_ax, sw_ay) to that point + v L / 256 (v the
;     heading sc_h's vector, L = sc_d1: the browser's p + (dx, dy) L with
;     dx = vx / 256), Y16 = width, A16 as above.
; A body is struck where it shows (on the screen, outside the globe's disc
; plus half its radius) within its radius plus the width of the line
; (sweptDistance, exactly); a beam shatters every body it strikes,
; anything else the nearest to the line's start. The cheapest test first:
; the line's box widened by the width and the fight's largest radius (16),
; then the distance, then where the body shows. Carry set: struck.
sc_strike_lane:
	STA.w !sc_own
	STY.w !sc_w
	; the lane's ends: origin + round(v d) for d = (age - 1) 12, age 12
	; (orbit_lane: 46 x 4 bytes a heading)
	LDA.w !sc_h
	AND.w #$000F
	ASL                            ; 2 h
	STA.w !sc_tt
	ASL : ASL : ASL                ; 16 h
	STA.w !sc_dd
	ASL                            ; 32 h
	CLC : ADC.w !sc_dd             ; 48 h
	SEC : SBC.w !sc_tt             ; 46 h
	STA.w !sc_tt
	TXA                            ; + age - 1
	DEC
	CLC : ADC.w !sc_tt
	ASL : ASL                      ; * 4 bytes
	TAX
	LDA.l !XDATA_ORBIT_LANE,X
	CLC : ADC.w !sw_ax
	STA.w !sc_tt
	LDA.l !XDATA_ORBIT_LANE+2,X
	CLC : ADC.w !sw_ay
	STA.w !sc_dd
	LDA.l !XDATA_ORBIT_LANE+4,X
	CLC : ADC.w !sw_ax
	STA.w !sw_bx
	LDA.l !XDATA_ORBIT_LANE+6,X
	CLC : ADC.w !sw_ay
	STA.w !sw_by
	LDA.w !sc_tt : STA.w !sw_ax
	LDA.w !sc_dd : STA.w !sw_ay
	; (off the screen by more than a body's reach: nothing to strike)
	LDA.w !sw_ax
	CLC : ADC.w #64
	CMP.w #256+128
	BCS .none
	LDA.w !sw_ay
	CLC : ADC.w #64
	CMP.w #190+128
	BCS .none
	LDA.w !sc_own
	LDY.w !sc_w
	BRA sc_strike_seg
.none
	CLC
	RTS
; Body <k> against the line, when in its box and not left out (sc_sk).
macro sc_strike_body(k, bit)
	LDA.w !sc_sk
	AND.w #<bit>
	BNE ?out
	LDA.l !sc_pos+(<k>*2)
	SEC : SBC.w !sc_bx0
	CMP.w !sc_bxs
	BCS ?out
	LDA.l !sc_pos+6+(<k>*2)
	SEC : SBC.w !sc_by0
	CMP.w !sc_bys
	BCS ?out
	LDX.w #<k>*2
	STX.w !sc_kk
	JSR sc_strike_one
?out:
endmacro

sc_strike_seg:
	STA.w !sc_own
	STY.w !sc_w
	STZ.w !sc_ray
	JMP sc_strike
sc_strike_ray:
	STA.w !sc_own
	STY.w !sc_w
	LDA.w #1
	STA.w !sc_ray
	; (its kind's last miss again: nothing to strike)
	LDA.w !sc_dead
	AND.w #$0007
	CMP.w #$0007
	BNE +
	CLC                            ; (no body left)
	RTS
+	JSL sc_update_far              ; (the places on this step's camera)
	JSR sc_miss_at
	LDA.w !sc_pgen : CMP.w !sk_miss+0,X : BNE .test
	LDA.w !sw_ax : CMP.w !sk_miss+2,X : BNE .test
	LDA.w !sw_ay : CMP.w !sk_miss+4,X : BNE .test
	LDA.w !sc_d1 : CMP.w !sk_miss+6,X : BNE .test
	LDA.w !sc_h : CMP.w !sk_miss+8,X : BNE .test
	LDA.w !sc_w : CMP.w !sk_miss+10,X : BNE .test
	LDA.w !sc_dead
	AND.w #$0007
	CMP.w !sk_miss+12,X
	BNE .test
	CLC
	RTS
.test
	; its heading's vector and |vx|, |vy| (the fast test's), and the box:
	; to the far end of a 360 px ray, each axis cut to the ray's length (a
	; shorter ray's head: |v L| <= min(|end|, L)), widened by m = the width
	; + 16 (the fight's largest radius) on each side
	LDA.w !sc_h
	AND.w #$000F
	ASL : ASL
	STA.w !sc_tt
	ASL
	CLC : ADC.w !sc_tt
	TAX                            ; (12 bytes a heading)
	LDA.l sc_ray_setup+0,X : STA.w !sc_vx
	LDA.l sc_ray_setup+2,X : STA.w !sc_vy
	LDA.l sc_ray_setup+4,X : STA.w !sc_avx
	LDA.l sc_ray_setup+6,X : STA.w !sc_avy
	LDA.w !sc_w
	CLC : ADC.w #16
	STA.w !sc_tt                   ; m
	ASL : INC
	STA.w !sc_m2                   ; 2 m + 1
	LDA.l sc_ray_setup+8,X         ; x: |its end|, at most the length
	CMP.w !sc_d1
	BCC +
	LDA.w !sc_d1
+	STA.w !sc_dx
	CLC : ADC.w !sc_m2
	STA.w !sc_bxs
	LDA.w !sw_ax
	SEC : SBC.w !sc_tt
	BIT.w !sc_vx
	BPL +
	SEC : SBC.w !sc_dx             ; (leftward: from its end)
+	STA.w !sc_bx0
	LDA.l sc_ray_setup+10,X        ; y likewise
	CMP.w !sc_d1
	BCC +
	LDA.w !sc_d1
+	STA.w !sc_dy
	CLC : ADC.w !sc_m2
	STA.w !sc_bys
	LDA.w !sw_ay
	SEC : SBC.w !sc_tt
	BIT.w !sc_vy
	BPL +
	SEC : SBC.w !sc_dy             ; (upward: from its end)
+	STA.w !sc_by0
	LDA.w !sc_h
	AND.w #$0003
	STA.w !sc_vcls
	BRA sc_strike_run
sc_strike:
	LDA.w !sc_dead
	AND.w #$0007
	CMP.w #$0007
	BNE +
	CLC                            ; (no body left)
	RTS
+	JSL sc_update_far                  ; (the places on this step's camera)
	; the box: from min - m, |a - b| + 2 m + 1 wide (m = the width + 16)
	LDA.w !sc_w
	CLC : ADC.w #16
	STA.w !sc_tt
	ASL : INC
	STA.w !sc_m2
	LDA.w !sw_ax
	CMP.w !sw_bx
	BMI +
	LDA.w !sw_bx
+	SEC : SBC.w !sc_tt
	STA.w !sc_bx0
	LDA.w !sw_ax
	SEC : SBC.w !sw_bx
	JSR sx_abs
	CLC : ADC.w !sc_m2
	STA.w !sc_bxs
	LDA.w !sw_ay
	CMP.w !sw_by
	BMI +
	LDA.w !sw_by
+	SEC : SBC.w !sc_tt
	STA.w !sc_by0
	LDA.w !sw_ay
	SEC : SBC.w !sw_by
	JSR sx_abs
	CLC : ADC.w !sc_m2
	STA.w !sc_bys
sc_strike_run:
	LDA.w #$FFFF
	STA.w !sc_best                 ; nearest so far ($FFFF none)
	STZ.w !sc_hits
	; the bodies in the box (the planetoid, the outer planet, the moon:
	; the first of equals kept), but those shattered or known to be hidden
	; (where each shows is known until it or the camera moves: scenery.asm)
	LDA.w !sc_expo
	XBA                            ; (known: bits 0-2)
	STA.w !sc_sk
	XBA
	EOR.w #$FFFF                   ; (not shown: bits 0-2)
	AND.w !sc_sk
	ORA.w !sc_dead
	STA.w !sc_sk
	%sc_strike_body(2, $0004)
	%sc_strike_body(1, $0002)
	%sc_strike_body(0, $0001)
	LDA.w !sc_hits
	BNE +
	LDA.w !sc_ray                  ; (a ray's miss: its kind's last)
	BEQ ++
	JSR sc_miss_at
	LDA.w !sc_pgen : STA.w !sk_miss+0,X
	LDA.w !sw_ax : STA.w !sk_miss+2,X
	LDA.w !sw_ay : STA.w !sk_miss+4,X
	LDA.w !sc_d1 : STA.w !sk_miss+6,X
	LDA.w !sc_h : STA.w !sk_miss+8,X
	LDA.w !sc_w : STA.w !sk_miss+10,X
	LDA.w !sc_dead
	AND.w #$0007
	STA.w !sk_miss+12,X
++	CLC
	RTS
+	LDA.w !sc_own
	BMI +
	LDA.w !sc_bestk
	JSR sc_shatter
+	SEC
	RTS

; X = a ray's kind's last miss (sk_miss: Goku's, Frieza's; the places'
; generation, the line's start, length, heading, width, the shattered).
sc_miss_at:
	LDX.w #0
	LDA.w !sc_own
	LSR
	BCC +
	LDX.w #14
+	RTS

; Body sc_kk (in the line's box) against the line: within its radius plus
; the width, where it shows (on the screen, off the globe: known until it
; or the camera moves, scenery.asm) is struck: a beam shatters it now,
; else the nearest to the line's start so far is kept.
sc_strike_one:
	LDA.l !sc_pos+12,X
	CLC : ADC.w !sc_w
	STA.w !sc_r                    ; its radius + the width
	LDA.w !sc_ray
	BEQ .step
	JSR sc_ray_test
	BRA .tested
.step
	JSR sc_seg_test
.tested
	BCC .out
	LDX.w !sc_kk
	LDA.l sc_bodybits,X
	XBA
	BIT.w !sc_expo
	BEQ .unknown
	LDA.l sc_bodybits,X
	BIT.w !sc_expo
	BEQ .out                       ; (hidden)
	BRA .shows
.unknown
	TSB.w !sc_expo                 ; (known from here)
	JSR sc_onscreen
	BCC .out
	JSR sc_outside
	BCC .out
	LDX.w !sc_kk
	LDA.l sc_bodybits,X
	TSB.w !sc_expo
.shows
	INC.w !sc_hits
	LDA.w !sc_own
	BPL .near
	LDA.w !sc_kk
	JMP sc_shatter
.near
	LDX.w !sc_kk
	LDA.l !sc_pos+0,X
	SEC : SBC.w !sw_ax
	TAY
	LDA.l !sc_pos+6,X
	SEC : SBC.w !sw_ay
	TAX
	TYA
	JSR sc_sq_sum                  ; (x - x0)^2 + (y - y0)^2
	CMP.w !sc_best
	BCS .out
	STA.w !sc_best
	LDA.w !sc_kk
	STA.w !sc_bestk
.out
	RTS
sc_bodybits:
	dw $0001, $0002, $0004
sc_ray_setup:
	dw !OSC_RAY_SETUP
sc_ray_dv:
	dw !OSC_RAY_DV
sc_ray_far:
	dw !OSC_RAY_FAR

; Carry set when body X16 (* 2) is on the screen: x + r >= 0, x - r < 256,
; y + r >= 0, y - r < 190. Keeps X.
sc_onscreen:
	LDA.l !sc_pos+12,X
	STA.w !sc_tt
	LDA.l !sc_pos+0,X
	CLC : ADC.w !sc_tt
	BMI .no
	LDA.l !sc_pos+0,X
	SEC : SBC.w !sc_tt
	CMP.w #256
	BPL .no
	LDA.l !sc_pos+6,X
	CLC : ADC.w !sc_tt
	BMI .no
	LDA.l !sc_pos+6,X
	SEC : SBC.w !sc_tt
	CMP.w #190
	BPL .no
	SEC
	RTS
.no
	CLC
	RTS

; Carry set when body sc_kk's centre is within sc_r of the step (sw_ax,
; sw_ay) -> (sw_bx, sw_by), exactly (the clamped projection's distance;
; the step is at most 12 long and the centre within its box).
sc_seg_test:
	LDX.w !sc_kk
	LDA.l !sc_pos+0,X
	SEC : SBC.w !sw_ax
	STA.w !sc_ex
	LDA.l !sc_pos+6,X
	SEC : SBC.w !sw_ay
	STA.w !sc_ey
	LDA.w !sw_bx : SEC : SBC.w !sw_ax : STA.w !sc_dx
	LDA.w !sw_by : SEC : SBC.w !sw_ay : STA.w !sc_dy
	; dot = e . d, dd = d . d
	LDA.w !sc_ex : LDY.w !sc_dx : JSR sc_mul_s
	STA.w !sc_dot
	LDA.w !sc_ey : LDY.w !sc_dy : JSR sc_mul_s
	CLC : ADC.w !sc_dot
	STA.w !sc_dot
	LDA.w !sc_dx : LDX.w !sc_dy : JSR sc_sq_sum
	STA.w !sc_dd
	BEQ .start
	LDA.w !sc_dot
	BMI .start
	BEQ .start
	CMP.w !sc_dd
	BCS .end
	; inside: |e|^2 dd - dot^2 <= r^2 dd (32 bits)
	LDA.w !sc_ex : LDX.w !sc_ey : JSR sc_sq_sum
	LDY.w !sc_dd
	JSR sc_mul_u
	LDA.w !sc_p : STA.w !sc_q
	LDA.w !sc_p+2 : STA.w !sc_q+2
	LDA.w !sc_dot
	TAY
	JSR sc_mul_u
	LDA.w !sc_q : SEC : SBC.w !sc_p : STA.w !sc_q
	LDA.w !sc_q+2 : SBC.w !sc_p+2 : STA.w !sc_q+2
	LDA.w !sc_r
	TAX
	JSR sc_sq_sum0                 ; r^2
	LDY.w !sc_dd
	JSR sc_mul_u
	LDA.w !sc_p+2                  ; q <= p ?
	CMP.w !sc_q+2
	BNE +
	LDA.w !sc_p
	CMP.w !sc_q
+	BCC sc_no
	SEC
	RTS
.start
	LDA.w !sc_ex : LDX.w !sc_ey
	BRA sc_point
.end
	LDX.w !sc_kk
	LDA.l !sc_pos+6,X
	SEC : SBC.w !sw_by
	TAY
	LDA.l !sc_pos+0,X
	SEC : SBC.w !sw_bx
	TYX
	BRA sc_point

; Carry set when A16^2 + X16^2 <= sc_r^2 (|A|, |X| < 256).
sc_point:
	JSR sc_sq_sum
	PHA
	LDA.w !sc_r
	TAX
	JSR sc_sq_sum0
	STA.w !sc_tt
	PLA
	CMP.w !sc_tt
	BEQ +
	BCS sc_no
+	SEC
	RTS
sc_no:
	CLC
	RTS

; Carry set when body sc_kk's centre lies within R = sc_r of the ray from
; (sw_ax, sw_ay) to that point + v L / 256 (v = (sc_vx, sc_vy), L = sc_d1),
; exactly in integers: e the centre from the start, cross = e x v, dot =
; e . v, vv = |v|^2 = 65536 - dv: |cross| > 256 R is too far (|v| <= 256);
; before the start (dot <= 0) or past the end (256 dot >= L vv) the
; distance to that end, (256 e - L' v)^2 <= 65536 R^2 (L' = 0, L); else
; cross^2 <= R^2 vv.
sc_ray_test:
	LDX.w !sc_kk
	LDA.l !sc_pos+0,X
	SEC : SBC.w !sw_ax
	STA.w !sc_ex
	LDA.l !sc_pos+6,X
	SEC : SBC.w !sw_ay
	STA.w !sc_ey
	LDA.w !sc_vcls
	BNE +
	JMP sc_ray_axis
+	LDA.w !sc_r
	CMP.w #64
	BCS .general
	LDA.w !sc_ex
	JSR sx_abs
	CMP.w #256
	BCS .general
	STA.w !sc_aex
	LDA.w !sc_ey
	JSR sx_abs
	CMP.w #256
	BCS .general
	STA.w !sc_aey
	JMP sc_ray_fast
.general
	; cross = ex vy - ey vx
	LDA.w !sc_ex : LDY.w !sc_vy : JSR sc_smul
	LDA.w !sc_p : STA.w !sc_q
	LDA.w !sc_p+2 : STA.w !sc_q+2
	LDA.w !sc_ey : LDY.w !sc_vx : JSR sc_smul
	LDA.w !sc_q : SEC : SBC.w !sc_p : STA.w !sc_q
	LDA.w !sc_q+2 : SBC.w !sc_p+2 : STA.w !sc_q+2
	BPL +
	LDA.w #0 : SEC : SBC.w !sc_q : STA.w !sc_q
	LDA.w #0 : SBC.w !sc_q+2 : STA.w !sc_q+2
+	BNE .wide                      ; (|cross| of 65536 or more)
	LDA.w !sc_r
	XBA
	AND.w #$FF00                   ; 256 R (R < 256)
	CMP.w !sc_q
	BCS +
.wide
	CLC
	RTS
+	STA.w !sc_rr
	; dot = ex vx + ey vy (32 bits: sc_dot, sc_dd)
	LDA.w !sc_ex : LDY.w !sc_vx : JSR sc_smul
	LDA.w !sc_p : STA.w !sc_dot
	LDA.w !sc_p+2 : STA.w !sc_dd
	LDA.w !sc_ey : LDY.w !sc_vy : JSR sc_smul
	LDA.w !sc_dot : CLC : ADC.w !sc_p : STA.w !sc_dot
	LDA.w !sc_dd : ADC.w !sc_p+2 : STA.w !sc_dd
	BMI .startFar
	ORA.w !sc_dot
	BNE +
.startFar
	JMP .start
+
	; L vv = L 65536 - L dv: past the end when 256 dot >= it
	LDA.w !sc_h
	AND.w #$000F
	ASL
	TAX
	LDA.l sc_ray_dv,X
	TAY
	LDA.w !sc_d1
	JSR sc_mul_u                   ; L dv (16 bits)
	LDA.w !sc_dot
	XBA
	AND.w #$FF00                   ; 256 dot: low word,
	CLC : ADC.w !sc_p              ; + L dv >= L 65536 ?
	LDA.w !sc_dot+1                ; high word (dot < 2^24: its middle bytes)
	ADC.w #0
	CMP.w !sc_d1
	BCS .end
	; within: cross^2 <= R^2 65536 - R^2 dv
	LDA.w !sc_q
	TAY
	JSR sc_mul_u
	LDA.w !sc_p : STA.w !sc_q
	LDA.w !sc_p+2 : STA.w !sc_q+2  ; cross^2
	LDA.w !sc_r
	TAX
	JSR sc_sq_sum0                 ; R^2
	STA.w !sc_ex2
	LDA.w !sc_h
	AND.w #$000F
	ASL
	TAX
	LDA.l sc_ray_dv,X
	TAY
	LDA.w !sc_ex2
	JSR sc_mul_u                   ; R^2 dv
	LDA.w #0 : SEC : SBC.w !sc_p : STA.w !sc_p
	LDA.w !sc_ex2 : SBC.w !sc_p+2 : STA.w !sc_p+2   ; R^2 vv
	LDA.w !sc_p+2                  ; cross^2 <= it ?
	CMP.w !sc_q+2
	BNE +
	LDA.w !sc_p
	CMP.w !sc_q
+	BCC .no
	SEC
	RTS
.start
	LDA.w #0
	BRA .point
.end
	LDA.w !sc_d1
.point
	; (256 e - L' v) on each axis: within 256 R, then the squares' sum
	STA.w !sc_dx                   ; L'
	LDY.w !sc_vx
	JSR sc_smul
	LDA.w !sc_ex
	JSR .axis
	BCS .no
	STA.w !sc_ex2                  ; |256 ex - L' vx|
	LDA.w !sc_dx
	LDY.w !sc_vy
	JSR sc_smul
	LDA.w !sc_ey
	JSR .axis
	BCS .no
	TAY
	JSR sc_mul_u
	LDA.w !sc_p : STA.w !sc_q
	LDA.w !sc_p+2 : STA.w !sc_q+2
	LDA.w !sc_ex2
	TAY
	JSR sc_mul_u
	LDA.w !sc_p : CLC : ADC.w !sc_q : STA.w !sc_q
	LDA.w !sc_p+2 : ADC.w !sc_q+2 : STA.w !sc_q+2   ; the sum
	LDA.w !sc_r
	TAX
	JSR sc_sq_sum0                 ; 65536 R^2: R^2 high, 0 low
	CMP.w !sc_q+2
	BNE +
	LDA.w #0
	CMP.w !sc_q
+	BCC .no
	SEC
	RTS
.no
	CLC
	RTS
; A16 = |256 A - sc_p| when it is at most 256 R (carry clear), else carry set.
.axis
	STA.w !sc_sq+2
	XBA
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	STA.w !sc_dy                   ; 256 A: high word (A >> 8),
	LDA.w !sc_sq+2
	XBA
	AND.w #$FF00                   ;   low word
	SEC : SBC.w !sc_p
	STA.w !sc_tt
	LDA.w !sc_dy
	SBC.w !sc_p+2
	STA.w !sc_dy                   ; (the difference's high word)
	BPL +
	LDA.w #0 : SEC : SBC.w !sc_tt : STA.w !sc_tt
	LDA.w #0 : SBC.w !sc_dy        ; (negated)
+	BNE .far
	LDA.w !sc_tt
	CMP.w !sc_rr
	BEQ +
	BCS .far
+	CLC
	RTS
.far
	SEC
	RTS

; The diagonal headings with |ex|, |ey| < 256 (sc_ray_test): each product
; one multiply (8 x 8); |cross| within floor(R |v|) (orbit-scenery.mjs:
; the same as cross^2 <= R^2 vv), then dot: before the start the distance
; to it, past the end the general test's, else struck.
sc_ray_fast:
	SEP #$20
	LDA.w !sc_aex : STA.w $4202
	LDA.w !sc_avy : STA.w $4203    ; |ex| |vy|
	REP #$20
	LDA.w !sc_ex
	EOR.w !sc_vy
	STA.w !sc_sg                   ; (its sign)
	LDA.w $4216
	STA.w !sc_q
	SEP #$20
	LDA.w !sc_aey : STA.w $4202
	LDA.w !sc_avx : STA.w $4203    ; |ey| |vx|
	REP #$20
	LDA.w !sc_ey
	EOR.w !sc_vx
	EOR.w !sc_sg
	BMI .sum                       ; (the terms' signs differ: |cross| is the sum)
	LDA.w !sc_q
	SEC : SBC.w $4216
	BCS .abs
	EOR.w #$FFFF : INC
	BRA .abs
.sum
	LDA.w !sc_q
	CLC : ADC.w $4216
	BCC .abs
	JMP .no                        ; (65536 or more)
.abs
	STA.w !sc_q
	LDA.w !sc_r
	ASL
	STA.w !sc_tt
	LDA.w !sc_vcls
	XBA : LSR                      ; class * 128
	CLC : ADC.w !sc_tt
	TAX
	LDA.l sc_ray_far,X
	CMP.w !sc_q
	BCS +
	JMP .no
+	; dot = ex vx + ey vy (32 bits: sc_dot, sc_dd)
	SEP #$20
	LDA.w !sc_aex : STA.w $4202
	LDA.w !sc_avx : STA.w $4203    ; |ex| |vx|
	REP #$20
	STZ.w !sc_dd
	LDA.w !sc_ex
	EOR.w !sc_vx
	STA.w !sc_sg
	LDA.w $4216
	BIT.w !sc_sg
	BPL +
	EOR.w #$FFFF : INC             ; (negative: and the high word -1 unless 0)
	BEQ +
	DEC.w !sc_dd
+	STA.w !sc_dot
	SEP #$20
	LDA.w !sc_aey : STA.w $4202
	LDA.w !sc_avy : STA.w $4203    ; |ey| |vy|
	REP #$20
	LDA.w !sc_ey
	EOR.w !sc_vy
	BMI .minus
	LDA.w !sc_dot : CLC : ADC.w $4216 : STA.w !sc_dot
	LDA.w !sc_dd : ADC.w #0 : STA.w !sc_dd
	BRA .dot
.minus
	LDA.w !sc_dot : SEC : SBC.w $4216 : STA.w !sc_dot
	LDA.w !sc_dd : SBC.w #0 : STA.w !sc_dd
.dot
	BMI .start
	ORA.w !sc_dot
	BEQ .start
	; past the end? 256 dot + L dv >= 65536 L (dv: 8 bits; L: 9)
	LDA.w !sc_h
	AND.w #$000F
	ASL
	TAX
	LDA.l sc_ray_dv,X
	SEP #$20
	STA.w $4202
	LDA.w !sc_d1 : STA.w $4203     ; low byte of L * dv
	REP #$20
	LDA.w !sc_d1+1
	AND.w #$00FF
	STA.w !sc_tt
	LDA.w $4216
	STA.w !sc_ex2
	LDA.w !sc_tt
	BEQ +
	LDA.l sc_ray_dv,X
	XBA
	AND.w #$FF00
	CLC : ADC.w !sc_ex2
	STA.w !sc_ex2                  ; L dv
+	LDA.w !sc_dot
	XBA
	AND.w #$FF00                   ; 256 dot, low word
	CLC : ADC.w !sc_ex2
	LDA.w !sc_dot+1                ;   high word (dot < 2^24)
	ADC.w #0
	CMP.w !sc_d1
	BCS .end
	SEC                            ; within the span: struck
	RTS
.end
	LDA.w !sc_r
	XBA
	AND.w #$FF00
	STA.w !sc_rr                   ; 256 R
	JMP sc_ray_test_end
.start
	; before the start: |e| <= R
	LDA.w !sc_aex
	CMP.w !sc_r
	BEQ +
	BCS .no
+	LDA.w !sc_aey
	CMP.w !sc_r
	BEQ +
	BCS .no
+	LDA.w !sc_aex
	LDX.w !sc_aey
	JMP sc_point
.no
	CLC
	RTS

; The axis headings (v = (+-256, 0) or (0, +-256), sc_ray_test): along and
; across are e's own components, the end at L exactly.
sc_ray_axis:
	LDA.w !sc_h
	AND.w #$0004
	BNE .vert
	LDA.w !sc_ey
	STA.w !sc_tt                   ; across
	LDA.w !sc_ex                   ; along (heading 8: -ex)
	BIT.w !sc_vx
	BPL .go
	EOR.w #$FFFF : INC
	BRA .go
.vert
	LDA.w !sc_ex
	STA.w !sc_tt
	LDA.w !sc_ey
	BIT.w !sc_vy
	BPL .go
	EOR.w #$FFFF : INC
.go
	CMP.w #$0000                   ; (the flags: along's, not the BIT's)
	BMI .start
	BEQ .start
	CMP.w !sc_d1
	BCS .end
	LDA.w !sc_tt                   ; within the span: |across| <= R
	JSR sx_abs
	CMP.w !sc_r
	BEQ +
	BCS .no
+	SEC
	RTS
.end
	SEC : SBC.w !sc_d1             ; past the end: from the end
.start
	; A along from the nearer end, sc_tt across: within R?
	JSR sx_abs
	CMP.w !sc_r
	BEQ +
	BCS .no
+	STA.w !sc_dx
	LDA.w !sc_tt
	JSR sx_abs
	CMP.w !sc_r
	BEQ +
	BCS .no
+	TAX
	LDA.w !sc_dx
	JMP sc_point
.no
	CLC
	RTS

; sc_p (32 bits, signed) = A16 * Y16 (signed; |A| < 1024, |Y| <= 256).
sc_smul:
	STA.w !sc_mu
	STY.w !sc_mu+2
	EOR.w !sc_mu+2
	STA.w !sc_sq                   ; the sign (bit 15)
	LDA.w !sc_mu : JSR sx_abs : STA.w !sc_mu
	TYA : JSR sx_abs : STA.w !sc_mu+2
	CMP.w #256
	BCC .small
	LDA.w !sc_mu                   ; |b| = 256: |a| << 8
	XBA
	PHA
	AND.w #$FF00
	STA.w !sc_p
	PLA
	AND.w #$00FF
	STA.w !sc_p+2
	BRA .sign
.small
	SEP #$20
	LDA.w !sc_mu+2 : STA.w $4202
	LDA.w !sc_mu : STA.w $4203     ; |a| low byte * |b|
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	STA.w !sc_p
	STZ.w !sc_p+2
	LDA.w !sc_mu+1
	AND.w #$00FF
	BEQ .sign
	SEP #$20
	STA.w $4203                    ; |a| high byte * |b|
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	XBA
	PHA
	AND.w #$FF00
	CLC : ADC.w !sc_p
	STA.w !sc_p
	PLA
	AND.w #$00FF
	ADC.w #0
	STA.w !sc_p+2
.sign
	BIT.w !sc_sq
	BPL +
	LDA.w #0 : SEC : SBC.w !sc_p : STA.w !sc_p
	LDA.w #0 : SBC.w !sc_p+2 : STA.w !sc_p+2
+	RTS

; Carry set when body X16 (* 2) lies outside the camera's globe:
; hypot(x - cx, y - cy) > cr + r / 2, as dx^2 + dy^2 > floor((2 cr + r)^2
; / 4); a centre farther than cr + r / 2 on either axis needs no squares.
sc_outside:
	LDA.w !cam_r
	ASL
	CLC : ADC.l !sc_pos+12,X
	STA.w !sc_tt                   ; 2 cr + r
	LSR
	STA.w !sc_dd                   ; floor(cr + r / 2)
	LDA.l !sc_pos+0,X
	SEC : SBC.w !cam_x
	JSR sx_abs
	CMP.w !sc_dd
	BEQ +
	BCS .yes
+	STA.w !sc_dx
	LDA.l !sc_pos+6,X
	SEC : SBC.w !cam_y
	JSR sx_abs
	CMP.w !sc_dd
	BEQ +
	BCS .yes
+	; (both under 256: cr <= 104 in the fight) the squares by the multiplier
	SEP #$20
	STA.w $4202
	STA.w $4203                    ; dy^2
	REP #$20
	LDA.w !sc_tt
	CMP.w #256
	BCS .no                        ; (a radius past the fight's: not struck)
	LDA.w $4216
	STA.w !sc_dot
	SEP #$20
	LDA.w !sc_dx
	STA.w $4202
	STA.w $4203                    ; dx^2
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	CLC : ADC.w !sc_dot
	STA.w !sc_dot                  ; dx^2 + dy^2
	SEP #$20
	LDA.w !sc_tt
	STA.w $4202
	STA.w $4203                    ; (2 cr + r)^2
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	LSR : LSR                      ; floor((2 cr + r)^2 / 4)
	CMP.w !sc_dot
	BCS .no
.yes
	SEC
	RTS
.no
	CLC
	RTS

; A16 = A^2 + X^2 for |A|, |X| < 256 (sc_sq_sum0: X^2 alone).
sc_sq_sum:
	JSR sx_abs
	SEP #$20
	STA.w $4202
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	STA.w !sc_sq
	TXA
	JSR sx_abs
	SEP #$20
	STA.w $4202
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	CLC : ADC.w !sc_sq
	RTS
sc_sq_sum0:
	LDA.w #0
	BRA sc_sq_sum

; A16 = A * Y (signed; |A| < 256, |Y| < 256): the low 16 bits.
sc_mul_s:
	STA.w !sc_sq
	STY.w !sc_sq+2
	EOR.w !sc_sq+2
	PHP
	LDA.w !sc_sq : JSR sx_abs
	SEP #$20
	STA.w $4202
	REP #$20
	TYA : JSR sx_abs
	SEP #$20
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	PLP
	BPL +
	EOR.w #$FFFF : INC
+	RTS

; sc_p (32 bits) = A16 * Y16 (unsigned 16 bits each: four products).
sc_mul_u:
	STA.w !sc_mu
	STY.w !sc_mu+2
	SEP #$20
	LDA.w !sc_mu : STA.w $4202
	LDA.w !sc_mu+2 : STA.w $4203   ; al bl
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216 : STA.w !sc_p
	STZ.w !sc_p+2
	SEP #$20
	LDA.w !sc_mu+3 : STA.w $4203   ; al bh
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	JSR .mid
	SEP #$20
	LDA.w !sc_mu+1 : STA.w $4202
	LDA.w !sc_mu+2 : STA.w $4203   ; ah bl
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	JSR .mid
	SEP #$20
	LDA.w !sc_mu+3 : STA.w $4203   ; ah bh
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	CLC : ADC.w !sc_p+2
	STA.w !sc_p+2
	RTS
.mid                               ; sc_p += A << 8
	XBA
	PHA
	AND.w #$FF00
	CLC : ADC.w !sc_p
	STA.w !sc_p
	PLA
	AND.w #$00FF
	ADC.w !sc_p+2
	STA.w !sc_p+2
	RTS

; shatterOrbitBody (A16 = body * 2): gone, its impact (age 0, the copy it
; shows in), Luna's remark once when Goku (or a countered shot) breaks the
; moon, the fortress-break cue and a shake of 7.
sc_shatter:
	TAX
	LDA.l sc_bodybits,X
	TSB.w !sc_dead
	TXA : ASL : TAY
	LDA.w #1
	STA.w !sc_imp,Y
	LDA.w #$0000
	STA.w !sc_imp+2,Y              ; (both copy offsets)
	CPX.w #0
	BNE +
	LDA.w !sc_own
	AND.w #$00FF
	CMP.w #1                       ; Frieza's own shots: no remark
	BEQ +
	LDA.w !sc_dead
	BMI +
	ORA.w #$8000
	STA.w !sc_dead
	LDA.w #1                       ; age -90
	STA.w !sc_aside
+	LDA.w #!AUDIO_SFX_FORTRESS_BREAK
	JSL audio_sfx
	LDA.w #7
	STA.w !f_shake
	RTS
