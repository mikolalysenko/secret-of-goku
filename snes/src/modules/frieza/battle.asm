; Ground fight (frieza.js startBattle / tick battle branch, frieza-combat.js).
; Hot state in WRAM; projectiles, eruptions, afterimages and the arena in
; the scene SRAM block $32:7800-7FFF (frieza.md: the orbit stream uses
; $32:6000-77FF while it owns the fight).

fz_battle_reset:
	SEP #$20
	STZ !fzf_flags
	REP #$20
	LDA.w #$0000
	STA !fz_atlas
	RTS

; Empty the projectile, eruption and afterimage tables and the arena.
fz_battle_clear_sram:
	LDA.w #$5A46
	STA.l !fzs_tag
	LDA.w #$0000
	LDX.w #$012C
-	STA.l !FZSB+$002,X
	DEX
	DEX
	BPL -
	SEP #$20
	LDA.b #0
	STA.l !fzv_on
	STA.l !fzv_white
	LDA.b #$FF
	STA.l !fzs_rip
	LDX.w #(!FZ_AFTER_N-1)*6
-	STA.l !FZ_AFTER+!af_age,X
	DEX
	DEX
	DEX
	DEX
	DEX
	DEX
	BPL -
	REP #$20
	JSR fz_arena_clear
	RTS

; C set while a power surge holds the fight (inputLocked).
fz_battle_surging:
	LDA !fzf_flags
	AND.w #!FZFF_ACTIVE
	BEQ +
	LDA.l !fzs_surge
	AND.w #$00FF
	BEQ +
	SEC
	RTS
+	CLC
	RTS

; C set while the fight is in space or the orbit stream owns the picture.
fz_battle_space:
	LDA !fzf_flags
	AND.w #!FZFF_SPACE
	BEQ +
	SEC
	RTS
+	JMP fz_bind_orbit_owns

; C set when the ground fight runs (s.boss, stage battle, map 246).
fz_battle_live:
	LDA !fzf_flags
	AND.w #!FZFF_ACTIVE|!FZFF_SPACE
	CMP.w #!FZFF_ACTIVE
	BNE .no
	JSR fz_stage
	CMP.w #!FZST_BATTLE
	BNE .no
	LDA $DC
	CMP.w #246
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; startBattle(): carry the court pose into combat, nodes around Goku.
fz_start_battle:
	STZ !fz_t0
	JSR fz_scene_kind
	BEQ .nocourt
	LDA !fz_sflags
	AND.w #!FZSF_COURT
	BEQ .nocourt
	JSR fz_scene_pose
	LDA !fz_px
	CLC
	ADC !fz_cam_x
	STA !fz_t1                        ; arrival x (map)
	LDA !fz_py
	CLC
	ADC !fz_cam_y
	SEC
	SBC.w #8
	STA !fz_t2                        ; arrival y - 8
	INC !fz_t0
.nocourt
	LDA.w #!FZST_BATTLE
	JSR fz_set_stage
	JSR fz_scene_clear
	SEP #$20
	STZ !fzf_nodes
	REP #$20
	LDA !fz_t0
	BEQ +
	LDA !fz_t1
	STA !fzf_node_x
	LDA !fz_t2
	STA !fzf_node_y
	SEP #$20
	INC !fzf_nodes
	REP #$20
+	JSR fz_start_nodes
	LDA !fzf_node_x
	STA !fzf_x
	LDA !fzf_node_y
	STA !fzf_y
	LDA.w #!FRIEZA_HP_LO
	STA !fzf_hp_lo
	LDA.w #!FRIEZA_HP_HI
	STA !fzf_hp_hi
	STZ !fzf_age
	LDA.w #90
	STA !fzf_clock
	LDA $E00B
	AND.w #$00FF
	STA !fzf_terrain
	SEP #$20
	STZ !fzf_cycle
	STZ !fzf_node
	STZ !fzf_tier
	STZ !fzf_stun
	LDA.b #60
	STA !fzf_grace
	STZ !fzf_hurt
	STZ !fzf_recoil
	STZ !fzf_guard
	STZ !fzf_dash
	STZ !fzf_windup
	LDA.b #!FZFF_ACTIVE
	STA !fzf_flags
	REP #$20
	STZ !fz_atlas
	JSR fz_battle_clear_sram
	LDA.w #!FZW_CANCEL
	JSR fz_defer
	JSR fz_bind_radio_restore
	RTS

; Append the five patrol nodes around Goku, kept where local flight's
; canLand accepts them (frieza.js startBattle).
fz_start_nodes:
	STZ !fz_t3                        ; offset table index (bytes)
.loop
	LDX !fz_t3
	LDA $E002
	CLC
	ADC.l fz_node_dx,X
	STA !fz_t5                        ; node x
	LDA $E004
	SEC
	SBC.w #12
	CLC
	ADC.l fz_node_dy,X
	STA !fz_t4                        ; node y
	CLC
	ADC.w #12
	STA !fz_t6                        ; its feet
	JSR fz_bind_can_land              ; C set: walkable floor
	BCC .skip
	LDA !fzf_nodes
	AND.w #$00FF
	ASL
	TAX
	LDA !fz_t5
	STA !fzf_node_x,X
	LDA !fz_t4
	STA !fzf_node_y,X
	SEP #$20
	INC !fzf_nodes
	REP #$20
.skip
	LDA !fz_t3
	INC
	INC
	STA !fz_t3
	CMP.w #10
	BCC .loop
	LDA !fzf_nodes
	AND.w #$00FF
	BNE .done
	LDA $E002
	STA !fzf_node_x
	LDA $E004
	SEC
	SBC.w #36
	STA !fzf_node_y
	SEP #$20
	INC !fzf_nodes
	REP #$20
.done
	RTS
fz_node_dx:
	dw -60,60,60,-60,0
fz_node_dy:
	dw -50,-50,30,30,-30

; A16 = node count.
fz_node_count:
	LDA !fzf_nodes
	AND.w #$00FF
	RTS

; ---------------------------------------------------------------------------
; hero(): Goku's position (feet - 12).
fz_hero:
	LDA $E002
	STA !fz_hx
	LDA $E004
	SEC
	SBC.w #12
	STA !fz_hy
	RTS

; Per-frame battle logic (frieza.js tick(), stage battle on map 246).
fz_battle_tick:
	JSR fz_battle_live
	BCS +
	RTS
+	; the block must hold this fight (power-on SRAM, other scenes)
	LDA.l !fzs_tag
	CMP.w #$5A46
	BEQ +
	JSR fz_battle_clear_sram
+
if defined("FRIEZA_TEST")
	JSR fz_test_mailbox
endif
	; menus, events and dialogue pause the fight; so does a fallen Goku
	JSR fz_native_field
	BCS +
	RTS
+	LDA $D0
	AND.w #$00FF
	BEQ +
	RTS
+	LDA $EC
	AND.w #$00FE
	BEQ +
	RTS
+	LDA !fz_tflags
	AND.w #!FZT_FORCED
	BEQ +
	RTS
+	LDA $E182
	BNE +
	RTS
+	LDA $E191
	AND.w #$0080
	BEQ +
	RTS
+	JSR fz_hero
	INC !fzf_age
	SEP #$20
	LDA !fzf_grace
	BEQ +
	DEC !fzf_grace
