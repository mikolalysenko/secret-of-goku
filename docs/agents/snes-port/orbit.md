# ORBIT module: collateral cinematics, the space fight and the finale

Spoilers. Part of the [SNES cartridge port](../snes-rom.md) ([plan](plan.md),
[engine notes](engine.md)). Source: `snes/src/modules/orbit/`, generator
`snes/gen/orbit.mjs`, `orbit-fx.mjs`, `orbit-sprites.mjs`, tests
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
| Mode 7 globe (rotation, zoom 56-104, centre, latitude, rim) and starfield (100 stars, three parallax depths, twinkles) | **Done**, test scene `globe` matches the browser's formulas (below) |
| Space fight logic: Goku's steering, ki, charged wave, punch, Instant Transmission and the four-beat exchange; Frieza's patrol, side-steps, warnings, beams, lasers, discs, Death Balls, ricochets; damage both ways; camera | **Done** (`fight.asm`, `math.asm`): identical to the browser's own `frieza.js` tick on every frame of the `fight` test (658 frames, scripted pad) |
| Space fight drawing: Goku, Frieza, ki, Death Balls (16/32), discs, finger glints, hand charges, Exploder bursts, impact sparks, ricochets | **Done** (`draw.asm`, resident and streamed OBJ cells) |
| Beam bands (Goku's wave, Frieza's beam and laser), auras, distant bodies | Next (the wave and beams currently show only their origin orbs) |
| 60 Hz | **Done**: the fight steps once per field vblank (catching up after a slow game frame); the picture's incremental work runs in the frame's spare time |
| Distant bodies (moon, planets), their shattering and the asteroid field, Luna's remark | Next (the `fight` test aims clear of them) |
| Collateral shots, aerial melee, pullback, orbit intro dialogue | Planned (design below) |
| Debris / asteroid field, Luna's remark | Planned |
| Beam struggle, victory (boss explosion, whiteout, pouch, fanfare), descent, landing | Planned |
| Orbital death (revert, fall), hand-off to the ending's explosion | Planned |

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
  7 boss arenas cut their floor; the browser draws it behind the HUD.

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
MVN each frame.

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

## Resources

