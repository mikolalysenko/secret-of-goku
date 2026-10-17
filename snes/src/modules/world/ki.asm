; Aerial ki, the charged aerial Kamehameha and the Fortress route
; (engine/world-ki.js tick(), engine/fortress-collapse.js startLandingMusic).
;
; Controls in world flight (mana-mod.js / world-ki.js): Flammie's steering,
; A ascends, B descends and lands. Y fires a small ki shot that vanishes
; over the horizon and bursts in the distance; L+Y charges the aerial wave
; (released to fire). The game never sees Y, X, L or R; X sends the game's
; Y (ring/back); while L is held neither A nor B reach it, so no chord can
; land. A wave, explosion, cutaway or docking locks the controls.
;
; The charge below is a local stand-in for the combat stream: combat can
; set !w_combat_owns and call world_fire_ki / world_fire_wave itself.

!CHARGE_CAP_BASE = 90
!CHARGE_CAP_SSJ  = 45
!STR_FULL        = 256
!STR_HIT         = 218            ; strength >= .85 damages its target

; Per world frame, before the pose. M16/X16, DB = $7E, D = 0.
world_ki:
	LDA.w !w_warn_cd
	BEQ +
	DEC.w !w_warn_cd
+	; the game's buttons in flight
	LDA.w #!PAD_Y|!PAD_X
	TSB.w !core_pad_mask&$FFFF
	LDA.w #!PAD_L|!PAD_R
	TSB.w !core_pad_mask&$FFFF
	LDA.w !w_input
	AND.w #!PAD_X
	BEQ +
	LDA.w #!PAD_Y
	TSB.w !core_pad_inject&$FFFF
+	LDA.w !w_input
	AND.w #!PAD_L
	BEQ +
	LDA.w #!PAD_A|!PAD_B
	TSB.w !core_pad_mask&$FFFF
+	JSR world_ki_busy
	BCC .free
	LDA.w #$FFF0
	TSB.w !core_pad_mask&$FFFF
	STZ.w !w_charging
	STZ.w !w_charge
	BRA .tick
.free
	LDA.w !w_combat_owns
	BNE .tick
	JSR world_ki_input
.tick
	JSR world_shot_tick
	JSR world_expl_tick
	JSR world_bursts_tick
	LDA.w !w_action_age
	BEQ +
	DEC.w !w_action_age
+	; no docking while attacking (world-ki.js clears $CF at C2:B1B3)
	LDA.w !w_charging
	ORA.w !w_shot
	ORA.w !w_land_queued
	BNE .noDock
	LDA.w !w_expl_age
	AND.w !w_cut_age
	CMP.w #$FFFF
	BEQ .done
.noDock
	SEP #$20
	STZ $CF
	REP #$20
.done
	RTS

; C set while flight controls are locked (world-ki.js busy).
world_ki_busy:
	SEP #$20
	LDA $FE
	AND.b #$C0
	BNE .busy8
	LDA $8C
	BNE .busy8
	LDA $E2
	LSR
	BCS .busy8
	REP #$20
	LDA.w !w_land_queued
	ORA.w !w_dock
	BNE .busy
	LDA.w !w_expl_age
	AND.w !w_cut_age
	CMP.w #$FFFF
	BNE .busy
	LDA.w !w_shot
	CMP.w #!SHOT_WAVE
	BEQ .busy
	CLC
	RTS
.busy8
	REP #$20
.busy
	SEC
	RTS

; Local charge stand-in (world-ki.js tick, with mod.startCharge/fire).
world_ki_input:
	LDA.w !w_input
	AND.w #!PAD_Y
	BNE +
	STZ.w !w_ki_blocked
