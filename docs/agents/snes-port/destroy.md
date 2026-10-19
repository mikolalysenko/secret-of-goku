# DESTROY module: destructible scenery, barriers, orbs, dungeon demolition and the Sandship

Spoilers. Part of the [SNES cartridge port](../snes-rom.md) ([plan](plan.md)).
Source: `snes/src/modules/destroy/`, generator `snes/gen/destroy.mjs`, tests
`snes/test/destroy/`. Browser references: `engine/native-plants.js`,
`engine/native-local-flight.js` (`breakScenery`), `engine/palace-braziers.js`,
`engine/dungeon-geometry.js`, `engine/dungeon-demolition.js`,
`engine/native-barriers.js`, `engine/breakable-doors.js`,
`engine/native-orbs.js`, and for the Sandship `engine/sandship.js` and
`engine/sandship-wreck.js`.

Goku's punches, kicks and beams break what the boy's weapons could, through
the game's own cut-map pipeline: the module edits the collision grids, raises
the native row redraw and cut sound, starts the original (or story-authored)
events of gates, locks and switches, and with the full Super Saiyan beam
melts dungeon partitions and shatters palace braziers. Nothing is painted
over the screen: every change is native map data, so collision, redraw and
the scroll loader all agree. The module also runs the Sandship arc (the
KAMEHAMEHA breakout, the wreck, the rescues and the crash; below), which
does draw: palettes, an HDMA breach and fires through the effects library.

## Resources

| Resource | Use |
| --- | --- |
| Code `$A4:8000-$A4:DAAC` | `!CODE_DESTROY` (about 22.7 KiB of 32) |
| Data `$E4:0000-$E4:62CB` | `!DATA_DESTROY` (about 24.7 KiB of 32, all generated) |
| Extended data (xdata, placed by the build; `$7D:0000-$7D:40FF` today) | `destroy_white`: the Sandship white-out tables, 13 levels (9,984 bytes); `destroy_sand_quads`: the breach's desert for channel 3 at each white level (6,656 bytes) |
| WRAM `$7E:D980-$7E:D9FF` | `!RAM_DESTROY`: state words `+$00-$0F`, API arguments `+$10-$23`, beam scan memory, map context, outputs `+$36-$3F`, call-local scratch `+$40-$7F` |
| SRAM `$31:6100-$31:6173` | `!PERSIST_DESTROY` (`$74` of `$80` bytes): broken doors, Mana Tree cloud barrier, the Sandship state (`+$10-$4B`), all saved with the GAME FILE by the core sidecar; a beam's unfinished hit work (`+$4C-$73`, cleared at load, new game and map changes) |
| SRAM `$33:7000-$33:77FF` | `!SRAM_WORK_DESTROY`: edit queue, settled runs, smashed-object list, tile classes, breach records, planner job and suspended plan, scratch, barrier/orb state, debug mailbox, planner scratch, effect record (layout in `module.asm`) |
| SRAM `$32:7600-$32:7FFF` | `!SSW`, the Sandship's volatile work: the tail of the set-piece scene area (`!SRAM_WORK_SCENE`, core request below), used only inside the arc's window (no scene runs on the ship) and claimed with a magic word: object-list copy, staged colours, the breach's HDMA tables and data, fire sites, clock |
| CGRAM | The wreck's staged colours go up inside the game's own CGRAM upload (`C0:C0F0`); CGRAM 0 per scanline under the breach (HDMA), put back when the breach lets go |
| HDMA | Channels 2 and 3 (indirect) while the breach is on screen, taken only while `$2C` bits 2/3 are clear and given back on fades, the ring menu or another owner |
| VRAM, OAM | None: redraws go through the native row request; the fires are drawn by the effects library |

