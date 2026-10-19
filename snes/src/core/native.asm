; Exact replacements for hot retail helpers. No actor scheduling changes.

incsrc "core-math/data.asm"

; C1:0358: classify the screen-space distance between actors X/Y, subtracting
; their individual heights first. The lookup retains the retail unsigned
; absolute differences, inclusive radius thresholds and wrapped square sum.
; Keep the original stack frame/epilogue (A result, X/Y/DB/D/P contract).
; Decimal and eight-bit-index callers retain every original instruction.
; The multiplier registers are scratch, not part of this helper's result.
core_native_distance:
	PHD
	PHP
	REP #$20
	LDA $01,S
	BIT.w #$0018               ; decimal mode or eight-bit indexes
	BEQ .fast
	JML $C1035C                ; retail TSC / local allocation / calculation
.fast
	TSC
	SEC
	SBC.w #4
	TCD
	TCS
	LDA.w $0020,X
	SEC
	SBC.w $0020,Y
	BCS +
	EOR.w #$FFFF
	INC
+	BIT.w #$FF00
	BNE .far
	STA $01
	LDA.w $0045,Y
	AND.w #$00FF
	EOR.w #$FFFF
	SEC
	ADC.w $0022,Y
	STA $03
	LDA.w $0045,X
	AND.w #$00FF
	EOR.w #$FFFF
	SEC
	ADC.w $0022,X
	SEC
	SBC $03
	BCS +
	EOR.w #$FFFF
	INC
+	BIT.w #$FF00
	BNE .far
	XBA
	ORA $01
	PHX
	TAX
	BMI .high
	LDA.l core_distance_low,X
	BRA .found
.high
	LDA.l core_distance_high-$8000,X
.found
	PLX
	AND.w #$00FF
	JML $C103F9
.far
	LDA.w #8
	JML $C103F9

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

; Native body/weapon anchor and pieces: add packed coordinates for interior
; assemblies. Direct emitter calls (including small shadows) are unchanged.
; Small lists, edge anchors, decimal mode and offsets outside -32..31 use
; the original clipping/high-X path. All continuations use the field's
; equivalent FastROM mirror. Private scratch is never touched by NMI.
core_native_body_anchor:
	STA $06
	SEP #$20
	LDA.w $E00D,X
	BEQ .emit
	SEC
	SBC.b #$10
	STA.w $E00D,X
	BCS .shake
	LDA.b #0
	STA.w $E00D,X
	BRA .emit
.shake
	LSR
	BCC .y
	PHA
	LDA $F4
	AND.b #1
	ASL
	EOR $04
	STA $04
	PLA
.y
	LSR
	BCC .emit
	LDA $F4
	AND.b #1
	ASL
	EOR $06
	STA $06
.emit
	TYX
core_native_body:
	SEP #$20
	LDY $7C
	CPY.w #$0200
	BCC +
	JML $80E6CE                 ; full list preserves A
+
	LDA $02
	CMP.b #3
	BCC .native8               ; small bodies retain the native loop
	PHP
	PLA
	AND.b #$08
	BNE .native8
	REP #$20
	LDA $04
	SEC
	SBC.w #32
	CMP.w #193
	BCS .native
	TAY
	LDA $06
	SEC
	SBC.w #32
	CMP.w #161
	BCC .fast
.native
	SEP #$20
.native8
	JML $80E640
.fast
	XBA
	AND.w #$FF00
	STA.l !core_native_xy
	TYA
	ORA.l !core_native_xy
	STA.l !core_native_xy
	LDY $7C
.loop
	CPY.w #$0200
	BCS .return
	LDA.w $0000,X
	EOR.w #$8080
	SEC
	SBC.w #$6060
	BIT.w #$C0C0
	BNE .native
	CLC
	ADC.l !core_native_xy
	STA.w $0800,Y
	LDA.w $0002,X
	STA.w $0802,Y
	TYA
	CLC
	ADC.w #4
	TAY
	STY $7C
	SEP #$20
	LDA $59
	ASL : ASL
	BCC +
	INC $5A
	LDA.b #1
+	STA $59
	DEC $02
	BEQ .done
	INX : INX : INX : INX
	REP #$20
	BRA .loop
.return
	SEP #$20
.done
	JML $80E6CE

; A ROM -> WMDATA DMA may run only early in an ordinary native field
; frame. The fixed transfer is <= 2048 bytes (12.1 scanlines); setup and
; register restoration bring the bound below 16 lines. Sampling <=160
; therefore finishes before the native line-196 HUD IRQ and line-225 NMI.
; No interrupt is masked and no channel configuration survives the copy.
; Later scanlines, scene/load work, other vectors and HDMA channel 7 keep
; the interruptible MVN path. M16/X16, any DB/D; preserves X/Y.
core_native_dma_window:
	LDA.l $7E0100
	CMP.w #$A85C
	BNE .no
	LDA.l $7E0102
	CMP.w #$00C0
	BNE .no
	LDA.l $7E0104
	CMP.w #$CF5C
	BNE .no
	LDA.l $7E0106
	CMP.w #$00C1
	BNE .no
	LDA.l $7E00D0
	ORA.l $7E00FF
	AND.w #$00FF
	BNE .no
	LDA.l $7E00EC
	AND.w #$40FE                 ; ring/menu or native upload already pending
	BNE .no
	LDA.l $7E002C
	AND.w #$0080
	BNE .no
	JSR core_vcount
	CMP.w #161
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS

; C1:C599: common death and weapon sheets. All three retail
; colour encodings were expanded at build time. Copy into the original
; buffer with an early-field DMA or interruptible MVN, preserving the
; decoder's registers, flags, direct-page outputs and DB.
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
	JSR core_native_dma_window
	BCC .mvn
.dma_setup
	; Save every channel-7 register MDMA changes, plus its mode/target.
	; Use long I/O addresses: DB still belongs to the retail source sheet.
	LDA.l $004370 : PHA
	LDA.l $004372 : PHA
	LDA.l $004374 : PHA
	LDA.l $004376 : PHA
	TYA
	STA.l $002181
	TXA
	STA.l $004372
	LDA.w #$8000                 ; incrementing ROM -> $2180 WMDATA
	STA.l $004370
	LDA.w #(<tiles>*32)
	STA.l $004375
	SEP #$20
	LDA.b #$00
	STA.l $002183
	LDA.b #(<data>>>16)
	STA.l $004374
	LDA.b #$80
	STA.l $00420B
	REP #$20
	PLA : STA.l $004376
	PLA : STA.l $004374
	PLA : STA.l $004372
	PLA : STA.l $004370
	BRA .copied
.mvn
	LDA.w #((<tiles>*32)-1)
	MVN $7E,(<data>>>16)
.copied
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
