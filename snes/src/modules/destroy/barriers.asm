; Barriers, switches, breakable doors and crystal orbs.
; native-barriers.js: a punch, or a beam at >= 85% charge, against an
; authored gate rectangle (kiBarriers), a native F-prefix hit tile or a
; floor plate runs the original (or authored) event 26 frames later; the
; event sets its own progress and rebuilds objects/pieces. Breakable doors
; (breakable-doors.js) persist their opened state in !P_DOORS.
; native-orbs.js: an orb's own puzzle event, with the spell byte its
; element test reads from $E181.

!bh_x     = !arg_x     ; attack origin
!bh_y     = !arg_y
!bh_len   = !cs+$0     ; min(640, length)
!bh_wid   = !cs+$2     ; half width
!bh_horz  = !sc_horz   ; (dst_band_axes)
!bh_sign  = !sc_sign
!nt_plen  = !cs+$8     ; length already searched by this beam ($FFFF none)
!nt_phalf = !cs+$A
!bh_best  = !cs+$C     ; best candidate distance (low word, $FFFF none)
!bh_bhi   = !cs+$E     ; best candidate distance (high word)
; !bb_id/!bb_len/!bb_half (module.asm): the beam's searched extent

!BS_NONE  = 0
!BS_WAIT  = 1
!BS_ASKED = 2

; ---------------------------------------------------------------------------
; dst_barrier_hit: native-barriers.js hit() for the current destroy_hit.
dst_barrier_hit:
	LDA.l !bp_state : BEQ +
	BRA .nothing
+	; strength: punches always qualify; beams need >= 85% charge
	LDA.w !arg_kind : BEQ +
	LDA.w !arg_str : CMP.w #218 : BCS +
	BRA .nothing
+	; one barrier per beam
	LDA.w !arg_id : BEQ +
	CMP.w !d_abar : BNE +
.nothing
	; nothing (more) to search for this beam
	LDA.w !arg_id : BEQ ++
	LDA.w #2 : JMP dst_hit_done
++	RTS
+	LDA.w !arg_len : CMP.w #641 : BCC +
	LDA.w #640
+	STA.w !bh_len
	LDA.w !arg_half : STA.w !bh_wid
	LDA.w !arg_dir : LDX.w !arg_x : LDY.w !arg_y
	JSR dst_band_axes
	; authored gate rectangles first
	LDA.w !m_bits : AND.w #!MAP_INFO_BARRIER : BEQ .native
	JSR dst_ki_barrier : BCC .native
	JMP dst_barrier_start
.native
	; The browser searches the whole box every frame until a hit; cells
	; this beam already searched cannot hold a target, so only new ones.
	LDA.w #$FFFF : STA.w !nt_plen : STA.w !nt_phalf
	LDA.w !arg_id : BEQ +
	CMP.l !bb_id : BNE +
	LDA.l !bb_len : STA.w !nt_plen
	LDA.l !bb_half : STA.w !nt_phalf
+	LDA.w !arg_id : BNE .steps
	JSR dst_native_target : BCC +
	LDX.w #$FFFF
	JMP dst_barrier_start
+	RTS
.steps
	; a beam's box grows in steps (dst_step_next), nearest rows first, a
	; step at least per call and more while the call has time
	LDA.w !bh_len : STA.l !cl_rl
	LDA.w !bh_wid : STA.l !cl_rh
.step
	LDA.w !nt_plen : BPL +
	LDA.w #0 : STA.l !cl_l0 : STA.l !cl_h0
	BRA ++
+	STA.l !cl_l0
	LDA.w !nt_phalf : STA.l !cl_h0
++	JSR dst_step_next : BCS .searched
	LDA.l !cl_tl : STA.w !bh_len
	LDA.l !cl_th : STA.w !bh_wid
	JSR dst_native_target : BCS .hit
	; remember the searched extent
	LDA.w !arg_id : CMP.l !bb_id : BEQ +
	STA.l !bb_id
	LDA.w !bh_len : STA.l !bb_len
	LDA.w !bh_wid : STA.l !bb_half
	BRA ++
+	LDA.w !bh_len : CMP.l !bb_len : BCC +
	STA.l !bb_len
