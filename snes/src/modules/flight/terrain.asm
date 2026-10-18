; Terrain classification: engine/native-local-flight.js (clear, lowObstacle,
; footprint, canFly, canLand, sweep), engine/dungeon-geometry.js (blocked,
; air: placed floors, air routes, cave voids and rock caps) and
; engine/native-whip-routes.js (crossable). Geometry is always the live
; native layout: the map buffers at $7F:0000 (layer 0) / $7F:4000 (layer 1)
; and the metatile descriptors at $7F:B800 / $7F:BC00 (flags, behaviour,
; code, replacement).
;
; A tile location ("idx") is layer*$4000 + ty*128 + tx in a 16-bit index.
; A step ("delta") packs dx in the low byte and dy in the high byte (each a
; signed byte); fl_negd negates both.
; All routines: M16/X16, DB = $7E, D = 0 on entry and exit; X (idx) is
; preserved unless noted; results in carry. Scratch fl_t0-fl_t5 is
; clobbered by any routine that fetches neighbours (callers keep what they
; need on the stack); fl_t6/fl_t7 belong to fl_inset. Results of long scans
; (lowObstacle, air routes, cave voids) are kept in a 128-entry tile cache
; keyed by location and tile id, cleared on map changes and every
; !FL_CACHE_LIFE frames while flight uses it.

!TSF_WHIP  = $0100  ; (fl_tsf high byte) the map has whip pads

; ---------------------------------------------------------------------------
; Map context. fl_ctx_update reloads when the map id or size changed, or
; when fl_map was invalidated (fl_frame does so while the field is not
; controllable, so a load always ends with a fresh context).
fl_ctx_update:
	LDA $DC
	CMP.w !fl_map
	BNE fl_ctx_load
	LDA $C0
	CMP.w #2048
	BCC +
	LDA.w #2048
+	CMP.w !fl_wpx
	BNE fl_ctx_load
	LDA $C2
	CMP.w #2048
	BCC +
	LDA.w #2048
+	CMP.w !fl_hpx
	BNE fl_ctx_load
	RTS
fl_ctx_load:
	LDA.w #$0000
	STA.l !fl_g_chk
	; the Sandship and the dunes after it: flight passes over every wall
	LDA $DC
	JSR fl_ship_map
	LDA.w #$0000
	BCC ++
	LDA.w !fl_t7                 ; 1 on the ship
	BNE ++
	LDA.w #$0002                 ; 2 in the dunes
++	STA.w !fl_open_air
	JSR fl_cache_clear
	JSR fl_grid_off
	JSR fl_sweep_forget
	LDA $DC
	STA.w !fl_map
	LDA $C0
	CMP.w #2048
	BCC +
	LDA.w #2048
+	STA.w !fl_wpx
	LSR : LSR : LSR : LSR
	STA.w !fl_W
	LDA $C2
	CMP.w #2048
	BCC +
	LDA.w #2048
+	STA.w !fl_hpx
	LSR : LSR : LSR : LSR
	STA.w !fl_H
	STZ.w !fl_ofs0
	STZ.w !fl_ofs1
	STZ.w !fl_mflags
	STZ.w !fl_tsf
	STZ.w !fl_p_scen
	STZ.w !fl_p_bank
	STZ.w !fl_p_lily
	STZ.w !fl_p_small
	STZ.w !fl_p_dair
	LDA.w #$00FF
	STA.w !fl_ts
	LDA.w !fl_map
	CMP.w #512
	BCC .header
	JMP fl_holes_anywhere        ; header() null: no tileset rules
.header
	ASL
	TAX
	LDA.l $C87000,X              ; header pointer (bank C8)
	TAX
	LDA.l $C80002,X              ; header byte 2: tileset | layer offsets
	AND.w #$00FF
	STA.w !fl_t0
	AND.w #$003F
	STA.w !fl_ts
	LDA.w !fl_t0
	AND.w #$0040
	BEQ +
	LDA.w #192
	STA.w !fl_ofs0
+	LDA.w !fl_t0
	AND.w #$0080
	BEQ +
	LDA.w #192
	STA.w !fl_ofs1
+	LDX.w !fl_ts
	LDA.l fl_ts_flags,X
	AND.w #$00FF
	STA.w !fl_tsf
	TXA
	ASL
	TAX
	LDA.l fl_cat_scenery,X
	STA.w !fl_p_scen
	LDA.l fl_cat_bank,X
	STA.w !fl_p_bank
	LDA.l fl_cat_lily,X
	STA.w !fl_p_lily
	LDA.l fl_cat_small,X
	STA.w !fl_p_small
	LDA.l fl_cat_dair,X
	STA.w !fl_p_dair
	LDA.w !fl_map
	ASL
	TAX
	LDA.l fl_map_flags,X
	STA.w !fl_mflags
	JSR fl_holes_anywhere
	TXA
	ASL
	TAX
	LDA.l fl_map_ext,X
	PHA
	AND.w #$00FF
	STA.w !fl_ext0x
	PLA
	XBA
	AND.w #$00FF
	STA.w !fl_ext0y
	LDA.l fl_map_ext+2,X
	PHA
	AND.w #$00FF
	STA.w !fl_ext1x
	PLA
	XBA
	AND.w #$00FF
	STA.w !fl_ext1y
	; Whip pads exist only with special-tile mode 1 (BF pads) or a floor
	; event 6D8 in the map's trigger table.
	LDA $B8
	AND.w #$0003
	CMP.w #$0001
	BEQ .whip
	LDA.w !fl_map
	CMP.w #511
	BCS .nowhip
	ASL
	TAX
	LDA.l $C84002,X
	STA.w !fl_t0
	LDA.l $C84000,X
	TAX
.scan
	CPX.w !fl_t0
	BCS .nowhip
	LDA.l $C80000,X
	CMP.w #$06D8
	BEQ .whip
	INX
	INX
	BRA .scan
.whip
	LDA.w !fl_tsf
	ORA.w #!TSF_WHIP
	STA.w !fl_tsf
.nowhip
	RTS
; !FLM_HOLES on every map when a floor-hole provider has holes anywhere
; (!FLIGHT_FLOOR_ANYWHERE, bind.asm). Preserves X.
fl_holes_anywhere:
	JSR fl_bind_floor_anywhere
	BCC +
	LDA.w !fl_mflags
	ORA.w #!FLM_HOLES
	STA.w !fl_mflags
+	RTS

; ---------------------------------------------------------------------------
; Leaf helpers

; fl_fetch: X = idx -> fl_d_* = tile, flags, behaviour, code, replacement,
; metatile. Preserves X and Y.
fl_fetch:
	PHX
	LDA.l $7F0000,X
	AND.w #$00FF
	STA.w !fl_d_tile
	ASL
	ASL
	CPX.w #$4000
	BCC .l0
	ORA.w #$0400
.l0
	TAX
	LDA.l $7FB800,X
	PHA
	AND.w #$00FF
	STA.w !fl_d_flags
	PLA
	XBA
	AND.w #$00FF
	STA.w !fl_d_beh
	LDA.l $7FB802,X
	PHA
	AND.w #$00FF
	STA.w !fl_d_code
	PLA
	XBA
	AND.w #$00FF
	STA.w !fl_d_rep
	PLX
	LDA.w !fl_d_tile
	CPX.w #$4000
	BCS .m1
	CLC
	ADC.w !fl_ofs0
	STA.w !fl_d_meta
	RTS
.m1
	CLC
	ADC.w !fl_ofs1
	STA.w !fl_d_meta
	RTS

; fl_inset: carry = A (0-383) is in the 48-byte bitset at $E3:Y (Y = 0:
; empty). Preserves A, X, Y. Uses fl_t6/fl_t7.
fl_inset:
	CPY.w #$0000
	BEQ .no
	PHX
	PHA
	AND.w #$0007
	TAX
	LDA.l fl_bitmask,X
	AND.w #$00FF
	STA.w !fl_t7
	LDA $01,S
	LSR
	LSR
	LSR
	STY.w !fl_t6
	CLC
	ADC.w !fl_t6
	TAX
	LDA.l !DATA_FLIGHT&$FF0000,X
	AND.w !fl_t7
	BEQ .out
	PLA
	PLX
	SEC
	RTS
.out
	PLA
	PLX
.no
	CLC
	RTS
fl_bitmask:
	db $01,$02,$04,$08,$10,$20,$40,$80,$00

; fl_tx / fl_ty: tile coordinates of X = idx in A.
fl_tx:
	TXA
	AND.w #$007F
	RTS
fl_ty:
	TXA
	LSR : LSR : LSR : LSR : LSR : LSR : LSR
	AND.w #$007F
	RTS

; fl_negd: A = delta -> -delta (both bytes).
fl_negd:
	PHA
	AND.w #$00FF
	EOR.w #$00FF
	INC
	AND.w #$00FF
	STA.w !fl_t5
	PLA
	AND.w #$FF00
	EOR.w #$FF00
	CLC
	ADC.w #$0100
	AND.w #$FF00
	ORA.w !fl_t5
	RTS

; fl_step: X = idx, A = delta. X = neighbour idx (same layer), carry clear;
; carry set when it leaves [0,W) x [0,H) (tileAt() == null). Preserves Y.
; Uses fl_t5.
fl_step:
	; unit steps (the common case) by index arithmetic
	CMP.w #$0001
	BEQ .right
	CMP.w #$00FF
	BEQ .left
	CMP.w #$0100
	BEQ .down
	CMP.w #$FF00
	BEQ .up
	BRA .general
.right
	TXA
	AND.w #$007F
	INC
	CMP.w !fl_W
	BCS .unit_out
	INX
	CLC
	RTS
.left
	TXA
	AND.w #$007F
	BEQ .unit_out
	DEX
	CLC
	RTS
.down
	TXA
	ASL
	XBA
	AND.w #$007F                 ; ty
	INC
	CMP.w !fl_H
	BCS .unit_out
	TXA
	CLC
	ADC.w #128
	TAX
	CLC
	RTS
.up
	TXA
	AND.w #$3F80
	BEQ .unit_out
	TXA
	SEC
	SBC.w #128
	TAX
	CLC
	RTS
.unit_out
	SEC
	RTS
.general
	STA.w !fl_t5
	JSR fl_tx
	PHA
	LDA.w !fl_t5
	AND.w #$00FF
	BIT.w #$0080
	BEQ +
	ORA.w #$FF00
+	CLC
	ADC $01,S
	STA $01,S                    ; new tx
	CMP.w !fl_W
	BCS .out1                    ; < 0 or >= W
	JSR fl_ty
	PHA
	LDA.w !fl_t5
	XBA
	AND.w #$00FF
	BIT.w #$0080
	BEQ +
	ORA.w #$FF00
+	CLC
	ADC $01,S
	CMP.w !fl_H
	BCS .out2
	XBA
	LSR                          ; ty * 128
	STA $01,S
	TXA
	AND.w #$4000
	ORA $01,S
	ORA $03,S
	TAX
	PLA
	PLA
	CLC
	RTS
.out2
	PLA
.out1
	PLA
	SEC
	RTS

; fl_step_n: X += A * delta(fl_t2) with tileAt bounds at every step.
; Carry set if it leaves the map. Preserves Y.
fl_step_n:
	PHY
	TAY
	BEQ .done
.loop
	LDA.w !fl_t2
	JSR fl_step
	BCS .out
	DEY
	BNE .loop
.done
	PLY
	CLC
	RTS
.out
	PLY
	SEC
	RTS

; Save / restore the fetched descriptor around nested fetches (stack).
fl_save_d:
	PLA                          ; return address
	STA.w !fl_t0
	LDA.w !fl_d_meta : PHA
	LDA.w !fl_d_rep : PHA
	LDA.w !fl_d_code : PHA
	LDA.w !fl_d_beh : PHA
	LDA.w !fl_d_flags : PHA
	LDA.w !fl_d_tile : PHA
	LDA.w !fl_t0
	PHA
	RTS
fl_load_d:
	PLA
	STA.w !fl_t0
	PLA : STA.w !fl_d_tile
	PLA : STA.w !fl_d_flags
	PLA : STA.w !fl_d_beh
	PLA : STA.w !fl_d_code
	PLA : STA.w !fl_d_rep
	PLA : STA.w !fl_d_meta
	LDA.w !fl_t0
	PHA
	RTS

; ---------------------------------------------------------------------------
; Tile cache: 64 entries of location (word), tile id, value (word, !FLC_*).

; Unrolled (a map load and a long walk's end clear it; the loop took about
; 7 scanlines). Preserves X and Y.
fl_cache_clear:
	LDA.w #$FFFF
	!fl_i = 0
	while !fl_i < !FL_CACHE_N
		!fl_o #= !fl_cache+(!fl_i*6)
		STA.l !fl_o
		!fl_i #= !fl_i+1
	endwhile
	LDA.w #$0000
	STA.l !fl_g_akn              ; grid verdicts expire with the cache (they
	STA.l !fl_g_gkn              ; may depend on neighbouring tiles)
	STZ.w !fl_cache_age
	RTS

; fl_cache_slot: X = idx -> Y = entry offset; carry set when the entry
; holds this location with the current tile (A = its value word).
; Preserves X. Uses fl_t4. Neighbours (tx +-1, ty +-1) never share a slot.
fl_cache_slot:
	TXA
	LSR : LSR : LSR : LSR
	AND.w #$07F8                 ; (idx >> 7) * 8
	STA.w !fl_t4
	TXA
	CLC
	ADC.w !fl_t4
	AND.w #$003F
	STA.w !fl_t4
	ASL
	ADC.w !fl_t4
	ASL                          ; * 6
	TAY
	PHX
	TYX
	LDA.l !fl_cache,X
	CMP $01,S
	BNE .miss
	PLX
	LDA.l $7F0000,X
	AND.w #$00FF
	STA.w !fl_t4
	TYX
	LDA.l !fl_cache+2,X
	AND.w #$00FF
	CMP.w !fl_t4
	BNE .stale
	LDA.l !fl_cache+3,X
	PHA
	LDA.l !fl_cache,X            ; the location == idx
	TAX
	PLA
	SEC
	RTS
.stale
	LDA.l !fl_cache,X
	TAX
	CLC
	RTS
