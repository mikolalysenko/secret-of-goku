; Audio module: resident SNES effects, native music, and three rare 6 kHz
; voices. -DAUDIO_PCM=1 enables the full 12 kHz diagnostic streamer.
; docs/agents/snes-port/audio.md describes the driver, protocol and API.
;
; Public API (JSL from main-loop code; any M/X; DB and D preserved):
;   audio_sfx     A = shot id (!AUDIO_SFX_*): played at the end of this frame
;   audio_loop    A = loop id (!AUDIO_LOOP_*), X = level 1-255, Y = rate
;                 ($80 = 1.0, $60-$A0 sensible); call every frame while the
;                 bed should sound; it fades out two frames after the last call
;   audio_voice   shipping: no-op; diagnostic PCM: A = 1 chant (once per charge: repeated calls
;                 while charging are ignored), 2 release (the shout replaces
;                 the chant), 0 cut the chant
;   audio_cancel  drop combat sounds: queued shots, charge/aura beds, chant
;   audio_stop    stop every stream at this frame's service
;   audio_song    A = song id (!AUDIO_SONG_* or native), X = p2 | p3<<8
;                 (0: $10, $FF) — native song command through core_sound_queue
;   audio_song_restore  back to the last native song (the scene's own music)
;   audio_fade    A = native fade byte (command 80; $80 = fade out)
; Frame callbacks (modules.asm): audio_frame (field, world), audio_pause
; (menus, rings).

incsrc "audio/ids.asm"

; ---------------------------------------------------------------- WRAM
!aw #= !RAM_AUDIO&$FFFF          ; absolute with DB = $7E
!au_reqn     #= !aw+$00   ; queued shots (0-4)
!au_req      #= !aw+$01   ; 4 shot ids
!au_voicereq #= !aw+$05   ; 0 none, 1 chant, 2 release, 3 cut
!au_status   #= !aw+$06   ; last port 3 status
!au_cnt      #= !aw+$07   ; protocol counter
!au_groups   #= !aw+$08   ; groups in the command being sent
!au_flags    #= !aw+$09   ; bit0 stop all now, bit1 a transfer is wanted (until one completes),
                          ; bit2 chant latched, bit3 stop all with the next transfer,
                          ; bit6 disabled (APU timeout or no extension), bit7 synced
!au_lvl      #= !aw+$0A   ; 4 loop levels requested (0 off)
!au_rate     #= !aw+$0E   ; 4 loop rates ($80 = 1.0)
!au_age      #= !aw+$12   ; 4 frames since the loop was requested
!au_test     #= !aw+$16   ; word: test mailbox (op | arg<<8), audio_test_poll
!au_last     #= !aw+$18   ; frame of the last hit, impact
!au_var      #= !aw+$1A   ; variant counters: hit, swing, blast
!au_frame    #= !aw+$1D
!au_testloop #= !aw+$1E   ; test: loop id + 1 kept on every frame (0 none)
!au_backoff  #= !aw+$1F   ; frames to wait before the next transfer
!au_ch       #= !aw+$20   ; channel 0; channel 1 at +$20
!au_tmp      #= !aw+$60   ; scratch $60-$7F
; channel fields end at $1B: the last four bytes of each channel block hold
; module globals
!au_native   #= !aw+$3C   ; last native song: id|$80 (0 none), echo preset, p3
!au_song     #= !aw+$3F   ; song id seen last frame ($1E05)
!au_misses   #= !aw+$5C   ; commands withdrawn in a row (saturates at $FF)
!au_dsfx     #= !aw+$5D   ; destroy's !out_sfx (low byte) when last seen
!au_bed      #= !aw+$5E   ; native charge bed was requested last frame
!au_bed_wait #= !aw+$5F   ; frames before another native charge pulse
; Shipping uses only stream channel 0. These alias unused channel 1 fields.
!au_pending  #= !aw+$5B   ; resident command awaiting SPC echo
!au_rare     #= !aw+$5A   ; pending rare line (28-30), 0 none
!au_rare_age #= !aw+$59   ; frames left to start it, then drop
!au_wake     #= !aw+$58   ; service work outstanding (shipping only)
!AU_CH = $20
; channel fields (X = channel offset 0 / $20)
!c_kind  = $00   ; 0 idle, 1 shot, 2 loop
!c_cue   = $01   ; shot id or loop id
!c_prio  = $02
!c_ctl   = $03   ; records to send: bit0 START, bit1 VOL, bit2 PITCH, bit3 STOP
!c_src   = $04   ; word + bank ($06): next chunk
!c_left  = $07   ; word: chunks left (0 = one-shot fully sent)
!c_lsrc  = $09   ; word + bank ($0B): clip start
!c_llen  = $0C   ; word: clip length in chunks
!c_loop  = $0E
!c_wr    = $0F   ; next slot to write (absolute 0-13)
!c_sent  = $10   ; chunks sent since START (mod 8)
!c_infl  = $11   ; chunks in flight
!c_voll  = $12
!c_volr  = $13
!c_pitch = $14   ; word
!c_k     = $16   ; chunks to send this frame
!c_limit = $17   ; in-flight limit (6 right after a START)
!c_base  = $18   ; first slot of the channel's ring (0 / 7)
!c_lvl   = $19   ; loop level / rate of the last VOL / PITCH record
!c_rate  = $1A
!c_vol   = $1B   ; full-level volume of the playing cue

!CTL_START = $01
!CTL_VOL   = $02
!CTL_PITCH = $04
!CTL_STOP  = $08
if defined("AUDIO_PCM")
!AU_BUDGET = 5   ; 12 kHz diagnostic streams need ~3.1 chunks/frame
!AU_FIRST = 6
!AU_LINE_LIMIT = 218
else
!AU_BUDGET = 3   ; one 6 kHz voice needs ~1.56 chunks/frame
!AU_FIRST = 2    ; start gently; top up only when the frame has spare time
!AU_LINE_LIMIT = 176 ; leave room for the core's remaining frame work
endif
!AU_CMD_WAIT = 3000  ; first echo: ~10-13 ms (the driver polls the ports at
                     ; least every ~8 ms while it plays; APU harness)
!AU_PROBE_WAIT = 400 ; ~1.5 ms: after a miss, until the driver answers again
                     ; (misses in a row back off 2, 4, … 128 frames)
!AU_SONG_HOLD = 16   ; frames after a song change: the driver clears its
                     ; echo ring and does not poll the ports for ~15 frames
!AU_CHUNK_LINES = 20 ; one chunk: 13 groups at ~95 us (Mesen, arrival scene)
!AU_CMD_LINES = 6    ; the command's own handshakes

pushpc
org !DATA_AUDIO
audio_upload:
	incbin "audio/upload.bin"
incsrc "audio/tables.asm"
incsrc "audio/songs.asm"
audio_data_end:
assert audio_data_end <= !DATA_AUDIO+$8000, "audio data bank overflow"
pullpc

pushpc
org !CODE_AUDIO
audio_code_start:

; ---------------------------------------------------------------- boot
; C3:0106, after the driver's six IPL blocks: upload the extension segments
; the same way, then let the original code start the driver at $0200.
; In: A8 = the next block's kick value, X16/Y16, D = $1E00, DB = 0.
; Replaced bytes: LDY #$0200 / STY $2142 (re-executed before returning).
audio_boot_upload:
	PHB
	LDX.w #$0000
.block
	PHA                       ; kick for this block
	REP #$20
	LDA.l audio_upload+2,X    ; segment length (0 ends the list)
	BEQ .finish
	TAY
	LDA.l audio_upload,X      ; ARAM address → ports 2-3
	STA.l $002142
	SEP #$20
	INX : INX : INX : INX
	PLA
	STA.l $002141             ; nonzero: a block follows
	STA.l $002140
-	CMP.l $002140
	BNE -
	LDA.b #$00 : XBA          ; byte counter in B
.byte
	LDA.l audio_upload,X
	STA.l $002141
	XBA
	STA.l $002140
-	CMP.l $002140
	BNE -
	INC
	XBA
	INX
	DEY
	BNE .byte
	XBA                       ; next kick: counter + 3, never 0
	CLC : ADC.b #$03
	BNE .block
	INC
	BRA .block
.finish
	SEP #$20
	PLA
	PLB
	LDY.w #$0200
	STY.w $2142
	JML $C3010C

; ---------------------------------------------------------------- API
audio_sfx:
	PHP
	REP #$30
	PHA
	PHX
	SEP #$20
	LDA.l $7E0000+!au_reqn
	CMP.b #$04
	BCS .full
	REP #$20
	AND.w #$00FF
	TAX
	SEP #$20
	LDA $03,S                 ; caller's A (low byte)
	STA.l $7E0000+!au_req,X
	INX
	TXA
	STA.l $7E0000+!au_reqn
if not(defined("AUDIO_PCM"))
	STA.l $7E0000+!au_wake
endif
.full
	REP #$30
	PLX
	PLA
	PLP
	RTL

audio_loop:
	PHP
	REP #$30
	PHA
	PHX
	PHY
	AND.w #$0003
	TAX
	SEP #$20
	LDA $01,S                 ; Y low: rate
	STA.l $7E0000+!au_rate,X
if not(defined("AUDIO_PCM"))
	STA.l $7E0000+!au_wake
endif
	LDA $03,S                 ; X low: level
	STA.l $7E0000+!au_lvl,X
	LDA.b #$00
	STA.l $7E0000+!au_age,X
	REP #$30
	PLY
	PLX
	PLA
	PLP
	RTL

audio_voice:
if not(defined("AUDIO_PCM"))
	RTL                       ; frequent Kamehameha chant and shout stay off
endif
	PHP
	SEP #$20
	PHA
	AND.b #$03
	BNE +
	LDA.b #$03
+	STA.l $7E0000+!au_voicereq
	PLA
	PLP
	RTL

audio_cancel:
	PHP
	SEP #$20
	PHA
	LDA.b #$00
	STA.l $7E0000+!au_reqn
	STA.l $7E0000+!au_lvl+0   ; charge
	STA.l $7E0000+!au_lvl+1   ; aura
	LDA.b #$03
	STA.l $7E0000+!au_voicereq
if not(defined("AUDIO_PCM"))
	STA.l $7E0000+!au_wake
	; Cancel the current line now; a fresh effect queued after this API
	; call must survive (e.g. the transformation that ends a focus).
	LDA.b #$00
	STA.l $7E0000+!au_rare
	LDA.l $7E0000+!au_ch+!c_kind
	BEQ +
	LDA.b #$00
	STA.l $7E0000+!au_ch+!c_kind
	LDA.b #!CTL_STOP
	STA.l $7E0000+!au_ch+!c_ctl
+
endif
	PLA
	PLP
	RTL

audio_stop:
	PHP
	SEP #$20
	PHA
	LDA.l $7E0000+!au_flags
	ORA.b #$01
	STA.l $7E0000+!au_flags
if not(defined("AUDIO_PCM"))
	STA.l $7E0000+!au_wake
endif
	LDA.b #$00
	STA.l $7E0000+!au_reqn
	STA.l $7E0000+!au_voicereq
	STA.l $7E0000+!au_lvl+0
	STA.l $7E0000+!au_lvl+1
	STA.l $7E0000+!au_lvl+2
	STA.l $7E0000+!au_lvl+3
	PLA
	PLP
	RTL

audio_song:
	PHP
	REP #$30
	PHA
	PHX
	PHB
	PEA $7E7E : PLB : PLB     ; core services expect DB = $7E
	AND.w #$00FF
	XBA
	ORA.w #$0001              ; command 01, p1 = song
	TXY
	BNE +
	LDY.w #$FF00              ; p2: previous song cut, as the browser switches cues; p3: full volume
+	TYX
	JSL core_sound_queue
	PLB
	PLX
	PLA
	PLP
	RTL

; The scene's own music again: the last native song with its echo preset
; and start volume. The current song is cut (p2 high nibble 0, no fade
; wait), as the browser stops its cue. Nothing happens when no native song
; was seen since power-on.
audio_song_restore:
	PHP
	REP #$30
	PHA
	PHX
	PHB
	PEA $7E7E : PLB : PLB
	LDA.w !au_native
	BIT.w #$0080
	BEQ +
	LDA.w !au_native+1        ; p3 << 8 | preset
	AND.w #$FF0F
	TAX
	LDA.w !au_native
	AND.w #$007F
	XBA
	ORA.w #$0001              ; command 01, p1 = song
	JSL core_sound_queue
+	PLB
	PLX
	PLA
	PLP
	RTL

audio_fade:
	PHP
	REP #$30
	PHA
	PHX
	PHB
	PEA $7E7E : PLB : PLB
	AND.w #$00FF
	XBA
	ORA.w #$0080
	LDX.w #$0000
	JSL core_sound_queue
	PLB
	PLX
	PLA
	PLP
	RTL

; ---------------------------------------------------------------- callbacks
; Field and world frames: M16/X16, DB = $7E, D = 0.
audio_frame:
	PHP
if not(defined("AUDIO_PCM"))
	; Dispatcher enters M16/X16. Quiet frames need no loop-age service.
	LDA.w !au_test
	BNE .run
	SEP #$20
	LDA.w !au_wake
	ORA.w !au_pending
	BNE .run8
	LDA.w $1E05
	CMP.w !au_song
	BNE .run8
if defined("title_sfx")
	LDA.w !title_sfx&$FFFF
	BNE .run8
endif
if defined("out_sfx")
	LDA.w !out_sfx&$FFFF
	CMP.w !au_dsfx
	BNE .run8
endif
	PLP
	RTL
.run
endif
	SEP #$20
.run8
	REP #$10
	JSL audio_native_poll
	JSR audio_track_native
	JSR audio_test_poll
if defined("title_sfx")
	JSR audio_title_cues
endif
if defined("out_sfx")
	JSR audio_destroy_cues
endif
	JSR audio_service
if not(defined("AUDIO_PCM"))
	LDA.w !au_ch+!c_kind
	ORA.w !au_ch+!c_ctl
	ORA.w !au_rare
	ORA.w !au_bed
	ORA.w !au_testloop
	ORA.w !au_backoff
	STA.w !au_wake
endif
audio_frame_done:
	PLP
	RTL

if defined("title_sfx")
; Goku's arrival (title module): !title_sfx = 1 when the pod's descent
; begins, 2 at the impact, the browser's playSound('flight') / ('impact').
; The consumer clears it.
audio_title_cues:
	LDA.w !title_sfx&$FFFF
	BEQ .none
	STZ.w !title_sfx&$FFFF
	CMP.b #$02
	BEQ .impact
	CMP.b #$01
	BNE .none
	LDA.b #!AUDIO_SFX_FLIGHT
	BRA .play
.impact
	LDA.b #!AUDIO_SFX_IMPACT
.play
	JSL audio_sfx
.none
	RTS
endif

if defined("out_sfx")
; Destructible scenery (destroy module): !out_sfx counts impact sounds, one
; per applied row or broken barrier (the browser's playSound('impact') in
; lab.js onCut and native-barriers.js). Play IMPACT when it moved; IMPACT
; sounds at most once every 2 frames. Before the first sync after boot or an
; import the count is only taken.
audio_destroy_cues:
	LDA.w !out_sfx&$FFFF
	CMP.w !au_dsfx
	BEQ .none
	STA.w !au_dsfx
	LDA.w !au_flags
	BPL .none
	LDA.b #!AUDIO_SFX_IMPACT
	JSL audio_sfx
.none
	RTS
endif

; Remember the native song playing (loader state $1E05-$1E07: id, echo
; preset, p3) so audio_song_restore can return to it after a new cue. A
; song change (by anyone: map, event, audio_song) keyed every voice off and
; leaves the driver busy for a while: drop the streams and hold transfers.
audio_track_native:
	LDA.w $1E05
	CMP.w !au_song
	BEQ +
	STA.w !au_song
	LDA.b #!AU_SONG_HOLD
	STA.w !au_backoff
	LDA.w !au_flags
	ORA.b #$08
	STA.w !au_flags
	LDA.w $1E05
+	CMP.b #$3B
	BCS ++                    ; a new song ($3B-$3F) or none ($FF)
	ORA.b #$80
	STA.w !au_native
	LDA.w $1E06
	STA.w !au_native+1
	LDA.w $1E07
	STA.w !au_native+2
++	RTS

; Menus and rings: the action is paused, streams stop.
audio_pause:
	PHP
	SEP #$20
	REP #$10
	JSL audio_native_poll
if not(defined("AUDIO_PCM"))
	STZ.w !au_reqn
	STZ.w !au_voicereq
	STZ.w !au_bed
	STZ.w !au_bed_wait
	STZ.w !au_lvl
	STZ.w !au_lvl+1
	STZ.w !au_lvl+2
	STZ.w !au_lvl+3
	STZ.w !au_rare
	LDA.w !au_ch+!c_kind
	BEQ +
	LDX.w #$0000
	JSR au_stop_channel
+	JSR audio_rare_service
	PLP
	RTL
endif
	LDA.w !au_ch+!c_kind
	ORA.w !au_ch+!AU_CH+!c_kind
	BEQ +
	LDA.w !au_flags
	ORA.b #$01
	STA.w !au_flags
	JSR audio_service
+	PLP
	RTL

; ---------------------------------------------------------------- service
; A8 X16, DB = $7E. Runs once per field/world frame.
audio_service:
if not(defined("AUDIO_PCM"))
	JMP audio_native_service
endif
	LDA.w !au_flags
	BIT.b #$40
	BEQ +
	RTS                       ; disabled after an APU timeout
+	INC.w !au_frame
	BIT.b #$80
	BNE .synced
	ORA.b #$83                ; first service since boot / title / import:
                              ; stop both now (this also tells whether the
                              ; driver has the extension, au_end)
	STA.w !au_flags
	STZ.w !au_ch+!c_base
	LDA.b #$07
	STA.w !au_ch+!AU_CH+!c_base
	STA.w !au_ch+!AU_CH+!c_wr
	STZ.w !au_ch+!c_wr
.synced
	LDA.w !au_flags           ; drop both streams: now (menus, audio_stop) or
	BIT.b #$09                ; with the next transfer (sync, song change:
	BEQ +                     ; the song start already keyed the voices off
	PHA                       ; and cleared $AE)
	AND.b #$F6
	STA.w !au_flags
	LDX.w #$0000
	JSR au_stop_channel
	LDX.w #!AU_CH
	JSR au_stop_channel
	PLA
	AND.b #$01
	BEQ +
	LDA.w !au_flags           ; stop now: send it even if nothing else is due
	ORA.b #$02
	STA.w !au_flags
