; Vegeta's fight (joch-trial.js tick() after the intro, begin, step,
; pickSpot, teleport, receive, finish, updateAttack, impactWall, burst,
; recover, hit). M16/X16, DB = $7E.

; ---------------------------------------------------------------------------
; The live part of tick(): battle, transform, draw, clash.
vg_tick_live:
	; "Super Saiyan already?" once, if Goku transforms before Vegeta does
	SEP #$20
	LDA !vg_phase
	CMP.b #!VP_BATTLE
	BNE +
	LDA !vg_tier
	BNE +
	LDA !vg_flags
	BMI +
	REP #$20
	JSR vb_goku_ssj
	SEP #$20
	BCC +
	LDA.b #!VF_EARLY_SSJ
	TSB !vg_flags
	REP #$20
	LDA.w #!VMSG_EARLY_SSJ
	JSR vb_interrupt
+	REP #$20
	INC !vg_age
	LDA !vg_grace
	BEQ +
	DEC !vg_grace
+	SEP #$20
	LDA !vg_hurt
	BEQ +
	DEC !vg_hurt
+	REP #$20
	JSR vg_age_echoes
	JSR vg_age_bursts
	SEP #$20
	LDA !vg_clash_on
	REP #$20
	BEQ +
	JMP vg_update_clash
+	SEP #$20
	LDA !vg_phase
	CMP.b #!VP_TRANSFORM
	REP #$20
	BNE +
	JMP vg_tick_transform
+	SEP #$20
	LDA !vg_phase
	CMP.b #!VP_DRAW
	REP #$20
	BNE +
	JMP vg_tick_draw
+	JSR vg_update_shots
	JSR vg_update_rocks
	SEP #$20
	LDA !vg_act
	REP #$20
	BEQ +
	JMP vg_update_attack
+	DEC !vg_clock
	BEQ .begin
	BPL .footwork
.begin
	; begin(['rush','volley','beam','counter','beam'][cycle++ % 5])
	SEP #$20
	LDA !vg_cycle
	INC !vg_cycle
	REP #$20
	AND.w #$00FF
	LDX.w #5
	JSR vg_umod16
	TAX
	LDA.l vg_cycle_kinds,X
	AND.w #$00FF
	JMP vg_begin
.footwork
	JSR vg_face_hero
	; distance > 180 and clock < 45: close in with a readable dash
	LDA !vg_clock
	CMP.w #45
	BMI +
	RTS
+	JSR vg_hero_dist2
	CMP.w #180*180+1
	BCC +
	LDA.w #!VA_RUSH
	JMP vg_begin
+	LDA !vg_age
	AND.w #$0001
	BEQ +
	RTS
+	JSR vg_hero_dist2
	STA.l !vs_s2
	LDA !vg_facing
	AND.w #$0003
	ASL
	TAX
	LDA.l vg_dir_dx,X
	STA.l !vs_s0                  ; dX
	LDA.l vg_dir_dy,X
	STA.l !vs_s1                  ; dY
	LDY.w #2
	LDA !vg_tier
	AND.w #$0001
	BEQ +
	LDY.w #3
+	LDA.l !vs_s2
	CMP.w #105*105+1
	BCC .near
	; advance
	LDA.l !vs_s0
	LDX.w #0
	JMP vg_step_dir
.near
	CMP.w #55*55
	BCS .side
	; back away
	LDA.l !vs_s0
	EOR.w #$FFFF
	INC
	STA.l !vs_s0
	LDA.l !vs_s1
	EOR.w #$FFFF
	INC
	STA.l !vs_s1
	JMP vg_step_dir
.side
	; sidestep (Super Saiyan only, every fourth frame): step(dY, -dX, 2)
	LDA !vg_tier
	AND.w #$0001
	BNE +
	RTS
+	LDA !vg_age
	AND.w #$0003
	BEQ +
	RTS
+	LDA.l !vs_s0
	EOR.w #$FFFF
	INC
	PHA
	LDA.l !vs_s1
	STA.l !vs_s0
	PLA
	STA.l !vs_s1
	LDY.w #2
	JMP vg_step_dir
