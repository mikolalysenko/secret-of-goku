# WORLD module: Goku's world flight and Mode 7 powers

Spoilers. Part of the [SNES cartridge port](../snes-rom.md) ([plan](plan.md),
[engine notes](engine.md)). Source: `snes/src/modules/world/`, generator
`snes/gen/world.mjs`, tests `snes/test/world/`. Browser references:
`engine/native-flight.js` (takeoff, landing, docking, flight shadow),
`engine/world-ki.js` (aerial ki, the aerial Kamehameha, the Fortress shield,
destruction, cutaway and deck landing, the cloud barrier),
`engine/world-scars.js` + `engine/native-crater.js` (town craters),
`engine/fortress-collapse.js` (crisis cue on the damaged deck),
`engine/sprite-layer.js` (the Mode 7 flight sprite, effect stamps, the Fly
icon), `engine/native-item-icons.js` (Fly icon detection),
`engine/mana-mod.js` (controls).

Once `!persist_goku_active` is set, Goku flies himself: L+R in the field (or
the Fly item, the renamed Drum) takes off without Flammie's summon, Goku
replaces Flammie on the Mode 7 world map, Y fires small ki shots and L+Y
charges the aerial Kamehameha. The full Super Saiyan wave destroys the Mana
Fortress (explosion, cutaway, landing on the damaged deck with the crisis
cue and the post-destruction scene) or leaves a permanent crater where it
lands, wiping out any town there until the restoration wish; it also opens
the Mana Tree's cloud barrier. Weaker waves bounce off the Fortress shield.

## Status

