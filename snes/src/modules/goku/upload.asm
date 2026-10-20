; VRAM uploads: Goku's current cell into the boy's OBJ slot (bank-1 tiles
; C0-C7 / D0-D7), the HUD portrait (E8/E9/F8/F9) and, when replacement ends,
; the boy's own tiles. All transfers run inside the field NMI after the
; game's uploads (modules_field_nmi). Packed Goku cells and portraits use
; channel 7; restoring the native boy still uses the game's channels 4-7.

!VRAM_ROW0 = $7C00     ; C0-C3: cell rows 0-7
!VRAM_ROW1 = $7D00     ; D0-D3: rows 8-15
!VRAM_ROW2 = $7C40     ; C4-C7: rows 16-23
!VRAM_ROW3 = $7D40     ; D4-D7: rows 24-31
!VRAM_HUD  = $7E80     ; E8/E9, F8/F9 at +$100

; Request the displayed cell (p_cell, p_flags small) for the next vblank.
; Any M; exit M16 X16.
goku_request_cell:
	REP #$30
	LDX !p_cell
	SEP #$20
	LDA.l goku_cell_pal,X
	STA !cur_pal
	LDA !p_flags
	AND.b #!GOKU_PF_SMALL
	BEQ .size
	LDA.b #$01
.size
	STA !t_a                 ; small flag
	CMP !vram_small
	BNE .request
	REP #$20
	TXA
	CMP !vram_cell
	BNE .request
	; A deferred pose may already be obsolete when Goku returns to the
	; resident cell. Cancel it instead of uploading that stale pose later.
	LDA.w #!GOKU_NONE
	STA !up_cell
	BRA .done
.request
	SEP #$20
	LDA !t_a
	STA !up_small
	REP #$20
	STX !up_cell
	; Decide compatibility outside vblank. The native CGRAM upload has
	; already happened by goku_nmi, so size/palette changes remain mandatory.
	SEP #$20
	LDA !up_flags
	AND.b #$FF-!GOKU_UP_COMPAT
	STA !up_flags
	LDA !up_small
	CMP !vram_small
	BNE .done
	LDX !vram_cell
	CPX.w #!GOKU_NONE
	BEQ .done
	LDA !cur_pal
	CMP.l goku_cell_pal,X
	BNE .done
	LDA !up_flags
	ORA.b #!GOKU_UP_COMPAT
	STA !up_flags
.done
	REP #$30
	RTS

; C1:95BC hook in the field NMI (replaced LDA $7EE083). M16 X8, D = $4300.
; While Goku stands in for the boy, skip the game's boy-tile upload: the cell
; in VRAM stays Goku's (menus and rings leave the slot alone). Every eighth
; of these 5-frame refreshes asks goku_nmi to re-send it as a safety net.
goku_upload_hook:
	PHP
	SEP #$20
	LDA.l $7E0000|!replacing
	BEQ .native
	LDA.l $7E0000|!up_flags
	CLC
	ADC.b #!GOKU_UP_COUNT1   ; bits 5-7 count the refreshes
	BCC .count
	ORA.b #!GOKU_UP_REFRESH  ; the eighth
.count
	STA.l $7E0000|!up_flags
	PLP
if defined("CORE_NATIVE_NMI_SLOW")
	JML $019678              ; continue with the girl's tiles
else
	JML $819678              ; keep the native uploader in FastROM
endif
.native
	PLP
	LDA.l $7EE083
if defined("CORE_NATIVE_NMI_SLOW")
	JML $0195C0
else
	JML $8195C0
endif

; C1:E6C4 hook (replaced LDA $7EE180): HUD portrait upload, boy part.
; Runs right after an NMI (or in forced blank), M8 X16, D = 0, $00 = VRAM
; word address ($7E80). DMA channel 7, as the original routine.
goku_hud_hook:
	JSR goku_check_on
	BCS .goku
	LDA.b #$00
	STA.l $7E0000|!hud_form  ; the game's own face is in VRAM now
	LDA.l $7EE180
	JML $01E6C8              ; JSR $E6DA, then the girl
.goku
	PHB
	PHP
	REP #$30
	LDA $00
	JSR goku_hud_dma
	REP #$20
	LDA $00
	CLC
	ADC.w #$0020
	STA $00
	PLP
	PLB
	JML $01E6CB              ; skip the boy's JSR $E6DA

