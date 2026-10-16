# Development and verification

These instructions cover the browser build. For desktop development and self-contained release packaging, see [releases.md](releases.md). Node.js 22.12 or newer is required.

## Run locally

Use Node.js 22.12 or newer:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. The tracked cartridge loads automatically, as it does in the published Pages build. The manual chooser remains available if a download fails.

## Import and extract

```sh
npm run rom:import -- "/path/to/Secret of Mana (USA).zip"
npm run rom:inspect
npm run rom:extract
npm run assets:prepare
```

Import also accepts `.sfc` and `.smc`, strips a copier header and checks the US ROM hash. ZIP import uses system `unzip`. Original assets are decoded from that ROM: positioned map pieces, both tile layers, metatiles, collision, NPC/door records, event bytes, palettes, map images and the overworld. The main game streams the original data through the emulated SNES rather than flattening the maps into background pictures. [ROM research](rom-research.md) records the verified formats and offsets.

Private ROM copies and analysis dumps are ignored under `.local/`. The maintainer-authorized `rom/secret-of-mana-us.sfc` is the only tracked cartridge. The `/local-rom` fallback endpoint is restricted to the loopback development server and is unavailable in static builds.

## Verify and build

```sh
npm test
npm run test:e2e
npm run build
```

Browser tests use installed Google Chrome through Playwright. Tests requiring the local US ROM skip when it is absent. Coverage includes title changes confined to the two intended regions, native fades, editable BOY naming, bridge pixel parity, the full intro to waterfall control, the new arrival and mid-impact checkpoint replay, input gates, foreground priority, Potos combat/flight, and original Elder/Mantis events. The arrival test also uses the local controller-produced pre-sword fixture. Separate checks prove only the four player text spans and inventory stub change in the cartridge copy; title and arrival adapters do not change its hash.

See [combat and animation](combat.md) for timing, native damage integration and frame-by-frame checks; [graphics audit](graphics-audit.md) for regional coverage; [native effects](native-effects.md) for the spell format; and [Goku's arrival](arrival.md) for the title and sword-event implementation. Reports and screenshots remain local under `.local/`.

`dist/` contains an explicit list of player files, emulator code, mod artwork/audio, credits and the verified `rom/secret-of-mana-us.sfc`. The build rejects a missing or mismatched cartridge and any additional ROM, checkpoint, `.local` or dependency files. It omits extracted map images, the archived prototype and source sprite sheets. Asset paths are relative, so the build works under a GitHub Pages repository subdirectory. Every build versions its script/module URLs and shows a short build ID in the debug footer so updates do not reuse stale control code. Web downloads allow 30 seconds for slower phone connections before offering the manual chooser.

### Publishing

[The Pages workflow](../../.github/workflows/pages.yml) runs `npm ci`, imports the tracked cartridge for tests, runs unit tests and builds the static site, then verifies automatic startup from the actual built ROM, the missing-download fallback and audio. Chromium and WebKit checks cover touch layouts, input, fullscreen fallback and debug visibility. It deploys `dist/` on pushes to `main`; pull requests run the same checks without deploying. In a fork, enable **Settings → Pages → Source: GitHub Actions**, then run the workflow. No private fixture, secret or backend is required for deployment. Story regression tests that need private research fixtures remain local.

This is an unofficial fan project, unaffiliated with the original rights holders. Original wrapper code is MIT; ROM tooling has its own LGPL notice, and third-party artwork/audio are **not** covered by those code licenses. See [LICENSE](../../LICENSE) and [CREDITS.md](../../CREDITS.md).
