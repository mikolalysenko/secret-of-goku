# Resident custom samples: cartridge option and storage audit

## Swing/HIT/ki variation (`variety7`)

The current tag is **`variety7`**. Punch swings alternate a six-tick swell
with a five-semitone fall and a three-tick swell with a nine-semitone fall.
That two-envelope cycle combines with three pitches (1 / 1.03515625 /
.9765625), giving six combinations before repeating. HIT's pop and the ki
launch each rotate those pitches independently. Kick swing and kick retain
their single authored versions. The shared DSP noise clock and full-gain
contact replacement are unchanged.

No sample was added, shortened or re-encoded; no EDL cap changes. The
three free reservation bytes left by `fix7` hold one SPC CALL, filling the
2,304-byte bank. The 54-byte helper uses previously unoccupied
`$0180-$01B5`, below the 64-byte stack allowance. Two tuning commands use
four bytes of existing shared sequence space (259/283 used). Boot upload
grows by 58 bytes including its segment header. The runtime tests guard the
new region across effects, all song loads, rare voices and imports. See
[audio.md](audio.md#swing-hit-and-ki-variation-variety7-october-21-2026)
for the stack evidence and CPU measurements.

The manifest now contains **216 WAVs**, adding these **nine** files:

| Context | Before | New | Browser reference |
| --- | --- | --- | --- |
| Two battle combos, six moves | `variation-battle-combos-fix7.wav` | `variation-battle-combos-variety7.wav` | `pc-variation-battle-combos.wav` |
| Eight isolated whiffs | `variation-solo-whiffs-fix7.wav` | `variation-solo-whiffs-variety7.wav` | `pc-variation-solo-whiffs.wav` |
| Ki volley with contacts | `variation-battle-volley-fix7.wav` | `variation-battle-volley-variety7.wav` | `pc-variation-battle-volley.wav` |

Every new file has zero clipped samples and is unnormalized. New cartridge
peaks are **−1.84 / −15.82 / −8.55 dBFS**, respectively. The PC files
alternate swing clips, rotate hit clips, and keep independent three-rate
counters for swing, hit and blast; kick swing/kick stay at rate 1. Browser
gain, master and compression are applied; PC comparisons omit music.

`capture-{fix7,variety7}-variation/results.json` records actual cartridge
dispatch timing. `variation-validation7.json` records the storage, stack,
loudness, hashes and validation; `variation-cpu7.json` records unchanged
idle cost. All audio/gameplay/perf/combat checks pass, with every gameplay
miss count unchanged. **Charge at 13 is accepted by the maintainer**;
earlier notes below about an unresolved 12-frame target are historical.

```sh
node snes/test/audio/capture7.mjs --rom=path/to/before.sfc --tag=fix7 --only=variation
node snes/test/audio/capture7.mjs --rom=path/to/current.sfc --tag=variety7 --only=variation
node snes/test/audio/pc7.mjs --only=variation
node snes/test/audio/manifest7.mjs
```

## Combo gain correction (`fix7`)

The current cartridge tag is **`fix7`**. It replaces an active punch/kick
swing with its contact through native F2 cleanup, preserving full contact
gain in ordinary combos. Other effect overlaps retain the headroom rule.
All samples, contact/swing/ki sequences, envelopes and EDL caps are unchanged.
The 2,304-byte reservation uses **2,301 bytes**; the new helper occupies
previously unused tuning/ADSR entries, increasing the existing metadata
uploads by 44 bytes. No sample or music trade-off is required.

The listening manifest now inventories **207 WAVs**, including **29 new
cartridge takes ending in `-fix7.wav`**. Existing round-four, `punch7`,
`motion7` and PC recordings remain available. The new tag is paired against
`motion7` for the swing/combo/volley contexts and against round four for
contact contexts. No take is normalized; every `fix7` take has zero clipped
samples, with the highest peak **−1.98 dBFS**. Solo combo, battle combo and
actual-input melee now peak at **−2.74, −1.98 and −3.00 dBFS**, respectively:
**3.72, 3.47 and 2.00 dB louder than round four**.

The new file stems are the fifteen existing `motion-*` names listed in the
next section, plus these fourteen contact takes:

- `contact-solo-hit`, `contact-solo-kick`;
- `contact-battle-hit`, `contact-battle-kick`, `contact-full-power-hit`, `contact-full-power-kick`;
- `contact-battle-rapid`, `contact-battle-beam`, `contact-battle-beds`;
- `contact-full-power-rapid`, `contact-full-power-beam`, `contact-full-power-beds`;
- `contact-input-battle`, `contact-input-full-power`.

All names end in **`-fix7.wav`**. The captures include one/two-frame
swing-to-contact spacing, real B-held melee, rapid alternating contacts,
beam layers and maximum beds in both music mixes. Existing PC references
retain the browser gains, master gain and compressor. Capture command
traces are `capture-fix7-motion/results.json` and
`capture-fix7-contacts/results.json`. `fix-validation7.json` includes the
full loudness table, clipping counts, hashes and suite results.

The charge timing target is **still open at 13/240**, despite reduced bed
CPU overhead. [audio.md](audio.md#combo-contact-gain-and-charge-timing-follow-up-october-21-2026)
contains the before/after miss frames and the baseline reproduction issue.
The listening package does not present that partial optimization as a
completed frame-budget fix.

```sh
node snes/test/audio/capture7.mjs --rom=path/to/cart.sfc --tag=fix7 --only=motion
node snes/test/audio/capture7.mjs --rom=path/to/cart.sfc --tag=fix7 --only=contacts
node snes/test/audio/manifest7.mjs
```

## Swing and ki follow-up

The current cartridge tag is **`motion7`**, following `punch7` (`91c53d9`).
Punch/kick swings reuse the aura BRR at higher rates with short swells,
falling pitch and fast tails. E5 alternates two tuning values. Ki keeps
its bright native instrument-9 carrier, with a stronger attack and shaped
decay. The more bass-heavy beam-texture ki audition was not selected.
The stronger contact tracks, `$38`, and all other cues stay as before.

No BRR is added or re-encoded. The first **2,024 bank bytes** (1,890 BRR
plus 134 sequence bytes) match the preceding cartridge exactly. SPC code
grows from 261 to **278 bytes**, making **2,302/2,304 bytes used**, two free.
The existing shared retail sequence/table holes use **255/283 bytes**,
up 34. The one mutable E5 tuning operand lives there, outside the immutable
sample/code bank. Outside-bank metadata/hooks/code remain 97 bytes, including
the unchanged 48-byte pitch helper. All retail sequences and samples survive;
there is no additional boot transfer, reservation growth or EDL change.

### Cost of adding a separate sample

These are full source-file BRR sizes, rounded to 16-sample blocks, before
metadata or sequence overhead. The first swing file includes a little more
padding than the second. Bandwidth loss is mean-square loss from the
windowed-sinc resampler, not a perceptual score.

| Source | 4 kHz bytes | 6 kHz bytes | 8 kHz bytes |
| --- | ---: | ---: | ---: |
| `swing.wav` | 522 | 774 | 1,035 |
| `swing-2.wav` | 495 | 738 | 990 |
| `kick-swing.wav` | 765 | 1,143 | 1,530 |
| `blast.wav` | 1,485 | 2,223 | 2,961 |

At 4 kHz, blast loses **5.54 dB** of source energy (6 kHz: 3.53 dB;
8 kHz: 2.79 dB). Even that lowest-rate full clip would need at least
**1,483 bytes trimmed** from existing content, about 78% of the prioritized
BRRs. Growing the reservation instead costs another EDL step in
`$00,$01,$02,$03,$04,$05,$08,$0B,$0C,$0E,$14,$25,$39,$3B,$3C,$3D`;
`$05/$0C/$14` lose their last step, incompatible with the retained layout.

A compact **32 ms attack + 128 ms loop at 4 kHz** still takes **360 BRR
bytes**, requiring at least 358 bytes of cuts. Added as a reservation,
it changes `$04:3→2`, `$0C:1→0`, `$25:4→3`, `$39:3→2`. Only another
58 reservation bytes are possible before `$0C` loses its last echo step.
An additional sample also needs metadata and relocation of the pitch helper
currently occupying unused DIR entries. These are lower bounds, not a
ready-to-ship alternate bank. `motion-analysis7.json` contains the full
rate/byte/EDL matrix. Reusing the existing texture and native carrier avoids
all these cuts and music changes, so no new echo pairs are needed.

### Three-way listening additions

**`.local/snes-test/audio/compare7/manifest.json` now inventories 178 WAVs.**
This follow-up adds **45 cartridge WAVs** (15 per version) and **7 PC WAVs**.
The versions are round four (`r4`), the immediately preceding contact build
(`punch7`), and the new cartridge (`motion7`). Initial `r7` recordings stay
archived. Every new WAV is raw/un-normalized, hash-verified and unclipped.
The older round-four contact stress recordings retain their reported clipping.

New cartridge names below each end in **`-{r4,punch7,motion7}.wav`**:

| New name stem | Contents |
| --- | --- |
| `motion-solo-swing` | First isolated punch swing |
| `motion-solo-swing-2` | Second request, exercising the other tuning |
| `motion-solo-kick-swing` | Isolated kick swing |
| `motion-solo-blast` | Isolated ki launch |
| `motion-solo-combo` | Three hits, contact one frame after each swing |
| `motion-battle-combo-1f`, `motion-battle-combo-2f` | Battle music, one/two-frame swing-to-contact delay |
| `motion-full-power-combo-1f`, `motion-full-power-combo-2f` | Same combos over full-power music |
| `motion-battle-volley-5f`, `motion-full-power-volley-5f` | 36 launches every five frames, `$38` contacts two frames later |
| `motion-battle-beam-volley-5f`, `motion-full-power-beam-volley-5f` | Same volleys layered over full-power beams |
| `motion-input-melee`, `motion-input-ki` | Actual approach/B-held melee and Super Saiyan Y volleys |

New PC files: **`pc-swing.wav`, `pc-swing-2.wav`, `pc-kick-swing.wav`,
`pc-motion-combo-1f.wav`, `pc-motion-combo-2f.wav`,
`pc-motion-volley-5f.wav`, `pc-motion-beam-volley-5f.wav`**. The existing
`pc-blast.wav` is also paired with the solo launch. Browser swing gains are
.44/.46, hit/kick .64/.70, blast .38; master .55 and the browser compressor
remain in the renderer. Swing/hit/blast rates rotate where the browser does;
kick swing stays at rate 1. PC contexts share the cartridge event spacing
without its music. Native contexts drive the real cartridge dispatcher,
and the separate input takes verify actual gameplay requests.

All fifteen new-cartridge recordings have zero clipped samples, including
−2.44/−2.51 dBFS peaks in the battle/full-power beam-volley takes. Three-way
command traces are `capture-{r4,punch7,motion7}-motion/results.json`.
New analysis files are `motion-analysis7.json`, `motion-validation7.json`
and `motion-cpu7.json`; `manifest.json` describes every file, including
working captures and checkpoints. Runtime details, hashes, CPU comparison
and the complete changed-file map are in
[audio.md](audio.md#swing-and-ki-follow-up-october-21-2026).

```sh
node snes/test/audio/capture7.mjs --rom=path/to/r4.sfc --tag=r4 --only=motion
node snes/test/audio/capture7.mjs --rom=path/to/before.sfc --tag=punch7 --only=motion
node snes/test/audio/capture7.mjs --rom=path/to/current.sfc --tag=motion7 --only=motion
node snes/test/audio/pc7.mjs
SNES_ROM=path/to/current.sfc node snes/test/audio/motion.mjs --before=path/to/before.sfc
node snes/test/audio/profile7.mjs --rom=path/to/current.sfc --before=path/to/before.sfc --out=motion7 --report=compare7/motion-cpu7.json
node snes/test/audio/manifest7.mjs
```

## Punch contact follow-up

The current default strengthens HIT/KICK with native two-voice tracks.
`snes/gen/audio-resident7.mjs` exports `CONTACTS7`; the rollback palette in
`audio-resident.mjs` stays unchanged. The design uses the PC's short broadband
hit transients and low kick body as references, with louder noise crunch and
a faster falling native pop. It does not claim sample identity with those
clips. KICK has the longer body; no additional finisher API is introduced.

Keeping the prioritized samples leaves no useful contact-sample budget.
Round six's alt1 body alone takes **576 BRR bytes**, versus 19 bytes free
after this change. Fitting that body would consume the whole 540-byte
teleport sample and still require another cut. The native design preserves
all four round-seven BRRs byte for byte, the 2,304-byte reservation and every
EDL cap. No new echo pairs are needed for the follow-up.

The reservation now holds **1,890 BRR + 134 sequence + 261 SPC code bytes =
2,285**, leaving 19 bytes. Removing a redundant octave command saves two
sequence bytes. The existing 48-byte variable-pitch helper moves to unused
DIR entries `$34-$3F` (`$19D0-$19FF`), so the new contact gain logic fits
without shortening a sample. Code, metadata and hooks outside the bank now
use 97 bytes, including four mutable bed parameters. The boot upload gains
one 48-byte segment plus its four-byte header. The native 16-entry metadata
transfers and all 64-song/192-load integrity checks protect that code.

The full-gain contact tracks peak at **−3.02 / −2.93 dBFS** in the fixed dry
SPC audit, **4.12 / 3.39 dB** above round four. Early bass energy rises
3.29 / 4.55 dB, and crunch energy 10.70 / 3.92 dB. The 100 / 140 ms audible
tails end within the old voice budget. Contact-only overlap attenuation
halves gain with 3–4 effect voices and quarters it with 5–8; music and the
round-seven samples keep their existing levels. This is a voice-count rule
in the existing SPC gain pass, not amplitude compression or 65816 polling.

The raw Mesen measurements include the emulator's actual DSP phase, so
sample peaks differ slightly from the fixed Node/SPC audit:

| Cartridge recording | Round four peak | New peak |
| --- | ---: | ---: |
| Solo HIT | −7.04 dBFS | −2.75 dBFS |
| Solo KICK | −6.58 dBFS | −3.02 dBFS |
| Battle music + HIT | −6.70 dBFS | −2.56 dBFS |
| Battle music + KICK | −5.59 dBFS | −2.68 dBFS |
| Full-power music + HIT | −7.07 dBFS | −3.31 dBFS |
| Full-power music + KICK | −6.65 dBFS | −2.88 dBFS |
| Rapid contacts + battle/beam | clipped (27 samples) | −1.37 dBFS, no clipping |
| Rapid contacts + full-power/beam | clipped (16 samples) | −1.73 dBFS, no clipping |

The comparison preserves the original cartridge's overloads without
normalization. All **14 new cartridge recordings** and **24 Node/SPC stress
cases** have zero clipped samples. Stress intervals are 2/3/5/8 video frames,
with both songs, full-power beams and maximum charge/aura beds. The fixture
also records an approach followed by actual B-held melee in each music mix.

`compare7/manifest.json` now contains **126 WAVs**: the original round-seven
package, fourteen round-four/new contact pairs, and four additional browser
references (`hit-1`, `hit-2`, `hit-3`, `kick`). HIT reference gain is .64,
KICK .70; hit rates rotate 1 / 1.035 / .975, then master .55 and the browser
compressor. The current cartridge tag is **`punch7`**; `r7` keeps the initial
round-seven recordings. Every WAV has a description, hash and peak/RMS/
clipping measurements. `contact-analysis7.json` contains the dry metrics and
24 stress results. No ROM, fixture or recording is committed.

Files: `capture7.mjs` / `capture7.lua` add the contact-only recording pass;
`pc7.mjs` adds the four PC references; `manifest7.mjs` combines the current
cartridge with the archived takes and explicitly labels baseline clipping.
`contacts.mjs` / `contacts.test.mjs` provide the repeatable loudness and
overlap checks. Runtime/import changes and validation are in
[audio.md](audio.md#punch-contact-follow-up-october-21-2026).

```sh
node snes/test/audio/capture7.mjs --rom=path/to/r4.sfc --tag=r4 --only=contacts
node snes/test/audio/capture7.mjs --rom=path/to/current.sfc --tag=punch7 --only=contacts
node snes/test/audio/pc7.mjs
SNES_ROM=path/to/current.sfc node snes/test/audio/contacts.mjs --before=path/to/r4.sfc
node snes/test/audio/manifest7.mjs
```

## Round-seven default bank

This section records the initial round-seven allocation. The follow-up above
retains its samples and echo caps, with revised contact tracks/code packing.

Round seven ships by default; `-DAUDIO_CUSTOM_SAMPLES=0` restores round four
byte for byte on `565c6a8`. The implementation is `snes/gen/audio-resident7.mjs`,
`audio/spc/beds.s`, and `audio/beds.asm`. Historical round-six synthesis stays
in `audio-custom.mjs` for the earlier auditions; its take/gain environment
settings do not select the round-seven bank.

| Instrument | Source / decoded rate | Stored sound | BRR bytes |
| --- | --- | --- | --- |
| `$30` | `charge.wav`, 4 kHz | 160 ms loop plus 16-sample silent entry | 369 |
| `$31` | `aura.wav`, 6 kHz | 128 ms loop plus 16-sample entry | 441 |
| `$32` | `beam.wav`, 6 kHz | 32 ms own attack (source starts at 60 ms), 128 ms loop | 540 |
| `$33` | `teleport.wav`, 10 kHz | First 96 ms, attack intact, final 6.4 ms tapered | 540 |

Total: **1,890 BRR bytes + 136 sequence bytes + 276 SPC code bytes = 2,302**
in a 2,304-byte reservation. Two bytes remain; there is no room for alt1
punches, so round-four punch/kick stay. Metadata and command hooks add 49
bytes outside the reservation (including four mutable level/rate bytes),
using unused tuning/ADSR/DIR entries and asserted original driver opcodes.
The boot uploader carries these once; no frame streams the bank. New code
and tables stay in audio's allocated ROM quarters, with no core changes.

The loop splice overlaps source windows with equal-power weighting, removes
DC, and flattens a circular RMS envelope before BRR encoding. Prediction
resets at the loop entry; tests verify byte-exact decoded repetition with
the previous loop's decoder history. Charge/aura 20 ms RMS variation is
about **9% / 10%**, versus 31% for the first aura candidate. This removes
large periodic volume troughs; it is not a substitute for the maintainer's
listening judgment about repeated texture. The source is softly limited
before encoding, rather than applying gain to recordings. Native DSP output
is never normalized. BRR SNR is approximately 20–22 dB after source shaping.

Charge uses the browser's `.48 + .52*strength`, `.94 + .12*strength` model.
Focus uses `.22 + .85*focus`, `.72 + .30*focus`; the aura joins above .4 at
level focus and rate `.8 + .2*focus`. Transformation holds charge .85 and
aura 1. Two sustained native voices replace the old repeating attacks.
Charge and aura scale by 140/256 and 76/256 respectively, matching the
browser cue-gain ratio `.55:.30`; common master level is calibrated to the
resident mix rather than copied from Web Audio's compressor input.

Teleport favors bandwidth over the long source sustain: at 10 kHz the
windowed-sinc source loses about **0.55 dB** mean-square energy to the
anti-alias filter, compared with **2.17 dB at 8 kHz** and **3.66 dB at 6 kHz**.
The 540-byte budget could hold 120 or 160 ms at those lower rates. Keeping
the crisp initial rise at 10 kHz was chosen; most of the original 830 ms
clip's sustain is deliberately omitted. The out/in volume ratio is
114/184=.6196 (browser .46/.74=.6216). These are short one-shots, not loops.

Beam keeps the clip's real attack, then a steady loop and native swell /
release. The SSJ tuning ratio is .859375, with no per-frame pitch work.
For the 32 ms source attack, normalized correlation at the best alignment
in the first 100 ms is **.984** in round seven, **.371** in round six and
**.247** in round four (6 kHz band-limited source template). This measures
the retained attack, not whole-clip identity.
Identical dry-driver measurements give round-four / round-seven beam RMS
**−16.37 / −16.19 dBFS**, peaks **−6.39 / −4.97 dBFS**; the 3.5-second raw
Mesen solo pair is also slightly louder in round seven. All retained hit,
kick, impact and blast tracks remain byte-identical. Flight reuses the aura
texture at a lower rate with a swell; landing/revert reuse a low beam tail.
This avoids the shared noise clock and another sample allocation. Continuous
air was omitted to preserve music voices and CPU.

### Storage and music trade-off

The reservation is 256 bytes larger than round six. Canonical EDL changes
(relative to round four) are:

| Song ids | EDL change |
| --- | --- |
| `$00,$01` | 3 → 2 |
| `$02,$11,$3D` | 6 → 5 |
| `$03,$0E,$10` | 11 → 10 |
| `$04,$39,$3C` | 4 → 3 |
| `$05,$0C,$14` | 2 → 1 |
| `$0B` | 8 → 7 |
| `$2C` | 6 → 4 |
| `$3B` | 5 → 4 |

Only `$10` and `$2C` lose an additional step versus round six: 176→160 ms
and 80→64 ms respectively. Other affected songs retain round six's cap.
The raw 12-second stereo echo pairs measure `$10` at −0.04 dB RMS and
`$2C` at −0.65 dB versus round four; their 8.05–12 s tails change by
+1.97 / −4.65 dB. The inherited `$02` cap is more audible (−4.29 dB for
the whole take), so the package retains every affected pair, not only the
two additional caps. Phrase/tail RMS is content-dependent; these are not
gain adjustments.
EVOL, feedback and FIR are unchanged. Every song command, including
noncanonical presets, caps EDL against the actual unique sample bytes.

Options measured by `snes/test/audio/audit7.mjs`:

- **2,048 bytes:** 16 canonical songs lose one step. The new bank exceeds it
  by 254 bytes; keeping these loops/code would leave only 286 bytes for
  teleport (about 50 ms at 10 kHz), or require shorter, more repetitive beds.
- **2,304 bytes, selected:** 17 songs change as above. The smallest sample /
  echo margins are 31 bytes (`$04`) and 59 bytes (`$0C`).
- **2,362 bytes:** the largest reservation compatible with at least one EDL
  step in every song. It would also reduce `$04` another step, for only
  another 58 bytes; poor benefit for the music change.
- **3,072 bytes:** 18 canonical songs change and `$0C` cannot retain even
  EDL=1. **4,096 bytes:** 21 songs change and `$05/$0C/$14` cannot retain
  EDL=1. These do not meet the retained loader/echo layout.
- **Per-song extension:** a 2,048-byte compact bank plus a 2,304-byte bank
  could retain round six's echo caps in 62/64 songs; `$10/$2C` would need
  the 254-byte reduction in their fallback, plus a different code/sample
  layout and bank/pointer transfers on song changes. That compromises the
  prioritized sounds in those locations. Another 1,024 bytes fits 53/64
  songs at the chosen
  caps; `$00,$01,$02,$04,$05,$0C,$0E,$25,$39,$3B,$3C` need a compact fallback.
  That would require extra bank transfers / pointer swaps at song load and
  different effects by location. It was not chosen for this round.
- **Lower rates:** charge at 4 kHz loses 1.02 dB source energy, beam at
  6 kHz .62 dB; these save bytes with relatively little source loss. Aura
  loses 4.78 dB at 6 kHz, versus 8.01 dB at 4 kHz, so it retains 6 kHz.
  `analysis7.json` contains the full rate/byte matrix and per-song margins.

No retail sample, effect, rare line, or song-loader feature is removed.
The modest permanent increase avoids loading extra sample banks during play.

### Listening package and reproducibility

Private output: **`.local/snes-test/audio/compare7/manifest.json`**. The
round-four and round-seven Mesen packages each have 12 solo cues/beds, eight
input-driven contexts (including the requested five, B-held melee and world flight), and
17 echo pairs. The raw stereo DAC capture has no gain normalization; the
manifest records peaks, RMS, hashes, descriptions and command-trace paths.
All **94 WAV files** (37 per cartridge and 20 PC references) have verified
hashes and no clipped samples. Browser references use
the original WAVs, master .55 and compressor threshold −10 / knee 12 /
ratio 6 / attack .003 / release .16, plus the browser loop target/fade model.
They isolate audio without browser music. The explicit SSJ reference rate
.86 follows the maintainer's table; current browser sampled `voice()` itself
falls back to rate 1 for beam, while its synthesized fallback uses .86.

```sh
node snes/test/audio/capture-build.mjs
node snes/test/audio/capture7.mjs --rom=path/to/r4.sfc --tag=r4 --songs
node snes/test/audio/capture7.mjs --rom=path/to/r7.sfc --tag=r7 --songs
node snes/test/audio/capture7.mjs --rom=path/to/r4.sfc --tag=r4 --only=melee
node snes/test/audio/capture7.mjs --rom=path/to/r7.sfc --tag=r7 --only=melee
node snes/test/audio/pc7.mjs
SNES_ROM=path/to/r7.sfc node snes/test/audio/audit7.mjs
node snes/test/audio/manifest7.mjs
```

The capture host honors Mesen's `AllowIoOsAccess` setting. It records the
pinned Mesen core from cartridge power-on; solo loop requests use the module
ABI, contexts use ordinary imported gameplay fixtures and real inputs.
No output, fixture, recording or ROM is committed. Final suite results and
hashes are recorded in [audio.md](audio.md#round-seven-shipping-policy-october-21-2026).

## Round-six cartridge option (historical)

The following instructions describe the old opt-in implementation. Use the
round-seven default and define-0 rollback above for the current source.

`node snes/build.mjs --strict -DAUDIO_CUSTOM_SAMPLES=1` builds the resident
proposal into the cartridge; omitting the define (or setting it to 0) keeps
the default byte-identical to an independent build of `12b101c`. Both hashes
are `61a0c112481616314e7dae0cdd97ffab9e49c57079c6ed64da9cebc1cda327ea`.
The historical round-five measurements below remain the audition reference.

Synthesis and sequence choices now live in `snes/gen/audio-custom.mjs`.
Provisional takes are exactly `hit:alt1,kick:alt1,impact:custom,beam:custom`.
The calibrated defaults are hit **−0.2 dB**, kick **+0.2 dB**, impact
**+5 dB**, beam **+3 dB**, relative to the round-five takes. Override any
cue in either setting; omitted cues retain their defaults. Switching a take
is a one-line environment change and rebuild:

```sh
AUDIO_CUSTOM_TAKES=hit:alt1,kick:alt1,impact:custom,beam:custom \
AUDIO_CUSTOM_LEVELS=hit:-0.2,kick:0.2,impact:5,beam:3 \
node snes/build.mjs --strict -DAUDIO_CUSTOM_SAMPLES=1
```

Set all four levels to `0` to build the unmatched audition. Takes are
`custom`, `alt1` or `alt2`; unknown/duplicate cues and nonfinite levels fail
generation. Levels accept −24…+11.9 dB, quantized to
`round(64 * 10^(dB/20))`; that range is a representation limit, **not** a
promise of headroom. Recheck mixes after changing a take or level.

The existing IPL extension uploader carries **2,084 added payload bytes**:
a 2 KiB bank, 32 metadata bytes, and a four-byte SPC hook (plus five segment
headers). The bank contains 1,800 BRR bytes, 85 selected sequence bytes,
57 bytes of gain code/table and padding. The hook at `$0BED` calls `$5580`
after native gain/pan; music and retail ids retain the exact original
register result. The four selected ids use a Q6 multiply and clamp to the
signed DSP volume range. Default centered playback never reaches that
clamp in the cartridge captures. There is no sample re-encoding or
post-render normalization for levels and no added 65816 frame work.

The floor operand at `C3:0134` becomes `$5000`, yielding `$55F1`. Native
compaction and the temporary accelerated receiver continue to use the cache
addresses initialized there: warm reset `C3:0070` restores `$1E48` from
`$1EF8`; compaction `C3:03AA/03BF` reads the source/destination arrays;
`songload.asm` consumes those same addresses. `audio_song_restore` queues
a normal song load through the same cap and cache path. The EDL hook preserves the FE token in B,
caps every caller's preset, and leaves EVOL/EFB/FIR intact; arrangements
also have capped values in `audio_echo_table`. Only the mod impact lookup
becomes `$ED`; retail `$38` and both tracks of all retail effects survive.
The new pointers are in the ROM effect block, so `C3:067E` restores them
after a long song. All native sequences, including transfer padding, end
below `$4800`; neither their payload nor the restore can reach the bank.

**Additional real-loader finding:** despite its 16-entry song lists, retail
sends 32 tuning/ADSR entries and 32 DIR entries. The unused half is stale
WRAM and overwrites `$30-$33`. Opt-in operand patches at `C3:054A/056C/058E`
halve those transfer lengths to 32/64/32 bytes. This both preserves the
boot metadata and saves 128 bytes per song load. The RAM-only prototype
could not expose this behavior.

Old diagnostic snapshots are migrated in `H.residentEffects`: repack the
current song's required samples above the new floor, relocate live DSP BRR
cursors and DIR metadata, and cap its echo before installing the custom
boot assets. Real cartridges require no such migration. Rare lines retain
their ring at `$FA00-$FBF7`, also temporarily used by the fast song loader;
the custom bank does not overlap either use.

### Cartridge listening package and level limits

The final opt-in ROM SHA-256 is
`c59ec00cf3a4e1b23464888eb9c359b10601c6301630788a88bae185f6dda0a2`.
[compare6](../../../.local/snes-test/audio/compare6/) contains **102 WAVs**:
round four, unmatched provisional takes, matched provisional takes (20 each,
including six songs), and each of the three all-cue take selections at zero
level (14 each). `manifest-*.json` records ROM hashes, every 400 ms/3 s
loudness window, peaks and clipped-sample counts; `summary.json` collates the
comparisons. All 102 recordings have **zero clipped samples**. The matched
cartridge also records zero visits to the DSP-volume saturation branch.

These are **Mesen cartridge recordings from power-on**, using the native CPU
song/effect dispatcher. They do not use `installCustom`, imported APU state,
or an APU-only renderer. `capture-build.mjs` pins official Mesen2 revision
`b9fa69ddc6d0a331fb103fdb5eef6904305703c2`, adding a read-only tap at the final
32 kHz stereo DSP output and Lua start/stop recording calls.
`capture-host.py` runs that core headlessly and checks the user's existing
`AllowIoOsAccess` setting. Normal regression suites use the unmodified
maintainer Mesen binary. The recording tools currently target macOS arm64
and require clang/make, SDL2 and FFmpeg.

```sh
node snes/test/audio/capture-build.mjs
node snes/test/audio/capture.mjs --rom=dist/snes/secret-of-goku.sfc --tag=matched --songs
# Build separately with AUDIO_CUSTOM_LEVELS=hit:0,kick:0,impact:0,beam:0,
# then capture with --tag=unmatched. Capture the define-off cart with --tag=r4.
# For each all-cue take selection, use zero levels and --tag=take-custom,
# --tag=take-alt1 or --tag=take-alt2; --songs is unnecessary for those runs.
```

Each cue is recorded alone, beside the same battle phrase and beside the
same full-power phrase. Dense mixes repeat contacts and nine impacts over
each of four waves. Six song pairs contain eight seconds of music followed
by a four-second tail. WAVs are raw stereo DAC output with no normalization.
Loudness uses FFmpeg's EBU R128 K-weighted stereo meter. The table gives the
**3 s short-term / maximum 400 ms momentary difference in LU** from round
four; negative is quieter. Short contacts are diluted by background music
in the 3 s measure, so the momentary value is included too.

| Cue | Take, zero level | Battle Δ LU (3 s / 400 ms) | Full power Δ LU (3 s / 400 ms) |
| --- | --- | ---: | ---: |
| hit | custom | -0.5 / -1.9 | -0.4 / -1.1 |
| hit | alt1 | +0.0 / +0.0 | +0.1 / +0.3 |
| hit | alt2 | -0.3 / -1.2 | -0.5 / -1.5 |
| kick | custom | -1.5 / -4.3 | -1.9 / -4.7 |
| kick | alt1 | -0.1 / -0.3 | -0.2 / -0.4 |
| kick | alt2 | -1.5 / -4.1 | -1.8 / -4.3 |
| impact | custom | -1.9 / -5.6 | -2.2 / -5.6 |
| impact | alt1 | -1.2 / -2.9 | -1.3 / -2.8 |
| impact | alt2 | -1.8 / -5.2 | -2.2 / -5.7 |
| beam | custom | -3.8 / -4.3 | -3.6 / -3.7 |
| beam | alt1 | -3.0 / -2.5 | -3.2 / -3.4 |
| beam | alt2 | -3.9 / -4.0 | -3.9 / -4.2 |

The chosen levels are a **headroom-limited match**, not an exact loudness
match. Hit/kick are within 0.0 LU short-term and 0.3 LU momentary. Impact
remains 1.1/1.3 LU short-term and 2.7/2.8 LU momentary below round four in
battle/full power; its much shorter body needs more peak amplitude to
match energy. Beam remains 1.2/1.0 LU short-term and 1.4/0.8 LU momentary
below round four. A +8.8 dB impact/+4 dB beam trial closed the short-term
gap but clipped the dense mixes; +7.5/+3.5 still clipped. The selected
+5/+3 retains the existing all-five-arrangement stress limit (<30,000)
with worst peak −0.91 dBFS. This limit, and listening approval, should be
retained when selecting different takes.

| Dense cartridge mix | Round four peak | Unmatched peak | Matched peak | Unmatched → matched 3 s Δ LU vs r4 |
| --- | ---: | ---: | ---: | ---: |
| battle | -2.56 dBFS | -5.04 dBFS | -1.80 dBFS | -4.0 → -1.6 |
| full-power | -2.93 dBFS | -4.80 dBFS | -1.48 dBFS | -3.7 → -1.3 |

Listen to [battle matched](../../../.local/snes-test/audio/compare6/mix-battle-matched.wav)
/ [unmatched](../../../.local/snes-test/audio/compare6/mix-battle-unmatched.wav),
and [full power matched](../../../.local/snes-test/audio/compare6/mix-full-power-matched.wav)
/ [unmatched](../../../.local/snes-test/audio/compare6/mix-full-power-unmatched.wav).
Individual cues are `<cue>-matched.wav` / `<cue>-unmatched.wav`; the
`take-<name>` suffixes provide every alternate from a built cartridge.

| Song | EDL before → after | First 8 s RMS change | Tail before → after | Cartridge WAVs |
| --- | --- | ---: | ---: | --- |
| $02 | 6 → 5 | -4.49 dB | 1710 → 1440 ms | [before](../../../.local/snes-test/audio/compare6/song-02-r4.wav) / [after](../../../.local/snes-test/audio/compare6/song-02-matched.wav) |
| $0B | 8 → 7 | -2.37 dB | 645 → 565 ms | [before](../../../.local/snes-test/audio/compare6/song-0B-r4.wav) / [after](../../../.local/snes-test/audio/compare6/song-0B-matched.wav) |
| $2C | 6 → 5 | -1.70 dB | 1920 → 1465 ms | [before](../../../.local/snes-test/audio/compare6/song-2C-r4.wav) / [after](../../../.local/snes-test/audio/compare6/song-2C-matched.wav) |
| $04 | 4 → 3 | -0.10 dB | 200 → 150 ms | [before](../../../.local/snes-test/audio/compare6/song-04-r4.wav) / [after](../../../.local/snes-test/audio/compare6/song-04-matched.wav) |
| $0C | 2 → 1 | +0.17 dB | 100 → 50 ms | [before](../../../.local/snes-test/audio/compare6/song-0C-r4.wav) / [after](../../../.local/snes-test/audio/compare6/song-0C-matched.wav) |
| $3C | 4 → 3 | +0.25 dB | 195 → 150 ms | [before](../../../.local/snes-test/audio/compare6/song-3C-r4.wav) / [after](../../../.local/snes-test/audio/compare6/song-3C-matched.wav) |

Tail endpoint uses the last 5 ms RMS window above −40 dB relative to the
200 ms before key-off. Echo coloration is audible, especially $02/$0B/$2C;
these are intentional consequences of the reservation, not volume changes.

### Round-six validation

Strict builds, 28 Node tests and all 11 Mesen audio cases pass on both
builds, plus the five-song browser-reference render. `loads-boot` runs all
64 slots consecutively from cartridge power-on; the opt-in build repeats
with noncanonical presets 11 and 14 (192 loads total, 243 compaction moves).
Every load checks every required BRR byte, DIR, tuning, ADSR, cache floor,
sequence, echo and temporary-vector restoration. The resident bank and
metadata are checked after each load and after playback; write callbacks
record **zero post-boot writes** to the reservation/metadata. Native $32
sequence spill/restore, all three rare voices and `audio_song_restore` pass.
EVOL, EFB and all FIR taps match the default build for every canonical song;
only the 16 colliding canonical songs lower EDL by one. All 64×16 cap
calculations are also checked statically.

The longer consecutive run exposed a test-only assertion issue: retail
one-shot instrument 31's unused DIR loop offset can wrap 16 bits high in
the cache. The check now uses the loader's 16-bit result. Profiling also
handles Mesen's exposed 32-bit master-clock wrap, avoiding negative timings
when a long run crosses that boundary.

All requested opt-in integration suites pass: **gameplay, perf, combat,
Vegeta, Frieza, orbit, ending, story and title**. Tests that build their own
diagnostic variants inherited the custom define. No suite was skipped.
The perf comparison (original vs opt-in, p90 finish line / lag frames) is:

| Scene | Original | Custom |
| --- | ---: | ---: |
| sword | 45 / 4 | 63 / 4 |
| sandship | 103 / 12 | 113 / 4 |
| battle | 34 / 4 | 54 / 4 |
| beast | 173 / 34 | 173 / 34 |
| fortress | 90 / 5 | 95 / 4 |
| flight | 123 / 4 | 112 / 4 |

Gameplay's existing crowded-party timing warnings are unchanged in a
separate default-cartridge comparison: fly 2, fly-ki 2, fly-punch 1,
teleport 3 and charge 17 missed frames per 240. Both builds have zero
palette, stamina, sprite-overflow and vblank-overrun errors. The legacy
Vegeta budget callback still labels all frames late, as already documented
in `audio.md`; it is not used as evidence of lag. The independent perf and
gameplay checks supply that comparison.

Validation logs and stage timings are private under
`.local/snes-test/audio/validation6/`; all captures are under `compare6/`.
The final strict rebuild with the define omitted and with an explicit `0`
reproduces the independent `12b101c` ROM exactly. The explicit `1` rebuild
reproduces the opt-in hash above. No generated ROM, audio, state, picture or
audit output is committed.

Open decisions: maintainer take/echo listening approval and the remaining
headroom-limited loudness difference. Real hardware has not been tested.
No core change or other runtime-module change is needed. The existing
Vegeta timing callback and crowded-party CPU misses remain outside this
audio change.

### CPU and song-load cost

The extra boot upload takes **1,401,946 master clocks = 65.28 ms (3.92
NTSC frames)**. Total measured audio boot, including initial song startup,
is 9,980,896 → 11,380,578 master clocks. It happens once at boot.

There are **zero added 65816 instructions per gameplay frame**. The same
`modprof` sword/battle walks report audio at **0.41 mean / 1.83 max lines**
on both builds; that existing mean includes active work and is above the
0.3-line idle guideline. Maximum native effect dispatch is **1.346 lines**
on both. Level changes do add SPC work on volume updates; they are not
per-frame transfers or main-CPU streaming. A read-only cartridge probe at
`$0BED`/`$0BF1` subtracts the original
seven-cycle span: the new path adds 21 SPC cycles per music-volume update
and 98 per selected effect-volume update. Across 300 video frames each,
that is **0.127%** of sound-CPU time with battle music alone and **0.763%**
with repeated beams/impacts. These are measured contexts, not a worst-case
bound for arbitrary level/take settings.

`song_load_profile` compares the same 64-song consecutive canonical order
from the waterfall checkpoint. The metadata repair saves 128 transferred
bytes on every load, but the raised floor changes cache retention for
songs whose echo was already safe. Results depend on the previous song:

| Measurement, NTSC frames | Default mean | Custom mean | Mean change | Per-song change range |
| --- | ---: | ---: | ---: | ---: |
| CPU synchronous stall | 19.004 | 19.757 | +0.753 | −7.223…+14.764 |
| Request to SPC playback | 34.730 | 34.807 | +0.077 | −13.984…+16.016 |

The largest playback increases are $3E→$3F **26.641 → 42.657 frames**,
$27→$28 **11.666 → 26.663**, and $03→$04 **48.666 → 59.653**. These are
load-time cache/echo tradeoffs, not added frame-service cost. Across the
pass, uploaded sample bytes rise 706,149 → 754,227 and compaction moves
75 → 78; metadata time falls about 0.429 → 0.236 frame/load. Detailed
per-song stages and moved/uploaded byte counts remain in
`default-suite6/loads/results.json`, `custom-suite6/loads/results.json`
and `validation6/metrics.json` under `.local/snes-test/audio/`.

For suites that build diagnostic cartridges, propagate the option with
`SNES_BUILD_DEFINES=-DAUDIO_CUSTOM_SAMPLES=1`; use `SNES_ROM` for the selected
cartridge. The audio runner explicitly clears that inherited option only
for its historical PCM diagnostic build. Example timing invocation:

```sh
SNES_LUA_PRELUDE=snes/test/audio/load-profile.lua \
SNES_ROM=dist/snes/secret-of-goku.sfc \
node snes/test/audio/run.mjs loads loads-boot rare-boot
node snes/tools/modprof.mjs --rom=dist/snes/secret-of-goku.sfc
```

### Round-six file map

Paths below are relative to the repository; all runtime changes are owned
by audio. No `snes/src/core` file or changelog was edited.

| File | Change |
| --- | --- |
| `snes/gen/audio-custom.mjs` | Shared deterministic BRRs, takes, level settings, reservation, metadata and per-song caps. |
| `snes/gen/audio.mjs` | Generate the optional upload image, cap table, conditional arrangement EDL and settings report. |
| `snes/gen/audio-resident.mjs` | Conditional mod impact lookup to $ED; preserve retail $38. |
| `snes/src/modules/audio/module.asm` | Off-by-default define, optional upload/table selection and EDL clamp for every caller. |
| `snes/src/modules/audio/resident.asm` | Optional effect pointers, cache-floor operand and metadata transfer limits. |
| `snes/src/modules/audio/spc/custom.s` | Per-cue Q6 volume routine within the reservation. |
| `snes/build.mjs` | Validated inherited build defines for diagnostic suite builds. |
| `snes/test/audio/cartridge.mjs` | Read variant and immutable upload segments from the tested ROM. |
| `snes/test/audio/apu.mjs` | Test the cartridge's actual assets, floor and caps. |
| `snes/test/audio/custom-samples.mjs` | Import shared synthesis; preserve historical zero-level RAM auditions. |
| `snes/test/audio/custom-cartridge.test.mjs` | All 81 take combinations, settings, all 64×16 caps and long-sequence bounds. |
| `snes/test/audio/resident.test.mjs` | ROM-aware cue ids, custom voice/timbre expectations and arrangement headroom. |
| `snes/test/audio/samples.test.mjs` | Permit the prototype helper's level-table reset inside the reservation. |
| `snes/test/audio/lib.lua` | Compare all immutable custom bytes with the tested ROM upload. |
| `snes/test/audio/loads.lua` | Consecutive loads, noncanonical echo, integrity/write checks and wrapped clock/loop arithmetic. |
| `snes/test/audio/load-profile.lua` | Handle exposed master-clock wrap in stage timings. |
| `snes/test/audio/native.lua` | Check the bank after native song restore. |
| `snes/test/audio/rare.lua` | Check the bank after each rare voice. |
| `snes/test/audio/rare-control.lua` | Check the bank through voice cancellation and song loading. |
| `snes/test/audio/rare-boot.lua` | Boot bank checks and upload/startup timing. |
| `snes/test/audio/run.mjs` | Separate output roots, ROM-aware data and the real power-on load pass. |
| `snes/test/audio/capture-build.mjs` | Build the pinned Mesen core with a raw DAC tap. |
| `snes/test/audio/capture-host.py` | Headless core host respecting the existing Lua I/O setting. |
| `snes/test/audio/capture.lua` | Boot and dispatch the cartridge cue/mix/song recording schedule. |
| `snes/test/audio/capture.mjs` | Write unprocessed WAVs, loudness/peak windows and ROM-hash manifests. |
| `snes/test/lua/harness.lua` | Migrate old diagnostic snapshots to the reserved cache and relocate active BRR cursors. |
| `docs/agents/snes-port/audio.md` | Shipping policy, memory/patch map and import behavior. |
| `docs/agents/snes-port/audio-samples.md` | Settings, storage proof, cartridge listening/level measurements and validation. |

## Historical round-five investigation

Spoilers. Round five was based on `c1674a7`; companion to [audio.md](audio.md). The following storage investigation and RAM-only auditions describe that checkpoint. Round six above implements its recommendation behind an off-by-default define.

## Reproduce the measurements

```sh
node snes/build.mjs --strict
export MESEN=/Users/mikolalysenko/Projects/secret-of-goku/.local/tools/mesen/Mesen.app/Contents/MacOS/Mesen
SNES_ROM=dist/snes/secret-of-goku.sfc node snes/test/audio/run.mjs
node snes/test/audio/audit.mjs --trace
node snes/test/audio/sample-audit.mjs --rates --trace=.local/snes-test/audio/audit/trace/results.json
node snes/test/audio/samples.mjs --options
```

Generated JSON and WAVs stay in `.local/snes-test/audio/compare5/`. No ROM, sample binary, recording or raw audit report is committed. The strict baseline ROM SHA-256 is `825261d1b00abcf405f795947086231684b74c369d68e29a172de8182f2fbcfe`.

## Song space, including all 64 retail slots

Bytes below are the compacted **required** instrument set, counted once per unique sample id, starting at `$4DF1`. Cached samples from an earlier song can occupy the reported free bytes until the CPU loader evicts/compacts them; they are not permanent resident storage. End addresses are exclusive. Echo starts at `$FA00 − max(EDL,1) × $800`: this driver reserves a whole 2 KiB even for EDL 0. The DSP itself uses a four-byte echo location at EDL 0, so disabling echo does not automatically reclaim that reservation.

The canonical commands come from retail events `$700–$73A`, keyed by their actual song operand (the fanfare events are reordered). Retail `$3B–$3F` are unused placeholders, with the same sequence as `$38` and a different instrument list. They have **no canonical EDL**. Their rows explicitly show preset 0 / EDL 2; they must not be mistaken for five additional played songs. The five arrangements below replace those slots.

| Song | Preset / EDL | Unique BRR bytes | Sample end | Echo start | Free bytes |
| --- | --- | ---: | --- | --- | ---: |
| $00 | $0A / 3 | 37,278 | $DF8F | $E200 | 625 |
| $01 | $09 / 3 | 37,053 | $DEAE | $E200 | 850 |
| $02 | $0D / 6 | 31,086 | $C75F | $CA00 | 673 |
| $03 | $0B / 11 | 19,989 | $9C06 | $A200 | 1,530 |
| $04 | $04 / 4 | 35,568 | $D8E1 | $DA00 | 287 |
| $05 | $00 / 2 | 38,826 | $E59B | $EA00 | 1,125 |
| $06 | $03 / 6 | 11,763 | $7BE4 | $CA00 | 19,996 |
| $07 | $08 / 8 | 378 | $4F6B | $BA00 | 27,285 |
| $08 | $0B / 11 | 17,784 | $9369 | $A200 | 3,735 |
| $09 | $05 / 2 | 35,622 | $D917 | $EA00 | 4,329 |
| $0A | $03 / 6 | 20,583 | $9E58 | $CA00 | 11,176 |
| $0B | $07 / 8 | 25,992 | $B379 | $BA00 | 1,671 |
| $0C | $06 / 2 | 39,636 | $E8C5 | $EA00 | 315 |
| $0D | $02 / 6 | 23,625 | $AA3A | $CA00 | 8,134 |
| $0E | $0B / 11 | 20,790 | $9F27 | $A200 | 729 |
| $0F | $08 / 8 | 23,805 | $AAEE | $BA00 | 3,858 |
| $10 | $0B / 11 | 19,233 | $9912 | $A200 | 2,286 |
| $11 | $02 / 6 | 29,943 | $C2E8 | $CA00 | 1,816 |
| $12 | $02 / 6 | 13,869 | $841E | $CA00 | 17,890 |
| $13 | $0A / 3 | 26,244 | $B475 | $E200 | 11,659 |
| $14 | $00 / 2 | 38,259 | $E364 | $EA00 | 1,692 |
| $15 | $02 / 6 | 27,459 | $B934 | $CA00 | 4,300 |
| $16 | $0A / 3 | 15,633 | $8B02 | $E200 | 22,270 |
| $17 | $0A / 3 | 27,504 | $B961 | $E200 | 10,399 |
| $18 | $04 / 4 | 19,080 | $9879 | $DA00 | 16,775 |
| $19 | $0A / 3 | 17,766 | $9357 | $E200 | 20,137 |
| $1A | $0A / 3 | 15,912 | $8C19 | $E200 | 21,991 |
| $1B | $03 / 6 | 22,419 | $A584 | $CA00 | 9,340 |
| $1C | $0A / 3 | 18,918 | $97D7 | $E200 | 18,985 |
| $1D | $0B / 11 | 11,637 | $7B66 | $A200 | 9,882 |
| $1E | $0B / 11 | 15,210 | $895B | $A200 | 6,309 |
| $1F | $0A / 3 | 17,253 | $9156 | $E200 | 20,650 |
| $20 | $0A / 3 | 30,204 | $C3ED | $E200 | 7,699 |
| $21 | $0A / 3 | 10,728 | $77D9 | $E200 | 27,175 |
| $22 | $0A / 3 | 21,033 | $A01A | $E200 | 16,870 |
| $23 | $0A / 3 | 29,403 | $C0CC | $E200 | 8,500 |
| $24 | $0C / 11 | 4,014 | $5D9F | $A200 | 17,505 |
| $25 | $04 / 4 | 33,246 | $CFCF | $DA00 | 2,609 |
| $26 | $05 / 2 | 24,156 | $AC4D | $EA00 | 15,795 |
| $27 | $0C / 11 | 4,149 | $5E26 | $A200 | 17,370 |
| $28 | $0E / 0 | 15,813 | $8BB6 | $F200 | 26,186 |
| $29 | $0C / 11 | 6,201 | $662A | $A200 | 15,318 |
| $2A | $08 / 8 | 21,132 | $A07D | $BA00 | 6,531 |
| $2B | $0C / 11 | 14,913 | $8832 | $A200 | 6,606 |
| $2C | $0F / 6 | 31,707 | $C9CC | $CA00 | 52 |
| $2D | $0B / 11 | 4,221 | $5E6E | $A200 | 17,298 |
| $2E | $0A / 3 | 10,863 | $7860 | $E200 | 27,040 |
| $2F | $0A / 3 | 10,863 | $7860 | $E200 | 27,040 |
| $30 | $0A / 3 | 10,863 | $7860 | $E200 | 27,040 |
| $31 | $06 / 2 | 35,010 | $D6B3 | $EA00 | 4,941 |
| $32 | $05 / 2 | 34,821 | $D5F6 | $EA00 | 5,130 |
| $33 | $03 / 6 | 19,251 | $9924 | $CA00 | 12,508 |
| $34 | $0B / 11 | 11,610 | $7B4B | $A200 | 9,909 |
| $35 | $0F / 6 | 8,676 | $6FD5 | $CA00 | 23,083 |
| $36 | $06 / 2 | 24,624 | $AE21 | $EA00 | 15,327 |
| $37 | $02 / 6 | 23,742 | $AAAF | $CA00 | 8,017 |
| $38 | $0F / 6 | 3,402 | $5B3B | $CA00 | 28,357 |
| $39 | $04 / 4 | 35,433 | $D85A | $DA00 | 422 |
| $3A | $0B / 11 | 11,853 | $7C3E | $A200 | 9,666 |
| $3B placeholder | assumed $0 / 2 | 33,939 | $D284 | $EA00 | 6,012 |
| $3C placeholder | assumed $0 / 2 | 33,939 | $D284 | $EA00 | 6,012 |
| $3D placeholder | assumed $0 / 2 | 33,939 | $D284 | $EA00 | 6,012 |
| $3E placeholder | assumed $0 / 2 | 33,939 | $D284 | $EA00 | 6,012 |
| $3F placeholder | assumed $0 / 2 | 33,939 | $D284 | $EA00 | 6,012 |
| $3B arrival | custom / 5 | 32,562 | $CD23 | $D200 | 1,245 |
| $3C battle | custom / 4 | 34,983 | $D698 | $DA00 | 872 |
| $3D orbit | custom / 6 | 30,258 | $C423 | $CA00 | 1,501 |
| $3E vegeta | custom / 6 | 27,945 | $BB1A | $CA00 | 3,814 |
| $3F vegeta-full-power | custom / 5 | 29,178 | $BFEB | $D200 | 4,629 |

Tightest: `$2C` **52**, `$04` (Danger) **287**, `$0C` **315**, `$39` **422**, `$00` **625**, `$02` **673**, `$0E` **729**, `$01` **850** bytes. The tightest new song is battle (`$3C`), **872** bytes.

For a 2,048-byte reservation, one EDL step is sufficient in retail $00, $01, $02, $03, $04, $05, $0B, $0C, $0E, $11, $14, $2C, $39, plus arrival, battle and orbit. That is **13 retail songs and three arrangements**. Each of those steps frees exactly **2,048 bytes** and shortens the repeat interval by **16 ms**. The other songs need no canonical echo change. A 1→0 EDL change frees **zero** bytes with the current loader. Alternate caller-supplied presets need the same space check; `storage.json` records every literal event preset.

## Boot effect samples

The actual upload is **1,521 bytes**, `$4800–$4DF0` inclusive: 169 BRR blocks. The 1,520-byte figure is an endpoint subtraction off by one. There are **11 stored samples**, with instruments 0–10; instrument 11 has tuning/ADSR but no uploaded DIR entry and **zero** sample bytes.

BRR carries no recording-rate metadata. These are oscillators and short loops played over wide pitch sweeps, so a single historical “sample rate” cannot be recovered. The rate column names an exact reproducible reference: driver octave 5, A, default tuning. `storage.json` also records non-noise DSP pitch ranges sampled every 2 ms over each effect’s first four seconds. Some slide through zero or up to almost 128 kHz; those extrema are hardware playback rates, not asset rates.

| Instrument | BRR address | Bytes | Samples / loop samples | A5 reference rate | Effects using sample / noise |
| --- | --- | ---: | ---: | ---: | ---: |
| 0 | $4800–$4823 | 36 | 64 / 64 | 28,062.5 Hz | 11 / 5 |
| 1 | $4824–$4847 | 36 | 64 / 64 | 28,062.5 Hz | 6 / 0 |
| 2 | $4848–$486B | 36 | 64 / 64 | 28,062.5 Hz | 5 / 0 |
| 3 | $486C–$48AA | 63 | 112 / 64 | 28,062.5 Hz | 43 / 2 |
| 4 | $48AB–$48D7 | 45 | 80 / 32 | 32,000.0 Hz | 91 / 19 |
| 5 | $48D8–$48E9 | 18 | 32 / 32 | 28,062.5 Hz | 36 / 5 |
| 6 | $48EA–$48FB | 18 | 32 / 32 | 28,062.5 Hz | 15 / 1 |
| 7 | $48FC–$4B4D | 594 | 1056 / 1008 | 32,000.0 Hz | 17 / 0 |
| 8 | $4B4E–$4C7F | 306 | 544 / 496 | 32,000.0 Hz | 12 / 0 |
| 9 | $4C80–$4D60 | 225 | 400 / 352 | 32,000.0 Hz | 9 / 0 |
| 10 | $4D61–$4DF0 | 144 | 256 / 208 | 32,000.0 Hz | 24 / 0 |
| 11 | no payload | 0 | — | — | 0 / 0 |

The dependency walk follows both loop edges with instrument and noise state, including the driver’s implicit instrument 4. Noise still decodes BRR and its END flag can stop the envelope; noise dependencies are not permission to delete samples. All 11 stored samples have normal-note references.

### Which effects use each sample

Hex ids below cover both retail tracks, not just the first. “Noise” denotes notes whose output is the DSP noise generator; it is kept separate from normal sample playback.

- **Instrument 0:** normal $0F, $10, $3F, $43, $4C, $88, $8F, $9B, $BE, $C1, $D9. Noise $24, $3C, $41, $87, $91.
- **Instrument 1:** normal $09, $3C, $3D, $A4, $B9, $D9. Noise —.
- **Instrument 2:** normal $0D, $27, $9E, $A8, $B9. Noise —.
- **Instrument 3:** normal $05, $06, $0A, $0C, $0D, $0E, $0F, $10, $17, $19, $1C, $1E, $23, $2A, $2B, $34, $3A, $3B, $3D, $3F, $40, $41, $4B, $53, $54, $57, $70, $82, $8E, $90, $92, $98, $9D, $9F, $A1, $A3, $AC, $BC, $D0, $D1, $D4, $D6, $DA. Noise $20, $5A.
- **Instrument 4:** normal $01, $02, $03, $04, $08, $0A, $0B, $11, $12, $15, $16, $18, $19, $1B, $1C, $1D, $20, $22, $25, $2C, $2E, $30, $32, $33, $34, $35, $36, $37, $38, $3B, $3E, $42, $46, $49, $4F, $50, $52, $55, $56, $58, $59, $5A, $60, $6F, $71, $72, $73, $81, $83, $84, $89, $8B, $8C, $8D, $91, $92, $93, $94, $97, $9C, $A0, $A2, $A6, $A9, $AA, $AB, $AE, $B0, $B2, $B3, $B4, $B5, $B6, $B7, $BB, $BD, $C3, $C4, $C5, $C6, $C7, $C8, $C9, $CA, $CB, $CC, $CD, $D1, $D2, $D5, $D7. Noise $11, $15, $22, $30, $31, $35, $36, $37, $38, $49, $56, $88, $89, $93, $A0, $B2, $C6, $CB, $D7.
- **Instrument 5:** normal $06, $07, $12, $13, $14, $26, $29, $2C, $2D, $2F, $48, $51, $53, $56, $85, $86, $89, $8D, $91, $9A, $A1, $A5, $AA, $AD, $AF, $B1, $B8, $BF, $C1, $C2, $CE, $CF, $D0, $D3, $D8, $DB. Noise $16, $51, $56, $C3, $C4.
- **Instrument 6:** normal $00, $31, $34, $3A, $42, $4D, $71, $89, $92, $A2, $A5, $AB, $AD, $C0, $DB. Noise $89.
- **Instrument 7:** normal $08, $18, $1A, $1F, $21, $4A, $4C, $4D, $68, $69, $6A, $6B, $72, $8B, $96, $99, $A7. Noise —.
- **Instrument 8:** normal $03, $0B, $32, $4F, $50, $68, $69, $89, $A0, $C7, $C9, $CA. Noise —.
- **Instrument 9:** normal $44, $87, $95, $97, $9D, $9E, $BA, $CC, $CD. Noise —.
- **Instrument 10:** normal $01, $1A, $21, $23, $28, $39, $3E, $43, $45, $47, $48, $4A, $4B, $4E, $52, $70, $80, $81, $9D, $9E, $A0, $A6, $BA, $C5. Noise —.

### Evidence of use by this game

The requested round-two 1,130-command JSON was not present in this worktree or the shared fixture location. The same `audit.mjs --trace` recipe was rerun on round four: **1,151 commands across 23 sessions**, including two minutes of combat/charge/teleport/flight and 22 presets. This is new evidence, not a claimed copy of the old trace. Its SHA-256 is `16b7af8129fefb3444abe537c462b3dbd457b32428db6fe29b8b45778867b11d`.

| Instrument | Retail ids observed (command counts) | Retail event references |
| --- | --- | --- |
| 0 | none observed | $D9, $24, $41, $87 |
| 1 | none observed | $A4, $D9 |
| 2 | $0D (1), $27 (167) | — |
| 3 | $0C (3), $0D (1), $0E (2), $1C (1), $D6 (1) | $17, $1E, $23, $2B, $41, $53, $70, $D6, $20, $5A |
| 4 | $01 (1), $02 (8), $15 (19), $1C (1), $25 (7), $32 (2), $35 (12), $38 (16), $60 (2), $81 (1), $8B (12), $93 (7), $94 (2), $AA (2), $AB (1), $B5 (1) | $01, $11, $12, $15, $16, $1D, $20, $22, $2C, $33, $5A, $71, $72, $89, $B0, $B2, $B3, $BB, $C8, $D5 |
| 5 | $13 (3), $AA (2) | $07, $12, $2C, $2D, $53, $89, $D8, $16 |
| 6 | $00 (1), $AB (1) | $71, $89 |
| 7 | $8B (12), $96 (2), $99 (5) | $21, $6A, $72 |
| 8 | $32 (2) | $89 |
| 9 | none observed | $87 |
| 10 | $01 (1), $81 (1) | $01, $21, $23, $70 |
| 11 | none observed | — |

Counts in this table are retail ids only. The new resident cues also use boot samples (notably instrument 1 for swings/beam, 3 for contact bodies and charge, and 9 for ki). The conservative retail static audit found **74 event effect commands, 20 direct JSL callers and 1,020 plausible four-byte command literals**. The literal scan includes data and replaced events; it is evidence to investigate, not a reachability proof. Computed native combat/animation ids remain. Samples 0, 1 and 9 being absent from retail commands in this finite trace therefore does **not** make them free, and 1/9 are directly used by the mod.

## Other storage

- `$FA00–$FBF7`: **504 bytes**, 14 four-block chunks. When rare voices are idle it is still temporary song-loader code storage (**438 bytes**). Reuse would require relocating that code and/or restoring samples after every song load and rare line. It is not a load-once resident bank. The remaining `$FBF8–$FBFF` is **8 bytes**, smaller than one BRR block.
- Retail sequence gaps: `$365A` (**1 byte**), `$3669` (**1**) and `$47FD–$47FF` (**3**). Round four’s allocation has one more byte, `$37A9`. Full suffix packing of all 368 nonempty retail tracks yields **6,000 bytes / 328 unique tracks**. After all round-four resident data, the entire effect region has only **6 spare bytes**, not a hidden kilobyte.
- New instrument metadata can use indices `$30–$33`: tuning `$1860–$1867` (**8 bytes**), ADSR `$18E0–$18E7` (**8**), DIR `$19C0–$19CF` (**16**). The CPU loader has 16 song-list entries (`$20–$2F`); control-flow scans of all retail and shipping songs find no instrument selector ≥ `$30`. These slots do not overlap the streaming extension. Metadata alone supplies no BRR storage.
- Sharing a sample at different pitches costs no extra BRR or 65816 work. The prototype shares one snap between hit/kick/impact and one low body between contacts, and sustains the beam from a short loop rather than storing its full duration.

## Storage options and recommendation

**Recommend keeping every retail sample and reserving 2 KiB at `$4DF1–$55F0`, with a per-song EDL cap only when required.** The four-sample bank uses 1,800 bytes and its sequences use 87: **1,887 bytes**, leaving **161 bytes**. The 32 metadata bytes fit in the unused `$30–$33` instrument entries. Shift the native cache floor to `$55F1`; at canonical presets, reduce EDL by one for the 13 retail songs and three arrangements listed above. This is a concrete audition proposal, not an approved change to native music.

| Option | Bytes available / saved | What changes | Decision |
| --- | ---: | --- | --- |
| Existing global song margin | 52 raw; at most 45 BRR | Native cache floor can move only this far without any echo/sample loss; at most five BRR blocks | Too small for this prototype |
| Existing effect-table/sequence holes | 6 total | Requires repacking to use every byte; no complete BRR block in any hole | No sample bank here |
| Halve retail sample 8 | 144 | Twelve original effect ids potentially change; traced `$32` changes little in this fixture | Small fallback, not enough |
| Halve retail samples 7–10 | 603 | Their loop waveforms, bandwidth and some fine tuning change; original effects and resident ki/air cues are affected | Not recommended over keeping the samples |
| One EDL step where required | 2,048 per affected song | Echo repeat interval −16 ms; tail and comb coloration change; no notes/instruments removed | Recommended storage source, subject to listening review |
| Temporarily idle stream ring | 504 | Rare streams overwrite it; the song loader also installs 438 bytes here | Not permanent resident space |
| Remove rare voices, retain fast song loading | 935 raw, fragmented | 869 extension code/data bytes plus 66 ring bytes outside the temporary loader; loses all three rare lines | Below 1 KiB before BRR alignment, without other layout changes |
| Remove rare voices and the fast loader | 1,373 raw, fragmented | 869 extension bytes + 504 ring bytes; loses rare lines and lengthens native song-loading stalls | Could support a smaller bank, but sacrifices existing features; not implemented |

The 869 extension bytes are code 613 + 114 + 33, and tables 37 + 72. Reclaiming them requires undoing the stream hooks; simply overwriting an idle extension would crash its next poll. Retain the native transfer acknowledgement repairs in either removal scenario. These alternatives are footprint calculations, not validated cartridge implementations.

### Lower-rate retail auditions

All 11 original BRRs loop, end immediately before the next sample and contain no unused trailing blocks. Straight truncation changes a waveform or loop period. The larger samples 7/8 are the sensible first candidates for a lower-rate experiment; deleting the tiny 18–63-byte oscillators buys little and affects many effects.

The half-rate experiment resamples the attack and steady loop separately, aligns each to 16 samples, resets BRR prediction at the loop entry, halves instrument tuning, and halves the affected `E9` offsets. The latter matters: halving only the base detunes `$96` by several semitones. Odd offsets round to the nearest tuning unit. These are **lossy replacements**, not byte-preserving compression.

| Sample / example effect | Original → new BRR | Saved | Reference loop period before → after | Example level change | Listening pair |
| --- | ---: | ---: | --- | ---: | --- |
| 7 / $96 | 594 → 306 | 288 | 31.5 → 32 ms | -0.32 dB | [original](../../../.local/snes-test/audio/compare5/options/retail-sample-7-effect-96-r4.wav) / [half-rate](../../../.local/snes-test/audio/compare5/options/retail-sample-7-effect-96-half-rate.wav) |
| 8 / $32 | 306 → 162 | 144 | 15.5 → 16 ms | +0.05 dB | [original](../../../.local/snes-test/audio/compare5/options/retail-sample-8-effect-32-r4.wav) / [half-rate](../../../.local/snes-test/audio/compare5/options/retail-sample-8-effect-32-half-rate.wav) |
| 9 / $97 | 225 → 117 | 108 | 11 → 11 ms | -0.65 dB | [original](../../../.local/snes-test/audio/compare5/options/retail-sample-9-effect-97-r4.wav) / [half-rate](../../../.local/snes-test/audio/compare5/options/retail-sample-9-effect-97-half-rate.wav) |
| 10 / $81 | 144 → 81 | 63 | 6.5 → 7 ms | -1.21 dB | [original](../../../.local/snes-test/audio/compare5/options/retail-sample-10-effect-81-r4.wav) / [half-rate](../../../.local/snes-test/audio/compare5/options/retail-sample-10-effect-81-half-rate.wav) |

Sample 8 / `$32` is the lowest-change measured example: **+0.054 dB** overall, normalized octave bands within **0.6 dB**, and unchanged 160 ms duration. That is evidence for this cue at this pitch, not for all twelve dependent ids. Sample 7 / `$96` stays within **0.32 dB** overall but loses **5.8–9.4 dB** in its normalized 1–4 kHz bands; it is substantially duller spectrally. Sample 9 / `$97` changes **−0.65 dB**, and 10 / `$81` **−1.21 dB**. The four together only shrink the retail bank **1,521 → 918 bytes**. Noise substitution would also affect the DSP’s shared noise clock; it is not a transparent replacement.

## Echo listening pairs and measured tails

Each pair runs **eight seconds of the same native song through `songs.mjs` and the real SPC sequencer/S-DSP**, aligned to track start, then keys off all dry voices for a **four-second tail** while keeping echo/FIR/feedback alive. Both are stereo 32 kHz with identical EVOL, EFB, FIR, notes, samples and command volume; only EDL changes. No loudness normalization. Tail endpoint is the last 5 ms RMS window above −40 dB relative to the 200 ms before the cut. These are phrase-dependent decay measurements, not room RT60 estimates; all tails fit within the capture.

| Song | EDL | Repeat interval | Free after reserving 2 KiB | Tail before → after | 8 s music RMS change | WAVs |
| --- | --- | --- | ---: | --- | ---: | --- |
| $00 | 3 → 2 | 48 → 32 ms | 625 | 60 → 40 ms | +0.39 dB | [before](../../../.local/snes-test/audio/compare5/options/echo-retail-00-r4.wav) / [after](../../../.local/snes-test/audio/compare5/options/echo-retail-00-edl-minus1.wav) |
| $01 | 3 → 2 | 48 → 32 ms | 850 | 60 → 40 ms | -0.26 dB | [before](../../../.local/snes-test/audio/compare5/options/echo-retail-01-r4.wav) / [after](../../../.local/snes-test/audio/compare5/options/echo-retail-01-edl-minus1.wav) |
| $02 | 6 → 5 | 96 → 80 ms | 673 | 1520 → 1280 ms | -4.44 dB | [before](../../../.local/snes-test/audio/compare5/options/echo-retail-02-r4.wav) / [after](../../../.local/snes-test/audio/compare5/options/echo-retail-02-edl-minus1.wav) |
| $03 | 11 → 10 | 176 → 160 ms | 1530 | 2995 → 2720 ms | +0.15 dB | [before](../../../.local/snes-test/audio/compare5/options/echo-retail-03-r4.wav) / [after](../../../.local/snes-test/audio/compare5/options/echo-retail-03-edl-minus1.wav) |
| $04 | 4 → 3 | 64 → 48 ms | 287 | 195 → 145 ms | -0.09 dB | [before](../../../.local/snes-test/audio/compare5/options/echo-retail-04-r4.wav) / [after](../../../.local/snes-test/audio/compare5/options/echo-retail-04-edl-minus1.wav) |
| $05 | 2 → 1 | 32 → 16 ms | 1125 | 40 → 25 ms | -0.18 dB | [before](../../../.local/snes-test/audio/compare5/options/echo-retail-05-r4.wav) / [after](../../../.local/snes-test/audio/compare5/options/echo-retail-05-edl-minus1.wav) |
| $0B | 8 → 7 | 128 → 112 ms | 1671 | 640 → 560 ms | -2.38 dB | [before](../../../.local/snes-test/audio/compare5/options/echo-retail-0B-r4.wav) / [after](../../../.local/snes-test/audio/compare5/options/echo-retail-0B-edl-minus1.wav) |
| $0C | 2 → 1 | 32 → 16 ms | 315 | 105 → 50 ms | +0.21 dB | [before](../../../.local/snes-test/audio/compare5/options/echo-retail-0C-r4.wav) / [after](../../../.local/snes-test/audio/compare5/options/echo-retail-0C-edl-minus1.wav) |
| $0E | 11 → 10 | 176 → 160 ms | 729 | 2640 → 2565 ms | +0.07 dB | [before](../../../.local/snes-test/audio/compare5/options/echo-retail-0E-r4.wav) / [after](../../../.local/snes-test/audio/compare5/options/echo-retail-0E-edl-minus1.wav) |
| $11 | 6 → 5 | 96 → 80 ms | 1816 | 105 → 90 ms | -0.64 dB | [before](../../../.local/snes-test/audio/compare5/options/echo-retail-11-r4.wav) / [after](../../../.local/snes-test/audio/compare5/options/echo-retail-11-edl-minus1.wav) |
| $14 | 2 → 1 | 32 → 16 ms | 1692 | 40 → 25 ms | -0.22 dB | [before](../../../.local/snes-test/audio/compare5/options/echo-retail-14-r4.wav) / [after](../../../.local/snes-test/audio/compare5/options/echo-retail-14-edl-minus1.wav) |
| $2C | 6 → 5 | 96 → 80 ms | 52 | 1825 → 1385 ms | -1.57 dB | [before](../../../.local/snes-test/audio/compare5/options/echo-retail-2C-r4.wav) / [after](../../../.local/snes-test/audio/compare5/options/echo-retail-2C-edl-minus1.wav) |
| $39 | 4 → 3 | 64 → 48 ms | 422 | 195 → 150 ms | +0.03 dB | [before](../../../.local/snes-test/audio/compare5/options/echo-retail-39-r4.wav) / [after](../../../.local/snes-test/audio/compare5/options/echo-retail-39-edl-minus1.wav) |
| $3B arrival | 5 → 4 | 80 → 64 ms | 1245 | 485 → 390 ms | +0.27 dB | [before](../../../.local/snes-test/audio/compare5/options/echo-new-3B-r4.wav) / [after](../../../.local/snes-test/audio/compare5/options/echo-new-3B-edl-minus1.wav) |
| $3C battle | 4 → 3 | 64 → 48 ms | 872 | 200 → 150 ms | +0.26 dB | [before](../../../.local/snes-test/audio/compare5/options/echo-new-3C-r4.wav) / [after](../../../.local/snes-test/audio/compare5/options/echo-new-3C-edl-minus1.wav) |
| $3D orbit | 6 → 5 | 96 → 80 ms | 1501 | 485 → 405 ms | +0.16 dB | [before](../../../.local/snes-test/audio/compare5/options/echo-new-3D-r4.wav) / [after](../../../.local/snes-test/audio/compare5/options/echo-new-3D-edl-minus1.wav) |

EDL reduction is **not acoustically free**. Danger’s measured tail changes **195 → 145 ms**, `$0C` **105 → 50 ms**, and `$2C` **1,825 → 1,385 ms**. At EDL 2→1 the delay halves. `$02`’s selected phrase changes **−4.44 dB** in stereo RMS, `$0B` **−2.38 dB**, and `$2C` **−1.57 dB** even though no volume parameter changes: feedback and phase coloration matter as well as tail length. These are the priority music pairs for maintainer listening, not grounds to describe the change as inaudible. `options.json` also gives echo-tail energy changes.

## Four resident samples and cue design

| Sample | Source / synthesis | Rate | BRR | ARAM start | Codec SNR |
| --- | --- | ---: | ---: | --- | ---: |
| snap | `hit-1.wav` transient + high-pass noise | 16,000 Hz | 288 B | $4DF1 | 21.6 dB |
| body | Synthesized 213→63 Hz body + short harmonic | 8,000 Hz | 576 B | $4F11 | 53.8 dB |
| boom | `impact.wav` + filtered noise and low sine | 8,000 Hz | 576 B | $5151 | 28.7 dB |
| roar | `beam.wav`, overlapped and softly saturated loop | 12,000 Hz | 360 B | $5391 | 24.7 dB |

The snap contains 31 ms of sound plus a 1 ms guard; the body/boom 126 ms plus 2 ms guards. The roar has a **624-sample / 52 ms loop**, at BRR offset 9 (`$539A`), with an 8 ms overlap and filter-0 entry. Repeating the decoded loop is bit-identical despite the decoder’s incoming history. Source shaping and level setting occur before BRR encoding; the cue recordings have no post-render processing.

Hit and kick share snap/body samples, with different pitches and slides. Impact shares the snap and adds the low explosion. Beam plays the short roar loop for **108 sequencer ticks**, with the current song’s echo and a short low explosion underneath; the second voice returns after about 240 ms instead of staying stolen for the whole wave. All cues use at most two voices. The body/boom one-shots stop in BRR and the sequencer returns ownership at `F2`.

Prototype ids are `$E7` hit, `$E8` kick, `$EA` beam and **new `$ED` impact**. Retail `$38` remains unchanged. `$ED`’s four-byte table entry reuses the old, now-unreferenced shared hit/kick body at `$2FB4`. All new sequences live at `$54F9–$554F`; the prototype never uses the general audition helper’s `$3000/$3100` scratch, which would overwrite original effects. Tests compare both tracks of all 220 retail slots and every unrelated resident cue.

### Listening package

All links below point to private files in this worktree; they are not checked in. `manifest.json` records hashes, addresses, rates, sequence bytes, cue metrics, voice ownership, context mixes and option measurements. The package contains **68 nonempty, 32 kHz WAVs**.

| Cue | Round four | Custom | Alternate 1 | Alternate 2 |
| --- | --- | --- | --- | --- |
| hit | [r4](../../../.local/snes-test/audio/compare5/hit-r4.wav) | [custom](../../../.local/snes-test/audio/compare5/hit-custom.wav) | [alt1](../../../.local/snes-test/audio/compare5/hit-alt1.wav) | [alt2](../../../.local/snes-test/audio/compare5/hit-alt2.wav) |
| kick | [r4](../../../.local/snes-test/audio/compare5/kick-r4.wav) | [custom](../../../.local/snes-test/audio/compare5/kick-custom.wav) | [alt1](../../../.local/snes-test/audio/compare5/kick-alt1.wav) | [alt2](../../../.local/snes-test/audio/compare5/kick-alt2.wav) |
| impact | [r4](../../../.local/snes-test/audio/compare5/impact-r4.wav) | [custom](../../../.local/snes-test/audio/compare5/impact-custom.wav) | [alt1](../../../.local/snes-test/audio/compare5/impact-alt1.wav) | [alt2](../../../.local/snes-test/audio/compare5/impact-alt2.wav) |
| beam | [r4](../../../.local/snes-test/audio/compare5/beam-r4.wav) | [custom](../../../.local/snes-test/audio/compare5/beam-custom.wav) | [alt1](../../../.local/snes-test/audio/compare5/beam-alt1.wav) | [alt2](../../../.local/snes-test/audio/compare5/beam-alt2.wav) |

Alternate 1 uses DSP-noise cracks over the custom bodies for hit/kick/impact, and a brighter sampled roar plus sustained noise for the beam. Alternate 2 lowers the bodies/roar further. The main sampled transients have much less >4 kHz energy than round four: they emphasize the impact’s body and recorded texture. **Start listening with the `alt1` contacts if the main samples are too soft on top.** This is a listening choice, not an automated claim that a lower spectral score sounds better.

| Cue / version | Peak delay ms | Peak dBFS | Crest dB | <200 Hz, first 80 ms | >4 kHz, first 30 ms | Audible ms | Voice-ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| hit / r4 | 6.16 | -7.14 | 15.45 | 0.48868 | 0.10276 | 140 | 210 |
| hit / custom | 1.59 | -9.21 | 13.31 | 0.52792 | 0.00397 | 130 | 220 |
| hit / alt1 | 2.88 | -6.39 | 15.43 | 0.54302 | 0.09715 | 135 | 210 |
| kick / r4 | 6.16 | -6.32 | 14.01 | 0.49967 | 0.26576 | 140 | 240 |
| kick / custom | 1.91 | -8.94 | 13.72 | 0.60955 | 0.00342 | 150 | 310 |
| kick / alt1 | 6.22 | -6.61 | 13.67 | 0.63463 | 0.22190 | 150 | 310 |
| impact / r4 | 78.06 | -12.54 | 11.42 | 0.05215 | 0.04304 | 275 | 580 |
| impact / custom | 11.22 | -11.62 | 14.67 | 0.16468 | 0.00227 | 155 | 290 |
| impact / alt1 | 12.16 | -9.68 | 14.47 | 0.16907 | 0.12561 | 155 | 310 |
| beam / r4 | 716.16 | -6.39 | 9.98 | 0.29343 | 0.02457 | 1165 | 2100 |
| beam / custom | 304.59 | -9.28 | 9.03 | 0.49862 | 0.00036 | 1145 | 1290 |
| beam / alt1 | 187.44 | -9.03 | 9.51 | 0.28298 | 0.00599 | 1165 | 1980 |

Metrics are exactly `punch.mjs`’s definitions: peak delay from −60 dB relative sample onset; 5 ms RMS duration to −40 dB relative peak RMS; band energy in Hann-corrected FS² ms; ownership sampled every 10 ms. Beam isolation uses preset 4 (EDL 4, EVOL 64, EFB 30, FIR 0); the other isolated cues are dry. New kick has a longer silent ownership tail than round four (**310 versus 240 voice-ms**); beam ownership falls **2,100 → 1,290 voice-ms**. The custom impact peaks at **11.22 versus 78.06 ms** and has **3.16×** the low-band attack energy. These support faster impact and greater body, not a subjective listening verdict.

The [round-four](../../../.local/snes-test/audio/compare5/beam-contacts-r4.wav) / [custom](../../../.local/snes-test/audio/compare5/beam-contacts-custom.wav) wave pair plays nine contacts six video frames apart. `mix-<arrangement>-r4.wav` / `mix-<arrangement>-custom.wav` cover rapid contacts and four full waves in every arrangement, using the proposed EDL only on the custom side. All have **zero clipped samples**, live music tracks and intact samples/extension. Custom peaks for arrival/battle/orbit/Vegeta/full-power are **-5.03 / -6.09 / -6.12 / -6.21 / -4.65 dBFS** (at least **4.65 dB** measured headroom).

## Cartridge implementation boundary

At the round-five checkpoint there was **no `AUDIO_CUSTOM_SAMPLES` define**. No 1–2.5 KiB allocation was proven free of audible native changes while retaining the existing features. The 2 KiB option changes native echo; lower-rate retail replacements change effects. The prototype is reproducible in the APU harness without changing the default cartridge.

The round-five implementation boundary was the following; round six implements it entirely in audio:

1. Upload the sample bank, sequences and 32 metadata bytes once at boot through the audio extension uploader. The current prototype needs **1,919 extra payload bytes**, plus transfer headers; this is not per-frame streaming. Put the generated assets in audio-owned ROM/xdata.
2. Reserve the cache floor. Retail `C3:012E` reads the original effect chunk length and `C3:0133` adds `$4800`, storing the result in `$1EF8/$1E48`. Changing the operand at `C3:0134` to `$5000` produces `$55F1` without adding hot-path instructions. Do not merely increase the original chunk length: its ROM bytes are followed by unrelated tables.
3. Apply a generated per-song maximum EDL when reading echo presets, including noncanonical callers, and keep EVOL/EFB/FIR unchanged. Extend the boot/restored effect block with the new pointer mapping and move only the mod’s impact lookup to `$ED`; do not alter retail `$38`.
4. Validate boot, consecutive song loads/compaction, long native sequences (notably `$32`, which overlaps the effect area), rare voices, imported states, all native songs and the emulator/frame-budget suites before any opt-in cartridge is presented as working.

The allocation tests exposed a harness issue: `loadSong` installed RAM before its command handshake, allowing the **old echo ring to erase a newly shifted sample tail** (song `$05`, instrument 30, starting at `$EA02`). It now disables echo writes before installation, matching the real CPU loader. The full sample/DIR/tuning/ADSR checks then pass for all 69 allocation rows. This is a test-helper fix, not a cartridge/core change.

## Validation and CPU cost

`node snes/build.mjs --strict` passes. Rebuilding after the tools/docs changes produces the **exact same ROM SHA-256** listed above. `audio` passes **26 Node tests**, the five-song browser-reference render, and all **10 Mesen cases**. The five new Node tests cover the 2 KiB bounds, retail/unrelated sequence preservation, all 69 shifted sample sets with every BRR/DIR/tuning/ADSR byte checked, all cue alternates, dense playback in `$04/$0C/$2C` and the five arrangements, deterministic loop history, and concurrent rare streaming. `samples.mjs --options` also checks endings, voice limits, headroom and sample/extension integrity while writing the listening package.

**Round-five shipping CPU cost: zero added instructions, uploads or per-frame work.** No gameplay/perf run was required because no shipping code or data changed. The proposed resident playback would use native note scheduling, with no stream service; its one-time boot upload and loader/echo integration have not been implemented or timed. Physical-hardware and perceptual listening approval remain open. The original round-two trace remains unavailable; the fresh trace is documented separately above. No core or other-module change is requested.

Measurement checkpoint: `3554418`. The follow-up prototype commit contains the remaining tools, harness checks and this recommendation.
