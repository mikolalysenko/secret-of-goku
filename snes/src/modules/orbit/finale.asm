; The beam struggle and the victory (engine/frieza-finale.js beginClash /
; tickClash / tapClash / clashCamera, frieza.js win() and its 'won' tick,
; boss-victory.js cues), transcribed clock for clock. DB = $32, M16/X16.
;
; The browser's pressure and shown values are doubles; here they are Q31
; (1.0 = $80000000) in two words, every constant the browser's literal
; rounded once (snes/gen/orbit-finale.mjs) and the per-frame decay
; tabulated per age. Values stay in [0, 1], so a high word >= $C000 can
; only be a negative result. The eases are 32-bit fractions, so
; Math.round(a + (b - a) * t) comes out as the browser's.

; ---------------------------------------------------------------------------
; frieza.js tick: 6,000 HP and no wave out -> beginClash, b.evade = null,
; cancelCombat, 'charged'. The same step goes on into tickClash.
finale_begin:
	LDA.w #!FN_GATHER
	JSR finale_phase
	JSR finale_reset_pressure
	LDA.w #$FFFB                   ; lastTap ?? -5
	STA.w !fn_last
	STZ.w !fn_bage
	STZ.w !fn_ret
	STZ.w !fn_shout
	; from: the hero, Frieza, the camera
	LDA.w !f_hx : STA.w !fn_hx0
	LDA.w !f_hy : STA.w !fn_hy0
	LDA.w !b_x : STA.w !fn_bx0
	LDA.w !b_y : STA.w !fn_by0
	LDA.w !cam_x : STA.w !fn_cx0
	LDA.w !cam_y : STA.w !fn_cy0
	LDA.w !cam_r : STA.w !fn_cr0
	; o.shots, o.ricochets, o.charge, o.beam; b.shots, warning, dash,
	; windup, evade
	LDX.w #(!FS_N-1)*8
-	LDA.w #$00FF : STA.w !FS_SHOTS+6,X
	TXA : SEC : SBC.w #$0008 : TAX
	BPL -
	LDX.w #(!RIC_N-1)*8
-	LDA.w #$00FF : STA.w !FS_RIC+6,X
	TXA : SEC : SBC.w #$0008 : TAX
	BPL -
	STZ.w !f_charge
	STZ.w !fb_on
	JSR fight_clear_boss_shots
	STZ.w !w_kind
	STZ.w !b_dash
	STZ.w !b_windup
	STZ.w !b_evn
	JSL audio_cancel
	LDA.w #!AUDIO_SFX_CHARGED
	JSL audio_sfx
	RTS

; A16 = the new phase, at age 0.
finale_phase:
	STA.w !fn_phase
	STZ.w !fn_age
	RTS

; pressure = shown = .43, taps = 0.
finale_reset_pressure:
	LDA.w #(!FNQ_P0)&$FFFF : STA.w !fn_p : STA.w !fn_s
	LDA.w #(!FNQ_P0)>>16   : STA.w !fn_p+2 : STA.w !fn_s+2
	STZ.w !fn_taps
	RTS

; ---------------------------------------------------------------------------
; Math.round(a + (b - a) * t): A16 = a, X16 = b (signed), t in !fn_t
; (32-bit fraction; $FFFFFFFF = 1). Exact for |b - a| < 1024 (the product
; of the browser's double t and of its 32-bit rounding differ by less than
; 2^-22).
finale_mix:
	STA.w !fn_m+0                  ; a
	STX.w !fn_m+2                  ; b
	LDA.w !fn_t
	AND.w !fn_t+2
	CMP.w #$FFFF
	BNE +
	TXA                            ; t = 1: exactly b
	RTS
+	TXA
	SEC : SBC.w !fn_m+0
	STA.w !fn_m+4                  ; d = b - a
	BPL +
	EOR.w #$FFFF : INC
