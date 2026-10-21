# Goku gameplay review — October 21, 2026

The cartridge already had Goku's movement, combat, local/world flight,
teleport, story and boss modules. The main problems in this review were
integration bugs and CPU/vblank cost. The default build now favors resident
SNES audio and compact effects. It is substantially smoother, but crowded
combat is not yet guaranteed to run without missed video frames.

## Browser CPU baseline — October 21, 2026

`browser-baseline.mjs` runs the actual browser player in isolated headless
Chromium, with its ROM patches and JavaScript gameplay hooks. It shares the
13 input scripts with `gameplay/run.mjs` through `cases.mjs`. `--perf` uses
the six native perf scenes and their 300-frame alternating-left/right input.
`--repeat=5 --flight-corridor` uses the same controller-only corridor policy
as the long cartridge suite. Outputs stay under `.local/snes-test/`.

**Signal:** immediately before executing field NMI `$00:C0A8`, count a miss
when WRAM `$00EC & 1` is zero, exactly as `gameplay.lua` does. The world
counter uses `$00:88CF` and the same ready bit (the native handler tests it
at `$88FB`). Both mirrors are recognized. Instrumentation wraps/registers
CPU instruction breakpoints; it changes no emulated cycle count. Each row
requires one observed NMI per measured video frame. Visits to `$B077` /
`$8089` separately count completed updates. Browser wall time, presentation
skips and JavaScript execution time are not CPU misses.

**State and input:** resolve each bundle's `regs.json.source`, restore that
full browser snapshot in the unmodified vendored core, and repeat its exact
exporter advance (`steps`). Verify WRAM, VRAM, CGRAM, OAM, SRAM, ARAM and DSP
bytes against the bundle and verify CPU PC/bank and scanline/dot. Restore
that advanced emulator state into the browser with the source's JavaScript
state. The animation fixtures have powers disabled and the waterfall has
its arrival unset: gameplay explicitly enables base Goku/powers and marks
arrival complete, matching the cartridge's enabled gameplay fixture.
Finish the partial import frame, settle for 45 frames, then apply the same
setup and measured inputs through `mana.run(1, buttons)`. Perf's paired
bundle replay settles for 32 frames and retains source browser mod state.
`--cartridge=...` runs the same bundle/settle/setup/input recipe in Mesen;
`--cartridge-only` permits later comparisons without rerunning Chromium.
The ordinary perf suite separately retains its shared original-ROM Mesen
savestate. Its APU/CPU phase is not interchangeable with the browser replay;
the Beast's one-frame difference below is not a cartridge regression.

