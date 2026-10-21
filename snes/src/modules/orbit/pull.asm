; The second surge's pullback (planet-view.js cosmicBattle, pullbackStart
; to cosmicDuration; t = the shot's age): the globe pulls back from (0,
; 282, 240) to the orbit's opening camera (95, 154, 104) while Goku's beam
; from the strike site drives Frieza's Death Ball back into space, and the
; two fighters rise to their opening places. Each frame's record
; (orbit-finale.mjs orbit_pull, 32 bytes) holds the camera and the
; sprites. The globe draws from generated tables as the descent's does
; (globe_descent with g_pull), down to line 223, since the cinematic has
; no HUD: after the field IRQ's HUD split at the end of line 195, BGMODE
; (channel 2) and TM (channel 5, instead of BG3's scroll) give the lines
; from 196 back to the globe. The stars are sky()'s without a camera
; (stars_frame). montage.asm runs the clock, the cut (the scene's load)
; and the cue. DB = $32, M16/X16.
;
; The cut's load (scene.asm) sends the Mode 7 image's chunks the second
; aerial cut did not send ahead, the star cells and the beam's orb; the
; rest of the scene's images (the text and band tiles, the fight's
; resident cells) follow in the pullback's vblanks (pull_defer).
;
; The Death Ball (64 and 48 px) is two buffers of four 32x32 cells: the
; sprites show one while the vblanks fill the other with the next picture
; the records hold (2 KiB do not fit one vblank: a cell at a time), then
; they swap. The buffers borrow cells others own while the ball shows
; (Frieza's and the 32 px Death Ball's, the beam's slots 3-5, the finale's
; gold sparks and Frieza's pink charges and discs, unused until the
; fight); their images come back with the deferred uploads after it.

!PB_PICS = !XDATA_ORBIT_DEATH_BIG ; the Death Ball pictures: per picture its slot ($FF: never on the screen), then the slots
!PR = !XDATA_ORBIT_PULL            ; the frame records (words):
; +0 camera x, y, r; +6 flags (1 the beam, 2 the Death Ball, 4 the
; fighters, 8 the 'beam' cue); +8 the beam's origin x, y, band radius,
; reach, heading; +18 the Death Ball's top left, size | frame << 8; +24
; Goku's 16x16 cell's top left; +28 Frieza's 32x32 cell's top left

!PD_AFTER  = $01                   ; pull_defer flags (below)
!PD_FRIEZA = $02
!PD_GOKU   = $04

; The Death Ball buffers' cells (OBJ tiles): top left, top right, bottom
; left, bottom right.
pull_cells:
	dw $000, $004, $080, $084
	dw $008, $00C, $04C, $180

; The pullback's cut (montage.asm mt_cut, after orbit_picture_init): its
; frames from the records, the Death Ball's buffers empty. JSL, DB = $32.
pull_start:
	PHP
	REP #$30
	LDA.w #$0001
	STA.w !g_pull
	LDA.w #$FFFF
	STA.w !pb_have
	STA.w !pb_have+2
	STA.w !pb_fill
	STA.w !v_dbig
	STZ.w !pb_cells
	STZ.w !pb_used
	STZ.w !pb_shown
	LDA.w #$0000                   ; the deferred uploads from the first
	STA.l !orbit_pdef
	STA.l !orbit_pball
	PLP
	RTL

; X16 = this frame's record (t * 32).
pull_rec:
	LDA.l !orbit_msage
	CMP.w #!FND_PULL_FRAMES
	BCC +
	LDA.w #!FND_PULL_FRAMES-1
+	ASL : ASL : ASL : ASL : ASL
	TAX
	RTS

; orbit_live_frame while the pullback shows (montage_frame ran): the
; camera, the globe, the stars.
pull_frame:
	JSR pull_rec
	LDA.l !PR+0,X : STA.w !cam_x
	LDA.l !PR+2,X : STA.w !cam_y
	LDA.l !PR+4,X : STA.w !cam_r
	STZ.w !cam_tdx
	STZ.w !cam_tdy
	INC.w !cam_age
	JSR globe_frame
	JMP stars_frame

; The pullback ended (cosmicDuration: the orbit's intro from here, its
; camera where the pullback left it): the fight's globe again (its first
; block builds in the spare time while the pullback's last tables show
; the same camera), the HUD split, the sky clock from the intro's start
; (as orbit_picture_init leaves it for the intro).
pull_end:
	STZ.w !g_pull
	LDA.w #$0001                   ; (the deferred uploads go on to the end)
	STA.l !orbit_pball
	LDA.w #$FFFF
	STA.w !g_dk
	STA.w !v_dbig
	SEP #$20
	LDA.b #$FF
	STA.w !g_textset
	REP #$20
	STZ.w !st_age240
	JSR globe_clamp_r
	JMP globe_build_start

