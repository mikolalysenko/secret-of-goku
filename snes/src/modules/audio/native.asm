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

; Field and world vblank (last in modules_field_nmi / modules_world_nmi):
; release the echo of the frame's last asynchronous command. Until the CPU
; changes port 0 the SPC waits in its echo loop ($0CC3) and its timer ticks
; go unprocessed (the driver runs one per pass, however many elapsed); the
; frame's own audio poll would come a frame later. These callbacks run only
; in a vblank whose frame completed (core_field_nmi, core_world_nmi): the
; main thread is in the game's wait for this NMI, outside every handshake.
; !au_pending is set only after the SPC's port 0 read 0, so a match is its
; echo. M16/X16 in and out, DB = $80.
if !AUDIO_ECHO_NMI
audio_nmi:
	LDA.l $7E0000|!au_pending
	AND.w #$00FF
	BEQ .done
	SEP #$20
	CMP.w $2140
	BNE +
	STZ.w $2140
	LDA.b #0
	STA.l $7E0000|!au_pending
+	REP #$20
.done
	RTL
endif

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
if !AUDIO_CUSTOM_SAMPLES
	; A lone ordinary cue needs no priority contest or loop. Rare lines
	; and batches still use the complete selector below.
	LDA.w !au_reqn : CMP.b #1 : BNE .many
	LDA.w !au_req : CMP.b #!AUDIO_SFX_FRIEZA_LAUGH : BCS .many
	STA.w !au_tmp
	BRA .bed
.many
	; A hit frame's swing and contact: the same contest, with ordinary cues
	; inline (later requests win ties). B stays zero, so TAX indexes by id.
	LDA.b #0
	XBA
	LDY.w #$0000
.contest
	TYA
	CMP.w !au_reqn
	BCS .bed
	LDA.w !au_req,Y
	INY
	CMP.b #!AUDIO_SFX_FRIEZA_LAUGH
	BCS .special
	TAX
	LDA.l audio_native_priority,X
	BEQ .contest
	CMP.w !au_tmp+1
	BCC .contest
	STA.w !au_tmp+1
	TXA
	STA.w !au_tmp
	BRA .contest
.special
	JSR .choose
	BRA .contest
else
	LDY.w #$0000
.shots
	TYA
	CMP.w !au_reqn
	BCS .bed
	LDA.w !au_req,Y
	JSR .choose
	INY
	BRA .shots
endif
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
if !AUDIO_CUSTOM_SAMPLES
	LDA.w $1E00
	BNE .done                 ; native requests retain ownership of the mailbox
endif
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
	JSL core_sound_queue
else
	; The selector has already checked the native mailbox and the core
	; queue. Send once here: no SRAM ring round trip at the very end of a
	; crowded frame, and no driver entry. A busy SPC drops a stale one-shot,
	; never waits or overwrites its ports.
	JSR audio_native_send
endif
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
; The module's own resident commands (02 one-shots, 81 beds) go straight to
; the ports. A C3:0004 call would pass destroy's song hook and the driver's
; register save/restore (about a scanline) for a command that needs none of
; them. The handshake is audio_resident_command's: release an echoed
; command; if the previous one is still unacknowledged, drop this one
; (never wait for a busy driver, never overwrite latched ports). Ports 1-3
; first, port 0 last. The mailbox $1E00 is not touched.
; A release made here is followed by the driver's own wait (C3:05B2): the
; SPC, spinning on port 0, clears its echo about 20 us later. Bounded at
; about 1.3 lines; past that the command is dropped as before.
; In: A16 = command | p1<<8, X16 = p2 | p3<<8, DB = $7E. Out: A8, X16.
audio_native_send:
	STA.w !au_tmp+$0C
	STX.w !au_tmp+$0E
	SEP #$20
	LDA.w !au_pending
	BEQ .ready
	CMP.l $002140
if not(defined("AUDIO_NATIVE_SYNC"))
	BEQ .echoed
	CMP.b #$02
	BEQ .drop
	CMP.b #$81
	BEQ .drop
-	CMP.l $002140             ; the pump's stop or fade (audio_native_simple)
	BNE -                     ; precedes this cue, as when it waited itself
