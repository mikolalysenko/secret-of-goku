; Movement hooks (native-local-flight.js cpu.cycle breakpoints). The party
; movement step runs in bank 00 with DB = $7E, D = 0, X16; $10 = the moving
; actor's offset (0 = the hero). Each hook re-executes the original
; instructions it replaced and returns to bank 00, or takes the branch the
; browser takes. Work is gated per frame by fl_hook and re-validated live
; (fl_eligible), as the browser evaluates its predicates at the hooked
; instruction.

; ---------------------------------------------------------------------------
; Camera follow (native-teleport.js follow/pending): after Goku is placed
; somewhere else (Instant Transmission, recovery), the hero's movement steps
; drive the native camera dispatcher (C0:DA6E via D6AC) with deltas of at
; most 15 px per axis, one step per video frame, so every crossed row or
; column is streamed. Mode 7 arenas keep their fixed renderer (no follow).

; fl_camera_follow: X/Y = landing position, A = terrain byte (E00B).
fl_camera_follow:
	PHA
	PHY
	PHX
	LDA $29
	AND.w #$0007
	CMP.w #$0007
	BNE +
	PLX
	PLY
	PLA
	LDA.w #$FFFF
	STA.l !fl_cam_map
	RTS
+	LDA $DC
	STA.l !fl_cam_map
	LDA $05,S
	AND.w #$00FF
	STA.l !fl_cam_terr
	AND.w #$0080
	BEQ +
	LDA.w #$0001
+	STA.l !fl_cam_layer
	; x = clamp(x - 128, 0, max(0, width - 256)), y likewise with 112 / 224
	LDA $C0
	SEC
	SBC.w #256
	BPL +
	LDA.w #$0000
+	STA.w !fl_t3
	PLA                          ; x
	SEC
	SBC.w #128
	BPL +
	LDA.w #$0000
+	CMP.w !fl_t3
	BCC +
	LDA.w !fl_t3
+	STA.l !fl_cam_x
	LDA $C2
	SEC
	SBC.w #224
	BPL +
	LDA.w #$0000
+	STA.w !fl_t3
	PLA                          ; y
	SEC
	SBC.w #112
	BPL +
	LDA.w #$0000
+	CMP.w !fl_t3
	BCC +
	LDA.w !fl_t3
+	STA.l !fl_cam_y
	PLA
	LDA.w #$FFFF
	STA.l !fl_cam_frame
	LDA.w #!FLH_CAMERA
	TSB.w !fl_hook
	RTS
; teleport.follow() at the hero: companions join, then the camera follows.
fl_camera_follow_hero:
	JSR fl_gather_here
	LDA $E00B
	AND.w #$00FF
	LDX $E002
	LDY $E004
	JMP fl_camera_follow

; One camera step at the hero's D651. Carry clear: no camera work (move
; normally). Carry set: N clear = scroll now (deltas in $84/$86, $1B set),
; N set = already scrolled this video frame.
fl_camera_step:
	LDA.l !fl_cam_map
	CMP $DC
	BNE .cancel
	SEP #$20
	LDA $D0
	ORA $FF
	REP #$20
	BNE .cancel
	LDA.w !fl_state
	AND.w #!FLS_ON
	BEQ .cancel
	LDA $F4
	AND.w #$00FF
	CMP.l !fl_cam_frame
	BNE .scroll
	LDA.w #$FFFF                 ; N set
	SEC
	RTS
.scroll
	PHA
	LDX.w #$00A8
	LDA.l !fl_cam_layer
	BEQ +
	LDX.w #$00AC
+	LDA.l !fl_cam_x
	SEC
	SBC $00,X
	JSR fl_clamp15
	STA.w !fl_t0
	LDA.l !fl_cam_y
	SEC
	SBC $02,X
	JSR fl_clamp15
	STA.w !fl_t1
	ORA.w !fl_t0
	BNE .move
	PLA
.cancel
	LDA.w #$FFFF
	STA.l !fl_cam_map
	LDA.w #!FLH_CAMERA
	TRB.w !fl_hook
	CLC
	RTS