; The sprites, front to back (the browser paints them back to front):
; Frieza and Goku (from t 150), the Death Ball (until t 140), the beam's
; orb, the beam (Goku's wave's group in beam.asm; no Frieza beam).
pull_draw:
	JSR pull_rec
	STX.w !d_hit
	; the band's colour frame: beam-body (t >> 2) % 2 (orbit-effects.js)
	LDA.l !orbit_msage
	LSR : LSR
	AND.w #$0001
	STA.w !v_band
	STA.w !v_pband
	STZ.w !v_pmode
	LDX.w #$0002
	JSR beam_off
	LDX.w !d_hit
	LDA.l !PR+6,X
	AND.w #$0001
	BNE +
	LDX.w #$0000
	JSR beam_off
	BRA .fighters
+	LDA.l !PR+8,X : STA.w !bw_x
	LDA.l !PR+10,X : STA.w !bw_y
	LDA.l !PR+16,X : STA.w !bg_tmp       ; heading
	LDA.l !PR+12,X : STA.w !bg_tmp+2     ; band radius
	STZ.w !bg_tmp+4
	; the reach in the nearest whole number of cells (beam_want takes
	; length / period + 1): reach - period / 2, at least 0
	LDA.w !bg_tmp
	AND.w #$000F
	ASL
	TAX
	LDA.l orbit_fx_beam_heading,X
	AND.w #$0007
	TAX
	LDA.l beam_want_period,X
	AND.w #$00FF
	LSR
	STA.w !bg_tmp+6
	LDX.w !d_hit
	LDA.l !PR+14,X
	SEC : SBC.w !bg_tmp+6
	BCS +
	LDA.w #$0000
+	STA.w !bg_tmp+6
	LDA.w #(!OFX_PAL_BLUE<<9)|!OA_PRI : STA.w !bg_tmp+8
	LDX.w #$0000
	JSR beam_want
.fighters
	LDX.w !d_hit
	LDA.l !PR+6,X
	AND.w #$0004
	BEQ .ball
	; Frieza: frame 4 flipped (drawFriezaSprite tiny), 32x32
	LDA.w #((4*2+1)*512)+!OSP_FRIEZA_0
	STA.w !v_frieza
	LDA.l !PR+28,X : STA.w !d_x
	LDA.l !PR+30,X : STA.w !d_y
	LDA.w #!OV_FRIEZA|(!OFX_PAL_FRIEZA<<9)|!OA_PRI
	STA.w !d_ta
	LDA.w #$0001
	STA.w !d_big
	JSR ofx_put
	; Goku: idle (column 34) facing up (row 3) at 2:1, 16x16
	LDX.w !d_hit
	LDA.w #((!OPOSE_IDLE*4+3)*128)+!OSP_GOKU_IDLE_0
	STA.w !v_goku
	LDA.l !PR+24,X : STA.w !d_x
	LDA.l !PR+26,X : STA.w !d_y
	LDA.w #!OV_GOKU|(1<<9)|!OA_PRI
	STA.w !d_ta
	STZ.w !d_big
	JSR ofx_put
.ball
	LDX.w !d_hit
	LDA.l !PR+6,X
	AND.w #$0002
	BNE +
	; the ball is gone: the deferred uploads give back the cells it took
	LDA.w #$0001
	STA.l !orbit_pball
	LDA.w !pb_used
	BEQ .orb
	STZ.w !pb_used
	LDA.w #$FFFF
	STA.w !pb_fill
	STA.w !pb_have
	STA.w !pb_have+2
	STA.w !v_dbig
	BRA .orb
+	JSR pull_ball
.orb
	LDX.w !d_hit
	LDA.l !PR+6,X
	AND.w #$0001
	BNE +
	RTS
+	; the beam's orb (charge-orb frame 4) at its origin, then the band
	LDY.w #!OFX_ORB_4|(!OFX_PAL_BLUE<<9)|!OA_PRI
	LDA.l !PR+10,X
	PHA
	LDA.l !PR+8,X
	PLX
	JSR ofx_stamp
	LDX.w #$0000
	JMP beam_draw

