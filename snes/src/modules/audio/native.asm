; Resident SPC effects for gameplay. One priority-selected command per
; frame. rare.asm separately services only the three permitted voice clips.
; The native driver holds the samples; round seven additionally uploads a
; fixed PC-derived bank. Shots self-end; ED/EE sustain until a release.
; No chant or continuous air stream. -DAUDIO_PCM=1 is diagnostic only.

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
if !AUDIO_CUSTOM_SAMPLES == 0
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

endif

incsrc "audio/native-map.asm"

; M8/X16, DB=$7E. Requests expire in this frame; a busy sound queue never
; accumulates a delayed burst of punches after the player stopped attacking.
audio_native_service:
	INC.w !au_frame
if !AUDIO_CUSTOM_SAMPLES
	LDA.w !au_reqn
	ORA.w !au_backoff
	BNE .full
	LDA.w !au_flags
	CMP.b #$80
	BNE .full
	JSR audio_beds_age
	JSR audio_beds_service
	JMP audio_rare_service
.full
endif
	LDA.w !au_flags
	AND.b #$01
	BEQ .run
	STZ.w !au_reqn
	STZ.w !au_voicereq
	STZ.w !au_lvl
	STZ.w !au_lvl+1
	STZ.w !au_lvl+2
	STZ.w !au_lvl+3
	STZ.w !au_rare
	LDA.w !au_ch+!c_kind
	BEQ .run
	LDX.w #$0000
	JSR au_stop_channel
.run
	LDA.w !au_flags
	AND.b #$FE
	ORA.b #$80
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
	; No bed to age on a voice-only frame. Avoid four channel-age walks
	; while a rare line is waiting for a safe transfer window.
	LDA.w !au_bed
	ORA.w !au_lvl
	ORA.w !au_lvl+1
if !AUDIO_CUSTOM_SAMPLES == 0
	ORA.w !au_lvl+2
endif
	ORA.w !au_lvl+3
	BEQ .quiet
if !AUDIO_CUSTOM_SAMPLES
	JSR audio_beds_age
	BRA .voice
.quiet
	STZ.w !au_bed
else
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
	LDA.w !au_lvl
	ORA.w !au_lvl+3
	BEQ +
	LDA.b #!AUDIO_NATIVE_CHARGE
	BRA ++
+	; Aura keeps the quieter, shorter sweep. Charge's longer rumble
	; measures closer to the browser bed at this unchanged pulse rate.
	LDA.b #!AUDIO_SFX_CHARGED
++	JSR .effect
	BRA .voice
.quiet
	STZ.w !au_bed
	STZ.w !au_bed_wait
endif
.voice
	; Keep the charge/release voice API silent; rare lines use audio_sfx.
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
if !AUDIO_CUSTOM_SAMPLES
	LDX.w #$880F               ; reuse this cue's voice, centred
	CMP.w #$00EA
	BNE .kick_form
	STZ.w !au_lvl             ; beam replaces stale charge/aura requests
	LDA.w !cb_form
	AND.w #$00FF
	BEQ .beam_normal
	LDA.w #$00F0
	BRA .id_ready
.beam_normal
	LDA.w #$00EA
	BRA .id_ready
.kick_form
	CMP.w #$00E8
	BNE .blast_form
	LDA.w !cb_form
	AND.w #$00FF
	BEQ .kick_normal
	LDA.w #$00F1             ; same KICK API; SSJ finisher is audio-owned
	BRA .id_ready
.kick_normal
	LDA.w #$00E8
	BRA .id_ready
.blast_form
	CMP.w #$00DE
	BNE .id_ready
	LDA.w !cb_form
	AND.w #$00FF
	BEQ .blast_normal
	LDX.w #$880D              ; same DE ownership, +2 semitones on the SPC
.blast_normal
	LDA.w #$00DE
.id_ready
endif
	XBA
	ORA.w #$0002
if !AUDIO_CUSTOM_SAMPLES == 0
	LDX.w #$880F
endif
	JSL core_sound_queue
	SEP #$20
.done
if !AUDIO_CUSTOM_SAMPLES
	JSR audio_beds_service
endif
	JMP audio_rare_service
.choose
	CMP.b #!AUDIO_SFX_FRIEZA_LAUGH
	BCC .effect
	CMP.b #!AUDIO_SFX_VEGETA_KAKAROT+1
	BCS .return
	PHA                       ; do not keep servicing an unsafe request
if defined("vg_clash_on")
	LDA.w !vg_clash_on&$FFFF
	BNE .drop_voice
endif
if defined("cb_charging")
	LDA.w !cb_charging&$FFFF
	BNE .drop_voice
endif
	PLA
	STA.w !au_rare
	LDA.b #8                  ; allow a short delay, not sustained retry work
	STA.w !au_rare_age
	RTS
.drop_voice
	PLA
	RTS
.effect
	CMP.b #!AUDIO_NATIVE_CHARGE+1
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

if !AUDIO_CUSTOM_SAMPLES
; Same native saved-register prologue as the legacy dispatcher. Inline its
; poll to make room for $81 bookkeeping within the original command budget.
audio_native_command:
audio_resident_command:
	SEP #$20
	LDA.l $7E0000|!au_pending
	BEQ .polled
	CMP.l $002140
	BNE .polled
	LDA.b #0
	STA.l $002140
	STA.l $7E0000|!au_pending
.polled
	LDA $00
	CMP.b #$81
	BEQ .async
	CMP.b #2
	BNE .native
.async
	LDA.l $7E0000|!au_pending
	ORA.l $002140
	BNE .drop
	LDA $03
	STA.l $002143
	LDA $02
	STA.l $002142
	LDA $01
	STA.l $002141
	LDA $00
	STA.l $7E0000|!au_pending
	STA.l $002140
	CMP.b #$81
	BEQ .bed
	LDA $01
	CMP.b #$EA
	BEQ .release
	CMP.b #$F0
	BNE .drop
.release
	LDA.b #0
	STA.l $7E0000|!au_bed_level
	STA.l $7E0000|!au_bed_level+1
	BRA .drop
.bed
	LDX.w #0
	LDA $01
	CMP.b #$ED
	BEQ +
	INX
+	LDA $02
	STA.l $7E0000|!au_bed_level,X
	LDA $03
	STA.l $7E0000|!au_bed_rate,X
.drop
	STZ $00
	JML $C3018D
.native
	LDA.l $7E0000|!au_pending
	BEQ .ready
.wait
	CMP.l $002140
	BNE .wait
	LDA.b #0
	STA.l $002140
	STA.l $7E0000|!au_pending
.ready
	LDA $00
	JML $C30179
endif
