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
; The channels are taken only while nobody else uses them ($2C bits 2/3
; clear), given back when the room fades, the ring menu opens or another
; party reprograms them, and switched on only with vblank time left.
;
; Deviations: one sand colour per scanline (the browser's sand varies along
; the line too) and no soot or fire rim drawn into the floor (the rim's five
; fires and the room's fires are sprites).

!SS_DB2 #= ((!SSW>>16)&$FF)|(((!SSW>>16)&$FF)<<8)  ; PEA operand: DB = the work bank

; ---------------------------------------------------------------------------
; Field side (ss_frame, inside the arc's window). M16/X16, DB = $7E.
ss_visuals:
	JSR ss_pal_choose
	JSR ss_pal_run
	JSR ss_breach_build
	LDA.w #!SS_VIS_MAGIC : STA.l !ssw_vtmp
	LDA.l !ssw_pal_up : BEQ +
	LDA.l !ssw_vtmp : ORA.w #!SS_VIS_PAL : STA.l !ssw_vtmp
+	LDA.l !ssw_br_on : BEQ +
	LDA.l !ssw_vtmp : ORA.w #!SS_VIS_BREACH : STA.l !ssw_vtmp
+	LDA.l !ssw_vtmp : STA.l !ss_vis
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
	ORA.w #$0200 : STA.l !ssw_vtmp+4              ; key: mode 2
	LDA.l !ssw_vtmp+2 : XBA : ASL                 ; level * 512
	CLC : ADC.w #ss_white_lo&$FFFF : STA.l !ssw_pal_tl
	LDA.l !ssw_vtmp+2 : XBA                       ; level * 256
	CLC : ADC.w #ss_white_hi&$FFFF : STA.l !ssw_pal_th
	SEP #$20
	LDA.b #ss_white_lo>>16 : STA.l !ssw_pal_tl+2 : STA.l !ssw_pal_th+2
	REP #$20
	LDA.w #0 : STA.l !ssw_vtmp+6                  ; every colour
	LDA.w #512 : STA.l !ssw_vtmp+8
	JMP .set
.tint
	LDA.l !ss_flags : AND.w #!SSF_WRECK : BNE +
	JMP .none
+	LDA.w $00DC : JSR ss_ship_map : BCS +
	JMP .none
+	; phase = age % 120 (alarm), k = (age >> 2) & 255 (flicker)
	LDA.l !ss_wage : STA.l $004204
	SEP #$20
	LDA.b #120 : STA.l $004206
	REP #$20
	LDA.l !ss_wage : LSR : LSR : AND.w #$00FF : ASL : STA.l !ssw_vtmp+2
	NOP : NOP : NOP : NOP
	LDA.l $004216 : ASL : TAX                     ; phase * 2
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
+	JSR ss_pal_budget : BCC .go
	LDA.l !ssw_pal_wait : INC : STA.l !ssw_pal_wait
	CMP.w #!SS_PAL_STARVE : BCS .go
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
	JSR ss_pal_budget : BCC .chunk
.out
	LDA.l !ssw_pal_done : STA.l !ssw_pal_up
	LDA.l !ssw_pal_first : STA.l !ssw_pal_upat
	TSC : CLC : ADC.w #12 : TCS
	PLD
	RTS

; Carry set when this field frame's time for palette work is spent (as
; dst_budget, up to scanline !SS_PAL_LINE, or !SS_PAL_LINE_WHITE during a
; white-out). Uses the latched counters only.
ss_pal_budget:
	LDA.w #!SS_PAL_LINE : STA.l !ssw_vtmp+14
	LDA.l !ssw_pal_mode : CMP.w #2 : BNE +
	LDA.w #!SS_PAL_LINE_WHITE : STA.l !ssw_vtmp+14
+	JSR dst_vline
	PHA
	LDA.w !d_vstart : CMP.w #225 : BCS .vblank
	CMP.l !ssw_vtmp+14 : BCS .out
	PLA : CMP.w !d_vstart : BCC .spent
	CMP.l !ssw_vtmp+14 : BCS .spent
	CLC
	RTS
.vblank
	PLA : CMP.w !d_vstart : BCS .in
	CMP.l !ssw_vtmp+14 : BCS .spent
.in
	CLC
	RTS
.out
	PLA
.spent
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
	LDA.l ss_white_lo&$FF0000,X : STA.l !ssw_vtmp+12
	PLA : XBA : AND.w #$007F : ASL
	CLC : ADC.l !ssw_pal_th : TAX
	LDA.l ss_white_lo&$FF0000,X
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
+
	; the camera: the tile stream's origin corrected by BG1's own scroll
	; (sceneView: x0 + ((hscroll - x0 + 8) & 15) - 8)
	LDA.w $00B0 : SEC : SBC.w $00A8 : CLC : ADC.w #8 : AND.w #15
	CLC : ADC.w $00A8 : SEC : SBC.w #8 : STA.l !ssw_br_cx
	LDA.w $00B2 : SEC : SBC.w $00AA : CLC : ADC.w #8 : AND.w #15
	CLC : ADC.w $00AA : SEC : SBC.w #8 : STA.l !ssw_br_cy
	LDA.l !ss_bx : SEC : SBC.l !ssw_br_cx : STA.l !ssw_br_sx
	CLC : ADC.w #128 : CMP.w #256+256 : BCS .off  ; centre beyond 128 px off screen
	LDA.l !ss_by : SEC : SBC.l !ssw_br_cy : STA.l !ssw_br_sy
	; visible lines y0..y1
	CLC : ADC.w #!SS_BREACH_H : BMI .off
	CMP.w #224 : BCC +
	LDA.w #223
+	STA.l !ssw_br_y1
	LDA.l !ssw_br_sy : SEC : SBC.w #!SS_BREACH_H : BPL +
	LDA.w #0
+	CMP.w #224 : BCS .off
	STA.l !ssw_br_y0
	CMP.l !ssw_br_y1 : BEQ .on
	BCC .on
.off
	LDA.w #0 : STA.l !ssw_br_on
	RTS
.on
	; the outline variant: phases of the jagged edge (4 x 4)
	LDA.l !ss_bx : JSR ss_phase4 : STA.l !ssw_vtmp
	LDA.l !ss_by : JSR ss_phase4 : ASL : ASL : ORA.l !ssw_vtmp
	; * lines * 2 bytes (hardware multiply)
	SEP #$20
	STA.l $004202
	LDA.b #!SS_BREACH_LINES*2 : STA.l $004203
	REP #$20
	NOP : NOP : NOP : NOP
	LDA.l $004216 : STA.l !ssw_br_span
	; the sand's phase (1.5 px a frame) and the room's backdrop
	LDA.l !ss_wage : ASL : CLC : ADC.l !ss_wage : LSR : STA.l !ssw_br_sand
	LDA.l !ssw_pal_src : TAX
	LDA.w $0000,X                                 ; colour 0 of the game's buffer
	JSR ss_white1
	STA.l !ssw_br_bk
	; the back buffer
	LDA.l !ssw_br_buf : CLC : ADC.w #(!SS_HB)&$FFFF
	STA.l !ssw_br_t2
	CLC : ADC.w #!SS_HB_CH3 : STA.l !ssw_br_t3
	JSR ss_breach_window
	JSR ss_breach_backdrop
	LDA.l !ssw_br_buf : EOR.w #!SS_HB_SIZE : STA.l !ssw_br_buf
	LDA.w #1 : STA.l !ssw_br_on
	RTS

; A = map coordinate (0..2047) -> A = floor(A * 4 / 2pi) & 3 (A * 163 / 256,
; the generator's phase buckets).
ss_phase4:
	PHA
	SEP #$20
	LDA.b #163 : STA.l $004202
	LDA $01,S : STA.l $004203
	REP #$20
	NOP : NOP : NOP : NOP
	LDA.l $004216 : XBA : AND.w #$00FF : STA.l !ssw_vtmp+2
	SEP #$20
	LDA $02,S : STA.l $004203
	REP #$20
	NOP : NOP : NOP : NOP
	LDA.l $004216 : CLC : ADC.l !ssw_vtmp+2
	PLX
	AND.w #$0003
	RTS

; Lines before the outline: one entry holding an empty window / the room's
; backdrop for !ssw_br_y0 lines (split at 127). Y = write offset (DB = $32),
; A = 2 or 4 data bytes per entry (empty window or backdrop).
; Channel 2 (window 1, mode 1: WH0, WH1).
ss_breach_window:
	PHB
	PEA.w !SS_DB2 : PLB : PLB
	LDA.l !ssw_br_t2 : TAY
	LDA.l !ssw_br_y0 : BEQ .block
-	CMP.w #128 : BCC +
	PHA
	LDA.w #$FF7F : STA.w $0000,Y                  ; 127 lines, WH0 = $FF
	LDA.w #$0000 : STA.w $0002,Y                  ; WH1 = 0 (empty)
	INY : INY : INY
	PLA : SEC : SBC.w #127
	BRA -
+	ORA.w #$FF00 : STA.w $0000,Y
	LDA.w #0 : STA.w $0002,Y
	INY : INY : INY
.block
	; the outline's lines, repeat mode
	LDA.l !ssw_br_y1 : SEC : SBC.l !ssw_br_y0 : INC
	STA.l !ssw_br_n
	ORA.w #$0080
	SEP #$20
	STA.w $0000,Y
	REP #$20
	INY
	; span index of line y0: (y0 - sy + H) * 2
	LDA.l !ssw_br_y0 : SEC : SBC.l !ssw_br_sy : CLC : ADC.w #!SS_BREACH_H
	ASL : CLC : ADC.l !ssw_br_span : TAX
.line
	LDA.l ss_breach_spans,X : AND.w #$00FF
	CMP.w #$0080 : BEQ .empty
	EOR.w #$0080 : SEC : SBC.w #$0080             ; signed left offset
	CLC : ADC.l !ssw_br_sx : STA.l !ssw_vtmp+4    ; xl
	LDA.l ss_breach_spans+1,X : AND.w #$00FF
	EOR.w #$0080 : SEC : SBC.w #$0080
	CLC : ADC.l !ssw_br_sx                        ; xr
	BMI .empty                                    ; all left of the screen
	CMP.w #256 : BCC +
	LDA.w #255
+	XBA : STA.l !ssw_vtmp+6                       ; xr << 8
	LDA.l !ssw_vtmp+4 : BPL +
	LDA.w #0
+	CMP.w #256 : BCS .empty                       ; all right of the screen
	ORA.l !ssw_vtmp+6
	BRA .put
.empty
	LDA.w #$00FF                                  ; WH0 = $FF, WH1 = 0
.put
	STA.w $0000,Y
	INY : INY
	INX : INX
	LDA.l !ssw_br_n : DEC : STA.l !ssw_br_n
	BNE .line
	; after the outline: an empty window to the end of the frame
	LDA.w #$FF01 : STA.w $0000,Y
	LDA.w #$0000 : STA.w $0002,Y                  ; WH1 = 0, then the end
	PLB
	RTS

; Channel 3 (mode 3: CGADD, CGADD, CGDATA, CGDATA): the room's backdrop,
; the sand on the outline's lines, the backdrop again.
ss_breach_backdrop:
	PHB
	PEA.w !SS_DB2 : PLB : PLB
	LDA.l !ssw_br_t3 : TAY
	LDA.l !ssw_br_y0 : BEQ .block
-	CMP.w #128 : BCC +
	PHA
	LDA.w #127 : JSR .backdrop
	PLA : SEC : SBC.w #127
	BRA -
+	JSR .backdrop
.block
	LDA.l !ssw_br_y1 : SEC : SBC.l !ssw_br_y0 : INC
	STA.l !ssw_br_n
	ORA.w #$0080
	SEP #$20
	STA.w $0000,Y
	REP #$20
	INY
	; world y of line y0, plus the sand's phase
	LDA.l !ssw_br_y0 : CLC : ADC.l !ssw_br_cy : CLC : ADC.l !ssw_br_sand
	STA.l !ssw_vtmp+4
.line
	LDA.w #0 : STA.w $0000,Y                      ; CGADD 0, 0
	LDA.l !ssw_vtmp+4 : AND.w #$007F : ASL : TAX
	LDA.l ss_sand,X
	JSR ss_white1
	STA.w $0002,Y
	INY : INY : INY : INY
	LDA.l !ssw_vtmp+4 : INC : STA.l !ssw_vtmp+4
	LDA.l !ssw_br_n : DEC : STA.l !ssw_br_n
	BNE .line
	LDA.w #1 : JSR .backdrop
	SEP #$20
	LDA.b #0 : STA.w $0000,Y                      ; end
	REP #$20
	PLB
	RTS
; A = lines: one entry with the room's backdrop
.backdrop
	SEP #$20
	STA.w $0000,Y
	REP #$20
	LDA.w #0 : STA.w $0001,Y
	LDA.l !ssw_br_bk : STA.w $0003,Y
	TYA : CLC : ADC.w #5 : TAY
	RTS

; ---------------------------------------------------------------------------
; Vblank side: destroy_field_nmi (JSL from modules_field_nmi), after the
; game's own uploads, still force-blanked. DB = $80, M16/X16.
destroy_field_nmi:
	REP #$30
	LDA.l !ss_vis : AND.w #$FF00 : CMP.w #!SS_VIS_MAGIC : BEQ .valid
	LDA.l !ss_own : BEQ +
	JSR ss_nmi_release
+	RTL
.valid
	LDA.l !ss_vis : AND.w #!SS_VIS_PAL : BEQ +
	JSR ss_nmi_palette
+	LDA.l !ss_vis : AND.w #!SS_VIS_BREACH : BEQ +
	JSR ss_nmi_breach
	RTL
+	LDA.l !ss_own : BEQ +
	JSR ss_nmi_release
+	RTL

; The staged colours -> CGRAM, general DMA on channel 7 (6 while 7 runs
; HDMA), during the forced blank.
ss_nmi_palette:
	LDA.l $7E002C : AND.w #$0080 : BEQ .c7
	LDA.l $7E002C : AND.w #$0040 : BEQ .c6
	RTS
.c7
	LDX.w #$0070 : LDA.w #$0080 : BRA .go
.c6
	LDX.w #$0060 : LDA.w #$0040
.go
	STA.l !ssw_vtmp+14
	LDA.l !ssw_pal_upat : LSR
	SEP #$20
	STA $2121
	LDA.b #$00 : STA $4300,X                      ; A->B, one register
	LDA.b #$22 : STA $4301,X                      ; CGDATA
	LDA.b #(!SS_STAGE)>>16 : STA $4304,X
	REP #$20
	LDA.l !ssw_pal_upat : CLC : ADC.w #(!SS_STAGE)&$FFFF : STA $4302,X
	LDA.l !ssw_pal_up : STA $4305,X
	SEP #$20
	LDA.l !ssw_vtmp+14 : STA $420B
	REP #$20
	LDA.l !ssw_pal_ups : INC : STA.l !ssw_pal_ups
	RTS

; Point HDMA channels 2/3 at this frame's tables, switch them on with
; window 1 masking BG1/BG2 on the main screen.
ss_nmi_breach:
	JSL core_vblank_lines
	CMP.w #2 : BCS +
	; no time to switch HDMA on inside this vblank: off for this frame
	LDA.l !ss_own : BEQ ++
	JSR ss_nmi_release
++	RTS
+	LDA.l !ss_own : BEQ .take
	; still ours? (the game's spells and other modules use these channels)
	JSR ss_ch2_mine : BCC .taken
	JSR ss_ch3_mine : BCC .taken
	BRA .program
.take
	LDA.l $7E002C : AND.w #$000C : BEQ +
	RTS                                           ; someone else's HDMA
+	LDA.w #1 : STA.l !ss_own
.program
	SEP #$20
	LDA.b #$01 : STA $4320                        ; direct, mode 1 (2 registers)
	LDA.b #$26 : STA $4321                        ; WH0, WH1
	LDA.b #!SSW>>16 : STA $4324
	LDA.b #$03 : STA $4330                        ; direct, mode 3 (B, B, B+1, B+1)
	LDA.b #$21 : STA $4331                        ; CGADD, CGDATA
	LDA.b #!SSW>>16 : STA $4334
	REP #$20
	LDA.l !ssw_br_t2 : STA $4322 : STA.l !ssw_br_p2
	LDA.l !ssw_br_t3 : STA $4332 : STA.l !ssw_br_p3
	SEP #$20
	LDA.b #$22 : STA $2123                        ; window 1 on BG1 and BG2
	LDA.b #$03 : STA $212E                        ; masked on the main screen
	LDA.l $7E002C : ORA.b #$0C : STA.l $7E002C    ; the NMI writes $420C next
	REP #$20
	LDA.l !ssw_br_lines : INC : STA.l !ssw_br_lines
	RTS
.taken
	; another party reprogrammed a channel: stop ours, leave theirs
	JMP ss_nmi_release

; Carry: channel 2 / 3 hold this module's settings (mode, register, the
; SRAM bank of the tables) ...
ss_ch2_regs:
	SEP #$20
	LDA.l $004320 : CMP.b #$01 : BNE ss_ch_no
	LDA.l $004321 : CMP.b #$26 : BNE ss_ch_no
	LDA.l $004324 : CMP.b #!SSW>>16 : BNE ss_ch_no
	REP #$20
	SEC
	RTS
ss_ch3_regs:
	SEP #$20
	LDA.l $004330 : CMP.b #$03 : BNE ss_ch_no
	LDA.l $004331 : CMP.b #$21 : BNE ss_ch_no
	LDA.l $004334 : CMP.b #!SSW>>16 : BNE ss_ch_no
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
; cleared); the windows go off with the window channel. No work memory, long
; addressing (vblank or the ring frame).
ss_nmi_release:
	PEA $0000                                     ; $2C bits to clear
	JSR ss_ch2_regs : BCC +
	LDA $01,S : ORA.w #$0004 : STA $01,S
+	JSR ss_ch3_regs : BCC +
	LDA $01,S : ORA.w #$0008 : STA $01,S
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

; destroy_ring_frame (JSL from modules_ring_frame, in vblank, DB = $7E): the
; field's vblank callbacks stop while a ring menu is open, so the breach
; lets go of HDMA there.
destroy_ring_frame:
	REP #$30
	LDA.l !ss_own : BEQ +
	JSR ss_nmi_release
+	RTL
