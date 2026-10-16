# Changelog

Several Claude Code sessions work on this repository in parallel. Each entry
lists what landed, grouped by the work stream that produced it, so changes
stay traceable even when they are committed together.

## 2026-10-16 — Vegeta Final Flash

- Final Flash now fills the screen with the full-power SSJ Kamehameha's wave geometry and yellow energy, including its charge, edge effects and beam clash. Galick Gun retains its purple appearance.
- Only a Kamehameha fired as Super Saiyan can lock Final Flash. SSJ Vegeta takes 32% of incoming damage instead of 38%, making him about 19% tougher; winning a clash still removes 34% of his maximum HP.
- Validation: 16 targeted unit tests and two private-ROM browser checks, covering the full yellow wave, rejected base-form counters, SSJ clash wins/losses and checkpoint replay. Screenshots remain under `.local/vegeta-final-flash/`.

## 2026-10-16 — Native releases and public overview

- Added an Electron desktop shell and self-contained Windows/macOS/Linux archives, plus fullscreen Steam Deck and Bazzite profiles. Release packaging includes the verified local ROM and writes SHA-256 checksums while keeping ROMs and outputs out of Git.
- Desktop builds show only the game canvas. Controller startup enables sound automatically; F5/F9 save and restore checkpoints. A stable per-user profile preserves native SRAM and checkpoints across updates.
- Packaged ROM loading allows a cold local read up to 60 seconds; the browser retains its four-second fallback. This fixes the initial Intel macOS launch under Rosetta aborting before the bundled ROM finishes loading.
- Added manual native-release CI with per-platform packaged-app smoke checks and an optional draft release. Local packaging does not publish anything.
- Reduced the public README to the premise, three real gameplay GIFs, title/gameplay screenshots, brief controls and the maintainer's YouTube teaser link. Added the vibe coded, noncommercial fan-game notice.
- Moved detailed gameplay, developer notes, code summaries and this changelog into docs/agents/. Updated links and repository instructions.
- Validation: 349 unit tests, five browser release/title checks, and two-launch smoke tests of packaged Apple silicon and Intel (via Rosetta) macOS apps. Cross-built Linux/Windows archives still require their native CI/hardware checks; Deck/Bazzite hardware and signing credentials are not available locally.

### Goku push animation

- Replaced the frozen wall-contact pose with a relaxed one-handed nudge loop in normal and Super Saiyan form, in all four directions. Reuses the existing palm and standing artwork with fixed feet and a calm expression.
- Contact must persist before the loop starts; releasing, walking away, focusing, flight and native scenes cancel it. Collision behavior is unchanged.
- Validation: 69 native animation/presentation/combat unit tests and eight browser checks, including both forms against native walls with no movement or pivot drift.



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
- Scouter from Sylphid; L+X / Analyzer show power levels (`engine/scouter.js`).
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
