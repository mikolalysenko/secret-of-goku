# Ending module (finale cinematics and planet views)

Spoilers. Part of the [SNES port](plan.md); build and harness in
[snes-rom.md](../snes-rom.md). Sources: `snes/src/modules/ending/`,
generators `snes/gen/ending.mjs` (+ `ending-art.mjs`, `ending-space.mjs`, `ending-shards.mjs`,
`ending-vista.mjs`, `ending-flight.mjs`, `ending-cutaway.mjs`,
`ending-globes.mjs`), tests in `snes/test/ending/`.

Browser sources ported: `engine/shenron-ending.js`, `wish-flight.js`,
`ending-departure.js`, `kai-planet.js`, `planet-view.js`,
`planet-fragments.js`, `boss-rush-death.js`, `mana-tree-vista.js`,
`ending-events.js`, `ending-rules.js`.

## Status

| Phase (id) | Browser | Cartridge | Test (`run.mjs`) |
| --- | --- | --- | --- |
| transition (1) | 48-frame fade to black (every pixel, dialogue too) | done: a ceiling on the game's brightness | no dedicated test |
| summon (2), dragon (3), wish (4) | `treeVista`, Shenron, Balls, sparks, fallout | done | `vista`: 12 stills 95.3-95.8% (below the open dialogue box) |
| scatter (5) | wish picture fading out, then `createWishFlight` | done (Mode 7 floor) | `flight`: 14 stills 94.6-99.0% |
| reunion (6) | native cliff scene | done: black until the script's door 3FF reloads the cliff, Dyluck via the object-list hook | `loads`: the cliff 99.1% of a native load, Dyluck present |
| village (7) | Goku beside the native Randi | done | `depart`: village 99.1% |
| depart (8) | power-up, launch, whiteout, distant globe, fade | done | `depart`: 15 stills 99.1-100% |
| kai (9), complete (10) | King Kai's planet, end cards | done | `kai`: 93.1% |
| doomed (11), explode (12), escape (13) | planet-view globe, explosion, teleport | done | `space`: 16 stills, 83.1-99.9% (64 Voronoi shards, quantized rotation); `loads`: the globe after door 2F 99.9% |
| fatal (14) | boss-rush death, planet explosion, GAME OVER | done | `fatal`: 7 stills 83.9-100%, Start returns to the title |
| Fortress cutaway (world flight) | planet-view `isShot`: globe, `beam()`, ring, dust, fade | done (34 target orientations, day/night) | `cutaway`: 59 stills; sampled age-140 views 89.4-99.9% |

All nine tests pass (`node snes/test/ending/run.mjs`), together with the
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

Code: the main bank `$A9` (FastROM) and a second code area in the spare
upper quarter of audio's code half (`$AA:C000`, `!CODE_QUARTER_AUDIO` as
`!CODE_ENDING_X`: cutaway, music sync, vblank handlers, flight scale and
shard cache), reached with `JSL`
both ways. Art only DMA or HDMA reads lives in extended data
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
line 200, 16-192). The outputs go up in the field NMI's own palette
transfer: `ending_cgram_upload` (`upload.asm`) is an upload handler of
core's hook at `C0:C0F0` (`core/cgram.asm`). It sends the game's buffer
(`7E:0600`, or `7E:BE00` while `$2A` is set) with the declared ranges taken
from `s_palout` (or the direct palette) and the edge colours over them, in
the order `pal_commit` prepares each frame (`s_cgord`). The game's buffer
is never written, so nothing is saved or restored, and the scene's colours
also survive lag vblanks with a window open.

No DMA from the frame thread over HDMA: revision-1 S-CPUs can hang when
HDMA runs during a general DMA, and the flight's floor is HDMA-driven.
- The flight's Shenron entries go into the game's OAM image through
  `wq_push`. `ending_preupload` (core's `modules_field_preupload`) runs
  the queue in the vblank, before the game's OAM transfer, only after a
  completed frame.
- Its unused front slots get Y = 224 by CPU stores.
- The space scenes stream up to three complete shard cells before their
  queued OAM image. The generator never overwrites a cell still used by
  the previous picture; a missed deadline hides the fragment group and
  fails the tests.
- Its stars persist in OAM slots 42-127: the module area ends at slot 42,
  so the game's next OAM pass leaves them. They are copied by a
  low-priority vblank job (`nmi_lowcopy`, after the transfers, only with
  budget left) when they drift, and every 64 frames.
- The cutaway's dust image (`cut_oam`, world flight) still copies from the
  frame thread, but its vblank turns the world's HDMA off first.

The tests check every watched trigger: channel 7's size is never 0 (a
vblank that split a set-up would copy 64 KiB over WRAM), and none starts
on a visible line with an HDMA channel enabled. `ending_dma_guard` still
keeps the cutaway's set-up clear of the vblank NMI.

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

