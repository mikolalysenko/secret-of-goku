# Standalone SNES cartridge (port in progress)

This page tracks the port of the browser mod (original cartridge + JavaScript
overlay) to a single `.sfc` that runs on real hardware and mainstream
emulators. Spoilers follow the rest of `docs/agents/`.

Work streams, hardware strategies and status: [snes-port/plan.md](snes-port/plan.md).

## Goal and constraints

- Everything the browser build adds — Goku's graphics and animation, powers,
  combat, flight, destruction, sequence breaks, dialogue edits, the Frieza and
  Vegeta fights, endings, music and sound — must run as 65816/SPC700 code and
  data inside the cartridge. No emulator hooks.
- Standard hardware only. The cartridge is **64 Mbit ExHiROM** (map mode
  `$35`, `$FFD7=$0D`; the mapping of Tales of Phantasia) with **32 KiB battery
  SRAM** (`$FFD8=$05`). bsnes, Mesen2, snes9x and the FXPak map ExHiROM save
  RAM at `$20–$3F/$A0–$BF:6000–7FFF` exactly like HiROM, so the original saves
  stay at `$30:6000`. (Only a board wired like Tales of Phantasia's
  SHVC-LJ3M, which decodes save RAM at `$80–$BF` alone, would need the
  accesses moved to `$B0–$B3`.) `node snes/build.mjs --hirom` still builds
  the 32 Mbit HiROM image while no data lives in the extended banks. SA-1 is
  a last resort for CPU budget; MSU-1 is not used (no real cartridge carries
  it).
- The original cartridge (`rom/secret-of-mana-us.sfc`, SHA-256 `4c1501…2d5f`)
  is read, verified and expanded at build time. It is never modified on disk.

## Build and run

```sh
brew install asar                    # assembler (asar 1.91)
node snes/build.mjs                  # -> dist/snes/secret-of-goku.sfc (+ .sym)
```

`dist/` is ignored by Git; the built cartridge contains the original game and
is never committed.

Headless checks use **Mesen2** in `--testRunner` mode (accurate, runs
unthrottled, Lua API for input, memory, screenshots and savestates). Unpack
the macOS/Linux release under `.local/tools/mesen/` (or set `MESEN`), launch
it once, then set `"AllowIoOsAccess": true` in Mesen2's `settings.json`
(`~/Library/Application Support/Mesen2/` on macOS).

```sh
node snes/test/mesen.mjs dist/snes/secret-of-goku.sfc my-test.lua .local/snes-test/out
node snes/test/run-all.mjs [module …]   # build, then every snes/test/<module>/run.mjs
```

`snes/test/perf/run.mjs` guards the CPU budget: each native scene is imported
once into the original cartridge and saved as a full Mesen state (so the APU
and DSP phase are identical), then both cartridges run 300 frames from it and
the scanline at which frame logic ends (`00:B077`/`00:8089`) and the lag-frame
count are compared. Baseline: the original game finishes field logic around
scanline 30–50 in quiet scenes and 90–125 in heavy ones (Sandship, Fortress,
world flight); the Mana Beast natively updates at 30 Hz. Comparing raw imports
instead of a shared savestate is misleading (DSP phase is not imported).

Each module provides `snes/test/<module>/run.mjs`, which reads the ROM path
from `SNES_ROM`, writes outputs under `.local/snes-test/<module>/` and exits
non-zero on failure (`snes/test/boot/` is the minimal example).

Mesen savestates load into later builds, but only if the saved program
counter is in code that did not move. `H.saveStable(name)` arms the save while
the field loop waits for NMI at `00:B079` (original code). Mesen applies it at
the following NMI entry, so a loaded checkpoint first executes `00:0100` and
returns into the wait loop. That holds for frames that finished their logic;
a checkpoint taken in a lag frame would return into whatever code the NMI
interrupted, so take checkpoints in quiet scenes. A test can start from one with
`runMesen({state})` or the CLI's fourth argument. In Mesen2's settings, Port 1
must be a `SnesController` for scripted input.

### Testing anywhere in the game with browser-mod states

The private SnesJs savestates under `.local/` (captured from the browser mod,
covering the whole game) can be imported into a Mesen run of the cartridge:

```sh
node snes/tools/snesjs-export-all.mjs      # -> .local/snes-import/<name>/ + catalog.json (map per state)
node snes/tools/snesjs-export.mjs <state.json> <outDir>   # a single state
```

