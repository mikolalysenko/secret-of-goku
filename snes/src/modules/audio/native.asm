; Resident SPC effects for gameplay. One priority-selected command per
; frame, with no BRR transfer, chant stream or continuous air stream.
; The native driver already holds these samples. resident.asm adds short
; single-voice sequences in unused effect slots DC-E2, all self-ending.
; -DAUDIO_PCM=1 retains the old streamer for comparison and audio research.

; Complete an outstanding effect handshake without waiting. Main thread
; only: field/world frames, menus, and before another native command. No
; interrupt can change the ports halfway through the command's four writes.
; Preserve the caller's widths, flags and registers; any DB and D.
audio_native_poll:
if not(defined("AUDIO_PCM"))
	PHP
	SEP #$20
	PHA
	LDA.l $7E0000|!au_pending
	BEQ .done
	CMP.l $002140
	BNE .done
	LDA.b #$00
	STA.l $002140
	STA.l $7E0000|!au_pending
.done
	PLA
	PLP
endif
	RTL

; C3:0175, inside the native driver's saved-register prologue. D=$1E00,
; DB=0, X/Y16. Only command 02 is asynchronous: all its samples/sequences
; are resident. The SPC echoes 02 after latching all four ports, then waits
; for port 0 to change before playing it. Drop a new effect if still busy;
; never overwrite the pending parameters or accumulate stale impacts.
audio_native_command:
	SEP #$20
	JSL audio_native_poll
	LDA $00
	CMP.b #$02
	BNE .native
	STZ $00
	LDA.l $7E0000|!au_pending
	BNE .done
	LDA.l $002140
	BNE .done                  ; the SPC has not released the previous echo
	LDA $03
	STA.l $002143
	LDA $02
	STA.l $002142
	LDA $01
	STA.l $002141
	LDA.b #$02
	STA.l $7E0000|!au_pending
	STA.l $002140
.done
	JML $C3018D                ; the original register restore and RTL
.native
	LDA.l $7E0000|!au_pending
	BEQ .ready
	; A song, fade or stop command must follow the effect in order. These
	; infrequent commands keep the native synchronous contract.
.wait
	CMP.l $002140
	BNE .wait
	LDA.b #$00
	STA.l $002140
	STA.l $7E0000|!au_pending
.ready
	LDA $00                    ; displaced LDA $00; native STZ $00 follows
	JML $C30179

audio_native_ids:
	db $00,$DC,$DC,$DD,$DD,$DE,$DD,$DD
	db $E2,$DF,$E0,$E1,$E0,$DD,$DD,$DD
	db $E1,$E1,$DC,$DD,$DE,$DE,$DE,$E2
	db $DD,$E2,$DC,$E2,$00,$00,$00,$DF,$E2
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
	LDX.w #$880F               ; reuse this cue's voice, centred
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
