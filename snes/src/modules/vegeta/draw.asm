; draw() of joch-trial.js: echoes, aura, Vegeta, beams, charge, shots,
; bursts, rocks and the clash, and the music cue. M16/X16, DB = $7E.
; Vegeta is OBJ (sprite.asm); every effect goes through the fx module
; (bind.asm), which draws nothing when it is absent.

vg_draw:
	JSR vg_active
	BCS +
	RTS
+	LDA !vg_flags
	AND.w #!VF_SPAWNED
	BNE +
	RTS
+	JSR vg_camera
	JSR vg_draw_echoes
	; pose
	JSR vg_pose
	STA.l !vs_s4                  ; frame
	LDA !vg_t0
	STA.l !vs_s5                  ; recoil dx
	LDA !vg_t1
	STA.l !vs_s6                  ; recoil dy
if defined("VEGETA_TEST")
	SEP #$20
	LDA.l !vs_s4
	STA.l !vs_log_pose
	LDA.l !vs_s5
	STA.l !vs_log_pose+1
	LDA.l !vs_s6
	STA.l !vs_log_pose+2
	REP #$20
endif
	; aura: the transformation, or a beam still charging
	SEP #$20
	LDA !vg_phase
	CMP.b #!VP_TRANSFORM
	REP #$20
	BNE +
	JMP .aura
+
	LDA !vg_act
	AND.w #$00FF
	CMP.w #!VA_BEAM
	BNE .noaura
	LDA.l !vs_beam_on
	AND.w #$00FF
	BNE .noaura
.aura
	JSR vg_aura_draw
.noaura
	; visible = phase != intro || arrival >= 12; vanishing = counter 8-11
	SEP #$20
	LDA !vg_phase
	CMP.b #!VP_INTRO
	BNE +
	LDA !vg_arrival
	CMP.b #12
	BCC .hidden8
+	LDA !vg_act
	CMP.b #!VA_COUNTER
	REP #$20
	BNE .show
	LDA !vg_act_age
	CMP.w #8
	BCC .show
	CMP.w #12
	BCS .show
	BRA .hidden
.hidden8
	REP #$20
.hidden
	BRA .effects
.show
	; flash: hurt > 0 and hurt & 2 -> white palette
	LDA !vg_hurt
	AND.w #$0002
	JSR vg_palette
	LDA.w #(!VEGETA_OBJ_PAL<<9)|(3<<12)
	STA.l !vs_draw_attr
	LDA !vg_facing
	AND.w #$00FF
	CMP.w #2
	BNE +
	LDA.w #(!VEGETA_OBJ_PAL<<9)|(3<<12)|$4000
	STA.l !vs_draw_attr
+	LDA.w #1
	STA.l !vs_draw_front
	LDA !vg_x
	CLC
	ADC.l !vs_s5
	TAX
	LDA !vg_y
	CLC
	ADC.l !vs_s6
	TAY
	LDA.l !vs_s4
	JSR vg_draw_body
.effects
	SEP #$20
	LDA !vg_clash_on
	REP #$20
	BEQ +
	JMP vg_draw_clash
+	LDA !vg_act
	AND.w #$00FF
	CMP.w #!VA_BEAM
	BNE +
	JSR vg_draw_beam
+	JSR vg_draw_shots
	JSR vg_draw_bursts
	JMP vg_draw_rocks

; Palette 4 = Vegeta's colours, or white (A != 0). Written every drawn frame.
vg_palette:
	CMP.w #$0000
	BEQ +
	LDA.w #1
+	JMP vg_write_palette

; Echoes: the guard cell where he stood before a teleport, for 18 frames,
; behind the natives. The browser draws every third pixel; the cartridge
; shows the cell on alternate frames.
vg_draw_echoes:
	LDA.w !core_tick&$FFFF
	AND.w #$0001
	BEQ +
	RTS
