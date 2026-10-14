# Native graphics audit

The main game renders original Secret of Mana data through the SNES engine. This audit checks that the Goku compositor does not disturb that rendering and reviews its intended replacements separately. It is not a claim of cycle-perfect SNES emulation or a complete story playthrough.

## Results — October 12, 2026

- **392/392 documented map entry views**, zero changed pixels outside intended Goku, portrait and weapon replacement regions; no browser errors. The pass took 6 minutes 3 seconds with three browser workers.
- **37 Mana Beast phases**, entered through the original final-battle event, zero unintended pixel differences and no browser errors. The native Mode 7 approach, platform, attack effects and death/game-over transition were captured.
- **23 UI states**: full-party HUD and selection, weapon/item/options/armor rings, control configuration, Action Grid, weapon skills, status, targeting, shops and purchase confirmation, weapon upgrades, save question/empty slots/filled GOKU slot, and spell element/selection/target rings. Zero unintended pixel differences.
- **25 combat captures** exercise real hold/release inputs in four directions in normal and Super Saiyan forms, punch impacts and ring cancellation. Original spell-cell decoding also matches all 34 independently captured native frames exactly.
- **11 status views** cover ordinary, unconscious, snowman, petrify, poison, moogle, dead, miniature, barrel, balloon and engulf states. Zero unintended pixel differences. Miniature charging was checked separately.
- **55 unit tests and 4 browser regressions passed** at the regional-audit revision. Browser coverage included the actual original title, editable naming, complete opening, waterfall control, Potos combat, flight, landing, checkpoint replay and Elder/Mantis events. Two regressions cover the archived JavaScript prototype.

The later [title/arrival update](arrival.md) deliberately keeps BOY native through the bridge and replaces him at the sword impact. Its separate checks cover the new title regions, native bridge parity, arrival dialogue/graphics, checkpoint replay and return to gameplay. The regional entry-view captures below predate that story change.

The earlier complete 512-slot catalog pass classified 394 nonblank views (392 documented maps plus unnamed slots 14 and 15), 116 forced-blank unused/alias slots, and two invalid entries (4 and 5). The later pass above reran every documented map with original arrival transitions and proper final-battle initialization.

The regional pass records renderer SHA-256 `eba2f05774bb4c490255b2ab2fb3f74197da6f229e571f6736df61edd293fb95`. Final changes to miniature effect origins and Barrel/Balloon/Engulf handling were validated by the subsequent status audit and unit checks. They do not change ordinary map entry rendering. Individual reports retain their actual renderer version rather than relabeling older captures.

## Area coverage

### Barrier follow-up — October 13, 2026

The barrier inventory reads all 512 map slots, including hidden pieces in 78
gameplay maps with conditional layouts. All 392 named maps now decode, including
rectangle dictionaries, implicit first-layer placements and cross-bank streams.
The two unnamed layouts are an empty map alias (14) and a blank debug room (15).

The runtime pass loads all **370 named gameplay maps**, reads both collision
layers, checks their outer bounds and compares them with the independent ROM
decoder using the live event flags. **1,961,104 map cells match**. Native trigger
metatiles (2,127) and traced boss-graphics scratch bytes (4,156) are counted
separately. There are no unexplained decoder differences or accepted positions
outside the tested bounds. Boss graphics genuinely overwrite unused tails of
some map buffers; those writes are traced at the original graphics routines,
not silently treated as geometry.

Controller regressions additionally exercise all **41 native floor-switch event
families in 43 scenarios** across
the Water, Earth, Ice, Fire, Shade and Grand Palaces, Witch Castle, Gold Tower,
Northtown Ruins and Mana Fortress. They use actual punch/beam input and check
native progress flags and return of player control. Separate checks cover the
Water Palace gap in both directions, hovering and checkpoint replay, landing at
a changed terrain height, the repeat Potos banishment and Luka's **NOTHING**
choice through the Water Seed reward.

This is structural coverage plus the listed controller scenarios. It does not
establish traversal of every route or every combination of story flags.

