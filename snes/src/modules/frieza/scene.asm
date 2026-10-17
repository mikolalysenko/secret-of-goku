; Cutscene staging: scene clocks, per-scene side effects and Frieza's pose
; (engine/frieza.js tick() scene branch, frieza-staging.js friezaScenePose,
; frieza-intro.js altarPose). M16/X16, DB = $7E, D = 0.

; ---------------------------------------------------------------------------
; Camera the background is drawn with this frame (engine/view-camera.js):
; the tile stream's origin $A8/$AA plus BG1's fine scroll, which the field
; NMI writes from $B0/$B2 with the quake bits of $5E/$5F (C0:C170). The
; register wraps with the tilemap; only its offset within a tile counts.
fz_camera:
	LDA $5E
	AND.w #$0002
	EOR $B0
	SEC
	SBC $A8
	CLC
	ADC.w #8
	AND.w #$000F
	SEC
	SBC.w #8
	CLC
	ADC $A8
	STA !fz_cam_x
	LDA $5F
	AND.w #$0002
	EOR $B2
	SEC
	SBC $AA
	CLC
	ADC.w #8
	AND.w #$000F
	SEC
	SBC.w #8
	CLC
	ADC $AA
	STA !fz_cam_y
	RTS

; A16 = A mod 192 (any unsigned word): a subtraction ladder.
fz_mod192_full:
	CMP.w #49152
	BCC +
	SBC.w #49152
+	CMP.w #24576
	BCC +
	SBC.w #24576
+	CMP.w #12288
	BCC +
	SBC.w #12288
+	CMP.w #6144
	BCC +
	SBC.w #6144
+	CMP.w #3072
	BCC +
	SBC.w #3072
+	CMP.w #1536
	BCC +
	SBC.w #1536
+	CMP.w #768
	BCC +
	SBC.w #768
+	CMP.w #384
	BCC +
	SBC.w #384
+	CMP.w #192
	BCC +
	SBC.w #192
+	RTS

; hover(clock): A16 = signed -1/0/1 for clock A16.
fz_hover:
	JSR fz_mod192_full
	TAX
	LDA.l frieza_hover_table,X
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	RTS

; The scene's clock (s.scene.clock + age).
fz_scene_clock:
	LDA !fz_sclock
	CLC
	ADC !fz_sage
	RTS

; chargeFrame(age): age < 12 -> 0, < 24 -> 2, else 3.
fz_charge_frame:
	LDA !fz_sage
	CMP.w #12
	BCC .zero
	CMP.w #24
	BCC .two
	LDA.w #3
	RTS
.two
	LDA.w #2
	RTS
.zero
	LDA.w #0
	RTS
; throwFrame(age): age < 8 -> 3, < 28 -> 2, else 0.
fz_throw_frame:
	LDA !fz_sage
	CMP.w #8
	BCC .three
	CMP.w #28
	BCC .two
	LDA.w #0
	RTS
.two
	LDA.w #2
	RTS
.three
	LDA.w #3
	RTS

; A16 = min(age, A16) * 2 (table word index).
fz_age_index:
	STA !fz_t5
	LDA !fz_sage
	CMP !fz_t5
	BCC +
	LDA !fz_t5
+	ASL
	RTS

; ---------------------------------------------------------------------------
; friezaScenePose(c, camera) -> !fz_px, !fz_py (screen), !fz_pframe.
fz_scene_pose:
	JSR fz_camera
	SEP #$20
	STZ !fz_pframe
	REP #$20
	JSR fz_scene_kind
	STA !fz_t4                        ; kind
	LDA !fz_sflags
	AND.w #!FZSF_ALTAR
	BEQ .notAltar
	JMP .altar
.notAltar
	LDA !fz_sflags
	AND.w #!FZSF_COURT
	BEQ .plain
	JMP .court
.plain
	; x = c.x + 40, y = c.y - 40 (screen)
	LDA !fz_sx
	CLC
	ADC.w #40
	SEC
	SBC !fz_cam_x
	STA !fz_px
	LDA !fz_sy
	SEC
	SBC.w #40
	SEC
	SBC !fz_cam_y
	STA !fz_py
	LDX !fz_t4
	LDA.l fz_kind_bits-1,X
	AND.w #!FZK_CLAMP
	BEQ +
	; y = max(104, min(160, y)) (signed)
	LDA !fz_py
	BMI .y104
	CMP.w #104
	BCC .y104
	CMP.w #161
	BCC +
	LDA.w #160
	STA !fz_py
	BRA +
.y104
	LDA.w #104
	STA !fz_py
+	; core-* and the depart at map 195: fixed screen spot
	LDX !fz_t4
	LDA.l fz_kind_bits-1,X
	AND.w #!FZK_CORE
	BNE .core
	LDA !fz_t4
	CMP.w #!FZS_DEPART
	BNE .motion
	LDA $DC
	CMP.w #195
	BNE .motion
