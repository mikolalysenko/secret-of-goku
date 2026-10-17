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
| Telepathy in world flight (bottom panel) and the Dragon Radar | Not yet |
| Scouter option and readouts | Not yet |
| Goku's STATUS page text | Not yet |
| Dialogue window placement | Not yet |
| R fast-forward | Not yet |

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
  `dragon-radar.js` at build time.

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
| `ui_hide` / `ui_unhide` | A16 = owner bit: while any bit is set the window stays hidden and paused (cinematics, ceiling escapes, endings). |
| `ui_set_inputs` | A16 = `!UII_*` bits to set, X16 = bits to clear: `CRISIS` (five-minute crisis: no first-flight banter), `FORTRESS_GONE` (drop flight advice), `ACTION_BEAM` (asides wait). |
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
`!PERSIST_UI`.

## Resources

| Resource | Use |
| --- | --- |
| Code/data `$AC:8000-` | `!CODE_UI` (about 5 KiB so far, incl. 2.5 KiB atlas and 6 KiB messages) |
| WRAM `$7E:7E40-$7E:7EFF` | `!RAM_UI`: state, current message, cooldowns, scratch (`module.asm`) |
| SRAM `$33:7C00-$33:7FFF` | staging: window rows (`+$000`), HDMA table (`+$200`), text (`+$240`), queue (`+$300`) |
| SRAM persistent | `!PERSIST_UI` = `!PERSIST_MISC+$80` (`$31:6380`, `$60` bytes) — **request** |
| VRAM | BG3 tiles `$110-$113`, `$122-$1BF` and rows 1–8 / 17–24 while the window shows |
| CGRAM | colours 9–11, 13–15 on lines 0–205 while the window shows (HDMA) |
| HDMA | channel 5 in the field while the window shows (`$2C` bit 5) |

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

## Core requests

- **Persistent range**: `!PERSIST_UI` (`$60` bytes) inside `!PERSIST_MISC`
  (`+$80`–`+$DF`), or another range; the module only needs the define.
- **HDMA channel 5 in the field**: the window enables it through `$2C` bit 5
  while it shows; `core_flush_auto` already skips channels enabled in `$2C`.
