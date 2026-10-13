# Goku combat and animation

The native game owns maps, input locks, party ownership, enemy AI, HP transitions, rewards, boss events and audio playback. The wrapper supplies Goku's action timing, directional sprite selection and attack geometry. It never replaces the native battle/event engine with a separate enemy simulation.

## Controls and timing

All durations below are emulated 60 Hz frames. Each attack starts its own clock; it does not begin at an arbitrary point in a global animation loop.

| Action | Base | Super Saiyan |
| --- | --- | --- |
| Tap J/Space/Z | 14-frame punch | 7-frame punch |
| Strike after release | 2 frames | 1 frame |
| Buffered next combo hit | After frame 9 | After frame 4 |
| Hold before charge begins | 12 frames | 12 frames |
| Full charge | 90 charging frames | 45 charging frames |
| Held C barrage | 3 shots every 12 frames | 3 shots every 5 frames |
| Full-strength damage | 4095 | 8191 |
| Launch distance | 56 pixels | 88 pixels |

Rapid taps chain a punch, cross and finishing kick; the SSJ sheet reuses its single punch strip for the cross. The kick deals 1.5 times normal damage. An idle gap resets the combo. Pressing attack immediately selects the ready pose; releasing selects the strike. Holding enters the cupped-hands charge pose. Arrows move and aim during charge; the upper-body charge pose keeps its measured hands while walking legs animate below. Release locks the beam direction. C alternates palm-release poses for a three-shot burst and repeats while held. R plays a 32-frame transformation or 20-frame reversion from the actual source sequence.

E confirms/talks through native B without starting an attack. Ring opening, dialogue, character switching, incapacitation and map changes clear incompatible combat state. A held attack cannot accidentally confirm a ring item after opening the ring. Native `$EC` bit 0 is NMI synchronization rather than a menu lock; treating it as a lock interrupted charges around active enemies. `$E02C & 1` checks player ownership so controlling Primm or Popoi retains native attacks.

`GameInput` tracks every keyboard alias, touch pointer, controller button and stick axis separately. Releasing Space cannot release a held J or touch button. Brief taps survive two controller samples, and blur/pause clears held controls. Shift/K fly at 6 pixels per update (8 in Super Saiyan), Tab switches characters, comma/period pass native L/R, and the existing flight controls remain native.

## Source poses and positioning

`goku-animation-data.js` describes the supplied 32×32 sheets: normal 63 columns, SSJ 55; physical direction rows down/left/right/up. The gameplay facing enum maps through `[0,2,1,3]`. Every selected cell has verified occupied pixels. The empty rear blink cell, unrelated fusion poses and SSJ3 front poses are excluded.

The ground origin stays `[16,31]`, including prone frames. Full crops retain the bottom boot row. Native body emission at C0:E6AB identifies the actor descriptor. An ownership sidecar tracks those cells through WRAM and actual OAM DMA, together with their displayed pose and renderer pivot. `$04/$06` plus native shadow-height metadata already include lift and shake, so lift is not subtracted twice. Neither the collision floor nor the top of the current OAM arrangement is a height measurement. Walk/run frames advance every six pixels travelled, with a three-frame stationary settle at walls. Teleports do not race through walk frames.

All 51 entries of the standard D1:37CC player animation table have explicit mappings in `goku-native-actions.js`. The displayed sequence pointer validates table identity before reading the latched animation and native graphic frame. Native requested animation `$E011` can precede `$E031` by several frames. Chest opening, boss reward gestures, resting, disappearing and recovery use the displayed native phases. A0/AE stay airborne through the native flailing sequence. A2's fall/bounce/rest/get-up and 8F's recovery follow native pose IDs in `$E026`, verified from all four entry directions. They do not become a standing sprite during a knockdown or a prone sprite during a long fall. Status sleep/death use the source's horizontal art. Native poison/petrify/ghost colors, miniature size and shared snowman/moogle bodies remain in the original rendering path.

Charge, beam and ki use separately measured hand sockets. Upward effects draw behind opaque body pixels so the beam does not erase Goku's hair. Punch sheets already contain their white motion arcs; misses do not draw impact sparks. The existing ROM effect decoder supplies charge orbs, beams, impacts and gold aura cells. Aura is reserved for charging and transformation so it does not obscure the striking poses. All of these still pass through native OBJ depth, foreground composition, windows and color math.

World flight uses the verified four-way flight cells, rear view, discrete banking and a one-pixel bob. It retains the native Mode 7 map, movement and landing rules. Both forms can transform, steer, climb, descend and restore a flight checkpoint.

## Real damage, launch and sound

Punch hitboxes use a forward range and lateral width, excluding party slots, inactive/dead actors and NPC species. Beams advance 32 pixels per frame; ki advances 14. Damage follows the visible front and each projectile hits an enemy once. Ki disappears at its first hit. Beam damage scales with charge with a quarter-strength minimum.

Damage is queued at actor `+0x1F1`, with `+0x1EC=0` and `+0x1F0=0` attributing the hit to Goku. The original routine at C0:4053 applies the hit, native sound, number, reaction and death. Its queue/display clamps at 999; excess damage is applied first while leaving at least 1 HP for the native lethal hit. Directly zeroing HP or omitting attribution bypassed necessary reward behavior. Native Rabites now award XP and 2 GP once; Mantis Ant reaches the original death and rescue path.

Ordinary enemies follow a twelve-frame eased launch and height arc. When the native kill routine changes their species to death effect F9, that same effect keeps travelling. Bosses are not relocated. A sampled ki-combat impact accompanies the original native hit path.

