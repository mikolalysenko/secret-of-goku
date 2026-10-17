; FLIGHT module: Goku's ground flight (A + direction), hovering over gaps,
; whip-pad gap crossings, Instant Transmission (L+B) and ceiling escapes
; (L+R indoors). Ports engine/native-local-flight.js, flight-terrain.js,
; dungeon-geometry.js (flight side), native-whip-routes.js,
; native-gap-flight.js, native-teleport.js and ceiling-escape.js.
; Design notes, API and resources: docs/agents/snes-port/flight.md.
;
; Resources:
;   code  $A3:8000-FFFF (!CODE_FLIGHT)      data  $E3:0000-7FFF (!DATA_FLIGHT)
;   WRAM  $7E:D900-D97F (!RAM_FLIGHT, $80 bytes)
;   SRAM  $33:7800-7BFF (!SRAM_WORK_FLIGHT): tile cache, flood fill, cold state
;         $31:62C0-62FF (!PERSIST_GROUND): reserved, unused
;
; Calling convention (module routines): M16/X16, DB = $7E, D = 0 unless a
; routine says otherwise. Hooks into original code document their entry
; state and restore what the original instructions expect.

; Flight owns the movement-vector patch at C0:D651; combat's Saiyan recoil
; is called from fl_hook_d651 (combat_recoil_vector, contract in combat's
; bind.asm). Defined before combat's bind.asm is included.
!FLIGHT_OWNS_D651 = 1

