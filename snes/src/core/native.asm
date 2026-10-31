; Exact replacements for hot retail helpers. No actor scheduling changes.

incsrc "core-math/data.asm"

; C1:D14A: a pair with neither attack box runs no overlap tests. Retail
; XORs the direction word twice on this path; omit both inversions and
; the intervening width changes. The distance/actor metadata written by
; CE72-CF19 is still required and is never skipped. Preserve full A/P,
; including the native final LDA/EOR's N/Z and untouched carry/overflow.
core_native_contact_empty:
	REP #$20
	LDA.w $E0C2,X
	BNE .first
	LDA.w $E0C2,Y
	BNE .second
	LDA $06
	JML $81D284
.first
	JML $81D154
.second
	LDA $06
	EOR.w #$8080
	STA $06
	LDA.w $E0C2,Y
	JML $81D206

; Native target visibility. Inline the height subtraction only after the
; active/self/horizontal tests pass. CMP replaces the height helper's N/Z,
; while PHP/PLP retains its C/V and width contract. Rejected actors do not
; pay for a bank handoff. Both call sites enter with M16.
macro core_native_visible_height(name, continuation)
<name>:
	PHP
	LDA.w $0045,X
	AND.w #$00FF
	EOR.w #$FFFF
	INC
	CLC
	ADC.w $0022,X
	PLP
	CMP.w #224
	JML <continuation>
endmacro
%core_native_visible_height(core_native_visible, $C1053D)
%core_native_visible_height(core_native_target_visible, $C10568)

; C0:5AA7: a status-effect request with no bits set emits no commands.
; Avoid sixteen empty bit tests while retaining the original scratch,
; A/C/V and saved-register epilogue. Nonempty masks use the retail loop.
core_native_status_empty:
	REP #$20
	LDA $D8
	BNE .native
	LDA.w #$FFFF
	STA $D0
	STZ $CC
	SEP #$20
	LDA.b #$C0
	STA $B6
	REP #$20
	LDA.w #1
	CLV
	SEC
	JML $C05AC7
.native
	LDA.w #15
	JML $C05AAC

