; Aerial attacks share the field's charge, action, form and sound state.
; WORLD owns trajectories, targets and rendering. Its charge words mirror
; combat for the existing world renderer and aim code.

; After world entry/docking, before focus. C set while controls are locked.
cb_world_input:
	LDA.w #$0001
	STA.w !w_combat_owns
	SEP #$20
	STZ !cb_ext_kind
	LDA.b #$03                    ; rear view
	STA !cb_facing
	LDA !cb_act
	CMP.b #!GOKU_K_AIRBEAM
	BNE +
	REP #$20
	LDA.w !w_action_age
	BNE +
	SEP #$20
	STZ !cb_act
+	REP #$20
	LDA !cb_in
	STA.w !w_input
	BIT.w #!IN_L
	BEQ +
	LDA.w #!IN_A|!IN_B
	TSB !cb_mask                  ; L chords never ascend or land
+	LDA !cb_inlock
	BNE .locked
	JSL world_controls_locked
	BCS .locked
	CLC
	RTS
.locked
	STZ !cb_in
	STZ !cb_pad
	STZ !cb_inject
	STZ.w !w_input
	LDA.w #$FFF0
	TSB !cb_mask
	SEP #$20
	LDA !cb_charging
	BNE .cancel
	LDA !cb_act
	CMP.b #!GOKU_K_FOCUS
	BNE +
.cancel
	REP #$20
	JSR cb_cancel_combat
+	REP #$20
	STZ !cb_held
	SEC
	RTS

cb_world_attacks:
	LDA !cb_inlock
	BNE .locked
	JSL world_controls_locked
	BCC .free
.locked
	JMP .mirror
.free
	LDA !cb_in
	BIT.w #!IN_Y
	BNE +
	SEP #$20
	STZ !cb_ki_blk
	REP #$20
+	LDA !cb_in
	AND.w #!IN_L|!IN_Y
	CMP.w #!IN_L|!IN_Y
	BNE .release
	LDA !cb_charging
	AND.w #$00FF
	BNE .charge
	LDA.w !w_shot
	BEQ +
	JMP .mirror
+	SEP #$20
	LDA !cb_ki_blk
	BEQ +
	JMP .mirror8
+	LDA !cb_act
	BEQ .start
	CMP.b #!GOKU_K_READY
	BEQ .start
	CMP.b #!GOKU_K_FOCUS
	BEQ .start
	JMP .mirror8
.start
	REP #$20
	JSR cb_start_charge
	LDA.w #!TGT_NONE
	STA.w !w_aim
	STZ.w !wa_mega
.charge
	JSR cb_charge_step
	LDA.w !w_frame
	LSR
	BCC .mirror
	LDA.w #!IN_UP|!IN_DN
	TSB !cb_mask                  ; half speed while charging
	BRA .mirror
.release
	LDA !cb_charging
	AND.w #$00FF
	BEQ .ki
	LDA !cb_charge
	STA.w !w_charge
	JSL world_fire_wave_local
	JSR cb_bind_voice_release
	SEP #$20
	LDA !cb_in+1
	AND.b #(!IN_Y>>8)
	STA !cb_ki_blk                ; releasing L while Y stays held must not fire stray ki
	REP #$20
	BRA .fired
.ki
	LDA !cb_in
	AND.w #!IN_Y|!IN_L
	CMP.w #!IN_Y
	BNE .mirror
	LDA.w !w_shot
	BNE .mirror
	SEP #$20
	LDA !cb_ki_blk
	ORA !cb_act
	BNE .mirror8
	REP #$20
	JSL world_fire_ki
.fired
	SEP #$20
	STZ !cb_charging
	REP #$20
	STZ !cb_charge
	STZ !cb_t0                    ; w_action_age owns the lifetime, including shield deflection
	SEP #$20
	LDA.b #!GOKU_K_AIRBEAM
	JSR cb_begin_action
	BRA .mirror
.mirror8
	REP #$20
.mirror
	LDA !cb_charge
	STA.w !w_charge
	LDA !cb_charging
	AND.w #$00FF
	STA.w !w_charging
	RTS
