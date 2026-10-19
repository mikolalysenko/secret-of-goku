# Goku gameplay review — October 18, 2026

The cartridge already had Goku's movement, combat, local/world flight,
teleport, story and boss modules. The main problems in this review were
integration bugs and CPU/vblank cost. The default build now favors resident
SNES audio and compact effects. It is substantially smoother, but crowded
combat is not yet guaranteed to run without missed video frames.

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
- Scouter power-level readouts and Analyzer overlays are still absent;
  the switch works. This is separate from the corrected Dragon Radar and
  quest panel. See [ui.md](ui.md#core-requests).
- Less common story, boss and ending routes still need broader playthrough
  coverage. Physical-console and flash-cartridge testing remains open.