**Timing:** the browser is not overclocked. `vendor/snes/snes.js` charges
memory accesses individually: ROM in fast banks is 6 master clocks with
MEMSEL, slow ROM/WRAM 8, ordinary I/O 6 and controller I/O 12. Internal CPU
cycles cost 6; the CPU pauses for refresh, general DMA and HDMA. Host-side
idle-loop batching advances the corresponding clocks. The tool verifies
these access timings. However, every source snapshot has MEMSEL **off**;
the cartridge restores it each frame. Therefore both the actual browser
(`native`, SlowROM) and a normalized run (`fast`, MEMSEL enabled before each
frame) are measured. MEMSEL-off is saved machine state, not an emulator
clock error. The latter retains the browser's native code banks;
it does not copy the port's FastROM call-site rewrites or other optimizations.
The core is instruction-granular and models every NTSC line as 1,364 clocks
(it omits the odd frame's four-clock short line); it is not a cycle-exact
replacement for Mesen. No arbitrary scalar timing adjustment is applied.

Fresh integrated cartridge: `d80e1bfc3de26a41a1d15d9ef54e0457032e5ad81ac8b1bb7febb303c29200e3`.
Counts are misses / 240 video frames; the denominator is omitted below.

| Gameplay | Browser actual | Browser FastROM | Cartridge |
| --- | ---: | ---: | ---: |
| solo-punch | 0 | 0 | 0 |
| solo-ki | 0 | 0 | 0 |
| walk | 32 | 14 | 0 |
| punch | 6 | 4 | 0 |
| ki | 4 | 5 | 0 |
| fly | 24 | 13 | 1 |
| fly-ki | 24 | 18 | 2 |
| fly-punch | 25 | 19 | 1 |
| water-flight | 0 | 0 | 0 |
| teleport | 43 | 28 | 3 |
| charge | 25 | 11 | 16 |
| focus-grass | 1 | 1 | 0 |
| transform-grass | 1 | 1 | 0 |

| 1,200-frame gameplay | Browser actual | Browser FastROM | Cartridge |
| --- | ---: | ---: | ---: |
| punch | 11 | 7 | 0 |
| ki | 9 | 8 | 0 |
| fly-ki, corridor | 58 | 58 | 13 |
| fly-punch | 72 | 28 | 1 |
| teleport | 136 | 94 | 18 |
| charge | 35 | 15 | 22 |

| 300-frame perf scene | Browser actual | Browser FastROM | Paired cartridge | Perf suite cartridge |
| --- | ---: | ---: | ---: | ---: |
| sword | 0 | 0 | 0 | 0 |
| Sandship | 8 | 2 | 0 | 0 |
| battle | 0 | 0 | 0 | 0 |
| Beast | 31 | 31 | 30 | 30 |
| Fortress | 1 | 0 | 0 | 0 |
| world flight | 0 | 0 | 0 | 0 |

Only charging exceeds the normalized browser counts: **5 short / 7 long**.
Other cases already match or beat both browser measurements; they do not
need case-specific optimization. These are replay comparisons, not a claim
of identical actor trajectories after the first different missed input.
Browser actions, forms, travel, maps, flight and corridor turns are recorded
so an inactive power or exit cannot masquerade as a performance gain.

The perf runner now counts NMI-ready misses too. Its previous `frames`
result was overwritten by `H.finish` with total harness time, adding four
setup frames to every printed lag count. `videoFrames` now names the
measurement window, and missing NMI observations fail the check. The
six-scene baseline passes with original/cartridge misses **0/0, 8/0, 0/0,
30/30, 1/0, 0/0**. Cartridge p90 finish lines are **62, 113, 54, 174, 96,
112**. This corrects the counter, not the cartridge's runtime behavior.

Baseline validation: strict build; all 13 short and six long gameplay cases
pass behavior/hardware checks; all six perf cases pass; browser replays
complete all 13 short, six long and six perf scenes at both speeds. Paired
Mesen charge reproduces 16 misses and all six paired perf cases complete.
Charge's cartridge native actor span is **80.56 mean / 144.30 peak** lines;
movement **38.77 / 55.54**; FX **11.34 / 40.05**. The normalized charge gap
remains open. `modprof` idle FX is **0.13 frame /
0.12 NMI** lines; its combined contribution including the early palette
probe remains about 0.3 lines. No core or shipping module changes in this
measurement checkpoint.

### Outcome and final validation

Every cartridge case already meets or beats the **actual browser's** CPU
miss count, including charging (25 → 16 short, 35 → 22 long). No production
change is retained in this pass. The separate MEMSEL-on diagnostic still
has **5 short / 7 long** excess charge misses; this pass does **not** close
that stricter gap or establish zero-lag crowded gameplay.

An experimental FX shortcut validated the full flame's three resident cache
hints together and assigned their shared palette once. The existing aura
suite passed all **2,674 assembled comparisons**; a resident flame fell
from **1,160 to 968 CPU cycles**. However, charge stayed at **16/240 and
22/1,200 misses**, so the experiment was discarded. Its patch, ROM and
measurements remain private under `perf4/aura-*`. No audio behavior,
rendering, DMA guard, core code or module source changed in the final tree.

Of the 16 short charge misses, the interrupted PC was in FX nine times,
native/core code five times, destroy once and audio once. This is where the
deadline was crossed, not attribution of the entire overrun to that
routine: the preceding native actor/movement spans dominate many of these
updates. A follow-up pursuing the stricter target should profile that core
work with its owner; this task did not authorize core edits. Further module
optimizations remain possible, but none tested here reduced the miss count.

Final checks:

- Strict rebuild produces exactly the baseline SHA-256 above: shipping
  instructions, data, end states and CPU cost are unchanged.
- Gameplay: all **13 short and six long** cases pass behavior and hardware
  checks. Their nonzero timing counts remain as tabulated; the existing
  optional crowded-scene zero-miss checks are not made to pass or relaxed.
- Perf: **six scenes pass**, with the original/cartridge counts and p90
  lines above. Both cartridge runners and the browser now consume the
  same `PERF_SCRIPT`, rather than maintaining two copies of its loop.
- Emulators: **Snes9x, bsnes and bsnes-accurate pass**, including power-on,
  ExHiROM/SRAM, play, save/load and battery reload. bsnes's five compared
  pictures equal Mesen at the accepted frame offsets; bsnes-accurate's
  name picture is 99.80% exact, with its other pictures 100% exact.
- Debug: **21 FULL, two NATIVE, zero PARTIAL/FAILED** out of 23 runs,
  plus controls and both hook-contract cases pass. The accepted differences
  are trial's Vegeta flags/companions and Hexas capture timing, already
  enumerated by the runner; no new allowances were added.
- All four changed JavaScript tools pass `node --check`. The restored aura
  implementation also passes its five Node tests / 2,674 comparisons.

`modprof` sword/battle frame callbacks total **9.49 / 10.69** mean lines;
their NMI callbacks total **1.29 / 1.30**. These are unchanged baseline
measurements, not a claimed CPU saving. No new runtime code needs a rollback
define. No other module change is requested; the stricter charge target is
the remaining performance issue.

Reproduce (set `MESEN` as in `snes-rom.md`):

```sh
node snes/test/gameplay/browser-baseline.mjs --cartridge=dist/snes/secret-of-goku.sfc
node snes/test/gameplay/browser-baseline.mjs --perf --cartridge=dist/snes/secret-of-goku.sfc --out=.local/snes-test/browser-perf
node snes/test/gameplay/browser-baseline.mjs punch ki fly-ki fly-punch teleport charge --repeat=5 --flight-corridor --out=.local/snes-test/browser-long
```

Private results for this pass are under `.local/snes-test/perf4/`:
`browser-{short,long,perf}`, `baseline-{short,long}`, `paired-perf`,
`paired-charge`, `profile`, and the build/perf/modprof/debug/emulator logs. No recordings,
ROMs, snapshots or generated measurements are committed.

## Native actor follow-up — October 21, 2026

The core-authorized follow-up starts at `a949896`. Fresh matched runs give
short charge **17**, teleport **3**, ordinary flight **2**, flying ki **2**,
flying punches **1**, and zero in the other eight cases. Long charge is
**25**, teleport **18**, corridor flying ki **13**, flying punches **1**,
and ground punches/ki **0/0**. These are this tree's baseline, not the older
October 20 counts below.

Gameplay's new `--routine-profile` measures CPU cycles and master clocks
for the generic emitter, body path, actor callers, contact-distance prefix
and overlap helper. It groups completed spans by field update and records
which updates miss NMI. Counts at `$80:E640` now distinguish invocations
from visits made by its internal loop. `--record-native` also samples CPU
state plus low/actor WRAM for assembled replay; all recordings remain in
the selected `GAMEPLAY_OUT`, under this worktree's `.local/snes-test/`.
Master-clock and CPU spans include interrupts and nested calls; do not add
parent and child spans together.

The initial short charge profile measures native actor construction at
**81.09 mean / 158.91 peak** scanlines and movement/contact at
**39.30 / 56.62**. The generic emitter has **1,222 calls**, costing
**7.54 lines per completed field update**; the contact-distance prefix has
**2,007 calls**, costing **7.75 lines per update**. The full contact calls
cost **13.80 lines per update**. The browser's `engine/sprite-layer.js`
composes Goku/effects in JavaScript around the original engine's sprites;
it does not add equivalent 65816 descriptor or contact calls for those
effects. The cartridge has to fit that presentation into the native frame.

Baseline artifacts: `.local/snes-test/perf3/baseline-{short,long}/`,
`profile-short/` and `profile-original/`. Raw records and cartridges are
private and are not committed.

### Selected native changes

`core/hooks.asm` keeps the generic emitter's Y cursor between pieces: all
accepted and rejected paths already leave it equal to `$7C`. Rejected
pieces also retain the capacity proof, since they allocated no OAM slot.
Their short continuation lives in the old shake body made unreachable by
the existing `$C0:E60D` anchor hijack. It is installed only while that
hijack is enabled. `core/native.asm` enters the generic body fallback after
its already-completed capacity check. Every partial Y write, clipped piece,
high-table XOR, descriptor advance and return flag remains unchanged.
`CORE_NATIVE_EMITTER_RELOAD_SLOW` restores all three original paths; with
`CORE_NATIVE_SPRITES_SLOW`, the rejected-piece continuation is also omitted.

The contact-distance prefix `$81:CE72–CF19` remains intact: even distant
pairs must update their actor distance/direction fields. In the following
overlap helper `$81:D14A`, two empty attack boxes perform no overlap tests.
Skip the two cancelling XORs of `$06` and their width changes, retaining
the complete A/P result. Nonempty boxes rejoin the original instructions
with identical CPU and RAM state. `CORE_NATIVE_CONTACT_EMPTY_SLOW` restores
the original helper. No scheduling, audio, DMA/HDMA or persistent cache
changes are involved.

The generic six-piece emitter falls **967 → 932 CPU cycles** and an empty
contact pair **58 → 37**. The assembled `actor-hot.test.mjs` runs 24,000
randomized emitter/overlap inputs and replays the recorded short/long
charge and long teleport inputs. Its 2,769 recorded comparisons preserve
registers, flags and all live WRAM, including the complete OAM image, high
table and actor RAM. Only dead callee stack and the existing private body
anchor word are excluded. Nonempty overlap paths compare at their unchanged
native continuations. The existing exhaustive `sprites.test.mjs` also
passes (all signed-offset pairs, clipping, widths, decimal arithmetic,
shake, full OAM and zero-count wrap).

On the identical 634 recorded generic calls, summed cycles fall
**169,906 → 164,160**; 743 body calls fall **252,942 → 243,093**;
531 overlap calls fall **29,408 → 20,142**. The 861 unchanged distance
prefixes remain **150,633** cycles. These paired-input totals isolate the
code savings from the subsequent differences in actor/input timing.

All 13 short and six long gameplay cases pass their gameplay, palette,
meter, OBJ, complete-NMI, graphics-DMA and duplicate scenery-work checks.
Zero-drop timing remains open. The short/long charge peak increases despite
fewer misses; the input/actor schedule changes when a frame stops lagging.

| 240-video-frame case | Misses before / after | Peak field lines before / after |
| --- | ---: | ---: |
| solo-punch | 0 / 0 | 127.13 / 126.99 |
| solo-ki | 0 / 0 | 131.84 / 131.74 |
| walk | 0 / 0 | 233.35 / 232.11 |
| punch | 0 / 0 | 235.26 / 235.86 |
| ki | 0 / 0 | 232.58 / 231.44 |
| fly | 2 / 1 | 250.59 / 249.74 |
| fly-ki | 2 / 2 | 252.24 / 251.59 |
| fly-punch | 1 / 1 | 281.34 / 281.05 |
| water-flight | 0 / 0 | 221.77 / 221.68 |
| teleport | 3 / 3 | 255.61 / 254.50 |
| charge | 17 / 16 | 268.82 / 271.18 |
| focus-grass | 0 / 0 | 184.77 / 185.75 |
| transform-grass | 0 / 0 | 224.98 / 205.51 |

| 1,200-video-frame case | Misses before / after | Peak field lines before / after |
| --- | ---: | ---: |
| punch | 0 / 0 | 235.26 / 235.86 |
| ki | 0 / 0 | 238.04 / 237.46 |
| fly-ki (corridor) | 13 / 13 | 252.17 / 251.61 |
| fly-punch | 1 / 1 | 281.34 / 281.05 |
| teleport | 18 / 18 | 322.32 / 321.57 |
| charge | 25 / 22 | 268.82 / 271.18 |

Selected artifacts: `.local/snes-test/perf3/final-{short,long}/` and
`actor-third.log`. The strict cartridge is SHA-256
`fc8c4399d2cf92693014fbd15f95f5ddb7d7ff1b53db9ec7d2cf90142cb7546e`.

### Routine timings and remaining misses

CPU cycles per invocation, **mean / peak**. These live spans include nested
work and interrupts, and the input schedule changes with missed frames;
the paired assembled totals above isolate the optimization itself. Empty
overlap checks save 21 cycles; the nonempty continuations pay 7–8 extra
cycles for the bank handoff. The measured gameplay/perf cases add no misses.

| Routine / entry | Short charge before | Short charge after |
| --- | ---: | ---: |
| Actor pass `$80:E38E` | 9585.46 / 10736 | 9485.40 / 10715 |
| Actor `$80:E3CF` | 1491.58 / 3846 | 1474.90 / 3846 |
| Actor setup `$80:E40E` | 1192.14 / 3481 | 1175.80 / 3481 |
| Body caller `$80:E5CE` | 913.04 / 3255 | 898.32 / 3255 |
| `core_native_body` | 343.06 / 1636 | 326.16 / 1579 |
| Generic emitter `$80:E640` / checked entry `$E649` | 290.47 / 1303 | 269.71 / 1242 |
| Distance prefix `$81:CE72–CF19` | 175.62 / 190 | 175.59 / 190 |
| Full contact `$81:CE62` | 314.48 / 627 | 300.34 / 635 |
| Overlap `$81:D14A` | 63.75 / 321 | 42.28 / 329 |

| Routine | Long charge before | Long charge after | Long teleport before | Long teleport after |
| --- | ---: | ---: | ---: | ---: |
| Actor pass | 8039.97 / 10736 | 7976.26 / 10715 | 9369.94 / 11412 | 9356.47 / 11860 |
| Actor | 1555.39 / 3846 | 1542.72 / 3846 | 1455.58 / 4623 | 1453.35 / 5006 |
| Actor setup | 1251.20 / 3481 | 1238.41 / 3481 | 1138.53 / 4097 | 1136.02 / 4480 |
| Body caller | 1012.08 / 3255 | 1002.55 / 3255 | 857.25 / 3974 | 848.39 / 4357 |
| Body | 328.14 / 1636 | 315.87 / 1579 | 363.73 / 1108 | 351.51 / 736 |
| Generic emitter | 255.55 / 1303 | 235.02 / 1242 | 317.36 / 1269 | 303.06 / 1255 |
| Distance prefix | 179.18 / 190 | 179.11 / 190 | 170.83 / 192 | 170.13 / 192 |
| Full contact | 300.03 / 627 | 291.13 / 635 | 343.12 / 798 | 332.95 / 808 |
| Overlap | 66.49 / 321 | 46.25 / 329 | 70.89 / 313 | 56.85 / 324 |

For updates that actually miss NMI, the following are scanlines **mean /
peak**, grouped by the field update that was still running (not merely the
previous video frame). These are nested spans, not additive CPU totals.

| Missed-update span | Short charge before → after | Long charge before → after | Long teleport before → after |
| --- | ---: | ---: | ---: |
| Actor pass | 46.80 / 49.96 → 46.19 / 51.27 | 45.19 / 49.96 → 45.01 / 51.27 | 43.62 / 54.14 → 44.34 / 53.61 |
| Body caller | 25.87 / 30.06 → 25.36 / 31.93 | 25.46 / 30.06 → 25.19 / 31.93 | 23.23 / 27.56 → 23.77 / 32.13 |
| Generic emitter | 7.51 / 8.53 → 7.63 / 12.60 | 6.82 / 8.53 → 6.98 / 12.60 | 7.02 / 12.11 → 6.56 / 11.39 |
| Distance prefix | 7.85 / 8.05 → 7.85 / 8.03 | 7.41 / 8.05 → 7.48 / 8.03 | 7.19 / 7.75 → 7.18 / 7.66 |
| Full contact | 13.68 / 15.77 → 13.08 / 15.56 | 13.02 / 15.77 → 12.60 / 15.56 | 14.17 / 20.60 → 13.82 / 20.96 |

Short charge's larger native construction span (`native_b0ca`, including
the work before `$E38E`) changes **81.09 / 158.91 → 80.56 / 144.30** lines.
The remaining CPU work includes actor preparation/AI, movement, module effects
and teleport landing searches; eliminating the emitter alone would not
cover every long-frame peak. The excluded predecode/two-piece experiments
were not repeated. More aggressive early-outs must retain distance metadata
and partial OAM writes; caching needs exact invalidation of live descriptors,
coordinates, wrap dimensions and box sizes. No further core/API request is
required by this patch.

Profiles: `baseline-profile-{short,long}/` and `final-profile-{short,long}/`
under `.local/snes-test/perf3/`. `nativeRoutines` contains calls, CPU cycles,
master clocks and caller addresses; `nativeRoutineFrames` and
`nativeRoutineMisses` identify the work in missed updates.

### Validation and reproduction

All required suites pass on the selected source: **combat 37**, **Goku 12**,
**Frieza 18**, **Vegeta 11**, **story 76**, and FX's seven gallery/effect
cases plus all 18 focus-scene checks. Debug's 22 presets plus the save
round-trip give **21 FULL / 2 NATIVE / 0 PARTIAL / 0 FAILED**; controls and
hook-order checks pass too. The two NATIVE classifications retain the
existing Vegeta/debug-capture differences. The default emulator scenario
passes on **snes9x, bsnes and bsnes-accurate**, including Mesen picture,
end-position, save/load and ROM/SRAM mapping comparisons. The host binary
was built under this worktree's test directory with `SNES_RETRO_HOST`.

