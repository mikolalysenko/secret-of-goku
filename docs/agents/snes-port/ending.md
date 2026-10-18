# Ending module (finale cinematics and planet views)

Spoilers. Part of the [SNES port](plan.md); build and harness in
[snes-rom.md](../snes-rom.md). Sources: `snes/src/modules/ending/`,
generators `snes/gen/ending.mjs` (+ `ending-art.mjs`, `ending-space.mjs`,
`ending-vista.mjs`, `ending-flight.mjs`), tests in `snes/test/ending/`.

Browser sources ported: `engine/shenron-ending.js`, `wish-flight.js`,
`ending-departure.js`, `kai-planet.js`, `planet-view.js`,
`planet-fragments.js`, `boss-rush-death.js`, `mana-tree-vista.js`,
`ending-events.js`, `ending-rules.js`.

## Status

| Phase (id) | Browser | Cartridge | Test (`run.mjs`) |
| --- | --- | --- | --- |
| transition (1) | 48-frame fade to black (every pixel, dialogue too) | done: a ceiling on the game's brightness | no dedicated test |
| summon (2), dragon (3), wish (4) | `treeVista`, Shenron, Balls, sparks, fallout | done | `vista`: 12 stills 95.5-96.0% (below the open dialogue box) |
| scatter (5) | wish picture fading out, then `createWishFlight` | done (Mode 7 floor) | `flight`: 11 stills 90.6-99.0% |
| reunion (6) | native cliff scene | done: black until the script's door 3FF reloads the cliff, Dyluck via the object-list hook | `loads`: the cliff 99.1% of a native load, Dyluck present |
| village (7) | Goku beside the native Randi | done | `depart`: village 99.1% |
| depart (8) | power-up, launch, whiteout, distant globe, fade | done | `depart`: 15 stills 99.1-100% |
| kai (9), complete (10) | King Kai's planet, end cards | done | `kai`: 93.1% |
| doomed (11), explode (12), escape (13) | planet-view globe, explosion, teleport | done | `space`: 15 stills, 65-100% (fragments differ in shape, see below); `loads`: the globe after door 2F 99.9% |
| fatal (14) | boss-rush death, planet explosion, GAME OVER | done | `fatal`: 7 stills 65-100%, Start returns to the title |
| Fortress cutaway (world flight) | planet-view `isShot`: globe, `beam()`, ring, dust, fade | done (the default target's globe) | `cutaway`: 11 stills 99.7-100% |

All eight tests pass (`node snes/test/ending/run.mjs`), together with the
story tests that exercise the hooks and the scene select's good-ending,
bad-ending and explosion presets (`node snes/test/debug/run.mjs`).

## How the scenes run

Every finale scene runs **inside the native field loop**: `ending_frame`
after the game's logic (`modules_field_frame`, after `fx_frame`, before
`audio_frame`) and `ending_nmi` in vblank after the game's uploads
(`modules_field_nmi`, before `fx_nmi`). The event interpreter, its waits
and the native dialogue keep running; the native script drives the
sequence (story hooks, below) exactly as `native-story.js` does. The
Fortress cutaway runs in world flight instead (`ending_world_frame` after
`fx_world_frame`, `ending_world_nmi` first in the world vblank).

Code: the main bank `$A9` (FastROM) and a second code area in the lower
half of `$ED` (`!CODE_ENDING_X`, the cutaway and the music sync), reached
with `JSL` both ways. Art only DMA or HDMA reads lives in extended data
(ExHiROM banks `$40-$7D`, `ending_<blob>` labels from `!XDATA_ENDING_*`);
blobs the CPU reads in its loops stay in fast ROM (`E9:0000`, `EC:0000`).

Sound goes through the audio module (`docs/agents/snes-port/audio.md`):
every cue through `ending_sound` (`!ending_sfx` records the last, `audio_sfx`
plays it), and `ES_MUTED` (the whole scatter and the finale death, as
`musicMuted`) through `ending_music_sync` at the end of every field
frame: `audio_fade $00` silences the native music at once (re-sent every
32 frames, since a native song command sets its own volume), `$0F` brings
it back when the scene lets go.

