; Ending module services: vblank hook, transfer engine, palettes and fades,
; OAM, math, native-request suppression. Included by module.asm (code bank).

!CODE_BANK #= !CODE_ENDING>>16
!CB #= !CODE_ENDING&$FF0000      ; code bank base for long,X table reads

; Library scratch and parameter defines live in module.asm.

; ===========================================================================
; Vblank hook (field NMI, after the game's uploads, still force-blanked).
; P = M16/X16, DB = $80.
; ===========================================================================
ending_nmi:
	PHB
	PEA $3232 : PLB : PLB
	SEP #$20
	LDA.l !ending_live
	BEQ .out
	AND.b #$02
	BEQ .noRestore
	JSR nmi_restore
	SEP #$20
	LDA.l !ending_live
	AND.b #$FD
	STA.l !ending_live
.noRestore
	LDA.l !ending_live
	AND.b #$01
	BEQ .out
	SEP #$20
	LDA.w !s_regson
	BEQ .noRegs
	JSR nmi_regs
.noRegs
	JSR nmi_words
	JSR nmi_transfers
.out
	REP #$30
	PLB
	RTL

; Field values from the map loader's shadows (02:AAB3, 01:FD5B).
nmi_restore:
	SEP #$20
	LDA.w !N_MOSAIC : STA.w $2106
	STZ.w $2123
	STZ.w $2125
	STZ.w $212A
	STZ.w $212B
	LDA.w !N_TM : STA.w $212C
	LDA.w !N_TS : STA.w $212D
	STZ.w $212E
	STZ.w $212F
	LDA.b #$02 : STA.w $2130
	LDA.w !N_CGADSUB : STA.w $2131
	LDA.b #$E0 : STA.w $2132
	STZ.w $2126
	STZ.w $2128
	LDA.b #$FF
	STA.w $2127
	STA.w $2129
	LDA.w !N_OBJSEL : STA.w $2101
	LDA.b #$09 : STA.w $2105
	LDA.b #$51 : STA.w $2107
	LDA.b #$39 : STA.w $2108
	STZ.w $210B
	REP #$30
	RTS

; The scene's PPU registers. BG3 registers are never written.
nmi_regs:
	REP #$20
	LDA.w !s_bgmode                ; $2105 mode, $2106 mosaic off
	AND.w #$00FF
	STA.w $2105
	LDA.w !s_bg1sc   : STA.w $2107 ; BG1SC, BG2SC
	LDA.w !s_tm      : STA.w $212C ; TM, TS
	LDA.w !s_cgwsel  : STA.w $2130 ; CGWSEL, CGADSUB
	LDA.w !s_tmw     : STA.w $212E ; TMW, TSW
	LDA.w !s_wbglog  : STA.w $212A ; WBGLOG, WOBJLOG
	LDA.w !s_wh0     : STA.w $2126 ; WH0, WH1
	LDA.w !s_wh2     : STA.w $2128 ; WH2, WH3
	SEP #$20
	LDA.w !s_bg12nba : STA.w $210B
	LDA.w !s_objsel  : STA.w $2101
	LDA.w !s_coldr   : STA.w $2132
	LDA.w !s_coldg   : STA.w $2132
	LDA.w !s_coldb   : STA.w $2132
	LDA.w !s_w12sel  : STA.w $2123
	LDA.w !s_wobjsel : STA.w $2125
	LDA.w !s_bg1h    : STA.w $210D
	LDA.w !s_bg1h+1  : STA.w $210D
	LDA.w !s_bg1v    : STA.w $210E
	LDA.w !s_bg1v+1  : STA.w $210E
	LDA.w !s_bg2h    : STA.w $210F
	LDA.w !s_bg2h+1  : STA.w $210F
	LDA.w !s_bg2v    : STA.w $2110
	LDA.w !s_bg2v+1  : STA.w $2110
	LDA.w !s_mode7
	BEQ .noM7
	LDA.w !s_m7sel   : STA.w $211A
	LDA.w !s_m7a     : STA.w $211B
	LDA.w !s_m7a+1   : STA.w $211B
	LDA.w !s_m7b     : STA.w $211C
	LDA.w !s_m7b+1   : STA.w $211C
	LDA.w !s_m7c     : STA.w $211D
	LDA.w !s_m7c+1   : STA.w $211D
	LDA.w !s_m7d     : STA.w $211E
	LDA.w !s_m7d+1   : STA.w $211E
	LDA.w !s_m7x     : STA.w $211F
	LDA.w !s_m7x+1   : STA.w $211F
	LDA.w !s_m7y     : STA.w $2120
	LDA.w !s_m7y+1   : STA.w $2120
.noM7
	JSR nmi_bg3cut
	; HDMA channels: core writes $420C from $2C after the module hooks.
	SEP #$20
	LDA.w !N_HDMA
	ORA.w !s_hdma
	STA.w !N_HDMA
	REP #$30
	RTS

; Planet pictures keep native dialogue above them only for y < 170
; (planet-view/shenron-ending): HDMA channel 5 rewrites TM at line 170. An
; optional band of lines [s_band_top, s_band_bot) adds s_band_bits to TM
; (the escape's teleport lines on BG1).
!HDMA_CUT = $20
!HDMA_WIN = $5C                 ; channels 2, 3, 4, 6
nmi_bg3cut:
	SEP #$20
	LDA.w !s_bg3cut
	BNE .on
	LDA.w !s_hdma
	AND.b #~!HDMA_CUT
	STA.w !s_hdma
	LDA.w !N_HDMA
	AND.b #~!HDMA_CUT
	STA.w !N_HDMA
	BRA .window
.on
	REP #$20
	LDA.w #$2C00              ; mode 0 (one register), B-bus $212C
	STA.w $4350
	LDA.w !s_cutptr           ; the table the frame side built last
	STA.w $4352
	SEP #$20
	LDA.b #$32
	STA.w $4354
	LDA.w !s_hdma
	ORA.b #!HDMA_CUT
	STA.w !s_hdma
.window
	; Window positions (disc, shock ring): HDMA channels 2, 3, 4 and 6
	; write WH0-WH3 (indirect, one register each) through the constant
	; tables of the buffer the frame side finished last.
	SEP #$20
	LDA.w !s_win
	BNE .winOn
	LDA.w !s_hdma
	AND.b #~!HDMA_WIN
	STA.w !s_hdma
	LDA.w !N_HDMA
	AND.b #~!HDMA_WIN
	STA.w !N_HDMA
	RTS
.winOn
	REP #$20
	LDA.w !s_winptr
	BEQ .bufA
	LDA.w #4*!ENDING_WIN_HDMA_LEN
.bufA
	CLC
	ADC.w #ending_space_win_hdma&$FFFF
	STA.w $4322
	CLC
	ADC.w #!ENDING_WIN_HDMA_LEN
	STA.w $4332
	CLC
	ADC.w #!ENDING_WIN_HDMA_LEN
	STA.w $4342
	CLC
	ADC.w #!ENDING_WIN_HDMA_LEN
	STA.w $4362
	LDA.w #$2640              ; indirect, mode 0: WH0
	STA.w $4320
	LDA.w #$2740              ; WH1
	STA.w $4330
	LDA.w #$2840              ; WH2
	STA.w $4340
	LDA.w #$2940              ; WH3
	STA.w $4360
	SEP #$20
	LDA.b #ending_space_win_hdma>>16
	STA.w $4324
	STA.w $4334
	STA.w $4344
	STA.w $4364
	LDA.b #$32                ; arrays in the scene work area
	STA.w $4327
	STA.w $4337
	STA.w $4347
	STA.w $4367
	LDA.w !s_hdma
	ORA.b #!HDMA_WIN
	STA.w !s_hdma
	RTS
; Frame side: the TM table for HDMA channel 5 into the half of s_hdmabuf
; the vblank is not using: lines 0..169 TM (optionally with the band
; [s_band_top, s_band_bot) adding s_band_bits), then the cut value from
; line 170, again from 196 (after the field IRQ's HUD split, which writes
; TM = BG3 + OBJ at the end of line 195).
cut_build:
	PHP
	SEP #$20
	LDA.w !s_bg3cut
	BNE .on
	PLP
	RTS
.on
	REP #$30
	LDA.w !s_cutptr
	EOR.w #$0020
	AND.w #$0020
	CLC
	ADC.w #!s_hdmabuf
	STA.w !l_cutnew
	TAX
	SEP #$20
	LDA.w !s_band_top
	CMP.w !s_band_bot
	BCS .plain
	STA.w !s_tmp
	LDA.w !s_tm
	JSR .seg
	LDA.w !s_band_bot
	SEC
	SBC.w !s_band_top
	STA.w !s_tmp
	LDA.w !s_tm
	ORA.w !s_band_bits
	JSR .seg
	LDA.b #170
	SEC
	SBC.w !s_band_bot
	BRA .rest
.plain
	LDA.b #170
.rest
	STA.w !s_tmp
	LDA.w !s_tm
	JSR .seg
	LDA.b #26 : STA.w $0000,X
	LDA.w !s_tmcut : STA.w $0001,X
	LDA.b #$01 : STA.w $0002,X
	LDA.w !s_tmcut : STA.w $0003,X
	LDA.b #$00 : STA.w $0004,X
	REP #$20
	LDA.w !l_cutnew
	STA.w !s_cutptr
	PLP
	RTS
; s_tmp lines of TM value A (M8) at X, in entries of <= 127 lines.
.seg
	STA.w !s_tmp+1
.segLoop
	LDA.w !s_tmp
	BEQ .segDone
	CMP.b #128
	BCC .segLast
	LDA.b #127
.segLast
	STA.w $0000,X
	STA.w !s_tmp+2
	LDA.w !s_tmp+1
	STA.w $0001,X
	INX : INX
	LDA.w !s_tmp
	SEC
	SBC.w !s_tmp+2
	STA.w !s_tmp
	BRA .segLoop
.segDone
	RTS

; Single-word VRAM writes queued from the frame side (vram_word).
nmi_words:
	REP #$30
	LDA.w !s_vwcount
	BEQ .done
	ASL : ASL
	STA.w !s_nmitmp+8
	SEP #$20
	LDA.b #$80 : STA.w $2115
	REP #$20
	LDX.w #$0000
.loop
	LDA.w !s_stage,X
	STA.w $2116
	LDA.w !s_stage+2,X
	STA.w $2118
	INX : INX : INX : INX
	CPX.w !s_nmitmp+8
	BCC .loop
	STZ.w !s_vwcount
.done
	RTS

; ---------------------------------------------------------------------------
; Transfer engine costs in budget bytes (160 per scanline): the CPU time of
; setting up one DMA and of fetching one queue entry, measured in Mesen.
!XFER_DMA_COST   = 208
!XFER_FETCH_COST = 176
!XFER_GOKU_COST  = $0200+(16*64)              ; 512 bytes in 16 tile DMAs

; Transfer engine. The dynamic queue (cell swaps) runs before the load
; script. While a scene is loading the picture is black and the field NMI
; is still force-blanked, so an overrun only delays the display; otherwise
; transfers stop with the vblank (core_vblank_lines).
nmi_transfers:
	REP #$30
	SEP #$20
	LDA.w !s_loading
	REP #$20
	BEQ .visible
	LDA.w #$3000
	BRA .set
.visible
	JSL core_vblank_lines          ; lines left before scanline 258
	STA.w !s_nmitmp
	ASL : ASL : ASL : ASL : ASL    ; *32
	STA.w !s_nmitmp+2
	ASL : ASL                      ; *128
	CLC
	ADC.w !s_nmitmp+2              ; *160 bytes per line
	SEC
	SBC.w #$0180                   ; margin for the core queue
	BPL .set
	LDA.w #$0000
.set
	STA.w !s_budget
.loop
	REP #$30
	LDA.w !s_budget
	BEQ .done
	BMI .done
	LDA.w !s_cur+6
	SEC
	SBC.w !s_curoff
	BNE .have
	JSR fetch_transfer
	BCS .empty
	LDA.w !s_budget               ; fetching costs about a line
	SEC
	SBC.w #!XFER_FETCH_COST
	STA.w !s_budget
	BRA .loop
.empty
	; Nothing left: a finished script ends the loading phase.
	SEP #$20
	LDA.w !s_ldptr+2
	BNE .done
	LDA.b #$00
	STA.w !s_loading
	BRA .done
.have
	LDA.w !s_cur+3
	AND.w #$00FF
	CMP.w #!LD_GOKU+1
	BCS .skipBad
	ASL
	TAX
	JSR (xfer_table,X)
	BCC .loop
.done
	REP #$30
	RTS
.skipBad
	LDA.w !s_cur+6
	STA.w !s_curoff
	BRA .loop

xfer_table:
	dw xfer_vram, xfer_m7map, xfer_m7chr, xfer_cell32, xfer_cell16, xfer_cgram, xfer_fill, xfer_goku

; Next transfer into s_cur. Carry set when the queue and script are empty.
fetch_transfer:
	REP #$30
	LDA.w !s_dqhead
	CMP.w !s_dqtail
	BEQ .script
	TAX
	LDA.w !s_dq,X : STA.w !s_cur
	LDA.w !s_dq+2,X : STA.w !s_cur+2
	LDA.w !s_dq+4,X : STA.w !s_cur+4
	LDA.w !s_dq+6,X : STA.w !s_cur+6
	TXA
	CLC
	ADC.w #$0008
	AND.w #!DQ_SIZE-1
	STA.w !s_dqhead
	BRA .got
.script
	SEP #$20
	LDA.w !s_ldptr+2
	REP #$20
	BEQ .none
	LDX.w !s_ldptr
	LDA.l !CB+3,X
	AND.w #$00FF
	CMP.w #!LD_END
	BNE .entry
	SEP #$20
	LDA.b #$00
	STA.w !s_ldptr+2
	REP #$20
.none
	SEC
	RTS
.entry
	LDA.l !CB+0,X : STA.w !s_cur
	LDA.l !CB+2,X : STA.w !s_cur+2
	LDA.l !CB+4,X : STA.w !s_cur+4
	LDA.l !CB+6,X : STA.w !s_cur+6
	TXA
	CLC
	ADC.w #$0008
	STA.w !s_ldptr
.got
	LDA.w #$0000
	STA.w !s_curoff
	CLC
	RTS

; n = min(size - off, budget), rounded down to even. Returns A = n, Z if 0.
xfer_amount:
	LDA.w !s_cur+6
	SEC
	SBC.w !s_curoff
	CMP.w !s_budget
	BCC .fit
	LDA.w !s_budget
.fit
	AND.w #$FFFE
	STA.w !s_nmitmp+4
	RTS

; Common DMA tail: A1T = src + off, A1B = bank, DAS = n, start channel 7,
; then advance offset and budget. A16 on entry = DMAP|BBAD<<8.
xfer_go:
	STA.w $4370
	LDA.w !s_cur
	CLC
	ADC.w !s_curoff
	STA.w $4372
	LDA.w !s_nmitmp+4
	STA.w $4375
	SEP #$20
	LDA.w !s_cur+2
	STA.w $4374
	LDA.b #$80
	STA.w $420B
	REP #$20
	LDA.w !s_curoff
	CLC
	ADC.w !s_nmitmp+4
	STA.w !s_curoff
	; bytes plus this code's own time (~1.3 lines per DMA on SlowROM)
	LDA.w !s_budget
	SEC
	SBC.w !s_nmitmp+4
	SEC
	SBC.w #!XFER_DMA_COST
	STA.w !s_budget
	CLC
	RTS

xfer_vram:
	JSR xfer_amount
	BEQ xfer_stop
	SEP #$20
	LDA.b #$80 : STA.w $2115
	REP #$20
	LDA.w !s_curoff
	LSR
	CLC
	ADC.w !s_cur+4
	STA.w $2116
	LDA.w #$1801
	JMP xfer_go
xfer_stop:
	SEC
	RTS

xfer_m7map:
	JSR xfer_amount
	BEQ xfer_stop
	SEP #$20
	LDA.b #$00 : STA.w $2115
	REP #$20
	LDA.w !s_curoff
	CLC
	ADC.w !s_cur+4
	STA.w $2116
	LDA.w #$1800
	JMP xfer_go

xfer_m7chr:
	JSR xfer_amount
	BEQ xfer_stop
	SEP #$20
	LDA.b #$80 : STA.w $2115
	REP #$20
	LDA.w !s_curoff
	CLC
	ADC.w !s_cur+4
	STA.w $2116
	LDA.w #$1900
	JMP xfer_go

; One OBJ row per call: 128 bytes (32x32 cells) or 64 bytes (16x16 cells),
; rows $100 words apart.
xfer_cell32:
	LDA.w #$0080
	BRA xfer_cell
xfer_cell16:
	LDA.w #$0040
xfer_cell:
	STA.w !s_nmitmp+6              ; row size
	CMP.w !s_budget
	BEQ .ok
	BCS xfer_stop
.ok
	STA.w !s_nmitmp+4
	SEP #$20
	LDA.b #$80 : STA.w $2115
	REP #$20
	; VRAM = dest + row * $100, row = off / rowsize
	LDA.w !s_curoff
	LDX.w !s_nmitmp+6
	CPX.w #$0080
	BEQ .r128
	ASL                            ; off/64 * 256 = off * 4
	ASL
	BRA .addr
.r128
	ASL                            ; off/128 * 256 = off * 2
.addr
	CLC
	ADC.w !s_cur+4
	STA.w $2116
	LDA.w #$1801
	JMP xfer_go

xfer_cgram:
	JSR xfer_amount
	BNE .go
	SEC
	RTS
.go
	SEP #$20
	LDA.w !s_curoff
	LSR
	CLC
	ADC.w !s_cur+4
	STA.w $2121
	REP #$20
	LDA.w #$2200
	JMP xfer_go

xfer_fill:
	JSR xfer_amount
	BNE .go
	SEC
	RTS
.go
	SEP #$20
	LDA.b #$80 : STA.w $2115
	REP #$20
	LDA.w !s_curoff
	LSR
	CLC
	ADC.w !s_cur+4
	STA.w $2116
	; Fixed source: the byte at src goes to both $2118 and $2119; the source
	; address must not advance, so pass offset 0 through xfer_go.
	LDA.w !s_curoff
	PHA
	STZ.w !s_curoff
	LDA.w #$1809
	JSR xfer_go
	PLA
	CLC
	ADC.w !s_nmitmp+4
	STA.w !s_curoff
	CLC
	RTS

; A Goku cell from the goku module's tile pool (banks $F8-$FA): sixteen
; 32-byte tile DMAs from the table queue_goku prepared at s_goku_dma
; (5 bytes per tile: source address, bank, VRAM word address).
xfer_goku:
	LDA.w #!XFER_GOKU_COST
	CMP.w !s_budget
	BEQ .ok
	BCC .ok
	SEC
	RTS
.ok
	SEP #$20
	LDA.b #$80 : STA.w $2115
	REP #$20
	LDA.w #$1801
	STA.w $4370
	LDX.w #$0000
.tile
	LDA.w !s_goku_dma,X
	STA.w $4372
	LDA.w !s_goku_dma+3,X
	STA.w $2116
	LDA.w #$0020
	STA.w $4375
	SEP #$20
	LDA.w !s_goku_dma+2,X
	STA.w $4374
	LDA.b #$80
	STA.w $420B
	REP #$20
	INX : INX : INX : INX : INX
	CPX.w #16*5
	BCC .tile
	LDA.w !s_cur+6
	STA.w !s_curoff
	LDA.w !s_budget
	SEC
	SBC.w #!XFER_GOKU_COST
	STA.w !s_budget
	CLC
	RTS

; Queue a Goku pose (goku module sheet A = 0 base / 1 Super Saiyan, column X,
; row Y) into scene cells starting at s_tmp+6 and copy its palette to OBJ
; colour s_tmp+4 (a multiple of 16). The 16 tile transfers are resolved
; here (goku_cell_tiles' 4x4 grid: quadrants TL, TR, BL, BR, each two
; rows of two tiles, rows $100 words apart in the cell grid). Clobbers the
; q_* block; one Goku transfer may be pending at a time.
queue_goku:
	PHP
	REP #$30
	JSL goku_api_cell
	REP #$30
	CMP.w #$FFFF
	BNE .cell
	JMP .none
.cell
	STA.w !l_qcell
	ASL : ASL : ASL : ASL : ASL   ; 32 bytes of tile indices per cell
	STA.w !l_quadx
	LDY.w #$0000                  ; 0..15: quadrant*4 + half*2 + t
	LDX.w #$0000                  ; table offset
.tile
	; grid position: row = (q>>1)*2 + half, col = (q&1)*2 + t
	PHX
	TYA
	AND.w #$0001
	STA.w !l_quadi                ; t
	TYA
	AND.w #$0004
	LSR
	ORA.w !l_quadi
	STA.w !l_quadi                ; col
	TYA
	AND.w #$0002
	LSR
	STA.w !l_bits                 ; half
	TYA
	AND.w #$0008
	LSR : LSR
	ORA.w !l_bits                 ; row
	ASL : ASL
	ORA.w !l_quadi                ; row*4 + col
	ASL
	CLC
	ADC.w !l_quadx
	TAX
	LDA.l goku_cell_tiles,X       ; global tile index
	PLX
	PHA
	ASL : ASL : ASL : ASL : ASL
	STA.w !s_goku_dma,X           ; source address
	PLA
	XBA
	AND.w #$00FF
	LSR : LSR : LSR
	CLC
	ADC.w #$00F8
	SEP #$20
	STA.w !s_goku_dma+2,X         ; bank
	REP #$20
	; VRAM: cell (first + q) + half*$100 + t*$10
	TYA
	LSR : LSR
	CLC
	ADC.w !s_tmp+6
	PHX
	JSR cell_vram
	PLX
	STA.w !l_m0
	TYA
	AND.w #$0002
	BEQ .top
	LDA.w #$0100
.top
	CLC
	ADC.w !l_m0
	STA.w !l_m0
	TYA
	AND.w #$0001
	BEQ .left
	LDA.w #$0010
.left
	CLC
	ADC.w !l_m0
	STA.w !s_goku_dma+3,X
	TXA
	CLC
	ADC.w #$0005
	TAX
	INY
	CPY.w #$0010
	BCS .queued
	JMP .tile
.queued
	LDA.w #!s_goku_dma
	STA.w !q_src
	LDA.w !s_tmp+6
	STA.w !q_dest
	SEP #$20
	LDA.b #$32
	STA.w !q_src+2
	LDA.b #!LD_GOKU
	STA.w !q_mode
	REP #$20
	LDA.w #$0200
	STA.w !q_size
	JSR queue_add
	; palette: goku_palettes[goku_cell_pal[cell]]
	LDA.w !l_qcell
	TAX
	LDA.l goku_cell_pal,X
	AND.w #$0007
	ASL : ASL : ASL : ASL : ASL
	TAX
	LDA.w !s_tmp+4
	ASL
	TAY
	LDA.w #$0010
	STA.w !l_palc
.colour
	LDA.l goku_palettes,X
	PHX
	TYX
	JSR pal_store
	PLX
	INX : INX
	INY : INY
	DEC.w !l_palc
	BNE .colour
	SEP #$20
	LDA.b #$03
	TSB.w !s_paldirty
.none
	PLP
	RTS

; ---------------------------------------------------------------------------
; Dynamic transfers. Parameters in !q_* (s_tmp+8..15). Carry set when full.
queue_add:
	PHP
	REP #$30
	LDA.w !s_dqtail
	CLC
	ADC.w #$0008
	AND.w #!DQ_SIZE-1
	CMP.w !s_dqhead
	BEQ .full
	LDX.w !s_dqtail
	LDA.w !q_src   : STA.w !s_dq,X
	LDA.w !q_src+2 : STA.w !s_dq+2,X
	LDA.w !q_dest  : STA.w !s_dq+4,X
	LDA.w !q_size  : STA.w !s_dq+6,X
	TXA
	CLC
	ADC.w #$0008
	AND.w #!DQ_SIZE-1
	STA.w !s_dqtail
	PLP
	CLC
	RTS
.full
	PLP
	SEC
	RTS

; Queue one VRAM word: A16 = value, X16 = word address (s_stage, 64 max).
; Carry set when full. M16/X16.
vram_word:
	PHA
	LDA.w !s_vwcount
	CMP.w #$0040
	BCS .full
	ASL : ASL
	TAY
	TXA
	STA.w !s_stage,Y
	PLA
	STA.w !s_stage+2,Y
	INC.w !s_vwcount
	CLC
	RTS
.full
	PLA
	SEC
	RTS

; Upload a 32x32 picture stored as four 16x16 cells (512 bytes at q_src)
; into cells A..A+3 of the scene's 16x16 cell grid (cell_vram).
queue_quad:
	PHP
	REP #$30
	STA.w !l_qcell
	LDX.w #$0004
.cell
	PHX
	LDA.w !l_qcell
	JSR cell_vram
	STA.w !q_dest
	SEP #$20
	LDA.b #!LD_CELL16
	STA.w !q_mode
	REP #$20
	LDA.w #$0080
	STA.w !q_size
	JSR queue_add
	LDA.w !q_src
	CLC
	ADC.w #$0080
	STA.w !q_src
	INC.w !l_qcell
	PLX
	DEX
	BNE .cell
	PLP
	RTS

; VRAM word address of 16x16 cell A in the scene's OBJ cell grid: cells
; are 2 tiles wide, 8 per tile-row pair, from !s_cellvram.
cell_vram:
	PHA
	AND.w #$0007
	XBA
	LSR : LSR : LSR                ; (c & 7) * $20
	STA.w !s_nmitmp+8
	PLA
	PHA
	AND.w #$FFF8
	XBA
	LSR : LSR                      ; (c >> 3) * $200 = (c & ~7) * $40
	CLC
	ADC.w !s_nmitmp+8
	CLC
	ADC.w !s_cellvram
	STA.w !s_nmitmp+8
	PLA
	LDA.w !s_nmitmp+8
	RTS

; OAM tile number of cell A: tile0 + (c>>3)*32 + (c&7)*2.
cell_tile:
	PHA
	AND.w #$0007
	ASL
	STA.w !l_cell
	PLA
	AND.w #$FFF8
	ASL : ASL                      ; (c>>3)*32
	CLC
	ADC.w !l_cell
	CLC
	ADC.w !s_celltile
	RTS

; ---------------------------------------------------------------------------
; Palettes. s_palbase holds the scene's colours; palette_build applies the
; white/black mix (dim, brighten, departure white/black) and writes
; s_palout, which the vblank hook copies into the declared ranges.

; Commit our CGRAM ranges: the field NMI uploads the game's palette buffer
; 7E:0600-07FF to CGRAM on every completed frame, so s_palout's ranges go
; into that buffer (DMA through WMDATA) after the game's own palette work
; (its animations rewrite some entries every few frames). The buffer's
; original contents are saved when a scene takes the screen (s_palsave)
; and restored when it lets go on the same map.
pal_commit:
	PHP
	REP #$30
	; the buffer the field NMI will upload: 7E:0600, or 7E:BE00 while $2A
	; is set (C0:C0F5)
	LDA.w #$0600
	STA.w !l_pcbase
	LDA.w $002A
	AND.w #$00FF
	BEQ .base
	LDA.w #$BE00
	STA.w !l_pcbase
.base
	LDX.w #$0000
.range
	CPX.w #$0008
	BCS .done
	TXA
	LSR
	TAY
	SEP #$20
	CMP.w !s_palcount
	REP #$20
	BCS .done
	LDA.w !s_palrange,X
	AND.w #$00FF
	ASL
	STA.w !l_m0               ; first * 2
	CLC
	ADC.w !l_pcbase
	STA.w $2181               ; WRAM address: the buffer + first * 2
	SEP #$20
	STZ.w $2183
	LDA.w !s_palgrp,Y
	CMP.b #$02
	BEQ .direct
	LDA.b #$32
	STA.w $4374
	REP #$20
	LDA.w !l_m0
	CLC
	ADC.w #!s_palout
	BRA .src
.direct
	LDA.b #!CODE_BANK         ; a generator palette in the code bank
	STA.w $4374
	REP #$20
	LDA.w !s_dirsrc
.src
	STA.w $4372
	LDA.w !s_palrange+1,X
	AND.w #$00FF
	BNE .count
	LDA.w #$0100
.count
	ASL
	STA.w $4375
	LDA.w #$8000              ; A -> B, one register: $2180 WMDATA
	STA.w $4370
	SEP #$20
	LDA.b #$80
	STA.w $420B
	REP #$20
	INX : INX
	BRA .range
.done
	; per-frame colours over a direct range (the fragments' seam and depth)
	LDA.w !s_edgeon
	BEQ .out
	LDA.w !l_pcbase
	CLC
	ADC.w #$0180+28           ; OBJ palette 4, colour 14
	TAY
	LDX.w #$0000
.edge
	PHX
	LDA.w !s_edge,X
	TYX
	STA.l $7E0000,X
	PLX
	PHX
	LDA.w !s_edge+2,X
	TYX
	STA.l $7E0002,X
	PLX
	TYA
	CLC
	ADC.w #$0020
	TAY
	INX : INX : INX : INX
	CPX.w #16
	BCC .edge
.out
	PLP
	RTS

; Save (A = 0) or restore (A != 0) the game's palette buffer 7E:0600-07FF
; against s_palsave.
pal_native:
	PHP
	REP #$30
	PHB
	TAY
	BNE .restore
	LDX.w #$0600
	LDY.w #!s_palsave
	BRA .move
.restore
	LDX.w #!s_palsave
	LDY.w #$0600
.move
	LDA.w #$01FF
	MVN $32,$32
	PLB
	PLP
	RTS

; Copy A colours from the code-bank table at X to base colours from colour
; Y: their component arrays, which palette_build reads.
pal_set:
	PHP
	REP #$30
	STA.w !l_palc
	TYA
	ASL
	TAY
.next
	LDA.l !CB,X
	PHX
	TYX
	JSR pal_store
	PLX
	INX : INX
	INY : INY
	DEC.w !l_palc
	BNE .next
	SEP #$20
	LDA.b #$03
	TSB.w !s_paldirty
	PLP
	RTS

; Store base colour A at byte offset X (its components).
pal_store:
	PHA
	AND.w #$001F
	ASL
	STA.w !s_compr,X
	LDA $01,S
	AND.w #$03E0
	LSR : LSR : LSR : LSR
	STA.w !s_compg,X
	PLA
	XBA
	LSR
	AND.w #$003E
	STA.w !s_compb,X
	RTS

; Declare a CGRAM range for the vblank hook: A = first colour, X = count.
pal_range:
	PHP
	SEP #$30
	PHA
	LDA.w !s_palcount
	TAY
	LDA.b #$00
	STA.w !s_palgrp,Y
	TYA
	ASL
	TAY
	PLA
	STA.w !s_palrange,Y
	TXA
	STA.w !s_palrange+1,Y
	INC.w !s_palcount
	LDA.b #$03
	TSB.w !s_paldirty
	LDA.b #$01                    ; new ranges: rebuild at once
	STA.w !s_pbnow
	PLP
	RTS

; Rebuild s_palout for the ranges whose inputs changed: the white/black
; mix (all ranges), the group-1 extra black (group-1 ranges) or base colours
; (s_paldirty bit 0: group-0 ranges, bit 1: group-1 ranges). The curves are
; rebuilt at once; the colours round-robin over the declared ranges, at
; most !PB_BUDGET per frame while a fade steps a level or two at a time (a
; colour trails its curve by a frame or two), all at once after a jump
; (scene start, cuts).
!l_palm = !s_tmp+8
!PB_BUDGET = 64
palette_build:
	REP #$30
	STZ.w !l_palm
	STZ.w !l_pbjump
	; the curves change with the 33 mix levels, not every step of a fade
	LDA.w !s_fadeb
	JSR fade_level
	CMP.w !s_fadekey
	BNE .tables0
	LDA.w !s_fadew
	JSR fade_level
	CMP.w !l_fadew
	BEQ .no0
.tables0
	LDA.w !s_fadeb
	JSR fade_level
	JSR .jump
	STA.w !s_fadekey
	LDA.w !s_fadew
	JSR fade_level
	PHA
	SEC
	SBC.w !l_fadew
	JSR .jumpBy
	PLA
	STA.w !l_fadew
	LDA.w !s_fadeb
	LDX.w #$0000
	JSR fade_table_set
	JSR fade_tables_1
	LDA.w #$0003
	STA.w !l_palm
	BRA .dirty
.no0
	LDA.w !s_fadeb2
	JSR fade_level
	CMP.w !l_fadeb2
	BNE .tables1
	LDA.w !s_glowr
	CMP.w !l_glowr
	BNE .tables1
	LDA.w !s_glowg
	CMP.w !l_glowg
	BNE .tables1
	LDA.w !s_glowb
	CMP.w !l_glowb
	BEQ .dirty
.tables1
	JSR fade_tables_1
	LDA.w #$0002
	STA.w !l_palm
.dirty
	SEP #$20
	LDA.w !s_paldirty
	AND.b #$03
	TSB.w !l_palm
	STZ.w !s_paldirty
	; a new change restarts the count of a full pass (the cursor goes on)
	LDA.w !l_palm
	BEQ .run
	TSB.w !s_pbmask
	REP #$20
	JSR pal_total
	STA.w !s_pbleft
.run
	REP #$30
	SEP #$20
	LDA.w !s_pbmask
	REP #$20
	BNE .budget
	RTS
.budget
	SEP #$20
	LDA.w !s_pbnow
	STZ.w !s_pbnow
	ORA.w !s_loading
	REP #$20
	AND.w #$00FF
	ORA.w !l_pbjump
	BNE .all
	LDA.w #!PB_BUDGET
	BRA .go
.all
	LDA.w #$0200                  ; a jump, new ranges or loading: all now
.go
	STA.w !l_pbbudget
	JMP pal_walk
; level A16 against s_fadekey: a jump of more than 2 levels -> l_pbjump.
.jump
	PHA
	SEC
	SBC.w !s_fadekey
	JSR .jumpBy
	PLA
	RTS
.jumpBy
	BPL .pos
	EOR.w #$FFFF
	INC
.pos
	CMP.w #3
	BCC .small
	INC.w !l_pbjump
.small
	RTS

; Colours in all declared ranges -> A16.
pal_total:
	LDA.w #$0000
	STA.w !l_m0
	LDX.w #$0000
.range
	CPX.w #$0008
	BCS .done
	TXA
	LSR
	SEP #$20
	CMP.w !s_palcount
	REP #$20
	BCS .done
	LDA.w !s_palrange+1,X
	AND.w #$00FF
	BNE .count
	LDA.w #$0100
.count
	CLC
	ADC.w !l_m0
	STA.w !l_m0
	INX : INX
	BRA .range
.done
	LDA.w !l_m0
	RTS

; Walk the cursor (s_pbrange, s_pbcol) over the ranges for up to
; l_pbbudget colours of the pending groups (s_pbmask) or the pass end.
pal_walk:
	REP #$30
.range
	LDA.w !s_pbleft
	BNE .more
	SEP #$20
	STZ.w !s_pbmask               ; pass complete
	REP #$20
	RTS
.more
	LDA.w !l_pbbudget
	BNE .budgetLeft
	RTS
.budgetLeft
	; cursor range valid? (else wrap to range 0)
	LDA.w !s_pbrange
	CMP.w #$0008
	BCS .wrap
	LSR
	SEP #$20
	CMP.w !s_palcount
	REP #$20
	BCC .inRange
.wrap
	STZ.w !s_pbrange
	LDA.w !s_palrange
	AND.w #$00FF
	ASL
	STA.w !s_pbcol
	LDA.w !s_palcount
	AND.w #$00FF
	BNE .range
	STZ.w !s_pbleft
	BRA .range
.inRange
	; end of this range (colour * 2)
	LDY.w !s_pbrange
	LDA.w !s_palrange,Y
	AND.w #$00FF
	ASL
	STA.w !l_pbfirst
	LDA.w !s_palrange+1,Y
	AND.w #$00FF
	BNE .count
	LDA.w #$0100
.count
	ASL
	CLC
	ADC.w !l_pbfirst
	STA.w !l_pbend
	; cursor outside this range (ranges changed): restart it
	LDA.w !s_pbcol
	CMP.w !l_pbfirst
	BCC .reset
	CMP.w !l_pbend
	BCC .group
.reset
	LDA.w !l_pbfirst
	STA.w !s_pbcol
.group
	; colours left in this range
	LDA.w !l_pbend
	SEC
	SBC.w !s_pbcol
	LSR
	STA.w !l_pbn
	TYA
	LSR
	TAY
	LDA.w !s_palgrp,Y
	AND.w #$00FF
	STA.w !l_pbgrp
	TAX
	SEP #$20
	LDA.l .groupBit,X
	AND.w !s_pbmask
	REP #$20
	BNE .build
	; not pending: skip the rest of the range
	LDA.w !s_pbleft
	SEC
	SBC.w !l_pbn
	BCS .skipLeft
	LDA.w #$0000
.skipLeft
	STA.w !s_pbleft
	JMP .nextRange
.build
	; n = min(left in range, budget, left in pass)
	LDA.w !l_pbn
	CMP.w !l_pbbudget
	BCC .n1
	LDA.w !l_pbbudget
.n1
	CMP.w !s_pbleft
	BCC .n2
	LDA.w !s_pbleft
.n2
	STA.w !l_pbn
	ASL
	CLC
	ADC.w !s_pbcol
	STA.w !l_pbstop
	LDA.w !l_pbbudget
	SEC
	SBC.w !l_pbn
	STA.w !l_pbbudget
	LDA.w !s_pbleft
	SEC
	SBC.w !l_pbn
	STA.w !s_pbleft
	LDX.w !s_pbcol
	LDA.w !l_pbgrp
	BNE .group1
.colour
	LDY.w !s_compr,X
	LDA.w !s_fader,Y
	LDY.w !s_compg,X
	ORA.w !s_fadeg,Y
	LDY.w !s_compb,X
	ORA.w !s_fadebt,Y
	STA.w !s_palout,X
	INX : INX
	CPX.w !l_pbstop
	BCC .colour
	BRA .built
.group1
	LDY.w !s_compr,X
	LDA.w !s_fader2,Y
	LDY.w !s_compg,X
	ORA.w !s_fadeg2,Y
	LDY.w !s_compb,X
	ORA.w !s_fadebt2,Y
	STA.w !s_palout,X
	INX : INX
	CPX.w !l_pbstop
	BCC .group1
.built
	STX.w !s_pbcol
	CPX.w !l_pbend
	BCS .nextRange
	JMP .range
.nextRange
	LDA.w !s_pbrange
	CLC
	ADC.w #$0002
	STA.w !s_pbrange
	CMP.w #$0008
	BCS .toFirst
	LSR
	SEP #$20
	CMP.w !s_palcount
	REP #$20
	BCS .toFirst
	LDY.w !s_pbrange
	LDA.w !s_palrange,Y
	AND.w #$00FF
	ASL
	STA.w !s_pbcol
	JMP .range
.toFirst
	STZ.w !s_pbrange
	LDA.w !s_palrange
	AND.w #$00FF
	ASL
	STA.w !s_pbcol
	JMP .range
.groupBit
	db $01,$02,$00,$00

; Group-1 curves: black = 1 - (1-b)(1-b2) with the current white, from the
; 33-level ROM tables (levels of 8/256).
fade_tables_1:
	REP #$30
	LDA.w !s_fadeb2
	JSR fade_level
	STA.w !l_fadeb2
	LDA.w !s_glowr
	STA.w !l_glowr
	LDA.w !s_glowg
	STA.w !l_glowg
	LDA.w !s_glowb
	STA.w !l_glowb
	LDA.w #$0100
	SEC
	SBC.w !s_fadeb
	TAY
	LDA.w #$0100
	SEC
	SBC.w !s_fadeb2
	CPY.w #$0100
	BCC .mul
	BRA .have                     ; b = 0: just b2
.mul
	JSR mul_a_y                   ; (256-b2) * (256-b), Y < 256
	XBA
	AND.w #$00FF
.have
	EOR.w #$FFFF
	SEC
	ADC.w #$0100                  ; 256 - product/256
	LDX.w #(!s_fader2)-(!s_fader)
	JMP fade_table_set

; Mix A (0..256) -> its curve level 0..32 (levels of 8/256).
fade_level:
	CLC
	ADC.w #$0004
	LSR : LSR : LSR
	CMP.w #33
	BCC .in
	LDA.w #32
.in
	RTS

; Group-1 output colour at byte offset X from its components (the current
; group-1 curves): for colours changed between full rebuilds.
pal_out1:
	LDY.w !s_compr,X
	LDA.w !s_fader2,Y
	LDY.w !s_compg,X
	ORA.w !s_fadeg2,Y
	LDY.w !s_compb,X
	ORA.w !s_fadebt2,Y
	STA.w !s_palout,X
	RTS

; Curves for black A (0..256) and the current white into the table set at
; offset X from s_fader: t[c] = dark_b(white_w(c)), 33-level ROM tables.
; Group 1 (X != 0) adds the heat glow per channel before the curve:
; red t[min(31, c + s_glowr)], green and blue likewise.
fade_table_set:
	STX.w !s_tmp+8
	CLC
	ADC.w #$0004
	LSR : LSR : LSR
	CMP.w #33
	BCC .b
	LDA.w #32
.b
	XBA
	LSR : LSR : LSR
	STA.w !s_tmp+14
	LDA.w !s_fadew
	CLC
	ADC.w #$0004
	LSR : LSR : LSR
	CMP.w #33
	BCC .w
	LDA.w #32
.w
	XBA
	LSR : LSR : LSR               ; level * 32
	STA.w !s_tmp+12
	; the curve, 32 words at l_curve
	LDY.w #$0000                  ; c * 2
	LDA.w !s_tmp+12
	BNE .curve
	LDX.w !s_tmp+14               ; no white: the dark row as it is
.dark
	LDA.l ending_fade_dark,X
	AND.w #$00FF
	STA.w !l_curve,Y
	INX
	INY : INY
	CPY.w #$0040
	BCC .dark
	BRA .tables
.curve
	TYA
	LSR
	CLC
	ADC.w !s_tmp+12
	TAX
	LDA.l ending_fade_white,X
	AND.w #$00FF
	CLC
	ADC.w !s_tmp+14
	TAX
	LDA.l ending_fade_dark,X
	AND.w #$00FF
	STA.w !l_curve,Y
	INY : INY
	CPY.w #$0040
	BCC .curve
.tables
	; channel tables
	LDA.w !s_tmp+8
	BEQ .plain
	LDA.w !s_glowr
	ORA.w !s_glowg
	ORA.w !s_glowb
	BNE .glow
.plain
	LDX.w !s_tmp+8
	LDY.w #$0000
.plainLoop
	LDA.w !l_curve,Y
	STA.w !s_fader,X
	ASL : ASL : ASL : ASL : ASL
	STA.w !s_fadeg,X
	ASL : ASL : ASL : ASL : ASL
	STA.w !s_fadebt,X
	INX : INX
	INY : INY
	CPY.w #$0040
	BCC .plainLoop
	RTS
.glow
	LDX.w !s_tmp+8
	LDY.w #$0000
.glowLoop
	STY.w !l_cy
	TYA
	CLC
	ADC.w !s_glowr
	CMP.w #$0040
	BCC +
	LDA.w #$003E
+	TAY
	LDA.w !l_curve,Y
	STA.w !s_fader,X
	LDA.w !l_cy
	CLC
	ADC.w !s_glowg
	CMP.w #$0040
	BCC +
	LDA.w #$003E
+	TAY
	LDA.w !l_curve,Y
	ASL : ASL : ASL : ASL : ASL
	STA.w !s_fadeg,X
	LDA.w !l_cy
	CLC
	ADC.w !s_glowb
	CMP.w #$0040
	BCC +
	LDA.w #$003E
+	TAY
	LDA.w !l_curve,Y
	XBA
	ASL : ASL
	STA.w !s_fadebt,X
	LDY.w !l_cy
	INX : INX
	INY : INY
	CPY.w #$0040
	BCC .glowLoop
	RTS

; ---------------------------------------------------------------------------
; Math. CPU multiplier/divider through bank $32's I/O mirror.

; A16 (0..$1FF) * Y (0..255) -> A16.
mul_a_y:
	PHP
	REP #$30
	STA.w !l_m0
	SEP #$20
	TYA
	STA.w $4202
	LDA.w !l_m0
	STA.w $4203
	NOP : NOP : NOP : NOP
	REP #$20
	LDA.w $4216
	STA.w !l_m1
	SEP #$20
	LDA.w !l_m0+1
	STA.w $4203
	NOP : NOP : NOP : NOP
	REP #$20
	LDA.w $4216
	XBA
	AND.w #$FF00
	CLC
	ADC.w !l_m1
	PLP
	RTS

; Signed A16 * unsigned Y (0..255) >> 8 -> A16 (signed, floor of |x|).
muls_a_y_shr8:
	PHP
	REP #$30
	CMP.w #$8000
	BCC .pos
	EOR.w #$FFFF
	INC
	JSR mulu16_8_shr8
	EOR.w #$FFFF
	INC
	PLP
	RTS
.pos
	JSR mulu16_8_shr8
	PLP
	RTS
; Unsigned A16 * Y8 >> 8 -> A16.
mulu16_8_shr8:
	STA.w !l_m0
	SEP #$20
	TYA
	STA.w $4202
	LDA.w !l_m0
	STA.w $4203
	NOP : NOP : NOP : NOP
	LDA.w $4217                    ; (lo*y) >> 8
	STA.w !l_m2
	LDA.w !l_m0+1
	STA.w $4203
	NOP : NOP : NOP : NOP
	REP #$20
	LDA.w !l_m2
	AND.w #$00FF
	CLC
	ADC.w $4216                    ; hi*y + (lo*y >> 8)
	RTS

; Unsigned A16 / Y8 -> A16 quotient, X16 remainder.
div_a_y:
	PHP
	REP #$30
	STA.w $4204
	SEP #$20
	TYA
	STA.w $4206
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	REP #$20
	LDX.w $4216
	LDA.w $4214
	PLP
	RTS

; A16 = |A16|^2 for |A| <= 255 (clamped).
square:
	PHP
	REP #$30
	CMP.w #$8000
	BCC .pos
	EOR.w #$FFFF
	INC
.pos
	CMP.w #$0100
	BCC .ok
	LDA.w #$00FF
.ok
	SEP #$20
	STA.w $4202
	STA.w $4203
	NOP : NOP : NOP : NOP
	REP #$20
	LDA.w $4216
	PLP
	RTS

; Integer square root of A16 -> A16 (0..255).
isqrt:
	PHP
	REP #$30
	STA.w !l_sqn
	LDA.w #$0000
	STA.w !l_sqr
	LDX.w #$0080
.bit
	TXA
	ORA.w !l_sqr
	PHA
	JSR square
	CMP.w !l_sqn
	BEQ .take
	BCS .skip
.take
	PLA
	STA.w !l_sqr
	BRA .next
.skip
	PLA
.next
	TXA
	LSR
	TAX
	BNE .bit
	LDA.w !l_sqr
	PLP
	RTS

; ---------------------------------------------------------------------------
; Drop the native BG streaming and tile-animation requests while a
; full-screen scene owns VRAM $0000-$3FFF and $5000-$57FF (C0:C692 rows and
; columns, C0:C306/C339 animated tiles). The game's own clocks keep running.
suppress_native:
	SEP #$20
	LDA.w !s_fullscreen
	BEQ .done
	STZ.w !N_ROWREQ
	STZ.w !N_COLREQ
	LDA.w !N_ANIM1
	AND.b #$7F
	STA.w !N_ANIM1
	LDA.w !N_ANIM2
	AND.b #$7F
	STA.w !N_ANIM2
.done
	REP #$30
	RTS

; Whole-screen ceiling on the native brightness (transition, death fade).
; s_ebright = $FF: no ceiling. 0 writes brightness 0 with the display on.
brightness_apply:
	REP #$30
	LDA.w !s_ebright
	CMP.w #$00FF
	BEQ .done
	SEP #$20
	LDA.w !N_BRIGHT
	BMI .done                      ; native forced blank
	CMP.w !s_ebright
	BCC .done
	LDA.w !s_ebright
	STA.w !N_BRIGHT
.done
	REP #$30
	RTS

; ---------------------------------------------------------------------------
; OAM for full-screen families: all 128 slots of the native buffer are ours
; (native sprites hidden). Slots are filled from 0; oam_finish hides the
; rest and tells core the module area is full.
oam_begin:
	REP #$30
	LDA.w #$0000
	STA.w !s_oamslot
	LDX.w #$001E
.hi
	STA.w !N_OAMHI,X
	DEX : DEX
	BPL .hi
	LDX.w #$000E
.copy
	LDA.l hi_bits_table,X
	STA.w hi_bits_ram,X
	DEX : DEX
	BPL .copy
	RTS

; oam_put: o_x/o_y (signed), A16 = tile/attributes, o_size (0 small, 2
; large). Sprites entirely off screen are skipped. M16 X16; clobbers X, Y.
oam_put:
	LDX.w !s_oamslot
	CPX.w #$0200
	BCS .skip
	STA.w !N_OAM+2,X
	LDA.w !o_y
	CLC
	ADC.w #$0020
	CMP.w #$0100                   ; y in [-32, 224)
	BCS .skip
	LDA.w !o_x
	CLC
	ADC.w #$0020
	CMP.w #$0120                   ; x in [-32, 256)
	BCS .skip
	SEP #$20
	LDA.w !o_x
	STA.w !N_OAM,X
	LDA.w !o_y
	STA.w !N_OAM+1,X
	; High table: (xhi | size) << ((slot & 3) * 2) into byte slot / 4;
	; nothing to do for small sprites at x 0-255 (oam_begin cleared it).
	REP #$20
	LDA.w !o_x
	AND.w #$FF00
	ORA.w !o_size
	BEQ .next
	LDA.w !o_x
	XBA
	AND.w #$0001
	ORA.w !o_size
	STA.w !l_bits
	TXA
	AND.w #$000C
	ORA.w !l_bits
	TAY
	TXA
	LSR : LSR : LSR : LSR
	TAX
	SEP #$20
	LDA.w hi_bits_ram,Y
	ORA.w !N_OAMHI,X
	STA.w !N_OAMHI,X
	REP #$20
.next
	LDA.w !s_oamslot
	CLC
	ADC.w #$0004
	STA.w !s_oamslot
.skip
	RTS

; The high-table bit patterns, copied into the work area by oam_begin so
; the hot path reads them with DB = $32.
hi_bits_table:
	db $00,$01,$02,$03, $00,$04,$08,$0C, $00,$10,$20,$30, $00,$40,$80,$C0

; Hide the game's own sprites the scene did not overwrite and keep the
; game's next clear short: it hides from its new end up to $0120.
oam_finish:
	REP #$30
	SEP #$20
	LDA.w !s_fullscreen
	REP #$20
	BEQ .done
	LDA.l !core_oam_native         ; slots the game used this frame
	ASL : ASL
	STA.w !l_bits
	LDX.w !s_oamslot
	LDA.w #$E0FF
.hide
	CPX.w !l_bits
	BCS .closed
	STA.w !N_OAM,X
	INX : INX : INX : INX
	BRA .hide
.closed
	; Module area end = max(ours, the game's): core writes it to $0120.
	LDA.w !s_oamslot
	CMP.w !l_bits
	BCS .ours
	LDA.w !l_bits
.ours
	STA.l !core_oam_cursor
	LDA.w #$0000
	STA.l !core_oam_front_n
.done
	REP #$30
	RTS

; Draw a 32x32 actor made of four 16x16 cells c..c+3 (c a multiple of 4,
; so their tiles are t, t+2, t+4, t+6): s_tmp+0/2 = the cell's bottom
; centre; A16 = first cell; !q_attr = attributes (bit 14 = h-flip).
draw_quad:
	JSR cell_tile
	ORA.w !q_attr
	STA.w !l_quadc
	STZ.w !o_size
	LDA.w !o_y
	SEC
	SBC.w #$0020
	STA.w !o_y
	LDA.w !o_x
	SEC
	SBC.w #$0010
	STA.w !o_x
	STA.w !l_quadx
	BIT.w !q_attr
	BVS .flip
	LDA.w !l_quadc : JSR oam_put             ; TL
	JSR .right
	LDA.w !l_quadc : CLC : ADC.w #$0002 : JSR oam_put
	JSR .down
	LDA.w !l_quadc : CLC : ADC.w #$0006 : JSR oam_put
	JSR .left
	LDA.w !l_quadc : CLC : ADC.w #$0004 : JMP oam_put
.flip
	LDA.w !l_quadc : CLC : ADC.w #$0002 : JSR oam_put
	JSR .right
	LDA.w !l_quadc : JSR oam_put
	JSR .down
	LDA.w !l_quadc : CLC : ADC.w #$0004 : JSR oam_put
	JSR .left
	LDA.w !l_quadc : CLC : ADC.w #$0006 : JMP oam_put
.right
	LDA.w !l_quadx
	CLC
	ADC.w #$0010
	STA.w !o_x
	RTS
.left
	LDA.w !l_quadx
	STA.w !o_x
	RTS
.down
	LDA.w !o_y
	CLC
	ADC.w #$0010
	STA.w !o_y
	RTS

; 16-bit LCG x = x*25173 + 13849; returns the new high byte in A16.
random8:
	PHP
	REP #$30
	; x * $6255 mod 65536 = lo*$55 + ((lo*$62 + hi*$55) << 8)
	SEP #$20
	LDA.w !s_rng
	STA.w $4202
	LDA.b #$55
	STA.w $4203
	NOP : NOP : NOP : NOP
	REP #$20
	LDA.w $4216
	STA.w !l_m0
	SEP #$20
	LDA.b #$62
	STA.w $4203
	NOP : NOP : NOP : NOP
	LDA.w $4216
	STA.w !l_m1
	LDA.w !s_rng+1
	STA.w $4202
	LDA.b #$55
	STA.w $4203
	NOP : NOP : NOP : NOP
	LDA.w $4216
	CLC
	ADC.w !l_m1
	CLC
	ADC.w !l_m0+1
	STA.w !l_m0+1
	REP #$20
	LDA.w !l_m0
	CLC
	ADC.w #13849
	STA.w !s_rng
	XBA
	AND.w #$00FF
	PLP
	RTS