All six perf scenes pass. Final p90 field-finish line / missed-frame counts
are sword **62/4**, Sandship **112/4**, battle **54/4**, Beast **173/34**,
Fortress **95/4**, world flight **112/4**; none adds lag against the suite's
shared original-ROM state. Complete NMI peaks at **36.64 lines** across
the gameplay runs, with zero overruns. `modprof` on its two default scenes
reports total module frame means **9.49 → 9.51** (sword) and
**10.33 → 10.33** (battle), with NMI **1.29 / 1.30** unchanged. No new idle
callback or per-frame cache maintenance was added.

Additional core `frames`, `party`, `oam`, `lag` and `hdmaen` checks pass.
With `CORE_NATIVE_SPRITES_SLOW`, the exhaustive native-offset comparison
and randomized emitter/contact checks pass; the original shake body stays
available. Building with both new rollback defines restores every recorded
routine's original cycle count and restores long charge/teleport to
**25/18** misses. The default strict rebuild is byte-identical to the
measured selected cartridge.

One existing instrumentation limitation remains: Vegeta's `budget` case
passes its behavioral replay but records `-1` at its final timing probe,
so its printed “lag” total is not a usable CPU measurement. The integrated
gameplay/perf suites and the routine profiles above supply the timing
evidence for this change. No Vegeta code or test was changed.

The new assembled replay can be repeated without committing private inputs:

```sh
GAMEPLAY_OUT=.local/snes-test/native-inputs SNES_ROM=path/to/baseline.sfc \
  node snes/test/gameplay/run.mjs charge teleport --repeat=5 --record-native
NATIVE_BASELINE_ROM=path/to/baseline.sfc \
NATIVE_INPUTS=.local/snes-test/native-inputs/charge/native-inputs.json:.local/snes-test/native-inputs/teleport/native-inputs.json \
  node --test snes/test/core/actor-hot.test.mjs snes/test/core/sprites.test.mjs
```

Without `NATIVE_BASELINE_ROM`, the comparison uses the verified retail ROM.
Without `NATIVE_INPUTS`, only the recorded-input test is explicitly skipped;
the randomized checks still run. `NATIVE_EXPECT_SLOW=emitter,overlap` checks
equal benchmark costs when both rollback defines are enabled. Logs for
every suite, rollback build, replay and strict build are under
`.local/snes-test/perf3/`; nothing from that directory is committed.

## October 20 checkpoint

The new pass starts at integrated main `5f21b35`. Fresh 240-frame runs
reproduce charge **22**, teleport **3**, flying ki **3**, flying punches
**2**, ordinary flight **1**, and zero for the other eight cases. Fresh
1,200-frame runs differ from the earlier October 19 image: charge **33**,
teleport **15**, corridor flying ki **15**, flying punches **2**, and
ground punches/ki **0/0**. Use these matched-build baselines below, rather
than attributing differences from the old 26/15/10 results to this pass.

The current selected image has these missed-video-frame counts. All 13
short and six long cases pass their gameplay, palette, meter, OBJ,
graphics-DMA, complete-NMI and duplicate scenery-work checks; timing remains
open for the nonzero rows.

| Scenario | Baseline / current, 240 frames | Baseline / current, 1,200 frames | Current long peak, lines |
| --- | ---: | ---: | ---: |
| Charge and release | 22 / **13** | 33 / **16** | 266.24 |
| Teleports | 3 / **3** | 15 / **15** | 269.93 |
| Flying ki, long run in corridor | 3 / **2** | 15 / **13** | 250.64 |
| Flying punches | 2 / **1** | 2 / **1** | 280.67 |
| Ordinary flight | 1 / **2** | — | — |
| Ground punches | 0 / **0** | 0 / **0** | 237.52 |
| Ground ki | 0 / **0** | 0 / **0** | 238.07 |

The other six short cases (solo attacks, walk, water flight, focus and
transformation over cut grass) remain at zero. Complete NMI peaks at about
**35.57** lines across the selected runs. No audio or core source changes,
and no relaxation of the all-HDMA-off requirement for mid-frame DMA.

### Remaining critical path and core handoff

The final charge profile still spends **80.98 mean / 144.80 peak** lines
in native actor construction and **39.25 / 56.18** in movement/contact.
FX averages **11.28**, peaks at **39.43** on release, and native work on
missed charging/release updates commonly exceeds 100 actor lines plus
30–50 movement lines. The native instruction sample records **2,778**
visits to the descriptor emitter at `$80:E640` and **2,043** contact checks
at `$81:CE72–CF19` in 240 video frames. These are concrete core follow-up
targets for removing repeated work while retaining exact actor behavior;
the earlier excluded body-predecode/two-piece trials still apply.

Final long teleport averages **74.08** actor and **37.25** movement lines.
The remaining 15 misses include two landing-search bursts (fixture frames
445/449: flight **114.15 / 87.34** lines); most other misses combine native
actors, movement and occasional row streaming. Cached landing results
across teleports would need to observe moving targets, live map edits and
hole providers, so no such reuse was introduced. Flying ki averages
**49.32** actor, **30.67** movement, **18.22** flight, **17.88** combat and
**16.82** FX lines; its miss frames still combine native AI/contact bursts
with attacks. The vblank work list does not overrun in these cases.
Spans can include interrupts and nested work; do not sum them as independent
CPU totals. Profiles: `final-native-charge`, `final-teleport-profile` and
`fly-ki-profile` under `.local/snes-test/perf2/`.

Core may also compile out the unused enemy queue/drain when
`CORE_ENEMY_DEFER` is absent. Its source and all DMA/HDMA guards remain
untouched here. Final `modprof` frame/NMI means are FX **0.20 / 0.11**, UI
**0.33 / 0.12–0.13**, flight **0.30**, and combat's frame callback **0.87**
(including dispatch). UI's extra idle charge check adds about 0.04 lines
outside charging. All six final perf scenes retain their baseline lag
counts. The strict default build is byte-identical to the measured
`charge-query.sfc` (SHA-256
`93d4a09b0e3f578bcde6447266510acf8f39e707e556880414053ae66f67e401`).
Building with `COMBAT_CHARGE_DRAW_SLOW`, `UI_CHARGE_IDLE_SLOW`,
`FLIGHT_CHARGE_STATE_SLOW` and `CORE_ENEMY_DEFER` together restores **33**
long charge misses, matching the fresh baseline (`restored-long`).

### Read only the charging state flight needs

The charge profile shows `fl_bind_charging` spending **0.82** lines on a
full combat-state query during every charging frame. It uses just one bit.
Read the same live charging byte, without constructing four unrelated
flags or returning charge/action values that flight discards. The binding
retains its register/flag result; combat's call-local scratch is not an
output. `FLIGHT_CHARGE_STATE_SLOW` restores the full query.

The query falls **158 → 22 CPU cycles**. All **12,288** assembled comparisons,
**17 flight assembly tests**, nine live flight cases and **13 short / six
long** gameplay cases pass. Long charge improves **18 → 16** misses; other
counts and the **266.24-line** charge peak stay unchanged. Artifacts:
`charge-flight-profile`, `charge-query-short`, `charge-query-final-long`,
`charge-query-unit.log`, `charge-query-flight*` and `charge-query-modprof.log`
under `.local/snes-test/perf2/`.

### Restore native enemy decision phases

The `ab393b9` experiment defers the second/third enemy's AI and animation
by two field updates while both CPU companions are carried. Status/timers
and per-frame movement continue, but decisions observe the world later.
That trade-off does not help the priority flying-combat cases: with the
quiet-radio checkpoint, native scheduling improves short flying ki
**3 → 2**, flying punches **2 → 1**, and long corridor flying ki **15 → 13**,
flying punches **2 → 1**. Charge and teleport counts stay **13/18** and
**3/15** (short/long). Short ordinary flight regresses **1 → 2**; the long
unsteered flight comparison leaves the map and is invalid, so do not use
its count. The earlier integrated-baseline comparison independently gives
the same flying-combat improvement.

Make the flight gateway opt-in with `CORE_ENEMY_DEFER`; the existing
`CORE_ENEMY_SYNC` override still disables it. No core source changes.
All eight assembled scheduler tests pass, including immediate production
decisions and the complete opt-in queue's guards/cadence. All **11 flight
cases** pass: 289,324 classified tiles, 19,996 landing queries, 191,964
sweeps and 79,988 footprint queries agree with the browser, plus live
passengers, water, teleport, whip, ceilings, scenes, bosses and holes.
All **13 short / six long** gameplay and **six perf scenes** pass with no
hardware/rendering errors. Long flying-ki peak falls **291.55 → 250.64**
lines; flying-punch peak rises **261.01 → 280.67** despite fewer misses.
Teleport peak falls **299.78 → 269.93**, with its 15 misses unresolved.
Artifacts: `native-enemy-*`, `enemy-sync-*`, `quiet-radio-sync-long` and
`quiet-radio-fly-long` under `.local/snes-test/perf2/`.

The redundant FX request-clear trial is excluded: it reduced charge
submission pairs **824 → 738 CPU cycles** and beam submissions **419 → 364**,
and passed 10,882 assembled comparisons, but left long charge at 18 misses.
The private patch, ROM, unit log and run are `fx-request*` in the same
artifact directory.

### Quiet radio during base charging

An idle radio has no messages, cooldowns or window work (the cut scouter's
pending scan is gone). Base charging and beams cannot start an SSJ warning, so retain that
idle proof and perform only request, visibility and placement-age updates.
Preserve foreign-state validation and the full path for fortress completion,
events, R, SSJ, messages and cancellation before dispatch. World flight
keeps its full callback. `UI_CHARGE_IDLE_SLOW` restores unconditional wakeup.

The assembled charge API plus quiet callback falls **1,075 → 397 CPU
cycles**. All **672** live RAM/SRAM/I/O comparisons and **12 UI cases** pass.
All **13 short** and **six long** gameplay cases pass with zero hardware or
rendering errors. Charge misses fall from the lookup checkpoint's **21 → 13**
short and **31 → 18** long; other counts stay unchanged. Its longest update
falls **277.90 → 266.43** lines, complete NMI peaks at **33.77**, and the
short-run UI callback averages **0.98** lines (peak **1.84**) versus the
baseline's **2.53 / 5.46**. Ordinary idle remains about **0.26** lines.
The six perf scenes also pass. Artifacts: `quiet-radio-safe-short`,
`quiet-radio-safe-long`, `quiet-radio-safe-ui.log`, `quiet-radio-unit.log`
and `quiet-radio-perf.log` under `.local/snes-test/perf2/`.

### Charge presentation lookup

Generate the charge aura power and orb frame from the existing quantized
strength. Full-charge strobing and every FX request remain unchanged;
`COMBAT_CHARGE_DRAW_SLOW` restores the arithmetic path. Partial charge's
combined submissions fall **1,127 → 824 CPU cycles**. All **9,981** assembled
comparisons, **36 combat scenarios**, **13 short** and **six long** gameplay
cases pass with zero palette, meter, OBJ, complete-NMI, graphics-DMA or
duplicate scenery-work errors. Short charge misses improve **22 → 21**;
long charge **33 → 31**. Other counts are unchanged. The long charge peak
changes **276.58 → 277.90** scanlines as actor/input timing changes;
crowded zero-drop timing remains open.

