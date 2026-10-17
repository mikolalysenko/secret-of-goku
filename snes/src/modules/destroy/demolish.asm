; Dungeon demolition: dungeon-geometry.js breach() / demolish() with
; native-plants.js queuedTile() witnesses.
;
; A full Super Saiyan beam (or any punch/beam aboard the Sandship before
; stage 10) marks the ordinary solid cells it crosses as wall candidates.
; The planner (at most one complete plan per frame) takes the wall run
; along the beam's axis between two real floors of the same height (at most
; ten cells), samples the floor from the incoming side (the nearby patch
; most surrounded by matching floor, so a railing or lip is not copied),
; checks the other visual layer, and queues edits for both layers with four
; witnesses: both shores, the source floor and its partner on the other
; layer. The edits apply at the native redraw boundary like any other; a
; native rebuild replays them only while every witness is unchanged.

!CL_IN    = $0001     ; placed and inside the map border
!CL_ORD   = $0002     ; ordinary: no trigger wall bit, no special behaviour, code 0
!CL_FLOOR = $0004
!CL_WALL  = $0008
!CL_AIR   = $0010
!CL_END   = $0020     ; a floor that is not dungeon air: span end, floor sample
!CL_PROT  = $0040

!c_cls  = !d_pol      ; class being built by dst_cls
!c_deco = !d_bkind    ; palace brazier decoration

; worker state (the scan words are free outside destroy_hit and the hook)
!w_off  = !s_o        ; wall cell offset
!w_dir  = !s_oend     ; attack direction 0..3
!w_horz = !s_ostep    ; 1 = horizontal run
!w_l    = !s_along    ; wall layer
!w_a    = !s_w        ; negative-side shore offset
!w_b    = !s_lo       ; positive-side shore offset
!w_src  = !s_hi       ; sampled floor offset
!w_back = !s_plo      ; partner of the floor on the other layer, $FFFF none
!w_n    = !s_phi      ; run cells
!w_fix  = !s_i        ; fixed coordinate (the row of a horizontal run)
!w_pos  = !s_c        ; wall position along the axis
!w_k    = !s_a        ; breach record index

!FS_CACHE = !DS+$00   ; 121: 11x11 window (bit0 known, bit1 same, bit2 seen)
!FS_QUEUE = !DS+$79   ; 41: breadth-first queue of window indices
!WR_LIST  = !DS+$A2   ; 21: run positions along the axis, browser order

; ---------------------------------------------------------------------------
; dst_dm_context: live map size and placed extents for dst_cls.
dst_dm_context:
	LDA $C0 : LSR : LSR : LSR : LSR
	CMP.w #128 : BCC +
	LDA.w #128
+	DEC : STA.l !dm_w1
	LDA $C2 : LSR : LSR : LSR : LSR
	CMP.w #128 : BCC +
	LDA.w #128
+	DEC : STA.l !dm_h1
	LDA $DC : AND.w #$01FF : ASL : ASL : ASL : TAX
	LDA.l destroy_map_info+4,X : STA.l !dm_ext0
	LDA.l destroy_map_info+6,X : STA.l !dm_ext1
	RTS

; ---------------------------------------------------------------------------
; dst_cls: dungeon-geometry.js tile() + ordinary/floor/wall/airMaterial for
; (!d_cx, !d_cy, !d_cl). A = class bits, 0 when outside (tile() == null);
; the cell is loaded when inside. Clobbers !d_t6.
dst_cls:
	LDA.w !d_cx : BEQ .out
	CMP.l !dm_w1 : BCS .out
	LDA.w !d_cy : BEQ .out
	CMP.l !dm_h1 : BCS .out
	LDA.l !dm_ext0
	LDX.w !d_cl : BEQ +
	LDA.l !dm_ext1
+	STA.w !d_t6
	AND.w #$00FF : BEQ .out
	DEC : CMP.w !d_cx : BCC .out                 ; x1 - 1 < cx
	LDA.w !d_t6 : XBA : AND.w #$00FF : BEQ .out
	DEC : CMP.w !d_cy : BCS .in
.out
	LDA.w #0
	RTS
.in
	; class table lookup unless this map has protected zones
	LDA.w !m_bits : AND.w #!MAP_INFO_JOCH|!MAP_INFO_WATER : BNE .slow
	LDA.w !d_cy : XBA : LSR : ORA.w !d_cx
	LDX.w !d_cl : BEQ +
	ORA.w #$4000
+	STA.w !d_coff
	TAX
	LDA.l $7F0000,X : AND.w #$00FF : STA.w !d_ctile
	ASL : ASL : CLC : ADC.w #$B800
	LDX.w !d_cl : BEQ +
	CLC : ADC.w #$0400
+	TAX
	LDA.l $7F0000,X : STA.w !d_cflags
	LDA.w !d_ctile : JSR dst_cell_class
	TAX
	LDA.l dst_tk_to_cl,X : AND.w #$00FF
	RTS
.slow
	JSR dst_load_cell
	LDA.w #!CL_IN : STA.w !c_cls
	; ordinary
	LDA.w !d_cflags : BIT.w #$D008 : BNE +
	LDA.w !d_ccode : BNE +
	LDA.w !c_cls : ORA.w #!CL_ORD : STA.w !c_cls
+	JSR dst_cls_protected
	; palace brazier decoration (palace-braziers.js palaceDecoration)
	STZ.w !c_deco
	LDA.w !m_ts : CMP.w #23 : BNE +
	LDA.w !d_cl : BNE +
	LDA.w !d_ccode : BNE +
	LDX.w !d_ctile
	LDA.l destroy_brazier_part,X : AND.w #$00FF : CMP.w #$00FF : BEQ +
	INC.w !c_deco
+	; dungeon air: unprotected, no trigger wall/special behaviour, and an
	; air metatile with code 0 or a cave current (tileset 10, codes 10-17)
	LDA.w !c_cls : AND.w #!CL_PROT : BNE .air_done
	LDA.w !d_cflags : BIT.w #$D008 : BNE .air_done
	LDA.w !d_ccode : BNE .current
	LDA.w !d_cmeta : JSR dst_bit_air : BCC .air_done
	BRA .air
