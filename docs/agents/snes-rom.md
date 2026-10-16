# Standalone SNES cartridge (port in progress)

This page tracks the port of the browser mod (original cartridge + JavaScript
overlay) to a single `.sfc` that runs on real hardware and mainstream
emulators. Spoilers follow the rest of `docs/agents/`.

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
```

A test defines `function test() … end` using the helpers in
`snes/test/lua/harness.lua`: `H.wait(n)`, `H.hold('a up', n)`,
`H.tap('start')`, `H.waitFor(fn, n)`, `H.r8/r16/w8/w16` (CPU bus),
`H.wram/vram/cgram/oam/sram`, `H.shot(name)`, `H.save(name)` (Mesen
savestate), `H.result(k, v)`, `H.log(...)`. Results land in
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

## Engine anchors

| Address | Meaning |
| --- | --- |
| `C0:8008` | Reset continues with `JML $C10010`; hijacked by `core_boot` |
| `C0:B070` | Field main loop: `JSR $B08C` (frame logic), then waits for NMI on `$EC` bit 0 |
| `C0:B08C` | Field frame logic; calls the entity, map, menu and event subsystems |

## Analysis tools

- `snes/tools/trace.mjs` replays the private SnesJs states under `.local/` and
  writes instruction coverage with M/X flags (`dist/snes/analysis/coverage.bin`),
  JSR/JSL call edges (`calls.json`) and RAM-executed code (`ramcode.json`).
- `snes/tools/disasm.mjs C0:B070 40` disassembles with the traced flags; `?`
  marks bytes never executed in the trace.
- `snes/tools/wram-usage.mjs [--replay]` finds WRAM never used by the
  original game.
