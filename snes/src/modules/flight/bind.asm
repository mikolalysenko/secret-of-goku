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
fl_bind_recoil:                  ; any M/X; preserves everything
if defined("CB")
	JSL combat_recoil_vector
endif
	RTS
fl_bind_cancel:
if defined("CB")
	JSL combat_api_cancel
endif
	RTS
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

; Audio (snes/src/modules/audio): DBZ cues and the flight air bed.
!FL_SFX_SWING       = 1
!FL_SFX_IMPACT      = 6
!FL_SFX_TELEPORT    = 16
!FL_SFX_TELEPORT_IN = 17
!FL_SFX_FLIGHT      = 18
!FL_SFX_LANDING     = 19
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

; World (snes/src/modules/world): takeoff into world flight from the field.
; The world module defines !WORLD_TAKEOFF = <its routine>: JSL, carry set
; when the takeoff was accepted (native-flight.js request()). Without it
; the game's own world request $0C00|map starts the native departure.
fl_bind_world_takeoff:
if defined("WORLD_TAKEOFF")
	JSL !WORLD_TAKEOFF
	RTS
else
	LDA $DC
	AND.w #$01FF
	ORA.w #$0C00
	JSL core_event_request
	BCS +
	SEC
	RTS
+	CLC
	RTS
endif

flight_bind_end:
assert flight_bind_end <= !CODE_FLIGHT+$8000, "flight binding area overflow"
pullpc
