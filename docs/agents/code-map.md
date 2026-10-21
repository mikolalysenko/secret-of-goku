# Code map for agents

Detailed implementation paths; this page includes story spoilers. Start with the subsystem relevant to the task and preserve native game behavior.

## Developer paths

- `/engine.html`: explicit Potos test start, using the same native rendering and combat hooks. This shortcut skips the intro only when you choose it; it is not the main game.
- `/prototype.html`: the earlier JavaScript chapter, retained locally for research. Its custom menus and story are no longer the main experience and its entry page is not included in the static build.
- `window.mana`: inspection API for RAM, PPU state, frame stepping and checkpoints. See [engine notes](engine-lab.md).

| File | Purpose |
| --- | --- |
| `engine/lab.js` | ROM loading, native startup, controls, name entry, audio and checkpoints |
| `vendor/snes/` fast paths, `engine/audio-output.js` + `audio-worklet.js` | Exact emulation fast paths, hook registration and streamed audio; see [performance](performance.md) |
| `engine/sprite-layer.js` | Replacement sprites in native OBJ depth and background composition |
| `engine/native-effects.js` + `.json` | Runtime spell-art decoder and ROM source descriptors |
| `engine/impact-art.js`, `native-feedback.js` | Impact frames (starbursts, the kick's shockwave) shared with the cartridge; BG quake, camera kick and screen brightening |
| `engine/title-layer.js` | Gold GOKU lettering and native-font credit in the title's BG2 layer |
| `engine/arrival.js` + `arrival-event-data.js` | Sword-scene hand-off, native event overlay and checkpointed arrival |
| `engine/native-crater.js` | Runtime decoder for the original Potos hole artwork |
| `engine/mana-mod.js` | State gates, transformation, charged attack and enemy damage |
| `engine/goku-animation.js` + `goku-animation-data.js` | Pose clocks and verified source cells, pivots and hand sockets |
| `engine/input.js`, `gamepad.js`, `touch-controls.js`, `player-shell.js` | Shared input ownership, standard gamepads, labeled multitouch and responsive player layout |
| `engine/ki-sound.js` + `native-combat-sound.js` | DBZ sample mixer, sustained energy loops and native impact handoff |
| `engine/kamehameha-voice.js` | Continuous Japanese charge and separate release voice, with mute/pause cancellation |
| `engine/charge-lightning.js` | Moving charge bolts with live map/object endpoints |
| `engine/native-oam.js` | Native actor ownership and displayed sprite generation through DMA |
| `engine/goku-native-actions.js` | All 51 standard native player animation mappings |
| `engine/native-senzu.js` | Shared item rename, native full-heal/revive targeting and bean sprite |
| `engine/native-interaction.js` | Talk/confirm without Goku falling through to a native sword swing |
| `engine/native-hit-recovery.js` | Equipment-aware Saiyan defense, deflection and native hit recovery |
| `engine/story-compiler.js`, `scene-dialogue.js`, `native-story.js` | Party-aware dialogue, window layout and original event dispatch |
| `engine/frieza.js`, `frieza-combat.js`, `frieza-events.js`, `frieza-crisis.js` | Mainline entrance, Death Ball crisis, Thanatos warm-up, escalating dodge/counter battle and floor destruction |
| `engine/native-mod-save.js` + `battery.js` | Per-slot mod metadata bound to native SRAM records without changing cartridge save bytes |
| `engine/shenron-ending.js`, `planet-view.js`, `kai-planet.js` | Summoning, restoration, planetary consequences and Snake Way epilogue |
| `engine/frieza-orbit.js`, `frieza-orbit-view.js` | Orbital combat, ricochets and the charged/mash beam struggle |
| `engine/frieza-score.js`, `engine/spc-score.js`, `engine/mana-instruments.js` | Frieza/Vegeta score: entrance, battle and training cues rendered at runtime from the cartridge's own Mana instrument bank |
| `engine/native-plants.js` | Original destructible map tiles and native redraw |
| `engine/dungeon-geometry.js` + `dungeon-demolition.js` | Live dungeon gap/wall validation, paired-layer breaches and room-colored debris |
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


Desktop packaging, launch policy and release tools are summarized in [releases.md](releases.md#code-map).
