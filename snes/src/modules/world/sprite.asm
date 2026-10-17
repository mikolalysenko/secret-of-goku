; Goku's Mode 7 flight sprite (engine/goku-animation.js pose() kind
; 'flight', engine/sprite-layer.js flight placement): rear view (row 3) of
; the four-frame flight clip, charge pose with hanging (hover) legs, the
; air-beam cell, discrete banking (2 px per held direction) and a one-pixel
; bob, at (112 + bank*2, 68 + bob) as a 32x32 of four 16x16 OBJ; a small
; pixel shadow replaces the native window. Cells and palettes come from the
; goku module (goku_api_cell, goku_legs_index, goku_cell_tiles/_mask/_pal).

; Choose the cell, banking and bob for this frame. M16/X16, DB = $7E.
world_pose:
	LDA.w !goku_form
	AND.w #$0001
	STA.w !w_form
	INC.w !w_anim_age
	; banking follows the held direction (engine input bits Left/Right)
	LDA.w !w_input
	AND.w #!PAD_LEFT|!PAD_RIGHT
	CMP.w #!PAD_LEFT
	BNE +
	LDA.w #$FFFF
	BRA ++
+	CMP.w #!PAD_RIGHT
	BNE +
	LDA.w #$0001
	BRA ++
+	LDA.w #$0000
++	STA.w !w_bank
	; flight clip (track(): 4 frames of 7 ticks, SSJ 5), kept incrementally
	LDX.w #7
	LDA.w !w_form
	BEQ +
	LDX.w #5
+	STX.w !w_scratch
	INC.w !w_anim_tick
	LDA.w !w_anim_tick
	CMP.w !w_scratch
	BCC +
	STZ.w !w_anim_tick
	LDA.w !w_anim_frame
	INC
	AND.w #$0003
	STA.w !w_anim_frame
+	; column: charge (with hover legs) > air beam > flight clip
	LDA.w !w_charging
	BEQ .notCharge
	LDX.w #22|$80
	LDA.w !w_form
	BEQ .key
	LDX.w #18|$80
	BRA .key
.notCharge
	LDA.w !w_action_age
	BEQ .flight
	LDX.w #24
	LDA.w !w_form
	BEQ .key
	LDX.w #20
	BRA .key
.flight
	LDA.w !w_anim_frame
	CLC
	ADC.w #40
	TAX
	LDA.w !w_form
	BEQ .key
	TXA
	SEC
	SBC.w #4
	TAX
.key
	; the cell only changes with the form, the column or the legs variant
	TXA
	ASL
	ORA.w !w_form
	CMP.w !w_cell_key
	BNE +
	RTS
+	STA.w !w_cell_key
	TXA
	BIT.w #$0080
	BNE .legs
	LDA.w !w_form
	LDY.w #$0003
	JSL goku_api_cell
	BRA .store
.legs
	; goku_legs_index has the same layout as goku_cell_index
	TXA
	AND.w #$007F
	ASL
	ASL
	STA.w !w_scratch
	LDA.w !w_form
	ASL
	TAX
	LDA.l goku_sheet_base,X
	CLC
	ADC.w !w_scratch
	CLC
	ADC.w #$0003
	ASL
	TAX
	LDA.l goku_legs_index,X
.store
	CMP.w #!GOKU_NONE
	BEQ +
	STA.w !w_cell_want
+	RTS

; A16 mod X16 (both small, positive). M16/X16. Clobbers X.
world_mod:
	STA.l $004204
	TXA
	SEP #$20
	STA.l $004206
	REP #$20
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	LDA.l $004216
	RTS

; Goku's palette (the cell's goku palette id) and the effects palette go
; into the world's two CGRAM buffers ($0600 and the flash copy $DE00, both
; uploaded by C0:8A79), and into CGRAM by world_world_nmi.
world_palettes:
	LDX.w !w_cell_want
	CPX.w #!GOKU_NONE
	BEQ .fx
	LDA.l goku_cell_pal,X
	AND.w #$00FF
	CMP.w !w_pal_form
	BEQ .fx
	STA.w !w_pal_form
	ASL
	ASL
	ASL
	ASL
	ASL
	TAX
	LDY.w #$0000
