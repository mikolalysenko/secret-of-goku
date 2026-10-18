; Finale death (engine/boss-rush-death.js, planet-view.js fatal views): the
; native collapse plays (0-300), the picture fades out (300-360) and stays
; black while the space stage loads (360-408), the night globe fades in
; (408-456) and shakes (540-576), explodes (576: seams; 624: blast), the
; sky fades (780-840) and GAME OVER shows from 900; Start returns to the
; title. Events 7FF (death warp), 42D and 42F (boss victories) are held
; off meanwhile (fatal_event_gate).
!FT_REVERT  = 18
!FT_FADE    = 300
!FT_BLACK   = 360
!FT_PLANET  = 408
!FT_RUPTURE = 576
!FT_BLAST   = 624
!FT_FADEOUT = 780
!FT_GAMEOVER = 900

!ft_stage   = !s_var+$4C   ; word  space stage started (FAM_SPACE)
!ft_card    = !s_var+$4E   ; word  GAME OVER card in BG1

start_fatal:
	SEP #$20
	LDA.b #$00
	STA.l !ending_live
	LDA.b #!FAM_BLACK
	STA.w !s_family
	LDA.b #$00
	STA.w !s_fullscreen
	STA.w !s_regson
	LDA.l !ending_status
	ORA.b #!ES_ACTIVE|!ES_DEFEATED|!ES_MUTED
	STA.l !ending_status
	REP #$30
	LDA.w #$00FF
	STA.w !s_ebright
	STZ.w !ft_stage
	STZ.w !ft_card
	RTS

frame_fatal:
	REP #$30
	; the dead party takes no input; at GAME OVER, Start returns to the title
	LDA.w #$FFF0
	STA.l !core_pad_mask
	LDA.l !ending_age
	CMP.w #!FT_REVERT
	BNE .noRevert
	LDA.l !ending_flags
	AND.w #!EF_GOLD
	BEQ .noRevert
	LDA.w #$0000
	JSL goku_api_set_form
	REP #$30
	LDA.w #!ESFX_REVERT
	JSR fatal_sfx
.noRevert
	LDA.l !ending_age
	CMP.w #!FT_FADE
	BCS .fading
	RTS                       ; the native collapse
.fading
	CMP.w #!FT_BLACK
	BCS .stage
	; brightness ceiling 15 * (360 - age) / 60
	EOR.w #$FFFF
	SEC
	ADC.w #!FT_BLACK
	LDY.w #4
	JSR div_a_y               ; (360 - age) / 4 = 15 * (360 - age) / 60
	STA.w !s_ebright
	RTS
.stage
	; the planet view is ours: the game's own death fade-out ($E6) must not
	; darken it (planet-view draws over the native brightness)
	SEP #$20
	LDA.w !N_BRIGHT
	BMI .blank
	LDA.b #$0F
	STA.w !N_BRIGHT
.blank
	REP #$20
	LDA.w !ft_stage
	BNE .live
	; the stage loads under the black picture
	LDA.w #$0001
	STA.w !ft_stage
	LDA.w #!SPB_NIGHT
	JSR space_load
	JSR space_phase_init
	REP #$30
	LDA.w #$0100
	STA.w !s_fadeb
	RTS
.live
	LDA.l !ending_age
	CMP.w #!FT_PLANET
	BCS .planet
	; still black
	JSR oam_begin
	JSR space_globe_layers
	JSR fatal_layers
	LDA.w #$0100
	STA.w !s_fadeb
	RTS
.planet
	BNE .notOrb
	LDA.w #!ESFX_FRIEZAORB
	JSR fatal_sfx
.notOrb
	LDA.l !ending_age
	CMP.w #!FT_RUPTURE
	BCS .explode
	; the night globe; light (age - 408) / 48 over 408-456
	JSR oam_begin
	JSR space_globe_layers
	JSR fatal_layers
	JSR space_sky
	; shake for the last 36 frames before the rupture
	STZ.w !s_bg1h
	LDA.l !ending_age
	CMP.w #!FT_RUPTURE-35
	BCC .still
	AND.w #$0003
	CMP.w #$0002
	LDA.w #$0001
	BCC .shake
	LDA.w #$FFFF
.shake
	STA.w !s_bg1h
.still
	LDA.l !ending_age
	SEC
	SBC.w #!FT_PLANET
	CMP.w #48
	BCS .lit
	EOR.w #$FFFF
	SEC
	ADC.w #48                 ; 48 - (age - 408)
	XBA                       ; * 256
	LDY.w #48
	JSR div_a_y
	STA.w !s_fadeb
	RTS
.lit
	STZ.w !s_fadeb
	RTS
