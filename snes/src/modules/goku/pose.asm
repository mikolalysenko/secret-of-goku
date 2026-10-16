; Pose selection: a port of engine/goku-animation.js GokuAnimation.pose()
; for the field actor. Inputs are the boy's native animation state (actor 0
; at $7E:E000) plus the public request fields other modules set (goku_act,
; goku_mode, goku_lift, goku_ctl, goku_cell_req). Output: p_cell (cell id),
; p_flags, p_lift.
;
; Routines: X/Y 16-bit, DB = $7E, D = 0. Each immediate is sized (.b/.w)
; for the M state at that instruction (asar does not track REP/SEP).

!SHEET_SSJ = 1
!SHEET_JAB = 2

goku_row_of_facing:          ; facing down, right, left, up -> source row
	db 0,2,1,3
goku_sheet_base:             ; goku 63 columns, ssj 55, lead jab 4 (x4 rows)
	dw 0, 252, 472
; Joypad ($4218 layout) direction toward each facing, and the opposite one.
goku_dir_mask:
	dw $0400,$0100,$0200,$0800
goku_opp_mask:
	dw $0800,$0200,$0100,$0400

goku_pose:
	REP #$30
	SEP #$20
	STZ !p_flags
	STZ !p_use_native
	STZ !p_var
	STZ !p_native
	REP #$20
	STZ !p_lift
	LDA !goku_cell_req       ; explicit cell + 1 (scenes)
	BEQ .pose
	DEC
	STA !p_cell
	LDA !goku_lift
	STA !p_lift
	BRA .small
.pose
	JSR pose_inputs
	JSR pose_select_kind
	JSR pose_push
	JSR pose_update_state
	JSR pose_result
	JSR pose_post
	JSR pose_cell_lookup
.small
	SEP #$20
	LDA $E180
	CMP.b #$F6               ; pygmy / miniature species
	BNE .done
	LDA.b #!GOKU_PF_SMALL
	TSB !p_flags
.done
	REP #$30
	RTS

; ---------------------------------------------------------------------------
; Frame inputs: new-frame flag, distance moved, facing/row, validated native
; action, field control gate.
pose_inputs:
	SEP #$20
	STZ !p_newframe
	REP #$30
	LDA.l !core_frame
	CMP !st_frame
	BEQ .same
	SEP #$20
	INC !p_newframe
	REP #$20
.same
	STZ !p_dist
	LDA !p_newframe
	AND.w #$00FF
	BEQ .nodist
	LDA $DC
	CMP !st_map
	BNE .nodist
	LDA $E002
	SEC
	SBC !st_x
	BPL .dxpos
	EOR.w #$FFFF
	INC
.dxpos
	CMP.w #13
	BCS .nodist
	STA !t_a                 ; |dx|
	LDA $E004
	SEC
	SBC !st_y
	BPL .dypos
	EOR.w #$FFFF
	INC
.dypos
	CMP.w #13
	BCS .nodist
	STA !t_b                 ; |dy|
	ASL
	ASL
	ASL
	STA !t_c                 ; dy*8
	LDA !t_b
	ASL
	ASL                      ; dy*4
	CLC
	ADC !t_c
	CLC
	ADC !t_b                 ; dy*13
	CLC
	ADC !t_a
	ASL
	TAX
	LDA.l goku_hypot,X
	STA !p_dist
.nodist
	; stationary frames (saturating)
	LDA !p_newframe
	AND.w #$00FF
	BEQ .facing
	LDA !p_dist
	BEQ .still
	STZ !st_stat
	BRA .facing
.still
	LDA !st_stat
	CMP.w #$7FFF
	BCS .facing
	INC !st_stat
.facing
	SEP #$20
	LDA !goku_act
	BEQ .native_facing
	LDA !goku_act_facing
	AND.b #$03
	BRA .set_facing
.native_facing
	LDA $E010
	AND.b #$7F
	BNE .not_up
	LDA.b #3                 ; up
	BRA .set_facing
.not_up
	CMP.b #$01
	BNE .side
	LDA.b #0                 ; down
	BRA .set_facing
.side
	LDA $E010
	BMI .left
	LDA.b #1                 ; right
	BRA .set_facing
.left
	LDA.b #2
.set_facing
	STA !p_facing
	REP #$20
	AND.w #$0003
	TAX
	SEP #$20
	LDA.l goku_row_of_facing,X
	STA !p_row
	; Validated native action: GokuNativeActions[$E031 & $7F] whose sequence
	; pointer list contains $E018 (the standard player table at D1:37CC).
	LDA $E031
	AND.b #$7F
	CMP.b #!GOKU_ACTION_COUNT
	BCS .gate
	REP #$20
	AND.w #$00FF
	STA !t_a
	ASL
	TAX
	LDA.l goku_action_ptr,X
	TAX
	LDA $E018
	CMP.l goku_action_data+5,X
	BEQ .valid
	CMP.l goku_action_data+7,X
	BEQ .valid
	CMP.l goku_action_data+9,X
	BNE .gate
.valid
	STX !t_ptr
	SEP #$20
	LDA !t_a
	INC
	STA !p_native
.gate
	; Field control gate (mana-mod.js canAttack, native part).
	SEP #$20
	STZ !p_can_attack
	LDA $E4
	CMP.b #$01
	BNE .done
	LDA $E5
	CMP.b #$01
	BNE .done
	LDA $E000
	AND.b #$01
	BEQ .done
	LDA $E02C
	AND.b #$01
	BEQ .done
	LDA $EC
	AND.b #$FE
	BNE .done
	LDA $ED
	AND.b #$40
	BNE .done
	LDA $D0
	BNE .done
	LDA $E190
	AND.b #$70
	BNE .done
	LDA $E191
	AND.b #$D5
	BNE .done
	INC !p_can_attack
.done
	REP #$30
	RTS