+	SEP #$20
	LDA !vg_echo_frame
	CMP.b #$FF
	REP #$20
	BNE +
	RTS
+	LDX.w #0
.loop
	LDA.l !vs_echoes+4,X
	CMP.w #$FFFF
	BEQ .next
	; only an echo whose cell is the one in the echo area
	LDA.l !vs_echoes+6,X
	AND.w #$00FF
	STA !vg_t2
	LDA !vg_echo_frame
	AND.w #$00FF
	CMP !vg_t2
	BNE .next
	PHX
	LDA.l !vs_echoes+7,X
	AND.w #$00FF
	XBA                            ; $40 -> $4000 (h flip)
	ORA.w #(!VEGETA_OBJ_PAL<<9)|(3<<12)
	STA.l !vs_draw_attr
	LDA.w #!VGB_E_TILE
	STA.l !vs_draw_tile
	LDA.w #0
	STA.l !vs_draw_front
	LDA.l !vs_echoes+2,X
	TAY
	LDA.l !vs_echoes,X
	TAX
	LDA !vg_t2
	JSR vg_draw_frame
	PLX
.next
	TXA
	CLC
	ADC.w #8
	TAX
	CPX.w #!VS_ECHOES*8
	BCC .loop
	RTS

; layer.aura(s.x, s.y - 20, age, {height 40, gold: tier, power}):
; transform: .35 + age/140; beam charge: .25 + .75 * age / windup.
vg_aura_draw:
	SEP #$20
	LDA !vg_phase
	CMP.b #!VP_TRANSFORM
	REP #$20
	BNE .charge
	; 256 * (.35 + age/140) = 89.6 + age * 256 / 140
	LDA !vg_phase_age
	STA.l !vs_s1                  ; clock = age
	XBA
	AND.w #$FF00
	LDX.w #140
	JSR vg_udiv16
	CLC
	ADC.w #90
	BRA .power
.charge
	; 256 * (.25 + .75 * age / windup) = 64 + age * 192 / windup
	LDA !vg_act_age
	STA.l !vs_s1                  ; clock = age
	LDX.w #192
	JSR vg_mul16
	LDX.w #110
	LDA !vg_tier
	AND.w #$0001
	BEQ +
	LDX.w #82
+	JSR vg_div32
	CLC
	ADC.w #64
.power
	CMP.w #257
	BCC +
	LDA.w #256
+	STA.l !vs_s0
	LDA !vg_y
	SEC
	SBC.w #20
	TAY
	LDX !vg_x
	JMP vb_fx_aura

; Galick Gun / Final Flash: the charge orb and four lane sparks, then the
; wave from his hands.
vg_draw_beam:
	JSR vg_act_dir
	LDA.l !vs_beam_on
	AND.w #$00FF
	BEQ .charging
	; giantBeam(origin, d, length, halfWidth, a.age >> 2, {taper, palette})
	LDA.l !vs_beam_half
	XBA
	AND.w #$00FF                   ; whole pixels
	STA.l !vs_s2
	JMP vb_fx_vegeta_beam
.charging
	; orb frame min(4, age >> 4) at the hands
	LDA !vg_act_age
	LSR : LSR : LSR : LSR
	CMP.w #5
	BCC +
	LDA.w #4
+	STA.l !vs_s2
	LDA.w #12
	JSR vg_lane_point
	JSR vb_fx_orb
	; sparks every 32 px from 40 to 136, frame (age >> 4) & 1
	LDA.w #40
.spark
	PHA
	JSR vg_lane_point
	LDA !vg_act_age
	LSR : LSR : LSR : LSR
	AND.w #$0001
	STA.l !vs_s2
	JSR vb_fx_spark
	PLA
	CLC
	ADC.w #32
	CMP.w #137
	BCC .spark
	RTS

