; BG3 telepathy window on the ground (field, Mode 1). Included in the UI
; code bank.
;
; The box is the native dialogue window's twin: BG3 rows 1-8 (lines 8-71),
; columns 1-30, the cartridge's window tiles ($110 corner, $111 edge, $113
; side) and a glyph atlas in the native text tiles $122-$1BF (free whenever
; no native window is open, which is exactly when the radio may show). Each
; glyph cell is two tiles drawn like radioPixels(): white glyph, black 3x3
; outline, window dither. Kind 'full-power-frieza' uses rows 17-24 (lines
; 136-199) instead, just above the HUD.
;
; Colours: palettes 2 (interior: black, $2C00 dither, white) and 3 (frame:
; black, $5250, $739C), set on lines 0-5 by an HDMA on channel 5 (mode 3 to
; CGADD/CGDATA, enabled through $2C bit 5) and restored from the game's
; CGRAM buffer on lines 200-205, before the HUD's party gauges (row 26)
; need palettes 2/3 again.

!UI_ATLAS_A_GLYPHS = 40
!UI_ATLAS_A_BYTES  = (!UI_ATLAS_A_GLYPHS*32)
!UI_ATLAS_B_BYTES  = ((!UI_ATLAS_GLYPHS-!UI_ATLAS_A_GLYPHS)*32)
!UI_ATLAS_VRAM     = (!UI_BG3_CHR+(!UI_ATLAS_TILE*8))
!UI_BANKBASE       = ui_code_start&$FF0000   ; long base for data in this bank

; Field frame: show, update or hide the box.
ui_window_update:
	LDA.w !ui_vis&$FFFF
	BEQ .hidden
	LDA.w !ui_cur&$FFFF
	BNE .show
	; nothing to say: hide, but the atlas stays valid
	JSR ui_window_clear
	JMP ui_window_sync_2c
.hidden
	JSR ui_window_clear
	LDA.w #!UIS_ATLAS
	TRB.w !ui_state&$FFFF
	STZ.w !ui_phase&$FFFF
	JMP ui_window_sync_2c
.show
	JSR ui_kind_of
	LDA.w !ui_tmp4&$FFFF
	AND.w #!UI_KB_BOTTOM
	BEQ +
	LDA.w #!UI_ROW_LOWER-!UI_ROW_TOP
+	CLC : ADC.w #!UI_ROW_TOP
	STA.w !ui_row_want&$FFFF
	; the glyph atlas (two halves over two frames)
	LDA.w !ui_state&$FFFF
	AND.w #!UIS_ATLAS
	BNE .atlasOk
	LDA.w !ui_phase&$FFFF
	CMP.w #!UIP_ATLASB
	BEQ .second
	JSR ui_queue_atlas_a
	BCS .retry
	LDA.w #!UIP_ATLASB
	STA.w !ui_phase&$FFFF
.retry
	JMP ui_window_sync_2c
.second
	JSR ui_queue_atlas_b
	BCS .retry
	STZ.w !ui_phase&$FFFF
	LDA.w #!UIS_ATLAS
	TSB.w !ui_state&$FFFF
.atlasOk
	LDA.w !ui_state&$FFFF
	AND.w #!UIS_DRAWN
	BEQ .draw
	LDA.w !ui_drawn&$FFFF
	CMP.w !ui_cur&$FFFF
	BNE .draw
	LDA.w !ui_drawn_par&$FFFF
	CMP.w !ui_cur_par&$FFFF
	BNE .draw
	LDA.w !ui_place&$FFFF
	CMP.w !ui_row_want&$FFFF
	BNE .draw
	JSR ui_hdma_refresh
	BRA .out
.draw
	; a different placement: clear the old rows first
	LDA.w !ui_state&$FFFF
	AND.w #!UIS_DRAWN
	BEQ +
	LDA.w !ui_place&$FFFF
	CMP.w !ui_row_want&$FFFF
	BEQ +
	JSR ui_window_clear
