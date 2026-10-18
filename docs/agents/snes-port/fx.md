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

Status: **API frozen; every kind draws** in the field (see
[Status](#status) for each kind and its deviations). FX draws nothing in
world flight (the world module draws its own effects there).

## Calling convention

All entry points are `JSL`, entered and left with **M16/X16, DB = `$7E`,
D = 0** (the core module convention); they preserve DB and D and clobber
A/X/Y unless noted. Call them from a `modules_field_frame` callback (or a
world-flight frame callback). FX itself runs last in `modules_field_frame`
(`fx_frame`) and last in `modules_field_nmi` (`fx_nmi`), so everything a
client requests in a frame is drawn in that same frame.

**Continuous draws (`fx_draw`, `fx_beam`) must be requested from a frame
callback, every frame the effect should show.** The draw list belongs to
the dispatched frame (`!core_tick`): `fx_frame` draws the entries requested
since that frame's dispatch began and then empties the list, so a request
made anywhere else (a `%hijack` in the game's own code, which runs after
`fx_frame` or before the next dispatch; an NMI; a frame the client skipped)
belongs to another tick and is dropped. A beam or aura therefore disappears
in exactly the frames its client does not call FX, which is the intended
way to end it. Timed effects (`fx_spawn`, `fx_kill`, `fx_move`) may be
called from any main-loop code, hooks included (never from an NMI): FX
ages them itself, and a spawn made after `fx_frame` shows from the next
frame.

`!FX_DRAWS` (8) is the number of draw-list entries per frame, shared by
`fx_draw` and `fx_beam` (the ninth request in a frame returns C set). It is
defined by the library itself (`modules/fx/module.asm`), not by
`defs.asm`, so a module included after FX in `modules.asm` can test
`if defined("FX_DRAWS")` to know that the real library is in the build
(combat's placeholder sprites, for example).

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
  origin (cell pixel 8,8), except where a kind says otherwise (aura: body
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
| `fx_draw` | same | Draws one frame of a continuous kind. C set if dropped (`!FX_DRAWS` = 8 draws and beams per frame) |
| `fx_beam` | A = style \| flags<<8, X/Y = palms, `!fx_dir`, `!fx_a` length, `!fx_b` width, `!fx_c` taper, `!fx_t` beam age | One frame of a beam. C set if dropped (shares the 8 draw entries) |
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
| `FX_EXPLODE` | `$04` | `combustion('burst')`, `brazierBurst` | `!fx_dir` turn 0–3, `!fx_style` bit 0 flip, bit 1 brazier | One Exploder burst, 7 native frames × 6 ticks; with bit 1 the brazier burst of `dungeon-demolition.js` (three bursts at 0/8/12 frames, (0,−8) turn 0, (−10,2) turn 3, (10,2) turn 1; 54 frames) |
| `FX_EMBER` | `$05` | `combustion('ember')` | `!fx_dir` heading, `!fx_a` speed (px/frame, 8.8), `!fx_b` life | Fireball ember drifting outward and sinking |
| `FX_DETONATE` | `$06` | `beam-detonation.js` | – | Rolling Exploder cluster + embers, 132 frames |
| `FX_STATUS` | `$07` | `statusBurst` | `!fx_style` 0 plain, 1 fire, 2 ice, 3 balloon | Recovery burst: impact + eight fragments / embers |
| `FX_DEBRIS` | `$08` | `rubble`, ceiling dust | `!fx_rgb` 3 colours (dark, mid, light), `!fx_style` 0 rubble / 1 ceiling dust, `!fx_a` rubble chunks (0 = 4, at most 8), `!fx_b` life (0 = 32 rubble, 46 dust) | Rubble: chunks of size 2/3 on the browser's ballistic arcs (seeded by position and frame); ceiling dust: the 20 chunks of `ceiling-escape.js` on their exact paths (the two stone specks under each chunk are not drawn; the gap pattern uses two of its eight turns so the chunks fit the VRAM cache). All debris shares one DYN palette (the latest colours). Behind the natives |
| `FX_SPARKS` | `$09` | ceiling-escape impact ring | `!fx_a` count (0 = 8) | Ring of impact sparks spreading out (12 frames) |

Continuous kinds (`fx_draw`, every frame the effect should show):

| Kind | Id | Browser source | Arguments | Notes |
| --- | --- | --- | --- | --- |
| `FX_ORB` | `$10` | charge orb | `!fx_a` frame 0–4 (charge `min(4,strength·5)`; full charge alternates 3/4 every 4 frames) | Charge orb at the palm; *front* except facing up. Gold/pink with flags |
| `FX_AURA` | `$11` | `ki-aura.js` | `!fx_style` tone 0 blue, 1 gold, 2 pink; `!fx_a` power 0–256 (0: none); `!fx_b` body height (≤ 20: 16, ≥ 36: 40, else 32); `!fx_c` phase seed; `!fx_t` clock (shown on even clocks only, phase `(clock/3 + seed) % 12`) | Flame aura behind every sprite (a polygon, see strategy). X/Y = centre of the body cell as the browser's `aura()`; with `FX_F_GOKU` Goku's cell centre + X/Y. One aura per frame: give a second one the other clock parity |
| `FX_LIGHTNING` | `$12` | `charge-lightning.js` | `!fx_a` bolts (2 or 3; 0: 2); `!fx_t` clock | Super Saiyan charge bolts from X/Y (the charge point), regenerated every 3 frames, as Thunderbolt cells along the browser's bolt points; every bolt ends in the air (see strategy). *front* |
| `FX_DEATHBALL` | `$13` | `death-ball-art.js` | `!fx_a` diameter (snapped to `deathBallSizes`, 16–224, as the browser), `!fx_t` frame (wraps at 12) | 16 and 32 px: the art as OBJ; 24 and 48–224 px: a polygon (see strategy), else the 32 px ball. The cinematic red planet killer (64 px art) is not FX's: its scene draws it |
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
| `FX_BEAM_KAME` | `$00` | regular Kamehameha | width (5 + 14·strength); bands `max(1,round(w/4))` (+2 with `FX_F_SSJ`) | Lucent Beam 16×4 strips every 16 px, head at the front, orb frame 4 at the palms. Left/right: the strips' lines as a polygon (see strategy) |
| `FX_BEAM_WAVE` | `$01` | full SSJ wave (`giantBeam`) | current half-width (80 grown over 6 frames, collapsing over 10) | Colour-math polygon (see strategy): white core, Lucent Beam bands; impact and Thunderbolt cells along both edges every 28 px; orb at the palms. `!fx_c` taper (0 = 44) |
| `FX_BEAM_FINAL` | `$02` | Final Flash | half-width | As WAVE in the training gold ramp, gold sparks and arcs, gold orb |
| `FX_BEAM_GALICK` | `$03` | Galick Gun | half-width | As WAVE in the training purple ramp (blue sparks and orb, as the browser) |
| `FX_BEAM_FRIEZA` | `$04` | `beam(...,'frieza')` | width | Lucent strip in Frieza's pink, pink orb (polygon left/right, as KAME) |
| `FX_BEAM_LASER` | `$05` | `deathBeam` | – (`!fx_a` reach) | Death Beam: the browser's 3-pixel line (white core, pinks of the strip rows 6 / 8 in colour frame `(age>>2)&1`) in 16 headings with `FX_F_HEADING` (else the facing), behind the natives; the finger glint in front. See strategy |
| `FX_BEAM_FIRE` | `$06` | `beam(...,hot)` | width | Lucent strip in the Fireball colours, gold orb (polygon left/right, as KAME) |

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
after 120 idle frames or at a map or mode change (so a scene module such as
the arrival can claim them while FX idles). Each frame FX looks up the
cells it will draw, keeps cells drawn recently, and uploads missing ones in
its vblank callback (two 64-byte halves per cell). The upload budget is
learned per streaming phase of the game (`$56`: in Potos one phase in five
leaves no vblank time); a cell whose upload slipped is not drawn until it
lands. A spawned effect whose new animation frame needs cells that the
coming vblank cannot upload would blink for a frame; FX then takes back
that effect's sprites and draws its previous age instead (cells still
resident), while its age runs on, so the client's timing is kept. World
flight will use the world regions.

The gameplay build uses one impact spark and one moving ki orb, with a
two-frame palm flash. `-DFX_DETAIL=1` restores the extra impact satellites
and three-orb trail for comparisons. Projectile speed, reach and damage are
unchanged. Offscreen shots are culled before palette/cache work. Cell DMA
does not start at line 254 or later, reserving time for palettes, colour math,
the joypad/clock hook and the NMI return; missing animation cells retain the
prior resident age. The gallery waits up to one native five-phase upload
cycle for its simultaneous cold-cache orb frames and transformation rings,
then requires their full sprite counts.

**Palettes**: effect colours are grouped into 15-colour classes, BLUE
(Lucent Beam, ki, impacts), PINK (Frieza: pink beams, discs, Death
Balls), GOLD (Super Saiyan sparks, arcs, ring and the Thunderbolt cells in
Lucid Barrier's gold ramp), FIRE (Exploder / Fireball), DYN (caller
colours) and WHITE (an override). Each frame FX scans the OBJ palettes used
by the sprites already in OAM (natives and the modules that drew before
it) and maps the classes it draws to free OBJ palettes, preferring 3 and 2
(never in OBJ colour math), then 7, 6, 5, 4; the vblank callback writes
those 32-byte palettes after the game's own CGRAM upload (the game
uploads all of CGRAM every completed frame), so its buffer at `$7E:0600`
is never modified. A class with no free palette is not drawn that frame;
Potos leaves two free palettes, so the usual pairs (BLUE + GOLD for a
Super Saiyan beam, FIRE alone for explosions) fit.

**OAM**: one 16×16 OBJ per cell (field OBJSEL `$63`). Most sprites go behind
the natives through the core's module area; front sprites (impact sparks,
the charge orb, ki heads) are staged in the core's front list (at most 12).
Assemblies are pre-flipped per cell; a fully visible assembly takes a fast
path of one 16-bit add per part, and beam strips and wave edges are runs
(`fx_emit_run`, a fixed spacing along the beam). On crowded lines the far
end of a long beam drops out first, never a native sprite.

**Sprites per line.** The PPU shows at most 34 8-pixel slivers per line and,
when a line has more ("time over"), drops the slivers of the *first*
sprites in OAM: the natives (Goku, enemies), since FX's sprites come after
them. A left/right row of 16×16 strips across the screen is 32 slivers, so
on Goku's own lines a Kamehameha used to blank parts of Goku and of the
enemies next to him. Two measures:
- **Left/right strip beams are a polygon** (`fx_poly_strip`, the wave's
  HDMA machinery): every row of a strip assembly (the band unions, one
  16×16 cell or two stacked from 6 bands) is one colour across the cell,
  which `snes/gen/fx.mjs` asserts while it emits `fx_strip_ptr` /
  `fx_strip_data` (per union and half turn: the first coloured line's
  offset from the palms, the line count, each line's colour index). Window
  1 per line spans the strips (palms to the last strip) and the backdrop
  per line takes the line's colour, with BG1/BG2 masked inside the window
  and no colour math there: exactly the OBJ strips' picture (the beams
  test compares the two, both half turns), without a single sprite. The
  head and the orb stay OBJ. It takes the frame's one polygon, so a
  second left/right beam, a wave, up/down beams, 16-heading beams and
  scenes where the game runs HDMA on channels 2/3 keep the OBJ strips.
- **OBJ strip rows are budgeted** (`fx_row_room`): before a left/right run
  of strips FX counts the slivers of every sprite already in OAM or staged
  in front that overlaps the row's 16 lines and draws at most
  `(34 - 2 - that) / 2` strips (an overestimate, as the sprites need not
  share a line); the far end goes first.

**Full-screen waves** (`FX_BEAM_WAVE`, `FINAL`, `GALICK`): a colour-math
polygon, `snes/src/modules/fx/poly.asm`. HDMA channel 2 writes window 1
(the beam's outline on each scanline) and, for up/down beams, window 2
(the core); channel 3 writes the backdrop colour (CGRAM 0) per scanline.
Inside window 1 the main screen's BG1/BG2 are masked so the backdrop
shows:
- **left/right**: each scanline is one of the browser's bands (3/9/17 px
  from the edge, `colors[0..3]` of `giantBeam`), exact per line; window 1
  runs from the taper horn (`(d+8)/taper`) to the rounded end
  (`sqrt((len-d)/12)`). Colour math is prevented inside the beam and left
  to the game outside it.
- **up/down**: each scanline crosses every band, so the outer 9 px (bands 0
  and 1) show band 1 as the backdrop and colour math adds the fixed colour
  `core - band 1` inside window 2 (the core, from 9 px in): two colours per
  line instead of four. The game's colour math is off while such a wave
  is shown (CGWSEL prevents math outside window 2).
- Native sprites and BG3 (HUD, dialogue) stay in front of the beam; the
  edge cells and the orb are OBJ on top of it.
- The game's backdrop colour returns on every line outside the beam (the
  HUD lines included), and CGRAM 0 is put back when the wave ends.
