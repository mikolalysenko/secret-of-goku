; Instant Transmission (mana-mod.js instantTransmission / advanceAction /
; finishTeleport, native-teleport.js findLanding / gather / follow).
; L+B (pressed) picks a target among the live enemies (actor slots 3-11:
; active, species < $80 and not the orb $55, HP, not dead): the nearest the
; first time, then the next slot after the last target, wrapping, skipping
; foes with no landing spot. The 12-frame action hides Goku at ages 4-5;
; at age 4 he lands beside the target (same side as he came from when
; possible), companions gather and the camera follows (the action holds age
; 4 until it arrives). Pressing again during the action queues the next one.
; A custom target (Frieza, or Vegeta in place of slot 3) comes from the
; scene module through !fl_tp_custom (see flight.md).

; Start (or queue) Instant Transmission. Carry set when an action started.
fl_tp_start:
	LDA.l !fl_tp_act
	BEQ +
	LDA.w #$0001
	STA.l !fl_tp_queued          ; already teleporting: go on to the next
	SEC
	RTS
+	LDA.w !fl_state
	AND.w #!FLS_CAN
	BNE +
	CLC
	RTS
+	LDA $E002
	STA.l !fl_tp_ox
	LDA $E004
	STA.l !fl_tp_oy
	JSR fl_tp_pick
	BCS +
	RTS                          ; no reachable target
+	STA.l !fl_tp_target          ; slot index
	TAX
	JSR fl_tp_entity
	LDA.l !fl_tp_e_species
	STA.l !fl_tp_species
	LDA.w #$0000
	STA.l !fl_tp_age
	STA.l !fl_tp_queued
	STA.l !fl_tp_arrived
	STA.l !fl_tp_sounded
	JSR fl_bind_clock
	STA.l !fl_tp_clock
	JSR fl_hero_facing
	STA.l !fl_tp_facing
	LDA.w #$0001
	STA.l !fl_tp_act
	JSR fl_bind_cancel           ; cancelCombat(): combat ends its action
	LDA.w !fl_events
	ORA.w #!FLE_TELEPORT
	STA.w !fl_events
	SEC
	RTS

; mod.facing from the hero's native direction ($E010): 0 down, 1 right,
; 2 left, 3 up.
fl_hero_facing:
	LDA $E010
	AND.w #$00FF
	BIT.w #$007F
	BNE +
	LDA.w #3                     ; 0: up
	RTS
+	PHA
	AND.w #$007F
	CMP.w #$0001
	PLA
	BNE +
	LDA.w #0                     ; 1: down
	RTS
+	AND.w #$0080
	BEQ +
	LDA.w #2                     ; $8x: left
	RTS
+	LDA.w #1                     ; right
	RTS
; native direction byte for a facing (0 down, 1 right, 2 left, 3 up)
fl_facing_native:
	db $01, $02, $82, $00

; Advance by elapsed video frames, capped at four like combat's clock.
; Rendering/AI lag must not stretch the vanish and recovery animation.
; Camera streaming still holds age 4 until its rows have arrived.
fl_tp_advance:
	JSR fl_bind_clock
	PHA
	SEC
	SBC.l !fl_tp_clock
	BNE .elapsed
	LDA.l !fl_tp_age
	BEQ .first                   ; a new action advances on the press frame
	PLA
	RTS
.first
	LDA.w #1
.elapsed
	CMP.w #5
	BCC +
	LDA.w #4
+	CLC
	ADC.l !fl_tp_age
	STA.l !fl_tp_age
	PLA
	STA.l !fl_tp_clock
	LDA.l !fl_tp_arrived
	BNE .arrived
	LDA.l !fl_tp_age
	CMP.w #4
	BCC .end
	JSR fl_tp_finish
.arrived
	LDA.w !fl_hook
	AND.w #!FLH_CAMERA
	BEQ .free
	LDA.w #4                     ; hold age 4 until the camera arrives
	STA.l !fl_tp_age
	BRA .end
.free
	LDA.l !fl_tp_sounded
	BNE .end
	LDA.l !fl_tp_age
	CMP.w #6
	BCC .end
	LDA.w #$0001
	STA.l !fl_tp_sounded
	LDA.w !fl_events
	ORA.w #!FLE_TELEPORT_IN
	STA.w !fl_events
.end
	LDA.l !fl_tp_age
	CMP.w #!TP_DURATION
	BCC .done
	LDA.w #$0000
	STA.l !fl_tp_act
	LDA.l !fl_tp_queued
	BEQ .done
	JMP fl_tp_start
