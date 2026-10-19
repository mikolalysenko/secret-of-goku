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

; Native window animation shifts rows through two cell-exchange calls per
; column. Batch the interior columns, retaining the final native iteration
; for exact counters, upload flags, accumulator, indexes and status flags.
; Conservative bounds exclude metadata, row wrapping and unusual callers.
; No DMA or persistent scratch is introduced; every source word is cleared
; before its copy is written to the adjacent row, as in the native loop.
macro core_window_shift(step, fill, columns, continuation)
	PHP
	LDA $01,S
	BIT.b #$18
	BNE .native8
	PHB
	PLA
	CMP.b #$7E
	BNE .native8
	LDA.w $A156
	if <step> > 0
		CMP.b #1
		BCC .native8
		CMP.b #20
	else
		CMP.b #2
		BCC .native8
		CMP.b #21
	endif
	BCS .native8
	REP #$20
	LDA.w $A157
	CMP.w #32
	BCS .native
	LDA.w $A164
	AND.w #$00FF
	CMP.w #2
	BCC .native
	DEC
	if <columns> == 2
		ASL
	endif
	PHA
	CLC
	ADC.w $A157
	CMP.w #33-<columns>
	BCS .reject
	PLA
	BRA .fast
.reject
	PLA
.native
	SEP #$20
.native8
	PLP
	JML <continuation>
.fast
	PHY
	TAY                          ; prefix columns, leave the final iteration
	LDA.w $A157
	ASL
	PHA
	LDA.w $A156
	AND.w #$00FF
	DEC
	ASL : ASL : ASL : ASL : ASL : ASL
	CLC
	ADC $01,S
	TAX
	PLA
.column
	LDA.w $9C00,X
	ORA.w #$2000
	PHA
	LDA.w #<fill>
	STA.w $9C00,X
	PLA
	STA.w $9C00+(<step>*64),X
	INX : INX
	DEY
	BNE .column
	LDA.w $A164
	AND.w #$00FF
	DEC
	if <columns> == 2
		ASL
	endif
	CLC
	ADC.w $A157
	SEP #$20
	STA.w $A157
	LDA.b #1
	STA.w $A164
	PLY
	PLP
	JML <continuation>
endmacro

core_native_window_down:
	LDA.w $A165
	STA.w $A156
	%core_window_shift(1, $2000, 1, $C0075A)
core_native_window_up:
	LDA.w $A167
	STA.w $A156
	%core_window_shift(-1, $2000, 1, $C00785)
core_native_window_border_up:
	INC.w $A157
	INC.w $A156
	%core_window_shift(-1, $2118, 2, $C00C6E)
core_native_window_border_down:
	INC.w $A157
	DEC.w $A156
	%core_window_shift(1, $2118, 2, $C00CF4)

; C0:107B clears the 1,334-byte message/window buffer. The caller has
; already selected M8/X16 and DB=$7E. Clear descending words in 64-byte
; chunks, with the same final X=0, A/Y/DB/D and flags. Preserve A in full.
core_native_text_clear:
	PHP
	CLD
	REP #$20
	PHA
	LDX.w #$0536
.block
	for row = 0..32
		STZ.w $9BFE-(!row*2),X
	endfor
	TXA : SEC : SBC.w #64 : TAX
	CPX.w #64
	BCS .block
	for row = 0..27
		STZ.w $9BFE-(!row*2),X
	endfor
	PLA
	PLP
	LDX.w #0
	JML $C01084