+	LDA.w !au_flags           ; idle (most frames): nothing playing, asked
	AND.b #$02                ; for or due
	ORA.w !au_ch+!c_kind
	ORA.w !au_ch+!AU_CH+!c_kind
	ORA.w !au_reqn
	ORA.w !au_voicereq
	ORA.w !au_lvl
	ORA.w !au_lvl+1
	ORA.w !au_lvl+2
	ORA.w !au_lvl+3
	BNE .busy
	LDA.w !au_backoff
	BEQ +
	DEC.w !au_backoff
+	RTS
.busy
-	LDA.l $002143             ; status, read until stable
	CMP.l $002143
	BNE -
	STA.w !au_status
	LDX.w #$0000
	JSR au_channel_status
	LDX.w #!AU_CH
	JSR au_channel_status
	JSR au_voice_requests
	JSR au_shot_requests
	JSR au_loops
	JSR au_plan
	JSR au_budget
	JMP au_send

; X = channel: in-flight count, and idle once the SPC reports it inactive.
au_channel_status:
	LDA.w !au_status
	CPX.w #$0000
	BEQ +
	LSR : LSR : LSR : LSR
+	PHA
	AND.b #$07                ; chunks consumed since START (mod 8)
	STA.w !au_tmp
	LDA.w !au_ch+!c_sent,X
	SEC
	SBC.w !au_tmp
	AND.b #$07
	STA.w !au_ch+!c_infl,X
	PLA
	AND.b #$08
	BNE .ret
	LDA.w !au_ch+!c_ctl,X     ; START not sent yet (withdrawn or held):
	AND.b #!CTL_START         ; the SPC cannot know the cue
	BNE .pending
	STZ.w !au_ch+!c_kind,X    ; finished, never started, or reclaimed