+	LDA !fzf_hurt
	BEQ +
	DEC !fzf_hurt
+	LDA !fzf_recoil
	BEQ +
	DEC !fzf_recoil
+	LDA !fzf_guard
	BEQ +
	DEC !fzf_guard
+	REP #$20
	JSR fz_arena_tick
	JSR fz_after_tick
	; HP thresholds start the surges; damage cannot skip them
	LDA.l !fzs_surge
	AND.w #$00FF
	BNE .surge
	LDA !fzf_tier
	AND.w #$00FF
	CMP.w #2
	BCS .fight
	JSR fz_threshold_hp               ; A16 = (2 - tier) * 32000
	STA !fz_t0
	LDA !fzf_hp_hi
	BNE .fight
	LDA !fzf_hp_lo
	CMP !fz_t0
	BEQ +
	BCS .fight
+	JSR fz_begin_surge
	BCS .surge
	RTS
.surge
	JMP fz_surge_tick
.fight
	; a laser still flashing holds him in place
	JSR fz_firing
	BCS .shots
	LDA.l !fzs_rip
	AND.w #$00FF
	CMP.w #$00FF
	BEQ .noriposte
	JSR fz_riposte_tick
	BRA .shots
.noriposte
	LDA !fzf_stun
	AND.w #$00FF
	BEQ .move
	SEP #$20
	DEC !fzf_stun
	REP #$20
	BRA .shots
.move
	JSR fz_patrol
.shots
	JSR fz_shots_tick
	JSR fz_hazards_tick
	RTS

; A16 = (2 - tier) * FRIEZA_HP / 3.
fz_threshold_hp:
	LDA !fzf_tier
	AND.w #$00FF
	BEQ .one
	CMP.w #1
	BEQ .two
	LDA.w #0                          ; ground stand-in for space: no floor
	RTS
.two
	LDA.w #32000
	RTS
.one
	LDA.w #64000
	RTS

; C set when the native field loop is installed (mod.nativeField).
fz_native_field:
	LDA.l $000100
	CMP.w #$A85C
	BNE .no
	LDA.l $000102
	CMP.w #$00C0
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; A threshold ends the phase, not the shot that earned it: while Goku's
; beam still shines, Frieza reels (projectiles dropped) and the surge waits.
; C set when the surge began.
fz_begin_surge:
	JSR fz_bind_goku_beam_live
	BCC +
	JSR fz_drop_attacks
	CLC
	RTS
+	SEP #$20
	INC !fzf_tier
	STZ !fzf_stun
	LDA.b #$FF
	STA.l !fzs_rip
	REP #$20
	JSR fz_drop_attacks
	LDA !fzf_tier
	AND.w #$00FF
	CMP.w #2
	BCS .cosmic
	LDA.w #1
	BRA +
.cosmic
	LDA.w #2
+	SEP #$20
	STA.l !fzs_surge
	REP #$20
	LDA.w #$0000
	STA.l !fzs_sage
	; the Fortress's screen position, or 2000 (frieza-cinematic target)
	LDA $0128
	BNE +
	LDA.w #2000
+	STA.l !fzs_tgx
	LDA $012A
	BNE +
	LDA.w #2000
+	STA.l !fzs_tgy
	LDA.w #!FZW_CANCEL
	JSR fz_defer
	JSR fz_bind_radio_restore
	LDA.w #!FZ_SFX_ORB
	JSR fz_sfx
	LDA.l !fzs_surge
	AND.w #$00FF
	CMP.w #1
	BNE +
	JSR fz_bind_full_power_lines
+	SEC
	RTS

; Clear the shots, the warning and the eruptions.
fz_drop_attacks:
	JSR fz_shots_clear
	SEP #$20
	LDA.b #$00
	STA.l !fzs_wkind
	REP #$20
	LDX.w #(!FZ_HAZ_N-1)*8
-	LDA.w #$0000
	STA.l !FZ_HAZ+!hz_on,X
	TXA
	SEC
	SBC.w #8
	TAX
	BPL -
	RTS

fz_shots_clear:
	LDX.w #(!FZ_SHOT_N-1)*16
-	LDA.w #$0000
	STA.l !FZ_SHOTS+!sh_kind,X
	TXA
	SEC
	SBC.w #16
	TAX
	BPL -
	RTS

; The surges (frieza.js b.surge branch). The first lasts 380 frames: at 270
; Frieza reaches his muscular form and the floor fractures under him, at
; 294 around every node. The second ('frieza-cosmic') is the orbit
; stream's: the fractures at 24 and 48, then FRIEZA_ORBIT_SURGE runs it.
fz_surge_tick:
	LDA.l !fzs_sage
	INC
	STA.l !fzs_sage
	STA !fz_t0
	LDA.l !fzs_surge
	AND.w #$00FF
	CMP.w #1
	BEQ .breach
	LDA !fz_t0
	CMP.w #24
	BNE +
	JSR fz_surge_impact
+	LDA !fz_t0
	CMP.w #48
	BNE +
	LDA.w #29
	STA !fz_t6
	LDA.w #5
	STA !fz_t7
	JSR fz_surge_nodes
+	JMP fz_bind_orbit_surge           ; the orbit stream owns the rest
.breach
	LDA !fz_t0
	CMP.w #270
	BNE +
	SEP #$20
	LDA.b #!FZFF_MUSCULAR
	TSB !fzf_flags
	REP #$20
	LDA.w #$0010
	STA !fz_atlas
	LDA.w #!FZ_SFX_POWER_BURST
	JSR fz_sfx
	JSR fz_burst_flash
	JSR fz_surge_impact
+	LDA !fz_t0
	CMP.w #294
	BNE +
	LDA.w #19
	STA !fz_t6
	LDA.w #3
	STA !fz_t7
	JSR fz_surge_nodes
+	LDA !fz_t0
	CMP.w #380
	BCC .out
	; the surge ends: he evades, Goku's input settles
	SEP #$20
	LDA.b #$00
	STA.l !fzs_surge
	LDA.b #60
	STA !fzf_grace
	REP #$20
	LDA.w #150
	STA !fzf_clock
	JSR fz_evade_melee
	JSR fz_bind_cancel_input
.out
	RTS

; breakFloor(b.x, b.y + 12, 34) and the screen burst.
fz_surge_impact:
	LDA !fzf_x
	STA !fz_ax
	LDA !fzf_y
	CLC
	ADC.w #12
	STA !fz_ay
	LDA.w #34
	JSR fz_break_floor_loud
	JMP fz_burst_flash

; breakFloor around every node: radius !fz_t6 + i * !fz_t7, quietly, then
; one Fortress-break sound and a 16-frame quake.
fz_surge_nodes:
	STZ !fz_t5
.loop
	JSR fz_node_count
	CMP !fz_t5
	BEQ .done
	BCC .done
	LDA !fz_t5
	ASL
	TAX
	LDA !fzf_node_x,X
	STA !fz_ax
	LDA !fzf_node_y,X
	CLC
	ADC.w #12
	STA !fz_ay
	LDA !fz_t5
	LDX !fz_t7
	JSR fz_mul8
	CLC
	ADC !fz_t6
	JSR fz_break_floor
	INC !fz_t5
	BRA .loop
.done
	LDA.w #!FZ_SFX_FORTRESS
	JSR fz_sfx
	LDA.w #16
	JMP fz_pulse