Baseline profiling (`modprof.mjs`, all six perf scenes, and gameplay's
module/FX/combat spans) precedes the change. During short charge/release,
native actor construction averages **81.02** lines (peak **162.88**) and
movement/contact work **39.18** (peak **56.60**). FX averages **11.02**
(peak **39.32**); charging frames usually add 15–24 FX lines, release
frames about 30–39. Combat logic averages **9.25** (peak **49.67**, including
interruptions). Goku's frame callback averages **3.25**, radio/UI **2.53**,
and Goku's NMI upload peaks at **6.10**. Complete NMI peaks at **34.00**
lines with no overruns. This fixture uses base-form charging: SSJ lightning
and warning decisions do not cause its misses. Native actors/contact and
the combined charge/release workload are the critical path.

The initial orb-only lookup trial measured 30 long charge misses, but
removed less per-frame work than the combined lookup. It is retained only
as a private comparison, not as evidence of zero-drop timing. Artifacts:
`.local/snes-test/perf2/` (`baseline-*`, `charge-profile`, `orb-long`,
`charge-table-short`, `charge-table-final-long`, and the unit/combat logs).

Long commands use `punch ki fly-ki fly-punch teleport charge --repeat=5
--flight-corridor`; the runner has no special `--long` preset. Perf's six
shared scenes pass on the fresh baseline. Idle `modprof` FX remains about
0.2 frame / 0.1 NMI lines; combat's frame callback is 0.87 including dispatch.

## Previous checkpoint (October 19)

The latest 1,200-video-frame runs use the resident aura build in
`.local/snes-test/aura-rows/game.sfc`. All rendering and hardware
checks pass; flight, teleport and charging still miss frames.

| Scenario | Missed frames | Longest field update (scanlines) |
| --- | ---: | ---: |
| Ground punches | 0 | 237.30 |
| Ground ki | 0 | 237.85 |
| Flying ki, corridor | 10 | 250.48 |
| Flying punches | 1 | 280.41 |
| Teleports | 15 | 269.70 |
| Charge and release | 26 | 272.63 |

The measurements below preserve the history of this review; their earlier
counts are not the current release result. Passing a normal gameplay run
does not imply zero-drop timing for every case.

### Resident aura emission

The full flame now resolves its three resident cells and writes the six
mirrored sprites directly when they fit on screen and in OAM. Miniatures,
screen edges and limited OAM retain the generic renderer. Palette selection,
cache eviction, pending-upload checks, strobe and animation remain the same;
the optimization removes unused flip preparation and repeated part decoding.
The generator validates the fixed layout. Stamp lookup records now share
the FX data bank, leaving room in the code bank even with `FX_TEST` enabled.

All 2,674 assembled aura comparisons retain OAM and cache/palette state,
including missing cells, exhausted palettes, uploads, anchors, clipping,
front reservations and subsequent effects. The full flame takes 1,147 CPU
cycles versus 1,948 through the generic comparison path. All 25 assembled
FX tests and the gallery/beam/aura/debris checks pass; all six aura variants
retain 100% matching pixels and no BG palette writes over cut grass.

Long charge misses improve 37 → 26 per 1,200 video frames, with the peak
falling 276.29 → 272.63 scanlines. Short charging improves 22 → 17; all
other short/long miss counts remain unchanged. Hardware and rendering
checks remain clean, including focus/transformation after cutting grass.
Six local-flight checks, ten combat comparisons and all 14 available
world/radar/map cases pass. Private artifacts are under
`.local/snes-test/aura-rows/`. Strict crowded timing is still open.

### Exhausted teleport searches

A ground target whose first connected footprint fails in all four
directions cannot have a landing at any later distance. Stop that search
after four candidates instead of retrying all 28. Known blocked directions
also return before constructing their offsets; signed word tables replace
the repeated widening of direction bytes. Target order, reachable landing
positions, airborne queries and hole-provider behavior are preserved.

All eight assembled landing tests pass, including 512 enclosed-target
cases, 73,380 individual obstructions, 283,200 endpoint-reuse queries and
13,824 full searches against the independent model. The enclosed-target
case falls from 8,275 to 3,335 CPU cycles. Long teleport misses remain 15
per 1,200 video frames, while the longest update falls 279.35 → 269.70
scanlines. All other long counts and all 13 short counts are unchanged;
palette, meter, OBJ, graphics-DMA and complete-NMI checks remain clean.
All 19,996 landing queries, 191,964 sweeps and 79,988 landing-service
queries across 27 scenes still match the browser. Passenger, water,
teleport, whip, ceiling, Vegeta and hole-provider checks pass, along with
ten combat comparisons and all 14 available world/radar/map tests.
Private results are under `.local/snes-test/teleport-exhaust/`; the
production image matches the measured candidate byte for byte.

The two-piece body and controller-ownership lookup experiments are excluded.
Both passed their machine-code comparisons, but the body trial increased
long charging misses 37 → 39, and the controller lookup increased long
teleport misses 15 → 30 despite reducing individual helper cost. Their
private patches and measurements remain in `body-pair/` and
`controller-actor/` under `.local/snes-test/`.

### Native AI dispatch follow-up

The private command dispatcher and its sole native loop caller now branch
directly between each other. The dispatcher still saves/restores P and D
around every opcode; the redundant `REP` before `PLP` is removed. Script
order, operands, random draws, the 256-command limit and actor cadence
remain unchanged. An ordinary dispatch saves nine CPU cycles.

All 18,185 assembled comparisons pass: all 256 actual opcode handlers,
operand and target variants, incoming flags, stack page boundaries, and
complete loops through termination or the native command limit. The fixture
compares live parent stack, WRAM/SRAM, CPU context and I/O writes. Existing
operand-advance, random-choice and visibility comparisons also pass.

Long flying-ki misses improve 13 → 10 and charging improves 41 → 37 per
1,200 video frames. Other long counts and all 13 short counts are unchanged;
all palette, meter, OBJ, graphics-DMA and complete-NMI checks remain clean.
Ten combat comparisons, six local-flight tests, all 14 available world/
radar/map cases and core title/frame/party checks pass. Results are under
`.local/snes-test/ai-dispatch/`; the production ROM matches the measured
candidate byte for byte. Strict crowded timing is still open.

### Native target visibility follow-up

The two native visibility checks inline their height subtraction after
the active/self/horizontal rejection tests. They keep the original
carry/overflow, decimal arithmetic, CPU widths and comparison results.
Rejected actors take the original path without an added bank handoff.
The visible-target examples fall 95 → 79 and 124 → 108 CPU cycles; all
147,874 assembled comparisons retain complete CPU context and live RAM.

Short charging improves 30 → 22 misses per 240 video frames, and long
charging improves 44 → 41 per 1,200. Other short/long counts stay unchanged.
The longest charging update changes 274.97 → 276.95 scanlines as the
input/actor schedule changes, so fewer misses do not imply a lower worst
case. All gameplay hardware/rendering checks remain clean. Results are
under `.local/snes-test/target-visible/`. Ten combat reference comparisons,
six local-flight checks (including passengers), all 14 available world/
radar/map checks and native frame/party cadence checks pass. The production
ROM matches the measured candidate byte for byte.

A separate body-cursor batching trial passed its native sprite comparisons
but did not improve long missed-frame counts; it is excluded. Its private
patch and measurements remain under `.local/snes-test/body-cursor/`.

### FX residency lookup and reset follow-up

The resident-cell hint table now has 128 buckets in previously unused
work SRAM at `$31:756C–75EB`. Eight animation cells spaced 16 ids apart
take 1,256 CPU cycles to resolve, versus 2,784 with the 16-bucket
comparison build (`FX_CACHE_HASH_SMALL`). Each hint still checks the
actual resident cell and pending-upload flags before drawing.

Residency invalidation is idempotent: after clearing the bitset and hints,
further region changes cost 33 cycles until a new hint is stored. This
avoids clearing the same cache repeatedly during scene/region setup.
The FX initialization version changes so older SRAM cannot reuse stale
hints. Water palettes, companion queues, save data and debug state retain
their allocations.

The 21 assembled FX checks, gallery/beam/aura/debris checks, six local-flight
checks, all 14 available world/radar/map checks and core
boot/party/death/HP/save/WRAM checks pass. All 13 short and six long
gameplay runs retain zero palette,
meter, OBJ, graphics-DMA and complete-NMI errors. FX peaks fall by about
5.55 scanlines in the punch/flying-ki/flying-punch runs. Overall flying
punch peaks fall 286.10 → 280.58; missed-frame counts remain unchanged.
Charge's peak moves 274.93 → 274.97, so this is a reduction in setup bursts,
not a claim that crowded timing is fixed.

A larger native-pose predecode trial was excluded. Its 2,192-pose CPU
comparisons passed and aggregate tile decoding fell about 17%, but it used
over 300 KiB of extra data for roughly 0.2 scanlines less actor work per
frame, with no missed-frame reduction and a slightly worse charge peak. The
private trial, CPU comparisons and profiles are in
`.local/snes-test/pose-decode/`. Movement profiling points to native
party/enemy contact distances (`C1:CE72–CF19`) as another significant cost.

## Changes in this pass

- Fix water-flight colours: mirror Goku's tinted palette into the palette
  actually selected by airborne OAM, then restore the map palette on landing.
- Replace streamed gameplay sounds with a small set of resident SPC effects.
  Keep native music, sparse charge pulses, punch/ki/impact/beam cues; omit
  sampled voices and continuous flight noise. Effect handshakes release the
  main CPU immediately. See [audio.md](audio.md) for the cue policy and the
  optional `AUDIO_PCM` comparison build.
- Clear the original weapon-charge meter and sparkle while Goku acts,
  without clearing his Kamehameha charge. Compute attack rectangles once
  and unroll the native target scan without changing reach or damage.
- Pack Goku's animation cells into four DMA rows instead of sixteen tile
  transfers. The cell-upload NMI path falls from about 8.9 to 5.5 scanlines.
  Defer compatible poses when the vblank budget is short; waiting does not
  force an overrun. Reserve time through the final NMI return, including the
  joypad/clock hook.
- Use one moving ki orb and one impact spark, cull offscreen shots early,
  and defer radio text expansion on busy frames. Attack collision and timing
  stay independent of optional rendering work.
- Reuse shoreline collision results; hide bodies, attachments and shadows
  of carried CPU companions while keeping their actors alive.
- Use FastROM mirrors for hot native calls. Spread companion status, AI and
  animation over the existing five phases at the original update frequency.
  Movement, collision and drawing still run every frame. Native event
  scripts retain the original phase order, including whip-pad crossings.
- Advance teleport by elapsed video frames rather than completed logic
  frames. Keep the camera-streaming hold and block new attacks/charging
  during recovery scrolling. Test catch-up across three missed frames and
  the 16-bit clock wrap.

## Measurements

