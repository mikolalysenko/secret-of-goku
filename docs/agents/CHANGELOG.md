# Changelog

Several Claude Code sessions work on this repository in parallel. Each entry
lists what landed, grouped by the work stream that produced it, so changes
stay traceable even when they are committed together.

## SNES unused death-weapon copy (2026-10-19)

- Omit the unused 2 KiB weapon-0 copy for ordinary dead F9 enemies with
  no weapon attachment. Keep the native death animation, palette setup,
  rewards, drops and cleanup. Other actors/death types retain their copy.
- Crowded ground punching now passes strict zero-drop timing for 1,200
  video frames and is a required zero-drop gameplay case. Long flying
  punches improve 3 → 2 misses; short charging improves 32 → 31. Other
  crowded drops remain: long ki/flying ki/teleport/charge are 3/20/14/63.
- Decoder/slot-reuse checks, native death/treasure lifecycle checks, ten
  combat comparisons, local flight and world/radar/map checks pass. All
  13 short and six long gameplay runs retain zero hardware/rendering
  errors. Corrupting the unused buffer produces matching frame hashes in
  both ordinary and treasure-drop reference runs.

## SNES native weapon setup through FastROM (2026-10-19)

- Run native weapon setup, sheet preparation and palette refresh through
  their FastROM mirrors. 5,665 differential cases retain identical CPU,
  WRAM and multiplier output; a representative setup reduces slow ROM
  reads from 171 to 4.
- Goku rendering/menus/load, passengers/local flight and all 13 short/six
  long gameplay checks pass. Long misses remain 1/3/20/3/14/63, with small
  reductions in defeat-frame peaks. The additional animation-directive
  mirrors increased charging misses and are excluded. Zero-drop crowded
  gameplay remains open.

## SNES native attribute-clamp overhead (2026-10-19)

- Replace repeated JSL return-address rewriting in the native attribute
  clamp with tail jumps. Heavy Gi still applies once, after the five
  native attributes have been clamped. The measured loop falls from
  368 to 230 CPU cycles with identical registers, flags and scratch.
- 7,233 differential cases and seven browser/cartridge combat comparisons
  pass, including rewards and both Heavy Gi forms. All 13 short and six
  long gameplay cases retain zero hardware/rendering errors. Long miss
  counts remain 1/3/20/3/14/63; this reduces some peaks by about 1.5 lines
  but does not resolve crowded zero-drop timing.
- A broader late-companion queue stays out: its earlier cutoff worsens
  flying combat, while the later cutoff adds a charging miss despite
  lowering punching and ki peaks. Measurements remain private.

## SNES failed teleport path reuse (2026-10-19)

- Retain the shortest failed connected path per direction during one
  landing search. Farther candidates contain that blocked rectangle;
  shorter candidates keep their original order. Airborne targets and
  floor-hole providers retain their original checks.
- The independent model matches all 13,824 searches and verifies 1,123
  failed-path cutoffs. Its worst search falls 34,554 → 31,719 CPU cycles.
  The full 27-scene browser comparison, passengers/local flight/holes
  and all 13 short/six long hardware checks pass.
- Long miss counts remain 1/3/20/3/14/63; teleport's peak falls only
  314.21 → 313.20 lines. An extra first-press companion delay lowered
  the peak further but increased miss frequency, so it remains a private
  experiment. Strict crowded zero-drop timing is still open.

## SNES ordinary-floor landing cost (2026-10-19)

- Read ordinary clear floor directly for ground footprints. Caves, ferry
  corridors, protected cells and blocked terrain retain the shared
  classifier; air queries retain its low-obstacle cache. All height bands,
  live tile keys and footprint-edge rules remain unchanged.
- A single-cell landing falls from 1,109/653 CPU cycles cold/warm to 609
  for both. Long teleport misses improve 23 → 14 per 1,200 frames; its
  flight-module peak falls 127.31 → 101.22 lines. The other long counts
  remain 1/3/20/3/63 for punch/ki/flying ki/flying punch/charge. Total
  teleport peak remains about 314 lines, so strict crowded timing is open.
- Nine assembled classification/landing tests, the full browser terrain
  comparison, passengers/flight/ceiling/holes and world/radar/map checks
  pass. All 13 short and six long cases retain zero palette, meter, OBJ,
  complete-NMI, graphics-DMA and duplicate-work errors. The broader air
  classifier prototype worsened sustained flying ki and is excluded.

## SNES companion timing during teleport (2026-10-19)

- Keep companion status/timer ticks fixed while deferring their CPU
  AI/animation during teleport, including the initial L+B frame and
  camera recovery. Run the oldest waiting member first, at most one per
  field, with a four-field deadline before its next native tick. Drain
  pending work before resuming the regular schedule. Human controls and
  the live passenger gate remain immediate.
- Keep queue state in guarded volatile SRAM; clear it on scene/map/load
  boundaries. Eleven assembled party tests and core, Goku, passengers,
  local flight and world/radar/map checks pass. All 13 short and six long
  gameplay cases retain zero hardware/rendering errors.
- Long teleport misses improve 54 → 23 per 1,200 frames; short misses
  improve 8 → 2 per 240. The other long counts remain 1/3/20/3/63 for
  punch/ki/flying ki/flying punch/charge. The changed teleport workload's
  peak rises 295.84 → 313.73 lines, so this improves miss frequency but
  does not resolve strict crowded zero-drop timing.

## SNES shared beam scenery budget (2026-10-19)

- Share a 12-scanline budget between beam terrain and barrier scans,
  using eight-cell growth steps and alternating priority. Save the latest
  beam arguments before either part runs; continue unfinished work after
  the beam ends and cancel it on map/event changes. Punches retain their
  immediate terrain and barrier checks.
- Assembled tests cover budget boundaries and video-counter wrap, fair
  progress, argument retention, replacement/cancellation and duplicate
  work. Full destruction and Sandship comparisons pass, along with
  passengers/local flight and world controls, radar, map and timing.
- The crowded charging peak falls 364.08 → 311.00 scanlines; its long
  miss count improves 66 → 63 per 1,200 frames. Other long counts stay
  1/3/20/3/54 for punch/ki/flying ki/flying punch/teleport. All 13 short
  and six long cases retain zero hardware/rendering errors. Crowded
  strict zero-drop timing is still open.

## SNES native palette and empty status work (2026-10-19)

- Copy the native actor palette's fifteen words directly to both WRAM
  mirrors, avoiding repeated index/counter updates. Preserve the original
  loop for narrow indexes, index wrap and unusual counts. Skip the native
  status-effect bit scan when its mask is empty, retaining its scratch,
  flags and saved-register epilogue. Nonempty masks keep the retail loop.
- Assembled checks compare all palette species/party-status combinations,
  CPU contexts, boundaries and all 65,535 nonempty masks against retail.
  Representative palette/empty-scan costs fall 618 → 398 and 478 → 65
  CPU cycles. The crowded charge case's native status peak falls
  67.67 → 64.41 scanlines; ground punch/ki peaks fall by about 3.2 lines.
- All 13 short and six long gameplay cases retain zero palette, meter,
  OBJ, complete-NMI, graphics-DMA and duplicate-work errors. Core, Goku
  rendering/forms/menus/save/load, FX/aura, passengers/local flight and
  world/radar/map checks pass. Long counts remain 1/3/20/3/54/66 per 1,200
  frames, so the strict crowded zero-drop target remains open.

## SNES Goku pose division (2026-10-19)

- Return immediately when a pose dividend is smaller than its divisor,
  and skip the leading eight zero bits for byte dividends. Keep software
  arithmetic, the full word path and exact CPU/scratch results, including
  decimal and zero-divisor behavior. Representative calls fall from
  647 to 35 CPU cycles within the first clip and 677 to 388 for 120/24.
- Assembled comparisons cover every nonzero byte pair, all word dividends
  across representative divisors, boundaries and caller flags. Goku's
  12,748 native-animation frames and 1,715 action-request frames still
  match the browser. Scripted-sprite checks now follow actual PPU priority
  rotation rather than assuming physical OAM slot zero is foreground.
- Goku rendering, forms, status, menus/save/load, scripted poses, CPU
  budget, passengers, water/teleport/whip flight and ceiling exits pass.
  All 13 short and six long gameplay cases retain zero hardware/rendering
  errors. Long crowded counts remain 1/3/20/3/54/66 per 1,200 frames;
  this smaller pose cost does not yet eliminate those misses.

## SNES teleport search spikes (2026-10-19)

- Read ordinary outdoor tile descriptors directly for teleport landing;
  cave, ferry and other special geometry retain the shared classifier.
  A single-cell endpoint takes 551 CPU cycles cold or warm. Within each
  search, check the common first connected footprint once per direction
  and reject every farther candidate when that footprint is blocked.
- An independent model matches 13,824 complete landing searches, including
  4,024 successful landings. The full 27-scene browser comparison retains
  zero differences across 19,996 landing queries and 191,964 sweeps;
  passenger, water, teleport, whip and custom-enemy flight checks pass.
- The long teleport peak falls 365.16 → 295.84 scanlines and the flight
  module's peak falls 216.76 → 57.39. Misses change 48 → 54 per 1,200
  frames as later workload changes, so this reduces a CPU spike without
  solving crowded zero-drop timing. The other five long counts are
  unchanged. All 13 short and six long cases retain zero palette, meter,
  OBJ, complete-NMI, graphics-DMA and duplicate-work errors.

## SNES native AI random-choice overhead (2026-10-19)

- Inline the native byte generator inside AI's random-nibble rejection
  loop instead of rebuilding three wrapper stack frames for each draw.
  Keep every rejected draw, RNG state/scratch byte, result and CPU return
  contract; decimal and eight-bit-index callers retain the original path.
- Assembled differential checks cover all 16 limits, all 15 RNG indexes,
  131 seed states and CPU-state fallbacks. One draw falls 284 → 185 CPU
  cycles; the longest tested sequence (68 draws) falls 14,569 → 4,487.
- Six long gameplay repeats total 157 → 141 misses: punches/ki/flying
  ki/flying punches/teleport/charge become 1/3/20/3/48/66 per 1,200 frames,
  versus 2/2/35/3/52/63. Timing changes alter subsequent input/workload;
  ground ki and charge are slightly worse, so this is not a uniform gain
  or the final zero-drop result. All 13 short and six long cases retain
  zero palette, meter, OBJ, complete-NMI, graphics-DMA and duplicate-work
  errors. Core, Goku menus/save/load, local passengers/flight and world
  controls/radar/map checks pass.

## SNES repeated AI and effect work (2026-10-19)

- Replace native pursuit-direction classification with an exact byte
  lookup, retaining height, wrapping, CPU state and unusual-input fallbacks.
  A representative call falls from 367 to 291 CPU cycles; assembled checks
  cover all 65,536 byte-magnitude pairs and additional boundary/flag cases.
- Check the FX cache's matching hash entry before its residency bitset.
  Every residency reset now invalidates those hints, including partial
  region changes. A warm lookup falls 230 → 157 cycles and a foreground
  stamp 740 → 667. Tests cover stale hints, eviction, pending uploads,
  exhausted palettes and scene/region invalidation.
- Re-evaluated after correcting carried-companion targets, the combined
  changes improve long ground-ki/flying-punch/charge misses from 3/6/65
  to 2/3/63 per 1,200 frames; punches/flying ki/teleport retain 2/35/52.
  All 13 short cases and six long repeats have zero palette, meter, OBJ,
  complete-NMI, graphics-DMA or duplicate beam-work errors. Core, Goku
  menus/save/load, FX/aura, local passengers/flight and world/radar checks
  pass. Strict crowded zero-drop timing remains open.

## SNES carried-companion target visibility (2026-10-19)

- Retire carried companions' native screen coordinates along with their
  body rendering. Skipping the renderer left their last ground coordinates
  eligible for enemy AI targeting. World position, actor slots, status and
  ownership remain live; ordinary rendering restores target coordinates
  after landing, human reassignment or scripted ownership.
- Assembled checks exercise both native target predicates, and the local
  passenger test checks target-coordinate restoration alongside status,
  movement, AI and drawing. Local flight, Goku menus/save/load and all
  world/radar checks pass. All 13 short gameplay cases and both long aerial
  attack runs retain zero palette, meter, OBJ, NMI and graphics-DMA errors.
- This fixes target behavior, not the remaining timing issue. The long
  flying-ki/punch cases have 35/6 misses per 1,200 frames versus 19/5 with
  the stale targets; flying-ki peak logic falls 286.49 → 270.39 lines.
  Separate cache, direction-lookup and companion-phase experiments remain
  private because they did not improve the integrated timing cases.

## SNES graphics transfer after the HUD line (2026-10-19)

- Add a second bounded ROM-to-WRAM DMA window at sampled scanlines
  198–206. The transfer finishes before line-225 vblank; the intervening
  lines and all previous context guards retain the interruptible CPU copy.
  There is no wait or change to interrupt masks.
- The long charging peak falls from 410.02 to 369.60 scanlines. Its late
  transfer takes 13.31 lines including setup/restoration. Six long crowded
  runs retain 2/3/19/5/52/65 misses per 1,200 frames, so zero-drop crowded
  gameplay remains unfinished.
- Boundary/CPU-state comparisons, all 13 short gameplay cases, six long
  repeats, Goku menus/save/load, FX/aura, local passengers/flight and
  world/radar checks pass. Gameplay records zero palette, meter, OBJ,
  complete-NMI, graphics-DMA and duplicated beam-work errors.

## SNES beam continuation cadence (2026-10-19)

