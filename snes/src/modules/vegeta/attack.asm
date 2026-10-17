; updateAttack(), the transformation and the draw (joch-trial.js), and the
; hit API Goku's attacks call. M16/X16, DB = $7E.

; ---------------------------------------------------------------------------
vg_update_attack:
	INC !vg_act_age
	SEP #$20
	LDA !vg_act
	CMP.b #!VA_COUNTER
	REP #$20
	BNE +
	JMP vg_attack_counter
+	SEP #$20
	CMP.b #!VA_RUSH
	REP #$20
	BNE +
	JMP vg_attack_rush
+	SEP #$20
	CMP.b #!VA_VOLLEY
	REP #$20
	BNE +
	JMP vg_attack_volley
+	JMP vg_attack_beam

; !vs_s0/!vs_s1 = the action's direction (signed words).
vg_act_dir:
	LDA !vg_act_dx
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	STA.l !vs_s0
	LDA !vg_act_dy
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	STA.l !vs_s1
	RTS

; Contact: hypot(s - h) < 24. C set.
vg_contact_hero:
	JSR vg_hero_dist2
	CMP.w #24*24
	RTS                           ; C clear when < 576: invert below
vg_touching:
	JSR vg_contact_hero
	BCC .yes
	CLC
	RTS
.yes
	SEC
	RTS

; contact ??= age; receive(amount)
vg_strike_hit:
	PHA
	LDA !vg_contact
	CMP.w #$FFFF
	BNE +
	LDA !vg_act_age
	STA !vg_contact
+	PLA
	JMP vg_receive

; Teleport counter: vanish (8-12), reappear at 12, re-aim at 24, lunge
; 24-39, recover at 54.
vg_attack_counter:
	LDA !vg_act_age
	CMP.w #12
	BNE +
	JSR vg_teleport
+	LDA !vg_act_age
	CMP.w #24
	BNE +
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
	REP #$20
	LDA.l $7EE002
	STA.l !vs_tx
	LDA.l $7EE004
	STA.l !vs_ty
+	LDA !vg_act_age
	CMP.w #24
	BCC .after
	CMP.w #40
	BCS .after
	JSR vg_act_dir
	LDY.w #6
	LDA !vg_tier
	AND.w #$0001
	BEQ +
	LDY.w #8
+	JSR vg_step_dir
	JSR vg_touching
	BCC .after
	LDA.w #220
	LDX !vg_tier-1
	CPX.w #$0100
	BCC +
	LDA.w #310
+	JSR vg_strike_hit
.after
	LDA !vg_act_age
	CMP.w #54
	BCC +
	LDA.w #75
	JMP vg_recover
+	RTS

; Rush: a held windup, then one explosive low dash; a wall ends it.
vg_attack_rush:
	LDA !vg_act_age
	CMP.w #24
	BNE +
	LDA.w #!VSFX_FLIGHT
	JSR vb_sfx
+	LDA !vg_act_age
	CMP.w #24
	BCC .after
	CMP.w #58
	BCS .after
	JSR vg_act_dir
	LDY.w #4
	LDA !vg_tier
	AND.w #$0001
	BEQ +
	LDY.w #6
+	JSR vg_step_dir
	PHP                           ; moved?
	JSR vg_touching
	BCC +
	LDA.w #190
	LDX !vg_tier-1
	CPX.w #$0100
	BCC ++
	LDA.w #260
++	JSR vg_strike_hit
+	PLP
	BCS .after
	; blocked: the wall takes the blow
	JSR vg_act_dir
	LDA.l !vs_s0
	ASL
	STA !vg_t3
	ASL
	ASL
	CLC
	ADC !vg_t3                    ; dx * 10
	CLC
	ADC !vg_x
	PHA
	LDA.l !vs_s1
	ASL
	STA !vg_t3
	ASL
	ASL
	CLC
	ADC !vg_t3
	CLC
	ADC !vg_y
	TAX
	PLA
	JSR vg_impact_wall
	LDA.w #95
	JMP vg_recover
