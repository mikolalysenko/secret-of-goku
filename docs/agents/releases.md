# Native builds and releases

This is a vibe coded fan game, not intended for commercial purposes. Original code remains under its existing license; third-party assets and the supplied ROM retain their original ownership. Keep ROMs, packaged downloads, captures, private fixtures and audit output out of Git.

## Local release

Use Node.js 22.12 or newer and `npm ci`. Import the local US cartridge once:

```sh
npm run rom:import -- "/path/to/Secret of Mana (USA).sfc"
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

Build macOS on macOS and AppImages on Linux. `--archive-only` creates only a tar.gz or ZIP and allows cross-packaging Linux and Windows from this Mac without Wine, Docker or an installer compiler. Cross-packaging is not evidence of native runtime testing. macOS signing/notarization requires maintainer credentials; Windows ZIPs are unsigned. No credentials are required for local archives.

Output is ignored under `release/<version>/<profile>-<platform>-<arch>/`. Each directory contains archives and `SHA256SUMS`; distribute those files only, not builder debug/config files. The ignored `.local/desktop/` staging area includes the ROM. The browser `dist/` build remains ROM-free. A repeated release replaces only that target's stage/output.

`--rom /absolute/path/to/game.sfc` overrides the local ROM path. If the local file is missing, `RELEASE_ROM_URL` can supply a private direct HTTPS URL to the raw ROM. The downloader checks size and SHA-256 and does not print the URL. Never put the URL in command arguments or Git. A 2 MiB ROM is too large for a GitHub Actions secret; store its private URL, not base64 cartridge data.

## Desktop development and verification

```sh
npm run desktop:start
npm run desktop:prepare
npm run test:desktop
```

`desktop:start` rebuilds/stages before launching. `test:desktop` disables network access, uses a temporary profile and verifies bundled-ROM startup, title rendering, sandboxing, controller-friendly audio, native SRAM and IndexedDB checkpoint persistence through two launches, including the F5/F9 shortcuts. It does not touch personal saves. Pass `--app <stage-directory>` to test another staged profile, or `--executable <packaged-executable>` to test the final app. On headless Linux use `xvfb-run -a`. A real controller, suspend/resume and Gaming Mode performance still require hardware QA on a Deck/Bazzite machine.

## GitHub Actions

The manually dispatched **Native releases** workflow builds on Ubuntu 22.04, Windows, Apple silicon macOS and Intel macOS. It tests each packaged app before uploading archives. Configure the repository Actions secret `RELEASE_ROM_URL` before running it. The public Pages workflow never receives this secret.

Optional macOS signing secrets: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. Without them the builder creates an unsigned/ad-hoc local app. Signing and notarization have not been validated without real credentials.

Update `package.json` and `package-lock.json` to the release version first. Dispatch from the intended commit. The default run only creates Actions artifacts. Enable `draft_release` to assemble archives, regenerate combined checksums, and create a **draft** GitHub release tagged `v<package version>`. Existing tags/releases are not overwritten; review the draft before publishing. The workflow never automatically publishes a public release.

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

`engine/rom-loader.js` allows up to 60 seconds for a packaged ROM read. A cold Intel app running under Rosetta can exceed the browser's four-second download timeout; the web timeout remains unchanged.

Implementation references: [Electron protocol](https://www.electronjs.org/docs/latest/api/protocol), [Electron web preferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences), [electron-builder Linux targets](https://www.electron.build/linux/), [GitHub runner architectures](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [Bazzite game launchers](https://docs.bazzite.gg/Gaming/Game_Launchers/).
