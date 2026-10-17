; Actions: focus, transformation, punches, ki blasts, Kamehameha charge and
; release, and their per-frame advance (mana-mod.js focus, configure, punch,
; kiBlast, fireKi, startCharge, releaseCharge, advanceAction).

; Facing -> (dx, dy) as signed bytes.
cb_dir_dx:
	db $00,$01,$FF,$00
cb_dir_dy:
	db $01,$00,$00,$FF

; A16 = base value, X16 = Super Saiyan value -> A16 by the current form.
cb_by_form:
	PHA
	LDA !cb_form
	AND.w #$00FF
	BEQ .base
	PLA
	TXA
	RTS
.base
	PLA
	RTS
; Same, by the form the current action started in.
cb_by_super:
	PHA
	LDA !cb_act_super
	AND.w #$00FF
	BEQ .base
	PLA
	TXA
	RTS
.base
	PLA
	RTS

; ---------------------------------------------------------------------------
; damageScale(): 4095 / 8191, x0.9 with the Heavy Gi (exact table).
; Out: A16 = scale, X = table offset (form*2+gi)*8; also cb_scale, cb_gi.
cb_damage_scale:
	JSR cb_gi_worn
	STA !cb_t0
	SEP #$20
	STA !cb_gi
	REP #$20
	LDA !cb_form
	AND.w #$0001
	ASL
	ORA !cb_t0
	ASL : ASL : ASL
	TAX
	LDA.l combat_damage_table,X
	STA !cb_scale
	RTS

; A16 = 1 when Goku wears the Heavy Gi (armor 22 in his body slot).
cb_gi_worn:
	LDA $E1E1
	AND.w #$00FF
	CMP.w #$0016
	BNE .no
	LDA.w #$0001
	RTS
.no
	LDA.w #$0000
	RTS

; ---------------------------------------------------------------------------
; cancelCombat(): combat's own action, queued input, charge and every
; effect; launches and the form stay.
cb_cancel_combat:
	JSR cb_cancel_combat_quiet
	JSR cb_bind_sfx_cancel
	RTS
cb_cancel_combat_quiet:
	SEP #$20
	STZ !cb_act
	STZ !cb_queued
	STZ !cb_tap
	STZ !cb_charging
	STZ !cb_blast_cd
	STZ !cb_act_pause
	REP #$20
	STZ !cb_held
	STZ !cb_charge
	STZ !cb_power
	JSR cb_effects_clear
	RTS

; Begin an action: A8 = kind (M8 on entry); cb_t0 = duration (word).
cb_begin_action:
	SEP #$20
	STA !cb_act
	LDA !cb_facing
	STA !cb_act_face
	LDA !cb_form
	STA !cb_act_super
	STZ !cb_act_arg
	STZ !cb_act_imp
	STZ !cb_act_fl
	STZ !cb_act_pause
	REP #$20
	STZ !cb_act_age
	LDA !cb_t0
	STA !cb_act_dur
	RTS

; ---------------------------------------------------------------------------
; focus(): L builds the aura over 96 frames; L+A at full power commits the
; transformation; a fresh L+A in Super Saiyan reverts in 10 frames.
cb_focus:
	LDA !cb_in
	BIT.w #!IN_L
	BNE .held
	SEP #$20
	STZ !cb_pow_blk
	LDA !cb_act
	CMP.b #!GOKU_K_FOCUS
	BNE +
	STZ !cb_act
+	REP #$20
	STZ !cb_power
	RTS
.held
	; transform chord (L+A) this frame -> cb_t1
	STZ !cb_t1
	LDA !cb_in
	AND.w #!IN_L|!IN_A
	CMP.w #!IN_L|!IN_A
	BNE +
	INC !cb_t1
+	; a fresh chord in Super Saiyan reverts
	LDA !cb_t1
	BEQ .noRevert
	LDA !cb_in_prev
	AND.w #!IN_L|!IN_A
	CMP.w #!IN_L|!IN_A
	BEQ .noRevert
	LDA !cb_form
	AND.w #$00FF
	BEQ .noRevert
	LDA.l !persist_ssj_lock
	AND.w #$00FF
	BNE .noRevert
	LDA.w #$0000
	JSR cb_set_form
	LDA.w #10
	STA !cb_act_dur
	SEP #$20
	LDA.b #$01
	STA !cb_pow_blk
	REP #$20
	RTS
.noRevert
	SEP #$20
	LDA !cb_pow_blk
	BNE .out8
	LDA !cb_ext_kind
	BNE .out8
	LDA !cb_act
	BEQ .start
	CMP.b #!GOKU_K_FOCUS
	BEQ .grow8
	CMP.b #!GOKU_K_READY
	BNE .out8
.start
	REP #$20
	STZ !cb_t0
	SEP #$20
	LDA.b #!GOKU_K_FOCUS
	JSR cb_begin_action
.grow8
	REP #$20
	LDA !cb_power
	CMP.w #96
	BCS +
	INC !cb_power
