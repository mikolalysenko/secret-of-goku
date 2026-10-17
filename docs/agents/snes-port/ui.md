# UI module: telepathy, radar, scouter, status page, window placement, fast-forward

Spoilers. Part of the [SNES cartridge port](../snes-rom.md) ([plan](plan.md),
[engine notes](engine.md)). Source: `snes/src/modules/ui/`, generator
`snes/gen/ui.mjs`, tests `snes/test/ui/`. Browser references:
`engine/native-radio.js`, `power-intro.js`, `dragon-radar.js`,
`scouter.js`, `native-status.js`, `window-placement.js`,
`scene-fast-forward.js`.

## Status

| Feature | State |
| --- | --- |
| Telepathy window on the ground (King Kai / Luka, three lines, native font and window art) | Done: pixel-identical to `radioPixels()` |
| Message policy: queue, `interrupt`, `dismiss`, SSJ charge remarks (saved attempts and xorshift roll), barrier and ceiling reactions, first-flight banter, power intro | Done: frame-identical to `createNativeRadio` + `createPowerIntro` |
| Telepathy in world flight (bottom panel) and the Dragon Radar | Done: panel pixel-identical to the browser's; dial identical for the same sweep angle (64 steps) and blink phase; guide, distance and blip from `radarBearing` (the blip may round the other way within 0.05 px of a half pixel); 60 Hz kept |
| Scouter option and readouts | Not yet |
| Goku's STATUS page text | Not yet |
| Dialogue window placement | Done (`place.asm`): the scene's windows move above the HUD when the first one would cover more faces where it is, as `window-placement.js`; moved window pixel-identical to the native one, HUD untouched |
| R fast-forward | Auto-confirm done (`ff.asm`): R held in a scene hides R, pulses B on two of every eight frames for prose and stops at choices, as `scene-fast-forward.js`'s input filter; the browser's 12× emulation speed has no cartridge equivalent and instant text is not done |

## One source of truth: `snes/gen/ui.mjs`

The generator imports the browser engine and writes `dist/snes/gen/ui/`:

- **Messages.** Every telepathy line of the mod: the exported tables
  (`kaiWarnings`, `firstFlightMessages`, `treeBlastMessages`,
  `ceilingRemarks`, `barrierReactions`/`dungeonQuips`, `powerIntroMessages`,
  the Death Ball and crisis lines, `fortressDeflectionMessages`) and every
  inline `radio.say()` / `radio.interrupt()` / scouter `joke()` literal in
  `engine/*.js`, parsed from the source (string and template literals,
  arrays, `a ? b : c`, identifiers). Each keeps its call site's `kind` and
  `frames`. 99 messages today. Template parts become run-time parameters:
  `${count()}` (number) and `${dragonBallPalaces[index]}` /
  `${fresh[0][1]}` (palace / town name tables). The build fails if a line
  would need re-wrapping, exceeds 28 columns or three lines, or uses a glyph
  the font lacks; `catalog.json` lists everything with its source.
- **`defines.asm`** (include it before any module that calls the radio):
  `!UI_MSG_<NAME>` ids, `!UI_GROUP_<NAME>` (first id | count << 12, for the
  browser's arrays such as `FIRST_FLIGHT`, `CRISIS_FLIGHT`,
  `FRIEZA_FULL_POWER_FRIEZA_SEQ_0`), `!UI_KIND_<KIND>`,
  `!UI_BARRIER_<ID>` (one per `barrierReactions` key, e.g.
  `!UI_BARRIER_WITCH_CASTLE`, `!UI_BARRIER_DUNGEON_WALL_FIRE`).