- Replace the beam worker's frame-number comparison with a per-field
  work latch. Combat runs before `core_frame` advances, while the deferred
  worker runs after it; the old comparison allowed both to scan during
  one field update. The latch is cleared after the field service and on
  map/load initialization, and also covers debug-triggered hits.
- The gameplay regression counts repeated scans of the same attack and
  rejects six duplicated field updates in the preceding short charge run.
  All 13 short cases and six long repeats now have none, with zero palette,
  meter, OBJ, complete-NMI and graphics-DMA errors. Long charging improves
  68 → 65 misses per 1,200 frames; its deferred worker peak falls from
  42.08 to 5.69 scanlines. Other long counts remain 2/3/19/5/52. A late
  weapon copy moves beyond the early DMA window, leaving a 410.02-line
  peak; strict crowded timing remains open.
- The full destruction/Sandship suite, core cadence/input/menus/save/lag/
  HDMA checks, passengers/local flight and world/radar checks pass. Existing
  documented browser timing differences in demolition remain.

## SNES guarded graphics transfer window (2026-10-19)

- Permit the existing bounded ROM-to-WRAM DMA through sampled line 176,
  retaining its field/vector/menu/HDMA guards and interruptible fallback.
  The transfer, setup and restoration still finish before the line-196
  HUD interrupt. Boundary comparisons cover all sheets/slots with IRQs
  enabled and masked; gameplay checks reject line wrap and late completion.
- The long charge run's late weapon copy falls from 68.65 to 14.84 scanlines.
  Its worst logic frame changes 385.70 → 382.31 lines. The six long crowded
  cases retain 2/3/19/5/52/68 misses per 1,200 frames for punches/ki/flying
  ki/flying punches/teleport/charge, so strict zero-drop timing remains open.
- All 13 short cases and six long repeats retain zero palette, meter,
  OBJ, complete-NMI and graphics-DMA errors. Goku field/status/forms/menus/
  save/load, local passengers/water/teleport/whip, and world takeoff/locks/
  landing/controls/ki/radar/map/timing checks pass.

## SNES ground effect priority (2026-10-19)

- Append ground foreground effects and select their draw order with the
  PPU's OBJ priority register, avoiding a copy of the entire native sprite
  list. Keep the same reservation, capacity, sprite attributes and DMA
  payload. Six foreground pieces plus 192 native bytes fall from 1,895 to
  712 CPU cycles. Native ring/map clears also retire the priority state.
- Run OAM upload and the remaining native NMI through FastROM. Timing
  probes watch both native mirrors, including incomplete frames. Ordered
  hardware writes, CPU state and all valid sprite capacities pass the
  assembled checks; rendered overlap, lag and ring handoff checks pass.
- Long crowded ground ki improves 8 → 3 misses per 1,200 frames; charging
  improves 79 → 68, with its worst logic frame falling 410.76 → 385.70
  scanlines. Punches/corridor flying ki/flying punches/teleport retain
  2/19/5/52 misses. Local flight retains the preceding physical insertion
  after unrestricted rotation worsened its long ki workload.
- All 13 short cases and six long repeats have zero palette, meter, OBJ,
  complete-NMI or graphics-DMA errors. Core, Goku menus/forms/save/load,
  effects/beam/aura/debris, local passengers/water/teleport/whip, world
  takeoff/landing/controls/ki/radar/map and ending departure/load checks
  pass. Strict zero-drop crowded timing remains open.

## SNES sprite cleanup across modes (2026-10-19)

- Preserve the previous mode until the OAM handoff has hidden the slots
  it relinquishes. The frame dispatcher had stored the new mode too early,
  preventing the intended field/world cleanup from running.
- An assembled handoff check covers field to world, world to field with
  freshly drawn natives, and world to ring. Local passenger/water/teleport/
  whip and world takeoff/locks/landing/controls/ki/radar/map/timing checks
  pass. Core frame, input, ring/menu and sprite regressions also pass.

## SNES attack tile-class queries (2026-10-19)

- Let the scenery and barrier attack scanners discard descriptor scratch
  they immediately replace. Keep the preserving class-cache entry for the
  floor sampler and demolition planner, including its registers and scratch.
  Cold cut-tile classification falls from 535 to 374 CPU cycles. Both paths
  agree across tile IDs, layers, descriptor bytes, map policies and live
  cache nibbles. `DESTROY_CLASS_SLOW` retains the preserving attack path.
- Eighteen scenery, growing-beam, brazier, gate/switch and demolition cases
  pass. The Fortress's existing eight-tile difference from browser timing
  remains; its final grid is identical to the preceding cartridge build.
- All 13 short gameplay cases and six long combat repeats retain their
  missed-frame counts and zero palette, meter, OBJ, complete-NMI or
  graphics-DMA errors. Local passengers/water/teleport/whip and world
  takeoff/landing/controls/ki/radar/map checks pass. Strict crowded timing
  remains open.

## SNES interruptible graphics copies (2026-10-19)

- Copy predecoded death and weapon sheets in unrolled words when their
  guarded early-frame DMA is unavailable. Keep interrupts, channel state,
  retail bytes, direct-page scratch and the complete CPU return contract.
  All three colour variants must fit their source bank. The death copy
  falls from 11,459 to 9,894 CPU cycles; the weapon copy from 14,627 to
  12,614. `CORE_NATIVE_GRAPHICS_MVN` retains the previous copy for comparisons.
- The worst long charging frame falls from 420.13 to 410.76 scanlines.
  Missed-frame counts remain unchanged: 2/8/19/5/52/79 per 1,200 frames
  for crowded punches/ki/corridor flying ki/flying punches/teleport/charge.
  This reduces a loading spike but does not close strict crowded timing.
- All 13 short cases and six long combat repeats retain zero palette,
  meter, OBJ, complete-NMI and graphics-DMA errors. Expanded assembled
  comparisons cover late transfers with IRQs enabled and masked, every
  sheet and actor slot. Core, Goku menus/forms/save/load, passenger/local
  flight and world takeoff/landing/controls/ki/radar/map checks pass.

## SNES teleport terrain and native upload cost (2026-10-19)

- Combine ordinary ground teleport's landing and descriptor checks in one
  tile walk, with cached endpoint/path verdicts. Keep pixel queries for
  airborne targets and floor-hole providers. Both implementations pass
  the assembled descriptor/cache tests; the optimized code matches all
  19,996 browser landing queries and 191,964 sweeps across 27 scenes.
- Run native actor graphics uploads through FastROM and reduce ground
  tilemap/HUD upload overhead. Preserve the original airborne map/HUD
  timing after an unrestricted trial regressed sustained flying ki.
  Ordered hardware writes, RAM and CPU state match the native paths.
- Long crowded teleport improves 67 → 52 missed frames per 1,200 and
  charging 80 → 79. Ground punches/ki, corridor flying ki and flying
  punches remain 2/8/19/5. All 13 short cases and six long repeats have
  zero palette, meter, OBJ, complete-NMI or graphics-DMA errors. The
  teleport trial's 38.73-line native-upload spike falls to 36.84 lines.
  Strict zero-drop crowded gameplay remains open.
- Passenger/local-flight, world takeoff/landing/controls/ki/radar/map,
  Goku poses/forms/menus/save/load and core frame/input/OAM/audio/HDMA
  regressions pass. `FLIGHT_TP_GROUND_SLOW` and `CORE_NATIVE_NMI_SLOW`
  retain the previous paths for comparisons.

## SNES word copies for message graphics (2026-10-19)

- Copy large, disjoint native text buffers with descending unrolled
  words; retain MVN below 64 bytes and retail loops for other contexts.
  Preserve bytes, registers, flags and source/destination bounds, with
  only interruptible CPU instructions and stack locals.
- The 896-byte helper falls from 6,442 to 5,144 CPU cycles. Eight text
  equivalence checks include every byte alignment around the cutoff.
  Core title/menu/frame/party/HP/input/OAM/lag/HDMA and Goku ring/menu/
  file/load checks pass; save-confirmation and status text remain clean.
  Local passenger/water/teleport/whip and world takeoff/locks/landing/
  controls/ki/radar/map/timing regressions also pass.
- All 13 short gameplay cases and six 1,200-frame combat repeats retain
  their previous missed-frame counts and zero hardware errors. This adds
  headroom but does not close strict crowded timing. `CORE_NATIVE_TEXT_MVN`
  retains the earlier MVN path for comparisons.

## SNES scenery and barrier scan cost (2026-10-19)

- Select the collision layer once per tile run and keep the run counter
  and stride in stack-local direct page. Restore the caller's D/DB and
  preserve candidate ordering, unknown-class stops and scan outputs.
  `DESTROY_SKIM_SLOW` retains the previous loop for comparisons.
- Assembled tests cover all packed class bytes, both layers, positive and
  negative strides, cursor wrapping and caller contexts. A 64-cell scenery
  scan falls from 4,384 to 3,817 CPU cycles; barrier scans from 5,088 to
  4,521. Fifteen destruction, growing-beam, gate and switch cases pass.
- Long charge/release improves from 82 to 80 misses per 1,200 video
  frames; corridor flying ki and teleport stay at 19 and 67. All 13 short
  cases retain their counts, with zero palette, meter, OBJ, NMI and
  graphics-DMA errors. Strict crowded timing remains open.

## SNES direct hand-socket lookup (2026-10-19)

- Resolve Goku's charge/beam hand positions from a generated 512-byte
  table instead of searching the authored columns. Keep both forms, row
  masking, flight lift and missing-pose behavior. `GOKU_SOCKET_SLOW` keeps
  the linear lookup available for comparisons.
- Assembled API tests cover every byte column, all facings, wrapped/lifted
  anchors and caller banks/widths. Field hand queries fall from 197–349 to
  189 CPU cycles in base form. Goku field/status/forms/scripted checks pass.
- All 13 short gameplay cases retain their previous counts and zero
  palette, meter, OBJ, NMI and graphics-DMA errors. In 1,200-frame repeats,
  charge/release improves from 83 to 82 misses; corridor flying ki and
  teleport remain at 19 and 67. Crowded timing remains open.

## SNES foreground sprite commit (2026-10-19)

- Use interruptible word copies and pack four sprite high-bit entries at
  once when inserting foreground effects during ground play. Preserve
  sprite order, padding, capacity and native high-table bytes. Keep the
  existing airborne path: the unrestricted trial worsened long flying ki.
- An independent slot model checks every valid capacity, all packed high
  bytes, partial groups and both runtime paths. With 192 native OAM bytes,
  six foreground sprites cost 1,895 rather than 2,933 cycles; sixteen cost
  2,197 rather than 4,731. Core OAM/meta/frame/input/lag/HDMA and effects
  gallery/beam/aura/debris checks pass.
- Long charging improves from 93 to 83 misses per 1,200 video frames;
  corridor flying ki stays at 19 and teleport at 67. All 13 short gameplay
  counts are unchanged; long ground punches/ki and flying punches stay
  at 2/8/5, with zero hardware errors. Strict crowded timing
  remains open. `CORE_OAM_COMMIT_SLOW` restores the previous path.

## SNES batched window animation (2026-10-19)

- Move interior window columns in batches when opening, closing and
  scrolling native messages. Retain the final retail iteration for exact
  tile exchanges, counters, upload requests and CPU return values. Bounds,
  unusual banks, decimal mode and eight-bit indexes retain native loops.
- Eight assembled text tests cover both directions, odd/even border widths,
  fallbacks and full RAM/CPU comparisons. Ten-column scrolls fall from
  4,467 to 964 cycles; twenty-column borders from 8,938 to 1,741. Core checks
  and Goku ring/menu/save/load checks pass.
- Long corridor flying-ki misses fall from 42 to 19 per 1,200 video frames.
  Short flying ki improves 8 → 7, while short flying punches change 3 → 4;
  long flying punches stay at 5. Ground punch/ki, charge and teleport
  counts are unchanged. All 13 short cases and six long repeats retain
  zero palette, meter, sprite, NMI and graphics-DMA errors. Crowded timing
  remains open.

## SNES window painting and buffer clearing (2026-10-19)

- Simplify native window-pattern blending, clear the message buffer in
  word batches, and mark cell upload requests before restoring the data
  bank. Preserve tile bytes and all CPU outputs, including decimal-mode
  behavior and the request-dependent accumulator and carry.
- Seven assembled text checks pass. Representative helpers fall from
  1,049 to 713 cycles (painting), 13,342 to 4,336 (clearing), and 202 to 169
  (cell exchange). Core title/menu/frames/HP/input/lag/HDMA also pass.
- All 13 short gameplay cases and six 1,200-frame combat repeats remain
  hardware-clean. Missed-frame counts are unchanged; strict timing is
  still open. These savings add CPU headroom without closing the remaining
  message-scroll, actor and destruction spikes.

## SNES native message graphics (2026-10-19)

- Copy message tiles with interruptible MVN, fuse monochrome glyph expansion
  with its vertical outline, and unroll the horizontal outline. Preserve all
  tile bytes, registers, flags and the native carry between outline rows;
  unusual calling contexts retain the retail loops.
- Assembled comparisons measure 22,965 → 6,442 CPU cycles for an 896-byte
  copy, 33,084 → 12,192 for glyph expansion and 20,433 → 14,492 for the
  horizontal outline. Core title/menu/frames/party/HP/input/lag/HDMA pass.
- All 13 short gameplay cases remain hardware-clean. Flying ki improves
  from 14 to 8 misses and flying punches from 5 to 3; other counts stay
  unchanged. Long ground punches/ki/charge/teleport remain 2/8/93/67.
