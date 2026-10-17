# Audio module: Secret of Mana's sound driver, DBZ effects, voices and new music

Spoilers follow the rest of `docs/agents/`. Module: `snes/src/modules/audio/`
(65816 code bank `$AA`, tables `$EA`, BRR/sequence assets in `$FC-$FF`,
WRAM `!RAM_AUDIO`), generators `snes/gen/audio*.mjs`, tests `snes/test/audio/`.

Everything below about the native driver was reverse-engineered from the US
cartridge (`snes/gen/audio-spc700.mjs` disassembles it) and cross-checked
against 277 ARAM/DSP snapshots of the browser mod (`.local/snes-import/`).

## 1. The native sound driver

### Boot upload

`C3:0000` (called once at boot) waits for the IPL (`$BBAA` on port 0) and
uploads six chunks with the IPL protocol, then jumps to `$0200`:

| # | Source (bank C3, `[u16 length][data]`) | ARAM | Length | Contents |
| --- | --- | --- | --- | --- |
| 0 | `C3:0748` | `$0200-$1597` | `$1398` | driver code and tables |
| 1 | `C3:2137` | `$2C00-$47FF` | `$1C00` | effect table (`$2C00`, 256 × 2 track pointers) and effect sequences |
| 2 | `C3:1AE2` | `$4800-$4DF0` | `$05F1` | effect BRR samples |
| 3 | `C3:20D5` | `$1900-$192B` | `$2C` | DIR entries 0-10 (effect samples) |
| 4 | `C3:2103` | `$1880-$1897` | `$18` | ADSR of instruments 0-11 |
| 5 | `C3:211D` | `$1800-$1817` | `$18` | tuning of instruments 0-11 |

Tables after the chunk list: `C3:0020` points at the song table `C3:3D39`
(64 × 24-bit pointers to `[u16 length][sequence]`), the instrument bank
`C3:3DF9` (33 × 24-bit BRR pointers), loop offsets `C3:3E5C`, tuning words
`C3:3E9E`, ADSR words `C3:3EE0` and per-song instrument lists `C3:3F22`
(16 × u16 ids per song). Echo presets: `C3:0708` (16 × EDL, EVOL, EFB, FIR).

### ARAM map

| Range | Use |
| --- | --- |
| `$0000-$00EF` | driver direct page (`$E3-$EF` and the gaps `$85,$86,$89,$8A,$8C-$8E,$91,$92,$95,$96,$98-$9A,$9D,$9E,$A1,$A2,$A4-$A6,$A8-$AB` are never referenced) |
| `$0100-$01FF` | per-track arrays `$0100-$017F`; stack from `$01FF` (≤ 8 bytes deep in all snapshots) |
| `$0200-$1597` | driver |
| `$1598-$17FF` | free |
| `$1800/$1880/$1900` | tuning / ADSR / DIR for instruments 0-63: 0-11 effects (boot), `$20-$3F` the current song (written by every song load), **12-31 unused** |
| `$1A00-$2BFF` | current song sequence (header + 8 tracks); longer songs run into the effect area and the loader restores it afterwards (`C3:067E`) |
| `$2C00-$47FF` | effect table and sequences (full) |
| `$4800-$4DF0` | effect samples |
| `$4DF1-ESA` | song samples, allocated by the CPU-side cache (below) |
| `ESA-$F9FF` | echo buffer, `ESA = $FA00 - EDL × $800` |
| `$FA00-$FBFF` | **free** |
| `$FC00-$FF88` | per-track state (`$FC00+X` … `$FF00+2Y` loop stacks, `$FF80-$FF87` effect id per voice, `$FF88` special instrument) |
| `$FF89-$FFFF` | **free** (IPL ROM is mapped out after boot) |

Free sample space is essentially zero in large songs: e.g. song `$2C` with
echo preset `$F` (EDL 6) leaves 52 bytes, Danger (`$04`, EDL 4) 287 bytes,
song `$0C` (EDL 2) 315 bytes. A resident bank of new samples is therefore
impossible without degrading native music; only the small regions marked
free above are guaranteed.

### CPU-side API

