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
; !vs_gb_super, !vs_gb_mega filled. Test builds use the stand-in record a
; test wrote at !vs_tb_* first; then combat_api_beam (its record's first
; 14 bytes have this block's layout), else combat's beam record itself
; (vb_combat_beam).
vb_goku_beam:
if defined("VEGETA_TEST")
	LDA.l !vs_tb_on
	AND.w #$00FF
	BEQ .combat
	LDX.w #$000E
-	LDA.l !vs_tb_x,X
	STA.l !vs_gb_x,X
	DEX
	DEX
	BPL -
	SEC
	RTS
.combat
endif
if defined("COMBAT_API_BEAM")
	JSL !COMBAT_API_BEAM
	BCC .none
	LDX.w #$000C
-	LDA.l !cb_beam,X
	STA.l !vs_gb_x,X
	DEX
	DEX
	BPL -
	SEC
	RTS
.none
	CLC
	RTS
elseif defined("COMBAT_OWNER")
	JMP vb_combat_beam
else
	CLC
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
	; A = 1 lock (the clash: combat's action and effects end), 2 hold (the
	; draw: the last wave runs on, mana-mod.js trial.inputLocked), 0 off.
	; !vg_misc bit 1 = held, bit 3 = held as a hold.
	SEP #$20
	CMP.b #$00
	BEQ .off
	CMP.b #$02
	BEQ .hold
	LDA !vg_misc
	AND.b #$0A
	CMP.b #$02
	BEQ .done                     ; a lock already
	LDA !vg_misc
	AND.b #$F7
	ORA.b #$02
	STA !vg_misc
	REP #$20
if defined("COMBAT_OWNER")
	LDA.w #!VEGETA_OWNER
	JSL combat_api_input_lock
endif
	RTS
.hold
	LDA !vg_misc
	AND.b #$0A
	CMP.b #$0A
	BEQ .done                     ; a hold already
	LDA !vg_misc
	ORA.b #$0A
	STA !vg_misc
	REP #$20
if defined("COMBAT_OWNER")
	LDA.w #!VEGETA_OWNER
	JSL combat_api_input_hold
endif
	RTS
.off
	LDA !vg_misc
	BIT.b #$02
	BEQ .done
	AND.b #$F5
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

; ---------------------------------------------------------------------------
; Goku's attacks on Vegeta (mana-mod.js entities(): the trial's entity()
; replaces actor slot 3; hit() sends it to trial.hit()).
;
; The native Doppel in slot 3 stays inactive (joch-trial.js clears its bit
; every tick), so combat's target scans would skip him. Combat's step is
; the JSL at C0:B0AC; the two calls before it (C0:B0A6) and the two after
; it (C0:B0B2) are moved into vegeta_combat_open / vegeta_combat_close.
; Between them slot 3 is shown as the browser's custom entity: active, his
; position (the tick keeps $E602/$E604/$E60B), HP max(1, hp) ($E782, kept
; by hit()), nothing pending, and a boss species so no launch moves him.
; Combat's damage hook (vegeta_combat_damage) sends each hit to hit().
; Nothing else runs in that window: the native actors run before it
; (JSL $02C786 at C0:B08C) and see the slot inactive, as in the browser.
if defined("COMBAT_OWNER")

%orig4($C0B0A6, $208B5E20)            ; JSR $8B5E (fade) / JSR $DB1E
%orig2($C0B0AA, $DB1E)
%hijack_jsl($C0B0A6, vegeta_combat_open, 6, vegeta)
%orig4($C0B0B2, $20D5C020)            ; JSR $D5C0 / JSR $B4FE
%orig2($C0B0B6, $B4FE)
%hijack_jsl($C0B0B2, vegeta_combat_close, 6, vegeta)

; C0:B0A6: the replaced calls (bank-00 routines ending in RTS return
; through the RTL at 00:B294), then slot 3 opens to combat. Every field
; frame runs this pair: without a trial they only clear !vg_cwin.
vegeta_combat_open:
	PHK
	PER .faded-1
	PEA $B294-1
	JML $008B5E