- **`atlas.bin`.** The 79 glyphs `$80-$CE` of the cartridge font (PC
  `0x12D600`), each an 8×16 cell (two 2bpp tiles) drawn exactly as
  `radioPixels()` does: white glyph, black 3×3 outline, the window dither.
  The font only uses columns 1–6, so cells never touch and one atlas serves
  every message. (The native text engine uses a plus-shaped outline; the
  browser's radio uses the 3×3 one, which is what the cartridge shows.)
- **`window.bin`**: the window tiles from PC `0x12D080`.
- **`radar.asm`**: radar strings, palace takeoff entrances from the native
  takeoff table (PC `0x67A80`), names and hints, checked against
  `dragon-radar.js` at build time (and every composed panel line against
  the 28 columns); the world atlas map `ui_wtab16`; the dial's upload steps,
  per-angle sweep sprites (`ui_sweep_oam`) and colours; sin and sec tables.
- **`watlas.bin`, `dial.bin`**: the opaque world-band atlas and frame tiles;
  the dial's base cells and effect tiles.

## Telepathy window on the ground (BG3)

The browser draws a 240×64 surface over everything at (8, 8): the native
window's twin. The cartridge builds the same thing on BG3, where the native
dialogue window lives, while no native window is open:

- **Tilemap**: BG3 rows 1–8, columns 1–30 (VRAM `$5820`), the native layout:
  corner `$110`, edges `$111` (h-flipped right of column 15, v-flipped at the
  bottom), sides `$113`; text rows 2–7 hold two tiles per character.
  Uploaded from SRAM staging (`$33:7C00`, 512 bytes) through
  `core_queue_vram`.
- **Tiles**: the atlas goes into the native text tiles `$122-$1BF` (VRAM
  `$4910`, 2,528 bytes in two halves over two frames) and the window tiles
  into `$110-$113`. The native engine only writes those tiles while its own
  window is up, which hides the radio; the atlas is re-sent whenever the
  window comes back.
- **Colours**: palettes 2 (interior: black, `$2C00`, white) and 3 (frame:
  black, `$5250`, `$739C`) — the native window's colours. BG3 palettes 0–3
  are the HUD's in rows 25–27, so an HDMA on channel 5 (mode 3 to
  CGADD/CGDATA, enabled through `$2C` bit 5, which the field NMI writes to
  `HDMAEN`) loads the six colours on lines 0–5 and restores the game's
  values (from its CGRAM buffer `$7E:0600`, or `$BE00` while `$2A` ≠ 0) on
  lines 200–205, before the party gauges in row 26 need palettes 2/3. The
  table lives in SRAM staging; `ui_field_nmi` re-arms channel 5 every vblank
  after the game's sprite-cell DMA (channels 4–7) used it.
- **Placement**: kind `full-power-frieza` uses rows 17–24 (lines 136–199),
  just above the HUD; the browser put it at line 152, overlapping the HUD,
  which BG3 cannot do without disturbing the HUD's rows.
- **Position**: the box sits exactly on the native window (BG3 row 1 is
  output line 7). The browser's overlay is one line lower (line 8).
- **Visibility** (`ui_field_can_show`, ported from `canAttack` and
  `visible()`): field NMI vector, `$D0=0`, `$E4=$E5=1`, `$EC&$FE=0`,
  `$ED&$40=0`, `$2C&$0F=0` (native window HDMA), `$1D04&$60=0` (native
  window drawing), not a Mode 7 arena (`$29&4`), BG3 unscrolled
  (`$3E-$40`), Goku active and player-owned, no incapacitating status, no
  native hurt pose, no `ui_hide` request. Hidden frames pause the queue and
  timers, as in the browser.
- **Yielding**: when a native window starts uploading in the same frame the
  radio hides (`$1D04` bit 6), only the rows past the native upload length
  (`$1D1A`) are blanked, so the native window is never erased.

## Staged builds (field window and world band)

A new message or radar text is built over several frames, one step per
frame (`ui_bs_step`, `!UIB_*` in `module.asm`): expand the text into
`!ui_s_text` (3 × 28 glyph words, `(code − $80) × 2`) with the frame rows,
then the two glyph rows of each text line, then one upload of the 512-byte
map. The staged content is keyed (message id + 1 and parameter, or
`$8000 | radar key`) and mode-tagged (field window / world band) in SRAM,
so a message shown again is not rebuilt, and a radar update where only the
guide changed rebuilds line 1 alone. The worst step costs about 15
scanlines (a full message expansion); the old single-frame build cost 60–80.