.miss
	PLX
	CLC
	RTS

; fl_cache_put: X = idx, A = value bits to OR in (an entry for another
; location or tile is replaced). A = the entry's value. Preserves X. Uses
; fl_t3, fl_t4.
fl_cache_put:
	STA.w !fl_t3
	JSR fl_cache_slot
	BCS .merge
	LDA.l $7F0000,X
	AND.w #$00FF
	STA.w !fl_t4
	PHX
	TXA
	TYX
	STA.l !fl_cache,X
	SEP #$20
	LDA.w !fl_t4
	STA.l !fl_cache+2,X
	REP #$20
	LDA.w !fl_t3
	STA.l !fl_cache+3,X
	PLX
	RTS
.merge
	ORA.w !fl_t3
	PHX
	TYX
	STA.l !fl_cache+3,X
	PLX
	RTS

; fl_class: X = idx -> A = cache value with the class bits known
; (FLC_CLRAIR, FLC_LANDB, FLC_H1/H2). Preserves X.
fl_class:
	JSR fl_cache_slot
	BCC .calc
	BIT.w #!FLC_CLV
	BEQ .calc
	RTS
.calc
	JSR fl_fetch
	LDA.w #!FLC_CLV
	STA.w !fl_t2
	LDA.w !fl_d_flags
	AND.w #$0008
	BNE .put
	JSR fl_tile0_cave
	BCS .put
	JSR fl_ferry_gap
	BCS .ferry
	LDA.w !fl_d_flags
	AND.w #$0007
	CMP.w #$0003
	BEQ .put
	CMP.w #$0001
	BNE +
	LDA.w #!FLC_CLV|!FLC_H1
	STA.w !fl_t2
+	LDA.w !fl_d_flags
	AND.w #$0007
	CMP.w #$0002
	BNE +
	LDA.w #!FLC_CLV|!FLC_H2
	STA.w !fl_t2
+	JSR fl_code_ok
	BCC .put
	LDA.w !fl_t2 : PHA
	JSR fl_blocked
	PLA : STA.w !fl_t2
	BCS .put
	LDA.w !fl_t2
	ORA.w #!FLC_CLRAIR|!FLC_LANDB
	STA.w !fl_t2
	BRA .put
.ferry
	; Karon's corridor is open air, never ground
	LDA.w !fl_t2 : PHA
	JSR fl_blocked
	PLA : STA.w !fl_t2
	BCS .put
	LDA.w !fl_t2
	ORA.w #!FLC_CLRAIR
	STA.w !fl_t2
.put
	LDA.w !fl_t2
	JMP fl_cache_put

; ---------------------------------------------------------------------------
; clear(t, terrain, air) (native-local-flight.js). X = idx.
; fl_clear_air: air = true (terrain unused). fl_clear_ground: air = false,
; terrain in fl_q_t. Carry = clear.
fl_clear_air:
	JSR fl_fetch
	LDA.w !fl_d_flags
	AND.w #$0008
	BNE .no
	JSR fl_tile0_cave
	BCS .no
	JSR fl_ferry_gap
	BCS .ferry
	LDA.w !fl_d_flags
	AND.w #$0007
	CMP.w #$0003
	BEQ .no
	JSR fl_code_ok
	BCC .no
.ferry
	JSR fl_blocked
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS

fl_clear_ground:
	JSR fl_fetch
	LDA.w !fl_d_flags
	AND.w #$0008
	BNE .no
	JSR fl_tile0_cave
	BCS .no
	JSR fl_ferry_gap
	BCS .no                      ; ferry corridor: air only
	LDA.w !fl_d_flags
	AND.w #$0007
	CMP.w #$0003
	BEQ .no
	BCS .h                       ; heights 4-7: no band
	CMP.w #$0000
	BEQ .h
	EOR.w !fl_q_t                ; heights 1 and 2 exclude each other
	CMP.w #$0003
	BEQ .no
.h
	JSR fl_code_ok
	BCC .no
	JSR fl_blocked
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS

; code === 0 || movementFloor(code) || (code === $C1 && replacement === 0)
fl_code_ok:
	LDA.w !fl_d_code
	BEQ .yes
	AND.w #$00F0
	CMP.w #$0020
	BEQ .yes
	CMP.w #$0030
	BEQ .yes
	LDA.w !fl_d_code
	CMP.w #$00C1
	BNE .no
	LDA.w !fl_d_rep
	BEQ .yes
.no
	CLC
	RTS
.yes
	SEC
	RTS

; The cave's transparent filler (tileset 10, layer 0, tile 0) is never clear.
fl_tile0_cave:
	CPX.w #$4000
	BCS .no
	LDA.w !fl_d_tile
	BNE .no
	LDA.w !fl_ts
	CMP.w #10
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; ferryGap(t): Karon's corridor between the two piers of map 32 (fetched
; descriptor = t, kept). Carry = gap.
fl_ferry_gap:
	LDA.w !fl_mflags
	AND.w #!FLM_FERRY
	BEQ .no
	CPX.w #$4000
	BCC .no                      ; layer 1 only
	JSR fl_tx
	CMP.w #24
	BCC .no
	CMP.w #30
	BCS .no
	JSR fl_ty
	CMP.w #18
	BCC .no
	CMP.w #44
	BCS .no
	LDA.w !fl_d_code
	BNE .no
	LDA.w !fl_d_beh
	AND.w #$0090
	BNE .no
	LDA.w !fl_d_flags
	AND.w #$0008
	BNE .no
	JSR fl_save_d
	PHX
	JSR fl_tx
	ORA.w #$4000+(17*128)
	TAX
	JSR fl_ferry_deck
	BCC .nodeck
	TXA
	CLC
	ADC.w #(44-17)*128
	TAX
	JSR fl_ferry_deck
	BCC .nodeck
	PLX
	JSR fl_load_d
	SEC
	RTS
.nodeck
	PLX
	JSR fl_load_d
.no
	CLC
	RTS
fl_ferry_deck:
	JSR fl_ty
	CMP.w !fl_H
	BCS .no                      ; tileAt bounds
	JSR fl_fetch
	LDA.w !fl_d_code
	BNE .no
	LDA.w !fl_d_beh
	AND.w #$0090
	BNE .no
	LDA.w !fl_d_flags
	AND.w #$000F
	CMP.w #$0002
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; ---------------------------------------------------------------------------
; Dungeon geometry (dungeon-geometry.js), X = idx.

; tile(): carry set when the location lies in the context's interior
; [1,W-2] x [1,H-2] and is placed on its layer.
fl_dtile:
	LDA.w !fl_mflags
	AND.w #!FLM_CONTEXT
	BEQ .no
	JSR fl_tx
	BEQ .no
	INC
	CMP.w !fl_W
	BCS .no
	DEC
	CPX.w #$4000
	BCS .l1x
	CMP.w !fl_ext0x
	BCS .no
	BRA .y
.l1x
	CMP.w !fl_ext1x
	BCS .no
.y
	JSR fl_ty
	BEQ .no
	INC
	CMP.w !fl_H
	BCS .no
	DEC
	CPX.w #$4000
	BCS .l1y
	CMP.w !fl_ext0y
	BCS .no
	SEC
	RTS
.l1y
	CMP.w !fl_ext1y
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS

; dungeon.blocked(t) = context && protectedCell(t). Carry = blocked. Keeps
; the fetched descriptor (fl_d_*).
fl_blocked:
	LDA.w !fl_mflags
	AND.w #!FLM_CONTEXT
	BNE .ctx
	CLC
	RTS
.ctx
	; Joch's expanded room: every layer-0 cell but tile 70 (64x64 layout)
	LDA.w !fl_mflags
	AND.w #!FLM_JOCH
	BEQ .water
	CPX.w #$4000
	BCS .water
	LDA.w !fl_W
	CMP.w #64
	BNE .water
	LDA.w !fl_H
	CMP.w #64
	BNE .water
	LDA.l $7F0000,X
	AND.w #$00FF
	CMP.w #70
	BNE .yes
.water
	; Water Palace lower stair pockets, both layers
	LDA.w !fl_mflags
	AND.w #!FLM_POCKETS
	BEQ .cave
	JSR fl_ty
	CMP.w #59
	BCC .cave
	CMP.w #66
	BCS .cave
	JSR fl_tx
	CMP.w #12
	BCC .cave
	CMP.w #22
	BCS .cave
	CMP.w #16
	BCC .yes
	CMP.w #18
	BCS .yes
.cave
	LDA.w !fl_ts
	CMP.w #10
	BNE .no
	CPX.w #$4000
	BCS .no
	JMP fl_cave_void
.yes
	SEC
	RTS
.no
	CLC
	RTS

; caveVoid(t) for tileset 10, layer 0 (context known). Carry = void.
fl_cave_void:
	JSR fl_dtile
	BCC .void                    ; outside the placed interior
	LDA.l $7F0000,X
	AND.w #$00FF
	CLC
	ADC.w !fl_ofs0
	CMP.w #5
	BNE .open                    ; only black metatile 5 is rock or pit
	JSR fl_cache_slot
	BCC .calc
	BIT.w #!FLC_BLKV
	BEQ .calc
	AND.w #!FLC_BLK
	BEQ .open
.void
	SEC
	RTS
.open
	CLC
	RTS
.calc
	; A pit needs two shores within 12 (voidRoutes). The loose walk (no
	; rock-cap breaks) bounds the strict one: if it fails, no flood fill.
	; The caller's fetched descriptor is kept (fl_blocked contract).
	JSR fl_save_d
	LDA.w #$0000
	JSR fl_void_routes
	BCC .store_void
	JSR fl_rockcap
	BCS .store_void
	LDA.w #$0001
	JSR fl_void_routes
	BCC .store_void
	LDA.w #!FLC_BLKV
	JSR fl_cache_put
	JSR fl_load_d
	CLC
	RTS
.store_void
	LDA.w #!FLC_BLKV|!FLC_BLK
	JSR fl_cache_put
	JSR fl_load_d
	SEC
	RTS

; voidRoutes(t): carry = safe (two shores within 12 along x or y). A = 1
; applies caveCeiling() to the cells walked (strict), 0 skips it (loose).
; Frame: [shores][distance] pushed by fl_void_axis; the origin is kept on
; the stack by fl_void_routes.
fl_void_routes:
	STA.w !fl_t3
	PHX
	LDA.w #$0001                 ; axis [1,0]
	JSR fl_void_axis
	BCS .safe
	LDA $01,S
	TAX
	LDA.w #$0100                 ; axis [0,1]
	JSR fl_void_axis
	BCS .safe
	PLX
	CLC
	RTS
.safe
	PLX
	SEC
	RTS
fl_void_axis:
	PHA                          ; delta
	LDA.w #$0000
	PHA                          ; distance
	PHA                          ; shores
	LDA $05,S
	JSR fl_negd
	JSR fl_void_dir              ; sign -1
	LDA $05,S
	JSR fl_void_dir              ; sign +1
	PLA                          ; shores
	CMP.w #$0002
	BNE .no
	PLA                          ; distance
	CMP.w #13
	PLA
	BCS .no2
	SEC
	RTS
.no
	PLA
	PLA
.no2
	CLC
	RTS
; Stack on entry: [ret 1-2][shores 3-4][distance 5-6][delta 7-8]
; [ret_axis 9-10][origin 11-12]. A = delta of this direction.
fl_void_dir:
	STA.w !fl_t2
	LDA $0B,S
	TAX
	LDA.w #$0001
	STA.w !fl_t1                 ; n
	STA.w !fl_rc_tmp             ; still in t's black run
.walk
	PHX                          ; [prev 1-2][ret 3-4][shores 5-6][distance 7-8]
	LDA.w !fl_t2
	JSR fl_step
	BCC +
	PLX
	RTS
+	JSR fl_dtile
	BCS +
	PLX
	RTS
+	JSR fl_fetch
	LDA.w !fl_d_meta
	CMP.w #5
	BEQ .black
	STZ.w !fl_rc_tmp
	BRA .tested
.black
	LDA.w !fl_t3
	BEQ .tested                  ; loose walk
	LDA.w !fl_rc_tmp
	BNE .tested                  ; same region as t (known open)
	LDA.w !fl_t1 : PHA
	LDA.w !fl_t2 : PHA
	LDA.w !fl_t3 : PHA
	JSR fl_rockcap
	PLA : STA.w !fl_t3
	PLA : STA.w !fl_t2
	PLA : STA.w !fl_t1
	BCS .stop                    ; caveCeiling(next): break
	JSR fl_fetch
.tested
	LDA.w !fl_d_flags
	AND.w #$0008
	BNE .stop
	LDA.w !fl_d_beh
	AND.w #$00D0
	BNE .stop
	; air = dungeonAirTiles[10] has the metatile (any code) or code 10-17
	LDY.w !fl_p_dair
	LDA.w !fl_d_meta
	JSR fl_inset
	BCS .air
	LDA.w !fl_d_code
	CMP.w #$0010
	BCC .notair
	CMP.w #$0018
	BCC .air
.notair
	JSR fl_air_shore
	BCC .stop                    ; neither air nor shore: break
	; shore: distance += n, shores += 1
	PLA                          ; drop prev
	LDA $05,S
	CLC
	ADC.w !fl_t1
	STA $05,S
	LDA $03,S
	INC
	STA $03,S
	RTS
.air
	PLA                          ; drop prev, continue from this cell
	LDA.w !fl_t1
	INC
	STA.w !fl_t1
	CMP.w #13
	BCS +
	JMP .walk
+	RTS
.stop
	PLX
	RTS

; Carry = the fetched descriptor is dungeon air material by art or code
; (code 0 and dungeonAirTiles[tileset] has the metatile, or tileset 10 and
; code $10-$17). Protection and flags are checked by the callers.
fl_dair_code:
	LDA.w !fl_d_code
	BNE .code
	PHY
	LDY.w !fl_p_dair
	LDA.w !fl_d_meta
	JSR fl_inset
	PLY
	RTS
.code
	LDA.w !fl_ts
	CMP.w #10
	BNE .no
	LDA.w !fl_d_code
	CMP.w #$0010
	BCC .no
	CMP.w #$0018
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS

