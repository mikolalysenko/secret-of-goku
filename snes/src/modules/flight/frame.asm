; Per-frame flight state (engine/mana-mod.js beforeFrame/afterFrame and
; native-local-flight.js settle()). flight_frame runs in modules_field_frame
; before goku_frame, at the end of native frame N: it finishes frame N
; (afterFrame: event/menu cancel, keep hovering off a narrow shore, settle)
; and prepares frame N+1 (beforeFrame: lift, the flight decision, the A
; mask, Goku's pose requests and the work the movement hooks may do).

; Field controllability (mana-mod.js canAttack, native part). Carry.
fl_can_attack:
	LDA.w !fl_lock
	BNE .no
	SEP #$20
	LDA.w !fl_state
	AND.b #!FLS_ON               ; Goku in play, field vectors (this frame)
	BEQ .no8
	LDA $E4
	CMP.b #$01
	BNE .no8
	LDA $E5
	CMP.b #$01
	BNE .no8
	LDA $E000
	AND.b #$01
	BEQ .no8
	LDA $E02C
	AND.b #$01
	BEQ .no8
	LDA $EC
	AND.b #$FE
	BNE .no8
	LDA $ED
	AND.b #$40
	BNE .no8
	LDA $D0
	BNE .no8
	LDA $E190
	AND.b #$70
	BNE .no8
	LDA $E191
	AND.b #$D5
	BNE .no8
	LDA $E011                    ; native hurt poses 8C-8F
	CMP.b #$8C
	BCC .ok
	CMP.b #$90
	BCC .no8
.ok
	REP #$20
	SEC
	RTS
.no8
	REP #$20
.no
	CLC
	RTS

; nativeField: the field NMI/IRQ vectors are installed ($0100 = JML $00C0A8,
; $0104 = JML $00C1CF).
fl_native_field:
	LDA $0100
	CMP.w #$A85C
	BNE .no
	LDA $0102
	CMP.w #$00C0
	BNE .no
	LDA $0104
	CMP.w #$CF5C
	BNE .no
	LDA $0106
	CMP.w #$00C1
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; ground() of native-local-flight.js: field vectors, no event, no menu, no
; load. Carry.
fl_ground:
	SEP #$20
	LDA.w !fl_state
	AND.b #!FLS_ON
	BEQ .no8
	LDA $D0
	BNE .no8
	LDA $EC
	AND.b #$FE
	BNE .no8
	LDA $ED
	AND.b #$40
	BNE .no8
	LDA $FF
	BNE .no8
	REP #$20
	SEC
	RTS
.no8
	REP #$20
.no
	CLC
	RTS

; eligible(): active (Goku flies or charges, can act) and the hero is free
; to move (no hurt pose, status, attack or knock-back). Carry. Live: the
; movement hooks call it at the instruction they hook, as the browser does.
fl_eligible:
	LDA.w !fl_lock
	BNE .no
	SEP #$20
	LDA.w !fl_state
	BIT.b #!FLS_ON               ; Goku in play, native field (this frame)
	BEQ .no8
	AND.b #!FLS_FLY|!FLS_CHARGE
	BEQ .no8
	LDA $E4
	CMP.b #$01
	BNE .no8
	LDA $E5
	CMP.b #$01
	BNE .no8
	LDA $E000
	AND $E02C
	AND.b #$01
	BEQ .no8
	LDA $EC
	AND.b #$FE
	ORA $D0
	ORA $FF
	BNE .no8
	LDA $ED
	AND.b #$40
	BNE .no8
	LDA $E190
	AND.b #$70
	BNE .no8
	LDA $E191
	AND.b #$D7
	BNE .no8
	LDA $E011                    ; native hurt poses 8C-8F
	CMP.b #$8C
	BCC +
	CMP.b #$90
	BCC .no8
+	LDA $E01C
	ORA $E060
	ORA $E00A
	ORA $E008
	BNE .no8
	REP #$20
	SEC
	RTS
.no8
	REP #$20
.no
	CLC
	RTS

; phasing() && eligible()
fl_phasing:
	LDA.w !fl_state
	AND.w #!FLS_FLY
	BEQ .no
	JMP fl_eligible
.no
	CLC
	RTS

; Hero position into the query (current layer and terrain).
fl_q_hero:
	LDA $E002
	STA.w !fl_q_x
	LDA $E004
	STA.w !fl_q_y
	LDA $E00B
	AND.w #$0080
	BEQ +
	LDA.w #$0001
+	STA.w !fl_q_l
	LDA $E00B
	AND.w #$0003
	STA.w !fl_q_t
	RTS

; canLand / canFly at the hero's position, layer and terrain, memoised
; while those stay the same (the frame logic asks several times).
fl_hero_land:
	JSR fl_q_hero
	; the same position, layer and terrain as the last call this frame
	LDA.l !fl_hm_land
	CMP $E002
	BNE .calc
	LDA.l !fl_hm_land+2
	CMP $E004
	BNE .calc
	LDA $E00B
	AND.w #$00FF
	CMP.l !fl_hm_land+4
	BNE .calc
	LDA.l !fl_hm_land+6
	LSR
	RTS
.calc
	JSR fl_hland_calc
	LDA.w #$0000
	ROL
	STA.l !fl_hm_land+6
	LDA $E002
	STA.l !fl_hm_land
	LDA $E004
	STA.l !fl_hm_land+2
	LDA $E00B
	AND.w #$00FF
	STA.l !fl_hm_land+4
	LDA.l !fl_hm_land+6
	LSR
	RTS
fl_hland_calc:
	if defined("FLIGHT_MISSING_FLOOR")
		JMP fl_can_land
	endif
	; bounds, then the tiles of the footprint's rectangle: the verdict of the
	; last rectangle tested here is kept while its tiles, layer and terrain
	; are unchanged
	JSR fl_fp_bounds
	BCS +
	RTS
+	JSR fl_fp_rect
	LDA.w !fl_q_t
	ASL
	ORA.w !fl_q_l
	STA.w !fl_t6                 ; layer | terrain << 1
	SEP #$20
	LDA.w !fl_t0
	CMP.l !fl_hl
	BNE .eval8
	LDA.w !fl_t1
	CMP.l !fl_hl+1
	BNE .eval8
	LDA.w !fl_t2
	CMP.l !fl_hl+2
	BNE .eval8
	LDA.w !fl_t3
	CMP.l !fl_hl+3
	BNE .eval8
	LDA.w !fl_t6
	CMP.l !fl_hl+4
	BNE .eval8
	REP #$20
	; the corner tiles still hold the ids recorded with the verdict?
	LDA.l !fl_hl+6
	TAX
	LDA.l $7F0000,X
	EOR.l !fl_hl+14
	AND.w #$00FF
	BNE .eval
	LDA.l !fl_hl+8
	TAX
	LDA.l $7F0000,X
	EOR.l !fl_hl+15
	AND.w #$00FF
	BNE .eval
	LDA.l !fl_hl+10
	TAX
	LDA.l $7F0000,X
	EOR.l !fl_hl+16
	AND.w #$00FF
	BNE .eval
	LDA.l !fl_hl+12
	TAX
	LDA.l $7F0000,X
	EOR.l !fl_hl+17
	AND.w #$00FF
	BNE .eval
	LDA.l !fl_hl+5
	LSR
	RTS
.eval8
	REP #$20
.eval
	; record the rectangle, key and corner cells first (fl_fp_tiles uses
	; the scratch), then evaluate and record the verdict
	SEP #$20
	LDA.w !fl_t0
	STA.l !fl_hl
	LDA.w !fl_t1
	STA.l !fl_hl+1
	LDA.w !fl_t2
	STA.l !fl_hl+2
	LDA.w !fl_t3
	STA.l !fl_hl+3
	LDA.w !fl_t6
	STA.l !fl_hl+4
	REP #$20
	; corner cells (c0,r0) (c1,r0) (c0,r1) (c1,r1) and their tiles
	LDA.w !fl_q_l
	BEQ +
	LDA.w #$4000
+	STA.w !fl_t5
	LDA.w !fl_t2
	XBA
	LSR
	ORA.w !fl_t5
	PHA                          ; row r0 base
	ORA.w !fl_t0
	STA.l !fl_hl+6
	TAX
	LDA.l $7F0000,X
	SEP #$20
	STA.l !fl_hl+14
	REP #$20
	LDA $01,S
	ORA.w !fl_t1
	STA.l !fl_hl+8
	TAX
	LDA.l $7F0000,X
	SEP #$20
	STA.l !fl_hl+15
	REP #$20
	PLA
	LDA.w !fl_t3
	XBA
	LSR
	ORA.w !fl_t5
	PHA                          ; row r1 base
	ORA.w !fl_t0
	STA.l !fl_hl+10
	TAX
	LDA.l $7F0000,X
	SEP #$20
	STA.l !fl_hl+16
	REP #$20
	PLA
	ORA.w !fl_t1
	STA.l !fl_hl+12
	TAX
	LDA.l $7F0000,X
	SEP #$20
	STA.l !fl_hl+17
	REP #$20
	LDA.w #$0000
	JSR fl_fp_tiles
	LDA.w #$0000
	ROL
	SEP #$20
	STA.l !fl_hl+5
	REP #$20
	LSR
	RTS

fl_hero_fly:
	JSR fl_q_hero
	LDA.l !fl_hm_fly
	CMP $E002
	BNE .eval
	LDA.l !fl_hm_fly+2
	CMP $E004
	BNE .eval
	LDA $E00B
	AND.w #$00FF
	CMP.l !fl_hm_fly+4
	BNE .eval
	LDA.l !fl_hm_fly+6
	LSR
	RTS
.eval
	JSR fl_can_fly
	LDA.w #$0000
	ROL
	STA.l !fl_hm_fly+6
	LDA $E002
	STA.l !fl_hm_fly
	LDA $E004
	STA.l !fl_hm_fly+2
	LDA $E00B
	AND.w #$00FF
	STA.l !fl_hm_fly+4
	LDA.l !fl_hm_fly+6
	LSR
	RTS
fl_hero_memo_off:
	LDA.w #$FFFF
	STA.l !fl_hm_land+4
	STA.l !fl_hm_fly+4
	RTS

; ---------------------------------------------------------------------------
flight_frame:
	LDA.w !fl_magic
	CMP.w #!FL_MAGIC
	BEQ +
	JSR fl_init_work
+
	if defined("FLIGHT_TEST")
		JSR fl_test_poll
	endif
	INC.w !fl_counter
	STZ.w !fl_events
	LDA.w #$FFFF
	STA.l !fl_hm_land+4          ; hero canFly/canLand memos and the last sweep
	STA.l !fl_hm_fly+4
	STA.l !fl_sw_last+8
	; Native field with Goku in play?
	SEP #$20
	LDA.w !fl_state
	AND.b #~(!FLS_ON|!FLS_CAN)
	STA.w !fl_state
	REP #$20
	LDA.l !persist_goku_active
	AND.w #$00FF
	BEQ .off
	JSR fl_native_field
	BCS .on
.off
	JSR fl_reset
	JMP .publish
.on
	SEP #$20
	LDA.b #!FLS_ON
	TSB.w !fl_state
	REP #$20
	; a new map cancels flight (mana-mod lastMap)
	LDA $DC
	CMP.w !fl_lastmap
	BEQ +
	STA.w !fl_lastmap
	JSR fl_land_now
	JSR fl_anchor_none
	JSR fl_crossing_none
	LDA.w #$0000
	STA.l !fl_tp_act
	LDA.w #$FFFF
	STA.l !fl_tp_last
+	JSR fl_read_pad
	JSR fl_can_attack
	BCS .can
	; not controllable: the next controllable frame reloads the context
	LDA.w #$FFFF
	STA.w !fl_map
	JSR fl_grid_off
	BRA .after
.can
	SEP #$20
	LDA.b #!FLS_CAN
	TSB.w !fl_state
	REP #$20
	JSR fl_ctx_update
	LDA.w #$0001
	STA.l !fl_g_stale            ; re-anchor the grid at Goku when first used
.after
	; --- afterFrame (frame N) ---
	LDA.w !fl_state
	AND.w #!FLS_CAN
	BNE .canafter
	JSR fl_event_or_menu         ; (canAttack implies no event or menu)
	BCC .settle
	JSR fl_land_now
	BRA .settle
.canafter
	; native sampling can finish one step after release: keep hovering when
	; that step carried the feet off a narrow shore
	LDA.w !fl_lift
	AND.w #$00FF
	BEQ .settle
	JSR fl_hero_land
	BCS .settle
	JSR fl_hero_fly
	BCC .settle
	SEP #$20
	LDA.b #!FLS_FLY
	TSB.w !fl_state
	REP #$20
.settle
	JSR fl_settle
	; --- beforeFrame (frame N+1) ---
	LDA.w !fl_gap
	BEQ +
	JSR fl_gap_tick              ; a whip crossing ends with its event
+	JSR fl_lift_update
	; a teleport's camera follow locks the pad; a new L+B queues the next
	LDA.w !fl_hook
	AND.w #!FLH_CAMERA
	BEQ .nocam
	LDA.l !fl_tp_act
	BEQ .camadv
	JSR fl_tp_chord_edge
	BCC .camadv
	LDA.w #$0001
	STA.l !fl_tp_queued
.camadv
	LDA.l !fl_tp_act
	BEQ +
	JSR fl_tp_advance            ; held at age 4 until the camera arrives
+	LDA.w !core_pad_mask&$FFFF
	ORA.w #$FFF0
	STA.w !core_pad_mask&$FFFF
	BRA .publish
.nocam
	LDA.w !fl_state
	AND.w #!FLS_CAN
	BNE .decide
	; native menus, events and locks own the input (cancelCombat)
	LDA.w #$0000
	STA.l !fl_tp_act
	JSR fl_event_or_menu
	BCC .publish
	JSR fl_land_now
	BRA .publish
.decide
	JSR fl_tp_chord_edge         ; L+B pressed: Instant Transmission
	BCC +
	JSR fl_tp_start
+	JSR fl_decide
	JSR fl_tp_frame
.publish
	JSR fl_publish
	SEP #$20
	LDA.b #$00
	STA.l !fl_tp_custom          ; scene modules re-post a custom target each frame
	REP #$20
	RTL

; First frame since title entry (or a foreign savestate): the SRAM work
; area holds whatever the battery kept.
fl_init_work:
	LDA.w #!FL_MAGIC
	STA.w !fl_magic
	LDA.w #$FFFF
	STA.w !fl_map
	STA.w !fl_lastmap
	STA.l !fl_cam_map
	STA.l !fl_tp_last
	STA.l !fl_step_f4
	STZ.w !fl_hook
	STZ.w !fl_gap
	LDA.w #$0000
	STA.l !fl_tp_act
	STA.l !fl_tp_queued
	STA.l !fl_tp_custom
	JSR fl_anchor_none
	JSR fl_crossing_none
	JSR fl_cache_clear
	JSR fl_grid_off
	JSR fl_sweep_forget
	RTS

; Carry = the teleport chord L+B is held now and was not held last frame.
fl_tp_chord_edge:
	LDA.w !fl_pad
	AND.w #!PAD_L|!PAD_B
	CMP.w #!PAD_L|!PAD_B
	BNE .no
	LDA.w !fl_pad_prev
	AND.w #!PAD_L|!PAD_B
	CMP.w #!PAD_L|!PAD_B
	BEQ .no
	SEC
	RTS
.no
	CLC
	RTS

; The teleport action's frame: advance it, keep Goku facing its way and
; hold the pad's directions and A.
fl_tp_frame:
	LDA.l !fl_tp_act
	BEQ .done
	JSR fl_tp_advance
	LDA.l !fl_tp_act
	BEQ .done
	LDA.l !fl_tp_facing
	TAX
	SEP #$20
	LDA.l fl_facing_native,X
	STA $E010
	REP #$20
	LDA.w !core_pad_mask&$FFFF
	ORA.w #!PAD_UP|!PAD_DOWN|!PAD_LEFT|!PAD_RIGHT|!PAD_A
	STA.w !core_pad_mask&$FFFF
.done
	RTS

; D0 or a menu bit in EC: carry
fl_event_or_menu:
	SEP #$20
	LDA $D0
	BNE .yes
	LDA $EC
	AND.b #$FE
	BNE .yes
	REP #$20
	CLC
	RTS
.yes
	REP #$20
	SEC
	RTS

; Not in play: forget flight and the requests made to Goku.
fl_reset:
	JSR fl_land_now
	STZ.w !fl_hook
	LDA.w #$FFFF
	STA.l !fl_cam_map
	STA.w !fl_map
	STA.w !fl_lastmap            ; back on a field map: as a map change
	LDA.w #$0000
	STA.l !fl_tp_act
	STZ.w !fl_gap
	RTS

; localFlight = false, localLift = 0
fl_land_now:
	SEP #$20
	LDA.b #!FLS_FLY|!FLS_HOVERED
	TRB.w !fl_state
	STZ.w !fl_lift
	REP #$20
	RTS

; Pad as the browser's padInput: physical pad 1, with buttons that were held
; when a ring or menu closed ignored until released (menuInputHeld).
fl_read_pad:
	LDA.w !fl_pad
	STA.w !fl_pad_prev
	LDA.w !core_tick&$FFFF
	SEC
	SBC.w !fl_lasttick
	CMP.w #$0002
	LDA.w !core_tick&$FFFF
	STA.w !fl_lasttick
	BCC .same
	; frames of another mode ran since our last field frame (rings, menus)
	LDA.w !core_pad&$FFFF
	AND.w #!PAD_B|!PAD_Y|!PAD_A|!PAD_L
	STA.w !fl_held
.same
	LDA.w !fl_held
	AND.w !core_pad&$FFFF
	STA.w !fl_held
	EOR.w #$FFFF
	AND.w !core_pad&$FFFF
	STA.w !fl_pad
	RTS

; localLift steps 3 px a frame toward 12 (flying) or 0; reaching the ground
; raises the landing cue (mana-mod beforeFrame).
fl_lift_update:
	LDA.w !fl_lift
	AND.w #$00FF
	BNE +
	LDA.w !fl_state
	AND.w #!FLS_FLY
	BNE +
	RTS                          ; on the ground and staying there
+	LDA.w !fl_lift
	AND.w #$00FF
	STA.w !fl_t0
	LDA.w !fl_state
	AND.w #!FLS_FLY
	BEQ .down
	LDA.w !fl_t0
	CLC
	ADC.w #3
	CMP.w #13
	BCC .store
	LDA.w #12
	BRA .store
.down
	LDA.w !fl_t0
	SEC
	SBC.w #3
	BCS .store
	LDA.w #$0000
.store
	SEP #$20
	STA.w !fl_lift
	REP #$20
	AND.w #$00FF
	BNE .done
	LDA.w !fl_t0
	BEQ .done
	LDA.w !fl_events
	ORA.w #!FLE_LANDING
	STA.w !fl_events
.done
	RTS

; The flight decision (mana-mod beforeFrame): A with a direction (L only
; with the Kamehameha wave, never with L+B), or keep hovering where Goku
; cannot land.
fl_decide:
	SEP #$20
	LDA.w !fl_state
	BIT.b #!FLS_FLY|!FLS_HOVERED
	BNE .full
	LDA.w !fl_pad+1
	BIT.b #(!PAD_A>>8)
	BNE .full
	LDA.w !fl_pad
	BIT.b #!PAD_A
	BNE .full
	REP #$20
	RTS                          ; on foot, A not held: nothing to decide
.full
	LDA.w !fl_state
	AND.b #!FLS_FLY
	BEQ +
	LDA.b #!FLS_HOVERED
	TSB.w !fl_state
	BRA ++
+	LDA.b #!FLS_HOVERED
	TRB.w !fl_state
++	LDA.b #!FLS_FLY
	TRB.w !fl_state
	REP #$20
	; teleport = L + B, or an Instant Transmission running
	LDA.l !fl_tp_act
	BNE .done
	LDA.w !fl_pad
	AND.w #!PAD_L|!PAD_B
	CMP.w #!PAD_L|!PAD_B
	BEQ .done
	; A held with a direction
	LDA.w !fl_pad
	AND.w #!PAD_A
	BEQ .hover
	LDA.w !fl_pad
	AND.w #!PAD_UP|!PAD_DOWN|!PAD_LEFT|!PAD_RIGHT
	BEQ .hover
	LDA.w !fl_pad
	AND.w #!PAD_L
	BEQ .fly
	LDA.w !fl_pad
	AND.w #!PAD_Y                ; wave = L + Y (not L + B)
	BNE .fly
.hover
	LDA.w !fl_state
	AND.w #!FLS_HOVERED
	BEQ .done
	JSR fl_hero_land
	BCS .done
.fly
	SEP #$20
	LDA.b #!FLS_FLY
	TSB.w !fl_state
	REP #$20
	LDA.w !fl_state
	AND.w #!FLS_HOVERED
	BNE .done
	LDA.w !fl_events
	ORA.w #!FLE_TAKEOFF
	STA.w !fl_events
.done
	RTS

; Requests to Goku, the A mask and the hook work for the next frame.
fl_publish:
	; charging: combat's request (fl_charging), else the L+Y stand-in
	SEP #$20
	LDA.b #!FLS_CHARGE
	TRB.w !fl_state
	REP #$20
	LDA.w !fl_charging
	BNE .charge
	if defined("FLIGHT_CHARGE_STANDIN")
		; test stand-in until combat owns the charge: L+Y without B
		LDA.w !fl_state
		AND.w #!FLS_CAN
		BEQ .nocharge
		LDA.w !fl_pad
		AND.w #!PAD_L|!PAD_Y|!PAD_B
		CMP.w #!PAD_L|!PAD_Y
		BEQ .charge
	endif
	BRA .nocharge
.charge
	SEP #$20
	LDA.b #!FLS_CHARGE
	TSB.w !fl_state
	REP #$20
.nocharge
	; speed: localFlight with A held -> 6 (8 Super Saiyan), else 2;
	; charging halves it
	LDA.w #2
	STA.w !fl_speed
	LDA.w !fl_state
	AND.w #!FLS_FLY
	BEQ .slow
	LDA.w !fl_pad
	AND.w #!PAD_A
	BEQ .slow
	LDA.w #6
	STA.w !fl_speed
	LDA.l $7E0000|!goku_form
	AND.w #$0001
	BEQ .slow
	LDA.w #8
	STA.w !fl_speed
.slow
	LDA.w !fl_state
	AND.w #!FLS_CHARGE
	BEQ +
	LSR.w !fl_speed
+	; hook work (the camera follow persists until done)
	LDA.w !fl_hook
	AND.w #!FLH_CAMERA
	STA.w !fl_hook
	LDA.w !fl_mflags
	AND.w #!FLM_BEAST
	BEQ +
	JSR fl_beast_arena
	BCC +
	JSR fl_ground
	BCC +
	LDA.w #!FLH_BEAST
	TSB.w !fl_hook
+	LDA.w !fl_state
	AND.w #!FLS_CAN
	BEQ .hooks
	LDA.w !fl_state
	AND.w #!FLS_FLY|!FLS_CHARGE
	BEQ .hooks
	LDA.w #!FLH_STEP
	TSB.w !fl_hook
	LDA.w !fl_state
	AND.w #!FLS_FLY
	BEQ .hooks
	LDA.w #!FLH_PHASE
	TSB.w !fl_hook
.hooks
	; the A button is a speed modifier on foot, never the native dash
	LDA.w !fl_state
	BIT.w #!FLS_CAN
	BNE .mask
	AND.w #!FLS_ON
	BEQ .nomask
	JSR fl_event_or_menu
	BCS .nomask
.mask
	LDA.w !core_pad_mask&$FFFF
	ORA.w #!PAD_A
	STA.w !core_pad_mask&$FFFF
	LDA.w !fl_state
	AND.w #!FLS_CAN
	BEQ .nomask
	JSR fl_bind_mask_b
.nomask
	; Goku: LOCALFLY = localFlight, AIRBORNE = localFlight || localLift > 0
	SEP #$20
	LDA.l $7E0000|!goku_ctl
	AND.b #~(!GOKU_CTL_LOCALFLY|!GOKU_CTL_AIRBORNE)
	STA.w !fl_t0
	LDA.w !fl_state
	AND.b #!FLS_FLY
	BEQ +
	LDA.w !fl_t0
	ORA.b #!GOKU_CTL_LOCALFLY|!GOKU_CTL_AIRBORNE
	STA.w !fl_t0
+	LDA.w !fl_lift
	BEQ +
	LDA.w !fl_t0
	ORA.b #!GOKU_CTL_AIRBORNE
	STA.w !fl_t0
+	LDA.w !fl_t0
	STA.l $7E0000|!goku_ctl
	REP #$20
	LDA.w !fl_lift
	AND.w #$00FF
	STA.l $7E0000|!goku_lift
	; Instant Transmission pose (goku action $14), until the action ends
	LDA.l !fl_tp_act
	BEQ .noact
	SEP #$20
	LDA.b #!GOKU_K_TELEPORT
	STA.l $7E0000|!goku_act
	LDA.l !fl_tp_facing
	STA.l $7E0000|!goku_act_facing
	LDA.l $7E0000|!goku_form
	AND.b #$01
	BEQ +
	LDA.b #$80
+	STA.l $7E0000|!goku_act_arg
	LDA.b #!TP_DURATION
	STA.l $7E0000|!goku_act_dur
	REP #$20
	LDA.l !fl_tp_age
	STA.l $7E0000|!goku_act_age
	BRA .sounds
.noact
	LDA.l $7E0000|!goku_act
	AND.w #$00FF
	CMP.w #!GOKU_K_TELEPORT
	BNE .sounds
	SEP #$20
	LDA.b #$00
	STA.l $7E0000|!goku_act
	REP #$20
.sounds
	; cues (ki-sound.js names in fl_events)
	LDA.w !fl_events
	BEQ .air
	BIT.w #!FLE_TAKEOFF
	BEQ +
	LDA.w #!FL_SFX_FLIGHT
	JSR fl_bind_sfx
+	LDA.w !fl_events
	BIT.w #!FLE_LANDING
	BEQ +
	LDA.w #!FL_SFX_LANDING
	JSR fl_bind_sfx
+	LDA.w !fl_events
	BIT.w #!FLE_TELEPORT
	BEQ +
	LDA.w #!FL_SFX_TELEPORT
	JSR fl_bind_sfx
+	LDA.w !fl_events
	BIT.w #!FLE_TELEPORT_IN
	BEQ .air
	LDA.w #!FL_SFX_TELEPORT_IN
	JSR fl_bind_sfx
.air
	; the gap-flight hover over a native whip crossing (goku mode $23)
	LDA.w !fl_gap
	BEQ .nogap
	SEP #$20
	LDA.b #!GOKU_K_GAPFLIGHT
	STA.l $7E0000|!goku_mode
	REP #$20
	BRA .bed
.nogap
	LDA.l $7E0000|!goku_mode
	AND.w #$00FF
	CMP.w #!GOKU_K_GAPFLIGHT
	BNE +
	SEP #$20
	LDA.b #$00
	STA.l $7E0000|!goku_mode     ; only the mode flight set
	REP #$20
+	LDA.w !fl_state
	AND.w #!FLS_FLY
	BEQ +
.bed
	; the air bed while flying or crossing (quieter while charging)
	LDA.w !fl_state
	AND.w #!FLS_CHARGE
	JSR fl_bind_air
+
	; first hover with control (power-intro.js) and the tile cache's life
	LDA.w !fl_state
	AND.w #!FLS_FLY|!FLS_CAN
	CMP.w #!FLS_FLY|!FLS_CAN
	BNE .cache
	LDA.w !fl_events
	ORA.w #!FLE_HOVER
	STA.w !fl_events
	JSR fl_bind_ui_hover         ; power intro: the first hover's banter
.cache
	LDA.w !fl_cache_age
	INC
	STA.w !fl_cache_age
	CMP.w #!FL_CACHE_LIFE
	BCC .done
	JSR fl_cache_clear
.done
	RTS

; ---------------------------------------------------------------------------
; settle() (native-local-flight.js): companions trail an airborne Goku,
; crossings adopt the far floor's height, the last verified landing is kept,
; long gaps carry the party, and a Goku left inside a wall or outside the
; map returns to safe ground.
fl_settle:
	LDA.w !fl_state
	AND.w #!FLS_CAN
	BNE .can
	JSR fl_ground
	BCS +
	JMP fl_crossing_none
+	RTS                          ; context not loaded (not controllable)
.can
	; canAttack covers ground() except the load flag $FF
	SEP #$20
	LDA $FF
	REP #$20
	BEQ +
	JMP fl_crossing_none
+	; on foot without a whip crossing, settle() only clears the crossing and
	; records the last landing
	LDA.w !fl_state
	AND.w #!FLS_FLY
	BNE .full
	LDA.l !fl_crossing+10
	BNE .full
	JSR fl_crossing_none
	LDA.l !fl_anchor
	CMP $DC
	BEQ +
	JSR fl_anchor_none
+	JSR fl_hero_land
	BCC +
	JSR fl_anchor_here
+	RTS
.full
	JSR fl_phasing
	LDA.w #$0000
	ROL
	PHA                          ; [elig] = phasing && eligible
	BEQ .nofollow
	JSR fl_follow
.nofollow
	; anchor / crossing belong to this map
	LDA.l !fl_anchor
	CMP $DC
	BEQ +
	JSR fl_anchor_none
+	LDA.l !fl_crossing
	CMP $DC
	BNE .dropx
	LDA.l !fl_crossing+10        ; whip
	BNE +
	LDA $01,S
	BNE +
.dropx
	JSR fl_crossing_none
+	; flight adopts the floor height under a complete landing
	LDA $01,S
	BEQ .whip
	JSR fl_hero_tile
	BCS .whip
	JSR fl_fetch
	LDA.w !fl_d_flags
	AND.w #$0003
	BEQ .whip
	CMP.w #$0003
	BEQ .whip
	STA.w !fl_t6
	LDA $E00B
	AND.w #$0003
	CMP.w !fl_t6
	BEQ .whip
	JSR fl_q_hero
	LDA.w !fl_t6
	STA.w !fl_q_t
	PHA
	JSR fl_can_land
	PLA
	BCC .whip
	STA.w !fl_t6
	SEP #$20
	LDA $E00B
	AND.b #$FC
	ORA.w !fl_t6
	STA $E00B
	REP #$20
.whip
	; withinWhip = (crossing.whip || elig) && crossable(tileAt(hero))
	LDA.w #$0000
	PHA                          ; [within][elig]
	LDA.l !fl_crossing+10
	ORA $03,S
	BEQ .nowhip
	JSR fl_hero_tile
	BCS .nowhip
	JSR fl_whip_crossable
	BCC .nowhip
	LDA.w #$0001
	STA $01,S
	; a whip corridor flown from an anchor becomes a whip crossing
	LDA $03,S
	BEQ .nowhip
	LDA.l !fl_anchor
	CMP.w #$FFFF
	BEQ .nowhip
	LDA.l !fl_crossing
	CMP.w #$FFFF
	BNE +
	JSR fl_crossing_from_anchor
+	LDA.w #$0001
	STA.l !fl_crossing+10
.nowhip
	; on usable ground?
	JSR fl_hero_land
	BCC .air
	LDA.l !fl_crossing+10
	BEQ .landed
	LDA $01,S
	BNE .done                    ; still between whip pads
.landed
	LDA.l !fl_crossing
	CMP.w #$FFFF
	BEQ .anchor
	LDA.l !fl_crossing+6         ; layer
	CMP.w !fl_q_l
	BNE .anchor
	JSR fl_crossing_dist
	BCC .anchor
	; onCross: bring the companions over
	JSR fl_gather_here
	LDA.w !fl_events
	ORA.w #!FLE_CROSS
	STA.w !fl_events
.anchor
	JSR fl_crossing_none
	JSR fl_anchor_here
.done
	PLA
	PLA
	RTS
.air
	LDA $03,S
	BEQ .done
	; leaving from a verified landing starts a crossing
	LDA.l !fl_anchor
	CMP.w #$FFFF
	BEQ .carry
	JSR fl_hero_fly
	BCC .carry
	LDA.l !fl_crossing
	CMP.w #$FFFF
	BNE .carry
	JSR fl_crossing_from_anchor
.carry
	; the Beast's open sky and long gaps carry the CPU companions
	JSR fl_beast_arena
	BCC .gaps
	JSR fl_hero_fly
	BCC .gaps
	JSR fl_gather_here
	BRA .done
.gaps
	JSR fl_hero_tile
	BCS .recover_check
	JSR fl_fetch
	JSR fl_ferry_gap
	BCS .carried
	JSR fl_dungeon_air
	BCC .recover_check
.carried
	JSR fl_gather_here
.recover_check
	; outside the map, or embedded in a solid cell that is not a low obstacle
	LDA $E002
	CMP.w #8
	BCC .recover
	CLC
	ADC.w #8
	CMP.w !fl_wpx
	BEQ +
	BCS .recover
+	LDA $E004
	CMP.w #8
	BCC .recover
	CLC
	ADC.w #8
	CMP.w !fl_hpx
	BEQ +
	BCS .recover
+	JSR fl_hero_tile
	BCS .ret
	JSR fl_fetch
	LDA.w !fl_d_code
	BNE .ret
	LDA.w !fl_d_flags
	AND.w #$0007
	CMP.w #$0003
	BNE .ret
	LDA.w !fl_open_air
	BNE .ret
	JSR fl_low
	BCC .recover
.ret
	JMP .done
.recover
	JSR fl_recover
	JMP .done

; X = idx of tileAt(hero) (pixel bounds); carry set when outside the map.
fl_hero_tile:
	LDA $E002
	CMP.w !fl_wpx
	BCS .out
	LDA $E004
	CMP.w !fl_hpx
	BCS .out
	AND.w #$FFF0
	ASL
	ASL
	ASL
	STA.w !fl_t5
	LDA $E002
	LSR : LSR : LSR : LSR
	ORA.w !fl_t5
	STA.w !fl_t5
	LDA $E00B
	AND.w #$0080
	BEQ +
	LDA.w #$4000
+	ORA.w !fl_t5
	TAX
	CLC
	RTS
.out
	SEC
	RTS

; follow(): CPU companions trail an airborne Goku inside the boxes the
; native tether keeps on screen (girl 36x26, sprite 56x40).
fl_follow:
	LDX.w #$0200
	LDA.w #36
	LDY.w #26
	JSR fl_follow_one
	LDX.w #$0400
	LDA.w #56
	LDY.w #40
	; fall through
fl_follow_one:
	STA.w !fl_t0                 ; rx
	STY.w !fl_t1                 ; ry
	LDA.l $7EE000,X
	AND.w #$0001
	BEQ .skip
	LDA.l $7EE02C,X
	AND.w #$0001
	BNE .skip                    ; player-controlled
	; nx = clamp(fx, x - rx, x + rx)
	LDA $E002
	SEC
	SBC.w !fl_t0
	STA.w !fl_t2                 ; lo
	LDA $E002
	CLC
	ADC.w !fl_t0
	STA.w !fl_t3                 ; hi
	LDA.l $7EE002,X
	JSR fl_clamp_signed
	STA.l $7EE002,X
	LDA $E004
	SEC
	SBC.w !fl_t1
	STA.w !fl_t2
	LDA $E004
	CLC
	ADC.w !fl_t1
	STA.w !fl_t3
	LDA.l $7EE004,X
	JSR fl_clamp_signed
	STA.l $7EE004,X
.skip
	RTS
; A = clamp(A, fl_t2, fl_t3), signed (Math.max/min; values are map pixels
; +- a few hundred, so differences never overflow)
fl_clamp_signed:
	PHA
	SEC
	SBC.w !fl_t2
	BPL +
	PLA
	LDA.w !fl_t2
	RTS
+	LDA $01,S
	SEC
	SBC.w !fl_t3
	BMI +
	BEQ +
	PLA
	LDA.w !fl_t3
	RTS
+	PLA
	RTS

; teleport.gather(): CPU companions join Goku (position, terrain, no motion).
fl_gather_here:
	LDA $E002
	STA.w !fl_t0
	LDA $E004
	STA.w !fl_t1
	LDA $E00B
	AND.w #$00FF
	STA.w !fl_t2
fl_gather:                       ; fl_t0/t1 = x/y, fl_t2 = terrain byte
	LDX.w #$0200
	JSR .one
	LDX.w #$0400
.one
	LDA.l $7EE000,X
	AND.w #$0001
	BEQ .skip
	LDA.l $7EE02C,X
	AND.w #$00FF
	BNE .skip                    ; any player owns it
	LDA.l $7EE00E,X
	AND.w #$0080
	BNE .skip
	LDA.w !fl_t0
	STA.l $7EE002,X
	LDA.w !fl_t1
	STA.l $7EE004,X
	SEP #$20
	LDA.w !fl_t2
	STA.l $7EE00B,X
	LDA.b #$00
	STA.l $7EE006,X
	STA.l $7EE007,X
	STA.l $7EE02D,X
	STA.l $7EE045,X
	REP #$20
.skip
	RTS

; anchor = {map, x, y, layer, terrain} of the hero; crossing helpers
fl_anchor_here:
	LDA $DC
	STA.l !fl_anchor
	LDA $E002
	STA.l !fl_anchor+2
	LDA $E004
	STA.l !fl_anchor+4
	LDA.w !fl_q_l
	STA.l !fl_anchor+6
	LDA $E00B
	AND.w #$00FF
	STA.l !fl_anchor+8
	RTS
fl_anchor_none:
	LDA.w #$FFFF
	STA.l !fl_anchor
	RTS
fl_crossing_none:
	LDA.w #$FFFF
	STA.l !fl_crossing
	LDA.w #$0000
	STA.l !fl_crossing+10
	RTS
fl_crossing_from_anchor:
	LDA.l !fl_anchor
	STA.l !fl_crossing
	LDA.l !fl_anchor+2
	STA.l !fl_crossing+2
	LDA.l !fl_anchor+4
	STA.l !fl_crossing+4
	LDA.l !fl_anchor+6
	STA.l !fl_crossing+6
	LDA.l !fl_anchor+8
	STA.l !fl_crossing+8
	LDA.w #$0000
	STA.l !fl_crossing+10
	RTS
; carry = hypot(hero - crossing start) >= 24
fl_crossing_dist:
	LDA $E002
	SEC
	SBC.l !fl_crossing+2
	JSR fl_square
	STA.w !fl_t0
	LDA $E004
	SEC
	SBC.l !fl_crossing+4
	JSR fl_square
	CLC
	ADC.w !fl_t0
	BCS .far                     ; >= 65536
	CMP.w #576
	RTS
.far
	SEC
	RTS
; A = min(A*A, $FFFF) for a signed 16-bit A
fl_square:
	BPL +
	EOR.w #$FFFF
	INC
+	CMP.w #256
	BCS .big
	SEP #$20
	STA.l $004202
	STA.l $004203
	REP #$20
	NOP
	NOP
	NOP
	NOP
	LDA.l $004216
	RTS
.big
	LDA.w #$FFFF
	RTS

; Recovery: back to the last verified landing on this layer, else to the
; nearest landable point of a +-128 px grid (8 px steps), nearest first in
; the browser's order (generated table).
fl_recover:
	JSR fl_q_hero
	LDA.l !fl_anchor
	CMP $DC
	BNE .search
	LDA.l !fl_anchor+6
	CMP.w !fl_q_l
	BNE .search
	LDA.l !fl_anchor+2
	STA.w !fl_q_x
	LDA.l !fl_anchor+4
	STA.w !fl_q_y
	JSR fl_can_land
	BCC .search
	LDA.l !fl_anchor+2
	STA $E002
	LDA.l !fl_anchor+4
	STA $E004
	SEP #$20
	LDA.l !fl_anchor+8
	STA $E00B
	REP #$20
	BRL .moved
.search
	; centre clamped into [8, size-8]
	LDA $E002
	CMP.w #8
	BCS +
	LDA.w #8
+	STA.w !fl_t4
	LDA.w !fl_wpx
	SEC
	SBC.w #8
	CMP.w !fl_t4
	BCS +
	STA.w !fl_t4
+	LDA $E004
	CMP.w #8
	BCS +
	LDA.w #8
+	STA.w !fl_t5
	LDA.w !fl_hpx
	SEC
	SBC.w #8
	CMP.w !fl_t5
	BCS +
	STA.w !fl_t5
+	LDX.w #$0000
.cand
	CPX.w #(33*33)*2
	BCS .none
	PHX
	LDA.l fl_recover_order,X
	PHA
	AND.w #$00FF
	BIT.w #$0080
	BEQ +
	ORA.w #$FF00
+	ASL : ASL : ASL
	CLC
	ADC.w !fl_t4
	STA.w !fl_q_x
	PLA
	XBA
	AND.w #$00FF
	BIT.w #$0080
	BEQ +
	ORA.w #$FF00
+	ASL : ASL : ASL
	CLC
	ADC.w !fl_t5
	STA.w !fl_q_y
	LDA.w !fl_t4 : PHA
	LDA.w !fl_t5 : PHA
	JSR fl_can_land
	PLA : STA.w !fl_t5
	PLA : STA.w !fl_t4
	PLX
	BCS .found
	INX
	INX
	BRA .cand
.found
	LDA.w !fl_q_x
	STA $E002
	LDA.w !fl_q_y
	STA $E004
.moved
	SEP #$20
	STZ $E006
	STZ $E007
	REP #$20
	JSR fl_crossing_none
	JSR fl_gather_here
	; the camera follows like a teleport (native-teleport.js follow)
	LDA $E00B
	AND.w #$00FF
	LDX $E002
	LDY $E004
	JSR fl_camera_follow
.none
	RTS