.done
	RTS

; finishTeleport: land beside the target if it is still the same live foe.
fl_tp_finish:
	LDA.w #$0001
	STA.l !fl_tp_arrived
	LDA.l !fl_tp_target
	TAX
	JSR fl_tp_entity
	BCS +
	RTS                          ; gone, dead or replaced
+	LDA.l !fl_tp_e_species
	CMP.l !fl_tp_species
	BEQ +
	RTS
+	JSR fl_tp_landing
	BCS +
	RTS
+	LDA.l !fl_tp_l_x
	STA $E002
	LDA.l !fl_tp_l_y
	STA $E004
	SEP #$20
	LDA.l !fl_tp_l_terr
	STA $E00B
	STZ $E006
	STZ $E007
	STZ $E045
	REP #$20
	LDA.l !fl_tp_l_facing
	STA.l !fl_tp_facing
	TAX
	SEP #$20
	LDA.l fl_facing_native,X
	STA $E010
	REP #$20
	LDA.l !fl_tp_target
	STA.l !fl_tp_last
	; localFlight = landing.air, localLift = air ? 12 : 0
	SEP #$20
	LDA.b #!FLS_FLY|!FLS_HOVERED
	TRB.w !fl_state
	STZ.w !fl_lift
	LDA.l !fl_tp_l_air
	BEQ +
	LDA.b #!FLS_FLY
	TSB.w !fl_state
	LDA.b #12
	STA.w !fl_lift
+	REP #$20
	; localFlightHook.restore(): no anchor, no crossing, fresh travel
	JSR fl_anchor_none
	JSR fl_crossing_none
	STZ.w !fl_travel_x
	STZ.w !fl_travel_y
	JSR fl_cache_clear
	; teleport.follow(landing): companions, then the camera
	LDA.l !fl_tp_l_x
	STA.w !fl_t0
	LDA.l !fl_tp_l_y
	STA.w !fl_t1
	LDA.l !fl_tp_l_terr
	STA.w !fl_t2
	JSR fl_gather
	LDA.l !fl_tp_l_y
	TAY
	LDA.l !fl_tp_l_x
	TAX
	LDA.l !fl_tp_l_terr
	JMP fl_camera_follow

; ---------------------------------------------------------------------------
; Targets. fl_tp_entity: X = slot index (3-11, or 12 for the custom one).
; Carry set when it is a live foe; fills fl_tp_e_* (x, y, terrain, species,
; airborne).
fl_tp_entity:
	CPX.w #12
	BCC .actor
	; custom target (Frieza): index 12
	LDA.l !fl_tp_custom
	AND.w #$00FF
	CMP.w #2
	BNE .no
	JMP fl_tp_custom_fill
.actor
	CPX.w #3
	BNE .native
	; Vegeta stands in for slot 3 while the scene module says so
	LDA.l !fl_tp_custom
	AND.w #$00FF
	CMP.w #3
	BNE .native
	JMP fl_tp_custom_fill
.native
	TXA
	XBA
	ASL
	TAX                          ; base offset = index * $200
	LDA.l $7EE000,X
	AND.w #$0001
	BEQ .no
	LDA.l $7EE180,X
	AND.w #$00FF
	CMP.w #$0080
	BCS .no
	CMP.w #$0055
	BEQ .no
	STA.l !fl_tp_e_species
	LDA.l $7EE182,X
	BEQ .no
	LDA.l $7EE191,X
	AND.w #$0080
	BNE .no
	LDA.l $7EE002,X
	STA.l !fl_tp_e_x
	LDA.l $7EE004,X
	STA.l !fl_tp_e_y
	LDA.l $7EE00B,X
	AND.w #$00FF
	STA.l !fl_tp_e_terr
	LDA.w #$0000
	STA.l !fl_tp_e_air
	SEC
	RTS
.no
	CLC
	RTS
fl_tp_custom_fill:
	LDA.l !fl_tp_custom+2
	STA.l !fl_tp_e_x
	LDA.l !fl_tp_custom+4
	STA.l !fl_tp_e_y
	LDA.l !fl_tp_custom+6
	AND.w #$00FF
	STA.l !fl_tp_e_terr
	LDA.l !fl_tp_custom+7
	AND.w #$00FF
	STA.l !fl_tp_e_air
	LDA.l !fl_tp_custom+1        ; Frieza 121, Vegeta 46
	AND.w #$00FF
	STA.l !fl_tp_e_species
	SEC
	RTS