The demolition and barrier work runs on the main thread (field frame and
the C0:C7C3 redraw consumer). The Sandship adds a field vblank callback
(the breach's HDMA) and the CGRAM upload hook.

## Original code patched

| Address | Bytes | Replaced | Purpose |
| --- | --- | --- | --- |
| `C0:C7C3` | 4 | `SEP #$30 / LDA $2E` | Start of the native row-redraw consumer: `destroy_redraw_hook` applies one queued row group and raises `$82/$83` (and `$95`) exactly where the browser mod applies its edits, then re-executes the replaced instructions |
| `C0:CC2D` | 4 | `LDA $7ECF00,X` | Map piece loader, the story flag gating each piece (8-bit, DB = `$7F`, record at `[$20]`): `destroy_piece_flag` returns it unchanged except for Watts's shortcut entrance on map 73 (record `C8:5A8D`, `CF14` 6..15), which reads as if its range were 0..15 once the Gaia shortcut door broke (`native-story.js` `storyRead` of `C8:5A8E`); `CF14` itself is untouched |
| `C1:E7DF` | 25 | the door event's record loads from `C8:3000+4*door` (map, x, y/layer) | `destroy_door_record`: the Sandship's escape door (1A9) reloads the room Goku stands in during the breakout; then `!DOOR_RECORD_HOOK` (another module's JSL, below); then the original stores to `$DC/$DE/$DF`. `!DESTROY_DOOR_HOOK = 1` marks the patch |
| `C0:C0F0` | 4 | `LDA #$00 / STA $2121` (start of the field NMI's 512-byte CGRAM upload, `C0:C0F0-C117`) | `destroy_palette_dma`: the Sandship's staged colours replace their range of the upload, the rest comes from the game's buffer as before (only the BG half on a lag vblank, so fx's OBJ palettes stay); returns to `C0:C118` with the original's registers |
| `C3:0004` | 4 | `JMP $0160` (the sound driver entry) | `destroy_song_hook`: while wrecked, the ship's song (25h) becomes the boss battle alarm (`01 04 04 FF`), so the change lands with the room's own fade |

Dispatch (`snes/src/modules.asm`): `modules_field_frame` →
`destroy_field_frame` (after the other modules' logic, before `fx_frame`:
its planner and the wreck's budgeted work use the time the frame has left),
`modules_field_nmi` → `destroy_field_nmi` (first: switches the breach's
HDMA on while vblank lasts), `modules_ring_frame` → `destroy_ring_frame`
(lets go of the HDMA), `modules_title_boot` → `destroy_title_boot`,
`modules_world_frame` → `destroy_world_frame`, `modules_load` and
`modules_new_game` → `destroy_reset`. Events start through the field
dispatcher `C1:E76D` under the same idle conditions as
`core_event_request` (and only while no core request is pending).

## Native structures

| Structure | Use |
| --- | --- |
| `7F:0000` / `7F:4000` | 128×128 metatile grids, BG1 / BG2 collision layers (`$4000` bit = layer 1) |
| `7F:B800` / `7F:BC00` | 4-byte descriptors per metatile and layer: flags (bits 0-2 height/solid, 3 trigger wall, `$60`), behaviour (bit 7 walk-on trigger), code (`Cx` cuttable with sound kind `x`, `Fx` hit event), replacement |
| Map header `C8:7000+2m` | tileset (`&63`), `$40`/`$80` second metatile bank per layer (metatile = tile + 192) |
| `$C0/$C2`, `$AA/$AE`, `$A8/$AC` | map size in pixels; BG1/BG2 vertical and horizontal scroll (screen position of a row) |
| `$82` / `$83` | row redraw request: 1 = BG1, `$80` = BG2 / screen Y; consumed by `C0:C7C3` when the scroll queue `$2E` is idle (`C820` path) |
| `$95`, `$118/$119` | sound request (bit 7 pending; cut kind `$D8+x`) and its pan |
| `$D0-$D4`, `$3A`, `$E181,X` | event running / script pointer / actor of the event; spell byte an orb's element test reads |
| `$7E:CF00-CFFF` | story flags (gates read their progress; the palace combination is `CF42 = 3`) |

**Redraw path.** `destroy_hit` only queues edits (`!DQ`, 88 entries of 8
bytes: offset, original tile, replacement, flags and behaviour at queue time,
policy/replay/demolition/breach meta, frame). At `C0:C7C3`, when `$82` and
`$2E` are idle and Goku stands on the field (`native-plants.js` `ground()`),
`dst_apply_row` takes the first live entry, re-checks every entry of the same
layer and row against the live map (`queuedTile`: same tile, same flags; a
demolition entry also checks its breach's four witness cells), writes the
grid bytes, requests the native redraw of that screen row (rows outside the
screen are left to the scroll loader) and starts the cut sound of the first
audible edit with its pan. One row group per frame, as in the browser.
Entries older than 90 frames, or all of them when the field stops being
idle, are dropped.

**Smashed objects** (`!DC`, 32 entries): solid objects, trigger walls,
braziers and demolished walls of the current map are remembered with their
original bytes; when a native rebuild (an event, a door, a room redraw)
restores one, the edit is replayed silently. Plants (policy 0) respawn
natively, as in the browser. The list is per map.

## Catalogue

Every rule comes from the browser engine through the generator (exported
data imported, private constants recovered by probing exported functions and
asserted), or from the cartridge.

| Destructible | Rule on the cartridge | Data source → table |
| --- | --- | --- |
| Plants, rocks, stalagmites, pillars, pots | Descriptor code `Cx` with a replacement other than itself; punches/beams take the multi-stage objects to their final stage (`eligible`, `breakable`, `chain`) | Live descriptors (`7F:B800`); policy rules from `native-plants.js` |
| Tall grass / C1 replacements | Cut silently when only `C1` replacements are in the row | as above |
| Haunted Forest vines | Tileset 7, layer 0, code 0, vine metatile → grass `7A` | `breakScenery` probe → `destroy_vine_bits`, `!DESTROY_VINE_*` |
| Skull heads | Tileset 1 twin heads (`C1`, tile + replacement = 343) → `A1` | `breakScenery` probe → `!DESTROY_HEAD_*` |
| Sandship deck rail | Maps 98/99, row 9, the rail tile with clear floor above and below → `0A` | probe → `!DESTROY_RAIL_*` |
| Palace braziers | Tileset 23, layer 0: complete 2×3 patterns only, the whole object or nothing; full beam (and plain beams on the brazier-beam maps) | `palace-braziers.js` → `destroy_brazier_patterns`, `destroy_brazier_part`, map bit 0 |
| Ki barriers (12) | Authored rectangles: Gaia shortcut, Underground Palace, Earth stair burner, Haunted Forest gate and bridge, Elinee's castle, Northtown castle, Gold Tower, Shade cave door, Pure Land gates 1-3; flag progress, `beamOnly`, `repeatUntilOpen`, door link, reaction | `native-barriers.js` `kiBarriers` → `destroy_barriers` (20 bytes each, map order) |
| Native hit tiles (12 sources) | `Fx` codes: source = replacement×16 + `x`, event by source and map (hit switches, one per beam) | `barrierHitEvent` → `destroy_hit_events` |
| Floor plates (41) | Walk-on triggers (behaviour bit 7) the band touches start their trigger event | `barrierFloorEvents` → `destroy_floor_events` |
| Grand Palace buttons | Sources `565-568` → event `56B` only at `CF42 = 3` | asserted rule → `!DESTROY_COMBO_*` |
| Breakable doors (3) | Gaia shortcut, Pandora ruins exit, Northtown ruins seal: the barrier event breaks them for good (`!P_DOORS`) | `breakable-doors.js` → `destroy_doors` |
| Story-authored barrier events (10) | Event ids whose retail table entry is an END byte (`6C`, `6D`, `8C`-`8E`, `9D`-`A0`, `15B`) run the compiled script unless story already routed the event | `story-events.js` → `destroy_scripts`, `destroy_script_table` |
| Crystal orbs (15 events) | Actor type `$55` in slots 3+: its own event with the spell byte its element test expects in `$E181,X` | `native-orbs.js` → `destroy_orb_events` |
| Dungeon walls (22 families) | Full beam only: ordinary walls between two same-height floors, both layers, never boundaries, triggers, protected cells or transitions (below) | `dungeon-geometry.js` → `destroy_map_info`, `destroy_air_bits`, `destroy_blank_zero`, `destroy_false_floor`, protection constants |
| Mana Tree cloud barrier | World flight: `destroy_tree_barrier_break` remembers it and opens the landing lock (`$E3` bit 6) | `world-ki.js` |

Map context (`destroy_map_info`, 512 × 8 bytes): header flags, dungeon family
+ 1 when demolition applies, bits (brazier-beam map, Sandship, complex
placement, Joch / Water Palace protection, ki barrier, door map, scenery),
first barrier record, placed extents per layer.

## Runtime

**Hit scan** (`scan.asm`). Attacks are cardinal bands: along `[-8, len+8]`,
across `≤ width(along)+8` with the full beam's taper
`width = half × min(1, (along+8)/taper)`. Cells are visited in the browser
order (along, then row, then column). A beam keeps its `arg_id`; each call
only visits cells the beam did not cover before (`d_aid/d_alen/d_ahalf`), so
a growing beam costs only its new cells. A tile class table (4 bits per
metatile and layer, computed on first use and forgotten after each map load
and event) rejects cells that cannot matter without decoding them.

**Barriers** (`barriers.asm`, `native-barriers.js` `hit()`): punches always,
beams at ≥ 85% charge (`arg_str ≥ 218`); one barrier per beam. Authored
rectangles first, then the nearest native target in the band (hit tile,
floor plate, locked door, palace combination; nearest by distance to the
cell corner, ties in scan order), searched incrementally like the scan. A hit
waits 26 frames, then starts the event at an idle frame boundary; a
`repeatUntilOpen` gate repeats until its flag reaches the open value. Story
routes the doors' trigger events on the `DOOR_*` queries below.

**Orbs**: `destroy_orb_hit` validates the actor (slot 3+, active, type
`$55`, event in the orb list) and at the next frame boundary writes the
spell byte to `$E181,X`, sets `$3A` and starts the orb's own event.

**Demolition** (`demolish.asm`, `dungeon-geometry.js` `breach()`). The full
beam's covered band becomes a planner job (one per beam id; a wider band
walks again, a longer one extends the walk). The walk visits the band with a
cursor; for each ordinary wall cell (class table, not queued, not in a run
already settled for this walk) it plans the run along the beam axis: at most
ten walls between two floors of the same height (`span`), the incoming
shore, the floor sample (breadth-first over matching floor within Manhattan
distance 4, best 3×3 score, partner-layer rules), the layer rules for every
run cell, then four witnesses and the edits (each wall → the sampled floor
tile, its partner on the other layer → the floor's partner tile). The floor
sample may stop between nodes when the frame runs out of time and resume
the next frame; queued rows wait while a plan is open so a plan sees one map.
After rows are applied while the beam is still firing, the walk restarts
(the browser replans every frame). Protected cells: the Joch trial and Water
Palace rules, always on both layers.

**Frame budget.** Background work (the walk, the floor sampler, finishing a
sampled plan, warming the class table) runs while `dst_budget` allows: a
field frame that began in the visible part may work until scanline 160, one
that began in vblank (the previous frame ran long) until line 160 of the
next frame, one that began between the two not at all. A suspended plan
that waited three frames gets one sampler node anyway; a plan whose sample
completes without time left is finished the next frame. Planner work ends
by about line 206 at worst (one sampler node is the largest step).

**Cost of a call.** `destroy_hit` scans only the cells a beam newly covers.
Runs of band cells are skimmed through the tile class table (about 60
cycles a cell; the barrier search skims with a stricter filter: hit codes
and walk-on triggers only); a widening beam visits only the new side strips
of rows it already covered, column by column; classes are computed on first
use and warmed in spare frame time.

**Amortised growth.** A full wave's band grows over its first frames, and
scanning all of it in one call cost one frame several hundred scanlines
(combat's integration measured ~600 SlowROM / 219 FastROM). A beam
(`arg_id` ≠ 0) is now covered in growth steps of about
`!DESTROY_STEP_CELLS` (16) new cells: the covered length widened to the
requested width first (8 px at a time), then longer at that width. A call
makes at least one step of the band scan and one of the native barrier
search, and more while it is younger than `!DESTROY_HIT_SPAN` (16)
scanlines; what is left (`!hp_left`: bit 0 band, bit 1 barrier) waits for
the beam's next call or, if the beam stops calling, for
`destroy_field_frame`'s continuation from the saved arguments
(`dst_hit_continue`, `!HP` block), dropped when the field stops being idle.
`!hp_worked` prevents the continuation from repeating an attack's scan in
the same field update. It is cleared after `destroy_field_frame` and on
map/load initialization. Comparing `core_frame` values was insufficient:
combat records the counter before the core increments it, while this
continuation runs afterwards. The gameplay suite watches both scan parts
per attack across the whole native field loop, including lag frames.
Each step goes through the same skim/visit code as a one-shot call, so the
cells and their order are unchanged. Measured (FastROM): the largest single
call of combat's full wave 84 scanlines (was 219), the Wind Palace wave 45
(was 100), calls over covered ground 4-5.

## Sandship runtime

`sandship.asm` (the arc: `engine/sandship.js` `createSandship`, and the
object, door and song parts of `sandship-wreck.js`), `wreck.asm` (the
wreck's look), `fire.asm` (its fires). State: `!SS` in the persistent block
(saved with the GAME FILE, as the browser's snapshot), `!SSW` volatile
(above). The arc's window: stages (`CF28`) 1-13, a white-out, the wreck or
its ending, stowed gear, or Goku on a ship map (98, 99, 270, 271, 318, 319,
324, 339) or the dunes (91); outside it nothing touches `!SSW` and the
vblank side lets go. Goku only (`persist_goku_active`).

**The arc.**

- The capture (story hook `SANDSHIP_CAPTURE`, entering 28B) stows each
  member's equipped slots (`$1E0-$1E3`); `returnGear()` gives Goku his back
  once the ship is wrecked (or the arc ends) and each companion theirs as
  soon as they are back after being held.
- Sergo's plan (`SANDSHIP_WAVE`, entering 75) arms the wave: Goku hints at
  L+Y once it is quiet (remark 2).
- A full-power wave below deck while captive (a `destroy_hit` beam,
  charge ≥ 85%, stages 1-6, the hold, kitchen or engine room) breaks out;
  a weaker one says "Too weak!" once armed (remark 1). `findBreach` walks
  the wave's line for the wall it tore through and puts the breach 44-74 px
  ahead (at most 50 downward, clear of the HUD).
- The white-out: the screen whitens over the browser's ramp, Goku holds
  still (pad mask), then the escape door (1A9) reloads his own room through
  the door loader (`C1:E7DF`) as the wreck: fled soldiers, guards and the
  freed crew (168, 182, 183, 196, 201) are left out of the object list
  (story hook `OBJECT_LIST_SANDSHIP`), up to three desert monsters (28, 36)
  are appended and placed on spread floor spots once the room's collision
  is loaded (`OBJECT_SANDSHIP`), and the room fades in from white. A
  planned breakout (Sergo's) plays his scripted reaction (78).
- Every room load while wrecked sends the boss battle alarm instead of the
  ship's song (`C3:0004`).
- Rescues: walking into the kitchen (319) or the cabin (339) starts that
  captive's rescue (295, 29C). The deck with both back starts Geshtar (77,
  `SANDSHIP_DECK`), otherwise one reminder (remark 3); stage 11 on the
  deck starts his fight (29E).
- Bulkheads: each strike that opens one while the arc is unfinished (a
  demolition row, one count per strike 40 frames apart) weakens the ship:
  King Kai warns at three (remark 5), five blow it up.
- Unplanned departures: a map change off the ship nobody planned, the roof
  takeoff (flight's L+R, `SANDSHIP_TAKEOFF`) or flight's hull rule set
  `escaped`; once Goku can be moved, "Uh oh" (remark 4) and the crash.
- The crash (event 7D, `SANDSHIP_CRASH`): blasts around Goku every 10
  frames while aboard, the white-out, Geshtar's ambush, the Mech Rider
  (340). After the fight (2A1) everyone reunites on the dunes with their
  own gear; stage 12 closes the wreck.
- The dunes after the arc are a closed basin: leaving them any other way
  than 2A8 sets stage 14 and King Kai repeats the hint (remark 6).

**The wreck's look** (`wreck.asm`; the browser composites pixels, the
cartridge changes colours and uses the PPU):

- White-out: all of CGRAM blended toward white (`out + (255 - out) *
  white`, 13 levels, two table lookups per colour, tables in extended
  data). The field frame transforms the game's palette buffer (`$7E:0600`,
  `$BE00` while `$2A` is set) into `!SS_STAGE` in 32-colour chunks; the
  made part replaces its range of the game's own CGRAM upload (`C0:C0F0`),
  so the white rides through the escape door's fade like the browser's.
  The game's buffer is never modified.
- Alarm tint: BG palettes 1-7 (colours 16-127) red up, green and blue down
  by the browser's 120-frame alarm pulse and its firelight flicker (one
  value for the screen, the centre block); text and HUD colours (0-15) and
  sprites keep theirs.
- Breach: HDMA channel 2 (indirect, mode 1) sets window 1 per row of the
  outline (16 quantised phases of its jagged edge, from the generator), so
  BG1/BG2 are masked there; channel 3 (indirect, mode 3) writes CGRAM 0 per
  row, the desert's sand scrolling 1.5 px a frame (one colour per row). The
  rows' window positions are remade only when the breach's screen x changes
  (vertical scrolling only moves the pointer); the sand of each white level
  is copied from extended data (128 bytes a frame) when the level changes.
  Sprites (fires, monsters, Goku) and BG3 stay in front. CGRAM 0 gets the
  game's colour back when the channels are given up.
- Fires: per room load, 7 sites (10 in the hold, the decks and the
  corridor) spread over the floor and five on the breach's rim; each an
  Exploder flame swelling every 7 frames and a Fireball ember rising,
  drawn through fx (`fx_draw`, `FX_CELL`). Every 150 frames one site
  explodes (`FX_EXPLODE` burst, quake, the Fortress-break sound); the
  crash's blasts have three bursts.

**Frame time.** fx's work for a draw runs after this module (in `fx_frame`)
and is large: about 9 scanlines per Exploder flame, 5 per Fireball ember,
9 more once anything is drawn, 18-33 per burning burst. So the wreck's work
is split into a fixed part every frame (the arc's tick, the clock, the
transform choice and the breach's tables: about 10 scanlines; 8-12 more
when the breach's screen x changes) and a budgeted part: one palette chunk
(more during the white-out, when Goku is held), then fire draws, each only
when it and fx's estimated work for this frame's draws and blasts end
before scanline 214 (`ss_room`; a frame that began in vblank works to that
line of the next frame). A starving palette pass gets one chunk after 8
frames if it still ends before line 221. A busy frame shows fewer fires
(they take turns from a rotating start) and a slower tint.

**Deviations from the browser.**

- Forced-blank load frames are black on hardware: the white dims through
  the native fade instead of staying white.
- Colours are transformed by tables: 13 white levels; the tint's offsets
  are whole steps and the flicker is one value for the whole screen.
- The breach: one sand colour per scanline (the browser's varies along the
  row too), the outline's 16 edge phases, no soot or scorch drawn into the
  floor.
- Fires: as many as the frame has time for (typically 2-5 flames, fewer on
  busy frames); a blast is one burst in the wreck (five in the browser) and
  three during the crash; no smoke; bursts sit at the spiral's 6-frame
  spread; Exploder cells are not mirrored; the exploding site follows a
  fixed pseudo-random order.
- `findBreach` tests one tile per step with `shipHull`'s `walk()` rule (the
  browser asks flight's 12×8 `canLand`, for which flight exports no entry).
- Remaining lag in the wreck comes from frames whose own logic already
  ends late: measured in the hold over 240 frames from one savestate (idle,
  then walking), 235 completed logic frames with the wreck's look and 239
  without it.

**Flight bindings** (flight's `bind.asm`, included after the modules; all
JSL):

| Define | Routine | Contract |
| --- | --- | --- |
| `!FLIGHT_MISSING_FLOOR` | `destroy_ss_floor_hole` (built when flight is) | M16/X16, DB = `$7E`, `!fl_q_x/y` set: carry when the breach lies under one of `supported()`'s nine footprint points (x −6/0/6, y −4/0/4), wrecked, Goku on, in the breach's room, inside the drawn outline's rows. A provider defined before it (Frieza's deck, flight's test hole) answers everywhere else (chained with `:=`) |
| `!SANDSHIP_TAKEOFF` | `destroy_ss_takeoff` | L+R aboard: carry when the ship takes it as an unplanned departure (stages 1-9, no white-out): it blows up instead of the takeoff. Flight's hull rule (`outside()`, flight's) calls it too |
| `!SANDSHIP_HULL_KEY` | `destroy_ss_hull_key` | A = a word that changes when the ship's floor may have (room loads seen while wrecked, bulkheads broken): `shipHull()`'s cache key |
| `!STORY_QUERY_SANDSHIP_DOOR` | flight's `fl_story_ship_door` | flight owns `flyThroughDoor` and `unstick`; `destroy_ss_q_door` (answers none) is only the fallback when flight is absent |

## API for other modules

All entries: `JSL`, P = M16/X16 on entry; they set their own DB where noted.

| Entry | Contract |
| --- | --- |
| `destroy_hit` | One attack against the map, once per frame per attack while it lasts. Fill `!arg_*` (WRAM `$7E:D990-$7E:D9A3`): `arg_x/arg_y` origin in map pixels (Goku's `$E002/$E004`, or the beam's start), `arg_dir` 0 down 1 right 2 left 3 up (Goku's facing index), `arg_len` reach in pixels (≤ 640), `arg_half` half width (≤ 80), `arg_taper` 44 for the full Super Saiyan beam else 0, `arg_kind` 0 punch/kick, 1 ki blast (no map effect; orbs only), 2 beam, 3 full Super Saiyan beam, `arg_str` charge 0-256 (punches 256; barriers need ≥ 218), `arg_id` 0 for one-shots, else one non-zero id kept for a beam's whole lifetime and changed for the next beam (ids may wrap, but never reuse the previous beam's), `arg_layer` 0/1 or `$FFFF` = Goku's (`$E00B` bit 7). Any DB. Returns A = bit 0 tiles queued, bit 1 a barrier/switch was struck (its event follows), bit 2 queue full (call again next frame with the same id). Does nothing unless Goku is on the idle field (`native-plants.js` `ground()`) |
| `destroy_orb_hit` | An attack touched actor X (offset from `$7E:E000`, e.g. `$0600` for slot 3). Carry set when it is an orb and its event was queued (one at a time). Any DB |
| `destroy_tree_barrier_break` | World flight: a full wave reached the Pure Land cloud barrier |
| `destroy_ss_takeoff`, `destroy_ss_floor_hole`, `destroy_ss_hull_key` | Flight's Sandship bindings (table in the Sandship section) |
| `!DOOR_RECORD_HOOK` (define, set before this module is included) | Another module's JSL inside `destroy_door_record` (`C1:E7DF`): M16/X16, D = 0, the game's DB, X = 4*door, A = record bytes 0-1, Y = bytes 2-3 (after the Sandship's escape-door override); returns A/Y, keeps X. Frieza's `frieza_door_record` uses it. `!DESTROY_DOOR_HOOK = 1` says the patch is in the build |
| `destroy_field_frame` / `destroy_field_nmi` / `destroy_ring_frame` / `destroy_title_boot` / `destroy_world_frame` / `destroy_reset` | Dispatch only (above) |

Typical calls: a punch or kick at contact: `len 28, half 9, taper 0, kind 0,
id 0`. A ki beam, every frame while it extends: `len` its current length,
`half 5 + 14×charge` (≤ 19), `kind 2`, its id. The full beam, every frame:
the `mana-mod.js` timeline (point-blank `len 28, half 9` at release, then
`len = min(640, (age+1)×48)`, `half = 80 × min(1, (age+1)/6, life/10)`,
`taper 44`, `kind 3`). The cost of a call is proportional to the cells the
band newly covers.

Outputs (read and compare; WRAM unless noted):

| Output | Meaning |
| --- | --- |
| `!out_rows` (`$7E:D9BA`) | applied non-replay rows (wraps) |
| `!out_sfx` (`$7E:D9BE`) | impact requests (wraps), one per applied row |
| `!out_demo` (`$7E:D9BC`) | `!core_frame` of the last demolition row (Sandship `onDemolish`) |
| `!out_react` / `!out_rmap` (`$7E:D9B6/B8`) | reaction id of the last broken barrier or first breach per dungeon family and its map (radio `defeatedBarrier`; names in `dist/snes/gen/destroy/reactions.json`: 1-15 barriers, 16-37 `dungeon-wall-<family>`) |
| `!FX_SEQ`, `!FX_KIND`, `!FX_X`, `!FX_Y` (SRAM `$33:77F8-$33:77FF`) | effect record for an effects module: `FX_SEQ` increments per record; kind 1 rubble burst at the centre of an applied demolition row, 2 brazier burst at a shattered brazier (once per object); map pixels. Colours as `dungeon-demolition.js` (room palette shades) |

Story queries answered (`!STORY_QUERY_*` in `module.asm`):
`DOOR_GAIA_SHORTCUT`, `DOOR_PANDORA_RUINS_EXIT`, `DOOR_NORTHTOWN_RUINS_SEAL`
= the broken-door bits; `SANDSHIP_CRASH` (the crash ending),
`SANDSHIP_WRECKED`, `SANDSHIP_PLANNED` (Sergo's plan, for the breakout's
reaction), `SANDSHIP_DOOR` (fallback; flight answers it). Story hooks:
`SANDSHIP_CAPTURE` (28B), `SANDSHIP_WAVE` (75), `SANDSHIP_DECK` (77),
`SANDSHIP_CRASH` (7D), `OBJECT_LIST_SANDSHIP` and `OBJECT_SANDSHIP` (the
wreck's object list and monster placement). Each definition is kept when
story (or a story test build) defined it first.

Sandship remarks for a radio module (the browser's `mod.radio` lines;
nothing is drawn here): `!ssw_remark` holds the last one, `!ssw_rseq`
increments per remark, `!ssw_dismiss` increments when the Sandship lines
should be dismissed (`radio.dismiss('sandship')`). 1 "Too weak! I have to
charge it all the way.", 2 "Hold L and Y to charge ... KA... ME... HA...",
3 "Not yet! My friends are still down below.", 4 "Uh oh. I think I broke
the whole ship.", 5 King Kai's "Goku, STOP! The ship can't take much
more", 6 King Kai's "Goku! North to Kakkara, then west to the Fire
Palace." (`!SS_SAY_*`; `!SSW` is valid while `!ss_work` holds
`!SS_WORK_MAGIC`).

## Persistence

`!PERSIST_DESTROY+0` bit n: breakable door n broken (0 Gaia shortcut,
1 Pandora ruins exit, 2 Northtown ruins seal); `+1` bit 0: Mana Tree cloud
barrier broken. Both are saved with the GAME FILE (core sidecar) and cleared
for NEW GAME. `+$10-$4B` (`!SS`): the Sandship's state as the browser's
snapshot (flags, bulkheads broken, the white-out and its room, the breach,
the stowed gear), saved with the GAME FILE; its volatile words (`!ss_vis`,
`!ss_work`, `!ss_own`) are cleared at load, new game and the title.
`+$4C-$73` (`!HP`): a beam's unfinished hit work, cleared at load, new
game and map changes. A broken Gaia shortcut door also keeps Watts's entrance piece
on map 73 (`C0:CC2D` above). Everything else is per map visit, as in the browser
(`native-plants.js` keeps `cleared` per map): the queue, smashed objects,
breaches, the planner job and pending events are reset on every map change,
load and new game. Gate and switch progress lives in the game's own flags.
All SRAM work state is initialised on the first frame (power-on SRAM is
arbitrary).

## Debug and test entry

Lua tests write the arguments, then `!dbg_cmd` (SRAM `$33:7720`); the
command runs at the next field frame and `!dbg_n` increments:
1 `destroy_hit` with `!arg_*` (result in `!dbg_res`), 2 start event
`!dbg_arg` (e.g. `$800|door`), 3 `destroy_orb_hit` for actor `!dbg_arg`,
4 run the event script in `!dbg_script` (the QA door loader `04 18 hh ll 05
00`), 5 plan the breach of wall offset `!dbg_arg` for `!arg_dir` without
queueing (planner words stay in WRAM), 6 count a Sandship bulkhead strike,
7 `story_api_request(!dbg_arg)` for actor `!ssw_dbgactor`, 8 the wreck's
floor hole under the footprint at (`!arg_x`, `!arg_y`), 9 the Sandship
takeoff binding. `!dbg_ev`/`!dbg_evn` record the last event this module
started; `!ssw_dbgdoor`/`!ssw_dbgrec` replace one door's record once (the
browser spec's `enter()`).

## Tests

`SNES_ROM=dist/snes/secret-of-goku.sfc node snes/test/destroy/run.mjs
[scenario ...]` (Mesen; bundles from `.local/snes-import`; the Sandship
scenarios also run alone with `node snes/test/destroy/sandship.mjs`). Each
case runs on a private copy of the ROM (`checkpoints.mjs` `privateRom`), so
Mesen starts it with fresh battery RAM (Mesen fills it at random). Each
scenario fills the module's SRAM work area with a fixed garbage pattern,
sets the persistent live block as a GAME FILE with an empty sidecar leaves
it (zero, version 1, Goku arrived: a browser bundle carries no
cartridge-side state), imports a browser state, fires the attack (full beams as the per-frame timeline), and
compares the grids, redraw requests and cut sounds with the JavaScript
reference (`reference.mjs`, the browser modules on the same memory) or the
event the reference selects; walking checks prove collision.

| Scenario | Checks | Status |
| --- | --- | --- |
| `bush-control`, `bush-punch` | Potos-area clearing: blocked, then one punch clears the bush stack and Goku walks through | pass |
| `bush-mega`, `bush-beam-steps` | full beam band; a growing beam scanned in steps equals the one-shot result | pass |
| `grass-punch`, `grass-beam` | Rabite field tall grass (silent `C1`) | pass |
| `vine-control`, `vine-punch` | Haunted Forest vines (no cut code) | pass |
| `bg2-objects` | multi-stage objects on BG2 | pass |
| `bush-mega-timeline` | the full beam frame by frame over the Potos clearing (widening band, side strips): the same 19 edits | pass |
| `demo-earth`, `demo-witch`, `demo-undine`, `demo-fortress`, `demo-pure` | demolition timelines: identical edits, redraws (as multisets) and sound kinds; effect record | pass (exact; `demo-fortress` occasionally differs in one run's floor tile when other modules' frame costs move a plan, then passes the structural check below) |
| `brazier-water` | three braziers shattered (Water Palace, protected map), one burst each | pass |
| `demo-wind`, `demo-bg2`, `demo-ship` | Wind Palace, Lost Continent (Goku on BG2), Sandship hold: timing-sensitive. Any demolition timeline that does not match exactly must still open only walls the browser opens on the beam's layer (replacement tiles and the partner layer may differ); the number of differing edits is printed | pass, with differences: Wind Palace, the scene's boss intro starts 33 frames in and drops the queue before the cartridge's second breach (the browser plans it on frame 3); Lost Continent and Sandship, walls planned some frames after the browser's every-frame replan see neighbouring breaches applied and sample other floor tiles (Sandship: one run's partner cells) |
| `gate-forest`, `gate-bridge` | Haunted Forest rose gate (punch → retail event `1EF`) and bridge gate (`6DA`); Goku walks through | pass |
| `gate-gaia` | Watts's shortcut (map 73), entered closed: a charged beam breaks the door, prep event `6C` reveals the entrance (12 cells), re-entering the map keeps it open; no story flag changes | pass |
| `gate-witch` | Elinee's castle three-person gate: charged beam → authored event `8C` | pass |
| `switch-gaia` | Gaia's Navel switch from a ranged beam (`F` tile `1AF` → `1AC`) | pass |
| `beam-earth-tile`, `beam-earth-timeline` | the full beam's native target in the Earth Palace (event `6F2`), as the browser picks it, for one call and frame by frame | pass |
| `orb-earth` | Earth Palace orb: event `239` with spell byte `06` | pass |
| `ship-wave-hold` | a full-power wave in the hold while captive: white-out, the hold reloads with the guards gone and monsters in, the boss alarm plays, Goku gets his Gi back | pass |
| `ship-rescues` | the wreck's rescues: walking into the kitchen and the cabin, then the deck starts Geshtar and the Mech Rider (party 3). The cabin's tile load wrote the core's event request word while it lived at `$7E:6E8E` (core request below): the test keeps the word as it was and reports the writes | pass |
| `ship-crash-breaks` | still sneaking: a punch opens a hold bulkhead (one strike), four more blow the ship up into the Mech Rider; after 2A1 everyone reunites on the dunes with their own gear | pass |
| `ship-leave` | an unplanned door off the ship blows it up: Uh oh, the crash, the Mech Rider | pass |
| `dunes-exit` | leaving the dunes any other way than 2A8 sets stage 14 and repeats the hint | pass |
| `ship-plan` | Sergo's plan arms the wave, Goku hints at L+Y, the wave wrecks the ship as the planned breakout (reaction 78) | pass |
| `ship-look` | the white-out whitens all of CGRAM through the escape door and fades into the wreck: BG palettes 1-7 tinted, text/HUD colours (as uploaded in vblank) and sprites untouched, the breach on HDMA channels 2/3, fires without fx garbage, channels and CGRAM 0 given back after leaving; screenshots | pass |
| `ship-hole` | the breach as a floor hole (debug command 8): a 17×15 grid of footprints matches the drawn outline's rows exactly and the browser's `breachDepth()` away from the jagged edge; none in another room or with the ship whole | pass |
| `ship-takeoff` | the roof takeoff binding (debug command 9): taken, Uh oh, the crash, the Mech Rider; refused at the fight | pass |

The demolition scenarios fire at 78% charge so that barrier events (which
the browser fires for the same beams, see `beam-earth-tile`) do not change
the map under the comparison. Each scenario sets the persistent door bits
itself. Every Sandship scenario watches the core's event request word for
writes by the game (see the core request) and fails on them unless it
shields the word. Development tools: `breach-debug.mjs` (planner vs
`breach()` cell by cell through debug command 5), `plan-trace.mjs` (plan
frames, both pipelines), `profile.mjs` (per-frame scanlines and cycles of
each phase), `DESTROY_PROFILE` / `DESTROY_PCPROF` (per-call scanlines and
per-PC instruction counts of `destroy_hit`, `run.mjs`).

## Performance

Idle cost about one scanline per field frame. Punches and plain beams cost
a few scanlines. A full Super Saiyan beam is the heavy case while its band
grows (about 13 frames): the scan and the barrier search run in growth
steps (largest call 84 scanlines for combat's full wave, FastROM; see
Amortised growth); the planner only uses spare time. The table below is
the earlier SlowROM measurement, before the amortisation. Lag over one full beam at
78% charge (no barrier event), completed field logic frames of the build
with the beam / without it (same scene, `.local` lag probe; the idle
build's extra lag over the original cartridge in the Earth and Wind Palace
comes from other modules, not from this one):

| Scene | Build, full beam | Build, idle |
| --- | --- | --- |
| Potos clearing (`emulator-probe__main-before-grass`) | 14 / 138 | 14 / 138 |
| Elinee's castle (`power-flight-fixes__native-302`) | 17 / 141 | 14 / 138 |
| Mana Fortress deck (`preset__fortress`) | 16 / 140 | 14 / 138 |
| Wind Palace (`barrier-audit__bosses__60-0-state`) | 33 / 147 | 29 / 138 |
| Earth Palace (`kamehameha-voice__gap-before`) | 43 / 156 | 35 / 138 |
| Lost Continent, Goku on BG2 (`juice-research__plants__layer2-before`) | 29 / 148 | 14 / 138 |

(lag frames / frames.) The remaining lag falls in the band's growth frames
of scenes whose own frame logic ends near line 120-160.

### Scenery and barrier scan loop (2026-10-19)

`dst_skim` and `dst_skim_nt` select the layer once per run and keep their
counter/stride in stack-local direct page. They restore D and DB before
returning, including when an unknown tile class requires the caller's full
classification. Tile order, candidate tests and map writes are unchanged.
`DESTROY_SKIM_SLOW` keeps the previous loop for comparisons.

The assembled scanner tests cover every packed class byte, both layers,
unknown cells, cursor wrapping, strides in both directions and caller
contexts. A 64-cell scenery scan falls from 4,384 to 3,817 CPU cycles; the
barrier scan falls from 5,088 to 4,521. Fifteen emulator cases covering
plants, growing beams, BG2 objects, gates and switches match their existing
references. The long gameplay charge case improves 82 → 80 misses per
1,200 video frames; crowded timing remains open.

## Remaining work

- Debris is published (effect record), not drawn: an effects module owns
  sprites and palettes.
- The Sandship's deviations (its section): fewer fires and smaller blasts
  than the browser, one sand colour per row, no soot.
- Flying out past the hull (`shipHull()`, `outside()`) is flight's; it
  reports through `!SANDSHIP_TAKEOFF`. The browser's hover catch when a
  hole opens under a standing Goku (mana-mod `beforeFrame`) is flight's
  too; on the ship its `unstick()` lifts him after 8 frames.
- Demolition timing differs from the browser where its every-frame replan
  matters (`demo-wind`, `demo-bg2`, `demo-ship` above): every wall the
  cartridge opens is one the browser opens, but one Wind Palace breach is
  lost to the boss intro and some passages use another sampled floor tile.
- Validated in Mesen 2 only (timing, budgets and SRAM behaviour follow the
  hardware rules: no open bus, PPU untouched, all state initialised); not
  yet run on bsnes, snes9x or a cartridge.

## Requests

- Core (being fixed): the game's tile decoder (`C1:C5D1-C9FF`) writes 4bpp
  tiles to `$7E:2000+X` during map loads, up to `$7E:77FF`, over the
  extended core block. In the wrecked Sandship's cabin (339) it wrote
  `$C828` into `!core_event_req` (`$7E:6E8E`); the pump started event
  `$0828` (door 28 → map 165) and the Sandship took that as an unplanned
  departure and crashed. Two modules cannot race on the word
  (`core_event_request` refuses while one is pending). Core is moving its
  persistent fields to battery RAM (`!CORE_SAFE`); this module reads the
  word with long addressing (`!CORE_EVREQ`), and `ship-rescues` shields
  the word until then (the watcher follows the ABI address).
- Core: `!SSW` uses the tail of `!SRAM_WORK_SCENE` (`$32:7600-7FFF`) while
  the player is aboard (no set-piece scene runs on the ship maps), claimed
  with a magic word; please keep that range out of the scene modules'
  layouts or give the Sandship its own `$A00` bytes.
- Effects: a draw's frame cost (about 9 scanlines per Exploder cell, 5 per
  Fireball cell, 9 once anything is drawn) limits the wreck to a few fires
  a frame; a persistent looping cell (drawn by fx from one request) or a
  cheaper path for static cells would let more burn. fx emitted `$FFFF`
  OAM words for missing cells (the fires avoid the case) and its OBJ
  palettes were lost on lag vblanks with a window open (the CGRAM hook
  uploads only the BG half then).

- Radio / feedback: read `!out_react` / `!out_rmap` for `defeatedBarrier`
  and `!out_demo` / `!out_rows` for rumble pulses; show the Sandship
  remarks (`!ssw_remark` / `!ssw_rseq`, dismissed by `!ssw_dismiss`).
- Effects: draw `!FX_*` records (rubble 32 frames, brazier burst 54 frames
  in the browser).
- Combat: call `destroy_hit` / `destroy_orb_hit` as above.
