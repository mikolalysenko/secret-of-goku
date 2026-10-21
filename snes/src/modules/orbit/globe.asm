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
; HDMA table entries and registers. The victory's descent (radii 56-230,
; a new centre and radius every frame) reads all of it from tables the
; generator made in extended data (globe_descent). DB = $32, M16/X16
; unless noted.

; Per frame: stepped target, registers for the NMI, tables if needed.
globe_frame:
	REP #$30
	LDA.w !g_desc
	BEQ +
	; the descent: while the vblank has not taken the last set (a frame
	; that ran long), it and its registers stay
	LDA.w !g_cur_it
	CMP.w !g_shown_it
	BEQ +
	RTS
+	; target.x = round(lon / 8) * 8; X0 = floor((target.x - 670.5) / 4)
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
	REP #$30
	LDA.w #$0001
	STA.w !g_ichg                  ; the window rows start below the band
+	REP #$30
	LDA.w !g_desc
	BEQ +
	JSR globe_descent
	BRA .shapeOk
+	; Window block for the radius and the centre column: started here and
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

; The descent (finale_camera from victoryTiming.descent): the frame's
; window rows (orbit_fn_dwin, per frame: lines max(0, cy - R) on, made for
; this camera) and the radius's M7A / M7D rows (orbit_fn_desc) are
; published as they are in extended data, with virtual bases for row -R as
; globe_itables and the stars' culling count rows; nothing is built. The
; banks go with each indirect set to the vblank.
globe_descent:
	STZ.w !g_bld                   ; (a fight block still building is dropped)
	LDA.w !fn_age
	SEC : SBC.w #!FNT_V_DESCENT
	BCS +
	LDA.w #$0000
+	CMP.w #!FNT_V_RETURN-!FNT_V_DESCENT+1
	BCC +
	LDA.w #!FNT_V_RETURN-!FNT_V_DESCENT
+	ASL : ASL : ASL
	CMP.w !g_dk
	BNE +
	RTS                            ; the published tables show this frame
+	STA.w !g_dk
	; the radius: R, first stored row (jlo), M7A, M7D, bank
	LDA.w !cam_r
	CMP.w #!FND_DESC_R0
	BCS +
	LDA.w #!FND_DESC_R0
+	CMP.w #!FND_DESC_R1+1
	BCC +
	LDA.w #!FND_DESC_R1
+	SEC : SBC.w #!FND_DESC_R0
	STA.w !g_tmp
	ASL : ASL
	CLC : ADC.w !g_tmp
	ASL                            ; * 10
	TAX
	LDA.l orbit_fn_desc+0,X : STA.w !g_lR
	LDA.l orbit_fn_desc+2,X
	CLC : ADC.w !g_lR
	ASL
	STA.w !g_tmp                   ; (jlo + R) * 2: row -R before the first stored row
	LDA.l orbit_fn_desc+4,X : SEC : SBC.w !g_tmp : STA.w !g_la
	LDA.l orbit_fn_desc+6,X : SEC : SBC.w !g_tmp : STA.w !g_ld
	LDA.l orbit_fn_desc+8,X : STA.w !g_lbank
	; the window rows from their first line; row -R's place before it
	LDX.w !g_dk
	LDA.w !cam_y
	SEC : SBC.w !g_lR
	STA.w !g_tmp                   ; line of row -R
	LDA.l orbit_fn_dwin+4,X
	SEC : SBC.w !g_tmp
	ASL : ASL
	STA.w !g_tmp
	LDA.l orbit_fn_dwin+0,X : SEC : SBC.w !g_tmp : STA.w !g_lw
	LDA.l orbit_fn_dwin+2,X : STA.w !g_wbank
	LDA.l orbit_fn_dwin+6,X : STA.w !g_wempty
	LDA.w !cam_x : STA.w !g_cx
	LDA.w !cam_r : STA.w !g_lr
	; M7HOFS = X0 - cx for the published rows
	LDA.w !g_x0
	SEC : SBC.w !g_cx
	AND.w #$1FFF
	STA.w !g_hofs
	LDA.w #$0001
	STA.w !g_ichg
	RTS

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
	JSR globe_fight_banks
	LDA.w #$0001
	STA.w !g_ichg
	RTS