.current
	LDA.w !m_ts : CMP.w #10 : BNE .air_done
	LDA.w !d_ccode : CMP.w #$0010 : BCC .air_done
	CMP.w #$0018 : BCS .air_done
.air
	LDA.w !c_cls : ORA.w #!CL_AIR : STA.w !c_cls
.air_done
	LDA.w !c_cls : AND.w #!CL_ORD : BEQ .done
	LDA.w !c_deco : BNE .done
	LDA.w !d_cflags : AND.w #$0007 : CMP.w #3 : BEQ .wall
	BCS .done
	; floor: not the blank metatile 0 of these tilesets, not a palace
	; window recess (falsePalaceFloor)
	LDA.w !d_cmeta : BNE +
	LDX.w !m_ts
	LDA.l destroy_blank_zero,X : AND.w #$00FF : BNE .done
+	LDA.w !m_ts : CMP.w #23 : BNE .floor
	LDA.w !d_cl : BNE .floor
	LDA.w !d_cmeta : JSR dst_bit_false_floor : BCS .done
.floor
	LDA.w !c_cls : ORA.w #!CL_FLOOR
	BIT.w #!CL_AIR : BNE +
	ORA.w #!CL_END
+	STA.w !c_cls
	BRA .done
.wall
	LDA.w !c_cls : BIT.w #!CL_AIR|!CL_PROT : BNE .done
	ORA.w #!CL_WALL : STA.w !c_cls
.done
	LDA.w !c_cls
	RTS

; !TK_* nibble -> !CL_* class (with !CL_IN).
dst_tk_to_cl:
	for i = 0..16
		db !CL_IN|((!i&!TK_ORD)/!TK_ORD*!CL_ORD)|((!i&!TK_END)/!TK_END*(!CL_END|!CL_FLOOR))|((!i&!TK_WALL)/!TK_WALL*!CL_WALL)
	endfor

; Protected cells (dungeon-geometry.js protectedCell): Joch's expanded
; training room (BG1 except its pavilion floor), the Water Palace stair
; pockets, and the cave's black metatile (whose cave-void analysis never
; changes a breach: it is solid, so neither floor nor wall).
dst_cls_protected:
	LDA.w !d_map : CMP.w #!DESTROY_JOCH_MAP : BNE .water
	LDA.l !dm_w1 : CMP.w #!DESTROY_JOCH_SIZE-1 : BNE .water
	LDA.l !dm_h1 : CMP.w #!DESTROY_JOCH_SIZE-1 : BNE .water
	LDA.w !d_cl : BNE .water
	LDA.w !d_ctile : CMP.w #!DESTROY_JOCH_KEEP : BNE .prot
.water
	LDA.w !d_map : CMP.w #!DESTROY_WATER_MAP : BNE .cave
	LDA.w !d_cy : CMP.w #!DESTROY_WATER_Y0 : BCC .cave
	CMP.w #!DESTROY_WATER_Y1+1 : BCS .cave
	LDA.w !d_cx : CMP.w #!DESTROY_WATER_X0 : BCC .cave
	CMP.w #!DESTROY_WATER_X1+1 : BCS .cave
	CMP.w #!DESTROY_WATER_GAP : BCC .prot
	CMP.w #!DESTROY_WATER_GAP+2 : BCS .prot
.cave
	LDA.w !m_ts : CMP.w #10 : BNE .no
	LDA.w !d_cl : BNE .no
	LDA.w !d_cmeta : CMP.w #5 : BNE .no
.prot
	LDA.w !c_cls : ORA.w #!CL_PROT : STA.w !c_cls
.no
	RTS

; dst_cls_at: classify the cell at offset A (layer bit $4000). A = class.
dst_cls_at:
	STA.w !d_coff
	AND.w #$007F : STA.w !d_cx
	LDA.w !d_coff : AND.w #$3F80 : ASL : XBA : STA.w !d_cy
	LDA.w !d_coff : AND.w #$4000 : BEQ +
	LDA.w #1
+	STA.w !d_cl
	JMP dst_cls

