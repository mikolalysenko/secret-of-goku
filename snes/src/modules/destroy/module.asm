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
!d_map      = !DST+$00  ; map the transient state belongs to
!d_qn       = !DST+$02  ; queue slots used (live + dead)
!d_qlive    = !DST+$04  ; live queue entries
!d_cn       = !DST+$06  ; cleared (smashed object) entries
!d_last     = !DST+$08  ; core frame of the last applied row
!d_bnext    = !DST+$0A  ; next breach record (ring of !DQ_BREACHES)
!d_wn       = !DST+$0C  ; queued wall candidates
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
!d_abar     = !DST+$2A  ; bit0: this attack already struck a barrier/switch
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
!DQ          = !SRAM_WORK_DESTROY        ; queue: 96 x 8
!DQ_MAX      = 96
!DC          = !SRAM_WORK_DESTROY+$300   ; cleared: 64 x 8
!DC_MAX      = 64
!DB          = !SRAM_WORK_DESTROY+$500   ; breaches: 16 x 24 (4 witnesses x 6)
!DQ_BREACHES = 16
!DW          = !SRAM_WORK_DESTROY+$680   ; wall candidates: 24 x 4 (offset.w, dir.w)
!DW_MAX      = 24
!DFX         = !SRAM_WORK_DESTROY+$6E0   ; effect requests: 4 x 8
!DFX_MAX     = 4
!DSTATE      = !SRAM_WORK_DESTROY+$700   ; $40 bytes of slower state below
!DS          = !SRAM_WORK_DESTROY+$740   ; scratch $C0 (floor sampling)
!DQW #= (!DQ)&$FFFF                      ; bank-$33 absolute views (DB = $33)
!DCW #= (!DC)&$FFFF
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

!MAP_INFO_BRAZIER = $01
!MAP_INFO_SHIP    = $02
!MAP_INFO_COMPLEX = $04
!MAP_INFO_JOCH    = $08
!MAP_INFO_WATER   = $10
!MAP_INFO_BARRIER = $20
!MAP_INFO_DOOR    = $40

!POL_PLANTS  = 0
!POL_OBJECTS = 1
!POL_BEAM    = 2
!POL_SUPER   = 3
!QM_REPLAY   = $04
!QM_DEMO     = $08
!QM_BRAZIER  = $10

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
incsrc "debug.asm"
destroy_code_end:
assert destroy_code_end <= !CODE_DESTROY+$8000, "destroy code bank overflow"
pullpc

; C0:C7C3: SEP #$30 / LDA $2E (scroll row queue) at the start of the native
; redraw consumer. The hook applies one queued row group and raises the
; native redraw request, then re-executes the replaced instructions.
%orig4($C0C7C3, $2EA530E2)
%hijack_jsl($C0C7C3, destroy_redraw_hook, 4, destroy)
