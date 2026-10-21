; Destroy module: destructible scenery, gates, switches, orbs and dungeon
; demolition through the cartridge's own cut-map pipeline.
; Port of engine/native-plants.js, dungeon-geometry.js / dungeon-demolition.js,
; native-barriers.js, breakable-doors.js, native-orbs.js and palace-braziers.js.
; See docs/agents/snes-port/destroy.md for structures, catalogue and API.
;
; Native pipeline (C1:D293..D429 is the retail sword cut):
;   7F:0000 / 7F:4000   128x128 metatile grids, BG1 / BG2 collision layers
;   7F:B800 / 7F:BC00   4-byte descriptors per metatile: flags, behaviour,
;                       code (Cx cuttable, Fx hit event), replacement
;   $82/$83             row redraw request (1 = BG1, $80 = BG2) / screen Y,
;                       consumed by C0:C7C3 when the scroll queue $2E is idle
;   $95, $118/$119      sound request (bit 7 busy) and its pan
; Edits are applied at C0:C7C3 (hijacked), one row group per frame, exactly
; where the browser mod applies them.

; ---------------------------------------------------------------------------
; WRAM (!RAM_DESTROY, $80 bytes). Addresses are bank-$7E offsets for
; absolute addressing with DB = $7E.
; Assembler notes: asar picks immediate widths from the literal, so every
; 16-bit immediate carries .w; WRAM variables use .w (absolute, DB = $7E);
; computed addresses use #= so no expression depends on operator order.
!DST #= (!RAM_DESTROY)&$FFFF
!FRAME #= (!core_frame)&$FFFF
!CORE_EVREQ = !core_event_req   ; core's pending event request (battery RAM: long addressing)
!d_map      = !DST+$00  ; map the transient state belongs to
!d_qn       = !DST+$02  ; queue slots used (live + dead)
!d_qlive    = !DST+$04  ; live queue entries
!d_cn       = !DST+$06  ; cleared (smashed object) entries
!d_last     = !DST+$08  ; core frame of the last applied row
!d_bnext    = !DST+$0A  ; next breach record (ring of !DQ_BREACHES)
!d_vstart   = !DST+$0C  ; scanline destroy_field_frame began on (dst_budget)
!d_flags    = !DST+$0E  ; destroy_hit result: bit0 queued, bit1 barrier, bit2 full
; current attack (destroy_hit arguments, filled by the caller)
!arg_x      = !DST+$10  ; origin x (map pixels)
!arg_y      = !DST+$12  ; origin y
!arg_dir    = !DST+$14  ; 0 down, 1 right, 2 left, 3 up (Goku's facing index)
!arg_len    = !DST+$16  ; reach (pixels, <= 640)
!arg_half   = !DST+$18  ; half width (pixels, <= 80)
!arg_taper  = !DST+$1A  ; taper length (full beam 44) or 0
!arg_kind   = !DST+$1C  ; 0 punch/kick, 1 ki blast, 2 beam, 3 full SSJ beam
!arg_str    = !DST+$1E  ; strength 0..256 (charge / cap); punches 256
!arg_id     = !DST+$20  ; attack serial: 0 one-shot; beams keep theirs
!arg_layer  = !DST+$22  ; collision layer 0/1, $FFFF = Goku's
; incremental beam scan
!d_aid      = !DST+$24  ; attack id of the scanned region
!d_alen     = !DST+$26  ; scanned length
!d_ahalf    = !DST+$28  ; scanned half width
!d_abar     = !DST+$2A  ; id of the beam that struck a barrier/switch (one per beam)
; current map context (dst_sync_map)
!m_hdr      = !DST+$2C  ; native map header flags (tileset | $40/$80 metatile banks)
!m_ts       = !DST+$2E  ; tileset
!m_bits     = !DST+$30  ; destroy_map_info bits
!m_grp      = !DST+$32  ; dungeon family + 1 when demolition applies
!m_init     = !DST+$34  ; $D5A1 once the SRAM state was initialised
; outputs for other modules (read, then clear / compare)
!out_react  = !DST+$36  ; reaction id (dist/snes/gen/destroy/reactions.json), 0 none
!out_rmap   = !DST+$38  ; map of that reaction
!out_rows   = !DST+$3A  ; applied (non-replay) rows, wraps
!out_demo   = !DST+$3C  ; core frame of the last demolition row
!out_sfx    = !DST+$3E  ; impact sound requests, wraps
; scratch (call-local)
!d_s        = !DST+$40  ; 64 bytes: $40..$7F
assert !d_s+$40 <= !DST+$80, "destroy WRAM overflow"

; Call-local scratch words (overlapping uses are kept within one routine).
!d_cx       = !d_s+$00
!d_cy       = !d_s+$02
!d_cl       = !d_s+$04
!d_coff     = !d_s+$06
!d_ctile    = !d_s+$08
!d_cflags   = !d_s+$0A  ; flags | behaviour<<8
!d_ccode    = !d_s+$0C  ; code
!d_crep     = !d_s+$0E  ; descriptor replacement
!d_cmeta    = !d_s+$10
!d_pol      = !d_s+$12  ; policy 0 plants, 1 objects, 2 beam, 3 super
!d_brep     = !d_s+$14  ; breakable(): replacement
!d_bkind    = !d_s+$16  ; breakable(): sound kind
!d_bbraz    = !d_s+$18  ; breakable(): brazier
!d_t0       = !d_s+$1A
!d_t1       = !d_s+$1C
!d_t2       = !d_s+$1E
!d_t3       = !d_s+$20
!d_t4       = !d_s+$22
!d_t5       = !d_s+$24
!d_t6       = !d_s+$26
; scan loop (dst_scan_attack)
!s_o        = !d_s+$28  ; outer cell index along the attack
!s_oend     = !d_s+$2A
!s_ostep    = !d_s+$2C
!s_along    = !d_s+$2E
!s_w        = !d_s+$30
!s_lo       = !d_s+$32
!s_hi       = !d_s+$34
!s_plo      = !d_s+$36  ; previously scanned inner range
!s_phi      = !d_s+$38
!s_i        = !d_s+$3A
!s_c        = !d_s+$3C  ; origin across coordinate
!s_a        = !d_s+$3E  ; origin along coordinate
; row application (dst_apply_row) reuses the scan words
!fx_n       = !s_o      ; tiles changed in this row
!fx_sound   = !s_oend   ; sound kind of the first audible edit, $FFFF none
!fx_demo    = !s_ostep  ; demolition edits in the row
!fx_braz    = !s_along  ; brazier edits in the row
!fx_xmin    = !s_w
!fx_xmax    = !s_lo
!fx_end     = !s_hi     ; queue end offset
!fx_x       = !s_plo    ; current entry offset
!fx_key     = !s_phi    ; layer/row bits of the group
!fx_sy      = !s_i      ; screen y of the row
!fx_sx      = !s_c      ; cell x of the audible edit
!fx_replay  = !s_a      ; replay flag of the group
; Temporaries: dst_chain (inside dst_breakable) uses t0..t3; queue helpers
; and leaf bit tests use t5/t6; dst_entry_current keeps the entry meta in t4.

; ---------------------------------------------------------------------------
; Volatile SRAM work area (!SRAM_WORK_DESTROY, $800 bytes).
!DQ          = !SRAM_WORK_DESTROY        ; queue: 88 x 8
!DQ_MAX      = 88
!DWF         = !SRAM_WORK_DESTROY+$2C0   ; settled runs: 16 x 4 (key.w, lo, hi)
!DWF_MAX     = 16
!DC          = !SRAM_WORK_DESTROY+$300   ; cleared: 32 x 8
!DC_MAX      = 32
!DK          = !SRAM_WORK_DESTROY+$400   ; tile classes: 2 layers x 256 tiles x 4 bits ($F unknown)
; tile class bits (live descriptors, map context; position-independent
; except on the two maps with protected zones):
!TK_CAND = 1    ; cut-code object, hit tile, walk-on trigger, scenery or brazier
!TK_ORD  = 2    ; ordinary (code 0, no trigger-wall bit, no special behaviour)
!TK_END  = 4    ; floor that is not dungeon air (span end, floor sample)
!TK_WALL = 8    ; ordinary solid that is neither decoration nor air
!DB          = !SRAM_WORK_DESTROY+$500   ; breaches: 16 x 24 (4 witnesses x 6)
!DQ_BREACHES = 16
!DW          = !SRAM_WORK_DESTROY+$680   ; demolition planner job ($30, below)
!NTO         = !SRAM_WORK_DESTROY+$6B0   ; barrier search result (14 bytes)
!PL          = !SRAM_WORK_DESTROY+$6C0   ; suspended breach plan (32 bytes)
!DH          = !SRAM_WORK_DESTROY+$6E0   ; destroy_hit scratch (32 bytes)
!DSTATE      = !SRAM_WORK_DESTROY+$700   ; $40 bytes of slower state below
!DS          = !SRAM_WORK_DESTROY+$740   ; planner scratch $B8 (kept across frames)
; effect record for an effects module (the last applied non-replay row that
; asks for a burst); poll !FX_SEQ, which increments per record
!FX_SEQ      = !SRAM_WORK_DESTROY+$7F8   ; word, wraps
!FX_KIND     = !SRAM_WORK_DESTROY+$7FA   ; 1 rubble (demolition row), 2 brazier burst
!FX_X        = !SRAM_WORK_DESTROY+$7FC   ; map pixels: centre of the row / brazier
!FX_Y        = !SRAM_WORK_DESTROY+$7FE
; destroy_hit scratch
!BC_LO    = !DH+$00   ; band inner range beyond the taper zone
!BC_HI    = !DH+$02
!BC_PLO   = !DH+$04   ; previously scanned inner range (lo > hi: none)
!BC_PHI   = !DH+$06
!BC_FLAT  = !DH+$08   ; first row beyond the taper zone ($FFFF: not reached)
!BC_PREV  = !DH+$0A   ; last outer cell within the previous length
!BZ_CX    = !DH+$0C   ; brazier expansion: scanned cell and tile, origin
!BZ_CY    = !DH+$0E
!BZ_TILE  = !DH+$10
!BZ_OX    = !DH+$12
!BZ_OY    = !DH+$14
!NT_SRC   = !DH+$16   ; barrier search: source event of a cell
!NT_EV    = !DH+$18
!NT_DOOR  = !DH+$1A
!DK_NEW   = !DH+$1C   ; dst_cell_class: the class being stored
!DK_HI    = !DH+$1E   ; (shifted to the high nibble)
; suspended breach plan (dst_plan_*)
!pl_stage = !PL+$00   ; 0 none, 1 floor sampling in progress, 2 sampled (finish)
!pl_off   = !PL+$02   ; wall cell and attack direction
!pl_dir   = !PL+$04
!pl_a     = !PL+$06   ; shores
!pl_b     = !PL+$08
!pl_n     = !PL+$0A   ; run cells (!WR_LIST)
!pl_k     = !PL+$0C   ; breach record
!pl_ox    = !PL+$0E   ; floor sample: origin, quality, best, queue, shore info
!pl_oy    = !PL+$10
!pl_q     = !PL+$12
!pl_best  = !PL+$14
!pl_head  = !PL+$16
!pl_tail  = !PL+$18
!pl_h     = !PL+$1A
!pl_back  = !PL+$1C
!pl_quota = !PL+$1E   ; sampler nodes left before the frame budget applies
!pl_wait  = !NTO+$0E  ; frames a suspended plan had no time (after the 14 bytes)
!DQW #= (!DQ)&$FFFF                      ; bank-$33 absolute views (DB = $33)
!DCW #= (!DC)&$FFFF
!DKW #= (!DK)&$FFFF
; demolition planner job (demolish.asm)
!pj_state = !DW+$00   ; 0 none, 1 walking, 2 walked (waits for growth)
!pj_id    = !DW+$02   ; attack id (0: one-shot)
!pj_x     = !DW+$04
!pj_y     = !DW+$06
!pj_dir   = !DW+$08
!pj_len   = !DW+$0A
!pj_half  = !DW+$0C
!pj_taper = !DW+$0E
!pj_layer = !DW+$10
!pj_o     = !DW+$12   ; cursor: outer cell
!pj_oend  = !DW+$14
!pj_step  = !DW+$16
!pj_i     = !DW+$18   ; cursor: inner cell
!pj_hi    = !DW+$1A   ; last inner cell of this outer cell
!pj_left  = !DW+$1C   ; cells left this frame
!pj_alive = !DW+$1E   ; core frame of the job's last destroy_hit call
!pj_dirty = !DW+$20   ; demolition rows applied since the walk began
!pj_plans = !DW+$22   ; complete plans this frame
!pj_side  = !DW+$24   ; the band widened behind the cursor: walk again
!bb_id    = !DW+$26   ; barrier search extent of the current beam (0: none)
!bb_len   = !DW+$28
!bb_half  = !DW+$2A
!dk_d0    = !DW+$2E   ; $D0 seen last frame (recompute after native events)
!DESTROY_PLAN_LINE = 160  ; the planner stops at this scanline (frame budget)
; barrier pending (native-barriers.js pending)
!bp_state   = !DSTATE+$00  ; 0 none, 1 waiting 26 frames, 2 event requested
!bp_event   = !DSTATE+$02
!bp_frame   = !DSTATE+$04
!bp_rec     = !DSTATE+$06  ; ki-barrier record offset, $FFFF = native tile
!bp_tile    = !DSTATE+$08  ; native tile: map offset
!bp_tileid  = !DSTATE+$0A  ; native tile: original tile id
!bp_snap    = !DSTATE+$0C  ; CF[flag] when requested (repeatUntilOpen)
!bp_sum1    = !DSTATE+$0E  ; checksum of $CF00-$CFFF except $CF0A
!bp_sum2    = !DSTATE+$10
!bp_door    = !DSTATE+$12  ; breakable door index or $FFFF
!bp_react   = !DSTATE+$14  ; reaction id
!bp_map     = !DSTATE+$16
; orb pending (native-orbs.js queued)
!orb_base   = !DSTATE+$18  ; actor base or 0
!orb_event  = !DSTATE+$1A
!orb_spell  = !DSTATE+$1C
!orb_map    = !DSTATE+$1E
; debug / test trigger (Lua pokes the CPU bus at these SRAM addresses)
!dbg_cmd    = !DSTATE+$20  ; 1 hit (arg_*), 2 run event dbg_arg, 3 orb hit dbg_arg
!dbg_arg    = !DSTATE+$22
!dbg_res    = !DSTATE+$24  ; result of the last command
!dbg_n      = !DSTATE+$26  ; commands processed
!dbg_ev     = !DSTATE+$28  ; last event dispatched by this module
!dbg_evn    = !DSTATE+$2A  ; events dispatched
!dw_frun    = !DSTATE+$2E  ; failed-run ring cursor
!dbg_dry    = !DSTATE+$2C  ; nonzero: dst_breach plans without queueing
!dbg_script = !DSTATE+$30  ; 8 bytes: event script for command 4
; demolition context (dst_dm_context)
!dm_w1      = !DSTATE+$38  ; map width - 1 (interior bound)
!dm_h1      = !DSTATE+$3A  ; map height - 1
!dm_ext0    = !DSTATE+$3C  ; BG1 placed extents: x1 | y1<<8
!dm_ext1    = !DSTATE+$3E  ; BG2 placed extents
; queue entry: +0 offset.w ($FFFF dead) +2 tile +3 replacement (demolition)
;              +4 flags +5 behaviour +6 meta +7 frame
; meta: bits0-1 policy, bit2 replay, bit3 demolition, bits4-7 breach (demolition)
;       or bit4 brazier (objects)
; cleared entry: +0 offset.w +2 tile +3 replacement +4 flags +5 behaviour
;                +6 code +7 meta

; ---------------------------------------------------------------------------
; Persistent state (!PERSIST_DESTROY, $80 bytes of SRAM, saved per slot).
!P_DOORS     = !PERSIST_DESTROY+$00      ; bit n: breakable door n broken
!P_TREE      = !PERSIST_DESTROY+$01      ; bit0: Mana Tree cloud barrier broken

; Sandship runtime (sandship.asm, engine/sandship.js createSandship). Saved
; with the GAME FILE like the browser's sandship snapshot (native-mod-save).
!SS          = !PERSIST_DESTROY+$10
!ss_flags    = !SS+$00   ; word: !SSF_* below
!ss_breaks   = !SS+$02   ; word: bulkheads broken (breakLimit blows the ship up)
!ss_door     = !SS+$04   ; word: door for the flight door slot (7A), 0 none (flight answers SANDSHIP_DOOR itself when present)
!ss_lastbrk  = !SS+$06   ; word: core frame of the last counted break
!ss_wage     = !SS+$08   ; word: wreck age (frames)
!ss_cut      = !SS+$0A   ; word: white-out sequence: 0 none, 1 breakout, 2 crash
!ss_cage     = !SS+$0C   ; word: its age
!ss_cmap     = !SS+$0E   ; word: the room it reloads (breakout) / the deck (crash)
!ss_ctx      = !SS+$10   ; word: Goku's tile x when the wave broke out
!ss_cty      = !SS+$12   ; word: tile y
!ss_clayer   = !SS+$14   ; word: layer 0/1
!ss_cafter   = !SS+$16   ; word: frames since the reloaded room came up
!ss_cbits    = !SS+$18   ; word: !SSC_* below
!ss_flash    = !SS+$1A   ; word: white 0-256
!ss_bmap     = !SS+$1C   ; word: map of the breach ($FFFF none)
!ss_bx       = !SS+$1E   ; word: breach centre (map pixels)
!ss_by       = !SS+$20
!ss_breach_reach = !SS+$22 ; word: distance to the wall the wave tore through
!ss_box      = !SS+$24   ; word: beam origin (the scorch starts there)
!ss_boy      = !SS+$26
!ss_gear     = !SS+$28   ; 3 x 4 bytes: equipped slots ($1E0-$1E3) the capture stowed
!ss_gbits    = !SS+$34   ; word: bit i member i has stowed gear, bit 4+i seen held
; Volatile words kept here, outside the set-piece scene area, because the
; vblank callback and the hooks must know whether !SSW belongs to the
; Sandship (cleared at load, new game and the title).
!ss_vis      = !SS+$36   ; word: !SS_VIS_MAGIC | bits: staged palette / breach tables ready
!ss_work     = !SS+$38   ; word: !SS_WORK_MAGIC while !SSW holds the arc's work
!ss_own      = !SS+$3A   ; word: HDMA channels 2/3 programmed by the breach
!ss_end      = !SS+$3C
; A beam's band growth left for later calls (dst_scan_clamp): its arguments,
; continued by destroy_field_frame (dst_hit_continue). Volatile: cleared at
; load, new game and map changes.
!HP          = !PERSIST_DESTROY+$4C
!hp_id       = !HP+$00   ; word: beam id with cells left to scan, 0 none
!hp_worked   = !HP+$02   ; word: hit work ran in this field update; cleared by the frame service
!hp_x        = !HP+$04   ; words: its arguments (as !arg_x .. !arg_layer)
!hp_y        = !HP+$06
!hp_dir      = !HP+$08
!hp_len      = !HP+$0A
!hp_half     = !HP+$0C
!hp_taper    = !HP+$0E
!hp_kind     = !HP+$10
!hp_str      = !HP+$12
!hp_layer    = !HP+$14
!hp_left     = !HP+$16   ; word: bit 0 its band scan, bit 1 its barrier search unfinished
; growth steps of the current call (dst_step_next)
!cl_rl       = !HP+$18   ; word: requested length
!cl_rh       = !HP+$1A   ; word: requested half width
!cl_l0       = !HP+$1C   ; word: covered length
!cl_h0       = !HP+$1E   ; word: covered half width
!cl_tl       = !HP+$20   ; word: next step's length
!cl_th       = !HP+$22   ; word: next step's half width
!cl_t        = !HP+$24   ; word: scratch
!cl_t0       = !HP+$26   ; word: scanline the call began on
!hp_turn     = !HP+$28   ; word: 0 terrain first, 1 barriers first next call
!hp_end      = !HP+$2A
assert !hp_end <= !PERSIST_DESTROY+$80, "destroy persistent block overflow"
; New cells per growth step, and the shared terrain/barrier scan budget.
; A beam takes at least one step, alternating which part goes first so
; neither can starve when the other's first step uses the whole budget.
!DESTROY_STEP_CELLS = 8
!DESTROY_HIT_SPAN   = 12
!DESTROY_HIT_LINE   = 160  ; only start a beam scan before this end-of-frame line
!SS_VIS_PAL    = $0001
!SS_VIS_BREACH = $0002
!SS_VIS_MAGIC  = $A500
!SS_WORK_MAGIC = $5157
!SSF_WRECK   = $0001     ; s.wreck
!SSF_WPLAN   = $0002     ; s.wreck.planned
!SSF_CRASH   = $0004     ; s.ending === 'crash'
!SSF_BOSS    = $0008
!SSF_DECKDONE = $0010
!SSF_DECKHINT = $0020
!SSF_ARMED   = $0040
!SSF_HINTED  = $0080
!SSF_ESCAPED = $0100
!SSC_REQ     = $0001     ; event requested
!SSC_DOOR    = $0002     ; the escape door was read with the override
!SSC_LOADED  = $0004     ; the reloaded room's objects loaded
!SSC_PLANNED = $0008     ; cut.planned (Sergo's plan)
!SSC_FRESH   = $0010     ; started inside this frame's destroy_hit: tick next frame
; Volatile Sandship work (CORE REQUEST: the tail of the set-piece scene area,
; free while the player is aboard: no scene runs on the ship maps).
!SSW         = !SRAM_WORK_SCENE+$1600    ; $A00 bytes ($32:7600-7FFF)
!ssw_lastmap = !SSW+$00  ; word: map of the previous field frame
!ssw_beam    = !SSW+$02  ; word: last beam id considered
; +$04-$0D free (flyThroughDoor and unstick are flight's: flight/sandship.asm)
!ssw_remark  = !SSW+$0E  ; word: last remark for a radio module (!SS_SAY_*)
!ssw_rseq    = !SSW+$10  ; word: increments per remark
!ssw_songs   = !SSW+$12  ; word: alarm songs sent (status)
!ssw_dismiss = !SSW+$24C ; word: increments when the Sandship lines are dismissed
!ssw_dbgactor = !SSW+$24E ; word: tests: actor slot for debug command 7
!ssw_lastsong = !SSW+$14 ; word: last song command sent
!ssw_loads   = !SSW+$16  ; word: wrecked room loads
!ssw_stage   = !SSW+$18  ; word: CF28 this frame
!ssw_dbgdoor = !SSW+$3A  ; word: tests: door id whose record !ssw_dbgrec replaces once ($FFFF none)
!ssw_dbgrec  = !SSW+$3C  ; 4 bytes: map/x/y/layer record (tests' enter(), like the browser spec's)
!ssw_tmp     = !SSW+$1A  ; 16 words scratch (+0..+31)
!ssw_list    = !SSW+$40  ; object list copy: header + records (max $1C0)
!SS_LIST_MAX = $1C0
!ssw_fp_x    = !SSW+$208 ; word: ss_floor_px scratch
!ssw_fp_o    = !SSW+$20A
!ssw_fe_min  = !SSW+$20C ; word: ss_far_enough scratch
!ssw_fe_sq   = !SSW+$20E
!ssw_ray_d   = !SSW+$210 ; word: ss_ray_point distance
!ssw_norig   = !SSW+$220 ; word: original records of the copied list
!ssw_mcount  = !SSW+$222 ; word: monsters appended
!ssw_mentry  = !SSW+$224 ; word: the room's ship directory entry
!ssw_rec     = !SSW+$226 ; word: per-record hook: record index
!ssw_slot    = !SSW+$228 ; word: its slot offset
!ssw_k       = !SSW+$22A ; word: monster k
!sp_n        = !SSW+$230 ; word: monster spots chosen ($FFFF: not yet for this load)
!sp_k        = !SSW+$232 ; word: spot list cursor
!sp_left     = !SSW+$234 ; word: spots left in the order
!sp_x        = !SSW+$236 ; word: spot being tried
!sp_y        = !SSW+$238
!sp_out      = !SSW+$23A
!sp_cx       = !SSW+$240 ; 3 words: chosen spots
!sp_cy       = !SSW+$246
; The wreck's look (wreck.asm): palette transforms staged for CGRAM and the
; breach's HDMA tables.
!ssw_pal_mode = !SSW+$260 ; word: 0 none, 1 alarm tint, 2 white-out
!ssw_pal_key  = !SSW+$262 ; word: transform key of the current mode
!ssw_pal_tl   = !SSW+$264 ; long: low-byte table of the transform
!ssw_pal_th   = !SSW+$268 ; long: high-byte table
!ssw_pal_cur  = !SSW+$26C ; word: next byte offset to transform
!ssw_pal_first = !SSW+$26E ; word: range start (bytes)
!ssw_pal_end  = !SSW+$270 ; word: range end (bytes)
!ssw_pal_done = !SSW+$272 ; word: bytes of the range made since the mode/room began (uploaded)
!ssw_pal_up   = !SSW+$274 ; word: NMI: bytes to upload (0 none)
!ssw_pal_upat = !SSW+$276 ; word: NMI: first byte offset to upload
!ssw_pal_src  = !SSW+$278 ; word: source buffer ($0600 or $BE00)
!ssw_br_on    = !SSW+$280 ; word: breach tables built for this frame
!ssw_br_own   = !SSW+$282 ; word: NMI: HDMA channels 2/3 programmed by us
; +$284 free
!ssw_br_t2    = !SSW+$286 ; word: channel 2 table (window) of the built frame
!ssw_br_t3    = !SSW+$288 ; word: channel 3 table (backdrop)
!ssw_br_p2    = !SSW+$28A ; word: table addresses programmed last NMI
!ssw_br_p3    = !SSW+$28C
!ssw_br_cx    = !SSW+$28E ; word: camera (BG1, map pixels)
!ssw_br_cy    = !SSW+$290
!ssw_br_sx    = !SSW+$292 ; word: breach centre on screen (signed)
!ssw_br_sy    = !SSW+$294
!ssw_br_y0    = !SSW+$296 ; word: first / last screen line of the outline
!ssw_br_y1    = !SSW+$298
!ssw_br_span  = !SSW+$29A ; word: span table offset of the outline variant
!ssw_br_bk    = !SSW+$29C ; word: the room's backdrop colour (transformed)
!ssw_br_sand  = !SSW+$29E ; word: sand pattern phase
!ssw_br_n     = !SSW+$2A0 ; word: scratch
!ssw_vtmp     = !SSW+$2A2 ; 8 words scratch (wreck.asm)
!ssw_br_lines = !SSW+$2B4 ; word: NMI statistics: breach frames programmed
!ssw_pal_ups  = !SSW+$2B6 ; word: palette uploads
!ssw_pal_left = !SSW+$2B8 ; word: bytes left in the current pass
!ssw_pal_room = !SSW+$2BA ; word: map the staged colours were made for
!ssw_pal_load = !SSW+$2BC ; word: and its room load (!ssw_loads)
!ssw_pal_cols = !SSW+$2BE ; word: statistics: colours transformed
!ssw_pal_wait = !SSW+$2C0 ; word: frames a pending pass had no time
!SS_PAL_STARVE = 8        ; a palette chunk anyway after this many frames without time
; the blasts (blast.asm)
!ssw_red     = !SSW+$980 ; word: frames since the last blast's red flash (24 and up: none)
!ssw_blast_q = !SSW+$982 ; word: the 150-frame period of the last blast ($FFFF none)
assert !ssw_blast_q+2 <= !SSW+$A00, "Sandship work overflow"
!SS_STAGE    = !SSW+$300 ; 512 bytes: transformed CGRAM
; The breach's HDMA (both channels indirect, tables and data in this bank)
!SS_HB       = !SSW+$500
!SS_BQ       = !SS_HB+$000 ; 128 x 4: the sand of the current white level (CGADD 0, 0, colour)
!SS_BQ_BK    = !SS_HB+$200 ; 4: the room's backdrop, the same way
!SS_BW_NONE  = !SS_HB+$204 ; 2: an empty window (WH0 = $FF, WH1 = 0)
!SS_BT2      = !SS_HB+$210 ; 2 x !SS_BT_SIZE: channel 2 tables
!SS_BT3      = !SS_HB+$238 ; 2 x !SS_BT_SIZE: channel 3 tables
!SS_BT_SIZE  = $14
!SS_BP       = !SS_HB+$260 ; 2 x !SS_BP_SIZE: window positions of the outline's rows
!SS_BP_SIZE  = $A0
; the wreck's clock (age modulo the browser's periods), kept in step with
; !ss_wage (wreck.asm ss_clock)
!ssw_ck_ok   = !SSW+$8A0 ; word: the counters hold !ssw_ck_age
!ssw_ck_age  = !SSW+$8A2
!ssw_ck_120  = !SSW+$8A4 ; age % 120 (the alarm)
!ssw_ck_q7   = !SSW+$8A6 ; age / 7, age % 7 (the flames)
!ssw_ck_r7   = !SSW+$8A8
!ssw_ck_r5   = !SSW+$8AA ; age % 5, (age / 5) % 3 (the embers)
!ssw_ck_e3   = !SSW+$8AC
!ssw_ck_m24  = !SSW+$8AE ; age % 24 (the embers' rise)
!ssw_ck_150  = !SSW+$8B0 ; age % 150, age / 150 (the blasts)
!ssw_ck_q150 = !SSW+$8B2
; the breach's outline and its cached window positions
!ssw_br_var  = !SSW+$8B4 ; word: outline variant (phases of the edge)
!ssw_br_top  = !SSW+$8B6 ; word: its first row (span index) and row count
!ssw_br_cnt  = !SSW+$8B8
!ssw_br_ys   = !SSW+$8BA ; word: screen line of the first row (signed)
!ssw_br_psx  = !SSW+$8BC ; word: screen x the cached positions were made for
!ssw_br_pvar = !SSW+$8BE ; word: and the variant
!ssw_br_cpb  = !SSW+$8C0 ; word: the buffer holding them (0 none)
!ssw_br_tpb  = !SSW+$8C2 ; word: the buffer this frame's tables use
!ssw_br_ppb  = !SSW+$8C4 ; word: NMI: the buffer of the programmed tables
!ssw_sq_lvl  = !SSW+$8C6 ; word: white level of the sand being copied ($FFFF none)
!ssw_sq_fill = !SSW+$8C8 ; word: bytes of it copied
!ssw_sq_ok   = !SSW+$8CA ; word: a full set of sand is there
!ssw_white_lvl = !SSW+$8CC ; word: this frame's white level (0 none)
!ssw_pal_kin = !SSW+$8F4 ; word: the tint's inputs the current key was made from
!ssw_br_vok  = !SSW+$8F6 ; word: !ssw_br_var/top/cnt hold the outline of the breach at
!ssw_br_vx   = !SSW+$8F8 ; words: ... this centre
!ssw_br_vy   = !SSW+$8FA
assert !ssw_br_vy+2 <= !SSW+$980, "Sandship work overflow"
assert !SS_BP+(2*!SS_BP_SIZE) <= !ssw_ck_ok, "Sandship HDMA area overflow"
; remarks published in !ssw_remark (the browser's radio lines)
!SS_SAY_WEAK = 1         ; GOKU: Too weak! I have to charge it all the way.
!SS_SAY_HINT = 2         ; GOKU: Hold L and Y to charge ... KA... ME... HA...
!SS_SAY_NOTYET = 3       ; GOKU: Not yet! My friends are still down below.
!SS_SAY_BROKE = 4        ; GOKU: Uh oh. I think I broke the whole ship.
!SS_SAY_STOP = 5         ; KING KAI: Goku, STOP! The ship can't take much more
!SS_SAY_DUNES = 6        ; KING KAI: Goku! North to Kakkara, then west to the Fire Palace.
!SS_SAY_DISMISS = 7      ; (not a remark: dismiss the Sandship lines, !ssw_dismiss)

!MAP_INFO_BRAZIER = $01
!MAP_INFO_SHIP    = $02
!MAP_INFO_COMPLEX = $04
!MAP_INFO_JOCH    = $08
!MAP_INFO_WATER   = $10
!MAP_INFO_BARRIER = $20
!MAP_INFO_DOOR    = $40
!MAP_INFO_SCENERY = $80

!POL_PLANTS  = 0
!POL_OBJECTS = 1
!POL_BEAM    = 2
!POL_SUPER   = 3
!QM_REPLAY   = $04
!QM_DEMO     = $08
!QM_BRAZIER  = $10

; Story queries answered here (story/hooks.asm, included last, picks them
; up). Story test builds (-DSTORY_TEST) answer every foreign query from their
; own table instead, so those definitions are kept.
if not(defined("STORY_QUERY_DOOR_GAIA_SHORTCUT"))
	!STORY_QUERY_DOOR_GAIA_SHORTCUT = destroy_query_door_gaia
endif
if not(defined("STORY_QUERY_DOOR_PANDORA_RUINS_EXIT"))
	!STORY_QUERY_DOOR_PANDORA_RUINS_EXIT = destroy_query_door_pandora
endif
if not(defined("STORY_QUERY_DOOR_NORTHTOWN_RUINS_SEAL"))
	!STORY_QUERY_DOOR_NORTHTOWN_RUINS_SEAL = destroy_query_door_northtown
endif
; The Sandship runtime (sandship.asm): its hooks and queries.
if not(defined("STORY_HOOK_SANDSHIP_CAPTURE"))
	!STORY_HOOK_SANDSHIP_CAPTURE = destroy_ss_capture
endif
if not(defined("STORY_HOOK_SANDSHIP_CRASH"))
	!STORY_HOOK_SANDSHIP_CRASH = destroy_ss_crash
endif
if not(defined("STORY_HOOK_SANDSHIP_WAVE"))
	!STORY_HOOK_SANDSHIP_WAVE = destroy_ss_wave
endif
if not(defined("STORY_HOOK_SANDSHIP_DECK"))
	!STORY_HOOK_SANDSHIP_DECK = destroy_ss_deck
endif
if not(defined("STORY_HOOK_OBJECT_LIST_SANDSHIP"))
	!STORY_HOOK_OBJECT_LIST_SANDSHIP = destroy_ss_object_list
endif
if not(defined("STORY_HOOK_OBJECT_SANDSHIP"))
	!STORY_HOOK_OBJECT_SANDSHIP = destroy_ss_object
endif
if not(defined("STORY_QUERY_SANDSHIP_CRASH"))
	!STORY_QUERY_SANDSHIP_CRASH = destroy_ss_q_crash
endif
if not(defined("STORY_QUERY_SANDSHIP_WRECKED"))
	!STORY_QUERY_SANDSHIP_WRECKED = destroy_ss_q_wrecked
endif
if not(defined("STORY_QUERY_SANDSHIP_PLANNED"))
	!STORY_QUERY_SANDSHIP_PLANNED = destroy_ss_q_planned
endif
if not(defined("STORY_QUERY_SANDSHIP_DOOR"))
	!STORY_QUERY_SANDSHIP_DOOR = destroy_ss_q_door
endif
; Flight's Sandship bindings (flight/bind.asm, included after the modules):
; sandship.takeoff() on L+R (carry = the ship takes it as an unplanned
; departure; flight's hull rule may call it too), the wreck's floor hole
; (chained after a provider defined earlier) and shipHull()'s cache key.
if not(defined("SANDSHIP_TAKEOFF"))
	!SANDSHIP_TAKEOFF = destroy_ss_takeoff
endif
if not(defined("SANDSHIP_HULL_KEY"))
	!SANDSHIP_HULL_KEY = destroy_ss_hull_key
endif
if defined("FLIGHT_RAM")
	if defined("FLIGHT_MISSING_FLOOR")
		!DESTROY_NEXT_FLOOR := !FLIGHT_MISSING_FLOOR   ; expanded now (= would follow the redefinition)
	endif
	!FLIGHT_MISSING_FLOOR = destroy_ss_floor_hole
endif

pushpc
org !DATA_DESTROY
destroy_data_start:
incsrc "destroy/tables.asm"
destroy_data_end:
assert destroy_data_end <= !DATA_DESTROY+$8000, "destroy data bank overflow"
pullpc

pushpc
org !CODE_DESTROY
destroy_code_start:
incsrc "entry.asm"
incsrc "tiles.asm"
incsrc "scan.asm"
incsrc "demolish.asm"
incsrc "barriers.asm"
incsrc "sandship.asm"
incsrc "wreck.asm"
incsrc "blast.asm"
incsrc "debug.asm"
destroy_code_end:
assert destroy_code_end <= !CODE_DESTROY+$8000, "destroy code bank overflow"
pullpc

; C0:C7C3: SEP #$30 / LDA $2E (scroll row queue) at the start of the native
; redraw consumer. The hook applies one queued row group and raises the
; native redraw request, then re-executes the replaced instructions.
%orig4($C0C7C3, $2EA530E2)
%hijack_jsl($C0C7C3, destroy_redraw_hook, 4, destroy)

; C0:CC2D: LDA $7ECF00,X in the map piece loader (the gating story flag of
; each piece). The hook returns it unchanged except for Watts's shortcut
; entrance after its door broke.
%orig4($C0CC2D, $7ECF00BF)
%hijack_jsl($C0CC2D, destroy_piece_flag, 4, destroy)

; C1:E7DF-E7F7: the door event's record loads (map, x, y/layer and the last
; byte from C8:3000+4*door) -> destroy_door_record (the Sandship escape
; door reloads Goku's own room; other modules can override via
; !DOOR_RECORD_HOOK: JSL, M16/X16, X = 4*door, A = bytes 0-1, Y = bytes
; 2-3, returning A/Y with X kept). !DESTROY_DOOR_HOOK tells other modules
; this patch (and so the hook) is in the build.
!DESTROY_DOOR_HOOK = 1
%orig4($C1E7DF, $C83000BF)
%orig4($C1E7E3, $8501FF29)
%orig4($C1E7E7, $3001BFDC)
%orig4($C1E7EB, $00FF29C8)
%orig4($C1E7EF, $BFDE854A)
%orig4($C1E7F3, $85C83002)
%orig1($C1E7F7, $DF)
%hijack_jsl($C1E7DF, destroy_door_record, 25, destroy)

; The field NMI's palette upload (C0:C0F0-C117) is core's hook
; (core/cgram.asm): destroy_cgram_upload is one of its handlers.

; C3:0004 (JMP $0160), the sound driver entry: the wrecked ship's room song
; becomes the boss battle alarm.
%orig4($C30004, $EA01604C)
%hijack($C30004, destroy_song_hook, 4, destroy)
