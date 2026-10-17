# Debug module: in-cartridge scene select

Spoilers. Part of the [cartridge port](plan.md); build and harness in
[snes-rom.md](../snes-rom.md). The module is the cartridge's equivalent of
the browser's `?start=` test presets (`engine/quick-start.js`,
`engine/quick-boot.js`; [gameplay.md](../gameplay.md) lists them): a hidden
scene select that puts a fresh cartridge into each preset's starting state
natively, through the game's own NEW GAME, events and doors.

| Piece | Where |
| --- | --- |
| Generator | `snes/gen/debug.mjs` (runs `quick-start.js` against a recording mock) |
| Runtime | `snes/src/modules/debug/`: `module.asm` (state, helpers), `title.asm` (code, scene-select screen), `pilot.asm` (NEW GAME autopilot, boot redirect), `recipe.asm` (recipe interpreter) |
| Generated | `dist/snes/gen/debug/`: `presets.asm`, `defines.asm`, `hooks.asm`, `tiles.bin`, `bg1.bin`, `bg2.bin`, `catalog.json` |
| Tests | `snes/test/debug/` (`run.mjs`, `preset.lua`, `compare.mjs`) |

## Opening the scene select

On the title screen (the Squaresoft logo or the title itself, after power-on
or a reset), press on controller 1:

**Up, Up, Down, Down, Left, Right, Left, Right**

with at most two seconds between presses. Every other button leaves the
title (measured: Select, B, A, Y, X, L, R and Start all do), D-pad presses
never do, so the code cannot collide with starting the game; a wrong press
starts the code over. The ending's credits (the title program's alternate
entry) do not take the code.

The screen lists the 22 presets in two columns, with the browser's label of
the highlighted one at the bottom, drawn with the cartridge's 8×12 dialogue font
(`$D2:D600`, outlined like the native windows) and window frame tiles
(`$D2:D080`) over the native dithered window blue. The D-pad moves (Up/Down
wrap inside a column, Left/Right switch columns, held directions repeat),
**B, A or Start** starts the highlighted preset, **Y, X or Select** returns
to the title through the game's own quit path (`C1:0010`). The cursor starts
on the last preset started.

