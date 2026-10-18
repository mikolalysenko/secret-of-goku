; Two opposed horizontal waves, one independent colour per window. W2
; clips the main screen to black; unmasked subscreen BG3/OBJ restore the
; native pixels, otherwise COLDATA supplies the second wave's colour.
; No additional channel or VRAM. Eight-line outlines fit the double buffer.
assert !FX_PBUF_SIZE >= 183, "paired wave table buffer too small"
;
; Direct-page scratch: two 12-byte beam records, then the table writer.
!fxc_one = !d_tiles
!fxc_two = !d_tiles+12
!XC_X = 0
!XC_Y = 2
!XC_LEN = 4
!XC_HW = 6
!XC_SHAPE = 8
!XC_DIR = 10
!fxc_out = !d_tiles+24
!fxc_top = !d_tiles+26
!fxc_bottom = !d_tiles+28
!fxc_line = !d_tiles+30
!fxc_n = !d_tiles+32
!fxc_col = !d_tiles+34
!fxc_pair = !d_tiles+36
!fxc_i = !d_tiles+38
!fxc_count = !d_tiles+40
!fxc_r0 = !d_tiles+42
!fxc_r1 = !d_tiles+44
!fxc_changed = !d_tiles+46

macro fx_dual_key(offset)
	CMP.l !fx_pkey+<offset>
	BEQ ?same
	STA.l !fx_pkey+<offset>
	INC !fxc_changed
?same:
endmacro

fx_poly_dual:
	; Caller checked field, free polygon, map-coordinate blue and taper 36.
	; Release quickly leaves only Goku's wave. Reject that common case
	; before setting up two geometries or touching their cache key.
	LDX.w #0
.seek
	LDA.l !fx_draws+!D_KIND,X
	CMP.w #$0082
	BEQ .candidate
	CMP.w #$0083
	BEQ .candidate
	TXA
	CLC
	ADC.w #16
	TAX
	CMP.l !fx_ndraw
	BCC .seek
	SEC
	RTS
.candidate
	STX !fxc_pair
	LDA.w $0023                  ; preserve native colour math when active
	AND.w #$00FF
	BNE .no
	LDA !d_cur+!C_DIR
	AND.w #$00FF
	DEC
	CMP.w #2
	BCS .no
	LDA.l !fx_pbig
	BIT.w #2
	BNE .no                     ; a large aura still owns both buffers
	LDA !d_cur+!C_A
	BEQ .no
	BMI .no
	STA !fxc_one+!XC_LEN
	LDA !d_cur+!C_B
	BEQ .no
	CMP.w #83
	BCS .no
	STA !fxc_one+!XC_HW
	ASL
	TAX
	LDA.l fx_dual_offsets,X
	STA !fxc_one+!XC_SHAPE
	LDA !d_cur+!C_X
	STA !fxc_one+!XC_X
	LDA !d_cur+!C_Y
	STA !fxc_one+!XC_Y
	LDA !d_cur+!C_DIR
	AND.w #$00FF
	STA !fxc_one+!XC_DIR
	LDX !fxc_pair
	BRA .scan
.no
	SEC
	RTS
.next
	TXA
	CLC
	ADC.w #16
	TAX
.scan
	TXA
	CMP.l !fx_ndraw
	BCS .no
	LDA.l !fx_draws+!D_KIND,X
	CMP.w #$0082
	BEQ +
	CMP.w #$0083
	BNE .next
+	DEC
	AND.w #3
	ASL
	STA !fxc_col                 ; gold 2 / purple 4
	LDA.l !fx_draws+!D_DIR,X
	AND.w #$00FF
	CLC
	ADC !fxc_one+!XC_DIR
	CMP.w #3                     ; opposite horizontal directions
	BNE .next
	LDA.l !fx_draws+!D_C,X
	CMP.w #36
	BNE .next
	LDA.l !fx_draws+!D_A,X
	BEQ .next
	BMI .next
	STA !fxc_two+!XC_LEN
	LDA.l !fx_draws+!D_B,X
	BEQ .next
	CMP.w #83
	BCS .next
	STA !fxc_two+!XC_HW
	LDA.l !fx_draws+!D_X,X
	SEC
	SBC.l !fx_camx
	STA !fxc_two+!XC_X
	LDA.l !fx_draws+!D_Y,X
	SEC
	SBC.l !fx_camy
	STA !fxc_two+!XC_Y
	LDA.l !fx_draws+!D_DIR,X
	AND.w #$00FF
	STA !fxc_two+!XC_DIR
	STX !fxc_pair
	LDA !fxc_two+!XC_HW
	ASL
	TAX
	LDA.l fx_dual_offsets,X
	STA !fxc_two+!XC_SHAPE
	; Cache only a contact pair: both endpoints meet, the palms differ by
	; -3..4 lines, first x in -256..511. These bounds let the complete key
	; (including the native backdrop) fit the existing six words exactly.
	LDA !fxc_two+!XC_Y
	SEC
	SBC !fxc_one+!XC_Y
	CLC
	ADC.w #3
	CMP.w #8
	BCC +
	JMP .no
