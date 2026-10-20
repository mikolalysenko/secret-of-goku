; World vblank work (modules_world_nmi): Goku's cell into the hidden buffer
; (then flipped), the docking miniature, and OBJ palettes 5/6 after a
; change. The world NMI is not force-blanked, so every transfer is gated on
; core_vblank_lines. DMA on channel 7 or 6, whichever HDMA leaves free.
; Entry: M16/X16, DB = $80, D = 0.

world_world_nmi:
	PHB
	PHD
	PEA $7E7E
	PLB
	PLB
	JSR world_goku
	BCC .exit
	LDA.w !w_flags
	AND.w #!WF_ACTIVE
	BEQ .exit
	LDA.w !w_vram_ok
	BEQ .exit
	; a channel HDMA does not use ($2C bits 7/6 enable channels 7/6)
	LDA $2C
	LDX.w #$0070
	LDY.w #$0080
	BIT.w #$0080
	BEQ +
	LDX.w #$0060
	LDY.w #$0040
	BIT.w #$0040
	BEQ +
	BRA .exit
+	STX.w !w_scratch                 ; channel register offset
	STY.w !w_scratch+2               ; MDMAEN bit
	LDA.w #$4300
	TCD
	JSR world_nmi_palettes
	JSR world_nmi_cell
	JSR world_nmi_mini
	JSR world_nmi_scars
.exit
	PLD
	PLB
	RTL

; OBJ palettes 5 and 6 from the world buffer ($0600 + $1A0, 64 bytes).
world_nmi_palettes:
	LDA.w !w_pal_dirty
	BEQ .done
	JSL core_vblank_lines
	CMP.w #2
	BCC .done
	SEP #$20
	LDA.b #208                       ; CGRAM word of OBJ palette 5
	STA.l $002121
	REP #$20
	LDX.w !w_scratch
	LDA.w #$2200                     ; one register: CGDATA
	STA $00,X
	LDA.w #$0600+$1A0
	STA $02,X
	LDA.w #$007E
	STA $04,X                        ; bank (high byte = size low, rewritten next)
	LDA.w #64
	STA $05,X
	SEP #$20
	LDA.w !w_scratch+2
	STA.l $00420B
	REP #$20
	STZ.w !w_pal_dirty
.done
	RTS

; The wanted cell into the hidden buffer, using four packed 128-byte rows
; instead of sixteen separately decoded tiles, then draw it next frame.
world_nmi_cell:
	LDA.w !w_cell_want
	CMP.w #!GOKU_NONE
	BNE +
	RTS
+	LDA.w !w_cell_show
	ASL
	TAX
	LDA.w !w_cell_buf0,X
	CMP.w !w_cell_want
	BNE +
	RTS                              ; already shown
+
	TXA
	EOR.w #$0002
	TAX
	LDA.w !w_cell_buf0,X
	CMP.w !w_cell_want
	BEQ .flip                        ; already in the other buffer
	JSL core_vblank_lines
	CMP.w #9
	BCS +
	RTS
+
	LDA.l world_buf_vram,X           ; X = target*2
	STA.w !w_scratch+4
	LDA.w !w_cell_want
	ASL
	ASL
	TAX                              ; cell * 4-byte packed pointer
	LDA.l goku_dma_tiles,X
	PHA
	LDA.l goku_dma_tiles+2,X
	LDX.w !w_scratch
	STA $04,X                        ; source bank, size low (rewritten)
	PLA
	STA $02,X
	LDA.w #$1801
	STA $00,X
	SEP #$20
	LDA.b #$80
	STA.l $002115
	REP #$20
	LDY.w #4
.row
	LDA.w !w_scratch+4
	STA.l $002116
	LDA.w #128
	STA $05,X
	SEP #$20
	LDA.w !w_scratch+2
	STA.l $00420B
	REP #$20
	LDA.w !w_scratch+4
	CLC
	ADC.w #$0100                     ; next tile row (16 tiles)
	STA.w !w_scratch+4
	DEY
	BNE .row
	LDA.w !w_cell_show
	EOR.w #$0001
	ASL
	TAX
	LDA.w !w_cell_want
	STA.w !w_cell_buf0,X
.flip
	LDA.w !w_cell_show
	EOR.w #$0001
	STA.w !w_cell_show
.done
	RTS
world_buf_vram:
	dw $6000+(!WORLD_TILE_BUF0*16), $6000+(!WORLD_TILE_BUF1*16)

; Docking miniature: the flight cell's 16x16 version (goku_cell_mini).
world_nmi_mini:
	LDA.w !w_dock
	BEQ .done
	LDA.w !w_cell_want
	CMP.w #!GOKU_NONE
	BEQ .done
	CMP.w !w_mini
	BEQ .done
	JSL core_vblank_lines
	CMP.w #4
	BCC .done
	LDA.w !w_cell_want
	ASL
	ASL
	TAX                              ; cell * 4-byte packed miniature pointer
	LDA.l goku_dma_mini,X
	PHA
	LDA.l goku_dma_mini+2,X
	LDX.w !w_scratch
	STA $04,X
	PLA
	STA $02,X
	LDA.w #$1801
	STA $00,X
	SEP #$20
	LDA.b #$80
	STA.l $002115
	REP #$20
	LDA.w #$6000+(!WORLD_TILE_MINI*16)
	STA.l $002116
	JSR .row
	LDA.w #$6000+((!WORLD_TILE_MINI+16)*16)
	STA.l $002116
	JSR .row
	LDA.w !w_cell_want
	STA.w !w_mini
.done
	RTS
.row
	LDA.w #64
	STA $05,X
	SEP #$20
	LDA.w !w_scratch+2
	STA.l $00420B
	REP #$20
	RTS

; DMA one goku tile (A16 = global tile index: bank $F8 + index/2048) to the
; current VRAM address. D = $4300, channel at w_scratch. Preserves Y.
world_dma_tile:
	PHY
	LDX.w !w_scratch
	PHA
	ASL
	ASL
	ASL
	ASL
	ASL
	STA $02,X                        ; (index & $7FF) * 32
	PLA
	XBA
	AND.w #$00FF
	LSR
	LSR
	LSR
	CLC
	ADC.w #$00F8
	STA $04,X                        ; bank (high byte overwritten by the size)
	LDA.w #$0020
	STA $05,X
	LDA.w #$1801
	STA $00,X
	SEP #$20
	LDA.w !w_scratch+2
	STA.l $00420B
	REP #$20
	PLY
	RTS
