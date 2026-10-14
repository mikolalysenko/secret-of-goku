# Original-engine Goku mod

The main `/` route runs the original Secret of Mana in the SnesJs core (with the HDMA guard described below) at `b904fdb63be15dc0470b69091622ba5b1bde7275`. The ROM supplies menus, opening, maps, tiles, layer priorities, collision, sprites, dialogue, events and SPC audio. The title substitutes gold GOKU letters and extends the native credit. BOY remains native until the new sword-scene arrival hands the role to Goku. See [arrival notes](arrival.md). `engine.html` is an explicit developer shortcut into Potos using the same engine.

## ROM changes

The wrapper normalizes a copier header, verifies the exact US SHA-256, then makes a memory copy. No operation modifies the supplied ROM on disk.

The main game's additive starting-Drum patch redirects the inventory initializer's four-byte epilogue at ROM `0x57AF` to `$C74285`. The verified unused region at `0x74285` receives `48 A9 27 8F 48 CC 7E 68 28 AB 2B 6B`: preserve A, store item `0x27` into `$7ECC48`, restore A and execute the original epilogue. That patch changes no title, menu, opening, door or map bytes. Separate title/arrival adapters operate on PPU fetches and event reads without further cartridge mutation.

`engine/dialogue-patches.js` changes four bounded player-text spans, padding with the native blank glyph `0x80`. It validates event pointers, original bytes, speaker tokens and following control codes before copying. All NPC text, native line breaks, commands and event lengths remain unchanged:

| Event | ROM offset | Original player line | Goku line |
| --- | --- | --- | --- |
| `0x103` sword pull | `0x92691` | `:Urrrrrrrgh!` | `:Easy... Oh!` |
| `0x10C` Elliott | `0x9306A` | `:Hey! Stop it!` | `:I'm sorry!` |
| `0x112` aftermath | `0x9339F` | `:Huh? What?` | `:Too hard?` |
| `0x112` sword concern | `0x93450` | `:Here! It's yours!` | `:Did I break it?` |

The speaker's name still uses the game's own substitution. The original name editor is prefilled once with editable **BOY**, using its tile field at `$90D2/$9112`, length `$A1CC`, cursor `$A157` and redraw flag `$A20A`. A signature checks the native editor state and letter grid before touching the field; it never overwrites a user's later edits. Start commits the name through the original code. At Goku's impact, the arrival controller changes the native six-byte name at `$CC00` to GOKU. Its read adapter restores the original sword grunt; the older replacement stays only in the cartridge copy for hash compatibility.

The separate `potosPatch` developer shortcut replaces events `0x400/0x106`, loads door 3 above the gatekeeper, and moves the Potos world landing coordinate north. Only `/engine.html` uses it. The main game never applies those intro-skip patches.

## Native rendering

`engine/sprite-layer.js` adapts the MIT SnesJs OBJ evaluator. It substitutes Goku at the original boy's sprite order and priority, before `getColor`, background priority, windows, color math and brightness. Native foreground tiles, NPC overlap, dialogue windows, ring menus and fades therefore remain in the original rendering path. `ManaMod.draw()` no longer paints anything over the completed framebuffer.

`native-oam.js` identifies the boy from the actor descriptor used by native C0:E6AB, then follows ownership through WRAM and actual PPU OAM DMA. It captures the displayed pose and pivot, including native lift and shake. Replacement continues through door/boss fades and stops when the native actor disappears. The standard boy body was observed in bank-1 tiles `C0–C7` across all 51 actions and four facings; tile numbers alone no longer decide ownership. Ordinary ground scenes use palette 1; the waterfall uses palette 5, which enables native color math. The replacement retains that palette marker for water blending. The source sheet rows are down, **left, right**, up. Every frame is 32 × 32, including opaque boot pixels in the last row. The absent second rear idle frame falls back to the first. Native `$E010` facing drives both player movement and scripted turns.

The first name editor's bank-0 tiles `30–37` stay native during BOY's prologue. After Goku arrives, Status and Action Grid use that same eight-cell layout: a complete arrangement and a match to the original boy palette are required so Primm and Popoi stay unchanged. HUD portrait tile `E8` and ring character marker `0A`, bank 1/palette 1 or 5, use Goku head crops while keeping their native frame, cursor and item icons. Original shadow tiles remain. Flammie's world sprites use palette 5; the native HDMA terrain-shadow window is replaced with a small pixel shadow.

