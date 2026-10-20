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
; mana-mod.js aim(): facing for held directions (index: up 8 | down 4 |
; left 2 | right 1) when nothing was pressed (+$00), a horizontal key was
; pressed (+$10) or a vertical one (+$20); $FF keeps the facing.
cb_aim_table:
	db $FF,$01,$02,$02,$00,$FF,$FF,$FF,$03,$FF,$FF,$FF,$03,$FF,$FF,$FF
	db $FF,$01,$02,$02,$FF,$01,$02,$02,$FF,$01,$02,$02,$FF,$01,$02,$02
	db $FF,$FF,$FF,$FF,$00,$00,$00,$00,$03,$03,$03,$03,$03,$03,$03,$03

; ---------------------------------------------------------------------------
; C0:B0AC hook (bank 00, inside the field frame logic C0:B08C; replaced:
; JSR $93B9 / JSR $B69C). The browser runs combat before each emulated
; frame, so the game consumes its queued damage, launches and facing in that
; same frame and draws the pose; here combat runs right after the game's pad
; read and before movement, actor updates and the OAM build, which keeps
; that order. Its pad and mask requests apply from the next read, as the
; browser's joypad state is latched at the next vblank.
cb_hook_logic:
	; the game's pad read (JSR $93B9 in bank 00; RTS -> RTL at 00:B294)
	PHK
	PER .read-1
	PEA $B294-1
	JML $8093B9
.read
	; (C0:B69C starts with SEP #$30 and loads what it uses: only P, DB and
	; D need to survive combat)
	PHP
	PHB
	PHD
	REP #$30
	LDA.w #$0000
	TCD
	PEA $7E7E
	PLB
	PLB
	JSR cb_logic_frame
	PLD
	PLB
	PLP
	; movement (JSR $B69C)
	PHK
	PER .moved-1
	PEA $B294-1
	JML $80B69C
.moved
	RTL

; One field frame of combat: a step per field vblank since the last frame
; (the browser's 60 Hz clock also while the game's logic lags; at most 4:
; menus and doors pause combat anyway).
cb_logic_frame:
	JSR cb_ensure_init
if defined("COMBAT_TEST")
	JSR cb_test_mailbox
endif
	LDA.w #$0000                  ; the virtual targets may have moved since
	STA.l !vt_state               ; the last field frame: query them again
	JSR cb_field_gate
	SEP #$20
	LDA !cb_world
	STZ !cb_world
	REP #$20
	BEQ +
	LDA !cb_vblanks               ; back from world flight: no catch-up
	STA !cb_vb_last
	JSR cb_cancel_combat           ; aerial charge/airBeam cannot leak into the field
+	JSR cb_stats_upkeep
	LDA !cb_vblanks
	SEC
	SBC !cb_vb_last
	BNE +
	INC
+	CMP.w #5
	BCC +
	LDA.w #4
+	SEP #$20
	STA !cb_steps
	REP #$20
	LDA !cb_vblanks
	STA !cb_vb_last
	STZ !cb_inj_all                 ; injections of every step
	JSR cb_idle_frame
	BCC .step
	RTS
.step
	; each step gets the pad of its own vblank (the browser's per-frame
	; input): vblank = last - (steps left - 1)
	LDA !cb_steps
	AND.w #$00FF
	DEC
	STA !cb_t0
	LDA !cb_vb_last
	SEC
	SBC !cb_t0
	AND.w #$0003
	ASL
	TAX
	LDA.l !PADH,X
	STA !cb_raw
	STZ !cb_mask
	STZ !cb_inject
	INC !cb_frame
	INC !cb_phase
	JSR cb_hr_tick
	JSR cb_quake_tick
	JSR cb_read_input
	JSR cb_goku_frame
	LDA !cb_inject
	TSB !cb_inj_all
	LDA !cb_pad
	STA !cb_pad_prev
	LDA !cb_in
	STA !cb_in_prev
	SEP #$20
	DEC !cb_steps
	REP #$20
	BNE .step
	JSR cb_publish
	JMP cb_note_quiet

; A field frame with nothing to run (most frames): combat's own state quiet
; (cb_note_quiet), no combat button (B Y A X L) in any of its vblanks and,
; with Goku active, no foreign action, hurt pose, reaction mode, breakable
; status or map change. Does exactly what its steps and cb_publish would do
; there (clock, pads, masks, the power upkeep, facing) at a fraction of the
; cost. C set when the frame was handled.
cb_idle_frame:
	SEP #$20
	LDA !cb_quiet
	BNE .quiet
