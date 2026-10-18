# Secret of Mana engine notes for the SNES port

Spoilers. Facts other modules need about the original US cartridge, verified
with the coverage disassembler (`snes/tools/disasm.mjs`), the vendored SnesJs
core on the private browser-mod states, and Mesen runs of the built cartridge.
Core services built on these facts: [snes-rom.md](../snes-rom.md#modules-and-core-api).
Timing numbers come from `node snes/test/core/measure.mjs` (Mesen, 240
frames per scene with walking input; re-run it after engine-heavy changes).

Banks: the field loop and its NMI/IRQ execute in bank `$00`
(the HiROM mirror of `C0`), so Mesen exec callbacks and savestate PCs use
`00:xxxx` for them. The port runs selected native movement, actor, collision
and OBJ passes through the equivalent FastROM mirrors `$80/$81`; the outer
loop and interrupt vectors retain bank `$00`. Other code runs in `C0`–`DF`
through `JSL`.

## Modes, loops and interrupts

| Mode | Main loop (waits for vblank) | NMI (`$0100` JML) | IRQ (`$0104` JML) | Core hooks |
| --- | --- | --- | --- | --- |
| Field: towns, dungeons, dialogue, scripted events, Mode 7 boss arenas (Mana Beast 253, Fortress bosses 488/489) | Init `00:B03F` (stack `$01FF`, `NMITIMEN=$B1`); `00:B070 JSR $B08C` (frame logic), `B073` sets `$EC` bit 0, `B079` waits until NMI clears it; `$56` counts 0–4 | `00:C0A8` | `00:C1CF` at V=196/H=184 | frame `00:B073`, vblank `00:C158` |
| World flight (Flammie, the opening's legend fly-over) | Init `C0:8038` (stack reset), loop `00:8064`–`8091`: logic, `8085` sets `$EC=$81`, `808D` waits | `00:88CF` | `00:8A4B` at V≈100–103 (horizon) | frame `00:8085`, vblank `00:8903` |
| Ring menus | `C0:6943`: polls `$4212` for vblank start, sets `$EC` bit 3, `JSL $D0D397`; pads through `C0:695E` | field (`00:C0A8`) | field | frame `C0:694F` (in vblank) |
| Full-screen menus: game select, name entry, file list, status/equipment/action grid, save screen, controller config | `C0:1DEF`–`1DFD` polls `$4212` (no NMI work); vblank uploads `1DFF`–`1E05`; input and logic every 4th frame (`$A201`, `C0:2BD9`) | `C0:20A7` (BG scroll only) | none (`NMITIMEN=$81`) | frame `C0:1E08` (in vblank) |
| Title, opening narration program, ending/credits | WRAM program at `7E:8000+` (decompressed from `C7:7C00` by `C1:4C30`), entered at `C1:4CF6 JML $7EAF0B` (power-on, soft reset, quit) or `C1:4D0B JML $7EAF28` (`C1:4CFA`, via jump table `C0:0075`; seen in ending/credit states) | `$40` (RTI) | `7E:A266`: the program's frame, `D=$4200`, `DB=$7F` | entry `C1:4CF6`/`4D0B` (`modules_title_boot`) |

- Reset: `00:8004` → `C0:8008 JML $C10010` → `C1:4CE5` (stack `$01FF`) →
  `C1:4D0F` (NMI off, forced blank, `$0100=$0104=$40`, **clears
  `$4200`–`$420D`**, `$4201=$FF`, decompresses the program) → `7E:AF0B`.
  Start+Select+L+R in any pad read (`C0:93B3`) and quitting a menu
  (`C0:010F`) re-enter at `C1:0010`, skipping `C0:8008`.
- Field → world: native event `$0C00 | map` (Drum, Flammie departures).
  Menus → field: `C0:0109 JML $00800C` (stack reset, `JSL $C1E76D` with
  `$0800|door`, `JMP $B03F`).
- `$EC` (NMI request): bit 0 frame complete (field NMI then streams VRAM
  queues, scroll, sprite cells; world NMI sets up the next frame's registers
  and HDMA in `890B`), bit 2 palette DMA, bit 3 OAM DMA (rings set it every
  frame), bit 7 world flight (`$80/$81`). The field NMI ends with
  `TRB $EC #$FF`. The field NMI uploads CGRAM when `$EC & 5` (or `$1D04`
  bit 5) and OAM when `$EC & 9`.
- `$2C`: HDMA enable shadow. The field NMI writes it to `$420C` at `00:C15C`
  (dialogue windows: 3 = channels 0/1, set up in `C1E7` as a CGADD/CGDATA
  gradient); world flight writes `($2C & $C0) | $3F` (overhead map: `$2C & $C0`).
- `$29`/`$21`: per-frame BG mode / main screen written by the field NMI when
  `$29 & 4` (Mode 7 arenas). The field IRQ switches lines 196+ to the HUD:
  `$2105=$09`, `$212C=$14` (BG3 + OBJ). The switch lands at x≈248 of line 195.
- `$D0`: event interpreter (0 idle, 1 starting, `$81` printing, `$82` command
  wait, `$83` waiting for a button, `$85` timed wait). `$E4/$E5`: brightness
  fade timers (1/1 settled). `$F4` advances only for completed field frames;
  combat's `!cb_vblanks` counts every field NMI, including lag. `$DC`: map id.

## Input

1. `C0:93B9` (field `B0AC`, world `87FC`; menus and rings through
   `JSL $008000` → `C0:939F`) calls `C0:951C`, which `JSL`s the Nintendo
   MULTI5 multitap BIOS at `CF:FE00`. Without a multitap it stores `$4218`
   (pad 1) in `$7E:0042`, `$421A` (pad 2) in `$44`, 0 in `$46`; with one it
   reads four pads serially. It returns `A.l=$FF` when a multitap is present.
2. `93B9` zeroes pads with a nonzero low nibble, soft-resets if a pad reads
   `$3030`, applies the per-player controller config (`$EE`–`$F0`, `C0:9434`),
   stores held buttons as `A X L R B Y Sel St` in `$E9/$EA/$EB` and ORs new
   presses into `$CC/$CD/$CE` (sticky until a consumer `TRB`s them).
3. Movement (`C0:B69C`, field `B0AF`): for players 1–3, the pad bytes and the
   party-member mask `$D9/$DA/$DB` (bit 0 hero `$E000`, bit 1 girl `$E200`,
   bit 2 sprite `$E400`) drive `C0:B710`. Each member's `$E02C` holds its
   owning players (bit 0 = player 1). `C0:B6B6` zeroes all pads and edges
   during transitions (`$F1`, `$FF|$52`, `$E2&1`, `$E8&4`).
4. Before the sword the game ignores ring/menu buttons (presses pile up in
   `$CC`). The title program reads pad 1 itself through `D=$4200`.

Core filters pad 1 right after the BIOS (`C0:951D`), so movement, rings,
dialogue, menus, the name editor and world steering all see it.

## OAM

- Buffer `$7E:0800` (128 × X, Y, tile, attr) + `$7E:0A00` (2 bits per
  sprite: X bit 8, size); NMI DMAs `$220` bytes on channel 7. Lower slots
  draw in front. Hidden slots: X=`$FF`, Y=`$E0`.
- Field build each frame: `C0:BCCC` (from `B0A0`) resets the cursor `$7C`,
  `$59/$5A` (high-table bit/byte) and clears the high table; HUD portraits
  first (`C1:E61D`, tiles `$E8/$EA/$EC`); actors via `C0:E38E` (lists `$0540`
  then `$0500`, `C0:E3CF` → `E5CE`/`E640` writes descriptor pieces, `E849`
  shadows); `C0:BCAB` (from `B0D0`) hides slots from `$7C` up to the previous
  end (`$0120`) and stores the new end. All field sprites are 16×16
  (OBJSEL `$63`: 16×16 / 32×32); nothing sets the size bit.
- Ring open (`C0:E330`): all 128 hidden, ring icons from slot 64.
- World flight: slots 0–63 world objects (`C0:9AF5`, built over two frames,
  rest hidden by `C0:9DE9`), 64–83 Flammie, shadow and approach effects
  (`C1:FDE4`, `C2:B273`); 84–127 are never written. OBJSEL `$03` (8×8/16×16).
- Menus: own buffer `$7E:9C00`, DMA only when it changes.
- Native counts (measure.mjs, p50/max): waterfall 4/5, Potos 11/14,
  Sandship 19/34, Thanatos arena 6/7, Mana Beast 33/34, Fortress 11/12,
  Fortress boss 488 34/38; 63 in the busiest ending montage state.
- Limits: 128 sprites; 32 sprites and 34 8-pixel slivers per scanline (a
  16×16 sprite is 2 slivers, 32×32 is 4); later slots drop out first.

**Slots modules can count on** (core OAM API): field: everything after the
native sprites — at least 64 in every measured scene (worst native count 63),
typically 90+; up to 16 of them can be placed in front of all natives.
World flight: slots 88–127 (40), always free. Rings and menus: none.

## VRAM, CGRAM and sprite streaming

| Mode | BG mode | BG maps (word addr) | BG tiles | OBJ base / size |
| --- | --- | --- | --- | --- |
| Field | 1 (BG3 priority below line 196) | BG1 `$5000`, BG2 `$3800`, BG3 `$5800` | BG1/2 `$0000`, BG3 `$4000` | `$6000` + `$7000`, 16/32 |
| Mode 7 arenas | 7 above line 196, 1 below | Mode 7 at `$0000`; BG3 HUD as field | | as field |
| World flight | 7 below the horizon, 1 above (sky) | BG1 `$5000`, BG2 `$5800`, BG3 `$5C00`; Mode 7 `$0000`–`$3FFF` | `$4000` | `$6000` + `$7000`, 8/16 |
| Menus | 5 (hi-res) | BG1 `$4800`, BG2 `$5800` | `$4000`, `$6000` | `$4000`, 8/16 |
| Title | 3 | BG1 `$0C00`, BG2 `$0800` | `$1000` | `$0000` |

- Field CGRAM: the NMI uploads all 256 colors from `$7E:0600` (or
  `$7E:BE00` while `$2A` is nonzero) on channel 7. OBJ palettes are colors
  128–255; the hero uses OBJ palette 1 (5 at the waterfall, for color math).
- Actor cells stream in NMI (`JSL $01950D` → `C1:950D`): a 5-phase round
  robin on `$56`, four channels (4–7, MDMAEN `$F0`) per batch, into fixed OBJ
  VRAM per actor slot (immediates `C1:95C6`–`C1:AFDF` cover `$6400`–`$7FC0`).
  The hero: `$7C00`/`$7D00` (tiles `$1C0`–`$1C7`/`$1D0`–`$1D7`), sources at
  `$0C00`–`$0C0E`, bank byte `$7EE082`, piece count `$7EE083`. Actor 5 (third
  enemy slot, `C1:A7B6`) owns `$7200`–`$73FF`.
- BG streaming (`C0:C692`): rows/columns from `7F:D000/D100/D200/D280` to
  `$76/$A4/$78/$A6`; `C0:C238` HUD numbers; `C0:C2DB`–`C337` misc buffers.

**Free OBJ VRAM** (never displayed or written in 299 field / 19 world-flight
sampled states; field regions belong to rarely active actor slots, so verify
in crowded scenes): field `$7220`/`$7320` (tiles `$122`–`$12F`/`$132`–`$13F`,
7 16×16 cells), `$7840`/`$7940` (4 cells), `$7A80`/`$7B80` (4 cells), plus
the hero's cells for a module that replaces the hero's streaming. World
flight: tiles `$060`–`$0FF` (`$6600`, 160 tiles), `$110`–`$17F` (`$7100`, 112),
`$190`–`$1FF` (`$7900`, 112). Menus: not surveyed. No VRAM is free by
construction in the field; claim regions with `core_vram_claim`.

## DMA and vblank time

| Scene | Frame logic ends (line p50/p90/max) | Native NMI work ends | DMA bytes/frame (p50/max) |
| --- | --- | --- | --- |
| Waterfall | 41/45/51 | 241/246/247 | 1.7/2.3 KB |
| Potos | 109/132/197 | 246/251/252 | 2.1/2.8 KB |
| Sandship | 70/107/258 | 241/251/253 | 1.6/2.9 KB |
| Thanatos arena | 23/38/45 | 235/247/247 | 1.1/2.3 KB |
| Mana Beast (30 Hz natively) | 93/171/178 | 236/247/247 | 1.1/2.3 KB |
| Fortress deck | 56/90/109 | 238/247/247 | 1.3/2.3 KB |
| Fortress boss 488 | 134/211/242 | 241/248/253 | 1.4/2.3 KB |
| World flight | 122/148/182 | 233/234/235 | 0.7/0.9 KB |

(Original cartridge; the core adds 1–2 lines to each.) Vblank is lines
225–261. The field NMI force-blanks until `00:C15F`, so overruns only darken
the top lines; the world NMI does not, so uploads must end inside vblank.
Field modules get 5–20 lines after the native work (~0.8–3 KB); world flight
~23 lines; menus run their vblank work by line ~226 and idle frames upload
nothing. The core VRAM queue starts a transfer only if it ends by line 258
(160 bytes per line) and otherwise keeps it for the next frame.

Channels: field NMI DMA on 7 (CGRAM, OAM, BG queues) and 4–7 (sprite cells),
HDMA 0–1 from `$2C`; world NMI DMA on 7, HDMA 0–5 plus `$2C` bits 6–7; menus
DMA on 7, no HDMA. Core flushes on the first of 7, 6, 5, 4 not enabled in
`$2C` (world: also not 0–5).

## Sound

`JSL $C30004` (→ `C3:0160`) sends the 4-byte command at `$7E:1E00`–`1E03`
to the SPC700 through `$2140`–`$2143` with busy-wait handshakes, clears byte 0,
preserves all registers and returns with `RTL`. Byte 0: `01` music, `02`
sound effect (`02 50 0F 88` hit, `02 2A 0F 88` charge, `02 12 00 88`
transform, `02 94 0F 80` boss death, `02 D8 00 88` acquire), other values
for driver commands. Native callers (`C0:29F7`, `C0:399F`, `C0:4172`,
`00:B586`, `00:8154`, `01:D4FD`, `01:F109`, `C2:30F8`, `C6:40D2`, `D0:CEF1`)
run on main loops, never in NMI. Core queues commands and sends one per frame.

## Events

`JSL $C1E76D` with `A16` = id, `D=0`, `$D4` = triggering actor offset:
`<$400` script events (pointer table `C9:0000`), `$400`–`$7FF` (`CA:0000`),
both set `$D0=1`; `$800`–`$BFF` doors (`$010E` = id & `$3FF`, door table
`C8:3000`); `$C00 | map` world flight from that map. Examples used by the
tests: `$0803` Potos entrance (door 3, by the gatekeeper), `$0C80` world flight
from the waterfall, `$05D8` save point (`2A F8 1F 06 02 00`; bytecode `1F 06`
opens the save screen). The destination map id changes at once; the fade and
load follow over ~100 frames.

## Saves, loads and new games

- Records: slot `s` (`$A211`) at SRAM `$30:6000 + s*$400`, `$2BC` bytes, an
  identical backup at `+$1000` written in the same pass; `$30:7FFF` = last
  slot. `+0=$C5`, `+1/+2` checksum (`C7:5CDC`), `+3…` data (`$CC00` names and
  inventory, `$CF00` flags packed to nibbles, `$E180/$E380/$E580` party stats,
  …), `+$2B7` the slot's save sequence (1–99), `+$2B8` the newest sequence of
  all slots, `+$2B9` the `$0108` word, `+$2BB=$3A`.
- Save `C0:2E87 JSL $C755D6`; it then calls `C7:5653`, which **rewrites
  `+$2B8` and the checksum of every valid slot**. Any binding to a record must
  skip those bytes (the browser's `battery.js` hashes them, so saving one slot
  orphans the other slots' browser sidecars).
- Load `C0:2EC1 JSL $C7557A`: `C7:583C` picks the primary or, if only the
  primary fails (`$A215` bit pair), the backup; `$A212` bit 2 = failure, after
  which the menu runs the new-game initializer.
- New game `C7:5F4A` (from `C0:2D32`, or after a failed load): clears
  `$CF00`–`$CFFF`, `JSL $C00030` → `C0:3818` → `C0:5745` inventory init.
- Menu state: `$A202` = 0 game select with saves (3 without), 2 file list,
  10 save screen; `$A211` = cursor (game select: 1 GAME FILE, 0 NEW GAME;
  lists: slot).
- 32 KiB SRAM: the game only ever touches `$30:6000`–`7FFF`; with write and
  read watches on `$31`–`$33:6000`–`7FFF` (and `$B1`–`$B3`) from power-on
  through the opening and seven imported scenes nothing fires, and native
  saves/loads work (snes/test/core `wram`, `save`).

## WRAM

The port's claims (`7E:D700`–`DDFF` modules, `7E:6E40`–`6FFF` core,
`7E:7E40`–`7FFF` UI/spare) are written by no original code from power-on
through the title, name entry, the whole opening and 300 walking frames in
Potos, Sandship, Thanatos's arena, the Mana Beast, the Fortress and its boss
room and world flight (snes/test/core `wram`).

## FastROM

Evaluated with `-DCORE_FASTROM=1` (header map mode `$31`; `core_title_boot`
sets `MEMSEL` because `C1:4D0F` clears it on every title entry):

- The opening plays identically from power-on to the waterfall (4 frames
  sooner); field, Mode 7 world flight, the Mana Beast arena and Potos render
  correctly.
- Original code gains little: field frame logic ends 1–3 lines earlier in
  quiet scenes and up to 17–36 earlier in heavy ones (Mana Beast 94→83 p50,
  boss 488 212→195 p90, Sandship max 260→230); world flight is unchanged
  (its loop runs in bank `$00`, which stays slow). Module code in `$A0`–`$AF`
  runs 25% faster.
- Visible differences: mid-scanline splits that already exist move by a few
  pixels (the HUD split on line 195 starts at x=244 instead of 248; the last
  world-flight line samples differently), and animation phase shifts where
  the original lags.

FastROM is now the default (`-DCORE_SLOWROM=1` opts out). The October 18
gameplay pass also redirects verified hot native calls and hook continuations
through `$80/$81`, with original-byte assertions at every patched call.
These mirrors retain the low WRAM/IO mapping; the original `$00` outer loop,
interrupts and map-transition return stay in place. Core frame, input, OAM,
VRAM, save, world, lag, HDMA, WRAM and extended-ROM tests pass. The timing
measurements above describe the older experiment, before those call changes.

While Goku is active, the native party status/AI/animation pass updates the
girl in phase 1, Goku in phase 3 and the sprite in phase 2. Each still runs
once in every five completed field frames; movement, collision and drawing
run for everyone every frame. This spreads the original phase-3 CPU burst
without dropping updates. Before Goku's arrival and during native event
scripts, all three retain phase 3 so scripted party movements stay synchronized.
`-DCORE_PARTY_SYNC=1` restores the old schedule for comparisons. The core
`party` test counts 20 calls per actor across 100 field frames with Goku off,
on, a second player assigned and an event owning the field, and checks that
the actors stay active and their native timers advance 20 times. These calls
explicitly set DB to `$7E`, just as the original party wrapper does; counting
entry calls alone would miss reads from the wrong actor bank. The whip-pad
crossing tests the real scripted handoff.