; C0:14C6 copies $A171 groups of sixteen bytes from Y to X, one byte per
; eight-instruction loop. Native messages use DB=$7E, X=$9400 and up to
; 56 groups from $9000-$93FF. Replace only that disjoint WRAM copy. Large
; copies use unrolled words; small copies keep MVN. Both are interruptible
; and touch no DMA/HDMA registers; other callers fall back.
; M8/X16 in/out. A's high byte is the last byte read, low byte zero; C/V,
; DB/D and the advanced X/Y match retail, including the final counter Z/N.
core_native_text_copy:
	PHP
	LDA $01,S
	BIT.b #$18                   ; decimal / eight-bit-index fallback
	BNE .native8
	PHB
	PLA
	CMP.b #$7E
	BNE .native8
	REP #$20
	CPX.w #$9400
	BNE .native
	TYA
	CMP.w #$9000
	BCC .native
	CMP.w #$9400
	BCS .native
	LDA.w $A171
	AND.w #$00FF
	BEQ .native                  ; zero means 256 groups in retail
	CMP.w #57
	BCS .native
	ASL : ASL : ASL : ASL
	PHA
	TYA
	CLC
	ADC $01,S
	CMP.w #$9401
	BCS .reject                  ; the source must end before destination
	PLA
if not(defined("CORE_NATIVE_TEXT_MVN"))
	CMP.w #64
	BCC .mvn
	JSR core_native_text_words
	BRA .copied
.mvn
endif
	DEC
	PHA                          ; byte count minus one
	TXA
	PHA
	TYX                          ; MVN uses X as source, Y as destination
	PLY
	PLA
	MVN $7E,$7E
	PHX
	TYX
	PLY
.copied
	SEP #$20
	STZ.w $A171
	DEY
	LDA.w $0000,Y
	INY
	XBA
	PLP
	LDA.b #0
	JML $C014DA                  ; native RTS
.reject
	PLA
.native
	SEP #$20
.native8
	PLP
.groups
	LDA.b #$10
.byte
	XBA
	LDA.w $0000,Y
	STA.w $0000,X
	INX
	INY
	XBA
	DEC
	BNE .byte
	DEC.w $A171
	BNE .groups
	JML $C014DA

if not(defined("CORE_NATIVE_TEXT_MVN"))
; A = bounded byte count, X = $9400, Y = disjoint WRAM source. Each pair
; of instructions is six ROM bytes; enter the descending copy at the
; requested length. Fixed destination stores are cheaper than two MVN
; byte iterations. Only stack locals are live across an interrupt.
core_native_text_words:
	PHA
	CLC : ADC.w #$9400 : TAX
	LDA $01,S
	ASL : CLC : ADC $01,S                  ; three code bytes per data byte
	EOR.w #$FFFF
	CLC : ADC.w #.end                      ; RTS target minus one
	PHA : RTS
	for word = 0..448
		!offset #= (447-!word)*2
		LDA.w !offset,Y
		STA.w $9400+!offset
	endfor
.end
	TYA : CLC : ADC $01,S : TAY
	PLA
	RTS
endif

; C0:1539 combines two halves of an outlined glyph with its window pattern.
; (~even & pattern) | even == pattern | even for the even plane; retain
; the original mask for the odd plane. Unroll the two eight-row halves.
; Bounds keep the sources/destinations disjoint and pattern indexes from
; wrapping; other inputs retain the original loop. The native return has
; B = high(Y_entry+32), A = final odd byte, X = pattern+16, Y += 48, C/Z=1,
; N/V=0. No scratch or DMA is needed.
core_native_text_paint:
	PHP
	LDA $01,S
	BIT.b #$18
	BNE .native8
	PHB
	PLA
	CMP.b #$7E
	BNE .native8
	REP #$20
	CPY.w #$03D1
	BCS .native
	LDA.w $A182
	CMP.w #$7F81
	BCC .fast
.native
	SEP #$20
.native8
	PLP
	LDA.b #8
	STA.w $A175
	JML $C0153E
.fast
	TAX
	SEP #$20
	PLP
	for half = 0..2
		for row = 0..8
			!offset #= (!half*32)+(!row*2)
			LDA.w $9400+!offset,Y
			EOR.b #$FF
			AND.l $D2D481+(!row*2),X
			ORA.w $9401+!offset,Y
			STA.w $9001+!offset,Y
			LDA.w $9400+!offset,Y
			ORA.l $D2D480+(!row*2),X
			STA.w $9000+!offset,Y
		endfor
	endfor
	REP #$20
	TXA : CLC : ADC.w #16 : TAX
	TYA : CLC : ADC.w #32
	PHA
	CLC : ADC.w #16 : TAY
	PLA
	SEP #$20
	LDA.w $8FFF,Y
	STZ.w $A175
	CLV
	SEC
	SEP #$02
	REP #$80
	JML $C0159D

