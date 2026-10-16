# Goku combat and animation

The native game owns maps, input locks, party ownership, enemy AI, HP transitions, rewards, boss events and audio playback. The wrapper supplies Goku's action timing, directional sprite selection and attack geometry. It never replaces the native battle/event engine with a separate enemy simulation.

Power mode starts Goku at level 99 (`$E181=98`, zero-based) and caps all eight weapon skills at 8:99 (`$E1C0–C3=88`, `$E1D0–D7=99`, active proficiency `$E19C=8`). These caps also apply when resuming older saves, without executing level-up announcements. Unpowered mode retains native progression. HP still follows the existing 999 maximum and persistent injury rules.

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

Rapid taps chain a punch, cross and finishing kick; the SSJ sheet reuses its single punch strip for the cross. The kick deals 1.5 times normal damage. An idle gap resets the combo. B starts a punch immediately; holding chains the combo. L+Y enters the cupped-hands charge pose. Arrows move and aim during charge; a two-pose shuffle alternates a wide stance and feet drawn together every sixteen pixels travelled. The lower-leg tiles slide sideways by one or two native pixels while both boots retain their floor rows. The upper body and measured hand sockets stay fixed. Focus and transformation allow the same native walk and collision. Stopping settles the feet, including at walls. Release locks the beam direction. Y / C emits one alternating-palm shot per tap and repeats while held. L builds a focus aura over 96 frames. L+A commits the full aura to the source transformation (72 frames on the first reveal, then 32); a fresh L+A press while Super Saiyan reverts in 10 frames. Holding the revert chord cannot transform again until released. Other L chords take priority.

Punches and quick ki strikes keep a fixed native foot pivot through recovery. The original source cells supply the arm motion without body translation, warping or scaling. Punches connect after two frames in base form or one in SSJ. A connected punch/cross holds its contact pose and spark for two extra frames, or three for the kick, before launch begins. Misses and puzzle orbs have no contact hold. Combo inputs still buffer during the hold, and the native simulation and audio continue.

The first gold transformation cell triggers the power-burst sound, flash, quake and one circular hit together: frame 26 of the first reveal or frame 12 of later transformations. Enemies within 56 native pixels take 75% of SSJ attack strength (6143 before boss resistance). Small enemies launch radially; bosses stay in place. A 14-frame ring of native gold spell cells dissipates around the impact. Party members, NPCs, puzzle orbs and already-lethally-queued enemies are excluded. Mode 7 transformations remain cosmetic. The saved ignition latch prevents duplicate damage on checkpoint restoration; holding focus in SSJ does not retrigger the blast.

B / X talks and confirms through the native interaction handler; in an empty field it punches. Ring opening, dialogue, character switching, incapacitation and map changes clear incompatible combat state. A held attack cannot accidentally confirm a ring item after opening the ring. Native `$EC` bit 0 is NMI synchronization rather than a menu lock; treating it as a lock interrupted charges around active enemies. `$E02C & 1` checks player ownership so controlling Primm or Popoi retains native attacks.

`GameInput` tracks keyboard keys, touch pointers and controller buttons separately. Brief taps survive two controller samples; blur and pause cancel held controls. Only arrows move. Keyboard Z/X/C/A map to SNES A/B/Y/X; Shift/D to L/R; Space (or Enter) to Start; S to Select. A/Z alone stays still and with a direction flies at 6 pixels per update (8 in Super Saiyan). L+B teleports, L+Y charges, L+A transforms, and L+R takes off. Mode 7 keeps A ascent and B descent. R/D accelerates scenes up to 12×, skipping intermediate picture generation while running the CPU/APU/DMA and native events; choices stop automatic confirmation. Ring X/A opens, backs out and closes; arrows rotate/change tiers. Mobile provides the same pad plus four single-button technique chords. Start resumes a paused player without leaking into the game.

## Source poses and positioning

`goku-animation-data.js` describes the supplied 32×32 sheets: normal 63 columns, SSJ 55; physical direction rows down/left/right/up. The gameplay facing enum maps through `[0,2,1,3]`. Every selected cell has verified occupied pixels. The empty rear blink cell, unrelated fusion poses and SSJ3 front poses are excluded.

