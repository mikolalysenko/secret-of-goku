; The finale's picture (engine/frieza-finale-view.js), drawn in place of the
; fight's while the clash runs. Once the gather is over, Goku is at (28, 136)
; and Frieza at (204, 48), so the rays the view asks fx.beam for depend on
; the phase age alone (snes/gen/orbit-finale.mjs tabulates their lengths,
; headings and band radii), except in the struggle, where they meet at
; point(shown). OAM is front to back: the view's paint order reversed.
; DB = $32, M16/X16.

fc_draw:
	JSR fc_beam_wants
	LDA.w !fn_phase
	ASL
	TAX
	JMP (.phases,X)
.phases
	dw fc_none, fc_gather, fc_charge, fc_launch, fc_struggle, fc_recoil, fc_win
fc_none:
	RTS

; Gather: Frieza (4) gathers a pink charge from 60 frames on.
fc_gather:
	LDA.w #!OPOSE_IDLE
	JSR fc_goku
	LDA.w !fn_age
	CMP.w #61
	BCC +
	; frame floor(4 (age - 60) / 72), at most 4
	SEC : SBC.w #60
	ASL : ASL
	STA.w $4204
	SEP #$20
	LDA.b #72
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	CMP.w #5
	BCC ++
	LDA.w #4
++	JSR fc_pink_charge
+	LDA.w #4
	JMP fc_frieza

; Charge: the pink charge full, Goku's own charge in his hands.
fc_charge:
	LDA.w #!OPOSE_IDLE
	LDX.w !f_charge
	BEQ +
	LDA.w #!OPOSE_CHARGE
+	JSR fc_goku
	LDA.w !f_charge
	BEQ +
	JSR fc_hand_charge
+	LDA.w #4
	JSR fc_pink_charge
	LDA.w #2
	JMP fc_frieza

; Launch: both rays race to the meeting point (the bands come with the
; beams); a flash at contact.
fc_launch:
	LDA.w #!OPOSE_BEAM
	JSR fc_goku
	JSR fc_purple
	JSR fc_blue
	LDA.w #2
	JMP fc_frieza

; Struggle: the sparks where the beams meet.
fc_struggle:
	LDA.w #!OPOSE_BEAM
	JSR fc_goku
	; gold-spark (age >> 2) at p + (8, -8), turned half round (the cell's
	; pixel u lands at x - u: its top left is x - 7)
	LDA.w !fn_age
	LSR : LSR
	AND.w #$0003
	ASL
	TAX
	LDA.l .gold,X
	ORA.w #!OA_HFLIP|!OA_VFLIP
	STA.w !d_ta
	LDA.w !fn_px
	CLC : ADC.w #8-7
	STA.w !d_x
	LDA.w !fn_py
	SEC : SBC.w #8+7
	STA.w !d_y
	STZ.w !d_big
	JSR ofx_put
	; impact-spark (age >> 2) % 6 at p
	LDA.w !fn_age
	LSR : LSR
	STA.w $4204
	SEP #$20
	LDA.b #6
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4216
	ASL
	TAX
	LDA.l fd_spark_tiles,X
	TAY
	LDX.w !fn_py
	LDA.w !fn_px
	JSR ofx_stamp
	JSR fc_purple
	JSR fc_blue
	LDA.w #2
	JMP fc_frieza
.gold
	dw !OFX_GSPARK_0|(!OFX_PAL_GOLD<<9)|!OA_PRI
	dw !OFX_GSPARK_1|(!OFX_PAL_GOLD<<9)|!OA_PRI
	dw !OFX_GSPARK_2|(!OFX_PAL_GOLD<<9)|!OA_PRI
	dw !OFX_GSPARK_3|(!OFX_PAL_GOLD<<9)|!OA_PRI

; Recoil: Frieza's ray hits home, Goku is thrown back, a burst on him.
fc_recoil:
	LDA.w !fn_age
	CMP.w #!FNT_RECOIL
	BCC +
	LDA.w #!FNT_RECOIL
+	ASL
	TAX
	LDA.l orbit_fn_recoil_dx,X
	EOR.w #$FFFF : INC
	STA.w !fn_d+0                  ; goku.x -= round(6 sin(pi min(1, a / 90)))
	LDA.w #!OPOSE_RECOIL
	JSR fc_goku_at
	LDA.w !fn_age
	CMP.w #32
	BCS +
	LDA.w !f_hx : STA.w !d_t2
	LDA.w !f_hy : STA.w !d_t3
	LDA.w !fn_age
	LDY.w #3
	JSR fd_burst
	JSR fc_purple
