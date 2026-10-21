; Public entry points (docs/agents/snes-port/orbit.md, "API"). JSL, any M/X,
; DB and D preserved; exit M16/X16.

; orbit_api_defaults: the space preset's values in the inputs (quick-start.js
; 'space'): Frieza at 32,000 HP, the strike target from $128/$12A (2000
; when unset, as frieza.js), a fresh patrol clock and pattern.
orbit_api_defaults:
	PHP
	REP #$30
	LDA.w #32000
	STA.l !orbit_in_hp
	LDA.l $7E0128
	BNE +
	LDA.w #2000
+	STA.l !orbit_in_tx
	LDA.l $7E012A
	BNE +
	LDA.w #2000
+	STA.l !orbit_in_ty
	LDA.w #$0000
	STA.l !orbit_in_age
	STA.l !orbit_in_cycle
	STA.l !orbit_in_mhits
	STA.l !orbit_in_dodge
	STA.l !orbit_in_stun
	LDA.w #$FF9C                   ; lastImpact -100
	STA.l !orbit_in_limp
	LDA.w #$FF38                   ; lastMelee -200
	STA.l !orbit_in_lmel
	PLP
	REP #$30
	RTL

; orbit_api_enter: A16 = !OE_* mode. The orbit owns the picture from now
; (!orbit_flags bit 0); its scene starts in the orbit's own field frame,
; once the scene work area is its (orbit_claim: Frieza's fight hands it
; over), with art loading during ~12 vblanks with the screen black, then
; runs the orbit with Frieza's state from the inputs (frieza.js
; enterOrbit: Frieza at the first patrol node, clock 150, Goku's grace 60).
; Nothing is written to the scene work area here. Ignored while the orbit
; already runs or waits to start.
orbit_api_enter:
	PHP
	REP #$30
	PHA
	SEP #$20
	LDA.l !orbit_state
	ORA.l !orbit_enter
	BEQ +
	REP #$20
	PLA
	PLP
	REP #$30
	RTL
+	REP #$20
	PLA
	INC
	SEP #$20
	STA.l !orbit_enter
	LDA.l !orbit_flags
	ORA.b #!OF_ACTIVE
	STA.l !orbit_flags
	PLP
	REP #$30
	RTL

; The waiting entry (orbit_field_frame, DB = $32): once orbit_claim has
; the scene work area, the scene starts. M16/X16.
orbit_enter_try:
	JSR orbit_claim
	BCC +
	RTS                            ; another set piece holds it: next frame
+	LDA.l !orbit_enter
	AND.w #$00FF
	DEC
	PHA
	SEP #$20
	LDA.b #$00
	STA.l !orbit_enter
	REP #$20
	LDA.l !orbit_in_tx
	AND.w #$0FFF
	STA.w !cam_lon
	LDA.l !orbit_in_ty
	AND.w #$0FFF
	STA.w !cam_lat
	JSR orbit_start_test           ; fresh scene, loading
	LDA.l !orbit_in_hp
	LDX.w !cam_lon
	LDY.w !cam_lat
	JSR fight_start
	LDA.l !orbit_in_age : STA.w !b_age
	LDA.l !orbit_in_cycle : STA.w !b_cycle
	LDA.l !orbit_in_limp : STA.w !b_lastimp
	LDA.l !orbit_in_lmel : STA.w !b_lastmel
	LDA.l !orbit_in_mhits : STA.w !b_mhits
	LDA.l !orbit_in_dodge : STA.w !b_dodgecd
	LDA.l !orbit_in_stun : STA.w !b_stun
	; the intro (frieza-cinematic.js orbitIntroFrames) unless straight in;
	; the second surge's cinematic first (montage.asm) for !OE_SURGE: the
	; scene's load skips the globe's image (the pullback loads it)
	PLA
	STZ.w !f_intro
	CMP.w #!OE_FIGHT
	BEQ .fight
	PHA
	LDA.w #!ORBIT_INTRO_FRAMES
	STA.w !f_intro
	PLA
	CMP.w #!OE_SURGE
	BNE .fight
	JSL montage_start
	SEP #$20
	LDA.b #$08
	STA.l !orbit_load
	REP #$20
.fight
	JSR orbit_fight_on
	REP #$30
	RTS

; orbit_api_status -> A16 = !orbit_flags (bit 0 the orbit owns the picture,
; bit 1 live).
orbit_api_status:
	PHP
	REP #$30
	LDA.l !orbit_flags
	AND.w #$00FF
	PLP
	REP #$30
	RTL

; ---------------------------------------------------------------------------
; Debug scene select (snes/src/modules/debug): the 'orbit' and 'space'
; presets reach the orbit at their FRIEZA_PHASES hook (quick-start.js: the
; phase handoffs to space, then for 'space' intro 0 and guard 0). Called
; again (carry set) until the scene is live. A = kind, DB = $7E.
orbit_debug_space:
	LDY.w #!OE_FIGHT
	BRA orbit_debug_enter
orbit_debug_orbit:
	; (the orbit starts with its intro, where the browser's 'orbit' capture
	; is the second surge's start: its cinematic plays from the frieza
	; module's hand-off, !OE_SURGE)
	LDY.w #!OE_INTRO
orbit_debug_enter:
	CMP.w #!DEBUG_HOOK_FRIEZA_PHASES
	BNE .done
	SEP #$20
	LDA.l !orbit_state
	REP #$20
	BNE .wait
	PHY
	JSL orbit_api_defaults
	PLA
	JSL orbit_api_enter
	SEC
	RTL
.wait
	AND.w #$00FF
	CMP.w #!OS_LIVE
	BEQ .done
	SEC
	RTL
.done
	CLC
	RTL
