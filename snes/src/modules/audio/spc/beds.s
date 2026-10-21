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
 PUSH A
 MOV A,$B6
 MOV !LEVEL+X,A
 POP A
 CMP A,#0
 BEQ bed_start
 CALL !bed_find
 BNE bed_found
bed_start:
 MOV A,$B6
 BEQ bed_return
 PUSH A
 MOV A,$B5
 PUSH A
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
 MOV A,#140
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
; distant impact; sampled swings, E7/E8 contacts and PC cues use full gain.
resident_gain:
 CMP X,#$10
 BCC gain_half
 PUSH A
 MOV A,X
 AND A,#$0E
 LSR A
 MOV Y,A
 MOV A,!$FF80+Y
 CMP A,#$E5
 BCC gain_old
 CMP A,#$E7
 BCC gain_full
 CMP A,#$E9
 BCC gain_contact
 BEQ gain_old
 CMP A,#$F1
 BCS gain_old
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
 MOV A,#4
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
 CMP $B5,#$E5
 BNE swing_ready
 MOV A,!SWING_SWELL
 EOR A,#5                 ; 6 / 3 ticks: soft or quick swell
 MOV !SWING_SWELL,A
swing_ready:
 CALL !vary_effect
 OR $C9,$AE                ; recalculate existing contacts before a new mix
 MOV A,$B5
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
 POP A
 MOV $B5,A
effect_ready:
 JMP !release_swings
; A contact replaces its preceding whoosh before allocation/gain counting.
; These unused instrument $34-$3D tuning / $34-$3F ADSR entries survive
; every song load (songs only install $20-$2F). No BRR or echo space changes.
 org $18E8
release_swings:
 MOV A,$B5
 CMP A,#$E7
 BCC effect_return
 CMP A,#$E9
 BCS effect_return
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
release_swing_next:
 INC $B5
 CMP $B5,#$E7
 BNE release_swing_loop
 RET

; Per-track arrays stop at $017F. Keep $01C0-$01FF for the CPU stack;
; startup/song entry reset SP to $FF and the driver has no interrupts.
; E9 operands hold independent three-step counters; no timer/host work.
 org $0180
vary_effect:
 CMP $B5,#$E5
 BNE vary_hit
 MOV A,!SWING_SWEEP
 EOR A,#$0C               ; -5 / -9 semitones: two motion textures
 MOV !SWING_SWEEP,A
 MOV X,#<SWING_TUNE
 BRA vary_pitch
vary_hit:
 CMP $B5,#$E7
 BNE vary_blast
 MOV X,#<HIT_TUNE
 BRA vary_pitch
vary_blast:
 CMP $B5,#$DE
 BNE vary_return
 MOV X,#<BLAST_TUNE
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
