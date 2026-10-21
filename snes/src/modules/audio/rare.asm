; Shipping hybrid: the resident selector owns every effect. Only these
; rare voice requests reach the existing BRR protocol, on channel 0.
; Channel 1 stays idle; its last fields hold the resident handshake state.
audio_rare_service:
if not(defined("AUDIO_PCM"))
	LDA.w !au_flags
	BIT.b #$08                ; a song load already keyed the stream off
	BEQ +
	AND.b #$F7
	STA.w !au_flags
	STZ.w !au_ch+!c_kind
	STZ.w !au_ch+!c_ctl
+	BIT.b #$40                ; a retail imported driver has no extension
	BEQ +
	STZ.w !au_rare
	STZ.w !au_ch+!c_kind
	STZ.w !au_ch+!c_ctl
	RTS
+	LDA.w !au_rare
	BEQ .active
	DEC.w !au_rare_age
	BNE .active
	STZ.w !au_rare
.active
	LDA.w !au_ch+!c_kind
	ORA.w !au_ch+!c_ctl
	ORA.w !au_rare
	BEQ .done
	; Never overwrite an asynchronous resident command's parameters,
	; including when a newly busy scene needs to stop the stream.
	LDA.w !au_pending
	ORA.l $002140
	BNE .done
if defined("vg_clash_on")
	; Clashes already miss frames, and can reach us after wrapping through
	; vblank. A low scanline there is not evidence of a cheap gameplay tick.
	LDA.w !vg_clash_on&$FFFF
	BNE .busy_game
endif
if defined("cb_charging")
	LDA.w !cb_charging&$FFFF
	BNE .busy_game
endif
	LDA.l $002143
	STA.w !au_status
	LDX.w #$0000
	JSR au_channel_status
	LDA.w !au_rare
	BEQ .plan
	; Start only when one chunk plus control records fit. A busy fight
	; may defer or drop a line rather than spending a gameplay frame.
	JSR au_lines_left
	CMP.b #!AU_CHUNK_LINES+!AU_CMD_LINES
	BCC .plan
	LDA.w !au_rare
	STZ.w !au_rare
	LDX.w #$0000
	JSR au_start_shot
.plan
	JSR au_plan
	JSR au_budget
	JMP au_send
.done
	RTS
.busy_game
	; Drop a previously deferred request too. Cut a playing line once;
	; never keep feeding it through the charge/clash's expensive frames.
	STZ.w !au_rare
	LDA.w !au_ch+!c_kind
	BEQ .stop
	LDX.w #$0000
	JSR au_stop_channel
.stop
	JSR au_plan
	JMP au_send
endif
	RTS
