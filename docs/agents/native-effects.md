# Original spell artwork for Goku

The charge, beam, impact and lightning effects use 34 original spell OBJ cells decoded from the loaded US ROM. The rising ki aura uses their palettes with custom pixel animation. `engine/native-effects.json` contains offsets, assembly descriptors, palette rotations and capture provenance, not game graphics bytes. `engine/native-effects.js` decodes them when a verified ROM is loaded.

The Frieza collateral montage also uses 24 original Exploder and Fireball cells, assembled into seven explosion frames and three ember frames. `engine/native-combustion-data.js` records their ROM addresses, native OBJ flips, assembly positions and independent capture hashes. Outward bursts use exact quarter turns; persistent fires use staggered native animation frames. Damaged roofs are a separate copy of the town map, with selected roof tiles replaced by that town's earth or paving and fragments cut from its original roof pixels. Debris stays attached to map coordinates through camera pans. Neither the cartridge nor the running battle's tilemap is changed.

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

Kamehameha is new choreography assembled from these cells. It is not an original Secret of Mana spell. The gold beam reuses the native Lucid Barrier palette on Lucent Beam's cells. Quarter turns and repeated 16×4 beam strips preserve the original pixels; no smooth scaling, browser gradients or glow is used. The physical punch's burst reuses Lucent Beam impact art, not a claimed original sword-hit animation.

Connected blows add "impact frames" from `engine/impact-art.js`: a two-frame eight-pointed starburst sized by the blow (spike radius 7 px for a ki shot, 12 / 14 / 16 px for jab, cross and kick), white with a one-pixel rim in the impact spark's tones (pale blue; pale gold for Super Saiyan), and the finishing kick's six-frame shockwave, a ring growing from 11 to 27 px with eight radial speed lines, from the frame after contact and behind every sprite. They are generated pixel art, not game graphics: each star is one 16×16 quadrant mirrored four ways and the shockwave reuses five cells, so the cartridge (`snes/gen/fx.mjs`) packs the same 18 cells and draws identical pixels. The struck actor's own OAM entries are drawn white for the starburst's two frames (`sprite-layer.js`; on the cartridge its exclusive palette row or a white palette, never a row shared with other actors).

Focus, transformation and charging use the pixel flame animation in `engine/ki-aura.js`, colored with the original Lucent Beam and Lucid Barrier palettes. Frieza uses the magenta/pink ramp shared with his finger laser and Death Discs. This is custom choreography, not an extracted spell: connected flame tongues and staggered highlights travel upward from a fixed foot anchor instead of orbiting shield arcs. Twelve frames advance every three game frames, with eight strength steps and separately rasterized 16-, 32- and 40-pixel character sizes. The complete silhouette alternates on/off each game frame for ghost-style temporal transparency, using quieter palette shades without a white core. Characters draw in front; there is no hollow rectangular center. Held L uses Goku's directional guard and a smaller aura, while the straining poses remain reserved for transforming/reverting. Goku, Vegeta and the orbital scenes share this animation; the surface-seeking Thunderbolt paths of SSJ Kamehameha remain unchanged. Orbital hand charges sample the native cells at the same 2:1 scale as the fighters. No additional image assets are required.

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
