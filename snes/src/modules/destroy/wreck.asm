; The wreck's look (engine/sandship-wreck.js getColor, renderLine and the
; breach mask) on the cartridge's own PPU.
;
; The browser composites every pixel. Here the colours themselves change:
; - the white-out blends the whole of CGRAM toward white (renderLine:
;   out + (255 - out) * white, 13 levels), so it rides through the native
;   fade and the escape door's reload exactly like the browser's (the
;   forced-blank frames of the load stay black on hardware);
; - in the wreck, the firelight and the red alarm shift BG palettes 1-7
;   (getColor's offsets on BG1/BG2 pixels; BG3's text and HUD colours 0-15
;   and the sprites keep theirs). The flicker is the browser's centre block
;   for the whole screen.
; A colour word is transformed by two table lookups, its low and its high
; byte (snes/gen/destroy.mjs). The field frame transforms up to 128 colours
; of the game's palette buffer ($7E:0600, $BE00 while $2A is set) into
; !SS_STAGE; the vblank callback uploads the staged range after the game's
; own CGRAM upload. The game's buffer is never modified.
;
; The breach: inside its outline window 1 masks BG1 and BG2 (one span per
; scanline, HDMA channel 2) and the backdrop shows the desert under the hull
; (CGRAM 0 per scanline, HDMA channel 3: sand() down a column, scrolled
; 1.5 px per frame). Sprites (fires, monsters, Goku) and BG3 stay in front.
; Both channels run indirect, so a frame's tables are a few entries: the
; window positions of the outline's rows are remade only when its screen x
; changes (vertical scrolling just moves the pointer), and the sand of each
; white level comes ready-made from extended data (copied here, 128 bytes a
; frame, when the level changes). The channels are taken only while nobody
; else uses them ($2C bits 2/3 clear), given back when the room fades, the
; ring menu opens or another party reprograms them, and switched on only
; with vblank time left.
;
; Frame time: the parts that must run every frame are small (the clock, the
; transform choice, the tables); the palette passes (one chunk a frame for
; the tint, more for the white-out) and then the fires take what the frame
; has left before !SS_FRAME_END, counting fx's work for each draw.
;
; Deviations: one sand colour per scanline (the browser's sand varies along
; the line too) and no soot or fire rim drawn into the floor (the rim's five
; fires and the room's fires are sprites).

!SS_DB2 #= ((!SSW>>16)&$FF)|(((!SSW>>16)&$FF)<<8)  ; PEA operand: DB = the work bank
; the white-out tables (extended data): 13 low-byte tables, then 13 high
!SS_WHITE_LO #= !XDATA_DESTROY_WHITE
!SS_WHITE_HI #= !XDATA_DESTROY_WHITE+((!SS_WHITE_LEVELS+1)*512)
!SS_SAND_QUADS #= !XDATA_DESTROY_SAND_QUADS
; Frame time. The field frame ends with fx_frame drawing what was asked of
; it, so the work here, plus fx's estimated work for this module's draws,
; must end before !SS_FRAME_END (the NMI comes at line 225). Estimates in
; scanlines, measured in the hold (FastROM).
!SS_FRAME_END = 214       ; last line our work and its fx work may reach
!SS_FX_BASE  = 9          ; fx_frame's own cost once it draws anything
!SS_FX_FLAME = 15         ; fx's work for an Exploder flame (ours is timed live)
!SS_FX_EMBER = 7          ; ... for a Fireball ember
!SS_PAL_CHUNK = 14        ; one palette chunk (32 colours)
!SS_STARVE_END = 221      ; a starving palette pass may end this late

; ---------------------------------------------------------------------------
; Field side (ss_frame, inside the arc's window). M16/X16, DB = $7E.
ss_visuals:
	LDA.w #0 : STA.l !ssw_fx_debt
	JSR ss_clock
	JSR ss_pal_choose
	JSR ss_breach_build
	JSR ss_fires_prep
	JSR ss_pal_run
	JSR ss_fires
	LDA.w #!SS_VIS_MAGIC : STA.l !ssw_vtmp
	LDA.l !ssw_pal_up : BEQ +
	LDA.l !ssw_vtmp : ORA.w #!SS_VIS_PAL : STA.l !ssw_vtmp
+	LDA.l !ssw_br_on : BEQ +
	LDA.l !ssw_vtmp : ORA.w #!SS_VIS_BREACH : STA.l !ssw_vtmp
+	LDA.l !ssw_vtmp : STA.l !ss_vis
	RTS

; The wreck's clock: !ss_wage modulo the browser's periods (the alarm 120,
; the flames 7, the embers 5/3 and 24, the blasts 150), stepped with the
; age; divided out again when out of step (a load, the work re-initialised).
ss_clock:
	LDA.l !ssw_ck_ok : BEQ .full
	LDA.l !ss_wage : CMP.l !ssw_ck_age : BNE +
	RTS
+	DEC : CMP.l !ssw_ck_age : BEQ .step
.full
	LDA.l !ss_wage : STA.l !ssw_ck_age
	LDX.w #120 : JSR ss_clock_div : STA.l !ssw_ck_120
	LDA.l !ss_wage : LDX.w #7 : JSR ss_clock_div : STA.l !ssw_ck_r7
	LDA.l !ssw_vtmp : STA.l !ssw_ck_q7
	LDA.l !ss_wage : LDX.w #5 : JSR ss_clock_div : STA.l !ssw_ck_r5
	LDA.l !ssw_vtmp : LDX.w #3 : JSR ss_clock_div : STA.l !ssw_ck_e3
	LDA.l !ss_wage : LDX.w #24 : JSR ss_clock_div : STA.l !ssw_ck_m24
	LDA.l !ss_wage : LDX.w #150 : JSR ss_clock_div : STA.l !ssw_ck_150
	LDA.l !ssw_vtmp : STA.l !ssw_ck_q150
	LDA.w #1 : STA.l !ssw_ck_ok
	RTS
.step
	LDA.l !ss_wage : STA.l !ssw_ck_age
	LDA.l !ssw_ck_120 : INC : CMP.w #120 : BCC +
	LDA.w #0
+	STA.l !ssw_ck_120
	LDA.l !ssw_ck_r7 : INC : CMP.w #7 : BCC +
	LDA.l !ssw_ck_q7 : INC : STA.l !ssw_ck_q7
	LDA.w #0
+	STA.l !ssw_ck_r7
	LDA.l !ssw_ck_r5 : INC : CMP.w #5 : BCC .r5
	LDA.l !ssw_ck_e3 : INC : CMP.w #3 : BCC +
	LDA.w #0
+	STA.l !ssw_ck_e3
	LDA.w #0
.r5
	STA.l !ssw_ck_r5
	LDA.l !ssw_ck_m24 : INC : CMP.w #24 : BCC +
	LDA.w #0
+	STA.l !ssw_ck_m24
	LDA.l !ssw_ck_150 : INC : CMP.w #150 : BCC +
	LDA.l !ssw_ck_q150 : INC : STA.l !ssw_ck_q150
	LDA.w #0
+	STA.l !ssw_ck_150
	RTS
; A / X -> A = remainder, !ssw_vtmp = quotient (shift and subtract)
ss_clock_div:
	STX.w !d_t4
	STA.w !d_t3
	LDY.w #16
	LDA.w #0
-	ASL.w !d_t3
	ROL
	CMP.w !d_t4 : BCC +
	SBC.w !d_t4
	INC.w !d_t3
+	DEY : BNE -
	PHA
	LDA.w !d_t3 : STA.l !ssw_vtmp
	PLA
	RTS

; The transform for this frame: the white-out while !ss_flash > 0 (level
; round(flash * 12 / 256)), else the alarm tint while wrecked aboard.
ss_pal_choose:
	LDA.l !ss_flash : BEQ .tint
	STA.l !ssw_vtmp+2
	ASL : CLC : ADC.l !ssw_vtmp+2 : ASL : ASL    ; flash * 12
	CLC : ADC.w #128
	XBA : AND.w #$00FF
	BEQ .tint
	CMP.w #!SS_WHITE_LEVELS+1 : BCC +
	LDA.w #!SS_WHITE_LEVELS
+	STA.l !ssw_vtmp+2                            ; level
	STA.l !ssw_white_lvl
	ORA.w #$0200 : STA.l !ssw_vtmp+4              ; key: mode 2
	LDA.l !ssw_vtmp+2 : XBA : ASL                 ; level * 512
	CLC : ADC.w #(!SS_WHITE_LO)&$FFFF : STA.l !ssw_pal_tl
	LDA.l !ssw_vtmp+2 : XBA                       ; level * 256
	CLC : ADC.w #(!SS_WHITE_HI)&$FFFF : STA.l !ssw_pal_th
	SEP #$20
	LDA.b #(!SS_WHITE_LO)>>16 : STA.l !ssw_pal_tl+2 : STA.l !ssw_pal_th+2
	REP #$20
	LDA.w #0 : STA.l !ssw_vtmp+6                  ; every colour
	LDA.w #512 : STA.l !ssw_vtmp+8
	JMP .set
.tint
	LDA.w #0 : STA.l !ssw_white_lvl
	LDA.l !ss_flags : AND.w #!SSF_WRECK : BNE +
	JMP .none
+	LDA.w $00DC : JSR ss_ship_map : BCS +
	JMP .none
+	; the tint's inputs: the alarm's phase (it is off from 24 on) and the
	; flicker's step; the same as last frame, the same key
	LDA.l !ssw_ck_120 : CMP.w #24 : BCC +
	LDA.w #24
+	XBA : STA.l !ssw_vtmp+2
	LDA.l !ss_wage : LSR : LSR : AND.w #$00FF : ORA.l !ssw_vtmp+2
	CMP.l !ssw_pal_kin : BNE .compute
	LDA.l !ssw_pal_mode : CMP.w #1 : BNE .compute
	LDA.l !ssw_pal_key : STA.l !ssw_vtmp+4
	LDA.w #32 : STA.l !ssw_vtmp+6                 ; colours 16-127
	LDA.w #256 : STA.l !ssw_vtmp+8
	JMP .set
.compute
	STA.l !ssw_pal_kin
	; phase = age % 120 (alarm, the clock), k = (age >> 2) & 255 (flicker)
	LDA.l !ss_wage : LSR : LSR : AND.w #$00FF : ASL : STA.l !ssw_vtmp+2
	LDA.l !ssw_ck_120 : ASL : TAX                 ; phase * 2
	LDA.l ss_alarm_a,X : STA.l !ssw_vtmp+6        ; alarm * 256
	LDA.l ss_alarm_b,X : STA.l !ssw_vtmp+8        ; alarm * .4 * 256
	LDA.l ss_alarm_c,X : STA.l !ssw_vtmp+10       ; alarm * .5 * 256
	LDA.l !ssw_vtmp+2 : TAX                       ; k * 2
	; red: 2 + floor(alarm + flicker)
	LDA.l ss_flick_a,X : CLC : ADC.l !ssw_vtmp+6
	XBA : AND.w #$00FF
	CMP.w #6 : BCC +
	LDA.w #5
+	STA.l !ssw_vtmp+12                            ; dr - 2
	; green: floor(flicker * .5 - alarm * .4), -2..0
	LDA.l ss_flick_b,X : SEC : SBC.l !ssw_vtmp+8
	EOR.w #$8000 : XBA : AND.w #$00FF             ; floor(/256) + 128
	SEC : SBC.w #$80-2                             ; dg + 2
	BPL +
	LDA.w #0
+	CMP.w #3 : BCC +
	LDA.w #2
+	STA.l !ssw_vtmp+14
	; blue: -2 - ceil(alarm * .5), -4..-2 -> db + 4 = 2 - ceil
	LDA.l !ssw_vtmp+10 : CLC : ADC.w #255 : XBA : AND.w #$00FF
	CMP.w #3 : BCC +
	LDA.w #2
+	STA.l !ssw_vtmp+10
	LDA.w #2 : SEC : SBC.l !ssw_vtmp+10 : STA.l !ssw_vtmp+10
	; hi table (dg + 2) * 3 + (db + 4)
	LDA.l !ssw_vtmp+14 : ASL : CLC : ADC.l !ssw_vtmp+14
	CLC : ADC.l !ssw_vtmp+10 : STA.l !ssw_vtmp+14
	ASL : ASL : ASL : ASL : ORA.l !ssw_vtmp+12 : ORA.w #$0100
	STA.l !ssw_vtmp+4                             ; key: mode 1
	LDA.l !ssw_vtmp+12 : XBA : ASL                ; (dr - 2) * 512
	CLC : ADC.w #ss_tint_lo&$FFFF : STA.l !ssw_pal_tl
	LDA.l !ssw_vtmp+14 : XBA                      ; index * 256
	CLC : ADC.w #ss_tint_hi&$FFFF : STA.l !ssw_pal_th
	SEP #$20
	LDA.b #ss_tint_lo>>16 : STA.l !ssw_pal_tl+2 : STA.l !ssw_pal_th+2
	REP #$20
	LDA.w #32 : STA.l !ssw_vtmp+6                 ; colours 16-127
	LDA.w #256 : STA.l !ssw_vtmp+8
	BRA .set
.none
	LDA.w #0
	STA.l !ssw_pal_mode : STA.l !ssw_pal_up : STA.l !ssw_pal_done
	RTS
.set
	; the game's palette buffer of this frame
	SEP #$20
	LDA.w $002A
	REP #$20
	BEQ +
	LDA.w #$BE00 : BRA ++
+	LDA.w #$0600
++	STA.l !ssw_pal_src
	; a new mode: nothing is uploaded until its colours are made
	LDA.l !ssw_vtmp+4 : XBA : AND.w #$00FF : CMP.l !ssw_pal_mode : BEQ .same
	STA.l !ssw_pal_mode
	LDA.l !ssw_vtmp+6 : STA.l !ssw_pal_first
	LDA.l !ssw_vtmp+8 : STA.l !ssw_pal_end
	BRA .fresh
.same
	; another room (or the same one reloaded): the tint waits for its own
	; colours; the white-out keeps showing (its top levels do not depend on
	; them)
	LDA.w $00DC : CMP.l !ssw_pal_room : BNE .room
	LDA.l !ssw_loads : CMP.l !ssw_pal_load : BEQ .key
.room
	LDA.l !ssw_pal_mode : CMP.w #1 : BEQ .fresh
	BRA .redo
.key
	; a new transform: the whole range again, from where the cursor is
	LDA.l !ssw_vtmp+4 : CMP.l !ssw_pal_key : BNE .redo
	; and every 32 frames anyway (the game may edit its colours)
	LDA.w !FRAME : AND.w #31 : BEQ .redo
	RTS
.fresh
	LDA.w #0 : STA.l !ssw_pal_done : STA.l !ssw_pal_up
	LDA.l !ssw_pal_first : STA.l !ssw_pal_cur
.redo
	LDA.l !ssw_vtmp+4 : STA.l !ssw_pal_key
	LDA.w $00DC : STA.l !ssw_pal_room
	LDA.l !ssw_loads : STA.l !ssw_pal_load
	LDA.l !ssw_pal_end : SEC : SBC.l !ssw_pal_first : STA.l !ssw_pal_left
	RTS

; Work through the range: chunks of 32 colours (about 13 scanlines each,
; the cursor wrapping around the range) while the frame has time (scanline
; < !SS_PAL_LINE; the white-out, with Goku held, until !SS_PAL_LINE_WHITE),
; or one chunk after !SS_PAL_STARVE frames without time. !ssw_pal_done is
; the part of the range made since the mode (or room) began; that part is
; uploaded each vblank, so a white-out shows from its first chunk on.
ss_pal_run:
	LDA.l !ssw_pal_mode : BNE +
	RTS
+	LDA.l !ssw_pal_left : BNE +
	RTS
+	LDA.w #!SS_PAL_CHUNK : JSR ss_room : BCC .go
	LDA.l !ssw_pal_wait : INC : STA.l !ssw_pal_wait
	CMP.w #!SS_PAL_STARVE : BCS +
	RTS
+	; starving: one chunk anyway if it still ends before the vblank
	LDA.w #!SS_PAL_CHUNK : LDX.w #!SS_STARVE_END : JSR ss_room_by : BCC .go
	RTS
.go
	LDA.w #0 : STA.l !ssw_pal_wait
	PHD
	TSC : SEC : SBC.w #12 : TCS                   ; a direct-page frame on the stack
	INC : TCD
	LDA.l !ssw_pal_tl : STA $00                   ; [$00] low-byte table
	LDA.l !ssw_pal_th : STA $03                   ; [$03] high-byte table
	SEP #$20
	LDA.l !ssw_pal_tl+2 : STA $02
	LDA.l !ssw_pal_th+2 : STA $05
	REP #$20
.chunk
	LDA.l !ssw_pal_cur : STA $0A                  ; chunk start
	CLC : ADC.w #64 : CMP.l !ssw_pal_end : BCC +
	LDA.l !ssw_pal_end
+	STA $08                                       ; chunk end
	LDA $0A : TAX
	LDA.l !ssw_pal_src : CMP.w #$0600 : BNE +
	JSR ss_xform_06
	BRA ++
+	JSR ss_xform_be
++	LDA $08 : SEC : SBC $0A : STA $06             ; bytes done
	LSR : CLC : ADC.l !ssw_pal_cols : STA.l !ssw_pal_cols
	; the made part grows from the range's start until the cursor wraps
	LDA $08 : SEC : SBC.l !ssw_pal_first
	CMP.l !ssw_pal_done : BCC +
	STA.l !ssw_pal_done
+	LDA $08 : CMP.l !ssw_pal_end : BCC +
	LDA.l !ssw_pal_first
+	STA.l !ssw_pal_cur
	LDA.l !ssw_pal_left : SEC : SBC $06 : STA.l !ssw_pal_left
	BEQ .out
	; the alarm tint makes one chunk a frame (it changes every few frames,
	; and the fires share the time); the white-out takes what there is
	LDA.l !ssw_pal_mode : CMP.w #2 : BNE .out
	LDA.w #!SS_PAL_CHUNK : JSR ss_room : BCC .chunk
.out
	LDA.l !ssw_pal_done : STA.l !ssw_pal_up
	LDA.l !ssw_pal_first : STA.l !ssw_pal_upat
	TSC : CLC : ADC.w #12 : TCS
	PLD
	RTS

; A = scanlines of work about to start: carry set when it would not end,
; with the fx work this frame's draws already added (!ssw_fx_debt), before
; !SS_FRAME_END of this frame (or of the next one when the frame began in
; vblank, the previous one having run long). ss_room_by: the same with the
; last line in X. Latched counters only.
ss_room:
	LDX.w #!SS_FRAME_END
ss_room_by:
	STX.w !d_t4
	CLC : ADC.l !ssw_fx_debt : STA.l !ssw_vtmp+14
	JSR dst_vline
	PHA
	LDA.w !d_vstart : CMP.w #225 : BCC .visible
	PLA : CMP.w !d_vstart : BCC .add              ; past the wrap: this line
	LDA.w #0                                      ; still in that vblank
	BRA .add
.visible
	PLA : CMP.w !d_vstart : BCC .no               ; already past the frame's end
.add
	CLC : ADC.l !ssw_vtmp+14
	DEC : CMP.w !d_t4                             ; carry: end > last line
	RTS
.no
	SEC
	RTS

; X = first byte offset, $08 = end: colour -> [lo table][low byte] +
; [hi table][high byte & $7F]. About 68 cycles a colour.
macro ss_xform(name, src)
<name>:
.loop
	LDA.w <src>,X
	AND.w #$00FF
	ASL
	TAY
	LDA [$00],Y
	STA $06
	LDA.w <src>+1,X
	AND.w #$007F
	ASL                                           ; (carry clear: high byte < $80)
	TAY
	LDA [$03],Y
	ADC $06
	STA.l !SS_STAGE,X
	INX : INX
	CPX $08
	BCC .loop
	RTS
endmacro
%ss_xform(ss_xform_06, $0600)
%ss_xform(ss_xform_be, $BE00)

; A = colour -> A = the colour at the current white level (mode 2), else
; unchanged. Tables in the white tables' bank.
ss_white1:
	PHA
	LDA.l !ssw_pal_mode : CMP.w #2 : BEQ +
	PLA
	RTS
+	LDA $01,S : AND.w #$00FF : ASL
	CLC : ADC.l !ssw_pal_tl : TAX
	LDA.l (!SS_WHITE_LO)&$FF0000,X : STA.l !ssw_vtmp+12
	PLA : XBA : AND.w #$007F : ASL
	CLC : ADC.l !ssw_pal_th : TAX
	LDA.l (!SS_WHITE_LO)&$FF0000,X
	CLC : ADC.l !ssw_vtmp+12
	RTS

; ---------------------------------------------------------------------------
; The breach's HDMA tables for this frame (double-buffered: the vblank
; callback points the channels at the newest build).
ss_breach_build:
	LDA.l !ss_flags : AND.w #!SSF_WRECK : BEQ .off0
	LDA.l !ss_bmap : CMP.w $00DC : BNE .off0
	SEP #$20
	LDA.w $00E6 : CMP.b #$0F                      ; full brightness: no fade, no blank
	REP #$20
	BEQ +
.off0
	JMP .off
+	JSR ss_sand_fill
	LDA.l !ssw_sq_ok : BNE +
	JMP .off                                      ; no sand to show yet
+
	; the camera: the tile stream's origin corrected by BG1's own scroll
	; (sceneView: x0 + ((hscroll - x0 + 8) & 15) - 8)
	LDA.w $00B0 : SEC : SBC.w $00A8 : CLC : ADC.w #8 : AND.w #15
	CLC : ADC.w $00A8 : SEC : SBC.w #8 : STA.l !ssw_br_cx
	LDA.w $00B2 : SEC : SBC.w $00AA : CLC : ADC.w #8 : AND.w #15
	CLC : ADC.w $00AA : SEC : SBC.w #8 : STA.l !ssw_br_cy
	LDA.l !ss_bx : SEC : SBC.l !ssw_br_cx : STA.l !ssw_br_sx
	CLC : ADC.w #128 : CMP.w #256+256 : BCC +
	JMP .off                                      ; centre beyond 128 px off screen
+	LDA.l !ss_by : SEC : SBC.l !ssw_br_cy : STA.l !ssw_br_sy
	; the outline variant (phases of the jagged edge, 4 x 4) and its rows,
	; worked out once for the breach
	LDA.l !ssw_br_vok : BEQ .variant
	LDA.l !ssw_br_vx : CMP.l !ss_bx : BNE .variant
	LDA.l !ssw_br_vy : CMP.l !ss_by : BEQ .rows
.variant
	LDA.l !ss_bx : STA.l !ssw_br_vx : JSR ss_phase4 : STA.l !ssw_vtmp
	LDA.l !ss_by : STA.l !ssw_br_vy : JSR ss_phase4 : ASL : ASL : ORA.l !ssw_vtmp
	STA.l !ssw_br_var
	ASL : TAX
	LDA.l ss_breach_trim,X : AND.w #$00FF : STA.l !ssw_br_top
	LDA.l ss_breach_trim+1,X : AND.w #$00FF : STA.l !ssw_br_cnt
	LDA.w #1 : STA.l !ssw_br_vok
.rows
	; screen line of its first row, and the rows on screen y0..y1
	LDA.l !ssw_br_sy : SEC : SBC.w #!SS_BREACH_H : CLC : ADC.l !ssw_br_top
	STA.l !ssw_br_ys
	CLC : ADC.l !ssw_br_cnt : DEC : BMI .off      ; all above the screen
	CMP.w #224 : BCC +
	LDA.w #223
+	STA.l !ssw_br_y1
	LDA.l !ssw_br_ys : BPL +
	LDA.w #0
+	CMP.w #224 : BCS .off                         ; all below it
	STA.l !ssw_br_y0
	CMP.l !ssw_br_y1 : BEQ .on
	BCC .on
.off
	LDA.w #0 : STA.l !ssw_br_on
	RTS
.on
	; the sand's phase (1.5 px a frame) and the room's backdrop
	LDA.l !ss_wage : ASL : CLC : ADC.l !ss_wage : LSR : STA.l !ssw_br_sand
	LDA.l !ssw_pal_src : TAX
	LDA.w $0000,X                                 ; colour 0 of the game's buffer
	JSR ss_white1
	STA.l !SS_BQ_BK+2
	LDA.w #0 : STA.l !SS_BQ_BK
	LDA.w #$00FF : STA.l !SS_BW_NONE
	; the rows' window positions for this screen x
	JSR ss_breach_pairs
	; the tables, in the buffers the channels are not reading (the vblank
	; side may keep the programmed ones for a late frame)
	LDA.l !ss_own : BEQ .front
	LDA.l !ssw_br_p2 : CMP.w #(!SS_BT2)&$FFFF : BNE .front
	LDA.w #(!SS_BT2+!SS_BT_SIZE)&$FFFF : STA.l !ssw_br_t2
	LDA.w #(!SS_BT3+!SS_BT_SIZE)&$FFFF : STA.l !ssw_br_t3
	BRA .build
.front
	LDA.w #(!SS_BT2)&$FFFF : STA.l !ssw_br_t2
	LDA.w #(!SS_BT3)&$FFFF : STA.l !ssw_br_t3
.build
	JSR ss_breach_window
	JSR ss_breach_backdrop
	LDA.w #1 : STA.l !ssw_br_on
	RTS

; The sand of the current white level (extended data), into !SS_BQ for
; channel 3: 128 bytes a frame, restarted when the level changes. The
; breach shows once a full set has arrived; while a later level comes in
; a frame may show the two levels' rows mixed (the white fade only).
ss_sand_fill:
	LDA.l !ssw_white_lvl : CMP.l !ssw_sq_lvl : BEQ +
	STA.l !ssw_sq_lvl
	LDA.w #0 : STA.l !ssw_sq_fill
+	LDA.l !ssw_sq_fill : CMP.w #512 : BCC +
	RTS
+	PHB
	LDA.l !ssw_sq_lvl : XBA : ASL                 ; level * 512
	CLC : ADC.l !ssw_sq_fill
	CLC : ADC.w #(!SS_SAND_QUADS)&$FFFF : TAX
	LDA.l !ssw_sq_fill : CLC : ADC.w #(!SS_BQ)&$FFFF : TAY
	LDA.w #127
	db $54,(!SSW>>16)&$FF,(!SS_SAND_QUADS>>16)&$FF ; MVN extended data -> work bank
	PLB
	LDA.l !ssw_sq_fill : CLC : ADC.w #128 : STA.l !ssw_sq_fill
	CMP.w #512 : BCC +
	LDA.w #1 : STA.l !ssw_sq_ok
+	RTS

; The window positions (WH0, WH1) of the outline's rows at screen x
; !ssw_br_sx: kept while the cached buffer holds this x and outline, else
; made into the buffer the programmed tables do not use. Rows wholly off the
; screen get an empty window, the others are clamped to it. Sets
; !ssw_br_tpb (the buffer this frame's tables use).
ss_breach_pairs:
	LDA.l !ssw_br_cpb : BEQ .make
	LDA.l !ssw_br_psx : CMP.l !ssw_br_sx : BNE .make
	LDA.l !ssw_br_pvar : CMP.l !ssw_br_var : BNE .make
	LDA.l !ssw_br_cpb : STA.l !ssw_br_tpb
	RTS
.make
	LDA.l !ssw_br_ppb : CMP.w #(!SS_BP)&$FFFF : BEQ +
	LDA.w #(!SS_BP)&$FFFF
	BRA ++
+	LDA.w #(!SS_BP+!SS_BP_SIZE)&$FFFF
++	STA.l !ssw_br_cpb : STA.l !ssw_br_tpb
	LDA.l !ssw_br_sx : STA.l !ssw_br_psx
	LDA.l !ssw_br_var : STA.l !ssw_br_pvar
	PHB
	PHD
	TSC : SEC : SBC.w #6 : TCS                    ; a direct-page frame on the stack
	INC : TCD                                     ; $00 x offset, $02 end, $04 scratch
	; source: the outline's first row; end after its last
	LDA.l !ssw_br_var
	SEP #$20
	STA.l $004202
	LDA.b #!SS_BREACH_LINES*2 : STA.l $004203
	REP #$20
	LDA.l !ssw_br_top : ASL : STA $04
	LDA.l $004216 : CLC : ADC $04 : TAX
	LDA.l !ssw_br_cnt : ASL : STA $04
	TXA : CLC : ADC $04 : STA $02
	LDA.l !ssw_br_cpb : TAY
	PEA.w !SS_DB2 : PLB : PLB
	; on screen whole (every row): one 16-bit add per row
	LDA.l !ssw_br_sx : SEC : SBC.w #!SS_BREACH_BIAS : BMI .slow
	CMP.w #256-!SS_BREACH_RMAX-!SS_BREACH_BIAS : BCS .slow
	STA $00
	XBA : ORA $00 : STA $00                       ; (x - bias) * $0101
	CLC
.fast
	LDA.l ss_breach_spans,X : ADC $00 : STA.w $0000,Y
	LDA.l ss_breach_spans+2,X : ADC $00 : STA.w $0002,Y
	TXA : ADC.w #4 : TAX
	TYA : ADC.w #4 : TAY
	CPX $02 : BCC .fast
	BRA .done
.slow
	STA $00                                       ; x - bias (signed)
.row
	LDA.l ss_breach_spans+1,X : AND.w #$00FF : CLC : ADC $00 : BMI .empty
	CMP.w #256 : BCC +
	LDA.w #255
+	XBA : STA $04                                 ; right << 8
	LDA.l ss_breach_spans,X : AND.w #$00FF : CLC : ADC $00 : BPL +
	LDA.w #0
+	CMP.w #256 : BCS .empty
	ORA $04
	BRA .put
.empty
	LDA.w #$00FF                                  ; WH0 = $FF, WH1 = 0
.put
	STA.w $0000,Y
	INX : INX : INY : INY
	CPX $02 : BCC .row
.done
	TSC : CLC : ADC.w #6 : TCS
	PLD
	PLB
	RTS

; A = map coordinate (0..2047) -> A = floor(A * 4 / 2pi) & 3 (A * 163 / 256,
; the generator's phase buckets). X clobbered; no work memory (the floor
; query may come before the room's first frame).
ss_phase4:
	PHA
	SEP #$20
	LDA.b #163 : STA.l $004202
	LDA $02,S : STA.l $004203                     ; high byte * 163
	REP #$20
	NOP : NOP : NOP : NOP
	LDA.l $004216 : TAX
	SEP #$20
	LDA $01,S : STA.l $004203                     ; low byte * 163 / 256
	REP #$20
	NOP : NOP : NOP : NOP
	LDA.l $004216 : XBA : AND.w #$00FF : STA $01,S
	TXA : CLC : ADC $01,S
	PLX
	AND.w #$0003
	RTS

; floorHole() for flight's supported() (native-local-flight.js): carry set
; when the breach lies under one of the footprint's nine points around X, Y
; (map pixels; x -6/0/6, y -4/0/4): wrecked, Goku on, in the breach's room,
; inside the outline's span on that line (the window the hole is drawn
; through). M16/X16; X, Y kept; no work memory.
ss_floor_hole:
	LDA.l !persist_goku_active : AND.w #$00FF : BEQ .no
	LDA.l !ss_flags : AND.w #!SSF_WRECK : BEQ .no
	LDA.l !ss_bmap : CMP.l $7E00DC : BEQ +
.no
	CLC
	RTS
+	PHX
	PHY
	; the outline variant (phase(bx) | phase(by) << 2), its rows and spans
	LDA.l !ss_by : JSR ss_phase4 : ASL : ASL : PHA
	LDA.l !ss_bx : JSR ss_phase4 : ORA $01,S : STA $01,S
	ASL : TAX
	LDA.l ss_breach_trim,X : AND.w #$00FF : PHA
	LDA.l ss_breach_trim+1,X : AND.w #$00FF : CLC : ADC $01,S : PHA
	LDA $05,S
	SEP #$20
	STA.l $004202
	LDA.b #!SS_BREACH_LINES*2 : STA.l $004203
	REP #$20
	NOP : NOP : NOP : NOP
	LDA.l $004216 : STA $05,S                     ; [end][top][base][y][x]
	; x - bx biased by $1000 (unsigned compares), the row of y - 4
	LDA $09,S : SEC : SBC.l !ss_bx : CLC : ADC.w #$1000 : STA $09,S
	LDA $07,S : SEC : SBC.l !ss_by : CLC : ADC.w #!SS_BREACH_H-4 : STA $07,S
	LDY.w #3
.line
	LDA $07,S : CMP $03,S : BCC .next             ; above the outline's rows
	CMP $01,S : BCS .next                         ; below them
	ASL : CLC : ADC $05,S : TAX
	LDA.l ss_breach_spans+1,X : AND.w #$00FF
	CLC : ADC.w #$1000-!SS_BREACH_BIAS : PHA      ; right, biased
	LDA.l ss_breach_spans,X : AND.w #$00FF
	CLC : ADC.w #$1000-!SS_BREACH_BIAS : PHA      ; [left][right][end][top][base][row][x]
	LDA $0D,S : SEC : SBC.w #6
	CMP $01,S : BCC +
	CMP $03,S : BCC .hit : BEQ .hit
+	LDA $0D,S
	CMP $01,S : BCC +
	CMP $03,S : BCC .hit : BEQ .hit
+	LDA $0D,S : CLC : ADC.w #6
	CMP $01,S : BCC +
	CMP $03,S : BCC .hit : BEQ .hit
+	PLA
	PLA
.next
	LDA $07,S : CLC : ADC.w #4 : STA $07,S
	DEY : BNE .line
	PLA
	PLA
	PLA
	PLY
	PLX
	CLC
	RTS
.hit
	PLA
	PLA
	PLA
	PLA
	PLA
	PLY
	PLX
	SEC
	RTS

; FLIGHT_MISSING_FLOOR (flight/bind.asm: JSL, M16/X16, DB = $7E): carry set
; when a hole lies under the 12x8 footprint at !fl_q_x/y. A provider defined
; before this one (!DESTROY_NEXT_FLOOR: Frieza's deck, flight's test hole)
; answers everywhere off the wreck's breach.
if defined("FLIGHT_RAM")
destroy_ss_floor_hole:
	PHP
	REP #$30
	PHX
	PHY
	LDX.w !fl_q_x
	LDY.w !fl_q_y
	JSR ss_floor_hole
	PLY
	PLX
	BCS .hole
	PLP
if defined("DESTROY_NEXT_FLOOR")
	JML !DESTROY_NEXT_FLOOR
else
	CLC
	RTL
endif
.hole
	PLP
	SEC
	RTL
endif

; Channel 2 (indirect, mode 1: WH0, WH1): an empty window down to the
; outline, its rows from the pairs buffer, an empty window after it.
ss_breach_window:
	PHB
	PEA.w !SS_DB2 : PLB : PLB
	LDA.l !ssw_br_t2 : TAY
	LDA.l !ssw_br_y0 : BEQ .block
-	CMP.w #128 : BCC +
	PHA
	LDA.w #127 : JSR .none
	PLA : SEC : SBC.w #127
	BRA -
+	JSR .none
.block
	LDA.l !ssw_br_y1 : SEC : SBC.l !ssw_br_y0 : INC : ORA.w #$0080
	SEP #$20
	STA.w $0000,Y
	REP #$20
	; the row of line y0: tpb + (y0 - ys) * 2
	LDA.l !ssw_br_y0 : SEC : SBC.l !ssw_br_ys : ASL
	CLC : ADC.l !ssw_br_tpb : STA.w $0001,Y
	INY : INY : INY
	LDA.w #1 : JSR .none
	SEP #$20
	LDA.b #0 : STA.w $0000,Y                      ; end
	REP #$20
	PLB
	RTS
; A = lines: one entry of the empty window
.none
	SEP #$20
	STA.w $0000,Y
	REP #$20
	LDA.w #(!SS_BW_NONE)&$FFFF : STA.w $0001,Y
	INY : INY : INY
	RTS

; Channel 3 (indirect, mode 3: CGADD, CGADD, CGDATA, CGDATA): the room's
; backdrop, the sand on the outline's rows (its 128-line pattern from the
; world y of line y0 plus the phase, split where it wraps), the backdrop
; again.
ss_breach_backdrop:
	PHB
	PEA.w !SS_DB2 : PLB : PLB
	LDA.l !ssw_br_t3 : TAY
	LDA.l !ssw_br_y0 : BEQ .block
-	CMP.w #128 : BCC +
	PHA
	LDA.w #127 : JSR .bk
	PLA : SEC : SBC.w #127
	BRA -
+	JSR .bk
.block
	LDA.l !ssw_br_y1 : SEC : SBC.l !ssw_br_y0 : INC : STA.l !ssw_br_n
	LDA.l !ssw_br_y0 : CLC : ADC.l !ssw_br_cy : CLC : ADC.l !ssw_br_sand
	AND.w #$007F : STA.l !ssw_vtmp+4              ; first sand row
	LDA.w #128 : SEC : SBC.l !ssw_vtmp+4          ; rows before the wrap
	CMP.l !ssw_br_n : BCC +
	LDA.l !ssw_br_n
+	STA.l !ssw_vtmp+6
	JSR .sand
	LDA.l !ssw_br_n : SEC : SBC.l !ssw_vtmp+6 : BEQ +
	STA.l !ssw_vtmp+6
	LDA.w #0 : STA.l !ssw_vtmp+4
	JSR .sand
+	LDA.w #1 : JSR .bk
	SEP #$20
	LDA.b #0 : STA.w $0000,Y                      ; end
	REP #$20
	PLB
	RTS
; one repeat entry: !ssw_vtmp+6 rows of sand from row !ssw_vtmp+4
.sand
	LDA.l !ssw_vtmp+6 : ORA.w #$0080
	SEP #$20
	STA.w $0000,Y
	REP #$20
	LDA.l !ssw_vtmp+4 : ASL : ASL : CLC : ADC.w #(!SS_BQ)&$FFFF : STA.w $0001,Y
	INY : INY : INY
	RTS
; A = lines: one entry of the backdrop
.bk
	SEP #$20
	STA.w $0000,Y
	REP #$20
	LDA.w #(!SS_BQ_BK)&$FFFF : STA.w $0001,Y
	INY : INY : INY
	RTS

; ---------------------------------------------------------------------------
; Vblank side: destroy_field_nmi (JSL, first in modules_field_nmi), after
; the game's own uploads and HDMA setup, still force-blanked. DB = $80,
; M16/X16. The colours themselves go up in the game's own CGRAM upload
; (destroy_palette_dma below), so this costs no transfer time.
destroy_field_nmi:
	REP #$30
	LDA.l !ss_vis : AND.w #$FF00 : CMP.w #!SS_VIS_MAGIC : BNE .off
	LDA.l !ss_vis : AND.w #!SS_VIS_BREACH : BEQ .off
	JMP ss_nmi_breach
.off
	LDA.l !ss_own : BEQ +
	JSR ss_nmi_release
+	RTL

; Point HDMA channels 2/3 at this frame's tables and switch them on with
; window 1 masking BG1/BG2 on the main screen. $420C is written here at
; once (the game's own HDMA is set up by now): channels enabled before the
; frame's HDMA start keep working even when the rest of the vblank work
; (the game's final $420C write) runs past it. Entered by JMP; RTL.
ss_nmi_breach:
	JSR dst_vline
	CMP.w #225 : BCS +
	; the vblank is already over: nothing may be switched on now (a channel
	; enabled after the frame's HDMA start runs from stale pointers); ours
	; pause for this frame
	LDA.l !ss_own : BEQ ++
	SEP #$20
	LDA.l $7E002C : AND.b #$F3 : STA.l $7E002C
	REP #$20
++	RTL
+	LDA.l !ss_own : BEQ .take
	; still ours? (the game's spells and other modules use these channels)
	JSR ss_ch2_mine : BCC .taken0
	JSR ss_ch3_mine : BCS .program
.taken0
	JMP .taken
.take
	LDA.l $7E002C : AND.w #$000C : BEQ +
	RTL                                           ; someone else's HDMA
+	LDA.w #1 : STA.l !ss_own
.program
	SEP #$20
	LDA.b #$41 : STA $4320                        ; indirect, mode 1 (2 registers)
	LDA.b #$26 : STA $4321                        ; WH0, WH1
	LDA.b #!SSW>>16 : STA $4324 : STA $4327       ; tables and data in the work bank
	LDA.b #$43 : STA $4330                        ; indirect, mode 3 (B, B, B+1, B+1)
	LDA.b #$21 : STA $4331                        ; CGADD, CGDATA
	LDA.b #!SSW>>16 : STA $4334 : STA $4337
	REP #$20
	LDA.l !ssw_br_t2 : STA $4322 : STA.l !ssw_br_p2
	LDA.l !ssw_br_t3 : STA $4332 : STA.l !ssw_br_p3
	LDA.l !ssw_br_tpb : STA.l !ssw_br_ppb         ; the rows those tables read
	SEP #$20
	LDA.b #$22 : STA $2123                        ; window 1 on BG1 and BG2
	LDA.b #$03 : STA $212E                        ; masked on the main screen
	LDA.l $7E002C : ORA.b #$0C : STA.l $7E002C
	STA $420C
	REP #$20
	LDA.l !ssw_br_lines : INC : STA.l !ssw_br_lines
	RTL
.taken
	; another party reprogrammed a channel: stop ours, leave theirs
	JSR ss_nmi_release
	RTL

; C0:C0F0-C117, the field NMI's CGRAM upload (all 512 bytes from $7E:0600,
; or $BE00 while $2A is set, DMA channel 7; M8/X16, DB = 0, D = 0): the
; Sandship's staged colours replace their range of it, the rest comes from
; the game's buffer as before. Same bytes, same time. Returns to C0:C118
; with the original's registers: A = $0080 (the NMI keeps B = 0 from
; C0:C0AF), X = $0200, Y kept.
destroy_palette_dma:
	PHY
	PHP
	REP #$30
	; A vblank whose frame did not complete (a lag frame; with a window open
	; the game uploads every vblank) runs no module vblank callbacks: while
	; the Sandship's look is on, the OBJ palettes they wrote (the effects
	; library's, for the fires) stay in CGRAM and only the BG colours go up.
	; Everywhere else the upload is the original's 512 bytes.
	LDY.w #512
	LDA.l !ss_vis : AND.w #$FF00 : CMP.w #!SS_VIS_MAGIC : BNE +   ; (the Sandship's look only)
	LDA.l !core_dma_ready : BNE +
	LDY.w #256
+	LDA.l !ss_vis : AND.w #$FF00|!SS_VIS_PAL : CMP.w #!SS_VIS_MAGIC|!SS_VIS_PAL : BNE .native0
	LDA.l !ssw_pal_room : CMP.l $7E00DC : BNE .native0  ; made for another room
	LDA.l !ssw_pal_up : BNE +
.native0
	JMP .native
+	TYA : STA.l !ssw_vtmp+12                       ; end of the upload
	; the game's buffer before the staged range
	LDA.l !ssw_pal_upat : BEQ +
	TAY
	LDA.w #0
	JSR ss_cg_native
+	; the staged range (up to the end)
	LDA.l !ssw_pal_upat : PHA
	LSR : SEP #$20 : STA $2121 : REP #$20
	LDA.w #$2200 : STA $4370                      ; A->B, CGDATA
	PLA : CLC : ADC.w #(!SS_STAGE)&$FFFF : STA $4372
	SEP #$20
	LDA.b #(!SS_STAGE)>>16 : STA $4374
	REP #$20
	LDA.l !ssw_pal_upat : CLC : ADC.l !ssw_pal_up
	CMP.l !ssw_vtmp+12 : BCC +
	LDA.l !ssw_vtmp+12
+	SEC : SBC.l !ssw_pal_upat : BEQ +
	STA $4375
	SEP #$20
	LDA.b #$80 : STA $420B
	REP #$20
+	; and the game's buffer after it
	LDA.l !ssw_pal_upat : CLC : ADC.l !ssw_pal_up
	CMP.l !ssw_vtmp+12 : BCS +
	PHA
	EOR.w #$FFFF : SEC : ADC.l !ssw_vtmp+12 : TAY   ; end - offset
	PLA
	JSR ss_cg_native
+	LDA.l !ssw_pal_ups : INC : STA.l !ssw_pal_ups
	BRA .back
.native
	LDA.w #0
	JSR ss_cg_native
.back
	LDA.w #$0080
	LDX.w #$0200
	PLP
	PLY
	JML $00C118
; A = CGRAM byte offset, Y = bytes: from the game's buffer (as C0:C0F0).
ss_cg_native:
	PHA
	LSR : SEP #$20 : STA $2121 : REP #$20
	LDA.w #$2200 : STA $4370
	SEP #$20
	LDA.l $7E002A
	REP #$20
	BEQ +
	LDA.w #$BE00 : BRA ++
+	LDA.w #$0600
++	CLC : ADC $01,S : STA $4372
	SEP #$20
	LDA.b #$7E : STA $4374
	REP #$20
	TYA : STA $4375
	SEP #$20
	LDA.b #$80 : STA $420B
	REP #$20
	PLA
	RTS

; Carry: channel 2 / 3 hold this module's settings (mode, register, the
; SRAM bank of the tables) ...
ss_ch2_regs:
	SEP #$20
	LDA.l $004320 : CMP.b #$41 : BNE ss_ch_no
	LDA.l $004321 : CMP.b #$26 : BNE ss_ch_no
	LDA.l $004324 : CMP.b #!SSW>>16 : BNE ss_ch_no
	LDA.l $004327 : CMP.b #!SSW>>16 : BNE ss_ch_no
	REP #$20
	SEC
	RTS
ss_ch3_regs:
	SEP #$20
	LDA.l $004330 : CMP.b #$43 : BNE ss_ch_no
	LDA.l $004331 : CMP.b #$21 : BNE ss_ch_no
	LDA.l $004334 : CMP.b #!SSW>>16 : BNE ss_ch_no
	LDA.l $004337 : CMP.b #!SSW>>16 : BNE ss_ch_no
	REP #$20
	SEC
	RTS
ss_ch_no:
	REP #$20
	CLC
	RTS
; ... and still point at the tables programmed last (!SSW must be ours).
ss_ch2_mine:
	JSR ss_ch2_regs : BCC +
	LDA.l $004322 : CMP.l !ssw_br_p2 : BEQ +      ; (carry set when equal)
	CLC
+	RTS
ss_ch3_mine:
	JSR ss_ch3_regs : BCC +
	LDA.l $004332 : CMP.l !ssw_br_p3 : BEQ +
	CLC
+	RTS

; Give channels 2/3 back: each one still set up by us stops ($2C bit
; cleared); the windows go off with the window channel, and CGRAM 0 gets
; the game's backdrop back with the sand channel (its last row may have
; been the frame's last HDMA write). No work memory, long addressing
; (vblank or the ring frame, both in vblank).
ss_nmi_release:
	PEA $0000                                     ; $2C bits to clear
	JSR ss_ch2_regs : BCC +
	LDA $01,S : ORA.w #$0004 : STA $01,S
+	JSR ss_ch3_regs : BCC +
	LDA $01,S : ORA.w #$0008 : STA $01,S
	JSR ss_cg0_restore
+	PLA : BEQ .done
	SEP #$20
	EOR.b #$FF : AND.l $7E002C : STA.l $7E002C
	REP #$20
	JSR ss_ch2_regs : BCC .done
	SEP #$20
	LDA.b #0 : STA.l $002123 : STA.l $00212E
	REP #$20
.done
	LDA.w #0 : STA.l !ss_own
	RTS

; CGRAM 0 = colour 0 of the game's palette buffer ($7E:0600, $BE00 while
; $2A is set). Vblank only.
ss_cg0_restore:
	SEP #$20
	LDA.b #0 : STA.l $002121
	LDA.l $7E002A
	REP #$20
	BEQ +
	LDA.l $7EBE00
	BRA ++
+	LDA.l $7E0600
++	SEP #$20
	STA.l $002122
	XBA : STA.l $002122
	REP #$20
	RTS

; destroy_ring_frame (JSL from modules_ring_frame, in vblank, DB = $7E): the
; field's vblank callbacks stop while a ring menu is open, so the breach
; lets go of HDMA there.
destroy_ring_frame:
	REP #$30
	LDA.l !ss_own : BEQ +
	JSR ss_nmi_release
+	RTL
