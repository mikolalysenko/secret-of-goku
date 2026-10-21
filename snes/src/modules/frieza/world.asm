; World flight (frieza.js tick(), the branches that run with mod.worldFlight):
; the Death Ball flyby over 1F04's sinking continent (frieza-flyby.js
; deathBallTiming) and the crisis's flight notification (Kai's sky warning
; once 1F04 ends in the overhead view). The escape (event D8) arms the
; flyby when the deck's Death Ball was thrown; its impact starts the
; crisis, its end gives Goku the eighth Ball's chase (tree pursuit).

; Flyby timeline (frieza-flyby.js deathBallTiming)
!FZY_ARRIVE   = 48
!FZY_GROW     = 64
!FZY_THROW    = 360
!FZY_IMPACT   = 404
!FZY_ANNOUNCE = 470
!FZY_DONE     = 560

; modules_world_frame: after combat, before UI and world drawing. M16/X16, DB = $7E, D = 0.
; Cache idle world work in WRAM; every story mutation's fz_wake clears it.
; The earlier draw dispatch otherwise puts two SRAM reads across HDMA.
frieza_world_frame:
	LDA !fz_wasidle
	BIT.w #!FZI_WORLD_IDLE
	BNE .idle
	LDA.l !fzp_flags
	AND.w #!FZFL_FLYBY|!FZFL_OUTDOOR
	BNE .work
	LDA.l !fzp_crisis
	AND.w #!FZC_ACTIVE|!FZC_NOTIFIED
	CMP.w #!FZC_ACTIVE
	BEQ .work
	SEP #$20
	LDA.b #!FZI_WORLD_IDLE
	TSB !fz_wasidle
	REP #$20
.idle
	RTL
.work
	JSR fz_on                         ; Goku active (the block guarded)
	BCC .out
	; the deck's arrival waits for the next visit by the field
	LDA.w #!FZFL_OUTDOOR
	JSR fz_flag
	BEQ +
	LDA.w #!FZFL_OUTDOOR
	JSR fz_clear
+	JSR fz_flyby_tick
	JSR fz_flyby_prepare
	JSR fz_flight_notice
.out
	RTL

; s.flyby: 1F04's flyby runs while $8C is set (it starts the scene); the
; age then counts every world frame until the timeline ends with $8C clear.
fz_flyby_tick:
	LDA.w #!FZFL_FLYBY
	JSR fz_flag
	BNE +
	RTS
+	LDA $8C
	AND.w #$00FF
	BEQ +
	LDA.w #!FZFL_FLYBY_GO
	JSR fz_flag
	BNE +
	LDA.w #!FZFL_FLYBY_GO
	JSR fz_set
+	LDA.w #!FZFL_FLYBY_GO
	JSR fz_flag
	BNE +
	RTS
+	LDA.l !fzp_flyby
	INC
	STA.l !fzp_flyby
	CMP.w #!FZY_ARRIVE
	BNE +
	JMP fz_laugh
+	CMP.w #!FZY_GROW
	BNE +
	LDA.w #!FZ_SFX_CHARGED
	JMP fz_sfx
+	CMP.w #!FZY_THROW
	BNE +
	LDA.w #!FZ_SFX_ORB
	JMP fz_sfx
+	CMP.w #!FZY_IMPACT
	BNE +
	; s.crisis = {...newCoreCrisis(), deathBall: true}
	SEP #$20
	LDA.b #!FZC_ON|!FZC_ACTIVE|!FZC_DEATHBALL
	STA.l !fzp_crisis
	REP #$20
	JSR fz_wake
	LDA.w #!FZ_SFX_FORTRESS
	JMP fz_sfx
+	CMP.w #!FZY_IMPACT+40
	BNE +
	LDA.w #!FZ_SFX_POWER_BURST
	JSR fz_sfx
	JMP fz_laugh
+	CMP.w #!FZY_ANNOUNCE
	BNE +
	JMP fz_bind_flyby_lines
+	CMP.w #!FZY_DONE
	BCS +
	RTS
+	LDA $8C
	AND.w #$00FF
	BEQ +
	RTS
+	; the end: the crisis stands (made now if the impact never ran), the
	; eighth Ball is Goku's, Frieza heads for the Tree
	LDA.l !fzp_crisis
	AND.w #!FZC_ON
	BNE +
	SEP #$20
	LDA.b #!FZC_ON|!FZC_ACTIVE|!FZC_DEATHBALL
	STA.l !fzp_crisis
	REP #$20
+	LDA.w #!FZFL_EIGHTH
	JSR fz_set
	LDA.w #!FZTR_PURSUIT
	JSR fz_set_tree
	LDA.w #!FZFL_FLYBY|!FZFL_FLYBY_GO
	JSR fz_clear
	LDA.w #$FFFF
	STA.l !fzp_flyby
	RTS

; The crisis in flight: once 1F04 has ended and the overhead map shows ($F2
; bit 7), ask the native camera transition (C0:8779) for the rear view
; ($F8 = $90, $CC bit 4), once; in the rear view (no transition: $F2 bits
; 0-1 clear) Kai's warning: the Death Ball's aftermath, or the core
; crisis's lines. Not during 1F04, a world fade ($FE & $C0) or a forced
; blank (INIDISP shadow $E6, which the world vblank writes).
fz_flight_notice:
	LDA.l !fzp_crisis
	AND.w #!FZC_ACTIVE|!FZC_NOTIFIED
	CMP.w #!FZC_ACTIVE
	BNE .out
	LDA $8C
	AND.w #$00FF
	BNE .out
	LDA $FE
	AND.w #$00C0
	BNE .out
	LDA $E6
	AND.w #$0080
	BNE .out
	LDA $F2
	AND.w #$0080
	BEQ .view
	LDA.l !fzp_crisis
	AND.w #!FZC_REAR
	BNE .out
	SEP #$20
	LDA.l !fzp_crisis
	ORA.b #!FZC_REAR
	STA.l !fzp_crisis
	LDA.b #$90
	STA $F8
	LDA.b #$10
	TSB $CC
	REP #$20
.out
	RTS
.view
	LDA $F2
	AND.w #$0003
	BNE .out
	SEP #$20
	LDA.l !fzp_crisis
	ORA.b #!FZC_NOTIFIED
	STA.l !fzp_crisis
	REP #$20
	LDA.l !fzp_crisis
	AND.w #!FZC_DEATHBALL
	JMP fz_bind_crisis_lines
