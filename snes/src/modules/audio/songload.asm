; Main-thread-only acceleration of the native song loader. D=$1E00, DB=0,
; A8/X16 on entry. The native cache, echo policy and instrument tables stay
; in charge. No frame hook, DMA, new WRAM, or persistent ARAM allocation.
!au_load_fast #= $7E0000+!au_tmp+$16 ; song-load-only scratch, never a frame flag

audio_songload_install:
	JSR audio_songload_choose
	LDA.l !au_load_fast
	BNE .fast
	LDX.w #$1A00 : STX.w $2142
	JML $C30215
.fast
	; The previous song has been keyed off and echo writes disabled. Borrow
	; the BRR ring until this synchronous load finishes. The boot-patched
	; mode 3 has complete-packet acknowledgements. Unextended diagnostic
	; imports keep the conservative retail mode-2 bootstrap.
	LDA.l $7E0000+!au_flags
	BIT.b #$40
	BEQ .triples
	LDA.b #$02 : STA.w $2141
	LDX.w #$FA00 : STX.w $2142
	XBA
	JSR audio_songload_ack
	LDA.b #$80 : STA $10
	LDX.w #$0000
.upload
	REP #$20
	LDA.l audio_songload_image,X
	STA.w $2142
	SEP #$20
	LDA $10
	JSR audio_songload_ack
	INC $10
	BNE +
	INC $10
+	INX : INX
	CPX.w #!AUDIO_SONGLOAD_SIZE
	BNE .upload
	BRA .vectors
.triples
	LDA.b #$03 : STA.w $2141
	LDX.w #$FA00 : STX.w $2142
	XBA
	JSR audio_songload_ack
	STZ $14 : STZ $15
	LDA.b #bank(audio_songload_image) : STA $16
	LDY.w #audio_songload_image&$FFFF
	LDX.w #!AUDIO_SONGLOAD_SIZE
	LDA.b #$01 : STA $10
	JSR audio_songload_send
.vectors
	LDX.w #$0000
	JSR audio_songload_vectors
	LDA.b #$04 : STA.w $2141
	LDX.w #$1A00 : STX.w $2142
	LDA.b #$00 : XBA
	JML $C30215

; Installing the temporary receiver costs more than it saves for small,
; mostly cached native cues. Count sequence + missing sample bytes before
; choosing it; small loads use the native path (with faster FE mode 2).
; New scores always use the fast path. Preserve B: it holds FE's next token.
audio_songload_choose:
	REP #$20
	PHA
	LDA.w #$0000 : STA.l !au_load_fast
	; An unextended imported driver has retail early acknowledgements.
	; Its conservative bootstrap is followed exclusively by our mode 4.
	LDA.l $7E0000+!au_flags
	BIT.w #$0040
	BEQ .song
	JMP .fast
.song
	LDA $05 : AND.w #$00FF
	CMP.w #$003B
	BCS .fast
	STA $17
	ASL : CLC : ADC $17 : TAX
	LDA.l $C33D39,X : STA $14
	SEP #$20
	LDA.l $C33D3B,X : STA $16
	REP #$20
	LDA [$14] : STA $18
	CMP.w #$1000
	BCS .fast
	LDA $05 : AND.w #$00FF
	ASL : ASL : ASL : ASL : ASL
	TAX
	CLC : ADC.w #$0020 : STA $1A
.instrument
	LDA.l $C33F22,X
	BEQ .done
	LDY.w #$0000
.cache
	CMP.w $1E28,Y
	BEQ .next
	INY : INY
	CPY.w #$0020
	BNE .cache
	PHX
	DEC : STA $17
	ASL : CLC : ADC $17 : TAX
	LDA.l $C33DF9,X : STA $14
	SEP #$20
	LDA.l $C33DFB,X : STA $16
	REP #$20
	LDA [$14] : CLC : ADC $18 : STA $18
	PLX
	BCS .fast
	CMP.w #$1000
	BCS .fast
.next
	INX : INX
	CPX $1A
	BNE .instrument
	BRA .done
.fast
	LDA.w #$0001 : STA.l !au_load_fast
.done
	PLA
	SEP #$20
	RTS

; X=0 installs temporary mode 4/7 vectors; X=8 restores both native ones.
audio_songload_vectors:
	LDA.b #$02 : STA.w $2141
	LDY.w #$1420 : STY.w $2142
	LDA.b #$00
	JSR audio_songload_ack
	LDY.w #$0004
	LDA.b #$01 : STA $10
