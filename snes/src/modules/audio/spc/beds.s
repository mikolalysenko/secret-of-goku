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
; distant impact; E7/E8 contacts and the sampled PC cues use full gain.
resident_gain:
 CMP X,#$10
 BCC gain_half
 PUSH A
 MOV A,X
 AND A,#$0E
 LSR A
 MOV Y,A
 MOV A,!$FF80+Y
 CMP A,#$E7
 BCC gain_old
 CMP A,#$E9
 BCC gain_contact
 BEQ gain_old
 CMP A,#$F1
 BCS gain_old
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
 MOV $2C,$B5
 RET
