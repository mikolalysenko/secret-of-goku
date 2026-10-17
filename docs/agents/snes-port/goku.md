# GOKU module: sprite, animation, palettes, portraits and forms

Spoilers. Part of the [SNES cartridge port](../snes-rom.md) ([plan](plan.md)).
Source: `snes/src/modules/goku/`, generator `snes/gen/goku.mjs`, tests
`snes/test/goku/`. Browser references: `engine/sprite-layer.js`,
`engine/goku-animation.js`, `engine/goku-animation-data.js`,
`engine/goku-native-actions.js`, `engine/native-oam.js`.

Once `!persist_goku_active` (SRAM `$31:6001`) is set, Goku replaces the boy
(actor 0, WRAM `$7E:E000`) on the field: every native action and facing,
walk/run cycles driven by distance, pushing, falls, knock-downs, ghost,
sleep, petrify, the pygmy miniature, water maps, the HUD portrait, the ring
marker, the Status / Action Grid / save-confirmation figure and the Super
Saiyan form with its transformation and reversion. GAME FILE slots holding a
GOKU record show his face. Snowman and moogle keep the shared native
sprites, as in the browser. The pose choice is a
port of `GokuAnimation.pose()` and is checked frame by frame against it
(see Tests).

## Resources

| Resource | Use |
| --- | --- |
| Code `$A1:8000-$A1:A32A` | `!CODE_GOKU` (about 8.8 KiB used) |
| Data `$E1:0000-$E1:68B9` | `!DATA_GOKU`: palettes, cell/variant tables, clips, the 51 native actions, sockets, lift tables |
| ROM `$F8-$FA` | 4,837 de-duplicated 8×8 4bpp tiles (151 KiB). `$FB` of the F8–FB reservation is still free |
| WRAM `$7E:D740-$7E:D7FF` | `!RAM_GOKU`, all $C0 bytes (fields below). Full-screen menus keep their state in the field's scratch `pal_work` (`$7E:D7D0-D7EF`); a menu session restarts whenever another mode ran in between (`!core_tick`) |
| VRAM | OBJ tiles `C0-C7`/`D0-D7` of name table 1 (word `$7C00/$7D00`, the boy's own cells; claimed as core region `!VRAM_FIELD_HERO` with owner `$01`), HUD portrait `E8/E9/F8/F9` (word `$7E80/$7F80`), ring marker `0A/0B/1A/1B` of name table 1 (word `$70A0/$71A0`, the boy's marker, rewritten when a ring opens). Full-screen menus: OBJ name table 2 (base `$4000` + `$1000`) tiles `C0-C9/D0-D9` and `E0-E7/F0-F7` (word `$5C00-$5F7F`): the idle and blink cells and the GAME FILE face. No menu screen uses that area (surveyed: Status, Action Grid, Controller/Window Edit, Weapon Skill, game select, GAME FILE load/save, save confirmation) and the field reloads it on return |
| CGRAM | The boy's OBJ palette through the game's buffer `$7E:0600`: palette 1, or palette 5 on water maps (the slot his body descriptor uses). Menus: OBJ palette 1 directly (the boy's colours there, `C8:1F00`) |
| OAM | The boy's body entries are replaced in place by up to four 16×16 OBJ (empty quadrants are skipped), or one for the miniature. Menus: the PPU's OAM directly, after the menu's own upload: the boy's eight figure entries moved off screen, entries 120-123 Goku's figure, 124-127 the GAME FILE faces (only when the menu leaves 120-127 unused) |
| DMA | In `modules_field_nmi`: channels 4-7 (one cell, 16 tiles = 512 B, only when it changed or on the game's 5-frame party refresh; skipped while `core_vblank_lines` < 6) and channel 7 for the HUD portrait (128 B). Ring set-up: channel 5 (128 B) right after the game's own marker uploads on that channel (measured: the whole set-up ends by scanline 249). Menus: channels 4-7 for the two cells (512 B each, one per frame, when 14+ lines remain) and 7 for the face (128 B), only when the menu runs no HDMA there (`$2C`) |
| SRAM | None written. Test builds only (`-DGOKU_TRACE`): a 27-byte trace at `$7E:7F00` |

Measured cost (Potos walk, `snes/test/goku/budget.lua`): frame logic ends
about 17 scanlines later at p90 (median +23), no added lag frames; the NMI
work ends by scanline 261 at worst. Main-thread work is ~3,600 CPU cycles a
frame (pose ~1,570, OAM ~990, palette ~730 with its no-change fast path).
Menus (`menu.lua`, `file.lua`): the hook starts at scanline ~229 and ends by
241-245 on average, 256 at worst (the two upload frames); it skips work
when fewer than 16 lines are left and re-checks before each PPU write.

## Original code patched

All with `%orig` byte assertions (`module.asm`):

| Address | Bytes | Replaced | Purpose |
| --- | --- | --- | --- |
| `C0:E5E0` | 12 | `REP #$20 / LDA $E083,X / AND #$000F / STA $02 / BEQ $E5DF` | Body OAM of every actor: actor 0 is drawn as Goku (`goku_body_hook`) |
| `C0:E553` | 5 | `LDA $E024,X / BPL $E565` | Attachment pass of every actor: for actor 0 under Goku, only the body is drawn (no weapon cells; status overlays and `$E060` render modes keep the native path) |
| `C0:E760` | 5 | `SEP #$20 / LDY #$FFF8` | Shadow: hidden with Goku (teleport's absent frames, `GOKU_CTL_HIDE`) |
| `C0:66BD` | 4 | `JSL $D0CDF9` | Ring set-up graphics: after the game's uploads, the boy's marker becomes Goku's head |
| `C1:95BC` | 4 | `LDA $7EE083` | Field NMI party-tile upload: the boy's part is skipped while Goku stands in; Goku's cell is re-sent on that cadence |
| `C1:E6C4` | 4 | `LDA $7EE180` | HUD portrait upload: the boy's face becomes Goku's (form-specific) |

Dispatch: `modules_field_frame` → `goku_frame` (palette, HUD form, end of
replacement), `modules_field_nmi` → `goku_nmi` (uploads), `modules_menu_frame`
→ `goku_menu_frame` (figure and GAME FILE faces).

## Data (`snes/gen/goku.mjs`)

- Sheets `assets/sprites/goku.png` and `ssj.png` (unchanged sources), the
  Super Saiyan lead jab built with `ManaSpriteLayer.leadPunchAtlas`'s
  algorithm, and the cells `sprite-layer.js` synthesises at runtime: push
  (4 beats × 4 rows × 2 forms), shuffled legs and hover legs for charge /
  ready / focus / transform / revert. Fusion dance, diagonal flight and the
  long-hair transformation cells (never shown by the mod) are left out.
  465 cells, each a 4×4 grid of tile indices, a quadrant mask, a palette id
  and a 16×16 miniature (every second pixel, as the browser scales it).
- Palettes: base and Super Saiyan get 15 colours each from a weighted
  Ward/Lloyd reduction of the sheet colours; the six gold/black transition
  frames (`goku 55-58`, `ssj 48-49`) get their own. Index 1 stays `$10A6`
  (every actor's shadow and the boy's outline) and 15 stays white (the
  ring cursor, bank-1 tile 08, also draws with palette 1); the other entries
  are ordered onto the boy's palette entries they resemble (Hungarian
  assignment), so anything else drawn with palette 1 degrades gracefully.
- Status transfer tables per palette: the boy index each colour follows
  (skin → 5-7, black → 1, otherwise nearest, as `tint()`), and the petrify
  shade.
- Animation tables from `goku-animation-data.js` (clips with ticks, sheet and
  row overrides) and `goku-native-actions.js` (51 entries: dispatch mode,
  clip, sequence pointers, fixed columns, phases by native frame).

## Runtime

- **Pose** (`pose.asm`): `goku_pose` runs inside the body hook with the
  native state of that frame and ports `pose()` branch by branch: kind
  cascade (requests, death, sleep, petrify, gap flight, reactions, native
  hurt, actions, altar run, hover, validated native action, falls, recover,
  jump, sword pull, ghost, walking), push detection (held direction into a
  wall for 6 frames, or the native actor-contact animations 8/17), age and
  distance bookkeeping (8.8 distance, steps of 6 and 16 px), clip tracking,
  native phases/fixed columns, the Super Saiyan knock-down fix-up and the
  shuffle/hover-leg variants.
- **OAM** (`body.asm`): anchor and shake decay exactly as `C0:E5F5`; the cell
  sits on the feet line (shadow height included) minus the extra lift; each
  16-line row takes priority and palette from the native part covering its
  centre line (so the lower body wades behind water/ledges like the boy's);
  `GOKU_CTL_AIRBORNE` forces priority 3 and palette 1.
- **Palette** (`palette.asm`): tracks the boy's slot per entry and rebuilds
  Goku's palette only when the game wrote something, the displayed cell's
  palette id or the petrify bit changed. Replacement ending restores the
  game's values.
- **Uploads** (`upload.asm`): see Resources. When replacement ends (snowman,
  moogle, `GOKU_CTL_SUPPRESS`, flag cleared) the boy's own tiles are
  re-uploaded from the game's `$0C00` table that very vblank.
- **Weapon cells** (`goku_attach_hook`): the attachment pass draws the
  boy's weapon cells (tiles 40-4E, palette 0/4) when a native weapon swing
  sets `$E02F`; with Goku standing in, actor 0 goes straight to the body
  (`C0:E8C6`), as `sprite-layer.js` hides the sword. Balloon, barrel,
  engulf and the ghost's reaper (`$E191 & $C5`) and special render modes
  (`$E060`) keep the native path. The skipped pass's one call of `C0:E5F5`
  (shake decay) is applied in the hook.
- **Ring marker** (`goku_ring_setup`): `D0:CDF9` uploads ten 2-tile
  graphics from `D2:C680` (cursor, the three party markers, ...) when a ring
  opens. Goku's 10×10 head (current form, at (+3,+2) in the 16×16 cell, as
  `injectPortrait` draws tile `0A`) then replaces the boy's marker, which
  draws with palette 1 and so with Goku's colours. The girl's and sprite's
  markers stay native.
- **Menus** (`menu.asm`, as `sprite-layer.js` menuBody and savePortrait):
  - Figure: the boy's 2×4 block of 8×8 cells (bank-0 tiles 30-37, palette 1,
    entries a multiple of 4, as in every menu) is found in the menu's OAM
    buffer (`7E:9C00`); while OBJ palette 1 holds the boy's colours (read
    back from CGRAM; all 15 compared the first time, 3 after) or Goku's,
    it becomes his 32×32 front idle cell at (x - 8, y) with the figure's
    priority, and the pose state advances as `pose({menu:true})` does
    (idle, row 0, the idle blink every 180 frames). Idle and blink cells
    both stay in VRAM, so the blink is an OAM tile change. Covers Status,
    the Action Grid (it follows the figure and its flashing) and the save
    confirmation; Primm's and Popoi's figures and palettes stay native.
    Palette 1 gets Goku's colours (nothing else in these screens uses it).
  - GAME FILE: when BG2's map shows the four file windows (left-edge tiles
    in column 7 of rows 2/8/14/20 and their mirror on rows 7/13/19/25, read
    back from VRAM) each slot whose record is valid (`$A215` bits, the
    backup copy at +$1000) with `$C5` at +0, `$3A` at +`$2BB` and the name
    `A1 A9 A5 AF 00` gets the base-form 16×16 face on rows 31+48·slot,
    columns 94-109, whether or not Goku is active (as the browser).
  - The menu only re-sends its OAM buffer when something changed, so the
    hook edits the PPU's OAM after that upload, every frame unless the
    previous edits still read back intact. The menu's buffer and logic never
    see Goku.