The exporter advances the state in the vendored core until a main loop waits
for NMI (field `00:B079`, world flight `00:808D`), then writes WRAM, VRAM,
CGRAM, OAM, SRAM, APU RAM, DSP registers and the full CPU/PPU/DMA/IRQ/SPC
register file. In a Lua test, call `H.importSnesJs('<abs path to bundle dir>')`
at any point after boot (repeatedly if needed); the cartridge continues in
that scene. Memory and the CPU context are applied at the main CPU's next
instruction on the captured scanline, the APU RAM, DSP and SPC700 context at
the sound CPU's next instruction boundary (swapping it mid-instruction used to
desynchronise the sound handshake, stalling at `C3:05D2`/`C3:065C`). Idle text
pointers into the browser's story-bank layout are neutralised (292 of 321 states import; ring-menu, file-select and title states
use other loops). `node snes/tools/snesjs-render.mjs <state.json> <frames>
<out.png>` renders the same state in the original engine for reference. Mod-only state that the browser kept in JavaScript
(Dragon Ball ledger, forms, scene clocks) is not in these bundles — set the
module's own RAM/SRAM fields in the test. A field checkpoint to start from:
any `H.saveStable` output, e.g. one made from power-on by
`snes/test/checkpoints.mjs`.

### Browser-mod references for every preset