### Native dialogue uploads

The opening animation does **not** use W34SEL, TMW, WH0/WH1, or colour
math to mask unfinished tiles. Traces of the browser's native PPU and the
cartridge keep both BG3 windows disabled. Native HDMA channels **0/1**
write CGADD/CGDATA for the dialogue/HUD palettes (`C0:C1E7`); they do not
write window edges. The opening draws tile `$120` (seven transparent rows
and one black row) across two vertically mirrored tilemap rows, then
replaces it with the window border.

Full-screen scenes skip the native actor streamer with `core_actor_hold`.
That also skips its `C1:952D` write of **VMAIN `$80`**, after the HUD updater
(`C0:C238`) left VMAIN at `$00`. The following native dialogue DMA assumes
increment-after-high. Increment-after-low shifted every high graphics
plane and tilemap attribute one word right: the leftmost `$2120` became
glyph `$0020`, tile `$120` picked up blue dots, and the rightmost stale
attribute produced the alternating bar.

Core's `core_actor_cells` now runs the streamer's prologue
(`C1:950D-C1:952D`) on a skipped frame: DMA channels 4-7 set for VRAM word
writes and VMAIN `$80`, exactly as the streamer leaves them before its
phase work. That covers every module that holds the streamer (the endings
and the orbit's cinematics). No window registers, colour math or HDMA
allocations change; the disc and ring keep both windows and channels
2/3/4/6. The prologue costs a few dozen cycles on held vblanks only.

The `dialogue` regression opens event `$134` over 13 scenarios: ordinary
field, doomed globe, explosion disc/ring, escape, vista, flight, King Kai,
native fatal view, fatal globe/disc/ring, and the departure globe. Every
BG3 graphics/map DMA is checked byte-for-byte against its WRAM source,
with the native palette HDMA and safe transfer timing checked too. With
only the fix reverted in a private ROM, the ordinary/native-fatal
controls pass and every full-screen case detects the corrupt transfers.
The 240-frame power-on hunts have no thin-line-opening transients:
bad-ending retains only frames 12–14 and explosion 211–213, the same
three border-expansion frames present in the browser (12–14 and 205–207).

Strict build, all nine ending cases, debug's bad-ending/good-ending/
explosion/space presets (all FULL), and all six perf scenes pass. Scene
lag remains space/fatal 0, vista 1, flight 2; no visible vblank overruns.
Idle `modprof` remains 0.46–0.47 lines for `ending_frame` and 0.13 for
`ending_nmi`; the existing frame cost is above the 0.3-line guide.

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
- **Sprites** (OBJ name table 1 at `$6000`, tiles 256-479: OBJSEL base
  `$4000` whose table 0 is BG3's font and never used): the vista's cell rows
  0-3 copied whole (Balls, Shenron, star tiles), then at 240 sparks and the
  Balls at sizes 10 (and 8/6/4, one size at a time) take Shenron's cells.
  The rise now uses every integer width 72 down to 48 from the original
  `shenron.png`, with the browser blit's nearest sampling, rounded height
  `w*140/128`, and x = `128 - (w >> 1)`. Whole cells already above the
  screen at the first age of a width are omitted. Its two OBJ buffers
  (`$6200`/`$6800`) swap only after all tiles and the matching OAM template
  arrive: up to 1 KiB per vblank, usually three vblanks ahead. Template
  copies run in vblank too. The native actor hold makes this OBJ space
  available without touching BG3's font or maps.
  86 stars (8x8, priority 0, behind the floor) from the browser's hash, in
  OAM slots 42-127 by one DMA per frame (positions change every 12/18
  frames); Shenron (until 240) and the ring in fixed slots; after the
  scatter the big spark, each Ball before its three trailing sparks.
- Flash at 300-303 (`brighten((304 - age)/8)`), sounds `FLIGHT` at 60 and
  `CHARGED` at 300, `ES_AIRBORNE` 60-420, `ES_MUTED` throughout, done at 479.

#### Wish-flight scaling validation (2026-10-21)

The new scale images use **48,128 bytes (47 KiB) of xdata**, plus 6,581
bytes of fast template/width tables. The 72-pixel image reuses the vista;
fully offscreen widths need no tile data. Full-screen agreement with
`createWishFlight` at the new rise stills:

| Age | Fixed-size baseline | Scaled |
| --- | ---: | ---: |
| 100 | 91.2% | 95.3% |
| 150 | 92.6% | 97.0% |
| 200 | 96.0% | 96.6% |

On an untouched timeline, lag remains **2 frames** (ages 41 and 302),
all requested widths are ready on time, and vblank ends by **line 259**
with zero wraps, including line 0. The initial fade precedes size uploads;
the straight-north camera avoids general multiplication until the turn.
Star tile/attribute pairs are initialized once, so horizontal drift only
writes X; this keeps the age-300 flash within its frame budget after the
shard dispatcher was added. Measured ending frame cost is **37.52 lines
mean** (baseline 38.26). The stage loads in 25 black frames. Strict build
and all eight ending cases pass.

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
bytes) with colour math, 64 Voronoi shards as precomputed rotated cells
and OAM per drift frame (palettes per heat and fade level), sparks from a scanline budget,
then the teleport lines (a TM band) and Goku's escape pose.

`ending-shards.mjs` calls the browser's `fracturePlanet` and `fragmentPose`
for the masks, radial motion and spin. Rotations are rounded to 45 degrees;
each orientation samples the squash near the middle of its age interval.
The same masks also supply the globe's revealed seams (273 crack tiles,
2,303 events). Face colours retain the four existing fragment palettes,
with colours 14/15 reserved for depth/seam and the existing heat/fade curves.