Code runs with DB = `$32` (the SRAM work bank: low WRAM mirror, I/O and
the scene work area `$32:6000-7FFF` are all absolute); ROM tables through
long addressing. Every immediate carries an explicit width.

Families (`s_family`):

- **black** (transition): a ceiling on the game's
  brightness shadow `$E6`; the native picture is untouched.
- **overlay** (village, the departure until 144): the native picture
  stays; Goku and the charge orbs are core *front* OAM sprites (in front of
  every native sprite) from OBJ VRAM region `FIELD_OBJ_A` (claimed from
  core, owner `$09`), OBJ palettes 6-7 committed into the game's palette
  buffer. While the village or the departure runs, `ES_NATIVEBOY` makes the
  goku module keep the native boy (`GOKU_CTL_SUPPRESS`), as the browser's
  `nativeBoy`.
- **full screen** (vista, flight, King Kai, globes, death): the scene owns
  BG1/BG2/OBJ, the PPU registers except BG3's (rewritten every vblank from a
  shadow block), VRAM `$0000-$3FFF` and `$5000-$57FF`, the CGRAM ranges it
  declares, all 128 OAM slots (core's module area is closed) and HDMA
  channels 2-6. BG3 (the dialogue) is never touched: HDMA channel 5 rewrites
  TM at line 170 so the dialogue stays above the picture only where the
  browser keeps it, and again at 196 after the field IRQ's HUD split
  (`$212C = $14`, `$2105 = $09` at the end of line 195). The game's BG
  streaming and tile-animation requests are dropped meanwhile; the goku
  module is quieted (`GOKU_CTL_SUPPRESS`, ~60 lines a frame for a hidden
  sprite).

Palettes: every colour of a scene is a base colour in the scene's
component arrays; `palette_build` applies the white/black mixes of the
browser's `dim`/`brighten`/`light` per channel with 33-level curves (a
pure dark or pure white set is one 192-byte block move from ROM,
`fade_words`), round-robin over the declared ranges with as many colours
per frame as the frame has time for (latched V counter: 3 per line before
line 200, 16-192), and `pal_commit` writes the outputs into the buffer
the field NMI uploads (`7E:0600`, or `7E:BE00` while `$2A` is set). The
game's buffer is saved when a scene takes the screen and restored when it
lets go on the same map.

Uploads: a load script (ROM entries) and a dynamic queue (cell swaps)
through a transfer engine in `ending_nmi` that counts its own time per DMA
and per entry and stops with the vblank (`core_vblank_lines`). While a
full-screen scene loads, its picture is black and the clock holds; the NMI
may then overrun vblank (still force-blanked by the field NMI), which only
delays a black frame. The departure loads its globe under white with the
vblank budget (`s_ldvis`) and the clock running.

Native map loads: a door changes `$DC` at once, fades the field out over
~60 frames and then loads in one blocking pass (forced blank, no frame or
vblank hook for ~14 frames). The loader's object-list read (`C0:C487`,
story's `OBJECT_LIST_ENDING` hook) tells the module that VRAM, CGRAM and
the registers now hold the new map. A full-screen scene then loads its
stage again and its clock goes on (the browser's picture stays up over
native loads: the bad ending's door 2F to map 246 under the doomed globe);
the native fade darkens it meanwhile. A load under the scatter ends the
flight (the script's next door is the reunion's cliff or Potos), and the
reunion's load gives the field the screen back. The overlay follows the
boy to the new map (`$DC`).

## Scenes

Frame counts are the browser's (`ending_age` counts the phase's frames).

### Transition (1)

`shenron-ending` transition: the whole screen fades to black over 48 frames
(a ceiling of `15 (48 - age) / 48` on the brightness), then black until the
next cue.

### Shenron's vista: summon (2), dragon (3), wish (4)

