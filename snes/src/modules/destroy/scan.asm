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
!sk_end     = !d_t5    ; end of a run (inclusive)
; dst_strips words (the row words are free while strips are visited)
!st_j       = !s_i
!st_n       = !s_w
!st_step    = !s_plo
!st_last    = !s_phi
!st_kind    = !s_lo     ; 0 scan, 1 barrier search

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
+	LDA.w !arg_id : BNE dst_scan_grow
	; a one-shot attack (punch): the whole band now
	JSR dst_scan_band
	JMP dst_scan_finish

; ---------------------------------------------------------------------------
; Amortised growth. A full wave's band grows over its first frames and
; scanning all of it at once cost one frame several hundred scanlines. A
; beam (arg_id != 0) is covered in steps of about !DESTROY_STEP_CELLS new
; cells: the covered length widened to the requested width first, then
; longer at that width; a step at least per call, more while the frame has
; time (scanline < !DESTROY_HIT_LINE). What is left waits for the beam's
; next call or, if it stops calling, destroy_field_frame's continuation
; (dst_hit_continue) from its saved arguments. Cells per row ~ half/8 + 2,
; rows ~ len/16 + 2 (dst_band_row, dst_band_outer).
dst_scan_grow:
	; another beam's leftover is dropped
	LDA.l !hp_id : BEQ +
	CMP.w !arg_id : BEQ +
	LDA.w #0 : STA.l !hp_id : STA.l !hp_left
+	LDA.w !sc_len : STA.l !cl_rl
	LDA.w !sc_half : STA.l !cl_rh
.step
	JSR dst_scan_next : BCS .complete
	JSR dst_scan_band
	; a full queue keeps the old extent: the next call retries
	LDA.w !d_flags : AND.w #4 : BNE .left
	JSR dst_scan_remember
	JSR dst_hit_time : BCC .step
	JSR dst_scan_next : BCS .complete
.left
	; the rest of the band: the beam's arguments for the continuation
	LDA.w #1 : JSR dst_hit_left
	JMP dst_scan_finish
.complete
	LDA.w #1 : JSR dst_hit_done
	JMP dst_scan_finish

; The next step of the band scan from the covered extent (!sc_plen /
; !sc_phalf, $FFFF none) toward !cl_rl/!cl_rh -> !sc_len/!sc_half. Carry
; set when it is all covered.
dst_scan_next:
	LDA.w !sc_plen : BPL +
	LDA.w #0 : STA.l !cl_l0 : STA.l !cl_h0
	BRA ++
+	STA.l !cl_l0
	LDA.w !sc_phalf : STA.l !cl_h0
++	JSR dst_step_next : BCS +
	LDA.l !cl_tl : STA.w !sc_len
	LDA.l !cl_th : STA.w !sc_half
+	RTS

; dst_step_next: the next growth step from the covered extent (!cl_l0 /
; !cl_h0, 0 / 0 when nothing yet) toward the requested one (!cl_rl / !cl_rh)
; -> !cl_tl / !cl_th, about !DESTROY_STEP_CELLS new cells: the covered
; length widened first (8 px a time), then longer at the requested width.
; Carry set when everything requested is covered.
dst_step_next:
	LDA.l !cl_l0 : CMP.l !cl_rl : BCC .open
	LDA.l !cl_h0 : CMP.l !cl_rh : BCC .open
	SEC
	RTS
.open
	LDA.l !cl_l0 : BEQ .longer                 ; nothing yet: full width at once
	LDA.l !cl_h0 : CMP.l !cl_rh : BCS .longer
	; wider over the covered length: 8 px per step-cells / rows
	LDA.l !cl_l0 : LSR : LSR : LSR : LSR : INC : INC : STA.l !cl_t
	LDA.w #!DESTROY_STEP_CELLS : JSR .per : ASL : ASL : ASL
	CLC : ADC.l !cl_h0
	CMP.l !cl_rh : BCC +
	LDA.l !cl_rh
+	STA.l !cl_th
	LDA.l !cl_l0 : STA.l !cl_tl
	CLC
	RTS