+	XBA
	ASL : ASL : ASL : ASL
	STA !d_ks
	LDA !fxc_one+!XC_X
	CLC
	ADC.w #256
	CMP.w #768
	BCC +
	JMP .no
+	ORA !d_ks
	STA !d_ks
	LDA !fxc_col
	CMP.w #4
	BNE +
	LDA.w #$0800
	TSB !d_ks
+	LDA !fxc_one+!XC_DIR
	CMP.w #2
	BEQ .leftEnd
	LDA !fxc_one+!XC_X
	CLC
	ADC !fxc_one+!XC_LEN
	STA !d_ks+2
	LDA !fxc_two+!XC_X
	SEC
	SBC !fxc_two+!XC_LEN
	BRA .endCheck
.leftEnd
	LDA.w #$0400
	TSB !d_ks
	LDA !fxc_one+!XC_X
	SEC
	SBC !fxc_one+!XC_LEN
	STA !d_ks+2
	LDA !fxc_two+!XC_X
	CLC
	ADC !fxc_two+!XC_LEN
.endCheck
	CMP !d_ks+2
	BEQ +
	JMP .no
+	STZ !fxc_changed
	LDA !d_ks
	%fx_dual_key(0)
	LDA !fxc_one+!XC_Y
	%fx_dual_key(2)
	LDA !fxc_two+!XC_X
	%fx_dual_key(4)
	LDA !fxc_one+!XC_LEN
	%fx_dual_key(6)
	LDA !fxc_two+!XC_HW
	XBA
	ORA !fxc_one+!XC_HW
	ORA.w #$8000
	%fx_dual_key(8)
	LDA.l $7E0600
	%fx_dual_key(10)
	LDA !fxc_changed
	BNE .build
	LDA.l !fx_pshown
	STA.l !fx_preuse
	BRA .shown
.build
	; Union of visible scanlines. No more than 28 eight-line entries,
	; two boundary runs and a neutral guard: at most 183 bytes total.
	LDA !fxc_one+!XC_Y
	SEC
	SBC !fxc_one+!XC_HW
	STA !fxc_top
	LDA !fxc_two+!XC_Y
	SEC
	SBC !fxc_two+!XC_HW
	CMP !fxc_top
	BPL +
	STA !fxc_top
+	LDA !fxc_top
	BPL +
	STZ !fxc_top
+	LDA !fxc_one+!XC_Y
	CLC
	ADC !fxc_one+!XC_HW
	STA !fxc_bottom
	LDA !fxc_two+!XC_Y
	CLC
	ADC !fxc_two+!XC_HW
	CMP !fxc_bottom
	BMI +
	STA !fxc_bottom
+	LDA !fxc_bottom
	INC
	CMP.w #225
	BMI +
	LDA.w #224
+	STA !fxc_bottom
	SEC
	SBC !fxc_top
	BPL +
	JMP .no
+	JSR fx_dual_tables
	LDA.w #0
	STA.l !fx_preuse
	STA.l !fx_pshown
.shown
	LDA !fxc_pair
	STA.l !fx_dual_pair
	LDA.w #5
	STA.l !fx_poly_req
	LDA.w #4
	STA.l !fx_pdmap
	CLC
	RTS

fx_dual_tables:
	LDA.l !fx_pbuf
	CLC
	ADC.w #!fx_poly&$FFFF
	TAX
	SEP #$20
	LDA.b #0
	STA.l !FX_PBASE,X
	REP #$20
	INX
	STX !fxc_out
	TXA
	STA.l !fx_ptab3
	LDX.w #0
	LDA.l $7E0600
	TAY
	LDA !fxc_top
	JSR fx_dual_record
	LDA.l fx_dual_colours
	TAY
	LDA !fxc_bottom
	SEC
	SBC !fxc_top
	JSR fx_dual_record
	LDA.l $7E0600
	TAY
	LDA.w #224
	SEC
	SBC !fxc_bottom
	JSR fx_dual_record
	LDA.w #127
	JSR fx_dual_record
	JSR fx_dual_end
	LDA !fxc_out
	STA.l !fx_ptab2
	LDX.w #$00FF
	LDY.w #$00FF
	LDA !fxc_top
	JSR fx_dual_record
	LDA !fxc_top
	STA !fxc_line