; C set while a laser shot is younger than 16 frames (firing).
fz_firing:
	LDX.w #(!FZ_SHOT_N-1)*16
-	LDA.l !FZ_SHOTS+!sh_kind,X
	AND.w #$00FF
	CMP.w #!FZK_LASER
	BNE +
	LDA.l !FZ_SHOTS+!sh_age,X
	CMP.w #16
	BCS +
	SEC
	RTS
+	TXA
	SEC
	SBC.w #16
	TAX
	BPL -
	CLC
	RTS

; C set while a disc younger than 260 frames is in flight (steering).
fz_steering:
	LDX.w #(!FZ_SHOT_N-1)*16
-	LDA.l !FZ_SHOTS+!sh_kind,X
	AND.w #$00FF
	CMP.w #!FZK_DISC
	BNE +
	LDA.l !FZ_SHOTS+!sh_age,X
	CMP.w #260
	BCS +
	SEC
	RTS
+	TXA
	SEC
	SBC.w #16
	TAX
	BPL -
	CLC
	RTS

; C set while any shot is in flight.
fz_any_shot:
	LDX.w #(!FZ_SHOT_N-1)*16
-	LDA.l !FZ_SHOTS+!sh_kind,X
	AND.w #$00FF
	BEQ +
	SEC
	RTS
+	TXA
	SEC
	SBC.w #16
	TAX
	BPL -
	CLC
	RTS

; A16 % X8 and A16 / X8 via the CPU divider: A16 = remainder, !fz_m5 = quotient.
fz_divmod:
	STA.l $004204
	SEP #$20
	TXA
	STA.l $004206
	REP #$20
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	LDA.l $004214
	STA !fz_m5
	LDA.l $004216
	RTS

; Patrol, windup, rush, warning and attack clock (the !evading branch).
fz_patrol:
	STZ !fz_t4
	JSR fz_steering
	ROL !fz_t4                        ; bit 0 = steering
	; a new rush every 105 frames when idle
	LDA !fz_t4
	BNE .noRush
	LDA.l !fzs_wkind
	AND.w #$00FF
	BNE .noRush
	LDA !fzf_dash                     ; dash and windup
	BNE .noRush
	LDA !fzf_age
	LDX.w #105
	JSR fz_divmod
	CMP.w #0
	BNE .noRush
	SEP #$20
	LDA !fzf_node
	INC
	CMP !fzf_nodes
	BCC +
	LDA.b #$00
+	STA !fzf_node
	LDA.b #6
	STA !fzf_windup
	REP #$20
.noRush
	; the windup ends in a dash
	LDA !fzf_windup
	AND.w #$00FF
	BEQ +
	SEP #$20
	DEC !fzf_windup
	REP #$20
	BNE +
	SEP #$20
	LDA.b #1
	STA !fzf_dash
	REP #$20
	LDA.w #!FZ_SFX_RUSH
	JSR fz_sfx
+	; dash toward the node (not while steering discs or warning)
	LDA !fzf_dash
	AND.w #$00FF
	BEQ .warning
	LDA !fz_t4
	BNE .warning
	LDA.l !fzs_wkind
	AND.w #$00FF
	BNE .warning
	LDA !fzf_dash
	AND.w #$00FF
	LDX.w #3
	JSR fz_divmod
	CMP.w #1
	BNE +
	JSR fz_after_push
+	JSR fz_rush_step
	LDA !fzf_dash
	AND.w #$00FF
	BNE .warning
	LDA !fzf_flags
	AND.w #!FZFF_COUNTER
	BEQ .warning
	; the guarded retreat ends in an aimed laser
	SEP #$20
	LDA.b #!FZFF_COUNTER
	TRB !fzf_flags
	REP #$20
	LDA.w #!FZK_LASER
	LDX.w #70
	JSR fz_warn
.warning
	LDA.l !fzs_wkind
	AND.w #$00FF
	BEQ .clock
	SEP #$20
	LDA.l !fzs_wage
	INC
	STA.l !fzs_wage
	CMP.l !fzs_wwait
	REP #$20
	BCC .out
	JMP fz_fire
.clock
	LDA !fzf_dash                     ; dash and windup
	BNE .out
	DEC !fzf_clock
	BEQ +
	BPL .out
+	LDA !fzf_tier
	AND.w #$00FF
	BNE .attack
	JSR fz_any_shot
	BCS .out
.attack
	JMP fz_attack
.out
	RTS

; rushStep(): 7 px toward the node, snapping within 7 px.
fz_rush_step:
	LDA !fzf_node
	AND.w #$00FF
	ASL
	TAX
	LDA !fzf_node_x,X
	SEC
	SBC !fzf_x
	STA !fz_t0                        ; dx
	LDA !fzf_node_y,X
	SEC
	SBC !fzf_y
	STA !fz_t1                        ; dy
	; hypot <= 7 <=> dx^2 + dy^2 < 50
	LDA !fz_t0
	JSR fz_abs
	CMP.w #8
	BCS .step
	STA !fz_t2
	LDA !fz_t1
	JSR fz_abs
	CMP.w #8
	BCS .step
	TAX
	JSR fz_mul8
	STA !fz_t3
	LDA !fz_t2
	TAX
	JSR fz_mul8
	CLC
	ADC !fz_t3
	CMP.w #50
	BCS .step
	; arrived
	LDA !fzf_node
	AND.w #$00FF
	ASL
	TAX
	LDA !fzf_node_x,X
	STA !fzf_x
	LDA !fzf_node_y,X
	STA !fzf_y
	SEP #$20
	STZ !fzf_dash
	REP #$20
	RTS
.step
	LDA !fz_t0
	LDX !fz_t1
	JSR fz_atan2
	LDX.w #2                          ; 7 px
	JSR fz_step
	LDA !fzf_x
	CLC
	ADC !fz_m0
	STA !fzf_x
	LDA !fzf_y
	CLC
	ADC !fz_m1
	STA !fzf_y
	SEP #$20
	INC !fzf_dash
	REP #$20
	RTS

; A16 = kind, X16 = wait: a warning aimed at Goku now.
fz_warn:
	SEP #$20
	STA.l !fzs_wkind
	TXA
	STA.l !fzs_wwait
	LDA.b #$00
	STA.l !fzs_wage
	REP #$20
	LDA !fzf_x
	STA.l !fzs_wx
	LDA !fzf_y
	STA.l !fzs_wy
	LDA !fz_hx
	STA.l !fzs_wtx
	LDA !fz_hy
	STA.l !fzs_wty
	RTS

; attack(): the next kind of orb / disc / laser with its warning; in phase
; two every third attack also marks an eruption under Goku.
fz_attack:
	LDA !fzf_cycle
	AND.w #$00FF
	LDX.w #3
	JSR fz_divmod                     ; cycle % 3: 0 orb, 1 disc, 2 laser
	INC
	STA !fz_t0
	SEP #$20
	INC !fzf_cycle
	REP #$20
	LDX.w #65
	LDA !fzf_tier
	AND.w #$00FF
	BEQ +
	LDX.w #55
+	LDA !fz_t0
	JSR fz_warn
	LDA !fzf_tier
	AND.w #$00FF
	BEQ .out
	; cycle (after ++) % 3 == 0: an eruption at Goku's feet
	LDA !fzf_cycle
	AND.w #$00FF
	LDX.w #3
	JSR fz_divmod
	CMP.w #0
	BNE .out
	JSR fz_hazard_add