| Resource | Use |
| --- | --- |
| Code `$A7:8000-` | `!CODE_ORBIT` (about 9 KiB so far) |
| Data `$E7:0000-` | stars, asin rows, chord scales, rim tables, palettes, star tiles, heading/step tables, burst parts and offsets (about 7 KiB) |
| ROM `$F6:0000-7FFF` | Mode 7 globe VRAM image (32 KiB) |
| ROM `$F7:0000-` | fight line tables (41 KiB), resident effect cells (8 KiB), Death Ball frames (7.5 KiB) |
| ROM `$FA:8000-` | Goku's orbit poses, descent and fall cells, aerial-melee cells; Frieza's tiny and full frames (27 KiB) |
| WRAM `!RAM_ORBIT+$00-$0F` | state, command, flags, load step, frame counter, test options, timing lines, command argument |
| SRAM `!SRAM_WORK_SCENE` `$32:6000-6D3F` | camera, globe/star state, two window blocks, indirect HDMA tables, BGMODE table, star lists (to `$6A7F`); fight state and arrays (`$6A80-$6CAF`); drawing scratch and streamed-cell bookkeeping (`$6D00-$6D3F`) |
| VRAM | words `$0000-$3FFF` (Mode 7 map and characters) while the scene shows. OBJ (name base `$6000`, 16/32): `$000` Frieza 32x32 (streamed), `$004` Death Ball 32 (streamed), `$088` Goku 16x16 (streamed), `$08A` Death Ball 16 (streamed), 53 resident 16x16 effect cells in `$08C-$0FF`, `$100-$13F`, `$180-$1BF`, star cells `$160-$17F`. Untouched: `$144-$15F` and `$1C0-$1DF` (the game streams the boy's cells there), `$1E0-$1FF` (HUD portraits) |
| CGRAM | 0 (sky), 32-112 (globe); OBJ palettes 0 fire, 1 Goku (Super Saiyan), 4 blue (entries 2-3: beam band), 5 pink (1 white, 2-3 beam band), 6 Frieza, 7 gold with the star shades in 1-4; rewritten each vblank after the game's palette upload. Palettes 2-3 (HUD companions) untouched |
| OAM | native sprites on lines 190-223 (the HUD) kept, the rest hidden; ours after them (high-table bits cleared with a block fill); the core's module area is closed at our end (`core_oam_cursor = core_oam_limit`), so the game's next OAM pass hides what we leave |
| HDMA | channels 2 (BGMODE), 3 (M7A, indirect from F7), 4 (M7D, indirect from F7), 6 (windows, indirect from SRAM) via `$2C` bits |
| DMA | channel 7 in vblank: palettes (~370 bytes per frame), streamed cells when they change (Frieza 512, Death Ball 512/128, Goku 128 bytes, each only while the vblank has time); the Mode 7 image, star and effect cells once (12 load steps) |

While the scene owns the picture the module drops the game's BG row/column
streaming (`$2E/$2F`) and animated-tile requests (`$90/$9A` bit 7), as the
ending module does, so nothing writes BG VRAM.

Timing (Mesen, space preset, FastROM): the globe test's frame hook ends by
line ~100 in steady state; no lag frame in its 240-frame spin. In the
scripted 660-frame fight the field frame ends by line ~185 (spare-time work
included); two pictures repeat where the game's own frame runs long (its
reaction to Goku's damage), and the fight's clock catches up. Streamed cells
start only before line 248 of vblank.

## Tests

`node snes/test/orbit/run.mjs [globe] [fight]` (`globe` also runs in
`snes/test/run-all.mjs`).
`globe`: imports `preset__space`, starts the test scene through the module's
command byte with five browser cameras (idle fight, moving, beam, clash-wide,
off-centre), compares each screenshot with `reference.mjs` (the browser's
`planet()` and `sky()` formulas on the cartridge's world map), then spins the
longitude for 240 frames and checks that every frame completed.
`fight`: starts the space fight with
the space preset's values (`OC_TEST_FIGHT`, Frieza at 32,000 HP), drives a
scripted pad (steering, sprint, ki, the charged wave, Instant Transmission
and the exchange, focus), logs the fight state every frame and compares it
field by field with `fight-ref.mjs`, which runs the browser's own
`createFrieza` (`frieza.js` tick and `spaceInput`) headlessly in Node on the
pad word the cartridge's fight read at each step (logged with the state), so
the comparison does not depend on frame timing; Goku's HP may trail by up to
four frames (the game's damage queue). Result: all 658 compared frames
identical; at most 3 repeated pictures allowed. The space preset's capture
(`.local/snes-ref/space/frame-00600.png`, HP 819/999 after Frieza's first
beam) agrees with the cartridge at frame 600.

## API (so far)

| Field / routine | Use |
| --- | --- |
| `!orbit_cmd` (`$7E:DC01`) | request: 1 test globe scene (camera in the scene block), 2 stop, 3 test fight (no intro; Frieza's HP in `!orbit_arg`, target longitude/latitude in `cam_lon`/`cam_lat`) |
| `!orbit_arg` (`$7E:DC0E`) | word argument of the command |
| `!orbit_state` (`$7E:DC00`) | 0 off, 1 loading, 2 live, 3 stopping |
| `!orbit_flags` (`$7E:DC02`) | bit 0 the orbit owns the picture, bit 1 live |
| `!orbit_test` (`$7E:DC09`) | test scene options: bit 0 spin (longitude +2 per frame) |
| scene block `$32:6000` | `cam_x, cam_y, cam_r, cam_lon, cam_lat, cam_tdx, cam_tdy, cam_age` (words) |

The surge/orbit entry points for the frieza module and the ending hand-off
will be listed here as they land.

## Requests

- **frieza**: call the orbit module when the second surge starts (HP below
  32,000 with tier 2; the browser's `b.surge.kind = 'frieza-cosmic'`) with the
  strike target (`$128`/`$12A`) and Frieza's HP; suspend the ground fight while
  `!orbit_flags` bit 0 is set; take the hand-back after the landing (the
  browser's `returnToFortress` and `F.victory` request). Persistent range: none
  needed for the orbit itself (no saves happen in space); a byte in
  `!PERSIST_FRIEZA` for "orbit won" if frieza wants it.
- **core**: the scene needs 4 HDMA channels (2, 3, 4, 6) while it shows; it
  uses the game's `$2C` shadow like FX. FastROM (`CORE_FASTROM`) would give
  the fight's per-frame work 25% more headroom.
- **ending**: the orbital death draws until black, then `ending_lose` with
  bit 4 (died in orbit), as `!EF_ORBIT` already anticipates.
- **ui**: `ui_hide` while the orbit owns the picture (its BG3 window would
  appear in the Mode 1 band only).
- **goku**: while `!orbit_flags` bit 0 is set, stand down the hero's cell
  streaming and drawing (the orbit draws Goku itself and hides native
  sprites); keep the HUD portrait. The orbit writes OBJ palette 1 with the
  Super Saiyan colours (`orbit_pal_goku_ssj`, from the goku manifest) each
  vblank, so the HUD portrait should be the Super Saiyan one.
- **world / fx**: no field effects of their own while `!orbit_flags` bit 0
  is set (the orbit owns the pad, closes the OAM module area and owns OBJ
  palettes 0 and 4-7). Combat is quieted through its input lock (owner
  `$0100`).
- **core**: a shared field-vblank counter (combat's `!cb_vblanks` serves the
  orbit's 60 Hz clock today; the orbit is included after combat for its
  define).
- **frieza (hand-off)**: Frieza's ground state carries into the orbit
  (`b.age`, `b.cycle`, `b.node`, `lastImpact`, `lastMelee`, `meleeHits`,
  `dodgeCooldown`, `stun`); the entry point will take them in the fight block
  (`!b_*` in `module.asm`) so the patrol and attack pattern continue as in
  the browser.