+	LDA.w !w_input
	AND.w #!PAD_L|!PAD_Y
	CMP.w #!PAD_L|!PAD_Y
	BNE .noWave
	LDA.w !w_charging
	BNE .charge
	LDA.w !w_shot
	ORA.w !w_ki_blocked
	ORA.w !w_action_age
	BNE .done
	LDA.w #$0001
	STA.w !w_charging
	STZ.w !w_charge
	LDA.w #!TGT_NONE
	STA.w !w_aim
	LDA.w #!SFX_CHARGE
	JSR world_sfx
	BRA .charge
.noWave
	LDA.w !w_charging
	BEQ .noCharge
	JSL world_fire_wave_local
	LDA.w !w_input
	AND.w #!PAD_Y
	STA.w !w_ki_blocked
	RTS
.noCharge
	LDA.w !w_input
	AND.w #!PAD_L|!PAD_Y
	CMP.w #!PAD_Y
	BNE .done
	LDA.w !w_ki_blocked
	ORA.w !w_shot
	ORA.w !w_action_age
	BNE .done
	JSL world_fire_ki
	RTS
.charge
	JSR world_charge_cap
	CMP.w !w_charge
	BEQ .full
	BCC .full
	INC.w !w_charge
	CMP.w !w_charge
	BNE .half
	LDA.w #$0002
	TSB.w !w_charging
	LDA.w #!SFX_CHARGED
	JSR world_sfx
.full
.half
	; charging halves flight speed: no Up/Down on odd frames
	LDA.w !w_frame
	LSR
	BCC .done
	LDA.w #!PAD_UP|!PAD_DOWN
	TSB.w !core_pad_mask&$FFFF
.done
	RTS

; A16 = full-charge frames for the current form.
world_charge_cap:
	LDA.w !goku_form
	AND.w #$0001
	BEQ +
	LDA.w #!CHARGE_CAP_SSJ
	RTS
+	LDA.w #!CHARGE_CAP_BASE
	RTS

; Release of the local charge: strength = charge / cap.
world_fire_wave_local:
	JSR world_charge_cap
	TAX
	LDA.w !w_charge
	XBA
	AND.w #$FF00                     ; charge * 256
	JSR world_div8
	CMP.w #!STR_FULL
	BCC +
	LDA.w #!STR_FULL
+	JSL world_fire_wave
	RTL

; ---------------------------------------------------------------------------
; world_fire_ki: a small ki shot (strength .2). world_fire_wave: the aerial
; Kamehameha, A16 = strength 0-256 (256 = fully charged). The full Super
; Saiyan wave (form 1 and 256) reaches twice as far. JSL from any module
; (combat), M16/X16, DB = $7E. Ignored unless Goku is in world flight with
; no shot already travelling.
world_fire_ki:
	LDA.w #51                        ; .2 * 256
	LDX.w #!SHOT_KI
	BRA world_fire
world_fire_wave:
	LDX.w #!SHOT_WAVE
world_fire:
	PHA
	LDA.w !w_shot
	BEQ +
	PLA
	RTL                              ; one shot at a time
+	PLA
	STA.w !w_shot_str
	STX.w !w_shot
	LDA.w !core_mode&$FFFF
	CMP.w #!CORE_MODE_WORLD
	BEQ +
	JMP .refuse
+
	LDA.w !w_flags
	AND.w #!WF_ACTIVE
	BNE +
	JMP .refuse
+
	STZ.w !w_shot_age
	STZ.w !w_shot_flags
	STZ.w !w_charging
	STZ.w !w_charge
	; mega = Super Saiyan and a full charge
	LDA.w !goku_form
	AND.w #$0001
	BEQ .base
	LDA.w #!SF_SUPER
	TSB.w !w_shot_flags
	LDA.w !w_shot
	CMP.w #!SHOT_WAVE
	BNE .base
	LDA.w !w_shot_str
	CMP.w #!STR_FULL
	BCC .base
	LDA.w #!SF_MEGA
	TSB.w !w_shot_flags
