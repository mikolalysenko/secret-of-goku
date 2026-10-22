; Optional samples occupy the top of available sample RAM. Loads reserve the
; slab and retain it across compatible songs; bounded idle prefetch fills it.
; Music starts immediately with compact cues. No playing sound is streamed.
if !AUDIO_CUSTOM_SAMPLES

; A8/X16, preserve B (the sequence header's handshake token).
audio_extended_prepare:
	REP #$20
	PHA
	LDA.w #$0000 : STA.l !au_ext_upload : STA.l !au_ext_next
	LDA.l !au_ext_valid : CMP.w #$A8DB : BEQ +
	LDA.w #$0000 : STA.l !au_ext_start : STA.l $7E0000+!au_ext_state
+	LDA $F0 : AND.w #$00FF : BNE + : INC
+	XBA : ASL : ASL : ASL
	EOR.w #$FFFF : INC : CLC : ADC.w #$FA00
	STA.l !au_ext_ceiling : STA $F1
	LDA $05 : AND.w #$00FF : ASL : TAX
	LDA.l audio_extended_required,X : STA $17
	LDA.l !au_ext_start : BEQ .new
	CMP $17 : BCC .new : BEQ .new
	CLC : ADC.w #!AUDIO_EXT_RESERVE
	CMP.l !au_ext_ceiling : BCC .keep : BEQ .keep
.new
	LDA.l !au_ext_ceiling : SEC : SBC.w #!AUDIO_EXT_RESERVE
	CMP $17 : BCC .evict : BEQ .evict
	STA $19 : JSR audio_extended_cache_room
	BCS + : JMP .evict
+	LDA $19
	STA.l !au_ext_next : STA $F1
	STA.l $7E0000+!au_ext_cursor
	LDA.w #!AUDIO_EXT_BYTES : STA.l $7E0000+!au_ext_left
	LDA.w #audio_extended_bank&$FFFF : STA.l $7E0000+!au_ext_source
	SEP #$20
	LDA.l $7E0000+!au_ext_state : CMP.b #$03 : BNE +
	LDA.b #$01 : STA.l !au_ext_tables
+	LDA.b #bank(audio_extended_bank) : STA.l $7E0000+!au_ext_source+2
	LDA.b #$01 : STA.l $7E0000+!au_ext_state : STA.l !au_ext_upload
	BRA .done8
.keep
	LDA.l !au_ext_start : STA $19
	JSR audio_extended_cache_room : BCC .evict
	LDA $19 : STA.l !au_ext_next : STA $F1
	; A long prior sequence restored the compact effect table.
	LDA $F3 : AND.w #$00FF : BEQ .done
	LDA.l $7E0000+!au_ext_state : AND.w #$00FF : CMP.w #$0003 : BNE .done
	LDA.w #$0100 : STA.l !au_ext_upload
	BRA .done
.evict
	LDA.l $7E0000+!au_ext_state : AND.w #$00FF : CMP.w #$0003 : BNE +
	LDA.w #$0100 : STA.l !au_ext_upload
+	LDA.w #$0000 : STA.l $7E0000+!au_ext_state : STA.l $7E0000+!au_ext_left
.done
	SEP #$20
.done8
	REP #$20
	PLA
	SEP #$20
	RTS

; Cache retention has priority over optional audio. Admit a slab only when
; every still-valid cache extent plus all missing instruments fits below it.
; Never throw out a cached town/field instrument merely to install SFX.
; A16/X16, proposed slab in $19. C=room; scratch $1B/$1D, X/Y.
audio_extended_cache_room:
	LDA.w #!AUDIO_CUSTOM_FLOOR : STA $1B
	LDX.w #$0000
.cache
	LDA $28,X : BEQ .next
	LDA $48,X : CMP.w #!AUDIO_CUSTOM_FLOOR : BCC .next
	CLC : ADC $6A,X : CMP $F1 : BCS .next
	CMP $19 : BCS .no
	CMP $1B : BCC .next
	STA $1B
.next
	INX : INX : CPX.w #$0020 : BNE .cache
	LDA $05 : AND.w #$00FF : ASL : ASL : ASL : ASL : ASL : TAX
	LDY.w #$0010
.song
	LDA.l $C33F22,X : BEQ .yes
	STA $1D : PHX : PHY
	LDX.w #$0000
.find
	CMP $28,X : BNE .find_next
	LDA $48,X : CMP.w #!AUDIO_CUSTOM_FLOOR : BCC .missing
	CLC : ADC $6A,X : CMP $F1 : BCC .found
	BRA .missing
.find_next
	INX : INX : CPX.w #$0020 : BNE .find
.missing
	LDA $1D : ASL : TAX
	LDA.l audio_cache_lengths,X : CLC : ADC $1B : BCS .full
	STA $1B
	CMP $19 : BCS .full
.found
	PLY : PLX : INX : INX : DEY : BNE .song
.yes
	SEC : RTS
.full
	PLY : PLX
.no
	CLC : RTS

; D=$1E00, A8. Only pointer changes (at most 24 B), never sample uploads.
audio_extended_finish:
	LDA.l !au_ext_tables : BEQ .template
	REP #$20
	LDA.l !au_ext_next : STA $17
	LDX.w #$0000
	LDA.w #$055F : STA $19
	LDA.l $7E0000+!au_ext_state : AND.w #$00FF : CMP.w #$0003 : BEQ +
	STZ $19 : LDX.w #$0018
+	LDY.w #$0000
.block
	PHX : TYX
	LDA.l audio_extended_destinations,X : STA.w $2142
	PLX
	SEP #$20
	LDA.b #$02 : STA.w $2141
	LDA.b #$00 : JSR audio_songload_ack
	LDA.b #$01 : STA $10
	LDA.b #$04 : STA $1F
.word
	REP #$20
	LDA.l audio_extended_tables_data,X
	LSR $19 : BCC +
	CLC : ADC $17
+	STA.w $2142
	SEP #$20
	LDA $10 : JSR audio_songload_ack
	INC $10 : INX : INX
	DEC $1F : BNE .word
	REP #$20
	INY : INY : CPY.w #$0006 : BEQ .template
	; Song $32 borrows the effect table for its long sequence.
	LDA $F3 : AND.w #$00FF : BEQ .block
.template
	REP #$20
	LDA.l !au_ext_next : STA.l !au_ext_start
	LDA.w #$A8DB : STA.l !au_ext_valid
	LDA.l !au_ext_ceiling : STA $F1
	LDA.l $7E0000+!au_ext_state : AND.w #$00FF : BEQ .done
	CMP.w #$0003 : BCS .done
	; Native tuning/DIR staging is dead after this load. Reuse 72 bytes for
	; two atomic activation records; the next load regenerates this image.
	LDA.w #$000F : STA $17
	LDA.w #$5014 : STA $19
	LDX.w #$0000
.copy
	LDA.l audio_extended_activation,X
	LSR $19 : ROR $17 : BCC +
	CLC : ADC.l !au_ext_start
+	STA.l $7E1F00,X
	INX : INX : CPX.w #72 : BNE .copy
.done
	SEP #$20
	RTS

; au_wake $40: only the fill is due. A8/X16, DB=$7E, D=0. Never entered by
; held beds, queued cues or rare lines. One/two 36 B records, admitted
; before line 136/120 with room for the short probe AND the complete
; transfer. An outstanding echo (a native effect, the last cue) needs only
; a poll; while it is unacknowledged the fill waits, without the full path.
; Carry set: this frame is done. Clear: the ordinary selector (a request,
; held loop, song change or cue flag). Inactive/complete banks add nothing.
audio_extended_frame:
	LDA.w !au_lvl : ORA.w !au_lvl+1 : ORA.w !au_reqn : BNE .other
	LDA.w $1E05 : CMP.w !au_song : BNE .other
if defined("title_sfx")
	LDA.w !title_sfx&$FFFF : BNE .other
endif
if defined("out_sfx")
	LDA.w !out_sfx&$FFFF : CMP.w !au_dsfx : BNE .other
endif
	LDA.w !au_test : ORA.w !au_test+1 : BNE .other
	LDA.w !au_pending : BEQ .idle
	CMP.l $002140 : BNE .waiting
	LDA.b #0 : STA.l $002140 : STZ.w !au_pending
.idle
	JSR audio_extended_idle
	LDA.w !au_ext_state : BEQ .clear
	CMP.b #$03 : BCC .done
.clear
	STZ.w !au_wake
.done
	SEC : RTS
.waiting
	LDA.w !au_backoff : BEQ .done
	DEC.w !au_backoff
	BRA .done
.other
	CLC : RTS

audio_extended_idle:
	; The most frequent exits first: a countdown, held input, a late frame.
	LDA.w !au_backoff : BEQ +
	DEC.w !au_backoff : RTS
+
if defined("cb_in")
	REP #$20
	LDA.w !cb_in : ORA.w !cb_act : AND.w #$00FF
	; Include high input bits (B, arrows, etc.), not action facing.
	ORA.w !cb_in
	SEP #$20
	BEQ + : RTS
+
endif
	JSR au_lines_left
	CMP.b #40 : BCS + : RTS
+
if defined("cb_vblanks")
	REP #$20
	LDA.w !cb_vblanks : CMP.w !cb_vb_last
	SEP #$20
	BEQ + : RTS
+
endif
	LDA.w !au_flags : BIT.b #$40 : BEQ + : RTS
+	LDA.w $1E00 : BEQ + : RTS
+	REP #$20
	LDA.l !core_snd_head : CMP.l !core_snd_tail
	SEP #$20
	BNE .no
	LDA.w !au_ext_state : CMP.b #$02 : BNE .budget
	LDA.l $002143 : BMI .no ; no SFX voice may use a DIR entry being switched
	LDA.w $1EF3 : BNE .no
.budget
	JSR au_lines_left
	CMP.b #40 : BCC .no
	LDX.w #$0001
	CMP.b #56 : BCC +
	INX
+	CPX.w #$0002 : BEQ .two
	TAY
	LDA.w !au_ext_state : CMP.b #$02 : BEQ .no
	TYA
	SEC : SBC.b #32 : BRA .admit
.two
	SEC : SBC.b #52
.admit
	STA.w !au_tmp+$05
	STX.w !au_tmp+$18
	LDA.w !au_ext_state : CMP.b #$02 : BEQ .activate
	REP #$20
	LDA.w !au_ext_left : CMP.w #72
	SEP #$20
	BCS +
	LDX.w #$0001 : STX.w !au_tmp+$18
+	LDA.w !au_tmp+$18 : CMP.b #$02 : BEQ .count2
	LDA.b #13 : BRA .begin
.count2
	LDA.b #26
.begin
	XBA
	LDA.l $002140 : BNE .no     ; the SPC still shows another handshake
	XBA
	STA.l $002141
	LDA.b #$8A : STA.l $002140
	JSR audio_extended_probe : BCC .send
.no
	RTS
.activate
	; Hold activation for a frame with room for both metadata records.
	LDA.b #26 : BRA .begin
.send
	LDA.b #$20 : STA.w !au_cnt
	LDA.w !au_ext_state : CMP.b #$02 : BEQ .tables
.data
	REP #$20
	LDA.w !au_ext_cursor : STA.w !au_tmp+$11
	LDA.w !au_ext_source : STA.w !au_tmp+$1A
	SEP #$20
	LDA.w !au_ext_source+2 : STA.w !au_tmp+$1C
	JSR audio_extended_record : BCC + : RTS
+
	REP #$20
	LDA.w !au_ext_cursor : CLC : ADC.w #36 : STA.w !au_ext_cursor
	LDA.w !au_ext_source : CLC : ADC.w #36 : STA.w !au_ext_source
	LDA.w !au_ext_left : SEC : SBC.w #36 : STA.w !au_ext_left
	DEC.w !au_tmp+$18
	SEP #$20
	BNE .data
	REP #$20
	LDA.w !au_ext_left
	SEP #$20
	BNE .end
	LDA.b #$02 : STA.w !au_ext_state
	BRA .end
.tables
	REP #$20
	LDA.w #$19C8 : STA.w !au_tmp+$11
	LDA.w #$1F00 : STA.w !au_tmp+$1A
	SEP #$20
	LDA.b #$7E : STA.w !au_tmp+$1C
	JSR audio_extended_record : BCC + : RTS
+
	REP #$20
	LDA.w #$2FA8 : STA.w !au_tmp+$11
	LDA.w #$1F24 : STA.w !au_tmp+$1A
	SEP #$20
	JSR audio_extended_record : BCC + : RTS
+
	LDA.b #$03 : STA.w !au_ext_state
.end
	JSR au_end
	LDA.b #$00 : STA.l $002140
	JSR au_wait_a
	RTS

; Between ticks the driver's idle loop polls port 0 and echoes within
; 0.3-1.6 lines (measured in the field: 57% of attempts); a tick keeps it
; busy for up to about 45. Wait about 1.7 lines, then withdraw: port 0 = 0
; makes the SPC return from $8A at once (stream.s ext_cmd). A later quiet
; frame tries again. No retry backoff: a busy driver costs each attempt only
; this short probe, and the frames after it keep the cheap idle step.
; A8, A = $8A; carry set: withdrawn.
audio_extended_probe:
	LDY.w #32
-	CMP.l $002140
	BEQ .ok
	DEY
	BNE -
	LDA.b #$00
	STA.l $002140
	SEC
	RTS
.ok
	CLC
	RTS

; One $60 record from tmp+$1A..1C to tmp+$11..12. Same complete-packet
; acknowledgements as rare BRR chunks; no shared ring or voice is touched.
audio_extended_record:
	LDA.b #$60 : STA.w !au_tmp+$10
	JSR au_group : BCC +
	RTS
+	PHB
	LDA.w !au_tmp+$1C : PHA
	LDX.w !au_tmp+$1A
	LDA.w !au_cnt : STA.l $7E0000+!au_tmp+$16
	PLB
	LDY.w #12
.group
	LDA.w $0000,X : STA.l $002141 : INX
	LDA.w $0000,X : STA.l $002142 : INX
	LDA.w $0000,X : STA.l $002143 : INX
	LDA.l $7E0000+!au_tmp+$16 : STA.l $002140
	PHY
	LDY.w #$0000
-	CMP.l $002140 : BEQ +
	DEY : BNE -
	PLY : PLB
	LDA.w !au_flags : ORA.b #$40 : STA.w !au_flags
	SEC : RTS
+	PLY
	INC : CMP.b #$80 : BCC +
	LDA.b #$20
+	STA.l $7E0000+!au_tmp+$16
	DEY : BNE .group
	PLB
	STA.w !au_cnt
	CLC
	RTS
endif