Native poison, flash and ghost palette changes are transferred to Goku's colors; petrify uses the actual native stone shades. Snowman and moogle keep their shared original bodies and portraits. Barrel, Balloon and Engulf (`$E191 & $45`) reuse weapon OBJ cells; those original overlays remain visible over Goku instead of being mistaken for sword art. Miniature mode (`$E191 & $02`, species `$F6`) uses a 16×16 Goku with adjusted hand/effect origins; unconscious uses a horizontal pose. Signed screen coordinates and wrapped OAM rows preserve partially offscreen sprites. Hidden replacement cells still count toward original sprite/sliver overflow limits.

Charge, beam, impact and aura pixels are decoded from 34 original spell cells. Their palette-0, priority-3 OBJ marker remains independent of the body's water palette, and they pass through native layer composition without browser glow, smoothing or HTML overlays. See [native effects](native-effects.md) for the recovered encoding and independent VRAM/CGRAM checks.

The core under `vendor/snes/` is unchanged. Its [MIT license](../vendor/snes/LICENSE.txt) also applies to the evaluator adaptation.

## Native state and controls

Goku combat is active only after his arrival, when `$E4=$E5=1`, the actor active bit is set, player 1 owns Goku (`$E02C & 1`), `$D0=0`, `$2C=0`, `$EC & $FE=0`, no ring-opening request is pending in `$ED`, and neither `$E190 & $70` nor `$E191 & $D5` indicates an incapacitating or covering status. `$EC` bit 0 is NMI synchronization, so both 0 and 1 are valid during ordinary play. Native Y/X menu requests cancel queued attack state. Original button handling passes through unchanged during BOY's prologue, title screens, name entry, dialogue, scripted events and rings. Native inputs also handle escaping a barrel and struggling against status effects.

World flight is identified by the installed native interrupt vectors at `$0100..0107`: `5C CF 88 00 5C 4B 8A 00`. `$E4/$E5` are brightness fade timers, not gameplay mode bytes. `$EC&0x80` marks interactive world flight after loading; vector detection also covers its fades.

| WRAM | Meaning |
| --- | --- |
| `$00DC` word | Current map: waterfall 128, Potos 131, Mantis cave 260 |
| `$00E4/$00E5` | Native brightness fade timers; both 1 during settled ground play |
| `$00D0` | Event state; zero for ordinary controllable play |
| `$002C` | Input/event lock; dialogue/rings commonly 3 |
| `$00EC` | Native menu mode; 0/1 ground, 8 ring, `0x80/81` flight; bit 0 is NMI sync |
| `$00ED & 0x40` | Pending ring opening |
| `$E000 & 1` | Boy actor active |
| `$E002/$E004` words | Boy world position |
| `$E020/$E022` signed words | Boy screen position; subtraction gives camera origin |
| `$E02C & 1` | Player 1 owns this party member |
| `$E011/$E031` | Requested / latched native animation |
| `$E026` word | Current native pose within that animation |
| `$E045` | Native airborne height; already included in the captured OAM renderer pivot |
| `$E010` | Facing: 0 up, 1 down, 2 right, `0x82` left |
| `$E182/$E184` words | Current / maximum HP |
| `$E188` | Strength |
| `$E198` word | Calculated attack |
| `$E1ED` | Attack recovery |
| `$CC00` | Native player name |
| `$CC48` | Starting inventory slot; Drum `0x27` |
| `$1809/$180A` | Ring category / selection |

Addresses are within bank `7E`; helpers mask them into the 128 KiB RAM array. Entities have stride `0x200` starting at `$E000`: party 0–2, enemies 3 onward. Species is `+0x180`, HP `+0x182`, maximum HP `+0x184`, and dead status bit `0x80` is at `+0x191`. Damage excludes inactive records, party slots, NPC species ≥128 and dead enemies.

Ground B starts a punch immediately; holding it chains the combo; a whiff also emits a native B pulse for talking/cutting map obstacles. A connected punch suppresses the hidden sword's extra hit. Holding L+Y begins Kamehameha; charge caps at 90 frames or 45 in Super Saiyan, and only release fires. Punches have 14/7-frame actions, 2/1-frame impact delays and buffered three-hit combos. C fires travelling ki blasts every 12/5 frames. Base attack is 4095, Super Saiyan 8191; a finishing kick multiplies it by 1.5. Ordinary enemies and their native death effects follow 56/88-pixel launch arcs. Boss bodies remain in their original position so their native defeat events can finish. See [combat implementation and checks](combat.md).