- Tables are double-buffered in FX's SRAM (2 × 185 bytes): fx_frame builds
  the back buffer, fx_nmi programs it and swaps. An unchanged picture
  (same palms, visible length, width, taper, style, backdrop colour) is not
  rebuilt: a wave held still costs ~7 lines for the polygon. The build
  picks the finest steps that fit: exact taper/rounded-end lines for
  up/down; the left/right horn of a full-size wave (161 lines) only fits
  with one evaluation every 4 lines (≈2 px steps on the horn).
- One polygon per frame: a second wave in the same frame, world flight,
  16-heading beams and scenes where the game itself runs HDMA on channels
  2/3 fall back to the 7-band OBJ strip.
- Late vblanks. In Potos one streaming phase in five (and the vblank
  after a lag frame) leaves no time: `fx_nmi` starts near line 259 and
  the field NMI's `$420C` write lands at 260-261, or past the next frame's
  HDMA start when FX adds work. FX then changes nothing while HDMA runs
  (no reprogramming, no palettes), so the wave keeps its tables. A channel
  switched on after the frame's HDMA start is not reloaded: its line
  counter underflows into a 127-line repeat that writes whatever follows
  its table (CGRAM corruption on hardware and in Mesen). Every table
  therefore ends with a 127-line entry of the neutral record before its
  end byte, so a resumed channel only counts down and stops; and when
  `fx_nmi` programs new tables it also primes each channel's table address
  and line counter ($43x8-$43xA) as if it had just counted down a
  127-line entry that ends at a zero byte (the first byte of every table
  buffer), which covers a wave's very first frame. In time, the frame's
  HDMA start reloads all of this. The core now also keeps channels that
  were off out of a late `$420C` write (`core_hdmaen_write`): a polygon
  switched on in such a vblank starts one frame later; FX's padding and
  priming stay as the second guard.
