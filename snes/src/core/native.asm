; Exact replacements for hot retail helpers. No actor scheduling changes.

; C1:E326 waits an entire vblank before redrawing HP numbers. During
; ordinary Goku field play, queue the identical redraw for a completed
; frame's NMI instead. Events, menus, loads and other interrupt handlers
; retain the synchronous retail path.
core_native_hp_request:
	PHP
	SEP #$20
	PHA
	LDA.l !persist_goku_active
	BEQ .native
	LDA $D0
	ORA $FF
	BNE .native
	LDA $EC
	AND.b #$FE
	BNE .native
	LDA $ED
	AND.b #$40
	BNE .native
	LDA.l !core_mode
	CMP.b #!CORE_MODE_FIELD
	BNE .native
	REP #$20
	LDA $0100
	CMP.w #$A85C
	BNE .native8
	LDA $0102
	CMP.w #$00C0
	BNE .native8
	SEP #$20
	LDA.b #$01
	STA.l !core_hp_pending
	PLA
	PLP
	SEP #$20
	REP #$10
	JML $81E334                  ; native RTS
.native8
	SEP #$20
.native
	PLA
	PLP
	SEP #$20
	PHB
	LDA.b #$00
	JML $81E32B                  ; original PHA / PLB / wait and redraw

; M16/X16, DB=$80, D=0. Called only after a completed field frame, after
; other NMI uploads. Reserve twelve scanlines for the full three-member
; retail redraw and restore its DP scratch. It uses no DMA channel.
core_native_hp_nmi:
	LDA.l !core_hp_pending
	AND.w #$00FF
	CMP.w #$0001
	BNE .done
	JSR core_vcount
	CMP.w #225
	BCC .done
	CMP.w #247
	BCS .done
	for offset = 0..5
		!hp_offset #= !offset*2
		LDA.b !hp_offset
		PHA
	endfor
	LDA.w #$0000
	STA.l !core_hp_pending
	PHK
	PER .restore-1
	PEA $E338-1                 ; retail RTL following the RTS target
	JML $81E339
.restore
	REP #$30
	for offset = 0..5
		PLA
		!hp_offset #= 8-(!offset*2)
		STA.b !hp_offset
	endfor
.done
	RTS

incsrc "core-graphics/data.asm"

; C1:C599: common death and weapon sheets. All three retail
; colour encodings were expanded at build time. Copy into the original
; buffer with an interruptible MVN, preserving the decoder's registers,
; flags, direct-page outputs and DB. No DMA channel or math register used.
; Unknown sources, sizes, destinations and decimal mode use retail code.
macro core_native_tiles_path(name, next, bank, source, tiles, destination, data, mask)
<name>:
	PHP
	REP #$30
	PHA
	AND.w #$00FF
	CMP.w #<bank>
	BNE .native
	CPY.w #<source>
	BNE .native
	LDA $08
	AND.w #$00FF
	CMP.w #<tiles>
	BNE .native
	LDA $00
	CMP.w #<destination>
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
	JML <next>
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
	LDA.w #((<tiles>*32)-1)
	MVN $7E,(<data>>>16)
	; Variant 0 leaves the last row's transparency mask in DP $00.
	LDA $04
	AND.w #$00FF
	BEQ .mask
	CMP.w #3
	BNE .finish
.mask
	SEP #$20
	LDA.b #<mask>
	STA $00
	REP #$20
.finish
	PLA                          ; destination offset + decoded bytes
	CLC
	ADC.w #(<tiles>*32)
	TAX
	; Reproduce the last source-pointer ADC, including its C/V result.
	LDA.w #(<source>+((<tiles>-1)*24))
	CLC
	ADC.w #24
	TAY
	SEP #$20
	STZ $08                      ; preserve the high byte of tile count
	PLB                          ; as retail, NZ reflect the caller's DB
	RTL
.source
	for slot = 0..6
		dw ((<data>&$FFFF)+((!slot%3)*<tiles>*32))
	endfor
endmacro

%core_native_tiles_path(core_native_tiles, core_native_weapon_0, $D1, $F100, 50, $0800, !XDATA_CORE_GFX_DEATH, !CORE_GFX_DEATH_MASK)
%core_native_tiles_path(core_native_weapon_0, core_native_weapon_511, $D4, $0000, 64, $0000, !XDATA_CORE_GFX_WEAPON_0, !CORE_GFX_WEAPON_0_MASK)
%core_native_tiles_path(core_native_weapon_511, core_native_tiles_retail, $D4, $2FE8, 64, $0000, !XDATA_CORE_GFX_WEAPON_511, !CORE_GFX_WEAPON_511_MASK)
core_native_tiles_retail:
	SEP #$20
	PHB
	PHA
	PLB
	JML $81C59E

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