; ---------------------------------------------------------------------------
; Planner job: the browser mod re-evaluates every unused cell of a beam each
; frame; the planner walks the covered band (the union of a beam's frames)
; with a cursor instead, a few cells and at most one complete plan per
; frame. A wider band restarts the walk; a longer one extends it.
; dst_job_update (from dst_scan_attack, after the scan, with !sc_* set).
dst_job_update:
	LDA.w !FRAME : STA.l !pj_alive
	LDA.w !arg_id : BEQ .new
	CMP.l !pj_id : BNE .new
	LDA.l !pj_state : BEQ .new
	; the same beam: a longer band extends the walk; a wider one is walked
	; again from the start once this walk ends
	LDA.w !sc_half : CMP.l !pj_half : BEQ .len : BCC .len
	STA.l !pj_half
	LDA.w #1 : STA.l !pj_side
	LDA.l !pj_state : CMP.w #2 : BNE .len
	LDA.w #1 : STA.l !pj_state             ; walked: the new sides need a walk
	LDA.w #0 : STA.l !pj_side
	JSR dst_job_start
.len
	LDA.w !sc_len : CMP.l !pj_len : BEQ .same : BCC .same
	STA.l !pj_len
	JSR dst_job_axes
	LDA.l !pj_len : JSR dst_band_outer
	LDA.w !s_oend : STA.l !pj_oend
	LDA.w #1 : STA.l !pj_state
.same
	RTS
.new
	LDA.w !arg_id : STA.l !pj_id
	LDA.w !arg_x : STA.l !pj_x
	LDA.w !arg_y : STA.l !pj_y
	LDA.w !arg_dir : AND.w #3 : STA.l !pj_dir
	LDA.w !sc_len : STA.l !pj_len
	LDA.w !sc_half : STA.l !pj_half
	LDA.w !arg_taper : STA.l !pj_taper
	LDA.w !sc_layer : STA.l !pj_layer
	LDA.w #0 : STA.l !pj_dirty
	STA.l !pj_side
	; fall through
; dst_job_start: cursor at the first cell of the band.
dst_job_start:
	JSR dst_job_axes
	LDA.l !pj_len : JSR dst_band_outer : BCC +
	LDA.w #0 : STA.l !pj_state
	RTS
+	LDA.w !s_o : STA.l !pj_o
	LDA.w !s_oend : STA.l !pj_oend
	LDA.w !s_ostep : STA.l !pj_step
	JSR dst_job_row
	LDA.w #1 : STA.l !pj_state
	RTS

; dst_job_axes: band axes of the job.
dst_job_axes:
	LDA.l !pj_x : TAX
	LDA.l !pj_y : TAY
	LDA.l !pj_dir
	JMP dst_band_axes

; dst_job_row: inner cells of the cursor's outer cell (axes set).
dst_job_row:
	LDA.l !pj_o : STA.w !s_o
	JSR dst_band_along
	LDA.l !pj_taper : TAX
	LDA.l !pj_half
	JSR dst_band_row
	LDA.w !s_lo : STA.l !pj_i
	LDA.w !s_hi : STA.l !pj_hi
	RTS

; ---------------------------------------------------------------------------
; dst_walls_work (destroy_field_frame): advance the planner job.
dst_walls_work:
	LDA.l !pl_stage : BNE .walk          ; finish a suspended plan first
	LDA.l !pj_state : BNE +
	RTS
+	CMP.w #1 : BEQ .walk
	; walked: like the browser re-planning every frame, walk again while
	; the beam is still being fired and demolition changed the map
	JSR dst_job_rewalk : BCS .walk
	RTS
.walk
	; only work when the frame has time left; a suspended plan that waited
	; three frames gets one sampler node anyway
	LDA.w #0 : STA.l !pl_quota
	JSR dst_budget : BCC .go
	LDA.l !pl_stage : BNE +
	RTS
+	LDA.l !pl_wait : INC : STA.l !pl_wait
	CMP.w #3 : BCS +
	RTS
+	LDA.w #1 : STA.l !pl_quota
.go
	LDA.w #0 : STA.l !pl_wait
	STA.l !pj_plans
	JSR dst_dm_context
	LDA.l !pl_stage : BEQ .cells
	JSR dst_plan_resume : BCS +
	RTS                                ; still sampling
+	; finished: walk on while the job walks and the frame has time
	LDA.w #1 : STA.l !pj_plans
	LDA.l !pj_state : CMP.w #1 : BEQ +
	RTS
+	JSR dst_budget : BCC .cells
	RTS
.cells
	LDA.w #255 : STA.l !pj_left
.cell
	LDA.l !pj_i : CMP.l !pj_hi : BEQ + : BCC +
	JMP .next_row
+	; cell (outer, inner) of the band
	PHA
	INC : STA.l !pj_i
	LDA.l !pj_dir : TAX
	LDA.l dst_dir_horz,X : AND.w #$00FF : BEQ +
	PLA : STA.w !d_cy
	LDA.l !pj_o : STA.w !d_cx
	BRA ++
+	PLA : STA.w !d_cx
	LDA.l !pj_o : STA.w !d_cy
++	LDA.l !pj_layer : STA.w !d_cl
	; an ordinary solid cell (class table), not settled, not queued
	LDA.w !d_cx : CMP.w #128 : BCS .skip
	LDA.w !d_cy : CMP.w #128 : BCS .skip
	XBA : LSR : ORA.w !d_cx
	LDX.w !d_cl : BEQ +
	ORA.w #$4000
+	TAX
	LDA.l $7F0000,X
	JSR dst_cell_class : AND.w #!TK_WALL : BEQ .skip
	JSR dst_load_cell : BCS .skip
	LDA.w !d_cflags : BIT.w #$D008 : BNE .skip
	AND.w #$0007 : CMP.w #3 : BNE .skip
	LDA.w !d_ccode : BNE .skip
	LDA.w !d_coff : STA.w !w_off
	LDA.l !pj_dir : STA.w !w_dir
	JSR dst_breach_axis
	JSR dst_run_failed : BCS .skip
	LDA.w !w_off : JSR dst_queue_find : BCS .skip
	JSR dst_breach
	BCC .budget
	; a plan began: stop if it is still sampling
	LDA.l !pl_stage : BNE .stop
	LDA.l !pj_plans : INC : STA.l !pj_plans
	CMP.w #4 : BCS .stop
.budget
	JSR dst_budget : BCS .stop
.skip
	LDA.l !pj_left : DEC : STA.l !pj_left
	BEQ .stop
	AND.w #15 : BNE +
	JSR dst_budget : BCS .stop
+	JMP .cell
.stop
	RTS
.next_row
	LDA.l !pj_o : CMP.l !pj_oend : BEQ .walked
	CLC : ADC.l !pj_step : STA.l !pj_o
	JSR dst_job_axes
	JSR dst_job_row
	JMP .cell
.walked
	; widened meanwhile: walk the whole band again
	LDA.l !pj_side : BEQ +
	LDA.w #0 : STA.l !pj_side
	JSR dst_job_start
	RTS
+	LDA.w #2 : STA.l !pj_state
	RTS

; dst_job_rewalk: restart the walk when demolition rows were applied since
; it began and the beam was fired this frame or the last. Carry set when
; restarted.
dst_job_rewalk:
	LDA.l !pj_dirty : BEQ .no
	LDA.w !FRAME : SEC : SBC.l !pj_alive : CMP.w #2 : BCS .no
	LDA.w #0 : STA.l !pj_dirty
	JSR dst_run_fail_clear
	JSR dst_job_start
	SEC
	RTS
.no
	CLC
	RTS

; dst_budget: carry set when this field frame's time for background work
; is spent. A field frame that began in the visible part may work until
; !DESTROY_PLAN_LINE of that frame; one that began in vblank (the previous
; frame ran long) until !DESTROY_PLAN_LINE of the next; one that began
; between the two has none. X and Y are preserved.
dst_budget:
	JSR dst_vline
	PHA                                         ; the line now
	LDA.w !d_vstart : CMP.w #225 : BCS .vblank
	CMP.w #!DESTROY_PLAN_LINE : BCS .out
	PLA : CMP.w !d_vstart : BCC .spent          ; wrapped past vblank
	CMP.w #!DESTROY_PLAN_LINE : BCS .spent
	CLC
	RTS
.vblank
	PLA : CMP.w !d_vstart : BCS .in             ; still in that vblank
	CMP.w #!DESTROY_PLAN_LINE : BCS .spent
.in
	CLC
	RTS
.out
	PLA
.spent
	SEC
	RTS

; dst_vline: A = current scanline (latched H/V counter).
dst_vline:
	SEP #$20
	LDA.l $00213F                      ; reset the counter read flip-flops
	LDA.l $002137                      ; latch
	LDA.l $00213D : XBA
	LDA.l $00213D : AND.b #$01 : XBA
	REP #$20
	RTS

; ---------------------------------------------------------------------------
; dst_breach: breach() for wall cell !w_off and attack direction !w_dir.
; Carry set when a full plan ran (successful or not); clear for cheap
; rejections.
dst_breach:
	; not already queued, still a wall
	LDA.w !w_off : JSR dst_queue_find : BCC +
	CLC : RTS
+	LDA.w !w_off : JSR dst_cls_at
	AND.w #!CL_WALL : BNE +
	CLC : RTS
+	JSR dst_breach_axis
	; a run already settled for this beam?
	JSR dst_run_failed : BCC +
	CLC : RTS
+	JSR dst_span : BCS +
	JSR dst_run_fail_note
	CLC : RTS
+	; both shores at the same terrain height
	LDA.w !w_a : JSR dst_cls_at
	LDA.w !d_cflags : AND.w #$0003 : STA.w !d_t0
	LDA.w !w_b : JSR dst_cls_at
	LDA.w !d_cflags : AND.w #$0003 : CMP.w !d_t0 : BEQ +
	JSR dst_run_fail_note
	CLC : RTS
+	; a free breach record (no queued edit still uses it)
	JSR dst_breach_slot : BCS +
	; all records busy: step the cursor back and retry next frame
	LDA.l !pj_i : DEC : STA.l !pj_i
	LDA.w #4 : STA.l !pj_plans
	SEC : RTS
+	; incoming shore: the beam travels down/right from a, up/left from b;
	; sample its floor (possibly over several frames)
	LDA.w !w_a
	LDX.w !w_dir : BEQ +
	CPX.w #1 : BEQ +
	LDA.w !w_b
+	JSR dst_fs_begin
	LDA.w !w_off : STA.l !pl_off
	LDA.w !w_dir : STA.l !pl_dir
	LDA.w !w_a : STA.l !pl_a
	LDA.w !w_b : STA.l !pl_b
	LDA.w !w_n : STA.l !pl_n
	LDA.w !w_k : STA.l !pl_k
	JSR dst_fs_save
	LDA.w #1 : STA.l !pl_stage
	JSR dst_plan_continue
	SEC
	RTS

; dst_plan_resume: continue a suspended plan (walls work, next frame).
; Carry set when it finished.
dst_plan_resume:
	LDA.l !pl_off : STA.w !w_off
	LDA.l !pl_dir : STA.w !w_dir
	JSR dst_breach_axis
	LDA.l !pl_a : STA.w !w_a
	LDA.l !pl_b : STA.w !w_b
	LDA.l !pl_n : STA.w !w_n
	LDA.l !pl_k : STA.w !w_k
	LDA.l !pl_stage : CMP.w #2 : BNE +
	LDA.l !pl_ox : BRA dst_plan_continue_finish   ; sampled: finish it
+	JSR dst_fs_load
	; fall through
; dst_plan_continue: run the floor sample; finish the plan when it is done
; (in the next frame when this one has no time left: stage 2, the sampled
; floor kept in !pl_ox).
dst_plan_continue:
	JSR dst_fs_run : BCS +
	JSR dst_fs_save
	CLC
	RTS
+	STA.w !w_src
	LDA.l !dbg_dry : BNE .now
	JSR dst_budget : BCC .now
	LDA.w !w_src : STA.l !pl_ox
	LDA.w #2 : STA.l !pl_stage
	CLC
	RTS
.now
	LDA.w !w_src
dst_plan_continue_finish:
	STA.w !w_src
	LDA.w #0 : STA.l !pl_stage
	JSR dst_breach_layers : BCS +
	JSR dst_run_fail_note
	SEC
	RTS
+	LDA.l !dbg_dry : BNE +
	JSR dst_breach_queue
	JSR dst_run_fail_note                ; planned: settled for this walk
+	SEC
	RTS

; dst_breach_axis: !w_l, !w_horz, !w_fix, !w_pos for !w_off / !w_dir.
dst_breach_axis:
	LDA.w !w_off : AND.w #$4000 : BEQ +
	LDA.w #1
+	STA.w !w_l
	LDA.w !w_dir : AND.w #3 : TAX
	LDA.l dst_dir_horz,X : AND.w #$00FF : STA.w !w_horz
	LDA.w !w_off : AND.w #$007F : STA.w !d_t0         ; tx
	LDA.w !w_off : AND.w #$3F80 : ASL : XBA : STA.w !d_t1   ; ty
	LDA.w !w_horz : BEQ +
	LDA.w !d_t1 : STA.w !w_fix
	LDA.w !d_t0 : STA.w !w_pos
	RTS
+	LDA.w !d_t0 : STA.w !w_fix
	LDA.w !d_t1 : STA.w !w_pos
	RTS

; ---------------------------------------------------------------------------
; dst_span: span(t, axis, wall, 10). Records the run in !WR_LIST (the wall,
; then the negative side outward, then the positive side outward) and the
; shores !w_a / !w_b. Carry set when both shores are floors and the run has
; at most ten cells.
dst_span:
	SEP #$20
	LDA.w !w_pos : STA.l !WR_LIST
	REP #$20
	LDA.w #1 : STA.w !w_n
	LDA.w #$FFFF : STA.w !d_t2           ; direction -1
	JSR dst_span_side : BCC .fail
	LDA.w !d_coff : STA.w !w_a
	LDA.w #1 : STA.w !d_t2
	JSR dst_span_side : BCC .fail
	LDA.w !d_coff : STA.w !w_b
	LDA.w !w_n : CMP.w #11 : BCS .fail
	SEC
	RTS
.fail
	CLC
	RTS

; One direction (!d_t2 = +-1): walls until a floor end within 10 steps.
dst_span_side:
	LDA.w #1 : STA.w !d_t1               ; step
.step
	LDA.w !d_t2 : BMI +
	LDA.w !w_pos : CLC : ADC.w !d_t1
	BRA ++
+	LDA.w !w_pos : SEC : SBC.w !d_t1
++	STA.w !d_t3
	JSR dst_axis_cell
	JSR dst_cls
	BIT.w #!CL_IN : BEQ .fail
	BIT.w #!CL_END : BNE .found
	BIT.w #!CL_WALL : BEQ .fail
	LDA.w !w_n : TAX
	SEP #$20
	LDA.w !d_t3 : STA.l !WR_LIST,X
	REP #$20
	INC.w !w_n
	INC.w !d_t1
	LDA.w !d_t1 : CMP.w #11 : BCC .step
.fail
	CLC
	RTS
.found
	SEC
	RTS

; Set !d_cx/!d_cy/!d_cl for position A along the run's axis.
dst_axis_cell:
	LDX.w !w_horz : BEQ +
	STA.w !d_cx
	LDA.w !w_fix : STA.w !d_cy
	BRA ++
+	STA.w !d_cy
	LDA.w !w_fix : STA.w !d_cx
++	LDA.w !w_l : STA.w !d_cl
	RTS

; ---------------------------------------------------------------------------
; Failed runs (per attack): key = layer<<15 | direction<<13 | fixed<<6.
; A wall position inside a recorded [lo, hi] is skipped.
dst_run_key:
	LDA.w !w_fix : XBA : LSR : LSR       ; fixed << 6
	STA.w !d_t0
	LDA.w !w_dir : AND.w #3 : XBA : ASL : ASL : ASL : ASL : ASL   ; dir << 13
	ORA.w !d_t0
	LDX.w !w_l : BEQ +
	ORA.w #$8000
+	RTS

dst_run_failed:
	JSR dst_run_key : STA.w !d_t1
	LDX.w #0
-	LDA.l !DWF,X : CMP.w !d_t1 : BNE +
	LDA.l !DWF+2,X : AND.w #$00FF : CMP.w !w_pos : BEQ .yes : BCS +
	LDA.l !DWF+3,X : AND.w #$00FF : CMP.w !w_pos : BCS .yes
+	INX : INX : INX : INX
	CPX.w #!DWF_MAX*4 : BCC -
	CLC
	RTS
.yes
	SEC
	RTS

; Record the walked run (the wall cells in !WR_LIST, which all share the
; span's outcome) as settled for this walk.
dst_run_fail_note:
	JSR dst_run_key : STA.w !d_t1
	; extent of the walked cells
	LDA.w !w_pos : STA.w !d_t2              ; min
	STA.w !d_t3                             ; max
	LDX.w !w_n : BEQ .store
-	DEX : BMI .store
	LDA.l !WR_LIST,X : AND.w #$00FF
	CMP.w !d_t2 : BCS +
	STA.w !d_t2
+	CMP.w !d_t3 : BCC +
	STA.w !d_t3
+	BRA -
.store
	LDA.l !dw_frun : INC : AND.w #!DWF_MAX-1 : STA.l !dw_frun
	ASL : ASL : TAX
	LDA.w !d_t1 : STA.l !DWF,X
	SEP #$20
	LDA.w !d_t2 : STA.l !DWF+2,X
	LDA.w !d_t3 : STA.l !DWF+3,X
	REP #$20
	RTS

; Forget failed runs (a new beam, or a new map).
dst_run_fail_clear:
	LDA.w #$FFFF
	LDX.w #!DWF_MAX*4-4
-	STA.l !DWF,X
	DEX : DEX : DEX : DEX
	BPL -
	RTS

; ---------------------------------------------------------------------------
; dst_fs_begin / dst_fs_run: floorSample(origin): breadth-first over
; matching floor (floor, not air, same height bits as the shore) within
; Manhattan distance 4 of the shore (A = its offset), choosing the first cell
; with the highest score (matching cells in its 3x3 block, minus 9 when its
; own flags have bits $60) whose partner on the other layer is present
; exactly when the shore's is, and ordinary. Stops at a perfect 9.
; Window: 11x11 cells centred on the shore, index (dy+5)*11 + (dx+5).
; The search can stop between nodes when the frame runs out of time; the
; words below that outlive a node are kept in !PL by dst_fs_save/load.
!fs_ox   = !d_t0
!fs_oy   = !d_t1
!fs_q    = !d_t2      ; best quality
!fs_best = !d_t3      ; best window index
!fs_head = !d_t4
!fs_tail = !d_t5
!fs_cnt  = !d_brep    ; score accumulator (dst_cls leaves it alone)
!fs_part = !d_bbraz   ; partner class of the current node
!fs_nx   = !cs+$0     ; neighbour dx+5
!fs_ny   = !cs+$2     ; neighbour dy+5
!fs_tmp  = !cs+$4
!fs_qn   = !cs+$6     ; score of the current node
!fs_node = !cs+$8     ; current node index
!fs_dir  = !cs+$A     ; neighbour counter
!fs_h    = !cs+$C     ; shore height bits
!fs_back = !cs+$E     ; shore partner present (0/1)
dst_fs_begin:
	STA.w !d_coff
	AND.w #$007F : STA.w !fs_ox
	LDA.w !d_coff : AND.w #$3F80 : ASL : XBA : STA.w !fs_oy
	LDA.w #0
	LDX.w #120                         ; words: bytes 0..121 (121 = queue[0])
-	STA.l !FS_CACHE,X
	DEX : DEX : BPL -
	; shore height bits
	LDA.w !fs_ox : STA.w !d_cx
	LDA.w !fs_oy : STA.w !d_cy
	LDA.w !w_l : STA.w !d_cl
	JSR dst_load_cell
	LDA.w !d_cflags : AND.w #$0003 : STA.w !fs_h
	; the shore is the initial best, seen and queued first; its score and
	; partner come from the first node dst_fs_run takes
	LDA.w #60 : STA.w !fs_best
	SEP #$20
	LDA.b #60 : STA.l !FS_QUEUE
	LDA.l !FS_CACHE+60 : ORA.b #4 : STA.l !FS_CACHE+60
	REP #$20
	STZ.w !fs_head
	LDA.w #1 : STA.w !fs_tail
	RTS

; dst_fs_save / dst_fs_load: the sampler's words across frames (the window
; cache and queue stay in !DS, which only the planner uses).
dst_fs_save:
	LDA.w !fs_ox : STA.l !pl_ox
	LDA.w !fs_oy : STA.l !pl_oy
	LDA.w !fs_q : STA.l !pl_q
	LDA.w !fs_best : STA.l !pl_best
	LDA.w !fs_head : STA.l !pl_head
	LDA.w !fs_tail : STA.l !pl_tail
	LDA.w !fs_h : STA.l !pl_h
	LDA.w !fs_back : STA.l !pl_back
	RTS
dst_fs_load:
	LDA.l !pl_ox : STA.w !fs_ox
	LDA.l !pl_oy : STA.w !fs_oy
	LDA.l !pl_q : STA.w !fs_q
	LDA.l !pl_best : STA.w !fs_best
	LDA.l !pl_head : STA.w !fs_head
	LDA.l !pl_tail : STA.w !fs_tail
	LDA.l !pl_h : STA.w !fs_h
	LDA.l !pl_back : STA.w !fs_back
	RTS

; dst_fs_run: breadth-first steps until the sample is decided (carry set,
; A = chosen offset) or the frame budget is spent (carry clear). Outside the
; budget only !pl_quota forced nodes run; the debug dry run has no limit.
dst_fs_run:
.node
	LDA.w !fs_head : CMP.w !fs_tail : BCC +
	JMP .done
+	; frame budget
	LDA.l !dbg_dry : BNE .go
	JSR dst_budget : BCC .go
	LDA.l !pl_quota : BEQ +
	DEC : STA.l !pl_quota
	BRA .go
+	CLC
	RTS
.go
	LDX.w !fs_head
	LDA.l !FS_QUEUE,X : AND.w #$00FF : STA.w !fs_node
	INC.w !fs_head
	JSR dst_fs_partner : STA.w !fs_part
	JSR dst_fs_score : STA.w !fs_qn
	LDA.w !fs_head : CMP.w #1 : BNE .compare
	; the shore: quality = its score; its partner presence is the reference
	LDA.w !fs_part : AND.w #1 : STA.w !fs_back
	LDA.w !fs_qn : STA.w !fs_q
	BRA .stop
.compare
	; better, with a matching ordinary partner (or none, like the shore)?
	LDA.w !fs_part : AND.w #1 : CMP.w !fs_back : BNE .stop
	LDA.w !fs_part : CMP.w #1 : BEQ .stop
	LDA.w !fs_qn : SEC : SBC.w !fs_q
	BEQ .stop : BMI .stop
	LDA.w !fs_qn : STA.w !fs_q
	LDA.w !fs_node : STA.w !fs_best
.stop
	LDA.w !fs_q : CMP.w #9 : BNE .expand
	JMP .done
.expand
	STZ.w !fs_dir
.dir
	LDA.w !fs_dir : CMP.w #4 : BCC +
	JMP .node
+	TAX
	; neighbour (dx+5, dy+5) of the node
	LDA.l dst_fs_dx,X : AND.w #$00FF : DEC : STA.w !fs_tmp
	LDX.w !fs_node
	LDA.l dst_win_dx,X : AND.w #$00FF : CLC : ADC.w !fs_tmp : STA.w !fs_nx
	LDX.w !fs_dir
	LDA.l dst_fs_dy,X : AND.w #$00FF : DEC : STA.w !fs_tmp
	LDX.w !fs_node
	LDA.l dst_win_dy,X : AND.w #$00FF : CLC : ADC.w !fs_tmp : STA.w !fs_ny
	; Manhattan distance from the shore <= 4
	LDA.w !fs_nx : SEC : SBC.w #5 : BPL +
	EOR.w #$FFFF : INC
+	STA.w !fs_tmp
	LDA.w !fs_ny : SEC : SBC.w #5 : BPL +
	EOR.w #$FFFF : INC
+	CLC : ADC.w !fs_tmp : CMP.w #5 : BCS .next_dir
	; window index
	LDA.w !fs_ny : ASL : STA.w !fs_tmp
	ASL : ASL : CLC : ADC.w !fs_tmp : CLC : ADC.w !fs_ny   ; *11
	CLC : ADC.w !fs_nx
	STA.w !fs_tmp
	TAX
	LDA.l !FS_CACHE,X : AND.w #4 : BNE .next_dir           ; seen
	LDA.w !fs_tmp : JSR dst_fs_same : BCC .next_dir
	LDX.w !fs_tmp
	SEP #$20
	LDA.l !FS_CACHE,X : ORA.b #4 : STA.l !FS_CACHE,X
	LDA.w !fs_tmp
	LDX.w !fs_tail
	STA.l !FS_QUEUE,X
	REP #$20
	INC.w !fs_tail
.next_dir
	INC.w !fs_dir
	JMP .dir
.done
	; offset of the best cell
	LDX.w !fs_best
	LDA.l dst_win_dy,X : AND.w #$00FF : CLC : ADC.w !fs_oy : SEC : SBC.w #5
	XBA : LSR : STA.w !fs_tmp
	LDX.w !fs_best
	LDA.l dst_win_dx,X : AND.w #$00FF : CLC : ADC.w !fs_ox : SEC : SBC.w #5
	ORA.w !fs_tmp
	LDX.w !w_l : BEQ +
	ORA.w #$4000
+	SEC
	RTS

; dst_fs_cell: !d_cx/!d_cy/!d_cl of window index X on layer A.
dst_fs_cell:
	STA.w !d_cl
	LDA.l dst_win_dx,X : AND.w #$00FF : CLC : ADC.w !fs_ox : SEC : SBC.w #5 : STA.w !d_cx
	LDA.l dst_win_dy,X : AND.w #$00FF : CLC : ADC.w !fs_oy : SEC : SBC.w #5 : STA.w !d_cy
	RTS

; dst_fs_same: A = window index -> carry = matching floor. Cached.
dst_fs_same:
	TAX
	LDA.l !FS_CACHE,X : BIT.w #1 : BEQ .compute
	LSR : LSR                                     ; bit 1 -> carry
	RTS
.compute
	PHX
	LDA.w !w_l : JSR dst_fs_cell
	JSR dst_cls                                   ; off-grid cells are outside
	AND.w #!CL_END : BEQ .not
	LDA.w !d_cflags : AND.w #$0003 : CMP.w !fs_h : BNE .not
	LDA.w !d_cflags : AND.w #$0060 : BEQ +
	LDA.w #8                                      ; bit 3: flags $60 (score - 9)
+	ORA.w #3
	PLX
	SEP #$20
	ORA.l !FS_CACHE,X : STA.l !FS_CACHE,X
	REP #$20
	SEC
	RTS
.not
	PLX
	SEP #$20
	LDA.l !FS_CACHE,X : ORA.b #1 : STA.l !FS_CACHE,X
	REP #$20
	CLC
	RTS

; dst_fs_score: score of node !fs_node (see dst_floor_sample).
dst_fs_score:
	STZ.w !fs_cnt
	LDY.w #0
.cell
	PHY
	TYA : ASL : TAX
	LDA.w !fs_node : CLC : ADC.l dst_fs_block,X
	JSR dst_fs_same
	PLY
	BCC +
	INC.w !fs_cnt
+	INY : CPY.w #9 : BCC .cell
	; the node's own flags (cached with its 'same' answer: nodes match)
	LDX.w !fs_node
	LDA.l !FS_CACHE,X : AND.w #8 : BEQ +
	LDA.w !fs_cnt : SEC : SBC.w #9 : STA.w !fs_cnt
+	LDA.w !fs_cnt
	RTS

; dst_fs_partner: node !fs_node's cell on the other layer. A = 0 none,
; 1 present but not ordinary, 3 present and ordinary.
dst_fs_partner:
	LDX.w !fs_node
	LDA.w !w_l : EOR.w #1 : JSR dst_fs_cell
	JSR dst_cls
	BIT.w #!CL_IN : BEQ .none
	BIT.w #!CL_ORD : BEQ .bad
	LDA.w #3
	RTS
.bad
	LDA.w #1
	RTS
.none
	LDA.w #0
	RTS

; 3x3 block offsets in window indices (row-major).
dst_fs_block:
	dw -12,-11,-10,-1,0,1,10,11,12
; neighbour order (dungeon-geometry.js): down, up, right, left; +1 bias
dst_fs_dx:
	db 1,1,2,0
dst_fs_dy:
	db 2,0,1,1
; window index -> dx+5 / dy+5
dst_win_dx:
	for i = 0..121
		db !i%11
	endfor
dst_win_dy:
	for i = 0..121
		db !i/11
	endfor

; ---------------------------------------------------------------------------
; dst_breach_layers: the partner of the sampled floor on the other layer
; must be ordinary when present, and every run cell's partner must exist
; exactly when it does, and be ordinary. Carry set when safe.
dst_breach_layers:
	LDA.w !w_src : AND.w #$4000 : EOR.w #$4000 : STA.w !d_t0      ; other layer bit
	LDA.w !w_src : AND.w #$3FFF : ORA.w !d_t0
	JSR dst_cls_at
	STA.w !d_t1
	LDA.w #$FFFF : STA.w !w_back
	LDA.w !d_t1 : BIT.w #!CL_IN : BEQ .cells
	BIT.w #!CL_ORD : BNE +
	CLC
	RTS
+	LDA.w !d_coff : STA.w !w_back
.cells
	LDX.w #0
.cell
	STX.w !d_t2
	LDA.l !WR_LIST,X : AND.w #$00FF
	JSR dst_axis_cell
	LDA.w !d_cl : EOR.w #1 : STA.w !d_cl
	JSR dst_cls
	STA.w !d_t1
	; present exactly when the floor's partner is
	AND.w #!CL_IN : BEQ +
	LDA.w #1
+	STA.w !d_t3
	LDA.w !w_back : CMP.w #$FFFF : BEQ +
	LDA.w #1
	BRA ++
+	LDA.w #0
++	CMP.w !d_t3 : BNE .unsafe
	LDA.w !d_t3 : BEQ +
	LDA.w !d_t1 : AND.w #!CL_ORD : BEQ .unsafe
+	LDX.w !d_t2 : INX
	CPX.w !w_n : BCC .cell
	SEC
	RTS
.unsafe
	CLC
	RTS

; ---------------------------------------------------------------------------
; Breach records: 16 x 4 witnesses (offset.w, tile, flags, behaviour, code).
; dst_breach_slot: claim the next record unless a live queue entry still
; refers to it; smashed-object records that refer to it are forgotten.
dst_breach_slot:
	LDA.w !d_bnext : STA.w !w_k
	; live queue entries using it?
	LDA.w !d_qn : ASL : ASL : ASL : STA.w !d_t5
	LDX.w #0
-	CPX.w !d_t5 : BCS .free
	LDA.l !DQ,X : CMP.w #$FFFF : BEQ +
	LDA.l !DQ+6,X : AND.w #$00F8 : STA.w !d_t6
	LDA.w !w_k : ASL : ASL : ASL : ASL : ORA.w #!QM_DEMO
	CMP.w !d_t6 : BNE +
	CLC
	RTS
+	TXA : CLC : ADC.w #8 : TAX
	BRA -
.free
	; drop smashed-object records of the old breach
	LDA.w !w_k : ASL : ASL : ASL : ASL : ORA.w #!QM_DEMO : STA.w !d_t6
	LDX.w #0
-	TXA : LSR : LSR : LSR : CMP.w !d_cn : BCS .claimed
	LDA.l !DC+7,X : AND.w #$00F8 : CMP.w !d_t6 : BNE +
	; remove entry X: move the last one here
	DEC.w !d_cn
	PHX
	LDA.w !d_cn : ASL : ASL : ASL : TAY
	PHB
	PEA $3333 : PLB : PLB
	LDA.w !DCW,Y : STA.w !DCW,X
	LDA.w !DCW+2,Y : STA.w !DCW+2,X
	LDA.w !DCW+4,Y : STA.w !DCW+4,X
	LDA.w !DCW+6,Y : STA.w !DCW+6,X
	PLB
	PLX
	BRA -
+	TXA : CLC : ADC.w #8 : TAX
	BRA -
.claimed
	LDA.w !w_k : INC : AND.w #!DQ_BREACHES-1 : STA.w !d_bnext
	SEC
	RTS

; Store witness A (offset, $FFFF none) as number Y (0..3) of record !w_k.
dst_witness:
	STA.w !d_t0
	LDA.w !w_k : ASL : STA.w !d_t1               ; *2
	ASL : CLC : ADC.w !d_t1 : ASL : ASL          ; *24
	STA.w !d_t1
	TYA : ASL : STA.w !d_t2                      ; *2
	ASL : CLC : ADC.w !d_t2                      ; *6
	CLC : ADC.w !d_t1 : TAX
	LDA.w !d_t0 : STA.l !DB,X
	CMP.w #$FFFF : BEQ .done
	PHX
	JSR dst_load_offset
	PLX
	SEP #$20
	LDA.w !d_ctile : STA.l !DB+2,X
	LDA.w !d_cflags : STA.l !DB+3,X
	LDA.w !d_cflags+1 : STA.l !DB+4,X
	LDA.w !d_ccode : STA.l !DB+5,X
	REP #$20
.done
	RTS

; dst_breach_valid: A = record. Carry set when every witness still holds
; its tile and that tile's descriptor. Preserves the current-cell words.
dst_breach_valid:
	AND.w #!DQ_BREACHES-1
	ASL : STA.w !d_t5
	ASL : CLC : ADC.w !d_t5 : ASL : ASL          ; *24
	TAX
	LDY.w #4
.witness
	LDA.l !DB,X : CMP.w #$FFFF : BEQ .next
	PHX
	TAX
	LDA.l $7F0000,X : AND.w #$00FF : STA.w !d_t5      ; tile now
	TXA : AND.w #$4000 : BEQ +
	LDA.w #$0400
+	STA.w !d_t6
	PLX
	LDA.l !DB+2,X : AND.w #$00FF : CMP.w !d_t5 : BNE .bad
	; descriptor of that tile on the witness's layer
	PHX
	LDA.w !d_t5 : ASL : ASL : CLC : ADC.w #$B800 : CLC : ADC.w !d_t6 : TAX
	LDA.l $7F0000,X : STA.w !d_t5                     ; flags, behaviour
	LDA.l $7F0002,X : AND.w #$00FF : STA.w !d_t6      ; code
	PLX
	LDA.l !DB+3,X : CMP.w !d_t5 : BNE .bad
	LDA.l !DB+5,X : AND.w #$00FF : CMP.w !d_t6 : BNE .bad
.next
	TXA : CLC : ADC.w #6 : TAX
	DEY : BNE .witness
	SEC
	RTS
.bad
	CLC
	RTS

; ---------------------------------------------------------------------------
!bq_floor = !cs+$0
!bq_part  = !cs+$2
; dst_breach_queue: witnesses and edits. Each run cell becomes the sampled
; floor; its partner on the other layer becomes the floor's partner (when
; different). Order as the browser mod: the wall, then outward.
dst_breach_queue:
	LDA.w !w_a : LDY.w #0 : JSR dst_witness
	LDA.w !w_b : LDY.w #1 : JSR dst_witness
	LDA.w !w_src : LDY.w #2 : JSR dst_witness
	LDA.w !w_back : LDY.w #3 : JSR dst_witness
	; replacement tiles (queuedTile accepts 0..191 only)
	LDA.w !w_src : TAX
	LDA.l $7F0000,X : AND.w #$00FF : STA.w !bq_floor
	LDA.w !w_back : CMP.w #$FFFF : BEQ +
	TAX
	LDA.l $7F0000,X : AND.w #$00FF