- Add an optional controller-driven flight corridor for long ki stress
  runs. Fixed video-frame reversals could drift into a map exit after CPU
  savings; those invalid runs are discarded. Both old and new builds have
  42 misses in the new 1,200-frame circuit. Strict crowded timing remains
  open; these changes reduce text spikes without eliminating all misses.

## SNES native AI distance lookup (2026-10-19)

- Precompute the retail distance classes in two unused FastROM data halves.
  Preserve height offsets, inclusive boundaries and the 16-bit square-sum
  wrap; decimal and eight-bit-index callers keep the original routine.
  Assembled comparisons cover all 65,536 byte-distance pairs, coordinate
  wrapping, heights and flags. The measured helper falls from 322 to 198
  CPU cycles.
- Move aerial combat timing fixtures away from the nearby east exit and
  keep aura instrumentation specific to aura cases. Faster runs could
  otherwise drift into a map transition and produce misleading counts.
- Core, Goku and flight regressions pass, with zero hardware errors in all
  13 gameplay cases. Comparable 1,200-frame aerial repeats remain at 30
  ki / 5 punch misses; ground punches/ki/charge remain at 2/8/93. Walking
  improves from 11 to 8 and teleport changes from 58 to 67. Strict crowded
  timing is still open; the CPU saving alone does not eliminate the peaks.

## SNES companion phase balancing (2026-10-19)

- Move the girl to native phase 4 and the sprite to phase 0, away from
  expensive enemy updates. Keep their once-per-five-frame status/AI rate,
  per-frame movement and contacts, and the original event-script schedule.
- Core party/timer/input/HP/OAM/lag/HDMA, Goku field/status/forms and flight
  passenger/water/teleport/whip/scene checks pass. All 13 gameplay hardware
  checks remain clean; short walking, flight and grass transformation reach
  zero misses.
- In 1,200 frames, ground punches improve from 24 to 2 misses, ground ki
  from 47 to 8 and charging from 138 to 93. Flying ki stays at 31; flying
  punches change from 1 to 2 and teleport from 73 to 58. Crowded timing
  remains open. Smaller destruction-batch and asynchronous actor trials
  remain private because their longer runs regress.

## SNES prebuilt beam colour tables (2026-10-19)

- Copy opaque, fully visible horizontal beam colour runs from ROM with
  interruptible MVN; retain the general path for clipped or transparent
  strips. The seven-band builder falls from 7,249 to 2,938 CPU cycles.
- Explicitly write neutral HDMA padding when a beam reaches the last
  visible line; the previous writer could reuse its coloured/window run.
- Eleven assembled FX checks cover all 88 records, both buffers, live
  backdrop colours, clipping and padding. Gallery/beams/aura/debris pass.
  All 13 gameplay cases retain zero palette, meter, OBJ, NMI and graphics-
  DMA errors. Long charging improves from 143 to 138 misses per 1,200
  frames; short counts are unchanged. Strict crowded timing remains open.

## SNES single-cell effects and missing rotated tiles (2026-10-19)

- Emit the 300 one-cell ki/impact stamps from compact records, preserving
  tile/palette allocation, clipping, front ordering and OAM capacity. A
  resident front stamp falls from 935 to 740 CPU cycles.
- Fix the generic assembly resolver's missing-tile check: restoring X/Y
  replaced its sign flag, allowing unavailable flipped cells to become
  drawable garbage. Compare the returned tile explicitly with `$FFFF`.
- Nine assembled FX tests and gallery/beams/aura/debris pass. All 13 short
  gameplay cases and four 1,200-frame repeats retain zero palette, meter,
  OBJ, NMI and graphics-DMA errors. Long flying-ki misses improve from 36
  to 31 and charge from 144 to 143; short flying-ki rises from 5 to 7.
  Crowded combat still fails strict timing.

## SNES effect-emitter capacity fix (2026-10-19)

- Fix the fast effect emitter's last-slot calculation. A zero part count
  could wrap to `$FFFF` when exactly one OAM slot remained. Check the cursor
  per emitted part, and let missing cache cells leave space for later
  resident pieces.
- The regression reproduces the old runaway loop. The fixed machine code
  matches the general emitter for all 815 nonempty assemblies at OAM
  capacity, plus missing-cell, clipping, front-reservation and large-sprite
  cases. FX gallery/beams/aura/debris and all 13 gameplay hardware checks pass.
- Existing short gameplay miss counts are unchanged; this fixes a separate
  capacity-dependent stall/corruption risk, not the remaining crowded timing.

## SNES native body sprite construction (2026-10-19)

- Add packed X/Y offsets for interior native body/weapon assemblies.
  Preserve hit shake, clipping, OAM high bits and partial writes through
  the native fallback; direct shadow/attachment emitter calls are unchanged.
- Machine-code comparisons cover every signed-byte offset pair, screen
  edges, full OAM, mixed lists, all hit-shake values and decimal mode. A
  six-piece body falls from 988 to 719 CPU cycles. Core frame/party/OAM/lag,
  Goku field/status/forms and carried-companion checks pass.
- All 13 gameplay cases retain zero palette, meter, OBJ and vblank errors.
  The short charge case improves by one missed frame; long flight/beam
  counts match a fresh build with the optimization disabled. The crowded
  zero-drop goal remains open.

## SNES beam-strip table construction (2026-10-19)

- Store horizontal beam colours as runs and build opaque window spans in
  one call. Keep the same colours, shape, clipping and HDMA end padding;
  transparent records retain their gaps.
- The assembled builder matches every scanline for all 88 generated
  records across screen edges and lengths, plus synthetic transparent
  runs. FX gallery/beams and the 13 gameplay hardware checks pass.
- The measured strip path falls from 49.53 to 36.51 scanlines. Charging
  improves from 151 to 144 CPU misses in 1,200 frames; strict timing still
  fails. Add optional destruction profiling to the gameplay runner.

## SNES connected teleport corridor checks (2026-10-19)

- Check the union of overlapping ground footprints once when finding an
  Instant Transmission landing. Preserve individual samples for airborne
  targets, floor-hole providers and an unloaded map context.
- All 19,996 landing queries across 27 scenes match the browser, alongside
  71,232 exit probes, 191,964 sweeps and 79,988 canLand calls. Controller
  teleport, water, passenger, whip and scene checks pass.
- Crowded teleport misses fall from 25 to 11 over 240 frames and from 105
  to 73 over 1,200. Palette, meter, OBJ and vblank errors remain zero;
  the strict zero-drop target remains open.

## SNES native companion return-width fix (2026-10-19)

- Re-establish the actor routine's accumulator/index widths before each
  companion call. The native pair used before Goku arrives and during
  events could otherwise enter its second call in M16, corrupting the
  bank-switch stack and eventually the interrupt vectors.
- Strict build, a machine-code regression covering both actors' M8/M16
  returns, and core party/frame checks pass. The previously crashing map
  129 flight fixture now completes 630 landing queries, 20,160 exit probes,
  6,048 sweeps and 2,520 canLand calls with zero mismatches.

## SNES late-vblank queue exit (2026-10-19)

- Leave queued VRAM work untouched when fewer than two lines remain before
  its transfer deadline. Avoid configuring a DMA channel just to defer the
  transfer, preserving time for the NMI epilogue.
- Strict build and core frames/HP/VRAM/HDMA/world/menu checks pass. A private
  alternate actor-phase stress case that reproduced a transformation NMI
  overrun improves from 37.29 to 36.27 scanlines, with zero overruns. Actor
  scheduling is unchanged in the production cartridge.

## SNES guarded native graphics DMA (2026-10-19)

- Copy predecoded death and common weapon sheets through WMDATA only
  early in an ordinary field frame, with the native interrupt vectors and
  DMA channel 7 free of HDMA. Restore the channel registers afterward.
  Late scanlines, loads, scripts and other handlers retain interruptible
  CPU copies. Interrupts remain enabled.
- Machine-code comparisons cover all sheets, actor slots, colour variants,
  flags and DMA/fallback gates, including complete WRAM and channel-register
  preservation. Integrated transfers peak at 13.12 scanlines, below the
  16-line bound, with zero transfers approaching the HUD IRQ or NMI.
- Strict build, core HP/frames/party/OAM/input/lag/HDMA/decode, Goku field/
  status/forms and flight passenger/water/teleport/whip checks pass. All
  gameplay runs retain zero palette, meter, OBJ and vblank errors.
- In 1,200-frame stress runs, flying ki/punches/teleport/charge improve from
  35/3/129/166 misses to 23/1/105/151. Strict combat timing remains open;
  the short grass-transform case again has one CPU miss.

## SNES nonblocking field HP redraws (2026-10-19)

- Queue native HP-number refreshes during ordinary Goku field play instead
  of waiting for a vblank inside the status update. Run the same redraw
  after a completed frame's uploads only when twelve scanlines remain;
  otherwise retain the request. Events, menus, loads and pre-Goku play
  keep the synchronous path.
- Verify the actual seven HUD tiles for each party member, repeated
  requests, late-vblank retry, the retail fallback and preservation of DP
  scratch and interrupt vectors. The measured redraw takes 6.10 scanlines.
  Core frames/party/input/lag/HDMA and Goku field/status/forms pass.
- All 13 gameplay cases and four 1,200-frame repeats retain zero palette,
  meter, OBJ and NMI errors. Short ground punches improve from eight to six
  misses and flying punches from three to two; long crowded timing still
  fails. This removes one forced wait without claiming zero-drop combat.

## SNES carried companions during local flight (2026-10-19)

- Carry CPU companions during all local flight, as requested. Keep their
  actor slots and native status timers active while pausing ground AI,
  movement, contacts and sprites. Landing resumes their normal updates;
  live controller changes, events, menus, loads and scene locks override
  a stale carry mask. Remove stale enemy contact distances on takeoff.
- Strict build, carry-gate machine-code checks, flight passenger/water/
  teleport/whip/scene, core frames/party/input/OAM/lag/HDMA and Goku field/
  status/forms pass. All 13 gameplay cases retain zero palette, meter,
  sprite-limit and vblank errors.
- Over 1,200 frames, flying ki improves from 429 to 35 CPU misses and
  flying punches from 53 to 3. Teleport has 129 and charging 166 misses;
  crowded combat still fails strict timing. This is a validated flight
  improvement, with the zero-drop performance goal still open.

## SNES remaining field FastROM paths (2026-10-19)

- Run the native background-scroll and actor-preparation passes, plus two
  field helpers, through equivalent FastROM mirrors. Preserve the outer
  field loop, interrupts and map-change path. Update test callback sites
  for the combined actor-preparation hook.
- Strict build, core frames/party/input/OAM/sound-event/lag/HDMA, flight
  water/teleport/whip/scene and Goku field/status/forms checks pass. All 13
  gameplay cases retain zero palette, meter, OBJ and NMI errors.
- The long flying-punch run improves from 95 to 53 misses per 1,200
  frames and charge from 166 to 160. Flying ki rises from 422 to 429 and
  teleport from 136 to 148 as changed timing affects the fight. Grass
  transformation has one CPU miss again. The zero-drop target remains open.

## SNES FX palette-upload headroom (2026-10-19)

- Unroll the six fixed FX palette uploads and calculate their ROM offsets
  at assembly time. Keep the same palettes and CGRAM writes. A reproduced
  late native upload now finishes its complete NMI in 36.78 instead of
  37.15 scanlines, removing that vblank overrun.
- Strict build, core frames/lag/HDMA and FX gallery/beams/aura/debris checks
  pass. All 13 gameplay cases and four 1,200-frame combat runs retain zero
  palette, meter, OBJ and NMI errors. The long flying-ki run falls from
  467 to 422 CPU misses; flying punches, teleport and charge remain at
  95/136/166. Strict crowded-combat timing still fails.
- Record completed-frame duration by native actor phase in the gameplay
  harness. Keep the existing companion schedule after alternative phase
  layouts failed to improve the full set consistently.

## SNES common weapon graphics cost (2026-10-19)

- Predecode the two additional weapon sheets observed in crowded-combat
  traces (`D4:0000` and `D4:2FE8`). Use the same interruptible copier and
  retail fallback as death particles, with exact machine-code comparisons
  across six actor slots, three colour encodings and calling flags.
- Strict build, core frames/party/OAM/lag/decode and Goku field/status/forms
  checks pass. All 13 gameplay cases retain zero palette, meter, OBJ and
  NMI errors. Grass transformation now has zero misses in the short case;
  other short-case miss counts are unchanged. Ground-punch/ki peak logic
  falls from 384/383 to 364/372 scanlines.
- Long runs still fail strict timing. Flying ki/punches/charging remain at
  467/95/166 misses per 1,200 frames; teleport increases from 118 to 136
  as execution timing changes the fight. Do not treat cheaper graphics
  conversion as proof of smoother whole-frame execution.

## SNES enemy-death graphics cost (2026-10-19)

- Predecode the native 50-tile death/status sheet in all three colour
  encodings. An interruptible CPU copy replaces conversion during combat;
  other sheets and unusual contexts retain the native decoder.
- Machine-code differential checks match all WRAM outputs, registers,
  flags and direct-page scratch, including fallback inputs. The selected
  path uses less than half the retail CPU cycles. Strict build and core
  frames/party/OAM/lag/decode checks pass.
- All 13 gameplay cases retain zero palette, meter, OBJ and NMI errors.
  Peak flying-punch logic falls from 617 to 355 scanlines and teleport from
  592 to 330. Crowded strict timing still fails: flying ki remains at
  97 misses per 240 video frames. This is a checkpoint toward the zero-drop
  combat target, not a completed performance fix.

