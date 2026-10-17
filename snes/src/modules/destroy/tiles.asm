; Tile pipeline: native-plants.js metadata / eligible / breakable, the
; scenery and brazier replacements, the edit queue and its application at
; the native redraw boundary (C0:C7C3).

; ---------------------------------------------------------------------------
; dst_load_cell: current cell = (!d_cx, !d_cy, !d_cl). Carry set when the
; coordinates leave 0..127 (metadata() returns null).
dst_load_cell:
	LDA.w !d_cx : CMP.w #128 : BCS dst_load_cell_out
	LDA.w !d_cy : CMP.w #128 : BCS dst_load_cell_out
	XBA : LSR                    ; cy * 128
	ORA.w !d_cx
	LDX.w !d_cl : BEQ +
	ORA.w #$4000
+	STA.w !d_coff
dst_load_cell_at:                ; entry with A = !d_coff, cx/cy/cl set
	TAX
	LDA.l $7F0000,X : AND.w #$00FF : STA.w !d_ctile
	JSR dst_meta
	LDA.w !d_ctile
	JSR dst_desc
	LDA.l $7F0000,X : STA.w !d_cflags
	LDA.l $7F0002,X : AND.w #$00FF : STA.w !d_ccode
	LDA.l $7F0003,X : AND.w #$00FF : STA.w !d_crep
	CLC
	RTS
dst_load_cell_out:
	SEC
	RTS

; dst_load_offset: current cell from map offset A (layer bit $4000).
dst_load_offset:
	STA.w !d_coff
	AND.w #$007F : STA.w !d_cx
	LDA.w !d_coff : AND.w #$3F80 : ASL : XBA : STA.w !d_cy
	LDA.w !d_coff : AND.w #$4000 : BEQ +
	LDA.w #1
+	STA.w !d_cl
	LDA.w !d_coff
	BRA dst_load_cell_at

; dst_desc: A = tile id of layer !d_cl -> X = descriptor offset in bank $7F.
dst_desc:
	ASL : ASL
	CLC : ADC.w #$B800
	LDX.w !d_cl : BEQ +
	CLC : ADC.w #$0400
+	TAX
	RTS

; dst_meta: !d_cmeta = tile + 192 when the map header selects the second
; metatile bank for this layer ($40 BG1, $80 BG2).
dst_meta:
	LDA.w !m_hdr
	LDX.w !d_cl : BEQ +
	LSR
+	AND.w #$0040 : BEQ +
	LDA.w #192
+	CLC : ADC.w !d_ctile
	STA.w !d_cmeta
	RTS

; ---------------------------------------------------------------------------
; dst_breakable: A = policy (0 plants, 1 objects, 2 beam, 3 super-beam),
; current cell loaded. Carry set when breakable: !d_brep = replacement,
; !d_bkind = sound kind, !d_bbraz = 1 for a brazier cell.
dst_breakable:
	STA.w !d_pol
	STZ.w !d_bbraz
	LDA.w !d_ccode : AND.w #$00F0 : CMP.w #$00C0 : BNE .other
	LDA.w !d_crep : CMP.w !d_ctile : BEQ .other
	LDA.w !d_ccode : AND.w #$000F : STA.w !d_bkind
	LDA.w !d_pol : BNE .objects
	LDA.w !d_bkind : CMP.w #8 : BEQ .as_is
	CMP.w #1 : BNE .other
	LDA.w !d_crep : BNE .other
.as_is
	LDA.w !d_crep : STA.w !d_brep
	SEC
	RTS
.objects
	; One Saiyan strike clears every damage stage of an axe/sword obstacle.
	LDA.w !d_bkind : CMP.w #12 : BCS .other
	JSR dst_chain : BCC .other
	SEC
	RTS
.other
	LDA.w !d_pol : BEQ .no
	JSR dst_scenery : BCS .replace
	JSR dst_brazier_policy : BCC .no
	JSR dst_brazier_rep : BCC .no
	LDA.w #1 : STA.w !d_bbraz
	LDA.w #!DESTROY_BRAZIER_TILE
.replace
	CMP.w !d_ctile : BEQ .no
	STA.w !d_brep
	LDA.w #8 : STA.w !d_bkind
	SEC
	RTS
.no
	CLC
	RTS

; dst_chain: native damage stages (eligible() for object policies). Carry
; set when the replacement chain reaches a non-C tile without a cycle within
; 16 steps (kinds <= 11); !d_brep = that final tile. A cycle is detected by
; re-walking the (short) chain from the start for every new tile.
dst_chain:
	LDA.w !d_crep : STA.w !d_t1        ; next
	STZ.w !d_t0                        ; steps taken
