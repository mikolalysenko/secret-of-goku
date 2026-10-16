; Attack geometry: native-plants.js beam(). Attacks are cardinal (Goku's
; four facings), so a beam is an axis-aligned band: along in [-8, len+8],
; across <= width(along)+8 with width = half * min(1, (max(0,along)+8)/taper)
; for the tapered full beam. Cells are visited in the browser mod's order
; (along ascending, then ty, then tx). A beam keeps its arg_id across frames
; and only newly covered cells are visited; a full queue keeps the old
; extent so the next call retries.

!sc_layer   = !cs+$0   ; collision layer of the attack
!sc_pol     = !cs+$2   ; policy
!sc_horz    = !cs+$4   ; 1 when the attack runs along x
!sc_sign    = !cs+$6   ; $0001 or $FFFF
!sc_plen    = !cs+$8   ; previously scanned length, $FFFF = none
!sc_phalf   = !cs+$A
!sc_len     = !cs+$C
!sc_half    = !cs+$E

dst_scan_attack:
	LDA.w !arg_kind
	BNE +
	LDA.w #!POL_OBJECTS : BRA .pol
+	CMP.w #2 : BNE +
	LDA.w #!POL_BEAM : BRA .pol
+	CMP.w #3 : BEQ +
	RTS
+	LDA.w #!POL_SUPER
.pol
	STA.w !sc_pol
	LDA.w !arg_layer : BPL +
	LDA.w $E00B : AND.w #$0080 : BEQ +
	LDA.w #1
+	AND.w #1 : STA.w !sc_layer
	; Clamp like beam(): length <= 640, half width <= 80.
	LDA.w !arg_len : CMP.w #641 : BCC +
	LDA.w #640
+	STA.w !sc_len
	LDA.w !arg_half : CMP.w #81 : BCC +
	LDA.w #80
+	STA.w !sc_half
	; Previously covered extent of the same beam.
	LDA.w #$FFFF : STA.w !sc_plen : STA.w !sc_phalf
	LDA.w !arg_id : BEQ +
	CMP.w !d_aid : BNE +
	LDA.w !d_alen : STA.w !sc_plen
	LDA.w !d_ahalf : STA.w !sc_phalf
+	; Axis, sign, origin coordinates.
	LDA.w !arg_dir : AND.w #3 : TAX
	LDA.l dst_dir_horz,X : AND.w #$00FF : STA.w !sc_horz
	TXA : ASL : TAX
	LDA.l dst_dir_sign,X : STA.w !sc_sign
	LDA.w !sc_horz : BEQ +
	LDA.w !arg_x : STA.w !s_a
	LDA.w !arg_y : STA.w !s_c
	BRA ++
+	LDA.w !arg_y : STA.w !s_a
	LDA.w !arg_x : STA.w !s_c
++	; Outer range and step, clamped to the 128-cell grid.
	LDA.w !sc_sign : BMI .neg
	; o in [ceil((a-16)/16), floor((a+len)/16)], ascending
	LDA.w !s_a : SEC : SBC.w #16 : JSR dst_ceil16
	BPL +
	LDA.w #0
+	STA.w !s_o
	LDA.w !s_a : CLC : ADC.w !sc_len : JSR dst_floor16
	CMP.w #128 : BMI +
	LDA.w #127
+	STA.w !s_oend
	LDA.w #1 : STA.w !s_ostep
	LDA.w !s_oend : CMP.w !s_o : BPL .outer
	JMP .none
.neg
	; o in [ceil((a-len-16)/16), floor(a/16)], descending
	LDA.w !s_a : JSR dst_floor16
	CMP.w #128 : BMI +
	LDA.w #127
+	STA.w !s_o
	LDA.w !s_a : SEC : SBC.w !sc_len : SEC : SBC.w #16 : JSR dst_ceil16
	BPL +
	LDA.w #0
+	STA.w !s_oend
	LDA.w #$FFFF : STA.w !s_ostep
	LDA.w !s_o : CMP.w !s_oend : BPL .outer
	JMP .none
.outer
	; along = sign * (o*16 + 8 - a)
	LDA.w !s_o : ASL : ASL : ASL : ASL : CLC : ADC.w #8
	SEC : SBC.w !s_a
	LDX.w !sc_sign : BPL +
	EOR.w #$FFFF : INC