+	LDA.w #!UIB_ALL
	STA.w !ui_tmp5&$FFFF
	LDA.w !ui_cur&$FFFF
	LDX.w !ui_cur_par&$FFFF
	LDY.w #$0001
	JSR ui_bs_step                    ; one build step per frame
	BCC .out
	LDA.w #!SRAM_WORK_UI>>16
	STA.w !core_scratch&$FFFF
	LDA.w !ui_row_want&$FFFF
	ASL : ASL : ASL : ASL : ASL
	CLC : ADC.w #!UI_BG3_MAP
	LDX.w #$0200
	LDY.w #!ui_s_map&$FFFF
	JSL core_queue_vram
	BCS .out
	LDA.w !ui_cur&$FFFF : STA.w !ui_drawn&$FFFF
	LDA.w !ui_cur_par&$FFFF : STA.w !ui_drawn_par&$FFFF
	LDA.w !ui_row_want&$FFFF : STA.w !ui_place&$FFFF
	LDA.w #!UIS_DRAWN|!UIS_HDMA
	TSB.w !ui_state&$FFFF
	JSR ui_hdma_build
.out
	JMP ui_window_sync_2c

; Leaving the field (world flight, rings): take the box down.
ui_window_leave_field:
	LDA.w !ui_state&$FFFF             ; already down: nothing to do
	AND.w #!UIS_DRAWN|!UIS_ATLAS|!UIS_HDMA
	ORA.w !ui_phase&$FFFF
	BNE +
	RTS
+	JSR ui_window_clear
	LDA.w #!UIS_ATLAS
	TRB.w !ui_state&$FFFF
	STZ.w !ui_phase&$FFFF
	JMP ui_window_sync_2c

; Remove the drawn box (if any): disarm the HDMA and blank its rows. A
; native window being uploaded this vblank ($1D04 bit 6: $1D1A bytes from
; $5820) already covers its rows; only the rest is blanked so the native
; window is never erased.
ui_window_clear:
	LDA.w !ui_state&$FFFF
	AND.w #!UIS_DRAWN
	BEQ .done
	LDA.w #!UIS_DRAWN|!UIS_HDMA
	TRB.w !ui_state&$FFFF
	STZ.w !ui_drawn&$FFFF
	SEP #$20                          ; the radio's HDMA channel off (only ours:
	LDA.b #$20                        ; other modules may use channel 5 while
	TRB.w $002C                       ; the box is down)
	REP #$20
	LDA.w #!UI_ZERO_ROWS>>16
	STA.w !core_scratch&$FFFF
	LDA.w !ui_place&$FFFF
	CMP.w #!UI_ROW_TOP
	BNE .all
	LDA.w $1D04
	AND.w #$0040
	BEQ .all
	LDA.w $1D1A
	CMP.w #$0200
	BCS .done
	STA.w !ui_tmp0&$FFFF
	LSR
	CLC : ADC.w #(!UI_BG3_MAP+(!UI_ROW_TOP*32))   ; first word the native leaves
	PHA
	LDA.w #$0200
	SEC : SBC.w !ui_tmp0&$FFFF
	TAX
	PLA
	LDY.w #!UI_ZERO_ROWS&$FFFF
	JSL core_queue_vram
	RTS
.all
	LDA.w !ui_place&$FFFF
	ASL : ASL : ASL : ASL : ASL
	CLC : ADC.w #!UI_BG3_MAP
	LDX.w #$0200
	LDY.w #!UI_ZERO_ROWS&$FFFF
	JSL core_queue_vram
.done
	RTS

; $2C bit 5 follows the HDMA state (the field NMI writes $2C to HDMAEN).
; ($2C bit 5 is set again every frame the HDMA is armed, as the game may
; rewrite $2C; it is cleared once, when the box goes: ui_window_clear.)
ui_window_sync_2c:
	LDA.w !ui_state&$FFFF
	AND.w #!UIS_HDMA
	BEQ .off
	SEP #$20
	LDA.b #$20
	TSB.w $002C
	REP #$20
.off
	RTS