.loop
	; seen? the tile itself or any of the first t0 replacements
	LDA.w !d_t1 : CMP.w !d_ctile : BEQ .fail
	LDA.w !d_crep : STA.w !d_t2
	LDX.w !d_t0
-	DEX : BMI +
	LDA.w !d_t2 : CMP.w !d_t1 : BEQ .fail
	PHX
	JSR dst_desc_rep : STA.w !d_t2
	PLX
	BRA -
+	; the next stage's code
	LDA.w !d_t1 : JSR dst_desc
	LDA.l $7F0002,X : AND.w #$00FF : STA.w !d_t3
	AND.w #$00F0 : CMP.w #$00C0 : BNE .done
	LDA.w !d_t3 : AND.w #$000F : CMP.w #12 : BCS .fail
	LDA.l $7F0003,X : AND.w #$00FF : STA.w !d_t1
	INC.w !d_t0
	LDA.w !d_t0 : CMP.w #16 : BCC .loop
.fail
	CLC
	RTS
.done
	LDA.w !d_t1 : STA.w !d_brep
	SEC
	RTS

; A = replacement of tile !d_t2 (same layer).
dst_desc_rep:
	LDA.w !d_t2 : JSR dst_desc
	LDA.l $7F0003,X : AND.w #$00FF
	RTS

; ---------------------------------------------------------------------------
; dst_scenery (native-local-flight.js breakScenery): Sandship deck rail,
; carved heads and Haunted Forest vines/flowers. Carry set, A = replacement.
dst_scenery:
	JSR dst_ship_rail : BCC +
	LDA.w #!DESTROY_RAIL_REPLACEMENT
	SEC
	RTS
+	LDA.w !d_cl : BNE .no
	LDA.w !m_ts : CMP.w #!DESTROY_HEAD_TILESET : BNE .vine
	LDA.w !d_cmeta : CMP.w #!DESTROY_HEAD_A : BEQ +
	CMP.w #!DESTROY_HEAD_B : BNE .vine
+	LDA.w !d_ccode : CMP.w #$00C1 : BNE .vine
	LDA.w !d_ctile : CLC : ADC.w !d_crep
	CMP.w #!DESTROY_HEAD_SUM : BNE .vine
	LDA.w #!DESTROY_HEAD_TILE
	SEC
	RTS
.vine
	LDA.w !d_ccode : BNE .no
	LDA.w !m_ts : CMP.w #!DESTROY_VINE_TILESET : BNE .no
	LDA.w !d_cmeta
	JSR dst_bit_vine : BCC .no
	LDA.w #!DESTROY_VINE_TILE
	SEC
	RTS
.no
	CLC
	RTS

; dst_ship_rail: the short handrail between the Sandship decks (two cells
; with clear walkable floor above and below).
dst_ship_rail:
	LDA.w !d_map : CMP.w #!DESTROY_RAIL_MAP_A : BEQ +
	CMP.w #!DESTROY_RAIL_MAP_B : BNE .no
+	LDA.w !d_cl : BNE .no
	LDA.w !d_cy : CMP.w #!DESTROY_RAIL_ROW : BNE .no
	LDA.w !d_cx : CMP.w #!DESTROY_RAIL_X0 : BCC .no
	CMP.w #!DESTROY_RAIL_X1+1 : BCS .no
	LDA.w !d_ctile : CMP.w #!DESTROY_RAIL_TILE : BNE .no
	LDA.w !d_ccode : BNE .no
	LDA.w !d_coff : SEC : SBC.w #128 : JSR dst_rail_clear : BCC .no
	LDA.w !d_coff : CLC : ADC.w #128 : JSR dst_rail_clear : BCC .no
	SEC
	RTS
.no
	CLC
	RTS

; dst_rail_clear: A = BG1 map offset. Carry set when native-local-flight.js
; clear(t, 0, true) holds: not solid, not a trigger wall, walkable code.
dst_rail_clear:
	TAX
	LDA.l $7F0000,X : AND.w #$00FF
	ASL : ASL : CLC : ADC.w #$B800 : TAX
	LDA.l $7F0000,X
	BIT.w #$0008 : BNE .no
	AND.w #$0007 : CMP.w #3 : BEQ .no
	LDA.l $7F0002,X : AND.w #$00FF : BEQ .yes
	STA.w !d_t6
	AND.w #$00F0 : CMP.w #$0020 : BEQ .yes
	CMP.w #$0030 : BEQ .yes
	LDA.w !d_t6 : CMP.w #$00C1 : BNE .no
	LDA.l $7F0003,X : AND.w #$00FF : BNE .no
.yes
	SEC
	RTS
.no
	CLC
	RTS

