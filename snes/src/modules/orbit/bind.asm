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

if defined("FZFF_SPACE")
; !FRIEZA_ORBIT_SURGE (frieza module, every frame of the second surge; JSL,
; DB = $7E, M16/X16): A16 = surge age, X16/Y16 = the strike target (the
; Fortress's screen position), Frieza's ground state in the frieza
; module's block. The surge's own cinematic (cosmic montage, aerial melee,
; pullback) is not ported yet: the orbit and its intro start on the first
; frame, as frieza.js enterOrbit does after it. C set: the fight is in
; space.
orbit_frieza_surge:
	PHB
	PHP
	REP #$30
	PHY
	PHX
	PEA.w $3232 : PLB : PLB
	JSL orbit_api_defaults
	PLA : STA.l !orbit_in_tx
	PLA : STA.l !orbit_in_ty
	LDA.l !fzf_hp_lo : STA.l !orbit_in_hp
	LDA.l !fzf_age : STA.l !orbit_in_age
	LDA.l !fzf_cycle : AND.w #$00FF : STA.l !orbit_in_cycle
	LDA.l !fzs_limpact : STA.l !orbit_in_limp
	LDA.l !fzs_lmelee : STA.l !orbit_in_lmel
	LDA.l !fzs_mhits : AND.w #$00FF : STA.l !orbit_in_mhits
	LDA.l !fzf_stun : AND.w #$00FF : STA.l !orbit_in_stun
	LDA.w #$0000 : STA.l !orbit_in_dodge
	LDA.w #!OE_INTRO
	JSL orbit_api_enter
	PLP
	PLB
	SEC
	RTL
!FRIEZA_ORBIT_SURGE = orbit_frieza_surge

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
