# ORBIT module: collateral cinematics, the space fight and the finale

Spoilers. Part of the [SNES cartridge port](../snes-rom.md) ([plan](plan.md),
[engine notes](engine.md)). Source: `snes/src/modules/orbit/`, generator
`snes/gen/orbit.mjs`, `orbit-fx.mjs`, `orbit-sprites.mjs`, `orbit-text.mjs`,
`orbit-finale.mjs`, `orbit-montage.mjs`, tests
`snes/test/orbit/`. Browser sources:
`engine/frieza-cinematic.js`, `frieza-collateral-view.js`, `cinematic-map.js`,
`cinematic-ruins.js`, `aerial-melee.js`, `orbit-camera.js`, `frieza-orbit.js`,
`frieza-orbit-view.js`, `orbit-duel.js`, `orbit-effects.js`, `orbit-pixels.js`,
`orbit-debris.js`, `orbit-menu.js`, `frieza-finale.js`, `frieza-finale-view.js`,
`planet-view.js` (`cosmicBattle`, `planet`, `sky`), `boss-victory.js`,
`beam-detonation.js`, and the orbit parts of `frieza.js` (`spaceInput`,
`tick`, `enterOrbit`, `returnToFortress`).

## Status

| Part | State |
| --- | --- |
| Mode 7 globe (rotation, zoom 56-104 in the fight, 56-230 in the victory's descent, 104-240 in the second surge's pullback, centre, latitude, rim) and starfield (100 stars, three parallax depths, twinkles) | **Done**, test scene `globe` matches the browser's formulas at seven cameras, two of them the descent's (below) |
| Space fight logic: Goku's steering, ki, charged wave, punch, Instant Transmission and the four-beat exchange; Frieza's patrol, side-steps, warnings, beams, lasers, discs, Death Balls, ricochets; damage both ways; camera | **Done** (`fight.asm`, `math.asm`): identical to the browser's own `frieza.js` tick on every frame of the `fight` test (658 frames, scripted pad) |
| Space fight drawing: Goku, Frieza, ki, Death Balls (16/32), discs, finger glints, hand charges, Exploder bursts, impact sparks, ricochets | **Done** (`draw.asm`, resident and streamed OBJ cells) |
| Beam bands: Goku's wave, Frieza's beam and finger laser (`beam.asm`) | **Done**: the band's pictures per heading class and radius come made from the generator through a vblank queue (the laser's are made at run time); cached OAM runs |
| OBJ line limits (34 slivers a line) | **Partly done**: the stars under a beam's cells are limited per row (below) and the finger laser's cells under a fresh hit are hidden, so most beam frames keep under 34. Left: the first frames of a beam (the depths are still being rebuilt with its limits) and lines where bursts add to a beam (36-41 slivers there): 43 frames in the `fight` test (2-28 lines each, was 45 frames of 40-46 slivers on up to 40 lines), 27 in the `clash` (was 89); reported by both, not yet failed |
| Orbit intro (855 frames: Luka, Frieza, Goku), text panels | **Done** (`text.asm`, `orbit-text.mjs`): the browser's own `radioPixels` windows as BG3 tiles in a Mode 1 band |
| Entry API for the frieza module, debug presets `orbit` and `space` | **Done** (`api.asm`): `orbit_api_enter` (intro or straight into the fight), `!DEBUG_PRESET_HOOK_ORBIT/_SPACE` |
| Hand-off from the frieza module (second surge), scene work area | **Done** (`bind.asm`, `scene.asm`): `!FRIEZA_ORBIT_SURGE` enters the orbit at `collateralStart` (72) with Frieza's HP and clocks; the orbit takes `!SRAM_WORK_SCENE` from Frieza's claim (owner `!SCENE_ORBIT`) and gives it back at the end; test `handoff` |
| Second surge on the deck (ages 1-71): the Death Ball growing above Frieza from 25, Goku's giant beam from 58 | **Done** (`bind.asm` `orbit_surge_deck`, through fx: `FX_DEATHBALL` at the browser's snapped sizes, `FX_BEAM_WAVE`); the frieza module draws Frieza, his aura and lightning and breaks the floor at 24 and 48 |
| Auras (Goku's charge and focus, Frieza's pink warning) | **Done** (`aura.asm`, below): the browser's own flames at every level and phase, on its even frames; in the finale Frieza's while he gathers and charges, Goku's while he charges. Not yet through Frieza's surges in the struggle (the rays hold every beam slot) |
| 60 Hz | **Done**: the fight steps once per field vblank (catching up after a slow game frame); the picture's incremental work runs in the frame's spare time |
| Distant bodies (moon, planets), their shattering and the asteroid field, Luna's remark | Next (the `fight` test aims clear of them) |
| Cosmic montage: the four town shots (72-1802) | **Done** (`montage.asm`, `orbit-montage.mjs`, below): the towns from the game's own map data, people, rabite, warning ring, laser, ruin, bursts, fragments, fires, red tint, captions, cues; test `montage` matches the browser's picture pixel for pixel outside the explosions (97-99% during them) |
| Cosmic montage: the two aerial cuts (aerial melee) | **Done** but the auras of the 30 frames before each explosion (below): the clouds, the gradient, both fighters, the sparks, the explosions, the flashes, the cues; test `montage` matches the browser at 99.8-100% outside the explosions |
| Pullback (1802-2042) | **Done** (`pull.asm`, `orbit-finale.mjs` `pullbackFrames`, below): the globe pulling back on generated tables down to line 223, the sky without a camera, the beam from the strike site, the Death Ball (64 and 48 px, double-buffered cells), the two fighters, the cue; then the orbit's intro as in the browser. Test `montage`: the globe's shape 99.65-100%, the sprites 75-94% of the browser's pixels. The cut holds the picture black for 5 frames (the browser cuts straight in) |
| Debris / asteroid field, Luna's remark | Planned |
| Beam struggle: gather, charge, launch, struggle (taps, surges, pressure), recoil (420 damage), win | **Done** (`finale.asm`): every phase, the pressure and the camera identical to `frieza-finale.js` on every frame of the `clash` test (2,889 frames) |
| Struggle picture: the rays above the globe on BG1/BG2 band layers, below it as OBJ chains; Goku, Frieza, charges, sparks | **Done** (`bands.asm`, `fdraw.asm`) |
| Victory clock: impact, beam fade, the native victory commands (death, bursts, fade, fanfare, acquire chime) in `boss-victory.js` order, the pouch, the return at 1,392 | **Done** (logic, sound, pouch); Frieza's red/white flash, the boss bursts, the whiteout and the particle oval are next |
| Descent (globe zoom 56-230), return to the deck, landing (84 frames), the native victory event | **Done** (`globe.asm` `globe_descent`, `scene.asm` `orbit_return`): the descent's globe from generated tables; the deck reloaded through its door with Goku's landing spot (`returnToFortress`'s search), the landing pose, the landing clock, `frieza_orbit_landed` and the frieza module's C7; test `return`. The browser's pale wash into the deck is a fade through black here, for now (below) |
| Orbital death (revert, fall), hand-off to the ending's explosion | **Done** (`death.asm`): the fight or clash freezes, Frieza watches, Goku falls as `bossRushDeathPose`; the orbit stops two frames before black for the ending; test `death` |

## The sequence (browser timings)

Everything below is driven by frame clocks in the browser; the cartridge
keeps the same clocks.

### Second surge (`frieza.js` `b.surge.kind = 'frieza-cosmic'`, clock `c.age`)

| Age | Event |
| --- | --- |
| 0 | Frieza reaches the 32,000 HP threshold: surge starts, combat cancelled, radio restored, `friezaOrb` cue |
| 24 | Floor breaks under Frieza (radius 34), burst feedback |
| 24-72 | Death Ball grows above him (radius `min(29, (age-24) * 0.65)`, drawn 58 px up); from 57 Goku's giant beam rises from his hands (`(age-57) * 12` px, width 18, taper 20) |
| 48 | Floor breaks at every patrol node (radius 29 + 5i), `fortressBreak` |
| 72 | Cosmic montage (`collateralStart`) |
| 1802 | Pullback (`pullbackStart`), 240 frames |
| 2042 | `enterOrbit(target)`: orbit fight with its 855-frame intro |

### Cosmic montage (`frieza-cinematic.js` `cosmicShots`)

| # | Shot | Frames | Key beats (shot age) |
| --- | --- | --- | --- |
| 1 | POTOS (map 131 at 256,240) | 300 | hit 160, blast at (140,96), people walk from 112 (+6 each), text after 190 |
| 2 | aerial melee 1 | 240 | establishment 0-29, teleport beats 20/14/10, explosion at 180 |
| 3 | PANDORA (map 144 at 328,440) | 300 | hit 160, blast (143,156) |
| 4 | NORTHTOWN (map 115 at 464,288) | 300 | hit 160, blast (83,83) |
| 5 | SOUTH OF POTOS (map 129 at 176,472) | 260 | hit 150, blast (125,136), the rabite hops until the hit |
| 6 | aerial melee 2 | 330 | beats 20/14/8, explosion at 246 with four extra bursts |

Town shot details (`frieza-collateral-view.js`): the camera pans 1 px every
24 frames (12 at most); red tint +5 red during ages 86-109 and 131-154, +2
after 155; a 50-frame growing warning ring before the hit; the laser grows
from the upper left over 12 frames before the hit and fades 13 after; at the
hit the ruined map copy replaces the intact one, 9 Exploder bursts stagger 3
frames apart, 16 roof fragments fly for 55 frames, fire sites burn from 9
frames after; 12 frames of ±2 px shake; the radio-style caption (`radioPixels`)
appears 30 frames after the hit. Cues: `friezaLaser` at hit-12,
`fortressBreak` at the hit. Texts: "VILLAGER:The sky... / Everyone! Away from
the house!", "GUARD:Get inside! / No--not THAT building!", "LUKA:These are
CITIES! / Goku! Take this fight AWAY!", "KING KAI:Even the wildlife! / UP! Get
off the surface!".

Aerial melee (`aerial-melee.js`): two scrolling planes of the world-flight
cloud strips (C6:2000 tiles 17-22, 48-55 / 33-36, 64-70) at 1x and 2x over a
four-band blue gradient; cloud travel speed 2, then 4, then 6 (9 for the
second shot) px per frame; eight fixed exchange positions; teleport sparks
for 3 frames, then both fighters with punch/kick poses; impact cue and a
0.16 flash on phase 5; before the explosion both charge toward each other
with auras; one large burst (plus four for the second shot), flash, then both
fly up 5 px per frame; `fortressBreak` 18 frames after the explosion.

### Pullback (`planet-view.js` `cosmicBattle`, `t = age - 1802`)

Camera `{x: 95e, y: 282 - 128e, r: 240 - 136e}`, `e = smoothstep(min(1,
t/200))`; the beam leaves the strike site (upper-right limb) from 35 to 190;
the Death Ball rides it until 140; from 150 the two tiny fighters fly to
their opening positions (156,155) and (202,57) over 70 frames; `beam` cue at
60.

### Orbit fight (`frieza-orbit.js`, `orbit-duel.js`, `frieza.js`)

Intro: 855 frames (60 quiet, five 150-frame lines, 45 quiet): Luka (two
lines), Frieza (two), Goku. Camera: longitude +2 per frame; every 4 frames
radius steps toward 68 (beam out), 84 (moving) or 104, centre toward
`(95 - (hero.x-128)/5, 154 - (hero.y-112)/8)`. Steering moves the hero 3 px
(6 with A, 1 while charging) per frame in eight directions and turns the
globe (longitude += 4 dx speed, latitude += 2 dy speed, clamped 256-3840).
Frieza's pattern beam, laser, beam, disc, beam, laser, orb; dodges threats;
teleport-punch exchanges (four 18-frame beats, 450/900 damage). Shots,
ricochets, distant bodies and debris as in the browser files.

Clock: the browser runs the fight once per video frame, also while the
game's own logic lags (`beforeFrame` is driven by the emulator). The
cartridge runs one fight step per field vblank since its last frame
(combat's public `!cb_vblanks`), at most four, and one step after a ring or
full-screen menu (the fight was paused there). While the fight runs it takes
the pad and quiets combat through `combat_api_input_lock` and declares the
encounter dangerous (`combat_api_danger`: Frieza's hits unscaled, as the
browser's raw `damagePlayer`), owner bit `$0100`.

On the cartridge (`fight.asm`) each step runs in the browser's order
(`mana-mod.js beforeFrame`): `frieza.js tick` (pause on `$D0` or a menu in
`$EC & $FE`, stop while Goku is down; `b.age`, grace/hurt/recoil/guard,
`orbitDefense`, `tickOrbit` with the camera, Goku's ki and wave and the
ricochets, the exchange, the 6,000 HP clash hand-off, the AI: stun, node
rushes every 105 frames, warnings, `fire`, the shots), then `spaceInput`.
Whole-pixel stepping uses the browser's 8.8 heading vectors and `orbitStep`
rounding from generated tables; distances use the hardware multiplier
(`orbit_near`, `orbit_swept`, `orbit_ray_hit`). Damage to Goku goes through
the game's own queue (`$E1F1`, `$E1F0`, `$E1EC`), exactly like
`damagePlayer`; Frieza's HP stops at 6,000 (`hurt` with the orbital floor).

Drawing (`draw.asm`) mirrors `frieza-orbit-view.js`; OAM is front to back, so
the browser's paint order is reversed: hit bursts (three Exploder bursts four
frames apart, impact spark for three frames), Frieza's warning (the growing
Death Ball, pink charge, finger glint, disc), his shots, Goku's ki, the
wave's origin orb, the hand charge, Frieza (tiny muscular sheet, frame and
facing as `drawFriezaSprite`), Goku (16x16 pose and facing row, impact spark
while Instant Transmission hides him), ricochets; then the stars. Known
simplifications: every Death Ball on screen shows the same animation frame
(`(age >> 3) % 12` of the space clock; the browser animates each by its own
age); Exploder parts at quarter turns 1 and 3 use turns 0 and 2 (the cells
are not stored rotated).

