; Secret of Goku — SPC700 extension of Secret of Mana's sound driver.
; Streams BRR from the cartridge through the APU ports onto up to two DSP
; voices that the driver treats as sound-effect voices ($AE), alongside the
; native music and effects. Assembled by snes/gen/audio-spc700.mjs (Sony
; syntax); every segment below is uploaded at boot after the native driver
; (module.asm), including the small patches of driver code at the end.
;
; ARAM the native driver never touches (static scan of all driver code plus
; 277 gameplay snapshots; docs/agents/snes-port/audio.md):
;   $1598-$17FF, $FF89-$FFFF  code
;   $1898-$18BF  ADSR entries 12-31     → code
;   $1818-$183F  tuning entries 12-31   → slot flags and small tables
;   $1930-$1937  DIR entries 12, 13     → the two stream sources
;   $1938-$197F  DIR entries 14-31      → silence chunk, slot address tables
;   $FA00-$FBF7  14 chunk slots of 4 BRR blocks (36 bytes): 0-6 channel 0,
;                7-13 channel 1, each used as a ring
;   DP $E3-$EF and the gaps $85-$AB (never referenced by the driver); the
;   driver's startup clear of DP is cut short at $E3 so $E3-$EF keep their
;   uploaded values (voice = $FF: no voice)
;
; Chunks are 4 BRR blocks whose last block has END|LOOP. The voice plays a
; chunk and jumps to its DIR loop pointer, setting its ENDX bit at that
; moment; the ENDX handler then points DIR.loop at the next ready slot of
; the ring, or at the silence chunk if the CPU has not delivered it yet. A
; one-shot's final chunk holds a silent END block (no LOOP) that mutes and
; ends the voice. Stream voices sit in $AE, so music tracks leave them alone,
; and are masked out of the driver's two effect-track passes ($02E1, $0378),
; so no effect track drives them either.
;
; Port command $8A (driver dispatch table entry $14C6): p1 = number of
; 3-byte groups that follow, acknowledged by echoing the counter
; $20,$21,…,$7F,$20,… on port 0 (values the unextended driver ignores, so a
; missing extension costs only silence). One more group, acknowledged only after the
; records are processed, ends the command; the CPU then writes 0 and waits
; for port 0 = 0. A CPU that sees no echo of $8A in time writes 0 instead
; of the first group, which cancels the command. Records (first group; low bit of byte 0 = channel):
;   $1c slot flags + 12 data groups   chunk (flags bit0 = final)
;   $2c slot 0                        start at slot (KON with the next tick)
;   $3c volL volR                     volume
;   $4c pitchL pitchH                 pitch
;   $5c 0 0                           stop (KOF with the next tick, release)
;   $00 0 0                           end: no more records (the CPU ran out of
;                                     frame time); the end group follows
; Port 3 (output) holds the stream status at all times; the CPU never reads
; port 3 natively, so the driver's own copy of $AE there is dropped:
;   bits 0-2 chunks consumed on channel 0 (mod 8), bit 3 channel 0 active,
;   bits 4-6 the same for channel 1, bit 7 channel 1 active.

P0 = $F4
P1 = $F5
P2 = $F6
P3 = $F7
DSPA = $F2
DSPD = $F3
SFX_ACTIVE = $AE
CMDP1 = $B5
RECALC_EON = $07DA
RECALC_NON = $0803
RECALC_PMON = $084B
SFX_ID = $FF80
SRCN0 = 12
DIR_START = $1930
SLOTS = $FA00
CHUNK = 36

; ---- direct page (pairs: channel 0, channel 1)
vmask = $E3
chmask = $E4
status = $E6
events = $E7
counter = $E8
groups = $E9
dcount = $EA
tmp = $EB
voice = $EC
pend = $A4
stop = $A8
cur = $AA
tgt = $85
pos = $89
cons = $8C
voll = $91
volr = $95
pitl = $9D
pith = $A1

 org $1598

