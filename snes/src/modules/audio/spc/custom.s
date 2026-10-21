; Per-cue level at the native effect gain multiply ($0BCA). Music enters
; at $0BCC and bypasses this PCALL. Retail effects keep exactly $90.
; Y is the track volume; X is the effect track (voice*2+$10).
; The IPL ROM is unmapped. $FFFB-$FFFF follows the stream extension.
 org $0BCA
 PCALL $FB
 org $FFFB
 JMP !custom_gain
 org $5580
custom_gain:
 PUSH Y
 MOV A,X
 AND A,#$0E
 LSR A
 MOV Y,A
 MOV A,!$FF80+Y
 SETC
 SBC A,#$E7
 CMP A,#$07
 BCS custom_retail
 MOV Y,A
 MOV A,!custom_levels+Y
 BRA custom_done
custom_retail:
 MOV A,#$90
custom_done:
 POP Y
 RET
custom_levels:
 db HIT_LEVEL,KICK_LEVEL,$90,BEAM_LEVEL,$90,$90,IMPACT_LEVEL
