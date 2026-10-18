; Beam clashes (engine/vegeta-clash.js and joch-trial.js counterBeam,
; updateClash, clashInput). A real counter-shot starts the clash: Goku's
; live Kamehameha, opposite and overlapping Vegeta's beam; only one fired
; as Super Saiyan can lock Final Flash. Pressure and the shown position are
; kept exactly in units of 1/500000 (every browser constant is an integer
; there: .05 = 25000, .002 = 1000, age/500000 = age, ...), 32-bit.
;
; Record (!vs_clash, SRAM):
!vc_phase   #= !vs_clash+$00   ; byte: 0 lock, 1 focus, 2 struggle, 3 release
!vc_result  #= !vs_clash+$01   ; byte: 0 none, 1 win, 2 lose
!vc_age     #= !vs_clash+$02   ; word
!vc_total   #= !vs_clash+$04   ; word
!vc_press   #= !vs_clash+$06   ; dword: pressure (0..500000)
!vc_shown   #= !vs_clash+$0A   ; dword: shown
!vc_buttons #= !vs_clash+$0E   ; word: last held mash buttons
!vc_last    #= !vs_clash+$10   ; word (signed): age of the last counted tap
!vc_taps    #= !vs_clash+$12   ; word
!vc_tier    #= !vs_clash+$14   ; byte
!vc_super   #= !vs_clash+$15   ; byte: Goku's beam was fired as Super Saiyan
!vc_hx      #= !vs_clash+$16   ; word: Goku held here
!vc_hy      #= !vs_clash+$18
!vc_bx      #= !vs_clash+$1A   ; word: Vegeta held here
!vc_by      #= !vs_clash+$1C
!vc_dx      #= !vs_clash+$1E   ; word (signed): Goku's beam direction
!vc_dy      #= !vs_clash+$20
!vc_fx      #= !vs_clash+$22   ; word: Goku's palms (from)
!vc_fy      #= !vs_clash+$24
!vc_tx      #= !vs_clash+$26   ; word: Vegeta's palms (to)
!vc_ty      #= !vs_clash+$28
!vc_end     #= !vs_clash+$2A

!VCQ_NONE = 0
!VCQ_FOCUS = 1
!VCQ_STRUGGLE = 2
!VCQ_SURGE = 3
!VCQ_WIN = 4
!VCQ_LOSE = 5
!VCQ_DETONATE = 6
!VCQ_DONE = 7
!VC_LOCK = 0
!VC_FOCUS = 1
!VC_STRUGGLE = 2
!VC_RELEASE = 3
!VC_S = 500000                 ; scale of pressure/shown
!VC_IMPACT = 18                ; trainingClashTiming.impact
!VC_RELEASE_END = 18+132+18    ; trainingClashTiming.release (beamDetonationFrames 132)

vg_clash_clear:
	SEP #$20
	STZ !vg_clash_on
	REP #$20
	RTS

; 32-bit helpers on SRAM dwords: X = offset of the dword within !vs_clash.
; add a signed 32-bit constant held in !vg_t2 (low) / !vg_t3 (high).
vc_add:
	LDA.l !vs_clash,X
	CLC
	ADC !vg_t2
	STA.l !vs_clash,X
	LDA.l !vs_clash+2,X
	ADC !vg_t3
	STA.l !vs_clash+2,X
	RTS
; clamp the dword at X to [0, 500000]
vc_clamp:
	LDA.l !vs_clash+2,X
	BPL +
	LDA.w #0
	STA.l !vs_clash,X
	STA.l !vs_clash+2,X
	RTS
+	CMP.w #!VC_S>>16
	BCC .ok
	BNE .max
	LDA.l !vs_clash,X
	CMP.w #!VC_S&$FFFF
	BCC .ok
.max
	LDA.w #!VC_S&$FFFF
	STA.l !vs_clash,X
	LDA.w #!VC_S>>16
	STA.l !vs_clash+2,X
.ok
	RTS
; compare the dword at X with the constant in !vg_t2/!vg_t3 (unsigned):
; C set when dword >= constant.
vc_ge:
	LDA.l !vs_clash+2,X
	CMP !vg_t3
	BNE +
	LDA.l !vs_clash,X
	CMP !vg_t2
+	RTS
macro vc_const(v)
	LDA.w #(<v>)&$FFFF
	STA !vg_t2
	LDA.w #((<v>)>>16)&$FFFF
	STA !vg_t3