; C0:15B9 expands 32 monochrome 8x12 glyphs into 2bpp tiles, then adds
; their vertical outline. Fuse the two passes: the even plane is the OR of
; the row and its vertical neighbours; the odd plane is the unchanged row.
; The source and destination do not overlap. Every native tile byte remains.
; As with the byte copy, restore C/V and return the last source byte in B.
core_native_text_glyphs:
	PHP
	LDA $01,S
	BIT.b #$18
	BNE .native8
	PHB
	PLA
	CMP.b #$7E
	BEQ .fast
.native8
	PLP
	LDX.w #0
	LDY.w #0
	JML $C015BF
.fast
	LDX.w #0
	LDY.w #0
	LDA.b #32
	STA.w $A176
.glyph
	REP #$20
	LDA.w #0
	STA.w $9400,X
	STA.w $9402,X
	STA.w $941C,X
	STA.w $941E,X
	SEP #$20
	LDA.w $9000,Y
	STA.w $9402,X
	LDA.w $900B,Y
	STA.w $941C,X
	for row = 0..12
		LDA.w $9000+!row,Y
		STA.w $9405+(!row*2),X
		if !row > 0
			ORA.w $8FFF+!row,Y
		endif
		if !row < 11
			ORA.w $9001+!row,Y
		endif
		STA.w $9404+(!row*2),X
	endfor
	REP #$20
	TXA : CLC : ADC.w #32 : TAX
	TYA : CLC : ADC.w #12 : TAY
	SEP #$20
	DEC.w $A176
	BEQ +
	BRL .glyph
+	DEY
	LDA.w $9000,Y
	INY
	XBA
	PLP
	LDA.b #0
	JML $C0162B

; C0:162C adds the horizontal outline. Retail ROL deliberately consumes
; the preceding row's carry (and the caller's carry for the first row).
; Preserve it through pointer arithmetic as well as at entry. B returns
; the last outlined byte, rather than the last source byte.
core_native_text_outline:
	PHP
	LDA $01,S
	BIT.b #$18
	BNE .native8
	PHB
	PLA
	CMP.b #$7E
	BEQ .fast
.native8
	PLP
	LDX.w #0
	LDY.w #0
	JML $C01632
.fast
	PLP
	LDX.w #0
	LDY.w #0
	LDA.b #32
	STA.w $A176
.glyph
	for row = 0..12
		LDA.w $9000+!row,Y
		ROL
		ORA.w $9404+(!row*2),X
		STA.w $9404+(!row*2),X
		LDA.w $9000+!row,Y
		LSR
		ORA.w $9404+(!row*2),X
		STA.w $9404+(!row*2),X
	endfor
	PHP
	REP #$20
	TXA : CLC : ADC.w #32 : TAX
	TYA : CLC : ADC.w #12 : TAY
	SEP #$20
	PLP
	DEC.w $A176
	BEQ +
	BRL .glyph
+	LDA.w $93FA,X
	XBA
	LDA.b #0
	JML $C01662

; C0:1BC0 exchanges a window tile and requests its upload. Keep the native
; address calculation (including decimal/overflow behavior), then mark the
; same WRAM request bits before restoring DB. This avoids the second bank
; switch and accumulator/stack shuffling in C0:0FFA for every window cell.
; Return A/B/C depend on the native window flags; PLB supplies final N/Z.
core_native_window_cell:
	PHB
	PHY
	LDA.b #$7E
	PHA
	PLB
	LDA.b #0
	XBA
	LDA.w $A156
	DEC
	REP #$20
	ASL : ASL : ASL : ASL : ASL
	ADC.w $A157
	ASL
	CLC
	ADC.w #$9C00
	TAY
	LDA.w $0000,Y
	PHA
	TXA
	EOR.w #$2000
	STA.w $0000,Y
	PLA
	AND.w #$DFFF
	TAX
	SEP #$20
	LDA.b #$44
	TSB.w $1D12
	LDA.w $1D05
	CMP.b #7
	BEQ .request
	LDA.w $A187
	BIT.b #1
	BNE .request
	LDA.w $A162
	CMP.b #1
	BEQ .defer