.after
	LDA !vg_act_age
	CMP.w #76
	BCC +
	LDA.w #80
	JMP vg_recover
+	RTS

; Volley: three (base) or five (Super Saiyan) shots, each aimed once at
; release in one of eight directions.
vg_attack_volley:
	; at = age - 42, spacing = tier ? 13 : 20, count = tier ? 5 : 3
	LDX.w #20
	LDY.w #3
	LDA !vg_tier
	AND.w #$0001
	BEQ +
	LDX.w #13
	LDY.w #5
+	TXA
	STA.l !vs_s2                  ; spacing
	TYA
	STA.l !vs_s3                  ; count
	LDA !vg_act_age
	SEC
	SBC.w #42
	BMI .after
	STA.l !vs_s4                  ; at
	LDA.l !vs_s2
	TAX
	LDA.l !vs_s4
	JSR vg_udiv16                 ; A = at / spacing, Y = at % spacing
	CPY.w #$0000
	BNE .after
	CMP.l !vs_s3
	BCS .after
	JSR vg_fire_shot
.after
	; at > spacing * (count - 1) + 20: recover(100)
	LDA !vg_act_age
	SEC
	SBC.w #42
	BMI +
	STA.l !vs_s4
	LDA.l !vs_s3
	DEC
	TAY
	LDA.w #20
-	CPY.w #$0000
	BEQ ++
	CLC
	ADC.l !vs_s2
	DEY
	BRA -
++	CMP.l !vs_s4
	BCS +
	LDA.w #100
	JMP vg_recover
+	RTS

vg_fire_shot:
	; dx = sign(h.x - s.x), dy = sign(h.y - s.y), ax/ay = magnitudes
	LDA.l $7EE002
	SEC
	SBC !vg_x
	STA.l !vs_s5
	JSR vg_abs
	STA.l !vs_s6                  ; ax
	LDA.l $7EE004
	SEC
	SBC !vg_y
	STA.l !vs_s7
	JSR vg_abs
	STA !vg_t3                    ; ay
	; vx = ax > 2ay ? dx : ay > 2ax ? 0 : dx
	; vy = ay > 2ax ? dy : ax > 2ay ? 0 : dy
	LDA.l !vs_s5
	JSR vg_sign
	STA.l !vs_s0                  ; vx (default dx)
	LDA.l !vs_s7
	JSR vg_sign
	STA.l !vs_s1                  ; vy (default dy)
	LDA !vg_t3
	ASL
	CMP.l !vs_s6                  ; 2ay < ax ?
	BCS +
	LDA.w #0
	STA.l !vs_s1                  ; mostly horizontal
	BRA .aimed
+	LDA.l !vs_s6
	ASL
	CMP !vg_t3                    ; 2ax < ay ?
	BCS .aimed
	LDA.w #0
	STA.l !vs_s0                  ; mostly vertical
.aimed
	; a free shot record
	LDX.w #0
-	SEP #$20
	LDA.l !vs_shots+7,X
	CMP.b #$FF
	REP #$20
	BEQ .slot
	TXA
	CLC
	ADC.w #8
	TAX
	CPX.w #!VS_SHOTS*8
	BCC -
	RTS
.slot
	; x = s.x + vx*12, y = s.y - 12 + vy*12
	LDA.w #12
	STA !vg_t3
	LDA.l !vs_s0
	JSR vg_times_t3
	CLC
	ADC !vg_x
	STA.l !vs_shots,X
	LDA.l !vs_s1
	JSR vg_times_t3
	CLC
	ADC !vg_y
	SEC
	SBC.w #12
	STA.l !vs_shots+2,X
	SEP #$20
	LDA.l !vs_s0
	STA.l !vs_shots+4,X
	LDA.l !vs_s1
	STA.l !vs_shots+5,X
	LDA.b #4
	LDY !vg_tier-1
	CPY.w #$0100
	BCC +
	LDA.b #5
+	STA.l !vs_shots+6,X
	LDA.b #0
	STA.l !vs_shots+7,X
	REP #$20
	LDA.w #!VSFX_BLAST
	JMP vb_sfx