; Queue the first atlas half plus the four window tiles. Carry set = retry.
ui_queue_atlas_a:
	LDA.w #!XDATA_UI_WINDOW_TILES>>16
	STA.w !core_scratch&$FFFF
	LDA.w #(!UI_BG3_CHR+($110*8))
	LDX.w #$0040
	LDY.w #!XDATA_UI_WINDOW_TILES&$FFFF
	JSL core_queue_vram
	BCS .out
	LDA.w #!XDATA_UI_ATLAS>>16
	STA.w !core_scratch&$FFFF
	LDA.w #!UI_ATLAS_VRAM
	LDX.w #!UI_ATLAS_A_BYTES
	LDY.w #!XDATA_UI_ATLAS&$FFFF
	JSL core_queue_vram
.out
	RTS
ui_queue_atlas_b:
	LDA.w #!XDATA_UI_ATLAS>>16
	STA.w !core_scratch&$FFFF
	LDA.w #(!UI_ATLAS_VRAM+(!UI_ATLAS_A_BYTES/2))
	LDX.w #!UI_ATLAS_B_BYTES
	LDY.w #((!XDATA_UI_ATLAS+!UI_ATLAS_A_BYTES)&$FFFF)
	JSL core_queue_vram
	RTS

; ---------------------------------------------------------------------------
; Staged content: !ui_s_text and !ui_s_map are built over several frames,
; one step per frame (!UIB_*), for the field window (mode 1) and the world
; band (mode 2). A16 = key (message id + 1, or $8000 | radar key), X16 =
; parameter, Y16 = mode, !ui_tmp5 = the steps new content needs. Content
; that differs from the staged one starts over (its steps are merged with
; the ones still pending when only the radar guide changed). Carry set when
; the staged map is complete (the caller uploads it).
ui_bs_step:
	CMP.l !ui_s_bkey
	BNE .new
	PHA
	TXA
	CMP.l !ui_s_bpar
	BNE .newPla
	TYA
	CMP.l !ui_s_bmode
	BNE .newPla
	PLA
	BRA .step
.newPla
	PLA
.new
	STA.l !ui_s_bkey
	TXA
	STA.l !ui_s_bpar
	TYA
	CMP.l !ui_s_bmode
	STA.l !ui_s_bmode
	BEQ .merge
	LDA.w #!UIB_ALL                   ; another mode's layout is staged
	BRA +
.merge
	LDA.l !ui_s_bstep
	ORA.w !ui_tmp5&$FFFF
+	STA.l !ui_s_bstep
.step
	LDA.l !ui_s_bstep
	BNE +
	SEC                               ; complete
	RTS
+	LSR
	BCS .text
	LSR
	BCS .text0
	LSR
	BCS .line0
	LSR
	BCS .line1
	; line 2
	LDA.w #!UIB_LINE2
	LDX.w #ui_fmap_line2
	LDY.w #ui_wmap_line2
	BRA .line
.line1
	LDA.w #!UIB_LINE1
	LDX.w #ui_fmap_line1
	LDY.w #ui_wmap_line1
	BRA .line
.line0
	LDA.w #!UIB_LINE0
	LDX.w #ui_fmap_line0
	LDY.w #ui_wmap_line0
.line
	PHA
	LDA.l !ui_s_bmode
	CMP.w #$0001
	BEQ +
	TYX
+	JSR ui_jsr_x
	PLA
	BRA .done
.text0
	JSR ui_radar_text0
	LDA.w #!UIB_TEXT0
	BRA .done
.text
	LDA.l !ui_s_bmode
	CMP.w #$0001
	BNE .wtext
	JSR ui_build_text
	JSR ui_fmap_edges
	BRA .textDone
.wtext
	LDA.l !ui_s_bkey
	BMI .rtext
	JSR ui_build_text
	BRA .wedges
.rtext
	JSR ui_radar_text
.wedges
	JSR ui_wmap_edges
.textDone
	LDA.w #!UIB_TEXT|!UIB_TEXT0       ; the full text covers a pending line-1 rebuild