; ---------------------------------------------------------------------------
; Kind selection, in the order of pose(). Output p_kind, p_use_native.
pose_select_kind:
	SEP #$20
	LDA !goku_mode
	CMP.b #!GOKU_K_CEILING
	BEQ .mode
	CMP.b #!GOKU_K_TAKEOFF
	BEQ .mode
	CMP.b #!GOKU_K_LANDING
	BEQ .mode
	LDA $E191
	BPL .alive
	LDA.b #!GOKU_K_DEAD
	BRA .set
.alive
	LDA $E190
	AND.b #$10
	BEQ .awake
	LDA.b #!GOKU_K_SLEEP
	BRA .set
.awake
	LDA $E190
	AND.b #$40
	BEQ .not_stone
	LDA.b #!GOKU_K_IDLE      ; petrified: standing, stone colours
	BRA .set
.not_stone
	LDA !goku_mode
	CMP.b #!GOKU_K_GAPFLIGHT
	BEQ .mode
	CMP.b #!GOKU_K_RESCUEDIVE
	BEQ .mode
	CMP.b #!GOKU_K_DEFLECT
	BEQ .reaction
	CMP.b #!GOKU_K_RESIST
	BNE .hurt
.reaction
	LDA !goku_act
	BEQ .mode
.hurt
	LDA $E011
	CMP.b #$8C
	BEQ .hurt_anim
	CMP.b #$8D
	BNE .action
.hurt_anim
	LDA !goku_act
	BNE .action
	LDA !p_native
	BEQ .hurt_plain
	LDA.b #$01
	STA !p_use_native
.hurt_plain
	LDA.b #!GOKU_K_HURT
	BRA .set
.action
	LDA !goku_act
	BEQ .altar
	BRA .set
.mode
	LDA !goku_mode
.set
	STA !p_kind
	REP #$30
	RTS
.altar
	LDA !goku_mode
	CMP.b #!GOKU_K_ALTARRUN
	BNE .hover
	JSR pose_moving_recent
	BCC .hover
	LDA.b #!GOKU_K_RUN
	BRA .set
.hover
	LDA !p_can_attack
	BEQ .native
	LDA !goku_ctl
	AND.b #!GOKU_CTL_LOCALFLY
	BNE .is_hover
	LDA !goku_lift
	ORA !goku_lift+1
	BEQ .native
.is_hover
	LDA.b #!GOKU_K_HOVER
	BRA .set
.native
	LDA !p_native
	BEQ .nonative
	LDA.b #$01
	STA !p_use_native
	LDX !t_ptr
	LDA.l goku_action_data,X ; dispatch mode
	CMP.b #1                 ; locomotion
	BEQ .loco
	CMP.b #4                 ; guardStep
	BEQ .loco
	LDA.l goku_action_data+4,X ; kind code
	BRA .set
.loco
	JSR pose_moving_recent
	BCC .loco_still
	LDA.l goku_action_data+2,X ; run flag
	BEQ .loco_walk
	LDA.b #!GOKU_K_RUN
	BRA .set
.loco_walk
	LDA.b #!GOKU_K_WALK
	BRA .set
.loco_still
	LDA.l goku_action_data,X
	CMP.b #4
	BNE .loco_idle
	LDA.b #!GOKU_K_GUARD
	BRA .set
.loco_idle
	LDA.b #!GOKU_K_IDLE
	BRA .set
.nonative
	LDA $E011
	CMP.b #$A0
	BEQ .fall
	CMP.b #$AE
	BNE .not_fall
.fall
	LDA.b #!GOKU_K_FALL
	JMP .set
.not_fall
	CMP.b #$8F
	BEQ .recover
	CMP.b #$A2
	BNE .not_recover
.recover
	LDA.b #!GOKU_K_RECOVER
	JMP .set
.not_recover
	CMP.b #$88
	BNE .not_celebrate
	LDA.b #!GOKU_K_CELEBRATE
	JMP .set
.not_celebrate
	LDA $E045
	BNE .jump
	LDA $E011
	CMP.b #$A1
	BNE .not_jump
.jump
	LDA.b #!GOKU_K_JUMP
	JMP .set
.not_jump
	CMP.b #$AD
	BNE .not_pull
	LDA.b #!GOKU_K_SWORDPULL
	JMP .set
.not_pull
	CMP.b #$AF
	BNE .not_dead
	LDA.b #!GOKU_K_DEAD
	JMP .set
.not_dead
	; walking: moved this frame, or native walk/run requested in the last 3
	REP #$20
	LDA !p_dist
	SEP #$20
	BNE .walk
	LDA $E011
	CMP.b #$01
	BEQ .walk_req
	CMP.b #$02
	BNE .idle
.walk_req
	REP #$20
	LDA !st_stat
	CMP.w #3
	SEP #$20
	BCS .idle
.walk
	LDA $E011
	CMP.b #$02
	BNE .walk_slow
	LDA.b #!GOKU_K_RUN
	JMP .set
.walk_slow
	LDA.b #!GOKU_K_WALK
	JMP .set
.idle
	LDA.b #!GOKU_K_IDLE
	JMP .set

; C set when distance > 0 this frame or stationary < 3. Preserves M/X.
pose_moving_recent:
	PHP
	REP #$20
	LDA !p_dist
	BNE .yes
	LDA !st_stat
	CMP.w #3
	BCC .yes
	PLP
	CLC
	RTS
.yes
	PLP
	SEC
	RTS

; C set when this frame moved, or stationary < 3 with accumulated distance.
; Exit M16.
pose_moving_recent_dist:
	REP #$20
	LDA !p_dist
	BNE .yes
	LDA !st_stat
	CMP.w #3
	BCS .no
	LDA !st_moved
	AND.w #$00FF
	BNE .yes
.no
	CLC
	RTS
.yes
	SEC
	RTS