`shenron-ending` `prepare()` with `treeVista`: map 236's two picture planes
as the cartridge draws them (`cinematic-map.js`), rebuilt **exactly**:
every aligned 8x8 block of the engine's rendered planes is one native tile
in one native palette, so the generator recovers indices against the
map's own palettes (BG palettes 1-7 = the map's, backdrop = its sky).

- BG2: the far plane from x 24 (33 tile columns, a 64x32 map at `$5000`,
  `HOFS = 6`), ruined until the wish restores the Tree (the differing
  520-byte map span through the queue); `VOFS` from `44 - round(scroll/4)`.
- BG1: the cliff from row 144 (32x32 map at `$1800`), priority tiles, so
  Shenron (OBJ priority 2) rises between the planes; `VOFS` from
  `156 - scroll`.
- Shenron: `shenron.png` nearest-sampled to 72x79 (alpha > 0 opaque, as
  the browser's decode), 23 16x16 cells in two fitted 15-colour palettes,
  `y = 66 + round(160 rise^2)`, `rise = max(0, 1 - age/96)` (per-age table).
- The seven Balls (`dragon-balls.png` at size 12, `ki-art.js` frames) on the
  ellipse around (128, 184 + scroll), Dryad's eighth (`EF_EIGHTH`) at
  (128, 172 + scroll); Goku from behind (goku module cell, column 0 row 3).
- Gold sparks: dragon (age < 96) four rising from `106 + 15 i`; wish
  (age < 72) four at `114 + 24 (i & 1), 132 + 26 (i >> 1)`.
- Summon: 32 fallout flakes (positions every third frame, cached and block
  copied into OAM), `dim(1 - age/48)`. Wish: `brighten(.65 (1 - age/36))`.

Done flags: summon at 48, dragon at 96, wish at 72.

### The scatter (5): the vista fading, then the wish flight

Ages 0-29: the wish picture at age 96, `dim(age/30)`. At 30 the flight
stage loads under black (the clock waits; 25 frames), then
`createWishFlight` from 30 to 480 (`dim((60 - age)/30)` until 60):

- **Floor**: Mode 7 BG1. The world's own characters (`C6:0000` packed
  4-bit tiles with their palette nibbles `C6:7D80`: pixel =
  `palette << 4 | index`) and a 128x128-tile window of its map (the row
  RLE of `C0:9A00`, row offsets `C6:8000`, bank bit `C6:7FC0`) are
  converted at load time (`LD_M7TILES`, `LD_M7ROWS`, in the loading NMI
  until the latched V counter reaches line 150; rows are expanded into a
  buffer, long runs by block move, then two DMAs). The generator picks the
  window (x 48, y 424 in tiles) that holds 78% of the browser's floor
  samples over the flight and lists the 53 characters it uses. Night
  colours: CGRAM 64-127 and 144-207 from `C6:483E`.
- **Perspective**: per line `K = y - horizon + 6`, `z = floor(20000/K)`;
  the browser's `X = originX + ((vx (z + travel) - vy side) >> 8)` is one
  Mode 7 matrix per line: `A = -vy T1`, `C = vx T1` (`T1 = 256 z / 164`),
  `B = vx T2`, `D = vy T2` (`T2 = 256 z / K`), with M7X/Y = the camera,
  `M7HOFS = M7X - 128`, `M7VOFS = M7Y + 6 - horizon` (so the hardware's
  `B (y + VOFS - M7Y)` is `B K`). A/B and C/D are two indirect HDMA
  channels (2, 3) over per-K tables in SRAM; the horizon only moves the
  first entry. The camera's turn (180-420) rebuilds the tables in vblank
  with the PPU's multiplier (free outside Mode 7 rendering; `h = v/2`,
  `T h / 128`), double-buffered, about every 8 frames. Lines with K < 13
  (where B would overflow 8.8) repeat the K = 13 matrix.
- **Sky**: the backdrop gradient `rgb(0, 1 + (y >> 6), 4 + (y >> 5))`
  written into colour 0 by HDMA channel 6 (through the current fade
  curves); TM shows BG1 from the line under the horizon; channel 4 puts
  `$2105 = 7` back after the HUD split.
