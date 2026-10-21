; The distant bodies (orbit-debris.js orbitTargets; frieza-orbit-view.js
; draws them first, behind everything): the moon, the outer planet and the
; distant planetoid, at orbit-camera.js projectOrbitBackground with their
; depths (5, 4, 3) and wrapOrbitBackground. Goku's and Frieza's shots,
; beams, lasers, orbs and ricochets shatter them (strikeOrbitScenery,
; shatterOrbitBody): the large impact burst at the body for 170 frames of
; the battle's clock, Luna's remark when Goku breaks the moon, the
; fortress-break cue and a shake of 7. (Their debris: not yet.) This file:
; the projection, in the second code area (the main bank calls the far
; entries with JSL); the strikes: strike.asm (the third code area); the
; drawing and the pictures' homes: scdraw.asm.
;
; Projection, exactly: with D = 832 * 128 (orbit-scenery.mjs),
;   N_x = D x + (x - 128)(r - 104) d 128 + (cx - 95) d 13312 - travelX 2132 d + D / 2
; and floor(N_x / D) is the browser's Math.round (y likewise with 112, 154
; and travelY 1066 d). A body keeps floor(N / D) as its drawn place and the
; remainder in [0, D); the camera's and travel's changes move the remainder
; (sc_update) and the place a pixel at a time, wrapping as
; wrapOrbitBackground does (x from 288 to -32, y from 256 to -32: the next
; copy, which an impact, keeping its own, does not take).
; DB = $32, M16/X16.

sc_init_far:
	JSR sc_init : RTL
sc_frame_start_far:
	JSR sc_frame_start : RTL
sc_update_far:
	JSR sc_update : RTL
sc_tick_far:
	JSR sc_tick : RTL
sc_tick_end_far:
	JSR sc_tick_end : RTL

; math.asm's orbit_abs, here for this bank.
sc_abs:
	CMP.w #$0000
	BPL +
	EOR.w #$FFFF : INC
