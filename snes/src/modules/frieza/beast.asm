; The Mana Beast challenge and Frieza's ki for Dark Lich
; (engine/beast-challenge.js). Persistent: !fzp_beast (fed, started, won).
; Per-visit state in WRAM after the battle block.

; challenge.choose(feed): seven personally collected seeds always feed.
frieza_h_beast_ordinary:              ; 95
	LDA.w #$0000
	BRA fz_beast_choose
frieza_h_beast_feed:                  ; 96
	LDA.w #$0001
fz_beast_choose:
	STA !fz_t0
	JSR fz_quest
	XBA
	AND.w #$007F
	CMP.w #$007F
	BNE +
	LDA.w #$0001                      ; canFeed forces the fed Beast
	STA !fz_t0
+	LDA !fz_t0
	BEQ +
	LDA.w #!FZX_FED
+	SEP #$20
	STA.l !fzp_beast                   ; fed, not started, not won
	REP #$20
	JSR fz_beast_reset
	RTL

; challenge.victory(): the native Beast fell before 42F chose the ending.
frieza_h_beast_victory:
	LDA.l !fzp_beast
	AND.w #!FZX_FED|!FZX_STARTED
	CMP.w #!FZX_FED|!FZX_STARTED
	BNE +
	LDA.w #!FZX_WON
	SEP #$20
	ORA.l !fzp_beast
	STA.l !fzp_beast
	REP #$20
	STZ !fzx_bon
+	RTL

; Per-visit state (hits, clock, grace, burst, Beast body).
fz_beast_reset:
	LDA.w #$FFFF
	STA !fzx_body
	STZ !fzx_clock
	STZ !fzx_pending
	SEP #$20
	STZ !fzx_grace
	STZ !fzx_hits
	STZ !fzx_bon
	REP #$20
	RTS
fz_lich_reset:
	LDA.w #$FFFF
	STA !fzl_base
	SEP #$20
	STZ !fzl_buffs
	LDA.b #$FF
	STA !fzl_boost
	REP #$20
	RTS

; First living native actor (slots 3+) of species A16: C set, X = offset.
fz_find_boss:
	STA !fz_t6
	LDX.w #$0600
.loop
	LDA $E000,X
	AND.w #$0001
	BEQ .next
	LDA $E180,X
	AND.w #$00FF
	CMP !fz_t6
	BNE .next
	LDA $E182,X
	BEQ .next
	LDA $E191,X
	AND.w #$0080
	BNE .next
	SEC
	RTS
.next
	TXA
	CLC
	ADC.w #$0200
	TAX
	CPX.w #$1800
	BCC .loop
	CLC
	RTS

; Per field frame (beast-challenge.js tick()).
fz_beast_tick:
	LDA $DC
	CMP.w #253
	BEQ +
	LDA.w #$FFFF
	STA !fzx_body
	BRA .lich
+	; the Beast's HP once per body: 65,535 fed, 48,000 ordinary
	JSR fz_can_act
	BCC .lich
	LDA.w #!FZ_SPECIES_BEAST
	JSR fz_find_boss
	BCC .lich
	CPX !fzx_body
	BEQ .lich
	STX !fzx_body
	JSR fz_beast_hp
.lich
	JSR fz_lich_tick
	; the fed Beast's eruptions
	LDA.l !fzp_beast
	AND.w #!FZX_FED|!FZX_WON
	CMP.w #!FZX_FED
	BEQ +
	RTS
+	LDX.w #$004E
	JSR fz_cf
	CMP.w #9
	BCC +
	LDA.w #!FZX_WON
	SEP #$20
	ORA.l !fzp_beast
	STA.l !fzp_beast
	REP #$20
	STZ !fzx_bon
	RTS
+	LDA $DC
	CMP.w #253
	BEQ +
	RTS
+	LDA.w #!FZ_SPECIES_BEAST
	JSR fz_find_boss
	BCS +
	SEP #$20
	STZ !fzx_bon
	REP #$20
	RTS
