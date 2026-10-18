; The Mode 7 globe (planet-view.js planet()) and its per-scanline tables.
;
; Every line of the disc shows one texture row: the browser's latitude for
; that line, round(asin(j/r) * 325.95) texels from the centre row. Along the
; line the longitude is linear in x (M7A per line = ORBIT_K * 162.97 texels
; over the half chord), centred on the stepped target. Window 1 masks BG1 to
; the disc (x^2 + j^2 <= r^2, the browser's d <= 1); window 2 is the rim's
; outer edge (d <= 1.07) and colour math adds the rim blue to the backdrop
; between them (W1 XOR W2).
;
; Fight radii (56-104) use ROM line tables (snes/gen/orbit.mjs lineTables):
; M7A and M7D per line are read by indirect HDMA straight from bank F7, with
; M7B = M7C = 0, M7Y = ybase and M7VOFS = ybase + K - cy - 1, so the texture
; rows follow from the PPU's own d * (line + VOFS - M7Y) product and do not
; depend on the centre line or the latitude. Only the window block (screen
; columns of the disc and rim edges) is computed, when the centre column or
; the radius changes; a new centre line or latitude costs nothing but a few
; HDMA table entries and registers. DB = $32, M16/X16 unless noted.

; Per frame: stepped target, registers for the NMI, tables if needed.
globe_frame:
	REP #$30
	; target.x = round(lon / 8) * 8; X0 = floor((target.x - 670.5) / 4)
	LDA.w !cam_lon
	CLC : ADC.w #$0004
	AND.w #$0FF8
	ASL : ASL : ASL : ASL          ; x16
	SEC : SBC.w #!ORBIT_LON_OFFSET16
	LSR : LSR : LSR : LSR : LSR : LSR   ; /64 (16-bit wrap = one turn)
	AND.w #$03FF
	STA.w !g_x0
	STA.w !g_m7x
	; M7HOFS = X0 - cx: texel X0 sits under screen column cx (the column
	; of the published window block, which may trail the camera by a few
	; frames while the next block is built)
	SEC : SBC.w !g_cx
	AND.w #$1FFF
	STA.w !g_hofs
	; target.y = round(lat / 8) * 8; ybase = floor((target.y + 992.8) / 4)
	LDA.w !cam_lat
	CLC : ADC.w #$0004
	AND.w #$0FF8
	ASL : ASL : ASL : ASL
	CLC : ADC.w #!ORBIT_LAT_OFFSET16
	LSR : LSR : LSR : LSR : LSR : LSR
	AND.w #$03FF
	STA.w !g_ybase
	; M7VOFS = ybase + K - cy - 1 (13 bits)
	CLC : ADC.w #!ORBIT_ROWK-1
	SEC : SBC.w !cam_y
	AND.w #$1FFF
	STA.w !g_vofs
	; Static BGMODE table for the text band.
	SEP #$20
	LDA.w !g_text
	CMP.w !g_textset
	BEQ +
	JSR globe_mode_table
+	REP #$30
	; Window block for the radius and the centre column: started here and
	; built in the frame's spare time (orbit_background) into the back
	; block; the scene's first block is built at once.
	LDA.w !g_bld
	BNE .shapeOk
	JSR globe_clamp_r
	CMP.w !g_lr
	BNE .start
	LDA.w !cam_x
	CMP.w !g_cx
	BEQ .shapeOk
.start
	JSR globe_clamp_r
	JSR globe_build_start
	LDA.w !g_lr
	CMP.w #$FFFF
	BNE .shapeOk
	LDA.w #$00FF
	STA.w !g_bld_n
	JSR globe_build_step
	; the M7 registers follow the published block
	LDA.w !g_x0
	SEC : SBC.w !g_cx
	AND.w #$1FFF
	STA.w !g_hofs
.shapeOk
	LDA.w !cam_y
	CMP.w !g_icy
	BNE .itab
	LDA.w !g_ichg
	BEQ .done
.itab
	JSR globe_itables
.done
	RTS

; A16 = cam_r clamped to the fight tables' radii.
globe_clamp_r:
	LDA.w !cam_r
	CMP.w #!ORBIT_FIGHT_R0
	BCS +
	LDA.w #!ORBIT_FIGHT_R0
+	CMP.w #!ORBIT_FIGHT_R1+1
	BCC +
	LDA.w #!ORBIT_FIGHT_R1
+	RTS

; BGMODE ($2105) per line: Mode 1 for the text band (BG3 panel), Mode 7
; down to line 195, Mode 1 for the HUD rows from line 196.
globe_mode_table:
	SEP #$20
	STA.w !g_textset
	REP #$30
	LDY.w #!hb_mode
	LDA.w !g_text
	AND.w #$00FF
	STA.w !g_tmp
	BEQ .noText
	SEP #$20
	STA.w $0000,Y                  ; count (< 128), Mode 1 + BG3 priority
	LDA.b #$09
	STA.w $0001,Y
	REP #$20
	INY : INY
.noText
	LDA.w #196
	SEC : SBC.w !g_tmp             ; Mode 7 lines
.m7
	CMP.w #$0080
	BCC .m7last
	PHA
	SEP #$20
	LDA.b #$7F
	STA.w $0000,Y
	LDA.b #$07
	STA.w $0001,Y
	REP #$20
	INY : INY
	PLA
	SEC : SBC.w #$007F
	BRA .m7
.m7last
	SEP #$20
	STA.w $0000,Y
	LDA.b #$07
	STA.w $0001,Y
	LDA.b #$01                     ; line 196: Mode 1 (the HUD rows)
	STA.w $0002,Y
	LDA.b #$09
	STA.w $0003,Y
	LDA.b #$00
	STA.w $0004,Y
	REP #$30
	RTS

; Start a window block for radius A (clamped) and centre column cam_x in
; the block the NMI is not using.
globe_build_start:
	REP #$30
	STA.w !g_bld_r
	SEC : SBC.w #!ORBIT_FIGHT_R0
	ASL : ASL : ASL
	TAX                            ; index entry
	LDA.l !FL+0,X : STA.w !g_bR
	LDA.l !FL+6,X : STA.w !g_bww
	LDA.w #!gb_wina
	CMP.w !g_lw
	BNE +
	LDA.w #!gb_winb
+	STA.w !g_bw
	LDA.w !cam_x
	STA.w !g_bld_cx
	STZ.w !g_bld_a
	LDA.w #$0001
	STA.w !g_bld
	RTS

; Rows a = g_bld_a.. of the pending block (at most g_bld_n this frame), each
; written at row +a and mirrored to row -a: W1 = cx -+ w (the disc), W2 =
; cx -+ w2 (the rim), clamped to the screen; $FF, 0 when a row has none.
; Publishes the block with the radius's ROM M7A/M7D blocks when complete.
globe_build_step:
	REP #$30
	LDA.w !g_bR
	INC
	SEC : SBC.w !g_bld_a           ; rows left
	CMP.w !g_bld_n
	BCC +
	LDA.w !g_bld_n
+	STA.w !g_tmp+4
	LDA.w !g_bR
	CLC : ADC.w !g_bld_a
	ASL : ASL
	CLC : ADC.w !g_bw
	TAY                            ; entry of row +a
	LDA.w !g_bR
	SEC : SBC.w !g_bld_a
	ASL : ASL
	CLC : ADC.w !g_bw
	STA.w !g_tmp+2                 ; entry of row -a
	LDA.w !g_bld_a
	ASL
	CLC : ADC.w !g_bww
	TAX                            ; chord pair (bank F7)
	LDA.w !g_tmp+4
	CLC : ADC.w !g_bld_a
	STA.w !g_bld_a
	SEP #$20
	LDA.w !g_bld_cx
	STA.w !g_tmp+6
.row
	LDA.l !FL,X                    ; w ($FF none)
	CMP.b #$FF
	BEQ .noDisc
	STA.w !g_tmp+8
	LDA.w !g_tmp+6
	SEC : SBC.w !g_tmp+8           ; cx - w
	BCS +
	LDA.b #$00
+	STA.w $0000,Y
	LDA.w !g_tmp+6
	CLC : ADC.w !g_tmp+8           ; cx + w
	BCC +
	LDA.b #$FF
+	STA.w $0001,Y
	BRA .rim
.noDisc
	STA.w $0000,Y                  ; $FF, 0: empty
	LDA.b #$00
	STA.w $0001,Y
.rim
	LDA.l !FL+1,X                  ; w2
	CMP.b #$FF
	BEQ .noRim
	STA.w !g_tmp+8
	LDA.w !g_tmp+6
	SEC : SBC.w !g_tmp+8
	BCS +
	LDA.b #$00
+	STA.w $0002,Y
	LDA.w !g_tmp+6
	CLC : ADC.w !g_tmp+8
	BCC +
	LDA.b #$FF
+	STA.w $0003,Y
	BRA .mirror
.noRim
	STA.w $0002,Y
	LDA.b #$00
	STA.w $0003,Y
.mirror
	REP #$20
	PHX
	LDX.w !g_tmp+2
	LDA.w $0000,Y : STA.w $0000,X
	LDA.w $0002,Y : STA.w $0002,X
	DEX : DEX : DEX : DEX
	STX.w !g_tmp+2
	PLX
	SEP #$20
	INX : INX
	INY : INY : INY : INY
	DEC.w !g_tmp+4
	BEQ .rowsDone
	LDA.w !g_lr+1                  ; the scene's first block is built at once
	CMP.b #$FF
	BEQ .rowNext
	JSR orbit_late
	BCC .rowNext
	; out of time: the rows left wait for the next frame
	REP #$30
	LDA.w !g_tmp+4
	AND.w #$00FF
	EOR.w #$FFFF : INC
	CLC : ADC.w !g_bld_a
	STA.w !g_bld_a
	RTS
.rowNext
	JMP .row
.rowsDone
	REP #$30
	LDA.w !g_bR
	CMP.w !g_bld_a
	BCC .publish                   ; next row > R: complete
	RTS
.publish
	STZ.w !g_bld
	LDA.w !g_bld_r : STA.w !g_lr
	LDA.w !g_bld_cx : STA.w !g_cx
	LDA.w !g_bld_r
	SEC : SBC.w #!ORBIT_FIGHT_R0
	ASL : ASL : ASL
	TAX
	LDA.l !FL+2,X : STA.w !g_la
	LDA.l !FL+4,X : STA.w !g_ld
	LDA.w !g_bR : STA.w !g_lR
	LDA.w !g_bw : STA.w !g_lw
	LDA.w #$0001
	STA.w !g_ichg
	RTS

; Indirect HDMA tables for the published blocks and centre line cam_y:
; lines [top, bot] = rows cy-R..cy+R clipped to 0..195.
globe_itables:
	REP #$30
	STZ.w !g_ichg
	INC.w !s_kgen                  ; the stars' culling rows moved
	LDA.w !cam_y
	STA.w !g_icy
	; the set the NMI is not using
	LDA.w !g_cur_it
	EOR.w #!IT_SIZE
	STA.w !g_it
	; empty record
	LDA.w #$00FF
	STA.w !gb_empty
	STA.w !gb_empty+2
	; top / bot, first row index
	LDA.w !cam_y
	SEC : SBC.w !g_lR
	STA.w !g_tmp+0                 ; line of row -R (signed)
	BPL +
	LDA.w #$0000
+	STA.w !g_top
	LDA.w !cam_y
	CLC : ADC.w !g_lR
	BMI .none
	CMP.w #196
	BCC +
	LDA.w #195
+	STA.w !g_bot
	LDA.w !g_top
	CMP.w #196
	BCS .none
	CMP.w !g_bot
	BEQ .some
	BCC .some
.none
	; nothing on screen: windows empty all frame
	LDX.w !g_it
	SEP #$20
	LDA.b #$01
	STA.w !IT_BASE+!it_win,X
	LDA.b #$00
	STA.w !IT_BASE+!it_win+3,X
	STA.w !IT_BASE+!it_m7a,X
	STA.w !IT_BASE+!it_m7d,X
	REP #$20
	LDA.w #!gb_empty
	STA.w !IT_BASE+!it_win+1,X
	JMP .publish
.some
	; first row on screen: (top - line of row -R), entry offsets
	LDA.w !g_top
	SEC : SBC.w !g_tmp+0
	STA.w !g_tmp+2                 ; row index (0 = row -R)
	ASL : ASL
	CLC : ADC.w !g_lw
	STA.w !g_tmp+4                 ; window entry
	LDA.w !g_tmp+2
	ASL
	STA.w !g_tmp+6
	CLC : ADC.w !g_la
	STA.w !g_tmp+8                 ; M7A entry
	LDA.w !g_tmp+6
	CLC : ADC.w !g_ld
	STA.w !g_tmp+10                ; M7D entry
	; lines on the globe
	LDA.w !g_bot
	SEC : SBC.w !g_top
	INC
	STA.w !g_tmp+12
	; write the three tables (Y = offset within each table)
	LDA.w !g_it
	CLC : ADC.w #!IT_BASE
	TAY
	; lead: lines [0, top), at most two entries of <= 127 lines
	LDA.w !g_top
	BEQ .body
	JSR .lead
	LDA.w !g_top
	SEC : SBC.w #127
	BMI .body
	BEQ .body
	JSR .lead
.body
	; repeat entries of <= 127 lines
	LDA.w !g_tmp+12
	CMP.w #128
	BCC .last
	LDA.w #127
	JSR .chunk
	LDA.w !g_tmp+12
	SEC : SBC.w #127
	STA.w !g_tmp+12
.last
	LDA.w !g_tmp+12
	JSR .chunk
	; windows: one empty line, then the registers hold; terminators
	SEP #$20
	LDA.b #$01
	STA.w !it_win,Y
	LDA.b #$00
	STA.w !it_win+3,Y
	STA.w !it_m7a,Y
	STA.w !it_m7d,Y
	REP #$20
	LDA.w #!gb_empty
	STA.w !it_win+1,Y
.publish
	LDA.w !g_it
	STA.w !g_cur_it
	RTS
; A16 = count of lead lines (uses min(A, 127)); points at harmless data.
.lead
	CMP.w #128
	BCC +
	LDA.w #127
+	SEP #$20
	STA.w !it_win,Y
	STA.w !it_m7a,Y
	STA.w !it_m7d,Y
	REP #$20
	LDA.w #!gb_empty
	STA.w !it_win+1,Y
	LDA.w !g_la
	STA.w !it_m7a+1,Y
	LDA.w !g_ld
	STA.w !it_m7d+1,Y
	INY : INY : INY
	RTS
; A16 = lines (1-127) of one repeat entry at the current entry pointers.
.chunk
	STA.w !g_l
	ORA.w #$0080
	SEP #$20
	STA.w !it_win,Y
	STA.w !it_m7a,Y
	STA.w !it_m7d,Y
	REP #$20
	LDA.w !g_tmp+4
	STA.w !it_win+1,Y
	LDA.w !g_tmp+8
	STA.w !it_m7a+1,Y
	LDA.w !g_tmp+10
	STA.w !it_m7d+1,Y
	; advance the entry pointers by the chunk
	LDA.w !g_l
	ASL
	STA.w !g_tmp+14
	CLC : ADC.w !g_tmp+8
	STA.w !g_tmp+8
	LDA.w !g_tmp+14
	CLC : ADC.w !g_tmp+10
	STA.w !g_tmp+10
	LDA.w !g_tmp+14
	ASL
	CLC : ADC.w !g_tmp+4
	STA.w !g_tmp+4
	INY : INY : INY
	RTS