-	LDA.l goku_palettes,X
	STA.w $0600+$1A0,Y
	STA.w $DE00+$1A0,Y
	INX
	INX
	INY
	INY
	CPY.w #$0020
	BCC -
	LDA.w #$0001
	TSB.w !w_pal_dirty
.fx
	LDA.w !w_frame
	CMP.w #1                         ; once per flight (the field reloads $0600)
	BNE .done
	LDX.w #$001E
-	LDA.l world_fx_palette,X
	STA.w $0600+$1C0,X
	STA.w $DE00+$1C0,X
	DEX
	DEX
	BPL -
	LDA.w #$0002
	TSB.w !w_pal_dirty
.done
	RTS

; Build our OAM entries in slots 0..n-1 (in front of the compass and the
; Fortress); the Flammie builder hook leaves those slots alone and hides
; the rest of 0-63 every frame.
world_draw:
	STZ.w !w_cursor
	LDX.w #$0000                     ; OAM byte cursor
	LDA.w !w_vram_ok
	BNE +
	JMP .finish
+	; high table of slots 0-59: large, x bit 8 clear
	LDA.w #$AAAA
	STA.w $0A00
	STA.w $0A02
	STA.w $0A04
	STA.w $0A06
	STA.w $0A08
	STA.w $0A0A
	STA.w $0A0C
	SEP #$20
	STA.w $0A0E
	REP #$20
	LDA.w !w_fx_state
	CMP.w #8
	BCC +                            ; effect tiles still loading
	JSR world_draw_front             ; drawn over Goku
+	LDX.w !w_cursor
	LDA.w !w_dock
	BEQ .goku
	JSR world_draw_dock
	BRA .shadow
.goku
	LDA.w !w_bank
	ASL
	CLC
	ADC.w #112
	STA.w !w_scratch                 ; x
	LDA.w !w_anim_age
	LSR
	LSR
	LSR
	AND.w #$0003
	CMP.w #$0001
	BNE +
	LDA.w #67
	BRA ++
+	CMP.w #$0003
	BNE +
	LDA.w #69
	BRA ++
+	LDA.w #68
++	STA.w !w_scratch+2               ; y
	JSR world_draw_cell
.shadow
	LDA.w !w_shadow_t
	BEQ .finish
	LDA.w #120
	STA.w !w_scratch
	LDA.w !w_shadow_y
	SEC
	SBC.w #8
	STA.w !w_scratch+2
	LDA.w #!FX_SHADOW
	JSR world_put_fx
.finish
	; hide what we drew last frame beyond this frame's entries
	STX.w !w_scratch+4
	CPX.w !w_oam_used
	BCS .hidden
-	LDA.w #$E0FF
	STA.w $0800,X
	INX
	INX
	INX
	INX
	CPX.w !w_oam_used
	BCC -
.hidden
	LDA.w !w_scratch+4
	STA.w !w_oam_used
	CMP.w #$00F0
	BCC +
	LDA.w #$00F0
+	STA.w !w_oam_reserve
	LDA.w !w_fx_state
	CMP.w #8
	BCC +
	JSR world_draw_back
+	RTS

; The shown cell buffer as four 16x16 OBJ at (w_scratch, w_scratch+2);
; empty quadrants (goku_cell_mask) are skipped. X = OAM cursor (in/out).
world_draw_cell:
	LDA.w !w_cell_show
	ASL
	TAY
	LDA.w !w_cell_buf0,Y
	CMP.w #!GOKU_NONE
	BNE +
	RTS
+	PHX
	TAX
	LDA.l goku_cell_mask,X
	PLX
	AND.w #$000F
	STA.w !w_scratch+6               ; quadrant mask (bit q = has pixels)
	LDA.w !w_cell_show
	BEQ +
	LDA.w #!WORLD_TILE_BUF1
	BRA ++
