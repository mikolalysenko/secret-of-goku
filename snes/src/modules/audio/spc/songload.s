; Temporary song-loader workspace in the stream ring. The CPU installs this
; after song command 01 has keyed off every voice, and restores FE's vectors
; before returning. Nothing here is resident while music/streams play.
; FE mode 4: three bytes per nonzero counter; zero returns to FE's header.
; Every acknowledgement follows ALL three port reads (independent clocks).
 org $FA00
song_receive:
 MOV A,$2C
 MOV !song_store0+1,A
 MOV !song_store1+1,A
 MOV !song_store2+1,A
 MOV A,$2D
 MOV !song_store0+2,A
 MOV !song_store1+2,A
 MOV !song_store2+2,A
 MOV Y,#$00
song_packet:
 MOV A,$F5
song_store0:
 MOV !$0000+Y,A
 INC Y
 MOV A,$F6
song_store1:
 MOV !$0000+Y,A
 INC Y
 MOV A,$F7
song_store2:
 MOV !$0000+Y,A
 INC Y
 MOV $F4,X
 CMP Y,#$FF
 BNE song_wait
 ; 85 triples: advance the base by 255 without ever wrapping Y in a packet.
 MOV A,#$FF
 MOV Y,#$00
 ADDW YA,$2C
 MOVW $2C,YA
 CALL song_rebase
song_wait:
 CMP X,$F4
 BEQ song_wait
 MOV X,$F4
 BNE song_packet
 JMP !$11EA
song_rebase:
 MOV !song_store0+1,A
 MOV !song_store1+1,A
 MOV !song_store2+1,A
 MOV !song_store0+2,Y
 MOV !song_store1+2,Y
 MOV !song_store2+2,Y
 MOV Y,#$00
 RET

; FE mode 7, unchanged source/destination/length handshake. Full pages use
; an unrolled copy, with pointer/count maintenance once per 256 bytes.
; Forward copying deliberately retains the native overlapping-move behavior.
song_copy:
 MOVW YA,$F6
 MOVW $2E,YA
 MOV $F4,X
song_copy_length:
 CMP X,$F4
 BEQ song_copy_length
 MOV X,$F4
 MOVW YA,$F6
 MOVW $34,YA
 MOV $F4,X
 MOV Y,#$00
 MOV A,$35
 BEQ song_copy_tail
song_copy_page:
 MOV A,[$2C]+Y
 MOV [$2E]+Y,A
 INC Y
 MOV A,[$2C]+Y
 MOV [$2E]+Y,A
 INC Y
 MOV A,[$2C]+Y
 MOV [$2E]+Y,A
 INC Y
 MOV A,[$2C]+Y
 MOV [$2E]+Y,A
 INC Y
 BNE song_copy_page
 INC $2D
 INC $2F
 DBNZ $35,song_copy_page
song_copy_tail:
 MOV A,$34
 BEQ song_copy_done
song_copy_byte:
 MOV A,[$2C]+Y
 MOV [$2E]+Y,A
 INC Y
 DBNZ $34,song_copy_byte
song_copy_done:
 CMP X,$F4
 BEQ song_copy_done
 MOV X,$F4
 BNE song_copy_next
 JMP !$11EA
song_copy_next:
 MOVW YA,$F6
 MOVW $2C,YA
 MOV $F4,X
song_copy_destination:
 CMP X,$F4
 BEQ song_copy_destination
 MOV X,$F4
 JMP !song_copy
songload_end:
