; The fight's effects (frieza.js draw(), battle branch): projectiles,
; warnings, eruption markers, the surge aura and lightning, the riposte's
; sparks. Drawn through the fx module (bind.asm wrappers); positions are
; map pixels.

; Frieza on the deck and the effects of the moment (frieza.js draw()).
fz_battle_draw:
	JSR fz_battle_live
	BCS +
	RTS
+	JSR fz_camera
	JSR fz_hero
	; face Goku: flip when b.x < h.x
	STZ !fz_t7
	LDA !fzf_x
	SEC
	SBC !fz_hx
	BPL +
	INC !fz_t7
+	JSR fz_draw_hazards
	JSR fz_draw_shots
	JSR fz_draw_warning
	JSR fz_battle_sprite
	JSR fz_draw_afterimages
	JSR fz_draw_surge
	RTS

; The sprite: the pointing cell while a laser charges or flies, else the
; pose of the moment with the recoil push.
fz_battle_sprite:
	LDA !fz_t7
	PHA
	JSR fz_pointer
	BCC .pose
	LDA.w #2
	ORA !fz_atlas
	STA !fz_spr_id
	LDA !fz_t5
	SEC
	SBC !fz_cam_x
	STA !fz_spr_x
	LDA !fz_t6
	SEC
	SBC !fz_cam_y
	STA !fz_spr_y
	LDA !fz_t7
	STA !fz_spr_fl
	PLA
	STA !fz_t7
	JMP fz_spr_draw
.pose
	PLA
	STA !fz_t7
	JSR fz_battle_frame
	ORA !fz_atlas
	STA !fz_spr_id
	LDA !fzf_x
	SEC
	SBC !fz_cam_x
	STA !fz_spr_x
	; recoil pushes him back: (face ? 1 : -1) * ceil(recoil / 3)
	LDA !fzf_recoil
	AND.w #$00FF
	BEQ +
	CLC
	ADC.w #2
	LDX.w #3
	JSR fz_divmod
	LDA !fz_m5
	LDX !fz_t7
	BNE ++
	EOR.w #$FFFF
	INC
++	CLC
	ADC !fz_spr_x
	STA !fz_spr_x
+	LDA !fzf_y
	CLC
	ADC.w #8
	SEC
	SBC !fz_cam_y
	STA !fz_spr_y
	LDA !fz_t7
	STA !fz_spr_fl
	JMP fz_spr_draw

; The pose of the moment (frieza.js draw()).
fz_battle_frame:
	LDA !fzf_hurt
	AND.w #$00FF
	BEQ +
	LDA.w #6
	RTS
+	LDA.l !fzs_rip
	AND.w #$00FF
	CMP.w #$00FF
	BEQ +
	CMP.w #18
	BCC .four
	LDA.w #5
	RTS
+	LDA.l !fzs_surge
	AND.w #$00FF
	BNE .four
	LDA !fzf_windup
	AND.w #$00FF
	BNE .four
	LDA !fzf_dash
	AND.w #$00FF
	BEQ +
	LDA.w #5
	RTS
+	LDA !fzf_recoil
	AND.w #$00FF
	BEQ +
	LDA.w #2
	RTS
+	LDA.l !fzs_wkind
	AND.w #$00FF
	BEQ +
	CMP.w #!FZK_DISC
	BNE .three
	LDA.w #2
	RTS
.three
	LDA.w #3
	RTS
+	LDA !fzf_tier
	AND.w #$00FF
	BNE .four
	LDA !fzf_age
	LSR
	LSR
	LSR
	LSR
	AND.w #$0001
	RTS
.four
	LDA.w #4
	RTS

; Frieza's projectiles.
fz_draw_shots:
	LDX.w #(!FZ_SHOT_N-1)*16