; ---------------------------------------------------------------------------
; Braziers (palace-braziers.js, native-plants.js brazierPolicy/Replacement).
dst_brazier_policy:
	LDA.w !d_pol : CMP.w #!POL_SUPER : BEQ .yes
	CMP.w #!POL_BEAM : BNE .no
	LDA.w !m_bits : AND.w #!MAP_INFO_BRAZIER : BEQ .no
.yes
	SEC
	RTS
.no
	CLC
	RTS

; Carry set when the current cell is part of a palace brazier object.
dst_brazier_rep:
	LDA.w !m_hdr : AND.w #$007F : CMP.w #!DESTROY_BRAZIER_TILESET : BNE .no
	LDA.w !d_cl : BNE .no
	LDA.w !d_ccode : BNE .no
	LDX.w !d_ctile
	LDA.l destroy_brazier_part,X : AND.w #$00FF : CMP.w #$00FF : BEQ .no
	SEC
	RTS
.no
	CLC
	RTS

; ---------------------------------------------------------------------------
; Bit tables (512 bits): carry = bit A of the table.
macro dst_bittest(name, table)
<name>:
	PHA
	LSR : LSR : LSR : TAX
	PLA : AND.w #$0007 : TAY
	LDA.l <table>,X : AND.w #$00FF
	INY
-	LSR
	DEY : BNE -
	RTS
endmacro
%dst_bittest(dst_bit_vine, destroy_vine_bits)
%dst_bittest(dst_bit_false_floor, destroy_false_floor)

; dst_bit_air: carry = metatile A is dungeon air in tileset !m_ts.
dst_bit_air:
	PHA
	LSR : LSR : LSR : STA.w !d_t6
	LDA.w !m_ts : ASL : ASL : ASL : ASL : ASL : ASL
	CLC : ADC.w !d_t6 : TAX
	PLA : AND.w #$0007 : TAY
	LDA.l destroy_air_bits,X : AND.w #$00FF
	INY
-	LSR
	DEY : BNE -
	RTS

; ---------------------------------------------------------------------------
; Queue. dst_queue_find: A = map offset; carry set when a live entry holds it.
dst_queue_find:
	STA.w !d_t6
	LDA.w !d_qn : BEQ .no
	ASL : ASL : ASL : STA.w !d_t5
	LDX.w #0
-	LDA.l !DQ,X : CMP.w !d_t6 : BEQ .yes
	TXA : CLC : ADC.w #8 : TAX
	CPX.w !d_t5 : BCC -
.no
	CLC
	RTS
.yes
	SEC
	RTS

; dst_queue_push: append the current cell with A = meta byte (policy,
; flags, breach) and !d_brep (stored for demolition edits). Carry set (and
; result bit 2) when the queue is full.
dst_queue_push:
	STA.w !d_t4
	LDA.w !d_qn : CMP.w #!DQ_MAX : BCC .room
	JSR dst_queue_compact
	LDA.w !d_qn : CMP.w #!DQ_MAX : BCC .room
	LDA.w !d_flags : ORA.w #4 : STA.w !d_flags
	SEC
	RTS
.room
	ASL : ASL : ASL : TAX
	LDA.w !d_coff : STA.l !DQ+0,X
	SEP #$20
	LDA.w !d_ctile : STA.l !DQ+2,X
	LDA.w !d_brep : STA.l !DQ+3,X
	LDA.w !d_cflags : STA.l !DQ+4,X
	LDA.w !d_cflags+1 : STA.l !DQ+5,X
	LDA.w !d_t4 : STA.l !DQ+6,X
	LDA.w !FRAME : STA.l !DQ+7,X
	REP #$20
	INC.w !d_qn
	INC.w !d_qlive
	LDA.w !d_flags : ORA.w #1 : STA.w !d_flags
	CLC
	RTS

; dst_queue_compact: drop dead entries, preserving order.
dst_queue_compact:
	LDA.w !d_qn : ASL : ASL : ASL : STA.w !d_t5
	PHB
	PEA $3333 : PLB : PLB
	LDX.w #0
	LDY.w #0
.loop
	TXA : CMP.l $7E0000+!d_t5 : BCS .end
	LDA.w !DQW,X : CMP.w #$FFFF : BEQ .skip
	STA.w !DQW,Y
	LDA.w !DQW+2,X : STA.w !DQW+2,Y
	LDA.w !DQW+4,X : STA.w !DQW+4,Y
	LDA.w !DQW+6,X : STA.w !DQW+6,Y
	TYA : CLC : ADC.w #8 : TAY
.skip
	TXA : CLC : ADC.w #8 : TAX
	BRA .loop
.end
	PLB
	TYA : LSR : LSR : LSR
	STA.w !d_qn
	STA.w !d_qlive
	RTS

; dst_queue_kill: mark the entry at X dead.
dst_queue_kill:
	LDA.l !DQ,X : CMP.w #$FFFF : BEQ +
	LDA.w #$FFFF : STA.l !DQ,X
	DEC.w !d_qlive
