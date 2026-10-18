; Goku's STATUS page (engine/native-status.js). Included in the UI bank.
;
; The browser replaces the page's text and window layer (Mode 5 BG2) with a
; raster of its own: name, level, HP, form, a big power level, the weights
; state, mana and money, and ten stat rows with bounded two-tone meters
; (the game's own meters wrap past the window with Goku's stats). The
; cartridge replays the same drawing operations (snes/gen/ui-status.mjs,
; checked against statusPixels() at build time) into BG2 cells: 16x8
; hi-res pixels, 2bpp, one palette each.
;
; The browser paints that raster from scanline 1 (native-status.js
; getColor(sub, x, line)), so screen row s shows its row s + 1; the
; cartridge's BG rows hold page rows + 1 likewise.
;
; Menu frames (C0:1E08, in vblank after the menu's uploads): when the page
; is Goku's (statusPixels' isGokuStatus test) BG2 becomes the windows alone:
; a few static window cells and a tilemap, generated from statusPixels'
; windows and sent from extended data (the native window tiles differ at
; the bottoms, and the native meters leave fragments in the borders). Then, band by band (16x8 cell rows), every cell an operation
; touches is composed: a 16-pixel mask per colour and row, the window
; pixels first, then the band's operations in drawing order. The colours present choose the palette (BG2 palette 0 is the
; game's window palette; palettes 4-7, CGRAM 16-31, are written by this
; module and unused by the page's BG1 forest); the cell becomes two 2bpp
; tiles that the next vblank uploads with its tilemap word. No cell starts
; after line !UI_ST_STOP so the menu keeps its frame rate. Leaving the page
; puts CGRAM 16-31 back.

incsrc "ui-status/defines.asm"

!ui_st      = !RAM_UI+$B0     ; word: 0 idle, 1 take the page over, 2 building, 3 shown
!ui_st_cell = !RAM_UI+$B2     ; word: next cell (cy * 32 + cx); phase 1: tilemap rows sent
!ui_st_n    = !RAM_UI+$B4     ; word: composed cells in the upload buffer
!ui_st_tile = !RAM_UI+$B6     ; word: BG2 tile pair of the next composed cell

!UI_ST_MAP   = $5800          ; BG2 tilemap (32 x 28 used)
!UI_ST_CHR   = $6000          ; BG2 tiles (2bpp: 8 words each)
!UI_ST_BATCH = 8              ; upload buffer (cells)
!UI_ST_STOP  = 160            ; no cell starts from this line to the vblank
!UI_ST_MAPROWS = 4            ; tilemap rows per DMA while taking the page over

; SRAM staging while the page is built (the radio's map, text and build
; state, the radar's caches and the placement tables: none is used in
; menus, and the radio and radar rebuild theirs: !ui_s_bmode and
; !ui_s_trig are cleared)
!ui_s_ststr   = !SRAM_WORK_UI+$000 ; 176 bytes: dynamic strings (codes, 0-terminated)
!ui_s_stoff   = !SRAM_WORK_UI+$0B0 ; 19 words: string offsets (+38: lengths)
!ui_s_stmeter = !SRAM_WORK_UI+$0FC ; 10 words: meter fills (0-96)
!ui_s_stcg    = !SRAM_WORK_UI+$110 ; 32 bytes: the game's CGRAM 16-31
!ui_s_stband  = !SRAM_WORK_UI+$130 ; word: band whose operations are set up, + 1
!ui_s_stcan   = !SRAM_WORK_UI+$132 ; 2 words: first uploaded cell (map address, word), 0 none
!ui_s_strec   = !SRAM_WORK_UI+$136 ; 16 x 8 bytes: the band's operations (below)
!ui_s_stmark  = !SRAM_WORK_UI+$1B6 ; 32 words: per cell of the band, a bit per operation on it
!ui_s_stcol   = !SRAM_WORK_UI+$1F6 ; 8 rows x 8 words: the cell's mask per colour (0: drawn; 7: none)
!ui_s_stbuf   = !SRAM_WORK_UI+$276 ; !UI_ST_BATCH x 32 bytes: composed tiles
!ui_s_stcell  = !SRAM_WORK_UI+$376 ; !UI_ST_BATCH x 2 words: tilemap word, map address
assert !ui_s_stcell+(!UI_ST_BATCH*4) <= !SRAM_WORK_UI+$400, "status: staging overflow"
assert !UI_ST_DYNS*2 <= 38, "status: string table overflow"
; band record: +0 operation offset, +2 x0 (text left edge; meters: end of
; the fill), +4 string (address in this bank / offset in !ui_s_ststr),
; +6 length (byte), +7 bank (byte: 0 this bank, 1 SRAM)

; Scratch (WRAM: the world-flight bearing and radio text scratch, unused in
; menus)
!st_ops   = !ui_tmp0          ; band operations left for the cell (bits); band setup: list
!st_rec   = !ui_tmp1          ; band record offset (operation index * 8)
!st_op    = !ui_tmp2          ; operation offset in ui_st_ops
!st_cx    = !ui_tmp3          ; cell x, y (pixels; y: page row of its first line)
!st_cy    = !ui_tmp4
!st_r16   = !ui_tmp5          ; cell row * 16 (colour masks)
!st_act   = !ui_k0            ; colours used in the cell (bit c)
!st_m     = !ui_k1            ; paint mask
!st_u     = !ui_k2            ; scratch (paint, double, span, emit)
!st_u2    = !ui_k3            ; scratch (byte reversal, emit)
!st_t     = !ui_k4            ; text: glyph row; window: tilemap word; emit: colour set
!st_t2    = !ui_k5            ; window: ROM tile * 16; emit: colour -> index map
!st_dbank = !ui_k6            ; DMA source bank
!st_w     = !ui_front_n+1     ; 4 bytes: a glyph row over x - 8 .. x + 23 (byte k: x - 8 + 8k)
!st_fp0   = !ui_m0            ; font pointers of those bytes (4 consecutive words)
!st_o2    = !ui_msign         ; outline from the row above; emit: buffer slot
!st_gm    = !ui_rdx           ; glyph mask; meter mask; band setup: x from
!st_om    = !ui_rdy           ; outline mask; filled mask; band setup: x to
!st_col   = !ui_ptr           ; text colour * 2; emit: colour of index 1
!st_scale = !ui_ptr+2         ; text scale; emit: colour of index 2
!st_n     = !ui_k4            ; (text rows left share !st_t with the glyph row: see ui_st_text)
assert !ui_ptr+4 <= !ui_frame, "status: scratch overlap"

