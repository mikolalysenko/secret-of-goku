# DESTROY module: destructible scenery, barriers, orbs and dungeon demolition

Spoilers. Part of the [SNES cartridge port](../snes-rom.md) ([plan](plan.md)).
Source: `snes/src/modules/destroy/`, generator `snes/gen/destroy.mjs`, tests
`snes/test/destroy/`. Browser references: `engine/native-plants.js`,
`engine/native-local-flight.js` (`breakScenery`), `engine/palace-braziers.js`,
`engine/dungeon-geometry.js`, `engine/dungeon-demolition.js`,
`engine/native-barriers.js`, `engine/breakable-doors.js`,
`engine/native-orbs.js`.

Goku's punches, kicks and beams break what the boy's weapons could, through
the game's own cut-map pipeline: the module edits the collision grids, raises
the native row redraw and cut sound, starts the original (or story-authored)
events of gates, locks and switches, and with the full Super Saiyan beam
melts dungeon partitions and shatters palace braziers. Nothing is painted
over the screen: every change is native map data, so collision, redraw and
the scroll loader all agree.

## Resources

| Resource | Use |
| --- | --- |
| Code `$A4:8000-$A4:B0F1` | `!CODE_DESTROY` (about 12.2 KiB) |
| Data `$E4:0000-$E4:1DF3` | `!DATA_DESTROY` (about 7.5 KiB, all generated) |
| WRAM `$7E:D980-$7E:D9FF` | `!RAM_DESTROY`: state words `+$00-$0F`, API arguments `+$10-$23`, beam scan memory, map context, outputs `+$36-$3F`, call-local scratch `+$40-$7F` |
| SRAM `$31:6100-$31:6101` | `!PERSIST_DESTROY` (2 of `$80` bytes): broken doors, Mana Tree cloud barrier; saved with the GAME FILE by the core sidecar |
| SRAM `$33:7000-$33:77FF` | `!SRAM_WORK_DESTROY`: edit queue, settled runs, smashed-object list, tile classes, breach records, planner job and suspended plan, scratch, barrier/orb state, debug mailbox, planner scratch, effect record (layout in `module.asm`) |
| VRAM, CGRAM, OAM, DMA | None. Redraws go through the native row request; effects are published for an effects module (below) |

All work runs on the main thread (field frame and the C0:C7C3 redraw
consumer); nothing runs in NMI.

## Original code patched

| Address | Bytes | Replaced | Purpose |
| --- | --- | --- | --- |
| `C0:C7C3` | 4 | `SEP #$30 / LDA $2E` | Start of the native row-redraw consumer: `destroy_redraw_hook` applies one queued row group and raises `$82/$83` (and `$95`) exactly where the browser mod applies its edits, then re-executes the replaced instructions |
| `C0:CC2D` | 4 | `LDA $7ECF00,X` | Map piece loader, the story flag gating each piece (8-bit, DB = `$7F`, record at `[$20]`): `destroy_piece_flag` returns it unchanged except for Watts's shortcut entrance on map 73 (record `C8:5A8D`, `CF14` 6..15), which reads as if its range were 0..15 once the Gaia shortcut door broke (`native-story.js` `storyRead` of `C8:5A8E`); `CF14` itself is untouched |

Dispatch (`snes/src/modules.asm`): `modules_field_frame` →
`destroy_field_frame` (last in the list: its planner uses the time the frame
has left), `modules_world_frame` → `destroy_world_frame`, `modules_load` and
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

## API for other modules

All entries: `JSL`, P = M16/X16 on entry; they set their own DB where noted.