### Finale (`frieza-finale.js`)

At 6,000 HP: gather 150 (camera widens to (114,164,56)), charge 108, launch
72 (contact at 48), struggle at least 660 with surges at 150/330/510 (90
frames each), recoil 90 after a lost struggle (420 damage), then charge again.
Victory clock: impact 12, beam fades 168-210, the Mantis Ant sequence from
`boss-victory.js` (death cue at 0, bursts at 36..257 and 326, fade at 143,
white 306-631, vanish 326, fanfare at 375, reveal 631, clear 791 after the
fatal hit), pouch from 927, acquire chime at 1032, descent 1152-1392, landed
at 1476 (84 landing frames), then the native victory event.

## The globe on hardware

The browser projects the cartridge's world map (`world-texture.js`) through
an exact sphere per pixel, every frame. The cartridge uses **Mode 7**:

- **Texture.** The world at 1/4 scale: 1024 x 1024 texels, each Mode 7
  character being the world tile that dominates its 32 x 32 world-pixel block
  (108 characters, 81 night colours in CGRAM 32-127, no quantisation loss).
  `globe_vram.bin` is the whole 32 KiB Mode 7 VRAM image, uploaded in eight
  4 KiB steps while the picture is held black.
- **Latitude, exactly.** Each line of the disc samples the browser's texture
  row for that line, `round(asin(j/r) * 325.95)` texels from the centre row.
  This uses the PPU's own vertical term: M7B = M7C = 0, M7Y = the centre row,
  M7VOFS = M7Y + 256 - cy - 1 and a per-line M7D = 256 T(j) / (256 + j), so
  the table depends on the radius only, not on the centre line or latitude.
- **Longitude, linearised.** Along a line the browser's `asin(x / chord)`
  becomes linear: M7A per line = 1.25 x 162.97 texels per half chord, centred
  on the stepped target (`round(lon/8)*8`, as the browser). Features move at
  a constant speed across the disc instead of slowing at the limb.