How: at each title entry (`modules_title_boot`, entry 0 only) the first four
bytes of the title program's IRQ handler `7E:A266` (`PHD / PHP / REP #$30`,
verified first) become `JML debug_title_irq`, which replays them, reads
`$4218` (stable there: the handler runs at line ~192, after the previous
vblank's auto-read) and resumes at `7E:A26A`. The completed code abandons
the title like a soft reset (stack, interrupts off, forced blank) and runs
the scene-select screen as its own program: Mode 0, interrupts off,
HVBJOY polling, VRAM changes in vblank, the pad read during active display.

## What a preset does

Choosing a preset arms an autopilot in SRAM work and leaves exactly as the
title program does after Start (`7E:AF1C`: the driver's music fade
`80 20 0F 0F`, then `JSL $C00000 / JSL $C00012 / JML $C00009` with the
title's registers, X = 0 matters for `C0:0E40`). From there everything is
native, as `quick-boot.js` drives the browser player:

1. **Game select and name editor** (core menu frames): Up until NEW GAME is
   selected (GAME FILE is the default when the battery holds saves), B to
   open the editor, then Start once the editor has settled; the title
   module's BOY prefill supplies the name (B types a letter if no prefill
   ran). The `title` preset stops here, in the editor, as the browser does.
2. **Boot script** (field frames, after `story_field_frame`): when the new
   game's first event (100, `C9:256D`) starts, its pointer, still on its first
   byte (the interpreter runs inside the next frame's logic), moves to the
   preset's boot script in this bank: `quick-boot.js`'s replacement of event
   400 with its JUMP 106 inlined into the replacement of 106 (flags, item
   `1E 47`, HP seed, the staging door, `05`). This is the native equivalent of
   the browser's temporary byte patch; nothing in ROM changes. The script
   plays the legend's world fly-over (`1D 7F`), door 0, then the staging
   door (3FC for late starts, 82 for the Sandship).
3. **Crown**: once the staging room is idle, slot 0 becomes GOKU with BOY in
   its tail (`crownGoku`); late starts also set `!persist_goku_active` and the
   title module's arrival bit (arrived, no crater), as the browser's
   `arrival.js` infers from CF10.
4. **Recipe** (field and world frames): the preset's steps, below.
5. **End**: the browser's capture point. The pad is the player's again.

While armed, the physical pad is hidden from the game (`!core_pad_mask`);
Start+Select+L+R aborts (status ABORTED) and the game soft-resets as usual.
Every title entry disarms. `sword` plays the whole original opening instead
of a boot script (as the browser's `sword` preset does), with prose advanced
until the waterfall is idle.

## Recipes from `quick-start.js`

`snes/gen/debug.mjs` imports `quick-start.js` and calls
`buildQuickStart(kind, …)` for every preset with a mock of the browser
runtime that records each step: RAM writes (`write8/16`, `ram.set/fill`,
`activateTwilight`'s writes), ROM patches and their borrowed-event requests,
`story.travel/request`, `pump(frames, buttons)`, module calls (`frieza`,
`challenge`, `quest`, `radio`, `powerIntro`, `worldKi` restores, `onEvent`,
`hit`, `options.superSaiyan`) and capture points. `bootLateGame`'s patched
event bytes are captured at its first `pump`. The mock answers the browser's
guards from the door table (`C8:3000`) and a small table of what each
polling loop waits for (`WAITS`: e.g. after door 3DF, map 418 and canAttack
with R held). That table is the only preset knowledge not read from
`quick-start.js`; the build fails if the browser code takes a step the
translator does not know.

| Op | Browser step | Native |
| --- | --- | --- |
| `FLAG`, `RAISE`, `POKE8/16`, `POKEN`, `FILL` | `write8/16` to `$CF00+n`, `activateTwilight` (never lowers), party/name writes | WRAM writes |
| `SENZU` | four Senzu Beans in the first item-5 or empty slot | same search on `$CC48` |
| `LEDGER` | `quest.restore` | story's persistent ledger fields, version 1 |
| `SCRIPT` | `fullParty`'s script through borrowed END event 98 | `story_api_request(98)`, then the started event's pointer moves to the script in ROM |
| `TRAVEL`, `REQUEST` | `story.travel/request` | the story module's APIs, retried until accepted, done once started |
| `UNTIL map species flags payload soft` | the polling loop or guard after a step | map, canAttack, live enemy (slot 3+), idle / window / event `$D0`, world flight, a SCENE hook; R-held loops advance prose (B on `$D0 = $83` waits unless the window holds a choice, `story_api_window_has_choice`) |
| `WAIT`, `PRESS` | `pump(n)`, `pump(n, buttons)` | frames, injected buttons (`!core_pad_inject`) |
| `TELEPORT` | `pullSword`'s `teleport.follow` to (500, 932) | the map reloads through its own door 82 with the entry tile moved (`$DE`, `$DF` after `C1:E76D`), so the native loader builds the camera there; then the exact pixel |
| `SWORD` | `pullSword`'s confirm loop | B every 152 frames, prose advanced, until CF10 = 1 and the field idle (the title module's arrival plays natively) |
| `OPENING` | the `sword` preset's fixed pumps and confirm loop | prose advanced until map 128 is idle with the sword untouched |
| `TAKEOFF`, `WORLDAIM` | `requestFlight`, the aerial aim writes | `core_event_request($0C00 | map)`, then `$FA/$FC/$F6/$F4/$F8` as the browser |
| `FORM`, `PERMANENT` | `options.superSaiyan`; `frieza.restore({permanent})` | `goku_api_set_form`; plus core's `!persist_ssj_lock` |
| `REFILL` | Sandship's companion HP refill | `$E382/$E582` = max |
| `HOOK kind payload` | every call into a module this branch does not have | the hook table below |
| `MARK`, `CANCEL`, `END` | intermediate `cache()`, `cancelInput`, the final capture | bookkeeping |

A wait that only another module's logic can satisfy is *soft*: after its
limit the recipe continues from the closest native state (counted in
`!dbg_soft`). Any other wait longer than 9,000 frames fails the preset.

## Hook API for other modules

A module finishes its part of a preset by defining, in its own files,

```
!DEBUG_PRESET_HOOK_<NAME> = <label>   ; NAME: TITLE, SWORD, ..., GOOD_ENDING, EXPLOSION
!DEBUG_PRESET_HOOK_ANY    = <label>   ; every preset
```

`snes/src/modules.asm` includes the generated `debug/hooks.asm` after every
module (before `story/hooks.asm`), so the table picks the labels up; missing
hooks are a stub that answers "done". The constants below are in the
generated `debug/defines.asm` (defines only), which a module includes itself
(`incsrc "debug/defines.asm"`) since modules come before debug in
`modules.asm`. Hooks are entered with `JSL`, P = M16/X16, DB = `$7E`, D = 0,
**A = kind**, **X = preset** (`!DEBUG_PRESET_*`), **Y = payload** (offset in
bank `!DEBUG_PAYLOAD_BANK`, `$AF`). Return with RTL,
carry clear when done, carry set to be called again next frame. The ANY hook
runs first. Kinds (`!DEBUG_HOOK_*`):

| Kind | When | Browser call | Owner |
| --- | --- | --- | --- |
| `CANCEL_COMBAT` 01 | start of a late or Sandship scene | `mod.cancelCombat()` | combat |
| `RADIO` 02 | same; Beast after its entrance | `radio.restore({firstFlight:true})` | radio / UI |
| `POWER_INTRO` 03 | same | `powerIntro.restore({flight, superShown})` | combat |
| `WORLD_KI` 04 | late scenes | `worldKi.restore()` | world |
| `FRIEZA` 05 | late scenes, again per Frieza preset | `frieza.restore({...})` | frieza |
| `FRIEZA_EVENT` 06 | battle, orbit, space | `frieza.onEvent(battle)` | frieza |
| `FRIEZA_PHASES` 07 | orbit, space | the phase handoffs to space | frieza / orbit |
| `CHALLENGE` 08 | endings | `challenge.restore({fed, started, won})` | frieza (Beast challenge) |
| `SCENE` 09 | polled by `UNTIL` waits with a module condition; carry set = not yet | e.g. `frieza.status.stage === 'palace'`, `challenge.status.started`, `ending.status.phase` | per preset |
| `FINISH` 0A | at the preset's capture point | — | per preset |
| `FORM` 0B | trial, thanatos, flight | `options.superSaiyan = v` | combat |

Example (a module restoring its state for every preset that asks):

```
!DEBUG_PRESET_HOOK_ANY = frieza_debug_preset
frieza_debug_preset:            ; A = kind, X = preset, Y = payload ($AF:Y)
	CMP.w #!DEBUG_HOOK_FRIEZA
	BNE .done
	PHB
	PEA.w !DEBUG_PAYLOAD_BANK*$0101
	PLB : PLB
	LDA $0000,Y                 ; entry count (byte), entries follow
	PLB
	...                         ; entries: key byte, value word
.done
	CLC                         ; done (SEC: call again next frame)
	RTL
```

Payloads are the browser's argument objects: a count byte, then entries of
key (`!DEBUG_KEY_*`: stage, tree, emperorKilled, stolen, stolenMask, eighth,
hinted, trialWon, permanent, fallen, scene, firstFlight, flight, superShown,
fed, started, won, event, phase, superSaiyan) and a value word (booleans
0/1, numbers, strings as `!DEBUG_VAL_*`: null, hunt, pursuit, complete,
defeated, palace, showdown, trial, open, explode). `catalog.json` lists each
preset's recipe and payloads in readable form.

## Results

`node snes/test/debug/run.mjs [preset …] [--jobs=8] [--battery=sram.bin]`
(also in `run-all`) starts every preset from power-on in Mesen, through the
code, the cursor and B as a player would, waits for the recipe to end, and
compares the end state with `.local/snes-ref/<preset>/` (`state.json`,
`frame-00000.png`, `frame-00240.png`): map, flags (`CFF8-CFFF` event scratch
reported apart), party (active, level, HP, position ±16), inventory, names,
Goku active, the ledger and the form. Differences owned by modules that are
not merged here are attributed (`GAPS` in `run.mjs`); the run fails on
anything else. `--battery` starts with native saves (GAME FILE becomes the
default) and checks that the save area is untouched; a full run does this
for `late` by itself when the private save fixture exists. The `controls`
case (`controls.lua`, also with `--controls`) checks that wrong or slow
D-pad sequences neither open the scene select nor leave the title, that Y
returns to a re-patched title whose Start reaches the game select with
nothing armed, and that Start+Select+L+R aborts a running preset into the
usual soft reset. The `hooks` case (also with `--hooks`) builds
`dist/snes/debug-test.sfc` with `-DDEBUG_TEST`, where the module itself
defines `!DEBUG_PRESET_HOOK_ANY` (logging kind, preset and payload to
`$31:7700`) and `_BEAST` (a SCENE hook answering "not yet" 30 times), runs
`late` and `beast`, and checks that every recipe HOOK reached the hook in
order with its kind, preset and payload address and that the SCENE answers
held the Beast's wait.

| Preset | Result on this branch | Missing (owner) |
| --- | --- | --- |
| title | full | — (editor with the BOY prefill) |
| sword | native | level 99, 999 HP (combat) |
| sandship | native | level 99 (combat) |
| late, intro, hexas, tree, fortress, buffy, slime, beast | native | level 99 (combat); Frieza/Beast visuals (frieza) |
| flight | native | level 99 (combat); Super Saiyan Goku in Mode 7, radar, early Fortress drawing, Flammie-free takeoff (world, flight) |
| frieza, battle, orbit, space | native | level 99 (combat); the Frieza scenes and fights themselves, the orbit phases (frieza, orbit) |
| bad-ending, explosion | native | level 99 (combat); ending pictures (ending) |
| rider | native, ends in room 419 | 4A3 request in room 419 (frieza, `frieza.js`) to reach Mech Rider III on map 237 |
| thanatos | native | Primm/Popoi staging in the Thanatos scene (frieza) |
| trial | native | the Time Chamber trial on event 3DB, borrowed party (vegeta) |
| good-ending | native, bad ending | FRIEZA_DEFEATED / FRIEZA_STOLEN / BEAST_* answers so 42F picks the good ending (frieza), then the ending (ending) |

"Native" means every difference from the browser's state is one of the
listed module gaps; the flags, party, inventory, names, ledger, form and
Goku state the debug module sets match the browser's. Pictures match at
frame 0 for late, intro, tree, sandship (100%), fortress, slime, buffy and
sword (95-99%); the others differ by module-owned visuals and timing.

## Resources and patches

| Kind | Use |
| --- | --- |
| ROM | `$AF:8000-C143` code, recipes, boot scripts, payloads, tiles and maps (16.7 KiB); `$AF:FF00` hook table |
| SRAM | `!SRAM_WORK_DEBUG` (`$31:7600`, `$3E` bytes used): armed state, recipe pointer, test results, title code, menu cursor |
| WRAM | none (the scene-select program uses the stack page only) |
| WRAM program patch | `7E:A266` (4 bytes, `JML debug_title_irq`), at title entry 0, after verifying the original bytes; no ROM hijacks |
| PPU | everything, but only while the scene-select screen runs (its own program) |
| Core hooks | `modules_title_boot`, `modules_menu_frame`, `modules_field_frame` (after `story_field_frame`), `modules_world_frame`, `modules_new_game` |
| Writes owned elsewhere | story's ledger fields (`LEDGER`), core's `!persist_goku_active` and `!persist_ssj_lock`, the title module's `!persist_title_arrival` bit 0, the goku form through its API |

## Requests

- **core**: a per-frame title hook (`modules_title_frame`, in the title
  program's IRQ before its frame work) would replace the WRAM patch at
  `7E:A266`. `engine.md` says `$A202` = 0 with saves and 3 without; measured,
  the game select is 0 with or without saves and the name editor is 3.
- **story**: `story_api_quest_restore` (A = held | collected << 8, X =
  wished) and `story_api_can_act` would replace debug's direct ledger writes
  and its copy of `story_compute_can_act`.
- **combat**: Goku's level 99 and weapon caps and 999 HP (every preset's
  remaining difference); the `CANCEL_COMBAT`, `POWER_INTRO`, `FORM` hooks.
- **frieza**: the `FRIEZA`, `FRIEZA_EVENT`, `FRIEZA_PHASES`, `CHALLENGE`
  hooks (payloads carry the browser's objects); the `SCENE` hook for the
  `hexas`/`rider` palace stage and `beast`'s challenge; the room-419 request
  of 4A3; the story queries the good ending needs.
- **radio / ui**: the `RADIO` hook (`firstFlight`).
- **world / flight**: the `WORLD_KI` hook; the flight preset's Mode 7 Goku,
  radar and Fortress, and the Flammie-free takeoff handoff.
- **vegeta**: the trial preset (event 3DB, borrowed party).
- **ending**: `SCENE` for the endings (`phase` open / explode) and the
  ending pictures.