The 350-cell atlas uses 124 cache slots in OBJ VRAM; four slots remain
reserved for sparks/Goku. Each 16x16 cell is two 64-byte row transfers.
An offline schedule of 145 replacements uploads at most three cells per
vblank before the native palette/OAM transfer, with a 26-line remaining
time guard. The generated 442-byte OAM image follows through the existing
WRAM queue. Runtime lives in `space-shards.asm`, reached from `space.asm`
and `upload.asm`; `lib.asm` also exposes its cache preparation as a load
script operation. Direct escape cues and native scene reloads prepare the
requested cache under black. The direct escape test takes eight frames;
the normal explosion-to-escape transition adds no load.

The generator keeps the densest cells within 104 fragment sprites and
34 slivers per line, then fits sparks in the remaining line budget. This
omits 5.4% of candidate fragment pixels across the sampled frames. Actual
OAM in space/fatal stays at **17 sprites / 34 slivers per line**. Rotation,
squash and the retained cell set freeze at drift age 77: the browser's
escape restarts debris at that age, even after the explosion has reached
115. Keeping that cache supports the rewind without a visible reload;
radial motion, heat and fade continue through the remaining ages.

#### Rotating-shard validation (2026-10-21)

Agreement against `planet-view.js` itself, using the same full-screen
comparison as the original bricks:

| Still | Bricks | Rotating shards |
| --- | ---: | ---: |
| explode-20 | 97.6% | 99.8% |
| explode-32 | 93.7% | 99.4% |
| explode-41 | 91.6% | 99.5% |
| explode-52 | 89.1% | 90.3% |
| explode-60 | 70.2% | 84.9% |
| explode-70 | 65.1% | 83.1% |
| explode-90 | 65.8% | 85.2% |
| explode-120 | 80.3% | 92.5% |
| escape-4 | 87.7% | 95.1% |
| fatal-650 | 64.2% | 83.9% |
| fatal-700 | 83.0% | 93.6% |

The shard art uses 45,312 bytes (including the 16 KiB initial OBJ sheet),
and its OAM images use 50,830: **96,142 bytes (93.89 KiB)** of xdata,
below 120 KiB. Together with flight scaling, these features use **144,270
bytes (140.89 KiB)**, below 160 KiB. Replacing the old OBJ sheet makes the
net xdata increase **127,886 bytes (124.89 KiB)**. Both limits are build
assertions. Frame descriptors, upload jobs and deadlines occupy 2,310
bytes in the ending's existing second code quarter.

