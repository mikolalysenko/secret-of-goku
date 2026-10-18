; Cutscene effects (engine/frieza.js draw(), the scene branch), drawn
; through the fx module: the Death Ball on the deck, Fanha's end, the
; eruption under the deck, Popoi's end, the empowering orbs and auras.
; M16/X16, DB = $7E, D = 0. Without fx the wrappers draw nothing.
;
; Large bursts (orbit-effects.js burst(x, y, age, {large:true})): nine
; Exploder bursts four frames apart; burst i > 0 moves out along
; orbitVectors[(i * 6) & 15] to radius 8 + min(24, t). Each is an fx
; effect spawned at its start and moved every frame from a small table
; (fx's 14 slots bound how many show at once; the browser has no limit).

!FZB_N      = 12
!FZB        = !FZHB+$700              ; 12 x 8 bytes (SRAM, scene work)
!fzb_handle = 0                       ; word: fx handle, $FFFF free
!fzb_x      = 2                       ; word: map x of the large burst
!fzb_y      = 4                       ; word: map y
!fzb_it     = 6                       ; byte i (0-8), byte t (age)

; Forget the table (per-visit reset).
fz_lb_reset:
	LDX.w #(!FZB_N-1)*8
-	LDA.w #$FFFF
	STA.l !FZB+!fzb_handle,X
	TXA
	SEC
	SBC.w #8
	TAX
	BPL -
	RTS

; A large burst at map (!fz_ax, !fz_ay), A16 = its age: starts burst
; age / 4 when the age is a multiple of 4 below 36.
fz_lb_spawn:
	CMP.w #36
	BCS .out
	BIT.w #$0003
	BNE .out
	LSR
	LSR
	STA !fz_t6                        ; i
	; a free entry
	LDX.w #0
-	LDA.l !FZB+!fzb_handle,X
	CMP.w #$FFFF
	BEQ .found
	TXA
	CLC
	ADC.w #8
	TAX
	CPX.w #!FZB_N*8
	BCC -
.out
	RTS
.found
	STX !fz_t7
	LDA !fz_ax
	STA.l !FZB+!fzb_x,X
	LDA !fz_ay
	STA.l !FZB+!fzb_y,X
	LDA !fz_t6
	STA.l !FZB+!fzb_it,X              ; t = 0
	; burst 0 sits at the centre; the others start at radius 8
	LDY.w #0
	LDA !fz_t6
	BEQ +
	LDY.w #8
+	JSR fz_lb_offset                  ; -> !fz_t3, !fz_t4 (map position)
	LDA !fz_t6
	AND.w #$0003                      ; turn i & 3
	TAX
	LDA !fz_t6
	AND.w #$0001                      ; flip i & 1
	TAY
	LDA !fz_t3
	STA !fz_ax
	LDA !fz_t4
	STA !fz_ay
	JSR fz_fx_explode_turned          ; -> C clear, A = handle
	LDX !fz_t7
	BCC +
	LDA.w #$FFFF                      ; fx full: nothing to move
+	STA.l !FZB+!fzb_handle,X
	; restore the centre for the caller
	LDA.l !FZB+!fzb_x,X
	STA !fz_ax
	LDA.l !FZB+!fzb_y,X
	STA !fz_ay
	RTS

; Entry X (preserved), Y16 = radius (0-32) -> !fz_t3/!fz_t4 = map
; position of burst i (!fz_t6) at that radius: centre + (v * r) >> 8
; (frieza_lb_offsets, generated).
fz_lb_offset:
	PHX
	STY !fz_t5
	LDA !fz_t6                        ; i * 33 + r, two bytes each
	ASL
	ASL
	ASL
	ASL
	ASL
	CLC
	ADC !fz_t6
	CLC
	ADC !fz_t5
	ASL
	TAY
	TYX
	LDA.l frieza_lb_offsets,X
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	STA !fz_t3
	LDA.l frieza_lb_offsets+1,X
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	STA !fz_t4
	PLX
	LDA.l !FZB+!fzb_x,X
	CLC
	ADC !fz_t3
	STA !fz_t3
	LDA.l !FZB+!fzb_y,X
	CLC
	ADC !fz_t4
	STA !fz_t4
	RTS

; Every frame: age the tracked bursts, move the outgoing ones.
fz_lb_tick:
	LDX.w #0
.loop
	LDA.l !FZB+!fzb_handle,X
	CMP.w #$FFFF
	BEQ .next
	LDA.l !FZB+!fzb_it,X
	CLC
	ADC.w #$0100                      ; t + 1
	STA.l !FZB+!fzb_it,X
	XBA
	AND.w #$00FF
	CMP.w #42
	BCC +
	LDA.w #$FFFF                      ; its seven frames are over
	STA.l !FZB+!fzb_handle,X
	BRA .next
+	STA !fz_t5                        ; t
	LDA.l !FZB+!fzb_it,X
	AND.w #$00FF
	BEQ .next                         ; burst 0 does not move
	STA !fz_t6
	LDA !fz_t5
	CMP.w #24
	BCC +
	LDA.w #24
+	CLC
	ADC.w #8
	TAY                               ; r = 8 + min(24, t)
	STX !fz_t7
	JSR fz_lb_offset
	LDX !fz_t7
	LDA.l !FZB+!fzb_handle,X
	LDX !fz_t3
	LDY !fz_t4
	JSR fz_fx_move
	LDX !fz_t7
.next
	TXA
	CLC
	ADC.w #8
	TAX
	CPX.w #!FZB_N*8
	BCC .loop
	RTS

; ---------------------------------------------------------------------------
; The scene branch of draw(): effects of the current scene on its map.
fz_scene_effects:
	JSR fz_scene_kind
	BNE +
	RTS
+	LDA !fz_smap
	CMP $DC
	BEQ +
	RTS
+	JSR fz_scene_kind
	CMP.w #!FZS_CORE_CHARGE
	BNE +
	JMP fz_fx_core_ball
+	CMP.w #!FZS_CORE_SHOT
	BNE +
	JMP fz_fx_core_ball
+	CMP.w #!FZS_CORE_IMPACT
	BNE +
	JMP fz_fx_core_impact
+	CMP.w #!FZS_FANHA
	BNE +
	JMP fz_fx_fanha
+	CMP.w #!FZS_EMPOWER
	BNE +
	JMP fz_fx_empower
+	CMP.w #!FZS_EXPLODE
	BNE +
	JMP fz_fx_popoi
+	CMP.w #!FZS_GOLD
	BNE +
	JMP fz_fx_gold
+	CMP.w #!FZS_EIGHTH
	BNE +
	JMP fz_balls_eighth
+	RTS

; core-charge / core-shot: friezaDeathBallPose (tables from the generator);
; Frieza's pose (!fz_px/!fz_py) was evaluated by fz_draw_scene.
fz_fx_core_ball:
	JSR fz_scene_clock
	LSR
	LSR
	LSR                               ; floor(clock / 8)
	LDX.w #12
	JSR fz_divmod                     ; A16 = remainder
	STA !fz_t2                        ; art frame (0-11)
	JSR fz_scene_kind
	CMP.w #!FZS_CORE_SHOT
	BEQ .shot
	; charge: above his hand, growing from 64 to 224 px
	LDA !fz_sage
	CMP.w #145
	BCC +
	LDA.w #144
+	TAX
	LDA.l frieza_core_charge_size,X
	AND.w #$00FF
	STA !fz_t1                        ; diameter
	LSR
	CLC
	ADC.w #52
	EOR.w #$FFFF
	SEC
	ADC !fz_py                        ; y = p.y - (52 + diameter / 2)
	TAY
	LDX !fz_px
	BRA .draw
.shot
	LDA !fz_sage
	CMP.w #!FRIEZA_CORE_SHOT_LEN
	BCC +
	RTS                               ; it plunged below the picture
+	TAX
	LDA.l frieza_core_shot_size,X
	AND.w #$00FF
	STA !fz_t1
	LDA.l frieza_core_shot_x,X
	AND.w #$00FF
	STA !fz_t0
	TXA
	ASL
	TAX
	; y by the hover bob of the throw pose (p.y = 145 + bob)
	LDA !fz_py
	SEC
	SBC.w #145
	BEQ .bob0
	BMI .bobm
	LDA.l frieza_core_shot_y2,X
	BRA +
.bobm
	LDA.l frieza_core_shot_y0,X
	BRA +
.bob0
	LDA.l frieza_core_shot_y1,X
+	TAY
	LDX !fz_t0
.draw
	LDA !fz_t1
	PHA
	LDA !fz_t2
	STA !fz_t3
	PLA
	JMP fz_fx_deathball_screen        ; A = diameter, X/Y = screen, !fz_t3 = frame

; core-impact: a rising column of large bursts rooted below the screen,
; 12 frames apart, each 74 frames (coreTiming.eruption = 50).
fz_fx_core_impact:
	LDA !fz_sage
	SEC
	SBC.w #!FRIEZA_CORE_ERUPTION
	BPL +
	RTS
+	STA !fz_t0                        ; t
	JSR fz_camera
	LDX.w #0
-	LDA !fz_t0
	SEC
	SBC.l fz_core_column_t,X
	BMI +
	CMP.w #74
	BCS +
	PHX
	PHA
	LDA.l fz_core_column_x,X
	CLC
	ADC !fz_cam_x
	STA !fz_ax
	LDA.l fz_core_column_y,X
	CLC
	ADC !fz_cam_y
	STA !fz_ay
	PLA
	JSR fz_lb_spawn
	PLX
+	INX
	INX
	CPX.w #7*2
	BCC -
	RTS
fz_core_column_t:
	dw 0, 12, 24, 36, 48, 60, 72
fz_core_column_x:
	dw 80, 65, 94, 80, 55, 105, 80
fz_core_column_y:
	dw 238, 217, 214, 186, 178, 170, 145

; fanha-finish: Frieza's beam from off the right edge to Fanha (24 frames),
; then a large burst on him from age 12 to 72.
fz_fx_fanha:
	LDA !fz_sflags
	AND.w #!FZSF_TARGET
	BNE +
	RTS
+	LDA !fz_sage
	CMP.w #24
	BCS .burst
	JSR fz_camera
	; target on the screen: (x, y - 20)
	LDA !fz_stx
	SEC
	SBC !fz_cam_x
	STA !fz_t0
	LDA !fz_sty
	SEC
	SBC.w #20
	SEC
	SBC !fz_cam_y
	STA !fz_t1
	; from (280, -16)
	LDA !fz_t0
	SEC
	SBC.w #280
	STA !fz_t2                        ; dx
	LDA !fz_t1
	CLC
	ADC.w #16
	STA !fz_t3                        ; dy
	LDA !fz_t2
	LDX !fz_t3
	JSR fz_dist2
	JSR fz_isqrt_round                ; length = round(hypot)
	CMP.w #360
	BCC +
	LDA.w #360
+	STA !fz_t5
	LDA !fz_t2
	LDX !fz_t3
	JSR fz_atan2
	XBA
	AND.w #$00FF
	TAX
	LDA.l frieza_heading_table,X
	AND.w #$00FF
	STA !fz_t4                        ; orbitHeading
	LDA !fz_sage
	STA !fz_t6
	JSR fz_fx_fire_beam               ; origin (280,-16), heading !fz_t4, length !fz_t5, age !fz_t6
.burst
	LDA !fz_sage
	SEC
	SBC.w #12
	BPL +
	RTS
+	PHA
	LDA !fz_stx
	STA !fz_ax
	LDA !fz_sty
	SEC
	SBC.w #20
	STA !fz_ay
	PLA
	JMP fz_lb_spawn

; explode: a large burst on Popoi (age < 74).
fz_fx_popoi:
	LDA !fz_sflags
	AND.w #!FZSF_TARGET
	BNE +
	RTS
+	LDA !fz_stx
	STA !fz_ax
	LDA !fz_sty
	STA !fz_ay
	LDA !fz_sage
	JMP fz_lb_spawn

; empower: three pink charge orbs travel from his hand to Thanatos (72
; frames each, 24 apart), then the pink aura on him (ages 72-139).
fz_fx_empower:
	LDA !fz_sflags
	AND.w #!FZSF_TARGET
	BNE +
	RTS
+	LDA !fz_sage
	CMP.w #140
	BCC +
	RTS
+	JSR fz_camera
	LDA !fz_stx
	SEC
	SBC !fz_cam_x
	STA !fz_t4                        ; tx (screen)
	LDA !fz_sty
	SEC
	SBC !fz_cam_y
	STA !fz_t5                        ; ty
	LDX.w #0
.orb
	STX !fz_t6
	TXA
	ASL
	ASL
	ASL
	STA !fz_t7
	ASL
	CLC
	ADC !fz_t7                        ; i * 24
	EOR.w #$FFFF
	SEC
	ADC !fz_sage                      ; travel = age - i * 24
	BMI .nextorb
	CMP.w #72
	BCS .nextorb
	STA !fz_t7
	; px = x - 8 + (tx - x + 8) * travel / 72
	LDA !fz_px
	SEC
	SBC.w #8
	STA !fz_t0
	LDA !fz_t4
	SEC
	SBC !fz_t0
	JSR fz_lerp72                     ; A16 = delta * travel / 72 (signed)
	CLC
	ADC !fz_t0
	STA !fz_ax
	; py = y - 20 + (ty - y + 20) * travel / 72
	LDA !fz_py
	SEC
	SBC.w #20
	STA !fz_t0
	LDA !fz_t5
	SEC
	SBC !fz_t0
	JSR fz_lerp72
	CLC
	ADC !fz_t0
	STA !fz_ay
	JSR fz_fx_pink_orb_screen
.nextorb
	LDX !fz_t6
	INX
	CPX.w #3
	BCC .orb
	; the aura on Thanatos
	LDA !fz_sage
	SEC
	SBC.w #72
	BPL +
	RTS
+	STA !fz_t3                        ; clock
	LDA !fz_t4
	STA !fz_ax
	LDA !fz_t5
	STA !fz_ay
	LDA.w #2                          ; pink
	LDX.w #179                        ; power .7
	LDY.w #32                         ; body height
	JMP fz_fx_aura_screen

; gold: Goku's permanent form arrives, his aura over 28 frames.
fz_fx_gold:
	JSR fz_camera
	LDA !fz_sx
	SEC
	SBC !fz_cam_x
	STA !fz_ax
	LDA !fz_sy
	SEC
	SBC.w #16
	SEC
	SBC !fz_cam_y
	STA !fz_ay
	LDA !fz_sage
	STA !fz_t3                        ; clock
	CMP.w #28
	BCC +
	LDX.w #256
	BRA ++
+	XBA                               ; age * 256 / 28
	AND.w #$FF00
	LDX.w #28
	JSR fz_divmod
	LDX !fz_m5                        ; quotient
++	LDA.w #1                          ; gold
	LDY.w #32
	JMP fz_fx_aura_screen

; A16 = signed delta, !fz_t7 = travel (0-71) -> A16 = delta * travel / 72,
; rounded as the browser's Math.round of the sum (to nearest, halves up).
fz_lerp72:
	STA !fz_m6
	JSR fz_abs
	STA !fz_m0
	LDA !fz_t7
	STA !fz_m1
	JSR fz_mul16                      ; |delta| * travel (< 65536)
	LDA !fz_m2
	LDX.w #72
	JSR fz_divmod                     ; A16 = remainder, !fz_m5 = quotient
	ASL                               ; 2r
	LDX !fz_m6
	BMI .neg
	CMP.w #72                         ; frac >= .5 rounds up
	LDA !fz_m5
	ADC.w #0
	RTS
.neg
	; round(-(q + f)) = -(q + (f > .5))
	CMP.w #73
	LDA !fz_m5
	ADC.w #0
	EOR.w #$FFFF
	INC
	RTS

; A16 = round(sqrt(!fz_m7:!fz_m6)) for values below 2^22 (binary search;
; uses !fz_m0-!fz_m5 and !fz_t7).
fz_isqrt_round:
	LDA.w #0
	STA !fz_t7                        ; lo: lo^2 <= d2
	LDA.w #2048
	STA !fz_m5                        ; hi: hi^2 > d2
.loop
	LDA !fz_m5
	SEC
	SBC !fz_t7
	CMP.w #2
	BCC .done
	LDA !fz_t7
	CLC
	ADC !fz_m5
	LSR
	PHA                               ; mid
	STA !fz_m0
	STA !fz_m1
	JSR fz_mul16                      ; m3:m2 = mid^2
	LDA !fz_m7
	CMP !fz_m3
	BNE +
	LDA !fz_m6
	CMP !fz_m2
+	PLA                               ; C: d2 >= mid^2 (PLA keeps C)
	BCC .high
	STA !fz_t7
	BRA .loop
.high
	STA !fz_m5
	BRA .loop
.done
	; round half up: r + 1 when d2 - r^2 > r
	LDA !fz_t7
	STA !fz_m0
	STA !fz_m1
	JSR fz_mul16
	LDA !fz_m6
	SEC
	SBC !fz_m2                        ; d2 - r^2 (< 2r + 1)
	CMP !fz_t7
	BEQ +
	BCC +
	LDA !fz_t7
	INC
	RTS
+	LDA !fz_t7
	RTS