.core
	LDA.w #180
	STA !fz_px
	LDA.w #145
	STA !fz_py
.motion
	JSR fz_scene_clock
	JSR fz_hover
	STA !fz_t3                        ; bob
	LDA !fz_t4
	CMP.w #!FZS_REVEAL
	BEQ .arrive
	CMP.w #!FZS_CORE_ARRIVAL
	BEQ .arrive
	CMP.w #!FZS_DEPART
	BEQ .depart
	CMP.w #!FZS_TEMPLE_EXIT
	BEQ .depart
	CMP.w #!FZS_ALTAR_LEAVE
	BEQ .depart
	LDA !fz_py
	CLC
	ADC !fz_t3
	STA !fz_py
	BRA .frames
.arrive
	LDA.w #!FRIEZA_ARRIVE_LEN-1
	JSR fz_age_index
	TAX
	LDA.l frieza_arrive_dx,X
	CLC
	ADC !fz_px
	STA !fz_px
	LDA.l frieza_arrive_dy,X
	CLC
	ADC !fz_py
	STA !fz_py
	TXA
	LSR
	TAX
	LDA.l frieza_arrive_w,X
	BRA .bob
.depart
	LDA.w #!FRIEZA_DEPART_LEN-1
	JSR fz_age_index
	TAX
	LDA.l frieza_depart_dx,X
	CLC
	ADC !fz_px
	STA !fz_px
	LDA.l frieza_depart_dy,X
	CLC
	ADC !fz_py
	STA !fz_py
	TXA
	LSR
	TAX
	LDA.l frieza_depart_w,X
.bob
	AND.w #$00FF
	BEQ .frames
	LDA !fz_py
	CLC
	ADC !fz_t3
	STA !fz_py
.frames
	LDA !fz_t4
	CMP.w #!FZS_CORE_SHOT
	BEQ .throw
	CMP.w #!FZS_VICTORY
	BEQ .defeated
	LDX !fz_t4
	LDA.l fz_kind_bits-1,X
	AND.w #!FZK_CHARGE
	BEQ .done
	JSR fz_charge_frame
	BRA .setframe
.throw
	JSR fz_throw_frame
	BRA .setframe
.defeated
	LDA.w #7
.setframe
	SEP #$20
	STA !fz_pframe
	REP #$20
.done
	RTS

.court
	; anchors: fortressReturn (taunt, lift, explode, gold) or fortressCourt
	LDA !fz_t4
	CMP.w #!FZS_TAUNT
	BEQ .taunt
	CMP.w #!FZS_TRIAL_LEAVE
	BEQ .leave
	LDX !fz_t4
	LDA.l fz_kind_bits-1,X
	AND.w #!FZK_RETURN
	BEQ .courtAnchor
	LDA.w #280
	STA !fz_px
	LDA.w #380
	STA !fz_py
	BRA .courtCam
.courtAnchor
	LDA.w #350
	STA !fz_px
	LDA.w #400
	STA !fz_py
	BRA .courtCam
.taunt
	LDA.w #!FRIEZA_COURT_TAUNT_LEN-1
	JSR fz_age_index
	TAX
	LDA.l frieza_court_taunt_dx,X
	STA !fz_px
	LDA.l frieza_court_taunt_dy,X
	STA !fz_py
	BRA .courtCam
.leave
	LDA.w #!FRIEZA_COURT_LEAVE_LEN-1
	JSR fz_age_index
	TAX
	LDA.l frieza_court_leave_dx,X
	STA !fz_px
	LDA.l frieza_court_leave_dy,X
	STA !fz_py
.courtCam
	LDA !fz_px
	SEC
	SBC !fz_cam_x
	STA !fz_px
	JSR fz_scene_clock
	JSR fz_hover
	CLC
	ADC !fz_py
	SEC
	SBC !fz_cam_y
	STA !fz_py
	; empower (age < 140), lift and explode hold the charge pose
	LDA !fz_t4
	CMP.w #!FZS_EMPOWER
	BNE +
	LDA !fz_sage
	CMP.w #140
	BCS .cdone
	BRA .charge
+	CMP.w #!FZS_LIFT
	BEQ .charge
	CMP.w #!FZS_EXPLODE
	BNE .cdone
.charge
	JSR fz_charge_frame
	SEP #$20
	STA !fz_pframe
	REP #$20
.cdone
	RTS

.altar
	; frieza-intro.js altarPose: around (228,132) on map 431
	LDA !fz_t4
	CMP.w #!FZS_REVEAL
	BEQ .reveal
	CMP.w #!FZS_TEMPLE_EXIT
	BEQ .aleave
	CMP.w #!FZS_ALTAR_LEAVE
	BEQ .aleave
	LDA.w #228
	STA !fz_px
	LDA.w #132
	STA !fz_py
	BRA .acam