; The Death Ball (X16 = the record): 64 or 48 px from the buffers, 32 px
; from the fight's Death Ball cell. A buffer's picture is drawn at its own
; size around the ball's centre (one still filling shows the last frame a
; little longer).
pull_ball:
	LDA.w #$0001
	STA.w !pb_used
	LDA.l !PR+22,X
	AND.w #$00FF
	STA.w !d_t0                    ; size
	LSR
	STA.w !d_t2                    ; half
	LDA.l !PR+22,X
	XBA
	AND.w #$00FF
	STA.w !d_t1                    ; frame
	LDA.l !PR+18,X : CLC : ADC.w !d_t2 : STA.w !d_t3   ; centre
	LDA.l !PR+20,X : CLC : ADC.w !d_t2 : STA.w !d_t4
	LDA.w !d_t0
	CMP.w #32
	BNE .big
	; 32 px: the fight's cell (its upload takes buffer 0's top right)
	LDA.w #$FFFF
	STA.w !pb_have
	LDA.w !d_t1
	STA.w !v_d32
	CMP.w !v_d32_h
	BEQ +
	RTS
+	LDA.w !d_t3 : SEC : SBC.w #16 : STA.w !d_x
	LDA.w !d_t4 : SEC : SBC.w #16 : STA.w !d_y
	LDA.w #!OV_D32|(!OFX_PAL_PINK<<9)|!OA_PRI
	STA.w !d_ta
	LDA.w #$0001
	STA.w !d_big
	JMP ofx_put
.big
	; the picture: frame (64 px) or 12 + frame (48 px)
	LDA.w !d_t1
	LDY.w !d_t0
	CPY.w #48
	BNE +
	CLC : ADC.w #12
+	STA.w !d_t1
	STA.w !v_dbig
	TAX
	LDA.l !PB_PICS,X
	AND.w #$00FF
	CMP.w #$00FF
	BNE +
	RTS                            ; (never on the screen: not made)
+	LDA.w !d_t1
	; the buffer shown holds it, or the other one does now: show that
	LDX.w !pb_shown
	CMP.w !pb_have,X
	BEQ .ahead
	TXA
	EOR.w #$0002
	TAX
	LDA.w !d_t1
	CMP.w !pb_have,X
	BNE .take
	STX.w !pb_shown
	BRA .ahead
.take
	; the other buffer takes it (from its first cell, if it took another)
	JSR .fill
	BRA .show
.ahead
	; shown: the other buffer takes the next picture the records hold
	JSR pull_next
	CMP.w #$FFFF
	BEQ .show
	PHA
	LDA.w !pb_shown
	EOR.w #$0002
	TAX
	PLA
	CMP.w !pb_have,X
	BEQ .show
	JSR .fill
.show
	LDX.w !pb_shown
	LDA.w !pb_have,X
	CMP.w #$FFFF
	BNE +
	RTS                            ; (none whole yet)
+	LDY.w #32
	CMP.w #12
	BCC +
	LDY.w #24
+	STY.w !d_t2                    ; its half size
	LDA.w !d_t3 : SEC : SBC.w !d_t2 : STA.w !d_t3      ; its top left
	LDA.w !d_t4 : SEC : SBC.w !d_t2 : STA.w !d_t4
	TXA
	ASL : ASL
	STA.w !d_t5                    ; the buffer's cells (x 8)
	LDA.w #$0001
	STA.w !d_big
	LDA.w !d_t3 : STA.w !d_x
	LDA.w !d_t4 : STA.w !d_y
	LDX.w !d_t5
	LDA.l pull_cells+0,X
	ORA.w #(!OFX_PAL_PINK<<9)|!OA_PRI
	STA.w !d_ta
	JSR ofx_put
	LDA.w !d_t3 : CLC : ADC.w #32 : STA.w !d_x
	LDA.w !d_t4 : STA.w !d_y
	LDX.w !d_t5
	LDA.l pull_cells+2,X
	ORA.w #(!OFX_PAL_PINK<<9)|!OA_PRI
	STA.w !d_ta
	JSR ofx_put
	LDA.w !d_t3 : STA.w !d_x
	LDA.w !d_t4 : CLC : ADC.w #32 : STA.w !d_y
	LDX.w !d_t5
	LDA.l pull_cells+4,X
	ORA.w #(!OFX_PAL_PINK<<9)|!OA_PRI
	STA.w !d_ta
	JSR ofx_put
	LDA.w !d_t3 : CLC : ADC.w #32 : STA.w !d_x
	LDA.w !d_t4 : CLC : ADC.w #32 : STA.w !d_y
	LDX.w !d_t5
	LDA.l pull_cells+6,X
	ORA.w #(!OFX_PAL_PINK<<9)|!OA_PRI
	STA.w !d_ta
	JMP ofx_put
; A16 = a picture for buffer X / 2 (not shown) to take, from its first
; cell unless it takes that one already.
.fill
	CMP.w !pb_fill
	BEQ +
	STA.w !pb_fill
	STZ.w !pb_cells
	LDA.w #$FFFF
	STA.w !pb_have,X
