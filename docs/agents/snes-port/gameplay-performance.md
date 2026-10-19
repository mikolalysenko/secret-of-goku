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

## Validation and remaining work from Claude's notes

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
