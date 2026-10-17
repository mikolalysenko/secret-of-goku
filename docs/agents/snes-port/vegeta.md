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

### Vegeta, effects, clash (in progress)

- Vegeta: 56×40 cells from `decodeVegetaSheet()` (32 frames: base/gold ×
  16 poses), cut into 16×16 OBJ blocks per frame, streamed into claimed OBJ
  VRAM, drawn with `core_oam_add`; one OBJ palette shared by both forms.
- Beams (purple Galick Gun, yellow Final Flash), charge orbs, volleys,
  explosions, the clash waves and detonation through the fx module
  (`fx_beam` `FX_BEAM_GALICK`/`FX_BEAM_FINAL`, `FX_ORB`, `FX_CELL`,
  `FX_EXPLODE`, `FX_DETONATE`).
- Radio lines through the ui module's `ui_say`; music cues and voices
  through the audio module.

## Resources

| Resource | Use |
| --- | --- |
| Code `$A8:8000-` | `!CODE_VEGETA` |
| Data `$E8:0000-` | BG2 metatiles (584 B), palettes (192 B), BG2 grid (4 KiB) |
| ROM `$F4:0000-` | chamber BG tiles (6.5 KiB) |
| ROM patches | `CF:E243` (189 B), `CD:0596` (2 B), `C8:3C11` (1 B) |
| VRAM | BG tiles `$0000-$0CEF` while map 72 is loaded (the cave tileset is not used there) |
| CGRAM | BG palettes 2-7 through the game's buffer `$7E:0640-$06FF` (map 72 only) |
| WRAM | 7F:C000 ids 70/11, 7F:C808-, 7F:4000 grid of map 72 (native tables, rewritten at load) |

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
| `chamber` | door `304` from a Potos state (`graphics-audit__party`, `CF3F`=5): VRAM tiles, CGRAM 32-127, BG1 metatiles 70/11, BG2 metatiles and grid equal the generator's outputs; BG1 grid equals `chamberLayout()`; four views (entrance, the steps, mid-room after scrolling, the east border) match the cartridge picture 100% and the browser's floor/seam/border colours 100% (pavilion views 84-86% of all pixels, the rest is palette quantisation of the 1,275-colour pavilion art); the pavilion's front wall and the east border block Goku |

## Status

| Part | State |
| --- | --- |
| Chamber map, pavilion, collision, scrolling | done, tested |
| Story hooks/queries (`TRIAL_START`, `TRIAL_ACTIVE`, `TRIAL_PARTY`) | next |
| Vegeta sprite, intro staging, idle AI | next |
| Attacks, damage, transformation, clash, draw, return | planned |

## Requests

- **story**: `OBJECT_TRIAL` (hook 49) is listed for vegeta but is the
  Thanatos trial's Dyluck/Thanatos staging on map 246 (`mod.frieza.trial` in
  `native-story.js`); it belongs to frieza.
