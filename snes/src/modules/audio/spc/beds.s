; Resident beds use the native effect allocator, sequencer, fades and F2
; release. $81 id level rate is a single asynchronous four-port command.
; Mutable parameters occupy unused tuning entries $3E/$3F (not song data).
LEVEL = $187C
RATE = $187E
 org $14B4
 dw bed_command
 org $0BED
 CALL !resident_gain
 NOP
 org $0C48
 CALL !resident_pitch
 NOP
 org $0E10
 CALL !resident_effect
; Round nine: songs start and fade in steps of MUSIC_STEP ($0C) instead of
; $11 per volume nibble, 3.0 dB below the retail level. Effects keep their
; own gain path ($90), so every effect sits 3 dB higher against the music.
 org $0DC3
 MOV Y,#MUSIC_STEP
 org $1018
 MOV Y,#MUSIC_STEP
 org CODE_BASE
bed_command:
 MOV A,$B5
 SETC
 SBC A,#$ED
 CMP A,#2
 BCC bed_valid
 RET
bed_valid:
 MOV X,A
 MOV A,$B7
 MOV !RATE+X,A
 MOV A,!LEVEL+X
 MOV Y,A
 MOV A,$B6
 MOV !LEVEL+X,A
 MOV A,Y                    ; sets Z for the previous level; no stack round trip
 BEQ bed_start
 CALL !bed_find
 BNE bed_found
bed_start:
 MOV A,$B6
 BEQ bed_return
 PUSH A
 MOV A,$B5
 PUSH A
 ; The resident ki pulse supplies both onset and sustain on this voice.
 ; No extra activation cue, pitch modulation or per-tick synthesis.
 MOV $B6,#$0F
 MOV $B7,#$88
 CALL !$0E10
 POP A
 MOV $B5,A
 POP A
 MOV $B6,A
 CALL !bed_find
 BEQ bed_return
 MOV A,#0
 MOV !$FC01+X,A
bed_found:
 MOV $05,X
 OR $CA,$B2
 MOV A,$B6
 BEQ bed_stop
 MOV Y,A
 MOV A,#CHARGE_SCALE
 CMP $B5,#$ED
 BEQ bed_scale
 MOV A,#76
bed_scale:
 MUL YA
 MOV A,#6
 MOV $34,A
 MOV !$FC80+X,A
 MOV A,Y
 JMP $067C
bed_stop:
 MOV A,#<bed_release
 MOV $0C+X,A
 MOV A,#>bed_release
 MOV $0D+X,A
 MOV A,#1
 MOV $3C+X,A
bed_return:
 RET
; Z clear if the native driver still owns this id. X=track, B2=voice bit.
bed_find:
 MOV Y,#7
 MOV X,#$1E
 MOV $B2,#$80
bed_find_next:
 MOV A,$B2
 AND A,$AE
 BEQ bed_find_skip
 MOV A,!$FF80+Y
 CMP A,$B5
 BNE bed_find_skip
 MOV A,#1
 RET
bed_find_skip:
 DEC X
 DEC X
 LSR $B2
 DEC Y
 BPL bed_find_next
 MOV A,#0
 RET
; Native gain has a fixed 1/2 attenuation. Keep it for retail/music and E9's
; distant impact; sampled swings, E7/E8/F1 contacts and PC cues use full gain.
resident_gain:
 CMP X,#$10
 BCC gain_half
 PUSH A
 MOV A,X
 AND A,#$0E
 LSR A
 MOV Y,A
 MOV A,!$FF80+Y
 CMP A,#$DE
 BEQ gain_ki                ; ki launch
 CMP A,#KI_CONTACT          ; round nine's IMPACT counts like a contact
 BEQ gain_ki
 ; Keep the old comparison's cycles for unrelated effects. Removing it
 ; shifts SPC handshakes enough to add a miss in teleport's phase-2 test.
 ; Row $7D is empty again; no charge activation calls it.
 CMP A,#$7D
 BEQ gain_full
 CMP A,#$E5
 BCC gain_old
 CMP A,#$E7
 BCC gain_full
 CMP A,#$E9
 BCC gain_ki                ; HIT/KICK
 BEQ gain_old
 CMP A,#$F1
 BEQ gain_ki                ; SSJ KICK
 BCS gain_old
 CMP A,#$EA
 BEQ gain_contact
 CMP A,#$F0
 BEQ gain_contact