; ---------------------------------------------------------------------------
; Menu frame (in vblank after the menu's own uploads). DB = $7E, M16/X16.
ui_status_frame:
	JSL core_vblank_lines             ; (VRAM reads and writes: a late frame
	CMP.w #1                          ; does nothing)
	BCS .vblank
	RTS
.vblank
	JSR ui_st_detect
	BCS .page
	LDA.w !ui_st&$FFFF
	BEQ .out
	JSR ui_st_restore_cgram           ; left the page
	BCC .out                          ; (no vblank time: next frame)
	STZ.w !ui_st&$FFFF
.out
	RTS
.page
	LDA.w !ui_st&$FFFF
	BNE .on
	JMP ui_st_begin                   ; a new page: values, strings
.on
	JSR ui_st_palettes                ; every frame (the menu may re-upload)
	JSR ui_st_canary                  ; the menu redrew the tilemap: again
	LDA.w !ui_st&$FFFF
	CMP.w #$0001
	BNE .build
	JSR ui_st_takeover                ; the windows-only tilemap
	BCC .wait
	INC.w !ui_st&$FFFF
	STZ.w !ui_st_cell&$FFFF
	STZ.w !ui_st_n&$FFFF
.wait
	RTS
.build
	CMP.w #$0002
	BNE .wait                         ; shown
	JSR ui_st_upload                  ; last frame's cells
	JMP ui_st_build

; Field and ring frames: the menu closed, the page's session with it (the
; game reloads the field's colours).
ui_status_leave:
	STZ.w !ui_st&$FFFF
	RTS

; isGokuStatus (native-status.js): Goku active, config ring item 2 of
; character 0, no menu transition, and the page's window corners in the
; BG2 tilemap (the endings' hide bit keeps it native). Carry set = yes.
; (VRAM reads: called in vblank.)
ui_st_detect:
	LDA.w !ui_block&$FFFF
	AND.w #!UI_HIDE_ENDING
	BNE .no
	JSR ui_goku_active
	BEQ .no
	SEP #$20
	LDA.w $002C
	CMP.b #$03
	BNE .no8
	LDA.w $00EC
	AND.b #$FE
	BNE .no8
	LDA.w $1808
	ORA.w $19FE
	BNE .no8
	LDA.w $1809
	CMP.b #$02
	BNE .no8
	LDA.w $1876
	CMP.b #$02
	BNE .no8
	REP #$20
	LDX.w #$0000
.sig
	LDA.l ui_st_sig,X
	BEQ .yes
	JSR ui_st_vram_word
	CMP.l ui_st_sig+2,X               ; the game's corner
	BEQ .next
	CMP.l ui_st_sig+4,X               ; or this module's window cell
	BNE .no
.next
	TXA
	CLC
	ADC.w #6
	TAX
	BRA .sig
.yes
	SEC
	RTS
.no8
	REP #$20
.no
	CLC
	RTS
ui_st_sig:                    ; tilemap address, native word, taken-over word
	dw !UI_ST_MAP+$020, $2020, !UI_ST_SIG0
	dw !UI_ST_MAP+$030, $2020, !UI_ST_SIG1
	dw !UI_ST_MAP+$1C0, $A020, !UI_ST_SIG2
	dw !UI_ST_MAP+$310, $A020, !UI_ST_SIG3
	dw 0

; A16 = VRAM word address -> A16 = the word (VMAIN increments after the
; high byte; the prefetch is discarded first).
ui_st_vram_word:
	PHP
	SEP #$20
	PHA
	LDA.b #$80
	STA.l $002115
	PLA
	REP #$20
	STA.l $002116
	LDA.l $002139                     ; (prefetch latched on the address write)
	PLP
	RTS

; The scanline (A16).
ui_st_vline:
	SEP #$20
	LDA.l $00213F                     ; reset the counter latch flip-flop
	LDA.l $002137                     ; latch H/V
	LDA.l $00213D
	XBA
	LDA.l $00213D
	AND.b #$01
	XBA
	REP #$20
	RTS

; DMA on channel 7 now: A16 = parameters | B-bus register << 8, X = source,
; Y = bytes, !st_dbank = source bank.
ui_st_dma:
	STA.l $004370
	TXA
	STA.l $004372
	TYA
	STA.l $004375
	SEP #$20
	LDA.w !st_dbank&$FFFF
	STA.l $004374
	LDA.b #$80
	STA.l $00420B
	REP #$20
	RTS

; ---------------------------------------------------------------------------
; A new page (in vblank): the game's CGRAM 16-31 saved, the radio and radar
; told to rebuild their staging, the page's values into strings and meter
; fills, then phase 1.
ui_st_begin:
	JSL core_vblank_lines
	CMP.w #2
	BCS .go
	RTS                               ; next frame
.go
	LDA.w #$0000
	STA.l !ui_s_bmode                 ; the radio rebuilds its staged rows
	STA.l !ui_s_bstep
	STA.l !ui_s_trig                  ; the radar its trigonometry
	SEP #$20
	LDA.b #$10
	STA.l $002121
	REP #$20
	LDA.w #!SRAM_WORK_UI>>16
	STA.w !st_dbank&$FFFF
	LDX.w #!ui_s_stcg&$FFFF
	LDY.w #32
	LDA.w #$3B80                      ; CGRAM -> SRAM ($213B, B to A)
	JSR ui_st_dma
	JSR ui_st_strings
; Phase 1 from the start (also when the menu redrew the page).
ui_st_restart:
	LDA.w #$0001
	STA.w !ui_st&$FFFF
	STZ.w !ui_st_cell&$FFFF
	STZ.w !ui_st_n&$FFFF
	LDA.w #!UI_ST_TILE0+!UI_ST_WTILES
	STA.w !ui_st_tile&$FFFF
	LDA.w #$0000
	STA.l !ui_s_stband
	STA.l !ui_s_stcan
	LDY.w #14                         ; colour 7 (none) stays empty
	JMP ui_st_clear

; CGRAM 16-31: the page's palettes 4-7 / the game's colours back (DMA).
; Carry clear when the vblank is too short (nothing written).
ui_st_palettes:
	LDA.w #ui_st_cgram>>16
	STA.w !st_dbank&$FFFF
	LDX.w #ui_st_cgram&$FFFF
	BRA ui_st_cgram_dma
ui_st_restore_cgram:
	LDA.w #!SRAM_WORK_UI>>16
	STA.w !st_dbank&$FFFF
	LDX.w #!ui_s_stcg&$FFFF
ui_st_cgram_dma:
	PHX
	JSL core_vblank_lines
	PLX
	CMP.w #1
	BCC .out
	SEP #$20
	LDA.b #$10
	STA.l $002121
	REP #$20
	LDY.w #32
	LDA.w #$2200                      ; one register, $2122
	JSR ui_st_dma
	SEC
.out
	RTS

; The menu redrew the page's tilemap (the first uploaded cell lost its
; word): take the page over again. (VRAM read: in vblank.)
ui_st_canary:
	LDA.l !ui_s_stcan
	BEQ .ok
	JSR ui_st_vram_word
	CMP.l !ui_s_stcan+2
	BEQ .ok
	JMP ui_st_restart
.ok
	RTS

; Phase 1: the window cells' tiles and the windows-only tilemap (extended
; data). Both in one vblank when it is long enough, so no frame shows half
; of each; after !UI_ST_WAIT short vblanks, in parts (!ui_st_cell: 0 the
; tiles, then tilemap rows + 1, !UI_ST_MAPROWS per DMA; !ui_st_n counts the
; frames waited). Carry set when done.
!UI_ST_WAIT = 8
ui_st_takeover:
	LDA.w !ui_st_cell&$FFFF
	BNE .parts
	JSL core_vblank_lines
	CMP.w #15
	BCS .whole
	INC.w !ui_st_n&$FFFF
	LDA.w !ui_st_n&$FFFF
	CMP.w #!UI_ST_WAIT
	BCS .parts
	CLC
	RTS
.whole
	JSR ui_st_wintiles
	LDA.w #$0000
	LDY.w #28*64
	JSR ui_st_maprows
	SEC
	RTS
.parts
	LDA.w !ui_st_cell&$FFFF
	CMP.w #28+1
	BCC .part
	RTS                               ; (carry set)
.part
	JSL core_vblank_lines
	CMP.w #6
	BCS .send
	CLC                               ; the rest next vblank
	RTS
.send
	LDA.w !ui_st_cell&$FFFF
	BNE .map
	JSR ui_st_wintiles
	INC.w !ui_st_cell&$FFFF
	BRA .parts
.map
	DEC
	LDY.w #!UI_ST_MAPROWS*64
	JSR ui_st_maprows
	LDA.w !ui_st_cell&$FFFF
	CLC
	ADC.w #!UI_ST_MAPROWS
	STA.w !ui_st_cell&$FFFF
	BRA .parts
; The window cells' tiles into VRAM.
ui_st_wintiles:
	SEP #$20
	LDA.b #$80
	STA.l $002115
	REP #$20
	LDA.w #!UI_ST_CHR+(!UI_ST_TILE0*8)
	STA.l $002116
	LDA.w #!XDATA_UI_STATUS_WINTILES>>16
	STA.w !st_dbank&$FFFF
	LDX.w #!XDATA_UI_STATUS_WINTILES&$FFFF
	LDY.w #!XDATA_UI_STATUS_WINTILES_SIZE
	LDA.w #$1801
	JMP ui_st_dma
; Y bytes of the windows-only tilemap from row A on into VRAM.
ui_st_maprows:
	PHA
	SEP #$20
	LDA.b #$80
	STA.l $002115
	REP #$20
	PLA
	ASL : ASL : ASL : ASL : ASL       ; row * 32 words
	PHA
	CLC
	ADC.w #!UI_ST_MAP
	STA.l $002116
	PLA
	ASL
	CLC
	ADC.w #!XDATA_UI_STATUS_MAP&$FFFF
	TAX
	LDA.w #!XDATA_UI_STATUS_MAP>>16
	STA.w !st_dbank&$FFFF
	LDA.w #$1801
	JMP ui_st_dma
assert 28%!UI_ST_MAPROWS == 0, "status: tilemap chunks"
assert !XDATA_UI_STATUS_MAP_SIZE == 32*28*2, "status: tilemap size"
assert !XDATA_UI_STATUS_WINTILES_SIZE == !UI_ST_WTILES*16, "status: window tiles"
assert !XDATA_UI_STATUS_WINTILES_SIZE <= 1024, "status: window tiles over one DMA's time"

; ---------------------------------------------------------------------------
; Strings. Each dynamic string at its offset in !ui_s_ststr (codes, 0 end);
; offsets/lengths in !ui_s_stoff (word each, id * 2; lengths at +38).
!st_put = !ui_tmp0            ; write offset in the string buffer
!st_id  = !ui_tmp1            ; dynamic id being built

; Start dynamic string A.
ui_st_open:
	STA.w !st_id&$FFFF
	ASL
	TAX
	LDA.w !st_put&$FFFF
	STA.l !ui_s_stoff,X
	RTS
; End the open string (terminator, length).
ui_st_close:
	LDA.w #$0000
	LDX.w !st_put&$FFFF
	SEP #$20
	STA.l !ui_s_ststr,X
	REP #$20
	LDA.w !st_id&$FFFF
	ASL
	TAX
	LDA.w !st_put&$FFFF
	SEC
	SBC.l !ui_s_stoff,X
	STA.l !ui_s_stoff+38,X
	INC.w !st_put&$FFFF
	RTS
; Append code A (8-bit value in A16).
ui_st_putc:
	LDX.w !st_put&$FFFF
	SEP #$20
	STA.l !ui_s_ststr,X
	REP #$20
	INC.w !st_put&$FFFF
	RTS
; Append the 0-terminated string at X in this bank.
ui_st_puts:
	LDA.l !UI_BANKBASE,X
	AND.w #$00FF
	BEQ .end
	PHX
	JSR ui_st_putc
	PLX
	INX
	BRA ui_st_puts
.end
	RTS

ui_st_strings:
	STZ.w !st_put&$FFFF
	; name: $CC00, up to 6 codes, 0-terminated
	LDA.w #!UI_ST_DYN_NAME
	JSR ui_st_open
	LDX.w #$0000
.name
	LDA.l $7ECC00,X
	AND.w #$00FF
	BEQ .named
	PHX
	JSR ui_st_putc
	PLX
	INX
	CPX.w #$0006
	BCC .name
.named
	JSR ui_st_close
	; level
	LDA.w #!UI_ST_DYN_LEVEL
	JSR ui_st_open
	LDA.l $7EE181
	AND.w #$00FF
	INC
	LDX.w #$0000
	JSR ui_st_number
	JSR ui_st_close
	; hp / max hp
	LDA.w #!UI_ST_DYN_HP
	JSR ui_st_open
	LDA.l $7EE182
	LDX.w #$0000
	JSR ui_st_number
	LDA.w #$00C1                      ; '/'
	JSR ui_st_putc
	LDA.l $7EE184
	LDX.w #$0000
	JSR ui_st_number
	JSR ui_st_close
	; form
	LDA.w #!UI_ST_DYN_FORM
	JSR ui_st_open
	LDX.w #ui_st_saiyan
	JSR ui_st_ssj
	BEQ .form
	LDX.w #ui_st_super
.form
	JSR ui_st_puts
	JSR ui_st_close
	; power: 90,000 / 150,000,000, x0.9 with the weights (powerLevel)
	LDA.w #!UI_ST_DYN_POWER
	JSR ui_st_open
	JSR ui_st_ssj
	ASL
	STA.w !ui_tmp2&$FFFF
	JSR ui_st_weighted
	ORA.w !ui_tmp2&$FFFF
	ASL : ASL
	TAX
	LDA.l ui_st_power_tab,X
	PHA
	LDA.l ui_st_power_tab+2,X
	TAY
	PLA
	LDX.w #$0001                      ; commas
	JSR ui_st_number32
	JSR ui_st_close
	; the weights lines
	LDA.w #!UI_ST_DYN_GI1
	JSR ui_st_open
	JSR ui_st_weighted
	LDX.w #ui_st_gi_off1
	CMP.w #$0000
	BEQ .gi1
	LDX.w #ui_st_gi_on1
.gi1
	JSR ui_st_puts
	JSR ui_st_close
	LDA.w #!UI_ST_DYN_GI2
	JSR ui_st_open
	JSR ui_st_weighted
	LDX.w #ui_st_gi_off2
	CMP.w #$0000
	BEQ .gi2
	LDX.w #ui_st_gi_on2
.gi2
	JSR ui_st_puts
	JSR ui_st_close
	; MANA n: the eight native seed flags that are exactly 1 (C0:29FC)
	LDA.w #!UI_ST_DYN_MANA
	JSR ui_st_open
	LDX.w #ui_st_mana
	JSR ui_st_puts
	LDX.w #$0000
	STZ.w !ui_tmp2&$FFFF
.seed
	LDA.l $7ECF90,X
	AND.w #$00FF
	CMP.w #$0001
	BNE .seeds
	INC.w !ui_tmp2&$FFFF
.seeds
	INX
	CPX.w #$0008
	BCC .seed
	LDA.w !ui_tmp2&$FFFF
	LDX.w #$0000
	JSR ui_st_number
	JSR ui_st_close
	; money GP (24-bit)
	LDA.w #!UI_ST_DYN_MONEY
	JSR ui_st_open
	LDA.l $7ECC6C
	AND.w #$00FF
	TAY
	LDA.l $7ECC6A
	LDX.w #$0001
	JSR ui_st_number32
	LDX.w #ui_st_gp
	JSR ui_st_puts
	JSR ui_st_close
	; the ten stat rows: values (commas) and meter fills
	STZ.w !ui_tmp3&$FFFF              ; row
.row
	LDA.w !ui_tmp3&$FFFF
	CLC
	ADC.w #!UI_ST_DYN_V0
	JSR ui_st_open
	JSR ui_st_stat                    ; -> A = value
	PHA
	LDY.w #$0000
	LDX.w #$0001
	JSR ui_st_number32
	JSR ui_st_close
	PLA
	JSR ui_st_fill                    ; -> A = filled (0-96)
	PHA
	LDA.w !ui_tmp3&$FFFF
	ASL
	TAX
	PLA
	STA.l !ui_s_stmeter,X
	INC.w !ui_tmp3&$FFFF
	LDA.w !ui_tmp3&$FFFF
	CMP.w #10
	BCC .row
	RTS

; Z clear (A16 = 1) when Goku is a Super Saiyan.
ui_st_ssj:
if defined("goku_form")
	LDA.w !goku_form
	AND.w #$00FF
else
	LDA.w #$0000
endif
	RTS
; A16 = 1 while the Heavy Gi is worn (story query, answered by combat).
ui_st_weighted:
if defined("STORY_Q_EQUIP_WEIGHTED")
	PHX
	LDA.w !ui_tmp3&$FFFF              ; (ui_story_query uses it)
	PHA
	LDA.w #!STORY_Q_EQUIP_WEIGHTED
	JSR ui_story_query
	TAX
	PLA
	STA.w !ui_tmp3&$FFFF
	TXA
	PLX
	AND.w #$0001
else
	LDA.w #$0000
endif
	RTS
; Goku's power level in the menu (no charge): base / weighted, base / SSJ.
ui_st_power_tab:
	dd 90000, 81000, 150000000, 135000000

; Stat row !ui_tmp3 -> A16 = value (attack: damageScale, 4095 / 8191,
; x0.9 with the weights, as combat's table).
ui_st_stat:
	JSR ui_st_row
	LDA.l ui_st_rows,X                ; WRAM address (0: attack)
	BEQ .attack
	STA.w !ui_tmp4&$FFFF
	LDA.l ui_st_rows+2,X
	CMP.w #$0002
	LDX.w !ui_tmp4&$FFFF
	LDA.l $7E0000,X
	BCS .wide
	AND.w #$00FF
.wide
	RTS
.attack
	JSR ui_st_ssj
	ASL
	STA.w !ui_tmp4&$FFFF
	JSR ui_st_weighted
	ORA.w !ui_tmp4&$FFFF
	ASL
	TAX
	LDA.l ui_st_attack_tab,X
	RTS
ui_st_attack_tab:
	dw 4095, 3686, 8191, 7372
; X = stat row !ui_tmp3 * 6 (ui_st_rows).
ui_st_row:
	LDA.w !ui_tmp3&$FFFF
	ASL
	STA.w !ui_tmp4&$FFFF
	ASL
	CLC
	ADC.w !ui_tmp4&$FFFF
	TAX
	RTS

; A16 = value of row !ui_tmp3 -> A16 = min(96, round(96 * value / max)):
; (192 * value + max) / (2 * max).
ui_st_fill:
	STA.w !ui_m0&$FFFF
	STZ.w !ui_m1&$FFFF
	LDX.w #6                          ; value * 64
.x64
	ASL.w !ui_m0&$FFFF
	ROL.w !ui_m1&$FFFF
	DEX
	BNE .x64
	LDA.w !ui_m0&$FFFF                ; + value * 128
	ASL
	STA.w !ui_mb&$FFFF
	LDA.w !ui_m1&$FFFF
	ROL
	TAY
	LDA.w !ui_m0&$FFFF
	CLC
	ADC.w !ui_mb&$FFFF
	STA.w !ui_m0&$FFFF
	TYA
	ADC.w !ui_m1&$FFFF
	STA.w !ui_m1&$FFFF
	JSR ui_st_row                     ; + max
	LDA.l ui_st_rows+4,X
	STA.w !ui_ma&$FFFF
	CLC
	ADC.w !ui_m0&$FFFF
	STA.w !ui_m0&$FFFF
	BCC .div
	INC.w !ui_m1&$FFFF
.div
	ASL.w !ui_ma&$FFFF                ; divisor 2 * max
	LDX.w #32                         ; 32 / 16 restoring division (quotient in m0)
	STZ.w !ui_mb&$FFFF                ; remainder
.bit
	ASL.w !ui_m0&$FFFF
	ROL.w !ui_m1&$FFFF
	ROL.w !ui_mb&$FFFF
	LDA.w !ui_mb&$FFFF
	CMP.w !ui_ma&$FFFF
	BCC .zero
	SBC.w !ui_ma&$FFFF
	STA.w !ui_mb&$FFFF
	INC.w !ui_m0&$FFFF
.zero
	DEX
	BNE .bit
	LDA.w !ui_m0&$FFFF
	CMP.w #96
	BCC .done
	LDA.w #96
.done
	RTS

; Append A16 in decimal (X = 1: thousands separators).
ui_st_number:
	LDY.w #$0000
; Append Y:A (32 bits) in decimal (X = 1: thousands separators, as
; toLocaleString('en-US')).
ui_st_number32:
	STA.w !ui_m0&$FFFF
	STY.w !ui_m1&$FFFF
	STX.w !ui_tmp5&$FFFF
	STZ.w !ui_tmp4&$FFFF              ; digits on the stack
.div
	LDX.w #32                         ; (m1:m0) / 10, remainder in mb
	LDA.w !ui_m1&$FFFF
	BNE .wide
	LDA.w !ui_m0&$FFFF                ; 16 bits: half the steps
	STA.w !ui_m1&$FFFF
	STZ.w !ui_m0&$FFFF
	LDX.w #16
.wide
	STZ.w !ui_mb&$FFFF
.bit
	ASL.w !ui_m0&$FFFF
	ROL.w !ui_m1&$FFFF
	ROL.w !ui_mb&$FFFF
	LDA.w !ui_mb&$FFFF
	CMP.w #10
	BCC .zero
	SBC.w #10
	STA.w !ui_mb&$FFFF
	INC.w !ui_m0&$FFFF
.zero
	DEX
	BNE .bit
	LDA.w !ui_mb&$FFFF
	PHA
	INC.w !ui_tmp4&$FFFF
	LDA.w !ui_m0&$FFFF
	ORA.w !ui_m1&$FFFF
	BNE .div
.out
	PLA
	CLC
	ADC.w #$00B5                      ; '0'
	JSR ui_st_putc
	DEC.w !ui_tmp4&$FFFF
	BEQ .done
	LDA.w !ui_tmp5&$FFFF
	BEQ .out
	LDA.w !ui_tmp4&$FFFF              ; a comma when a multiple of three
.mod3                                 ; digits remain
	CMP.w #3
	BCC .comma
	SBC.w #3
	BRA .mod3
.comma
	CMP.w #$0000
	BNE .out
	LDA.w #$00C0                      ; ','
	JSR ui_st_putc
	BRA .out
.done
	RTS

; ---------------------------------------------------------------------------
; Upload the composed cells (in vblank): the tiles in one DMA (their pairs
; are consecutive), then each tilemap word. A short vblank waits a frame.
ui_st_upload:
	LDA.w !ui_st_n&$FFFF
	BNE .some
	RTS
.some
	JSL core_vblank_lines
	CMP.w #6
	BCS .go
	RTS
.go
	SEP #$20
	LDA.b #$80
	STA.l $002115
	REP #$20
	LDA.w !ui_st_n&$FFFF              ; first tile: the next free one - 2n
	ASL
	EOR.w #$FFFF
	SEC
	ADC.w !ui_st_tile&$FFFF
	ASL : ASL : ASL                   ; 8 words each
	CLC
	ADC.w #!UI_ST_CHR
	STA.l $002116
	LDA.w #!SRAM_WORK_UI>>16
	STA.w !st_dbank&$FFFF
	LDA.w !ui_st_n&$FFFF
	ASL : ASL : ASL : ASL : ASL
	TAY
	LDX.w #!ui_s_stbuf&$FFFF
	LDA.w #$1801
	JSR ui_st_dma
	LDX.w #$0000
.map
	LDA.l !ui_s_stcell+(!UI_ST_BATCH*2),X
	STA.l $002116
	LDA.l !ui_s_stcell,X
	STA.l $002118
	INX : INX
	DEC.w !ui_st_n&$FFFF
	BNE .map
	LDA.l !ui_s_stcan                 ; the page's first cell: the canary
	BNE .out
	LDA.l !ui_s_stcell+(!UI_ST_BATCH*2)
	STA.l !ui_s_stcan
	LDA.l !ui_s_stcell
	STA.l !ui_s_stcan+2
.out
	RTS

; Phase 2: compose cells until the buffer is full, the frame's lines are
; spent or the page is done (phase 3 once the last cells are up). A cell
; starts only before line !UI_ST_STOP of the next frame (one takes at most
; about 45 lines), so the menu still finds its vblank.
ui_st_build:
	JSR ui_st_vline
	PHA                               ; 3,S: the line the build started
	CMP.w #225
	BCC .early
	EOR.w #$FFFF                      ; from the vblank: lines until !UI_ST_STOP
	SEC                               ; of the next frame
	ADC.w #262+!UI_ST_STOP
	BRA .budget
.early
	CMP.w #!UI_ST_STOP
	BCC .short
	LDA.w #!UI_ST_STOP
.short
	EOR.w #$FFFF
	SEC
	ADC.w #!UI_ST_STOP
.budget
	PHA                               ; 1,S: lines it may use
.cell
	LDA.w !ui_st_cell&$FFFF
	CMP.w #32*28
	BCC .more
	LDA.w !ui_st_n&$FFFF
	BNE .out
	LDA.w #$0003
	STA.w !ui_st&$FFFF
.out
	PLA
	PLA
	RTS
.more
	LDA.w !ui_st_n&$FFFF
	CMP.w #!UI_ST_BATCH
	BCS .out
	LDA.w !ui_st_cell&$FFFF           ; the band's operations set up
	LSR : LSR : LSR : LSR : LSR
	INC
	CMP.l !ui_s_stband
	BEQ .ready
	STA.l !ui_s_stband
	DEC
	JSR ui_st_band
.ready
	LDA.w !ui_st_cell&$FFFF
	AND.w #$001F
	ASL
	TAX
	LDA.l !ui_s_stmark,X
	BEQ .skip
	STA.w !st_ops&$FFFF
	JSR ui_st_compose
	INC.w !ui_st_cell&$FFFF
	JSR ui_st_vline                   ; lines used so far
	SEC
	SBC 3,S
	BPL .used
	CLC
	ADC.w #262
.used
	CMP 1,S
	BCC .cell
	BRA .out
.skip
	INC.w !ui_st_cell&$FFFF
	BRA .cell

; Set up band A (a row of cells): each operation's record and, per cell,
; the operations touching it (text: x0 - 1 .. x0 + width, its outline;
; meters: 400-495).
ui_st_band:
	ASL
	TAX
	LDA.l ui_st_bands,X
	STA.w !st_ops&$FFFF               ; the band's list (this bank)
	LDX.w #62
	LDA.w #$0000
.clear
	STA.l !ui_s_stmark,X
	DEX : DEX
	BPL .clear
	STZ.w !st_rec&$FFFF
.op
	LDX.w !st_ops&$FFFF
	LDA.l !UI_BANKBASE,X
	CMP.w #$FFFF
	BNE .some
	RTS
.some
	STA.w !st_op&$FFFF
	LDX.w !st_rec&$FFFF
	STA.l !ui_s_strec,X
	TAX
	LDA.l ui_st_ops,X
	AND.w #$00FF
	BEQ .text
	LDA.l ui_st_ops+8,X               ; meter: the end of its row's fill
	ASL
	TAX
	LDA.l !ui_s_stmeter,X
	CLC
	ADC.w #400
	LDX.w !st_rec&$FFFF
	STA.l !ui_s_strec+2,X
	LDA.w #400
	STA.w !st_gm&$FFFF
	LDA.w #495
	STA.w !st_om&$FFFF
	BRA .mark
.text
	JSR ui_st_geometry
.mark
	LDA.w !st_gm&$FFFF                ; first cell * 2 (clamped to the screen)
	BPL .from
	LDA.w #$0000
.from
	LSR : LSR : LSR
	AND.w #$FFFE
	STA.w !st_u&$FFFF
	LDA.w !st_om&$FFFF                ; last cell * 2
	CMP.w #512
	BCC .to
	LDA.w #511
.to
	LSR : LSR : LSR
	AND.w #$FFFE
	STA.w !st_u2&$FFFF
	LDA.w !st_rec&$FFFF               ; this operation's bit
	LSR : LSR
	TAX
	LDA.l ui_st_bits,X
	STA.w !st_m&$FFFF
	LDX.w !st_u&$FFFF
.cell
	LDA.l !ui_s_stmark,X
	ORA.w !st_m&$FFFF
	STA.l !ui_s_stmark,X
	INX : INX
	CPX.w !st_u2&$FFFF
	BCC .cell
	BEQ .cell
	LDA.w !st_rec&$FFFF
	CLC
	ADC.w #8
	STA.w !st_rec&$FFFF
	INC.w !st_ops&$FFFF
	INC.w !st_ops&$FFFF
	JMP .op

; Text operation X: its record (x0, string, length, bank) and pixel span
; x0 - 1 .. x0 + width in !st_gm / !st_om (right-aligned text ends at x).
ui_st_geometry:
	LDA.l ui_st_ops+8,X               ; fixed strings live at $8000+, dynamic
	CMP.w #$0100                      ; ids are small
	BCC .dyn
	STA.w !st_t&$FFFF
	LDA.l ui_st_ops+10,X              ; its length (this bank)
	AND.w #$00FF
	BRA .src
.dyn
	PHX
	ASL
	TAX
	LDA.l !ui_s_stoff,X
	STA.w !st_t&$FFFF
	LDA.l !ui_s_stoff+38,X
	PLX
	ORA.w #$0100                      ; (bank: SRAM)
.src
	STA.w !st_t2&$FFFF                ; length | bank << 8
	AND.w #$00FF                      ; width = length * 8 * scale
	ASL : ASL : ASL
	STA.w !st_u&$FFFF
	LDA.l ui_st_ops+2,X
	AND.w #$00FF
	CMP.w #2
	BNE .one
	ASL.w !st_u&$FFFF
.one
	LDA.l ui_st_ops+3,X               ; right-aligned: x - width
	LSR
	LDA.l ui_st_ops+4,X
	BCC .left
	SEC
	SBC.w !st_u&$FFFF
.left
	LDX.w !st_rec&$FFFF
	STA.l !ui_s_strec+2,X
	DEC
	STA.w !st_gm&$FFFF
	SEC                               ; x0 - 1 + width + 1
	ADC.w !st_u&$FFFF
	STA.w !st_om&$FFFF
	LDA.w !st_t&$FFFF
	STA.l !ui_s_strec+4,X
	LDA.w !st_t2&$FFFF
	STA.l !ui_s_strec+6,X
	RTS

; ---------------------------------------------------------------------------
; Compose the current cell (!ui_st_cell; its band operations in !st_ops):
; the window border, the operations in drawing order, then the tiles.
ui_st_compose:
	LDA.w !ui_st_cell&$FFFF
	AND.w #$001F
	ASL : ASL : ASL : ASL
	STA.w !st_cx&$FFFF
	LDA.w !ui_st_cell&$FFFF           ; page rows + 1: the browser paints its
	LSR : LSR                         ; raster from scanline 1, so screen row
	AND.w #$FFF8                      ; s (BG row s here) shows its row s + 1
	INC
	STA.w !st_cy&$FFFF
	STZ.w !st_act&$FFFF               ; no colour yet
	LDY.w #$0000                      ; column 0: every drawn pixel
	JSR ui_st_clear
	LDA.w !ui_st_cell&$FFFF           ; a window border here?
	ASL
	TAX
	LDA.l !XDATA_UI_STATUS_MAP,X
	BEQ .ops
	JSR ui_st_window
.ops
	STZ.w !st_rec&$FFFF
.op
	LSR.w !st_ops&$FFFF
	BCC .next
	LDX.w !st_rec&$FFFF
	LDA.l !ui_s_strec,X
	STA.w !st_op&$FFFF
	TAX
	LDA.l ui_st_ops,X
	AND.w #$00FF
	BEQ .text
	JSR ui_st_meter
	BRA .next
.text
	JSR ui_st_text
.next
	LDA.w !st_rec&$FFFF
	CLC
	ADC.w #8
	STA.w !st_rec&$FFFF
	LDA.w !st_ops&$FFFF
	BNE .op
	JMP ui_st_emit

; Colour Y / 2's masks (8 rows) cleared.
ui_st_clear:
	TYX
	LDA.w #$0000
	STA.l !ui_s_stcol+$00,X
	STA.l !ui_s_stcol+$10,X
	STA.l !ui_s_stcol+$20,X
	STA.l !ui_s_stcol+$30,X
	STA.l !ui_s_stcol+$40,X
	STA.l !ui_s_stcol+$50,X
	STA.l !ui_s_stcol+$60,X
	STA.l !ui_s_stcol+$70,X
	RTS
; Colour Y / 2 (1-6) takes part in the cell (its masks start empty).
ui_st_use:
	TYX
	LDA.l ui_st_bits,X
	BIT.w !st_act&$FFFF
	BNE .in
	TSB.w !st_act&$FFFF
	BRA ui_st_clear
.in
	RTS

; Paint mask A (not 0) of row !st_r16 / 16 in colour Y / 2: pixels already
; drawn lose their old colour. Keeps Y.
ui_st_paint:
	STA.w !st_m&$FFFF
	LDX.w !st_r16&$FFFF
	LDA.l !ui_s_stcol,X               ; drawn pixels
	AND.w !st_m&$FFFF
	BEQ .new
	JSR ui_st_unpaint
	LDX.w !st_r16&$FFFF
.new
	LDA.l !ui_s_stcol,X
	ORA.w !st_m&$FFFF
	STA.l !ui_s_stcol,X
	TYA
	ORA.w !st_r16&$FFFF
	TAX
	LDA.l !ui_s_stcol,X
	ORA.w !st_m&$FFFF
	STA.l !ui_s_stcol,X
	RTS
; A text row: the glyph pixels (!st_gm) in !st_col, the outline (!st_om) in
; black where no glyph pixel is; at once when nothing was drawn there yet.
ui_st_paint_text:
	LDA.w !st_gm&$FFFF
	ORA.w !st_om&$FFFF
	BEQ .none
	STA.w !st_m&$FFFF
	LDX.w !st_r16&$FFFF
	AND.l !ui_s_stcol,X               ; drawn already?
	BNE .over
	LDA.l !ui_s_stcol,X
	ORA.w !st_m&$FFFF
	STA.l !ui_s_stcol,X
	LDA.w !st_gm&$FFFF                ; black (column 1)
	EOR.w #$FFFF
	AND.w !st_om&$FFFF
	ORA.l !ui_s_stcol+2,X
	STA.l !ui_s_stcol+2,X
	LDA.w !st_col&$FFFF
	ORA.w !st_r16&$FFFF
	TAX
	LDA.l !ui_s_stcol,X
	ORA.w !st_gm&$FFFF
	STA.l !ui_s_stcol,X
.none
	RTS
.over                                 ; over other pixels: one colour at a time
	LDA.w !st_gm&$FFFF
	EOR.w #$FFFF
	AND.w !st_om&$FFFF
	BEQ .glyph
	LDY.w #2
	JSR ui_st_paint
.glyph
	LDA.w !st_gm&$FFFF
	BEQ .none
	LDY.w !st_col&$FFFF
	JMP ui_st_paint

; Mask !st_m out of every colour of the row.
ui_st_unpaint:
	LDA.w !st_act&$FFFF
	LSR                               ; (bit 0: colour 1)
	STA.w !st_u&$FFFF
	LDX.w !st_r16&$FFFF
.c
	INX : INX
	LSR.w !st_u&$FFFF
	BCC .n
	LDA.w !st_m&$FFFF
	EOR.w #$FFFF
	AND.l !ui_s_stcol,X
	STA.l !ui_s_stcol,X
.n
	LDA.w !st_u&$FFFF
	BNE .c
	RTS

; The cell's window pixels (A16 = its tilemap word: one of the static window
; cells, ui-status.mjs): black / grey / white masks from the tile pair.
ui_st_window:
	AND.w #$03FF
	SEC
	SBC.w #!UI_ST_TILE0
	ASL : ASL : ASL : ASL             ; 16 bytes per tile
	STA.w !st_t&$FFFF
	LDY.w #2
	JSR ui_st_use
	LDY.w #4
	JSR ui_st_use
	LDY.w #6
	JSR ui_st_use
	STZ.w !st_r16&$FFFF
.row
	LDA.w !st_r16&$FFFF               ; row * 2
	LSR : LSR : LSR
	CLC
	ADC.w !st_t&$FFFF
	TAX
	LDA.l !XDATA_UI_STATUS_WINTILES,X ; left tile: plane 0 | plane 1 << 8
	STA.w !st_u2&$FFFF
	LDA.l !XDATA_UI_STATUS_WINTILES+16,X ; right tile
	SEP #$20                          ; planes 0 / 1 of the 16 pixels
	STA.w !st_gm&$FFFF
	XBA
	STA.w !st_om&$FFFF
	LDA.w !st_u2&$FFFF
	STA.w (!st_gm&$FFFF)+1
	LDA.w (!st_u2&$FFFF)+1
	STA.w (!st_om&$FFFF)+1
	REP #$20
	LDA.w !st_om&$FFFF                ; index 1 (p0, !p1): black
	EOR.w #$FFFF
	AND.w !st_gm&$FFFF
	BEQ .grey
	LDY.w #2
	JSR ui_st_paint
.grey
	LDA.w !st_gm&$FFFF                ; index 2 (!p0, p1): grey
	EOR.w #$FFFF
	AND.w !st_om&$FFFF
	BEQ .white
	LDY.w #4
	JSR ui_st_paint
.white
	LDA.w !st_gm&$FFFF                ; index 3: white
	AND.w !st_om&$FFFF
	BEQ .next
	LDY.w #6
	JSR ui_st_paint
.next
	LDA.w !st_r16&$FFFF
	CLC
	ADC.w #16
	STA.w !st_r16&$FFFF
	CMP.w #128
	BCC .row
	RTS

; Meter (record !st_rec): row y gold up to the fill, dim after; row y + 1
; red / dim; x 400-495.
ui_st_meter:
	LDY.w #12                         ; dim
	JSR ui_st_use
	LDY.w #8                          ; gold
	JSR ui_st_use
	LDY.w #10                         ; red
	JSR ui_st_use
	LDA.w #400
	LDX.w #496
	JSR ui_st_span
	STA.w !st_gm&$FFFF                ; the meter's pixels in this cell
	LDX.w !st_rec&$FFFF
	LDA.l !ui_s_strec+2,X
	TAX
	LDA.w #400
	JSR ui_st_span
	STA.w !st_om&$FFFF                ; filled
	LDX.w !st_op&$FFFF
	LDA.l ui_st_ops+6,X
	SEC
	SBC.w !st_cy&$FFFF                ; its first row in the cell (-1 .. 7)
	PHA
	LDY.w #8
	JSR .line
	PLA
	INC
	LDY.w #10
.line
	CMP.w #8                          ; (-1 is out too)
	BCS .out
	ASL : ASL : ASL : ASL
	STA.w !st_r16&$FFFF
	PHY
	LDA.w !st_om&$FFFF                ; dim: the rest of the meter
	EOR.w #$FFFF
	AND.w !st_gm&$FFFF
	BEQ .fill
	LDY.w #12
	JSR ui_st_paint
.fill
	PLY
	LDA.w !st_om&$FFFF
	BEQ .out
	JMP ui_st_paint
.out
	RTS

; Mask of pixels x with A <= x < X inside this cell (bit 15 = cell x 0).
ui_st_span:
	STA.w !st_u&$FFFF
	TXA
	SEC
	SBC.w !st_cx&$FFFF                ; end relative to the cell
	BMI .none
	BEQ .none
	CMP.w #16
	BCC .end
	LDA.w #16
.end
	ASL
	TAX
	LDA.l ui_st_ones,X                ; ones(end)
	PHA
	LDA.w !st_u&$FFFF
	SEC
	SBC.w !st_cx&$FFFF                ; start relative
	BPL .start
	LDA.w #$0000
.start
	CMP.w #16
	BCS .none2
	ASL
	TAX
	LDA.l ui_st_ones,X                ; & ~ones(start)
	EOR.w #$FFFF
	AND 1,S
	PLX
	RTS
.none2
	PLA
.none
	LDA.w #$0000
	RTS

; Text operation (record !st_rec, operation !st_op) over this cell: glyph
; pixels in its colour, the outline (statusPixels: (x - 1, y) and
; (x + 1, y + 1) of every glyph pixel) black where no glyph pixel is.
; Rows y .. y + 12; glyphs sit on byte boundaries, so a row is the four
; bytes over x - 8 .. x + 23 read through four font pointers.
ui_st_text:
	LDY.w #2
	JSR ui_st_use                     ; black
	LDX.w !st_op&$FFFF
	LDA.l ui_st_ops+1,X
	AND.w #$00FF
	ASL
	STA.w !st_col&$FFFF
	TAY
	JSR ui_st_use
	LDX.w !st_op&$FFFF
	LDA.l ui_st_ops+2,X
	AND.w #$00FF
	STA.w !st_scale&$FFFF
	; g0 = cy - y: the glyph row of cell row 0; painted rows gA = max(g0, 0)
	; to gB = min(g0 + 7, 12); !st_n = rows, bit 15 when gB is row 12
	LDA.w !st_cy&$FFFF
	SEC
	SBC.l ui_st_ops+6,X
	STA.w !st_u2&$FFFF                ; g0
	CLC
	ADC.w #7
	CMP.w #12
	BCC .gb
	LDA.w #12|$8000
.gb
	STA.w !st_om&$FFFF                ; gB
	LDA.w !st_u2&$FFFF
	BPL .ga
	LDA.w #$0000
.ga
	STA.w !st_t&$FFFF                 ; gA
	SEC
	SBC.w !st_u2&$FFFF                ; its cell row
	ASL : ASL : ASL : ASL
	STA.w !st_r16&$FFFF
	LDA.w !st_t&$FFFF                 ; rows = gB - gA + 1
	EOR.w #$FFFF
	SEC
	ADC.w !st_om&$FFFF
	INC
	PHA                               ; (!st_n shares !st_t)
	LDA.w !st_t&$FFFF                 ; gA > 0: row gA - 1 is read first,
	BEQ .top                          ; for its outline on row gA
	DEC
	STA.w !st_t&$FFFF
	JSR ui_st_pointers
	STZ.w !st_o2&$FFFF
	JSR ui_st_fetch
	JSR ui_st_derive
	BRA .rows0
.top
	JSR ui_st_pointers
	STZ.w !st_o2&$FFFF
.rows0
	PLA
	STA.w !st_n&$FFFF
.rows
	LDA.w !st_n&$FFFF
	CMP.w #$8001                      ; the last row is row 12: the outline only
	BEQ .zero
	JSR ui_st_fetch
	BRA .row
.zero
	STZ.w !st_w&$FFFF
	STZ.w (!st_w&$FFFF)+2
.row
	JSR ui_st_derive
	JSR ui_st_paint_text
.next
	LDA.w !st_r16&$FFFF
	CLC
	ADC.w #16
	STA.w !st_r16&$FFFF
	DEC.w !st_n&$FFFF
	LDA.w !st_n&$FFFF
	AND.w #$00FF
	BNE .rows
	RTS

; Font pointers of the four bytes at glyph row !st_t: byte k covers
; x = cx - 8 + 8k, glyph b = (cx - 8 + 8k - x0) / 8 at scale 1; at scale 2
; glyph b / 2, bit 15 for its right half. Bytes off the string read a blank
; glyph.
ui_st_pointers:
	LDX.w !st_rec&$FFFF
	LDA.w !st_cx&$FFFF
	SEC
	SBC.l !ui_s_strec+2,X             ; cx - x0 (a multiple of 8)
	CMP.w #$8000                      ; / 8, signed
	ROR
	CMP.w #$8000
	ROR
	CMP.w #$8000
	ROR
	DEC                               ; byte 0: the one before the cell
	STA.w !st_gm&$FFFF
	LDY.w #$0000                      ; k * 2
.k
	LDA.w !st_gm&$FFFF
	LDX.w !st_scale&$FFFF
	CPX.w #2
	BNE .one
	CMP.w #$8000                      ; scale 2: glyph b / 2, odd b its right half
	ROR
	BCS .right
.one
	JSR .glyph
	BRA .store
.right
	JSR .glyph
	ORA.w #$8000
.store
	STA.w !st_fp0&$FFFF,Y
	INC.w !st_gm&$FFFF
	INY : INY
	CPY.w #8
	BCC .k
	RTS
.glyph                                ; A = glyph -> its font row (blank off the string)
	PHY
	LDX.w !st_rec&$FFFF
	SEP #$20
	CMP.l !ui_s_strec+6,X             ; length (8-bit: before the string is >= 128)
	REP #$20
	BCS .blank
	AND.w #$00FF
	CLC
	ADC.l !ui_s_strec+4,X
	TAY
	LDA.l !ui_s_strec+7,X             ; bank
	TYX
	AND.w #$00FF
	BNE .sram
	LDA.l !UI_BANKBASE,X
	BRA .code
.sram
	LDA.l !ui_s_ststr,X
.code
	AND.w #$00FF                      ; code * 12
	ASL : ASL
	STA.w !st_u&$FFFF
	ASL
	ADC.w !st_u&$FFFF
	BRA .row
.blank
	LDA.w #!UI_ST_BLANK
.row
	CLC
	ADC.w !st_t&$FFFF
	PLY
	RTS

; The four bytes of the next glyph row into !st_w (the pointers advance).
ui_st_fetch:
	LDA.w !st_scale&$FFFF
	CMP.w #2
	BEQ ui_st_fetch2
	SEP #$20
	LDX.w !st_fp0&$FFFF
	LDA.l !UI_ST_FONT,X
	STA.w !st_w&$FFFF
	LDX.w (!st_fp0&$FFFF)+2
	LDA.l !UI_ST_FONT,X
	STA.w (!st_w&$FFFF)+1
	LDX.w (!st_fp0&$FFFF)+4
	LDA.l !UI_ST_FONT,X
	STA.w (!st_w&$FFFF)+2
	LDX.w (!st_fp0&$FFFF)+6
	LDA.l !UI_ST_FONT,X
	STA.w (!st_w&$FFFF)+3
	REP #$20
	INC.w !st_fp0&$FFFF
	INC.w (!st_fp0&$FFFF)+2
	INC.w (!st_fp0&$FFFF)+4
	INC.w (!st_fp0&$FFFF)+6
	RTS
; Scale 2: each byte is half a glyph row with every pixel doubled.
ui_st_fetch2:
	LDY.w #6
.k
	LDA.w !st_fp0&$FFFF,Y
	BMI .right
	TAX
	LDA.l !UI_ST_FONT,X
	AND.w #$00FF
	LSR : LSR : LSR : LSR
	BRA .dbl
.right
	AND.w #$7FFF
	TAX
	LDA.l !UI_ST_FONT,X
	AND.w #$000F
.dbl
	TAX
	LDA.l ui_st_dbl4,X
	PHA
	TYA
	LSR
	TAX
	PLA
	SEP #$20
	STA.w !st_w&$FFFF,X
	REP #$20
	LDA.w !st_fp0&$FFFF,Y
	INC
	STA.w !st_fp0&$FFFF,Y
	DEY : DEY
	BPL .k
	RTS

; This row's glyph pixels (!st_gm: bytes 1-2 of !st_w), outline (!st_om:
; the glyphs one pixel left, with byte 3's first pixel, and !st_o2) and
; the next row's !st_o2 (the glyphs one pixel right, with byte 0's last).
ui_st_derive:
	LDA.w (!st_w&$FFFF)+1
	XBA
	STA.w !st_gm&$FFFF
	LDA.w (!st_w&$FFFF)+2             ; bit 15: x + 16
	ASL
	LDA.w !st_gm&$FFFF
	ROL
	ORA.w !st_o2&$FFFF
	STA.w !st_om&$FFFF
	LDA.w !st_w&$FFFF                 ; bit 0: x - 1
	LSR
	LDA.w !st_gm&$FFFF
	ROR
	STA.w !st_o2&$FFFF
	RTS

