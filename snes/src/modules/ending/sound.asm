; Native music while a scene is muted (second code area, $AA:C000).
; shenron-ending musicMuted: the scatter and the finale death play over a
; silent native song (ki-sound nativeGain 0). ES_MUTED drives the native
; music volume through audio_fade: $00 silences it at once, $0F brings it
; back to full at once when the scene lets go. A native song command
; (a map's music) sets its own volume, so the silence is re-sent every 32
; frames while muted.
; JSL from ending_frame on every field frame (any DB, M16/X16 or not).
ending_music_sync:
	PHP
	SEP #$20
	LDA.l !ending_status
	AND.b #!ES_MUTED
	BEQ .open
	LDA.l !ending_mute
	INC
	BNE +
	LDA.b #$01                ; keep counting, never back to 0
+	STA.l !ending_mute
	DEC
	AND.b #$1F
	BNE .out                  ; first muted frame, then every 32
	REP #$30
	LDA.w #$0000
	BRA .fade
.open
	LDA.l !ending_mute
	BEQ .out
	LDA.b #$00
	STA.l !ending_mute
	REP #$30
	LDA.w #$000F
.fade
	JSL audio_fade
.out
	PLP
	RTL