endmacro
; negative constant -v (0 < v < 65536)
macro vc_neg(v)
	LDA.w #($10000-(<v>))&$FFFF
	STA !vg_t2
	LDA.w #$FFFF
	STA !vg_t3
endmacro

; ---------------------------------------------------------------------------
; counterBeam(): C set when a clash started.
vg_counter_beam:
	LDA.l !vs_beam_on
	AND.w #$00FF
	BNE +
	CLC
	RTS
+	JSR vb_goku_beam              ; C set: !vs_gb_* filled
	BCS +
	RTS
+	; Final Flash locks only with a beam fired as Super Saiyan
	LDA !vg_tier
	AND.w #$0001
	BEQ +
	LDA.l !vs_gb_super
	AND.w #$00FF
	BNE +
	CLC
	RTS
+	JSR vg_opposing
	BCS +
	RTS
+	; createTrainingClash(beam, enemy, hero, {x, y}, tier)
	LDX.w #!vc_end-!vs_clash-2
	LDA.w #$0000
-	STA.l !vs_clash,X
	DEX
	DEX
	BPL -
	%vc_const(!VC_S/2)
	LDA !vg_t2
	STA.l !vc_press
	STA.l !vc_shown
	LDA !vg_t3
	STA.l !vc_press+2
	STA.l !vc_shown+2
	LDA.w #-6
	STA.l !vc_last
	SEP #$20
	LDA !vg_tier
	STA.l !vc_tier
	LDA.l !vs_gb_super
	STA.l !vc_super
	REP #$20
	LDA.l $7EE002
	STA.l !vc_hx
	LDA.l $7EE004
	STA.l !vc_hy
	LDA !vg_x
	STA.l !vc_bx
	LDA !vg_y
	STA.l !vc_by
	LDA.l !vs_gb_dx
	STA.l !vc_dx
	LDA.l !vs_gb_dy
	STA.l !vc_dy
	LDA.l !vs_gb_x
	STA.l !vc_fx
	LDA.l !vs_gb_y
	STA.l !vc_fy
	LDA.l !vs_beam_x
	STA.l !vc_tx
	LDA.l !vs_beam_y
	STA.l !vc_ty
	SEP #$20
	LDA.b #$01
	STA !vg_clash_on
	LDA.l !vs_clashes
	INC
	STA.l !vs_clashes
	REP #$20
	JSR vg_clear_shots
	JSR vg_clear_rocks
	LDA.w #120
	STA !vg_grace
	JSR vb_cancel_combat
	LDA.w #!VSFX_POWER_BURST
	JSR vb_sfx
	LDA.w #16
	JSR vb_pulse
	LDA.w #!VMSG_PUSH_BACK
	JSR vb_say
	SEC
	RTS

; opposingBeams(player, geometry, enemy): exactly opposite directions,
; 16 < along <= both lengths, across <= min(20, both half widths).
; Player = Goku's beam (!vs_gb_*), enemy = Vegeta's (!vs_beam_*, !vg_act_d*).
vg_opposing:
	JSR vg_act_dir
	; player.d . enemy.d must be -1
	LDA.l !vs_gb_dx
	CLC
	ADC.l !vs_s0
	BEQ +
	JMP .no
+
	LDA.l !vs_gb_dy
	CLC
	ADC.l !vs_s1
	BEQ +
	JMP .no
+
	; dx = enemy.x - player.x, dy = enemy.y - player.y
	LDA.l !vs_beam_x
	SEC
	SBC.l !vs_gb_x
	STA.l !vs_s4
	LDA.l !vs_beam_y
	SEC
	SBC.l !vs_gb_y
	STA.l !vs_s5
	LDA.l !vs_gb_dx
	BEQ .vert
	; horizontal: along = dx*pdx, across = |dy|
	BMI +
	LDA.l !vs_s4
	BRA ++
+	LDA.l !vs_s4
	EOR.w #$FFFF
	INC
++	STA.l !vs_s6
	LDA.l !vs_s5
	JSR vg_abs
	STA.l !vs_s7
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
	LDA.l !vs_s6
	BMI .no
	CMP.w #17
	BCC .no                       ; along > 16
	LDA.l !vs_gb_len
	CLC
	ADC.l !vs_beam_len
	CMP.l !vs_s6
	BCC .no                       ; along <= sum
	; across * 256 <= min(20*256, half(player) + half(enemy)) (8.8)
	LDA.l !vs_gb_half
	CLC
	ADC.l !vs_beam_half
	BCS .cap
	CMP.w #20*256
	BCC +
