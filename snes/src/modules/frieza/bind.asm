; Frieza bindings to optional modules (audio, ui, combat, fx, flight, world,
; ending, orbit). snes/src/modules.asm includes this file after every
; module, so the defined() checks see their defines whatever the include
; order. The code sits in the reserved area $A6:F000-FFFF and is
; JSR-callable from the rest of the module (M16/X16, DB = $7E, D = 0).

pushpc
org !CODE_FRIEZA+$7000
frieza_bind_start:

; ---------------------------------------------------------------------------
; Audio (docs/agents/snes-port/audio.md): A16 = !FZ_SFX_* id.
fz_sfx:
	PHP
	REP #$30
	AND.w #$00FF
	BEQ .out
	CMP.w #!FZ_SFX_COUNT
	BCS .out
if defined("AUDIO_IDS")
	PHX
	TAX
	LDA.l fz_sfx_audio,X
	AND.w #$00FF
	PLX
	JSL audio_sfx
else
	; without the audio module: the game's own effects for the main beats
	PHX
	PHY
	TAX
	LDA.l fz_sfx_native,X
	AND.w #$00FF
	BEQ .none
	XBA
	ORA.w #$0002                      ; command 02 (effect)
	LDX.w #$880F                      ; volume $0F, centre
	JSL core_sound_queue
.none
	PLY
	PLX
endif
.out
	PLP
	RTS

fz_laugh:
	LDA.w #!FZ_SFX_LAUGH
	JMP fz_sfx

if defined("AUDIO_IDS")
fz_sfx_audio:
	db 0
	db !AUDIO_SFX_POWER_BURST, !AUDIO_SFX_FLIGHT, !AUDIO_SFX_FRIEZA_LASER
	db !AUDIO_SFX_FRIEZA_ORB, !AUDIO_SFX_FRIEZA_IMPACT, !AUDIO_SFX_FORTRESS_BREAK
	db !AUDIO_SFX_CHARGED, !AUDIO_SFX_TRANSFORM, !AUDIO_SFX_REVERT
	db !AUDIO_SFX_FRIEZA_DISC, !AUDIO_SFX_FRIEZA_BEAM, !AUDIO_SFX_FRIEZA_RUSH
	db !AUDIO_SFX_FRIEZA_LAUGH, !AUDIO_SFX_DEFLECT, !AUDIO_SFX_IMPACT
	db !AUDIO_SFX_TELEPORT
else
; native effect per cue (0 = silent): bursts and impacts use the game's
; hit ($50) and transformation ($12) sounds
fz_sfx_native:
	db $00, $12,$00,$00, $00,$50,$50, $00,$12,$12, $00,$00,$00, $00,$50,$50, $00
endif

