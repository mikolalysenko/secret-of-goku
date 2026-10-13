# Secret of Goku

The original **Secret of Mana (USA)** running in a browser, with Goku in its SNES sprite layer and deliberately overpowered combat. The original opening plays normally as BOY until Goku's Saiyan pod crashes into the Mana Sword scene. He climbs out: “This isn't Planet Namek... Uh, sorry about the parking.” Maps, collision, tile layers, rings, dialogue boxes, music and subsequent story progression stay native.

## Play the demo

**[Play Secret of Goku](https://mikolalysenko.github.io/secret-of-goku/)** · [GitHub repository](https://github.com/mikolalysenko/secret-of-goku)

Choose your own **Secret of Mana (USA)** `.sfc` or `.smc` file. The ROM is read in your browser, never uploaded, and is not included here. A 512-byte copier header is accepted. Other regions, revisions and prepatched ROMs are rejected because the mod depends on verified US offsets.

Unheadered SHA-256: `4c15013131351e694e05f22e38bb1b3e4031dedac77ec75abecebe8520d82d5f`.

The demo supports keyboard, icon-only multitouch controls, and standard browser-mapped gamepads. Sound unlocks on a tap or key press; if you start with a controller, click **Sound on**. Desktop Chrome is the primary tested browser; phone layouts are checked in portrait and landscape. Emulation speed depends on the device.

The title and opening run from the beginning. The gold title reads **Secret of GOKU**, with **PROGRAMMED BY NASIR AND CHATGPT** in the original credit font. Press **Enter** for Start, then **E / J** to confirm. The original name editor defaults to **BOY** and remains editable. Sound starts on your first key press or click.

Your disk ROM remains untouched. Checkpoints stay in this browser; select the same ROM again and choose **Restore checkpoint** to continue.

| Input | Action |
| --- | --- |
| WASD / arrows | Native movement and menu navigation |
| Shift / K | Fast local flight; ascend during world flight |
| Enter | SNES Start; accepts the name |
| J / Space / Z | Tap for a three-hit combo; hold to charge Kamehameha; release to fire |
| C | Hold for a three-shot ki barrage |
| Shift + C | Teleport onto clear ground beside one enemy; camera follows; press again for the next |
| E | Native confirm / talk |
| Q | Original sprite ring; also closes it |
| X | Native back / cancel; in flight, ascend |
| R | Super Saiyan toggle during gameplay |
| Tab | Switch the controlled party member |
| , / . | Native L / R buttons |
| F | World flight / landing; punch through a dungeon ceiling |
| Escape | Pause / resume the emulator |

In menus and dialogue, attack is the original confirm button and never charges a beam. E always talks/confirms without charging. Move and aim while charging at half speed. Shift flies over bushes, breakable rocks and short forest riverbanks at three times walking speed (four times in Super Saiyan). Riverbanks require usable ground on both sides; room walls, doors and map edges still constrain movement. Release over clear ground to land; over a low obstacle, Goku hovers until you steer clear. Whip pads automatically float the party across. Rapid taps buffer a combo ending with a kick. Super Saiyan charges twice as fast and fires faster, stronger attacks; poison cancels it and prevents transforming until cured. During world flight, hold J to charge and release to fire, F toggles descent/landing, X ascends, up/down travel and left/right turn. Touch buttons are available on touch devices. Save/Restore checkpoint preserves SNES state, Goku's action timing and projectiles in this browser.

### Gamepad and touch

Connect an Xbox, PlayStation, or other controller that the browser exposes with the **standard** mapping, then press a button. Left stick and D-pad move and navigate menus; diagonal movement and stick dead zones are supported. Button names below use physical positions so they also apply to controllers with different printed labels.

| Controller | Action |
| --- | --- |
| South face button — A / cross | Attack, hold to charge, release to fire; confirm in menus |
| East — B / circle | Ring menu / back |
| West — X / square | Ki barrage |
| North — Y / triangle | Talk / confirm |
| Left bumper | Hold for fast local flight / world ascent |
| Right bumper | Super Saiyan |
| Left trigger | Instant Transmission |
| Right trigger | World flight / land; burst through dungeon ceilings |
| Menu / Start / Options | Start and resume |
| View / Select / Share | Switch party member |
| Right stick click | Pause / resume |

Touch controls appear automatically on touch devices, or enable **Always show touch controls** in game options. All game buttons are vector icons with accessible labels, with selection and long-press menus disabled. Slide the direction pad for diagonals, and hold the fist with another finger to charge while moving. The chevrons fly fast, rocket flies/lands, lightning transforms, streaking orb fires ki, paired arrows teleport, speech bubble confirms, and ring opens the menu. The small triangle starts, people switch party members, and bars pause. Fullscreen keeps the controls beside or below the game; phones without the browser Fullscreen API use an expanded player.

Pausing, switching tabs, disconnecting a controller, or cancelling a touch clears held attacks. A controller must return to neutral after a focus change before it can resume input.

## What changes

- The bridge, fall and approach to the sword use the original boy throughout. During the sword-pull grunt, Goku dives in, obliterates the boy and sword, and leaves a large crater. The original ghost reluctantly recruits him. Native dialogue, quake, flash and sound drive the scene; Goku takes over permanently at impact, including his name, HUD/ring portraits, status and Action Grid sprites. Super Saiyan swaps his artwork and speeds up charging/punching.
- Goku's pixels enter the native PPU sprite layer, so roofs, tree canopies, NPC depth, dialogue, menu windows, brightness and fades follow the original renderer. Full 32-pixel frames retain his boots. The source sheet's left/right rows are correctly mapped.
- Punches, ki blasts and travelling beams feed the original damage queue, preserving damage numbers, XP, gold and boss defeat events, with DBZ impact sounds for Goku. Ordinary enemies and their death explosions follow a launch arc. Boss bodies stay in place for their original event scripts.
- A fully charged **Super Saiyan Kamehameha** expands to a 160-pixel-wide blue-white beam, sweeps enemies and breakable objects across most of the screen, and sustains for about a second. Beams repeatedly hammer enemies that remain inside them; the full SSJ wave can overwhelm even a 65,535-HP boss in one shot while preserving native defeat events and rewards. In Mode 7, its enormous streak stays visible at the highest altitude and can hit the Fortress from twice the normal range. Partial charges keep their smaller beam.
- Walk/run cycles follow distance travelled and stop at walls. Attacks start their own animation clocks; damage begins on the striking frame. Full-frame pivots, hand sockets, airborne height and native fall/recovery phases keep his feet, palms and effects aligned. Transformation uses the actual base-to-gold source sequence.
- Charge, beam, impact and aura art comes from original Lucent Beam, Thunderbolt and Lucid Barrier cells decoded at runtime. Super Saiyan charge lightning changes paths and arcs into nearby surfaces and actors. Kamehameha stays blue and breaks plants, rocks and destructible barriers through native tilemap/collision redraw. A continuous, slower Japanese “ka… me… ha… me…” performance keeps its long vowels in both forms, with the final shout on release. The quieter Japanese vocal stem plays independently of a continuous DBZ charging loop, which lasts as long as you hold. Super Saiyan adds electrical crackle. DBZ samples cover punch swings, varied hits, kicks, ki shots, impacts, teleportation, transformation and flight; sound cues follow animation and contact frames, with limited overlap for fast barrages. Goku follows native status palettes; snowman and moogle transformations remain native.
- **Senzu Beans** replace the Cup of Wishes in the original item table, native ring artwork and dialogue. They revive fallen allies or fully heal living, injured allies through the original item-use animation. Full-health characters cannot waste a bean.
- Punches, ki blasts and Kamehameha activate elemental crystal orbs using their original puzzle events, including all seven Grand Palace orbs. Orbs receive activation instead of lethal damage.
- F takes off directly, and the native item ring has an animated Goku **Fly** ability in the former Drum slot. Goku flies through takeoff, the original Mode 7 world, and landing. Scripted Flammie departures use the same handoff. The dragon rescue still progresses normally; a few lines acknowledge that Goku already flies. Landing bypasses the original BG3 dragon fly-by; Goku descends during the visible ground fade. Native landing restrictions remain except for the breakable Mana Tree cloud barrier.
- **King Kai** makes at most one remark per Super Saiyan charge, after full power has been held for another 1.5 seconds. His warnings rotate between charges, on the ground and in Mode 7, with no extra complaint on release. They use the ROM's original font and window art, keep movement/charging live, and yield to real dialogue and menus.
- **Ceiling escape:** press F, the touch rocket, or the gamepad right trigger inside a dungeon. Goku punches a jagged hole, blasts upward with native effects, and carries the party into world flight. Routes cover 185 rooms across 21 regions using original exterior doors; cutscenes, the Potos rescue and final battle arenas retain their locks. Checkpoints preserve holes and mid-escape animation.
- **Dragon Ball quest:** the crash scatters seven Balls into the Mana Seeds and breaks the Sword's Fortress seal. Jema and Luka explain why the Fortress wakes early. Collect the Balls from Water, Earth, Wind, Fire, Light, Dark and Moon; the seed cases keep Mana flowing. Dryad is a person, not an eighth Ball. Collection notices and Luka's Advice show progress. Most NPC dialogue remains original. Selected conversations acknowledge Goku, the shattered Sword and the boy sheltered by the Mana Tree. Absent companions do not speak or stall scripted movement; early spell grants are retained for later recruitment. Area entry prerequisites support out-of-order visits without globally completing bosses.
- Potos villagers explicitly blame Goku for killing **Randi** and destroying the Mana Sword. Goku apologizes awkwardly, deliberately hops into the Mantis hole to rescue Elliott, and is banished as a very strong menace. The Elder's conversations are about Randi, rather than treating Goku as the child he raised.
- Fully charge a wave to break Witch Castle’s three-person gate, Northtown Castle’s entrance, or Gold Tower’s lock. These run native events and rebuild the map; returning preserves the opened route.
- Fly toward the Mana Tree clouds in the northwest, aim and release a fully charged wave to open the Pure Land landing zone early. This does not complete any Pure Land bosses.
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
| `engine/native-gap-flight.js` | Native party crossings without whip equipment or fastening |
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

`dist/` contains an explicit list of player files, emulator code, mod artwork/audio and credits. It contains no ROM, checkpoint, `.local`, dependency folder, extracted map images, archived prototype, or source sprite sheets. Asset paths are relative, so the build works under a GitHub Pages repository subdirectory.

### Publishing

[The Pages workflow](.github/workflows/pages.yml) runs `npm ci`, unit tests and the static build, then deploys `dist/` on pushes to `main`. Pull requests run the same checks without deploying. In a fork, enable **Settings → Pages → Source: GitHub Actions**, then run the workflow. No ROM, private fixture, secret or backend is required for deployment. ROM-dependent tests skip in public CI; the full emulator browser suite is run locally with the supplied ROM and private research fixtures. `tests/browser/controls.spec.mjs` also includes a ROM-free phone layout check.

This is an unofficial fan project, unaffiliated with the original rights holders. Original wrapper code is MIT; ROM tooling has its own LGPL notice, and third-party artwork/audio are **not** covered by those code licenses. See [LICENSE](LICENSE) and [CREDITS.md](CREDITS.md).
