# Goku combat and animation

The native game owns maps, input locks, party ownership, enemy AI, HP transitions, rewards, boss events and audio playback. The wrapper supplies Goku's action timing, directional sprite selection and attack geometry. It never replaces the native battle/event engine with a separate enemy simulation.

## Controls and timing

All durations below are emulated 60 Hz frames. Each attack starts its own clock; it does not begin at an arbitrary point in a global animation loop.

| Action | Base | Super Saiyan |
| --- | --- | --- |
| Tap B / X | 14-frame punch | 7-frame punch |
| Strike after press | 2 frames | 1 frame |
| Buffered next combo hit | After frame 9 | After frame 4 |
| L+Y starts charge | Immediate | Immediate |
| Full charge | 90 charging frames | 45 charging frames |
| Held Y / C ki fire | 1 shot every 12 frames | 1 shot every 5 frames |
| Full-strength damage | 4095 | 8191 |
| Launch distance | 56 pixels | 88 pixels |

Rapid taps chain a punch, cross and finishing kick; the SSJ sheet reuses its single punch strip for the cross. The kick deals 1.5 times normal damage. An idle gap resets the combo. B starts a punch immediately; holding chains the combo. L+Y enters the cupped-hands charge pose. Arrows move and aim during charge; the upper-body charge pose keeps its measured hands while walking legs animate below. Release locks the beam direction. Y / C emits one alternating-palm shot per tap and repeats while held. L builds a focus aura over 96 frames. L+A commits the full aura to the source transformation (72 frames on the first reveal, then 32); a fresh L+A press while Super Saiyan reverts in 10 frames. Holding the revert chord cannot transform again until released. Other L chords take priority.

B / X talks and confirms through the native interaction handler; in an empty field it punches. Ring opening, dialogue, character switching, incapacitation and map changes clear incompatible combat state. A held attack cannot accidentally confirm a ring item after opening the ring. Native `$EC` bit 0 is NMI synchronization rather than a menu lock; treating it as a lock interrupted charges around active enemies. `$E02C & 1` checks player ownership so controlling Primm or Popoi retains native attacks.

`GameInput` tracks keyboard keys, touch pointers and controller buttons separately. Brief taps survive two controller samples; blur and pause cancel held controls. Only arrows move. Keyboard Z/X/C/A map to SNES A/B/Y/X; Shift/D to L/R; Space (or Enter) to Start; S to Select. A/Z alone stays still and with a direction flies at 6 pixels per update (8 in Super Saiyan). L+B teleports, L+Y charges, L+A transforms, and L+R takes off. Mode 7 keeps A ascent and B descent. R/D accelerates scenes up to 12×, skipping intermediate picture generation while running the CPU/APU/DMA and native events; choices stop automatic confirmation. Ring X/A opens, backs out and closes; arrows rotate/change tiers. Mobile provides the same pad plus four single-button technique chords. Start resumes a paused player without leaking into the game.

## Source poses and positioning

`goku-animation-data.js` describes the supplied 32×32 sheets: normal 63 columns, SSJ 55; physical direction rows down/left/right/up. The gameplay facing enum maps through `[0,2,1,3]`. Every selected cell has verified occupied pixels. The empty rear blink cell, unrelated fusion poses and SSJ3 front poses are excluded.

The ground origin stays `[16,31]`, including prone frames. Full crops retain the bottom boot row. Native body emission at C0:E6AB identifies the actor descriptor. An ownership sidecar tracks those cells through WRAM and actual OAM DMA, together with their displayed pose and renderer pivot. `$04/$06` plus native shadow-height metadata already include lift and shake, so lift is not subtracted twice. Neither the collision floor nor the top of the current OAM arrangement is a height measurement. Walk/run frames advance every six pixels travelled, with a three-frame stationary settle at walls. Teleports do not race through walk frames.

All 51 entries of the standard D1:37CC player animation table have explicit mappings in `goku-native-actions.js`. The displayed sequence pointer validates table identity before reading the latched animation and native graphic frame. Native requested animation `$E011` can precede `$E031` by several frames. Chest opening, boss reward gestures, resting, disappearing and recovery use the displayed native phases. A0/AE stay airborne through the native flailing sequence. A2's fall/bounce/rest/get-up and 8F's recovery follow native pose IDs in `$E026`, verified from all four entry directions. They do not become a standing sprite during a knockdown or a prone sprite during a long fall. Status sleep/death use the source's horizontal art. Native poison/petrify/ghost colors, miniature size and shared snowman/moogle bodies remain in the original rendering path.