Arrows are the only movement keys. X supplies B (punch / confirm), C supplies Y (ki), Z supplies A (fast flight with a direction), A/Backspace supplies X (ring / back), Shift supplies L and D supplies R. Space/Enter is Start; S is Select. Up/down changes ring tiers. Goku uses L focus, L+Y Kamehameha, L+B Instant Transmission, L+A transformation and L+R takeoff. Touch provides the same SNES buttons and four single-button chord shortcuts. No analog controls, triggers or extra face buttons are required.

`scene-fast-forward.js` recognizes both native text rendering ($D0=81) and button waits ($D0=83). Holding R targets 12× speed and pulses B for prose, with each batch bounded to keep the browser responsive. Intermediate pictures are skipped while CPU, audio processor, DMA and events continue running. It scans complete text windows for native selection commands before confirming, stops at choices, and mutes audio during acceleration. Events still execute every original frame; their map and story writes are preserved. Actual acceleration depends on the device; the local final check measured about 5.8×.

Takeoff calls the verified native C1:E76D world dispatcher at C0:B073. The C1:E837 handoff skips Flammie summon choreography for direct takeoff, the Fly ring item and scripted departures, preserving coordinates, return map, fade and landing logic. World controls remain Flammie's steering, A ascent and B descent to land; L+Y charges the aerial wave. The Fly ring icon follows its inventory index and native OAM allocation.

## Console and checkpoints

```js
mana.pause();
mana.mod.status;
mana.read16(0x7e00dc);
mana.mod.entities();
mana.snes.ram;
mana.snes.ppu.vram;
mana.snes.ppu.cgram;
mana.snes.ppu.oam;
mana.mod.spriteLayer.plan;

mana.run(60, [7]);          // native right
mana.run(120, [10, 1]);     // hold L+Y to charge
mana.run(1);                // release
const checkpoint = mana.snapshot();
mana.run(60, [6]);
mana.restore(checkpoint);
mana.play();
```

Native button indices: B=0, Y=1, Select=2, Start=3, Up=4, Down=5, Left=6, Right=7, A=8, X=9, L=10, R=11. Wrapper-only indices are confirm=16, ki=17 and transformation=18. `mana.bootOriginal(bytes)` starts the real title sequence; `mana.bootPotos(bytes)` is the developer shortcut. `mana.fly()` runs native menu inputs.

The serializer preserves CPU/PPU/RAM/audio state and live closures, omits ROM bytes, and rejects a different patched-cartridge hash. Goku metadata includes action clocks, charge, facing, combo buffering, projectiles, launches, sound queue, native sprite ownership, destructible redraw queue, flight/hover state, whip crossing, queued orb event and locomotion state. Charge lightning is deterministic from frame and live map state. Debug snapshot replay is exact; the user-facing Restore button clears physical held input to prevent an unintended release attack. Browser checkpoints from the earlier ROM patch version are intentionally not offered for restore into a different patch.

## Verification and limits

The two named quick starts in `quick-start.js` are generated from the selected ROM and cached in separate IndexedDB slots. `?start=title` stops at the original editable BOY name menu. `?start=sword` runs the bridge/fall, skips the river walk using the verified sword approach coordinates and the native camera-streaming adapter, then executes the sword interaction, pod arrival and original event tail. It captures only after control returns. No ROM or checkpoint file is distributed. A failed build restores the previous complete state; manual saves are not overwritten. Bump `quickStartRevision` when changing virtual event layouts so old cached PCs cannot resume into new scripts.

`beast-challenge.js` makes **Feed seeds** mandatory once all seven seeds are personally collected. Events95/96 converge at97 and call9A for the earned-ward count. With seven wards, event9A immediately runs96; even an older checkpoint taking95 redirects to96. Fewer seeds permit the ordinary fight but cannot earn the good ending. The existing boss camera, Mode7 door and setup commands remain intact. Feeding starts species127 at 65,535 HP and scales Goku's hits to one quarter only in that battle. Automatic healing is disabled throughout the game; the one-time maximum-HP expansion preserves missing HP and never revives a dead character. C0:4053 intercepts queued player damage before its load: an earned ward absorbs one hit, otherwise native processing receives 250–500 damage. Ninety controllable frames of grace prevent one spell sequence consuming multiple wards. The native HP subtraction, defeat and ending routines remain authoritative.