- FX's own sprites need their palettes rewritten every vblank (the game
  uploads all of CGRAM each frame), which a late vblank cannot afford
  while HDMA runs. `fx_frame` predicts those vblanks (learned per
  streaming phase) and draws no sprites for that frame: during a wave or
  a dialogue box in Potos the edge cells and orb skip one frame in five.
  Without HDMA, palettes are rewritten even in a late vblank (harmless).
- Deviations from the browser: the up/down two-colour bands; the ripple
  (bands +2 px every third 8 px, moving every 2 frames) is implemented but
  off, since it would force a rebuild every other frame; the horn steps
  above; native sprites in front.

**Death Beam** (`FX_BEAM_LASER`): the browser rasterises the line per
pixel (`u`, `v` from `orbitVectors`, `>> 8`), and a quarter turn of the
heading turns that picture exactly, so `snes/gen/fx.mjs` builds headings
0-3 (0°, 26.6°, 45°, 63.4°) and the cell quarter turns give the rest. A
16×16 window steps along the beam by (16,0), (16,8), (8,8) or (8,16):
window 0 holds the finger end (`u >= 0`), window 1 the body, repeated up
to the reach (whole windows, so the far end may overshoot by up to 15
px). Headings 0 and 2 repeat exactly (the build asserts it against the
browser's pixels); 1 and 3 have no short period, so their repeated window
drifts from the browser's line by up to 0.7 px over 360 px (exact near
the finger). Each line of the screen crosses two windows at most, except
for the horizontal headings 0 / 8: those are three lines of one colour
each, drawn as a polygon when the frame's polygon is free (as the strip
beams). Two cells per heading and colour frame.