## SNES flight preview validation and handoff (2026-10-18)

- Update player controls and development notes for shared aerial combat,
  radar/quest state, map-viewer return and terrain streaming. Separate the
  current 5,770-frame zero-miss world run from older timing profiles and
  the still-open crowded local-combat CPU misses.
- Keep world preparation and combat before radar in the merge-order tool,
  so running it cannot undo the current-frame visibility fix. Verify the
  normalizer preserves the production dispatch and is idempotent.
- All 13 gameplay scenarios meet their palette, meter, sprite and vblank
  checks; crowded-field strict timing remains unsatisfied. Additional world
  fixtures and UI radar pixel/bearing comparisons pass. Prepare a local
  preview.2 IPS/archive from committed source; no release is published.

## SNES map-viewer return palettes (2026-10-18)

- Invalidate world graphics and UI caches whenever the native world loader
  runs, including after closing Start's globe or flat map. Previously the
  unchanged mode id left Goku and effects using the viewer's colours and
  could restore stale map sprites behind the radar.
- A controller-driven round trip through both map views checks Goku's
  colours from the first visible frame, sprite tiles, effect palettes,
  radar restoration and firing ki afterward, in both forms.
- Strict build, all 14 world cases, terrain byte comparisons, Fortress
  cutaway, core world/HDMA/live checks and boot pass. The optional static
  branch check was unavailable because this checkout has no coverage trace.

## SNES flight control and regression follow-up (2026-10-18)

- Let radar rendering see the current frame's charge, attack and docking
  state. Cancel focus and its sound pulses when scenes lock aerial controls.
- Check that timing scenarios actually travel, show the radar, fire shots
  and change form. The 5,770-frame stress run and two additional world
  fixtures pass with zero missed frames or palette/OBJ/vblank errors.
- Update the cutaway fixture to initialize the shared combat form, and
  check whip companions at their actual landing before AI resumes. The
  Fortress cutaway matches the reference at 99.2–99.7%; controls, native
  audio, whip crossing and cartridge boot checks pass.

## SNES terrain streaming without flight stalls (2026-10-18)

- Pre-expand the 512×512 world terrain at build time and copy rows into the
  native ring instead of decoding them while turning. Preserve terrain,
  craters and landing behavior; use an interruptible CPU copy with no DMA
  channel borrowed from the display.
- Execute the copier against an independent decoder for every tile, all
  eight ROM blocks and ring wrapping. Strict build, all world cases and
  core world/HDMA checks pass.
- The 5,770-frame world stress run has zero CPU misses, palette mismatches,
  OBJ overflow or NMI overruns, including radar-visible turns, repeated ki,
  waves and transform/revert. This does not resolve crowded field-combat
  CPU misses or replace physical-console testing.

## SNES world-loop and dialogue cost (2026-10-18)

- Run the native world loop, compass pass and world helper calls through
  FastROM mirrors. Keep interrupt vectors and the native movement cadence.
- Pre-expand fixed radio messages into glyph words in ROM; parameterized
  messages retain their decoder. The shield warning no longer causes a
  missed frame. Schedule radar story queries separately from bearing math.
- With the radar visible, cruise misses drop from 68 to 13 per 480 frames;
  straight flight, aerial ki, charge/release and transform/revert have zero
  misses in those inputs. Turning still needs work. All world cases, core
  input/world/lag/HDMA, UI pixels and the 9,209-frame radio-policy test pass.

## SNES radar and quest-state integration (2026-10-18)

- Fix the production story-query adapter testing its loop index instead of
  the query's answer. Restore the Tree pursuit target, ordinary Ball count
  and palace hints; remove false eighth-Ball and crisis indicators.
- Connect the dormant-story fallback to Dryad, show Mana Beast after the
  Fortress is destroyed, and invalidate text/bearing caches on those changes.
- Fifteen real-save-state radar cases match the browser's targets and text,
  including a live Fortress-to-Beast label update. UI pixel/bearing and world
  timing checks pass; screenshots of the corrected quest panels reviewed.

## SNES shared aerial combat and chord filtering (2026-10-18)

- Use the main combat state for world-flight charging, transformation,
  input locks and native charge sounds. Cancel actions at flight boundaries,
  prevent charge from interrupting transformation, and suppress stray ki
  when releasing L while keeping Y held.
- Hide A/B from native altitude controls on the first read of an L chord,
  fixing a brief descent/landing from L+B before the old mask took effect.
- Strict build, all 12 world cases, UI radar comparisons and core input,
  world, lag and HDMA checks pass. Solo punch/ki and water flight retain
  zero CPU misses; crowded teleport still has CPU misses, with no palette,
  meter, OBJ or vblank errors in the checked scenarios.

## SNES world sprite uploads and palettes (2026-10-18)

- Match the world palette to the sprite cell actually on screen, fixing
  the one-frame colour mismatch on both transformation and reversion.
- Replace sixteen cell DMA transfers with four packed rows, and four
  miniature transfers with two rows. Peak cell-upload time falls from
  15.78 to 5.54 scanlines in the world timing cases.
- World sprite, takeoff/locks, landing, ki, Fortress, scars, barrier,
  docking, Fly item and timing tests pass. Timing checks cover the final
  NMI return, palette matching, visible Goku sprites and OBJ overflow;
  CPU misses are still reported and remain a separate optimization target.

## SNES takeoff restrictions (2026-10-18)

- Route outdoor L+R through the same input decision as roof escapes, so
  world's duplicate reader cannot bypass boss, status, scene or camera locks.
- Reject invalid map ids and check native/custom bosses in the world takeoff
  API. Scripted native departures retain their normal handoff.
- Strict build, ordinary takeoff, six blocked-input cases, dying-boss
  departure and all seven indoor roof escape routes pass in Mesen 2.

## 0.2.5 social teaser preparation (2026-10-18)

- Capture six spoiler-free gameplay techniques with synchronized game audio
  and compose a 24.65-second square teaser with captions and a play link.
- Prepare a Twitter draft linking the browser game and 0.2.5 downloads.
  Keep the MP4, thumbnail, draft and raw capture output outside Git; nothing
  is posted or uploaded by this workflow.
- Validate the action and map checks, all 1,479 decoded video frames, stereo
  AAC audio, safe audio peaks and the final framing. Reproduction notes are
  in [public media](readme-media.md#025-social-teaser).

## SNES port merged into main (2026-10-18)

- Bring the standalone cartridge source, build tools, tests and IPS packager
  onto `main`, retaining the current 0.2.5 browser and desktop code.
- Preserve both branches' development notes and link the cartridge build
  instructions from the shared release guide. The published preview stays
  pinned to its original tag.
- Validation: 380 browser unit tests, web build, strict SNES build, five
  IPS/CPU-helper tests, boot, 12 audio unit tests, native audio and all 13
  gameplay scenarios pass. The rebuilt ROM matches the preview byte for
  byte (SHA-256 `dc595f44ba0683bd39f7210be8f08e03d451a0f68a57b7ccb46698cc605929be`).
  Known crowded-scene CPU misses remain; the gameplay checks report no
  palette errors, charge-meter leaks, sprite overflow or vblank overruns.

## SNES preview release packaging (2026-10-18)

- Add a patch-only SNES release builder with verified base-ROM hashes,
  SNES controller instructions, preview limitations and checksums.
- Verify standard IPS records, RLE, expansion, record boundaries and the
  reserved EOF offset. Check both the standalone and archived IPS against
  the exact strict-build ROM, and cross-check with RomPatcher.js.
- Prepare native-resolution screenshots and a separate `snes-v` preview
  release so the cartridge download is distinct from desktop packages.

## SNES aura and gameplay budget follow-up (2026-10-18)

- Mirror the full-size flame from three resident cells and limit the
  transformation ring to eight arcs plus four inner sparks. Keep its
  radius, duration, flash and damage; `FX_DETAIL` retains the denser ring.
- Reduce ki collision queries to the existing moving contact segment,
  reject distant actors earlier, and reuse the orb's computed position.
  Replace a hot native AI bit scan with a lookup verified against the
  original machine code for all 65,536 inputs. Actor cadence is unchanged.
- Skip unused PCM envelope calculations in native-audio builds. Move
  compatible-pose checks out of tight vblanks, cancel obsolete deferred
  poses, and remove redundant scanline reads while retaining HDMA guards.
- Controller-driven cut-grass focus/transform tests verify complete auras,
  no FX writes to background palettes, audible cues and silent tails.
  The 13-case gameplay run and 1,200-frame flight/attack stress runs have
  no palette errors, meter leaks, OBJ overflow or NMI overruns. Quiet
  attacks, water flight and cut-grass focus have zero CPU misses; crowded
  scenes still drop frames. Results are mixed across short inputs; see
  the [measured follow-up](snes-port/gameplay-performance.md#sound-and-aura-follow-up).

## SNES aura isolation from background palettes (2026-10-18)

- Use a compact sprite flame for charging and transformation. Its blue,
  gold and pink palettes no longer change the backdrop or background
  colour math, including on cut grass. Two poses share resident tiles;
  incomplete uploads wait before the flame appears.
- Validate both sizes and all tones against the generated pixels, real
  grass cuts, background-palette ownership and animation without uploads.
  Existing FX gallery and beam pixel checks pass. The older polygon
  renderer remains available with `FX_AURA_POLY` for comparison.

## SNES short resident combat sounds (2026-10-18)

- Replace the indefinitely looping transformation rumble and long generic
  impacts with seven short resident effects. Each uses one SPC voice, ends
  on its own within half a second, and needs no gameplay sample transfer.
  Punch contact has a stronger attack than a missed swing.
- Preserve all retail effects, samples and music. Native emulator and SPC
  tests cover transformations, reversion, impacts, voice release, silent
  tails, repeated commands and song restoration.

## SNES party update scheduling (2026-10-18)

- Spread native companion status, AI and animation across the game's
  existing five phases while Goku is active. Preserve every actor's update
  frequency, per-frame movement/collision/drawing and player assignments.
  The original schedule remains in use before Goku arrives and during native
  event scripts, including scripted whip-pad crossings.
- Reserve more vblank time around Goku's cell upload. A deferred pose no
  longer forces an upload merely because it waited one frame.
- The integrated walking, combat and flight cases improve, but still miss
  some video frames in crowded scenes. Rapid ki fire during flight remains
  the largest measured CPU bottleneck. Core cadence,
  input, menus, sound/events, world, save and lag regressions pass.

The final audit corrected the moved calls' actor-data bank and selected
phases 1/2 for the companions. The cadence test now checks actual native
timer progress as well as entry counts; it rejects the earlier experimental
build. Final measurements are in the
[gameplay performance review](snes-port/gameplay-performance.md).

## SNES teleport responsiveness (2026-10-18)

- Advance Instant Transmission with the field video clock, so CPU stalls
  no longer lengthen its vanish and recovery animation. Keep the camera's
  streaming hold and cap catch-up at four frames, as combat already does.
- Test recovery and the arrival cue after three injected missed frames,
  including the 16-bit clock wrap; existing offscreen teleport and scene
  camera checks pass.

## SNES flight and rendering performance (2026-10-18)

- Reuse shoreline collision results while flying instead of repeatedly
  decoding the same tiles. All 289,324 terrain comparisons, 19,996 teleport
  queries and 191,964 movement sweeps still match the browser's rules.
- Run selected native actor, collision and sprite routines through their
  FastROM mirrors. Carried CPU companions no longer draw bodies, attachments
  or shadows; their actors remain live, and human players remain visible.
- Use a compact impact spark and a single moving ki orb. Preserve attack
  range, speed and damage, and cull offscreen shots before allocating art.
  Reserve the end of vblank for palette updates and the interrupt return;
  defer radio text expansion when the frame has insufficient time.
- Core, flight, effects and UI regressions pass. Integrated gameplay checks
  find no palette errors, native charge-meter leaks, sprite overflow or
  vblank overruns. Quiet attacks and water flight meet the frame budget;
  crowded native-party scenes still need CPU scheduling work.

## SNES nonblocking resident effects (2026-10-18)

- Resident sound effects release the main CPU immediately and complete the
  SPC port handshake on a later callback. Busy effects are dropped without
  overwriting a pending command; music and control commands remain ordered.
- Emulator checks cover audible effects, repeated hits, bounded CPU time,
  charge pulses, sample integrity, song loading and native-song restoration.
  Core sound/event, world and menu regressions pass.

## SNES Goku sprite upload budget (2026-10-18)

- Pack field animation cells into contiguous ROM rows: four DMA transfers
  replace sixteen tile transfers, preserving every pixel and the miniature
  form. The measured Goku NMI path drops from about 8.9 to 5.5 scanlines and
  uses only DMA channel 7.
- Avoid rewriting the airborne palette mirror when its native buffer and
  desired colours are unchanged; keep flash handling and landing restore.
- Validate all 465 packed cells and miniatures byte for byte, plus emulator
  palette, form, animation, portrait and menu checks. Generated ROMs and
  timing output remain private.

## SNES preview download (2026-10-18)

- Publish the standalone cartridge preview as a verified IPS and patch-only
  ZIP, with instructions, base/output hashes and native SNES screenshots.
- Link the separate `snes-port` source and `snes-v0.1.0-preview.1` release
  from the project overview. The preview explicitly retains known
  crowded-scene slowdowns; existing desktop downloads stay available.

## 2026-10-18 — SNES gameplay follow-up

- Fixed Goku's water-flight palette through takeoff and landing. The airborne
  sprite now receives the same tinted colors as the native water palette,
  and landing restores the map's palette. Validated with the Goku status,
  forms and scripted tests, including rendered airborne colors.
- Replaced streamed gameplay effects with resident SNES sounds by default.
  Impacts, shots, punches and beams stay audible; charge uses sparse pulses,
  and continuous flight/voice streams are omitted. Music stays native. The
  old streamer is an explicit `AUDIO_PCM` diagnostic build. Native sound,
  audio unit, optional stream, song, arrival and imported-state tests pass.
- Cleared the native weapon-charge meter and sparkle while Goku attacks,
  keeping his ki charging intact. Recovery-camera scrolling now blocks new
  attacks/focus. Faster rectangular hit tests retain attack range and damage;
  192 geometry cases, stale-meter checks and combat reference comparisons
  pass, along with water, teleport, whip, ceiling, holes and scene flight tests.

## 2026-10-18 — Bazzite Steam box installation

- Built and installed the Bazzite desktop app from `656bdb3`, added a direct Steam shortcut and Favorites entry, and assigned the Gamepad template.
- Added portrait and wide Steam artwork under `assets/steam/`, applied it through Steam's live artwork API, and verified the card in the Gaming Mode home carousel.
- Fixed this installation's Steam overlay startup crash with a per-game preload override. Native fullscreen launch, offline startup and save/restart checks passed on Bazzite. Physical controller and TV-wall checks remain untested. See [deployment and artwork notes](bazzite-steam.md).

## 2026-10-18 — SNES cartridge: Frieza's ground arc, deterministic power-on, Goku fixes (integration)

- **Frieza's ground arc** is merged into the cartridge, as the browser plays it: the entrance and theft, the Emperor's execution, the Death Balls, the Mana Tree sequence, the three-phase fight, the Fortress collapse on its destroyed deck, the Beast challenge, and victory and death. It uses flight's landing check and scripted camera, Goku's scripted cells, combat's virtual target (Goku's attacks now reach Frieza), destroy's door-record hook and core's scene claims (VRAM regions and the scene work area). Its idle cost is 0.32 lines a frame and 0.11 a vblank. See [snes-port/frieza.md](snes-port/frieza.md).
- **Power-on:** the original game reads three things before writing them: the moving Fortress's placement (`7E:0126`), the first map's camera edges (`7E:0A80–0AB1`) and an effect record of ours. These varied with each power-on in Mesen and on hardware; the browser's emulator zero-fills them. Core now zeroes them at boot, so every console and emulator starts like the browser.
- **Goku:**
  - A scripted-cell API draws Goku at a scene's screen spot (the temple exit, the deck, the Tree's cliff).
  - Cell uploads are cheaper and sent less often.
  - Two regressions from the first version are fixed: fx bursts lost a palette, and a timing-sensitive Sandship colour check failed.
  - The fixes exposed a real race in the ending's palette commit: a channel-7 DMA set up from the frame thread can copy 64 KiB over WRAM if an NMI lands mid-setup. It is with the ending stream, and goku keeps its old NMI prologue meanwhile.
