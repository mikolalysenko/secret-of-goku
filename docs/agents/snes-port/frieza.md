# FRIEZA module: Frieza's arc, the ground fight, Thanatos, the fed Beast, deaths and victory

Spoilers. Part of the [SNES cartridge port](../snes-rom.md) ([plan](plan.md),
[engine notes](engine.md)). Source: `snes/src/modules/frieza/`, generator
`snes/gen/frieza.mjs`, tests `snes/test/frieza/`. Browser references:
`engine/frieza.js` and its helpers (`frieza-events`, `-intro`, `-staging`,
`-sprite`, `-combat`, `-arena`, `-crisis`, `-flyby`, `-tree`, `-tree-view`,
`mana-tree-vista`), `beast-challenge.js`, `battle-retry.js`,
`boss-rush-death.js`, `boss-victory.js`, `fortress-collapse.js`,
`frieza-score.js`. The story module already compiled every Frieza event
(see [story.md](story.md)); this module implements the hooks and queries
those scripts call, Frieza's picture and the fights.

## Status

| Part | State |
| --- | --- |
| Story state machine: every `FRIEZA_*` hook (frieza.js `onEvent`), all `FRIEZA_*` / `BEAST_*` queries, persistence, legacy loads | Done |
| Object overlays: the Emperor (map 431), exterior Jema (195), arena 246 suppression and the trial's Dyluck/Thanatos staging; door 3FC entry beside the Emperor | Done |
| Debug presets: `FRIEZA`, `FRIEZA_EVENT` (battle start), `CHALLENGE`, `SCENE` (stage palace, Beast started) | Done |
| Frieza's 48 px sprite (both forms, 24 px tiny frames) in every cutscene pose of `frieza-staging.js` / `frieza-intro.js` | Done (court, altar, temple, deck, depart) |
| Music cues (`frieza-score.js` choice) through the audio module | Done (bound when audio is built in) |
| Ground fight phase one and two, first power surge, floor scars | In progress (start position only) |
| Emperor's execution beam, Death Balls, Balls rising, Tree vista, flyby | Not yet |
| Beast challenge rules (`beast-challenge.js`): choose/feed, the Beast's HP (65,535 fed, 48,000 ordinary, wounds kept), start (Goku 999 HP), eruption lanes and their damage, victory; Goku's damage to the Beast (1/2, 1/8 fed) and the empowered Dark Lich (1/4) through combat's `!COMBAT_HOOK_DAMAGE` | Done (logic; the lanes' sprites wait for fx) |
| Frieza's ki for Dark Lich: 48,000 HP, attack +48/+24, two boosts (+10% HP, +16 attack) with Frieza's taunts | Done (logic; the orbs and aura wait for fx) |
| Incoming-damage cap of the fed Beast (110/140, 75-frame grace) | Needs combat's damage-receive hook (Requests) |
| Finale deaths, victory flow, Fortress collapse | Not yet |

## Scenes and timings (from the JavaScript)

Frames are field frames (60 Hz). "Age" is the scene clock the module keeps
in `!fz_sage`; the hover bob is `round(sin(clock·π/96))` over the scene
clock carried across scenes of the same map.

| Event | Scene | Map | What happens |
| --- | --- | --- | --- |
| A8 theft (4A4/4A6/A7/D9/DD route here) | `waiting` | 431 | stage theft; cancel combat, land |
| 4A7 | `emperor-wait` | 431 | the Emperor stands (record 3 visible), door 3FC enters beside him |
| 66 | `emperor-shot` | 431 | pink ray from stage right hits his chest at age 6; black frame with his white/pink silhouette ages 6-22, ray to 28, sparks 6-36 |
| 67 | `emperor-fall` | 431 | his actor vanishes at age 12; CF44 >= 3 |
| AC | `reveal` | 431 | altar camera pans up over 300 frames; Frieza glides in from the right over ages 140-300 (`altarPose`), laugh at 300 (104 off the altar map) |
| 1A8 | `altar-approach` | 431 | Goku's altar run (goku mode `$28`) |
| AD | `steal` | 431 | stolenMask = ledger; the Balls rise from the pouch over 60 frames |
| 7B | `altar-leave` | 431 | stage palace; climbs off the top over 120 frames, scene ends at 130 |
| 4A9 | `fanha-finish` | Fanha's | his laser crosses in 24 frames, burst 12-72 |
| 69 / 6A | `temple-exit`, `core-arrival` | 431 / 195 | outdoorIntro; 96-frame descent to (180,145) |
| CC / D6 / D7 | `core-charge`, `core-shot`, `core-impact` | 195 | Death Ball 64 -> 224 px from age 24 over 120 frames; thrown over 100 frames, plunges below the picture; eruption at 50: seven explosions 12 frames apart (74 each) |
| D8 | `core-escape` | 195 | twilight (CF41 >= 3, CF44 >= 6, CF45 >= 1), stage hunt, flyby armed |
| flyby (1F04) | world flight | Mode 7 | arrive 48, grow 64, full 330, throw 360, impact 404 (seven large bursts, 8-frame white checker), leave 440, announce 470, done 560 |
| AF / BF | `eighth`, `depart` | 195 | eighth Ball over Goku; departure climb (120 frames) |
| 178-17D, 19D, 1A4 | `tree-*` | 236 | vista: arrival 96 (+8 laugh), 32 px Death Ball, 40-frame throw, five bursts, 20-frame white, 48-frame shake, 120-frame departure, 48-frame fade to black, 40-frame wake |
| F6 / 6E / 129 / 6F / 71 | `trial-entry`, `trial-taunt`, `empower`, `trial-leave`, fade | 246 | court at (350,400); three charge orbs travel to Thanatos (72 frames, 24 apart), pink aura 72-140; climb off over 112 frames; native 60-frame fade |
| 12A | | 246 | trialWon, stage hunt |
| C1 / C2 / C3 / C5 | `taunt`, `lift`, `explode`, `gold` | 246 | descent to (280,380) over 96 frames; Popoi rises to Goku's left over 48 frames (altitude <= 44); burst on Popoi (74); permanent Super Saiyan, aura over 28 frames |
| C6 | battle | 246 | the ground fight (below) |
| C7 / C8 / C9 | victory, defeated, revive | 246 / ending | pouch recovered (`story_api_quest_recover`); companions back |

