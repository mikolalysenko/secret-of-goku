# Secret of Goku

The original **Secret of Mana (USA)** running in a browser, with Goku in its SNES sprite layer and deliberately overpowered combat. The original opening plays normally as BOY until Goku's Saiyan pod crashes into the Mana Sword scene. He climbs out: “This isn't Planet Namek... Uh, sorry about the parking.” Maps, collision, tile layers, rings, dialogue boxes, music and subsequent story progression stay native.

## Play the demo

**[Play Secret of Goku](https://mikolalysenko.github.io/secret-of-goku/)** · [GitHub repository](https://github.com/mikolalysenko/secret-of-goku)

The player first checks **`./rom/secret-of-mana-us.sfc`** relative to the site's page. If that file is missing, invalid or unavailable, choose your own **Secret of Mana (USA)** `.sfc` or `.smc` file. The selected file is read in your browser, never uploaded, and is not included here. A 512-byte copier header is accepted. Other regions, revisions and prepatched ROMs are rejected because the mod depends on verified US offsets.

For your own deployment, place the ROM at `rom/secret-of-mana-us.sfc` beside `index.html` after building. Git ignores ROM files, and the public build does not package them. The GitHub Pages demo falls back to the file chooser unless a ROM is supplied at that path. Local development also checks the private `/local-rom` endpoint used by `npm run rom:import`.

Unheadered SHA-256: `4c15013131351e694e05f22e38bb1b3e4031dedac77ec75abecebe8520d82d5f`.

The demo supports keyboard, icon-only multitouch controls, and standard browser-mapped gamepads. Sound unlocks on a tap or key press; if you start with a controller, click **Sound on**. Desktop Chrome is the primary tested browser; phone layouts are checked in portrait and landscape. Emulation speed depends on the device.

The title and opening run from the beginning. The gold title reads **Secret of GOKU**, with **PROGRAMMED BY NASIR AND CHATGPT** in the original credit font. Press **Space / Enter** for Start, then **X** to confirm. The original name editor defaults to **BOY** and remains editable. Sound starts on your first key press or click.

Your disk ROM remains untouched. Checkpoints stay in this browser; select the same ROM again and choose **Restore checkpoint** to continue.

For quick testing, use **Controls & game options → After title** or **After sword / pod crash**. The first use builds the checkpoints locally from your ROM; later jumps restore instantly. They have separate slots from your manual save. [Start with Goku ready to play](https://mikolalysenko.github.io/secret-of-goku/?start=sword) or [open the name menu after the title](https://mikolalysenko.github.io/secret-of-goku/?start=title). Locally, use the same `?start=sword` or `?start=title` on `http://127.0.0.1:5173/`.

Every gameplay action fits a standard SNES controller. Browser gamepads use the same physical positions: south **B**, west **Y**, east **A**, north **X**, left shoulder **L**, right shoulder **R**. Xbox/PlayStation labels differ, but no triggers or stick clicks are required.

| SNES control | Keyboard | Action |
| --- | --- | --- |
| D-pad | Arrows only | Move and steer. In menus, left/right rotates the ring; up/down changes ring levels |
| B | X | Punch; mash or hold for a combo; talk / confirm. In world flight, descend to land |
| Y | C | One ki blast per tap; hold for rapid fire |
| A | Z | Hold with a direction for fast local flight; ascend in world flight |
| X | A | Open/close the ring; back out of submenus; delete a letter when naming |
| Hold L | Shift | Build a focus aura and rising rumble |
| L + Y | Shift + C | Hold to charge Kamehameha; release to fire, on foot or in Mode 7 |
| L + B | Shift + X | Instant Transmission beside one enemy; press again for the next |
| L + A | Shift + Z | Transform at full focus; tap in Super Saiyan to return to normal |
| L + R | Shift + D | Take off into world flight, including bursting through indoor ceilings |
| Hold R | D | Fast-forward dialogue and cutscenes at up to 12×; auto-advance prose, stop at choices |
| Start | Space / Enter | Start / accept name; resume if the browser player is paused |
| Select | S | Switch party member |
| Browser conveniences | Backspace / Escape | Back or delete a letter / pause the browser player |

L alone charges focus without changing form. Add A when ready, or hold L+A from the start: the aura builds for 1.6 seconds before the gold transformation burst. Let go early to cancel. L attack chords take priority and never accidentally revert Super Saiyan. The transformation has an independent rumble and crackle without the Kamehameha chant. Poison cancels Super Saiyan and prevents transforming until cured.

Move and aim while charging Kamehameha at half speed. A flies over bushes, breakable rocks, Haunted Forest vines and forest ledges at three times walking speed (four times in Super Saiyan). Gaia's Navel supports flying between its stacked levels. Ledges require usable ground on both sides; walls, doors and map edges still constrain movement. Release over clear ground to land; over a low obstacle, Goku hovers until you steer clear. Whip pads automatically float the party across. In Mode 7, use Flammie's original steering, A to ascend and B to descend onto land; L+Y fires the aerial wave. R fast-forward runs native events faster and mutes audio while accelerating, without jumping over story flags or choosing answers.

### Gamepad and touch

Connect a controller that the browser exposes with the **standard** mapping, then press a button. D-pad and left stick support diagonal movement; the stick has a dead zone. The SNES table above describes all required buttons. Right stick click optionally pauses the browser player.

Touch controls appear on touch devices, or enable **Always show touch controls**. All buttons use icons with accessible labels and disable text selection. The D-pad is on the left; actions are on the right. Slide the D-pad for diagonals, use left/right to rotate the ring and up/down to change ring levels. Fist is B (punch/confirm), ki orb is Y, chevrons are A, and ring is X (open/back/close). Focus and double triangles supply L and R. The beam, teleport arrows, lightning and rocket are dedicated **L+Y, L+B, L+A and L+R** buttons: moving and using a technique needs only two fingers. Hold beam to charge and release to fire. Hold lightning to transform or tap to revert; rocket takes off. In world flight, hold fist to descend and chevrons to ascend. Below the D-pad, the small triangle is Start, people is Select, and bars pauses. Fullscreen keeps controls beside or below the game.

Pausing, switching apps/tabs, hiding touch controls, rotating the device, changing fullscreen, or cancelling a touch clears held touch attacks without firing a wave. Lifting a finger outside a button still releases it. The icon buttons cannot select text or open a long-press menu. A controller must return to neutral after a focus change before it can resume input. A Start press used to resume is consumed so it cannot also open a native menu. Pausing displays a darkened PAUSED overlay with a resume button.

## What changes

- The bridge, fall and approach to the sword use the original boy throughout. During the sword-pull grunt, Goku crashes in a Saiyan pod, obliterates the boy and sword, and leaves a large crater. The original ghost reluctantly recruits him. Native dialogue, quake, flash and sound drive the scene; the quake stops and the crater settles afterward, including when restoring older checkpoints. Goku takes over permanently at impact, including his name, HUD/ring portraits, status and Action Grid sprites. Super Saiyan swaps his artwork and speeds up charging/punching.
- Goku's pixels enter the native PPU sprite layer, so roofs, tree canopies, NPC depth, dialogue, menu windows, brightness and fades follow the original renderer. Full 32-pixel frames retain his boots. The source sheet's left/right rows are correctly mapped.
- Punches, ki blasts and travelling beams feed the original damage queue, preserving damage numbers, XP, gold and boss defeat events, with DBZ impact sounds for Goku. Ordinary enemies and their death explosions follow a launch arc. Boss bodies stay in place for their original event scripts.
- A fully charged **Super Saiyan Kamehameha** expands to a 160-pixel-wide blue-white beam, sweeps enemies and breakable objects across most of the screen, and sustains for about a second. Beams repeatedly hammer enemies that remain inside them; the full SSJ wave can overwhelm even a 65,535-HP boss in one shot while preserving native defeat events and rewards. In Mode 7, its enormous streak stays visible at the highest altitude and can hit the Fortress from twice the normal range. Partial charges keep their smaller beam.
- Walk/run cycles follow distance travelled and stop at walls. Attacks start their own animation clocks; damage begins on the striking frame. Full-frame pivots, hand sockets, airborne height and native fall/recovery phases keep his feet, palms and effects aligned. Transformation uses the actual base-to-gold source sequence.
- Charge, beam, impact and aura art comes from original Lucent Beam, Thunderbolt and Lucid Barrier cells decoded at runtime. Super Saiyan charge lightning changes paths and arcs into nearby surfaces and actors. Kamehameha stays blue and breaks plants, rocks and destructible barriers through native tilemap/collision redraw. A continuous, slower Japanese “ka… me… ha… me…” performance keeps its long vowels in both forms, with the final shout on release. The quieter Japanese vocal stem plays independently of a continuous DBZ charging loop, which lasts as long as you hold. Super Saiyan adds electrical crackle. DBZ samples cover punch swings, varied hits, kicks, ki shots, impacts, teleportation, transformation and flight; sound cues follow animation and contact frames, with limited overlap for fast barrages. Goku follows native status palettes; snowman and moogle transformations remain native.
- **Senzu Beans** replace the Cup of Wishes in the original item table, native ring artwork and dialogue. They revive fallen allies or fully heal living, injured allies through the original item-use animation. Full-health characters cannot waste a bean.
- Punches, ki blasts and Kamehameha activate elemental crystal orbs using their original puzzle events, including all seven Grand Palace orbs. Orbs receive activation instead of lethal damage.
- L+R / Shift+D takes off directly, and the native item ring has an animated Goku **Fly** ability in the former Drum slot. Goku flies through takeoff, the original Mode 7 world, and landing. Scripted Flammie departures use the same handoff. The dragon rescue still progresses normally; a few lines acknowledge that Goku already flies. Landing bypasses the original BG3 dragon fly-by; Goku descends during the visible ground fade. The Fortress approach uses a curved ki trail and short boost, then places the party on its real deck. Native landing restrictions remain except for the breakable Mana Tree cloud barrier.
- **Dragon Radar** points toward the next uncollected palace while flying, using a pixel compass and the original dialogue font. It follows out-of-order collection and points toward the finale once all seven Balls are collected.
- Small aerial ki blasts disappear over the horizon, then explode in the distance. Shots draw in front of Goku.
- Watts is surprised and delighted when Goku offers him the weapon orbs he does not need; native forging remains available for companions.
- **King Kai** makes at most one remark per Super Saiyan charge, after full power has been held for another 1.5 seconds. His warnings rotate between charges, on the ground and in Mode 7, with no extra complaint on release. They use the ROM's original font and window art, keep movement/charging live, and yield to real dialogue and menus.
- **King Kai and Luka react to shortcuts:** smashed gates, activated puzzle switches and orbs, demolished obstacles, and gaps crossed by flight get short, contextual telepathic remarks. Reactions wait for the attack or native scene to finish, share an eight-second cooldown, and remember completed barriers in checkpoints. Ordinary grass cutting does not prompt commentary.
- **Ceiling escape:** press Shift+D, the touch rocket, or gamepad L+R inside a dungeon, palace, house, inn or shop. Goku punches a jagged hole and sends chunks of the roof flying as he blasts upward with the party. Routes cover 253 rooms using original exterior doors, including the Water Palace's peaceful rooms. He stays airborne throughout the transition to world flight. Live bosses, conversations, cutscenes and the Potos rescue retain their locks. Checkpoints preserve holes, debris timing and mid-escape animation.
- **Dragon Ball quest:** the crash scatters seven Balls into the Mana Seeds and breaks the Sword's Fortress seal. Jema and Luka explain why the Fortress wakes early. Collect the Balls from Water, Earth, Wind, Fire, Light, Dark and Moon; the seed cases keep Mana flowing. Dryad is a person, not an eighth Ball. Collection notices and Luka's Advice show progress. Most NPC dialogue remains original. Selected conversations acknowledge Goku, the shattered Sword and the boy sheltered by the Mana Tree. Absent companions do not speak or stall scripted movement; early spell grants are retained for later recruitment. Area entry prerequisites support out-of-order visits without globally completing bosses.
- **A deliberately bad decision:** before the Mana Beast, choose **Calm it** for the usual overpowered fight. **Feed seeds** unlocks only after personally visiting all seven Mana Seeds, because Goku wants a proper challenge. He offers seed energy while keeping the Dragon Balls for the wish. The fed Beast has 65,535 HP and takes one quarter of Goku's normal damage. Goku stops automatically healing, and glowing circles warn of eruptions; they grow and arrive faster below half boss health. Dash out before committing to a beam, or use Senzu Beans. Native damage, defeat and ending events still apply.
- **A reason to visit palaces:** each seed personally visited earns one **Mana Ward**, blocking one hit in the fed Beast fight. King Kai's emergency deliveries complete the wish but earn no shields. All seven visits unlock feeding and give seven wards; rushing the finale leaves only the normal fight. Repeated visits cannot farm wards, and checkpoints preserve spent wards and attack timing.
- **Power reveals:** the first fast hover defies the ghost's instruction to walk; the first Super Saiyan transformation lingers in a gold lightning burst while Goku explains his “serious hair.” Both remain available immediately. First-use banter pauses during Kamehameha, preserving the one-warning-per-charge limit.
- **Collateral damage:** a strong aerial Kamehameha can hit towns or scar the landscape. Goku apologizes and promises to wish everyone back. Huge craters use the original Potos hole artwork in the Mode 7 surface, rotate with the planet, and persist through travel and checkpoints. The restoration wish brings people back; the craters stay.
- **Whip gaps:** hold Z + arrows (SNES A + direction) to fly straight across, including caves, palaces, Jehk’s mountains and the Mana Fortress. Steering stays live, no whip is needed, and companions follow to the far shore.
- **Axe and sword obstacles:** one punch or a Kamehameha clears bushes, rocks, stalagmites and multi-stage pillars. Native switches rebuilding the current room no longer regrow objects destroyed by the same attack.
- Local flight ignores water currents and stair guidance, keeps full speed over both, and can land on them. Goku can cross Water Palace platform gaps and the same platform art in other palaces when there is ground on both sides. Releasing over a gap keeps him hovering; reaching a new floor height allows him to land. Charging still halves flight speed. Solid walls, shaped corners and scripted doors retain their collision rules.
- Potos villagers explicitly blame Goku for killing **Randi** and destroying the Mana Sword. Goku apologizes awkwardly, deliberately hops into the Mantis hole to rescue Elliott, and is banished as a very strong menace. Fly over the gatekeeper afterward and he yells that the ban includes the air, then performs the original kick-out scene again. When Luka asks what scares Goku, his only answer is **NOTHING**; the original seed ceremony still follows.
- Punch nearby gates or fire a fully charged wave to break the Haunted Forest rose barrier, open its bridge route, smash Witch Castle’s three-person gate, force Northtown Castle’s entrance, or break Gold Tower’s lock. Pandora and Northtown Ruins locks can also be broken; their native door transitions and rescue/boss scenes remain intact. Haunted Forest vines, flowers and the forest’s carved stone heads can be punched or blasted into walkable grass. Native hit switches and gate-opening floor plates respond to punches and beams, including the Ice and Shade Palace puzzles and Mana Fortress platforms. Gaia’s cave switches work even if flight skipped their floor markers. A strong hit bypasses the Lost Continent button combination. Gates use original events and preserve the opened route. Outer map walls remain boundaries.
- Fly toward the Mana Tree clouds in the northwest, aim and release a fully charged wave to open the Pure Land landing zone early. King Kai and Luka panic at the blast, and Goku promises to wish it back. This does not complete any Pure Land bosses.
- Ascend to see the moving Mana Fortress, point toward it and release a fully charged aerial wave. Its destruction frees the captive souls and skips the dungeon straight to the original Mana Beast battle. Luka also offers a native **Shortcut** choice leading through Dark Lich and Mana Beast. Both routes work solo. King Kai shields Mana and rushes in any missing Dragon Balls, grumbling that this is cheaper than replacing a planet. After the Beast calms, Shenron restores Randi, the Sword, the souls and Goku's demolished roofs. The bridge still needs a hammer.

The complete original game runs underneath these hooks. The opening and Potos have controller-driven story checks; a separate graphics audit works through map entry views across the game. This is still a hybrid browser mod, not a standalone SNES Goku ROM patch. Entry-view checks do not cover every story variant, animation or boss phase. The native status screen can recalculate stats; Saiyan combat values are reapplied on returning to gameplay.

Punch and kick windups use short anime air whooshes; contact has its own impact. Flight starts with a brief energy swell and whoosh, then continues with quiet air instead of a looping scream. All added DBZ recordings, including the Japanese voice and continuous charging beds, share a gritty 16 kHz, 10-bit SNES-style treatment. The original game's music and sounds still run through its emulated SPC.

## Run locally

Use Node.js 22 or newer:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173** and select your ROM. Optionally import it with the command below; the loopback development server can then load it automatically. No ROM download is provided.

## Developer paths

- `/engine.html`: explicit Potos test start, using the same native rendering and combat hooks. This shortcut skips the intro only when you choose it; it is not the main game.
- `/prototype.html`: the earlier JavaScript chapter, retained locally for research. Its custom menus and story are no longer the main experience and its entry page is not included in the static build.
- `window.mana`: inspection API for RAM, PPU state, frame stepping and checkpoints. See [engine notes](docs/engine-lab.md).

| File | Purpose |
| --- | --- |
| `engine/lab.js` | ROM loading, native startup, controls, name entry, audio and checkpoints |
| `engine/sprite-layer.js` | Replacement sprites in native OBJ depth and background composition |
| `engine/native-effects.js` + `.json` | Runtime spell-art decoder and ROM source descriptors |
| `engine/title-layer.js` | Gold GOKU lettering and native-font credit in the title's BG2 layer |
| `engine/arrival.js` + `arrival-event-data.js` | Sword-scene hand-off, native event overlay and checkpointed arrival |
| `engine/native-crater.js` | Runtime decoder for the original Potos hole artwork |
| `engine/mana-mod.js` | State gates, transformation, charged attack and enemy damage |
| `engine/goku-animation.js` + `goku-animation-data.js` | Pose clocks and verified source cells, pivots and hand sockets |
| `engine/input.js`, `gamepad.js`, `touch-controls.js` | Shared input ownership, standard gamepads and icon-only multitouch |
| `engine/ki-sound.js` + `native-combat-sound.js` | DBZ sample mixer, sustained energy loops and native impact handoff |
| `engine/kamehameha-voice.js` | Continuous Japanese charge and separate release voice, with mute/pause cancellation |
| `engine/charge-lightning.js` | Moving charge bolts with live map/object endpoints |
| `engine/native-oam.js` | Native actor ownership and displayed sprite generation through DMA |
| `engine/goku-native-actions.js` | All 51 standard native player animation mappings |
| `engine/native-senzu.js` | Shared item rename, native full-heal/revive targeting and bean sprite |
| `engine/native-interaction.js` | Talk/confirm without Goku falling through to a native sword swing |
| `engine/native-plants.js` | Original destructible map tiles and native redraw |
| `engine/native-flight.js` + `native-local-flight.js` | Direct world flight, local hover, collision and landing |
| `engine/native-teleport.js` | Clear-ground teleport destinations, terrain handoff, companion gathering and native camera streaming |
| `engine/native-gap-flight.js`, `engine/native-whip-routes.js` | Direct flight over verified whip corridors, plus automatic party crossings on foot |
| `engine/native-orbs.js` | Physical/ki hits activate each orb's original puzzle script |
| `engine/flight-dialogue.js` | Bounded native quest text and Fly item label |
| `engine/rom-patches.js` | Additive starting inventory patch; separate optional Potos shortcut |
| `engine/dialogue-patches.js` | Four bounded native player-text substitutions |
| `tools/rom/` | Original maps, graphics, layers, collision and world extraction |
| `tools/qa/` | Reproducible native UI, effect and regional graphics audits |
| `assets/data/potos-rom.json` | Extracted original map data for analysis |

## Import and extract

```sh
npm run rom:import -- "/path/to/Secret of Mana (USA).zip"
npm run rom:inspect
npm run rom:extract
npm run assets:prepare
```

Import also accepts `.sfc` and `.smc`, strips a copier header and checks the US ROM hash. ZIP import uses system `unzip`. Original assets are decoded from that ROM: positioned map pieces, both tile layers, metatiles, collision, NPC/door records, event bytes, palettes, map images and the overworld. The main game streams the original data through the emulated SNES rather than flattening the maps into background pictures. [ROM research](docs/rom-research.md) records the verified formats and offsets.

ROM files and analysis dumps are ignored under `.local/`. The `/local-rom` endpoint is restricted to the loopback development server and is unavailable in static builds.

## Verify and build

```sh
npm test
npm run test:e2e
npm run build
```

Browser tests use installed Google Chrome through Playwright. Tests requiring the local US ROM skip when it is absent. Coverage includes title changes confined to the two intended regions, native fades, editable BOY naming, bridge pixel parity, the full intro to waterfall control, the new arrival and mid-impact checkpoint replay, input gates, foreground priority, Potos combat/flight, and original Elder/Mantis events. The arrival test also uses the local controller-produced pre-sword fixture. Separate checks prove only the four player text spans and inventory stub change in the cartridge copy; title and arrival adapters do not change its hash.

See [combat and animation](docs/combat.md) for timing, native damage integration and frame-by-frame checks; [graphics audit](docs/graphics-audit.md) for regional coverage; [native effects](docs/native-effects.md) for the spell format; and [Goku's arrival](docs/arrival.md) for the title and sword-event implementation. Reports and screenshots remain local under `.local/`.

`dist/` contains an explicit list of player files, emulator code, mod artwork/audio and credits. It contains no ROM, checkpoint, `.local`, dependency folder, extracted map images, archived prototype, or source sprite sheets. Asset paths are relative, so the build works under a GitHub Pages repository subdirectory. Every build versions its script/module URLs and shows a short build ID in the footer so updates do not reuse stale control code.

### Publishing

[The Pages workflow](.github/workflows/pages.yml) runs `npm ci`, unit tests and the static build, then deploys `dist/` on pushes to `main`. Pull requests run the same checks without deploying. In a fork, enable **Settings → Pages → Source: GitHub Actions**, then run the workflow. No ROM, private fixture, secret or backend is required for deployment. ROM-dependent tests skip in public CI; the full emulator browser suite is run locally with the supplied ROM and private research fixtures. `tests/browser/controls.spec.mjs` also includes a ROM-free phone layout check.

This is an unofficial fan project, unaffiliated with the original rights holders. Original wrapper code is MIT; ROM tooling has its own LGPL notice, and third-party artwork/audio are **not** covered by those code licenses. See [LICENSE](LICENSE) and [CREDITS.md](CREDITS.md).
