# VEGETA module: Joch's trial in the Hyperbolic Time Chamber

Spoilers. Part of the [SNES cartridge port](../snes-rom.md) ([plan](plan.md)).
Source: `snes/src/modules/vegeta/`, generator `snes/gen/vegeta.mjs`, tests
`snes/test/vegeta/`. Browser references: `engine/joch-trial.js`,
`engine/time-chamber.js`, `engine/vegeta-sprite.js` (+
`assets/sprites/vegeta*.png`), `engine/vegeta-clash.js`,
`engine/beam-detonation.js`, `engine/saiyan-palette.js`; gameplay notes in
[combat.md](../combat.md#vegetas-trial).

Status: **the Time Chamber is native** (map, pavilion, collision, scrolling,
checked against the browser picture). Vegeta, his AI, the clash and the
return are in progress (see [Status](#status)).

## Timeline (browser behaviour the port follows)

1. Jehk (event `3DD` → choice `3DC` → `3DA`) sends Goku through door `304`
   to map 72. Its walk-on event `3DB` is compiled by the story module
   (`story-events.js`): completion guard, input lock `CFF8`, the loss route
   flags (`CFFD`=1, `CFFE`=6, `CF0B`=4), the companions leave the party
   (`2C 1`, `2C 2`), a 30-unit wait, then five dialogue windows ("GOKU:The
   Hyperbolic Time Chamber?!" … "And leave the door standing."). Entering
   `3DB` fires the story hook `TRIAL_START`.
2. The retail Doppelganger records (map 72 objects, species `2E`/`3F`/`20`,
   `CF3F` 0..4) still spawn; actor slot 3 (`$E600`, species `2E`) becomes
   Vegeta's slot and all three clones stay inactive.
3. Intro: Vegeta is staged beside Goku under black until the entrance walk
   and the camera have been still for 12 frames, then a native brightness
   ramp reveals both; Goku faces the camera in base form.
4. Base form fight (32,000 HP, damage ×0.55): footwork, rush, volley,
   Galick Gun, counter, in a fixed cycle; two melee hits within 100 frames
   provoke a teleport counter. Stray attacks hit the walls ("Not the
   doorway!").
5. At 0 HP: "Hmph. Not bad…", 220-frame transformation (Super Saiyan at
   frame 92), "Now we are talking!", then Final Flash.
6. Super Saiyan fight (60,000 HP, damage ×0.32). Final Flash is the full
   SSJ wave in yellow; only a Kamehameha fired as Super Saiyan can lock it.
7. Beam clash (`vegeta-clash.js`): lock 36, focus 48, struggle (mash: 5-frame
   tap gap, +0.05 per tap; drain and surges at 100/220/340), release with the
   detonation; a win removes 34% of his max HP, a loss hurts Goku (nonfatal).
8. Second 0 HP (or Goku's lethal hit): the draw. Lines at 35 and 275, then
   at 490 the story request `4E5` (draw) or `025` (Goku needed a break),
   which story routes to the per-party return scripts (`TRIAL_ACTIVE`,
   `TRIAL_PARTY` queries): heal, door back, the companions rejoin through
   native `ADD_CHARACTER`, Joch's reveal.

## Hardware approach

### The chamber (done)

The browser expands map 72 to 64×64 metatiles with vanilla map compression
in the trial's own piece slot and repaints BG1, BG2 and the backdrop of every
pixel with a hook. The cartridge keeps the room's data identical and draws it
with real tiles:

- **Static patches** (as `time-chamber.js load()`, which also patches its ROM
  unconditionally): pieces 712/713 at `CF:E243` (189 of the slot's 388 bytes:
  the 64×64 layout with floor 70 and walls 11, and the blank 64×64
  foreground), the piece-713 pointer at `CD:0596`, door `304`'s entry x at
  `C8:3C11` (below the central doorway). The generator checks its bytes
  against the browser module's own patched ROM.
- **BG1 = collision only.** The 7F:0000 grid is the browser's layout exactly,
  so destroy's demolition protection and flight's checks (every layer-0 tile
  but 70 is protected) see the same room. Metatiles 70 and 11 are drawn with
  the blank tile (transparent).
- **BG2 = the picture.** The 7F:4000 grid gets one visual metatile per 16×16
  cell (73 unique cells: floor, 64-pixel seams, border, pavilion); their
  definitions go to 7F:C808+ (local ids 1..73). BG2's descriptors stay native
  (all `13 06 00 00` in tileset 10), so no trigger or collision changes.
  Sprites (OBJ priority 2/3) stay in front, as in the browser.
- **Art**: the generator runs `createTimeChamber()` itself in Node (stub
  SNES, a minimal Image/canvas for its PNG loader) and samples its `getColor`
  hook for all 1024×1024 world pixels, so the palace-stone floor, seams,
  border and the nearest-neighbour pavilion are the browser's pixels. The
  picture is cut into 16×16 cells, quantised to six 15-colour BG palettes
  (2-7, colours 32-127; every palette keeps the floor, seam and border colours
  at indices 1-3 so the open floor is exact), flip-deduplicated: 207 tiles
  (incl. the blank tile 0) at VRAM `$0000`.
- **Timing**: both hooks run inside the native map load (`C0:BC0B`) under its
  forced blank: `C0:C4CA` (after `C2:A000` built the tileset tables) patches
  the metatile tables and palettes and DMAs the tiles; `C0:C9F8` (after the
  pieces were decompressed) writes the BG2 grid, before the load builds the
  initial screen. The native scroll loader then streams the chamber like any
  map. One row offset: the browser paints screen line y from world row
  y + scroll, while the PPU shows BG row y + VOFS + 1, so BG2 holds the
  picture one row up (`snes/gen/vegeta.mjs`).

### The trial runtime

A port of `joch-trial.js` (`trial.asm`, `ai.asm`, `attack.asm`,
`clash.asm`), run from `modules_field_frame`. The browser ticks the trial
before each frame's native logic and draws after it; the cartridge draws
first (state after this frame's combat step), then ticks for the next frame,
which still comes before that frame's combat step (`C0:B0AC`), so tick,
Goku's hits (`vegeta_api_hit`) and the draw keep the browser's order.

- **Start**: the story hook `TRIAL_START` (3DB) is `start(true)`; a live
  Doppelganger in slot 3 (`$E600` active, species `$2E`) without a hook is
  `start(false)` (a checkpoint that skipped the walk-on later requests 3DB
  through `story_api_request`, as the browser does). The party mask is taken
  at start; the queries `TRIAL_ACTIVE`/`TRIAL_PARTY` answer from it.
- **Slot 3**: all three clones are made inactive every tick (`E600/E800/EA00`
  bit 0), their pending damage cleared, the two others marked dead with 0 HP;
  slot 3 carries Vegeta's position (`E602/E604/E60B`) and HP (`E782/E784`).
- **Intro**: Vegeta beside Goku (`±56,0`, `±32,16`, the first safe spot),
  brightness held at 0 through `$E6/$E7/$E4/$E5/$E2` until the walk and
  camera are still for 12 frames, then the native ramp (`$E7=15`, `$E5=4`);
  Goku faces down in base form.
- **AI, damage, transformation, draw**: every rule of the browser module
  (attack cycle rush/volley/beam/counter/beam, footwork with the 180/105/55
  distances, two melee hits in 100 frames provoke a counter, rushes into
  walls throw warned rocks, aimed eight-direction volleys, Galick Gun and
  Final Flash geometry with the tapered hit test, sparring damage queued on
  Goku's native damage slot `$E1F1` from attacker 3 and never lethal, the
  92/155/220 transformation, the 35/275/490 draw and the `4E5`/`025`
  request). Movement uses `canFly` of the chamber (inside the room, all nine
  footprint samples on floor 70). Integer arithmetic throughout; Final Flash
  widths in 8.8 fixed point.
- **Clash** (`vegeta-clash.js`): pressure/shown kept exactly in units of
  1/500000 (32-bit), lock 36 / focus 48 / struggle (B or Y taps 5 frames
  apart, drain, surges at 100/220/340) / release with the detonation; a win
  removes 34% of the maximum HP, a loss queues 230/320 on Goku. Goku holds his
  firing pose (`!goku_act` = beam, age 7) under combat's input lock.

### Vegeta's sprite

- 56×40 cells from `decodeVegetaSheet()` (32 frames: base/gold × 16 poses)
  cut into at most five 16×16 OBJ blocks per frame (146 blocks, 18.7 KiB in
  `$F4`), one OBJ palette (4, the Doppelganger's) for both forms; the hit
  flash writes it white.
- VRAM: the OBJ region the native streamer uses for actor slot 3 (held
  inactive): two frame buffers (tiles `$080-$099`, `$0E0-$0F9`) and the
  teleport echo (`$068-$07F`, `$0C8/$0D8`). A pose shows once its tiles are
  in the back buffer (uploaded in `vegeta_nmi` when 10+ vblank lines remain),
  so a pose change appears one frame after the browser's, never torn.
- OAM: in front of the native sprites (`core_oam_add_front`, ≤ 5), the echo
  behind them on alternate frames (the browser draws every third pixel).
- Camera: `$A8/$AA` plus the fine BG1 scroll the next NMI writes (quake bit
  included), as `view-camera.js`; OBJ Y one line up (sprites show one line
  below their Y).

### Effects, voice, telepathy (bindings)

`bind.asm`, assembled after every module, calls a provider only when its
defines exist: fx (`fx_beam` `FX_BEAM_GALICK`/`FX_BEAM_FINAL`/`FX_BEAM_WAVE`,
`FX_ORB`, `FX_AURA`, `FX_CELL` groups for volley orbs, sparks, Exploder
bursts and embers, `FX_DETONATE`, `fx_quake`/`fx_flash` for
`feedback.pulse/burst`), audio (`audio_sfx` with the browser's cue names,
`audio_song` `$3E`/`$3F` and `audio_song_restore` for the music cue), ui
(`ui_say`/`ui_interrupt` with `!UI_MSG_JOCH_TRIAL_0..9`), combat
(`combat_api_cancel`, `_set_form`, `_danger`, `_input_lock`, and the
requested `combat_api_beam`).

## Resources

| Resource | Use |
| --- | --- |
| Code `$A8:8000-EFFF` | `!CODE_VEGETA`; `$A8:F000-FFFF` the bindings (`bind.asm`) |
| Data `$E8:0000-` | chamber BG2 metatiles (584 B), palettes (192 B), BG2 grid (4 KiB); Vegeta's frame table, the ball table |
| ROM `$F4:0000-` | chamber BG tiles (6.5 KiB), Vegeta's OBJ blocks (18.7 KiB) |
| ROM `$F5:0000-` | the clash ball's quadrants, radius 1-32 (9.8 KiB) |
| ROM patches | `CF:E243` (189 B), `CD:0596` (2 B), `C8:3C11` (1 B) |
| VRAM, map 72 | BG tiles `$0000-$0CEF` (the cave tileset is not used there); OBJ tiles of the inactive clone slots: slot 3 (`$068-$07F`, `$080-$099`, `$0C8/$0D8`, `$0E0-$0F9`: Vegeta's two frame buffers and the echo), slot 4 (`$0A0-$0BB`, `$100-$11B`: the ball) |
| CGRAM | BG palettes 2-7 through the game's buffer `$7E:0640-$06FF` (map 72); OBJ palette 4 (Vegeta) and 5 (the ball) through `$7E:0780/$07A0` while the trial draws |
| WRAM | `!RAM_VEGETA` (`$7E:DBC0`, 64 bytes: phase, flags, HP, position, timers, action, sprite buffers, music cue, scratch); map 72's native tables 7F:C000 (ids 70/11), 7F:C808-, 7F:4000 |
| SRAM | `!SRAM_WORK_SCENE` `$32:6000-$32:6203` while the trial runs: entrance view, beam, shots, bursts, rocks, echoes, the clash record, drawing scratch, logs, the test mailbox. Initialised by `start()`; valid only while `!vg_on` = `$5A` |
| DMA | channel 6 in `vegeta_nmi` after the game's uploads: a changed pose (≤ 640 B), the echo cell, the ball (≤ 768 B), each only with 10+ vblank lines left |

## Original code patched

| Address | Bytes | Replaced | Purpose |
| --- | --- | --- | --- |
| `C0:C4CA` | 4 | `JSL $02A000` | tileset tables of the map being loaded; for map 72 also chamber metatiles, palettes and tiles (`vegeta_tileset_hook`) |
| `C0:C9F8` | 4 | `REP #$20 / SEP #$10` | after the pieces: map 72's BG2 grid (`vegeta_grid_hook`) |

## Tests

`node snes/test/vegeta/run.mjs [case …]` (Mesen; bundles from
`.local/snes-import`, start state `.local/snes-checkpoints/waterfall.mss`):

| Case | Checks |
| --- | --- |
| `fight` | test ROM (`-DVEGETA_TEST`): door `304` with the full party, the trial from the walk-on event to the draw; scripted walking and four mailbox hits (two melee → counter, an overwhelming blow → transformation, another → the draw). Every tick is recorded (game RAM it reads, its state) and replayed through the browser's own `engine/joch-trial.js` (`replay.mjs`): **2,994 / 2,994 ticks agree** on phase, HP, position, facing, timers, action (kind, age, direction, origin, contact, beam length/width), shots, bursts, rocks, echoes and flags |
| `clash-win` | the same with a Kamehameha stand-in (the test record `!vs_tb_*` replaces combat's beam) opposing the Galick Gun: lock, focus, struggle with B taps 6 frames apart (38 taps), release won at 96.6%, Vegeta loses 10,880 HP (34%); a second clash on his next beam. Replayed with the clash internals (pressure and shown in 1/500000, taps, last tap, phase, result): **3,284 / 3,284 ticks agree** |
| `clash-lose` | no mashing: Vegeta's drain and surges win at 3.8%, Goku takes 230: **2,969 / 2,969 ticks agree** |
| `chamber` | door `304` from a Potos state (`graphics-audit__party`, `CF3F`=5): VRAM tiles, CGRAM 32-127, BG1 metatiles 70/11, BG2 metatiles and grid equal the generator's outputs; BG1 grid equals `chamberLayout()`; four views (entrance, the steps, mid-room after scrolling, the east border) match the cartridge picture 100% and the browser's floor/seam/border colours 100% (pavilion views 84-86% of all pixels, the rest is palette quantisation of the 1,275-colour pavilion art); the pavilion's front wall and the east border block Goku |

`replay.mjs` hosts the browser module with the recorded RAM: `canFly` is the
chamber footprint, `mod.status` the camera from Goku's screen position,
`mod.effects` the stand-in beam with its geometry, radio/sounds/story
requests are collected; mailbox hits are applied after the tick they follow,
the story hook before the tick it precedes, as on the cartridge.

## Status

| Part | State |
| --- | --- |
| Chamber map, pavilion, collision, scrolling | done, tested |
| Story hook and queries (`TRIAL_START`, `TRIAL_ACTIVE`, `TRIAL_PARTY`) | done |
| Vegeta's sprite, palette, VRAM streaming | done |
| Intro, AI, attacks, damage, transformation, draw, return request | done: every tick equals `joch-trial.js` (`fight`) |
| Clash (logic, mash, ball) | done: every tick equals `vegeta-clash.js` (`clash-win`, `clash-lose`); in the game it starts once combat provides Goku's beam (`combat_api_beam`) |
| Goku's attacks on Vegeta | needs combat's custom-target hook (Requests); tests use the mailbox |
| Effects, telepathy | bound to fx/ui (beams, orbs, sparks, bursts, embers, aura, detonation, quake/flash; the ten lines); those modules are not merged yet |

## API

All `JSL`, M16/X16 in and out, any DB (they set DB = `$7E` themselves).

| Routine | Contract |
| --- | --- |
| `vegeta_api_hit` | Goku's attack landed on Vegeta (`trial.hit`): A16 = damage before Vegeta's damage scale (×0.55 base, ×0.32 Super Saiyan, rounded, at least 1; `$FFFF` = an overwhelming blow), X16 bit 0 = melee (a punch or kick: two within 100 frames start a teleport counter). Out: A16 = HP before, X16 = HP after, C set when it was taken (battle phase, not won, no clash; a live Kamehameha that opposes his beam starts the clash instead). |
| `vegeta_story_trial_start` | story hook `TRIAL_START` |
| `vegeta_q_trial_active`, `vegeta_q_trial_party` | story queries `TRIAL_ACTIVE`, `TRIAL_PARTY` |
| `vegeta_field_frame`, `vegeta_nmi`, `vegeta_reset` | dispatch (`modules_field_frame`, `modules_field_nmi`, `modules_load`/`modules_new_game`) |

State for other modules (read only): `!vg_on` (`$7E:DBC0` = `$5A` while a
trial exists), `!vg_phase` (`$DBC1`: 0 intro, 1 battle, 2 transform, 3 draw),
`!vg_hp` (`$DBC6`), `!vg_x`/`!vg_y` (`$DBC8`/`$DBCA`, also in slot 3's
`$E602/$E604`). Test builds (`-DVEGETA_TEST`) add the mailbox (`$32:61FC`
command 1 = `hit(amount $32:6200, flags $32:6202)`, `$32:61FD` counts).

## Requests

- **combat — custom target.** Vegeta occupies actor slot 3 but the slot is
  held inactive (the browser replaces the Doppelganger with its own entity),
  so `cb_targets` never sees him. Wanted: while a custom target is
  registered, attack boxes (punch, ki, beam, burst) include it at its
  position and a hit calls its routine instead of the native damage queue
  (no native number, no launch; beam pulses and the ki first-contact rule as
  for natives; the impact spark and `impact` sound as `mana-mod.js` does for
  every hit). Proposed: `combat_api_custom_target` per frame, A = slot (3),
  X/Y = map position, plus the hit routine's long address; vegeta would call
  it from its tick while `entity()` is non-null (spawned, battle, not won)
  with `vegeta_api_hit`. Frieza's custom entity needs the same.
- **combat — Goku's beam.** `combat_api_beam`: C set while Goku's beam
  effect is live (life > 0); out the palms (x, y), direction (dx, dy), the
  current length and half width (8.8) from `beamGeometry`, and flags (fired
  as Super Saiyan, full wave). Vegeta's `counterBeam()` (clash start, also
  from a hit) and the volley cancellation (`beamTouchesShot`) need it;
  `bind.asm` uses it when `!COMBAT_API_BEAM` is defined (then fills
  `!vs_gb_*`), else the test stand-in.
- **combat — input lock.** The draw blocks new input but lets the last wave
  finish (`inputLocked` in `mana-mod.js`); `combat_api_input_lock` cancels
  combat, so the wave ends at once and the draw's first count starts a few
  frames earlier. A lock flavour that keeps effects running would match.
- **combat — clash pose.** During a clash vegeta writes `!goku_act` = beam
  (age 7, facing of the clash, Super Saiyan art from the shot) every frame
  under the input lock; combat leaves an external action alone
  (`cb_ext_kind`). Please keep that behaviour.
- **fx.** A horizontal clash puts two waves of different colours on the same
  scanlines (blue Kamehameha against purple/yellow); a colour-math polygon
  has one fixed colour per line, so one of them needs OBJ strips (or a second
  window/colour). Vegeta uses OBJ palettes 4 and 5 in map 72 (drawn before
  `fx_frame`, so FX's OAM scan sees them).
- **ui.** `bind.asm` expects the generator's names for `joch-trial.js`'s ten
  lines, `!UI_MSG_JOCH_TRIAL_0`..`_9` in source order (asserted).
- **core.** The OBJ regions of actor slots 3 and 4 used above (only in map 72,
  where the clones are held inactive) could become claimable regions; and a
  claim byte for `!SRAM_WORK_SCENE` would make "one scene at a time"
  explicit (vegeta uses `$32:6000-$32:6203` while the trial runs).
- **story.** `OBJECT_TRIAL` (hook 49) is listed for vegeta but is the
  Thanatos trial's Dyluck/Thanatos staging on map 246 (`mod.frieza.trial` in
  `native-story.js`); it belongs to frieza.
- **debug.** The `trial` preset's remaining differences (`CF0B`, both
  companions still in the party) are capture timing: the browser captured
  `?start=trial` before 3DB's opening commands ran, the cartridge after.