; One bitplane of the cell's two tiles at buffer slot Y (DB = the staging
; bank): every drawn pixel but those of colour X / 2, per row.
macro ui_st_plane(off)
	for r = 0..8
		LDA.l !ui_s_stcol+(!r*16),X
		EOR.w #$FFFF
		AND.l !ui_s_stcol+(!r*16)
		SEP #$20
		STA.w !ui_s_stbuf+16+<off>+(!r*2)&$FFFF,Y
		XBA
		STA.w !ui_s_stbuf+<off>+(!r*2)&$FFFF,Y
		REP #$20
	endfor
endmacro

; The composed cell: the colours present choose the palette (ui_st_subsets);
; plane 0 is every drawn pixel but those of index 2, plane 1 all but index
; 1 (colours sharing an index are merged first). Two 2bpp tiles into the
; upload buffer, with the cell's tilemap word.
!st_set  = !st_t
!st_map  = !st_t2
!st_c1   = !st_col
!st_c2   = !st_scale
!st_slot = !st_o2
ui_st_emit:
	STZ.w !st_set&$FFFF               ; bit c - 1 per colour present
	LDA.w !st_act&$FFFF
	LSR                               ; (bit 0: colour 1)
	STA.w !st_u&$FFFF
	LDX.w #2                          ; colour * 2