vg_cycle_kinds:
	db !VA_RUSH, !VA_VOLLEY, !VA_BEAM, !VA_COUNTER, !VA_BEAM

; A = dx*dx + dy*dy from Vegeta to Goku (saturated).
vg_hero_dist2:
	LDA.l $7EE004
	SEC
	SBC !vg_y
	TAX
	LDA.l $7EE002
	SEC
	SBC !vg_x
	JMP vg_dist2

; step(!vs_s0, !vs_s1, Y = speed); C set if every pixel moved.
vg_step_dir:
	TYA
	STA.l !vs_s3
.pixel
	LDA.l !vs_s3
	BNE +
	SEC
	RTS
+	DEC
	STA.l !vs_s3
	LDA !vg_y
	CLC
	ADC.l !vs_s1
	TAX
	LDA !vg_x
	CLC
	ADC.l !vs_s0
	JSR vg_safe
	BCS +
	RTS                           ; C clear: blocked
+	STA !vg_t3                    ; (vg_safe preserves X; recompute x)
	LDA !vg_x
	CLC
	ADC.l !vs_s0
	STA !vg_x
	STX !vg_y
	; travel += |dx| + |dy|; movingUntil = age + 3
	LDA.l !vs_s0
	JSR vg_abs
	STA !vg_t3
	LDA.l !vs_s1
	JSR vg_abs
	CLC
	ADC !vg_t3
	CLC
	ADC !vg_travel
	STA !vg_travel
	LDA !vg_age
	CLC
	ADC.w #3
	STA !vg_moving_until
	; backstep = dx*fx + dy*fy <= 0 (facing vector)
	LDA !vg_facing
	AND.w #$0003
	ASL
	TAX
	LDA.l vg_dir_dx,X
	JSR vg_mul_sign_s0
	STA !vg_t3
	LDA.l vg_dir_dy,X
	JSR vg_mul_sign_s1
	CLC
	ADC !vg_t3
	SEP #$20
	STZ !vg_backstep
	BEQ +
	BPL ++
+	INC !vg_backstep
++	REP #$20
	JMP .pixel

; A (-1/0/1) * !vs_s0 (or !vs_s1) for small values.
vg_mul_sign_s0:
	CMP.w #$0000
	BEQ .z
	BMI .n
	LDA.l !vs_s0
	RTS
.n
	LDA.l !vs_s0
	EOR.w #$FFFF
	INC
	RTS
.z
	RTS
vg_mul_sign_s1:
	CMP.w #$0000
	BEQ .z
	BMI .n
	LDA.l !vs_s1
	RTS
.n
	LDA.l !vs_s1
	EOR.w #$FFFF
	INC
	RTS
.z
	RTS

; ---------------------------------------------------------------------------
; begin(kind): A = !VA_*.
vg_begin:
	SEP #$20
	STA !vg_act
	REP #$20
	JSR vg_face_hero
	LDA !vg_facing
	AND.w #$0003
	ASL
	TAX
	SEP #$20
	LDA.l vg_dir_dx,X
	STA !vg_act_dx
	LDA.l vg_dir_dy,X
	STA !vg_act_dy
	LDA.b #$00
	STA.l !vs_beam_on
	REP #$20
	STZ !vg_act_age
	LDA !vg_x
	STA !vg_act_x
	LDA !vg_y
	STA !vg_act_y
	LDA.l $7EE002
	STA.l !vs_tx
	LDA.l $7EE004
	STA.l !vs_ty
	LDA.w #$FFFF
	STA !vg_contact
	LDA !vg_act
	AND.w #$00FF
	CMP.w #!VA_BEAM
	BEQ .charge
	CMP.w #!VA_VOLLEY
	BNE .notcharge
.charge
	LDA.w #!VSFX_CHARGED
	JSR vb_sfx
	LDA !vg_act
	AND.w #$00FF
	CMP.w #!VA_BEAM
	BNE .done
	LDA !vg_tier
	AND.w #$0001
	BEQ .done
	LDA.w #!VMSG_FINAL_FLASH
	JMP vb_say