Focus holds the original directional guard while its aura gradually builds. Both forms keep their own short-haired cells. Gold flare cells 56/57 belong only to transformation; the SSJ atlas's long-haired SSJ3 transformation cells are never used for focus. Focus and transformation keep their authored upper-body pixels and use the same sliding shuffle while moving.

The ground origin stays `[16,31]`, including prone frames. Full crops retain the bottom boot row. Native body emission at C0:E6AB identifies the actor descriptor. An ownership sidecar tracks those cells through WRAM and actual OAM DMA, together with their displayed pose and renderer pivot. `$04/$06` plus native shadow-height metadata already include lift and shake, so lift is not subtracted twice. Neither the collision floor nor the top of the current OAM arrangement is a height measurement. Walk/run frames advance every six pixels travelled, with a three-frame stationary settle at walls. Teleports do not race through walk frames.

All 51 entries of the standard D1:37CC player animation table have explicit mappings in `goku-native-actions.js`. The displayed sequence pointer validates table identity before reading the latched animation and native graphic frame. Native requested animation `$E011` can precede `$E031` by several frames. Chest opening, boss reward gestures, resting, disappearing and recovery use the displayed native phases. A0/AE stay airborne through the native flailing sequence. A2's fall/bounce/rest/get-up and 8F's recovery follow native pose IDs in `$E026`, verified from all four entry directions. They do not become a standing sprite during a knockdown or a prone sprite during a long fall. Status sleep/death use the source's horizontal art. Native poison/petrify/ghost colors, miniature size and shared snowman/moogle bodies remain in the original rendering path.

While charging in local or world flight, upright hover legs hang beneath the cupped hands. This also applies when local flight holds Goku over unsafe ground. Charge, beam and ki use separately measured hand sockets. On foot, upward effects draw behind opaque body pixels so the beam does not erase Goku's hair. In world flight, shots draw in front of his body. Punch sheets already contain their white motion arcs; misses do not draw impact sparks. The existing ROM effect decoder supplies charge orbs, beams, impacts and gold aura cells. Aura is reserved for charging and transformation so it does not obscure the striking poses. All of these still pass through native OBJ depth, foreground composition, windows and color math.

World flight uses the verified four-way flight cells, rear view, discrete banking and a one-pixel bob. It retains the native Mode 7 map, movement and landing rules. Both forms can transform, steer, climb, descend and restore a flight checkpoint.

The opening paths after the waterfall and Potos's outdoor exits catch local
flight across the banks beside their narrow walking triggers. Crossing outward
uses the original door, fade and party arrival; flying inward or beside an exit
does not redirect Goku. This extends the accepted flight passage without editing
map tiles, changing story flags or closing the area's internal flight shortcuts.

## Real damage, launch and sound

Punch hitboxes use a forward range and lateral width, excluding party slots, inactive/dead actors and NPC species. Regular beams advance 32 pixels per frame; ki advances 14. Damage follows the visible front. A beam reapplies its damage every eight frames of contact, or every six frames for the full SSJ wave. Each pulse rechecks the visible width and live target. Ki disappears at its first hit; puzzle orbs still activate only once per beam. Beam damage scales with charge with a quarter-strength minimum.

A full Super Saiyan charge selects a 64-frame beam with an 80-pixel half-width, 640-pixel range and 48-pixel/frame front. Its width grows over six frames, tapers out from the hands over 44 pixels, and collapses over the final ten frames. Enemy and native destructible-tile coverage share that envelope. Goku holds the firing pose through the beam and recovers for four frames. The solid core uses Lucent Beam's original four colors, with native blue Thunderbolt cells and sparks along the edges; it still enters the PPU OBJ layer. Mode 7 uses a 72-frame perspective streak, including at maximum altitude, and doubles the aimed-target range to 1024 world units. Normal and partial charges retain their original timings.

