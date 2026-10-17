# Ending module (finale cinematics and planet views)

Spoilers. Part of the [SNES port](plan.md); build and harness in
[snes-rom.md](../snes-rom.md). Sources: `snes/src/modules/ending/`,
`snes/gen/ending.mjs` (+ `ending-art.mjs`), tests in `snes/test/ending/`.

Browser sources ported: `engine/shenron-ending.js`, `wish-flight.js`,
`ending-departure.js`, `kai-planet.js`, `planet-view.js`,
`planet-fragments.js`, `boss-rush-death.js`, `ending-events.js`,
`ending-rules.js`.

## How the scenes run

Every scene runs **inside the native field loop**: `ending_frame` after the
game's logic and OAM build (`modules_field_frame`, last in the list) and
`ending_nmi` in vblank after the game's uploads (`modules_field_nmi`). The
event interpreter, its waits and the native dialogue (BG3) keep running, as
in the browser, where the picture is composited under the dialogue.

A **full-screen** scene (King Kai's planet, globes, Shenron's vista, wish
flight) owns:

- BG1, BG2 and OBJ. Native sprites are hidden: the module writes all 128
  OAM entries of the game's buffer and closes core's module area
  (`core_oam_cursor = $200`).
- VRAM `$0000-$3FFF` and `$5000-$57FF` (the native BG tiles and maps). The
  game's BG row/column streaming (`$2E/$2F`, C0:C692) and animated-tile
  requests (`$90`/`$9A` bit 7, C0:C306/C339) are dropped each frame while the
  scene owns the picture; the game's clocks keep running. OBJ name base is
  moved into that VRAM, so the game's actor streaming into `$6000-$7FFF`
  (C1:950D) cannot touch scene sprites. BG3's tiles (`$4000-$4FFF`) and maps
  (`$5800`/`$5C00`, see `$E8` bit 0) are never touched.
- The CGRAM ranges it declares (BG palettes 1-7, OBJ palettes it uses,
  backdrop). BG3 uses palettes 0-3 (CGRAM 0-15) and is left alone.
- PPU registers except BG3's, rewritten every vblank from a shadow block.
- HDMA channel 5 (`$2C` bit 5): TM is rewritten at line 170 so dialogue
  stays above the picture only where the browser keeps it (y < 170); the
  HUD rows below are hidden.

While a scene's art is uploading, its layers are off (TM = 0) over a black
backdrop and the phase clock is held; the NMI hook may then overrun vblank
(still force-blanked by the field NMI until `C0:C15F`), which only delays
the display of a black frame. Otherwise uploads stop at the end of vblank
(`core_vblank_lines`).

A native map load during a scene (detected by `$DC`) ends it quietly: the
map loader has already written every PPU register (02:AAB3, 01:FD5B, from
the shadows `$20-$23`, `$91`). An explicit stop on the same map restores
the field values once from those shadows.

Fades (dim, brighten, departure white/black) are applied to the scene's
own colours only, per channel, from 33-level ROM curves
(`ending_fade_dark/white`); whole-screen fades (transition, death fade) are
a ceiling on the game's brightness shadow `$E6`.

## API (JSL, any M/X; story/combat/world modules call these)

| Entry | Use |
| --- | --- |
| `ending_begin` | Event 42F. A (low byte) = `!EF_*` flags: bit0 bad outcome, bit1 Dryad's eighth Ball, bit2 permanent Super Saiyan. Starts `transition` (good) or `doomed` (bad). |
| `ending_event` | A16 = native event id when one starts: 6B, A3-A6, 14F, 176, DE, E4 map to phases as `native-story.js` does (bad outcome remaps A3/A4/A5 to explode/escape/kai). |
| `ending_cue` | A (low byte) = phase id, applied next frame. |
| `ending_lose` | Finale death (`boss-rush-death.js`). A: bit3 died as Super Saiyan, bit4 died in orbit. |
| `ending_stop` | Release the picture. |