+	LDA.w !bh_wid : CMP.l !bb_half : BCC ++
	STA.l !bb_half
++	LDA.l !bb_len : STA.w !nt_plen
	LDA.l !bb_half : STA.w !nt_phalf
	JSR dst_hit_time : BCC .step
	; the rest of the box later
	LDA.w #2 : JMP dst_hit_left
.searched
	LDA.w #2 : JMP dst_hit_done
.hit
	LDA.w #2 : JSR dst_hit_done
	LDX.w #$FFFF
	JMP dst_barrier_start

; dst_ki_barrier: first kiBarriers record of this map that is closed, not
; a broken door, allowed for this attack and touched. Carry set, X = record.
dst_ki_barrier:
	LDA $DC : AND.w #$01FF : ASL : ASL : ASL : TAX
	LDA.l destroy_map_info+3,X : AND.w #$00FF
	STA.w !d_t0
	ASL : ASL : CLC : ADC.w !d_t0 : ASL : ASL : TAX   ; *20
.loop
	LDA.l destroy_barriers,X : CMP.w !d_map : BEQ +
	CLC
	RTS
+	STX.w !d_t1
	; broken door?
	LDA.l destroy_barriers+14,X : AND.w #$0004 : BEQ +
	LDA.l destroy_barriers+15,X : AND.w #$00FF : JSR dst_door_broken : BCS .next
	LDX.w !d_t1
+	; beam-only gates ignore punches
	LDA.l destroy_barriers+14,X : AND.w #$0001 : BEQ +
	LDA.w !arg_kind : BEQ .next
+	; still closed?
	LDA.l destroy_barriers+10,X : AND.w #$00FF : TAY
	LDA.l destroy_barriers+11,X : AND.w #$00FF : STA.w !d_t2
	TYX
	LDA.l $7ECF00,X : AND.w #$00FF : CMP.w !d_t2 : BCS .next
	LDX.w !d_t1
	; touched?
	LDA.l destroy_barriers+2,X : STA.w !d_t2     ; x
	LDA.l destroy_barriers+4,X : STA.w !d_t3     ; y
	LDA.l destroy_barriers+6,X : STA.w !d_t4     ; w
	LDA.l destroy_barriers+8,X : STA.w !d_t5     ; h
	JSR dst_touches : BCC .next
	LDX.w !d_t1
	SEC
	RTS
.next
	LDA.w !d_t1 : CLC : ADC.w #!DESTROY_BARRIER_SIZE : TAX
	JMP .loop

; dst_touches: beamTouchesBarrier for rect (t2,t3,t4,t5) = (x,y,w,h).
; Carry set when the band reaches it.
dst_touches:
	; centre offsets from the origin
	LDA.w !d_t4 : LSR : STA.w !d_t4              ; w/2
	CLC : ADC.w !d_t2 : SEC : SBC.w !bh_x : STA.w !d_t2   ; ox
	LDA.w !d_t5 : LSR : STA.w !d_t5              ; h/2
	CLC : ADC.w !d_t3 : SEC : SBC.w !bh_y : STA.w !d_t3   ; oy
	LDA.w !bh_horz : BEQ .vert
	; along = sign*ox, across = |oy|, forward = w/2, side = h/2
	LDA.w !d_t2 : LDX.w !bh_sign : BPL +
	EOR.w #$FFFF : INC
+	CMP.w #$8000 : BCS .no
	STA.w !d_t6
	LDA.w !bh_len : CLC : ADC.w !d_t4 : CMP.w !d_t6 : BCC .no
	LDA.w !d_t3 : BPL +
	EOR.w #$FFFF : INC
+	STA.w !d_t6
	LDA.w !bh_wid : CLC : ADC.w !d_t5 : CMP.w !d_t6 : BCC .no
	SEC
	RTS
.vert
	; along = sign*oy, across = |ox|, forward = h/2, side = w/2
	LDA.w !d_t3 : LDX.w !bh_sign : BPL +
	EOR.w #$FFFF : INC
+	CMP.w #$8000 : BCS .no
	STA.w !d_t6
	LDA.w !bh_len : CLC : ADC.w !d_t5 : CMP.w !d_t6 : BCC .no
	LDA.w !d_t2 : BPL +
	EOR.w #$FFFF : INC
+	STA.w !d_t6
	LDA.w !bh_wid : CLC : ADC.w !d_t4 : CMP.w !d_t6 : BCC .no
	SEC
	RTS
.no
	CLC
	RTS

; ---------------------------------------------------------------------------
; dst_native_target: nativeTile(): the nearest native hit tile, floor plate
; or locked door trigger on Goku's layer that the band touches (cell centre
; along the attack in [0, len+8], across <= width+8). Nearest by distance
; to the cell corner; ties go to the browser's scan order (row, then
; column). Carry set when found; the target is described in !nt_out:
;   +0 event, +2 door index ($FFFF), +4 offset, +6 tile, +8 react,
;   +A tx, +C ty
!nt_src  = !NT_SRC
!nt_ev   = !NT_EV
!nt_door = !NT_DOOR
!nt_out  = !NTO
dst_native_target:
	LDA.w #$FFFF : STA.w !bh_best : STA.w !bh_bhi
	; A deferred beam stays on the collision layer where it was fired.
	LDA.w !arg_layer : BPL +
	LDA.w $E00B : AND.w #$0080 : BEQ +
	LDA.w #1
+	AND.w #1 : STA.w !d_cl
.layer
	; outer cells: centre along in [0, len+8]
	LDA.w !bh_sign : BMI .neg
	LDA.w !s_a : SEC : SBC.w #8 : JSR dst_ceil16 : STA.w !s_o
	LDA.w !s_a : CLC : ADC.w !bh_len : JSR dst_floor16 : STA.w !s_oend
	LDA.w #1 : STA.w !s_ostep
	BRA .clip
.neg
	LDA.w !s_a : SEC : SBC.w #8 : JSR dst_floor16 : STA.w !s_o
	LDA.w !s_a : SEC : SBC.w !bh_len : SEC : SBC.w #16 : JSR dst_ceil16 : STA.w !s_oend
	LDA.w #$FFFF : STA.w !s_ostep
.clip
	; clip both ends to [0, cells-1] of the axis
	JSR dst_nt_outer_cells : STA.w !s_w
	LDA.w !s_o : JSR dst_nt_clip : STA.w !s_o
	LDA.w !s_oend : JSR dst_nt_clip : STA.w !s_oend
	; empty when the ends crossed (both clipped to the same side)
	LDA.w !bh_sign : BMI +
	LDA.w !s_oend : CMP.w !s_o : BPL ++
	JMP .end
+	LDA.w !s_o : CMP.w !s_oend : BPL ++
	JMP .end
++	; the band has the same width everywhere: inner ranges once (clipped
	; to the map), and the previously searched ones
	LDA.w !bh_wid : STA.w !s_w
	JSR dst_inner_range
	JSR dst_nt_inner_cells : DEC : CMP.w !s_hi : BCS +
	STA.w !s_hi
+	LDA.w !s_lo : STA.l !BC_LO
	LDA.w !s_hi : STA.l !BC_HI
	LDA.w #1 : STA.l !BC_PLO                  ; previous: empty unless known
	LDA.w #0 : STA.l !BC_PHI
	LDA.w !nt_plen : BMI .outer
	LDA.w !nt_phalf : STA.w !s_w
	JSR dst_inner_range
	LDA.w !s_lo : STA.l !BC_PLO
	LDA.w !s_hi : STA.l !BC_PHI
	; not wider than before: skip straight past the searched length
	LDA.w !bh_wid : CMP.w !nt_phalf : BEQ + : BCS .wider
+	LDA.w !nt_plen : JSR dst_band_skip : BCC .outer
	JMP .end
.wider
	; wider: the rows the previous search covered only gain side strips
	JSR dst_nt_strips : BCC .outer
	LDA.w !s_o : CMP.w !s_oend : BNE +
	JMP .end
+	CLC : ADC.w !s_ostep : STA.w !s_o
.outer
	JSR dst_band_along
	LDA.w !s_along : BPL +
	JMP .next_outer                          ; behind the origin