+	RTS

; A16 = the next Death Ball picture other than d_t1 within the records of
; the next 8 frames after d_hit's ($FFFF: none, or the ball ends or turns
; to 32 px first).
pull_next:
	LDA.w !d_hit
	STA.w !d_t6
	LDY.w #8
.scan
	LDA.w !d_t6
	CLC : ADC.w #32
	CMP.w #!FND_PULL_FRAMES*32
	BCS .none
	STA.w !d_t6
	TAX
	LDA.l !PR+6,X
	AND.w #$0002
	BEQ .none
	LDA.l !PR+22,X
	AND.w #$00FF
	CMP.w #32
	BEQ .none
	CMP.w #48
	PHP
	LDA.l !PR+23,X                 ; (the frame)
	AND.w #$00FF
	PLP
	BNE +
	CLC : ADC.w #12
+	CMP.w !d_t1
	BNE .found
	DEY
	BNE .scan
.none
	LDA.w #$FFFF
	RTS
.found
	TAX
	LDA.l !PB_PICS,X
	AND.w #$00FF
	CMP.w #$00FF
	BEQ .none                      ; (not made: off the screen then)
	TXA
	RTS

; Vblank (orbit_nmi_cells, before the other cells): in the pullback the
; Death Ball's next picture into the buffer not shown, a cell (512 bytes)
; at a time while the vblank has room; then the deferred uploads (also
; after the pullback, until done). M16/X16.
pull_nmi_ball:
	LDA.w !g_pull
	BEQ +
	JSR pull_nmi_fill
+	JMP pull_nmi_defer

pull_nmi_fill:
	LDA.w !pb_fill
	CMP.w #$FFFF
	BNE .cell
	RTS
.cell
	LDA.w !pb_cells
	CMP.w #4
	BCS .whole
	LDA.w #6                       ; (4.3 lines; two a vblank, ending by ~254)
	JSR orbit_nmi_room
	BCC +
	RTS
+	; its cell pb_cells: 32 + slot * 2048 + cell * 512
	LDX.w !pb_fill
	LDA.l !PB_PICS,X
	AND.w #$00FF
	XBA : ASL : ASL : ASL
	CLC : ADC.w #((!PB_PICS)&$FFFF)+32
	STA.w !n_src
	LDA.w #(!PB_PICS)>>16
	STA.w !n_bank
	LDA.w !pb_cells
	XBA : ASL
	CLC : ADC.w !n_src
	STA.w !n_src
	; the cell of the buffer not shown
	LDA.w !pb_shown
	EOR.w #$0002
	ASL : ASL
	CLC : ADC.w !pb_cells
	CLC : ADC.w !pb_cells
	TAX
	LDA.l pull_cells,X
	ASL : ASL : ASL : ASL
	CLC : ADC.w #$6000
	STA.w !n_vram
	LDA.w #4
	STA.w !n_rows
	LDA.w #128
	STA.w !n_len
	JSR orbit_nmi_rows
	INC.w !pb_cells
	BRA .cell
.whole
	LDA.w !pb_shown
	EOR.w #$0002
	TAX
	LDA.w !pb_fill
	STA.w !pb_have,X
	LDA.w #$FFFF
	STA.w !pb_fill
	RTS

; The deferred uploads in order, an entry (at most 512 bytes) at a time
; while the vblank has room; those that take the Death Ball's cells wait
; until it is gone.
pull_nmi_defer:
	LDA.l !orbit_pdef
	CMP.w #$FFFF
	BNE +
	RTS
+	TAX
	LDA.l pull_defer+4,X
	AND.w #!PD_AFTER<<8
	BEQ +
	LDA.l !orbit_pball
	BNE +
	RTS                            ; (the ball still shows)
+	LDA.w #5                       ; (512 bytes in one DMA: 3.2 lines)
	JSR orbit_nmi_room
	BCC +
	RTS
+	LDA.l !orbit_pdef
	TAX
	LDA.l pull_defer+0,X
	STA.w !n_vram
	LDA.l pull_defer+2,X
	STA.w !n_src
	LDA.l pull_defer+4,X
	AND.w #$00FF
	STA.w !n_bank
	LDA.l pull_defer+6,X
	STA.w !n_len
	LDA.w #1
	STA.w !n_rows
	JSR orbit_nmi_rows
	; the cells the upload overwrote forget what they held
	LDA.l !orbit_pdef
	TAX
	LDA.l pull_defer+4,X
	PHA
	AND.w #!PD_FRIEZA<<8
	BEQ +
	LDA.w #$FFFF
	STA.w !v_frieza_h
	STA.w !v_d32_h
