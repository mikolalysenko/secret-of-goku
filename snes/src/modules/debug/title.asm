; Title-screen code and the scene-select screen (included by module.asm in
; the debug code bank).
;
; The title (and opening credits) program runs from WRAM at 7E:8000+. Its
; frame is the IRQ handler at 7E:A266, which fires around scanline 192 and
; then waits for vblank; every button except the D-pad leaves the title. At
; each title entry the first four bytes of that handler (PHD / PHP /
; REP #$30) become JML debug_title_irq, which reads pad 1 ($4218 is stable
; there: the auto-read finished in the previous vblank) and runs the code:
;   Up, Up, Down, Down, Left, Right, Left, Right
; each press within two seconds of the previous one. D-pad presses never
; leave the title, so the code cannot conflict with Start or any other
; button, and a wrong press restarts it. The patch is skipped if the bytes
; are not the original ones (another module changed the handler).

!DBG_TITLE_IRQ = $7EA266

; modules_title_boot (M16/X16, DB = $7E, D = 0), every title entry.
debug_title_boot:
	; Whatever was armed belongs to the run that just ended.
	LDA.w #$0000
	STA.l !dbg_magic
	SEP #$20
	STA.l !dbg_code_step
	STA.l !dbg_code_timer
	STA.l !dbg_menu_active
	REP #$20
	LDA.w #$FFF0
	STA.l !dbg_code_prev
	LDA.l !core_title_entry
	BNE .out                        ; the ending's credits entry: no code
	LDA.l !DBG_TITLE_IRQ
	CMP.w #$080B                    ; PHD / PHP
	BNE .out
	LDA.l !DBG_TITLE_IRQ+2
	CMP.w #$30C2                    ; REP #$30
	BNE .out
	LDA.l !DBG_TITLE_IRQ+4
	CMP.w #$20E2                    ; SEP #$20 (resume point)
	BNE .out
	LDA.w #$005C|((debug_title_irq&$FF)<<8)
	STA.l !DBG_TITLE_IRQ
	LDA.w #(debug_title_irq>>8)&$FFFF
	STA.l !DBG_TITLE_IRQ+2
.out
	RTL