`snes/test/gameplay/run.mjs` drives real controller input with Goku active
and the APU running in Mesen. Each row is 240 video frames from the same
private imported fixture, with the same warm-up and input on both builds.
“Before” is `482fab3` with its PCM extension installed; “after” is
`1cd6efc`, the first native-audio gameplay review. Counts are actual NMIs where field logic was
not ready, not wall-clock emulator speed. Menus and map transitions are
excluded from these cases.

| Scenario | Before: missed frames | After: missed frames |
| --- | ---: | ---: |
| Quiet punches | 0 | 0 |
| Quiet ki shots | 0 | 0 |
| Walking with the party | 38 | 11 |
| Punching in the Rabite field | 27 | 10 |
| Ki shots in the Rabite field | 95 | 23 |
| Ordinary flight | 48 | 24 |
| Flying while repeatedly firing ki | 125 | 88 |
| Flying while punching | 70 | 35 |
| Water flight and ki | 4 | 0 |
| Repeated teleports | 54 | 33 |
| Kamehameha charge and release | 72 | 46 |

Across these inputs, CPU misses fall from 533 to 270 (about 49% fewer).
The final 11-case run has zero palette mismatches, meter leaks, OBJ overflow
or NMI overruns. Separate 1,200-video-frame runs of quiet punches, quiet ki
and water flight also finish with zero CPU misses and zero rendering errors.

The final gameplay checks require zero palette mismatches, native-meter
leaks, OBJ overflow and NMI overruns through the final RTI. They also verify
that the field keeps running, Goku renders, the requested action actually
runs, movement occurs, and the scene does not change. Quiet attacks and
water flight additionally require zero CPU misses.
`--strict-timing` applies that requirement to every row and still fails on
the crowded cases; a normal suite pass does not mean those timing issues
are solved.

## Sound and aura follow-up

The looping transform sound was retail effect `$12`, which never releases
its two voices. Seven short resident sequences now replace that cue and
the other common combat effects. Each owns one voice and ends in 90–470 ms;
the hit's measured peak is 1.64 times the swing's, with headroom and a silent
tail. No gameplay PCM is transferred. See [audio](audio.md).

The aura now uses OBJ palettes and resident sprites, so cut grass and native
background transparency cannot change its colours. Three mirrored cells
cover the full flame, and the transform burst uses 12 sprites at its peak
instead of 32. Native-audio charge handling skips PCM envelope arithmetic.
Ki queries reject targets outside the existing contact segment early, and
a native AI mask lookup replaces repeated shifting without reducing actor
updates. Goku cancels obsolete deferred poses and checks compatibility
before vblank; FX and core avoid redundant scanline reads.

The final short runs remain 240 video frames each, with all actors enabled:

| Scenario | Previous review (`1cd6efc`) | Follow-up CPU misses |
| --- | ---: | ---: |
| Quiet punches / quiet ki / water flight | 0 / 0 / 0 | 0 / 0 / 0 |
| Walking / punching / ki with the party | 11 / 10 / 23 | 8 / 10 / 21 |
| Ordinary flight / flying punches | 24 / 35 | 24 / 35 |
| Flying while repeatedly firing ki | 88 | 96 |
| Repeated teleports | 33 | 31 |
| Kamehameha charge and release | 46 | 44 |
| Focus after cutting grass | — | 0 |
| Transform after cutting grass | — | 1 |

Performance gains are modest and uneven: the short flight-and-ki input is
worse, while a longer 1,200-frame repeat improves from 414 misses with the
initial audio/aura fixes (`6ec0808`) to 398 after the CPU/vblank changes.
Do not describe the crowded scenes as zero-drop. Native actor/status/AI,
collision and reward/graphics work remain the major bottlenecks.

All 13 final cases and the 1,200-frame flight-and-ki repeat have zero palette
mismatches, meter leaks, OBJ overflow and complete-NMI overruns. Separate
1,200-frame quiet-punch, quiet-ki and water-flight runs have zero CPU misses
as well. The grass tests use real punches and controller chords, verify
six aura sprites, full focus, the transformed form, audible charge/reveal
cues and no lingering charge/reveal voice after release. FX pixel checks,
core cadence/HDMA/input/save tests, Goku forms/status/menus and combat
comparisons pass. These are emulator measurements, not physical-console
certification. Generated results remain under `.local/snes-test/followup/`.

```sh
node snes/build.mjs --quiet --strict
node snes/test/gameplay/run.mjs
node snes/test/gameplay/run.mjs solo-punch solo-ki water-flight --repeat=5
node snes/test/gameplay/run.mjs --strict-timing
```

The last command is the remaining all-scenes timing target. `--profile`
prints module timing; `--native-profile`, `--flight-profile`, `--fx-profile`
and `--combat-profile` add detailed
execution probes. Generated summaries, screenshots and private ROM copies
stay under `.local/snes-test/`, outside Git. No physical console was tested.

## Flight, world map and radar follow-up

The October 18 follow-up fixes the known takeoff and world-flight
integration bugs, including the production radar and quest indicators:

- Outdoor takeoff and roof escapes share boss, status, scene and camera
  locks. A second input reader can no longer bypass them.
- World charging uses the shared combat clock, form, action and native
  sound state. Releasing L while holding Y fires one wave; L+A/L+B cannot
  briefly change altitude. Scene locks cancel focus and its sound pulses.
- The radar reads the actual story-query result instead of a restored loop
  index. Fifteen production save-state cases match the browser's palace,
  Dryad, Tree, Fortress, Beast and wish targets, Ball count and hints.
  The radar yields on the first charge/attack frame.
- World palettes follow the resident sprite cell. Packed uploads reduce
  the cell DMA path from 15.78 to 5.54 scanlines. Closing Start's globe or
  flat map invalidates graphics and UI caches. Both forms have correct
  colours from the first visible Goku frame; effects and radar recover too.
- Fixed radio text and the 512×512 terrain are expanded at build time.
  Native world helpers use FastROM. Turning no longer decompresses terrain
  during flight; crater and landing behavior is preserved. An independent
  decoder comparison checks all 262,144 tiles using the copier's actual
  machine code, including ROM and ring-buffer boundaries.

The final production world stress run measures **5,770 video frames**:

| Input | Video frames | Missed frames |
| --- | ---: | ---: |
| Cruise and turns, radar visible | 2,400 | 0 |
| Repeated ki | 1,200 | 0 |
| Charge and release | 1,100 | 0 |
| Transform and revert | 1,070 | 0 |

Every row also has zero palette mismatches, sprite overflow and complete-NMI
overruns. Peak NMI duration is 26.55 scanlines, below the 37-line vblank
window. Two other world fixtures pass the same four inputs. These checks
verify that movement, radar, shots and form changes actually occur.

All 14 world cases pass, including takeoff locks, landing, docking, the Fly
item, cloud barrier, craters, radar and both native map viewers. The Fortress
cutaway matches the browser reference at 99.2–99.7%. Local water flight,
teleport, seven roof routes, scene locks, Vegeta and whip crossing also pass.
The whip test now checks companions at landing, before their AI resumes.
Core input/world/lag/HDMA checks, cartridge boot and native-audio checks pass.
The optional static branch audit was skipped because no coverage trace is
available in this checkout.

**Crowded local combat remains a release gap.** The final 240-frame field
checks still measure 24 misses during flight, 97 with flying ki, 36 with
flying punches, 28 with teleports and 44 with charge/release. Walking,
ground punches and ground ki measure 8, 10 and 21 respectively. Quiet
punches/ki, water flight and grass focus remain at zero; grass transformation
has one miss. All 13 cases have zero palette, meter, OBJ and vblank errors.
Native collision, actor/status work and enemy-death graphics remain the
costly paths. The zero-drop world results do not imply zero-drop local
combat, and native map-viewer loading pauses are outside those timings.

```sh
node snes/build.mjs --quiet --strict
node --test snes/test/world/terrain.test.mjs
node snes/test/world/run.mjs
node snes/test/world/run.mjs timing --repeat=5
node snes/test/world/run.mjs timing --scene=frieza__core-free-flight
node snes/test/world/run.mjs timing --scene=emulator-probe__flight-baseline
node snes/test/gameplay/run.mjs
```

Implementation checkpoints: `9d892ef` (takeoff), `32ac470` (uploads and
palettes), `95fdf9f` (shared aerial combat), `aed3799` (quest state),
`a1d2620` (world loop and text), `18da80a` (terrain), `38a7a3d` (control
locks and radar ordering), `1f880aa` (map-viewer return).

## Crowded-combat performance checkpoints — October 19

The first checkpoint moves the fixed native death/status sheet at
`D1:F100` into build-time conversion. The replacement for `C1:C599`
copies identical 4bpp bytes with interruptible MVN and preserves the
decoder's CPU and direct-page contract. Other inputs use the retail path.
`snes/test/core/graphics.test.mjs` executes both machine-code implementations
and compares all WRAM (except inactive stack bytes), registers and flags;
all six actor slots and all three palette variants match. Decimal mode,
other sheets, sizes and destinations exercise the fallback. The fast path
uses less than half the original CPU cycles.

Strict build, those comparisons, the existing native-helper test and core
frames/party/OAM/lag/decode checks pass. All 13 gameplay cases still have
zero palette/meter/OBJ/NMI errors. Ordinary flight improves from 24 to 20
misses; walking from 8 to 7, flying punches from 36 to 35 and charging from
44 to 43. Flying ki stays at 97, ground punches at 10, ground ki at 21,
teleport at 28 and grass transformation at 1. The four zero-miss cases
remain zero. Peak logic falls from 617 to 355 scanlines for flying punches,
592 to 330 for teleport and 433 to 355 for flying ki.

The all-scenes `--strict-timing` check therefore still fails. Recurring
actor, collision and effect costs and other graphics sheets need further
work. Generated measurements are under `.local/snes-test/combat-death-fast/`.

The next checkpoint expands the same treatment to the observed weapon
sheets `D4:0000` and `D4:2FE8` (64 tiles). Differential checks cover their
three encodings, six slots, flags, direct pages and fallback cases. Core
frames/party/OAM/lag/decode and Goku field/status/forms pass. All 13 gameplay
cases keep zero rendering/hardware errors; grass transformation becomes
zero-miss. Ground-punch/ki peaks fall from 384/383 to 364/372 scanlines;
other short miss counts are unchanged. In 1,200-frame repeats, flying ki,
flying punches and charging remain at 467/95/166 misses. Teleport increases
from 118 to 136. These timings change enemy/companion trajectories and do
not establish a net improvement in long crowded fights. The broader
zero-drop target is still open. Results: `combat-graphics-fast` and
`combat-graphics-long` under `.local/snes-test/`.

## Validation and remaining work from Claude's notes

The latest October 19 checkpoints also avoid late-vblank queue setup,
repair an accumulator-width bug in the native companion pair, collapse
connected ground teleport samples into one tile rectangle, and construct
horizontal beam HDMA by colour runs. All 19,996 landing queries across
27 scenes match the browser; the beam builder matches all 224 scanlines
for every generated strip record, including clipping.

