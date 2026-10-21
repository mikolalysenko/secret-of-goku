# Standalone SNES cartridge (port in progress)

This page tracks the port of the browser mod (original cartridge + JavaScript
overlay) to a single `.sfc` that runs on real hardware and mainstream
emulators. Spoilers follow the rest of `docs/agents/`.

Work streams, hardware strategies and status: [snes-port/plan.md](snes-port/plan.md).
Current Goku movement, audio and frame-budget review:
[gameplay performance](snes-port/gameplay-performance.md).

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

The public [SNES preview](https://github.com/mikolalysenko/secret-of-goku/releases/tag/snes-v0.1.0-preview.1)
distributes an IPS patch and player instructions. `node snes/release.mjs`
builds and verifies the patch-only ZIP; see [release packaging](releases.md#standalone-snes-patch).

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
| SRAM `$31:7480–751F` | Core state that must survive map loads (`!CORE_SAFE`: event request, sound queue, pad latches, VRAM claims, DMA queue, OAM high-water marks and priority, HDMAEN shadow; long addressing, cleared at power-on and title entry, revalidated each frame) |
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
halves (62 × 32 KiB = 1984 KiB) are free for extended data. When they are
full, the build continues in the upper halves of `$60–$7D` (`$60:8000–$7D:FFFF`,
30 × 32 KiB more, 2944 KiB in all). Those halves also appear at
`$20–$3D:8000–FFFF` and held only a copy of `$E0–$FD`'s upper halves, which
the cartridge reaches through its fast `$A0–$BD` mirrors. The probe
`snes/test/lua/xdata-probe.lua` (run as `SNES_LUA_PRELUDE` over the whole
suite) logs any CPU read or fetch there; none occurred on the build that
introduced them. The emulators test reads one of those bytes through both
mirrors on every core.

A generator registers a blob with the `xdata` function in its context:

```js
export function generate({rom,outDir,xdata}){
  xdata('ending_fortress_tiles',tileBytes);   // <= 32 KiB per blob
}
```

The build places blobs first-fit (largest first, from bank `$7D` down,
lower halves before upper ones) before assembling, and writes `dist/snes/gen/xdata.asm` with
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
| `modules_field_nmi` | Field vblank after the game's uploads, still force-blanked (`00/80:C158`); only for frames the loop completed. Afterwards the core writes the game's HDMAEN shadow `$2C` to `$420C`. If the vblank work ran into the next frame's display (scanline 0–224), only channels already running stay on: a channel switched on after HDMA started would run from stale tables. Newly requested channels then start with the next vblank (`!core_hdmaen` holds the value written; core test `hdmaen`) |
| `modules_world_frame` | World flight frame end (`00:8085`) |
| `modules_world_nmi` | World vblank after the game's uploads and HDMA setup (`00:8903`); not force-blanked |
| `modules_menu_frame` | Full-screen menus (game select, name entry, file list, status/equipment, save screen), once per frame in vblank after the menu's uploads (`C0:1E08`) |
| `modules_ring_frame` | Ring menus, once per frame in vblank (`C0:694F`); the field loop is paused |
| `modules_title_boot` | Each entry to the title/intro WRAM program (power-on, soft reset, quit; `!core_title_entry` 0, or 1 for the alternate entry used by the ending), after module WRAM was cleared; patch the program at `7E:8000+` here |
| `modules_save` / `modules_load` / `modules_new_game` | Before a GAME FILE is written; after one loaded (and core restored or cleared `!SRAM_LIVE`); after NEW GAME cleared `!SRAM_LIVE` |
| `modules_field_preupload` | Field vblank at the game's palette transfer (`C0:C0F0`, `core/cgram.asm`), before its palette and OAM transfers, on every vblank that sends the palette (lag vblanks with a window open too; check `!core_dma_ready` for a completed frame): copies frame code queued into the game's WRAM buffers (its OAM image). No HDMA runs here. M16/X16, DB = 0, D = 0 |
| `modules_cgram_upload` | Right after: handlers in order until one returns carry set, having sent the palette itself (the game's buffer through `core_cgram_native`, A16 = CGRAM byte offset, Y16 = bytes, plus its own ranges); carry clear for the game's transfer. Module colours sent here survive lag vblanks and need no frame-thread copy. M16/X16, DB = 0, D = 0 |

| Service | Contract |
| --- | --- |
| `!core_pad`, `!core_pad_new`, `!core_pad_rel` | Physical pad 1 held/pressed/released, updated once per dispatched frame of any mode (`$4218` layout, `!PAD_*`) |
| `!core_pad_mask`, `!core_pad_inject` | Per-frame requests (cleared before each dispatch; OR your bits in): buttons hidden from / added to every game pad read (movement, rings, dialogue, menus, world steering). They apply from the game's next read (one frame later). A mask lasts at most two reads without a new request; injected buttons stay until one read consumes them, so a one-frame request reaches the menus' 4-frame poll. The title program is not filtered. `!core_pad_seen` = what the game got |
| `core_oam_add` | Sprite from `!core_spr_x/y` (signed), `!core_spr_tile` (OAM bytes 2–3), `!core_spr_size` (0/1), behind the native sprites: field right after them, world flight in slots 88–127. Carry set = no room. Offscreen sprites are dropped. Call from frame callbacks |
| `core_oam_add_front` | Field only: in front of all native sprites (max 16 per frame; ground play uses PPU priority rotation, local flight retains physical insertion) |
| `core_oam_hide`, `!core_oam_native` | Hide slot A; first slot after this frame's native sprites (inspect or edit natives below it) |
| `core_queue_vram` | A = VRAM word address, X = bytes, Y = source address, `!core_scratch` byte = source bank. Uploaded in this mode's vblank on a DMA channel no HDMA uses; a transfer that would not end by line 258 waits for the next vblank. Carry set when the queue (8) or the per-frame budget (3 KiB) is full |
| `core_vblank_lines` | A = scanlines left before line 258 (0 outside vblank), for modules' own vblank work |
| `core_oam_meta`, `core_oam_meta_front` | A meta-sprite: `!core_spr_x/y` = anchor, `!core_spr_tile` = base tile word, `!core_meta_ptr` = long pointer to the pieces (4 bytes each: dx s8, dy s8, tile u8 added to the base, flags bit 0 = 32×32), A = count (1–16), X bit 0 = mirror (dx → −dx − width; set h-flip in the base word yourself). Each piece is culled like `core_spr_cull`. `_front` stages pieces in front of the natives while the 16 front slots last, then puts the rest behind. Carry set if a piece found no slot. Measured: about 250 cycles per call plus about 330 per piece in front, 420 behind |
| `core_vram_claim`, `core_vram_release` | A = region (`!VRAM_*`, `core/vram.asm`), X = owner id: exclusive use of a free OBJ VRAM region; returns Y = its VRAM word address. `!VRAM_SCENE_OBJ` (OBJ `$6C00`) and `!VRAM_SCENE_BG` (BG `$1C00`, maps 246/255) are scene-scoped: free only in the set pieces listed in `core/vram.asm`. The claimer releases them when its scene ends or the map changes |
| `core_scene_claim`, `core_scene_release`, `core_scene_owner` | A16 = owner id (`!SCENE_FRIEZA`/`_ORBIT`/`_ENDING`/`_VEGETA`/`_SANDSHIP`, `core/shared.asm`): exclusive use of the scene work area `!SRAM_WORK_SCENE` (`$32:6000–7FFF`). Claim before a scene first writes there, release when it ends. Carry set if another scene holds it. Cleared at power-on and title entry |
| `core_sound_queue` | A = command bytes 0–1, X = bytes 2–3 for the native driver (`$1E00`, `C3:0004`); one command sent per frame; carry set when 7 are pending |
| `core_event_request` | A = native event id (`C1:E76D`: script events, `$0800\|door`, `$0C00\|map` takeoff); started at the end of an idle field frame. `!core_event_req` pending, `!core_event_last` started |
| `!SRAM_LIVE`, `!PERSIST_*` | Live persistent block (`core/shared.asm`): written to the slot's sidecar after each native save; restored on load when the sidecar matches that slot's record (primary or backup); zeroed for NEW GAME (`!persist_version` = 1) and for saves without a valid sidecar (version 0). Every clear writes the `'GK'` magic (`!persist_magic`, `+$3E`); power-on clears a block without it (a new cartridge's battery RAM is noise), so modules that read it on the title see zeros, not noise |
| `!core_frame`, `!core_frame_world`, `!core_frame_menu`, `!core_frame_ring`, `!core_tick`, `!core_mode` | Frame counters per mode, any-mode tick, mode of the last dispatch (`!CORE_MODE_*`) |
| `!core_actor_hold` | Word (`$31:75F4`): a module whose picture hides every native actor (a full-screen set piece) writes `!core_frame` here in its field frame code; that frame's vblank skips the game's actor cell streaming (`C1:950D`, up to 12 lines in its busiest phase; `core_actor_cells`). The round robin resumes where it stopped; a stale value matches no later frame. A held vblank still runs the streamer's prologue (channels 4-7 set for VRAM word DMA, VMAIN `$80`), which the native dialogue upload at `C0:C1F0` relies on |

Real-hardware rule: no general-purpose DMA from frame code while any HDMA
channel is enabled; revision-1 S-CPUs can hang when HDMA runs during a
general DMA. Copy in vblank (module NMI work, the two hooks above), under
forced blank, or with the CPU. Core's predecoded-sheet copies check
`!core_hdmaen` and the `$2C` shadow. The ending tests fail on any watched
DMA that starts on a visible line with HDMA enabled.

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

## Second opinions: snes9x and bsnes

The cartridge also runs headless in the two most used cores, through their
libretro builds and a small frontend, `snes/tools/retro-host/retro-host.c`
(libretro.h vendored, MIT). It loads a core and a ROM and runs a JSON
script, or one JSON step per line on stdin with a one-line reply each:
hold/tap/wait, PNG shots (XRGB8888, RGB565, 0RGB1555; `back: n` takes one
of the last 8 frames), WRAM/SRAM/VRAM read, write, fill and dump, battery
RAM and WRAM preloaded with zeros, `ff`, seeded noise or a file, reset,
power cycle with battery RAM kept, savestates. No audio, no timing: one
`retro_run` per frame. bsnes' libretro core exposes no memory
(`retro_get_memory_data` returns NULL), so the host finds save RAM and the
128 KiB of WRAM in its serialized state with a calibration load and reads
and writes them there; bsnes keeps battery RAM in `<save dir>/<rom>.srm`.

```sh
make -C snes/tools/retro-host cores    # snes9x + bsnes (pinned commits) -> .local/tools/emu/
node snes/test/emulators/run.mjs       # also in run-all; skips (exit 0) without cores
node snes/test/emulators/run.mjs --presets[=late,flight]   # scene-select presets vs Mesen
node snes/test/emulators/run.mjs --power-on[=flight] --bisect  # uninitialised-RAM sweep
node snes/test/emulators/run.mjs --dma-watch[=scenario,late]   # DMA outside vblank (Mesen)
```

Sources go to `.local/tools/emu-src/`, cores and the host binary to
`.local/tools/emu/` (or `SNES_CORES`); neither is committed. Variants:
`snes9x` (defaults), `bsnes` (default fast PPU and DSP) and
`bsnes-accurate` (`bsnes_ppu_fast=OFF`, `bsnes_dsp_fast=OFF`); bsnes runs with
`bsnes_entropy=None` because its power-on randomisation is seeded by the
process clock, and the host fills WRAM with seeded noise instead.

The default run plays `snes/test/emulators/scenario.mjs` from power-on with
noise in WRAM and battery RAM: the reset vector reaches `core_boot` (the
live block gets its `GK` magic), the title program runs patched; the title
at frames 700 and 940; game select, NEW GAME and the BOY prefill; the
opening with text advanced until map 128 is controllable; field frames
advancing; a CPU-bus probe (the NMI trampoline's `JML` pointed at a routine
in `7E:6F40` for three idle field frames, the borrowed WRAM restored after)
that reads the xdata probe in bank `$7D`, the header through `$00` and
`$C0`, the `$FD` mirror, save RAM through `$30`, `$31`/`$B1` and
`$33`/`$B3`; the save point's event (`$05D8`) through `!core_event_req`
(`$31:7490`), into the first slot (`$30:6000` = `$C5`, sidecar `GK`); a
power cycle; GAME FILE, first slot, map 128 with the sidecar restored; then
a second process started from the battery image the first one left (for
bsnes its own `.srm`) loads the same save. Mesen plays the same
steps once per ROM (`mesen-ref.lua`, cached under
`.local/snes-test/emulators/mesen/`). Pictures are compared in SNES colours
(each PNG decoded with its emulator's output curve: bsnes' libretro palette
applies a 1.5 gamma to the lower half of each channel) over a ±6 (title) or
±2 frame window; outputs in `.local/snes-test/emulators/<variant>/`
(`diff-*.png`: Mesen, core, red where colours differ) and `summary.json`.

Mesen notes for any picture test: unthrottled, Mesen skips rendering frames
unless SNES `DisableFrameSkipping` is set, so `emu.takeScreenshot()` can be
several frames stale (in the name editor, whose forest scrolls every 4th
frame, Mesen's picture changed at frames 1109, 1115, 1118, 1121 instead of
every 4); `runMesen({exactFrames: true})` passes
`--snes.disableFrameSkipping=true`, about 20-25% slower. Even then its
screenshot at frame N equals the libretro cores' frame N-1 (game state and
input agree frame for frame: a press at 1100 reaches `!core_pad` at 1101 in
all three). Mesen's default `RamPowerOnState` is Random (WRAM and battery
RAM); `--snes.ramPowerOnState=AllZeros` pins it.

`--presets` starts scene-select presets on every core exactly as
`snes/test/debug/preset.lua` does (code, cursor, B), follows the recipe
trace, and compares the end state and the pictures at +0/+60/+240 with
Mesen running that Lua file; all emulators start from zeroed RAM there
(`presets.json`). `--power-on` runs each preset on snes9x from zeroed RAM
and again with noise or `ff` in WRAM and with noise in battery RAM; any
change in the trace, end state or pictures means something read memory it
never wrote, and `--bisect` narrows it to single bytes (`power-on.json`).
`--dma-watch` (Mesen only, zeroed power-on RAM) appends
`snes/test/emulators/dma-watch.lua` to the scenario and every preset: any
DMA started into VRAM, OAM or CGRAM while the screen is not force-blanked
and the scanline is visible (brightness 0 does not count), and any HDMA
into VRAM or OAM. Real hardware ignores those VRAM and OAM writes. Module
code writes the PPU's memories only through DMA, so a hit from banks
`$A0-$AF` fails the run (`dma-watch.json`, about 3 minutes for all).

### Results (cartridge of 2026-10-18, after the integration merge)

| | snes9x 1.63 (`1bcc369`) | bsnes 115 (`78474e5`) | bsnes accurate PPU/DSP |
| --- | --- | --- | --- |
| ExHiROM | core log `ExHiROM: 64 Mbit, SRAM: 256 Kbit` (`Map_ExtendedHiROMMap`); bus probe exact | bus probe exact (board `EXHIROM-RAM`: save RAM `20-3f,a0-bf:6000-7fff`) | same |
| Save RAM at `$30-$33`/`$B0-$B3` | yes | yes | yes |
| Title 700/940 vs Mesen | 100% | 100% | 100% |
| Name editor, waterfall, loaded game | 100%; field 96% exact, 100% within one level | 100% | 100% (editor 99.8%) |
| Opening to map 128 | frame 7134, as Mesen | same | same |
| Save, power cycle, load | slot header, sidecar, position (488,442 as Mesen) | same | same |
| 22 presets vs Mesen (`--presets`) | all done, end states equal, pictures 100% (within one level) | same | same |
| Speed (7,900 frames) | 2.7 s | 11.5 s | 26 s |

In the presets the recipes end within 0-3 frames of Mesen (hexas 4041/4042
against 4044, rider 5452 against 5455), with the same end state. At `intro`
+60 all three cores agree with each other and differ from Mesen by one
colour level in 35% of the pixels (a fade's brightness rounding).

Power-on sensitivity (`--power-on --bisect`, snes9x): 19 of 22 presets are
unaffected by noise or `$FF` in WRAM and noise in battery RAM. Four values
are read before anything writes them. The first three readers are
**original** code, which the unmodified cartridge runs the same way on
every console; the fourth is ours:

- **`7E:0126`, the moving Fortress's wander seed** (`flight`; before the
  merge also `rider`'s timing). `C2:B0D7` (bank `C2`, run during the
  legend's world fly-over) does `LDA $0126 / ADC #$37 / STA $0126` and
  places the Mana Fortress at the camera ± that seed (`$0128/$012A`);
  nothing writes `$0126` earlier, in the original cartridge or ours (zeros
  give `$0738/$0DC7`, `$FF` `$0737/$0DC8`). The world module aims at that
  position (`world/aim.asm`), and the debug module's `WORLDAIM` parks the
  camera south of it, so the `flight` preset's end position follows
  power-on WRAM. A preset that must be reproducible on hardware would have
  to set `$0126` itself (e.g. in `debug_arm`); zeroing it in `core_boot`
  would make the game's own Fortress placement fixed.
- **The map-edge words `7E:0A80/0A90/0AA0/0AB0`** (`space`, `battle`, with
  WRAM all `$FF`: one frame later). The camera placement at `C1:CBF3`
  (`C1:CC0D-CC33`) tests them before the map loader writes them on the first
  map; the original cartridge's opening does the same (`C1:CC1A`, frame
  1086).
- **The RNG seed is the save checksums.** The title program (`7E:ADB0`,
  decompressed from `C7:7C00`) XORs the four slots' checksums
  (`$30:6001/6401/6801/6C01`) and seeds its LFSR (`7E:C2D9`; `$7524` when
  the XOR is 0). A fresh cartridge's battery noise seeds it at random
  (before the merge it moved `rider`'s end by one frame).
- **Module code: destroy's effect record `$33:77F8`** (`battle`, with battery
  noise: one frame later). `!FX_SEQ` (`!SRAM_WORK_DESTROY+$7F8`, volatile)
  is zeroed only by destroy's first `dst_sync_map` after a reset
  (`destroy/entry.asm`, `!m_init` check). The effects library compares it
  every field frame (`fx/frame.asm` `fx_frame`: `LDA !FX_DREC_SEQ / CMP
  !fx_dseq`, and `fx_destroy_poll`), and `fx_ensure_init` adopts whatever it
  holds. With battery noise, fx sees a "new record" until the two agree and
  takes its full path, costing a frame of CPU in a busy scene; destroy
  clears `!FX_KIND` with it, so no effect is drawn. Fix (owners: destroy,
  fx): clear the effect record at title entry or power-on, not on the first
  map sync; or have `fx_title_boot` adopt `!FX_DREC_SEQ` into `!fx_dseq` and
  clear `!fx_busy`.

DMA timing (`--dma-watch`, scenario and all 22 presets): the only DMA into
the PPU's memories outside vblank and forced blank is the original menu's
last VRAM upload on the name editor's exit (`C0:25CC-25F6`, channel 7,
2 KiB at brightness 0 but not force-blanked, line 153; the original
cartridge does it at line 189). Hardware drops it; the next frames are
force-blanked and the field loads its own graphics. No module DMA or HDMA
lands outside vblank. HDMA colour gradients write CGRAM during H-blank, as
designed.

Other differences: snes9x rounds colour math (in translucent areas such as
the waterfall, green is one 5-bit level higher than in Mesen and bsnes), and
the Mesen frame skipping and one-frame screenshot offset above. With
Mesen's power-on RAM random, one `flight` run entered its first room one
frame later (two more did not; AllZeros, AllOnes and noise in audio RAM,
VRAM, OAM or CGRAM never did). No picture, state or timing difference
between the emulators traces to module or core code. Tools for further
digging: `snes/tools/disasm.mjs` for ROM code, a Mesen
`emu.addMemoryCallback` on the byte (`snesWorkRam` or `snesSaveRam`) for
the reader's PC; for read-before-write, track writes to the byte and report
reads before the first (DMA writes do not reach those callbacks).

## Engine anchors

| Address | Meaning |
| --- | --- |
| `C0:8008` | Reset continues with `JML $C10010`; hijacked by `core_boot` |
| `C0:B070` | Field main loop: `JSR $B08C` (frame logic), then waits for NMI on `$EC` bit 0 |
| `C0:B08C` | Field frame logic; calls the entity, map, menu and event subsystems |
| `C0:B073` | Hijacked by `core_field_frame` (replaced `SEP #$20 / LDA #$01`) |
| `$0100/$0104` | NMI/IRQ trampolines (`JML`). Field: `$00C0A8`/`$00C1CF`; world flight: `$0088CF`/`$008A4B`; menus: `$C020A7` (IRQ off); title program: RTI/`$7EA266`. Every mode: [engine.md](snes-port/engine.md) |
| `00:C0A8` | Field NMI: forced blank, palette DMA from `7E:0600` (or `7E:BE00`; `$200` bytes, when `$EC & 5`), OAM DMA from `7E:0800` (`$220` bytes, when `$EC & 9`), VRAM queues (`C692`), sprite cells (`C1:950D`), then `C1E7` |
| `00:C11E` | Core runs the same OAM DMA through FastROM, restores the completed field's OBJ priority, then resumes native NMI at `80:C13E`. NMIs that skip OAM stay in bank `$00`; timing callbacks watch both mirrors |
| `00/80:C158` | Hijacked by `core_field_nmi` (replaced `SEP #$20 / LDA $2C / STA $420C`) |

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