.faded
	PHK
	PER .cycled-1
	PEA $B294-1
	JML $00DB1E
.cycled
	PHP
	SEP #$20
	PHA
	LDA.b #$00
	STA.l $7E0000|!vg_cwin        ; written every frame before the close
	LDA.l $7E0000|!vg_on
	CMP.b #!VG_ON
	BEQ .trial
	PLA
	PLP
	RTL
.trial
	PLA
	REP #$30
	PHA
	PHX
	PHY
	PHB
	PHD
	PEA $0000
	PLD
	PEA $7E7E
	PLB
	PLB
	JSR vg_target_open
	REP #$30
	PLD
	PLB
	PLY
	PLX
	PLA
	PLP
	RTL

; C0:B0B2: slot 3 closes again, then the replaced calls (C0:B4FE may
; leave for a map change through C0:B03F, which resets the stack: the
; window is closed before it).
vegeta_combat_close:
	PHP
	SEP #$20
	PHA
	LDA.l $7E0000|!vg_cwin
	BEQ .closed
	PLA
	REP #$30
	PHA
	PHX
	PHY
	PHB
	PHD
	PEA $0000
	PLD
	PEA $7E7E
	PLB
	PLB
	JSR vg_target_close
	REP #$30
	PLD
	PLB
	PLY
	PLX
	PLA
	PLP
	BRA .calls
.closed
	PLA
	PLP
.calls
	PHK
	PER .moved-1
	PEA $B294-1
	JML $00D5C0
.moved
	PHK
	PER .done-1
	PEA $B294-1
	JML $00B4FE
.done
	RTL

; entity() is not null: the trial runs, he is in the room, not beaten. C set.
vg_targetable:
	JSR vg_active
	BCC .no
	SEP #$20
	LDA !vg_flags
	AND.b #!VF_SPAWNED|!VF_WON
	CMP.b #!VF_SPAWNED
	REP #$20
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

vg_target_open:
	SEP #$20
	STZ !vg_cwin                  ; written every frame before the close
	REP #$20
	JSR vg_targetable
	BCC .out
	SEP #$20
	LDA !VEGETA_SLOT+$E000
	STA.l !vs_cw_e600
	ORA.b #$01
	STA !VEGETA_SLOT+$E000
	LDA !VEGETA_SLOT+$E180
	STA.l !vs_cw_species
	LDA.b #!VEGETA_CW_SPECIES
	STA !VEGETA_SLOT+$E180
	LDA !VEGETA_SLOT+$E1F0
	STA.l !vs_cw_e7f0
	LDA !VEGETA_SLOT+$E1EC
	STA.l !vs_cw_e7ec
	LDA.b #$01
	STA !vg_cwin
	REP #$20
	STZ !VEGETA_SLOT+$E1F1        ; custom: nothing pending
.out
	RTS

vg_target_close:
	LDA !vg_cwin
	AND.w #$00FF
	BEQ .out
	SEP #$20
	STZ !vg_cwin
	LDA.l !vs_cw_e600
	STA !VEGETA_SLOT+$E000
	LDA.l !vs_cw_species
	STA !VEGETA_SLOT+$E180
	LDA.l !vs_cw_e7f0
	STA !VEGETA_SLOT+$E1F0
	LDA.l !vs_cw_e7ec
	STA !VEGETA_SLOT+$E1EC
	REP #$20
	STZ !VEGETA_SLOT+$E1F1        ; combat queued its contact marker here
.out
	RTS