.out
	RTS

; A hazard {x: h.x, y: h.y + 12, wait 65, radius 28}.
fz_hazard_add:
	LDX.w #0
-	LDA.l !FZ_HAZ+!hz_on,X
	AND.w #$00FF
	BEQ .found
	TXA
	CLC
	ADC.w #8
	TAX
	CPX.w #!FZ_HAZ_N*8
	BCC -
	RTS
.found
	LDA.w #28<<8|1
	STA.l !FZ_HAZ+!hz_on,X
	LDA !fz_hx
	STA.l !FZ_HAZ+!hz_x,X
	LDA !fz_hy
	CLC
	ADC.w #12
	STA.l !FZ_HAZ+!hz_y,X
	LDA.w #65<<8
	STA.l !FZ_HAZ+!hz_age,X
	RTS

; friezaDeathBeamPose(b): while a laser is charged or fresh, Frieza points.
; C set with !fz_t5/!fz_t6 = pointer anchor (map), !fz_t7 = flip,
; !fz_ax/!fz_ay = fingertip (map).
fz_pointer:
	LDA.l !fzs_wkind
	AND.w #$00FF
	CMP.w #!FZK_LASER
	BNE .shot
	; charging: flip = target.x > b.x
	STZ !fz_t7
	LDA.l !fzs_wtx
	SEC
	SBC !fzf_x
	BEQ .pose
	BMI .pose
	INC !fz_t7
	BRA .pose
.shot
	LDX.w #(!FZ_SHOT_N-1)*16
-	LDA.l !FZ_SHOTS+!sh_kind,X
	AND.w #$00FF
	CMP.w #!FZK_LASER
	BNE +
	LDA.l !FZ_SHOTS+!sh_age,X
	CMP.w #16
	BCS +
	LDA.l !FZ_SHOTS+!sh_flip,X
	AND.w #$00FF
	STA !fz_t7
	BRA .pose
+	TXA
	SEC
	SBC.w #16
	TAX
	BPL -
	CLC
	RTS
.pose
	LDA !fzf_x
	STA !fz_t5
	LDA !fzf_y
	CLC
	ADC.w #8
	STA !fz_t6
	; finger x = x - 24 + (flip ? 47 - fingerX : fingerX), fingerX = 6 (2 muscular)
	LDA !fzf_flags
	AND.w #!FZFF_MUSCULAR
	BEQ +
	LDA.w #2
	BRA ++
+	LDA.w #6
++	LDX !fz_t7
	BEQ +
	EOR.w #$FFFF
	SEC
	ADC.w #47
+	CLC
	ADC !fz_t5
	SEC
	SBC.w #24
	STA !fz_ax
	LDA !fz_t6
	SEC
	SBC.w #22
	STA !fz_ay
	SEC
	RTS

; fire(): launch the warned attack from the hand that charged it.
fz_fire:
	JSR fz_pointer
	BCS +
	LDA !fzf_x
	STA !fz_ax
	LDA !fzf_y
	SEC
	SBC.w #24
	STA !fz_ay
	STZ !fz_t7
+	; angle to the target
	LDA.l !fzs_wtx
	SEC
	SBC !fz_ax
	PHA
	LDA.l !fzs_wty
	SEC
	SBC !fz_ay
	TAX
	PLA
	JSR fz_atan2
	STA !fz_t2                        ; angle
	LDA.l !fzs_wkind
	AND.w #$00FF
	CMP.w #!FZK_LASER
	BNE .disc
	; laser: the nearest of the sixteen headings
	LDA !fz_t2
	XBA
	AND.w #$00FF
	TAX
	LDA.l frieza_heading_table,X
	AND.w #$000F
	STA !fz_t2
	LDA.w #!FZK_LASER
	JSR fz_shot_add
	LDA.w #!FZ_SFX_LASER
	STA !fz_t4
	LDA.w #2
	JMP .fired
.disc
	CMP.w #!FZK_DISC
	BNE .orb
	LDA !fzf_tier
	AND.w #$00FF
	BEQ .disc1
	; two discs at -0.85 and +0.85 rad, 4 px
	LDA !fz_t2
	PHA
	SEC
	SBC.w #8865
	STA !fz_t2
	LDA.w #!FZK_DISC|$100
	JSR fz_shot_add
	PLA
	CLC
	ADC.w #8865
	STA !fz_t2
	LDA.w #!FZK_DISC|$100
	JSR fz_shot_add
	BRA .discSound
.disc1
	LDA.w #!FZK_DISC
	JSR fz_shot_add
.discSound
	LDA.w #!FZ_SFX_DISC
	STA !fz_t4
	LDA.w #2
	BRA .fired
.orb
	LDA !fzf_tier
	AND.w #$00FF
	BEQ .orb1
	; three orbs at -0.45, 0, +0.45 rad, 4 px
	LDA !fz_t2
	PHA
	SEC
	SBC.w #4694
	STA !fz_t2
	LDA.w #!FZK_ORB|$100
	JSR fz_shot_add
	LDA $01,S
	STA !fz_t2
	LDA.w #!FZK_ORB|$100
	JSR fz_shot_add
	PLA
	CLC
	ADC.w #4694
	STA !fz_t2
	LDA.w #!FZK_ORB|$100
	JSR fz_shot_add
	BRA .orbSound
.orb1
	LDA.w #!FZK_ORB
	JSR fz_shot_add
.orbSound
	LDA.w #!FZ_SFX_ORB
	STA !fz_t4
	LDA.w #4
.fired
	; recovery window, recoil, sound and a short quake
	JSR fz_pulse
	LDA !fz_t4
	JSR fz_sfx
	SEP #$20
	LDA.b #$00
	STA.l !fzs_wkind
	LDA.b #9
	STA !fzf_recoil
	REP #$20
	LDA !fzf_tier
	AND.w #$00FF
	BEQ +
	LDA.w #140
	BRA ++
+	LDA.w #180
++	STA !fzf_clock
	LDA !fzf_cycle
	AND.w #$00FF
	CMP.w #2
	BEQ .laugh
	CMP.w #8
	BNE .out
.laugh
	JSR fz_laugh
.out
	RTS

; Add a shot: A16 = kind | speed << 8, at (!fz_ax, !fz_ay), angle or
; heading !fz_t2, flip !fz_t7. The oldest shot gives way past 12.
fz_shot_add:
	STA !fz_t3
	LDX.w #0
-	LDA.l !FZ_SHOTS+!sh_kind,X
	AND.w #$00FF
	BEQ .found
	TXA
	CLC
	ADC.w #16
	TAX
	CPX.w #!FZ_SHOT_N*16
	BCC -
	JSR fz_shot_oldest
.found
	SEP #$20
	LDA !fz_t3
	STA.l !FZ_SHOTS+!sh_kind,X
	LDA !fz_t7
	STA.l !FZ_SHOTS+!sh_flip,X
	LDA !fz_t3+1
	STA.l !FZ_SHOTS+!sh_speed,X
	REP #$20
	LDA !fz_ax
	STA.l !FZ_SHOTS+!sh_x,X
	STA.l !FZ_SHOTS+!sh_px,X
	LDA !fz_ay
	STA.l !FZ_SHOTS+!sh_y,X
	STA.l !FZ_SHOTS+!sh_py,X
	LDA !fz_t2
	STA.l !FZ_SHOTS+!sh_ang,X
	LDA.w #0
	STA.l !FZ_SHOTS+!sh_age,X
	RTS

