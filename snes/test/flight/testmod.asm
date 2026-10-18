; A floor-hole provider for tests (the contract Frieza's deck and the
; Sandship wreck will use), in builds with -DFLIGHT_TEST_HOLES: a hole
; rectangle in map pixels at SRAM $33:7A96 (word enable, +2 x0, +4 x1,
; +6 y0, +8 y1, inclusive), outside the mailbox (the classifier's rows fill
; it). Other test builds keep the cartridge's own memos and timing.
if defined("FLIGHT_TEST_HOLES")
	!FLIGHT_MISSING_FLOOR = fl_test_hole
	!FLIGHT_FLOOR_ANYWHERE = 1   ; on any map, not only !FLM_HOLES ones
endif
!fl_test_hole_rect = !FL_SRAM+$296

; Flight test mailbox (FLIGHT_TEST builds only), polled at the start of
; flight_frame. Lua writes the request at !fl_sram_test:
;   +$00 word command: 1 = classify one map row, 2 = camera follow at the
;        hero, 3 = forget the anchor/crossing (localFlightHook.restore()),
;        4 = Instant Transmission landings (fl_test_landing),
;        5 = the ceiling escape's roof colours (fl_ce_colors),
;        6 = opening exits (fl_test_exits), 7 = sweeps (fl_test_sweeps),
;        8 = the canLand services (fl_test_api_land), 9 = a walk of the
;        on-foot canLand/canFly at the hero (fl_test_walk)
;   +$02 word layer (0/1), +$04 word row (tile y)
;   +$06 word completion counter (incremented when a request is done)
;   +$08 word map width in tiles (written back), +$0A height
;   +$10.. one byte per tile x of the row: bit0 canFly(centre),
;          bits 1-4 canLand(centre, terrain 0-3), bit5 lowObstacle(tile),
;          bit7 = 1
; The map context is reloaded first, so imported states need no warm-up.
fl_test_poll:
	LDA.l !fl_sram_test
	CMP.w #$0001
	BNE +
	JMP .row
+	CMP.w #$0004
	BNE +
	JMP fl_test_landing
+	CMP.w #$0007
	BNE +
	JMP fl_test_sweeps
+	CMP.w #$0008
	BNE +
	JMP fl_test_api_land
+	CMP.w #$0009
	BNE +
	JMP fl_test_walk
+	CMP.w #$0006
	BNE +
	JMP fl_test_exits
+	CMP.w #$0005
	BNE +
	; 5 = roofColors(): +$02 stone, +$04 highlight (ceiling.asm)
	JSR fl_ce_colors
	LDA.w !fl_t0
	STA.l !fl_sram_test+$02
	LDA.w !fl_t1
	STA.l !fl_sram_test+$04
	JMP .ack5
+	CMP.w #$0003
	BNE +
	; 3 = localFlightHook.restore(): no anchor or crossing, fresh travel
	JSR fl_anchor_none
	JSR fl_crossing_none
	STZ.w !fl_travel_x
	STZ.w !fl_travel_y
	LDA.w #$FFFF
	STA.w !fl_vframe
	JSR fl_cache_clear
	BRA .ack
+	CMP.w #$0002
	BNE +
	; 2 = teleport.follow() at the hero (companions, camera)
	JSR fl_ctx_load
	JSR fl_camera_follow_hero
.ack
.ack5
	LDA.w #$0000
	STA.l !fl_sram_test
	LDA.l !fl_sram_test+$06
	INC
	STA.l !fl_sram_test+$06
	RTS
+	; anything else is what the battery kept (no request): drop it
	LDA.w #$0000
	STA.l !fl_sram_test
	RTS
.row
	JSR fl_ctx_load
	LDA.w !fl_W
	STA.l !fl_sram_test+$08
	LDA.w !fl_H
	STA.l !fl_sram_test+$0A
	LDA.l !fl_sram_test+$02
	STA.w !fl_q_l
	LDX.w #$0000
.tile
	CPX.w !fl_W
	BCC +
	JMP .done
+	PHX
	; centre of tile (x, row)
	TXA
	ASL : ASL : ASL : ASL
	CLC
	ADC.w #8
	STA.w !fl_q_x
	LDA.l !fl_sram_test+$04
	ASL : ASL : ASL : ASL
	CLC
	ADC.w #8
	STA.w !fl_q_y
	LDA.w #$0080
	PHA                          ; [result][x]
	JSR fl_can_fly
	BCC +
	LDA $01,S
	ORA.w #$0001
	STA $01,S