+	STX !fz_t4                        ; the Beast
	LDA.l !fzp_beast
	AND.w #!FZX_STARTED
	BNE .started
	JSR fz_can_act
	BCS +
	RTS
+	; started: the Beast at 65,535, Goku at 999, first eruption in 150
	LDA.w #!FZX_STARTED
	SEP #$20
	ORA.l !fzp_beast
	STA.l !fzp_beast
	REP #$20
	LDX !fz_t4
	LDA.w #65535
	STA $E184,X
	STA $E182,X
	LDA.w #999
	STA $E184
	STA $E182
	LDA.w #150
	STA !fzx_clock
	JSR fz_bind_say_challenge
	RTS
.started
	JSR fz_can_act
	BCS +
	RTS
+	SEP #$20
	LDA !fzx_grace
	BEQ +
	DEC !fzx_grace
+	LDA !fzx_bon
	REP #$20
	BNE .burst
	DEC !fzx_clock
	BEQ +
	BPL .out
+	; a new eruption lane at Goku's x (enraged under 32,768 HP)
	LDX !fz_t4
	LDA $E182,X
	CMP.w #32768
	BCC .enraged
	LDA.w #8
	STA !fzx_bwidth
	LDA.w #96
	STA !fzx_bwarn
	LDA.w #210
	STA !fzx_bdmg
	BRA .lane
.enraged
	LDA.w #10
	STA !fzx_bwidth
	LDA.w #78
	STA !fzx_bwarn
	LDA.w #250
	STA !fzx_bdmg
.lane
	LDA $E002
	STA !fzx_bx
	JSR fz_camera
	LDA !fz_cam_y
	CLC
	ADC.w #20
	STA !fzx_btop
	LDA !fz_cam_y
	CLC
	ADC.w #190
	STA !fzx_bbot
	STZ !fzx_bage
	SEP #$20
	LDA.b #$01
	STA !fzx_bon
	STZ !fzx_bhit
	REP #$20
	LDA.w #!FZ_SFX_CHARGED
	JSR fz_sfx
.out
	RTS
.burst
	INC !fzx_bage
	LDA !fzx_bage
	SEC
	SBC !fzx_bwarn
	STA !fz_t0                        ; age past the warning (signed)
	BNE +
	LDA.w #6
	JSR fz_pulse
	LDA.w #!FZ_SFX_BEAM
	JSR fz_sfx
+	LDA !fz_t0
	BMI .end
	CMP.w #30
	BCS .end
	LDA !fzx_bhit
	AND.w #$00FF
	BNE .end
	LDA !fzx_grace
	AND.w #$00FF
	BNE .end
	; |x - lane| < width + 5 and top <= y <= min(bottom, front)
	LDA $E002
	SEC
	SBC !fzx_bx
	BPL +
	EOR.w #$FFFF
	INC
+	STA !fz_t1
	LDA !fzx_bwidth
	CLC
	ADC.w #5
	CMP !fz_t1
	BEQ .end
	BCC .end
	LDA $E004
	CMP !fzx_btop
	BMI .end
	LDA !fz_t0
	ASL
	ASL
	ASL
	ASL
	CLC
	ADC !fzx_btop
	CMP !fzx_bbot
	BCC +
	LDA !fzx_bbot
+	CMP $E004
	BMI .end
	; struck: queue the eruption's damage on Goku
	SEP #$20
	LDA.b #$01
	STA !fzx_bhit
	REP #$20
	LDA $E1F1
	BNE .end
	LDA !fzx_bdmg
	STA !fzx_pending
	STA $E1F1
	LDA !fz_t4
	XBA
	LSR
	SEP #$20
	STA $E1F0                         ; the Beast's actor index
	STZ $E1EC
	REP #$20
.end
	LDA !fz_t0
	BMI .out2
	CMP.w #36
	BCC .out2
	SEP #$20
	STZ !fzx_bon
	REP #$20
	LDX !fz_t4
	LDA $E182,X
	CMP.w #32768
	LDA.w #135
	BCS +
	LDA.w #90
+	STA !fzx_clock
.out2
	RTS

