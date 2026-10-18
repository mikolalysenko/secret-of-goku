; Public API (docs/agents/snes-port/combat.md) and the save/load hooks.
; Entry points are JSL-callable from any bank and DB; they preserve DB, D
; and the caller's M/X unless noted.

macro cb_api_enter()
	PHP
	PHB
	PHD
	REP #$30
	PHA
	LDA.w #$0000
	TCD
	PEA $7E7E
	PLB
	PLB
	STZ !cb_quiet
	PLA
endmacro
macro cb_api_leave()
	PLD
	PLB
	PLP
endmacro

; combat_api_cancel: end combat's action, charge and effects (flight's
; teleport, story's landing hook, cinematics). Launches and the form stay.
combat_api_cancel:
	%cb_api_enter()
	JSR cb_ensure_init
	JSR cb_cancel_combat
	%cb_api_leave()
	RTL

; combat_api_state: A16 = flags (bit0 can attack, bit1 charging, bit2 Super
; Saiyan, bit3 full charge, bit4 beam live), X16 = charge frames,
; Y16 = combat's action kind (!GOKU_K_*, 0 none). Exit M16/X16.
combat_api_state:
	PHB
	PEA $7E7E
	PLB
	PLB
	REP #$30
	LDA !cb_can
	AND.w #$0001
	STA !cb_t0
	LDA !cb_charging
	AND.w #$00FF
	BEQ +
	LDA.w #$0002
	TSB !cb_t0
+	LDA !cb_form
	AND.w #$00FF
	BEQ +
	LDA.w #$0004
	TSB !cb_t0
+	LDA !cb_act_fl
	AND.w #!AF_FULL
	BEQ +
	LDA !cb_charging
	AND.w #$00FF
	BEQ +
	LDA.w #$0008
	TSB !cb_t0
+	LDA !cb_act
	AND.w #$00FF
	CMP.w #!GOKU_K_BEAM
	BNE +
	LDA.w #$0010
	TSB !cb_t0
+	LDA !cb_act
	AND.w #$00FF
	TAY
	LDX !cb_charge
	LDA !cb_t0
	PLB
	RTL

; combat_api_set_form: A = 0 base, 1 Super Saiyan, without the
; transformation (scenes, the permanent Frieza-story form, endings).
combat_api_set_form:
	%cb_api_enter()
	PHA
	JSR cb_ensure_init
	PLA
	SEP #$20
	AND.b #$01
	STA !cb_form
	STA !goku_form
	%cb_api_leave()
	RTL

; combat_api_hit: queue native damage on actor X (offset $0600-$1600) as
; Goku's hit (rewards, numbers and death stay native). A16 = damage,
; Y16 = facing 0-3 of the launch, or $FFFF for no launch.
; Out: C set when the actor took damage (not an orb, HP was > 0).
combat_api_hit:
	%cb_api_enter()
	STA !cb_hit_dmg
	JSR cb_ensure_init
	SEP #$20
	STZ !cb_hit_launch
	REP #$20
	TYA
	CMP.w #$FFFF
	BEQ +
	AND.w #$0003
	STA !cb_hit_dir
	SEP #$20
	INC !cb_hit_launch
	REP #$20
+	STZ !cb_hit_dx
	STZ !cb_hit_dy
	JSR cb_hit
	LDA !cb_hit_orb
	AND.w #$00FF
	BNE .no
	LDA !cb_hit_after
	CMP !cb_hit_before
	BCS .no
	%cb_api_leave()
	SEC
	RTL
.no
	%cb_api_leave()
	CLC
	RTL