.no8
	REP #$20
.no
	CLC
	RTS
.quiet
	LDA !cb_active
	BNE .active
	REP #$20                      ; Goku inactive: the steps only filter
	BRA .padCheck                 ; the pad (menu hold, the X route)
.active
	LDA !GOKU_ACT_ADDR            ; another module's action
	BNE .no8
	LDA $E011                     ; ordinary hurt poses start hit tracking
	CMP.b #$8D
	BEQ .no8
	CMP.b #$8E
	BEQ .no8
	LDA !goku_mode                ; a reaction mode cb_publish would clear
	CMP.b #!GOKU_K_DEFLECT
	BEQ .no8
	CMP.b #!GOKU_K_RESIST
	BEQ .no8
	REP #$20
	LDA $E190
	AND.w #$6170                  ; breakable statuses, poison and sleep
	BNE .no
	LDA $DC
	CMP !cb_map
	BNE .no
.padCheck
	; no combat button in the pads of this frame's vblanks
	LDA !cb_vb_last
	AND.w #$0003
	ASL
	TAX
	LDA !cb_steps
	AND.w #$00FF
	DEC
	BNE .pads
	LDA.l !PADH,X
	BRA .padsOr
.pads
	LDA !cb_steps
	AND.w #$00FF
	STA !cb_t0
	LDA !cb_vb_last
	STA !cb_t1
	STZ !cb_t2
-	LDA !cb_t1
	AND.w #$0003
	ASL
	TAX
	LDA.l !PADH,X
	TSB !cb_t2
	DEC !cb_t1
	DEC !cb_t0
	BNE -
	LDA !cb_t2
.padsOr
	AND.w #!IN_B|!IN_Y|!IN_A|!IN_X|!IN_L
	BEQ .idle
	CLC
	RTS
.idle
	; the steps: clock, the last vblank's pad (no menu filter: nothing is
	; held), the gate's mask plus B while Goku can attack, nothing injected
	LDA !cb_steps
	AND.w #$00FF
	PHA
	CLC
	ADC !cb_frame
	STA !cb_frame
	PLA
	SEP #$20
	CLC
	ADC !cb_phase
	STA !cb_phase
	STZ !cb_steps
	STZ !cb_ext_kind
	REP #$20
	LDA !cb_vb_last
	AND.w #$0003
	ASL
	TAX
	LDA.l !PADH,X
	STA !cb_raw
	STA !cb_pad
	STA !cb_in
	STA !cb_pad_prev
	STA !cb_in_prev
	STZ !cb_panel
	STZ !cb_inject
	STZ !cb_recovering
	LDA !cb_basemask
	STA !cb_mask
	LDA !cb_can
	AND.w #$00FF
	BEQ .noCan
	LDA.w #!IN_B
	TSB !cb_mask
	JSR cb_power_stats
.noCan
	; (without canAttack the power upkeep does nothing; cb_facing is only
	; read by actions, whose steps track it, and the resist reaction reads
	; the native facing itself)
	SEC
	RTS

; After a full logic frame: is combat's own state idle (no action, charge,
; effect, launch, focus, hit, reaction, quake, recovery, block or pending
; publish)? cb_idle_frame then only checks the game's side.
cb_note_quiet:
	STZ !cb_quiet
	SEP #$20
	LDA !cb_act
	ORA !cb_charging
	ORA !cb_tap
	ORA !cb_queued
	ORA !cb_blast_cd
	ORA !cb_quake
	ORA !cb_react
	ORA !cb_rec_pend
	ORA !cb_blocked
	ORA !cb_ki_blk
	ORA !cb_pow_blk
	ORA !cb_hr_tier
	ORA !cb_pub_kind
	BNE .out8
	LDA !cb_form
	CMP !cb_form_pub
	BNE .out8
	REP #$20
	LDA !cb_fx_mask
	ORA !cb_kb_mask
	ORA !cb_power
	ORA !cb_held
	ORA !cb_menu_held
	ORA !cb_inlock
	ORA !cb_charge
	BNE .out
	LDA !cb_rec_map
	INC                           ; no recovery record ($FFFF)
	BNE .out
	INC !cb_quiet
.out
	RTS
.out8
	REP #$20
	RTS

