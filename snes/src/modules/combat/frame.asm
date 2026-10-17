; Frame entry points and the input/state pipeline of ManaMod.beforeFrame().
; Called from snes/src/modules.asm (before goku, so the pose request of a
; frame is consumed by the next OAM build: the browser's one-frame order).

!GOKU_ACT_ADDR = !goku_act

; Native facing byte ($E010) for facings 0 down, 1 right, 2 left, 3 up.
cb_native_facing:
	db $01,$02,$82,$00
; Pad direction bit for each facing.
cb_dir_bits:
	dw !IN_DN,!IN_RT,!IN_LT,!IN_UP

; ---------------------------------------------------------------------------
; modules_field_frame: M16/X16, DB = $7E, D = 0.
combat_field_frame:
	REP #$30
	JSR cb_ensure_init
	SEP #$20
	STZ !cb_world
	REP #$20
	STZ !cb_mask
	STZ !cb_inject
	INC !cb_frame
	JSR cb_cache_active
	JSR cb_session_track
	JSR cb_hr_tick
	JSR cb_quake_tick
	JSR cb_read_input
	JSR cb_goku_frame
	JSR cb_publish
	JSR cb_emit_input
	JSR cb_bind_loops
	JSR cb_bind_charge_remark
	JSR cb_effects_draw
	REP #$30
	RTL

; modules_world_frame: focus, transformation and the form in world flight
; (mana-mod.js beforeFrame with worldFlight; aerial ki is the world module's).
combat_world_frame:
	REP #$30
	JSR cb_ensure_init
	SEP #$20
	LDA.b #$01
	STA !cb_world
	REP #$20
	STZ !cb_mask
	STZ !cb_inject
	INC !cb_frame
	JSR cb_cache_active
	JSR cb_read_input_world
	JSR cb_world_body
	JSR cb_publish
	JSR cb_emit_input
	REP #$30
	RTL

; modules_menu_frame / modules_ring_frame: X is ring/back everywhere, Y is
; never the native ring command for Goku, and held combat buttons must be
; released after the menu (menuInputHeld).
combat_menu_frame:
	REP #$30
	JSR cb_ensure_init
	SEP #$20
	LDA.b #$01
	STA !cb_sess
	REP #$20
	STZ !cb_mask
	STZ !cb_inject
	JSR cb_cache_active
	LDA.l !core_pad
	AND.w #!IN_B|!IN_Y|!IN_A|!IN_L
	STA !cb_menu_held
	JSR cb_menu_x
	JSR cb_emit_input
	JSR cb_cancel_combat_quiet
	REP #$30
	RTL

; ---------------------------------------------------------------------------
; One-time set-up after power-on / title (module WRAM is zero then).
cb_ensure_init:
	SEP #$20
	LDA !cb_init
	CMP.b #$A5
	BEQ .done
	LDA.b #$A5
	STA !cb_init
	REP #$20
	LDA.w #$0000
	LDX.w #(!CW_END-!CW-2)
.clr
	STA.l !CW,X
	DEX : DEX
	BPL .clr
	LDA.w #$FFFF
	STA !cb_map
	STA !cb_rec_map
	SEP #$20
	; the permanent Frieza-story form survives loads
	LDA.l !persist_ssj_lock
	AND.b #$01
	STA !cb_form
.done
	REP #$20
	RTS

; ---------------------------------------------------------------------------
; Goku owns the field (arrival happened, not the ending's native boy):
; cached once per frame. Z clear (A16 = 1) when active.
cb_goku_active:
	LDA !cb_active
	AND.w #$00FF
	RTS
cb_cache_active:
	SEP #$20
	STZ !cb_active
	LDA.l !persist_goku_active
	BEQ .no
	LDA !goku_ctl
	AND.b #!GOKU_CTL_SUPPRESS
	BNE .no
	INC !cb_active
.no
	INC !cb_phase
	REP #$20
	RTS

; Field interrupt vectors installed ($0100 JML $00C0A8, $0104 JML $00C1CF).
; Z set when they are.
cb_native_field:
	LDA $0101
	CMP.w #$C0A8
	BNE .out
	LDA $0105
	CMP.w #$C1CF
.out
	RTS

; mana-mod.js updateMenu(): a native menu session lasts from the ring/menu
; request until the field is idle again (the battle-name window $2C and
; the ring's own EC bits included).
cb_session_track:
	SEP #$20
	LDA $EC
	AND.b #$0C
	BNE .on
	BIT $ED
	BVS .on
	REP #$20
	JSR cb_native_field
	BNE .keep
	SEP #$20
	LDA $2C
	BNE .keep8
	LDA $EC
	AND.b #$FE
	BNE .keep8
	STZ !cb_sess
.keep8
	REP #$20
.keep
	RTS
.on
	LDA.b #$01
	STA !cb_sess
	REP #$20
	RTS

; menuActive: Z clear when a native menu owns the input.
cb_menu_active:
	SEP #$20
	LDA !cb_sess
	BNE .yes
	LDA $EC
	AND.b #$0C
	BNE .yes
	LDA $ED
	AND.b #$40
.yes
	REP #$20
	RTS

; ---------------------------------------------------------------------------
; mana-mod.js canAttack: Goku active, settled field, player 1 owns Goku, no
; event, menu, fade, hurt pose or incapacitating status. Writes cb_can and
; returns it in A16 (Z set when Goku cannot attack).
cb_compute_can:
	JSR cb_goku_active
	BEQ .no
	LDA !cb_lock
	BNE .no
	JSR cb_menu_active
	BNE .no
	JSR cb_native_field
	BNE .no
	SEP #$20
	LDA $E011                     ; native hurt poses 8C-8F
	CMP.b #$8C
	BCC +
	CMP.b #$90
	BCC .no8
+	LDA $E4
	CMP.b #$01
	BNE .no8
	LDA $E5
	CMP.b #$01
	BNE .no8
	LDA $E000
	AND.b #$01
	BEQ .no8
	LDA $E02C
	AND.b #$01
	BEQ .no8
	LDA $EC
	AND.b #$FE
	BNE .no8
	LDA $ED
	AND.b #$40
	BNE .no8
	LDA $D0
	BNE .no8
	LDA $E190
	AND.b #$70
	BNE .no8
	LDA $E191
	AND.b #$D5
	BNE .no8
	LDA.b #$01
	STA !cb_can
	REP #$20
	LDA.w #$0001
	RTS
.no8
	REP #$20
.no
	SEP #$20
	STZ !cb_can
	REP #$20
	LDA.w #$0000
	RTS

; ---------------------------------------------------------------------------
; Input pipeline (beforeFrame, up to the enabled check). Leaves cb_in /
; cb_pad, cb_gc, cb_can and the base native mask/inject.
cb_read_input:
	LDA.l !core_pad
	AND.w #$FFF0                  ; controller id bits
	STA !cb_t0
	; buttons held since a menu must be released first
	JSR cb_menu_active
	BEQ .free
	LDA !cb_t0
	AND.w #!IN_B|!IN_Y|!IN_A|!IN_L
	STA !cb_menu_held
	BRA .held
.free
	LDA !cb_menu_held
	AND !cb_t0
	STA !cb_menu_held
	EOR.w #$FFFF
	AND !cb_t0
	STA !cb_t0
.held
	LDA !cb_t0
	STA !cb_pad
	STA !cb_in
	; other modules own the player (Frieza/Vegeta scenes, ending)
	LDA !cb_inlock
	BEQ +
	LDA.w #$FFF0
	TSB !cb_mask
+	JSR cb_compute_can
	; gokuControls: Goku is player 1's character
	SEP #$20
	STZ !cb_gc
	REP #$20
	JSR cb_goku_active
	BEQ .x
	SEP #$20
	LDA $E02C
	AND.b #$01
	STA !cb_gc
	REP #$20
	; on foot A is flight speed, never the native dash
	JSR cb_native_field
	BNE .noA
	SEP #$20
	LDA $EC
	AND.b #$FE
	ORA $D0
	REP #$20
	BNE .noA
	LDA.w #!IN_A
	TSB !cb_mask
.noA
	LDA !cb_gc
	AND.w #$00FF
	BEQ .x
	LDA.w #!IN_Y                  ; Y is ki, never the native ring command
	TSB !cb_mask
	LDA !cb_can
	AND.w #$00FF
	BEQ .x
	LDA.w #!IN_X|!IN_L|!IN_R
	TSB !cb_mask
.x
	JMP cb_menu_x

; X is ring / back: the game sees native Y (Start for the window and
; controller editors of the menu screens, as panelBack).
cb_menu_x:
	LDA.l !core_pad
	BIT.w #!IN_X
	BNE .held
	STZ !cb_panel
	RTS
.held
	LDA !cb_pad_prev
	BIT.w #!IN_X
	BNE .keep
	LDA.w #!IN_Y
	STA !cb_panel
	LDA.l !core_mode
	CMP.w #!CORE_MODE_MENU
	BNE .keep
	; status window / controller editors: ring category 2, entry 5 or 6,
	; menu interrupt vectors (JML $C020A7 / JML $00C1CF)
	LDA $0101
	CMP.w #$20A7
	BNE .keep
	SEP #$20
	LDA $0103
	CMP.b #$C0
	BNE .keep8
	LDA $1809
	CMP.b #$02
	BNE .keep8
	LDA $180A
	CMP.b #$05
	BEQ .start
	CMP.b #$06
	BNE .keep8
.start
	REP #$20
	LDA.w #!IN_ST
	STA !cb_panel
	BRA .keep
.keep8
	REP #$20
.keep
	LDA.w #!IN_X
	TSB !cb_mask
	LDA !cb_panel
	BNE +
	LDA.w #!IN_Y
+	TSB !cb_inject
	RTS

; World flight input: the same menu filter; X/Y/L/R stay away from the game
; while Goku flies (Mode 7 keeps A ascent and B descent).
cb_read_input_world:
	LDA.l !core_pad
	AND.w #$FFF0
	STA !cb_t0
	LDA !cb_menu_held
	AND !cb_t0
	STA !cb_menu_held
	EOR.w #$FFFF
	AND !cb_t0
	STA !cb_pad
	STA !cb_in
	SEP #$20
	STZ !cb_can
	STZ !cb_gc
	REP #$20
	JSR cb_goku_active
	BEQ .x
	SEP #$20
	LDA.b #$01
	STA !cb_gc
	REP #$20
	LDA.w #!IN_Y|!IN_X|!IN_L|!IN_R
	TSB !cb_mask
.x
	JMP cb_menu_x

; Hand the native mask/inject requests to core.
cb_emit_input:
	LDA !cb_mask
	TSB.w !core_pad_mask&$FFFF
	LDA !cb_inject
	TSB.w !core_pad_inject&$FFFF
	LDA !cb_pad
	STA !cb_pad_prev
	LDA !cb_in
	STA !cb_in_prev
	RTS

; ---------------------------------------------------------------------------
; The body of beforeFrame for an active Goku on the field.
cb_goku_frame:
	JSR cb_goku_active
	BNE .active
	JSR cb_cancel_combat_quiet
	RTS
.active
	; an action another module put in !goku_act (teleport) blocks ours
	SEP #$20
	STZ !cb_ext_kind
	LDA !cb_act
	BNE +
	LDA !GOKU_ACT_ADDR
	STA !cb_ext_kind
+	REP #$20
	JSR cb_status_recovery
	STA !cb_recovering
	JSR cb_form_break
	JSR cb_map_change
	JSR cb_power_stats
	JSR cb_facing_from_native
	LDA !cb_inlock
	BEQ +
	JSR cb_cancel_combat_quiet
	RTS
+	LDA !cb_recovering
	BEQ +
	RTS
+	; focus unless an L attack chord is held
	LDA !cb_in
	BIT.w #!IN_L
	BEQ .focus
	BIT.w #!IN_Y|!IN_B|!IN_R
	BEQ .focus
	SEP #$20
	LDA !cb_act
	CMP.b #!GOKU_K_FOCUS
	BNE .nofocus8
	STZ !cb_act
	REP #$20
	STZ !cb_power
	BRA .nofocus
.nofocus8
	REP #$20
	BRA .nofocus
.focus
	LDA !cb_can
	AND.w #$00FF
	BEQ .nofocus
	LDA !cb_in
	BIT.w #!IN_X
	BNE .nofocus
	JSR cb_focus
.nofocus
	; native menus, events, status locks and stun own their inputs
	LDA !cb_can
	AND.w #$00FF
	BEQ .locked
	LDA !cb_in
	BIT.w #!IN_X
	BEQ .free
.locked
	JSR cb_locked_frame
	RTS
.free
	JSR cb_aim
	LDA !cb_fx_mask
	BEQ +
	JSR cb_effects_tick
+	JSR cb_advance_action
	SEP #$20
	LDA !cb_blast_cd
	BEQ +
	DEC !cb_blast_cd
+	REP #$20
	LDA !cb_fx_mask
	BEQ +
	JSR cb_update_projectiles
+	LDA !cb_kb_mask
	BEQ +
	JSR cb_update_launches
+	JSR cb_attack_inputs
	RTS

; A canAttack-false frame: everything incompatible is cancelled; a held
; attack stays away from the game (no stray dialogue confirm).
cb_locked_frame:
	SEP #$20
	LDA !cb_charging
	ORA !cb_blocked
	STA !cb_t0
	REP #$20
	LDA !cb_held
	ORA !cb_t0
	AND.w #$00FF
	STA !cb_t0
	JSR cb_cancel_combat
	SEP #$20
	STZ !cb_blocked
	LDA !cb_t0
	BEQ .noblock
	REP #$20
	LDA !cb_pad
	AND.w #!IN_B|!IN_Y
	BEQ .noblock16
	SEP #$20
	LDA.b #$01
	STA !cb_blocked
	REP #$20
	LDA.w #!IN_B|!IN_Y
	TSB !cb_mask
	BRA .noblock16
.noblock
	REP #$20
.noblock16
	SEP #$20
	STZ !cb_pow_blk
	REP #$20
	LDA !cb_in
	AND.w #!IN_L
	BEQ +
	SEP #$20
	INC !cb_pow_blk
	REP #$20
+	RTS

; Attack inputs after the action advanced (beforeFrame tail).
cb_attack_inputs:
	; wave = L+Y without the teleport chord L+B
	STZ !cb_t1
	LDA !cb_in
	AND.w #!IN_L|!IN_Y|!IN_B
	CMP.w #!IN_L|!IN_Y
	BNE +
	INC !cb_t1                    ; wave
+	LDA !cb_in
	AND.w #!IN_L|!IN_B
	CMP.w #!IN_L|!IN_B
	BNE +
	LDA.w #!IN_A
	TSB !cb_mask                  ; teleport chord: no native dash
+	LDA !cb_in
	BIT.w #!IN_B|!IN_Y
	BNE +
	SEP #$20
	STZ !cb_blocked
	REP #$20
+	LDA !cb_in
	BIT.w #!IN_Y
	BNE +
	SEP #$20
	STZ !cb_ki_blk
	REP #$20
+	LDA.w #!IN_B
	TSB !cb_mask
	; start a charge
	LDA !cb_t1
	BEQ .nostart
	SEP #$20
	LDA !cb_blocked
	ORA !cb_ki_blk
	ORA !cb_charging
	BNE .nostart8
	LDA !cb_ext_kind
	BNE .nostart8
	LDA !cb_act
	BEQ .start8
	CMP.b #!GOKU_K_READY
	BEQ .start8
	CMP.b #!GOKU_K_FOCUS
	BEQ .start8
	CMP.b #!GOKU_K_PUNCH
	BEQ .start8
	CMP.b #!GOKU_K_BLAST
	BNE .nostart8
.start8
	REP #$20
	JSR cb_start_charge
	BRA .nostart
.nostart8
	REP #$20
.nostart
	; release
	SEP #$20
	LDA !cb_charging
	BEQ .norelease8
	REP #$20
	LDA !cb_t1
	BNE .norelease
	JSR cb_release_charge
	SEP #$20
	STZ !cb_ki_blk
	REP #$20
	LDA !cb_in
	BIT.w #!IN_Y
	BEQ .norelease
	SEP #$20
	INC !cb_ki_blk
.norelease8
	REP #$20
.norelease
	; punches: B without L
	LDA !cb_in
	AND.w #!IN_B|!IN_L
	CMP.w #!IN_B
	BNE .nopunch
	SEP #$20
	LDA !cb_blocked
	ORA !cb_charging
	REP #$20
	BNE .nopunch
	INC !cb_held
	SEP #$20
	LDA !cb_act
	ORA !cb_ext_kind
	REP #$20
	BNE .busy
	JSR cb_punch
	BRA .punched
.busy
	SEP #$20
	LDA !cb_act
	CMP.b #!GOKU_K_PUNCH
	REP #$20
	BNE .punched
	LDA !cb_in_prev
	BIT.w #!IN_B
	BEQ .queue
	LDA !cb_held
	CMP.w #12
	BCC .punched
.queue
	SEP #$20
	LDA.b #$01
	STA !cb_queued
	REP #$20
	BRA .punched
.nopunch
	STZ !cb_held
.punched
	SEP #$20
	LDA !cb_act
	ORA !cb_ext_kind
	BNE .noqueued
	LDA !cb_queued
	BEQ .noqueued
	STZ !cb_queued
	REP #$20
	JSR cb_punch
.noqueued
	REP #$20
	; charging builds up to 90 / 45 frames
	SEP #$20
	LDA !cb_charging
	BEQ .nocharge
	REP #$20
	JSR cb_charge_step
.nocharge
	REP #$20
	; ki: Y without L, alone or after a previous shot
	LDA !cb_in
	AND.w #!IN_Y|!IN_L
	CMP.w #!IN_Y
	BNE .noki
	SEP #$20
	LDA !cb_ki_blk
	ORA !cb_blocked
	ORA !cb_blast_cd
	ORA !cb_charging
	ORA !cb_ext_kind
	BNE .noki8
	LDA !cb_act
	BEQ .ki8
	CMP.b #!GOKU_K_BLAST
	BNE .noki8
.ki8
	REP #$20
	JSR cb_ki_blast
	BRA .noki
.noki8
	REP #$20
.noki
	; native B pulses (talk / chests on a missed punch)
	SEP #$20
	LDA !cb_tap
	BEQ .notap
	DEC !cb_tap
	REP #$20
	LDA.w #!IN_B
	TSB !cb_inject
.notap
	REP #$20
	; planted actions hold the feet; others follow the aim
	SEP #$20
	LDA !cb_act
	BEQ .end8
	CMP.b #!GOKU_K_FOCUS
	BEQ .follow
	CMP.b #!GOKU_K_TRANSFORM
	BEQ .follow
	CMP.b #!GOKU_K_REVERT
	BNE .planted
.follow
	LDA !cb_facing
	STA !cb_act_face
	BRA .facing
.planted
	CMP.b #!GOKU_K_BEAM
	BEQ .hold
	CMP.b #!GOKU_K_PUNCH
	BEQ .hold
	CMP.b #!GOKU_K_BLAST
	BNE .facing
.hold
	REP #$20
	LDA.w #!IN_DIRS|!IN_A
	TSB !cb_mask
	SEP #$20
.facing
	LDA !cb_act
	CMP.b #!GOKU_K_READY
	BEQ .end8
	CMP.b #!GOKU_K_CHARGE
	BEQ .end8
	LDA !cb_act_face
	AND.b #$03
	TAX
	LDA.l cb_native_facing,X
	STA $E010
.end8
	REP #$20
	RTS

; ---------------------------------------------------------------------------
; mana-mod.js aim(): the newest pressed axis wins, a single held axis
; otherwise; charge and A keep the native facing in step.
cb_aim:
	LDA !cb_in
	EOR !cb_in_prev
	AND !cb_in
	STA !cb_t0                    ; pressed
	; horizontal / vertical choices ($FF none)
	LDX.w #$00FF
	LDA !cb_in
	BIT.w #!IN_LT
	BEQ +
	LDX.w #$0002
	BRA ++
+	BIT.w #!IN_RT
	BEQ ++
	LDX.w #$0001
++	STX !cb_t1                    ; horizontal
	LDX.w #$00FF
	BIT.w #!IN_UP
	BEQ +
	LDX.w #$0003
	BRA ++
+	BIT.w #!IN_DN
	BEQ ++
	LDX.w #$0000
++	STX !cb_t2                    ; vertical
	LDA !cb_t0
	BIT.w #!IN_LT|!IN_RT
	BEQ .notHPress
	LDA !cb_t1
	BRA .set
.notHPress
	BIT.w #!IN_UP|!IN_DN
	BEQ .held
	LDA !cb_t2
	BRA .set
.held
	LDA !cb_t1
	CMP.w #$00FF
	BEQ .vert
	LDA !cb_t2
	CMP.w #$00FF
	BNE .keep
	LDA !cb_t1
	BRA .set
.vert
	LDA !cb_t2
	CMP.w #$00FF
	BEQ .keep
	LDA !cb_t1
	CMP.w #$00FF
	BNE .keep
	LDA !cb_t2
.set
	CMP.w #$00FF
	BEQ .keep
	SEP #$20
	STA !cb_facing
	REP #$20
.keep
	SEP #$20
	LDA !cb_act
	CMP.b #!GOKU_K_CHARGE
	BEQ .write
	CMP.b #!GOKU_K_READY
	BEQ .write
	REP #$20
	LDA !cb_in
	BIT.w #!IN_A
	BEQ .out
	SEP #$20
.write
	LDA !cb_facing
	AND.b #$03
	TAX
	LDA.l cb_native_facing,X
	STA $E010
.out
	REP #$20
	RTS

; facing from the native byte ($E010: 0 up, 1 down, 2 right, $82 left).
cb_facing_from_native:
	SEP #$20
	LDA $E010
	AND.b #$7F
	BNE +
	LDA.b #$03
	BRA .set
+	CMP.b #$01
	BNE +
	LDA.b #$00
	BRA .set
+	LDA $E010
	BMI +
	LDA.b #$01
	BRA .set
+	LDA.b #$02
.set
	STA !cb_facing
	REP #$20
	RTS

; ---------------------------------------------------------------------------
; Map change: combat state belongs to the old map (launches included).
cb_map_change:
	LDA $DC
	CMP !cb_map
	BEQ .same
	LDX !cb_map
	STA !cb_map
	CPX.w #$FFFF
	BEQ .same
	JSR cb_cancel_combat
	JSR cb_launch_clear
	SEP #$20
	STZ !cb_blocked
	STZ !cb_pow_blk
	REP #$20
	LDA !cb_in
	BIT.w #!IN_B|!IN_Y
	BEQ +
	SEP #$20
	INC !cb_blocked
	REP #$20
+	LDA !cb_in
	BIT.w #!IN_L
	BEQ .same
	SEP #$20
	INC !cb_pow_blk
	REP #$20
.same
	RTS

; Poison and sleep break the (non-permanent) transformation, charge included.
cb_form_break:
	SEP #$20
	LDA !cb_form
	BEQ .out
	LDA.l !persist_ssj_lock
	BNE .out
	LDA $E191
	AND.b #$20
	BNE .break
	LDA $E190
	AND.b #$10
	BEQ .out
.break
	STZ !cb_form
	REP #$20
	JSR cb_cancel_combat
	LDA.w #!AUDIO_SFX_REVERT_ID
	JSR cb_sfx
	SEP #$20
	STZ !cb_blocked
	STZ !cb_pow_blk
	REP #$20
	LDA !cb_in
	BIT.w #!IN_B|!IN_Y
	BEQ +
	SEP #$20
	INC !cb_blocked
	REP #$20
+	LDA !cb_in
	BIT.w #!IN_L
	BEQ .out16
	SEP #$20
	INC !cb_pow_blk
.out
	REP #$20
.out16
	RTS

; ---------------------------------------------------------------------------
; World flight: focus and the form change (no field attacks).
cb_world_body:
	JSR cb_goku_active
	BNE .active
	RTS
.active
	JSR cb_form_break
	LDA !cb_in
	BIT.w #!IN_L
	BEQ .focus
	BIT.w #!IN_Y|!IN_B|!IN_R
	BEQ .focus
	SEP #$20
	LDA !cb_act
	CMP.b #!GOKU_K_FOCUS
	BNE +
	STZ !cb_act
	REP #$20
	STZ !cb_power
+	REP #$20
	BRA .advance
.focus
	LDA !cb_in
	BIT.w #!IN_X
	BNE .advance
	JSR cb_focus
.advance
	JSR cb_advance_action
	SEP #$20
	LDA !cb_act
	CMP.b #!GOKU_K_FOCUS
	BEQ .follow
	CMP.b #!GOKU_K_TRANSFORM
	BEQ .follow
	CMP.b #!GOKU_K_REVERT
	BNE .out
.follow
	LDA !cb_facing
	STA !cb_act_face
.out
	REP #$20
	RTS

; ---------------------------------------------------------------------------
; Publish the pose request and the form for the goku module (and FX).
cb_publish:
	JSR cb_goku_active
	BEQ .out
	SEP #$20
	LDA !cb_form
	STA !goku_form
	LDA !cb_act
	BEQ .none
	STA !goku_act
	LDA !cb_act_face
	STA !goku_act_facing
	LDA !cb_act_arg
	AND.b #$03
	LDX !cb_act_super
	BEQ +
	ORA.b #$80
+	STA !goku_act_arg
	LDA !cb_act_dur
	STA !goku_act_dur
	REP #$20
	LDA !cb_act_age
	STA !goku_act_age
	BRA .modes
.none
	LDA !cb_ext_kind
	BNE .modes8
	STZ !goku_act
.modes8
	REP #$20
.modes
	JSR cb_publish_reaction
.out
	REP #$20
	RTS