.p
	LSR.w !st_u&$FFFF
	BCC .pn
	LDA.l !ui_s_stcol+$00,X
	ORA.l !ui_s_stcol+$10,X
	ORA.l !ui_s_stcol+$20,X
	ORA.l !ui_s_stcol+$30,X
	ORA.l !ui_s_stcol+$40,X
	ORA.l !ui_s_stcol+$50,X
	ORA.l !ui_s_stcol+$60,X
	ORA.l !ui_s_stcol+$70,X
	BEQ .pn
	LDA.l ui_st_bits-2,X
	TSB.w !st_set&$FFFF
.pn
	INX : INX
	LDA.w !st_u&$FFFF
	BNE .p
	LDA.w !st_set&$FFFF
	BNE .some
	RTS                               ; nothing drawn: the cell stays blank
.some
	ASL
	TAX
	LDA.l ui_st_subsets,X             ; colour -> index (2 bits each) | palette << 12
	STA.w !st_map&$FFFF
	LDA.w #14                         ; colours of index 1 and 2 (14: none,
	STA.w !st_c1&$FFFF                ; column 7 stays empty)
	STA.w !st_c2&$FFFF
	LDA.w !st_set&$FFFF
	STA.w !st_u&$FFFF
	LDA.w !st_map&$FFFF
	STA.w !st_u2&$FFFF
	LDY.w #2