; The Beast's maximum HP (once per body; wounds of older visits kept).
fz_beast_hp:
	LDA.l !fzp_beast
	AND.w #!FZX_FED
	BEQ +
	LDA.w #65535
	BRA ++
+	LDA.w #48000
++	STA !fz_t0                        ; maximum
	LDA $E184,X
	CMP !fz_t0
	BCS .out
	; hp = max(1, ceil(maximum * hp / oldMax)); oldMax 0 -> maximum
	STA !fz_t1                        ; old max
	LDA !fz_t0
	STA $E184,X
	LDA !fz_t1
	BEQ .full
	LDA $E182,X
	CMP !fz_t1
	BCS .full
	; fraction scaled: maximum * hp / oldMax (32-bit via the divider)
	JSR fz_scale_hp
	STA $E182,X
	RTS
.full
	LDA !fz_t0
	STA $E182,X
.out
	RTS

; A16 = ceil(!fz_t0 * hp / !fz_t1) for hp = $E182,X < !fz_t1 (long math).
fz_scale_hp:
	PHX
	LDA $E182,X
	STA !fz_t2
	; 32-bit product t0 * t2 by shifts
	STZ !fz_t3                        ; product low
	STZ !fz_t5                        ; product high
	LDA !fz_t2
	STA !fz_t6
	LDA !fz_t0
	STA !fz_t7
	LDY.w #16
.mul
	ASL !fz_t3
	ROL !fz_t5
	ASL !fz_t7
	BCC +
	LDA !fz_t3
	CLC
	ADC !fz_t6
	STA !fz_t3
	BCC +
	INC !fz_t5
+	DEY
	BNE .mul
	; divide (t5:t3) by t1, rounding up
	LDA !fz_t3
	CLC
	ADC !fz_t1
	STA !fz_t3
	BCC +
	INC !fz_t5
+	LDA !fz_t3
	SEC
	SBC.w #1
	STA !fz_t3
	BCS +
	DEC !fz_t5
+	LDA.w #0
	STA !fz_t6                        ; quotient
	LDY.w #32
.div
	ASL !fz_t3
	ROL !fz_t5
	ROL
	ASL !fz_t6
	CMP !fz_t1
	BCC +
	SBC !fz_t1
	INC !fz_t6
+	DEY
	BNE .div
	LDA !fz_t6
	BNE +
	INC
+	PLX
	RTS

; Frieza feeds Thanatos ki (beast-challenge.js, the lich branch).
fz_lich_tick:
	LDA !fzl_base
	CMP.w #$FFFF
	BEQ .find
	LDA $DC
	CMP !fzl_map
	BEQ .boosts
	JSR fz_lich_reset
.find
	JSR fz_can_act
	BCC .out
	LDX.w #$004E
	JSR fz_cf
	CMP.w #7
	BCS .out
	LDA.w #!FZ_SPECIES_LICH
	JSR fz_find_boss
	BCC .out
	; empowered: 48,000 HP (wounds kept), attack +48, +24 (cap 255)
	STX !fzl_base
	LDA $DC
	STA !fzl_map
	STZ !fzl_clock
	LDA.w #$FE20                      ; -480: the first boost may come at once
	STA !fzl_last
	LDA $E184,X
	SEC
	SBC $E182,X
	BCS +
	LDA.w #0
+	STA !fz_t0                        ; missing
	LDA.w #48000
	STA $E184,X
	SEC
	SBC !fz_t0
	BEQ +
	BCS ++
+	LDA.w #1
++	STA $E182,X
	LDA.w #48
	STA !fz_t0
	LDA.w #$0198
	JSR fz_actor_add_capped
	LDA.w #24
	STA !fz_t0
	LDA.w #$018B
	JSR fz_actor_add_capped
.out
	RTS
.boosts
	; two limited interventions while the trial runs
	JSR fz_stage
	CMP.w #!FZST_TRIAL
	BNE .out
	JSR fz_can_act
	BCC .out
	INC !fzl_clock
	SEP #$20
	LDA !fzl_boost
	CMP.b #$FF
	BEQ +
	INC A
	STA !fzl_boost
	CMP.b #120
	BCC +
	LDA.b #$FF
	STA !fzl_boost
