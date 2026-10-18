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
| Beast challenge rules (`beast-challenge.js`): choose/feed, the Beast's HP (65,535 fed, 48,000 ordinary, wounds kept), start (Goku 999 HP), eruption lanes and their damage, victory; Goku's damage to the Beast (1/2, 1/8 fed) and the empowered Dark Lich (1/4) through combat's `!COMBAT_HOOK_DAMAGE` | Done (logic; the lanes' sprites wait for fx kinds) |
| Frieza's ki for Dark Lich: 48,000 HP, attack +48/+24, two boosts (+10% HP, +16 attack) with Frieza's taunts | Done (logic; the orbs and aura wait for fx kinds) |
| Goku's attacks reaching Frieza | Needs combat's virtual-target hook (Requests): until then the fight cannot be won with the pad |
| Incoming-damage cap of the fed Beast (110/140, 75-frame grace) | Needs combat's damage-receive hook (Requests) |
| Cutscene effects (`frieza.js` draw(), the scene branch): the deck's Death Ball (charge and throw poses from `friezaDeathBallPose`), the eruption's column of large bursts, Fanha's beam and burst, Popoi's end, the empowering orbs and Thanatos's aura, Goku's gold aura | Done through fx; fx draws the ball at <= 32 px, its strip beams in four facings only and no auras yet (fx requests) |
| The Dragon Balls rising to the altar (steal) and the eighth Ball | Done (own art, generated) |
| The Emperor's execution: ray, black frame with his silhouette, sparks | Done (the ray is fx's Death Beam, not drawn by fx yet) |
| The Fortress's collapse on its destroyed deck (map 255): fractures, scars, red alarm | Done (alarm as a red add only; fractures need flight's canLand) |
| Altar camera pan (reveal, steal), intro follower poses (temple exit, the deck), Tree vista, flyby in world flight | Not yet (Requests: flight's camera dispatcher, goku's scene drawing) |

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
cells). Flight asks `frieza_floor_hole` (`!FLIGHT_MISSING_FLOOR`). On the
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
  ball's centre. fx draws 16/32 px balls today; larger diameters are its
  planned polygon circle.
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
| ROM `$F0:0000-7FFF` | Frieza's OBJ tiles (15.5 KiB of 32) |
| WRAM `$7E:DB00-DBBF` | `!RAM_FRIEZA`: scene `+$00-$57`, battle `+$58-$89`, Lich/Beast `+$8A-$AB`, scratch and death/victory `+$AC-$BF` |
| SRAM `$31:6180-61FF` | `!PERSIST_FRIEZA`: `+$00` version, `+$01` stage, `+$02` tree, `+$03` flags (word), `+$05` stolenMask, `+$06` crisis, `+$07` Beast challenge, `+$08` flyby age; `+$40-$7F` reserved for the orbit stream |
| SRAM `$32:7000-7FFF` | scene work while Frieza's scenes run: `+$000` hole list and write list (`!FZHB`), `+$800` fight block (`!FZSB`: tag, warning, shots, hazards, afterimages, test mailbox, arena, victory), `+$C00` the hole bitmap. The orbit stream keeps to `$32:6000-6FFF` |
| VRAM | OBJ tiles `$0C0-$0FF` while Frieza is drawn; core's `FIELD_OBJ_A` (owner `$06`) while the Dragon Balls show; BG tiles `$1C0-$1CF` (free on every map of graphics sets 20 and 21) and BG1 tilemap entries of visible holes on maps 246 and 255 |
| CGRAM | one free OBJ palette (two with afterimages or the Balls), in vblank; BG palette 6 (map 246) or 2 (map 255) colours 1-7 in the game's buffer while holes show |
| OAM | up to 8 front sprites for Frieza, 7 for the Balls; native slots rewritten during the Emperor's black frame |
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

Include order (`modules.asm`): before combat, which binds its damage hook
to `!COMBAT_HOOK_DAMAGE`, and before vegeta, which chains the hook bound
before it.

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
`modules_field_nmi` -> `frieza_field_nmi`, `modules_load` ->
`frieza_load`, `modules_new_game` -> `frieza_new_game`,
`modules_title_boot` -> `frieza_title_boot`, `!DEBUG_PRESET_HOOK_ANY` ->
`frieza_debug_preset` (unanswered kinds continue to `combat_debug_hook`).

