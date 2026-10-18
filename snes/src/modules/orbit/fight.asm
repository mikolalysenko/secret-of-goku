; The orbital fight (engine/frieza.js spaceInput/tick with boss.space,
; frieza-orbit.js tickOrbit/steerOrbit, orbit-duel.js, orbit-pixels.js),
; transcribed clock for clock. Screen-space: none of this touches the native
; party, which waits on its Fortress tile. DB = $32, M16/X16.

!ORBIT_NODES = 4

; Fresh orbit (frieza.js enterOrbit + newOrbit): A16 = Frieza's HP,
; X16 = target x (longitude), Y16 = target y (latitude); f_intro set by the
; caller (855, or 0 when a test starts in the fight).
fight_start:
	PHA
	STX.w !cam_lon
	STY.w !cam_lat
	LDX.w #(!FIGHT_END)-(!FB)-2
.clr
	STZ.w !FB,X
	DEX : DEX
	BPL .clr
	PLA
	STA.w !b_hp
	; no beam struggle yet
	LDX.w #(!FN_END)-(!FN)-2
-	STZ.w !FN,X
	DEX : DEX
	BPL -
	LDA.w #156 : STA.w !f_hx
	LDA.w #155 : STA.w !f_hy
	LDA.w #12 : STA.w !f_heading
	LDA.w #95 : STA.w !cam_x
	LDA.w #154 : STA.w !cam_y
	LDA.w #104 : STA.w !cam_r
	LDA.w #202 : STA.w !b_x
	LDA.w #57 : STA.w !b_y
	LDA.w #150 : STA.w !b_clock
	LDA.w #60 : STA.w !f_grace
	LDA.w #$FF9C                   ; lastImpact long ago (-100)
	STA.w !b_lastimp
	LDA.w #$FF38                   ; lastMelee (-200)
	STA.w !b_lastmel
	; free every slot
	LDX.w #(!FS_N-1)*8
-	LDA.w #$00FF : STA.w !FS_SHOTS+6,X
	TXA : SEC : SBC.w #$0008 : TAX
	BPL -
	LDX.w #(!RIC_N-1)*8
-	LDA.w #$00FF : STA.w !FS_RIC+6,X
	TXA : SEC : SBC.w #$0008 : TAX
	BPL -
	LDX.w #(!HIT_N-1)*6
-	LDA.w #$00FF : STA.w !FS_HITS+4,X
	TXA : SEC : SBC.w #$0006 : TAX
	BPL -
	LDX.w #3*6
-	LDA.w #$00FF : STA.w !FS_AFTER+4,X
	TXA : SEC : SBC.w #$0006 : TAX
	BPL -
	RTS