+	RTS

; dst_queue_expire: entries older than 90 frames are dropped.
dst_queue_expire:
	LDA.w !d_qn : BEQ .done
	ASL : ASL : ASL : STA.w !d_t5
	LDX.w #0
.loop
	LDA.l !DQ,X : CMP.w #$FFFF : BEQ .next
	LDA.w !FRAME : SEC : SBC.l !DQ+7,X
	AND.w #$00FF : CMP.w #90 : BCC .next
	JSR dst_queue_kill
.next
	TXA : CLC : ADC.w #8 : TAX
	CPX.w !d_t5 : BCC .loop
.done
	RTS

; ---------------------------------------------------------------------------
; dst_entry_current (queuedTile): re-check queue entry X against the live
; map. Carry set when it still applies: current cell loaded, !d_brep set.
; X is preserved.
dst_entry_current:
	PHX
	LDA.l !DQ,X : JSR dst_load_offset
	LDA $01,s : TAX
	LDA.l !DQ+2,X : AND.w #$00FF
	CMP.w !d_ctile : BNE .no
	LDA.l !DQ+6,X : AND.w #$00FF : STA.w !d_t4
	AND.w #!QM_DEMO : BEQ .object
	; Demolition: the same ordinary wall, both floors still in place.
	LDA.l !DQ+4,X : CMP.w !d_cflags : BNE .no          ; flags and behaviour
	LDA.w !d_ccode : BNE .no
	LDA.w !d_cflags : BIT.w #$D008 : BNE .no
	LDA.l !DQ+3,X : AND.w #$00FF : CMP.w #192 : BCS .no
	STA.w !d_brep
	LDA.w #8 : STA.w !d_bkind
	STZ.w !d_bbraz
	LDA.w !d_t4 : LSR : LSR : LSR : LSR : AND.w #$000F
	JSR dst_breach_valid
	PLX
	RTS
.object
	LDA.w !d_t4 : AND.w #$0003
	JSR dst_breakable
	PLX
	RTS
.no
	PLX
	CLC
	RTS

; ---------------------------------------------------------------------------
; dst_apply_frame: the browser mod's C0:C7C3 boundary. At most one row group
; per frame; replays smashed objects that a native rebuild restored.
dst_apply_frame:
	JSR dst_sync_map
	LDA.w !d_last : CMP.w !FRAME : BNE +
	RTS
+	; a breach plan in progress sees one map: rows wait until it is done
	LDA.l !pl_stage : BEQ +
	RTS
+	JSR dst_queue_expire
	JSR dst_ground_ok : BCS +
	STZ.w !d_qn
	STZ.w !d_qlive
	RTS
+	SEP #$20
	LDA $82 : ORA $2E
	REP #$20
	AND.w #$00FF : BEQ +
	RTS
+	JSR dst_replay
	; fall through

; dst_apply_row: take the first live entry, apply every live entry in the
; same layer/row (and replay state), raise the native redraw and sound.
dst_apply_row:
.first
	LDA.w !d_qlive : BNE +
	STZ.w !d_qn
	RTS
+	LDX.w #0
-	LDA.l !DQ,X : CMP.w #$FFFF : BNE +
	TXA : CLC : ADC.w #8 : TAX
	BRA -
+	JSR dst_entry_current : BCS +
	JSR dst_queue_kill
	BRA .first
+	LDA.l !DQ,X : AND.w #$7F80 : STA.w !fx_key      ; layer and row
	LDA.l !DQ+6,X : AND.w #!QM_REPLAY : STA.w !fx_replay
	STZ.w !fx_n
	LDA.w #$FFFF : STA.w !fx_sound
	STZ.w !fx_demo
	STZ.w !fx_braz
	LDA.w #$7FFF : STA.w !fx_xmin
	STZ.w !fx_xmax
	LDA.w !d_qn : ASL : ASL : ASL : STA.w !fx_end
.group
	LDA.l !DQ,X : CMP.w #$FFFF : BEQ .next
	AND.w #$7F80 : CMP.w !fx_key : BNE .next
	LDA.l !DQ+6,X : AND.w #!QM_REPLAY : CMP.w !fx_replay : BNE .next
	STX.w !fx_x
	JSR dst_entry_current
	PHP
	LDX.w !fx_x
	JSR dst_queue_kill
	PLP
	BCC +
	JSR dst_apply_cell
+	LDX.w !fx_x
.next
	TXA : CLC : ADC.w #8 : TAX
	CPX.w !fx_end : BCC .group
	LDA.w !fx_n : BNE +
	JMP .first