Circle eruptions target Goku's position when their warning begins. There are 90 frames to move clear (72 below half Beast HP); the damage radius is 26 pixels (34 enraged), with a six-pixel player footprint. Only active, controllable battle frames advance them. The warning and blast use original Mana spell cells, and a hit queues 450 native damage. Menus/cutscenes pause them; boss death removes them. Genuine palace collections grant one ward each. There is no delivery path; legacy delivery metadata cannot satisfy the collection requirement. Challenge choice, wards, grace, target and warning age all survive checkpoints.

`power-intro.js` adds one-shot first-hover banter and a longer first transformation using existing sprite poses and native spell art. These are presentation reveals, not ability locks. Their radio messages pause during Kamehameha so they cannot add another King Kai remark during a charge.

Flight classifies native movement codes `2x` (stairs) and `3x` (currents/conveyors) as floors. In flight only, C0:D359 bypasses their walking guidance before the existing swept collision/speed hook. Wall height, shaped-tile and event checks remain intact; ground charging retains the native floor behavior. Name prefill uses cursor `$A157=18`, so deleting three letters actually clears all of BOY; Backspace maps to native cancel and the prefill latch survives checkpoints.

`world-scars.js` stamps the ROM-decoded Potos crater into the native Mode 7 surface sample before brightness/color math. Town positions come from C6:7A80. The world attack ledger preserves craters through travel, restores and the final wish; no ROM or VRAM tile data is rewritten. Town dialogue acknowledges collateral damage, while ground town maps and their progression scripts remain available. Mode 7 boss arenas skip the ordinary tile-row camera streaming after teleportation and mod-added BG quake pulses, preserving their matrix/HDMA renderer.

Tests compare title pixels outside the changed word/credit with the native path; exercise editable BOY naming, bridge parity and the complete opening to controllable waterfall; play the new sword arrival through all five pages, mid-impact checkpoint replay and return to control; verify sprite crops, water color math, priorities and combat gates; and traverse Potos, flight, landing and original Elder/Mantis events. ROM tests prove the cartridge copy only changes the inventory trampoline and four selected player-text spans. The arrival read overlay restores the original sword grunt while retaining that copy's hash.

The original Mantis death/rescue path was also played to completion with native controller inputs and the patched dialogue. The earlier ROM research compares extracted Potos/cave tilemaps and graphics directly to WRAM/VRAM.

The [regional graphics audit](graphics-audit.md) adds native entry-view coverage across the map table, full-party UI comparisons and native-event initialization of the Mana Beast arena. It does not substitute for a complete story playthrough or every scripted pose and animation.

This remains a browser hybrid. Goku's replacement artwork is injected into the emulated OBJ layer, not stored as a complete native SNES sprite-bank patch. Status menus may recalculate native stats; Saiyan combat values are reapplied during play. The earlier custom JavaScript chapter is a separate local prototype, not the main game.

## Story and aerial shortcuts

`native-story.js` relocates selected native event streams into virtual cartridge banks F0–F7 on reads. Original ROM bytes remain unchanged. The native interpreter still draws dialogue, operates choices, grants rewards, loads maps and runs credits. `event-codec.js` treats credits' 7D/7E ASCII spans as opaque. Party variants omit absent speakers and skip movement commands for absent companions; native spell grants are remembered across later recruitment. `story-areas.js` supplies local prerequisite floors only on entering the relevant maps.

Luka's native event134 now offers Advice / Save / Shortcut. Save opens the original native save screen; Shortcut offers Stay / Go before starting either remaining final fight. Events85–97 and9A occupy verified unique unused END slots. The original one-time spear gift precedes the menu. Stay and cancel close the native selection window. The solo shortcut calls the real Dark Lich room and event429's native Mana Beast setup. Luka's Advice starts with the current Dragon Ball count. The ending uses a restoration wish, with the Tree sheltering souls until the Beast is calm.

Thanatos event4E1 uses native dialogue, music, fades and object refresh, then door2F and event70C for Dark Lich. It does not position or strike an absent Primm or wait for the original party choreography. Frieza supplies ki for his amusement. Dyluck introduces himself and forces Thanatos out; his soul waits with the Tree. The Luka shortcut enters the same scene. Native boss defeat still owns CF4E advancement.

