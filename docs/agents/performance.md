# Emulation performance and audio streaming

The browser player must emulate 60 SNES frames per second on phones; any shortfall starves the streamed music (see [Audio](#audio-streaming)). The SnesJs core in `vendor/snes/` therefore has exact fast paths, and the mod's per-pixel, per-instruction and per-read hooks declare where they act so those paths can skip them safely.

## Fast paths in the core

| Path | Where | Bypasses |
| --- | --- | --- |
| Idle-cycle batching | `Snes.skipIdleCycles` (`snes.js`) | Runs of master-cycle pairs where the CPU is mid-instruction (or paused at dots 536–575), or (H)DMA is only counting down, and no IRQ, render or line event is due. Plain instruction-start pairs run inline. The APU catch-up float is still accumulated by repeated addition so it stays bit-identical. |
| APU batching | `Snes.catchUpApu` | Countdown cycles between SPC instruction starts, DSP samples and timer ticks. |
| Scanline compositor | `Ppu.composeLine` (`pipu.js`) | Keeps plain background layers as fetched tiles (planar-to-chunky lanes) and extracts a pixel only while it is still unresolved, evaluates windows by span, and resolves each screen slot by slot over unresolved pixels, skipping layers with nothing at that priority. On lines without plans, posts or direct color it writes palette colors during resolution. It has dedicated paths for paired hires decoding, inline Mode 7 texels and lines without color math or clipping. Offset-per-tile modes 2/4/6 always use the original path. |
| Sprite evaluation | `Ppu.spriteSpans`, `forEachSpriteEntry` | Per-line 128-bit masks of the OAM entries that cover each line, rebuilt on any OAM/OBJSEL write, reset or checkpoint restore (`invalidateLineCaches`); evaluation still visits entries in native order with the same 32/34 limits. |
| Instruction gate | `Cpu.gatedCycle` (`cpu.js`) | Calls the `cpu.cycle` wrapper chain only at registered `(bank & 0x3f, PC)` breakpoints, or while a hook's `always()` test is true. |
| Cartridge read gate | `Cart.gatedRead` (`cart.js`) | Calls the `cart.read` wrapper chain only for addresses a registered hook marked. |
| Bus gates | `Snes.cpuRead` / `Snes.cpuWrite` | CPU reads and writes skip `snes.read`/`snes.write` wrappers except at their registered 16-bit offsets (DMA always uses the chain); hot work-RAM and ROM reads are inlined. |

Every path re-validates the actual wrapper chain. The compositor and both gates walk from the current method back to the core one; an unregistered wrapper anywhere in a chain keeps the original slow path for that method. A forgotten registration therefore costs speed, never correctness. Registries and switches live in closures, so checkpoints are unchanged.

`Ppu.setPixels` fills the 512×480 ImageData one 32-bit word per pixel (byte loop on big-endian hosts or other targets), and the player writes its charge meter and option boxes to the DOM only when they change.

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

  The fields are reset before each hook's plan. Every active hook's effect becomes one whole-line operation, and operations run innermost first, in wrapper-chain order. A plan may also push operations onto `plan.extra`, in the order its wrapper applies them. `paint` sets the colour from a per-x array, and optionally the layer and pixel. `channels` maps each 5-bit channel through a 32-entry table. `line` hands the hook the line's colour, layer and pixel arrays to rewrite itself, pixel by pixel exactly as its wrapper would. Each one is limited to a set of layers and, optionally, to the main (`mainOnly`) or sub (`subOnly`) screen. Setting `plan.skipPost` declares that these operations are the hook's whole effect. Goku's crater and pod at the waterfall, the Fortress deck aftermath, the Sandship wreck (`line`), Goku's status page, planet view, the ending, the Time Chamber, Frieza's arena scars, tree and emperor scenes, and the hit flash work this way. A hook with no plan forces its active lines through the per-pixel path, about five times slower; the crater once did this on every frame after the arrival, which phones could not sustain.

  A hook whose effect is a post-process of its predecessor's `[color, layer, pixel]` can pass `{post(ppu, sub, x, y, r)}`. The wrapper calls the same function, and the compositor runs it per pixel on lines the plan leaves to it. A plan may also set `disableMain`/`disableSub` layer bits for wrappers that turn a layer off around their inner call. `ppu.activeLineHooks(line)` lists the hooks that are active on a line.

## Verification

- `tests/emulator-fast-paths.test.mjs` runs from power-on with the tracked cartridge. It compares the compositor with per-pixel rendering, batched cycles with single-cycle stepping, and both gates with their ungated chains. It also covers the private emulator states in `.local/emulator-probe/` when present.
- For changes to hooks, also compare in the browser with every mod hook installed, toggling the three switches above. Compare pixels, WRAM and SPC RAM over a few hundred frames of each saved state.

Chrome on an Apple-silicon Mac, real game with every mod hook, median of five 600-frame runs on an idle machine (October 2026). "Picture" renders every frame; "skip" omits the picture, as fast-forward does. 60 frames/s is real time. "Before" is commit 2bcf010, from before this work.

| Scene | Before: picture / skip | After: picture / skip |
| --- | --- | --- |
| Field (party) | 123 / 340 | 599 (10.0×) / 1011 (16.8×) |
| Combat | 124 / 353 | 599 (10.0×) / 1157 (19.3×) |
| World flight (Mode 7) | 109 / 342 | 550 (9.2×) / 1214 (20.2×) |
| File select (hires) | 103 / 432 | 577 (9.6×) / 1289 (21.5×) |
| Title | 133 / 451 | 691 (11.5×) / 1307 (21.8×) |

Writing palette colors during slot resolution (last row of the table above) adds another 2–7% in a same-session comparison, putting file select above 10× as well. Story set pieces that once rendered per pixel through mod hooks now composite natively: for example, the Frieza battle went from 125 to about 486 frames/s and the Time Chamber from 102 to about 461.

Release 0.2.2 turned every hook effect into ordered line operations. It was measured against 0.2.1 in the same session, with the machine busy running other emulators, so absolute rates sit below the idle figures above:

| Scene | 0.2.1 | 0.2.2 |
| --- | --- | --- |
| Explosion cinematic | 286 frames/s | 583 frames/s |
| Orbit / space | 354 / 353 frames/s | 587 / 589 frames/s |
| Ending | 407 frames/s | 650 frames/s |
| Frieza battle | 445 frames/s | 669 frames/s |
| Time Chamber | 478 frames/s | 647 frames/s |
| File select | 466 frames/s | 625 frames/s |
| Field / world flight | 574 / 568 frames/s | 643 / 683 frames/s |
| Waterfall after the arrival (full player frame) | 10.7 ms | 2.3 ms |
| Status page / Sandship wreck / Fortress deck (player frame) | 11.2 / 8.8 / 7.5 ms | 2.0 / 2.2 / 2.0 ms |

The waterfall row is what phones felt. In the iOS Safari simulator, playing at the waterfall went from 10.0 to 2.4 ms per frame, and the sword and pod landing from 7.3 to 2.5 ms (peak 17 to 5 ms). `tests/browser/arrival.spec.mjs` fails if any scanline there falls back to the per-pixel path.

A bitset compositor (resolved pixels as 32-bit words) was tried and dropped. It gained only 2–3% in Chrome on translucent scenes and was slower in Node's V8.

At 4× CPU throttling, a proxy for phones and CI runners, the 30 Hz title-music check went from 35 frames/s with 8 underruns to a steady 60 frames/s with none. In real iOS Safari 26.5 (simulator), with an extra 20 ms of main-thread work per frame, file select dropped to 45 frames/s on the old build but holds 60 frames/s with zero underruns now. Holding R to fast-forward a cutscene is capped at 12×; it ran at about 3× on the old build under the same load and about 8× now.

## Audio streaming

`engine/audio-output.js` streams each frame's raw 32 kHz DSP output to `engine/audio-worklet.js`, which resamples on the audio thread.
- **Buffering:** headroom starts at 50 ms and grows after underruns, up to 160 ms. Starving fades out instead of clicking.
- **Rate control:** a ±0.5% adjustment keeps the queue on target.
- **Effect timing:** ki effects are scheduled at each frame's estimated stream time.

Browsers without AudioWorklet fall back to per-frame buffer nodes. An interrupted iOS context resumes on the next gesture or when the page becomes visible again.

The phone check in `tests/browser/mobile-player.spec.mjs` reports the sustained emulation rate separately from stream gaps: a runner that cannot emulate 60 frames/s must starve any audio queue.