; ---------------------------------------------------------------- hooks
; Main loop, $0279: CALL $0CAF → CALL ext_poll (runs between timer ticks).
ext_poll:
 MOV A,vmask
 BEQ ep_out
 CALL poll_endx
ep_out:
 JMP $0CAF

; A = vmask. Handle the chunk transitions of active channels.
poll_endx:
 MOV DSPA,#$7C
 AND A,DSPD
 BEQ pe_ret
 MOV events,A
 MOV DSPD,#$00          ; clear ENDX (nothing else reads it)
 MOV X,#0
 CALL pe_one
 INC X
 CALL pe_one
 JMP publish
pe_one:
 MOV A,chmask+X
 AND A,events
 BNE endx_ch
pe_ret:
 RET

; ---------------------------------------------------------------- chunks
; X = channel. The voice has just entered the chunk DIR.loop pointed at.
endx_ch:
 MOV A,pend+X           ; ignore the old stream until a fresh KON, and a stop
 OR A,stop+X
 BNE dw_ret
 MOV A,cur+X
 BEQ ec_entered
 MOV A,cons+X           ; the chunk at pos finished playing
 INC A
 AND A,#7
 MOV cons+X,A
 MOV Y,pos+X
 MOV A,!sflags+Y
 MOV tmp,A
 MOV A,#0
 MOV !sflags+Y,A
 BBC tmp.1,ec_more
 JMP release_ch         ; final chunk: the stream is over
ec_more:
 CALL next_slot
 MOV pos+X,A
ec_entered:
 MOV A,tgt+X
 MOV cur+X,A
; X = channel: DIR.loop → the chunk after the current one, or silence.
compute_tgt:
 MOV A,pos+X
 MOV Y,cur+X
 BEQ ct_have
 CALL next_slot
ct_have:
 MOV Y,A
 MOV A,!sflags+Y
 AND A,#1
 MOV tgt+X,A
 BEQ set_silence
 CALL slot_addr
 BRA set_loop
set_silence:
 MOV $2C,#<silence
 MOV $2D,#>silence
set_loop:
 MOV A,#2
; X = channel, A = 0 (start) or 2 (loop): DIR[12+X] field = $2C/$2D.
dir_write:
 MOV tmp,A
 MOV A,X
 ASL A
 ASL A
 OR A,tmp
 MOV Y,A
 MOV A,$2C
 MOV !DIR_START+Y,A
 MOV A,$2D
 MOV !DIR_START+1+Y,A
dw_ret:
 RET

; Y = slot → $2C/$2D = its ARAM address.
slot_addr:
 MOV A,!slot_lo+Y
 MOV $2C,A
 MOV A,!slot_hi+Y
 MOV $2D,A
 RET


; End of every timer tick, $02F4: JMP $0279 → JMP ext_tick. The driver has
; written this tick's KON/KOF and voice registers.
ext_tick:
 MOV X,#0
 CALL tick_ch
 INC X
 CALL tick_ch
 CALL publish
 JMP $0279

tick_ch:
 MOV A,voice+X
 BMI tc_ret
 MOV Y,A
 MOV A,!bit_tab+Y
 AND A,SFX_ACTIVE
 BEQ reset_ch           ; the driver reclaimed the voice (song load, stop)
 MOV A,pend+X
 CMP A,#2
 BNE tc_stop
 MOV A,#0               ; keyed on this tick: the first chunk is playing
 MOV pend+X,A
 INC A
 MOV cur+X,A
 CALL compute_tgt
tc_stop:
 MOV A,stop+X
 BEQ write_vp
 CMP A,#1
 BNE release_ch
 INC A                  ; KOF went out this tick; release next tick
 MOV stop+X,A
; X = channel: VOL L/R and PITCH to the channel's voice.
write_vp:
 MOV A,voice+X
 BMI tc_ret
 XCN A
 MOV DSPA,A
 MOV A,voll+X
 MOV DSPD,A
 INC DSPA
 MOV A,volr+X
 MOV DSPD,A
 INC DSPA
 MOV A,pitl+X
 MOV DSPD,A
 INC DSPA
 MOV A,pith+X
 MOV DSPD,A