; Galick Gun / Final Flash. The lane locks at release; Final Flash is the
; full SSJ wave (80 half width, 48 px/frame, 640 reach, taper 44).
vg_attack_beam:
	LDA !vg_tier
	AND.w #$0001
	BEQ .base
	LDA !vg_act_age
	CMP.w #1
	BNE +
	LDA.w #!VSFX_VEGETA_FINAL_FLASH
	JSR vb_sfx
+	LDA.w #82
	BRA +
.base
	LDA.w #110
+	STA.l !vs_s2                  ; windup
	LDA !vg_act_age
	SEC
	SBC.l !vs_s2
	BPL +
	RTS                           ; still charging
+	STA.l !vs_s3                  ; age since release
	BNE +
	LDA.w #!VSFX_VEGETA_BEAM
	JSR vb_sfx
	LDA.w #12
	JSR vb_pulse
+	JSR vg_act_dir
	; origin = (a.x + dx*12, a.y - 12 + dy*12)
	LDA.w #12
	STA !vg_t3
	LDA.l !vs_s0
	JSR vg_times_t3
	CLC
	ADC !vg_act_x
	STA.l !vs_beam_x
	LDA.l !vs_s1
	JSR vg_times_t3
	CLC
	ADC !vg_act_y
	SEC
	SBC.w #12
	STA.l !vs_beam_y
	; length, half width (8.8 fixed point)
	LDA !vg_tier
	AND.w #$0001
	BEQ .galick
	; min(640, (age+1) * 48)
	LDA.l !vs_s3
	INC
	ASL : ASL : ASL : ASL         ; *16
	STA !vg_t3
	ASL                           ; *32
	CLC
	ADC !vg_t3                    ; *48
	CMP.w #640
	BCC +
	LDA.w #640
+	STA.l !vs_beam_len
	; 80 * max(0, min(1, (age+1)/6, (66-age)/10)) in 8.8
	JSR vg_flash_half
	STA.l !vs_beam_half
	BRA .geom
.galick
	; min(512, 16 + age*16), half width 11
	LDA.l !vs_s3
	ASL : ASL : ASL : ASL
	CLC
	ADC.w #16
	CMP.w #512
	BCC +
	LDA.w #512
+	STA.l !vs_beam_len
	LDA.w #11*256
	STA.l !vs_beam_half
.geom
	SEP #$20
	LDA.b #$01
	STA.l !vs_beam_on
	REP #$20
	JSR vg_counter_beam
	BCC +
	RTS                           ; a clash took over
+	JSR vg_beam_hits_goku
	BCC +
	LDA.w #240
	LDX !vg_tier-1
	CPX.w #$0100
	BCC ++
	LDA.w #320
++	JSR vg_receive
+	; at 24 frames, a beam that ends in a wall shakes the room
	LDA.l !vs_s3
	CMP.w #24
	BNE .end
	JSR vg_act_dir
	LDA.w #384
	STA !vg_t3
	LDA.l !vs_s0
	JSR vg_times_t3
	CLC
	ADC.l !vs_beam_x
	STA.l !vs_s4
	LDA.l !vs_s1
	JSR vg_times_t3
	CLC
	ADC.l !vs_beam_y
	STA.l !vs_s5
	CLC
	ADC.w #12
	TAX
	LDA.l !vs_s4
	JSR vg_safe
	BCS .end
	LDA.l !vs_s5
	TAX
	LDA.l !vs_s4
	JSR vg_impact_wall
.end
	; recover after 66 (Final Flash) / 48 (Galick Gun) frames
	LDA.w #48
	LDX !vg_tier-1
	CPX.w #$0100
	BCC +
	LDA.w #66
+	CMP.l !vs_s3
	BEQ +
	BCS ++
+	LDA.w #140
	JMP vg_recover
++	RTS

