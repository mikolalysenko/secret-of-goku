# Bazzite Steam box

Installed on 2026-10-18 for the `bazzite` user. Secret of Goku has a direct
non-Steam shortcut, a Favorites entry, and custom portrait, wide-card and hero
artwork. Its card appears in Gaming Mode's home carousel after the launch check.

## Installed build

- Source: `656bdb35486863a2594fcd148dc3833a5cab78a1`.
- Package version in that checkout: `0.2.1`; this was freshly built from the
  source above, rather than copied from an older release archive.
- Build: `npm run release -- --platform linux --arch x64 --profile bazzite --archive-only`.
- Archive SHA-256: `54a2263e3b67b6242575bcf0fc52ecadad0053068a5ce55d6ae265737c4aa08c`.
- Installation: `~/Games/secret-of-goku/versions/0.2.1-656bdb3/secret-of-goku-0.2.1-bazzite-x64/`.
- Stable entry point: `~/Games/secret-of-goku/current/bazzite.sh`.
- Desktop entry: `~/.local/share/applications/secret-of-goku.desktop`.
- Saves: `~/.config/secret-of-goku`, independent of the version directory.
- Steam shortcut app ID: `3298096536` (signed VDF value `-996870760`).
- Steam launch ID: `14165216761204441088`.

The tested target is Bazzite `44.20260929.0`, NVIDIA, in a 3840×2160 gamescope
session. The installation uses the native Linux runtime and bundled cartridge.
Forced Proton compatibility remains unset.

## Steam launch workaround

The final per-game Steam launch options are:

```text
env -u LD_PRELOAD %command% --ozone-platform=x11
```

The first Steam launch with Electron 44.8.0 hung before creating a window.
The child-process core dump showed a SIGSEGV in Steam's
`gameoverlayrenderer.so` initialization. Removing the inherited preload for
this shortcut fixed startup. X11 gives the app a fullscreen gamescope window.
This setting disables preload-based overlays for this game; it does not disable
Chromium's sandbox. Keep it when updating this installation.

The normal shortcut contains no debugging port or temporary user-data path.
The isolated verification profiles live under
`~/.local/state/secret-of-goku/install-20261018/`.

## Registration and updates

The desktop entry was added with Bazzite's native
`steamos-add-to-steam ~/.local/share/applications/secret-of-goku.desktop` while
Steam was running. Steam's live APIs set its launch options, icon and artwork;
the resulting `shortcuts.vdf` was read back. Do not edit the binary shortcut file
under a running Steam client.

Steam's `gamepad_joystick.vdf` template is assigned under the `secret of goku`
key in the existing controller config sets. Other mappings were preserved.
Backups of the original shortcuts and controller config sets are under
`~/.local/state/secret-of-goku/install-20261018/`.

To update, extract the next verified Bazzite archive into a new version
directory, validate its executable, and repoint `current` while the game is
closed. Keep the same shortcut and user profile. Release archives, test profiles,
core dumps and screenshots stay outside Git.

## Validation

- Seven desktop/release unit tests passed; the archive checksum matched on the box.
- Two isolated native launches verified offline bundled-ROM startup, title
  rendering, game-only presentation, automatic audio enablement, secure origin,
  absent renderer Node globals, SRAM and F5/F9 checkpoint persistence.
- A Steam launch with an isolated profile verified the same startup checks in
  the real gamescope session; Start input was accepted at the title.
- A subsequent launch with the final options and normal profile produced a
  focused 3840×2160 game window and a readable title framebuffer.
- Steam's home carousel displayed the new artwork. Favorites and all three
  artwork files were read back; the 47 pre-existing shortcuts retained their
  values. Steam only normalized key casing and added an empty `sortas` default
  to one existing entry.
- The previous running game was kept alive. The temporary sleep inhibitor and
  Secret of Goku test processes were stopped after verification.

No physical controller was connected during verification. The gamepad layout
is configured, but physical controller input, audible output at the speakers,
suspend/resume and the TV wall picture were not checked. Local software captures
and test helpers are ignored under `.local/bazzite-install/`.

## Artwork and generation prompts

Generated with the built-in imagegen tool, then visually inspected and saved as:

| Asset | File | Steam artwork type |
| --- | --- | --- |
| Portrait, 1024×1536 | [library-capsule.png](../../assets/steam/library-capsule.png) | Capsule, `0` |
| Wide card, 1834×858 | [library-header.png](../../assets/steam/library-header.png) | Header, `3`; also Hero, `1` |

Artwork was applied with
`SteamClient.Apps.SetCustomArtworkForApp(appid, base64, 'png', type)`, so the
running client refreshed the cards. The shortcut icon uses the existing
`assets/readme/title-screen.png`. API reference:
[Decky Steam client types](https://github.com/SteamDeckHomebrew/decky-frontend-lib/blob/main/src/globals/steam-client/App.ts).

Portrait prompt, with `assets/readme/title-screen.png` as the reference:

> Use case: ads-marketing. Create a portrait Steam library game cover for the fan game Secret of Goku, 2:3 aspect ratio. Input image is a reference for the exact golden Secret of Goku title logo typography, not a screenshot to preserve. Show Goku with black spiky hair and orange martial arts gi, blue undershirt, belt and wristbands, in a lush 16-bit Secret of Mana inspired fantasy forest by a waterfall, with a luminous small blue ki orb in one hand. Beautiful polished classic SNES pixel art, crisp intentional pixels and limited saturated palette. Golden title lettering 'Secret of Goku' large and completely readable in the upper quarter. Full bleed artwork, no border, no credits, no subtitles, no platform logos, no URL, no marketing text, no watermark. Spoiler-free. Keep essential character and logo well inside safe margins. This is the actual game-card image, not a mockup.

Wide-card prompt, with `assets/steam/library-capsule.png` as the reference:

> Use case: ads-marketing. Recompose this Secret of Goku Steam cover into a wide landscape Steam recent-game card, aspect ratio 2.14:1 (about 1840 by 860). The reference image is the exact style, character, scene and title lettering to preserve. Keep the bright polished crisp pixel art, rich fantasy forest and waterfalls, and Goku with black spiky hair and orange gi holding a small glowing blue ki orb. Put Goku on the right half looking toward the waterfalls; show the golden 'Secret of Goku' title large, very legible and fully inside the left half, on a dark lush forest area. Fit the full title, subject upper body and waterfall within the wide landscape canvas without cropping them. Maintain room inside edges for Steam card crops. Full bleed, no border, no other text, no credits, no platform logos, no URL, no watermark. Actual game artwork, not a mockup. Preserve title spelling and visual identity.