; The fight's published blocks: M7A / M7D rows in bank F7, windows in the
; scene block with its empty record.
globe_fight_banks:
	LDA.w #!FL>>16
	STA.w !g_lbank
	LDA.w #$0032
	STA.w !g_wbank
	LDA.w #!gb_empty
	STA.w !g_wempty
	RTS

; Indirect HDMA tables for the published blocks and centre line cam_y:
; lines [top, bot] = rows cy-R..cy+R clipped to 0..195.
globe_itables:
	REP #$30
	; a set published but not yet taken by a vblank (a frame that ran
	; long): the other one is still on screen, so wait a frame
	LDA.w !g_cur_it
	CMP.w !g_shown_it
	BEQ +
	LDA.w #$0001
	STA.w !g_ichg
	RTS
+	STZ.w !g_ichg
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
	LDA.w !g_text
	AND.w #$00FF
	STA.w !g_tmp+2                 ; first Mode 7 line
	LDA.w !cam_y
	SEC : SBC.w !g_lR
	STA.w !g_tmp+0                 ; line of row -R (signed)
	CMP.w !g_tmp+2
	BPL +
	LDA.w !g_tmp+2
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
	; nothing on screen: windows empty all frame (after the finale's band
	; lines, if any)
	LDA.w !g_it
	CLC : ADC.w #!IT_BASE
	TAY
	STZ.w !g_tmp+14
	JSR .bandLead
	SEP #$20
	LDA.b #$01
	STA.w !it_win,Y
	LDA.b #$00
	STA.w !it_win+3,Y
	STA.w !it_m7a,Y
	STA.w !it_m7d,Y
	REP #$20
	LDA.w !g_wempty
	STA.w !it_win+1,Y
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
	; lead: lines [0, top): the finale's band lines (their window table),
	; then at most two entries of <= 127 lines
	LDA.w !g_top
	STA.w !g_tmp+14
	JSR .bandLead
	LDA.w !g_tmp+14
	BEQ .body
	JSR .lead
	LDA.w !g_tmp+14
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
	LDA.w !g_wempty
	STA.w !it_win+1,Y
.publish
	; the band table this set points at and its lines (bands.asm
	; double-buffers on it; the vblank sets the layers up from them)
	LDX.w #$0000
	LDY.w !g_it
	BEQ +
	LDX.w #$0002
+	STZ.w !g_itband,X
	STZ.w !g_itend,X
	LDA.w !g_lbank                 ; the banks its records are in
	STA.w !g_itbank,X
	LDA.w !g_wbank
	STA.w !g_itwbank,X
	LDA.w !bd_end
	BEQ +
	LDA.w !bd_tab
	BEQ +
	STA.w !g_itband,X
	LDA.w !bd_end
	STA.w !g_itend,X
+
	LDA.w !g_it
	STA.w !g_cur_it
	RTS
; The finale's band lines (bands.asm): the windows from the band table,
; a record a line; g_tmp+14 = the lead lines left after them. (The tables
; stay within their 16 bytes: band lines end where the globe starts. The
; band table is in the scene block: none over the descent's rows.)
.bandLead
	LDA.w !bd_end
	BEQ .noBand
	LDA.w !bd_tab
	BEQ .noBand
	LDA.w !g_wbank
	CMP.w #$0032
	BNE .noBand
	LDA.w !bd_end
	SEP #$20
	STA.w !it_m7a,Y
	STA.w !it_m7d,Y
	ORA.b #$80
	STA.w !it_win,Y
	REP #$20
	LDA.w !bd_tab
	STA.w !it_win+1,Y
	LDA.w !g_la
	STA.w !it_m7a+1,Y
	LDA.w !g_ld
	STA.w !it_m7d+1,Y
	INY : INY : INY
	LDA.w !g_tmp+14
	SEC : SBC.w !bd_end
	BPL +
	LDA.w #$0000
+	STA.w !g_tmp+14
.noBand
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
	LDA.w !g_wempty
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