+	LDA.w #$0000
.terrain
	PHA                          ; [T][result][x]
	STA.w !fl_q_t
	LDA.l !fl_sram_test+$04
	ASL : ASL : ASL : ASL
	CLC
	ADC.w #8
	STA.w !fl_q_y
	LDA $05,S
	ASL : ASL : ASL : ASL
	CLC
	ADC.w #8
	STA.w !fl_q_x
	JSR fl_can_land
	PLA
	BCC +
	PHA
	TAX
	LDA.l fl_test_landbit,X
	AND.w #$00FF
	ORA $03,S
	STA $03,S
	PLA
+	INC
	CMP.w #4
	BCC .terrain
	; lowObstacle(tileAt(centre))
	LDA $03,S
	TAX
	LDA.l !fl_sram_test+$04
	XBA
	LSR
	STA.w !fl_t0
	TXA
	ORA.w !fl_t0
	LDY.w !fl_q_l
	BEQ +
	ORA.w #$4000
+	TAX
	JSR fl_low
	BCC +
	LDA $01,S
	ORA.w #$0020
	STA $01,S
+	PLA                          ; result
	PLX
	PHX
	SEP #$20
	STA.l !fl_sram_test+$10,X
	REP #$20
	PLX
	INX
	JMP .tile
.done
	LDA.w #$0000
	STA.l !fl_sram_test
	LDA.l !fl_sram_test+$06
	INC
	STA.l !fl_sram_test+$06
	RTS
fl_test_landbit:
	db $02, $04, $08, $10

; 4 = findLanding() for +$02 (1-8) queries of 16 bytes at +$10:
;   in  +0 target x, +2 target y, +4 origin x, +6 origin y,
;       +8 byte target terrain (E00B), +9 byte airborne (Frieza)
;   out +10 x, +12 y, +14 byte terrain, +15 byte bit0 found, bits 1-2
;       facing, bit 3 hovering
fl_test_landing:
	JSR fl_ctx_load
	LDX.w #$0000
.q
	TXA
	LSR : LSR : LSR : LSR
	CMP.l !fl_sram_test+$02
	BCC +
	JMP .done
+	PHX
	LDA.l !fl_sram_test+$10,X
	STA.l !fl_tp_e_x
	LDA.l !fl_sram_test+$12,X
	STA.l !fl_tp_e_y
	LDA.l !fl_sram_test+$14,X
	STA.l !fl_tp_ox
	LDA.l !fl_sram_test+$16,X
	STA.l !fl_tp_oy
	LDA.l !fl_sram_test+$18,X
	AND.w #$00FF
	STA.l !fl_tp_e_terr
	LDA.l !fl_sram_test+$19,X
	AND.w #$00FF
	STA.l !fl_tp_e_air
	JSR fl_tp_landing
	PLX
	BCS .found
	LDA.w #$0000
	STA.l !fl_sram_test+$1A,X
	STA.l !fl_sram_test+$1C,X
	STA.l !fl_sram_test+$1E,X
	BRA .next
.found
	LDA.l !fl_tp_l_x
	STA.l !fl_sram_test+$1A,X
	LDA.l !fl_tp_l_y
	STA.l !fl_sram_test+$1C,X
	LDA.l !fl_tp_l_facing
	ASL
	ORA.w #$0001
	STA.w !fl_t0
	LDA.l !fl_tp_l_air
	BEQ +
	LDA.w #$0008
	TSB.w !fl_t0
+	LDA.w !fl_t0
	XBA
	STA.w !fl_t0
	LDA.l !fl_tp_l_terr
	AND.w #$00FF
	ORA.w !fl_t0
	STA.l !fl_sram_test+$1E,X
.next
	TXA
	CLC
	ADC.w #16
	TAX
	JMP .q
.done
	LDA.w #$0000
	STA.l !fl_sram_test
	LDA.l !fl_sram_test+$06
	INC
	STA.l !fl_sram_test+$06
	RTS

; 6 = flightExit() for +$02 (1-16) queries of 8 bytes at +$10: in +0 x,
; +2 y, +4 velocity ($1E | $1F << 8); out +6 marker idx or $FFFF. The hero's
; position and velocity are set for each query and restored afterwards.
fl_test_exits:
	JSR fl_ctx_load
	LDA $E002
	PHA
	LDA $E004
	PHA
	LDA $1E
	PHA
	LDX.w #$0000
.q
	TXA
	LSR : LSR : LSR
	CMP.l !fl_sram_test+$02
	BCS .done
	PHX
	LDA.l !fl_sram_test+$10,X
	STA $E002
	LDA.l !fl_sram_test+$12,X
	STA $E004
	LDA.l !fl_sram_test+$14,X
	STA $1E
	JSR fl_flight_exit
	BCS +
	LDA.w #$FFFF
+	PLX
	STA.l !fl_sram_test+$16,X
	TXA
	CLC
	ADC.w #8
	TAX
	BRA .q
