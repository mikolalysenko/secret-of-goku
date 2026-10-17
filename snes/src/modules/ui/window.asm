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
+	JSR ui_build_text
	JSR ui_build_map
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
	JSR ui_window_clear
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
	LDA.w #ui_zero_rows>>16
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
	LDY.w #ui_zero_rows&$FFFF
	JSL core_queue_vram
	RTS
.all
	LDA.w !ui_place&$FFFF
	ASL : ASL : ASL : ASL : ASL
	CLC : ADC.w #!UI_BG3_MAP
	LDX.w #$0200
	LDY.w #ui_zero_rows&$FFFF
	JSL core_queue_vram
.done
	RTS

; $2C bit 5 follows the HDMA state (the field NMI writes $2C to HDMAEN).
ui_window_sync_2c:
	LDA.w !ui_state&$FFFF
	AND.w #!UIS_HDMA
	SEP #$20
	BEQ .off
	LDA.b #$20
	TSB.w $002C
	REP #$20
	RTS
.off
	LDA.b #$20
	TRB.w $002C
	REP #$20
	RTS

; Queue the first atlas half plus the four window tiles. Carry set = retry.
ui_queue_atlas_a:
	LDA.w #ui_window_tiles>>16
	STA.w !core_scratch&$FFFF
	LDA.w #(!UI_BG3_CHR+($110*8))
	LDX.w #$0040
	LDY.w #ui_window_tiles&$FFFF
	JSL core_queue_vram
	BCS .out
	LDA.w #ui_atlas>>16
	STA.w !core_scratch&$FFFF
	LDA.w #!UI_ATLAS_VRAM
	LDX.w #!UI_ATLAS_A_BYTES
	LDY.w #ui_atlas&$FFFF
	JSL core_queue_vram
.out
	RTS
ui_queue_atlas_b:
	LDA.w #ui_atlas>>16
	STA.w !core_scratch&$FFFF
	LDA.w #(!UI_ATLAS_VRAM+(!UI_ATLAS_A_BYTES/2))
	LDX.w #!UI_ATLAS_B_BYTES
	LDY.w #((ui_atlas+!UI_ATLAS_A_BYTES)&$FFFF)
	JSL core_queue_vram
	RTS

; ---------------------------------------------------------------------------
; Expand the current message into !ui_s_text (3 lines x 28 glyph codes):
; $7F newline, $57 n name, $F0 string parameter, $F1 number parameter.
!ui_bt_src  = !ui_tmp0              ; text address in this bank
!ui_bt_line = !ui_tmp1              ; offset of the line (0, 28, 56)
!ui_bt_col  = !ui_tmp2              ; column
ui_build_text:
	LDA.w #$8080
	LDX.w #82
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

; Next text byte in A16 (Z from the value).
ui_bt_byte:
	LDX.w !ui_bt_src&$FFFF
	LDA.l !UI_BANKBASE,X
	INC.w !ui_bt_src&$FFFF
	AND.w #$00FF
	RTS

; Store glyph A at the cursor (columns beyond 28 are dropped).
ui_bt_put:
	LDX.w !ui_bt_col&$FFFF
	CPX.w #28
	BCS .full
	PHA
	TXA
	CLC : ADC.w !ui_bt_line&$FFFF
	TAX
	PLA
	SEP #$20
	STA.l !ui_s_text,X
	REP #$20
	INC.w !ui_bt_col&$FFFF
.full
	RTS

; ---------------------------------------------------------------------------
; Build the 8 window rows (32 entries each) in !ui_s_map from !ui_s_text.
!UI_TM_FRAME = $2000|(3<<10)        ; priority, palette 3
!UI_TM_TEXT  = $2000|(2<<10)        ; priority, palette 2
ui_build_map:
	; frame rows 0 and 7, then the side columns
	LDX.w #$0000
	LDA.w #!UI_TM_FRAME|$0110
	LDY.w #!UI_TM_FRAME|$0111
	JSR ui_bm_edge
	LDX.w #$01C0
	LDA.w #!UI_TM_FRAME|$8110
	LDY.w #!UI_TM_FRAME|$8111
	JSR ui_bm_edge
	; text rows 1-6
	LDA.w #$0040
	STA.w !ui_tmp0&$FFFF              ; row byte offset
	STZ.w !ui_tmp1&$FFFF              ; text offset of the line
	STZ.w !ui_tmp2&$FFFF              ; 0 top half, 1 bottom half
.row
	LDX.w !ui_tmp0&$FFFF
	LDA.w #$0000
	STA.l !ui_s_map+$00,X
	STA.l !ui_s_map+$3E,X
	LDA.w #!UI_TM_FRAME|$0113
	STA.l !ui_s_map+$02,X
	ORA.w #$4000
	STA.l !ui_s_map+$3C,X
	LDY.w #$0000                      ; column 0-27
.col
	TYA
	CLC : ADC.w !ui_tmp1&$FFFF
	TAX
	LDA.l !ui_s_text,X
	AND.w #$00FF
	CMP.w #!UI_ATLAS_FIRST
	BCC .space
	CMP.w #(!UI_ATLAS_FIRST+!UI_ATLAS_GLYPHS)
	BCC +
.space
	LDA.w #!UI_ATLAS_FIRST
+	SEC : SBC.w #!UI_ATLAS_FIRST
	ASL
	CLC : ADC.w #(!UI_ATLAS_TILE|!UI_TM_TEXT)
	ADC.w !ui_tmp2&$FFFF              ; bottom half: the next tile
	STA.w !ui_tmp3&$FFFF
	TYA
	ASL
	CLC : ADC.w !ui_tmp0&$FFFF
	TAX
	LDA.w !ui_tmp3&$FFFF
	STA.l !ui_s_map+$04,X
	INY
	CPY.w #28
	BCC .col
	; next row: alternate halves; after a bottom half move to the next line
	LDA.w !ui_tmp0&$FFFF
	CLC : ADC.w #$0040
	STA.w !ui_tmp0&$FFFF
	LDA.w !ui_tmp2&$FFFF
	EOR.w #$0001
	STA.w !ui_tmp2&$FFFF
	BNE .row
	LDA.w !ui_tmp1&$FFFF
	CLC : ADC.w #28
	STA.w !ui_tmp1&$FFFF
	CMP.w #84
	BCC .row
	RTS

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
ui_hdma_refresh:
	LDX.w #$0600
	LDA.w $002A
	AND.w #$00FF
	BEQ +
	LDX.w #$BE00
+	STX.w !ui_tmp3&$FFFF
	LDY.w #$0000
.r
	TYA
	ASL : ASL
	TAX                               ; table entry offset
	LDA.l ui_hdma_index,X              ; CGRAM index (word)
	ASL
	CLC : ADC.w !ui_tmp3&$FFFF
	PHX
	TAX
	LDA.l $7E0000,X
	PLX
	STA.l !ui_s_hdma+(ui_hdma_restore-ui_hdma_template)+2,X
	INY
	CPY.w #6
	BCC .r
	RTS
ui_hdma_index:
	dw 9,0, 10,0, 11,0, 13,0, 14,0, 15,0

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
