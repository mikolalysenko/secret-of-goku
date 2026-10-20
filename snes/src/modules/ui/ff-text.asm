; Reveal up to eight prepared native glyphs per field frame while R is held.
; C0:1150-1174 already composes a whole line at $7E:9000. C0:1175
; normally copies/maps one 32-byte glyph and waits for its NMI upload.
; Queue a contiguous run directly from that line, then use the native
; tilemap writer for each glyph. No extra text parsing or vblank rendering.
!UI_FF_BATCH = 8

; C0:015F, before the text engine pushes DB/D. Stall *all* its substeps
; while a deferred upload still owns $9000. Queue order guarantees our
; transfer is finished once the queue is empty; do not overwrite its source.
ui_ff_text_wait:
	REP #$20
	LDA.l !ui_state
	AND.w #!UIS_TEXT
	BEQ .ready
	LDA.l !core_dma_count
	BEQ .complete
	SEP #$20
	JML $C00227                       ; original PLP / RTL
.complete
	; Reveal only after DMA completed: a deferred run never exposes old
	; tiles. The native engine may prepare/queue the next run afterwards.
	PHB : PHD : PHX : PHY
	PEA $7E7E : PLB : PLB
	PEA $0000 : PLD
	JSR ui_ff_text_complete
	PLY : PLX : PLD : PLB
.ready
	SEP #$20
	LDA.b #$00
	STA.l $7EA162                     ; displaced instructions
	JML $C00165

; C0:1175, M8/X16 DB=$7E D=0; the original routine may clobber A/X/Y.
ui_ff_text:
	REP #$20
	LDA.l !core_pad
	AND.w #!PAD_R|!PAD_L
	CMP.w #!PAD_R
	BEQ +
	JMP .native
+
	LDA.w $00D0
	AND.w #$00FF
	CMP.w #$0081
	BEQ +
	JMP .native
+
	LDA.w $00EC
	AND.w #$407E
	BEQ +
	JMP .native
+
	LDA.w $1D05
	AND.w #$00FF
	CMP.w #$0001
	BEQ +
	JMP .native
+
if defined("UI_HAVE_STORY")
	; Use the field callback's cached scan. A new/unknown window waits
	; for that callback rather than scanning a 4 KiB event stream here.
	LDA.w !ui_ff_state&$FFFF
	AND.w #$0300
	CMP.w #$0100
	BEQ +
	JMP .native
+
	LDA.w $00D1
	CMP.w !ui_ff_ptr&$FFFF
	BEQ +
	JMP .native
+	LDA.w $00D3
	EOR.w !ui_ff_state&$FFFF
	AND.w #$00FF
	BEQ +
	JMP .native
+
else
	BRA .native
endif
	; The remaining prepared characters end at min(A16A, A1CE & $7F).
	LDA.w $A1CE
	AND.w #$007F
	STA.w !ui_tmp0&$FFFF
	LDA.w $A16A
	AND.w #$00FF
	SEC
	SBC.w $A181                       ; high byte is not a counter
	AND.w #$00FF
	STA.w !ui_tmp1&$FFFF
	LDA.w !ui_tmp0&$FFFF
	SEC
	SBC.w $A1D0
	AND.w #$00FF
	CMP.w !ui_tmp1&$FFFF
	BCC +
	LDA.w !ui_tmp1&$FFFF
+	CMP.w #!UI_FF_BATCH+1
	BCC +
	LDA.w #!UI_FF_BATCH
+	CMP.w #$0002                     ; single last glyph: native path
	BCC .native
	STA.w !ui_tmp2&$FFFF
	ASL : ASL : ASL : ASL : ASL
	TAX
	LDA.w #$007E
	STA.w !core_scratch&$FFFF
	LDY.w $A189
	LDA.w $A18C
	JSL core_queue_vram
	BCC +
	JMP .native
+
	LDA.w !ui_tmp2&$FFFF
	ORA.w #$F100
	STA.l !ui_ff_upload
	LDA.w #!UIS_TEXT
	TSB.w !ui_state&$FFFF
	SEP #$20
	JML $C011CA
.native
	SEP #$20
	LDA.l $001D05
	CMP.b #$07
	JML $C0117B

ui_ff_text_complete:
	LDA.w #!UIS_TEXT
	TRB.w !ui_state&$FFFF
	LDA.l !ui_ff_upload
	AND.w #$001F
	STA.w !ui_tmp2&$FFFF
	LDA.w #$0000
	STA.l !ui_ff_upload
	LDA.w !ui_tmp2&$FFFF
	ASL : ASL : ASL : ASL
	CLC : ADC.w $A18C : STA.w $A18C
	LDA.w !ui_tmp2&$FFFF
	ASL : ASL : ASL : ASL : ASL
	CLC : ADC.w $A189 : STA.w $A189
	SEP #$20
.glyph
	JSL ui_ff_map_glyph
	DEC.w !ui_tmp2&$FFFF
	BNE .glyph
	; Same substep transition as C0:1188-1192, but glyph DMA is ours.
	INC.w $A15D
	LDA.w $A15D
	CMP.b #$08
	BEQ +
	DEC.w $A15D
+	LDA.b #$64                       ; tilemap/palette flags, no native glyph DMA
	ORA.w $1D04
	STA.w $1D04
	REP #$20
ui_ff_text_complete_end:
	RTS

ui_ff_map_glyph:
	PEA $0227                        ; native RTS -> C0:0228 RTL -> caller
	JML $C013A0

%orig2($C0015F, $00A9)
%orig4($C00161, $7EA1628F)
%hijack($C0015F, ui_ff_text_wait, 6, ui)
%orig4($C01175, $001D05AF)
%orig2($C01179, $07C9)
%hijack($C01175, ui_ff_text, 6, ui)
