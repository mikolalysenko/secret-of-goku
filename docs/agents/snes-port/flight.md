# FLIGHT module: ground flight, gap hovering, crossings, Instant Transmission, ceiling escape

Spoilers. Part of the [SNES cartridge port](../snes-rom.md) ([plan](plan.md),
[engine notes](engine.md)). Source: `snes/src/modules/flight/`, generator
`snes/gen/flight.mjs`, tests `snes/test/flight/`. Browser references:
`engine/native-local-flight.js`, `flight-terrain.js`, `dungeon-geometry.js`
(flight side), `native-whip-routes.js`, `native-gap-flight.js`,
`native-teleport.js`, `ceiling-escape.js`, `ceiling-exits.js`, the flight
parts of `mana-mod.js`.

Status (this branch): **local flight, hovering, crossings with companion
gathering, recovery and the camera follow are in and validated; the terrain
classifier equals the browser's on every tile tested.** Whip-pad crossings,
Instant Transmission, the ceiling escape, the opening-path exit catches,
NPC pass-through and the Sandship hooks are next (see [Remaining](#remaining)).
Flight still costs too much CPU in heavy scenes (see [Cost](#cost)).

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

## Resources

| Resource | Use |
| --- | --- |
| Code `$A3:8000-…` | `!CODE_FLIGHT` (about 13 KiB used) |
| Data `$E3:0000-…` | `!DATA_FLIGHT` (about 10 KiB: bitsets, map flags/extents, exits, routes, recovery order) |
| WRAM `$7E:D900-D97F` | `!RAM_FLIGHT`, all $80 bytes (map in `module.asm`) |
| SRAM `$33:7800-7BFF` | `!SRAM_WORK_FLIGHT`: tile cache, flood fill, anchor/crossing, hero grid, sweep/hero memos, camera follow, test mailbox |
| SRAM `$31:62C0-62FF` | `!PERSIST_GROUND`: unused so far |
| OAM / VRAM / CGRAM / DMA | none (Goku's pose comes from the goku module; effects will come from fx) |

Dispatch: `modules_field_frame` → `flight_frame` (first, before goku).

## API for other modules

WRAM fields (bank `$7E`, absolute with DB = `$7E`):

| Field | Address | Meaning |
| --- | --- | --- |
| `!fl_state` | `$D900` byte | bit0 localFlight, bit1 Goku in play on the field, bit2 canAttack, bit4 charging |
| `!fl_lift` | `$D901` byte | `mod.localLift` (0-12), also written to `!goku_lift` |
| `!fl_events` | `$D974` word | one-frame events: `$01` takeoff (flight cue), `$02` landing cue, `$04` hovering with control (power-intro first-hover banter), `$08` crossing landed (onCross) |
| `!fl_lock` | `$D976` word | request (write every frame): nonzero forbids flight (scene owners, endings, input locks) |
| `!fl_open_air` | `$D978` word | request: Sandship `openAir` (flight passes over every wall) |
| `!fl_charging` | `$D97A` word | request from combat: a charge is running (halves speed, keeps the flight rules for the step) |

Goku requests written by flight every field frame: `GOKU_CTL_LOCALFLY`
(localFlight), `GOKU_CTL_AIRBORNE` (localFlight or lift > 0), `!goku_lift`.

`!FLIGHT_MISSING_FLOOR` (define, optional): a `JSL` routine of the module
that owns floor holes (Frieza's broken deck, the Sandship), called by
canLand with `!fl_q_x/y/l`; carry = hole under the footprint.

## Tests

`node snes/test/flight/run.mjs [classify|water]` (also via `run-all.mjs`):

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
- `water`: the browser spec's Water Palace gap on the same fixture and warp:
  rises over the gap, hovers in place for 45 frames after release, crosses
  and lands on the far platform, flies back and lands.
- Dev aids: `compare.mjs` + `browser-ref.mjs` replay the scenarios of
  `scenarios.mjs` in the browser mod (Playwright, private ROM/fixture) and on
  the cartridge and compare per-frame traces (Haunted Forest vines: same
  8 px/frame Super Saiyan speed, same lift ramp, same landing, frame for
  frame); `icount.mjs`, `callers.mjs`, `profile.mjs` count instructions per
  routine; `branchcheck.mjs` checks patch ranges against the trace.

## Cost

Measured in the Water Palace (an already heavy scene: logic ends at line
~140 with goku and story): walking costs ~800 flight instructions per frame
(about 17 lines), flying ~3,700 per logic frame, so that scene runs at about
45 Hz while flying (the browser mod at 60). `snes/test/perf/run.mjs` (walking
only) reports +17-21 lines over main in its scenes, on top of main's own
+27-33. Next steps: cheaper anchor tracking on foot, a leaner frame path,
segment caching for long air routes. `CORE_FASTROM` would give module code
25%.

## Remaining

- Whip-pad gap crossings (`C0:B683` skip of 6D8 while flying; the `4E`
  conditional at `C1:F1F1` → 6F9 crossing with gap-flight pose `$23`).
- Instant Transmission (L+B, enemy scan, landing search, gather, camera
  follow — the follow is in), ceiling escape (L+R, 35 routes, punch pose
  `$25`, fx debris/sparks, door then `world_takeoff`), opening-path exit
  catches (`C0:D849`), NPC pass-through (`C1:CFE5/D017`), Sandship
  `openAir`/`shipHull` rules, passengers hidden while carried, story hooks
  `FLIGHT_LAND`, `QUEST_WISH_CEILING`, query `LOCAL_FLIGHT`.

## Core requests

- More WRAM or SRAM for flight: the tile cache (64 entries) and the hero grid
  share 1 KiB of SRAM with the flood fill; a bigger cache would cut repeated
  air-route walks.
- A core-provided per-frame `canAttack`/field state would remove duplicate
  checks across combat, story and flight.
- `CORE_FASTROM` (see engine.md) is worth enabling once the module budget
  is tight; flight is the heaviest field module so far.
