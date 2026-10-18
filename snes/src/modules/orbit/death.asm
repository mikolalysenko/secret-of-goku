; The orbital death (engine/shenron-ending.js lose() with the orbit,
; boss-rush-death.js bossRushDeathPose, frieza-orbit-view.js draw(o,
; fallen)): Goku's HP reached 0 in space. The fight or the clash freezes
; where it stood, the camera and the sky with it; Frieza watches (frame 4,
; facing Goku); Goku keeps his place until FND_FALL (gold until FND_REVERT
; if he died a Super Saiyan), then drops toward the planet, shrinking, until
; FND_FALLEN. The ending's fatal sequence (ending_lose, called by the frieza
; module) fades the picture from 300 and takes it at black (360): two frames
; before, the orbit stops, and the vblank that restores the field gives the
; scene work area back for the ending's stage. DB = $32, M16/X16.

; Carry set while the death runs (from its first frame on).
death_check:
	LDA.w !od_on
	BNE .yes
	LDA.w !f_on
	BEQ .no
	LDA.l $7EE182
	BNE .no
	JSR death_start
.yes
	SEC
	RTS
.no
	CLC
	RTS

; lose(): the pose's start, target and form; the struggle, its band layers,
; the beams and the text panel stop.
death_start:
	LDA.w #$0001
	STA.w !od_on
	STZ.w !od_age
	LDA.w !cam_x : STA.w !od_cam+0
	LDA.w !cam_y : STA.w !od_cam+2
	LDA.w !cam_r : STA.w !od_cam+4
	LDA.w !cam_lon : STA.w !od_cam+6
	LDA.w !cam_lat : STA.w !od_cam+8
	LDA.w !f_hx : STA.w !od_fx
	LDA.w !f_hy : STA.w !od_fy
	; target x = round(cam.x + (from.x - cam.x) * .28) = cam.x + floor((28 e + 50) / 100)
	LDA.w !f_hx
	SEC : SBC.w !cam_x
	STA.w !od_dx                   ; e (signed)
	ASL : ASL
	STA.w !od_dy                   ; (scratch) 4e
	ASL : ASL : ASL                ; 32e
	SEC : SBC.w !od_dy             ; 28e
	CLC : ADC.w #50
	BPL .pos
	; floor(n / 100) for n < 0: -floor((99 - n) / 100)
	EOR.w #$FFFF : INC
	CLC : ADC.w #99
	JSR death_div100
	EOR.w #$FFFF : INC
	BRA +
.pos
	JSR death_div100
+	CLC : ADC.w !cam_x
	SEC : SBC.w !od_fx
	STA.w !od_dx                   ; target x - from x
	; target y = min(192, round(cam.y + cam.r * .25)) = min(192, cam.y + floor((r + 2) / 4))
	LDA.w !cam_r
	INC : INC
	LSR : LSR
	CLC : ADC.w !cam_y
	CMP.w #193
	BCC +
	LDA.w #192
+	SEC : SBC.w !od_fy
	STA.w !od_dy
	LDA.l $7E0000|!goku_form
	AND.w #$0001
	STA.w !od_gold
	; the clash's picture (band layers, rays, sparks) gives way
	STZ.w !fn_phase
	LDX.w #$0000
	JSR beam_off
	LDX.w #$0002
	JSR beam_off
	STZ.w !t_want
	RTS

; A16 = n (0-7999) -> A16 = floor(n / 100).
death_div100:
	STA.w $4204
	SEP #$20
	LDA.b #100
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	RTS

; A frame of the death (orbit_live_frame in place of the fight): the age;
; the globe and the stars at the frozen camera and sky clock; two frames
; before black the scene stops.
death_live:
	INC.w !od_age
	LDA.w !od_age
	CMP.w #!FND_BLACK-2
	BCC +
	JMP death_stop