; ---------------------------------------------------------------------------
; WRAM (!RAM_FLIGHT = $7ED900, $80 bytes; absolute addressing with DB = $7E)
!FLIGHT_RAM = $D900
assert !RAM_FLIGHT == $7E0000|!FLIGHT_RAM, "!FLIGHT_RAM must match !RAM_FLIGHT"
!fl_state      = !FLIGHT_RAM+$00   ; byte: !FLS_* bits
!fl_lift       = !FLIGHT_RAM+$01   ; byte: mod.localLift (0-12)
!fl_pad        = !FLIGHT_RAM+$02   ; word: pad 1 held as the module sees it
!fl_pad_prev   = !FLIGHT_RAM+$04   ; word: previous frame's pad
!fl_map        = !FLIGHT_RAM+$06   ; word: map of the loaded terrain context, $FFFF none
!fl_ts         = !FLIGHT_RAM+$08   ; word: tileset (header byte 2 & 63)
!fl_tsf        = !FLIGHT_RAM+$0A   ; word: fl_ts_flags[tileset]
!fl_ofs0       = !FLIGHT_RAM+$0C   ; word: metatile offset of layer 0 (0 or 192)
!fl_ofs1       = !FLIGHT_RAM+$0E   ; word: metatile offset of layer 1
!fl_mflags     = !FLIGHT_RAM+$10   ; word: fl_map_flags[map] (!FLM_*)
!fl_W          = !FLIGHT_RAM+$12   ; word: map width in tiles, min(128, $C0/16)
!fl_H          = !FLIGHT_RAM+$14   ; word: map height in tiles
!fl_wpx        = !FLIGHT_RAM+$16   ; word: map width in pixels, min(2048, $C0)
!fl_hpx        = !FLIGHT_RAM+$18   ; word: map height in pixels
!fl_ext0x      = !FLIGHT_RAM+$1A   ; word: placed extent of layer 0 (tiles, x)
!fl_ext0y      = !FLIGHT_RAM+$1C   ; word
!fl_ext1x      = !FLIGHT_RAM+$1E   ; word
!fl_ext1y      = !FLIGHT_RAM+$20   ; word
!fl_p_scen     = !FLIGHT_RAM+$22   ; word: metatile set pointers for the tileset (0 = empty)
!fl_p_bank     = !FLIGHT_RAM+$24
!fl_p_lily     = !FLIGHT_RAM+$26
!fl_p_small    = !FLIGHT_RAM+$28
!fl_p_dair     = !FLIGHT_RAM+$2A
!fl_vframe     = !FLIGHT_RAM+$2C   ; word: NMI frame ($F4) of the last hero movement step
!fl_travel_x   = !FLIGHT_RAM+$2E   ; word: pixels travelled in that video frame
!fl_travel_y   = !FLIGHT_RAM+$30   ; word
!fl_hook       = !FLIGHT_RAM+$32   ; word: !FLH_* work the movement hooks may have
!fl_d_tile     = !FLIGHT_RAM+$34   ; word: descriptor of the last fetched tile (fl_fetch)
!fl_d_flags    = !FLIGHT_RAM+$36   ; word
!fl_d_beh      = !FLIGHT_RAM+$38   ; word
!fl_d_code     = !FLIGHT_RAM+$3A   ; word
!fl_d_rep      = !FLIGHT_RAM+$3C   ; word
!fl_d_meta     = !FLIGHT_RAM+$3E   ; word: tile + layer offset
!fl_q_x        = !FLIGHT_RAM+$40   ; word: footprint query (pixels)
!fl_q_y        = !FLIGHT_RAM+$42   ; word
!fl_q_l        = !FLIGHT_RAM+$44   ; word: layer 0/1
!fl_q_t        = !FLIGHT_RAM+$46   ; word: terrain 0-3 (ground queries)
!fl_t0         = !FLIGHT_RAM+$48   ; words: scratch (never live across calls)
!fl_t1         = !FLIGHT_RAM+$4A
!fl_t2         = !FLIGHT_RAM+$4C
!fl_t3         = !FLIGHT_RAM+$4E
!fl_t4         = !FLIGHT_RAM+$50
!fl_t5         = !FLIGHT_RAM+$52
!fl_t6         = !FLIGHT_RAM+$54
!fl_t7         = !FLIGHT_RAM+$56
!fl_sw_x       = !FLIGHT_RAM+$58   ; word: sweep origin / deltas
!fl_sw_y       = !FLIGHT_RAM+$5A
!fl_sw_dx      = !FLIGHT_RAM+$5C
!fl_sw_dy      = !FLIGHT_RAM+$5E
!fl_sw_n       = !FLIGHT_RAM+$60   ; word: steps
!fl_sw_s       = !FLIGHT_RAM+$62   ; word: current step
!fl_cache_age  = !FLIGHT_RAM+$64   ; word: frames since the tile cache was cleared
!fl_lastmap    = !FLIGHT_RAM+$66   ; word: map of the last field frame
!fl_lasttick   = !FLIGHT_RAM+$68   ; word: core tick of the last field frame
!fl_magic      = !FLIGHT_RAM+$6A   ; word: !FL_MAGIC once the SRAM work area was initialised
!fl_spare      = !FLIGHT_RAM+$6C   ; word: unused
!fl_speed      = !FLIGHT_RAM+$6E   ; word: configured speed for the next steps
!fl_gap        = !FLIGHT_RAM+$70   ; word: whip-pad crossing active (map+1), 0 none
!fl_counter    = !FLIGHT_RAM+$72   ; word: frames the module ran (field)
!fl_events     = !FLIGHT_RAM+$74   ; word: !FLE_* one-frame events for other modules
!fl_lock       = !FLIGHT_RAM+$76   ; word: request: nonzero forbids flight this frame (other modules)
!fl_open_air   = !FLIGHT_RAM+$78   ; word: request: Sandship openAir (flight passes every wall)
!fl_charging   = !FLIGHT_RAM+$7A   ; word: request: combat is charging (halves speed, flight rules)
!fl_held       = !FLIGHT_RAM+$7C   ; word: buttons held through a menu, ignored until released
!fl_rc_tmp     = !FLIGHT_RAM+$7E   ; word: scratch for the flood fill
!FLIGHT_RAM_END = !FLIGHT_RAM+$80
assert !FLIGHT_RAM_END <= !FLIGHT_RAM+$80, "flight WRAM overflow"

