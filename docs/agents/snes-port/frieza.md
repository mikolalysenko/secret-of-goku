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
those scripts call, Frieza's picture and the fights. The orbit stream
(`orbit.md`) owns everything from the second power surge on.

## Status

| Part | State |
| --- | --- |
| Story state machine: every `FRIEZA_*` hook (frieza.js `onEvent`), all `FRIEZA_*` / `BEAST_*` queries, persistence, legacy loads | Done |
| Object overlays: the Emperor (map 431), exterior Jema (195), arena 246 suppression and the trial's Dyluck/Thanatos staging; door 3FC entry beside the Emperor | Done |
| Debug presets: `FRIEZA`, `FRIEZA_EVENT` (battle start), `CHALLENGE`, `SCENE` (stage palace, Beast started); other kinds go on to combat's handler | Done |
| Frieza's 48 px sprite (both forms, 24 px tiny frames) in every cutscene pose of `frieza-staging.js` / `frieza-intro.js` | Done (court, altar, temple, deck, depart) |
| Music cues (`frieza-score.js` choice) through the audio module | Done; each change holds the game loop while the song loads (Known differences) |
| Ground fight, phase one and two: patrol nodes, rushes, afterimages, Death Orb / disc / laser with warnings, enraged timings, homing discs that hurt Frieza and break the floor, eruptions, riposte, Goku's damage scaling, grace, the first power surge (muscular at 270, fractures at 270/294) | Done (logic and Frieza's sprite; shots drawn through fx) |
| Broken floor: `frieza-arena.js` fractures, flight's missing floor, the holes drawn on BG1 | Done |
| Second surge: hand-off to the orbit stream (`FRIEZA_ORBIT_SURGE`); without it a ground stand-in (enraged, no HP floor) | Done (hand-off) |
| Victory beat on the ground (`boss-victory.js`): death cue, bursts, red/white flashes, music fade, whiteout, fanfare, pouch chime, event C7 | Done |
| Finale deaths (`battle-retry.js`, `boss-rush-death.js`): Frieza, empowered Thanatos, the Mana Beast; native death kept, warp and boss-victory events gated, revert, fade, black / ending module's planet | Done |
| Dangerous encounters for combat (`native-hit-recovery.js` `dangerous()`) | Done |
| Beast challenge rules (`beast-challenge.js`): choose/feed, the Beast's HP (65,535 fed, 48,000 ordinary, wounds kept), start (Goku 999 HP), eruption lanes and their damage, victory; Goku's damage to the Beast (1/2, 1/8 fed) and the empowered Dark Lich (1/4) through combat's damage list (`modules_combat_damage`) | Done (logic; the lanes' sprites wait for fx kinds) |
| Frieza's ki for Dark Lich: 48,000 HP, attack +48/+24, two boosts (+10% HP, +16 attack) with Frieza's taunts | Done (logic; the orbs and aura wait for fx kinds) |
| Goku's attacks reaching Frieza | Through combat's virtual targets (`modules_combat_targets`: `frieza_virtual_target` / `_hit`, index 12, airborne); combat's `frieza-punch`, `-ki`, `-ki-held`, `-beam`, `-wave`, `-burst` cases pass against the browser's `hit()` |
| Incoming-damage cap of the fed Beast (110/140, 75-frame grace) | Done: `frieza_combat_receive` in combat's `modules_combat_receive` (case `beast`: 110 / 140, nothing in the grace, the eruption's pending damage whole) |
| Goku's beam cancelling Frieza's shots (`beamTouchesShot`) | Done: `fz_bind_beam_touches` on `combat_api_beam`'s record (`beamGeometry()`, the full wave's taper) |
| Cutscene effects (`frieza.js` draw(), the scene branch): the deck's Death Ball (charge and throw poses from `friezaDeathBallPose`), the eruption's column of large bursts, Fanha's beam and burst, Popoi's end, the empowering orbs and Thanatos's aura, Goku's gold aura | Done through fx (auras as fx's polygon); the cinematic Death Ball uses fx's red style (Known differences) |
| The Dragon Balls rising to the altar (steal) and the eighth Ball | Done (own art, generated) |
| The Emperor's execution: ray, black frame with his silhouette, sparks | Done (the ray is fx's Death Beam) |
| The Fortress's collapse on its destroyed deck (map 255): fractures, scars, red alarm | Done (alarm as a red add only; fractures on landable floor with flight's canLand) |
| Altar camera pan (reveal, steal) and the court camera | Done through flight's scripted camera (`!FLIGHT_API_CAMERA`; checked on a trial merge with flight) |
| The Tree (event 5F8): establishing view, arrival, the 32 px ball, throw, impact (shake, white, five large bursts, ruins), departure, return to black, wake on the ash field; Goku on the cliff | Plays end to end on the cartridge (case `tree`); the HUD stays visible over the cliff (Known differences) |
| Goku as the scripted follower (`introHero`): the temple exit (431), the deck's scenes (195: core-*, depart, eighth) | Done through goku's `goku_api_scripted` (poses generated from `frieza-staging.js`) |
| Flyby in world flight (1F04, `frieza.js` tick()/drawFlyby) | Done: the existing clock, cues, crisis, announcement, eighth Ball, Tree pursuit and Kai warning now have Frieza, the growing/thrown cinematic ball, seven staggered large bursts and the eight-frame checker. `flyby` checks both forms against browser-composed stills; the large ball's surface and crowded explosions are approximations (Known differences). |

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