`node snes/tools/ref-capture.mjs [preset …] [--frames=0,60,240]` loads the
browser player's `?start=` presets in headless Chromium (Playwright, dev
server on port 5199) and writes `.local/snes-ref/<preset>/`: `state.json`
(full snapshot including the mod's JavaScript state under `goku`, the
authoritative reference for what each module's RAM/SRAM fields should hold),
screenshots at the given frame offsets, and a Mesen import bundle
`.local/snes-import/preset__<preset>/`. Presets: trial, late, intro, hexas,
rider, tree, fortress, buffy, slime, flight, frieza, thanatos, battle, orbit,
space, beast, good-ending, bad-ending, explosion, title, sword, sandship.

A test defines `function test() … end` using the helpers in
`snes/test/lua/harness.lua`: `H.wait(n)`, `H.hold('a up', n)`,
`H.tap('start')`, `H.waitFor(fn, n)`, `H.r8/r16/w8/w16` (CPU bus),
`H.wram/vram/cgram/oam/sram`, `H.shot(name)`, `H.save(name)` (Mesen
savestate), `H.saveStable(name)`, `H.load(path)`, `H.importSnesJs(dir)`,
`H.result(k, v)`, `H.log(...)`. Results land in
`<out>/results.json`.

## Layout

| Region | Use |
| --- | --- |
| ROM C0–DF | Original game; changed only through `%hijack`/`%patch` |
| ROM E0–EF | One code bank per module, assembled at the `$A0–$AF:8000` mirror so code sees low WRAM and I/O; lower halves `$Ex:0000–7FFF` hold that module's tables |
| ROM F0–F7 | Compiled story events and dialogue |
| ROM F8–FF | Packed graphics and samples |
| ROM `$40–$7D:0000–7FFF` | Extended data (xdata): DMA sources and bulk tables from `snes/gen` (second 4 MiB, slow banks) |
| WRAM `7E:D700–DDFF` | Module state blocks (`snes/src/core/ram.asm`) |
| WRAM `7E:6E40–6FFF` | Core per-frame staging (OAM, scratch, test mailbox) only: the game's BG tile decoder overwrites it during some map loads |
| SRAM `$31:7480–751F` | Core state that must survive map loads (`!CORE_SAFE`: event request, sound queue, pad latches, VRAM claims, DMA queue, OAM high-water marks, HDMAEN shadow; long addressing, cleared at power-on and title entry, revalidated each frame) |
| WRAM `7E:7E40–7FFF` | UI block, then spare |
| SRAM `$30:6000–7FFF` | Original saves, untouched |
| SRAM `$31:6000–747F` | Persistent Goku state: live block (`$31:6000`) and one sidecar per native slot |
| SRAM `$31:7480–$33:7FFF` | Volatile work buffers (`core/shared.asm`) |

The three WRAM ranges were never written in 321 replayed browser states, and
the core tests re-check that, and that the game never reads or writes the
added SRAM pages, from power-on through the opening and in seven imported
scenes. Map loads are the exception: the BG tile decoder (`C1:C5D1–C9FF`)
writes 4bpp tiles to `7E:2000+X`, up to `7E:77FF` (X ≤ `$5800`, measured over
the scene-select presets). Map 153's set reaches `7E:6E8E`, so `7E:6E40–6FFF`
may only hold data rebuilt every frame (core test `decode`). `7E:7E40–7FFF`
lies above the decoder's maximum.

### Extended data (ExHiROM)

The assembled image is still the 32 Mbit HiROM layout above; `build.mjs`
then widens it (`toExHiRom`). Banks `$C0–$FF` and their `$80–$BF` mirrors read
the first 4 MiB as before. Banks `$00–$3F:8000–FFFF` and `$40–$7D` read the
second 4 MiB, which starts as a byte copy of the first, so every HiROM mirror
(`$00:8000` code, vectors, hijacks, `$40–$7D` mirrors of `$C0–$FD`) returns
the same bytes. Tracing boot, the title, save/load and eight imported scenes
found no reads of `$40–$7D:0000–7FFF` by the original game, so those lower
halves (62 × 32 KiB = 1984 KiB) are free for extended data.

A generator registers a blob with the `xdata` function in its context:

```js
export function generate({rom,outDir,xdata}){
  xdata('ending_fortress_tiles',tileBytes);   // <= 32 KiB per blob
}
```

The build places blobs first-fit (largest first, from bank `$7D` down)
before assembling, and writes `dist/snes/gen/xdata.asm` with
`!XDATA_ENDING_FORTRESS_TILES` (a 24-bit address such as `$7D0000`) and
`!XDATA_ENDING_FORTRESS_TILES_SIZE`. Read them with DMA (source bank = the
address's bank byte) or long addressing. The second 4 MiB is reachable only
through slow banks (no FastROM; 8 master cycles per byte), so keep code and
tables read in hot loops in the first 4 MiB and move art, tilemaps,
palettes, samples and rarely read tables to xdata. A blob may not cross a
bank; split larger data into 32 KiB pieces.

`snes/src/core/macros.asm` provides `%hijack(addr, target, len, module)`,
`%hijack_jsl`, `%patch` and `%origN` byte assertions. Every patch of original
bytes goes through them; `build.mjs` rejects overlapping patches.

asar overwrites silently when two `org` blocks overlap, so `build.mjs` also
checks ROM ownership: every 16 KiB quarter of the added banks may hold labels
of one module only (`--strict` makes a shared quarter an error). Each module
asserts the end of its code and data blocks. When a module's code half is
full, it can be given a spare quarter of a mostly empty half
(`!CODE_QUARTER_*` in `core/layout.asm`: goku's, audio's and title's halves
end their code before `$C000`).

asar does not track `REP`/`SEP`: an immediate's width comes from how it is
written, so `CMP #8` in 16-bit code assembles as two bytes and desynchronises
the instruction stream. Write every accumulator/index immediate with an
explicit width (`CMP.w #8`, `LDA.b #$80`). The build warns about unsuffixed
immediates; `node snes/build.mjs --strict` turns the warning into an error.

## Modules and core API

Each work stream is a module under `snes/src/modules/<name>/` with its own
code bank, data bank and WRAM block (`core/layout.asm`, `core/ram.asm`).
`snes/src/modules.asm` includes every module and lists its calls in the core
dispatch tables. Data generators are `snes/gen/<name>.mjs` exporting
`generate({rom, repo, outDir, genDir})`; they run before assembly and write
into `dist/snes/gen/<name>/`, which is on asar's include path
(`incbin "<name>/file.bin"`, `incsrc "<name>/file.asm"`). Generators may
import the browser engine's JavaScript (authored tables, dialogue, story
compiler) so the cartridge reuses one source of truth.

Core services (`snes/src/core/`; engine facts behind them in
[snes-port/engine.md](snes-port/engine.md)). Callbacks are entered with
`JSL`, P = M16/X16, DB = `$7E`, D = 0; preserve DB/D and return with RTL.
Vblank callbacks get DB = `$80` instead. Add a `JSL` line before the RTL
of each hook in `snes/src/modules.asm`.

| Hook | When |
| --- | --- |
| `modules_field_frame` | Every completed field frame (towns, dungeons, dialogue, events, Mode 7 boss arenas) after the game logic and OAM build, before the NMI handshake (`00:B073`) |
| `modules_field_nmi` | Field vblank after the game's uploads, still force-blanked (`00:C158`); only for frames the loop completed. Afterwards the core writes the game's HDMAEN shadow `$2C` to `$420C`. If the vblank work ran into the next frame's display (scanline 0–224), only channels already running stay on: a channel switched on after HDMA started would run from stale tables. Newly requested channels then start with the next vblank (`!core_hdmaen` holds the value written; core test `hdmaen`) |
| `modules_world_frame` | World flight frame end (`00:8085`) |
| `modules_world_nmi` | World vblank after the game's uploads and HDMA setup (`00:8903`); not force-blanked |
| `modules_menu_frame` | Full-screen menus (game select, name entry, file list, status/equipment, save screen), once per frame in vblank after the menu's uploads (`C0:1E08`) |
| `modules_ring_frame` | Ring menus, once per frame in vblank (`C0:694F`); the field loop is paused |
| `modules_title_boot` | Each entry to the title/intro WRAM program (power-on, soft reset, quit; `!core_title_entry` 0, or 1 for the alternate entry used by the ending), after module WRAM was cleared; patch the program at `7E:8000+` here |
| `modules_save` / `modules_load` / `modules_new_game` | Before a GAME FILE is written; after one loaded (and core restored or cleared `!SRAM_LIVE`); after NEW GAME cleared `!SRAM_LIVE` |

| Service | Contract |
| --- | --- |
| `!core_pad`, `!core_pad_new`, `!core_pad_rel` | Physical pad 1 held/pressed/released, updated once per dispatched frame of any mode (`$4218` layout, `!PAD_*`) |
| `!core_pad_mask`, `!core_pad_inject` | Per-frame requests (cleared before each dispatch; OR your bits in): buttons hidden from / added to every game pad read (movement, rings, dialogue, menus, world steering). They apply from the game's next read (one frame later). A mask lasts at most two reads without a new request; injected buttons stay until one read consumes them, so a one-frame request reaches the menus' 4-frame poll. The title program is not filtered. `!core_pad_seen` = what the game got |
| `core_oam_add` | Sprite from `!core_spr_x/y` (signed), `!core_spr_tile` (OAM bytes 2–3), `!core_spr_size` (0/1), behind the native sprites: field right after them, world flight in slots 88–127. Carry set = no room. Offscreen sprites are dropped. Call from frame callbacks |
| `core_oam_add_front` | Field only: in front of all native sprites (max 16 per frame; the natives shift by a multiple of 4 slots) |
| `core_oam_hide`, `!core_oam_native` | Hide slot A; first slot after this frame's native sprites (inspect or edit natives below it) |
| `core_queue_vram` | A = VRAM word address, X = bytes, Y = source address, `!core_scratch` byte = source bank. Uploaded in this mode's vblank on a DMA channel no HDMA uses; a transfer that would not end by line 258 waits for the next vblank. Carry set when the queue (8) or the per-frame budget (3 KiB) is full |
| `core_vblank_lines` | A = scanlines left before line 258 (0 outside vblank), for modules' own vblank work |
| `core_vram_claim`, `core_vram_release` | A = region (`!VRAM_*`, `core/vram.asm`), X = owner id: exclusive use of a free OBJ VRAM region; returns Y = its VRAM word address. `!VRAM_SCENE_OBJ` (OBJ `$6C00`) and `!VRAM_SCENE_BG` (BG `$1C00`, maps 246/255) are scene-scoped: free only in the set pieces listed in `core/vram.asm`. The claimer releases them when its scene ends or the map changes |
| `core_scene_claim`, `core_scene_release`, `core_scene_owner` | A16 = owner id (`!SCENE_FRIEZA`/`_ORBIT`/`_ENDING`/`_VEGETA`/`_SANDSHIP`, `core/shared.asm`): exclusive use of the scene work area `!SRAM_WORK_SCENE` (`$32:6000–7FFF`). Claim before a scene first writes there, release when it ends. Carry set if another scene holds it. Cleared at power-on and title entry |
| `core_sound_queue` | A = command bytes 0–1, X = bytes 2–3 for the native driver (`$1E00`, `C3:0004`); one command sent per frame; carry set when 7 are pending |
| `core_event_request` | A = native event id (`C1:E76D`: script events, `$0800\|door`, `$0C00\|map` takeoff); started at the end of an idle field frame. `!core_event_req` pending, `!core_event_last` started |
| `!SRAM_LIVE`, `!PERSIST_*` | Live persistent block (`core/shared.asm`): written to the slot's sidecar after each native save; restored on load when the sidecar matches that slot's record (primary or backup); zeroed for NEW GAME (`!persist_version` = 1) and for saves without a valid sidecar (version 0). Every clear writes the `'GK'` magic (`!persist_magic`, `+$3E`); power-on clears a block without it (a new cartridge's battery RAM is noise), so modules that read it on the title see zeros, not noise |
| `!core_frame`, `!core_frame_world`, `!core_frame_menu`, `!core_frame_ring`, `!core_tick`, `!core_mode` | Frame counters per mode, any-mode tick, mode of the last dispatch (`!CORE_MODE_*`) |

Limits: 128 sprites, 32 per line, 34 eight-pixel slivers per line. Modules
can count on at least 64 OAM slots in the field and 40 in world flight. The
core costs about 4–5 scanlines per field frame (`snes/test/perf`).

### Checkpoints and core tests

`node snes/test/checkpoints.mjs [--potos]` plays the original opening from
power-on in Mesen with scripted input and writes stable savestates to the
main checkout's `.local/snes-checkpoints/` (shared by every worktree;
`--out=` or `SNES_CHECKPOINTS` override): `name-entry.mss` (empty name
editor of a NEW GAME), `waterfall.mss` (first controllable field scene),
and with `--potos` `potos.mss` (Potos, entered through the game's own door
event from the waterfall; opening flags only). Each is saved while a main
loop of original code waits for vblank, so it loads into later builds:
`runMesen({rom, state: '<dir>/waterfall.mss', test})`. `checkpoints.json`
records frame, map and position. For later scenes, start from a checkpoint
and call `H.importSnesJs`.

`node snes/test/core/run.mjs [test ...]` builds a `CORE_TEST` cartridge (a
client of every service driven through a WRAM mailbox, `snes/test/core/testmod.asm`)
and runs the core tests; `node snes/test/core/measure.mjs` reprints the
per-scene timing table in engine.md. `live` checks the power-on clear of
the live block, and `xdata` reads the 32-byte probe that
`snes/gen/core-xdata.mjs` places in the extended banks back through the
CPU bus, together with the ExHiROM mirrors, both header copies and the save
RAM banks.

## Engine anchors

| Address | Meaning |
| --- | --- |
| `C0:8008` | Reset continues with `JML $C10010`; hijacked by `core_boot` |
| `C0:B070` | Field main loop: `JSR $B08C` (frame logic), then waits for NMI on `$EC` bit 0 |
| `C0:B08C` | Field frame logic; calls the entity, map, menu and event subsystems |
| `C0:B073` | Hijacked by `core_field_frame` (replaced `SEP #$20 / LDA #$01`) |
| `$0100/$0104` | NMI/IRQ trampolines (`JML`). Field: `$00C0A8`/`$00C1CF`; world flight: `$0088CF`/`$008A4B`; menus: `$C020A7` (IRQ off); title program: RTI/`$7EA266`. Every mode: [engine.md](snes-port/engine.md) |
| `00:C0A8` | Field NMI: forced blank, palette DMA from `7E:0600` (or `7E:BE00`; `$200` bytes, when `$EC & 5`), OAM DMA from `7E:0800` (`$220` bytes, when `$EC & 9`), VRAM queues (`C692`), sprite cells (`C1:950D`), then `C1E7` |
| `00:C158` | Hijacked by `core_field_nmi` (replaced `SEP #$20 / LDA $2C / STA $420C`) |

## Analysis tools

- `snes/tools/trace.mjs` replays the private SnesJs states under `.local/` and
  writes instruction coverage with M/X flags (`dist/snes/analysis/coverage.bin`),
  JSR/JSL call edges (`calls.json`) and RAM-executed code (`ramcode.json`).
- `snes/tools/disasm.mjs C0:B070 40` disassembles with the traced flags; `?`
  marks bytes never executed in the trace.
- `snes/tools/wram-usage.mjs [--replay]` finds WRAM never used by the
  original game.
- `snes/tools/modprof.mjs [--rom=…] [scene …]` measures each module's cost
  in the field dispatch tables (`modules_field_frame`, `modules_field_nmi`), in
  scanlines per call, over 300 walking frames from the perf states. With all
  modules merged, the idle costs add up, so each module should early-out to
  about 0.3 lines per frame callback and 0.1 per vblank callback when its
  feature is not active.
- `SNES_LUA_PRELUDE=file.lua` (any runner using `snes/test/mesen.mjs`) runs an
  extra Lua file before every test, e.g. a tracer that logs to a file while
  existing suites play (it may only register callbacks at load).