+	LDA.w #3
	JMP fc_frieza

; The victory: the wave runs through Frieza and fades; he flashes and
; vanishes; the pouch comes back; Goku descends.
fc_win:
	LDA.w !fn_age
	CMP.w #!FNT_V_DESCENT
	BCC .near
	JSR fc_goku_descent
	BRA .goku
.near
	LDA.w #!OPOSE_IDLE
	LDX.w !fn_age
	CPX.w #!FNT_V_BEAMEND
	BCS +
	LDA.w #!OPOSE_BEAM
+	JSR fc_goku
.goku
	; the pouch, from Frieza's point back to Goku
	LDA.w !fn_age
	SEC : SBC.w #!FNT_V_REWARD
	BCC .noPouch
	CMP.w #!FNT_V_ACQUIRE-!FNT_V_REWARD
	BCS .noPouch
	ASL : ASL
	TAX
	LDA.l orbit_fn_pouch+2,X
	PHA
	LDA.l orbit_fn_pouch,X
	PLX
	LDY.w #!OFX_POUCH|(!OFX_PAL_GOLD<<9)|!OA_PRI
	JSR ofx_stamp
.noPouch
	; Frieza (6) until he vanishes, shaking 3 frames in 6
	LDA.w !fn_age
	SEC : SBC.w #!FNT_V_IMPACT     ; t (negative before the impact)
	CMP.w #!FNT_B_VANISH
	BPL .noFrieza
	STZ.w !fn_d+2
	CMP.w #$0000
	BEQ +
	BMI +
	STA.w $4204
	SEP #$20
	LDA.b #6
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4216
	CMP.w #3
	BCS +
	INC.w !fn_d+2
+	LDA.w #6
	JSR fc_frieza_at
.noFrieza
	; impact-spark (age >> 2) at Frieza before the impact
	LDA.w !fn_age
	CMP.w #!FNT_V_IMPACT
	BCS +
	LSR : LSR
	ASL
	TAX
	LDA.l fd_spark_tiles,X
	TAY
	LDX.w !b_y
	LDA.w !b_x
	JSR ofx_stamp
+	LDA.w !fn_age
	CMP.w #!FNT_V_BEAMEND
	BCS +
	JMP fc_blue
+	RTS

; ---------------------------------------------------------------------------
; Goku at 16x16 on his right-facing row (2): A16 = pose; fc_goku_at adds
; !fn_d+0 to x.
fc_goku:
	STZ.w !fn_d+0
fc_goku_at:
	ASL : ASL
	ORA.w #2                       ; row 2
	XBA
	LSR                            ; (pose * 4 + row) * 128
	CLC : ADC.w #!OSP_GOKU_IDLE_0
	STA.w !v_goku
	LDA.w !f_hx
	CLC : ADC.w !fn_d+0
	SEC : SBC.w #8
	STA.w !d_x
	LDA.w !f_hy : SEC : SBC.w #8 : STA.w !d_y
	LDA.w #!OV_GOKU|(1<<9)|!OA_PRI
	STA.w !d_ta
	STZ.w !d_big
	JMP ofx_put

; descentPose: the front flight cell (34, row 0) growing 16 -> 32, through
; the 32x32 slot Frieza no longer needs.
fc_goku_descent:
	LDA.w !fn_age
	SEC : SBC.w #!FNT_V_DESCENT
	CMP.w #!FNT_V_RETURN-!FNT_V_DESCENT
	BCC +
	LDA.w #!FNT_V_RETURN-!FNT_V_DESCENT-1
+	STA.w !fn_d+0
	ASL
	CLC : ADC.w !fn_d+0            ; * 3 words
	ASL
	TAX
	LDA.l orbit_fn_descent,X : STA.w !d_x
	LDA.l orbit_fn_descent+2,X : STA.w !d_y
	LDA.l orbit_fn_descent+4,X
	CMP.w #16
	BNE .big
	LDA.w #!OSP_GOKU_IDLE_0        ; idle, row 0
	STA.w !v_goku
	LDA.w #!OV_GOKU|(1<<9)|!OA_PRI
	STA.w !d_ta
	STZ.w !d_big
	JMP ofx_put
