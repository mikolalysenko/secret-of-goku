; Exact replacements for hot retail helpers. No actor scheduling changes.

incsrc "core-graphics/data.asm"

; C1:C599: the death/status sheet requested by C1:85F1. All three retail
; colour encodings were expanded at build time. Copy into the original
; buffer with an interruptible MVN, preserving the decoder's registers,
; flags, direct-page outputs and DB. No DMA channel or math register used.
; Unknown sources, sizes, destinations and decimal mode use retail code.
core_native_tiles:
	PHP
	REP #$30
	PHA
	AND.w #$00FF
	CMP.w #$00D1
	BNE .native
	CPY.w #$F100
	BNE .native
	LDA $08
	AND.w #$00FF
	CMP.w #50
	BNE .native
	LDA $00
	CMP.w #$0800
	BNE .native
	CPX.w #$0C00                 ; the six native party/enemy slots
	BCS .native
	TXA
	AND.w #$01FF
	BNE .native
	LDA $03,S                    ; original P: retain decimal semantics
	AND.w #$0008
	BNE .native
	BRA .fast
.native
	PLA
	PLP
	SEP #$20
	PHB
	PHA
	PLB
	JML $81C59E
.fast
	PLA
	PLP
	; Reproduce the retail setup, including its direct-page scratch.
	SEP #$20
	PHB
	PHA
	PLB
	REP #$10
	STX $02
	LDA $03
	LSR
	STA $04
	ASL : ASL : ASL : ASL
	ORA $01
	STA $01
	STZ $00
	LDX $00
	REP #$20
	PHX                          ; retail destination offset
	TXA
	CLC
	ADC.w #$2000
	TAY                          ; actual WRAM destination
	LDA $04
	AND.w #$00FF
	ASL
	TAX
	LDA.l .source,X
	TAX
	LDA.w #50*32-1
	MVN $7E,(!XDATA_CORE_GFX_DEATH>>16)
	; Variant 0 leaves the last row's transparency mask in DP $00.
	LDA $04
	AND.w #$00FF
	BEQ .mask
	CMP.w #3
	BNE .finish
.mask
	SEP #$20
	LDA.b #!CORE_GFX_DEATH_MASK
	STA $00
	REP #$20
.finish
	PLA                          ; destination offset + decoded bytes
	CLC
	ADC.w #50*32
	TAX
	; Retail's last ADC advances Y from $F598 to $F5B0: C=V=0.
	LDA.w #$F598
	CLC
	ADC.w #24
	TAY
	SEP #$20
	STZ $08                      ; preserve the high byte of tile count
	PLB                          ; as retail, NZ reflect the caller's DB
	RTL
.source
	for slot = 0..6
		dw ((!XDATA_CORE_GFX_DEATH&$FFFF)+((!slot%3)*1600))
	endfor

; C1:2710: highest set bit of X, or $00FF for zero. X returns bit+1
; (zero for empty), Y/DB/D/P are preserved, except NZ follows PLD as in
; retail. The original shifts all 16 bits even for an empty target mask;
; companion AI calls it repeatedly with zero or a small mask.
core_native_high_bit:
	PHD
	PHP
	REP #$30
	TXA
	BEQ .zero
	XBA
	AND.w #$00FF
	BEQ .low
	TAX
	LDA.l .bits,X
	AND.w #$00FF
	ORA.w #8
	BRA .found
.low
	LDA.l .bits,X
	AND.w #$00FF
.found
	TAX
	INX
	BRA .done
.zero
	LDA.w #$00FF
.done
	PLP
	PLD
	RTL
.bits
	for value = 0..256
		if !value >= 128
			db 7
		elseif !value >= 64
			db 6
		elseif !value >= 32
			db 5
		elseif !value >= 16
			db 4
		elseif !value >= 8
			db 3
		elseif !value >= 4
			db 2
		elseif !value >= 2
			db 1
		else
			db 0
		endif
	endfor
