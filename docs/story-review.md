# Goku story review

The review covers all 715 text-bearing events in the supported US cartridge,
including early NPCs, recruitment, elemental rewards, the Empire, Pure Land
and the finale. Goku generally helps the original cast, enjoys strong opponents,
and treats his own excessive strength casually. He does not inherit Randi's
parents, childhood or relationships. Neutral NPC lore, services and the BOY
prologue remain original.

The compiler and authored events produce four variants: Goku alone, with
Primm, with Popoi, and with both. Missing companions neither speak nor acquire
animation waits. Some characters, such as Primm rescuing the goblin camp or
Jema meeting Goku, are genuine scene NPCs and can still appear before joining.

| Sequence | Adaptation |
| --- | --- |
| Potos and Luka | Villagers blame Goku for Randi and the Sword; Luka explains the Dragon Ball restoration plan. |
| Goblin pot, event 4E8 | Goku plays along with the threats, avoids breaking the pot and lets Primm rescue him. The native capture/escape choreography is retained. |
| Pandora, witch and recruitment | Goku learns who Dyluck is from the people involved; he does not assume Primm's relationships. |
| Gnome, Earth and Wind | Solo/partial-party alternatives replace Popoi's servant joke, missing memories and absent Grandpa conversations. Seed rewards and later spell grants remain intact. |
| Flammie | Goku rescues the young dragon while acknowledging he can already fly; the native rescue progresses normally. |
| Sandship | Goku plays along for food and a worthy sparring partner. Confiscating his Heavy Gi removes its training penalty. Captured companions retain their dialogue, the kitchen progresses without Popoi, and flying straight to the cabin reunites only actual captives before Mech Rider. The KAMEHAMEHA breakout wrecks the ship instead: guards flee, monsters board, and Goku fetches each captive himself before Geshtar. |
| Northtown, events 555–559 | Goku interrupts Dyluck's possession without kidnapping or adding an absent Primm. The original Vampire fight, reward and exit still run. |
| Joch, Empire and Dryad | Trials emphasize restraint; the damaged Sword explains the Fortress's early awakening. Missing companions are not addressed. |
| Mana Tree, event 5F8 | Randi's family belongs to Randi. The Tree shelters him for the wish and asks Goku to finish the job. Missing companion stand-ins are omitted. |
| Thanatos, events 4E1/42D | Frieza supplies the ki and makes Thanatos fight Goku for entertainment. Dyluck and King Kai explain the aftermath; absent companions and blank confirmation boxes are removed. |
| Good ending, event 42F | Seven earned Balls, defeated Frieza and the upgraded Beast, and an intact Fortress are required. Shenron repairs the world, including radioactive fallout and craters; Randi returns alive to Potos. Goku leaves for Kai’s planet, where Kai thanks him and asks him to be more careful. Primm/Popoi only contribute if present. |
| Bad ending, event 42F | Destroying the Fortress or skipping the required collection/fights dooms the world. The planet explodes, Goku teleports to Kai’s planet, and Kai scolds him. No wish or emergency collection rescues the run. |
| Mana Beast, events 429/96 | With all seven seeds, Goku feeds their energy to the Beast despite Kai’s protests. The upgraded fight is mandatory. |
| Mainline Frieza entrance, events 4A4/A8 | Frieza interrupts automatically regardless of collected Ball count. Early Fortress visits cannot bypass his appearance. He steals the earned collection and fires a Death Ball; the native sinking-continent flyby follows. |
| Five-minute crisis | Frieza, Kai, Luka, Jema and townspeople believe the planet is about to explode. Goku believes the deadline too, but thinks he can finish everything in time. Shops and inns warn him once before their normal service. Jema and the Tree blame Frieza's Death Ball for the roots burning. |
| Frieza finale | Popoi's death triggers permanent Super Saiyan. The stolen Balls return after the fight, but the crisis persists through the Mana Beast. Shenron explicitly repairs the core; only recruited companions return to the party. |

`engine/story-dialogue.js`, `engine/scene-dialogue.js` and
`engine/retail-dialogue.js` and `engine/sandship-dialogue.js` contain authored substitutions. The last one holds
adaptations of retail lines that earlier passes had left as they were. See
[scenes.md](scenes.md#dialogue-review-and-fixes). `engine/story-compiler.js` preserves native control codes,
choices, actor commands and rewards while compiling party variants.
`engine/story-events.js` supplies scenes that need different choreography.
Rewritten text measures the current window across intervening pauses and actor
animations, so longer fragments wrap without joining words or overrunning a page.

## Reproduce the review

Use the supported, privately supplied ROM at
`.local/rom/secret-of-mana-us.sfc`:

```sh
npm run audit:story
npm test
npx playwright test tests/browser/cutscenes.spec.mjs tests/browser/goku-ending.spec.mjs
npx playwright test tests/browser/story-shortcuts.spec.mjs
npx playwright test tests/browser/frieza.spec.mjs tests/browser/frieza-crisis.spec.mjs
```

The audit validates substitution addresses, glyphs and line widths, then
emits the compiled dialogue for each party into ignored `.local/story-research/`.
The inventory contains 753 reviewed native/authored events and 3,012 variants:
545 unchanged NPC/lore/UI events, 150 adapted text events, 51 authored native
events and seven original prologue events. Categories include non-text cue
events, so their total exceeds the original 715 text events.

Unit checks cover speaker continuation, removal of empty windows without
losing commands, party variants, reward markers, valid encoding and pagination.
Real-ROM browser checks exercise capture/escape, elemental rewards, dragon
rescue, Northtown, the Tree, Thanatos and the new ending. Northtown checks all
four parties and an older checkpoint with Primm actually captive. The ending checks all
four party combinations, Potos's living Randi, wish prerequisites, the farewell on Kai’s planet and checkpoint replay. Bad-route checks cover planet destruction and the absence of a wish.

This is a complete dialogue inventory review with targeted native runtime
checks, not four uninterrupted playthroughs of every possible route. Screenshots,
cartridge dialogue, snapshots and research data stay outside the public build.
