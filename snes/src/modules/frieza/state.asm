; Frieza's story state: the browser's frieza.js `s` object, story hooks
; (onEvent), queries, object-record overlays, the Emperor door, saves and
; the debug presets. Everything here runs with M16/X16, DB = $7E, D = 0
; unless a routine says otherwise.

; ---------------------------------------------------------------------------
; Small helpers

; C set when Goku is active (frieza.js on()).
fz_on:
	LDA.l !persist_goku_active
	AND.w #$00FF
	BEQ .off
	JSR fz_guard
	SEC
	RTS
.off
	CLC
	RTS

; The persistent block is trusted once the load or new-game hook ran this
; session (or a debug preset wrote it). A session that never saw them (a
; state imported around the hooks, battery contents left by another run)
; is treated like a save without the sidecar: derived from the native
; flags. Every accessor of the block guards. !fz_init: $A4 block settled,
; $A5 block settled and the per-visit WRAM reset (first field frame, load,
; new game). Preserves A, X, Y.
fz_guard:
	PHA
	LDA !fz_init
	AND.w #$00FE
	CMP.w #$00A4
	BEQ +
	PHX
	PHY
	SEP #$20
	LDA.b #$A4
	STA !fz_init
	REP #$20
	JSR fz_wake                       ; the next frame resets the per-visit state
	JSR fz_derive_legacy
	PLY
	PLX
+	PLA
	RTS

; A load: keep the sidecar when every field is in range, else derive it.

fz_block_check:
	SEP #$20
	LDA.b #$A4
	STA !fz_init
	REP #$20
	JSR fz_block_valid
	BCS +
	JSR fz_derive_legacy
+	RTS

; C set when every field of the block is in range.
fz_block_valid:
	LDA.l !fzp_version
	AND.w #$00FF
	CMP.w #$0001
	BNE .bad
	LDA.l !fzp_stage
	AND.w #$00FF
	CMP.w #!FZST_DEFEATED+1
	BCS .bad
	LDA.l !fzp_tree
	AND.w #$00FF
	CMP.w #!FZTR_COMPLETE+1
	BCS .bad
	LDA.l !fzp_flags
	AND.w #$C000
	BNE .bad
	LDA.l !fzp_mask
	AND.w #$0080
	BNE .bad
	LDA.l !fzp_crisis
	AND.w #$00C0
	BNE .bad
	LDA.l !fzp_beast
	AND.w #$00F8
	BNE .bad
	SEC
	RTS
.bad
	CLC
	RTS

; mana-mod.js canAttack (as story_compute_can_act): field vectors, no fade,
; Goku active and player-owned, no menu/event/window, no incapacitating
; status or native hurt pose, no ending owning the player. C set = can act.
fz_can_act:
	JSR fz_on
	BCC .no
	LDA.l $000100
	CMP.w #$A85C
	BNE .no
	LDA.l $000102
	CMP.w #$00C0
	BNE .no
	LDA.l $000104
	CMP.w #$CF5C
	BNE .no
	LDA.l $000106
	CMP.w #$00C1
	BNE .no
	LDA $E4
	CMP.w #$0101                      ; $E4 = $E5 = 1
	BNE .no
	LDA $E000
	AND $E02C
	AND.w #$0001
	BEQ .no
	LDA $EC
	AND.w #$40FE                      ; $EC & $FE, $ED & $40
	BNE .no
	LDA $D0
	AND.w #$00FF
	BNE .no
	LDA $E190
	AND.w #$D570                      ; $E190 & $70, $E191 & $D5
	BNE .no
	LDA $E011
	AND.w #$00FF
	CMP.w #$008C
	BCC +
	CMP.w #$0090
	BCC .no
+	JSR fz_bind_ending_active
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS

; A16 = !FZFL_* mask -> Z clear when any of those flags is set.
fz_flag:
	JSR fz_guard
	AND.l !fzp_flags
	RTS
fz_set:
	JSR fz_guard
	JSR fz_wake
	ORA.l !fzp_flags
	STA.l !fzp_flags
	RTS
fz_clear:
	JSR fz_guard
	JSR fz_wake
	EOR.w #$FFFF
	AND.l !fzp_flags
	STA.l !fzp_flags
	RTS
; A16 = !FZW_* bits: work deferred to the next field frame.
fz_defer:
	TSB !fz_pend
; The state changes: the next field frame re-evaluates the quiet path
; (fz_try_quiet). Preserves A, X, Y and P's width.
fz_wake:
	PHP
	SEP #$20
	PHA
	LDA.b #!FZI_IDLE
	TRB !fz_wasidle
	PLA
	PLP
	RTS

; A16 = stage byte.
fz_stage:
	JSR fz_guard
	LDA.l !fzp_stage
	AND.w #$00FF
	RTS
; Store A (low byte) as the stage.
fz_set_stage:
	JSR fz_guard
	JSR fz_wake
	SEP #$20
	STA.l !fzp_stage
	REP #$20
	RTS
fz_set_tree:
	JSR fz_guard
	JSR fz_wake
	SEP #$20
	STA.l !fzp_tree
	REP #$20
	RTS
fz_tree:
	JSR fz_guard
	LDA.l !fzp_tree
	AND.w #$00FF
	RTS

; A16 = byte $7E:CF00+X (story flag X). Preserves X.
fz_cf:
	LDA.l $7ECF00,X
	AND.w #$00FF
	RTS

; C set while the restoration wish was granted (quest.status.wished).
fz_wished:
	PHX
	PHY
	JSL story_api_quest_status
	TXA
	PLY
	PLX
	AND.w #$00FF
	BEQ +
	SEC
	RTS
+	CLC
	RTS

; A16 = quest ledger: held mask | collected (seed) mask << 8.
fz_quest:
	PHX
	PHY
	JSL story_api_quest_status
	PLY
	PLX
	RTS