.move
	PLA
	STA.l !fl_cam_frame
	LDA.w !fl_t0
	JSR fl_pack
	SEP #$20
	STA $84
	REP #$20
	LDA.w !fl_t1
	JSR fl_pack
	SEP #$20
	STA $86
	LDA.l !fl_cam_terr
	STA $1B
	REP #$20
	LDA.w #$0000                 ; N clear
	SEC
	RTS
; A = clamp(A, -15, 15) (signed)
fl_clamp15:
	BMI .neg
	CMP.w #16
	BCC +
	LDA.w #15
+	RTS
.neg
	CMP.w #$FFF1
	BCS +
	LDA.w #$FFF1
+	RTS

; 00:DA6E (replaced SEP #$30 / LDA $FF): the camera dispatcher. While the
; camera follows, companions' steps do not move it; in the Mana Beast's
; Mode 7 arena no step does (its art is not an ordinary tile map). A
; scene's camera target replaces every step's deltas: the leader's first
; call in a video frame moves one pixel per axis toward it, every other
; call none, with Goku's terrain for the dispatcher.
fl_hook_da6e:
	REP #$20
	LDA.w !fl_hook
	AND.w #!FLH_CAMERA|!FLH_BEAST|!FLH_SCRIPT
	BEQ .native
	BIT.w #!FLH_SCRIPT
	BNE .script
	AND.w #!FLH_BEAST
	BNE .zero
	LDA $10
	BEQ .native
.zero
	SEP #$20
	STZ $84
	STZ $86
.native
	SEP #$30
	LDA $FF
	JML $00DA72
.script
	SEP #$20
	LDA $FF
	BNE .native                  ; a map load: nothing scripted
	LDA $E00B
	STA $1B
	STZ $84
	STZ $86
	REP #$20
	LDA $10
	BNE .native                  ; not the leader: no deltas
	LDA $F4
	AND.w #$00FF
	CMP.l !fl_scam_frame
	BEQ .native                  ; already stepped this video frame
	STA.l !fl_scam_frame
	LDA.l !fl_scam_x
	SEC
	SBC $A8
	JSR fl_unit_packed
	SEP #$20
	STA $84
	REP #$20
	LDA.l !fl_scam_y
	SEC
	SBC $AA
	JSR fl_unit_packed
	SEP #$20
	STA $86
	BRA .native
; A16 = a signed difference (flags from it): its sign as a packed delta
; (0, 1 or $81 for -1).
fl_unit_packed:
	BEQ +
	BMI ++
	LDA.w #$0001
+	RTS
++	LDA.w #$0081
	RTS

; Signed-magnitude helpers ($1E/$1F: bit 7 = negative, low 7 bits = pixels)
; fl_unpack: A8 in, A16 signed out. fl_pack: A16 signed in, A16 packed out.
fl_unpack:
	AND.w #$00FF
	BIT.w #$0080
	BEQ +
	AND.w #$007F
	EOR.w #$FFFF
	INC
+	RTS
fl_pack:
	BPL +
	EOR.w #$FFFF
	INC
	ORA.w #$0080
+	AND.w #$00FF
	RTS

; ---------------------------------------------------------------------------
; 00:D651 (replaced SEP #$20 / LDA $1F): the velocity of this step is in
; $1E/$1F. Flight sets it to its speed, never travels more than 14 px per
; axis in one video frame (the BG streamer queues one row/column), stays
; inside the map, and when the swept footprint is blocked gives the native
; collision one pixel at a time.
fl_hook_d651:
	REP #$30
	JSR fl_bind_recoil           ; combat's Saiyan recoil adjusts $1E/$1F first
	LDA $10
	BNE .native
	JSR fl_bind_holes
	BCC +
	JSR fl_walk_holes            ; walking stops at missing deck tiles
+	LDA.w !fl_hook
	BEQ .native
	BIT.w #!FLH_SCRIPT
	BEQ .follow
	; a scene's camera target (flight_api_camera, frieza-intro.js
	; installAltarCamera): a standing leader runs the camera dispatcher
	; too (natively it skips it); the teleport's follow waits
	SEP #$20
	LDA $FF
	BNE +
	LDA $1E
	ORA $1F
	BNE +
	JML $00D6AC                  ; JSR $DA6E (camera) / CLC / RTS
+	REP #$20
	BRA .step
.follow
	AND.w #!FLH_CAMERA
	BEQ .step
	JSR fl_camera_step
	BCC .step
	; the hero's step is the camera's this frame
	BMI .skip
	SEP #$20
	JML $00D6AC                  ; JSR $DA6E (camera) / CLC / RTS
.skip
	SEP #$20
	JML $00D65C                  ; RTS: one row/column upload per frame
.step
	LDA.w !fl_hook
	AND.w #!FLH_STEP
	BEQ .native
	JSR fl_eligible
	LDA.w #$0000
	ROL
	STA.l !fl_step_elig
	LDA $F4
	AND.w #$00FF
	STA.l !fl_step_f4
	LDA.l !fl_step_elig
	BEQ .native
	LDA.w #$0000
	STA.l !fl_g_chk              ; a new phase: check the grid's tiles again
	JSR fl_grid_reset            ; tiles around Goku for this step's tests
	JSR fl_sweep_forget
	JSR fl_step_velocity
.native
	SEP #$20
	LDA $1F
	JML $00D655

fl_step_velocity:
	; a new video frame resets the per-frame travel
	LDA $F4
	AND.w #$00FF
	CMP.w !fl_vframe
	BEQ +
	STA.w !fl_vframe
	STZ.w !fl_travel_x
	STZ.w !fl_travel_y
+	; velocity = clamp(round(speed * (diagonal ? 0.7071 : 1)), 1, 8)
	LDA.w !fl_speed
	STA.w !fl_t0
	LDA $1E
	AND.w #$007F
	BEQ .straight
	LDA $1F
	AND.w #$007F
	BEQ .straight
	LDX.w !fl_speed
	CPX.w #9
	BCS .straight
	LDA.l fl_diag_speed,X
	AND.w #$00FF
	STA.w !fl_t0
.straight
	LDA.w !fl_t0
	BNE +
	INC
+	CMP.w #9
	BCC +
	LDA.w #8
+	STA.w !fl_t0
	; x axis
	LDA $1E
	AND.w #$007F
	BEQ .y
	LDA.w #14
	SEC
	SBC.w !fl_travel_x
	CMP.w !fl_t0
	BCC +
	LDA.w !fl_t0
+	STA.w !fl_t1                 ; allowance
	LDA $1E
	AND.w #$0080
	BEQ .xpos
	LDA $E002
	SEC
	SBC.w #8
	BPL +
	LDA.w #$0000
+	CMP.w !fl_t1
	BCC +
	LDA.w !fl_t1
+	BEQ .xzero
	ORA.w #$0080
	BRA .xstore
.xpos
	LDA.w !fl_wpx
	SEC
	SBC.w #8
	SEC
	SBC $E002
	BPL +
	LDA.w #$0000
+	CMP.w !fl_t1
	BCC .xstore
	LDA.w !fl_t1
	BRA .xstore
.xzero
	LDA.w #$0000
.xstore
	SEP #$20
	STA $1E
	REP #$20
.y
	LDA $1F
	AND.w #$007F
	BEQ .travel
	LDA.w #14
	SEC
	SBC.w !fl_travel_y
	CMP.w !fl_t0
	BCC +
	LDA.w !fl_t0
+	STA.w !fl_t1
	LDA $1F
	AND.w #$0080
	BEQ .ypos
	LDA $E004
	SEC
	SBC.w #8
	BPL +
	LDA.w #$0000
+	CMP.w !fl_t1
	BCC +
	LDA.w !fl_t1
+	BEQ .yzero
	ORA.w #$0080
	BRA .ystore
.ypos
	LDA.w !fl_hpx
	SEC
	SBC.w #8
	SEC
	SBC $E004
	BPL +
	LDA.w #$0000
+	CMP.w !fl_t1
	BCC .ystore
	LDA.w !fl_t1
	BRA .ystore
.yzero
	LDA.w #$0000
.ystore
	SEP #$20
	STA $1F
	REP #$20
.travel
	LDA $1E
	AND.w #$007F
	CLC
	ADC.w !fl_travel_x
	STA.w !fl_travel_x
	LDA $1F
	AND.w #$007F
	CLC
	ADC.w !fl_travel_y
	STA.w !fl_travel_y
	; flight collision rules
	LDA.w !fl_state
	AND.w #!FLS_FLY
	BEQ .done
	LDA $1E
	JSR fl_unpack
	STA.w !fl_sw_dx
	LDA $1F
	JSR fl_unpack
	STA.w !fl_sw_dy
	JSR fl_beast_arena
	BCS .beast
	LDA $E002
	STA.w !fl_sw_x
	LDA $E004
	STA.w !fl_sw_y
	LDA $E00B
	AND.w #$0080
	BEQ +
	LDA.w #$0001
+	STA.w !fl_q_l
	JSR fl_sweep
	BCS .done
	; blocked: one pixel per axis for the native shaped tiles and triggers
	LDA.w !fl_sw_dx
	JSR fl_sign
	JSR fl_pack
	SEP #$20
	STA $1E
	REP #$20
	LDA.w !fl_sw_dy
	JSR fl_sign
	JSR fl_pack
	SEP #$20
	STA $1F
	REP #$20
.done
	RTS
.beast
	; the Beast arena: clamp the destination into X 184-408, Y 292-432
	LDA $E002
	CLC
	ADC.w !fl_sw_dx
	LDX.w #184
	LDY.w #408
	JSR fl_clamp_xy
	SEC
	SBC $E002
	JSR fl_pack
	SEP #$20
	STA $1E
	REP #$20
	LDA $E004
	CLC
	ADC.w !fl_sw_dy
	LDX.w #292
	LDY.w #432
	JSR fl_clamp_xy
	SEC
	SBC $E004
	JSR fl_pack
	SEP #$20
	STA $1F
	REP #$20
	RTS
; A = clamp(A, X, Y) (signed, small values)
fl_clamp_xy:
	STX.w !fl_t2
	STY.w !fl_t3
	JMP fl_clamp_signed
; A = sign(A)
fl_sign:
	BEQ +
	BMI .neg
	LDA.w #$0001
+	RTS
.neg
	LDA.w #$FFFF
	RTS
; round(speed * SQRT1_2) for speeds 0-8 (index = speed)
fl_diag_speed:
	db 0, 1, 1, 2, 3, 4, 4, 5, 6

; eligible() of the hero's current movement step (computed at D651; the
; later hooks of the same step reuse it). Carry.
fl_step_eligible:
	LDA $F4
	AND.w #$00FF
	CMP.l !fl_step_f4
	BNE .live
	LDA.l !fl_step_elig
	LSR
	RTS