Callers write a 4-byte command to `$7E:1E00` (`[cmd, p1, p2, p3]`) and
`JSL $C30004` (`JMP $0160`; DP = `$1E00`, DB = 0 inside). Byte 0 is consumed
(zeroed). Main-thread only; it busy-waits on the ports.

| Command | Meaning |
| --- | --- |
| `01 ss p2 p3` | Play song `ss` (skipped if already current, `$1E05`). `p2` high nibble = fade-out speed of the previous song (sent as command `$83`), low nibble = echo preset (`C3:0708`); `p3` high nibble ×`$11` = start volume, low nibble ×`$11` = target, faded at the speed above. Events `$700+ss` hold the game's canonical parameters, e.g. Danger `01 04 04 FF`. |
| `02 ee p2 p3` | Effect `ee` (`$2C00 + 4·ee`, one or two tracks). `p3` = pan (start nibble low, target nibble high, 0 → centre), `p2` high nibble = pan-sweep time, low nibble ≠ 0 = reuse the voice already playing `ee`. |
| `10`-`1F` | Built-in UI sounds (`$153B` table; only 10-12 exist). |
| `80 xy` | Music volume fade: `x` ×16 ticks to volume `y·$11` (`80 80` = fade out, used before boss fanfares). |
| `83 x0` | Fade-out before a song change (sent by the loader). |
| `86`, `89` | Tempo / pitch modifier fades. |
| `F0`-`F2` | Stop music and/or effects (bit 0 keeps effects, bit 1 keeps music). |
| `F3`/`F4` | Stereo / mono. `F5 m` mutes the voices in mask m. `F6`/`F7` pause/resume music. `F8`/`F9` fast tempo on, `FA` off. `FC p` swaps effect stereo when p ≠ 0. |
| `FB` | Make every playing track take its next `FB` (CPU-controlled jump). |
| `FE` | Generic transfer (`$11EA`): port 1 low bits = mode (1: 3 bytes/handshake, 2: 2, 3: 1, 7: ARAM block copy, 0: end), ports 2-3 = address. |
| `FF FF FE FD FC` | Debug: ports report envelopes. |

Port protocol: the SPC latches ports 0-3 into `$B4-$B7`, echoes the command
on port 0, waits until the CPU changes port 0, clears port 0 and dispatches
(`$0CAF`; commands ≥ `$80` through the word table at `$14B2`, `$81,$82,$84,
$85,$87,$88,$8A-$8F,$FD` are no-ops). The CPU only ever reads ports 0
(handshakes), 1 (fade wait at `C3:01EB`) and 2 (music active, `C3:01A8`).

### Song loading (`C3:0198`)

1. Optional `83` fade, then the song command with `p1..p3`.
2. Echo preset (`C3:060A`): EDL/EVOL, then EFB/FIR index. A changed EDL frees
   cached instruments that would overlap the new echo region.
3. Sequence: mode-2 transfer of `[u16 len]` bytes to `$1A00`.
4. Instruments: the CPU keeps a 16-slot cache (`$7E:1E28` ids, `$1E48` start
   addresses from `$4DF1`, `$1E6A` sizes). Instruments the song needs
   (`C3:3F22`) are reused, missing ones are uploaded after compaction
   (mode 7 block copies), then tuning (`$1840`), DIR (`$1980`) and ADSR
   (`$18C0`) for list position k are sent: **the sequence selects list entry
   k with instrument number `$20+k`**.

The SPC side (`$0CF1`) KOFFs everything, re-inits echo (clearing the ring),
reads the header at `$1A00` and starts the eight tracks.

### Sequence format

Header (`$1A00`): u16 base address, 8 × u16 track pointers, u16 "no track"
marker, data from `$1A14`; the driver relocates pointers (and `FA`/`F9`/`FB`
operands) by `$1A14 - base`. Track bytes:

- `$00-$D1` note = index × 15 + length; index 0-11 = C-B in the current
  octave, 12 = tie, 13 = rest; lengths (ticks) `[192,144,96,64,72,48,32,36,24,
  16,12,8,6,4,3]`. A note is keyed off about one tick before the next event unless
  that event is a tie.