; C0:66BD hook (replaced JSL $D0CDF9): ring set-up uploads its ten 2-tile
; graphics (cursor, the three party markers, ...) from D2:C680 on DMA
; channel 5. While Goku stands in, his 10x10 head (current form, at +3,+2
; in the 16x16 cell, engine/sprite-layer.js injectPortrait) then replaces
; the boy's marker, bank-1 tiles 0A/0B and 1A/1B, the same way. The marker
; draws with palette 1, which holds Goku's colours.
goku_ring_setup:
	JSL $D0CDF9
	PHP
	PHB
	REP #$30
	JSR goku_check_on
	BCC .done
	PEA $7E7E
	PLB
	PLB
	LDA !goku_form
	AND.w #$0001
	ASL
	ASL
	ASL
	CLC
	ADC.w #16                ; marker entries follow the two HUD portraits
	TAX
	LDA.w #$70A0             ; tiles 0A/0B
	JSR goku_marker_row
	LDA.w #$71A0             ; tiles 1A/1B
	JSR goku_marker_row
.done
	PLB
	PLP
	RTL

; Two tiles (X -> goku_portrait_tiles entries, advanced by 4) to VRAM word
; A16 on DMA channel 5. M16 X16, DB = $7E.
goku_marker_row:
	STA.l $002116
	SEP #$20
	LDA.b #$80
	STA.l $002115
	REP #$20
	LDY.w #2
.tile
	LDA.l goku_portrait_tiles,X
	PHA
	ASL
	ASL
	ASL
	ASL
	ASL
	STA.l $004352
	LDA.w #$1801
	STA.l $004350
	LDA.w #$0020
	STA.l $004355
	PLA
	XBA
	AND.w #$00FF
	LSR
	LSR
	LSR
	CLC
	ADC.w #$00F8
	SEP #$20
	STA.l $004354
	LDA.b #$20
	STA.l $00420B
	REP #$20
	INX
	INX
	DEY
	BNE .tile
	RTS

; Upload the 16x16 HUD portrait for the current form. A16 = VRAM word
; address of E8. M16 X16 in, any DB; uses channel 7. Exit M16 X16.
goku_hud_dma:
	PHB
	PHA
	PEA $7E7E
	PLB
	PLB
	SEP #$20
	LDA !goku_form
	AND.b #$01
	INC
	STA !hud_form            ; form + 1
	DEC
	REP #$20
	AND.w #$0001
	ASL
	ASL
	ASL                      ; form * 8 bytes (4 tile words)
	TAX
	PLA
	PLB
; A16 = VRAM word address of the top-left tile, X = offset of a portrait's
; four tile words in goku_portrait_tiles (top row, then the bottom row at
; +$100). Channel 7. M16 X16; any DB.
goku_portrait_dma:
	PHA
	STA.l $002116
	LDA.l goku_portrait_tiles+0,X
	JSR goku_dma_tile7
	LDA.l goku_portrait_tiles+2,X
	JSR goku_dma_tile7
	PLA
	CLC
	ADC.w #$0100
	STA.l $002116
	LDA.l goku_portrait_tiles+4,X
	JSR goku_dma_tile7
	LDA.l goku_portrait_tiles+6,X
	JSR goku_dma_tile7
	RTS

; DMA one 32-byte tile (A16 = global tile index) to the current VRAM address
; on channel 7. M16 X16; keeps X.
goku_dma_tile7:
	PHA
	ASL
	ASL
	ASL
	ASL
	ASL
	STA.l $004372
	LDA.w #$1801
	STA.l $004370
	LDA.w #$0020
	STA.l $004375
	PLA
	XBA
	AND.w #$00FF
	LSR
	LSR
	LSR
	CLC
	ADC.w #$00F8
	SEP #$20
	STA.l $004374
	LDA.b #$80
	STA.l $002115
	STA.l $00420B
	REP #$20
	RTS

; ---------------------------------------------------------------------------
; Field NMI work (modules_field_nmi): M16 X16, DB = $80, D = 0, in vblank.
; Four packed-row DMAs plus this callback take about 5.5 scanlines. Leave
; room for the remaining modules, FX palettes and the interrupt return.
; A same-palette/size pose waits for a suitable streaming phase; waiting a
; frame is never a reason to overrun. Palette and size changes still upload
; together because the native CGRAM buffer already contains the new colours.
!GOKU_CELL_LINES = 10
goku_nmi:
if not(defined("GOKU_NMI_SLOW"))
	; most frames have nothing to send: leave before any set-up (0.17 lines
	; instead of 0.6). (It once moved the wish flight's NMI into a channel-7
	; race in ending's frame-thread DMA set-ups; ending now waits out the
	; lines before the vblank NMI, f6f9cb8. -DGOKU_NMI_SLOW=1 keeps the old
	; prologue.)
	LDA.l $7E0000|!up_cell
	CMP.w #!GOKU_NONE
	BNE .pending
	LDA.l $7E0000|!up_flags
	AND.w #!GOKU_UP_HUD|!GOKU_UP_NATIVE|!GOKU_UP_REFRESH
	BNE .work
	RTL