; One fight frame in the browser's order (mana-mod.js beforeFrame):
; frieza.js tick (orbitDefense, tickOrbit, exchange, clash check, AI,
; Frieza's shots), then spaceInput.
fight_frame:
	REP #$30
	JSR fight_tick
	JMP fight_input

; frieza.js tick (orbit). Menus and dialogue pause the battle; a fallen
; Goku stops it. After the win, the 'won' stage's own clock.
fight_tick:
	LDA.w !fn_phase
	CMP.w #!FN_WIN
	BNE +
	JMP finale_won
+	JSR fight_paused
	BCC +
	RTS
+	LDA.l $7EE182
	BNE +
	RTS
+	LDA.l $7EE191
	AND.w #$0080
	BEQ +
	RTS
+	LDA.l $7EE1E1                  ; the hero's armor (22: the training gi)
	AND.w #$00FF
	STA.w !f_gi
	; b.age++, grace/hurt/recoil/guard count down; afterimages age
	INC.w !b_age
	LDX.w #!f_grace : JSR fight_dec
	LDX.w #!b_hurt : JSR fight_dec
	LDX.w #!b_recoil : JSR fight_dec
	LDX.w #!b_guard : JSR fight_dec
	LDX.w #3*6
-	LDA.w !FS_AFTER+4,X
	CMP.w #16
	BCS +
	INC
	STA.w !FS_AFTER+4,X
+	TXA : SEC : SBC.w #$0006 : TAX
	BPL -
	; firing = a laser younger than 16; evading = !firing && orbitDefense
	JSR fight_firing
	STA.w !f_firing
	STZ.w !f_evading
	LDA.w !f_firing
	BNE +
	JSR fight_defense
	ROL.w !f_evading
+	JSR fight_tick_orbit
	LDA.w !f_intro
	BEQ +
	RTS
+	JSR fight_exchange
	BCC +
	RTS
+	LDA.w !fn_phase
	BNE .clash
	; At 6,000 HP the beam struggle takes over (frieza-finale.js beginClash).
	LDA.w !b_hp
	CMP.w #6001
	BCS .ai
	LDA.w !fb_on
	BEQ +
	JSR fight_clear_boss_shots     ; the wave finishes first
	STZ.w !w_kind
	RTS
+	JSR finale_begin
.clash
	JSR finale_tick
	BCC +
	JSR finale_win
+	RTS
.ai
	JSR fight_ai
	JMP fight_boss_shots

; Carry set while dialogue ($D0) or a menu ($EC & $FE) holds the field.
fight_paused:
	LDA.w $00D0
	AND.w #$00FF
	BNE .yes
	LDA.w $00EC
	AND.w #$00FE
	BNE .yes
	CLC
	RTS
.yes
	SEC
	RTS

; X = address: decrement the word there unless it is zero.
fight_dec:
	LDA.w $0000,X
	BEQ +
	DEC
	STA.w $0000,X
+	RTS

; A16 = nonzero while one of Frieza's lasers is younger than 16 frames.
fight_firing:
	LDX.w #(!BS_N-1)*16
-	LDA.w !FS_BOSS+!bs_kind,X
	CMP.w #!WK_LASER
	BNE +
	LDA.w !FS_BOSS+!bs_age,X
	CMP.w #16
	BCS +
	LDA.w #$0001
	RTS
+	TXA : SEC : SBC.w #$0010 : TAX
	BPL -
	LDA.w #$0000
	RTS

fight_clear_boss_shots:
	LDX.w #(!BS_N-1)*16
-	STZ.w !FS_BOSS+!bs_kind,X
	TXA : SEC : SBC.w #$0010 : TAX
	BPL -
	RTS

; ---------------------------------------------------------------------------
; frieza.js spaceInput: steering, the charged wave, punches, Instant
; Transmission and ki. Pad bits are the core's ($4218 layout).
fight_input:
	LDA.w !f_pad
	STA.w !f_padprev
	LDA.l !core_pad
	STA.w !f_pad
	; the game sees none of it while Goku fights in space
	LDA.w #$FFFF
	STA.l !core_pad_mask
	; dialogue or a menu: the charge and focus drop (frieza.js spaceInput)
	JSR fight_paused
	BCC +
	STZ.w !f_charge
	STZ.w !f_power
	STZ.w !f_focus
	RTS
+	LDA.l $7EE182
	BNE +
	RTS
+	LDA.l $7EE191
	AND.w #$0080
	BEQ +
	RTS
+	LDA.w !f_intro
	BEQ +
	RTS
+	LDA.w !f_duel
	BEQ +
	RTS
+	LDA.w !fn_phase
	BEQ +
	; the clash: the scene charges and releases Goku's counter; fresh B or
	; Y presses push once the beams have met
	LDA.w !f_padprev
	EOR.w #$FFFF
	AND.w !f_pad
	AND.w #!PAD_B|!PAD_Y
	BEQ ++
	JSR finale_tap
++	RTS
+	; wave = L + Y; focus = L alone (no B, Y, A, R)
	LDA.w !f_pad
	AND.w #!PAD_L|!PAD_Y
	CMP.w #!PAD_L|!PAD_Y
	BEQ +
	LDA.w #$0000
+	STA.w !f_tmp+4                 ; wave (nonzero)
	; steer unless focusing, firing the wave, punching or holding B
	LDA.w !f_pad
	BIT.w #!PAD_L
	BEQ .noFocus
	BIT.w #!PAD_B|!PAD_Y|!PAD_A|!PAD_R
	BEQ .steerDone                 ; focus: no steering
.noFocus
	LDA.w !fb_on
	ORA.w !f_punch
	BNE .steerDone
	LDA.w !f_pad
	BIT.w #!PAD_B
	BNE .steerDone
	JSR fight_steer
.steerDone
	; charge while L+Y is held; release fires the wave
	LDA.w !f_tmp+4
	BEQ .release
	LDA.w !fb_on
	BNE .release
	LDA.w !f_charge
	CMP.w #45
	BCS +
	INC
	STA.w !f_charge
	CMP.w #45
	BNE +
	LDA.w #!AUDIO_SFX_CHARGED
	JSL audio_sfx
+	BRA .afterCharge
.release
	LDA.w !f_charge
	BEQ .afterCharge
	JSR fight_fire_wave
.afterCharge
	; mana-mod.js focus: L alone (no wave held or out) builds powerCharge
	; to 96 (the aura and Goku's focus cell); anything else drops it
	STZ.w !f_focus
	LDA.w !f_tmp+4
	ORA.w !fb_on
	BNE .noPower
	LDA.w !f_pad
	BIT.w #!PAD_L
	BEQ .noPower
	BIT.w #!PAD_B|!PAD_Y|!PAD_A|!PAD_R
	BNE .noPower
	INC.w !f_focus
	LDA.w !f_power
	CMP.w #96
	BCS .power
	INC.w !f_power
	BRA .power
.noPower
	STZ.w !f_power
.power
	LDA.w !fb_on
	BEQ +
	RTS
+	; L+B (fresh B): Instant Transmission beside Frieza
	LDA.w !f_pad
	AND.w #!PAD_L|!PAD_B
	CMP.w #!PAD_L|!PAD_B
	BNE .punch
	LDA.w !f_padprev
	BIT.w #!PAD_B
	BNE .ki
	LDA.w !b_x
	SEC : SBC.w #22
	JSR fight_clamp_x
	STA.w !f_hx
	LDA.w !b_y
	JSR fight_clamp_y
	STA.w !f_hy
	STZ.w !f_heading
	LDA.w #18
	STA.w !f_teleport
	LDA.w #!AUDIO_SFX_TELEPORT
	JSL audio_sfx
	BRA .ki
.punch
	LDA.w !f_pad
	BIT.w #!PAD_B
	BEQ .ki
	BIT.w #!PAD_L
	BNE .ki
	LDA.w !f_cooldown
	BNE .ki
	LDA.w #8
	STA.w !f_cooldown
	STA.w !f_punch
	LDA.w #!AUDIO_SFX_SWING
	JSL audio_sfx
	; within 32 px of Frieza: a melee hit (550)
	LDA.w !b_x : SEC : SBC.w !f_hx : PHA
	LDA.w !b_y : SEC : SBC.w !f_hy : TAX
	PLA
	LDY.w #32
	JSR orbit_near
	BCC .ki
	LDA.w #550
	JSR fight_melee
	LDA.w #!AUDIO_SFX_FRIEZA_IMPACT
	JSL audio_sfx
.ki
	; Y alone: one ki shot every 6 frames along the facing
	LDA.w !f_pad
	BIT.w #!PAD_Y
	BEQ .done
	BIT.w #!PAD_L
	BNE .done
	LDA.w !f_cooldown
	BNE .done
	LDA.w !fb_on
	BNE .done
	LDA.w #6
	STA.w !f_cooldown
	JSR fight_new_shot
	LDA.w #!AUDIO_SFX_BLAST
	JSL audio_sfx
.done
	RTS

fight_clamp_x:
	CMP.w #14
	BPL +
	LDA.w #14
+	CMP.w #243
	BMI +
	LDA.w #242
+	RTS
fight_clamp_y:
	CMP.w #20
	BPL +
	LDA.w #20
+	CMP.w #185
	BMI +
	LDA.w #184
+	RTS

; steerOrbit: eight directions, 3 px (6 with A, 1 while charging); the
; globe turns under the move (longitude += 4 dx speed, latitude += 2 dy
; speed within 256-3840) and the camera is marked moving for 8 frames.
fight_steer:
	STZ.w !f_tmp+6                 ; dx
	STZ.w !f_tmp+8                 ; dy
	LDA.w !f_pad
	BIT.w #!PAD_RIGHT : BEQ + : INC.w !f_tmp+6
+	BIT.w #!PAD_LEFT : BEQ + : DEC.w !f_tmp+6
+	BIT.w #!PAD_DOWN : BEQ + : INC.w !f_tmp+8
+	BIT.w #!PAD_UP : BEQ + : DEC.w !f_tmp+8
+	LDA.w !f_tmp+6
	ORA.w !f_tmp+8
	BNE +
	RTS
+	LDA.w !f_tmp+6
	LDX.w !f_tmp+8
	JSR orbit_heading
	STA.w !f_heading
	; speed: 1 charging, 6 with A, else 3
	LDA.w #1
	LDX.w !f_charge
	BNE .sp
	LDA.w !f_pad
	AND.w #!PAD_A
	BEQ +
	LDA.w #6
	BRA .sp
+	LDA.w #3
.sp
	STA.w !f_tmp+10                ; speed
	; step: the 8-direction unit vector rounds like orbitStep at the heading
	LDA.w !f_tmp+10
	JSR fight_step_table
	LDY.w !f_heading
	JSR orbit_step
	TXA
	CLC : ADC.w !f_hx
	JSR fight_clamp_x
	STA.w !f_hx
	TYA
	CLC : ADC.w !f_hy
	JSR fight_clamp_y
	STA.w !f_hy
	; camera: latitude += 2 dy speed (clamped), longitude += 4 dx speed
	LDA.w !f_tmp+10
	ASL
	STA.w !f_tmp+12                ; 2 speed
	LDA.w !f_tmp+8
	BEQ .lon
	BMI +
	LDA.w !cam_lat
	CLC : ADC.w !f_tmp+12
	BRA ++
+	LDA.w !cam_lat
	SEC : SBC.w !f_tmp+12
++	CMP.w #256
	BPL +
	LDA.w #256
+	CMP.w #3841
	BMI +
	LDA.w #3840
+	PHA
	SEC : SBC.w !cam_lat
	STA.w !cam_tdy                 ; travelY += latitude change
	PLA
	STA.w !cam_lat
.lon
	LDA.w !f_tmp+6
	BEQ .moved
	LDA.w !f_tmp+12
	ASL                            ; 4 speed
	LDX.w !f_tmp+6
	BPL +
	EOR.w #$FFFF : INC
+	STA.w !f_tmp+12
	CLC : ADC.w !cam_tdx
	STA.w !cam_tdx                 ; travelX += 4 dx speed
	LDA.w !cam_lon
	CLC : ADC.w !f_tmp+12
	AND.w #$0FFF
	STA.w !cam_lon
.moved
	LDA.w #8
	STA.w !f_moving
	RTS

; A16 = speed (1-7, 12) -> A16 = its step table.
fight_step_table:
	DEC
	ASL
	TAX
	LDA.l .tables,X
	RTS
.tables
	dw orbit_steps_1, orbit_steps_2, orbit_steps_3, orbit_steps_4
	dw orbit_steps_5, orbit_steps_6, orbit_steps_7

; The wave leaves Goku's hands: strength = charge / 45; width 8 + 24 s,
; damage 400 + 500 s, 60 frames at full power, else 30.
fight_fire_wave:
	LDA.w !f_hx : STA.w !fb_x
	LDA.w !f_hy : STA.w !fb_y
	LDA.w !f_heading : STA.w !fb_head
	STZ.w !fb_age
	LDA.w #30
	LDX.w !f_charge
	CPX.w #45
	BNE +
	LDA.w #60
+	STA.w !fb_max
	; width (8.8) = 8*256 + charge * 24*256/45 = 2048 + charge * 136.53
	LDA.w !f_charge
	SEP #$20
	STA.w $4202
	LDA.b #137
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	CLC : ADC.w #2048
	STA.w !fb_width
	; damage = 400 + 500 * charge / 45, kept fractional by the browser and
	; floored by hurt after the training gi's 0.9: unscaled
	; 400 + floor(charge * 100 / 9), weighted exactly 360 + 10 * charge
	LDA.w !f_charge
	SEP #$20
	STA.w $4202
	LDA.b #100
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216                    ; charge * 100
	STA.w $4204
	SEP #$20
	LDA.b #9
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	CLC : ADC.w #400
	STA.w !fb_damage
	LDA.w !f_charge
	ASL
	STA.w !fb_damage9
	ASL : ASL
	CLC : ADC.w !fb_damage9        ; 10 * charge
	CLC : ADC.w #360
	STA.w !fb_damage9
	LDA.w #$0001
	STA.w !fb_on
	STZ.w !f_charge
	LDA.w #!AUDIO_SFX_BEAM
	JSL audio_sfx
	RTS

; A ki shot from Goku along his heading (age 0).
fight_new_shot:
	LDX.w #(!FS_N-1)*8
-	LDA.w !FS_SHOTS+6,X
	CMP.w #31
	BCS .free
	TXA : SEC : SBC.w #$0008 : TAX
	BPL -
	RTS                            ; (the browser has no cap; 6 never fill)
.free
	LDA.w !f_hx : STA.w !FS_SHOTS+0,X
	LDA.w !f_hy : STA.w !FS_SHOTS+2,X
	LDA.w !f_heading : STA.w !FS_SHOTS+4,X
	STZ.w !FS_SHOTS+6,X
	RTS

; ---------------------------------------------------------------------------
; frieza.js hurt (orbit): no damage during the exchange guard, the intro
; or the clash; Goku's orbital attacks are scaled by the training gi (armor
; 22 in $E1E1: 0.9, floored); Frieza's HP stops at 6,000 (the beam
; struggle). A16 = amount -> A16 = hit.
fight_hurt:
	STZ.w !f_disc
	STZ.w !f_exact
	BRA fight_hurt_any