.base
	; lifetime: ki 12, wave 32, mega 72
	LDX.w #12
	LDA.w !w_shot
	CMP.w #!SHOT_KI
	BEQ +
	LDX.w #32
	LDA.w !w_shot_flags
	AND.w #!SF_MEGA
	BEQ +
	LDX.w #72
+	STX.w !w_shot_max
	STX.w !w_action_age              ; the airBeam pose lasts the shot
	; target: the aimed one, else the landscape 420 / 640 px ahead
	LDA.w !w_shot_flags
	AND.w #!SF_MEGA
	JSR world_aim
	CMP.w #!TGT_NONE
	BNE .aimed
	LDX.w #420
	LDA.w !w_shot_flags
	AND.w #!SF_MEGA
	BEQ +
	LDX.w #640
+	STX.w !wa_along
	STZ.w !wa_across
	; ahead = (px - sin*range, py - cos*range)
	TXA
	LDY.w !wa_sin
	JSR world_mul7
	EOR.w #$FFFF
	SEC
	ADC.w !wa_px
	AND.w #$0FFF
	STA.w !wa_tx
	LDA.w !wa_along
	LDY.w !wa_cos
	JSR world_mul7
	EOR.w #$FFFF
	SEC
	ADC.w !wa_py
	AND.w #$0FFF
	STA.w !wa_ty
	LDA.w #!TGT_LANDSCAPE
.aimed
	STA.w !w_shot_tgt
	LDA.w !wa_tx
	STA.w !w_shot_tx
	LDA.w !wa_ty
	STA.w !w_shot_ty
	LDA.w #$0001
	STA.w !w_shot_side
	LDA.w !wa_across
	BPL +
	LDA.w #$FFFF
	STA.w !w_shot_side
+	; end point: the Fortress where the game projected it, else screen()
	LDA.w !w_shot_tgt
	CMP.w #!TGT_FORTRESS
	BNE .formula
	JSR world_fort_fresh
	BCS .formula
	LDA.w !w_fort_x
	STA.w !w_shot_ex
	LDA.w !w_fort_y
	STA.w !w_shot_ey
	BRA .sound
.formula
	LDA.w !wa_along
	LDX.w !wa_across
	JSR world_target_screen
	STA.w !w_shot_ex
	STX.w !w_shot_ey
.sound
	LDA.w !w_shot
	CMP.w #!SHOT_KI
	BEQ +
	LDA.w #!SFX_BEAM
	BRA ++
+	LDA.w #!SFX_BLAST
++	JSR world_sfx
	RTL
.refuse
	STZ.w !w_shot
	RTL

; ---------------------------------------------------------------------------
; Shot lifetime; the hit lands at age 12 (world-ki.js).
world_shot_tick:
	LDA.w !w_shot
	BNE +
	RTS
+	INC.w !w_shot_age
	LDA.w !w_shot_flags
	AND.w #!SF_HIT
	BNE .aged
	LDA.w !w_shot_age
	CMP.w #12
	BCC .aged
	LDA.w #!SF_HIT
	TSB.w !w_shot_flags
	JSR world_shot_hit
.aged
	LDA.w !w_shot_age
	CMP.w !w_shot_max
	BEQ +
	BCC +
	STZ.w !w_shot
+	RTS

world_shot_hit:
	LDA.w !w_shot
	CMP.w #!SHOT_KI
	BNE .wave
	; the tiny shot vanished over the horizon: a late, cosmetic burst
	JMP world_burst_add
.wave
	LDA.w !w_shot_tgt
	CMP.w #!TGT_FORTRESS
	BNE .damage
	; the shield survives every base-form or incomplete SSJ wave
	LDA.w !w_shot_flags
	AND.w #!SF_SUPER
	BEQ .deflect
	LDA.w !w_shot_str
	CMP.w #!STR_FULL
	BCS .damage
