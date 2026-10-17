; Shared helpers for the world module.

; Call a bank-00 routine that ends in RTS from module code: the RTS lands on
; the RTL at 00:BC0A (end of C0:BC01), which returns here. Registers and P
; pass through unchanged in both directions.
macro call00(routine)
	PHK
	PEA ?ret-1
	PEA $BC0A-1
	JML $000000|<routine>
?ret:
endmacro
assert read1($C0BC0A) == $6B, "call00 needs the RTL at C0:BC0A"

; C set while Goku has replaced the boy (the mod's world powers apply).
; Any M/X, any DB; preserves A/X/Y.
world_goku:
	PHP
	SEP #$20
	PHA
	LDA.l !persist_goku_active
	BEQ .no
	PLA
	PLP
	SEC
	RTS
.no
	PLA
	PLP
	CLC
	RTS

; The block is valid once world_title_boot (power-on, reset, title) ran;
; savestates made by other builds can carry anything here. Clears the block
; when the magic word is missing. Any M/X; DB = $7E. Preserves A/X/Y.
world_ram_check:
	PHP
	REP #$30
	PHA
	LDA.w !w_magic
	CMP.w #!WORLD_MAGIC
	BEQ +
	PHX
	JSR world_ram_clear
	PLX
+	PLA
	PLP
	RTS
; M16/X16, DB = $7E: zero the block and stamp the magic word. Clobbers A/X.
world_ram_clear:
	LDX.w #$00FE
-	STZ.w !WORLD_RAM,X
	DEX
	DEX
	BPL -
	LDA.w #!WORLD_MAGIC
	STA.w !w_magic
	RTS

; Z set (BEQ) when the world-flight interrupt vectors are installed
; ($0100 = JML $0088CF). M16, any DB. Clobbers A.
world_vectors:
	LDA.l $7E0100
	CMP.w #$CF5C
	BNE .done
	LDA.l $7E0102
	CMP.w #$0088
.done
	RTS

; Wrapped 12-bit difference: A16 = ((A - X + 2048) & 4095) - 2048 (world
; pixels, signed). M16/X16, DB = $7E.
world_delta:
	STX.w !w_scratch
	SEC
	SBC.w !w_scratch
	CLC
	ADC.w #2048
	AND.w #$0FFF
	SEC
	SBC.w #2048
	RTS

; Signed multiply by a sine: A16 = a (|a| <= 4095), Y16 = s (signed, |s| <=
; 127, i.e. sin * 127) -> A16 = (a * s) >> 7 (signed). Uses the CPU's 8x8
; multiplier, never Mode 7's (HDMA owns it during world flight).
; M16/X16, DB = $7E. Clobbers X, Y, w_scratch+2..+7.
world_mul7:
	LDX.w #$0000                    ; sign
	CMP.w #$8000
	BCC +
	EOR.w #$FFFF
	INC
	INX
+	STA.w !w_scratch+2              ; |a|
	TYA
	CMP.w #$8000
	BCC +
	EOR.w #$FFFF
	INC
	PHA
	TXA
	EOR.w #$0001
	TAX
	PLA
+	SEP #$20
	STA.l $004202                   ; |s|
	LDA.w !w_scratch+2
	STA.l $004203                   ; |s| * a.lo
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	STA.w !w_scratch+4
	SEP #$20
	LDA.w !w_scratch+3
	STA.l $004203                   ; |s| * a.hi
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.w !w_scratch+4
	ASL                             ; bit 7 of the low product -> high byte
	XBA
	AND.w #$00FF
	STA.w !w_scratch+4              ; low product >> 7 (0-253)
	LDA.l $004216
	ASL                             ; high product << 1 (= << 8 >> 7)
	CLC
	ADC.w !w_scratch+4
	CPX.w #$0000
	BEQ +
	EOR.w #$FFFF
	INC
+	RTS

; sin(heading) * 127 for a world heading (10-bit, 1024 per turn): A16 =
; heading -> A16 signed. Cosine: add 256 first. M16/X16. Clobbers X.
world_sin:
	LSR
	LSR
	AND.w #$00FF
	TAX
	LDA.l world_sine,X
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	RTS

; Unsigned divide: A16 = dividend, X16 = divisor (1-255) -> A16 = quotient.
; CPU divider. M16/X16. Clobbers X.
world_div8:
	STA.l $004204
	TXA
	SEP #$20
	STA.l $004206
	REP #$20
	NOP                             ; 16 cycles for the result
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	LDA.l $004214
	RTS