.loop
	STX !fz_sx_i
	LDA.l !FZ_SHOTS+!sh_kind,X
	AND.w #$00FF
	BEQ .next
	PHA
	LDA.l !FZ_SHOTS+!sh_x,X
	STA !fz_ax
	LDA.l !FZ_SHOTS+!sh_y,X
	STA !fz_ay
	PLA
	CMP.w #!FZK_LASER
	BEQ .laser
	CMP.w #!FZK_DISC
	BEQ .disc
	; Death Orb: the 32 px violet ball, frame (age >> 3) % 12
	LDA.l !FZ_SHOTS+!sh_age,X
	LSR
	LSR
	LSR
	TAX
	LDA.w #32
	JSR fz_fx_deathball
	BRA .next
.disc
	LDA.l !FZ_SHOTS+!sh_age,X
	JSR fz_fx_disc
	BRA .next
.laser
	LDA.l !FZ_SHOTS+!sh_ang,X
	AND.w #$000F
	TAY
	LDA.l !FZ_SHOTS+!sh_age,X
	JSR fz_fx_laser
.next
	LDA !fz_sx_i
	SEC
	SBC.w #16
	TAX
	BPL .loop
	RTS

; The charge of the next attack.
fz_draw_warning:
	LDA.l !fzs_wkind
	AND.w #$00FF
	BEQ .out
	CMP.w #!FZK_LASER
	BEQ .laser
	PHA
	LDA !fzf_x
	STA !fz_ax
	LDA !fzf_y
	SEC
	SBC.w #24
	STA !fz_ay
	PLA
	CMP.w #!FZK_DISC
	BEQ .disc
	; growing orb: 16 + 16 * floor(age * 2 / wait), frame (age >> 3) % 12
	LDA.l !fzs_wage
	AND.w #$00FF
	ASL
	STA !fz_t0
	LDA.l !fzs_wwait
	AND.w #$00FF
	TAX
	LDA !fz_t0
	JSR fz_divmod
	LDA !fz_m5
	BEQ +
	LDA.w #32
	BRA ++
+	LDA.w #16
++	PHA
	LDA.l !fzs_wage
	AND.w #$00FF
	LSR
	LSR
	LSR
	TAX
	PLA
	JMP fz_fx_deathball
.disc
	LDA.l !fzs_wage
	AND.w #$00FF
	JMP fz_fx_disc
.laser
	JSR fz_pointer                    ; fingertip in !fz_ax/!fz_ay
	BCC .out
	LDA.l !fzs_wage
	AND.w #$00FF
	JMP fz_fx_finger
.out
	RTS

; Eruption markers: the gold charge orb grows over the warning.
fz_draw_hazards:
	LDX.w #(!FZ_HAZ_N-1)*8
.loop
	STX !fz_sx_i
	LDA.l !FZ_HAZ+!hz_on,X
	AND.w #$00FF
	BEQ .next
	LDA.l !FZ_HAZ+!hz_age,X
	AND.w #$00FF
	STA !fz_t0
	LDA.l !FZ_HAZ+!hz_wait,X
	AND.w #$00FF
	STA !fz_t1
	LDA !fz_t0
	CMP !fz_t1
	BCS .next                         ; detonated: the explosion runs on its own
	LDA.l !FZ_HAZ+!hz_x,X
	STA !fz_ax
	LDA.l !FZ_HAZ+!hz_y,X
	STA !fz_ay
	; frame min(4, floor(age * 5 / wait))
	LDA !fz_t0
	ASL
	ASL
	CLC
	ADC !fz_t0
	LDX !fz_t1
	JSR fz_divmod
	LDA !fz_m5
	CMP.w #5
	BCC +
	LDA.w #4
+	JSR fz_fx_gold_orb
.next
	LDA !fz_sx_i
	SEC
	SBC.w #8
	TAX
	BPL .loop
	RTS

; Dash afterimages (frame 5, ghost colour): only while the dash pose is the
; resident frame, drawn behind every other frame (the browser dithers them).
fz_draw_afterimages:
	LDA !fz_spr_cnt
	AND.w #$00FF
	BEQ .out
	LDA !fzf_dash
	AND.w #$00FF
	BEQ .out
	LDA.w !core_frame&$FFFF
	AND.w #$0001
	BNE .out
	LDX.w #(!FZ_AFTER_N-1)*6
