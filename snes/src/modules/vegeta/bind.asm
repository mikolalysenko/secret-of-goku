; Vegeta's bindings to the optional modules (audio, ui, fx, combat).
; snes/src/modules.asm includes this file after every module, so the
; defined() checks see their defines whatever the include order. The code
; sits in the module's reserved area $A8:F000-FFFF and is JSR-callable from
; the rest of the module (M16/X16, DB = $7E). Without a provider a binding
; does nothing (or keeps a cartridge-side fallback, noted per routine).

pushpc
org !CODE_VEGETA+$7000
vegeta_bind_start:

; ---------------------------------------------------------------------------
; Sound effects: A = !VSFX_* (= the audio module's !AUDIO_SFX_* ids).
vb_sfx:
	CMP.w #$0000
	BNE +
	RTS
+
if defined("AUDIO_IDS")
	assert !VSFX_IMPACT == !AUDIO_SFX_IMPACT, "vegeta: audio cue ids moved"
	assert !VSFX_TELEPORT_IN == !AUDIO_SFX_TELEPORT_IN, "vegeta: audio cue ids moved"
	assert !VSFX_VEGETA_KAKAROT == !AUDIO_SFX_VEGETA_KAKAROT, "vegeta: audio cue ids moved"
	assert !VSFX_FRIEZA_IMPACT == !AUDIO_SFX_FRIEZA_IMPACT, "vegeta: audio cue ids moved"
	PHX
	PHY
	JSL audio_sfx
	PLY
	PLX
endif
	; test log: last cue and its frame
	STA.l !vs_log_sfx
	PHA
	LDA.w !core_tick&$FFFF
	STA.l !vs_log_sfx+2
	PLA
	RTS

; Music: A = 0 native, 1 Vegeta's theme, 2 the Super Saiyan arrangement.
vb_song:
	STA.l !vs_log_song
if defined("AUDIO_IDS")
	PHX
	PHY
	CMP.w #0
	BEQ .restore
	CMP.w #1
	BNE .full
	LDA.w #!AUDIO_SONG_VEGETA
	BRA .play
.full
	LDA.w #!AUDIO_SONG_VEGETA_FULL_POWER
.play
	LDX.w #0
	JSL audio_song
	PLY
	PLX
	RTS
.restore
	; the return's door loads the next map's own song; restore only in the room
	LDA $DC
	CMP.w #!VEGETA_CHAMBER_MAP
	BNE +
	JSL audio_song_restore
+	PLY
	PLX
endif
	RTS

; ---------------------------------------------------------------------------
; Telepathy lines (native-radio.js through the ui module): A = !VMSG_*.
; The ui generator names joch-trial.js's lines JOCH_TRIAL_<n> in source order.
vb_say:
	STA.l !vs_log_say
	PHA
	LDA.w !core_tick&$FFFF
	STA.l !vs_log_say+2
	PLA
if defined("UI_MSG_JOCH_TRIAL_9")
	PHX
	PHY
	ASL
	TAX
	LDA.l vb_ui_msgs,X
	LDX.w #0
	JSL ui_say
	PLY
	PLX
endif
	RTS
vb_interrupt:
	STA.l !vs_log_say
	PHA
	LDA.w !core_tick&$FFFF
	STA.l !vs_log_say+2
	PLA
if defined("UI_MSG_JOCH_TRIAL_9")
	PHX
	PHY
	ASL
	TAX
	LDA.l vb_ui_msgs,X
	LDX.w #0
	JSL ui_interrupt
	PLY
	PLX
endif
	RTS
if defined("UI_MSG_JOCH_TRIAL_9")
vb_ui_msgs:
	dw !UI_MSG_JOCH_TRIAL_0       ; VEGETA:FINAL FLASH!
	dw !UI_MSG_JOCH_TRIAL_1       ; Push back, Kakarot!
	dw !UI_MSG_JOCH_TRIAL_2       ; JEHK:Not the doorway!
	dw !UI_MSG_JOCH_TRIAL_3       ; Hmph. Not bad.
	dw !UI_MSG_JOCH_TRIAL_4       ; Super Saiyan already?
	dw !UI_MSG_JOCH_TRIAL_5       ; GOKU:Now we are talking!
	dw !UI_MSG_JOCH_TRIAL_6       ; Enough. ... Call it a draw
	dw !UI_MSG_JOCH_TRIAL_7       ; Take a breather.
	dw !UI_MSG_JOCH_TRIAL_8       ; GOKU:That was great!
	dw !UI_MSG_JOCH_TRIAL_9       ; GOKU:Still a great workout!
endif

; ---------------------------------------------------------------------------
; Combat.
; C set when Goku is in Super Saiyan form (mod.options.superSaiyan).
vb_goku_ssj:
	LDA.w !goku_form&$FFFF
	AND.w #$0001
	CMP.w #$0001
	RTS
; C set when the form is the permanent Frieza-story one.
vb_permanent_ssj:
	LDA.l !persist_ssj_lock
	AND.w #$00FF
	CMP.w #$0001
	RTS
; options.superSaiyan = false (no reversion animation), cancelCombat.
vb_set_base_form:
if defined("COMBAT_OWNER")
	LDA.w #0
	JSL combat_api_set_form
	JSL combat_api_cancel
else
	SEP #$20
	STZ.w !goku_form&$FFFF
	REP #$20
endif
	RTS
vb_cancel_combat:
if defined("COMBAT_OWNER")
	JSL combat_api_cancel
endif
	RTS

; Goku's live Kamehameha (mod.effects beam with life > 0): C set and
; !vs_gb_x/y (palms), !vs_gb_dx/dy, !vs_gb_len, !vs_gb_half (8.8),
; !vs_gb_super filled. Needs combat_api_beam (requested); test builds read
; the stand-in record a test wrote at !vs_tb_*.
vb_goku_beam:
if defined("COMBAT_API_BEAM")
	JSL combat_api_beam
	RTS
else
	LDA.l !vs_tb_on
	AND.w #$00FF
	BNE +
	CLC
	RTS
+	LDX.w #$000E
-	LDA.l !vs_tb_x,X
	STA.l !vs_gb_x,X
	DEX
	DEX
	BPL -
	SEC
	RTS
endif
vb_goku_beam_live:
	JMP vb_goku_beam

; beamTouchesShot(beam, geometry, shot) for shot X (radius 4): C set.
vb_beam_touches_shot:
	PHX
	JSR vb_goku_beam
	PLX
	BCS +
	RTS
+	; rx, ry from the palms
	LDA.l !vs_shots,X
	SEC
	SBC.l !vs_gb_x
	STA.l !vs_s4
	LDA.l !vs_shots+2,X
	SEC
	SBC.l !vs_gb_y
	STA.l !vs_s5
	LDA.l !vs_gb_dx
	BEQ .vert
	BMI +
	LDA.l !vs_s4
	BRA ++
+	LDA.l !vs_s4
	EOR.w #$FFFF
	INC
++	STA.l !vs_s6                  ; along
	LDA.l !vs_s5
	JSR vg_abs
	STA.l !vs_s7                  ; across
	BRA .test
.vert
	LDA.l !vs_gb_dy
	BMI +
	LDA.l !vs_s5
	BRA ++
+	LDA.l !vs_s5
	EOR.w #$FFFF
	INC
++	STA.l !vs_s6
	LDA.l !vs_s4
	JSR vg_abs
	STA.l !vs_s7
.test
	; along >= -4 and along <= length + 4
	LDA.l !vs_s6
	CLC
	ADC.w #4
	BMI .no
	SEC
	SBC.w #8
	SEC
	SBC.l !vs_gb_len
	BEQ +
	BPL .no
+	; width = half * (taper ? min(1, max(0, along)/44) : 1); across <= width + 4
	LDA.l !vs_gb_half
	STA !vg_t3
	LDA.l !vs_gb_mega
	AND.w #$00FF
	BEQ .width
	LDA.l !vs_s6
	BPL +
	LDA.w #0
+	CMP.w #44
	BCS .width
	LDX !vg_t3
	JSR vg_mul16
	LDX.w #44
	JSR vg_div32
	STA !vg_t3
.width
	LDA.l !vs_s7
	SEC
	SBC.w #4
	BMI .yes
	CMP.w #$0100
	BCS .no
	XBA
	CMP !vg_t3
	BEQ .yes
	BCC .yes
.no
	CLC
	RTS
.yes
	SEC
	RTS

; Combat locks: dangerous encounter (no damage scaling for Goku), and the
; whole pad for the clash and the draw.
vb_danger:
	; A = 1 on, 0 off; changes only on transitions
	SEP #$20
	CMP.b #$00
	BEQ .off
	LDA !vg_misc
	BIT.b #$01
	BNE .done
	ORA.b #$01
	STA !vg_misc
	REP #$20
if defined("COMBAT_OWNER")
	LDA.w #!VEGETA_OWNER
	JSL combat_api_danger
endif
	RTS
.off
	LDA !vg_misc
	BIT.b #$01
	BEQ .done
	AND.b #$FE
	STA !vg_misc
	REP #$20
if defined("COMBAT_OWNER")
	LDA.w #!VEGETA_OWNER
	JSL combat_api_safe
endif
	RTS
.done
	REP #$20
	RTS

vb_input_lock:
	; A = 1 on, 0 off
	SEP #$20
	CMP.b #$00
	BEQ .off
	LDA !vg_misc
	BIT.b #$02
	BNE .done
	ORA.b #$02
	STA !vg_misc
	REP #$20
if defined("COMBAT_OWNER")
	LDA.w #!VEGETA_OWNER
	JSL combat_api_input_lock
endif
	RTS
.off
	LDA !vg_misc
	BIT.b #$02
	BEQ .done
	AND.b #$FD
	STA !vg_misc
	REP #$20
if defined("COMBAT_OWNER")
	LDA.w #!VEGETA_OWNER
	JSL combat_api_input_unlock
endif
	RTS
.done
	REP #$20
	RTS

; Goku holds his firing pose through the clash (mod.action = beam, age 7).
vb_clash_pose_on:
	LDA.w #1
	JSR vb_input_lock
	SEP #$20
	LDA.b #!GOKU_K_BEAM
	STA.w !goku_act&$FFFF
	LDA.l !vc_dy
	BMI .up
	BNE .down
	LDA.l !vc_dx
	BMI .left
	LDA.b #1
	BRA .face
.left
	LDA.b #2
	BRA .face
.up
	LDA.b #3
	BRA .face
.down
	LDA.b #0
.face
	STA.w !goku_act_facing&$FFFF
	LDA.l !vc_super
	BEQ +
	LDA.b #$80
+	STA.w !goku_act_arg&$FFFF
	LDA.b #$FF
	STA.w !goku_act_dur&$FFFF
	REP #$20
	LDA.w #7
	STA.w !goku_act_age&$FFFF
	RTS
vb_clash_pose_off:
	SEP #$20
	LDA.w !goku_act&$FFFF
	CMP.b #!GOKU_K_BEAM
	BNE +
	STZ.w !goku_act&$FFFF
+	REP #$20
	LDA.w #0
	JMP vb_input_lock

; Everything the trial held (vg_end).
vb_release_all:
	SEP #$20
	LDA !vg_misc
	REP #$20
	AND.w #$0002
	BEQ +
	JSR vb_clash_pose_off
+	LDA.w #0
	JSR vb_danger
	RTS

; ---------------------------------------------------------------------------
; Feedback (native-feedback.js): pulse(n) = native BG quake for n frames;
; burst() = gold-white flash 7 + quake 9.
vb_pulse:
if defined("FX_CELL")
	PHX
	PHY
	JSL fx_quake
	PLY
	PLX
endif
	RTS
vb_feedback_burst:
if defined("FX_CELL")
	LDA.w #7
	JSL fx_flash
	LDA.w #9
	JSL fx_quake
endif
	RTS

; ---------------------------------------------------------------------------
; FX draws (fx module, docs/agents/snes-port/fx.md). X/Y = map pixels.
; FX_CELL: A = group, !vs_s2 = frame.
vb_fx_cell:
if defined("FX_CELL")
	PHX
	STA.l !FX_SRAM+$02
	LDA.l !vs_s2
	STA.l !FX_SRAM+$04
	SEP #$20
	LDA.b #0
	STA.l !FX_SRAM+$00
	REP #$20
	PLX
	LDA.w #!FX_CELL
	JSL fx_draw
endif
	RTS
; Gold/impact spark on the beam lane: frame !vs_s2.
vb_fx_spark:
	LDA !vg_tier
	AND.w #$0001
	BEQ +
	LDA.w #6                       ; gold-spark
	JMP vb_fx_cell
+	LDA.w #3                       ; impact-spark
	JMP vb_fx_cell
; Charge orb (gold in Super Saiyan): frame !vs_s2.
vb_fx_orb:
if defined("FX_CELL")
	PHX
	LDA.l !vs_s2
	STA.l !FX_SRAM+$02
	SEP #$20
	LDA !vg_facing
	STA.l !FX_SRAM+$00
	REP #$20
	PLX
	LDA !vg_tier
	AND.w #$0001
	BEQ +
	LDA.w #!FX_ORB|(!FX_F_GOLD<<8)
	BRA ++
+	LDA.w #!FX_ORB
++	JSL fx_draw
endif
	RTS
; Aura behind him: power !vs_s0 (0-256), clock !vs_s1, gold in Super Saiyan.
vb_fx_aura:
if defined("FX_CELL")
	PHX
	LDA.l !vs_s0
	STA.l !FX_SRAM+$02
	LDA.w #40
	STA.l !FX_SRAM+$04
	LDA.l !vs_s1
	STA.l !FX_SRAM+$08
	SEP #$20
	LDA !vg_tier
	AND.b #$01
	STA.l !FX_SRAM+$01
	REP #$20
	PLX
	LDA.w #!FX_AURA|(!FX_F_BACK<<8)
	JSL fx_draw
endif
	RTS
; Vegeta's wave: origin !vs_beam_x/y, his facing, length !vs_beam_len,
; half width !vs_s2 (whole px), taper 44, age (!vg_act_age >> 1).
vb_fx_vegeta_beam:
if defined("FX_CELL")
	LDA.l !vs_beam_len
	STA.l !FX_SRAM+$02
	LDA.l !vs_s2
	STA.l !FX_SRAM+$04
	LDA.w #44
	STA.l !FX_SRAM+$06
	LDA !vg_act_age
	LSR
	STA.l !FX_SRAM+$08
	SEP #$20
	LDA !vg_facing
	STA.l !FX_SRAM+$00
	REP #$20
	LDA.l !vs_beam_y
	TAY
	LDA.l !vs_beam_x
	TAX
	LDA !vg_tier
	AND.w #$0001
	BEQ +
	LDA.w #!FX_BEAM_FINAL
	BRA ++
+	LDA.w #!FX_BEAM_GALICK
++	JSL fx_beam
endif
	RTS

; The clash: both waves to the ball, the arcs and the core spark.
; Ball !vs_s0/!vs_s1, width !vs_s2, tail !vs_s3 (8.8), phase !vs_s7.
vb_fx_clash:
if defined("FX_CELL")
	; pulse = (phase & 1) * 2
	LDA.l !vs_s7
	AND.w #$0001
	ASL
	STA.l !vs_s6
	; Goku's wave: from (fx, fy) along d, half (width + pulse) * tail
	LDA.l !vs_s2
	CLC
	ADC.l !vs_s6
	JSR vb_tail
	STA.l !FX_SRAM+$04
	LDA.l !vc_fx
	STA.l !vs_s4
	LDA.l !vc_fy
	STA.l !vs_s5
	LDA.l !vc_dy
	TAX
	LDA.l !vc_dx
	JSR vb_wave_len               ; A = (ball - from) . d
	BMI .noGoku
	BEQ .noGoku
	STA.l !FX_SRAM+$02
	LDA.w #36
	STA.l !FX_SRAM+$06
	LDA.l !vs_s7
	ASL
	STA.l !FX_SRAM+$08
	LDA.l !vc_dy
	TAX
	LDA.l !vc_dx
	JSR vb_facing_of
	SEP #$20
	STA.l !FX_SRAM+$00
	REP #$20
	LDA.l !vc_fy
	TAY
	LDA.l !vc_fx
	TAX
	LDA.w #!FX_BEAM_WAVE
	JSL fx_beam
.noGoku
	; Vegeta's wave: from (tx, ty) along -d, half (width + 2 - pulse) * tail
	LDA.l !vs_s2
	CLC
	ADC.w #2
	SEC
	SBC.l !vs_s6
	JSR vb_tail
	STA.l !FX_SRAM+$04
	LDA.l !vc_tx
	STA.l !vs_s4
	LDA.l !vc_ty
	STA.l !vs_s5
	LDA.l !vc_dx
	EOR.w #$FFFF
	INC
	PHA
	LDA.l !vc_dy
	EOR.w #$FFFF
	INC
	TAX
	PLA
	JSR vb_wave_len
	BMI .noVegeta
	BEQ .noVegeta
	STA.l !FX_SRAM+$02
	LDA.w #36
	STA.l !FX_SRAM+$06
	LDA.l !vs_s7
	ASL
	STA.l !FX_SRAM+$08
	LDA.l !vc_dx
	EOR.w #$FFFF
	INC
	PHA
	LDA.l !vc_dy
	EOR.w #$FFFF
	INC
	TAX
	PLA
	JSR vb_facing_of
	SEP #$20
	STA.l !FX_SRAM+$00
	REP #$20
	LDA.l !vc_ty
	TAY
	LDA.l !vc_tx
	TAX
	LDA.l !vc_tier
	AND.w #$00FF
	BEQ +
	LDA.w #!FX_BEAM_FINAL
	BRA ++
+	LDA.w #!FX_BEAM_GALICK
++	JSL fx_beam
.noVegeta
	; the ball's arcs and spark while the tail lasts
	LDA.l !vs_s3
	BEQ .done
	LDA.l !vs_s7
	STA.l !vs_s2
	LDA.l !vs_s1
	TAY
	LDA.l !vs_s0
	TAX
	LDA.w #3                       ; impact-spark at the core
	JSR vb_fx_cell
.done
endif
	RTS
if defined("FX_CELL")
; A = value * tail (8.8 in !vs_s3), rounded.
vb_tail:
	PHA
	LDA.l !vs_s3
	TAX
	PLA
	CPX.w #256
	BEQ +
	JSR vg_mul16
	LDA !vm_a0
	CLC
	ADC.w #128
	XBA
	AND.w #$00FF
+	RTS
; A/X = direction (dx, dy): A = (ball - origin) . d, origin in !vs_s4/!vs_s5.
vb_wave_len:
	CMP.w #$0000
	BEQ .vert
	BMI .left
	LDA.l !vs_s0
	SEC
	SBC.l !vs_s4
	RTS
.left
	LDA.l !vs_s4
	SEC
	SBC.l !vs_s0
	RTS
.vert
	TXA
	BMI .up
	LDA.l !vs_s1
	SEC
	SBC.l !vs_s5
	RTS
.up
	LDA.l !vs_s5
	SEC
	SBC.l !vs_s1
	RTS
; A/X = (dx, dy) -> A = facing 0 down, 1 right, 2 left, 3 up.
vb_facing_of:
	CMP.w #$0000
	BEQ .vert
	BMI +
	LDA.w #1
	RTS
+	LDA.w #2
	RTS
.vert
	TXA
	BMI +
	LDA.w #0
	RTS
+	LDA.w #3
	RTS
endif

; The clash's detonation at the ball (spawned once at the 'detonate' cue).
vb_fx_detonate:
if defined("FX_CELL")
	JSR vg_clash_point
	LDA.l !vs_s1
	TAY
	LDA.l !vs_s0
	TAX
	LDA.w #!FX_DETONATE
	JSL fx_spawn
endif
	RTS

; A burst record X was created (bursts are drawn per frame through FX_CELL;
; nothing to spawn).
vb_burst_spawn:
	RTS

vegeta_bind_end:
assert vegeta_bind_end <= !CODE_VEGETA+$8000, "vegeta bind area overflow"
pullpc
