# Scene graph, viewer and debugger

Every cutscene and event in the supported US cartridge, plus the mod's authored
scenes, is mapped as **linked data** that is crawled on demand. Nothing is
copied. The curated layer names and annotates scenes. Event membership, flags,
maps, callers, original text, authored text and code lines are all derived
from the ROM and the engine source each time the graph is built.

| Piece | Role |
| --- | --- |
| [`engine/scene-graph.js`](../engine/scene-graph.js) | Crawler and graph core (browser and Node). Decodes all 2,048 events, 511 maps and 1,024 doors. Overlays the mod's authored scripts and text tables, indexes code references, and provides `crawl`, `enumerate`, `coverage` and `renderScript`. |
| [`engine/scene-catalog.json`](../engine/scene-catalog.json) | Curated layer only: one scene per line, with chapter, kind, root events, maps, `next`/`requires` ordering, notes, dialogue notes, `code`/`tests` references and a launch recipe. |
| [`engine/scene-launcher.js`](../engine/scene-launcher.js) | Turns a recipe into a plan and drives `window.mana`: base quick start, party mask, warp or door, flags, event request. Every temporary cartridge write is restored. |
| [`scenes.html`](../scenes.html) | Viewer and live debugger. |
| [`tools/scenes/cli.mjs`](../tools/scenes/cli.mjs) | Terminal crawler, coverage report and test runner. |
| [`tests/browser/scenes.spec.mjs`](../tests/browser/scenes.spec.mjs) | Generic Playwright harness that loads any scene. |

## Node types (IRIs)

`event:4e1` · `text:a73f5` (a text-run address) · `map:246` · `door:3fc` ·
`flag:4e` (`$CF4E`) · `scene:<id>` · `code:engine/story-events.js:120` ·
`start:<quick start>` · `test:<spec>`. Ids are hex, except map numbers, which
are decimal like the ROM tables and `tools/qa/map-names.json`.

Relations: `says`, `jumps`, `calls`, `branches` (with `when` = flag range),
`opens-door`, `enters`, `writes`, `reads`, `object`, `trigger`, `on-enter`,
`exit`, `ki-barrier`, `references` (code → node), `root`, `contains`, `in`,
`next`, `requires`, `chapter`, `implemented-by`, `tested-by`, `launches-from`
and `within`. Every link also has a backlink.

Derived rules:

- **Opcodes**: `10–17` jump, `18–1B` door, `20–27` call, `42` flag-range branch with an embedded jump/call/door, `41–4E` other 6-byte conditionals, `29/2A/30` flag inc/dec/set, `2B/2C` party. The semantics are cross-checked with Moppu's randomizer `EventCommandEnum` and every opcode the ROM uses.
- **Event kind**: `empty`, `utility` (no text or side effects), `dialogue`, `service` (inn/shop/cannon/save selectors), `reward` (short text shared by 3+ callers), `cutscene` or `script`. Authored scripts in END-only slots are classified from their authored bytes.
- **Map ownership**: forward closure from a map's own objects and triggers through jumps, calls and branches. It stops at utility routines called from 6+ places.
- **Scene membership**: a scene's root events plus their closure, stopping at utility routines and at other scenes' roots. Events no curated scene owns go into a derived `scene:area-<map>` (ambient NPC talk, services and door scripts), so `enumerate(graph,'scene')` is total.
- **Execution tracing**: `eventAtPointer(graph, pointer)` maps the native interpreter pointer (`$D1–$D3`, active while `$D0` is set) back to the ROM event it is running. Relocated mod scripts report themselves via `mod.story.status.lastEvent`. The viewer, launcher and harness use both.
- **Code references**: hex literals in event-shaped contexts (`events.set(0x…`, `request(0x…`, `route(…`, `F.theft`, `endingEvents.kai`, …) and 5-digit text addresses. The source crawl starts at `index.html` and `scenes.html`, then follows `<script src>` and ES imports.

`npm run scenes -- coverage` prints the live totals. `tests/scene-graph.test.mjs`
fails if any cutscene, script, reward or authored event lacks a curated scene,
or if an authored text key is not a real text-run address.

## Terminal

```sh
npm run scenes -- list [--chapter frieza-arc] [--kind boss]
npm run scenes -- show goblin-pot          # notes, links, launch plan
npm run scenes -- show 4e8 --variant "party 0" [--text]   # script, ROM vs authored
npm run scenes -- crawl scene:sunken-continent --rels next --depth 30
npm run scenes -- crawl flag:4e --back --rels writes,reads
npm run scenes -- coverage [--all]
npm run scenes -- validate                 # catalog integrity (also in npm test)
npm run scenes -- format                   # canonical one-scene-per-line layout
npm run scenes -- export                   # .local/scene-graph/ (private: contains ROM text)
npm run scenes -- url goblin-pot
node tools/scenes/transcript.mjs           # per-scene compiled dialogue, every party/crisis variant (private)
npm run scenes -- test goblin-pot          # or chapter:<id>, or all
```

The CLI reads `.local/rom/secret-of-mana-us.sfc` (override with `SOM_ROM`).
Cartridge text appears only in the terminal or under ignored `.local/`.

## Viewer and debugger

Run `npm run dev` and open <http://127.0.0.1:5173/scenes.html>. It finds the
local ROM the same way the player does, or you can choose a file. It crawls in
about 50 ms in the browser.

