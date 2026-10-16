# Changelog

Several Claude Code sessions work on this repository in parallel. Each entry
lists what landed, grouped by the work stream that produced it, so changes
stay traceable even when they are committed together.

## 2026-10-15

### Scene graph, review tooling and cutscene fixes
- Linked-data scene graph of every cutscene and event (`engine/scene-graph.js`,
  `engine/scene-catalog.json`, 107 scenes), launcher (`?scene=<id>`), viewer and
  live debugger (`scenes.html`), CLI (`npm run scenes`), docs (`docs/scenes.md`).
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
