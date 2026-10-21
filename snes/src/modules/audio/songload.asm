; Main-thread-only acceleration of the native song loader. D=$1E00, DB=0,
; A8/X16 on entry. The native cache, echo policy and instrument tables stay
; in charge. No frame hook, DMA, new WRAM, or persistent ARAM allocation.

audio_songload_install:
	; The previous song has been keyed off and echo writes disabled. Borrow
	; the BRR ring until this synchronous load finishes, including imports
	; with only the retail driver (all installation uses its FE mode 2).
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
	LDX.w #$0000
	JSR audio_songload_vectors
	LDA.b #$04 : STA.w $2141
	LDX.w #$1A00 : STX.w $2142
	LDA.b #$00 : XBA
	JML $C30215

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
	LDA.b #$01 : STA $10
	JSR audio_songload_send
	JML $C3028D

audio_songload_instrument:
	SEP #$20
	JSR audio_songload_send
	JML $C304BC

; X=byte length, Y=source offset in [$14] (low word zero). Native samples
; are multiples of 9. Sequences round up to a triple, inside the sequence
; buffer (the retail mode-2 loop also sends padding). Port 1/2 data is
; preloaded into Y and port 3 into B while the SPC handles the prior packet.
; Only the three port stores and the commit token follow its acknowledgement.
audio_songload_send:
	REP #$20
	TYA : STA $14
	SEP #$20
	LDA.w $2140 : STA $11
.packet
	REP #$20
	LDA [$14]
	TAY
	; Handle source bank crossings, including a word starting at $FFFF.
	LDA $14
	CLC : ADC.w #$0002
	STA $14
	BCC +
	SEP #$20
	INC $16
	REP #$20
+	SEP #$20
	LDA [$14]
	XBA
	LDA $11
.wait
	CMP.w $2140
	BNE .wait
	STY.w $2141
	XBA
	STA.w $2143
	XBA
	LDA $10
	STA.w $2140
	STA $11
	INC $10
	BNE +
	INC $10
+	REP #$20
	INC $14
	BNE +
	SEP #$20
	INC $16
	REP #$20
+	TXA
	SEC : SBC.w #$0003
	TAX
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
	PHD
	REP #$20
	LDA.w #$1E00 : TCD
	SEP #$20
	LDX.w #$0008
	JSR audio_songload_vectors
	PLD
	SEP #$20
	LDA.b #$00
	JML $C30596

pushpc
org !DATA_AUDIO+$7000
audio_songload_image:
	incbin "audio/songload.bin"
audio_songload_vectors_data:
	dw !AUDIO_SONGLOAD_RECEIVE,$1263,$1263,!AUDIO_SONGLOAD_COPY
	dw $1263,$1263,$1263,$1270
assert pc() <= !DATA_AUDIO+$8000, "audio song loader data overflow"
pullpc

%orig4($C3020F, $8E1A00A2)
%orig2($C30213, $2142)
%hijack($C3020F, audio_songload_install, 6, audio)
%orig4($C30264, $B7EB80A9)
%orig1($C30268, $14)
%hijack($C30264, audio_songload_sequence, 5, audio)
%orig4($C30487, $14B720E2)
%hijack($C30487, audio_songload_instrument, 4, audio)
%orig1($C30403, $03)
%patch($C30403, 1, audio)
pushpc
org $C30403
	db $04
pullpc
%orig4($C30592, $00A920E2)
%hijack($C30592, audio_songload_finish, 4, audio)