Damage is queued at actor `+0x1F1`, with `+0x1EC=0` and `+0x1F0=0` attributing the hit to Goku. The original routine at C0:4053 applies the hit, native sound, number, reaction and death. Its queue/display clamps at 999; excess damage is applied first while leaving at least 1 HP for the native lethal hit. Once queued damage is lethal, beam pulses stop touching that actor. Per-target pulse timers survive checkpoints. Directly zeroing HP or omitting attribution bypassed necessary reward behavior. Native Rabites award XP and 2 GP once; Mantis Ant reaches the original death and rescue path.

Ordinary enemies follow a twelve-frame eased launch and height arc. When the native kill routine changes their species to death effect F9, that same effect keeps travelling. Bosses are not relocated. `native-combat-sound.js` marks Goku’s queued hits and bypasses only their native sound routine at C0:4157. DBZ contact cues replace it; damage, numbers, reactions, rewards and death events still execute normally. Goku’s own native hurt impacts also use the DBZ cue. Other actors retain their native sound paths.

`ki-sound.js` loads 21 short, level-matched effects. Punch/cross windups alternate two anime air swishes, and the finishing kick has a longer whoosh. These come from catalogued Dragon Ball TV-anime whooshes, replacing the old sped-up flight sample. Punch/cross impacts cycle through three separate samples; the finishing kick, palm shots, projectile collisions, full charge, transformation/reversion, teleport departure/arrival, takeoff and landing have their own cues. Misses only play a whoosh. Each ki sound starts when its palm actually emits a projectile; impact sounds wait for contact, including native destructible-tile completion and world-map targets. Voice caps, short overlap fades and a compressor limit rapid Super Saiyan barrages. The deterministic synth remains an emergency fallback if sample loading fails.

`kamehameha-voice.js` uses a Demucs-separated Japanese vocal stem with independent, reduced gains (.32 charge / .36 release). The roughly 3.7-second charge retains its vowels and the same pace in both forms. Releasing fades the chant into a separate shout. A circular-crossfaded DBZ energy bed continues indefinitely after the voice finishes, with a modest pitch/gain rise tied to charge strength; SSJ adds a separate electrical bed. Flight starts with a 0.22-second non-vocal energy swell crossfaded into an anime whoosh. Its quiet sustained air comes from an envelope-leveled TV-anime whoosh. Landing uses the same air, filtered at 2.4 kHz, with a soft low impact delayed 70 ms; the reversed Cell turbo sample is removed. The landing fallback also has a low touchdown and no metallic pitch sweep. All voices and loops clear on mute, pause, input cancellation and state restore. The original SPC music stays separate. Manifests record source checksums, edits and attribution in `assets/audio/`; see [credits](../CREDITS.md).

Asset preparation is offline and is not needed to run or build the game:

Both preparation scripts share `scripts/snes-audio.mjs`: mono 16 kHz, 5.6 kHz low-pass and 10-bit quantization in PCM WAV files. This is an intentional SNES-style sample treatment, not a BRR hardware encoder. It retains the earlier level matching, separate voice/energy controls and circular crossfades. All added effects and voice files use the same treatment; original music remains in the emulated SPC.

```sh
# Use local source recordings; original downloads are never distributed as packs.
python -m demucs --two-stems=vocals -n htdemucs -d cpu -o /tmp/separated /path/to/voice.wav
node scripts/prepare-kamehameha-audio.mjs /tmp/separated/htdemucs/voice/vocals.wav /path/to/original.mp3
node scripts/prepare-dbz-audio.mjs /path/to/local/effect-sources
```


Kamehameha remains blue in both forms. Its swept hitbox and punches queue native C-prefix replacements for plants, axe rocks, stalagmites and staged barriers in the active map layer. A single strike follows the complete replacement chain to its final tile. Replacement cycles are rejected so switch tiles are not treated as destructible objects. C0:C7C3 rebuilds original tilemap rows and DMA, so collision changes with the picture. If the same attack also operates a switch that rebuilds the room, already destroyed solid objects are reapplied quietly through that queue after the event finishes. Saved records require the same map, source tile, descriptor and final replacement; another layout cannot inherit an obsolete tile. Records survive checkpoints but clear on a map change, retaining native scenery respawn. `native-barriers.js` additionally dispatches original opening events for authored gates and native F-prefix hit switches, once per beam. Whip posts use their separate crossing handler. Punches can smash these gates at close range. Beams and punches briefly use the original BG quake; a native event write immediately takes ownership back.

