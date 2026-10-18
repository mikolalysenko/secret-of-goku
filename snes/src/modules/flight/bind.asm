; Flight bindings to optional modules (combat, audio, ui, world, fx).
; snes/src/modules.asm includes this file after every module (before the
; story hook tables), so the defined() checks see each provider's defines
; whatever the include order. The code sits in flight's reserved area
; $A3:F000-FFFF and is JSR-callable from the rest of the module.
; Calling convention: M16/X16 in and out, DB = $7E; A/X/Y as noted.

pushpc
org !CODE_FLIGHT+$7000
flight_bind_start:

; Combat (snes/src/modules/combat): Saiyan recoil at C0:D651 (flight owns
; that patch site, !FLIGHT_OWNS_D651), cancelCombat() for Instant
; Transmission, and the Kamehameha charge state.
fl_bind_recoil:                  ; M16/X16 (fl_hook_d651's first lines); A and flags not kept
if defined("CB")
	; as combat's own C0:D651 hook (combat_hook_move_vector): the recoil
	; runs only in an ordinary hit recovery (cb_hr_tier 1)
	LDA.l $7E0000|!cb_hr_tier
	AND.w #$00FF
	CMP.w #$0001
	BNE +
	JSL combat_recoil_vector
+
endif
	RTS
fl_bind_cancel:
if defined("CB")
	JSL combat_api_cancel
endif
	RTS
; A16 = field video clock, including NMIs whose logic frame was not ready.
; A flight-only build has no combat NMI hook and uses completed frames.
fl_bind_clock:
if defined("CB")
	LDA.l $7E0000|!cb_vblanks
else
	LDA.l !core_frame
endif
	RTS
if defined("FLIGHT_TEST")
fl_bind_test_lag:
if defined("CB")
	; Leave NMI running while the frame thread misses three video frames.
	; Defined here, after combat's clock provider is known to the assembler.
	JSR fl_bind_clock
	PHA
-	JSR fl_bind_clock
	SEC
	SBC $01,S
	CMP.w #3
	BCC -
	PLA
endif
	RTS
endif
; Carry = combat is charging (combat_api_state bit 1).
fl_bind_charging:
if defined("CB")
	PHX
	PHY
	JSL combat_api_state
	PLY
	PLX
	AND.w #$0002
	BEQ +
	SEC
	RTS
+
endif
	CLC
	RTS

; Without the combat module B stays Goku's: the browser hides it from the
; game whenever he can act (combat's own input filter does this otherwise).
fl_bind_mask_b:
if not(defined("CB"))
	LDA.w !core_pad_mask&$FFFF
	ORA.w #!PAD_B
	STA.w !core_pad_mask&$FFFF
endif
	RTS
; walk mode's pad mask (flight_frame .walk, ORA.l): A, and B as above
fl_walk_mask:
if defined("CB")
	dw !PAD_A
else
	dw !PAD_A|!PAD_B
endif

; Audio (snes/src/modules/audio): DBZ cues and the flight air bed. The
; !FL_SFX_* ids are defined in module.asm (the module uses them before this
; file is included); they must match the audio module's.
if defined("AUDIO_IDS")
	assert !AUDIO_SFX_SWING == !FL_SFX_SWING, "flight: audio cue ids moved"
	assert !AUDIO_SFX_IMPACT == !FL_SFX_IMPACT, "flight: audio cue ids moved"
	assert !AUDIO_SFX_TELEPORT == !FL_SFX_TELEPORT, "flight: audio cue ids moved"
	assert !AUDIO_SFX_TELEPORT_IN == !FL_SFX_TELEPORT_IN, "flight: audio cue ids moved"
	assert !AUDIO_SFX_FLIGHT == !FL_SFX_FLIGHT, "flight: audio cue ids moved"
	assert !AUDIO_SFX_LANDING == !FL_SFX_LANDING, "flight: audio cue ids moved"
	assert !AUDIO_LOOP_AIR == 2, "flight: audio loop ids moved"
endif
; A = cue id. Preserves X/Y.
fl_bind_sfx:
if defined("AUDIO_IDS")
	JSL audio_sfx
endif
	RTS
; The air bed while Goku flies (ki-sound.js: level 1, .35 while charging).
; A = 1 charging, 0 not.
fl_bind_air:
if defined("AUDIO_IDS")
	PHX
	PHY
	TAX
	BEQ +
	LDX.w #89
	BRA ++
+	LDX.w #255
++	LDY.w #$0080
	LDA.w #!AUDIO_LOOP_AIR
	JSL audio_loop
	PLY
	PLX
endif
	RTS

; UI (snes/src/modules/ui): King Kai / Luka remarks.
; First hover with control (power-intro.js first-flight banter).
fl_bind_ui_hover:
if defined("UIF_INTRO_FLIGHT")
	JSL ui_power_intro_flight
endif
	RTS
; A = map Goku punched out of (radio.escapedCeiling).
fl_bind_ui_ceiling:
if defined("UIF_INTRO_FLIGHT")
	JSL ui_ceiling_escape
endif
	RTS

; World (snes/src/modules/world, present when !WORLD_MAGIC is defined):
; takeoff into world flight from the field (native-flight.js request()).
; The world module serves the L+R chord itself; the ceiling escape acts only
; where world_takeoff_allowed says no, and asks world_takeoff from the
; room's exterior. Without the module the game's own world request
; $0C00|map (the Drum's path) is used with the same checks.
; C clear = requested.
fl_bind_world_takeoff:
if defined("WORLD_MAGIC")
	JSL world_takeoff
	RTS
else
	JSR fl_bind_world_allowed
	BCS +
	LDA $DC
	AND.w #$00FF
	ORA.w #$0C00
	JSL core_event_request
+	RTS
endif
; C clear when a world takeoff can start from here now.
fl_bind_world_allowed:
if defined("WORLD_MAGIC")
	JSL world_takeoff_allowed
	RTS
else
	; Goku can act, nothing queued, idle native field, and the map header's
	; world-flight bit (C8:7000 header + 4, bit 7)
	LDA.w !FLIGHT_B_STATE
	AND.w #!FLS_CAN
	BEQ .no
	LDA.w !core_event_req&$FFFF
	BNE .no
	SEP #$20
	LDA $E8
	AND.b #$04
	ORA $FF
	REP #$20
	BNE .no
	LDA $DC
	CMP.w #512
	BCS .no
	ASL
	TAX
	LDA.l $C87000,X
	TAX
	LDA.l $C80004,X
	AND.w #$0080
	BEQ .no
	CLC
	RTS
.no
	SEC
	RTS
endif
; L+R where world flight is allowed: with the world module nothing to do
; (it requests the takeoff in its own frame); without it, the native
; request. C clear = a takeoff was (or will be) requested.
fl_bind_world_lr:
if defined("WORLD_MAGIC")
	CLC
	RTS
else
	JMP fl_bind_world_takeoff
endif

; Endings (snes/src/modules/ending): Goku cannot act once the finale has
; begun (mana-mod.js canAttack: !mod.ending.active, shenron-ending.js
; active = a state since begin()). Carry set = it has. M16; A changes.
fl_bind_ending:
if defined("ending_flags")
	LDA.l !ending_flags
	AND.w #!EF_BEGUN
	BEQ +
	SEC
	RTS
+
endif
	CLC
	RTS

; Floor holes (Frieza's broken deck, the Sandship wreck): the owner defines
; !FLIGHT_MISSING_FLOOR = <routine>: JSL with !fl_q_x/y/l set (M16/X16,
; DB = $7E), carry set when a hole lies under the 12x8 footprint there; it
; leaves !fl_q_x/y/l as they were (fl_walk_holes asks twice in a step).
; fl_bind_walk_holes: the hero step's check (fl_walk_holes) when such a
; provider is in the build.
fl_bind_walk_holes:
if defined("FLIGHT_MISSING_FLOOR")
	JMP fl_walk_holes
else
	RTS
endif
; carry = a hole under the footprint at fl_q_x/y/l
fl_bind_hole:
if defined("FLIGHT_MISSING_FLOOR")
	JSL !FLIGHT_MISSING_FLOOR
	RTS
else
	CLC
	RTS
endif
; the same as a JSL target (fl_walk_holes, at every hero step on foot)
fl_bind_hole_l:
if defined("FLIGHT_MISSING_FLOOR")
	JML !FLIGHT_MISSING_FLOOR
else
	CLC
	RTL
endif
; Flight asks only on the maps where the browser's providers have holes
; (!FLM_HOLES: the Sandship's maps, Frieza's arena). A provider with holes
; elsewhere defines !FLIGHT_FLOOR_ANYWHERE (flight's test hole does): carry.
fl_bind_floor_anywhere:
if defined("FLIGHT_FLOOR_ANYWHERE")
	SEC
else
	CLC
endif
	RTS

; Sandship runtime (no owner yet): sandship.takeoff() on L+R. The owner
; defines !SANDSHIP_TAKEOFF = <routine>: JSL, carry set when it handled the
; chord (an unfinished ship blows up instead of any takeoff).
fl_bind_ship_takeoff:
if defined("SANDSHIP_TAKEOFF")
	JSL !SANDSHIP_TAKEOFF
	RTS
else
	CLC
	RTS
endif

; Story (snes/src/modules/story): story.travel(door), A16 = door. Carry set
; when queued.
fl_bind_travel:
	JSL story_api_travel
	RTS

; FX (snes/src/modules/fx): the ceiling escape's roof chunks and sparks at
; X/Y (map pixels) in the room's colours (fl_t0 stone, fl_t1 highlight; dark
; is black), and the 24-frame quake (native-feedback.js pulse(24)).
fl_bind_fx_ceiling:
if defined("FX_DEBRIS")
	PHX
	PHY
	LDA.w #$0000
	STA.l !fx_rgb
	LDA.w !FLIGHT_B_T0
	STA.l !fx_rgb+2
	LDA.w !FLIGHT_B_T1
	STA.l !fx_rgb+4
	LDA.w #8
	STA.l !fx_a
	LDA.w #!FX_SPARKS
	JSL fx_spawn
	LDA $03,S
	TAX
	LDA $01,S
	TAY
	SEP #$20
	LDA.b #$01                   ; ceiling-escape layout (ceiling-escape.js draw)
	STA.l !fx_style
	REP #$20
	LDA.w #20
	STA.l !fx_a
	LDA.w #46
	STA.l !fx_b
	LDA.w #!FX_DEBRIS
	JSL fx_spawn
	PLY
	PLX
	LDA.w #24
	JSL fx_quake
endif
	RTS
; feedback.clear() when an escape is cancelled.
fl_bind_fx_clear:
if defined("FX_DEBRIS")
	JSL fx_kill_all
endif
	RTS

flight_bind_end:
assert flight_bind_end <= !CODE_FLIGHT+$8000, "flight binding area overflow"
pullpc