.done
	EOR.w #$FFFF
	AND.l !ui_s_bstep
	STA.l !ui_s_bstep
	BNE +
	SEC                               ; that was the last step: upload now
	RTS
+	CLC
	RTS

; JSR (X): call the routine at address X in this bank.
ui_jsr_x:
	DEX
	PHX
	RTS                               ; RTS adds one: lands on X

; ---------------------------------------------------------------------------
; Expand the current message into !ui_s_text (3 lines x 28 glyph words):
; $7F newline, $57 n name, $F0 string parameter, $F1 number parameter.
!ui_bt_src  = !ui_tmp0              ; text address in this bank
!ui_bt_line = !ui_tmp1              ; offset of the line (0, 28, 56)
!ui_bt_col  = !ui_tmp2              ; column
!ui_bt_ret  = !ui_tmp5              ; message position while in a dictionary entry
ui_build_text:
	LDA.w #$0000                      ; space
	LDX.w #166
.fill
	STA.l !ui_s_text,X
	DEX : DEX
	BPL .fill
	LDA.w !ui_cur&$FFFF
	DEC
	ASL
	TAX
	LDA.l ui_msg_text,X
	STA.w !ui_bt_src&$FFFF
	STZ.w !ui_bt_ret&$FFFF
	STZ.w !ui_bt_line&$FFFF
	STZ.w !ui_bt_col&$FFFF
.next
	JSR ui_bt_byte
	BEQ .end
	CMP.w #$007F
	BNE .notNl
	STZ.w !ui_bt_col&$FFFF
	LDA.w !ui_bt_line&$FFFF
	CLC : ADC.w #28
	STA.w !ui_bt_line&$FFFF
	CMP.w #84
	BCC .next
.end
	RTS
.notNl
	CMP.w #$0057
	BNE .notName
	JSR ui_bt_byte                    ; n
	JSL !UI_NAME_FN                   ; X16 = name in bank $7E
	REP #$30
	STZ.w !ui_bt_ret&$FFFF            ; (the name source may use it)
.name
	LDA.l $7E0000,X
	AND.w #$00FF
	BEQ .next
	CMP.w #$00FF
	BEQ .next
	PHX
	JSR ui_bt_put
	PLX
	INX
	BRA .name
.notName
	CMP.w #$00F0
	BNE .notStr
	; string parameter: ui_ptables[ui_msg_ptable[id]][param >> 8]
	LDA.w !ui_cur&$FFFF
	DEC
	TAX
	LDA.l ui_msg_ptable,X
	AND.w #$00FF
	ASL
	TAX
	LDA.l ui_ptables,X
	STA.w !ui_tmp3&$FFFF
	LDA.w !ui_cur_par&$FFFF
	XBA
	AND.w #$00FF
	ASL
	CLC : ADC.w !ui_tmp3&$FFFF
	TAX
	LDA.l !UI_BANKBASE,X
	TAX
.str
	LDA.l !UI_BANKBASE,X
	AND.w #$00FF
	BEQ .next
	PHX
	JSR ui_bt_put
	PLX
	INX
	BRA .str
.notStr
	CMP.w #$00F1
	BNE .glyph
	; number parameter (0-255): decimal without leading zeros
	LDA.w !ui_cur_par&$FFFF
	AND.w #$00FF
	LDY.w #$0000                      ; hundreds
.h
	CMP.w #100
	BCC +
	SBC.w #100
	INY
	BRA .h
+	STA.w !ui_tmp3&$FFFF
	TYA
	BEQ .tens
	CLC : ADC.w #$00B5
	JSR ui_bt_put
	LDY.w #$0001                      ; print tens even when zero
	BRA .t0
.tens
	LDY.w #$0000
.t0
	STY.w !ui_tmp4&$FFFF
	LDA.w !ui_tmp3&$FFFF
	LDY.w #$0000
.t
	CMP.w #10
	BCC +
	SBC.w #10
	INY
	BRA .t