+	JSR dst_row_redraw
	LDA.w !FRAME : STA.w !d_last
	; keep searches short: drop dead entries once a few accumulate
	LDA.w !d_qn : SEC : SBC.w !d_qlive : CMP.w #8 : BCC +
	JSR dst_queue_compact
+	RTS

; Write one edit: map byte, smashed-object record, row statistics.
dst_apply_cell:
	SEP #$20
	LDX.w !d_coff
	LDA.w !d_brep : STA.l $7F0000,X
	REP #$20
	INC.w !fx_n
	LDA.w !d_cx : CMP.w !fx_xmin : BCS +
	STA.w !fx_xmin
+	CMP.w !fx_xmax : BCC +
	STA.w !fx_xmax
+	LDA.w !fx_sound : BPL +
	LDA.w !d_brep : CMP.w #$00C1 : BEQ +
	LDA.w !d_bkind : STA.w !fx_sound
	LDA.w !d_cx : STA.w !fx_sx
+	LDA.w !d_t4 : AND.w #!QM_DEMO : BEQ +
	INC.w !fx_demo
+	LDA.w !d_bbraz : BEQ +
	INC.w !fx_braz
+	JSR dst_cleared_note
	RTS

; dst_row_redraw: native row redraw for the group's layer/row when it is on
; screen, the cut sound and the effect/sandship/reaction outputs.
dst_row_redraw:
	LDX.w #$00AA                                ; BG1 vertical scroll
	LDA.w !fx_key : AND.w #$4000 : BEQ +
	LDX.w #$00AE                                ; BG2
+	LDA.w !fx_key : AND.w #$3F80 : ASL : XBA    ; ty
	ASL : ASL : ASL : ASL : CLC : ADC.w #8      ; world y of the row centre
	SEC : SBC.w $0000,X
	BPL +
	CLC : ADC $C2                               ; wrap by the map height
+	STA.w !fx_sy
	CMP.w #240 : BCS .hidden                    ; offscreen: the scroll loader
	SEP #$20                                    ; streams the new bytes later
	LDA.b #$01
	BIT.w !fx_key+1 : BVC +                     ; $4000 is bit 6 of the high byte
	LDA.b #$80
+	STA $82
	LDA.w !fx_sy : STA $83
	REP #$20
	; Cut sound (C1:D41A) unless replaying or only C1 replacements.
	LDA.w !fx_replay : BNE .hidden
	LDA.w !fx_sound : BMI .hidden
	SEP #$20
	LDA $95 : BMI .quiet
	LDA.w !fx_sound : CLC : ADC.b #$D8 : STA $95
	REP #$20
	LDA.w !fx_sx : ASL : ASL : ASL : ASL : CLC : ADC.w #8
	LDX.w #$00A8
	LDY.w !fx_key : CPY.w #$4000 : BCC +
	LDX.w #$00AC
+	SEC : SBC.w $0000,X
	BPL +
	LDA.w #0
+	CMP.w #256 : BCC +
	LDA.w #255
+	SEP #$20
	AND.b #$F0 : STA.w $0118
	LSR : LSR : LSR : LSR : ORA.w $0118 : STA.w $0119
.quiet
	REP #$20
.hidden
	LDA.w !fx_replay : BNE .done                ; replays are silent
	JSR dst_row_outputs
.done
	RTS

; ---------------------------------------------------------------------------
; Smashed objects (native-plants.js cleared): after an edit, remember solid
; objects, trigger-wall objects, braziers and demolished walls of this map
; so a same-room native rebuild cannot regrow them. Current cell = the
; pre-edit tile, !d_t4 = entry meta.
dst_cleared_note:
	LDA.w !d_t4 : AND.w #$0003 : BNE +              ; plants: native respawn
	RTS
+
	LDA.w !d_t4 : AND.w #!QM_DEMO : BNE .yes
	LDA.w !d_cflags : AND.w #$0007 : CMP.w #3 : BEQ .yes
	LDA.w !d_cflags : AND.w #$0008 : BNE .yes
	LDA.w !d_t4 : AND.w #$0003 : STA.w !d_pol
	JSR dst_brazier_policy : BCC .no
	JSR dst_brazier_rep : BCC .no
.yes
	LDA.w !d_cn : ASL : ASL : ASL : STA.w !d_t5
	LDX.w #0
-	CPX.w !d_t5 : BCS .append
	LDA.l !DC,X : CMP.w !d_coff : BEQ .write
	TXA : CLC : ADC.w #8 : TAX
	BRA -
.append
	LDA.w !d_cn : CMP.w #!DC_MAX : BCS .no
	INC.w !d_cn
