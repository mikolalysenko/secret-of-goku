# Secret of Mana data extraction

The Potos milestone uses targeted reverse engineering of the user's unmodified
US ROM. This is not a full decompilation. We recover map geometry, graphics,
collision records, NPC records, doors and original event bytecode, then let the
browser game supply Goku's movement, combat and rewritten story.

## Reproduce

Node.js is the only dependency. The source ROM is read but never patched.

```sh
node tools/rom/cli.mjs inspect .local/rom/secret-of-mana-us.sfc
node tools/rom/cli.mjs extract .local/rom/secret-of-mana-us.sfc --out assets/data/potos-rom.json --render-dir assets/maps
node --test tests/rom.test.mjs
```

The inspector recognizes a 512-byte copier header and hashes the ROM payload
without it. Extraction defaults to the identified US retail image:

| Property | Value |
| --- | --- |
| Payload size | 2,097,152 bytes |
| Mapping | HiROM, header at PC `0xFFC0` |
| Title | `Secret of MANA` |
| CRC32 | `D0176B24` |
| SHA-1 | `8133041A363E3CC68CEDEF40B49B6D20D03C505D` |
| SHA-256 | `4c15013131351e694e05f22e38bb1b3e4031dedac77ec75abecebe8520d82d5f` |

The ROM's checksum and complement both validate. `--allow-unknown` is an explicit
research override for modified images; it does not make another region's offsets
compatible. The CLI rejects attempts to overwrite the source, including hardlink
and symlink aliases. Source ROMs remain in the ignored `.local/` directory.

## Verified Potos data

| Map | Name | Grid | Pixel dimensions |
| --- | --- | --- | --- |
| 131 | Potos village | 52 × 52 | 832 × 832 |
| 257 | Potos shared house map | 64 × 40 | 1024 × 640 |
| 258 | Potos elder's house map | 64 × 40 | 1024 × 640 |
| 259 | Potos inn | 32 × 24 | 512 × 384 |
| 260 | Mantis Ant cave | 30 × 30 | 480 × 480 |

House maps contain multiple rooms on one physical map. Doors choose coordinates
inside that shared map. Existing browser room crops can remain separate scenes.
ROM interior coordinates must be adjusted by their room crop origin.

Potos has 10 object records, one entry event (`0x610`), and nine door triggers.
Its base background is piece 14, foreground piece 15. Piece 13 is a 3 × 2
replacement at tile `(29,28)`, visible when Potos event flag `0x10` is between 6
and 15; it blocks the Mantis hole with invisible solid tiles. The hole's visible
art remains in the foreground. The exported default sets flag `0x10 = 6`.
All five maps' used pieces decode with the implemented commands and bounded input.

The old `potos-original.png` map rip shifts the village 48 pixels right relative
to ROM coordinates. The generated `rom-potos-*.png` images use the real ROM
origin. When migrating existing placements: `nativeX = oldX - 48`; Y is unchanged.
Do not apply that translation twice.

After that alignment and matching 5-bit channel values, 99.7892% of the ROM
render matches the old rip exactly. The only mismatches are the six Mantis-hole
cells; the old rip substitutes flowers there. The original ROM render retains
the hole, and browser story code can replace those cells deliberately.

All five existing interior scenes have exact replacements in
`rom-houses-composite.png`. Their crops are: tavern/lobby `[80,384,288,224]`,
shop `[416,96,160,208]`, home `[80,80,240,192]`, elder `[704,80,240,192]`, and
storehouse `[720,400,144,192]`. RGB5 pixel comparisons confirm each alignment;
local scene coordinates do not change. The beds room on map 259 is separate.

## JSON interface

`assets/data/potos-rom.json` includes:

- `rom`: payload hashes, header fields and validation results.
- `maps`: headers, raw/decoded objects, triggers and positioned map pieces.
- `maps[].composite`: dimensions and row-major `layers`, `collision`, and `solid`
  grids. The layer keys are `background` and `foreground`.
- `tilesets`: 384 metatiles per set; each metatile is four SNES tile words in
  top-left, top-right, bottom-left, bottom-right order. Collision ID per metatile
  is retained alongside them.
- `collisionTypes`: all 256 four-byte behavior records. `solid` is the original
  wall bit. `shapeCode` preserves the slope/corner/event byte.
- `events`: original bytes for directly referenced events; no script execution
  or speculative dialogue extraction is performed.

Piece-local `tiles` range from 0 to 191. Composite `layers` include the selected
192-tile half, so references range from 0 to 383. Empty/uncovered cells are
`null`. Event visibility is evaluated against `defaultEventFlags`; unspecified
flags are zero. `composeMap()` can recompute a map for a different snapshot.

Potos door triggers have tile positions attached in row-major order. They were
checked against the nine door-type collision cells and the original door table.
The generic importer leaves trigger positions unresolved for other maps where
special tiles and collision-layer switching require more interpretation.

For the village, use `composite.solid.background[y * width + x]` for full-tile
walls. This is substantially more faithful than hand-drawn geometry, but it is
not the original movement engine: slopes, diagonal corners, sub-tile edges and
layer changes still need interpretation. Potos uses collision IDs 0/23/74 for
open surfaces, 4 for walls, 10 for doors, and 25/30/31/33 for shaped boundaries.
The shape byte should not be treated as an additional blanket wall flag.