| Entry | Contract |
| --- | --- |
| `frieza_virtual_target` | JSL, any DB. C set while Frieza can be struck: A16 = species (121), X16 = x, Y16 = y (map, his feet) |
| `frieza_virtual_hit` | JSL, any DB. A16 = Goku's damage, X16 = 1 punch / 0 ki, beam, burst. Applies 15% (65% stunned), recoil, grace, thresholds; A16 = HP taken |
| `frieza_victory_start` | JSL, any DB. A16 = x, X16 = y where Frieza fell: the death cue now, the beat from the next tick (the orbit stream calls it in space) |
| `frieza_victory_tick` | JSL, any DB. Advances the beat; C set while it runs (`!fzv_age`, red/white phases, bursts, cues) |
| `frieza_floor_hole` | `!FLIGHT_MISSING_FLOOR`: C set when (`!fl_q_x`, `!fl_q_y`) is a broken cell of the arena |
| `frieza_api_encounter` | JSL, M16/X16, D = 0, any DB. A16: low byte the dangerous fight now (`battle-retry.js` `encounter()`): 0 none, 1 Frieza's ground fight (stage battle on 246, no surge, not in space), 2 the empowered Thanatos (species 121 alive on 246), 3 the Mana Beast (127 on 253); high byte Frieza's tier with 1 (`frieza:<tier>`). X, Y, DB kept |
| `!fzd_key` | WRAM byte: the key of the death in progress (or the last fight Goku could act in on 246/253); also passed to `ending_lose` in X |
| `frieza_q_crisis` | `STORY_Q_FRIEZA_CRISIS` (`frieza.crisisActive`): 1 from the core's impact (event D7, `newCoreCrisis`) until the wish repairs the core (`FRIEZA_REPAIR_CORE`); a restored preset that is stolen or permanent gets it active unless the wish was made (`restore()`'s fix-up). The ending's bad presets read it for the night globe |
| `frieza_door_record` | `!DOOR_RECORD_HOOK` (destroy's door record): JSL, M16/X16, D = 0, X = door * 4, A = record bytes 0-1, Y = bytes 2-3; door 3FC's byte 2 becomes 36 while the Emperor is present. Returns A and Y, keeps X |
| `frieza_combat_damage` | `!COMBAT_HOOK_DAMAGE`: A16 = Goku's damage, X16 = actor -> A16 (the Beast 1/2 or 1/8, the empowered Lich 1/4) |
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
| `death` | Goku at 1 HP takes the first orb: no warp, black from 360, Start goes to the title |
| `effects` | scenes no preset reaches, set up by `scenarios.mjs` on a preset in the browser (`capture.mjs`: restore the snapshot with an edited `goku.frieza`, run, screenshot into `.local/snes-ref-frieza/`) and replayed on the cartridge: Popoi's end 95-99%, the steal without the altar 99.5%, the empower orbs 97-99.9%, the eruption 93-99%, the collapse 87-90% after its first alarm; the Death Ball, Fanha's beam and the auras show where fx's kinds differ |
| `music` | Frieza's battle theme becomes the current song (`$1E05 = $3C`); reports the load's stall |

## Known differences

- **Frame cost**: Frieza's sprite takes about 9 scanlines per frame (up to
  eight `core_oam_add_front` calls), the fight about 45 in all; the idle
  path about one. The fight's logic still ends by line ~190 in the battle
  preset.
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
  (logic, sounds and damage run); the fx module is merged and draws the
  kinds it has (impacts, explosions, the Death Ball, discs, finger beams,
  orbs); laser beams, debris and auras wait for fx kinds.

## Requests

- **combat** (blocking the fight): Frieza is a virtual enemy in the
  browser (`entity()` index 12, species 121, `hit()` with 15% / 65%
  scaling). Combat's target scans only see native actors 3-11. Please
  consult `frieza_virtual_target` (C set, X/Y = his map position) in
  `cb_targets`, the projectile and beam scans and the transformation burst,
  and call `frieza_virtual_hit` (A16 = damage, X16 = 1 punch / 0 other)
  instead of `cb_hit` for it; Instant Transmission (flight) should list the
  same target. Until then Goku's attacks pass through Frieza.
- **combat (2)**: the fed Beast caps Goku's incoming damage at 110 (140 in
  base form) with 75 frames of grace, except the eruption's own damage
  (`beast-challenge.js` at `C0:4053`). Combat owns that site
  (`cb_hook_receive`); please add a hook there, e.g.
  `!COMBAT_HOOK_RECEIVE` (A16 = queued damage on Goku, returns A16 =
  damage to apply). The module exposes `!fzx_pending` (the eruption damage
  it queued) for it.
- **combat (3)**: `beamTouchesShot()` needs Goku's live beam geometry
  (origin, direction, length, width) so a Kamehameha can cancel Frieza's
  shots; `fz_bind_beam_touches` answers "no" until then.
- **fx**: FX_DEATHBALL at 64-224 px (the deck's charge and throw), FX_AURA
  (Thanatos's pink aura, Goku's gold aura), FX_BEAM_LASER (the Emperor's
  ray and Frieza's lasers), 16-step headings for the strip beams (Fanha's
  end), FX_DEBRIS (the floor chunks).
- **goku**: a way to draw Goku's own cell at a scripted screen spot with the
  native body hidden (`frieza.js` introHero: the temple exit and the deck's
  follower poses; the Tree vista's Goku).
- **flight**: a JSL `canLand(x, y, layer, terrain)` service
  (`!FLIGHT_API_CAN_LAND`, A16 = x, X16 = y, Goku's layer/terrain) for the
  patrol nodes, floor fractures and the landing search (every cell counts
  as landable without it); a scripted camera target at 1 px per frame
  through the dispatcher hooks it owns (`C0:D651`/`C0:DA6E`) for the altar
  pan (300 frames to y 64) and the court (152, 260), as `frieza-intro.js
  installAltarCamera`.
- **audio**: the cue changes happen mid-scene (the altar reveal, the fight
  start, the gold aura); an upload spread over several frames (or the
  Frieza songs' instruments kept resident) would remove the stall.
- **core**: OBJ tiles `$0C0-$0FF` (words `$6C00-$6FFF`, OBJSEL `$63`) as a
  scene-scoped VRAM region in the pool, so other modules can see the claim:
  natively part of the actor cell streamer's fixed area (`C1:950D`,
  immediates `C1:9FB4-A3E4`, `C1:A709-A78D`, `C1:AF7F-AFDF`), which no
  active actor uses in Frieza's scenes (maps 246, 255, 418, 431, 237, 253,
  195, the vista on 236); held from the first upload of a scene until it
  ends or the map or mode changes. The same for BG tiles `$1C0-$1CF`
  (words `$1C00-$1CFF`, char base 0) on maps 246 and 255, free in their
  graphics sets for the whole stay once the map's own load is done.
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
