; Temporary song-loader workspace in the stream ring. The CPU installs this
; after song command 01 has keyed off every voice, and restores FE's vectors
; before returning. Nothing here is resident while music/streams play.
; FE mode 4: three bytes per nonzero counter; zero returns to FE's header.
; Every acknowledgement follows ALL three port reads (independent clocks).

; Four triples per loop, with fixed offsets in a 252-byte window.
; Pointer maintenance is outside the packet handshake.
 org $FA00
song_receive:
 CALL song_rebase
song_packet0:
 MOV A,$F5
song_store0:
 MOV !$0000+Y,A
 MOV A,$F6
song_store1:
 MOV !$0000+Y,A
 MOV A,$F7
song_store2:
 MOV !$0000+Y,A
 MOV $F4,X
song_wait0:
 CMP X,$F4
 BEQ song_wait0
 MOV X,$F4
 BNE song_packet1
 JMP !$11EA
song_packet1:
 MOV A,$F5
song_store3:
 MOV !$0000+Y,A
 MOV A,$F6
song_store4:
 MOV !$0000+Y,A
 MOV A,$F7
song_store5:
 MOV !$0000+Y,A
 MOV $F4,X
song_wait1:
 CMP X,$F4
 BEQ song_wait1
 MOV X,$F4
 BNE song_packet2
 JMP !$11EA
song_packet2:
 MOV A,$F5
song_store6:
 MOV !$0000+Y,A
 MOV A,$F6
song_store7:
 MOV !$0000+Y,A
 MOV A,$F7
song_store8:
 MOV !$0000+Y,A
 MOV $F4,X
song_wait2:
 CMP X,$F4
 BEQ song_wait2
 MOV X,$F4
 BNE song_packet3
 JMP !$11EA
song_packet3:
 MOV A,$F5
song_store9:
 MOV !$0000+Y,A
 MOV A,$F6
song_store10:
 MOV !$0000+Y,A
 MOV A,$F7
song_store11:
 MOV !$0000+Y,A
 MOV $F4,X
 MOV A,Y
 CLRC
 ADC A,#$0C
 MOV Y,A
 CMP Y,#$FC
 BNE song_wait3
 MOV A,#$F0
 MOV Y,#$00
 ADDW YA,$2C
 MOVW $2C,YA
 CALL song_rebase
song_wait3:
 CMP X,$F4
 BEQ song_wait3
 MOV X,$F4
 BEQ song_receive_end
 JMP !song_packet0
song_receive_end:
 JMP !$11EA
song_rebase:
 MOVW YA,$2C
 MOV !song_store0+1,A
 MOV !song_store0+2,Y
 INCW $2C
 MOVW YA,$2C
 MOV !song_store1+1,A
 MOV !song_store1+2,Y
 INCW $2C
 MOVW YA,$2C
 MOV !song_store2+1,A
 MOV !song_store2+2,Y
 INCW $2C
 MOVW YA,$2C
 MOV !song_store3+1,A
 MOV !song_store3+2,Y
 INCW $2C
 MOVW YA,$2C
 MOV !song_store4+1,A
 MOV !song_store4+2,Y
 INCW $2C
 MOVW YA,$2C
 MOV !song_store5+1,A
 MOV !song_store5+2,Y
 INCW $2C
 MOVW YA,$2C
 MOV !song_store6+1,A
 MOV !song_store6+2,Y
 INCW $2C
 MOVW YA,$2C
 MOV !song_store7+1,A
 MOV !song_store7+2,Y
 INCW $2C
 MOVW YA,$2C
 MOV !song_store8+1,A
 MOV !song_store8+2,Y
 INCW $2C
 MOVW YA,$2C
 MOV !song_store9+1,A
 MOV !song_store9+2,Y
 INCW $2C
 MOVW YA,$2C
 MOV !song_store10+1,A
 MOV !song_store10+2,Y
 INCW $2C
 MOVW YA,$2C
 MOV !song_store11+1,A
 MOV !song_store11+2,Y
 INCW $2C
 MOV Y,#$00
 RET

; FE mode 7, unchanged source/destination/length handshake. Full pages use
; an unrolled absolute copy, with pointer/count maintenance once per page.
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
 MOVW YA,$2C
 MOV !song_copy_read0+1,A
 MOV !song_copy_read0+2,Y
 MOV !song_copy_read1+1,A
 MOV !song_copy_read1+2,Y
 MOV !song_copy_read2+1,A
 MOV !song_copy_read2+2,Y
 MOV !song_copy_read3+1,A
 MOV !song_copy_read3+2,Y
 MOVW YA,$2E
 MOV !song_copy_write0+1,A
 MOV !song_copy_write0+2,Y
 MOV !song_copy_write1+1,A
 MOV !song_copy_write1+2,Y
 MOV !song_copy_write2+1,A
 MOV !song_copy_write2+2,Y
 MOV !song_copy_write3+1,A
 MOV !song_copy_write3+2,Y
 MOV Y,#$00
song_copy_page:
song_copy_read0:
 MOV A,!$0000+Y
song_copy_write0:
 MOV !$0000+Y,A
 INC Y
song_copy_read1:
 MOV A,!$0000+Y
song_copy_write1:
 MOV !$0000+Y,A
 INC Y
song_copy_read2:
 MOV A,!$0000+Y
song_copy_write2:
 MOV !$0000+Y,A
 INC Y
song_copy_read3:
 MOV A,!$0000+Y
song_copy_write3:
 MOV !$0000+Y,A
 INC Y
 BNE song_copy_page
 INC !song_copy_read0+2
 INC !song_copy_write0+2
 INC !song_copy_read1+2
 INC !song_copy_write1+2
 INC !song_copy_read2+2
 INC !song_copy_write2+2
 INC !song_copy_read3+2
 INC !song_copy_write3+2
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
