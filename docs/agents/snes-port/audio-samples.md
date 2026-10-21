# Resident custom samples: storage investigation and prototype

## Round-six cartridge option

`node snes/build.mjs --strict -DAUDIO_CUSTOM_SAMPLES=1` builds the resident
proposal into the cartridge; omitting the define (or setting it to 0) keeps
the default byte-identical to an independent build of `12b101c`. Both hashes
are `61a0c112481616314e7dae0cdd97ffab9e49c57079c6ed64da9cebc1cda327ea`.
The historical round-five measurements below remain the audition reference.

Synthesis and sequence choices now live in `snes/gen/audio-custom.mjs`.
Provisional takes are `hit:alt1,kick:alt1,impact:custom,beam:custom`;
`AUDIO_CUSTOM_TAKES` overrides any cue. `AUDIO_CUSTOM_LEVELS` supplies dB
relative to round five for each cue (initial implementation defaults to 0;
cartridge loudness calibration follows). Example:

```sh
AUDIO_CUSTOM_TAKES=hit:alt1,kick:alt1,impact:custom,beam:custom \
AUDIO_CUSTOM_LEVELS=hit:0,kick:0,impact:0,beam:0 \
node snes/build.mjs --strict -DAUDIO_CUSTOM_SAMPLES=1
```

The existing IPL extension uploader carries a 2 KiB reserved bank, 32
metadata bytes, and five bytes of SPC hook/trampoline patches. The bank
contains 1,800 BRR bytes, the selected sequences, padding and a small gain
routine. A PCALL at `$0BCA` selects the native effect gain by id, preserving
music's separate entry at `$0BCC` and the exact `$90` gain for retail ids.
Levels are quantized to `round($90 * 10^(dB/20))`, limited to −24…+4.9 dB.
No sample re-encoding or post-render normalization is used for levels.

The floor operand at `C3:0134` becomes `$5000`, yielding `$55F1`. Native
compaction and the temporary accelerated receiver continue to use the cache
addresses initialized there. The EDL hook preserves the FE token in B,
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

First implementation checkpoint: strict builds, 28 Node tests, Mesen
`loads` (all 64 shipping slots with samples/DIR/tuning/ADSR and the resident
bank checked after every load), `native` and `rare-boot` pass. Full suites,
cartridge recordings and timing/level measurements follow in the validation
checkpoint.

Spoilers. Round five, based on `c1674a7`; companion to [audio.md](audio.md). The shipping build is unchanged. This investigation and its recordings live in the audio test tools, not in the cartridge generator.

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

This job deliberately ships **no `AUDIO_CUSTOM_SAMPLES` define**. No 1–2.5 KiB allocation was proven free of audible native changes while retaining the existing features. The 2 KiB option changes native echo; lower-rate retail replacements change effects. The prototype is reproducible in the APU harness without changing the default cartridge.

If the maintainer chooses the 2 KiB option, implementation belongs entirely to audio:

1. Upload the sample bank, sequences and 32 metadata bytes once at boot through the audio extension uploader. The current prototype needs **1,919 extra payload bytes**, plus transfer headers; this is not per-frame streaming. Put the generated assets in audio-owned ROM/xdata.
2. Reserve the cache floor. Retail `C3:012E` reads the original effect chunk length and `C3:0133` adds `$4800`, storing the result in `$1EF8/$1E48`. Changing the operand at `C3:0134` to `$5000` produces `$55F1` without adding hot-path instructions. Do not merely increase the original chunk length: its ROM bytes are followed by unrelated tables.
3. Apply a generated per-song maximum EDL when reading echo presets, including noncanonical callers, and keep EVOL/EFB/FIR unchanged. Extend the boot/restored effect block with the new pointer mapping and move only the mod’s impact lookup to `$ED`; do not alter retail `$38`.
4. Validate boot, consecutive song loads/compaction, long native sequences (notably `$32`, which overlaps the effect area), rare voices, imported states, all native songs and the emulator/frame-budget suites before any opt-in cartridge is presented as working.

The allocation tests exposed a harness issue: `loadSong` installed RAM before its command handshake, allowing the **old echo ring to erase a newly shifted sample tail** (song `$05`, instrument 30, starting at `$EA02`). It now disables echo writes before installation, matching the real CPU loader. The full sample/DIR/tuning/ADSR checks then pass for all 69 allocation rows. This is a test-helper fix, not a cartridge/core change.

## Validation and CPU cost

`node snes/build.mjs --strict` passes. Rebuilding after the tools/docs changes produces the **exact same ROM SHA-256** listed above. `audio` passes **26 Node tests**, the five-song browser-reference render, and all **10 Mesen cases**. The five new Node tests cover the 2 KiB bounds, retail/unrelated sequence preservation, all 69 shifted sample sets with every BRR/DIR/tuning/ADSR byte checked, all cue alternates, dense playback in `$04/$0C/$2C` and the five arrangements, deterministic loop history, and concurrent rare streaming. `samples.mjs --options` also checks endings, voice limits, headroom and sample/extension integrity while writing the listening package.

**Shipping CPU cost: zero added instructions, uploads or per-frame work.** No gameplay/perf run was required because no shipping code or data changed. The proposed resident playback would use native note scheduling, with no stream service; its one-time boot upload and loader/echo integration have not been implemented or timed. Physical-hardware and perceptual listening approval remain open. The original round-two trace remains unavailable; the fresh trace is documented separately above. No core or other-module change is requested.

Measurement checkpoint: `3554418`. The follow-up prototype commit contains the remaining tools, harness checks and this recommendation.