+	LDA.w #!WORLD_TILE_BUF0
++	ORA.w #!WORLD_OBJ_ATTR_GOKU<<8
	STA.w !w_scratch+8               ; tile | attr
	; quadrants TL, TR, BL, BR: (+0,+0) (+16,+0) (+0,+16) (+16,+16), tiles +0 +2 +$20 +$22
	LDA.w !w_scratch
	STA.w !w_scratch+10
	LDA.w !w_scratch+2
	STA.w !w_scratch+12
	LSR.w !w_scratch+6
	BCC +
	LDA.w !w_scratch+8
	JSR world_oam_put
+	LDA.w !w_scratch+10
	CLC
	ADC.w #16
	STA.w !w_scratch+10
	LSR.w !w_scratch+6
	BCC +
	LDA.w !w_scratch+8
	CLC
	ADC.w #$0002
	JSR world_oam_put
+	LDA.w !w_scratch
	STA.w !w_scratch+10
	LDA.w !w_scratch+12
	CLC
	ADC.w #16
	STA.w !w_scratch+12
	LSR.w !w_scratch+6
	BCC +
	LDA.w !w_scratch+8
	CLC
	ADC.w #$0020
	JSR world_oam_put
+	LDA.w !w_scratch+10
	CLC
	ADC.w #16
	STA.w !w_scratch+10
	LSR.w !w_scratch+6
	BCC .none
	LDA.w !w_scratch+8
	CLC
	ADC.w #$0022
	JSR world_oam_put
.none
	RTS

; Docking: Goku shrinks along a quadratic curve into the projected Fortress
; (t = min(1, $BF/160); size 32 -> 16, the miniature from half way).
world_draw_dock:
	LDA $BF
	AND.w #$00FF
	CMP.w #160
	BCC +
	LDA.w #160
+	ASL
	PHX
	TAX                              ; t step (0..320 step 2)
	LDA.l world_dock_curve,X         ; a | b<<8: (1-t)^2, 2(1-t)t in 1/255
	STA.w !w_scratch+14
	; x = a*128 + b*210 + c*dock_x, y = a*84 - b*12 + c*dock_y; c = 255-a-b
	LDA.w !w_dock_x
	LDX.w #128
	LDY.w #210
	JSR world_bezier
	PHA                              ; x
	LDA.w !w_dock_y
	LDX.w #84
	LDY.w #$FFF4                     ; -12
	JSR world_bezier
	TAY                              ; y
	PLA
	PLX                              ; OAM cursor
	STA.w !w_scratch+10
	STY.w !w_scratch+12
	LDA $BF
	AND.w #$00FF
	CMP.w #80                        ; t >= 1/2: the 16x16 miniature
	BCS .mini
	LDA.w !w_scratch+10
	SEC
	SBC.w #16
	STA.w !w_scratch
	LDA.w !w_scratch+12
	SEC
	SBC.w #16
	STA.w !w_scratch+2
	JMP world_draw_cell
.mini
	LDA.w !w_mini
	CMP.w #!GOKU_NONE
	BEQ .none
	LDA.w !w_scratch+10
	SEC
	SBC.w #8
	STA.w !w_scratch+10
	LDA.w !w_scratch+12
	SEC
	SBC.w #8
	STA.w !w_scratch+12
	LDA.w #(!WORLD_OBJ_ATTR_GOKU<<8)|!WORLD_TILE_MINI
	JSR world_oam_put
.none
	RTS