.longer
	; longer at the requested width: step-cells / cols rows
	LDA.l !cl_rh : LSR : LSR : LSR : INC : INC : STA.l !cl_t
	LDA.w #!DESTROY_STEP_CELLS : JSR .per : ASL : ASL : ASL : ASL
	CLC : ADC.l !cl_l0
	CMP.l !cl_rl : BCC +
	LDA.l !cl_rl
+	STA.l !cl_tl
	LDA.l !cl_rh : STA.l !cl_th
	CLC
	RTS
; A = max(1, A / !cl_t) (small numbers)
.per
	LDX.w #0
-	CMP.l !cl_t : BCC +
	SEC : SBC.l !cl_t
	INX
	BRA -
+	TXA : BNE +
	INC
+	RTS

; A = part bit (1 band scan, 2 barrier search): this beam has more of it
; for later; its arguments are kept for destroy_field_frame's continuation.
dst_hit_left:
	ORA.l !hp_left : STA.l !hp_left
	LDA.w !arg_id : STA.l !hp_id
	LDA.w !arg_x : STA.l !hp_x
	LDA.w !arg_y : STA.l !hp_y
	LDA.w !arg_dir : STA.l !hp_dir
	LDA.w !arg_len : STA.l !hp_len
	LDA.w !arg_half : STA.l !hp_half
	LDA.w !arg_taper : STA.l !hp_taper
	LDA.w !arg_kind : STA.l !hp_kind
	LDA.w !arg_str : STA.l !hp_str
	LDA.w !arg_layer : STA.l !hp_layer
	RTS
; A = part bit: that part of this beam is done (nothing left of it once both
; parts are).
dst_hit_done:
	EOR.w #$FFFF : AND.l !hp_left : STA.l !hp_left
	BNE +
	LDA.l !hp_id : CMP.w !arg_id : BNE +
	LDA.w #0 : STA.l !hp_id
+	RTS

; A step's extent is covered (the beam's id keeps it across calls).
dst_scan_remember:
	LDA.w !arg_id : CMP.w !d_aid : BEQ +
	STA.w !d_aid
	LDA.w !sc_len : STA.w !d_alen
	LDA.w !sc_half : STA.w !d_ahalf
	BRA ++
+	LDA.w !sc_len : CMP.w !d_alen : BCC +
	STA.w !d_alen
+	LDA.w !sc_half : CMP.w !d_ahalf : BCC ++
	STA.w !d_ahalf
++	LDA.w !d_alen : STA.w !sc_plen
	LDA.w !d_ahalf : STA.w !sc_phalf
	RTS

; Carry clear while this call has time for another growth step: fewer than
; !DESTROY_HIT_SPAN scanlines since it began (!cl_t0, set by destroy_hit and
; the continuation).
dst_hit_time:
	JSR dst_vline
	SEC : SBC.l !cl_t0 : BPL +
	CLC : ADC.w #262                           ; wrapped past the frame's end
+	CMP.w #!DESTROY_HIT_SPAN
	RTS

; Walls are planned over the next frames along the same band.
dst_scan_finish:
	JSR dst_demolishes : BCC +
	JSR dst_job_update
+	RTS

; ---------------------------------------------------------------------------
; The band between the covered extent (!sc_plen/!sc_phalf) and !sc_len /
; !sc_half: its new cells in the browser mod's order.
dst_scan_band:
	LDA.w !arg_dir : LDX.w !arg_x : LDY.w !arg_y
	JSR dst_band_axes
	LDA.w !sc_len : JSR dst_band_outer
	BCC +
	JMP .none
+	JSR dst_band_flat_init
	; not wider than before: skip straight past the covered length
	LDA.w !sc_plen : BMI .outer
	LDA.w !sc_half : CMP.w !sc_phalf : BEQ + : BCS .outer
+	LDA.w !sc_plen : JSR dst_band_skip : BCC .outer
	JMP .none
.outer
	; once a row is beyond the taper zone, every later row is too
	LDA.l !BC_FLAT : CMP.w #$FFFF : BEQ .row
	JMP .flat_row