gain_full:
 POP A
 BRA gain_done
gain_old:
 POP A
gain_half:
 LSR A
gain_done:
 MOV Y,A
 MOV A,$35
 RET
; Under the Kamehameha (its duck's song fade runs, or any song fade) the
; contacts, ki launches and ki contacts halve, as the PC's compressor tames
; everything under its beam, and the wave and its echo tail keep headroom.
gain_ki:
 MOV A,$8B
 BNE gain_old
; Contacts alone use full authored gain. Three/four effect voices halve
; them; five or more quarter them. Music is not counted in AE or attenuated.
; Only contact gain recalculations do this; there is no new timer callback.
gain_contact:
 MOV Y,#0
 MOV A,$AE
gain_count:
 LSR A
 BCC gain_next
 INC Y
gain_next:
 CMP A,#0
 BNE gain_count
 POP A
 CMP Y,#5
 BCC gain_three
 LSR A
gain_three:
 CMP Y,#3
 BCS gain_half
 BRA gain_done
; Round nine: E5..E8 are released by the loop at $1868; the SSJ finisher
; F1 (outside that range) follows, so no finisher tail halves the next hit.
release_ssj_kick:
 MOV $B5,#$F1
release_ssj_loop:
 CALL !bed_find
 BEQ release_ssj_done
 CALL !$09BE
 BRA release_ssj_loop
release_ssj_done:
 RET
resident_bank_tail:
; A/Y = native pitch, X = track. Only the two beds have a variable rate.
; Unused DIR entries $34-$3F: native songs only load entries $20-$2F.
 org $19D0
resident_pitch:
 CMP X,#$10
 BCC pitch_done
 PUSH A
 PUSH Y
 MOV A,X
 AND A,#$0E
 LSR A
 MOV Y,A
 MOV A,!$FF80+Y
 CMP A,#$ED
 BEQ pitch_charge
 CMP A,#$EE
 BEQ pitch_aura
 POP Y
 POP A
 BRA pitch_done
pitch_charge:
 POP Y
 POP A
 MOV Y,!RATE
 MOV A,#CHARGE_PITCH
 BRA pitch_mul
pitch_aura:
 POP Y
 POP A
 MOV Y,!RATE+1
 MOV A,#6
pitch_mul:
 MUL YA
pitch_done:
 MOV X,$35
 MOV $F2,X
 RET
 org resident_bank_tail
bed_release:
 db $D3,6,0,$BF,$F2
; The beam command is also its charge-release command. This saves a CPU
; stop dispatch on the busiest beam/contact frame, without a timer or poll.
resident_effect:
 CALL !vary_effect
 OR $C9,$AE                ; recalculate existing contacts before a new mix
 MOV A,$B5
 ; Under the Kamehameha (its duck's fade) the wave's contacts arrive every
 ; frame: a ki contact still sounding drops the next (as p2 low nibble 0)
 ; instead of restarting at 60 Hz, like the PC's two-frame impact limit.
 CMP A,#KI_CONTACT
 BNE effect_wave
 MOV A,$8B
 BEQ effect_ready
 MOV $B6,#0
 BRA effect_ready
effect_wave:
 CMP A,#$EA
 BEQ release_beds
 CMP A,#$F0
 BNE effect_ready
release_beds:
 PUSH A
 MOV $B5,#$ED
 CALL !bed_find
 BEQ release_aura
 CALL !bed_stop
release_aura:
 MOV $B5,#$EE
 CALL !bed_find
 BEQ release_done
 CALL !bed_stop
release_done:
 MOV A,#0
 MOV !LEVEL,A
 MOV !LEVEL+1,A
 ; Round nine: the release ducks the song volume by DUCK/256 at once and
 ; lets the driver's own fade ($1020: 31.5 ms steps) restore it under the
 ; wave. Skipped while a song/CPU fade runs; port 1 is not touched.
 MOV A,$8B
 BNE duck_done
 MOV A,$84
 MOV $B6,A                  ; fade target: the volume before the duck
 MOV Y,#DUCK
 MUL YA
 MOV $84,Y
 OR $C9,$AD                 ; every music voice takes the duck now
 MOV $B5,#DUCK_STEPS
 CALL !$1020
 MOV $83,#$FF               ; seed the fraction: the 8.8 step truncates, so
                            ; the fade then lands exactly on its start volume
 MOV $B6,#$0F               ; the wave's p2 (every caller sends 02 ee 0F 88)
duck_done:
 POP A
 MOV $B5,A
effect_ready:
 MOV A,$B5
 CMP A,#$F1
 BNE effect_normal
 JMP !release_contact
effect_normal:
 JMP !release_swings
; p2's low nibble is only a reuse boolean in the native allocator. Both
; $0F and $0D reuse DE; bit 1 carries the form without another effect id,
; command, timer callback or voice during a mid-volley form change.
blast_form:
 MOV A,$B6
 EOR A,#$0F
 MOV !BLAST_FORM,A
 XCN A
 LSR A                      ; round nine: $EF normal, $FF SSJ
 CLRC
 ADC A,#$EF
 MOV !BLAST_VOLUME,A
 RET
; A contact replaces its preceding whoosh, and (round nine) any HIT/KICK
; tail still sounding, before allocation/gain counting: the new crack
; supersedes the old one instead of halving both.
; These unused instrument $34-$3D tuning / $34-$3F ADSR entries survive
; every song load (songs only install $20-$2F). No BRR or echo space changes.
 org $18E8
release_swings:
 MOV A,$B5
 CMP A,#$E7
 BCC effect_return
 CMP A,#$E9
 BCS effect_return
release_contact:
 PUSH A
 MOV $B5,#$E5
 CALL !release_swing_loop
 POP A
 MOV $B5,A
effect_return:
 MOV $2C,$B5
 RET
 org $1868
release_swing_loop:
 CALL !bed_find
 BEQ release_swing_next
 ; Native F2, after its sequencer-stack unwind: release effect ownership,
 ; noise/pitch-mod/echo state, then let the allocator return/reuse the voice.
 CALL !$09BE
 BRA release_swing_loop     ; again: a contact owns two voices
release_swing_next:
 INC $B5
 CMP $B5,#$E9
 BNE release_swing_loop
 JMP !release_ssj_kick

; Per-track arrays stop at $017F. Keep $01C0-$01FF for the CPU stack;
; startup/song entry reset SP to $FF and the driver has no interrupts.
; E9 operands hold independent three-step counters; no timer/host work.
 org $0180
vary_effect:
 MOV A,$B5
 CMP A,#$E5
 BEQ vary_swing
 CMP A,#$E7
 BEQ vary_hit
 CMP A,#$DE
 BNE vary_return
 CALL !blast_form
 MOV X,#<BLAST_TUNE
 BRA vary_pitch
vary_hit:
 MOV X,#<HIT_TUNE
 BRA vary_pitch
vary_swing:
 MOV A,!SWING_SWELL
 EOR A,#5                 ; 6 / 3 ticks: soft or quick swell
 MOV !SWING_SWELL,A
 MOV A,!SWING_SWEEP
 EOR A,#$0C               ; -5 / -9 semitones: two motion textures
 MOV !SWING_SWEEP,A
 MOV X,#<SWING_TUNE
vary_pitch:
 MOV A,!TUNE_PAGE+X
 BEQ vary_high
 BPL vary_low
 MOV A,#0                 ; 1.0 after the initial / previous low rate
 BRA vary_store
vary_high:
 MOV A,#9                 ; 1 + 9/256 = 1.03515625
 BRA vary_store
vary_low:
 MOV A,#$FA               ; 1 - 6/256 = .9765625
vary_store:
 MOV !TUNE_PAGE+X,A
vary_return:
 RET