; combat_api_targets: hostile actors in an attack box (the same rules as
; Goku's attacks). In: !ag_x/!ag_y origin (map), !ag_dir facing, !ag_range,
; !ag_width, !ag_behind, !ag_cy (write them with long addressing at
; $7E0000|define). Out: A16 = target mask (bit 0 = actor slot 3; bits 9-15
; the virtual targets, entry 0 first, queried afresh).
combat_api_targets:
	%cb_api_enter()
	JSR cb_vt_stale
	JSR cb_targets
	LDA !ag_list
	%cb_api_leave()
	RTL

; combat_api_vtarget: X16 = the browser's entity index of a virtual target
; (modules.asm modules_combat_targets; frieza.js 12). C set when a
; registered target with that index can be struck now (its query, asked
; afresh): A16 = species, X16 = x, Y16 = y (map), and the long word !cb_vq
; = its terrain byte (the query's high byte) | the entry's flags << 8
; (!CVT_AIRBORNE). C clear otherwise. JSL, any M/X/DB; exit M16/X16, DB
; and D preserved.
combat_api_vtarget:
	PHB
	PHD
	REP #$30
	PEA $7E7E
	PLB
	PLB
	LDA.w #$0000
	TCD
	TXA
	AND.w #$00FF
	STA.l !cb_vq                  ; the index looked for
	LDX.w #$0000
.find
	CPX.w #!VT_TABLE_LEN
	BCS .none
	LDA.l !VT_TABLE+6,X
	AND.w #$00FF
	CMP.l !cb_vq
	BEQ .found
	TXA
	CLC
	ADC.w #8
	TAX
	BRA .find
.found
	LDA.l !VT_TABLE+6,X
	AND.w #$FF00
	STA.l !cb_vq                  ; flags << 8
	JSR cb_vt_query
	BCC .none
	STA.l !cb_vq+2                ; species | terrain << 8
	AND.w #$00FF
	CMP.w #$0080
	BCS .none
	LDA.l !cb_vq+2
	XBA
	AND.w #$00FF
	ORA.l !cb_vq
	STA.l !cb_vq                  ; terrain | flags << 8
	LDA.l !cb_vq+2
	AND.w #$00FF
	PLD
	PLB
	SEC
	RTL
.none
	PLD
	PLB
	CLC
	RTL

; The virtual target cache is stale (the next scan queries every entry).
cb_vt_stale:
	LDA.w #$0000
	STA.l !vt_state
	RTS

; combat_api_beam: C set while Goku's Kamehameha is live (mana-mod.js: a
; 'beam' effect with life > 0). Then X16 = palms x, Y16 = palms y (map),
; A16 = facing (0 down, 1 right, 2 left, 3 up) | $0100 when fired as Super
; Saiyan | $0200 for the full wave, and the long record !cb_beam holds
; beamGeometry() of its current frame (module.asm: palms, dx/dy, length,
; half width 8.8, flags, age, life, taper; its first 14 bytes have the
; layout of vegeta's !vs_gb_* block). C clear otherwise. JSL, any M/X/DB;
; exit M16/X16, DB and D preserved. Uses only combat's math scratch, so a
; virtual target's hit() may call it (vegeta's counterBeam).
combat_api_beam:
	PHB
	PHD
	REP #$30
	PEA $7E7E
	PLB
	PLB
	LDA.w #$0000
	TCD
	JSR cb_beam_find
	BCS +
	PLD
	PLB
	CLC
	RTL
+	JSR cb_beam_geometry
	LDA !cb_m7                    ; full wave
	ASL
	ORA !cb_m6                    ; fired as Super Saiyan
	XBA
	ORA !cb_m5                    ; facing
	PHA
	LDA.l !cb_beam_x
	TAX
	LDA.l !cb_beam_y
	TAY
	PLA
	PLD
	PLB
	SEC
	RTL

; X16 = the live beam's effect record, C set; C clear when there is none.
; (combat keeps one beam record; a freed record has kind 0.)
cb_beam_find:
	LDY !cb_fx_mask
	LDX.w #$0000
.loop
	TYA
	BEQ .none
	LSR
	TAY
	BCC .next
	LDA.l !ER+!er_kind,X
	AND.w #$00FF
	CMP.w #!ERK_BEAM
	BEQ .found
.next
	TXA
	CLC
	ADC.w #!ER_SIZE
	TAX
	BRA .loop
.found
	SEC
	RTS
.none
	CLC
	RTS

; beamGeometry() of beam record X into !cb_beam; cb_m5 = facing. Uses
; cb_mq*, cb_m5-cb_m9 only.
cb_beam_geometry:
	LDA.l !ER+!er_x,X
	STA.l !cb_beam_x
	LDA.l !ER+!er_y,X
	STA.l !cb_beam_y
	LDA.l !ER+!er_dir,X
	AND.w #$0003
	STA !cb_m5
	LDA.w #$0000
	STA !cb_m6                    ; fired as Super Saiyan
	STA !cb_m7                    ; full wave
	LDA.l !ER+!er_flags,X
	BIT.w #!ERF_SUPER
	BEQ +
	INC !cb_m6
+	BIT.w #!ERF_MEGA
	BEQ +
	INC !cb_m7
+	SEP #$20
	LDA !cb_m6
	STA.l !cb_beam_super
	LDA !cb_m7
	STA.l !cb_beam_mega
	REP #$20
	; age = max - life
	LDA.l !ER+!er_life,X
	AND.w #$00FF
	STA.l !cb_beam_life
	STA !cb_m8
	LDA.l !ER+!er_max,X
	AND.w #$00FF
	SEC
	SBC !cb_m8
	STA.l !cb_beam_age
	STA !cb_m9
	; dx, dy of the facing
	PHX
	LDX !cb_m5
	LDA.l cb_dir_dx,X
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	STA.l !cb_beam_dx
	LDA.l cb_dir_dy,X
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	STA.l !cb_beam_dy
	PLX
	; length = min(range, (age + 1) * speed)
	LDA !cb_m9
	INC
	STA !cb_mq
	LDA !bm_speed
	JSR cb_mul16
	LDA !cb_mq2
	BNE .range
	LDA !cb_mq1
	CMP !bm_range
	BCC +
.range
	LDA !bm_range
+	STA.l !cb_beam_len
	; half width (8.8): the full wave by age, normal beams by the charge
	LDA !cb_m7
	BEQ .normal
	LDA.w #44
	STA.l !cb_beam_taper
	LDA !cb_m9
	CMP.w #64
	BCC +
	LDA.w #63
+	ASL
	TAX
	LDA.l combat_mega_half88,X
	STA.l !cb_beam_half
	RTS
.normal
	LDA.w #$0000
	STA.l !cb_beam_taper
	LDA !bm_charge
	AND.w #$00FF
	LDX !cb_m6
	BNE .ssj
	CMP.w #90
	BCC +
	LDA.w #90
+	ASL
	TAX
	LDA.l combat_beam_half88_base,X
	STA.l !cb_beam_half
	RTS
.ssj
	CMP.w #45
	BCC +
	LDA.w #45
+	ASL
	TAX
	LDA.l combat_beam_half88_ssj,X
	STA.l !cb_beam_half
	RTS

; combat_api_lock / combat_api_unlock: A16 = owner bit. While any lock is
; set Goku cannot attack (the ending, cinematics); input passes natively.
combat_api_lock:
	PHP
	REP #$20
	ORA.l $7E0000|!cb_lock
	STA.l $7E0000|!cb_lock
	PLP
	RTL
combat_api_unlock:
	PHP
	REP #$20
	EOR.w #$FFFF
	AND.l $7E0000|!cb_lock
	STA.l $7E0000|!cb_lock
	PLP
	RTL
; combat_api_input_lock / _hold / _unlock: A16 = owner bit; A preserved.
; lock: the owner takes the whole pad (all native input masked, combat
; input zero, nothing injected) and combat's action, charge and effects
; end (mana-mod.js frieza.inputLocked plus cancelCombat).
; hold: the same pad, but what was fired runs on (mana-mod.js
; trial.inputLocked: while Goku can act, every effect ages, the action
; advances and projectiles hit; nothing new starts). Any owner's lock wins
; over holds. unlock releases the owner's lock or hold.
combat_api_input_lock:
	PHP
	REP #$20
	PHA
	ORA.l $7E0000|!cb_inlock
	STA.l $7E0000|!cb_inlock
	LDA $01,S
	EOR.w #$FFFF
	AND.l !cb_inhold
	STA.l !cb_inhold              ; this owner's is a full lock
	LDA.w #$0000
	STA.l $7E0000|!cb_quiet       ; the next field frame takes the full path
	PLA
	PLP
	RTL
combat_api_input_hold:
	PHP
	REP #$20
	PHA
	ORA.l $7E0000|!cb_inlock
	STA.l $7E0000|!cb_inlock
	LDA $01,S
	ORA.l !cb_inhold
	STA.l !cb_inhold
	LDA.w #$0000
	STA.l $7E0000|!cb_quiet
	PLA
	PLP
	RTL
combat_api_input_unlock:
	PHP
	REP #$20
	PHA
	EOR.w #$FFFF
	PHA
	AND.l $7E0000|!cb_inlock
	STA.l $7E0000|!cb_inlock
	PLA
	AND.l !cb_inhold
	STA.l !cb_inhold
	LDA.w #$0000
	STA.l $7E0000|!cb_quiet
	PLA
	PLP
	RTL
; combat_api_danger / _safe: A16 = owner bit. A dangerous encounter
; (Frieza, Vegeta, the empowered Lich, the fed Beast): native damage is not
; scaled down and nothing is deflected.
combat_api_danger:
	PHP
	REP #$20
	ORA.l $7E0000|!cb_danger
	STA.l $7E0000|!cb_danger
	PLP
	RTL
combat_api_safe:
	PHP
	REP #$20
	EOR.w #$FFFF
	AND.l $7E0000|!cb_danger
	STA.l $7E0000|!cb_danger
	PLP
	RTL

; ---------------------------------------------------------------------------
; Story hooks (story/hooks.asm picks these labels up).
; EQUIP_CONFISCATE (entering 28B): the Sandship guards cannot lift the
; Heavy Gi, so Goku stows it: unequipped, still owned.
combat_equip_confiscate:
	%cb_api_enter()
	JSR cb_gi_worn
	BEQ .out
	SEP #$20
	LDX.w #$000B
.inv
	LDA $CC2C,X                   ; armor inventory: item | wearer<<6
	CMP.b #$40|$16
	BNE +
	LDA.b #$16
	STA $CC2C,X
+	DEX
	BPL .inv
	LDA.b #$15                    ; 21: the empty body slot
	STA $E1E1
	REP #$20
	LDA.w #$0000
	JSR cb_agility_stats
	JSR cb_power_bytes
.out
	%cb_api_leave()
	RTL
; EQUIP_WEIGHTED query: A16 = 1 while the Heavy Gi is worn.
combat_q_weighted:
	PHB
	PEA $7E7E
	PLB
	PLB
	REP #$30
	JSR cb_gi_worn
	PLB
	RTL

; ---------------------------------------------------------------------------
; Core save/load hooks.
combat_new_game:
	JSR cb_ensure_init
	STZ !cb_quiet
	JSR cb_cancel_combat_quiet
	SEP #$20
	; a new game starts in base form whatever the title-time init saw
	STZ !cb_form
	STZ !cb_form_pub
	STZ !goku_form
	REP #$20
	LDA.w #$0000
	STA.l !pc_flags
	RTL
combat_load:
	JSR cb_ensure_init
	STZ !cb_quiet
	JSR cb_cancel_combat_quiet
	JSR cb_launch_clear
	SEP #$20
	LDA.l !persist_ssj_lock
	AND.b #$01
	STA !cb_form
	STA !cb_form_pub                  ; the loaded form is the shown form
	STA !goku_form
	STZ !cb_def_valid
	STZ !cb_agi_valid
	STZ !cb_hr_tier
	STZ !cb_react
	REP #$20
	LDA.w #$FFFF
	STA !cb_map
	STA !cb_rec_map
	RTL

; ---------------------------------------------------------------------------
; Debug scene select (docs/agents/snes-port/debug.md): the combat calls a
; preset's browser recipe makes. JSL with A16 = kind, X16 = preset,
; Y16 = payload offset in bank !DEBUG_PAYLOAD_BANK (count, then key / value
; word triples), DB = $7E, D = 0. CANCEL_COMBAT: mod.cancelCombat();
; FORM: options.superSaiyan; POWER_INTRO: superShown (the first
; transformation reveal was seen; the flight hint is the UI's). Other kinds
; are not combat's. Carry clear = done.
if defined("DEBUG_HOOK_FORM")
combat_debug_hook:
	%cb_api_enter()
	PHA
	JSR cb_ensure_init
	PLA
	CMP.w #!DEBUG_HOOK_CANCEL_COMBAT
	BNE +
	JSR cb_cancel_combat
	BRA .done
+	CMP.w #!DEBUG_HOOK_FORM
	BNE +
	LDA.w #!DEBUG_KEY_SUPER_SAIYAN
	JSR cb_debug_value
	BCC .done
	SEP #$20
	AND.b #$01
	STA !cb_form
	STA !goku_form
	REP #$20
	BRA .done
+	CMP.w #!DEBUG_HOOK_POWER_INTRO
	BNE .done
	LDA.w #!DEBUG_KEY_SUPER_SHOWN
	JSR cb_debug_value
	BCC .done
	TAX
	SEP #$20
	LDA.l !pc_flags
	AND.b #$FF^!PCF_REVEALED
	CPX.w #$0000
	BEQ +
	ORA.b #!PCF_REVEALED
+	STA.l !pc_flags
	REP #$20
.done
	%cb_api_leave()
	CLC
	RTL

; A16 = payload key: A16 = its value and C set, or C clear when absent.
cb_debug_value:
	STA !cb_t0
	TYX
	SEP #$20
	LDA.l !DEBUG_PAYLOAD_BANK<<16,X
	STA !cb_t1
	INX
-	LDA !cb_t1
	BEQ .none
	LDA.l !DEBUG_PAYLOAD_BANK<<16,X
	CMP !cb_t0
	BEQ .found
	INX
	INX
	INX
	DEC !cb_t1
	BRA -
.found
	REP #$20
	LDA.l (!DEBUG_PAYLOAD_BANK<<16)+1,X
	SEC
	RTS
.none
	REP #$20
	LDA.w #$0000
	CLC
	RTS
endif

; ---------------------------------------------------------------------------
; Test builds (-DCOMBAT_TEST): the mailbox and probes of snes/test/combat.
if defined("COMBAT_TEST")
; Start of a field frame's logic: !cbt_cmd 1 holds, 2 locks, 3 unlocks the
; input for owner !cbt_owner (as a scene module would), then clears.
cb_test_mailbox:
	LDA.l !cbt_cmd
	BEQ .out
	CMP.w #1
	BNE +
	LDA.l !cbt_owner
	JSL combat_api_input_hold
	BRA .done
+	CMP.w #2
	BNE +
	LDA.l !cbt_owner
	JSL combat_api_input_lock
	BRA .done
+	LDA.l !cbt_owner
	JSL combat_api_input_unlock
.done
	LDA.w #$0000
	STA.l !cbt_cmd
.out
	RTS

; Frame end: combat_api_beam's answer for the test probe.
cb_test_beam_probe:
	JSL combat_api_beam
	BCS +
	LDA.w #$0000
	STA.l !cbt_beam_c
	RTS
+	STA.l !cbt_beam_a
	LDA.w #$0001
	STA.l !cbt_beam_c
	LDX.w #$0012
-	LDA.l !cb_beam,X
	STA.l !cbt_beam,X
	DEX
	DEX
	BPL -
	RTS

; A receive hook (modules.asm modules_combat_receive, test builds): A16 =
; the damage queued on Goku -> A16 by !cbt_rx_mode.
combat_test_receive:
	STA.l !cbt_rx_in
	PHA
	LDA.l !cbt_rx_n
	INC
	STA.l !cbt_rx_n
	LDA.l !cbt_rx_mode
	CMP.w #1
	BEQ .cap
	CMP.w #2
	BEQ .none
	PLA
	RTL
.cap
	PLA
	CMP.l !cbt_rx_cap
	BCC +
	LDA.l !cbt_rx_cap
+	RTL
.none
	PLA
	LDA.w #$0000
	RTL
endif