+	LDA.l !BC_LO : STA.w !s_lo
	LDA.l !BC_HI : STA.w !s_hi
	LDA.w #1 : STA.w !s_plo
	STZ.w !s_phi
	LDA.w !nt_plen : BMI +
	CLC : ADC.w #8 : CMP.w !s_along : BMI +
	LDA.l !BC_PLO : STA.w !s_plo
	LDA.l !BC_PHI : STA.w !s_phi
+	LDA.w !s_lo : STA.w !s_i
.cell
	LDA.w !s_i : CMP.w !s_hi : BEQ + : BCS .next_outer
+	CMP.w !s_plo : BCC .before
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
	; skim the run to its next candidate (hit codes and walk-on triggers
	; are tile class candidates)
	STA.w !sk_end
	LDA.w !s_i : JSR dst_band_cell
	LDA.w !sk_end : SEC : SBC.w !s_i : INC
	JSR dst_skim_nt : BCS .visit
	LDA.w !sk_end : INC : STA.w !s_i
	BRA .cell
.visit
	JSR dst_offset_cell
	LDA.w !d_cx
	LDX.w !bh_horz : BEQ +
	LDA.w !d_cy
+	STA.w !s_i
	JSR dst_native_cell
.skip
	INC.w !s_i
	BRA .cell
.next_outer
	LDA.w !s_o : CMP.w !s_oend : BEQ .end
	CLC : ADC.w !s_ostep : STA.w !s_o
	JMP .outer
.end
	LDA.w !bh_best : AND.w !bh_bhi : CMP.w #$FFFF : BEQ +
	SEC
	RTS
+	CLC
	RTS

; dst_nt_strips: the band's rows within the previously searched length
; (centre along <= len+8), from !s_o on, only gain their side strips.
; Carry set when strips were visited (!s_o = the last of those rows).
dst_nt_strips:
	LDA.l !BC_PLO : CMP.l !BC_PHI : BEQ + : BCS .no
+	LDA.w !bh_sign : BMI .neg
	LDA.w !s_a : CLC : ADC.w !nt_plen : JSR dst_floor16
	CMP.w !s_o : BMI .no
	BRA .go
.neg
	LDA.w !s_a : SEC : SBC.w !nt_plen : SEC : SBC.w #16 : JSR dst_ceil16
	CMP.w !s_o : BEQ .go : BPL .no
.go
	PHA
	LDA.w #1 : STA.w !st_kind
	PLA : JSR dst_strips
	SEC
	RTS
.no
	CLC
	RTS

; Cells along / across the attack axis on this map (min(2048, $C0/$C2)/16).
dst_nt_outer_cells:
	LDA.w !bh_horz : BNE dst_nt_width
	BRA dst_nt_height
dst_nt_inner_cells:
	LDA.w !bh_horz : BNE dst_nt_height
dst_nt_width:
	LDA $C0 : CMP.w #2048 : BCC +
	LDA.w #2048
+	LSR : LSR : LSR : LSR
	RTS
dst_nt_height:
	LDA $C2 : CMP.w #2048 : BCC +
	LDA.w #2048
+	LSR : LSR : LSR : LSR
	RTS
; A = outer cell -> clipped to [0, !s_w - 1]
dst_nt_clip:
	BPL +
	LDA.w #0
	RTS
+	CMP.w !s_w : BCC +
	LDA.w !s_w : DEC
+	RTS

; One cell of nativeTile(): keeps the nearest candidate.
dst_native_cell:
	; cheap pre-filter: an F-prefix hit code or a walk-on trigger
	LDA.w !d_cy : XBA : LSR : ORA.w !d_cx
	LDX.w !d_cl : BEQ +
	ORA.w #$4000
+	TAX
	LDA.l $7F0000,X
	JSR dst_cell_class_fast : AND.w #1 : BNE +
	RTS
+	JSR dst_load_cell : BCC +
	RTS
+	LDA.w #$FFFF : STA.l !nt_ev : STA.l !nt_door
	LDA.w !d_ccode : AND.w #$00F0 : CMP.w #$00F0 : BNE .floor
	; hit tile: source = replacement*16 + code low nibble
	LDA.w !d_crep : ASL : ASL : ASL : ASL : STA.w !d_t0
	LDA.w !d_ccode : AND.w #$000F : ORA.w !d_t0 : STA.l !nt_src
	JSR dst_hit_event
	BRA .door
