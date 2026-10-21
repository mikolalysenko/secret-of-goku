; WORLD module: Goku's own world flight and Mode 7 powers.
;   takeoff/landing handoff (engine/native-flight.js), Goku's Mode 7 flight
;   sprite and shadow, aerial ki and Kamehameha (engine/world-ki.js), the
;   Fortress shield / destruction route, town craters (engine/world-scars.js)
;   and the Fly ring item. Design notes: docs/agents/snes-port/world.md.
;
; Resources:
;   code   $AD:8000-FFFF (!CODE_WORLD, upper half; tables live in the same bank)
;   WRAM   $7E:7F00-7FFF (!RAM_WORLD)
;   SRAM   !PERSIST_WORLD ($31:6280, $40 bytes)
;   VRAM   world OBJ region A (tiles $060-$0FF, core_vram_claim owner $0D)
;   CGRAM  OBJ palettes 5 (Goku; Flammie's) and 6 (effects) in world flight
;   OAM    world slots 0-63 (Flammie's builder range), in front of the compass
;          and Fortress
;   DMA    channel 7 or 6 (whichever HDMA leaves free) in the world NMI callback

; ---------------------------------------------------------------------------
; WRAM (absolute with DB = $7E)
!WORLD_RAM = $7F00
assert !RAM_WORLD == ($7E0000|!WORLD_RAM), "!WORLD_RAM must match !RAM_WORLD"
!w_mode_prev    = !WORLD_RAM+$00 ; word: !CORE_MODE_* of our last frame callback
!w_lr_held      = !WORLD_RAM+$02 ; word: L+R chord held last field frame
!w_trans_kind   = !WORLD_RAM+$04 ; word: flight pose transition (!TRANS_*)
!w_trans_age    = !WORLD_RAM+$06 ; word
!w_frame        = !WORLD_RAM+$08 ; word: world frames since entering flight
!w_fx_state     = !WORLD_RAM+$0A ; word: effect tile upload step (8 = done)
!w_vram_ok      = !WORLD_RAM+$0C ; word: OBJ region A claimed
!w_cell_want    = !WORLD_RAM+$0E ; word: goku cell id to display ($FFFF none)
!w_cell_buf0    = !WORLD_RAM+$10 ; word: cell in buffer 0 ($FFFF none)
!w_cell_buf1    = !WORLD_RAM+$12 ; word: cell in buffer 1
!w_cell_show    = !WORLD_RAM+$14 ; word: buffer the OAM references (0/1)
!w_mini         = !WORLD_RAM+$16 ; word: miniature cell in the 16x16 buffer ($FFFF none)
!w_oam_used     = !WORLD_RAM+$18 ; word: OAM bytes we wrote last frame (slots 0..n-1)
!w_oam_reserve  = !WORLD_RAM+$1A ; word: bytes the Flammie builder leaves to us
!w_shadow_t     = !WORLD_RAM+$1C ; word: frames left to show the shadow
!w_shadow_y     = !WORLD_RAM+$1E ; word: shadow centre scanline
!w_anim_age     = !WORLD_RAM+$20 ; word: flight clip age
!w_form         = !WORLD_RAM+$22 ; word: form drawn (0 base, 1 SSJ)
!w_flags        = !WORLD_RAM+$24 ; word: !WF_* runtime flags
!w_takeoff_req  = !WORLD_RAM+$26 ; word: a takeoff was requested from the field
!w_lock         = !WORLD_RAM+$28 ; word: request: nonzero forbids takeoff (other modules)
!w_bank         = !WORLD_RAM+$2A ; word: banking -1/0/+1
!w_dock         = !WORLD_RAM+$2C ; word: docking approach active (nonzero)
!w_dock_x       = !WORLD_RAM+$2E ; word: projected Fortress screen x (docking target)
!w_dock_y       = !WORLD_RAM+$30 ; word
!w_anim_frame   = !WORLD_RAM+$32 ; word: flight clip frame (0-3)
!w_fort_x       = !WORLD_RAM+$34 ; word: Fortress screen position (native projection)
!w_fort_y       = !WORLD_RAM+$36 ; word
!w_pal_form     = !WORLD_RAM+$38 ; word: goku palette id written to OBJ palette 5 ($FFFF none)
!w_barrier_req  = !WORLD_RAM+$3A ; word: Tree cloud barrier hit (until destroy_tree_barrier_break merges)
!w_frieza_barrier_lock = !WORLD_RAM+$3C ; word: request (frieza): keep the cloud barrier (unresolved / crisis)
!w_sfx_last     = !WORLD_RAM+$3E ; word: last sound request (!SFX_*; audio stream stand-in)
; aerial ki / Kamehameha (ki.asm)
!w_charge       = !WORLD_RAM+$40 ; word: charge frames (cap 45 SSJ / 90 base)
!w_charging     = !WORLD_RAM+$42 ; word: nonzero while charging (local stand-in)
!w_ki_blocked   = !WORLD_RAM+$44 ; word: Y must be released before another shot
!w_shot         = !WORLD_RAM+$46 ; word: !SHOT_* kind, 0 none
!w_shot_age     = !WORLD_RAM+$48 ; word
!w_shot_max     = !WORLD_RAM+$4A ; word
!w_shot_str     = !WORLD_RAM+$4C ; word: strength 0-256 (256 = full)
!w_shot_flags   = !WORLD_RAM+$4E ; word: !SF_*
!w_shot_tgt     = !WORLD_RAM+$50 ; word: target id (!TGT_*, towns $80|index)
!w_shot_tx      = !WORLD_RAM+$52 ; word: target world x
!w_shot_ty      = !WORLD_RAM+$54 ; word: target world y
!w_shot_ex      = !WORLD_RAM+$56 ; word: end point screen x
!w_shot_ey      = !WORLD_RAM+$58 ; word: end point screen y
!w_shot_side    = !WORLD_RAM+$5A ; word: deflection side -1/+1
!w_expl_age     = !WORLD_RAM+$5C ; word: explosion age, $FFFF none
!w_expl_x       = !WORLD_RAM+$5E ; word
!w_expl_y       = !WORLD_RAM+$60 ; word
!w_expl_flags   = !WORLD_RAM+$62 ; word: bit0 mega, bit1 Fortress
!w_cut_age      = !WORLD_RAM+$64 ; word: planet cutaway age, $FFFF none
!w_land_queued  = !WORLD_RAM+$66 ; word: land on the Fortress at the next world loop
!w_warn_cd      = !WORLD_RAM+$68 ; word: shield warning cooldown
!w_aim          = !WORLD_RAM+$6A ; word: aimed target id while charging ($FFFF none)
!w_aim_x        = !WORLD_RAM+$6C ; word: its screen position
!w_aim_y        = !WORLD_RAM+$6E ; word
!w_input        = !WORLD_RAM+$70 ; word: physical pad this frame (after combat's claims)
!w_anim_tick    = !WORLD_RAM+$72 ; word: ticks into the flight clip frame
!w_combat_owns  = !WORLD_RAM+$74 ; word: request: combat owns the charge (disables the stand-in)
!w_msg          = !WORLD_RAM+$76 ; word: last message id raised (!MSG_*), for UI/story
!w_msg_count    = !WORLD_RAM+$78 ; word: increments with every message
!w_action_age   = !WORLD_RAM+$7A ; word: airBeam pose frames left
!w_scar_pend    = !WORLD_RAM+$7C ; word: crater VRAM refresh rows left (scars.asm)
!w_scar_row     = !WORLD_RAM+$7E ; word
!w_bursts       = !WORLD_RAM+$80 ; 5 x 6 bytes: age (signed, $8000 none), world x, world y
!WORLD_BURST_BYTES = 30
!w_crater_up    = !WORLD_RAM+$9E ; word: crater characters uploaded this flight (chunks, 4 = done)
!w_scar_ring    = !WORLD_RAM+$A0 ; word: next ring row to patch for a new crater ($FFFF none)
!w_scar_ring_end = !WORLD_RAM+$A2 ; word: last ring row to patch
!w_fort_seen    = !WORLD_RAM+$A4 ; word: w_frame when C2:B1F7 last projected the Fortress
!w_burst_live   = !WORLD_RAM+$A6 ; word: live bursts
!w_beam_rows    = !WORLD_RAM+$A8 ; 7 bytes: OAM offset of each beam row's left edge ($FF none)
!w_beam_hwe     = !WORLD_RAM+$AF ; byte: the wave's effective half-width this frame
!w_scratch      = !WORLD_RAM+$B0 ; 16 bytes: call-local scratch
!w_proj         = !WORLD_RAM+$C0 ; 7 bytes: beam row half-widths, +8 word: drawn length (edge sparks)
!w_beam_sig     = !WORLD_RAM+$CA ; word: half-width << 8 | profile offset of the cached beam
!w_beam_start   = !WORLD_RAM+$CC ; word: OAM cursor where the cached beam starts
!w_beam_end     = !WORLD_RAM+$CE ; word: and ends
!w_scar_x0      = !WORLD_RAM+$D0 ; word: crater refresh state (scars.asm)
!w_scar_y0      = !WORLD_RAM+$D2 ; word
!w_scar_w       = !WORLD_RAM+$D4 ; word
!w_scar_h       = !WORLD_RAM+$D6 ; word
!w_scar_id      = !WORLD_RAM+$D8 ; word
!w_scar_col     = !WORLD_RAM+$DA ; word: next column of the tilemap refresh row
!w_pal_dirty    = !WORLD_RAM+$DC ; bits 0/1: palettes 5/6; bit 2: aura, bit 3: gold;
                                ; high byte: aura frame + 1 (consumed this vblank)
!w_ref_x0       = !WORLD_RAM+$DE ; word: crater being refreshed: first column
!w_ref_w        = !WORLD_RAM+$E0 ; word: and width (tiles)
!w_cursor       = !WORLD_RAM+$E2 ; word: OAM byte cursor while drawing
!w_msg_arg      = !WORLD_RAM+$E4 ; word: message argument (town index for !MSG_TOWN)
; $E6-$FB: targeting scratch (aim.asm)
!w_cell_key     = !WORLD_RAM+$FC ; word: (column | legs $80) << 1 | form of w_cell_want
!w_magic        = !WORLD_RAM+$FE ; word: !WORLD_MAGIC once the block is initialised
!WORLD_MAGIC    = $574C
!WORLD_RAM_END  = !WORLD_RAM+$100

!TRANS_NONE    = 0
!TRANS_TAKEOFF = 1
!TRANS_LANDING = 2

!WF_ACTIVE     = $0001   ; Goku replaces Flammie in this world session
!WF_FORT_LAND  = $0002   ; the last landing was the Fortress (record 10)
!WF_SKY_FIX    = $0004   ; diagnostic: the NMI sky repair fired (cleared by tests)

; Sound requests (!w_sfx_last; the audio stream maps them to DBZ effects).
!SFX_TAKEOFF = 1    ; 'flight' (takeoff, docking boost)
!SFX_LANDING = 2    ; 'landing'
!SFX_CHARGE  = 3    ; 'charge'
!SFX_CHARGED = 4    ; 'charged'
!SFX_BLAST   = 5    ; 'blast' (aerial ki)
!SFX_BEAM    = 6    ; 'beam' (aerial wave)
!SFX_DEFLECT = 7    ; 'deflect'
!SFX_IMPACT  = 8    ; 'impact'
!SFX_DISTANT = 9    ; 'distantImpact'

!SHOT_KI   = 1
!SHOT_WAVE = 2
!SF_MEGA    = $0001
!SF_SUPER   = $0002
!SF_HIT     = $0004
!SF_DEFLECT = $0008
!SF_BLOCKED = $0010     ; Fortress shield blocks this wave (drawn short)
!SF_STRIKE  = $0020     ; crater strike pending (one frame after the hit)
!TGT_NONE      = $FFFF
!TGT_LANDSCAPE = $0000
!TGT_FORTRESS  = $0001
!TGT_BARRIER   = $0002
!TGT_TOWN      = $0080  ; | town index (world_town_maps)

; Messages raised for the UI/story streams (!w_msg, see docs).
!MSG_SHIELD   = 1    ; Fortress shield deflection (Luka + Goku, 240 frames)
!MSG_TOWN     = 2    ; a town was destroyed (King Kai + Goku apology)
!MSG_BARRIER  = 3    ; Mana Tree cloud barrier broke
!MSG_FORTRESS = 4    ; the Fortress is breaking apart
!MSG_WEAK     = 5    ; the wave was too weak

; ---------------------------------------------------------------------------
; Persistent (SRAM !PERSIST_WORLD, long addressing)
!pw_flags   = !PERSIST_WORLD+$00 ; byte: !PWF_*
!pw_count   = !PERSIST_WORLD+$01 ; byte: craters (0-!WORLD_MAX_SCARS)
!pw_towns   = !PERSIST_WORLD+$02 ; word: destroyed towns (bit = world_town_maps index)
!pw_scars   = !PERSIST_WORLD+$04 ; !WORLD_MAX_SCARS x 4: tile x (word), tile y (byte), size (byte)
!WORLD_MAX_SCARS = 14
assert !pw_scars+(!WORLD_MAX_SCARS*4) <= !PERSIST_WORLD+$40, "world persistent block overflow"
!PWF_FORTRESS = $01   ; Goku destroyed the Mana Fortress
!PWF_FINALE   = $02   ; landed on the damaged deck: start the post-destruction event

; ---------------------------------------------------------------------------
; OBJ region A (tiles $060-$0FF of name table 0, VRAM word $6600-$6FFF).
!WORLD_TILE_BUF0 = $080   ; Goku cell buffer 0: 4x4 tiles at columns 0-3, tile rows 8-11
!WORLD_TILE_BUF1 = $084   ; buffer 1: columns 4-7
!WORLD_TILE_MINI = $06C   ; 16x16 miniature (docking): columns 12-13, tile rows 6-7
!WORLD_FX_SLOTS_END = $00DC ; effects use our slots up to here (OAM bytes),
                            ; leaving Goku's four cells and the shadow
!WORLD_OBJ_ATTR_GOKU = $3A  ; priority 3, palette 5, name table 0
!WORLD_OBJ_ATTR_FX   = $3C  ; priority 3, palette 6
!WORLD_VRAM_OWNER = $0D   ; core_vram_claim owner id (module bank AD/ED)

; Story hooks and queries this module answers (story/hooks.asm, included
; last by snes/src/modules.asm, picks these labels up).
!STORY_HOOK_QUEST_WISH_SCARS = world_wish_restore
!STORY_QUERY_FORTRESS_DESTROYED = world_query_fortress

; Generated tables
pushpc
org !CODE_WORLD
world_code_start:
incsrc "world/data.asm"
world_fx_tiles:
incbin "world/fx.bin"
world_fx_tiles_end:
world_crater_chars:
incbin "world/crater.bin"
incsrc "util.asm"
incsrc "field.asm"
incsrc "flight.asm"
incsrc "sprite.asm"
incsrc "aura.asm"
incsrc "nmi.asm"
incsrc "aim.asm"
incsrc "ki.asm"
incsrc "scars.asm"
incsrc "fxdraw.asm"
incsrc "api.asm"
incsrc "hooks.asm"
incsrc "ring.asm"
incsrc "bridge.asm"
world_code_end:
assert world_code_end <= !CODE_WORLD+$8000, "world code bank overflow"
pullpc
incsrc "patches.asm"
