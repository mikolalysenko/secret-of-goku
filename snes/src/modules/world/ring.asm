; The Fly item's ring icon (native-item-icons.js + sprite-layer.js
; injectPortrait kind 'fly'): wherever the ring shows the Drum's 16x16 icon,
; the browser draws Goku's complete upright hover pose at half size (atlas
; column 38, or 34 in Super Saiyan form, row 0, every second pixel) in his
; own colours. The goku module already stores that downscale for every cell
; (goku_cell_mini, tiles in Goku's palette), so the cartridge copies those
; four tiles in place of the drum and points the icon's OBJ at palette 5,
; which holds Goku's colours in the field.

!WORLD_FLY_ICON = $A4      ; the Drum's ring icon (D2:8400 + $A4 * 96)
!WORLD_FLY_COL_BASE = 38
!WORLD_FLY_COL_SSJ = 34

; Carry set when the Fly icon is Goku's: Goku active and the first player's
; ring ($1802 bit 0 clear: palettes 0-3, so palette 5 is still Goku's).
; M16 X16, DB = 0. Preserves X/Y.
world_fly_icon_ok:
	LDA.l !persist_goku_active
	AND.w #$00FF
	BEQ .no
	LDA.l $7E1802
	LSR
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS

; ---------------------------------------------------------------------------
; D0:CA6E (JSL, 5 bytes, replaced REP #$30 / AND #$00FF): the ring's item
; icon builder, called from D0:C987 with A8 = icon; it expands the 3bpp art
; into $1900-$197F (top-left, top-right, bottom-left, bottom-right tiles)
; for the DMA at D0:C99C. For the Fly icon with Goku, copy the hover cell's
; miniature instead and return through the RTS at D0:C9FB (to C98A, M16 X16).
; Entry: M8 X16, DB = 0, D = 0.
world_ring_icon_hook:
	REP #$30
	AND.w #$00FF
	CMP.w #!WORLD_FLY_ICON
	BEQ +
	RTL
+	JSR world_fly_icon_ok
	BCS +
	LDA.w #!WORLD_FLY_ICON
	RTL
+	PHB
	PHX
	PHY
	; the form's hover cell
	LDA.l $7E0000|!goku_form
	AND.w #$00FF
	BEQ +
	LDA.w #$0001
	LDX.w #!WORLD_FLY_COL_SSJ
	BRA ++
+	LDX.w #!WORLD_FLY_COL_BASE
++	LDY.w #$0000
	JSL goku_api_cell
	CMP.w #!GOKU_NONE
	BEQ .done
	ASL
	ASL
	ASL                              ; cell * 8: four tile words
	TAX
	LDA.w #$0000
	PHA                              ; destination offset in $7E:1900
.tile
	LDA.l goku_cell_mini,X
	PHX                              ; [tile word offset] [destination]
	PHA
	XBA
	LSR
	LSR
	LSR
	AND.w #$001F
	CLC
	ADC.w #$00F8                     ; tile bank F8 + index >> 11
	SEP #$20
	PHA
	PLB
	REP #$20
	PLA
	AND.w #$07FF
	ASL
	ASL
	ASL
	ASL
	ASL
	TAY                              ; (index & $7FF) * 32
	LDA $03,S
	TAX
-	LDA.w $0000,Y
	STA.l $7E1900,X
	INY
	INY
	INX
	INX
	TXA
	AND.w #$001F
	BNE -
	TXA
	STA $03,S
	PLX
	INX
	INX
	CMP.w #$0080
	BCC .tile
	PLA
.done
	PLY
	PLX
	PLB
	; return to the builder's caller: the RTS at D0:C9FB
	LDA.w #$C9FA
	STA $01,S
	RTL

; ---------------------------------------------------------------------------
; C0:7063 (JSL, 8 bytes, replaced CPY #$0009 / JSR $709C / STA $06,X): the
; ring's icon sprite (X = sprite object) gets tile and attributes for slot Y:
; tile $E0 + 2 * slot, priority 3, palette slot / 3 (C0:709C adds $0200 per
; group of three). The Fly icon with Goku uses palette 5 (Goku's colours).
; Entry: M16 X16, DB = 0, D = 0, A = tile/attr so far.
world_ring_attr_hook:
	CPY.w #$0009
	BCC +
	CLC
	ADC.w #$0200
+	PHA
	JSR world_fly_icon_ok
	BCC .keep
	TYA
	ASL
	PHX
	TAX
	LDA.l $7E1880,X                  ; slot list: low byte = icon
	PLX
	AND.w #$00FF
	CMP.w #!WORLD_FLY_ICON
	BNE .keep
	PLA
	AND.w #$F1FF
	ORA.w #$0A00                     ; palette 5
	STA $06,X
	RTL
.keep
	PLA
	STA $06,X
	RTL