.row
	JSR dst_band_along
	; inner ranges: computed for the taper zone, cached beyond it
	LDA.w !arg_taper : BEQ .flat
	LDA.w !s_along : CLC : ADC.w #8 : CMP.w !arg_taper : BCS .flat
	LDA.w #1 : STA.w !s_plo                           ; empty: plo > phi
	STZ.w !s_phi
	LDA.w !sc_plen : BMI +
	CLC : ADC.w #8 : CMP.w !s_along : BMI +            ; along > plen+8
	LDA.w !sc_phalf : LDX.w !arg_taper : JSR dst_band_row
	LDA.w !s_lo : STA.w !s_plo
	LDA.w !s_hi : STA.w !s_phi
+	LDA.w !sc_half : LDX.w !arg_taper : JSR dst_band_row
	BRA .ranges
.flat
	JSR dst_band_flat
	; the rest of the band is flat: rows only need their outer index
	LDA.w !s_o : STA.l !BC_FLAT
	JSR dst_scan_strips : BCC .ranges
	JMP .next_outer
.flat_row
	; previous extent covers this row iff it lies before the boundary row
	LDA.l !BC_LO : STA.w !s_lo
	LDA.l !BC_HI : STA.w !s_hi
	LDA.w #1 : STA.w !s_plo
	STZ.w !s_phi
	LDA.l !BC_PREV : CMP.w #$FFFF : BEQ .ranges
	LDA.w !sc_sign : BMI +
	LDA.w !s_o : CMP.l !BC_PREV : BEQ .prev : BCC .prev
	BRA .ranges
+	LDA.w !s_o : CMP.l !BC_PREV : BCC .ranges
.prev
	LDA.l !BC_PLO : STA.w !s_plo
	LDA.l !BC_PHI : STA.w !s_phi
.ranges
	LDA.w !s_lo : STA.w !s_i
.cell
	LDA.w !s_i : CMP.w !s_hi : BEQ + : BCS .next_outer
+	; jump over the cells this beam already scanned
	CMP.w !s_plo : BCC .before
	CMP.w !s_phi : BEQ + : BCS .after
+	LDA.w !s_phi : INC : STA.w !s_i
	BRA .cell
.before
	LDA.w !s_plo : DEC : CMP.w !s_hi : BCC .run
	LDA.w !s_hi
	BRA .run
.after
	LDA.w !s_hi
.run
	; skim the run to its next candidate cell
	STA.w !sk_end
	LDA.w !sc_layer : STA.w !d_cl
	LDA.w !s_i : JSR dst_band_cell
	LDA.w !sk_end : SEC : SBC.w !s_i : INC
	JSR dst_skim : BCS .visit
	LDA.w !sk_end : INC : STA.w !s_i
	BRA .cell
.visit
	JSR dst_offset_cell
	LDA.w !d_cx
	LDX.w !sc_horz : BEQ +
	LDA.w !d_cy
+	STA.w !s_i
	JSR dst_consider_cell
.skip
	INC.w !s_i
	BRA .cell
.next_outer
	LDA.w !s_o : CMP.w !s_oend : BEQ .none
	CLC : ADC.w !s_ostep : STA.w !s_o
	JMP .outer
.none
	RTS

dst_dir_horz:
	db 0,1,1,0
dst_dir_sign:
	dw $0001,$0001,$FFFF,$FFFF

; ---------------------------------------------------------------------------
; Band geometry shared by the scan and the demolition planner.
; dst_band_axes: A = direction, X = origin x, Y = origin y -> !sc_horz,
; !sc_sign, !s_a (origin along the axis), !s_c (origin across it).
dst_band_axes:
	AND.w #3
	PHX
	TAX
	LDA.l dst_dir_horz,X : AND.w #$00FF : STA.w !sc_horz
	TXA : ASL : TAX
	LDA.l dst_dir_sign,X : STA.w !sc_sign
	PLX
	LDA.w !sc_horz : BEQ +
	STX.w !s_a
	STY.w !s_c
	RTS
