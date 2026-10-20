; Combat bindings to optional modules (audio, ui, destroy, fx, frieza
; resistance hook, flight's movement hook). snes/src/modules.asm includes
; this file after every module, so the `defined()` checks below see their
; defines whatever the include order; the code sits in combat's reserved
; area $A2:F000-FFFF and is JSR-callable from the rest of the module.
; Re-binding a provider is a change to this file only.

pushpc
org !CODE_COMBAT+$7000
combat_bind_start:

; teleport.pending also covers recovery camera moves with no teleport
; action. Keep attacks/focus from starting until its streamed rows arrive.
cb_bind_camera_pending:
if defined("FLIGHT_API_CAMERA")
	LDA.l $7E0000|!fl_hook
	AND.w #!FLH_CAMERA
else
	LDA.w #$0000
endif
	RTS

; ---------------------------------------------------------------------------
; Audio (docs/agents/snes-port/audio.md): streamed DBZ cues, Kamehameha
; voice and loops. Without the module a few cues fall back to the game's
; own effects through core_sound_queue.
if defined("AUDIO_IDS")
	assert !AUDIO_SFX_SWING == !AUDIO_SFX_SWING_ID, "combat: audio cue ids moved"
	assert !AUDIO_SFX_HIT == !AUDIO_SFX_HIT_ID, "combat: audio cue ids moved"
	assert !AUDIO_SFX_POWER_BURST == !AUDIO_SFX_POWER_BURST_ID, "combat: audio cue ids moved"
	assert !AUDIO_SFX_DEFLECT == !AUDIO_SFX_DEFLECT_ID, "combat: audio cue ids moved"
	assert !AUDIO_LOOP_CHARGE == 0, "combat: audio loop ids moved"
	assert !AUDIO_LOOP_AURA == 1, "combat: audio loop ids moved"
endif

; C set when the audio module is present (the native hit sound is replaced).
cb_bind_has_audio:
if defined("AUDIO_IDS")
	SEC
else
	CLC
endif
	RTS

; A16 = cue id (!AUDIO_SFX_*_ID; 0 = none). Any DB; preserves X/Y.
cb_sfx:
cb_sfx_long:
	PHP
	REP #$30
	AND.w #$00FF
	BEQ .out
if defined("AUDIO_IDS")
	JSL audio_sfx
else
	; fallback: the game's own effects for the main beats
	PHX
	PHY
	PHB
	PEA $7E7E
	PLB
	PLB
	TAX
	LDA.l cb_native_cue-1,X
	AND.w #$00FF
	BEQ .none
	XBA
	ORA.w #$0002                  ; command 02 (effect), param = id
	LDX.w #$880F                  ; volume $0F, pan $88
	JSL core_sound_queue
.none
	PLB
	PLY
	PLX
endif
.out
	PLP
	RTS
if not(defined("AUDIO_IDS"))
; native effect per cue id 1-32 (0 = silent): hits $50, form changes $12
cb_native_cue:
	db $00,$00,$50,$50,$00,$50,$00,$00, $00,$12,$12,$12,$50,$50,$50,$00
	db $00,$00,$00,$00,$00,$00,$00,$00, $00,$00,$00,$00,$00,$00,$00,$00
endif

; cancelCombat(): drop combat cues, the charge/aura beds and the chant.
cb_bind_sfx_cancel:
if defined("AUDIO_IDS")
	JSL audio_cancel
endif
	RTS

; The chant starts with a charge; release replaces it by the shout.
cb_bind_voice_start:
if defined("AUDIO_IDS")
	PHP
	REP #$30
	LDA.w #$0001
	JSL audio_voice
	PLP
endif
	RTS
cb_bind_voice_release:
if defined("AUDIO_IDS")
	PHP
	REP #$30
	LDA.w #$0002
	JSL audio_voice
	PLP
endif
	RTS

; Per-frame energy beds (ki-sound.js update()): A16 unused. Charge bed while
; charging, focusing or revealing; aura bed for strong focus, the reveal or
; a strong Super Saiyan charge. Levels/rates are the browser's, scaled to
; 1-255 / $80 = 1.0.
cb_bind_loops:
if defined("AUDIO_IDS")
	; beds sound only while focusing, revealing or charging (an action runs)
	LDA !cb_act
	AND.w #$00FF
	BNE +
	RTS
+	LDA !cb_can
	AND.w #$00FF
	BNE +
	LDA !cb_world
	AND.w #$00FF
	BNE +
	RTS
+
if not(defined("AUDIO_PCM"))
	; Resident audio only needs an active charge pulse. Its level/rate is
	; fixed by the short SPC sequence, so skip the PCM envelope arithmetic
	; and the second aura-bed request. Keep the same action/charge gates.
	LDA !cb_act
	AND.w #$00FF
	CMP.w #!GOKU_K_FOCUS
	BEQ .nativePulse
	CMP.w #!GOKU_K_TRANSFORM
	BEQ .nativePulse
	LDA !cb_charging
	AND.w #$00FF
	BNE .nativePulse
	RTS
.nativePulse
	LDA.w #!AUDIO_LOOP_CHARGE
	LDX.w #128
	LDY.w #128
	JSL audio_loop
	RTS
endif
	; focus amount 0-256 (powerCharge / 96) and charge strength 0-256
	LDA !cb_power
	CMP.w #96
	BCC +
	LDA.w #96
+	ASL
	TAX
	LDA.l combat_focus256,X
	STA !cb_t0                    ; focus
	JSR cb_bind_strength
	STA !cb_t1                    ; strength
	SEP #$20
	LDA !cb_act
	CMP.b #!GOKU_K_FOCUS
	BEQ .focus
	CMP.b #!GOKU_K_TRANSFORM
	BEQ .reveal
	LDA !cb_charging
	BNE .charge
	REP #$20
	RTS
.focus
	REP #$20
	; charge bed: level .22 + .85 f, rate .72 + .3 f
	LDA !cb_t0
	LDX.w #218                    ; .85 * 256
	JSR cb_bind_scale
	CLC
	ADC.w #56                     ; .22 * 255
	JSR cb_bind_cap255
	TAX
	LDA !cb_t0
	PHX
	LDX.w #38                     ; .3 * 128
	JSR cb_bind_scale
	CLC
	ADC.w #92                     ; .72 * 128
	TAY
	PLX
	LDA.w #!AUDIO_LOOP_CHARGE
	JSL audio_loop
	; aura bed when focus > .4: level f, rate .8 + .2 f
	LDA !cb_t0
	CMP.w #103
	BCC .out
	JSR cb_bind_cap255
	TAX
	LDA !cb_t0
	PHX
	LDX.w #26
	JSR cb_bind_scale
	CLC
	ADC.w #102
	TAY
	PLX
	LDA.w #!AUDIO_LOOP_AURA
	JSL audio_loop
.out
	RTS
.reveal
	REP #$20
	LDX.w #217                    ; .85
	LDY.w #$0080
	LDA.w #!AUDIO_LOOP_CHARGE
	JSL audio_loop
	LDX.w #255
	LDY.w #$0080
	LDA.w #!AUDIO_LOOP_AURA
	JSL audio_loop
	RTS
.charge
	REP #$20
	; level .48 + .52 s, rate .94 + .12 s
	LDA !cb_t1
	LDX.w #133
	JSR cb_bind_scale
	CLC
	ADC.w #122
	JSR cb_bind_cap255
	TAX
	LDA !cb_t1
	PHX
	LDX.w #15
	JSR cb_bind_scale
	CLC
	ADC.w #120
	TAY
	PLX
	LDA.w #!AUDIO_LOOP_CHARGE
	JSL audio_loop
	; aura bed for a strong Super Saiyan charge: level s, rate 1
	LDA !cb_form
	AND.w #$00FF
	BEQ +
	LDA !cb_t1
	CMP.w #90                     ; .35
	BCC +
	JSR cb_bind_cap255
	TAX
	LDY.w #$0080
	LDA.w #!AUDIO_LOOP_AURA
	JSL audio_loop
+
endif
	RTS

if defined("AUDIO_IDS")
; A16 = v (0-256), X = k -> A16 = v * k / 256
cb_bind_scale:
	STX !cb_mq
	JSR cb_mul16
	LDA !cb_mq1
	XBA
	AND.w #$00FF
	STA !cb_t2
	LDA !cb_mq2
	XBA
	AND.w #$FF00
	ORA !cb_t2
	RTS
cb_bind_cap255:
	CMP.w #256
	BCC +
	LDA.w #255
+	CMP.w #1
	BCS +
	LDA.w #1
+	RTS
endif

; ---------------------------------------------------------------------------
; UI (telepathy): King Kai's Super Saiyan charge remarks and the first
; Super Saiyan reveal.
; Per frame: the charge state (absent = released).
cb_bind_charge_remark:
if defined("UIC_SUPER")
	LDA !cb_charging
	AND.w #$00FF
	BEQ .beam
	LDA.w #$0000
	LDX !cb_form-1
	CPX.w #$0100
	BCC +
	ORA.w #!UIC_SUPER
+	LDX !cb_charge
	CPX.w #45
	BCC +
	ORA.w #!UIC_FULL
+	JSL ui_charge_tick
	RTS
.beam
	LDA !cb_act
	AND.w #$00FF
	CMP.w #!GOKU_K_BEAM
	BNE +
	LDA.w #!UIC_BEAM
	JSL ui_charge_tick
+
endif
	RTS

; C clear the first time Super Saiyan is revealed (the long 72-frame pose
; and King Kai's lines); C set afterwards. The ui module keeps the saved
; latch when it is present; otherwise combat's own (!pc_flags).
cb_bind_intro_super:
if defined("UIC_SUPER")
	JSL ui_power_intro_super
	PHP
	SEP #$20
	LDA.l !pc_flags
	ORA.b #!PCF_REVEALED
	STA.l !pc_flags
	PLP
	RTS
else
	SEP #$20
	LDA.l !pc_flags
	BIT.b #!PCF_REVEALED
	BNE .seen
	ORA.b #!PCF_REVEALED
	STA.l !pc_flags
	REP #$20
	CLC
	RTS
.seen
	REP #$20
	SEC
	RTS
endif

; ---------------------------------------------------------------------------
; Destroy (destructible scenery, gates, switches, orbs).
; destroy_hit: A16 = kind (0 punch, 1 ki, 2 beam, 3 full SSJ wave), origin
; and facing in ag_x / ag_y / ag_dir, da_len / da_half / da_taper / da_str /
; da_id. Out: A16 = destroy's flags (bit 1 = a barrier or switch reacted).
cb_destroy_attack:
if defined("POL_PLANTS")
	PHA
	LDA !ag_x
	STA.w !arg_x
	LDA !ag_y
	STA.w !arg_y
	LDA !ag_dir
	STA.w !arg_dir
	LDA.l !da_len
	STA.w !arg_len
	LDA.l !da_half
	STA.w !arg_half
	LDA.l !da_taper
	STA.w !arg_taper
	LDA.l !da_str
	STA.w !arg_str
	LDA.l !da_id
	STA.w !arg_id
	LDA.w #$FFFF
	STA.w !arg_layer
	PLA
	STA.w !arg_kind
	JSL destroy_hit
	REP #$30
	RTS
else
	LDA.w #$0000
	RTS
endif

; A puzzle orb (species $55) took an attack: X = actor offset.
cb_bind_orb_hit:
if defined("POL_PLANTS")
	JSL destroy_orb_hit
endif
	RTS

; ---------------------------------------------------------------------------
; Damage hooks on native actors (the Mana Beast, the empowered Dark Lich):
; every module listed in modules.asm modules_combat_damage, in turn (JSL
; with A16 = damage, X16 = actor offset, DB = $7E; each returns A16). The
; single-owner !COMBAT_HOOK_DAMAGE define is no longer read.
cb_bind_damage_hook:
	JSL modules_combat_damage
	RTS

; ---------------------------------------------------------------------------
; FX (docs/agents/snes-port/fx.md).
cb_bind_has_fx:
if defined("FX_IMPACT")
	SEC
else
	CLC
endif
	RTS

if defined("FX_IMPACT")
; Every request starts from a clean block: fx reads the fields a kind uses,
; and the block (battery RAM) keeps whatever the last caller or power-on
; left there. Preserves A/X/Y and P.
cb_fx_req_clear:
	PHP
	REP #$20
	PHA
	LDA.w #$0000
	STA.l !fx_dir                 ; dir and style
	STA.l !fx_a
	STA.l !fx_b
	STA.l !fx_c
	STA.l !fx_t
	PLA
	PLP
	RTS
endif

; Impact spark for record X (fx_dir/fx_hold/fx_life/fx_flags/position).
cb_fx_spawn_impact:
if defined("FX_IMPACT")
	JSR cb_fx_req_clear
	PHX
	SEP #$20
	LDA.l !ER+!er_dir,X
	STA.l !fx_dir
	REP #$20
	LDA.l !ER+!er_life,X
	AND.w #$00FF
	STA.l !fx_a
	LDA.l !ER+!er_hold,X
	AND.w #$00FF
	STA.l !fx_b
	LDA.l !ER+!er_flags,X
	AND.w #!ERF_SUPER
	BEQ +
	LDA.w #!FX_F_GOLD<<8
+	ORA.w #!FX_IMPACT
	PHA
	LDA.l !ER+!er_y,X
	TAY
	LDA.l !ER+!er_x,X
	TAX
	PLA
	JSL fx_spawn
	PLX
endif
	RTS

; Ki shot for record X; the handle is kept to end it at the first contact.
cb_fx_spawn_ki:
if defined("FX_KI")
	JSR cb_fx_req_clear
	PHX
	SEP #$20
	LDA.l !ER+!er_dir,X
	STA.l !fx_dir
	REP #$20
	LDA.w #256
	STA.l !fx_a
	LDA.l !ER+!er_flags,X
	AND.w #!ERF_SUPER
	BEQ +
	LDA.w #!FX_F_GOLD<<8
+	ORA.w #!FX_KI
	PHA
	LDA.l !ER+!er_y,X
	TAY
	LDA.l !ER+!er_x,X
	TAX
	PLA
	JSL fx_spawn
	PLX
	BCS +
	STA.l !ER+$0E,X
+
endif
	RTS

cb_fx_kill_record:
if defined("FX_KI")
	LDA.l !ER+$0E,X
	CMP.w #$FFFF
	BEQ +
	JSL fx_kill
+
endif
	RTS

cb_fx_spawn_burst:
if defined("FX_BURST")
	JSR cb_fx_req_clear
	LDA.w #56
	STA.l !fx_a
	LDY !cb_t5
	LDX !cb_t4
	LDA.w #!FX_BURST|(!FX_F_GOLD<<8)
	JSL fx_spawn
endif
	RTS

; Status recovery burst for record X.
cb_fx_spawn_status:
if defined("FX_STATUS")
	JSR cb_fx_req_clear
	PHX
	LDA.l !ER+!er_flags,X
	LDY.w #$0000
	BIT.w #!ERF_FIRE
	BEQ +
	LDY.w #1
+	BIT.w #!ERF_ICE
	BEQ +
	LDY.w #2
+	BIT.w #!ERF_BALLOON
	BEQ +
	LDY.w #3
+	TYA
	SEP #$20
	STA.l !fx_style
	REP #$20
	LDA.l !ER+!er_y,X
	TAY
	LDA.l !ER+!er_x,X
	TAX
	LDA.w #!FX_STATUS
	JSL fx_spawn
	PLX
endif
	RTS

; The live beam: palms ag_x/ag_y, ag_dir, length cb_t2, half width cb_t3,
; taper cb_t1, age cb_t0.
; The live beam's picture recorded by cb_beam_picture (frame end only: fx
; keeps continuous draws from the frame callbacks).
cb_fx_beam_draw:
if defined("FX_BEAM_KAME")
	JSR cb_fx_req_clear
	SEP #$20
	LDA.l !bd_dir
	STA.l !fx_dir
	REP #$20
	LDA.l !bd_len
	STA.l !fx_a
	LDA.l !bd_half
	STA.l !fx_b
	LDA.l !bd_taper
	STA.l !fx_c
	LDA.l !bd_age
	STA.l !fx_t
	LDA.l !bd_kind
	CMP.w #$0001
	BNE +
	LDA.w #!FX_BEAM_WAVE
	BRA ++
+	CMP.w #$0002
	BNE +
	LDA.w #!FX_BEAM_KAME|(!FX_F_SSJ<<8)
	BRA ++
+	LDA.w #!FX_BEAM_KAME
++	PHA
	LDA.l !bd_y
	TAY
	LDA.l !bd_x
	TAX
	PLA
	JSL fx_beam
endif
	RTS

; Continuous draws.
cb_fx_aura:
if defined("FX_AURA")
	JSR cb_fx_req_clear
	; tone gold in Super Saiyan (and the transformation once gold)
	LDA.w #$0000
	LDX !cb_form-1
	CPX.w #$0100
	BCC +
	LDA.w #$0001
+	SEP #$20
	STA.l !fx_style
	REP #$20
	; power 0-256: focus .25 + .45 p, charge (.15|.4) + (.4|.6) s, reveal
	LDA !cb_act
	AND.w #$00FF
	CMP.w #!GOKU_K_FOCUS
	BNE +
	LDA !cb_power
	ASL : ASL                     ; *4 ~ 0-384
	LSR                           ; *2 ~ /96*256*.45 approx
	CLC
	ADC.w #64
	BRA .power
+	CMP.w #!GOKU_K_TRANSFORM
	BEQ .full
	CMP.w #!GOKU_K_REVERT
	BEQ .full
	JSR cb_bind_strength
	LSR
	CLC
	ADC.w #64
	BRA .power
.full
	LDA.w #256
.power
	CMP.w #257
	BCC +
	LDA.w #256
+	STA.l !fx_a
	LDA.w #32
	STA.l !fx_b
	LDA !cb_frame
	STA.l !fx_t
	LDX.w #$0000
	LDY.w #$0000
	LDA.w #!FX_AURA|(!FX_F_GOKU<<8)
	JSL fx_draw
endif
	RTS

cb_fx_orb:
if defined("FX_ORB")
	JSR cb_fx_req_clear
	; frame min(4, strength*5); full charge alternates 3/4 every 4 frames
	JSR cb_bind_strength
	CMP.w #256
	BCC .partial
	LDA !cb_frame
	LSR : LSR
	AND.w #$0001
	CLC
	ADC.w #3
	BRA .set
.partial
	STA !cb_mq
	LDA.w #5
	JSR cb_mul16
	LDA !cb_mq1
	XBA
	AND.w #$00FF
	CMP.w #5
	BCC .set
	LDA.w #4
.set
	STA.l !fx_a
	LDX.w #$0000
	LDY.w #$0000
	LDA !cb_form
	AND.w #$00FF
	BEQ +
	LDA.w #!FX_F_GOLD<<8
+	ORA.w #!FX_ORB|(!FX_F_GOKU<<8)
	JSL fx_draw
endif
	RTS

cb_fx_lightning:
if defined("FX_LIGHTNING")
	JSR cb_fx_req_clear
	LDA !cb_facing
	AND.w #$0003
	STA !cb_t8
	LDA.w #$0003
	JSR cb_hand_origin
	LDA.w #2
	STA.l !fx_a
	LDA !cb_frame
	STA.l !fx_t
	LDX !cb_t4
	LDY !cb_t5
	LDA.w #!FX_LIGHTNING
	JSL fx_draw
endif
	RTS

; charge strength 0-256

cb_bind_fx_flash:
if defined("FX_IMPACT")
	JSL fx_flash
endif
	RTS
cb_bind_fx_quake:
if defined("FX_IMPACT")
	JSL fx_quake
endif
	RTS
cb_bind_fx_kill_all:
if defined("FX_IMPACT")
	JSL fx_kill_all
endif
	RTS

combat_bind_end:
assert combat_bind_end <= !CODE_COMBAT+$8000, "combat binding area overflow"
pullpc

; ---------------------------------------------------------------------------
; Saiyan recoil (native-hit-recovery.js softenRecoil) at the movement
; vector C0:D651 and the position commit C0:D890. Flight also steers at
; D651: a flight module that hooks D651 defines !FLIGHT_OWNS_D651 and calls
; combat_recoil_vector from its hook instead (contract in combat.md).
if not(defined("FLIGHT_OWNS_D651"))
	%orig4($C0D651, $1FA520E2)
	%orig2($C0D655, $1E05)
	%hijack_jsl($C0D651, combat_hook_move_vector, 6, combat)
endif
if not(defined("FLIGHT_OWNS_D890"))
	%orig4($C0D890, $00E020E2)
	%orig1($C0D894, $06)
	%hijack_jsl($C0D890, combat_hook_move_commit, 5, combat)
endif