.big
	CMP.w #24
	BNE +
	LDA.w #!OSP_GOKU_DESCENT_24
	BRA ++
+	LDA.w #!OSP_GOKU_DESCENT_32
++	STA.w !v_frieza
	LDA.w #!OV_FRIEZA|(1<<9)|!OA_PRI
	STA.w !d_ta
	LDA.w #$0001
	STA.w !d_big
	JMP ofx_put

; Frieza (drawFriezaSprite tiny, flipped: he faces Goku from the right):
; A16 = frame; fc_frieza_at adds !fn_d+2 to x.
fc_frieza:
	STZ.w !fn_d+2
fc_frieza_at:
	ASL
	ORA.w #1                       ; flipped
	XBA
	ASL                            ; (frame * 2 + 1) * 512
	CLC : ADC.w #!OSP_FRIEZA_0
	STA.w !v_frieza
	LDA.w !b_x
	CLC : ADC.w !fn_d+2
	SEC : SBC.w #12
	STA.w !d_x
	LDA.w !b_y : SEC : SBC.w #12 : STA.w !d_y
	LDA.w #!OV_FRIEZA|(!OFX_PAL_FRIEZA<<9)|!OA_PRI
	STA.w !d_ta
	LDA.w #$0001
	STA.w !d_big
	JMP ofx_put

; fx.charge(b.x - 8, b.y + 4, pink): A16 = frame (0-4).
fc_pink_charge:
	ASL
	TAX
	LDA.l fd_warning_pcharge,X
	TAY
	LDA.w !b_y
	CLC : ADC.w #4
	TAX
	LDA.w !b_x
	SEC : SBC.w #8
	JMP ofx_stamp

; Goku's hand charge (sockets[18][row 2]), frame floor(charge * 4 / 45).
fc_hand_charge:
	LDA.w !f_charge
	ASL : ASL
	STA.w $4204
	SEP #$20
	LDA.b #45
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	ASL
	TAX
	LDA.l fd_charge_tiles,X
	STA.w !d_t4
	LDX.w #2*2                     ; row 2
	LDA.l orbit_charge_hand+1,X
	AND.w #$00FF
	CMP.w #$0080
	BCC + : ORA.w #$FF00
+	CLC : ADC.w !f_hy
	PHA
	LDA.l orbit_charge_hand,X
	AND.w #$00FF
	CMP.w #$0080
	BCC + : ORA.w #$FF00
+	CLC : ADC.w !f_hx
	PLX
	LDY.w !d_t4
	JMP ofx_stamp

; The rays' origin orbs (charge-orb 4) and bands (beam.asm groups 0 and 1).
fc_blue:
	LDA.w !bw_key
	CMP.w #$FFFF
	BEQ +
	LDY.w #!OFX_ORB_4|(!OFX_PAL_BLUE<<9)|!OA_PRI
	LDX.w !f_hy
	LDA.w !f_hx
	JSR ofx_stamp
	LDX.w #$0000
	JMP beam_draw
+	RTS
fc_purple:
	LDA.w !bw_key+2
	CMP.w #$FFFF
	BEQ +
	LDY.w #!OFX_PORB_4|(!OFX_PAL_PINK<<9)|!OA_PRI
	LDX.w !b_y
	LDA.w !b_x
	JSR ofx_stamp
	LDX.w #$0002
	JMP beam_draw
+	RTS

; ---------------------------------------------------------------------------
; This frame's rays for beam.asm: group 0 Goku's (blue, from his hands),
; group 1 Frieza's (pink, ending where they meet), and the band colour
; frames of the clash's age.
fc_beam_wants:
	LDA.w !fn_age
	LSR : LSR
	AND.w #$0001
	STA.w !v_band
	STA.w !v_pband
	STZ.w !v_pmode
	LDX.w #$0000
	JSR beam_off
	LDX.w #$0002
	JSR beam_off
	LDA.w !fn_phase
	CMP.w #!FN_LAUNCH
	BEQ .launch
	CMP.w #!FN_STRUGGLE
	BNE +
	JMP .struggle
+	CMP.w #!FN_RECOIL
	BNE +
	JMP .recoil
+	CMP.w #!FN_WIN
	BEQ +
	RTS
+	; the victory wave (band radius, length, heading per age)
	LDA.w !fn_age
	CMP.w #!FNT_V_BEAMEND
	BCC +
	RTS