.floor
	JSR dst_floor_source : BCS +
	RTS
+	STA.l !nt_src
	JSR dst_floor_event
.door
	JSR dst_locked_door
	LDA.l !nt_ev : AND.l !nt_door : CMP.w #$FFFF : BNE +
	RTS
+	; the Grand Palace combination belongs to stage 3 only
	LDA.l !nt_src : CMP.w #!DESTROY_COMBO_LO : BCC +
	CMP.w #!DESTROY_COMBO_HI+1 : BCS +
	SEP #$20
	LDA.w $CF00+!DESTROY_COMBO_FLAG : CMP.b #!DESTROY_COMBO_STAGE
	REP #$20
	BEQ +
	RTS
+	; distance^2 from the origin to the cell corner
	LDA.w !d_cx : ASL : ASL : ASL : ASL : SEC : SBC.w !bh_x
	JSR dst_square : STA.w !d_t0 : STX.w !d_t1
	LDA.w !d_cy : ASL : ASL : ASL : ASL : SEC : SBC.w !bh_y
	JSR dst_square
	CLC : ADC.w !d_t0 : STA.w !d_t0
	TXA : ADC.w !d_t1 : STA.w !d_t1
	; nearer, or as near and earlier in the browser's row-major scan
	CMP.w !bh_bhi : BCC .take
	BNE .no
	LDA.w !d_t0 : CMP.w !bh_best : BCC .take
	BNE .no
	LDA.w !d_cy : CMP.l !nt_out+$C : BCC .take
	BNE .no
	LDA.w !d_cx : CMP.l !nt_out+$A : BCC .take
.no
	RTS
.take
	LDA.w !d_t0 : STA.w !bh_best
	LDA.w !d_t1 : STA.w !bh_bhi
	LDA.l !nt_ev : STA.l !nt_out+0
	LDA.l !nt_door : STA.l !nt_out+2
	LDA.w !d_coff : STA.l !nt_out+4
	LDA.w !d_ctile : STA.l !nt_out+6
	LDA.w !d_cx : STA.l !nt_out+$A
	LDA.w !d_cy : STA.l !nt_out+$C
	LDA.l !nt_src : TAX
	LDA.w #0
	CPX.w #!DESTROY_COMBO_LO : BCC +
	CPX.w #!DESTROY_COMBO_HI+1 : BCS +
	LDA.w #!DESTROY_REACT_COMBO
+	STA.l !nt_out+8
	; a door reports its own reaction
	LDA.l !nt_door : CMP.w #$FFFF : BEQ .keep
	ASL : ASL : ASL : ASL : TAX
	LDA.l destroy_doors+12,X : AND.w #$00FF : STA.l !nt_out+8
.keep
	RTS

; A = signed value -> X:A = value^2 (32-bit).
dst_square:
	BPL +
	EOR.w #$FFFF : INC
+	STA.w !d_t2
	STA.w !d_t3
	STZ.w !d_t4                    ; product low
	STZ.w !d_t5                    ; product high
	STZ.w !d_t6                    ; multiplicand high
	LDY.w #16
-	LSR.w !d_t3 : BCC +
	LDA.w !d_t4 : CLC : ADC.w !d_t2 : STA.w !d_t4
	LDA.w !d_t5 : ADC.w !d_t6 : STA.w !d_t5
+	ASL.w !d_t2 : ROL.w !d_t6
	DEY : BNE -
	LDA.w !d_t4
	LDX.w !d_t5
	RTS

; dst_hit_event: barrierHitEvent(map, !nt_src) -> !nt_ev ($FFFF none).
dst_hit_event:
	LDX.w #0
.loop
	LDA.l destroy_hit_events,X : CMP.w #$FFFF : BEQ .none
	CMP.l !nt_src : BNE .next
	LDA.l destroy_hit_events+2,X : CMP.w #$FFFF : BEQ .match
	CMP.w !d_map : BNE .next
.match
	LDA.l destroy_hit_events+4,X : STA.l !nt_ev
	RTS
.next
	TXA : CLC : ADC.w #6 : TAX
	BRA .loop
.none
	RTS

; dst_floor_event: barrierFloorEvents.get(!nt_src) -> !nt_ev.
dst_floor_event:
	LDX.w #0