- **Sprites** (OBJ name table 1 at `$5000`, tiles 256-383: OBJSEL base
  `$4000` whose table 0 is BG3's font and never used): the vista's cell rows
  0-3 copied whole (Balls, Shenron, star tiles), then at 240 sparks and the
  Balls at sizes 10 (and 8/6/4, one size at a time) take Shenron's cells.
  86 stars (8x8, priority 0, behind the floor) from the browser's hash, in
  OAM slots 42-127 by one DMA per frame (positions change every 12/18
  frames); Shenron (until 240) and the ring in fixed slots; after the
  scatter the big spark, each Ball before its three trailing sparks.
- Flash at 300-303 (`brighten((304 - age)/8)`), sounds `FLIGHT` at 60 and
  `CHARGED` at 300, `ES_AIRBORNE` 60-420, `ES_MUTED` throughout, done at 479.

### Reunion (6)

The browser lets the native cliff scene play: the picture is released.
The script (`frieza-events.js`) calls 176, then 73A (a sound command),
then door 3FF to map 180. The full-screen scenes before it left their
stage in the field's VRAM (`$0000-$3FFF`, `$5000-$57FF`), so the cue holds
the picture black (field registers and palette back, brightness ceiling
0) until that load, then lets go: the native fade-in shows the cliff from
the field's own graphics, with Dyluck, whose record the object-list hook
adds when map 180 loads for the reunion (or after the flight). He shows
while `$CF4E` is 8-15, as in the finale. Without a load the hold ends
after 300 frames. Not yet run end to end through the story's events.

### Village (7) and the departure (8)

Village: Goku's 32x32 cell (column 0, row 0) with its top-left at the
boy's `(x + 10, y - 31)` (`$E020/$E022`) every frame.

Departure (DE, 300 frames, `ending-departure.js`): the take-off point is
the boy + 26; poses column 0 / 54 (charging, 12-56) / 38 row 3 (flight from
56); the rise `round(-.055 t^2)` and the space orbit come from the
browser's own functions (generator tables). Charge orbs (native
`charge-orb` cells, 5 frames, OBJ palette 6) at `(x - 13, y - 14)` and
`(x + 13, y - 8)` for 12-72. The cloud (114-144) whitens **every** colour
through the palette pipeline (the game's colours 0-223 are taken as base
colours over 107-113; colour math could only add a constant). From 144 the
day globe (planet-view `depart`) loads under white with the clock running:
stars, the goku module's 16x16 miniature of the flight cell on
`departureOrbit`, white `(174 - age)/30`, black `(age - 266)/34`.
`ES_CHARGING` 12-56, `ES_AIRBORNE` 56-266, sound `FLIGHT` at 56, done at 299.

### King Kai's planet (9) and the end cards (10)

`kai-planet.js` / `planet-view kaiPlanet`: the backdrop reduced to 740
blocks and fitted to six palettes (BG1), the card (BG2, `native-radio.js`
window and font), King Kai/Bubbles/Goku as 32x32 actors from 16x16 cells,
drawn back to front by y. Bubbles walks the browser's state machine with
integer maths. Good arrival fades in over 32 frames; `complete` hides the
game's input.

### The bad ending in space: doomed (11), explode (12), escape (13)

`planet-view.js`: the night or day globe (`planetSurface`) on BG1 with the
seams revealed per age through a ring mirror of crack tiles, the starfield
on BG2 (twinkles as map words), the flash disc and shock ring as HDMA
window tables (channels 2, 3, 4, 6, indirect, constant tables over per-line
bytes) with colour math, 39 brick fragments as precomputed OAM per drift
frame (palettes per heat and fade level), sparks from a scanline budget,
then the teleport lines (a TM band) and Goku's escape pose.

### Finale death (14)

`boss-rush-death.js`: the native collapse (0-300, Super Saiyan reverts at
18), the death fade (300-360 brightness ceiling), black, the night globe
(408), its explosion (576), the sky's fade (780-840) and GAME OVER (900,
`native-radio` card); Start returns to the title. While it runs, the death
warp (7FF) and both boss-victory events (42D, 42F) are refused by a gate in
the event dispatcher (`C1:E77E`), as `installFinaleDeathGate`.

