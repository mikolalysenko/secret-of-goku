# Audio module: native SNES effects and music

Spoilers follow the rest of `docs/agents/`. Module: `snes/src/modules/audio/`
(65816 code bank `$AA`, tables `$EA`, BRR/sequence assets in `$FC-$FF`,
WRAM `!RAM_AUDIO`), generators `snes/gen/audio*.mjs`, tests `snes/test/audio/`.

Everything below about the native driver was reverse-engineered from the US
cartridge (`snes/gen/audio-spc700.mjs` disassembles it) and cross-checked
against 277 ARAM/DSP snapshots of the browser mod (`.local/snes-import/`).

## Shipping sound policy (October 21, 2026)

Round-five resident custom-sample exploration: [sample budgets, auditions and
proposal](audio-samples.md). The prototype is test-only; the default cartridge
remains byte-identical to round four. It measures all 64 retail slots plus the
five arrangements, and supplies 32 kHz cue and storage-tradeoff listening pairs.

The default cartridge uses resident effects and streams only three rare
lines: Frieza's laugh, Vegeta's Final Flash and Vegeta's Kakarot. The
stream extension uploads once at boot. Seventeen resident effects occupy
slots `$DC-$EC`, alongside the retail `$00` laser and `$38` explosion. They
reuse boot instruments and finish within 2.6 seconds. **Impacts are designed
for punch, not browser-clip similarity.** Punches and kicks start at full
track volume with a short DSP-noise crack over a fast-dropping bass thump;
ki and beam contacts use the retail noise/boom explosion. Goku's Kamehameha
has a sustained, swelling noise roar with song echo and a low falling tone.
These four cues use two voices; other cues keep one. The native
`$12` rumble loop is no longer used by transformations; it never stopped
on its own. Contact has a stronger attack than an empty swing, and the
old two-voice, roughly two-second `$50` impact has a short replacement.
A priority selector sends at most one new effect per
frame and drops stale requests when a script or song owns the sound queue.
Charge beds pulse every 25 frames. Continuous flight noise is represented
by the takeoff/landing effects. The Kamehameha chant and shout remain off.
Native music and its arrangements remain enabled. Round four changes only
sequence bytes and one cue lookup byte: **zero changed 65816 instructions**,
no added upload, samples, per-frame selector or gameplay requests. Swing
whooshes and ki launches stay unchanged. Partial and full Super Saiyan waves
share the heavier, approximately 64-frame roar: a separate full-wave selector
was considered, but retaining the existing call sites adds no CPU instructions.
Existing beam contact pulses supply the explosions while it lands;
no new end-of-wave request is added.

`snes/src/modules/audio/native.asm` implements this policy behind the same
module API; `rare.asm` admits the rare lines. `-DAUDIO_PCM=1` restores the
historical all-cue streamer for diagnostics. The audio runner tests `native`,
`rare`, `rare-control` and `rare-boot` against the shipping ROM and explicitly
builds the PCM option for the historical streaming tests.
`node snes/test/audio/run.mjs native unit`
checks audible resident effects, bounded charge pulses, music continuity,
intact samples, per-cue one/two-voice budgets, automatic cue termination and the
absence of BRR stream commands. The SPC tests additionally check silent
tails, output headroom and unchanged retail effects/samples.

`resident.asm` uses **282 of 283 bytes** of sequence/table capacity: the original 144
zero bytes at `$2F70-$2FFF`, plus 139 bytes reclaimed by sharing identical
retail tracks. Every retail effect id and both of its tracks are preserved.
The existing boot and song-reload transfers already include these bytes,
so this adds no upload or 65816 instructions. The test importer restores the
whole effect block after a retail checkpoint, along with the boot extension.

### Resident storage proof

`snes/gen/audio-resident-storage.mjs` verifies each source span against its
identical destination, redirects all incoming effect-table pointers, and
rejects external fall-through or address-dependent jumps. The resident test
compares the complete sequencer byte stream of **both tracks of all 220
retail slots** before and after, and checks every other boot byte. No music,
sample or streaming-extension storage is reclaimed.

| Reclaimed ARAM (inclusive) | Bytes | Identical retained bytes | Retail table entries redirected |
| --- | ---: | --- | --- |
| `$379A-$37A9` | 16 | `$378A-$3799` | `$46` voice 1 |
| `$39E6-$39F8` | 19 | `$39D3-$39E5` | `$59` voices 0/1 |
| `$3A16-$3A28` | 19 | `$39D3-$39E5` | `$60` voices 0/1 |
| `$3A40-$3A56` | 23 | `$3A29-$3A3F` | `$69` voices 0/1 |
| `$3A89-$3ABA` | 50 | `$3A57-$3A88` | `$6B` voices 0/1 |
| `$3CC9-$3CD4` | 12 | `$3CBD-$3CC8` | `$8C` voice 1 |

The 17 pointer pairs occupy `$2F70-$2FB3` (68 bytes). The **214 unique
sequence bytes** are allocated below. This is 15 bytes more than round two's
199: the two contact effects share a 14-byte body, and the beam grows from
12 to 27 bytes. Only `$37A9` remains free. There are 20 logical tracks,
19 unique sequences. No additional retail span is reclaimed; `$38` needs
zero new bytes. ROM, boot upload and song-reload lengths are unchanged.

| Effect / name | ARAM (inclusive) | Bytes |
| --- | --- | ---: |
| $DC clink | $3A4C-$3A56 | 11 |
| $DD charge / Frieza impact | $3A16-$3A20 | 11 |
| $DE ki-blast | $3AA5-$3AAF | 11 |
| $DF charged | $3AB0-$3ABA | 11 |
| $E0 transform | $3CC9-$3CD4 | 12 |
| $E1 burst | $3A89-$3A96 | 14 |
| $E2 disc | $2FC2-$2FCC | 11 |
| $E3 air-release | $3A97-$3AA4 | 14 |
| $E4 boss beam | $2FCD-$2FD7 | 11 |
| $E5 punch-swing | $3A21-$3A28 | 8 |
| $E6 kick-swing | $2FD8-$2FE2 | 11 |
| $E7 punch crack, track 0 | $2FF9-$2FFF | 7 |
| $E8 kick crunch, track 0 | $39F2-$39F8 | 7 |
| $E7/$E8 shared bass body, track 1 | $2FB4-$2FC1 | 14 |
| $E9 distant-impact | $2FE3-$2FED | 11 |
| $EA beam roar/echo, track 0 | $379A-$37A8 | 15 |
| $EA beam low tone, track 1 | $39E6-$39F1 | 12 |
| $EB teleport-noise | $3A40-$3A4B | 12 |
| $EC air-rush | $2FEE-$2FF8 | 11 |

The single spare byte `$37A9` retains its original value. There is no room
for extra variant sequences without further storage work. Punch and kick
already differ in noise clock and transient length; random variant selection
would also require CPU work, which this round deliberately avoids.

The ten pointer words are at `$2D1A`, `$2D64/$2D66`, `$2D80/$2D82`,
`$2DA4/$2DA6`, `$2DAC/$2DAE`, and `$2E32`. ROM offset for any affected ARAM
byte is `$032139 + ARAM - $2C00` (CPU bank `$C3`). Each changed byte has an
original-byte assertion and a registered patch. The generated layout is in
`.local/snes-test/audio/audit/static.json` after `node snes/test/audio/audit.mjs`.
Finite play traces and literal scans cannot prove that computed native
sound ids are unused, so **no retail id is retired**. Sharing identical
tracks avoids that risk and preserves even unobserved effects.

