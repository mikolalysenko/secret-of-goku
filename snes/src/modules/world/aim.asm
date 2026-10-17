; Aerial targeting (engine/world-ki.js aim(), worldAim(), screen()): native
; 12-bit world coordinates ($FA/$FC), heading $F6 (1024 per turn) and the
; real moving Fortress ($0128/$012A).

; Scratch for targeting (w_spare / w_scratch are shared with drawing).
!wa_px     = !WORLD_RAM+$E6 ; word: camera x
!wa_py     = !WORLD_RAM+$E8 ; word: camera y
!wa_sin    = !WORLD_RAM+$EA ; word: sin(heading) * 127
!wa_cos    = !WORLD_RAM+$EC ; word
!wa_mega   = !WORLD_RAM+$EE ; word: full Super Saiyan wave (long range, wide tolerance)
!wa_best   = !WORLD_RAM+$F0 ; word: best target id ($FFFF none)
!wa_along  = !WORLD_RAM+$F2 ; word: best target's distance along the heading
!wa_across = !WORLD_RAM+$F4 ; word: and across it (signed)
!wa_tx     = !WORLD_RAM+$F6 ; word: best target world x
!wa_ty     = !WORLD_RAM+$F8 ; word
!wa_cand   = !WORLD_RAM+$FA ; word: candidate id
assert !wa_cand+2 <= !w_magic, "aim scratch overlaps the magic word"

; Load the camera position and heading. M16/X16, DB = $7E, D = 0.
world_aim_camera:
	LDA $FA
	AND.w #$0FFF
	STA.w !wa_px
	LDA $FC
	AND.w #$0FFF
	STA.w !wa_py
	LDA $F6
	JSR world_sin
	STA.w !wa_sin
	LDA $F6
	CLC
	ADC.w #256
	JSR world_sin
	STA.w !wa_cos
	RTS

; world_aim: the target an aerial wave fired now would hit. A16 = nonzero
; for the full SSJ wave. Out: A16 = target id (!TGT_*), $FFFF for none;
; when found !wa_tx/ty/along/across describe it. M16/X16, DB = $7E, D = 0.
world_aim:
	STA.w !wa_mega
	JSR world_aim_camera
	LDA.w #!TGT_NONE
	STA.w !wa_best
	; Mana Tree cloud barrier: the AF landing patch around the Pure Land
	; entry (takeoff table entry of map 198); gone once $E3 bit 6 opens it.
	; Frieza's unresolved/crisis states keep it (frieza stream, stand-in).
	LDA $E3
	AND.w #$0040
	BNE .fortress
	JSR world_barrier_held
	BNE .fortress
	LDA.l $C67A80+(198*2)
	AND.w #$00FF
	ASL
	ASL
	ASL
	ASL
	STA.w !w_scratch+12
	LDA.l $C67A80+(198*2)+1
	AND.w #$00FF
	ASL
	ASL
	ASL
	ASL
	STA.w !w_scratch+14
	LDA.w #44
	LDX.w #!TGT_BARRIER
	JSR world_aim_try
.fortress
	LDA.l !pw_flags
	AND.w #!PWF_FORTRESS
	BNE .towns
	LDA $8C
	AND.w #$00FF
	BNE .towns
	LDA.l $7ECF4E
	AND.w #$00FF
	CMP.w #9
	BCS .towns
	LDA.w $0128
	AND.w #$0FFF
	STA.w !w_scratch+12
	LDA.w $012A
	AND.w #$0FFF
	STA.w !w_scratch+14
	LDA.w #36
	LDX.w #!TGT_FORTRESS
	JSR world_aim_try
.towns
	LDY.w #$0000
.town
	PHY
	TYA
	ASL
	TAX
	LDA.l world_bit,X
	AND.l !pw_towns
	BNE .next                        ; already a crater
	TYA
	ASL
	TAX
	LDA.l world_town_maps,X
	ASL
	TAX
	LDA.l $C67A80,X
	PHA
	AND.w #$00FF
	ASL
	ASL
	ASL
	ASL
	STA.w !w_scratch+12
	PLA
	XBA
	AND.w #$00FF
	ASL
	ASL
	ASL
	ASL
	STA.w !w_scratch+14
	LDA $01,S
	ORA.w #!TGT_TOWN
	TAX
	LDA.w #32
	JSR world_aim_try
.next
	PLY
	INY
	CPY.w #!WORLD_TOWN_COUNT
	BCC .town
	LDA.w !wa_best
	RTS