; Combat's damage hook (modules.asm modules_combat_damage): JSL with
; A16 = damage, X16 = actor offset, DB = $7E; returns A16 = the damage
; combat queues natively. Slot 3 in the window is Vegeta: trial.hit(amount)
; (melee while combat's action is a punch) and 1 when his HP dropped
; (combat's contact test is after < before), else 0. Other actors keep
; their damage (the list calls every module's hook).
vegeta_combat_damage:
	CPX.w #!VEGETA_SLOT
	BNE .next
	PHA
	LDA !vg_cwin
	AND.w #$00FF
	BNE .ours
	PLA
.next
	RTL
.ours
	PLA
	PHP
	PHB
	PHD
	PHX
	PHY
	REP #$30
	PEA $0000
	PLD
	PEA $7E7E
	PLB
	PLB
	TAY                           ; amount
	LDX.w #$0000
	LDA !cb_act
	AND.w #$00FF
	CMP.w #!GOKU_K_PUNCH
	BNE +
	INX                           ; melee
+
if defined("VEGETA_TEST")
	TYA
	JSR vg_test_log_hit
endif
	TYA
	JSL vegeta_api_hit            ; A = HP before, X = HP after
	STX !vg_t0
	CMP !vg_t0
	BEQ .none
	BCC .none
	LDA.w #$0001
	BRA +
.none
	LDA.w #$0000
+	PHA
	; once beaten he leaves the target list (entity() is null)
	JSR vg_targetable
	BCS +
	SEP #$20
	LDA !VEGETA_SLOT+$E000
	AND.b #$FE
	STA !VEGETA_SLOT+$E000
	REP #$20
+	PLA
	PLY
	PLX
	PLD
	PLB
	PLP
	RTL

; Goku's live beam from combat's effect records (kind beam, life > 0) and
; the beam globals, with mana-mod.js beamGeometry(): age = max - life,
; length = min(range, (age + 1) * speed), half width = 5 + 14 * strength
; (strength = min(1, charge / (45 Super Saiyan, 90 base)), the form it was
; fired in) or, for the full wave, 80 * min(1, (age + 1) / 6, life / 10).
vb_combat_beam:
	JSR vb_combat_beam_find
	BCS +
	RTS
+	LDA.l !ER+!er_x,X
	STA.l !vs_gb_x
	LDA.l !ER+!er_y,X
	STA.l !vs_gb_y
	PHX
	LDA.l !ER+!er_dir,X
	AND.w #$0003
	ASL
	ASL
	TAX
	LDA.l vb_beam_dirs,X
	STA.l !vs_gb_dx
	LDA.l vb_beam_dirs+2,X
	STA.l !vs_gb_dy
	PLX
	SEP #$20
	LDA.l !ER+!er_flags,X
	AND.b #!ERF_SUPER
	STA.l !vs_gb_super
	LDA.l !ER+!er_flags,X
	AND.b #!ERF_MEGA
	STA.l !vs_gb_mega
	REP #$20
	; age + 1, life (vg_mul16 / vg_div32 use the vg_t* words)
	LDA.l !ER+!er_life,X
	AND.w #$00FF
	STA.l !vs_gb_life
	LDA.l !ER+!er_max,X
	AND.w #$00FF
	SEC
	SBC.l !vs_gb_life
	INC
	STA.l !vs_gb_age1
	; length = min(range, (age + 1) * speed)
	LDX !bm_speed
	JSR vg_mul16
	LDA !vm_a1
	BNE .range
	LDA !vm_a0
	CMP !bm_range
	BCC +
.range
	LDA !bm_range
+	STA.l !vs_gb_len
	LDA.l !vs_gb_mega
	AND.w #$00FF
	BEQ .normal
	; full wave: 256 * 80 * min(1, (age + 1) / 6, life / 10)
	LDA.l !vs_gb_life
	CMP.w #10
	BCC +
	LDA.w #20480
	BRA ++
+	ASL : ASL : ASL : ASL : ASL : ASL : ASL : ASL : ASL : ASL : ASL   ; life * 2048
++	STA.l !vs_gb_half
	LDA.l !vs_gb_age1
	CMP.w #6
	BCS .out
	LDX.w #20480
	JSR vg_mul16
	LDX.w #6
	JSR vg_div32
	CMP.l !vs_gb_half
	BCS .out
	STA.l !vs_gb_half
	BRA .out
.normal
	; 256 * (5 + 14 * min(charge, cap) / cap)
	LDA.w #90
	STA.l !vs_gb_cap
	LDA.l !vs_gb_super
	AND.w #$00FF
	BEQ +
	LDA.w #45
	STA.l !vs_gb_cap
+	LDA !bm_charge
	AND.w #$00FF
	CMP.l !vs_gb_cap
	BCC +
	LDA.l !vs_gb_cap
+	LDX.w #3584
	JSR vg_mul16
	LDA.l !vs_gb_cap
	TAX
	JSR vg_div32
	CLC
	ADC.w #1280
	STA.l !vs_gb_half
.out
	SEC
	RTS

; X = offset of the first live beam record (combat effects.asm keeps one
; beam record; a free record has kind 0). C set when found.
vb_combat_beam_find:
	LDX.w #$0000
.find
	LDA.l !ER+!er_kind,X
	AND.w #$00FF
	CMP.w #!ERK_BEAM
	BNE .next
	LDA.l !ER+!er_life,X
	AND.w #$00FF
	BEQ .next
	SEC
	RTS
.next
	TXA
	CLC
	ADC.w #!ER_SIZE
	TAX
	CPX.w #!ER_N*!ER_SIZE
	BCC .find
	CLC
	RTS

; facing 0 down, 1 right, 2 left, 3 up: dx, dy
vb_beam_dirs:
	dw 0, 1
	dw 1, 0
	dw $FFFF, 0
	dw 0, $FFFF

if defined("VEGETA_TEST")
; Test log of combat's live beam: !VS+X+2 |= 2 and the record, charge,
; range and speed at !VS+X+4 when one is live.
vb_test_beam_log:
	STX !vg_t1                    ; entry offset
	JSR vb_combat_beam_find
	BCS +
	RTS
+	STX !vg_t0                    ; record offset
	LDX !vg_t1
	LDA.l !VS+2,X
	ORA.w #$0002
	STA.l !VS+2,X
	LDY.w #$0000
-	TYA
	CLC
	ADC !vg_t0
	TAX
	LDA.l !ER,X
	PHA
	TYA
	CLC
	ADC !vg_t1
	TAX
	PLA
	STA.l !VS+4,X
	INY
	INY
	CPY.w #!ER_SIZE
	BCC -
	LDX !vg_t1
	LDA !bm_charge
	AND.w #$00FF
	STA.l !VS+20,X
	LDA !bm_range
	STA.l !VS+22,X
	LDA !bm_speed
	STA.l !VS+24,X
	RTS
endif
endif

if defined("VEGETA_TEST")
if not(defined("COMBAT_OWNER"))
vb_test_beam_log:
	RTS
endif
; Hit log entry: A = amount, X = flags (bit0 melee). Preserves A/X/Y.
vg_test_log_hit:
	PHA
	PHX
	PHY
	PHA
	SEP #$20
	LDA.l !vs_dbg_n
	INC
	STA.l !vs_dbg_n
	REP #$20
	AND.w #$0003
	XBA
	LSR
	LSR
	LSR                           ; * 32
	TAY
	TXA
	TYX
	STA.l !vs_hl+2,X
	PLA
	STA.l !vs_hl,X
	TXA
	CLC
	ADC.w #!vs_hl-!VS
	TAX
	JSR vb_test_beam_log
	PLY
	PLX
	PLA
	RTS
; The beam as the tick sees it (before vg_tick).
vg_test_log_tick:
	LDA.w #$0000
	STA.l !vs_tk+2
	LDX.w #!vs_tk-!VS
	JMP vb_test_beam_log
endif

; Instant Transmission's custom target (flight.md !fl_tp_custom, written
; every field frame): kind 3 (Vegeta in place of slot 3), species 46, his
; position and terrain, not airborne.
vb_flight_target:
if defined("fl_tp_custom")
	JSR vg_targetable
	BCC +
	SEP #$20
	LDA.b #3
	STA.l !fl_tp_custom
	LDA.b #!VEGETA_SPECIES
	STA.l !fl_tp_custom+1
	LDA !vg_terrain
	STA.l !fl_tp_custom+6
	LDA.b #0
	STA.l !fl_tp_custom+7
	REP #$20
	LDA !vg_x
	STA.l !fl_tp_custom+2
	LDA !vg_y
	STA.l !fl_tp_custom+4
+
endif
	RTS

vegeta_bind_end:
assert vegeta_bind_end <= !CODE_VEGETA+$8000, "vegeta bind area overflow"
pullpc