; 7E:A266 (JML; IRQ context, the interrupted code's registers). Replays
; PHD / PHP / REP #$30, polls the code, resumes at 7E:A26A.
debug_title_irq:
	PHD
	PHP
	REP #$30
	PHA
	PHX
	PHY
	PHB
	JSR debug_code_poll
	BCS .open
	PLB
	PLY
	PLX
	PLA
	JML !DBG_TITLE_IRQ+4
.open
	JML debug_menu_enter

; Code state machine. M16/X16, any DB/D. Carry set when complete.
debug_code_poll:
	LDA.l $004218
	AND.w #$FFF0
	STA.l !dbg_tmp0                 ; held
	LDA.l !dbg_code_prev
	EOR.w #$FFFF
	AND.l !dbg_tmp0
	STA.l !dbg_tmp1                 ; pressed this frame
	LDA.l !dbg_tmp0
	STA.l !dbg_code_prev
	LDA.l !dbg_tmp1
	BNE .press
	SEP #$20
	LDA.l !dbg_code_step
	BEQ .idle
	LDA.l !dbg_code_timer
	INC
	STA.l !dbg_code_timer
	CMP.b #120
	BCC .idle
	LDA.b #$00
	STA.l !dbg_code_step
.idle
	REP #$20
	CLC
	RTS
.press
	SEP #$20
	LDA.b #$00
	STA.l !dbg_code_timer
	LDA.l !dbg_code_step
	CMP.b #$08
	BCC +
	LDA.b #$00
+	REP #$20
	AND.w #$00FF
	ASL
	TAX
	LDA.l debug_code_seq,X
	CMP.l !dbg_tmp1
	BEQ .match
	; wrong press: start over (an Up press is the first step again)
	LDA.l debug_code_seq
	CMP.l !dbg_tmp1
	SEP #$20
	BEQ +
	LDA.b #$00
	BRA ++
+	LDA.b #$01
++	STA.l !dbg_code_step
	REP #$20
	CLC
	RTS
.match
	SEP #$20
	LDA.l !dbg_code_step
	INC
	STA.l !dbg_code_step
	CMP.b #$08
	REP #$20
	BCS .done
	CLC
	RTS
.done
	SEP #$20
	LDA.b #$00
	STA.l !dbg_code_step
	REP #$20
	SEC
	RTS

debug_code_seq:
	dw !PAD_UP, !PAD_UP, !PAD_DOWN, !PAD_DOWN, !PAD_LEFT, !PAD_RIGHT, !PAD_LEFT, !PAD_RIGHT

; ---------------------------------------------------------------------------
; Scene-select screen: a standalone program (like the title program it
; replaces) with interrupts off, polling HVBJOY. Mode 0: BG1 is the text
; (the cartridge's dialogue font with a one-pixel outline), BG2 the window
; frame and its dithered interior (the cartridge's window tiles).
;   VRAM $0000 tiles, $1000 window map (BG2), $1400 text map (BG1). Text
;   row r (0-12) uses map rows 1+2r and 2+2r. Two columns of 11 presets,
;   the description of the highlighted one on row 12.
; Up/Down/Left/Right move, B/A/Start start the preset, Y/X/Select return to
; the title (the game's own soft-reset entry, C1:0010).

!DBG_MAP2 = $1400

debug_menu_enter:
	SEI
	REP #$30
	LDX.w #$01FF
	TXS
	LDA.w #$0000
	TCD
	PEA $8080 : PLB : PLB           ; DB = $80: I/O and low WRAM
	SEP #$20
	LDA.b #$80
	STA $2100                       ; forced blank
	STZ $4200                       ; no NMI, IRQ or auto-joypad
	STZ $420C
	STZ $420B
	LDA $4211                       ; acknowledge the title's IRQ
	JSR debug_ppu_init
	JSR debug_menu_upload
	REP #$30
	SEP #$20
	LDA.b #$01
	STA.l !dbg_menu_active
	LDA.b #$FF
	STA.l !dbg_drawn
	LDA.b #$00
	STA.l !dbg_repeat
	LDA.l !dbg_last_valid
	CMP.b #$A5
	BNE +
	LDA.l !dbg_last
	CMP.b #!DEBUG_PRESET_COUNT
	BCC ++
+	LDA.b #$00
++	STA.l !dbg_cursor
	REP #$20
	LDA.w #$FFFF                    ; held buttons must be released first
	STA.l !dbg_menu_prev
	JSR debug_menu_redraw           ; still in forced blank
	SEP #$20
	LDA.b #$01
	STA $4200                       ; auto-joypad read only
	REP #$20
	JSR debug_wait_vblank
	SEP #$20
	LDA.b #$0F
	STA $2100
	REP #$20
; Each frame: VRAM changes in vblank, then the pad during the active display
; (the auto-joypad read finished early in vblank, so $4218 is stable then;
; reading it right after vblank starts could race the read on hardware).
debug_menu_loop:
	JSR debug_wait_vblank
	JSR debug_menu_redraw
	JSR debug_wait_active
	JSR debug_menu_input
	BRA debug_menu_loop

; Wait for the start / the end of vblank. M16, DB = $80.
debug_wait_vblank:
	SEP #$20
-	LDA $4212
	BPL -
	REP #$20
	RTS
debug_wait_active:
	SEP #$20
-	LDA $4212
	BMI -
	REP #$20
	RTS

; Every PPU register this screen depends on. M8/X16, DB = $80.
debug_ppu_init:
	LDX.w #$0000
.reg
	REP #$20
	LDA.l debug_ppu_regs,X
	AND.w #$00FF
	CMP.w #$00FF
	BEQ .out
	TAY                             ; register low byte
	SEP #$20
	LDA.l debug_ppu_regs+1,X
	STA $2100,Y
	INX
	INX
	BRA .reg
.out
	SEP #$20
	RTS

; (register, value) pairs, $FF ends. Scroll registers take two writes.
debug_ppu_regs:
	db $01,$00, $02,$00, $03,$00, $05,$00, $06,$00
	db $07,$14, $08,$10, $09,$00, $0A,$00, $0B,$00, $0C,$00
	db $0D,$00, $0D,$00, $0E,$FF, $0E,$03
	db $0F,$00, $0F,$00, $10,$FF, $10,$03
	db $11,$00, $11,$00, $12,$00, $12,$00
	db $13,$00, $13,$00, $14,$00, $14,$00
	db $15,$80, $1A,$00
	db $23,$00, $24,$00, $25,$00, $26,$00, $27,$00, $28,$00, $29,$00
	db $2A,$00, $2B,$00, $2C,$03, $2D,$00, $2E,$00, $2F,$00
	db $30,$00, $31,$00, $32,$E0, $33,$00
	db $FF

; Tiles, both maps and the palette by DMA (forced blank). M8/X16, DB = $80.
debug_menu_upload:
	LDA.b #$80
	STA $2115
	REP #$20
	LDA.w #$0000
	STA $2116
	LDA.w #debug_tiles
	LDX.w #debug_tiles_end-debug_tiles
	JSR debug_dma_vram
	LDA.w #$1000
	STA $2116
	LDA.w #debug_bg1
	LDX.w #$0800
	JSR debug_dma_vram
	LDA.w #!DBG_MAP2
	STA $2116
	LDA.w #debug_bg2
	LDX.w #$0800
	JSR debug_dma_vram
	SEP #$20
	STZ $2121
	LDA.b #$00
	STA $4300                       ; one register, A -> B
	LDA.b #$22
	STA $4301
	REP #$20
	LDA.w #debug_palette
	STA $4302
	LDA.w #debug_palette_end-debug_palette
	STA $4305
	SEP #$20
	LDA.b #!DBG_BANK
	STA $4304
	LDA.b #$01
	STA $420B
	RTS

; A16 = source (debug bank), X16 = bytes; VRAM address already set.
debug_dma_vram:
	STA $4302
	STX $4305
	SEP #$20
	LDA.b #$01                      ; two registers ($2118/9)
	STA $4300
	LDA.b #$18
	STA $4301
	LDA.b #!DBG_BANK
	STA $4304
	LDA.b #$01
	STA $420B
	REP #$20
	RTS

; Mode 0 palettes (CGRAM 0-31 BG1, 32-63 BG2). BG1 is the text, in front:
; 0 normal, 1 highlighted, 2 header and description (outline, glyph). BG2 is
; the window: 0 its frame (black and the window greys), 1 its interior
; (the native blue on alternate pixels over a black backdrop).
debug_palette:
	dw $0000,$0000,$0000,$7FFF      ; BG1 pal 0 (colour 0 = backdrop)
	dw $0000,$0000,$0000,$03FF      ; BG1 pal 1
	dw $0000,$0000,$0000,$6F5B      ; BG1 pal 2
	dw $0000,$0000,$0000,$0000, $0000,$0000,$0000,$0000
	dw $0000,$0000,$0000,$0000, $0000,$0000,$0000,$0000
	dw $0000,$0000,$0000,$0000
	dw $0000,$0000,$5250,$739C      ; BG2 pal 0
	dw $0000,$2C00,$0000,$0000      ; BG2 pal 1
debug_palette_end:

; Redraw the highlight when the cursor moved (vblank or forced blank).
; M16/X16, DB = $80.
debug_menu_redraw:
	SEP #$20
	LDA.l !dbg_cursor
	CMP.l !dbg_drawn
	REP #$20
	BEQ .out
	SEP #$20
	LDA.l !dbg_drawn
	CMP.b #$FF
	REP #$20
	BEQ +
	AND.w #$00FF
	LDY.w #$0000                    ; palette 0
	JSR debug_draw_name
+	LDA.l !dbg_cursor
	AND.w #$00FF
	LDY.w #$0400                    ; palette 1
	JSR debug_draw_name
	JSR debug_draw_desc
	SEP #$20
	LDA.l !dbg_cursor
	STA.l !dbg_drawn
	REP #$20
.out
	RTS

; A = preset, Y = palette bits: rewrite its name cells. M16/X16, DB = $80.
debug_draw_name:
	PHA
	TYA
	STA.l !dbg_tmp3                 ; palette bits
	PLA
	ASL
	ASL
	ASL
	ASL
	TAX                             ; record = debug_preset_names + 16 * id
	LDA.l debug_preset_names+1,X    ; text row
	AND.w #$00FF
	ASL
	INC
	ASL
	ASL
	ASL
	ASL
	ASL                             ; (1 + 2 row) * 32
	STA.l !dbg_tmp0
	LDA.l debug_preset_names,X      ; column
	AND.w #$00FF
	CLC
	ADC.l !dbg_tmp0
	CLC
	ADC.w #!DBG_MAP2
	STA.l !dbg_tmp0                 ; top-half row address
	STA $2116
	LDA.w #$0000
	STA.l !dbg_tmp2
	JSR .cells
	LDA.l !dbg_tmp0
	CLC
	ADC.w #$0020
	STA $2116
	LDA.w #$0001
	STA.l !dbg_tmp2
.cells
	PHX
	LDA.l debug_preset_names+2,X    ; length
	AND.w #$00FF
	TAY
-	LDA.l debug_preset_names+3,X
	JSR debug_glyph_word
	STA $2118
	INX
	DEY
	BNE -
	PLX
	RTS

; Description of the cursor's preset on text row 12 (palette 2).
debug_draw_desc:
	LDA.w #$0800
	STA.l !dbg_tmp3
	LDA.l !dbg_cursor
	AND.w #$00FF
	ASL
	ASL
	ASL
	ASL
	ASL
	TAX                             ; 32 bytes per description
	LDA.w #!DBG_MAP2+((1+(2*12))*32)+1
	STA $2116
	LDA.w #$0000
	STA.l !dbg_tmp2
	JSR .cells
	LDA.w #!DBG_MAP2+((2+(2*12))*32)+1
	STA $2116
	LDA.w #$0001
	STA.l !dbg_tmp2
.cells
	PHX
	LDY.w #30
-	LDA.l debug_preset_desc,X
	JSR debug_glyph_word
	STA $2118
	INX
	DEY
	BNE -
	PLX
	RTS

; A low byte = glyph code, !dbg_tmp2 = half, !dbg_tmp3 = palette bits
; -> A16 = BG2 map word.
debug_glyph_word:
	AND.w #$00FF
	SEC
	SBC.w #$0080
	ASL
	CLC
	ADC.w #!DEBUG_GLYPH_BASE
	CLC
	ADC.l !dbg_tmp2
	ORA.l !dbg_tmp3
	RTS

; Pad handling (after the auto-joypad read). M16/X16, DB = $80.
debug_menu_input:
	LDA $4218
	AND.w #$FFF0
	STA.l !dbg_tmp0                 ; held
	LDA.l !dbg_menu_prev
	EOR.w #$FFFF
	AND.l !dbg_tmp0
	STA.l !dbg_tmp1                 ; pressed
	LDA.l !dbg_tmp0
	STA.l !dbg_menu_prev
	; auto-repeat a held direction after 16 frames, every 4
	LDA.l !dbg_tmp0
	AND.w #$0F00
	BEQ .norep
	SEP #$20
	LDA.l !dbg_repeat
	INC
	STA.l !dbg_repeat
	CMP.b #20
	BCC .rep8
	LDA.b #16
	STA.l !dbg_repeat
	REP #$20
	LDA.l !dbg_tmp0
	AND.w #$0F00
	ORA.l !dbg_tmp1
	STA.l !dbg_tmp1
	BRA .keys
.rep8
	REP #$20
	BRA .keys
.norep
	SEP #$20
	LDA.b #$00
	STA.l !dbg_repeat
	REP #$20
.keys
	LDA.l !dbg_tmp1
	BIT.w #!PAD_B|!PAD_A|!PAD_START
	BEQ +
	JMP debug_menu_launch
+	BIT.w #!PAD_Y|!PAD_X|!PAD_SELECT
	BEQ +
	JMP debug_menu_exit
+	SEP #$20
	LDA.l !dbg_cursor
	STA.l !dbg_tmp2                 ; old cursor
	REP #$20
	LDA.l !dbg_tmp1
	BIT.w #!PAD_UP
	BEQ +
	JSR debug_cursor_up
+	LDA.l !dbg_tmp1
	BIT.w #!PAD_DOWN
	BEQ +
	JSR debug_cursor_down
+	LDA.l !dbg_tmp1
	BIT.w #!PAD_LEFT|!PAD_RIGHT
	BEQ +
	JSR debug_cursor_side
+	RTS

; Two columns of 11: Up/Down wrap inside a column, Left/Right switch.
debug_cursor_up:
	SEP #$20
	LDA.l !dbg_cursor
	BEQ .wrap
	CMP.b #11
	BEQ .wrap
	DEC
	BRA .set
.wrap
	CLC
	ADC.b #10
.set
	STA.l !dbg_cursor
	REP #$20
	RTS
debug_cursor_down:
	SEP #$20
	LDA.l !dbg_cursor
	CMP.b #10
	BEQ .wrap
	CMP.b #21
	BEQ .wrap
	INC
	BRA .set
.wrap
	SEC
	SBC.b #10
.set
	STA.l !dbg_cursor
	REP #$20
	RTS
debug_cursor_side:
	SEP #$20
	LDA.l !dbg_cursor
	CLC
	ADC.b #11
	CMP.b #22
	BCC +
	SEC
	SBC.b #22
+	STA.l !dbg_cursor
	REP #$20
	RTS

; Back to the title: the game's quit path (C0:010F JML $C10010).
debug_menu_exit:
	SEP #$20
	LDA.b #$80
	STA $2100
	STZ $4200
	LDA.b #$00
	STA.l !dbg_menu_active
	JML $C10010

; Start the highlighted preset: arm the autopilot, then leave exactly as the
; title program does after Start (7E:AF1C: JSL $C00000 / JSL $C00012 /
; JML $C00009, with M8 X16, D = 0, DB = 0, S = $01FF): the native game
; select and name editor follow, driven by debug_menu_frame.
debug_menu_launch:
	; Wait until every button is released, so the confirming press cannot
	; reach the game select before the autopilot hides the pad.
-	JSR debug_wait_vblank
	JSR debug_wait_active
	LDA $4218
	AND.w #$FFF0
	BNE -
	; The title answers Start with the sound driver's fade (80 20 0F 0F)
	; and a fade to black; do the same before handing over.
	LDA.w #$2080
	STA.l $7E1E00
	LDA.w #$0F0F
	STA.l $7E1E02
	JSL $C30004
	REP #$30
	LDX.w #$000F
-	JSR debug_wait_vblank
	SEP #$20
	TXA
	STA $2100
	REP #$20
	JSR debug_wait_active
	DEX
	BPL -
	SEP #$20
	LDA.b #$80
	STA $2100
	STZ $4200
	LDA.b #$00
	STA.l !dbg_menu_active
	LDA.l !dbg_cursor
	STA.l !dbg_preset
	STA.l !dbg_last
	LDA.b #$A5
	STA.l !dbg_last_valid
	REP #$20
	JSR debug_arm
	SEP #$20
	REP #$10
	LDX.w #$01FF
	TXS
	LDA.b #$00
	PHA
	PLB
	REP #$20
	LDA.w #$0000
	TCD
	; C0:0E40 clears $1D00+X..+$FF with the caller's X: the title passes
	; X = 0 (registers at 7E:AF1C: A = $017F, X = 0, Y = $0610).
	LDA.w #$017F
	LDX.w #$0000
	LDY.w #$0610
	SEP #$20
	JSL $C00000
	JSL $C00012
	JML $C00009