; caveCeiling(t): carry = t (black, layer 0) lies in a sealed black region,
; an 8-connected region of raw tile 5 cells that are all placed, away from
; the map edge and next to no tile 0. Bounded flood fill (!FL_ROCKCAP_MAX
; cells inside a 32x32 window centred on t); a larger region is open. The
; generator proves every sealed region of every native layout fits.
; Preserves X. Uses fl_t0-fl_t4, fl_rc_seen, fl_rc_queue.
macro fl_rc_neighbour(offset)
	TXA
	CLC
	ADC.w #<offset>
	TAX
	LDA.l $7F0000,X
	AND.w #$00FF
	BNE ?not0
	JMP fl_rc_open_pull
?not0:
	CMP.w #5
	BNE ?done
	JSR fl_rc_visit
	BCC ?done
	JMP fl_rc_open_pull
?done:
	LDA $01,S
	TAX
endmacro
fl_rockcap:
	PHX
	JSR fl_tx
	SEC
	SBC.w #16
	STA.w !fl_t0                 ; window x0
	JSR fl_ty
	SEC
	SBC.w #16
	STA.w !fl_t1                 ; window y0
	PHX
	LDX.w #126
	LDA.w #$0000
.clr
	STA.l !fl_rc_seen,X
	DEX : DEX
	BPL .clr
	PLX
	TXA
	STA.l !fl_rc_queue
	JSR fl_rc_bit
	JSR fl_rc_setbit
	LDA.w #$0001
	STA.w !fl_t2                 ; queue length
	STZ.w !fl_t3                 ; head
.next
	LDA.w !fl_t3
	CMP.w !fl_t2
	BCC +
	JMP .sealed
+	ASL
	TAX
	LDA.l !fl_rc_queue,X
	TAX
	INC.w !fl_t3
	; open if this cell is unplaced (layer-0 extent) or on the map edge
	JSR fl_tx
	BNE +
	JMP .open
+	CMP.w !fl_ext0x
	BCC +
	JMP .open
+	INC
	CMP.w !fl_W
	BCC +
	JMP .open
+	JSR fl_ty
	BNE +
	JMP .open
+	CMP.w !fl_ext0y
	BCC +
	JMP .open
+	INC
	CMP.w !fl_H
	BCC +
	JMP .open
+	PHX                          ; the cell (interior: all neighbours exist)
	%fl_rc_neighbour(-129)
	%fl_rc_neighbour(-128)
	%fl_rc_neighbour(-127)
	%fl_rc_neighbour(-1)
	%fl_rc_neighbour(1)
	%fl_rc_neighbour(127)
	%fl_rc_neighbour(128)
	%fl_rc_neighbour(129)
	PLX
	JMP .next
.open
	PLX
	CLC
	RTS
.sealed
	PLX
	SEC
	RTS

fl_rc_open_pull:
	PLX                          ; the cell
	PLX                          ; t
	CLC
	RTS

; Visit a black neighbour X: queue it unless seen. Carry set = the region
; must be treated as open (outside the window or too many cells).
fl_rc_visit:
	JSR fl_rc_bit
	BMI .open                    ; outside the window
	PHA
	JSR fl_rc_getbit
	PLA
	BCS .seen
	JSR fl_rc_setbit
	LDA.w !fl_t2
	CMP.w #!FL_ROCKCAP_MAX
	BCS .open
	ASL
	PHX
	TAX
	LDA $01,S
	STA.l !fl_rc_queue,X
	PLX
	INC.w !fl_t2
.seen
	CLC
	RTS
.open
	SEC
	RTS
; window bit number of X in A (N set when outside). Uses fl_t4.
fl_rc_bit:
	JSR fl_tx
	SEC
	SBC.w !fl_t0
	CMP.w #32
	BCS .out
	STA.w !fl_t4
	JSR fl_ty
	SEC
	SBC.w !fl_t1
	CMP.w #32
	BCS .out
	ASL : ASL : ASL : ASL : ASL
	ORA.w !fl_t4
	RTS
.out
	LDA.w #$FFFF
	RTS
; carry = bit A set (A = bit number, preserved X)
fl_rc_getbit:
	PHX
	PHA
	AND.w #$0007
	TAX
	LDA.l fl_bitmask,X
	AND.w #$00FF
	STA.w !fl_t4
	PLA
	LSR : LSR : LSR
	TAX
	LDA.l !fl_rc_seen,X
	PLX
	AND.w !fl_t4
	BEQ .no
	SEC
	RTS
.no
	CLC
	RTS
fl_rc_setbit:
	BMI .out
	PHX
	PHA
	AND.w #$0007
	TAX
	LDA.l fl_bitmask,X
	AND.w #$00FF
	STA.w !fl_t4
	PLA
	LSR : LSR : LSR
	TAX
	SEP #$20
	LDA.l !fl_rc_seen,X
	ORA.w !fl_t4
	STA.l !fl_rc_seen,X
	REP #$20
	PLX
.out
	RTS

; ordinary(t): !(flags & 8) && !(beh & $D0) && code == 0 (fetched).
fl_ordinary:
	LDA.w !fl_d_flags
	AND.w #$0008
	BNE .no
	LDA.w !fl_d_beh
	AND.w #$00D0
	BNE .no
	LDA.w !fl_d_code
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; floor(t): ordinary, height < 3, not a palace brazier, not blank
; metatile 0, not a palace window recess (fetched descriptor, X = idx).
fl_floor:
	JSR fl_ordinary
	BCC .no
	LDA.w !fl_d_flags
	AND.w #$0007
	CMP.w #$0003
	BCS .no
	LDA.w !fl_ts
	CMP.w #23
	BNE .notpalace
	CPX.w #$4000
	BCS .notpalace
	PHY
	LDY.w #fl_set_brazier&$FFFF
	LDA.w !fl_d_tile
	JSR fl_inset
	BCS .nopull
	LDY.w #fl_set_falsepalace&$FFFF
	LDA.w !fl_d_meta
	JSR fl_inset
	PLY
	BCS .no
.notpalace
	LDA.w !fl_d_meta
	BNE .yes
	LDA.w !fl_tsf
	AND.w #!TSF_BLANKZERO
	BNE .no
.yes
	SEC
	RTS
.nopull
	PLY
.no
	CLC
	RTS

; airShore(t): floor, or (stairs-shore tileset) a stair/current cell of
; height < 3 without special behaviour (fetched descriptor).
fl_air_shore:
	JSR fl_floor
	BCS .yes
	LDA.w !fl_tsf
	AND.w #!TSF_STAIRSHORE
	BEQ .no
	LDA.w !fl_d_flags
	AND.w #$0008
	BNE .no
	LDA.w !fl_d_beh
	AND.w #$00D0
	BNE .no
	LDA.w !fl_d_flags
	AND.w #$0007
	CMP.w #$0003
	BCS .no
	LDA.w !fl_d_code
	AND.w #$00F0
	CMP.w #$0020
	BEQ .yes
	CMP.w #$0030
	BEQ .yes
.no
	CLC
	RTS
.yes
	SEC
	RTS

; airMaterial(t): !protectedCell && !(flags & 8) && !(beh & $D0) && air art
; or code. X = idx (placed). Fetches. Carry = air material.
fl_air_material:
	JSR fl_fetch
	LDA.w !fl_d_flags
	AND.w #$0008
	BNE .no
	LDA.w !fl_d_beh
	AND.w #$00D0
	BNE .no
	JSR fl_dair_code
	BCC .no
	JSR fl_blocked               ; keeps the fetched descriptor
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS

; span(t, delta, airMaterial, limit): carry = both directions reach an air
; shore that is not air before leaving placed air. A = delta, Y = limit.
fl_air_span:
	PHX                          ; [origin]
	PHY                          ; [limit]
	PHA                          ; [delta]
	JSR fl_air_span_dir
	BCC .no
	LDA $05,S
	TAX
	LDA $01,S
	JSR fl_negd
	STA $01,S
	JSR fl_air_span_dir
	BCC .no
	PLA
	PLY
	PLX
	SEC
	RTS
.no
	PLA
	PLY
	PLX
	CLC
	RTS
; Stack: [ret 1-2][delta 3-4][limit 5-6][origin 7-8]
fl_air_span_dir:
	; axis-aligned walks on maps without protected cells take the lean
	; walker (same rules, inline descriptor tests)
	LDA.w !fl_ts
	CMP.w #10
	BEQ .generic
	LDA.w !fl_mflags
	AND.w #!FLM_JOCH
	BNE .generic
	LDA $03,S
	CMP.w #$0001
	BEQ .horiz
	CMP.w #$00FF
	BEQ .horiz
	CMP.w #$0100
	BEQ .vert
	CMP.w #$FF00
	BNE .generic
.vert
	; Water Palace pockets (columns 12-21): only walks clear of them
	LDA.w !fl_mflags
	AND.w #!FLM_POCKETS
	BEQ .fast
	JSR fl_tx
	CMP.w #12
	BCC .fast
	CMP.w #22
	BCC .generic
	BRA .fast
.horiz
	LDA.w !fl_mflags
	AND.w #!FLM_POCKETS
	BEQ .fast
	JSR fl_ty
	CMP.w #59
	BCC .fast
	CMP.w #66
	BCC .generic
.fast
	LDA $05,S
	TAY
	LDA $03,S
	JMP fl_air_walk_fast
.generic
	LDA $05,S
	TAY
.walk
	LDA $03,S
	JSR fl_step
	BCS .no
	JSR fl_dtile
	BCC .no
	PHY
	JSR fl_air_material          ; leaves this cell's descriptor fetched
	PLY
	BCS .air
	JMP fl_air_shore             ; found iff an air shore
.air
	DEY
	BNE .walk
.no
	CLC
	RTS

; Lean airMaterial walk (no protected cells on this map; context known).
; X = origin, A = axis delta ($0001, $00FF, $0100, $FF00), Y = limit.
; Walks while cells are placed air material; carry = the first other cell
; is an air shore (fl_air_shore on its descriptor). Uses fl_t0-fl_t3.
fl_air_walk_fast:
	STA.w !fl_t0                 ; delta
	; placed interior of this layer: x in [1, xmax), y in [1, ymax)
	LDA.w !fl_W
	DEC
	CPX.w #$4000
	BCS +
	CMP.w !fl_ext0x
	BCC ++
	LDA.w !fl_ext0x
	BRA ++
+	CMP.w !fl_ext1x
	BCC ++
	LDA.w !fl_ext1x
++	STA.w !fl_t1                 ; xmax
	LDA.w !fl_H
	DEC
	CPX.w #$4000
	BCS +
	CMP.w !fl_ext0y
	BCC ++
	LDA.w !fl_ext0y
	BRA ++
+	CMP.w !fl_ext1y
	BCC ++
	LDA.w !fl_ext1y
++	STA.w !fl_t2                 ; ymax
	; idx delta and the fixed coordinate's check
	LDA.w !fl_t0
	CMP.w #$0001
	BEQ .h
	CMP.w #$00FF
	BEQ .h
	; vertical: the column must be inside, rows checked per step
	JSR fl_tx
	BEQ .no
	CMP.w !fl_t1
	BCS .no
	JSR fl_ty
	STA.w !fl_t3                 ; ty
	LDA.w !fl_t0
	CMP.w #$0100
	BEQ .down
.up
	DEC.w !fl_t3
	BEQ .no
	TXA
	SEC
	SBC.w #128
	TAX
	JSR fl_walk_cell
	BCC .found
	DEY
	BNE .up
	BRA .no
.down
	INC.w !fl_t3
	LDA.w !fl_t3
	CMP.w !fl_t2
	BCS .no
	TXA
	CLC
	ADC.w #128
	TAX
	JSR fl_walk_cell
	BCC .found
	DEY
	BNE .down
.no
	CLC
	RTS
.h
	JSR fl_ty
	BEQ .no
	CMP.w !fl_t2
	BCS .no
	JSR fl_tx
	STA.w !fl_t3                 ; tx
	LDA.w !fl_t0
	CMP.w #$0001
	BEQ .right
.left
	DEC.w !fl_t3
	BEQ .no
	DEX
	JSR fl_walk_cell
	BCC .found
	DEY
	BNE .left
	BRA .no
.right
	INC.w !fl_t3
	LDA.w !fl_t3
	CMP.w !fl_t1
	BCS .no
	INX
	JSR fl_walk_cell
	BCC .found
	DEY
	BNE .right
	BRA .no
.found
	JSR fl_fetch
	JMP fl_air_shore
; carry = cell X is air material: !(flags & 8) && !(beh & $D0) && code 0
; && dungeonAirTiles has the metatile (no protection, tileset != 10)
fl_walk_cell:
	PHX                          ; [idx]
	LDA.l $7F0000,X
	AND.w #$00FF
	STA.w !fl_t5                 ; tile
	ASL
	ASL
	CPX.w #$4000
	BCC +
	ORA.w #$0400
+	TAX
	LDA.l $7FB800,X
	BIT.w #$D008                 ; flags & 8, behaviour & $D0
	BNE .no
	LDA.l $7FB802,X
	AND.w #$00FF
	BNE .no                      ; code != 0 (code 10-17 counts only in tileset 10)
	PLX
	PHX
	LDA.w !fl_t5
	CPX.w #$4000
	BCS +
	CLC
	ADC.w !fl_ofs0
	BRA ++
+	CLC
	ADC.w !fl_ofs1
++	PHY
	LDY.w !fl_p_dair
	JSR fl_inset
	PLY
	PLX
	RTS
.no
	PLX
	CLC
	RTS

; dungeon.air(t) = spike(t) || airRoute(t). Carry.
fl_dungeon_air:
	JSR fl_cache_slot
	BCC .compute
	BIT.w #!FLC_AIRV
	BEQ .compute
	AND.w #!FLC_AIR
	BEQ +
	SEC
	RTS
+	CLC
	RTS
.compute
	JSR fl_dair_calc
	BCS .yes
	LDA.w #!FLC_AIRV
	JSR fl_cache_put
	CLC
	RTS
.yes
	LDA.w #!FLC_AIRV|!FLC_AIR
	JSR fl_cache_put
	SEC
	RTS
fl_dair_calc:
	JSR fl_dtile
	BCS .placed
	CLC
	RTS