.loop
	LDA.l destroy_floor_events,X : CMP.w #$FFFF : BEQ .none
	CMP.l !nt_src : BNE .next
	LDA.l destroy_floor_events+2,X : STA.l !nt_ev
	RTS
.next
	INX : INX : INX : INX
	BRA .loop
.none
	RTS

; dst_floor_source: native-barriers.js floorTileEvent(): the walk-on
; trigger event of the current cell (C0:B642..B66F). Carry set, A = event.
dst_floor_source:
	LDA.w !d_cflags : AND.w #$8000 : BEQ .no        ; behaviour bit 7
	LDA $4D : AND.w #$00FF : STA.w !d_t0
	LDA.w !d_ctile : CMP.w !d_t0 : BCC .no
	LDA.w !d_map : CMP.w #511 : BCS .no
	ASL : TAX
	LDA.l $C84000,X : STA.w !d_t1                    ; start
	LDA.l $C84002,X : STA.w !d_t2                    ; end
	LDA.w !d_ctile : SEC : SBC.w !d_t0
	STA.w !d_t3
	LDA $B8 : AND.w #$0004 : BEQ +
	INC.w !d_t3
+	LDA.w !d_t3 : ASL : CLC : ADC.w !d_t1             ; at
	CMP.w !d_t1 : BCC .no
	STA.w !d_t3
	INC : CMP.w !d_t2 : BCS .no                      ; at + 1 < end
	LDX.w !d_t3
	LDA.l $C80000,X
	SEC
	RTS
.no
	CLC
	RTS

; dst_locked_door: lockedDoorAt(map, !nt_src) -> !nt_door (index or $FFFF).
dst_locked_door:
	LDX.w #0
	LDY.w #0
.loop
	CPY.w #!DESTROY_DOORS : BCS .none
	LDA.l destroy_doors+4,X : CMP.w !d_map : BEQ +
	LDA.l destroy_doors+6,X : CMP.w !d_map : BNE .next
+	LDA.l destroy_doors+8,X : CMP.l !nt_src : BEQ +
	LDA.l destroy_doors+10,X : CMP.l !nt_src : BNE .next
+	; found the door: broken doors are open
	STX.w !d_t5
	STY.w !d_t6
	TYA : JSR dst_door_broken : BCS .none
	LDX.w !d_t5
	JSR dst_door_open : BCS .none
	LDA.w !d_t6 : STA.l !nt_door
	RTS
.next
	TXA : CLC : ADC.w #16 : TAX
	INY
	BRA .loop
.none
	RTS

; dst_door_open: door at X already passes natively (progress == openAt with
; a prepare event, >= openAt without). Carry set when open.
dst_door_open:
	LDA.l destroy_doors,X : AND.w #$00FF : PHX : TAX
	LDA.l $7ECF00,X : AND.w #$00FF : STA.w !d_t4
	PLX
	LDA.l destroy_doors+1,X : AND.w #$00FF
	CMP.w !d_t4 : BEQ .open                          ; == openAt
	BCS .closed                                      ; openAt > progress
	LDA.l destroy_doors+2,X : BNE .closed            ; prepare: only == counts
.open
	SEC
	RTS
.closed
	CLC
	RTS

; dst_door_broken: A = door index. Carry set when !P_DOORS has it.
dst_door_broken:
	TAX
	LDA.l !P_DOORS : AND.w #$00FF
-	DEX : BMI +
	LSR
	BRA -
+	LSR
	RTS

; ---------------------------------------------------------------------------
; dst_barrier_start: pending = the selected target (carry from the
; selector): X = ki-barrier record, or !nt_out for a native tile.
dst_barrier_start:
	LDA.w !d_flags : ORA.w #2 : STA.w !d_flags
	LDA.w !arg_id : STA.w !d_abar
	INC.w !out_sfx                                   ; impact sound
	LDA.w !FRAME : STA.l !bp_frame
	LDA.w !d_map : STA.l !bp_map
	LDA.w #!BS_WAIT : STA.l !bp_state
	LDA.w #$FFFF : STA.l !bp_tile : STA.l !bp_door
	CPX.w #$FFFF : BEQ .native
	; ki barrier record X
	TXA : STA.l !bp_rec
	LDA.l destroy_barriers+12,X : STA.l !bp_event
	LDA.l destroy_barriers+16,X : AND.w #$00FF : STA.l !bp_react
	LDA.l destroy_barriers+14,X : AND.w #$0004 : BEQ +
	LDA.l destroy_barriers+15,X : AND.w #$00FF : STA.l !bp_door