**Death Balls above 32 px** (`fx_poly_dball`): the browser upscales the
16 px art by nearest neighbour, so each art row is a band of screen lines
with one outline, and the polygon has at most 16 rows at any size (about
165 bytes of tables). Window 1 is the art circle's span, window 2 its
span without the rim texels; BG1/BG2 are masked inside either. The
backdrop of each band is the mean of the row's inner colours in that frame
(`fx_dball_colours`), and the rim ring (window 1 xor window 2) subtracts
one fixed colour, fitted in `fx.mjs` to bring the rows' colours closest
to the art's rim violet. The outline matches the browser's exactly; the
art's pink patches become tints of their rows, and the sparks outside the
circle are not drawn. While the game's own colour math is on (`$23` not
zero) the ball keeps it outside and shows no rim.

**Ki aura (shipping build)** (`fx_k_aura_obj`): a 32×48 flame made of six
16×16 OBJ cells, or two cells for a 16×32 miniature. Blue, gold and pink
ramps use the existing palette allocator. The two poses mirror the same
tiles; the visible half of the 30 Hz strobe does the cache work, and a new
flame waits until every cell is resident before it appears. No backdrop,
background palette, colour-math or HDMA registers are changed. This keeps
the aura independent of cut grass and native background transparency.
Power still controls whether the aura is present; the compact art uses a
fixed silhouette instead of eight geometric growth levels.