- The left pane lists scenes by chapter, then derived map areas. Search matches titles, notes and linked IRIs. Typing `4e1`, `a73f5`, `246` or `flag:4e` jumps straight to that node.
- The centre pane shows any node. Scenes show their notes, launch plan, events (kind, text runs, flags written, maps, code) and grouped links. Events show their script, with original ROM text, authored overlays and a variant selector (each party mask, crisis, bad-ending reason). Maps show objects with visibility flags and doors. Code nodes show the source around the line.
- The right pane runs the player in an iframe and polls `window.mana`. It shows the current map and the executing event (both linked) and keeps an event trace tagged with each event's scenes, highlighting the current scene in the tree. It shows the selected scene's flags as live editable values. Buttons: pause/play, step 1/60 frames, mash B, snapshot/restore, request the selected event, travel through a door, warp to a map.
- **Launch in player** loads `?scene=<id>`. **Launch from current game state** applies the recipe without resetting.

The player accepts `?scene=<id>` directly (for example
`/?scene=northtown-ruins`) and exposes `mana.scenes.launch(id,{base:'current'})`.
These are testing presets in the same spirit as `?start=`. Normal runs never
seed flags.

## Launch recipes

```json
"launch":{"start":"sword","fixture":true,"map":402,"x":66,"y":27,"layer":1,
  "flags":{"2d":4},"event":"555","npc":172,"expect":{"flag":{"2d":5}}}
```

`start` is a quick-start base (`sword`, `late`, `fortress`, `frieza`, `battle`,
`orbit`, `beast`, `good-ending`, …). When a quick start already lands on the
scene, use `"request":false` and no destination. Without `x`/`y`/`door`, the
plan derives an entrance door from the ROM door table, preferring doors that
another map's trigger actually uses. Without `flags`, it raises the root
object's visibility flag to its minimum. `fixture:true` makes Playwright start
from the private mid-game party `.local/graphics-audit/party.json` when that
file exists. `manual` scenes carry a note explaining how to reach them.
`expect` is asserted by the harness.

## Playwright

```sh
SCENE=goblin-pot npx playwright test tests/browser/scenes.spec.mjs
SCENE=chapter:frieza-arc npx playwright test tests/browser/scenes.spec.mjs
SCENE=all npx playwright test tests/browser/scenes.spec.mjs
```

Without `SCENE`, only the viewer smoke test runs. It checks catalog validity,
total coverage, search and navigation. Each scene test loads the scene, mashes
B until the field is controllable (or the expected flags are reached), saves a
screenshot, and attaches the launch status and the traced events as JSON. A
requested event must actually execute an event owned by the scene, or by a
`next` scene (opt out with `"expect":{"ran":false}`). One browser context is
shared, so quick starts built from the ROM are cached across the batch.

## Adding or fixing a scene

1. `npm run scenes -- coverage --all` lists any event without a scene.
2. Add or edit one line in `engine/scene-catalog.json`: id, chapter, kind, title, root `events`, `maps`, `next`, notes and dialogue notes. Paraphrase; never paste cartridge text.
3. `npm run scenes -- format && npm run scenes -- validate && npm test`.
4. `npm run scenes -- test <id>` to confirm the launch recipe.

## Dialogue review and fixes

The same graph drives dialogue review. All outputs that quote cartridge text
stay under `.local/`.

1. `node tools/scenes/transcript.mjs` writes per-chapter transcripts. Each
   scene's events are compiled exactly as the runtime would show them, for
   every party mask, crisis state, theft variant and ending.
2. Proposals are JSON lists of `{event, at, table, value}`. `at` is a text-run
   address from `npm run scenes -- show <event> --text`. `table` is
   `storyDialogue` (every party), `partyDialogue` (`[solo, +Primm, +Popoi,
   both]`, where `null` keeps the line and `""` removes it) or `crisisDialogue`.
3. `node tools/scenes/preview-edits.mjs <proposal.json>` renders each touched
   event's pages through the real compiler for all four parties. It checks
   glyphs, the 28-column width and 3-line pages.
4. `node tools/scenes/rewrite-tables.mjs` edits addresses that already have an
   authored entry in place (story, scene, party or crisis tables), following
   the compiler's precedence. `node tools/scenes/apply-edits.mjs` adds the
   rest to [`engine/retail-dialogue.js`](../engine/retail-dialogue.js). That
   table holds adaptations of retail lines no earlier pass had rewritten, and
   the compiler checks it first. Each address lives in exactly one table.
   `npm test` fails if an entry is not a real text run, or if it targets an
   event that never compiles (`nativeOnlyEvents`). Those events use
   same-length patches in `engine/dialogue-patches.js`.

### Character names

Authored text never spells a player-named character. It uses the native name
codes, as retail text does: `{1}` is the girl (Primm), `{2}` the sprite
(Popoi) and `{3}` the boy the player named on the title screen (retail Randi).
Goku is fixed, so lines use `GOKU` directly, and `{0}` is also GOKU after the
crash. A speaker label is written `{1}:`; the compiler drops it like
`PRIMM:` when she is absent. Layout and the 28-column check count a code at
the six-letter maximum. [`engine/native-names.js`](../engine/native-names.js)
keeps the boy's name in the unused tail of Goku's name slot. Native saves keep
it there. The module also serves a name the player never entered as its retail
default. Overlay text (King Kai's radio, finale prompts) resolves the same codes
through `radioPixels(rom, text, ram)`.