+	LDA !cb_t1
	BEQ .out
	LDA !cb_power
	CMP.w #96
	BNE .out
	SEP #$20
	LDA $E191                     ; poison or sleep forbid the form
	AND.b #$20
	BNE .out8
	LDA $E190
	AND.b #$10
	BNE .out8
	REP #$20
	LDA.w #$0001
	JSR cb_set_form
	SEP #$20
	LDA.b #$01
	STA !cb_pow_blk
.out8
	REP #$20
.out
	RTS

; configure({superSaiyan}): A16 = new form. A changed form plays the
; transformation (32 frames, 72 for the first reveal) or reversion (20).
cb_set_form:
	AND.w #$0001
	STA !cb_t2
	LDA.l !persist_ssj_lock
	AND.w #$00FF
	BEQ +
	LDA.w #$0001
	STA !cb_t2
	BRA .chk
+	LDA !cb_t2
	BEQ .chk
	SEP #$20
	LDA $E191
	AND.b #$20
	BNE .noForm
	LDA $E190
	AND.b #$10
	BEQ .chk8
.noForm
	REP #$20
	STZ !cb_t2
.chk8
	REP #$20
.chk
	LDA !cb_form
	AND.w #$00FF
	CMP !cb_t2
	BNE .changed
	RTS
.changed
	SEP #$20
	LDA !cb_t2
	STA !cb_form
	REP #$20
	JSR cb_cancel_combat
	LDA !cb_t2
	BEQ .revert
	LDA.w #32
	STA !cb_t0
	SEP #$20
	LDA.b #!GOKU_K_TRANSFORM
	JSR cb_begin_action
	LDA.w #!AUDIO_SFX_TRANSFORM_ID
	JSR cb_sfx
	; the first reveal lingers in the gold pose
	JSR cb_bind_intro_super
	BCS .done
	LDA.w #72
	STA !cb_act_dur
	SEP #$20
	LDA !cb_act_fl
	ORA.b #!AF_REVEAL
	STA !cb_act_fl
	REP #$20
.done
	RTS
.revert
	LDA.w #20
	STA !cb_t0
	SEP #$20
	LDA.b #!GOKU_K_REVERT
	JSR cb_begin_action
	LDA.w #!AUDIO_SFX_REVERT_ID
	JSR cb_sfx
	RTS

; ---------------------------------------------------------------------------
; punch(): combo chain lead jab -> cross -> kick within 40 frames.
cb_punch:
	LDA !cb_can
	AND.w #$00FF
	BNE +
	RTS
+	; combo = frame <= comboUntil ? (combo + 1) % 3 : 0
	STZ !cb_t3
	LDA !cb_frame
	SEC
	SBC !cb_combo_until           ; signed: survives the counter wrap
	BEQ .chain
	BPL .first
.chain
	LDA !cb_combo
	AND.w #$00FF
	INC
	CMP.w #$0003
	BCC +
	LDA.w #$0000
+	STA !cb_t3
.first
	SEP #$20
	LDA !cb_t3
	STA !cb_combo
	REP #$20
	LDA !cb_frame
	CLC
	ADC.w #40
	STA !cb_combo_until
	LDA.w #14
	LDX.w #7
	JSR cb_by_form
	STA !cb_t0
	SEP #$20
	LDA.b #!GOKU_K_PUNCH
	JSR cb_begin_action
	LDA.w #2
	LDX.w #1
	JSR cb_by_form
	SEP #$20
	STA !cb_act_imp
	LDA !cb_combo
	STA !cb_act_arg
	REP #$20
	LDA !cb_combo
	AND.w #$00FF
	CMP.w #$0002
	BEQ .kick
	LDA.w #!AUDIO_SFX_SWING_ID
	JMP cb_sfx
.kick
	LDA.w #!AUDIO_SFX_KICK_SWING_ID
	JMP cb_sfx

; kiBlast(): one palm shot per tap, every 12 / 5 frames while held.
cb_ki_blast:
	LDA !cb_can
	AND.w #$00FF
	BNE +
	RTS
+	LDA.w #10
	LDX.w #5
	JSR cb_by_form
	STA !cb_t0
	SEP #$20
	LDA.b #!GOKU_K_BLAST
	JSR cb_begin_action
	SEP #$20
	LDA !cb_ki_hand
	AND.b #$01
	STA !cb_act_arg
	INC !cb_ki_hand
	REP #$20
	LDA.w #12
	LDX.w #5
	JSR cb_by_form
	SEP #$20
	STA !cb_blast_cd
	REP #$20
	RTS

; startCharge(): L+Y.
cb_start_charge:
	LDA !cb_can
	AND.w #$00FF
	BNE +
	RTS