Gate-opening floor plates are ranged targets too. Their live metatile index is resolved through `$4D` and the current map's native trigger table (C0:B642–B66F), including BG2 and special-event tiles. A bounded list allows local switch events in the Water, Earth, Ice, Fire, Shade and Grand Palaces, Witch Castle, Northtown Ruins, Gold Tower and Mana Fortress. Ice trap plates dispatch their gate-opening counterpart; attacks never remotely invoke trap drops, exits or boss-entry scenes. Native script conditions retain puzzle order and stop repeated hits from incrementing completed stages. The original event performs the layout rebuild after the impact. The controller regression checks all 41 floor-switch event families in 43 scenarios, verifying native progress, return of control and one barrier reaction. Enemy spawns are hidden only in its private fixture. Native hit switches and authored gates have separate controller tests.

King Kai and Luka react through the nonblocking native-font radio after a gate's flag or layout changes, an orb accepts a hit, solid scenery is actually removed, or flight reaches safe ground across an obstacle. Named gates have specific replies; other puzzles rotate short remarks. Grass does not count. A shared eight-second cooldown and saved per-barrier keys coalesce large blasts and prevent repeated complaints. Reactions pause during native dialogue, menus, charging and beam animations, preserving the single warning per held Super Saiyan charge. A catastrophe discards stale barrier jokes.

Pure Land's three talking gates are separate script barriers. Punches and charged
waves target their original two-tile entrance on maps 233–235. The native event
sets `$CF46` to at least 2, 4 or 6, skipping only the guardians before that gate;
it never lowers later progress. The attack leaves Goku in place. Walking through
still invokes the original save prompt and door, or the final Mana Tree arrival.
The Dwarf Village pit also drops its Magic Rope prerequisite for Goku, retaining
the original drop transition without granting the item.

The sealed Underground Palace wall in Dwarf Village accepts a fully charged
base-form Kamehameha. Event15B advances only its opening stage (`$CF14` to 6),
then rebuilds the original doorway and preserves its native transition. Punches
do not open it. Popoi, Gnome and the Earth seed are not awarded by the breach;
Goku can enter early and activate the native orb with his own attacks.

Pandora Ruins and Northtown Ruins script locks use checkpointed door latches. A hit unlocks the original door; walking through still invokes the native transition. Pandora’s plot flag is unchanged. An early Northtown breach stages the original Primm rescue and Vampire fight; returning afterward does not replay either or lower progress. Gaia’s hit switches select the native event for the targeted room instead of depending on the last floor marker walked over. The forest’s rotating carved heads (tileset 1, cells 171/172) can be flown over or destroyed to native grass; other cyclic descriptors keep their original behavior. Ruins balcony lips require clear floors at different native heights on opposite sides before flight may cross them.

Super Saiyan charge lightning regenerates deterministic jagged paths every three emulated frames, including while holding full power. Bolts connect to nearby native solid-tile edges, low obstacles and actors, using Thunderbolt colors and original 16×16 cells. These arcs are decorative; attacks activate puzzles. Snapshot replay reproduces the same paths.

Crystal Orb species `$55` is excluded from damage and Instant Transmission. `native-orbs.js` reads each live orb's event ID at `+0x3E` and its native elemental-test call. A hit supplies an accepted spell value to the orb's `+0x181` test byte, then calls native C1:E76D at the safe C0:B073 boundary with the original actor context. The original script handles puzzle flags, graphics, disappearance, sound and dialogue. The Fire Palace entrance requires the second fire-test value; Grand Palace events accept any nonzero result. There are no direct puzzle-flag writes.

`native-hit-recovery.js` adds 160 physical / 80 magic defense in base form and 320 / 160 in Super Saiyan, capped at 999 after native equipment totals. The C0:4AFE rebuild boundary refreshes the unboosted totals; form changes, equipment, leveling and checkpoint restores do not stack the bonus. Disabling power restores the native totals. This code never writes HP.