; C8:E301 with no current status, previous status or pending bits: the full
; helper only clears $98/$A6, stores ~$E1AA in $A4 and returns A = 0 with
; M8/N0/Z1/C1. Keep those scratch and flag results (including the retail
; CMP's carry), without its repeated masks and branches. Any nonzero input
; redoes the replaced STZ and rejoins at E305, whose LDA $9A restores A/NZ.
core_native_status_idle:
	REP #$20
	LDA.w $E190,X
	ORA.w $E1EE,X
	ORA $9A
	BNE .native
	STZ $98
	STZ $A6
	LDA.w $E1AA,X
	EOR.w #$FFFF
	STA $A4
	SEC
	LDA.w #$0000
	SEP #$20
	RTL
.native
	STZ $98
	JML $C8E305

; C1:E05A: the actor palette's fixed fifteen-word copy. X/Y are restored
; immediately afterwards, so offset operands replace their increments.
; Retain the original loop for narrow indexes, unusual counters or index
; wrap; only its usual full copy takes the straight-line path.
core_native_palette:
	PHP
	LDA $01,S
	BIT.w #$0010
	BNE .native
	CPX.w #$FFE4
	BCS .native
	CPY.w #$FFE4
	BCS .native
	LDA $00
	CMP.w #15
	BEQ .copy
.native
	PLP
	LDA.l $C81000,X
	STA.w $0700,Y
	JML $81E061
.copy
	PLP
	for word = 0..15
		LDA.l $C81000+(!word*2),X
		STA.w $0700+(!word*2),Y
		STA.w $DF00+(!word*2),Y
	endfor
	STZ $00
	JML $81E06C

; C1:16F4 selects 0..(script argument & 15) by rejecting random nibbles.
; Keep the exact RNG draws/state and result, but inline the byte generator
; inside that loop instead of repeating its three wrapper stack frames.
; The native RNG's index, 15 state bytes and $03CC scratch are unchanged.
; Decimal and eight-bit-index callers retain the original routine.
core_native_ai_random:
	PHD
	PHP
	REP #$20
	LDA $01,S
	BIT.w #$0018
	BEQ .fast
	JML $C116F8
.fast
	PHB
	TSC
	TCD
	SEP #$20
	PHY
	LDX.w $0144,Y
	LDA.l $D04F16,X
	AND.b #$0F
	BEQ .done
	STA $01
	PHX
	PHB
	LDA.b #$7E
	PHA
	PLB
	SEP #$10
.roll
	LDX.w $03F0
	LDA.w $03F1,X
	STA.w $03CC
	DEX
	BPL +
	LDX.b #14
+	LDA.w $03F1,X
	CLC
	ADC.w $03CC
	STA.w $03F1,X
	XBA
	INC.w $03F0
	LDA.b #15
	CMP.w $03F0
	BNE +
	STZ.w $03F0
+	XBA
	AND.b #$0F
	CMP $01
	BEQ .accepted
	BCS .roll
.accepted
	REP #$10
	PLB
	PLX
.done
	PLY
	STA $01,S
	PLA
	PLP
	PLD
	JML $C1171C

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

; C1:0404: native actor pursuit direction and minor-axis distance. Keep
; retail's unsigned differences, height adjustment and unusual >255 wrap.
; The byte lookup combines major-axis/diagonal tests and the distance's
; high nibble. The two 256-magnitude edges, decimal and X8 use retail.
core_native_direction:
	PHD
	PHP
	REP #$20
	LDA $01,S
	BIT.w #$0018
	BEQ .fast
	JML $C10408
.fast
	TSC
	SEC
	SBC.w #14
	TCD
	TCS
	STZ $0B
	LDA.w $0020,X
	SEC
	SBC.w $0020,Y
	BCS +
	EOR.w #$FFFF
	INC
	PHA
	LDA.w #3
	STA $0B
	PLA
+	BIT.w #$FF00
	BEQ +
	ORA.w #$FF00
	EOR.w #$FFFF
	INC
	PHA
	LDA $0B
	EOR.w #3
	STA $0B
	PLA
+	STA $01
	LDA.w $0045,Y
	AND.w #$00FF
	EOR.w #$FFFF
	SEC
	ADC.w $0022,Y
	STA $0D
	LDA.w $0045,X
	AND.w #$00FF
	EOR.w #$FFFF
	SEC
	ADC.w $0022,X
	SEC
	SBC $0D
	BCS +
	EOR.w #$FFFF
	INC
	PHA
	LDA $0B
	ORA.w #12
	STA $0B
	PLA
+	BIT.w #$FF00
	BEQ +
	ORA.w #$FF00
	EOR.w #$FFFF
	INC
	PHA
	LDA $0B
	EOR.w #12
	STA $0B
	PLA
+	STA $05
	ORA $01
	BIT.w #$FF00
	BNE .retail
	LDA $05
	XBA
	ORA $01
	PHX
	TAX
	BMI .high
	LDA.l core_direction_low,X
	BRA .found
.high
	LDA.l core_direction_high-$8000,X
.found
	AND.w #$00FF
	PHA
	AND.w #3
	ASL
	TAX
	LDA.l core_direction_masks,X
	STA $03
	LDA $0B
	EOR.w #5
	ASL
	TAX
	LDA.l core_direction_repeat,X
	AND $03
	STA $03
	PLA
	AND.w #$00F0
	XBA
	ORA $03
	PLX
	JML $C104C7
.retail
	LDA $05
	JML $C1046B
core_direction_masks:
	dw $03F3, $0CFC, $03FF, $0CFF
core_direction_repeat:
	for dir = 0..16
		dw !dir*$111
	endfor

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
; the original mask for the odd plane. Unroll the two eight-row halves,
; each row one 16-bit pass (CORE_NATIVE_TEXT_PAINT16_SLOW: two 8-bit ones).
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
if not(defined("CORE_NATIVE_TEXT_PAINT16_SLOW"))
	; Both planes of a row as one word: low byte even | pattern even, high
	; byte odd | (pattern odd & ~even). The word ending at each even byte
	; puts ~even into the high byte (the destination block lies below the
	; source, so that byte is never one this pass writes).
	REP #$20
	for half = 0..2
		for row = 0..8
			!offset #= (!half*32)+(!row*2)
			LDA.w $93FF+!offset,Y
			ORA.w #$00FF
			EOR.w #$FF00
			AND.l $D2D480+(!row*2),X
			ORA.w $9400+!offset,Y
			STA.w $9000+!offset,Y
		endfor
	endfor
else
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
endif
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
if defined("CORE_NATIVE_UPLOADS_AIR_SLOW")
	; Keep the measured airborne schedule while its CPU peaks remain open.
	; A is dead here: C692 writes its low byte and C238 replaces both bytes
	; before either can use it. BIT immediate preserves carry and overflow.
	LDA.l !RAM_FLIGHT
	BIT.w #1
	BNE .air
endif
	; (airborne too: the bank-$00 timing kept for flight is judged by the
	; start-phase sums now, not by one long run's chaotic count)
	JSR core_native_tilemap_uploads
	PEA $B294-1
	JML $80C238
if defined("CORE_NATIVE_UPLOADS_AIR_SLOW")
.air
	PHK
	PER .air_hud-1
	PEA $B294-1
	JML $00C692
.air_hud
	PEA $B294-1
	JML $00C238
endif

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
	BCC .native_ready          ; small bodies retain the native loop
	PHP
	PLA
	AND.b #$08
	BNE .native_ready
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
if not(defined("CORE_NATIVE_EMITTER_RELOAD_SLOW"))
	; The capacity check above (or at .loop) already passed. Y can hold
	; the temporary interior X anchor here, so reload it exactly once.
	LDY $7C
.native_ready
	JML $80E649
else
.native_ready
	JML $80E640
endif
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

; A ROM -> WMDATA DMA may run only in safe ordinary native field windows.
; The fixed transfer is <= 2048 bytes (12.1 scanlines); setup and
; register restoration bring the bound below 16 lines. Sampling <=176
; finishes before the native line-196 HUD IRQ; sampling 198..206 finishes
; past that IRQ's line and before the line-225 NMI. Never wait for a
; window: intervening and late scanlines keep the interruptible CPU copy.
; No interrupt is masked and no channel configuration survives the copy.
; Later scanlines, scene/load work, other vectors and any running HDMA keep
; the interruptible CPU copy: on revision-1 S-CPUs an HDMA transfer during
; a general-purpose DMA can hang the console, so the DMA needs every
; channel off (the HDMAEN the last field vblank wrote, and the game's
; shadow). M16/X16, any DB/D; preserves X/Y.
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
	LDA.l !core_hdmaen
	ORA.l $7E002C
	AND.w #$00FF
	BNE .no
	JSR core_vcount
	CMP.w #177
	BCC .yes
	CMP.w #198
	BCC .no
	CMP.w #207
	BCS .no
.yes
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
; Dead F9 enemies with no weapon attachment omit the unused weapon-0
; buffer write. Their body animation is unchanged; treasure/spawn setup
; reloads the weapon buffer before reusing the slot.
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
if <bank> == $D4 && <source> == $0000
if not(defined("CORE_NATIVE_DEATH_WEAPON_SLOW"))
	; The ordinary F9 death animation uses only its body sheet. Native
	; weapon setup has already retired its attachment; preserve that setup
	; and this decoder's return state without copying an unused 2 KiB sheet.
	; Other death types, live actors and visible weapons retain the copy.
	LDX $02
	CPX.w #$0600
	BCC .weapon_needed
	LDA.l $7EE180,X
	AND.w #$00FF
	CMP.w #$00F9
	BNE .weapon_needed
	LDA.l $7EE190,X
	BPL .weapon_needed
	LDA.l $7EE084,X
	AND.w #$00FF
	BNE .weapon_needed
.weapon_unused
	BRL .copied
.weapon_needed
endif
endif
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

; C2:0E83's 77 object-name bytes, M8/X8. Each write remains a separate CPU
; store to WMDATA, so the routine has exactly the retail VRAM side effects and
; is safe wherever the original ran (including forced blank and HDMA users).
; Unrolling removes only the branch/counter overhead; it stays interruptible.
core_native_obj_names:
	LDY.b #$00
	for byte = 0..77
		LDA [$76],Y
		STA.l $002180
		INY
	endfor
	CPY.b #$4D                       ; the original failed branch's flags
	JML $C20E90

if not(defined("CORE_NATIVE_DECOMPRESS_SLOW"))
; C2:24F1, the native WRAM graphics bit decoder. Hydra's transformation
; decodes 2,048 bytes from DB:D989 into 7F:7000 (a three-video-frame stall).
; That fixed stream is predecoded by combat-decompress.mjs. Copy its 2,049
; touched bytes directly, then reproduce the retail exit state. Any other
; source, destination, count or initial history uses the original loop.
; JML from the first five bytes, M16/X16, direct page and DB unchanged.
core_native_decompress:
	LDA $68
	CMP.w #2048
	BNE .retail
	LDA $79
	CMP.w #$D989
	BNE .retail
	LDA $7A
	CMP.w #$DBD9
	BNE .retail
	LDA $7C
	CMP.w #$7000
	BNE .retail
	LDA $7D
	CMP.w #$7F70
	BNE .retail
	LDA $6A
	ORA $6C
	BNE .retail
	JML combat_native_hydra_copy
.retail
	SEP #$10
	CLC
	LDA $68
	JML $C224F6
endif

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

; Damage and death always retain full native AI service. Other healthy actors
; use phase one of four while local flight is active; ground behavior stays
; exact for launch and deflection.
core_ai_cadence:
	LDA.w $E1F1,X
	BNE .service                 ; damage always keeps the full cadence
	LDA.w $E190,X
	BMI .service                 ; and death/launch processing
	LDA.w $D900
	AND.b #1
	BEQ .service
	LDA $F4
	AND.b #$03
	CMP.b #$01
	BNE .skip
.service
	JML $81D942
.skip
	RTL

; C1:2457's party-target setup: the healthy party's usual empty target masks
; select nobody. Recognize that result without three status scans and three
; complete target selections. The first mask names Goku, but his action is not
; the targetable $02 (or his $1C flags forbid it); the other masks are empty.
; Rejoin at 249D with the same X and frame local as the failed third selection.
; Every other state repeats the replaced load and takes the retail loop.
core_native_ai_party_setup:
	LDA.w $E190
	ORA.w $E390
	ORA.w $E590
	AND.w #$C57B
	BNE .native
	LDA.l $0000D9
	AND.w #$0007
	CMP.w #$0001
	BNE .native
	SEP #$20
	LDA.w $E011
	CMP.b #$02
	BNE .noGoku
	LDA.w $E01C
	BEQ .native
.noGoku
	LDA.l $0000DA
	ORA.l $0000DB
	AND.b #$07
	BNE .native
	LDX.w #$0000
	STZ $01
	JML $C1249D
.native
	REP #$20
	LDA.w $0190,X
	JML $C1246C

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

; C0:BCCC (the field frame's OAM reset, from B0A0) clears the 32-byte high
; table with STZ $0800,X for X = $0200-$021E, two bytes a pass, in the slow
; bank $00. The same stores from FastROM, unrolled; the loop's exit state
; stays: X = $0220, carry and zero set, negative clear, V and A untouched.
; M16/X16 (BCCC's REP #$30); the caller's DB, as the absolute stores use.
if not(defined("CORE_NATIVE_HICLEAR_SLOW"))
core_native_hiclear:
	for word = 0..16
		STZ.w $0A00+(!word*2)
	endfor
	LDX.w #$0220
	CPX.w #$0220
	RTL
endif

if not(defined("CORE_NATIVE_TEXT_SLOW")) && not(defined("CORE_NATIVE_WINDOW_WIPE_SLOW"))
; C0:091A-092A, opening a native window: STZ $9400 (M8, DB-relative), then
; REP #$20 / LDA #$06FF / LDX #$9400 / LDY #$9401 / MVN $7E,$7E spreads that
; byte over $7E:9401-$9B00: 1,792 bytes at 7 cycles each, about 60
; scanlines. With DB = $7E the byte is zero: store the same zero words, 128
; a pass, and leave MVN's exit state (A = $FFFF, X = $9B00, Y = $9B01,
; DB = $7E, C/V as before, N set and Z clear). Another DB keeps the MVN.
; JSL from C0:091D (M8/X16); BRA $092B follows.
core_native_window_wipe:
	REP #$20
	PHP
	PHB
	SEP #$20
	PLA
	CMP.b #$7E
	REP #$20
	BEQ +
	JMP core_window_wipe_retail
+	LDX.w #$0600
core_window_wipe_page:
	for word = 0..128
		STZ.w $9400+(!word*2),X
	endfor
	TXA
	SEC
	SBC.w #$0100
	TAX
	BMI +
	JMP core_window_wipe_page
+	SEP #$20
	STZ.w $9B00
	REP #$20
	BRA core_window_wipe_done
core_window_wipe_retail:
	LDA.w #$06FF
	LDX.w #$9400
	LDY.w #$9401
	MVN $7E,$7E
core_window_wipe_done:
	PLP
	LDA.w #$FFFF                 ; (retail's last load, LDY #$9401, left
	LDX.w #$9B00                 ; N set and Z clear, as these do)
	LDY.w #$9B01
	RTL
endif

if not(defined("CORE_NATIVE_TEXT_SLOW")) && not(defined("CORE_NATIVE_WINDOW_ROWS_SLOW"))
; C0:07F9 draws a native window's two border rows: for each of $A164 cells
; it calls the cell writer C0:1BC0 (core_native_window_cell) at row $A156,
; column $A157, then advances the column (eight bits) and counts $A164 down
; to zero. Every call makes the same requests ($1D12, and $1D04 as $1D05,
; $A187 and $A162 decide; the row does not touch them) and returns the same
; A high byte, carry and V; only its tile word differs. A row that stays in
; the tile buffer $9C00-$9FFF without its column wrapping, with DB = $7E and
; binary mode, is written in one pass, its requests made first.
; core_window_fill: M8/X16, X = the row's cell. Filled: V clear, X = cell,
; A's high byte and carry as the writer's last call, $A157 advanced,
; $A164 = 0, Y and DB kept. Otherwise V set: the retail loop runs (it sets
; A, X and carry itself).
core_window_fill:
	PHB
	PHP
	LDA $01,S
	AND.b #$08                   ; decimal mode: the retail address math
	BNE core_window_fill_retail
	LDA $02,S
	CMP.b #$7E
	BNE core_window_fill_retail
	LDA.w $A164
	BEQ core_window_fill_retail  ; zero counts 256 passes
	CLC
	ADC.w $A157
	BCC core_window_fill_go
	BEQ core_window_fill_go      ; a row ending exactly at column $FF
core_window_fill_retail:
	PLP
	PLB
	SEP #$40
	RTS
core_window_fill_go:
	PHA                          ; S: newcol P B
	PHY                          ; S: Y newcol P B
	PHX                          ; S: cell Y newcol P B
	; the writer's address for the first cell (binary mode, DB = $7E)
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
	CMP.w #$9C00
	BCC .retail_xya
	TAY                          ; the first cell
	LDA.w $A164
	AND.w #$00FF
	TAX                          ; cells
	ASL
	PHY
	CLC
	ADC $01,S                    ; the row's end
	PLY
	CMP.w #$A001
	BCS .retail_xya
	SEP #$20
	LDA $05,S                    ; the column after the row
	STA.w $A157
	STZ.w $A164
	; the writer's requests, A and carry, once
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
	BRA .fill
.defer
	XBA
	LDA.b #$44
	XBA
.fill
	REP #$20
	PHA                          ; S: A cell Y newcol P B
	LDA $03,S
	EOR.w #$2000                 ; the writer's tile word
-	STA.w $0000,Y
	INY
	INY
	DEX
	BNE -
	PLA
	SEP #$20
	PLX
	PLY
	PLB                          ; (newcol)
	PLB                          ; (P)
	PLB
	CLV
	RTS
.retail_xya
	SEP #$20
	PLX
	PLY
	PLA
	JMP core_window_fill_retail

; JSL from C0:0806 in place of LDA $A16C / STA $A164; the retail PHA and
; BVC $081D follow. Returns A = $A16C for the PHA.
core_native_window_row1:
	LDA.w $A16C
	STA.w $A164
	LDX.w #$0120
	JSR core_window_fill
	LDA.w $A16C
	RTL
; JSL from C0:0822 in place of STA $A157 / INC $A156; BVC $0838 follows.
core_native_window_row2:
	STA.w $A157
	INC.w $A156
	LDX.w #$8120
	JSR core_window_fill
	RTL
endif

if not(defined("CORE_NATIVE_CONTACTS_SLOW"))
; C1:CE20-CE58: a party member's contact pass over the enemy slots
; $0600/$0800/$0A00 while $ED bit 7 is set (C1:CDCD for X = 0, $200, $400,
; once per field frame). For each active enemy on the member's layer whose
; terrain bits do not both differ, C1:CE62 writes the reach (E089 & 3) * 4
; + 10 to $04/$05, the wrapped x/y distances to $0A-$0C, their distances
; past the reach (x) or 8 (y), capped at $80, to $08/$09 and the slot's
; $E050/$E053/$E056 word, the direction bits ($06/$07: $80 for one of
; negative or wrapped, $E052/$E055/$E058: x $40, y $80); a pair out of
; range ($80 either way, or 24 px after the attack-box test) clears the
; member's two touch bits in $E04E and sets $00 to its bit. $50 starts at
; $11 and shifts once a slot; the loop leaves A = Y = $0C00, V clear and
; shifts $51 (C1:CE54). Unrolled per slot with each member's constants.
; The attack-box test (C1:D14A) has no effect while neither box exists;
; with a box, or within 24 px both ways, the retail rest of the pair runs
; from C1:CF38 or CF4D and returns to the next slot. Another member, an
; 8-bit index or decimal mode take the whole retail loop (C1:CE26). JML
; from C1:CE20 in place of SEP #$20 / LDA #$11 / STA $50.
macro core_contacts_qx()
	CMP $04
	BCC ?zero
	SBC $04
	CMP.w #$0080
	BCC ?keep
	LDA.w #$0080
	BRA ?keep
?zero:
	LDA.w #$0000
?keep:
	STA $08                      ; ($09 = 0 until the y distance)
endmacro
macro core_contacts_qy(k)
	CMP.w #$0008
	BCC ?zero
	SBC.w #$0008
	CMP.w #$0080
	BCC ?keep
	LDA.w #$0080
	BRA ?keep
?zero:
	LDA.w #$0000
?keep:
	XBA                          ; y << 8 (at most $80)
	ORA $08
	STA $08
	STA.w $E050+<k>,Y
endmacro
; The pair at slot Y for member X (C1:CE62-CF37). JSR, M8; returns M8.
macro core_contacts_pair(k, bit)
	LDA.w $E089,Y
	AND.b #$03
	ASL
	ASL
	ADC.b #$0A                   ; (carry clear after the shifts)
	STA $04
	STZ $05
	REP #$20
	LDA.w $E002,X
	SEC
	SBC.w $E002,Y
	BMI ?xn
	CMP $18
	BCC ?x0
	EOR.w #$FFFF
	SEC
	ADC $C0
	BRA ?x1
?xn:
	EOR.w #$FFFF
	INC
	CMP $18
	BCC ?x1
	EOR.w #$FFFF
	SEC
	ADC $C0
?x0:
	STA $0A
	%core_contacts_qx()
	STZ $06
	BRA ?y
?x1:
	STA $0A
	%core_contacts_qx()
	LDA.w #$0080
	STA $06
?y:
	LDA.w $E004,X
	SEC
	SBC.w $E004,Y
	BMI ?yn
	CMP $1A
	BCC ?y0
	EOR.w #$FFFF
	SEC
	ADC $C2
	BRA ?y1
?yn:
	EOR.w #$FFFF
	INC
	CMP $1A
	BCC ?y1
	EOR.w #$FFFF
	SEC
	ADC $C2
?y0:
	STA $0B
	%core_contacts_qy(<k>)
	SEP #$20
	LDA $06
	LSR
	BRA ?dir
?y1:
	STA $0B
	%core_contacts_qy(<k>)
	SEP #$20
	LDA.b #$80
	STA $07
	LDA $06
	LSR
	ORA.b #$80
?dir:
	STA.w $E052+<k>,Y
	LDA $08
	ORA $09
	BMI ?clear                   ; out of range either way
	REP #$20
	LDA.w $E0C2,X
	ORA.w $E0C2,Y
	BNE ?box                     ; an attack box: overlap tests
	LDA $08
	CLC
	ADC.w #$6868                 ; bit 7 of a byte: that distance >= 24
	AND.w #$8080
	BEQ ?near                    ; within 24 px both ways: the near tests
	SEP #$20
?clear:
	LDA.b #<bit>
	STA $00
	LDA.w $E04E,Y
	AND.b #(<bit>|(<bit><<3))^$FF
	STA.w $E04E,Y
	RTS
?box:
	JMP core_contacts_box
?near:
	JMP core_contacts_near
endmacro
macro core_contacts_slot(slot, pair)
	LDY.w #<slot>
	LDA.w $E000,Y
	BEQ ?next
	BMI ?next
	LDA.w $E00B,X
	EOR.w $E00B,Y
	BMI ?next
	AND.b #$03
	CMP.b #$03
	BEQ ?next
	JSR <pair>
?next:
	SEP #$20                     ; (a retail rest of the pair may return M16)
	ASL $50
endmacro
macro core_contacts_member(pair)
	%core_contacts_slot($0600, <pair>)
	%core_contacts_slot($0800, <pair>)
	%core_contacts_slot($0A00, <pair>)
	JMP core_native_contacts_done
endmacro
core_native_contacts:
	SEP #$20
	LDA.b #$11
	STA $50
	PHP
	PLA
	BIT.b #$18                   ; 8-bit index or decimal mode
	BNE .retail
	CPX.w #$0000
	BNE +
	JMP core_contacts_m0
+	CPX.w #$0200
	BNE +
	JMP core_contacts_m2
+	CPX.w #$0400
	BNE .retail
	JMP core_contacts_m4
.retail
	JML $81CE26
core_contacts_m0:
	%core_contacts_member(core_contacts_pair0)
core_contacts_m2:
	%core_contacts_member(core_contacts_pair2)
core_contacts_m4:
	%core_contacts_member(core_contacts_pair4)
core_native_contacts_done:
	REP #$20
	LDA.w #$0C00
	TAY
	SEP #$20
	CLV
	JML $81CE54
; The retail rest of a pair: its RTS returns through the RTL at C1:CDCC to
; the slot's JSR return, which moves into an RTL frame. A, B, C, V and N/Z
; as the retail pair has them there: at CF38 (BIT $ED / JSR $D14A) A =
; x | y distances, B = y, C set (CPX); at CF4D (both within 24 px, after an
; empty D14A) B = $07, C clear, V = $ED bit 6.
core_contacts_box:
	REP #$20
	PLA
	PHK
	PHA
	PEA $CDCC-1
	SEP #$20
	LDA $09
	XBA
	LDA $08
	ORA $09
	SEC
	JML $81CF38
core_contacts_near:
	REP #$20
	PLA
	PHK
	PHA
	PEA $CDCC-1
	SEP #$20
	LDA $07
	XBA
	LDA $09
	BIT $ED
	CLC
	JML $81CF4D
core_contacts_pair0:
	%core_contacts_pair(0, $01)
core_contacts_pair2:
	%core_contacts_pair(3, $02)
core_contacts_pair4:
	%core_contacts_pair(6, $04)
endif