The `aura` regression checks all six size/tone combinations pixel for
pixel, cuts grass with real punches, checks that the glow draws completely
without writing BG palettes, and verifies animation needs no tile uploads
after warmup. Background palette 6 animates natively in the grass scene,
so the test watches the FX writer instead of freezing that native palette.

**Diagnostic polygon aura** (`-DFX_AURA_POLY=1`, `fx_poly_aura`, HDMA kind 4): the flame is up to 80 lines
of 50 pixels whose cells would not fit the VRAM cache (10-19 cells a
frame, about 2000 different ones), so it is a window polygon. `fx.mjs`
renders every height, level and phase with `drawKiAura` itself and stores
per line the windows (xdata blobs `fx_aura16/32/40`, 51 KiB; an index in
`tables.asm`): one span: window 1 = the span, window 2 = its pixels that
are not rim; two spans: one each; a line crossing three or more tongues
fills its narrowest gaps (two windows per line). BG1/BG2 are masked inside
either window and show the backdrop, the ramp's rim colour; window 1 and
2 adds COLDATA up to the inner colour; the tongues' lines (down to the
last line with two spans) show the inner colour without math. The
browser's lighter band inside the rim and the pale tongue streaks are not
drawn. The flame strobes (the browser shows it on even clocks only), so
the frame before it showed no polygon and its tables may take both
buffers (`!fx_pbig`): a full flame is one HDMA repeat-mode entry of 4
bytes a line, written with one 16-bit add per window (about 33 lines of
`fx_frame` with FastROM when the phase or position changes, ~5 when it
shows the same picture). A build that would start after line 168 would
push the frame past its vblank (combat's lagging Rabite field starts
`fx_frame` at 150-250): the flame then shows its tables built for an
earlier phase, when they are still there (same place, height, level and
tone), or nothing that frame, so it animates less often there but the
game keeps its timing. While those tables are on screen no other
polygon is built (a strip beam that frame is OBJ strips). Partly off
screen or with another polygon on screen the lines are written one entry
per 1-8 lines. With the game's own colour math on, the flame is one
colour.

**Charge lightning** (`FX_LIGHTNING`): the browser draws 2-pixel lines
along jagged points from the charge point to solid tiles, actors or the
air, one Thunderbolt cell at each bolt's middle point, and a spark where a
bolt hits something. Lines in any direction do not fit the VRAM cache,
so `fx.mjs` runs the browser's own `arcs()` for seeds 0-63 (the seed is
`phase + map * 71`; the cartridge wraps it to 64) with nothing nearby to
hit, and stores per bolt a Thunderbolt cell on every second point and on
the middle point, turned to the bolt as the browser turns its stamp
(`fx_bolt_ptr`, xdata `fx_bolts`). The cells take the frame `(phase +
bolt) % 3` and sit in front of the natives. About 3 lines of `fx_frame`
per cell (9 for three bolts); bolts never end on tiles or actors (no
impact sparks).