The current 240-frame gameplay run still measures misses: walking 7,
punching 6, ground ki 19, flight 4, flying ki 5, flying punches 1, teleport
11, charge 42 and grass transformation 1. Solo attacks, water flight and
grass focus remain at zero. All 13 cases have zero palette, meter, OBJ,
vblank and guarded-graphics-DMA errors. The long teleport/charge cases
improve from 105/151 to 73/144 misses in 1,200 frames. Strict crowded
timing remains open. Results: `combat-corridor-strips`,
`teleport-corridor-long` and `strip-runs-long` under `.local/snes-test/`.

Destruction profiling (`--destroy-profile`) finds scenery-scan growth
steps as large as 43 lines and follow-up scans around 61 lines. Native
actor work is still the main repeated cost in phases 1 and 2. A sprite
emitter prototype passed output comparisons but worsened long gameplay
timings, so it was removed; its private measurements are retained only
for future investigation.

A narrower native body/weapon emitter now adds packed coordinate offsets
for interior assemblies. Direct shadow/attachment calls remain unchanged;
edge positions, decimal mode and unusual offsets use the native path.
Exact machine-code comparisons cover all signed-byte pairs, partial OAM
writes, high-X bits, shake and a full list. The six-piece example falls
from 988 to 719 CPU cycles. Core frames/party/OAM/lag, Goku field/status/forms
and passengers pass. Short charge misses change from 42 to 41; other short
counts are unchanged. A fresh disabled-fast-path baseline and the new
emitter both measure 36 flying-ki and 144 charge misses in 1,200 frames.
This corrects the stale flying-ki comparison from the earlier DMA checkpoint;
all 13 hardware checks remain clean. Results: `combat-body-anchor` and
`body-anchor-baseline` under `.local/snes-test/`.

The fast FX emitter also had a separate OAM-capacity bug: `d_end` is the
first cursor without room, so dividing `d_end - cursor` by four could yield
zero with one slot still available. The loop then underflowed to `$FFFF`.
It now checks each emitted part against the limit and skips unavailable
cells without consuming space. All 815 nonempty assemblies match the
per-part path at capacity; missing-cell, screen-edge, front-reservation
and large-sprite cases pass, as do gallery/beams/aura/debris. The 13 short
gameplay measurements are unchanged and retain zero hardware errors
(`fx-capacity/short`). This is not the cause of their remaining CPU misses.

The compact single-cell emitter saves 195 CPU cycles per resident front
stamp (935 to 740), with identical allocation and placement. Its regression
also exposed and fixes a missing-flipped-tile bug in generic setup: X/Y
restoration overwrote the sign flag before the unavailable-cell test.
Every rotated stamp now explicitly rejects `$FFFF`. All nine assembled
FX tests and gallery/beams/aura/debris pass. Production matches the tested
private ROM byte for byte (`fx-stamp-fast3`). All 13 short cases and four
long repeats keep zero palette, meter, OBJ, NMI and graphics-DMA errors.
Long flying-ki/charge misses change from 36/144 to 31/143; flying punches
and teleport remain 1/73. Short flying-ki changes from 5 to 7. These are
CPU savings and a rendering fix, with strict crowded timing still failing.

Prebuilt colour HDMA further reduces a fully visible seven-band strip
from 7,249 to 2,938 CPU cycles. All 88 records retain exact visible rows;
both buffers also have explicitly neutral padding when a coloured run
reaches line 224. Eleven assembled FX checks and gallery/beams/aura/debris
pass. The 13 short gameplay counts remain unchanged with zero hardware
errors; long charging improves from 143 to 138 misses in 1,200 frames
(`strip-copy`). Remaining charge stalls are mainly actor work and scenery
scans, so this does not close the strict timing gap.

A subsequent fixed-phase change puts the girl in phase 4 and the sprite in
phase 0, keeping Goku in phase 3. Status, AI and animation still run once
every five frames; movement and contacts stay per-frame, and events keep
the native phase-3 party. Fresh 1,200-frame comparisons improve ground
punches from 24 to 2, ground ki from 47 to 8, and charging from 138 to 93
misses. Flying ki stays at 31; flying punches change from 1 to 2, and
teleport from 73 to 58. The short walk, ordinary-flight and grass-transform
cases reach zero; short flying-punch/teleport counts rise from 1/11 to 2/13.
All 13 cases retain zero palette, meter, OBJ, NMI and graphics-DMA errors.
These are improvements with remaining misses, not a zero-drop release.
Measurements: `stamp-party-40` and `strip-copy/ground-long`.

The exact native AI distance lookup reduces its measured helper from 322
to 198 CPU cycles, with all 65,536 byte-distance pairs checked against
retail machine code. The production ROM matches the validated private
image byte for byte. Core party/frames/input/lag/HP/OAM/HDMA, Goku
field/status/forms and flight passengers/water/teleport/whip/scene pass.
All 13 gameplay hardware checks remain clean. Short charging falls from
38 to 36 misses; long punches/ki/charge remain 2/8/93, walking changes
11 to 8 and teleport 58 to 67. Strict crowded timing remains open.

The aerial timing cases now walk left for 24 setup frames before measuring:
the imported hero was only 30 pixels from the eastern exit. Faster updates
changed the drift of video-frame input reversals enough to enter that exit,
invalidating the long flying-ki run (17 misses but only 359 flight frames).
That result is discarded. Fresh old/new comparisons at the inland starting
point both measure 30 flying-ki and 5 flying-punch misses in 1,200 frames,
with a single map throughout. Measurements are under `native-distance/`,
including `inland-base`, `inland-fast`, `movement-long` and `production`.
Historical aerial counts above use the older starting position.

Native message copies, glyph expansion and outline loops are now faster
without changing their output. Four assembled equivalence tests pass, as
do core title/menu/frames/party/HP/input/lag/HDMA and all 13 short gameplay
checks. The production ROM matches the private tested image. Short
flying-ki misses improve from 14 to 8 and flying-punch misses from 5 to 3;
other short counts are unchanged. Long punches/ki/charge/teleport stay at
2/8/93/67, and flying punches stay at 5. Palette, meter, OBJ, NMI and
graphics-DMA errors remain zero.

The fixed long ki script again drifted into an exit after these savings;
its 32-miss result is invalid and discarded. `--flight-corridor` now offers
a controller-only ki stress circuit, turning twelve pixels either side
of the starting point. It verifies repeated turns, travel and a single
map, with no coordinate writes during measurement. Fresh old/new runs
both have 42 misses in 1,200 frames. This circuit is a different input
policy, so its counts cannot be compared with earlier fixed-input runs.
Measurements: `native-text/outlined-short`, `long`, `circuit-base` and
`circuit-fast`. Crowded strict timing remains open.

Window pattern painting, buffer clearing and cell request updates are
also faster, with seven assembled equivalence tests and core title/menu/
frames/HP/input/lag/HDMA passing. All 13 short cases and six long combat
repeats keep zero hardware errors. Counts remain unchanged: long punches,
ki, corridor flying ki, flying punches, teleport and charge are
2/8/42/5/67/93. Measurements: `native-text/window-short` and `window-long`.
The remaining native message scroll still calls the cell helper twice
per column, making it a separate large CPU spike.

Batched row animation subsequently removes most of those repeated cell
calls. Eight assembled text checks, core title/menu/frames/HP/input/lag/
HDMA and Goku ring/menu/file/load pass. The 1,200-frame flying-ki circuit
improves from 42 to 19 misses. Short flying ki changes 8 → 7 and flying
punches 3 → 4; the other short counts and long ground/teleport/charge
counts stay unchanged, as do long flying punches (5). All 13 short cases
and six long repeats retain zero palette, meter, OBJ, complete-NMI and
graphics-DMA errors. Measurements: `native-text/rows-short`, `rows-long`
and `rows-peaks`. This improves message spikes but does not satisfy the
strict crowded-combat timing target.

The ground foreground-sprite commit subsequently uses word copies and
grouped high-bit packing. Its slot-model comparisons cover every valid
capacity and both runtime paths; core OAM/meta/frames/input/lag/HDMA and
FX gallery/beams/aura/debris pass. Short gameplay counts stay unchanged
with zero hardware errors. Long charging improves from 93 to 83 misses,
while corridor flying ki stays at 19 and teleport at 67. Measurements:
`oam-commit/ground-short`, `ground-long` and `ground-rest`.
Long ground punches/ki and flying punches remain 2/8/5. The production
ROM matches the validated private image, and the slow comparison build
passes the same slot-model checks.

The unrestricted sprite-copy trial is not the runtime policy: it improves
charging to 82 misses but regresses corridor flying ki from 19 to 51.
The tested implementation retains the previous airborne path. Restricting
the copy to five or more foreground sprites also stays out because it
does not improve the common charge workload. These private measurements
are in `oam-commit/long` and `large-long`, respectively.

The direct hand-socket table, faster scenery/barrier scans and large text
word copies subsequently reduce helper costs while preserving their
outputs. Assembled checks cover authored socket coordinates, all packed
tile classes and full native text RAM/CPU state. Destruction/gate/switch
and core/Goku menu checks pass, with clean save and status text.
Long charge/release improves 83 → 80 misses per 1,200 frames; long ground
punches/ki, corridor flying ki, flying punches and teleport stay at
2/8/19/5/67. All 13 short cases and six long repeats remain free of the
tested palette, meter, OBJ, NMI and graphics-DMA errors. Measurements are
under `socket/inline-long`, `skim/long` and `text-words/long`.

A two-piece native-body fast-path trial is also excluded: its helper
falls from 367 to 313 CPU cycles, but the long flying-ki and charge cases
worsen from 19/80 to 22/82 misses, despite teleport improving 67 → 64.
The source retains the three-piece threshold; private results are under
`small-body/`. Strict crowded timing remains open.

Ground teleport subsequently combines its footprint and descriptor checks
and caches endpoint/path verdicts without changing the hero's movement
grid. All 19,996 browser landing queries and 191,964 sweeps still match.
The long teleport case improves from 67 to 52 misses and the short case
from 13 to 12. Its changed workload exposes a native upload peak of
38.73 scanlines; FastROM actor uploads and reduced ground tilemap/HUD
overhead bring that down to 36.84, with zero complete-NMI overruns.

The unrestricted FastROM tilemap/HUD trial is excluded because sustained
flying ki rises from 19 to 51 misses. Keeping that path's original airborne
bank timing preserves 19; charging improves 80 → 79 and ground punches/ki
and flying punches remain 2/8/5 per 1,200 frames. All 13 short cases and
six long repeats retain zero palette, meter, OBJ, NMI and graphics-DMA
errors. Assembled checks compare all descriptor bytes, cache replacement,
ordered native upload writes and CPU/RAM results. Core, Goku, local flight
and world/radar regressions pass. Measurements and rejected trials are in
`teleport-ground/`, with final runs in `final-short`, `compact-uploads-long`
and `final-rest-long`. The production image matches `compact-uploads.sfc`.
This checkpoint improves the worst teleport work but does not close the
strict crowded timing target.