; frieza.js pendingEntrance(): on() && stage dormant && !wished && CF4E < 9
; && the Fortress is intact. C set when pending.
fz_pending_entrance:
	JSR fz_on
	BCC .no
	JSR fz_stage
	BNE .no
	LDX.w #$004E
	JSR fz_cf
	CMP.w #9
	BCS .no
	JSR fz_wished
	BCS .no
	JSR fz_bind_fortress_destroyed
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS

; eligible(): pendingEntrance && (seedMask == 127 || CFAF >= 2).
fz_eligible:
	JSR fz_pending_entrance
	BCC .no
	JSR fz_quest
	XBA
	AND.w #$007F
	CMP.w #$007F
	BEQ .yes
	LDX.w #$00AF
	JSR fz_cf
	CMP.w #2
	BCS .yes
.no
	CLC
	RTS
.yes
	SEC
	RTS

; needsTree: stolen && stage != palace && tree != complete.
fz_needs_tree:
	LDA.w #!FZFL_STOLEN
	JSR fz_flag
	BEQ .no
	JSR fz_stage
	CMP.w #!FZST_PALACE
	BEQ .no
	JSR fz_tree
	CMP.w #!FZTR_COMPLETE
	BEQ .no
	SEC
	RTS
.no
	CLC
	RTS

; pendingTrial: on() && stolen && tree complete && !trialWon && stage hunt.
fz_pending_trial:
	JSR fz_on
	BCC .no
	LDA.w #!FZFL_TRIAL_WON
	JSR fz_flag
	BNE .no
	LDA.w #!FZFL_STOLEN
	JSR fz_flag
	BEQ .no
	JSR fz_tree
	CMP.w #!FZTR_COMPLETE
	BNE .no
	JSR fz_stage
	CMP.w #!FZST_HUNT
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; emperorPresent: on() && !emperorKilled && (stage theft || scene emperor-wait).
fz_emperor_present:
	JSR fz_on
	BCC .no
	LDA.w #!FZFL_EMPEROR
	JSR fz_flag
	BNE .no
	JSR fz_stage
	CMP.w #!FZST_THEFT
	BEQ .yes
	LDA !fz_scene
	AND.w #$00FF
	CMP.w #!FZS_EMPEROR_WAIT
	BEQ .yes
.no
	CLC
	RTS
.yes
	SEC
	RTS

; exteriorScene: on() && map 195 && (outdoorIntro || stage theft || scene eighth).
fz_exterior_scene:
	JSR fz_on
	BCC .no
	LDA $DC
	CMP.w #195
	BNE .no
	LDA.w #!FZFL_OUTDOOR
	JSR fz_flag
	BNE .yes
	JSR fz_stage
	CMP.w #!FZST_THEFT
	BEQ .yes
	LDA !fz_scene
	AND.w #$00FF
	CMP.w #!FZS_EIGHTH
	BEQ .yes
.no
	CLC
	RTS
.yes
	SEC
	RTS

; C set when the actor at offset X (from $E000) is active with species A.
fz_actor_is:
	STA !fz_t7
	LDA $E000,X
	AND.w #$0001
	BEQ .no
	LDA $E180,X
	AND.w #$00FF
	CMP !fz_t7
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; Find the first active actor of species A (mod.entities().find(...)).
; C set with X = actor offset.
fz_find_species:
	STA !fz_t6
	LDX.w #$0000
.loop
	LDA !fz_t6
	JSR fz_actor_is
	BCS .found
	TXA
	CLC
	ADC.w #$0200
	TAX
	CPX.w #$1800
	BCC .loop
	CLC
.found
	RTS

; ---------------------------------------------------------------------------
; Scene cue (frieza.js cue()). A16 = kind. The new scene keeps the clock,
; altar and court of the previous scene on the same map.
fz_cue:
	JSR fz_wake
	STA !fz_t0
	LDA !fz_scene
	AND.w #$00FF
	BEQ .fresh
	LDA !fz_smap
	CMP $DC
	BNE .fresh
	LDA !fz_sclock
	CLC
	ADC !fz_sage
	STA !fz_sclock
	SEP #$20
	LDA !fz_sflags
	AND.b #!FZSF_COURT|!FZSF_ALTAR
	STA !fz_sflags
	REP #$20
	BRA .set
.fresh
	STZ !fz_sclock
	SEP #$20
	STZ !fz_sflags
	REP #$20
.set
	SEP #$20
	LDA !fz_t0
	STA !fz_scene
	REP #$20
	STZ !fz_sage
	LDA $DC
	STA !fz_smap
	LDA $E002
	STA !fz_sx
	LDA $E004
	STA !fz_sy
	RTS

fz_scene_clear:
	SEP #$20
	STZ !fz_scene
	STZ !fz_sflags
	REP #$20
	RTS

; A16 = current scene kind (0 none).
fz_scene_kind:
	LDA !fz_scene
	AND.w #$00FF
	RTS

; Common hook epilogue work: cancelCombat() and land local flight at the
; next frame callback (hooks run inside the event dispatcher).
fz_defer_cancel:
	LDA.w #!FZW_CANCEL
	JSR fz_defer
	RTS

; ---------------------------------------------------------------------------
; Story hooks (frieza.js onEvent). JSL, M16/X16, DB = $7E, D = 0, A = id.

frieza_h_trial:                       ; F6
	LDA.w #!FZST_TRIAL
	JSR fz_set_stage
	JSR fz_defer_cancel
	LDA.w #!FZS_TRIAL_ENTRY
	JSR fz_cue
	SEP #$20
	LDA.b #!FZSF_COURT
	TSB !fz_sflags
	REP #$20
	RTL

frieza_h_trial_ready:                 ; 6E
	LDA.w #!FZS_TRIAL_TAUNT
	JSR fz_cue
	JSR fz_laugh
	RTL