+	STY.w !s_a
	STX.w !s_c
	RTS

; dst_band_outer: A = length -> first outer cell !s_o, last !s_oend, step
; !s_ostep (clamped to the grid). Carry set when the band is empty.
dst_band_outer:
	STA.w !s_w
	LDA.w !sc_sign : BMI .neg
	; o in [ceil((a-16)/16), floor((a+len)/16)], ascending
	LDA.w !s_a : SEC : SBC.w #16 : JSR dst_ceil16
	BPL +
	LDA.w #0
+	STA.w !s_o
	LDA.w !s_a : CLC : ADC.w !s_w : JSR dst_floor16
	CMP.w #128 : BMI +
	LDA.w #127
+	STA.w !s_oend
	LDA.w #1 : STA.w !s_ostep
	LDA.w !s_oend : CMP.w !s_o : BMI .empty
	CLC
	RTS
.neg
	; o in [ceil((a-len-16)/16), floor(a/16)], descending
	LDA.w !s_a : JSR dst_floor16
	CMP.w #128 : BMI +
	LDA.w #127
+	STA.w !s_o
	LDA.w !s_a : SEC : SBC.w !s_w : SEC : SBC.w #16 : JSR dst_ceil16
	BPL +
	LDA.w #0
+	STA.w !s_oend
	LDA.w #$FFFF : STA.w !s_ostep
	LDA.w !s_o : CMP.w !s_oend : BMI .empty
	CLC
	RTS
.empty
	SEC
	RTS

; dst_band_skip: A = covered length. Moves !s_o past the outer cells whose
; centre lies within it (along <= len+8). Carry set when nothing is left.
dst_band_skip:
	STA.w !s_w
	LDA.w !sc_sign : BMI .neg
	; first o with o*16 > a + len
	LDA.w !s_a : CLC : ADC.w !s_w : JSR dst_floor16 : INC
	CMP.w !s_o : BMI .keep : BEQ .keep
	STA.w !s_o
	LDA.w !s_oend : CMP.w !s_o : BMI .empty
	CLC
	RTS
.neg
	; first o (descending) with o*16 < a - len - 16
	LDA.w !s_a : SEC : SBC.w !s_w : SEC : SBC.w #16 : JSR dst_ceil16 : DEC
	CMP.w !s_o : BPL .keep
	STA.w !s_o
	CMP.w !s_oend : BMI .empty
	CLC
	RTS
.keep
	CLC
	RTS
.empty
	SEC
	RTS

; Full-width inner ranges of the scan (beyond the taper zone), cached in
; SRAM scratch: !BC_LO lo, +$52 hi, +$54 previous lo, +$56 previous hi
; (lo > hi when there is no previous extent).
dst_band_flat_init:
	LDA.w !sc_half : STA.w !s_w
	JSR dst_inner_range
	LDA.w !s_lo : STA.l !BC_LO
	LDA.w !s_hi : STA.l !BC_HI
	LDA.w #1 : STA.l !BC_PLO
	LDA.w #0 : STA.l !BC_PHI
	LDA.w #$FFFF : STA.l !BC_FLAT                  ; flat rows not reached yet
	STA.l !BC_PREV
	LDA.w !sc_plen : BMI +
	LDA.w !sc_phalf : STA.w !s_w
	JSR dst_inner_range
	LDA.w !s_lo : STA.l !BC_PLO
	LDA.w !s_hi : STA.l !BC_PHI
	; last outer cell whose centre is within the previous length
	LDA.w !sc_sign : BMI .neg
	LDA.w !s_a : CLC : ADC.w !sc_plen : JSR dst_floor16
	STA.l !BC_PREV
	RTS
.neg
	LDA.w !s_a : SEC : SBC.w !sc_plen : SEC : SBC.w #16 : JSR dst_ceil16
	BPL +
	LDA.w #0
+	STA.l !BC_PREV
	RTS