; Try one target: A = radius, X = id, w_scratch+12/+14 = world x/y.
world_aim_try:
	STX.w !wa_cand
	PHA                              ; radius
	LDA.w !w_scratch+12
	LDX.w !wa_px
	JSR world_delta
	STA.w !w_scratch+8               ; dx
	JSR .far
	BCC +
	JMP .reject
+
	LDA.w !w_scratch+14
	LDX.w !wa_py
	JSR world_delta
	STA.w !w_scratch+10              ; dy
	JSR .far
	BCC +
	JMP .reject
+
	; along = -(dx*sin + dy*cos)
	LDA.w !w_scratch+8
	LDY.w !wa_sin
	JSR world_mul7
	PHA
	LDA.w !w_scratch+10
	LDY.w !wa_cos
	JSR world_mul7
	CLC
	ADC $01,S
	EOR.w #$FFFF
	INC
	STA $01,S                        ; along
	CMP.w #$8000
	BCC +
	JMP .rejectAlong
+
	CMP.w #8
	BCS +
	JMP .rejectAlong
+
	LDX.w #512
	LDA.w !wa_mega
	BNE +
	LDA.w !wa_cand
	CMP.w #!TGT_FORTRESS
	BNE ++
+	LDX.w #1024
++	TXA
	CMP $01,S
	BCC .rejectAlong                 ; along > limit
	; across = dx*cos - dy*sin
	LDA.w !w_scratch+8
	LDY.w !wa_cos
	JSR world_mul7
	PHA
	LDA.w !w_scratch+10
	LDY.w !wa_sin
	JSR world_mul7
	EOR.w #$FFFF
	SEC
	ADC $01,S
	STA $01,S                        ; across
	; tolerance = radius + (mega ? 80 : 20)
	LDX.w #20
	LDA.w !wa_mega
	BEQ +
	LDX.w #80
+	TXA
	CLC
	ADC $05,S                        ; radius
	STA.w !w_scratch+6
	LDA $01,S
	BPL +
	EOR.w #$FFFF
	INC
+	CMP.w !w_scratch+6
	BEQ +
	BCS .rejectAcross
+	; better than the best so far? non-towns first, then nearest
	LDA.w !wa_best
	CMP.w #!TGT_NONE
	BEQ .take
	AND.w #!TGT_TOWN
	STA.w !w_scratch+6
	LDA.w !wa_cand
	AND.w #!TGT_TOWN
	CMP.w !w_scratch+6
	BCC .take                        ; candidate is not a town, best is
	BNE .rejectAcross                ; candidate is a town, best is not
	LDA $03,S
	CMP.w !wa_along
	BCS .rejectAcross
.take
	LDA.w !wa_cand
	STA.w !wa_best
	PLA
	STA.w !wa_across
	PLA
	STA.w !wa_along
	PLA
	LDA.w !w_scratch+12
	STA.w !wa_tx
	LDA.w !w_scratch+14
	STA.w !wa_ty
	RTS
.rejectAcross
	PLA
.rejectAlong
	PLA
.reject
	PLA
	RTS
; C set when |A| > 1104 (beyond any range plus tolerance).
.far
	BPL +
	EOR.w #$FFFF
	INC
+	CMP.w #1105
	RTS

; Screen position of a target from its along/across (screen() in
; world-ki.js): x = 128 + across*128/max(80, along), y = 48 + 1600/max(64,
; along). A16 = along, X16 = across (signed). Out: A16 = x, X16 = y.
world_target_screen:
	STA.w !w_scratch+4
	STX.w !w_scratch+6
	; y
	CMP.w #64
	BCS +
	LDA.w #64
+	CMP.w #1024
	BCC +
	LDA.w #1023
+	LSR
	LSR
	LSR
	TAX                              ; along/8 (8-127)
	LDA.w #200
	JSR world_div8
	CLC
	ADC.w #48
	PHA
	; x
	LDA.w !w_scratch+4
	CMP.w #80
	BCS +
	LDA.w #80
+	CMP.w #1024
	BCC +
	LDA.w #1023
+	LSR
	LSR
	LSR
	TAX
	LDA.w !w_scratch+6
	BPL .pos
	EOR.w #$FFFF
	INC
	CMP.w #2048
	BCC +
	LDA.w #2047
+	ASL
	ASL
	ASL
	ASL
	JSR world_div8
	EOR.w #$FFFF
	INC
	BRA .x
.pos
	CMP.w #2048
	BCC +
	LDA.w #2047
+	ASL
	ASL
	ASL
	ASL
	JSR world_div8
.x
	CLC
	ADC.w #128
	PLX
	RTS