; X = offset of the oldest live shot.
fz_shot_oldest:
	STZ !fz_t5
	STZ !fz_t6
	LDX.w #(!FZ_SHOT_N-1)*16
-	LDA.l !FZ_SHOTS+!sh_age,X
	CMP !fz_t5
	BCC +
	STA !fz_t5
	STX !fz_t6
+	TXA
	SEC
	SBC.w #16
	TAX
	BPL -
	LDX !fz_t6
	RTS

; ---------------------------------------------------------------------------
; Projectiles (the shot loop of tick()).
fz_shots_tick:
	LDX.w #(!FZ_SHOT_N-1)*16
.loop
	STX !fz_sx_i
	LDA.l !FZ_SHOTS+!sh_kind,X
	AND.w #$00FF
	BEQ .next
	CMP.w #!FZK_LASER
	BEQ .laser
	CMP.w #!FZK_DISC
	BEQ .disc
	JSR fz_orb_step
	BRA .next
.laser
	JSR fz_laser_step
	BRA .next
.disc
	JSR fz_disc_step
.next
	LDA !fz_sx_i
	SEC
	SBC.w #16
	TAX
	BPL .loop
	RTS

; Remove shot X.
fz_shot_kill:
	LDA.w #$0000
	STA.l !FZ_SHOTS+!sh_kind,X
	RTS

; The previous position (for the swept tests).
fz_shot_prev:
	LDA.l !FZ_SHOTS+!sh_x,X
	STA.l !FZ_SHOTS+!sh_px,X
	LDA.l !FZ_SHOTS+!sh_y,X
	STA.l !FZ_SHOTS+!sh_py,X
	RTS

; Laser: hits Goku once when it appears (within 8 px of the 360 px ray),
; gone after 16 frames.
fz_laser_step:
	JSR fz_shot_prev
	LDA.l !FZ_SHOTS+!sh_age,X
	INC
	STA.l !FZ_SHOTS+!sh_age,X
	CMP.w #1
	BNE +
	JSR fz_laser_hits
	LDX !fz_sx_i
	BCC +
	LDA.w #170
	JSR fz_damage_player
	LDX !fz_sx_i
+	LDA.l !FZ_SHOTS+!sh_age,X
	CMP.w #16
	BCC +
	JSR fz_shot_kill
+	RTS

; C set when Goku is within 8 px of laser X's ray (360 px along heading).
fz_laser_hits:
	LDA.l !FZ_SHOTS+!sh_ang,X
	AND.w #$000F
	ASL
	ASL
	TAY
	LDA !fz_hx
	SEC
	SBC.l !FZ_SHOTS+!sh_x,X
	STA !fz_t0                        ; rel x
	LDA !fz_hy
	SEC
	SBC.l !FZ_SHOTS+!sh_y,X
	STA !fz_t1                        ; rel y
	TYX
	LDA.l frieza_orbit_vectors,X
	STA !fz_t5                        ; vx (8.8)
	LDA.l frieza_orbit_vectors+2,X
	STA !fz_t6                        ; vy
	; along = (rx*vx + ry*vy) / 256
	LDA !fz_t0
	LDY !fz_t5
	JSR fz_smul88
	STA !fz_t2
	LDA !fz_t1
	LDY !fz_t6
	JSR fz_smul88
	CLC
	ADC !fz_t2
	BMI .start
	CMP.w #361
	BCS .no
	; across = |rx*vy - ry*vx| / 256
	LDA !fz_t0
	LDY !fz_t6
	JSR fz_smul88
	STA !fz_t3
	LDA !fz_t1
	LDY !fz_t5
	JSR fz_smul88
	EOR.w #$FFFF
	SEC
	ADC !fz_t3
	JSR fz_abs
	CMP.w #8
	BCS .no
	SEC
	RTS
.start
	LDA !fz_t0
	LDX !fz_t1
	LDY.w #8
	JMP fz_dist_lt
.no
	CLC
	RTS

; Signed A16 x Y16 (8.8, |Y| <= 256) / 256 -> A16 (truncated toward zero).
fz_smul88:
	STA !fz_m6
	STY !fz_m7
	JSR fz_abs
	STA !fz_m0
	LDA !fz_m7
	JSR fz_abs
	STA !fz_m1
	JSR fz_mul16
	LDA !fz_m2
	XBA
	AND.w #$00FF
	STA !fz_m4
	LDA !fz_m3
	XBA
	AND.w #$FF00
	ORA !fz_m4                        ; (m3:m2) >> 8
	STA !fz_m4
	LDA !fz_m6
	EOR !fz_m7
	BPL +
	LDA !fz_m4
	EOR.w #$FFFF
	INC
	RTS
+	LDA !fz_m4
	RTS

; Disc: homes on Goku, turning .032 rad a frame (.038 under half HP);
; after 40 frames it can strike Frieza (12,000 HP, stun, floor), after 10
; Goku (230).
fz_disc_step:
	JSR fz_shot_prev
	LDA !fz_hx
	SEC
	SBC.l !FZ_SHOTS+!sh_x,X
	PHA
	LDA !fz_hy
	SEC
	SBC.l !FZ_SHOTS+!sh_y,X
	TAX
	PLA
	JSR fz_atan2                      ; wanted
	LDX !fz_sx_i
	SEC
	SBC.l !FZ_SHOTS+!sh_ang,X         ; signed delta (wraps)
	STA !fz_t0
	LDA.w #333                        ; .032 rad
	LDY !fzf_hp_hi
	BNE +
	LDY !fzf_hp_lo
	CPY.w #48000
	BCS +
	LDA.w #396                        ; .038 rad under half HP
+	STA !fz_t1
	LDA !fz_t0
	BMI .neg
	CMP !fz_t1
	BCC .turn
	LDA !fz_t1
	BRA .turn
.neg
	EOR.w #$FFFF
	INC
	CMP !fz_t1
	BCC +
	LDA !fz_t1
+	EOR.w #$FFFF
	INC
.turn
	CLC
	ADC.l !FZ_SHOTS+!sh_ang,X
	STA.l !FZ_SHOTS+!sh_ang,X
	PHA
	LDA.l !FZ_SHOTS+!sh_speed,X
	AND.w #$00FF
	TAX
	PLA
	JSR fz_step
	LDX !fz_sx_i
	LDA.l !FZ_SHOTS+!sh_x,X
	CLC
	ADC !fz_m0
	STA.l !FZ_SHOTS+!sh_x,X
	LDA.l !FZ_SHOTS+!sh_y,X
	CLC
	ADC !fz_m1
	STA.l !FZ_SHOTS+!sh_y,X
	LDA.l !FZ_SHOTS+!sh_age,X
	INC
	STA.l !FZ_SHOTS+!sh_age,X
	; Goku's beam cancels it
	JSR fz_counter_shot
	BCC +
	RTS