frieza_h_empower:                     ; 129
	LDA.w #!FZS_EMPOWER
	JSR fz_cue
	LDA.w #$00BF                      ; Thanatos
	JSR fz_find_species
	BCC +
	LDA $E002,X
	STA !fz_stx
	LDA $E004,X
	SEC
	SBC.w #16
	STA !fz_sty
	SEP #$20
	LDA.b #!FZSF_TARGET
	TSB !fz_sflags
	REP #$20
+	LDA.w #!FZ_SFX_POWER_BURST
	JSR fz_sfx
	LDA.w #14
	JSR fz_pulse
	RTL

frieza_h_trial_leave:                 ; 6F
	LDA.w #!FZS_TRIAL_LEAVE
	JSR fz_cue
	LDA.w #!FZ_SFX_FLIGHT
	JSR fz_sfx
	RTL

frieza_h_trial_fade:                  ; 71
	LDA.w #!FZW_FADE
	JSR fz_defer
	RTL

frieza_h_after_trial:                 ; 12A
	LDA.w #!FZFL_TRIAL_WON
	JSR fz_set
	LDA.w #!FZST_HUNT
	JSR fz_set_stage
	JSR fz_scene_clear
	RTL

frieza_h_offer:                       ; A7
	LDA.w #!FZFL_OFFERED
	JSR fz_set
	RTL

frieza_h_theft:                       ; A8
	JSR fz_pending_entrance
	BCC +
	LDA.w #!FZST_THEFT
	JSR fz_set_stage
	JSR fz_defer_cancel
	LDA.w #!FZS_WAITING
	JSR fz_cue
+	RTL

frieza_h_emperor_prelude:             ; 4A7
	JSR fz_defer_cancel
	LDA.w #!FZS_EMPEROR_WAIT
	JSR fz_cue
	RTL

frieza_h_scene_clear:                 ; 4A8
	JSR fz_scene_clear
	RTL

frieza_h_palace:                      ; 7B
	LDA.w #!FZST_PALACE
	JSR fz_set_stage
	LDA.w #!FZS_ALTAR_LEAVE
	JSR fz_cue
	LDA.w #!FZ_SFX_FLIGHT
	JSR fz_sfx
	RTL

frieza_h_deck_death_ball:             ; 7C
	LDA.w #!FZST_THEFT
	JSR fz_set_stage
	LDA.w #!FZFL_DECKBALL
	JSR fz_set
	JSR fz_defer_cancel
	LDA.w #!FZS_WAITING
	JSR fz_cue
	RTL

frieza_h_temple_exit:                 ; 69
	LDA.w #!FZFL_OUTDOOR
	JSR fz_set
	LDA.w #!FZS_TEMPLE_EXIT
	JSR fz_cue
	LDA.w #!FZ_SFX_FLIGHT
	JSR fz_sfx
	RTL

frieza_h_core_arrival:                ; 6A
	LDA.w #!FZFL_OUTDOOR
	JSR fz_set
	JSR fz_scene_kind
	CMP.w #!FZS_CORE_ARRIVAL
	BEQ +
	LDA.w #!FZS_CORE_ARRIVAL
	JSR fz_cue
+	LDA.w #!FZ_SFX_FLIGHT
	JSR fz_sfx
	RTL

frieza_h_fanha_finish:                ; 4A9
	LDA.w #!FZS_FANHA
	JSR fz_cue
	LDA.w #111                        ; Fanha
	JSR fz_find_species
	BCC +
	JSR fz_set_target
+	LDA.w #!FZ_SFX_LASER
	JSR fz_sfx
	RTL

frieza_h_emperor_shot:                ; 66
	LDA.w #!FZS_EMPEROR_SHOT
	JSR fz_cue
	LDA.w #176                        ; the Emperor
	JSR fz_find_species
	BCC +
	JSR fz_set_target
	STX !fz_sbase
+	LDA.w #!FZ_SFX_LASER
	JSR fz_sfx
	RTL

; Target = actor X's position.
fz_set_target:
	LDA $E002,X
	STA !fz_stx
	LDA $E004,X
	STA !fz_sty
	SEP #$20
	LDA.b #!FZSF_TARGET
	TSB !fz_sflags
	REP #$20
	RTS

frieza_h_emperor_fall:                ; 67
	; keep the shot's target and actor (Object.assign(s.scene,{target,base}))
	LDA !fz_sflags
	AND.w #!FZSF_TARGET
	PHA
	LDA.w #!FZS_EMPEROR_FALL
	JSR fz_cue
	PLA
	SEP #$20
	TSB !fz_sflags
	REP #$20
	LDA.w #!FZFL_EMPEROR
	JSR fz_set
	; CF44 = max(3, CF44)
	SEP #$20
	LDA.l $7ECF44
	CMP.b #$03
	BCS +
	LDA.b #$03
	STA.l $7ECF44
+	REP #$20
	RTL

frieza_h_tree_arrival:                ; 178
	LDA.w #!FZTR_CONFRONT
	JSR fz_set_tree
	JSR fz_defer_cancel
	LDA.w #!FZS_TREE_ARRIVAL
	JSR fz_cue
	LDA.w #!FZ_SFX_FLIGHT
	JSR fz_sfx
	RTL

frieza_h_tree_charge:                 ; 179
	LDA.w #!FZS_TREE_CHARGE
	JSR fz_cue
	RTL

frieza_h_tree_shot:                   ; 17A
	LDA.w #!FZTR_ATTACK
	JSR fz_set_tree
	LDA.w #!FZS_TREE_SHOT
	JSR fz_cue
	LDA.w #!FZ_SFX_ORB
	JSR fz_sfx
	RTL

frieza_h_tree_impact:                 ; 17B
	LDA.w #!FZS_TREE_IMPACT
	JSR fz_cue
	LDA.w #!FZ_SFX_POWER_BURST
	JSR fz_sfx
	RTL

frieza_h_tree_leave:                  ; 17C
	LDA.w #!FZS_TREE_LEAVE
	JSR fz_cue
	LDA.w #!FZ_SFX_FLIGHT
	JSR fz_sfx
	RTL