.row
	LDA !fxc_bottom
	SEC
	SBC !fxc_line
	BEQ .tail
	CMP.w #8
	BCC +
	LDA.w #8
+	STA !fxc_n
	LDX.w #0
	JSR fx_dual_span
	PHA
	LDX.w #12
	JSR fx_dual_span
	TAY
	PLX
	LDA !fxc_n
	JSR fx_dual_record
	LDA !fxc_line
	CLC
	ADC !fxc_n
	STA !fxc_line
	BRA .row
.tail
	LDX.w #$00FF
	LDY.w #$00FF
	LDA.w #224
	SEC
	SBC !fxc_bottom
	JSR fx_dual_record
	LDA.w #127
	JSR fx_dual_record
	JSR fx_dual_end
	; Second wave's independent fixed colour.
	LDX !fxc_col
	LDA.l fx_dual_colours,X
	PHA
	AND.w #31
	ORA.w #$20
	SEP #$20
	STA.l !fx_pfix
	REP #$20
	PLA
	PHA
	LSR : LSR : LSR : LSR : LSR
	AND.w #31
	ORA.w #$40
	SEP #$20
	STA.l !fx_pfix+1
	REP #$20
	PLA
	XBA : LSR : LSR
	AND.w #31
	ORA.w #$80
	SEP #$20
	STA.l !fx_pfix+2
	REP #$20
	RTS

; A lines with records X/Y, preserving X/Y. Only long neutral runs split.
fx_dual_record:
	BEQ .done
	STX !fxc_r0
	STY !fxc_r1
	PHX
.loop
	STA !fxc_count
	CMP.w #128
	BCC +
	LDA.w #127
+	STA !d_tmp+4
	LDX !fxc_out
	SEP #$20
	STA.l !FX_PBASE,X
	REP #$20
	LDA !fxc_r0
	STA.l !FX_PBASE+1,X
	LDA !fxc_r1
	STA.l !FX_PBASE+3,X
	TXA
	CLC
	ADC.w #5
	STA !fxc_out
	LDA !fxc_count
	SEC
	SBC !d_tmp+4
	BNE .loop
	PLX
.done
	RTS
fx_dual_end:
	LDX !fxc_out
	SEP #$20
	LDA.b #0
	STA.l !FX_PBASE,X
	REP #$20
	INC !fxc_out
	RTS

; Current line, beam offset X -> packed clipped span. Same horn/cap
; approximation as fx_ph_rec; precomputed division, no per-row multiply.
fx_dual_span:
	STX !fxc_i
	LDA !fxc_line
	SEC
	SBC !fxc_one+!XC_Y,X
	BPL +
	EOR.w #$FFFF
	INC
+	CMP !fxc_one+!XC_HW,X
	BEQ +
	BCS .empty
+	ASL
	CLC
	ADC !fxc_one+!XC_SHAPE,X
	TAX
	LDA.l fx_dual_rows,X
	PHA
	AND.w #$00FF
	STA !d_ks
	PLA
	XBA
	AND.w #$00FF
	STA !d_ks+2
	LDX !fxc_i
	LDA !fxc_one+!XC_LEN,X
	SEC
	SBC !d_ks+2
	STA !d_ks+2
	CMP !d_ks
	BMI .empty
	LDA !fxc_one+!XC_DIR,X
	CMP.w #2
	BEQ .left
	LDA !fxc_one+!XC_X,X
	CLC
	ADC !d_ks
	STA !d_tmp
	LDA !fxc_one+!XC_X,X
	CLC
	ADC !d_ks+2
	STA !d_tmp+2
	JMP fx_pw_lohi
.left
	LDA !fxc_one+!XC_X,X
	SEC
	SBC !d_ks+2
	STA !d_tmp
	LDA !fxc_one+!XC_X,X
	SEC
	SBC !d_ks
	STA !d_tmp+2
	JMP fx_pw_lohi
.empty
	LDA.w #$00FF
	RTS

; The field's native TS shadow; BG3/OBJ window selection is normally off.
fx_dual_restore:
	SEP #$20
	LDA.b #0
	STA.l $002124
	STA.l $00212F
	LDA.l $7E0022
	STA.l $00212D
	REP #$20
	RTS