tc_ret:
 RET

; X = channel: hand the voice back to the driver.
release_ch:
 MOV A,voice+X
 BMI reset_ch
 MOV Y,A
 MOV A,#$FF
 MOV !SFX_ID+Y,A
 MOV A,!bit_tab+Y
 TCLR1 !$00AE
 PUSH X
 CALL RECALC_EON
 CALL RECALC_NON
 CALL RECALC_PMON
 POP X
; X = channel: forget the channel (no DSP writes).
reset_ch:
 MOV A,#$FF
 MOV voice+X,A
 MOV A,#0
 MOV chmask+X,A
 MOV pend+X,A
 MOV stop+X,A
 MOV cur+X,A
 MOV tgt+X,A
upd_vmask:
 MOV A,chmask
 OR A,chmask+1
 MOV vmask,A
 RET

; ---------------------------------------------------------------- voices
; X = channel. Z clear (A = 1) when the channel owns a voice.
take_voice:
 MOV A,voice+X
 BMI tv_alloc
 MOV Y,A
 MOV A,!bit_tab+Y
 AND A,SFX_ACTIVE
 BNE tv_ok
tv_alloc:
 MOV Y,#7
tv_find:
 MOV A,!bit_tab+Y
 AND A,SFX_ACTIVE
 BEQ tv_found
 DEC Y
 BPL tv_find
 MOV A,#0
 RET
tv_found:
 MOV voice+X,Y
 MOV A,#$FE
 MOV !SFX_ID+Y,A
 MOV A,!bit_tab+Y
 MOV chmask+X,A
 TSET1 !$00AE
 EOR A,#$FF
 MOV tmp,A
 PUSH X
 MOV Y,#10              ; drop the voice from the driver's per-voice masks
tv_clr:
 MOV A,!mask_regs+Y
 MOV X,A
 MOV A,tmp
 AND A,(X)
 MOV (X),A
 DEC Y
 BPL tv_clr
 POP X
 CALL upd_vmask
tv_ok:
 MOV A,#1
 RET

; ---------------------------------------------------------------- command
; Port command $8A, entered from the driver's dispatcher (port 0 out was
; cleared); $B5 = group count. Port 0 in is the first group's counter, or 0
; when the CPU gave up waiting for the echo (it withdraws the command by
; writing 0): then nothing follows.
ext_cmd:
 MOV A,P0
 BNE ec_go
 RET
ec_go:
 MOV groups,CMDP1
 MOV counter,#$20
cmd_next:
 MOV A,groups
 BNE cn_rec
cn_end:
 JMP cmd_end
cn_rec:
 CALL recv
 MOV A,$34
 BEQ cn_end             ; record 0: the CPU ends the command early
 AND A,#$01
 MOV X,A
 MOV A,$34
 AND A,#$F0
 CMP A,#$10
 BNE cr_start
 JMP rec_data
cr_start:
 CMP A,#$20
 BNE cr_vol
 JMP rec_start
cr_vol:
 CMP A,#$30
 BNE cr_pitch
 MOV A,$35
 MOV voll+X,A
 MOV A,$36
 MOV volr+X,A
 BRA cr_vp
cr_pitch:
 CMP A,#$40
 BNE cr_stop
 MOV A,$35
 MOV pitl+X,A
 MOV A,$36
 MOV pith+X,A
cr_vp:
 CALL write_vp
 BRA cmd_next
cr_stop:
 CMP A,#$50
 BNE cmd_next
 MOV A,voice+X
 BMI cmd_next
 MOV A,chmask+X
 TSET1 !$00B0           ; KOF with the next tick
 TCLR1 !$00AF
 MOV A,#1
 MOV stop+X,A
 DEC A
 MOV pend+X,A
 CALL set_silence
 BRA cmd_next

