; The field NMI's palette upload (included by core.asm).
;
; C0:C0F0-C117 sends the game's palette buffer ($7E:0600, or $BE00 while
; $2A is set) to CGRAM, 512 bytes on DMA channel 7: on every completed
; frame, and on every vblank while a window is open. Modules whose colours
; must reach CGRAM in that same transfer (the Sandship's staged tint, the
; finale scenes' fades) are upload handlers in modules_cgram_upload
; (modules.asm): each returns carry set when it sent the palette itself,
; from the game's buffer (core_cgram_native) and its own colours. The
; colours then survive lag vblanks, and nothing copies into the game's
; buffer from the frame thread: a general DMA there can meet HDMA on the
; visible lines, which can hang revision-1 S-CPUs. Without a taker the
; transfer is the game's own. Before it, modules_field_preupload runs the
; copies into the game's WRAM buffers (its OAM image) that frame code
; queued: this point of the vblank precedes the game's palette and OAM
; transfers and has no HDMA running.

; Entered from C0:C0F0 (JML; M8/X16, DB = 0, D = 0; B = 0 since C0:C0AF).
; Returns to C0:C118 with the original's registers: A = $0080, X = $0200,
; Y kept.
core_cgram_upload:
	PHY
	PHP
	REP #$30
	JSL modules_field_preupload  ; queued copies into the game's WRAM buffers
	JSL modules_cgram_upload
	BCS .sent
	LDA.w #$0000
	LDY.w #512
	JSL core_cgram_native
.sent
	REP #$30
	LDA.w #$0080
	LDX.w #$0200
	PLP
	PLY
	JML $00C118

; For upload handlers: the game's buffer from CGRAM byte offset A16 (even),
; Y16 bytes (even, nonzero), on DMA channel 7, as C0:C0F0 does. M16/X16,
; DB in $00-$3F or $80-$BF (I/O and low WRAM mirrored). Preserves A, X, Y.
core_cgram_native:
	PHA
	LSR
	SEP #$20
	STA.w $2121
	REP #$20
	LDA.w #$2200                 ; A->B, one register: CGDATA
	STA.w $4370
	SEP #$20
	LDA.w $002A                  ; the game's flash buffer while set (C0:C0F5)
	REP #$20
	BEQ .base
	LDA.w #$BE00
	BRA .src
.base
	LDA.w #$0600
.src
	CLC
	ADC $01,S
	STA.w $4372
	SEP #$20
	LDA.b #$7E
	STA.w $4374
	REP #$20
	TYA
	STA.w $4375
	SEP #$20
	LDA.b #$80
	STA.w $420B
	REP #$20
	PLA
	RTL