.notcharge
	CMP.w #!VA_COUNTER
	BNE .done
	SEP #$20
	LDA.l !vs_counters
	INC
	STA.l !vs_counters
	REP #$20
	LDA.w #!VSFX_TELEPORT
	JMP vb_sfx
.done
	RTS

; recover(frames): A = frames.
vg_recover:
	STA !vg_clock
	SEP #$20
	STZ !vg_act
	LDA.b #$00
	STA.l !vs_beam_on
	REP #$20
	RTS

; ---------------------------------------------------------------------------
; burst(x, y, loud): A = x, X = y, Y = 1 loud (impact sound, pulse 8).
vg_burst:
	PHY
	PHA
	TXA
	SEC
	SBC.w #10
	STA !vg_t3
	PLA
	PHA
	LDX.w #0
.find
	LDA.l !vs_bursts+4,X
	CMP.w #$FFFF
	BEQ .slot
	TXA
	CLC
	ADC.w #6
	TAX
	CPX.w #!VS_BURSTS*6
	BCC .find
	PLA                           ; full: drop the oldest-looking (rare)
	BRA .sound
.slot
	PLA
	STA.l !vs_bursts,X
	LDA !vg_t3
	STA.l !vs_bursts+2,X
	LDA.w #$0000
	STA.l !vs_bursts+4,X
	JSR vb_burst_spawn             ; X = record offset
.sound
	PLY
	CPY.w #$0000
	BEQ +
	LDA.w #!VSFX_IMPACT
	JSR vb_sfx
	LDA.w #8
	JSR vb_pulse
+	RTS

vg_age_bursts:
	LDX.w #0
.loop
	LDA.l !vs_bursts+4,X
	CMP.w #$FFFF
	BEQ .next
	INC
	CMP.w #28
	BCC +
	LDA.w #$FFFF
+	STA.l !vs_bursts+4,X
.next
	TXA
	CLC
	ADC.w #6
	TAX
	CPX.w #!VS_BURSTS*6
	BCC .loop
	RTS

vg_age_echoes:
	LDX.w #0
.loop
	LDA.l !vs_echoes+4,X
	CMP.w #$FFFF
	BEQ .next
	INC
	CMP.w #18
	BCC +
	LDA.w #$FFFF
+	STA.l !vs_echoes+4,X
.next
	TXA
	CLC
	ADC.w #8
	TAX
	CPX.w #!VS_ECHOES*8
	BCC .loop
	RTS

; ---------------------------------------------------------------------------
; teleport(): an echo where he stood, then the farthest framed spot.
vg_teleport:
	LDX.w #0
.find
	LDA.l !vs_echoes+4,X
	CMP.w #$FFFF
	BEQ .slot
	TXA
	CLC
	ADC.w #8
	TAX
	CPX.w #!VS_ECHOES*8
	BCC .find
	LDX.w #0                      ; all live: reuse the first
.slot
	LDA !vg_x
	STA.l !vs_echoes,X
	LDA !vg_y
	STA.l !vs_echoes+2,X
	LDA.w #$0000
	STA.l !vs_echoes+4,X
	LDA !vg_tier
	AND.w #$0001
	ASL : ASL : ASL
	INC
	SEP #$20
	STA.l !vs_echoes+6,X
	STA !vg_echo_want              ; its cell for the echo VRAM area
	LDA !vg_facing
	CMP.b #2
	BEQ .flip
	LDA.b #$00
	BRA +
.flip
	LDA.b #$40                    ; OAM horizontal flip
+	STA.l !vs_echoes+7,X
	REP #$20
	JSR vg_pick_spot
	LDA.w #!VSFX_TELEPORT_IN
	JMP vb_sfx