.cap
	LDA.w #20*256
+	STA !vg_t3
	LDA.l !vs_s7
	CMP.w #21
	BCS .no
	XBA
	CMP !vg_t3
	BEQ .yes
	BCS .no
.yes
	SEC
	RTS
.no
	CLC
	RTS

; ---------------------------------------------------------------------------
; updateClash(): freeze both fighters, advance, react to the cues.
vg_update_clash:
	LDA.l !vc_hx
	STA.l $7EE002
	LDA.l !vc_hy
	STA.l $7EE004
	LDA.l !vc_bx
	STA !vg_x
	LDA.l !vc_by
	STA !vg_y
	JSR vg_clash_tick             ; A = cue
	CMP.w #!VCQ_FOCUS
	BNE +
	LDA.w #!VSFX_CHARGED
	JSR vb_sfx
	LDA.w #8
	JSR vb_pulse
	BRA .cued
+	CMP.w #!VCQ_STRUGGLE
	BNE +
	LDA.w #!VSFX_VEGETA_BEAM
	JSR vb_sfx
	LDA.w #!VSFX_VEGETA_KAKAROT
	JSR vb_sfx
	BRA .cued
+	CMP.w #!VCQ_SURGE
	BNE +
	LDA.w #!VSFX_POWER_BURST
	JSR vb_sfx
	LDA.w #5
	JSR vb_pulse
	BRA .cued
+	CMP.w #!VCQ_WIN
	BEQ .result
	CMP.w #!VCQ_LOSE
	BNE +
.result
	LDA.w #6
	JSR vb_pulse
	BRA .cued
+	CMP.w #!VCQ_DETONATE
	BNE +
	LDA.w #!VSFX_FORTRESS_BREAK
	JSR vb_sfx
	LDA.w #!VSFX_FRIEZA_IMPACT
	JSR vb_sfx
	LDA.w #24
	JSR vb_pulse
	JSR vb_fx_detonate
	BRA .cued
+	CMP.w #!VCQ_DONE
	BNE .cued
	JMP vg_clash_done
.cued
	; the second crack of the release
	LDA.l !vc_phase
	AND.w #$00FF
	CMP.w #!VC_RELEASE
	BNE +
	LDA.l !vc_age
	CMP.w #!VC_IMPACT+28
	BNE +
	LDA.w #!VSFX_FORTRESS_BREAK
	JSR vb_sfx
	LDA.w #12
	JSR vb_pulse
+	JMP vg_clash_mash

vg_clash_done:
	SEP #$20
	STZ !vg_clash_on
	REP #$20
	LDA.w #140
	JSR vg_recover
	JSR vb_cancel_combat
	JSR vb_clash_pose_off
	LDA.l !vc_result
	AND.w #$00FF
	CMP.w #1
	BNE .lost
	; win: a third of his maximum HP (34% after his damage scale)
	LDA.w #90
	STA !vg_grace
	LDA.w #19782                  ; round(32000 * .34 / .55)
	LDX !vg_tier-1
	CPX.w #$0100
	BCC +
	LDA.w #63750                  ; round(60000 * .34 / .32)
+	STA.l !vs_s0
	LDA.w #0
	STA.l !vs_s1
	JMP vg_hit
.lost
	STZ !vg_grace
	LDA.w #230
	LDX !vg_tier-1
	CPX.w #$0100
	BCC +
	LDA.w #320
+	JMP vg_receive


; tickTrainingClash(c): A = cue.
vg_clash_tick:
	LDA.l !vc_age
	INC
	STA.l !vc_age
	LDA.l !vc_total
	INC
	STA.l !vc_total
	LDA.l !vc_phase
	AND.w #$00FF
	CMP.w #!VC_LOCK
	BNE .notLock
	LDA.l !vc_age
	CMP.w #36
	BCC .none
	SEP #$20
	LDA.b #!VC_FOCUS
	STA.l !vc_phase
	REP #$20
	LDA.w #0
	STA.l !vc_age
	LDA.w #!VCQ_FOCUS
	RTS
.notLock
	CMP.w #!VC_FOCUS
	BNE .notFocus
	LDA.l !vc_age
	CMP.w #48
	BCC .none
	SEP #$20
	LDA.b #!VC_STRUGGLE
	STA.l !vc_phase
	REP #$20
	LDA.w #0
	STA.l !vc_age
	LDA.w #-6
	STA.l !vc_last
	LDA.w #!VCQ_STRUGGLE
	RTS
.none
	LDA.w #!VCQ_NONE
	RTS