Charge, beam and ki use separately measured hand sockets. On foot, upward effects draw behind opaque body pixels so the beam does not erase Goku's hair. In world flight, shots draw in front of his body. Punch sheets already contain their white motion arcs; misses do not draw impact sparks. The existing ROM effect decoder supplies charge orbs, beams, impacts and gold aura cells. Aura is reserved for charging and transformation so it does not obscure the striking poses. All of these still pass through native OBJ depth, foreground composition, windows and color math.

World flight uses the verified four-way flight cells, rear view, discrete banking and a one-pixel bob. It retains the native Mode 7 map, movement and landing rules. Both forms can transform, steer, climb, descend and restore a flight checkpoint.

## Real damage, launch and sound

Punch hitboxes use a forward range and lateral width, excluding party slots, inactive/dead actors and NPC species. Regular beams advance 32 pixels per frame; ki advances 14. Damage follows the visible front. A beam reapplies its damage every eight frames of contact, or every six frames for the full SSJ wave. Each pulse rechecks the visible width and live target. Ki disappears at its first hit; puzzle orbs still activate only once per beam. Beam damage scales with charge with a quarter-strength minimum.

A full Super Saiyan charge selects a 64-frame beam with an 80-pixel half-width, 640-pixel range and 48-pixel/frame front. Its width grows over six frames, tapers out from the hands over 44 pixels, and collapses over the final ten frames. Enemy and native destructible-tile coverage share that envelope. Goku holds the firing pose through the beam and recovers for four frames. The solid core uses Lucent Beam's original four colors, with native blue Thunderbolt cells and sparks along the edges; it still enters the PPU OBJ layer. Mode 7 uses a 72-frame perspective streak, including at maximum altitude, and doubles the aimed-target range to 1024 world units. Normal and partial charges retain their original timings.

Damage is queued at actor `+0x1F1`, with `+0x1EC=0` and `+0x1F0=0` attributing the hit to Goku. The original routine at C0:4053 applies the hit, native sound, number, reaction and death. Its queue/display clamps at 999; excess damage is applied first while leaving at least 1 HP for the native lethal hit. Once queued damage is lethal, beam pulses stop touching that actor. Per-target pulse timers survive checkpoints. Directly zeroing HP or omitting attribution bypassed necessary reward behavior. Native Rabites award XP and 2 GP once; Mantis Ant reaches the original death and rescue path.

Ordinary enemies follow a twelve-frame eased launch and height arc. When the native kill routine changes their species to death effect F9, that same effect keeps travelling. Bosses are not relocated. `native-combat-sound.js` marks Goku’s queued hits and bypasses only their native sound routine at C0:4157. DBZ contact cues replace it; damage, numbers, reactions, rewards and death events still execute normally. Goku’s own native hurt impacts also use the DBZ cue. Other actors retain their native sound paths.

`ki-sound.js` loads 19 short, level-matched effects. Punch/cross windups alternate two anime air swishes, and the finishing kick has a longer whoosh. These come from catalogued Dragon Ball TV-anime whooshes, replacing the old sped-up flight sample. Punch/cross impacts cycle through three separate samples; the finishing kick, palm shots, projectile collisions, full charge, transformation/reversion, teleport departure/arrival, takeoff and landing have their own cues. Misses only play a whoosh. Each ki sound starts when its palm actually emits a projectile; impact sounds wait for contact, including native destructible-tile completion and world-map targets. Voice caps, short overlap fades and a compressor limit rapid Super Saiyan barrages. The deterministic synth remains an emergency fallback if sample loading fails.

`kamehameha-voice.js` uses a Demucs-separated Japanese vocal stem with independent, reduced gains (.32 charge / .36 release). The roughly 3.7-second charge retains its vowels and the same pace in both forms. Releasing fades the chant into a separate shout. A circular-crossfaded DBZ energy bed continues indefinitely after the voice finishes, with a modest pitch/gain rise tied to charge strength; SSJ adds a separate electrical bed. Flight starts with a 0.22-second non-vocal energy swell crossfaded into an anime whoosh. Its quiet sustained air comes from an envelope-leveled TV-anime whoosh, never the former voiced power-up sample. All voices and loops clear on mute, pause, input cancellation and state restore. The original SPC music stays separate. Manifests record source checksums, edits and attribution in `assets/audio/`; see [credits](../CREDITS.md).

Asset preparation is offline and is not needed to run or build the game:

Both preparation scripts share `scripts/snes-audio.mjs`: mono 16 kHz, 5.6 kHz low-pass and 10-bit quantization in PCM WAV files. This is an intentional SNES-style sample treatment, not a BRR hardware encoder. It retains the earlier level matching, separate voice/energy controls and circular crossfades. All added effects and voice files use the same treatment; original music remains in the emulated SPC.