; Same with the amount already final (the wave's exact weighted damage).
fight_hurt_exact:
	STZ.w !f_disc
	LDX.w #$0001
	STX.w !f_exact
	BRA fight_hurt_any
; hurt(12000, true): Frieza's own returning disc.
fight_hurt_disc:
	LDX.w #$0001
	STX.w !f_disc
	STZ.w !f_exact
fight_hurt_any:
	STA.w !f_tmp+14
	LDA.w !f_intro
	ORA.w !b_guard
	ORA.w !fn_phase
	BEQ +
	LDA.w #$0000
	RTS
+	LDA.w !f_disc
	ORA.w !f_exact
	BNE .scaled
	LDA.w !f_gi
	CMP.w #22
	BNE .scaled
	LDA.w !f_tmp+14                ; amount * 9 / 10 (amounts here <= 900)
	ASL : ASL : ASL
	CLC : ADC.w !f_tmp+14
	STA.w $4204
	SEP #$20
	LDA.b #10
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	STA.w !f_tmp+14
.scaled
	; hit = min(max(0, hp - 6000), amount)
	LDA.w !b_hp
	SEC : SBC.w #6000
	BPL +
	LDA.w #$0000
+	CMP.w !f_tmp+14
	BCC +
	LDA.w !f_tmp+14
+	STA.w !f_tmp+14
	LDA.w !b_hp
	SEC : SBC.w !f_tmp+14
	STA.w !b_hp
	LDA.w #10
	STA.w !b_hurt
	LDA.w !f_disc
	BEQ .cue
	; his own disc: staggered for 75 frames, a burst and the cue every time
	LDA.w #75
	STA.w !b_stun
	BRA .burst
.cue
	; an impact cue at most every 18 frames
	LDA.w !f_tmp+14
	BEQ .done
	LDA.w !b_age
	SEC : SBC.w !b_lastimp
	CMP.w #19
	BMI .done
	LDA.w !b_age
	STA.w !b_lastimp
.burst
	LDA.w !b_x
	LDX.w !b_y
	JSR fight_burst
	LDA.w #!AUDIO_SFX_FRIEZA_IMPACT
	JSL audio_sfx
.done
	LDA.w !f_tmp+14
	RTS

; frieza.js melee: a hit right after Instant Transmission starts the
; four-hit exchange; two hits within 120 frames send him to a far node.
fight_melee:
	JSR fight_hurt
	STA.w !f_tmp+12
	BEQ .done
	LDA.w !f_teleport
	BEQ +
	JSR fight_begin_exchange
	BCS .done
+	LDA.w !b_stun
	BNE .done
	LDA.w !b_age
	SEC : SBC.w !b_lastmel
	CMP.w #121
	BMI +
	LDA.w #$0001
	BRA ++
+	LDA.w !b_mhits
	INC
++	STA.w !b_mhits
	LDA.w !b_age
	STA.w !b_lastmel
	LDA.w !b_mhits
	CMP.w #2
	BCC .done
	JSR fight_evade_melee
.done
	LDA.w !f_tmp+12
	RTS

; frieza.js evadeMelee: rush to the node farthest from Goku among those more
; than 32 px away; guard 45, counter laser after the rush.
fight_evade_melee:
	LDA.w !b_stun
	BEQ +
	RTS
+	STZ.w !f_tmp+0                 ; best distance (squared / 4)
	LDA.w #$FFFF
	STA.w !f_tmp+2                 ; best node
	LDX.w #$0000
.node
	; candidates more than 32 px from Frieza
	LDA.l fight_nodes,X : SEC : SBC.w !b_x : PHA
	LDA.l fight_nodes+2,X : SEC : SBC.w !b_y : TAY
	PLA
	PHX
	TYX
	LDY.w #33
	JSR orbit_near                 ; within 33 -> skip (> 32 required)
	PLX
	BCS .next
	JSR fight_node_dist            ; A = distance^2/4 from Goku
	CMP.w !f_tmp+0
	BCC .next
	STA.w !f_tmp+0
	STX.w !f_tmp+2
.next
	INX : INX : INX : INX
	CPX.w #4*!ORBIT_NODES
	BCC .node
	LDA.w !f_tmp+2
	BPL +
	LDA.w #$0000                   ; none far enough: the farthest of all
+	LSR : LSR
	STA.w !b_node
	STZ.w !w_kind
	JSR fight_clear_boss_shots
	LDA.w #$0001
	STA.w !b_dash
	STA.w !b_counter
	STZ.w !b_windup
	LDA.w #45
	STA.w !b_guard
	STZ.w !b_hurt
	STZ.w !b_mhits
	LDA.w #!AUDIO_SFX_FRIEZA_RUSH
	JSL audio_sfx
	RTS

; X = node offset -> A16 = (dx^2 + dy^2) / 4 to Goku (|d| < 512).
fight_node_dist:
	LDA.l fight_nodes,X : SEC : SBC.w !f_hx
	JSR orbit_abs
	LSR
	STA.w !m_t4
	LDA.l fight_nodes+2,X : SEC : SBC.w !f_hy
	JSR orbit_abs
	LSR
	STA.w !m_t5
	SEP #$20
	LDA.w !m_t4 : STA.w $4202 : STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	STA.w !m_t6
	SEP #$20
	LDA.w !m_t5 : STA.w $4202 : STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	CLC : ADC.w !m_t6
	RTS

; frieza.js enterOrbit: the four patrol nodes of the orbital fight.
fight_nodes:
	dw 202,57, 54,48, 208,148, 48,132

; frieza.js damagePlayer: native damage through the hero's damage queue
; ($E1F1 = max(queued, amount)), 48 frames of grace, a burst on Goku.
; A16 = amount.
fight_damage:
	STA.w !f_tmp+14
	LDA.w !f_grace
	BNE .done
	LDA.l $7EE191
	AND.w #$0080
	BNE .done
	LDA.l $7EE182
	BEQ .done
	LDA.l $7EE1F1
	CMP.w !f_tmp+14
	BCS +
	LDA.w !f_tmp+14
	STA.l $7EE1F1
+	SEP #$20
	LDA.b #$00
	STA.l $7EE1F0
	STA.l $7EE1EC
	REP #$20
	LDA.w #48
	STA.w !f_grace
	INC.w !f_hits
	LDA.w !f_hx
	LDX.w !f_hy
	JSR fight_burst
	LDA.w #!AUDIO_SFX_FRIEZA_IMPACT
	JSL audio_sfx
.done
	RTS

; frieza.js burst: a hit spark (space.hits) with the impact cue and pulse.
; A16 = x, X16 = y.
fight_burst:
	PHA
	PHX
	LDY.w #(!HIT_N-1)*6
-	LDA.w !FS_HITS+4,Y
	CMP.w #54
	BCS .free
	TYA : SEC : SBC.w #$0006 : TAY
	BPL -
	LDY.w #$0000                   ; all busy: reuse the first
.free
	PLA : STA.w !FS_HITS+2,Y
	PLA : STA.w !FS_HITS+0,Y
	LDA.w #$0000 : STA.w !FS_HITS+4,Y
	LDA.w #!AUDIO_SFX_IMPACT
	JSL audio_sfx
	LDA.w #8
	STA.w !f_shake
	RTS

; ---------------------------------------------------------------------------
; orbit-duel.js orbitDefense: a threat in front of Frieza (a ki shot, or the
; wave being charged at >= 28) makes him side-step for 7 frames at 6 px.
; Carry set while evading.
fight_defense:
	LDX.w #!b_dodgecd : JSR fight_dec
	LDA.w !b_evn
	BEQ .check
	DEC.w !b_evn
	LDA.w #orbit_steps_6
	LDY.w !b_evh
	JSR orbit_step
	TXA
	CLC : ADC.w !b_x
	CMP.w #20 : BPL + : LDA.w #20
+	CMP.w #237 : BMI + : LDA.w #236
+	STA.w !b_x
	TYA
	CLC : ADC.w !b_y
	CMP.w #24 : BPL + : LDA.w #24
+	CMP.w #177 : BMI + : LDA.w #176
+	STA.w !b_y
	SEC
	RTS
.check
	LDA.w !b_dodgecd
	ORA.w !w_kind
	ORA.w !b_stun
	ORA.w !b_dash
	ORA.w !f_duel
	ORA.w !fn_phase
	ORA.w !f_intro
	BEQ +
	CLC
	RTS
+	; the shots
	LDX.w #(!FS_N-1)*8
.shot
	LDA.w !FS_SHOTS+6,X
	CMP.w #31
	BCS .nextShot
	PHX
	LDA.w !FS_SHOTS+0,X : STA.w !sw_ax
	LDA.w !FS_SHOTS+2,X : STA.w !sw_ay
	LDA.w !FS_SHOTS+4,X
	LDY.w #90
	JSR fight_threat
	PLX
	BCS .evade
.nextShot
	TXA : SEC : SBC.w #$0008 : TAX
	BPL .shot
	; the wave being charged
	LDA.w !f_charge
	CMP.w #28
	BCC .none
	LDA.w !f_hx : STA.w !sw_ax
	LDA.w !f_hy : STA.w !sw_ay
	LDA.w !f_heading
	LDY.w #240
	JSR fight_threat
	BCS .evade
.none
	CLC
	RTS
.evade
	; A = the threat's heading: dodge to the side with more room
	STA.w !f_tmp+6
	CLC : ADC.w #4
	AND.w #$000F
	STA.w !f_tmp+8                 ; (h + 4)
	LDA.w !f_tmp+6
	CLC : ADC.w #12
	AND.w #$000F
	STA.w !f_tmp+10                ; (h + 12)
	LDA.w !f_tmp+8
	JSR fight_room
	STA.w !f_tmp+12
	LDA.w !f_tmp+10
	JSR fight_room
	CMP.w !f_tmp+12
	BMI +                          ; sort keeps the first on ties
	BEQ +
	LDA.w !f_tmp+10
	BRA ++
+	LDA.w !f_tmp+8
++	STA.w !b_evh
	LDA.w #7
	STA.w !b_evn
	LDA.w #105
	STA.w !b_dodgecd
	STZ.w !b_windup
	SEC
	RTS

; A threat at (sw_ax, sw_ay) along heading A16 within reach Y16: Frieza
; ahead of it (12 < along < reach) and less than 20 px across. Carry set.
; Returns A16 = the heading.
fight_threat:
	STA.w !f_tmp+6
	STY.w !sw_len
	LDA.w !b_x : STA.w !sw_px
	LDA.w !b_y : STA.w !sw_py
	LDA.w !f_tmp+6
	JSR orbit_vec
	STX.w !m_t6
	STY.w !m_t7
	LDA.w !sw_px : SEC : SBC.w !sw_ax : STA.w !sw_dx
	LDX.w !m_t6
	JSR orbit_mul88
	STA.w !m_t4
	LDA.w !sw_py : SEC : SBC.w !sw_ay : STA.w !sw_dy
	LDX.w !m_t7
	JSR orbit_mul88
	CLC : ADC.w !m_t4
	CMP.w #13
	BMI .no
	CMP.w !sw_len
	BPL .no
	LDA.w !sw_dx
	LDX.w !m_t7
	JSR orbit_mul88
	STA.w !m_t4
	LDA.w !sw_dy
	LDX.w !m_t6
	JSR orbit_mul88
	SEC : SBC.w !m_t4
	JSR orbit_abs
	CMP.w #20
	BCS .no
	LDA.w !f_tmp+6
	SEC
	RTS
.no
	CLC
	RTS

; Room after a 42 px dodge along heading A16: min distance to the bounds
; (x 20-236, y 24-176), as orbitDefense's score.
fight_room:
	JSR orbit_vec                  ; X = vx, Y = vy
	STY.w !f_tmp+14
	LDA.w #42                      ; x = b.x + 42 vx / 256
	JSR orbit_mul88
	CLC : ADC.w !b_x
	STA.w !m_t4
	LDA.w #42
	LDX.w !f_tmp+14
	JSR orbit_mul88
	CLC : ADC.w !b_y
	STA.w !m_t5
	; min(x-20, 236-x, y-24, 176-y)
	LDA.w !m_t4 : SEC : SBC.w #20 : STA.w !m_t6
	LDA.w #236 : SEC : SBC.w !m_t4
	CMP.w !m_t6 : BPL + : STA.w !m_t6
+	LDA.w !m_t5 : SEC : SBC.w #24
	CMP.w !m_t6 : BPL + : STA.w !m_t6
+	LDA.w #176 : SEC : SBC.w !m_t5
	CMP.w !m_t6 : BPL + : STA.w !m_t6
+	LDA.w !m_t6
	RTS

; ---------------------------------------------------------------------------
; frieza-orbit.js tickOrbit (the parts that run with Frieza alive).
fight_tick_orbit:
	INC.w !f_age
	LDX.w !f_cooldown
	BEQ + : DEC.w !f_cooldown
+	LDX.w !f_teleport
	BEQ + : DEC.w !f_teleport
+	LDX.w !f_punch
	BEQ + : DEC.w !f_punch
+	LDX.w !f_duelcd
	BEQ + : DEC.w !f_duelcd
+	LDX.w !b_blink
	BEQ + : DEC.w !b_blink
+	; hit sparks age out at 54
	LDX.w #(!HIT_N-1)*6
-	LDA.w !FS_HITS+4,X
	CMP.w #54
	BCS +
	INC
	STA.w !FS_HITS+4,X
+	TXA : SEC : SBC.w #$0006 : TAX
	BPL -
	; the camera: longitude +2, travel +2; every 4 frames the radius steps
	; toward 68 (wave out), 84 (moving) or 104 and the centre toward the hero
	LDA.w !cam_lon
	CLC : ADC.w #2
	AND.w #$0FFF
	STA.w !cam_lon
	LDA.w !cam_tdx
	CLC : ADC.w #2
	STA.w !cam_tdx
	LDA.w !fn_phase                ; (not during the clash)
	BNE .camDone
	LDA.w !f_age
	AND.w #$0003
	BNE .camDone
	LDA.w #104
	LDX.w !f_moving
	BEQ +
	LDA.w #84
+	LDX.w !fb_on
	BEQ +
	LDA.w #68
+	CMP.w !cam_r
	BEQ .rOk
	BMI +
	INC.w !cam_r
	BRA .rOk
+	DEC.w !cam_r
.rOk
	; cx toward 95 - round((hero.x - 128) / 5)
	LDA.w !f_hx
	SEC : SBC.w #128
	JSR fight_round_div5
	EOR.w #$FFFF : INC
	CLC : ADC.w #95
	CMP.w !cam_x
	BEQ .xOk
	BMI +
	INC.w !cam_x
	BRA .xOk
+	DEC.w !cam_x
.xOk
	; cy toward 154 - round((hero.y - 112) / 8)
	LDA.w !f_hy
	SEC : SBC.w #112
	CLC : ADC.w #4                 ; Math.round(v / 8): floor((v + 4) / 8)
	CMP.w #$8000 : ROR
	CMP.w #$8000 : ROR
	CMP.w #$8000 : ROR
	EOR.w #$FFFF : INC
	CLC : ADC.w #154
	CMP.w !cam_y
	BEQ .camDone
	BMI +
	INC.w !cam_y
	BRA .camDone
+	DEC.w !cam_y
.camDone
	LDX.w !f_moving
	BEQ + : DEC.w !f_moving
+	; (debris: orbit-debris.js tickOrbitDebris, see debris.asm when added)
	LDA.w !f_intro
	BEQ +
	DEC.w !f_intro
	RTS
+	LDA.w !fn_phase
	BEQ +
	RTS
+	JSR fight_tick_shots
	JSR fight_tick_wave
	JMP fight_tick_ricochets

; A16 = round(signed A / 5) (Math.round: halves up).
fight_round_div5:
	; floor((2v + 5) / 10) with a bias of 1000 tens keeping it unsigned
	ASL
	CLC : ADC.w #5+10000
	STA.w $4204
	SEP #$20
	LDA.b #10
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	SEC : SBC.w #1000
	RTS

; Goku's ki shots: 7 px per frame; Frieza within 12 of the step: 240
; damage; the 30th frame continues as a ricochet into the distance.
fight_tick_shots:
	LDX.w #(!FS_N-1)*8
.shot
	LDA.w !FS_SHOTS+6,X
	CMP.w #31
	BCC +
	JMP .next
+	PHX
	LDA.w !FS_SHOTS+0,X : STA.w !sw_ax
	LDA.w !FS_SHOTS+2,X : STA.w !sw_ay
	LDA.w #orbit_steps_7
	LDY.w !FS_SHOTS+4,X
	JSR orbit_step
	TXA
	PLX
	PHX
	CLC : ADC.w !FS_SHOTS+0,X
	STA.w !FS_SHOTS+0,X
	STA.w !sw_bx
	TYA
	CLC : ADC.w !FS_SHOTS+2,X
	STA.w !FS_SHOTS+2,X
	STA.w !sw_by
	INC.w !FS_SHOTS+6,X
	; Frieza hit?
	LDA.w !b_x : STA.w !sw_px
	LDA.w !b_y : STA.w !sw_py
	LDY.w #12
	JSR orbit_swept
	PLX
	BCC .miss
	PHX
	LDA.w #240
	JSR fight_hurt
	LDA.w #!AUDIO_SFX_FRIEZA_IMPACT
	JSL audio_sfx
	PLX
	LDA.w #99
	STA.w !FS_SHOTS+6,X
	BRA .next
.miss
	; (scenery strikes: orbit-debris.js, with the bodies)
	LDA.w !FS_SHOTS+6,X
	CMP.w #30
	BNE .next
	PHX
	LDA.w !FS_SHOTS+4,X
	TAY
	LDA.w !FS_SHOTS+2,X
	PHA
	LDA.w !FS_SHOTS+0,X
	PLX
	JSR fight_ricochet_goku
	PLX
.next
	TXA : SEC : SBC.w #$0008 : TAX
	BMI +
	JMP .shot
+	RTS

; A16 = x, X16 = y, Y16 = heading: a ricochet owned by Goku (owner 0).
fight_ricochet_goku:
	STA.w !m_t4
	STX.w !m_t5
	TYA
	LDY.w #$0000
	BRA fight_ricochet_any
; Same, owned by Frieza (owner 1) or a countered shot (owner 2): Y16 = owner.
fight_ricochet:
	STA.w !m_t4
	STX.w !m_t5
	TYA
	PHA
	LDA.w !m_t6                    ; heading in m_t6 for this entry
	PLY
fight_ricochet_any:
	STA.w !m_t6
	STY.w !m_t7
	; the oldest slot is replaced when all 8 fly (ricochets.shift())
	LDX.w #(!RIC_N-1)*8
	STZ.w !f_tmp+0
	LDY.w #$0000
.find
	LDA.w !FS_RIC+6,X
	AND.w #$00FF
	CMP.w #45
	BCS .free
	CMP.w !f_tmp+0
	BCC +
	STA.w !f_tmp+0
	TXY
+	TXA : SEC : SBC.w #$0008 : TAX
	BPL .find
	TYX
.free
	LDA.w !m_t4 : STA.w !FS_RIC+0,X
	LDA.w !m_t5 : STA.w !FS_RIC+2,X
	LDA.w !m_t6 : STA.w !FS_RIC+4,X
	LDA.w !m_t7
	XBA
	AND.w #$FF00
	STA.w !FS_RIC+6,X              ; age 0, owner in the high byte
	RTS

; Goku's wave: width envelope min(1, age/6, (max-age)/10); Frieza ahead of
; the palms and within width+7 across takes the wave's damage every 6
; frames; Frieza's projectiles in it are countered (except beams/lasers).
fight_tick_wave:
	LDA.w !fb_on
	BNE +
	RTS
+	INC.w !fb_age
	JSR fight_wave_width           ; A = width (pixels)
	STA.w !f_tmp+6
	; Frieza
	LDA.w !b_x : STA.w !sw_px
	LDA.w !b_y : STA.w !sw_py
	LDA.w !fb_x : STA.w !sw_ax
	LDA.w !fb_y : STA.w !sw_ay
	LDA.w !f_tmp+6
	CLC : ADC.w #7
	STA.w !sw_r
	JSR fight_wave_lane            ; carry: along > 0 and across < r
	BCC .boss
	LDA.w !fb_age
	JSR fight_mod6
	BNE .boss
	LDA.w !fb_damage
	LDX.w #22
	CPX.w !f_gi
	BNE +
	LDA.w !fb_damage9
+	JSR fight_hurt_exact
	LDA.w #!AUDIO_SFX_FRIEZA_IMPACT
	JSL audio_sfx
.boss
	; counter Frieza's orbs and discs inside width + 10
	LDA.w !f_tmp+6
	CLC : ADC.w #10
	STA.w !f_tmp+8
	LDX.w #(!BS_N-1)*16
.counter
	LDA.w !FS_BOSS+!bs_kind,X
	CMP.w #!WK_DISC
	BCC .nextShot                  ; free, beam, laser
	LDA.w !FS_BOSS+!bs_age,X
	CMP.w #330
	BCS .nextShot
	PHX
	LDA.w !FS_BOSS+!bs_x,X : STA.w !sw_px
	LDA.w !FS_BOSS+!bs_y,X : STA.w !sw_py
	LDA.w !f_tmp+8 : STA.w !sw_r
	JSR fight_wave_lane
	PLX
	BCC .nextShot
	LDA.w #999
	STA.w !FS_BOSS+!bs_age,X
	PHX
	LDA.w !fb_head
	STA.w !m_t6
	LDY.w #2                       ; owner: countered ("clash")
	LDA.w !FS_BOSS+!bs_x,X
	PHA
	LDA.w !FS_BOSS+!bs_y,X
	TAX
	PLA
	JSR fight_ricochet
	LDA.w #!AUDIO_SFX_DEFLECT
	JSL audio_sfx
	LDA.w #4
	STA.w !f_shake
	PLX
.nextShot
	TXA : SEC : SBC.w #$0010 : TAX
	BPL .counter
	LDA.w !fb_age
	CMP.w !fb_max
	BCC +
	STZ.w !fb_on
+	RTS

; A16 = the wave's current width (pixels).
fight_wave_width:
	; envelope = min(1, age/6, (max-age)/10); width = fb_width * envelope
	LDA.w !fb_age
	CMP.w #6
	BCS .full
	; age/6: width * age / 6
	JSR .scaled6
	BRA .tail
.full
	LDA.w !fb_width
	XBA : AND.w #$00FF             ; integer width
.tail
	STA.w !m_t4
	LDA.w !fb_max
	SEC : SBC.w !fb_age
	CMP.w #10
	BCS .done
	; (max-age)/10 * width
	STA.w !m_t5
	LDA.w !fb_width
	XBA : AND.w #$00FF
	SEP #$20
	STA.w $4202
	LDA.w !m_t5
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	STA.w $4204
	SEP #$20
	LDA.b #10
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	CMP.w !m_t4
	BCS .done
	RTS
.done
	LDA.w !m_t4
	RTS
.scaled6
	LDA.w !fb_width
	XBA : AND.w #$00FF
	SEP #$20
	STA.w $4202
	LDA.w !fb_age
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	STA.w $4204
	SEP #$20
	LDA.b #6
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	RTS

; (sw_px, sw_py) relative to the wave (sw_ax, sw_ay, heading fb_head):
; carry set when along > 0 and across < sw_r.
fight_wave_lane:
	LDA.w !fb_head
	JSR orbit_vec
	STX.w !m_t6
	STY.w !m_t7
	LDA.w !sw_px : SEC : SBC.w !sw_ax : STA.w !sw_dx
	LDX.w !m_t6
	JSR orbit_mul88
	STA.w !m_t4
	LDA.w !sw_py : SEC : SBC.w !sw_ay : STA.w !sw_dy
	LDX.w !m_t7
	JSR orbit_mul88
	CLC : ADC.w !m_t4
	BMI .no
	BEQ .no
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
.no
	CLC
	RTS

; A16 mod 6 (A < 1024) via the divider.
fight_mod6:
	STA.w $4204
	SEP #$20
	LDA.b #6
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4216
	RTS

; Ricochets travel 12 px per frame for 45 frames (visible for 28).
fight_tick_ricochets:
	LDX.w #(!RIC_N-1)*8
-	LDA.w !FS_RIC+6,X
	AND.w #$00FF
	CMP.w #45
	BCS +
	INC.w !FS_RIC+6,X
	; (scenery strikes along the lane: with the bodies)
+	TXA : SEC : SBC.w #$0008 : TAX
	BPL -
	RTS

; ---------------------------------------------------------------------------
; orbit-duel.js exchange: four 18-frame beats at fixed sites, both fighters
; teleporting, Goku's punch on the 8th frame (450, the fourth 900). Carry
; set while it runs.
fight_begin_exchange:
	LDA.w !f_duel
	ORA.w !f_duelcd
	ORA.w !fn_phase
	BEQ +
	CLC
	RTS
+	LDA.w #$8000
	STA.w !f_duel                  ; bit 15: active, age (0) in the low bits
	STZ.w !f_charge
	LDX.w #(!FS_N-1)*8
-	LDA.w #$00FF : STA.w !FS_SHOTS+6,X
	TXA : SEC : SBC.w #$0008 : TAX
	BPL -
	JSR fight_clear_boss_shots
	STZ.w !w_kind
	STZ.w !b_dash
	STZ.w !b_windup
	STZ.w !b_evn
	STZ.w !b_guard
	SEC
	RTS

fight_exchange:
	LDA.w !f_duel
	BMI +
	CLC
	RTS
+	INC
	STA.w !f_duel
	AND.w #$7FFF
	DEC                            ; age - 1
	STA.w !f_tmp+0
	STA.w $4204
	SEP #$20
	LDA.b #18
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	STA.w !f_tmp+2                 ; index
	LDA.w $4216
	STA.w !f_tmp+4                 ; phase
	BEQ +
	JMP .notTeleport
+
	; phase 0: both appear at the site, Goku on the left of odd sites
	LDA.w !f_tmp+2
	AND.w #$0003
	ASL : ASL
	TAX
	LDA.l .sites,X : STA.w !f_tmp+6
	LDA.l .sites+2,X : STA.w !f_tmp+8
	LDA.w !f_tmp+2
	AND.w #$0001
	BNE .left
	LDA.w !f_tmp+6 : SEC : SBC.w #18 : STA.w !f_hx
	LDA.w !f_tmp+6 : CLC : ADC.w #18 : STA.w !b_x
	STZ.w !f_heading
	BRA +
.left
	LDA.w !f_tmp+6 : CLC : ADC.w #18 : STA.w !f_hx
	LDA.w !f_tmp+6 : SEC : SBC.w #18 : STA.w !b_x
	LDA.w #8 : STA.w !f_heading
+	LDA.w !f_tmp+8
	STA.w !f_hy
	STA.w !b_y
	LDA.w #6
	STA.w !f_teleport
	STA.w !b_blink
	STZ.w !f_punch
	LDA.w #!AUDIO_SFX_TELEPORT
	JSL audio_sfx
	; the camera turns with the exchange
	LDA.w !cam_tdx
	CLC : ADC.w #128
	STA.w !cam_tdx
	LDA.w !cam_lon
	CLC : ADC.w #128
	AND.w #$0FFF
	STA.w !cam_lon
	LDA.w #8
	STA.w !f_moving
.notTeleport
	LDA.w !f_tmp+4
	CMP.w #7
	BNE .notPunch
	LDA.w #7
	STA.w !f_punch
	LDA.w #450
	LDX.w !f_tmp+2
	CPX.w #3
	BNE +
	LDA.w #900
+	JSR fight_hurt_exchange
	LDA.w #!AUDIO_SFX_FRIEZA_IMPACT
	JSL audio_sfx
	LDA.w #5
	LDX.w !f_tmp+2
	CPX.w #3
	BNE +
	LDA.w #9
+	STA.w !f_shake
.notPunch
	LDA.w !f_duel
	AND.w #$7FFF
	CMP.w #72
	BCC .running
	; end: cooldowns, Frieza 48 px right, Goku 28 left
	STZ.w !f_duel
	LDA.w #180 : STA.w !f_duelcd
	LDA.w #90 : STA.w !b_dodgecd
	LDA.w #65 : STA.w !b_clock
	STZ.w !b_guard
	LDA.w !b_x
	CLC : ADC.w #48
	CMP.w #24 : BPL + : LDA.w #24
+	CMP.w #233 : BMI + : LDA.w #232
+	STA.w !b_x
	LDA.w !f_hx
	SEC : SBC.w #28
	CMP.w #24 : BPL + : LDA.w #24
+	STA.w !f_hx
.running
	SEC
	RTS
.sites
	dw 196,68, 64,136, 170,144, 106,64

; The exchange's punches use hurt directly (not melee).
fight_hurt_exchange:
	JMP fight_hurt

; ---------------------------------------------------------------------------
; frieza.js tick, orbital AI: stun, node rushes every 105 frames, the
; warning clock and fire().
fight_ai:
	LDA.w !b_stun
	BEQ +
	DEC.w !b_stun
	RTS
+	LDA.w !f_evading
	ORA.w !f_firing
	BEQ +
	RTS
+	; steering = a disc younger than 260 is out
	STZ.w !f_tmp+4
	LDX.w #(!BS_N-1)*16
-	LDA.w !FS_BOSS+!bs_kind,X
	CMP.w #!WK_DISC
	BNE +
	LDA.w !FS_BOSS+!bs_age,X
	CMP.w #260
	BCS +
	INC.w !f_tmp+4
+	TXA : SEC : SBC.w #$0010 : TAX
	BPL -
	; a new node every 105 frames (6-frame wind-up)
	LDA.w !f_tmp+4
	ORA.w !w_kind
	ORA.w !b_dash
	ORA.w !b_windup
	BNE .noNode
	LDA.w !b_age
	STA.w $4204
	SEP #$20
	LDA.b #105
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4216
	BNE .noNode
	LDA.w !b_node
	INC
	AND.w #$0003
	STA.w !b_node
	LDA.w #6
	STA.w !b_windup
.noNode
	LDA.w !b_windup
	BEQ .noWind
	DEC.w !b_windup
	BNE .noWind
	LDA.w #$0001
	STA.w !b_dash
	LDA.w #!AUDIO_SFX_FRIEZA_RUSH
	JSL audio_sfx
.noWind
	LDA.w !b_dash
	BEQ .noDash
	LDA.w !f_tmp+4
	ORA.w !w_kind
	BNE .noDash
	; an afterimage every third dash frame, then orbitRush
	LDA.w !b_dash
	JSR fight_mod3
	CMP.w #1
	BNE +
	JSR fight_afterimage
+	JSR fight_rush
	LDA.w !b_dash
	BNE .noDash
	LDA.w !b_counter
	BEQ .noDash
	STZ.w !b_counter
	LDA.w #!WK_LASER
	STA.w !w_kind
	STZ.w !w_age
	LDA.w #70
	STA.w !w_wait
	LDA.w !f_hx : STA.w !w_tx
	LDA.w !f_hy : STA.w !w_ty
.noDash
	LDA.w !w_kind
	BEQ .noWarn
	INC.w !w_age
	LDA.w !w_age
	CMP.w !w_wait
	BCC +
	JMP fight_fire
+	RTS
.noWarn
	LDA.w !b_dash
	ORA.w !b_windup
	BNE +
	DEC.w !b_clock
	BEQ fight_attack
	BMI fight_attack
+	RTS

; frieza.js attack: the next kind of the orbital pattern; beams wait 75
; frames, the rest 55 (Frieza is enraged in orbit).
fight_attack:
	LDA.w !b_cycle
	INC.w !b_cycle
	JSR fight_mod7
	TAX
	LDA.l .pattern,X
	AND.w #$00FF
	STA.w !w_kind
	STZ.w !w_age
	LDA.w #55
	LDX.w !w_kind
	CPX.w #!WK_BEAM
	BNE +
	LDA.w #75
+	STA.w !w_wait
	LDA.w !f_hx : STA.w !w_tx
	LDA.w !f_hy : STA.w !w_ty
	RTS
.pattern
	db !WK_BEAM, !WK_LASER, !WK_BEAM, !WK_DISC, !WK_BEAM, !WK_LASER, !WK_ORB

fight_mod3:
	STA.w $4204
	SEP #$20
	LDA.b #3
	BRA fight_modN
fight_mod7:
	STA.w $4204
	SEP #$20
	LDA.b #7
fight_modN:
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4216
	RTS

fight_afterimage:
	LDX.w #3*6
-	LDA.w !FS_AFTER+4,X
	CMP.w #16
	BCS .free
	TXA : SEC : SBC.w #$0006 : TAX
	BPL -
	RTS
.free
	LDA.w !b_x : STA.w !FS_AFTER+0,X
	LDA.w !b_y : STA.w !FS_AFTER+2,X
	STZ.w !FS_AFTER+4,X
	RTS

; orbit-pixels.js orbitRush: 7 px per frame toward the node; snap within 8.
fight_rush:
	LDA.w !b_node
	ASL : ASL
	TAX
	LDA.l fight_nodes,X : SEC : SBC.w !b_x : STA.w !f_tmp+6
	LDA.l fight_nodes+2,X : SEC : SBC.w !b_y : STA.w !f_tmp+8
	PHX
	LDA.w !f_tmp+6
	LDX.w !f_tmp+8
	LDY.w #9
	JSR orbit_near                 ; hypot <= 8
	PLX
	BCC +
	LDA.l fight_nodes,X : STA.w !b_x
	LDA.l fight_nodes+2,X : STA.w !b_y
	STZ.w !b_dash
	RTS
+	LDA.w !f_tmp+6
	LDX.w !f_tmp+8
	JSR orbit_heading
	TAY
	LDA.w #orbit_steps_7
	JSR orbit_step
	TXA : CLC : ADC.w !b_x : STA.w !b_x
	TYA : CLC : ADC.w !b_y : STA.w !b_y
	INC.w !b_dash
	RTS

; frieza.js fire (orbit): from the pointing finger (lasers) or 5 px above
; Frieza toward the target: beam/laser along the heading, two discs at
; heading +-2, one orb; speed 4. Clock 140, recoil 9; the cue; laughs on
; the 2nd and 8th attack.
fight_fire:
	JSR fight_finger                ; X = x, Y = y of the shot's origin
	STX.w !f_tmp+6
	STY.w !f_tmp+8
	LDA.w !w_tx : SEC : SBC.w !f_tmp+6 : PHA
	LDA.w !w_ty : SEC : SBC.w !f_tmp+8 : TAX
	PLA
	JSR orbit_heading
	STA.w !f_tmp+10
	LDA.w !w_kind
	CMP.w #!WK_DISC
	BEQ .discs
	LDA.w !f_tmp+10
	JSR fight_add_shot
	BRA .after
.discs
	LDA.w !f_tmp+10
	SEC : SBC.w #2
	AND.w #$000F
	JSR fight_add_shot
	LDA.w !f_tmp+10
	CLC : ADC.w #2
	AND.w #$000F
	JSR fight_add_shot
.after
	; the cue for the kind
	LDA.w !w_kind
	ASL
	TAX
	LDA.l .cues-2,X
	JSL audio_sfx
	STZ.w !w_kind
	LDA.w #140
	STA.w !b_clock
	LDA.w #9
	STA.w !b_recoil
	LDA.w !b_cycle
	CMP.w #2
	BEQ .laugh
	CMP.w #8
	BNE +
.laugh
	LDA.w #!AUDIO_SFX_FRIEZA_LAUGH
	JSL audio_sfx
+	RTS
.cues
	dw !AUDIO_SFX_FRIEZA_BEAM, !AUDIO_SFX_FRIEZA_LASER, !AUDIO_SFX_FRIEZA_DISC, !AUDIO_SFX_FRIEZA_ORB

; frieza-sprite.js friezaDeathBeamPose (orbit, muscular): while a laser
; charges or flies, the fingertip is at (x - 11, y - 1), or (x + 10, y - 1)
; when he points right. Otherwise shots start 5 px above him.
; -> X16 = x, Y16 = y.
fight_finger:
	LDA.w !w_kind
	CMP.w #!WK_LASER
	BNE .plain
	LDA.w !w_tx
	CMP.w !b_x
	BEQ +
	BPL .right
+	LDA.w !b_x : SEC : SBC.w #11 : TAX
	BRA +
.right
	LDA.w !b_x : CLC : ADC.w #10 : TAX
+	LDA.w !b_y : DEC : TAY
	RTS
.plain
	LDX.w !b_x
	LDA.w !b_y : SEC : SBC.w #5 : TAY
	RTS

; A new shot of the warning's kind at (f_tmp+6, f_tmp+8), heading A16.
; Twelve at most: the oldest goes first (b.shots.splice).
fight_add_shot:
	STA.w !f_tmp+12
	LDX.w #(!BS_N-1)*16
	STZ.w !f_tmp+14
	LDY.w #$0000
.find
	LDA.w !FS_BOSS+!bs_kind,X
	BEQ .free
	LDA.w !FS_BOSS+!bs_age,X
	CMP.w #330
	BCS .free
	CMP.w !f_tmp+14
	BCC +
	STA.w !f_tmp+14
	TXY
+	TXA : SEC : SBC.w #$0010 : TAX
	BPL .find
	TYX
.free
	LDA.w !w_kind : STA.w !FS_BOSS+!bs_kind,X
	LDA.w !f_tmp+6 : STA.w !FS_BOSS+!bs_x,X : STA.w !FS_BOSS+!bs_px,X
	LDA.w !f_tmp+8 : STA.w !FS_BOSS+!bs_y,X : STA.w !FS_BOSS+!bs_py,X
	LDA.w !f_tmp+12 : STA.w !FS_BOSS+!bs_head,X
	LDA.w #4 : STA.w !FS_BOSS+!bs_speed,X
	STZ.w !FS_BOSS+!bs_age,X
	RTS

; ---------------------------------------------------------------------------
; Frieza's shots (frieza.js tick): beams grow 30 px a frame for 42 frames
; (180 every 6 frames to Goku within width+4); lasers hit on their first
; frame only (170, within 8); discs home one heading every 12 frames and
; can return to Frieza (12,000 after 40 frames) or hit Goku (230 after
; 10); orbs fly straight (310 within 20) and ricochet into the distance
; when they leave the screen.
fight_boss_shots:
	LDX.w #(!BS_N-1)*16
.shot
	LDA.w !FS_BOSS+!bs_kind,X
	BNE +
	JMP .next
+	LDA.w !FS_BOSS+!bs_age,X
	CMP.w #330
	BCC +
	STZ.w !FS_BOSS+!bs_kind,X      ; spent
	JMP .next
+	LDA.w !FS_BOSS+!bs_x,X : STA.w !FS_BOSS+!bs_px,X
	LDA.w !FS_BOSS+!bs_y,X : STA.w !FS_BOSS+!bs_py,X
	LDA.w !FS_BOSS+!bs_kind,X
	CMP.w #!WK_BEAM
	BNE .notBeam
	JMP .beam
.notBeam
	CMP.w #!WK_LASER
	BNE .notLaser
	JMP .laser
.notLaser
	CMP.w #!WK_DISC
	BNE +
	JMP .disc
+	; orb: straight, 4 px
	PHX
	LDA.w #orbit_steps_4
	LDY.w !FS_BOSS+!bs_head,X
	JSR orbit_step
	TXA
	PLX
	CLC : ADC.w !FS_BOSS+!bs_x,X
	STA.w !FS_BOSS+!bs_x,X
	TYA
	CLC : ADC.w !FS_BOSS+!bs_y,X
	STA.w !FS_BOSS+!bs_y,X
	INC.w !FS_BOSS+!bs_age,X
	; hit Goku (within 20 of the step)?
	JSR fight_shot_swept
	LDY.w #20
	PHX
	JSR orbit_swept
	PLX
	BCS .orbHit
	; out = age > 15 and outside 8..248 x 8..205
	LDA.w !FS_BOSS+!bs_age,X
	CMP.w #16
	BCC .orbNext
	LDA.w !FS_BOSS+!bs_x,X
	CMP.w #8 : BMI .orbOut
	CMP.w #249 : BPL .orbOut
	LDA.w !FS_BOSS+!bs_y,X
	CMP.w #8 : BMI .orbOut
	CMP.w #206 : BPL .orbOut
.orbNext
	JMP .next
.orbOut
	LDA.w #999
	STA.w !FS_BOSS+!bs_age,X
	PHX
	LDA.w !FS_BOSS+!bs_head,X
	STA.w !m_t6
	LDY.w #1                       ; Frieza's
	LDA.w !FS_BOSS+!bs_x,X
	PHA
	LDA.w !FS_BOSS+!bs_y,X
	TAX
	PLA
	JSR fight_ricochet
	PLX
	JMP .next
.orbHit
	LDA.w #999
	STA.w !FS_BOSS+!bs_age,X
	PHX
	LDA.w #310
	JSR fight_damage
	PLX
	JMP .next
.disc
	; home: every 12 frames turn one heading toward Goku
	LDA.w !FS_BOSS+!bs_age,X
	PHX
	JSR fight_mod12
	PLX
	CMP.w #$0000
	BNE .discStep
	PHX
	LDA.w !f_hx : SEC : SBC.w !FS_BOSS+!bs_x,X : PHA
	LDA.w !f_hy : SEC : SBC.w !FS_BOSS+!bs_y,X : TAX
	PLA
	JSR orbit_heading
	PLX
	; delta = ((desired - heading + 24) & 15) - 8; heading += sign(delta)
	SEC : SBC.w !FS_BOSS+!bs_head,X
	CLC : ADC.w #24
	AND.w #$000F
	SEC : SBC.w #8
	BEQ .discStep
	BMI +
	LDA.w !FS_BOSS+!bs_head,X : INC : BRA ++
+	LDA.w !FS_BOSS+!bs_head,X : DEC
++	AND.w #$000F
	STA.w !FS_BOSS+!bs_head,X
.discStep
	PHX
	LDA.w #orbit_steps_4
	LDY.w !FS_BOSS+!bs_head,X
	JSR orbit_step
	TXA
	PLX
	CLC : ADC.w !FS_BOSS+!bs_x,X
	STA.w !FS_BOSS+!bs_x,X
	TYA
	CLC : ADC.w !FS_BOSS+!bs_y,X
	STA.w !FS_BOSS+!bs_y,X
	INC.w !FS_BOSS+!bs_age,X
	; discContact: back into Frieza after 40 frames (radius 20), Goku after
	; 10 (radius 14)
	LDA.w !FS_BOSS+!bs_age,X
	CMP.w #41
	BCC .discGoku
	JSR fight_shot_swept
	LDA.w !b_x : STA.w !sw_px
	LDA.w !b_y : STA.w !sw_py
	LDY.w #20
	PHX
	JSR orbit_swept
	PLX
	BCC .discGoku
	LDA.w #999
	STA.w !FS_BOSS+!bs_age,X
	PHX
	LDA.w #12000
	JSR fight_hurt_disc
	PLX
	JMP .next
.discGoku
	LDA.w !FS_BOSS+!bs_age,X
	CMP.w #11
	BCC .discNext
	JSR fight_shot_swept
	LDY.w #14
	PHX
	JSR orbit_swept
	PLX
	BCC .discNext
	LDA.w #999
	STA.w !FS_BOSS+!bs_age,X
	PHX
	LDA.w #230
	JSR fight_damage
	PLX
.discNext
	JMP .next
.beam
	INC.w !FS_BOSS+!bs_age,X
	LDA.w !FS_BOSS+!bs_age,X
	CMP.w #42
	BCC +
	LDA.w #999
	STA.w !FS_BOSS+!bs_age,X
	JMP .next
+	; width = 12 * min(1, age/6, (42-age)/8); every 6 frames vs Goku
	PHX
	JSR fight_mod6
	PLX
	CMP.w #$0000
	BNE .beamNext
	LDA.w !FS_BOSS+!bs_age,X
	JSR fight_boss_beam_width
	CMP.w #$0000
	BEQ .beamNext
	CLC : ADC.w #4
	STA.w !sw_r
	LDA.w !f_hx : STA.w !sw_px
	LDA.w !f_hy : STA.w !sw_py
	LDA.w !FS_BOSS+!bs_x,X : STA.w !sw_ax
	LDA.w !FS_BOSS+!bs_y,X : STA.w !sw_ay
	; length = min(360, age * 30)
	LDA.w !FS_BOSS+!bs_age,X
	PHX
	SEP #$20
	STA.w $4202
	LDA.b #30
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	CMP.w #360
	BCC +
	LDA.w #360
+	LDY.w !FS_BOSS+!bs_head,X
	JSR orbit_ray_hit
	PLX
	BCC .beamNext
	PHX
	LDA.w #180
	JSR fight_damage
	PLX
.beamNext
	JMP .next
.laser
	INC.w !FS_BOSS+!bs_age,X
	LDA.w !FS_BOSS+!bs_age,X
	CMP.w #16
	BCC +
	LDA.w #999
	STA.w !FS_BOSS+!bs_age,X
	BRA .next
+	CMP.w #1
	BNE .next
	LDA.w #8
	STA.w !sw_r
	LDA.w !f_hx : STA.w !sw_px
	LDA.w !f_hy : STA.w !sw_py
	LDA.w !FS_BOSS+!bs_x,X : STA.w !sw_ax
	LDA.w !FS_BOSS+!bs_y,X : STA.w !sw_ay
	PHX
	LDA.w #360
	LDY.w !FS_BOSS+!bs_head,X
	JSR orbit_ray_hit
	PLX
	BCC .next
	PHX
	LDA.w #170
	JSR fight_damage
	PLX
.next
	TXA : SEC : SBC.w #$0010 : TAX
	BMI +
	JMP .shot
+	RTS

; The shot X's last step against Goku: sw_ax/ay = previous, sw_bx/by = now.
fight_shot_swept:
	LDA.w !FS_BOSS+!bs_px,X : STA.w !sw_ax
	LDA.w !FS_BOSS+!bs_py,X : STA.w !sw_ay
	LDA.w !FS_BOSS+!bs_x,X : STA.w !sw_bx
	LDA.w !FS_BOSS+!bs_y,X : STA.w !sw_by
	LDA.w !f_hx : STA.w !sw_px
	LDA.w !f_hy : STA.w !sw_py
	RTS

fight_mod12:
	STA.w $4204
	SEP #$20
	LDA.b #12
	JMP fight_modN

; A16 = Frieza's beam width for age A (12 * min(1, age/6, (42-age)/8)).
fight_boss_beam_width:
	STA.w !m_t4
	CMP.w #6
	BCS +
	; 12 * age / 6 = 2 age
	ASL
	BRA .tail
+	LDA.w #12
.tail
	STA.w !m_t5
	LDA.w #42
	SEC : SBC.w !m_t4              ; 42 - age
	CMP.w #8
	BCS .done
	; 12 * (42 - age) / 8 = 1.5 (42 - age), floored as the browser's float
	STA.w !m_t6
	LSR
	CLC : ADC.w !m_t6
	CMP.w !m_t5
	BCS .done
	RTS
.done
	LDA.w !m_t5
	RTS