.ix
	LSR.w !st_u&$FFFF                 ; present?
	BCC .ixn
	LDA.w !st_u2&$FFFF
	AND.w #$0003
	CMP.w #$0003
	BEQ .ixn                          ; index 3: in both planes
	LSR
	BCC .i2
	LDA.w !st_c1&$FFFF                ; index 1
	CMP.w #14
	BNE .fold
	STY.w !st_c1&$FFFF
	BRA .ixn
.i2
	LDA.w !st_c2&$FFFF
	CMP.w #14
	BNE .fold
	STY.w !st_c2&$FFFF
	BRA .ixn
.fold
	PHY
	TYX
	TAY
	JSR ui_st_fold
	PLY
.ixn
	LSR.w !st_u2&$FFFF
	LSR.w !st_u2&$FFFF
	INY : INY
	LDA.w !st_u&$FFFF
	BNE .ix
	; plane 1: every drawn pixel but index 1's, plane 0: but index 2's;
	; per row the low byte is the right tile's, the high byte the left's
	LDA.w !ui_st_n&$FFFF              ; the buffer slot
	ASL : ASL : ASL : ASL : ASL
	TAY
	LDX.w !st_c1&$FFFF
	PHB
	PEA.w $3333                       ; DB = the staging bank
	PLB
	PLB
	%ui_st_plane(1)
	LDA.l !st_c2
	TAX
	%ui_st_plane(0)
	PLB
	LDA.w !ui_st_n&$FFFF              ; tilemap word (priority, palette, tile)
	ASL                               ; and address
	TAX
	LDA.w !st_map&$FFFF
	LSR : LSR
	AND.w #$1C00
	ORA.w !ui_st_tile&$FFFF
	ORA.w #$2000
	STA.l !ui_s_stcell,X
	LDA.w !ui_st_cell&$FFFF
	CLC
	ADC.w #!UI_ST_MAP
	STA.l !ui_s_stcell+(!UI_ST_BATCH*2),X
	LDA.w !ui_st_tile&$FFFF
	CLC
	ADC.w #2
	STA.w !ui_st_tile&$FFFF
	INC.w !ui_st_n&$FFFF
	RTS