+	; armed: Frieza first, then Goku (discContact)
	LDA.l !FZ_SHOTS+!sh_age,X
	CMP.w #41
	BCC .goku
	LDA !fzf_x
	STA !fz_ax
	LDA !fzf_y
	STA !fz_ay
	LDY.w #20
	JSR fz_shot_near
	BCC .goku
	JSR fz_shot_kill
	LDA.w #12000
	STA !fz_dmg
	JSR fz_hurt_disc
	RTS
.goku
	LDX !fz_sx_i
	LDA.l !FZ_SHOTS+!sh_age,X
	CMP.w #11
	BCC .out
	LDA !fz_hx
	STA !fz_ax
	LDA !fz_hy
	STA !fz_ay
	LDY.w #14
	JSR fz_shot_near
	BCC .out
	JSR fz_shot_kill
	LDA.w #230
	JSR fz_damage_player
.out
	LDX !fz_sx_i
	LDA.l !FZ_SHOTS+!sh_age,X
	CMP.w #330
	BCC +
	JSR fz_shot_kill
+	RTS

; C set when (!fz_ax, !fz_ay) is within Y16 px of shot X's last step
; (sweptDistance; the step is a few pixels, its two ends are tested).
fz_shot_near:
	STY !fz_t5
	LDA.l !FZ_SHOTS+!sh_x,X
	SEC
	SBC !fz_ax
	PHA
	LDA.l !FZ_SHOTS+!sh_y,X
	SEC
	SBC !fz_ay
	TAX
	PLA
	LDY !fz_t5
	JSR fz_dist_lt
	LDX !fz_sx_i
	BCS .yes
	LDA.l !FZ_SHOTS+!sh_px,X
	SEC
	SBC !fz_ax
	PHA
	LDA.l !FZ_SHOTS+!sh_py,X
	SEC
	SBC !fz_ay
	TAX
	PLA
	LDY !fz_t5
	JSR fz_dist_lt
	LDX !fz_sx_i
.yes
	RTS

; Orb: straight at 3 (4 enraged) px a frame; hits Goku within 20 px (310),
; or leaves the screen after 15 frames; either breaks the floor.
fz_orb_step:
	JSR fz_shot_prev
	LDA.l !FZ_SHOTS+!sh_age,X
	INC
	STA.l !FZ_SHOTS+!sh_age,X
	LDA.l !FZ_SHOTS+!sh_speed,X
	AND.w #$00FF
	TAY
	LDA.l !FZ_SHOTS+!sh_ang,X
	TYX
	JSR fz_step
	LDX !fz_sx_i
	LDA.l !FZ_SHOTS+!sh_x,X
	CLC
	ADC !fz_m0
	STA.l !FZ_SHOTS+!sh_x,X
	LDA.l !FZ_SHOTS+!sh_y,X
	CLC
	ADC !fz_m1
	STA.l !FZ_SHOTS+!sh_y,X
	JSR fz_counter_shot
	BCC +
	RTS
+	LDA !fz_hx
	STA !fz_ax
	LDA !fz_hy
	STA !fz_ay
	LDY.w #20
	JSR fz_shot_near
	BCC .out
	; hit: the floor under it breaks, Goku takes 310
	JSR fz_shot_floor_pt
	JSR fz_shot_kill
	LDA.w #20
	JSR fz_break_floor_loud
	LDA.w #310
	JMP fz_damage_player
.out
	; past 15 frames, outside the screen's 8 px margin
	LDA.l !FZ_SHOTS+!sh_age,X
	CMP.w #16
	BCC .stay
	JSR fz_camera
	LDX !fz_sx_i
	LDA.l !FZ_SHOTS+!sh_x,X
	SEC
	SBC !fz_cam_x
	CMP.w #8
	BMI .gone
	CMP.w #249
	BPL .gone
	LDA.l !FZ_SHOTS+!sh_y,X
	SEC
	SBC !fz_cam_y
	CMP.w #8
	BMI .gone
	CMP.w #206
	BPL .gone
.stay
	LDA.l !FZ_SHOTS+!sh_age,X
	CMP.w #330
	BCC +
	JSR fz_shot_kill
+	RTS
.gone
	JSR fz_shot_floor_pt
	JSR fz_shot_kill
	LDA.w #28
	JMP fz_break_floor_loud

; !fz_ax/!fz_ay = the floor under shot X (y + 12).
fz_shot_floor_pt:
	LDA.l !FZ_SHOTS+!sh_x,X
	STA !fz_ax
	LDA.l !FZ_SHOTS+!sh_y,X
	CLC
	ADC.w #12
	STA !fz_ay
	RTS

; counterShot(): Goku's live beam cancels the shot (impact spark, deflect).
; C set when cancelled.
fz_counter_shot:
	JSR fz_bind_beam_touches          ; C set: the beam covers shot X
	LDX !fz_sx_i
	BCC .no
	LDA.l !FZ_SHOTS+!sh_x,X
	STA !fz_ax
	LDA.l !FZ_SHOTS+!sh_y,X
	STA !fz_ay
	JSR fz_shot_kill
	JSR fz_fx_impact
	LDA.w #!FZ_SFX_DEFLECT
	JSR fz_sfx
	LDX !fz_sx_i
	SEC
	RTS
.no
	CLC
	RTS

; ---------------------------------------------------------------------------
; Eruptions (hazards): at the end of the warning the deck breaks (32) and
; Goku within the radius takes 280; they linger 24 frames.
fz_hazards_tick:
	LDX.w #(!FZ_HAZ_N-1)*8
.loop
	STX !fz_sx_i
	LDA.l !FZ_HAZ+!hz_on,X
	AND.w #$00FF
	BNE +
	JMP .next
+
	SEP #$20
	LDA.l !FZ_HAZ+!hz_age,X
	INC
	STA.l !FZ_HAZ+!hz_age,X
	CMP.l !FZ_HAZ+!hz_wait,X
	REP #$20
	BNE .linger
	LDA.l !FZ_HAZ+!hz_x,X
	STA !fz_ax
	LDA.l !FZ_HAZ+!hz_y,X
	STA !fz_ay
	LDA.w #32
	JSR fz_break_floor_loud
	JSR fz_fx_explode
	LDX !fz_sx_i
	LDA.l !FZ_HAZ+!hz_r,X
	AND.w #$00FF
	STA !fz_t5
	LDA !fz_hx
	SEC
	SBC.l !FZ_HAZ+!hz_x,X
	STA !fz_t0
	LDA !fz_hy
	CLC
	ADC.w #12
	SEC
	SBC.l !FZ_HAZ+!hz_y,X
	TAX
	LDA !fz_t0
	LDY !fz_t5
	JSR fz_dist_lt
	BCC .linger
	LDA.w #280
	JSR fz_damage_player
.linger
	LDX !fz_sx_i
	LDA.l !FZ_HAZ+!hz_wait,X
	AND.w #$00FF
	CLC
	ADC.w #24
	STA !fz_t0
	LDA.l !FZ_HAZ+!hz_age,X
	AND.w #$00FF
	CMP !fz_t0
	BCC .next
	LDA.w #0
	STA.l !FZ_HAZ+!hz_on,X
.next
	LDA !fz_sx_i
	SEC
	SBC.w #8
	TAX
	BMI +
	JMP .loop
+	RTS