Resident effect command `02` also uses an asynchronous CPU-side handshake
in the shipping build. The hook at `C3:0175` writes the four ports and
returns; `audio_native_poll` releases the SPC's echo on the next field,
world or menu callback, or before another command. A busy driver drops new
effects without changing pending parameters. Songs, fades and stop commands
first finish any pending effect and keep their native synchronous behavior.
The native effect test measures less than two scanlines per dispatcher call
(1.35 maximum in the October 18 run), checks audible cues and intact
parameters, then loads and restores music. This avoids the old effect
busy-wait; it does not eliminate the native song loader's transition pauses.
The pending byte is `$7E:DD5B`, in unused stream channel 1. That channel's
`$58-$5A` also hold the wake flag, request lifetime and pending rare cue.

### Measured resident cue palette

Shipping cue durations below use the round-four measurement: 5 ms RMS
windows, ending at -40 dB relative to peak RMS. Beam uses native echo preset
4 (EDL 4, EVOL 64, EFB 30, FIR 0); all other rows are dry. The actual beam's
echo follows the current song. Unchanged cues may differ by 5–10 ms from
round two's table because that table used 10 ms windows.

| Cue | Effect | Voices | Audible seconds |
| --- | --- | ---: | ---: |
| swing | $E5 | 1 | 0.220 |
| kickSwing | $E6 | 1 | 0.335 |
| hit | $E7 | 2 | 0.140 |
| kick | $E8 | 2 | 0.140 |
| blast | $DE | 1 | 0.680 |
| impact | $38 | 2 | 0.275 |
| distantImpact | $E9 | 1 | 0.450 |
| beam | $EA | 2 | 1.165 |
| charged | $DF | 1 | 0.220 |
| transform | $E0 | 1 | 2.525 |
| revert | $E3 | 1 | 0.440 |
| powerBurst | $E1 | 1 | 1.760 |
| deflect / balloonPop / iceBreak | $DC | 1 | 0.220 |
| teleport / teleportIn | $EB | 1 | 0.870 |
| flight / friezaRush | $EC | 1 | 0.450 |
| landing | $E3 | 1 | 0.440 |
| friezaOrb / fortressBreak | $E1 | 1 | 1.760 |
| friezaDisc | $E2 | 1 | 0.450 |
| friezaLaser | $00 | 1 | 0.420 |
| friezaBeam / vegetaBeam | $E4 | 1 | 1.370 |
| friezaImpact | $DD | 1 | 0.450 |

Held beds are unchanged: charge and friezaCharge use `$DD`, aura uses `$DF`,
one voice pulsed every 25 frames; air has no continuous voice. Keeping `$DD`
separate from the new `$38` impact prevents explosions during charging.
`combat/attack.asm` selects hit/kick on melee contact, blast at ki launch,
impact at native and virtual ki/beam contacts, and beam at charge release.
`world/bridge.asm` selects the same blast/beam/impact cues for aerial shots
and collisions; distantImpact stays separate. Pod/scenery callers of impact
also receive the explosion. Boss beams and Frieza's separate impact stay
unchanged. No call site or module outside audio was edited.

Punch and kick both use instrument 3 at octave 4, full track volume `$FF`,
a -24-semitone slide over 12 ticks and a 16-tick fade to zero. Their second
voice uses the driver's initial instrument 4 envelope (also `$FFE0`) with
DSP noise: clock 31 / 3 ticks for the punch, clock 29 / 6 ticks for the kick.
That is a 32 kHz crack or a darker 10.7 kHz crunch. The audible contact is
140 ms; the bass voice is returned by 170 ms, including driver setup. The
integrated voice ownership falls from **360 → 210 voice-ms** for punch and
**700 → 240 voice-ms** for kick despite the brief second voice.