The follow-up tests **360 piece-visibility combinations across all 78 conditional
gameplay maps**: 2,452,278 further cells match the native grids, with 4,219 trigger
cells tracked separately and no accepted outer-edge positions. Eleven requested
states are adjusted by existing entry prerequisites; the report lists both the
requested and actual flags rather than claiming those unreachable states loaded.

The native destruction pipeline also clears **2,665 object placements**, including
1,713 solid obstacles, directly to their final native replacements in **63 scenarios across
61 maps**. This covers all named maps with C-prefix objects, Haunted Forest vines,
and the two conditional physical-object layouts. Only placed map cells count;
unused boss graphics buffers do not. Hostile actors are hidden in these isolated
scenery fixtures. Separate controller tests blast carved heads in all 11 maps
using them, operate both Gaia switches without their floor markers, and break the
Pandora/Northtown locks. Northtown additionally runs through its native rescue,
Vampire defeat and a return to the emptied room, including early entry with Goku
alone and Primm joining during the rescue.

Direct-flight controller checks traverse **58 whip lanes in both directions
(116 crossings) across 14 maps**, including both axes and the two return lanes
with missing posts. They check live steering, safe landing, companion arrival,
camera position, cleared native locks and an unchanged ROM. Separate punch and
Kamehameha scenarios cover the native axe/sword obstacle families in 11 maps,
both collision layers and multi-stage Fortress pillars. The Fortress test also
checks that a switch reached by the same wave cannot regrow destroyed scenery.

The event-barrier follow-up checks punches and beams against all three Pure Land
gates, including checkpoint replay of their native exits. The final gate is
verified through entry into the Mana Tree scene with Goku alone; this check does
not replay the entire subsequent conversation. Additional controller cases fly
over Pandora's castle guards without changing its story flags, enter the Dwarf
Village pit with no Magic Rope, and defeat Snapdragon on an early visit, cross
its rebuilt bridge and enter Dryad's room. Results are retained in
`.local/barrier-audit/event-barriers-final/`.

```sh
npm run audit:barriers
npm run audit:barrier-runtime
npm run audit:barrier-runtime -- --variants
npm run audit:barrier-destruction
# Recheck saved native grids after changing the independent ROM decoder:
npm run audit:barrier-runtime -- --compare-only
```

Reports remain in `.local/barrier-audit/`: `barriers.json`,
`runtime-summary.json`, `runtime/NNN.json`, `variants-summary.json`, `variants/`
and `destruction-summary.json`. The runtime tool accepts numeric
map IDs to repeat selected entries. A selected run's summary covers only those
entries; `--compare-only` without IDs compares all retained gameplay records.
The destruction tool accepts `--retry` to retain successful scenarios and repeat
only failures. These checks exercise geometry and object destruction, not a
complete controller playthrough of every story route.

### Original entry-view pass

Each count is a native entry viewport with opening plot flags and a full party. Multiple rooms, encounter variants, and scene maps have separate IDs.

| Area | Documented views captured |
| --- | ---: |
| Potos and opening | 14/14 |
| Water Palace and Undine | 12/12 |
| Pandora and Kippo | 24/24 |
| Gaia's Navel and Dwarf Village | 17/17 |
| Haunted Forest and Witch Castle | 18/18 |
| Earth Palace | 6/6 |
| Kilroy's ship | 4/4 |
| Upper Land and Wind Palace | 16/16 |
| Matango and Flammie's cave | 15/15 |
| Ice Country and Ice Palace | 31/31 |
| Kakkara and Sandship | 28/28 |
| Fire Palace | 14/14 |
| Empire towns and castle | 27/27 |
| Northtown Ruins | 12/12 |
| Gold City and Light Palace | 8/8 |
| Mandala and Jehk | 9/9 |
| Shade Palace | 11/11 |
| Moon Palace and ferry | 7/7 |
| Tasnica | 6/6 |
| Turtle Island and Lighthouse | 9/9 |
| Lost Continent, subway and Grand Palace | 34/34 |
| Pure Land and Mana Tree | 38/38 |
| Mana Fortress and final bosses | 10/10 |
| Credits map backgrounds | 17/17 |
| Opening lore map backgrounds and game-over stage | 5/5 |