- **Disc and rim, exactly.** Window 1 = the disc's chord on each line
  (`x^2 + j^2 <= r^2`, the browser's `d <= 1`), BG1 masked outside it; window
  2 = the rim's outer chord (`<= floor(1.07 r^2)`); colour math adds
  (6,17,28) to the sky backdrop (0,0,2) in W1 XOR W2, giving the browser's
  inner rim blue (6,17,30).
- **Per-line data.** For the fight's radii (56-104) M7A and M7D come from
  ROM tables in bank F7 (`fight_lines.bin`, 41 KiB) through **indirect HDMA**;
  the window block (4 bytes per row, rows -R..R) is rebuilt in SRAM only when
  the radius or centre column changes (about 85 scanlines of CPU, at most
  every 4 frames in the browser's camera) and double buffered. A new centre
  line or latitude only rewrites three 16-byte indirect HDMA tables and two
  registers; longitude is M7X/M7HOFS.
- **Screen split.** HDMA on BGMODE: Mode 7 for lines 0-195 (a band of Mode 1
  at the top while a text panel shows), Mode 1 from line 196 for the native
  HUD (BG3 + OBJ). The globe is therefore cut at line 196, as the native Mode
  7 boss arenas cut their floor; the browser draws it behind the HUD. Each
  indirect HDMA set has its own BGMODE table, written with the set while the
  HDMA reads the other: a table rewritten under the HDMA kept the HUD lines
  in Mode 7 for a frame when a panel opened (the HUD's bar gone, its
  portrait alone).

Differences from the browser, by design: the longitude is linear across each
line (above); the globe is flat-lit at the browser's L3 level (75%) instead of
four light bands (a Mode 7 layer can only be split by two windows per line,
and both are taken by the disc and rim edges); the inner/outer rim tones are
one tone; the texture shows the dominant tile of each 32 x 32 block (coasts
at about 3 px precision at radius 104). Measured against the browser's own
formulas (`snes/test/orbit/reference.mjs`) at five cameras: disc and rim
pixels match exactly (edge mismatch 0-0.01%), mean colour difference 1.0-2.7%.

Starfield: the seeded list of `planet-view.js` (100 stars, four shades,
depth 1-3 for parallax, three bright stars twinkling as a cross for 9 of
every 240 frames), projected as `projectOrbitBackground` does, as 16x16 OBJ
at priority 0. A star under the rim chord of its line (read from the
published window block, so exactly the pixels the browser's planet paints
over it) gets no OAM slot. Per depth the visible stars are kept as a ready
OAM list, rebuilt when that depth's offsets, zoom, the globe or a twinkle
change (one depth at a time, 24 stars per frame), and copied into OAM with
MVN each frame. The stale depths are taken in turn (while the camera
moves, the globe's rows make every depth stale each frame; depth 1 alone
used to be rebuilt and depths 2-3 lagged), but in the second surge's
pullback depth 1 still goes first: there the stars the shrinking globe
uncovers in depths 2-3 stay hidden, as their OAM copy and the game's OAM
pass would make a pullback frame miss its vblank (the `montage` test).

Line limits: the PPU fetches at most 34 slivers (8 pixels of a sprite's
width) a line and leaves out those of the sprites first in OAM: the
bursts, the beams' cells. A star takes 2 slivers on each of its 16
lines, and a beam across the screen 20-28. While beams show, the rows
(8 lines) under their cells limit the stars of depths 1-2 that may cover
them (`stars_limits`): per group the rows its cells cover from the origin
to the screen's edge, and its slivers on each of those lines by heading
class (class 0 the cells of a chain, class 1 two cells of every chain,
classes 2-4 one of every chain), only made again when a group's inputs
change; a row's limit is (34 - 2 - the beams' slivers) / 2, for both
depths together. A depth's build leaves out a star past a limit, and a
change of the limits rebuilds the depths ahead of the globe's window
block (none in the pullback, where the rebuilds would cost its frames
their vblank). Frieza's finger laser crosses the screen in 7 cells: with its
hit's bursts, Frieza and Goku its lines pass 34 without any star, so the
laser's cells whose middle lies within 16 pixels of the freshest hit
(younger than 24 frames) are hidden, the bursts covering the laser there
(the laser stops a few pixels short of them).

Window blocks: when the camera's radius or centre column changes, the next
block is built in the back buffer and published with the radius's ROM
M7A/M7D blocks; M7HOFS follows the published column, so the texture and the
disc edges always agree (the picture may trail the camera by a few frames).
The first block of a scene is built at once.

Spare time: each frame first runs the fight, the globe's registers and
tables and the OAM; then `orbit_background` builds window rows and rebuilds
star lists until scanline 196 (`!ORBIT_DEADLINE`), checking the scanline per
row and per star, so the modules after the orbit (goku, destroy, fx, audio)
keep their lines and the frame never runs long on our account.

### Beam bands

`orbit-effects.js` `beam` paints, for every pixel within the axis-aligned
box of the ray, the band index of its across distance `v = (-ox vy + oy vx)
>> 8`: outer quarters in the beam-body's row-6 colour, the inner half in its
row-7 colour (`floor((v + R) * 4 / (2R + 1))`), uniform along the axis; the
finger laser is one pixel each side of a white core. The cartridge draws a
beam as parallel chains of 32x32 OBJ cells along the axis: cells of one
chain share a picture (the band is the same at every step along it), chains
-j and j are the same picture turned half round (H+V flip), quadrants come
from flips. Five heading classes (`orbitVectors` 0-4: periods (32,0),
(32,16), (32,32), (16,32), (0,32), chains stacked by 32 px across) cover the
16 headings. Pictures are made at run time (`beam_rows`): each row's in-band
pixels are an interval from an exact floor DDA per threshold (classes 1-3),
whole rows (class 0) or one row repeated (class 4), turned into 2-bitplane
tile rows through 32-pixel masks; a picture is generated in the frame's
spare time (16 rows a step), sent by the NMI into one of six 32x32 slots
(OBJ `$040/$044/$048` Goku's wave, `$04C/$080/$084` Frieza's beam or laser)
and kept with its key (class, radius, chain, laser). Every class's
pictures but the laser's come made from extended data instead (class 1
radii 2-48; classes 0, 2 and 4 2-32: Goku's wave reaches 8 + 24; class 3
2-12: Frieza's beams), through a vblank queue (up to four a frame, by
room): the wave widens by two pixels a frame as it starts, faster than the
run-time builder, which showed a thin line for some ten frames. While a
beam grows or fades, the chains show the nearest pictures already made. The cells'
positions do not depend on the radius, so each group keeps its full-length
run of OAM entries (cell index by cell index) and a frame copies the prefix
for the beam's length (Frieza's beam grows 30 px a frame); the run is
rebuilt only when origin, heading, chain count, palette or the slots holding
pictures change. Colours: OBJ palette 4 entries 2-3 (blue: Goku), palette 5
entries 1-3 (pink: Frieza's beam, or the laser's two sides and white core),
rewritten every vblank with the band's colour frame (`(age >> 2) & 1`).
Differences: no flare over the first 24 px (the origin's charge orb covers
the start); heading classes 1 and 3 drift by at most half a pixel across a
full-screen band (their periods are not exactly parallel to the 8.8
vectors).

### Auras

`ki-aura.js` `drawKiAura` (height 16) draws a fighter's ki as a flame
behind him on the even frames of the battle's clock: Goku's gold while he
charges the wave (power `min(1, charge / 45)`) or focuses (`.25 + .45
powerCharge / 96`), Frieza's pink (power 1, seed 5) while he warns of a
beam; in the finale Frieza's while he gathers and charges (and through
his surges in the browser), Goku's while he charges. `orbit-fx.mjs` draws
each picture with the browser's own function, gold at levels 1-8 and pink
at 8, phases 0-11 (`(floor(age / 3) + seed) mod 12`), into a 32x32 cell
whose (12, 22) is the fighter's place, with tables of the browser's level
for each charge and focus power. A picture goes into the third slot of
the beam group the fighter is not firing (Goku's `$048`, Frieza's `$084`),
free while that group has fewer than three chains, through the beam
pictures' vblank queue, keyed `$8000 | index`; a beam that needs the slot
takes it back first. The wants are made afresh each frame, cleared before
the drawing and set only by the fight's and the finale's (a want left
from the fight once fought the pullback's beams for the slot, and the
vblanks it cost cut the globe's tables short). OAM puts each behind its
fighter, as the browser's paint order. The struggle's rays hold all six
slots, so Frieza's surge aura waits for another place.

### Text panels

`orbit-text.mjs` renders every orbit message with the browser's own
`native-radio.js radioPixels` (the retail window tiles at `$12D080` and the
8x12 font at `$12D600`) at its screen position (8, 8), cuts it into 8x8 BG3
tiles and deduplicates them across all fifteen messages (88 tiles, loaded at
BG3 tiles `$180-$1FF` with the scene): window tiles use BG3 palette 1,
interior tiles palette 2 (CGRAM 4-11, rewritten each vblank while a panel shows). A message's
30 x 8 map goes into BG3 map rows 1-8 in vblank when it changes; while a
panel shows, lines 0-71 switch to Mode 1 with BG3 priority (the BGMODE HDMA
table), so the window covers everything as the browser's overlay does, and
the globe's window rows start below the band. The band waits for a
message's rows to be in BG3 (one frame after the browser's first): its
palette goes out with them and the vblank that sends them picks the
panel's BG3 scroll, so the first frame is neither black nor a line off. Name codes show the retail
default names. Messages: the intro's five lines (frieza-cinematic.js
`orbitIntroText`: 60 quiet frames, 150 per line, 45 quiet), Luna's remark,
the finale's prompts and Frieza's three surges.

### The finale on hardware

Logic (`finale.asm`) transcribes `beginClash`, `tickClash`, `tapClash`,
`clashCamera`, `win()` and the 'won' tick clock for clock. The browser's
pressure and shown values are doubles; here they are Q31 in two words, every
constant the browser's literal rounded once and the per-frame decay
tabulated per age (`orbit-finale.mjs`); the eases are 32-bit fractions, so
`Math.round(a + (b - a) t)` comes out as the browser's. The struggle's ray
lengths from the meeting point come from a table of `Math.round(Math.hypot)`
over every reachable offset (checked in the generator). Taps are fresh B/Y
presses. The 'won' clock holds, as the browser's does, while Goku cannot act
or the core's sound queue is not empty.