.reveal
	LDA.w #!FRIEZA_ALTAR_REVEAL_LEN-1
	JSR fz_age_index
	TAX
	LDA.l frieza_altar_reveal_dx,X
	STA !fz_px
	LDA.l frieza_altar_reveal_dy,X
	STA !fz_py
	BRA .acam
.aleave
	LDA.w #!FRIEZA_ALTAR_LEAVE_LEN-1
	JSR fz_age_index
	TAX
	LDA.l frieza_altar_leave_dx,X
	STA !fz_px
	LDA.l frieza_altar_leave_dy,X
	STA !fz_py
.acam
	LDA !fz_px
	SEC
	SBC !fz_cam_x
	STA !fz_px
	LDA !fz_py
	SEC
	SBC !fz_cam_y
	STA !fz_py
	RTS

; Per-kind properties (index = kind - 1, !FZK_* in module.asm).
fz_kind_bits:
	db $00                                      ; 1 waiting
	db $00                                      ; 2 emperor-wait
	db !FZK_SPRITE                              ; 3 trial-entry
	db !FZK_SPRITE|!FZK_CLAMP                   ; 4 trial-taunt
	db !FZK_SPRITE|!FZK_CLAMP|!FZK_CHARGE       ; 5 empower
	db !FZK_SPRITE                              ; 6 trial-leave
	db !FZK_SPRITE|!FZK_CLAMP                   ; 7 altar-leave
	db !FZK_SPRITE|!FZK_CLAMP                   ; 8 temple-exit
	db !FZK_SPRITE|!FZK_CORE                    ; 9 core-arrival
	db $00                                      ; 10 fanha-finish
	db $00                                      ; 11 emperor-shot
	db $00                                      ; 12 emperor-fall
	db $00,$00,$00,$00,$00,$00,$00              ; 13-19 tree scenes (vista)
	db !FZK_SPRITE|!FZK_CLAMP                   ; 20 reveal
	db !FZK_SPRITE                              ; 21 altar-approach
	db !FZK_SPRITE|!FZK_CLAMP                   ; 22 steal
	db !FZK_SPRITE|!FZK_CLAMP|!FZK_CORE|!FZK_CHARGE ; 23 core-charge
	db !FZK_SPRITE|!FZK_CLAMP|!FZK_CORE         ; 24 core-shot
	db !FZK_SPRITE|!FZK_CLAMP|!FZK_CORE         ; 25 core-impact
	db !FZK_CORE                                ; 26 core-escape
	db !FZK_SPRITE|!FZK_CLAMP                   ; 27 depart
	db $00                                      ; 28 eighth
	db !FZK_SPRITE|!FZK_RETURN                  ; 29 taunt
	db !FZK_SPRITE|!FZK_RETURN|!FZK_CHARGE      ; 30 lift
	db !FZK_SPRITE|!FZK_RETURN|!FZK_CHARGE      ; 31 explode
	db !FZK_SPRITE|!FZK_RETURN                  ; 32 gold
	db $00                                      ; 33 return
	db $00                                      ; 34 tree-establish
	db !FZK_SPRITE                              ; 35 victory

; ---------------------------------------------------------------------------
; Scene clock and side effects (tick(), the s.scene branch).
fz_scene_tick:
	JSR fz_scene_kind
	BNE +
	RTS
+	INC !fz_sage
	STA !fz_t4
	LDA !fz_t4
	CMP.w #!FZS_TREE_ARRIVAL
	BNE +
	LDA !fz_sage
	CMP.w #!FRIEZA_TREE_ARRIVAL+8
	BNE .next
	JMP fz_laugh
+	CMP.w #!FZS_REVEAL
	BNE +
	LDA.w #104
	STA !fz_t5
	LDA !fz_sflags
	AND.w #!FZSF_ALTAR
	BEQ ++
	LDA.w #!FRIEZA_INTRO_PAN
	STA !fz_t5
++	LDA !fz_sage
	CMP !fz_t5
	BNE .next
	JMP fz_laugh
+	CMP.w #!FZS_EMPEROR_SHOT
	BNE +
	LDA !fz_sage
	CMP.w #!FRIEZA_INTRO_HIT
	BNE .next
	LDA.w #!FZ_SFX_IMPACT
	JMP fz_sfx
+	CMP.w #!FZS_CORE_IMPACT
	BNE +
	LDA !fz_sage
	CMP.w #!FRIEZA_CORE_ERUPTION
	BNE .next
	LDA.w #24
	JSR fz_pulse
	LDA.w #!FZ_SFX_POWER_BURST
	JMP fz_sfx