+	; the death camera (the ending's fatal start writes the scene work
	; area's first bytes before it holds the area: see orbit.md, Requests)
	LDA.w !od_cam+0 : STA.w !cam_x
	LDA.w !od_cam+2 : STA.w !cam_y
	LDA.w !od_cam+4 : STA.w !cam_r
	LDA.w !od_cam+6 : STA.w !cam_lon
	LDA.w !od_cam+8 : STA.w !cam_lat
	JSR bands_frame                ; (no struggle: the layers off)
	JSR globe_frame
	JMP stars_frame

; The ending takes the picture at black: the orbit's fight lets the pad and
; combat go and the scene stops (the next vblank restores the field and
; releases the scene work area).
death_stop:
	JSR orbit_fight_off
	SEP #$20
	LDA.b #!OS_STOP
	STA.l !orbit_state
	REP #$30
	RTS

; OAM (orbit_oam_frame in place of fight_draw): Frieza, then Goku's pose.
death_draw:
	; Frieza: frame 4, facing Goku
	LDA.w #4*2
	LDX.w !b_x
	CPX.w !f_hx
	BEQ +
	BMI +
	INC
+	XBA
	ASL                            ; (frame * 2 + flip) * 512
	CLC : ADC.w #!OSP_FRIEZA_0
	STA.w !v_frieza
	LDA.w !b_x : SEC : SBC.w #12 : STA.w !d_x
	LDA.w !b_y : SEC : SBC.w #12 : STA.w !d_y
	LDA.w #!OV_FRIEZA|(!OFX_PAL_FRIEZA<<9)|!OA_PRI
	STA.w !d_ta
	LDA.w #$0001
	STA.w !d_big
	JSR ofx_put
	; Goku's palette: gold until the revert, if he died gold
	LDA.w #$0001
	STA.w !od_base
	LDA.w !od_gold
	BEQ +
	LDA.w !od_age
	CMP.w #!FND_REVERT
	BCS +
	STZ.w !od_base
+	LDA.w !od_age
	CMP.w #!FND_FALLEN
	BCC +
	RTS                            ; (gone)
+	CMP.w #!FND_FALL
	BCS .falling
	; at his place: column 29 (gold) or 33
	LDA.w #!OSP_GOKU_FALL_33
	LDX.w !od_base
	BNE +
	LDA.w #!OSP_GOKU_FALL_GOLD
+	STA.w !v_goku
	LDA.w !od_fx : SEC : SBC.w #8 : STA.w !d_x
	LDA.w !od_fy : SEC : SBC.w #8 : STA.w !d_y
	BRA .put
.falling
	SEC : SBC.w #!FND_FALL
	STA.w !od_t                    ; (age - fall) * 6: the table's row
	ASL
	CLC : ADC.w !od_t
	ASL
	TAX
	LDA.l orbit_fn_fall+2,X
	STA.w !v_goku
	LDA.l orbit_fn_fall+4,X
	STA.w !od_t                    ; half size
	LDA.l orbit_fn_fall,X
	STA.w !od_q
	LDA.w !od_dx
	JSR death_round
	CLC : ADC.w !od_fx
	SEC : SBC.w !od_t
	STA.w !d_x
	LDA.w !od_dy
	JSR death_round
	CLC : ADC.w !od_fy
	SEC : SBC.w !od_t
	STA.w !d_y
.put
	LDA.w #!OV_GOKU|(1<<9)|!OA_PRI
	STA.w !d_ta
	STZ.w !d_big
	JMP ofx_put

; A16 = d (signed, |d| < 256), od_q = q (0.16) -> A16 = round(d q / 65536):
; half up for d >= 0; for d < 0, -round_half_down(|d| (q - 1) / 65536)
; (orbit-finale.mjs: the browser's Math.round(from + d u^2)).
death_round:
	CMP.w #$8000
	BCS .neg
	STA.w !od_m
	LDA.w !od_q
	JSR death_mul                  ; A16 = (|d| q + 32768) >> 16
	RTS
.neg
	EOR.w #$FFFF : INC
	STA.w !od_m
	LDA.w !od_q
	BEQ +
	DEC
+	JSR death_mul_down
	EOR.w #$FFFF : INC
	RTS

; od_m = m (< 256), A16 = q -> A16 = (m q + 32768) >> 16.
death_mul:
	JSR death_mq
	CLC : ADC.w #$0080
	XBA : AND.w #$00FF
	RTS

; od_m = m (< 256), A16 = q -> A16 = (m q + 32767) >> 16, which is
; ((m q >> 8) + 127 + (low byte of m q != 0)) >> 8.
death_mul_down:
	JSR death_mq
	CLC : ADC.w #127
	TAX
	LDA.w !od_lo
	AND.w #$00FF
	BEQ +
	INX
+	TXA
	XBA : AND.w #$00FF
	RTS

; A16 = q -> A16 = (m q) >> 8; od_lo's low byte = m q's low byte.
death_mq:
	STA.w !od_q2
	SEP #$20
	LDA.w !od_m
	STA.w $4202
	LDA.w !od_q2
	STA.w $4203                    ; m * q_lo
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	STA.w !od_lo
	SEP #$20
	LDA.w !od_q2+1
	STA.w $4203                    ; m * q_hi
	REP #$20
	NOP : NOP : NOP
	LDA.w !od_lo
	XBA : AND.w #$00FF
	CLC : ADC.w $4216              ; (m q) >> 8
	RTS