+	STA.w !fn_d+4
	ASL
	CLC : ADC.w !fn_d+4
	ASL
	TAX
	LDA.l orbit_fn_win,X : STA.w !fn_d+6       ; R
	LDA.l orbit_fn_win+2,X : STA.w !fn_d+8     ; length
	LDA.l orbit_fn_win+4,X : STA.w !fn_d+10    ; heading
	JMP fc_want_blue
.launch
	LDA.w !fn_age
	CMP.w #!FNT_LAUNCH+1
	BCC +
	LDA.w #!FNT_LAUNCH
+	ASL : ASL : ASL
	TAX
	LDA.l orbit_fn_launch,X : STA.w !fn_d+8
	LDA.l orbit_fn_launch+2,X : STA.w !fn_d+10
	LDA.l orbit_fn_launch+4,X : STA.w !fn_d+12
	LDA.l orbit_fn_launch+6,X : STA.w !fn_d+14
	LDA.w #28 : STA.w !fn_d+6
	JSR fc_want_blue
	LDA.w !fn_d+12 : STA.w !fn_d+8
	LDA.w !fn_d+14 : STA.w !fn_d+10
	LDA.w #30 : STA.w !fn_d+6
	JMP fc_want_purple
.recoil
	LDA.w !fn_age
	CMP.w #32
	BCC +
	RTS
+	STA.w !fn_d+4
	ASL
	CLC : ADC.w !fn_d+4
	ASL
	TAX
	LDA.l orbit_fn_recoil,X : STA.w !fn_d+6
	LDA.l orbit_fn_recoil+2,X : STA.w !fn_d+8
	LDA.l orbit_fn_recoil+4,X : STA.w !fn_d+10
	JMP fc_want_purple
.struggle
	; p = point(shown): round(h + (b - h) * shown)
	LDA.w !fn_s
	ASL
	STA.w !fn_t
	LDA.w !fn_s+2
	ROL
	STA.w !fn_t+2
	BCC +                          ; shown = 1
	LDA.w #$FFFF
	STA.w !fn_t
	STA.w !fn_t+2
+	LDA.w #28 : LDX.w #204 : JSR finale_mix : STA.w !fn_px
	LDA.w #136 : LDX.w #48 : JSR finale_mix : STA.w !fn_py
	; Goku's: 28 + pulse, pulse = (age >> 3) % 3
	LDA.w !fn_age
	LSR : LSR : LSR
	STA.w $4204
	SEP #$20
	LDA.b #3
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4216
	STA.w !fn_d+0                  ; pulse
	CLC : ADC.w #28
	JSR fc_band_radius
	STA.w !fn_d+6
	LDA.w !fn_px : SEC : SBC.w #28 : STA.w !fn_d+12
	LDA.w !fn_py : SEC : SBC.w #136 : STA.w !fn_d+14
	JSR fc_ray_to
	JSR fc_want_blue
	; Frieza's: 35 - pulse + power * 4, power during a surge =
	; min(3, 1 + (s >> 3), ceil((90 - s) / 12))
	STZ.w !fn_d+2
	JSR finale_surge
	BEQ .noSurge
	TXA
	LSR : LSR : LSR
	INC
	STA.w !fn_d+2                  ; 1 + (s >> 3)
	TXA
	EOR.w #$FFFF
	SEC : ADC.w #90+11             ; 90 - s + 11
	STA.w $4204
	SEP #$20
	LDA.b #12
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214                    ; ceil((90 - s) / 12)
	CMP.w !fn_d+2
	BCS +
	STA.w !fn_d+2
+	LDA.w !fn_d+2
	CMP.w #3
	BCC .noSurge
	LDA.w #3
	STA.w !fn_d+2
.noSurge
	LDA.w !fn_d+2
	ASL : ASL
	SEC : SBC.w !fn_d+0
	CLC : ADC.w #35
	JSR fc_band_radius
	STA.w !fn_d+6
	LDA.w !fn_px : SEC : SBC.w #204 : STA.w !fn_d+12
	LDA.w !fn_py : SEC : SBC.w #48 : STA.w !fn_d+14
	JSR fc_ray_to
	JMP fc_want_purple

; A16 = an integer width -> max(2, round(width / 2) * 2).
fc_band_radius:
	INC
	AND.w #$FFFE
	CMP.w #2
	BCS +
	LDA.w #2
+	RTS