+	LDA.l destroy_barriers+10,X : AND.w #$00FF : TAX
	LDA.l $7ECF00,X : AND.w #$00FF : STA.l !bp_snap
	BRA .sum
.native
	LDA.w #$FFFF : STA.l !bp_rec
	LDA.l !nt_out+0 : STA.l !bp_event
	LDA.l !nt_out+2 : STA.l !bp_door
	LDA.l !nt_out+4 : STA.l !bp_tile
	LDA.l !nt_out+6 : STA.l !bp_tileid
	LDA.l !nt_out+8 : STA.l !bp_react
.sum
	JSR dst_flag_sum
	STA.l !bp_sum1
	TXA : STA.l !bp_sum2
	RTS

; dst_flag_sum: X:A = checksum of the story flags $CF00-$CFFF, except $CF0A
; (sum and sum of sums: any one- or two-byte change alters it).
dst_flag_sum:
	STZ.w !d_t0
	STZ.w !d_t1
	LDX.w #0
-	CPX.w #$000A : BEQ +
	LDA.l $7ECF00,X : AND.w #$00FF
	CLC : ADC.w !d_t0 : STA.w !d_t0
	CLC : ADC.w !d_t1 : STA.w !d_t1
+	INX : CPX.w #$0100 : BCC -
	LDA.w !d_t0
	LDX.w !d_t1
	RTS

; ---------------------------------------------------------------------------
; dst_barrier_tick: native-barriers.js tick() at the field frame boundary.
dst_barrier_tick:
	LDA.l !bp_state : BNE +
	RTS
+	LDA.l !bp_map : CMP.w !d_map : BEQ +
	LDA.w #0 : STA.l !bp_state
	RTS
+	LDA.l !bp_door : CMP.w #$FFFF : BEQ .barrier
	JMP dst_door_tick
.barrier
	; has the target opened?
	LDA.l !bp_rec : CMP.w #$FFFF : BEQ .native
	TAX
	LDA.l destroy_barriers+10,X : AND.w #$00FF : STA.w !d_t0
	LDA.l destroy_barriers+11,X : AND.w #$00FF : STA.w !d_t1
	LDX.w !d_t0
	LDA.l $7ECF00,X : AND.w #$00FF : CMP.w !d_t1 : BCC .pending
.react
	JMP .done_react
.native
	LDA.l !bp_tile : TAX
	LDA.l $7F0000,X : AND.w #$00FF : CMP.l !bp_tileid : BNE .react
	LDA.l !bp_state : CMP.w #!BS_ASKED : BNE .pending
	JSR dst_ground_ok : BCC .pending
	JSR dst_flag_sum
	CMP.l !bp_sum1 : BNE .react
	TXA : CMP.l !bp_sum2 : BNE .react
.pending
	LDA.l !bp_state : CMP.w #!BS_ASKED : BNE .request
	; requested: once control returns, retry an unfinished cave door or stop
	JSR dst_ground_ok : BCC .wait
	LDA.l !bp_frame : CLC : ADC.w #2 : CMP.w !FRAME : BCS .wait
	LDA.l !bp_rec : CMP.w #$FFFF : BEQ .stop
	TAX
	LDA.l destroy_barriers+14,X : AND.w #$0002 : BEQ .stop
	LDA.l destroy_barriers+10,X : AND.w #$00FF : TAX
	LDA.l $7ECF00,X : AND.w #$00FF : CMP.l !bp_snap : BEQ .stop : BCC .stop
	STA.l !bp_snap
	LDA.w #!BS_WAIT : STA.l !bp_state
	LDA.w !FRAME : SEC : SBC.w #26 : STA.l !bp_frame
.wait
	RTS
.stop
	LDA.w #0 : STA.l !bp_state
	RTS