.write
	LDA.w !d_coff : STA.l !DC,X
	SEP #$20
	LDA.w !d_ctile : STA.l !DC+2,X
	LDA.w !d_brep : STA.l !DC+3,X
	LDA.w !d_cflags : STA.l !DC+4,X
	LDA.w !d_cflags+1 : STA.l !DC+5,X
	LDA.w !d_ccode : STA.l !DC+6,X
	LDA.w !d_t4 : AND.b #$FB : STA.l !DC+7,X        ; drop the replay bit
	REP #$20
.no
	RTS

; dst_replay: requeue smashed objects that a native rebuild put back with
; the same descriptor (tile, or brazier piece under a brazier policy).
dst_replay:
	LDA.w !d_cn : BNE +
	RTS
+	LDX.w #0
.loop
	STX.w !fx_x
	; still smashed? (one byte read)
	LDA.l !DC+3,X : AND.w #$00FF : STA.w !d_t5
	LDA.l !DC,X : TAX
	LDA.l $7F0000,X : AND.w #$00FF : CMP.w !d_t5 : BNE +
	JMP .next
+	LDX.w !fx_x
	LDA.l !DC,X : JSR dst_load_offset
	LDX.w !fx_x
	LDA.l !DC+7,X : AND.w #$00FF : STA.w !d_t4
	AND.w #!QM_DEMO : BNE .demo
	LDA.w !d_t4 : AND.w #$0003 : JSR dst_breakable : BCC .skip
	LDX.w !fx_x
	LDA.l !DC+2,X : AND.w #$00FF : CMP.w !d_ctile : BEQ .same
	; a lit/unlit brazier counts as the same piece under a brazier policy
	JSR dst_brazier_policy : BCC .skip
	LDX.w !fx_x
	LDA.l !DC+2,X : AND.w #$00FF : TAX
	LDA.l destroy_brazier_part,X : AND.w #$00FF : CMP.w #$00FF : BEQ .skip
	STA.w !d_t5
	LDX.w !d_ctile
	LDA.l destroy_brazier_part,X : AND.w #$00FF : CMP.w !d_t5 : BNE .skip
	LDX.w !fx_x
	BRA .same
.skip
	JMP .next
.same
	LDA.l !DC+4,X : CMP.w !d_cflags : BNE .next      ; flags, behaviour
	LDA.l !DC+6,X : AND.w #$00FF : CMP.w !d_ccode : BNE .next
	LDA.l !DC+3,X : AND.w #$00FF : CMP.w !d_brep : BNE .next
	BRA .push
.demo
	LDA.l !DC+2,X : AND.w #$00FF : CMP.w !d_ctile : BNE .next
	LDA.l !DC+4,X : CMP.w !d_cflags : BNE .next
	LDA.w !d_ccode : BNE .next
	LDA.l !DC+6,X : AND.w #$00FF : BNE .next
	LDA.w !d_cflags : BIT.w #$D008 : BNE .next
	LDA.l !DC+3,X : AND.w #$00FF : CMP.w #192 : BCS .next
	STA.w !d_brep
	LDA.w !d_t4 : LSR : LSR : LSR : LSR : AND.w #$000F
	JSR dst_breach_valid : BCC .next
.push
	LDA.w !d_coff : JSR dst_queue_find : BCS .next
	LDA.w !d_t4 : ORA.w #!QM_REPLAY : JSR dst_queue_push
	BCS .full
.next
	LDX.w !fx_x
	TXA : CLC : ADC.w #8 : TAX
	LDA.w !d_cn : ASL : ASL : ASL : STA.w !d_t5
	CPX.w !d_t5 : BCS .full
	JMP .loop
.full
	RTS

; ---------------------------------------------------------------------------
; dst_row_outputs: a non-replay row was applied (lab.js onCut): counters for
; the sound/sandship/radio modules and the effect record (dungeon-demolition.js
; demolitionEffects: one rubble burst per demolition row, one burst per
; brazier object).
dst_row_outputs:
	INC.w !out_rows
	INC.w !out_sfx
	LDA.w !fx_braz : BEQ .demo
	; brazier burst at the object's centre column; its three rows apply
	; back to back, so later rows of the same brazier add nothing
	LDA.w !fx_xmin : ASL : ASL : ASL : ASL : CLC : ADC.w #16 : STA.w !d_t0
	LDA.w !fx_key : AND.w #$3F80 : LSR : LSR : LSR : CLC : ADC.w #8 : STA.w !d_t1
	LDA.l !FX_KIND : CMP.w #2 : BNE .braz_new
	LDA.l !FX_X : CMP.w !d_t0 : BNE .braz_new
	LDA.w !d_t1 : SEC : SBC.l !FX_Y : BPL +
	EOR.w #$FFFF : INC
+	CMP.w #33 : BCC .demo
.braz_new
	LDA.w #2 : JSR dst_fx_emit
