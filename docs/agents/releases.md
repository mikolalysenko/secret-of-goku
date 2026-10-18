# Native builds and releases

This is a vibe coded fan game, not intended for commercial purposes. Original code remains under its existing license; third-party assets and the supplied ROM retain their original ownership. The maintainer authorized committing `rom/secret-of-mana-us.sfc` for self-contained Pages and native builds. Keep other ROM copies, packaged downloads, captures, private fixtures and audit output out of Git.

## Local release

Use Node.js 22.12 or newer and `npm ci`. The verified cartridge is included in the release source:

```sh
npm test
npm run release
```

`release` builds for the current OS/architecture and **always bundles the actual verified ROM**. It stops on a missing or mismatched ROM. `.smc` and 512-byte copier headers are accepted; use `rom:import` first for ZIP input. It does not push, tag or publish anything.

```sh
npm run release -- --platform linux --arch x64
npm run release -- --platform linux --arch x64 --profile steam-deck
npm run release -- --platform linux --arch x64 --profile bazzite
npm run release -- --platform windows --arch x64
npm run release -- --platform mac --arch arm64
npm run release -- --platform mac --arch x64
```

Linux creates AppImage and tar.gz files; Windows creates a ZIP containing an executable and its runtime; macOS creates a ZIP containing the application bundle. Steam Deck and Bazzite are explicit Linux x64 profiles that start fullscreen; the desktop profile also detects SteamDeck/gamescope. The three profiles share the same app ID and save location. See [player instructions](../../desktop/PLAYING.md) for controls and Steam setup.

The [installed Bazzite Steam box](bazzite-steam.md) uses a per-game `env -u LD_PRELOAD %command% --ozone-platform=x11` launch option. Its Steam overlay library crashed during Electron 44.8.0 startup; removing that preload was verified in the live gamescope session. The deployment notes include its artwork, controller template and update paths.

Build macOS on macOS and AppImages on Linux. `--archive-only` creates only a tar.gz or ZIP and allows cross-packaging Linux and Windows from this Mac without Wine, Docker or an installer compiler. Cross-packaging is not evidence of native runtime testing. macOS signing/notarization requires maintainer credentials; Windows ZIPs are unsigned. No credentials are required for local archives.

Output is ignored under `release/<version>/<profile>-<platform>-<arch>/`. Each directory contains archives and `SHA256SUMS`; distribute those files only, not builder debug/config files. The ignored `.local/desktop/` staging area and the browser `dist/` build both include the verified tracked ROM. A repeated release replaces only that target's stage/output.

`--rom /absolute/path/to/game.sfc` overrides the default `rom/secret-of-mana-us.sfc`. The optional `RELEASE_ROM_URL` fallback still supports a private direct HTTPS URL if that override is missing; the downloader checks size and SHA-256 and does not print the URL. Normal local and CI builds need no ROM secret. The shared web build also validates the tracked cartridge.

## Desktop development and verification

```sh
npm run desktop:start
npm run desktop:prepare
npm run test:desktop
```

`desktop:start` rebuilds/stages before launching. `test:desktop` disables network access, uses a temporary profile and verifies bundled-ROM startup, title rendering, sandboxing, controller-friendly audio, native SRAM and IndexedDB checkpoint persistence through two launches, including the F5/F9 shortcuts. It does not touch personal saves. Pass `--app <stage-directory>` to test another staged profile, or `--executable <packaged-executable>` to test the final app. On headless Linux use `xvfb-run -a`. A real controller, suspend/resume and Gaming Mode performance still require hardware QA on a Deck/Bazzite machine.

## GitHub Actions

The manually dispatched **Native releases** workflow builds on Ubuntu 22.04, Windows, Apple silicon macOS and Intel macOS. Every job bundles the cartridge from the same source commit and tests its packaged app before uploading archives.

Optional macOS signing secrets: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. Without them the builder creates an unsigned/ad-hoc local app. Signing and notarization have not been validated without real credentials.

Update `package.json` and `package-lock.json` to the release version first. Dispatch from the intended commit. The default run only creates Actions artifacts. Enable `draft_release` to assemble archives, regenerate combined checksums, and create a **draft** GitHub release tagged `v<package version>`. Existing tags/releases are not overwritten; review the draft before publishing. The workflow never automatically publishes a public release.

## Standalone SNES patch

The cartridge port has its own `snes-v<version>` preview releases and source
branch, `snes-port`. These are separate from the `v0.2.x` desktop packages.
Build a patch-only package with:

```sh
node --test snes/test/ips.test.mjs
node snes/release.mjs --version=0.1.0-preview.1
```

The packager performs a strict cartridge build, generates a standard IPS,
and checks that both the raw patch and the patch extracted from the ZIP
reproduce the 8 MiB output byte for byte. It includes base-ROM hashes,
SNES controls, credits, output hashes and the preview's known limitations.
`release/snes/<version>/` remains ignored. A dirty checkout is labeled as a
local preview: commit the source and rerun before uploading. The packager
does not tag, push or publish anything.

For the initial preview, an independent application with RomPatcher.js
`3183884086825c3a57c72026234debcef1e2240c` also reproduced the cartridge.
Its Mesen screenshots are native 256×224 PNGs captured from this ROM, not
the browser edition. Raw captures and submission drafts stay under
`.local/romhacking/`; selected images can accompany the GitHub release.
Publish the IPS, ZIP, checksums, README and selected PNGs, never the `.sfc`,
`.sym`, fixture or savestate files. The release and Romhacking.net listing
must identify this as a preview and disclose remaining crowded-scene
slowdowns. Only the maintainer submits the Romhacking.net form.

## Code map

| File | Responsibility |
| --- | --- |
| `desktop/main.mjs` | Native window, secure local protocol, link handling, persistent profile and fullscreen |
| `desktop/runtime.mjs` | Pure URL/path validation and launch policy |
| `desktop/player.css` | Game-only presentation; hides all shared web controls and overlays in packaged builds |
| `desktop/linux/*.sh` | Portable PC, Steam Deck and Bazzite launchers; paths with spaces supported |
| `scripts/release.mjs` | CLI orchestration: validate ROM, build, stage, package, checksum |
| `scripts/release-lib.mjs` | Target validation, bounded private ROM fetch, explicit packaged-file list |
| `scripts/assemble-release.mjs` | Collect workflow archives, reject duplicate filenames, write combined checksums |
| `tests/desktop.test.mjs`, `tests/release.test.mjs` | Origin boundaries, profile validation, ROM failure paths and archive checksums |
| `tests/desktop/smoke.mjs` | Runtime and save persistence checks against staged or packaged apps |

The game runs at `goku://game/` with a standard secure origin so fetch, Web Crypto, workers, audio and persistent browser storage work offline. Renderer Node integration is disabled; context isolation, the Chromium sandbox and a local-only CSP stay enabled. No preload bridge, listening server, updater, Steam credentials or Proton dependency is introduced.

`engine/rom-loader.js` allows up to 60 seconds for a packaged ROM read and 30 seconds for a browser download. This accommodates cold Intel apps under Rosetta and slower phone connections while still bounding stalled requests.

Implementation references: [Electron protocol](https://www.electronjs.org/docs/latest/api/protocol), [Electron web preferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences), [electron-builder Linux targets](https://www.electron.build/linux/), [GitHub runner architectures](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [Bazzite game launchers](https://docs.bazzite.gg/Gaming/Game_Launchers/).