+	PLA
	AND.w #!PD_GOKU<<8
	BEQ +
	LDA.w #$FFFF
	STA.w !v_goku_h
	STA.w !v_d16_h
	STA.w !bs_have+8
	STA.w !bs_have+10
+	LDA.l !orbit_pdef
	CLC : ADC.w #8
	CMP.w #pull_defer_end-pull_defer
	BCC +
	LDA.w #$FFFF
+	STA.l !orbit_pdef
	JMP pull_nmi_defer

; The uploads the pullback's load leaves to its vblanks: VRAM word address,
; source, its bank | flags << 8 (!PD_AFTER: they take the Death Ball's
; cells, after it; !PD_FRIEZA: Frieza's and the 32 px Death Ball's cells
; come back empty; !PD_GOKU: Goku's, the 16 px Death Ball's and the beam's
; slots 4-5 likewise), bytes. The text panel's and the band layers' tiles,
; the upper half of OBJ $080-$0FF at once; then that half's lower part
; (the Death Ball's $080, $084 among them), $180-$1BF and $000-$03F.
!PD_TEXT  = $4000+(!OTXT_TILE0*8)
assert !OTXT_TILES*16 > 1024 && !OTXT_TILES*16 <= 1536, "pull_defer: the text tiles in three pieces"
pull_defer:
	dw !PD_TEXT, orbit_text_tiles, orbit_text_tiles>>16, 512
	dw !PD_TEXT+256, orbit_text_tiles+512, orbit_text_tiles>>16, 512
	dw !PD_TEXT+512, orbit_text_tiles+1024, orbit_text_tiles>>16, !OTXT_TILES*16-1024
	dw !BD_TILES, orbit_band_tiles, orbit_band_tiles>>16, 512
	dw !BD_TILES+256, orbit_band_tiles+512, orbit_band_tiles>>16, 512
	dw !BD_TILES+512, orbit_band_tiles+1024, orbit_band_tiles>>16, 45*32-1024
	dw $6C00, orbit_fx_vram_a+2048, orbit_fx_vram_a>>16, 512
	dw $6D00, orbit_fx_vram_a+2560, orbit_fx_vram_a>>16, 512
	dw $6E00, orbit_fx_vram_a+3072, orbit_fx_vram_a>>16, 512
	dw $6F00, orbit_fx_vram_a+3584, orbit_fx_vram_a>>16, 512
	dw $6800, orbit_fx_vram_a, (orbit_fx_vram_a>>16)|((!PD_AFTER|!PD_GOKU)<<8), 512
	dw $6900, orbit_fx_vram_a+512, (orbit_fx_vram_a>>16)|((!PD_AFTER|!PD_GOKU)<<8), 512
	dw $6A00, orbit_fx_vram_a+1024, (orbit_fx_vram_a>>16)|((!PD_AFTER|!PD_GOKU)<<8), 512
	dw $6B00, orbit_fx_vram_a+1536, (orbit_fx_vram_a>>16)|((!PD_AFTER|!PD_GOKU)<<8), 512
	dw $7800, orbit_fx_vram_c, (orbit_fx_vram_c>>16)|(!PD_AFTER<<8), 512
	dw $7900, orbit_fx_vram_c+512, (orbit_fx_vram_c>>16)|(!PD_AFTER<<8), 512
	dw $7A00, orbit_fx_vram_c+1024, (orbit_fx_vram_c>>16)|(!PD_AFTER<<8), 512
	dw $7B00, orbit_fx_vram_c+1536, (orbit_fx_vram_c>>16)|(!PD_AFTER<<8), 512
	dw $6000, orbit_fx_vram_d, (orbit_fx_vram_d>>16)|((!PD_AFTER|!PD_FRIEZA)<<8), 512
	dw $6100, orbit_fx_vram_d+512, (orbit_fx_vram_d>>16)|((!PD_AFTER|!PD_FRIEZA)<<8), 512
	dw $6200, orbit_fx_vram_d+1024, (orbit_fx_vram_d>>16)|((!PD_AFTER|!PD_FRIEZA)<<8), 512
	dw $6300, orbit_fx_vram_d+1536, (orbit_fx_vram_d>>16)|((!PD_AFTER|!PD_FRIEZA)<<8), 512
pull_defer_end:

; Channel 5 in the pullback: TM = BG1 + OBJ, again at line 196 (the field
; IRQ's HUD split leaves BG3 + OBJ there).
orbit_tm_pull:
	db 127,$11, 69,$11, 1,$11, 0
