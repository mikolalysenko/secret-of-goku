; Dialogue window placement (engine/window-placement.js). Included in the
; UI code bank.
;
; The native text engine always draws its window on BG3 rows 1-8 (lines
; 8-71, built in WRAM at $7E:9C00 and uploaded to VRAM $5820). When the
; first window of a scene opens over more characters' faces than the band
; above the HUD (lines 136-199) would cover, every window of that scene is
; shown there instead, without touching the tilemap, the text engine or its
; timing. While a window is moved, the game's two window HDMA channels are
; reprogrammed (they are not used for DMA, so they keep their registers
; and need no per-frame vblank work):
;
; - Channel 1: BG3 vertical scroll (mode 2 to BG3VOFS): rows 17-24 (blank:
;   nothing else draws there in a field scene) on lines 8-71, rows 1-8 on
;   lines 136-199, the game's own scroll elsewhere.
; - Channel 0: the HUD's BG3 colours. The game's tables (channel 0 CGADD +
;   channel 1 indirect CGDATA) load colours 1-15 on lines 159-173, inside the
;   moved window. The replacement (indirect mode 3 to CGADD/CGDATA, one
;   colour per line from records in SRAM staging) loads palette 0 on lines
;   191-193 (the window's bottom row only uses the frame's palette 1), then
;   palettes 1-3 on lines 199-207 (the HUD's top row only uses palette 0,
;   its second row starts at 207), from the same source buffer.
;
; One decision per scene, as the browser: when a window is first present
; during an event, and kept for every later window of the scene until the
; interpreter has been idle for 30 frames; ring menus and shops keep the
; native position.

!ui_wp      = !RAM_UI+$AA     ; word: !UIW_* bits
!ui_wp_idle = !RAM_UI+$AC     ; word: field frames since the interpreter went idle

!UIW_SESSION = $0001          ; a scene's placement is decided
!UIW_LOWER   = $0002          ; and its windows go above the HUD
!UIW_NOW     = $0004          ; a window is moved this frame
!UIW_TAKEN   = $0008          ; channels 0/1 hold the UI's tables
!UIW_FORCED  = $0010          ; $2C bit 1 set by the UI (the game had its window HDMA off)

!ui_s_wpd = !SRAM_WORK_UI+$200 ; 52 bytes: colour records (CGADD, CGADD, lo, hi);
                               ; the radio's HDMA table otherwise (never both)
!ui_s_wpv = !SRAM_WORK_UI+$312 ; 16 bytes: BG3VOFS table (channel 1)
!ui_s_wpo = !SRAM_WORK_UI+$322 ; 4 bytes: the game's channel 0 / 1 table addresses
                               ; (UI_TEST builds: +4, a word, counts late vblanks
                               ; that left a closing window at the native place)

!UI_WP_BUF = $9C00            ; native window rows 1-8 in WRAM (32 words each)
!UI_WP_LAST_LINE = 258        ; HDMAEN bits are only set before this line

; ---------------------------------------------------------------------------
; Field frame, after the radio's window update. DB = $7E, M16/X16.
ui_place_frame:
	; a scene ends after 30 idle frames (chained events hand over sooner)
	LDA.w $00D0
	AND.w #$00FF
	BEQ .idle
	STZ.w !ui_wp_idle&$FFFF
	BRA .scene
.idle
	LDA.w !ui_wp_idle&$FFFF
	CMP.w #31
	BCS +
	INC
	STA.w !ui_wp_idle&$FFFF
+	CMP.w #31
	BCC .scene
	LDA.w #!UIW_SESSION|!UIW_LOWER
	TRB.w !ui_wp&$FFFF
.scene
	STZ.w !ui_tmp3&$FFFF              ; this frame's !UIW_NOW (stored at once)
	JSR ui_place_present
	BCC .apply
	LDA.w !ui_wp&$FFFF
	AND.w #!UIW_SESSION
	BNE .decided
	LDA.w $00D0                       ; decide when a window is present in an event
	AND.w #$00FF
	BEQ .decided
	LDA.w #!UIW_SESSION
	TSB.w !ui_wp&$FFFF
	JSR ui_place_field
	BCC .decided
	LDA.w !ui_state&$FFFF             ; the band above the HUD is free (the
	AND.w #!UIS_DRAWN                 ; radio's lower box is the only other
	BEQ +                             ; BG3 content there in a field scene)
	LDA.w !ui_place&$FFFF
	CMP.w #!UI_ROW_LOWER
	BEQ .decided
+	JSR ui_place_menu
	BCS .decided
	JSR ui_place_covered
	BCC .decided
	LDA.w #!UIW_LOWER
	TSB.w !ui_wp&$FFFF
.decided
	JSR ui_place_menu                 ; shops and ring menus stay native
	BCC +
	LDA.w #!UIW_LOWER
	TRB.w !ui_wp&$FFFF