.deflect
	LDA.w #!SF_DEFLECT
	TSB.w !w_shot_flags
	LDA.w #54
	STA.w !w_shot_max
	SEC
	SBC.w !w_shot_age
	STA.w !w_action_age
	LDA.w #!SFX_DEFLECT
	JSR world_sfx
	LDA.w !w_warn_cd
	BNE +
	LDA.w #720
	STA.w !w_warn_cd
	LDA.w #!MSG_SHIELD
	JSR world_message
+	RTS
.damage
	LDA.w !w_shot_str
	CMP.w #!STR_HIT
	BCS .strong
	LDA.w #!MSG_WEAK
	JMP world_message
.strong
	; explosion where the shot ended
	STZ.w !w_expl_age
	LDA.w !w_shot_ex
	STA.w !w_expl_x
	LDA.w !w_shot_ey
	STA.w !w_expl_y
	LDA.w !w_shot_flags
	AND.w #!SF_MEGA
	STA.w !w_expl_flags              ; bit0 mega
	LDA.w #!SFX_IMPACT
	JSR world_sfx
	LDA.w !w_shot_tgt
	CMP.w #!TGT_BARRIER
	BNE .notBarrier
	; Opening the cloud layer: no crater, no boss or Tree progress.
	JSL world_barrier_break
	LDA.w #!MSG_BARRIER
	JMP world_message
.notBarrier
	CMP.w #!TGT_FORTRESS
	BNE .scar
	LDA.w #$0002
	TSB.w !w_expl_flags              ; bit1 Fortress
	SEP #$20
	LDA.l !pw_flags
	ORA.b #!PWF_FORTRESS
	STA.l !pw_flags
	REP #$20
	LDA.w #!MSG_FORTRESS
	JSR world_message
.scar
	LDA.w !w_shot_tx
	LDX.w !w_shot_ty
	LDY.w !w_shot_flags
	JMP world_scar_strike

; Explosion, the Fortress cutaway and the queued landing.
world_expl_tick:
	LDA.w !w_cut_age
	CMP.w #$FFFF
	BEQ .expl
	INC.w !w_cut_age
	JSR world_cutaway_frame
	LDA.w !w_cut_age
	CMP.w #186
	BCC .expl
	LDA.w #$FFFF
	STA.w !w_cut_age
	STA.w !w_expl_age
	LDA.w #$0001
	STA.w !w_land_queued
	RTS
.expl
	LDA.w !w_expl_age
	CMP.w #$FFFF
	BEQ .done
	INC.w !w_expl_age
	LDA.w !w_expl_flags
	AND.w #$0002
	BEQ .town
	LDA.w !w_cut_age
	CMP.w #$FFFF
	BNE .done
	LDA.w !w_expl_age
	CMP.w #24
	BCC .done
	STZ.w !w_cut_age
	LDA.w #!SFX_DISTANT
	JMP world_sfx
.town
	LDA.w !w_expl_age
	CMP.w #81
	BCC .done
	LDA.w #$FFFF
	STA.w !w_expl_age
.done
	RTS

; Planet cutaway stand-in (186 frames; the ending stream renders the planet
; view while world_cutaway_age runs): fade the world out and hold black.
world_cutaway_frame:
	LDA.w !w_cut_age
	LSR
	LSR
	CMP.w #15
	BCC +
	LDA.w #15
+	EOR.w #$000F
	SEP #$20
	STA $E6
	REP #$20
	RTS

; Distant ki bursts: up to 6 (each lives 50 frames, a ki shot leaves every
; 13 at most), oldest dropped (world-ki.js distantBursts).
world_burst_add:
	LDX.w #$0000
-	LDA.w !w_bursts,X
	CMP.w #$8000
	BEQ .new
	TXA
	CLC
	ADC.w #6
	TAX
	CPX.w #36
	BCC -
	; full: drop the oldest (largest age)
	LDX.w #$0000
	LDY.w #$0000
-	LDA.w !w_bursts,X
	CMP.w !w_bursts,Y
	BMI +
	TXY