; fn_d+12/+14 = the ray's end minus its origin -> fn_d+8 = length
; (rounded), fn_d+10 = orbitHeading.
fc_ray_to:
	LDA.w !fn_d+12
	LDX.w !fn_d+14
	JSR orbit_hypot
	STA.w !fn_d+8
	LDA.w !fn_d+12
	LDX.w !fn_d+14
	JSR orbit_heading
	STA.w !fn_d+10
	RTS

; Group 0 from Goku's hands: band radius fn_d+6, length fn_d+8, heading
; fn_d+10; the far end runs on under Frieza's band (or off screen).
fc_want_blue:
	LDA.w !fn_d+8
	BEQ .none
	LDA.w !fn_d+6
	BEQ .none
	LDA.w !f_hx : STA.w !bw_x
	LDA.w !f_hy : STA.w !bw_y
	LDA.w !fn_d+10 : STA.w !bg_tmp
	LDA.w !fn_d+6 : STA.w !bg_tmp+2
	STZ.w !bg_tmp+4
	LDA.w !fn_d+8 : STA.w !bg_tmp+6
	LDA.w #(!OFX_PAL_BLUE<<9)|!OA_PRI : STA.w !bg_tmp+8
	LDX.w #$0000
	JSR beam_want
	; cells: ceil(length / period)
	LDA.w !fn_d+8
	LDX.w #$0000
	JSR fc_cells
	STA.w !bw_len
.none
	RTS

; Group 1 from Frieza, its band ending at the ray's end: for the shallow
; headings (class 1, period (32, 16) = 16 steps of (2, 1), steps that keep
; the band's picture) the chain lattice is pushed back behind him so that
; the last cells' far edge falls on the end's column.
fc_want_purple:
	LDA.w !fn_d+8
	BNE +
	RTS
+	LDA.w !fn_d+6
	BNE +
	RTS
+	LDA.w !b_x : STA.w !bw_x+2
	LDA.w !b_y : STA.w !bw_y+2
	LDA.w !fn_d+10 : STA.w !bg_tmp
	LDA.w !fn_d+6 : STA.w !bg_tmp+2
	STZ.w !bg_tmp+4
	LDA.w !fn_d+8 : STA.w !bg_tmp+6
	LDA.w #(!OFX_PAL_PINK<<9)|!OA_PRI : STA.w !bg_tmp+8
	LDX.w #$0002
	JSR beam_want
	LDA.w !fn_d+8
	LDX.w #$0002
	JSR fc_cells
	STA.w !bw_len+2
	LDA.w !fn_d+10
	CMP.w #7
	BNE .none
	; heading 7 (-229, 114): cells run left; cell i's left edge is at
	; x0 - 32 i - 31 (x0 = the origin column). With n = ceil((b.x - e.x
	; + 1) / 32) cells and k = (e.x - b.x + 32 n - 1) >> 1 steps of (2, -1)
	; back, the last left edge lands on e.x or the column before it.
	LDA.w !fn_d+12                 ; e.x - b.x (negative)
	EOR.w #$FFFF : INC
	CLC : ADC.w #32                ; b.x - e.x + 1 + 31
	LSR : LSR : LSR : LSR : LSR
	BNE +
	LDA.w #$0001
+	CMP.w #12
	BCC +
	LDA.w #12
+	STA.w !bw_len+2
	XBA : LSR : LSR : LSR          ; 32 n
	CLC : ADC.w !fn_d+12
	DEC
	BMI .none
	LSR                            ; k
	CMP.w #16
	BCC +
	LDA.w #15
+	STA.w !fn_d+4
	ASL
	CLC : ADC.w !b_x
	STA.w !bw_x+2
	LDA.w !b_y
	SEC : SBC.w !fn_d+4
	STA.w !bw_y+2
.none
	RTS

; A16 = length, X16 = group -> A16 = cells along the beam: ceil(length /
; period) (beam_want's period per class), 1-12.
fc_cells:
	STA.w !fn_d+16
	LDA.w !bw_key,X
	LSR : LSR : LSR : LSR : LSR : LSR
	AND.w #$0007
	TAX
	LDA.l beam_want_period,X
	AND.w #$00FF
	STA.w !fn_d+18
	DEC
	CLC : ADC.w !fn_d+16           ; length + period - 1
	STA.w $4204
	SEP #$20
	LDA.w !fn_d+18
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	BNE +
	INC
+	CMP.w #12
	BCC +
	LDA.w #12
+	RTS
