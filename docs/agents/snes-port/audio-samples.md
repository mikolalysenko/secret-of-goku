# Resident custom samples: storage investigation and prototype

Spoilers. Round five, based on `c1674a7`; companion to [audio.md](audio.md). The shipping build is unchanged. This investigation and its recordings live in the audio test tools, not in the cartridge generator.

## Reproduce the measurements

```sh
node snes/build.mjs --strict
export MESEN=/Users/mikolalysenko/Projects/secret-of-goku/.local/tools/mesen/Mesen.app/Contents/MacOS/Mesen
SNES_ROM=dist/snes/secret-of-goku.sfc node snes/test/audio/run.mjs
node snes/test/audio/audit.mjs --trace
node snes/test/audio/sample-audit.mjs --rates --trace=.local/snes-test/audio/audit/trace/results.json
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
- Sharing a sample at different pitches costs no extra BRR or 65816 work. The prototype will share one snap between hit/kick/impact and one low body between contacts, and sustain the beam from a short loop rather than storing its full duration.

## Validation at the measurement checkpoint

Strict default build passes. All **21 Node tests**, five-song browser comparison renders and **10 Mesen audio cases** pass (`loads`, `native`, `music`, `rare`, `rare-control`, `rare-boot`, `stream`, `songs`, `arrival`, `imported`). The measurement tool checks 69 song rows, unique-id byte sums, contiguous BRR endpoints, total sample bytes, sequence loop structure and reserved instrument selectors. No shipping instruction or data byte is changed; no gameplay/perf run is required for this test-only investigation.

Prototype recordings, echo-tail comparisons and the final recommendation follow in the next validated batch. No native effects or music have been modified in a cartridge.