.done
	PLA
	STA $1E
	PLA
	STA $E004
	PLA
	STA $E002
	LDA.w #$0000
	STA.l !fl_sram_test
	LDA.l !fl_sram_test+$06
	INC
	STA.l !fl_sram_test+$06
	RTS

; carry = the 12x8 footprint at fl_q_x/y overlaps the test hole
fl_test_hole:
	LDA.l !fl_test_hole_rect
	BEQ .no
	LDA.w !fl_q_x
	CLC
	ADC.w #6
	CMP.l !fl_test_hole_rect+2
	BMI .no                      ; right edge left of the hole
	LDA.w !fl_q_x
	SEC
	SBC.w #6
	CMP.l !fl_test_hole_rect+4
	BEQ +
	BPL .no                      ; left edge right of it
+	LDA.w !fl_q_y
	CLC
	ADC.w #4
	CMP.l !fl_test_hole_rect+6
	BMI .no
	LDA.w !fl_q_y
	SEC
	SBC.w #4
	CMP.l !fl_test_hole_rect+8
	BEQ +
	BPL .no
+	SEC
	RTL
.no
	CLC
	RTL

; 7 = sweep() for +$02 (1-16) queries of 8 bytes at +$10: in +0 x, +2 y,
; +4 byte dx, +5 byte dy (signed), +6 byte layer; out +7 byte 1 pass. Goku
; stands at the start (the hero grid anchors there, as in a movement step);
; his position and layer are restored afterwards.
fl_test_sweeps:
	JSR fl_ctx_load
	LDA $E002
	PHA
	LDA $E004
	PHA
	LDA $E00B
	PHA
	LDX.w #$0000
.q
	TXA
	LSR : LSR : LSR
	CMP.l !fl_sram_test+$02
	BCC +
	JMP .done
+	PHX
	LDA.l !fl_sram_test+$10,X
	STA $E002
	STA.w !fl_sw_x
	LDA.l !fl_sram_test+$12,X
	STA $E004
	STA.w !fl_sw_y
	LDA.l !fl_sram_test+$14,X
	AND.w #$00FF
	BIT.w #$0080
	BEQ +
	ORA.w #$FF00
+	STA.w !fl_sw_dx
	LDA.l !fl_sram_test+$15,X
	AND.w #$00FF
	BIT.w #$0080
	BEQ +
	ORA.w #$FF00
+	STA.w !fl_sw_dy
	LDA.l !fl_sram_test+$16,X
	AND.w #$0001
	STA.w !fl_q_l
	SEP #$20
	LDA $E00B
	AND.b #$7F
	STA $E00B
	LDA.w !fl_q_l
	BEQ +
	LDA $E00B
	ORA.b #$80
	STA $E00B
+	REP #$20
	LDA.w #$0001
	STA.l !fl_g_stale            ; re-anchor the grid at Goku
	JSR fl_sweep_forget
	JSR fl_grid_reset
	JSR fl_sweep
	LDA.w #$0000
	ROL
	PLX
	SEP #$20
	STA.l !fl_sram_test+$17,X
	REP #$20
	TXA
	CLC
	ADC.w #8
	TAX
	JMP .q
.done
	PLA
	STA $E00B
	PLA
	STA $E004
	PLA
	STA $E002
	LDA.w #$0000
	STA.l !fl_sram_test
	LDA.l !fl_sram_test+$06
	INC
	STA.l !fl_sram_test+$06
	RTS

; 8 = the canLand services (api.asm) for +$02 (1-12) queries of 8 bytes at
; +$10: in +0 x, +2 y, +4 byte terrain byte (bit 7 layer), +5 byte 1 = at
; Goku's own terrain (!FLIGHT_API_CAN_LAND), 0 = with the terrain byte
; (!FLIGHT_API_CAN_LAND_T); out +6 byte 1 = canLand, +7 byte 1 = X, Y, DB
; and D came back as passed. Called with DB = $00 and D = $0123: the
; services must not depend on either.
fl_test_api_land:
	LDX.w #$0000
.q
	TXA
	LSR : LSR : LSR
	CMP.l !fl_sram_test+$02
	BCC +
	JMP .done
+	PHX                          ; [off]
	LDA.l !fl_sram_test+$12,X
	PHA                          ; [y][off]
	LDA.l !fl_sram_test+$10,X
	PHA                          ; [x][y][off]
	LDA.l !fl_sram_test+$14,X
	AND.w #$00FF
	PHA                          ; [terr][x][y][off]
	LDA.l !fl_sram_test+$15,X
	AND.w #$00FF
	PHA                          ; [mode][terr][x][y][off]
	LDA $03,S
	TAY                          ; Y = terrain byte
	LDA $07,S
	TAX                          ; X = y
	PHB
	PHD                          ; [D][B][mode][terr][x][y][off]
	PEA $0000
	PLB
	PLB
	PEA $0123
	PLD
	LDA $04,S
	BEQ .t
	LDA $08,S
	JSL flight_api_can_land
	BRA .got
