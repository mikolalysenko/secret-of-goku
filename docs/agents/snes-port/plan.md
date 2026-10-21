# SNES cartridge port — plan and hardware strategies

Spoilers. Companion to [snes-rom.md](../snes-rom.md) (build, layout, harness).
Each work stream owns a module (`snes/src/modules/<name>/`), a doc in this
folder and tests under `snes/test/<name>/`.

## Work streams

| Module | Scope (browser sources) | Wave |
| --- | --- | --- |
| core | Frame/NMI dispatch for every mode, input filter, extra OAM, VRAM slots, SRAM sidecars, engine notes (`engine.md`) | 1 |
| goku | Sprite substitution in all native actions, portraits, SSJ form, pose API (`sprite-layer`, `native-oam`, `goku-animation*`, `goku-native-actions`) | 1 |
| audio | DBZ effects, Kamehameha voice, Frieza/Vegeta music on the native driver (`ki-sound`, `kamehameha-voice`, `*-arrangement`, `frieza-score`) | 1 |
| story | Compiled events/dialogue in F0–F7, party variants, event hooks, quest/crisis/ending state (`native-story`, `story-*`, `scene-dialogue`, `retail-dialogue`, …) | 1 |
| title | Title, BOY prefill, pod arrival, crater, name slots, opening patches (`title-layer`, `arrival*`, `saiyan-pod`, `native-crater`, `native-names`) | 1 |
| destroy | Plants/rocks, gates and locks, orbs, switches, demolition, braziers (`native-plants`, `native-barriers`, `native-orbs`, `dungeon-*`) | 1 |
| combat | Punch combos, ki, Kamehameha, SSJ transform + blast, damage queue, launches, defense, recovery, Heavy Gi, Senzu, status, scouter (cut from the cartridge: Analyzer readouts in ui), effects library (`mana-mod`, `charge-lightning`, `ki-aura`, `native-effects`, `native-hit-recovery`, …) | 2 |
| flight | Local flight, gap/whip crossings, Instant Transmission, takeoff, ceiling escape (`native-local-flight`, `native-gap-flight`, `native-whip-routes`, `native-teleport`, `ceiling-*`) | 2 |
| world | Mode 7: takeoff/landing handoff, aerial ki, Fortress beam, craters, Dragon Radar, Pure Land cloud (`native-flight`, `world-ki`, `world-scars`, `dragon-radar`) | 2 |
| radio | King Kai/Luka telepathy box, remark rotations, power-intro banter, window placement, R fast-forward (`native-radio`, `power-intro`, `window-placement`, `scene-fast-forward`) | 2 |
| frieza | Entrance/theft, Emperor, Death Balls, Tree, Thanatos boosts, three-phase ground fight, arena scars, death/game over, victory, Fortress collapse, Beast challenge (`frieza*.js`, `beast-challenge`, `boss-*`, `fortress-collapse`) | 3 |
| orbit | Collateral cinematic, pullback, orbital fight, debris, beam struggle, descent, planet views (`frieza-orbit*`, `orbit-*`, `frieza-cinematic`, `frieza-collateral-view`, `aerial-melee`, `frieza-finale*`, `planet-*`) | 3 |
| vegeta | Joch's trial in the Time Chamber (`joch-trial`, `time-chamber`, `vegeta-*`) | 3 |
| ending | Shenron, wish flight, Potos return, departure, Kai's planet, bad-ending explosion (`shenron-ending`, `wish-flight`, `kai-planet`, `ending-*`) | 3 |
| debug | In-cartridge scene select mirroring `?start=` presets (`quick-start`, `quick-boot`, `scene-launcher`) | 3 |

## Hardware strategies (recommended, not mandatory)

- **ROM space**: the cartridge is 64 Mbit ExHiROM. Code and data read in hot
  loops stay in the first 4 MiB (FastROM banks `$80–$FF`). Art, tilemaps,
  palettes, samples and rarely read tables can go to the extended banks
  `$40–$7D:0000–7FFF` through a generator's `xdata(name, bytes)` (DMA or long
  reads; see [snes-rom.md](../snes-rom.md#extended-data-exhirom)). Moving a
  module's DMA-only art there frees its bank in the first 4 MiB for code.
- **Goku and other characters**: native OAM substitution plus per-frame DMA of
  the current 32×32 cell (512 bytes) into the boy's own OBJ tiles. SoM's
  OBJSEL is `$63` (16×16 / 32×32 sprites), so a 32×32 cell can be one OBJ.
  Generated character art (Frieza, Vegeta, King Kai, Bubbles, Shenron) is
  quantised to 15-colour OBJ palettes with `snes/tools/gfx.mjs`.
- **Effects**: the cartridge's own spell cells (Lucent Beam, Thunderbolt, Lucid
  Barrier, Exploder, Fireball, Dark Force) are already in ROM; DMA them into a
  reserved OBJ region instead of decoding at runtime. Long/wide beams can use
  32×32 OBJ strips; the full Super Saiyan wave can be a window/HDMA-shaped
  colour-math polygon (per-scanline window edges) with OBJ sparks on the edges,
  which avoids the 128-sprite and 32-per-line limits.
- **Telepathy/radio, radar, scouter text**: render the retail 8×12 font into
  OBJ tiles (CPU blit into a WRAM/SRAM buffer, DMA), or use BG3 rows not used
  by the native windows. Never block native dialogue.
- **Full-screen pictures** (Kai's planet, cinematic stills, Time Chamber art):
  `gfx.makeBg` (≤8 palettes × 15 colours, flip-deduplicated tiles); King Kai's
  planet fits in 892 tiles.
- **Rotating globe / orbit**: stepped rotation (the browser already steps in
  eight-unit increments with four shading bands) suits pre-rendered frames on a
  4bpp BG, uploaded double-buffered across several vblanks; zoom via a few
  pre-rendered scales or Mode 7 for a ≤128 px globe (Mode 7 holds only 256
  unique tiles). Moon/planets/fighters/debris are OBJ.
- **Music**: new songs in Secret of Mana's own sequence format and instrument
  bank, so the native driver, fades and song commands keep working.
- **Long voices**: if ARAM cannot hold the Kamehameha chant, stream BRR from
  ROM through the APU ports during the charge.
- **Saves**: Goku-only progress lives in SRAM sidecars per native save slot.
- **Fast-forward (R)**: hardware cannot run 12× faster; instant text and
  auto-advance of prose (stopping at choices) is the adaptation.

## Testing assets

- Mesen headless harness, stable checkpoints and `H.importSnesJs` with 292
  bundles from the browser mod's private states (`.local/snes-import/`).
- `snes/tools/ref-capture.mjs`: reference screenshots plus snapshot
  (including the mod's JS state) for every `?start=` preset, and matching
  import bundles (`preset__<name>`).
- `snes/tools/snesjs-render.mjs`: original-engine reference frames for a state.
