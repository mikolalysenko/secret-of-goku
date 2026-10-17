; Ending module services: vblank hook, transfer engine, palettes and fades,
; OAM, math, native-request suppression. Included by module.asm (code bank).

!CODE_BANK #= !CODE_ENDING>>16
!CB #= !CODE_ENDING&$FF0000      ; code bank base for long,X table reads

; Library scratch (s_lib, SW+$E0..$FF); scenes own s_var (SW+$80..$DF).
!l_cell     = !SW+$E0
!l_qcell    = !SW+$E2
!l_quadc    = !SW+$E4
!l_quadx    = !SW+$E6
!l_quady    = !SW+$E8
!l_quadi    = !SW+$EA
!l_bits     = !SW+$EC
!l_sqn      = !SW+$EE
!l_m0       = !SW+$F0
!l_m1       = !SW+$F2
!l_m2       = !SW+$F4
!l_sqr      = !SW+$F6
!l_palc     = !SW+$F8
!l_fadew    = !SW+$DE           ; word  white mix of the current tables (s_fadekey holds black)
!s_rng      = !SW+$FA           ; word  LCG state
!s_cellvram = !SW+$FC           ; word  VRAM word address of 16x16 cell 0
!s_celltile = !SW+$FE           ; word  OAM tile number of cell 0
hi_bits_ram = !SW+$DE0             ; 16 bytes (oam_put's high-table patterns)

; Parameter blocks in s_tmp (frame side).
!o_x    = !s_tmp+0              ; oam_put / draw_quad: x (signed)
!o_y    = !s_tmp+2              ; y (signed)
!o_size = !s_tmp+4              ; 0 small, 2 large
!q_attr = !s_tmp+6              ; draw_quad attributes
!q_src  = !s_tmp+8              ; queue_add: source (long)
!q_mode = !s_tmp+11
!q_dest = !s_tmp+12
!q_size = !s_tmp+14

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
	JSR nmi_palette
	SEP #$20
	LDA.w !s_regson
	BEQ .noRegs
	JSR nmi_regs
.noRegs
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

; Our CGRAM ranges from s_palout.
nmi_palette:
	REP #$10
	SEP #$20
	LDX.w #$0000
.loop
	CPX.w #$0008
	BCS .done
	TXA
	LSR
	CMP.w !s_palcount
	BCS .done
	LDA.w !s_palrange,X
	STA.w $2121
	REP #$20
	AND.w #$00FF
	ASL
	CLC
	ADC.w #!s_palout
	STA.w $4372
	LDA.w !s_palrange+1,X
	AND.w #$00FF
	BNE .count
	LDA.w #$0100
.count
	ASL
	STA.w $4375
	LDA.w #$2200              ; one register ($2122), A -> B
	STA.w $4370
	SEP #$20
	LDA.b #$32
	STA.w $4374
	LDA.b #$80
	STA.w $420B
	INX : INX
	BRA .loop
.done
	REP #$30
	RTS

; The scene's PPU registers. BG3 registers are never written.
nmi_regs:
	SEP #$20
	LDA.w !s_bgmode  : STA.w $2105
	STZ.w $2106
	LDA.w !s_bg1sc   : STA.w $2107
	LDA.w !s_bg2sc   : STA.w $2108
	LDA.w !s_bg12nba : STA.w $210B
	LDA.w !s_objsel  : STA.w $2101
	LDA.w !s_tm      : STA.w $212C
	LDA.w !s_ts      : STA.w $212D
	LDA.w !s_cgwsel  : STA.w $2130
	LDA.w !s_cgadsub : STA.w $2131
	LDA.w !s_coldr   : STA.w $2132
	LDA.w !s_coldg   : STA.w $2132
	LDA.w !s_coldb   : STA.w $2132
	LDA.w !s_w12sel  : STA.w $2123
	LDA.w !s_wobjsel : STA.w $2125
	LDA.w !s_tmw     : STA.w $212E
	LDA.w !s_tsw     : STA.w $212F
	LDA.w !s_wbglog  : STA.w $212A
	LDA.w !s_wobjlog : STA.w $212B
	LDA.w !s_wh0     : STA.w $2126
	LDA.w !s_wh1     : STA.w $2127
	LDA.w !s_wh2     : STA.w $2128
	LDA.w !s_wh3     : STA.w $2129
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
; (planet-view/shenron-ending): HDMA channel 5 rewrites TM at line 170.
!HDMA_CUT = $20
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
	RTS
.on
	; Table: 127 lines TM, 43 lines TM, then the cut value from line 170.
	LDA.b #127 : STA.w !s_hdmabuf+0
	LDA.w !s_tm : STA.w !s_hdmabuf+1
	LDA.b #43  : STA.w !s_hdmabuf+2
	LDA.w !s_tm : STA.w !s_hdmabuf+3
	LDA.b #$01 : STA.w !s_hdmabuf+4
	LDA.w !s_tmcut : STA.w !s_hdmabuf+5
	LDA.b #$00 : STA.w !s_hdmabuf+6
	REP #$20
	LDA.w #$2C00              ; mode 0 (one register), B-bus $212C
	STA.w $4350
	LDA.w #!s_hdmabuf
	STA.w $4352
	SEP #$20
	LDA.b #$32
	STA.w $4354
	LDA.w !s_hdma
	ORA.b #!HDMA_CUT
	STA.w !s_hdma
	RTS

; ---------------------------------------------------------------------------
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
	BCC .loop
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
	LDA.w !s_budget
	SEC
	SBC.w !s_nmitmp+4
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

; A Goku cell from the goku module's tile pool (banks $F8-$FA): src.w = cell
; id, dest.w = first of four scene 16x16 cells (TL, TR, BL, BR). Sixteen
; 32-byte tile DMAs from goku_cell_tiles' 4x4 grid; needs 512 bytes of budget.
xfer_goku:
	LDA.w #$0200
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
	LDA.w #$0020
	STA.w !s_nmitmp+10            ; tile size
	LDA.w !s_cur                  ; cell id -> grid offset (32 bytes per cell)
	ASL : ASL : ASL : ASL : ASL
	STA.w !s_nmitmp+12
	LDY.w #$0000                  ; 0..15: quadrant*4 + half*2 + t
.tile
	; grid position: row = (q>>1)*2 + half, col = (q&1)*2 + t
	TYA
	AND.w #$0001                  ; t
	STA.w !s_nmitmp+4
	TYA
	AND.w #$0004                  ; q & 1 -> col + 2
	LSR
	ORA.w !s_nmitmp+4
	STA.w !s_nmitmp+4             ; col
	TYA
	AND.w #$0002                  ; half
	LSR
	STA.w !s_nmitmp+6
	TYA
	AND.w #$0008                  ; q >> 1 -> row + 2
	LSR : LSR
	ORA.w !s_nmitmp+6             ; row
	ASL : ASL
	ORA.w !s_nmitmp+4             ; row*4 + col
	ASL
	CLC
	ADC.w !s_nmitmp+12
	TAX
	LDA.l goku_cell_tiles,X       ; global tile index
	PHA
	ASL : ASL : ASL : ASL : ASL
	STA.w $4372
	PLA
	XBA
	AND.w #$00FF
	LSR : LSR : LSR
	CLC
	ADC.w #$00F8
	SEP #$20
	STA.w $4374
	REP #$20
	LDA.w !s_nmitmp+10
	STA.w $4375
	; VRAM: cell (dest + q) + half*$100 + t*$10
	TYA
	LSR : LSR
	CLC
	ADC.w !s_cur+4
	JSR cell_vram
	STA.w !s_nmitmp+8
	TYA
	AND.w #$0002
	BEQ .top
	LDA.w #$0100
.top
	CLC
	ADC.w !s_nmitmp+8
	STA.w !s_nmitmp+8
	TYA
	AND.w #$0001
	BEQ .left
	LDA.w #$0010
.left
	CLC
	ADC.w !s_nmitmp+8
	STA.w $2116
	SEP #$20
	LDA.b #$80
	STA.w $420B
	REP #$20
	INY
	CPY.w #$0010
	BCS .all
	JMP .tile
.all
	LDA.w !s_cur+6
	STA.w !s_curoff
	LDA.w !s_budget
	SEC
	SBC.w #$0200
	STA.w !s_budget
	CLC
	RTS

; Queue a Goku pose (goku module sheet A = 0 base / 1 Super Saiyan, column X,
; row Y) into scene cells starting at s_tmp+6 and copy its palette to OBJ
; colour s_tmp+4 (a multiple of 16). Clobbers the q_* block.
queue_goku:
	PHP
	REP #$30
	JSL goku_api_cell
	REP #$30
	CMP.w #$FFFF
	BEQ .none
	STA.w !q_src
	PHA
	LDA.w !s_tmp+6
	STA.w !q_dest
	SEP #$20
	LDA.b #$00
	STA.w !q_src+2
	LDA.b #!LD_GOKU
	STA.w !q_mode
	REP #$20
	LDA.w #$0200
	STA.w !q_size
	JSR queue_add
	PLX
	; palette: goku_palettes[goku_cell_pal[cell]]
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
	LDA.b #$01
	STA.w !s_paldirty
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

; Copy A colours from the code-bank table at X into s_palbase at colour Y,
; and split them into the component arrays used by palette_build.
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
	LDA.b #$01
	STA.w !s_paldirty
	PLP
	RTS

; Store colour A at byte offset X of the base palette and its components.
pal_store:
	STA.w !s_palbase,X
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
	ASL
	TAY
	PLA
	STA.w !s_palrange,Y
	TXA
	STA.w !s_palrange+1,Y
	INC.w !s_palcount
	LDA.b #$01
	STA.w !s_paldirty
	PLP
	RTS

palette_build:
	REP #$30
	LDA.w !s_fadeb
	CMP.w !s_fadekey
	BNE .rebuild
	LDA.w !s_fadew
	CMP.w !l_fadew
	BNE .rebuild
	SEP #$20
	LDA.w !s_paldirty
	REP #$20
	BNE .apply
	RTS
.rebuild
	LDA.w !s_fadeb
	STA.w !s_fadekey
	LDA.w !s_fadew
	STA.w !l_fadew
	JSR fade_tables
.apply
	SEP #$20
	LDA.b #$00
	STA.w !s_paldirty
	REP #$30
	LDA.w #$0000
	STA.w !s_tmp+12               ; range offset
.range
	LDA.w !s_tmp+12
	CMP.w #$0008
	BCS .done
	LSR
	SEP #$20
	CMP.w !s_palcount
	REP #$20
	BCS .done
	LDY.w !s_tmp+12
	LDA.w !s_palrange,Y
	AND.w #$00FF
	ASL
	TAX                           ; first colour * 2
	LDA.w !s_palrange+1,Y
	AND.w #$00FF
	BNE .count
	LDA.w #$0100
.count
	ASL
	STA.w !s_tmp+10
	TXA
	CLC
	ADC.w !s_tmp+10
	STA.w !s_tmp+10               ; end * 2
.colour
	LDY.w !s_compr,X
	LDA.w !s_fader,Y
	LDY.w !s_compg,X
	ORA.w !s_fadeg,Y
	LDY.w !s_compb,X
	ORA.w !s_fadebt,Y
	STA.w !s_palout,X
	INX : INX
	CPX.w !s_tmp+10
	BCC .colour
	INC.w !s_tmp+12
	INC.w !s_tmp+12
	BRA .range
.done
	RTS

; Channel curves for the current white (w) and black (b) mix:
; t[c] = dark_b(white_w(c)), from 33-level ROM tables (levels of 8/256).
fade_tables:
	REP #$30
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
	LDA.w !s_fadeb
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
	LDY.w #$0000                  ; c * 2
.loop
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
	STA.w !s_fader,Y
	ASL : ASL : ASL : ASL : ASL
	STA.w !s_fadeg,Y
	ASL : ASL : ASL : ASL : ASL
	STA.w !s_fadebt,Y
	INY : INY
	CPY.w #$0040
	BCC .loop
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