+	TXA
	CLC
	ADC.w #6
	TAX
	CPX.w #36
	BCC -
	TYX
	BRA .slot
.new
	INC.w !w_burst_live
.slot
	LDA.w #$FFEE                     ; -18: the boom answers late
	STA.w !w_bursts,X
	LDA.w !w_shot_tx
	STA.w !w_bursts+2,X
	LDA.w !w_shot_ty
	STA.w !w_bursts+4,X
	RTS

world_bursts_tick:
	LDA.w !w_burst_live
	BNE +
	RTS
+	LDX.w #$0000
.next
	LDA.w !w_bursts,X
	CMP.w #$8000
	BEQ .skip
	INC
	STA.w !w_bursts,X
	BNE +
	PHX
	LDA.w #!SFX_DISTANT
	JSR world_sfx
	PLX
	BRA .skip
+	CMP.w #32
	BMI .skip
	LDA.w #$8000
	STA.w !w_bursts,X
	DEC.w !w_burst_live
.skip
	TXA
	CLC
	ADC.w #6
	TAX
	CPX.w #36
	BCC .next
	RTS

; Clear every shot, burst and explosion (entering flight).
world_ki_reset:
	STZ.w !w_shot
	STZ.w !w_charging
	STZ.w !w_charge
	STZ.w !w_ki_blocked
	STZ.w !w_action_age
	STZ.w !w_land_queued
	LDA.w #$FFFF
	STA.w !w_expl_age
	STA.w !w_cut_age
	STA.w !w_aim
	STZ.w !w_burst_live
	LDA.w #$FFF0
	STA.w !w_fort_seen
	LDX.w #30
-	LDA.w #$8000
	STA.w !w_bursts,X
	TXA
	SEC
	SBC.w #6
	TAX
	BPL -
	RTS

; ---------------------------------------------------------------------------
; Reached from world_loop_hook (top of the world loop, after vblank) once the
; planet cutaway ends: the crisis cue starts during the landing fade, then
; the Fortress's own docking ABI (C2:B1CA) lands on its deck through native
; landing record 10 (C0:8260). The damaged-deck follow-up is wf_finale.
world_fortress_landing:
	SEP #$20
	REP #$10
	LDA.b #$01
	STA.l $7E1E00
	LDA.b #$1B                       ; crisis cue (Thanatos's), as the browser
	STA.l $7E1E01
	LDA.b #$13
	STA.l $7E1E02
	LDA.b #$8F
	STA.l $7E1E03
	JSL $C30004
	SEP #$20
	LDA.b #$01
	STA.l $7E00E8
	LDA.l $7E00F2
	ORA.b #$80
	STA.l $7E00F2
	LDA.l !pw_flags
	ORA.b #!PWF_FINALE
	STA.l !pw_flags
	REP #$30
	LDA.w #$0000
	STA.l $7E0000|!w_land_queued
	TCD
	PEA $0000                        ; the world loop's DB
	PLB
	PLB
	LDX.w #$01FF
	TXS
	LDA.w #$000A
	JML $008260

; C clear when C2:B1F7 projected the Fortress within the last 3 world
; frames (world-ki.js fortScreen): !w_fort_x/y are then current.
world_fort_fresh:
	LDA.w !w_frame
	SEC
	SBC.w !w_fort_seen
	CMP.w #3
	RTS

; ---------------------------------------------------------------------------
; Stand-ins for other streams.

; Messages for the radio / story streams: the id stays in !w_msg and
; !w_msg_count advances (see docs: !MSG_*).
world_message:
	STA.w !w_msg
	INC.w !w_msg_count
	RTS

; Mana Tree cloud barrier: the destroy stream's destroy_tree_barrier_break
; owns the E3 bit 6 landing lock; until it merges, record the request.
world_barrier_break:
	LDA.w #$0001
	STA.w !w_barrier_req
	RTL
