# Secret of Goku

Secret of Mana. With Goku.

A vibe coded fan game, not intended for commercial purposes. Unofficial and unaffiliated with the owners of Secret of Mana or Dragon Ball. See CREDITS.md and LICENSE for code and asset attribution.

## Play

These downloads include the runtime, game assets and ROM. Extract the whole archive before playing. No browser, Node.js, ROM picker or internet connection is needed.

- **Windows:** open `Secret of Goku.exe` in the extracted folder.
- **macOS:** open `Secret of Goku.app`. Use the arm64 build for Apple silicon or x64 for Intel. Release signing and notarization depend on the maintainer's signing credentials; unsigned builds may require approval in System Settings → Privacy & Security.
- **Linux PC:** make the AppImage executable and launch it, or extract the tar.gz and run `play.sh`.
- **Steam Deck / Bazzite:** download the matching x64 build in Desktop Mode. Make its AppImage executable, add it to Steam as a non-Steam game, and choose the **Gamepad** controller template. It starts fullscreen in Gaming Mode. Leave Steam's forced compatibility tool disabled. If AppImage/FUSE is unavailable, extract the tar.gz and add `steam-deck.sh` or `bazzite.sh` instead. Keep the extracted folder together.

F11 or Alt+Enter toggles fullscreen. `--windowed` overrides fullscreen launch. Steam Deck and Bazzite builds use the same Linux native runtime and save location as the Linux desktop build. They do not require Proton or an OS package installation.

## Controls

Controller names below use Xbox / Steam Deck labels (physical button positions).

| Action | Keyboard | Controller |
| --- | --- | --- |
| Move / navigate | Arrow keys | D-pad / left stick |
| Punch / talk / confirm | X | A (south) |
| Ki blast | C | X (west) |
| Fly fast | Z + direction | B (east) + direction |
| Ring menu / back | A | Y (north) |
| Focus | Hold Shift | Hold LB |
| Kamehameha | Hold Shift+C, release | Hold LB+X, release |
| Instant Transmission | Shift+X | LB+A |
| Transform / revert | Shift+Z | LB+B |
| World flight | Shift+D | LB+RB |
| Fast-forward dialogue | Hold D | Hold RB |
| Start / resume | Space / Enter | Start / Menu |
| Switch party | S | Select / View |
| Pause | Escape | Right stick click |

The app shows only the game, with no page chrome or controls overlay. Native in-game saves persist between launches. **F5** saves an additional checkpoint; **F9** restores it. Save before quitting; closing the app does not create a checkpoint automatically.

Save data stays in the user profile, independent of the downloaded version:

- Windows: `%APPDATA%/secret-of-goku`
- macOS: `~/Library/Application Support/secret-of-goku`
- Linux / Steam Deck / Bazzite: `${XDG_CONFIG_HOME:-~/.config}/secret-of-goku`

Copy the entire profile directory while the app is closed to back it up. Browser-demo saves are separate.