; Quadratic Bezier point: A = end, X = start, Y = control (signed), with
; the (1-t)^2 / 2(1-t)t weights in w_scratch+14 (bytes, /255).
world_bezier:
	STA.w !w_scratch+4               ; end
	STY.w !w_scratch+6               ; control
	STX.w !w_scratch+8               ; start
	SEP #$20
	LDA.w !w_scratch+14              ; a
	STA.l $004202
	LDA.w !w_scratch+8
	STA.l $004203
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	STA.w !w_scratch+10              ; a*start
	; c = 255 - a - b
	LDA.w !w_scratch+14
	AND.w #$00FF
	STA.w !w_scratch+8
	LDA.w !w_scratch+15
	AND.w #$00FF
	CLC
	ADC.w !w_scratch+8
	EOR.w #$FFFF
	SEC
	ADC.w #255
	SEP #$20
	STA.l $004202                    ; c
	LDA.w !w_scratch+4
	STA.l $004203
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	CLC
	ADC.w !w_scratch+10
	STA.w !w_scratch+10              ; a*start + c*end
	SEP #$20
	LDA.w !w_scratch+15              ; b
	STA.l $004202
	REP #$20
	LDA.w !w_scratch+6               ; |control|
	BPL +
	EOR.w #$FFFF
	INC
+	SEP #$20
	STA.l $004203
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.w !w_scratch+6
	BMI .neg
	LDA.l $004216
	CLC
	ADC.w !w_scratch+10
	BRA .div
.neg
	LDA.w !w_scratch+10
	SEC
	SBC.l $004216
.div
	XBA                              ; / 256 (weights sum to 255)
	AND.w #$00FF
	RTS

; One 16x16 effect sprite (fx slot A) at (w_scratch, w_scratch+2).
; X = OAM cursor (in/out).
world_put_fx:
	ASL
	PHX
	TAX
	LDA.w !w_scratch
	STA.w !w_scratch+10
	LDA.w !w_scratch+2
	STA.w !w_scratch+12
	LDA.l world_fx_tile,X
	PLX
	ORA.w #!WORLD_OBJ_ATTR_FX<<8
	; fall through

; Write a large (16x16) OBJ: A = tile | attr<<8, x = w_scratch+10 (signed),
; y = w_scratch+12 (signed). Offscreen sprites are dropped. X = OAM byte
; cursor, advanced by 4 (at most slot 60). Preserves Y.
; world_draw prefills the high table of our slots as large with x bit 8
; clear ($AA), so only a sprite with a negative x takes the slow path.
world_oam_put:
	CPX.w #$00F0
	BCS .full
	STA.w $0802,X
	LDA.w !w_scratch+12
	CLC
	ADC.w #16
	CMP.w #224+16                    ; y in [-16, 224)
	BCS .off
	LDA.w !w_scratch+10
	CLC
	ADC.w #16
	CMP.w #256+16                    ; x in [-16, 256)
	BCS .off
	SEP #$20
	LDA.w !w_scratch+10
	STA.w $0800,X
	LDA.w !w_scratch+12
	STA.w $0801,X
	REP #$20
	LDA.w !w_scratch+10
	BMI .xneg
	INX
	INX
	INX
	INX
.off
.full
	RTS
.xneg
	LDA.w #$0003                     ; x bit 8, large
	JSR world_oam_hi
	INX
	INX
	INX
	INX
	RTS

; High-table bits of the slot at OAM byte offset X: A = xhi | size<<1.
; Preserves X and Y.
world_oam_hi_clear:
	LDA.w #$0000
world_oam_hi:
	PHY
	PHX
	AND.w #$0003
	STA.w !w_scratch+14
	TXA
	LSR
	LSR
	LSR
	LSR
	TAY                              ; high-table byte: slot >> 2
	TXA
	AND.w #$000C                     ; (slot & 3) * 4
	ORA.w !w_scratch+14
	TAX
	SEP #$20
	LDA.w $0A00,Y
	AND.l world_hi_keep,X
	ORA.l world_hi_bits,X
	STA.w $0A00,Y
	REP #$20
	PLX
	PLY
	RTS
world_hi_keep:
	db $FC,$FC,$FC,$FC, $F3,$F3,$F3,$F3, $CF,$CF,$CF,$CF, $3F,$3F,$3F,$3F
world_hi_bits:
	db $00,$01,$02,$03, $00,$04,$08,$0C, $00,$10,$20,$30, $00,$40,$80,$C0