```sh
# Use local source recordings; original downloads are never distributed as packs.
python -m demucs --two-stems=vocals -n htdemucs -d cpu -o /tmp/separated /path/to/voice.wav
node scripts/prepare-kamehameha-audio.mjs /tmp/separated/htdemucs/voice/vocals.wav /path/to/original.mp3
node scripts/prepare-dbz-audio.mjs /path/to/local/effect-sources
```


Kamehameha remains blue in both forms. Its swept hitbox queues native C-prefix replacements for plants, axe rocks, stalagmites and staged barriers in the active map layer. Replacement cycles are rejected so switch tiles are not treated as destructible objects. C0:C7C3 rebuilds original tilemap rows and DMA, so collision changes with the picture. `native-barriers.js` additionally dispatches original opening events for authored gates and native F-prefix hit switches, once per beam. Whip posts use their separate crossing handler. Punches can smash these gates at close range. Beams and punches briefly use the original BG quake; a native event write immediately takes ownership back.

Super Saiyan charge lightning regenerates deterministic jagged paths every three emulated frames, including while holding full power. Bolts connect to nearby native solid-tile edges, low obstacles and actors, using Thunderbolt colors and original 16×16 cells. These arcs are decorative; attacks activate puzzles. Snapshot replay reproduces the same paths.

Crystal Orb species `$55` is excluded from damage and Instant Transmission. `native-orbs.js` reads each live orb's event ID at `+0x3E` and its native elemental-test call. A hit supplies an accepted spell value to the orb's `+0x181` test byte, then calls native C1:E76D at the safe C0:B073 boundary with the original actor context. The original script handles puzzle flags, graphics, disappearance, sound and dialogue. The Fire Palace entrance requires the second fire-test value; Grand Palace events accept any nonzero result. There are no direct puzzle-flag writes.

`native-hit-recovery.js` shortens Goku's ordinary hit recovery after 24 frames by finishing the native damage-number fade and skipping remaining animation delays. Native cleanup frees the sprites and restores movement; sleep, transformations, death, scripted knockdowns and companions keep their normal paths.

Native poison (`$E191 & $20`) immediately removes Super Saiyan, cancels a charge and requires releasing attack before charging again. Transformation remains unavailable until the native status clears; poison damage, timing and cures remain game-owned.

L+B / Shift+X (or touch focus + fist) selects a living hostile with a usable adjacent landing and leaves Goku there without dealing damage. `native-teleport.js` checks a full footprint 18–38 pixels beside the target, preferring 26 pixels on the approach side. The corridor to the enemy must also be clear: landing on the opposite side of a bank/wall, on a script pad or on a layer seam is rejected. Arrival rechecks the moving target and copies its full native layer/terrain byte, then gathers CPU-controlled companions to prevent the native party leash from blocking movement.

The original camera dispatcher at C0:D6AC receives at most 15 pixels per frame, allowing each crossed 16px map row/column to stream into VRAM with native parallax. Teleport’s hidden phase and input lock last until the camera catches up; its arrival cue then plays. This avoids stale/blank background tiles from directly jumping scroll registers. Checkpoints preserve pending scrolls. Holding the teleport chord neither punches nor triggers the native dash. Subsequent presses cycle away from the previous target; party members, NPCs, dead actors, menus and scripts are excluded.

Local flight modifies the native movement vector at C0:D651. Boundaries are derived from each loaded map's live BG1/BG2 collision grids and descriptors, including story-driven changes. Native C0–CB destructible replacement chains, walkable tall grass, and verified short scenery in the original village/forest tilesets permit a collision bypass. Potos shrubs and flowers inspect the paired BG2 art cell because their solid BG1 placeholders are shared with trees. Terrain flags 1/2 represent heights; 3 is solid. Every intermediate pixel checks the full 12×8 foot rectangle, rejecting mixed wall/obstacle corners. Flight can cross native terrain-height bands and short forest rock banks when both opposite sides contain usable ground within five tiles (sixteen on Gaia's Navel, whose stacked cliffs separate usable levels). Bank art bordering forest voids remains closed. Haunted Forest low vines and flowers are also flyable. Room walls, unsupported cliffs, doors, layer switches and party/camera limits keep their original collision handling; map bounds have an eight-pixel clamp to avoid coordinate wrap. Unsafe fast steps reduce to one pixel before native collision; leaving a low object is permitted, and an unexpected out-of-bounds displacement returns to the last verified same-layer landing position. Releasing over an obstacle keeps Goku hovering at normal steering speed until the entire footprint is clear. Charging halves ground speed to 1 pixel/update and flight to 3/4 pixels in base/SSJ form. Local altitude is visual; `$E045` remains native physics. Travel is capped at 14 pixels per axis per video frame, including catch-up updates, so the native VRAM row streamer can keep up. Airborne actor contact can pass NPCs without pushing them or suppressing conversations; native dialogue immediately drops visual lift. Recovery from a bad old checkpoint also streams the camera to the safe position.