Transient battle windows share `$2C=3` with full-screen menus. Input routing now identifies the field by its native interrupt vectors instead of treating that byte as a menu lock. Goku's Y never falls through to the native ring command during a spell or level banner. X/back sends native Y for ordinary menus and Start for the window/controller editors, retaining that route until release. Short action taps last four emulated frames so the slower menu poll sees them; directions remain two frames.

`battery.js` tracks real cartridge SRAM writes and flushes settled batches to local browser storage under the original ROM hash. Quick starts preserve that SRAM. The original GAME FILE validity checks still decide which slots can load. The renderer recognizes the four native file windows and validated GOKU records, including backup copies, before replacing their portraits. HUD portraits have separate native OAM writer ownership, independent of whether a world sprite exists during a door fade.

`native-equipment.js` removes Goku's weapon tier through the original empty-tier path and rejects sword-dust equips before native inventory writes. The sword's nine names become DUST BAG and the corresponding native weapon icons become a small pouch. Other characters retain weapon swaps and forging. Shop icon identity is separate from HUD portrait identity.

`native-barriers.js` checks punches and charged travelling beams against the Haunted Forest rose/bridge gates (maps29/30), Witch Castle map300, Northtown Castle map82 and Gold Tower map116. It also recognizes the original F-prefix hit-event descriptors for cave and palace switches; a whitelist excludes whip posts, and each beam activates a switch once. Native events set their own gate progress and refresh objects/map pieces. Unrelated walls remain solid.

`world-ki.js` uses FA/FC world coordinates, F6 heading, wrap at4096, and the real moving Fortress object at0128/012A. Hold/release L+Y (Shift+C) uses the same charge and Japanese chant as ground combat; B (X) provides native descent. The AF cloud patch surrounding the Pure Land uses E3 bit40 for its landing lock. Breaking it changes that bit without changing CF46's boss progress. The Fortress is rendered early through its own C2:B119 path. A fully charged hit explodes it, then executes its original C2:B1CA landing ABI via C0:8260 and native landing record10 before starting the Mana Beast scene. The post-destruction conversation differs from the ordinary finale.

Landing originally draws a large Flammie fly-by on BG3, not OAM. `native-flight.js` clears only landing request E8 bit0 at C0:BC0B after destination selection and before ground setup. Fortress landing record10 stages the party 1,024 pixels east for that fly-by. The adapter subtracts its 64-tile X offset before ground initialization, matching the skipped C1:FD37 relocation. The miniature approach dragon has its own C2:B230 submission; that is replaced by a shrinking Goku and curved trail, with a shorter native docking timer. Ordinary native map/party placement and fading remain; the Goku descent clock waits for a visible actor frame. Cannon request bit1 remains untouched.

`tests/browser/story-shortcuts.spec.mjs` checks closed/open/return visits for the three gates, blocked/charged/open Pure Land landing with untouched boss progress, absence of the BG3 fly-by, aerial Fortress-to-Beast solo progression, and Luka's solo route through both real final battles to the ending. The authored changes are regression-tested routes, not evidence that every possible permutation of the original story has been played.

2026-10-13 story/flight validation: 89 unit tests passed. The complete 30-test browser suite passed; the added Luka-menu check passed separately, and all six story/shortcut browser checks passed again after the final dialogue changes (31 distinct browser checks total). Build succeeded; no ROM or private save files were included. The supplied ROM's SHA-256 remains `4c15013131351e694e05f22e38bb1b3e4031dedac77ec75abecebe8520d82d5f`. Private logs and screenshots are in `.local/story-research/`.

## Telepathy, Dragon Balls and ceiling escapes

`native-radio.js` decodes the retail 8×12 font at PC `0x12D600 + glyph*12` and window tiles at `0x12D080`. A PPU color surface draws three-line messages before native brightness/window processing; no DOM text, controller injection or event lock is used. An SSJ charge can prompt one warning after spending 90 active frames at full power. A per-charge latch prevents repeats regardless of hold duration; release rearms the latch without generating a reply. A global cooldown also limits successive charges. Native dialogue, menus and fades hide and pause the radio. Aerial messages use the bottom of the screen, keeping the Fortress and giant beam visible. Mode 7 reuses `$2C` as scratch memory, so only the ground UI uses it as a menu guard. Warning rotation, timers, the latch and first-flight banter survive checkpoints.

