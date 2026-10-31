; Native C0:151A / C0:1521: fourteen two-half pattern paints each. Core's
; single-call painter spends its checks and return setup again for every call;
; these fixed-page batches share them and use absolute row addresses. Every
; output word is the same: low = pattern | glyph, high = (pattern & ~even) |
; odd. Other DB/width/decimal/style inputs retain the retail outer loop.
macro story_text_batch(base)
	PHP
	LDA $01,S
	BIT.b #$18
	BNE ?retail
	PHB
	PLA
	CMP.b #$7E
	BNE ?retail
	REP #$20
	LDA.w $A182
	CMP.w #$7F81
	SEP #$20
	BCC ?fast
?retail
	PLP
	LDY.w #<base>
	LDA.b #14
	JML $C01526
?fast
	PLP
	REP #$20
	for block = 0..14
		LDX.w $A182
		for half = 0..2
			for row = 0..8
				!offset #= <base>+(!block*64)+(!half*32)+(!row*2)
				LDA.w $93FF+!offset
				ORA.w #$00FF
				EOR.w #$FF00
				AND.l $D2D480+(!row*2),X
				ORA.w $9400+!offset
				STA.w $9000+!offset
			endfor
		endfor
	endfor
	SEP #$20
	STZ.w $A175
	LDX.w $A182
	REP #$20
	TXA
	CLC
	ADC.w #16
	TAX
	LDY.w #<base>+896
	TYA
	SEP #$20
	LDA.b #0
	CLC
	CLV
	JML $C01538
endmacro

story_native_text_batch0:
	%story_text_batch(0)
story_native_text_batch1:
	%story_text_batch(16)