+	STA.w !fn_m+6                  ; |d|
	JSR finale_mul_dt              ; fn_q: |d| * t (48 bits)
	LDA.w !fn_m+4
	BMI .neg
	; a + I + (F >= .5)
	LDA.w !fn_q+2                  ; fraction, high word
	ASL                            ; carry = F >= .5
	LDA.w !fn_q+4                  ; integer part
	ADC.w !fn_m+0
	RTS
.neg
	; a - I - (F > .5)
	LDA.w !fn_q+2
	CMP.w #$8000
	BCC .down
	BNE .up
	LDA.w !fn_q
	BEQ .down
.up
	LDA.w !fn_m+0
	SEC : SBC.w !fn_q+4
	DEC
	RTS
.down
	LDA.w !fn_m+0
	SEC : SBC.w !fn_q+4
	RTS

; fn_q (6 bytes, a guard byte after) = fn_m+6 (|d| < 1024) * fn_t (32
; bits): the eight byte products of the 8x8 multiplier, carries carried.
finale_mul_dt:
	STZ.w !fn_q
	STZ.w !fn_q+2
	STZ.w !fn_q+4
	STZ.w !fn_q+6
	LDY.w #$0000                   ; byte of t
.byte
	SEP #$20
	LDA.w !fn_t,Y : STA.w $4202
	LDA.w !fn_m+6 : STA.w $4203    ; |d| low byte
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	TYX
	JSR .add
	SEP #$20
	LDA.w !fn_m+7 : STA.w $4203    ; |d| high byte (same multiplicand)
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	TYX
	INX
	JSR .add
	INY
	CPY.w #4
	BCC .byte
	RTS
; A16 added at fn_q byte X, the carry rippled up
.add
	CLC
	ADC.w !fn_q,X
	STA.w !fn_q,X
	BCC .r
	INX : INX
-	SEP #$20
	INC.w !fn_q,X
	REP #$20
	BNE .r
	INX
	BRA -
.r
	RTS

; !fn_t = the dword at table A16 (an offset in bank !DATA_ORBIT) + 4 * X16.
finale_ease:
	STA.w !fn_m+14
	TXA
	ASL : ASL
	CLC : ADC.w !fn_m+14
	TAX
	LDA.l !DATA_ORBIT&$FF0000,X
	STA.w !fn_t
	LDA.l (!DATA_ORBIT&$FF0000)+2,X
	STA.w !fn_t+2
	RTS