**Screen effects**: the flash is fixed-colour addition (R/G +amount, B
+amount/2 with the browser's `[0,1,2,4,6,9,13,17]` ramp) on BG1/BG2/OBJ
4-7/backdrop for 7 frames, skipped while an up/down wave owns the colour
math; the quake writes the native quake byte `$49` exactly as
`native-feedback.js` (a native write takes ownership back).

**Cost** (Potos with four NPCs, scanlines of `fx_frame`; SlowROM): idle one
SRAM read in `fx_frame` and one in `fx_nmi`; charge orb ~17; impact ~22;
ki shot ~30; one 3-band Kamehameha ~42 (four beams at once ~150); ring
~31; wave held still ~80 (polygon 7, orb 9, edge cells ~55), wave
being built (growing or collapsing) ~85-110. With FastROM (the default
now) the beams test measures a wave held still at ~70; a left/right
Kamehameha as a polygon ~25 held and ~57 in the frames its strip frame
changes (every second frame; a 7-band beam ~85), against ~70-80 for the
same beam as OBJ strips. A frame over ~225 lines in total lags (the game
then runs at 30 fps); heavy scenes (Mana Beast ~180 lines native) lag
with a wave on screen.

## Resources

| Resource | Use |
| --- | --- |
| Code `$AE:8000-FFFF` | `!CODE_FX` (upper half only; `$EE` lower half holds ending art) |
| ROM | `!DATA_FX` = `$FB` (57 of 64 KiB used): cell tiles, assemblies and palettes, generated by `snes/gen/fx.mjs` (`data.asm`, `cells.bin`). The tables read only with long indexed loads (detonation clusters, ember and dust paths, strip lines, laser steps, Death Ball and aura indexes: `tables.asm`) follow the code in `$AE:8000-FFFF` (26 of 32 KiB used). xdata (ExHiROM): the aura's lines, `fx_aura16`, `fx_aura32`, `fx_aura40` (51 KiB), and the bolts, `fx_bolts` (2 KiB) |
| SRAM `$31:7800-7BFF` | `!SRAM_WORK_FX`: request block, 14 effect slots, 8 draw entries, VRAM cache, polygon tables (2 × 185 bytes) |
| WRAM | None (a 148-byte direct-page frame on the stack inside `fx_frame`) |
| VRAM | `!VRAM_FIELD_OBJ_A/B/C` while effects are active (owner `$0E`); released after 120 idle frames and at every map or mode change |
| CGRAM | Free OBJ palettes per frame, written in vblank (never the game's buffer); CGRAM 0 per scanline (HDMA) while a wave is shown |
| HDMA | Channels 2/3 and `$2C` bits 2/3 while a wave is shown |
| PPU | W12SEL, WOBJSEL, TMW, CGWSEL, CGADSUB, COLDATA, WH0-WH3 while a wave or flash is shown; put back to the field's values (CGWSEL 2, CGADSUB from `$23`, black) afterwards |
| DMA | Channel 7 (6 when 7 runs HDMA) inside `fx_nmi` |
| Math | `$4202-$4206` multiplier/divider inside `fx_frame` |
| Hooks | `modules_field_frame` / `modules_field_nmi` (last), `modules_world_frame` / `_nmi`, `modules_ring_frame` (switches a wave off while the ring menu stops the field NMI), `modules_title_boot` (drops the battery-backed state) |
| Original bytes | None patched |

## Status

| Kind | State | Evidence |
| --- | --- | --- |
| `FX_IMPACT`, `FX_KI`, `FX_BURST`, `FX_EXPLODE`, `FX_EMBER`, `FX_DETONATE`, `FX_STATUS`, `FX_SPARKS` | Done (OBJ) | `snes/test/fx/gallery.lua` screenshots in Potos |
| `FX_ORB` | Done; `FX_F_GOKU` draws only in poses with a hand socket (charge, beam, blast) | gallery (screen points), beams (no socket in the idle pose) |
| `FX_DEATHBALL` | Done: 16 / 32 px OBJ, other sizes a polygon | gallery; beams: 24, 48 and 80 px outlines against the browser's, rim |
| `FX_DISC`, `FX_FINGER`, `FX_CELL` | Done (OBJ) | gallery |
| `FX_BEAM_KAME`, `FX_BEAM_FRIEZA`, `FX_BEAM_FIRE` | Done: OBJ strips (four facings); the first left/right beam of a frame as a polygon | `snes/test/fx/beams.lua` (polygon against OBJ strips, pixel-exact, right and left) |
| `FX_BEAM_WAVE`, `FINAL`, `GALICK` | Done (polygon + OBJ edges), four facings | beams: pixel checks of core, bands and rims, HDMA/flag/palette checks |
| `fx_flash`, `fx_quake` | Done | gallery |
| `FX_DEBRIS`, brazier burst | Done (OBJ); destroy's effect records are drawn by FX itself (below) | `snes/test/fx/debris.lua` |
| `FX_BEAM_LASER` | Done: 16 headings (OBJ windows; headings 0 / 8 as a polygon when free) | beams: every heading against the browser's pixels |
| `FX_AURA` | Done (polygon; two colours, tongue gaps filled where a line crosses three or more tongues) | beams: four heights/levels/phases against drawKiAura's silhouette, strobe |
| `FX_LIGHTNING` | Done as Thunderbolt cells along the browser's bolts (no 2-pixel lines, no tile or actor targets) | gallery |
| World flight | Nothing drawn: the world module draws its own effects there | |

**Combat review** (combat reported that in the lagging Rabite field its
Kamehameha strip and charge orb did not appear and the full wave was
misplaced, although `fx_beam` / `fx_draw` got the expected arguments every
frame). Reproduced with combat's own input (L+Y charge and release in a
Rabite field import): combat's side is correct; the causes were FX's and
the test harness's.
- Kamehameha: the left/right strips put 32 slivers on Goku's lines, so
  the PPU's time over dropped the slivers of the first sprites in OAM,
  Goku's body and the Rabites. Now a polygon (see Sprites per line):
  Goku, the Rabites and the whole beam show.
- Super Saiyan wave: its first frame could write garbage to CGRAM when the
  field NMI's `$420C` write landed after the frame's HDMA start; fixed by
  priming the channels (see Late vblanks).
- Charge orb and the misplaced wave: not reproducible on exact frames.
  Mesen's `--testRunner` skips rendering frames by wall clock unless
  `--Snes.DisableFrameSkipping=true` is given, so a screenshot shows a
  frame from an unknown earlier moment (no orb yet, or a wave of an
  earlier frame at its earlier size). FX's runner sets the flag;
  `snes/test/mesen.mjs` does not yet (see Core requests).

**destroy's effect records** (`docs/agents/snes-port/destroy.md`,
SRAM `$33:77F8`): FX polls the record's sequence word every field frame
(also on its idle path) and draws each new record: kind 1 as a rubble
burst in the room's own shades, kind 2 as a brazier burst, at the record's
map position. The shades follow `dungeon-demolition.js`: BG colours with
18 < r+g+b < 75 that are grey or warm, then (unlike the browser's ranks of
the sorted list) the colours nearest 20/50/85% of their lightness range;
computed once per map (~80 lines in that frame), defaults
`$18C6/$294A/$4631`. At most six rubble bursts live at once.