; ---------------------------------------------------------------------------
; The riposte: two quick melee hits in phase two make Frieza coil (18
; frames) and blast everything within 48 px (280), then retreat.
fz_riposte_tick:
	SEP #$20
	LDA.l !fzs_rip
	INC
	STA.l !fzs_rip
	REP #$20
	AND.w #$00FF
	CMP.w #18
	BNE .late
	LDA !fz_hx
	SEC
	SBC !fzf_x
	PHA
	LDA !fz_hy
	SEC
	SBC !fzf_y
	TAX
	PLA
	LDY.w #48
	JSR fz_dist_lt
	BCC +
	LDA.w #280
	JSR fz_damage_player
	LDA.w #!FZW_CANCEL
	JSR fz_defer
+	LDA !fzf_x
	STA !fz_ax
	LDA !fzf_y
	STA !fz_ay
	JSR fz_burst
	LDA.w #!FZ_SFX_IMPACT
	JMP fz_sfx
.late
	CMP.w #30
	BCC .out
	SEP #$20
	LDA.b #$FF
	STA.l !fzs_rip
	REP #$20
	JSR fz_evade_melee
.out
	RTS

; ---------------------------------------------------------------------------
; Damage both ways.

; damagePlayer(amount): A16 = damage. Halved in phase one; 48 frames of
; grace; queued on Goku through the native consumer.
fz_damage_player:
	STA !fz_dmg
	JSR fz_battle_live
	BCC .out
	LDA !fzf_grace
	AND.w #$00FF
	BNE .out
	LDA $E191
	AND.w #$0080
	BNE .out
	LDA $E182
	BEQ .out
	LDA !fzf_tier
	AND.w #$00FF
	BNE +
	LDA !fz_dmg
	INC
	LSR                               ; ceil(amount / 2)
	STA !fz_dmg
+	LDA !fz_dmg
	CMP $E1F1
	BCC +
	STA $E1F1
+	SEP #$20
	STZ $E1F0
	STZ $E1EC
	LDA.b #48
	STA !fzf_grace
	REP #$20
	LDA.l !fzs_phits
	INC
	STA.l !fzs_phits
	JSR fz_hero
	LDA !fz_hx
	STA !fz_ax
	LDA !fz_hy
	STA !fz_ay
	JSR fz_burst
	LDA.w #!FZ_SFX_IMPACT
	JSR fz_sfx
.out
	RTS

; burst(x, y): an impact spark, the impact sound and an 8-frame quake.
fz_burst:
	JSR fz_fx_impact
	LDA.w #!FZ_SFX_HIT_IMPACT
	JSR fz_sfx
	LDA.w #8
	JMP fz_pulse

; feedback.burst(): the gold-white flash and a 9-frame quake.
fz_burst_flash:
	JSR fz_fx_flash
	LDA.w #9
	JMP fz_pulse

; hurt(amount, disc): !fz_dmg = amount. Returns A16 = HP taken. The HP
; floor of the phase (64,000 / 32,000) cannot be crossed by one hit.
fz_hurt_disc:
	LDA.w #1
	BRA fz_hurt_common
fz_hurt:
	LDA.w #0
fz_hurt_common:
	STA !fz_hdisc
	JSR fz_battle_live
	BCC .none0
	LDA.l !fzs_surge
	AND.w #$00FF
	BNE .none0
	LDA !fzf_guard
	AND.w #$00FF
	BEQ +
.none0
	JMP .none
+	; room = hp - floor (>= 0)
	JSR fz_threshold_hp
	STA !fz_t5
	LDA !fzf_hp_lo
	SEC
	SBC !fz_t5
	STA !fz_t6
	LDA !fzf_hp_hi
	SBC.w #0
	BMI .none0
	BNE .full                         ; room > 65535: the whole hit
	LDA !fz_dmg
	CMP !fz_t6
	BCC .full
	LDA !fz_t6
	STA !fz_dmg
.full
	LDA !fzf_hp_lo
	SEC
	SBC !fz_dmg
	STA !fzf_hp_lo
	LDA !fzf_hp_hi
	SBC.w #0
	STA !fzf_hp_hi
	BNE +
	LDA !fzf_hp_lo
	BNE +
	; his fall (only without a floor: the ground stand-in of the last phase)
	LDA !fz_dmg
	PHA
	JSR fz_win
	PLA
	RTS
+
	SEP #$20
	LDA.b #10
	STA !fzf_hurt
	REP #$20
	LDA !fz_hdisc
	BEQ .hit
	; his own disc: stun, burst, floor
	LDA.l !fzs_dischits
	INC
	STA.l !fzs_dischits
	SEP #$20
	LDA.b #75
	STA !fzf_stun
	REP #$20
	LDA !fzf_x
	STA !fz_ax
	LDA !fzf_y
	STA !fz_ay
	JSR fz_burst
	LDA !fzf_y
	CLC
	ADC.w #12
	STA !fz_ay
	LDA.w #26
	JSR fz_break_floor_loud
	LDA.w #!FZ_SFX_IMPACT
	JSR fz_sfx
	LDA !fz_dmg
	RTS
.hit
	LDA !fz_dmg
	BEQ .none
	; an impact burst at most every 18 frames
	LDA !fzf_age
	SEC
	SBC.l !fzs_limpact
	CMP.w #19
	BCC .done
	LDA !fzf_age
	STA.l !fzs_limpact
	LDA !fzf_x
	STA !fz_ax
	LDA !fzf_y
	STA !fz_ay
	JSR fz_burst
	LDA.w #!FZ_SFX_IMPACT
	JSR fz_sfx
.done
	LDA !fz_dmg
	RTS
.none
	LDA.w #0
	RTS

; melee(amount): a punch. In phase two, two hits within 120 frames make
; him counter (riposte).
fz_melee:
	JSR fz_hurt
	STA !fz_t7
	BEQ .out
	LDA !fzf_tier
	AND.w #$00FF
	BEQ .out
	LDA !fzf_stun
	AND.w #$00FF
	BNE .out
	LDA !fzf_age
	SEC
	SBC.l !fzs_lmelee
	CMP.w #121
	SEP #$20
	BCC +
	LDA.b #1
	BRA ++
+	LDA.l !fzs_mhits
	INC
++	STA.l !fzs_mhits
	REP #$20
	LDA !fzf_age
	STA.l !fzs_lmelee
	LDA.l !fzs_mhits
	AND.w #$00FF
	CMP.w #2
	BCC .out
	; the committed close-range counter
	SEP #$20
	LDA.b #0
	STA.l !fzs_rip
	STA.l !fzs_mhits
	STA.l !fzs_wkind
	LDA.b #42
	STA !fzf_guard
	STZ !fzf_dash
	STZ !fzf_windup
	STZ !fzf_hurt
	REP #$20
	LDA.w #!FZ_SFX_CHARGED
	JSR fz_sfx
.out
	LDA !fz_t7
	RTS

; evadeMelee(): retreat to the node farthest from Goku (among those more
; than 32 px from Frieza), drop the shots, then the counter's aimed laser.
fz_evade_melee:
	LDA !fzf_tier
	AND.w #$00FF
	BEQ .out0
	LDA !fzf_stun
	AND.w #$00FF
	BNE .out0
	LDA.l !fzs_surge
	AND.w #$00FF
	BEQ +
.out0
	JMP .out
+	JSR fz_hero
	; does any node lie farther than 32 px from Frieza?
	STZ !fz_t3
	STZ !fz_t4