### The Fortress cutaway (world flight)

`world-ki.js` starts it 24 frames after the full wave destroyed the
Fortress; the world module counts `!w_cut_age` 0-185 and keeps flying
underneath (its own stand-in fades `$E6`, which keeps the world black
after the cutaway until the deck landing). planet-view.js `prepare()` with
the shot, rebuilt per age by `ending-cutaway.mjs` with the browser's own
`sky()`/`beam()` formulas:

- BG1: the space stage's globe (night during Frieza's crisis,
  `STORY_Q_FRIEZA_CRISIS`), at planet-view's default target.
- BG2: the stars; every cell the beam, the shock ring or a twinkling
  star touches (102) is a high-priority footprint slot redrawn per age
  (the band, the ring and the stars outside the globe composited), in an
  order that keeps each age's changes in a few runs (1-7).
- OBJ: the 64 dust particles, one 544-byte OAM image per age written into
  the game's OAM buffer by WRAM DMA.
- CGRAM: one image per globe and fade level (164-186: floor per channel,
  as the browser), uploaded when the level changes or world flight's NMI
  has put its own palette in (`C0:8A79`).

The first frame loads everything under forced blank (one black frame),
then each vblank sets Mode 1 and the scene's registers, keeps the world's
HDMA off, lifts VTIME above 256 so the horizon IRQ (`C0:8A4B`, which
switches to Mode 7) cannot fire over the picture (put back when the
cutaway ends), and uploads each age's footprint runs within the vblank
budget. VRAM avoids what world flight still writes (Mode 7 characters
`$2200-$2FFF`, sky map rows in `$5000-$5FFF`, the world module's OBJ region
`$6600-$6FFF`); the native Mode 7 row/column uploads are dropped and the
world module pauses its crater refresh meanwhile (the landing reloads it
all).

## Budgets