.placed
	JSR fl_fetch
	; ruins spikes (tileset 9, metatile 319)
	LDA.w !fl_ts
	CMP.w #9
	BNE .dais
	JSR fl_ordinary
	BCC .dais
	LDA.w !fl_d_meta
	CMP.w #319
	BNE .dais
	SEC
	RTS
.dais
	; Tree Palace raised dais: a brick row between placed floors of heights
	; 2 (north) and 1 (south)
	LDA.w !fl_ts
	CMP.w #23
	BNE .route
	CPX.w #$4000
	BCS .route
	JSR fl_ordinary
	BCC .route
	LDA.w !fl_d_meta
	CMP.w #16
	BEQ .daiscell
	CMP.w #19
	BEQ .daiscell
	CMP.w #32
	BEQ .daiscell
	CMP.w #35
	BNE .route
.daiscell
	PHX
	LDA.w #$FF00
	JSR fl_step
	BCS .daisno
	JSR fl_dtile
	BCC .daisno
	JSR fl_fetch
	JSR fl_floor
	BCC .daisno
	LDA.w !fl_d_flags
	AND.w #$0007
	CMP.w #$0002
	BNE .daisno
	LDA $01,S
	TAX
	LDA.w #$0100
	JSR fl_step
	BCS .daisno
	JSR fl_dtile
	BCC .daisno
	JSR fl_fetch
	JSR fl_floor
	BCC .daisno
	LDA.w !fl_d_flags
	AND.w #$0007
	CMP.w #$0001
	BNE .daisno
	PLX
	SEC
	RTS
.daisno
	PLX
.route
	JSR fl_air_material
	BCS .material
	CLC
	RTS
.material
	JSR fl_cache_slot
	BCC .calc
	BIT.w #!FLC_AIRV
	BEQ .calc
	AND.w #!FLC_AIR
	BEQ .notair
	SEC
	RTS
.notair
	CLC
	RTS
.calc
	JSR fl_air_direct
	BCS .yes
	LDA.w !fl_ts
	CMP.w #15
	BNE .seam
	; castle bridges: diagonal spans
	LDA.w #$0101
	LDY.w #16
	JSR fl_air_span
	BCS .yes
	LDA.w #$FF01
	LDY.w #16
	JSR fl_air_span
	BCS .yes
.seam
	; one-column seams between two air corridors (castle and palace)
	LDA.w !fl_ts
	CMP.w #15
	BEQ .seamok
	CMP.w #23
	BNE .no
.seamok
	LDA.w #$0001
	JSR fl_air_seam
	BCS .yes
	LDA.w #$0100
	JSR fl_air_seam
	BCS .yes
.no
	LDA.w #!FLC_AIRV
	JSR fl_cache_put
	CLC
	RTS
.yes
	LDA.w #!FLC_AIRV|!FLC_AIR
	JSR fl_cache_put
	SEC
	RTS
; direct(p) without the airMaterial(p) test (callers check it)
fl_air_direct:
	LDA.w #$0001
	LDY.w #48
	JSR fl_air_span
	BCS .yes
	LDA.w #$0100
	LDY.w #48
	JSR fl_air_span
.yes
	RTS
; seam: A = axis delta; direct(tile(t - d)) && direct(tile(t + d))
fl_air_seam:
	PHX                          ; [origin 3-4]
	PHA                          ; [delta 1-2]
	JSR fl_negd
	JSR fl_step
	BCS .no
	JSR fl_dtile
	BCC .no
	JSR fl_air_material
	BCC .no
	JSR fl_air_direct
	BCC .no
	LDA $03,S
	TAX
	LDA $01,S
	JSR fl_step
	BCS .no
	JSR fl_dtile
	BCC .no
	JSR fl_air_material
	BCC .no
	JSR fl_air_direct
	BCC .no
	PLA
	PLX
	SEC
	RTS
.no
	PLA
	PLX
	CLC
	RTS

; ---------------------------------------------------------------------------
; Whip routes (native-whip-routes.js). X = idx.

; pad(t): plain cell of height <= 2 that is the special-tile pad (BF / $46
; in special mode 1) or carries floor event 6D8. Fetches. Carry = pad.
fl_whip_pad:
	JSR fl_fetch
	LDA.w !fl_d_code
	BNE .no
	LDA.w !fl_d_flags
	AND.w #$000F
	CMP.w #$0003
	BCS .no                      ; height > 2 or flags & 8
	LDA $B8
	AND.w #$0003
	CMP.w #$0001
	BNE .event
	LDA.w !fl_d_tile
	CMP.w #$00BF
	BNE .event
	LDA.w !fl_d_beh
	CMP.w #$0046
	BEQ .yes
.event
	JSR fl_floor_event
	BCC .no
	CMP.w #$06D8
	BEQ .yes
.no
	CLC
	RTS
.yes
	SEC
	RTS

; floorTileEvent(t) (native-barriers.js): carry set with A = the trigger
; word of the fetched marker tile from the map's table at C8:4000.
; Uses fl_t4-fl_t6 (calls nothing that fetches).
fl_floor_event:
	LDA.w !fl_d_beh
	AND.w #$0080
	BEQ .no
	LDA $4D
	AND.w #$00FF
	STA.w !fl_t4
	LDA.w !fl_d_tile
	CMP.w !fl_t4
	BCC .no
	LDA.w !fl_map
	CMP.w #511
	BCS .no
	PHX
	ASL
	TAX
	LDA.l $C84000,X              ; start
	STA.w !fl_t5
	LDA.l $C84002,X              ; end
	STA.w !fl_t6
	LDA.w !fl_d_tile
	SEC
	SBC.w !fl_t4
	STA.w !fl_t4
	LDA $B8
	AND.w #$0004
	BEQ +
	INC.w !fl_t4
+	LDA.w !fl_t4
	ASL
	CLC
	ADC.w !fl_t5
	STA.w !fl_t4                 ; at
	INC
	CMP.w !fl_t6                 ; at + 1 < end
	BCS .nopull
	LDX.w !fl_t4
	LDA.l $C80000,X
	PLX
	SEC
	RTS
.nopull
	PLX
.no
	CLC
	RTS

; post(t): code $F8, replacement $6F (fetched)
fl_whip_post:
	LDA.w !fl_d_code
	CMP.w #$00F8
	BNE .no
	LDA.w !fl_d_rep
	CMP.w #$006F
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS
; shore(t): code 0, height < 3, !(flags & 8), !(beh & $90) (fetched)
fl_whip_shore:
	LDA.w !fl_d_code
	BNE .no
	LDA.w !fl_d_flags
	AND.w #$000F
	CMP.w #$0003
	BCS .no
	LDA.w !fl_d_beh
	AND.w #$0090
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; fl_ray: X = p, A = k (signed), fl_t2 = d (a unit step). X = p + k*d on
; the same layer, carry clear; carry set when that cell is outside
; [0,W) x [0,H) (tileAt() == null; X unchanged). Preserves Y. Uses fl_t5.
fl_ray:
	STA.w !fl_t5
	LDA.w !fl_t2
	BIT.w #$00FF
	BEQ .vert
	BIT.w #$0080
	BEQ +
	LDA.w !fl_t5                 ; dx = -1: tx - k
	EOR.w #$FFFF
	INC
	STA.w !fl_t5
+	TXA
	AND.w #$007F
	CLC
	ADC.w !fl_t5
	CMP.w !fl_W
	BCS .out
	STA.w !fl_t5
	TXA
	AND.w #$FF80
	ORA.w !fl_t5
	TAX
	CLC
	RTS
.vert
	BIT.w #$8000
	BEQ +
	LDA.w !fl_t5                 ; dy = -1: ty - k
	EOR.w #$FFFF
	INC
	STA.w !fl_t5
+	TXA
	ASL
	XBA
	AND.w #$007F                 ; ty
	CLC
	ADC.w !fl_t5
	CMP.w !fl_H
	BCS .out
	XBA
	LSR                          ; ty << 7
	STA.w !fl_t5
	TXA
	AND.w #$407F                 ; layer and tx
	ORA.w !fl_t5
	TAX
	CLC
	RTS
.out
	SEC
	RTS

; span(p, d): shores at p-d and p+5d, plain cells at p+d .. p+3d.
; X = p, fl_t2 = delta. Preserves X (not Y).
fl_whip_span:
	PHX
	LDA.w #$FFFF
	JSR fl_ray
	BCS .no
	JSR fl_fetch
	JSR fl_whip_shore
	BCC .no
	LDA $01,S
	TAX
	LDA.w #5
	JSR fl_ray
	BCS .no
	JSR fl_fetch
	JSR fl_whip_shore
	BCC .no
	LDY.w #1
.mid
	LDA $01,S
	TAX
	TYA
	JSR fl_ray
	BCS .no
	JSR fl_fetch
	LDA.w !fl_d_code
	BNE .no
	LDA.w !fl_d_flags
	AND.w #$0008
	BNE .no
	LDA.w !fl_d_beh
	AND.w #$0090
	BNE .no
	INY
	CPY.w #4
	BCC .mid
	PLX
	SEC
	RTS
.no
	PLX
	CLC
	RTS

; route(p, d): X = p, fl_t2 = delta. Preserves X, fl_t2.
fl_whip_route:
	JSR fl_whip_pad
	BCS +
	RTS
+	JSR fl_whip_span
	BCS +
	RTS
+	PHX                          ; [p]
	LDA.w #4
	JSR fl_ray
	BCS .nopull
	JSR fl_fetch
	JSR fl_whip_post
	BCS .yespull
	JSR fl_whip_shore
	BCC .nopull
	; Shade/Grand Palace paired lanes: a pad beside the far end, a post
	; beside p, and a complete reverse crossing from that pad
	PHX                          ; [end][p]
	LDA.w #$FFFF
	JSR fl_whip_side
	BCS .yes2
	LDA.w #$0001
	JSR fl_whip_side
	BCS .yes2
	PLX
.nopull
	PLX
	CLC
	RTS
.yes2
	PLX
.yespull
	PLX
	SEC
	RTS
; A = side (+1/-1). Stack: [ret 1-2][end 3-4][p 5-6]. Perpendicular delta
; (-dy*side, dx*side). Carry = pad(end+perp) && post(p+perp) &&
; span(end+perp, -d). Preserves fl_t2.
fl_whip_side:
	PHA                          ; [side 1-2][ret][end 5-6][p 7-8]
	; dx, dy of fl_t2 as signed bytes
	LDA.w !fl_t2
	XBA
	AND.w #$00FF                 ; dy (byte)
	EOR.w #$00FF
	INC
	AND.w #$00FF                 ; -dy (byte)
	STA.w !fl_t0
	LDA.w !fl_t2
	AND.w #$00FF                 ; dx (byte)
	XBA
	ORA.w !fl_t0                 ; perp for side +1: (-dy, dx)
	STA.w !fl_t0
	LDA $01,S
	BPL +
	LDA.w !fl_t0
	JSR fl_negd                  ; side -1: (dy, -dx)
	STA.w !fl_t0
+	LDA.w !fl_t0
	STA $01,S                    ; [perp 1-2]
	LDA $05,S
	TAX                          ; end
	LDA $01,S
	JSR fl_step
	BCS .no
	PHX                          ; [back 1-2][perp 3-4][ret][end 7-8][p 9-10]
	JSR fl_whip_pad
	BCC .nopull
	LDA $09,S
	TAX                          ; p
	LDA $03,S
	JSR fl_step                  ; anchor
	BCS .nopull
	JSR fl_fetch
	JSR fl_whip_post
	BCC .nopull
	PLX                          ; back
	LDA.w !fl_t2
	PHA
	JSR fl_negd
	STA.w !fl_t2                 ; reverse direction
	JSR fl_whip_span
	PLA
	STA.w !fl_t2
	PLA                          ; perp (carry kept)
	RTS
.nopull
	PLX
.no
	PLA
	CLC
	RTS

; crossable(t): X = idx. Carry = inside a complete pad/post corridor
; (cached per tile).
fl_whip_crossable:
	LDA.w !fl_tsf
	AND.w #!TSF_WHIP
	BNE +
	CLC
	RTS
+	JSR fl_cache_slot
	BCC .calc
	BIT.w #!FLC_WHIPV
	BEQ .calc
	AND.w #!FLC_WHIP
	BEQ +
	SEC
	RTS
+	CLC
	RTS
.calc
	JSR fl_whip_calc
	BCS .yes
	LDA.w #!FLC_WHIPV
	JSR fl_cache_put
	CLC
	RTS
.yes
	LDA.w #!FLC_WHIPV|!FLC_WHIP
	JSR fl_cache_put
	SEC
	RTS
; fl_pad_quick: X = idx. Carry clear when the tile cannot be a whip pad:
; neither a floor-event marker (behaviour bit 7) nor the special-mode BF
; tile. Preserves X and Y.
fl_pad_quick:
	LDA.l $7F0000,X
	AND.w #$00FF
	CMP.w #$00BF
	BEQ .maybe
	PHX
	ASL
	ASL
	CPX.w #$4000
	BCC +
	ORA.w #$0400
+	TAX
	LDA.l $7FB800,X              ; flags | behaviour << 8
	PLX
	AND.w #$8000
	BEQ .no
.maybe
	SEC
	RTS
.no
	CLC
	RTS

fl_whip_calc:
	JSR fl_fetch
	LDA.w !fl_d_code
	BEQ .ok
	JSR fl_whip_post
	BCS .ok
	CLC
	RTS
.ok
	PHX                          ; [t 1-2]
	; n = 0: t itself as a pad, in each direction
	JSR fl_pad_quick
	BCC .rays
	LDA.w #$0000
.self
	PHA                          ; [k 1-2][t 3-4]
	TAX
	LDA.l fl_whip_dirs,X
	STA.w !fl_t2
	LDA $03,S
	TAX
	JSR fl_whip_route            ; preserves X and fl_t2
	BCS .yesself
	PLA
	INC : INC
	CMP.w #8
	BCC .self
.rays
	; n = 1-4: walk each ray p = t - d*n while it stays on the map (a ray
	; that leaves it never comes back: tileAt() is null from there on)
	LDY.w #0