+	STA.w !ui_tmp3&$FFFF
	TYA
	ORA.w !ui_tmp4&$FFFF
	BEQ .ones
	TYA
	CLC : ADC.w #$00B5
	JSR ui_bt_put
.ones
	LDA.w !ui_tmp3&$FFFF
	CLC : ADC.w #$00B5
	JSR ui_bt_put
	JMP .next
.glyph
	JSR ui_bt_put
	JMP .next

; Next text byte in A16 (Z from the value). Dictionary codes $E0-$EF read
; their entry (ui_dict) first; !ui_bt_ret holds the message position
; meanwhile (0 outside an entry).
ui_bt_byte:
	LDX.w !ui_bt_src&$FFFF
	LDA.l !UI_BANKBASE,X
	INC.w !ui_bt_src&$FFFF
	AND.w #$00FF
	BEQ .end
	CMP.w #$00E0
	BCC .out
	CMP.w #$00F0
	BCS .out
	SBC.w #$00DF                      ; (C clear: - $E0)
	ASL
	TAX
	LDA.w !ui_bt_src&$FFFF
	STA.w !ui_bt_ret&$FFFF
	LDA.l ui_dict,X
	STA.w !ui_bt_src&$FFFF
	BRA ui_bt_byte
.end
	LDX.w !ui_bt_ret&$FFFF            ; the end of an entry: back to the
	BEQ .out                          ; message (A = 0, Z: the message end)
	STX.w !ui_bt_src&$FFFF
	STZ.w !ui_bt_ret&$FFFF
	BRA ui_bt_byte
.out
	RTS

; Store glyph A at the cursor as its atlas word ((code - $80) * 2; codes
; outside the atlas are spaces). Columns beyond 28 are dropped.
ui_bt_put:
	LDX.w !ui_bt_col&$FFFF
	CPX.w #28
	BCS .full
	SEC : SBC.w #!UI_ATLAS_FIRST
	CMP.w #!UI_ATLAS_GLYPHS
	BCC +
	LDA.w #$0000
+	ASL
	PHA
	TXA
	CLC : ADC.w !ui_bt_line&$FFFF
	ASL
	TAX
	PLA
	STA.l !ui_s_text,X
	INC.w !ui_bt_col&$FFFF
.full
	RTS

; ---------------------------------------------------------------------------
; The 8 window rows (32 entries each) in !ui_s_map: the frame (rows 0 and
; 7, the side columns of rows 1-6) here, the glyph rows of each text line
; by ui_fmap_line0-2 (top tile = atlas base + glyph word, bottom = +1).
!UI_TM_FRAME = $2000|(3<<10)        ; priority, palette 3
!UI_TM_TEXT  = $2000|(2<<10)        ; priority, palette 2
ui_fmap_edges:
	LDX.w #$0000
	LDA.w #!UI_TM_FRAME|$0110
	LDY.w #!UI_TM_FRAME|$0111
	JSR ui_bm_edge
	LDX.w #$01C0
	LDA.w #!UI_TM_FRAME|$8110
	LDY.w #!UI_TM_FRAME|$8111
	JSR ui_bm_edge
	LDX.w #$0040
.side
	LDA.w #$0000
	STA.l !ui_s_map+$00,X
	STA.l !ui_s_map+$3E,X
	LDA.w #!UI_TM_FRAME|$0113
	STA.l !ui_s_map+$02,X
	ORA.w #$4000
	STA.l !ui_s_map+$3C,X
	TXA
	CLC : ADC.w #$0040
	TAX
	CPX.w #$01C0
	BCC .side
	RTS

; Glyph rows of text line L (rows 1 + 2L, 2 + 2L), DB = the staging bank.
macro ui_fline(L)
	PHB
	PEA.w ((!SRAM_WORK_UI>>16)<<8)|(!SRAM_WORK_UI>>16)
	PLB
	PLB
	LDY.w #$0000