; ---------------------------------------------------------------------------
; Pushing against walls and actors (pose(): pressure / actorPush / blocked).
pose_push:
	REP #$30
	STZ !t_a                 ; t_a = pressure, t_a+1 = ground control
	STZ !t_b                 ; t_b = pushing
	SEP #$20
	LDA !p_can_attack
	BEQ .actor
	LDA $E045
	BNE .actor
	LDA !goku_ctl
	AND.b #!GOKU_CTL_LOCALFLY
	BNE .actor
	LDA !goku_lift
	ORA !goku_lift+1
	BNE .actor
	LDA !goku_act
	BNE .actor
	LDA !goku_mode
	CMP.b #!GOKU_K_DEFLECT
	BEQ .actor
	CMP.b #!GOKU_K_RESIST
	BEQ .actor
	LDA.b #$01
	STA !t_a+1               ; groundedControl
	REP #$20
	LDA !p_facing
	AND.w #$0003
	ASL
	TAX
	LDA.l $004218
	AND.l goku_dir_mask,X
	BEQ .no_pressure
	LDA.l $004218
	AND.l goku_opp_mask,X
	BNE .no_pressure
	SEP #$20
	INC !t_a                 ; pressure
.no_pressure
	SEP #$20
.actor
	; actorPush: native ids 8 / 17 under ground control
	LDA !t_a+1
	BEQ .pushing
	LDA !p_use_native
	BEQ .pushing
	LDA !p_native
	CMP.b #8+1
	BEQ .actor_push
	CMP.b #17+1
	BNE .pushing
.actor_push
	STZ !p_use_native
	LDA !t_a
	BEQ .actor_idle
	LDA.b #!GOKU_K_PUSH
	BRA .actor_set
.actor_idle
	LDA.b #!GOKU_K_IDLE
.actor_set
	STA !p_kind
.pushing
	; pushing = pressure && kind in idle/walk/run
	LDA !t_a
	BEQ .blocked
	LDA !p_kind
	CMP.b #!GOKU_K_RUN+1
	BCS .blocked
	INC !t_b
.blocked
	LDA !p_newframe
	BEQ .decide
	LDA !t_b
	BEQ .clear
	REP #$20
	LDA !p_dist
	BNE .clear
	LDA $DC
	CMP !st_map
	BNE .clear
	SEP #$20
	LDA !st_facing
	CMP !p_facing
	BNE .clear
	LDA !st_blocked
	CMP.b #$FF
	BEQ .decide
	INC !st_blocked
	BRA .decide
.clear
	SEP #$20
	STZ !st_blocked
.decide
	LDA !t_b
	BEQ .done
	LDA !st_blocked
	CMP.b #6
	BCC .done
	LDA.b #!GOKU_K_PUSH
	STA !p_kind
	STZ !p_use_native
.done
	REP #$30
	RTS

; ---------------------------------------------------------------------------
; Age and distance bookkeeping (once per frame). Sets p_age.
pose_update_state:
	SEP #$20
	LDA !p_newframe
	BNE .new
	REP #$20
	LDA !st_age
	STA !p_age
	RTS
.new
	LDA !p_kind
	CMP !st_kind
	BNE .changed
	REP #$20
	LDA $DC
	CMP !st_map
	BNE .changed
	LDA !st_age
	INC
	BEQ .accumulate          ; saturate at $FFFF
	STA !st_age
	BRA .accumulate
.changed
	REP #$20
	STZ !st_age
	; walk/run/push and shuffle kinds restart their distance, unless both the
	; old and new kinds are shuffle kinds on the same map
	SEP #$20
	LDA !p_kind
	JSR pose_is_stepper
	BCC .accumulate
	REP #$20
	LDA $DC
	CMP !st_map
	BNE .reset
	SEP #$20
	LDA !p_kind
	JSR pose_is_shuffle
	BCC .reset
	LDA !st_kind
	JSR pose_is_shuffle
	BCS .accumulate
.reset
	REP #$20
	STZ !st_acc6
	STZ !st_acc16
	SEP #$20
	STZ !st_step4
	STZ !st_step2
	STZ !st_moved
.accumulate
	REP #$20
	LDA !p_dist
	BEQ .store
	SEP #$20
	LDA.b #$01
	STA !st_moved
	REP #$20
	LDA !st_acc6
	CLC
	ADC !p_dist
.mod6
	CMP.w #6*256
	BCC .mod6_done
	SBC.w #6*256
	SEP #$20
	INC !st_step4
	REP #$20
	BRA .mod6
.mod6_done
	STA !st_acc6
	LDA !st_acc16
	CLC
	ADC !p_dist
.mod16
	CMP.w #16*256
	BCC .mod16_done
	SBC.w #16*256
	SEP #$20
	INC !st_step2
	REP #$20
	BRA .mod16
.mod16_done
	STA !st_acc16
.store
	LDA.l !core_frame
	STA !st_frame
	LDA $DC
	STA !st_map
	LDA $E002
	STA !st_x
	LDA $E004
	STA !st_y
	SEP #$20
	LDA !p_kind
	STA !st_kind
	LDA !p_facing
	STA !st_facing
	REP #$20
	LDA !st_age
	STA !p_age
	RTS

; A8 = kind. C set for walk/run/push and the shuffle kinds.
pose_is_stepper:
	CMP.b #!GOKU_K_WALK
	BEQ pose_kind_yes
	CMP.b #!GOKU_K_RUN
	BEQ pose_kind_yes
	CMP.b #!GOKU_K_PUSH
	BEQ pose_kind_yes
; A8 = kind. C set for charge, ready, focus, transform and revert.
pose_is_shuffle:
	CMP.b #!GOKU_K_CHARGE
	BEQ pose_kind_yes
	CMP.b #!GOKU_K_READY
	BEQ pose_kind_yes
	CMP.b #!GOKU_K_FOCUS
	BEQ pose_kind_yes
	CMP.b #!GOKU_K_TRANSFORM
	BEQ pose_kind_yes
	CMP.b #!GOKU_K_REVERT
	BEQ pose_kind_yes
	CLC
	RTS
pose_kind_yes:
	SEC
	RTS