.echoed
else
	BNE .drop
endif
	LDA.b #0
	STA.l $002140
	STA.w !au_pending
	LDY.w #24
-	LDA.l $002140
	BEQ .clear
	DEY
	BNE -
	RTS
.ready
	LDA.l $002140
	BNE .drop
.clear
	REP #$20
	TXA
	STA.l $002142             ; ports 2 then 3
	SEP #$20
	LDA.w !au_tmp+$0D
	STA.l $002141
	LDA.w !au_tmp+$0C
	STA.w !au_pending
	STA.l $002140
	CMP.b #$81
	BEQ .bed
	LDA.w !au_tmp+$0D
	CMP.b #$EA
	BEQ .release
	CMP.b #$F0
	BNE .drop
.release
	STZ.w !au_bed_level       ; the wave replaces both beds on the SPC
	STZ.w !au_bed_level+1
.drop
	RTS
.bed
	LDX.w #0
	LDA.w !au_tmp+$0D
	CMP.b #$ED
	BEQ +
	INX
+	LDA.w !au_tmp+$0E
	STA.w !au_bed_level,X
	LDA.w !au_tmp+$0F
	STA.w !au_bed_rate,X
	RTS

; Stops, fades and UI sounds a module queued (F0-FC, 80/86/89, 10-1F),
; when the core's sound pump sends them (core_frame_end, after every
; module's frame). The native driver (C3:059F) writes the same four ports,
; then waits for the echo, but the SPC polls the ports only between its
; timer ticks, and a busy scene's tick runs up to ~90 lines: the orbit
; clash's F2 at the win waited 84-97 lines and crossed vblank. Here the
; wait is bounded at ~3 lines and ends by line 223; a later echo is left
; pending for the next frame's audio poll, as an effect's is (a dispatched
; frame follows the pump). A cue or effect after it waits for that echo
; instead of being dropped. Retail callers keep the native handshake: an
; event script may warp before the next poll. Never withdrawn.
; In: A8 = command, X/Y16, any DB/D. Carry set: sent; $1E00 is consumed
; by the caller. Clear: the native path.
if not(defined("AUDIO_NATIVE_SYNC"))
audio_native_simple:
	CMP.b #$F0 : BCC .low
	CMP.b #$FD : BCC .pump
.native
	CLC
	RTS
.low
	CMP.b #$80 : BEQ .pump
	CMP.b #$86 : BEQ .pump
	CMP.b #$89 : BEQ .pump
	CMP.b #$10 : BCC .native
	CMP.b #$20 : BCS .native
.pump
	; Only core_sound_pump's JSL $C30004 (S+8..10: this JSR, Y, A, P).
	REP #$20
	LDA $08,S : CMP.w #core_sound_pump_none-3
	SEP #$20
	BNE .native
	LDA $0A,S : CMP.b #core_sound_pump_none>>16 : BNE .native
	LDA.l $7E0000|!au_pending : BEQ .ready
-	CMP.l $002140 : BNE -        ; an earlier command first (native order)
	LDA.b #0 : STA.l $002140 : STA.l $7E0000|!au_pending
	LDY.w #24
-	LDA.l $002140 : BEQ .send
	DEY : BNE -
	BRA .native                 ; still clearing: the driver's own C3:05B2 wait
.ready
	LDA.l $002140 : BNE .native ; another handshake shows
.send
	LDA.l $7E1E03 : STA.l $002143
	LDA.l $7E1E02 : STA.l $002142
	LDA.l $7E1E01 : STA.l $002141
	LDA.l $7E1E00 : STA.l $7E0000|!au_pending : STA.l $002140
	; C3:05C2: F0/F1 keep the current song for a later resume, then none.
	CMP.b #$F2 : BCS .budget
	CMP.b #$F0 : BCC .budget
	LDA.l $7E1E05 : BMI +
	STA.l $7E1E09
	REP #$20
	LDA.l $7E1E06 : STA.l $7E1E0A
	SEP #$20