; Ranges for a full-width row: the previous extent only covers it while its
; along is within the previous length.
dst_band_flat:
	LDA.l !BC_LO : STA.w !s_lo
	LDA.l !BC_HI : STA.w !s_hi
	LDA.w #1 : STA.w !s_plo
	STZ.w !s_phi
	LDA.w !sc_plen : BMI +
	CLC : ADC.w #8 : CMP.w !s_along : BMI +
	LDA.l !BC_PLO : STA.w !s_plo
	LDA.l !BC_PHI : STA.w !s_phi
+	RTS

; dst_band_along: !s_along = sign * (o*16 + 8 - a) for !s_o.
dst_band_along:
	LDA.w !s_o : ASL : ASL : ASL : ASL : CLC : ADC.w #8
	SEC : SBC.w !s_a
	LDX.w !sc_sign : BPL +
	EOR.w #$FFFF : INC
+	STA.w !s_along
	RTS

; dst_band_row: A = half width, X = taper -> !s_w and the inner cells
; !s_lo..!s_hi at !s_along.
dst_band_row:
	JSR dst_width : STA.w !s_w
	; fall through
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

; dst_width: A = half width, X = taper -> A = width at !s_along:
; half * min(1, (max(0, along)+8)/taper), or half without a taper.
dst_width:
	STA.w !d_t2
	STX.w !d_t5
	TXA : BEQ .full
	LDA.w !s_along : BPL +
	LDA.w #0
