; Aerial ki, the charged aerial Kamehameha and the Fortress route
; (engine/world-ki.js, engine/fortress-collapse.js startLandingMusic).

; Reached from world_loop_hook (top of the world loop, after vblank) once the
; planet cutaway ends: the crisis cue starts during the landing fade, then
; the Fortress's own docking ABI (C2:B1CA) lands on its deck through native
; landing record 10 (C0:8260). The damaged-deck follow-up is wf_finale.
world_fortress_landing:
	SEP #$20
	REP #$10
	LDA.b #$01
	STA.l $7E1E00
	LDA.b #$1B                       ; crisis cue (Thanatos's), as the browser
	STA.l $7E1E01
	LDA.b #$13
	STA.l $7E1E02
	LDA.b #$8F
	STA.l $7E1E03
	JSL $C30004
	SEP #$20
	LDA.b #$01
	STA.l $7E00E8
	LDA.l $7E00F2
	ORA.b #$80
	STA.l $7E00F2
	LDA.l !pw_flags
	ORA.b #!PWF_FINALE
	STA.l !pw_flags
	REP #$30
	LDA.w #$0000
	STA.l $7E0000|!w_land_queued
	TCD
	PEA $0000                        ; the world loop's DB
	PLB
	PLB
	LDX.w #$01FF
	TXS
	LDA.w #$000A
	JML $008260