; ---------------------------------------------------------------------------
; frieza-finale.js clashCamera into cam_x/y/r (the globe and the stars draw
; from them; the orbit camera's own x/y/r stay put during the clash).
finale_camera:
	LDA.w !fn_phase
	CMP.w #!FN_WIN
	BNE .notWin
	LDA.w !fn_age
	CMP.w #!FNT_V_DESCENT
	BCC .wide
	; the descent: from wide to (-15, 281, 230), eased over 240 frames
	; (the globe draws it from its own tables: globe_descent)
	LDX.w #$0001
	STX.w !g_desc
	SEC : SBC.w #!FNT_V_DESCENT
	CMP.w #!FNT_V_RETURN-!FNT_V_DESCENT
	BCC +
	LDA.w #!FNT_V_RETURN-!FNT_V_DESCENT
+	TAX
	LDA.w #orbit_fn_e240
	JSR finale_ease
	LDA.w #114 : LDX.w #$FFF1 : JSR finale_mix : STA.w !cam_x
	LDA.w #164 : LDX.w #281 : JSR finale_mix : STA.w !cam_y
	LDA.w #56 : LDX.w #230 : JSR finale_mix : STA.w !cam_r
	RTS
.notWin
	CMP.w #!FN_GATHER
	BNE .wide
	LDA.w !fn_age
	CMP.w #!FNT_GATHER
	BCS .wide
	TAX
	LDA.w #orbit_fn_e150
	JSR finale_ease
	LDA.w !fn_cx0 : LDX.w #114 : JSR finale_mix : STA.w !cam_x
	LDA.w !fn_cy0 : LDX.w #164 : JSR finale_mix : STA.w !cam_y
	LDA.w !fn_cr0 : LDX.w #56 : JSR finale_mix : STA.w !cam_r
	RTS
.wide
	LDA.w #114 : STA.w !cam_x
	LDA.w #164 : STA.w !cam_y
	LDA.w #56 : STA.w !cam_r
	RTS

; ---------------------------------------------------------------------------
; frieza-finale.js tickClash, one step; carry set on the winning frame
; (the caller runs win()).
finale_tick:
	INC.w !fn_age
	LDA.w !fn_phase
	CMP.w #!FN_GATHER
	BEQ .gather
	CMP.w #!FN_CHARGE
	BNE +
	JMP .charge
+	CMP.w #!FN_LAUNCH
	BNE +
	JMP .launch
+	CMP.w #!FN_STRUGGLE
	BNE +
	JMP finale_struggle
+	CMP.w #!FN_RECOIL
	BNE .out
	LDA.w !fn_age
	CMP.w #!FNT_RECOIL
	BCC .out
	LDA.w #!FN_CHARGE
	JSR finale_phase
	JSR finale_reset_pressure
.out
	CLC
	RTS
.gather
	; t = ease(age / 110): the fighters slide to their marks
	LDA.w !fn_age
	CMP.w #110
	BCC +
	LDA.w #110
+	TAX
	LDA.w #orbit_fn_e110
	JSR finale_ease
	LDA.w !fn_hx0 : LDX.w #28 : JSR finale_mix : STA.w !f_hx
	LDA.w !fn_hy0 : LDX.w #136 : JSR finale_mix : STA.w !f_hy
	LDA.w !fn_bx0 : LDX.w #204 : JSR finale_mix : STA.w !b_x
	LDA.w !fn_by0 : LDX.w #48 : JSR finale_mix : STA.w !b_y
	LDA.w !fn_age
	CMP.w #40
	BNE +
	LDA.w #!AUDIO_SFX_CHARGED
	JSL audio_sfx
+	LDA.w !fn_age
	CMP.w #!FNT_GATHER
	BCC .out
	LDA.w #!FN_CHARGE
	JSR finale_phase
	CLC
	RTS
.charge
	; o.charge = min(45, floor(age / 2))
	LDA.w !fn_age
	LSR
	CMP.w #45
	BCC +
	LDA.w #45
+	STA.w !f_charge
	LDA.w !fn_age
	CMP.w #90
	BNE +
	LDA.w #!AUDIO_SFX_CHARGED
	JSL audio_sfx
+	LDA.w !fn_age
	CMP.w #!FNT_CHARGE
	BCC .out2
	LDA.w #!FN_LAUNCH
	JSR finale_phase
	JSR finale_reset_pressure
	LDA.w #$FFFB
	STA.w !fn_last
	STZ.w !f_charge
	LDA.w #!AUDIO_SFX_BEAM
	JSL audio_sfx
	LDA.w #$0001                   ; the release shout (audio frame)
	STA.w !fn_shout
.out2
	CLC
	RTS
.launch
	LDA.w !fn_age
	CMP.w #1
	BNE +
	LDA.w #!AUDIO_SFX_FRIEZA_LASER
	JSL audio_sfx
+	LDA.w !fn_age
	CMP.w #!FNT_CONTACT
	BNE +
	LDA.w #!AUDIO_SFX_POWER_BURST
	JSL audio_sfx
	LDA.w #14
	STA.w !f_shake
+	LDA.w !fn_age
	CMP.w #!FNT_LAUNCH
	BCC .out2
	LDA.w #!FN_STRUGGLE
	JSR finale_phase
	CLC
	RTS

; The tug of war: Frieza's three surges, the rising decay, the shown value
; chasing the pressure, the win after 660 frames, the recoil below .04.
finale_struggle:
	JSR finale_surge               ; A = index + 1 (0 none), X = its age
	BEQ .decay
	CPX.w #$0000
	BNE .decay
	DEC
	STA.w !fn_m+0                  ; surge index
	ASL : ASL
	TAX
	LDA.w !fn_p
	SEC : SBC.l orbit_fn_loss,X
	STA.w !fn_p
	LDA.w !fn_p+2
	SBC.l orbit_fn_loss+2,X
	STA.w !fn_p+2
	CMP.w #$C000
	BCC +
	STZ.w !fn_p
	STZ.w !fn_p+2
+	LDA.w #!AUDIO_SFX_FRIEZA_BEAM
	JSL audio_sfx
	LDA.w !fn_m+0
	ASL
	CLC : ADC.w #8                 ; shake(8 + index * 2)
	STA.w !f_shake
.decay
	; pressure = max(0, pressure - decay[min(age, 720)])
	LDA.w !fn_age
	CMP.w #720
	BCC +
	LDA.w #720
+	ASL : ASL
	TAX
	LDA.w !fn_p
	SEC : SBC.l orbit_fn_decay,X
	STA.w !fn_p
	LDA.w !fn_p+2
	SBC.l orbit_fn_decay+2,X
	STA.w !fn_p+2
	CMP.w #$C000
	BCC +
	STZ.w !fn_p
	STZ.w !fn_p+2
+	; target = age < 660 ? min(.92, pressure) : pressure
	LDA.w !fn_p : STA.w !fn_m+0
	LDA.w !fn_p+2 : STA.w !fn_m+2
	LDA.w !fn_age
	CMP.w #!FNT_STRUGGLE
	BCS .target
	LDA.w !fn_m+2
	CMP.w #(!FNQ_CAP)>>16
	BCC .target
	BNE .cap
	LDA.w !fn_m+0
	CMP.w #(!FNQ_CAP)&$FFFF
	BCC .target
.cap
	LDA.w #(!FNQ_CAP)&$FFFF : STA.w !fn_m+0
	LDA.w #(!FNQ_CAP)>>16 : STA.w !fn_m+2
.target
	; d = target - shown, clamped to [-.006, .004]
	LDA.w !fn_m+0 : SEC : SBC.w !fn_s : STA.w !fn_m+4
	LDA.w !fn_m+2 : SBC.w !fn_s+2 : STA.w !fn_m+6
	BMI .down
	CMP.w #(!FNQ_UP)>>16
	BCC .apply
	BNE .upCap
	LDA.w !fn_m+4
	CMP.w #(!FNQ_UP)&$FFFF
	BCC .apply
.upCap
	LDA.w #(!FNQ_UP)&$FFFF : STA.w !fn_m+4
	LDA.w #(!FNQ_UP)>>16 : STA.w !fn_m+6
	BRA .apply
.down
	; within when d + .006 >= 0
	LDA.w !fn_m+4
	CLC : ADC.w #(!FNQ_DOWN)&$FFFF
	LDA.w !fn_m+6
	ADC.w #(!FNQ_DOWN)>>16
	BPL .apply
	LDA.w #(-(!FNQ_DOWN))&$FFFF : STA.w !fn_m+4
	LDA.w #((-(!FNQ_DOWN))>>16)&$FFFF : STA.w !fn_m+6
.apply
	; shown = clamp(shown + d, 0, 1)
	LDA.w !fn_s : CLC : ADC.w !fn_m+4 : STA.w !fn_s
	LDA.w !fn_s+2 : ADC.w !fn_m+6 : STA.w !fn_s+2
	CMP.w #$C000
	BCC +
	STZ.w !fn_s                    ; below 0
	STZ.w !fn_s+2
	BRA .won
+	CMP.w #$8000
	BCC .won
	BNE .one
	LDA.w !fn_s
	BEQ .won
.one
	STZ.w !fn_s                    ; above 1
	LDA.w #$8000
	STA.w !fn_s+2
.won
	; the win: 660 frames in, the beam nearly home
	LDA.w !fn_age
	CMP.w #!FNT_STRUGGLE
	BCC .notWon
	LDA.w !fn_s+2
	CMP.w #(!FNQ_WIN)>>16
	BCC .notWon
	BNE .win
	LDA.w !fn_s
	CMP.w #(!FNQ_WIN)&$FFFF
	BCC .notWon
.win
	LDA.w #!FN_WIN
	JSR finale_phase
	STZ.w !f_charge
	JSL audio_cancel
	SEC
	RTS
.notWon
	; shown <= .04: Frieza's beam reaches Goku
	LDA.w !fn_s+2
	CMP.w #(!FNQ_FAIL)>>16
	BCC .fail
	BNE .held
	LDA.w !fn_s
	CMP.w #((!FNQ_FAIL)&$FFFF)+1
	BCS .held
.fail
	LDA.w #420
	JSR fight_damage
	LDA.w #!FN_RECOIL
	JSR finale_phase
	JSL audio_cancel
	LDA.w #!AUDIO_SFX_FRIEZA_IMPACT
	JSL audio_sfx
	LDA.w #12
	STA.w !f_shake
.held
	CLC
	RTS

; frieza-finale.js clashSurge -> A16 = index + 1 (0: none, Z set), X16 =
; frames into it. Struggle only.
finale_surge:
	LDA.w !fn_phase
	CMP.w #!FN_STRUGGLE
	BNE .none
	LDX.w #$0000
-	LDA.w !fn_age
	SEC : SBC.l orbit_fn_surge_at,X
	BMI .next
	CMP.w #90
	BCS .next
	PHA
	TXA
	LSR
	INC
	PLX
	CMP.w #$0000
	RTS
.next
	INX : INX
	CPX.w #6
	BCC -
.none
	LDA.w #$0000
	RTS

; frieza-finale.js tapClash plus spaceInput's answer ('hit', pulse 2): a
; fresh B or Y while the beams push.
finale_tap:
	LDA.w !fn_phase
	CMP.w #!FN_STRUGGLE
	BEQ +
	RTS
+	LDA.w !fn_age
	SEC : SBC.w !fn_last
	CMP.w #5
	BPL +
	RTS
+	LDA.w !fn_age
	STA.w !fn_last
	INC.w !fn_taps
	JSR finale_surge
	BEQ +
	LDA.w #(!FNQ_TAPS)&$FFFF : STA.w !fn_m+0
	LDA.w #(!FNQ_TAPS)>>16 : STA.w !fn_m+2
	BRA ++
+	LDA.w #(!FNQ_TAP)&$FFFF : STA.w !fn_m+0
	LDA.w #(!FNQ_TAP)>>16 : STA.w !fn_m+2
++	LDA.w !fn_p : CLC : ADC.w !fn_m+0 : STA.w !fn_p
	LDA.w !fn_p+2 : ADC.w !fn_m+2 : STA.w !fn_p+2
	; min(age < 660 ? .92 : 1, pressure)
	LDA.w !fn_age
	CMP.w #!FNT_STRUGGLE
	BCS .one
	LDA.w #(!FNQ_CAP)&$FFFF : STA.w !fn_m+0
	LDA.w #(!FNQ_CAP)>>16 : STA.w !fn_m+2
	BRA .cap
.one
	STZ.w !fn_m+0
	LDA.w #$8000 : STA.w !fn_m+2
.cap
	LDA.w !fn_p+2
	CMP.w !fn_m+2
	BCC .tapped
	BNE +
	LDA.w !fn_p
	CMP.w !fn_m+0
	BCC .tapped
+	LDA.w !fn_m+0 : STA.w !fn_p
	LDA.w !fn_m+2 : STA.w !fn_p+2
.tapped
	LDA.w #!AUDIO_SFX_HIT
	JSL audio_sfx
	LDA.w #2
	STA.w !f_shake
	RTS

; ---------------------------------------------------------------------------
; frieza.js win(): stage 'won', Frieza's HP 0, his shots and warning gone,
; b.age 0, cancelCombat (done by the struggle), the native 'stop'.
finale_win:
	STZ.w !b_hp
	JSR fight_clear_boss_shots
	STZ.w !w_kind
	STZ.w !fn_bage
	; F2: the driver's stop that keeps the music. The browser's 'stop'
	; silences the native music under its own 'orbit' cue, which plays on
	; into the white-out; on the cartridge that cue is the native song.
	LDA.w #$00F2
	LDX.w #$0000
	JSL core_sound_queue
	REP #$30
	JMP finale_bind_won            ; the frieza module's stage, if built

; frieza.js 'won' tick: while the native field can act and no victory
; command waits for the driver: b.age, the space and clash clocks, the cues
; (bossVictoryCue at age - impact, the jingle, the pouch chime, the
; descent's 'flight'), the return to the deck, then the landing clock.
finale_won:
	JSR finale_can_attack
	BCS +
	RTS
+	LDA.l !core_snd_head
	CMP.l !core_snd_tail
	BEQ +
	RTS                            ; a victory command is still queued
+	INC.w !fn_bage
	LDA.w !fn_ret
	BEQ +
	RTS                            ; back on the deck (the landing clock runs in WRAM)
+	INC.w !f_age
	INC.w !fn_age
	; bossVictoryCue(age - 12)
	LDA.w !fn_age
	SEC : SBC.w #!FNT_V_IMPACT
	BMI .cues
	BNE +
	LDA.w #$9402                   ; death: 02 94 0F 80
	LDX.w #$800F
	JSL core_sound_queue
	REP #$30
	BRA .cues
+	CMP.w #!FNT_B_FADE
	BNE +
	LDA.w #$8080                   ; fade: 80 80 00 00
	LDX.w #$0000
	JSL core_sound_queue
	REP #$30
	BRA .cues
+	LDX.w #(!FNT_B_NBURSTS-1)*2
-	CMP.l orbit_fn_bursts,X
	BEQ .burst
	DEX : DEX
	BPL -
	BRA .cues
.burst
	LDA.w #$1502                   ; burst: 02 15 0F 00
	LDX.w #$000F
	JSL core_sound_queue
	REP #$30
.cues
	LDA.w !fn_age
	CMP.w #!FNT_V_ACQUIRE
	BNE +
	LDA.w #$D802                   ; acquire: 02 D8 00 88
	LDX.w #$8800
	JSL core_sound_queue
	REP #$30
+	LDA.w !fn_age
	CMP.w #!FNT_V_JINGLE
	BNE ++
	; C3:0198 skips a song already selected: restart a cached fanfare
	SEP #$20
	LDA.w $1E05
	CMP.b #$18
	BNE +
	LDA.b #$FF
	STA.w $1E05
+	REP #$20
	LDA.w #$1801                   ; jingle: 01 18 44 8F
	LDX.w #$8F44
	JSL core_sound_queue
	REP #$30
++	LDA.w !fn_age
	CMP.w #!FNT_V_DESCENT
	BNE +
	LDA.w #!AUDIO_SFX_FLIGHT
	JSL audio_sfx
+	LDA.w !fn_age
	CMP.w #!FNT_V_RETURN
	BCC +
	JSR finale_return
+	RTS

; mana-mod.js canAttack (the parts that apply while Goku waits on the
; deck): carry set when the native field can act.
finale_can_attack:
	SEP #$20
	LDA.w $00D0
	BNE .no
	LDA.w $00EC
	AND.b #$FE
	BNE .no
	LDA.w $00ED
	AND.b #$40
	BNE .no
	LDA.w $00E4
	CMP.b #$01
	BNE .no
	LDA.w $00E5
	CMP.b #$01
	BNE .no
	LDA.l $7EE000
	AND.b #$01
	BEQ .no
	LDA.l $7EE02C
	AND.b #$01
	BEQ .no
	LDA.l $7EE190
	AND.b #$70
	BNE .no
	LDA.l $7EE191
	AND.b #$D5
	BNE .no
	LDA.l $7EE011                  ; nativeHurt: poses 8C-8F
	CMP.b #$8C
	BCC .yes
	CMP.b #$90
	BCC .no
.yes
	REP #$30
	SEC
	RTS
.no
	REP #$30
	CLC
	RTS

; frieza.js returnToFortress at victoryTiming.return: the picture goes back
; to the native deck (scene.asm orbit_return), Goku lands.
finale_return:
	LDA.w #$0001
	STA.w !fn_ret
	JMP orbit_return