+	STA.w !bq_part
	LDX.w #0
.cell
	STX.w !d_t2
	LDA.l !WR_LIST,X : AND.w #$00FF
	JSR dst_axis_cell
	JSR dst_load_cell
	LDA.w !bq_floor : CMP.w #192 : BCS +
	LDA.w !d_coff : JSR dst_queue_find : BCS +
	LDA.w !bq_floor : STA.w !d_brep
	JSR dst_edit_push
+	; the partner on the other layer
	LDA.w !bq_part : CMP.w #192 : BCS .next
	LDX.w !d_t2
	LDA.l !WR_LIST,X : AND.w #$00FF
	JSR dst_axis_cell
	LDA.w !d_cl : EOR.w #1 : STA.w !d_cl
	JSR dst_load_cell
	LDA.w !d_ctile : CMP.w !bq_part : BEQ .next
	LDA.w !d_coff : JSR dst_queue_find : BCS .next
	LDA.w !bq_part : STA.w !d_brep
	JSR dst_edit_push
.next
	LDX.w !d_t2 : INX
	CPX.w !w_n : BCC .cell
	RTS

; Queue the current cell as a demolition edit of record !w_k.
dst_edit_push:
	LDA.w !w_k : ASL : ASL : ASL : ASL
	ORA.w #!QM_DEMO|!POL_SUPER
	JMP dst_queue_push