- `$D2-$FF` commands (operand counts from `$1484`): `D2 v` volume, `D3 t v`
  volume fade, `D4 p` pan, `D5 t p` pan fade, `D6 t s` pitch slide, `D7 d r a`
  vibrato, `D8` off, `D9`/`DA` tremolo, `DB`/`DC` pan LFO, `DD f` noise
  frequency, `DE`/`DF` noise, `E0`/`E1` pitch modulation, `E2`/`E3` echo on/off,
  `E4 o` octave, `E5`/`E6` octave ±, `E7 t`/`E8 t` transpose abs/rel, `E9 t`
  tuning, `EA i` instrument, `EB`-`EE` ADSR fields, `EF` default ADSR, `F0 n`
  loop start (body plays n+1 times; 0 = forever), `F1` loop end, `F2` end,
  `F3 t` tempo, `F4 t v` tempo fade, `F5`-`F7` echo (operands consumed, no
  effect: echo comes from the song command), `F8 v` master volume (`$AC`),
  `F9 n a` loop break, `FA a` goto, `FB a` CPU jump, `FC` loop reset, `FD i`
  instrument exempt from `F8`.

Timing: timer 0 at `8000/36` Hz = 222.2 ticks/s; each tick adds the tempo to
an 8-bit accumulator and a carry runs one sequencer tick, so ticks/s =
222.2 × tempo / 256. Effect tracks use a fixed tempo `$78` (104 ticks/s).

Pitch (`$04ED`): note n = octave·12 + index + transpose − 10; P =
table[n mod 12] (`$14F2`: `0879 … 1000` for index 11) shifted by n/12 − 4,
scaled by the instrument tuning t (`C3:3E9E` low byte, + `E9`): P·t/256 when
t ≥ `$80`, otherwise P·(1 + t/256); the high tuning byte adds a small fine
correction. n = 59 is the sample's unity rate. The browser renderer's note
N (unity at 57) is driver note N + 2; `snes/gen/audio-seq.mjs` has the exact
formula (`driverPitch`). Note: `mana-instruments.js` treats tuning bytes
below `$80` as t/256, which the driver does not; only percussion is
affected and the browser kit gives explicit pitches for those.

Volume (`$0B68`): music VOL = ((pan′ × v) >> 8) >> 1 with v = track volume ×
`$84` (song volume/fades) × `$AC` (`F8`); effects use v = track volume ×
`$90/256` instead. Pan `$80` = centre.

### Effects

Effect tracks (X = `$10`-`$1E`) share the eight DSP voices with music.
Allocation (`$0F11`/`$0E4C`): a voice already playing the same effect id
(`$FF80+v`) if `p2` low nibble ≠ 0, else the highest voice not in `$AE`
(two adjacent voices for two-track effects); if all voices are effect
voices the request is dropped. The music track on a stolen voice keeps
running silently and resumes at its next note.

## 2. What the browser mod used

- `native-sound.js` / `boss-victory.js` / `native-combat-sound.js` call the
  dispatcher with the commands above (`02 50 0F 88` hit, `02 94 0F 80` boss
  death, `80 80` fade, `01 18 44 8F` fanfare, `02 D8 00 88` acquire).
- `mana-instruments.js` reads the bank at `C3:3DF9` and `spc-score.js`
  renders the Frieza/Vegeta arrangements (`*-arrangement.js`) with its own
  voice model at 32 kHz. Those cues never reach the SPC; the vendored DSP has
  no echo at all.
- `ki-sound.js` mixes 21 DBZ clips and three loops in Web Audio (16 kHz,
  10-bit, compressor), `kamehameha-voice.js` a 3.7 s chant and 2.5 s shout.

## 3. Design

### Effects and voices: streaming

Holding the DBZ material in ARAM is impossible (section 1), so every DBZ
effect, loop and voice streams from ROM. `snes/src/modules/audio/spc/stream.s`
extends the driver (uploaded after it at boot):

