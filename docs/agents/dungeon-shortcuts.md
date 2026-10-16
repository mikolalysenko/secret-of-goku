# Dungeon flight and demolition

Hold **Z + arrows** (SNES A + D-pad) to cross low barriers, terraces, lava and
internal chasms. Releasing over a gap leaves Goku hovering until he reaches
usable ground. Companions travel with him across long gaps.

Woodland streams use the same narrow bank pieces as town rivers. Those edges
are flyable on the Potos/Pandora paths and in Upper Land, including where a
lily pad sits beside the bank. The shore check continues past pads to usable
ground; forest walls and outer boundaries remain blocked. Plain and flowering
pads are flyable in the village, woodland, forest and palace tilesets. The
Water Palace uses tiles 173/174; tile 175 is a column base and stays solid.

In Super Saiyan, fully charge **Shift+C** (SNES L+Y) and release toward an
interior wall. A valid breach replaces both original map layers with native
floor tiles and redraws them through the game's own tilemap queue. Goku can
then walk through. Ordinary punches and weaker beams still clear the existing
axe/sword obstacles and operate native switches; they do not demolish these
additional walls.

Debris uses the room's loaded palette. King Kai or Luka reacts to the first
wall breach in each dungeon, with the existing radio cooldown. Routine scenery,
flight and puzzle switches do not repeatedly interrupt play. For example:

> GOKU:Fire exit!
>
> LUKA:That was not an exit.
>
> GOKU:It is now.

## Coverage

The dungeon inventory contains **252 native map IDs in 22 families**. It
includes approach rooms, alternate layouts and arenas, rather than counting
only the rooms with a new shortcut.

| Dungeon family | Map IDs |
| --- | ---: |
| Water Palace and Undine | 11 |
| Pandora Ruins | 8 |
| Gaia's Navel | 10 |
| Haunted Forest and Elinee's Castle | 18 |
| Earth Palace | 6 |
| Kilroy's Ship | 4 |
| Wind Palace | 3 |
| Matango Cave | 7 |
| Ice Palace | 15 |
| Sandship | 9 |
| Fire Palace | 14 |
| Empire Sewers and Castle | 18 |
| Northtown Ruins | 12 |
| Light Palace | 6 |
| Jehk's Trials and Mandala Temple | 6 |
| Shade Palace | 11 |
| Moon Palace | 7 |
| Tasnica Castle | 6 |
| Lost Continent and Subway | 14 |
| Grand Palace | 19 |
| Pure Land | 38 |
| Mana Fortress | 10 |

The geometry audit checks **598 native-loaded layouts**, including cached
conditional piece combinations. Across those layouts it finds 13,160 bounded
flight corridors and 20,534 wall corridors, with no structural violations.
These counts include the same corridor appearing in different story layouts;
they are not counts of unique puzzles or controller playthroughs.

The runtime audit passed **252/252 map checks**, including **196 wall round
trips** and **97 flight round trips** (586 one-way controller crossings).
It loads every listed map through the original dispatcher. In each room with
a standable candidate, it flies the longest accepted gap in
both directions and fires a full beam through a wall, then walks through and
back. Hostile spawns are suppressed to isolate environmental behavior. Native
switches still run: Elinee's maze can rebuild its platforms when hit, so the
audit records that change and tests the resulting geometry rather than forcing
an obsolete tunnel back into it.

A subsequent floor-art refinement prefers nearby open floor over decorative
platform lips. The complete structural audit still passed, and 11 affected
room scenarios plus the dedicated checkpoint test were rerun successfully.

Separate controller regressions cover native gates, whip lanes, axe/sword
obstacles, palace switches, seed rewards, early Undine, the Pure Land gates,
Joch's trial and the rebuilt bridge to Dryad. A dedicated demolition regression
checks the full-charge requirement, both visual layers, unchanged story flags,
walking through the breach and identical checkpoint replay. The broader
[graphics and progression report](graphics-audit.md) describes earlier checks.
This is not an uninterrupted full-game playthrough or a guarantee about every
possible sequence of story flags.

The change also passed 194 unit tests and 55 targeted browser regressions.

## Boundaries and state changes

Geometry comes from the user's cartridge and current native map pieces. The
adapter accepts placed tiles with real floors on opposite sides. It does not
use the rectangular map buffer alone: some unused tails contain boss graphics,
and the map's outer void is not a destination.

Flight permits bounded spans up to 48 metatiles from the tested cell to either
shore. New wall breaches span at most ten wall tiles between floors at the same
terrain height. Door triggers, native layer changes, overpasses and special
event pads are excluded, including triggers encoded with behavior bit `$40`.
Paired visual layers must also be ordinary scenery. Water Palace's lower stair
pockets remain blocked because their foreground would hide Goku.

The moving Karon ferry scenes (33/34), Mana Beast (253), Dread Slime (488) and
Lime Slime (489) retain their existing specialized handlers; their moving or
affine pictures are not treated as dungeon collision grids. Boss and cutscene
locks still apply. Existing authored gate, orb and floor-switch shortcuts use
the original event scripts and preserve progression.

A destroyed wall persists within the current room and its checkpoints.
Leaving and re-entering follows native scenery respawn. After a same-room
puzzle rebuild, a breach is reapplied only if the original wall descriptors
and both destination floors still match. A scene that removes the far platform
also invalidates that old breach.

## Repeat locally

The private ROM and `.local/graphics-audit/party.json` fixture are required.
Start `npm run dev`, then build or refresh the native grid inventory:

```sh
npm run audit:seed
npm run audit:barrier-runtime
npm run audit:barrier-runtime -- --variants
npm run audit:dungeon-geometry
npm run audit:dungeons
npm run test:e2e -- tests/browser/dungeon-demolition.spec.mjs
```

The geometry audit reads `.local/barrier-audit/runtime/` and `variants/`.
It fails on missing dungeon grids, unsupported profiles or unsafe edits.
The runtime tool accepts numeric map IDs, `--workers`, and `--screenshots`;
for example, `npm run audit:dungeons -- --screenshots 139 285 305 346 249`.
Outputs stay under `.local/dungeon-audit/`. ROM data, layouts, screenshots and
checkpoints are excluded from Git and the published player.