.request
	XBA
	LDA.b #$44
	TSB.w $1D04
	BRA .restore
.defer
	XBA
	LDA.b #$44
	XBA
.restore
	PLY
	PLB
	JML $C01BF6

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

; C0:C148's two native JSRs. The tilemap routine is position independent;
; keep a byte-identical local copy to avoid its RTS bank bridge. The HUD
; routine uses bank $80's identical mapping and returns through B294's RTL.
core_native_field_uploads:
	; Keep the measured airborne schedule while its CPU peaks remain open.
	; A is dead here: C692 writes its low byte and C238 replaces both bytes
	; before either can use it. BIT immediate preserves carry and overflow.
	LDA.l !RAM_FLIGHT
	BIT.w #1
	BNE .air
	JSR core_native_tilemap_uploads
	PEA $B294-1
	JML $80C238
.air
	PHK
	PER .air_hud-1
	PEA $B294-1
	JML $00C692
.air_hud
	PEA $B294-1
	JML $00C238

; C0:C692-C7C2 has only internal relative branches, absolute I/O and DP
; WRAM accesses. Copy the verified cartridge bytes, including the RTS;
; no graphics transfer or register write is omitted or reordered.
core_native_tilemap_uploads:
assert read4($C0C692) == $10C220E2, "native tilemap upload entry changed"
assert read3($C0C7C0) == $602E64, "native tilemap upload return changed"
for offset = 0..$0131
	db read1($C0C692+!offset)
endfor

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
; register restoration bring the bound below 16 lines. Sampling <=176
; therefore finishes before the native line-196 HUD IRQ and line-225 NMI.
; No interrupt is masked and no channel configuration survives the copy.
; Later scanlines, scene/load work, other vectors and HDMA channel 7 keep
; the interruptible CPU copy. M16/X16, any DB/D; preserves X/Y.
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
	CMP.w #177
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS

; C1:C599: common death and weapon sheets. All three retail
; colour encodings were expanded at build time. Copy into the original
; buffer with an early-field DMA or interruptible word copy, preserving the
; decoder's registers, flags, direct-page outputs and DB.
; Unknown sources, sizes, destinations and decimal mode use retail code.
macro core_native_tiles_path(name, next, bank, source, tiles, destination, data, mask)
assert ((<data>&$FFFF)+(<tiles>*32*3)) <= $10000, "native graphics variants cross the source bank"
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
if defined("CORE_NATIVE_GRAPHICS_MVN")
	LDA.w #((<tiles>*32)-1)
	MVN $7E,(<data>>>16)
else
	; The caller's DB is already saved. Read words from the expanded sheet
	; and write directly to WRAM; the epilogue reconstructs X/Y/A/flags.
	SEP #$20
	LDA.b #(<data>>>16)
	PHA : PLB
	REP #$20
	PHX : TYX : PLY              ; X = WRAM destination, Y = ROM source
if <tiles> == 50
	JSR core_native_graphics_words_1600
elseif <tiles> == 64
	JSR core_native_graphics_words_2048
else
	error "unsupported native graphics copy size"
endif
endif
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

if not(defined("CORE_NATIVE_GRAPHICS_MVN"))
; Fixed, disjoint ROM -> WRAM copies. Descending offsets let the 1600-byte
; death sheet share the tail of the 2048-byte weapon copy. Each pair costs
; 12 CPU cycles instead of MVN's 14, and remains interruptible throughout.
; M16/X16, DB = expanded sheet bank, Y = source, X = destination.
core_native_graphics_words_2048:
	for word = 0..1024
		!offset = 2046-(!word*2)
		if !offset == 1598
core_native_graphics_words_1600:
		endif
		LDA.w !offset,Y
		STA.l $7E0000+!offset,X
	endfor
	RTS
endif

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