; ---------------------------------------------------------------------------
; Track a clip of the current form: A8 = clip id, t_age = age, t_row = row.
; Result: p_sheet, p_col, p_rowout, p_var ($80|beat for the nudge clip).
pose_track:
	REP #$30
	AND.w #$00FF
	STA !t_c
	LDA !goku_form
	AND.w #$0001
	BEQ .base
	LDA.w #!GOKU_CLIP_COUNT
.base
	CLC
	ADC !t_c
	ASL
	TAX
	LDA.l goku_clip_ptr,X
	TAX
	LDA.l goku_clip_data+2,X ; total ticks
	STA !t_c
	LDA.l goku_clip_data+1,X ; loop flag (low byte)
	AND.w #$00FF
	BEQ .clamp
	PHX
	LDA !t_age
	LDX !t_c
	JSR goku_div16           ; X = age % total
	TXA
	PLX
	BRA .time
.clamp
	LDA !t_c
	DEC
	CMP !t_age
	BCC .time                ; total-1 < age: hold the last tick
	LDA !t_age
.time
	STA !t_d                 ; time within the clip
	LDA.l goku_clip_data,X
	AND.w #$00FF
	STA !t_b                 ; frames left
	INX
	INX
	INX
	INX
.frame
	LDA !t_b
	CMP.w #$0001
	BEQ .take                ; the last frame holds
	LDA.l goku_clip_data+1,X ; ticks
	AND.w #$00FF
	STA !t_c
	LDA !t_d
	CMP !t_c
	BCC .take
	SEC
	SBC !t_c
	STA !t_d
	INX
	INX
	INX
	INX
	INX
	DEC !t_b
	BRA .frame
.take
	SEP #$20
	LDA.l goku_clip_data,X
	STA !p_col
	LDA.l goku_clip_data+2,X
	CMP.b #$FF
	BNE .sheet
	LDA !goku_form
	AND.b #$01
.sheet
	STA !p_sheet
	LDA.l goku_clip_data+3,X
	CMP.b #$FF
	BNE .row
	LDA !t_row
.row
	STA !p_rowout
	LDA.l goku_clip_data+4,X
	CMP.b #$FF
	BEQ .done
	ORA.b #$80
	STA !p_var
.done
	REP #$30
	RTS

; Unsigned 16-bit division, software only (no shared math registers):
; A16 = dividend, X16 = divisor (nonzero) -> A = quotient, X = remainder.
; Clobbers Y. Needs M16/X16.
goku_div16:
	STX !div_d
	STZ !div_r
	LDY.w #16
.bit
	ASL
	ROL !div_r
	PHA
	LDA !div_r
	CMP !div_d
	BCC .zero
	SBC !div_d
	STA !div_r
	PLA
	ORA.w #$0001
	BRA .next
.zero
	PLA
.next
	DEY
	BNE .bit
	LDX !div_r
	RTS

; Set the result to a cell of the current form: A8 = column, row = p_row.
; Exit M16.
pose_form_col:
	SEP #$20
	STA !p_col
	LDA !goku_form
	AND.b #$01
	STA !p_sheet
	LDA !p_row
	STA !p_rowout
	REP #$30
	RTS

; M8: A = base-form value, Y = Super Saiyan value -> A for the current form.
pose_by_form:
	PHA
	LDA !goku_form
	AND.b #$01
	BEQ .base
	PLA
	TYA
	RTS
.base
	PLA
	RTS

; M8: A = facing 0-3 -> A = row. Keeps M8.
pose_row_of:
	REP #$20
	AND.w #$0003
	TAX
	SEP #$20
	LDA.l goku_row_of_facing,X
	RTS

; t_row = facing right ? 2 : 1 (the side rows of the knockdown strips). Exit M16.
pose_side_row:
	SEP #$20
	LDA !p_facing
	CMP.b #1
	BEQ .right
	LDA.b #1
	BRA .set
.right
	LDA.b #2
.set
	STA !t_row
	REP #$30
	RTS

; M8: A = row mode ($FF caller row, $FE side row, else literal) -> A = row.
pose_row_mode:
	CMP.b #$FF
	BEQ .caller
	CMP.b #$FE
	BEQ .side
	RTS
.caller
	LDA !p_row
	RTS
.side
	LDA !p_facing
	CMP.b #1
	BEQ .right
	LDA.b #1
	RTS
.right
	LDA.b #2
	RTS

