; frieza.js introHero: in the temple exit (map 431) and the deck's scenes
; (map 195: core-*, depart, eighth) Goku is the browser's scripted follower,
; his back cell (row 3) at a scripted spot; the Tree vista keeps him on the
; cliff. Drawn through goku's goku_api_scripted every frame the scene shows
; him (it hides the native body for that frame; stopping releases it).
; Columns: 0 standing, the knee (38 base, 34 Super Saiyan) and the step
; before it; poses from frieza-staging.js (generated tables).

; Busy field frame (draws): the follower of this frame's scene, if any.
fz_follower:
	JSR fz_scene_kind
	BNE +
	RTS
+	LDA !fz_smap
	CMP $DC
	BEQ +
	RTS
+	JSR fz_scene_kind
	CMP.w #!FZS_TEMPLE_EXIT
	BEQ .temple
	LDA $DC
	CMP.w #195
	BNE .none
	JSR fz_scene_kind
	CMP.w #!FZS_CORE_ARRIVAL
	BEQ .arrival
	CMP.w #!FZS_CORE_CHARGE
	BCC .none
	CMP.w #!FZS_EIGHTH+1
	BCC .exterior
.none
	RTS
.temple
	; x = c.x - camera + 36 t, y = c.y - camera - 320 t, t = ((age-48)/112)^2
	JSR fz_camera                     ; the view camera (view-camera.js)
	LDA !fz_sage
	CMP.w #161
	BCC +
	LDA.w #160
+	ASL
	TAX
	LDA !fz_sx
	SEC
	SBC !fz_cam_x
	CLC
	ADC.l frieza_follow_temple_x,X
	STA !fz_t0
	LDA !fz_sy
	SEC
	SBC !fz_cam_y
	CLC
	ADC.l frieza_follow_temple_y,X
	STA !fz_t1
	; column: 0 below 40, the step before the knee below 48, then the knee
	LDA !fz_sage
	CMP.w #40
	BCC .stand
	CMP.w #48
	BCC .step
	BRA .knee
.arrival
	LDA !fz_sage
	CMP.w #85
	BCC +
	LDA.w #84
+	ASL
	TAX
	LDA.l frieza_follow_arrive_x,X
	STA !fz_t0
	LDA.l frieza_follow_arrive_y,X
	STA !fz_t1
	LDA !fz_sage
	CMP.w #8
	BCC .step
	BRA .knee
.exterior
	LDA.w #!FRIEZA_FOLLOW_REST_X
	STA !fz_t0
	LDA.w #!FRIEZA_FOLLOW_REST_Y
	STA !fz_t1
	JSR fz_scene_kind
	CMP.w #!FZS_CORE_ESCAPE
	BNE .knee
	; the escape: he launches upward from age 12
	LDA !fz_sage
	SEC
	SBC.w #12
	BCC .step
	CMP.w #!FRIEZA_FOLLOW_ESCAPE_N
	BCC +
	RTS                               ; off the picture
+	ASL
	TAX
	LDA.l frieza_follow_escape_y,X
	STA !fz_t1
	BRA .knee
.stand
	LDA.w #0
	BRA .show
.step
	LDA.w #37                         ; the knee's step (base 37, Super Saiyan 33)
	BRA .form
.knee
	LDA.w #38
.form
	PHA
	LDA.l !goku_form|$7E0000
	AND.w #$00FF
	BEQ +
	PLA
	SEC
	SBC.w #4                          ; Super Saiyan art: 34 / 33
	BRA .show
+	PLA
.show
	TAX                               ; column
	LDY.w #3                          ; row 3: his back
	LDA.l !goku_form|$7E0000
	AND.w #$0001                      ; sheet: base or Super Saiyan
	JSL goku_api_cell
	CMP.w #$FFFF
	BEQ +
	LDX !fz_t0
	LDY !fz_t1
	JSL goku_api_scripted
+	RTS
