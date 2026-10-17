; Hooks into original code (patched in hooks.asm). Each is entered by JSL
; from the patch site (or JML where noted) with the caller's registers; it
; either re-executes the replaced instructions and returns after the patch,
; or redirects the return to another address of the caller's bank
; (%cb_redirect), so the hooks work from bank $00 and $C0 alike.
; Browser sources: native-interaction.js, native-combat-sound.js,
; native-hit-recovery.js, native-equipment.js, native-senzu.js.

; Return to <target> in the caller's bank instead of after the patch.
; Nothing may be pushed by the hook at this point; A/X/Y/P are preserved.
macro cb_redirect(target)
	PHP
	REP #$20
	PHA
	LDA.w #<target>-1
	STA $04,S
	PLA
	PLP
	RTL
endmacro

; ---------------------------------------------------------------------------
; Shared predicates (any DB; long addressing). All preserve X/Y and leave
; M16; result in carry.

; Goku active (arrival happened, not the ending's native boy). C set.
cb_n_active:
	SEP #$20
	LDA.l !persist_goku_active
	BEQ .no
	LDA.l $7E0000|!goku_ctl
	AND.b #!GOKU_CTL_SUPPRESS
	BNE .no
	REP #$20
	SEC
	RTS
.no
	REP #$20
	CLC
	RTS

; native-hit-recovery enabled(): Goku controllable on the field. C set.
cb_n_enabled:
	JSR cb_n_active
	BCC .no
	SEP #$20
	LDA.l $7E0000|!cb_world
	BNE .no8
	LDA.l $7EE000
	AND.b #$01
	BEQ .no8
	LDA.l $7EE02C
	AND.b #$01
	BEQ .no8
	LDA.l $7E00D0
	BNE .no8
	LDA.l $7E00EC
	AND.b #$FE
	BNE .no8
	LDA.l $7EE190
	AND.b #$70
	BNE .no8
	LDA.l $7EE191
	AND.b #$D5
	BNE .no8
	REP #$20
	SEC
	RTS
.no8
	REP #$20
.no
	CLC
	RTS

; defending(): enabled, field vectors, not poisoned, no dangerous foe.
cb_n_defending:
	JSR cb_n_enabled
	BCC .no
	LDA.l $7E0101
	CMP.w #$C0A8
	BNE .no
	LDA.l $7EE191
	AND.w #$0020
	BNE .no
	LDA.l $7E0000|!cb_danger
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; ---------------------------------------------------------------------------
; C0:B224 / C0:B2A7 (bank 00): the charged and normal weapon attacks. A
; native B pulse (talk, chests) must never fall through to Randi's hidden
; sword; transformed / trapped forms keep their native escape controls.
; Entered M8 X16 with X = party member offset.
cb_hook_weapon_charged:
	JSR cb_weapon_blocked
	BCC +
	%cb_redirect($B247)           ; RTS
+	LDA.l $7EE060,X
	RTL
cb_hook_weapon_normal:
	JSR cb_weapon_blocked
	BCC +
	%cb_redirect($B2B1)           ; RTS
+	LDA.l $7EE01C,X
	RTL
cb_weapon_blocked:
	PHP
	CPX.w #$0000
	BNE .no
	JSR cb_n_active
	BCC .no
	SEP #$20
	LDA.l $7EE190
	AND.b #$60
	BNE .no
	LDA.l $7EE191
	AND.b #$55
	BNE .no
	PLP
	SEC
	RTS
.no
	PLP
	CLC
	RTS

; ---------------------------------------------------------------------------
; C0:4157 (bank C0): the impact sound of the native damage consumer. Goku's
; queued hits already played their DBZ cue at contact; Goku's own hurt
; impacts use the DBZ hit cue. Everything else keeps the native sound.
; Entered M8 X16, X = actor offset. Replaced: LDA #$02 / STA $1E00.
cb_hook_hit_sound:
	JSR cb_hit_sound_owned
	BCC .native
	%cb_redirect($4176)           ; RTS
.native
	LDA.b #$02
	STA.l $7E1E00
	RTL
cb_hit_sound_owned:
	PHP
	REP #$30
	PHA
	PHX
	PHY
	JSR cb_bind_has_audio          ; without the audio module keep the game's
	BCS +
	JMP .no
+	JSR cb_n_active
	BCS +
	JMP .no
+	LDA $03,S                     ; caller's X
	BNE .enemy
	LDA.l $7EE1F1
	BEQ .no
	LDA.w #!AUDIO_SFX_HIT_ID
	JSR cb_sfx_long
	BRA .yes
.enemy
	CMP.w #!ACT_FIRST
	BCC .no
	CMP.w #!ACT_END
	BCS .no
	TAX
	SEC
	SBC.w #!ACT_FIRST
	LSR : LSR : LSR : LSR : LSR : LSR
	TAY                           ; mark offset
	TYX
	LDA.l !SM+!sm_on,X
	AND.w #$00FF
	BEQ .no
	LDA.l !SM+!sm_map,X
	CMP.l $7E00DC
	BNE .no
	LDA.l $7E0000|!cb_frame
	SEC
	SBC.l !SM+!sm_frame,X
	CMP.w #8
	BCS .no
	LDA $03,S
	TAX                           ; actor offset
	LDA.l $7EE180,X
	AND.w #$00FF
	STA.l $7E0000|!cb_t0
	LDA.l $7EE1F0,X
	AND.w #$00FF
	BNE .no
	TYX
	LDA.l !SM+!sm_sp,X
	AND.w #$00FF
	CMP.l $7E0000|!cb_t0
	BNE .no
	SEP #$20
	LDA.b #$00
	STA.l !SM+!sm_on,X
	REP #$20
.yes
	PLY
	PLX
	PLA
	PLP
	SEC
	RTS
.no
	PLY
	PLX
	PLA
	PLP
	CLC
	RTS

; ---------------------------------------------------------------------------
; Hit recovery (native-hit-recovery.js). Ticks are core frames.

; threat(): 1 ordinary, 2 boss, 3 dangerous. A16 out. Any DB.
cb_threat:
	LDA.l $7E0000|!cb_danger
	BEQ +
	LDA.w #3
	RTS
+	; the attacker's slot (physical hits keep it; spells use $FF)
	LDA.l $7EE1F0
	AND.w #$00FF
	CMP.w #3
	BCC .scan
	CMP.w #12
	BCS .scan
	XBA
	ASL
	TAX
	JSR cb_threat_enemy
	BCC .scan
	JSR cb_threat_boss
	BCC .ordinary
	LDA.w #2
	RTS
.scan
	LDX.w #!ACT_FIRST
-	JSR cb_threat_enemy
	BCC +
	JSR cb_threat_boss
	BCC +
	LDA.w #2
	RTS
+	TXA
	CLC
	ADC.w #$0200
	TAX
	CPX.w #!ACT_END
	BCC -
.ordinary
	LDA.w #1
	RTS
; X = actor offset: active, alive, HP > 0. C set.
cb_threat_enemy:
	LDA.l $7EE000,X
	AND.w #$0001
	BEQ .no
	LDA.l $7EE182,X
	BEQ .no
	LDA.l $7EE191,X
	AND.w #$0080
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS
; species $57-$7F. C set.
cb_threat_boss:
	LDA.l $7EE180,X
	AND.w #$00FF
	CMP.w #$0057
	BCC .no
	CMP.w #$0080
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS

; old(): the recorded hit is past its recovery window. C set.
; Ordinary hits: 4 / 8 frames (Super Saiyan / base); others 8 / 24.
cb_hr_old:
	LDA.l $7E0000|!cb_hr_tier
	AND.w #$00FF
	BEQ .no
	CMP.w #1
	BNE .boss
	LDA.w #8
	LDX.w #4
	BRA .sel
.boss
	LDA.w #24
	LDX.w #8
.sel
	PHA
	LDA.l $7E0000|!cb_form
	AND.w #$00FF
	BEQ +
	PLA
	TXA
	PHA
+	PLA
	STA.l $7E0000|!cb_t0
	LDA.l !core_tick
	SEC
	SBC.l $7E0000|!cb_hr_frame
	CMP.l $7E0000|!cb_t0
	BCC .no
	SEC
	RTS
.no
	CLC
	RTS

; C0:4053 (bank C0): Goku's queued damage before the native consumer.
; Ordinary threats chip (1-12, 1-5 in Super Saiyan), native bosses hurt
; more (<= 80 / 40), dangerous scenes keep the native amount; the native
; code still subtracts HP, shows the number and handles a lethal hit.
; Entered with X = actor offset. Replaced: REP #$20 / LDA $E1F1,X.
cb_hook_receive:
	CPX.w #$0000
	BNE .native
	PHP
	REP #$30
	PHA
	PHX
	PHY
	JSR cb_receive
	PLY
	PLX
	PLA
	PLP
.native
	REP #$20
	LDA.l $7EE1F1,X
	RTL
cb_receive:
	LDA.l $7EE1F1
	BNE +
	RTS
+	JSR cb_n_active
	BCS +
	RTS
+	LDA.l $7E0000|!cb_world
	AND.w #$00FF
	BEQ +
	RTS
+	LDA.l $7EE000
	AND.w #$0001
	BNE +
	RTS
+	LDA.l $7EE182
	BNE +
	RTS
+	JSR cb_threat
	STA.l $7E0000|!cb_t1          ; tier
	CMP.w #3
	BEQ .record
	LDA.l $7EE1B0
	AND.w #$1000                  ; damage converted to healing: native
	BNE .record
	; divisor / cap by tier and form
	LDA.l $7E0000|!cb_form
	AND.w #$00FF
	ASL
	STA.l $7E0000|!cb_t2
	LDA.l $7E0000|!cb_t1
	CMP.w #1
	BEQ +
	LDA.w #4                      ; boss rows
	ORA.l $7E0000|!cb_t2
	BRA ++
+	LDA.l $7E0000|!cb_t2
++	TAX
	LDA.l cb_receive_div,X
	STA.l $7E0000|!cb_t2          ; divisor
	LDA.l cb_receive_cap,X
	STA.l $7E0000|!cb_t3          ; cap
	; min(cap, max(1, ceil(min(999, damage) / divisor)))
	LDA.l $7EE1F1
	CMP.w #1000
	BCC +
	LDA.w #999
+	CLC
	ADC.l $7E0000|!cb_t2
	DEC
	LDX.w #$0000
-	CMP.l $7E0000|!cb_t2
	BCC +
	SEC
	SBC.l $7E0000|!cb_t2
	INX
	BRA -
+	TXA
	BNE +
	LDA.w #1
+	CMP.l $7E0000|!cb_t3
	BCC +
	LDA.l $7E0000|!cb_t3
+	STA.l $7EE1F1
.record
	; the hit (recovery window) and a resisting pose for ordinary hits
	LDA.l $7E00DC
	STA.l $7E0000|!cb_hr_map
	LDA.l !core_tick
	STA.l $7E0000|!cb_hr_frame
	SEP #$20
	LDA.l $7E0000|!cb_t1
	STA.l $7E0000|!cb_hr_tier
	LDA.b #$00
	STA.l $7E0000|!cb_hr_recoil
	REP #$20
	LDA.l $7E0000|!cb_t1
	CMP.w #1
	BNE .out
	JSR cb_n_defending
	BCC .out
	SEP #$20
	LDA.b #!GOKU_K_RESIST
	STA.l $7E0000|!cb_react
	LDA.l $7E0000|!cb_facing
	STA.l $7E0000|!cb_react_face
	REP #$20
	LDA.l !core_tick
	STA.l $7E0000|!cb_react_tick
	LDA.l $7E00DC
	STA.l $7E0000|!cb_react_map
.out
	RTS
cb_receive_div:                       ; ordinary base, ordinary SSJ, boss base, boss SSJ
	dw 20,50,4,8
cb_receive_cap:
	dw 12,5,80,40

; C0:514B (bank C0): the physical damage resolver for target X, attacker
; Y. Super Saiyan deflects two of every three ordinary contacts (base form
; one of three, focus all), at most every 24 frames, through the retail
; dodge routine C0:4E6F, whose RTS returns to the resolver's caller.
; Entered M8 X16. Replaced: LDA $E1BF,X / STA $90.
cb_hook_parry:
	CPX.w #$0000
	BNE .native
	JSR cb_parry
	BCC .native
	%cb_redirect($4E6F)
.native
	LDA.l $7EE1BF,X
	STA $90
	RTL
cb_parry:
	PHP
	REP #$30
	PHX
	PHY
	JSR cb_parry_eligible
	BCS +
	JMP .no
+	LDA.l $7E0000|!cb_contacts
	INC
	STA.l $7E0000|!cb_contacts
	; holding focus deflects every contact
	SEP #$20
	LDA.l $7E0000|!cb_act
	CMP.b #!GOKU_K_FOCUS
	REP #$20
	BNE .roll
	LDA.l $7E0000|!cb_in
	AND.w #!IN_L
	BNE .window
.roll
	; contacts % 3: SSJ deflects unless 0, base only when 0
	LDA.l $7E0000|!cb_contacts
-	CMP.w #3
	BCC +
	SBC.w #3
	BRA -
+	STA.l $7E0000|!cb_t0
	LDA.l $7E0000|!cb_form
	AND.w #$00FF
	BEQ .base
	LDA.l $7E0000|!cb_t0
	BEQ .noNear
	BRA .window
.base
	LDA.l $7E0000|!cb_t0
	BNE .noNear
.window
	LDA.l !core_tick
	SEC
	SBC.l $7E0000|!cb_parry_until
	BPL .deflect
.noNear
	JMP .no
.deflect
	; deflect: face the attacker
	LDA.l $7EE002,X
	SEC
	SBC.l $7EE002
	STA.l $7E0000|!cb_t1          ; dx
	JSR cb_abs
	STA.l $7E0000|!cb_t3
	LDA.l $7EE004,X
	SEC
	SBC.l $7EE004
	STA.l $7E0000|!cb_t2          ; dy
	JSR cb_abs
	CMP.l $7E0000|!cb_t3
	BCC .horiz                    ; |dx| > |dy|
	LDA.l $7E0000|!cb_t2
	BMI +
	LDA.w #0
	BRA .face
+	LDA.w #3
	BRA .face
.horiz
	LDA.l $7E0000|!cb_t1
	BMI +
	LDA.w #1
	BRA .face
+	LDA.w #2
.face
	SEP #$20
	STA.l $7E0000|!cb_react_face
	LDA.b #!GOKU_K_DEFLECT
	STA.l $7E0000|!cb_react
	REP #$20
	LDA.l !core_tick
	STA.l $7E0000|!cb_react_tick
	CLC
	ADC.w #24
	STA.l $7E0000|!cb_parry_until
	LDA.l $7E00DC
	STA.l $7E0000|!cb_react_map
	LDA.l $7E0000|!cb_deflected
	INC
	STA.l $7E0000|!cb_deflected
	LDA.w #!AUDIO_SFX_DEFLECT_ID
	JSR cb_sfx_long
	PLY
	PLX
	PLP
	SEC
	RTS
.no
	PLY
	PLX
	PLP
	CLC
	RTS

; An ordinary physical contact on Goku by attacker Y (enemy slot, no boss,
; no weapon status, nothing queued on Goku) while he defends. C set; X = Y.
cb_parry_eligible:
	JSR cb_n_defending
	BCC .no
	TYA
	CMP.w #!ACT_FIRST
	BCC .no
	CMP.w #$1601
	BCS .no
	AND.w #$01FF
	BNE .no
	TYX
	LDA.l $7EE000,X
	AND.w #$0001
	BEQ .no
	LDA.l $7EE180,X
	AND.w #$00FF
	CMP.w #$0057
	BCS .no
	LDA.l $7EE199,X
	BNE .no
	LDA.l $7EE1F1
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; C0:4AF9 (bank C0): end of the native DEF computation (C0:4A75) for actor
; X. Replaced: STA $E1AA,X (M16) / SEP #$20. Adds the Saiyan defense to the
; freshly rebuilt totals.
cb_hook_defense:
	STA.l $7EE1AA,X
	CPX.w #$0000
	BNE .out
	PHP
	REP #$30
	PHA
	PHX
	PHY
	PHB
	PEA $7E7E
	PLB
	PLB
	LDA.w #$0001
	JSR cb_defense_stats
	PLB
	PLY
	PLX
	PLA
	PLP
.out
	SEP #$20
	RTL

; C0:F590 (bank 00): Goku's hurt-animation timer. Past the recovery window
; the remaining delay is skipped. Replaced: LDA $E012,X / BEQ $F59A (M8).
cb_hook_hurt_timer:
	CPX.w #$0000
	BNE .native
	PHP
	REP #$30
	PHX
	JSR cb_hr_shorten
	BCC +
	SEP #$20
	LDA.b #$00
	STA.l $7EE012
+	PLX
	PLP
.native
	LDA.l $7EE012,X
	BNE +
	%cb_redirect($F59A)
+	RTL

; C1:8355 (bank 01): the damage-number fade of actor X. Past the recovery
; window the counter ends now; C1:83F9 frees the number and restores the
; actor. Replaced: LDA $E11F,X / BNE $8376 (M8).
cb_hook_number_fade:
	CPX.w #$0000
	BNE .native
	PHP
	REP #$30
	PHX
	JSR cb_hr_shorten
	BCC +
	SEP #$20
	LDA.b #$01
	STA.l $7EE11F
	LDA.l $7EE012
	CMP.b #$02
	BCC ++
	LDA.b #$01
	STA.l $7EE012
++	REP #$20
	LDA.l $7E0000|!cb_recovered
	INC
	STA.l $7E0000|!cb_recovered
+	PLX
	PLP
.native
	LDA.l $7EE11F,X
	BEQ +
	%cb_redirect($8376)
+	RTL

; The recorded hit is old and Goku is in an ordinary hurt pose. C set.
cb_hr_shorten:
	LDA.l $7E0000|!cb_hr_tier
	AND.w #$00FF
	BEQ .no
	JSR cb_n_enabled
	BCC .no
	JSR cb_hr_old
	BCC .no
	SEP #$20
	LDA.l $7EE011
	CMP.b #$8D
	BEQ .yes
	CMP.b #$8E
	BEQ .yes
	REP #$20
.no
	CLC
	RTS
.yes
	REP #$20
	SEC
	RTS

; ---------------------------------------------------------------------------
; Heavy Gi: C0:4699 (bank 00) marks a fresh level-table read for Goku
; (Y = 0); C0:4BF2 (after the native attribute clamp, before agility feeds
; evade) applies the weight; C0:4576 (end of the rebuild) restores the
; Saiyan strength and attack bytes.
cb_hook_level_read:
	CPY.w #$0000
	BNE +
	PHP
	SEP #$20
	LDA.b #$01
	STA.l $7E0000|!cb_rebuild
	PLP
+	LDA.l $D04215,X
	RTL

; Replaced: BNE $4BDB / LDX $BD; the RTS at C0:4BF6 stays.
cb_hook_attr_clamp:
	BEQ +
	%cb_redirect($4BDB)
+	LDX $BD
	BNE .out
	PHP
	REP #$30
	PHA
	PHX
	PHY
	PHB
	PEA $7E7E
	PLB
	PLB
	SEP #$20
	LDA !cb_rebuild
	BEQ +
	STZ !cb_rebuild
	REP #$20
	LDA.w #$0001
	JSR cb_agility_stats
+	REP #$30
	PLB
	PLY
	PLX
	PLA
	PLP
.out
	RTL

; C0:4576 (JML): PLP / PLB / PLD / RTL of the stats rebuild.
cb_hook_rebuild_end:
	CPX.w #$0000
	BNE .out
	PHP
	REP #$30
	PHA
	PHX
	PHY
	PHB
	PEA $7E7E
	PLB
	PLB
	JSR cb_goku_active
	BEQ +
	JSR cb_power_bytes
+	PLB
	PLY
	PLX
	PLA
	PLP
.out
	PLP
	PLB
	PLD
	RTL

; D0:D1CF (bank D0): the hero's weapon ring tier is built here; for Goku it
; stays empty, so the native ring skips it like a tier without spells.
; Replaced: LDA #$0063 / STA $182A (M16).
cb_hook_weapon_tier:
	PHP
	JSR cb_n_active
	BCC .native
	SEP #$20
	LDA.l $7E1808
	BNE .native
	PLP
	%cb_redirect($D1FA)           ; RTS
.native
	PLP
	LDA.w #$0063
	STA.l $7E182A
	RTL

; C0:74B6 (bank 00): every native equip/swap resolves its item here before
; any inventory or stat write. Goku's weapons and the sword (item $55) use
; the native rejection branch C0:7594. Replaced: SEP #$30 / LDA $185D.
cb_hook_equip:
	PHP
	JSR cb_n_active
	BCC .native
	SEP #$20
	LDA.l $7E1809
	CMP.b #$03
	BNE .native
	LDA.l $7E1808
	BEQ .reject
	REP #$20
	LDA.l $7E182C
	CMP.w #$0055
	BNE .native
.reject
	PLP
	%cb_redirect($7594)
.native
	PLP
	SEP #$30
	LDA.l $7E185D
	RTL

; D0:DB2A (bank D0): item-only target filter of the ring. The Senzu Bean
; (item 5, the Cup of Wishes) revives the fallen and fully heals living,
; injured allies; full health stays an invalid target.
; Replaced: LDA $7E0191,X (X = target actor address).
cb_hook_item_target:
	PHP
	REP #$30
	PHA
	JSR cb_n_active
	BCC .native
	LDA.l $7E1809
	AND.w #$00FF
	BNE .native
	LDA.l $7E19F1
	AND.w #$00FF
	CMP.w #$0005
	BNE .native
	CPX.w #$E000
	BEQ .party
	CPX.w #$E200
	BEQ .party
	CPX.w #$E400
	BNE .native
.party
	LDA.l $7E0000,X
	AND.w #$0001
	BEQ .native
	LDA.l $7E0191,X
	AND.w #$0080
	BNE .accept
	LDA.l $7E0182,X
	CMP.l $7E0184,X
	BCC .accept
	PLA
	PLP
	%cb_redirect($DB4D)           ; full health: not a target
.accept
	PLA
	PLP
	%cb_redirect($DB44)
.native
	PLA
	PLP
	LDA.l $7E0191,X
	RTL

; ---------------------------------------------------------------------------
; Saiyan recoil (softenRecoil): an ordinary hit pushes Goku at most 4 px
; (2 in Super Saiyan), 2 / 1 px per movement step. $1E/$1F hold the step's
; signed-magnitude velocity, $10 the moving actor.
; C0:D651 hook (bind.asm). Replaced: SEP #$20 / LDA $1F / ORA $1E.
combat_hook_move_vector:
	JSL combat_recoil_vector
	SEP #$20
	LDA $1F
	ORA $1E
	RTL
; C0:D890 hook (bind.asm). Replaced: SEP #$20 / CPX #$0600.
combat_hook_move_commit:
	JSL combat_recoil_commit
	SEP #$20
	CPX.w #$0600
	RTL

; combat_recoil_vector / combat_recoil_commit: callable from flight's own
; D651 / D890 hooks (any DB/M/X; everything preserved; D = 0 assumed by the
; native movement code, so $10/$1E/$1F are read as $7E:0010...).
combat_recoil_vector:
	PHP
	REP #$30
	PHA
	PHX
	JSR cb_recoil_ok
	BCC .out
	; budget = max(0, (gold ? 2 : 4) - spent); speed = min(gold ? 1 : 2, budget)
	LDA.w #4
	LDX.w #2
	JSR cb_n_by_form
	SEC
	SBC.l $7E0000|!cb_hr_recoil
	BCS +
	LDA.w #0
+	STA.l $7E0000|!cb_t0
	LDA.w #2
	LDX.w #1
	JSR cb_n_by_form
	CMP.l $7E0000|!cb_t0
	BCC +
	LDA.l $7E0000|!cb_t0
+	STA.l $7E0000|!cb_t0          ; speed
	SEP #$20
	LDX.w #$0000
.axis
	LDA.l $7E001E,X
	AND.b #$7F
	CMP.l $7E0000|!cb_t0
	BCC +
	LDA.l $7E0000|!cb_t0
+	BEQ .zero
	STA.l $7E0000|!cb_t1
	LDA.l $7E001E,X
	AND.b #$80
	ORA.l $7E0000|!cb_t1
.zero
	STA.l $7E001E,X
	INX
	CPX.w #2
	BCC .axis
.out
	REP #$30
	PLX
	PLA
	PLP
	RTL
combat_recoil_commit:
	PHP
	REP #$30
	PHA
	PHX
	JSR cb_recoil_ok
	BCC .out
	SEP #$20
	LDA.l $7E001E
	AND.b #$7F
	STA.l $7E0000|!cb_t0
	LDA.l $7E001F
	AND.b #$7F
	CMP.l $7E0000|!cb_t0
	BCS +
	LDA.l $7E0000|!cb_t0
+	CLC
	ADC.l $7E0000|!cb_hr_recoil
	BCC +
	LDA.b #$FF
+	STA.l $7E0000|!cb_hr_recoil
.out
	REP #$30
	PLX
	PLA
	PLP
	RTL
; Goku ($10 = 0) recoils from an ordinary hit on this map. C set. M16.
cb_recoil_ok:
	LDA.l $7E0010
	BNE .no
	LDA.l $7E0000|!cb_hr_tier
	AND.w #$00FF
	CMP.w #1
	BNE .no
	LDA.l $7E00DC
	CMP.l $7E0000|!cb_hr_map
	BNE .no
	JSR cb_n_enabled
	BCC .no
	SEP #$20
	LDA.l $7EE011
	CMP.b #$8D
	BEQ .yes
	CMP.b #$8E
	BEQ .yes
	REP #$20
.no
	CLC
	RTS
.yes
	REP #$20
	SEC
	RTS
; A16 = base value, X16 = Super Saiyan value (any DB).
cb_n_by_form:
	PHA
	LDA.l $7E0000|!cb_form
	AND.w #$00FF
	BEQ +
	PLA
	TXA
	RTS
+	PLA
	RTS