+	CMP.w #!FZS_TEMPLE_EXIT
	BNE +
	LDA !fz_sage
	CMP.w #48
	BNE .next
	LDA.w #!FZ_SFX_FLIGHT
	JMP fz_sfx
.next
	RTS
+	CMP.w #!FZS_ALTAR_LEAVE
	BNE +
	; he flies off the top of the altar room alone
	LDA !fz_sage
	CMP.w #130
	BCC .next
	JMP fz_scene_clear
+	CMP.w #!FZS_EMPEROR_FALL
	BNE +
	JMP fz_emperor_fall_tick
+	CMP.w #!FZS_LIFT
	BNE +
	JMP fz_lift_tick
+	CMP.w #!FZS_GOLD
	BNE +
	LDA !fz_sage
	CMP.w #28
	BNE .next
	LDA.w #16
	JSR fz_pulse
	LDA.w #!FZ_SFX_POWER_BURST
	JMP fz_sfx
+	CMP.w #!FZS_EIGHTH
	BNE .next
	JSR fz_can_act
	BCC .next
	JMP fz_scene_clear

; emperor-fall: at age 12 the Emperor's actor disappears.
fz_emperor_fall_tick:
	LDA !fz_sage
	CMP.w #12
	BCC .out
	LDA !fz_sflags
	AND.w #!FZSF_TARGET
	BEQ .out
	LDX !fz_sbase
	LDA $E180,X
	AND.w #$00FF
	CMP.w #176
	BNE .out
	SEP #$20
	LDA $E000,X
	AND.b #$FE
	STA $E000,X
	REP #$20
.out
	RTS

; lift: Popoi rises to Goku's left, (c.x - 40, c.y + 24) with altitude
; min(44, floor(age * 0.6)), from where he stood over 48 frames.
fz_lift_tick:
	LDA $E400
	AND.w #$0001
	BEQ .out
	; x
	LDA !fz_sx
	SEC
	SBC.w #40
	STA !fz_t0                        ; to x
	LDA !fz_lfx
	STA !fz_t1                        ; from x
	JSR fz_lerp48
	STA $E402
	LDA !fz_sy
	CLC
	ADC.w #24
	STA !fz_t0
	LDA !fz_lfy
	STA !fz_t1
	JSR fz_lerp48
	STA $E404
	; altitude: floor(age * 3 / 5)
	LDA !fz_sage
	CMP.w #74
	BCC +
	LDA.w #74
+	STA !fz_t0
	ASL
	CLC
	ADC !fz_t0                        ; age * 3
	JSR fz_div5
	CMP.w #44
	BCC +
	LDA.w #44
+	SEP #$20
	STA $E445
	REP #$20
.out
	RTS

; round(from + (to - from) * min(1, age / 48)): !fz_t1 = from, !fz_t0 = to.
fz_lerp48:
	LDA !fz_sage
	CMP.w #48
	BCC +
	LDA !fz_t0
	RTS
+	STA !fz_t2                        ; age
	LDA !fz_t0
	SEC
	SBC !fz_t1
	STA !fz_t3                        ; delta (signed)
	BPL +
	EOR.w #$FFFF
	INC
+	JSR fz_mul_age                    ; |delta| * age
	CLC
	ADC.w #24                         ; round half up
	JSR fz_div48
	LDX !fz_t3
	BPL +
	EOR.w #$FFFF
	INC
+	CLC
	ADC !fz_t1
	RTS

; A16 = A16 * !fz_t2 (both small: product < 65536).
fz_mul_age:
	STA !fz_t5
	LDA.w #$0000
	LDX !fz_t2
	BEQ .done
-	CLC
	ADC !fz_t5
	DEX
	BNE -
.done
	RTS

; Unsigned A16 / 48 and / 5 through the CPU's divider ($4204-$4206).
fz_div48:
	LDX.w #48
	BRA fz_divx
fz_div5:
	LDX.w #5
fz_divx:
	STA.l $004204
	SEP #$20
	TXA
	STA.l $004206
	REP #$20
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	LDA.l $004214
	RTS

; ---------------------------------------------------------------------------
; Frieza's sprite in cutscenes (frieza.js draw(), the scene branch).
fz_draw_scene:
	JSR fz_scene_kind
	BEQ .out
	TAX
	LDA.l fz_kind_bits-1,X
	AND.w #!FZK_SPRITE
	BEQ .out
	LDA !fz_smap
	CMP $DC
	BNE .out
	JSR fz_scene_pose
	LDA !fz_pframe
	AND.w #$0007
	ORA !fz_atlas                     ; full-power art once he is muscular
	STA !fz_spr_id
	LDA !fz_px
	STA !fz_spr_x
	LDA !fz_py
	STA !fz_spr_y
	STZ !fz_spr_fl
	JSR fz_spr_draw
.out
	RTS