.demo
	LDA.w !fx_demo : BEQ .done
	LDA.w !FRAME : STA.w !out_demo
	LDA.l !pj_dirty : INC : STA.l !pj_dirty
	; rubble at the row's centre
	LDA.w !fx_xmin : CLC : ADC.w !fx_xmax : ASL : ASL : ASL : CLC : ADC.w #8 : STA.w !d_t0
	LDA.w !fx_key : AND.w #$3F80 : LSR : LSR : LSR : CLC : ADC.w #8 : STA.w !d_t1
	LDA.w #1 : JSR dst_fx_emit
	LDA.w !m_grp : BEQ .done
	CLC : ADC.w #!DESTROY_REACT_WALL_BASE-1 : STA.w !out_react
	LDA.w !d_map : STA.w !out_rmap
.done
	RTS

; dst_fx_emit: A = kind; !d_t0/!d_t1 = map pixel x/y. Publishes the record.
dst_fx_emit:
	STA.l !FX_KIND
	LDA.w !d_t0 : STA.l !FX_X
	LDA.w !d_t1 : STA.l !FX_Y
	LDA.l !FX_SEQ : INC : STA.l !FX_SEQ
	RTS

; ---------------------------------------------------------------------------
; Tile classes: four bits per metatile and layer (!TK_*), computed on first
; use from the live descriptors (dst_cell_class) and forgotten after each map
; load and native event. $F marks a class not computed yet: no class has
; both !TK_END and !TK_WALL (a floor is not a wall).
; dst_classes_watch (field frame): forget the classes when an event ends.
dst_classes_watch:
	LDA $D0 : AND.w #$00FF : BEQ +
	STA.l !dk_d0
	RTS
+	LDA.l !dk_d0 : BNE +
	RTS
+	LDA.w #0 : STA.l !dk_d0
	; fall through: the event may have changed the descriptors
dst_classes_reset:
	LDA.w #$FFFF
	LDX.w #$00FE
-	STA.l !DK,X
	DEX : DEX : BPL -
	LDA.w #0 : STA.l !dk_warm
	RTS

; dst_classes_warm (field frame, last): compute classes ahead of use while
; the frame has time, so a beam fired later meets a warm table.
dst_classes_warm:
	LDA.l !dk_warm : CMP.w #512 : BCC +
	RTS
+	LDA $D0 : AND.w #$00FF : BEQ +            ; an event may change them
	RTS
+	JSR dst_budget : BCC .tile
	RTS
.tile
	LDA.l !dk_warm : XBA : AND.w #1 : STA.w !d_cl
	LDA.l !dk_warm : JSR dst_cell_class
	LDA.l !dk_warm : INC : STA.l !dk_warm
	CMP.w #512 : BCS .done
	AND.w #3 : BNE .tile                     ; the budget every 4 tiles
	JSR dst_budget : BCC .tile
.done
	RTS

; dst_class_of: A = layer<<8 | tile -> A = class bits (!TK_*).
; Mirrors dst_cls for a cell without protection (dungeon-geometry.js
; ordinary / floor / wall / airMaterial; palace-braziers.js decoration).
dst_class_of:
	STA.w !d_t4
	AND.w #$00FF : STA.w !d_ctile
	LDA.w !d_t4 : XBA : AND.w #1 : STA.w !d_cl
	LDA.w !d_ctile : JSR dst_meta
	LDA.w !d_ctile : JSR dst_desc
	LDA.l $7F0002,X : AND.w #$00FF : STA.w !d_t3  ; code
	LDA.l $7F0000,X : STA.w !d_t2                 ; flags | behaviour<<8
	STZ.w !d_t1
	; scan target: cut or hit code, walk-on trigger, scenery map, brazier
	LDA.w !d_t3 : AND.w #$00F0 : CMP.w #$00C0 : BEQ .cand
	CMP.w #$00F0 : BEQ .cand
	LDA.w !d_t2 : BMI .cand                       ; behaviour bit 7
	LDA.w !m_bits : AND.w #!MAP_INFO_SCENERY : BEQ +
	JSR dst_class_scenery : BCS .cand
+	JSR dst_class_deco : BCC .ord
.cand
	LDA.w #!TK_CAND : STA.w !d_t1
.ord
	LDA.w !d_t3 : BEQ +
	JMP .done
+	LDA.w !d_t2 : BIT.w #$D008 : BNE .air_check
	LDA.w !d_t1 : ORA.w #!TK_ORD : STA.w !d_t1
.air_check
	; dungeon air (code 0 here): an air metatile with no trigger bits
	STZ.w !d_t0
	LDA.w !d_t2 : BIT.w #$D008 : BNE +
	LDA.w !d_cmeta : JSR dst_bit_air : BCC +
	INC.w !d_t0
