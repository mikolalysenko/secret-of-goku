; Flight test mailbox (FLIGHT_TEST builds only), polled at the start of
; flight_frame. Lua writes the request at !fl_sram_test:
;   +$00 word command: 1 = classify one map row
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
	CMP.w #$0002
	BNE +
	; 2 = teleport.follow() at the hero (companions, camera)
	JSR fl_ctx_load
	JSR fl_camera_follow_hero
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
