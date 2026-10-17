# FLIGHT module: ground flight, gap hovering, crossings, Instant Transmission, ceiling escape

Spoilers. Part of the [SNES cartridge port](../snes-rom.md) ([plan](plan.md),
[engine notes](engine.md)). Source: `snes/src/modules/flight/`, generator
`snes/gen/flight.mjs`, tests `snes/test/flight/`. Browser references:
`engine/native-local-flight.js`, `flight-terrain.js`, `dungeon-geometry.js`
(flight side), `native-whip-routes.js`, `native-gap-flight.js`,
`native-teleport.js`, `ceiling-escape.js`, `ceiling-exits.js`, the flight
parts of `mana-mod.js`.

Status (this branch): **local flight, hovering, crossings with companion
gathering, recovery, the camera follow, Instant Transmission, the native
whip-pad crossings and the ceiling escape are in and validated; the
terrain classifier, the teleport landing search and the roof colours equal
the browser's on every tile, query and palette tested.** The opening-path
exit catches, NPC pass-through and the Sandship hooks are next (see
[Remaining](#remaining)). Flight still costs too much CPU in heavy scenes
(see [Cost](#cost)).

## Behaviour (as the browser)

- **A + direction** flies at 6 px/frame (8 in Super Saiyan; diagonals
  `round(v·√½)`), never more than 14 px per axis per video frame, inside the
  map. Charging (combat's `!fl_charging`) halves it. With L held flight only
  starts during the Kamehameha wave (L+Y), never with L+B.
- Released over a gap Goku keeps hovering until he reaches ground he can
  land on; `!goku_lift` rises/falls 3 px a frame (0-12) and the landing cue
  fires when it reaches 0.
- Over low obstacles (bushes, flowers, vines, rocks, banks, terraces, lily
  pads, lava, chasms, palace/castle/Fortress gaps, cave pits, whip corridors,
  Karon's sea, the Sandship rail) the native collision test is skipped for
  steps whose swept 12×8 footprint is airworthy and which start or end where
  Goku cannot land; walls, map edges, rock caps, layer changes and event
  cells stay native. A blocked sweep gives the native collision one pixel per
  axis per step.
- Airborne Goku ignores stair guidance and currents (2x/3x movement codes),
  the leader tether (companions are dragged to 36×26 / 56×40 boxes instead),
  adopts the floor height under a complete landing, carries CPU companions
  over long gaps (ferry, dungeon air, the Beast's sky) and gathers them after
  a crossing of 24 px or more. A Goku embedded in a wall or outside the map
  returns to the last verified landing (else the nearest landable point of a
  ±128 px grid, in the browser's order) and the camera follows.
- The Mana Beast's Mode 7 arena allows flight only inside X 184-408,
  Y 292-432, and no step there scrolls the camera.
- On foot the A button never reaches the game (it is the speed modifier, not
  the native dash).

### Whip pads (native-gap-flight.js)

- While Goku flies, a whip pad (floor event 6D8) under any party member is
  dropped before it can lock input, end flight or gather the party.
- The pad and post-hit events (6D8 at `CA:90DA`, 6FA at `CA:927A`) start
  with "if the hero holds the whip". For Goku that condition ends the event
  when he flies or steers (A + a direction) or when no whip post stands four
  tiles away; otherwise he faces the post and the script jumps to the native
  6F9 crossing, which floats the party across with its own gathering,
  movement, camera and CF01 flag. Goku hovers in the gap-flight pose (goku
  mode `$23`) with the air bed; `flight` sounds at the start and `landing`
  when the event ends on the same map.

### Ceiling escape (L+R indoors)

- L+R (first frame of the chord) while Goku can act, no live boss is
  around (species 87-127 in slots 3-11, or a scene's Frieza/Vegeta), no
  escape runs, no teleport camera or takeoff is pending: where world flight
  can start (`world_takeoff_allowed`) the world module takes off; otherwise,
  in one of the 253 rooms with an exterior route (35 routes,
  `ceiling-exits.js`), Goku punches through the roof. Combat is cancelled
  in both cases (`requestFlight()`).
- Punch (68 frames, goku mode `$25` with the age, the pad masked, `swing`):
  at age 22 roof chunks and sparks burst 56 px above Goku in the room's own
  colours (`roofColors()`: of the unique stone/timber-like colours in CGRAM
  0-127 sorted by lightness, the 40% and 80% ones), the screen quakes for
  24 frames, `impact` and `flight` sound. At 68 the room's exterior door is
  queued (`story_api_travel`); there world flight is requested (retried
  while an exterior event holds control) with Goku already above the roof
  (pose age 80, never back on that floor). It completes when world flight
  runs (`ui_ceiling_escape`, King Kai's remark). The native scene taking
  over during the punch, Goku leaving play or 600 frames in one phase end
  it.
- Story: `FLIGHT_LAND` (the Potos gatekeeper: cancel combat, land at once,
  `landing`), `QUEST_WISH_CEILING` (nothing to repair: escapes leave no
  holes), query `LOCAL_FLIGHT`.

### Instant Transmission (L+B)

- Pressing L+B (the chord's first frame) while Goku can act picks a target
  among actor slots 3-11 that are active, species < $80 and not the orb $55,
  with HP and not dying (`E191` bit 7), plus a scene's custom foe (Frieza as
  slot 12, Vegeta in place of slot 3): the nearest reachable one the first
  time on a map (ties: lower slot), then the next reachable slot after the
  last target, wrapping. A foe is reachable when `findLanding` finds a spot.
- The 12-frame action (`!goku_act = $14`) cancels combat
  (`combat_api_cancel`), plays `teleport`, masks A and the directions, keeps
  `E010` on its facing and stops local flight. At age 4 Goku lands beside the
  target (if it is still the same live foe): `E002/E004`, `E00B` = the
  landing floor's height (the target's level on stairs), `E006/E007/E045`
  cleared, facing the foe, anchor and crossing forgotten, companions
  gathered, and the camera follows in ≤15 px steps per frame while the
  action holds age 4 (Goku and his shadow absent) and the pad is masked.
  `teleportIn` sounds at age 6. Pressing again during the action queues the
  next teleport when it ends. A map change, a menu or an event cancels it.
- `findLanding`: distances 26, 22, 18, 32, 38, 46, 54 px; first the side
  Goku came from (the larger axis of origin − target), then right, left,
  down, up. A spot must be landable at the target's height (or flyable for
  an airborne Frieza, who then leaves Goku hovering), with no door, trigger,
  layer seam, stair cell (2x) or height above 2 under the 12×8 footprint,
  and every 4 px from 6 px to the spot must also be clear (stairs allowed),
  so he stays on the foe's side of walls and banks.

## How it is built

**Terrain** (`terrain.asm`) is a line-by-line port of `clear`,
`lowObstacle`, `footprint`, `canFly`, `canLand`, `sweep` and the dungeon
geometry (`blocked`/`protectedCell`, `air`/`airRoute`/`airMaterial`/`span`,
cave voids, the Tree Palace dais, ruins spikes), the whip routes
(`crossable`/`route`/`pad`/`span`) and every tileset rule of
`lowObstacle` (cut chains, carved heads, castle/cave/Fortress gaps, ruins
balconies, palace gaps and the Water Palace pockets, banks with lily pads,
village and Tree Palace flowers, small scenery, scenery sets). It reads the
live map buffers and metatile descriptors at `$7F:0000/4000/B800/BC00`, the
header byte at `C8:7000`, the trigger table at `C8:4000`, `$B8`/`$4D`.

The browser's flood fill for rock caps (sealed black cave regions) becomes a
bounded flood fill (64 cells inside a 32×32 window); the generator proves
over every cave-tileset layout (54 piece variants) that every sealed region
fits (largest: 54 cells, 12 tiles across). Pits first take a "loose" void
walk without rock-cap breaks, which bounds the strict one, so most black
cells never flood fill.

**Speed** comes from caching, all exact:

- A 64-entry tile cache in SRAM keyed by location *and tile id*: class bits
  (clear in air / ground base / height), lowObstacle, blocked, air route and
  whip corridor results. A changed tile gets a fresh entry; results that
  depend on neighbours expire every 32 frames and on map loads.
- A 3×3 "hero grid" of tile verdicts around Goku, filled lazily and kept
  across movement steps; cells whose tile id changed lose their verdict.
  Footprints inside it are mask tests.
- Sweeps: a straight sweep is one union rectangle plus bounds at both ends
  (positions are monotonic); a diagonal sweep tests only rectangle changes;
  D778 reuses D651's sweep; the frame logic memoises canLand/canFly at the
  hero.
- Axis-aligned air-route walks use a lean walker on maps without protected
  cells (and away from the Water Palace pockets).

**Data** (`snes/gen/flight.mjs` → `dist/snes/gen/flight/tables.asm`):
metatile bitsets per tileset and rule, evaluated from the engine's own
source (`native-local-flight.js` and `dungeon-geometry.js` private
constants, `flight-terrain.js`, `palace-braziers.js`) with assertions on the
literals the runtime hard-codes; per-map flags and the dungeon context
probed through `createDungeonGeometry().context()`; placement rectangles
(asserted to be the always-visible pieces' rectangle, as destroy relies on);
opening exits; ceiling-exit routes (254 rooms, 35 routes); the recovery
search order.

## Original code patched

All with `%orig` byte assertions (`hooks.asm`); none of the replaced ranges
is a branch target of traced original code (`snes/test/flight/branchcheck.mjs`).

| Address | Bytes | Replaced | Purpose |
| --- | --- | --- | --- |
| `C0:D359` | 7 | `LDA $E048,X / STA $00 / AND #$F0` | Airborne hero skips stair/current guidance (→ `D38E`) |
| `C0:D651` | 4 | `SEP #$20 / LDA $1F` | Flight velocity, travel limit, sweep; camera follow steps (→ `D6AC` / `D65C`) |
| `C0:D778` | 4 | `SEP #$20 / LDA $11` | Airborne steps over low obstacles skip `C1:B93E` (→ `D7F3`) |
| `C0:D9AE` | 5 | `SEP #$20 / LDA $E000,X` | Horizontal leader tether bypass (→ `D9E2`) |
| `C0:DA34` | 5 | `SEP #$20 / LDA $E000,X` | Vertical leader tether bypass (→ `DA68`) |
| `C0:DA6E` | 4 | `SEP #$30 / LDA $FF` | Camera deltas: companions while the camera follows, every step in the Beast arena |
| `C0:B683` | 5 | `REP #$20 / LDA #$0000` | Floor event dispatch: a whip pad (6D8) is dropped while Goku flies (→ `B678`) |
| `C1:F1F1` | 4 | `LDY #$02 / REP #$20` | Conditionals 49-4E: at 6D8/6FA's whip check, END or JUMP 6F9 for Goku (→ `E9C4` / `EAF0`) |

`C0:D651` is flight's (`!FLIGHT_OWNS_D651 = 1` in `module.asm`): its hook
calls combat's Saiyan recoil (`combat_recoil_vector`) first, through
`bind.asm`. Flight does not hook `C0:D890`.

## Resources

| Resource | Use |
| --- | --- |
| Code `$A3:8000-…` | `!CODE_FLIGHT` (about 13.5 KiB used; bindings to other modules at `$A3:F000`) |
| Data `$E3:0000-…` | `!DATA_FLIGHT` (about 10 KiB: bitsets, map flags/extents, exits, routes, recovery order) |
| WRAM `$7E:D900-D97F` | `!RAM_FLIGHT`, all $80 bytes (map in `module.asm`) |
| SRAM `$33:7800-7BFF` | `!SRAM_WORK_FLIGHT`: tile cache, flood fill, anchor/crossing, hero grid, sweep/hero memos, Instant Transmission, camera follow, ceiling escape (`$7BF0`), test mailbox (initialised on the first field frame after title entry: `!fl_magic`); the roof-colour search borrows the tile cache once per escape |
| SRAM `$31:62C0-62FF` | `!PERSIST_GROUND`: unused so far |
| OAM / VRAM / CGRAM / DMA | none (Goku's pose comes from the goku module; effects will come from fx) |

Dispatch: `modules_field_frame` → `flight_frame` (first, before goku);
`modules_world_frame` → `flight_world_frame` (a ceiling escape completes in
world flight).

## API for other modules

WRAM fields (bank `$7E`, absolute with DB = `$7E`):

| Field | Address | Meaning |
| --- | --- | --- |
| `!fl_state` | `$D900` byte | bit0 localFlight, bit1 Goku in play on the field, bit2 canAttack, bit4 charging |
| `!fl_lift` | `$D901` byte | `mod.localLift` (0-12), also written to `!goku_lift` |
| `!fl_hook` | `$D932` word | bit 2 (`$04`): the camera follows a teleport/recovery (the browser's `teleport.pending`: the pad is masked and only the running action advances) |
| `!fl_gap` | `$D970` word | a native whip crossing runs (map + 1), 0 none (`gapFlight.active`) |
| `!fl_events` | `$D974` word | one-frame events: `$01` takeoff (flight cue), `$02` landing cue, `$04` hovering with control (power-intro first-hover banter), `$08` crossing landed (onCross), `$10` teleport started, `$20` Goku reappears (age 6) |
| `!fl_lock` | `$D976` word | request (write every frame): nonzero forbids flight (scene owners, endings, input locks) |
| `!fl_open_air` | `$D978` word | request: Sandship `openAir` (flight passes over every wall) |
| `!fl_charging` | `$D97A` word | request from combat: a charge is running (halves speed, keeps the flight rules for the step) |

Goku requests written by flight every field frame: `GOKU_CTL_LOCALFLY`
(localFlight), `GOKU_CTL_AIRBORNE` (localFlight or lift > 0), `!goku_lift`,
`!goku_mode = $23` during a native whip crossing (cleared only if flight set
it);
while Instant Transmission runs `!goku_act = $14`, `!goku_act_age`,
`!goku_act_facing`, `!goku_act_arg` bit 7 in Super Saiyan (cleared when it
ends). Combat sees the foreign action through `cb_ext_kind` and starts
nothing meanwhile (combat runs before flight in `modules_field_frame`).

Custom teleport target (`!fl_tp_custom`, SRAM `$33:7B68`, 8 bytes): a scene
module that owns a foe outside the actor table writes it every field frame
(flight clears it after each frame): `+0` kind (2 Frieza = slot 12, 3 Vegeta
= slot 3), `+1` species (121 / 46), `+2` x, `+4` y (Frieza: `y + 12` as
`frieza.js` `entity()`), `+6` terrain byte, `+7` airborne (Frieza).

Story hooks/queries defined in `module.asm`: `!STORY_HOOK_FLIGHT_LAND`,
`!STORY_HOOK_QUEST_WISH_CEILING`, `!STORY_QUERY_LOCAL_FLIGHT` (`story.asm`).

Bindings (`bind.asm`, included by `modules.asm` after every module so the
providers' defines are visible): world (`!WORLD_MAGIC`) `world_takeoff`,
`world_takeoff_allowed` (without the module: the native `$0C00|map` request
with the map header's world-flight bit); story `story_api_travel`; fx
(`!FX_DEBRIS`) `fx_spawn` `FX_SPARKS` (8) and `FX_DEBRIS` (20 chunks, life
46, style 1 = the ceiling-escape layout, `!fx_rgb` = black, stone,
highlight), `fx_quake` 24, `fx_kill_all` on a cancel; combat `combat_recoil_vector`,
`combat_api_cancel`, `combat_api_state` (charging); audio `audio_sfx` cues
`FLIGHT` 18, `LANDING` 19, `TELEPORT` 16, `TELEPORT_IN` 17 and the `AIR`
loop while flying (level .35 while charging), ids asserted against
`AUDIO_IDS`; ui `ui_power_intro_flight` every frame Goku hovers with control,
`ui_ceiling_escape`; world `!WORLD_TAKEOFF` (else the native `$0C00|map`
request). Without the combat module flight hides B from the game while Goku
can act (the browser always does; combat's input filter does it otherwise).

`!FLIGHT_MISSING_FLOOR` (define, optional): a `JSL` routine of the module
that owns floor holes (Frieza's broken deck, the Sandship), called by
canLand with `!fl_q_x/y/l`; carry = hole under the footprint.

## Tests

`node snes/test/flight/run.mjs [classify|landing|water|teleport|whip|ceiling]`
(also via `run-all.mjs`):

- `classify`: for 26 imported scenes (towns, woodland, Gaia's Navel caves,
  Haunted Forest, Water/Earth/Fire Palace, Witch castle, Sandship, Mana
  Fortress, Northtown ruins, Pure Land, Lost Continent, desert, …) the
  cartridge (`-DFLIGHT_TEST`, mailbox in `testmod.asm`) classifies every
  tile of both layers — canFly and canLand (terrains 0-3) at the tile centre
  and lowObstacle — and the browser's `createNativeLocalFlight` does the same
  on the same WRAM: **289,324 / 289,324 tiles equal**. Over the whole catalog
  (`classify.mjs --all`, 71 maps) 62 scenes are equal; the rest changed map
  or left the field during the multi-frame dump (cutscene states), and the
  Mana Beast arena streams its art through the descriptor buffer every frame
  (its flight uses the fixed bounds).
- `landing`: Instant Transmission differential. For 27 imported scenes the
  cartridge answers `findLanding` for a grid of targets (every third tile,
  both layers, terrain from the floor below, every seventh one airborne like
  Frieza) with origins on each side (mailbox command 4), and
  `engine/native-teleport.js` with the browser's collision answers the same
  queries on the same WRAM: **19,996 / 19,996 queries equal** (8,510
  landings: position, terrain, facing, hover). The same run compares the
  ceiling escape's roof colours with `roofColors()` on the palette the
  cartridge read: equal in all 21 scenes whose palette held still during
  the call (6 animate theirs).
- `water`: the browser spec's Water Palace gap on the same fixture and warp:
  rises over the gap, hovers in place for 45 frames after release, crosses
  and lands on the far platform, flies back and lands.
- `teleport`: `teleport.spec.mjs` on the rabite river field: from the low
  bank Goku lands on the Rabite's far side at its height within punching
  reach; an offscreen target (screen x −101) is reached with the camera
  streaming in 15 px steps (17 frames, all of them absent at age 4), Goku
  lands on screen, walks afterwards, the ring opens, `teleport` sounds at
  the press and `teleportIn` once at age 6.
- `whip`: `whip-flight.spec.mjs` and `ki-world.spec.mjs` in the Earth Palace
  (map 313): flying across both pads, there and back, never starts the pad
  event, lands within 14 px on landable ground with the companions close;
  walking onto the pad floats the whole party 93 px across in the
  gap-flight pose, the event ends and CF01/CF03 stay clear.
- `ceiling`: `indoor-flight.spec.mjs` from seven rooms entered through
  their real doors (Water Palace 137/139, Potos houses 257/259, Gaia's
  Navel 293, Matango inn 282, Gold City house 125): L+R starts the escape,
  the pose shows, the exterior loads, Goku never reappears on its ground,
  the whole party leaves; plus `ceiling-escape.test.mjs`'s boss lock (a
  live species-100 boss keeps it, a dying one frees it). This branch has no
  world module, so the fallback native request takes off with Flammie's
  summon: world flight after 780-1,070 frames from five rooms; from the
  Water Palace exterior the native summon does not complete (the world
  module skips the summon, as the browser does), so there the test checks
  the escape up to its takeoff request.
- Dev aids: `compare.mjs` + `browser-ref.mjs` replay the scenarios of
  `scenarios.mjs` in the browser mod (Playwright, private ROM/fixture) and on
  the cartridge and compare per-frame traces (`--shots=` takes screenshots).
  Flight state, speed (8 px/frame Super Saiyan), lift ramp and landings
  agree; positions drift where SnesJs lags (the browser then runs two
  movement steps in one video frame, 8 + 6 px) or where an enemy hits Goku
  (without the combat module the native hurt knockback applies). The three
  teleport scenarios agree on targets (3 → 4 → 5 → 3 when cycling, queued
  presses), landings (to the target's current position; Rabites wander a
  little differently after the import) and the camera path (offscreen:
  identical 15 px steps to the same camera). `icount.mjs`, `scost.mjs`
  (instructions per video frame of a scenario, costliest routines),
  `callers.mjs`, `calls.mjs` (entries per frame) and `phases.mjs` (cost
  per frame split by the frame's steps and each hook, `--focus=` for the
  routines inside one) profile; `branchcheck.mjs` checks patch ranges
  against the trace.

## Cost

Measured in the Water Palace (an already heavy scene: logic ends at line
~140 with goku and story): walking costs ~800 flight instructions per frame
(about 17 lines), flying ~3,700 per logic frame, so that scene runs at about
45 Hz while flying (the browser mod at 60). `snes/test/perf/run.mjs` (walking
only) reports +17-21 lines over main in its scenes, on top of main's own
+27-33. Instant Transmission adds ~4,300 instructions on the press (target
search with landings) and ~3,500 at arrival (landing again, gather, camera),
one-off; the river field then drops one frame at the arrival. Idle teleport
bookkeeping costs ~45 instructions per frame (465 → 512 walking in the sword
scene).

Earth Palace whip corridor (`phases.mjs whip-fly`): walking ~490
instructions per frame; flying 1,500-3,700 per logic frame (whip routes and
dungeon air for each new tile, the hero grid, settle) and hovering ~1,800,
so that scene runs at 30 Hz while flying (the cartridge covers the corridor
in twice the browser's frames; the outcome is the same). Done so far: whip
rays by index arithmetic with a quick pad pre-check, one tile-id compare
for the whole hero grid, a per-frame hero canLand memo, the D778 endpoint
canFly implied by the sweep.

Ceiling escape: the roof-colour search costs ~12,000 instructions once, at
the impact (one dropped frame during the quake). Next steps: cheaper anchor tracking on foot, a leaner frame path,
segment caching for long air routes. `CORE_FASTROM` would give module code
25%.

## Remaining

- Whip-pad gap crossings (`C0:B683` skip of 6D8 while flying; the `4E`
  conditional at `C1:F1F1` → 6F9 crossing with gap-flight pose `$23`).
- Opening-path exit catches (`C0:D849`), NPC pass-through
  (`C1:CFE5/D017`), Sandship `openAir`/`shipHull` rules and its takeoff
  (`sandship.takeoff()` blows up an unfinished ship before any takeoff),
  passengers hidden while carried (`sprite-layer.js` also hides the whip
  attachment during a crossing; goku draws no weapon cells for Goku
  anyway).
- Ceiling escape: the debris and sparks are requested from fx (style 1 for
  `ceiling-escape.js`'s 20-chunk layout); fx draws them once it implements
  those kinds. The Vegeta trial counts as a boss only through its custom
  target post (kind 3). The world module's own L+R takeoff does not check
  the boss lock the browser's `requestFlight()` applies to both routes.
- Instant Transmission: `mod.facing` comes from `E010` (the browser also
  turns it on the press frame's new direction, which combat's aim tracks);
  the action advances once per logic frame (the browser: per video frame,
  so a lagging scene stretches it); the Frieza/Vegeta custom targets wait for
  their scene modules to post `!fl_tp_custom`.
- Combat should mirror the browser's `teleport.pending` branch while
  `!fl_hook` bit 2 is set (no new attacks, the current action only advances);
  during a teleport it already waits through `cb_ext_kind`.

## Core requests

- More WRAM or SRAM for flight: the tile cache (64 entries) and the hero grid
  share 1 KiB of SRAM with the flood fill; a bigger cache would cut repeated
  air-route walks.
- A core-provided per-frame `canAttack`/field state would remove duplicate
  checks across combat, story and flight.
- `CORE_FASTROM` (see engine.md) is worth enabling once the module budget
  is tight; flight is the heaviest field module so far.