**Rays above the globe: band layers.** The struggle's rays are a quarter of
the screen wide: as 32x32 OBJ chains they need up to 54 slivers a line, far
past the PPU's 34. Above the globe (lines 0 to its rim's top row, at most
106) the picture is Mode 1: Frieza's band on BG1 (in front, as the view
paints it after Goku's), Goku's on BG2. A layer's 45 tiles (`band.bin`)
carry the band's cross-section along `d = x + 2y` (clear, outer quarter,
inner half, outer quarter, clear: thresholds fitted per radius to
`orbit-effects.js`'s own pixels; the true edges have slope -114/229, within
half a pixel of -1/2 across the screen); per band and radius (2-48, even)
the generator stores the 14-row map (896 bytes) in extended data, one DMA
when the radius changes. A window per layer (W1 for BG1, W2 for BG2) cuts
only the band's two ends: the origin's cut and the far end's, a ramp per
reach precomputed in extended data and copied with an unrolled loop. Two
window tables alternate; each set of indirect HDMA tables points at the
table it was built with, and the vblank takes the band lines of the set it
shows, so the frame never rewrites what the HDMA reads. HDMA channel 0
(`$2131`: colour math off over the band lines; the rim's W1 XOR W2 window
needs it) and channel 1 (`$210D/$210E`: BG1's scroll 0/-1 over the band
lines, then the globe's M7HOFS/M7VOFS, which share the registers) run for
the whole scene, so the field's late `$420C` write never switches them on
mid-frame. Below the band lines the rays keep their OBJ chains (`bw_ymin`:
cells wholly inside the layers' lines are skipped and the run is built for
the ray's own length). Stars well inside a ray, and in the strip where the
beam's cells straddle the layers' last line, get no sprite.

**Beam pictures.** Class 1 (headings 1, 7, 9, 15: the clash's rays) for
radii 2-48 (even) and chains 0-2 come from the generator (two extended data
blobs, 36 KiB): each frame, after the drawing, the chains whose slot lacks
this frame's picture are queued (chain 0 of both groups first) and the
vblank sends what it has room for. An outer chain whose picture is more
than 4 pixels wider than its band waits for its own (whole cells would show
outside the band); chain 0 shows a wider core meanwhile. A rebuild of a
group's cached OAM run that only adds chains waits for a frame with time
(`beam_defer`: a cell costs about 1.2 lines, a whole five-chain run some 75;
after 8 frames it may end by line 200).

**Victory.** The native commands go through `core_sound_queue` in
`boss-victory.js` order: `F2`/`F0` stop (and `frieza_orbit_won`: stage won,
attacks dropped), `02 94 0F 80` death, `02 15 0F 00` bursts, `80 80` fade,
`01 18 44 8F` fanfare (C3:0198 skips a song already selected, so a cached
fanfare is restarted through `$1E05 = $FF`), `02 D8 00 88` acquire chime.
The fanfare's song upload holds the game loop for about 29 frames (inside
the whiteout; the 'won' clock waits with it). The pouch flies from Frieza's
point back to Goku from 927 to 1032; Goku's descent poses from 1152; the
return at 1392.

### The cosmic montage on hardware

The frieza module's hand-off at `collateralStart` (72) enters with
`!OE_SURGE`: `montage_start` blanks the picture through the field's
brightness shadow (`$E6` bit 7, kept and given back) and the scene's load
skips the globe's image (step 8 on: stars, effect cells, text tiles; the
orbit needs them later). The cinematic's clock (`!orbit_mage`, `b.surge.age`
from 72) steps once per field vblank, catching up as the fight's does; the
shot holding the age comes from `cosmicShots` (`orbit_mt_shots`). A cut
blanks the picture and the vblank loads the next shot in three force-blank
steps (its tiles; both BG maps, twice; BG3, the OBJ cells and the people's
first poses), then shows it. At `cosmicDuration` (2042) the orbit's intro
and fight start with Frieza's clock moved on by the cinematic (`b.age`
+1970), as `frieza.js enterOrbit` does; the code and its tables live in the
second code area (`$A1:C000`), the data in extended data (110 KiB). While
the cinematic shows (and while the scene loads) the orbit's field frame
stamps `!core_actor_hold` with the frame, so that frame's vblank skips the
game's actor cell streaming (`core_actor_cells`, up to 12 lines): no
native actor is drawn.