| Scene | VRAM | CGRAM | OBJ sprites | HDMA channels |
| --- | --- | --- | --- | --- |
| King Kai | BG1 map `$3800`, card `$3C00`, tiles `$0000`; OBJ base `$4000`, cells `$5000` | BG 1-7, OBJ 0-2 | 3 actors (12) + lines | 5 |
| Space (doomed, explode, escape, death) | OBJ `$0000-$1FFF`, BG tiles `$2000`, maps `$5000`/`$5400` | backdrop, BG 1-7, OBJ 0-1, 4-7 | ≤ 66 (fragments, sparks) | 5; 2, 3, 4, 6 for the disc and ring |
| Vista | OBJ `$0000-$0BFF`, BG1 map `$1800`, tiles `$2000`, BG2 map `$5000` | backdrop, BG 1-7, OBJ 0-4 | ≤ 71 | 5 |
| Flight | Mode 7 `$0000-$3FFF`, OBJ table 1 `$5000-$57FF` | backdrop, 64-127, 128-255 | ≤ 128 | 2, 3 (matrix), 4 (mode), 5 (TM), 6 (gradient) |
| Overlay (village, departure to 144) | `FIELD_OBJ_A` (`$7220`/`$7320`) | OBJ 6-7 (all 256 in the cloud) | 6 front | — |
| Departure from 144 | the space stage, day globe only | as space | 1 | 5 |
| Fortress cutaway (world flight) | BG1 tiles `$34D0-$4810`, map `$4C00`; BG2 map `$6000`, tiles `$7000-$7B30`; OBJ tiles 64-93 (`$6400`) | all 256 (per fade level) | ≤ 64 | none (the world's off) |

Measured frame cost of the module (game logic not included, SlowROM):
vista 40-50 lines (65-80 during its palette fades), flight 30-45 (80-90
during the scatter's burst at 300-340), overlay 11-17 (the cloud ~45).
FastROM (core's default since main `c81158d`) runs the module's code and
data about a third faster.

Lag with FastROM (the ending tests on the finale's map 180 and the
imported states): vista 5 frames over the whole sequence (was 9 with
SlowROM: the load frame, the wish's flash), flight 6 over 450 (was 10),
King Kai, space and death 0, departure 1 (was 3: its first frame, the
space load under white). The flight's stage loads in 25 frames (27-30
with SlowROM). With SlowROM on a busier map (Potos with its NPCs, ~150
lines of game logic) the flight dropped one frame in eight. No vblank
overruns while a picture shows.

## API

JSL, any M/X; registers preserved except where noted.

| Entry | Use |
| --- | --- |
| `ending_begin` | Event 42F. A (low byte) = `!EF_*` flags (bit 0 bad). Good starts the transition, bad the doomed globe. Ignored once begun. |
| `ending_event` | A16 = native event id when one starts (6B, A3-A6, 14F, 176, DE, E4): the phase as `cue()` (bad remaps A3/A4/A5 to explode/escape/kai), with its side effects (summon ends Super Saiyan, wish calls `story_api_quest_wish`, village revives Randi, sounds). |
| `ending_cue` | A (low byte) = phase id, applied next frame (tests, debug). |
| `ending_lose` | Finale death (`boss-rush-death.js`). A: `EF_GOLD` (died as Super Saiyan), `EF_ORBIT` (died in orbit). Ignored once begun. |
| `ending_stop` | Release the picture. |

Story hooks (`story/hooks.asm`): `ENDING_BEGIN` (42F: `story_api_ending_result`
picks good/fortress/balls/frieza/beast; Frieza's crisis puts the doomed
globe on its night side), every `ENDING_CUE_*` (6B, A3-A6, DE, E4, 14F,
176), `OBJECT_LIST_ENDING` (map 180 gains Dyluck's record), query
`ENDING_ACTIVE`. Debug scene select: `SCENE` waits of the good-ending,
bad-ending (phase open) and explosion (phase explode) presets; while the
explosion's wait runs, the hook advances the prose as the browser's held
R does (B on a button wait without a choice, through `!core_pad_inject`)
until the bad ending's A3 cue starts the explosion.

WRAM block `!RAM_ORBIT+$80..$B3`:

| Address | Field |
| --- | --- |
| +$80 | `!ending_request` (byte): phase requested, `$FF` stop |
| +$81 | `!ending_phase` (byte): 1 transition, 2 summon, 3 dragon, 4 wish, 5 scatter, 6 reunion, 7 village, 8 depart, 9 kai, 10 complete, 11 doomed, 12 explode, 13 escape, 14 fatal |
| +$82 | `!ending_age` (word): frames in the phase |
| +$84 | `!ending_flags` (word): `EF_BAD` 1, `EF_EIGHTH` 2, `EF_SSJ` 4, `EF_GOLD` 8, `EF_ORBIT` $10, `EF_NIGHT` $20, `EF_BEGUN` $8000 |
| +$86 | `!ending_done` (word): bit n set when phase n's timeline finished (event scripts can wait on it) |
| +$88 | `!ending_status` (byte): `ES_ACTIVE` 1, `ES_NATIVEBOY` 2, `ES_MUTED` 4, `ES_AIRBORNE` 8, `ES_CHARGING` $10, `ES_COMPLETE` $20, `ES_DEFEATED` $40, `ES_LOADING` $80 |
| +$89 | `!ending_sfx` (byte): last sound cue: 1 power burst, 2 charged, 3 flight, 4 teleport, 5 teleport in, 6 revert, 7 Frieza orb, 8 Fortress break (each also played with `audio_sfx`) |
| +$8C/$8E | `!ending_target_x/y`: globe target (0 = planet-view's default) |
| +$90 | `!ending_map0`: the map the scene took the screen on |
| +$92 | `!ending_live` |
| +$94 | `!ending_reason`: `endingResult` 0 good, 1 fortress, 2 balls, 3 frieza, 4 beast |
| +$96/$98 | `!ending_depart_x/y`: the take-off point |
| +$9A-$9E | scratch, `!ending_gokuctl` |
| +$9F | `!ending_reload`: a native map load ran under a scene (object-list hook) |
| +$A0 | `!ending_pulse`: the explosion preset's prose pulse |
| +$A2 | `!ending_mute`: frames the native music has been silenced (0 = not) |
| +$A3-$B3 | the cutaway: on, load, age, shown age, night, end, runs, run pointer, DMA bank, fade level, DMA budget |

## Resources

| Resource | Use |
| --- | --- |
| Code | `$A9:8000-FF1C` (227 bytes free); second area `$ED:0000-07D9` (30 KiB free) |
| Fast data | `E9:0000` (31.3 KiB: fade sets, fragment and spark OAM, window lookups, the flight's tables), `EC:0000` (10.7 KiB: crack events); `EE:0000`, `EF:0000` free |
| Extended data | 41 blobs, 325 KiB in `$40-$7D`: King Kai 40 KiB, space 70 KiB, vista and flight OBJ/maps, the cutaway 208 KiB (OAM images 101, footprint runs 83, palettes 22) |
| WRAM | `!RAM_ORBIT+$80..$B3` |
| SRAM | `!SRAM_WORK_SCENE` (`$32:6000-7FFF`) while a scene runs: state, palette components and outputs, curves, queue, HDMA tables, the flight's matrix tables, row and star buffers |
| VRAM | per scene above; core region `FIELD_OBJ_A` (owner `$09`) for the overlay |
| HDMA | channels 2-6 in full-screen scenes (5 the TM cut, 2/3/4/6 windows or the flight's matrix, mode and gradient); fx keeps 2/3 only while its polygons run; none in the cutaway (world flight's 0-5 off) |
| DMA | channel 7 (vblank transfers, palette commit, OAM copies) |
| Hijack | `C1:E77E` (5 bytes, the finale death's event gate) |
| Generated | `dist/snes/gen/ending/` (never committed) |

## Differences from the browser

- The browser composites per pixel over the native picture; the cartridge
  owns the PPU for full-screen scenes and uses the native picture only in
  the overlay scenes. The overlay's Goku is in front of every sprite but
  below BG3's priority tiles (an open dialogue box covers him; the browser
  draws him over it in the departure).
- Flight: Shenron keeps his full 72x79 size (the browser shrinks him to
  ~53 px while he rises away; no ROM for scaled copies). The floor is the
  world inside a 128x128-tile window; beyond it (the last lines before the
  horizon) the window repeats. The turn updates the matrix tables about
  every 8 frames rather than every frame. The stage load adds 25 black
  frames at age 30 (the clock waits, so the native 480-frame wait ends the
  scene up to that much earlier, on the empty sky). Sprites crossing the
  left edge pop in whole; on the scatter's crowded lines the hardware's 34
  slivers per line can drop pieces of sparks.
- Explosion: 39 brick fragments without rotation against the browser's 64
  rotating Voronoi shards (stills 65-80% during the drift, position and
  colour agree).
- Departure cloud: a colour can trail the white mix by a few frames (round
  robin).
- Fades are exact per channel, but palette-based: they apply to the
  scene's colours, never to BG3's dialogue (as the browser's `dim`).
- Fortress cutaway: the globe is always planet-view's default target's
  (the browser turns it so that the Fortress, wherever it was hit, sits
  under the strike point); the beam, ring, dust and fade are the same.
  Globes per target would cost ~16 KiB of extended data each (a grid of
  8 x 4 per day and night: ~1 MiB). The first frame is black (the load),
  and on the first frames, where all 64 dust particles start on the same
  lines, the hardware's 32 sprites per line can drop some.

## Integration and requests

- **frieza**: calls `ending_lose` (A = `EF_GOLD`, X = the encounter
  key) on the death frame, as `battle-retry.js` (its `fz_death_tick`);
  the ending module keeps only the event gate at `C1:E77E`. Its
  `STORY_Q_FRIEZA_CRISIS` answer (from the core's impact until the wish)
  puts the doomed globe and the cutaway's globe on their night side;
  until it merges, the bad-ending presets show the day globe where the
  browser's references show the night one.
- **world**: `world_nmi_scars` returns while `!w_cut_age` runs (the
  cutaway's VRAM); nothing else changed there.
- **core** / **layout**: the comments of `core/layout.asm` still name
  `$EC-$EF` lower halves as ending art; they now hold fast tables (`E9`,
  `EC`), the second code area (`ED`) and nothing (`EE`, `EF`).
- **core**: `core_spr_cull` accepts y down to -64, but an 8-bit OBJ Y below
  -16 (16x16) or -32 (32x32) shows at the bottom of the screen; the overlay
  culls itself to [-32, 224). A "map loaded" notification would replace
  the module's use of the object-list hook as the load signal.
- **story**: keep the finale scripts' doors where `frieza-events.js` has
  them (2F after 42F, 3FF right after cue 176, 08E before A5): the module
  reloads or releases its picture on those loads.
- **goku**: with `GOKU_CTL_SUPPRESS` in the village the HUD portrait stays
  Goku's; the browser shows the native boy there too.

## Tests

`node snes/test/ending/run.mjs [kai|space|fatal|depart|vista|flight|loads|cutaway]`
(Mesen at `.local/tools/mesen`, outputs under `.local/snes-test/ending/`).
Each scene is cued through the module's request byte from an imported
browser-mod field state; references are composed with the browser
engine's own code and assets (`reference.mjs`: `kaiReference`,
`planetReference` drives planet-view.js itself, `vistaReference`,
`flightReference` drives `createWishFlight`, the departure's Goku and orbs
from the browser atlas and native effects). Mesen's screenshots trail the
emulation by 2-5 frames, so stills hold the clock at the age for 14 frames
(`E.still`); timelines (status bits, sounds, done flags, lag, vblank
overruns) are measured on a separate untouched run.

| Test | State | Checks |
| --- | --- | --- |
| `kai` | `preset__bad-ending` | both outcomes, end cards 93.1%, Bubbles on the lawn, done/complete bits, lag ≤ 2 |
| `space` | `preset__bad-ending` | doomed (night/day), explosion, escape against planet-view; lag ≤ 2, no overruns |
| `fatal` | `preset__bad-ending` | collapse light, fade, black, globe, explosion, GAME OVER; Start to the title |
| `depart` | `emulator-probe__potos-state` (Potos) | village 99.1%, 15 departure stills 99.1-100%, Randi native, status/sound/done, lag 1, release |
| `vista` | `ending-fix__end-20` (map 180) | 12 stills 95.5-96.0%, done flags, Shenron's rise without lag, lag ≤ 12 |
| `flight` | `ending-fix__end-20` (map 180) | 11 stills 90.6-99.0%, load ≤ 30 frames, muted/airborne/sound/done, lag ≤ 20, no overruns |
| `loads` | `emulator-probe__potos-state` | doors through core's event mailbox: 2F under the doomed globe (reloaded, clock on, 99.9%), cue 176 after the flight holds black, door 3FF: the cliff 99.1% of a native load of it, Dyluck present |
| `cutaway` | the world tests' waterfall checkpoint | Super Saiyan takeoff, the Fortress 400 px ahead at the default target, the full wave: 11 stills 99.7-100% against planet-view itself (age held), footprint DMA ends by line 254, the age trails by at most 1, the field's IRQ line (VTIME 196) back after the deck landing |

Sounds are checked on the calls into the audio module (`audio_sfx`,
`audio_fade` watched in Mesen): silence at the scatter's and the death's
first frame, full volume back at the release, flight 60 / charged 300,
flight at the launch (56), power burst at the blast (48), Frieza's orb 408
and the Fortress break 624 in the death. Every test runs on a private ROM
copy (its own battery file) with Goku's persistent flag set after the
import.

The scene select's ending presets (`node snes/test/debug/run.mjs
good-ending bad-ending explosion`) start from power-on: bad-ending and
explosion end FULL (map 246, every checked state as the browser's),
good-ending NATIVE (the map and position belong to the frieza module's
good-ending answers). Their pictures show the day globe until frieza
answers the crisis query (the browser's are night).
