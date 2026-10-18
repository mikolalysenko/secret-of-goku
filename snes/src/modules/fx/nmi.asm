; Vblank work, last in modules_field_nmi: the screen is still force-blanked
; and every native upload of this vblank is done. DB = $80, M16/X16.
; fx_nmi never interrupts fx_frame (core only calls it for completed
; frames), so it may use the !fx_s scratch.

!fx_nmi_reg = !fx_s+0            ; word: DMA channel register offset ($70/$60)
!fx_nmi_bit = !fx_s+2            ; word: its MDMAEN bit

fx_nmi:
	LDA.l !fx_nmiwork            ; idle frames cost one read here
	BEQ .done
	LDA.l !fx_magic
	CMP.w #!FX_MAGIC
	BNE .done
	JSL core_vblank_lines
	STA.l !fx_vbl
	JSR fx_nmi_learn
if defined("FX_TEST")
	LDA.w #$0000
	STA.l !fx_upl
endif
	; When the game's own vblank work left no time (in Potos one streaming
	; phase in five ends near line 259), FX leaves HDMA, colour math and
	; cell uploads as they are: the field NMI writes $420C right after the
	; modules and that write must land before the next frame's HDMA start,
	; or the channels skip that frame. Its palettes are rewritten only while
	; no HDMA channel runs (then a late $420C write is harmless); with HDMA
	; running, fx_frame predicted this vblank and drew no sprites.
	JSR fx_nmi_vline
	CMP.w #225
	BCC .late
	CMP.w #257
	BCS .late
	JSR fx_nmi_poly              ; HDMA first, then the uploads
	JSR fx_nmi_channel
	BCS +
	JSR fx_nmi_cells
	JSR fx_nmi_palettes
+	LDA.l !fx_poly_req           ; up/down waves and Death Balls own the
	BEQ +                        ; colour math; otherwise the flash may use it
	CMP.w #$0002
	BNE .end
+	JSR fx_nmi_math
	BRA .end
.late
	LDA.l $7E002C
	AND.w #$000F
	BNE .end
	JSR fx_nmi_channel
	BCS .end
	JSR fx_nmi_palettes
.end
	LDA.l !fx_cpend              ; uploads that did not fit are not drawn
	STA.l !fx_cfail              ; until a later vblank sends them
if defined("FX_TEST")
	JSL core_vblank_lines
	STA.l !fx_vbl_end
endif
.done
	RTL

; Learn the vblank time FX gets in this streaming phase: drop to a lower
; measurement at once, rise by one line per frame otherwise.
fx_nmi_learn:
	LDA.l !fx_phase
	ASL
	TAX
	LDA.l !fx_vbl
	CMP.l !fx_vblp,X
	BCC +
	LDA.l !fx_vblp,X
	INC
+	STA.l !fx_vblp,X
	RTS