; Pick the target: the nearest reachable foe the first time on this map,
; afterwards the first reachable slot after the last target (wrapping).
; Carry set with A = slot index.
fl_tp_pick:
	LDA.l !fl_tp_last
	CMP.w #3
	BCC .nearest
	CMP.w #13
	BCS .nearest
	JMP .next
.nearest
	; nearest first: repeatedly take the nearest untried foe (ties: lower
	; slot, as the browser's stable sort) until one has a landing
	LDA.w #$0000
	STA.l !fl_tp_tried
.near
	LDA.w #$FFFF
	STA.l !fl_tp_best_d
	STA.l !fl_tp_best_d+2
	STA.l !fl_tp_best_i
	LDX.w #3
.scan
	PHX
	JSR fl_tp_bit
	AND.l !fl_tp_tried
	BNE .skip
	JSR fl_tp_entity
	BCC .skip
	JSR fl_tp_dist2              ; fl_t0/t1 = squared distance (32-bit)
	LDA.w !fl_t1
	CMP.l !fl_tp_best_d+2
	BCC .better
	BNE .skip
	LDA.w !fl_t0
	CMP.l !fl_tp_best_d
	BCS .skip
.better
	LDA.w !fl_t0
	STA.l !fl_tp_best_d
	LDA.w !fl_t1
	STA.l !fl_tp_best_d+2
	LDA $01,S
	STA.l !fl_tp_best_i
.skip
	PLX
	INX
	CPX.w #13
	BCC .scan
	LDA.l !fl_tp_best_i
	BMI .none
	; mark tried, test its landing
	TAX
	JSR fl_tp_bit
	ORA.l !fl_tp_tried
	STA.l !fl_tp_tried
	JSR fl_tp_entity
	JSR fl_tp_landing
	BCC .near
	LDA.l !fl_tp_best_i
	SEC
	RTS
.none
	CLC
	RTS
.next
	; slots after the last one, then from the first
	INC
	STA.l !fl_tp_best_i
	LDA.w #10                    ; at most every slot once
	STA.l !fl_tp_best_d
.try
	LDA.l !fl_tp_best_i
	CMP.w #13
	BCC +
	LDA.w #3
	STA.l !fl_tp_best_i
+	TAX
	JSR fl_tp_entity
	BCC .nexti
	JSR fl_tp_landing
	BCC .nexti
	LDA.l !fl_tp_best_i
	SEC
	RTS
.nexti
	LDA.l !fl_tp_best_i
	INC
	STA.l !fl_tp_best_i
	LDA.l !fl_tp_best_d
	DEC
	STA.l !fl_tp_best_d
	BNE .try
	CLC
	RTS
; A = 1 << X (slot 0-15). Preserves X.
fl_tp_bit:
	PHX
	TXA
	ASL
	TAX
	LDA.l .bits,X
	PLX
	RTS
.bits
	dw $0001, $0002, $0004, $0008, $0010, $0020, $0040, $0080
	dw $0100, $0200, $0400, $0800, $1000, $2000, $4000, $8000

; squared distance from the origin to fl_tp_e_x/y -> fl_t0 (low), fl_t1 (high)
fl_tp_dist2:
	LDA.l !fl_tp_e_x
	SEC
	SBC.l !fl_tp_ox
	JSR fl_mul_sq
	STA.w !fl_t0
	STX.w !fl_t1
	LDA.l !fl_tp_e_y
	SEC
	SBC.l !fl_tp_oy
	JSR fl_mul_sq
	CLC
	ADC.w !fl_t0
	STA.w !fl_t0
	TXA
	ADC.w !fl_t1
	STA.w !fl_t1
	RTS
; A = signed value -> A (low) / X (high) of its square (|A| < 2048)
fl_mul_sq:
	BPL +
	EOR.w #$FFFF
	INC
+	STA.w !fl_t2
	; (h*256 + l)^2 = h^2*65536 + 2*h*l*256 + l^2 with the 8x8 multiplier
	SEP #$20
	LDA.w !fl_t2
	STA.l $004202
	STA.l $004203
	REP #$20
	NOP : NOP : NOP : NOP
	LDA.l $004216
	STA.w !fl_t3                 ; l^2
	SEP #$20
	LDA.w !fl_t2+1
	STA.l $004202
	STA.l $004203
	REP #$20
	NOP : NOP : NOP : NOP
	LDA.l $004216
	STA.w !fl_t4                 ; h^2
	SEP #$20
	LDA.w !fl_t2
	STA.l $004202
	LDA.w !fl_t2+1
	STA.l $004203
	REP #$20
	NOP : NOP : NOP : NOP
	LDA.l $004216                ; h*l
	ASL                          ; 2*h*l (h <= 7 so no overflow)
	XBA
	PHA
	AND.w #$FF00
	CLC
	ADC.w !fl_t3
	STA.w !fl_t3
	PLA
	AND.w #$00FF
	ADC.w !fl_t4
	TAX
	LDA.w !fl_t3
	RTS

; ---------------------------------------------------------------------------
; findLanding(target, origin) (native-teleport.js): target fl_tp_e_*,
; origin fl_tp_o_x/y. Carry set with fl_tp_l_x/y/terr/facing/air.
fl_tp_landing:
	LDA.l !fl_tp_e_terr
	AND.w #$0080
	BEQ +
	LDA.w #$0001
+	STA.w !fl_q_l
	; preferred direction: away from the target toward the origin
	LDA.l !fl_tp_ox
	SEC
	SBC.l !fl_tp_e_x
	STA.w !fl_t0                 ; ox
	JSR fl_abs
	STA.w !fl_t2
	LDA.l !fl_tp_oy
	SEC
	SBC.l !fl_tp_e_y
	STA.w !fl_t1                 ; oy
	JSR fl_abs
	CMP.w !fl_t2
	BEQ .horiz
	BCC .horiz
	; vertical: [0, sign(oy) || 1]
	LDA.w !fl_t1
	BMI +
	LDA.w #2                     ; (0,1)
	BRA .pref
+	LDA.w #3                     ; (0,-1)
	BRA .pref
.horiz
	LDA.w !fl_t0
	BMI +
	LDA.w #0                     ; (1,0) (sign 0 -> 1)
	BRA .pref
+	LDA.w #1                     ; (-1,0)
.pref
	STA.w !fl_tp_pref
	LDX.w #0
.dist
	PHX                          ; [distance index]
	LDA.l fl_tp_distances,X
	AND.w #$00FF
	STA.w !fl_tp_dist
	; preferred direction first, then [1,0] [-1,0] [0,1] [0,-1] without it
	LDA.w !fl_tp_pref
	JSR fl_tp_candidate
	BCS .found
	LDY.w #0
.dir
	CPY.w !fl_tp_pref
	BEQ .dnext
	PHY
	TYA
	JSR fl_tp_candidate
	PLY
	BCS .found
.dnext
	INY
	CPY.w #4
	BCC .dir
	PLX
	INX
	CPX.w #7
	BCC .dist
	CLC
	RTS
.found
	PLX
	SEC
	RTS
fl_tp_distances:
	db 26, 22, 18, 32, 38, 46, 54
; direction table: dx, dy (bytes) for 0:(1,0) 1:(-1,0) 2:(0,1) 3:(0,-1)
fl_tp_dirs:
	db 1, 0, $FF, 0, 0, 1, 0, $FF
fl_abs:
	BPL +
	EOR.w #$FFFF
	INC
+	RTS

; One candidate: A = direction (0-3), distance fl_tp_dist. Carry = landing.
fl_tp_candidate:
	STA.w !fl_tp_dir
	ASL
	TAX
	LDA.l fl_tp_dirs,X
	AND.w #$00FF
	BIT.w #$0080
	BEQ +
	ORA.w #$FF00
+	STA.w !fl_tp_dx
	LDA.l fl_tp_dirs+1,X
	AND.w #$00FF
	BIT.w #$0080
	BEQ +
	ORA.w #$FF00
+	STA.w !fl_tp_dy
	; the spot
	LDA.w !fl_tp_dist
	JSR fl_tp_point
	LDA.w #$0000
	JSR fl_tp_clear
	BCS +
	RTS
+	; connected: every 4 px from 6 to the spot, stairs allowed
	; For ordinary ground targets those overlapping footprints form one
	; tile rectangle. Test each cell once. Pixel-dependent holes and the
	; airborne land-or-fly rule retain the individual sample queries.
	LDA.l !fl_tp_e_air
	BNE .samples
	LDA.w !fl_mflags
	AND.w #!FLM_HOLES
	BNE .samples
	LDA $DC
	CMP.w !fl_map
	BNE .samples
	JSR fl_tp_ground_path
	BCS .ok
	RTS
.samples
	LDA.w #6
.conn
	CMP.w !fl_tp_dist
	BCS .ok
	PHA
	JSR fl_tp_point
	LDA.w #$0001
	JSR fl_tp_clear
	PLA
	BCS +
	RTS                          ; carry clear
+	CLC
	ADC.w #4
	BRA .conn
.ok
	; the spot again; terrain from its floor height
	LDA.w !fl_tp_dist
	JSR fl_tp_point
	LDA.w !fl_q_x
	STA.l !fl_tp_l_x
	LDA.w !fl_q_y
	STA.l !fl_tp_l_y
	LDA.l !fl_tp_e_terr
	STA.l !fl_tp_l_terr
	JSR fl_q_tile
	BCS .terr
	JSR fl_fetch
	LDA.w !fl_d_flags
	AND.w #$0003
	BEQ .terr
	CMP.w #$0003
	BEQ .terr
	STA.w !fl_t0
	LDA.l !fl_tp_e_terr
	AND.w #$00FC
	ORA.w !fl_t0
	STA.l !fl_tp_l_terr
.terr
	; airborne (Frieza): hover where Goku cannot land
	LDA.w #$0000
	STA.l !fl_tp_l_air
	LDA.l !fl_tp_e_air
	BEQ .facing
	LDA.l !fl_tp_l_terr
	AND.w #$0003
	STA.w !fl_q_t
	JSR fl_can_land
	BCS .facing
	LDA.w #$0001
	STA.l !fl_tp_l_air
.facing
	; facing the target: dx<0 right, dx>0 left, dy<0 down, else up
	LDA.w !fl_tp_dx
	BMI .fr
	BNE .fl
	LDA.w !fl_tp_dy
	BMI .fd
	LDA.w #3
	BRA .fset
.fr
	LDA.w #1
	BRA .fset
.fl
	LDA.w #2
	BRA .fset
.fd
	LDA.w #0
.fset
	STA.l !fl_tp_l_facing
	SEC
	RTS

; Connected ground footprints at distances 6,10,... < fl_tp_dist.
; The steps overlap on one axis, so their tile sets equal the bounding
; rectangle of the first and last footprint. Bounds are convex as well.
; No hole provider or airborne target reaches this helper.
fl_tp_ground_path:
	LDA.w #6
	JSR fl_tp_point
	JSR fl_fp_bounds
	BCS +
	RTS
+	JSR fl_fp_rect
	LDA.w !fl_t0 : PHA           ; first footprint: col0,col1,row0,row1
	LDA.w !fl_t1 : PHA
	LDA.w !fl_t2 : PHA
	LDA.w !fl_t3 : PHA
	LDA.w !fl_tp_dist
	SEC
	SBC.w #7
	AND.w #$FFFC
	CLC
	ADC.w #6                    ; last 6+4k strictly below the distance
	JSR fl_tp_point
	JSR fl_fp_bounds
	BCS .rect
	PLA : PLA : PLA : PLA
	CLC
	RTS
.rect
	JSR fl_fp_rect
	PLA                         ; max row1
	CMP.w !fl_t3
	BCC +
	STA.w !fl_t3
+	PLA                         ; min row0
	CMP.w !fl_t2
	BCS +
	STA.w !fl_t2
+	PLA                         ; max col1
	CMP.w !fl_t1
	BCC +
	STA.w !fl_t1
+	PLA                         ; min col0
	CMP.w !fl_t0
	BCS +
	STA.w !fl_t0
+	; Keep bounds on the stack: classification uses fl_t0..fl_t7.
	LDA.w !fl_t1 : PHA           ; col1
	LDA.w !fl_t3 : PHA           ; row1
	LDA.w !fl_t0 : PHA           ; col0
	LDA.w !fl_t2
.row
	PHA                         ; row,col0,row1,col1
	XBA
	LSR
	LDY.w !fl_q_l
	BEQ +
	ORA.w #$4000
+	ORA $03,S
	TAX
.col
	JSR fl_class
	BIT.w #!FLC_LANDB
	BEQ .fail
	BIT.w #!FLC_H1|!FLC_H2
	BEQ .extra
	AND.w #!FLC_H1
	BEQ .h2
	LDA.w !fl_q_t
	CMP.w #2
	BEQ .fail
	BRA .extra
.h2
	LDA.w !fl_q_t
	CMP.w #1
	BEQ .fail
.extra
	; Same stairs-allowed checks as fl_tp_clear, on the same cells.
	JSR fl_fetch
	LDA.w !fl_d_flags
	AND.w #7
	CMP.w #3
	BCS .fail
	LDA.w !fl_d_beh
	AND.w #$0010
	BNE .fail
	TXA
	AND.w #$007F
	CMP $07,S
	BEQ .rowdone
	INX
	BRA .col
.rowdone
	PLA
	CMP $03,S
	BEQ .done
	INC
	BRA .row
.done
	PLA : PLA : PLA
	SEC
	RTS
.fail
	PLA : PLA : PLA : PLA
	CLC
	RTS

; fl_q_x/y = target + direction * A (rounded: integers already)
fl_tp_point:
	STA.w !fl_t3
	LDA.w !fl_tp_dx
	BEQ .x0
	BMI .xn
	LDA.l !fl_tp_e_x
	CLC
	ADC.w !fl_t3
	BRA .xs
.xn
	LDA.l !fl_tp_e_x
	SEC
	SBC.w !fl_t3
	BRA .xs
.x0
	LDA.l !fl_tp_e_x
.xs
	STA.w !fl_q_x
	LDA.w !fl_tp_dy
	BEQ .y0
	BMI .yn
	LDA.l !fl_tp_e_y
	CLC
	ADC.w !fl_t3
	BRA .ys
.yn
	LDA.l !fl_tp_e_y
	SEC
	SBC.w !fl_t3
	BRA .ys
.y0
	LDA.l !fl_tp_e_y
.ys
	STA.w !fl_q_y
	RTS

; clear(x, y, stairs) of findLanding: A = 1 allows stairs. Landable (or,
; for an airborne target, flyable), and no sample cell is a door, trigger
; or layer seam ($90; $10 with stairs), higher than 2, or (without stairs) a
; stair cell (code 2x).
fl_tp_clear:
	STA.w !fl_tp_stairs
	LDA.l !fl_tp_e_terr
	AND.w #$0003
	STA.w !fl_q_t
	LDA.w !fl_q_x : PHA
	LDA.w !fl_q_y : PHA
	JSR fl_can_land
	BCS .cells
	LDA.l !fl_tp_e_air
	BEQ .nopull
	LDA $03,S
	STA.w !fl_q_x
	LDA $01,S
	STA.w !fl_q_y
	JSR fl_can_fly
	BCS .cells
.nopull
	PLA
	PLA
	CLC
	RTS
.cells
	PLA : STA.w !fl_q_y
	PLA : STA.w !fl_q_x
	JSR fl_fp_rect
	LDA.w !fl_t2
	PHA                          ; [row]
.row
	LDA.w !fl_t0
	PHA                          ; [col][row]
.col
	LDA $03,S
	XBA
	LSR
	ORA $01,S
	LDY.w !fl_q_l
	BEQ +
	ORA.w #$4000
+	TAX
	JSR fl_fetch
	LDA.w !fl_d_flags
	AND.w #$0007
	CMP.w #$0003
	BCS .fail
	LDA.w !fl_tp_stairs
	BNE .st
	LDA.w !fl_d_beh
	AND.w #$0090
	BNE .fail
	LDA.w !fl_d_code
	AND.w #$00F0
	CMP.w #$0020
	BEQ .fail
	BRA .cok
.st
	LDA.w !fl_d_beh
	AND.w #$0010
	BNE .fail
.cok
	LDA $01,S
	CMP.w !fl_t1
	BEQ .rowdone
	INC
	STA $01,S
	BRA .col
.rowdone
	PLA
	LDA $01,S
	CMP.w !fl_t3
	BEQ .done
	INC
	STA $01,S
	BRA .row
.done
	PLA
	SEC
	RTS
.fail
	PLA
	PLA
	CLC
	RTS

; X = idx of the tile under fl_q_x/y on fl_q_l (pixel bounds). Carry set
; when outside the map.
fl_q_tile:
	LDA.w !fl_q_x
	CMP.w !fl_wpx
	BCS .out
	LDA.w !fl_q_y
	CMP.w !fl_hpx
	BCS .out
	AND.w #$FFF0
	ASL : ASL : ASL
	STA.w !fl_t5
	LDA.w !fl_q_x
	LSR : LSR : LSR : LSR
	ORA.w !fl_t5
	LDY.w !fl_q_l
	BEQ +
	ORA.w #$4000
+	TAX
	CLC
	RTS
.out
	SEC
	RTS