; A = d: X/Y = (s.x + dx*d, s.y - 12 + dy*d) with the action's direction.
vg_lane_point:
	STA !vg_t3
	LDA.l !vs_s1
	JSR vg_times_t3
	CLC
	ADC !vg_y
	SEC
	SBC.w #12
	TAY
	LDA.l !vs_s0
	JSR vg_times_t3
	CLC
	ADC !vg_x
	TAX
	RTS

; Volley shots: the charge orb cell, frame (age >> 2) % 3.
vg_draw_shots:
	LDA.l !vs_live_shots
	AND.w #$00FF
	BNE +
	RTS
+	LDX.w #0
.loop
	SEP #$20
	LDA.l !vs_shots+7,X
	CMP.b #$FF
	REP #$20
	BEQ .next
	AND.w #$00FF
	CMP.w #95
	BCS .next
	LSR : LSR
	PHX
	LDX.w #3
	JSR vg_umod16
	PLX
	STA.l !vs_s2
	PHX
	LDA.l !vs_shots+2,X
	TAY
	LDA.l !vs_shots,X
	TAX
	LDA.w #0                       ; charge-orb group
	JSR vb_fx_cell
	PLX
.next
	TXA
	CLC
	ADC.w #8
	TAX
	CPX.w #!VS_SHOTS*8
	BCC .loop
	RTS

; Bursts: native Exploder frames min(6, age >> 2).
vg_draw_bursts:
	LDA.l !vs_live_bursts
	AND.w #$00FF
	BNE +
	RTS
+	LDX.w #0
.loop
	LDA.l !vs_bursts+4,X
	CMP.w #$FFFF
	BEQ .next
	LSR : LSR
	CMP.w #7
	BCC +
	LDA.w #6
+	STA.l !vs_s2
	PHX
	LDA.l !vs_bursts+2,X
	TAY
	LDA.l !vs_bursts,X
	TAX
	LDA.w #9                       ; exploder burst group
	JSR vb_fx_cell
	PLX
.next
	TXA
	CLC
	ADC.w #6
	TAX
	CPX.w #!VS_BURSTS*6
	BCC .loop
	RTS

; Rocks: a warning spark, then a falling ember until it lands at 62.
vg_draw_rocks:
	LDA.l !vs_live_rocks
	AND.w #$00FF
	BNE +
	RTS
+	LDX.w #0
.loop
	LDA.l !vs_rocks+4,X
	CMP.w #$FFFF
	BEQ .next
	CMP.w #62
	BCS .next
	CMP.w #42
	BCS .ember
	LSR : LSR : LSR
	AND.w #$0001
	STA.l !vs_s2
	PHX
	LDA.l !vs_rocks+2,X
	TAY
	LDA.l !vs_rocks,X
	TAX
	LDA.w #3                       ; impact-spark group
	JSR vb_fx_cell
	PLX
	BRA .next
.ember
	PHA
	LSR : LSR
	PHX
	LDX.w #3
	JSR vg_umod16
	PLX
	STA.l !vs_s2
	; y - (62 - age) * 5
	PLA
	EOR.w #$FFFF
	SEC
	ADC.w #62                      ; 62 - age
	STA !vg_t3
	ASL : ASL
	CLC
	ADC !vg_t3
	STA !vg_t3
	PHX
	LDA.l !vs_rocks+2,X
	SEC
	SBC !vg_t3
	TAY
	LDA.l !vs_rocks,X
	TAX
	LDA.w #10                      ; fireball ember group
	JSR vb_fx_cell
	PLX
.next
	TXA
	CLC
	ADC.w #6
	TAX
	CPX.w #!VS_ROCKS*6
	BCC .loop
	RTS

; drawTrainingClash: both waves from the hands to the collision ball, which
; pressure moves; the ball, its arcs and spark; the detonation in release.
vg_draw_clash:
	JSR vg_clash_point
	LDA.l !vc_total
	LSR : LSR
	STA.l !vs_s7                  ; phase = total >> 2
	; focused: lock 0, focus min(1, age/48), else 1 (8.8)
	LDA.l !vc_phase
	AND.w #$00FF
	BNE +
	LDA.w #0
	BRA .focused
