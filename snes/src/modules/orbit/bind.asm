; Orbit bindings to optional modules (the frieza module: its hand-off and
; its fight state). snes/src/modules.asm includes this file after every
; module, so the defined() checks see their defines whatever the include
; order; the code sits in the orbit's reserved area $A7:FC00-FFFF and is
; JSR-callable from the rest of the module (DB = $32, M16/X16 unless noted).

pushpc
org !CODE_ORBIT+$7C00
orbit_bind_start:

; frieza.js win(): the frieza module's stage goes to 'won'.
finale_bind_won:
if defined("FZFF_SPACE")
	JSL frieza_orbit_won
	REP #$30
endif
	RTS

; frieza.js 'won' tick at victoryTiming.landed: the victory event (F.victory,
; C7) once Goku can act. The frieza module requests it itself after
; frieza_orbit_landed; without it the orbit does.
orbit_bind_landed:
if defined("FZFF_SPACE")
	JSL frieza_orbit_landed
	REP #$30
	SEC
	RTS
else
	LDA.w #$00C7
	LDX.w #$0000
	JSL story_api_request
	REP #$30
	RTS
endif

; returnToFortress's landing test (scene.asm orbit_land_search): A16 = x,
; X16 = y. C set where Goku can land: flight's canLand at the terrain the
; fight recorded (frieza.js b.terrain: the frieza module's), else at his
; own; without the flight module, everywhere. (frieza.js also asks
; floorHole: the frieza module answers it while the fight is on the deck
; only; orbit.md, Requests.)
orbit_bind_can_land:
if defined("FLIGHT_API_CAN_LAND_T")
if defined("fzf_terrain")
	PHA
	LDA.l $7E0000|!fzf_terrain
	TAY
	PLA
	JSL !FLIGHT_API_CAN_LAND_T
else
	JSL !FLIGHT_API_CAN_LAND
endif
	REP #$30
	RTS
else
	SEC
	RTS
endif

; mana-mod.js flightTransition {kind: 'landing'} (returnToFortress): the
; world module's landing pose, which plays while the deck fades in. Its
; transition word stands in for an API (orbit.md, Requests).
orbit_bind_landing:
if defined("WORLD_API_LANDING")
	JSL !WORLD_API_LANDING
	REP #$30
elseif defined("TRANS_LANDING")
	LDA.w #!TRANS_LANDING
	STA.l $7E0000|!w_trans_kind
	LDA.w #$0000
	STA.l $7E0000|!w_trans_age
endif
	RTS

if defined("FZFF_SPACE")
; !FRIEZA_ORBIT_SURGE (frieza module, every frame of the second surge; JSL,
; DB = $7E, M16/X16): A16 = surge age, X16/Y16 = the strike target (the
; Fortress's screen position), Frieza's ground state in the frieza
; module's block. Up to collateralStart the surge plays on the deck (the
; frieza module draws Frieza, his aura and lightning and breaks the floor
; at 24 and 48; orbit_surge_deck the rest); the cosmic montage, aerial
; melee and pullback after it are not ported yet: at collateralStart the
; orbit and its intro start, as frieza.js enterOrbit does after them. C
; set: the fight is in space.
orbit_frieza_surge:
	PHB
	PHP
	REP #$30
	CMP.w #!ORBIT_SURGE_DECK
	BCS .space
	JSR orbit_surge_deck
	PLP
	PLB
	CLC
	RTL
.space
	PHY
	PHX
	PEA.w $3232 : PLB : PLB
	JSL orbit_api_defaults
	PLA : STA.l !orbit_in_tx
	PLA : STA.l !orbit_in_ty
	LDA.l $7E0000|!fzf_hp_lo : STA.l !orbit_in_hp
	LDA.l $7E0000|!fzf_age : STA.l !orbit_in_age
	LDA.l $7E0000|!fzf_cycle : AND.w #$00FF : STA.l !orbit_in_cycle
	LDA.l !fzs_limpact : STA.l !orbit_in_limp
	LDA.l !fzs_lmelee : STA.l !orbit_in_lmel
	LDA.l !fzs_mhits : AND.w #$00FF : STA.l !orbit_in_mhits
	LDA.l $7E0000|!fzf_stun : AND.w #$00FF : STA.l !orbit_in_stun
	LDA.w #$0000 : STA.l !orbit_in_dodge
	LDA.w #!OE_INTRO
	JSL orbit_api_enter
	PLP
	PLB
	SEC
	RTL
!FRIEZA_ORBIT_SURGE = orbit_frieza_surge

; frieza.js draw() for the 'frieza-cosmic' surge on the deck, after the
; frieza module's Frieza: from 25 the Death Ball grows above him (kiArt
; 'death' at (b.x, b.y - 50), the generated diameters), from 58 Goku's
; giant beam rises from (hero.x, hero.y - 14): (age - 57) * 12 long, 18
; wide, taper 20. A16 = surge age (1 to collateralStart - 1); DB = $7E,
; D = 0 (fx's), M16/X16.
orbit_surge_deck:
if defined("FX_DRAWS")
	CMP.w #25
	BCS +
	RTS
+	PHA
	SEC : SBC.w #25
	TAX
	LDA.l orbit_surge_dball,X
	AND.w #$00FF
	STA.l !fx_a
	LDA $01,S
	LSR : LSR : LSR                ; (fx wraps the frame at 12)
	STA.l !fx_t
	SEP #$20
	LDA.b #!FX_DBALL_BATTLE
	STA.l !fx_style
	REP #$20
	LDA.l $7E0000|!fzf_x
	TAX
	LDA.l $7E0000|!fzf_y
	SEC : SBC.w #50
	TAY
	LDA.w #!FX_DEATHBALL
	JSL fx_draw
	REP #$30
	PLA
	CMP.w #58
	BCC .done
	STA.l !fx_t
	SEC : SBC.w #57
	ASL : ASL
	PHA
	ASL
	CLC : ADC $01,S                ; (age - 57) * 12
	STA.l !fx_a
	PLA
	LDA.w #18
	STA.l !fx_b
	LDA.w #20
	STA.l !fx_c
	SEP #$20
	LDA.b #3                       ; up
	STA.l !fx_dir
	REP #$20
	LDA.l $7EE002
	TAX
	LDA.l $7EE004
	SEC : SBC.w #14
	TAY
	LDA.w #!FX_BEAM_WAVE
	JSL fx_beam
	REP #$30
.done
endif
	RTS

; !FRIEZA_ORBIT_RETURN (the victory event C7 while the fight is still in
; space: frieza.js F.victory -> returnToFortress). JSL, any DB.
orbit_frieza_return:
	PHB
	PHP
	REP #$30
	PEA.w $3232 : PLB : PLB
	SEP #$20
	LDA.l !orbit_state
	CMP.b #!OS_LIVE
	REP #$30
	BNE +
	LDA.w !fn_ret
	BNE +
	LDA.w #$0001
	STA.w !fn_ret
	JSR orbit_return
+	PLP
	PLB
	RTL
!FRIEZA_ORBIT_RETURN = orbit_frieza_return

; !FRIEZA_ORBIT_LOCKED: C set while the orbit holds the controls (frieza.js
; inputLocked: the surge and the 'won' stage on the deck), here while the
; orbit owns the picture or its landing clock runs. JSL, any DB.
orbit_frieza_locked:
	PHP
	SEP #$20
	LDA.l !orbit_flags
	AND.b #!OF_ACTIVE
	ORA.l !orbit_land
	ORA.l !orbit_land+1
	BEQ +
	PLP
	SEC
	RTL
+	PLP
	CLC
	RTL
!FRIEZA_ORBIT_LOCKED = orbit_frieza_locked
endif

orbit_bind_end:
assert orbit_bind_end <= !CODE_ORBIT+$8000, "orbit bindings overflow"
pullpc