; One group → $34/$35/$36.
recv:
 MOV Y,counter
rv_wait:
 CMP Y,P0
 BNE rv_wait
 MOV A,P1
 MOV $34,A
 MOV A,P2
 MOV $35,A
 MOV A,P3
 MOV $36,A
 MOV P0,Y
 INC Y
 CMP Y,#$80
 BNE rv_ok
 MOV Y,#$20
rv_ok:
 MOV counter,Y
 DEC groups
 RET

; DATA: $35 = slot, $36 = flags; 12 groups follow straight into the slot.
rec_data:
 MOV Y,$35
 CALL slot_addr
 MOV dcount,#12
 MOV X,counter
 MOV Y,#0
rd_wait:
 CMP X,P0
 BNE rd_wait
 MOV A,P1
 MOV [$2C]+Y,A
 INC Y
 MOV A,P2
 MOV [$2C]+Y,A
 INC Y
 MOV A,P3
 MOV P0,X
 MOV [$2C]+Y,A
 INC Y
 INC X
 CMP X,#$80
 BNE rd_cnt
 MOV X,#$20
rd_cnt:
 DBNZ dcount,rd_wait
 MOV counter,X
 MOV A,groups
 SETC
 SBC A,#12
 MOV groups,A
 MOV Y,$35              ; slot ready (and final)
 MOV A,$36
 AND A,#1
 ASL A
 OR A,#1
 MOV !sflags+Y,A
 MOV A,vmask            ; stay responsive to chunk transitions
 BEQ rd_next
 CALL poll_endx
rd_next:
 JMP cmd_next

rec_start:
 CALL take_voice
 BNE rs_ok
 JMP cmd_next           ; no free voice: the CPU sees the channel inactive
rs_ok:
 MOV A,$35
 MOV pos+X,A
 MOV A,#0
 MOV stop+X,A
 MOV cur+X,A
 MOV tgt+X,A
 MOV cons+X,A
 MOV A,X                ; forget the channel's previous chunks
 MOV Y,#7
 MUL YA
 MOV Y,A
 MOV dcount,#7
rs_clr:
 MOV A,#0
 MOV !sflags+Y,A
 INC Y
 DBNZ dcount,rs_clr
 MOV A,chmask+X
 TCLR1 !$00B0           ; cancel a pending KOF
 MOV A,#1
 MOV pend+X,A
 CALL set_silence       ; an old stream runs out into silence
 JMP cmd_next
code_a_end:

; ---------------------------------------------------------------- overflow
 org $FF89

; After the records: key on what is ready, publish, then acknowledge the
; final group so the CPU cannot race the next command into this handler.
cmd_end:
 MOV X,#0
 CALL kon_ch
 INC X
 CALL kon_ch
 CALL publish
 MOV Y,counter
ce_group:
 CMP Y,P0
 BNE ce_group
 MOV A,Y
 OR A,#$80              ; counter|$80: "extension here, records done"
 MOV P0,A
ce_wait:
 MOV A,P0
 BNE ce_wait
 MOV P0,#$00
 RET

; X = channel: start pending and its first chunk delivered → set up the
; voice; the driver keys it on with its next tick's KON write.
kon_ch:
 MOV A,pend+X
 CMP A,#1
 BNE kc_ret
 MOV Y,pos+X
 MOV A,!sflags+Y
 AND A,#1
 BEQ kc_ret             ; no data yet: stay pending
 CALL slot_addr
 MOV A,#0
 CALL dir_write         ; DIR.start = first chunk
 MOV A,voice+X
 XCN A
 OR A,#$04              ; SRCN
 MOV DSPA,A
 MOV A,X
 CLRC
 ADC A,#SRCN0
 MOV DSPD,A
 INC DSPA               ; ADSR1: attack 15
 MOV DSPD,#$8F
 INC DSPA               ; ADSR2: sustain level 7, no decay
 MOV DSPD,#$E0
 CALL write_vp
 MOV A,chmask+X
 TCLR1 !$00B0
 TSET1 !$00AF
 MOV A,#2
 MOV pend+X,A