.live
	JMP fl_eligible

; ---------------------------------------------------------------------------
; 00:D778 (replaced SEP #$20 / LDA $11) inside the collision routine D74F:
; an airborne step whose swept footprint is clear, starting from or ending
; at a point where Goku cannot land (canFloat), skips the native collision
; test (C1:B93E) and continues at D7F3, where the native code applies the
; move, the destination's floor data and the camera.
fl_hook_d778:
	SEP #$20
	LDA $10
	ORA $11
	BNE .native1
	LDA.w !fl_hook
	AND.b #!FLH_PHASE
	BNE +
.native1
	LDA $11
	JML $00D77C
+	REP #$30
	JSR fl_step_eligible
	BCC .native
	LDA.w #$0000
	STA.l !fl_g_chk              ; a new phase: check the grid's tiles again
	LDA $1E
	JSR fl_unpack
	STA.w !fl_sw_dx
	LDA $1F
	JSR fl_unpack
	STA.w !fl_sw_dy
	ORA.w !fl_sw_dx
	BEQ .native
	LDA $E002
	STA.w !fl_sw_x
	LDA $E004
	STA.w !fl_sw_y
	LDA $E00B
	AND.w #$0080
	BEQ +
	LDA.w #$0001
+	STA.w !fl_q_l
	LDA $E00B
	AND.w #$0003
	STA.w !fl_q_t
	JSR fl_sweep
	BCC .native
	LDA.w !fl_sw_x
	STA.w !fl_q_x
	LDA.w !fl_sw_y
	STA.w !fl_q_y
	JSR fl_can_float
	BCS .phase
	LDA.w !fl_sw_x
	CLC
	ADC.w !fl_sw_dx
	STA.w !fl_q_x
	LDA.w !fl_sw_y
	CLC
	ADC.w !fl_sw_dy
	STA.w !fl_q_y
	; canFloat(x+dx, y+dy): the sweep's last step already proved canFly there
	JSR fl_can_land
	BCS .native
.phase
	SEP #$20
	JML $00D7F3
.native
	SEP #$20
	LDA $11
	JML $00D77C

; ---------------------------------------------------------------------------
; 00:D359 (replaced LDA $E048,X / STA $00 / AND #$F0): stairs (2x) and
; currents/conveyors (3x) steer walking; an airborne Goku is not steered
; (D38E skips the guidance). M8 X16, X = actor offset.
fl_hook_d359:
	CPX.w #$0000
	BNE .native                  ; only the hero (every actor passes here)
	LDA.w !fl_hook
	AND.b #!FLH_PHASE
	BEQ .native
	PHP
	REP #$30
	JSR fl_phasing
	BCC .pnative
	LDA $E048
	AND.w #$00F0
	CMP.w #$0020
	BEQ .skip
	CMP.w #$0030
	BNE .pnative
.skip
	PLP
	JML $00D38E
.pnative
	PLP
.native
	LDA $E048,X
	STA $00
	AND.b #$F0
	JML $00D360

; ---------------------------------------------------------------------------
; 00:D9AE / 00:DA34 (replaced SEP #$20 / LDA $E000,X): the leader tether.
; A step that would push a companion out of the middle of the screen
; cancels the leader's velocity on that axis; an airborne Goku returns at
; the routine's RTS instead and drags the companions along (fl_follow).
fl_hook_d9ae:
	SEP #$20
	LDA $10
	ORA $11
	BNE .native
	LDA.w !fl_hook
	AND.b #!FLH_PHASE
	BEQ .native
	REP #$20
	PHX
	JSR fl_step_eligible
	PLX
	BCC .native
	SEP #$20
	JML $00D9E2
.native
	SEP #$20
	LDA $E000,X
	JML $00D9B3
fl_hook_da34:
	SEP #$20
	LDA $10
	ORA $11
	BNE .native
	LDA.w !fl_hook
	AND.b #!FLH_PHASE
	BEQ .native
	REP #$20
	PHX
	JSR fl_step_eligible
	PLX
	BCC .native
	SEP #$20
	JML $00DA68
.native
	SEP #$20
	LDA $E000,X
	JML $00DA39

; Walking stops at missing deck tiles (a floor-hole provider is in the
; build): the hero's step on foot loses the axis whose footprint would stand
; over a hole, x first, then y with the step that is left. Native doors,
; stairs, collision and animation still run. M16/X16, DB = $7E.
fl_walk_holes:
	LDA.w !fl_state
	AND.w #!FLS_FLY
	BNE .out                     ; phasing: flight has its own rules
	LDA.l !persist_goku_active
	AND.w #$00FF
	BEQ .out
	JSR fl_ground
	BCC .out
	LDA $E02C
	AND.w #$0001
	BEQ .out
	LDA $E00B
	AND.w #$0080
	BEQ +
	LDA.w #$0001
+	STA.w !fl_q_l
	LDA $1E
	JSR fl_unpack
	CLC
	ADC $E002
	STA.w !fl_q_x
	LDA $E004
	STA.w !fl_q_y
	JSR fl_bind_hole
	BCC +
	SEP #$20
	STZ $1E
	REP #$20
+	LDA $1E
	JSR fl_unpack
	CLC
	ADC $E002
	STA.w !fl_q_x
	LDA $1F
	JSR fl_unpack
	CLC
	ADC $E004
	STA.w !fl_q_y
	JSR fl_bind_hole
	BCC .out
	SEP #$20
	STZ $1F
	REP #$20
.out
	RTS