; ---------------------------------------------------------------------------
; Cell selection for the kind (pose()'s if/else chain).
pose_result:
	REP #$30
	LDA !p_age
	STA !t_age
	SEP #$20
	LDA !p_row
	STA !t_row
	; native phases for native kinds (and native hurt) when validated
	LDA !p_use_native
	BEQ .generic
	LDA !p_native
	BEQ .generic
	LDA !p_kind
	CMP.b #!GOKU_K_IDLE
	BEQ .generic
	CMP.b #!GOKU_K_WALK
	BEQ .generic
	CMP.b #!GOKU_K_RUN
	BEQ .generic
	CMP.b #!GOKU_K_GUARD
	BEQ .generic
	JMP pose_native
.generic
	LDA !p_kind
	BMI .default             ; native key kind without its table entry
	CMP.b #$30
	BCS .default
	REP #$30
	AND.w #$00FF
	ASL
	TAX
	JMP (pose_kind_table,X)
.default
	LDA.b #!GOKU_CLIP_IDLE
	JMP pose_track

pose_kind_table:
	dw pk_idle, pk_walk, pk_run, pk_push, pk_guard, pk_fall, pk_recover, pk_celebrate
	dw pk_jump, pk_swordpull, pk_dead, pk_sleep, pk_hurt, pk_idle, pk_idle, pk_idle
	dw pk_punch, pk_charge, pk_beam, pk_blast, pk_teleport, pk_transform, pk_revert, pk_ready
	dw pk_focus, pk_airbeam, pk_idle, pk_idle, pk_idle, pk_idle, pk_idle, pk_idle
	dw pk_deflect, pk_resist, pk_hover, pk_gapflight, pk_rescuedive, pk_ceiling, pk_takeoff, pk_landing
	dw pk_run, pk_idle, pk_idle, pk_idle, pk_idle, pk_idle, pk_idle, pk_idle

pk_idle:
	; blink for 5 frames every 180 (not facing up)
	SEP #$20
	LDA !p_row
	CMP.b #3
	BEQ .plain
	REP #$30
	LDA !p_age
	LDX.w #180
	JSR goku_div16
	CPX.w #150
	BCC .plain
	CPX.w #155
	BCS .plain
	STZ !t_age
	SEP #$20
	LDA.b #!GOKU_CLIP_BLINK
	JMP pose_track
.plain
	SEP #$20
	LDA.b #!GOKU_CLIP_IDLE
	JMP pose_track
pk_walk:
	SEP #$20
	LDA !st_step4
	AND.b #$03
	CLC
	ADC.b #2
	JMP pose_form_col
pk_run:
	SEP #$20
	LDA !st_step4
	AND.b #$03
	CLC
	ADC.b #6
	JMP pose_form_col
pk_push:
	SEP #$20
	LDA.b #!GOKU_CLIP_NUDGE
	JSR pose_track           ; p_var = $80|nudge beat
	JSR pose_moving_recent_dist
	BCC .still
	SEP #$20
	LDA !st_step4            ; moving: the beat follows the footfalls
	AND.b #$03
	ORA.b #$80
	STA !p_var
.still
	SEP #$20
	LDA !p_row
	STA !p_rowout
	REP #$30
	RTS
pk_guard:
	SEP #$20
	LDA.b #!GOKU_CLIP_GUARD
	JMP pose_track
pk_celebrate:
	SEP #$20
	LDA.b #!GOKU_CLIP_CELEBRATE
	JMP pose_track
pk_swordpull:
	SEP #$20
	LDA.b #!GOKU_CLIP_SWORD_PULL
	JMP pose_track
pk_jump:
	SEP #$20
	LDA.b #!GOKU_CLIP_JUMP
	JMP pose_track
pk_fall:
	; A0/AE airborne flail: lifted-knee cell, rising cell on frames 62/66
	REP #$20
	LDA $E026
	CMP.w #62
	BEQ .up
	CMP.w #66
	BEQ .up
	SEP #$20
	LDA.b #38
	LDY.w #34
	JSR pose_by_form
	JMP pose_form_col
.up
	SEP #$20
	LDA.b #39
	LDY.w #35
	JSR pose_by_form
	JMP pose_form_col
pk_recover:
	; A2 falls, bounces, rests and gets up; 8F starts at the resting phase.
	JSR pose_side_row        ; t_row = side row (M16)
	LDA $E026
	CMP.w #58
	BEQ .low
	CMP.w #276
	BCC .not_low
	CMP.w #283
	BCC .low
.not_low
	CMP.w #110
	BEQ .r2
	CMP.w #112
	BEQ .r3
	CMP.w #274
	BEQ .r2
	CMP.w #134
	BEQ .r1
	CMP.w #132
	BEQ .r1
	CMP.w #130
	BEQ .r0
	STZ !t_age
	SEP #$20
	LDA !p_row
	STA !t_row
	LDA.b #!GOKU_CLIP_HURT
	JMP pose_track
.low
	SEP #$20
	LDA.b #33
	LDY.w #29
	JSR pose_by_form
	JMP pose_form_col
.r0
	LDA.w #0
	BRA .side
.r1
	LDA.w #1
	BRA .side
.r2
	LDA.w #2
	BRA .side
.r3
	LDA.w #3
.side
	SEP #$20
	STA !t_a
	LDA.b #48
	LDY.w #40
	JSR pose_by_form
	CLC
	ADC !t_a
	STA !p_col
	LDA !goku_form
	AND.b #$01
	STA !p_sheet
	LDA !t_row
	STA !p_rowout
	REP #$30
	RTS
pk_dead:
	JSR pose_side_row
	SEP #$20
	LDA.b #!GOKU_CLIP_DEAD
	JMP pose_track
pk_sleep:
	JSR pose_side_row
	SEP #$20
	LDA.b #!GOKU_CLIP_SLEEP
	JMP pose_track
pk_hurt:
	SEP #$20
	LDA $E045
	BEQ .ground
	LDA.b #33
	LDY.w #29
	JSR pose_by_form
	JMP pose_form_col
.ground
	LDA.b #!GOKU_CLIP_HURT
	JMP pose_track
pk_charge:
	REP #$20
	LDA !goku_act_age
	STA !t_age
	SEP #$20
	LDA.b #!GOKU_CLIP_CHARGE
	JMP pose_track
pk_ready:
	REP #$20
	LDA !goku_act_age
	CMP.w #5
	BCC .age
	LDA.w #5
.age
	STA !t_age
	SEP #$20
	LDA.b #!GOKU_CLIP_CHARGE_WINDUP
	JMP pose_track
pk_focus:
	REP #$20
	STZ !t_age
	SEP #$20
	LDA.b #!GOKU_CLIP_GUARD
	JMP pose_track
pk_deflect:
	REP #$20
	STZ !t_age
	SEP #$20
	LDA !goku_mode_facing
	JSR pose_row_of
	STA !t_row
	LDA.b #!GOKU_CLIP_GUARD
	JMP pose_track
pk_resist:
	REP #$20
	STZ !t_age
	SEP #$20
	LDA.b #!GOKU_CLIP_BRACE
	JMP pose_track
pk_punch:
	; base: columns 10/14/18 (combo 0-2), phase age <2,<4,<7
	; SSJ:  lead jab on the jab sheet (combo 0), 10/14; phase age <1,<2,<4
	SEP #$20
	LDA !goku_act_facing
	JSR pose_row_of
	STA !p_rowout
	LDA !goku_form
	AND.b #$01
	STA !p_sheet
	LDA !goku_act_arg
	AND.b #$03
	STA !t_a                 ; combo
	REP #$20
	LDA !goku_act_age
	LDX.w #0
	BIT !goku_act_arg-1      ; N = bit 7 of goku_act_arg (high byte)
	BMI .super
	CMP.w #2
	BCC .phase
	INX
	CMP.w #4
	BCC .phase
	INX
	CMP.w #7
	BCC .phase
	INX
.phase
	STX !t_c
	SEP #$20
	LDA !t_a
	ASL
	ASL
	CLC
	ADC.b #10                ; 10 + combo*4
	BRA .col
.super
	CMP.w #1
	BCC .sphase
	INX
	CMP.w #2
	BCC .sphase
	INX
	CMP.w #4
	BCC .sphase
	INX
.sphase
	STX !t_c
	SEP #$20
	LDA !t_a
	BNE .scombo
	LDA.b #!SHEET_JAB
	STA !p_sheet
	LDA.b #0
	BRA .col
.scombo
	ASL
	ASL
	CLC
	ADC.b #6                 ; combo 1 -> 10, combo 2 -> 14
.col
	CLC
	ADC !t_c
	STA !p_col
	REP #$30
	RTS
pk_beam:
	; (super?18:22) + (age<2 ? 1 : age<duration-4 ? 2 : 3)
	SEP #$20
	LDA !goku_act_facing
	JSR pose_row_of
	STA !p_rowout
	LDA !goku_form
	AND.b #$01
	STA !p_sheet
	REP #$20
	LDA !goku_act_dur
	AND.w #$00FF
	SEC
	SBC.w #4
	STA !t_b                 ; duration-4 (signed)
	LDX.w #1
	LDA !goku_act_age
	CMP.w #2
	BCC .off
	INX
	LDA !t_b
	BMI .three
	LDA !goku_act_age
	CMP !t_b
	BCC .off
.three
	LDX.w #3
.off
	STX !t_a
	SEP #$20
	LDA.b #22
	LDY.w #18
	BIT !goku_act_arg
	BPL .base
	TYA
.base
	CLC
	ADC !t_a
	STA !p_col
	REP #$30
	RTS
pk_airbeam:
	SEP #$20
	LDA.b #3
	STA !p_rowout
	LDA !goku_form
	AND.b #$01
	STA !p_sheet
	LDA.b #24
	LDY.w #20
	JSR pose_by_form
	STA !p_col
	REP #$30
	RTS
pk_blast:
	; phase = floor(age/(super?1:2)); col = (super?24:28) + (0 | 1+hand | 3)
	SEP #$20
	LDA !goku_act_facing
	JSR pose_row_of
	STA !p_rowout
	LDA !goku_form
	AND.b #$01
	STA !p_sheet
	REP #$20
	LDA !goku_act_age
	BIT !goku_act_arg-1
	BMI .full
	LSR
.full
	TAX
	SEP #$20
	LDA.b #0
	CPX.w #0
	BEQ .phase
	LDA.b #3
	CPX.w #4
	BCS .phase
	LDA !goku_act_arg
	AND.b #$01
	INC
.phase
	STA !t_a
	LDA.b #28
	BIT !goku_act_arg
	BPL .base
	LDA.b #24
.base
	CLC
	ADC !t_a
	STA !p_col
	REP #$30
	RTS
pk_teleport:
	; streak cells around a fully absent frame (age 4 and 5 hidden)
	SEP #$20
	LDA !goku_act_facing
	JSR pose_row_of
	STA !p_rowout
	LDA !goku_form
	AND.b #$01
	STA !p_sheet
	REP #$20
	LDA !goku_act_age
	CMP.w #4
	BCC .visible
	CMP.w #6
	BCS .visible
	SEP #$20
	LDA.b #!GOKU_PF_HIDDEN
	TSB !p_flags
	REP #$20
	LDA !goku_act_age
.visible
	; t<2 || t>=9: guard cell; t==2,7,8: first streak; else second streak
	CMP.w #2
	BCC .settle
	CMP.w #9
	BCS .settle
	CMP.w #2
	BEQ .streak
	CMP.w #7
	BCS .streak
	SEP #$20
	LDA.b #27
	LDY.w #23
	BRA .set
.streak
	SEP #$20
	LDA.b #26
	LDY.w #22
	BRA .set
.settle
	SEP #$20
	LDA.b #25
	LDY.w #21
.set
	BIT !goku_act_arg
	BPL .base
	TYA
.base
	STA !p_col
	REP #$30
	RTS
pk_transform:
	SEP #$20
	LDA.b #!GOKU_CLIP_TRANSFORM
	BRA pk_formchange
pk_revert:
	SEP #$20
	LDA.b #!GOKU_CLIP_REVERT
pk_formchange:
	; track(kind, floor(age*clipTotal/actionDuration), row 0)
	STA !t_clip
	REP #$30
	AND.w #$00FF
	STA !t_c
	LDA !goku_form
	AND.w #$0001
	BEQ .base
	LDA.w #!GOKU_CLIP_COUNT
.base
	CLC
	ADC !t_c
	ASL
	TAX
	LDA.l goku_clip_ptr,X
	TAX
	LDA.l goku_clip_data+2,X
	STA !t_c                 ; clip total ticks
	; age * total (shift-add)
	LDA !goku_act_age
	STA !t_d
	LDA.w #$0000
	LDX.w #16
.mul
	ASL
	ASL !t_d
	BCC .mul_next
	CLC
	ADC !t_c
.mul_next
	DEX
	BNE .mul
	PHA
	LDA !goku_act_dur
	AND.w #$00FF
	BNE .dur
	LDA.w #1
.dur
	TAX
	PLA
	JSR goku_div16
	STA !t_age
	SEP #$20
	STZ !t_row
	LDA !t_clip
	JMP pose_track
pk_hover:
	; settled hover uses the upright knee cell; drifting flight cycles
	SEP #$20
	LDA !goku_ctl
	AND.b #!GOKU_CTL_LOCALFLY
	BEQ .knee
	REP #$20
	LDA !goku_lift
	CMP.w #12
	BCC .knee
	LDA !st_stat
	CMP.w #3
	BCS .knee
	SEP #$20
	LDA.b #!GOKU_CLIP_FLIGHT
	JMP pose_track
.knee
	SEP #$20
	LDA.b #38
	LDY.w #34
	JSR pose_by_form
	JMP pose_form_col
pk_gapflight:
	SEP #$20
	LDA.b #!GOKU_CLIP_FLIGHT
	JSR pose_track
	; cancel the native crossing's arc for a steady twelve-pixel hover
	REP #$20
	LDA $E045
	AND.w #$00FF
	EOR.w #$FFFF
	SEC
	ADC.w #12
	STA !p_lift
	RTS
pk_rescuedive:
	SEP #$20
	LDA.b #!GOKU_CLIP_FLIGHT
	JMP pose_track
pk_ceiling:
	; upward punch into the roof, then the rising hover pose
	SEP #$20
	LDA.b #3
	STA !p_rowout
	LDA !goku_form
	AND.b #$01
	STA !p_sheet
	REP #$20
	LDA !goku_mode_age
	CMP.w #18
	BCS .rise
	; column (ssj?14:18) + min(3, age/5); lift age/3
	LDX.w #5
	JSR goku_div16
	CMP.w #3
	BCC .cap
	LDA.w #3
.cap
	STA !t_a
	SEP #$20
	LDA.b #18
	LDY.w #14
	JSR pose_by_form
	CLC
	ADC !t_a
	STA !p_col
	REP #$20
	LDA !goku_mode_age
	LDX.w #3
	JSR goku_div16
	STA !p_lift
	RTS
.rise
	; lift min(220, (age-18)*6+6)
	SEC
	SBC.w #18
	CMP.w #36
	BCC .rise_ok
	LDA.w #36
.rise_ok
	STA !t_a
	ASL
	CLC
	ADC !t_a
	ASL                      ; *6
	CLC
	ADC.w #6
	CMP.w #220
	BCC .rise_lift
	LDA.w #220
.rise_lift
	STA !p_lift
	SEP #$20
	LDA.b #38
	LDY.w #34
	JSR pose_by_form
	STA !p_col
	REP #$30
	RTS
pk_takeoff:
	SEP #$20
	LDA.b #3
	STA !p_rowout
	LDA !goku_form
	AND.b #$01
	STA !p_sheet
	REP #$20
	LDA !goku_mode_age
	CMP.w #64
	BCC .t
	LDA.w #63
.t
	TAX
	LDA.l goku_takeoff_lift,X
	AND.w #$00FF
	STA !p_lift
	SEP #$20
	CPX.w #4
	BCC .crouch
	LDA.b #38
	LDY.w #34
	JSR pose_by_form
	STA !p_col
	REP #$30
	RTS
.crouch
	LDA.b #37
	LDY.w #33
	JSR pose_by_form
	STA !p_col
	REP #$30
	RTS
pk_landing:
	SEP #$20
	LDA !p_row
	STA !p_rowout
	LDA !goku_form
	AND.b #$01
	STA !p_sheet
	REP #$20
	LDA !goku_mode_age
	CMP.w #64
	BCC .t
	LDA.w #63
.t
	TAX
	LDA.l goku_landing_lift,X
	AND.w #$00FF
	STA !t_a
	LDA $E045
	AND.w #$00FF
	EOR.w #$FFFF
	SEC
	ADC !t_a
	STA !p_lift              ; ceil(72*(1-t/24)^2) - native lift
	SEP #$20
	CPX.w #24
	BCS .not_knee
	LDA.b #38
	LDY.w #34
	BRA .col
.not_knee
	CPX.w #29
	BCS .stand
	LDA.b #37
	LDY.w #33
	BRA .col
.stand
	LDA.b #0
	LDY.w #0
.col
	JSR pose_by_form
	STA !p_col
	REP #$30
	RTS

; ---------------------------------------------------------------------------
; nativePose(entry, sheet, row, frame, age) for the validated native action.
; Entry layout (snes/gen/goku.mjs): +0 mode, +1 clip, +2 run, +3 side-row clip,
; +4 kind, +5/+7/+9 sequence pointers, +11 fixed flag, [+12 row mode,
; base count, columns, ssj count, columns], phase count, phases:
; [frame count, frames (words), base row mode, count, columns, ssj row mode,
; count, columns].
pose_native:
	REP #$30
	LDA !t_ptr
	CLC
	ADC.w #12
	STA !t_b                 ; fixed block (row mode) when present
	TAX
	LDA.l goku_action_data-1,X ; fixed flag at +11
	AND.w #$00FF
	STA !t_a
	BEQ .phases
	INX                      ; base count
	LDA.l goku_action_data,X
	AND.w #$00FF
	STA !t_c
	TXA
	SEC
	ADC !t_c
	TAX                      ; ssj count
	LDA.l goku_action_data,X
	AND.w #$00FF
	STA !t_c
	TXA
	SEC
	ADC !t_c
	TAX                      ; phase count
.phases
	LDA.l goku_action_data,X
	AND.w #$00FF
	STA !t_c
	INX
.phase
	LDA !t_c
	BNE .scan
	JMP .nophase
.scan
	LDA.l goku_action_data,X ; frame count
	AND.w #$00FF
	STA !t_d
	INX
	LDY.w #$0000             ; Y = matched
.frames
	LDA !t_d
	BEQ .src
	LDA.l goku_action_data,X
	CMP $E026
	BNE .frame_next
	LDY.w #$0001
.frame_next
	INX
	INX
	DEC !t_d
	BRA .frames
.src
	CPY.w #$0000
	BNE .match
	JSR .skipsrc
	JSR .skipsrc
	DEC !t_c
	BRA .phase
.match
	LDA !goku_form
	AND.w #$0001
	BEQ .match_form
	JSR .skipsrc
.match_form
	; column index min(n-1, age/6)
	PHX
	LDA !p_age
	LDX.w #6
	JSR goku_div16
	PLX
	STA !t_d
	TXY                      ; Y -> row mode
	INX                      ; X -> count
	JMP .pick
.skipsrc
	INX                      ; X -> count
	LDA.l goku_action_data,X
	AND.w #$00FF
	STA !t_d
	TXA
	SEC
	ADC !t_d
	TAX                      ; next row mode
	RTS
.nophase
	LDA !t_a
	BEQ .clip
	; fixed: shared row mode, per-form count + columns; index min(n-1, age/8)
	LDA !p_age
	LSR
	LSR
	LSR
	STA !t_d
	LDY !t_b                 ; Y -> row mode
	LDX !t_b
	INX                      ; X -> base count
	LDA !goku_form
	AND.w #$0001
	BEQ .pick
	LDA.l goku_action_data,X
	AND.w #$00FF
	STA !t_c
	TXA
	SEC
	ADC !t_c
	TAX                      ; X -> ssj count
.pick
	; Y -> row mode byte, X -> count byte, then columns; t_d = wanted index
	LDA.l goku_action_data,X
	AND.w #$00FF
	DEC
	CMP !t_d
	BCC .cap
	LDA !t_d
.cap
	STA !t_d
	TXA
	SEC
	ADC !t_d
	TAX
	SEP #$20
	LDA.l goku_action_data,X
	STA !p_col
	TYX
	LDA.l goku_action_data,X
	JSR pose_row_mode
	STA !p_rowout
	LDA !goku_form
	AND.b #$01
	STA !p_sheet
	REP #$30
	RTS
.clip
	LDX !t_ptr
	SEP #$20
	LDA.l goku_action_data+3,X ; fall/sleep/dead clips use the side rows
	BEQ .track
	JSR pose_side_row
	SEP #$20
.track
	LDX !t_ptr
	LDA.l goku_action_data+1,X ; clip
	JMP pose_track

; ---------------------------------------------------------------------------
; Post-processing: Super Saiyan knockdown fix-ups, shuffled/hover legs, lift.
pose_post:
	SEP #$20
	; SSJ side rows 1/2, columns 42/43 lose their gold hair: low brace (33)
	LDA !p_sheet
	CMP.b #!SHEET_SSJ
	BNE .blink
	LDA !p_rowout
	CMP.b #1
	BEQ .ssj_side
	CMP.b #2
	BNE .blink
.ssj_side
	LDA !p_col
	CMP.b #42
	BEQ .ssj_fix
	CMP.b #43
	BNE .blink
.ssj_fix
	LDA.b #33
	STA !p_col
.blink
	; the up-facing blink cell is empty
	LDA !p_rowout
	CMP.b #3
	BNE .legs_check
	LDA !p_col
	CMP.b #1
	BNE .legs_check
	LDA !p_sheet
	CMP.b #!SHEET_JAB
	BEQ .legs_check
	STZ !p_col
.legs_check
	; shuffled / hover legs for charge, ready, focus, transform, revert
	LDA !p_var
	BMI .lift
	LDA !p_kind
	JSR pose_is_shuffle
	BCC .lift
	LDA !goku_ctl
	AND.b #!GOKU_CTL_LOCALFLY
	BNE .legs
	LDA !goku_lift
	ORA !goku_lift+1
	BNE .legs
	LDA !goku_mode
	CMP.b #!GOKU_K_GAPFLIGHT
	BEQ .legs
	JSR pose_moving_recent_dist
	SEP #$20
	BCC .lift
	LDA !st_step2
	AND.b #$01
	BEQ .lift
	LDA.b #1
	STA !p_var
	BRA .lift
.legs
	LDA.b #2
	STA !p_var
.lift
	REP #$30
	LDA !p_lift
	CLC
	ADC !goku_lift
	STA !p_lift
	RTS

; ---------------------------------------------------------------------------
; Cell id from p_sheet/p_col/p_rowout/p_var -> p_cell.
pose_cell_lookup:
	SEP #$20
	LDA !p_var
	BPL .indexed
	; push cell: form*16 + row*4 + beat
	AND.b #$03
	STA !t_a
	LDA !p_rowout
	AND.b #$03
	ASL
	ASL
	ORA !t_a
	STA !t_a
	LDA !goku_form
	AND.b #$01
	BEQ .push_base
	LDA.b #16
.push_base
	CLC
	ADC !t_a
	REP #$30
	AND.w #$00FF
	ASL
	TAX
	LDA.l goku_push_cells,X
	CMP.w #!GOKU_NONE
	BNE .done
	BRA .fallback
.indexed
	REP #$30
	LDA !p_sheet
	AND.w #$0003
	ASL
	TAX
	LDA.l goku_sheet_base,X
	STA !t_a
	LDA !p_col
	AND.w #$00FF
	ASL
	ASL
	CLC
	ADC !t_a
	STA !t_a
	LDA !p_rowout
	AND.w #$0003
	CLC
	ADC !t_a
	ASL
	TAX
	LDA !p_var
	AND.w #$00FF
	BEQ .plain
	CMP.w #1
	BNE .legs
	LDA.l goku_shuffle_index,X
	CMP.w #!GOKU_NONE
	BNE .done
	BRA .plain
.legs
	LDA.l goku_legs_index,X
	CMP.w #!GOKU_NONE
	BNE .done
.plain
	LDA.l goku_cell_index,X
	CMP.w #!GOKU_NONE
	BNE .done
.fallback
	; never show an empty cell: the form's idle cell for the row
	LDA !goku_form
	AND.w #$0001
	BEQ .fb_base
	LDA.w #63*4
.fb_base
	STA !t_a
	LDA !p_rowout
	AND.w #$0003
	CLC
	ADC !t_a
	ASL
	TAX
	LDA.l goku_cell_index,X
.done
	STA !p_cell
	RTS