?c:
	LDA.w 0+(!ui_s_text&$FFFF)+(<L>*56),Y
	CLC : ADC.w #!UI_ATLAS_TILE|!UI_TM_TEXT
	STA.w 0+(!ui_s_map&$FFFF)+$44+(<L>*$80),Y
	INC
	STA.w 0+(!ui_s_map&$FFFF)+$84+(<L>*$80),Y
	INY : INY
	CPY.w #56
	BCC ?c
	PLB
	RTS
endmacro
ui_fmap_line0:
	%ui_fline(0)
ui_fmap_line1:
	%ui_fline(1)
ui_fmap_line2:
	%ui_fline(2)

; One frame row at byte offset X: A = corner entry, Y = edge entry.
ui_bm_edge:
	STA.w !ui_tmp3&$FFFF
	STY.w !ui_tmp4&$FFFF
	LDA.w #$0000
	STA.l !ui_s_map+$00,X
	STA.l !ui_s_map+$3E,X
	LDA.w !ui_tmp3&$FFFF
	STA.l !ui_s_map+$02,X
	ORA.w #$4000
	STA.l !ui_s_map+$3C,X
	LDY.w #14
.left
	LDA.w !ui_tmp4&$FFFF
	STA.l !ui_s_map+$04,X
	ORA.w #$4000
	STA.l !ui_s_map+$20,X
	INX : INX
	DEY
	BNE .left
	RTS

; ---------------------------------------------------------------------------
; Palette HDMA (channel 5, direct, mode 3 to $2121: CGADD, CGADD, CGDATA,
; CGDATA). Lines 0-5 load the window colours into palettes 2/3; lines
; 200-205 restore the game's colours (the CGRAM buffer the field NMI
; uploads: $7E:0600, or $7E:BE00 while $2A is nonzero).
ui_hdma_build:
	LDX.w #$0000
.copy
	LDA.l ui_hdma_template,X
	STA.l !ui_s_hdma,X
	INX : INX
	CPX.w #ui_hdma_template_end-ui_hdma_template
	BCC .copy
	; fall through
!ui_hr = !ui_s_hdma+(ui_hdma_restore-ui_hdma_template)+2   ; the restore block's colours
ui_hdma_refresh:
	LDX.w #$0600
	LDA.w $002A
	AND.w #$00FF
	BEQ +
	LDX.w #$BE00
+	LDA.l $7E0000+(9*2),X
	STA.l !ui_hr
	LDA.l $7E0000+(10*2),X
	STA.l !ui_hr+4
	LDA.l $7E0000+(11*2),X
	STA.l !ui_hr+8
	LDA.l $7E0000+(13*2),X
	STA.l !ui_hr+12
	LDA.l $7E0000+(14*2),X
	STA.l !ui_hr+16
	LDA.l $7E0000+(15*2),X
	STA.l !ui_hr+20
	RTS

ui_hdma_template:
	db $86
	db $09,$09 : dw $0000
	db $0A,$0A : dw $2C00
	db $0B,$0B : dw $7FFF
	db $0D,$0D : dw $0000
	db $0E,$0E : dw $5250
	db $0F,$0F : dw $739C
	db $7F
	db $0F,$0F : dw $739C
	db $43
	db $0F,$0F : dw $739C
	db $86
ui_hdma_restore:
	db $09,$09 : dw $0000
	db $0A,$0A : dw $0000
	db $0B,$0B : dw $0000
	db $0D,$0D : dw $0000
	db $0E,$0E : dw $0000
	db $0F,$0F : dw $0000
	db $00,$00
ui_hdma_template_end:

; Field vblank (DB = $80): re-arm channel 5 after the game's own DMA used it.
ui_window_nmi:
	LDA.l !ui_state
	AND.w #!UIS_HDMA
	BEQ .done
	LDA.w #$2103
	STA $4350                         ; mode 3, direct, B = $21 (CGADD)
	LDA.w #!ui_s_hdma&$FFFF
	STA $4352
	SEP #$20
	LDA.b #!ui_s_hdma>>16
	STA $4354
	REP #$20
.done
	RTL
