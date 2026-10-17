; Title screen. The title/menu program runs from WRAM: reset (C1:4D0F)
; decompresses it from C7:7C00 to 7E:8000, then core's title-boot hook
; (C1:4CF6 / C1:4D0B) calls modules_title_boot before entering it. Here the
; title module patches three call sites in the WRAM copy (all verified byte
; for byte first; on any mismatch nothing is patched):
;   7E:ADFD  JSL $C10014 (logo tiles DC:E800 -> 7E:4000) -> title_logo_load
;   7E:8869  text-row writer epilogue                     -> title_credit_tail
;   7E:92DD  LDA $0070 / STA $420C (vblank HDMA enable)   -> title_vblank_hdma
; The logo hook overwrites the Mana word's tiles in the decompressed buffer
; before the program DMAs it to BG2 (all affected tiles are unique to the
; logo). The credit hook replaces the native "PROGRAMMED BY NASIR" row of the
; BG2 tilemap buffer (7F:2B40, row 17) with the 31-glyph credit; while that
; row is current, HDMA channel 3 scrolls BG2 by -4 on lines 136-143 so the
; glyphs sit at the browser's half-cell inset. Channels 1-3 are unused by the
; title program while the credit is shown (it uses 4-7 for palette effects).

; ---------------------------------------------------------------------------
; modules_title_boot: M16/X16, DB=$7E, D=0; module WRAM was just cleared.
title_title_boot:
	PHB
	JSR title_patch_program
	PLB
	RTL

; Verify every patch site, then write them all. M16 X16 on entry.
title_patch_program:
	PHB
	PEA $7E7E
	PLB
	PLB                          ; DB = $7E: absolute ,Y addresses the WRAM program
	REP #$30
	LDX.w #$0000
.verify
	LDA.l title_program_patches,X
	BEQ .verified
	TAY
	LDA.l title_program_patches+2,X
	AND.w #$00FF
	STA.l !title_tmp
	STA.l !title_tmp2
	INX
	INX
	INX
.vbyte
	SEP #$20
	LDA.l title_program_patches,X
	CMP $0000,Y
	BNE .fail
	REP #$20
	INX
	INY
	LDA.l !title_tmp
	DEC
	STA.l !title_tmp
	BNE .vbyte
	TXA
	CLC
	ADC.l !title_tmp2            ; skip the new bytes
	TAX
	BRA .verify
.fail
	REP #$30
	PLB
	RTS
.verified
	LDX.w #$0000
.apply
	LDA.l title_program_patches,X
	BEQ .done
	TAY
	LDA.l title_program_patches+2,X
	AND.w #$00FF
	STA.l !title_tmp
	TXA
	CLC
	ADC.w #$0003
	ADC.l !title_tmp             ; X -> new bytes
	TAX
.abyte
	SEP #$20
	LDA.l title_program_patches,X
	STA $0000,Y
	REP #$20
	INX
	INY
	LDA.l !title_tmp
	DEC
	STA.l !title_tmp
	BNE .abyte
	BRA .apply
.done
	SEP #$20
	LDA.l !title_status
	ORA.b #$02
	STA.l !title_status
	REP #$30
	PLB
	RTS

; ---------------------------------------------------------------------------
; Replaces JSL $C10014 at 7E:ADFD. M16 X16, A=$7EDC, X=$E800, Y=$4000.
; Decompress the logo tiles as before, then write the GOKU tiles over the
; Mana word's tiles in the 7E:4000 buffer (DMAed to BG2 tiles a few frames
; later, before the title is shown).
title_logo_load:
	JSL $C10014
	PHP
	PHB
	REP #$30
	PHA
	PHX
	PHY
	LDX.w #title_logo_tiles
.tile
	PEA.w (title_logo_tiles>>16)*$0101
	PLB
	PLB                          ; DB = data bank
	LDA $0000,X                  ; destination in 7E, $FFFF ends the list
	BMI .done
	TAY
	INX
	INX
	LDA.w #$001F
	db $54,$7E,title_logo_tiles>>16 ; MVN: 32 bytes from data bank X to 7E:Y
	BRA .tile
.done
	REP #$30
	PLY
	PLX
	PLA
	PLB
	PLP
	RTL

; ---------------------------------------------------------------------------
; JML from 7E:8869, the text-row writer's epilogue (PLA PLA PLP PLD; RTS at
; 7E:886D is kept). M8 X16; DB = buffer bank; Y = end of the row it wrote.
title_credit_tail:
	PHP
	REP #$30
	PHA
	PHX
	PHY
	CPY.w #$2B80                   ; row 17 of the BG2 tilemap buffer 7F:2700
	BNE .done
	SEP #$20
	PHB
	PLA
	CMP.b #$7F
	BNE .done
	REP #$20
	LDX.w #$003E
.cmp
	LDA.l $7F2B40,X
	CMP.l title_credit_original,X
	BNE .done
	DEX
	DEX
	BPL .cmp
	LDX.w #$003E
.copy
	LDA.l title_credit_new,X
	STA.l $7F2B40,X
	DEX
	DEX
	BPL .copy
.done
	REP #$30
	PLY
	PLX
	PLA
	PLP
	PLA                          ; original epilogue (M8: one byte each)
	PLA
	PLP
	PLD
	JML $7E886D                  ; RTS

; ---------------------------------------------------------------------------
; JSL from 7E:92DD, in vblank after the program's DMA queue. Replaces
; LDA $0070 / STA $00420C. M8 X16, DB=$7F, D=$4200.
title_vblank_hdma:
	PHP
	REP #$30
	PHX
	LDX.w #$003E
.cmp
	LDA.l $7F2B40,X
	CMP.l title_credit_new,X
	BNE .off
	DEX
	DEX
	BPL .cmp
	SEP #$20
	LDA.b #$02                     ; one register, written twice
	STA.l $004330
	LDA.b #$0F                     ; BG2HOFS
	STA.l $004331
	REP #$20
	LDA.w #title_credit_hdma
	STA.l $004332
	SEP #$20
	LDA.b #title_credit_hdma>>16
	STA.l $004334
	LDA.l $7F0070
	ORA.b #$08                     ; channel 3
	BRA .store
.off
	SEP #$20
	LDA.l $7F0070
.store
	STA.l $00420C
	PLX
	PLP
	RTL