.notFocus
	CMP.w #!VC_STRUGGLE
	BEQ .struggle
	JMP .release
.struggle
	; surge at 100, 220, 340
	LDA.w #$0000
	STA.l !vs_s3
	LDA.l !vc_age
	CMP.w #100
	BEQ +
	CMP.w #220
	BEQ +
	CMP.w #340
	BNE ++
+	LDA.w #1
	STA.l !vs_s3
++	; pressure -= (tier ? .0025 : .002) + min(.001, age/500000) + (surge ? .10 : 0)
	LDA.w #1000
	LDX !vg_tier-1
	CPX.w #$0100
	BCC +
	LDA.w #1250
+	STA.l !vs_s4
	LDA.l !vc_age
	CMP.w #500
	BCC +
	LDA.w #500
+	CLC
	ADC.l !vs_s4
	STA.l !vs_s4
	LDA.l !vs_s3
	BEQ +
	LDA.l !vs_s4
	CLC
	ADC.w #50000
	STA.l !vs_s4
+	LDA.l !vs_s4
	EOR.w #$FFFF
	INC
	STA !vg_t2
	LDA.w #$FFFF
	STA !vg_t3                    ; -(drain), 32-bit
	LDA !vg_t2
	BNE +
	STZ !vg_t3
+	LDX.w #!vc_press-!vs_clash
	JSR vc_add
	JSR vc_clamp
	; target = age < 240 ? min(.87, pressure) : pressure
	LDA.l !vc_press
	STA.l !vs_s5
	LDA.l !vc_press+2
	STA.l !vs_s6
	LDA.l !vc_age
	CMP.w #240
	BCS .target
	%vc_const(435000)
	LDX.w #!vc_press-!vs_clash
	JSR vc_ge
	BCC .target
	LDA !vg_t2
	STA.l !vs_s5
	LDA !vg_t3
	STA.l !vs_s6
.target
	; step = clamp(target - shown, -.012, .012)
	LDA.l !vs_s5
	SEC
	SBC.l !vc_shown
	STA !vg_t2
	LDA.l !vs_s6
	SBC.l !vc_shown+2
	STA !vg_t3
	BMI .neg
	BNE .capPos
	LDA !vg_t2
	CMP.w #6000
	BCC .step
.capPos
	%vc_const(6000)
	BRA .step
.neg
	CMP.w #$FFFF
	BNE .capNeg
	LDA !vg_t2
	CMP.w #$10000-6000
	BCS .step
.capNeg
	%vc_neg(6000)
.step
	LDX.w #!vc_shown-!vs_clash
	JSR vc_add
	JSR vc_clamp
	; won = age >= 240 && shown >= .96 ; lost = shown <= .04 ; timeout = age >= 660
	LDA.w #0
	STA.l !vs_s7
	LDA.l !vc_age
	CMP.w #240
	BCC .notWon
	%vc_const(480000)
	LDX.w #!vc_shown-!vs_clash
	JSR vc_ge
	BCC .notWon
	LDA.w #1
	STA.l !vs_s7                  ; won
	BRA .finished
.notWon
	%vc_const(20001)
	LDX.w #!vc_shown-!vs_clash
	JSR vc_ge
	BCS .notLost
	LDA.w #2
	STA.l !vs_s7                  ; lost
	BRA .finished
.notLost
	LDA.l !vc_age
	CMP.w #660
	BCC .going
	; timeout: win when shown >= .5
	%vc_const(!VC_S/2)
	LDX.w #!vc_shown-!vs_clash
	JSR vc_ge
	LDA.w #2
	BCC +
	LDA.w #1
+	STA.l !vs_s7
.finished
	SEP #$20
	LDA.l !vs_s7
	STA.l !vc_result
	LDA.b #!VC_RELEASE
	STA.l !vc_phase
	REP #$20
	LDA.w #0
	STA.l !vc_age
	LDA.l !vs_s7
	CMP.w #1
	BEQ +
	LDA.w #!VCQ_LOSE
	RTS
+	LDA.w #!VCQ_WIN
	RTS
.going
	LDA.l !vs_s3
	BEQ +
	LDA.w #!VCQ_SURGE
	RTS
+	LDA.w #!VCQ_NONE
	RTS
.release
	; shown += win ? .025 : -.025
	LDA.l !vc_result
	AND.w #$00FF
	CMP.w #1
	BNE +
	%vc_const(12500)
	BRA ++
