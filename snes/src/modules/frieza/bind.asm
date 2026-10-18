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
	; the browser switches cues at once: cut the old song (p2 high nibble
	; 0 skips the fade wait, the shortest load), full volume (p3 = $FF)
	LDX.w #$FF00
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

; ending.lose(key): the ending module's fatal sequence (doomed planet, GAME
; OVER). A: bit 3 died as a Super Saiyan. C set when the ending runs it.
fz_bind_ending_lose:
if defined("EP_FATAL")
	; X16 = the encounter key (frieza_api_encounter's format)
	LDA !fzd_key
	AND.w #$00FF
	JSR fz_encounter_tier
	TAX
	LDA !fzd_gold
	AND.w #$00FF
	BEQ +
	LDA.w #!EF_GOLD
+	JSL ending_lose
	SEC
	RTS
else
	CLC
	RTS
endif

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
; C set while the orbit stream owns the picture (its !orbit_flags bit 0):
; the ground fight neither ticks nor draws.
fz_bind_orbit_owns:
if defined("orbit_flags")
	LDA.l $7E0000|!orbit_flags
	LSR
	RTS
else
	CLC
	RTS
endif
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
; C set when (!fz_t5, !fz_t6) is landable floor (flight's canLand) at
; Goku's layer and terrain ($E00B: the patrol nodes, the collapse), or with
; fz_bind_can_land_t at the terrain the fight recorded (!fzf_terrain, its
; fractures; frieza.js b.terrain). Without the flight module every point
; is accepted (frieza.md).
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
fz_bind_can_land_t:
if defined("FLIGHT_API_CAN_LAND_T")
	LDA !fz_t5
	LDX !fz_t6
	LDY !fzf_terrain
	JSL !FLIGHT_API_CAN_LAND_T
	RTS
else
	JMP fz_bind_can_land
endif

; Flight's scripted camera (frieza-intro.js installAltarCamera): A16 =
; camera x, X16 = y (the tile-stream origin), posted every field frame a
; scene holds the camera; a frame without a post gives it back.
fz_bind_camera:
if defined("FLIGHT_API_CAMERA")
	JSL !FLIGHT_API_CAMERA
endif
	RTS

; Flight's canLand query point for frieza_floor_hole: A16 = x, X16 = y;
; C clear when the query's layer is not the deck's.
fz_bind_flight_query:
if defined("FLIGHT_OWNS_D651")
	LDA.w !fl_q_l
	AND.w #$0001
	STA !fz_m4
	LDA !fzf_terrain
	AND.w #$0080                      ; terrain & $80 -> layer 1
	BEQ +
	LDA.w #$0001
+	CMP !fz_m4
	BNE .other
	LDA.w !fl_q_x
	LDX.w !fl_q_y
	SEC
	RTS
.other
endif
	LDA.w #$FFFF
	TAX
	CLC
	RTS

; ---------------------------------------------------------------------------
; Combat: C set while Goku's beam is live (mod.effects beam with life).
fz_bind_goku_beam_live:
if defined("COMBAT_OWNER")
	JSL combat_api_state
	AND.w #$0010
	BEQ +
	SEC
	RTS
+
endif
	CLC
	RTS
; beamTouchesShot(): Goku's beam covers shot X (needs combat's beam
; geometry: see frieza.md, Requests). C set when it does.
fz_bind_beam_touches:
	CLC
	RTS
; Frieza's owner bit in combat's lock words.
!FZ_COMBAT_OWNER = $0040
; A dangerous encounter (combat keeps native damage, deflects nothing).
fz_bind_danger:
if defined("COMBAT_OWNER")
	LDA.w #!FZ_COMBAT_OWNER
	JSL combat_api_danger
	REP #$30
endif
	RTS
fz_bind_safe:
if defined("COMBAT_OWNER")
	LDA.w #!FZ_COMBAT_OWNER
	JSL combat_api_safe
	REP #$30
endif
	RTS
; Combat's whole-pad lock while a surge or the victory beat runs.
fz_bind_input_lock:
if defined("COMBAT_OWNER")
	LDA.w #!FZ_COMBAT_OWNER
	JSL combat_api_input_lock
endif
	RTS
fz_bind_input_unlock:
if defined("COMBAT_OWNER")
	LDA.w #!FZ_COMBAT_OWNER
	JSL combat_api_input_unlock
endif
	RTS

; mod.cancelInput(): held buttons must be released after the surge.
fz_bind_cancel_input:
	RTS

; UI: radio.restore({firstFlight:true}) and the full-power exchange.
fz_bind_radio_restore:
if defined("UI_MSG_COUNT")
	JSL ui_restore_first_flight
endif
	RTS
fz_bind_full_power_lines:
if defined("UI_GROUP_FRIEZA_FULL_POWER_FRIEZA_SEQ_0")
	LDA.w #!UI_GROUP_FRIEZA_FULL_POWER_FRIEZA_SEQ_0
	LDX.w #$0000
	JSL ui_interrupt
endif
	RTS

; Debug preset kinds Frieza does not answer go on to combat's handler: the
; ANY slot holds one target and combat takes it only while it is free.
; A16 = kind, X16 = preset, Y16 = payload (as the debug module passed them).
fz_bind_debug_other:
if defined("COMBAT_OWNER")
	if defined("DEBUG_HOOK_FORM")
	JML combat_debug_hook
	endif
endif
	CLC
	RTL

; Orbit: the second surge ('frieza-cosmic') and everything after it.
; Without the orbit stream, the ground fight goes on as the stand-in: the
; surge ends after 120 frames, Frieza fights on enraged with no HP floor,
; and his fall ends the battle (frieza.js win(), the ground path).
fz_bind_orbit_surge:
if defined("FRIEZA_ORBIT_SURGE")
	; JSL with A16 = surge age (1 on its first frame), X16/Y16 = the strike
	; target (the Fortress's screen position or 2000); Frieza's HP is in
	; !fzf_hp_lo/_hi. C set back: the surge is over and the fight went to
	; space (frieza.js enterOrbit): the ground fight sleeps from now on.
	LDA.l !fzs_tgy
	TAY
	LDA.l !fzs_tgx
	TAX
	LDA.l !fzs_sage
	JSL !FRIEZA_ORBIT_SURGE
	REP #$30
	BCC +
	SEP #$20
	LDA.b #!FZFF_SPACE
	TSB !fzf_flags
	LDA.b #$00
	STA.l !fzs_surge
	REP #$20
	JSR fz_drop_attacks
+	RTS
else
	LDA.l !fzs_sage
	CMP.w #120
	BCC +
	SEP #$20
	LDA.b #$00
	STA.l !fzs_surge
	LDA.b #60
	STA !fzf_grace
	REP #$20
	LDA.w #150
	STA !fzf_clock
+	RTS
endif

; ---------------------------------------------------------------------------
; FX (docs/agents/snes-port/fx.md). Map coordinates !fz_ax / !fz_ay.
if defined("FX_IMPACT")
fz_fx_xy:
	LDX !fz_ax
	LDY !fz_ay
	RTS
endif

; Gold impact spark (mod.effects impact, super).
fz_fx_impact:
if defined("FX_IMPACT")
	LDA.w #12
	STA.l !fx_a
	LDA.w #0
	STA.l !fx_b
	SEP #$20
	STA.l !fx_dir
	REP #$20
	JSR fz_fx_xy
	LDA.w #!FX_IMPACT|(!FX_F_GOLD<<8)
	JSL fx_spawn
endif
	RTS

; The gold-white flash (feedback.burst()).
fz_fx_flash:
if defined("FX_IMPACT")
	LDA.w #7
	JSL fx_flash
endif
	RTS

; A large Exploder burst (spellFx.burst large).
fz_fx_explode:
if defined("FX_IMPACT")
	LDA.w #0
	SEP #$20
	STA.l !fx_dir
	STA.l !fx_style
	REP #$20
	JSR fz_fx_xy
	LDA.w #!FX_EXPLODE
	JSL fx_spawn
endif
	RTS

; Death Ball: A16 = diameter, X16 = frame (violet).
fz_fx_deathball:
if defined("FX_IMPACT")
	STA.l !fx_a
	TXA
	STA.l !fx_t
	SEP #$20
	LDA.b #0
	STA.l !fx_style
	REP #$20
	JSR fz_fx_xy
	LDA.w #!FX_DEATHBALL
	JSL fx_draw
endif
	RTS

; Death Disc: A16 = age.
fz_fx_disc:
if defined("FX_IMPACT")
	STA.l !fx_t
	JSR fz_fx_xy
	LDA.w #!FX_DISC
	JSL fx_draw
endif
	RTS

; Finger-laser glint: A16 = age.
fz_fx_finger:
if defined("FX_IMPACT")
	STA.l !fx_t
	JSR fz_fx_xy
	LDA.w #!FX_FINGER
	JSL fx_draw
endif
	RTS

; Finger laser: A16 = age, Y16 = heading (0-15), 360 px from the finger.
fz_fx_laser:
if defined("FX_IMPACT")
	STA.l !fx_t
	TYA
	SEP #$20
	STA.l !fx_dir
	REP #$20
	LDA.w #360
	STA.l !fx_a
	LDA.w #3
	STA.l !fx_b
	JSR fz_fx_xy
	LDA.w #!FX_BEAM_LASER|(!FX_F_HEADING<<8)
	JSL fx_beam
endif
	RTS

; Gold charge orb (eruption warning): A16 = frame 0-4.
fz_fx_gold_orb:
if defined("FX_IMPACT")
	STA.l !fx_b
	LDA.w #!FX_G_ORB
	STA.l !fx_a
	SEP #$20
	LDA.b #0
	STA.l !fx_dir
	REP #$20
	JSR fz_fx_xy
	LDA.w #!FX_CELL|(!FX_F_GOLD<<8)
	JSL fx_draw
endif
	RTS

; Lightning cell: A16 = frame, X16 = quarter turn.
fz_fx_lightning:
if defined("FX_IMPACT")
	STA.l !fx_b
	TXA
	SEP #$20
	STA.l !fx_dir
	REP #$20
	LDA.w #!FX_G_LIGHTNING
	STA.l !fx_a
	JSR fz_fx_xy
	LDA.w #!FX_CELL|(!FX_F_PINK<<8)
	JSL fx_draw
endif
	RTS

; Impact spark cell: A16 = frame.
fz_fx_spark_cell:
if defined("FX_IMPACT")
	STA.l !fx_b
	LDA.w #!FX_G_IMPACT
	STA.l !fx_a
	SEP #$20
	LDA.b #0
	STA.l !fx_dir
	REP #$20
	JSR fz_fx_xy
	LDA.w #!FX_CELL
	JSL fx_draw
endif
	RTS

; Pink aura around Frieza (height 40): A16 = clock.
fz_fx_aura_pink:
if defined("FX_IMPACT")
	STA.l !fx_t
	LDA.w #256
	STA.l !fx_a
	LDA.w #40
	STA.l !fx_b
	SEP #$20
	LDA.b #2
	STA.l !fx_style
	REP #$20
	JSR fz_fx_xy
	LDA.w #!FX_AURA|(!FX_F_BACK<<8)
	JSL fx_draw
endif
	RTS

; One Exploder burst at map (!fz_ax, !fz_ay): X16 = turn 0-3, Y16 = flip
; (bit 0). C clear: A16 = fx handle; C set: no slot (or no fx).
fz_fx_explode_turned:
if defined("FX_IMPACT")
	TXA
	SEP #$20
	STA.l !fx_dir
	TYA
	STA.l !fx_style
	REP #$20
	JSR fz_fx_xy
	LDA.w #!FX_EXPLODE
	JSL fx_spawn
	RTS
else
	SEC
	RTS
endif

; Move fx effect A16 to map (X16, Y16).
fz_fx_move:
if defined("FX_IMPACT")
	JSL fx_move
endif
	RTS

; The cinematic (red, planet-killing) Death Ball at screen (X16, Y16):
; A16 = diameter, !fz_t3 = art frame.
fz_fx_deathball_screen:
if defined("FX_IMPACT")
	STA.l !fx_a
	LDA !fz_t3
	STA.l !fx_t
	SEP #$20
	LDA.b #1
	STA.l !fx_style
	REP #$20
	LDA.w #!FX_DEATHBALL|(!FX_F_SCREEN<<8)
	JSL fx_draw
endif
	RTS

; A fiery Lucent strip from (280, -16) on the screen: heading !fz_t4,
; length !fz_t5, age !fz_t6, width 2 (orbit-effects.js beam(..., hot)).
fz_fx_fire_beam:
if defined("FX_IMPACT")
	LDA !fz_t4
	SEP #$20
	STA.l !fx_dir
	REP #$20
	LDA !fz_t5
	STA.l !fx_a
	LDA.w #2
	STA.l !fx_b
	LDA.w #0
	STA.l !fx_c
	LDA !fz_t6
	STA.l !fx_t
	LDX.w #280
	LDY.w #-16
	LDA.w #!FX_BEAM_FIRE|((!FX_F_HEADING|!FX_F_SCREEN)<<8)
	JSL fx_beam
endif
	RTS

; A pink charge-orb cell (frame 1) at screen (!fz_ax, !fz_ay).
fz_fx_pink_orb_screen:
if defined("FX_IMPACT")
	LDA.w #!FX_G_ORB
	STA.l !fx_a
	LDA.w #1
	STA.l !fx_b
	SEP #$20
	LDA.b #0
	STA.l !fx_dir
	REP #$20
	JSR fz_fx_xy
	LDA.w #!FX_CELL|((!FX_F_PINK|!FX_F_SCREEN)<<8)
	JSL fx_draw
endif
	RTS

; A ki aura behind the body at screen (!fz_ax, !fz_ay): A16 = tone (0 blue,
; 1 gold, 2 pink), X16 = power 0-256, Y16 = body height, !fz_t3 = clock.
fz_fx_aura_screen:
if defined("FX_IMPACT")
	SEP #$20
	STA.l !fx_style
	REP #$20
	TXA
	STA.l !fx_a
	TYA
	STA.l !fx_b
	LDA !fz_t3
	STA.l !fx_t
	JSR fz_fx_xy
	LDA.w #!FX_AURA|((!FX_F_BACK|!FX_F_SCREEN)<<8)
	JSL fx_draw
endif
	RTS

; The Emperor's execution ray: fx's Death Beam from (280, !fz_t4) on the
; screen to the left, length !fz_t5, age !fz_t6.
fz_fx_ray_screen:
if defined("FX_IMPACT")
	LDA !fz_t6
	STA.l !fx_t
	LDA !fz_t5
	STA.l !fx_a
	LDA.w #3
	STA.l !fx_b
	SEP #$20
	LDA.b #8                          ; heading 8: to the left
	STA.l !fx_dir
	REP #$20
	LDX.w #280
	LDY !fz_t4
	LDA.w #!FX_BEAM_LASER|((!FX_F_HEADING|!FX_F_SCREEN)<<8)
	JSL fx_beam
endif
	RTS

; An impact-spark cell at screen (!fz_ax, !fz_ay): A16 = 1 pink / 0 its
; own colours, X16 = frame.
fz_fx_spark_screen:
if defined("FX_IMPACT")
	PHA
	TXA
	STA.l !fx_b
	LDA.w #!FX_G_IMPACT
	STA.l !fx_a
	SEP #$20
	LDA.b #0
	STA.l !fx_dir
	REP #$20
	JSR fz_fx_xy
	PLA
	BEQ +
	LDA.w #!FX_CELL|((!FX_F_PINK|!FX_F_SCREEN)<<8)
	BRA ++
+	LDA.w #!FX_CELL|(!FX_F_SCREEN<<8)
++	JSL fx_draw
endif
	RTS

; Debris burst of a fracture (drawFriezaDebris): chunks in the deck's
; colours and a ring of sparks.
fz_fx_debris:
if defined("FX_IMPACT")
	LDA.w #$2504                      ; rgb(4, 8, 9)
	STA.l !fx_rgb
	LDA.w #$422A                      ; rgb(10, 17, 16)
	STA.l !fx_rgb+2
	LDA.w #$42F6                      ; rgb(22, 23, 16)
	STA.l !fx_rgb+4
	LDA.w #14
	STA.l !fx_a
	LDA.w #64
	STA.l !fx_b
	JSR fz_fx_xy
	LDA.w #!FX_DEBRIS
	JSL fx_spawn
	LDA.w #8
	STA.l !fx_a
	JSR fz_fx_xy
	LDA.w #!FX_SPARKS
	JSL fx_spawn
endif
	RTS

frieza_bind_end:
assert frieza_bind_end <= !CODE_FRIEZA+$8000, "frieza bind area overflow"
pullpc