; fl_state bits
!FLS_FLY     = $01   ; mod.localFlight (phase)
!FLS_ON      = $02   ; Goku active on a native field frame (enabled)
!FLS_CAN     = $04   ; canAttack at the end of the last frame
!FLS_HOVERED = $08   ; localFlight on the previous frame (sound edge)
!FLS_CHARGE  = $10   ; charging (request from combat, or the L+Y stand-in)
!FLS_LANDING = $20   ; lift is coming down (landing cue armed)

; fl_hook bits: work the movement hooks may have (set per frame, re-validated live)
!FLH_STEP    = $0001 ; velocity override (flight or charge)
!FLH_PHASE   = $0002 ; flight collision rules (localFlight)
!FLH_CAMERA  = $0004 ; teleport camera follow pending
!FLH_BEAST   = $0008 ; Mana Beast arena: zero camera deltas

; fl_events bits (valid for one frame, read by UI/audio/story)
!FLE_TAKEOFF = $0001 ; local flight started (browser 'flight' cue)
!FLE_LANDING = $0002 ; lift reached the ground (browser 'landing' cue)
!FLE_HOVER   = $0004 ; Goku hovers with control (power-intro first-hover banter)
!FLE_CROSS   = $0008 ; a crossing ended on far ground (onCross)
!FLE_TELEPORT    = $0010 ; Instant Transmission started ('teleport' cue)
!FLE_TELEPORT_IN = $0020 ; Goku reappears ('teleportIn' cue)