; pickSpot(112): the candidate farthest from Vegeta among those framed
; between the dialogue and the HUD (else among all); unchanged if none.
; Candidates in the browser's order (down, right, left, up x 112, 86, 56);
; the first of equal distances wins (stable sort).
vg_pick_spot:
	LDA.w #$FFFF
	STA.l !vs_p_fd                ; best framed d ($FFFF none)
	STA.l !vs_p_ad                ; best of all d
	LDA.l $7EE002
	SEC
	SBC.l $7EE020
	STA.l !vs_p_cx                ; camera = Goku - his screen position
	LDA.l $7EE004
	SEC
	SBC.l $7EE022
	STA.l !vs_p_cy
	LDA.w #$0000
	STA.l !vs_p_dir
.dir
	LDA.w #$0000
	STA.l !vs_p_dist
.dist
	LDA.l !vs_p_dist
	TAX
	LDA.l vg_spot_d,X
	STA !vg_t3
	LDA.l !vs_p_dir
	TAX
	LDA.l vg_dir_dx,X
	JSR vg_times_t3
	CLC
	ADC.l $7EE002
	STA.l !vs_s0                  ; x
	LDA.l vg_dir_dy,X
	JSR vg_times_t3
	CLC
	ADC.l $7EE004
	STA.l !vs_s1                  ; y
	TAX
	LDA.l !vs_s0
	JSR vg_safe
	BCS +
	JMP .skip
+
	; d = |x - s.x| + |y - s.y|
	LDA.l !vs_s0
	SEC
	SBC !vg_x
	JSR vg_abs
	STA !vg_t3
	LDA.l !vs_s1
	SEC
	SBC !vg_y
	JSR vg_abs
	CLC
	ADC !vg_t3
	STA.l !vs_s2
	LDA.l !vs_p_ad
	CMP.w #$FFFF
	BEQ .takeAny
	LDA.l !vs_s2
	CMP.l !vs_p_ad
	BEQ .framed
	BCC .framed
.takeAny
	LDA.l !vs_s2
	STA.l !vs_p_ad
	LDA.l !vs_s0
	STA.l !vs_p_ax
	LDA.l !vs_s1
	STA.l !vs_p_ay
.framed
	; x - camX in [28, 228], y - camY in [104, 184]
	LDA.l !vs_s0
	SEC
	SBC.l !vs_p_cx
	SEC
	SBC.w #28
	CMP.w #228-28+1
	BCS .skip
	LDA.l !vs_s1
	SEC
	SBC.l !vs_p_cy
	SEC
	SBC.w #104
	CMP.w #184-104+1
	BCS .skip
	LDA.l !vs_p_fd
	CMP.w #$FFFF
	BEQ .takeFramed
	LDA.l !vs_s2
	CMP.l !vs_p_fd
	BEQ .skip
	BCC .skip
.takeFramed
	LDA.l !vs_s2
	STA.l !vs_p_fd
	LDA.l !vs_s0
	STA.l !vs_p_fx
	LDA.l !vs_s1
	STA.l !vs_p_fy
.skip
	LDA.l !vs_p_dist
	INC
	INC
	STA.l !vs_p_dist
	CMP.w #6
	BCS +
	JMP .dist
+	LDA.l !vs_p_dir
	INC
	INC
	STA.l !vs_p_dir
	CMP.w #8
	BCS +
	JMP .dir
+	LDA.l !vs_p_fd
	CMP.w #$FFFF
	BEQ .any
	LDA.l !vs_p_fx
	STA !vg_x
	LDA.l !vs_p_fy
	STA !vg_y
	RTS
.any
	LDA.l !vs_p_ad
	CMP.w #$FFFF
	BEQ .none
	LDA.l !vs_p_ax
	STA !vg_x
	LDA.l !vs_p_ay
	STA !vg_y
.none
	RTS
vg_spot_d:
	dw 112, 86, 56

; A (-1/0/1) * !vg_t3.
vg_times_t3:
	CMP.w #$0000
	BEQ .z
	BMI .n
	LDA !vg_t3
	RTS
.n
	LDA !vg_t3
	EOR.w #$FFFF
	INC
	RTS
.z
	RTS

