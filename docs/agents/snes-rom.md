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
- Standard hardware only. The image is **32 Mbit HiROM** (`$FFD7=$0C`) with
  **32 KiB battery SRAM** (`$FFD8=$05`), the same mapping class as Chrono
  Trigger. If space runs out the next step is ExHiROM. SA-1 is a last resort
  for CPU budget; MSU-1 is not used (no real cartridge carries it).
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
counter is in code that did not move. `H.saveStable(name)` saves while the
field loop waits for NMI at `00:B079` (original code), so those checkpoints
stay valid across rebuilds. A test can start from one with
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
at any point after boot; the cartridge continues in that scene from the next
instruction (292 of 321 states import; ring-menu, file-select and title states
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
| WRAM `7E:D700–DDFF` | Module state blocks (`snes/src/core/ram.asm`); the only WRAM never touched in 321 replayed original-game states |
| SRAM `$30:6000–7FFF` | Original saves, untouched |
| SRAM `$31:6000–6FFF` | Persistent Goku state: per-slot sidecars and options |
| SRAM `$31:7000–$33:7FFF` | Volatile work buffers |

`snes/src/core/macros.asm` provides `%hijack(addr, target, len, module)`,
`%hijack_jsl`, `%patch` and `%origN` byte assertions. Every patch of original
bytes goes through them; `build.mjs` rejects overlapping patches.

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

Core services (`snes/src/core/core.asm`):

| Symbol | Contract |
| --- | --- |
| `modules_field_frame` | Called once per completed field frame after the game's logic, before the NMI handshake. P = M16/X16, DB = `$7E`, D = 0. Preserve DB/D, return with RTL. |
| `modules_field_nmi` | Called in vblank after the game's own uploads, only for frames the field loop completed. DB = `$80` (I/O visible). Keep it short. |
| `core_queue_vram` | Queue a VRAM upload for the next field vblank: A = VRAM word address, X = bytes, Y = source address, `core_scratch` byte = source bank. Carry set when the queue (8 entries) or the 3 KiB budget is full. |
| `!core_pad`, `!core_pad_new`, `!core_pad_rel` | Pad 1 held/pressed/released this field frame (`$4218` bit layout, `!PAD_*`). |
| `!core_frame` | Field frames since boot. |

## Engine anchors

| Address | Meaning |
| --- | --- |
| `C0:8008` | Reset continues with `JML $C10010`; hijacked by `core_boot` |
| `C0:B070` | Field main loop: `JSR $B08C` (frame logic), then waits for NMI on `$EC` bit 0 |
| `C0:B08C` | Field frame logic; calls the entity, map, menu and event subsystems |
| `C0:B073` | Hijacked by `core_field_frame` (replaced `SEP #$20 / LDA #$01`) |
| `$0100/$0104` | NMI/IRQ trampolines (`JML`). Field: `$00C0A8`/`$00C1CF`; world flight: `$0088CF`/`$008A4B`; file menu: `$C020A7`/`$7EA266` |
| `00:C0A8` | Field NMI: forced blank, palette DMA from `7E:2200` (`$200` bytes), OAM DMA from `7E:0400` (`$220` bytes, when `$EC & 9`), VRAM queues (`C692`), then `C1E7` |
| `00:C158` | Hijacked by `core_field_nmi` (replaced `SEP #$20 / LDA $2C / STA $420C`) |

## Analysis tools

- `snes/tools/trace.mjs` replays the private SnesJs states under `.local/` and
  writes instruction coverage with M/X flags (`dist/snes/analysis/coverage.bin`),
  JSR/JSL call edges (`calls.json`) and RAM-executed code (`ramcode.json`).
- `snes/tools/disasm.mjs C0:B070 40` disassembles with the traced flags; `?`
  marks bytes never executed in the trace.
- `snes/tools/wram-usage.mjs [--replay]` finds WRAM never used by the
  original game.