.loop
	STX !fz_sx_i
	LDA.l !FZ_AFTER+!af_age,X
	AND.w #$00FF
	CMP.w #$00FF
	BEQ .next
	LDA.l !FZ_AFTER+!af_x,X
	SEC
	SBC !fz_cam_x
	STA !fz_spr_x
	LDA.l !FZ_AFTER+!af_y,X
	CLC
	ADC.w #8
	SEC
	SBC !fz_cam_y
	STA !fz_spr_y
	LDA.w #5
	ORA !fz_atlas
	STA !fz_spr_id
	LDA !fz_t7
	ORA.w #!FZD_BACK|!FZD_GHOST
	STA !fz_spr_fl
	JSR fz_spr_draw
.next
	LDA !fz_sx_i
	SEC
	SBC.w #6
	TAX
	BPL .loop
.out
	RTS

; The surge's lightning and aura; the riposte's coil and sparks.
fz_draw_surge:
	LDA.l !fzs_surge
	AND.w #$00FF
	BEQ .riposte
	; lightning on even frames at (bx -/+ 16, by - 18), frame t >> 3
	LDA.w !core_frame&$FFFF
	AND.w #$0001
	BNE .aura
	LDA !fzf_x
	SEC
	SBC.w #16
	STA !fz_ax
	LDA !fzf_y
	SEC
	SBC.w #10
	STA !fz_ay
	LDA.l !fzs_sage
	LSR
	LSR
	LSR
	LDX.w #0
	JSR fz_fx_lightning
	LDA !fzf_x
	CLC
	ADC.w #16
	STA !fz_ax
	LDA.l !fzs_sage
	LSR
	LSR
	LSR
	LDX.w #2
	JSR fz_fx_lightning
.aura
	LDA.l !fzs_sage
	BRA .drawAura
.riposte
	LDA.l !fzs_rip
	AND.w #$00FF
	CMP.w #$00FF
	BNE +
	RTS
+	CMP.w #18
	BCS .sparks
.drawAura
	PHA
	LDA !fzf_x
	STA !fz_ax
	LDA !fzf_y
	SEC
	SBC.w #12
	STA !fz_ay
	PLA
	JMP fz_fx_aura_pink
.sparks
	; four impact sparks flying outward: 12 + (a - 18) * 3 px
	SEC
	SBC.w #18
	STA !fz_t0
	ASL
	CLC
	ADC !fz_t0
	CLC
	ADC.w #12
	STA !fz_t1                        ; distance
	LDA !fz_t0
	LSR
	STA !fz_t2                        ; frame
	LDX.w #6
.spark
	STX !fz_sx_i
	LDA !fzf_x
	CLC
	ADC.l .dx,X
	STA !fz_ax
	LDA !fzf_y
	SEC
	SBC.w #4
	CLC
	ADC.l .dy,X
	STA !fz_ay
	LDA.l .sx,X
	BEQ +
	BPL ++
	LDA !fz_ax
	SEC
	SBC !fz_t1
	STA !fz_ax
	BRA +
++	LDA !fz_ax
	CLC
	ADC !fz_t1
	STA !fz_ax
+	LDA.l .sy,X
	BEQ +
	BPL ++
	LDA !fz_ay
	SEC
	SBC !fz_t1
	STA !fz_ay
	BRA +
++	LDA !fz_ay
	CLC
	ADC !fz_t1
	STA !fz_ay
+	LDA !fz_t2
	JSR fz_fx_spark_cell
	LDX !fz_sx_i
	DEX
	DEX
	BPL .spark
.out
	RTS
.dx
	dw 0,0,0,0
.dy
	dw 0,0,0,0
.sx
	dw 1,0,-1,0
.sy
	dw 0,1,0,-1