.dir
	PHY                          ; [dir 1-2][t 3-4]
	TYX
	LDA.l fl_whip_dirs,X
	STA.w !fl_t2
	LDA.l fl_whip_stride,X
	PHA                          ; [stride 1-2][dir 3-4][t 5-6]
	LDA $05,S
	TAX
	CPY.w #4
	BCS .horiz
	JSR fl_ty
	CPY.w #2
	BEQ .avail                   ; d down: the ray goes up (ty steps)
	EOR.w #$FFFF                 ; d up: the ray goes down (H-1-ty)
	SEC
	ADC.w !fl_H
	DEC
	BRA .avail
.horiz
	JSR fl_tx
	CPY.w #6
	BEQ .avail                   ; d right: the ray goes left (tx steps)
	EOR.w #$FFFF                 ; d left: the ray goes right (W-1-tx)
	SEC
	ADC.w !fl_W
	DEC
.avail
	CMP.w #1
	BCC .nextdir
	CMP.w #5
	BCC +
	LDA.w #4
+	PHA                          ; [count 1-2][stride 3-4][dir 5-6][t 7-8]
.n
	TXA
	CLC
	ADC $03,S
	TAX
	JSR fl_pad_quick
	BCC +
	JSR fl_whip_route
	BCS .yes
+	LDA $01,S
	DEC
	STA $01,S
	BNE .n
	PLA
.nextdir
	PLA                          ; stride
	PLY
	INY : INY
	CPY.w #8
	BCC .dir
	PLX
	CLC
	RTS
.yes
	PLA
	PLA
	PLY
	PLX
	SEC
	RTS
.yesself
	PLA
	PLX
	SEC
	RTS
; idx stride of t - d for each direction of fl_whip_dirs
fl_whip_stride:
	dw 128, -128, 1, -1
fl_whip_dirs:
	dw $FF00, $0100, $00FF, $0001    ; [0,-1] [0,1] [-1,0] [1,0]

; ---------------------------------------------------------------------------
; lowObstacle(t) (native-local-flight.js). X = idx. Carry = low obstacle.
fl_low:
	JSR fl_cache_slot
	BCC .calc
	BIT.w #!FLC_LOWV
	BEQ .calc
	AND.w #!FLC_LOW
	BEQ .no
	SEC
	RTS
.calc
	JSR fl_lowobs
	BCS .yes
	LDA.w #!FLC_LOWV
	JSR fl_cache_put
.no
	CLC
	RTS
.yes
	LDA.w #!FLC_LOWV|!FLC_LOW
	JSR fl_cache_put
	SEC
	RTS

fl_lowobs:
	JSR fl_blocked
	BCC +
	JMP .no
+	JSR fl_fetch
	JSR fl_ferry_gap
	BCC +
	JMP .yes
+	JSR fl_ship_rail
	BCC +
	JMP .yes
+	JSR fl_whip_crossable
	BCC +
	JMP .yes
+	JSR fl_dungeon_air
	BCC +
	JMP .yes
+	JSR fl_fetch
	; cave gaps have one authoritative placed-floor check
	LDA.w !fl_ts
	CMP.w #10
	BNE .heads
	LDA.w !fl_mflags
	AND.w #!FLM_CONTEXT
	BEQ .heads
	PHY
	LDY.w #fl_set_cavegap&$FFFF
	LDA.w !fl_d_meta
	JSR fl_inset
	PLY
	BCC +
	JMP .no
+	LDA.w !fl_d_code
	CMP.w #$0010
	BCC .heads
	CMP.w #$0018
	BCS .heads
	JMP .no
.heads
	; carved forest heads rotate when hit: scenery
	LDA.w !fl_ts
	CMP.w #1
	BNE .cut
	CPX.w #$4000
	BCS .cut
	LDA.w !fl_d_meta
	CMP.w #171
	BEQ .head
	CMP.w #172
	BNE .cut
.head
	LDA.w !fl_d_code
	CMP.w #$00C1
	BNE .cut
	LDA.w #343
	SEC
	SBC.w !fl_d_tile
	CMP.w !fl_d_rep
	BNE .cut
	JMP .yes
.cut
	; native cuttable objects: follow the replacement chain
	LDA.w !fl_d_code
	AND.w #$00F0
	CMP.w #$00C0
	BNE .header
	LDA.w !fl_d_code
	AND.w #$000F
	CMP.w #12
	BCS .header
	JMP fl_cut_chain
.header
	LDA.w !fl_map
	CMP.w #512
	BCC .gaps
	JMP .no                      ; header() null
.gaps
	; castle chasms and Gaia lava/air (layer 0)
	CPX.w #$4000
	BCS .fort
	LDA.w !fl_mflags
	AND.w #!FLM_CASTLE|!FLM_CAVE
	BEQ .fort
	JSR fl_pred_gap
	BCC .fort
	LDA.w #fl_pred_gap&$FFFF
	STA.w !fl_t3
	LDA.w #16
	JSR fl_between_shores
	BCC +
	JMP .yes
+	JSR fl_fetch
.fort
	CPX.w #$4000
	BCS .balcony
	LDA.w !fl_mflags
	AND.w #!FLM_FORT
	BEQ .balcony
	JSR fl_pred_fort
	BCC .balcony
	LDA.w #fl_pred_fort&$FFFF
	STA.w !fl_t3
	LDA.w #16
	JSR fl_between_shores
	BCC +
	JMP .yes
+	JSR fl_fetch
.balcony
	LDA.w !fl_ts
	CMP.w #9
	BNE .palace
	CPX.w #$4000
	BCC .palace
	LDA.w !fl_d_code
	BNE .palace
	LDA.w !fl_d_meta
	CMP.w #222
	BNE .palace
	JMP fl_balcony
.palace
	LDA.w !fl_ts
	CMP.w #23
	BNE .bank
	CPX.w #$4000
	BCS .bank
	LDA.w !fl_d_code
	BNE .bank
	PHY
	LDY.w #fl_set_palacegap&$FFFF
	LDA.w !fl_d_meta
	JSR fl_inset
	PLY
	BCC .bank
	JMP fl_palace_gap
.bank
	LDA.w !fl_p_bank
	BEQ .code0
	JSR fl_pred_bank
	BCC .code0
	LDA.w #fl_pred_banklily&$FFFF
	STA.w !fl_t3
	LDA.w !fl_ts
	CMP.w #2
	BNE .long
	LDA.w !fl_map
	CMP.w #25
	BEQ .long
	LDA.w #5
	BRA .span
.long
	LDA.w #16
.span
	JSR fl_between_shores
	BCC +
	JMP .yes
+	JSR fl_fetch
.code0
	LDA.w !fl_d_code
	BEQ +
	JMP .no
+	; village flowers and shrubs: paired BG2 art of the solid grass cell
	LDA.w !fl_ts
	BNE .tree
	CPX.w #$4000
	BCS .tree
	LDA.w !fl_d_tile
	CMP.w #187
	BEQ .flower
	CMP.w #188
	BNE .tree
.flower
	LDY.w #fl_set_villageflower&$FFFF
	JSR fl_foreground_in
	BCC .small
	JMP .yes
.tree
	LDA.w !fl_ts
	CMP.w #22
	BNE .small
	CPX.w #$4000
	BCS .small
	LDA.w !fl_d_tile
	CMP.w #185
	BNE .small
	LDY.w #fl_set_treeflower&$FFFF
	JSR fl_foreground_in
	BCC .small
	JMP .yes
.small
	LDA.w !fl_p_small
	BEQ .scenery
	JSR fl_pred_small
	BCC .scenery
	LDA.w #fl_pred_small&$FFFF
	STA.w !fl_t3
	LDA.w #8
	JSR fl_between_shores
	BCS .yes
	JSR fl_fetch
.scenery
	LDY.w !fl_p_scen
	LDA.w !fl_d_meta
	JMP fl_inset
.yes
	SEC
	RTS
.no
	CLC
	RTS

; Layer-1 artwork paired with a layer-0 placeholder (the tile at the same
; cell + the layer-1 offset) in the set at Y. X = idx (layer 0).
fl_foreground_in:
	PHX
	TXA
	ORA.w #$4000
	TAX
	LDA.l $7F0000,X
	AND.w #$00FF
	CLC
	ADC.w !fl_ofs1
	PLX
	JMP fl_inset

; Sandship deck rail (maps 98/99): original planks between the two decks
; with clear air above and below. Fetched descriptor = t (kept).
fl_ship_rail:
	LDA.w !fl_mflags
	AND.w #!FLM_SHIP
	BEQ .no
	CPX.w #$4000
	BCS .no
	JSR fl_ty
	CMP.w #9
	BNE .no
	JSR fl_tx
	CMP.w #24
	BCC .no
	CMP.w #28
	BCS .no
	LDA.w !fl_d_tile
	CMP.w #122
	BNE .no
	LDA.w !fl_d_code
	BNE .no
	PHX
	LDA.w #$FF00
	JSR fl_step
	BCS .nopull
	JSR fl_clear_air
	BCC .nopull
	LDA $01,S
	TAX
	LDA.w #$0100
	JSR fl_step
	BCS .nopull
	JSR fl_clear_air
	BCC .nopull
	PLX
	JSR fl_fetch
	SEC
	RTS
.nopull
	PLX
	JSR fl_fetch
.no
	CLC
	RTS

; Cut chain: follow replacement descriptors (at most 16, no repeats) until
; a code that is not $Cx: a plain walkable cell means scenery. X = idx.
fl_cut_chain:
	STZ.w !fl_t2                 ; tiles seen
.loop
	LDA.w !fl_t2
	BEQ .first
	PHX
	TAX
.seen
	DEX
	LDA.l !fl_rc_queue,X
	AND.w #$00FF
	CMP.w !fl_d_tile
	BNE +
	JMP .nopull
+	TXA
	BNE .seen
	PLX
.first
	PHX
	LDX.w !fl_t2
	SEP #$20
	LDA.w !fl_d_tile
	STA.l !fl_rc_queue,X
	REP #$20
	PLX
	INC.w !fl_t2
	LDA.w !fl_d_code
	AND.w #$00F0
	CMP.w #$00C0
	BEQ .cont
	LDA.w !fl_d_code
	BNE .no
	LDA.w !fl_d_flags
	AND.w #$000F
	CMP.w #$0003
	BEQ .no
	LDA.w !fl_d_flags
	AND.w #$0008
	BNE .no
	SEC
	RTS
.cont
	LDA.w !fl_d_code
	AND.w #$000F
	CMP.w #12
	BCS .no
	LDA.w !fl_t2
	CMP.w #16
	BCS .no
	; descriptor of the replacement tile on the same layer
	LDA.w !fl_d_rep
	STA.w !fl_d_tile
	PHX
	ASL
	ASL
	CPX.w #$4000
	BCC +
	ORA.w #$0400
+	TAX
	LDA.l $7FB800,X
	PHA
	AND.w #$00FF
	STA.w !fl_d_flags
	PLA
	XBA
	AND.w #$00FF
	STA.w !fl_d_beh
	LDA.l $7FB802,X
	PHA
	AND.w #$00FF
	STA.w !fl_d_code
	PLA
	XBA
	AND.w #$00FF
	STA.w !fl_d_rep
	PLX
	BRL .loop
.nopull
	PLX
.no
	CLC
	RTS

; Ruins balcony lip (tileset 9, layer 1, metatile 222): floors of heights
; 1 and 2 on opposite sides within 3 cells. Returns its result.
fl_balcony:
	PHX                          ; [t]
	LDA.w #$00FF
	JSR fl_balcony_side
	PHA                          ; [a][t]
	LDA $03,S
	TAX
	LDA.w #$0001
	JSR fl_balcony_side
	JSR fl_balcony_pair
	PLA
	BCS .yes
	LDA $01,S
	TAX
	LDA.w #$FF00
	JSR fl_balcony_side
	PHA
	LDA $03,S
	TAX
	LDA.w #$0100
	JSR fl_balcony_side
	JSR fl_balcony_pair
	PLA
	BCS .yes
	PLX
	CLC
	RTS
.yes
	PLX
	SEC
	RTS