; Final Flash half width for age !vs_s3: 80 * max(0, min(1, (age+1)/6,
; (66-age)/10)) in 8.8 fixed point (20480 = 80 px): (age+1) * 10240 / 3
; (exact to 1/256 px) and (66 - age) * 2048.
vg_flash_half:
	LDA.l !vs_s3
	CMP.w #5
	BCS .full                     ; (age+1)/6 >= 1
	INC
	STA !vg_t3
	ASL : ASL : ASL : ASL : ASL : ASL : ASL : ASL : ASL : ASL   ; * 1024
	STA !vg_t2
	ASL : ASL : ASL               ; * 8192
	CLC
	ADC !vg_t2                    ; * 9216
	CLC
	ADC !vg_t2                    ; * 10240
	LDX.w #3
	JSR vg_udiv16
	BRA +
.full
	LDA.w #20480
+	STA !vg_t3
	; (66 - age) * 2048
	LDA.w #66
	SEC
	SBC.l !vs_s3
	BPL +
	LDA.w #0
	RTS
+	CMP.w #10
	BCS .done                     ; >= 1: no cap from this term
	XBA
	ASL : ASL : ASL               ; * 2048
	CMP !vg_t3
	BCS .done
	RTS
.done
	LDA !vg_t3
	RTS

; Does the beam (!vs_beam_*) hit Goku? along/across from the origin to his
; chest; radius = half * min(1, (max(0,along)+8)/44) * min(1,
; sqrt(max(0,(length-along)/12))); hit when 0 <= along <= length and
; across < radius + 5. C set on a hit.
vg_beam_hits_goku:
	JSR vg_act_dir
	LDA.l $7EE002
	SEC
	SBC.l !vs_beam_x
	STA.l !vs_s4                  ; rx
	LDA.l $7EE004
	SEC
	SBC.w #12
	SEC
	SBC.l !vs_beam_y
	STA.l !vs_s5                  ; ry
	; along = rx*dx + ry*dy ; across = |rx*dy - ry*dx| (unit directions)
	LDA.l !vs_s0
	BEQ .vertical
	; horizontal beam: along = rx*dx, across = |ry|
	BMI +
	LDA.l !vs_s4
	BRA ++
+	LDA.l !vs_s4
	EOR.w #$FFFF
	INC
++	STA.l !vs_s6
	LDA.l !vs_s5
	JSR vg_abs
	STA.l !vs_s7
	BRA .test
.vertical
	LDA.l !vs_s1
	BMI +
	LDA.l !vs_s5
	BRA ++
+	LDA.l !vs_s5
	EOR.w #$FFFF
	INC
++	STA.l !vs_s6
	LDA.l !vs_s4
	JSR vg_abs
	STA.l !vs_s7
.test
	LDA.l !vs_s6
	BMI .no                       ; along < 0
	CMP.l !vs_beam_len
	BEQ +
	BCS .no                       ; along > length
+	LDA.l !vs_s7
	CMP.w #5
	BCC .yes                      ; across < 5 always inside
	; radius in 8.8
	LDA.l !vs_beam_half
	STA !vg_t3
	LDA.l !vs_s6
	CLC
	ADC.w #8
	CMP.w #44
	BCS +
	; * (along+8) / 44
	LDX !vg_t3
	JSR vg_mul16
	LDX.w #44
	JSR vg_div32
	STA !vg_t3
+	; tip: length - along < 12 -> * sqrt((length-along)/12)
	LDA.l !vs_beam_len
	SEC
	SBC.l !vs_s6
	CMP.w #12
	BCS +
	ASL
	TAX
	LDA.l vg_tip_root,X
	LDX !vg_t3
	JSR vg_mul16
	LDA !vm_a0                    ; >> 8
	XBA
	AND.w #$00FF
	STA !vg_t3
	LDA !vm_a1
	XBA
	AND.w #$FF00
	ORA !vg_t3
	STA !vg_t3
+	; (across - 5) * 256 < radius ?
	LDA.l !vs_s7
	SEC
	SBC.w #5
	CMP.w #$0100
	BCS .no
	XBA
	CMP !vg_t3
	BCC .yes
.no
	CLC
	RTS
.yes
	SEC
	RTS