; ---------------------------------------------------------------------------
; receive(amount): A = amount. Sparring: never lethal; a lethal blow ends
; the match (finish(false)) and the native trial exit runs.
vg_receive:
	STA.l !vs_s0
	LDA !vg_grace
	BNE .no
	LDA.l $7EE182
	BEQ .no
	LDA.l $7EE191
	AND.w #$0080
	BNE .no
	LDA.l $7EE1F1
	BNE .no
	LDA.l $7EE1B0
	AND.w #$1000
	BNE .no
	; damage = round(amount * (Super Saiyan ? .6 : 1))
	JSR vb_goku_ssj
	LDA.l !vs_s0
	BCC +
	LDX.w #3
	LDY.w #5
	JSR vg_scale
+	STA.l !vs_s0
	; queue min(damage, max(0, hp - 1)) from attacker slot 3
	LDA.l $7EE182
	DEC
	CMP.l !vs_s0
	BCC +
	LDA.l !vs_s0
+	STA.l $7EE1F1
	SEP #$20
	LDA.b #$03
	STA.l $7EE1F0
	REP #$20
	LDA.w #65
	STA !vg_grace
	LDA.l $7EE004
	TAX
	LDA.l $7EE002
	LDY.w #1
	JSR vg_burst
	LDA.l !vs_s0
	CMP.l $7EE182
	BCC .no
	LDA.w #0
	JMP vg_finish
.no
	RTS

; finish(draw): A = 1 draw, 0 Goku needs a break.
vg_finish:
	SEP #$20
	PHA
	LDA.b #!VP_DRAW
	STA !vg_phase
	LDA.b #!VF_DRAW
	TRB !vg_flags
	PLA
	BEQ +
	LDA.b #!VF_DRAW
	TSB !vg_flags
+	STZ !vg_act
	STZ !vg_clash_on
	LDA.b #$00
	STA.l !vs_beam_on
	REP #$20
	STZ !vg_phase_age
	LDA !vg_hp
	BNE +
	INC !vg_hp
+	JSR vg_clear_shots
	JSR vg_clear_rocks
	LDA.w #999
	STA !vg_grace
	RTS

; impactWall(x, y): A = x, X = y.
vg_impact_wall:
	LDY.w #1
	JSR vg_burst
	; fewer than four live rocks: two warned fragments beside Goku
	LDX.w #0
	STZ !vg_t3
-	LDA.l !vs_rocks+4,X
	CMP.w #$FFFF
	BEQ +
	INC !vg_t3
+	TXA
	CLC
	ADC.w #6
	TAX
	CPX.w #!VS_ROCKS*6
	BCC -
	LDA !vg_t3
	CMP.w #4
	BCC +
	RTS
+	LDA.w #-32
	JSR vg_add_rock
	LDA.w #32
	JSR vg_add_rock
	SEP #$20
	LDA !vg_quips
	INC !vg_quips
	REP #$20
	AND.w #$00FF
	BEQ +
	RTS
+	LDA.w #!VMSG_DOORWAY
	JMP vb_say

; A = dx: a rock at (hero x + dx, hero y) if that spot is safe.
vg_add_rock:
	CLC
	ADC.l $7EE002
	STA.l !vs_s0
	LDA.l $7EE004
	TAX
	LDA.l !vs_s0
	JSR vg_safe
	BCS +
	RTS
+	LDX.w #0
-	LDA.l !vs_rocks+4,X
	CMP.w #$FFFF
	BEQ .slot
	TXA
	CLC
	ADC.w #6
	TAX
	CPX.w #!VS_ROCKS*6
	BCC -
	RTS
.slot
	LDA.l !vs_s0
	STA.l !vs_rocks,X
	LDA.l $7EE004
	STA.l !vs_rocks+2,X
	LDA.w #$0000
	STA.l !vs_rocks+4,X
	RTS

vg_update_rocks:
	LDX.w #0