Tests: `node snes/test/fx/run.mjs [gallery|beams|debris]` (FX_TEST
cartridge with a mailbox client, `snes/test/fx/testmod.asm`; Potos
import; `FX_DEFINES='-DCORE_SLOWROM=1'` builds it with other defines). The beams test checks the wave colours on three consecutive PPU
frames per wave (`F.grab`, Mesen's screen buffer), two of three must pass
(`BEAM_CHECKS` in `run.mjs`), and that no BG colour changes, that `$2C`
and the registers come back, and the cost of a wave held still; it also
draws a left/right Kamehameha as a polygon and as OBJ strips (behind a
beam that takes the polygon) and requires the two pictures to be
identical on the beam's lines (a right 3-band beam, a left 7-band Super
Saiyan beam). The
runner starts Mesen with `--Snes.DisableFrameSkipping=true`: running
unthrottled, Mesen otherwise renders only some frames (by wall clock), so
screenshots and the screen buffer show a frame from an unknown moment (31
of 39 consecutive grabs were identical in a measurement).

## Core requests

- **Dispatch order** (in place): `fx_frame` after every module that draws
  effects in `modules_field_frame` (before `destroy_field_frame`, whose
  planner uses the time left, and `audio_frame`; a module calling FX after
  `fx_frame` sees its spawns a frame later and loses its continuous
  draws), `fx_nmi` last in `modules_field_nmi`, `fx_world_frame` before
  `audio_frame` and `fx_world_nmi` last in the world lists,
  `fx_ring_frame` first in `modules_ring_frame`, `fx_title_boot` in
  `modules_title_boot`. `modules/fx/module.asm` is included before its
  clients. FX's private defines carry `fx` prefixes (asar defines are
  global; `!d_*` are its direct-page frame).
