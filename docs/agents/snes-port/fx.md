# FX module: the shared effects library

Spoilers. Part of the [SNES cartridge port](../snes-rom.md) ([plan](plan.md),
[engine notes](engine.md)). Source: `snes/src/modules/fx/`, generator
`snes/gen/fx.mjs`, tests `snes/test/fx/`. Browser references:
`engine/native-effects.js` + `.json`, `native-combustion*.js`,
`native-dark-force.js`, `death-ball-art.js`, `charge-lightning.js`,
`ki-aura.js`, `beam-detonation.js`, `orbit-effects.js`, `orbit-pixels.js`,
`native-feedback.js` and the effect parts of `sprite-layer.js` and
`mana-mod.js` ([native effects](../native-effects.md), [combat](../combat.md)).

FX renders; it never decides gameplay. Combat (and later flight, Frieza,
Vegeta, orbit, world) own timing, hit boxes and damage and call FX to show
the result. FX animates the timed particles it is asked to spawn and draws
the continuous effects (charge orb, aura, beams, lightning) that a client
re-requests every frame.

Status: **API frozen for clients; implementation in progress** (see
[Status](#status)). Entry points exist and are safe to call now; kinds not
yet implemented draw nothing.

## Calling convention

All entry points are `JSL`, entered and left with **M16/X16, DB = `$7E`,
D = 0** (the core module convention); they preserve DB and D and clobber
A/X/Y unless noted. Call them from a `modules_field_frame` callback (or a
world-flight frame callback). FX itself runs last in `modules_field_frame`
(`fx_frame`) and last in `modules_field_nmi` (`fx_nmi`), so everything a
client requests in a frame is drawn in that same frame.

Extra parameters go through a small **request block in SRAM** (bank `$31`,
write with long addressing, e.g. `STA.l !fx_a`). It is read by the next
`fx_spawn` / `fx_draw` / `fx_beam` call and is not cleared, so set every
field a kind uses.

| Field | Address | Meaning |
| --- | --- | --- |
| `!fx_dir` | `$31:7800` byte | Facing 0 down, 1 right, 2 left, 3 up (Goku's `!goku_act_facing` order), or a heading 0–15 (`engine/orbit-pixels.js`, 0 = right, 4 = down) with `FX_F_HEADING` |
| `!fx_style` | `$31:7801` byte | Kind-specific style / tone / variant |
| `!fx_a` | `$31:7802` word | Kind argument A |
| `!fx_b` | `$31:7804` word | Kind argument B |
| `!fx_c` | `$31:7806` word | Kind argument C |
| `!fx_t` | `$31:7808` word | Client clock for continuous draws (the action's age; animation phase) |
| `!fx_rgb` | `$31:780A` 3 words | Caller colours (BGR555) for `FX_DEBRIS`: dark, mid, light |

### Coordinates and depth

- Positions are signed 16-bit pixels. By default they are **map pixels**,
  the space of actor positions (`$E002/$E004` + `$200·n`); FX converts them
  with the field camera taken from actor 0 (`$E002-$E020`,
  `$E004-$E022`), exactly as the browser's `cameraX/Y`. With `FX_F_SCREEN`
  they are screen pixels (cinematics, orbit, world flight).
- The point is the **centre** of the effect, as the browser's `stamp()`
  origin (cell pixel 8,8), except where a kind says otherwise (aura: feet
  line; beam: the palms).
- `FX_F_GOKU` anchors to Goku instead: `FX_ORB` to the hand socket of the
  displayed pose (`goku_api_hand`), `FX_AURA` to his body; X/Y are then an
  offset (normally 0). Nothing is drawn while Goku has no socket / is hidden.
- Depth follows the browser's composition as far as OAM allows. Effects
  use OBJ priority 3 (above all BG1/BG2 tiles, below the BG3 text layer) and
  never take part in OBJ colour math. By default they sit **behind native
  sprites** (`core_oam_add`), so Goku's body covers upward beams, as the
  browser's `behindBody`. `FX_F_FRONT` puts the effect in front of every
  native sprite (`core_oam_add_front`; FX uses at most 12 of the 16 front
  slots and silently falls back to behind). Kinds marked *front* below
  default to front unless they point up (`!fx_dir` = 3).

### Flags (high byte of A)

| Flag | Value | Meaning |
| --- | --- | --- |
| `FX_F_SCREEN` | `$01` | X/Y are screen pixels |
| `FX_F_GOLD` | `$02` | Lucid Barrier gold variant (Super Saiyan ki, sparks, ring) |
| `FX_F_FRONT` | `$04` | In front of native sprites |
| `FX_F_BACK` | `$08` | Force behind native sprites (overrides a kind's front default) |
| `FX_F_HEADING` | `$10` | `!fx_dir` is a 16-step heading |
| `FX_F_SSJ` | `$20` | Super Saiyan geometry where it differs (beam bands +2) |
| `FX_F_PINK` | `$40` | Frieza's magenta ramp (`friezaKiPalette`) instead of the native one |
| `FX_F_GOKU` | `$80` | Anchor at Goku (hand socket / body), X/Y = offset |

## Entry points

| Routine | In | Out |
| --- | --- | --- |
| `fx_spawn` | A = kind \| flags<<8, X = x, Y = y, request block | C clear: A = handle; C set: no free slot (nothing spawned) |
| `fx_draw` | same | Draws one frame of a continuous kind. C set if dropped |
| `fx_beam` | A = style \| flags<<8, X/Y = palms, `!fx_dir`, `!fx_a` length, `!fx_b` width, `!fx_c` taper, `!fx_t` beam age | One frame of a beam. C set if dropped. Up to 4 per frame |
| `fx_flash` | A = frames (7 for the transformation) | Gold-white screen flash, as `native-feedback.js` `burst()` |
| `fx_quake` | A = frames | Native BG quake pulse (`$49 = $E0`), ignored in Mode 7 and when an event owns `$49` |
| `fx_kill` | A = handle | Ends a spawned effect (stale handles are ignored) |
| `fx_kill_all` | – | Ends every spawned effect and the flash/quake (ring opened, map change, combat cancelled). FX also does this itself on a map or mode change |
| `fx_move` | A = handle, X/Y = new position | Moves a spawned effect (same coordinate space as spawned) |
| `fx_info` | A = handle | C clear while alive: A = age, X/Y = current position (ki shots move) |

Handles are a slot index plus a generation byte; a handle whose effect
ended never matches a newer one.

## Kinds

Timed kinds (`fx_spawn`; FX owns the age and ends them):

| Kind | Id | Browser source | Arguments | Notes |
| --- | --- | --- | --- | --- |
| `FX_IMPACT` | `$01` | `effect.kind==='impact'` | `!fx_dir` turn, `!fx_a` life (0 = 10), `!fx_b` hold frames | Lucent Beam impact spark (gold with `FX_F_GOLD`), frame `min(5,age/2)`, two extra sparks at ±(7,−3) for 5 frames. *front* |
| `FX_KI` | `$02` | `effect.kind==='ki'` | `!fx_dir`, `!fx_a` range (0 = 256) | Ki shot from the palm: three charge-orb cells trailing at 7 px, front at `min(range,(age+1)·14)`, life 22, muzzle cell for 2 frames; gold with `FX_F_GOLD`. Combat computes the same front for hits and calls `fx_kill` at the first contact. *front* |
| `FX_BURST` | `$03` | `powerBurst` | `!fx_a` radius (0 = 56) | Transformation blast ring: 16 gold arcs, then 8 sparks, radius `r+1.5·age`, life 14; blue with no `FX_F_GOLD` |
| `FX_EXPLODE` | `$04` | `combustion('burst')` | `!fx_dir` turn 0–3, `!fx_style` bit0 flip | One Exploder burst, 7 native frames × 6 ticks |
| `FX_EMBER` | `$05` | `combustion('ember')` | `!fx_dir` heading, `!fx_a` speed (px/frame, 8.8), `!fx_b` life | Fireball ember drifting outward and sinking |
| `FX_DETONATE` | `$06` | `beam-detonation.js` | – | Rolling Exploder cluster + embers, 132 frames |
| `FX_STATUS` | `$07` | `statusBurst` | `!fx_style` 0 plain, 1 fire, 2 ice, 3 balloon | Recovery burst: impact + eight fragments / embers |
| `FX_DEBRIS` | `$08` | `rubble`, ceiling dust | `!fx_rgb` 3 colours, `!fx_a` count (0 = 4), `!fx_b` life (0 = 32) | Spinning chunks on ballistic arcs in the room's own colours (destruction, ceiling escape) |
| `FX_SPARKS` | `$09` | ceiling-escape impact ring | `!fx_a` count (0 = 8) | Ring of impact sparks spreading out (12 frames) |

Continuous kinds (`fx_draw`, every frame the effect should show):

| Kind | Id | Browser source | Arguments | Notes |
| --- | --- | --- | --- | --- |
| `FX_ORB` | `$10` | charge orb | `!fx_a` frame 0–4 (charge `min(4,strength·5)`; full charge alternates 3/4 every 4 frames) | Charge orb at the palm; *front* except facing up. Gold/pink with flags |
| `FX_AURA` | `$11` | `ki-aura.js` | `!fx_style` tone 0 blue, 1 gold, 2 pink; `!fx_a` power 0–256; `!fx_b` body height 16/32/40; `!fx_t` clock | Flame aura around a body, drawn behind it. X/Y = centre of the body cell |
| `FX_LIGHTNING` | `$12` | `charge-lightning.js` | `!fx_a` bolts (2 or 3); `!fx_t` clock | Super Saiyan charge bolts from X/Y to nearby actors, solid tiles or air, regenerated every 3 frames |
| `FX_DEATHBALL` | `$13` | `death-ball-art.js` | `!fx_a` diameter (16–224), `!fx_t` frame; `!fx_style` 0 violet (combat), 1 red (planet killer) | Small sizes are OBJ; large ones a filled circle (see strategy) |
| `FX_DISC` | `$14` | `orbit-effects.js` `disc` | `!fx_t` age (tilt = (age>>3)&3) | Frieza's Death Disc, 20×6 in four tilts |
| `FX_FINGER` | `$15` | `fingerCharge` | `!fx_t` age | Pink finger-laser charge glint |
| `FX_CELL` | `$16` | `stamp()` | `!fx_a` group (below), `!fx_b` frame, `!fx_dir` turn | Any native spell cell, quarter turns, gold/pink variants |

`FX_CELL` groups: 0 charge-orb, 1 beam-body, 2 beam-head, 3 impact-spark,
4 lightning, 5 lightning-impact, 6 gold-spark, 7 gold-arc, 8 aura-arc,
9 exploder burst frame, 10 fireball ember.

Beams (`fx_beam`, every frame; geometry from the client, as the browser's
`beamGeometry`):

| Style | Id | Browser | `!fx_b` | Rendering |
| --- | --- | --- | --- | --- |
| `FX_BEAM_KAME` | `$00` | regular Kamehameha | width (5 + 14·strength); bands `max(1,round(w/4))` (+2 with `FX_F_SSJ`) | Lucent Beam 16×4 strips every 16 px, head at the front, orb frame 4 at the palms |
| `FX_BEAM_WAVE` | `$01` | full SSJ wave (`giantBeam`) | current half-width (80 grown over 6 frames, collapsing over 10) | Solid core in Lucent Beam's four darkest colours with 3/9/17 px bands and ripple; Thunderbolt and impact cells along both edges every 28 px; orb at the palms. `!fx_c` taper (44) |
| `FX_BEAM_FINAL` | `$02` | Final Flash | half-width | As WAVE in the yellow/white training palette, gold sparks |
| `FX_BEAM_GALICK` | `$03` | Galick Gun | half-width | As WAVE in purple |
| `FX_BEAM_FRIEZA` | `$04` | `beam(...,'frieza')` | width | Lucent strip in Frieza's pink, pink orb |
| `FX_BEAM_LASER` | `$05` | `deathBeam` | – | Death Beam: 3 px pink line with a white core, finger glint |
| `FX_BEAM_FIRE` | `$06` | `beam(...,hot)` | width | Lucent strip in the Fireball colours, gold orb |

`!fx_a` is the current length from the palms in pixels, `!fx_t` the beam's
age (phase = age/2 as the browser). `FX_F_HEADING` gives 16 directions
(orbit); facings cover the field.

## Examples (combat)

```asm
; Punch connected at an enemy: impact spark at the enemy's chest.
	LDA.w #$0000 : STA.l !fx_a : STA.l !fx_b    ; default life, no hold
	SEP #$20 : LDA.b facing : STA.l !fx_dir : REP #$20
	LDA.w #!FX_IMPACT|(!FX_F_GOLD<<8)           ; SSJ: gold
	LDX enemy_x : LDY enemy_y_minus_12
	JSL fx_spawn
; Charging: every frame while L+Y is held.
	LDA.w #2 : STA.l !fx_a                       ; orb frame from charge
	LDA.w #!FX_ORB|(!FX_F_GOKU<<8)
	LDX.w #0 : LDY.w #0
	JSL fx_draw
; Released beam: every frame of the beam's life.
	LDA length : STA.l !fx_a
	LDA width : STA.l !fx_b
	LDA age : STA.l !fx_t
	LDA.w #!FX_BEAM_KAME
	LDX palm_x : LDY palm_y
	JSL fx_beam
; Transformation ignition (first gold frame).
	LDA.w #!FX_BURST|(!FX_F_GOLD<<8) : LDX goku_x : LDY goku_y_minus_16
	JSL fx_spawn
	LDA.w #7 : JSL fx_flash
	LDA.w #9 : JSL fx_quake
```

## Rendering strategy

**Cells come from the cartridge's own spell data.** `snes/gen/fx.mjs` reads
the 34 Lucent Beam / Thunderbolt / Lucid Barrier cells, the 24 Exploder /
Fireball cells and the 3 Dark Force cells from the verified ROM at the
offsets in `engine/native-effects.json`, `native-combustion-data.js` and
`native-dark-force.js` (the browser's manifests; no art is stored in the
repository) and emits them as 4bpp OBJ tiles, plus the derived variants the
browser computes at load: quarter turns (90°; 180°/270° are OAM flips),
gold / pink recolours, the band unions of the beam strip and the gold-arc
palette rotations baked into tile indices. The native format (24 bytes per
tile, `P0=~a, P1=a^b, P2=~c&(a^b), P3=(a&b)^c`) cannot be DMA'd as is; the
game expands it into WRAM itself, so the build does the same expansion once.

**VRAM**: a small cache of 16×16 cells in the OBJ regions the core lists as
free in the field (`!VRAM_FIELD_OBJ_A/B/C`: 15 cells), claimed with
`core_vram_claim` (owner `$0E`) when an effect first needs them and released
after 120 idle frames. Each frame FX looks up the cells it will draw, keeps
cells drawn recently, and uploads missing ones in its vblank callback (64 B
per half cell, only while `core_vblank_lines` allows). A cell that could not
be uploaded is skipped for that frame. World flight uses the world regions.

**Palettes**: effect colours are grouped into 15-colour OBJ palettes
(Lucent blue, Thunderbolt, gold + fire, pink + violet, training yellow /
purple). Each frame FX scans the OBJ palettes used by the sprites already in
OAM (natives and earlier modules) and assigns its palettes to free OBJ
palettes 2–7 (preferring 2–3, which colour math never touches); the vblank
callback writes those 32-byte palettes to CGRAM after the game's own
palette upload, so the game's buffer at `$7E:0600` is never modified. When
no palette is free the effect is drawn with the nearest assigned palette.

**OAM**: one 16×16 OBJ per cell (field OBJSEL `$63`; large size in world
flight). Most sprites go behind the natives; front sprites are reserved for
impact sparks, the charge orb and ki heads. A full-width horizontal beam
uses ~30 of the 34 slivers per line, so on crowded lines the far end of a
long beam drops out first, never a native sprite.

**Full-screen waves and big shapes** (SSJ wave, Final Flash, Galick Gun,
large Death Balls): a colour-math polygon instead of OBJ. HDMA channel 2
writes window 1's left/right edge per scanline, channel 3 writes the fixed
colour per scanline (two `COLDATA` writes: R=G and B), so the taper, the
growth/collapse and the 3/9/17 px colour bands follow the browser's
`giantBeam` per line. Inside the window the main screen's BG1/BG2 are masked
and the colour math adds the fixed colour to the black backdrop, giving the
solid beam colour; native sprites and the BG3 HUD stay visible; OBJ edge
sparks are drawn on top. The field never uses windows (all 314 sampled field
states have `W12SEL=W34SEL=WOBJSEL=0`) and uses HDMA channels 0–1 only (the
dialogue gradient, `$2C & 3`); channels 2/3 are used only by two scripted
transitions (`C2:C7B7`, `C2:CB1F`), during which FX falls back to OBJ
strips. FX sets bits 2/3 of the game's HDMA shadow `$2C` only while a
polygon is shown and restores TM/TS/CGADSUB from the game's shadows
`$21/$22/$23` (`C2:AAB3`) afterwards.

**Screen effects**: the flash is fixed-colour addition (R/G +amount, B
+amount/2 with the browser's `[0,1,2,4,6,9,13,17]` ramp) on BG1/BG2/backdrop
for 7 frames; the quake writes the native quake byte `$49` exactly as
`native-feedback.js` (a native write takes ownership back).

## Resources

| Resource | Use |
| --- | --- |
| Code `$AE:8000-FFFF` | `!CODE_FX` (upper half only; `$EE` lower half holds ending art) |
| ROM | Bank `$FC` (whole bank) for cell tiles and palettes, generated by `snes/gen/fx.mjs` |
| SRAM `$31:7800-7BFF` | `!SRAM_WORK_FX`: request block, slots, draw list, VRAM cache, HDMA tables |
| WRAM | None |
| VRAM | `!VRAM_FIELD_OBJ_A/B/C` while effects are active (owner `$0E`); world regions in world flight |
| CGRAM | Free OBJ palettes per frame, written in vblank (never the game's buffer) |
| HDMA | Channels 2/3 and `$2C` bits 2/3, only while a polygon effect is shown |
| DMA | Channel 7 in `fx_nmi` (cell uploads, palettes) |

## Status

Planned order: request block and stubs (done), generator and cells, OBJ
kinds (impact, ki, orb, beam strips, burst ring, explosion/ember), palettes
and VRAM cache, flash/quake, wave polygon, lightning, aura, Death Ball /
disc / laser / training beams.

## Core requests

- **Dispatch order**: `fx_frame` must be the last call in
  `modules_field_frame` (and `fx_world_frame` last in `modules_world_frame`)
  so clients' requests of the same frame are drawn; `fx_nmi` must be the
  last call in `modules_field_nmi` because it programs HDMA channels 2/3
  after every other vblank DMA. Include `modules/fx/module.asm` before its
  clients so they see the `!FX_*` defines.
- **HDMA arbitration**: FX ORs bits 2/3 into the game's HDMA shadow `$2C`
  while a polygon is shown. A core-owned `!core_hdma_mask` ORed into
  `$420C` at `00:C158` would avoid touching the game's byte. Clients that
  test `$2C` for "no dialogue" should test `$2C & 3`.
- **OBJ palettes**: there is no core arbitration of OBJ palettes; FX picks
  palettes not used by the sprites already in OAM when it runs. Scene
  modules that add their own characters should add their sprites before
  `fx_frame`, or ask FX for a palette (an `fx_pal_claim` service can be
  added if needed).
- **SRAM**: 1 KiB is tight with double-buffered HDMA tables; another
  512 bytes would allow full per-scanline precision for two polygons.
- A bulk OAM reservation (`core_oam_reserve`: n slots, module fills them)
  would cut ~250 cycles of call overhead per effect sprite.
