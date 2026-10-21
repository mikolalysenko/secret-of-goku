; Cinematic sphere: two direct HDMA tables from pre-scaled 64 px art bands.
; Each channel has <=18 records (90 bytes) plus its zero terminator: together
; with the neutral first byte, exactly one 183-byte buffer. No per-line math,
; run merging or table-overflow retry. Clipping never adds a surface record.
assert !FX_PBUF_SIZE >= 183, "cinematic ball tables need 183 bytes"
!fxr_mode = !d_r0            ; 0 colours, 1 windows
!fxr_i    = !d_r0+2          ; geometry byte offset (0..70)
!fxr_ptr  = !d_r0+4          ; this size's geometry
!fxr_count = !d_r0+6         ; direct entry writer's remaining lines
fx_red_tables:
	STZ !fxp_q
	LDA !fxp_x
	BMI +
	CLC
	ADC !fxp_len
	CMP.w #257
	BCS +
	INC !fxp_q
	LDA !fxp_x
	XBA
	ORA !fxp_x
	STA !fxp_dt
+
	LDA !d_ks                   ; frame's colours, skip empty art row 0
	ASL
	ASL
	ASL
	ASL
	ASL
	INC
	INC
	STA !fxd_c
	SEP #$20
	LDA !d_ks+2                 ; size index * 75
	STA.l $004202
	LDA.b #75
	STA.l $004203
	REP #$20
	NOP
	NOP
	NOP
	NOP
	LDA.l $004216
	STA !fxr_ptr
	STZ !fxr_mode
.table
	STZ !fxp_line
	STZ !fxr_i
	JSR .neutral
.row
	LDA !fxr_i
	CLC
	ADC !fxr_ptr
	TAX
	LDA.l !XDATA_FX_RED_GEOMETRY,X
	AND.w #$00FF
	CLC
	ADC !fxp_y
	BMI .skip
	CMP.w #224
	BCC +
	LDA.w #224
+	SEC
	SBC !fxp_line
	BEQ .skip
	STA !fxr_count
	CLC
	ADC !fxp_line
	STA !fxp_line
	JSR .write
.skip
	LDA !fxr_i
	CMP.w #70
	BEQ .bottom
	LDA !fxr_mode
	BNE .windows
	LDX !fxd_c
	LDA.l fx_red_colours,X
	STA !fxd_w2
	STZ !fxd_w1
	INC !fxd_c
	INC !fxd_c
	BRA .next
.windows
	LDA !fxr_i
	CLC
	ADC !fxr_ptr
	TAX
	LDA !fxp_q
	BEQ .clip
	LDA.l !XDATA_FX_RED_GEOMETRY+1,X
	CLC
	ADC !fxp_dt
	STA !fxd_w1
	LDA.l !XDATA_FX_RED_GEOMETRY+3,X
	CLC
	ADC !fxp_dt
	STA !fxd_w2
	BRA .next
.clip
	PHX
	LDA.l !XDATA_FX_RED_GEOMETRY+1,X
	JSR .span
	STA !fxd_w1
	PLX
	LDA.l !XDATA_FX_RED_GEOMETRY+3,X
	JSR .span
	STA !fxd_w2
.next
	LDA !fxr_i
	CLC
	ADC.w #5
	STA !fxr_i
	BRA .row
.bottom
	JSR .neutral
	LDA.w #224
	SEC
	SBC !fxp_line
	BEQ +
	STA !fxr_count
	JSR .write
+	LDA.w #127                  ; safe neutral tail on resumed HDMA channels
	STA !fxr_count
	JSR .write
	LDX !fxp_out
	SEP #$20
	LDA.b #0
	STA.l !FX_PBASE,X
	REP #$20
	INX
	STX !fxp_out
	LDA !fxr_mode
	BNE .done
	INC !fxr_mode
	TXA
	STA.l !fx_ptab2
	JMP .table
.done
	RTS
.neutral
	LDA !fxr_mode
	BNE +
	STZ !fxd_w1
	LDA.l $7E0600
	STA !fxd_w2
	RTS
+	LDA.w #$00FF
	STA !fxd_w1
	STA !fxd_w2
	RTS
.span                            ; scaled packed left/right, signed screen offset
	CMP.w #$00FF
	BEQ .empty
	PHA
	AND.w #$00FF
	CLC
	ADC !fxp_x
	STA !d_tmp
	PLA
	XBA
	AND.w #$00FF
	CLC
	ADC !fxp_x
	STA !d_tmp+2
	JMP fx_pw_lohi
.empty
	RTS
.write                           ; one record, split only when >127 scanlines
	LDX !fxp_out
.loop
	LDA !fxr_count
	CMP.w #128
	BCC +
	LDA.w #127
+	STA !d_tmp
	SEP #$20
	STA.l !FX_PBASE,X
	REP #$20
	LDA !fxd_w1
	STA.l !FX_PBASE+1,X
	LDA !fxd_w2
	STA.l !FX_PBASE+3,X
	TXA
	CLC
	ADC.w #5
	TAX
	LDA !fxr_count
	SEC
	SBC !d_tmp
	STA !fxr_count
	BNE .loop
	STX !fxp_out
	RTS
