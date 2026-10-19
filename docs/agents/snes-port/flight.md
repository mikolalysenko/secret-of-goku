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
whip-pad crossings, the ceiling escape, the opening-path exit catches, NPC
pass-through and the Sandship's flight-side rules are in and validated; the
terrain classifier, the teleport landing search, the exit catches and the
roof colours equal the browser's on every tile, query, probe and palette
tested.** Current integrated measurements and remaining crowded-field
slowdowns are in [gameplay-performance.md](gameplay-performance.md#flight-world-map-and-radar-follow-up).
The older module profile is retained under [Cost](#cost); remaining
integration work is under
[Remaining](#remaining).

## Behaviour

- **A + direction** flies at 6 px/frame (8 in Super Saiyan; diagonals
  `round(v·√½)`), never more than 14 px per axis per video frame, inside the
  map. Charging (combat's charge state while L+Y is held, or a
  `!fl_charging` request) halves it. With L held flight only
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
- Airborne Goku ignores stair guidance and currents (2x/3x movement codes)
  and the leader tether, and adopts the floor height under a complete
  landing. The cartridge carries CPU companions during all local flight:
  they share his position and terrain, pause ground AI, movement, contacts
  and rendering, then resume after landing. Their actor slots remain active
  and native status/timer updates continue. Human-controlled companions,
  menus, map loads and scripted ownership retain native handling. This
  differs from the browser's trailing companions and reduces airborne CPU
  work. Crossings of 24 px or more also gather the party. A Goku embedded in a wall or outside the map
  returns to the last verified landing (else the nearest landable point of a
  ±128 px grid, in the browser's order) and the camera follows.
- On the four opening-path maps (128-131) an airborne Goku moving out
  through a passage (within its tile on the passage axis and two tiles
  either side of it) takes the passage's door like walking through it:
  the movement step samples the passage's marker, whose trigger must be
  that door's event, so the native door, fade, camera and party movement
  run.
- Airborne Goku passes over NPCs (species >= `$80`) without pushing them
  or being pushed; enemy contact and conversations on the ground keep the
  native handling.
- On the Sandship (maps 98, 99, 270, 271, 318, 319, 324, 339) and in the
  dunes after it (91) flight passes over every wall (`openAir`). Hovering
  over a ship door ($1A0-$1BF) for three frames, after having been off
  every door since entering the room, takes it through the story's
  flight-door event 07A (flight answers its `SANDSHIP_DOOR` query); a Goku
  left standing where he cannot land for eight frames (a breached wall)
  lifts into a hover. Carried CPU companions are listed in `!fl_passengers`.
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
  Footprints inside it are mask tests. When the grid moves one cell over
  (same layer and terrain), the cells both positions share keep their
  verdicts, shifted, after the old grid's tiles are checked.
- Quiet frames: with flight reset (landed, no lift, charge, teleport,
  camera follow, whip crossing, ceiling escape, owned Goku requests, cues,
  latched buttons or passengers) and Goku out of play, off the native
  field, in the finale, or held by the first of `canAttack`'s conditions
  that fails (`!fl_quiet_why`: a lock, an event, a menu, a hurt status...),
  `flight_frame` returns after testing only that reason; the pad history
  goes on for the whip pad's conditional. A whip crossing or the reason's
  end wakes it.
- On foot with nothing of flight's running and neither A nor L held, the
  first full frame is `settle()`'s anchor, the A/B masks and the cache's
  aging (`fl_onfoot`; the hero grid moves only when the footprint leaves
  it, and the anchor's canLand is a mask test when its cells are known),
  and the frames after it walk (`!FLS_WALK`): the A/B mask, the one-frame
  posts and a check of everything that would end the walk (A or L, another
  mode's frames, an event or menu, Goku leaving play, a map change, a whip
  crossing or a charge request; the field's vectors every 16th tick). The
  walk's end asks canLand for Goku's spot, else for two samples of the
  walk taken every 16th tick, and the newest landable one is the anchor
  (the browser keeps the newest landable step; the difference is at most
  16 ticks of walking, and only the recovery point and a crossing's start
  use it); the tile cache's aging catches up there (a walk of 8 frames or
  more starts it afresh). A new map ends the walk on its own frame and
  loads its context on the next.
- Floor holes: the browser's providers report holes only on the Sandship's
  maps and in Frieza's arena (the generator reads both from their sources
  into `!FLM_HOLES`), so canLand and the walking check ask the cartridge's
  providers only there (and where the map's context is not loaded yet);
  elsewhere a hero step costs a few instructions.
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
| `C0:D651` | 4 | `SEP #$20 / LDA $1F` | Flight velocity, travel limit, sweep; camera follow steps (→ `D6AC` / `D65C`); a standing leader runs the dispatcher for a scene's camera target (→ `D6AC`) |
| `C0:D778` | 4 | `SEP #$20 / LDA $11` | Airborne steps over low obstacles skip `C1:B93E` (→ `D7F3`) |
| `C0:D9AE` | 5 | `SEP #$20 / LDA $E000,X` | Horizontal leader tether bypass (→ `D9E2`) |
| `C0:DA34` | 5 | `SEP #$20 / LDA $E000,X` | Vertical leader tether bypass (→ `DA68`) |
| `C0:DA6E` | 4 | `SEP #$30 / LDA $FF` | Camera deltas: companions while the camera follows, every step in the Beast arena; a scene's camera target (one pixel per axis per video frame, `$1B` = Goku's terrain) |
| `C0:B683` | 5 | `REP #$20 / LDA #$0000` | Floor event dispatch: a whip pad (6D8) is dropped while Goku flies (→ `B678`) |
| `C1:F1F1` | 4 | `LDY #$02 / REP #$20` | Conditionals 49-4E: at 6D8/6FA's whip check, END or JUMP 6F9 for Goku (→ `E9C4` / `EAF0`) |
| `C0:D849` | 5 | `STA $08 / TAY / LDA [$0A],Y` | Destination metatile sample: an opening exit's marker for an airborne exit move |
| `C1:CFE5` | 5 | `SEP #$20 / LDA $E074,Y` | Actor contact: airborne Goku and an NPC → the routine's `RTS` (`CFE4`) |
| `C1:D017` | 5 | `LDA $E006,X / BEQ $D042` | The same on the contact path entered with either M width |

`C0:D651` is flight's (`!FLIGHT_OWNS_D651 = 1` in `module.asm`): its hook
calls combat's Saiyan recoil (`combat_recoil_vector`) first, through
`bind.asm`. Flight does not hook `C0:D890`.

## Resources

| Resource | Use |
| --- | --- |
| Code `$A3:8000-…` | `!CODE_FLIGHT` (18.7 KiB used, to `$A3:CAA1`; bindings to other modules at `$A3:F000-F0DD`) |
| Data `$E3:0000-…` | `!DATA_FLIGHT` (9.3 KiB, to `$E3:254F`: bitsets, map flags/extents, exits, routes, recovery order) |
| WRAM `$7E:D900-D97F` | `!RAM_FLIGHT`, all $80 bytes (map in `module.asm`) |
| SRAM `$33:7800-7BFF` | `!SRAM_WORK_FLIGHT`: tile cache, flood fill, anchor/crossing, hero grid, sweep/hero memos, Instant Transmission, camera follow, ceiling escape (`$7BF0`), Goku request ownership (`$7B3E`), test mailbox (initialised on the first field frame after title entry: `!fl_magic`); the roof-colour search borrows the tile cache once per escape |
| SRAM `$31:62C0-62FF` | `!PERSIST_GROUND`: unused so far |
| OAM / VRAM / CGRAM / DMA | none (Goku's pose comes from the goku module, effects from fx) |

Dispatch: `modules_field_frame` → `flight_frame` (after combat, before
world and goku) and `flight_pose_frame` (after `world_field_frame`, so the
ceiling escape's pose wins over world's takeoff pose);
`modules_world_frame` → `flight_world_frame` (a ceiling escape completes in
world flight).

## API for other modules

Services (`api.asm`; the defines are set in `module.asm`, so modules
included after flight test them with `defined()`):

| Service | Call | Result |
| --- | --- | --- |
| `!FLIGHT_API_CAN_LAND` | JSL, M16/X16, any DB and D. A16 = x, X16 = y (map pixels, centre of the 12x8 footprint), at Goku's layer and terrain (`E00B`) | C = `mod.localFlightHook.canLand(x, y)`: no hole from `!FLIGHT_MISSING_FLOOR` under the footprint and every sample tile is floor at that terrain. A, X, Y, DB, D kept |
| `!FLIGHT_API_CAN_LAND_T` | the same with Y16 = a terrain byte (bit 7 layer 1, bits 0-1 terrain), as `frieza.js` passes the terrain it recorded when the fight began | as above |
| `!FLIGHT_API_CAMERA` | JSL, M16/X16, any DB. A16 = camera x, X16 = camera y (the tile-stream origin `$A8/$AA`). Post it every field frame the scene holds the camera | During the next frame's movement the dispatcher (`C0:D651`/`DA6E`) moves the camera one pixel per axis per video frame toward it, also while Goku stands, and other actors' steps give it no deltas (`frieza-intro.js installAltarCamera`: rows stream as for a walk, NPCs stay in the room). A frame without a post ends it; the camera stays where it got to. It takes precedence over a teleport's follow. A, X, Y, DB kept |

The canLand services work outside flight's frames too (they load the map's
context and re-check the hero grid's tiles); a call costs about 150-450
instructions, more for tiles the tile cache has not seen, so a wide search
(`frieza.js` `returnToFortress`, 33x33 points) has to be spread over frames.
Not callable from inside a `!FLIGHT_MISSING_FLOOR` provider (it shares
flight's query fields).

WRAM fields (bank `$7E`, absolute with DB = `$7E`):

| Field | Address | Meaning |
| --- | --- | --- |
| `!fl_state` | `$D900` byte | bit0 localFlight, bit1 Goku in play on the field, bit2 canAttack, bit4 charging; bits 1-2 are those of the last full frame (bit 7 set: Goku walks, and the walk frames keep them; bit 6: quiet) |
| `!fl_lift` | `$D901` byte | `mod.localLift` (0-12), also written to `!goku_lift` |
| `!fl_hook` | `$D932` word | bit 2 (`$04`): the camera follows a teleport/recovery (the browser's `teleport.pending`: the pad is masked and only the running action advances); bit 4 (`$10`): a scene's camera target is posted |
| `!fl_passengers` | `$D96C` word | CPU companions Goku carries this frame (bit 0 `$E200`, bit 1 `$E400`): `sprite-layer.js` hides their body, attachment and shadow cells |
| `!fl_gap` | `$D970` word | a native whip crossing runs (map + 1), 0 none (`gapFlight.active`) |
| `!fl_events` | `$D974` word | one-frame events: `$01` takeoff (flight cue), `$02` landing cue, `$04` hovering with control (power-intro first-hover banter), `$08` crossing landed (onCross), `$10` teleport started, `$20` Goku reappears (age 6) |
| `!fl_lock` | `$D976` word | request (write every frame): nonzero forbids flight (scene owners, endings, input locks) |
| `!fl_open_air` | `$D978` word | Sandship/dunes `openAir` (flight passes over every wall), set with the map context |
| `!fl_charging` | `$D97A` word | request from combat: a charge is running (halves speed, keeps the flight rules for the step) |

Goku requests flight writes: `GOKU_CTL_LOCALFLY` (localFlight),
`GOKU_CTL_AIRBORNE` (localFlight, lift > 0 or a ceiling escape) and
`!goku_lift`, every field frame while it wants one of them;
`!goku_mode = $23` during a native whip crossing and `$25` (with
`!goku_mode_age`) during a ceiling escape; while Instant Transmission runs
`!goku_act = $14`, `!goku_act_age`, `!goku_act_facing`, `!goku_act_arg`
bit 7 in Super Saiyan. `!fl_owned` (SRAM `$33:7B3E`) records which of them
flight wrote: each is cleared once when flight stops wanting it (a mode or
action only while it still holds flight's value), and requests other
writers make (combat, world, the goku tests) are never touched. Combat sees
the foreign action through `cb_ext_kind` and starts nothing meanwhile
(combat runs before flight in `modules_field_frame`).

Custom teleport target (`!fl_tp_custom`, SRAM `$33:7B68`, 8 bytes): a scene
module that owns a foe outside the actor table writes it every field frame
(flight clears it at the end of its own frame, so a post made later in the
field frame is read in the next one): `+0` kind (2 Frieza = slot 12, 3
Vegeta = slot 3), `+1` species (121 / 46), `+2` x, `+4` y (Frieza: `y + 12`
as `frieza.js` `entity()`), `+6` terrain byte, `+7` airborne (Frieza). The
vegeta module posts Vegeta (`vb_flight_target`); Frieza can post himself
the same way until combat's virtual-target API exists, which Instant
Transmission will then list too. As in the browser
(`mana-mod.js startTeleport`), a target is picked only when `findLanding`
finds a spot beside it, and the arrival lands only if the same live target
is still posted.

Story hooks/queries defined in `module.asm`: `!STORY_HOOK_FLIGHT_LAND`,
`!STORY_HOOK_QUEST_WISH_CEILING`, `!STORY_QUERY_LOCAL_FLIGHT` (`story.asm`),
`!STORY_QUERY_SANDSHIP_DOOR` (`sandship.asm`; listed under the Sandship
owner in story.md, but only the flight door sets it). Story's `-DSTORY_TEST`
builds keep their own table answers instead (as combat's and destroy's).

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
`ui_ceiling_escape`. Without the combat module flight hides B from the game while Goku
can act (the browser always does; combat's input filter does it otherwise).

`!FLIGHT_MISSING_FLOOR` (define, optional, seen through `bind.asm`): a
`JSL` routine of the module that owns floor holes (Frieza's broken deck,
the Sandship wreck), called with `!fl_q_x/y/l` set (M16/X16, DB = `$7E`);
carry = a hole under the 12x8 footprint there. It must leave `!fl_q_x/y/l`
as they were (the walking check asks twice in a diagonal step). With one in
the build, canLand fails over holes (the hero's canLand memo is bypassed,
holes open without a tile change) and walking stops before them
(`supported()` at `C0:D651`: the axis whose step would stand over a hole is
zeroed). Flight asks only on maps flagged `!FLM_HOLES`, the maps where the
browser's providers can have holes (`sandship-wreck.js` `floorHole` needs
`onShip()`: the eight ship maps; `frieza.js` `floorHole` needs
`ownsArena()`: map 246); the generator reads the maps from those sources
and fails when the conditions change. A provider with holes on other maps
defines `!FLIGHT_FLOOR_ANYWHERE` (flight's `FLIGHT_TEST_HOLES` provider
does) and is then asked everywhere. Several modules own holes (destroy's
Sandship wreck, frieza's deck), and asar keeps only the last definition,
so each provider must call the one defined before it when the point is not
its own hole (destroy keeps it in `!DESTROY_NEXT_FLOOR :=
!FLIGHT_MISSING_FLOOR`); a provider that only redefines it hides every
earlier one.

## Tests

`node snes/test/flight/run.mjs [classify|landing|water|teleport|whip|ceiling|scene|vegeta|holes]`
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
  the call (6 animate theirs). On maps 128-131 it also probes the opening
  exits: 71,232 hero positions (a 4 px grid two tiles around each passage)
  and velocities, answered by the cartridge's `fl_flight_exit` and by the
  browser's own `C0:D84C` hook on the same WRAM: all equal, 1,848 exits
  caught. And it sweeps: from a grid of starts in twelve directions at
  flight speeds (each from a hero grid anchored at the start, as in a
  movement step), the cartridge's `fl_sweep` against `canFly` at every
  rounded step: about 200,000 sweeps, all equal. (This check found a hero
  grid bug, now fixed: a sweep whose union spanned three tile columns or
  rows inside the grid got an empty cell mask and passed through walls.)
  Last, the canLand services: points off the tile centres on both layers
  at every terrain (one in five at Goku's own terrain byte), called through
  `!FLIGHT_API_CAN_LAND`/`_T` with DB = `$00` and D = `$0123` (command 8),
  against `canLand(x, y, layer, terrain)`: all equal (2,206 calls in the
  Time Chamber alone), X, Y, DB and D handed back every time. And a walk
  (command 9): Goku placed along rows and columns in 5-6 px steps, both
  layers, `settle()`'s on-foot canLand and canFly asked at each position
  as `fl_onfoot` asks them (the hero grid moving lazily and shifting its
  verdicts one cell at a time), against `canLand`/`canFly`.
- `scene` (`FLIGHT_TEST` cartridge; `testmod.asm` posts after flight's
  frame, as a scene module later in the field frame does): a custom target
  posted as Vegeta (kind 3) is picked by L+B and Goku lands exactly where
  `findLanding` (command 4) says, facing it; a post that stops right after
  the press leaves him where he was (the arrival finds no target, as
  `finishTeleport`); Frieza (kind 2, airborne) is reached at slot 12. A
  camera target moves the origin exactly one pixel a frame (30 frames up,
  then 12 across and 8 down together), holds it, Goku stays put, and walking
  moves the camera natively again once the posts stop.
- `vegeta` (builds with the vegeta module, e.g. the coordinator's
  integration branch): the Time Chamber trial entered as vegeta's own tests
  do; with Vegeta posted and Goku free, L+B is pressed and the press is
  compared with the browser's `findLanding` on the WRAM dumped at that
  frame. Both engines find no spot around the arena (`canLand` and `canFly`
  are false over the chamber's floor tiles where the fight stands), so L+B
  does nothing there; a landing would have been checked against Vegeta's
  position at the arrival.
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
- `holes`: the floor-hole contract on the `FLIGHT_TEST` cartridge (its
  provider is a hole rectangle at `$33:7A96`): walking stops before the
  hole, flight crosses it, Goku released over it keeps hovering, lands
  when it closes and walks on.
- `ceiling`: `indoor-flight.spec.mjs` from seven rooms entered through
  their real doors (Water Palace 137/139, Potos houses 257/259, Gaia's
  Navel 293, Matango inn 282, Gold City house 125): L+R starts the escape,
  the pose shows, the exterior loads, Goku never reappears on its ground,
  the whole party leaves, world flight runs (299-359 frames after the
  press, through the world module's takeoff) and the escape completes;
  plus `ceiling-escape.test.mjs`'s boss lock (a live species-100 boss
  keeps it, a dying one frees it). In a build without the world module
  the native `$0C00|map` request takes off with Flammie's summon instead,
  which does not complete from the Water Palace exterior, so there the
  test then stops at the takeoff request.
- Scenarios also cover `event-barriers.spec.mjs`'s Pandora castle guards
  (flying past them: the NPC pass fires, both engines end at 88,148 on map
  266 with the story flags unchanged), flying out of Potos (both take
  door 2 to map 16) and `sandship.spec.mjs`'s deck hatch (both reach map
  271 at 248,330). With `openAir` the Sandship deck classifies 7,000 /
  7,000 tiles flyable in both engines (the classifier gives the browser's
  flight hook the same `openAir` as `lab.js`).
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

Historical profile, before the native-audio, shared takeoff and world-map
follow-ups. These numbers describe that build, not the current release
candidate; see [current measurements](gameplay-performance.md#flight-world-map-and-radar-follow-up).
Measured on the FastROM build with every module of main: scanlines of
flight code per logic frame (the master clock between code-bank changes,
`Mesen` Lua), and the logic rate while Goku flies:

| Scene | Standing | Walking | Flying | Rate while flying |
| --- | --- | --- | --- | --- |
| Potos (town, map 131) | 7 | 8 | 42-46 | 60 Hz |
| Pandora castle (266) | 8 | – | 40 | 52 Hz |
| Water Palace gap (139) | 8 | 11 | 70 | 36 Hz |
| Earth Palace whip corridor (313) | 8 | – | 63 (hovering 38) | 34 Hz (45 hovering) |
| Gaia's Navel (25) | 7 | 14 | 57 | 32 Hz |

The dungeons are heavy before flight: in the Water Palace on foot the
game's own code takes ~125 lines, goku ~24, story ~11, combat ~7, flight
~11 (60 Hz); Gaia's Navel and the Earth Palace already drop to 48-57 Hz on
foot (game code ~140 lines a frame). Combat also costs more while Goku
flies (10-12 lines instead of 6-7): A held wakes its full frame.

`flight_frame` itself (JSL to return, scanlines; a Potos state, the same
walk before and after the quiet, on-foot and walk paths):

| Frame | Before | Now |
| --- | --- | --- |
| Goku out of play (the boy, the title arrival) | 2.76 | 0.24 |
| An event owns the field (a door) | 5.9 | 0.34 |
| Standing on foot | 6.2 | 0.68 (max 1.4) |
| Walking on foot | 11.8 (max 18.4) | 0.71 (max 1.45) |

In goku's budget walk (the Potos probe, 160 frames, maps 131 and 16)
flight's code takes 2.67 lines a frame at the median and 3.16 at p90 with
Goku walking, 2.19 and 2.71 with Goku out of play: most of it is the
movement hooks, which run for every actor either way (D359 ~27
instructions a frame, D651 ~24 with combat's recoil gate ~15, D778 ~14,
D849 ~12, DA6E ~10). Walking adds the walk frame (~35 instructions: the
pad, tick, menu, event, play and map checks, the A mask and the posts) and
the step's hole check (~10 off the hole maps). goku's budget test (p90
logic end, Goku on against Goku off): 401 → 424 (23; fractional p90s 401.04
→ 424.71), main without flight 399 → 422 (23; 22.62 fractional), limit 24.
Before the walk mode it read 401 → 429 (28), and 400 → 432 (32) before the
on-foot paths.

The walk's end pays what the walk deferred: the first frame after a long
walk asks canLand on a fresh tile cache (a takeoff press after 60 walked
frames: 24 lines on that frame, 70 on the next; the per-frame anchor took
10 and 78), and a new map's context loads on the frame after the map
change (about 13 lines).

`phases.mjs` splits a steady flying frame (~2,200 flight instructions,
26-33 master cycles each: the tile cache and the hero grid are SRAM,
reached with long addressing):
the D651 movement hook ~530 (sweep, grid masks, bounds), settle ~525 (four
hero-tile lookups, companion follow), the frame ~480 (hero canLand/canFly,
grid refresh), D778 ~340, publish ~155, D359 70-100, lift and decide ~100.
A new row or column of tiles entering the hero grid costs ~2,400 more
(tile classes, air routes; ~4,000 for a row of bank tiles, whose rule walks
up to 16 tiles each way). Instant Transmission adds ~4,300 instructions on
the press (target search with landings) and ~3,500 at arrival (landing
again, gather, camera), one-off; idle teleport bookkeeping ~45 per frame.
The ceiling escape's roof-colour search costs ~12,000 once, at the impact
(one dropped frame during the quake).

Done so far: footprints inside the hero grid answered from column/row
pattern tables (no tile rectangle, no bounds when the grid is well inside
the map), the grid's tiles checked once per phase, hero canLand through
the grid with a per-frame position memo, whip rays by index arithmetic with
a quick pad pre-check, unit `fl_step`s by index arithmetic, the D778
endpoint canFly implied by the sweep, rolling tile-cache expiry (two slots
a frame), the on-foot settle skipped on an anchor at the same spot, quiet
frames for every reason Goku cannot act, the on-foot frame (`fl_onfoot`)
with the lazily moving hero grid and its shifted verdicts, the walk mode
(the anchor asked at the walk's end), floor-hole providers asked only on
the maps that can have holes, an unrolled tile-cache clear (7 lines → 1).

Next steps: per-direction distance-to-shore memos for the bank, gap and
air-route walks (each new tile repeats its neighbours' walks), one
hero-tile fetch per settle instead of four, D778's endpoint canLand handed
to the next frame's hero memo (keyed by a grid epoch), the hottest fields
in WRAM or direct page (shorter addressing), a larger tile cache.

## Remaining

- Resolved before this review: floor-hole providers now chain, including
  Sandship and the test provider; `holes` passes. Map 255 fractures stay out
  of `!FLM_HOLES`, matching the browser. FX now draws ceiling debris; its
  `debris` suite and flight's roof escapes pass.
- Resolved 2026-10-18: the native actor OBJ entry skips carried CPU
  companions' bodies, attachments and shadows. Actor state stays live;
  landing shows them again, and a human-controlled companion is never hidden.
  `scene` checks those three cases. Shore searches also reuse their fetched
  descriptors and known dungeon result instead of repeating those checks
  along every ray.
- Resolved 2026-10-18: flight owns L+R for both outdoor takeoff and roof
  escape. World's second chord reader no longer bypasses boss, status,
  scene or recovery-camera locks. The public world takeoff API also asks
  the shared boss check, including Vegeta's custom target post (kind 3).
  `world takeoff-locks`, ordinary takeoff and all seven roof exits pass.
- Instant Transmission: `mod.facing` comes from `E010` (the browser also
  turns it on the press frame's new direction, which combat's aim tracks);
  the action now advances by elapsed field vblanks, capped at four like
  combat, while the camera still holds age 4 until its rows arrive. `scene`
  injects three real missed frames across the 16-bit clock wrap and checks
  catch-up, recovery and the arrival cue. The vegeta module posts Vegeta, but in
  the Time Chamber no spot around the arena passes `findLanding` in either
  engine (its floor tiles are not floor flight accepts), so L+B does nothing
  there; if the trial is meant to allow it, the chamber needs tiles
  `canLand` accepts (or a landing rule of its own in both engines). Frieza's
  custom target and combat virtual-target API are already wired.
- Resolved 2026-10-18: combat mirrors the browser's `teleport.pending`
  branch while `!fl_hook` bit 2 is set: no new attacks/focus, the current
  action only advances. `scene` exercises a recovery-camera scroll, holding
  L+Y during it and checking that charging works once it finishes.

## Core requests

- More WRAM or SRAM for flight: the tile cache (64 entries) and the hero grid
  share 1 KiB of SRAM with the flood fill; a bigger cache would cut repeated
  air-route walks.
- A core-provided per-frame `canAttack`/field state would remove duplicate
  checks across combat, story and flight.
- WRAM for flight's hot work fields (the hero grid, sweep memos, about
  $100 bytes): SRAM is as fast per access, but only long addressing
  reaches it (a byte more per access, X-only indexing).
