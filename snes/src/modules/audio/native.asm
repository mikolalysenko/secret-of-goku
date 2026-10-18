; Resident SPC effects for gameplay. One priority-selected command per
; frame, with no BRR transfer, chant stream or continuous air stream.
; The native driver already holds these samples. IDs 03/50/2A/B0/12 are
; the browser's native-sound.js fallback (swing/hit/charge/beam/transform).
; -DAUDIO_PCM=1 retains the old streamer for comparison and audio research.

audio_native_ids:
	db $00,$03,$03,$50,$50,$03,$50,$50
	db $B0,$2A,$12,$12,$12,$50,$50,$50
	db $03,$03,$03,$50,$03,$03,$03,$B0
	db $50,$50,$03,$B0,$00,$00,$00,$2A,$B0
audio_native_priority:
	db 0,1,1,5,5,3,5,2,7,4,8,8,8,5,5,5
	db 6,6,2,2,3,3,3,7,5,7,3,7,0,0,0,4,7

; M8/X16, DB=$7E. Requests expire in this frame; a busy sound queue never
; accumulates a delayed burst of punches after the player stopped attacking.
audio_native_service:
	INC.w !au_frame
	LDA.w !au_flags
	AND.b #$01
	BEQ .run
	STZ.w !au_reqn
	STZ.w !au_voicereq
	STZ.w !au_lvl
	STZ.w !au_lvl+1
	STZ.w !au_lvl+2
	STZ.w !au_lvl+3
.run
	LDA.b #$80
	STA.w !au_flags
	STZ.w !au_tmp              ; chosen cue
	STZ.w !au_tmp+1            ; priority
	LDY.w #$0000
.shots
	TYA
	CMP.w !au_reqn
	BCS .bed
	LDA.w !au_req,Y
	JSR .choose
	INY
	BRA .shots
.bed
	STZ.w !au_reqn
	; Charge/focus beds become sparse native pulses. AIR is represented by
	; its takeoff and landing cues; restarting a wind sample every frame
	; would steal music voices and spend CPU on needless handshakes.
	LDX.w #$0000
.age
	LDA.w !au_age,X
	CMP.b #$02
	BCC +
	STZ.w !au_lvl,X
	BRA ++
+	INC.w !au_age,X
++	INX
	CPX.w #$0004
	BNE .age
	LDA.w !au_lvl
	ORA.w !au_lvl+1
	ORA.w !au_lvl+3
	BEQ .quiet
	LDA.w !au_bed
	BEQ .pulse
	LDA.w !au_bed_wait
	BEQ .pulse
	DEC.w !au_bed_wait
	BRA .voice
.pulse
	LDA.b #$01
	STA.w !au_bed
	LDA.b #24
	STA.w !au_bed_wait
	LDA.b #!AUDIO_SFX_CHARGED
	JSR .choose
	BRA .voice
.quiet
	STZ.w !au_bed
	STZ.w !au_bed_wait
.voice
	; Voice requests accompany the existing charge/release effects. Keep
	; their API but do not transfer PCM during controllable gameplay.
	STZ.w !au_voicereq
	LDA.w !au_backoff         ; native song loader is still clearing echo
	BEQ +
	DEC.w !au_backoff
	RTS
+
	LDA.w !au_tmp
	BEQ .done
	REP #$20
	LDA.l !core_snd_head
	CMP.l !core_snd_tail
	SEP #$20
	BNE .done                 ; a song/script command takes precedence
	REP #$20
	LDA.w !au_tmp
	AND.w #$00FF
	TAX
	LDA.l audio_native_ids,X
	AND.w #$00FF
	XBA
	ORA.w #$0002
	LDX.w #$880F               ; reuse the same effect voice, centred
	JSL core_sound_queue
	SEP #$20
.done
	RTS
.choose
	CMP.b #33
	BCS .return
	REP #$20
	AND.w #$00FF
	TAX
	SEP #$20
	LDA.l audio_native_priority,X
	BEQ .return
	CMP.w !au_tmp+1
	BCC .return
	STA.w !au_tmp+1
	TXA
	STA.w !au_tmp
.return
	RTS