**Town shots** (`frieza-collateral-view.js`): `orbit-montage.mjs` reads the
town's map as `cinematic-map.js` does (pieces, metatiles, the tileset and
palettes) and makes BG1 from layer 0 and BG2 from layer 1, entry for entry
(palette-0 tiles left out, as the browser draws nothing for them), over the
view the browser shows: map x `s.x - 8 .. s.x + 271`, rows `s.y .. s.y + 223`
(map columns 0-33 and 63 of a 64x32 map; 93-337 tiles, identical ones
shared with flips). It renders the two layers back in the PPU's priority
order and checks them against `cinematicMap` pixel for pixel. Mode 1, BG3
in front; the pan and the shake are BG1/BG2's horizontal scroll (`pan -
shake`), every layer one line up so the sprites' y lines up. The ruin
(`cinematic-ruins.js`) is an overlay of the 8x8 blocks it changes, each a
BG1 tile in the town palette holding its colours or split over BG1 and BG2
when it mixes two (exact in all four towns); it goes into a second copy of
both maps (`$5000`, `$3800`) during the vblanks before the hit, 8 blocks at
a time, and the hit switches BG1SC/BG2SC to it. The red tint (+5 red over
86-109 and 131-154, +2 from 156, the browser's formula) is a generated
colour set per town, sent at the game's own palette transfer through core's
`modules_cgram_upload` (`orbit_cgram_upload`).

The laser is BG3: one solid tile in the laser's purple shown inside window
1, `[a - 9, b + 9]` per line, and its core lit by colour math (+ (6, 25, 4)
on BG3) inside window 2, `[a - 3, a + 3]`, where `[a, b]` is the centre
line's run on the line (the browser's 19 shifted lines, resolved per row).
The rows come from extended data through HDMA channel 6 (indirect, mode 4):
the frame writes a small table of up to five entries into the table the
vblank does not show; the rows of one moment are shared with another's
where they are the same (7.6 KiB for the four towns). The caption
(`radioPixels`, `orbit-text.mjs` messages TOWN1-4) is BG3's other map from
dt 31; HDMA channel 2 writes TM again at line 196, after the field IRQ's
HUD split.

Sprites, 8x8 and 16x16 from the first OAM slot (the cinematic has no HUD),
front to back: the fires and their embers, the roof fragments, the Exploder
bursts, the warning ring, the rabite, the people. Each is a generated list
with its bounding box: a list wholly on the screen with room in the OAM
goes in with low bytes only, the rest sprite by sprite (off-screen sprites
skipped, x bit 8 left of the screen), and the size bits of a run of 16x16
sprites are set once for the run. The bursts use the orbit's resident cells
(quarter turns 1 and 3 drawn as 0 and 2, as the fight's); the embers have
generated cells per turn (2 and 3 their flips, checked). The people's 24
poses (the browser's `npcs.png` crops, 15 tiles each) stream into two
16-tile slots per person: a pose shows from the slot holding it, the other
slot gets the pose wanted now or the one person i will want i + 1 frames
on (one upload a vblank), and a late upload keeps the last pose a frame.
Cues: `friezaLaser` 12 frames before the hit, `fortressBreak` at it.

Timing (Mesen, the `montage` test): the frame hook ends by line ~217 and no
picture repeats through the whole cinematic (the pullback's cut catches up
two steps); the montage's vblank uploads end by line 252 (`orbit_nmi_room`
with six lines' slack: the field's HDMA enable must still come before line
262). The game's own vblank keeps writing
during the montage at VRAM `$5B4D` (a HUD row) and OBJ `$144-$15F`,
`$1C0-$1FF`; the montage keeps out of them.

**Aerial cuts** (`aerial-melee.js`): Mode 1 with BG3's priority bit, the
gradient's seven bands on BG3 (the laser's solid tile in seven palettes,
below everything). The two cloud layers of world-flight strip tiles
(`nativeCloud`) are BG1 (2x) and BG2 (1x) on one shared map: the 2x strip
in rows 0-3, the 1x strip in rows 4-5, the rest empty. A layer's six copies
never share a line, so per line HDMA channels 3 and 4 (mode 3: HOFS and VOFS)
give each line its copy's place: the frame builds both tables (the browser's
`left = ((i 97 - scroll) mod 416) - 160`, `top = ((i 47 + rise) mod 256) -
32`; the tops rise with i, so their order is a rotation) into the set the
vblank does not show. The one exception is the 2x layer's copies 5 and 0,
which share 11 lines (copy 0's top 21 below copy 5's). Their composite sits
in map rows 6-7 or 8-9: copy 5 is 69 pixels right of copy 0, or, for scrolls
1-69 mod 416, copy 0 is 347 right of copy 5, with only the 69 columns of it
the screen can show. When copy 0 is right of 203 it shows alone, since copy
5 is then off the screen. Every cloud pixel matches the browser's.

Each frame of a cut has a generated 20-byte record: its flags, flash level,
the fighters' cells and places, two sparks, the cues and the clouds'
travel. Frieza (48x48: a 32x32 and five 16x16, OBJ palette 6) and Goku
(32x32, palette 1) each have two cell slots, filled the way the people's
are. A cell shows from the slot holding it and a late upload keeps the last
pose a frame; the other slot gets the cell wanted now or the next one
within four frames. Frieza's 1,152 bytes go up in two vblanks, so a slot
holds no cell while it fills. The sparks are the orbit's resident
`impact-spark` and `gold-spark` cells. The explosions are `fx.burst`
(large): nine sub-bursts four frames apart at the browser's places, plus
the second cut's four more. They are drawn front first while the frame has
time (to line 200), since the PPU drops a line's back sprites past 34 tiles
anyway. The pale flashes (`planet-view.js` `flash`: 0.16 on a hit, 0.8 to
0.2 over the explosion's first four frames) are generated palette sets,
one per level, in the game's palette transfer.

Differences from the browser:
- The bursts' quarter turns.
- In a town shot, the 2-pixel edge the shake uncovers shows the map's next
  column, where the browser shows the sky behind it.
- Goku's colours in the aerial cuts: the goku module's 15 Super Saiyan
  colours of the sheet's 22.
- The auras of the 30 frames before each explosion are not drawn yet.

### The pullback on hardware

`planet-view.js` `cosmicBattle` from `pullbackStart` (1802) to 2042, `t`
the shot's age. `orbit-finale.mjs` `pullbackFrames` evaluates it per frame
(the camera; the beam as `fx.beam` quantises it; the Death Ball's picture
and place; the two fighters' cells' places; the `beam` cue `frieza.js`
plays at 60) into a 32-byte record per frame in extended data
(`orbit_pull`), which `pull.asm` draws.

- **Globe.** The camera eases from (0, 282, 240) to the fight's (95, 154,
  104), a new centre and radius almost every frame, so it is drawn as the
  descent's: its radii (104-240) share the descent's generated line tables
  (each radius keeps the rows either camera shows), and its window rows
  per frame the descent's blobs (168 distinct frames of 240; index
  `orbit_pwin`, the blobs' addresses in `orbit_fn_wblobs`), published by
  `globe_descent` with `g_pull`. The cinematic has no HUD, so the globe
  runs to line 223: the field IRQ's HUD split sets BGMODE 1 and TM BG3 +
  OBJ at the end of line 195, then HDMA channel 2's BGMODE table writes
  Mode 7 again for line 196 and channel 5 (BG3's scroll otherwise) TM =
  BG1 + OBJ at lines 0, 127 and 196; `globe_itables` ends the globe's
  lines at `g_mend` (224 instead of 196). The browser's `planet()` paints
  only within `r + 3` of the centre, which clips the rim's outer edge from
  radius 117 on; `lineTables` does the same (the descent's rim too; the
  fight's radii are unaffected).
- **Sky.** `sky(age)` with no camera: every star at its own place (the
  offsets and zoom 0), twinkling on the surge's clock (`pullbackStart + t`).
- **Beam** (35-190, from the strike site, heading 14): Goku's wave's group
  in `beam.asm` with the record's origin, band radius (up to 26) and reach,
  in the nearest whole number of cells; the origin's charge orb in front.
  Class 2's pictures (radii 2-28) now come made from extended data through
  the vblank's queue, as class 1's: the radius changes every frame or two
  while the beam swells and fades.
- **Death Ball** (until 140): 64 and 48 px (the battle art at 4x and 3x)
  are 2 KiB a picture, more than a vblank sends, so they are two buffers
  of four 32x32 cells: the sprites show one while the vblanks fill the
  other a cell at a time (two a vblank) with the next picture the records
  hold (the frame changes every 8 frames, the size at 72), then they swap.
  Only the 11 pictures that reach the screen are stored (22 KiB). While
  the ball shows the buffers borrow cells others own: Frieza's and the 32
  px Death Ball's (`$000`, `$004`), the beam's slots 3-5 (`$04C`, `$080`,
  `$084`), the gold sparks (`$008`, `$00C`) and Frieza's pink charges and
  discs (`$180`), all unused until the fight; afterwards the vblanks
  restore OBJ tile rows `$000-$03F` and `$180-$1BF` from the scene's
  images, a row at a time. At 32 px (130-139, off the screen) it would be
  the fight's cell.
- **Fighters** (from 150): Goku's idle cell facing up at 2:1 (the fight's)
  and Frieza's tiny frame 4 turned, flying to their opening places.

**The cut.** The scene's load sends the Mode 7 image in 512-byte chunks
and skips those already in VRAM (`!orbit_m7have`). The second aerial
cut, the last shot before the pullback, sends ahead in its spare vblank
room the 40 chunks of 64 it leaves alone (`orbit_mt_m7pre`: past its
cloud tiles, beside its two maps; `mt_preload`), so the pullback's cut
loads only the other 24 (three vblanks at eight a vblank), then the star
cells and the beam orb's cells (`$100-$13F`), and the picture is black
for 5 frames. The scene's other images follow in the pullback's vblanks
by room (`pull_defer`, from WRAM, so they finish after it if they must):
the text panel's and band layers' tiles and OBJ `$0C0-$0FF` at once; OBJ
`$080-$0BF`, `$180-$1BF` and `$000-$03F` once the Death Ball is gone,
since its buffers use some of their cells. At 2042 `pull_end` hands the globe
to the fight's builder (its first block builds in spare time while the
pullback's last tables show the same camera), gives the HUD its split
back and restarts the sky clock for the intro. The scene's first vblank
also puts BG3's map and tiles back as the field sets them (C1:FD65: `$58`
or `$5C`, `$04`), since the montage's shots moved them.

Measured (the `montage` test: 13 screenshots against `planet-view.js`'s own
picture, read back through the `getColor` it puts on the PPU): the globe's
disc, rim and sky 99.65-100% of the pixels no sprite covers (100% once it
stands still); the sprites' pixels 89-94% while the ball and the beam
grow, 75-85% while the beam fades, 91% for the two fighters alone.

Differences:
- The beam's band ends in whole cells (within half a cell of its reach),
  without the browser's taper over its first 24 px; its pixels lie a step
  across (a heading with one mirror, as in the fight); while its radius
  changes, a chain may keep the last one for a frame or two.
- At a change of the Death Ball's picture the last one can show a frame
  longer (the next one is filled ahead).
- 5 black frames at the cut (the browser cuts straight to the globe).
- The globe is flat-lit, Goku has his 15 colours (as in the fight).

### Descent and return

**The descent's globe** (`clashCamera`'s 'win' branch, 1152-1392): the
globe grows from the clash's wide view (114, 164, 56) to (-15, 281, 230),
past the fight's line tables, with a new centre and radius every frame,
far too often for the window builder (about a line per row). The camera
depends on the clock alone, so `orbit-finale.mjs` makes all of it, in
extended data: per radius 56-240, the M7A and M7D rows the descent or the
pullback can show (`lineTables`, the fight's rule; 117 KiB in four blobs,
a radius never split), and per frame (201 distinct of 241) the window rows
of lines `max(0, cy - R)` to `min(223, cy + R)` (the disc and rim edges,
clamped to the screen; the centre column goes negative near the end; in
eight blobs shared with the pullback's frames, 237 KiB, each with an empty
record for the lines above the globe). Two index
tables in the data bank give per radius R, the first stored row, the
blocks and their bank, and per frame the rows, their bank and first line
and the blob's empty record. `globe_descent` publishes them as they are,
with virtual bases for row -R (so `globe_itables` and the stars' culling
count rows as for the fight's blocks); the indirect HDMA sets carry their
banks to the vblank (`$4337/$4347/$4367` per set; the fight's are F7 and
the scene block), and the stars read the culling rows from their bank. A
frame whose set the vblank has not taken keeps the last one with its
registers. Measured against the browser's `planet()` at ages 1250 and 1392
(`globe` test): edges exact (the rim clipped at `r + 3` as the browser's),
mean colour 1.9% and 2.1%.

**The return** (`returnToFortress` at 1392, or the victory event while the
fight is still in space): the orbit's picture replaced the deck's VRAM, so
the field reloads map 246 through its own door (`$82F`) as the debug
module's teleport does: once the event pump has started the door, its
entry tile (`$DE`, `$DF`) is moved to Goku's landing spot and the fade-out
quickened to a step a frame (`$E4/$E5`); the descent's last frame fades out
under it, the scene stops at the last step (the vblank gives the picture
and the scene work area back; the pad and combat go back), the field loads
the deck (no frame of ours runs during the load), and on the first frame
after it Goku stands on the exact spot and the world module's landing pose
plays as the deck fades in. The landing spot is `returnToFortress`'s: the
nearest point to Goku, in 8-pixel steps within 128 each way (the browser's
order, its stable sort included: a generated list in extended data), where
he can land (flight's `canLand` at the fight's recorded terrain), searched
during the descent in the frame's spare time (one candidate a frame at
least; usually the first, where he stands). The landing clock (`frieza.js`
`b.age` after the return: frames the field can act, no victory command
queued and no transition under way) runs to `victoryTiming.landed` (84),
then `frieza_orbit_landed`: the frieza module requests the victory event
C7 once Goku can act. Measured in the `return` test: the scene stops 18
frames after the return, the deck shows from 32, the landing pose plays for
32 frames, landed at +132, C7 at +133.

Differences: the browser has no reload. It washes the descent's last 24
frames toward a pale white ((28, 30, 31), `flash(ease(...))` from 1368)
and shows the deck at once under the same tint, fading over 24 frames
(`planet-view.js` `returnScene`); here the descent fades to black over 15
frames (not yet washed), the deck loads in about 14 and fades in from black
over 16, so the landing clock (which counts only frames the field can act,
as the browser's) reaches `landed` about 47 frames later than the
browser's. The pale wash and tint are next, with the victory's whiteout
(both need every colour, Goku's OBJ palette included, so the palettes
rather than colour math). Without a landable spot
the browser keeps Goku hovering (`localFlight`); here he lands where he is
(a flight API to start hovering is missing).

### Orbital death

When Goku's HP reaches 0 while the fight or the clash runs, the frieza
module starts the ending's fatal sequence (`ending_lose`) and the orbit
plays `shenron-ending.js`'s fatal view with the orbit (`frieza-orbit-view.js`
`draw(o, fallen)`, `boss-rush-death.js` `bossRushDeathPose`) until black:
the camera, the globe, the sky clock and Frieza (frame 4, facing Goku)
freeze; Goku keeps his place until 54 (gold until the revert at 18 if he
died a Super Saiyan), then drops toward a point between the camera and him
(`x + (hero.x - x) .28`, `min(192, y + r / 4)`), along `u^2`, shrinking 16
-> 12 -> 8 -> 4 px, and is gone at 264. The fall's positions come from a
generated table of 0.16 fractions of `u^2` per age; `orbit-finale.mjs`
counts them against the browser's own pose (14 of 26,880 sampled pixels
one off: the browser's doubles land some exact halves a hair low). OBJ
palette 1 switches to the base form's colours after the revert
(`orbit_obj_pals_01b`). The ending fades the picture from 300; at 358 the
orbit stops (the pad and combat go back), and the vblank that restores the
field releases the scene work area for the ending's stage at 360.

### Vblank budget

The field NMI turns HDMA off (`STZ $420C` at 00:C0BF), sends the palette,
OAM and, on frames of a hit, the damage digits' tiles, then runs the
modules; core then writes `$420C` from `$2C`. Past line 261 that write
misses the frame's HDMA start and the whole picture is lost for a frame
(the globe, the bands and the text panel vanish). The game's own work ends
at line ~236, at ~251 on the frames that send digits. The orbit's vblank
therefore:

- writes the registers only the scene writes (M7SEL, M7B/C, the windows'
  logic, colour math, the sub screen) on its first vblank and on any that
  starts before line 244; a later one keeps them;
- every vblank: M7X/M7Y and the scroll; the HDMA channels (the game's own
  DMAs reuse channels 4-7); the band layers' registers and scroll tables;
- the colours in the game's own palette transfer (`orbit_cgram_live`, a
  `modules_cgram_upload` handler): the game's 512 bytes, then the
  backdrop, the globe's 81 colours, OBJ palettes 0-1 and 6-7 (laid out in
  CGRAM order in ROM by `orbit-sprites.mjs`) and 4-5 (an image the frame
  fills with this frame's band colours), one DMA each, the text panel's
  while one shows or is due, the band layers' while the set the vblank
  takes has band lines. That transfer also runs on vblanks that skip the
  modules (a lag frame while Goku is hit, an open ring menu): it used to
  send the game's palette alone there, and the globe and the beams took
  the field's colours on alternate frames;
- uploads by cost (`orbit_nmi_room`: only if it ends by line 257): in the
  pullback first the Death Ball's cells (6 lines each, two a vblank) or
  the rows it borrowed (5), then Frieza's cell (5 lines), Goku's (2),
  Death Balls (5/2), a generated beam picture (5), then the band map (6)
  and the queued made pictures (5 each), which take turns when both wait,
  then a text panel (6).

Measured (Mesen, the `clash` pads, 2,900 frames): core's HDMA enable by line
260 on the frames with digits, 258 otherwise.

### Scene work area

`!SRAM_WORK_SCENE` (`$32:6000-7FFF`) is the orbit's through core's claim
(owner `!SCENE_ORBIT`, 2). `orbit_api_enter` only records the entry and
takes the picture; the scene starts in the orbit's own field frame (after
frieza's) once the claim succeeds, and the vblank that switches the scene
off releases it. Frieza's fight holds the area (`!SCENE_FRIEZA`) up to the
second surge: the orbit gives his claim back for him and takes it, and his
module then runs only its WRAM work, as under any other set piece,
re-claiming (fresh) after the orbit. The orbit keeps out of `$32:7800-7FFF`,
Frieza's fight block (which `frieza_orbit_won` still clears) and the deck's
hole bitmap (asserted in `module.asm`; the `handoff` test checks the 2 KiB
are untouched).

| Range | Use |
| --- | --- |
| `$6000-$60FF` | camera, globe and star state, the shown HDMA set and its band lines |
| `$6100-$67E3` | two globe window blocks (868 bytes each); in the cosmic montage a shot's state and HDMA tables, in its pullback the Death Ball buffers' state |
| `$6800-$686F` | two indirect HDMA table sets (M7A, M7D, windows), the first set's BGMODE table |
| `$6870-$6A7F` | star lists, the stars' row limits and counts, the depths' turn |
| `$6A80-$6CFF` | fight state and arrays, the second set's BGMODE table (`$6CC6`), the beams the star limits were made for, the auras wanted |
| `$6D00-$6DFF` | drawing scratch, streamed-cell bookkeeping, beam groups and run builds |
| `$6E00-$6FFF` | scratch, band window table A, band state |
| `$7000-$71FF` | generated beam picture buffer |
| `$7200-$74FF` | cached beam OAM runs |
| `$7500-$757F` | finale state |
| `$75A0-$77FF` | band window table B, scroll and colour-math HDMA tables, picture queue, rebuild waits, OBJ palettes 4-5, vblank flags, the descent's and the pullback's globe state (the published rows' banks, each indirect set's banks, its frame, the stars' culling bank, the pullback's flag and last Mode 7 line), the pullback's Death Ball wanted and shown |
| `$7800-$7FFF` | (the frieza module's fight block and the deck's hole bitmap: untouched) |

## Resources

| Resource | Use |
| --- | --- |
| Code `$A7:8000-F128` | `!CODE_ORBIT`: 28.3 KiB of 31 KiB (the pullback in `pull.asm`); bindings at `$A7:FC00-FCD7` |
| Code `$A1:C000-F1E5` | the second code area (`!CODE_QUARTER_GOKU`, noted in `core/layout.asm`): the cosmic montage and its tables, sprite lists, the pullback's preload (12.5 KiB of 16) |
| Data `$E7:0000-7A77` | stars, asin rows, chord scales, rim tables, palettes, star tiles, heading/step tables, burst parts (mirrored ahead, four ways) and offsets, the auras' levels, text maps, finale and fall tables, the descent's indexes, the window blobs' addresses (30.6 KiB of 32 KiB) |
| ROM `$F6:0000-7FFF` | Mode 7 globe VRAM image (32 KiB) |
| ROM `$F7:0000-F14E` | fight line tables (41 KiB), resident effect cells, Death Ball frames, text tiles, band tiles (60 KiB of 64) |
| ROM `$FA:8000-` | Goku's orbit poses, descent and fall cells, aerial-melee cells; Frieza's tiny and full frames (27 KiB) |
| Extended data | 666 KiB in 30 blobs: band maps (2 x 21 KiB), band end ramps (31 + 6 + 26 KiB, origin cut 0.4 KiB), beam pictures (classes 0-4: 24, 24 + 12, 24, 9, 24 KiB), aura pictures (24 + 30 KiB), the descent's and the pullback's line tables (117 KiB in 4 blobs) and window rows (237 KiB in 8; the pullback's index 1.4 KiB), the pullback's frame records (7.5 KiB) and Death Balls (22 KiB), the landing candidates (4 KiB); the montage's 110 KiB in 24 blobs: per town its tiles and maps (13.2 / 14.4 / 8.4 / 6.7 KiB), people records (3.5 KiB x 3), laser rows (1.7 / 2.5 / 1.3 / 2.1 KiB) and OBJ cells, the people's poses (11.3 KiB), the embers, the aerial cuts' cloud tiles (5.8 KiB) and frame records (11.1 KiB), the tables (17.6 KiB: palettes, tints and flashes, the ruin, fires, ring, fragments, bursts' places, the cloud and gradient maps) |
| WRAM `!RAM_ORBIT+$00-$5D` | state, command, flags, load step, frame counter, test options, timing lines, command argument, `orbit_api_enter` inputs, landing clock, waiting entry, the return's step, landing spot and search, the cinematic's clock, shot, picture, cut step and saved brightness, timing marks (test builds), the Mode 7 chunks in VRAM and the preload's next, the pullback's deferred uploads and its Death Ball's end |
| SRAM | `!SRAM_WORK_SCENE` (above) |
| VRAM | words `$0000-$3FFF` (Mode 7 map and characters) while the scene shows. OBJ (name base `$6000`, 16/32): `$000` Frieza 32x32 (streamed), `$004` Death Ball 32 (streamed), `$040/$044/$048/$04C/$080/$084` beam pictures 32x32 (`$048` and `$084` also the auras', while their groups have fewer than three chains), `$088` Goku 16x16 (streamed), `$08A` Death Ball 16 (streamed), resident 16x16 effect cells in `$008-$03F`, `$08C-$0FF`, `$100-$13F`, `$180-$1BF`, star cells `$160-$17F`. Untouched: `$144-$15F` and `$1C0-$1DF` (the game streams the boy's cells and the damage digits there), `$1E0-$1FF` (HUD portraits). BG3: tiles `$180-$1FF` (text panels), map rows 1-8. During the finale: BG1/BG2 tiles at `$5000` (45), BG1 map `$5400`, BG2 map `$5C00` (rows 0-13). During a town shot: BG1/BG2 tiles from `$0000`, maps `$2000`/`$2800` (64x32) and their ruined copies `$5000`/`$3800`, BG3 maps `$3000` (caption) and `$3400` (laser), BG3 tiles `$17E-$17F` and the text tiles; OBJ (8/16) embers `$000-$01B`, people `$020-$07F` (the rabite `$040-$05F`), the bursts' resident cells, fragments `$160-$16F` and the ring's dot `$170` over the stars' cells (the pullback's load restores them). During an aerial cut: BG1/BG2 the clouds' tiles from `$0000` and one map at `$2000` (64x32), BG3 the gradient's map `$3000`; OBJ (16/32) `$000-$03F` reloaded from the resident set, Frieza's slots at `$000` and `$060` (6 x 6 tiles), Goku's at `$048` and `$04C`. During the pullback: the Mode 7 image again, Frieza's and the 32 px Death Ball's cells, the beam's slots 3-5, `$008`/`$00C` and `$180` hold the Death Ball's two buffers while it shows (the resident rows restored after it) |
| CGRAM | 0 (sky), 4-11 (text panels), 17-18 (Frieza's band layer), 32-112 (globe), 113-114 (Goku's band layer); OBJ palettes 0 fire, 1 Goku (Super Saiyan), 4 blue (entries 2-3: beam band), 5 pink (1-3: beam band or laser), 6 Frieza, 7 gold with the star shades in 1-4; sent within the game's own palette transfer, after its buffer (also on the lag vblanks that skip the modules). Palettes 2-3 (HUD companions, damage digits) untouched. During a town shot, in the game's own transfer: the backdrop and BG palettes 1-7 (the town's, or tinted), 4-11 the caption, 12-15 the laser; OBJ 0 fire, 1-3 people (or the rabite), 4 fragments, 5 the ring and embers; the game's 1-3 and 224-255. During an aerial cut: 0-27 (the gradient on BG3's palettes 0-6), 32-47 (the clouds), OBJ 0 fire, 1 Goku, 4 blue, 6 Frieza, 7 gold, at its flash level |
| OAM | native sprites on lines 190-223 (the HUD) kept, the rest hidden; ours after them (in the montage: all hidden, ours from the first slot); the core's module area is closed at our end (`core_oam_cursor = core_oam_limit`) |
| HDMA | channels 0 (`$2131`), 1 (`$210D/E`), 2 (BGMODE), 3 (M7A, indirect from F7 or, in the descent and the pullback, extended data), 4 (M7D, likewise), 5 (BG3VOFS; TM in the pullback), 6 (windows, indirect from SRAM or the generated extended data) via `$2C` bits: all but 7 while the scene shows. During a town shot only 2 (TM) and 6 (the laser's windows, indirect from extended data); during an aerial cut 2 (TM), 3 and 4 (BG1's and BG2's scroll per line) |
| DMA | channel 7 in vblank (above); the Mode 7 image (64 chunks of 512 bytes, eight a vblank, those already in VRAM skipped), star, effect, text and band tiles once, with the picture held black (the pullback's cut: the chunks the second aerial cut did not send, the stars and `$100-$13F`; the rest in its vblanks); a town shot's tiles, maps and cells in three steps at its cut (force blank), its people's poses (480 bytes) and the ruin's map entries by vblank room |
| SRAM (montage) | a shot's working state and the laser's two HDMA tables (`$32:6100-61BF`), an aerial cut's state and its four scroll tables (`$32:6200-63EF`), the pullback's Death Ball buffers' state (`$32:6100-610B`), over the globe's window blocks (the fight's builder takes them back at the end) |

While the scene owns the picture the module drops the game's BG row/column
streaming (`$2E/$2F`) and animated-tile requests (`$90/$9A` bit 7), as the
ending module does, so nothing else writes BG VRAM. The return gives the
deck back through the field's own door event (`core_event_request`), so the
game and every module that keeps VRAM re-upload after the map load, as
after any door.

Timing (Mesen, FastROM, merged build): the globe test's frame hook ends by
line ~100 in steady state with no lag frame in its 240-frame spin. In the
scripted fight the field frame ends by line ~200 (spare-time work stops at
196); 2-3 pictures repeat where the game's own frame runs long (its
reaction to Goku's damage). In the clash: 4 repeated pictures in 1,500
frames of fighting, plus the fanfare's 29-frame song upload.

## Tests

`node snes/test/orbit/run.mjs [case ...]` (Mesen; every case by default, and
in `snes/test/run-all.mjs`). Addresses of core's and other modules' fields
come from their sources. Results on the merged build:

- `globe`: imports `preset__space`, shows the test scene with five browser
  cameras and two of the victory's descent (ages 1250 and 1392, from the
  generated tables) and compares each screenshot with `reference.mjs` (the
  browser's `planet()` and `sky()` on the cartridge's world map): disc and
  rim edges match (mismatch 0-0.01%; none in the descent), mean colour
  difference 1.0-2.7%; a 240-frame longitude spin completes every frame.
- `intro`: the intro through the public API: the message schedule against
  `orbitIntroText` and each panel against the browser's `radioPixels`
  (pass); the scene work area is the orbit's while it runs and free after
  the stop.
- `fight`: the space fight under a scripted pad, logged every frame and
  compared field by field with `fight-ref.mjs` (the browser's own
  `createFrieza` in Node, fed the pad word the cartridge read): 658 frames
  identical. Goku's HP passes through the game's damage queue, which
  applies it 1-5 frames after the browser's stub depending on where the
  fight's frames fall in the game's cycle (`ORBIT_FIGHT_EXTRA=0-7` covers
  every phase; all pass); it may trail by 8 frames.
- `fight` and `clash` also watch every frame (`watch.lua`): the colours the
  orbit owns in CGRAM against what the scene sends (the sky, the globe's
  81, OBJ palettes 0-1 and 6-7, 4-5 but for the band entries, the text
  panel's), our vblank ending in the next frame, and, through write
  callbacks, CGRAM writes and general DMA starts under HDMA on the visible
  lines while the orbit is live; any of these fails the case. They also
  report the frames whose OAM passes the PPU's line limits (32 sprites, 34
  slivers; `W.oam`), and log the stage scanlines (`W.marks`, the
  `ORBIT_TIMING` build). `ORBIT_SHOTS=a-b,...` screenshots those frames
  exactly and `ORBIT_DUMP=1` dumps their OAM; `fight-view.mjs` draws the
  browser's own picture of each frame of the fight (`planet-view.js`
  through a stand-in PPU, the sprite layer, Frieza's sheet and the ki art
  built as the browser builds them), for comparing pictures in sequence.
- `clash`: from 6,000 HP: gather, charge, launch, a lost struggle (recoil,
  420 damage), a won one under B taps, the 'won' clock with the native
  victory commands, the return: 2,889 frames identical, back at 1392.
- `montage`: from the hand-off, the whole cinematic to `cosmicDuration`
  (2042) and the orbit's intro after it; 40 screenshots compared with the
  browser drawing into a 256x224 surface (`montage-ref.mjs`):
  - 17 of the four towns (calm, tint, warning ring and laser, the hit, the
    explosions, the caption, the aftermath) against its own
    `frieza-collateral-view.js`, the sprite art read from the PNGs: 100% of
    the pixels outside the explosions, 97.9-98.9% during them (the bursts'
    quarter turns, the shake's 2-pixel edge);
  - 10 of the two aerial cuts against its own `aerial-melee.js`, the
    sprite layer built as the browser's: 99.8-100% outside the explosions
    (Goku's colours), 95.4-100% during them (the bursts);
  - 13 of the pullback against `planet-view.js` itself (its picture read
    back through its `getColor` for a stand-in PPU and game state): the
    globe's disc, rim and sky where no sprite is (at least 99.5%; 99.65-
    100%) against `reference.mjs`, and the share of the browser's sprite
    pixels shown in their colour (at least 70% while the beam shows,
    otherwise 90%; 75-94%).

  The clock steps once a frame except at the pullback's cut (2 catch-up
  steps there); no vblank outside the cuts' loads ends past line 258; the
  pullback's cut holds the picture black for at most 6 frames (5). The
  intro's first panel after it is compared with `radioPixels` (its text
  tiles come in the pullback's vblanks), and its HUD shown in
  `intro030`.
- `handoff`: the frieza module's phase-two fight (its `FRIEZA_TEST`
  mailbox) takes a hit across 32,000: the second surge plays on the deck
  (screenshots at ages 45 and 66: the Death Ball above Frieza, Goku's
  giant beam) and hands over at age 72 (`collateralStart`); the orbit's
  fight starts at Frieza's HP and goes live with the area's owner 1 -> 2,
  Frieza's fight is in space, and his 2 KiB at `$32:7800-7FFF` stay
  unchanged for 300 frames.
- `death`: from the hand-off (the cinematic's clock moved to its pullback,
  as `death` and `return` both do), the intro cut short and Goku at 1 HP:
  Frieza's first hit ends him; 13 of Goku's positions over the fall equal
  `bossRushDeathPose`'s, the orbit stops at 358, the ending's fatal
  sequence runs on (age 414 at the end) and the scene work area is free.
- `return`: from the hand-off, no intro and Frieza at 6,000 HP, B every 6
  frames (the first struggle is won): the 'won' clock to the return at
  1392 (screenshots of the descent), the deck's door, the scene stopped
  before the load with the area and the pad given back, the deck (map 246)
  reloaded with Goku where he stood, the landing pose (32 frames), the
  landing clock seen at 84 the frame before it lands, `frieza_orbit_landed`
  (landed, out of space) and the victory event C7 requested the next frame.

## API

| Field / routine | Use |
| --- | --- |
| `!orbit_cmd` (`!RAM_ORBIT+$01`) | request: 1 test globe scene (camera in the scene block), 2 stop, 3 test fight (no intro; Frieza's HP in `!orbit_arg`, target longitude/latitude in `cam_lon`/`cam_lat`), 4/5 the API with its defaults (intro / fight) |
| `!orbit_arg` (`!RAM_ORBIT+$0E`) | word argument of the command |
| `orbit_api_defaults` (JSL) | the inputs below set to the space preset's values (32,000 HP, target `$128/$12A`, fresh clocks) |
| `orbit_api_enter` (JSL, A16 = mode) | take the picture (`!orbit_flags` bit 0 at once) and start the orbit in its next field frame once the scene work area is its: `!OE_INTRO` 1 with the 855-frame intro, `!OE_FIGHT` 2 straight into the fight, `!OE_SURGE` 0 the second surge's cinematic first (the montage and the pullback, then the intro). Inputs in WRAM `!RAM_ORBIT+$10-$23`: `!orbit_in_hp`, `_tx`, `_ty` (the strike target), `_age`, `_cycle`, `_limp`, `_lmel`, `_mhits`, `_dodge`, `_stun` (Frieza's ground state). Writes nothing to the scene work area. Ignored while the orbit runs or waits to start |
| `orbit_api_status` (JSL) | A16 = `!orbit_flags` |
| `!DEBUG_PRESET_HOOK_ORBIT` / `_SPACE` | at the `FRIEZA_PHASES` hook: the API with the intro or straight into the fight; carry set until the scene is live |
| `!FRIEZA_ORBIT_SURGE` / `_RETURN` / `_LOCKED` (`bind.asm`) | the frieza module's hand-off: every surge frame (A = age) the orbit draws the surge's beat on the deck (C clear) until `collateralStart`, then enters with Frieza's ground state (C set); the victory event while in space returns; the controls are locked while the orbit owns the picture or its landing runs |
| `!orbit_state` (`!RAM_ORBIT+$00`) | 0 off, 1 loading, 2 live, 3 stopping |
| `!orbit_land` (`!RAM_ORBIT+$24`) | the landing clock: nonzero from the return to `frieza_orbit_landed` (1 + frames the field could act since the return) |
| `!orbit_rstep` (`!RAM_ORBIT+$27`) | the return's step: 0 none, 1 door wanted, 2 requested, 3 fading out, 4 the field loads the deck, 5 landing |
| `!orbit_flags` (`!RAM_ORBIT+$02`) | bit 0 the orbit owns the picture, or its return to the deck runs (to `frieza_orbit_landed`: the frieza module's ground fight sleeps, also when the orbit was entered without its surge, as the debug presets do), bit 1 live |
| `!orbit_test` (`!RAM_ORBIT+$09`) | test scene options: bit 0 spin (longitude +2 per frame) |
| scene block `$32:6000` | `cam_x, cam_y, cam_r, cam_lon, cam_lat, cam_tdx, cam_tdy, cam_age` (words) |

## Requests

- **frieza**: (1) `frieza.md` says the orbit works in `$32:6000-6FFF` under
  Frieza's claim and should not claim the area; the orbit needs 6 KiB of
  it, so it now takes the claim at its start (giving Frieza's back for
  him) and keeps to `$32:6000-77FF`, leaving his `$7800-7FFF` (fight block,
  hole bitmap) untouched. Please update that note. His fresh re-claim after
  the orbit clears the fight block and with it the deck's holes
  (`fzs_arena_map`); the browser keeps `b.arena` across the orbit, so a
  re-claim after `!SCENE_ORBIT` could keep them. (2) The orbit plays the boss-victory
  beat from its own clock and does not call `frieza_victory_start/_tick`
  (`frieza.md` says it does); it calls `frieza_orbit_won` at the fatal hit
  and `frieza_orbit_landed` at the landing. (3) `returnToFortress` drops
  `b.space` before its landing search, so `floorHole` sees the deck's
  holes; `frieza_floor_hole` (flight's `canLand` provider) answers only
  while the fight is on the deck (`fz_arena_owned` needs `FZFF_SPACE`
  clear), and the orbit's search runs in space, so it does not avoid holes
  yet. Please answer for map 246 while `FZFF_SPACE` is set too (the arena
  is still his), or give the orbit a hole test.
- **world**: an API to start the landing pose (`mana-mod.js`
  `flightTransition = {kind: 'landing', age: 0}`), e.g.
  `!WORLD_API_LANDING`; the orbit's binding calls it when defined and
  meanwhile writes `!w_trans_kind` / `!w_trans_age` itself (`bind.asm`
  `orbit_bind_landing`, under `defined("TRANS_LANDING")`).
- **flight**: an API to keep Goku hovering (`localFlight = true`,
  `localLift = 12`) for a return with no landable spot within 128 pixels;
  until then he lands where he is.
- **core**: the field's HDMA enable comes after every module's vblank work;
  on frames where the game's own vblank runs to line ~251 (its damage
  digits) the modules have about ten lines before a late write loses the
  frame's HDMA. A vblank-time budget for modules (or an earlier enable when
  no module DMA runs past line 0) would make that margin explicit.
- **audio**: the fanfare's song upload (`01 18 44 8F`, a restart of song
  `$18`) holds the field loop about 29 frames; it falls inside the
  whiteout, so only the clock notices.
- **ui**: while `!orbit_flags` bit 0 is set, no window placement or window
  HDMA (`ui_field_nmi` uses channels 0/1 and re-arms 5, which the orbit
  programs every vblank).
- **fx**: no field effects while `!orbit_flags` bit 0 is set (`fx_nmi`
  programs channels 2/3, the orbit's BGMODE and M7A).
- **goku**: while `!orbit_flags` bit 0 is set, stand down the hero's cell
  streaming and drawing (the orbit draws Goku itself and hides native
  sprites); keep the HUD portrait. The orbit writes OBJ palette 1 with the
  Super Saiyan colours each vblank, so the HUD portrait should be the Super
  Saiyan one.
- **ending**: (1) the fatal start (`start_fatal`) writes the scene work
  area (`!s_family` at `$32:6000`, `!s_ldptr`, ...) while the orbit still
  holds it: in the `death` test it overwrote the orbit's camera (`cam_x`
  became 1, `cam_r` 0). The orbit keeps its own copy of the death camera
  for now; the ending should write that area only once its claim
  (`!SCENE_ENDING`) succeeds, which during an orbital death is at black
  (the orbit releases at 358). (2) `!EF_ORBIT` is not set: the frieza
  module's `fz_bind_ending_lose` could pass it while `FZFF_SPACE` is set
  (frieza), if the ending wants to tell the two deaths apart.
- **core (lag vblanks)**: on a vblank whose frame the game did not finish,
  the game still sends its palette when `$EC` bit 2 asks for it (its colour
  animations, the hero's death colours), while module vblank work is
  skipped: the orbit's colours (the globe, its OBJ palettes) are replaced
  for that frame. Seen once in the `death` test's first frames (the native
  death runs long). A lag-vblank hook for scenes that own colours, or
  skipping the game's palette upload on those vblanks while a scene owns
  CGRAM, would close it.
- **world**: no field effects while `!orbit_flags` bit 0 is set. Combat is
  quieted through its input lock (owner `$0100`).
- **frieza / debug**: the debug `orbit` preset. The browser's capture
  (`quick-start.js` 'orbit') is the second surge's start on the deck, after
  the real phase hand-offs; the cartridge's hook (`orbit_debug_orbit`)
  enters the orbit's intro instead (`!OE_INTRO`; the debug suite's
  picture match is 39%/1%). Matching it takes the frieza module's own
  hand-offs up to the second surge from the `FRIEZA_PHASES` hook (an
  entry like its `FRIEZA_TEST` threshold hits); the orbit then follows
  with `!OE_SURGE` as in the game, and its hook only has to wait.