frieza_h_tree_return:                 ; 19D
	LDA.w #!FZS_TREE_RETURN
	JSR fz_cue
	RTL

frieza_h_tree_wake:                   ; 1A4
	LDA.w #!FZS_TREE_WAKE
	JSR fz_cue
	RTL

frieza_h_tree_done:                   ; 17D
	LDA.w #!FZTR_COMPLETE
	JSR fz_set_tree
	JSR fz_scene_clear
	RTL

frieza_h_reveal:                      ; AC
	LDA.w #!FZS_REVEAL
	JSR fz_cue
	LDA $DC
	CMP.w #431
	BNE +
	LDA $A8
	STA !fz_acx
	LDA $AA
	STA !fz_acy
	SEP #$20
	LDA.b #!FZSF_ALTAR
	TSB !fz_sflags
	REP #$20
+	LDA.w #!FZ_SFX_FLIGHT
	JSR fz_sfx
	RTL

frieza_h_altar_approach:              ; 1A8
	LDA.w #!FZS_ALTAR_APPROACH
	JSR fz_cue
	RTL

frieza_h_steal:                       ; AD
	LDA.w #!FZFL_STOLEN
	JSR fz_set
	JSR fz_quest
	SEP #$20
	STA.l !fzp_mask
	REP #$20
	LDA.w #!FZS_STEAL
	JSR fz_cue
	LDA.w #!FZ_SFX_CHARGED
	JSR fz_sfx
	RTL

frieza_h_core_charge:                 ; CC
	LDA.w #!FZS_CORE_CHARGE
	JSR fz_cue
	RTL

frieza_h_core_shot:                   ; D6
	LDA.w #!FZS_CORE_SHOT
	JSR fz_cue
	LDA.w #!FZ_SFX_ORB
	JSR fz_sfx
	RTL

frieza_h_core_impact:                 ; D7
	JSR fz_new_crisis
	LDA.w #!FZS_CORE_IMPACT
	JSR fz_cue
	LDA.w #!FZ_SFX_FORTRESS
	JSR fz_sfx
	RTL

; newCoreCrisis(): {active:true, minutes:5, flightNotified:false}.
fz_new_crisis:
	SEP #$20
	LDA.b #!FZC_ON|!FZC_ACTIVE
	STA.l !fzp_crisis
	REP #$20
	RTS

frieza_h_escape:                      ; D8
	; activateTwilight(): CF41 >= 3, CF44 >= 6, CF45 >= 1 (never lowered)
	SEP #$20
	LDA.l $7ECF41
	CMP.b #$03
	BCS +
	LDA.b #$03
	STA.l $7ECF41
+	LDA.l $7ECF44
	CMP.b #$06
	BCS +
	LDA.b #$06
	STA.l $7ECF44
+	LDA.l $7ECF45
	BNE +
	LDA.b #$01
	STA.l $7ECF45
+	REP #$20
	LDA.w #!FZST_HUNT
	JSR fz_set_stage
	LDA.w #!FZS_CORE_ESCAPE
	JSR fz_cue
	LDA.w #!FZ_SFX_FLIGHT
	JSR fz_sfx
	LDA.w #!FZFL_DECKBALL
	JSR fz_flag
	BEQ +
	LDA.w #!FZFL_DECKBALL
	JSR fz_clear
	LDA.w #!FZFL_FLYBY
	JSR fz_set
	LDA.w #!FZFL_FLYBY_GO
	JSR fz_clear
	LDA.w #$0000
	STA.l !fzp_flyby
+	RTL

frieza_h_leave:                       ; BF
	LDA.w #!FZTR_PURSUIT
	JSR fz_set_tree
	LDA.w #!FZS_DEPART
	JSR fz_cue
	LDA.w #!FZ_SFX_FLIGHT
	JSR fz_sfx
	RTL

frieza_h_eighth:                      ; AF
	LDA.w #!FZFL_EIGHTH
	JSR fz_set
	LDA.w #!FZST_HUNT
	JSR fz_set_stage
	LDA.w #!FZS_EIGHTH
	JSR fz_cue
	LDA.w #!FZ_SFX_CHARGED
	JSR fz_sfx
	RTL

frieza_h_showdown:                    ; C1
	LDA.w #!FZST_SHOWDOWN
	JSR fz_set_stage
	LDA.w #!FZFL_PERMANENT|!FZFL_FALLEN|!FZFL_POPOI|!FZFL_PRIMM
	JSR fz_clear
	JSR fz_defer_cancel
	LDA.w #!FZW_FORM_BASE
	JSR fz_defer
	; membership at the showdown
	LDA $E200
	AND.w #$0001
	BEQ +
	LDA.w #!FZFL_PRIMM
	JSR fz_set
+	LDA $E400
	AND.w #$0001
	BEQ .guest
	LDA.w #!FZFL_POPOI
	JSR fz_set
	BRA .cue
.guest
	; an unrecruited Popoi has no actor graphics descriptor yet (frame)
	LDA.w #!FZW_POPOI
	JSR fz_defer
.cue
	LDA.w #!FZS_TAUNT
	JSR fz_cue
	SEP #$20
	LDA.b #!FZSF_COURT
	TSB !fz_sflags
	REP #$20
	JSR fz_laugh
	RTL

frieza_h_lift:                        ; C2
	LDA.w #!FZS_LIFT
	JSR fz_cue
	LDA $E402
	STA !fz_lfx
	LDA $E404
	STA !fz_lfy
	LDA.w #!FZ_SFX_CHARGED
	JSR fz_sfx
	RTL

frieza_h_explode:                     ; C3
	; target = Popoi's body: (x, y - altitude - 12)
	LDA $E402
	STA !fz_stx
	LDA $E445
	AND.w #$00FF
	CLC
	ADC.w #12
	EOR.w #$FFFF
	SEC
	ADC $E404
	STA !fz_sty
	LDA.w #!FZFL_FALLEN
	JSR fz_set
	LDA.w #!FZS_EXPLODE
	JSR fz_cue
	SEP #$20
	LDA.b #!FZSF_TARGET
	TSB !fz_sflags
	REP #$20
	LDA.w #!FZ_SFX_POWER_BURST
	JSR fz_sfx
	LDA.w #18
	JSR fz_pulse
	RTL