Goku starts wearing **Heavy Gi**, weighted training clothes in the native armor ring. They reduce strength/damage by 10% and agility by 20%; removing them restores those stats, including for Super Saiyan. The penalty follows the actual body armor slot and never stacks on menu rebuilds or checkpoint loads. The orange sprite remains his normal outfit, as with other native armor changes.

Goku's STATUS page shows his form, training gear, full combat attack and scouter power level. Base / Super Saiyan attack is **4,095 / 8,191** without the gi and **3,686 / 7,372** with it. Uncharged power readings are **90,000 / 150,000,000** without the gi and **81,000 / 135,000,000** with it; the scouter uses these same readings. This ki reading is not an additional damage multiplier. Defense shows the actual equipment total plus the form bonus. Native strength, agility, other attributes and percentages retain their real values instead of cosmetic multipliers.

Super Saiyan deflects two of every three eligible ordinary physical contacts, with at least 24 frames between deflections. The C0:514B damage resolver redirects to the original C0:4E6F dodge path, giving a short gold guard pose, spark and swish. Bosses, status attacks, spells, poison and the fed Beast do not qualify. Other hits still apply native damage and show a bracing reaction. The SSJ sheet's black-haired side recovery cells are replaced by its gold-haired crouch.

Ordinary recovery ends after 24 frames in base form or eight in Super Saiyan, by finishing the native damage-number fade and skipping remaining animation delays. Native cleanup frees the sprites and restores movement; sleep, transformations, death, scripted knockdowns and companions keep their normal paths.

The transformation's first gold frame triggers a separate 1.55-second non-vocal power burst: charging energy, beam onset, electrical crackle and a decaying bass impact. The existing transformation voice is unchanged. A seven-frame PPU flash and nine-frame ground quake align with the reveal. The flash respects native brightness and preserves dialogue; Mode 7 never receives the background quake. Restore/cancellation clears or replays these effects with the action clock.

Powered-up Dark Lich (species 121) receives 48,000 maximum HP, +48 attack and +24 intellect (byte stats capped at 255), and takes one quarter of Goku's wrapper damage. Initialization preserves damage already taken and runs once for that live boss instance. Its original AI, native damage consumer and defeat event still own the fight.

Native poison (`$E191 & $20`) immediately removes Super Saiyan, cancels a charge and requires releasing attack before charging again. Transformation remains unavailable until the native status clears; poison damage, timing and cures remain game-owned.

L+B / Shift+X (or touch focus + fist) selects a living hostile with a usable adjacent landing and leaves Goku there without dealing damage. `native-teleport.js` checks a full footprint 18–38 pixels beside the target, preferring 26 pixels on the approach side. The corridor to the enemy must also be clear: landing on the opposite side of a bank/wall, on a script pad or on a layer seam is rejected. Arrival rechecks the moving target and copies its full native layer/terrain byte, then gathers CPU-controlled companions to prevent the native party leash from blocking movement.

Instant Transmission starts in guard, dissolves through broad and thin vertical streaks, then becomes completely invisible at frame four. The original camera dispatcher at C0:D6AC receives at most 15 pixels per frame, allowing each crossed 16px map row/column to stream into VRAM with native parallax. The hidden phase and input lock last until the camera catches up. Materialization reverses the streaks, with the arrival cue on the first visible frame, then settles into guard. The cycle lasts twelve action frames plus any camera wait. This avoids stale/blank background tiles from directly jumping scroll registers. Checkpoints preserve pending scrolls, pose timing and a single buffered teleport tap. Holding the chord neither repeats the teleport nor punches or triggers the native dash. The first press picks the nearest reachable foe; subsequent presses visit every reachable actor in slot order before wrapping, skipping dead or blocked targets. Party members, NPCs, menus and scripts are excluded.

