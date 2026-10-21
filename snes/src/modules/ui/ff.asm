; R fast-forward (engine/scene-fast-forward.js), field frames. Included in
; the UI code bank.
;
; Holding R (without L) during a scene hides R from the game and confirms
; prose with a B pulse on two of every eight frames, as the browser's input
; filter does; a window that holds a choice (story_api_window_has_choice,
; the event-stream scan) is never confirmed. The browser also runs these
; frames up to 12x faster; ff-text.asm instead uploads/reveals prepared
; lines in batches. Frieza's input lock / orbit intro also checks choices.
; Story's reference copy (-DSTORY_FAST_FORWARD) replaces this one, so two
; modules never inject B.
;
; A scene: an event runs ($D0), the screen is not fading ($E4), no menu
; ($EC & $7E). Prose: the interpreter's text engine ($D0 = $81) or a wait
; for a button ($D0 = $83).

!ui_ff_ptr    = !RAM_UI+$A6   ; word: low word of the window last scanned
!ui_ff_state  = !RAM_UI+$A8   ; word: bank of that window | bit 8 scanned | bit 9 choice

ui_fast_forward:
if defined("STORY_FAST_FORWARD")
	RTS
else
	LDA.l !core_pad
	AND.w #!PAD_R|!PAD_L
	CMP.w #!PAD_R
	BEQ .held
.off
	STZ.w !ui_ff_state&$FFFF
	RTS
.off8
	REP #$20
	BRA .off
.held
if defined("UI_HAVE_STORY")
	; Frieza's input lock / orbit intro: still leave every choice to the
	; player, including choices encountered during a locked scene.
	LDA.w #!STORY_Q_FRIEZA_INPUT_LOCKED
	JSR ui_story_query
	BEQ .scene
	SEP #$20
	LDA.w $00D0
	CMP.b #$81
	BEQ .locked
	CMP.b #$83
	BNE .off8m
.locked
	REP #$20
	BRA .prose
.off8m
	REP #$20
	BRA .mask
.scene
endif
	SEP #$20
	LDA.w $00D0
	BEQ .off8
	LDA.w $00E4
	BEQ .off8
	LDA.w $00EC
	AND.b #$7E
	BNE .off8
	LDA.w $00D0
	CMP.b #$81
	BEQ .prose
	CMP.b #$83
	BEQ .prose
	REP #$20
	STZ.w !ui_ff_state&$FFFF          ; scripted motion: R hidden, nothing to confirm
	BRA .mask
.prose
	REP #$20
	; scan the window again when the event pointer moved
	LDA.w $00D3
	AND.w #$00FF
	ORA.w #$0100
	STA.w !ui_tmp0&$FFFF              ; bank | scanned
	LDA.w !ui_ff_state&$FFFF
	AND.w #$01FF
	CMP.w !ui_tmp0&$FFFF
	BNE .scan
	LDA.w $00D1
	CMP.w !ui_ff_ptr&$FFFF
	BEQ .known
.scan
	LDA.w $00D1
	STA.w !ui_ff_ptr&$FFFF
if defined("UI_HAVE_STORY")
	JSL story_api_window_has_choice   ; carry set: a choice, or unknown
else
	SEC                               ; no scanner: never confirm
endif
	LDA.w #$0000
	BCC +
	LDA.w #$0200
+	ORA.w !ui_tmp0&$FFFF
	STA.w !ui_ff_state&$FFFF
.known
	LDA.w !ui_ff_state&$FFFF
	AND.w #$0200
	BNE .mask                         ; a choice: R hidden, the player answers
.pulse
	LDA.l !core_frame
	AND.w #$0007
	CMP.w #$0002
	BCS .mask
	LDA.l !core_pad_inject
	ORA.w #!PAD_B
	STA.l !core_pad_inject
.mask
	LDA.l !core_pad_mask
	ORA.w #!PAD_R
	STA.l !core_pad_mask
	RTS
endif