- **Build:** generator output folders left by another branch no longer break builds.
- Validation: each merge re-ran the suites it touches (frieza, combat, vegeta, goku, fx, destroy, ending, ui). All pass. The scene select has 21 presets full and `trial` native; `hexas` is still partial (a capture-timing difference in the debug recipe). The DMA-timing watch finds no module DMA into VRAM, OAM or CGRAM during display over the opening and all presets.

## 2026-10-18 — SNES cartridge: Goku's attacks reach Frieza, and combat hooks for the set pieces (combat)

- **Frieza can be struck.** Combat keeps a registry of virtual targets: enemies the browser mod adds to the native actors, such as Frieza in the ground fight. Punches, ki blasts, the Kamehameha and the transformation burst include them. A hit goes to the module's own routine, with no damage number or launch, and keeps the contact hold, impact spark, sound, the ki shot ending at its first contact, and the beam's pulses of an ordinary enemy. Six new tests run the battle state on the cartridge and the browser's own Frieza module side by side: every hit's damage, melee flag, HP taken and frame agree.
- **Hooks the set pieces asked for:**
  - Damage hooks are a list, so Frieza's and Vegeta's modules no longer depend on include order.
  - Receive hooks see the damage queued on Goku before Saiyan resilience; the fed Mana Beast's cap uses one.
  - Other modules can read Goku's live beam with the browser's own geometry. Vegeta's beam clash and volley cancellation now use it.
  - An input hold takes the pad but lets the last wave finish. Vegeta's draw uses it, so the draw waits for Goku's wave as in the browser.
  - Instant Transmission can look up the same targets.
- **Menu/back fixes:** X closes Status and the window and controller editors wherever the options ring last stopped, as in browser commit f376330 (3 of 8 tested pages stayed open). X also never reaches the game as the native button while Goku is inactive; before, one press in five opened the second party member's ring.
- **Costs:** an attack's target scan asks each registered target once per field frame (0.3 lines on maps without Frieza, 1.5 on his). Combat's logic grows by at most about half a line per step in busy scenes, and idle frames are unchanged. A hit on Frieza costs about 6 lines, nearly all in Frieza's own routine.
- Validation on main with the frieza module: combat 34/34 (the six Frieza cases, the beam API at every age, the input hold, receive hooks, `panel`, `xrace`), frieza 13/13, vegeta 11/11 with every tick equal to the browser's module, goku 11/11, and perf equal to main's in all six scenes. Scene select: 21 presets full, `trial` native, and `hexas` partial, as on main without these changes.

## 2026-10-18 — SNES cartridge: snes9x and bsnes second opinions