; Audio cue ids (docs/agents/snes-port/audio.md; bind.asm asserts them
; against the audio module's !AUDIO_SFX_* when it is present).
!FL_SFX_SWING       = 1
!FL_SFX_IMPACT      = 6
!FL_SFX_TELEPORT    = 16
!FL_SFX_TELEPORT_IN = 17
!FL_SFX_FLIGHT      = 18
!FL_SFX_LANDING     = 19

!TP_DURATION = 12      ; Instant Transmission action length (mana-mod.js)
!FL_MAGIC = $4C46      ; 'FL': module WRAM is cleared at title entry; savestates
                       ; from other builds carry other values here

; Map flags (fl_map_flags, generated)
!FLM_CONTEXT = $0001 ; dungeon geometry context (dungeon-geometry.js context())
!FLM_FERRY   = $0002 ; map 32: Karon's ferry corridor
!FLM_SHIP    = $0004 ; maps 98/99: Sandship deck rail
!FLM_OPENING = $0008 ; maps 128-131: opening field exits
!FLM_BEAST   = $0010 ; map 253: Mana Beast arena
!FLM_FOREST  = $0020 ; map 25: forest banks use the long span
!FLM_CASTLE  = $0040 ; castle chasms (tileset 15, maps 302-304)
!FLM_CAVE    = $0080 ; Gaia lava/air (tileset 10, maps 284-297)
!FLM_FORT    = $0100 ; Fortress chasms (tileset 21, maps 248-251)
!FLM_JOCH    = $0200 ; map 72: Joch's training room
!FLM_POCKETS = $0400 ; map 139: Water Palace stair pockets

; Tileset flags (fl_ts_flags, generated)
!TSF_BLANKGROUND = $01 ; metatile 0 is not ground (realShore)
!TSF_WALLS       = $02 ; dungeon wall tileset
!TSF_BLANKZERO   = $04 ; metatile 0 is not a dungeon floor
!TSF_STAIRSHORE  = $08 ; stairs/currents count as air shores

; SRAM work (!SRAM_WORK_FLIGHT = $33:7800, 1 KiB, long addressing)
!FL_SRAM       = !SRAM_WORK_FLIGHT
!fl_cache      = !FL_SRAM+$000     ; 64 x 6: location (word, $FFFF empty), tile, value (word), spare
!FL_CACHE_N    = 64
!fl_rc_seen    = !FL_SRAM+$180     ; 128 bytes: flood fill visited bits (32x32 window)
!fl_rc_queue   = !FL_SRAM+$200     ; 64 words: flood fill queue (tile index)
!fl_anchor     = !FL_SRAM+$280     ; last verified landing: map, x, y, layer, terrain (5 words)
!fl_crossing   = !FL_SRAM+$28A     ; crossing start: map, x, y, layer, terrain, whip (6 words)
!fl_sram_test  = !FL_SRAM+$2A0     ; test mailbox ($90 bytes, FLIGHT_TEST builds)
!fl_hl         = !FL_SRAM+$330     ; canLand memo at the hero: rect (4 bytes), layer|terrain<<1 (byte),
                                   ; verdict (byte), cell idx (4 words), cell tiles (4 bytes)
!fl_tp         = !FL_SRAM+$350     ; Instant Transmission (teleport.asm):
!fl_tp_act     = !fl_tp+$00        ;   word: action running
!fl_tp_age     = !fl_tp+$02        ;   word: action age
!fl_tp_target  = !fl_tp+$04        ;   word: target slot (3-11, 12 = custom)
!fl_tp_species = !fl_tp+$06        ;   word: target species when chosen
!fl_tp_ox      = !fl_tp+$08        ;   word: origin x (where Goku pressed L+B)
!fl_tp_oy      = !fl_tp+$0A        ;   word: origin y
!fl_tp_queued  = !fl_tp+$0C        ;   word: another press during the action
!fl_tp_arrived = !fl_tp+$0E        ;   word
!fl_tp_sounded = !fl_tp+$10        ;   word
!fl_tp_facing  = !fl_tp+$12        ;   word: action facing (0 down 1 right 2 left 3 up)
!fl_tp_last    = !fl_tp+$14        ;   word: last target slot, $FFFF none (lastTeleportTarget)
!fl_tp_tried   = !fl_tp+$16        ;   word: slots tried by the nearest-first search
!fl_tp_custom  = !fl_tp+$18        ;   custom target (scene modules write it every field frame;
                                   ;   flight consumes it at the end of flight_frame):
                                   ;     +0 byte kind: 0 none, 2 Frieza (slot 12), 3 Vegeta (slot 3)
                                   ;     +1 byte species (Frieza 121, Vegeta 46)
                                   ;     +2 word x, +4 word y, +6 byte terrain, +7 byte airborne
!fl_tp_e_x     = !fl_tp+$20        ;   word: candidate target x (fl_tp_entity)
!fl_tp_e_y     = !fl_tp+$22
!fl_tp_e_terr  = !fl_tp+$24
!fl_tp_e_species = !fl_tp+$26
!fl_tp_e_air   = !fl_tp+$28
!fl_tp_l_x     = !FL_SRAM+$3A6     ;   word: landing found by fl_tp_landing
!fl_tp_l_y     = !FL_SRAM+$3A8
!fl_tp_l_terr  = !FL_SRAM+$3AA
!fl_tp_l_facing = !FL_SRAM+$3AC
!fl_tp_l_air   = !FL_SRAM+$3AE
!fl_tp_best_d  = !FL_SRAM+$3B0     ;   2 words: nearest search distance
!fl_tp_best_i  = !FL_SRAM+$3B4     ;   word
; WRAM aliases for the landing search (the sweep is idle meanwhile)
!fl_tp_pref    = !fl_sw_x
!fl_tp_dist    = !fl_sw_y
!fl_tp_dir     = !fl_sw_dx
!fl_tp_dx      = !fl_sw_dy
!fl_tp_dy      = !fl_sw_n
!fl_tp_stairs  = !fl_sw_s
!fl_g         = !FL_SRAM+$380     ; hero grid (fl_grid_reset): 3x3 tile verdicts around Goku
!fl_g_tx0      = !fl_g+$00         ; word: grid origin tile x
!fl_g_ty0      = !fl_g+$02         ; word: grid origin tile y
!fl_g_l        = !fl_g+$04         ; word: layer ($FFFF = no grid)
!fl_g_t        = !fl_g+$06         ; word: terrain of the ground verdicts
!fl_g_akn      = !fl_g+$08         ; word: air verdict known (bit = row*3 + column)
!fl_g_aok      = !fl_g+$0A         ; word: air verdict pass
!fl_g_gkn      = !fl_g+$0C         ; word: ground verdict known
!fl_g_gok      = !fl_g+$0E         ; word: ground verdict pass
!fl_g_need     = !fl_g+$10         ; word: scratch (cells to evaluate)
!fl_step_f4    = !fl_g+$12         ; word: $F4 of the hero step whose eligibility is cached ($FFFF none)
!fl_step_elig  = !fl_g+$14         ; word: cached eligible() for that step
!fl_g_tiles    = !fl_g+$18         ; 9 bytes: tile id of each grid cell when its verdict was made
!fl_g_base     = !fl_g+$22         ; word: idx of grid cell 0
!fl_g_stale    = !fl_g+$24         ; word: nonzero = re-anchor the grid at Goku before its next use
!fl_sw_rect    = !FL_SRAM+$3C0     ; 4 words: tile rectangle of the last evaluated sweep step
!fl_sw_last    = !FL_SRAM+$3C8     ; 6 words: x, y, dx, dy, layer, result of the step's last sweep
!fl_hm_land    = !FL_SRAM+$3D4     ; 4 words: x, y, E00B, result of canLand at the hero
!fl_hm_fly     = !FL_SRAM+$3DC     ; 4 words: x, y, E00B, result of canFly at the hero
!fl_cam        = !FL_SRAM+$3E4     ; camera follow (native-teleport.js pending):
!fl_cam_map    = !fl_cam+$00       ;   word: map, $FFFF = none
!fl_cam_layer  = !fl_cam+$02       ;   word: layer of the landing
!fl_cam_terr   = !fl_cam+$04       ;   word: terrain byte for the dispatcher ($1B)
!fl_cam_x      = !fl_cam+$06       ;   word: target camera x
!fl_cam_y      = !fl_cam+$08       ;   word: target camera y
!fl_cam_frame  = !fl_cam+$0A       ;   word: $F4 of the last scroll step

; Tile cache value bits (word). Keyed by location and tile id: a cut or
; demolished cell gets a fresh entry; neighbour-dependent results expire
; with the cache.
!FLC_CLV    = $0001   ; class bits below are known
!FLC_CLRAIR = $0002   ; clear(t, *, true)
!FLC_LANDB  = $0004   ; clear(t, terrain, false) for a terrain its height admits
!FLC_H1     = $0008   ; height 1 (excludes terrain 2)
!FLC_H2     = $0010   ; height 2 (excludes terrain 1)
!FLC_LOWV   = $0100   ; FLC_LOW is known
!FLC_LOW    = $0200   ; lowObstacle(t)
!FLC_BLKV   = $0400   ; FLC_BLK is known
!FLC_BLK    = $0800   ; dungeon.blocked(t)
!FLC_AIRV   = $1000   ; FLC_AIR is known
!FLC_AIR    = $2000   ; dungeon air route
!FLC_WHIPV  = $4000   ; FLC_WHIP is known
!FLC_WHIP   = $8000   ; whip corridor (crossable)

!FL_CACHE_LIFE = 32 ; frames before the cache is cleared while it is used

; ---------------------------------------------------------------------------
; Generated tables (snes/gen/flight.mjs)
pushpc
org !DATA_FLIGHT
incsrc "flight/tables.asm"
flight_data_end:
assert flight_data_end <= !DATA_FLIGHT+$8000, "flight data bank overflow"
pullpc

pushpc
org !CODE_FLIGHT
flight_code_start:
incsrc "frame.asm"
incsrc "terrain.asm"
incsrc "move.asm"
incsrc "teleport.asm"
incsrc "gap.asm"
if defined("FLIGHT_TEST")
	incsrc "../../../test/flight/testmod.asm"
endif
flight_code_end:
assert flight_code_end <= !CODE_FLIGHT+$7000, "flight code overflows into the binding area ($A3:F000)"
pullpc

incsrc "hooks.asm"
