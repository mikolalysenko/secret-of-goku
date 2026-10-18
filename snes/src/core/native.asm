; Exact replacements for hot retail helpers. No actor scheduling changes.

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