; round(256 * sqrt(k / 12)), k = 0..11
vg_tip_root:
	dw 0, 74, 105, 128, 148, 165, 181, 196, 209, 222, 234, 245

; ---------------------------------------------------------------------------
; Transformation: Super Saiyan at 92, Goku's line at 155, Final Flash at 220.
vg_tick_transform:
	INC !vg_phase_age
	LDA !vg_phase_age
	CMP.w #92
	BNE +
	SEP #$20
	LDA.b #$01
	STA !vg_tier
	REP #$20
	LDA.w #!VEGETA_HP1
	STA.l $7EE784
	LDA.w #!VSFX_TRANSFORM
	JSR vb_sfx
	JSR vb_feedback_burst
+	LDA !vg_phase_age
	CMP.w #155
	BNE +
	LDA.w #!VMSG_NOW_TALKING
	JSR vb_say
+	LDA !vg_phase_age
	CMP.w #220
	BCS +
	RTS
+	SEP #$20
	LDA.b #!VP_BATTLE
	STA !vg_phase
	REP #$20
	LDA.w #60
	STA !vg_grace
	JSR vg_teleport
	LDA.w #!VA_BEAM
	JMP vg_begin

; The draw: the last wave finishes, both power down, lines, the return.
vg_tick_draw:
	LDA !vg_phase_age
	BNE +
	JSR vb_goku_beam_live
	BCC +
	RTS
+	INC !vg_phase_age
	LDA !vg_phase_age
	CMP.w #1
	BNE +
	JSR vb_cancel_combat
	JSR vg_teleport
	JSR vg_face_hero
+	LDA !vg_phase_age
	CMP.w #35
	BNE .no35
	SEP #$20
	STZ !vg_tier
	REP #$20
	JSR vb_goku_ssj
	BCC +
	JSR vb_permanent_ssj
	BCS +
	JSR vb_set_base_form
	LDA.w #!VSFX_REVERT
	JSR vb_sfx
+	LDA !vg_flags
	AND.w #!VF_DRAW
	BEQ +
	LDA.w #!VMSG_DRAW_1
	BRA ++
+	LDA.w #!VMSG_REST_1
++	JSR vb_say
.no35
	LDA !vg_phase_age
	CMP.w #275
	BNE .no275
	LDA !vg_flags
	AND.w #!VF_DRAW
	BEQ +
	LDA.w #!VMSG_DRAW_2
	BRA ++
+	LDA.w #!VMSG_REST_2
++	JSR vb_say
.no275
	LDA !vg_phase_age
	CMP.w #490
	BCS +
	RTS
+	; won = draw; slot 3 HP 0 and dead for a draw (4E5 checks it)
	LDA !vg_flags
	AND.w #!VF_DRAW
	BEQ .rest
	SEP #$20
	LDA.b #!VF_WON
	TSB !vg_flags
	LDA.l $7EE791
	ORA.b #$80
	STA.l $7EE791
	REP #$20
	LDA.w #0
	STA.l $7EE782
	BRA .request
.rest
	LDA.w #1
	STA.l $7EE782
.request
	LDA !vg_flags
	AND.w #!VF_RETURNING
	BNE +
	LDA !vg_flags
	AND.w #!VF_DRAW
	BEQ ++
	LDA.w #$04E5
	BRA +++
++	LDA.w #$0025
+++	LDX.w #$0000
	JSL story_api_request
	BCC +
	SEP #$20
	LDA.b #!VF_RETURNING
	TSB !vg_flags
	REP #$20
+	RTS

