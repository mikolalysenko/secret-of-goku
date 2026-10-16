# Changelog

Several Claude Code sessions work on this repository in parallel. Each entry
lists what landed, grouped by the work stream that produced it, so changes
stay traceable even when they are committed together.

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