WRAM block `!RAM_ORBIT+$80`: `!ending_request`, `!ending_phase`,
`!ending_age` (word, frames in the phase), `!ending_flags`,
`!ending_done` (bit n set when phase n's timeline finished — event scripts
can wait on it instead of a fixed `28 nn` wait), `!ending_status`
(`!ES_ACTIVE`, `!ES_NATIVEBOY` (do not substitute Goku for the boy actor:
Randi is native in the village/departure), `!ES_MUTED` (silence native
music), `!ES_AIRBORNE`, `!ES_CHARGING`, `!ES_COMPLETE`, `!ES_DEFEATED`,
`!ES_LOADING`), `!ending_sfx` (sound cue for the audio module).

Phase ids: 1 transition, 2 summon, 3 dragon, 4 wish, 5 scatter, 6 reunion,
7 village, 8 depart, 9 kai, 10 complete, 11 doomed, 12 explode, 13 escape,
14 fatal.

## Scenes

### King Kai's planet (`kai`, `complete`) — complete

`kai-planet.js` / `planet-view.js kaiPlanet`. The backdrop is
`kai-planet.png` at 256x224 (the browser's nearest-neighbour resize),
reduced to 740 distinct 8x8 blocks by merging the most similar ones and
fitted to six BG palettes (`makeBgFit`, iterative tile/palette k-means;
mean channel error 5/255 against the source picture). BG1 map `$3800`,
tiles from `$0000`; the end card (`native-radio.js` window and font at
(8,14), the browser's own wording) is BG2 (`$3C00`, palette 7, priority)
shown at `complete`, where BG3 is hidden as in the browser.

King Kai, Bubbles and Goku are 32x32 actors made of four 16x16 OBJ cells
(OBJ base `$4000`, cells from tile `$100` at `$5000`); a pose change uploads
512 bytes. King Kai: poses 0/1 alternating every 28 frames (good), 2
(bad), 3 at `complete`. Goku: base form, Super Saiyan in the bad ending
when the transformation is permanent; arriving, he appears after frame 5
inside nine one-pixel teleport lines (frames 0-11). Actors are drawn back
to front by y like the browser's sort.

Bubbles is the browser's state machine with integer maths: rest 40
frames, pick a target uniformly on the lawn ellipse (angle/radius tables,
16-bit LCG), reject targets within 12 px or whose 16-point route leaves the
lawn or passes within 14 px of King Kai or Goku, walk 0.42 px/frame (8.8
fixed point, frame count from the route length), rest 35-134 frames, face
by the dominant axis, walk frame `(step/9) % 4`. Deterministic, not
bit-identical to the browser's floating-point walk.

Good arrival fades in over 32 frames; `complete` hides the game's input
(`core_pad_mask`), so nothing can walk off-screen under "THE END".

Test: `snes/test/ending/kai.lua` cues both outcomes on the bad-ending
preset's map; stills match the browser composition (rendered from the same
assets and formulas, `reference.mjs`) at 93% of pixels within 24/255 per
channel; no lag frames during the fade; Bubbles stays on the lawn.

### Other scenes

Shenron's vista, the wish flight, the village/departure, the doomed globe,
explosion, death sequence and the Fortress cutaway are being ported in this
order; until then their phases hold a black picture so the event script
keeps running (`stubs.asm`). The `transition` fade is complete.

## Resources

| Resource | Use |
| --- | --- |
| Code | `$A9:8000-FFFF` |
| Data | `$E9:0000-7FFF`, `$EC:0000-7FFF` (King Kai: 49 KiB so far); `$ED-$EF:0000-7FFF` reserved for the remaining art |
| WRAM | `!RAM_ORBIT+$80..$93` |
| SRAM | `!SRAM_WORK_SCENE` (`$32:6000-7FFF`) while a scene runs (state, palettes, queue, HDMA tables, buffers) |
| HDMA | channel 5 while a full-screen scene shows dialogue |

## Core requests

- Run `ending_frame` last in `modules_field_frame` (it may take every OAM
  slot) and reject other modules' sprites while `!ending_status & ES_ACTIVE`
  with a full-screen scene (they cannot fit anyway: the module area is
  closed).
- Document `$2E/$2F/$90/$9A` and the `$20-$23`/`$91` shadows in engine.md.

## Testing notes

Mesen's screenshots trail the emulated state by about two frames; tests
wait for still frames before capturing.
