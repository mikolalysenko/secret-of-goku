# Credits and sources

Secret of Goku is an unofficial browser fan conversion. Game artwork and character designs retain their original ownership. Source attribution does not relicense game assets.

## Original game and extracted maps

**Secret of Mana / Seiken Densetsu 2 — Square, 1993.**

The runtime Potos, interior, cave and overworld PNGs prefixed `rom-`, and `assets/data/potos-rom.json`, were decoded directly from the user-supplied US ROM. These research extractions are retained with the archived prototype, and are not shipped in the hosted demo. The main game decodes maps from the locally selected ROM. No game ROM is included in the repository or static build. See [ROM research](docs/rom-research.md) for decoding and validation.

Goku's charge, beam, impact and aura reuse original **Lucent Beam, Thunderbolt and Lucid Barrier** artwork and palette cycles decoded from that same ROM. `engine/native-effects.json` contains only extraction descriptors and provenance. See [native effects](docs/native-effects.md). The new attack choreography, branching lightning paths and gold ki palette combination are authored adaptations of that original art; Kamehameha remains blue.

The arrival crater reuses the original Potos hole (map131, foreground piece15, metatiles369–374, palette24), decoded at runtime with surrounding turf omitted. The new gold GOKU title silhouettes are project-authored pixel lettering; the title palette, “Secret of” artwork, and extended programmer credit font come from the original game. The new arrival dialogue and scene choreography are authored for this conversion and execute through the original event/dialogue systems.

Reference rips retained under `assets/maps/` helped verify coordinate alignment and the extracted images:

- [Potos Village, Davy Jones / Davias](https://www.spriters-resource.com/snes/secretofmana/asset/54501/).
- [Potos interiors, Barack Obama](https://www.spriters-resource.com/snes/secretofmana/asset/130072/).
- [Potos cave](https://www.spriters-resource.com/snes/secretofmana/asset/130628/).
- [Secret of Mana maps, Rick N. Bruns / SNES Maps](https://www.snesmaps.com/maps/SecretOfMana/SecretOfManaMapSelect.html): Potos, the opening path, and overworld reference.

## Character and enemy sheets

Original downloaded sheets and their embedded credit blocks are preserved in `assets/source/`. `scripts/prepare-assets.mjs` removes flat background colors into `assets/sprites/`; runtime animation selects sheet rectangles.

`engine/goku-animation-data.js` catalogs the supplied sheets' occupied cells, four direction rows, pivots and hand positions. Animation timings, combo sequencing, fall/recovery adaptations, projectile motion and transformation choreography are authored for this conversion; they are not a reconstruction of Buu's Fury's animation engine. No generated replacement character pixels are used.

- **Goku** — Dragon Ball Z: Buu's Fury, Webfoot Technologies / Atari. [Goku sheet](https://www.spriters-resource.com/game_boy_advance/dbzbuusfury/asset/47770/), original listing Mister Man; the currently downloaded sheet credits **SpYn_**.
- **Super Saiyan Goku** — same game. [Sheet by SpYn_](https://www.spriters-resource.com/game_boy_advance/dbzbuusfury/asset/509009/).
- **Secret of Mana NPCs** — [sheet by Davias](https://www.spriters-resource.com/snes/secretofmana/asset/40853/).
- **Secret of Mana named characters** — [sheet by Davias](https://www.spriters-resource.com/snes/secretofmana/asset/40854/).
- **Mantis Ant** — [sheet by Thanwe](https://www.spriters-resource.com/snes/secretofmana/asset/1503/).
- **Rabite** — [Secret of Mana sheet](https://www.spriters-resource.com/snes/secretofmana/asset/54947/), embedded sheet credit retained in the source image.

Dragon Ball characters originate with Akira Toriyama / Bird Studio and their respective rights holders. The original game supplies the main game's dialogue, music and interface, apart from the new arrival conversation and bounded player reactions described above. Goku combat/rendering hooks were authored for this project. The earlier JavaScript prototype is retained locally for research.

## Code and technical references

The Japanese Kamehameha voice is adapted from [“Son Goku - Kame Hame Ha [Original]”](https://www.tonosfrikis.com/melodias/movil/son_goku_kame_hame_ha_original_944.html), a Japanese Dragon Ball performance shared by **Carlos** on TonosFrikis on 2014-06-05. The listing does not identify the original episode or recording. `assets/audio/kamehameha-jp.json` records the source checksum, cut points and processing. A continuous charge excerpt retains the vowels; a separate shout starts on release. Pitch-preserving slowdown, gentle noise reduction, EQ, compression and edge fades are reproducible with `scripts/prepare-kamehameha-audio.mjs` and a local source file. Voice rights remain with their respective owners; attribution does not grant a new asset license.

The Senzu Bean icon and browser-control SVG pictograms are original project artwork.

- [SnesJs — angelo_wf](https://github.com/angelo-wf/SnesJs/tree/b904fdb63be15dc0470b69091622ba5b1bde7275), pinned at `b904fdb63be15dc0470b69091622ba5b1bde7275`. Unmodified core under `vendor/snes/`; the OBJ evaluator adapted in `engine/sprite-layer.js` also retains this MIT attribution; [MIT license](vendor/snes/LICENSE.txt). Browser mod and wrapper code are separate under `engine/`.
- [SecretOfManaRandomizer — Moppleton / Moppu](https://github.com/Moppu/SecretOfManaRandomizer/tree/1404b7bd8552677399f24632c1e37cba37d491ef), pinned at `1404b7bd8552677399f24632c1e37cba37d491ef`. Map/event format adaptations under `tools/rom/`; [notice](tools/rom/NOTICE.md) and [LGPL-2.1 license](tools/rom/COPYING.LESSER).
- [smkerz / secret-of-mana-hacking](https://github.com/smkerz/secret-of-mana-hacking), [Hack of Mana](https://hackofmana.com/maps/), and the [Super Famicom Development Wiki](https://wiki.superfamicom.org/seiken-densetsu-2), cross-checked against the supplied ROM and live emulator state.

The main game uses the original ROM font and graphics. Browser controls use system fonts. The developer lab and archived prototype retain Cinzel/DM Sans with local fallbacks.

The original `FastWhipPosts.cs` and `ElementSwaps.cs` in the pinned Randomizer reference helped locate whip-post descriptors and elemental-orb events. The browser adapters were separately implemented and checked against the user ROM's event interpreter and live RAM.