## The ground fight (`frieza.js`, `frieza-combat.js`, `frieza-arena.js`)

96,000 HP (17 bits: `!fzf_hp_lo` word + `!fzf_hp_hi` byte). Nodes around
Goku at (-60,-50), (60,-50), (60,30), (-60,30), (0,-30), each kept only
where flight can land; a rush (7 px/frame) every 105 frames, one afterimage
every third dash frame shown for 16 frames. Attacks orb / disc / laser with
a 65-frame warning (55 enraged) and 180 frames of recovery (140); Death Orb
310, disc 230, laser 170 damage with 48 frames of grace, halved in phase
one; discs home at .032 rad/frame (.038 under half HP; table-driven:
`frieza_cos/sin_table` for speeds 3, 4, 7 over 256 headings, the 257-entry
`frieza_atan_table`) and hurt Frieza after 40 frames (12,000, a 75-frame
stun, a floor break). Goku's hits deal 15% (65% stunned), `floor(d·k/20)`
on 32 bits. Thresholds 64,000 and 32,000 end a phase; a threshold waits
while Goku's beam still shines (projectiles dropped). Phase two adds two
discs, three orbs, an eruption every third attack (65-frame warning, radius
28, 280 damage) and a riposte after two melee hits within 120 frames.

- **Surge one** (380 frames, the pad locked through combat's input lock):
  the full-power lines (UI), muscular atlas at 270 with a power burst and a
  fracture under him (radius 34), fractures around every node at 294
  (19 + 3i), grace 60 and clock 150 after.
- **Surge two** (`frieza-cosmic`): fractures at 24 (34) and 48 (29 + 5i),
  then `FRIEZA_ORBIT_SURGE` every frame (the orbit stream). Without it the
  ground stand-in ends the surge at 120 and Frieza fights on with no HP
  floor; his fall ends the battle on the ground.
- **Damage to Goku** goes through the native queue (`$E1F1`), so the native
  numbers, knock-back and death play; combat is told the encounter is
  dangerous (no scaling, no deflection).

### Broken floor

`fz_break_floor` is `fractureFortress()`: every 16x16 cell whose centre is
within the radius (`(2dx)² + (3dy)² <= (2r)²`) and that is already broken
or landable floor becomes a hole (the 1 KiB bitmap `!FZ_HOLES`, 128 x 64
cells). Flight asks `frieza_floor_hole` (`!FLIGHT_MISSING_FLOOR`, chained:
off the deck's holes the provider bound before it answers). On the
screen each visible hole's four BG1 tilemap entries point at sixteen
generated tiles: quadrant (TL, TR, BL, BR) x the two neighbours it touches,
which is exactly what `ruinMask` depends on (the edge test looks at most 5
px along the axes). Colours follow `scarColor` (cloud phases rotating every
24 frames through BG palette 6, speckle, dark wall, edge, sparkle). The
cloud, speckle and sparkle patterns use the cell's own coordinates instead
of the world's (the same within a cell, repeating per cell).

## Finale deaths and victory

- **Deaths** (Frieza on 246, the empowered Thanatos, the Mana Beast on
  253): `fz_death_tick` is `battle-retry.js` `check()`. The encounter key
  (`frieza_api_encounter`) is remembered while Goku can act on 246/253 and
  forgotten elsewhere; at Goku's HP 0 with a key (remembered or live) the
  native death plays. With the ending module, `ending_lose` (A: bit 3
  gold, bit 4 orbit; X: the key) draws the doomed planet and GAME OVER, and
  the ending's gate at `C1:E77E` skips events 7FF (all-party-dead warp) and
  42D/42F (boss victories); without it the module's own gate at `C1:E77B`
  does, and the module reverts the form at 18, fades 300-360 (brightness
  ceiling), holds black and returns to the title on Start (`JML $C10010`).
- **Victory on the ground** (`frieza_victory_*`): death cue `02 94 0F 80`
  at the fatal hit, twelve bursts 36-257 at `orbitVectors[(i·7)&15]·(12 +
  i%4·5)` plus the last at 326, the music fade at 143, Frieza flashing red
  and white (8-frame phases, 4 after 180) until he vanishes at 326, the
  whiteout 143-306, held to 631, cleared by 791, the boss fanfare at 375,
  the pouch chime once the fanfare ends (915), event C7 at 1035.

## Cutscene effects

`effects.asm` draws the scene branch of `frieza.js` draw() through fx
(`bind.asm` wrappers; nothing without fx):

- **Death Ball on the deck** (`core-charge`, `core-shot`): the diameter by
  age (64 -> 224 px from age 24, then shrinking with the throw) and the
  throw path for the three hover bobs are generated from
  `friezaDeathBallPose`; drawn as fx's red (cinematic) Death Ball at the
  ball's centre. The shared wrapper explicitly requests `FX_DBALL_CINEMATIC`;
  the Tree uses the same wrapper. FX draws the browser's red art at 16/32 px
  and a red window polygon at the other even diameters.
- **Large bursts** (`orbit-effects.js` burst large): nine Exploder bursts
  four frames apart, burst i > 0 moving out along `orbitVectors[(i*6)&15]`
  to radius 8 + min(24, t); offsets generated with the browser's `>> 8`.
  Each is an fx effect moved every frame from a 12-entry table; fx's 14
  slots bound how many show at once (the browser draws every one). Used by
  the eruption (seven bursts rooted below the screen, 12 frames apart),
  Fanha's end and Popoi's end.
- **Empower**: three pink charge-orb cells travel from Frieza's hand to
  Thanatos (72 frames each, 24 apart, the browser's rounding), then fx's
  pink aura on him; **gold**: fx's gold aura behind Goku, power over 28
  frames. **Fanha**: fx's fire strip from (280, -16) to him (a 16-step
  heading; fx's strips have four facings so far).
- **The Dragon Balls** (`balls.asm`): `dragon-balls.png` cropped and
  sampled as `ki-art.js` does (11 px, the eighth 18 px), 15 colours per
  palette by median cut. The seven rise in an opening ring (ring offsets
  by age generated; the straight part from Goku's spot to the altar at run
  time, whole and fractional pixels apart) and are drawn before Frieza (the
  browser draws them over him). VRAM: core's `FIELD_OBJ_A` region, claimed
  while a Ball scene draws and filled in Frieza's vblank before any sprite
  points at it; the second free OBJ palette.
- **The Emperor's execution** (`emperor.asm`): the hit's black frame keeps
  only sprites on the main screen (TM = OBJ) over a black backdrop without
  colour math; native sprites outside his body box are hidden and his
  cells take the silhouette palette (white, pink at 13-14). The ray is
  fx's Death Beam at his chest, the sparks fx's impact-spark cells.
- **The collapse** (`collapse.asm`): the spot grid (every 32 px of the
  view, away from Goku, on landable floor), three fractures at once and one
  every 32 frames with the break sound and a pulse; the scars use the holes
  renderer with the deck's colours in BG palette 2 (the only one map 255
  leaves free); the alarm is a fixed-colour add of red 2 + alarm to BG1 and
  BG2 in vblank.

## World-flight picture (`flyby.asm`, `_frieza-flyby.mjs`)

The generator evaluates `friezaFlybyPose`, `deathBallFlybyPose`,
`createDeathBallArt` and the native Exploder cells on the same clock as
`drawFlyby()`. Immutable per-age OAM, upload and HDMA records live in xdata;
only their address tables and palettes occupy Frieza's data bank. The
world callback prepares them before UI/world drawing. `world_draw` inserts
Frieza's picture after `world_fx_back` and before Goku, using world slots
through 54 and then the core's 88–127 run. It does not call the field FX
polygon renderer or use channels 2/3.

Sizes through 32 px are exact red OBJ art. Larger balls mask BG1/BG2 on
both screens with HDMA 6 (WH0/WH1); HDMA 7 writes COLDATA, never CGRAM.
World's native channels 0–5 remain intact. While the ball fills the sky,
each row averages its browser colours (the two-write COLDATA transfer
shares green/blue). From age 380 it uses one averaged backdrop colour per
frame, written in vblank, and leaves the native fog's fixed colours alone.
This avoids tinting the surrounding terrain during the distant impact.
OBJ is unaffected by the window; an exact red OBJ patch over Goku's
rectangle puts the thrown ball in front at age 360. Frieza stays in front.

The seven large bursts retain their browser centres, ten-frame stagger,
nine sub-bursts, four-frame offsets, rotations and native animation cells.
Fully occluded pieces are removed; when a line would exceed 30 burst
slivers, the least visible pieces are omitted. Forty canonical reflected
Exploder cells fit the borrowed B/C atlas. The checker, ages 404–411,
temporarily selects 8/32 OBJ and covers the screen with 56 cells: 32
slivers per line. Frieza, Goku and the first explosions are composited into
those cells, preserving the checker over the actors without overflow.
Normal Goku uploads resume just before the checker ends. Static art is
preloaded and changed checker tile rows alone are transferred in vblank.

The flyby claims scene SRAM (asset tags at `!SRAM_WORK_SCENE+$1400`,
deferred-upload counter at `+$1480`) and world OBJ B/C with owner 6 after
invalidating UI residency. 1F04's existing `$8C` guard hides both radar and
world panel throughout. Palette 7 is Frieza; palette 6 replaces the idle
world effects; checker Goku temporarily uses a dedicated palette 5.
World A's idle effect cells hold the checker. At age 550 B/C and scene SRAM are released,
world effect residency is invalidated and the normal windows, 8/16 OBJ,
backdrop and world fog (`CGWSEL=2`, `CGADSUB=$21`) are restored. Goku's
normal palette is restored when the checker ends. Field sprite scratch
holds only world-local pointers/flags; field initialization invalidates it.

The `flyby` case captures raw PPU frames at arrival, growth, full size,
throw, impact, every checker frame and departure. A private
`FRIEZA_FLYBY_HIDE` build captures the identical native flight underneath;
`flyby-reference.mjs` composes the browser functions over it, respecting
Goku's actual OAM mask and the cartridge's global brightness. Stills,
reference/difference PNGs and per-still agreement JSON stay under
`.local/snes-test/frieza/flyby{,-ssj}/reference/`. The case asserts sprite
and checker agreement, sphere silhouette, explosion retention, unchanged
background, no lag/OBJ overflow, vblank DMA and no deferred art uploads.

Measured on Mesen (both forms, 549 visible-clock frames each): **zero lag,
OBJ overflow, deferred uploads or active-display DMA**. Complete world NMI
peaks at **34.89 of 37 vblank lines**. Frieza logic averages 2.96 lines
(max 6.75), OAM drawing 8.31 (max 39.80, including interrupt time), and its
NMI 6.16 (max 20.43). Idle world logic is 0.139 lines (max 0.24), using the
`FZI_WORLD_IDLE` WRAM cache cleared by every `fz_wake`; the idle draw and
NMI entries are about 0.15 and 0.12 lines each. Field rendering and the
field Death Ball renderer are unchanged.

Base-form per-still agreement below uses a 24/255 per-channel RGB tolerance
after native brightness. “Art” counts only browser-overlay pixels, so the
simplified large-ball surface is visible in the figures rather than hidden
by the background. Frieza and the small ball are 100%; all eight checkers,
including their Frieza and burst pixels, are 100%. Super Saiyan has the
same overlay scores (minor background differences at the body's animation
transition); the thrown sphere's pixels over Goku are 100%. Large-ball
silhouette agreement is 98.0–99.4% across both forms.

| Age | Whole frame RGB % | Art RGB % | Ball silhouette IoU % | Burst RGB % |
| --- | --- | --- | --- | --- |
| 36 | 100.00 | 100.00 | — | — |
| 80 | 100.00 | 100.00 | — | — |
| 180 | 98.82 | 43.13 | 98.53 | — |
| 330 | 87.33 | 10.90 | 99.40 | — |
| 360 | 87.33 | 8.67 | 99.34 | — |
| 376 | 77.94 | 10.09 | 98.07 | — |
| 398 | 93.01 | 28.27 | 99.15 | — |
| 403 | 98.80 | 49.56 | 99.25 | — |
| 404 | 99.99 | 100.00 | — | 100.00 |
| 405 | 99.99 | 100.00 | — | 100.00 |
| 406 | 99.99 | 100.00 | — | 100.00 |
| 407 | 99.99 | 100.00 | — | 100.00 |
| 408 | 99.99 | 100.00 | — | 100.00 |
| 409 | 99.99 | 100.00 | — | 100.00 |
| 410 | 100.00 | 100.00 | — | 100.00 |
| 411 | 100.00 | 100.00 | — | 100.00 |
| 412 | 99.99 | 100.00 | — | 100.00 |
| 438 | 99.94 | 99.28 | — | 99.17 |
| 476 | 99.40 | 94.75 | — | 94.35 |
| 510 | 99.99 | 100.00 | — | 100.00 |

Validation on 2026-10-20: strict production build; **Frieza 29/29** (including
fresh browser references for all eleven optional scene cases), **world
15/15**, **UI 12/12** (including radar/world panel), and **FX 6/6**, all pass.
`modprof` also ran on the sword and battle perf states. The perf suite passes
its five field scenes; `preset__flight` reports zero completed frames out
of 304, identically on the private pre-task ROM. That existing fixture/probe
failure is still open; the world suite's timing case and the direct flyby
lag/vblank probes pass. Logs and JSON are private under
`.local/snes-test/flyby-*-suite.log` and the individual module directories.

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
- **Holes**: BG tiles `$1C0-$1CF` (word `$1C00`), unused by every map of
  graphics set 21 (maps 177, 237, 242-251), uploaded once per stay by
  Frieza's own vblank DMA before any entry points at them; BG palette 6
  (unused by map 246's layers) in the game's CGRAM buffer. The write list
  (two entries per tilemap row, at most 64 rows) is rebuilt when the camera
  crosses a tile and every 64 frames (the native streamer may have redrawn
  the cells) and written in vblank, about two rows a scanline.
- **Whiteout**: fixed-colour addition on every layer (`CGWSEL 0`,
  `CGADSUB $3F`, `COLDATA`) in vblank; the map's own colour math (`CGWSEL
  2`, `CGADSUB = [$23]`, `COLDATA $E0`) comes back the vblank after.
- **Quiet path**: a busy frame that ends with nothing of Frieza's running
  (dormant or defeated, no scene, pending work, cue, quake, death, Lich,
  Balls or Frieza map; or Goku not yet arrived) sets `!FZI_IDLE`
  (`fz_try_quiet`). Quiet frames compare `$DC` with the last map and
  return; every 4th frame they check the state again (the safety net), and
  in turn Goku's arrival (every 16 frames) and Dryad's hint (every 64). The
  permanent form is put back on any quiet frame Goku lost it. Every state
  change wakes the module (`fz_wake`: hooks' deferred work `fz_defer`, cues,
  flag and stage setters, the guard's derivation). The vblank reads one bit
  (`!FZV_NMI`, set by `fz_vram_settle` when the frame left it work) and the
  first quiet vblank clears the requests.
- **Scene SRAM ownership** (core's `core_scene_claim`, owner
  `!SCENE_FRIEZA`): the module holds `!SRAM_WORK_SCENE` while something of
  Frieza's needs it (a scene, the fight, one of his maps: `fz_scene_sram`)
  and gives it back on the first busy frame nothing does, when an ending
  starts, and before going quiet. A fresh claim forgets what the area held
  (`fz_sram_reset`); a session's start (load, new game, an imported state,
  a debug restore) claims it at once so restores can write there. While
  another set piece holds it (an ending, Vegeta's trial, the Sandship's
  `$32:7600-7FFF`) only the module's WRAM work runs: no scene logic, no
  drawing. `!FZI_SRAM` records that the area holds Frieza's state. The
  orbit stream works in `$32:6000-6FFF` inside Frieza's fight, under his
  claim. Per-frame requests the vblank acts on (the Ball set, the vista)
  live in WRAM (`!fz_vista`), never in the shared SRAM.
- **Vblank work is granted per frame**: the hole tiles and rows and the
  whiteout run only when this frame's field logic set the matching
  `!fz_tflags` bit (cleared at the start of every field frame), so stale
  battery-backed scene SRAM never reaches VRAM or the PPU on other maps.
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
| Data `$E6:0000-7FFF` | frame descriptors, palettes, pose and trigonometry tables, hole tiles, timings (generated) |
| Extended data | 225,027 bytes of flyby art, immutable frame records and HDMA tables; allocated through `xdata` |
| ROM `$F0:0000-7FFF` | Frieza's OBJ tiles (15.5 KiB of 32) |
| WRAM `$7E:DB00-DBBF` | `!RAM_FRIEZA`: scene `+$00-$57`, battle `+$58-$89`, Lich/Beast `+$8A-$AB`, scratch and death/victory `+$AC-$BF` |
| SRAM `$31:6180-61FF` | `!PERSIST_FRIEZA`: `+$00` version, `+$01` stage, `+$02` tree, `+$03` flags (word), `+$05` stolenMask, `+$06` crisis, `+$07` Beast challenge, `+$08` flyby age; `+$40-$7F` reserved for the orbit stream |
| SRAM `$32:7000-7FFF` | scene work while Frieza's scenes run: `+$000` hole list and write list (`!FZHB`), `+$800` fight block (`!FZSB`: tag, warning, shots, hazards, afterimages, test mailbox, arena, victory), `+$C00` the hole bitmap. The orbit stream keeps to `$32:6000-6FFF` |
| VRAM | core pool regions, owner `$06` (`!FZ_VRAM_OWNER`), claimed by the frames that use them and given back on the first busy frame that does not (`fz_vram_settle`): `!VRAM_SCENE_OBJ` (OBJ tiles `$0C0-$0FF`) while Frieza is drawn, `!VRAM_SCENE_BG` (BG tiles `$1C0-$1CF`) while holes show on maps 246 and 255, `!VRAM_FIELD_OBJ_A` while the Dragon Balls show; a region another scene holds is not drawn into. Plus the BG1 tilemap entries of visible holes |
| CGRAM | one free OBJ palette (two with afterimages or the Balls), in vblank; BG palette 6 (map 246) or 2 (map 255) colours 1-7 in the game's buffer while holes show |
| OAM | up to 8 front sprites for Frieza (one `core_oam_meta_front` call a frame: the generated frame descriptors hold its 4-byte pieces; afterimages behind through `core_oam_meta`), 7 for the Balls; native slots rewritten during the Emperor's black frame |
| Registers | in vblank, per frame and only when this frame's logic asked: the whiteout (CGWSEL/CGADSUB/COLDATA), the black frame (TM, CGADSUB, CGRAM 0), the collapse tint; the map's values come back the vblank after |
| DMA | channel 7 in the field NMI |

Original code patched:

- Door 3FC's entry byte is 36 while the Emperor is present: with destroy's
  door record patch (`C1:E7DF`, 25 bytes) through `!DOOR_RECORD_HOOK =
  frieza_door_record` (defined at the top of `modules.asm`); builds without
  it (no `DESTROY_DOOR_HOOK` or `SS_ESCAPE_DOOR` define) patch `C1:E7F2`
  (4, `LDA $C83002,X`) themselves.
- `C1:E77B` (6, `REP #$30 / PHX / CMP #$0800`, event dispatcher): the
  finale death gate (events 7FF, 42D, 42F skipped while a finale death
  runs; `JML $C1E7C5`), built only without the ending module, whose own
  gate at `C1:E77E` does the same.

Include order (`modules.asm`): none against combat (its lists name
Frieza's routines); `!FLIGHT_MISSING_FLOOR` keeps whatever provider was
bound before Frieza's (`!FRIEZA_NEXT_FLOOR`: destroy's breach, flight's
test hole) and jumps to it, so any order of those modules works.

## API

Story hooks (all `FRIEZA_*`, `BEAST_CHOOSE_*`, `BEAST_VICTORY`,
`OBJECT_FRIEZA`) and queries (all `FRIEZA_*`, `BEAST_*`) are defined in
`module.asm`. The trial staging of map 246 (Dyluck, Thanatos), which the
story catalogue lists under `OBJECT_TRIAL` (hook 49, left a stub), is part
of `OBJECT_FRIEZA` because the trial is Frieza's: records 0 and 1 get bytes
2-3 `$978F` / `$9792` while the trial runs or is pending, else every record
is hidden while Frieza is active or his entrance pending, the two exclusive
cases of `native-story.js` storyRead (no story overlay touches map 246, so
the earlier position in the overlay order changes nothing).

Dispatch: `modules_field_frame` -> `frieza_field_frame`,
`modules_field_nmi` -> `frieza_field_nmi`, `modules_world_frame` ->
`frieza_world_frame`, `modules_world_nmi` -> `frieza_world_nmi`,
`world_draw` -> `frieza_world_draw`, `world_nmi_cell` ->
`frieza_world_body`, `modules_load` ->
`frieza_load`, `modules_new_game` -> `frieza_new_game`,
`modules_title_boot` -> `frieza_title_boot`, `!DEBUG_PRESET_HOOK_ANY` ->
`frieza_debug_preset` (unanswered kinds continue to `combat_debug_hook`).

| Entry | Contract |
| --- | --- |
| `frieza_world_draw` | JSL from world drawing, M16/X16, DB=$7E, D=0. Appends OAM at `w_cursor` / the core run. C set only when the checker supplies the complete picture, including Goku; preserves D. |
| `frieza_world_body` | JSL from world cell upload, M16/X16, any DB/D. C set while the checker supplies Goku and his ordinary VRAM upload should wait. |
| `frieza_world_nmi` | World vblank dispatch, M16/X16, DB=$80, D=0. Budgeted palette/art DMA and final window/HDMA setup; preserves DB/D. |
| `frieza_virtual_target` | JSL, any DB. C set while Frieza can be struck: A16 = species (121) with the fight's terrain byte in the high byte, X16 = x, Y16 = y (map, his feet + 12, as frieza.js `entity()`) |
| `frieza_combat_receive` | Combat's receive hook (`modules_combat_receive`): A16 = Goku's queued damage -> A16 = damage to apply (the fed Beast's cap) |
| `frieza_virtual_hit` | JSL, any DB. A16 = Goku's damage, X16 = 1 punch / 0 ki, beam, burst. Applies 15% (65% stunned), recoil, grace, thresholds; A16 = HP taken |
| `frieza_victory_start` | JSL, any DB. A16 = x, X16 = y where Frieza fell: the death cue now, the beat from the next tick (the orbit stream calls it in space) |
| `frieza_victory_tick` | JSL, any DB. Advances the beat; C set while it runs (`!fzv_age`, red/white phases, bursts, cues) |
| `frieza_floor_hole` | `!FLIGHT_MISSING_FLOOR` (JSL, M16/X16, DB = `$7E`): C set when (`!fl_q_x`, `!fl_q_y`) is a broken cell of the arena on map 246 at the deck's layer (`!fl_q_l`); otherwise the provider bound before Frieza's answers (`!FRIEZA_NEXT_FLOOR`, JML) |
| `frieza_api_encounter` | JSL, M16/X16, D = 0, any DB. A16: low byte the dangerous fight now (`battle-retry.js` `encounter()`): 0 none, 1 Frieza's ground fight (stage battle on 246, no surge, not in space), 2 the empowered Thanatos (species 121 alive on 246), 3 the Mana Beast (127 on 253); high byte Frieza's tier with 1 (`frieza:<tier>`). X, Y, DB kept |
| `!fzd_key` | WRAM byte: the key of the death in progress (or the last fight Goku could act in on 246/253); also passed to `ending_lose` in X |
| `frieza_q_crisis` | `STORY_Q_FRIEZA_CRISIS` (`frieza.crisisActive`): 1 from the core's impact (event D7, `newCoreCrisis`) until the wish repairs the core (`FRIEZA_REPAIR_CORE`); a restored preset that is stolen or permanent gets it active unless the wish was made (`restore()`'s fix-up). The ending's bad presets read it for the night globe |
| `frieza_door_record` | `!DOOR_RECORD_HOOK` (destroy's door record): JSL, M16/X16, D = 0, X = door * 4, A = record bytes 0-1, Y = bytes 2-3; door 3FC's byte 2 becomes 36 while the Emperor is present. Returns A and Y, keeps X |
| `frieza_combat_damage` | Combat's damage list (`modules_combat_damage`): A16 = Goku's damage, X16 = actor -> A16 (the Beast 1/2 or 1/8, the empowered Lich 1/4) |
| `!fzx_pending` | WRAM word: the eruption damage the module queued on Goku (for a receive hook that must not cap it) |

Optional modules are reached through `bind.asm` (`defined()` checks):
audio (`audio_sfx`, `audio_song`, `audio_song_restore`), combat
(`combat_api_cancel`, `_set_form`, `_state`, `_input_lock/_unlock`,
`_danger/_safe`, `combat_debug_hook`), fx (`fx_spawn`, `fx_flash`,
`fx_quake`), UI (`ui_say`, `ui_interrupt`, `ui_restore_first_flight`),
world (`world_fortress_destroyed`), ending (`ending_lose`, `!ending_status`),
flight (`!FLIGHT_API_CAN_LAND`), orbit (`!FRIEZA_ORBIT_SURGE`,
`!FRIEZA_ORBIT_RETURN`, `!FRIEZA_ORBIT_LOCKED`).

### Hand-off to the orbit stream

At the second threshold (32,000 HP, tier 2) the module sets `!fzs_surge` =
2, clears the shots, breaks the floor at surge ages 24 and 48 and from then
on calls `!FRIEZA_ORBIT_SURGE` (JSL, DB = `$7E`, M16/X16) every field frame
while the surge lasts; `!fzs_tgx/tgy` hold the Fortress's screen position
(or 2000, `frieza-cinematic`'s target). The orbit stream sets `FZFF_SPACE`
in `!fzf_flags` while the fight is in space (Frieza's ground logic and
drawing stop, the encounter is no longer the ground one), calls
`frieza_victory_start/_tick` for the orbital victory, and
`!FRIEZA_ORBIT_RETURN` marks the descent. Frieza's scene SRAM stays at
`$32:7000-7FFF`; the orbit stream owns `$32:6000-6FFF` and
`!PERSIST_FRIEZA+$40-$7F`.

## Tests

`node snes/test/frieza/run.mjs [case …]` (Mesen; bundles from
`.local/snes-import`, references from `.local/snes-ref`). Each case imports
a browser preset, writes the mod's Frieza state from its snapshot
(`state.mjs` maps `goku.frieza` onto the module's fields by parsing the
module's defines), runs, and compares screenshots with the browser frames
(best of a +/-2-frame window, `snes/test/debug/compare.mjs`). The scene
cases mark the preset's music cue as playing so the song load does not
shift them against the references (the `music` case checks the cue).
`surge`, `fracture` and `victory` use a `-DFRIEZA_TEST` build whose mailbox
(`!fzs_test`) strikes Frieza through `frieza_virtual_hit` and breaks the
floor on request.

| Case | Checked |
| --- | --- |
| `court` | preset `frieza`: the trial court; Frieza's OBJ at the court anchor; 98% of pixels equal the browser at frames 60/240/600 (the rest is the reference's resampling) |
| `thanatos` | preset `thanatos`: trial-entry with the full party; the native event moves on to `trial-taunt` through the hooks; 98-99.8% |
| `battle` | preset `battle`: Frieza at his first node, 100% at frame 60, 98-99% later; Goku's HP 844 at 240 and 729 at 600 as in the browser |
| `surge` | a 4,095 punch takes 614; hits stop at 64,000; the surge starts, muscular at 270, ends at 380 in phase two, the floor broken |
| `fracture` | seven fractures give the same 39 cells as `fractureFortress()`; the hole tiles are in VRAM and every listed BG1 row is written |
| `victory` | the fatal hit starts the beat, white 31 at 400, event C7 runs (stage defeated, ledger 127) |
| `death` | Goku at 1 HP takes the first orb: no warp, black from 360, Start goes to the title; with the ending module, the hand-off (`fzd_on` 2, `ES_DEFEATED`, key 1) instead |
| `beast` | preset `beast` (map 253, the fed Beast started, Super Saiyan) through combat's receive list: 600 frames untouched as in the browser (the eruption's 210 lands whole at frame 261, Goku's HP 789 at 600 as the reference), then damage queued at the native consumer: 600 takes 110 (140 in base form, the permanent form lifted), nothing during the grace, 50 and the eruption's pending 300 land whole. Skipped while the build has no `modules_combat_receive` |
| `floor` | test build with flight and destroy (skipped without them): the chained `!FLIGHT_MISSING_FLOOR` through the test mailbox (`FZPB+$20`): the Sandship's breach centre is a hole (destroy's answer through Frieza's), 120 px off is floor; a broken deck cell after seven fractures is a hole at the deck's layer (Frieza's), floor at the other layer, an unbroken cell is floor |
| `flyby` | preset `fortress` with the deck's Death Ball thrown (stage theft): event D8 arms the flyby and runs 1F04; the flyby starts with `$8C` in world flight, the impact (age 404) makes the Death Ball's crisis (`$13`), its end after 1F04 sets the eighth Ball and the Tree pursuit, the overhead view gets the rear-view request (`$F8` = `$90`), then Kai's warning (the crisis notified; the radio shows the aftermath); paired browser picture comparisons in both forms, all eight checker ages, lag, OAM overflow and vblank-upload checks |
| `cost-world` | preset `flight` (nothing of Frieza's in flight): `frieza_world_frame` at most 0.25 lines on average, 0.5 at peak |
| `cost` | Potos with Goku present: the module settles on the quiet path; field frame at most 0.36 lines on average and 2.5 at peak, vblank at most 0.13 (from the dispatcher's JSL to the next instruction, master clocks) |
| `vram` | preset `frieza`: not drawn while another owner holds `!VRAM_SCENE_OBJ` or the scene SRAM (`!SCENE_VEGETA` planted), drawn and both claimed once free (owners 6 and `!SCENE_FRIEZA`), the VRAM given back when the scene ends |
| `door` | door 3FC from the `intro` preset: tile y 18 beside the living Emperor, 30 (native) after his death |
| `tree` | preset `tree`: event 5F8 end to end with B tapped every 12 frames: every Tree scene on maps 236 and 198 in order, the Tree complete after the native tail; shots at chosen ages, Frieza's sprite boxes and a trace of the vista's state |
| `effects` | scenes no preset reaches, set up by `scenarios.mjs` on a preset in the browser (`capture.mjs`: restore the snapshot with an edited `goku.frieza`, run, screenshot into `.local/snes-ref-frieza/`) and replayed on the cartridge: Popoi's end 95-99%, the steal without the altar 99.5%, the empower orbs 97-99.9%, the eruption 93-99%, the collapse 87-90% after its first alarm; the Death Ball, Fanha's beam and the auras show where fx's kinds differ |
| `music` | Frieza's battle theme becomes the current song (`$1E05 = $3C`); reports the load's stall |

## Known differences

- **Frame cost**: Frieza's sprite takes about 9 scanlines per frame (up to
  eight `core_oam_add_front` calls), the fight about 45 in all. The fight's
  logic still ends by line ~190 in the battle preset. Quiet (nothing of
  Frieza's running): 0.32 lines per field frame on average, 2 at most (Dryad's
  hint, looked at every 64 frames, up to 63 frames after the browser's), and
  0.11 lines per vblank (case `cost`).
- **Large bursts**: fx's 14 effect slots and the sprite limits show part of
  the browser's nine-burst clusters.
- **The revive needs no snapshot**: the browser copies Primm's and Popoi's
  `$x180-$x1FF` at the showdown (`s.primm`, `s.popoi`) and writes them back
  at the revive. On the cartridge the native ops already give that block:
  REMOVE (`2C`) leaves it, ADD (`2B`) keeps level, experience, equipment and
  magic of a companion who joined before and recomputes the stats from the
  level (tested with planted values: level 20 and strength `$77` came back
  as level 20's own stats; with real data only `$x1B9` changed). The revive
  then refills HP and clears the status as the browser does; `$x1B9` (reset
  by REMOVE) is the one byte the browser would restore.

- **Song changes stall the game loop**: the native loader uploads a song on
  the main thread (audio.md, Load time). Frieza's cues cut the old song
  (no fade wait); the battle theme still holds the loop about 53 frames,
  the arrival theme about 37, where the browser switches instantly.
- **Hole texture**: the cloud, speckle and sparkle patterns repeat per cell
  (they follow world coordinates in the browser); outlines and colours
  match.
- **Without fx** the shots, eruptions, bursts and auras are not drawn
  (logic, sounds and damage run).
- **The cinematic Death Ball** (the deck's 64-224 px planet killer, the
  Tree's 16-32 px ball, `death-ball-art.js` `cinematic`): fx now supplies the red style. Its 16/32 px art is exact;
  the large polygon averages the surface into fourteen horizontal bands
  and omits the corona (see [fx.md](fx.md)). `tree` and the `core-charge` /
  `core-shot` effect scenarios pass. Browser captures may be kept inside a
  worktree with `FRIEZA_REFS=.local/snes-test/frieza-refs` for both
  `capture.mjs` and `run.mjs`, avoiding shared reference directories.
- **Lag with fx's polygons**: the first power surge holds the pink aura
  around Frieza every frame; fx's polygon aura costs about 100 lines on its
  frames, so with the fight's own ~45 the surge lags about 80 frames by age
  270 (the logic follows the game's clock; the `surge` case reports it).
- **The Tree vista and the HUD**: the field keeps BG3's priority, so the
  HUD rows (BG3 map rows 25-27) stay over the cliff where the browser
  paints them away; the line-196 switch to the HUD is off while the vista
  shows (VTIME beyond the frame).

- **The flyby's picture**: timing, Frieza and the eight-frame checker now
  follow the browser. The pose asks for a maximum diameter of 280, but
  `createDeathBallArt({cinematic:true})` clamps the visible browser art to
  224; the cartridge follows that visible cap. Above 32 px the ball has
  averaged red scanline bands, then a solid red surface near impact,
  instead of the browser's rolling texture and corona. The thrown portion
  over Goku retains exact texture. Crowded burst pieces are culled to fit
  the SNES OBJ limits. All art also receives the native global display
  brightness; software browser overlays can bypass that dimming.

## Requests

- **Perf harness / integrator**: investigate `perf/preset__flight`'s missing
  completion samples (0/304 on both this cartridge and the pre-task ROM).
  This work changes no core files; the direct world/flyby timing checks pass.
- **fx**: the cinematic red Death Ball is supplied (`FX_DBALL_CINEMATIC`).
  The cheaper polygon aura request remains (about 100 lines a frame during
  the surge in the earlier measurement).
- **flight**: none left; `bind.asm` binds `!FLIGHT_API_CAN_LAND`,
  `_CAN_LAND_T` and `!FLIGHT_API_CAMERA` when flight is built in.
- **ending / orbit (scene SRAM)**: Frieza releases `!SRAM_WORK_SCENE` on the
  first field frame he sees `ES_ACTIVE`, so the ending should claim it in
  its own frame (after Frieza's) or retry until the claim succeeds. The
  orbit stream works in `$32:6000-6FFF` during Frieza's fight, under his
  claim (`!SCENE_FRIEZA`), and should not claim the area itself then.
- **audio**: the cue changes happen mid-scene (the altar reveal, the fight
  start, the gold aura); an upload spread over several frames (or the
  Frieza songs' instruments kept resident) would remove the stall.
- **debug**: one `ANY` slot serves every module: Frieza takes it and
  forwards unanswered kinds to `combat_debug_hook`; a module added later
  (vegeta, orbit, ending) must join that chain, or the debug module could
  dispatch by kind. `UNTIL map + CAN_ACT` is satisfied on the frame a door
  to that map starts (before its fade), so the `hexas` capture can land on
  the door frame with Goku still at the altar's coordinates (party0.pos
  248,442 expected, 232,242 captured; the picture 240 frames later matches
  100%). The wait should also require the load to finish (`$FF`, fade).
- **story**: hook 49 `OBJECT_TRIAL` is listed for vegeta; it is Frieza's
  and answered inside `OBJECT_FRIEZA` (API), so the catalogue can name
  frieza or drop it.
