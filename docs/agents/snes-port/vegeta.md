# VEGETA module: Joch's trial in the Hyperbolic Time Chamber

Spoilers. Part of the [SNES cartridge port](../snes-rom.md) ([plan](plan.md)).
Source: `snes/src/modules/vegeta/`, generator `snes/gen/vegeta.mjs`, tests
`snes/test/vegeta/`. Browser references: `engine/joch-trial.js`,
`engine/time-chamber.js`, `engine/vegeta-sprite.js` (+
`assets/sprites/vegeta*.png`), `engine/vegeta-clash.js`,
`engine/beam-detonation.js`, `engine/saiyan-palette.js`; gameplay notes in
[combat.md](../combat.md#vegetas-trial).

Status: **the trial is native**: the Time Chamber (map, pavilion, collision,
scrolling), Vegeta's sprite, intro, AI, attacks, transformation, the clash
and the draw, with Goku's real punches, ki and Kamehameha from the combat
module; every tick of recorded matches equals `joch-trial.js` (see
[Status](#status)).

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

### Goku's attacks on Vegeta

In the browser `entities()` replaces actor slot 3 with the trial's custom
entity (active, species 46, his HP and position) and `hit()` sends its hits
to `trial.hit()` (no native queue, number or launch). Combat's target scans
(`cb_targets`) need an active slot, but slot 3 must stay inactive for the
native engine (the browser clears its bit every tick). The cartridge shows
the slot to combat's step only:

- Combat's step is the `JSL` at `C0:B0AC` in the field logic. The two calls
  before it (`C0:B0A6`: `JSR $8B5E` fade, `JSR $DB1E`) move into
  `vegeta_combat_open` and the two after it (`C0:B0B2`: `JSR $D5C0`,
  `JSR $B4FE`) into `vegeta_combat_close` (bank-00 subroutines called
  through the RTL at `00:B294`, as combat's own hook does). The native
  actors run before (`JSL $02C786` at `C0:B08C`) and after, so only
  combat's step ever sees the slot active.
- While `entity()` is non-null (the trial runs, he spawned, not beaten),
  `vegeta_combat_open` sets `E600` bit 0, clears the pending damage `E7F1`
  and gives the slot a boss species (84: `mana-mod.js` launches only
  natives, and only below 84); `E602/E604/E60B` and `E782` (max(1, HP)) are
  kept by the tick and `hit()` as in the browser. `vegeta_combat_close`
  restores the flags, species and `E7F0/E7EC` and clears `E7F1`.
- `!COMBAT_HOOK_DAMAGE = vegeta_combat_damage` (combat's per-hit hook): a
  hit on slot 3 during the window is `trial.hit(amount)`, melee while
  combat's action is a punch, and returns 1 when his HP dropped, else 0, so
  combat's contact test (`after < before`: hit pause, impact spark, `hit`
  cue, ki first contact, beam pulses) answers as the browser's; the 1 lands
  in `E7F1`, which the close clears. Once beaten he leaves the target list
  in the same step. Other actors go to the hook bound before vegeta's
  module (`!VEGETA_DAMAGE_NEXT`); `bind.asm` refuses to assemble if a later
  module rebinds the hook.
- Goku's beam for the clash and the volley cancellation (`vb_goku_beam`):
  combat's live beam record (`!ER`, kind beam, life > 0) and the beam
  globals (`!bm_charge/_range/_speed`) with `beamGeometry()`: age
  = max - life, length = min(range, (age + 1) * speed), half width
  5 + 14 * min(1, charge / cap) (cap 45 when fired as Super Saiyan, else
  90) or 80 * min(1, (age + 1) / 6, life / 10) for the full wave, in 8.8.
  `combat_api_beam` replaces it when combat provides one.
- Instant Transmission: with the flight module, `vb_flight_target` writes
  the custom teleport target (`!fl_tp_custom`: kind 3, species 46, his
  position and terrain) every field frame while `entity()` is non-null.

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
| SRAM | `!SRAM_WORK_SCENE` `$32:6000-$32:6207` while the trial runs: entrance view, beam, shots, bursts, rocks, echoes, the clash record, drawing scratch, logs, the test mailbox, slot 3's bytes held during combat's step; test builds log hits and beams up to `$32:62AF`. Initialised by `start()`; valid only while `!vg_on` = `$5A` |
| DMA | channel 6 in `vegeta_nmi` after the game's uploads: a changed pose (≤ 640 B), the echo cell, the ball (≤ 768 B), each only with 10+ vblank lines left |

## Original code patched

| Address | Bytes | Replaced | Purpose |
| --- | --- | --- | --- |
| `C0:C4CA` | 4 | `JSL $02A000` | tileset tables of the map being loaded; for map 72 also chamber metatiles, palettes and tiles (`vegeta_tileset_hook`) |
| `C0:C9F8` | 4 | `REP #$20 / SEP #$10` | after the pieces: map 72's BG2 grid (`vegeta_grid_hook`) |
| `C0:B0A6` | 6 | `JSR $8B5E / JSR $DB1E` | field logic before combat's step: re-run, then slot 3 opens to combat (`vegeta_combat_open`) |
| `C0:B0B2` | 6 | `JSR $D5C0 / JSR $B4FE` | after combat's step: slot 3 closes, then re-run (`vegeta_combat_close`) |

## Tests

`node snes/test/vegeta/run.mjs [case …]` (Mesen; bundles from
`.local/snes-import`, start state `.local/snes-checkpoints/waterfall.mss`):

| Case | Checks |
| --- | --- |
| `fight` | test ROM (`-DVEGETA_TEST`): door `304` with the full party, the trial from the walk-on event to the draw; scripted walking and four mailbox hits (two melee → counter, an overwhelming blow → transformation, another → the draw). Every tick is recorded (game RAM it reads, its state) and replayed through the browser's own `engine/joch-trial.js` (`replay.mjs`): **2,947 / 2,947 ticks agree** on phase, HP, position, facing, timers, action (kind, age, direction, origin, contact, beam length/width), shots, bursts, rocks, echoes and flags |
| `clash-win` | the same with a Kamehameha stand-in (the test record `!vs_tb_*` replaces combat's beam) opposing the Galick Gun: lock, focus, struggle with B taps 6 frames apart (38 taps), release won at 96.6%, Vegeta loses 10,880 HP (34%); a second clash on his next beam. Replayed with the clash internals (pressure and shown in 1/500000, taps, last tap, phase, result): **3,044 / 3,044 ticks agree** |
| `clash-lose` | no mashing: Vegeta's drain and surges win at 3.8%, Goku takes 230: **2,720 / 2,720 ticks agree** |
| `combat` | the test ROM with **combat's real input**: `fight.lua`'s pilot walks Goku up to Vegeta and punches (B) as a player would; the punches reach him through the slot-3 window and combat's damage hook (12 hits, the kick finisher, two counters), his attacks wear Goku down to the rest route (`025`). Each hit is logged on the cartridge (amount, melee, combat's beam record) and replayed through `trial.hit()` with the beam it saw: **4,575 / 4,575 ticks agree**, including actor slot 3 after every frame (inactive, position, HP and maximum, nothing pending, species) |
| `combat-clash` | the same pilot, which stops punching below 12,000 HP (two punches in 100 frames provoke counters, which keep his cycle from the beam), steps back along his lane at each Galick Gun windup, charges a Kamehameha (L+Y) and releases when his wave is out: a **real clash** from combat's beam record ("Push back, Kakarot!"), B mashing wins, the detonation takes 34% and he transforms; Final Flash, the rest route. **3,806 / 3,806 ticks agree**; screenshots of the moments (`V_SHOTS`) |
| `return-draw` | two overwhelming blows (transformation, then the draw): the request `4E5`, story's per-party script, A taps through the dialogue: back on map 18 with both companions, Goku healed (999/999), `CF3F` = 6, the trial over; every tick agrees (3,907) |
| `return-rest` | Goku at 30 HP: Vegeta's first blow ends the match (`finish(false)`), request `025`: map 18, both companions, healed, `CF3F` stays 4 (he can try again), the trial over (2,247 ticks agree) |
| `waves` | pictures of the Galick Gun and the Final Flash (an overwhelming blow at 700 frames) with fx's polygon state per frame (`$2C`, request/programmed) |
| `budget` | the same match with the scanline at chosen labels each frame (`VEGETA_PROFILE=label,...`, default the field frame's parts): medians/p90/max per part for beam frames, other attacks and the rest, and the lag frames |
| `chamber` | door `304` from a Potos state (`graphics-audit__party`, `CF3F`=5): VRAM tiles, CGRAM 32-127, BG1 metatiles 70/11, BG2 metatiles and grid equal the generator's outputs; BG1 grid equals `chamberLayout()`; four views (entrance, the steps, mid-room after scrolling, the east border) match the cartridge picture 100% and the browser's floor/seam/border colours 100% (pavilion views 84-86% of all pixels, the rest is palette quantisation of the 1,275-colour pavilion art); the pavilion's front wall and the east border block Goku |

`replay.mjs` hosts the browser module with the recorded RAM: `canFly` is the
chamber footprint, `mod.status` the camera from Goku's screen position,
`mod.effects` Goku's beam (rebuilt from combat's raw record with
`beamProfile`/`beamGeometry`, so the browser's own geometry decides, or the
stand-in), `cancelCombat()` drops it, radio/sounds/story requests are
collected; logged hits (combat's or the mailbox's, a ring of four per frame)
are applied after the tick they follow, the story hook before the tick it
precedes, as on the cartridge.

## CPU budget

Measured with `budget` (FastROM, test ROM; scanlines of the 262-line frame):

| Part | Rest of the fight | Attacks | His beams |
| --- | --- | --- | --- |
| `vegeta_field_frame` draw | 15 | 15 | 29 |
| tick | 4 (p90 11, max 37) | 7 (p90 21, max 29) | 4 (p90 9) |
| fx (`fx_frame`) | 3 | 3 | 32 (p90 69, max 90: the wave polygon being built) |
| native logic and other modules | 76-128 (heavier every fifth frame) | | |

Without a trial the module costs about one line a frame (the field frame's
short path, the two combat-window hooks and the NMI check).

The draw's floor is Vegeta's five OBJ blocks through `core_oam_add_front`
(~10 lines; the core API costs ~230 cycles a sprite) and each fx request
(~2 lines per `fx_draw`: the charge's orb and four sparks ~11 lines, the
aura ~4 lines though fx draws no aura yet). Optimised so far: hardware
multiply/divide in `math.asm` (`vg_mul8/16`, `vg_div32`, `vg_udiv16`),
the footprint test as two word reads of the grid, pickSpot testing only
spots that could be chosen, per-step constants out of the pixel loop,
skipped scans of empty shot/burst/rock/echo lists, the sprite loop on
WRAM. During his waves the field still lags on heavy frames (34 of 340
beam frames): the polygon build (fx) plus the native load leave little
room; outside the waves lag frames are the native ones (dialogue, the
door).

## Status

| Part | State |
| --- | --- |
| Chamber map, pavilion, collision, scrolling | done, tested |
| Story hook and queries (`TRIAL_START`, `TRIAL_ACTIVE`, `TRIAL_PARTY`) | done |
| Vegeta's sprite, palette, VRAM streaming | done |
| Intro, AI, attacks, damage, transformation, draw, return request | done: every tick equals `joch-trial.js` (`fight`) |
| Return to Jehk's room (`4E5` draw, `025` rest) | done for the full party end to end (`return-draw`, `return-rest`); the other party masks go through the same queries (`TRIAL_PARTY` from `$E200/$E400` at start), whose route choice story's sweep checks |
| Clash (logic, mash, ball) | done: every tick equals `vegeta-clash.js` (`clash-win`, `clash-lose`, and from a real Kamehameha in `combat-clash`) |
| Goku's attacks on Vegeta | done through the slot-3 window and combat's damage hook (`combat`, `combat-clash`); a combat custom-target API would replace the window (Requests) |
| Instant Transmission to Vegeta | written for flight's `!fl_tp_custom` (flight is not merged here: untested) |
| Effects | bound to fx (beams, orbs, sparks, bursts, embers, aura, detonation, quake/flash) |
| Telepathy | bound to ui's `!UI_MSG_JOCH_TRIAL_0..9`; ui is not merged here (the lines are logged only) |

## API

All `JSL`, M16/X16 in and out, any DB (they set DB = `$7E` themselves).

| Routine | Contract |
| --- | --- |
| `vegeta_api_hit` | Goku's attack landed on Vegeta (`trial.hit`): A16 = damage before Vegeta's damage scale (×0.55 base, ×0.32 Super Saiyan, rounded, at least 1; `$FFFF` = an overwhelming blow), X16 bit 0 = melee (a punch or kick: two within 100 frames start a teleport counter). Out: A16 = HP before, X16 = HP after, C set when it was taken (battle phase, not won, no clash; a live Kamehameha that opposes his beam starts the clash instead). |
| `vegeta_combat_damage` | combat's `!COMBAT_HOOK_DAMAGE` (A16 = damage, X16 = actor offset; returns A16): slot 3 while the window is open is `hit()`; others are chained |
| `vegeta_combat_open`, `vegeta_combat_close` | the hijacks at `C0:B0A6` / `C0:B0B2` (not for calling) |
| `vegeta_story_trial_start` | story hook `TRIAL_START` |
| `vegeta_q_trial_active`, `vegeta_q_trial_party` | story queries `TRIAL_ACTIVE`, `TRIAL_PARTY` |
| `vegeta_field_frame`, `vegeta_nmi`, `vegeta_reset` | dispatch (`modules_field_frame`, `modules_field_nmi`, `modules_load`/`modules_new_game`) |

State for other modules (read only): `!vg_on` (`$7E:DBC0` = `$5A` while a
trial exists), `!vg_phase` (`$DBC1`: 0 intro, 1 battle, 2 transform, 3 draw),
`!vg_hp` (`$DBC6`), `!vg_x`/`!vg_y` (`$DBC8`/`$DBCA`, also in slot 3's
`$E602/$E604`), `!vg_cwin` (`$DBED`: 1 while combat's step sees him in
slot 3). Test builds (`-DVEGETA_TEST`) add the mailbox (`$32:61FC` command
1 = `hit(amount $32:6200, flags $32:6202)`) and the hit log: `$32:61FD`
counts every hit (mailbox or combat), the last four at `$32:6210` (32 bytes
each: amount, flags, combat's beam record, charge, range, speed), the beam
record the tick saw at `$32:6290`.

## Requests

- **combat — custom target.** The slot-3 window (two hijacks around
  combat's step, a boss species against the launch) works but leans on
  combat's internals: `cb_targets`' active/species/HP/dead tests, the
  launch threshold 84, and `cb_hit` calling the damage hook before it
  queues. A registered custom target would replace it: attack boxes
  (punch, ki, beam, burst) include it at its position and a hit calls its
  routine instead of the native queue (no number, no launch; beam pulses,
  the ki first contact and the impact spark/sound as for natives). Frieza's
  custom entity needs the same (frieza.md asks for
  `!COMBAT_HOOK_VIRTUAL`).
- **combat — the damage hook is single-owner.** Vegeta binds
  `!COMBAT_HOOK_DAMAGE` and chains the one bound before its module
  (`!VEGETA_DAMAGE_NEXT`); frieza binds it unconditionally. When both are
  merged, include frieza's module before vegeta's (or chain frieza's to
  `vegeta_combat_damage`); `bind.asm` stops the build otherwise. A chain in
  combat (several hooks) would remove the ordering rule.
- **combat — Goku's beam.** `combat_api_beam`: C set while Goku's beam
  effect is live (life > 0); out the palms (x, y), direction (dx, dy), the
  current length and half width (8.8) from `beamGeometry`, and flags (fired
  as Super Saiyan, full wave). Until then `bind.asm` reads combat's beam
  record and globals (`!ER`, `!er_*`, `!ERK_BEAM`, `!bm_charge/_range/_speed`);
  with `!COMBAT_API_BEAM` defined it calls the API instead.
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
- **debug.** The `trial` preset needs no vegeta hook (`?start=trial` only
  travels through door `304`; the walk-on event and this module do the
  rest). Its remaining differences (`CF0B` = 4, both companions out of the
  party; picture 9% at the capture, 89% 240 frames later, where the rest is
  the pavilion's palette quantisation) are capture timing: the recipe
  waits `UNTIL` map 72 and 240 frames, which lands after 3DB's opening
  commands; the browser captured 240 frames after the travel, before them
  (its frame 60 already shows the borrowed party). The `GAPS` entry in
  `snes/test/debug/run.mjs` can name debug's timing instead of vegeta.
- **core.** A batch OAM entry (several sprites sharing tile/attribute
  bases and an anchor) would cut Vegeta's ~10 lines of `core_oam_add_front`.
- **fx.** `fx_draw` costs ~2 lines a call (the charge: orb, four sparks,
  aura = 6 calls); `FX_AURA` costs ~4 lines while drawing nothing. The
  wave polygon's build (up to 90 lines) is what makes his beams lag on
  heavy frames.
- **flight.** `vb_flight_target` writes `!fl_tp_custom` every field frame
  after the tick (kind 3, species 46, position, terrain); please read it in
  the same frame or the next (it is rewritten each frame).
