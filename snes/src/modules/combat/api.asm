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
; $7E0000|define). Out: A16 = slot mask (bit 0 = actor slot 3).
combat_api_targets:
	%cb_api_enter()
	JSR cb_targets
	LDA !ag_list
	%cb_api_leave()
	RTL

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
; combat_api_input_lock / _unlock: A16 = owner bit. The owner takes the
; whole pad (all native input masked, combat paused).
combat_api_input_lock:
	PHP
	REP #$20
	ORA.l $7E0000|!cb_inlock
	STA.l $7E0000|!cb_inlock
	PHA
	LDA.w #$0000
	STA.l $7E0000|!cb_quiet       ; the next field frame takes the full path
	PLA
	PLP
	RTL
combat_api_input_unlock:
	PHP
	REP #$20
	EOR.w #$FFFF
	AND.l $7E0000|!cb_inlock
	STA.l $7E0000|!cb_inlock
	PHA
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
	STZ !cb_form
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