## Repeat the audit

Start the local server with `npm run dev`, then use the supplied original US ROM:

```sh
npm run audit:seed
npm run audit:ui
npm run audit:menus
npm run audit:effects
npm run audit:status
npm run audit:areas
npm run audit:boss
npm run audit:report
```

`audit:seed` runs the real title/name/opening, then uses original name/add-party/heal event commands to initialize the diagnostic party. The resulting `.local/graphics-audit/party.json` contains machine state but no ROM bytes. It is a QA fixture, not a player checkpoint or a gameplay shortcut.

Area tools accept `--url`, `--rom`, `--state`, `--out`, and `--workers`. Default output is `.local/graphics-audit/areas/`. Numeric arguments select maps; `--all` includes all 512 table slots. Native door arrival behavior is the default; `--fixed-entry` is available for investigation. Other UI/effect/status tools accept `--url`, `--state`, and `--out`.

```sh
npm run audit:areas -- 128 131 139 287 310 350 230 248 253 488
npm run audit:areas -- --all
```

Local evidence:

| Path under `.local/graphics-audit/` | Contents |
| --- | --- |
| `areas/index.html` | Searchable map gallery and region contact sheets |
| `areas/records/` | Per-map load history, PPU/OAM/CGRAM state, comparison and renderer hash |
| `areas/summary.json` | Counts, errors and coverage limits |
| `areas/special-manabeast/index.html` | Native final-battle phase captures |
| `ui/index.html` | HUD and ordinary menu comparisons |
| `event-ui/index.html` | Shops, save and spell menus |
| `effects/index.html` | Charge, beam, punch and aura captures |
| `status/index.html` | Native conditions and transformations |

Generated maps, screenshots and checkpoints remain ignored under `.local/` and are not included in `dist/`.

## Method and fixes

The harness changes only its browser's cartridge copy and diagnostic WRAM. A scratch event at PC `$742B0` invokes the original door loader through temporary door 3. Referenced native doors are preferred over obsolete records. Every view starts from the same original-engine party fixture; original loaders supply all map pieces, graphics, palettes, NPCs, enemies and background settings. No map pixels are fabricated.

`presentation.mjs` restores one machine state for native and Goku renders. It compares the original PPU pixel buffers, allowing differences only in the intended player, portrait, hidden weapon and custom-effect regions. This protects other characters, scenery, UI, windows, color math and fades. An allowed region is not automatically correct: screenshots and targeted checks also inspect direction, complete crops, foreground occlusion, status colors and effect placement.

The audit led to fixes for status/Action Grid boy sprites, waterfall weapon and portrait palettes, original poison/stone/ghost palette changes, shared snowman/moogle art, native Barrel/Balloon/Engulf overlays, miniature effect origins, signed offscreen positions and wrapped OAM rows. Replaced native sprite cells still count toward original hardware sprite/sliver limits. Goku's attacks now use [decoded original spell art](native-effects.md).

Mana Beast map 253 needs native flag `$CF4E=8` and original event `$429`, including door `$BC`. A generic door into that map leaves its Mode 7 background uninitialized even with Goku disabled. The permanent harness uses the proper event; the earlier generic capture is not counted as final-battle graphics proof.

## Limits

Entry views do not cover every tile through traversal, every plot-dependent layout, all scripted poses, all attacks/spells, every boss phase or the complete ending/credits sequence. Intro and credits catalog entries establish their map backgrounds only; the separate browser regression plays the actual opening. Unused slots may be blank, duplicated or invalid by design. Gameplay completion and sequence-break progression beyond Potos remain separate work.

Factual map IDs/names are attributed in `tools/qa/map-names.json` to [Moppu/SecretOfManaRandomizer](https://github.com/Moppu/SecretOfManaRandomizer/blob/1404b7bd8552677399f24632c1e37cba37d491ef/SoMRandomizer/processing/common/SomVanillaValues.cs). Layout research is cross-checked against [Hack of Mana](https://hackofmana.com/maps/) and the supplied ROM.