+	%vc_neg(12500)
++	LDX.w #!vc_shown-!vs_clash
	JSR vc_add
	JSR vc_clamp
	LDA.l !vc_age
	CMP.w #!VC_IMPACT
	BNE .notImpact
	LDA.l !vc_result
	AND.w #$00FF
	CMP.w #1
	BNE +
	%vc_const(!VC_S)
	BRA ++
+	%vc_const(0)
++	LDA !vg_t2
	STA.l !vc_shown
	LDA !vg_t3
	STA.l !vc_shown+2
	LDA.w #!VCQ_DETONATE
	RTS
.notImpact
	CMP.w #!VC_RELEASE_END
	BCC +
	LDA.w #!VCQ_DONE
	RTS
+	LDA.w #!VCQ_NONE
	RTS

; clashInput(): Goku holds his beam pose and only the mash counts. Runs
; after the tick, as the browser's beforeFrame does (tick, then clashInput).
vg_clash_mash:
	SEP #$20
	LDA !vg_clash_on
	REP #$20
	BNE +
	RTS
+	JSR vb_clash_pose_on
	; mash only while no event/menu owns the frame
	SEP #$20
	LDA $D0
	BNE .done8
	LDA $EC
	AND.b #$FE
	BNE .done8
	REP #$20
	; held = B or Y (the attack and ki buttons)
	LDA.w !core_pad&$FFFF
	AND.w #$C000
	STA !vg_t2
	LDA.l !vc_buttons
	EOR.w #$FFFF
	AND !vg_t2
	STA !vg_t3                    ; fresh
	LDA !vg_t2
	STA.l !vc_buttons
	LDA.l !vc_phase
	AND.w #$00FF
	CMP.w #!VC_STRUGGLE
	BNE .done
	LDA !vg_t3
	BEQ .done
	LDA.l !vc_age
	SEC
	SBC.l !vc_last
	CMP.w #5
	BMI .done
	LDA.l !vc_age
	STA.l !vc_last
	LDA.l !vc_taps
	INC
	STA.l !vc_taps
	%vc_const(25000)
	LDX.w #!vc_press-!vs_clash
	JSR vc_add
	JSR vc_clamp
	LDA.w #!VSFX_HIT
	JSR vb_sfx
	LDA.w #2
	JMP vb_pulse
.done8
	REP #$20
.done
	RTS

; trainingClashPoint(c): the ball, from + (to - from) * shown (rounded).
; Out: !vs_s0 = x, !vs_s1 = y.
vg_clash_point:
	LDA.l !vc_tx
	SEC
	SBC.l !vc_fx
	LDX.w #!vc_fx-!vs_clash
	JSR vc_lerp
	STA.l !vs_s0
	LDA.l !vc_ty
	SEC
	SBC.l !vc_fy
	LDX.w #!vc_fy-!vs_clash
	JSR vc_lerp
	STA.l !vs_s1
	RTS
; A = signed delta, X = offset of the base word: base + round(delta * shown / S)
vc_lerp:
	PHX
	STA.l !vs_s2
	JSR vg_abs
	STA.l !vs_s3                  ; |delta| (<= 1024)
	; |delta| * shown: shown = sh:sl (<= 500000 < 2^19)
	LDA.l !vc_shown
	TAX
	LDA.l !vs_s3
	JSR vg_mul16                  ; |d| * sl
	LDA !vm_a0
	STA.l !vs_s4
	LDA !vm_a1
	STA.l !vs_s5
	LDA.l !vc_shown+2
	TAX
	LDA.l !vs_s3
	JSR vg_mul16                  ; |d| * sh (sh <= 7): add << 16
	LDA !vm_a0
	CLC
	ADC.l !vs_s5
	STA !vm_a1
	LDA.l !vs_s4
	STA !vm_a0
	; + S/2 then / S: divide by 500000 = 2^5 * 15625
	LDA !vm_a0
	CLC
	ADC.w #(!VC_S/2)&$FFFF
	STA !vm_a0
	LDA !vm_a1
	ADC.w #(!VC_S/2)>>16
	STA !vm_a1
	; >> 5
	LDX.w #5
-	LSR !vm_a1
	ROR !vm_a0
	DEX
	BNE -
	LDX.w #15625
	JSR vg_div32
	STA !vg_t3
	LDA.l !vs_s2
	BPL +
	LDA !vg_t3
	EOR.w #$FFFF
	INC
	STA !vg_t3
+	PLX
	LDA.l !vs_clash,X
	CLC
	ADC !vg_t3
	RTS
