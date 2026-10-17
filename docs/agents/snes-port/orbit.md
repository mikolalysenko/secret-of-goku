# ORBIT module: collateral cinematics, the space fight and the finale

Spoilers. Part of the [SNES cartridge port](../snes-rom.md) ([plan](plan.md),
[engine notes](engine.md)). Source: `snes/src/modules/orbit/`, generator
`snes/gen/orbit.mjs`, tests `snes/test/orbit/`. Browser sources:
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
| Space fight: Goku's movement, ki, beam, punch, teleport, dodge; Frieza's orbital AI and shots | Next |
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
ricochets, distant bodies and debris as in the browser files (to be
documented with the implementation).

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
at priority 0 (the globe hides them where it is opaque; stars inside the
disc's inscribed square are not given OAM slots). Per depth the visible stars
are kept as a ready OAM list, rebuilt only when that depth's offsets, zoom or
culling square change (one depth per frame at most) and copied into OAM with
MVN each frame.

## Resources

| Resource | Use |
| --- | --- |
| Code `$A7:8000-` | `!CODE_ORBIT` (about 3 KiB so far) |
| Data `$E7:0000-` | stars, asin rows, chord scales, rim tables, palettes, star tiles (about 5 KiB) |
| ROM `$F6:0000-7FFF` | Mode 7 globe VRAM image (32 KiB) |
| ROM `$F7:0000-A02D` | fight line tables (41 KiB) |
| WRAM `!RAM_ORBIT+$00-$0F` | state, command, flags, load step, frame counter, test options, timing lines |
| SRAM `!SRAM_WORK_SCENE` `$32:6000-6A7F` | camera, globe/star state, two window blocks, indirect HDMA tables, BGMODE table, star lists; `$6A80-$7FFF` free for the fight |
| VRAM | words `$0000-$3FFF` (Mode 7 map and characters) while the scene shows; OBJ tiles `$160-$17F` (star cells) |
| CGRAM | 0 (sky), 32-112 (globe), 241-244 (stars, OBJ palette 7), rewritten each vblank after the game's palette upload |
| OAM | native sprites on lines 190-223 (the HUD) kept, the rest hidden; ours after them; the core's module area is closed while the scene shows |
| HDMA | channels 2 (BGMODE), 3 (M7A, indirect from F7), 4 (M7D, indirect from F7), 6 (windows, indirect from SRAM) via `$2C` bits |
| DMA | channel 7 in vblank: palettes (~170 bytes per frame); the Mode 7 image and star cells once |

While the scene owns the picture the module drops the game's BG row/column
streaming (`$2E/$2F`) and animated-tile requests (`$90/$9A` bit 7), as the
ending module does, so nothing writes BG VRAM.

Timing (Mesen, `globe` test, space preset): the frame hook ends by line ~100
in steady state (worst 204 on a star-list rebuild during a 240-frame spin);
no lag frame in the spin; the vblank hook ends by line ~251.

## Tests

`node snes/test/orbit/run.mjs [globe]` (also run by `snes/test/run-all.mjs`).
`globe`: imports `preset__space`, starts the test scene through the module's
command byte with five browser cameras (idle fight, moving, beam, clash-wide,
off-centre), compares each screenshot with `reference.mjs` (the browser's
`planet()` and `sky()` formulas on the cartridge's world map), then spins the
longitude for 240 frames and checks that every frame completed.

## API (so far)

| Field / routine | Use |
| --- | --- |
| `!orbit_cmd` (`$7E:DC01`) | request: 1 test globe scene (camera in the scene block), 2 stop |
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