+	CLC : ADC.w #8
	CMP.w !d_t5 : BCS .full
	STA.w !d_t3
	; half, t and taper below 256 (always for the cartridge's beams): the
	; hardware multiplier/divider, run twice so an interrupt that uses
	; them in between cannot slip a wrong width through
	LDA.w !d_t2 : ORA.w !d_t5 : AND.w #$FF00 : BNE .soft
-	JSR .hw : PHA
	JSR .hw : CMP $01,S : BNE .retry
	PLA
	RTS
.retry
	PLA
	BRA -
.soft
	LDA.w !d_t2 : JSR dst_mul16          ; half * t
	LDX.w !d_t5 : JSR dst_div16          ; / taper
	RTS
.full
	LDA.w !d_t2
	RTS
.hw
	SEP #$20
	LDA.w !d_t2 : STA.l $004202
	LDA.w !d_t3 : STA.l $004203
	REP #$20
	NOP : NOP : NOP : NOP
	LDA.l $004216 : STA.l $004204
	SEP #$20
	LDA.w !d_t5 : STA.l $004206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.l $004214
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

; A = A * !d_t3 (unsigned, product < 65536): shift and add. Consumes !d_t3.
dst_mul16:
	STA.w !d_t4
	LDA.w #0
-	LSR.w !d_t3 : BCC +
	CLC : ADC.w !d_t4
+	ASL.w !d_t4
	LDX.w !d_t3 : BNE -
	RTS

; A = A / X (unsigned, X > 0), restoring division (12 steps for dividends
; below 4096, the taper products).
dst_div16:
	STX.w !d_t4
	LDY.w #16
	CMP.w #$1000 : BCS +
	ASL : ASL : ASL : ASL
	LDY.w #12
+	STA.w !d_t3
	LDA.w #0
-	ASL.w !d_t3
	ROL
	CMP.w !d_t4 : BCC +
	SBC.w !d_t4
	INC.w !d_t3
+	DEY : BNE -
	LDA.w !d_t3
	RTS

; ---------------------------------------------------------------------------
; dst_skim: X = offset of the first cell (layer bit included), Y = offset
; step between cells (signed), A = cells (>= 1). Finds the first whose tile
; class has !TK_CAND (a class not computed yet counts: the caller's full
; check computes it). Carry set: X = its offset, A = cells after it; carry
; clear when none. About 60 cycles a cell; clobbers Y.
; dst_skim_nt: the same for the barrier search: candidates that are not
; ordinary (hit codes and walk-on triggers; not braziers or scenery).
macro dst_skim_loop(name, test)
<name>:
	PHA                                   ; cells left
	PHY                                   ; step
	TXA : AND.w #$4000 : BEQ +
	LDA.w #$0080                          ; class bytes of layer 1
+	PHA
	PHB
	PEA $3333 : PLB : PLB                 ; the class table's bank
.loop
	LDA.l $7F0000,X : AND.w #$00FF
	LSR                                   ; carry = odd tile: high nibble
	ORA $02,s
	TAY
	LDA.w !DKW,Y
	BCC +
	LSR : LSR : LSR : LSR
+	<test>
	TXA : CLC : ADC $04,s : TAX
	LDA $06,s : DEC : STA $06,s
	BNE .loop
	PLB
	PLA : PLA : PLA
	CLC
	RTS
.found
	PLB
	PLA : PLA
	PLA : DEC
	SEC
	RTS
endmacro
%dst_skim_loop(dst_skim, "AND.w #!TK_CAND : BNE .found")
%dst_skim_loop(dst_skim_nt, "AND.w #$000F : CMP.w #$000F : BEQ .found : AND.w #!TK_CAND|!TK_ORD : CMP.w #!TK_CAND : BEQ .found")

; dst_band_cell: A = inner index -> X = offset of the cell (!s_o, A) on
; layer !d_cl, Y = offset step along the inner axis.
dst_band_cell:
	LDX.w !sc_horz : BEQ .vert
	XBA : LSR : ORA.w !s_o                ; inner = y: y*128 + x
	LDY.w #128
	BRA .layer
.vert
	PHA
	LDA.w !s_o : XBA : LSR : ORA $01,s    ; inner = x
	PLY
	LDY.w #1
.layer
	LDX.w !d_cl : BEQ +
	ORA.w #$4000
+	TAX
	RTS

; dst_offset_cell: X = cell offset -> !d_cx, !d_cy, !d_cl.
dst_offset_cell:
	TXA : AND.w #$007F : STA.w !d_cx
	TXA : AND.w #$3F80 : ASL : XBA : STA.w !d_cy
	TXA : AND.w #$4000 : BEQ +
	LDA.w #1
+	STA.w !d_cl
	RTS

; dst_scan_strips (at the first flat row of the scan): a wider beam's flat
; rows that the previous extent covered only gain their side strips; visit
; those column by column. Carry set when done (!s_o = the last such row).
dst_scan_strips:
	LDA.l !BC_PREV : CMP.w #$FFFF : BEQ .no
	LDA.l !BC_PLO : CMP.l !BC_PHI : BEQ + : BCS .no
+	LDA.w !sc_sign : BMI +
	LDA.w !s_o : CMP.l !BC_PREV : BEQ .yes : BCC .yes
	BRA .no
+	LDA.w !s_o : CMP.l !BC_PREV : BCC .no
.yes
	LDA.w !sc_layer : STA.w !d_cl
	LDA.w #0 : STA.w !st_kind
	LDA.l !BC_PREV : JSR dst_strips
	SEC
	RTS
.no
	CLC
	RTS

; dst_strips: the side strips of rows !s_o..A (inclusive, A clamped to
; !s_oend) on layer !d_cl: columns [BC_LO, BC_PLO-1] and [BC_PHI+1, BC_HI],
; skimmed column by column. Each candidate goes to dst_consider_cell
; (!st_kind 0) or dst_native_cell (1). Leaves !s_o at the last row.
dst_strips:
	STA.w !st_last
	; clamp to the band's last row (signed: the last row may be off the grid)
	LDA.w !s_ostep : BMI .desc
	LDA.w !st_last : SEC : SBC.w !s_oend : BMI .kept : BEQ .kept
	BRA .clamp
.desc
	LDA.w !st_last : SEC : SBC.w !s_oend : BPL .kept
.clamp
	LDA.w !s_oend : STA.w !st_last
.kept
	; rows and the offset step between them
	LDA.w !st_last : SEC : SBC.w !s_o
	BPL +
	EOR.w #$FFFF : INC
+	INC : STA.w !st_n
	LDA.w !s_ostep
	LDX.w !sc_horz : BNE +                ; outer = x: +-1
	LDA.w #$0080                          ; outer = y: +-128
	LDX.w !s_ostep : BPL +
	LDA.w #$FF80
+	STA.w !st_step
	; low strip, then high strip
	LDA.l !BC_LO : STA.w !st_j
-	LDA.w !st_j : CMP.l !BC_PLO : BCS .high
	JSR dst_strip_column
	INC.w !st_j
	BRA -
.high
	LDA.l !BC_PHI : INC : STA.w !st_j
-	LDA.w !st_j : CMP.l !BC_HI : BEQ + : BCS .done
+	JSR dst_strip_column
	INC.w !st_j
	BRA -
.done
	LDA.w !st_last : STA.w !s_o
	RTS

dst_strip_column:
	LDA.w !st_j : JSR dst_band_cell
	LDA.w !st_n
.skim
	LDY.w !st_step
	PHA
	LDA.w !st_kind : BNE +
	PLA
	JSR dst_skim
	BRA ++
+	PLA
	JSR dst_skim_nt
++	BCC .done
	PHA : PHX
	JSR dst_offset_cell
	LDA.w !st_kind : BNE +
	JSR dst_consider_cell
	BRA ++
+	JSR dst_native_cell
++	PLX : PLA
	BEQ .done                             ; no cells after it
	PHA
	TXA : CLC : ADC.w !st_step : TAX
	PLA
	BRA .skim
.done
	RTS

; ---------------------------------------------------------------------------
; dst_consider_cell: native-plants.js enqueueTiles() for one scanned cell
; (current cell coordinates set, policy in !sc_pol). Walls are planned
; separately (dst_job_update).
dst_consider_cell:
	; fast rejection: not a cut-code object, and no scenery or brazier rule
	; can apply on this map
	LDA.w !d_cx : CMP.w #128 : BCS .out
	LDA.w !d_cy : CMP.w #128 : BCS .out
	XBA : LSR : ORA.w !d_cx
	LDX.w !d_cl : BEQ +
	ORA.w #$4000
+	TAX
	LDA.l $7F0000,X
	JSR dst_cell_class : AND.w #1 : BNE .full
.out
	RTS
.full
	JSR dst_load_cell : BCC +
	RTS
+	LDA.w !sc_pol : STA.w !d_pol
	; Braziers expand to their complete 2x3 object (or nothing).
	JSR dst_brazier_policy : BCC .single
	JSR dst_brazier_rep : BCC .single
	JMP dst_brazier_group
.single
	LDA.w !sc_pol : JSR dst_breakable : BCC .done
	LDA.w !d_coff : JSR dst_queue_find : BCS .done
	LDA.w !sc_pol
	LDX.w !d_bbraz : BEQ +
	ORA.w #!QM_BRAZIER
+	JSR dst_queue_push
.done
	RTS

; dst_brazier_group: the cell is a brazier piece; queue all six cells of
; the first complete pattern containing it (palace-braziers.js), in order.
dst_brazier_group:
	LDA.w !d_cx : STA.l !BZ_CX
	LDA.w !d_cy : STA.l !BZ_CY
	LDA.w !d_ctile : STA.l !BZ_TILE
	LDX.w #0                             ; pattern offset
.pattern
	STX.w !d_t5
	; index of the tile in this pattern
	LDY.w #0
-	LDA.l destroy_brazier_patterns,X : AND.w #$00FF
	CMP.l !BZ_TILE : BEQ .found
	INX : INY : CPY.w #6 : BCC -
	BRA .next
.found
	; origin = (tx - index%2, ty - index/2)
	TYA : AND.w #1 : STA.w !d_t6
	LDA.l !BZ_CX : SEC : SBC.w !d_t6 : STA.l !BZ_OX
	TYA : LSR : STA.w !d_t6
	LDA.l !BZ_CY : SEC : SBC.w !d_t6 : STA.l !BZ_OY
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
	TYA : AND.w #1 : CLC : ADC.l !BZ_OX : STA.w !d_cx
	TYA : LSR : CLC : ADC.l !BZ_OY : STA.w !d_cy
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