Local flight modifies the native movement vector at C0:D651. Boundaries are derived from each loaded map's live BG1/BG2 collision grids and descriptors, including story-driven changes. Native C0–CB destructible replacement chains, walkable tall grass, and verified short scenery in the original village/forest tilesets permit a collision bypass. Potos shrubs and flowers inspect the paired BG2 art cell because their solid BG1 placeholders are shared with trees. Terrain flags 1/2 represent heights; 3 is solid. Every intermediate pixel checks the full 12×8 foot rectangle, rejecting mixed wall/obstacle corners. Flight can cross native terrain-height bands and short forest rock banks when both opposite sides contain usable ground within five tiles (sixteen on Gaia's Navel, whose stacked cliffs separate usable levels). Bank art bordering forest voids remains closed. Haunted Forest low vines and flowers are also flyable. Room walls, unsupported cliffs, doors, layer switches and party/camera limits keep their original collision handling; map bounds have an eight-pixel clamp to avoid coordinate wrap. Unsafe fast steps reduce to one pixel before native collision; leaving a low object is permitted, and an unexpected out-of-bounds displacement returns to the last verified same-layer landing position. Releasing over an obstacle keeps Goku hovering at normal steering speed until the entire footprint is clear. Charging halves ground speed to 1 pixel/update and flight to 3/4 pixels in base/SSJ form. Local altitude is visual; `$E045` remains native physics. Travel is capped at 14 pixels per axis per video frame, including catch-up updates, so the native VRAM row streamer can keep up. Airborne actor contact can pass NPCs without pushing them or suppressing conversations; native dialogue immediately drops visual lift. Recovery from a bad old checkpoint also streams the camera to the safe position.

Gaia's Navel's sealed black rock caps are solid ceilings, even when usable
floor lies on both sides. The live cave grid identifies enclosed connected
regions of metatile5, including diagonal connections. Both the dungeon and
short-ledge flight paths reject these cells. Lava and open chasms retain their
two-shore checks; older checkpoints stranded inside a cap recover to safe ground.

`native-whip-routes.js` permits direct local flight along native whip-pad/post corridors. Each needs a real 6D8 pad (or BF in special-tile mode one), a matching 6F8 post four cells away, clear ground beyond both ends and no intervening event or layer-change seam. Two missing-post return lanes require a complete adjacent reverse crossing. Pit art outside those corridors remains closed. While flying, C0:B683 skips only resolved 6D8 floor events, preserving live steering without a scripted jump or input lock. Landing beyond the corridor gathers CPU companions, including crossings with a lower walkable floor in the middle. Releasing on a narrow shore keeps Goku hovering if the last native input step carries his feet over the edge.

Karon's pier map (32, BG2) also permits flight between its six matching deck
columns. Both live piers must exist. Decorative stars inside the crossing remain
airborne cells even where their native descriptors resemble floors. Releasing
flight there hovers; CPU followers travel with Goku to avoid the native party
distance limit. Both shore exits keep their original events and Moon Palace
progress is unchanged. The four low handrail cells on Sandship decks 98/99 allow
flight only with usable floor on both sides, and punches or beams replace them
with the original deck planks through the native destruction queue.

Entering the Sandship captain's cabin before the native rescue stage dispatches
a short Goku intrusion event, then the original Imperial ambush. It preserves
free companions and does not recruit Primm. If she is already captured, the
original rescue runs instead. Later visits keep the original event checks.

For walking onto a pad, `native-gap-flight.js` redirects only the native 6D8 whip-pad and 6FA post-hit gates for controlled Goku. A matching native 6F8 post must exist four tiles away. Event 6F9 supplies the original party gather, crossing, camera movement and balanced CF01 flags without fastening a whip. Goku uses a level hover pose during the crossing. Other actors and events retain their original scripts; checkpoint state includes the active crossing.

Tileset 23's platform edges, downward faces and empty air are separately classified from upright walls. A palace gap is flyable only with usable floor on both sides along one axis, each within sixteen tiles; event seams remain native. The Water Palace test crosses the actual missing platform in both directions and replays a checkpoint while hovering above it. When flight bypasses a walking height transition, settlement copies the new terrain height only after the full footprint fits the destination floor, preserving the collision layer.

## Vegeta's trial