; ---------------------------------------------------------------------------
; hit(enemy, amount): Goku's attack landed on Vegeta. JSL API for combat.
; In: A16 = damage (before Vegeta's damage scale), X16 bit 0 = melee hit
; (a punch/kick; two in 100 frames provoke a teleport counter).
; Out: A16 = HP before, X16 = HP after, C set when it was taken.
vegeta_api_hit:
	PHB
	PHD
	REP #$30
	PEA $7E7E
	PLB
	PLB
	PEA $0000
	PLD
	TAY                           ; damage
	SEP #$20
	LDA !vg_on
	CMP.b #!VG_ON
	REP #$20
	BEQ +
	LDA.w #0                      ; no trial: the scene buffer is not ours
	TAX
	PLD
	PLB
	CLC
	RTL
+	TYA
	STA.l !vs_s0
	TXA
	STA.l !vs_s1
	LDA !vg_hp
	STA.l !vs_s2                  ; before
	JSR vg_hit
	PHP                           ; C = taken
	LDA !vg_hp
	TAX
	LDA.l !vs_s2
	PLP
	PLD
	PLB
	RTL

vg_hit:
	JSR vg_active
	BCS +
	CLC
	RTS
+	SEP #$20
	LDA !vg_phase
	CMP.b #!VP_BATTLE
	BEQ +
	JMP .no8
+
	LDA !vg_flags
	AND.b #!VF_WON
	BEQ +
	JMP .no8
+
	LDA !vg_clash_on
	BEQ +
	JMP .no8
+
	REP #$20
	; a newly released wave can reach him this frame: clash first
	JSR vg_counter_beam
	BCC +
	CLC
	RTS
+	; damage = max(1, round(amount * scale)): .55 base, .32 Super Saiyan
	; ($FFFF stands for an overwhelming blow: the browser tests' 1000000)
	LDA.l !vs_s0
	CMP.w #$FFFF
	BNE +
	JMP .scaled
+	LDA !vg_tier
	AND.w #$0001
	BNE .ssj
	LDA.l !vs_s0
	LDX.w #11
	LDY.w #20
	BRA .scale
.ssj
	LDA.l !vs_s0
	LDX.w #8
	LDY.w #25
.scale
	JSR vg_scale
	BNE +
	INC
.scaled
+	STA !vg_t3
	LDA !vg_hp
	SEC
	SBC !vg_t3
	BCS +
	LDA.w #0
+	STA !vg_hp
	SEP #$20
	LDA.b #10
	STA !vg_hurt
	REP #$20
	; melee: two in a row within 100 frames start a counter
	LDA.l !vs_s1
	AND.w #$0001
	BEQ .noMelee
	LDA !vg_hp
	BEQ .noMelee
	LDA !vg_age
	SEC
	SBC !vg_last_melee
	CMP.w #100
	SEP #$20
	BCC +
	STZ !vg_melee
+	INC !vg_melee
	REP #$20
	LDA !vg_age
	STA !vg_last_melee
	SEP #$20
	LDA !vg_melee
	CMP.b #2
	REP #$20
	BCC .noMelee
	SEP #$20
	STZ !vg_melee
	REP #$20
	LDA.w #!VA_COUNTER
	JSR vg_begin
.noMelee
	LDA !vg_hp
	BNE .alive
	; down: transform (base) or call it a draw (Super Saiyan)
	SEP #$20
	LDA.b #!VP_TRANSFORM
	STA !vg_phase
	STZ !vg_act
	LDA.b #$00
	STA.l !vs_beam_on
	REP #$20
	STZ !vg_phase_age
	JSR vg_clear_shots
	JSR vg_clear_rocks
	LDA !vg_tier
	AND.w #$0001
	BNE .finish
	LDA.w #!VEGETA_HP1
	STA !vg_hp
	JSR vg_teleport
	LDA.w #!VSFX_CHARGE
	JSR vb_sfx
	LDA.w #!VMSG_NOT_BAD
	JSR vb_say
	BRA .alive
.finish
	LDA.w #1
	STA !vg_hp
	LDA.w #1
	JSR vg_finish
.alive
	; slot 3 HP for other readers (scouter)
	LDA !vg_hp
	BNE +
	INC
+	STA.l $7EE782
	LDA.w #!VEGETA_HP0
	LDX !vg_tier-1
	CPX.w #$0100
	BCS +
	SEP #$20
	LDX !vg_phase
	CPX.w #!VP_TRANSFORM
	REP #$20
	BNE ++
+	LDA.w #!VEGETA_HP1
++	STA.l $7EE784
	SEC
	RTS
.no8
	REP #$20
	CLC
	RTS
