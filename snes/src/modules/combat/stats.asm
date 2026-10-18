; Goku's stats (mana-mod.js power block and updatePowerStats, Heavy Gi
; native-equipment.js, Saiyan defense native-hit-recovery.js), the hit
; recovery tick, reactions, BG quake pulses (native-feedback.js) and status
; recovery (recoverStatus). DB = $7E, M16/X16 unless noted.

; ---------------------------------------------------------------------------
; Level 99, weapon skills 8:99, 999 maximum HP (missing HP preserved, never
; a revive), Saiyan strength / attack bytes, no attack stamina. Runs on
; frames Goku can attack (as the browser's power block).
cb_power_stats:
	LDA !cb_can
	AND.w #$00FF
	BNE +
	RTS
+	; level and skills: at once when the level is off (load, import, level
	; up), else every 8th frame (only native events change them)
	LDA $E181
	AND.w #$00FF
	CMP.w #98
	BNE +
	LDA !cb_phase
	AND.w #$0007
	BNE .hp
+	SEP #$20
	LDA.b #98
	STA $E181
	LDA.b #$88
	STA $E1C0
	STA $E1C1
	STA $E1C2
	STA $E1C3
	LDA.b #99
	LDX.w #$0007
-	STA $E1D0,X
	DEX
	BPL -
	LDA.b #$08
	STA $E19C
	REP #$20
.hp
	LDA $E184
	CMP.w #999
	BEQ .bytes
	STA !cb_t0                    ; old maximum
	LDA.w #999
	STA $E184
	LDA $E182
	BEQ .bytes
	; hp + max(0, 999 - oldMax), at most 999
	LDA !cb_t0
	CMP.w #999
	BCS .bytes
	LDA.w #999
	SEC
	SBC !cb_t0
	CLC
	ADC $E182
	BCS .cap
	CMP.w #1000
	BCC +
.cap
	LDA.w #999
+	STA $E182
.bytes
	JMP cb_ready_meter

; Clearing E1ED before native logic prevents stamina from ticking down,
; but also bypasses the native completion path (EBB6): a loaded percentage
; and its charge/flash latch can remain on the HUD indefinitely. Finish
; that cleanup after native logic as well, before its HUD buffer uploads.
; Goku's techniques use cb_charge/cb_power; they never charge a sword.
cb_ready_meter:
	LDA !cb_can
	AND.w #$00FF
	BEQ .out
	SEP #$20
	LDA $E1ED
	ORA $E063
	ORA $E01A
	BEQ .out8
	STZ $E1ED
	STZ $E063
	STZ $E01A
	STZ $0A50
	STZ $0A51
	STZ $0A52
	STZ $0A53
	STZ $0A54
	PHX
	LDX.w #$0000
	SEC
	JSL $81CA04                  ; retire the native full-charge sparkle
	PLX
.out8
	REP #$20
.out
	RTS

; Once per field frame, every 4th: the per-frame upkeep of the browser's
; stat writers (equipment.tick, hitRecovery.tick, updatePowerStats). The
; native rebuild hooks apply the same rules at once; this catches writes
; by other code (level tables, scripts) within 4 frames.
cb_stats_upkeep:
	; The browser rewrites these every frame. Here every frame checks that
	; combat's last writes stand: a form, power or body armor change, or any
	; other writer's change to strength / agility / attack / DEF, runs the
	; pass at once (native rebuilds apply the rules through their hooks).
	LDA !cb_def_form
	EOR !cb_form
	AND.w #$00FF
	BNE .now
	LDA !cb_up_act
	EOR !cb_active
	AND.w #$00FF
	BNE .now
	LDA $E1A5
	CMP !cb_def_wr
	BNE .now
	LDA $E1A8
	CMP !cb_def_wr+2
	BNE .now
	LDA $E188
	CMP !cb_sa_wr
	BNE .now
	SEP #$20
	LDA $E1E1
	CMP !cb_gi_seen
	BNE .now8
	LDA !cb_active
	BEQ +
	LDA $E198                     ; the attack byte stays 255
	INC
	BNE .now8
+	REP #$20
	RTS
.now8
	REP #$20
.now
	LDA.w #$0000
	JSR cb_defense_stats
	LDA.w #$0000
	JSR cb_agility_stats
	JSR cb_goku_active
	BEQ +
	JSR cb_power_bytes
+	LDA $E188
	STA !cb_sa_wr
	SEP #$20
	LDA $E1E1
	STA !cb_gi_seen
	LDA !cb_active
	STA !cb_up_act
	REP #$20
	RTS

; updatePowerStats(): strength 255 (230 with the Heavy Gi), attack byte
; min(255, damageScale) = 255. Wrapper combat keeps the real values.
cb_power_bytes:
	JSR cb_gi_worn
	SEP #$20
	BEQ +
	LDA.b #230                    ; round(255 * 0.9)
	BRA ++
+	LDA.b #255
++	STA $E188
	LDA.b #255
	STA $E198
	REP #$20
	RTS

; Heavy Gi: agility -20% on a fresh native rebuild (A16 = 1) or when the
; native value changed since our write (per frame, A16 = 0). Never stacks.
cb_agility_stats:
	STA !cb_t0
	LDA $E000
	AND.w #$0001
	BNE +
	RTS
+	LDA !cb_t0
	BNE .fresh
	LDA !cb_rebuild
	AND.w #$00FF
	BEQ +
	RTS                           ; a rebuild is in progress
+	LDA !cb_agi_valid
	AND.w #$00FF
	BEQ .fresh
	LDA $E189
	AND.w #$00FF
	STA !cb_t1
	LDA !cb_agi_wr
	AND.w #$00FF
	CMP !cb_t1
	BNE .fresh
	; unchanged since our write: done while the gi is still worn
	JSR cb_gi_worn
	BEQ +
	JSR cb_goku_active
	BEQ +
	RTS
+	LDA !cb_agi_base
	AND.w #$00FF
	BRA .base
.fresh
	LDA $E189
	AND.w #$00FF
.base
	STA !cb_t1                    ; base
	JSR cb_goku_active
	BEQ .unweighted
	JSR cb_gi_worn
	BEQ .unweighted
	; max(1, floor(base * 4 / 5))
	LDA !cb_t1
	ASL
	ASL
	LDX.w #$0000
-	CMP.w #5
	BCC +
	SBC.w #5
	INX
	BRA -
+	TXA
	BNE +
	LDA.w #1
+	SEP #$20
	STA $E189
	STA !cb_agi_wr
	LDA !cb_t1
	STA !cb_agi_base
	LDA.b #$01
	STA !cb_agi_valid
	REP #$20
	RTS
.unweighted
	SEP #$20
	LDA !cb_t1
	STA $E189
	STZ !cb_agi_valid
	REP #$20
	RTS

; Saiyan defense: +160 / +80 (base), +320 / +160 (Super Saiyan) on the real
; physical / magic totals (E1A5 / E1A8), capped at 999. A16 = 1 after a
; native rebuild; 0 per frame (keeps our own write's base).
cb_defense_stats:
	STA !cb_t0
	JSR cb_goku_active
	BNE .powered
	; power off: give back the unboosted totals
	SEP #$20
	LDA !cb_form
	STA !cb_def_form
	REP #$20
	LDA !cb_def_valid
	AND.w #$00FF
	BEQ .none
	LDA $E1A5
	CMP !cb_def_wr
	BNE +
	LDA !cb_def_base
	STA $E1A5
+	LDA $E1A8
	CMP !cb_def_wr+2
	BNE +
	LDA !cb_def_base+2
	STA $E1A8
+	SEP #$20
	STZ !cb_def_valid
	REP #$20
.none
	; (not ours while invalid: only settles the upkeep's per-frame check)
	LDA $E1A5
	STA !cb_def_wr
	LDA $E1A8
	STA !cb_def_wr+2
	RTS
.powered
	LDA $E000
	AND.w #$0001
	BNE +
	RTS
+	; per frame: nothing to do while our last write stands
	LDA !cb_t0
	BNE .rebuild
	LDA !cb_def_valid
	AND.w #$00FF
	BEQ .rebuild
	LDA $E1A5
	CMP !cb_def_wr
	BNE .rebuild
	LDA $E1A8
	CMP !cb_def_wr+2
	BNE .rebuild
	LDA !cb_def_form
	EOR !cb_form
	AND.w #$00FF
	BNE .rebuild
	RTS
.rebuild
	SEP #$20
	LDA !cb_form
	STA !cb_def_form
	REP #$20
	LDX.w #$0000                  ; 0: physical E1A5, 2: magic E1A8
.each
	LDA.l cb_def_addr,X
	TAY
	LDA $0000,Y
	STA !cb_t1
	LDA !cb_t0
	BNE .base                     ; rebuilt: the value is the base
	LDA !cb_def_valid
	AND.w #$00FF
	BEQ .base
	LDA !cb_t1
	CMP !cb_def_wr,X
	BNE .base
	LDA !cb_def_base,X
	STA !cb_t1
.base
	LDA !cb_t1
	STA !cb_def_base,X
	PHX
	LDA !cb_form
	AND.w #$00FF
	BEQ +
	INX : INX : INX : INX
+	LDA.l cb_def_bonus,X
	PLX
	CLC
	ADC !cb_t1
	CMP.w #1000
	BCC +
	LDA.w #999
+	STA !cb_def_wr,X
	STA $0000,Y
	INX : INX
	CPX.w #4
	BCC .each
	SEP #$20
	LDA.b #$01
	STA !cb_def_valid
	REP #$20
	RTS
cb_def_addr:
	dw $E1A5,$E1A8
cb_def_bonus:
	dw 160,80,320,160

; ---------------------------------------------------------------------------
; Per-frame hit recovery tick (native-hit-recovery.js tick()).
cb_hr_tick:
	; a reaction lasts 8 frames on its map while Goku defends
	LDA !cb_react
	AND.w #$00FF
	BEQ .noReact
	JSR cb_n_defending
	BCC .endReact
	LDA $DC
	CMP !cb_react_map
	BNE .endReact
	LDA.l $7E0000|!cb_vblanks
	SEC
	SBC !cb_react_tick
	CMP.w #8
	BCC .noReact
.endReact
	SEP #$20
	STZ !cb_react
	REP #$20
.noReact
	; the hit record follows an ordinary hurt pose
	SEP #$20
	LDA $E011
	CMP.b #$8D
	BEQ .hurt8
	CMP.b #$8E
	BEQ .hurt8
	REP #$20
.clear
	SEP #$20
	STZ !cb_hr_tier
	REP #$20
	RTS
.hurt8
	REP #$20
	JSR cb_n_enabled
	BCC .clear
	LDA !cb_hr_tier
	AND.w #$00FF
	BEQ .new
	LDA $DC
	CMP !cb_hr_map
	BEQ .known
.new
	LDA $DC
	STA !cb_hr_map
	LDA.l $7E0000|!cb_vblanks
	STA !cb_hr_frame
	JSR cb_threat
	SEP #$20
	STA !cb_hr_tier
	STZ !cb_hr_recoil
	REP #$20
.known
	JSR cb_hr_old
	BCC .out
	SEP #$20
	LDA $E012
	CMP.b #$02
	BCC +
	LDA.b #$01
	STA $E012
+	REP #$20
.out
	RTS

; Reactions drive the goku module's deflect / resist poses.
cb_publish_reaction:
	SEP #$20
	LDA !cb_react
	BEQ .none
	STA !goku_mode
	LDA !cb_react_face
	STA !goku_mode_facing
	REP #$20
	LDA.l $7E0000|!cb_vblanks
	SEC
	SBC !cb_react_tick
	STA !goku_mode_age
	RTS
.none
	; clear only a reaction mode we published
	LDA !goku_mode
	CMP.b #!GOKU_K_DEFLECT
	BEQ .clr
	CMP.b #!GOKU_K_RESIST
	BNE .out
.clr
	STZ !goku_mode
.out
	REP #$20
	RTS

; ---------------------------------------------------------------------------
; BG quake pulse ($49 = $E0, as native-feedback.js pulse()): A16 = frames.
; Mode 7 arenas keep their own impact animation; an event that writes $49
; owns it again.
cb_quake:
	PHA
	JSR cb_bind_has_fx
	PLA
	BCC .own
	JMP cb_bind_fx_quake
.own
	STA !cb_t0
	SEP #$20
	LDA $29
	AND.b #$07
	CMP.b #$07
	BEQ .out8
	LDA !cb_quake
	BEQ .new
	LDA !cb_t0
	CMP !cb_quake
	BCC .out8
	STA !cb_quake
	BRA .out8
.new
	LDA $49
	BNE .out8
	STA !cb_quake_prev
	LDA !cb_t0
	BEQ .out8
	STA !cb_quake
	LDA.b #$E0
	STA $49
.out8
	REP #$20
	RTS

cb_quake_tick:
	SEP #$20
	LDA !cb_quake
	BEQ .out
	LDA $49
	CMP.b #$E0
	BNE .lost
	DEC !cb_quake
	BNE .out
	LDA !cb_quake_prev
	STA $49
	BRA .out
.lost
	STZ !cb_quake
.out
	REP #$20
	RTS

; The transformation's gold flash (7 frames) and quake (9 frames).
cb_feedback_burst:
	JSR cb_bind_has_fx
	BCC +
	LDA.w #7
	JSR cb_bind_fx_flash
+	LDA.w #9
	JMP cb_quake

; ---------------------------------------------------------------------------
; recoverStatus(): L (Focus) breaks sleep, petrification, Frosty, Balloon
; and Engulf ($E190 & $4170) through the native flags, then grants 120
; frames of resistance to them. A16 = 1 while the pending recovery owns
; the input (the caller stops there).
cb_status_recovery:
	; nothing to do without a recovery or a breakable status
	LDA !cb_rec_map
	CMP.w #$FFFF
	BNE .expiry
	LDA $E190
	AND.w #$4170
	BNE .noRec
	RTS                           ; A16 = 0
.expiry
	; an old record expires (map change, time)
	CMP $DC
	BNE .expire
	LDA !cb_frame
	SEC
	SBC !cb_rec_until
	BMI .noRec
.expire
	LDA.w #$FFFF
	STA !cb_rec_map
.noRec
	; a solo Goku keeps Focus even when stone removed his controller
	SEP #$20
	LDA $E02C
	AND.b #$01
	BNE .owner
	LDA $E200
	ORA $E400
	AND.b #$01
	BEQ .owner
	REP #$20
	BRA .none
.owner
	REP #$20
	JSR cb_native_field
	BNE .none
	LDA !cb_inlock
	ORA !cb_lock
	BNE .none
	SEP #$20
	LDA $E4
	CMP.b #$01
	BNE .none8
	LDA $E5
	CMP.b #$01
	BNE .none8
	LDA $D0
	BNE .none8
	LDA $EC
	AND.b #$FE
	BNE .none8
	LDA $ED
	AND.b #$40
	BNE .none8
	LDA $E000
	AND.b #$01
	BEQ .none8
	LDA $E191
	BMI .none8
	REP #$20
	LDA $E182
	BEQ .none
	BRA .field
.none8
	REP #$20
.none
	LDA.w #$0000
	RTS
.field
	LDA $E190
	AND.w #$4170
	STA !cb_t1                    ; status
	BEQ .noStart
	LDA !cb_rec_map
	CMP.w #$FFFF
	BNE .noStart
	; Focus alone: L without B / Y / R / X
	LDA !cb_in
	AND.w #!IN_L|!IN_B|!IN_Y|!IN_R|!IN_X
	CMP.w #!IN_L
	BNE .noStart
	JSR cb_cancel_combat
	; waking from sleep drops a non-permanent Super Saiyan
	LDA !cb_t1
	AND.w #$0010
	BEQ +
	LDA !cb_form
	AND.w #$00FF
	BEQ +
	LDA.l !persist_ssj_lock
	AND.w #$00FF
	BNE +
	SEP #$20
	STZ !cb_form
	REP #$20
	LDA.w #!AUDIO_SFX_REVERT_ID
	JSR cb_sfx
+	LDA $DC
	STA !cb_rec_map
	LDA !cb_frame
	CLC
	ADC.w #180
	STA !cb_rec_until
	LDA !cb_t1
	STA !cb_rec_status
	SEP #$20
	LDA.b #$01
	STA !cb_rec_pend
	STA !cb_pow_blk
	REP #$20
.noStart
	LDA !cb_rec_map
	CMP.w #$FFFF
	BNE +
	LDA.w #$0000
	RTS
+	; cure (and keep curing) the five conditions natively
	LDA !cb_t1
	BEQ +
	LDA $E190
	AND.w #$BE8F                  ; ~$4170
	STA $E190
+	LDA !cb_rec_pend
	AND.w #$00FF
	BNE +
	LDA.w #$0000
	RTS
+	; the pending recovery owns the controls until Goku can act
	LDA.w #$FFF0
	TSB !cb_mask
	JSR cb_compute_can
	BNE +
	LDA.w #$0001
	RTS
+	SEP #$20
	STZ !cb_rec_pend
	REP #$20
	LDA !cb_frame
	CLC
	ADC.w #120
	STA !cb_rec_until
	JSR cb_status_burst
	; holding L+A must be released before the form can change again
	SEP #$20
	STZ !cb_pow_blk
	REP #$20
	LDA !cb_in
	AND.w #!IN_A
	BEQ +
	SEP #$20
	INC !cb_pow_blk
	REP #$20
+	LDA.w #$0000
	RTS

; The recovery burst: impact + shell fragments, cue, small quake.
cb_status_burst:
	JSR cb_effect_alloc
	BCC +
	JMP .sound
+
	SEP #$20
	LDA.b #!ERK_STATUS
	STA.l !ER+!er_kind,X
	LDA.b #14
	STA !cb_t2
	LDA.b #$00
	STA !cb_t3
	LDA !cb_rec_status+1
	AND.b #$40                    ; Engulf ($4000)
	BEQ +
	LDA.b #!ERF_FIRE
	STA !cb_t3
	BRA .life
+	LDA !cb_rec_status
	AND.b #$20                    ; Frosty
	BEQ +
	LDA.b #!ERF_ICE
	STA !cb_t3
	BRA .life
+	LDA !cb_rec_status+1
	AND.b #$01                    ; Balloon ($0100)
	BEQ .flags
	LDA.b #!ERF_BALLOON
	STA !cb_t3
.life
	LDA.b #28
	STA !cb_t2
.flags
	LDA !cb_form
	BEQ +
	LDA.b #!ERF_SUPER
+	ORA !cb_t3
	STA.l !ER+!er_flags,X
	LDA !cb_t2
	STA.l !ER+!er_life,X
	STA.l !ER+!er_max,X
	REP #$20
	LDA $E002
	STA.l !ER+!er_x,X
	LDA $E045
	AND.w #$00FF
	STA !cb_t0
	LDA $E004
	SEC
	SBC.w #16
	SEC
	SBC !cb_t0
	SEC
	SBC !goku_lift
	STA.l !ER+!er_y,X
	JSR cb_fx_spawn_status
.sound
	LDA !cb_rec_status
	AND.w #$4000
	BEQ +
	LDA.w #!AUDIO_SFX_IMPACT_ID
	JSR cb_sfx
	BRA .burst
+	LDA !cb_rec_status
	AND.w #$0020
	BEQ +
	LDA.w #!AUDIO_SFX_ICE_BREAK_ID
	JSR cb_sfx
	BRA .burst
+	LDA !cb_rec_status
	AND.w #$0100
	BEQ .burst
	LDA.w #!AUDIO_SFX_BALLOON_POP_ID
	JSR cb_sfx
.burst
	LDA.w #!AUDIO_SFX_POWER_BURST_ID
	JSR cb_sfx
	LDA.w #6
	JMP cb_quake