; Music cue change: A16 = !FZM_* (0 = back to the scene's own music).
fz_bind_music:
if defined("AUDIO_IDS")
	AND.w #$00FF
	BEQ .restore
	CMP.w #!FZM_BATTLE
	BEQ .battle
	CMP.w #!FZM_ORBIT
	BEQ .orbit
	LDA.w #!AUDIO_SONG_FRIEZA_ARRIVAL
	BRA .song
.battle
	LDA.w #!AUDIO_SONG_FRIEZA_BATTLE
	BRA .song
.orbit
	LDA.w #!AUDIO_SONG_FRIEZA_ORBIT
.song
	LDX.w #$0000
	JSL audio_song
	RTS
.restore
	JSL audio_song_restore
endif
	RTS

; ---------------------------------------------------------------------------
; Screen feedback (native-feedback.js): A16 = quake frames.
fz_pulse:
if defined("FX_IMPACT")
	JSL fx_quake
	RTS
else
	; Mode 7 arenas keep their own matrix work
	PHA
	LDA $29
	AND.w #$0004
	BNE .skip
	SEP #$20
	LDA !fz_quake
	BNE .extend
	LDA $49
	BNE .skip8                        ; an event owns the quake
	STA !fz_quake_prev
	LDA.b #$E0
	STA $49
.extend
	PLA
	CMP !fz_quake
	BCC +
	STA !fz_quake
+	PLA                               ; high byte
	REP #$20
	RTS
.skip8
	REP #$20
.skip
	PLA
	RTS
endif

; ---------------------------------------------------------------------------
; Combat (cancelCombat) and local flight (land).
fz_bind_cancel_combat:
if defined("COMBAT_OWNER")
	JSL combat_api_cancel
endif
if defined("STORY_HOOK_FLIGHT_LAND")
	LDA.w #$0000
	JSL !STORY_HOOK_FLIGHT_LAND
endif
	RTS

; A16 = form (0 base, 1 Super Saiyan) without the transformation.
fz_bind_set_form:
if defined("COMBAT_OWNER")
	JSL combat_api_set_form
else
	JSL goku_api_set_form
endif
	RTS

; powerIntro.restore({flight:true, superShown:true}) at the gold scene.
fz_bind_power_intro_shown:
	RTS

; ---------------------------------------------------------------------------
; World: C set once Goku's wave destroyed the Fortress.
fz_bind_fortress_destroyed:
if defined("PWF_FORTRESS")
	JSL world_fortress_destroyed
	RTS
else
	CLC
	RTS
endif

; Ending: C set while the ending owns the player (canAttack gate).
fz_bind_ending_active:
if defined("ES_ACTIVE")
	LDA.l !ending_status
	AND.w #!ES_ACTIVE
	BEQ +
	SEC
	RTS
+
endif
	CLC
	RTS

; C set while an ending relaxes the permanent form (the revived Randi's
; scenes, Goku's death): frieza.js leaves options.superSaiyan alone then.
fz_bind_ending_relaxed:
if defined("ES_NATIVEBOY")
	LDA.l !ending_status
	AND.w #!ES_NATIVEBOY|!ES_DEFEATED
	BEQ +
	SEC
	RTS
+
endif
	CLC
	RTS

; ---------------------------------------------------------------------------
; UI (telepathy): Dryad's invitation (frieza.js radio.say, kind 'quest').
fz_bind_hint:
if defined("UI_MSG_FRIEZA_QUEST")
	LDA.w #!UI_MSG_FRIEZA_QUEST
	LDX.w #$0000
	JSL ui_say
endif
	RTS

; The fed Beast's start ('GOKU:Now THAT is a fight!...', kind challenge).
fz_bind_say_challenge:
if defined("UI_MSG_BEAST_CHALLENGE")
	LDA.w #!UI_MSG_BEAST_CHALLENGE
	LDX.w #$0000
	JSL ui_say
endif
	RTS
; Frieza's boosts for Dark Lich (A16 = boosts given, 1 or 2; kind lich-buff).
fz_bind_say_lich:
if defined("UI_MSG_BEAST_CHALLENGE_LICH_BUFF_0")
	CMP.w #2
	BCS +
	LDA.w #!UI_MSG_BEAST_CHALLENGE_LICH_BUFF_1
	BRA ++
+	LDA.w #!UI_MSG_BEAST_CHALLENGE_LICH_BUFF_0
++	LDX.w #$0000
	JSL ui_say
endif
	RTS

; ---------------------------------------------------------------------------
; Orbit stream (docs/agents/snes-port/frieza.md, hand-off).
; Victory event C7: returnToFortress() when the fight ended in space.
fz_bind_orbit_victory:
if defined("FRIEZA_ORBIT_RETURN")
	JSL !FRIEZA_ORBIT_RETURN
endif
	RTS
; C set while the orbit intro holds the controls (inputLocked).
fz_bind_orbit_locked:
if defined("FRIEZA_ORBIT_LOCKED")
	JSL !FRIEZA_ORBIT_LOCKED
	RTS
else
	CLC
	RTS
endif

; ---------------------------------------------------------------------------
; Flight: canLand(x = !fz_t5, y = !fz_t6, Goku's layer and terrain).
; C set when the point is landable floor. Without the flight module every
; point is accepted (frieza.md).
fz_bind_can_land:
if defined("FLIGHT_API_CAN_LAND")
	LDA !fz_t5
	LDX !fz_t6
	JSL !FLIGHT_API_CAN_LAND
	RTS
else
	SEC
	RTS
endif

frieza_bind_end:
assert frieza_bind_end <= !CODE_FRIEZA+$8000, "frieza bind area overflow"
pullpc
