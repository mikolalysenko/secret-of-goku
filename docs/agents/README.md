# Agent and developer documentation

These notes include complete gameplay, story and ending spoilers. The top-level [README](../../README.md) is the public, spoiler-free project overview.

| Start here | Contents |
| --- | --- |
| [Code map](code-map.md) | Runtime subsystems, native hooks and developer entry points |
| [Development](development.md) | Local setup, ROM import, tests, browser build and Pages deployment |
| [Releases](releases.md) | Offline Windows/macOS/Linux packaging, Steam Deck/Bazzite profiles and CI |
| [Changelog](CHANGELOG.md) | Changes and implementation summaries |
| [Gameplay reference](gameplay.md) | Full feature behavior, detailed controls and story/debug starts |
| [README media](readme-media.md) | Spoiler boundaries, capture process and teaser URL |

| Subsystem | Notes |
| --- | --- |
| Emulator and ROM | [Engine lab](engine-lab.md), [Performance and audio streaming](performance.md), [ROM research](rom-research.md) |
| Mobile player | [Fullscreen, Home Screen mode and viewport checks](mobile-fullscreen.md) |
| Combat and presentation | [Combat](combat.md), [Native effects](native-effects.md), [Graphics audit](graphics-audit.md) |
| World traversal | [Dungeon shortcuts](dungeon-shortcuts.md) |
| Story | [Arrival](arrival.md), [Scene tooling](scenes.md), [Story review](story-review.md) |

Read [AGENTS.md](../../AGENTS.md) before changing the project. Commit coherent, validated work and stage only task-owned changes. Keep private ROM copies, raw recordings, test fixtures, generated reports and release archives out of Git. The maintainer-authorized `rom/secret-of-mana-us.sfc` is the only tracked cartridge. Curated public GIFs/title screenshots requested for the README live in `assets/readme/`.

Keep new change summaries and implementation details here. Preserve local links when moving notes. The browser build and native releases include the verified tracked cartridge so players can start without selecting a file.