.pending
	; A compatible pose can wait without the bank/frame setup or another
	; palette lookup. This matters when the native uploader leaves only
	; five lines for all modules, FX palettes and the interrupt return.
	LDA.l $7E0000|!up_flags
	AND.w #!GOKU_UP_HUD|!GOKU_UP_NATIVE|!GOKU_UP_REFRESH|!GOKU_UP_COMPAT
	CMP.w #!GOKU_UP_COMPAT
	BNE .work
	JSL core_vblank_lines
	CMP.w #!GOKU_CELL_LINES
	BCS .work
	RTL
endif
.work
	PHB
	PHD
	PEA $7E7E
	PLB
	PLB
	JSR goku_ensure_init
	REP #$30
	; restore the boy's own tiles when the replacement just ended
	LDA !up_flags
	AND.w #!GOKU_UP_NATIVE
	BEQ .refresh
	JSL core_vblank_lines
	CMP.w #6
	BCS .native_go
	JMP .done
.native_go
	JSR goku_upload_native
	SEP #$20
	LDA.b #!GOKU_UP_NATIVE|!GOKU_UP_REFRESH|!GOKU_UP_WAITED
	TRB !up_flags
	REP #$20
	LDA.w #!GOKU_NONE
	STA !up_cell
	BRL .hud
.refresh
	; every eighth party refresh (goku_upload_hook): re-send the cell in
	; VRAM as a safety net, into a vblank with room for it
	LDA !up_flags
	AND.w #!GOKU_UP_REFRESH
	BEQ .cell
	SEP #$20
	LDA.b #!GOKU_UP_REFRESH
	TRB !up_flags
	REP #$20
	LDA !up_cell
	CMP.w #!GOKU_NONE
	BNE .cell
	LDA !vram_cell
	CMP.w #!GOKU_NONE
	BEQ .hud
	JSL core_vblank_lines
	CMP.w #!GOKU_CELL_LINES
	BCC .hud
	LDA !vram_cell
	STA !up_cell
	SEP #$20
	LDA !vram_small
	STA !up_small
	REP #$20
.cell
	LDA !up_cell
	CMP.w #!GOKU_NONE
	BEQ .hud
	JSL core_vblank_lines
	CMP.w #!GOKU_CELL_LINES
	BCS .send
	LDA !vram_cell
	CMP.w #!GOKU_NONE
	BEQ .send
	TAX
	SEP #$20
	LDA !up_small
	CMP !vram_small
	BNE .send8               ; size change: send now
	LDA.l goku_cell_pal,X
	LDX !up_cell
	CMP.l goku_cell_pal,X
	BNE .send8               ; palette change: send now
	LDA !up_flags
	ORA.b #!GOKU_UP_WAITED
	STA !up_flags
	REP #$20
	BRA .hud
.send8
	REP #$20
.send
	JSR goku_upload_cell
	LDA !up_cell
	STA !vram_cell
	SEP #$20
	LDA !up_small
	STA !vram_small
	LDA.b #!GOKU_UP_WAITED
	TRB !up_flags
	REP #$20
	LDA.w #!GOKU_NONE
	STA !up_cell
.hud
	LDA !up_flags
	AND.w #!GOKU_UP_HUD
	BEQ .done
	JSL core_vblank_lines
	CMP.w #3
	BCC .done
	SEP #$20
	LDA.b #!GOKU_UP_HUD
	TRB !up_flags
	REP #$20
	LDA.w #!VRAM_HUD
	JSR goku_hud_dma
.done
	REP #$30
	PLD
	PLB
	RTL

; Upload the same pixels as the deduplicated tile table, packed into rows
; in extended ROM. One channel and four row transfers avoid sixteen tile
; address decodes and leave channels 4-6 (including UI HDMA 5) alone.
; DB = $7E, M16 X16. Every packed cell stays within its source bank.
goku_upload_cell:
	LDA !up_cell
	ASL
	ASL
	TAX                      ; cell * 4-byte pointer
	LDA.w #$4300
	TCD
	LDA.w #$1801
	STA $70
	STZ $75
	SEP #$20
	LDA.b #$80
	STA.l $002115
	REP #$20
	LDA !up_small
	AND.w #$00FF
	BNE .small
	LDA.l goku_dma_tiles,X
	STA $72
	LDA.l goku_dma_tiles+2,X
	STA $74                  ; source bank, initial size low byte 0
	LDX.w #128
	LDA.w #!VRAM_ROW0
	JSR .row
	LDA.w #!VRAM_ROW1
	JSR .row
	LDA.w #!VRAM_ROW2
	JSR .row
	LDA.w #!VRAM_ROW3
	JSR .row
	BRA .done
