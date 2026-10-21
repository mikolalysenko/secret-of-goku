; The finale's two field-vblank handlers (core/cgram.asm), in the second code
; area: they run at the game's own palette transfer, where no HDMA runs.

; The finale's scene RAM is ours while an ending phase runs (the scene work
; area is shared by every set piece; the ending does not take core's scene
; claim yet). Carry set then. Any DB, M16/X16; A not kept.
ending_owns_scene:
	LDA.l !ending_phase
	AND.w #$00FF
	BEQ .no
	SEC
	RTS
.no
	CLC
	RTS

; Field vblank before the game's palette and OAM transfers (core/cgram.asm,
; modules_field_preupload; M16/X16, DB = 0, D = 0): the copies the last
; completed frame queued (wq_push) go into the game's buffers, where no
; HDMA runs. A lag vblank (its frame did not finish the queue) runs none.
ending_preupload:
	LDA.l !core_dma_ready
	BEQ .out
	JSR ending_owns_scene
	BCC .out
	PHB
	PEA $3232 : PLB : PLB
	LDA.w !s_wqn
	CMP.w #4*8+1
	BCS .drop                    ; not a queue this module built
	LDX.w #$0000
	CPX.w !s_wqn
	BCS .done
.entry
	LDA.w !s_wq+0,X
	STA.w $2181
	LDA.w !s_wq+2,X
	STA.w $4372
	LDA.w !s_wq+6,X
	STA.w $4375
	SEP #$20
	STZ.w $2183                  ; bank $7E
	LDA.w !s_wq+4,X
	STA.w $4374
	LDA.w !s_wq+5,X              ; DMAP
	STA.w $4370
	LDA.b #$80                   ; B bus: WMDATA
	STA.w $4371
.trigger
	STA.w $420B
	REP #$20
	TXA
	CLC
	ADC.w #8
	TAX
	CPX.w !s_wqn
	BCC .entry
.drop
	STZ.w !s_wqn
.done
	PLB
.out
	RTL

; Palette upload handler (core/cgram.asm, modules_cgram_upload; the field
; NMI's own palette transfer, M16/X16, DB = 0, D = 0). While a scene
; declares CGRAM ranges (pal_range), the game's buffer goes up with those
; ranges taken from s_palout (or the code-bank direct palette, group 2) and
; the edge colours over the direct range, in ascending order (s_cgord):
; carry set. Outside the finale's scenes carry clear: the game's transfer.
; Field vblank, before the game's actor cell streaming (modules_actor_hold;
; M16, DB = 0, D = 0): carry set while a full-screen scene hides every
; native actor. Their cells would only spend the vblank: up to 12 lines in
; the round robin's busiest phase, which ran the wish flight's vblank past
; line 261 one frame in five (no HDMA start: the floor's matrix lost).
ending_actor_hold:
	JSR ending_owns_scene
	BCC .no
	LDA.l !SRAM_WORK_SCENE+!s_fullscreen-!SW
	AND.w #$00FF
	BEQ .no
	SEC
	RTL
.no
	CLC
	RTL

ending_cgram_upload:
	JSR ending_owns_scene
	BCS .ours
	CLC
	RTL
.ours
	PHB
	PEA $3232 : PLB : PLB
	LDA.w !s_cgcnt
	AND.w #$00FF
	BEQ .none
	CMP.w #$0005
	BCC .ranges
.none
	PLB
	CLC
	RTL
.ranges
	STA.w !s_cgnmi+6             ; count
	STZ.w !s_cgnmi               ; next CGRAM byte the transfer reaches
	STZ.w !s_cgnmi+2             ; position in s_cgord
.range
	LDA.w !s_cgnmi+2
	CMP.w !s_cgnmi+6
	BCC .one
	JMP .tail
.one
	TAX
	LDA.w !s_cgord,X
	AND.w #$00FF
	ASL
	TAX                          ; range * 2
	LDA.w !s_palrange,X
	AND.w #$00FF
	ASL
	STA.w !s_cgnmi+4             ; its first byte
	; the game's colours before it
	SEC
	SBC.w !s_cgnmi
	BEQ .colours
	BCC .colours                 ; (overlapping ranges: no gap)
	TAY
	LDA.w !s_cgnmi
	JSL core_cgram_native
.colours
	LDA.w !s_palrange+1,X
	AND.w #$00FF
	BNE +
	LDA.w #$0100                 ; count 0 = 256 colours
+	ASL
	CLC
	ADC.w !s_cgnmi+4
	CMP.w #512+1
	BCC +
	LDA.w #512
+	STA.w !s_cgnmi               ; where this range ends
	SEC
	SBC.w !s_cgnmi+4
	BEQ .next
	BCC .next
	STA.w $4375                  ; bytes
	LDA.w !s_cgnmi+4
	LSR
	SEP #$20
	STA.w $2121
	REP #$20
	LDA.w #$2200                 ; A->B, one register: CGDATA
	STA.w $4370
	TXA
	LSR
	TAY                          ; range index
	SEP #$20
	LDA.w !s_palgrp,Y
	CMP.b #$02
	REP #$20
	BEQ .direct
	LDA.w !s_cgnmi+4
	CLC
	ADC.w #!s_palout
	STA.w $4372
	SEP #$20
	LDA.b #$32
	BRA .bank
.direct
	LDA.w !s_dirsrc              ; a generator palette in the code bank
	STA.w $4372
	SEP #$20
	LDA.b #!CODE_BANK
.bank
	STA.w $4374
	LDA.b #$80
	STA.w $420B
	REP #$20
.next
	INC.w !s_cgnmi+2
	JMP .range
.tail
	; the game's colours after the last range
	LDA.w #512
	SEC
	SBC.w !s_cgnmi
	BEQ .edges
	BCC .edges
	TAY
	LDA.w !s_cgnmi
	JSL core_cgram_native
.edges
	; per-frame colours over the direct range (the fragments' seam and
	; depth): colours 14-15 of OBJ palettes 4-7
	LDA.w !s_edgeon
	BEQ .sent
	LDY.w #$00CE                 ; CGRAM word of OBJ palette 4, colour 14
	LDX.w #$0000
.edge
	TYA
	SEP #$20
	STA.w $2121
	LDA.w !s_edge,X
	STA.w $2122
	LDA.w !s_edge+1,X
	STA.w $2122
	LDA.w !s_edge+2,X
	STA.w $2122
	LDA.w !s_edge+3,X
	STA.w $2122
	REP #$20
	TYA
	CLC
	ADC.w #$0010
	TAY
	INX : INX : INX : INX
	CPX.w #16
	BCC .edge
.sent
	PLB
	SEC
	RTL