.pending
	STZ.w !au_ch+!c_infl,X
.ret
	RTS

; X = channel: forget it and send a STOP.
au_stop_channel:
	STZ.w !au_ch+!c_kind,X
	LDA.b #!CTL_STOP
	STA.w !au_ch+!c_ctl,X
	RTS

; ---------------------------------------------------------------- requests
; The chant starts once per charge (bit 2 of au_flags latches it until a
; release or a cut), so callers may request it every charging frame.
au_voice_requests:
	LDA.w !au_voicereq
	BEQ .none
	STZ.w !au_voicereq
	CMP.b #$03
	BEQ .cut
	LDX.w #$0000              ; voices take channel 0
	CMP.b #$02
	BEQ .release
	LDA.w !au_flags
	BIT.b #$04
	BNE .none
	ORA.b #$04
	STA.w !au_flags
	LDA.b #!AUDIO_SFX_KAME_CHARGE
	JMP au_start_shot
.release
	LDA.w !au_flags
	AND.b #$FB
	STA.w !au_flags
	LDA.b #!AUDIO_SFX_KAME_RELEASE
	JMP au_start_shot
.cut
	LDA.w !au_flags
	AND.b #$FB
	STA.w !au_flags
	LDA.w !au_ch+!c_kind
	CMP.b #$01
	BNE .none
	LDA.w !au_ch+!c_cue
	CMP.b #!AUDIO_SFX_KAME_CHARGE
	BNE .none
	LDX.w #$0000
	JMP au_stop_channel