Jehk opens a Hyperbolic Time Chamber where Vegeta was already training. He is
annoyed at the interruption, but pleased to have a real sparring partner.
Goku fights him alone while Primm and Popoi wait outside; no party ghosts appear.
The room has a 1,024 × 1,024 native collision map, a white palace-stone floor,
and a doorway pavilion with solid walls. Both native map planes load at that
size, clearing old foreground tiles. The outgoing room fades to black; the
entrance walk and camera settle under black before a one-second reveal.
Goku faces the camera and returns to base form during that black transition.
Native camera scrolling and menus remain authoritative. Vegeta has 32,000 HP in
base form, then transforms into a 60,000 HP Super Saiyan. Rushes, aimed volleys,
a telegraphed Galick Gun / Final Flash and teleport counters use integer-pixel movement.
Repeated melee provokes a counter; Kamehameha cancels his projectiles. Stray
attacks shake the room and throw warned fragments using native explosions.

Both Super Saiyan sprites share a four-color gold hair ramp, with clean tuft
textures confined to their original hair masks. Their faces, foot anchors and
body geometry stay fixed across forms. Vegeta's original eight-voice battle
theme, **Royal Rivalry**, switches to a faster arrangement when he powers up;
it pauses with the game and yields to native music when sparring ends.

Counter an oncoming Galick Gun or Final Flash with a Kamehameha to lock the
waves. They run from each fighter's hands to the collision, compress into a
bright core, and meet at an energy ball. Mash the attack button to push it
toward Vegeta; holding the button does
not work, and Vegeta periodically surges back. Winning removes a substantial
chunk of his health; losing hurts Goku but remains nonfatal sparring. The
exchange ends within eleven seconds of the struggle starting, then ordinary
combat resumes. Only opposed, overlapping beams clash; shots can still miss.

The ring pauses his attacks. Completing both phases ends in an agreed draw;
neither fighter dies. A finishing beam plays out before the exchange, both
power down, then the scene fades for their return. If Goku needs a break,
Vegeta stops the match before a lethal hit. Native trial events restore the
exact original party, heal it and continue Joch's reveal, or allow another try.
`?start=trial` starts at the introduction with full Senzu Beans. The private-ROM
`vegeta-trial.spec.mjs` checks all four original party lineups on both exits.

Northtown Ruins' placed spikes are low obstacles; flight can hover over them,
including where a row meets a wall. The recessed pit and its rims require real
floor on both shores. Tall walls and unused space remain closed, including
after puzzle switches change the layout. Flight leaves the spikes and switches
intact. Full Super Saiyan beams can breach internal walls; the existing
sealed-door skip still runs the rescue and Vampire sequence.

## Verification

`npm test` covers timing, direction, hit exclusions, combo buffering, charge caps, travelling damage, input ownership, transforms, frame pivots, NMI synchronization, script recovery and snapshot replay. Browser checks use the local cartridge to kill real Rabites with all three attack types, finish Mantis, operate keyboard/on-screen controls, switch characters, fly/land in both forms, and replay charge/flight checkpoints. Original title, BOY bridge, sword arrival and Potos progression remain separate regression checks.

`tests/browser/ki-world.spec.mjs` additionally checks both forms' half-speed charging, poison cancellation/retransformation, a full-party native whip crossing, beam destruction of rocks on BG1 and BG2, moving lightning at full charge, Japanese voice stage/release timing, sustained-loop RMS after the voice ends, and mute, walls in village/cave/palace maps, and original puzzle progress at all 14 elemental-orb locations. Native entrance effects are allowed to return control before attacks begin.

`tests/browser/teleport.spec.mjs` covers a riverbank landing from the wrong terrain height, camera streaming to an offscreen enemy, walking and opening the ring afterward, flying across the early river, and escaping an old bank-stranded checkpoint. Unit checks cover every prepared audio cue, loop continuity/headroom and animation-frame cue timing.

`audit:boss-barriers` verifies 38 native boss scenarios in 36 arenas with solo
controller attacks, expected defeat flags and return of control. Three
Jabberwocky routes have separate native defeat events. Dark Lich and Mana Beast
use the existing full-story shortcut tests. `trial-routes.spec.mjs` checks the
complete early Undine trip, Joch's trial exit, Tasnica's imposter and the castle
jail escape. Metal Mantis retains its pre-fight stage on entry; the general
castle prerequisite no longer silently marks it defeated. These checks wait
for original rewards and death animations, preserving the native exit logic.