; A = b; a at $03,S (caller's pushed value): a,b in {1,2}, a != b
fl_balcony_pair:
	BEQ .no
	CMP.w #$0003
	BCS .no
	CMP $03,S
	BEQ .no
	LDA $03,S
	BEQ .no
	CMP.w #$0003
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS
; one side: A = delta. Returns A = the floor's flags & 3, or 0.
fl_balcony_side:
	PHA                          ; [delta]
	LDY.w #3
.walk
	LDA $01,S
	JSR fl_step
	BCS .zero
	JSR fl_fetch
	LDA.w !fl_d_beh
	AND.w #$0010
	BNE .zero
	PHY
	JSR fl_clear_air_kept
	PLY
	BCS .floor
	LDA.w !fl_d_code
	BNE .zero
	LDA.w !fl_d_meta
	CMP.w #222
	BNE .zero
	DEY
	BNE .walk
.zero
	PLA
	LDA.w #$0000
	RTS
.floor
	PLA
	LDA.w !fl_d_flags
	AND.w #$0003
	RTS

; clear(next, 0, true) keeping the fetched descriptor (X = idx).
fl_clear_air_kept:
	JSR fl_save_d
	JSR fl_clear_air
	LDA.w #$0000
	ROL
	STA.w !fl_t4
	JSR fl_load_d
	LDA.w !fl_t4
	LSR
	RTS

; Palace platform gap (tileset 23, layer 0, palaceGaps metatile): real
; floor on both sides within 16 along an axis; never the Water Palace stair
; pockets. Returns its result.
fl_palace_gap:
	LDA.w !fl_mflags
	AND.w #!FLM_POCKETS
	BEQ .ok
	JSR fl_ty
	CMP.w #59
	BCC .ok
	CMP.w #66
	BCS .ok
	JSR fl_tx
	CMP.w #12
	BCC .ok
	CMP.w #22
	BCS .ok
	CMP.w #16
	BCC .no
	CMP.w #18
	BCC .ok
.no
	CLC
	RTS
.ok
	PHX
	LDA.w #$00FF
	JSR fl_palace_side
	BCC .v
	LDA $01,S
	TAX
	LDA.w #$0001
	JSR fl_palace_side
	BCS .yes
.v
	LDA $01,S
	TAX
	LDA.w #$FF00
	JSR fl_palace_side
	BCC .nopull
	LDA $01,S
	TAX
	LDA.w #$0100
	JSR fl_palace_side
	BCS .yes
.nopull
	PLX
	CLC
	RTS
.yes
	PLX
	SEC
	RTS
fl_palace_side:
	PHA                          ; [delta]
	LDY.w #16
.walk
	LDA $01,S
	JSR fl_step
	BCS .no
	JSR fl_fetch
	LDA.w !fl_d_beh
	AND.w #$0010
	BNE .no
	PHY
	JSR fl_clear_air_kept
	PLY
	BCS .yes
	LDA.w !fl_d_code
	BNE .no
	LDA.w !fl_d_tile
	CLC
	ADC.w !fl_ofs0
	PHY
	LDY.w #fl_set_palacegap&$FFFF
	JSR fl_inset
	PLY
	BCC .no
	DEY
	BNE .walk
.no
	PLA
	CLC
	RTS
.yes
	PLA
	SEC
	RTS

; ---------------------------------------------------------------------------
; betweenShores(accepts, span): A = span, fl_t3 = predicate routine (on the
; fetched descriptor, X = idx). Carry = real shores on both sides along an
; axis with only accepted cells between.
fl_between_shores:
	PHA                          ; [span]
	LDA.w !fl_t3
	PHA                          ; [pred][span]
	PHX                          ; [t][pred][span]
	LDA.w #$00FF
	JSR fl_shore_dir
	BCC .vert
	LDA $01,S
	TAX
	LDA.w #$0001
	JSR fl_shore_dir
	BCS .yes
.vert
	LDA $01,S
	TAX
	LDA.w #$FF00
	JSR fl_shore_dir
	BCC .no
	LDA $01,S
	TAX
	LDA.w #$0100
	JSR fl_shore_dir
	BCS .yes
.no
	PLX
	PLA
	PLA
	CLC
	RTS
.yes
	PLX
	PLA
	PLA
	SEC
	RTS
; A = delta. Stack: [ret 1-2][t 3-4][pred 5-6][span 7-8].
fl_shore_dir:
	PHA                          ; [delta 1-2][ret][t 5-6][pred 7-8][span 9-10]
	LDA $09,S
	TAY
.walk
	LDA $01,S
	JSR fl_step
	BCS .no
	JSR fl_fetch
	LDA.w !fl_d_beh
	AND.w #$0090
	BNE .no
	LDA.w !fl_d_flags
	AND.w #$0008
	BNE .no
	PHY
	JSR fl_blocked
	PLY
	BCS .no
	; realShore(next) = clear(next, 0, true) && !(blank ground metatile 0)
	PHY
	JSR fl_clear_air
	PLY
	BCC .accept
	JSR fl_fetch
	LDA.w !fl_tsf
	AND.w #!TSF_BLANKGROUND
	BEQ .shore
	LDA.w !fl_d_meta
	BNE .shore
.accept
	JSR fl_fetch
	PHY
	PEA.w .ret-1
	LDA $0B,S                    ; pred (ret, Y and delta above it)
	DEC
	PHA
	RTS                          ; call the predicate
.ret
	PLY
	BCC .no
	DEY
	BNE .walk
.no
	PLA
	CLC
	RTS
.shore
	PLA
	SEC
	RTS

; Predicates on the fetched descriptor (X = idx). Carry = accepted.
; gap(d): castle chasm / Gaia lava (raw tile in the set, or cave code 10-17)
fl_pred_gap:
	LDA.w !fl_d_flags
	AND.w #$0008
	BNE .no
	LDA.w !fl_d_beh
	AND.w #$0090
	BNE .no
	LDA.w !fl_d_code
	BNE .code
	PHY
	LDY.w #fl_set_castlegap&$FFFF
	LDA.w !fl_ts
	CMP.w #15
	BEQ +
	LDY.w #fl_set_cavegap&$FFFF
+	LDA.w !fl_d_tile
	JSR fl_inset
	PLY
	RTS
.code
	LDA.w !fl_ts
	CMP.w #10
	BNE .no
	LDA.w !fl_d_code
	CMP.w #$0010
	BCC .no
	CMP.w #$0018
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS
; Fortress gaps: code 0, plain, metatile (layer-0 offset) in the set
fl_pred_fort:
	LDA.w !fl_d_code
	BNE .no
	LDA.w !fl_d_flags
	AND.w #$0008
	BNE .no
	LDA.w !fl_d_beh
	AND.w #$0090
	BNE .no
	PHY
	LDY.w #fl_set_fortgap&$FFFF
	LDA.w !fl_d_tile
	CLC
	ADC.w !fl_ofs0
	JSR fl_inset
	PLY
	RTS
.no
	CLC
	RTS
; bank(d): plain, and bank art (code 0) or a height-transition code 10-17
fl_pred_bank:
	LDA.w !fl_d_flags
	AND.w #$0008
	BNE .no
	LDA.w !fl_d_beh
	AND.w #$0090
	BNE .no
	LDA.w !fl_d_code
	BNE .code
	PHY
	LDY.w !fl_p_bank
	LDA.w !fl_d_meta
	JSR fl_inset
	PLY
	RTS
.code
	CMP.w #$0010
	BCC .no
	CMP.w #$0018
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS
; bank(d) || lily(d)
fl_pred_banklily:
	JSR fl_pred_bank
	BCS .yes
	LDA.w !fl_d_code
	BNE .no
	LDA.w !fl_d_flags
	AND.w #$0008
	BNE .no
	LDA.w !fl_d_beh
	AND.w #$0090
	BNE .no
	PHY
	LDY.w !fl_p_lily
	LDA.w !fl_d_meta
	JSR fl_inset
	PLY
	RTS
.no
	CLC
.yes
	RTS
; small(d): plain low furnishing of this tileset
fl_pred_small:
	LDA.w !fl_d_code
	BNE .no
	LDA.w !fl_d_flags
	AND.w #$0008
	BNE .no
	LDA.w !fl_d_beh
	AND.w #$0090
	BNE .no
	PHY
	LDY.w !fl_p_small
	LDA.w !fl_d_meta
	JSR fl_inset
	PLY
	RTS
.no
	CLC
	RTS

; ---------------------------------------------------------------------------
; Footprint queries in pixels: fl_q_x / fl_q_y / fl_q_l / fl_q_t.

; footprint(x, y, l, air): carry = every sample tile of the 12x8 box is
; clear (in the air, a low obstacle also passes). A = 1 air, 0 ground.
; The nine samples (x-6/x/x+6, y-4/y/y+4) cover exactly the tiles of
; columns (x-6)/16..(x+6)/16 and rows (y-4)/16..(y+4)/16. Inside the hero
; grid (fl_grid_reset) the tiles' verdicts are computed once and the test is
; a mask; elsewhere every tile is classified (tile cache).
fl_footprint:
	PHA                          ; [mode]
	LDA.l !fl_g_stale
	BEQ .anchored
	CMP.w #2
	BEQ .lazy
	LDA.w #$0000
	STA.l !fl_g_stale
	JSR fl_grid_reset
	BRA .anchored
.lazy
	; on foot (fl_onfoot): the grid moves only when the footprint leaves it
	LDA.w #$0000
	STA.l !fl_g_stale
	LDA $01,S
	JSR fl_fp_cover
	BCC .relazy
	LDA.l !fl_g_inner
	BNE .covered                 ; fl_t4 = its cells
	BRA .anchored
.relazy
	JSR fl_grid_reset
.anchored
	; a grid well inside the map: a footprint it covers is in bounds
	LDA.l !fl_g_inner
	BEQ .bounds
	LDA $01,S
	JSR fl_fp_cover
	BCC .bounds
.covered
	LDA $01,S
	BEQ .answer
	LDA.w !fl_open_air
	BEQ .answer
	PLA                          ; Sandship: flight passes over every wall
	SEC
	RTS
.answer
	PLA
	JSR fl_grid_answer           ; A = 1 pass, 0 fail
	LSR
	RTS
.bounds
	JSR fl_fp_bounds
	BCS +
	PLA
	CLC
	RTS
+	LDA $01,S
	BEQ .grid
	LDA.w !fl_open_air
	BEQ .grid
	PLA                          ; Sandship: flight passes over every wall
	SEC
	RTS
.grid
	LDA $01,S
	JSR fl_fp_cover
	BCS .answer
	JSR fl_fp_rect
	PLA
	JMP fl_fp_tiles

; fl_fp_cover: A = mode. Carry set when the footprint at fl_q_x/y lies
; inside the hero grid (its layer, and for ground its terrain), with fl_t4 =
; its cells. Columns follow from x - (grid left) - 6 in 0-35 and rows from
; y - (grid top) - 4 in 0-39 (pattern tables), without the tile rectangle.
fl_fp_cover:
	TAY                          ; mode
	LDA.w !fl_q_l
	CMP.l !fl_g_l
	BNE .no
	TYA
	BNE +
	LDA.w !fl_q_t
	CMP.l !fl_g_t
	BNE .no
+	LDA.l !fl_g_tx0
	ASL : ASL : ASL : ASL
	EOR.w #$FFFF
	SEC
	ADC.w !fl_q_x
	SEC
	SBC.w #6
	CMP.w #36
	BCS .no
	TAX
	LDA.l fl_grid_colpat,X
	AND.w #$00FF
	STA.w !fl_t4
	LDA.l !fl_g_ty0
	ASL : ASL : ASL : ASL
	EOR.w #$FFFF
	SEC
	ADC.w !fl_q_y
	SEC
	SBC.w #4
	CMP.w #40
	BCS .no
	TAX
	LDA.l fl_grid_rowpat,X
	AND.w #$00FF
	ASL : ASL : ASL
	ORA.w !fl_t4
	ASL
	TAX
	LDA.l fl_grid_masks,X
	STA.w !fl_t4
	SEC
	RTS
.no
	CLC
	RTS

; Hero grid: the 3x3 tiles around Goku's position at the start of a
; movement step or of the frame logic cover every footprint the step can
; test (positions within 8 px). fl_grid_reset sets the origin; verdicts are
; filled lazily by fl_grid_test.
fl_grid_reset:
	LDA.w #$0000
	STA.l !fl_g_stale
	LDA $E002
	SEC
	SBC.w #14
	BPL +
	LDA.w #$0000
+	LSR : LSR : LSR : LSR
	STA.w !fl_t0
	LDA $E004
	SEC
	SBC.w #12
	BPL +
	LDA.w #$0000
+	LSR : LSR : LSR : LSR
	STA.w !fl_t1
	LDA $E00B
	AND.w #$0080
	BEQ +
	LDA.w #$0001
+	STA.w !fl_t2
	LDA $E00B
	AND.w #$0003
	STA.w !fl_t3
	; the same grid as before: keep the verdicts of unchanged cells
	LDA.w !fl_t0
	CMP.l !fl_g_tx0
	BNE .new
	LDA.w !fl_t1
	CMP.l !fl_g_ty0
	BNE .new
	LDA.w !fl_t2
	CMP.l !fl_g_l
	BNE .new
	LDA.w !fl_t3
	CMP.l !fl_g_t
	BNE .new
	RTS                          ; same grid: cells are checked when tested
.new
	; one cell over on the same layer and terrain: the cells both grids
	; share keep their verdicts (the old grid's tiles are checked first)
	LDA.w !fl_t2
	CMP.l !fl_g_l
	BNE .fresh
	LDA.w !fl_t3
	CMP.l !fl_g_t
	BNE .fresh
	LDA.w !fl_t0
	SEC
	SBC.l !fl_g_tx0
	INC
	CMP.w #3
	BCS .fresh
	STA.w !fl_t5                 ; dx + 1
	LDA.w !fl_t1
	SEC
	SBC.l !fl_g_ty0
	INC
	CMP.w #3
	BCS .fresh
	STA.w !fl_t4
	ASL
	ADC.w !fl_t4
	ADC.w !fl_t5
	STA.w !fl_t5                 ; (dy + 1) * 3 + dx + 1
	JSR fl_grid_check            ; (keeps fl_t5)
	LDA.w !fl_t5
	ASL
	TAX
	LDA.l fl_grid_shift_n,X
	STA.w !fl_t6                 ; new cell (r, c) = old (r + dy, c + dx): bit b <- b + 3dy + dx
	LDA.l fl_grid_shift_m,X
	STA.w !fl_t7                 ; cells the old grid also covered
	LDA.l !fl_g_akn
	JSR fl_grid_shift1
	STA.l !fl_g_akn
	LDA.l !fl_g_aok
	JSR fl_grid_shift1
	STA.l !fl_g_aok
	LDA.l !fl_g_gkn
	JSR fl_grid_shift1
	STA.l !fl_g_gkn
	LDA.l !fl_g_gok
	JSR fl_grid_shift1
	STA.l !fl_g_gok
	BRA .origin
.fresh
	LDA.w #$0000
	STA.l !fl_g_akn
	STA.l !fl_g_aok
	STA.l !fl_g_gkn
	STA.l !fl_g_gok
.origin
	LDA.w !fl_t0
	STA.l !fl_g_tx0
	LDA.w !fl_t1
	STA.l !fl_g_ty0
	LDA.w !fl_t2
	STA.l !fl_g_l
	LDA.w !fl_t3
	STA.l !fl_g_t
	; first cell's index (layer, ty0, tx0)
	LDA.w !fl_t1
	XBA
	LSR
	ORA.w !fl_t0
	LDY.w !fl_t2
	BEQ +
	ORA.w #$4000
+	STA.l !fl_g_base
	; inside: tx0 >= 1, ty0 >= 1, tx0*16 + 49 <= map width, ty0*16 + 51 <=
	; map height (then every covered footprint is 8 px inside the edges)
	LDA.w #$0000
	STA.l !fl_g_inner
	LDA.w !fl_t0
	BEQ +
	ASL : ASL : ASL : ASL
	CLC
	ADC.w #49
	CMP.w !fl_wpx
	BEQ ++
	BCS +
++	LDA.w !fl_t1
	BEQ +
	ASL : ASL : ASL : ASL
	CLC
	ADC.w #51
	CMP.w !fl_hpx
	BEQ ++
	BCS +
++	LDA.w #$0001
	STA.l !fl_g_inner
+	LDA.w #$0001
	STA.l !fl_g_chk              ; the snapshot below is this phase's check
	; fall through: record the nine tiles
; fl_grid_snap: the tile ids under the nine cells as they are now (verdicts
; are kept only while their cell's tile is the recorded one).
fl_grid_snap:
	LDA.l !fl_g_base
	TAX
	LDA.l $7F0000,X
	STA.l !fl_g_tiles
	LDA.l $7F0001,X
	STA.l !fl_g_tiles+1
	LDA.l $7F0080,X
	STA.l !fl_g_tiles+3
	LDA.l $7F0081,X
	STA.l !fl_g_tiles+4
	LDA.l $7F0100,X
	STA.l !fl_g_tiles+6
	LDA.l $7F0101,X
	STA.l !fl_g_tiles+7
	RTS
; fl_grid_check: the nine tiles still match the record (the usual case:
; nothing to do); otherwise known cells whose tile changed lose their
; verdicts and the record is refreshed. Preserves fl_t4/fl_t5.
fl_grid_check:
	LDA.l !fl_g_chk
	BEQ +
	RTS                          ; checked in this phase already
+	LDA.w #$0001
	STA.l !fl_g_chk
	LDA.l !fl_g_base
	TAX
	LDA.l $7F0000,X
	CMP.l !fl_g_tiles
	BNE .slow
	LDA.l $7F0001,X
	CMP.l !fl_g_tiles+1
	BNE .slow
	LDA.l $7F0080,X
	CMP.l !fl_g_tiles+3
	BNE .slow
	LDA.l $7F0081,X
	CMP.l !fl_g_tiles+4
	BNE .slow
	LDA.l $7F0100,X
	CMP.l !fl_g_tiles+6
	BNE .slow
	LDA.l $7F0101,X
	CMP.l !fl_g_tiles+7
	BNE .slow
	RTS
.slow
	LDA.w !fl_t4
	PHA
	LDA.w #$01FF
	STA.w !fl_t4
	JSR fl_grid_verify
	JSR fl_grid_snap
	PLA
	STA.w !fl_t4
	RTS
; Cells of mask A (known in some mode) whose tile changed since their
; verdict lose it. Uses fl_t6/fl_t7.
fl_grid_verify:
	AND.l !fl_g_akn
	STA.w !fl_t6
	LDA.l !fl_g_gkn
	AND.w !fl_t4
	ORA.w !fl_t6
	BNE +
	RTS
+	STA.w !fl_t6
	LDY.w #0
.cell
	LSR.w !fl_t6
	BCC .next
	PHY
	TYA
	ASL
	TAX
	LDA.l fl_grid_offs,X
	CLC
	ADC.l !fl_g_base
	TAX
	LDA.l $7F0000,X
	PLY
	PHY
	TYX
	SEP #$20
	CMP.l !fl_g_tiles,X
	REP #$20
	BEQ .same
	TYA
	ASL
	TAX
	LDA.l fl_bitmask16,X
	EOR.w #$FFFF
	PHA
	AND.l !fl_g_akn
	STA.l !fl_g_akn
	LDA $01,S
	AND.l !fl_g_aok
	STA.l !fl_g_aok
	LDA $01,S
	AND.l !fl_g_gkn
	STA.l !fl_g_gkn
	PLA
	AND.l !fl_g_gok
	STA.l !fl_g_gok
.same
	PLY
.next
	LDA.w !fl_t6
	BEQ .done
	INY
	BRA .cell
.done
	RTS
fl_grid_offs:
	dw 0, 1, 2, 128, 129, 130, 256, 257, 258
; A grid one cell over (index (dy + 1) * 3 + dx + 1): the bit offset 3dy + dx
; of each new cell's old one, and the new cells the old grid covered.
fl_grid_shift_n:
	dw -4, -3, -2, -1, 0, 1, 2, 3, 4
fl_grid_shift_m:
	dw $01B0, $01F8, $00D8, $01B6, $01FF, $00DB, $0036, $003F, $001B
; A = a verdict mask, shifted by fl_t6 bits (right when positive) and kept
; to the cells fl_t7.
fl_grid_shift1:
	LDY.w !fl_t6
	BEQ .keep
	BMI .left
-	LSR
	DEY
	BNE -
	BRA .keep
.left
-	ASL
	INY
	BNE -
.keep
	AND.w !fl_t7
	RTS
; X = idx of grid cell Y (0-8) on the grid's layer.
fl_grid_idx:
	TYA
	ASL
	TAX
	LDA.l fl_grid_offs,X
	CLC
	ADC.l !fl_g_base
	TAX
	RTS
fl_grid_off:
	LDA.w #$FFFF
	STA.l !fl_g_l
	RTS

; fl_grid_test: rectangle fl_t0..fl_t3, A = mode. Carry clear: not covered
; (layer, terrain or position outside the grid). Carry set: A = 1 pass,
; 0 fail.
fl_grid_test:
	PHA                          ; [mode]
	LDA.l !fl_g_stale
	BEQ .start
	LDA.w #$0000
	STA.l !fl_g_stale
	LDA.w !fl_t0 : PHA
	LDA.w !fl_t1 : PHA
	LDA.w !fl_t2 : PHA
	LDA.w !fl_t3 : PHA
	JSR fl_grid_reset
	PLA : STA.w !fl_t3
	PLA : STA.w !fl_t2
	PLA : STA.w !fl_t1
	PLA : STA.w !fl_t0
	BRA .start
.out
	PLA
	CLC
	RTS
.start
	LDA.w !fl_q_l
	CMP.l !fl_g_l
	BNE .out
	LDA $01,S
	BNE +
	LDA.w !fl_q_t
	CMP.l !fl_g_t
	BNE .out
+	; relative columns / rows, each 0..2
	LDA.w !fl_t0
	SEC
	SBC.l !fl_g_tx0
	CMP.w #3
	BCS .out
	STA.w !fl_t4                 ; c0
	LDA.w !fl_t1
	SEC
	SBC.l !fl_g_tx0
	CMP.w #3
	BCS .out
	STA.w !fl_t5                 ; c1
	LDA.w !fl_t2
	SEC
	SBC.l !fl_g_ty0
	CMP.w #3
	BCS .out
	STA.w !fl_t6                 ; r0
	LDA.w !fl_t3
	SEC
	SBC.l !fl_g_ty0
	CMP.w #3
	BCS .out
	STA.w !fl_t7                 ; r1
	; mask of the rectangle: columns c0..c1 in rows r0..r1 (bit r*3+c);
	; a sweep's union can span all three columns or rows
	LDA.w !fl_t4
	ASL
	ADC.w !fl_t4
	ADC.w !fl_t5                 ; c0*3 + c1
	TAX
	LDA.l fl_grid_sel,X
	AND.w #$00FF
	STA.w !fl_t4                 ; columns c0..c1
	LDA.w !fl_t6
	ASL
	ADC.w !fl_t6
	ADC.w !fl_t7                 ; r0*3 + r1
	TAX
	LDA.l fl_grid_sel,X
	AND.w #$00FF
	ASL : ASL : ASL
	ORA.w !fl_t4
	ASL
	TAX
	LDA.l fl_grid_masks,X
	STA.w !fl_t4                 ; the rectangle's cells
	PLA
	JSR fl_grid_answer
	SEC
	RTS
; The grid's verdict on the cells fl_t4 for mode A (1 air, 0 ground), with
; unknown cells evaluated first. A = 1 when every cell passes, else 0.
fl_grid_answer:
	PHA                          ; [mode]
	; known cells whose tile changed lose their verdicts
	JSR fl_grid_check
	; cells still unknown in this mode
	LDA $01,S
	BEQ .gneed
	LDA.l !fl_g_akn
	BRA .need
.gneed
	LDA.l !fl_g_gkn
.need
	EOR.w #$FFFF
	AND.w !fl_t4
	BEQ .test
	STA.l !fl_g_need
	LDA.w !fl_t4 : PHA           ; [mask][mode]
	LDA $03,S
	JSR fl_grid_fill
	PLA
	STA.w !fl_t4
.test
	LDA $01,S
	BEQ .gtest
	LDA.l !fl_g_aok
	BRA .res
.gtest
	LDA.l !fl_g_gok
.res
	EOR.w #$FFFF
	AND.w !fl_t4
	BEQ .pass
	PLA
	LDA.w #$0000
	RTS
.pass
	PLA
	LDA.w #$0001
	RTS
; Columns of a footprint whose centre is x = grid left + 6 + i (cols
; (x-6)>>4 .. (x+6)>>4 relative to the grid), and rows for y = grid top + 4 + i.
fl_grid_colpat:
	db $01, $01, $01, $01, $03, $03, $03, $03, $03, $03, $03, $03
	db $03, $03, $03, $03, $02, $02, $02, $02, $06, $06, $06, $06
	db $06, $06, $06, $06, $06, $06, $06, $06, $04, $04, $04, $04
fl_grid_rowpat:
	db $01, $01, $01, $01, $01, $01, $01, $01, $03, $03, $03, $03
	db $03, $03, $03, $03, $02, $02, $02, $02, $02, $02, $02, $02
	db $06, $06, $06, $06, $06, $06, $06, $06, $04, $04, $04, $04
	db $04, $04, $04, $04
; 3-bit patterns of c0..c1 (index c0*3 + c1, c0 <= c1)
fl_grid_sel:
	db $01, $03, $07, $00, $02, $06, $00, $00, $04
; cells of rows R (3 bits) x columns C (3 bits): index R*8 + C
fl_grid_masks:
	dw $0000, $0000, $0000, $0000, $0000, $0000, $0000, $0000
	dw $0000, $0001, $0002, $0003, $0004, $0005, $0006, $0007
	dw $0000, $0008, $0010, $0018, $0020, $0028, $0030, $0038
	dw $0000, $0009, $0012, $001B, $0024, $002D, $0036, $003F
	dw $0000, $0040, $0080, $00C0, $0100, $0140, $0180, $01C0
	dw $0000, $0041, $0082, $00C3, $0104, $0145, $0186, $01C7
	dw $0000, $0048, $0090, $00D8, $0120, $0168, $01B0, $01F8
	dw $0000, $0049, $0092, $00DB, $0124, $016D, $01B6, $01FF

; Evaluate the grid cells in fl_g_need for mode A (1 air, 0 ground).
fl_grid_fill:
	PHA                          ; [mode]
	LDY.w #0                     ; bit number
.bit
	LDA.l !fl_g_need
	BNE +
	PLA
	RTS
+	LSR
	STA.l !fl_g_need
	BCS +
	JMP .next
+	PHY
	JSR fl_grid_idx
	LDA.l $7F0000,X
	PHX
	TYX
	SEP #$20
	STA.l !fl_g_tiles,X          ; the verdict is about this tile
	REP #$20
	PLX
	LDA $03,S                    ; mode
	BEQ .ground
	JSR fl_class
	BIT.w #!FLC_CLRAIR
	BNE .apass
	BIT.w #!FLC_LOWV
	BEQ .alow
	BIT.w #!FLC_LOW
	BNE .apass
	BRA .afail
.alow
	JSR fl_low
	BCS .apass
.afail
	PLY
	TYA
	ASL
	TAX
	LDA.l fl_bitmask16,X
	ORA.l !fl_g_akn
	STA.l !fl_g_akn
	BRA .next
.apass
	PLY
	TYA
	ASL
	TAX
	LDA.l fl_bitmask16,X
	PHA
	ORA.l !fl_g_akn
	STA.l !fl_g_akn
	PLA
	ORA.l !fl_g_aok
	STA.l !fl_g_aok
	BRA .next
.ground
	JSR fl_class
	BIT.w #!FLC_LANDB
	BEQ .gfail
	BIT.w #!FLC_H1|!FLC_H2
	BEQ .gpass
	AND.w #!FLC_H1
	BEQ .h2
	LDA.w !fl_q_t
	CMP.w #$0002
	BEQ .gfail
	BRA .gpass
.h2
	LDA.w !fl_q_t
	CMP.w #$0001
	BEQ .gfail
.gpass
	PLY
	TYA
	ASL
	TAX
	LDA.l fl_bitmask16,X
	PHA
	ORA.l !fl_g_gkn
	STA.l !fl_g_gkn
	PLA
	ORA.l !fl_g_gok
	STA.l !fl_g_gok
	BRA .next
.gfail
	PLY
	TYA
	ASL
	TAX
	LDA.l fl_bitmask16,X
	ORA.l !fl_g_gkn
	STA.l !fl_g_gkn
.next
	INY
	JMP .bit
fl_grid_row:
	db 0, 0, 0, 1, 1, 1, 2, 2, 2
fl_grid_col:
	db 0, 1, 2, 0, 1, 2, 0, 1, 2
fl_bitmask16:
	dw $0001, $0002, $0004, $0008, $0010, $0020, $0040, $0080, $0100

; Tile rectangle of the footprint at fl_q_x/y: fl_t0..fl_t3 = column
; first/last, row first/last.
fl_fp_rect:
	LDA.w !fl_q_x
	SEC
	SBC.w #6
	LSR : LSR : LSR : LSR
	STA.w !fl_t0
	LDA.w !fl_q_x
	CLC
	ADC.w #6
	LSR : LSR : LSR : LSR
	STA.w !fl_t1
	LDA.w !fl_q_y
	SEC
	SBC.w #4
	LSR : LSR : LSR : LSR
	STA.w !fl_t2
	LDA.w !fl_q_y
	CLC
	ADC.w #4
	LSR : LSR : LSR : LSR
	STA.w !fl_t3
	RTS

; Every tile of the rectangle fl_t0..fl_t3 passes (A = mode). Carry.
fl_fp_tiles:
	PHA                          ; [mode 7-8]
	LDA.w !fl_t1 : PHA           ; [col1 5-6]
	LDA.w !fl_t3 : PHA           ; [row1 3-4]
	LDA.w !fl_t0 : PHA           ; [col0 1-2]
	LDA.w !fl_t2                 ; row
.row
	PHA                          ; [row 1-2][col0 3-4][row1 5-6][col1 7-8][mode 9-10]
	XBA
	LSR
	LDY.w !fl_q_l
	BEQ +
	ORA.w #$4000
+	ORA $03,S
	TAX                          ; first tile of the row
.col
	JSR fl_class
	TAY
	LDA $09,S
	BEQ .ground
	TYA
	BIT.w #!FLC_CLRAIR
	BNE .pass
	BIT.w #!FLC_LOWV
	BEQ .lowcalc
	BIT.w #!FLC_LOW
	BNE .pass
	BRA .fail
.lowcalc
	JSR fl_low
	BCS .pass
	BRA .fail
.ground
	TYA
	BIT.w #!FLC_LANDB
	BEQ .fail
	BIT.w #!FLC_H1|!FLC_H2
	BEQ .pass
	; heights 1 and 2 exclude each other: h ^ terrain == 3
	AND.w #!FLC_H1
	BEQ .h2
	LDA.w !fl_q_t
	CMP.w #$0002
	BEQ .fail
	BRA .pass
.h2
	LDA.w !fl_q_t
	CMP.w #$0001
	BEQ .fail
.pass
	TXA
	AND.w #$007F
	CMP $07,S
	BEQ .rowdone
	INX
	BRA .col
.rowdone
	PLA
	CMP $03,S
	BEQ .done
	INC
	BRA .row
.done
	PLA
	PLA
	PLA
	PLA
	SEC
	RTS
.fail
	PLA
	PLA
	PLA
	PLA
	PLA
	CLC
	RTS

; width >= 16, height >= 16, 8 <= x <= width - 8, 8 <= y <= height - 8
fl_fp_bounds:
	LDA.w !fl_wpx
	CMP.w #16
	BCC .no
	LDA.w !fl_hpx
	CMP.w #16
	BCC .no
	LDA.w !fl_q_x
	BMI .no
	CMP.w #8
	BCC .no
	CLC
	ADC.w #8
	CMP.w !fl_wpx
	BEQ +
	BCS .no
+	LDA.w !fl_q_y
	BMI .no
	CMP.w #8
	BCC .no
	CLC
	ADC.w #8
	CMP.w !fl_hpx
	BEQ +
	BCS .no
+	SEC
	RTS
.no
	CLC
	RTS

; canFly(x, y, l): carry (fl_q_x/y/l).
fl_can_fly:
	JSR fl_beast_arena
	BCC .normal
	; the Beast's fixed Mode 7 arena: X 184-408, Y 292-432
	LDA.w !fl_q_x
	CMP.w #184
	BCC .no
	CMP.w #409
	BCS .no
	LDA.w !fl_q_y
	CMP.w #292
	BCC .no
	CMP.w #433
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS
.normal
	LDA.w #$0001
	JMP fl_footprint

; canLand(x, y, l, terrain): carry (fl_q_x/y/l/t). Floor holes owned by
; other modules (Frieza's deck, the Sandship) come from
; !FLIGHT_MISSING_FLOOR when a module defines it (JSL; carry = hole under
; the footprint at fl_q_x/y/l).
fl_can_land:
	JSR fl_hole_q                ; supported(): no hole under the footprint
	BCC +
	CLC
	RTS
+	LDA.w #$0000
	JMP fl_footprint

; supported() failed: carry = a floor-hole provider has a hole under the
; footprint at fl_q_x/y/l. The browser's providers have holes only on the
; maps flagged !FLM_HOLES (the generator reads them from their sources), so
; flight asks only there, and wherever the map's context is not loaded yet.
fl_hole_q:
	LDA $DC
	CMP.w !fl_map
	BNE +
	LDA.w !fl_mflags
	AND.w #!FLM_HOLES
	BNE +
	CLC
	RTS
+	JMP fl_bind_hole

; canFloat = canFly && !canLand
fl_can_float:
	JSR fl_can_fly
	BCC .no
	JSR fl_can_land
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS

; beastArena(): map 253 shown in Mode 7 ($29 & 7 = 7). Carry.
fl_beast_arena:
	LDA.w !fl_mflags
	AND.w #!FLM_BEAST
	BEQ .no
	LDA $29
	AND.w #$0007
	CMP.w #$0007
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; sweep(x, y, dx, dy): canFly at every step s = 1..max(|dx|,|dy|) of
; (x + round(dx*s/n), y + round(dy*s/n)). fl_sw_x/y/dx/dy, layer fl_q_l.
fl_sweep:
	; the same sweep again in this movement step (D778 after D651)
	LDA.w !fl_sw_x
	CMP.l !fl_sw_last
	BNE .fresh
	LDA.w !fl_sw_y
	CMP.l !fl_sw_last+2
	BNE .fresh
	LDA.w !fl_sw_dx
	CMP.l !fl_sw_last+4
	BNE .fresh
	LDA.w !fl_sw_dy
	CMP.l !fl_sw_last+6
	BNE .fresh
	LDA.w !fl_q_l
	CMP.l !fl_sw_last+8
	BNE .fresh
	LDA.l !fl_sw_last+10
	LSR
	RTS
.fresh
	JSR fl_sweep_eval
	LDA.w #$0000
	ROL
	STA.l !fl_sw_last+10
	LDA.w !fl_sw_x
	STA.l !fl_sw_last
	LDA.w !fl_sw_y
	STA.l !fl_sw_last+2
	LDA.w !fl_sw_dx
	STA.l !fl_sw_last+4
	LDA.w !fl_sw_dy
	STA.l !fl_sw_last+6
	LDA.w !fl_q_l
	STA.l !fl_sw_last+8
	LDA.l !fl_sw_last+10
	LSR
	RTS
; Forget the last sweep (a new movement step or map).
fl_sweep_forget:
	LDA.w #$FFFF
	STA.l !fl_sw_last+8
	RTS

fl_sweep_eval:
	LDA.w !fl_sw_dx
	BPL +
	EOR.w #$FFFF
	INC
+	STA.w !fl_sw_n
	LDA.w !fl_sw_dy
	BPL +
	EOR.w #$FFFF
	INC
+	CMP.w !fl_sw_n
	BCC +
	STA.w !fl_sw_n
+	LDA.w !fl_sw_n
	BNE +
	SEC                          ; no step: nothing to test
	RTS
+	JSR fl_beast_arena
	BCC +
	JMP fl_sweep_steps           ; the arena: bounds per step
+	; straight (one axis still) or diagonal (|dx| = |dy|) sweeps move one
	; pixel per step on their moving axes
	LDA.w !fl_sw_dx
	BEQ .straight
	LDA.w !fl_sw_dy
	BEQ .straight
	LDA.w !fl_sw_dx
	BPL +
	EOR.w #$FFFF
	INC
+	CMP.w !fl_sw_n
	BNE +
	LDA.w !fl_sw_dy
	BPL ++
	EOR.w #$FFFF
	INC
++	CMP.w !fl_sw_n
	BNE +
	JMP fl_sweep_diag
+	JMP fl_sweep_steps
.straight
	; The bounds box holds at every step iff at the first and the last
	; (positions are monotonic); the tiles of all steps form one rectangle.
	JSR fl_sweep_ends
	BCS +
	RTS
+	LDA.w !fl_open_air
	BEQ +
	SEC
	RTS
+	; union rectangle of the footprints from step 1 to step n
	LDA.w !fl_t4                 ; min x
	SEC
	SBC.w #6
	LSR : LSR : LSR : LSR
	STA.w !fl_t0
	LDA.w !fl_t5                 ; max x
	CLC
	ADC.w #6
	LSR : LSR : LSR : LSR
	STA.w !fl_t1
	LDA.w !fl_t6                 ; min y
	SEC
	SBC.w #4
	LSR : LSR : LSR : LSR
	STA.w !fl_t2
	LDA.w !fl_t7                 ; max y
	CLC
	ADC.w #4
	LSR : LSR : LSR : LSR
	STA.w !fl_t3
	LDA.w #$0001
	JSR fl_grid_test
	BCC +
	LSR
	RTS
+	LDA.w #$0001
	JMP fl_fp_tiles

; Bounds at the first and last step; fl_t4/t5 = min/max x and fl_t6/t7 =
; min/max y of the steps. Carry = both in bounds.
fl_sweep_ends:
	LDA.w #$0001
	STA.w !fl_sw_s
	LDA.w !fl_sw_dx
	JSR fl_sweep_round
	CLC
	ADC.w !fl_sw_x
	STA.w !fl_q_x
	STA.w !fl_t4
	STA.w !fl_t5
	LDA.w !fl_sw_dy
	JSR fl_sweep_round
	CLC
	ADC.w !fl_sw_y
	STA.w !fl_q_y
	STA.w !fl_t6
	STA.w !fl_t7
	JSR fl_fp_bounds
	BCC .no
	LDA.w !fl_sw_x
	CLC
	ADC.w !fl_sw_dx
	STA.w !fl_q_x
	LDA.w !fl_sw_y
	CLC
	ADC.w !fl_sw_dy
	STA.w !fl_q_y
	JSR fl_fp_bounds
	BCC .no
	; order the extremes
	LDA.w !fl_q_x
	CMP.w !fl_t4
	BPL +
	STA.w !fl_t4
	BRA ++
+	STA.w !fl_t5
++	LDA.w !fl_q_y
	CMP.w !fl_t6
	BPL +
	STA.w !fl_t6
	BRA ++
+	STA.w !fl_t7
++	SEC
	RTS
.no
	CLC
	RTS

; Diagonal: one pixel per axis per step; test a step's tiles only when its
; rectangle differs from the previous step's.
fl_sweep_diag:
	JSR fl_sweep_ends
	BCS +
	RTS
+	LDA.w !fl_open_air
	BEQ +
	SEC
	RTS
+	LDA.w #$FFFF
	STA.l !fl_sw_rect
	LDA.w #$0001
	STA.w !fl_sw_s
.step
	LDA.w !fl_sw_dx
	BPL +
	LDA.w !fl_sw_x
	SEC
	SBC.w !fl_sw_s
	BRA ++
+	LDA.w !fl_sw_x
	CLC
	ADC.w !fl_sw_s
++	STA.w !fl_q_x
	LDA.w !fl_sw_dy
	BPL +
	LDA.w !fl_sw_y
	SEC
	SBC.w !fl_sw_s
	BRA ++
+	LDA.w !fl_sw_y
	CLC
	ADC.w !fl_sw_s
++	STA.w !fl_q_y
	JSR fl_sweep_rect_test
	BCC .no
	LDA.w !fl_sw_s
	CMP.w !fl_sw_n
	BCS .yes
	INC.w !fl_sw_s
	BRA .step
.yes
	SEC
	RTS
.no
	CLC
	RTS

; Footprint tiles at fl_q_x/y unless the rectangle equals the last tested
; one (fl_sw_rect). Carry = pass.
fl_sweep_rect_test:
	JSR fl_fp_rect
	LDA.w !fl_t0
	CMP.l !fl_sw_rect
	BNE .test
	LDA.w !fl_t1
	CMP.l !fl_sw_rect+2
	BNE .test
	LDA.w !fl_t2
	CMP.l !fl_sw_rect+4
	BNE .test
	LDA.w !fl_t3
	CMP.l !fl_sw_rect+6
	BNE .test
	SEC
	RTS
.test
	LDA.w !fl_t0
	STA.l !fl_sw_rect
	LDA.w !fl_t1
	STA.l !fl_sw_rect+2
	LDA.w !fl_t2
	STA.l !fl_sw_rect+4
	LDA.w !fl_t3
	STA.l !fl_sw_rect+6
	LDA.w #$0001
	JSR fl_grid_test
	BCC +
	LSR
	RTS
+	LDA.w #$0001
	JMP fl_fp_tiles

; General sweep: every step (rounded positions), bounds each time.
fl_sweep_steps:
	LDA.w #$FFFF
	STA.l !fl_sw_rect
	LDA.w #$0001
	STA.w !fl_sw_s
.step
	LDA.w !fl_sw_dx
	JSR fl_sweep_round
	CLC
	ADC.w !fl_sw_x
	STA.w !fl_q_x
	LDA.w !fl_sw_dy
	JSR fl_sweep_round
	CLC
	ADC.w !fl_sw_y
	STA.w !fl_q_y
	JSR fl_beast_arena
	BCC .normal
	JSR fl_can_fly               ; the arena: bounds only
	BCC .no
	BRA .next
.normal
	JSR fl_fp_bounds
	BCC .no
	LDA.w !fl_open_air
	BNE .next
	JSR fl_sweep_rect_test
	BCC .no
.next
	LDA.w !fl_sw_s
	CMP.w !fl_sw_n
	BCS .yes
	INC.w !fl_sw_s
	BRA .step
.yes
	SEC
	RTS
.no
	CLC
	RTS
; Math.round(A * s / n) = floor((2*A*s + n) / (2*n)), signed; |A| <= 16,
; 1 <= s <= n <= 16. Uses fl_t1/fl_t2.
fl_sweep_round:
	CMP.w #$0000
	BEQ .zero
	CMP.w !fl_sw_n
	BNE +
	LDA.w !fl_sw_s               ; d == n: s
	RTS
+	PHA
	CLC
	ADC.w !fl_sw_n
	BNE +
	PLA
	LDA.w !fl_sw_s               ; d == -n: -s
	EOR.w #$FFFF
	INC
	RTS
+	PLA
	STA.w !fl_t1
	LDA.w #$0000
	LDY.w !fl_sw_s
-	CLC
	ADC.w !fl_t1
	DEY
	BNE -
	ASL
	CLC
	ADC.w !fl_sw_n
	STA.w !fl_t1                 ; 2*A*s + n
	LDA.w !fl_sw_n
	ASL
	STA.w !fl_t2                 ; 2n
	LDA.w !fl_t1
	BMI .neg
	LDY.w #$0000
-	CMP.w !fl_t2
	BCC +
	SEC
	SBC.w !fl_t2
	INY
	BRA -
+	TYA
	RTS
.neg
	EOR.w #$FFFF
	INC
	CLC
	ADC.w !fl_t2
	DEC                          ; -num + 2n - 1
	LDY.w #$0000
-	CMP.w !fl_t2
	BCC +
	SEC
	SBC.w !fl_t2
	INY
	BRA -
+	TYA
	EOR.w #$FFFF
	INC
	RTS
.zero
	RTS
