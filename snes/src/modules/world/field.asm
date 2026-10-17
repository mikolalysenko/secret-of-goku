; Field side of world flight: L+R takeoff, Goku's takeoff/landing poses
; (engine/mana-mod.js flightTransition) and the damaged-deck follow-up.

; modules_field_frame. M16/X16, DB = $7E, D = 0.
world_field_frame:
if defined("GOKU_TRACE")
	RTL                              ; goku's test trace overwrites $7E:7F00
endif
	JSR world_ram_check
	LDA.w #!CORE_MODE_FIELD
	STA.w !w_mode_prev
	JSR world_goku
	BCS +
	RTL
+	JSR wf_transition
	JSR wf_takeoff_chord
	JSR wf_finale
	RTL

; Takeoff / landing pose for the goku module (mode $26 / $27 with its age).
; Takeoff ages every field frame; landing only while Goku is visible
; (screen lit and the hero active), so his descent plays during the ground
; fade-in. Both end after 32 frames (mana-mod.js).
wf_transition:
	LDA.w !w_trans_kind
	BEQ .none
	CMP.w #!TRANS_LANDING
	BNE .age
	SEP #$20
	LDA $E6                          ; INIDISP of the next frame
	BMI .hold
	AND.b #$0F
	BEQ .hold
	LDA.l $7EE000
	LSR
	BCC .hold
	REP #$20
.age
	INC.w !w_trans_age
	LDA.w !w_trans_age
	CMP.w #33
	BCS .finish
	CMP.w #24
	BNE .request
	LDA.w !w_trans_kind
	CMP.w #!TRANS_LANDING
	BNE .request
	JSR world_sfx_landing
	BRA .request
.hold
	REP #$20
.request
	LDA.w !w_trans_kind
	CMP.w #!TRANS_LANDING
	SEP #$20
	LDA.b #!GOKU_K_TAKEOFF
	BCC +
	LDA.b #!GOKU_K_LANDING
+	STA.w !goku_mode
	REP #$20
	LDA.w !w_trans_age
	STA.w !goku_mode_age
	RTS
.finish
	STZ.w !w_trans_kind
	STZ.w !w_trans_age
	JSR wf_release_mode
.none
	RTS

; Clear goku's mode if it is still one of ours.
wf_release_mode:
	SEP #$20
	LDA.w !goku_mode
	CMP.b #!GOKU_K_TAKEOFF
	BEQ .clear
	CMP.b #!GOKU_K_LANDING
	BNE .keep
.clear
	STZ.w !goku_mode
.keep
	REP #$20
	RTS

; L+R takes off where the map allows flight. Elsewhere the flight module's
; ceiling escape owns the chord (it calls world_takeoff once outdoors).
wf_takeoff_chord:
	LDA.w !core_pad&$FFFF
	AND.w #!PAD_L|!PAD_R
	CMP.w #!PAD_L|!PAD_R
	BEQ .held
	STZ.w !w_lr_held
	RTS
.held
	LDA.w !w_lr_held
	BNE .done
	INC.w !w_lr_held
	JSL world_takeoff
	BCS .done
	LDA.w #$FFF0                     ; the chord itself reaches no other reader
	TSB.w !core_pad_mask&$FFFF
.done
	RTS

; After the Fortress fell, the landing on its deck starts the
; post-destruction conversation: story event $8B through story_api_request
; (the browser's story.request(0x8b): nothing queued, Goku can act).
wf_finale:
	LDA.l !pw_flags
	AND.w #!PWF_FINALE
	BEQ .done
	LDA $DC
	AND.w #$01FF
	CMP.w #255
	BNE .done
	LDA.w #$008B
	LDX.w #$0000
	JSL story_api_request
	BCC .done                        ; carry set = queued
	SEP #$20
	LDA.l !pw_flags
	AND.b #$FF^!PWF_FINALE
	STA.l !pw_flags
	REP #$20
.done
	RTS