The older unrestricted asynchronous scheduling trials are not in the playable ROM. Deferring companion
AI improved the long walking/punching/ki/teleport cases from 39/24/47/73
to 3/3/17/39 misses, but worsened flying ki from 36 to 50. Deferring normal
enemies too requires moving their weapon-graphics update with animation;
the corrected short trial worsened flying ki from 5 to 17. Both prototypes
and their unit checks remain under `.local/snes-test/` (`companion-budget-prototype` and
`actor-budget-prototype`); they are separate from the later teleport-only
companion queue described below. Smaller scenery batches
also stay out: the four-cell/four-line trial raises long charge misses
from 138 to 170 (`destroy-batch-4`).

The subsequent carried-companion checkpoint implements the requested SNES
flight rule: CPU companions ride Goku, retain status/timer updates and
resume ground AI, contacts, movement and rendering after landing. Human
ownership and live scene/menu/load locks take precedence. Machine-code
gate checks and controller-driven passenger/landing checks pass, along
with core party cadence, flight regressions and Goku status/forms. All
13 gameplay cases keep zero palette/meter/OBJ/NMI errors. The 1,200-frame
flight repeats improve from 429/53 misses to 35/3 for ki/punches. Teleport
and charging remain at 129/166; strict crowded-combat timing is still open.
Measurements: `.local/snes-test/combat-carry-guarded/` and
`.local/snes-test/combat-carry-all/`.

The terrain optimization matches the browser on 289,324 tile comparisons,
19,996 teleport landing queries and 191,964 movement sweeps. Goku's packed
cells match every source byte; native animations and API poses match the
browser. Core input, cadence, menus, sound/events, world, save and lag checks,
flight scenarios, effects/palette checks and combat comparisons cover the
changed paths. Audio checks cover audible cues, bounded dispatch time,
sample integrity and loading/restoring native music.

The highest-priority remaining work is CPU cost during dense flight plus
rapid ki, followed by native reward/graphics-loading spikes when enemies
die. Profiling still finds expensive native actor, movement/collision and
graphics work plus effect construction. More audio removal alone will not
eliminate these stalls. Song/map transitions also retain native pauses.

After the ground OBJ-priority optimization, the late weapon copy in the
long charging run reaches the graphics guard at line 175. Extending its
early DMA cutoff from 160 to 176 reduces that copy from 68.65 to 14.84
scanlines, without waiting or changing interrupt masks. Every transfer
still finishes before the line-196 HUD IRQ; the fixed 2 KiB maximum plus
setup/restoration is bounded below 16 lines. Assembled boundary checks
cover both IRQ states, all sheets/slots and fallback contexts. The 13
short and six long gameplay cases retain zero hardware/rendering errors,
and Goku menus/save/load, passengers/local flight and world/radar checks
pass. Long crowded counts remain 2/3/19/5/52/68 for punches/ki/corridor
flying ki/flying punches/teleport/charge. Measurements and instruction
profiles are under `.local/snes-test/graphics-window/`. Strict crowded
timing remains open; shortening this copy does not remove every stall.

After eliminating duplicate beam scenery work within one field update,
one weapon copy moves to line 199. A second bounded DMA window at sampled
lines 198–206 handles it after the HUD line and before line-225 vblank.
The guard never waits or changes interrupt masks. Boundary checks cover
both windows and their gaps; gameplay checks require completion before
the relevant deadline and a duration below 16 lines. The long charge
peak falls from 410.02 to 369.60 scanlines, with its late DMA taking 13.31
lines including setup/restoration. The six long counts remain
2/3/19/5/52/65. All 13 short cases and six long repeats have zero palette,
meter, OBJ, complete-NMI, graphics-DMA or duplicated beam-work errors.
Goku menus/save/load, FX/aura, passengers/local flight and world/radar
checks pass. Private measurements are in `.local/snes-test/post-hud/`.

Carried companions subsequently retire their stale screen coordinates as
well as their rendered bodies, so native AI cannot target their last ground
position. This changes the aerial workload: long flying-ki/punch counts
become 35/6 rather than 19/5, while the flying-ki peak falls to 270.39 lines.
With that behavior corrected, the FX hash-first lookup and exact native
pursuit-direction lookup improve ground ki 3 → 2, flying punches 6 → 3
and charging 65 → 63 misses; punches/flying ki/teleport stay 2/35/52.
All 13 short and six long cases retain zero rendering/hardware errors;
core, Goku, FX, local flight and world/radar regressions pass. These are
CPU reductions, not a zero-drop result. Private measurements are under
`.local/snes-test/passenger-target/` (`fx-direction-*`).

An exact inline replacement for AI's random-choice rejection loop then
reduces the long six-case total from 157 to 141 misses. The resulting
punch/ki/flying-ki/flying-punch/teleport/charge counts are 1/3/20/3/48/66;
the prior counts were 2/2/35/3/52/63. Ground ki and charge become slightly
worse as changed missed-frame timing alters later input and actor work.
All short/long hardware and gameplay checks, core services, Goku menus
and save/load, local passengers/flight, world/radar/map regressions pass.
The helper itself preserves every random draw and reduces a tested
68-draw sequence from 14,569 to 4,487 CPU cycles. Measurements are under
`.local/snes-test/ai-random/`. Crowded zero-drop timing remains open.

Direct outdoor teleport descriptor checks and reuse of each direction's
first connected footprint reduce the long teleport peak from 365.16 to
295.84 scanlines. The flight module's peak falls 216.76 → 57.39 and target
selection falls 199.16 → 40.70. The same run has 54 misses versus 48 before
the change; later input and target workload differ. The five other long
counts remain 1/3/20/3/66 for punches/ki/flying ki/flying punches/charge.
All 13 short and six long cases retain zero hardware/rendering errors.
An independent model matches 13,824 full landing searches; the 27-scene
browser comparison and passenger/water/teleport/whip/custom-enemy tests
pass. Private measurements are under `.local/snes-test/teleport-direct/`
(`prefix-*`). These changes reduce teleport's worst CPU spike, but strict
crowded zero-drop timing remains open.

The pose divider's small-input paths reduce a first-clip call from 647
to 35 CPU cycles and a 120/24 call from 677 to 388. The short flying-ki
profile uses this helper 26 times; charging in that fixture does not use
it. All 13 short and six long cases retain their preceding miss counts
and zero hardware/rendering errors. Complete native-animation/API pose
comparisons, Goku rendering/menus/save/load and local flight checks pass.
Private measurements are under `.local/snes-test/goku-division/`; this
removes avoidable pose cost rather than solving the larger native spikes.

The native actor palette's fixed copy and an empty status-effect mask
scan are subsequently shortened without changing their output. The
short charging case's native status peak falls 67.67 → 64.41 scanlines;
long ground punch/ki/flying-punch logic peaks fall 261.22/286.26/310.58
to 258.00/283.03/307.28. Miss counts remain 1/3/20/3/54/66. The 13 short
and six long cases keep zero hardware/rendering errors; core, Goku,
FX/aura, passengers/local flight and world/radar/map checks pass.
Measurements are under `.local/snes-test/native-palette/`; the reference
instruction profile is `status-hot/cycles-span/`. The larger beam and
native actor spikes still prevent strict crowded zero-drop timing.

Beam terrain and barrier scans now share a 12-line growth budget with
eight-cell steps. They alternate priority and retain the latest arguments
before either runs, so the second part can wait without starving or
losing work after the beam ends. Punches remain immediate. A step can
still exceed the budget; it no longer forces an additional expensive
step of the other part. The long charge peak falls 364.08 → 311.00 lines
and misses 66 → 63. The other five long counts stay 1/3/20/3/54.
All 13 short and six long cases retain zero palette, meter, OBJ,
complete-NMI, graphics-DMA and duplicated-work errors. Assembled budget
and class/skim checks, the complete destruction/Sandship suites,
passengers/local flight and world/radar/map checks pass. Measurements are
under `.local/snes-test/destroy-shared/` (`step8.sfc`, `short/`, `long/`
and `step8-long/`). The 16-cell shared-budget prototype lowers the peak
but increases misses 66 → 67 and is not the selected build. Remaining
peaks combine native companion AI/animation, movement and FX costs;
crowded strict zero-drop timing remains open.

The teleport-only companion queue keeps fixed status/timer ticks and
finishes each deferred AI/animation job within four field updates. It
handles the first physical L+B frame, camera recovery and draining after
teleport; human-owned actors and ordinary actions keep their regular
timing. This lowers long teleport misses 54 → 23 per 1,200 frames and the
short count 8 → 2 per 240. The other long counts remain 1/3/20/3/63 for
punch/ki/flying ki/flying punch/charge. The selected run has a 313.73-line
teleport peak versus 295.84 before this queue: changed actor/input timing
does not uniformly improve peaks. An earlier candidate omitted the first
button frame and had 16 misses but a 361.31-line peak; it is not selected.

All 13 short and six long cases retain zero palette, meter, OBJ,
complete-NMI, graphics-DMA and duplicate-work errors. Eleven assembled
party tests plus core, Goku rendering/menus/save/load, passenger/local
flight and world/radar/map checks pass. Private measurements are in
`.local/snes-test/party-budget-current/` (`verified.sfc`, `verified-short/`
and `verified-long/`); the production image matches this candidate.
The queue's map/magic/reset guards and deadline checks are documented in
[engine.md](engine.md). Strict crowded zero-drop timing remains open.

Ground footprint queries now read ordinary clear floor directly, retaining
the shared cache for blocked cells and special geometry. An ordinary
single-cell landing falls from 1,109/653 CPU cycles cold/warm to 609 for
both. The long teleport count improves 23 → 14 per 1,200 frames; its
flight-module peak falls 127.31 → 101.22 scanlines, while total-frame peak
is essentially unchanged at 313.73 → 314.21. Other long counts stay
1/3/20/3/63, and all 13 short cases retain their preceding miss counts.
All hardware/rendering checks remain clean. Nine assembled classification
and landing tests, passengers/local flight/ceilings/holes and world/radar/map
checks pass. The full browser comparison matches 289,324 classified tiles,
19,996 landing searches, 79,988 ground footprints and 191,964 sweeps.
Measurements are under
`.local/snes-test/flight-class-direct/` (`ground.sfc`, `ground-short/`,
`ground-long/` and `ground-rest-long/`). The broader classifier prototype
also sped up air queries, but raised long flying-ki misses 20 → 31; it is
excluded. Remaining native actor and landing-search bursts still prevent
strict crowded zero-drop timing.

Teleport searches also retain a failed connected-path distance per
direction. Farther candidates contain the same blocked rectangle; only
shorter candidates still need testing. The independent model's 13,824
searches include 1,123 verified cutoffs, and its worst search falls
34,554 → 31,719 CPU cycles. The full 27-scene browser landing/footprint/
sweep comparison and passengers/local flight/holes pass. All 13 short
and six long cases retain zero hardware/rendering errors and the same
miss counts (long: 1/3/20/3/14/63). The measured teleport peak improves
314.21 → 313.20 lines. Measurements are in `.local/snes-test/teleport-cutoffs/`
(`final.sfc`, `final-short/`, `final-long/`); strict crowded timing remains open.