kc_ret:
 RET

; Effect-track passes, $02E1 and $0378: MOV A,$AE / MOV $02,A → CALL sfxmask.
sfxmask:
 MOV A,vmask
 EOR A,#$FF
 AND A,SFX_ACTIVE
 MOV $02,A
 RET

; X = channel: A = the slot after pos (rings of 7 starting at 7*X).
next_slot:
 MOV A,pos+X
 INC A
 CMP A,!ring_end+X
 BNE ns_ret
 MOV A,!ring_base+X
ns_ret:
 RET
code_b_end:

; ADSR entries 12-31
 org $1898
publish:
 MOV A,cons+1
 XCN A
 OR A,cons
 MOV status,A
 MOV A,voice
 BMI pb_1
 MOV A,stop
 BNE pb_1
 OR status,#$08
pb_1:
 MOV A,voice+1
 BMI pb_out
 MOV A,stop+1
 BNE pb_out
 OR status,#$80
pb_out:
 MOV P3,status
 RET
code_c_end:

; ---------------------------------------------------------------- data
 org $1818
sflags:     db 0,0,0,0,0,0,0,0,0,0,0,0,0,0   ; bit0 ready, bit1 final
ring_base:  db 0,7
ring_end:   db 7,14
mask_regs:  db $AF,$B0,$C9,$CA,$B8,$B9,$BA,$BD,$BF,$C1,$C3
bit_tab:    db $01,$02,$04,$08,$10,$20,$40,$80
data_a_end:

 org $1930
dir_src:    dw silence,silence,silence,silence   ; sources 12 and 13
silence:    db $00,0,0,0,0,0,0,0,0
            db $00,0,0,0,0,0,0,0,0
            db $00,0,0,0,0,0,0,0,0
            db $03,0,0,0,0,0,0,0,0
slot_lo:    db <(SLOTS+0*CHUNK),<(SLOTS+1*CHUNK),<(SLOTS+2*CHUNK),<(SLOTS+3*CHUNK),<(SLOTS+4*CHUNK),<(SLOTS+5*CHUNK),<(SLOTS+6*CHUNK)
            db <(SLOTS+7*CHUNK),<(SLOTS+8*CHUNK),<(SLOTS+9*CHUNK),<(SLOTS+10*CHUNK),<(SLOTS+11*CHUNK),<(SLOTS+12*CHUNK),<(SLOTS+13*CHUNK)
slot_hi:    db >(SLOTS+0*CHUNK),>(SLOTS+1*CHUNK),>(SLOTS+2*CHUNK),>(SLOTS+3*CHUNK),>(SLOTS+4*CHUNK),>(SLOTS+5*CHUNK),>(SLOTS+6*CHUNK)
            db >(SLOTS+7*CHUNK),>(SLOTS+8*CHUNK),>(SLOTS+9*CHUNK),>(SLOTS+10*CHUNK),>(SLOTS+11*CHUNK),>(SLOTS+12*CHUNK),>(SLOTS+13*CHUNK)
data_b_end:

 org $00E3              ; DP $E3-$EF initial values
 db 0,0,0,0,0,0,0,0,0,$FF,$FF,0,0

; ---------------------------------------------------------------- driver patches
; (the generator asserts the original bytes first)
 org $020A              ; startup DP clear: CMP X,#$F0 → CMP X,#$E3
 db $E3
 org $0279              ; CALL $0CAF
 CALL ext_poll
 org $0299              ; MOVW $F6,YA → MOV $F6,A (port 3 is ours)
 MOV P2,A
 org $02E1              ; MOV A,$AE / MOV $02,A
 CALL sfxmask
 NOP
 org $02F4              ; JMP $0279
 JMP ext_tick
 org $0378              ; MOV A,$AE / MOV $02,A
 CALL sfxmask
 NOP
 org $14C6              ; port command $8A
 dw ext_cmd