Ground fight (`frieza.js`, `frieza-combat.js`): 96,000 HP; nodes around
Goku at (-60,-50), (60,-50), (60,30), (-60,30), (0,-30); rush 7 px/frame
every 105 frames; attacks orb / disc / laser with a 65-frame warning (55
enraged) and a 180-frame recovery (140); Death Orb 310, disc 230, laser 170
damage with 48 frames of grace, halved in phase one; discs home at .032
rad/frame (.038 under half HP) and hurt Frieza after 40 frames (12,000, a
75-frame stun, floor break); Goku's hits deal 15% (65% stunned); thresholds
64,000 and 32,000 start the surges. Surge one: 380 frames, muscular at 270,
floor breaks at 270 and 294. Phase two adds two discs, three orbs, an
eruption every third attack (65-frame warning, radius 28, 280 damage) and
a riposte after two melee hits within 120 frames.

## Hardware approach

- **Frieza** is up to eight 16x16 OBJ per frame. `snes/gen/frieza.mjs`
  runs the browser's own `prepareFriezaSprite()` on both sheets (normal and
  full power) and cuts each frame, at 48 px and at the tiny 24 px the Tree
  vista and orbit use, into the smallest cover of 16x16 pieces it finds
  (1-7 pieces). Tiles are stored per frame as the top halves of all pieces,
  then the bottom halves, so a frame uploads into one buffer's two tile
  rows with two DMAs (at most 1 KiB).