## API for other modules

Request fields live in `!RAM_GOKU` (`$7E:D740`); the defines in
`module.asm` are 16-bit addresses for code running with DB = `$7E` (the
module convention); use `$7E0000|<define>` with long addressing otherwise.
Writers own the timing: an action's age is advanced by the module that
started it, every frame, and Goku only reads it (as `pose()` reads
`mod.action.age`). Requests apply to the frame in which the body is drawn.

| Field | Address | Meaning |
| --- | --- | --- |
| `!goku_form` | `$D740` byte | 0 base, 1 Super Saiyan (cells, palette, HUD portrait) |
| `!goku_ctl` | `$D741` byte | `$01` SUPPRESS (keep the native boy, e.g. the ending's revived Randi), `$02` AIRBORNE (priority 3, no water colour math), `$04` HIDE (body and shadow), `$08` LOCALFLY (local flight active), `$10` HIDESHADOW |
| `!goku_act` | `$D742` byte | Action kind (below), 0 = none. Wins over native animations like `mod.action` |
| `!goku_act_facing` | `$D743` byte | 0 down, 1 right, 2 left, 3 up (`mod.facing` during the action) |
| `!goku_act_age` | `$D744` word | Frames since the action started |
| `!goku_act_arg` | `$D746` byte | Punch combo 0-2 / blast hand 0-1 in bits 0-1; bit 7 = Super Saiyan timing/art (`action.super`) |
| `!goku_act_dur` | `$D747` byte | Beam duration; transformation / reversion length (32 / 20 in the mod) |
| `!goku_mode` | `$D748` byte | Traversal / reaction kind (below), 0 = none |
| `!goku_mode_facing` | `$D749` byte | Facing for `DEFLECT` |
| `!goku_mode_age` | `$D74A` word | Age of the mode (ceiling escape, takeoff, landing) |
| `!goku_lift` | `$D74C` word | Extra lift in pixels (`mod.localLift`); with `LOCALFLY` or > 0 under field control it selects the hover pose |
| `!goku_cell_req` | `$D74E` word | Explicit cell (id + 1; 0 = none) for scenes: shown as is, lifted by `goku_lift` |

Action kinds (`!goku_act`): `$10` punch, `$11` charge, `$12` beam, `$13`
blast, `$14` teleport (ages 4-5 hide body and shadow), `$15` transform,
`$16` revert, `$17` ready (charge wind-up), `$18` focus (guard). `$19`
(air beam) has no field pose, as in the browser.

Mode kinds (`!goku_mode`): `$20` deflect, `$21` resist (reactions; ignored
while an action runs), `$23` gap flight (steady 12 px hover over the native
crossing arc), `$24` rescue dive, `$25` ceiling escape, `$26` takeoff, `$27`
landing (lifts and cells from the browser's curves), `$28` altar run.

Engine-to-API mapping, as in `difftest.mjs`: `mod.action={kind,age,facing,
combo,hand,super,duration}` → `goku_act*`; `hitRecovery.reaction` → mode
`$20/$21`; `gapFlight.active` → `$23`; `ceiling.pose.age` → `$25`;
`flightTransition={kind,age}` → `$26/$27`; `frieza.approachingAltar` →
`$28`; `localFlight` → `GOKU_CTL_LOCALFLY`; `localLift` → `goku_lift`.

Routines (JSL, any DB; preserve M/X unless noted):

| Routine | In / out |
| --- | --- |
| `goku_api_set_form` | A low byte = form. Equivalent to writing `!goku_form` |
| `goku_api_active` | C set while Goku stands in for the boy this frame |
| `goku_api_cell` | A = sheet (0 base, 1 ssj, 2 SSJ jab), X = column, Y = row → A16 = cell id or `$FFFF`. Exit M16/X16 |
| `goku_api_hand` | C set and A16 = x, X16 = y (screen) of the hand socket for poses that have one (charge, beam, blast cells of either form); C clear otherwise. Exit M16/X16 |

Example (combat, a punch): on the press, `!goku_act = $10`, `!goku_act_arg
= combo | (ssj ? $80 : 0)`, `!goku_act_facing = facing`, `!goku_act_age =
0`; each frame `INC !goku_act_age`; at the end `STZ !goku_act`. A
transformation: set `!goku_form = 1`, `!goku_act = $15`, `!goku_act_dur =
32`, advance the age 0..31, clear `!goku_act` (the cells and their
transition palettes follow the browser's `transform` clip).

## Tests

`node snes/test/goku/run.mjs` (also run by `snes/test/run-all.mjs`):

- `field`: Potos import, four facings, walk cycle (four cells, 6 px per
  step), push, idle; palette 1 = Goku's base palette; VRAM `C0-C7/D0-D7`
  compared byte for byte with the selected cell's tiles in ROM; boy restored
  when the flag is cleared; HUD tiles uploaded. Browser-mod reference frames
  for the same state and input (`jsref.mjs`: `sprite-layer.js` on the
  vendored core) with a pose comparison and side-by-side sheet
  (`compare.mjs`); poses differ only by a one-frame input latency between
  the two harnesses.
- `status`: poison and ghost tints (shadow colour kept), petrify in the
  native stone shades, moogle and snowman native, sleep/death prone poses,
  pygmy miniature (one OBJ, 16×16 tiles), barrel overlay kept, waterfall on
  palette 5 with the map's palette 1 untouched.
- `forms`: Super Saiyan cells, palette and HUD portrait (VRAM compared with
  ROM); the transformation and reversion step through their transition
  palettes frame by frame; teleport hides body and shadow; cell override.
- `actions`: all 51 native player animations (the game's own event opcode
  31, as `tools/qa/pose-audit.mjs`) in both forms from one savestate each,
  native inputs captured inside `goku_pose` (`GOKU_TRACE` build), replayed
  through `engine/goku-animation.js` by `difftest.mjs`:
  **12,740 / 12,740 frames choose the same sheet, column, row, variant,
  visibility and lift**.
- `api`: punch combos 0-2 in four facings, charge, beam, blast, teleport,
  ready, focus, transform, revert, deflect, resist, hover, gap flight,
  ceiling escape, takeoff and landing, both forms, replayed the same way:
  **1,716 / 1,716 frames agree**.
- `ring`: weapon ring opened from Potos (X); VRAM `0A/0B/1A/1B` equal the
  marker tiles in ROM for both forms, the girl's (`0C`) and sprite's (`0E`)
  markers equal `D2:C680`'s, and with the flag cleared the boy's marker is
  native again; screenshots once the marker OBJ has come to rest.
- `field` also swings the native weapon (`emulator-probe__weapon-test`, B):
  the boy draws his sword cells, Goku none.
- `menu`: Status (both forms) and the Action Grid (moved with the pad):
  the boy's entries hidden in OAM but kept in the buffer, Goku's four
  quadrants at (x - 8, y) with the figure's priority, idle and blink cells
  in VRAM byte for byte, palette 1 = the form's; the blink shows for 5
  frames; with Goku inactive OAM equals the menu buffer and palette 1 the
  boy's. Scanline at which the menu hook ends (max < 258).
- `file`: "Save your game?" in Potos with a GOKU record in slot 0: the face
  OBJ, its tiles and palette; still there with Goku inactive; gone for a
  record with another name; the save confirmation shows Goku, Primm and
  Popoi native. `load`: the title's GAME FILE (after a reset) shows the face.
- Browser-mod reference (`menuref.mjs`, same states and inputs through
  `sprite-layer.js`): Status (both forms), Action Grid and confirmation
  figures at the same position with the same sheet/cell, and the figures
  and the GAME FILE face align pixel for pixel (best shift 0,0); side by
  side in `.local/snes-test/goku/menu-compare.png`.
- `budget`: frame-logic end and NMI end with Goku off and on.

## Remaining work

- The new-game name entry shows the boy, as the browser does in play: Goku
  is not active yet then (`!persist_goku_active` is cleared by NEW GAME).
  The lab's name editor in the browser replaced him there; nothing here
  does.
- Menu figures assume entries 120-127 are free (true of every surveyed
  screen); a menu that used them would keep the boy.
- Other render paths for actor 0 (`C0:E57C` carried/attached, `C0:E6CF`
  multi-part, `C0:E88A`) are not hooked; none occurred in the 51 actions.
- World flight (Mode 7 Flammie replacement), the orbital/scene renderers
  and Tree-scene stand-in (map 236, species 138) belong to their modules;
  they can use `goku_api_cell` / `goku_cell_req` and the tile tables.
- `goku_api_hand` is not yet exercised by a client module.

## Core requests

- More WRAM would let the palette tracker keep a separate copy for palette 5
  (now it follows one slot at a time) and drop some shared scratch.
- The module would run ~25% faster under the core's `CORE_FASTROM` option
  ([engine notes](engine.md#fastrom)); worth enabling if the combined module
  budget gets tight.
- Test builds (`-DGOKU_TRACE`) write a 27-byte trace to `$7E:7F00`
  (`!RAM_SPARE`); release builds never touch it.
- `snes/test/goku/actions.lua` writes a test event into its own Mesen copy
  of the ROM (`$E1:7F00`); a sanctioned scratch-event area in the core's
  test build would be tidier.
- Harness: after a soft reset (`emu.reset()`), or after about four
  `H.importSnesJs` imports in one Mesen session, an imported state's sound
  CPU stops answering and the game waits in its driver handshake (`C3:05D3`,
  `$2140-$2143` read 0) the first time it plays a sound (e.g. answering
  "Save your game?"). `file.lua` and `load.lua` therefore run separately
  with one import / one reset each. Restoring the SPC fully on import (or a
  clean savestate load before each import) would remove the limit.
