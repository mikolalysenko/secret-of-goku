; Flight test mailbox (FLIGHT_TEST builds only), polled at the start of
; flight_frame. Lua writes the request at !fl_sram_test:
;   +$00 word command: 1 = classify one map row, 2 = camera follow at the
;        hero, 3 = forget the anchor/crossing (localFlightHook.restore()),
;        4 = Instant Transmission landings (fl_test_landing),
;        5 = the ceiling escape's roof colours (fl_ce_colors)
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
	BEQ .row
	CMP.w #$0004
	BNE +
	JMP fl_test_landing
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
+	RTS
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