+	RTS
; ---------------------------------------------------------------------------
; Fresh fight (fight_start): the bodies at their places (remainder D / 2),
; the camera (95, 154, 104) and the frame's travel so far applied; nothing
; shattered (the fight block's clear), no pictures.
sc_init:
	LDX.w #(!OSC_N-1)*2
-	LDA.l .x0,X : STA.l !sc_pos+0,X
	LDA.l .y0,X : STA.l !sc_pos+6,X
	TXA : ASL : ASL : TAY
	LDA.w #(!OSC_D/2)&$FFFF
	STA.w !sc_n,Y
	STA.w !sc_n+4,Y
	LDA.w #(!OSC_D/2)>>16
	STA.w !sc_n+2,Y
	STA.w !sc_n+6,Y
	DEX : DEX
	BPL -
	LDA.w #104 : STA.w !sc_lr
	LDA.w #95 : STA.w !sc_lx
	LDA.w #154 : STA.w !sc_ly
	LDA.w !cam_tdx : STA.w !sc_ax
	LDA.w !cam_tdy : STA.w !sc_ay
	LDA.w #$FFFF
	LDX.w #10
-	STA.l !sc_want,X               ; (and sc_have)
	DEX : DEX
	BPL -
	STZ.w !sc_pend
	STZ.w !sc_dk
	STZ.w !sc_dk+2
	STZ.w !sc_dk+4
	LDA.w #$FFFF
	STA.w !sc_wkey                 ; (the wanted pictures afresh)
	STA.l !sc_nwant
	JSR sc_rooms
	JMP sc_radii
.x0	dw !OSC_B0_X, !OSC_B1_X, !OSC_B2_X
.y0	dw !OSC_B0_Y, !OSC_B1_Y, !OSC_B2_Y

; The frame's travel starts over (scene.asm, where cam_tdx/cam_tdy do).
sc_frame_start:
	STZ.w !sc_ax
	STZ.w !sc_ay
	RTS

; tickOrbitDebris's part (fight_tick_orbit each step, before the intro's and
; the clash's return): Luna's remark ages (gone at 165). (The places follow
; the camera when a strike needs them, sc_strike, and once a frame for the
; drawing, scene.asm.)
sc_tick:
	LDA.w !sc_aside
	BEQ +
	INC
	CMP.w #165+91
	BCC ++
	LDA.w #0
++	STA.w !sc_aside
+	RTS

; The tick's end (fight_tick_orbit, not in the intro or the clash): the
; impacts age, gone at 170.
sc_tick_end:
	LDX.w #(!OSC_N-1)*4
-	LDA.w !sc_imp,X
	BEQ +
	INC
	CMP.w #170+1
	BCC ++
	LDA.w #0
++	STA.w !sc_imp,X
+	TXA : SEC : SBC.w #4 : TAX
	BPL -
	RTS

; sc_dn += <delta> K, K body X16's 32-bit constant (<lo>, <hi>): a change
; of one by an add, else the product with K / 128 (<coef>). Keeps X.
macro sc_term(delta, lo, hi, coef)
	LDA.w <delta>
	BEQ ?out
	CMP.w #1
	BNE ?minus
	LDA.w !sc_dn : CLC : ADC.l <lo>,X : STA.w !sc_dn
	LDA.w !sc_dn+2 : ADC.l <hi>,X : STA.w !sc_dn+2
	BRA ?out
?minus:
	CMP.w #$FFFF
	BNE ?mul
	LDA.w !sc_dn : SEC : SBC.l <lo>,X : STA.w !sc_dn
	LDA.w !sc_dn+2 : SBC.l <hi>,X : STA.w !sc_dn+2
	BRA ?out
?mul:
	TAY
	LDA.l <coef>,X
	JSR sc_mul_add128
	LDX.w !sc_kb
?out:
endmacro

; Body <k>'s usual step (sc_update): x's change (sc_dtx: its entry in
; bytes), the pending travel's (sc_dcy: its count * 4) and y's (sc_dty),
; then its remainders back in [0, D), the places a pixel at a time.
macro sc_unit(k)
	LDX.w !sc_dtx
	LDA.w !sc_n+(<k>*8) : CLC : ADC.l sc_steps+(<k>*108),X : STA.w !sc_n+(<k>*8)
	LDA.w !sc_n+(<k>*8)+2 : ADC.l sc_steps+(<k>*108)+2,X : STA.w !sc_n+(<k>*8)+2
	LDA.w !sc_pend                 ; (its pending steps: those it has not taken)
	SEC : SBC.w !sc_dk+(<k>*2)
	ASL : ASL
	TAX
	BEQ ?xp
	LDA.w !sc_n+(<k>*8) : CLC : ADC.l sc_pend_tab+(<k>*64),X : STA.w !sc_n+(<k>*8)
	LDA.w !sc_n+(<k>*8)+2 : ADC.l sc_pend_tab+(<k>*64)+2,X : STA.w !sc_n+(<k>*8)+2
?xp:
	BMI ?xs
	CMP.w #(!OSC_D)>>16
	BCC ?y
	BNE ?xs
	LDA.w !sc_n+(<k>*8)
	CMP.w #(!OSC_D)&$FFFF
	BCC ?y
?xs:
	LDA.w #<k>*2 : STA.w !sc_kb
	LDY.w #<k>*8
	LDA.w #288 : STA.w !sc_t+4     ; (x: wraps at 288)
	STZ.w !sc_t+6
	JSR sc_steps_in
?y:
	LDX.w !sc_dty
	LDA.w !sc_n+(<k>*8)+4 : CLC : ADC.l sc_steps+(<k>*108),X : STA.w !sc_n+(<k>*8)+4
	LDA.w !sc_n+(<k>*8)+6 : ADC.l sc_steps+(<k>*108)+2,X : STA.w !sc_n+(<k>*8)+6
	BMI ?ys
	CMP.w #(!OSC_D)>>16
	BCC ?out
	BNE ?ys
	LDA.w !sc_n+(<k>*8)+4
	CMP.w #(!OSC_D)&$FFFF
	BCC ?out
?ys:
	LDA.w #<k>*2 : STA.w !sc_kb
	LDY.w #<k>*8+4
	LDA.w #256 : STA.w !sc_t+4     ; (y: wraps at 256)
	LDA.w #6 : STA.w !sc_t+6
	JSR sc_steps_in
?out:
endmacro

; ---------------------------------------------------------------------------
; The camera's and travel's changes since the last update into the bodies'
; places (each fight step: the strikes see the step's camera; and once a
; frame after the last step's steering and the clash's camera: scene.asm).
; The fight's every step (travelX + 2 and nothing else) is a constant per
; body.
sc_update:
	LDA.w !cam_r : CMP.w !sc_lr : BNE .cam
	LDA.w !cam_x : CMP.w !sc_lx : BNE .cam
	LDA.w !cam_y : CMP.w !sc_ly : BNE .cam
	LDA.w !cam_tdy : CMP.w !sc_ay : BNE .whole
	LDA.w !cam_tdx
	SEC : SBC.w !sc_ax
	BNE +
	RTS                            ; (nothing moved)
+	CMP.w #2
	BNE .whole
	; a step's travel alone (travelX + 2): pending while no place moves;
	; a body whose place would move takes its steps alone
	LDA.w !cam_tdx : STA.w !sc_ax
	INC.w !sc_pend
	LDA.w !sc_pend
	CMP.w #16
	BCC +
	JMP sc_flush                   ; (the table's 15 steps at most: every body whole)
+	CMP.w !sc_next
	BCC +
	BEQ +
	JMP sc_moves                   ; (a place moves)
+	RTS
.cam
	STZ.w !sc_expo                 ; (the camera moved: where each body shows, unknown)
	INC.w !sc_pgen                 ; (the strikes' misses with it: strike.asm)
.whole
	LDA.w !cam_tdx : TAX : SEC : SBC.w !sc_ax : STA.w !sc_dtx : STX.w !sc_ax
	LDA.w !cam_tdy : TAX : SEC : SBC.w !sc_ay : STA.w !sc_dty : STX.w !sc_ay
	LDA.w !cam_r : TAX : SEC : SBC.w !sc_lr : STA.w !sc_dr : STX.w !sc_lr
	LDA.w !cam_x : TAX : SEC : SBC.w !sc_lx : STA.w !sc_dcx : STX.w !sc_lx
	LDA.w !cam_y : TAX : SEC : SBC.w !sc_ly : STA.w !sc_dcy : STX.w !sc_ly
	; the usual steps (travelX + 2 each, travelY 0, the camera's radius, x
	; and y by one at most): each axis's change whole from sc_steps
	; (orbit-scenery.mjs), the travel as pending steps (sc_pend_tab), no
	; products
	LDA.w !sc_dty
	BEQ +
	JMP .flushGeneral
+	LDA.w !sc_dtx
	LSR
	BCC +
	JMP .flushGeneral              ; (an odd travel: the steering's)
+	CLC : ADC.w !sc_pend
	CMP.w #16
	BCC +
	JMP .flushGeneral
+	STA.w !sc_pend                 ; (the frame's steps join the pending ones)
	STZ.w !sc_dtx
	LDA.w !sc_dr
	INC
	CMP.w #3
	BCC +
	JMP .flushGeneral
+	STA.w !sc_t
	ASL
	ADC.w !sc_t
	STA.w !sc_t                    ; 3 (dr + 1)
	LDA.w !sc_dcx
	INC
	CMP.w #3
	BCC +
	JMP .flushGeneral
+	ADC.w !sc_t
	STA.w !sc_t+2                  ; x's entry: 3 (dr + 1) + dcx + 1
	LDA.w !sc_dcy
	INC
	CMP.w #3
	BCC +
	JMP .flushGeneral
+	ADC.w !sc_t
	CLC : ADC.w #18                ; y's: 18 + 3 (dr + 1) + dcy + 1
	ASL : ASL
	STA.w !sc_dty                  ; (in bytes; the changes are spent)
	LDA.w !sc_t+2
	ASL : ASL
	STA.w !sc_dtx
	%sc_unit(0)                    ; (each with the pending steps it has not taken)
	%sc_unit(1)
	%sc_unit(2)
	STZ.w !sc_pend
	STZ.w !sc_dk
	STZ.w !sc_dk+2
	STZ.w !sc_dk+4
	JSR sc_rooms
	LDA.w !sc_dr
	BEQ +
	JMP sc_radii
+	RTS
.flushGeneral
	JSR sc_flush                   ; (the pending steps first)
.general
	; per body: x d (128 (x - 128) dr + 13312 dcx - 2132 dtx), y d (128
	; (y - 112) dr + 13312 dcy - 1066 dty); an axis nothing moved is skipped.
	; The travel's products are shared (-2132 dtx, -1066 dty, then times
	; each body's depth), the rest a change of one at a time.
	LDA.w !sc_dtx
	BEQ +
	CMP.w #2
	BEQ +                          ; (the step's own constant)
	TAY
	STZ.w !sc_dn
	STZ.w !sc_dn+2
	LDA.w #-2132
	JSR sc_mul_add
	LDA.w !sc_dn : STA.w !sc_sx
	LDA.w !sc_dn+2 : STA.w !sc_sx+2
+	LDA.w !sc_dty
	BEQ +
	TAY
	STZ.w !sc_dn
	STZ.w !sc_dn+2
	LDA.w #-1066
	JSR sc_mul_add
	LDA.w !sc_dn : STA.w !sc_sy
	LDA.w !sc_dn+2 : STA.w !sc_sy+2
+	LDX.w #(!OSC_N-1)*2
.body
	STX.w !sc_kb
	LDA.w !sc_dtx
	ORA.w !sc_dr
	ORA.w !sc_dcx
	BNE +
	JMP .y
+
	STZ.w !sc_dn
	STZ.w !sc_dn+2
	LDA.w !sc_dtx
	BEQ .xr
	CMP.w #2
	BNE +
	LDA.l sc_update_t2,X           ; (travelX + 2: -4264 d)
	STA.w !sc_dn
	DEC.w !sc_dn+2
	BRA .xr
+	LDA.w !sc_sx : STA.w !sc_dn    ; -2132 d dtx
	LDA.w !sc_sx+2 : STA.w !sc_dn+2
	JSR sc_times_d
.xr
	%sc_term(!sc_dr, sc_update_axrd_lo, sc_update_axrd_hi, sc_update_ax)
	%sc_term(!sc_dcx, sc_update_c_lo, sc_update_c_hi, sc_update_bc)
	TXA : ASL : ASL : TAY
	JSR sc_move_x
	LDX.w !sc_kb
.y
	LDA.w !sc_dty
	ORA.w !sc_dr
	ORA.w !sc_dcy
	BNE +
	JMP .next
+
	STZ.w !sc_dn
	STZ.w !sc_dn+2
	LDA.w !sc_dty
	BEQ .yr
	LDA.w !sc_sy : STA.w !sc_dn    ; -1066 d dty
	LDA.w !sc_sy+2 : STA.w !sc_dn+2
	JSR sc_times_d
.yr
	%sc_term(!sc_dr, sc_update_ayrd_lo, sc_update_ayrd_hi, sc_update_ay)
	%sc_term(!sc_dcy, sc_update_c_lo, sc_update_c_hi, sc_update_bc)
	TXA : ASL : ASL
	ORA.w #4                       ; (y's remainder follows x's)
	TAY
	JSR sc_move_y
	LDX.w !sc_kb
.next
	DEX : DEX
	BMI +
	JMP .body
+	JSR sc_rooms
	LDA.w !sc_dr
	BEQ +
	JMP sc_radii
+	RTS
.t2	dw !OSC_B0_T2, !OSC_B1_T2, !OSC_B2_T2
.ax	dw !OSC_B0_AX, !OSC_B1_AX, !OSC_B2_AX      ; (the products' coefficients / 128)
.ay	dw !OSC_B0_AY, !OSC_B1_AY, !OSC_B2_AY
.bc	dw !OSC_B0_BC, !OSC_B1_BC, !OSC_B2_BC
.axrd_lo	dw !OSC_B0_AXRD_LO, !OSC_B1_AXRD_LO, !OSC_B2_AXRD_LO   ; (a change of one, whole)
.axrd_hi	dw !OSC_B0_AXRD_HI, !OSC_B1_AXRD_HI, !OSC_B2_AXRD_HI
.ayrd_lo	dw !OSC_B0_AYRD_LO, !OSC_B1_AYRD_LO, !OSC_B2_AYRD_LO
.ayrd_hi	dw !OSC_B0_AYRD_HI, !OSC_B1_AYRD_HI, !OSC_B2_AYRD_HI
.c_lo	dw !OSC_B0_C_LO, !OSC_B1_C_LO, !OSC_B2_C_LO
.c_hi	dw !OSC_B0_C_HI, !OSC_B1_C_HI, !OSC_B2_C_HI
; (the usual step's changes, orbit-scenery.mjs: per body 18 x, then 9 y)
sc_steps:
	dd !OSC_STEPS
; (p steps of travelX + 2 per body, p = 0-15; the room by remainder / 2048)
sc_pend_tab:
	dd !OSC_PEND
sc_room_tab:
	db !OSC_ROOM

; Every body's pending steps of travelX + 2 into its remainder (-4264 d
; each: its place a pixel at a time), none pending after.
sc_flush:
	LDX.w #(!OSC_N-1)*2
-	LDA.w !sc_pend
	SEC : SBC.w !sc_dk,X
	BEQ +
	JSR sc_flush_one
+	DEX : DEX
	BPL -
	STZ.w !sc_pend
	STZ.w !sc_dk
	STZ.w !sc_dk+2
	STZ.w !sc_dk+4
	JMP sc_nexts
; The bodies whose places move with the pending steps take them (their
; places a pixel at a time), the others keep them pending.
sc_moves:
	LDX.w #(!OSC_N-1)*2
-	LDA.w !sc_pend
	SEC : SBC.w !sc_dk,X
	CMP.w !sc_rk,X
	BCC +
	BEQ +
	JSR sc_flush_one
+	DEX : DEX
	BPL -
; sc_next = the pending count at which the first place moves.
sc_nexts:
	LDA.w #$7FFF
	STA.w !sc_next
	LDX.w #(!OSC_N-1)*2
-	LDA.w !sc_dk,X
	CLC : ADC.w !sc_rk,X
	CMP.w !sc_next
	BCS +
	STA.w !sc_next
+	DEX : DEX
	BPL -
	RTS
; Body X16's (* 2) pending steps into its remainder, its place a pixel at
; a time, then its room. Keeps X.
sc_flush_one:
	STX.w !sc_kb
	LDA.w !sc_pend
	SEC : SBC.w !sc_dk,X
	ASL : ASL
	STA.w !sc_t                    ; (4 bytes a count)
	LDA.w !sc_pend
	STA.w !sc_dk,X
	STZ.w !sc_dn
	STZ.w !sc_dn+2
	TXA
	ASL : ASL
	TAY                            ; its remainders
	TXA
	ASL : ASL : ASL : ASL : ASL    ; (64 bytes a body)
	CLC : ADC.w !sc_t
	TAX
	LDA.w !sc_n,Y : CLC : ADC.l sc_pend_tab,X : STA.w !sc_n,Y
	LDA.w !sc_n+2,Y : ADC.l sc_pend_tab+2,X : STA.w !sc_n+2,Y
	BMI .move
	CMP.w #(!OSC_D)>>16
	BCC .room
	BNE .move
	LDA.w !sc_n,Y
	CMP.w #(!OSC_D)&$FFFF
	BCC .room
.move
	JSR sc_move_x                  ; (sc_dn 0: the pixels along)
.room
	LDX.w !sc_kb
	JMP sc_room_one
; Every body's room: the steps of travelX + 2 its place takes before it
; moves (orbit-scenery.mjs: by remainder / 2048, at most the true count).
sc_rooms:
	LDX.w #(!OSC_N-1)*2
-	JSR sc_room_one
	DEX : DEX
	BPL -
	JMP sc_nexts
; Body X16's (* 2) room. Keeps X.
sc_room_one:
	TXA
	ASL : ASL
	TAY
	LDA.w !sc_n+1,Y                ; (remainder / 256)
	LSR : LSR : LSR
	CLC : ADC.l .base,X
	PHX
	TAX
	LDA.l sc_room_tab,X
	AND.w #$00FF
	PLX
	STA.w !sc_rk,X
	RTS
.base	dw 0, 52, 104

; Body sc_kb's remainder at sc_n+Y16 back into [0, D), its place a pixel at
; a time (sc_t+4 the wrap, sc_t+6 the axis: sc_step_up / sc_step_down).
; Keeps Y.
sc_steps_in:
	LDA.w !sc_n+2,Y
.again
	BMI .down
	CMP.w #(!OSC_D)>>16
	BCC .done
	BNE .up
	LDA.w !sc_n,Y
	CMP.w #(!OSC_D)&$FFFF
	BCC .done
.up
	JSR sc_step_up
	BRA .again
.down
	JSR sc_step_down
	BRA .again
.done
	RTS

; sc_dn (32 bits) *= the depth of body X16 (* 2): 3, 4 or 5. Keeps X.
sc_times_d:
	LDA.w !sc_dn : STA.w !sc_t
	LDA.w !sc_dn+2 : STA.w !sc_t+2
	ASL.w !sc_dn : ROL.w !sc_dn+2
	ASL.w !sc_dn : ROL.w !sc_dn+2  ; 4 v
	LDA.l .d,X
	CMP.w #4
	BEQ .out
	BCC .three
	LDA.w !sc_dn : CLC : ADC.w !sc_t : STA.w !sc_dn
	LDA.w !sc_dn+2 : ADC.w !sc_t+2 : STA.w !sc_dn+2
	RTS
.three
	LDA.w !sc_dn : SEC : SBC.w !sc_t : STA.w !sc_dn
	LDA.w !sc_dn+2 : SBC.w !sc_t+2 : STA.w !sc_dn+2
.out
	RTS
.d	dw !OSC_B0_DEPTH, !OSC_B1_DEPTH, !OSC_B2_DEPTH

; Body sc_k, its remainder at sc_n+Y16 (+0: x, +4: y): += sc_dn, the place
; a pixel per D carried, wrapping (x at 288, y at 256) with the impact's
; copy offset kept.
sc_move_x:
	LDA.w #288
	STA.w !sc_t+4
	LDA.w #0
	BRA sc_move
sc_move_y:
	LDA.w #256
	STA.w !sc_t+4
	LDA.w #6
sc_move:
	STA.w !sc_t+6                  ; (sc_pos offset: 0 x, 6 y)
	LDA.w !sc_n,Y : CLC : ADC.w !sc_dn : STA.w !sc_n,Y
	LDA.w !sc_n+2,Y : ADC.w !sc_dn+2 : STA.w !sc_n+2,Y
.again
	BMI .down
	CMP.w #(!OSC_D)>>16            ; >= D?
	BCC .done
	BNE .up
	LDA.w !sc_n,Y
	CMP.w #(!OSC_D)&$FFFF
	BCC .done
.up
	JSR sc_step_up
	BRA .again
.down
	JSR sc_step_down
	BRA .again
.done
	LDX.w !sc_kb
	RTS

; A pixel along (sc_move): the remainder - D, the place + 1 (wrapping at
; sc_t+4 to -32: the next copy); A16 = the remainder's high word after.
sc_step_up:
	LDA.w !sc_n,Y : SEC : SBC.w #(!OSC_D)&$FFFF : STA.w !sc_n,Y
	LDA.w !sc_n+2,Y : SBC.w #(!OSC_D)>>16 : STA.w !sc_n+2,Y
	JSR sc_unknown
	LDA.w !sc_kb : CLC : ADC.w !sc_t+6 : TAX
	LDA.l !sc_pos,X
	INC
	CMP.w !sc_t+4
	BMI +
	SEC : SBC.w !sc_t+4
	SEC : SBC.w #32
	PHA
	LDA.w #1
	JSR sc_copy
	PLA
+	STA.l !sc_pos,X
	LDA.w !sc_n+2,Y
	RTS
; Back a pixel: the remainder + D, the place - 1 (wrapping below -32).
sc_step_down:
	LDA.w !sc_n,Y : CLC : ADC.w #(!OSC_D)&$FFFF : STA.w !sc_n,Y
	LDA.w !sc_n+2,Y : ADC.w #(!OSC_D)>>16 : STA.w !sc_n+2,Y
	JSR sc_unknown
	LDA.w !sc_kb : CLC : ADC.w !sc_t+6 : TAX
	LDA.l !sc_pos,X
	DEC
	CMP.w #-32
	BPL +
	CLC : ADC.w !sc_t+4
	CLC : ADC.w #32
	PHA
	LDA.w #$FFFF
	JSR sc_copy
	PLA
+	STA.l !sc_pos,X
	LDA.w !sc_n+2,Y
	RTS

; Body sc_kb moved a pixel: where it shows is unknown (strike.asm), and
; so is every ray's last miss.
sc_unknown:
	INC.w !sc_pgen
	LDX.w !sc_kb
	LDA.l .known,X
	TRB.w !sc_expo
	RTS
.known	dw $0100, $0200, $0400

; The impact of body sc_k keeps its copy: its offset (x, or y when sc_t+6
; is 6) += A16 (+1 / -1) when it shows. Keeps X, Y.
sc_copy:
	STA.w !sc_t
	PHX
	PHY
	LDA.w !sc_kb
	ASL
	TAX                            ; the impact: body * 4
	LDA.w !sc_imp,X
	BEQ .out
	LDA.w !sc_t+6
	BEQ +
	INX                            ; (y's byte follows x's)
+	SEP #$20
	LDA.w !sc_imp+2,X
	CLC : ADC.w !sc_t
	STA.w !sc_imp+2,X
	REP #$20
.out
	PLY
	PLX
	RTS

; The radii for the camera's radius (the browser's own: orbit_body_r).
sc_radii:
	INC.w !sc_pgen
	LDX.w #(!OSC_N-1)*2
-	TXA
	XBA : LSR                      ; body * 256
	CLC : ADC.w !cam_r
	PHX
	TAX
	LDA.l !XDATA_ORBIT_BODY_R,X
	AND.w #$00FF
	PLX
	STA.l !sc_pos+12,X
	DEX : DEX
	BPL -
	RTS

; sc_dn (32 bits) += A16 (signed) * Y16 (signed, |Y| < 256); with
; sc_mul_add128 the product times 128.
sc_mul_add128:
	SEC
	BRA +
sc_mul_add:
	CLC
+	PHP                            ; (carry: times 128)
	STA.w !sc_t
	STY.w !sc_t+2
	EOR.w !sc_t+2
	PHA                            ; the product's sign (bit 15)
	LDA.w !sc_t : JSR sc_abs : STA.w !sc_t
	TYA : JSR sc_abs : STA.w !sc_t+2
	SEP #$20
	LDA.w !sc_t+2 : STA.w $4202
	LDA.w !sc_t : STA.w $4203      ; |a| low byte * |b|
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	STA.w !sc_t+6
	SEP #$20
	LDA.w !sc_t+1 : STA.w $4203    ; |a| high byte * |b|
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	XBA
	PHA
	AND.w #$FF00
	CLC : ADC.w !sc_t+6
	STA.w !sc_t+6
	PLA
	AND.w #$00FF
	ADC.w #0
	STA.w !sc_t+4
	PLA
	STA.w !sc_t                    ; (the sign)
	PLP
	BCC +
	LDX.w #7
-	ASL.w !sc_t+6
	ROL.w !sc_t+4
	DEX
	BNE -
+	BIT.w !sc_t
	BPL .plus
	LDA.w !sc_dn : SEC : SBC.w !sc_t+6 : STA.w !sc_dn
	LDA.w !sc_dn+2 : SBC.w !sc_t+4 : STA.w !sc_dn+2
	RTS
.plus
	LDA.w !sc_dn : CLC : ADC.w !sc_t+6 : STA.w !sc_dn
	LDA.w !sc_dn+2 : ADC.w !sc_t+4 : STA.w !sc_dn+2
	RTS