## World flight: the bottom band and the Dragon Radar

The browser draws a 240×64 panel at line 152 (the telepathy box when a
message shows, else the radar text) and a 48×48 dial at (8, 8).

- **Band (BG3 in a Mode 7 frame).** Mode 7 has no BG3, so the band switches
  the bottom of the screen to Mode 1 for lines 152–215. The game's horizon
  IRQ (`C0:8A4B`, hijacked, 6 bytes) arms an IRQ at V=152 / H=160 when the
  band is shown; that handler waits for HBlank and writes `BGMODE $09`
  (BG3 priority) and `TM $14` right after the game's HDMA burst, then arms
  V=216, which restores `BGMODE 7` / `TM $13` and the game's horizon timer
  (a lag frame skips the game's own rewrite). BG3 points at core OBJ region
  B (claimed with `core_vram_claim`): map `$7000` (rows 19–26), an opaque
  world atlas from tile `$6C` (the glyphs any world text uses, dither holes
  filled black, `watlas.bin`), uploaded in two halves.
- **Band colours.** Palettes 2/3 (CGRAM 9–15) are the sky's colours above
  the horizon. HDMA channel 6 (indirect, mode 3 to CGADD/CGDATA, enabled
  through `$2C` bit 6, which the world NMI writes to `HDMAEN`) loads the
  band's colours on lines 145–151 and puts the sky's back on lines 217–223.
  The sky's colours are read back from CGRAM in vblank on the band's first
  frame and every 8th frame (world flight uploads no palette by DMA).
- **Dial (OBJ).** OBJ palette 3 (CGRAM 177–182, written in vblank once per
  claim and every 8th frame, and into the world's CGRAM buffers `$0600` and
  `$DE00`, which the game uploads whole when its palette changes) and core
  OBJ region C (tiles `$190-$1FF`): nine 16×16 base cells
  (ring, fill, grid, white centre and N mark) in columns 0–5 of tile rows
  0–5, then 46 deduplicated 8×8 effect tiles (blip, centre, sweep
  segments) in the free columns (`dial.bin`, 11 upload steps). The sweep is
  the browser's continuous `frame × 0.045` quantised to 64 angles; each
  angle is three 8×8 segment sprites (d 1–6, 7–12, 13–19), the first
  quadrant mirrored with OBJ flips (the generator checks every angle
  against a direct drawing). The blip is a 3×3 on an 8×8 sprite, blinking
  on `frame % 30 < 22`; the centre sprite is only added when the blip covers
  (24, 24), since the browser draws the centre last.
- **One run of slots.** The dial's 12–14 sprites are written straight into
  the OAM buffer at `!core_oam_cursor` (small sprites first, then the nine
  16×16 cells, so lower slots draw in front as in the browser), the cursor
  advanced past them and the high-table bits written per byte (four whole
  bytes when the run starts on a byte boundary, which it does when the UI
  is the first world-frame module). This replaces 16 `core_oam_add` calls
  (about 25 scanlines).
- **Natives in front of the dial.** Module sprites sit behind every native
  slot in world flight, but the browser's dial covers everything. The Y
  bytes of native slots are scanned (8-bit registers, 8 slots per pass, x
  pre-filtered): slots 64–83 (the compass letters at y = 16, the only
  natives seen in the dial's box in the flight scenes tested) every frame,
  slots 0–63 (world objects; the world module's Goku and effects) one half
  per frame. A native touching the dial's box is copied right after the
  dial's run and its own slot hidden with a marker (`X $FE, Y $E0`); the
  next frame gives back marked entries the game did not rewrite before
  scanning again (one in the half not scanned that frame stays hidden and
  is copied behind the dial again), so lag frames keep the dial in front.
- **Bearing** (`radarBearing`/`worldAim`): `worldDelta` on the 4096 wrap;
  across = dx cos h − dy sin h and along = −dx sin h − dy cos h in 1/8 px,
  each product |a|·|b|/2¹¹ rounded, with sin/cos from an exact 1.14 table
  (cached per heading) and the 8×8 multiplier through `D = $4200`
  (`WRMPYA` latched while `WRMPYB` takes each byte; `WRMPYA` is written
  with 8-bit stores, since a `$4203` write during a running multiplication
  is lost). Distance: `max × sec(atan(min/max))` from a 129-entry table
  (within 0.2% of `hypot`). Guide: `distance < 100` LAND HERE, |angle| <
  0.2 rad AHEAD (`|across| < along × 13/64`), > 2.7 rad TURN AROUND
  (`|across| < −along × 121/256`), else the side of across. Blip:
  `round(across/50)` below 900 px (hardware divider), else
  `round(18 × across/distance)` by a 5-bit restoring division; the far blip
  is recomputed when the heading turned and otherwise every 8 frames. The
  bearing runs at 30 Hz in two halves so neither costs a whole frame: even
  frames rotate that frame's state, odd frames turn it into distance, guide
  and blip (shown from the next frame); the inputs behind what is on screen
  are kept in SRAM (`!ui_s_gin`) for the test. A blip moves at most a
  fraction of a pixel per frame, so this is not visible; the guide can
  change up to two frames after the browser's. The target is re-selected
  every 16 frames (story state), the Fortress followed every frame.
- **Visibility**: Goku active, the world guards (`$FE & $C0`, `$8C`,
  `$E2 & 1`, `$D0`, `$EC & $7E`), no radio line, no charge
  (`ui_charge_tick`), no `ui_hide`, a target, and nothing the world module
  reports as busy (`ui_world_yield`, from its public state while
  `!w_flags & !WF_ACTIVE`: `!w_dock`, `!w_shot`, `!w_charging` — its local
  charge stand-in — and `!w_expl_age` / `!w_cut_age` ≠ `$FFFF`). The
  browser's `flight.docking`, `charging` and `worldKi` shot/explosion
  checks; the cutaway is included since it replaces the view. Because
  `ui_world_frame` runs before `world_world_frame`, it sees the world state
  of the previous frame: the dial shows on the first frame of a shot and
  comes back one frame after it ends. `!UIR_DOCKING|!UIR_SHOT` (radar state
  query) and `!UII_WORLD_YIELD` (`ui_set_inputs`) still hide it for other
  callers.

### World-flight frame budget

Production build (SlowROM) with the world, destroy, audio and debug
modules merged, holding left then right for 120 frames; lines at which
`modules_world_frame` returns (NMI at 225), p50 / p90 / max:

| Scene | Game logic done | Radar hidden | Radar shown |
| --- | --- | --- | --- |
| `preset__flight` | 123 / 140 / 148 | 140 / 157 / 161 | 170 / 187 / 198 |
| `frieza__core-free-flight` | 122 / 142 / 148 | 139 / 159 / 167 | 169 / 185 / 206 |
| `emulator-probe__flight-baseline` | 129 / 149 / 156 | 148 / 167 / 168 | 177 / 190 / 209 |

Every scene stays at 60 Hz; the worst frames leave 16–27 lines.
The UI's own world frame (`ui_world_frame`, measured per frame) costs
p50 24 / p90 32 / max 40 lines: dial run ~3, native scan ~5 plus ~1.3 per
native moved behind the dial (up to four compass letters), one bearing
half ~4–6, radar text steps ~5 when the guide changes, band and policy
~3. Core re-hides the dial's slots at the next `core_oam_begin`
(`core_oam_hide_range`, one Y store per slot since `eee1c93`; before that
it cost about 11 lines more and the radar-shown max was 206–219).

## Dialogue window placement (`place.asm`)

The native text engine always draws its window on BG3 rows 1–8 (built at
`$7E:9C00`, uploaded to `$5820`). As in `window-placement.js`, one decision
per scene: when a window is first present during an event (`$D0` ≠ 0), it
goes above the HUD if the field is in Mode 1, no menu is up (`$EC & $7E`),
the band above the HUD is free (only the radio's lower box ever draws
there in a field scene) and more active actors' faces (screen y − 24,
`$E020/$E022` per actor) lie on lines 0–71 than on 128–199; the decision
holds for every window of the scene until the interpreter has been idle
for 30 frames, and a menu puts the scene back. Present = a tile in
column 15 of the buffer's rows 1–8 (the window opens from and closes to
the middle of rows 4–5, sideways first; its top and bottom edges stay
while the text area is cleared). `$1D11` bit 0 (full-screen text from
`$9400`) and `$1D05` = 7 are not dialogue windows. The ending's `ui_hide`
bit (`!UI_HIDE_ENDING`, `$4000`) keeps windows native; Frieza's and
Vegeta's own actors are not counted yet (their modules would need to
report a screen position).