`dragon-quest.js` records the seven unique palace reward commands, after their original flag writes execute. The native Light/Dark flag order is `$CF94/$CF95`. Seed theft, broken seals, the Tree's mass blessing and Dryad cannot duplicate or erase a Ball. Events93/94 warn about an incomplete quest or acknowledge seven personally collected Balls. `ending-rules.js` requires the earned and held masks, defeated Frieza, an actual upgraded Beast victory, and an intact Fortress before allowing a wish. The quest ledger and wish state are included in browser checkpoints; old delivery metadata is read only for compatibility and never awards Balls. Older checkpoints infer available progress from sealed palace flags; the native seed-case puzzles and rewards stay intact.

`ceiling-exits.js` lists 253 eligible rooms in 35 routes with verified original exterior doors. Peaceful Water Palace rooms, houses, shops and inns are included regardless of the map's weapon permission. `ceiling-escape.js` animates an upward punch, native impact cells, falling roof chunks and dust. It does not draw a persistent breach; legacy checkpoint hole records are ignored. Debris uses neutral stone or timber shades from the room's own background palette. The native dispatcher loads the exterior door, then requests world flight; the already airborne sprite stays offscreen through this handoff instead of briefly appearing on the outdoor floor. Party coordinates, collision, camera and VRAM are initialized by the game. The adapter waits for entry choreography and retries interrupted takeoff. Confirm remains available if an exterior has dialogue; live bosses and unsupported scenes retain normal control. Escapes never set boss-completion flags. Ground collision is unchanged. Existing overworld landing restrictions still apply, so steer to a valid landing area.

Private evidence is in `.local/plot-chaos/` and `.local/danger-progress/`. Browser checks cover held ground/aerial attacks during telepathy, menu priority, reward uniqueness, incomplete-Ball warnings, three dungeon escapes, seven additional palace/house/inn/shop escapes, checkpoint replay, party landing and the two finale paths. Catalog checks validate all listed doors against the supplied cartridge. These checks do not constitute a playthrough of all 253 escape rooms.

Earlier plot/escape validation: 113 unit tests passed; all 50 distinct browser checks passed across the full run and targeted reruns after fixing radio checkpoint ownership. This included the normal Water reward, seven-palace reward markers, both finale routes, keyboard/touch/gamepad control, charge/beam replay, the original opening/Potos story, doors and landing. Local ROM bytes remain unchanged and the public build contains no ROM or private checkpoints.

October 13 follow-up: 124 unit tests passed. Targeted real-ROM browser checks passed for the fed Beast's damage, wards, death and victory; Mode 7 teleport/quake protection; first power reveals; quick-start creation and reload; Backspace/blank-name restore; water/stair speed in both forms; collision walls; permanent town craters and repeated mid-shot restores; indoor roof exits; both finale paths; and early Tree landing. Public-build checks passed for a local ROM selection without upload and icon-only phone layouts. The world-flight shadow now survives checkpoints too, preserving exact rendered replay. This was targeted regression testing, not another complete regional playthrough.

## October 13 controls and traversal update

The shared SNES keyboard layout is arrows plus Z/X/C/A, Shift/D, Space and S; see the README control table. Touch cancellation includes lost pointer capture, page hiding, rotation and fullscreen changes. The visible pause overlay consumes its resume gesture. Same-origin ROM loading tries `./rom/secret-of-mana-us.sfc` with validation and a bounded timeout before the file chooser. Builds version the complete module graph and display a content-derived build ID.

`dragon-radar.js` uses the native world takeoff table for the next uncollected palace, including the Moon ferry exterior (map95). It yields its native-font panel to dialogue, charges and the Fortress docking approach. Aerial ki impacts have delayed cosmetic horizon bursts; damage to landmarks still requires a charged wave. Destroying the Tree barrier replaces obsolete first-flight chatter with King Kai and Luka's reaction.

The HDMA initialization now terminates disabled and zero-length channels before the frame runs. Previously, a channel enabled late in NMI could execute a stale zero repeat count, wrap it to 255 and write unrelated RAM into CGRAM. This fixes the reproduced orange end-screen palette. It is a targeted core correction, not a claim of cycle-exact SNES timing.

Validation: 145 unit tests passed. Real-ROM browser checks covered persistent Haunted Forest gates, cave/palace hit switches, the guarded button-combination shortcut, destructible vines, Gaia's Navel ledges, bee-hit recovery, Fortress approach/deck/interior traversal, radar progression, aerial impact ordering, ending colors, and checkpoint replay. The broader combat, controller, teleport and story-shortcut regressions and all three public-build ROM-loading checks also passed. The reported intermittent high-altitude sky flicker was not reproduced; these checks do not constitute a full playthrough of every area.