+	LDA.w !ui_wp&$FFFF
	AND.w #!UIW_LOWER
	BEQ .apply
	LDA.w !ui_state&$FFFF             ; (the radio's palette HDMA uses the
	AND.w #!UIS_HDMA                  ; records' staging; it is never up
	BNE .apply                        ; with a native window)
	JSR ui_place_field
	BCC .apply
	JSR ui_place_native_ok            ; the game's window HDMA as expected
	BCC .apply
	JSR ui_place_tables
	LDA.w #!UIW_NOW
	STA.w !ui_tmp3&$FFFF
.apply
	LDA.w !ui_wp&$FFFF
	AND.w #!UIW_NOW^$FFFF
	ORA.w !ui_tmp3&$FFFF
	STA.w !ui_wp&$FFFF
	RTS

; A native window tile on rows 1-8 after this vblank's upload. The window
; opens from (and closes to) the middle of rows 4-5, growing sideways and
; then up and down, so column 15 of rows 1-8 holds one of its tiles
; whenever any part of it is up (its top and bottom edges once it is open,
; even while the text area is cleared). Carry set = present.
ui_place_present:
	LDA.w $1D04                       ; no window uploading or open: none
	AND.w #$0060                      ; up (one test on idle frames)
	BEQ .no
	LDA.w $1D11                       ; full-screen text ($9400 -> $5800):
	LSR                               ; not a dialogue window
	BCS .no
	LDA.w $1D05
	AND.w #$00FF
	CMP.w #$0007
	BEQ .no
	LDX.w #7*64
-	LDA.w !UI_WP_BUF+(15*2),X
	AND.w #$DFFF                      ; 0 and $2000 are blank
	BNE .yes
	TXA
	SEC
	SBC.w #64
	TAX
	BPL -
.no
	CLC
	RTS
.yes
	SEC
	RTS