.request
	LDA.w !FRAME : SEC : SBC.l !bp_frame : CMP.w #26 : BCC .wait
	JSR dst_ground_ok : BCC .wait
	LDA.l !bp_event : CMP.w #$FFFF : BEQ .stop
	LDX.w #0
	JSR dst_run_event_logged : BCC .wait
	LDA.w #!BS_ASKED : STA.l !bp_state
	LDA.w !FRAME : STA.l !bp_frame
	RTS
.done_react
	LDA.l !bp_react : BEQ +
	STA.w !out_react
	LDA.w !d_map : STA.w !out_rmap
+	LDA.w #0 : STA.l !bp_state
	RTS

; Breakable door: after 26 frames run its preparation (if still needed),
; then remember it as broken.
dst_door_tick:
	LDA.w !FRAME : SEC : SBC.l !bp_frame : CMP.w #26 : BCC .wait
	JSR dst_ground_ok : BCC .wait
	LDA.l !bp_door : ASL : ASL : ASL : ASL : TAX
	LDA.l destroy_doors+2,X : BEQ .open              ; no preparation event
	STA.w !d_t2
	LDA.l destroy_doors,X : AND.w #$00FF : STA.w !d_t0
	LDA.l destroy_doors+1,X : AND.w #$00FF : STA.w !d_t1
	LDX.w !d_t0
	LDA.l $7ECF00,X : AND.w #$00FF : CMP.w !d_t1 : BCS .open
	LDA.w !d_t2
	LDX.w #0
	JSR dst_run_event_logged : BCC .wait
.open
	LDA.l !bp_door : TAX
	LDA.w #1
-	DEX : BMI +
	ASL
	BRA -
+	SEP #$20
	ORA.l !P_DOORS : STA.l !P_DOORS
	REP #$20
	LDA.l !bp_react : BEQ +
	STA.w !out_react
	LDA.w !d_map : STA.w !out_rmap
+	LDA.w #0 : STA.l !bp_state
.wait
	RTS

; dst_run_event_logged: dst_run_event plus the test log.
dst_run_event_logged:
	PHA
	JSR dst_run_event
	PLA
	BCC +
	STA.l !dbg_ev
	LDA.l !dbg_evn : INC : STA.l !dbg_evn
	SEC
+	RTS

; ---------------------------------------------------------------------------
; Crystal orbs (native-orbs.js). dst_orb_queue: X = actor offset.
dst_orb_queue:
	LDA.l !orb_base : BNE .no
	CPX.w #$0600 : BCC .no                           ; enemies start at slot 3
	CPX.w #$1800 : BCS .no
	LDA.w $E000,X : AND.w #1 : BEQ .no
	LDA.w $E180,X : AND.w #$00FF : CMP.w #$0055 : BNE .no
	LDA.w $E03E,X : AND.w #$07FF : STA.w !d_t0
	STX.w !d_t1
	LDX.w #0
-	LDA.l destroy_orb_events,X : CMP.w #$FFFF : BEQ .no
	CMP.w !d_t0 : BEQ +
	INX : INX : INX
	BRA -
+	LDA.l destroy_orb_events+2,X : AND.w #$00FF : STA.l !orb_spell
	LDA.w !d_t0 : STA.l !orb_event
	LDA.w !d_map : STA.l !orb_map
	LDA.w !d_t1 : CLC : ADC.w #$E000 : STA.l !orb_base
	SEC
	RTS
.no
	CLC
	RTS

; dst_orb_tick: at the frame boundary, mirror the native hit context
; (C0:D453-D475: spell in $E181, actor in $3A) and start the orb's event.
dst_orb_tick:
	LDA.l !orb_base : BNE +
	RTS
+	SEC : SBC.w #$E000 : TAX
	LDA.w #0 : STA.l !orb_base
	LDA.l !orb_map : CMP.w !d_map : BNE .drop
	JSR dst_ground_ok : BCC .drop
	LDA.w $E000,X : AND.w #1 : BEQ .drop
	LDA.w $E180,X : AND.w #$00FF : CMP.w #$0055 : BNE .drop
	SEP #$20
	LDA.l !orb_spell : STA.w $E181,X
	REP #$20
	LDA.l !orb_event
	JSR dst_run_event_logged
.drop
	RTS