+	LDA.b #$FF : STA.l $7E1E05
.budget
	; ~19 polls a line: 3 lines (an idle driver answers within 0.3-1.6),
	; or up to line 223 when that is nearer.
	LDY.w #57
	LDA.l $00213F               ; reset the counter read flip-flops
	LDA.l $002137               ; latch H/V
	LDA.l $00213D : PHA         ; V low
	LDA.l $00213D : LSR         ; V bit 8: lines 256-261 are vblank
	PLA
	BCS .wait
	CMP.b #220 : BCC .wait
	CMP.b #225 : BCS .wait      ; vblank of a late frame: no NMI to make
	EOR.b #$FF : SEC : ADC.b #223 ; lines to 223 (none at 223-224)
	BMI .late
	BEQ .late
	PHA
	ASL : ASL : ASL : ASL
	CLC : ADC $01,S : CLC : ADC $01,S : CLC : ADC $01,S ; x19, at most 57
	REP #$20 : AND.w #$00FF : TAY : SEP #$20
	PLA
.wait
	LDA.l $7E1E00
-	CMP.l $002140 : BEQ .echo
	DEY : BNE -
.late
	SEC
	RTS
.echo
	LDA.b #0 : STA.l $002140 : STA.l $7E0000|!au_pending
	SEC
	RTS
endif

; C3:0160. Ordinary effects do not use D or DB: avoid saving and rebuilding
; every register just to write four ports. Preserve A/B, Y and P explicitly
; (any caller widths); the fallback replays the native prologue for every
; other command. Same handshake and bounded release wait as the module's
; direct send: two native effects a few lines apart no longer drop the
; second while the SPC clears the first's echo.
audio_native_effect:
	PHP
	REP #$30
	PHA
	PHY
	LDA.l $7E1E00 : AND.w #$00FF : CMP.w #2 : BEQ .async
	CMP.w #$81 : BEQ .async
if not(defined("AUDIO_NATIVE_SYNC"))
	SEP #$20
	JSR audio_native_simple
	BCC +
	BRL .drop
+	REP #$30
endif
	JMP .native
.async
	SEP #$20
	LDA.l $7E0000|!au_pending : BEQ .ready
if not(defined("AUDIO_NATIVE_SYNC"))
	CMP.l $002140 : BEQ .echoed
	CMP.b #$02 : BEQ .busy
	CMP.b #$81 : BEQ .busy
-	CMP.l $002140 : BNE -        ; a stop or fade from the pump goes first
.echoed
else
	CMP.l $002140 : BNE .busy
endif
	LDA.b #0 : STA.l $002140 : STA.l $7E0000|!au_pending
	LDY.w #24
-	LDA.l $002140 : BEQ .clear
	DEY : BNE -
.busy
	BRL .drop
.ready
	LDA.l $002140 : BNE .busy
.clear
	LDA.l $7E1E03 : STA.l $002143
	LDA.l $7E1E02 : STA.l $002142
	LDA.l $7E1E01 : STA.l $002141
	LDA.l $7E1E00 : STA.l $7E0000|!au_pending : STA.l $002140
	CMP.b #$81 : BEQ .bed
	LDA.l $7E1E01 : CMP.b #$EA : BEQ .release
	CMP.b #$F0 : BNE .drop
.release
	LDA.b #0
	STA.l $7E0000|!au_bed_level : STA.l $7E0000|!au_bed_level+1
	BRA .drop
.bed
	LDA.l $7E1E01 : CMP.b #$ED : BEQ .charge
	LDA.l $7E1E02 : STA.l $7E0000|!au_bed_level+1
	LDA.l $7E1E03 : STA.l $7E0000|!au_bed_rate+1
	BRA .drop
.charge
	LDA.l $7E1E02 : STA.l $7E0000|!au_bed_level
	LDA.l $7E1E03 : STA.l $7E0000|!au_bed_rate
.drop
	LDA.b #0 : STA.l $7E1E00
	REP #$30
	PLY
	PLA
	PLP
	JML $C30197                  ; shared RTL / command-completion trace point
.native
	PLY
	PLA
	PLP
	PHB
	PHD
	PHP
	REP #$20
	JML $C30165

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
