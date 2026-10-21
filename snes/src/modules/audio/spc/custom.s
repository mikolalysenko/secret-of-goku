; Per-cue output level after native gain/pan. Music and retail effects retain
; the exact original LSR A / MOV Y,A / MOV A,$35 result. X is preserved.
; Gain is Q6 (64 = round-five level); the signed DSP volume saturates at 127.
; Cartridge captures check that the chosen centered levels never saturate.
 org $0BED
 CALL !custom_gain
 NOP
 org $5580
custom_gain:
 LSR A
 CMP X,#$10
 BCC custom_done
 PUSH X
 PUSH A
 MOV A,X
 AND A,#$0E
 LSR A
 MOV X,A
 MOV A,!$FF80+X
 SETC
 SBC A,#$E7
 CMP A,#$07
 BCS custom_retail
 MOV X,A
 POP A
 MOV Y,A
 MOV A,!custom_levels+X
 MOV X,#$40
 MUL YA
 CMP Y,#$40
 BCS custom_saturate
 DIV YA,X
 CMP A,#$80
 BCC custom_restore
custom_saturate:
 MOV A,#$7F
 BRA custom_restore
custom_retail:
 POP A
custom_restore:
 POP X
custom_done:
 MOV Y,A
 MOV A,$35
 RET
custom_levels:
 db HIT_LEVEL,KICK_LEVEL,$40,BEAM_LEVEL,$40,$40,IMPACT_LEVEL