- The cartridge now also runs headless in snes9x and bsnes through their libretro cores and a small frontend, `snes/tools/retro-host` (`make -C snes/tools/retro-host cores` builds pinned cores under `.local/`). `node snes/test/emulators/run.mjs` (part of `run-all`, skipped without cores) plays one power-on scenario on snes9x, bsnes and bsnes with its accurate PPU, with Mesen as the reference. It covers ExHiROM detection and a CPU-bus probe of the extended banks and save RAM, the title, the name editor, the opening to the first field, and a save, power cycle and load. All three cores pass. Their pictures match Mesen's, and the game reaches each step on the same frame. `--presets` runs the 22 scene-select presets on every core: all end in Mesen's state, and their pictures match. See [snes-rom.md](snes-rom.md#second-opinions-snes9x-and-bsnes).
- `--power-on --bisect` runs each preset from zeroed RAM and again from noise, then narrows any change down to single bytes. The original game reads three things before anything writes them: it seeds the moving Fortress's placement from `7E:0126`, places the first map's camera from the map-edge words `7E:0A80–0AB0`, and seeds its RNG from the save checksums. One read is ours, from destroy's and fx's code: the effects library polls destroy's effect record `$33:77F8` before destroy clears it on its first map sync. With battery noise, this costs one frame in the `battle` preset, and no effect is drawn.
- `--dma-watch` checks in Mesen for DMA into VRAM, OAM or CGRAM outside vblank and forced blank. Across the opening and all presets, the only such DMA is the original menu's last upload on the name editor's exit (`C0:25F6`). The unmodified game does the same, and hardware drops it.
- Mesen screenshots were several frames stale in animated scenes, because unthrottled Mesen skips rendering. `runMesen({exactFrames: true})` renders every frame, at about 20-25% more time. The new reference runs use it.

## 2026-10-18 — SNES cartridge: effects, Sandship, finale, telepathy, Time Chamber and core fixes (integration)

- Merged on the cartridge:
  - **Effects library:** beams drawn as polygons, the Death Beam in 16 headings, large Death Balls, the ki aura from the browser's own pixels, and charge lightning.
  - **The Sandship arc** at 60 Hz, with breach, fires, blasts and white-out.
  - **The finale's Fortress cutaway** in world flight, with its art moved to extended data.
  - **The telepathy radio:** window placement, Dragon Radar, the scouter switch and Goku's STATUS page.
  - **Joch's trial in the Time Chamber:** Goku's real attacks, clashes and both returns, matching `joch-trial.js` on every frame.
  - Stream entries below and in `docs/agents/snes-port/`.
- Core fixes found while merging everything at once:
  - **Map loads:** during some map loads (153, in the Sandship) the game's background tile decoder writes up to `7E:77FF`, through the WRAM the core used for its queues. It once started a spurious door. That state now lives in battery RAM, which is revalidated every frame.
  - **Module vblank work** runs only in vblanks whose frame the game completed. An NMI landing between the core's ready flag and the game's own flag used to run it one vblank early.
  - **HDMA channels** are no longer switched on after a frame's HDMA started, which caused garbage window scroll for a frame.
  - **Scene work area** (`$32:6000–7FFF`): a module can now claim it, so one scene can't silently overwrite another's. Frieza had written into the ending's buffer.
- Budget: with every module merged, idle frames cost about 15 scanlines before the streams cut their idle paths: Frieza from 1.76 to 0.32 lines (vblank 1.03 to 0.11), UI from 2.34 to 0.26. `snes/tools/modprof.mjs` measures each module.
- Validation: each merge re-ran the suites it touches (core, fx, combat, destroy, goku, ending, world, audio, ui, vegeta, debug). All pass on main. The scene select has 19 presets full and 4 native, whose differences belong to Frieza and Vegeta.

## 2026-10-18 — Release 0.2.5

- Release 0.2.5 (`v0.2.5`) and its Pages build add one exact fast path to 0.2.4:
  - **Sound driver idle loop skipped:** about 60% of the SPC's instructions are the sound driver's wait (`CALL` / `MOV X,port` / `BEQ` / `RET` / `MOV Y,timer` / `BEQ`). While the CPU port and the timer counter it polls both read 0, `catchUpApu` applies whole passes at once. A batch ends within the catch-up, since a port cannot change inside one, and its last counter read comes no later than the counter's next increment. The DSP and timers still run every cycle.
- Every scene against 0.2.3, Chrome full-render frames/s, median of three in the same session. The machine was busy (load average 8–11), so these rates sit below an idle machine's:

  | Scene | 0.2.3 | 0.2.5 | Change | Real time |
  | --- | --- | --- | --- | --- |
  | Sandship wreck | 542 | 646 | ×1.19 | 10.8× |
  | World flight | 629 | 685 | ×1.09 | 11.4× |
  | Beast challenge | 604 | 694 | ×1.15 | 11.6× |
  | Waterfall, first flight | 631 | 703 | ×1.12 | 11.7× |
  | Throne room (map 431) | 606 | 711 | ×1.17 | 11.9× |
  | Fortress deck | 584 | 711 | ×1.22 | 11.9× |
  | Waterfall after the arrival | 558 | 719 | ×1.29 | 12.0× |
  | Sandship | 599 | 732 | ×1.22 | 12.2× |
  | Field | 654 | 736 | ×1.12 | 12.3× |
  | Explosion | 586 | 754 | ×1.29 | 12.6× |
  | Ending | 625 | 777 | ×1.24 | 13.0× |
  | Buffy | 656 | 782 | ×1.19 | 13.0× |
  | Trial | 630 | 791 | ×1.26 | 13.2× |
  | Field combat | 623 | 811 | ×1.30 | 13.5× |
  | Status page | 618 | 811 | ×1.31 | 13.5× |
  | Title | 842 | 842 | ×1.00 | 14.0× |
  | Name entry | 658 | 860 | ×1.31 | 14.3× |
  | Fortress | 686 | 864 | ×1.26 | 14.4× |
  | Tree | 681 | 878 | ×1.29 | 14.6× |
  | Battle | 663 | 883 | ×1.33 | 14.7× |
  | File select | 653 | 907 | ×1.39 | 15.1× |
  | Space | 721 | 948 | ×1.31 | 15.8× |
  | Orbit | 739 | 1008 | ×1.36 | 16.8× |

- Validation:
  - **Unit tests:** 380 pass. A new test compares SPC RAM, every DSP sample, the timers and the SPC registers with stepping each pass, from power-on and on the saved states. It fails if a batch runs one pass past the timer.
  - **Exactness:** the original SnesJs core equivalence passes (SPC RAM and audio every frame), and every saved state, scene and forced branch renders identically to 0.2.4 with every mod hook.
  - **Browser suite:** only the known failures; all 28 phone tests pass.


## 2026-10-17 — SNES cartridge: Goku's STATUS page, window placement, scouter switch (UI stream)

- Goku's STATUS page shows the browser's raster on the cartridge: name, level, HP, form, the double-width power level, the weights lines, MANA and money, and ten stat rows with bounded two-tone meters. The page's text and window layer is composed cell by cell from the same drawing operations as `native-status.js`, which the generator checks against `statusPixels()` at build time. It is built top to bottom in about 55 frames while the menu keeps 60 Hz. Like the browser, which paints its raster from scanline 1, it sits one row above the raster's coordinates, and its window art comes from the browser's windows rather than the game's tiles. See [snes-port/ui.md](snes-port/ui.md#gokus-status-page-statusasm).
- Dialogue windows move above the HUD when the first one would cover more faces where it is (`window-placement.js`). With the core's new HDMAEN guard, closing windows stay moved too: all 1,952 window frames of the test scene.
- Goku's Targeting ring item is the scouter switch ("Scouter: ON/OFF"), with the scan sound and King Kai's joke for the form; the power-level readouts are not drawn yet.
- The UI's DMA-only tile sets (radio glyphs, window tiles, world atlas, radar dial) and the STATUS page's window cells and tilemap live in extended data. Messages are dictionary-compressed, and bank `$AC` has 8.2 KiB left.
- Validation: `snes/test/ui/run.mjs`, 11 Mesen and node cases. STATUS (base form and Super Saiyan): BG2 from VRAM equals `statusPixels()` on every pixel except 2–3 cells per page that need a fourth colour, which shows as its nearest. Open: the scouter readouts (they need OBJ VRAM) and instant text for R fast-forward (the native engine prints at most one glyph per vblank).

## 2026-10-17 — SNES cartridge: the Sandship arc (destroy stream)

- The Sandship runs on the cartridge: a full-power KAMEHAMEHA below deck while captive (or Sergo's plan) whites out the screen and reloads Goku's room as the wreck, with the fled crew gone, desert monsters in, the boss battle alarm, the rescues, Geshtar on deck, bulkheads that break, unplanned departures and the roof takeoff that blow the ship up into the Mech Rider, the reunion with everyone's own gear, and the dunes' exit rule.
- The wreck's look on the SNES's own hardware: the white-out and the alarm tint as transformed palettes riding the game's CGRAM upload, the breach as an indirect HDMA window over the desert's sand, and fires through the effects library within the frame's time. The white-out tables and the sand use the new extended data banks.
- Flight bindings: the breach is a floor hole for flight, the roof takeoff and flight's hull rule report through `SANDSHIP_TAKEOFF`, and `SANDSHIP_HULL_KEY` keys flight's hull cache.
- A beam's hit scan and barrier search now grow in steps across frames (largest single call 84 scanlines for a full wave, was 219 on FastROM).
- Details, deviations and core/effects requests (the game's tile decoder overwrote the core's event request word in the wrecked cabin) in [snes-port/destroy.md](snes-port/destroy.md).
- Validation: `snes/test/destroy/run.mjs`, 27 destroy and 9 Sandship scenarios, each on a private ROM copy.

## 2026-10-17 — Release 0.2.4

- Release 0.2.4 (`v0.2.4`) and its Pages build include everything since 0.2.3:
  - **Menu/back closes Status again:** on menu pages, Menu/back (the phone Menu button, X on a pad) sends the cartridge's cancel button, Y, or Start for the window and controller editors. The editors were recognized by the ring cursor `$180A`, which counts from the option the ring last opened at. After opening option 3 or 4, Status sat at cursor 6 or 5, so Menu/back sent Start, and Y is Goku's ki: no button could leave the page. The editors also failed to close from most starting points. The open option `$1876` now decides. All 147 combinations of party member, starting option and page close (36 could not), and a browser test covers Status at cursors 5 and 6 and both editors.
  - **Wait loops skipped exactly:** the game's main wait (`BIT dp` / `BNE`, two thirds of the instructions in field and story scenes) and the menu and title HVBJOY polls skip whole iterations up to the next display event. One stepped iteration measures the loop. Each batch first checks that what the loop reads now (the flag, or HVBJOY after a blanking edge) leaves the CPU state unchanged. Loops at addresses any mod hook watches are never batched.
  - **APU catch-up deferred:** each master-cycle pair adds the same step to the APU catch-up float, so the batched paths only count pairs, and `catchUpApu` applies them exactly by binade before it runs.
  - **Set pieces:** the Sandship wreck tints lines without mask checks outside the breach, fire sprites draw only their opaque pixels, and smoke puffs visit only the pixels they can draw.
- Chrome full-render frames/s, median of three on a busy machine (other emulators running), so absolute rates sit below an idle machine's:

  | Scene | Frames/s | Real time |
  | --- | --- | --- |
  | Orbit | 952 | 15.9× |
  | Combat | 919 | 15.3× |
  | Space | 892 | 14.9× |
  | File select | 888 | 14.8× |
  | Status page | 791 | 13.2× |
  | Explosion | 746 | 12.4× |
  | Field | 734 | 12.2× |
  | World flight | 716 | 11.9× |
  | Waterfall after the arrival | 709 | 11.8× |
  | Sandship | 693 | 11.6× |
  | Sandship wreck | 632 | 10.5× |
  | Fortress deck | 619 | 10.3× |
  | Throne-room set piece (map 431) | 583 | 9.7× |

  Against the previous web build (which already skipped the `BIT` / `BNE` wait), the wreck went ×1.12, the status page ×1.14, combat ×1.11 and orbit ×1.12. File select and name entry went ×1.20 with the HVBJOY polls.
- Validation:
  - **Unit tests:** 379 pass. They now include two wait programs run from work RAM: HVBJOY polls across both blanking edges and the auto-joypad read, and a `BIT` loop whose flag HDMA clears through WMDATA. Both fail on the earlier scheduler.
  - **Exactness:** the original SnesJs core equivalence passes (picture, work RAM, VRAM, CGRAM, OAM, SPC RAM, audio and CPU timing every frame). Every saved state, scene and forced branch renders identically to 0.2.3 with every mod hook. The fire and smoke drawers issue the same pixel writes in the same order.
  - **Browser suite:** only the known failures; all 28 phone tests pass. In real iOS Safari (Simulator), Status opened at cursor 5 closes with one tap of Menu.


## 2026-10-17 — SNES cartridge: 64 Mbit ExHiROM, unflashed Goku, fresh cartridges (integration)

- The cartridge is now 64 Mbit ExHiROM (the mapping of Tales of Phantasia). The first 4 MiB is unchanged apart from the header, and the second 4 MiB mirrors it. Generators can place up to 1984 KiB of DMA sources and bulk tables in banks `$40–$7D` through `xdata(name, bytes)`, which frees room in the fast banks for the remaining set pieces. Save RAM stays where the original game keeps it, because bsnes, Mesen2, snes9x and the FXPak map ExHiROM save RAM like HiROM. See [snes-rom.md](snes-rom.md#extended-data-exhirom).
- Goku keeps his own colours during native screen flashes while a scene shows him (the arrival's hop, matching the browser's scene renderers), and the Goku tests follow combat's remapped controls under FastROM. On the arrival frames compared, the cartridge moved closer to the browser (impact 3.1% → 0.3% of pixels differ).
- A NEW GAME can no longer start with Goku already a Super Saiyan. Combat had seeded his form on the title from noise in a new cartridge's battery RAM, or from the previous playthrough's permanent transformation. NEW GAME now resets the form and loading sets it from the save. The cartridge also clears its persistent Goku block at power-on when the block lacks the cartridge's magic.
- Validation: the full Mesen suite passes on the ExHiROM build except the effects library's `beams` test (fixed on its branch). Goku: 12,751/12,751 pose frames match. Scene select: 19 presets match the browser fully and 4 natively, none partially. New core tests: `live` and `xdata`.

## 2026-10-17 — Release 0.2.3

- Release 0.2.3 (`v0.2.3`) and its Pages build include everything since 0.2.2:
  - **Scenery anchored while scrolling:** the waterfall crater and landed Saiyan pod were placed from Goku's actor screen position. In low flight that position is offset by up to six pixels, and it doesn't follow the native quake, so the pod and crater jumped against the ground tiles while the screen scrolled or shook. They are now placed per scanline from the tile stream origin and BG1's actual scroll. The Fortress deck scars and the Sandship breach had the same problem and use the same camera, with world-anchored patterns. The arrival browser test now flies around the clearing and checks that the crater stays on its tiles.
  - **Covered screens skipped:** when a line's outermost effect paints every main-screen pixel, the main screen is filled directly, without decoding or composing it. Planet view does this in orbit, space and the explosion.
  - **Set pieces:**
    - The Sandship breach mask is memoized in world space; it was rebuilt for the whole screen whenever the camera moved.
    - Frieza's arena and the Fortress deck skip scar-free rows.
    - The status page splits its raster once per change.
    - The planet globe is copied without a per-pixel call.
  - **Hot loops:**
    - Wrapper chains are cached between scanlines.
    - Translucent colour math, composition setup, plain and hires tile loops and the palette pass are specialized for their common cases.
    - Narrow paints are bounded to their columns.
- Measured against 0.2.2 in the same session (Chrome full-render frames/s, ratios because the machine was busy):

  | Scene | 0.2.3 / 0.2.2 |
  | --- | --- |
  | Orbit | ×1.28 |
  | Space | ×1.22 |
  | Sandship wreck | ×1.13 |
  | Waterfall after the arrival | ×1.12 |
  | Status page | ×1.09 |
  | File select | ×1.07 |
  | Sandship | ×1.05 |
  | Combat | ×1.04 |
  | Explosion, Frieza battle | ×1.03 |
  | Field | unchanged |

  On a quieter run, every scene measured at least 9.4× real time except the Sandship wreck (8.7×). Most were at 10–12×, and the title at 15×.
- Validation:
  - **Unit tests:** 378 pass, including a temporary-wrapper test for the chain cache.
  - **Exactness:** the SnesJs core equivalence passes, and composed and per-pixel rendering match on every changed scene and on random PPU states. The set pieces and planet scenes match the previous build frame for frame where the change was meant to be invisible.
  - **Browser suite:** only the known failures after every push; all 28 phone tests pass.

## 2026-10-17 — Release 0.2.2

- Release 0.2.2 (`v0.2.2`) and its Pages build include everything since 0.2.1:
  - **Waterfall frame drops on phones:** after Goku's arrival, the crater hook had no line plan, so every frame at the waterfall rendered per pixel. It now paints the crater and pod as line operations. In Chrome, a player frame there went from 10.7 to 2.3 ms; in the iOS Safari simulator from 10.0 to 2.4 ms, and the sword and pod landing from 7.3 to 2.5 ms (peak 17 to 5 ms). The arrival test fails if a scanline falls back.
  - **Ordered line operations:** each active colour hook becomes whole-line operations in wrapper order: paints, per-channel tables, whole-line functions, and per-pixel posts as a fallback. The following hooks now use them, and no story hook needs per-pixel work:
    - planet view, the ending and the Time Chamber;
    - Frieza's arena scars and his tree and emperor scenes;
    - the hit flash, the Fortress deck, the Sandship wreck and Goku's status page.
  - **Smaller wins:**
    - Hires backgrounds decode as tiles, and mosaic layers decode once per block with inline fetches.
    - The exploding planet samples only near each fragment.
    - Translucent colour math averages packed colours; sub screens of pure backdrop use per-channel tables.
    - `setPixels` writes whole RGBA words, and the player updates its charge meter and option boxes only when they change.
- Measured against 0.2.1 in Chrome in the same session (the machine was busy with other emulators, so rates are low):

  | Scene | 0.2.1 | 0.2.2 |
  | --- | --- | --- |
  | Explosion | 286 frames/s | 583 frames/s |
  | Orbit / space | 354 / 353 frames/s | 587 / 589 frames/s |
  | Ending | 407 frames/s | 650 frames/s |
  | Frieza battle | 445 frames/s | 669 frames/s |
  | Time Chamber | 478 frames/s | 647 frames/s |
  | File select | 466 frames/s | 625 frames/s |
  | Field / world flight | 574 / 568 frames/s | 643 / 683 frames/s |
  | Status page / Sandship wreck / Fortress deck (player frame) | 11.2 / 8.8 / 7.5 ms | 2.0 / 2.2 / 2.0 ms |

  Details are in [performance.md](performance.md).
- Validation:
  - **Unit tests:** 377 pass, including a fuzz of random PPU states over noise VRAM that compares the compositor with the per-pixel path.
  - **Core equivalence:** the SnesJs core matches over 42 states.
  - **Browser equivalence:** composed and per-pixel rendering match with every mod hook across 41 saved states and 16 story and set-piece scenes. They also match in the overlay scenarios, 49 forced ending and defeat branches, every arrival phase (with edge clipping) and the tree and emperor scenes.
  - **Browser suite:** only the 21 known failures, plus a controls layout test that is also flaky on 0.2.1. All 28 phone tests pass.


## 2026-10-17 — SNES cartridge: finale cinematics (ending stream)

- The finale plays on the cartridge inside the native field loop, driven by the story module's event hooks as in the browser: the good ending's fade, Shenron's vista over the Mana Tree (summon, dragon, wish), the wish flight over a Mode 7 night world with the seven Balls scattering, the reunion cliff with Dyluck, Goku beside Randi in Potos and his departure (power-up, launch, whiteout, distant globe), King Kai's planet with both end cards; the bad ending's doomed globe, explosion and escape; and the finale death (collapse, black, the planet exploding, GAME OVER). See [snes-port/ending.md](snes-port/ending.md).
- Scenes stay up over the finale scripts' native map loads (reloaded after the loader's blocking pass), the reunion holds black until its cliff reloads, and the scene select's good-ending, bad-ending and explosion presets reach their scenes from power-on.
- Validation: `snes/test/ending/run.mjs` (seven Mesen suites against references composed by the browser engine's own code): King Kai 93%, globes and escape 86-100% (the explosion's brick fragments 65-80% during the drift), death 67-100%, village and departure 99-100%, vista 95-96%, flight 91-99%, native loads 99%; lag and vblank checks per scene.
- Open: the Fortress cutaway in world flight (needs ROM and world-mode hooks), the combat module's call into the finale death, the audio module's ending cues, and the frieza module's crisis answer (night globe). The finale has not yet been played end to end through the story's own scripts, nor on real hardware.

## 2026-10-17 — SNES cartridge: destructible scenery, barriers and demolition (destroy stream)

- Goku's punches, kicks and beams break what the boy's weapons could on the cartridge, through the game's own cut-map pipeline: plants, rocks, pillars and multi-stage objects, tall grass, Haunted Forest vines, skull heads, the Sandship rail, and palace braziers for the full Super Saiyan beam. Edits are queued and applied one row per frame at the native redraw consumer (`C0:C7C3`), with the native redraw request and cut sound, and smashed objects are replayed silently after native rebuilds, as in the browser.
- Gates, locks, hit switches, floor plates, the Grand Palace buttons and crystal orbs start their original or story-authored events; the three breakable doors persist in the GAME FILE and story routes their trigger events on the module's `DOOR_*` queries. Watts's shortcut entrance stays open across visits once its door broke (piece loader hook at `C0:CC2D`).
- The full beam melts dungeon partitions on both layers in the 22 dungeon families (eight scenes compared end to end) with the browser's breach rules (span, heights, floor sample, partner layer, protected cells), planned within a per-frame scanline budget that can suspend a plan between frames. Rubble and brazier bursts are published as effect records for the effects library.
- API for combat (`destroy_hit`, `destroy_orb_hit`), outputs for radio/feedback and the catalogue with data sources are in [snes-port/destroy.md](snes-port/destroy.md).
- Validation: `snes/test/destroy/run.mjs` (29 Mesen scenarios against the browser modules on the same imported states): 26 match exactly; three timing-sensitive demolition scenes open the same walls with some different floor tiles or one fewer breach (documented). A full beam adds 0–8 lag frames over about 140 frames in most scenes measured, 15 in the heaviest (a BG2 room).

## 2026-10-17 — SNES cartridge: combat and effects (integration)

- Goku fights natively on the cartridge: punch/cross/kick combos, ki blasts, partial and full Kamehameha (including the 160-pixel Super Saiyan wave), focus, transformation with its radial burst, reversion, Saiyan defense and deflection, the Heavy Gi penalty, level 99 and 999 HP, Senzu Beans and the Dust Bag, all through the native damage queue so XP, rewards and boss events stay native. Twenty-one Mesen-versus-browser comparisons on the same states and inputs match. See [snes-port/combat.md](snes-port/combat.md).
- The effects library draws charge orbs, ki shots, beams, sparks and explosions from the cartridge's own spell cells; the full-screen Super Saiyan wave, Final Flash and Galick Gun are HDMA-driven window polygons with sprite edge sparks. See [snes-port/fx.md](snes-port/fx.md).
- Build: a ROM ownership check now flags bank halves holding two modules' labels (asar overwrites silently); the effects library has its own bank. Core hides sprites with one store and culls sprites entirely above the screen.
- Known open items: FastROM (planned default for CPU headroom) still breaks the title's BOY prefill; title and goku tests are being updated for combat's remapped controls; a full wave's first frames stall in destroy's hit scan.

## 2026-10-17 — SNES cartridge: audio and world flight (integration)

- The cartridge's sound driver now carries the DBZ effects, the continuous Japanese Kamehameha chant with its release shout, sustained charge loops and the pod arrival cues, streamed from ROM alongside native music, plus five new native songs ($3B–$3F): Frieza's entrance, battle and orbit cues and Vegeta's two themes, rendered from Secret of Mana's own instruments (loudness within ±0.2 dB of the browser's renderer). See [snes-port/audio.md](snes-port/audio.md).
- Goku flies the Mode 7 world himself: L+R or the Fly item takes off without Flammie's summon, landing skips the fly-by, aerial ki and the charged Kamehameha work, the Fortress shield deflects weaker waves and a full one destroys it, struck towns keep their craters until the wish, and a full wave opens the Mana Tree's cloud barrier. See [snes-port/world.md](snes-port/world.md).
- Validation: audio, boot, core, debug, destroy, goku, perf, story and world suites pass on the merged build; the title module's arrival comparison is being updated for the browser's newer crater compositing.

## 2026-10-17 — SNES cartridge: destruction and scene select (integration)

- Punches and beams on the cartridge break bushes, grass, vines and multi-stage objects through the native redraw, open authored gates and native hit/floor switches, light crystal orbs through their original events, keep Watts's shortcut entrance open, and let a full Super Saiyan wave demolish dungeon partitions; five demolition families match the browser edit for edit. See [snes-port/destroy.md](snes-port/destroy.md).
- A hidden scene select on the title (Up Up Down Down Left Right Left Right) lists the 22 `?start=` presets; each runs the real NEW GAME and replays `quick-start.js`'s steps natively, with hooks the Frieza, orbit, Vegeta and ending modules fill. See [snes-port/debug.md](snes-port/debug.md).
- Core clears every module WRAM block at power-on and title entry (random WRAM on hardware), and the Mesen harness no longer stops long tests at Mesen's 100-second limit.

## 2026-10-17 — SNES cartridge: title, arrival, Goku menus (integration)

- The cartridge's title reads **Secret of GOKU** in gold with the extended credit, the name editor starts with an editable BOY, and the original opening plays as the boy until the sword pull. Goku's Saiyan pod then crashes in, with its descent, impact, quake and flash, obliterates the boy and the sword, leaves the Potos-hole crater, and the five arrival pages and the native event tail follow. Phase timing matches the browser within one frame; settled frames differ from the browser's in under 1% of pixels. Goku takes over the hero slot (GOKU, the typed name kept in the slot's tail) at impact, and the crater persists across menus and doors. See [snes-port/title.md](snes-port/title.md).
- Goku now also appears in the ring marker, the Status, Action Grid and save-confirmation figures, and on GAME FILE faces for valid GOKU records; native weapon swings draw no sword cells while he stands in.
- Test tooling: imported browser states restore the sound CPU at its own instruction boundary, fixing sound-handshake stalls after imports.
- Validation: boot, core, goku, perf, story and title suites pass on the merged build.

## 2026-10-17 — SNES cartridge: Goku sprite and story (integration)

- Goku replaces the boy on the cartridge once he has arrived: every native action and facing, distance-driven walk cycles, pushing, falls, status colours, the water palette, the pygmy miniature, the HUD portrait and the Super Saiyan form with its transformation. Art is converted from the browser sheets at build time (4,837 tiles in banks F8–FA) and poses port `goku-animation.js`; Mesen replays of all 51 native actions match the browser's pose choice on 12,740 of 12,740 frames. The pose API for combat, flight and scenes is in [snes-port/goku.md](snes-port/goku.md).
- The story stack is compiled at build time from the browser's own story sources into banks F0–F7 (four party variants), with native event dispatch, party variants, story-area floors, object overlays, names, the Dragon Ball ledger, Luka's Advice, the five-minute crisis greeting, the Potos gatekeeper and the Water Palace walk. A sweep of all 324 dispatch programs (2,592 choices) and nine differential runs match the browser. Details and the hook table other modules fill are in [snes-port/story.md](snes-port/story.md).
- Test tooling: imported browser states now neutralise idle text pointers into the browser's own story-bank layout, which otherwise redraw stale text every frame on the cartridge.
- Validation: `node snes/test/run-all.mjs` — boot, core, goku, perf and story all pass on the merged build; strict build clean.

## 2026-10-17 — SNES cartridge: core runtime (core stream)

- The standalone cartridge's core gives every module frame callbacks in the field (including dialogue and Mode 7 boss arenas), world flight, ring menus and full-screen menus, vblank callbacks for the field and world NMIs, and a title-program entry hook that resets module state on power-on and soft reset.
- Services: a pad 1 filter after the game's multitap BIOS (hide or add buttons for movement, rings, dialogue, menus and steering), extra sprites behind or in front of the native ones, a VRAM upload queue that never runs past vblank, OBJ VRAM region claims, the native sound driver queue and native event requests (doors, world takeoff, save point).
- GAME FILE saves carry the Goku state in per-slot SRAM sidecars, bound so that saving another slot (which rewrites every slot's native checksum) keeps them valid; damaged or missing sidecars load as legacy saves and NEW GAME clears the state.
- `snes/test/checkpoints.mjs` plays the opening from power-on into shared name-entry, waterfall and Potos checkpoints. Eleven Mesen tests cover every service, the WRAM claims and the untouched SRAM pages. Engine research (loops, interrupts, input, OAM, VRAM, DMA budget, saves, FastROM evaluation) is in [snes-port/engine.md](snes-port/engine.md); the API is in [snes-rom.md](snes-rom.md#modules-and-core-api).

## 2026-10-16 — Mobile fullscreen and Home Screen play

- Expanded mode now removes the header and gives the saved space to the game, keeping touch controls, Sound and Exit visible in portrait and landscape. The previous fallback left the picture unchanged on iPhone.
- Expansion works immediately with missing, denied or stalled fullscreen APIs; prefixed Safari events, browser exits and late native requests are handled. The layout uses a shared class instead of depending on `:fullscreen` selector support.
- iPhone Home Screen launches opt into standalone mode and start expanded. Player options explain Share → Add to Home Screen for playing without Safari's bars. Implementation notes are in [Mobile fullscreen](mobile-fullscreen.md).
- Validation on an isolated checkout including the committed audio fix: 365 unit tests passed (two private-fixture tests skipped), static build, and all 28 Chromium/WebKit phone tests passed. Native Chromium entry/exit and WebKit fallback were also checked visually. Physical iPhone verification remains with the maintainer.

## 2026-10-16 — Release 0.2.1

- Release 0.2.1 (`v0.2.1`) and its Pages build include everything since 0.2.0:
  - **Native set pieces:** title, boss and cinematic scenes composite natively.
  - **Tile-level decoding:** plain background layers are decoded per tile, and pixels are extracted only while still unresolved.
  - **Faster color output:** color math takes a specialized output path, and palette colors are written during slot resolution on plain lines.
  - **Fewer allocations:** per-line fetch caches reset in place instead of reallocating.
  - **Faster APU memory:** reads and writes skip the register switch for plain RAM.
- Measured against the build before this work (Chrome medians, real game): field 123 → 599 frames/s (10.0×), combat 124 → 599, world flight 109 → 550, file select 103 → 577 (above 10× after the final step), title 133 → 691. Without the picture, every scene runs at 16.8–21.8× real time.
- On real iOS Safari 26.5 (simulator) with an extra 20 ms of main-thread work per frame, file select dropped to 45 frames/s on the old build. It now holds 60 frames/s with zero audio underruns.
- Validation:
  - **Unit tests:** 374 pass.
  - **Exactness:** all 42 core states, 41 saved states and 13 captured story scenes match the per-pixel path and the previous build in pixels, WRAM and SPC RAM every frame.
  - **Browser and phone checks:** 320 pass. The 21 failures, 5 skips and one intermittent layout test (`controls.spec.mjs:15`) behave the same on the previous build. The 28 phone checks also pass.

## 2026-10-16 — Title, boss and cinematic scenes composite natively

- The Frieza battle and space fight, the Time Chamber, the planet explosion and the endings rendered every pixel through the mod's hook chain, at about 2× real time; the title logo rows did the same. Effects that post-process the previous result now share one function between the wrapper and the compositor ("posts"). A hook that turns a layer off around its inner call declares it, and the title logo and credit become a BG2 layer patch. These effects write results in place and cache per-line state instead of allocating arrays or re-reading mod state for every pixel.
- Chrome medians: Frieza battle 125 → 486 frames/s, Time Chamber 102 → 461, space fight 110 → 445, good ending 381, planet explosion 318, title 417 → 656; field, combat and menus are unchanged.
- Validation: 374 unit tests. All 13 captured story scenes, the 41 saved states and the scripted overlay scenarios match both the per-pixel path and the previous build exactly (pixels, WRAM, SPC RAM).

## 2026-10-16 — Release 0.2.0

- Native release 0.2.0 (`v0.2.0`) and the matching Pages build bundle everything since 0.1.0: streamed AudioWorklet music for iOS Safari, Codex's mobile fullscreen layout, and exact emulation fast paths.
- Second speed batch in this release:
  - **Scheduler:** batches plain instruction starts and (H)DMA waits.
  - **APU:** batches countdowns and inlines SPC-only steps.
  - **Allocation:** CPU and SPC effective addresses no longer allocate per instruction.
  - **Memory:** CPU reads and writes bypass `snes.read`/`snes.write` wrappers except at registered offsets, with hot work-RAM and ROM reads inlined.
  - **Sprites:** per-line OAM masks feed both sprite evaluators.
  - **Compositor:** resolves only unresolved pixels using per-priority presence, decodes hires main/sub in pairs and inlines Mode 7 texels.
- Chrome medians in the real game: field 591 frames/s (9.9×), combat 553, world flight 489, file select 464, title 417. Without the picture (fast-forward), every measured scene exceeds 1000 frames/s.
- Validation: 374 unit tests and 320 browser checks. The 21 browser failures and 5 skips predate these changes and also fail on 446ac97. The 28 phone checks in Chromium and WebKit, Pages CI and the live-site probe (fullscreen, rotation and gap-free 30 Hz audio in Chrome and WebKit) all pass.

## 2026-10-16 — Mobile emulation speed

- The SnesJs core has four exact fast paths: idle master-cycle batching, a scanline compositor, an instruction-hook gate and a cartridge-read gate. Mod hooks register their breakpoints, ROM ranges and per-line idle tests or line plans; unregistered hooks keep the original per-pixel/per-instruction behavior. Details and the registration contract are in [performance](performance.md).
- The file select and naming menus, world flight, title and field now composite natively, including Goku's sprites, save portraits, the Mode 7 shadow window, radar, radio, scouter and world-scar overlays. This removes the menu music choppiness on slower devices.
- Chrome frames/s: field 117 → 240, world flight 110 → 188, file select 88 → 169, title 214 → 324. At 4× CPU throttling the 30 Hz title-music check went from 35 frames/s with 8 underruns to 60 frames/s with none.
- Real iOS Safari 26.5 (simulator, WebDriver): with an extra 20 ms of main-thread work per frame, the old buffer-node path left 11 gaps (101 ms of silence) and 2 resyncs in 8 seconds; the worklet stream had none, with music audible.
- The phone audio check now reports the sustained emulation rate separately from stream gaps.
- Validation: 372 unit tests, including new power-on comparisons of the compositor, batched cycles and both hook gates against the original paths. In the browser, all 41 private saved states (120 frames each with input) and scripted radio, radar and scar scenarios match the slow paths exactly in pixels, WRAM and SPC RAM.

## 2026-10-16 — Smooth iOS Safari music

- Native SNES music and sound now stream through an AudioWorklet ring buffer (`engine/audio-worklet.js`) instead of one 16 ms buffer node per frame with 25 ms of lead. iOS Safari underran that schedule whenever `requestAnimationFrame` jittered or ran at 30 Hz. It also clicked at each buffer seam, which made the music sound clipped and garbled.
- The worklet linearly resamples the DSP's actual per-frame output (~533 samples at 32 kHz). The old path used nearest-neighbour stretching of a fixed 534-sample window, which repeated a stale sample in most frames.
- Buffering adapts per device. Playback starts at 50 ms of headroom and gains 12 ms after each underrun, up to 160 ms; underruns fade out and re-prime instead of clicking. A ±0.5% rate control holds the queue near its target, clean playback eases the headroom back down, and catch-up bursts skip stale audio. Ki effects are still scheduled at each frame's estimated stream time. Browsers without AudioWorklet keep the previous buffer-node path.
- Touch-first devices request a `balanced` latency hint. An AudioContext that iOS interrupted (calls, Siri, app switches) resumes on the next tap, key or return to the page, and its stream re-primes.
- Validation: 367 unit tests (stream continuity under 30 Hz bursts, starvation fade/re-prime, overflow trimming, rate control and the main-thread worklet clock); seven desktop browser audio checks; and a new Chromium/WebKit phone check that unlocks audio by tapping, then plays the title music at 30 Hz with zero underruns.

## 2026-10-16 — Native release portability

- Normalize recursive build paths to forward slashes so Windows accepts the bundled ROM and uses the same module-path hashing as macOS/Linux.
- Remove empty optional signing environment variables before packaging. GitHub's empty `CSC_LINK` otherwise resolves to the repository directory and prevents macOS ZIP creation. Release errors now terminate with a nonzero status immediately.
- Validation: seven release/desktop unit checks, simulated Windows file traversal with unchanged build ID, failure exit-status verification, a complete macOS arm64 ZIP built with empty CI signing variables, and its two-launch offline save-persistence smoke test. Native CI also passed all three Linux profiles before rerunning the complete matrix with these fixes.

## 2026-10-16 — Sandship release checkpoint

- Included the latest Sandship engine changes: an unplanned roof takeoff, flight beyond the hull or another early exit now blows up the ship and enters the Mech Rider route. Inner bulkheads remain flyable; captives reunite afterward, and equipped gear is preserved.
- Instant Transmission avoids stair/door landing cells, searches farther for nearby floor and uses that floor's height so Goku can climb the stairs afterward.
- Updated the older flight regression to remain inside the hull and account for the returned Heavy Gi's slower speed. Separate checks cover escaping beyond the hull and the resulting fight/reunion.
- Validation: all 24 Sandship/teleport browser scenarios passed, including all four party compositions, breakouts, doors, equipment restoration and stair traversal. The release source also passed 362 unit tests and the offline desktop smoke check.

## 2026-10-16 — Self-contained Pages and release source

- Included the maintainer's verified Downloads cartridge at `rom/secret-of-mana-us.sfc`, the sole authorized ROM tracked in Git. The static build validates and bundles it, and native packaging uses the same committed file without a private CI download secret.
- Browser startup now allows 30 seconds for the bundled download on slower phone connections. The manual chooser remains the fallback; debug checkpoint controls remain hidden during normal play.
- Pages CI verifies the actual built cartridge under a repository subdirectory and tests phone controls in Chromium and WebKit. Audio regression tests unlock audio with a keyboard gesture, so they also work before a cartridge loads.
- Validation: 362 unit tests, four Pages startup/fallback checks, five browser audio checks (including missing-ROM startup), ten Chromium/WebKit phone checks, a static build, and a two-launch offline desktop smoke test covering native SRAM and checkpoint persistence. Private fixtures, captures and packaged downloads remain ignored.

## 2026-10-16 — Woodland riverbanks and lily pads

- Enabled the narrow woodland stream banks shared with town rivers, covering the Potos/Pandora routes and Upper Land. Shore checks can continue past adjacent lily pads to real water/ground, while retaining solid trees and map boundaries.
- Added woodland plain/flowering pads and corrected the Water Palace mapping to 173/174. Tile 175 is a stone column base and remains solid. Pad identities now have one shared definition for scenery and bank checks.
- Validation: 33 flight/geometry unit checks; 267 pads, 226 bounded-bank checks and 112 real controller crossings across 14 native maps in base and SSJ, plus town-water, cave/palace and both-form opening-exit regressions. Original terrain buffers remain unchanged.

## 2026-10-16 — Voiceless form-change sounds

- Replaced the reversed, sped-up return-to-base sample with a short air/ki release and a soft decay. Super Saiyan now builds from non-vocal ki, electricity and whoosh layers; the gold-frame eruption keeps its existing timing.
- Added a matching short air-release fallback. Reverting still fades active power-up tails immediately, with no changes to the shared audio clock.
- Validation: seven sample/synthesis tests and three browser checks covering real L+A transformation/reversion, sampled playback, tail cancellation and audio latency.

## 2026-10-16 — Optional Scouter and native menus

- Sylphid unlocks Goku’s options-ring Scouter toggle. It starts off, replaces Targeting only for Goku after the unlock, updates its ON/OFF title immediately, and remembers the choice in checkpoints/native saves. Removed the focus-plus-ring shortcut and unsolicited Analyzer overlays.
- Native ring and status-page fades retain control of confirmation, preventing punches, ki, focus and teleport from leaking into the field. Combat buttons held while closing a menu must be released first. Battle-name announcements still allow normal combat.
- STATUS uses the native resolved item ID, so reopening the ring with STATUS already selected shows the current Goku power/gear/form calculations.
- Validation: native browser coverage for the Sylphid grant and ring toggle, all four gear/form combinations, menu fades, held-input release, companions, saves and battle announcements; targeted unit tests for Scouter and STATUS behavior.

## 2026-10-16 — Vegeta Final Flash

- Final Flash now fills the screen with the full-power SSJ Kamehameha's wave geometry and yellow energy, including its charge, edge effects and beam clash. Galick Gun retains its purple appearance.
- Only a Kamehameha fired as Super Saiyan can lock Final Flash. SSJ Vegeta takes 32% of incoming damage instead of 38%, making him about 19% tougher; winning a clash still removes 34% of his maximum HP.
- Added Japanese Final Flash and “Kakarotto!” excerpts with the same mono 16 kHz / 10-bit processing as Goku's voice, reproducible preparation and source attribution. The callouts follow windup/struggle timing, stop with the battle and never trigger Goku's release shout.
- Validation: all 358 unit tests, six browser audio checks, eleven private-ROM trial/route checks and the public build pass. Coverage includes the full yellow wave, rejected base-form counters, SSJ clash wins/losses, voice timing, sampled playback, mute/restore cleanup and all four party-return lineups. The full-fight driver now uses real L+A input during Vegeta's transformation break so its counter-shots meet the SSJ requirement; it completes both phases and the native return. Screenshots and audio review output remain under `.local/vegeta-final-flash/`.

## 2026-10-16 — Native releases and public overview

- Added an Electron desktop shell and self-contained Windows/macOS/Linux archives, plus fullscreen Steam Deck and Bazzite profiles. Release packaging includes the verified local ROM and writes SHA-256 checksums while keeping ROMs and outputs out of Git.
- Desktop builds show only the game canvas. Controller startup enables sound automatically; F5/F9 save and restore checkpoints. A stable per-user profile preserves native SRAM and checkpoints across updates.
- Packaged ROM loading allows a cold local read up to 60 seconds; the browser retains its four-second fallback. This fixes the initial Intel macOS launch under Rosetta aborting before the bundled ROM finishes loading.
- Added manual native-release CI with per-platform packaged-app smoke checks and an optional draft release. Local packaging does not publish anything.
- Reduced the public README to the premise, three real gameplay GIFs, title/gameplay screenshots, brief controls and the maintainer's YouTube teaser link. Added the vibe coded, noncommercial fan-game notice.
- Moved detailed gameplay, developer notes, code summaries and this changelog into docs/agents/. Updated links and repository instructions.
- Validation: 349 unit tests, five browser release/title checks, and two-launch smoke tests of packaged Apple silicon and Intel (via Rosetta) macOS apps. Cross-built Linux/Windows archives still require their native CI/hardware checks; Deck/Bazzite hardware and signing credentials are not available locally.

### Goku push animation

- Rebuilt normal and Super Saiyan push cells from existing sprite art, following the rhythm of the boy's native actor push: hold a straight-armed press, ease into a heave, hold it, ease back (16/5/16/5 ticks). Side views use the open-palm blast stance with a shortened forearm so the palm meets the wall; the heave bows the head 3px toward the object, tips the shoulders 1px and slides the rear foot back. The belt and hips never move by more than a pixel, replacing the earlier lunge-cell swap that read as a pelvic thrust and the hand-drawn arms before that. Front/back views use the guard cell, bow the head and swap the planted foot.
- Enemy contact uses native animations 08 and 91, which the earlier wall-only fix missed. Both now use the same push while the player has control; scripted gestures retain their original mappings. Accepted movement advances the feet by distance, while blocked contact uses a slower in-place cadence. Releasing, walking away, focusing and flight cancel the push; collision behavior is unchanged.
- Validation: 31 native animation/presentation unit tests (including palette, palm-reach, at-most-one-pixel hip drift and head-lean checks for every form and direction) and two private-ROM browser checks covering both forms against walls and a live Rabite, including the native contact brace, no wall drift and clean release. Cells and in-game captures were also compared visually with the boy's native push.



## 2026-10-15

### Scene graph, review tooling and cutscene fixes
- Linked-data scene graph of every cutscene and event (`engine/scene-graph.js`,
  `engine/scene-catalog.json`, 107 scenes), launcher (`?scene=<id>`), viewer and
  live debugger (`scenes.html`), CLI (`npm run scenes`), docs (`docs/agents/scenes.md`).
  Launch recipes now actually play 20 previously unreachable scenes; recipes can
  set gold.
- Dialogue: retail-text adaptations (`engine/retail-dialogue.js`), Goku's
  sheepish-Earthling voice and backstory, player-chosen names everywhere
  (`{1}` girl, `{2}` sprite, `{3}` boy; `engine/native-names.js`), the boy's
  title-screen name survives the crash, quick-start companion names fixed.
- Page breaks follow speakers: 4-line speeches read 2+2, no one-word stub
  pages, no label split from its line (`dialoguePagesOf`, compiler layout).
- Dialogue window moves above the HUD when it would cover the speakers
  (`engine/window-placement.js`). Placement is decided once per scene, before
  the first window tile shows, and never changes mid-scene.
- Optional Scouter from Sylphid, enabled through Goku’s options ring (`engine/scouter.js`).
- Sandship: Kamehameha breakout from the engine room (Sneak or KAMEHAMEHA
  choice, or any full wave below deck) straight into Mech Rider 1; lines
  rewritten to fit; cabin framing fixed; `?start=sandship`.
- Fixes from a full visual review: solo Popoi visible in Frieza's showdown,
  Luka's garbled choice and looping lecture, Undine/Gaia empty windows,
  Watts' paging, Fanha/Emperor repeated labels, banishment wrap, ghost labels.
- Frieza arc reordered: the altar theft no longer fires the Death Ball. Hexas
  and the retail Mech Rider III fight (on the Mana Fortress) come back; after
  Rider III Frieza charges on the Fortress deck and the Death Ball grows,
  falls and detonates during the Mode 7 sinking-continent flyby
  (`engine/frieza-flyby.js`), followed by the five-minute announcement. An
  early Fortress entry still gets the deck scene directly. `?start=rider`.
- Mana Tree chase: the Tree no longer talks about its barrier, and the
  cloud-barrier skip is disabled while Frieza holds the Balls.

### Frieza finale, Vegeta trial and engine work (parallel session)
- Mana Tree pursuit and destruction (`frieza-tree*.js`, `mana-tree-vista.js`),
  Frieza staging/intro (`frieza-staging.js`, `frieza-intro.js`,
  `death-ball-art.js`), orbital duel/camera/debris/menu (`orbit-*.js`),
  wish flight and departure endings (`wish-flight.js`, `ending-departure.js`).
- Joch's trial against Vegeta with sprites, score and hair (`joch-trial.js`,
  `vegeta-*.js`, `time-chamber.js`, `saiyan-palette.js`, new audio/sprites).
- Boss rush death and victories, aerial melee, native status/item icons,
  palace braziers, Water Palace changes, dark force and boss particles.

### Known open items
- `story-shortcuts` "Fortress route … reaches Thanatos" predates the Mana Tree
  chase and never visits the Tree.
- Frieza wish-route tests stall in the orbital clash's new `recoil` phase.
- Two late quick-start browser checks (orbit/summon phase expectations).
- Empire castle jail opening is unreachable (story-areas floors flag 34).
