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
| Sandship | He volunteers to help for food. Only companions actually aboard can be marked captive. The early cabin shortcut remains available. |
| Northtown, events 555–559 | Goku interrupts Dyluck's possession without kidnapping or adding an absent Primm. The original Vampire fight, reward and exit still run. |
| Joch, Empire and Dryad | Trials emphasize restraint; the damaged Sword explains the Fortress's early awakening. Missing companions are not addressed. |
| Mana Tree, event 5F8 | Randi's family belongs to Randi. The Tree shelters him for the wish and asks Goku to finish the job. Missing companion stand-ins are omitted. |
| Thanatos, events 4E1/42D | Goku coaches the villain into a stronger fight. Dyluck and King Kai explain the aftermath; absent companions and blank confirmation boxes are removed. |
| Restoration, event 42F | Shenron appears, the white flakes are identified as radioactive fallout, and the wish returns Randi alive to Potos. Primm/Popoi only contribute if present. |
| Optional Frieza entrance, events 4A4/A8 | After seven personally collected Balls, calling out to Frieza triggers the theft and a Death Ball into the core. The original sinking-continent flyby follows. Declining keeps the original transition. |
| Five-minute crisis | Frieza, Kai, Luka, Jema and townspeople believe the planet is about to explode. Goku believes the deadline too, but thinks he can finish everything in time. Shops and inns warn him once before their normal service. Jema and the Tree blame Frieza's Death Ball for the roots burning. |
| Frieza finale | Popoi's death triggers permanent Super Saiyan. The stolen Balls return after the fight, but the crisis persists through the Mana Beast. Shenron explicitly repairs the core; only recruited companions return to the party. |

`engine/story-dialogue.js` and `engine/scene-dialogue.js` contain authored
substitutions. `engine/story-compiler.js` preserves native control codes,
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
The inventory contains 751 reviewed native/authored events and 3,004 variants:
545 unchanged NPC/lore/UI events, 150 adapted text events, 49 authored native
events and seven original prologue events. Categories include non-text cue
events, so their total exceeds the original 715 text events.

Unit checks cover speaker continuation, removal of empty windows without
losing commands, party variants, reward markers, valid encoding and pagination.
Real-ROM browser checks exercise capture/escape, elemental rewards, dragon
rescue, Northtown, the Tree, Thanatos and the new ending. Northtown checks all
four parties and an older checkpoint with Primm actually captive. The ending checks all
four party combinations, Potos's living Randi, wish flags and checkpoint replay.

This is a complete dialogue inventory review with targeted native runtime
checks, not four uninterrupted playthroughs of every possible route. Screenshots,
cartridge dialogue, snapshots and research data stay outside the public build.