+	CMP.w #!VC_FOCUS
	BNE +
	LDA.l !vc_age
	XBA
	AND.w #$FF00
	LDX.w #48
	JSR vg_udiv16
	CMP.w #256
	BCC .focused
+	LDA.w #256
.focused
	STA !vg_t2
	; width = round(opening - (opening - 12) * focused), opening = tier ? 80 : 54
	LDX.w #54-12
	LDA.l !vc_tier
	AND.w #$00FF
	BEQ +
	LDX.w #80-12
+	LDA !vg_t2
	JSR vg_mul16
	LDA !vm_a0
	CLC
	ADC.w #128
	XBA
	AND.w #$00FF
	STA !vg_t3
	LDA.l !vc_tier
	AND.w #$00FF
	BEQ +
	LDA.w #80
	BRA ++
+	LDA.w #54
++	SEC
	SBC !vg_t3
	STA.l !vs_s2                  ; width
	; tail = release ? clamp(1 - (age - 18)/36, 0, 1) : 1 (8.8)
	LDA.w #256
	STA.l !vs_s3
	LDA.l !vc_phase
	AND.w #$00FF
	CMP.w #!VC_RELEASE
	BNE .tailed
	LDA.l !vc_age
	SEC
	SBC.w #18
	BMI .tailed
	CMP.w #36
	BCC +
	LDA.w #0
	STA.l !vs_s3
	BRA .tailed
+	XBA
	AND.w #$FF00
	LDX.w #36
	JSR vg_udiv16
	EOR.w #$FFFF
	SEC
	ADC.w #256
	STA.l !vs_s3
.tailed
	; ball radius = round((lock ? 18 + age/3 : 30 + ((phase & 3) == 0 ? 2 : 0)) * tail)
	LDA.l !vc_phase
	AND.w #$00FF
	BNE .notLock
	LDA.l !vc_age
	INC
	LDX.w #3
	JSR vg_udiv16                  ; round(age / 3)
	CLC
	ADC.w #18
	BRA .base
.notLock
	LDA.l !vs_s7
	AND.w #$0003
	BNE +
	LDA.w #32
	BRA .base
+	LDA.w #30
.base
	STA !vg_t3
	LDA.l !vs_s3
	CMP.w #256
	BEQ +
	LDX !vg_t3
	JSR vg_mul16
	LDA !vm_a0
	CLC
	ADC.w #128
	XBA
	AND.w #$00FF
	STA !vg_t3
+	LDA.l !vs_s0
	STA.l !vs_ball_cx
	LDA.l !vs_s1
	STA.l !vs_ball_cy
	LDA !vg_t3
	JSR vg_draw_ball
	JSR vb_fx_clash
	RTS

; ---------------------------------------------------------------------------
; Music cue (frieza-score.js via mod.trial.music): 'vegeta' while the trial
; is active and Vegeta spawned, 'vegeta-full-power' at tier >= 1, in the
; transformation or a draw; native music otherwise.
vg_music:
	JSR vg_active
	BCS +
	LDA.w #0
	BRA .cue
+	LDA !vg_flags
	AND.w #!VF_SPAWNED
	BEQ .none
	LDA !vg_tier
	AND.w #$0001
	BNE .full
	SEP #$20
	LDA !vg_phase
	CMP.b #!VP_TRANSFORM
	REP #$20
	BEQ .full
	LDA !vg_flags
	AND.w #!VF_DRAW
	BNE .full
	LDA.w #1
	BRA .cue
.full
	LDA.w #2
	BRA .cue
.none
	LDA.w #0
.cue
	SEP #$20
	CMP !vg_music
	BEQ .same
	STA !vg_music
	REP #$20
	AND.w #$00FF
	JMP vb_song
.same
	REP #$20
	RTS
