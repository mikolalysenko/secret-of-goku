; Barriers, switches, breakable doors and crystal orbs.
; native-barriers.js: a punch, or a beam at >= 85% charge, against an
; authored gate rectangle (kiBarriers), a native F-prefix hit tile or a
; floor plate runs the original (or authored) event 26 frames later; the
; event sets its own progress and rebuilds objects/pieces. Breakable doors
; (breakable-doors.js) persist their opened state in !P_DOORS.
; native-orbs.js: an orb's own puzzle event, with the spell byte its
; element test reads from $E181.

!bh_x     = !cs+$0     ; attack origin
!bh_y     = !cs+$2
!bh_len   = !cs+$4     ; min(640, length)
!bh_wid   = !cs+$6     ; half width
!bh_horz  = !cs+$8
!bh_sign  = !cs+$A
!bh_best  = !cs+$C     ; best candidate distance (low word, $FFFF none)
!bh_bhi   = !cs+$E     ; best candidate distance (high word)

!BS_NONE  = 0
!BS_WAIT  = 1
!BS_ASKED = 2

; ---------------------------------------------------------------------------
; dst_barrier_hit: native-barriers.js hit() for the current destroy_hit.
dst_barrier_hit:
	LDA.l !bp_state : BEQ +
	RTS
+	; strength: punches always qualify; beams need >= 85% charge
	LDA.w !arg_kind : BEQ +
	LDA.w !arg_str : CMP.w #218 : BCS +
	RTS
+	; one barrier per beam
	LDA.w !arg_id : BEQ +
	CMP.w !d_abar : BNE +
	RTS
+	LDA.w !arg_x : STA.w !bh_x
	LDA.w !arg_y : STA.w !bh_y
	LDA.w !arg_len : CMP.w #641 : BCC +
	LDA.w #640
+	STA.w !bh_len
	LDA.w !arg_half : STA.w !bh_wid
	LDA.w !arg_dir : AND.w #3 : TAX
	LDA.l dst_dir_horz,X : AND.w #$00FF : STA.w !bh_horz
	TXA : ASL : TAX
	LDA.l dst_dir_sign,X : STA.w !bh_sign
	; authored gate rectangles first
	LDA.w !m_bits : AND.w #!MAP_INFO_BARRIER : BEQ .native
	JSR dst_ki_barrier : BCC .native
	JMP dst_barrier_start
.native
	JSR dst_native_target : BCS +
	RTS
+	LDX.w #$FFFF
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
; dst_native_target: nativeTile(): the nearest native hit tile, floor
; plate or locked door trigger on Goku's layer within the attack's box.
; Carry set when found; the target is described in !DS+$40.. :
;   +$40 event, +$42 door index ($FFFF), +$44 offset, +$46 tile, +$48 react
!nt_tx   = !DS+$30
!nt_ty   = !DS+$32
!nt_tx0  = !DS+$34
!nt_tx1  = !DS+$36
!nt_ty1  = !DS+$38
!nt_src  = !DS+$3A
!nt_ev   = !DS+$3C
!nt_door = !DS+$3E
!nt_out  = !DS+$40
dst_native_target:
	LDA.w #$FFFF : STA.w !bh_best : STA.w !bh_bhi
	; box: x/y range of the segment padded by width+8, clipped to the map
	LDA.w !bh_wid : CLC : ADC.w #8 : STA.w !d_t6        ; pad
	LDA.w !bh_horz : BEQ .vbox
	; x range: [min(x, x1) - pad, max(x, x1) + pad], y range: y +- pad
	LDA.w !bh_sign : BMI +
	LDA.w !bh_x : SEC : SBC.w !d_t6 : STA.w !d_t2
	LDA.w !bh_x : CLC : ADC.w !bh_len : CLC : ADC.w !d_t6 : STA.w !d_t3
	BRA ++
+	LDA.w !bh_x : SEC : SBC.w !bh_len : SEC : SBC.w !d_t6 : STA.w !d_t2
	LDA.w !bh_x : CLC : ADC.w !d_t6 : STA.w !d_t3
++	LDA.w !bh_y : SEC : SBC.w !d_t6 : STA.w !d_t4
	LDA.w !bh_y : CLC : ADC.w !d_t6 : STA.w !d_t5
	BRA .box
