; Shipping-only extension of $8A: record $60 addrLo addrHi + 36 bytes.
; Fills an inactive resident bank, never a voice's playback buffer.
; The ordinary stream records and their acknowledgements are unchanged.
 org BANK_CODE
bank_record:
 CMP A,#$60
 BNE bank_native
 MOVW YA,$35
 MOVW $2C,YA
 MOV $36,#$80
 JMP rec_data+5
bank_native:
 CMP A,#$50
 BNE bank_next
 JMP cr_stop+4
bank_done:
 MOV A,$36
 BMI bank_next
 MOV Y,$35
 JMP rd_ready+4
bank_next:
 JMP cmd_next
bank_status:
 MOV A,$AE
 BEQ bank_idle
 OR $E6,#$80
bank_idle:
 MOV $F7,$E6
 RET

 org cr_stop
 JMP bank_record
 NOP
 org rd_ready
 JMP bank_done
 NOP
 org pb_out
 JMP bank_status
 NOP