- **Voices**: up to two stream channels claim voices like native effects
  (highest voice not in `$AE`), so music tracks skip them, and are masked out
  of the driver's two effect-track passes (`$02E1`, `$0378`), so no effect
  track drives them. On release the driver's EON/NON/PMON masks are rebuilt.
  KON/KOF go through the driver's own `$AF`/`$B0` (never in the same tick).
- **Chunks**: 14 slots of 4 BRR blocks at `$FA00`, a 7-slot ring per channel.
  Every chunk ends with END|LOOP; the ENDX bit marks the jump, and the
  handler (polled in the main loop, every tick and inside transfers) points
  the source's DIR loop pointer at the next ready slot or at a silence chunk.
  Underruns therefore play silence, never stale data.
- **Protocol**: port command `$8A` (a no-op slot in the driver's table) with
  3-byte groups and an exact-value counter handshake; a final group is
  acknowledged only after processing. Port 3 publishes per-channel
  consumed-chunk counters and active bits continuously (the driver's copy of
  `$AE` there is dropped; the CPU never read it).
- **Driver patches** (ARAM only, asserted against the ROM image): `$020A`
  DP clear limit, `$0279` main-loop poll, `$0299` port 3, `$02E1`/`$0378`
  effect-pass masks, `$02F4` tick hook, `$14C6` command `$8A`.

Rates and budget: clips are 12 kHz BRR (the browser's material is low-passed
at 5.6 kHz). One channel consumes ~3.1 chunks per 60 Hz frame; a transfer
costs ~49 µs per 3-byte group (SPC-bound), so ~2 ms per active channel per
frame. Seven slots give ~32 ms of buffer per channel (30 Hz scenes survive).

### Music

New songs use the five placeholder song ids `$3B-$3F` (all point at song
`$38`'s data; no event or map requests them), compiled from the browser
arrangements into the native format with the cartridge's own instruments, so
the native song command, fades and story events (`40 01 3B …`) work
unchanged. Details and per-song adaptations: section 5 (in progress).

## 4. API for other modules

Include the generated ids with `incsrc "audio/ids.asm"` (guarded, safe to
include from several modules). Every routine is `JSL` from main-loop code
(field, world, menu or ring frame logic, or a module frame callback), with
any M/X width; it preserves DB and D and, unless noted, A/X/Y. **Never call
them from NMI/IRQ code.** Requests are queued and served once per field or
world frame at `audio_frame` (the module's own frame callback, which runs
before the core's native sound pump), so the cost of a call is a few cycles.

| Routine | Input | Effect |
| --- | --- | --- |
| `audio_sfx` | A = `!AUDIO_SFX_*` | One-shot DBZ effect at the end of this frame. Up to 4 per frame. `hit` and `impact` sound at most once every 2 frames; `hit`, `swing` and `blast` step through the browser's clip and pitch variants (1, 1.035, 0.975); `revert` cuts a `transform` / `powerBurst` still sounding. |
| `audio_loop` | A = `!AUDIO_LOOP_*`, X = level 1-255 (255 = the cue's full gain), Y = rate (`$80` = 1.0, `$60`-`$A0` sensible) | Sustained bed. **Call every frame** while it should sound; it stops two frames after the last call. Level/rate changes are applied the frame they change (browser: charge `.48+.52·strength` gain, `.94+.12·strength` rate). |
| `audio_voice` | A = 1 chant, 2 release, 0 cut | Kamehameha voice: 1 starts the 3.7 s Japanese charge chant once per charge — calling it every charging frame is fine, it latches until 2 or 0; 2 replaces it with the release shout (call when the beam fires); 0 cuts the chant without a shout (cancelled charge). |
| `audio_cancel` | — | Browser `cancelCombat`: drops queued shots, the `charge`/`aura` beds and the chant. |
| `audio_stop` | — | Stops every stream at this frame's service. |
| `audio_song` | A = song id, X = p2 \| p3<<8 (0: `$10`, `$8F`) | Native song command `01` through `core_sound_queue` (sent at the end of the frame). |
| `audio_fade` | A = fade byte | Native command `80`: `$80` fades the music out (boss deaths), `$1A` ducks to `$AA` in 16 ticks, `$0F` restores. |

One-shots (`!AUDIO_SFX_*`, browser cue name in parentheses where it differs):
`SWING` 1, `KICK_SWING` 2, `HIT` 3, `KICK` 4, `BLAST` 5, `IMPACT` 6,
`DISTANT_IMPACT` 7, `BEAM` 8, `CHARGED` 9, `TRANSFORM` 10, `REVERT` 11,
`POWER_BURST` 12, `DEFLECT` 13, `BALLOON_POP` 14, `ICE_BREAK` 15,
`TELEPORT` 16, `TELEPORT_IN` 17, `FLIGHT` 18, `LANDING` 19, `FRIEZA_ORB` 20,
`FRIEZA_DISC` 21, `FRIEZA_LASER` 22, `FRIEZA_BEAM` 23, `FRIEZA_IMPACT` 24,
`FORTRESS_BREAK` 25, `FRIEZA_RUSH` 26, `VEGETA_BEAM` 27, `FRIEZA_LAUGH` 28,
`VEGETA_FINAL_FLASH` 29, `VEGETA_KAKAROT` 30, `KAME_CHARGE` 31,
`KAME_RELEASE` 32 (the last two are what `audio_voice` plays).
Loops (`!AUDIO_LOOP_*`): `CHARGE` 0, `AURA` 1, `AIR` 2, `FRIEZA_CHARGE` 3.

Gains, clips and rates come from `engine/ki-sound.js` (`cues`) at build
time; voice gains from `kamehameha-voice.js`. Mapping the browser's call
sites: `mod.playSound(name)` → `audio_sfx`; the per-frame `loop(name, on,
level, rate)` calls → `audio_loop` while `on`; `speech` (chant while
`charging`, shout on `beam`) → `audio_voice`; `cancelCombat` → `audio_cancel`.
The native-hit handoff (`native-combat-sound.js`: skip C0:4157 for Goku's
hits) belongs to combat, which then calls `audio_sfx` with `HIT`.

**Channels and priority.** Two stream channels play at once, beside the
native music and effects. Channel 0 takes voice-class cues (chant, shout,
Frieza's laugh, Vegeta's callouts); everything else takes channel 1, or
channel 0 when 1 holds something more important. Priorities (higher wins):
shout 11, voices 10, `TRANSFORM`/`POWER_BURST` 9, beams and `FORTRESS_BREAK`
8, `FRIEZA_ORB`/`REVERT` 7, teleports 6, hits/kicks/impacts 5, blasts and
small effects 4, flight/landing 3, swings 2, `DISTANT_IMPACT` 1. A request
that finds both channels busy with higher priorities is dropped (the
browser overlapped up to 12 sounds; the SNES cuts or drops). Loops yield to
any one-shot and restart when a channel is free again; `charge` > `aura` >
`FRIEZA_CHARGE` > `air`. A stream voice is taken from the music like a
native effect (highest voice no effect holds) and returned when it ends.

**Costs.** Each active channel streams 12 kHz BRR: about 3 chunks (39
groups, ~2 ms of CPU busy-wait) per frame while it plays, nothing when idle.
Menus and rings stop all streams.

**Test mailbox** (Mesen tests): word `!RAM_AUDIO+$16` = op | arg<<8 —
1 shot, 2 voice, 3 song, 4 stop, 5 loop on (kept every frame), 6 loop off,
7 fade, 8 native effect `02 arg 0F 88`.

## 5. Status

- Done: driver research (this page); SPC700 assembler/disassembler, BRR
  codec, S-DSP model with echo, APU harness running the real driver; stream
  extension; the 65816 module and API above; the 12 kHz DBZ/voice bank.
  `node snes/test/audio/run.mjs` runs the Node tests (gapless stream, natural
  end, stop/release, native effects beside two streams) and the Mesen test
  (from the waterfall checkpoint, with the current extension injected): a hit
  on the first free voice with full envelope and audible output, the chant
  beside the game's own hit effect, the shout, a 4 s charge loop and its
  stop, voices returned, native music before and after.
- In progress: the five songs (compiler `snes/gen/audio-music.mjs`).