- **VRAM**: two buffers of eight cells, OBJ tiles `$0C0-$0DF` and
  `$0E0-$0FF` (word `$6C00-$6FFF`), inside the enemy actor area that no
  actor streams into while Frieza is on screen (surveyed in every Frieza
  scene: maps 246 battle/trial/Thanatos, 255, 418, 431, 237, 253). A frame
  not resident is uploaded into the back buffer in the field NMI (after the
  game's own uploads, when `core_vblank_lines` allows) and shown from the
  next frame, so a pose change lags one frame and the picture never mixes
  two frames. Residency is dropped on any map change, mode change or dark
  frame (loads may rewrite OBJ VRAM).
- **Palette**: the browser's fixed 15-colour Frieza palette, plus the
  boss-death red and white variants and the afterimage ghost colour. Each
  frame the module picks an OBJ palette no native sprite uses (7, 4, 6, 5,
  then 3, 2, 0) and writes it to CGRAM in vblank after the game's upload.
  None of Frieza's maps applies colour math to sprites.
- **Depth**: in front of the native sprites (`core_oam_add_front`), as the
  browser draws its Frieza layer at OAM index 0; behind them when the front
  slots are taken. Priority 3 (under BG3 dialogue).
- **Poses** are evaluated in the generator from `frieza-staging.js` /
  `frieza-intro.js` into per-age tables (court descent and climb, arrival,
  departure, altar reveal and leave) and the 192-entry hover table, so the
  cartridge places Frieza on the same whole pixels.
- **Camera** = `engine/view-camera.js`: the tile-stream origin `$A8/$AA`
  plus BG1's fine scroll (`$B0/$B2` with the quake bits `$5E/$5F`).

## Resources

| Resource | Use |
| --- | --- |
| Code `$A6:8000-EFFF` | `!CODE_FRIEZA`; `$A6:F000-FFFF` bindings (`bind.asm`, assembled after every module) |
| Data `$E6:0000-7FFF` | frame descriptors, palettes, pose tables, timings (generated) |
| ROM `$F0:0000-7FFF` | Frieza's OBJ tiles (15.5 KiB of 32) |
| WRAM `$7E:DB00-DBBF` | `!RAM_FRIEZA`: scene `+$00-$53`, renderer, battle `+$58-$89` |
| SRAM `$31:6180-61FF` | `!PERSIST_FRIEZA`: `+$00` version, `+$01` stage, `+$02` tree, `+$03` flags (word), `+$05` stolenMask, `+$06` crisis, `+$07` Beast challenge, `+$08` flyby age; `+$40-$7F` reserved for the orbit stream |
| VRAM | OBJ tiles `$0C0-$0FF` while Frieza is drawn |
| CGRAM | one free OBJ palette, in vblank |
| OAM | up to 8 front sprites for Frieza |
| DMA | channel 7 in the field NMI |

Original code patched: `C1:E7F2` (4, `LDA $C83002,X`, door table): door
3FC's entry byte is 36 while the Emperor is present.

## API

Story hooks (all `FRIEZA_*`, `BEAST_CHOOSE_*`, `BEAST_VICTORY`,
`OBJECT_FRIEZA`) and queries (all `FRIEZA_*`, `BEAST_*`) are defined in
`module.asm`. The trial staging of map 246 (Dyluck, Thanatos), which the
story catalogue lists under `OBJECT_TRIAL`, is part of `OBJECT_FRIEZA`
because the trial is Frieza's.

Dispatch: `modules_field_frame` -> `frieza_field_frame`,
`modules_field_nmi` -> `frieza_field_nmi`, `modules_load` ->
`frieza_load`, `modules_new_game` -> `frieza_new_game`,
`!DEBUG_PRESET_HOOK_ANY` -> `frieza_debug_preset`.

## Tests

`node snes/test/frieza/run.mjs [case …]` (Mesen; bundles from
`.local/snes-import`, references from `.local/snes-ref`). Each case imports
a browser preset, writes the mod's Frieza state from its snapshot
(`state.mjs` maps `goku.frieza` onto the module's fields by parsing the
module's defines), runs, and compares screenshots with the browser frames
(best of a +/-2-frame window, `snes/test/debug/compare.mjs`).

| Case | Checked |
| --- | --- |
| `court` | preset `frieza`: the trial court; Frieza's OBJ at the court anchor; 98% of pixels equal the browser at frames 60/240/600 (the rest is the reference's resampling) |
| `thanatos` | preset `thanatos`: trial-entry with the full party; the native event moves on to `trial-taunt` through the hooks; 98-99.9% |
| `battle` | preset `battle`: Frieza at his first node; 100% at frame 60 |

## Requests

- **combat**: Frieza is a virtual enemy in the browser (`entity()` index 12,
  species 121, `hit()` with 15% / 65% scaling). Combat's target scans only
  see native actors 3-11. Request: a virtual-target hook, e.g.
  `!COMBAT_HOOK_VIRTUAL` (JSL; returns C set and X/Y = map position, A =
  HP > 0 while a virtual foe exists) consulted by `cb_targets`, the
  projectile scans and the transformation burst, and
  `!COMBAT_HOOK_VIRTUAL_HIT` (A16 = damage, X16 = 0 punch / 1 other;
  returns A16 = damage dealt) called instead of `cb_hit` for it. Instant
  Transmission (flight) should list the same virtual target.
- **flight**: a JSL `canLand(x, y, layer, terrain)` service
  (`!FLIGHT_API_CAN_LAND`, A16 = x, X16 = y, Goku's layer/terrain) for the
  patrol nodes, floor fractures and the landing search; a scripted camera
  target at 1 px per frame through the dispatcher hooks it owns
  (`C0:D651`/`C0:DA6E`) for the altar pan (300 frames to y 64) and the
  court (152, 260), as `frieza-intro.js installAltarCamera`.
- **core**: OBJ tiles `$0C0-$0FF` as a scene-scoped VRAM region in the
  pool, so other modules can see the claim.
- **combat (2)**: the fed Beast caps Goku's incoming damage at 110 (140 in
  base form) with 75 frames of grace, except the eruption's own damage
  (`beast-challenge.js` at `C0:4053`). Combat owns that patch site
  (`cb_hook_receive`); request a hook there, e.g. `!COMBAT_HOOK_RECEIVE`
  (A16 = queued damage on Goku, returns A16 = damage to apply). The module
  exposes `!fzx_pending` (the eruption damage it queued) for it.
- **debug**: `UNTIL map + CAN_ACT` is satisfied on the frame a door to that
  map starts (before its fade), so the `hexas` capture can land on the
  door frame with Goku still at the altar's coordinates (party0.pos
  248,442 expected, 232,242 captured; the picture 240 frames later matches
  100%). The wait should also require the load to finish (`$FF`, fade).
  Test builds (`-DDEBUG_TEST`): the module's ANY hook logs through
  `debug_test_hook_any` first (frieza's restores decide which route 429
  takes); a forwarding define in the debug module would be cleaner.
- **integration**: a 256-byte persistent extension for the browser's
  showdown snapshot of Primm's and Popoi's stats (`frieza.js` `s.primm`,
  `s.popoi`). Without it the revive only refills their HP and clears
  their status.
