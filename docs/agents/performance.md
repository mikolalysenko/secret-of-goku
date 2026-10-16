# Emulation performance and audio streaming

The browser player must emulate 60 SNES frames per second on phones; any shortfall starves the streamed music (see [Audio](#audio-streaming)). The SnesJs core in `vendor/snes/` therefore has exact fast paths, and the mod's per-pixel, per-instruction and per-read hooks declare where they act so those paths can skip them safely.

## Fast paths in the core

| Path | Where | Bypasses |
| --- | --- | --- |
| Idle-cycle batching | `Snes.skipIdleCycles` (`snes.js`) | Runs of master-cycle pairs where the CPU is mid-instruction (or paused at dots 536–575), or (H)DMA is only counting down, and no IRQ, render or line event is due. Plain instruction-start pairs run inline. The APU catch-up float is still accumulated by repeated addition so it stays bit-identical. |
| APU batching | `Snes.catchUpApu` | Countdown cycles between SPC instruction starts, DSP samples and timer ticks. |
| Scanline compositor | `Ppu.composeLine` (`pipu.js`) | Decodes each background tile once per line through planar-to-chunky tables, evaluates windows by span and resolves each screen slot by slot over only unresolved pixels, skipping layers with nothing at that priority. It has dedicated paths for paired hires decoding, inline Mode 7 texels and lines without colour math. Offset-per-tile modes 2/4/6 always use the original path. |
| Sprite evaluation | `Ppu.spriteSpans`, `forEachSpriteEntry` | Per-line 128-bit masks of the OAM entries that cover each line, rebuilt on any OAM/OBJSEL write, reset or checkpoint restore (`invalidateLineCaches`); evaluation still visits entries in native order with the same 32/34 limits. |
| Instruction gate | `Cpu.gatedCycle` (`cpu.js`) | Calls the `cpu.cycle` wrapper chain only at registered `(bank & 0x3f, PC)` breakpoints, or while a hook's `always()` test is true. |
| Cartridge read gate | `Cart.gatedRead` (`cart.js`) | Calls the `cart.read` wrapper chain only for addresses a registered hook marked. |
| Bus gates | `Snes.cpuRead` / `Snes.cpuWrite` | CPU reads and writes skip `snes.read`/`snes.write` wrappers except at their registered 16-bit offsets (DMA always uses the chain); hot work-RAM and ROM reads are inlined. |

Every path re-validates the actual wrapper chain. The compositor and both gates walk from the current method back to the core one; an unregistered wrapper anywhere in a chain keeps the original slow path for that method. A forgotten registration therefore costs speed, never correctness. Registries and switches live in closures, so checkpoints are unchanged.

`ppu.setLineComposer(false)`, `cpu.setBreakpointGate(false)`, `cart.setReadGate(false)` and `snes.setBusReadGate(false)` (reads and writes) force the slow paths for diagnosis.

## Registering hooks

- **Instruction hooks:** `cpu.registerBreakpoints(cpu.cycle, previous, [[bank63, pc], ...], always?)` immediately after `cpu.cycle=function(){...}`. List every instruction where the wrapper reads or changes state. Pass `always` (for example `()=>pending!==null`) when it must observe every instruction for a while.
- **Read hooks:** `cart.registerReadHook(cart.read, previous, m=>...)` after installing. Mark the addresses it may change with `m.hirom(lo, hi)` (offsets in banks `$C0–$FF`), `m.bank(b, lo, hi)` (bank `b` and its `$40/$80/$C0` mirrors) or `m.cpu(lo, hi)` (24-bit addresses).
- **Bus hooks:** `snes.registerBusReadHook` / `registerBusWriteHook(fn, previous, m=>m.offsets(lo, hi))` for `snes.read` / `snes.write` wrappers, marking the 16-bit offsets they act on for CPU accesses. A wrapper that tracks "the last read" should use `snes.readSerial()`, as `native-oam.js` does, since bypassed CPU reads still advance it.
- **Per-pixel PPU hooks** (`getColor`, `getWindowState`, `getPixelForLayer`, `getMathEnabled`, `getMode7Pixel`, `fetchTileInBuffer`): `ppu.registerLineHook(method, wrapper, previous, idle, plan?)`.
  - `idle(ppu, line)` must be true only when the wrapper returns exactly its predecessor's result for every pixel of that scanline.
  - An active hook may provide `plan(ppu, line, linePlan)`, which describes its effect in compositor terms and returns true, or returns false to keep the per-pixel path. The fields are:
    - `objColor`: replaces the colour of OBJ pixels (Goku's sprites).
    - `faceColor`: replaces the whole pixel as BG2 (save portraits).
    - `overlay`: a main-screen HUD layer for the radar, radio and scouter.
    - `bg1Color`: recolours BG1 pixels (world scars).
    - `windowSuppress` / `onWindowMasked`: the Mode 7 shadow window.

  A plan returns false if another hook already filled the same field.

## Verification

- `tests/emulator-fast-paths.test.mjs` runs from power-on with the tracked cartridge. It compares the compositor with per-pixel rendering, batched cycles with single-cycle stepping, and both gates with their ungated chains. It also covers the private emulator states in `.local/emulator-probe/` when present.
- For changes to hooks, also compare in the browser with every mod hook installed, toggling the three switches above. Compare pixels, WRAM and SPC RAM over a few hundred frames of each saved state.

Chrome on an Apple-silicon Mac, real game with every mod hook, median of five 600-frame runs (October 2026). "Skip" omits the picture as fast-forward does; 60 frames/s is real time.

| Scene | Before (picture) | Picture | Skip |
| --- | --- | --- | --- |
| Field (party) | 117 | 577–591 (≈9.8×) | 999–1036 (≈17×) |
| Combat | — | 553 (9.2×) | 1079–1144 (≈18×) |
| World flight (Mode 7) | 110 | 489 (8.1×) | 1179 (19.7×) |
| File select / naming (hires) | 88 | 464–467 (7.8×) | 1253–1303 (≈21×) |
| Title | 214 | 417 (6.9×) | 1172–1277 (≈20×) |

At 4× CPU throttling, a proxy for phones and CI runners, the 30 Hz title-music check went from 35 frames/s with 8 underruns to a steady 60 frames/s with none.

## Audio streaming

`engine/audio-output.js` streams each frame's raw 32 kHz DSP output to `engine/audio-worklet.js`, which resamples on the audio thread.
- **Buffering:** headroom starts at 50 ms and grows after underruns, up to 160 ms. Starving fades out instead of clicking.
- **Rate control:** a ±0.5% adjustment keeps the queue on target.
- **Effect timing:** ki effects are scheduled at each frame's estimated stream time.

Browsers without AudioWorklet fall back to per-frame buffer nodes. An interrupted iOS context resumes on the next gesture or when the page becomes visible again.

The phone check in `tests/browser/mobile-player.spec.mjs` reports the sustained emulation rate separately from stream gaps: a runner that cannot emulate 60 frames/s must starve any audio queue.
