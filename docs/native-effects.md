# Original spell artwork for Goku

The charge, beam, punch burst and Super Saiyan aura use 34 original spell OBJ cells decoded from the loaded US ROM. `engine/native-effects.json` contains offsets, assembly descriptors, palette rotations and capture provenance, not game graphics bytes. `engine/native-effects.js` decodes them when a verified ROM is loaded.

| Group | Cells | Original spell |
| --- | ---: | --- |
| Charge orb | 5 | Lucent Beam |
| Beam strip | 2 | Lucent Beam |
| Beam head | 3 | Lucent Beam |
| Impact spark | 6 | Lucent Beam |
| Lightning | 3 | Thunderbolt |
| Lightning impact | 6 | Thunderbolt |
| Gold spark | 4 | Lucid Barrier |
| Gold arc | 5 | Lucid Barrier |

Kamehameha is new choreography assembled from these cells. It is not an original Secret of Mana spell. The gold beam reuses the native Lucid Barrier palette on Lucent Beam's cells. Quarter turns and repeated 16×4 beam strips preserve the original pixels; no smooth scaling, browser gradients or glow is used. Aura arcs and sparks keep the discrete native palette cycle. The physical punch's burst reuses Lucent Beam impact art, not a claimed original sword-hit animation.

## Recovered format

The verified unheadered US ROM has SHA-256 `4c15013131351e694e05f22e38bb1b3e4031dedac77ec75abecebe8520d82d5f`. All manifest offsets are PC file offsets.

Each 8×8 effect tile contains 24 bytes: three bytes per row, called `a`, `b`, `c`. The four output SNES bitplanes are:

```text
P0 = ~a & 255
P1 = a ^ b
P2 = ~c & (a ^ b)
P3 = (a & b) ^ c
```

Pixel x takes bit `7-x` from each plane. Index zero is transparent. Four tiles form a 16×16 OBJ cell; null tile offsets denote transparent cells. This differs from ordinary planar SNES 3bpp.

The transform was recovered by tracing original writes to `$7E3000..$7E3FFF` and matching the inverse transform to ROM bytes. Expansion executes around `C1:C731..C1:C891`, with the captured DMA path around `C1:99FF..C1:9B91`. One observed path expands PC `$14BA00` into WRAM `$3800`, then uploads to VRAM word address `$7680`. The per-tile manifest offsets are authoritative.

Selected pixels use palette indices 6–10. Their five little-endian BGR555 colors come from the descriptor's palette offset and rotation. Lucent Beam uses `$11FC40` and flash variants `$11FCB8/$11FC90`; Thunderbolt uses `$11FBA0/$11FBAA/$11FBB4`; Lucid Barrier includes `$11FBFA`. The complete shared OBJ palette is assembled dynamically by the original engine.

All selected native OAM cells use OBJ palette 0 and priority 3. Their markers `$86..$8A` exclude OBJ color math. The compositor therefore uses marker `$86` and priority 3 for spell pixels, independently of Goku's body palette. Water's palette 5 still applies to his body. Native background priority, windows and brightness act on the result.

## Verification

All 34 decoded cells were compared with independently captured original 4bpp VRAM tiles and CGRAM values, not another invocation of the custom decoder. The resulting 256×48 RGBA atlas has SHA-256 `9c2d79bdf8ab8f513a1bfec54a87a98d009a9f2cd9858a3fe4308094cce621f2`. The local-ROM regression test checks that hash. Synthetic tests cover bit order, bounds, transparency, exact rotations, native OBJ markers, and menu suppression.

```sh
npm test
node tools/qa/effects-audit.mjs
```

The browser audit uses actual attack hold/release inputs for both forms in all four directions, then opens a ring to verify effects cancel. Screenshots and the report are written to `.local/graphics-audit/effects/`. Optional `--state`, `--url`, and `--out` select a diagnostic ground checkpoint, server, and destination.

Private research captures and scripts remain in `.local/effects-research/`; no ROM or captured spell pixels are shipped. The original spell table is at PC `$102AA0`, with 64-byte records. The research cast original spell IDs `$13`, `$28`, `$29` using a private native party fixture; target selection was temporarily redirected for capture, while effect bytecode, graphics and palettes stayed original.

Primary format leads came from [SecretOfManaRandomizer](https://github.com/Moppu/SecretOfManaRandomizer/tree/1404b7bd8552677399f24632c1e37cba37d491ef) and the [Super Famicom notes](https://wiki.superfamicom.org/seiken-densetsu-2). The transform and pixel matches above were recovered from execution of the supplied ROM. This is a bounded reverse engineering result, not a full game decompilation.