; The field in Mode 1 and no ending (the ending's ui_hide owner bit).
; Carry set = yes.
ui_place_field:
	LDA.w !ui_block&$FFFF
	AND.w #!UI_HIDE_ENDING
	BNE .no
	LDA.w $0029
	AND.w #$0007
	CMP.w #$0001
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; Carry set while a menu ($EC & $7E) is up.
ui_place_menu:
	LDA.w $00EC
	AND.w #$007E
	CMP.w #$0001                      ; C = nonzero
	RTS

; Faces (screen y - 24) of active actors on screen, counted in the native
; band (0-71) and the band above the HUD (128-199). Carry set when the
; window covers more of them where it is. Uses !ui_tmp0-1.
ui_place_covered:
	STZ.w !ui_tmp0&$FFFF              ; top count
	STZ.w !ui_tmp1&$FFFF              ; bottom count
	LDX.w #$0000
.actor
	LDA.w $E000,X
	LSR
	BCC .next
	LDA.w $E020,X                     ; -16 < screen x < 272
	CLC
	ADC.w #15
	CMP.w #287
	BCS .next
	LDA.w $E022,X
	SEC
	SBC.w #24
	CMP.w #72
	BCS +
	INC.w !ui_tmp0&$FFFF
	BRA .next
+	SEC
	SBC.w #128
	CMP.w #72
	BCS .next
	INC.w !ui_tmp1&$FFFF
.next
	TXA
	CLC
	ADC.w #$0200
	TAX
	CMP.w #12*$200
	BCC .actor
	LDA.w !ui_tmp1&$FFFF
	CMP.w !ui_tmp0&$FFFF              ; C clear when bottom < top
	BCC .lower
	CLC
	RTS
.lower
	SEC
	RTS

; The game's window HDMA is the one this module knows: channel 0 mode 0 to
; CGADD with table 7F 10 | 20 10 | 8F 01.., channel 1 indirect mode 2 to
; CGDATA from bank $7E with table 7F d d | 20 d d | 8F h h, both tables in
; bank 0. Carry set = it is. Leaves the channel 1 table address in !ui_tmp1.
ui_place_native_ok:
	LDA.w !ui_wp&$FFFF
	AND.w #!UIW_TAKEN
	BEQ .regs
	LDA.l $004302                     ; ours: the game's tables were saved
	CMP.w #ui_place_cgtab&$FFFF
	BNE .regs
	LDA.l !ui_s_wpo
	STA.w !ui_tmp0&$FFFF
	LDA.l !ui_s_wpo+2
	STA.w !ui_tmp1&$FFFF
	BRA .tables
.regs
	LDA.l $004300                     ; $4300 = $00, $4301 = $21
	CMP.w #$2100
	BNE .no
	LDA.l $004310                     ; $4310 = $42, $4311 = $22
	CMP.w #$2242
	BNE .no
	LDA.l $004304                     ; banks 0
	ORA.l $004314
	AND.w #$00FF
	BNE .no
	LDA.l $004317                     ; indirect bank $7E
	AND.w #$00FF
	CMP.w #$007E
	BNE .no
	LDA.l $004302
	STA.w !ui_tmp0&$FFFF
	LDA.l $004312
	STA.w !ui_tmp1&$FFFF
.tables
	LDX.w !ui_tmp0&$FFFF
	LDA.l $7E0000,X
	CMP.w #$107F
	BNE .no
	LDA.l $7E0002,X
	CMP.w #$1020
	BNE .no
	LDA.l $7E0004,X
	CMP.w #$018F
	BNE .no
	LDX.w !ui_tmp1&$FFFF
	LDA.l $7E0000,X
	AND.w #$00FF
	CMP.w #$007F
	BNE .no
	LDA.l $7E0003,X
	AND.w #$00FF
	CMP.w #$0020
	BNE .no
	LDA.l $7E0006,X
	AND.w #$00FF
	CMP.w #$008F
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; This frame's tables: BG3VOFS from the game's scroll ($40), and the colour
; records from the sources of the game's channel 1 table (!ui_tmp1): its
; dummy (colour 16) and its HUD colours 1-15.
ui_place_tables:
	SEP #$20
	LDA.w $0040                       ; BG3 vertical scroll (the game writes
	STA.l !ui_s_wpv+1                 ; 0 to the high byte)
	STA.l !ui_s_wpv+7
	STA.l !ui_s_wpv+13
	CLC
	ADC.b #128
	STA.l !ui_s_wpv+4
	STA.l !ui_s_wpv+10
	LDA.b #$00
	STA.l !ui_s_wpv+2
	STA.l !ui_s_wpv+5
	STA.l !ui_s_wpv+8
	STA.l !ui_s_wpv+11
	STA.l !ui_s_wpv+14
	STA.l !ui_s_wpv+15                ; end
	LDA.b #7                          ; lines 0-6: the game's scroll
	STA.l !ui_s_wpv+0
	LDA.b #64                         ; 7-70: rows 17-24 (the window hidden)
	STA.l !ui_s_wpv+3
	STA.l !ui_s_wpv+6                 ; 71-134: the game's scroll
	STA.l !ui_s_wpv+9                 ; 135-198: rows 1-8 (the window)
	LDA.b #1
	STA.l !ui_s_wpv+12                ; 199-: the game's scroll
	REP #$20
	LDX.w !ui_tmp1&$FFFF
	LDA.l $7E0001,X                   ; dummy record: colour 16 = itself
	TAY
	LDA.w $0000,Y                     ; (DB = $7E)
	STA.l !ui_s_wpd+2
	LDA.w #$1010
	STA.l !ui_s_wpd+0
	LDA.l $7E0007,X                   ; HUD colour 1
	STA.w !ui_tmp2&$FFFF
	LDX.w #$0000
.rec
	LDA.l ui_place_cgadds,X           ; CGADD, CGADD
	STA.l !ui_s_wpd+4,X
	AND.w #$00FF
	DEC
	ASL
	CLC
	ADC.w !ui_tmp2&$FFFF              ; source + (colour - 1) * 2
	TAY
	LDA.w $0000,Y
	STA.l !ui_s_wpd+6,X
	INX : INX : INX : INX
	CPX.w #12*4
	BCC .rec
	RTS

; The colours of the records, in line order (lines 191-193, 199-207).
ui_place_cgadds:
	db $01,$01,0,0, $02,$02,0,0, $03,$03,0,0
	db $05,$05,0,0, $06,$06,0,0, $07,$07,0,0
	db $09,$09,0,0, $0A,$0A,0,0, $0B,$0B,0,0
	db $0D,$0D,0,0, $0E,$0E,0,0, $0F,$0F,0,0

; Channel 0 replacement: indirect mode 3 (CGADD, CGADD, CGDATA, CGDATA)
; records in SRAM staging (bank $33).
ui_place_cgtab:
	db 127 : dw !ui_s_wpd&$FFFF       ; line 0: dummy
	db 64  : dw !ui_s_wpd&$FFFF       ; 127: dummy
	db $83 : dw (!ui_s_wpd+4)&$FFFF   ; 191-193: colours 1-3
	db 5   : dw !ui_s_wpd&$FFFF       ; 194: dummy
	db $89 : dw (!ui_s_wpd+16)&$FFFF  ; 199-207: colours 5-7, 9-11, 13-15
	db $00

; ---------------------------------------------------------------------------
; Field vblank (DB = $80, forced blank), from ui_field_nmi, after the game's
; own vblank work. Channels 0/1 follow !UIW_NOW: taken (again, if the
; game's window setup at C0:C1E7 reprogrammed them) while a window is moved,
; given back otherwise. While a window closes the game turns its window
; HDMA off every vblank (C0:C0E1 clears $2C bits 0-1, which the core then
; writes to HDMAEN): bit 1 is set again so the scroll channel keeps the
; window where it was. Idle cost: one test.
ui_place_nmi:
	LDA.l !ui_wp
	BIT.w #!UIW_NOW|!UIW_TAKEN|!UIW_FORCED
	BNE +
	RTS
+	BIT.w #!UIW_NOW
	BNE +
	JMP .give
+	LDA $4302                         ; take (saving the game's tables unless
	CMP.w #ui_place_cgtab&$FFFF       ; they are ours already)
	BEQ +
	STA.l !ui_s_wpo
	BRA .take
+	LDA $4312
	CMP.w #!ui_s_wpv&$FFFF
	BEQ .force
.take
	LDA $4312
	CMP.w #!ui_s_wpv&$FFFF
	BEQ +
	STA.l !ui_s_wpo+2
+	LDA.w #$2143                      ; channel 0: indirect mode 3, B = $21
	STA $4300
	LDA.w #ui_place_cgtab&$FFFF
	STA $4302
	LDA.w #$1202                      ; channel 1: mode 2, B = $12 (BG3VOFS)
	STA $4310
	LDA.w #!ui_s_wpv&$FFFF
	STA $4312
	SEP #$20
	LDA.b #ui_place_cgtab>>16
	STA $4304
	LDA.b #!ui_s_wpd>>16
	STA $4307
	LDA.b #!ui_s_wpv>>16
	STA $4314
	REP #$20
	LDA.l !ui_wp
	ORA.w #!UIW_TAKEN
	STA.l !ui_wp
.force
	LDA.l $7E002C
	AND.w #$0003
	CMP.w #$0003
	BEQ .gameOn                       ; the game runs its window HDMA
	; Channels switched on in HDMAEN once the frame's HDMA has started run
	; from stale pointers: no bit is set when this vblank's work already
	; reaches its last lines (the core writes $2C to HDMAEN after FX).
	JSR ui_place_vline
	CMP.w #225
	BCC .late
	CMP.w #!UI_WP_LAST_LINE
	BCS .late
	LDA.w $1D04                       ; (DB = $80: WRAM mirror) a window
	AND.w #$0020                      ; open: the game's setup (C0:C1E7)
	BEQ .closing                      ; would turn both channels on now, but
	LDA.w $010E                       ; skips it while bit 1 is ours
	BEQ .closing
	SEP #$20
	LDA.b #$03
	TSB.w $002C
	REP #$20
	BRA .gameOn
.closing
	LDA.l $7E002C
	AND.w #$0002
	BNE .done
	SEP #$20
	LDA.b #$02
	TSB.w $002C
	REP #$20
	LDA.l !ui_wp
	ORA.w #!UIW_FORCED
	STA.l !ui_wp
.done
	RTS
.late
if defined("UI_TEST")
	LDA.l !ui_s_wpo+4                 ; frames left at the native place
	INC
	STA.l !ui_s_wpo+4
endif
	RTS
.gameOn
	LDA.l !ui_wp
	AND.w #!UIW_FORCED^$FFFF
	STA.l !ui_wp
	RTS
.give
	LDA $4302                         ; unless the game reprogrammed them since
	CMP.w #ui_place_cgtab&$FFFF
	BNE +
	LDA.w #$2100                      ; mode 0, B = $21
	STA $4300
	LDA.l !ui_s_wpo
	STA $4302
	SEP #$20
	STZ $4304
	STZ $4307
	REP #$20
+	LDA $4312
	CMP.w #!ui_s_wpv&$FFFF
	BNE +
	LDA.w #$2242                      ; indirect mode 2, B = $22
	STA $4310
	LDA.l !ui_s_wpo+2
	STA $4312
	SEP #$20
	STZ $4314
	LDA.b #$7E
	STA $4317
	REP #$20
+	LDA.l !ui_wp
	BIT.w #!UIW_FORCED
	BEQ +
	SEP #$20                          ; our bit off: with no window the game
	LDA.b #$02                        ; keeps $2C bits 0-1 clear, with one it
	TRB.w $002C                       ; sets its own channels up next vblank
	REP #$20
+	LDA.l !ui_wp
	AND.w #(!UIW_TAKEN|!UIW_FORCED)^$FFFF
	STA.l !ui_wp
	RTS

; Current scanline in A16 (DB = $80, NMI side).
ui_place_vline:
	SEP #$20
	LDA $213F                         ; reset the counter latch flip-flop
	LDA $2137                         ; latch H/V
	LDA $213D
	XBA
	LDA $213D
	AND.b #$01
	XBA
	REP #$20
	RTS