+	SEP #$20
	LDA.b #$01
	STA !cb_charging
	STZ !cb_queued
	STZ !cb_tap
	REP #$20
	STZ !cb_charge
	STZ !cb_power
	STZ !cb_t0
	SEP #$20
	LDA.b #!GOKU_K_CHARGE
	JSR cb_begin_action
	LDA.w #!AUDIO_SFX_CHARGE_ID
	JSR cb_sfx
	JSR cb_bind_voice_start
	RTS

; One charging frame: +1 up to the cap; the cue at full power.
cb_charge_step:
	LDA.w #90
	LDX.w #45
	JSR cb_by_form
	STA !cb_t0
	LDA !cb_charge
	CMP !cb_t0
	BCS +
	INC !cb_charge
+	LDA !cb_charge
	CMP !cb_t0
	BNE .face
	SEP #$20
	LDA !cb_act
	BEQ .face8
	LDA !cb_act_fl
	BIT.b #!AF_FULL
	BNE .face8
	ORA.b #!AF_FULL
	STA !cb_act_fl
	REP #$20
	LDA.w #!AUDIO_SFX_CHARGED_ID
	JSR cb_sfx
.face8
	REP #$20
.face
	SEP #$20
	LDA !cb_facing
	STA !cb_act_face
	REP #$20
	RTS

; releaseCharge(): the beam along the locked facing.
cb_release_charge:
	SEP #$20
	LDA !cb_charging
	BNE +
	REP #$20
	RTS
+	STZ !cb_charging
	REP #$20
	JMP cb_fire_beam

; ---------------------------------------------------------------------------
; advanceAction(): one frame of the current action.
cb_advance_action:
	SEP #$20
	LDA !cb_act
	BNE +
	REP #$20
	RTS
+	; a connected punch holds its contact pose
	CMP.b #!GOKU_K_PUNCH
	BNE .age
	LDA !cb_act_pause
	BEQ .age
	DEC !cb_act_pause
	REP #$20
	RTS
.age
	REP #$20
	INC !cb_act_age
	LDA !cb_act
	AND.w #$00FF
	CMP.w #!GOKU_K_TRANSFORM
	BEQ .transform
	CMP.w #!GOKU_K_PUNCH
	BEQ .punch
	CMP.w #!GOKU_K_BLAST
	BEQ .blast
	BRL .checks
.transform
	; the first gold cell: age >= ceil(duration * 14 / 40)
	LDA !cb_act_fl
	BIT.w #!AF_BURST
	BEQ +
	BRL .checks
+
	LDA !cb_act_dur
	ASL
	STA !cb_t0                    ; dur*2
	ASL : ASL : ASL               ; dur*16
	SEC
	SBC !cb_t0                    ; dur*14
	CLC
	ADC.w #39
	JSR cb_div40
	CMP !cb_act_age
	BEQ .burst
	BCS .checks
.burst
	SEP #$20
	LDA !cb_act_fl
	ORA.b #!AF_BURST
	STA !cb_act_fl
	REP #$20
	LDA.w #!AUDIO_SFX_POWER_BURST_ID
	JSR cb_sfx
	JSR cb_feedback_burst
	JSR cb_transform_burst
	BRA .checks
.punch
	LDA !cb_act_fl
	BIT.w #!AF_HIT
	BNE .checks
	LDA !cb_act_imp
	AND.w #$00FF
	CMP !cb_act_age
	BEQ .strike
	BCS .checks
.strike
	SEP #$20
	LDA !cb_act_fl
	ORA.b #!AF_HIT
	STA !cb_act_fl
	REP #$20
	JSR cb_strike
	BRA .checks
.blast
	LDA !cb_act_fl
	BIT.w #!AF_SHOT
	BNE .checks
	LDA.w #2
	LDX.w #1
	JSR cb_by_super
	CMP !cb_act_age
	BEQ .shoot
	BCS .checks
.shoot
	SEP #$20
	LDA !cb_act_fl
	ORA.b #!AF_SHOT
	STA !cb_act_fl
	REP #$20
	JSR cb_fire_ki
.checks
	; the action ends at its duration
	SEP #$20
	LDA !cb_act
	REP #$20
	BEQ .out
	LDA !cb_act_dur
	BEQ .open
	LDA !cb_act_age
	CMP !cb_act_dur
	BCC .open
	SEP #$20
	STZ !cb_act
	REP #$20
	RTS
.open
	; one queued strike may cancel the visible recovery
	SEP #$20
	LDA !cb_act
	CMP.b #!GOKU_K_PUNCH
	BNE .out8
	LDA !cb_queued
	BEQ .out8
	REP #$20
	LDA.w #9
	LDX.w #4
	JSR cb_by_super
	CMP !cb_act_age
	BEQ .queued
	BCS .out
.queued
	SEP #$20
	STZ !cb_queued
	REP #$20
	JMP cb_punch
.out8
	REP #$20
.out
	RTS

; A16 = A16 / 40 (unsigned).
cb_div40:
	LDX.w #$0000
-	CMP.w #40
	BCC +
	SBC.w #40
	INX
	BRA -
+	TXA
	RTS