The beam has 108 sequencer ticks (~1.04 s): clock-27 noise (6.4 kHz) swells
from `$80` to `$E0` in 12 ticks, holds, then fades over the final 12 ticks.
It enables the current song's echo. Instrument 1 at octave 3, volume `$C0`,
falls two octaves underneath it. The driver owns two voices for 1.05 s;
echo makes the audible preset-4 tail 1.165 s. This covers the full wave's
64 video frames (~1.065 s including effect startup). Integrated ownership
is **930 → 2100 voice-ms**, an intentional music-voice tradeoff for the roar.
The retail `$38` explosion owns two voices for up to 300 ms (**580 voice-ms**,
versus the old single voice's 470); its stronger later boom peaks at 78 ms.

### Round-four punch measurements and listening files

```
node snes/test/audio/punch.mjs --before=.local/snes-test/audio/baseline4/secret-of-goku.sfc
node snes/test/audio/punch.mjs --retail
```

The before cartridge is the strict build of base `d60fd07`. Both sides run
through the original SPC700 sequencer and sample-accurate S-DSP at 32 kHz,
with the same centred `02 ee 0F 88` command. There is no loudness normalization
or browser similarity score. The benchmark's time to peak starts at -60 dB
relative sample onset; onset latency is also in the manifest. Crest factor
is sample peak / RMS over the audible span. Band energies use Hann-windowed,
window-power-corrected FFTs over the first 80/30 ms from onset, in **FS² ms**
(0–200 Hz / 4–16 kHz). Duration uses the 5 ms RMS rule above.

| Cue | Version | Time to peak ms | Peak dBFS | Crest dB | <200 Hz, first 80 ms | >4 kHz, first 30 ms | Audible ms | Voices |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| hit | before | 1.97 | -13.07 | 12.51 | 0.20282 | 0.01613 | 320 | 1 |
| hit | after | 6.16 | -7.14 | 15.45 | 0.48868 | 0.10276 | 140 | 2 |
| kick | before | 2.03 | -12.94 | 12.57 | 0.33289 | 0.01135 | 660 | 1 |
| kick | after | 6.16 | -6.32 | 14.01 | 0.49967 | 0.26576 | 140 | 2 |
| impact | before | 0.72 | -15.90 | 6.39 | 0.00016 | 0.00004 | 450 | 1 |
| impact | after | 78.06 | -12.54 | 11.42 | 0.05215 | 0.04304 | 275 | 2 |
| beam (echo) | before | 377.31 | -12.14 | 8.66 | 0.00020 | 0.00005 | 1095 | 1 |
| beam (echo) | after | 716.16 | -6.39 | 9.98 | 0.29343 | 0.02457 | 1165 | 2 |

`.local/snes-test/audio/compare4/` contains `<cue>-before.wav`,
`<cue>-after.wav` and two `<cue>-altN.wav` auditions for each changed cue.
`manifest.json` gives the rendering context, metrics, voice ownership and
notes for every alternate. Punch/kick alternates vary noise clock or bass
pitch; impact alternates are longer retail explosions; beam alternates are
warmer/brighter noise clocks. Alternates are RAM-only auditions, not extra
shipping sequences. The broader retail audit is `retail.json`; raw exploratory
renders remain under `auditions/`. None of these generated files is committed.
The additional `beam-contacts-before.wav` / `beam-contacts-after.wav` pair
plays nine impact pulses six video frames apart over the roar, matching a
full wave hitting a surviving target. Both noise voices share the DSP's one
noise clock, so impacts also retune the roar while they play, as with retail
noise effects. This interaction is included in the headroom check below.

A rapid-contact/six-frame-impact wave render beside every arrangement has
zero clipped samples. Stereo output peaks for songs `$3B-$3F` are
**-3.60 / -2.08 / -2.91 / -3.51 / -3.36 dBFS**, leaving at least 2.08 dB of
measured headroom. Music
tracks stay alive, all effect voices return, and sample bytes remain intact.
These checks measure output and ownership; final listening approval belongs
to the maintainer, and real hardware has not been physically tested.

### Historical similarity auditions (rounds one and two)

`effects.mjs --search` remains available as a diagnostic. Round two measured
2,519 auditions / 2,457 eligible candidates and chose one-voice effects using
browser-clip scores. Its score combined duration, eight octave bands,
centroid, 32 RMS envelope bins and level. That objective is superseded for
this round's four changed cues; it is not a release gate. Unchanged cues
retain their round-two sequences exactly. Historical WAV pairs are generated
by `effects.mjs --wav --before=<round-one.sfc>` in `audio/compare/`; the new
punch comparison lives separately in `compare4/`. Storage and validation
history for earlier rounds remains below.

### Noise, music and call-site audit

`node snes/test/audio/audit.mjs --trace` scans decoded event commands,
conservative native command literals and dispatcher call sites, then traces
every `02 ee` dispatch in a 7,200-frame input session, all 21 imported debug
presets, and 1,200 frames of the power-on title (22 presets total). The
storage audit observed **1,130 effect commands**, including retail `$60`,
which remains intact through shared tracks. Static results: 74 event effect
commands, 20 native long dispatcher calls and 1,020 conservative literals.
The latter include data and computed native ids prevent an exhaustive
unused-id proof; none are retired. Outputs remain under
`.local/snes-test/audio/audit/`.

A control-flow walk of all **64 retail and 64 shipping song slots** finds
no `DD` or `DE` commands. The driver keeps the music clock at `$C5`, effect
clock at `$C6`, and selects the latter while effect noise is active
(`$B1.4`). `F2` sequence termination calls `$081D`, clears the effect NON
bit, and restores `$C5` when the last noise voice ends. The resident test
sets a distinct music clock and verifies restoration after both natural
termination and same-id replacement. The retail global-stop command clears
NON/ownership but leaves the last FLG clock; this is harmless with no song
noise, and the next music `DD`/`DE` selects its own clock again. Simultaneous
retail noise effects still share the hardware clock, as they always did.
No driver or extension patch was added.

`audio music` plays every cue beside each of the five arrangements. All
tracks remain alive, each cue stays within its one/two-voice budget and returns
its voices, song and effect samples remain byte-identical, and the extension and song echo
parameters remain intact. `audio songs` retains the complete historical
PCM song-load/restore coverage as well.

### Rare lines and admission budget

The shipping bank contains exactly these three clips, resampled from the
browser assets to **6 kHz**, pitch `$0300`. It uses 26,784 ROM bytes in `$FC`.
All other shot/loop stream records have zero volume and priority. Channel 0
uses one music voice; channel 1 stays idle. The existing extension footprint
and sample/echo allocations are unchanged (section 7). No PPU writes or DMA
are involved in streaming.

| Id / cue | Duration | BRR chunks | Codec SNR | CPU lines per transfer frame, mean / max |
| --- | ---: | ---: | ---: | ---: |
| 28 `friezaLaugh` | 4.440 s | 417 | 27.6 dB | 46.06 / 124.99 |
| 29 `vegetaFinalFlash` | 2.690 s | 253 | 21.4 dB | 43.57 / 102.07 |
| 30 `vegetaKakarot` | 0.782 s | 74 | 26.8 dB | 45.77 / 90.82 |
| 31/32 Kamehameha chant/shout | disabled | 0 | — | 0 streaming |

SNR is against the resampled source, not the original 16 kHz bandwidth.
CPU measurements include the complete `audio_frame` call on frames sending
`8A`, including its bounded echo wait; one scanline is 1,364 master clocks.
The quiet checkpoint plays 267/162/48 audible frames, respectively. Latest
service completion is line 172. These are rare but substantial CPU costs;
they are not part of the resident effect dispatcher.

Admission checks the existing native handshake before touching ports. A
request made while Goku charges or a Vegeta clash is active is dropped
immediately, including a previously deferred request. Otherwise it may wait
up to eight service frames for a free port and at least 26 lines of budget.
Longer retries kept the full service awake and cost a frame in the busy
trial even when no BRR ever played. Channel 0 starts with at most two chunks,
then sends at most three; 6 kHz consumes about 1.56 chunks per video frame.
The shipping transfer-budget cutoff is **line 176**, leaving room for the core's remaining
OAM/sound/event work before vblank at 225. The diagnostic deadline remains
218. The final control handshake completes by line 177 in the measured
fights (175 for the laugh). A new charge/clash cuts an active line; menus, cancellation and song
changes also release it. Pending STOPs retry without overwriting a native
effect's ports. Underruns play silence, never stale BRR data.

Browser trigger audit: `frieza.js` laughs after firing on attack cycles 2
and 8 (180-tick recovery, 140 enraged), at trial/reveal/taunt events, at the
tree arrival offset 8, and in Death Ball arrival/impact scenes. Final Flash
fires at gold beam age 1, before its 82-tick windup in `joch-trial.js`.
`vegeta-clash.js` requests Kakarot when focus becomes struggle; that struggle
lasts at least 240 ticks. The current SNES clash requests therefore get
dropped by the busy rule. All three lines are audible in the quiet fixture;
playing Kakarot during the actual clash is deliberately sacrificed to frame
rate, as permitted by the shipping policy.

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
| `$1598-$17FC` | shipping stream extension code; `$17FD-$17FF` unused |
| `$1800/$1880/$1900` | tuning / ADSR / DIR for instruments 0-63: 0-11 effects, `$20-$3F` song; extension uses `$1818-$183C`, `$1898-$18B8`, `$1930-$1977` |
| `$1A00-$2BFF` | current song sequence (header + 8 tracks); longer songs run into the effect area and the loader restores it afterwards (`C3:067E`) |
| `$2C00-$47FF` | retail effects plus 282 bytes of resident table/sequences in the spans documented above; only `$37A9` (1 byte) spare |
| `$4800-$4DF0` | effect samples |
| `$4DF1-ESA` | song samples, allocated by the CPU-side cache (below) |
| `ESA-$F9FF` | echo buffer, `ESA = $FA00 - EDL × $800` |
| `$FA00-$FBF7` | extension BRR chunk slots; `$FBF8-$FBFF` unused |
| `$FC00-$FF88` | per-track state (`$FC00+X` … `$FF00+2Y` loop stacks, `$FF80-$FF87` effect id per voice, `$FF88` special instrument) |
| `$FF89-$FFFA` | extension code; `$FFFB-$FFFF` unused (IPL ROM is mapped out) |

Free sample space is essentially zero in large songs: e.g. song `$2C` with
echo preset `$F` (EDL 6) leaves 52 bytes, Danger (`$04`, EDL 4) 287 bytes,
song `$0C` (EDL 2) 315 bytes. A resident bank of new samples is therefore
impossible without changing native audio or retiring existing features; only
the small remaining holes shown above are guaranteed. The
[round-five investigation](audio-samples.md) quantifies echo reductions,
retail-sample resampling, extension storage and a 1,800-byte custom BRR bank.

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
| `FE` | Generic transfer (`$11EA`): port 1 low bits = mode (1: 1 byte/handshake, 2: 2, 3: 3, 7: ARAM block copy, 0: end), ports 2-3 = address. Mode 4 is temporarily used by the accelerated song loader below. |
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

### Accelerated transfers (October 21)

`songload.asm` keeps that loader's cache, echo configuration, fades and
instrument metadata. At `C3:020F`, after KOFF and echo-write disable, it
uploads `spc/songload.s` into the **temporarily idle** `$FA00-$FBF7` stream
ring with FE mode 3 (438 bytes). The program uses only
native transfer scratch `$2C-$2F/$34-$35`. Mode 4 receives sequences/samples
in groups of four triples, with self-modified absolute stores and a
252-byte window. Mode 7 copies complete pages four bytes at a time through
self-modified absolute addresses, updating their high bytes once per page,
retaining forward-copy behavior for overlapping compaction moves. The
FastROM CPU sender also unrolls four triples and preloads the next packet
while the SPC stores the previous one. Source bank crossings, counter wrap
and ending a transfer after any triple are handled explicitly.

The CPU holds all data ports until acknowledgement; the SPC acknowledges
only after **all** packet bytes have been read. The resident native-mode
patches at `$1214-$1223` (triples) and `$1237-$1250` (words) follow the same
rule. The word receiver advances its pointer once per 256 bytes. Tests run
with zero delay and long, asymmetric delays between port writes and poison
all data ports immediately after an echo.
The native FE mode-4/7 vectors are restored before the CPU loader returns;
the ring belongs to streaming again when playback resumes. No extra resident
ARAM, WRAM, DMA or per-frame instructions are introduced. `$DD76-$DD77` is
existing song-only scratch. Diagnostic imports without the extension first
use mode 7 to copy seven existing driver instruction bytes into the word
receiver, moving its acknowledgement after both reads. Those copies are
idempotent and their source instructions are unchanged in either driver.
The repaired word bootstrap then installs mode 4 without a clock-ratio
assumption. Native and new-song loads through this fallback are tested.

For native songs, the loader sums the sequence and missing sample bytes.
Below 4096 bytes it skips the temporary-program upload and keeps native
FE modes 2/3, using pipelined CPU senders. This avoids an installation cost
on short or mostly cached cues. The five arrangements always use mode 4.

Instrument lists put shared instruments before the next cue's disposable
tail: arrival → battle, battle → orbit, and Vegeta → full power. The compiler
reassigns the sequence's `EA` indices together with each list; samples,
pitches, notes, envelopes and echo presets are unchanged. In particular,
battle's strike is last, so orbit's larger echo ring does not evict its
shared pick/stab samples.

The optional `SNES_LUA_PRELUDE=snes/test/audio/load-profile.lua` records
`song_load_profile` in any suite's results: fade, echo setup, sequence,
cache planning, compaction, instrument upload, tables, return and driver
start, plus every moved/uploaded byte count. Mode 7 acknowledges its length
before copying; its last move completes while the CPU waits at `C3:0423`.
The profiler accounts for that wait as compaction, rather than instrument
upload.

`node snes/test/audio/songload-bench.mjs` measures the SPC ceiling with an
always-ready producer and verifies every byte. The original receiver takes
21.34 cycles/byte (798 bytes/video frame); the final unrolled receiver takes
16.70 (1020 bytes/frame). Compaction falls from 29.03 to 14.38 cycles/byte.
These exclude CPU sender overhead; the Mesen timings below include it.

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

### Streaming protocol (shared with diagnostic PCM)

Holding the DBZ material in ARAM is impossible (section 1). Shipping uses
this protocol only for the three rare lines above. The historical
`AUDIO_PCM` diagnostic build streams every DBZ effect, loop and voice from
ROM. `snes/src/modules/audio/spc/stream.s`
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
- **Never blocking the game**: the driver polls the ports at least every
  ~8 ms while it plays (APU harness, busiest new songs plus two streams;
  median 36 µs), but not at all for ~15 frames after a song load while it
  clears its echo ring (`$132F`). The CPU therefore waits at most ~10-13 ms
  for the echo of `$8A`; if it does not come it writes 0 instead of the first
  group, and `ext_cmd` returns at once when it finds port 0 = 0 (it took the
  command just before the CPU gave up), so neither side is left waiting.
  Pending records stay pending; the next try comes 2 frames later (then 4,
  8 … 128 frames while misses continue) and only probes for ~1.5 ms until
  the driver answers again. Idle frames cost a few dozen cycles: with
  nothing playing or requested the service returns before touching the
  ports, and STOPs left by a song change ride along with the next transfer
  (the song start already silenced those voices). When the
  current song changes (`$7E:1E05`, whoever loaded it) the module holds
  transfers for 16 frames and drops both streams: the song start keyed
  every voice off and cleared `$AE`. A loop that its caller keeps
  requesting comes back by itself (Mesen: 2 frames after the new song's
  tracks start).
- **Bounded frame budget**: the service runs last in the field and
  world module tables, and chunk admission stops at scanline 176 in shipping
  (218 in diagnostic PCM; vblank at 225):
  it starts only with 6 scanlines left, the echo wait lasts at most until
  the limit (~15 tries per line), each chunk is sent only while 20 lines are
  left, and if the frame runs out the CPU sends an end record (byte 0 = 0;
  `ext_cmd` jumps to its end) and the rest goes out next frame. A static
  estimate (`au_budget`) already trims the announced chunks, channel 0
  getting at most half when both want more than fits.
- **Extension handshake**: the end group comes back as counter | `$80`
  from the extension and as the plain counter from an unextended driver (an
  imported browser state); then the module switches streams off (`au_flags`
  bit 6) instead of feeding a driver that never plays them. The first
  diagnostic PCM service after boot, title or an import sends both STOPs at once (when the
  song hold-off allows), so this is known before the first cue.
- **Driver patches** (ARAM only, asserted against the ROM image): `$020A`
  DP clear limit, `$0279` main-loop poll, `$0299` port 3, `$02E1`/`$0378`
  effect-pass masks, `$02F4` tick hook, `$14C6` command `$8A`.

Diagnostic rates and budget: clips are 12 kHz BRR (the browser's material is low-passed
at 5.6 kHz). One channel consumes ~3.1 chunks per 60 Hz frame. Measured in
Mesen (arrival scene): a 3-byte group costs ~95 µs (1.5 scanlines; the
SPC700's receive loop is 59 cycles, the CPU's about as long), so a chunk is
~20 lines and one playing stream ~60 lines a frame, plus the wait for the
driver to notice the command (median well under a line, up to ~8 ms when it
is inside a tick). Seven slots give ~32 ms of buffer per channel; frames
that run out of time send less and the ring absorbs it. Shipping uses 6 kHz
and about 75 ms of ring capacity; measured CPU costs are in the shipping
table above.

### Music

The five new cues are ordinary native songs. They take the placeholder song
ids `$3B-$3F` (all five pointed at song `$38`'s data; no event or map asks for
them) and are compiled at build time from the browser arrangements
(`engine/mana-arrangements.js`, the same scores `spc-score.js` renders) into
the driver's sequence format, using the cartridge instruments the browser kit
(`mana-score-kit.js`) samples. The native loader uploads them, so the song
command, the game's fades, the instrument cache and story events work
unchanged.

| Id | `!AUDIO_SONG_*` | Browser cue | BPM (browser) | Sequence | Instruments (sample bytes, free before echo) | Echo EDL/EVOL/EFB |
| --- | --- | --- | --- | --- | --- | --- |
| `$3B` | `FRIEZA_ARRIVAL` | `arrival` ("Five Minutes") | 71.6 (72) | 1913 B | 10 (32562, 1245 free) | 5 / 70 / 60 |
| `$3C` | `FRIEZA_BATTLE` | `battle` | 151.9 (152) | 3786 B | 10 (34983, 872) | 4 / 64 / 30 |
| `$3D` | `FRIEZA_ORBIT` | `orbit` | 166.0 (166) | 4231 B | 10 (30258, 1501) | 6 / 58 / 52 |
| `$3E` | `VEGETA` | `vegeta` | 132.4 (132) | 2595 B | 10 (27945, 3814) | 6 / 62 / 56 |
| `$3F` | `VEGETA_FULL_POWER` | `vegeta-full-power` | 151.9 (152) | 2911 B | 11 (29178, 4629) | 5 / 60 / 40 |

**Compiler** (`snes/gen/audio-music.mjs`, driven by `buildSongs` in
`snes/gen/audio.mjs`): each arrangement voice becomes one of the eight
tracks. Notes, ties and rests are split into the driver's fixed lengths
(48 ticks per beat), with gates chosen so the driver's key-off lands where the
browser's note ends. Pitch is exact (`driverNote` = browser note − 2, with
the instrument tuning the loader sends). Volumes go through a 0.75 dB ladder
and are re-sent only when they move by more than the song's step (1.2 dB, or
1.5 dB for the orbit, which otherwise overflows). Repeated 1-4 bar phrases
become `F0`/`F1` loops. The browser's sine vibrato maps to the driver's
centred square LFO (`D7 delay rate $C0|depth`, depth × 0.75). Pan, echo
enable, tempo (`F3`) and a per-song master volume (`F8`, calibrated so the
cartridge plays at the browser's level) come first in each track. The
loader's limit is 4608 sequence bytes ($1A00-$2BFF); the build fails if a
song is over it, or if its samples would run into the echo buffer.

**Instruments**: the per-song lists at `C3:3F22 + 32·id` name the ROM
instruments the browser kit uses for each patch. Changes forced by the ARAM
budget (samples plus echo must fit between `$4DF1` and `$FA00`): the open
hi-hat plays the closed `hat`; `harp` is `pickHigh` in the two Frieza combat
cues; muted (their notes are left out) are `crash` (all), `strike` (arrival,
orbit, both Vegeta cues), `snare` (arrival) and `choir` (Vegeta).

**Echo**: the loader normally takes the echo setting from one of 16 presets
(`C3:0708`, index = `p2` low nibble). None fits the arrangements, so four
`JSL` hijacks in `C3:060A` read EDL, EVOL, EFB and the FIR set from
`audio_echo_table` when the song being loaded is `$3B-$3F` (any `p2`). The
values are the browser's, except the arrival's delay (EDL 5 instead of 7, to
leave room for its samples). FIR set 0 is the flat filter the browser
renderer uses.

**How close it is** (`node snes/test/audio/run.mjs render`, each whole song
through the real driver in the APU harness vs `renderSpcScoreSync` at the
browser's output gain 0.32): level −0.2 … +0.2 dB, per-bar loudness
correlation 0.94-0.97, octave bands 62 Hz-8 kHz within 2 dB, all tracks
alive to the end.

**Load time**: like every native song change, the loader runs on the main
thread: the previous song fades (`p2` high nibble = speed; 0 cuts it and
skips the fade wait), then the sequence and any instruments not already
cached go up, then the driver clears its echo ring and starts. The browser
stops one cue and starts the next at once, so the module's song calls cut
the old song (`p2` high nibble 0). Mesen `songs` comparison against `ed7088b`,
in the order waterfall `$1C` → arrival → battle → orbit → Vegeta → full power:

| Song | Game-loop stall before → after (frames) | Tracks start before → after (frames) |
| --- | ---: | ---: |
| `$3B` arrival | 47 → 31 | 61 → 45 |
| `$3C` battle | 42 → 30 | 56 → 41 |
| `$3D` orbit | 14 → 8 | 29 → 27 |
| `$3E` Vegeta | 50 → 30 | 66 → 46 |
| `$3F` full power | 12 → 11 | 27 → 27 |

The following profile is the same final `songs` run. Times include fractions
of a video frame. Sequence includes installing the temporary program;
tables includes native metadata and any effect-sequence restoration.
Fade dispatch, cache planning and final return together take <0.16 frame.

| Song | Echo setup | Sequence | Compaction | Missing instruments | Tables | Driver start after CPU returns |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `$3B` | 0.50 | 2.73 | 13.78 | 13.76 | 0.44 | 13.30 |
| `$3C` | 0.50 | 4.82 | 8.69 | 15.84 | 0.44 | 10.26 |
| `$3D` | 0.50 | 5.29 | 0 | 2.06 | 0.44 | 18.19 |
| `$3E` | 0.49 | 3.50 | 19.02 | 6.28 | 0.45 | 15.76 |
| `$3F` | 0.50 | 3.82 | 0 | 5.83 | 0.46 | 15.95 |

Frieza's actual `music` case improves **53 → 44** stalled frames. Its
sequence takes 5.87 → 4.80 frames, compaction 6.85 → 3.45 and uploads
39.27 → 34.35; echo setup remains 0.50. The post-return driver start takes
10.13 → 13.51 frames, depending on DSP/echo phase. The echo clear/start
algorithm is unchanged and runs while the game resumes. The profile
therefore supports faster copying/transfers and cache order, rather than
changing the audible echo settings or adding a fixed wait.

`loads` walks all 59 retail songs in id order with their canonical event
echo/volume parameters, cutting the old cue for comparable timing. Every
native stall is unchanged or shorter within 0.01 frame. Examples (fractional
frames, from entry to CPU return / track start):

| Native song | Stall before → after | Load before → after |
| --- | ---: | ---: |
| `$04` | 43.01 → 37.51 | 61.66 → 47.67 |
| `$0C` | 46.57 → 40.60 | 56.65 → 46.67 |
| `$1C` | 22.21 → 19.85 | 29.64 → 27.66 |
| `$2C` | 37.96 → 31.09 | 63.65 → 48.65 |

Cache state changes these numbers; the native sweep reaches the five new
songs with a different cache from `songs`. Cues sharing instruments load
faster. The cartridge still cannot switch instantly: change songs at scene
or phase boundaries. Native fades requested explicitly in `p2` are retained.

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
| `audio_sfx` | A = `!AUDIO_SFX_*` | Queues up to four requests; one priority-selected resident effect per frame. Only ids 28-30 can stream, subject to the admission rule above. Diagnostic PCM also supports clip/pitch variants and overlapping effects. |
| `audio_loop` | A = `!AUDIO_LOOP_*`, X = level 1-255, Y = rate (`$80` = 1.0) | **Call every frame** while held. Shipping emits bounded 25-frame native pulses; requests expire after two unrefreshed frames and the last pulse finishes. AIR adds no continuous voice. Exact level/rate modulation is diagnostic PCM only. |
| `audio_voice` | A = 1 chant, 2 release, 0 cut | Shipping no-op. Diagnostic PCM starts the Japanese chant once per charge, replaces it with the release shout, or cuts it. |
| `audio_cancel` | — | Drops queued combat sounds, held beds and any rare stream. Resident effects finish their bounded tails. |
| `audio_stop` | — | Stops every stream at this frame's service. |
| `audio_song` | A = `!AUDIO_SONG_*` (or a native song id), X = p2 \| p3<<8 (0: `$00`, `$FF`) | Native song command `01` through `core_sound_queue` (sent at the end of the frame). The default cuts the old song, as the browser switches cues, and starts the new one at full volume. For a native song pass its canonical `p2`/`p3` (they pick its echo preset). |
| `audio_song_restore` | — | Back to the scene's own music: the last native song the module saw playing, with its echo preset and `p3` (the old song is cut, as the browser stops its cue). Does nothing if no native song played since power-on. |
| `audio_fade` | A = fade byte | Native command `80`: `$80` fades the music out (boss deaths), `$1A` ducks to `$AA` in 16 ticks, `$1F` back to full in 16 ticks, `$0F` at once. |

One-shots (`!AUDIO_SFX_*`, browser cue name in parentheses where it differs):
`SWING` 1, `KICK_SWING` 2, `HIT` 3, `KICK` 4, `BLAST` 5, `IMPACT` 6,
`DISTANT_IMPACT` 7, `BEAM` 8, `CHARGED` 9, `TRANSFORM` 10, `REVERT` 11,
`POWER_BURST` 12, `DEFLECT` 13, `BALLOON_POP` 14, `ICE_BREAK` 15,
`TELEPORT` 16, `TELEPORT_IN` 17, `FLIGHT` 18, `LANDING` 19, `FRIEZA_ORB` 20,
`FRIEZA_DISC` 21, `FRIEZA_LASER` 22, `FRIEZA_BEAM` 23, `FRIEZA_IMPACT` 24,
`FORTRESS_BREAK` 25, `FRIEZA_RUSH` 26, `VEGETA_BEAM` 27, `FRIEZA_LAUGH` 28,
`VEGETA_FINAL_FLASH` 29, `VEGETA_KAKAROT` 30, `KAME_CHARGE` 31,
`KAME_RELEASE` 32 (the last two remain disabled in shipping).
Loops (`!AUDIO_LOOP_*`): `CHARGE` 0, `AURA` 1, `AIR` 2, `FRIEZA_CHARGE` 3.

Gains, clips and rates come from `engine/ki-sound.js` (`cues`) at build
time; voice gains from `kamehameha-voice.js`. Mapping the browser's call
sites: `mod.playSound(name)` → `audio_sfx`; the per-frame `loop(name, on,
level, rate)` calls → `audio_loop` while `on`; `speech` (chant while
`charging`, shout on `beam`) → `audio_voice`; `cancelCombat` → `audio_cancel`.
The native-hit handoff (`native-combat-sound.js`: skip C0:4157 for Goku's
hits) belongs to combat, which then calls `audio_sfx` with `HIT`.

**Diagnostic PCM channels and priority.** Two stream channels play at once, beside the
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

**Diagnostic PCM costs.** Each active channel streams 12 kHz BRR: about 3 chunks (39
groups, ~4 ms of CPU busy-wait, ~60 scanlines) per frame while it plays,
never past scanline 218, nothing when idle (an idle frame returns before
touching the ports). Menus and rings stop all streams. For 16 frames after any song change no
stream starts (requests wait, see "Never blocking the game"), and a song
change cuts whatever streams were playing, as it cuts native effects.

**Music cues.** The browser picks one cue per frame (`frieza-score.js`:
`mod.trial?.music ?? mod.frieza?.music`) and plays it over the native
music, which it keeps playing at gain 0.018. On the cartridge the cue *is*
the native song, so whoever drives the scene changes the song when the
browser's choice changes:

| Browser condition | Cue | Cartridge |
| --- | --- | --- |
| `frieza.js` stage `theft` or `showdown`, an entrance scene (`eighth`, `emperor-wait`, `altar-leave`, `trial-entry`, `trial-taunt`, `empower`, `trial-leave`) or a `tree-*` scene other than `tree-leave` | `arrival` | `$3B` |
| stage `battle` on the ground, or the `gold` scene | `battle` | `$3C` |
| stage `battle` with `boss.space`; after the win until the white-out (`victoryTiming.impact + bossVictoryTiming.white`) | `orbit` | `$3D` |
| `joch-trial.js` trial active and Vegeta spawned | `vegeta` | `$3E` |
| the same at `tier` ≥ 1, in the `transform` phase or the `draw` | `vegeta-full-power` | `$3F` |
| none of these (or `mod.ending` active) | native | `audio_song_restore` |

Module code calls `audio_song` with the id (X = 0) on the frame the cue
changes and `audio_song_restore` when it ends. Event scripts use opcode `40`
(it forwards four bytes to the sound driver): `40 01 3B 00 FF` starts the
arrival with the old song cut, and `40 01 <song> <p2> <p3>` with the map's own values restores
native music. A map change restores it anyway (the map's song command
loads its song). The game's own boss-death fade (`80 80`) fades the new songs
like any other; the browser fades its cue into the white-out the same way.
The browser also lowers its cue by 3.3 dB while Goku charges
(`mod.charging`); `audio_fade` `$1A` / `$1F` around the charge does the same
(not automatic: the module cannot tell a restore from a fade someone else
sent). Each change stalls the game loop for the upload (section 3, Load
time), so change songs at scene or phase boundaries, not every few frames.

**Goku's arrival** (title module): `audio_frame` reads `!title_sfx`
(`$7E:DD87`, set by `title_field_frame` earlier in the same frame): 1 plays
`FLIGHT` (the browser's `playSound('flight')` when the pod's descent
begins), 2 plays `IMPACT`; it then clears the byte. Mesen (imported probe
state, extension injected): the descent starts at frame 145 and its sound
is audible at 146, the impact at 205 and 205.

**Destructible scenery** (destroy module): `audio_frame` compares the low
byte of `!out_sfx` (`$7E:D9BE`, one count per applied row or broken barrier,
the browser's `playSound('impact')` in `lab.js` / `native-barriers.js`)
with the value it saw last and plays `IMPACT` when it moved (`IMPACT`
sounds at most once every 2 frames); before the first sync after boot or
an import it only takes the count. The stream test checks it.

**Test mailbox** (Mesen tests): word `!RAM_AUDIO+$16` = op | arg<<8 —
1 shot, 2 voice, 3 song, 4 stop, 5 loop on (kept every frame), 6 loop off,
7 fade, 8 native effect `02 arg 0F 88`, 9 `audio_song_restore`.

## 5. Status

Done: measured resident palette and three rare 6 kHz lines; driver research
(this page); SPC700 assembler/disassembler, BRR codec,
S-DSP model with echo, APU harness running the real driver; the stream
extension; the 65816 module and the API above; the 12 kHz DBZ/voice bank;
the five songs; the arrival's pod cues.
`node snes/test/audio/run.mjs` runs all of the following:

- **unit** (Node): assembler round trip, BRR, DSP model, the extension's
  ARAM footprint, a gapless stream, native effects beside two streams, a
  withdrawn command (taken or not, with and without the extension) leaving
  the driver answering; shipping bank whitelist; resident preservation,
  termination, one-voice allocation, noise-clock restoration and headroom;
  independent-clock song transfers and overlapping/consecutive cache copies
  (19 Node tests).
- **loads** (shipping Mesen): all 59 retail songs and five new songs, native
  event echo/volume parameters with the old cue cut for comparable timing;
  complete sequence and instrument BRR bytes, DIR/tuning/ADSR, restored
  transfer vectors, effect samples and audible output. Reports fractional
  load/stall frames per song. `$1A` has an authored silent opening and is
  observed for three seconds.
- **native**: all 27 cues, bounded beds, no BRR, asynchronous command
  integrity and dispatcher timing, music before/after song changes.
- **music** (shipping Mesen): all 27 resident cues beside all five new songs;
  tracks alive, one stolen voice per cue, voices returned, sample/extension
  integrity, noise restoration and unchanged echo parameters.
- **rare / rare-control / rare-boot**: all three clips audible and ending,
  pitch `$0300`, Kamehameha silent, intact music/effect samples and extension,
  native effects beside a line, deadline/CPU measurements; busy requests
  dropped, cancellation, menu/ring callback, song changes; actual boot upload.
- **render** (Node, ~15 s): each song through the real driver in the APU
  harness against the browser renderer: level within 1 dB, per-bar loudness
  correlation > 0.9, octave bands within 3 dB, every track alive, sequence
  ≤ 4608 bytes, no clipping. Results in `.local/snes-test/audio/render.json`.
- **stream** (Mesen, waterfall checkpoint, current extension injected): a
  hit on the first free voice with full envelope and audible output, the
  chant beside the game's own hit effect, the shout, a 4 s charge loop and
  its stop, voices returned, native music before and after; a move of
  destroy's `!out_sfx` starting `IMPACT`.
- **songs** (Mesen): each new song through the native song command:
  sequence intact at `$1A00`, the tracks start, echo EDL/EVOL/EFB and ESA
  as in `audio_echo_table`, instruments allocated after the effect samples
  and before the echo buffer, all eight tracks alive for 4 s, and exactly the
  voices the APU harness predicts sounding (FF / 0F / 0B / 7B / 7F); the
  native effect samples and the extension's code byte-identical after each
  upload and 4 s of echo; load and
  stall frames (section 3); a song change while the charge loop plays (loop
  silenced by the song start, back on its voice, released after); the game's
  fade; `audio_song_restore` back to `$1C` with its echo preset and `p3`.
- **arrival** (Mesen, the browser state before the sword pull, imported,
  extension injected): `FLIGHT` streams within 1 frame of the descent,
  `IMPACT` with the impact, `!title_sfx` never left set.
- **imported** (Mesen, the same state without the extension): streams are
  switched off after the first sync, a requested hit never reaches a voice,
  the game's own effect still answers, and native/new song transfers keep
  their full sequence and samples intact through the fallback bootstrap.

Additional cross-core check: run `node snes/test/emulators/run.mjs`, then
`node snes/test/audio/cores.mjs`. It uses each core's waterfall battery save,
loads all five new cues and restores native music in Snes9x, bsnes and
bsnes-accurate, verifies complete sequence/BRR bytes, DIR/tuning/ADSR, live
tracks and restored FE vectors directly in serialized ARAM. Private states
are deleted after verification. A worktree can set `SNES_RETRO_HOST` to a
binary under its own `.local/snes-test/`, avoiding writes into shared tools.

`snes/test/title` (arrival e2e, with the extension) checks that no frame of
the impact is made late by the modules: 0 of 140 with both pod sounds
streaming.

### Song-loading validation (base `ed7088b`)

Strict shipping and diagnostic builds pass. All audio cases pass: 19 Node
tests, browser music rendering and ten Mesen cases, including all 59 retail
songs and the five arrangements. All three emulator variants pass both the
normal boot/play/save/load suite and the additional song/ARAM checks:
Snes9x, bsnes and bsnes-accurate. Transfer tests vary producer delays and
overwrite ports immediately after acknowledgement; copy tests cover
unaligned, overlapping and consecutive moves.

Frieza **18/18**, Vegeta **11/11** and story **76/76** pass. The final
diagnostic-import bootstrap repair is additionally checked on both retail
and extended drivers, repeated twice, with data ports poisoned immediately
after each acknowledgement; its native/new-song import case passes too.
All 64 shipping load/stall measurements are identical after that import-only
repair.

All 13 gameplay cases have identical `audio_frame` mean, maximum and call
count before/after, with no new missed vblanks. Existing misses per 240
frames remain fly 1, fly-ki 2, fly-punch 1, teleport 3 and charge 18; all
other cases are zero. All six perf scenes pass: p90 finish lines
62 / 113 / 54 / 173 / 95 / 112, lag counts 4 / 4 / 4 / 34 / 4 / 4.

`modprof` on identical sword/battle states and fresh battery saves reports
**0.40 → 0.40 lines mean** in both scenes; maxima **1.80 → 1.80** and
**1.83 → 1.83**. These include the existing song-settle frames; the quiet
frame instructions are unchanged. Use isolated ROM filenames/fresh saves
for this comparison: the retail states only contain 8 KiB SRAM, so a
previously played cartridge's expanded battery sidecar can change which
modules are active. Real hardware has not been physically tested. No core
change is required.

### Round-four validation (base `d60fd07`)

Strict shipping build passes. `audio` passes all **21 Node tests**, five-song
reference renders and **10 Mesen cases** (`loads`, `native`, `music`, `rare`,
`rare-control`, `rare-boot`, `stream`, `songs`, `arrival`, `imported`). The
historical streaming cases use the explicitly built strict PCM diagnostic
cartridge. The final six-frame-impact stress check also passes separately
through the real driver/DSP; it checks output headroom, live music tracks,
sample integrity and returned voices. All **37 combat**, **18 Frieza** and
**11 Vegeta** cases pass, as do all six perf scenes. The older `effects.mjs`
diagnostic report still runs with the new two-track cues.

All 13 gameplay cases pass with exactly the same misses as the baseline:

| Gameplay case | Before misses | After misses |
| --- | ---: | ---: |
| solo-punch | 0/240 | 0/240 |
| solo-ki | 0/240 | 0/240 |
| walk | 0/240 | 0/240 |
| punch | 0/240 | 0/240 |
| ki | 0/240 | 0/240 |
| fly | 2/240 | 2/240 |
| fly-ki | 2/240 | 2/240 |
| fly-punch | 1/240 | 1/240 |
| water-flight | 0/240 | 0/240 |
| teleport | 3/240 | 3/240 |
| charge | 19/240 | 19/240 |
| focus-grass | 0/240 | 0/240 |
| transform-grass | 0/240 | 0/240 |

Palette, stamina, sprite-overflow, vblank-overrun and graphics-DMA-overrun
checks pass in every case. `audio_frame` call counts and maxima match the
baseline in all 13 cases; means match in 12. The punch mean changes from
**0.7592986 to 0.7660740 lines/frame (+0.0067754)**, with its maximum still
2.9912023. This small observed timing difference is reported rather than
claiming identical busy-frame CPU time. No gameplay miss was added.

`modprof` on identical sword/battle states with private ROM filenames and
fresh battery saves reports **0.40 → 0.40 lines mean, 1.83 → 1.83 max** in
both scenes, including existing song-settle frames. Native effect dispatch
still peaks at **1.346041 lines**. Perf p90 build finish lines are
**63 / 113 / 54 / 173 / 95 / 112**, with lag counts **4 / 4 / 4 / 34 / 4 / 4**
(sword, Sandship, battle, Beast, Fortress, flight); all pass the suite's
retail comparison.

`audio/audit.mjs --before=<baseline4/secret-of-goku.sfc>` reports **200 changed
ROM bytes**, confined to resident effect data, the cue-id lookup, checksums
and ExHiROM mirrors; **zero changed 65816 instructions**. Music, samples,
rare clips, extension, song-loader code and all other modules are byte-identical.
The new footprint is 282/283 resident bytes, up 15, with no added transfer
bytes or RAM allocation. The implementation checkpoint is `fb526f1`;
private logs and the listening manifest remain under this worktree's
`.local/snes-test/audio/`.

No core or other-module change is requested. Partial and full waves share
the new cue. Maintainer listening review and physical hardware testing
remain outstanding; both are separate from the passing emulator checks.

### Round-two validation (base `1d19d44`)

Strict shipping build passes. All audio cases pass (14 Node tests, full
song rendering, and nine Mesen cases including the added shipping `music`
case). Combat **36/36**, Frieza **17/17**, Vegeta **11/11**, and all six perf
scenes pass. The songs tests verify live tracks and intact samples; rare
voice, admission, cancellation and boot tests all pass unchanged.

| Gameplay case | Before misses | After misses |
| --- | ---: | ---: |
| solo-punch | 0/240 | 0/240 |
| solo-ki | 0/240 | 0/240 |
| walk | 0/240 | 0/240 |
| punch | 0/240 | 0/240 |
| ki | 0/240 | 0/240 |
| fly | 1/240 | 1/240 |
| fly-ki | 3/240 | 3/240 |
| fly-punch | 2/240 | 2/240 |
| water-flight | 0/240 | 0/240 |
| teleport | 3/240 | 3/240 |
| charge | 22/240 | 22/240 |
| focus-grass | 0/240 | 0/240 |
| transform-grass | 0/240 | 0/240 |

Every gameplay case also has exactly identical `audio_frame` **mean,
maximum and call count**. `modprof` on shared sword/battle states is
**0.40 → 0.40 lines mean, 1.83 → 1.83 max**, including song-settle frames;
the dispatch maximum is **1.346 lines**, unchanged. The perf scenes finish
at p90 lines 61 / 111 / 52 / 172 / 93 / 112, with lag counts
4 / 4 / 4 / 34 / 4 / 4. No new gameplay misses or 65816 CPU work.

`node snes/test/audio/audit.mjs --before=<round-one.sfc>` verifies the entire
ROM differs only in the effect block, the 34-byte cue-id lookup, checksums
and their ExHiROM mirrors. Instruction bytes, music, samples, rare voices,
extension and other modules are identical. Private results and comparison
WAVs remain in this worktree's `.local/snes-test/audio/`.

Round-one shipping validation on October 20: strict builds (shipping, diagnostic PCM,
Vegeta/Frieza test flags); all audio, gameplay, Frieza, Vegeta, combat and
perf cases pass. Gameplay before → after misses per 240 frames: charge
22 → 22; teleport 3 → 3; flight/fly-ki/fly-punch 1/3/2 → 1/3/2;
punch, ki, walking, water flight, focus and transform remain zero.

`modprof` audio mean falls from 1.86 to **0.40 lines** in sword/battle
(including 16 song-settle frames; steady idle is about 0.32). Dispatcher
maximum is unchanged at **1.346 lines** in `native`. The six perf scenes'
build p90 finish lines before → after are 63→61, 113→111, 54→52, 173→172,
95→93, 114→112; their lag counts remain 4, 4, 4, 34, 4, 4.

`snes/test/audio/profile.mjs ROM output.lua` writes a `SNES_LUA_PRELUDE` for
the existing fight suites. `--mute-rare` clears pending rare streams at their
service entry, preserving the resident selector and busy-drop instruction
paths for a controlled comparison; `--read .../audio-profile.csv` summarizes
CPU and NMI misses. Frieza battle is unchanged at **12/602** versus the
pre-change ROM; the laugh streams in 139 frames, mean 38.93 / max 74.05
lines. Vegeta voice-on / voice-muted misses match: **343/2407** clash-win,
**1083/3953** combat-final, **32/1054** budget. `--compare on.csv muted.csv`
fails if the same-ROM voice-on run adds misses. Final Flash actually streams
in the budget case (176 transfer frames, mean 41.47 / max 102.76 lines);
charge/clash requests are dropped. The pre-change build's corresponding Vegeta
counts were 343/2406, 1082/3785, 29/1050: scene/input timing changes across
builds, so the same-ROM comparison isolates the voice cost. The existing
Vegeta budget test's `B077` end callback reports every frame as late; these
counts instead read `$EC` at the native field NMI, as gameplay does.

Not verified: real hardware (timing margins are from the harness and
Mesen), and perceptual listening review of the new palette. The WAV pairs
are ready for the maintainer; acoustic scores alone do not establish a
perceptual match.

## 6. Imported test states and the APU

`H.importSnesJs` used to set the SPC700's registers from a CPU-side
callback, in the middle of whatever instruction the sound CPU was running;
it then finished that instruction against the new state and could resume
misaligned or with a broken stack (seen on this branch: `STOP` executed
from the operand at `$0CF2`, a run into the ADSR table at `$1881`), after
which every native sound call waited forever. Main `e2f2fe2` applies the
APU state at a sound-CPU instruction boundary; with it all goku, title and
story tests pass on this branch.

`H.residentEffects()` recognizes the shipping resident table and installs
the complete `$2C00-$47FF` effect block and the extension from the cartridge's boot upload
blob. For browser imports it runs **after** the SPC/DSP register restore;
patching during that restore stalled the Fortress flyby's next native song
fade. `H.load()` applies the same augmentation to retail Mesen checkpoints.
It never rewrites song samples or echo. Diagnostic PCM imports deliberately
remain retail: `audio/imported.lua` checks graceful disable on an unextended
driver, while `arrival.lua` explicitly calls `injectExtension()`.
The S-DSP's internal echo write position is not part of a bundle either; if
a test ever sees direct page or stack bytes change right after an import,
empty the echo ring first (FLG |= `$20`, EDL = 0, one frame).

## 7. Integration summary

**ROM patches** (all through `%hijack`/`%hijack_jsl`/`%patch` with
original-byte assertions):

| Address | Size | What |
| --- | --- | --- |
| `C3:0106` | 6 | boot upload end → `audio_boot_upload` (uploads the extension after the driver) |
| `C3:020F`, `C3:0264`, `C3:0487`, `C3:0592` | 6 / 5 / 4 / 4 | temporary song loader install, sequence/sample sender, native-vector restore |
| `C3:0400` | 4 | sample upload selects native FE mode 3 or temporary mode 4 |
| `C3:0175` | 4 | shipping effect command → asynchronous `audio_native_command` |
| `C3:24A9` and six spans above | 283 capacity | resident effect pointers/sequences; byte-identical retail tracks shared |
| ten table words listed above | 20 | redirect retail pointers to identical retained tracks |
| `C3:0618`, `C3:0651`, `C3:0663`, `C3:066A` | 4 each | echo preset reads → `audio_echo0-3` (songs `$3B-$3F` read `audio_echo_table`) |
| `C3:3DEA`, `C3:3DED`, `C3:3DF0`, `C3:3DF3`, `C3:3DF6` | 3 each | song pointers `$3B-$3F` → `audio_song_3b-3f` (bank `$EA`) |
| `C3:4682`, `C3:46A2`, `C3:46C2`, `C3:46E2`, `C3:4702` | 32 each | instrument lists of songs `$3B-$3F` |

**ARAM** (uploaded at boot, asserted against the driver image by the
build): code `$1598-$17FC`, `$FF89-$FFFA`, `$1898-$18B8`; tables
`$1818-$183C`, `$1930-$1977`; chunk slots `$FA00-$FBF7`; DP `$E3-$EF` and the
gaps listed in section 1; driver patches at `$020A`, `$0279`, `$0299`,
`$02E1`, `$02F4`, `$0378`, `$1214`, `$1237`, `$14C6`. The synchronous song loader
temporarily uses the stream ring and FE vectors `$1420/$1426`, restoring
those vectors before playback.

**Other resources**: WRAM `$7E:DD00-DD7F` (`!RAM_AUDIO`; no SRAM, no DMA or
HDMA); code bank `$AA`; tables, extension image and sequences in `$EA`
(`audio_data_end` asserted inside the bank); rare clips use 26,784 bytes of
`$FC` (diagnostic PCM uses 231 KiB in `$FC-$FF`). Frame hooks: `audio_frame` last in the field frame and in the
world frame, `audio_pause` in the menu and ring frames. Native commands go
through `core_sound_queue`. Reads (and clears) the title module's
`!title_sfx` (`$7E:DD87`) and reads the destroy module's `!out_sfx`
(`$7E:D9BE`) when those modules are built in, so `modules.asm` includes
audio after them. Shipping voice admission also reads combat's
`!cb_charging` and Vegeta's `!vg_clash_on`; it never writes their state.

**Core requests**: none.
