; Native music while a scene is muted (second code area, $AA:C000).
; shenron-ending musicMuted: the scatter and the finale death play over a
; silent native song (ki-sound nativeGain 0). ES_MUTED drives the native
; music volume through audio_fade: $00 silences it at once, $0F brings it
; back to full at once when the scene lets go. A native song command
; (a map's music) sets its own volume, so the silence is re-sent every 32
; frames while muted.
; JSL from ending_frame on every field frame (any DB, M16/X16 or not).
; (ending_dma_guard below serves every frame-thread DMA of the module.)
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

; Frame-thread DMA (channel 7 to WMDATA: the palette commit and the
; OAM-buffer copies) must not have its set-up straddle the vblank NMI: the
; NMI fires at line 225 and the game's and the modules' vblank transfers
; reprogram channel 7, leaving its size at 0, so a trigger after them would
; copy 64 KiB. Called right before each set-up (a few dozen cycles to the
; trigger), it waits out lines 216-225; the NMI comes and goes meanwhile.
; JSL; any M/X; preserves A, X, Y, P and DB.
ending_dma_guard:
	PHP
	REP #$20
	PHA
.wait
	SEP #$20
	LDA.l $00213F                  ; reset the OPHCT/OPVCT flip-flops
	LDA.l $002137                  ; latch H/V
	LDA.l $00213D                  ; V low
	XBA
	LDA.l $00213D                  ; V bit 8 (bits 1-7 open bus)
	AND.b #$01
	XBA
	REP #$20
	CMP.w #216
	BCC .ok
	CMP.w #226
	BCC .wait
.ok
	PLA
	PLP
	RTL