Space and fatal have **zero lag, upload misses, PPU/HDMA violations or
vblank wraps**; their vblanks end by line 258. Ending frame callbacks
average 57.33 lines for the space test (including its held stills/direct
escape) and 35.52 for fatal, maxima 127.03/104.11. Shard preupload costs
at most **6.53 lines**, including DMA; its scene-test means are 1.78/1.15.
`modprof.mjs` sword/battle measures idle frame 0.46 lines and NMI 0.13;
the existing idle frame cost remains above the 0.3-line guide.

Strict build, all eight ending cases, all six perf scenes and debug's
bad-ending/explosion presets pass. Debug classifies both presets FULL.
Perf original/build lag counts remain sword 4/4, Sandship 12/4, battle
4/4, Beast 34/34, Fortress 5/4 and flight 4/4; p90 finish lines are
45/62, 103/113, 34/54, 173/173, 90/95 and 123/112. No core or other
module code changed.

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

- BG1: one of 34 globe orientations, selected once from the saved shot
  `!w_shot_tx/ty`, not the Fortress's later `$0128/$012A`. Day/night share
  tiles and maps; `STORY_Q_FRIEZA_CRISIS` selects the palette.
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

#### Reachable targets and the 192 KiB orientation budget

The native Fortress has no fixed world-space route. `C2:B0D7-B109`
places it relative to the camera `$FA/$FC` using the wander seed `$0126`;
`C2:B133-B169` walks both coordinates by +/-6, wrapping at 4096.
Camera placement and the seed vary. `ending-globes.mjs` verifies those
original instruction bytes, so a route from one checkpoint is not treated
as a bound on reachable targets.

The atlas covers the torus with an **8x4 grid** (512 x 1024 world units),
plus `(1848,3528)` for the rounded native flight preset and `(2432,3024)`
for the established default composition: **34 orientations**. The selector
rounds the saved target to eight units, wraps at 4096, picks the nearest
grid point, then compares the two extra views by wrapped Manhattan
distance. Zero is a valid coordinate. Away from the extra views, maximum
longitude/latitude error is 22.5 degrees; coastlines between views differ.

The previous `codex-ending` implementation (`fe13cd1`, `a67e54e`) used
129 views and **1,338,944 bytes**. Lossless DEFLATE of its separate view
blobs still measured 895,871 bytes, including the shared prefix. A regular
8x4 grid alone fits but loses agreement at the native flight preset; the
extra preset view recovers that composition without dropping other views.

The new generator fits paired day/night RGB555 colours to six 15-colour
palettes and flip-deduplicates **all** tiles across the views. Pixels remain
full resolution. Storage is **188,387 bytes (183.97 KiB)**, 8,221 bytes
below the 192 KiB limit, with a build-time budget assertion:

| Orientation data | Bytes |
| --- | ---: |
| 5,060 shared 4bpp tiles, including transparent tile 0 | 161,920 |
| Padding to five bank-aligned 32 KiB xdata blobs | 1,920 |
| Shared 2 KiB map, 20x19 attribute bytes per view, consecutive tile-run descriptors | 24,547 |
| **Total (six blobs)** | **188,387** |

The existing two 22-level fade-palette blobs remain 22 KiB total,
independent of orientation count. Fast tables (187 bytes: row addresses,
view offsets, extra targets and source banks) stay in `$AA:C000`.
The load uses DMA to scatter consecutive dictionary runs into the same
307 BG1 tile slots, then uploads a 20x19 rectangle of palette/flip bytes
with 19 DMAs to `$2119`, all under forced blank. Compared with individual
CPU map writes, the rows cost 2,482 more ROM bytes and save 47 scanlines
on the load. There is no decompressor or temporary WRAM/SRAM buffer. At most
121 runs are needed; blank tile 0 plus 307 cells occupy `$3000-$433F`,
clear of the map at `$4C00`.

Loading remains one black frame: 190.76 lines for the default view,
**201.30 lines maximum** across all 34, before the next native NMI.
The cutaway runs 187 frames including loading, footprint DMA ends by line
254, NMI work by 255, and the footprint trails by at most one age. A new
hardware monitor also caught an existing footprint-budget issue when
stills jump across many ages: the uploader now refreshes its available
vblank time for each replayed age, including after empty ages. All watched
PPU writes and DMA pass the vblank/forced-blank and HDMA checks.

#### Still comparisons (2026-10-20)

References call `planet-view.js` itself with the **recorded shot target**.
Each sampled position runs an actual full-wave shot in day and night
(crisis) states, at ages 2, 60, 140 and 180. Tests move the live Fortress
after firing and before cutaway start, verify nearest selection independently,
and exercise the 4095-to-zero rounding seam. All 34 loaded maps and tile
images are also compared byte for byte with the uncompressed generator
atlas, exercising every dictionary bank and palette/flip attribute.