.word
	REP #$20
	LDA.l audio_songload_vectors_data,X
	STA.w $2142
	SEP #$20
	LDA $10
	JSR audio_songload_ack
	INC $10
	INX : INX
	DEY
	BNE .word
	RTS

audio_songload_ack:
	STA.w $2140
.wait
	CMP.w $2140
	BNE .wait
	RTS

audio_songload_sequence:
	LDA.l !au_load_fast
	BNE .fast
	JSR audio_songload_words
	JML $C3028D
.fast
	LDA.b #$01 : STA $10
	JSR audio_songload_send
	JML $C3028D

audio_songload_instrument:
	SEP #$20
	JSR audio_songload_send
	JML $C304BC

audio_songload_sample_mode:
	SEP #$20
	LDA.l !au_load_fast
	BEQ .native
	LDA.b #$04
	JML $C30404
.native
	LDA.b #$03
	JML $C30404

; Small sequences stay in FE mode 2 and avoid the temporary-program upload.
; Keep the retail floor(length/2)+1 padding convention and bank crossings.
audio_songload_words:
	STX $12
	LDA.b #$80 : STA $10
	LDA.w $2140 : STA $11
.word
	REP #$20
	LDA [$14],Y
	TAX
	SEP #$20
	INY
	BNE +
	INC $16
+	INY
	BNE +
	INC $16
+	LDA $11
.wait
	CMP.w $2140
	BNE .wait
	STX.w $2142
	LDA $10
	STA.w $2140
	STA $11
	INC $10
	BNE +
	INC $10
+	REP #$20
	LDA $12
	SEC : SBC.w #$0002
	STA $12
	SEP #$20
	BPL .word
	LDA $11
.last
	CMP.w $2140
	BNE .last
	RTS

; Preload X=ports 1/2 and B=port 3 while the SPC stores the last packet.
; Y remains the ROM offset. The exact counter echo commits all three bytes.
macro audio_songload_packet()
	REP #$20
	LDA [$14],Y
	TAX
	SEP #$20
	INY
	BNE ?nowrap1
	INC $16
?nowrap1:
	INY
	BNE ?nowrap2
	INC $16
?nowrap2:
	LDA [$14],Y
	XBA
	LDA $11
?wait:
	CMP.w $2140
	BNE ?wait
	STX.w $2141
	XBA
	STA.w $2143
	XBA
	LDA $10
	STA.w $2140
	STA $11
	INC $10
	BNE ?counter
	INC $10
?counter:
	INY
	BNE ?nowrap3
	INC $16
?nowrap3:
endmacro

; X=byte length, Y=source offset in [$14] (low word zero). Native samples
; are multiples of 9. Only the last sequence triple can contain padding
; (the retail mode-2 loop also sends padding). Four triples share the byte
; count/loop maintenance; a short tail handles every residue exactly.
audio_songload_send:
	STX $12
	LDA.w $2140 : STA $11
	REP #$20
	LDA $12
	CMP.w #$000C
	BCS .bulk
	JMP .tail
.bulk
	%audio_songload_packet()
	%audio_songload_packet()
	%audio_songload_packet()
	%audio_songload_packet()
	REP #$20
	LDA $12
	SEC : SBC.w #$000C
	STA $12
	CMP.w #$000C
	BCC .tail
	JMP .bulk
.tail
	SEP #$20
	LDA $12
	BEQ .done
.packet
	%audio_songload_packet()
	REP #$20
	LDA $12
	SEC : SBC.w #$0003
	STA $12
	SEP #$20
	BEQ .done
	BPL .packet
.done
	LDA $11
.last
	CMP.w $2140
	BNE .last
	RTS

audio_songload_finish:
	SEP #$20
	LDA.l !au_load_fast
	BEQ .native
	PHD
	REP #$20
	LDA.w #$1E00 : TCD
	SEP #$20
	LDX.w #$0008
	JSR audio_songload_vectors
	PLD
.native
	SEP #$20
	LDA.b #$00
	JML $C30596

%orig4($C3020F, $8E1A00A2)
%orig2($C30213, $2142)
%hijack($C3020F, audio_songload_install, 6, audio)
%orig4($C30264, $B7EB80A9)
%orig1($C30268, $14)
%hijack($C30264, audio_songload_sequence, 5, audio)
%orig4($C30487, $14B720E2)
%hijack($C30487, audio_songload_instrument, 4, audio)
%orig4($C30400, $03A920E2)
%hijack($C30400, audio_songload_sample_mode, 4, audio)
%orig4($C30592, $00A920E2)
%hijack($C30592, audio_songload_finish, 4, audio)