## October 14 story and finale review

`story-compiler.js` compiles four party variants from the native event stream.
`scene-dialogue.js` supplies explicit alternatives when a missing companion
changes the scene's meaning; ordinary NPC lore stays native. Speaker state
persists across text pauses, and empty filtered dialogue windows disappear
without removing reward or progression commands. Identical compiled variants
share virtual storage. `native-story.js` still dispatches events through the
original interpreter, skips movement waits for absent actors, and retains
spell rewards until actual recruitment.

The Sandship only marks companions who were aboard as captive. Northtown's
Dyluck encounter no longer removes Primm or recruits her during a solo run;
its Vampire encounter and native exit/reward flags remain. An older checkpoint
with Primm already captive retains the rescue path. In the new scene, stage 6
removes the NPCs before stage 7 enables Vampire: the native object loader can
run between script commands, and a leftover NPC can crash its boss updater.
Missing party stand-ins
are hidden in the Mana Tree's opening shot as well as in its dialogue.

`shenron-ending.js` composites the summoning into the PPU before brightness
and color math. Events A3–A6 cue the dragon, wish, Potos return and end card;
42F owns the native dialogue, travel and finale flags. The wish restores the
world, then the native boy actor appears as the revived Randi beside an extra
Goku sprite. The old montage that forcibly adds companions is no longer used.
The full ending state and animation timers survive browser checkpoints.

See [story review](story-review.md) for coverage, scene changes and reproducible
checks. Original dialogue dumps and test screenshots remain private under
`.local/`; the build includes authored dialogue and extraction logic only.


World flight's horizon IRQ selects Mode 7 and ground horizontal scroll. A delayed native NMI can skip the next sky setup at `C0:88FB/8918`, leaving terrain graphics across the sky. At `C0:8903`, `native-flight.js` restores Mode 1 and the cached sky scroll only if the world-flight interrupt vectors are active, overhead view is off, and Mode 7 is still selected. Native HDMA tables, the horizon IRQ and flight physics are unchanged. Ground Mode 7 arenas and the overhead map retain their rendering.

Water Palace actor refresh can retain the stair Jema after event `4E9` advances `$CF11` and spawns his next position. At the idle field boundary, `native-story.js` keeps the stage-appropriate Jema and removes stale duplicates, including those in older checkpoints. It never changes scene flags or removes an actor during active choreography. Fire Palace maps 327 and 240 supply only the prerequisites of their local pressure plates when flight bypasses earlier rooms; their native orb and boss events still have to run.


### Frieza route and native saves

`engine/frieza-events.js` occupies verified one-byte END event slots A7, A8, AC, AD, AF, BF, C1–C3, C5–CC, D6–D9, DD, F6, 129 and 12A. Frieza is mainline: event 4A4 starts his entrance regardless of Ball count, and early Fortress/Luka routes do the same if he has not appeared. Legacy offer IDs now unconditionally enter the scene. Three theft text variants cover zero, some, and all seven collected Balls; recovering his pouch never invents missing palace rewards. Native music event 7D7 begins before his first reveal.

The normal Fortress route runs F6: Frieza energizes Thanatos, Dyluck escapes, and the original Dark Lich loads. Its native actors/BG2 remain visible during this trial. Native victory event 42D routes to 12A, which marks the trial complete and starts C1. The Popoi scene and Frieza battle follow. Quick battle checkpoints explicitly skip this already-completed warm-up; the showdown checkpoint plays it.

Frieza is virtual entity 12, targeted by the normal beam/punch/teleport code. Returning discs stagger him and deal 12,000 of 96,000 HP. Normal attacks deal 15% damage, rising to 65% during stagger. Death Orbs queue 310 native damage; discs queue 230, with 48 frames of shared hit grace. He rushes between safe positions but holds still while steering discs. HP thresholds at 64,000 and 32,000 trigger one power surge each; damage cannot skip them. The second surge plays a 118-frame planet-view clash, then returns control with a grace period. Ring menus pause projectiles and phase clocks. No additional boss health bar is drawn.

`frieza-arena.js` records bounded scars and debris bursts. Their footprint is clipped to verified walkable floor cells. The PPU alters only BG1 floor pixels, preserving native actors, windows, collision, doors and map bytes. Orbs, disc counters, eruptions and surges break the arena; no tile-grid patch or broken floor atlas is involved. Afterimages, recoil, charging sparks, rotating discs, projectile trails and native spell cells accompany attacks. Impact/rubble/rush cues reuse processed DBZ samples at individual gains and pitch, with a separate sustained enemy charging loop. All state is serialized.