Below, each cell is **129-view result -> budgeted result**, at age 140.
Agreement allows at most 24/255 error in each RGB channel. Parentheses
measure only the globe disc/rim, so the fixed sky cannot hide its error.

| Target | Day: full screen (globe only) | Night: full screen (globe only) |
| --- | --- | --- |
| 0,0 and 4095,4095 | 99.2 -> 99.1% (98.8 -> 98.4%) | 99.4 -> 99.9% (99.6 -> 99.6%) |
| 1848,3527 (native flight preset) | 95.6 -> 99.1% (86.9 -> 98.4%) | 96.6 -> 99.9% (90.2 -> 99.5%) |
| 400,800 | 91.3 -> 91.3% (72.8 -> 72.8%) | 92.5 -> 93.0% (76.9 -> 76.9%) |
| 1400,2000 | 92.9 -> 92.7% (78.2 -> 77.3%) | 94.5 -> 94.4% (83.4 -> 81.5%) |
| 3100,1200 | 89.3 -> 89.4% (66.3 -> 66.4%) | 91.2 -> 91.6% (72.5 -> 72.5%) |

The original default-target 11-age sequence is 99.0-99.7% (129 views:
99.1-99.7%). Changes there come from fitting palettes across the smaller
atlas. Small stray edge pixels in late stills also existed before this
orientation change.

World callback cost, entry to exit label in scanlines: idle **0.21** mean,
live **4.87** mean / 5.02 max, start/selection **4.34** once. NMI idle
0.20, live 7.03 mean / 22.17 max. `modprof.mjs` on sword/battle measures
the unchanged field callbacks at 0.46 lines and NMI at 0.24/0.23; that
existing field idle cost remains above the 0.3-line guide.

Validation: strict build, all eight ending cases, all 14 available world
cases and all six perf scenes pass. Perf's world probe now watches both
`00:8089` (original) and `80:8089` (port); previously it reported 304 lag
frames on the unmodified integration build because it missed FastROM.
Original/build lag counts: sword 4/4, Sandship 12/4, battle 4/4, Beast
34/34, Fortress 5/4, flight 4/4; p90 finish lines 45/63, 103/113, 34/54,
173/173, 90/95, 123/114. No core or world module code changed.

## Budgets