| Entry | Contract |
| --- | --- |
| `destroy_hit` | One attack against the map, once per frame per attack while it lasts. Fill `!arg_*` (WRAM `$7E:D990-$7E:D9A3`): `arg_x/arg_y` origin in map pixels (Goku's `$E002/$E004`, or the beam's start), `arg_dir` 0 down 1 right 2 left 3 up (Goku's facing index), `arg_len` reach in pixels (≤ 640), `arg_half` half width (≤ 80), `arg_taper` 44 for the full Super Saiyan beam else 0, `arg_kind` 0 punch/kick, 1 ki blast (no map effect; orbs only), 2 beam, 3 full Super Saiyan beam, `arg_str` charge 0-256 (punches 256; barriers need ≥ 218), `arg_id` 0 for one-shots, else one non-zero id kept for a beam's whole lifetime and changed for the next beam (ids may wrap, but never reuse the previous beam's), `arg_layer` 0/1 or `$FFFF` = Goku's (`$E00B` bit 7). Any DB. Returns A = bit 0 tiles queued, bit 1 a barrier/switch was struck (its event follows), bit 2 queue full (call again next frame with the same id). Does nothing unless Goku is on the idle field (`native-plants.js` `ground()`) |
| `destroy_orb_hit` | An attack touched actor X (offset from `$7E:E000`, e.g. `$0600` for slot 3). Carry set when it is an orb and its event was queued (one at a time). Any DB |
| `destroy_tree_barrier_break` | World flight: a full wave reached the Pure Land cloud barrier |
| `destroy_field_frame` / `destroy_world_frame` / `destroy_reset` | Dispatch only (above) |

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
= the broken-door bits.

## Persistence

`!PERSIST_DESTROY+0` bit n: breakable door n broken (0 Gaia shortcut,
1 Pandora ruins exit, 2 Northtown ruins seal); `+1` bit 0: Mana Tree cloud
barrier broken. Both are saved with the GAME FILE (core sidecar) and cleared
for NEW GAME. A broken Gaia shortcut door also keeps Watts's entrance piece
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
queueing (planner words stay in WRAM). `!dbg_ev`/`!dbg_evn` record the last
event this module started.

## Tests

`SNES_ROM=dist/snes/secret-of-goku.sfc node snes/test/destroy/run.mjs
[scenario ...]` (Mesen; bundles from `.local/snes-import`). Each scenario
imports a browser state, fills the module's SRAM work area with a fixed
garbage pattern first, fires the attack (full beams as the per-frame
timeline), and compares the grids, redraw requests and cut sounds with the
JavaScript reference (`reference.mjs`, the browser modules on the same
memory) or the event the reference selects; walking checks prove collision.

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

The demolition scenarios fire at 78% charge so that barrier events (which
the browser fires for the same beams, see `beam-earth-tile`) do not change
the map under the comparison. Each scenario sets the persistent door bits
itself (Mesen keeps SRAM between runs). Development tools: `breach-debug.mjs`
(planner vs `breach()` cell by cell through debug command 5),
`plan-trace.mjs` (plan frames, both pipelines), `profile.mjs` (per-frame
scanlines and cycles of each phase).

## Performance

Idle cost about one scanline per field frame. Punches and plain beams cost
a few scanlines. A full Super Saiyan beam is the heavy case while its band
grows (about 13 frames): the scan and the barrier search run inside
`destroy_hit`; the planner only uses spare time. Lag over one full beam at
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

## Remaining work

- Lag during the growth of a full beam in heavy dungeon scenes (above): the
  scan and the native barrier search are not time-sliced.
- Debris is published (effect record), not drawn: an effects module owns
  sprites and palettes.
- The Sandship runtime (`sandship.js`: wreck, flight doors, crash, gear; the
  story hooks `SANDSHIP_*`, `OBJECT_SANDSHIP`, `OBJECT_LIST_SANDSHIP` and
  queries `SANDSHIP_*`) is not implemented here.
- Demolition timing differs from the browser where its every-frame replan
  matters (`demo-wind`, `demo-bg2`, `demo-ship` above): every wall the
  cartridge opens is one the browser opens, but one Wind Palace breach is
  lost to the boss intro and some passages use another sampled floor tile.
- Validated in Mesen 2 only (timing, budgets and SRAM behaviour follow the
  hardware rules: no open bus, PPU untouched, all state initialised); not
  yet run on bsnes, snes9x or a cartridge.

## Requests

- Radio / feedback: read `!out_react` / `!out_rmap` for `defeatedBarrier`
  and `!out_demo` / `!out_rows` for rumble pulses.
- Effects: draw `!FX_*` records (rubble 32 frames, brazier burst 54 frames
  in the browser).
- Combat: call `destroy_hit` / `destroy_orb_hit` as above.