The escape still uses door 3F7, party setup 47C and native command 1F04. CF41/44/45 advance monotonically to the post-continent state without completing Pure Land or the Fortress. At flyby end, a one-shot native camera request at C0:8779 changes the overhead map to the rear view for Kai's sky warning. No PPU matrices or HDMA tables are replaced.

`engine/frieza-crisis.js` owns the authored five-minute dialogue and world-state transition. The deadline is persisted story state, not a real-time game-over timer. Goku accepts it but considers it ample time; everyone else takes the danger seriously. NPC interactions prepend one native warning, then resume the exact original event pointer, preserving shop, inn and save choices. Greetings serialize their continuation for browser checkpoints. Jema's 4E0 and the Mana Tree's 5F8 retain native choreography with crisis-specific text; Frieza's Death Ball is responsible for the damaged Tree. Clearing the Pure Land cloud barrier no longer destroys or craters the Tree. The radar repeats the deadline until the restoration wish repairs the core.

Arena 246's native object records are hidden during Frieza's own scenes and battle; they remain active during the Thanatos trial. BG2 is reserved for that boss's streamed body; its display is masked during the custom encounter while the original BG1 floor, BG3 dialogue and native PPU registers remain intact. Popoi's membership is recorded before a guest is added and restored conditionally in the wish. The ordinary poison/sleep form break remains unchanged outside this route.

Native save sidecars are keyed to the original ROM and exact SRAM record hash. C7:55D9 captures mod state at the start of a save; battery writes finish before the sidecar is hashed. C7:558F identifies the validated record (including a backup); C7:55C5 restores mod state after native RAM loading. Four $400-byte slots each have a $1000-offset backup. No bytes are inserted into SRAM or ROM. Overwritten or unmatched records reject the old sidecar.

Quick checkpoint revision `frieza-cosmic-2` supplies `late` before the Death Ball, `frieza` before the Thanatos warm-up with the crisis active, and `battle` at the exact first controllable battle frame. These intentionally initialized testing states are built in the browser from the supplied ROM; no cartridge or savestate is distributed. Older Frieza save metadata acquires the crisis state without replaying the entrance.

Fire Palace window recesses in tileset 23 have walkable native descriptors but contain brick/arch art. They are excluded from demolition's floor sources and endpoints, preventing those bricks from replacing a blasted passage. Debris now emits one bounded burst per redraw row, deduplicates the two map layers, and draws before Goku and the beam.

Earlier Death Ball validation covered the native twilight handoff, shop/inn continuation, solo/full-party Tree scenes, native GAME FILE persistence and the original flight camera. Source checkpoints are tagged `checkpoint/pre-frieza-2026-10-14` and `checkpoint/pre-death-ball-2026-10-14`. The revised mainline/finale checks are listed below; this remains targeted coverage rather than a complete new playthrough.

### Fortress beam and final consequences

`world-ki.js` renders a single beam along the flight camera’s forward axis. Hit testing still uses native world bearings; a culled Fortress projection can no longer steer the beam sideways. The destruction sequence locks flight input, pauses the docking hook, and plays a 186-frame planet cutaway before returning through the existing native landing and Beast setup. The cutaway’s clock and target survive checkpoints.

`world-texture.js` decodes the loaded cartridge’s world map, tile pixels and day/night palettes without Node dependencies. `planet-view.js` draws the globe, outward beam, dust, planetary destruction and King Kai’s tiny planet into a 256×224 RGB555 PPU surface. It leaves Mode7 matrices, HDMA and VRAM alone. Native ending dialogue remains above the picture; the aerial cut has no radar or combat HUD.

Event42F selects the ending from actual progression, never from a dialogue choice. Good: seven earned Balls, Frieza defeated, upgraded Beast defeated, Fortress intact. Shenron restores the core, victims and craters, the scene visits living Randi in Potos, and Goku leaves for Kai’s planet. Bad: the planet explodes, Goku teleports away, and Kai condemns his recklessness. No Balls are delivered, no wish executes and no crisis flag is repaired. DE/E4 are verified unused native event slots for the good departure and Kai arrival. A3–A6 use outcome-specific phases for both endings.