.explode
	CMP.w #!FT_GAMEOVER
	BCS .gameOver
	CMP.w #!FT_BLAST
	BNE .notBlast
	LDA.w #!ESFX_FORTRESS
	JSR fatal_sfx
	JSR space_queue_curtain   ; BG1 is free from here (the globe is gone)
.notBlast
	LDA.l !ending_age
	SEC
	SBC.w #!FT_RUPTURE
	JSR space_explode
	JSR fatal_layers
	; the sky fades over 780-840
	LDA.l !ending_age
	SEC
	SBC.w #!FT_FADEOUT
	BCC .bright
	CMP.w #60
	BCC .fadeOut
	LDA.w #$0100
	STA.w !s_fadeb
	RTS
.fadeOut
	XBA
	LDY.w #60
	JSR div_a_y               ; (age - 780) * 256 / 60
	STA.w !s_fadeb
	RTS
.bright
	RTS
.gameOver
	JSR oam_begin
	LDA.w !ft_card
	BNE .card
	; the card replaces BG1; the sky is black (the light is 0)
	LDA.w #$0001
	STA.w !ft_card
	LDA.w #ending_space_card_map
	STA.w !q_src
	SEP #$20
	LDA.b #ending_space_card_map>>16
	STA.w !q_src+2
	LDA.b #!LD_VRAM
	STA.w !q_mode
	REP #$20
	LDA.w #!SP_MAP1
	STA.w !q_dest
	LDA.w #$0800
	STA.w !q_size
	JSR queue_add
	LDA.w #!SPB_CARD
	STA.w !sp_bg1
	; backdrop and star shades black, card colours unlit
	LDA.w #$0000
	LDX.w #$0000
	JSR pal_store
	LDX.w #(7*16+1)*2
.stars
	LDA.w #$0000
	JSR pal_store
	INX : INX
	CPX.w #(7*16+5)*2
	BCC .stars
	SEP #$20
	LDA.b #$01
	TSB.w !s_paldirty
	LDA.l !ending_status
	ORA.b #!ES_COMPLETE
	STA.l !ending_status
	REP #$20
	JSR mark_done
.card
	STZ.w !s_fadeb
	STZ.w !s_bg1h
	SEP #$20
	LDA.b #$00
	STA.w !s_win
	STA.w !s_cgadsub
	STA.w !s_wobjsel
	STA.w !s_bg3cut
	LDA.b #$00                ; nothing until the card is in VRAM
	LDX.w !s_dqhead
	CPX.w !s_dqtail
	BNE .tm
	LDA.b #$01                ; BG1: the card
.tm
	STA.w !s_tm
	REP #$20
	; Start: back to the title (the cartridge's own reset entry)
	LDA.l !core_pad_new
	AND.w #$1000
	BEQ .wait
	SEP #$20
	LDA.b #$80
	STA.w $2100
	STZ.w $4200
	JML $C08004
.wait
	RTS

; The fatal views cover the dialogue too (planet-view view.fatal): no BG3,
; no line-170 cut.
fatal_layers:
	SEP #$20
	LDA.w !s_tm
	AND.b #~$04
	STA.w !s_tm
	LDA.b #$00
	STA.w !s_bg3cut
	REP #$20
	RTS

fatal_sfx:
	JMP ending_sound

; C1:E77E (inside the native event dispatcher C1:E77B, after REP #$30 /
; PHX; A = event id): replaced CMP #$0800 / BCS $E7C9. While the finale's
; fatal sequence runs, the death warp (7FF) and both boss-victory events
; (42D, 42F) return through the dispatcher's own PLX / RTS (C1:E7C4), as
; boss-rush-death.js installFinaleDeathGate does.
%orig4($C1E77E, $B00800C9)
%orig1($C1E782, $46)
%hijack_jsl($C1E77E, fatal_event_gate, 5, ending)
fatal_event_gate:
	CMP.w #$0800
	BCS .high
	PHA
	LDA.l !ending_status
	AND.w #!ES_DEFEATED
	BEQ .run
	LDA $01,S
	CMP.w #$07FF
	BEQ .skip
	CMP.w #$042D
	BEQ .skip
	CMP.w #$042F
	BEQ .skip
.run
	PLA
	RTL                       ; on at E783
.skip
	PLA
	PLA                       ; drop our JSL return address (3 bytes)
	SEP #$20
	PLA
	REP #$20
	JML $C1E7C4               ; PLX / RTS
.high
	STA.l !ending_tmp
	PLA                       ; drop our JSL return address (3 bytes)
	SEP #$20
	PLA
	REP #$20
	LDA.l !ending_tmp
	JML $C1E7C9               ; the original branch target (ids >= $800)