.loop
	LDA.l !vs_rocks+4,X
	CMP.w #$FFFF
	BEQ .next
	INC
	STA.l !vs_rocks+4,X
	CMP.w #62
	BNE .alive
	PHX
	LDA.l !vs_rocks+2,X
	PHA
	LDA.l !vs_rocks,X
	PLX
	LDY.w #1
	JSR vg_burst
	PLX
	PHX
	; within 16 of Goku: hit
	LDA.l $7EE004
	SEC
	SBC.l !vs_rocks+2,X
	PHA
	LDA.l $7EE002
	SEC
	SBC.l !vs_rocks,X
	PLX
	JSR vg_dist2
	CMP.w #16*16
	BCS +
	LDA.w #110
	JSR vg_receive
+	PLX
	LDA.l !vs_rocks+4,X
.alive
	CMP.w #85
	BCC .next
	LDA.w #$FFFF
	STA.l !vs_rocks+4,X
.next
	TXA
	CLC
	ADC.w #6
	TAX
	CPX.w #!VS_ROCKS*6
	BCC .loop
	RTS

; ---------------------------------------------------------------------------
; Volley shots: whole-pixel steps in one of eight directions, no homing.
vg_update_shots:
	LDX.w #0
.loop
	SEP #$20
	LDA.l !vs_shots+7,X
	CMP.b #$FF
	REP #$20
	BNE +
	JMP .next
+	; old position
	LDA.l !vs_shots,X
	STA.l !vs_s0
	LDA.l !vs_shots+2,X
	STA.l !vs_s1
	; x += dx*speed, y += dy*speed, age++
	LDA.l !vs_shots+6,X
	AND.w #$00FF
	STA !vg_t3                    ; speed
	LDA.l !vs_shots+4,X
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	JSR vg_times_t3
	CLC
	ADC.l !vs_shots,X
	STA.l !vs_shots,X
	LDA.l !vs_shots+5,X
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	JSR vg_times_t3
	CLC
	ADC.l !vs_shots+2,X
	STA.l !vs_shots+2,X
	SEP #$20
	LDA.l !vs_shots+7,X
	INC
	STA.l !vs_shots+7,X
	REP #$20
	; a Kamehameha cancels it
	PHX
	JSR vb_beam_touches_shot
	PLX
	BCC .nocancel
	SEP #$20
	LDA.b #200
	STA.l !vs_shots+7,X
	REP #$20
	PHX
	LDA.l !vs_shots+2,X
	PHA
	LDA.l !vs_shots,X
	PLX
	LDY.w #0
	JSR vg_burst
	LDA.w #!VSFX_DEFLECT
	JSR vb_sfx
	PLX
	JMP .expire
.nocancel
	; swept distance from Goku's chest to the step < 12
	PHX
	JSR vg_shot_hits_goku
	PLX
	BCC +
	PHX
	LDA !vg_tier
	AND.w #$0001
	BEQ ++
	LDA.w #180
	BRA +++
++	LDA.w #130
+++	JSR vg_receive
	PLX
	SEP #$20
	LDA.b #200
	STA.l !vs_shots+7,X
	REP #$20
+	; into a wall: impact
	PHX
	LDA.l !vs_shots+2,X
	CLC
	ADC.w #12
	TAY
	LDA.l !vs_shots,X
	PHY
	PLX
	JSR vg_safe
	PLX
	BCS .expire
	PHX
	LDA.l !vs_shots+2,X
	CLC
	ADC.w #12
	PHA
	LDA.l !vs_shots,X
	PLX
	JSR vg_impact_wall
	PLX
	SEP #$20
	LDA.b #200
	STA.l !vs_shots+7,X
	REP #$20
.expire
	SEP #$20
	LDA.l !vs_shots+7,X
	CMP.b #95
	BCC +
	LDA.b #$FF
	STA.l !vs_shots+7,X
+	REP #$20
.next
	TXA
	CLC
	ADC.w #8
	TAX
	CPX.w #!VS_SHOTS*8
	BCS +
	JMP .loop
+	RTS

; sweptDistance(h.x, h.y-12, old, new) < 12 for shot X (old in !vs_s0/s1).
; C set on a hit.
vg_shot_hits_goku:
	; p - a
	LDA.l $7EE002
	SEC
	SBC.l !vs_s0
	STA.l !vs_s2                  ; px
	LDA.l $7EE004
	SEC
	SBC.w #12
	SEC
	SBC.l !vs_s1
	STA.l !vs_s3                  ; py
	; quick reject: |px|, |py| > 24
	LDA.l !vs_s2
	JSR vg_abs
	CMP.w #25
	BCC +
	JMP .no