+	REP #$20
	LDX !fzl_base
	LDA $E182,X
	BEQ .out
	LDA $E191,X
	AND.w #$0080
	BNE .out
	LDA !fzl_buffs
	AND.w #$00FF
	CMP.w #2
	BCS .out
	; hp < max * (buffs ? .35 : .7)
	LDA $E184,X
	STA !fz_t1
	LDA !fzl_buffs
	AND.w #$00FF
	BEQ .seventy
	LDA !fz_t1                        ; max * 0.35 ~ max * 90 / 256
	JSR fz_mul_frac90
	BRA .cmp
.seventy
	LDA !fz_t1
	JSR fz_mul_frac90
	ASL
.cmp
	STA !fz_t2
	LDA $E182,X
	CMP !fz_t2
	BCS .out
	LDA !fzl_clock
	SEC
	SBC !fzl_last
	CMP.w #480
	BCC .out
	; the boost: +10% HP (capped at max), attack +16
	SEP #$20
	INC !fzl_buffs
	STZ !fzl_boost
	REP #$20
	LDA !fzl_clock
	STA !fzl_last
	LDA !fz_t1
	JSR fz_div10
	CLC
	ADC $E182,X
	BCS +
	CMP !fz_t1
	BCC ++
+	LDA !fz_t1
++	STA $E182,X
	LDA.w #16
	STA !fz_t0
	LDA.w #$0198
	JSR fz_actor_add_capped
	LDA.w #!FZ_SFX_POWER_BURST
	JSR fz_sfx
	LDA !fzl_buffs
	AND.w #$00FF
	JSR fz_bind_say_lich
	RTS

; byte $E000+X+A16 += !fz_t0, capped at 255.
fz_actor_add_capped:
	STA !fz_t3
	TXA
	CLC
	ADC !fz_t3
	TAY
	LDA $E000,Y
	AND.w #$00FF
	CLC
	ADC !fz_t0
	CMP.w #256
	BCC +
	LDA.w #255
+	SEP #$20
	STA $E000,Y
	REP #$20
	RTS

; A16 * 90 / 256 (~0.35), A16 / 10.
fz_mul_frac90:
	STA !fz_t5
	LSR
	LSR
	STA !fz_t6                        ; a/4 = 64/256
	LDA !fz_t5
	LSR
	LSR
	LSR
	LSR
	CLC
	ADC !fz_t6                        ; + a/16 = 80/256
	STA !fz_t6
	LDA !fz_t5
	LSR
	LSR
	LSR
	LSR
	LSR
	CLC
	ADC !fz_t6                        ; + a/32 = 88/256
	RTS
fz_div10:
	LDX.w #10
	JMP fz_divx

; COMBAT damage hook (combat's bind.asm !COMBAT_HOOK_DAMAGE): Goku's damage
; to native actor X. The Beast takes half (an eighth when fed), the
; empowered Lich a quarter (beast-challenge.js damage()). A16 = damage.
frieza_combat_damage:
	STA !fz_t0
	JSR fz_on
	BCC .same
	LDA $E180,X
	AND.w #$00FF
	CMP.w #!FZ_SPECIES_BEAST
	BNE .lich
	LDA $DC
	CMP.w #253
	BNE .same
	LDA !fz_t0
	LSR
	STA !fz_t0
	LDA.l !fzp_beast
	AND.w #!FZX_FED
	BEQ .min1
	LSR !fz_t0
	LSR !fz_t0
	BRA .min1
.lich
	CMP.w #!FZ_SPECIES_LICH
	BNE .same
	CPX !fzl_base
	BNE .same
	LDA $DC
	CMP !fzl_map
	BNE .same
	LSR !fz_t0
	LSR !fz_t0
.min1
	LDA !fz_t0
	BNE .same
	INC !fz_t0
.same
	LDA !fz_t0
	RTL