+	STA.w !s_along
	; previously covered inner range at this along (empty: plo > phi)
	LDA.w #1 : STA.w !s_plo
	STZ.w !s_phi
	LDA.w !sc_plen : BMI +
	CLC : ADC.w #8 : CMP.w !s_along : BMI +            ; along > plen+8
	LDA.w !sc_phalf : JSR dst_width : STA.w !s_w
	JSR dst_inner_range
	LDA.w !s_lo : STA.w !s_plo
	LDA.w !s_hi : STA.w !s_phi
+	; current inner range
	LDA.w !sc_half : JSR dst_width : STA.w !s_w
	JSR dst_inner_range
	LDA.w !s_lo : STA.w !s_i
.cell
	LDA.w !s_i : CMP.w !s_hi : BEQ + : BCS .next_outer
+	; skip cells already scanned by this beam
	LDA.w !s_i : CMP.w !s_plo : BCC .visit
	CMP.w !s_phi : BEQ .skip : BCC .skip
.visit
	LDA.w !sc_horz : BEQ +
	LDA.w !s_o : STA.w !d_cx
	LDA.w !s_i : STA.w !d_cy
	BRA ++
+	LDA.w !s_i : STA.w !d_cx
	LDA.w !s_o : STA.w !d_cy
++	LDA.w !sc_layer : STA.w !d_cl
	JSR dst_consider_cell
.skip
	INC.w !s_i
	BRA .cell
.next_outer
	LDA.w !s_o : CMP.w !s_oend : BEQ .done
	CLC : ADC.w !s_ostep : STA.w !s_o
	JMP .outer
.done
.none
	; Remember the covered extent unless the queue overflowed.
	LDA.w !arg_id : BEQ .exit
	LDA.w !d_flags : AND.w #4 : BNE .exit
	LDA.w !arg_id : CMP.w !d_aid : BEQ +
	STA.w !d_aid
	STZ.w !d_abar
	LDA.w !sc_len : STA.w !d_alen
	LDA.w !sc_half : STA.w !d_ahalf
	RTS
+	LDA.w !sc_len : CMP.w !d_alen : BCC +
	STA.w !d_alen
+	LDA.w !sc_half : CMP.w !d_ahalf : BCC .exit
	STA.w !d_ahalf
.exit
	RTS

dst_dir_horz:
	db 0,1,1,0
dst_dir_sign:
	dw $0001,$0001,$FFFF,$FFFF

; dst_width: A = half width -> A = width at !s_along (taper with !arg_taper).
dst_width:
	STA.w !d_t2
	LDA.w !arg_taper : BEQ .full
	LDA.w !s_along : BPL +
	LDA.w #0
+	CLC : ADC.w #8
	CMP.w !arg_taper : BCS .full
	; floor(half * t / taper): t < taper <= 255
	STA.w !d_t3
	LDA.w !d_t2 : JSR dst_mul16          ; A = half * t
	LDX.w !arg_taper : JSR dst_div16     ; A = A / X
	RTS
.full
	LDA.w !d_t2
	RTS

; dst_inner_range: !s_lo/!s_hi = cells j with |j*16+8-c| <= w+8, 0..127.
dst_inner_range:
	LDA.w !s_c : SEC : SBC.w #16 : SEC : SBC.w !s_w
	JSR dst_ceil16
	BPL +
	LDA.w #0
+	STA.w !s_lo
	LDA.w !s_c : CLC : ADC.w !s_w
	JSR dst_floor16
	CMP.w #128 : BMI +
	LDA.w #127
+	STA.w !s_hi
	RTS

; Signed floor/ceil of A/16 (arithmetic shifts).
dst_floor16:
	CMP.w #$8000 : ROR
	CMP.w #$8000 : ROR
	CMP.w #$8000 : ROR
	CMP.w #$8000 : ROR
	RTS
dst_ceil16:
	CLC : ADC.w #15
	BRA dst_floor16

; A = A * !d_t3 (small unsigned values).
dst_mul16:
	STA.w !d_t4
	LDA.w #0
	LDX.w !d_t3
	BEQ +
-	CLC : ADC.w !d_t4
	DEX : BNE -
+	RTS

; A = A / X (unsigned, X > 0), restoring division.
dst_div16:
	STX.w !d_t4
	STA.w !d_t3
	LDA.w #0
	LDY.w #16
-	ASL.w !d_t3
	ROL
	CMP.w !d_t4 : BCC +
	SBC.w !d_t4
	INC.w !d_t3