`native-gap-flight.js` redirects only the native 6D8 whip-pad and 6FA post-hit gates for controlled Goku. A matching native 6F8 post must exist four tiles away. Event 6F9 supplies the original party gather, crossing, camera movement and balanced CF01 flags without fastening a whip. Goku uses a level hover pose during the crossing. Other actors and events retain their original scripts; checkpoint state includes the active crossing.

## Verification

`npm test` covers timing, direction, hit exclusions, combo buffering, charge caps, travelling damage, input ownership, transforms, frame pivots, NMI synchronization, script recovery and snapshot replay. Browser checks use the local cartridge to kill real Rabites with all three attack types, finish Mantis, operate keyboard/on-screen controls, switch characters, fly/land in both forms, and replay charge/flight checkpoints. Original title, BOY bridge, sword arrival and Potos progression remain separate regression checks.

`tests/browser/ki-world.spec.mjs` additionally checks both forms' half-speed charging, poison cancellation/retransformation, a full-party native whip crossing, beam destruction of rocks on BG1 and BG2, moving lightning at full charge, Japanese voice stage/release timing, sustained-loop RMS after the voice ends, and mute, walls in village/cave/palace maps, and original puzzle progress at all 14 elemental-orb locations. Native entrance effects are allowed to return control before attacks begin.

`tests/browser/teleport.spec.mjs` covers a riverbank landing from the wrong terrain height, camera streaming to an offscreen enemy, walking and opening the ring afterward, flying across the early river, and escaping an old bank-stranded checkpoint. Unit checks cover every prepared audio cue, loop continuity/headroom and animation-frame cue timing.

The local inspection tools are reproducible:

```sh
npm run audit:combat  # 41 controller-driven sequences, 2,684 selected frames
npm run audit:poses   # 28 native event-driven gesture/chest/boss/fall/recovery sequences
npm run audit:effects # all four directions and both forms, plus ring cancellation
npm run audit:status  # native status and miniature comparisons
node tools/qa/flight-boundary-audit.mjs --out .local/flight-boundaries
```

The boundary audit loads every documented gameplay map through the original engine and records both collision layers as private per-map boundary masks. `.` marks clear landing tiles, `o` low obstacles, and `#` tiles retaining native collision. It checks tile centers and outer edges; redirects and non-ground scenes are reported separately. The runtime checks full footprints at every movement pixel, using current map data rather than these diagnostic masks. Story variants therefore update the boundary automatically. This is a structural map audit, not a full traversal of every route.

Initial combat validation (2026-10-13, before the story/shortcut changes): all 370 documented gameplay map entries passed the native boundary audit, with no invalid accepted tile centers or outer-edge positions. All 84 unit tests and 25 browser regressions passed, including all 14 orb puzzles. Reports remain in `.local/flight-boundaries/flight-boundaries.json` and `.local/kamehameha-voice/`.

They use the local controller-produced party fixture `.local/graphics-audit/party.json`. Captures, animation galleries, reports and native research remain under `.local/animation-audit/` and `.local/graphics-audit/`. Diagnostic filmstrips may hide companions to inspect Goku; separate native presentation checks retain their occlusion. The pose audit temporarily installs a bounded scratch event in its browser's cartridge copy and restores it afterward. No source ROM is modified.

This verifies the implemented combat loops and listed native poses, not every cutscene in a full story playthrough. Timings are authored adaptations of the supplied artwork, not decompiled Buu's Fury timing. The original sprite ring remains native; ki and transformation use the SNES Y / L+A controls and their keyboard/touch equivalents. The developer power toggle stops continuous stat boosts rather than reconstructing historical pre-mod character statistics.


## Items and noncombat interaction

`native-senzu.js` overlays the shared item name at ROM PC `0xAA120` and replaces the decompressed cup's four-cell sprite by a VRAM fingerprint. Shops, rings and item-name references in event text share that lookup. Authored dialogue also normalizes singular/plural Cup of Wishes mentions. Native item 05 already revives to maximum HP at C0:5593; the D0:DB2A item-only target gate now also accepts living, injured allies. Full-health targets remain invalid, spells keep their own targeting, and native consumption and healing animations remain intact.

`native-interaction.js` leaves C0:B851 NPC/chest interaction alone and stops Goku's normal/charged native weapon fallback at C0:B2A7 / C0:B224. BOY's opening, companion attacks and menu confirmation retain native behavior. Empty-handed punches cut nearby breakable objects through `native-plants.js`.