.vbox
	LDA.w !bh_sign : BMI +
	LDA.w !bh_y : SEC : SBC.w !d_t6 : STA.w !d_t4
	LDA.w !bh_y : CLC : ADC.w !bh_len : CLC : ADC.w !d_t6 : STA.w !d_t5
	BRA ++
+	LDA.w !bh_y : SEC : SBC.w !bh_len : SEC : SBC.w !d_t6 : STA.w !d_t4
	LDA.w !bh_y : CLC : ADC.w !d_t6 : STA.w !d_t5
++	LDA.w !bh_x : SEC : SBC.w !d_t6 : STA.w !d_t2
	LDA.w !bh_x : CLC : ADC.w !d_t6 : STA.w !d_t3
.box
	; tx from max(0, floor(x0/16)) while tx < min(W, ceil(x1/16))
	LDA.w !d_t2 : JSR dst_floor16 : BPL +
	LDA.w #0
+	STA.l !nt_tx0
	LDA.w !d_t3 : JSR dst_ceil16 : STA.w !d_t3
	LDA $C0 : CMP.w #2048 : BCC +
	LDA.w #2048
+	LSR : LSR : LSR : LSR
	CMP.w !d_t3 : BCS +
	STA.w !d_t3
+	LDA.w !d_t3 : STA.l !nt_tx1
	LDA.w !d_t4 : JSR dst_floor16 : BPL +
	LDA.w #0
+	STA.l !nt_ty
	LDA.w !d_t5 : JSR dst_ceil16 : STA.w !d_t5
	LDA $C2 : CMP.w #2048 : BCC +
	LDA.w #2048
+	LSR : LSR : LSR : LSR
	CMP.w !d_t5 : BCS +
	STA.w !d_t5
+	LDA.w !d_t5 : STA.l !nt_ty1
	; layer of Goku
	LDA.w $E00B : AND.w #$0080 : BEQ +
	LDA.w #1
+	STA.w !d_cl
.row
	LDA.l !nt_ty : CMP.l !nt_ty1 : BCC +
	JMP .end
+	LDA.l !nt_tx0 : STA.l !nt_tx
.col
	LDA.l !nt_tx : CMP.l !nt_tx1 : BCC +
	JMP .next_row
+	JSR dst_native_cell
	LDA.l !nt_tx : INC : STA.l !nt_tx
	BRA .col
.next_row
	LDA.l !nt_ty : INC : STA.l !nt_ty
	JMP .row
.end
	LDA.w !bh_best : AND.w !bh_bhi : CMP.w #$FFFF : BEQ +
	SEC
	RTS
+	CLC
	RTS

; One cell of nativeTile(); keeps the nearest candidate.
dst_native_cell:
	LDA.l !nt_tx : STA.w !d_cx
	LDA.l !nt_ty : STA.w !d_cy
	JSR dst_load_cell : BCC +
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
+	; touched? rect = the cell
	LDA.w !d_cx : ASL : ASL : ASL : ASL : STA.w !d_t2
	LDA.w !d_cy : ASL : ASL : ASL : ASL : STA.w !d_t3
	LDA.w #16 : STA.w !d_t4 : STA.w !d_t5
	JSR dst_touches : BCS +
	RTS
+	; distance^2 from the origin to the cell corner
	LDA.w !d_cx : ASL : ASL : ASL : ASL : SEC : SBC.w !bh_x
	JSR dst_square : STA.w !d_t0 : STX.w !d_t1
	LDA.w !d_cy : ASL : ASL : ASL : ASL : SEC : SBC.w !bh_y
	JSR dst_square
	CLC : ADC.w !d_t0 : STA.w !d_t0
	TXA : ADC.w !d_t1 : STA.w !d_t1
	; strictly nearer than the best so far (stable for ties)
	CMP.w !bh_bhi : BCC .take
	BNE .keep
	LDA.w !d_t0 : CMP.w !bh_best : BCS .keep
.take
	LDA.w !d_t0 : STA.w !bh_best
	LDA.w !d_t1 : STA.w !bh_bhi
	LDA.l !nt_ev : STA.l !nt_out+0
	LDA.l !nt_door : STA.l !nt_out+2
	LDA.w !d_coff : STA.l !nt_out+4
	LDA.w !d_ctile : STA.l !nt_out+6
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