.t
	LDA $08,S
	JSL flight_api_can_land_t
.got
	PHP                          ; [P][D][B][mode][terr][x][y][off]
	TXA
	CMP $0B,S
	BNE .bad
	TYA
	CMP $07,S
	BNE .bad
	TDC
	CMP.w #$0123
	BNE .bad
	SEP #$20
	PHB
	PLA
	REP #$20
	AND.w #$00FF
	BNE .bad
	LDY.w #$0100
	BRA +
.bad
	LDY.w #$0000
+	PLP
	PLD
	PLB                          ; flight's DB and D again (carry kept)
	LDA.w #$0000
	ROL
	STY.w !fl_t1
	ORA.w !fl_t1
	PLY : PLY : PLY : PLY
	PLX
	STA.l !fl_sram_test+$16,X
	TXA
	CLC
	ADC.w #8
	TAX
	JMP .q
.done
	LDA.w #$0000
	STA.l !fl_sram_test
	LDA.l !fl_sram_test+$06
	INC
	STA.l !fl_sram_test+$06
	RTS

; Carry: a mailbox request or test posts are pending, so flight_frame's walk
; and quiet paths hand the frame to the full one (it polls and posts).
fl_test_busy:
	LDA.l !fl_sram_test
	ORA.l !fl_test_post
	ORA.l !fl_test_post+$06
	BEQ +
	SEC
	RTS
+	CLC
	RTS

; Posts at the end of flight_frame, after its clears, as a scene module
; running later in the field frame does (!fl_test_post, Lua writes them):
;   +$00 word frames left to post a camera target (flight_api_camera) at
;        +$02 x, +$04 y
;   +$06 word frames left to post a custom teleport target: the 8 bytes at
;        +$08 go to !fl_tp_custom (kind, species, x, y, terrain, airborne)
fl_test_posts:
	LDA.l !fl_test_post
	BEQ +
	DEC
	STA.l !fl_test_post
	LDA.l !fl_test_post+$04
	TAX
	LDA.l !fl_test_post+$02
	JSL flight_api_camera
+	LDA.l !fl_test_post+$06
	BEQ +
	DEC
	STA.l !fl_test_post+$06
	LDA.l !fl_test_post+$08
	STA.l !fl_tp_custom
	LDA.l !fl_test_post+$0A
	STA.l !fl_tp_custom+2
	LDA.l !fl_test_post+$0C
	STA.l !fl_tp_custom+4
	LDA.l !fl_test_post+$0E
	STA.l !fl_tp_custom+6
+	RTS

; 9 = a walk: for +$02 (1-12) hero positions of 8 bytes at +$10 (in +0 x,
; +2 y, +4 byte terrain byte) Goku stands there and settle()'s canLand and
; canFly at the hero are asked as on foot (fl_onfoot: the hero grid moves
; only when the footprint leaves it, keeping the cells it shares); out +6
; byte bit 0 canLand, bit 1 canFly. Consecutive positions a few pixels
; apart walk the grid across the map. Goku's position comes back after.
fl_test_walk:
	JSR fl_ctx_update
	LDA $E002
	PHA
	LDA $E004
	PHA
	LDA $E00B
	PHA
	LDX.w #$0000
.q
	TXA
	LSR : LSR : LSR
	CMP.l !fl_sram_test+$02
	BCC +
	JMP .done
+	PHX
	LDA.l !fl_sram_test+$10,X
	STA $E002
	LDA.l !fl_sram_test+$12,X
	STA $E004
	SEP #$20
	LDA.l !fl_sram_test+$14,X
	STA $E00B
	REP #$20
	LDA.w #$0000
	STA.l !fl_g_chk              ; a new phase
	LDA.w #$FFFF
	STA.l !fl_hm_land+4
	STA.l !fl_hm_fly+4
	LDA.w #$0002
	STA.l !fl_g_stale
	JSR fl_hero_land_foot
	LDA.w #$0000
	ROL
	PHA
	JSR fl_hero_fly
	BCC +
	LDA $01,S
	ORA.w #$0002
	STA $01,S
+	PLA
	PLX
	SEP #$20
	STA.l !fl_sram_test+$16,X
	REP #$20
	TXA
	CLC
	ADC.w #8
	TAX
	JMP .q
.done
	PLA
	STA $E00B
	PLA
	STA $E004
	PLA
	STA $E002
	LDA.w #$0000
	STA.l !fl_sram_test
	LDA.l !fl_sram_test+$06
	INC
	STA.l !fl_sram_test+$06
	RTS
