; Transition fade and holding pictures for phases whose scenes are still
; being ported: they keep the event script running on a black picture and
; mark their timeline done at once.

; Good ending: everything fades to black over 48 frames (shenron-ending
; 'transition'), then stays black until the vista is cued, also through
; the door to map 246. Only a brightness ceiling: the native picture,
; dialogue and map loader keep running.
start_transition:
	SEP #$20
	LDA.b #$00
	STA.l !ending_live
	LDA.b #!FAM_BLACK
	STA.w !s_family
	LDA.b #$00
	STA.w !s_fullscreen
	STA.w !s_regson
	LDA.l !ending_status
	ORA.b #!ES_ACTIVE
	STA.l !ending_status
	REP #$30
	LDA.w #$000F
	STA.w !s_ebright
	RTS

frame_transition:
	REP #$30
	LDA.l !ending_age
	CMP.w #48
	BCS .black
	EOR.w #$FFFF
	SEC
	ADC.w #48                 ; 48 - age
	STA.w !s_tmp
	ASL : ASL
	CLC
	ADC.w !s_tmp              ; * 5
	CLC
	ADC.w #$0008
	LSR : LSR : LSR : LSR     ; * 15 / 48, rounded
	STA.w !s_ebright
	RTS
.black
	STZ.w !s_ebright
	JMP mark_done

; Placeholder: black picture under the native dialogue.
hold_black:
	SEP #$20
	LDA.b #$00
	STA.l !ending_live
	LDA.b #!FAM_BLACK
	STA.w !s_family
	LDA.b #$00
	STA.w !s_fullscreen
	STA.w !s_regson
	LDA.l !ending_status
	ORA.b #!ES_ACTIVE
	STA.l !ending_status
	REP #$30
	STZ.w !s_ebright
	JMP mark_done

start_vista:
start_scatter:
start_depart:
	JMP hold_black

start_village:
	JMP release_screen

frame_summon:
frame_dragon:
frame_wish:
frame_scatter:
frame_village:
frame_depart:
	RTS