.none
	RTS

au_shot_requests:
	LDY.w #$0000
.next
	TYA
	CMP.w !au_reqn
	BCS .done
	PHY
	LDA.w !au_req,Y
	JSR au_request_shot
	PLY
	INY
	BRA .next
.done
	STZ.w !au_reqn
	RTS

; A = shot id: choose a channel by priority and start it there.
au_request_shot:
	BEQ .ret
	CMP.b #!AUDIO_NSHOTS+1
	BCS .ret
	STA.w !au_tmp+1
	; hit and impact: at most one every two frames (the browser's rule)
	LDX.w #$0000
	CMP.b #!AUDIO_SFX_HIT
	BEQ .dedupe
	INX
	CMP.b #!AUDIO_SFX_IMPACT
	BNE .revert
.dedupe
	LDA.w !au_frame
	SEC
	SBC.w !au_last,X
	CMP.b #$02
	BCC .ret
	LDA.w !au_frame
	STA.w !au_last,X
.revert
	LDA.w !au_tmp+1           ; reverting cuts a transformation still sounding
	CMP.b #!AUDIO_SFX_REVERT
	BNE .info
	LDX.w #$0000
	JSR au_cut_transform
	LDX.w #!AU_CH
	JSR au_cut_transform
.info
	JSR au_shot_info
	LDA.w !au_tmp+3
	AND.b #$02
	BEQ .effect
	LDX.w #$0000              ; voice-class cues take channel 0
	BRA .take
.effect
	LDX.w #!AU_CH
	JSR au_can_take
	BCC .take
	LDX.w #$0000
	JSR au_can_take
	BCC .take
.ret
	RTS                       ; both channels hold something more important
.take
	LDA.w !au_tmp+1
	JMP au_start_shot

; X = channel: carry clear when a shot of priority au_tmp+2 may take it.
au_can_take:
	LDA.w !au_ch+!c_kind,X
	BEQ .yes
	CMP.b #$02
	BEQ .yes                  ; loops yield and resume afterwards
	LDA.w !au_tmp+2
	CMP.w !au_ch+!c_prio,X
	BCS .yes
	SEC
	RTS
.yes
	CLC
	RTS

au_cut_transform:
	LDA.w !au_ch+!c_kind,X
	CMP.b #$01
	BNE .ret
	LDA.w !au_ch+!c_cue,X
	CMP.b #!AUDIO_SFX_TRANSFORM
	BEQ .cut
	CMP.b #!AUDIO_SFX_POWER_BURST
	BNE .ret
.cut
	JMP au_stop_channel
.ret
	RTS

; au_tmp+1 = shot id → its table entry at au_tmp+$18 (clips 0-2, count,
; volume, priority, flags), au_tmp+2 priority, au_tmp+3 flags.
au_shot_info:
	PHX
	REP #$20
	LDA.w !au_tmp+1
	AND.w #$00FF
	ASL : ASL : ASL
	TAX
	LDA.l audio_shot_table+0,X
	STA.w !au_tmp+$18
	LDA.l audio_shot_table+2,X
	STA.w !au_tmp+$1A
	LDA.l audio_shot_table+4,X
	STA.w !au_tmp+$1C
	LDA.l audio_shot_table+6,X
	STA.w !au_tmp+$1E
	SEP #$20
	PLX
	LDA.w !au_tmp+$1D
	STA.w !au_tmp+2
	LDA.w !au_tmp+$1E
	STA.w !au_tmp+3
	RTS

; A = shot id, X = channel: start the shot's next variant there.
au_start_shot:
	STA.w !au_tmp+1
	PHX
	JSR au_shot_info          ; Y = entry offset
	PLX
	LDA.w !au_tmp+2
	STA.w !au_ch+!c_prio,X
	LDA.w !au_tmp+1
	STA.w !au_ch+!c_cue,X
	LDA.b #$01
	STA.w !au_ch+!c_kind,X
	LDA.w !au_tmp+$1C            ; volume
	STA.w !au_ch+!c_voll,X
	STA.w !au_ch+!c_volr,X
	STZ.w !au_tmp+4           ; variant
	LDA.w !au_tmp+3
	AND.b #$01
	BEQ .clip
	PHX                       ; hit / swing / blast step through variants
	LDX.w #$0000
	LDA.w !au_tmp+1
	CMP.b #!AUDIO_SFX_HIT
	BEQ +
	INX
	CMP.b #!AUDIO_SFX_SWING
	BEQ +
	INX
+	LDA.w !au_var,X
	STA.w !au_tmp+4
	INC
	STA.w !au_var,X
	PLX
.clip
	LDA.w !au_tmp+4           ; clip = clips[variant mod n]
-	CMP.w !au_tmp+$1B
	BCC +
	SEC
	SBC.w !au_tmp+$1B
	BRA -
+	PHX
	REP #$20
	AND.w #$0003
	TAX
	SEP #$20
	LDA.w !au_tmp+$18,X
	PLX
	STA.w !au_tmp+6           ; clip id
	PHX                       ; pitch from the table …
	REP #$20
	LDA.w !au_tmp+1
	AND.w #$00FF
	ASL
	TAX
	LDA.l audio_shot_pitch,X
	PLX
	STA.w !au_ch+!c_pitch,X
	SEP #$20
	LDA.w !au_tmp+3           ; … stepped through 1, 1.035, .975 for variants
	AND.b #$01
	BEQ .go
	LDA.w !au_tmp+4
-	CMP.b #$03
	BCC +
	SBC.b #$03
	BRA -
+	CMP.b #$00
	BEQ .go
	REP #$20
	CMP.w #$0001
	BNE .low
	LDA.w !au_ch+!c_pitch,X   ; ×1.035 ≈ + p/32 + p/256
	LSR : LSR : LSR : LSR : LSR
	STA.w !au_tmp+8
	LSR : LSR : LSR
	CLC
	ADC.w !au_tmp+8
	CLC
	ADC.w !au_ch+!c_pitch,X
	BRA .setp
.low
	LDA.w !au_ch+!c_pitch,X   ; ×.975 ≈ − p/64 − p/128
	LSR : LSR : LSR : LSR : LSR : LSR
	STA.w !au_tmp+8
	LSR
	CLC
	ADC.w !au_tmp+8
	EOR.w #$FFFF
	SEC
	ADC.w !au_ch+!c_pitch,X
.setp
	STA.w !au_ch+!c_pitch,X
	SEP #$20
.go
	LDA.w !au_tmp+6
	JMP au_start_clip

; ---------------------------------------------------------------- loops
au_loops:
	LDX.w #$0000              ; requests not refreshed for two frames end
-	LDA.w !au_age,X
	CMP.b #$02
	BCC +
	STZ.w !au_lvl,X
	BRA ++
+	INC
	STA.w !au_age,X
++	INX
	CPX.w #$0004
	BNE -
	LDX.w #$0000
	JSR au_keep_loop
	LDX.w #!AU_CH
	JSR au_keep_loop
.place                        ; wanted loops onto idle channels, best first
	JSR au_best_loop
	CMP.b #$FF
	BEQ .done
	STA.w !au_tmp+11
	LDX.w #!AU_CH
	LDA.w !au_ch+!AU_CH+!c_kind
	BEQ .found
	LDX.w #$0000
	LDA.w !au_ch+!c_kind
	BEQ .found
.done
	RTS
.found
	LDA.w !au_tmp+11
	JSR au_start_loop
	BRA .place

; X = channel: a playing loop stops when no longer wanted, else follows the
; requested level and rate.
au_keep_loop:
	LDA.w !au_ch+!c_kind,X
	CMP.b #$02
	BNE .ret
	REP #$20
	LDA.w !au_ch+!c_cue,X
	AND.w #$0003
	TAY
	SEP #$20
	LDA.w !au_lvl,Y
	BNE .wanted
	JMP au_stop_channel
.wanted
	JMP au_loop_apply
.ret
	RTS

; X = channel playing loop Y: VOL and PITCH follow the requested level and
; rate (records only when they change).
au_loop_apply:
	LDA.w !au_lvl,Y
	CMP.w !au_ch+!c_lvl,X
	BEQ .rate
	STA.w !au_ch+!c_lvl,X
	STA.w !au_tmp+12          ; VOL = cue volume × level / 256
	STZ.w !au_tmp+13
	LDA.w !au_ch+!c_vol,X
	JSR au_mul8
	XBA
	STA.w !au_ch+!c_voll,X
	STA.w !au_ch+!c_volr,X
	LDA.w !au_ch+!c_ctl,X
	ORA.b #!CTL_VOL
	STA.w !au_ch+!c_ctl,X
.rate
	LDA.w !au_rate,Y
	CMP.w !au_ch+!c_rate,X
	BEQ .ret
	STA.w !au_ch+!c_rate,X
	REP #$20                  ; PITCH = $0600 × rate / $80 = rate × 12
	AND.w #$00FF
	ASL : ASL
	STA.w !au_tmp+12
	ASL
	CLC
	ADC.w !au_tmp+12
	STA.w !au_ch+!c_pitch,X
	SEP #$20
	LDA.w !au_ch+!c_ctl,X
	ORA.b #!CTL_PITCH
	STA.w !au_ch+!c_ctl,X
.ret
	RTS

; A8 × word at au_tmp+12 → C16 (shift-add; the hardware multiplier stays free
; for whoever else uses it, interrupt handlers included).
au_mul8:
	PHY
	STA.w !au_tmp+14
	REP #$20
	LDA.w #$0000
	LDY.w #$0008
-	ASL
	SEP #$20
	ASL.w !au_tmp+14
	REP #$20
	BCC +
	CLC
	ADC.w !au_tmp+12
+	DEY
	BNE -
	SEP #$20
	PLY
	RTS

; → A = the most important wanted loop not playing yet ($FF: none).
au_best_loop:
	LDA.b #$FF
	STA.w !au_tmp+9
	STZ.w !au_tmp+10
	LDY.w #$0000
.scan
	LDA.w !au_lvl,Y
	BEQ .skip
	LDX.w #$0000
	JSR .playing
	BCS .skip
	LDX.w #!AU_CH
	JSR .playing
	BCS .skip
	PHX
	REP #$20
	TYA
	ASL : ASL
	TAX
	SEP #$20
	LDA.l audio_loop_table+2,X
	PLX
	CMP.w !au_tmp+10
	BCC .skip
	BEQ .skip
	STA.w !au_tmp+10
	TYA
	STA.w !au_tmp+9
.skip
	INY
	CPY.w #$0004
	BNE .scan
	LDA.w !au_tmp+9
	RTS
.playing                      ; carry set if channel X plays loop Y
	LDA.w !au_ch+!c_kind,X
	CMP.b #$02
	BNE .no
	TYA
	CMP.w !au_ch+!c_cue,X
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; A = loop id, X = channel.
au_start_loop:
	STA.w !au_ch+!c_cue,X
	LDA.b #$02
	STA.w !au_ch+!c_kind,X
	STZ.w !au_ch+!c_prio,X
	REP #$20
	LDA.w #!AUDIO_STREAM_PITCH
	STA.w !au_ch+!c_pitch,X
	LDA.w !au_ch+!c_cue,X
	AND.w #$0003
	ASL : ASL
	PHX
	TAX
	SEP #$20
	LDA.l audio_loop_table+1,X
	STA.w !au_tmp+7
	LDA.l audio_loop_table+0,X   ; clip
	PLX
	PHA
	LDA.w !au_tmp+7
	STA.w !au_ch+!c_vol,X
	STA.w !au_ch+!c_voll,X
	STA.w !au_ch+!c_volr,X
	STZ.w !au_ch+!c_lvl,X     ; take the requested level and rate now
	STZ.w !au_ch+!c_rate,X
	REP #$20
	LDA.w !au_ch+!c_cue,X
	AND.w #$0003
	TAY
	SEP #$20
	JSR au_loop_apply
	PLA
	JMP au_start_clip

; ---------------------------------------------------------------- streams
; A = clip id, X = channel: reset its ring and queue START, VOL and PITCH.
au_start_clip:
	PHA
	LDA.b #$07
	STA.w !au_ch+!c_limit,X
	LDA.w !au_ch+!c_infl,X    ; skip the slot an old stream may still be
	BEQ .slot                 ; playing until the new KON
	LDA.w !au_ch+!c_wr,X
	SEC
	SBC.w !au_ch+!c_base,X
	SEC
	SBC.w !au_ch+!c_infl,X
	BPL +
	CLC : ADC.b #$07
+	INC
	CMP.b #$07
	BCC +
	SBC.b #$07
+	CLC
	ADC.w !au_ch+!c_base,X
	STA.w !au_ch+!c_wr,X
	LDA.b #$06
	STA.w !au_ch+!c_limit,X
.slot
	STZ.w !au_ch+!c_sent,X
	STZ.w !au_ch+!c_infl,X
	PLA
	PHX                       ; clip entry: addr.w bank.b loop.b chunks.w pad.w
	REP #$20
	AND.w #$00FF
	ASL : ASL : ASL
	TAX
	LDA.l audio_clip_table+0,X
	STA.w !au_tmp+$10
	LDA.l audio_clip_table+2,X
	STA.w !au_tmp+$12
	LDA.l audio_clip_table+4,X
	STA.w !au_tmp+$14
	PLX
	LDA.w !au_tmp+$10
	STA.w !au_ch+!c_src,X
	STA.w !au_ch+!c_lsrc,X
	LDA.w !au_tmp+$14
	STA.w !au_ch+!c_left,X
	STA.w !au_ch+!c_llen,X
	SEP #$20
	LDA.w !au_tmp+$12
	STA.w !au_ch+!c_src+2,X
	STA.w !au_ch+!c_lsrc+2,X
	LDA.w !au_tmp+$13
	STA.w !au_ch+!c_loop,X
	LDA.w !au_ch+!c_kind,X
	CMP.b #$02
	BEQ +
	LDA.w !au_ch+!c_voll,X
	STA.w !au_ch+!c_vol,X
+	LDA.b #!CTL_START|!CTL_VOL|!CTL_PITCH
	STA.w !au_ch+!c_ctl,X
	RTS

; Never make the frame late: only as many chunks as fit before
; !AU_LINE_LIMIT; a heavy frame sends fewer and the next one catches up (the
; 7-slot rings hold about two frames of sound; past that the voice plays
; silence, never stale data). Channel 0 gets at most half when both want
; more than fits. A8 X16.
au_budget:
	LDA.w !au_ch+!c_k
	ORA.w !au_ch+!AU_CH+!c_k
	BNE +
	RTS
+	JSR au_lines_left
	SEC
	SBC.b #!AU_CMD_LINES
	BCS +
	LDA.b #$00
+	LDY.w #$0000              ; chunks that fit = lines / !AU_CHUNK_LINES
-	CMP.b #!AU_CHUNK_LINES
	BCC +
	SBC.b #!AU_CHUNK_LINES
	INY
	BRA -
+	TYA
	STA.w !au_tmp+$0F
	LDA.w !au_ch+!c_k
	CLC
	ADC.w !au_ch+!AU_CH+!c_k
	CMP.w !au_tmp+$0F
	BCC .ok
	BEQ .ok
	LDA.w !au_tmp+$0F
	INC
	LSR                       ; channel 0: at most (budget + 1) / 2
	CMP.w !au_ch+!c_k
	BCS +
	STA.w !au_ch+!c_k
+	LDA.w !au_tmp+$0F         ; channel 1: what is left
	SEC
	SBC.w !au_ch+!c_k
	CMP.w !au_ch+!AU_CH+!c_k
	BCS .ok
	STA.w !au_ch+!AU_CH+!c_k
.ok
	RTS

; A = scanlines left before !AU_LINE_LIMIT (0 when past it or in vblank).
au_lines_left:
	LDA.l $00213F             ; reset the counter read flip-flops
	LDA.l $002137             ; latch H/V
	LDA.l $00213D             ; V low
	XBA
	LDA.l $00213D             ; V bit 8 (bits 1-7 open bus)
	AND.b #$01
	BNE .none
	XBA
	CMP.b #!AU_LINE_LIMIT
	BCS .none
	EOR.b #$FF
	SEC
	ADC.b #!AU_LINE_LIMIT
	RTS
.none
	LDA.b #$00
	RTS

; How many chunks each channel sends this frame.
au_plan:
	LDX.w #$0000
	JSR .one
	LDX.w #!AU_CH
.one
	STZ.w !au_ch+!c_k,X
	LDA.w !au_ch+!c_kind,X
	BEQ .ret
	REP #$20
	LDA.w !au_ch+!c_left,X
	SEP #$20
	BEQ .ret                  ; one-shot fully sent
	LDA.w !au_ch+!c_limit,X
	SEC
	SBC.w !au_ch+!c_infl,X
	BCC .ret
	BEQ .ret
	STA.w !au_tmp
	LDA.w !au_ch+!c_ctl,X
	AND.b #!CTL_START
	BEQ +
	LDA.b #!AU_FIRST
	BRA ++
+	LDA.b #!AU_BUDGET
++	CMP.w !au_tmp
	BCC +
	LDA.w !au_tmp
+	STA.w !au_ch+!c_k,X
	LDA.w !au_ch+!c_loop,X    ; a one-shot sends no more than it has
	BNE +
	LDA.w !au_ch+!c_left+1,X
	BNE +
	LDA.w !au_ch+!c_left,X
	CMP.w !au_ch+!c_k,X
	BCS +
	STA.w !au_ch+!c_k,X
+	LDA.b #$07
	STA.w !au_ch+!c_limit,X
.ret
	RTS

; ---------------------------------------------------------------- transfer
; Count the groups, then send command $8A with every record.
au_send:
	LDA.w !au_backoff
	BEQ +
	DEC
	STA.w !au_backoff
	RTS
+	STZ.w !au_groups
	LDX.w #$0000
	JSR .count
	LDX.w #!AU_CH
	JSR .count
	LDA.w !au_groups
	BNE +
	RTS
+	JSR au_lines_left         ; too late in the frame even for the command:
	CMP.b #!AU_CMD_LINES      ; try again next frame
	BCS +
	RTS
+	STA.w !au_tmp+$05         ; bounds the echo wait
	STZ.w !au_tmp+$15         ; set when chunks are left for the next frame
	LDA.w !au_groups
	STA.l $002141
	LDA.b #$8A
	STA.l $002140
	JSR au_wait_cmd
	BCC +
	RTS
+	LDA.b #$20                ; counters run $20-$7F
	STA.w !au_cnt
	LDX.w #$0000
	JSR au_send_channel
	BCS .ret
	LDX.w #!AU_CH
	JSR au_send_channel
	BCS .ret
	LDA.w !au_tmp+$15         ; fewer groups than announced: end record
	BEQ +
	STZ.w !au_tmp+$10
	STZ.w !au_tmp+$11
	STZ.w !au_tmp+$12
	JSR au_group
	BCS .ret
+	JSR au_end                ; end group, acknowledged after processing
	BCS .ret
	LDA.b #$00
	STA.l $002140
	JSR au_wait_a
.ret
	RTS
.count
	LDA.w !au_ch+!c_ctl,X
	LDY.w #$0004
-	LSR
	BCC +
	INC.w !au_groups
+	DEY
	BNE -
	LDA.w !au_ch+!c_k,X       ; 13 groups per chunk: 8k + 4k + k
	STA.w !au_tmp
	ASL : ASL
	STA.w !au_tmp+1
	ASL
	CLC
	ADC.w !au_tmp+1
	CLC
	ADC.w !au_tmp
	CLC
	ADC.w !au_groups
	STA.w !au_groups
	RTS

; Wait until port 0 reads A. Carry set on timeout (streams then stay off).
au_wait_a:
	PHY
	LDY.w #$0000
-	CMP.l $002140
	BEQ .ok
	DEY
	BNE -
	LDA.w !au_flags
	ORA.b #$40
	STA.w !au_flags
	PLY
	SEC
	RTS
.ok
	PLY
	CLC
	RTS

; The command's echo. The driver answers within one pass of its main loop
; unless it is busy elsewhere; then withdraw the command (port 0 = 0: the
; extension cancels it if it already took it) and try again 2 frames later
; (4, 8, … 128 after further misses). Nothing was sent yet, so every pending
; record stays pending. After a miss the next tries only probe briefly, so a
; driver that is busy for long (or a dead APU in an imported test state)
; costs little.
au_wait_cmd:
	PHY
	PHA                       ; the command byte to see echoed
	LDA.w !au_tmp+$05         ; at most until the frame's line limit:
	REP #$20                  ; ~15 tries per scanline
	AND.w #$00FF
	PHA
	ASL : ASL : ASL : ASL
	SEC
	SBC $01,S
	PLY
	TAY
	SEP #$20
	CPY.w #!AU_CMD_WAIT
	BCC +
	LDY.w #!AU_CMD_WAIT
+	LDA.w !au_misses          ; after a miss only a short probe
	BEQ +
	CPY.w #!AU_PROBE_WAIT
	BCC +
	LDY.w #!AU_PROBE_WAIT
+	PLA
-	CMP.l $002140
	BEQ .ok
	DEY
	BNE -
	LDA.b #$00
	STA.l $002140
	LDA.w !au_misses
	INC
	BEQ +
	STA.w !au_misses
+	LDA.w !au_misses          ; retry after 2, 4, … 128 frames
	CMP.b #$07
	BCC +
	LDA.b #$07
+	STA.w !au_tmp
	LDA.b #$01
-	ASL
	DEC.w !au_tmp
	BNE -
	STA.w !au_backoff
	PLY
	SEC
	RTS
.ok
	STZ.w !au_misses
	PLY
	CLC
	RTS

; The end group. The extension acknowledges it with counter | $80 once the
; records are processed; an unextended driver (an imported browser state)
; echoes the counter like any command: then streams cannot play, and the
; module switches them off (au_flags bit 6) instead of feeding the void.
au_end:
	LDA.w !au_cnt
	STA.l $002140
	ORA.b #$80
	STA.w !au_tmp+$05
	PHY
	LDY.w #$0000
-	LDA.l $002140
	CMP.w !au_tmp+$05
	BEQ .ok
	CMP.w !au_cnt
	BEQ .plain
	DEY
	BNE -
.plain
	LDA.w !au_flags
	ORA.b #$40
	STA.w !au_flags
.ok
	LDA.w !au_flags           ; the wanted transfer went out
	AND.b #$FD
	STA.w !au_flags
	PLY
	CLC
	RTS

; One control group from au_tmp+$10..$12; carry set on timeout.
au_group:
	LDA.w !au_tmp+$10
	STA.l $002141
	LDA.w !au_tmp+$11
	STA.l $002142
	LDA.w !au_tmp+$12
	STA.l $002143
au_group0:
	LDA.w !au_cnt
	STA.l $002140
	JSR au_wait_a
	BCS .ret
	LDA.w !au_cnt
	INC
	CMP.b #$80
	BCC +
	LDA.b #$20
+	STA.w !au_cnt
	CLC
.ret
	RTS

; X = channel: its records (STOP, START, VOL, PITCH, then chunks).
au_send_channel:
	TXA
	BEQ +
	LDA.b #$01
+	STA.w !au_tmp+$13         ; channel number
	LDA.w !au_ch+!c_ctl,X
	STA.w !au_tmp+$14
	STZ.w !au_ch+!c_ctl,X
	LDA.w !au_tmp+$14
	AND.b #!CTL_STOP
	BEQ .start
	LDA.b #$50
	JSR .head
	STZ.w !au_tmp+$11
	STZ.w !au_tmp+$12
	JSR au_group
	BCS .ret
.start
	LDA.w !au_tmp+$14
	AND.b #!CTL_START
	BEQ .vol
	LDA.b #$20
	JSR .head
	LDA.w !au_ch+!c_wr,X
	STA.w !au_tmp+$11
	STZ.w !au_tmp+$12
	JSR au_group
	BCS .ret
.vol
	LDA.w !au_tmp+$14
	AND.b #!CTL_VOL
	BEQ .pitch
	LDA.b #$30
	JSR .head
	LDA.w !au_ch+!c_voll,X
	STA.w !au_tmp+$11
	LDA.w !au_ch+!c_volr,X
	STA.w !au_tmp+$12
	JSR au_group
	BCS .ret
.pitch
	LDA.w !au_tmp+$14
	AND.b #!CTL_PITCH
	BEQ .data
	LDA.b #$40
	JSR .head
	LDA.w !au_ch+!c_pitch,X
	STA.w !au_tmp+$11
	LDA.w !au_ch+!c_pitch+1,X
	STA.w !au_tmp+$12
	JSR au_group
	BCS .ret
.data
	LDA.w !au_ch+!c_k,X
	BEQ .done
	JSR au_lines_left         ; a chunk only while it fits in this frame
	CMP.b #!AU_CHUNK_LINES
	BCC .late
	JSR au_send_chunk
	BCS .ret
	DEC.w !au_ch+!c_k,X
	BRA .data
.late
	STZ.w !au_ch+!c_k,X
	LDA.b #$01
	STA.w !au_tmp+$15
.done
	CLC
.ret
	RTS
.head
	ORA.w !au_tmp+$13
	STA.w !au_tmp+$10
	RTS

; X = channel: one DATA record (header + 12 groups read from c_src).
au_send_chunk:
	LDA.b #$10
	ORA.w !au_tmp+$13
	STA.w !au_tmp+$10
	LDA.w !au_ch+!c_wr,X
	STA.w !au_tmp+$11
	STZ.w !au_tmp+$12
	LDA.w !au_ch+!c_loop,X    ; the last chunk of a one-shot is final
	BNE +
	REP #$20
	LDA.w !au_ch+!c_left,X
	CMP.w #$0001
	SEP #$20
	BNE +
	INC.w !au_tmp+$12
+	JSR au_group
	BCC +
	RTS
+	PHX
	PHB
	LDA.w !au_ch+!c_src+2,X
	PHA
	LDA.w !au_cnt
	STA.l $7E0000+!au_tmp+$16
	REP #$20
	LDA.w !au_ch+!c_src,X
	TAX
	SEP #$20
	PLB                       ; DB = clip bank for the reads below
	LDY.w #$000C
.grp
	LDA.w $0000,X : STA.l $002141 : INX
	LDA.w $0000,X : STA.l $002142 : INX
	LDA.w $0000,X : STA.l $002143 : INX
	LDA.l $7E0000+!au_tmp+$16
	STA.l $002140
	PHY
	LDY.w #$0000
-	CMP.l $002140
	BEQ +
	DEY
	BNE -
	PLY
	PLB
	PLX
	LDA.w !au_flags
	ORA.b #$40
	STA.w !au_flags
	SEC
	RTS
+	PLY
	INC
	CMP.b #$80
	BCC +
	LDA.b #$20
+	STA.l $7E0000+!au_tmp+$16
	DEY
	BNE .grp
	PLB
	PLX
	STA.w !au_cnt
	REP #$20                  ; src += 36; left -= 1; loops wrap
	LDA.w !au_ch+!c_src,X
	CLC
	ADC.w #36
	STA.w !au_ch+!c_src,X
	DEC.w !au_ch+!c_left,X
	BNE .ring
	LDA.w !au_ch+!c_loop,X
	AND.w #$00FF
	BEQ .ring
	LDA.w !au_ch+!c_lsrc,X
	STA.w !au_ch+!c_src,X
	LDA.w !au_ch+!c_llen,X
	STA.w !au_ch+!c_left,X
.ring
	SEP #$20
	LDA.w !au_ch+!c_wr,X      ; next slot of the ring
	SEC
	SBC.w !au_ch+!c_base,X
	INC
	CMP.b #$07
	BCC +
	LDA.b #$00
+	CLC
	ADC.w !au_ch+!c_base,X
	STA.w !au_ch+!c_wr,X
	LDA.w !au_ch+!c_sent,X
	INC
	AND.b #$07
	STA.w !au_ch+!c_sent,X
	INC.w !au_ch+!c_infl,X
	CLC
	RTS

; ---------------------------------------------------------------- echo
; C3:060A sends a song's echo parameters from the 16 presets at C3:0708
; (index = p2 low nibble). Songs $3B-$3F take theirs from audio_echo_table
; instead; the four table reads are replaced (A8 X16, D = $1E00, $05 = song).
audio_echo0:
	LDA $05
	CMP.b #$3B
	BCC +
	CMP.b #$40
	BCC ++
+	LDA.l $C30708,X
	RTL
++	PHX
	JSR audio_echo_x
	LDA.l audio_echo_table+0,X
	PLX
	RTL
audio_echo1:
	LDA $05
	CMP.b #$3B
	BCC +
	CMP.b #$40
	BCC ++
+	LDA.l $C30709,X
	RTL
++	PHX
	JSR audio_echo_x
	LDA.l audio_echo_table+1,X
	PLX
	RTL
audio_echo2:
	LDA $05
	CMP.b #$3B
	BCC +
	CMP.b #$40
	BCC ++
+	LDA.l $C3070A,X
	RTL
++	PHX
	JSR audio_echo_x
	LDA.l audio_echo_table+2,X
	PLX
	RTL
audio_echo3:
	LDA $05
	CMP.b #$3B
	BCC +
	CMP.b #$40
	BCC ++
+	LDA.l $C3070B,X
	RTL
++	PHX
	JSR audio_echo_x
	LDA.l audio_echo_table+3,X
	PLX
	RTL
; A = song $3B-$3F → X = (song - $3B) * 4. B (the high byte of C) holds the
; loader's handshake counter (C3 code keeps it there with XBA): keep it.
audio_echo_x:
	SEC
	SBC.b #$3B
	ASL : ASL
	XBA                       ; A = counter, B = index
	PHA
	LDA.b #$00
	XBA                       ; C = 00:index
	TAX
	PLA
	XBA                       ; B = counter again
	RTS

; ---------------------------------------------------------------- tests
; !au_test = op | arg<<8: 1 shot, 2 voice, 3 song, 4 stop all, 5 loop on
; (arg = loop id; kept on every frame), 6 loop off, 7 fade, 8 native effect
; 02 arg 0F 88, 9 restore the native song. A8 X16.
audio_test_poll:
	LDA.w !au_testloop
	BEQ +
	DEC
	REP #$30
	AND.w #$0003
	LDX.w #$00FF
	LDY.w #$0080
	JSL audio_loop
	SEP #$20
+	LDA.w !au_test
	BNE +
	RTS
+	STA.w !au_tmp+$1E         ; op
	LDA.w !au_test+1
	STA.w !au_tmp+$1F         ; arg
	STZ.w !au_test
	STZ.w !au_test+1
	LDA.w !au_tmp+$1E
	CMP.b #$01
	BNE +
	LDA.w !au_tmp+$1F
	JSL audio_sfx
	RTS
+	CMP.b #$02
	BNE +
	LDA.w !au_tmp+$1F
	JSL audio_voice
	RTS
+	CMP.b #$03
	BNE +
	REP #$30
	LDA.w !au_tmp+$1F
	AND.w #$00FF
	LDX.w #$0000
	JSL audio_song
	SEP #$20
	RTS
+	CMP.b #$04
	BNE +
	JSL audio_stop
	RTS
+	CMP.b #$05
	BNE +
	LDA.w !au_tmp+$1F
	INC
	STA.w !au_testloop
	RTS
+	CMP.b #$06
	BNE +
	STZ.w !au_testloop
	RTS
+	CMP.b #$07
	BNE +
	LDA.w !au_tmp+$1F
	JSL audio_fade
	RTS
+	CMP.b #$08
	BNE +
	REP #$30                  ; native effect: 02 id 0F 88
	LDA.w !au_tmp+$1F
	AND.w #$00FF
	XBA
	ORA.w #$0002
	LDX.w #$880F
	JSL core_sound_queue
	SEP #$20
	RTS
+	CMP.b #$09
	BNE +
	JSL audio_song_restore
+	RTS

incsrc "native.asm"
incsrc "rare.asm"

audio_code_end:
assert audio_code_end <= !CODE_QUARTER_AUDIO, "audio code overflow (EA:C000-FFFF is a spare quarter, core/layout.asm)"
pullpc

; ---------------------------------------------------------------- patches
incsrc "resident.asm"
; Driver upload end (C3:0106 LDY #$0200 / STY $2142).
; The extension is resident from boot; shipping only feeds three rare lines.
%orig4($C30106, $8C0200A0)
%orig2($C3010A, $2142)
%hijack($C30106, audio_boot_upload, 6, audio)
if not(defined("AUDIO_PCM"))
; Native resident effects need no data transfer. Finish their port echo
; on a later frame instead of busy-waiting in the gameplay thread.
%orig4($C30175, $00A520E2)
%hijack($C30175, audio_native_command, 4, audio)
endif
; Echo parameter reads in C3:060A (LDA $C30708..B,X).
%orig4($C30618, $C30708BF)
%hijack_jsl($C30618, audio_echo0, 4, audio)
%orig4($C30651, $C30709BF)
%hijack_jsl($C30651, audio_echo1, 4, audio)
%orig4($C30663, $C3070ABF)
%hijack_jsl($C30663, audio_echo2, 4, audio)
%orig4($C3066A, $C3070BBF)
%hijack_jsl($C3066A, audio_echo3, 4, audio)