; Colour X / 2 shares an index with colour Y / 2: its pixels join Y's.
ui_st_fold:
	LDA.w #8
	STA.w !st_m&$FFFF
.r
	LDA.l !ui_s_stcol,X
	PHX
	TYX
	ORA.l !ui_s_stcol,X
	STA.l !ui_s_stcol,X
	PLX
	TXA
	CLC
	ADC.w #16
	TAX
	TYA
	CLC
	ADC.w #16
	TAY
	DEC.w !st_m&$FFFF
	BNE .r
	RTS

; ---------------------------------------------------------------------------
; Tables: single bits, top-n masks, bit doubling.
ui_st_bits:
	dw $0001,$0002,$0004,$0008,$0010,$0020,$0040,$0080
	dw $0100,$0200,$0400,$0800,$1000,$2000,$4000,$8000
ui_st_ones:
	dw $0000,$8000,$C000,$E000,$F000,$F800,$FC00,$FE00,$FF00
	dw $FF80,$FFC0,$FFE0,$FFF0,$FFF8,$FFFC,$FFFE,$FFFF
ui_st_dbl4:                   ; nibble -> 8 doubled bits
	for i = 0..16
		db ((((!i>>3)&1)*3)<<6)|((((!i>>2)&1)*3)<<4)|((((!i>>1)&1)*3)<<2)|((!i&1)*3)
	endfor

incsrc "ui-status/status.asm"