An additional first-press companion delay is excluded. It keeps AI out
of teleport's first search frame and lowers that long peak to 285.90
lines, but raises short misses 2 → 4 and long misses 14 → 15. The
combined delay/cutoff prototype lowers the peak to 284.70 with the same
worse counts. Its source patch and measurements remain private under
`party-first-search/` and `teleport-cutoffs/`; production retains the
queue from the earlier checkpoint.

The native attribute clamp's combat hook now uses tail jumps instead of
rewriting a JSL return on each of four loop-back branches. Its five-value
loop falls from 368 to 230 CPU cycles, with 7,233 comparisons preserving
CPU state, scratch, clamped attributes and the single Heavy Gi adjustment.
Seven browser/cartridge combat comparisons pass, including defeat rewards
and both Heavy Gi forms. All 13 short and six long gameplay cases retain
zero hardware/rendering errors; long misses remain 1/3/20/3/14/63.
Punching/ki/flying-punch peaks fall from 258.82/283.79/307.75 to
257.32/282.36/306.25 lines. The selected ROM and measurements are under
`.local/snes-test/stat-clamp/`; strict crowded timing remains open.

A broader companion queue triggered by late native actor work is excluded.
At scanline 150 it lowers the punching/ki peaks to 248.17/257.37 but leaves
their missed-frame counts unchanged and raises long charging 63 → 64.
Starting at 110 changes long flying ki/punch misses from 20/3 to 27/7,
despite improving teleport 14 → 11. These experiments are private under
`party-late/`; production retains the teleport-only queue. The native
death transition and its graphics/reward work remain intact.

Three native weapon setup/palette calls subsequently use their FastROM
mirrors. Their 5,665 differential cases retain CPU/WRAM/I/O output while
a representative setup reduces slow ROM reads from 171 to 4. Goku
rendering/menus/load and passengers/local flight pass, as do all 13 short
and six long gameplay cases with zero hardware/rendering errors. Long
misses remain 1/3/20/3/14/63; punching/ki/flying-punch peaks fall slightly
to 256.84/281.81/305.78 lines. Two additional animation-directive mirrors
raised long charging 63 → 64 and are excluded. The selected ROM and logs
are under `.local/snes-test/animation-fast/` (`weapon.sfc`, `weapon-short/`,
`weapon-long/`); strict crowded timing remains open.

The ordinary F9 death animation never reads its newly prepared weapon-0
sheet. Leaving that 2 KiB buffer untouched, while retaining the decoder's
return state and all native setup, removes the crowded punching miss:
both 240 and 1,200 video frames now pass strict zero-drop timing. The
gameplay runner requires zero misses for this punching fixture. Long
flying punches improve 3 → 2; short charging improves 32 → 31. The long
counts are now 0/3/20/2/14/63, with no palette, meter, OBJ, complete-NMI,
graphics-DMA or duplicate-work errors. Punching/ki/flying-punch peaks are
240.25/268.16/292.05 lines. Other crowded timing remains open.

The skip is restricted to native enemy slots, species F9, dead status
and no weapon attachment; other death styles and decimal mode keep their
copy. Assembled checks preserve registers, flags and other RAM, and verify
that later slot reuse replaces all skipped bytes. The Mesen core test
poisons the unused buffer, observes real CPU/DMA reads, and checks native
body uploads, +2 GP/+1 XP, removal and treasure initialization. Ordinary
and forced-drop reference runs each retain 251 matching frame hashes
after the buffer is poisoned. Ten browser/cartridge combat comparisons,
passengers/local flight and world/radar/map checks pass. Measurements are
under `.local/snes-test/death-weapon/`; the earlier read/poison investigation
is under `death-reads/`.

Extending the bounded companion queue specifically to ground ki attacks
removes all three remaining misses in that fixture: 240 and 1,200 video
frames now pass strict timing, and ki is a required zero-drop case in the
runner. The long ki peak falls 268.16 → 240.05 lines. Punching stays at zero;
long corridor flying ki/flying punch/teleport/charge remain 20/2/14/63.
All short and long hardware checks pass. The broader punch/charge trial
added one long punch miss and is excluded. The selected gate uses the
active blast pose or physical Y without L; other actions and human
companions keep their regular schedule. Twelve assembled queue checks,
Mesen status/AI cadence with and without player two, ten combat comparisons,
Goku menus/status/forms and passenger/water/teleport/whip checks pass.
Artifacts are under `.local/snes-test/party-combat/` (`ki.sfc`, `ki-short/`,
`ki-long/` and the `ki-*` logs). The crowded strict timing target remains open.

Hardware sprite-priority rotation now also applies during local flight.
The current baseline's long flying-punch count improves 2 → 1, with its
peak falling 292.05 → 289.55 scanlines. Long corridor flying ki remains
20 misses; its peak changes 272.88 → 274.10 as input/actor timing changes.
Short flying ki/punch improve 6/2 → 5/1; the other eleven short cases are
unchanged, with zero hardware/rendering errors throughout. Assembled OAM,
native sprite ordering, Goku menus/load, passengers/local flight and all
eight world/radar/map cases pass. Measurements are under
`.local/snes-test/oam-air-current/`. Strict crowded timing is still open.

Beam scenery and barrier scans now run after FX, before scanline 160, only
when no NMI has interrupted the current combat update. Immediate damage
and point-blank hits keep their original timing. The pending beam retains
its peak length/width through fading and its submitted collision layer;
otherwise delaying the scan could miss the Earth Palace hit tile. The
full destruction/barrier/Sandship suite passes, including that timeline.
Charging/beam poses also use the bounded companion AI queue, with status
cadence and human controls unchanged. Long charge misses improve 63 → 50
per 1,200 video frames (peak 283.51 lines); the other long counts remain
0/0/20/1/14 for punch/ki/flying ki/flying punch/teleport. Short charge misses
improve 31 → 30. All hardware/rendering checks remain clean. Seventeen
assembled scheduler/companion checks, native cadence, ten combat comparisons,
Goku presentation, local flight and world/radar/map tests pass. The ROM and
logs are under `.local/snes-test/beam-late/` (`final.sfc`, `final-short/`,
`final-long/`). Strict crowded timing remains open.

Writing horizontal beam tables directly removes general run-writer work
for fully visible opaque strips. The prebuilt colors, live backdrop and
neutral padding remain identical; clipped/transparent records keep the
general path. The seven-band builder falls 2,938 → 1,727 CPU cycles, and
long charging improves 50 → 47 misses (peak 283.51 → 276.56 lines). The
other five long and all thirteen short miss counts stay unchanged, with
zero hardware/rendering errors. All assembled FX checks and Mesen beam/aura
pixel comparisons pass, including both buffers and the 127-line boundary.
Artifacts are under `.local/snes-test/strip-direct/`; the default final ROM
matches the measured candidate byte for byte. Strict crowded timing is open.

Goku's unchanged-palette comparison now unrolls its fifteen colors. All
608 assembled full-state comparisons pass, including individual native
color writes, form/status changes and water-slot transitions. An unchanged
call falls from 549 to 352 CPU cycles against the patched loop reference.
The long charge run improves 47 → 44 misses (peak 276.56 → 275.68 lines);
other short/long counts stay unchanged. Goku's seven presentation/menu/load
cases and all gameplay hardware checks pass. Artifacts are under
`.local/snes-test/goku-palette-scan/`, and the default build matches the
measured candidate byte for byte. Strict crowded timing remains open.

The native AI operand advance and its ten wrappers now avoid redundant
width, tag-test and return-stack work. All 86,656 assembled comparisons
retain CPU context and live RAM; the forward/branch wrappers fall
75 → 61 / 118 → 109 cycles. Ten combat and six local-flight regressions
pass. Short flying ki improves 5 → 3 misses; the six long counts remain
0/0/20/1/14/44, with all hardware/rendering checks clean. Artifacts are
under `.local/snes-test/ai-advance/`; `final.sfc` matches the measured
`fixed.sfc` byte for byte. Strict crowded timing remains open.

Flight's Goku body now uses its fixed palette 1/priority 3 before scanning
the native water/ledge rows. The full emitter retains identical output in
3,204 assembled cell/miniature/clipping comparisons; a representative body
falls 1,059 → 798 CPU cycles. Seven presentation/menu/load cases, all native
actions and pose APIs, scripted sockets, local flight and world/radar/map
tests pass. Short flying ki improves 3 → 2 misses and long corridor flying
ki improves 20 → 19 (peak 272.67 → 271.32 lines); other counts stay unchanged
with zero hardware/rendering errors. Artifacts are under
`.local/snes-test/goku-air-attr/`; `final.sfc` matches `game.sfc` byte for byte.
Strict crowded timing remains open.

The FX palette scan now enters an unrolled sequence at the occupied OAM
group. The differential test also exposed a correctness bug in the old
loop: its 16-bit cursor update retained accumulator B after sprite 64,
so byte `TAX` wrote past the marker table and overlooked later palettes.
The new path and the comparison loop both keep B zero. An 80-sprite scan
falls 1,829 → 1,308 CPU cycles against that corrected reference. All cursor,
palette, front-group and buffer comparisons pass, along with all 18 FX
assembly checks, gallery, beam/aura pixels, debris, local flight and world
tests. Long flying ki improves 19 → 13 misses (peak 271.32 → 252.18 lines);
other short/long counts stay unchanged, with zero hardware/rendering errors.
Artifacts are under `.local/snes-test/fx-palscan/`, and the default final ROM
matches the measured candidate. Strict crowded timing remains open.

Several old handoff items were already finished before this review:
floor-hole providers chain correctly, ceiling debris is drawn, Frieza's
virtual combat targets are wired, and FastROM is the default. The carried
companion render path, recovery-camera attack lock and teleport clock are
now resolved by this pass.

These documented gaps remain separate from the measured performance fixes:

- Resolved in the flight/world follow-up: L+R uses one shared route for
  outdoor takeoff and ceiling escape; boss, status, scene and camera locks
  apply before either route. See [flight.md](flight.md#remaining).
- Time Chamber floor tiles reject teleport landing in both the cartridge
  and browser. Allowing it needs a shared gameplay rule, not just an SNES
  timing change.
- Senzu targeting, some status/equipment interactions and less common
  rendering paths still need the reference comparisons listed in
  [combat.md](combat.md#remaining-work) and [goku.md](goku.md#remaining-work).
- The cartridge has no scouter: it was cut for resources on the
  maintainer's request. Primm's Analyzer shows its target's power-level
  reading instead; busy frames can defer it. This is separate from the
  corrected Dragon Radar and quest panel. See
  [ui.md](ui.md#analyzer-readouts-scouterasm-scouter-readoutsasm-scouter-objasm).
- Less common story, boss and ending routes still need broader playthrough
  coverage. Physical-console and flash-cartridge testing remains open.