- Granted: the data bank (`!DATA_FX` = `$FB` in `core/layout.asm`, with the
  build's ROM ownership check) and FastROM by default (`-DCORE_SLOWROM=1`
  opts out). `snes/test/fx/run.mjs` still checks FX's cells in both ROMs.
- **SRAM for the polygon**: 2 × 512 bytes (instead of 2 × 187 inside FX's
  1 KiB) would give exact left/right horns and the ripple, and circles for
  the large Death Balls.
- **Frame / NMI handshake race** (seen in a SlowROM build of the beams
  test, where two beams make the frame end right at vblank):
  `core_field_frame` sets `!core_dma_ready` before the game's
  `TSB $EC` at `00:B077` marks the frame complete. An NMI landing between
  the two runs the module NMI work (`fx_nmi`, the VRAM queue) in a vblank
  where the game skipped its own uploads, and the next vblank uploads the
  game's OAM and CGRAM without any module NMI work. FX's sprites then show
  the game's colours in that OBJ palette for a frame (FX rewrites its
  palettes only in `fx_nmi`), and a cache cell evicted that frame is
  overwritten while the old OAM still shows it. Proposed fix: run the
  module NMI work only when the game's NMI processed a frame, e.g. by
  setting `!core_dma_ready` from a hook on the game's own completion test
  in its NMI, or by checking in `core_field_nmi` that the interrupted code
  was not between `core_field_frame`'s return and `B079`.
- **HDMA arbitration**: FX ORs bits 2/3 into the game's HDMA shadow `$2C`
  while a wave is shown. A core-owned mask ORed into `$420C` at `00:C15C`
  would avoid touching the game's byte. Clients that test `$2C` for "no
  dialogue" should test `$2C & 3`.
- **Late vblanks**: the field NMI ends its own work after line 257 in one
  streaming phase in five in Potos (and after lag frames); with
  `goku_nmi` and FX the `$420C` write can land after the next frame's
  HDMA start, which breaks every HDMA user that frame (the game's dialogue
  gradient included). A module palette hook right after the game's CGRAM
  upload (before the sprite streaming) would let FX write its palettes in
  time in every frame, so its sprites would not have to skip those frames.
- **Test harness**: `snes/test/mesen.mjs` should pass
  `--Snes.DisableFrameSkipping=true` for every test (see Tests above):
  every screenshot comparison is otherwise subject to Mesen's
  wall-clock frame skipping (combat's review screenshots showed effects
  of earlier frames, see Combat review). FX's runner does it itself.
- **goku**: an API for the displayed cell's centre (`goku_api_hand`'s
  origin + 16, lift included) would anchor `FX_AURA` with `FX_F_GOKU`
  exactly; FX uses `$E020`, `$E022 - $E045 - 15` (no lift) meanwhile.
- **OBJ palettes**: there is no core arbitration of OBJ palettes; FX picks
  palettes not used by the sprites already in OAM when it runs. Scene
  modules that add their own characters should add their sprites before
  `fx_frame`, or ask FX for a palette (an `fx_pal_claim` service can be
  added if needed).
- **OAM**: a bulk reservation (`core_oam_reserve`: n slots, module fills
  them) would cut the call overhead per effect sprite further.