The local inspection tools are reproducible:

```sh
npm run audit:combat  # 41 controller-driven sequences, 2,684 selected frames
npm run audit:poses   # 28 native event-driven gesture/chest/boss/fall/recovery sequences
npm run audit:effects # all four directions and both forms, plus ring cancellation
npm run audit:status  # native status and miniature comparisons
npm run audit:boss-barriers # native boss defeats, rewards and progression
node tools/qa/flight-boundary-audit.mjs --out .local/flight-boundaries
```

The boundary audit loads every documented gameplay map through the original engine and records both collision layers as private per-map boundary masks. `.` marks clear landing tiles, `o` low obstacles, and `#` tiles retaining native collision. It checks tile centers and outer edges; redirects and non-ground scenes are reported separately. The runtime checks full footprints at every movement pixel, using current map data rather than these diagnostic masks. Story variants therefore update the boundary automatically. This is a structural map audit, not a full traversal of every route.

Initial combat validation (2026-10-13, before the story/shortcut changes): all 370 documented gameplay map entries passed the native boundary audit, with no invalid accepted tile centers or outer-edge positions. All 84 unit tests and 25 browser regressions passed, including all 14 orb puzzles. Reports remain in `.local/flight-boundaries/flight-boundaries.json` and `.local/kamehameha-voice/`.

They use the local controller-produced party fixture `.local/graphics-audit/party.json`. Captures, animation galleries, reports and native research remain under `.local/animation-audit/` and `.local/graphics-audit/`. Diagnostic filmstrips may hide companions to inspect Goku; separate native presentation checks retain their occlusion. The pose audit temporarily installs a bounded scratch event in its browser's cartridge copy and restores it afterward. No source ROM is modified.

This verifies the implemented combat loops and listed native poses, not every cutscene in a full story playthrough. Timings are authored adaptations of the supplied artwork, not decompiled Buu's Fury timing. The original sprite ring remains native; ki and transformation use the SNES Y / L+A controls and their keyboard/touch equivalents. The developer power toggle stops continuous stat boosts rather than reconstructing historical pre-mod character statistics.


## Items and noncombat interaction

`native-senzu.js` overlays the shared item name at ROM PC `0xAA120` and replaces the decompressed cup's four-cell sprite by a VRAM fingerprint. Shops, rings and item-name references in event text share that lookup. Authored dialogue also normalizes singular/plural Cup of Wishes mentions. Native item 05 already revives to maximum HP at C0:5593; the D0:DB2A item-only target gate now also accepts living, injured allies. Full-health targets remain invalid, spells keep their own targeting, and native consumption and healing animations remain intact.

`native-interaction.js` leaves C0:B851 NPC/chest interaction alone and stops Goku's normal/charged native weapon fallback at C0:B2A7 / C0:B224. BOY's opening, companion attacks and menu confirmation retain native behavior. Empty-handed punches cut nearby breakable objects through `native-plants.js`.


Sleep/unconsciousness (`$E190 & $10`) cancels Super Saiyan and any held charge just like poison (`$E191 & $20`). Focus (Shift / SNES L), including the transform chord, breaks sleep, petrification (`$E190 & $40`), Frosty (`$E190 & $20`), Balloon (`$E191 & $01`) and burning/Engulf (`$E191 & $40`). Solo Goku can recover even after petrification removes his controller assignment. The native palette, controller and get-up cleanup finish normally; a brief ki burst signals recovery, with a pop for Balloon, shattering ice for Frosty, or an explosion and outward-flying embers for burning. These reuse native impact and Exploder/Fireball cells. Recovery grants 120 frames of resistance to all five conditions so repeated effects cannot trap him. Recovery does not heal, clear poison, revive a defeated character, or interrupt a script/menu. The resistance and pending recovery survive checkpoints. A held transform must be released before changing form again after recovery.

Full-power Super Saiyan beams use the `super-beam` destruction policy: complete six-cell palace braziers break through the original map redraw queue, exposing existing BG2 floor art. Normal attacks and partial beams preserve them.