frieza_h_gold:                        ; C5
	LDA.w #!FZFL_PERMANENT
	JSR fz_set
	LDA.w #!FZW_FORM_SSJ
	JSR fz_defer
	LDA.w #!FZS_GOLD
	JSR fz_cue
	LDA.w #!FZ_SFX_TRANSFORM
	JSR fz_sfx
	RTL

frieza_h_battle:                      ; C6
	JSR fz_start_battle
	RTL

frieza_h_victory:                     ; C7
	JSR fz_bind_orbit_victory         ; orbit: returnToFortress() if in space
	JSR fz_scene_clear
	RTL

frieza_h_defeated:                    ; C8
	LDA.w #!FZST_DEFEATED
	JSR fz_set_stage
	LDA.w #!FZFL_STOLEN
	JSR fz_clear
	JSR fz_scene_clear
	JSL story_api_quest_recover
	RTL

frieza_h_revive:                      ; C9
	LDA.w #!FZFL_FALLEN|!FZFL_EIGHTH
	JSR fz_clear
	LDA.w #!FZW_REVIVE
	JSR fz_defer
	RTL

frieza_h_repair_core:                 ; story: the wish repairs the core
	JSR fz_guard
	LDA.l !fzp_crisis
	AND.w #$00FF
	BEQ +
	AND.w #~!FZC_ACTIVE&$FF
	ORA.w #!FZC_RESOLVED
	SEP #$20
	STA.l !fzp_crisis
	REP #$20
+	RTL

; ---------------------------------------------------------------------------
; Story queries: A16 = value.

frieza_q_crisis:
	JSR fz_guard
	LDA.l !fzp_crisis
	AND.w #!FZC_ACTIVE
	BEQ +
	LDA.w #$0001
+	RTL
frieza_q_stolen:
	LDA.w #!FZFL_STOLEN
	BRA fz_q_flag
frieza_q_emperor_killed:
	LDA.w #!FZFL_EMPEROR
	BRA fz_q_flag
frieza_q_trial_won:
	LDA.w #!FZFL_TRIAL_WON
	BRA fz_q_flag
frieza_q_popoi_member:
	LDA.w #!FZFL_POPOI
	BRA fz_q_flag
frieza_q_primm_member:
	LDA.w #!FZFL_PRIMM
fz_q_flag:
	JSR fz_flag
	BEQ +
	LDA.w #$0001
+	RTL
frieza_q_pending:
	JSR fz_pending_entrance
	BRA fz_q_carry
frieza_q_palace:
	JSR fz_on
	BCC fz_q_carry
	JSR fz_stage
	CMP.w #!FZST_PALACE
	BEQ fz_q_one
	BRA fz_q_zero
frieza_q_needs_tree:
	JSR fz_needs_tree
	BRA fz_q_carry
frieza_q_eligible:
	JSR fz_eligible
	BRA fz_q_carry
; Radar's all-seeds fallback distinguishes a dormant story from a late
; invitation that is currently ineligible (e.g. Fortress already gone).
frieza_q_dormant:
	JSR fz_stage
	BEQ fz_q_one
	BRA fz_q_zero
frieza_q_trial:
	JSR fz_stage
	CMP.w #!FZST_TRIAL
	BEQ fz_q_one
	BRA fz_q_zero
frieza_q_tree_complete:
	JSR fz_tree
	CMP.w #!FZTR_COMPLETE
	BEQ fz_q_one
	BRA fz_q_zero
frieza_q_defeated:
	JSR fz_stage
	CMP.w #!FZST_DEFEATED
	BEQ fz_q_one
	BRA fz_q_zero
fz_q_carry:
	BCS fz_q_one
fz_q_zero:
	LDA.w #$0000
	RTL
fz_q_one:
	LDA.w #$0001
	RTL