| Scene | VRAM | CGRAM | OBJ sprites | HDMA channels |
| --- | --- | --- | --- | --- |
| King Kai | BG1 map `$3800`, card `$3C00`, tiles `$0000`; OBJ base `$4000`, cells `$5000` | BG 1-7, OBJ 0-2 | 3 actors (12) + lines | 5 |
| Space (doomed, explode, escape, death) | OBJ `$0000-$1FFF`, BG tiles `$2000`, maps `$5000`/`$5400` | backdrop, BG 1-7, OBJ 0-1, 4-7 | ≤ 122 (104 shard cells + 18 sparks), ≤ 17/34 sprites/slivers per line | 5; 2, 3, 4, 6 for the disc and ring |
| Vista | OBJ `$0000-$0BFF`, BG1 map `$1800`, tiles `$2000`, BG2 map `$5000` | backdrop, BG 1-7, OBJ 0-4 | ≤ 71 | 5 |
| Flight | Mode 7 `$0000-$3FFF`, OBJ table 1 `$6000-$6DFF` | backdrop, 64-127, 128-255 | ≤ 128 | 2, 3 (matrix), 4 (mode), 5 (TM), 6 (gradient) |
| Overlay (village, departure to 144) | `FIELD_OBJ_A` (`$7220`/`$7320`) | OBJ 6-7 (all 256 in the cloud) | 6 front | — |
| Departure from 144 | the space stage, day globe only | as space | 1 | 5 |
| Fortress cutaway (world flight) | BG1 tiles `$3000-$433F`, map `$4C00`; BG2 map `$6000`, tiles `$7000-$7B30`; OBJ tiles 64-93 (`$6400`) | all 256 (per fade level) | ≤ 64 | none (the world's off) |

The departure's load frame (144, the space stage under white) skips the
spark and fragment palettes the distant globe never shows, keeps the
palette round robin during that visible load and queues Goku's miniature
a frame later (about 80 lines, was 190). The palette round robin stops at
line 190, leaving the modules after `ending_frame` their lines. On the
all-streams integration build: departure lag 2, vista 7, flight 8.

Measured frame cost of the module (game logic not included, SlowROM):
vista 40-50 lines (65-80 during its palette fades), flight 30-45 (80-90
during the scatter's burst at 300-340), overlay 11-17 (the cloud ~45).
FastROM (core's default since main `c81158d`) runs the module's code and
data about a third faster.

Lag with FastROM (2026-10-21, the ending tests on the finale's map 180 and
the imported states): vista 1 frame over the whole sequence, flight 2
over 450, King Kai, space, death and departure 0. Older SlowROM builds
had vista 9, flight 10 and departure 3. The flight's stage loads in 25 frames (27-30
with SlowROM). With SlowROM on a busier map (Potos with its NPCs, ~150
lines of game logic) the flight dropped one frame in eight. No vblank
overruns while a picture shows: the tests count any field NMI whose work
ends in the next frame (that frame then has no HDMA, which in the flight
meant no Mode 7 floor; before the core kept it off, stale channels drew
garbage over the whole picture). The full-screen scenes skip the game's
actor cell streaming (`ending_frame` marks the frame in
`!core_actor_hold`; up to 12 lines in its busiest phase), which had run one flight vblank in five past line 261.

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

WRAM block `!RAM_ORBIT+$80..$B5`:

| Address | Field |
| --- | --- |
| +$80 | `!ending_request` (byte): phase requested, `$FF` stop |
| +$81 | `!ending_phase` (byte): 1 transition, 2 summon, 3 dragon, 4 wish, 5 scatter, 6 reunion, 7 village, 8 depart, 9 kai, 10 complete, 11 doomed, 12 explode, 13 escape, 14 fatal |
| +$82 | `!ending_age` (word): frames in the phase |
| +$84 | `!ending_flags` (word): `EF_BAD` 1, `EF_EIGHTH` 2, `EF_SSJ` 4, `EF_GOLD` 8, `EF_ORBIT` $10, `EF_NIGHT` $20, `EF_BEGUN` $8000 |
| +$86 | `!ending_done` (word): bit n set when phase n's timeline finished (event scripts can wait on it) |
| +$88 | `!ending_status` (byte): `ES_ACTIVE` 1, `ES_NATIVEBOY` 2, `ES_MUTED` 4, `ES_AIRBORNE` 8, `ES_CHARGING` $10, `ES_COMPLETE` $20, `ES_DEFEATED` $40, `ES_LOADING` $80 |
| +$89 | `!ending_sfx` (byte): last sound cue: 1 power burst, 2 charged, 3 flight, 4 teleport, 5 teleport in, 6 revert, 7 Frieza orb, 8 Fortress break (each also played with `audio_sfx`) |
| +$8C/$8E | `!ending_target_x/y`: cutaway's rounded saved shot target (0 is valid) |
| +$90 | `!ending_map0`: the map the scene took the screen on |
| +$92 | `!ending_live` |
| +$94 | `!ending_reason`: `endingResult` 0 good, 1 fortress, 2 balls, 3 frieza, 4 beast |
| +$96/$98 | `!ending_depart_x/y`: the take-off point |
| +$9A-$9E | scratch, `!ending_gokuctl` |
| +$9F | `!ending_reload`: a native map load ran under a scene (object-list hook) |
| +$A0 | `!ending_pulse`: the explosion preset's prose pulse |
| +$A2 | `!ending_mute`: frames the native music has been silenced (0 = not) |
| +$A3-$B3 | the cutaway: on, load, age, shown age, night, end, runs, run pointer, DMA bank, fade level, DMA budget |
| +$B4-$B5 | `!ending_cut_globe`: latched orientation (0-31 grid, 32 native flight preset, 33 default) |

## Resources

| Resource | Use |
| --- | --- |
| Code | `$A9:8000-FEB8` (327 bytes free); second area `$AA:C000-D9B6` (9,801 bytes of the quarter free) |
| Fast data | `E9:0000` (32,678 bytes: crack events, fade sets, spark OAM, window lookups, flight tables), `EC:0000` (6,581 bytes: flight scale templates and widths); `ED`/`EE`/`EF` belong to core |
| Extended data | ending: 68 blobs / 648,708 bytes (633.50 KiB), including the 188,387-byte orientation atlas. Whole build: 2,176.2 of 2,944 KiB, 767.8 KiB free |
| WRAM | `!RAM_ORBIT+$80..$B5` |
| SRAM | `!SRAM_WORK_SCENE` (`$32:6000-7FFF`) while a scene runs: state, palette components and outputs, curves, queue, HDMA tables, the flight's matrix tables, row and star buffers; phase-local `$150-$165` for scale/cache state |
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
- Flight: The floor is the
  world inside a 128x128-tile window; beyond it (the last lines before the
  horizon) the window repeats. The turn updates the matrix tables about
  every 8 frames rather than every frame. The stage load adds 25 black
  frames at age 30 (the clock waits, so the native 480-frame wait ends the
  scene up to that much earlier, on the empty sky). Sprites crossing the
  left edge pop in whole; on the scatter's crowded lines the hardware's 34
  slivers per line can drop pieces of sparks.
- Explosion: the browser's 64 Voronoi masks with 45-degree rotations and
  squash sampled per orientation. Hardware sprite limits omit the sparsest
  cells; rotation/squash stop at drift age 77 to preserve the escape's cache
  rewind. The drift stills now score 83.1-92.5% after the flash.
- Departure cloud: a colour can trail the white mix by a few frames (round
  robin).
- Fades are exact per channel, but palette-based: they apply to the
  scene's colours, never to BG3's dialogue (as the browser's `dim`).
- Fortress cutaway: 34 nearest orientations (8x4 grid plus the native flight
  and default views), while the browser rounds every target to eight units.
  Coastlines and details between orientations differ; see the measurements
  above. Day/night share palette indices. Beam, ring, dust and fade are the
  same. The first frame is black (the load),
  and on the first frames, where all 64 dust particles start on the same
  lines, the hardware's 32 sprites per line can drop some.

## Integration and requests

- **frieza**: calls `ending_lose` (A = `EF_GOLD`, X = the encounter
  key) on the death frame, as `battle-retry.js` (its `fz_death_tick`);
  the ending module keeps only the event gate at `C1:E77E`. Its
  `STORY_Q_FRIEZA_CRISIS` answer (from the core's impact until the wish)
  puts the doomed globe and the cutaway's globe on their night side.
  The cutaway test exercises the live crisis query in both states.
- **world**: `world_nmi_scars` returns while `!w_cut_age` runs (the
  cutaway's VRAM); nothing else changed there.
- **core** / **layout**: the ending stays in its existing `$A9` bank and
  `!CODE_QUARTER_AUDIO` (`$AA:C000`). No allocation changes requested.
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

`node snes/test/ending/run.mjs [kai|space|fatal|depart|vista|flight|loads|dialogue|cutaway]`
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
| `space` | `preset__bad-ending` | 16 stills against planet-view, direct escape cache preparation, normal escape without reload, no cache misses or OBJ limit violations; zero lag/overruns |
| `fatal` | `preset__bad-ending` | collapse light, fade, black, globe, rotating explosion, GAME OVER; zero lag/overruns/cache misses, OBJ limits, Start to the title |
| `depart` | `emulator-probe__potos-state` (Potos) | village 99.1%, 15 departure stills 99.1-100%, Randi native, status/sound/done, lag 0, release |
| `vista` | `ending-fix__end-20` (map 180) | 12 stills 95.3-95.8%, done flags, Shenron's rise without lag, lag 1 |
| `flight` | `ending-fix__end-20` (map 180) | 14 stills 94.6-99.0%, load ≤ 30 frames, muted/airborne/sound/done, lag ≤ 2, every integer size ready on time, both buffers used, rise OBJ limits, no overruns |
| `loads` | `emulator-probe__potos-state` | doors through core's event mailbox: 2F under the doomed globe (reloaded, clock on, 99.9%), cue 176 after the flight holds black, door 3FF: the cliff 99.1% of a native load of it, Dyluck present |
| `dialogue` | `emulator-probe__potos-state` | native opening/reveal in 13 scenarios; every BG3 DMA byte matches WRAM, VMAIN/HDMA correct, safe PPU timing, zero vblank overruns |
| `cutaway` | the world tests' waterfall checkpoint | actual shots at six sampled targets in both lights plus the default sequence (59 stills); saved-target selection, 192 KiB budget, all 34 VRAM images byte-exact, forced-blank load <215 lines, hardware-safe PPU/DMA, footprint ends by line 254 and trails at most 1, VTIME 196 after deck landing |

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