## Graphics and world map

`graphics.mjs` follows the original graphics-list loader at SNES
`C1:F413–C1:F5CC`: triples select a tile source and run length. The source type
selects 2bpp plus constant planes, 3bpp plus a constant plane, or ordinary 4bpp.
The vanilla tables begin at PC `0xCE270` (graphics bases) and `0xCE27E` (lists).
Static lists produce 864 8×8 tiles. The initial animation group loader supplies
the next 32 tiles, from the tables at `0x80400`/`0x80441` and graphics at
`0x1C8000`. Palettes use seven 15-color groups at `0xC8000 + palette * 210`.
The renderer expands each 5-bit channel to 8-bit with bit replication.

`rom-potos-{background,foreground,composite}.png` and corresponding images for
the four other maps are deterministic initial-frame renders. They preserve
transparent pixels on separate layers. SNES per-subtile priority bits are
available in the metatile words; a game renderer must use them when deciding
which parts cover a character. Drawing the entire foreground layer over every
sprite does not reproduce the SNES priority rules.
The composite renderer therefore draws BG2-low, BG1-low, BG2-high, then BG1-high.
This is essential: painting all of BG2 last incorrectly reveals unused rows of
skull graphics in the cave and cuts rectangular gaps into village roofs.

`world.mjs` also recovers the full 512 × 512 overworld tile grid, 240 graphics
tiles, day/night palettes, palette assignments, 512 takeoff points and 256
landing zones. `rom-world.png` samples the native 4096 × 4096 texture at 1/4
resolution for the browser's 1024 × 1024 Mode 7 renderer. `renderWorld(world,
{scale:1})` retains native resolution.

The row bank table is a **bitmask**, verified in original code at `C0:9A00`:
row `r` selects bank `6 + ((byte[0x67FC0 + (r >> 3)] >> (r & 7)) & 1)`.
The first bank transition is row 358. Later ocean rows share an earlier data
pointer; blindly incrementing the bank whenever pointers decrease is wrong.
Potos takeoff is world tile `(304,378)`, or `(608,756)` on the 1024-pixel texture.
Landing block `(9,11)` resolves back to map 131.

## Boundaries and tests

The map codec supports literal tiles and compression commands `C0–F7`.
Motif commands `F8–FF` fail explicitly. Every read and back-reference is bounded;
truncated streams and output overflow raise `RomFormatError`. The five milestone
maps do not require motifs. Unsupported 8bpp graphics runs also fail explicitly.

Synthetic tests exercise the compression families, signed metatile offsets,
copier-header normalization, bad pointers, packed coordinates, event-conditioned
composition, planar graphics and PNG chunk checksums. An optional local-ROM test
checks known hashes, dimensions, original door positions, world bank transition,
shared row pointers and Potos takeoff/landing. It skips when the private ROM is
absent. No ROM bytes are stored in the test fixtures.

An independent original-engine emulator capture additionally verifies map 260:
both 30 × 30 grids, all 1,536 metatile words, and all 896 loaded 8×8 tiles match
WRAM/VRAM byte for byte. Potos's foreground grid and all metatile words match
too. Its background differs at exactly the nine door cells rewritten by the
engine to trigger IDs plus the six event-controlled hole cells. Six otherwise
static Potos graphics tiles are changed by the original wind/distortion effects;
the exported image uses their initial ROM frame. Optional snapshot tests run if
the local `.local/emulator-probe/map-260-*.bin` captures are available.

Remaining work for the extracted-data runtime includes original event execution,
sprite assembly/animation, full collision shapes and movement, animated map
tiles/palettes, background scrolling/color math, and the full SNES combat engine.
The browser chapter reimplements combat/story in JavaScript so Goku can break
the original rules. The separate [original engine lab](engine-lab.md) retains
those original systems through emulation and attaches live Goku hooks.

## References and attribution

The LGPL-2.1 tooling adaptation preserves Moppleton's attribution and license in
[tools/rom/NOTICE.md](../tools/rom/NOTICE.md) and
[tools/rom/COPYING.LESSER](../tools/rom/COPYING.LESSER).

- [Moppu / SecretOfManaRandomizer](https://github.com/Moppu/SecretOfManaRandomizer/tree/1404b7bd8552677399f24632c1e37cba37d491ef): primary implementation for maps, metatiles, objects, events and world-map RLE.
- [smkerz / secret-of-mana-hacking, graphics construction notes](https://github.com/smkerz/secret-of-mana-hacking/blob/main/Doc/Construction%20Tileset%20Map%20128.txt): pointed to the original graphics-list loader, which was then traced against the supplied ROM.
- [Hack of Mana map-format notes](https://hackofmana.com/maps/), [metatiles](https://hackofmana.com/16-x-16-tileset/) and [overworld](https://hackofmana.com/world-map/): cross-checks of field layouts and rendering formats.
- [Super Famicom Development Wiki](https://wiki.superfamicom.org/seiken-densetsu-2): additional ROM layout reference. Some offsets differ between regions; US extraction uses verified offsets above.

One upstream accessor (`MapHeader.getTileset16`) reads byte 0 despite its own
field constant/setter specifying byte 2. This port uses byte 2. Graphic rendering
and extracted headers confirm that choice. Extracted game content retains its
original copyright; the tooling license applies to the tools, not the ROM.