+	DEY : BNE -
	LDA.w !d_t3
	RTS

; ---------------------------------------------------------------------------
; dst_consider_cell: native-plants.js enqueueTiles() for one scanned cell
; (current cell coordinates set, policy in !sc_pol), then a wall candidate
; for the demolition planner when the policy demolishes.
dst_consider_cell:
	JSR dst_load_cell : BCC +
	RTS
+	LDA.w !sc_pol : STA.w !d_pol
	; Braziers expand to their complete 2x3 object (or nothing).
	JSR dst_brazier_policy : BCC .single
	JSR dst_brazier_rep : BCC .single
	JSR dst_brazier_group
	BRA .demolish
.single
	LDA.w !d_coff : JSR dst_queue_find : BCS .done
	LDA.w !sc_pol : JSR dst_breakable : BCC .demolish
	LDA.w !sc_pol
	LDX.w !d_bbraz : BEQ +
	ORA.w #!QM_BRAZIER
+	JSR dst_queue_push
	RTS
.demolish
	JSR dst_demolishes : BCC .done
	LDA.w !sc_layer : STA.w !d_cl
	JSR dst_wall_candidate
.done
	RTS

; dst_brazier_group: the cell is a brazier piece; queue all six cells of
; the first complete pattern containing it (palace-braziers.js), in order.
dst_brazier_group:
	LDA.w !d_cx : STA.l !DS+$20
	LDA.w !d_cy : STA.l !DS+$22
	LDA.w !d_ctile : STA.l !DS+$24
	LDX.w #0                             ; pattern offset
.pattern
	STX.w !d_t5
	; index of the tile in this pattern
	LDY.w #0
-	LDA.l destroy_brazier_patterns,X : AND.w #$00FF
	CMP.l !DS+$24 : BEQ .found
	INX : INY : CPY.w #6 : BCC -
	BRA .next
.found
	; origin = (tx - index%2, ty - index/2)
	TYA : AND.w #1 : STA.w !d_t6
	LDA.l !DS+$20 : SEC : SBC.w !d_t6 : STA.l !DS+$26
	TYA : LSR : STA.w !d_t6
	LDA.l !DS+$22 : SEC : SBC.w !d_t6 : STA.l !DS+$28
	; all six cells must match on BG1 with code 0
	LDY.w #0
.check
	JSR dst_brazier_cell : BCS .next
	TYA : CLC : ADC.w !d_t5 : TAX
	LDA.l destroy_brazier_patterns,X : AND.w #$00FF
	CMP.w !d_ctile : BNE .next
	LDA.w !d_ccode : BNE .next
	INY : CPY.w #6 : BCC .check
	; complete: queue each cell
	LDY.w #0
.queue
	PHY
	JSR dst_brazier_cell
	LDA.w !d_coff : JSR dst_queue_find : BCS +
	LDA.w !sc_pol : JSR dst_breakable : BCC +
	LDA.w !sc_pol : ORA.w #!QM_BRAZIER : JSR dst_queue_push
+	PLY
	INY : CPY.w #6 : BCC .queue
	RTS
.next
	LDA.w !d_t5 : CLC : ADC.w #6 : TAX
	CPX.w #6*!DESTROY_BRAZIER_PATTERNS : BCS +
	JMP .pattern
+	RTS

; Load brazier cell Y (0..5) relative to the origin in !DS+$16/$18.
; Carry set when outside the grid.
dst_brazier_cell:
	PHY
	TYA : AND.w #1 : CLC : ADC.l !DS+$26 : STA.w !d_cx
	TYA : LSR : CLC : ADC.l !DS+$28 : STA.w !d_cy
	STZ.w !d_cl
	JSR dst_load_cell
	PLY
	RTS

; dst_demolishes: carry set when !sc_pol demolishes walls here: the full
; Super Saiyan beam in a dungeon, or any punch/beam aboard the Sandship
; before stage 10 (sandship.js breakable).
dst_demolishes:
	LDA.w !m_grp : BEQ .no
	LDA.w !sc_pol : CMP.w #!POL_SUPER : BEQ .yes
	LDA.w !m_bits : AND.w #!MAP_INFO_SHIP : BEQ .no
	SEP #$20
	LDA.w $CF28 : BEQ .no8
	CMP.b #10 : BCS .no8
	REP #$20
.yes
	SEC
	RTS
.no8
	REP #$20
.no
	CLC
	RTS