+
	LDA.l !vs_s3
	JSR vg_abs
	CMP.w #25
	BCC +
	JMP .no
+
	; d = new - old
	LDA.l !vs_shots,X
	SEC
	SBC.l !vs_s0
	STA.l !vs_s4                  ; ddx
	LDA.l !vs_shots+2,X
	SEC
	SBC.l !vs_s1
	STA.l !vs_s5                  ; ddy
	; t = p.d, den = d.d (small: |d| <= 5 per axis)
	LDA.l !vs_s2
	LDX.w #0
	JSR vg_dot_s4
	STA.l !vs_s0                  ; t_num (old pos no longer needed)
	LDA.l !vs_s4
	JSR vg_abs
	TAX
	TXY
	JSR vg_mul8
	STA !vg_t3
	LDA.l !vs_s5
	JSR vg_abs
	TAX
	TXY
	JSR vg_mul8
	CLC
	ADC !vg_t3
	STA.l !vs_s1                  ; den
	; |p|^2
	LDA.l !vs_s3
	TAX
	LDA.l !vs_s2
	JSR vg_dist2
	STA.l !vs_s6                  ; |p|^2 (<= 1152)
	LDA.l !vs_s0
	BMI .endA
	BEQ .endA
	CMP.l !vs_s1
	BCS .endB
	; interior: |p|^2 * den - t^2 < 144 * den
	LDA.l !vs_s1
	TAX
	LDA.l !vs_s6
	JSR vg_mul16
	LDA !vm_a0
	STA.l !vs_s4
	LDA !vm_a1
	STA.l !vs_s5
	LDA.l !vs_s0
	TAX
	JSR vg_mul16                  ; t^2
	LDA.l !vs_s4
	SEC
	SBC !vm_a0
	STA.l !vs_s4
	LDA.l !vs_s5
	SBC !vm_a1
	STA.l !vs_s5
	LDA.l !vs_s1
	LDX.w #144
	JSR vg_mul16
	; (s5:s4) < (a1:a0) ?
	LDA.l !vs_s5
	CMP !vm_a1
	BCC .yes
	BNE .no
	LDA.l !vs_s4
	CMP !vm_a0
	BCC .yes
.no
	CLC
	RTS
.yes
	SEC
	RTS
.endA
	; closest is the old position: |p|^2 < 144
	LDA.l !vs_s6
	CMP.w #144
	BCC .yes
	CLC
	RTS
.endB
	; closest is the new position: |p - d|^2 < 144
	LDA.l !vs_s3
	SEC
	SBC.l !vs_s5
	TAX
	LDA.l !vs_s2
	SEC
	SBC.l !vs_s4
	JSR vg_dist2
	CMP.w #144
	BCC .yes
	CLC
	RTS

; A = px: px*ddx + py*ddy with ddx/ddy in !vs_s4/!vs_s5 and py in !vs_s3
; (all small; signed).
vg_dot_s4:
	STA !vg_t3
	LDA.l !vs_s4
	JSR vg_smul_t3
	STA.l !vs_s7
	LDA.l !vs_s3
	STA !vg_t3
	LDA.l !vs_s5
	JSR vg_smul_t3
	CLC
	ADC.l !vs_s7
	RTS

; Signed A * !vg_t3 (|A| small, t3 signed) by repeated addition.
vg_smul_t3:
	PHX
	CMP.w #$8000
	BCS .neg
	TAX
	JSR .mag
	PLX
	RTS
.neg
	EOR.w #$FFFF
	INC
	TAX
	JSR .mag
	EOR.w #$FFFF
	INC
	PLX
	RTS
.mag
	LDA.w #$0000
-	CPX.w #$0000
	BEQ +
	CLC
	ADC !vg_t3
	DEX
	BRA -
+	RTS