| Feature | State | Evidence |
| --- | --- | --- |
| Takeoff (L+R, Fly item, `world_takeoff`) through the native `$0C00\|map` path, no summon, Goku's takeoff pose meanwhile | Done | `takeoff`, `item` (104 frames to world flight; 432 natively) |
| Landing (B over land): no BG3 fly-by, Goku's landing pose, ordinary loader; Fortress record 10 offset corrected | Done | `landing`, `fortress` |
| Goku replaces Flammie in Mode 7 (rear view, banking, bob, flight clip, charge pose with hanging legs, airBeam pose, both forms, palette 5, small shadow instead of the HDMA window) | Done | `sprite` |
| A ascends, B descends/lands; steering; L chords suppress altitude input immediately | Done | `controls`, `ki` |
| Aerial ki shots, late distant bursts | Done | `ki` |
| Ki aura during focus, charge, transform and revert; browser power, ignition, colour and flicker | Done | `aura`: every sampled raster equals the browser sprite layer |
| Charged aerial Kamehameha (shared combat state), aim sparks, beam, edge sparks | Done | `controls`, `ki`, `fortress`, `scars` |
| Fortress shield: base/partial waves deflect (rebound streak, arcs, 720-frame message cooldown) | Done | `ki` |
| Fortress destruction: explosion, 186-frame planet cutaway, deck landing with the crisis cue, story event `$8B` | Connected to ending and Frieza modules | `fortress` |
| Docking approach (ki boost, curve into the Fortress, no native dragon) | Done | `dock` |
| Town craters (Mode 7 characters in the 7F ring and the tilemap, persistent, landing reads the terrain under them, wish restores) | Done | `scars` |
| Mana Tree cloud barrier hit test; calls destroy's barrier break | Connected | `barrier` |
| Fly ring item art (Goku's hover pose in his colours) | Done | `item` |
| Globe / flat-map navigation and return: reload graphics, palettes and radar | Done | `map`, both forms, first-visible-frame palette checks |
| Dragon Radar targets, Ball count, quest hints and live Fortress/Beast label | Done | 15 production save-state cases in `radar`, browser pixel/bearing comparisons in `ui radar` |
| Radio lines, sounds, barrier break, Frieza state | Bridged to UI / audio / destroy / frieza when present | scratch bridge build (see Integration) |

## How it works

### Takeoff and landing (`hooks.asm`, `field.asm`, `api.asm`)

The game's own Drum path stays in charge of everything that decides a
flight: the `$0C00|map` event stores the return map and takeoff position,
fades, runs the Mode 7 loader and later lands through the landing record
table (`C6:7780`). `C1:E833` is the shared handoff right after that
bookkeeping; with Goku it skips the summon (`E8=4` phase) and requests the
fade straight to world flight as `C0:A4E1-A4EC` / `C0:8B16` do once the
dragon has arrived. Flight owns the L+R edge and applies the same boss,
status, scene and recovery-camera locks to both outdoor takeoff and roof
escape. It calls `world_takeoff` (browser: `requestFlight()`), which checks
`world_takeoff_check` (Goku, no `!w_lock`, no pending event, idle field,
the map header's world-flight bit at `C8:7000+4` bit 7, a valid map id and
the shared native/custom boss gate) and queues the event
through `core_event_request`. The Fly item's handler (`C1:DBCD`) jumps over
the drum animation and sound to the same request at `C1:DC22`.

Landing: `C0:BC0B` (start of the ground loader) clears request bit 0 of
`$E8`, which would otherwise play the BG3 Flammie fly-by and hide the party,
so the ordinary loader places the party. Fortress landing record 10 stages
the party 64 tiles east for the fly-by; the hook takes that back.
`field.asm` runs the browser's `flightTransition` on the goku module's pose
API (`!goku_mode` `$26` takeoff, `$27` landing).

Start opens the native map viewer; R changes the globe to the flat map,
L changes it back, and B closes it once loading is complete. Closing either
view runs the world loader again without entering the field. The
`C0:8045` hook invalidates the world session and UI graphics caches before
the loader, so the first resumed frames restore Goku/effect palettes,
tiles and the radar instead of reusing the viewer's colours and sprites.

### Goku in Mode 7 (`flight.asm`, `sprite.asm`, `nmi.asm`)

`C0:9AD0` (Flammie's OAM builder) builds nothing with Goku and leaves slots
`0..!w_oam_reserve-1` to the module; `C0:9DE9` hides the rest of 0-63.
Every world frame picks the flight cell (goku module `goku_api_cell`:
columns 40-43 base / 36-39 Super Saiyan, row 3 rear view; charge column
22/18 with hanging legs via `goku_legs_index`; airBeam 24/20), banks it with
the turn rate, bobs it, and draws four 16×16 OBJ (empty quadrants skipped)
in palette 5. The cell's 16 tiles go into a hidden double buffer in vblank
(`world_world_nmi`, DMA channel 7 or 6, whichever the world's HDMA leaves
free in `$2C`), then the buffers swap. Four packed row transfers replace
the sixteen tile transfers; docking miniatures use two packed rows. The
palette follows the resident cell actually referenced by OAM, so changing
form cannot colour the previous frame's art with the new palette.
The HDMA shadow window is turned off
(`$2D`, and `C0:88FB` keeps `TMW` clear) and a small pixel shadow is drawn
on the ground line below Goku. On a frame the game did not finish (lag) or
whose next world buffer was not ready (`$60` bit 7), `C0:890B` skips the sky
setup and Mode 7 would cover the sky for that frame; the same hook restores
Mode 1 and the cached sky scroll then (as `C0:89EE-89FD`), except on the
overhead map.

### Frieza's flyby over 1F04

`world_draw` calls `frieza_world_draw` after `world_fx_back` and before
Goku. Normal flyby pieces share world slots 0–54 and the core's 88–127 run;
world still owns Goku's body and shadow. Frieza claims world OBJ B/C while
the existing `$8C` guard hides UI, and uses palettes 7 and 6. Mode 7 uses
CGRAM entries from the lower OBJ palettes too: palette 4 must **not** be
borrowed here, as it recolours the terrain.

Frieza borrows HDMA 6 for a screen-space sphere window and 7 for COLDATA
while the ball fills the sky. Channels 0–5, including native fog channel 5,
remain unchanged. Once the throw descends into the terrain, channel 7 is
released and a vblank backdrop colour preserves the native fog. Both main
and sub BG1/BG2 are masked inside the circle; OBJ retains its ordinary
priority. An OBJ patch puts the thrown sphere over Goku. The field FX
polygon channels 2/3 are never called. Palette memory, VRAM and OAM are
written only in vblank; there is no active-display general DMA.

For ages 404–411, Frieza returns carry set and supplies the complete OAM
picture, including Goku, in an 8/32 layout. Fifty-six checker cells use
exactly 32 slivers per line. World A's idle effect cells hold static
checker/Frieza art. `world_nmi_cell` suppresses Goku's ordinary cell upload
until age 409 (411 in Super Saiyan), then preloads the normal body before the 8/16 layout returns.
The effect atlas, normal Goku/effect palettes, backdrop and native world
colour math are restored afterward; B/C are released at age 550. See
[frieza.md](frieza.md#world-flight-picture-flybyasm-_frieza-flybymjs) for
picture checks and the remaining surface/crowding approximations. Both
forms complete 549 flyby frames with zero lag/overflow/deferred uploads;
whole-world NMI peaks at 34.89 of 37 vblank lines. The full world (15), UI
(12, including radar/panel), Frieza (29) and FX (6) cases pass after this
change. The perf flight fixture still reports 0/304 completed frames, also
reproduced on the pre-task ROM; the five field perf scenes pass.

### World ki aura (`aura.asm`, `snes/gen/world-aura.mjs`)

World draws the flame behind Goku, using combat's published action,
charge, focus power and clock. The gate is the browser's
`(focus || charging || powering) && (canAttack || flight)`; world flight
does not require field `canAttack`. Docking returns before the aura, as
the browser does. Existing combat locks cancel focus/charge normally.
Focus uses `.25 + .45 * powerCharge / 96`; base/SSJ charge uses
`.15 + .4 * charge / 90` / `.4 + .6 * charge / 45`. Transform turns gold
at `ceil(duration * 14 / 40)`; revert stays gold before age 8 and fades
by `1 - age / duration`. Both 32/72-frame transforms and 10/20-frame
reversions are covered. Odd combat clocks intentionally draw nothing.

The generator calls `drawKiAura` at height 32 for all eight power levels
and twelve phases. Deduplicating 8×8 cells preserves every pixel, including
the asymmetric tongues, in at most 31 tiles. Up to 36 small OBJ compose
the 48×64 bounding rectangle at Goku's banked/bobbing body centre; no
rescaling, mirroring, HDMA or colour math is needed. Blue's shorter native
ramp merges two highlights; gold retains all four semantic shades.

The 32 tile slots are the previously unused `$060–06B`, `$070–07B`,
`$06E–06F`, `$07E–07F`, `$0CE–0CF` and `$0DE–0DF` in world A. The
docking miniature, charge sparks, aerial ki, beam and shadow keep their
slots. B/C remain available to UI and Frieza. Palette 7 is uploaded only
with a visible flame; the input-locked flyby owns it during its scene.
Every visible aura reloads its tiles and colours, so a map return or
flyby cannot leave a stale cache. The ordinary effect upload excludes its
unused `$CE/$DE` padding: the core flushes that queue after world NMI.

The existing dirty-palette word carries the frame id and gold flag to
NMI; no new RAM allocation or core hook is needed. Six DMA transfers
upload 1,024 tile bytes and one uploads 32 palette bytes, using the world's
free channel, only with at least 12 vblank lines left. If that budget is
unavailable, a short OAM transfer hides the flame instead of showing old
tiles; even this fallback requires two remaining lines. No sampled frame
needs the fallback. There is no active-display DMA or PPU-memory write.

The `aura` case compares decoded OAM/VRAM/CGRAM against the actual
`ManaSpriteLayer.prepare()` and `drawKiAura`, on every frame, including
cold residency, both forms, banking, charge, both transformation lengths,
both reversion lengths, release and forward travel/steering while focusing
or holding a full SSJ charge. Across 1,877 video frames it has **744/744**
browser-visible frames, zero pixel differences, misses, unsafe DMA or
OAM overflow (at most 15 objects / 18 slivers on a line). Screenshots and
browser/OBJ raster pairs stay in `.local/snes-test/world/aura/`.

Matched pre-change/updated idle runs measure the combined world frame
callbacks at **9.250 → 9.243 lines**, and world NMI at **2.173 → 2.173**.
The resident effect-atlas early-out pays for the new idle gate. Visible
flames cost at most 14.94 frame lines and 9.14 upload lines (10.27 when
Goku's palette also changes). The longest whole NMI is 35.67/37 lines
during cold loading; ordinary focus peaks at 31.54.

Validation (2026-10-21): strict build; full world (15 cases), flight
(11 cases, 289,324 terrain tiles and 19,996 teleport queries), Frieza
(18 available cases, including both flyby forms), FX (7 cases plus the
18-scene field-focus audit), combat (37 cases), and all six perf scenes
pass. The additional travel variants also pass. The saved pre-change ROM
and this build both finish perf flight at **112 lines p90 / 4 lag frames**;
the idle world callback comparison above uses the same imported flight
preset and input. No core or other module changes are required.

### Aerial ki and the aerial Kamehameha (`ki.asm`, `aim.asm`, `fxdraw.asm`)

Ports `world-ki.js` `tick()` and `draw()`. Targets are the cloud barrier
(takeoff entry of map 198 × 16, radius 44, while `$E3` bit 6 is clear and
Frieza's chase does not hold it), the real moving Fortress (`$0128/$012A`,
radius 36, until destroyed / `$8C` / `CF4E` ≥ 9) and the eleven blastable
towns (radius 32, until cratered). A wave hits the candidate within range
(512 px, 1,024 for the full SSJ wave and always for the Fortress) and
tolerance (radius + 20, + 80 mega): non-towns first, then the nearest.
Strength ≥ .85 damages (explosion, crater, Fortress); the Fortress shield
deflects anything but the full Super Saiyan wave.

Effects are OBJ built from the cartridge's own spell cells
(`native-effects.json`), quantised into one effect palette (6): charge orbs,
impact sparks, lightning, aura arcs, beam edges and core. The wave is drawn
as rows of 16×16 OBJ along the browser's giant-beam profile (`world_beam_f`
table) with the edge ripple; a grown beam reuses its OAM entries and only
turns the ripple. These attack effects go into the module's own slots ahead of Goku
(the browser's effect layer draws over Goku and over native sprites,
`layer.behindBody` false); only the overflow uses `core_oam_add`.

### Fortress destruction (`ki.asm`, `hooks.asm`)

The full wave on the Fortress sets the persistent `PWF_FORTRESS` flag
(`C2:B112` stops drawing it), explodes, and after 24 frames starts the
186-frame cutaway (`ending/cutaway.asm` renders the planet view from
`!w_cut_age`). Then the Fortress's own docking ABI
(`C2:B1CA`: `E8=1`, `F2|=$80`, S=`$1FF`, A=10, `JML $008260`) lands on its
deck. The event-sound opcode hook (`C1:F109`) turns the deck's cue `$26`
into the crisis cue (`01 1B 13 8F`, `fortress-collapse.js`), and the first
idle field frame on map 255 requests story event `$8B` (the
post-destruction scene) through `story_api_request`.

### Docking (`flight.asm`)

When the native approach counter `$CF` reaches `$5C` near the Fortress, the
timer `$BF` starts. Goku's ki boost adds 5 per frame (native-flight.js),
`C2:B230` drops the native miniature dragon, and Goku flies a quadratic
curve into the projected Fortress (`C2:B1F7` records its screen position),
shrinking to the goku module's 16×16 miniature; the native fade lands on
the deck.

### Craters (`scars.asm`, `snes/gen/world.mjs`)

`world-scars.js` overlays a scaled Potos-hole image on the Mode 7 output per
pixel. The cartridge cannot overlay, so the crater becomes part of the map:

- The generator scales the crater art (`decodePotosCrater`) to the two
  sizes (144 px wide for a normal strong wave, 224 for the full SSJ wave;
  height 2/3), keeps 8×8 cells that are at least 24/64 opaque, and reduces
  them to 32 shared Mode 7 characters `$E0-$FF` (tiles the world map never
  uses) in the world's own colours (k-means over the cells, nearest CGRAM
  colour of palettes 4-12). It emits the two cell layouts (18×12, 28×19).
- On entering world flight the characters go to VRAM (one 512-byte chunk
  per vblank). The generator pre-expands the fixed terrain into eight 32 KiB
  ROM blocks. `world_copy_row` copies a 512-byte row into the native 7F ring
  at `C0:98FD`, then the module writes the crater cells of that row. The
  interruptible CPU block copy uses no DMA/HDMA channel. Every terrain tile,
  all eight ROM blocks and ring wrap are checked by `terrain.test.mjs`.
  A new crater patches the ring rows near the camera (one row per frame)
  and rewrites the 128×128 Mode 7 tilemap cells in view (8 per vblank).
- `C0:8190` (the landing check's tile read) returns the original terrain
  under a crater cell, by decoding the world row's RLE.
- Records (≤ 14: tile x, y, size) and the destroyed-town bits are in the
  persistent block; `world_wish_restore` (story hook `QUEST_WISH_SCARS`)
  clears them.

### The Fly item icon (`ring.asm`)

The browser draws Goku's upright hover pose at half size (column 38, or 34
in Super Saiyan form, every second pixel) wherever the Drum's 16×16 icon
appears. The ring's icon builder (`D0:CA6E`, icon `$A4`) gets the goku
module's 16×16 miniature of that cell instead of the drum art, and the icon
sprite (`C0:7063`) uses palette 5, which holds Goku's own colours in the
field, so the icon is exact. Only player 1's ring (`$1802` bit 0 clear):
player 2's ring loads its item colours into palettes 4-7.

## Mode 7 constraints and how they are met

- **No per-pixel overlay.** Ordinary effects are OBJ (16×16; aura cells 8×8,
  with OBJSEL `$03`), and
  craters are Mode 7 characters written into the map (256 characters total;
  the 32 the world never uses carry the crater).
- **The world's HDMA owns channels 0-5 and 7 and the Mode 7 matrix.** The
  module multiplies with the CPU's 8×8 unit (`$4202`), never Mode 7's, and
  its vblank DMA uses channel 7 or 6, whichever `$2C` leaves free. Goku
  disables the native shadow on 7; the guarded Frieza flyby borrows 6/7
  as described above, and temporarily uses 8/32 OBJ for its checker.
- **The world NMI is not force-blanked.** Every vblank upload checks
  `core_vblank_lines` first; crater characters and tilemap cells are spread
  over vblanks.
- **The 7F ring and the tilemap are streamed.** Craters are written when
  rows stream in and refreshed near the camera; nothing else of the native
  streaming changes, so the IRQ horizon split is untouched.
- **Frame time.** The native world logic ends at scanline ~120-150. Measured
  in a native session (`perf2` probe, waterfall takeoff, full waves on
  Pandora and the Fortress): idle flight costs 14 lines, a charge ≤ 43, the
  heaviest wave frames ≤ 98; every world frame ended by line 223 (vblank at
  225) and the module's vblank work ends ≤ 33 lines into vblank. The charge
  sparks re-aim every four frames with the candidates spread over those
  frames; optional sparks stop at line 208 (latched V counter) so Goku and
  the vblank handshake always fit; the crater strike runs one frame after
  the hit.

## Resources

| Resource | Use |
| --- | --- |
| Code/data `$AD:8000-$AD:D139` | `!CODE_WORLD` (upper half of `$AD`): about 20.3 KiB used, incl. effect tiles (5 KiB) and crater characters (2 KiB) |
| Aura xdata | 96 KiB of deduplicated frame tiles (three 32 KiB blobs), 13.5 KiB of sparse OAM records |
| WRAM `$7E:7F00-$7E:7FFF` | `!RAM_WORLD`, all `$100` bytes (map in `module.asm`); magic word at `+$FE` (cleared by `world_title_boot`, checked every frame) |
| SRAM `!PERSIST_WORLD` (`!SRAM_LIVE+$280`, `$40`) | `+$00` flags (`PWF_FORTRESS` 1, `PWF_FINALE` 2), `+$01` crater count, `+$02` destroyed towns (bit = `world_town_maps` index), `+$04` 14 crater records × 4 |
| VRAM | OBJ region A (`!VRAM_WORLD_OBJ_A`, tiles `$060-$0FF` of name table 0, word `$6600-$6FFF`), claimed with owner `$0D`: Goku's double-buffered cell (`$080`, `$084`), miniature (`$06C`), attack effects and the aura's 32 spare tiles listed above. Mode 7 characters `$E0-$FF` (high bytes of words `$3800-$3FFF`) and tilemap low bytes near the camera |
| CGRAM | OBJ palettes 5 (Goku) and 6 (effects), in both world buffers (`$7E:0600`, `$7E:DE00`) and vblank; palette 7 (aura), only in vblank |
| OAM | Slots 0-59: attack effects, Goku and shadow, then up to 36 small aura sprites. Attack-effect overflow uses `core_oam_add` (88-127) |
| DMA | Vblank only, channel 7 or 6: Goku 512 B, miniature 128 B, crater characters 512 B on entry, visible aura 1,024 B + palette 32 B |
| Ring | `D0:CA6E`/`C0:7063` hooks: the Fly icon's 128 bytes in the ring's own buffer `$7E:1900` |

## Original code patched (`patches.asm`)

| Address | Original | Purpose |
| --- | --- | --- |
| `C1:E833` | `JSL $01CBCB` | takeoff handoff: skip Flammie's summon |
| `C1:DBCD` | `LDA $19F2 / AND #$03` | Fly item: skip the drum animation and sound |
| `C0:BC0B` | `JSR $BC85 / JSR $C481` | landing: no BG3 fly-by, Fortress record offset, landing pose |
| `C0:88FB` | `LDA $EC / LSR / BCC / JSR $890B` | world NMI: no shadow window; sky kept in Mode 1 on lag frames |
| `C0:8064` | `SEP #$20 / JSR $8B5E` | world loop top: queued Fortress landing |
| `C0:9AD0` | `LDA $BF / BNE $9ACB` | Flammie's OAM builder: our slots instead |
| `C2:B112` | `LDA $E3 / BIT #$40 / BNE` | draw the real Fortress from the first flight; hide it once destroyed |
| `C2:B230` | `REP #$20 / LDA $F4 / LSR / AND #$0006` | docking: no miniature dragon |
| `C2:B1F7` | `SEP #$20 / LDA $C20000,X / INX` | record the Fortress's screen position |
| `C1:F109` | `JSL $C30004` | deck cue `$26` → crisis cue after the destruction |
| `C0:98FD` | `JSR $99F3 / REP #$20` | world row decompressed: draw craters into the 7F ring |
| `C0:8190` | `LDA $7F0000,X / AND #$00FF` | landing tile under a crater = original terrain |
| `D0:CA6E` | `REP #$30 / AND #$00FF` | ring icon builder: the Fly icon |
| `C0:7063` | `CPY #$0009 / JSR $709C / STA $06,X` | ring icon sprite: palette 5 for the Fly icon |

## API for other modules

JSL entry points (`api.asm`, `ki.asm`); they preserve DB and D.

| Routine | Contract |
| --- | --- |
| `world_takeoff` | Take off into world flight from the current field map (the Drum's path). C clear = requested (starts at a later idle field frame); C set = not now (Goku inactive, map forbids flight, field busy, event pending, `!w_lock`) |
| `world_takeoff_allowed` | C clear when `world_takeoff` would succeed now. The flight stream's ceiling escape should act on L+R only when this reports C set (browser: `flight.request() \|\| ceiling.request()`) |
| `world_fire_ki` | Small ki shot (strength .2). M16/X16, DB `$7E`. Ignored unless in world flight with no shot travelling |
| `world_fire_wave` | Aerial Kamehameha, A16 = strength 0-256 (256 = fully charged). The full SSJ wave (form 1 and 256) reaches twice as far |
| `world_fortress_destroyed` | C set once Goku's wave destroyed the Fortress (persistent) |
| `world_query_fortress` | Story query `FORTRESS_DESTROYED` (A16 0/1) |
| `world_town_destroyed` | A16 = map id → C set when a crater covers that town |
| `world_scar_count` | A16 = craters on the world map |
| `world_wish_restore` | Story hook `QUEST_WISH_SCARS`: repair every crater and town |

RAM requests (world block, `module.asm`): `!w_lock` (nonzero forbids
takeoff), `!w_combat_owns` (combat drives the charge and calls the fire
entries; the local stand-in stops), `!w_frieza_barrier_lock` (keep the cloud
barrier). State others may read: `!w_flags` (`WF_ACTIVE` while Goku flies),
`!w_shot*`, `!w_expl_age`, `!w_cut_age` (cutaway frame, `$FFFF` none: the
planet-view module can draw the real cutaway), `!w_land_queued`, `!w_msg` /
`!w_msg_count` / `!w_msg_arg` and `!w_sfx_last` (last request, also when a
bridge sent it), `!w_barrier_req`.

## Integration with the other streams (`bridge.asm`)

Each bridge switches itself on when the other module's generated ids file
is in the build (`getfilestatus`), so no include order matters; otherwise a
stand-in records the request in world RAM (what the world tests read).

| Stream | Detected by | What the world module does |
| --- | --- | --- |
| audio | `audio/ids.asm` | `audio_sfx` for every `playSound`: flight, landing, charged, blast, beam, deflect, impact, distantImpact. The charge bed (`audio_loop`) and the Kamehameha voice (`audio_voice`) belong to whoever owns the charge (combat) |
| ui | `ui/defines.asm` | `ui_interrupt(!UI_GROUP_FORTRESS_SHIELD)` on a deflection (720-frame cooldown); `ui_say(!UI_MSG_WORLD_SCARS_COLLATERAL_0, X = town << 8)` then `_1` when a town is destroyed (town index = `blastTowns` order, as `world_town_maps`); `ui_interrupt(!UI_GROUP_TREE_BLAST)`, or `!UI_MSG_WORLD_KI_TREE_BLAST` during the crisis, when the barrier opens |
| destroy | `destroy/tables.asm` | `destroy_tree_barrier_break` when a full wave opens the cloud barrier (it owns `$E3` bit 6 and its persistence) |
| frieza | story query table | `FRIEZA_CRISIS` and `FRIEZA_STOLEN` (answered 0 until frieza implements them) keep the barrier and pick the crisis tree-blast line |
| story | merged | `QUEST_WISH_SCARS` hook, `FORTRESS_DESTROYED` query, event `$8B` request on the deck |
| combat | `!w_combat_owns` + `world_fire_*` | Connected: combat owns charge, action and sound; the local fallback is only for builds without combat |
| flight | `world_takeoff`, `world_takeoff_allowed` | ceiling escape route choice |
| title | merged | owns the starting inventory (the Drum, `$27` at `$7E:CC48`) |

The bridges were checked with a scratch build that stages the UI, audio and
destroy ids with stub entry points: takeoff sent FLIGHT; the Pandora wave
CHARGED, BEAM, IMPACT, `COLLATERAL_0` with X = `$0100` and `COLLATERAL_1`;
the barrier the break and the `TREE_BLAST` group; a partial SSJ wave on the
Fortress DEFLECT and the `FORTRESS_SHIELD` group.

## Tests (`node snes/test/world/run.mjs [test …]`)

The October 18 follow-up adds a video-frame `timing` check for cruising,
ki, charge/release and transformation/reversion. The original world upload
took 15.78 scanlines at its busiest; packed rows take 5.54. In the same
four scenarios, the longest complete NMI fell from 31.76 to 21.54 lines,
and the two mismatched-palette frames during transform/revert are gone.
Those upload measurements preceded the terrain and loop improvements.
The final 5,770-video-frame production stress run has zero missed frames,
palette mismatches, OBJ overflow or NMI overruns. Its longest complete NMI
is 26.55 lines and its busiest cell upload remains 5.54 lines. The run keeps
the radar visible during 2,400 frames of travel/turning and exercises ki,
charge/release and both form changes. The same inputs pass in two additional
world fixtures. Crowded local field combat still has CPU misses; see
[gameplay performance](gameplay-performance.md#flight-world-map-and-radar-follow-up).

Mesen2 headless (`MESEN` or `.local/tools/mesen`); outputs in
`.local/snes-test/world/<test>/`. Native sessions start from the shared
`waterfall.mss` checkpoint (L+R takeoff); `sprite` and `ki` import browser
states (`preset__flight`).

| Test | Checked |
| --- | --- |
| `sprite` | no Flammie OBJ; Goku's flight cell in slots 0-3 (VRAM tiles against `goku_cell_tiles`, palette 5 against `goku_palettes`), flight clip cycling, banking, both forms, the pixel shadow, no HDMA shadow window; OBJ region claimed |
| `takeoff` | `!w_lock` refuses; L+R reaches world flight in < 140 frames without the `E8=4` summon phase, takeoff pose, event `$0C80`, return map |
| `takeoff-locks` | outdoor L+R respects live/custom bosses, flight scene locks, sleep/death and the recovery camera; a dying boss permits departure |
| `landing` | B lands without the BG3 fly-by; landing pose and its end; landing sound request |
| `controls` | shared charging/form/input state, wave release without stray ki, scene/focus locks, first-read L+B altitude protection, radar yields on the current attack frame |
| `ki` | Y hidden from the game; ki shot, orb and distant burst; a full base charge; the wave aims at the Fortress and deflects (message, Fortress intact, controls locked while it flies); a partial SSJ wave deflects too; the 720-frame message cooldown |
| `fortress` | full SSJ wave from 400 px: destroyed, explosion, cutaway, deck landing (map 255, offset corrected), crisis cue `01 1B`, event `$8B`, persistent flag |
| `scars` | crater characters in VRAM; Pandora aimed and destroyed; record, town bit, message; ring and tilemap patched; persistent after landing and taking off again |
| `barrier` | full wave on the cloud barrier: no crater, break request, tree-blast message; no target once `$E3` bit 6 is set |
| `dock` | approach counter starts the timer, ki boost, curve with the full cell then the miniature, no native dragon, deck landing |
| `item` | Fly from the item ring: Goku's icon tiles and palette 5, no drum animation, `$0C80` request, 104 frames to world flight |
| `radar` | 15 real-save quest states against the browser's target, count and text; live Fortress-to-Beast label update |
| `map` | globe and flat-map navigation; both forms' palettes from the first visible return frame, sprite tiles, effect colours, radar and ki afterward |
| `timing` | real NMI frame counts, complete-NMI duration, palette and sprite checks; `--repeat=5` measures 5,770 frames, `--scene=` selects another world fixture |
| `aura` | real L / L+Y from the flight preset, cold uploads, both forms, travel/steering, transform/revert; every frame compared with the browser sprite layer, raster pairs, CPU/NMI timing, DMA safety, complete OAM scanline budgets |

All 14 world cases, terrain machine-code comparisons, Fortress cutaway,
core world/HDMA/live checks and boot pass after the map-return fix. Earlier
module integration results are recorded in the changelog.

## Known differences from the browser

- The planet cutaway and damaged-deck collapse are implemented by the
  ending/Frieza modules; world supplies their timeline and story handoff.
- Craters are 8-px Mode 7 cells from 32 shared characters (cells under
  24/64 opaque keep the terrain), not a per-pixel scaled image.
- The explosion draws a third of its 20 sparks per frame (each spark every
  third frame); the charge sparks' target updates every four frames.
- Optional effect sprites are dropped in a frame that runs past line 208.
- The Fly icon follows the palette 5 tint (status colours) and is not used
  for player 2's ring.
- Everything was verified in Mesen2 only, not on real hardware.

## Core requests

Core now offers `modules_world_cgram_upload` at the native palette transfer
(`C0:8A89`), with `core_world_cgram_native` for byte ranges from the selected
world buffer. Frieza's flyby uses it to keep its displayed OBJ colours and
distant-ball backdrop through lag vblanks. Normal world transfers retain
their original enable gates, buffer selection and full-palette path; the
world module needs no callback or frame-thread copy. See
[the core contract](../snes-rom.md#modules-and-core-api) and
[Frieza's flyby](frieza.md) for the forced-lag regression coverage.

- `core_oam_add` culls 16×16 sprites to y ≥ -64; OAM Y is 8 bits, so a
  sprite between -64 and -16 wraps to the bottom of the screen
  (`world_fx_back` pre-culls to [-16, 224)).
- A batch or reserved-slot variant of `core_oam_add` would make effect-heavy
  modules cheaper (each call is ~70 instructions).
- Test builds with `-DGOKU_TRACE` write their trace at `$7E:7F00`, which is
  `!RAM_WORLD`; the world frame returns early in those builds.
- FastROM is enabled; the native world loop, compass and helper calls now
  also use its fast mirrors.