+	LDA.w !d_t1 : AND.w #!TK_ORD : BEQ .done
	JSR dst_class_deco : BCS .done                ; braziers: neither
	LDA.w !d_t2 : AND.w #$0007 : CMP.w #3 : BEQ .wall
	BCS .done
	; floor: not blank metatile 0, not a palace window recess, not air
	LDA.w !d_cmeta : BNE +
	LDX.w !m_ts
	LDA.l destroy_blank_zero,X : AND.w #$00FF : BNE .done
+	LDA.w !m_ts : CMP.w #23 : BNE +
	LDA.w !d_cl : BNE +
	LDA.w !d_cmeta : JSR dst_bit_false_floor : BCS .done
+	LDA.w !d_t0 : BNE .done
	LDA.w !d_t1 : ORA.w #!TK_END : STA.w !d_t1
	BRA .done
.wall
	LDA.w !d_t0 : BNE .done
	LDA.w !d_t1 : ORA.w #!TK_WALL : STA.w !d_t1
.done
	LDA.w !d_t1
	RTS

; Carry set when tile !d_ctile (code !d_t3, metatile !d_cmeta) on layer
; !d_cl may be scenery (dst_scenery): the Sandship rail tile on its two deck
; maps, or a vine metatile. Skull heads carry cut code C1 (candidates anyway).
dst_class_scenery:
	LDA.w !d_cl : BNE .no                         ; layer 0 only
	LDA.w !d_t3 : BNE .no                         ; code 0
	LDA.w !d_map : CMP.w #!DESTROY_RAIL_MAP_A : BEQ +
	CMP.w #!DESTROY_RAIL_MAP_B : BNE .vine
+	LDA.w !d_ctile : CMP.w #!DESTROY_RAIL_TILE : BEQ .yes
.vine
	LDA.w !m_ts : CMP.w #!DESTROY_VINE_TILESET : BNE .no
	LDA.w !d_cmeta : JSR dst_bit_vine : BCC .no
.yes
	SEC
	RTS
.no
	CLC
	RTS

; Carry set when tile !d_ctile (code !d_t3) on layer !d_cl is a palace
; brazier piece.
dst_class_deco:
	LDA.w !m_hdr : AND.w #$007F : CMP.w #!DESTROY_BRAZIER_TILESET : BNE .no
	LDA.w !d_cl : BNE .no
	LDA.w !d_t3 : BNE .no
	LDX.w !d_ctile
	LDA.l destroy_brazier_part,X : AND.w #$00FF : CMP.w #$00FF : BEQ .no
	SEC
	RTS
.no
	CLC
	RTS

; dst_cell_class: class bits of tile A (low byte) on layer !d_cl. Computes
; and stores an unknown class first, keeping the caller's !d_t0-!d_t6,
; !d_ctile, !d_cmeta and Y (the floor sampler's words live there).
; Clobbers X.
dst_cell_class:
	AND.w #$00FF : PHA                       ; the tile
	LSR
	LDX.w !d_cl : BEQ +
	ORA.w #$0080
+	TAX
	LDA $01,s : LSR                          ; carry = odd tile: high nibble
	LDA.l !DK,X
	BCC +
	LSR : LSR : LSR : LSR
+	AND.w #$000F
	CMP.w #$000F : BEQ .miss
	PLX
	RTS
.miss
	PHY
	LDA.w !d_t0 : PHA
	LDA.w !d_t1 : PHA
	LDA.w !d_t2 : PHA
	LDA.w !d_t3 : PHA
	LDA.w !d_t4 : PHA
	LDA.w !d_t6 : PHA
	LDA.w !d_ctile : PHA
	LDA.w !d_cmeta : PHA                     ; the tile is at $13,s
	LDA $13,s
	LDX.w !d_cl : BEQ +
	ORA.w #$0100
+	JSR dst_class_of
	STA.l !DK_NEW
	ASL : ASL : ASL : ASL : STA.l !DK_HI
	LDA $13,s : LSR
	LDX.w !d_cl : BEQ +
	ORA.w #$0080
+	TAX
	LDA $13,s : LSR
	SEP #$20
	BCS .odd
	LDA.l !DK,X : AND.b #$F0 : ORA.l !DK_NEW : STA.l !DK,X
	BRA .stored
.odd
	LDA.l !DK,X : AND.b #$0F : ORA.l !DK_HI : STA.l !DK,X
.stored
	REP #$20
	PLA : STA.w !d_cmeta
	PLA : STA.w !d_ctile
	PLA : STA.w !d_t6
	PLA : STA.w !d_t4
	PLA : STA.w !d_t3
	PLA : STA.w !d_t2
	PLA : STA.w !d_t1
	PLA : STA.w !d_t0
	PLY
	PLX
	LDA.l !DK_NEW : AND.w #$000F
	RTS