`ki-sound.js` synthesizes 22,050 Hz energy sounds with bounded amplitudes: a rising charge loop, beam roar, rapid bolts, impacts, transformation and Instant Transmission chirps. `kamehameha-voice.js` plays one continuous Japanese charge excerpt, slowed without pitch shifting to about 3.7 seconds. Both forms keep the same voice pace, even though Super Saiyan reaches mechanical full charge sooner. Holding past full power lets the chant finish; releasing early fades it into the final shout. The final shout occurs only on release; full charge never loops or shouts automatically. Voice and effects mix alongside native SPC music and stop on mute, pause and cancelled attacks. Source and edit points are recorded in `assets/audio/kamehameha-jp.json` and [credits](../CREDITS.md).

Kamehameha remains blue in both forms. Its swept hitbox queues native C-prefix replacements for plants, axe rocks, stalagmites and staged barriers in the active map layer. Replacement cycles are rejected so switch tiles are not treated as destructible objects. C0:C7C3 rebuilds original tilemap rows and DMA, so collision changes with the picture. Beams and punches briefly use the original BG quake; a native event write immediately takes ownership back.

Super Saiyan charge lightning regenerates deterministic jagged paths every three emulated frames, including while holding full power. Bolts connect to nearby native solid-tile edges, low obstacles and actors, using Thunderbolt colors and original 16×16 cells. These arcs are decorative; attacks activate puzzles. Snapshot replay reproduces the same paths.

Crystal Orb species `$55` is excluded from damage and Instant Transmission. `native-orbs.js` reads each live orb's event ID at `+0x3E` and its native elemental-test call. A hit supplies an accepted spell value to the orb's `+0x181` test byte, then calls native C1:E76D at the safe C0:B073 boundary with the original actor context. The original script handles puzzle flags, graphics, disappearance, sound and dialogue. The Fire Palace entrance requires the second fire-test value; Grand Palace events accept any nonzero result. There are no direct puzzle-flag writes.

Native poison (`$E191 & $20`) immediately removes Super Saiyan, cancels a charge and requires releasing attack before charging again. Transformation remains unavailable until the native status clears; poison damage, timing and cures remain game-owned.

Shift+C (or touch Teleport) selects one living hostile, vanishes, and reappears 26 pixels beside it. No damage is applied by teleportation and Goku stays there. Subsequent presses cycle away from the previous target. Party members, NPCs, dead actors, menus and scripts are excluded.

Local flight modifies the native movement vector at C0:D651. Boundaries are derived from each loaded map's live BG1/BG2 collision grids and descriptors, including story-driven changes. Native C0–CB destructible replacement chains, walkable tall grass, and verified short scenery in the original village/forest tilesets permit a collision bypass. Potos shrubs and flowers inspect the paired BG2 art cell because their solid BG1 placeholders are shared with trees. Terrain flags 1/2 represent heights; 3 is solid. Every intermediate pixel checks the full 12×8 foot rectangle, rejecting mixed wall/obstacle corners. Native walls, cliffs, slopes, doors, layer switches and party/camera limits keep their original collision handling; map bounds have an eight-pixel clamp to avoid coordinate wrap. Unsafe fast steps reduce to one pixel before native collision; leaving a low object is permitted, and an unexpected out-of-bounds displacement returns to the last verified same-layer landing position. Releasing over an obstacle keeps Goku hovering at normal steering speed until the entire footprint is clear. Charging halves ground speed to 1 pixel/update and flight to 3/4 pixels in base/SSJ form. Local altitude is visual; `$E045` remains native physics.

`native-gap-flight.js` redirects only the native 6D8 whip-pad and 6FA post-hit gates for controlled Goku. A matching native 6F8 post must exist four tiles away. Event 6F9 supplies the original party gather, crossing, camera movement and balanced CF01 flags without fastening a whip. Goku uses a level hover pose during the crossing. Other actors and events retain their original scripts; checkpoint state includes the active crossing.

## Verification

`npm test` covers timing, direction, hit exclusions, combo buffering, charge caps, travelling damage, input ownership, transforms, frame pivots, NMI synchronization, script recovery and snapshot replay. Browser checks use the local cartridge to kill real Rabites with all three attack types, finish Mantis, operate keyboard/on-screen controls, switch characters, fly/land in both forms, and replay charge/flight checkpoints. Original title, BOY bridge, sword arrival and Potos progression remain separate regression checks.

`tests/browser/ki-world.spec.mjs` additionally checks both forms' half-speed charging, poison cancellation/retransformation, a full-party native whip crossing, beam destruction of rocks on BG1 and BG2, moving lightning at full charge, Japanese voice stage/release timing and mute, walls in village/cave/palace maps, and original puzzle progress at all 14 elemental-orb locations. Native entrance effects are allowed to return control before attacks begin.

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

This verifies the implemented combat loops and listed native poses, not every cutscene in a full story playthrough. Timings are authored adaptations of the supplied artwork, not decompiled Buu's Fury timing. The original sprite ring remains native; ki and transformation currently use C/R and their touch buttons. The developer power toggle stops continuous stat boosts rather than reconstructing historical pre-mod character statistics.


## Items and noncombat interaction

`native-senzu.js` overlays the shared item name at ROM PC `0xAA120` and replaces the decompressed cup's four-cell sprite by a VRAM fingerprint. Shops, rings and item-name references in event text share that lookup. Authored dialogue also normalizes singular/plural Cup of Wishes mentions. Native item 05 already revives to maximum HP at C0:5593; the D0:DB2A item-only target gate now also accepts living, injured allies. Full-health targets remain invalid, spells keep their own targeting, and native consumption and healing animations remain intact.

`native-interaction.js` leaves C0:B851 NPC/chest interaction alone and stops Goku's normal/charged native weapon fallback at C0:B2A7 / C0:B224. BOY's opening, companion attacks and menu confirmation retain native behavior. Empty-handed punches cut nearby breakable objects through `native-plants.js`.