; modules_field_frame (M16/X16, DB = $7E, D = 0): the frame's input requests
; for the core filter, energy beds, King Kai's charge policy, effects.
combat_field_frame:
	REP #$30
	SEP #$20
	LDA !cb_init
	CMP.b #$A5
	REP #$20
	BNE .out                      ; the logic hook has not run yet
	JSR cb_ready_meter
	; never hide a button combat injects (X routed to native Y while Y is
	; ki): the core applies a mask to two reads but an injection to one
	LDA !cb_inj_all
	EOR.w #$FFFF
	AND !cb_mask
	TSB.w !core_pad_mask&$FFFF
	LDA !cb_inj_all
	TSB.w !core_pad_inject&$FFFF
	JSR cb_bind_loops
	JSR cb_bind_charge_remark
	; effects: live records, a charge or an action (the aura and orb), or
	; the beam picture of this frame's last step
	LDA !cb_fx_mask
	BNE +
	LDA !cb_act
	AND.w #$00FF
	BNE +
	LDA.l !bd_on
	BEQ .out
+	JSR cb_effects_draw
.out
	REP #$30
if defined("COMBAT_TEST")
	JSR cb_test_beam_probe
endif
	RTL

; C0:C164 hook (end of every field NMI, after the forced blank ends): count
; field vblanks and keep pad 1 of each (the browser reads input every video
; frame, also while the game's logic lags). Replaced: LDA #$FF / TRB $EC
; (M8, D = 0).
cb_nmi_vblank:
	PHP
	REP #$30
	PHX
	SEP #$20
-	LDA.l $004212                 ; the auto-joypad read of this vblank
	AND.b #$01
	BNE -
	REP #$20
	LDA.l $7E0000|!cb_vblanks
	INC
	STA.l $7E0000|!cb_vblanks
	AND.w #$0003
	ASL
	TAX
	LDA.l $004218
	AND.w #$FFF0
	STA.l !PADH,X
	PLX
	PLP
	LDA.b #$FF
	TRB $EC
	RTL

; modules_world_frame: focus, transformation and the form in world flight
; (mana-mod.js beforeFrame with worldFlight; aerial ki is the world module's).
combat_world_frame:
	REP #$30
	JSR cb_ensure_init
	STZ !cb_quiet
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
	JSR cb_bind_loops
	JSR cb_emit_input
	REP #$30
	RTL

; modules_menu_frame / modules_ring_frame: X is ring/back everywhere, Y is
; never the native ring command for Goku, and held combat buttons must be
; released after the menu (menuInputHeld).
combat_menu_frame:
	REP #$30
	JSR cb_ensure_init
	STZ !cb_quiet
	SEP #$20
	LDA.b #$01
	STA !cb_sess
	REP #$20
	STZ !cb_mask
	STZ !cb_inject
	JSR cb_cache_active
	LDA.l !core_pad
	STA !cb_raw
	AND.w #!IN_B|!IN_Y|!IN_A|!IN_L
	STA !cb_menu_held
	JSR cb_menu_x
	; padInput is this frame's pad in menus too (mana-mod.js): the next
	; frame's X press edge (cb_pad_prev) must not see a stale field pad,
	; or a ring opened with X kept every later X on its first route (Y)
	LDA !cb_raw
	STA !cb_pad
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
	; the form Goku shows (the permanent Frieza-story form survives loads)
	LDA.l !persist_ssj_lock
	ORA !goku_form
	AND.b #$01
	STA !cb_form
	STA !cb_form_pub
	STA !goku_form
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
	STZ !cb_fieldv
	LDA.l !persist_goku_active
	BEQ +
	LDA !goku_ctl
	AND.b #!GOKU_CTL_SUPPRESS
	BNE +
	INC !cb_active
+	REP #$20
	; field interrupt vectors ($0100 JML $00C0A8, $0104 JML $00C1CF)
	LDA $0101
	CMP.w #$C0A8
	BNE +
	LDA $0105
	CMP.w #$C1CF
	BNE +
	SEP #$20
	INC !cb_fieldv
	REP #$20
+	RTS

; Z set when the field interrupt vectors are installed (cached per frame).
cb_native_field:
	LDA !cb_fieldv
	AND.w #$00FF
	EOR.w #$0001
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
	LDA !cb_fieldv
	BEQ .keep
	LDA $2C
	BNE .keep
	LDA $EC
	AND.b #$FE
	BNE .keep
	STZ !cb_sess
.keep
	REP #$20
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
; The field frame's gate in one pass: cb_cache_active, cb_session_track,
; cb_compute_can and cb_gate inline (same results). Exit M16.
cb_field_gate:
	SEP #$20
	STZ !cb_active
	STZ !cb_fieldv
	STZ !cb_can
	STZ !cb_gc
	STZ !cb_menuflag
	; X is ring / back in every frame combat sees (cb_menu_x remaps it):
	; hidden up front, also while Goku is inactive, so the game's read of a
	; press frame never gets native X (member 1's ring) before combat's step
	LDA.b #!IN_X
	STA !cb_basemask
	STZ !cb_basemask+1
	LDA.l !persist_goku_active
	BEQ +
	LDA !goku_ctl
	AND.b #!GOKU_CTL_SUPPRESS
	BNE +
	INC !cb_active
+	REP #$20
	LDA $0101
	CMP.w #$C0A8
	BNE .vec
	LDA $0105
	CMP.w #$C1CF
	BNE .vec
	SEP #$20
	INC !cb_fieldv
.vec
	SEP #$20
	; menu session (cb_session_track)
	LDA $EC
	AND.b #$0C
	BNE .sessOn
	BIT $ED
	BVS .sessOn
	LDA !cb_fieldv
	BEQ .sessKeep
	LDA $2C
	BNE .sessKeep
	LDA $EC
	AND.b #$FE
	BNE .sessKeep
	STZ !cb_sess
	BRA .sessKeep
.sessOn
	LDA.b #$01
	STA !cb_sess
.sessKeep
	; a native menu owns the input
	LDA !cb_sess
	BNE .menu
	LDA $EC
	AND.b #$0C
	BNE .menu
	BIT $ED
	BVC .noMenu
.menu
	INC !cb_menuflag
.noMenu
	LDA !cb_active
	BEQ .done
	; on foot A is flight speed, never the dash
	LDA !cb_fieldv
	BEQ .noA
	LDA $EC
	AND.b #$FE
	ORA $D0
	BNE .noA
	LDA.b #!IN_A
	TSB !cb_basemask
.noA
	; player 1 owns Goku: Y is ki
	LDA $E02C
	AND.b #$01
	BEQ .done
	STA !cb_gc
	LDA.b #!IN_Y>>8
	STA !cb_basemask+1
	; canAttack (cb_compute_can): X/L/R are combat's
	LDA !cb_fieldv
	BEQ .done
	LDA !cb_lock
	ORA !cb_lock+1
	ORA !cb_sess
	ORA $D0
	BNE .done
	LDA $EC
	AND.b #$FE
	BNE .done
	BIT $ED
	BVS .done
	LDA $E4
	CMP.b #$01
	BNE .done
	LDA $E5
	CMP.b #$01
	BNE .done
	LDA $E000
	LSR
	BCC .done
	LDA $E011                     ; native hurt poses 8C-8F
	CMP.b #$8C
	BCC +
	CMP.b #$90
	BCC .done
+	LDA $E190
	AND.b #$70
	BNE .done
	LDA $E191
	AND.b #$D5
	BNE .done
	INC !cb_can
	LDA.b #!IN_X|!IN_L|!IN_R
	TSB !cb_basemask
.done
	REP #$20
	LDA !cb_inlock
	BEQ +
	LDA.w #$FFF0
	TSB !cb_basemask
+	RTS

; ---------------------------------------------------------------------------
; mana-mod.js canAttack: Goku active, settled field, player 1 owns Goku, no
; event, menu, fade, hurt pose or incapacitating status. Writes cb_can and
; cb_gc; returns cb_can in A16 (Z set when Goku cannot attack).
cb_compute_can:
	SEP #$20
	STZ !cb_can
	STZ !cb_gc
	LDA !cb_active
	BEQ .no
	LDA $E02C
	AND.b #$01
	STA !cb_gc
	BEQ .no
	LDA !cb_fieldv
	BEQ .no
	LDA !cb_lock
	ORA !cb_lock+1
	ORA !cb_sess
	ORA $D0
	BNE .no
	LDA $EC
	AND.b #$FE
	BNE .no
	LDA $ED
	AND.b #$40
	BNE .no
	LDA $E4
	CMP.b #$01
	BNE .no
	LDA $E5
	CMP.b #$01
	BNE .no
	LDA $E000
	LSR
	BCC .no
	LDA $E011                     ; native hurt poses 8C-8F
	CMP.b #$8C
	BCC +
	CMP.b #$90
	BCC .no
+	LDA $E190
	AND.b #$70
	BNE .no
	LDA $E191
	AND.b #$D5
	BNE .no
	INC !cb_can
	REP #$20
	LDA.w #$0001
	RTS
.no
	REP #$20
	LDA.w #$0000
	RTS

; ---------------------------------------------------------------------------
; The gate of a field frame (game RAM does not change between its catch-up
; steps): canAttack, gokuControls, menu, and the native mask they imply
; (on foot A is flight speed, never the dash; Y is ki, never the native ring
; command; X/L/R are combat's while Goku can fight; other modules may own
; the whole pad).
cb_gate:
	JSR cb_compute_can
	LDA.w #!IN_X                  ; X is always ring / back (cb_field_gate)
	STA !cb_basemask
	SEP #$20
	STZ !cb_menuflag
	LDA !cb_sess
	BNE .menu
	LDA $EC
	AND.b #$0C
	BNE .menu
	LDA $ED
	AND.b #$40
	BEQ .noMenu
.menu
	INC !cb_menuflag
.noMenu
	LDA !cb_active
	BEQ .out8
	LDA !cb_fieldv
	BEQ .noA
	LDA $EC
	AND.b #$FE
	ORA $D0
	BNE .noA
	LDA.b #!IN_A
	TSB !cb_basemask
.noA
	LDA !cb_gc
	BEQ .out8
	LDA.b #!IN_Y>>8
	TSB !cb_basemask+1
	LDA !cb_can
	BEQ .out8
	LDA.b #!IN_X|!IN_L|!IN_R
	TSB !cb_basemask
.out8
	REP #$20
	LDA !cb_inlock
	BEQ +
	LDA.w #$FFF0
	TSB !cb_basemask
+	RTS

; One step's input (beforeFrame up to the enabled check): the pad of this
; step's vblank, buttons held since a menu released first, the gate's mask
; and the X route.
cb_read_input:
	LDA !cb_raw
	STA !cb_t0
	LDA !cb_menuflag
	AND.w #$00FF
	BEQ .free
	LDA !cb_t0
	AND.w #!IN_B|!IN_Y|!IN_A|!IN_L
	STA !cb_menu_held
	BRA .held
.free
	LDA !cb_menu_held
	BEQ .held
	AND !cb_t0
	STA !cb_menu_held
	EOR.w #$FFFF
	AND !cb_t0
	STA !cb_t0
.held
	LDA !cb_t0
	STA !cb_pad
	STA !cb_in
	LDA !cb_basemask
	TSB !cb_mask
	JMP cb_menu_x

; X is ring / back: the game sees native Y (Start for the window and
; controller editors of the menu screens, as panelBack), never native X:
; the mask is requested in every frame, not only once a press is seen (the
; game's read of the press frame comes before combat's).
cb_menu_x:
	LDA.w #!IN_X
	TSB !cb_mask
	LDA !cb_raw
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
	; the window and controller editors finish with Start (mana-mod.js
	; panelBack): settled brightness ($E4 = $E5 = 1), no event, a menu
	; screen with the menu interrupt vectors (JML $C020A7 / JML $00C1CF),
	; options ring (category 2) with option 5 or 6 open. $1876 is the open
	; option; $180A is only the cursor counted from the option the ring last
	; opened at, so after options 3 or 4 Status read as an editor (Start)
	; and nothing could close it (browser fix f376330).
	LDA $E4
	CMP.w #$0101
	BNE .keep
	LDA $0100
	CMP.w #$A75C                  ; 5C A7 20 C0
	BNE .keep
	LDA $0102
	CMP.w #$C020
	BNE .keep
	LDA $0104
	CMP.w #$CF5C                  ; 5C CF C1 00
	BNE .keep
	LDA $0106
	CMP.w #$00C1
	BNE .keep
	SEP #$20
	LDA $D0
	BNE .keep8
	LDA $1809
	CMP.b #$02
	BNE .keep8
	LDA $1876
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
	STA !cb_raw
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
	LDA !cb_inject
	EOR.w #$FFFF
	AND !cb_mask
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
	; an action another module put in !goku_act (teleport) blocks ours; our
	; own kind is still there when an action ended in an earlier catch-up
	; step of this field frame (cb_publish runs after the last step)
	SEP #$20
	STZ !cb_ext_kind
	LDA !cb_act
	BNE +
	LDA !GOKU_ACT_ADDR
	CMP !cb_pub_kind
	BEQ +
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
	JMP cb_locked_input           ; another module owns the pad
+	LDA !cb_recovering
	BEQ +
	RTS
+	JSR cb_bind_camera_pending
	BEQ +
	STZ !cb_inject
	LDA.w #$FFF0
	TSB !cb_mask
	JMP cb_advance_action          ; flight handles queued teleports itself
+	; idle: no combat button (or A), nothing running, pending or held
	LDA !cb_in
	AND.w #!IN_B|!IN_Y|!IN_L|!IN_X|!IN_A
	ORA !cb_fx_mask
	ORA !cb_kb_mask
	ORA !cb_power
	BNE .busy
	SEP #$20
	LDA !cb_act
	ORA !cb_ext_kind
	ORA !cb_charging
	ORA !cb_blast_cd
	ORA !cb_tap
	ORA !cb_queued
	BNE .busy8
	STZ !cb_blocked
	STZ !cb_ki_blk
	STZ !cb_pow_blk
	LDA !cb_can
	REP #$20
	STZ !cb_held
	AND.w #$00FF
	BEQ +
	LDA.w #!IN_B
	TSB !cb_mask
+	RTS
.busy8
	REP #$20
.busy
	; focus unless an L attack chord is held
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

; Another module owns the pad (combat_api_input_lock / _hold; mana-mod.js
; frieza.inputLocked / trial.inputLocked): no input this step and nothing
; injected (the browser zeroes the whole pad). A full lock ends combat's
; action, charge and effects; when every owner holds instead, what was
; fired runs on: while Goku can act, every effect ages (life only: holds
; are not honoured there), the action advances and projectiles hit.
cb_locked_input:
	STZ !cb_in
	STZ !cb_pad
	STZ !cb_inject
	LDA.l !cb_inhold
	EOR.w #$FFFF
	AND !cb_inlock
	BEQ .hold
	JMP cb_cancel_combat_quiet
.hold
	LDA !cb_can
	AND.w #$00FF
	BEQ .out
	LDA !cb_fx_mask
	BEQ +
	JSR cb_effects_age
+	JSR cb_advance_action
	LDA !cb_fx_mask
	BEQ .out
	JSR cb_update_projectiles
.out
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
	; idle: no attack button, nothing running or pending
	LDA !cb_in
	AND.w #!IN_B|!IN_Y|!IN_L
	BNE .work
	SEP #$20
	LDA !cb_act
	ORA !cb_charging
	ORA !cb_tap
	ORA !cb_queued
	REP #$20
	BNE .work
	SEP #$20
	STZ !cb_blocked
	STZ !cb_ki_blk
	REP #$20
	STZ !cb_held
	LDA.w #!IN_B
	TSB !cb_mask
	RTS
.work
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
	REP #$20
	LDA !cb_act_face
	AND.w #$0003
	TAX
	SEP #$20
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
	AND.w #!IN_DIRS
	BEQ .keep
	XBA
	STA !cb_t1                    ; held directions: up 8, down 4, left 2, right 1
	LDA !cb_in_prev
	EOR.w #$FFFF
	AND !cb_in
	AND.w #!IN_DIRS
	XBA                           ; newly pressed
	LDX.w #$0000
	BIT.w #$0003
	BEQ +
	LDX.w #$0010                  ; a horizontal press: the horizontal facing
	BRA ++
+	BIT.w #$000C
	BEQ ++
	LDX.w #$0020                  ; a vertical press: the vertical facing
++	TXA
	ORA !cb_t1
	TAX
	LDA.l cb_aim_table,X
	AND.w #$00FF
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
	REP #$20
	LDA !cb_facing
	AND.w #$0003
	TAX
	SEP #$20
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
if defined("WORLD_MAGIC")
	JSR cb_world_input
	BCS .advance                  ; a transition, docking, wave or scene owns input
endif
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
if defined("WORLD_MAGIC")
	JSR cb_world_attacks
endif
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
	; the form goes to the goku module when combat changes it (scenes and
	; tests may set !goku_form themselves; combat_api_set_form keeps both)
	LDA !cb_form
	CMP !cb_form_pub
	BEQ +
	STA !cb_form_pub
	STA !goku_form
+	LDA !cb_act
	BEQ .none
	STA !goku_act
	STA !cb_pub_kind
	LDA !cb_act_face
	STA !goku_act_facing
	LDA !cb_act_super
	BEQ +
	LDA.b #$80
+	STA !cb_t0
	LDA !cb_act_arg
	AND.b #$03
	ORA !cb_t0
	STA !goku_act_arg
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
	STZ !cb_pub_kind
.modes8
	REP #$20
.modes
	JSR cb_publish_reaction
.out
	REP #$20
	RTS