The tilemap, the text engine and its timing are untouched; while a window
is moved the game's two window HDMA channels are reprogrammed. The game
sets them up at `C0:C1E7` when a window opens (channel 0 CGADD from
`$05DB`: `7F 10 | 20 10 | 8F 01…0F`; channel 1 indirect CGDATA from
`$05D0`: `7F 0620 | 20 0620 | 8F DE02`, i.e. the HUD's BG3 colours 1–15 on
lines 159–173) and never uses them for DMA, so they keep whatever the UI
writes and need no per-frame vblank work:

- Channel 1: mode 2 to BG3VOFS, a 16-byte table in SRAM staging: the
  game's scroll (`$40`) + 128 on lines 7–70 (rows 17–24, blank, so the
  window disappears there) and 135–198 (rows 1–8 shown above the HUD), the
  game's scroll elsewhere.
- Channel 0: indirect mode 3 (CGADD, CGADD, CGDATA, CGDATA) from records in
  staging rebuilt each frame from the game's own sources (its dummy colour
  16 and HUD buffer): palette 0 on lines 191–193 (the window's bottom row
  only uses the frame's palette 1), palettes 1–3 on lines 199–207 (the
  HUD's top row only uses palette 0, its second starts at 207), dummies
  elsewhere. Rows 135–198 keep the window colours the NMI uploaded
  (`$0600`), as the browser keeps each moved line's source colours.

The field frame decides (`!ui_wp`, `!UIW_NOW` stored once per frame) and
builds the tables; `ui_place_nmi`, after the game's vblank work, takes the
channels (saving the game's table addresses, and again if `C0:C1E7`
reprogrammed them) or gives them back. While a window closes the game
clears `$2C` bits 0–1 every vblank (`C0:C0E1`); the NMI sets bit 1 again
(`!UIW_FORCED`) so the scroll keeps the closing window down, and sets both
bits when a window is open but the game skipped its setup because bit 1
was ours. A channel switched on in HDMAEN after the frame's HDMA started
runs from stale pointers, so no bit is set when the vblank's work already
reached line 256 (the core writes `$2C` to HDMAEN after FX): such a frame
shows the window at its native position (2 of 1,957 window frames in the
test scene, both vblanks that ended past line 261 anyway).

## R fast-forward (`ff.asm`)

Field frames: with R held (and L not), in a scene (`$D0` ≠ 0, `$E4` ≠ 0,
`$EC & $7E` = 0) R is hidden from the game (`!core_pad_mask`); while the
interpreter shows prose (`$D0` = `$81` text engine or `$83` button wait)
and its window holds no choice (`story_api_window_has_choice`, rescanned
when `$D1-$D3` moves), B is injected on two of every eight field frames
(`!core_pad_inject`), as `scene-fast-forward.js` pulses it. During
Frieza's input lock (story query `FRIEZA_INPUT_LOCKED`) R is hidden and
prose is pulsed without the choice check, as in the browser. Story flags
and choices are untouched: the native interpreter runs every event command.
Built out when the story module's reference copy is (`-DSTORY_FAST_FORWARD`).
Not done: the browser also runs these frames up to 12× faster, and the
cartridge has no instant-text mode yet (the native text engine's character
timing has not been traced).

## Foreign savestates

`!RAM_UI` is only valid if this cartridge set it up: `ui_title_boot` writes
`!ui_magic` (`$4B41`), and every frame callback and public API entry
checks it (plus `!ui_state`'s defined bits and the queue count) and clears
the block otherwise; the NMI callbacks and the world IRQ do nothing until
then. A savestate made by another build (no UI module or another layout)
used to crash in `ui_q_remove` (a random queue count copied through bank
`$34`'s low-RAM mirror over the stack); `snes/test/ui/run.mjs nocrash`
covers it. SRAM staging state (`!ui_s_bmode`, `!ui_s_bstep`,
`!ui_s_trig`) is cleared at the same time.

## API (JSL from any module; any M/X/DB; DB/D preserved)

| Routine | Contract |
| --- | --- |
| `ui_say` | A16 = `!UI_MSG_*` or `!UI_GROUP_*`, X16 = parameter (low byte number, high byte string index). Queues at the back. Carry set if Goku is not active or the queue (16) is full. |
| `ui_interrupt` | Same arguments; `interrupt()`: the new lines first, then the current one if kept, then the kept queue (flight, warning, power-intro, barrier, ceiling, core-crisis lines are dropped); marks first-flight banter given. |
| `ui_dismiss` | A16 = `!UI_KIND_*`: drop that kind, shown or queued. |
| `ui_barrier` | A16 = `!UI_BARRIER_*`, X16 = map. `defeatedBarrier()`: one saved key per barrier, remembered even when silent; 8 s shared cooldown; a blast hitting several barriers yields one remark; the remark is dropped if Goku leaves the map first. Carry clear = queued. |
| `ui_destroy_reaction` | A16 = destroy-module reaction id (`dist/snes/gen/destroy/reactions.json`), X16 = map; mapped by name to `ui_barrier` when that generator ran. |
| `ui_ceiling_escape` | A16 = map. `escapedCeiling()`: first exit per room (saved bitmap), three silent exits and two minutes between remarks, never queued behind other lines, the six remarks never repeat. |
| `ui_charge_tick` | Call every frame while Goku charges: A16 = `!UIC_SUPER` (Super Saiyan form) \| `!UIC_FULL` (full power, browser `charge >= 45`) \| `!UIC_BEAM` (a beam action runs). A frame without a call counts as released. |
| `ui_charge_release` | The charge ended (release, cancel, menu). |
| `ui_power_intro_super` | First Super Saiyan transformation: carry clear the first time (the three reveal lines are queued; linger in the gold pose). |
| `ui_power_intro_flight` | Call while Goku hovers in local flight; the first time he can act while hovering, the two banter lines are queued (carry clear). |
| `ui_restore_first_flight` | The browser's `radio.restore({firstFlight:true})` (Frieza's full-power phase): messages and counters back to defaults. |
| `ui_status` | → A16 = current message id + 1 (0 none), X16 = queued count, Y16 = 1 if visible this frame (Sandship `quiet()`). |
| `ui_hide` / `ui_unhide` | A16 = owner bit: while any bit is set the window stays hidden and paused (cinematics, ceiling escapes, endings). The endings' bit `$4000` (`!UI_HIDE_ENDING`) also keeps native dialogue windows in their native place. |
| `ui_set_inputs` | A16 = `!UII_*` bits to set, X16 = bits to clear: `CRISIS` (five-minute crisis: no first-flight banter), `FORTRESS_GONE` (drop flight advice), `ACTION_BEAM` (asides wait), `WORLD_YIELD` (world flight: docking, an aerial ki shot or explosion; the radar hides on the next frame). |
| `ui_hook_quest_collected` | Story hook `QUEST_COLLECTED` (A = palace 0–6): "DRAGON BALLS: n / 7". Bound as `!STORY_HOOK_QUEST_COLLECTED`. |

The SSJ remark policy: after 90 visible frames at full Super Saiyan power,
one decision per sustained charge (the latch includes silent outcomes);
the first three charges always warn, later ones win a 10% roll of the saved
xorshift32 state (seed `$6D2B79F5`, as the browser); a 300-frame cooldown;
a warning interrupts any non-warning line with ≥ 60 frames left by putting
it back at the front of the queue; the six warnings rotate.

Integration points (define before `ui/module.asm` is included):
`!UI_NAME_FN` (display name for `{n}` codes; story has
`story_api_display_name`), `!UI_QUEST_STATUS_FN` (`story_api_quest_status`),
`!UI_RADAR_STATE_FN` (→ A16 = held | collected << 8, X16 = `!UIR_*` flags:
wished, needs the Tree, stolen, Dryad's invitation, Frieza dormant, crisis,
Fortress gone, docking, shot; with the story module it reads
`story_api_quest_status` and the story query table, where the Frieza and
world modules fill their queries), `!PERSIST_UI`.

Ordering: `ui_world_frame` should stay the first `modules_world_frame`
call, so the dial's run takes the first module slots (in front of other
modules' sprites, as the browser's overlay is) and starts on a high-table
byte boundary.

## Resources

| Resource | Use |
| --- | --- |
| Code/data `$AC:8000-` | `!CODE_UI`: `$AC:8000-$E900` used (about 26 KiB: code, 6 KiB messages, 2.5 KiB field atlas, 2.2 KiB world atlas, 2.6 KiB dial tiles, radar tables); about 5.8 KiB left |
| WRAM `$7E:7E40-$7E:7EFF` | `!RAM_UI`: state, current message, cooldowns, band/radar state, scratch, `!ui_magic` (`module.asm`), fast-forward (`+$A6`), window placement (`+$AA`); `+$AE`–`+$B7` free |
| SRAM `$33:7C00-$33:7FFF` | staging: window/band rows (`+$000`), the radio's HDMA table, the moved window's colour records or moved natives (`+$200`), text words (`+$240`), radar trig cache (`+$2E8`), build state (`+$2F4`), radar key (`+$2FC`), bearing inputs (`+$2FE`, `+$308`), placement scroll table and the game's channel 0/1 tables (`+$312`, `+$322`), queue (`+$340`), band and sky HDMA colour blocks (`+$3C0`, `+$3DC`) |
| SRAM persistent | `!PERSIST_UI` = `!PERSIST_MISC+$80` (`$31:6380`, `$60` bytes) — **request** |
| VRAM (field) | BG3 tiles `$110-$113`, `$122-$1BF` and rows 1–8 / 17–24 while the window shows |
| VRAM (world flight) | core OBJ region B (`$7100-$78FF`: band map rows 19–26 and the world atlas, read as BG3) and region C (`$7900-$7FFF`: dial tiles), claimed while shown |
| CGRAM | field: colours 9–11, 13–15 on lines 0–205 while the window shows (HDMA); world: 9–15 on lines 145–223 while the band shows (HDMA), OBJ palette 3 colours 1–6 for the dial |
| HDMA | channel 5 in the field (`$2C` bit 5) for the radio; channels 0/1 (the game's window HDMA, reprogrammed, `$2C` bits 0–1) while a native window is moved; channel 6 in world flight (`$2C` bit 6) |
| IRQ | world flight: `C0:8A4B` hijacked (6 bytes, `%orig4`-checked); V=152 / V=216 at H=160 while the band shows |
| OAM (world flight) | 12–14 module slots for the dial (first module slots) plus a slot per native moved behind it (at most 8) |

Persistent layout (`!PERSIST_UI`): `+$00` flags (first flight, power intro
flight/super, scouter jokes), `+$01` warning rotation, `+$02` charge
attempts, `+$04` xorshift32 state, `+$08` barrier rotation, `+$09` ceiling
remarks used, `+$0A` ceiling exits, `+$0C` exits at the last remark, `+$10`
barrier keys (64 bits), `+$20` maps with a ceiling exit (512 bits).

## Tests (`node snes/test/ui/run.mjs [case …]`)

Builds a `UI_TEST` cartridge whose test client (`snes/test/ui/testmod.asm`)
stands in for the modules that will call the API, imports browser-mod
scenes and compares with the browser's own code:

| Case | Checked |
| --- | --- |
| `node` | every message's window, composed from the atlas, tilemap layout and window tiles in software, equals `radioPixels()` pixel for pixel |
| `window` | Mesen: King Kai's first warning drawn on `preset__late` equals `radioPixels()` on all 10,420 drawn pixels; tilemap entries; HUD colours 9–15 restored; rows blank and HDMA off after expiry; lower placement pixel-identical |
| `policy` | a 9,209-frame scripted session (queue order and expiry, nine SSJ charges, under-power and base-form charges, power intro during a charge, barriers with cooldown/coalescing/keys, ceiling escapes, `interrupt`, hidden frames, hover banter) replayed on the cartridge and through `createNativeRadio` + `createPowerIntro`: the current message is identical on every frame |
| `roll` | saved attempt count and xorshift state (attempts 48–52): the 10% rolls win on attempts 50 and 52 on the same frames, rotation continues from the saved index, the attempt count is saved |
| `nocrash` | production build from `.local/snes-checkpoints/after-arrival.mss` (a savestate of another build: stale UI WRAM) and from `preset__sword`, while Goku walks: a dispatched frame per video frame, no code running from low RAM, the UI block set up |
| `mul` | the rotation's multiplier routine against exact integer products (47 cases) |
| `ff` | from `potos.mss` (a NEW GAME, Goku made active), Luka's menu (`$134`): with R held the spear gift's prose is confirmed (`$CFC3` = 1) and the interpreter waits on the menu's choice (`story_api_window_has_choice`); without input the prose waits (`$D0` = `$83`) |
| `place` | `preset__late` (Goku under the window: lower) and `potos.mss` (Luka's window covers nobody: native), event `$134` through the story API, each against a reference run with placement off: the moved window's 10,124 opaque pixels equal the native window's, the HUD (lines 199–223) and lines 7–50 are unchanged; every frame with a window up in the lower scene (1,957, through pages, Luka's menu, its choice box and the closing windows) is checked at the display level (a BG3VOFS HDMA write on line 7) unless its vblank ended late; switching placement off gives the game's channel setup back and the window returns; after the scene the session closes, the channels and `$2C` are the game's; potos frame-identical |
| `radar` | `preset__flight` with two quest states, steering between samples: band panel pixels against `radioPixels()` of the browser's panel text, dial pixels against `dragon-radar.js` for the sampled sweep angle and blink phase, guide and blip against `radarBearing` (UI_TEST builds compute the far blip every frame); then the world module's state: a Y ki shot, an L+Y charge and the weak wave it releases hide the dial (but the first frame), which comes back after them |

## Core requests

- **Persistent range**: `!PERSIST_UI` (`$60` bytes) inside `!PERSIST_MISC`
  (`+$80`–`+$DF`), or another range; the module only needs the define.
- **HDMA channel 5 in the field**: the window enables it through `$2C` bit 5
  while it shows; `core_flush_auto` already skips channels enabled in `$2C`.
- **HDMA channel 6 in world flight**: the band's colours, through `$2C`
  bit 6 (the world NMI writes `$2C | $3F` to `HDMAEN`).
- **Done on main** (`eee1c93`): `core_oam_hide_range` writes only
  Y = `$E0` / X = `$FF`; the dial's direct run at `!core_oam_cursor`
  (advancing the cursor, respecting `!core_oam_limit` as `core_oam_add`
  does) is approved; `ui_world_frame` / `ui_world_nmi` are first in the
  world dispatch. The world module's busy states are read from its public
  RAM (`ui_world_yield`); its sprites in native slots 0..n-1 that touch the
  dial's box (8–55, 8–55) are moved behind the dial every other frame, as
  for any native.
- **Late field vblanks**: in heavy frames (a window opening or closing,
  sprite uploads) the field NMI's work runs up to line 261 and sometimes
  past it, so the core's `$2C` → HDMAEN write lands after the frame's HDMA
  started; every channel enabled then runs from stale pointers (garbage
  CGRAM / scroll writes for that frame, natively too when the window HDMA
  is on). Suggest the core checks the V counter before that write and
  writes 0 when it is already past vblank. The UI only sets `$2C` bits
  when the vblank is before line 256.
- **Optional FastROM**: the UI code runs in bank `$AC`; a FastROM build
  (`CORE_FASTROM`) would cut its world-flight cost by roughly a fifth.