.scan
	JSR fz_node_count
	CMP !fz_t4
	BEQ .choose
	BCC .choose
	JSR fz_node_far
	BCC +
	INC !fz_t3
+	INC !fz_t4
	BRA .scan
.choose
	; the node farthest from Goku (ties: the first)
	STZ !fz_t0                        ; best index
	STZ !fz_t1                        ; best distance^2 (high)
	STZ !fz_t2                        ; best distance^2 (low)
	LDA.w #$FFFF
	STA !fz_t6                        ; none chosen yet
	STZ !fz_t4
.pick
	JSR fz_node_count
	CMP !fz_t4
	BEQ .chosen
	BCC .chosen
	LDA !fz_t3
	BEQ .any
	JSR fz_node_far
	BCC .skip
.any
	LDA !fz_t4
	ASL
	TAX
	LDA !fzf_node_x,X
	SEC
	SBC !fz_hx
	PHA
	LDA !fzf_node_y,X
	SEC
	SBC !fz_hy
	TAX
	PLA
	JSR fz_dist2
	LDA !fz_t6
	BMI .take
	LDA !fz_m7
	CMP !fz_t1
	BCC .skip
	BNE .take
	LDA !fz_m6
	CMP !fz_t2
	BCC .skip
	BEQ .skip
.take
	LDA !fz_m7
	STA !fz_t1
	LDA !fz_m6
	STA !fz_t2
	LDA !fz_t4
	STA !fz_t0
	STZ !fz_t6
.skip
	INC !fz_t4
	BRA .pick
.chosen
	SEP #$20
	LDA !fz_t0
	STA !fzf_node
	LDA.b #0
	STA.l !fzs_wkind
	STA.l !fzs_mhits
	LDA.b #1
	STA !fzf_dash
	STZ !fzf_windup
	LDA.b #45
	STA !fzf_guard
	LDA.b #!FZFF_COUNTER
	TSB !fzf_flags
	STZ !fzf_hurt
	REP #$20
	JSR fz_shots_clear
	LDA.w #!FZ_SFX_RUSH
	JSR fz_sfx
.out
	RTS

; C set when node !fz_t4 lies more than 32 px from Frieza.
fz_node_far:
	LDA !fz_t4
	ASL
	TAX
	LDA !fzf_node_x,X
	SEC
	SBC !fzf_x
	PHA
	LDA !fzf_node_y,X
	SEC
	SBC !fzf_y
	TAX
	PLA
	LDY.w #33
	JSR fz_dist_lt                    ; C set: within 32 px (d^2 < 33^2)
	BCS .near
	SEC
	RTS
.near
	CLC
	RTS

; ---------------------------------------------------------------------------
; Virtual enemy for combat (frieza.js entity() / hit()).

; frieza_virtual_target: C set while Frieza can be struck: A16 = species
; (121), X16 = x, Y16 = y (map, the feet). Any DB; M16/X16 out.
frieza_virtual_target:
	PHB
	PHD
	REP #$30
	PEA $7E7E
	PLB
	PLB
	LDA.w #$0000
	TCD
	JSR fz_on
	BCC .no
	JSR fz_battle_live
	BCC .no
	LDA !fzf_hp_lo
	ORA !fzf_hp_hi
	BEQ .no
	LDX !fzf_x
	LDA !fzf_y
	CLC
	ADC.w #12
	TAY
	LDA !fzf_terrain                  ; high byte: the terrain he fights on
	XBA
	AND.w #$FF00
	ORA.w #121
	PLD
	PLB
	SEC
	RTL
.no
	PLD
	PLB
	CLC
	RTL

; frieza_virtual_hit: A16 = Goku's damage, X16 = 1 for a punch (melee),
; 0 for ki, beams and bursts. Applies 15% (65% while stunned).
; Out: A16 = HP taken. Any DB; M16/X16 out.
frieza_virtual_hit:
	PHB
	PHD
	REP #$30
	PHA
	PEA $7E7E
	PLB
	PLB
	LDA.w #$0000
	TCD
	PLA
	STX !fz_hmelee
	JSR fz_scale_hit
	STA !fz_dmg
	JSR fz_hero
	LDA !fz_hmelee
	BEQ +
	JSR fz_melee
	BRA ++
+	JSR fz_hurt
++	PLD
	PLB
	RTL

; A16 = floor(amount * (stun ? 13 : 3) / 20), 32-bit intermediate.
fz_scale_hit:
	STA !fz_m0
	LDA !fzf_stun
	AND.w #$00FF
	BEQ +
	LDA.w #13
	BRA ++
+	LDA.w #3
++	STA !fz_m1
	JSR fz_mul16                      ; (m3:m2) = amount * k
	LDA.w #0
	STA !fz_m4                        ; quotient
	LDY.w #32
-	ASL !fz_m2
	ROL !fz_m3
	ROL
	ASL !fz_m4
	CMP.w #20
	BCC +
	SBC.w #20
	INC !fz_m4
+	DEY
	BNE -
	LDA !fz_m4
	RTS

; ---------------------------------------------------------------------------
; Afterimages: one every third dash frame, shown for 16 frames.
fz_after_push:
	LDX.w #0
-	LDA.l !FZ_AFTER+!af_age,X
	AND.w #$00FF
	CMP.w #$00FF
	BEQ .found
	TXA
	CLC
	ADC.w #6
	TAX
	CPX.w #!FZ_AFTER_N*6
	BCC -
	RTS
.found
	SEP #$20
	LDA.b #0
	STA.l !FZ_AFTER+!af_age,X
	REP #$20
	LDA !fzf_x
	STA.l !FZ_AFTER+!af_x,X
	LDA !fzf_y
	STA.l !FZ_AFTER+!af_y,X
	RTS

fz_after_tick:
	LDX.w #(!FZ_AFTER_N-1)*6
-	SEP #$20
	LDA.l !FZ_AFTER+!af_age,X
	CMP.b #$FF
	BEQ +
	INC A
	CMP.b #16
	BCC ++
	LDA.b #$FF
++	STA.l !FZ_AFTER+!af_age,X
+	REP #$20
	TXA
	SEC
	SBC.w #6
	TAX
	BPL -
	RTS

; ---------------------------------------------------------------------------
; Test builds (-DFRIEZA_TEST): a mailbox in the scene block lets the Mesen
; tests strike Frieza as combat will (cmd 1 punch, 2 ki/beam; arg = damage
; before scaling), and read the result and a counter.
if defined("FRIEZA_TEST")
fz_test_mailbox:
	LDA.l !fzs_test
	BEQ .out
	CMP.w #3
	BEQ .fracture
	BCS .clear
	CMP.w #1
	BEQ +
	LDX.w #0
	BRA ++
+	LDX.w #1
++	LDA.l !fzs_test+2
	JSL frieza_virtual_hit
	STA.l !fzs_test+4
	BRA .count
.fracture
	; cmd 3: breakFloor(arg x, arg2 y, arg3 radius)
	LDA.l !fzs_test+2
	STA !fz_ax
	LDA.l !fzs_test+8
	STA !fz_ay
	LDA.l !fzs_test+10
	JSR fz_break_floor
.count
	LDA.l !fzs_test+6
	INC
	STA.l !fzs_test+6
.clear
	LDA.w #0
	STA.l !fzs_test
.out
	RTS
endif