; World vblank: FX draws nothing there yet. A polygon cannot survive into
; world flight (its HDMA bits in $2C would come back in the field with the
; world's channel settings), so its state is dropped.
fx_world_nmi:
	LDA.l !fx_poly_on
	BEQ +
	SEP #$20
	LDA.l $7E002C
	AND.b #$F3
	STA.l $7E002C
	REP #$20
	LDA.w #$0000
	STA.l !fx_poly_on
+	RTL

; General DMA channel: 7, else 6, when no HDMA runs there ($2C). C set if
; both are busy. Y = register offset.
fx_nmi_channel:
	LDA.l $7E002C
	AND.w #$0080
	BNE +
	LDY.w #$0070
	LDA.w #$0080
	BRA .got
+	LDA.l $7E002C
	AND.w #$0040
	BNE .none
	LDY.w #$0060
	LDA.w #$0040
.got
	STA.l !fx_nmi_bit
	TYA
	STA.l !fx_nmi_reg
	CLC
	RTS
.none
	SEC
	RTS

; Upload the cache entries allocated this frame: two 64-byte halves per
; 16x16 cell (tiles t,t+1 and t+16,t+17), while vblank time remains.
fx_nmi_cells:
	LDA.l !fx_cpend
	BNE +
	RTS
+	SEP #$20
	LDA.b #$80
	STA $2115
	LDA.b #fx_cells>>16
	STA $4304,Y
	REP #$20
	LDA.w #$1801                 ; A->B, $2118/$2119
	STA $4300,Y
	LDX.w #$0000
.loop
	LDA.l fx_entry_bit,X
	AND.l !fx_cpend
	BEQ .next
	; Reserve the palette writes, math registers and core NMI return.
	; Starting a cell at 257-258 let an otherwise valid frame finish on
	; visible line 0/1. Pending cells keep their previous resident age.
	JSR fx_nmi_vline
	CMP.w #254
	BCS .done
	CMP.w #225
	BCC .done
	LDA.l !fx_nmi_reg
	TAY
	LDA.l fx_entry_vram,X
	STA $2116
	LDA.l !fx_ccell,X            ; source = cells + cell*128
	LSR
	XBA
	BCC +
	ORA.w #$0080
+	CLC
	ADC.w #fx_cells&$FFFF
	STA $4302,Y
	LDA.w #64
	STA $4305,Y
	SEP #$20
	LDA.l !fx_nmi_bit
	STA $420B
	REP #$20
	LDA.l fx_entry_vram,X
	CLC
	ADC.w #$0100
	STA $2116
	LDA.w #64
	STA $4305,Y
	SEP #$20
	LDA.l !fx_nmi_bit
	STA $420B
	REP #$20
	LDA.l fx_entry_bit,X
	EOR.w #$FFFF
	AND.l !fx_cpend
	STA.l !fx_cpend
if defined("FX_TEST")
	LDA.l !fx_upl
	INC
	STA.l !fx_upl
endif
.next
	INX
	INX
	CPX.w #30
	BCS .done
	JMP .loop
.done
	RTS

; Current scanline in A16 (DB = $80).
fx_nmi_vline:
	SEP #$20
	LDA $213F
	LDA $2137
	LDA $213D
	XBA
	LDA $213D
	AND.b #$01
	XBA
	REP #$20
	RTS

; Write the OBJ palettes FX used this frame (32 bytes each) after the
; game's own CGRAM upload; the game's buffer at $7E:0600 is never touched.
fx_nmi_palettes:
	LDX.w #$0000
.loop
	LDA.l !fx_nmipal,X
	AND.w #$00FF
	CMP.w #$0008
	BCS .next
	ASL
	ASL
	ASL
	ASL
	ORA.w #$0080
	SEP #$20
	STA $2121
	REP #$20
	CPX.w #!FX_CLASS_DYN
	BEQ .dyn
	LDA.l !fx_nmi_reg
	TAY
	LDA.w #$2200                 ; A->B, one register: $2122
	STA $4300,Y
	TXA
	ASL
	ASL
	ASL
	ASL
	ASL
	CLC
	ADC.w #fx_class_palettes&$FFFF
	STA $4302,Y
	SEP #$20
	LDA.b #fx_class_palettes>>16
	STA $4304,Y
	REP #$20
	LDA.w #32
	STA $4305,Y
	SEP #$20
	LDA.l !fx_nmi_bit
	STA $420B
	REP #$20
	BRA .next
.dyn
	SEP #$20
	LDA.b #$00
	STA $2122
	STA $2122
	LDA.l !fx_dyn
	STA $2122
	LDA.l !fx_dyn+1
	STA $2122
	LDA.l !fx_dyn+2
	STA $2122
	LDA.l !fx_dyn+3
	STA $2122
	LDA.l !fx_dyn+4
	STA $2122
	LDA.l !fx_dyn+5
	STA $2122
	REP #$20
.next
	INX
	CPX.w #6
	BCS +
	JMP .loop
+	RTS

; Flash (native-feedback.js burst): fixed-colour addition on BG1, BG2,
; OBJ palettes 4-7 and the backdrop; R and G +amount, B +amount/2. The
; game's values come back from its shadows when the flash ends (CGWSEL is
; the constant 2 written at C2:AAD7; CGADSUB is $23).
fx_nmi_math:
	LDA.l !fx_flashamt
	BEQ .off
	SEP #$20
	STZ $2130
	LDA.b #$33
	STA $2131
	LDA.l !fx_flashamt
	ORA.b #$60
	STA $2132
	LDA.l !fx_flashamt
	LSR
	ORA.b #$80
	STA $2132
	REP #$20
	LDA.w #$0001
	STA.l !fx_mathon
	RTS
.off
	LDA.l !fx_mathon
	BEQ .done
	SEP #$20
	LDA.b #$02
	STA $2130
	LDA.l $7E0023
	STA $2131
	LDA.b #$E0
	STA $2132
	REP #$20
	LDA.w #$0000
	STA.l !fx_mathon
.done
	RTS