.small
	LDA.l goku_dma_mini,X
	STA $72
	LDA.l goku_dma_mini+2,X
	STA $74
	LDX.w #64
	LDA.w #!VRAM_ROW0
	JSR .row
	LDA.w #!VRAM_ROW1
	JSR .row
.done
	LDA.w #$0000
	TCD
	RTS
.row
	STA.l $002116
	STX $75
	SEP #$20
	LDA.b #$80
	STA.l $00420B
	REP #$20
	RTS

; One burst: A16 = VRAM word address, X = offset of 4 tile words in
; goku_cell_tiles (advanced by 8). D = $4300, M16 X16. Tile t lives at
; bank $F8 + t/2048, address (t*32) & $FFFF; the size's high byte is 0
; (goku_upload_cell, and every finished transfer leaves it so).
macro goku_dma_src(table, n, ch)
	LDA.l <table>+(<n>*2),X
	ASL
	ASL
	ASL
	ASL
	ASL
	STA <ch>+2
	LDA.l <table>+(<n>*2)+1,X
	AND.w #$0018             ; t >> 11, times 8
	LSR
	LSR
	LSR
	ORA.w #$20F8             ; bank $F8 + t/2048, size low byte $20
	STA <ch>+4
endmacro

goku_burst4:
	STA.l $002116
	%goku_dma_src(goku_cell_tiles, 0, $40)
	%goku_dma_src(goku_cell_tiles, 1, $50)
	%goku_dma_src(goku_cell_tiles, 2, $60)
	%goku_dma_src(goku_cell_tiles, 3, $70)
	SEP #$20
	LDA.b #$F0
	STA.l $00420B
	REP #$20
	TXA
	CLC
	ADC.w #$0008
	TAX
	RTS

goku_burst2_mini:
	STA.l $002116
	%goku_dma_src(goku_cell_mini, 0, $40)
	%goku_dma_src(goku_cell_mini, 1, $50)
	SEP #$20
	LDA.b #$30
	STA.l $00420B
	REP #$20
	TXA
	CLC
	ADC.w #$0004
	TAX
	RTS

; The boy's own tiles from the game's table ($0C00, bank $E082, count
; $E083), exactly as C1:95BC uploads them. DB = $7E, M16 X16.
goku_upload_native:
	LDA $E083
	AND.w #$00FF
	BNE .some
	RTS
.some
	STA !t_c
	LDA.w #$4300
	TCD
	LDA.w #$1801
	STA $40
	STA $50
	STA $60
	STA $70
	LDA $E082
	AND.w #$00FF
	ORA.w #$2000
	STA $44
	STA $54
	STA $64
	STA $74
	SEP #$20
	LDA.b #$80
	STA.l $002115
	REP #$20
	LDA.w #!VRAM_ROW0
	STA.l $002116
	LDA $0C00
	STA $42
	LDA $0C02
	STA $52
	LDA $0C08
	STA $62
	LDA $0C0A
	STA $72
	JSR .go
	LDA.w #!VRAM_ROW1
	STA.l $002116
	LDA $0C04
	STA $42
	LDA $0C06
	STA $52
	LDA $0C0C
	STA $62
	LDA $0C0E
	STA $72
	JSR .go
	LDA !t_c
	CMP.w #$0003
	BCC .restore
	LDA.w #!VRAM_ROW2
	STA.l $002116
	LDA $0C10
	STA $42
	LDA $0C12
	STA $52
	LDA $0C18
	STA $62
	LDA $0C1A
	STA $72
	JSR .go
	LDA.w #!VRAM_ROW3
	STA.l $002116
	LDA $0C14
	STA $42
	LDA $0C16
	STA $52
	LDA $0C1C
	STA $62
	LDA $0C1E
	STA $72
	JSR .go
.restore
	LDA.w #$0000
	TCD
.done
	RTS
.go
	SEP #$20
	LDA.b #$20
	STA $45
	STA $55
	STA $65
	STA $75
	STZ $46
	STZ $56
	STZ $66
	STZ $76
	LDA.b #$F0
	STA.l $00420B
	REP #$20
	RTS