; 0 none, 1 some, 2 all seven stolen (story's QUEST_HELD7 test).
frieza_q_stolen_class:
	LDA.w #!FZFL_STOLEN
	JSR fz_flag
	BEQ fz_q_zero
	LDA.l !fzp_mask
	AND.w #$007F
	BEQ fz_q_zero
	CMP.w #$007F
	BNE fz_q_one
	LDA.w #$0002
	RTL
; inputLocked: on() && map 246 && (surge || stage won) && !$D0 && !($EC & $FE)
; (the orbit stream adds its intro through fz_bind_orbit_locked).
frieza_q_input_locked:
	JSR fz_input_locked
	BRA fz_q_carry
fz_input_locked:
	JSR fz_on
	BCC .no
	LDA $DC
	CMP.w #246
	BNE .no
	LDA $D0
	AND.w #$00FF
	BNE .no
	LDA $EC
	AND.w #$00FE
	BNE .no
	JSR fz_stage
	CMP.w #!FZST_WON
	BEQ .yes
	JSR fz_battle_surging
	BCS .yes
	JSR fz_bind_orbit_locked
	BCS .yes
.no
	CLC
	RTS
.yes
	SEC
	RTS
frieza_q_beast_fed:
	LDA.w #!FZX_FED
	BRA fz_q_beast
frieza_q_beast_started:
	LDA.w #!FZX_STARTED
	BRA fz_q_beast
frieza_q_beast_won:
	LDA.w #!FZX_WON
fz_q_beast:
	JSR fz_guard
	AND.l !fzp_beast
	BEQ +
	LDA.w #$0001
+	RTL

; ---------------------------------------------------------------------------
; Object records (story OBJECT_FRIEZA hook, native-story.js storyRead):
; A = record index, X = slot offset, record bytes at $C808+X (byte 1 =
; visibility range, 2-3 = placement, 5 = species). Map 246's trial staging
; (Dyluck and Thanatos) is the Frieza trial's, so it lives here too.
frieza_h_object:
	STA !fz_t0
	LDA $DC
	CMP.w #431
	BEQ .altar
	CMP.w #195
	BEQ .exterior
	CMP.w #246
	BNE .done
	JMP .arena
.done
	RTL
.altar
	LDA !fz_t0
	CMP.w #3
	BNE .done
	PHX
	JSR fz_emperor_present
	PLX
	BCC +
	SEP #$20
	LDA.b #$0F
	STA $C809,X
	REP #$20
	RTL
+	LDA.w #!FZFL_EMPEROR
	JSR fz_flag
	BEQ .done
	SEP #$20
	LDA.b #$F0
	STA $C809,X
	REP #$20
	RTL
.exterior
	LDA $C80D,X
	AND.w #$00FF
	CMP.w #$00A0
	BNE .done
	PHX
	JSR fz_exterior_scene
	PLX
	BCC .done
	SEP #$20
	LDA.b #$F0
	STA $C809,X
	REP #$20
	RTL
.arena
	PHX
	JSR fz_stage
	CMP.w #!FZST_TRIAL
	BEQ .trial
	JSR fz_pending_trial
	BCS .trial
	JSR fz_stage
	BNE .suppress                     ; active (any stage but dormant)
	JSR fz_pending_entrance
	BCS .suppress
	PLX
	RTL
.suppress
	PLX
	SEP #$20
	LDA.b #$F0
	STA $C809,X
	REP #$20
	RTL
.trial
	PLX
	LDA !fz_t0
	BEQ .dyluck
	CMP.w #1
	BNE +
	LDA.w #$9792                      ; Thanatos, distinct centre-stage body
	STA $C80A,X
+	RTL
.dyluck
	LDA.w #$978F                      ; Dyluck, left of Thanatos
	STA $C80A,X
	RTL

; ---------------------------------------------------------------------------
; Door 3FC (the altar room's entry): while the Emperor is present the party
; enters beside him and Dryad's seal (native-story.js storyRead of C8:3FF2
; = 36, byte 2 of the door's record).
; !DOOR_RECORD_HOOK (modules.asm), called by destroy's door record at
; C1:E7DF: JSL, M16/X16, D = 0, X = door * 4, A = record bytes 0-1, Y =
; bytes 2-3; returns A and Y, keeps X.
frieza_door_record:
	CPX.w #$03FC*4
	BEQ +
	RTL
+	PHB
	PHA
	PHX
	PHY
	PEA $7E7E
	PLB
	PLB
	JSR fz_emperor_present
	PLY
	PLX
	BCC +
	TYA
	AND.w #$FF00
	ORA.w #36
	TAY
+	PLA
	PLB
	RTL

; Builds without destroy's C1:E7DF patch: replaces C1:E7F2 LDA $C83002,X
; (M16, X = door * 4, DB = $7E, D = 0).
if not(defined("DESTROY_DOOR_HOOK"))
if not(defined("SS_ESCAPE_DOOR"))
frieza_door_entry:
	LDA.l $C83002,X
	CPX.w #$03FC*4
	BNE .out
	PHA
	PHX
	JSR fz_emperor_present
	PLX
	PLA
	BCC .out
	AND.w #$FF00
	ORA.w #36
.out
	RTL
endif
endif

; ---------------------------------------------------------------------------
; Saves, loads and new games (core hooks).

frieza_new_game:
	LDA.w #$0000
	LDX.w #$007E
-	STA.l !FZPB,X
	DEX
	DEX
	BPL -
	SEP #$20
	LDA.b #$01
	STA.l !fzp_version
	REP #$20
	LDA.w #$FFFF
	STA.l !fzp_flyby
	JSR fz_reset_transient
	SEP #$20
	LDA.b #$A5
	STA !fz_init
	REP #$20
	RTL

frieza_load:
	JSR fz_block_check
	JSR fz_reset_transient
	SEP #$20
	LDA.b #$A5
	STA !fz_init
	REP #$20
	RTL

; A save without a valid sidecar: Frieza's state was never recorded. Keep
; him dormant unless the native flags show the Emperor already fell.
fz_derive_legacy:
	LDA.w #$0000
	LDX.w #$007E
-	STA.l !FZPB,X
	DEX
	DEX
	BPL -
	LDA.w #$FFFF
	STA.l !fzp_flyby
	SEP #$20
	LDA.b #$01
	STA.l !fzp_version
	REP #$20
	LDX.w #$0044
	JSR fz_cf
	CMP.w #3
	BCC +
	LDA.w #!FZFL_EMPEROR
	JSR fz_set
+	RTS

; Forget per-visit state (scenes, battles, VRAM residency and claims). The
; scene SRAM is reset now, or by the first busy frame after an ending owned
; it (fz_sram_reset).
fz_reset_transient:
	JSR fz_bind_safe                  ; the danger bit goes with !fz_tflags
	SEP #$20
	LDA.b #!FZI_SRAM|!FZI_BALLS|!FZI_IDLE
	TRB !fz_wasidle
	REP #$20
	LDA.w #!VRAM_FIELD_OBJ_A
	LDX.w #!FZ_VRAM_OWNER
	JSL core_vram_release
	LDA.w #!VRAM_SCENE_OBJ
	LDX.w #!FZ_VRAM_OWNER
	JSL core_vram_release
	LDA.w #!VRAM_SCENE_BG
	LDX.w #!FZ_VRAM_OWNER
	JSL core_vram_release
	JSR fz_bind_ending_active
	BCS +
	LDA.w #!SCENE_FRIEZA              ; a session's start: the area becomes his
	JSL core_scene_claim              ; when free, so restores can write there
	BCS +
	JSR fz_sram_reset
+	JSR fz_scene_clear
	STZ !fz_pend
	LDA.w #$FFFF
	STA !fz_lastmap
	STA !fz_spr_res0
	STA !fz_spr_res1
	STA !fz_spr_pend
	SEP #$20
	STZ !fz_tflags
	STZ !fz_music
	LDA.b #$FF
	STA !fz_spr_pal
	REP #$20
	JSR fz_battle_reset
	JSR fz_beast_reset
	JSR fz_lich_reset
	SEP #$20
	STZ !fzd_on
	STZ !fzd_key
	REP #$20
	RTS

; Core's scene work area (!SRAM_WORK_SCENE, $32:6000-7FFF; core_scene_claim,
; owner !SCENE_FRIEZA): Frieza holds it while something of his needs it (a
; scene, the fight, one of his maps) and gives it back otherwise. C set when
; the area is his this frame; a fresh claim forgets what it held. With
; another owner (an ending, Vegeta's trial, the Sandship) C is clear and
; only the WRAM work runs.
fz_scene_sram:
	LDA !fz_mapflag
	AND.w #$00FF
	BNE .need
	LDA !fz_scene
	AND.w #$00FF
	BNE .need
	LDA !fzf_flags
	AND.w #!FZFF_ACTIVE
	BNE .need
	JSR fz_scene_free
	CLC
	RTS
.need
	LDA.w #!SCENE_FRIEZA
	JSL core_scene_claim
	BCS .elsewhere
	LDA !fz_wasidle
	AND.w #!FZI_SRAM
	BNE +
	JSR fz_sram_reset
+	SEC
	RTS
.elsewhere
	SEP #$20
	LDA.b #!FZI_SRAM
	TRB !fz_wasidle
	REP #$20
	CLC
	RTS

; Give core's claim back (when Frieza holds it); his state there is gone.
fz_scene_free:
	LDA.w #!SCENE_FRIEZA
	JSL core_scene_release
	SEP #$20
	LDA.b #!FZI_SRAM
	TRB !fz_wasidle
	REP #$20
	RTS

; The scene SRAM ($32:7000-7FFF) becomes Frieza's again: forget whatever
; it holds (an ending's scene, a battery left by another run), as the
; title boot does, and the large-burst table.
fz_sram_reset:
	LDA.w #$0000
	LDX.w #$01FE
-	STA.l !FZSB,X
	DEX
	DEX
	BPL -
	LDX.w #$000E
-	STA.l !FZHB,X
	STA.l !FZHB+$680,X
	STA.l !FZHB+$690,X
	DEX
	DEX
	BPL -
	JSR fz_lb_reset
	LDA.w #$FFFF
	STA.l !fzh_key
	SEP #$20
	LDA.b #!FZI_SRAM
	TSB !fz_wasidle
	REP #$20
	RTS

; ---------------------------------------------------------------------------
; Debug scene select (snes/src/modules/debug): A = hook kind, X = preset,
; Y = payload in bank !DEBUG_PAYLOAD_BANK (count byte, then key byte + value
; word entries). Carry clear = done.
frieza_debug_preset:
	JSR fz_guard
	CMP.w #!DEBUG_HOOK_FRIEZA
	BEQ .restore
	CMP.w #!DEBUG_HOOK_FRIEZA_EVENT
	BEQ .event
	CMP.w #!DEBUG_HOOK_CHALLENGE
	BEQ .challenge
	CMP.w #!DEBUG_HOOK_SCENE
	BEQ .scene
	JML fz_bind_debug_other           ; another module's kind (combat's)
.restore
	JSR fz_debug_restore
	CLC
	RTL
.challenge
	JSR fz_debug_challenge
	CLC
	RTL
.event
	; frieza.onEvent(event): the battle start (quick-start writes CF4E = 6)
	TYX
	LDA.l !FZ_PAYLOAD+2,X
	CMP.w #$00C6
	BNE +
	JSR fz_start_battle
+	CLC
	RTL
.scene
	; waits on module state: stage 'palace' (hexas, rider), the Beast
	; challenge started (beast); anything else is another module's
	TYX
	LDA.l !FZ_PAYLOAD+1,X
	AND.w #$00FF
	CMP.w #!DEBUG_KEY_STAGE
	BEQ .stage
	CMP.w #!DEBUG_KEY_STARTED
	BEQ .started
	LDA.w #!DEBUG_HOOK_SCENE
	JML fz_bind_debug_other
.stage
	LDA.l !FZ_PAYLOAD+2,X
	JSR fz_debug_stage_value
	STA !fz_t0
	JSR fz_stage
	CMP !fz_t0
	BNE .wait
	JSR fz_can_act
	BCC .wait
	LDA $D0
	AND.w #$00FF
	BNE .wait
	CLC
	RTL
.started
	LDA.l !fzp_beast
	AND.w #!FZX_STARTED
	BEQ .wait
	CLC
	RTL
.wait
	SEC
	RTL

if defined("DEBUG_TEST")
frieza_debug_preset_test:
	PHA
	PHX
	PHY
	JSL debug_test_hook_any
	REP #$30
	PLY
	PLX
	PLA
	JMP frieza_debug_preset
endif

; A16 = !DEBUG_VAL_* -> A16 = stage (!FZST_*).
fz_debug_stage_value:
	AND.w #$00FF
	CMP.w #!DEBUG_VAL_HUNT
	BEQ .hunt
	CMP.w #!DEBUG_VAL_DEFEATED
	BEQ .defeated
	CMP.w #!DEBUG_VAL_PALACE
	BEQ .palace
	CMP.w #!DEBUG_VAL_SHOWDOWN
	BEQ .showdown
	CMP.w #!DEBUG_VAL_TRIAL
	BEQ .trial
	LDA.w #!FZST_DORMANT
	RTS
.hunt
	LDA.w #!FZST_HUNT
	RTS
.defeated
	LDA.w #!FZST_DEFEATED
	RTS
.palace
	LDA.w #!FZST_PALACE
	RTS
.showdown
	LDA.w #!FZST_SHOWDOWN
	RTS
.trial
	LDA.w #!FZST_TRIAL
	RTS

; frieza.restore(saved): the state becomes initial() overlaid with the
; payload, then the browser's derived fix-ups.
fz_debug_restore:
	PHY
	; a preset state is trusted from now on; the per-visit WRAM starts clean
	LDA !fz_init
	AND.w #$00FF
	CMP.w #$00A5
	BEQ +
	JSR fz_reset_transient
+	SEP #$20
	LDA.b #$A5
	STA !fz_init
	REP #$20
	; initial()
	LDA.w #$0000
	SEP #$20
	STA.l !fzp_stage
	STA.l !fzp_tree
	STA.l !fzp_mask
	STA.l !fzp_crisis
	LDA.b #$01
	STA.l !fzp_version
	REP #$20
	LDA.w #$0000
	STA.l !fzp_flags
	LDA.w #$FFFF
	STA.l !fzp_flyby
	JSR fz_scene_clear
	JSR fz_battle_reset
	STZ !fz_t3                        ; keys present (bit = key)
	PLY
	TYX
	LDA.l !FZ_PAYLOAD,X
	AND.w #$00FF
	STA !fz_t1                        ; entries
	INX
.entry
	LDA !fz_t1
	BNE +
	JMP .fixups
+	DEC !fz_t1
	LDA.l !FZ_PAYLOAD,X
	AND.w #$00FF
	STA !fz_t0                        ; key
	PHX
	ASL
	TAX
	LDA.l fz_bit_table,X
	PLX
	TSB !fz_t3
	LDA.l !FZ_PAYLOAD+1,X
	STA !fz_t2                        ; value
	INX
	INX
	INX
	PHX
	LDA !fz_t0
	ASL
	TAX
	JSR (fz_debug_keys,X)
	PLX
	BRA .entry
.fixups
	; stolenMask defaults to the ledger mask while stolen
	LDA !fz_t3
	AND.w #1<<!DEBUG_KEY_STOLEN_MASK
	BNE +
	LDA.w #!FZFL_STOLEN
	JSR fz_flag
	BEQ +
	JSR fz_quest
	SEP #$20
	STA.l !fzp_mask
	REP #$20
+	; crisis for stolen or permanent saves
	LDA.w #!FZFL_STOLEN|!FZFL_PERMANENT
	JSR fz_flag
	BEQ +
	JSR fz_wished
	LDA.w #!FZC_ON|!FZC_NOTIFIED
	BCS ++
	ORA.w #!FZC_ACTIVE
++	SEP #$20
	STA.l !fzp_crisis
	REP #$20
+	; permanent Super Saiyan applies at once
	LDA.w #!FZFL_PERMANENT
	JSR fz_flag
	BEQ +
	LDA.w #!FZW_FORM_SSJ
	JSR fz_defer
+	RTS

fz_bit_table:
	dw $0001,$0002,$0004,$0008,$0010,$0020,$0040,$0080
	dw $0100,$0200,$0400,$0800,$1000,$2000,$4000,$8000
	dw $0000,$0000,$0000,$0000,$0000,$0000,$0000,$0000

fz_debug_keys:
	dw .stage, .tree, .emperor, .stolen, .mask, .eighth, .hinted, .won
	dw .permanent, .fallen, .scene, .none, .none, .none, .none, .none
	dw .none, .none, .none, .none, .none, .none, .none, .none
.none
	RTS
.stage
	LDA !fz_t2
	JSR fz_debug_stage_value
	JMP fz_set_stage
.tree
	LDA !fz_t2
	AND.w #$00FF
	CMP.w #!DEBUG_VAL_PURSUIT
	BEQ +
	CMP.w #!DEBUG_VAL_COMPLETE
	BEQ ++
	LDA.w #!FZTR_NONE
	JMP fz_set_tree
+	LDA.w #!FZTR_PURSUIT
	JMP fz_set_tree
++	LDA.w #!FZTR_COMPLETE
	JMP fz_set_tree
.emperor
	LDA.w #!FZFL_EMPEROR
	BRA .bool
.stolen
	LDA.w #!FZFL_STOLEN
	BRA .bool
.eighth
	LDA.w #!FZFL_EIGHTH
	BRA .bool
.hinted
	LDA.w #!FZFL_HINTED
	BRA .bool
.won
	LDA.w #!FZFL_TRIAL_WON
	BRA .bool
.permanent
	LDA.w #!FZFL_PERMANENT
	BRA .bool
.fallen
	LDA.w #!FZFL_FALLEN
.bool
	LDX !fz_t2
	BEQ +
	JMP fz_set
+	JMP fz_clear
.mask
	LDA !fz_t2
	SEP #$20
	STA.l !fzp_mask
	REP #$20
	RTS
.scene
	JMP fz_scene_clear

; challenge.restore({fed, started, won}).
fz_debug_challenge:
	TYX
	LDA.l !FZ_PAYLOAD,X
	AND.w #$00FF
	STA !fz_t1
	INX
	STZ !fz_t3
.entry
	LDA !fz_t1
	BEQ .done
	DEC !fz_t1
	LDA.l !FZ_PAYLOAD,X
	AND.w #$00FF
	STA !fz_t0
	LDA.l !FZ_PAYLOAD+1,X
	BEQ .next
	LDA !fz_t0
	CMP.w #!DEBUG_KEY_FED
	BNE +
	LDA.w #!FZX_FED
	TSB !fz_t3
+	LDA !fz_t0
	CMP.w #!DEBUG_KEY_STARTED
	BNE +
	LDA.w #!FZX_STARTED
	TSB !fz_t3
+	LDA !fz_t0
	CMP.w #!DEBUG_KEY_WON
	BNE .next
	LDA.w #!FZX_WON
	TSB !fz_t3
.next
	INX
	INX
	INX
	BRA .entry
.done
	LDA !fz_t3
	SEP #$20
	STA.l !fzp_beast
	REP #$20
	RTS
