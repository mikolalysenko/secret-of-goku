; Aerial effect sprites (engine/world-ki.js draw(), engine/sprite-layer.js
; giantBeam/stamp). Everything goes into our OAM slots ahead of Goku, as the
; browser's effect layer draws over his body (layer.behindBody false) and
; over the native sprites: the charge orb, ki orb and the wave first, then
; the sparks, the shield rebound, the explosion and the distant bursts.
; Only when our slots run out (!WORLD_FX_SLOTS_END, keeping room for Goku)
; do the latter go through core_oam_add into the module slots behind the
; natives.

; ---------------------------------------------------------------------------
; Front effects. w_cursor = OAM byte cursor (in/out). M16/X16, DB = $7E.
world_draw_front:
	LDA.w !w_charging
	BEQ +
	JSR world_draw_charge_orb
+	LDA.w !w_shot
	CMP.w #!SHOT_KI
	BNE +
	JMP world_draw_ki_orb
+	CMP.w #!SHOT_WAVE
	BNE +
	JMP world_draw_beam
+	RTS

; Put fx sprite A at (w_scratch+10, w_scratch+12) in our slots, attribute
; flips in w_scratch+8 ($40 h, $80 v). Uses/advances w_cursor.
world_fx_front:
	ASL
	TAX
	LDA.l world_fx_tile,X
	ORA.w #!WORLD_OBJ_ATTR_FX<<8
	ORA.w !w_scratch+8
	LDX.w !w_cursor
	JSR world_oam_put
	STX.w !w_cursor
	RTS

; The growing orb at the cupped hands while charging (hand socket (23,23)
; of the rear charge cell; frame by strength, flickering 3/4 when full).
world_draw_charge_orb:
	JSR world_charge_cap
	TAX
	CMP.w !w_charge
	BEQ .full
	BCC .full
	; floor(strength * 5) = charge * 5 / cap, capped at 4
	LDA.w !w_charge
	ASL
	ASL
	CLC
	ADC.w !w_charge
	JSR world_div8
	CMP.w #5
	BCC .frame
	LDA.w #4
	BRA .frame
.full
	LDA.w !w_frame
	LSR
	LSR
	AND.w #$0001
	CLC
	ADC.w #3
.frame
	PHA
	JSR world_goku_xy
	LDA.w !w_scratch
	CLC
	ADC.w #23-8
	STA.w !w_scratch+10
	LDA.w !w_scratch+2
	CLC
	ADC.w #23-8
	STA.w !w_scratch+12
	STZ.w !w_scratch+8
	PLA
	JMP world_fx_front

; Goku's cell origin: w_scratch = x, w_scratch+2 = y (sprite.asm placement).
world_goku_xy:
	LDA.w !w_bank
	ASL
	CLC
	ADC.w #112
	STA.w !w_scratch
	LDA.w !w_anim_age
	LSR
	LSR
	LSR
	AND.w #$0003
	CMP.w #$0001
	BNE +
	LDA.w #67
	BRA ++
+	CMP.w #$0003
	BNE +
	LDA.w #69
	BRA ++
+	LDA.w #68
++	STA.w !w_scratch+2
	RTS

; The tiny ki shot: shrinks from Goku's hands to its end point over 12 frames.
world_draw_ki_orb:
	LDA.w !w_shot_age
	CMP.w #12
	BCC +
	LDA.w #12
+	STA.w !w_scratch+6               ; t * 12
	; x = 128 + (ex - 128) * t
	LDA.w !w_shot_ex
	SEC
	SBC.w #128
	JSR world_lerp12
	CLC
	ADC.w #128-8
	STA.w !w_scratch+10
	LDA.w !w_shot_ey
	SEC
	SBC.w #88
	JSR world_lerp12
	CLC
	ADC.w #88-8
	STA.w !w_scratch+12
	STZ.w !w_scratch+8
	; frame max(0, 3 - floor(t*3)) = 3 - floor(age/4)
	LDA.w !w_scratch+6
	LSR
	LSR
	EOR.w #$FFFF
	SEC
	ADC.w #3
	BPL +
	LDA.w #0
+	JMP world_fx_front

; A16 (signed) * w_scratch+6 / 12. Clobbers X.
world_lerp12:
	PHA
	BPL +
	EOR.w #$FFFF
	INC
+	SEP #$20
	STA.l $004202
	LDA.w !w_scratch+6
	STA.l $004203
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	LDX.w #12
	JSR world_div8
	PLX
	BPL +
	EOR.w #$FFFF
	INC
+	RTS

; ---------------------------------------------------------------------------
; The aerial wave: a vertical streak from Goku's hands (128, 88) along the
; camera's forward axis (aerialBeamGeometry: length 112 over 12 frames,
; half-width (mega 78 : 14 + 12 * strength) with a 6-frame rise and a
; 12-frame fade, taper 26 / 18, farScale .72). Rows of 16 px: an edge OBJ
; on each side (bands of the Lucent Beam colours, ripple variant), white
; core fill between them. A shot the Fortress shield stops ends at the
; shield (y 24-64) and thins after the hit.
!WB_ROWS  = 7
world_draw_beam:
	; length: 112 or (88 - shield y), times min(1, age/12)
	LDA.w #112
	JSR world_shield_blocks
	BCC +
	JSR world_shield_y
	EOR.w #$FFFF
	SEC
	ADC.w #88
+	STA.w !w_scratch+6
	LDA.w !w_shot_age
	CMP.w #12
	BCS +
	SEP #$20
	LDA.w !w_scratch+6
	STA.l $004202
	LDA.w !w_shot_age
	STA.l $004203
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	LDX.w #12
	JSR world_div8
	STA.w !w_scratch+6
+	; length index (multiples of 8)
	LDA.w !w_scratch+6
	STA.w !w_proj+8                  ; drawn length, for the edge sparks
	CLC
	ADC.w #4
	LSR
	LSR
	LSR
	CMP.w #15
	BCC +
	LDA.w #14
+	STA.w !w_scratch+14              ; length / 8
	; half-width * envelope (in pixels): hw = mega ? 78 : 14 + 12*str/256
	LDA.w !w_shot_flags
	AND.w #!SF_MEGA
	BEQ .hwNormal
	LDA.w #78
	BRA .hw
.hwNormal
	LDA.w !w_shot_str
	ASL
	CLC
	ADC.w !w_shot_str                ; *3
	LSR
	LSR
	LSR
	LSR
	LSR
	LSR                              ; *12/256 = *3/64
	CLC
	ADC.w #14
.hw
	STA.w !w_scratch+4
	; envelope = min(256, age*256/6, (max-age)*256/12)
	LDA.w !w_shot_age
	XBA
	AND.w #$FF00
	LDX.w #6
	JSR world_div8
	STA.w !w_scratch+2
	LDA.w !w_shot_max
	SEC
	SBC.w !w_shot_age
	BPL +
	LDA.w #0
+	XBA
	AND.w #$FF00
	LDX.w #12
	JSR world_div8
	CMP.w !w_scratch+2
	BCS +
	STA.w !w_scratch+2
+	LDA.w !w_scratch+2
	CMP.w #256
	BCC +
	LDA.w #256
+	STA.w !w_scratch+2
	; the rebound thins the blocked streak: * max(0, 1 - (age-12)/10)
	LDA.w !w_shot_flags
	AND.w #!SF_DEFLECT
	BEQ .noThin
	LDA.w #22
	SEC
	SBC.w !w_shot_age
	BPL +
	LDA.w #0
+	CMP.w #11
	BCC +
	LDA.w #10
+	XBA
	AND.w #$FF00
	LDX.w #10
	JSR world_div8                   ; (1 - (age-12)/10) * 256
	STA.w !w_scratch
	LDA.w !w_scratch+2
	JSR .scale
	STA.w !w_scratch+2
.noThin
	; hwe = hw * envelope / 256
	LDA.w !w_scratch+4
	LDX.w !w_scratch+2
	STX.w !w_scratch
	JSR .scale
	STA.w !w_scratch+4               ; effective half-width
	SEP #$20
	STA.w !w_beam_hwe                ; (world_beam_row reuses w_scratch+4)
	REP #$20
	; profile table base: taper (mega 26) * 105 + length/8 * 7
	LDA.w !w_scratch+14
	ASL
	ASL
	ASL
	SEC
	SBC.w !w_scratch+14              ; * 7
	LDX.w !w_shot_flags
	PHA
	TXA
	AND.w #!SF_MEGA
	BEQ +
	PLA
	CLC
	ADC.w #105
	PHA
+	PLA
	STA.w !w_scratch+14              ; table offset
	; The grown beam keeps its shape: reuse last frame's entries and only
	; turn the edge ripple (the native builder leaves our slots alone).
	LDA.w !w_scratch+4
	XBA
	AND.w #$FF00
	ORA.w !w_scratch+14
	CMP.w !w_beam_sig
	BNE .full
	LDA.w !w_cursor
	CMP.w !w_beam_start
	BNE .full
	JSR world_beam_ripple
	LDA.w !w_beam_end
	STA.w !w_cursor
	BRA .orb
.full
	STA.w !w_beam_sig
	STZ.w !w_proj                    ; row widths, rewritten below
	STZ.w !w_proj+2
	STZ.w !w_proj+4
	STZ.w !w_proj+6
	LDA.w !w_cursor
	STA.w !w_beam_start
	LDA.w #$FFFF
	STA.w !w_beam_rows
	STA.w !w_beam_rows+2
	STA.w !w_beam_rows+4
	SEP #$20
	STA.w !w_beam_rows+6
	REP #$20
	; rows
	LDY.w #0
.row
	PHY
	TYA
	CLC
	ADC.w !w_scratch+14
	TAX
	LDA.l world_beam_f,X
	AND.w #$00FF
	BEQ .rowDone
	STA.w !w_scratch
	LDA.w !w_beam_hwe
	AND.w #$00FF
	JSR .scale                       ; W = hwe * f / 256
	CMP.w #2
	BCC .rowDone
	STA.w !w_scratch+2               ; W (row half-width)
	PLY
	PHY
	TYX
	SEP #$20
	STA.w !w_proj,X                  ; row widths for the edge sparks
	REP #$20
	JSR world_beam_row
.rowDone
	PLY
	INY
	CPY.w #!WB_ROWS
	BCC .row
	LDA.w !w_cursor
	STA.w !w_beam_end
.orb
	; the charge orb's last frame at the origin
	LDA.w #128-8
	STA.w !w_scratch+10
	LDA.w #88-8
	STA.w !w_scratch+12
	STZ.w !w_scratch+8
	LDA.w #!FX_CHARGE_ORB_4
	JMP world_fx_front
; A16 (0-256) * w_scratch (0-256) / 256. Clobbers nothing else.
.scale
	CMP.w #256
	BCC +
	LDA.w !w_scratch
	RTS
+	PHA
	LDA.w !w_scratch
	CMP.w #256
	BCC +
	PLA
	RTS
+	SEP #$20
	STA.l $004202
	LDA $01,S
	STA.l $004203
	NOP
	NOP
	NOP
	NOP
	REP #$20
	PLA
	LDA.l $004216
	XBA
	AND.w #$00FF
	RTS

; One 16-px row j (Y16) of half-width W (w_scratch+2): y = 72 - 16j.
world_beam_row:
	TYA
	ASL
	ASL
	ASL
	ASL
	EOR.w #$FFFF
	SEC
	ADC.w #72
	STA.w !w_scratch+12              ; top line of the row
	; ripple: ((2j+1) + age/2) % 3 == 0 -> edge variant 1
	TYA
	ASL
	INC
	STA.w !w_scratch+6
	LDA.w !w_shot_age
	LSR
	CLC
	ADC.w !w_scratch+6
-	CMP.w #3
	BCC +
	SBC.w #3
	BRA -
+	LDX.w #!FX_BEAM_EDGE_0
	CMP.w #0
	BNE +
	LDX.w #!FX_BEAM_EDGE_1
+	STX.w !w_scratch+6               ; edge sprite
	; left edge
	LDA.w #128
	SEC
	SBC.w !w_scratch+2
	STA.w !w_scratch+10
	STA.w !w_scratch+0               ; fill start - 16
	STZ.w !w_scratch+8
	LDA.w !w_cursor
	PHA
	LDA.w !w_scratch+6
	JSR world_fx_front
	PLA
	CMP.w !w_cursor
	BEQ +                            ; culled (row above the screen)
	PHX
	TYX
	SEP #$20
	STA.w !w_beam_rows,X             ; this row's left edge slot
	REP #$20
	PLX
+
	; right edge (mirrored)
	LDA.w #128-16
	CLC
	ADC.w !w_scratch+2
	STA.w !w_scratch+10
	STA.w !w_scratch+4               ; fill end
	LDA.w #$4000
	STA.w !w_scratch+8
	LDA.w !w_scratch+6
	JSR world_fx_front
	STZ.w !w_scratch+8
	; white core between the edges, 16 px at a time (always on screen
	; horizontally; rows above y = -16 were skipped): a tight loop writing
	; x|y and tile|attr words, the high table is prefilled as large.
	LDA.w !w_scratch+12
	CMP.w #$FFF0
	BCS +
	CMP.w #224
	BCS .done                        ; row off the top
+	AND.w #$00FF
	XBA
	STA.w !w_scratch+6               ; y << 8
	LDA.l world_fx_tile+(!FX_BEAM_FILL*2)
	ORA.w #!WORLD_OBJ_ATTR_FX<<8
	STA.w !w_scratch+8
	LDX.w !w_cursor
	LDA.w !w_scratch+0
.fill
	CLC
	ADC.w #16
	CMP.w !w_scratch+4
	BPL .end
	CMP.w #240
	BCS .end                         ; (x stays in the low byte of x|y)
	CPX.w #$00DC                     ; leave room for Goku (4) and the shadow
	BCS .end
	TAY
	ORA.w !w_scratch+6
	STA.w $0800,X
	LDA.w !w_scratch+8
	STA.w $0802,X
	INX
	INX
	INX
	INX
	TYA
	BRA .fill
.end
	STX.w !w_cursor
	STZ.w !w_scratch+8
.done
	RTS

; Cached beam: the edge tiles of every drawn row follow the ripple.
world_beam_ripple:
	LDY.w #0
.row
	LDA.w !w_beam_rows,Y
	AND.w #$00FF
	CMP.w #$00FF
	BEQ .next
	TAX
	; ((2j+1) + age/2) mod 3 == 0 -> ripple variant
	TYA
	ASL
	INC
	STA.w !w_scratch+6
	LDA.w !w_shot_age
	LSR
	CLC
	ADC.w !w_scratch+6
-	CMP.w #3
	BCC +
	SBC.w #3
	BRA -
+	CMP.w #0
	BNE +
	LDA.l world_fx_tile+(!FX_BEAM_EDGE_1*2)
	BRA ++
+	LDA.l world_fx_tile+(!FX_BEAM_EDGE_0*2)
++	ORA.w #!WORLD_OBJ_ATTR_FX<<8
	STA.w $0802,X
	ORA.w #$4000
	STA.w $0806,X
.next
	INY
	CPY.w #!WB_ROWS
	BCC .row
	RTS

; C set when the Fortress shield stops this wave (world-ki.js shieldBlocks).
; Preserves A.
world_shield_blocks:
	PHA
	LDA.w !w_shot_tgt
	CMP.w #!TGT_FORTRESS
	BNE .no
	LDA.w !w_shot
	CMP.w #!SHOT_WAVE
	BNE .no
	LDA.w !w_shot_flags
	AND.w #!SF_SUPER
	BEQ .yes
	LDA.w !w_shot_str
	CMP.w #!STR_FULL
	BCC .yes
.no
	PLA
	CLC
	RTS
.yes
	PLA
	SEC
	RTS

; A16 = the shield contact line (shieldPoint: end y if 24-64, else 48).
world_shield_y:
	LDA.w !w_shot_ey
	CMP.w #24
	BCC .mid
	CMP.w #65
	BCS .mid
	RTS
.mid
	LDA.w #48
	RTS

; ---------------------------------------------------------------------------
; The second group of effects (world_fx_back: our slots while they last).
world_draw_back:
	JSR world_draw_beam_sparks       ; (reads the widths world_draw_beam left)
	JSR world_draw_aim_sparks
	JSR world_draw_rebound
	JSR world_draw_explosion
	JMP world_draw_bursts

; A16 = fx id, w_scratch+10/+12 = top-left, w_scratch+8 flips. Our slots
; (world_fx_front) while the cursor is below !WORLD_FX_SLOTS_END, else
; core_oam_add; C set when those are full too. Sprites outside [-16, 256) x
; [-16, 224) are dropped: OAM Y is 8 bits, so core_oam_add's wider cull
; would let a 16x16 sprite at y < -16 wrap to the bottom of the screen.
world_fx_back:
	PHA
	LDA.w !w_cursor
	CMP.w #!WORLD_FX_SLOTS_END
	BCS .core
	PLA
	JSR world_fx_front               ; our slots, in front of Goku and natives
	CLC
	RTS
.core
	LDA.w !w_scratch+12
	CLC
	ADC.w #16
	CMP.w #224+16
	BCS .off
	LDA.w !w_scratch+10
	CLC
	ADC.w #16
	CMP.w #256+16
	BCS .off
	PLA
	ASL
	TAX
	LDA.l world_fx_tile,X
	ORA.w #!WORLD_OBJ_ATTR_FX<<8
	ORA.w !w_scratch+8
	STA.w !core_spr_tile&$FFFF
	LDA.w !w_scratch+10
	STA.w !core_spr_x&$FFFF
	LDA.w !w_scratch+12
	STA.w !core_spr_y&$FFFF
	LDA.w #$0001
	STA.w !core_spr_size&$FFFF
	JSL core_oam_add
	RTS
.off
	PLA
	CLC
	RTS

; While charging: four sparks around the aimed target (every frame). The
; target is re-evaluated every four frames, its candidates spread over the
; four frames (barrier, Fortress and two towns, then three towns per frame)
; from one camera snapshot, and published on the fourth.
world_draw_aim_sparks:
	LDA.w !w_charging
	BNE +
	JMP .none
+	LDA.w !w_frame
	AND.w #$0003
	BNE .steps
	; mega = Super Saiyan with a full charge (world-ki.js aim())
	LDA.w !goku_form
	AND.w #$0001
	BEQ +
	LDA.w !w_charge
	CMP.w #!CHARGE_CAP_SSJ
	LDA.w #$0000
	ROL
+	ORA.w #!WA_STAGED
	JSR world_aim_begin
	LDA.w #0
	LDX.w #4
	JSR world_aim_step
	BRA .shown
.steps
	TAY
	LDA.w !wa_mega
	AND.w #!WA_STAGED
	BEQ .shown                       ; no evaluation of this cycle to continue
	TYA
	ASL
	TAX
	LDA.l .first-2,X
	PHA
	LDA.l .end-2,X
	TAX
	PLA
	JSR world_aim_step
	LDA.w !w_frame
	AND.w #$0003
	CMP.w #$0003
	BNE .shown
	; publish
	LDA.w !wa_best
	STA.w !w_aim
	CMP.w #!TGT_NONE
	BNE +
	JMP .none
+	CMP.w #!TGT_FORTRESS
	BNE .formula
	JSR world_fort_fresh
	BCS .formula
	LDA.w !w_fort_x
	STA.w !w_aim_x
	LDA.w !w_fort_y
	STA.w !w_aim_y
	BRA .draw
.formula
	LDA.w !wa_along
	LDX.w !wa_across
	JSR world_target_screen
	STA.w !w_aim_x
	STX.w !w_aim_y
	BRA .draw
.shown
	LDA.w !w_aim
	CMP.w #!TGT_NONE
	BNE .draw
	JMP .none
.first: dw 4, 7, 10
.end:   dw 7, 10, !WORLD_AIM_CANDS
.draw
	; impact-spark frame floor(frame/6) mod 6, at (+-12, +-10)
	LDA.w !w_frame
	LDX.w #6
	JSR world_div8
	LDX.w #6
	JSR world_mod
	CLC
	ADC.w #!FX_IMPACT_SPARK_0
	STA.w !w_scratch+6
	STZ.w !w_scratch+8
	LDY.w #0
.spark
	TYX
	LDA.w !w_aim_x
	CLC
	ADC.l .dx,X
	SEC
	SBC.w #8
	STA.w !w_scratch+10
	LDA.w !w_aim_y
	CLC
	ADC.l .dy,X
	SEC
	SBC.w #8
	STA.w !w_scratch+12
	LDA.w !w_scratch+6
	PHY
	JSR world_fx_back
	PLY
	INY
	INY
	CPY.w #8
	BCC .spark
.none
	RTS
.dx: dw -12, 12, -12, 12
.dy: dw -10, -10, 10, 10

; Sparks along both edges of the wave every 28 px (giantBeam stamps):
; impact sparks, every third one lightning, at the row's half-width - 2.
world_draw_beam_sparks:
	LDA.w !w_shot
	CMP.w #!SHOT_WAVE
	BEQ +
	RTS
+	LDA.w !w_shot_age
	LSR
	STA.w !w_scratch+4               ; phase
	; d = 18 + (phase*7) % 28
	ASL
	ASL
	ASL
	SEC
	SBC.w !w_scratch+4
	LDX.w #28
	JSR world_mod
	CLC
	ADC.w #18
	STA.w !w_scratch+6               ; d
.next
	JSR world_fx_budget
	BCC +
	RTS
+	LDA.w !w_scratch+6
	CMP.w !w_proj+8
	BCC +
	RTS
+	LSR
	LSR
	LSR
	LSR
	TAX                              ; row = d / 16
	CPX.w #!WB_ROWS
	BCC +
	RTS
+	LDA.w !w_proj,X
	AND.w #$00FF
	BEQ .skip
	SEC
	SBC.w #2
	STA.w !w_scratch+2               ; across
	; group: (d/28 + phase) % 3 ? impact-spark : lightning; frame phase % 2
	LDA.w !w_scratch+6
	LDX.w #28
	JSR world_div8
	CLC
	ADC.w !w_scratch+4
	LDX.w #3
	JSR world_mod
	TAY
	LDA.w !w_scratch+4
	AND.w #$0001
	CPY.w #0
	BEQ +
	CLC
	ADC.w #!FX_IMPACT_SPARK_0
	BRA ++
+	CLC
	ADC.w #!FX_LIGHTNING_0
++	STA.w !w_scratch+14
	LDA.w #88-8
	SEC
	SBC.w !w_scratch+6
	STA.w !w_scratch+12
	STZ.w !w_scratch+8
	LDA.w #128-8
	SEC
	SBC.w !w_scratch+2
	STA.w !w_scratch+10
	LDA.w !w_scratch+14
	JSR world_fx_back
	BCS .full
	LDA.w #128-8
	CLC
	ADC.w !w_scratch+2
	STA.w !w_scratch+10
	LDA.w #$4000
	STA.w !w_scratch+8
	LDA.w !w_scratch+14
	JSR world_fx_back
	BCS .full
.skip
	LDA.w !w_scratch+6
	CLC
	ADC.w #28
	STA.w !w_scratch+6
	JMP .next
.full
	RTS

; The shield rebound (world-ki.js draw, deflected): a thin streak bouncing
; off the shield toward (side*.84, -.54), 12 px per frame up to 150 px,
; fading over the last 14 frames, with four arcs and a spark at the contact
; point for 24 frames.
world_draw_rebound:
	LDA.w !w_shot                    ; only while the deflected wave lives
	CMP.w #!SHOT_WAVE
	BNE ++
	LDA.w !w_shot_flags
	AND.w #!SF_DEFLECT
	BNE +
++	RTS
+	LDA.w !w_shot_age
	SEC
	SBC.w #12
	BPL +
	RTS
+	STA.w !w_scratch+4               ; age12
	JSR world_shield_y
	STA.w !w_scratch+6               ; bounce point y (x = 128)
	; length = min(150, age12*12)
	LDA.w !w_scratch+4
	ASL
	CLC
	ADC.w !w_scratch+4
	ASL
	ASL
	CMP.w #150
	BCC +
	LDA.w #150
+	STA.w !w_scratch+2
	; orbs along the streak every 12 px while it has width (fade)
	LDA.w !w_shot_max
	SEC
	SBC.w !w_shot_age
	CMP.w #2
	BCC .arcs
	STZ.w !w_scratch                 ; t
.orb
	JSR world_fx_budget
	BCS .arcs
	LDA.w !w_scratch
	CMP.w !w_scratch+2
	BCS .arcs
	; x = 128 + side*t*.84 (215/256), y = by - t*.54 (138/256)
	SEP #$20
	LDA.w !w_scratch
	STA.l $004202
	LDA.b #215
	STA.l $004203
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	XBA
	AND.w #$00FF
	LDX.w !w_shot_side
	BPL +
	EOR.w #$FFFF
	INC
+	CLC
	ADC.w #128-8
	STA.w !w_scratch+10
	SEP #$20
	LDA.b #138
	STA.l $004203
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	XBA
	AND.w #$00FF
	EOR.w #$FFFF
	SEC
	ADC.w !w_scratch+6
	SEC
	SBC.w #8
	STA.w !w_scratch+12
	STZ.w !w_scratch+8
	LDA.w #!FX_CHARGE_ORB_3
	JSR world_fx_back
	BCS .arcs
	LDA.w !w_scratch
	CLC
	ADC.w #12
	STA.w !w_scratch
	BRA .orb
.arcs
	LDA.w !w_scratch+4
	CMP.w #24
	BCC +
	RTS
+	; r = 18 + age12/2; arcs at (r,0) (0,r/2) (-r,0) (0,-r/2), frames phase+i
	LSR
	CLC
	ADC.w #18
	STA.w !w_scratch+2
	LDY.w #0
.arc
	TYX
	LDA.l .ax,X
	BEQ .ay
	BPL +
	LDA.w #128-8
	SEC
	SBC.w !w_scratch+2
	BRA ++
+	LDA.w #128-8
	CLC
	ADC.w !w_scratch+2
++	STA.w !w_scratch+10
	LDA.w !w_scratch+6
	SEC
	SBC.w #8
	STA.w !w_scratch+12
	BRA .put
.ay
	LDA.w #128-8
	STA.w !w_scratch+10
	LDA.l .ay2,X
	PHA
	LDA.w !w_scratch+2
	LSR
	PLX
	CPX.w #$0000
	BPL +
	EOR.w #$FFFF
	INC
+	CLC
	ADC.w !w_scratch+6
	SEC
	SBC.w #8
	STA.w !w_scratch+12
.put
	TYA
	LSR
	CLC
	ADC.w !w_shot_age
	LSR
	AND.w #$0001
	CLC
	ADC.w #!FX_AURA_ARC_0
	STZ.w !w_scratch+8
	PHY
	JSR world_fx_back
	PLY
	INY
	INY
	CPY.w #8
	BCC .arc
	; impact spark at the contact point
	LDA.w #128-8
	STA.w !w_scratch+10
	LDA.w !w_scratch+6
	SEC
	SBC.w #8
	STA.w !w_scratch+12
	LDA.w !w_shot_age
	LSR
	LDX.w #6
	JSR world_mod
	CLC
	ADC.w #!FX_IMPACT_SPARK_0
	JMP world_fx_back
.ax: dw 1, 0, -1, 0
.ay2: dw 0, 1, 0, -1

; Explosion at the hit point (world-ki.js draw): 8 sparks and orbs (20 for
; the full SSJ wave, a third of them per frame) turning and spreading on a
; ring: spark i at angle i*K + phase*24 (K = 12 of 256, ~12.8; 32 for 8),
; radius 8 + (age + 7i) mod M (M = 78, or 30), odd i an impact spark of
; frame (i + phase) mod 6, even i a charge orb of frame (i + phase) mod 5.
; The per-spark terms advance incrementally from the first i. Not drawn
; once the planet cutaway covers the view.
world_draw_explosion:
	LDA.w !w_expl_age
	CMP.w #$FFFF
	BEQ .none
	LDA.w !w_cut_age
	CMP.w #$FFFF
	BEQ +
.none
	RTS
+	LDA.w !w_expl_age
	LSR
	LSR
	STA.w !w_scratch+12              ; phase
	LDA.w !w_expl_flags
	AND.w #$0001
	BEQ .small
	LDA.w #20
	STA.w !w_scratch                 ; count
	LDA.w #78
	STA.w !w_scratch+2               ; M
	LDA.w #3
	STA.w !w_scratch+4               ; i step
	LDA.w #36
	STA.w !w_scratch+6               ; angle step (3 * 12)
	LDA.w #21
	STA.w !w_scratch+14              ; radius step (3 * 7)
	LDA.w !w_frame
	LDX.w #3
	JSR world_mod                    ; i0: a third of the ring each frame
	PHA                              ; [i]
	ASL
	ASL
	STA.w !w_scratch+10
	ASL
	ADC.w !w_scratch+10              ; i0 * 12
	BRA .start
.small
	LDA.w #8
	STA.w !w_scratch
	LDA.w #30
	STA.w !w_scratch+2
	LDA.w #1
	STA.w !w_scratch+4
	LDA.w #32
	STA.w !w_scratch+6
	LDA.w #7
	STA.w !w_scratch+14
	LDA.w #0
	PHA                              ; [i] = 0
.start
	STA.w !w_scratch+10
	LDA.w !w_scratch+12
	ASL
	ASL
	ASL
	STA.w !w_scratch+8
	ASL
	ADC.w !w_scratch+8               ; phase * 24
	CLC
	ADC.w !w_scratch+10
	AND.w #$00FF
	PHA                              ; [angle]
	LDA $03,S                        ; i0
	ASL
	ASL
	ASL
	SEC
	SBC $03,S                        ; 7 * i0
	CLC
	ADC.w !w_expl_age
	LDX.w !w_scratch+2
	JSR world_mod
	CLC
	ADC.w #8
	PHA                              ; [rad]
	LDA $05,S
	CLC
	ADC.w !w_scratch+12
	PHA
	LDX.w #6
	JSR world_mod
	STA $01,S                        ; [m6] = (i0 + phase) mod 6
	LDA $07,S
	CLC
	ADC.w !w_scratch+12
	LDX.w #5
	JSR world_mod
	PHA                              ; [m5] = (i0 + phase) mod 5
	; stack: m5 $01, m6 $03, rad $05, angle $07, i $09
.spark
	JSR world_fx_budget              ; out of frame time: the rest next frame
	BCC +
	JMP .done
+	; x = ex - 8 + cos(angle) * rad, y = ey - 8 + sin(angle) * rad
	LDA $07,S
	CLC
	ADC.w #64
	JSR world_sin256
	TAY
	LDA $05,S
	JSR world_mul8s
	CLC
	ADC.w !w_expl_x
	SEC
	SBC.w #8
	STA.w !w_scratch+10
	LDA $07,S
	JSR world_sin256
	TAY
	LDA $05,S
	JSR world_mul8s
	CLC
	ADC.w !w_expl_y
	SEC
	SBC.w #8
	STA.w !w_scratch+12
	STZ.w !w_scratch+8
	LDA $09,S
	LSR
	BCC .orb
	LDA $03,S
	CLC
	ADC.w #!FX_IMPACT_SPARK_0
	BRA .put
.orb
	LDA $01,S
	CLC
	ADC.w #!FX_CHARGE_ORB_0
.put
	JSR world_fx_back
	BCS .done                        ; module slots full
	; next i
	LDA $09,S
	CLC
	ADC.w !w_scratch+4
	CMP.w !w_scratch
	BCS .done
	STA $09,S
	LDA $07,S
	CLC
	ADC.w !w_scratch+6
	AND.w #$00FF
	STA $07,S
	LDA $05,S
	CLC
	ADC.w !w_scratch+14
	SEC
	SBC.w #8
	CMP.w !w_scratch+2
	BCC +
	SBC.w !w_scratch+2
+	CLC
	ADC.w #8
	STA $05,S
	LDA $03,S
	CLC
	ADC.w !w_scratch+4
	CMP.w #6
	BCC +
	SBC.w #6
+	STA $03,S
	LDA $01,S
	CLC
	ADC.w !w_scratch+4
	CMP.w #5
	BCC +
	SBC.w #5
+	STA $01,S
	JMP .spark
.done
	PLA
	PLA
	PLA
	PLA
	PLA
	RTS

; A16 = r (0-255), Y16 = s (signed, |s| <= 127) -> A16 = (r * s) >> 7.
; CPU multiplier. Clobbers nothing else.
world_mul8s:
	SEP #$20
	STA.l $004202
	TYA
	BPL .pos
	EOR.b #$FF
	INC
	STA.l $004203
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	ASL
	XBA
	AND.w #$00FF
	EOR.w #$FFFF
	INC
	RTS
.pos
	STA.l $004203
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	ASL
	XBA
	AND.w #$00FF
	RTS

; Distant ki bursts: re-projected each frame from their world position; a
; rising gold spark and, for 18 frames, four impact sparks spreading out.
world_draw_bursts:
	LDA.w !w_burst_live
	BNE +
	RTS
+	LDX.w #!WORLD_BURST_BYTES-6
-	LDA.w !w_bursts,X
	BPL +
	TXA
	SEC
	SBC.w #6
	TAX
	BPL -
	RTS                              ; nothing visible
+	JSR world_aim_camera
	LDX.w #0
.burst
	STX.w !w_scratch+14
	LDA.w !w_bursts,X
	BMI .skip                        ; not yet ($8000 = none, negative = waiting)
	STA.w !w_scratch+4               ; age
	; along/across from the current position and heading
	LDA.w !w_bursts+2,X
	LDX.w !wa_px
	JSR world_delta
	STA.w !w_scratch+8               ; dx
	LDX.w !w_scratch+14
	LDA.w !w_bursts+4,X
	LDX.w !wa_py
	JSR world_delta
	STA.w !w_scratch+10              ; dy
	LDY.w !wa_sin
	LDA.w !w_scratch+8
	JSR world_mul7
	PHA
	LDY.w !wa_cos
	LDA.w !w_scratch+10
	JSR world_mul7
	CLC
	ADC $01,S
	EOR.w #$FFFF
	INC
	STA $01,S                        ; along
	BMI .drop
	BEQ .drop
	LDY.w !wa_cos
	LDA.w !w_scratch+8
	JSR world_mul7
	PHA
	LDY.w !wa_sin
	LDA.w !w_scratch+10
	JSR world_mul7
	EOR.w #$FFFF
	SEC
	ADC $01,S
	TAX                              ; across
	PLA
	PLA
	PHX
	LDX.w !w_scratch+4               ; age (world_target_screen uses +4/+6)
	STX.w !wa_cand
	PLX
	JSR world_target_screen
	STA.w !w_scratch+6               ; screen x
	STX.w !w_scratch+12              ; screen y
	LDA.w !wa_cand
	STA.w !w_scratch+4
	JSR .draw
	BRA .skip
.drop
	PLA
.skip
	LDA.w !w_scratch+14
	CLC
	ADC.w #6
	TAX
	CPX.w #!WORLD_BURST_BYTES
	BCS +
	JMP .burst
+
	RTS
.draw
	; gold spark (frame min(5, age/4) of 4) rising by age/5
	LDA.w !w_scratch+4
	LSR
	LSR
	CMP.w #5
	BCC +
	LDA.w #5
+	STA.w !w_scratch+2               ; phase
	AND.w #$0003
	CLC
	ADC.w #!FX_GOLD_SPARK_0
	PHA
	LDA.w !w_scratch+6
	SEC
	SBC.w #8
	STA.w !w_scratch+10
	LDA.w !w_scratch+4
	LDX.w #5
	JSR world_div8
	EOR.w #$FFFF
	SEC
	ADC.w !w_scratch+12
	SEC
	SBC.w #8
	STA.w !w_scratch+10+2
	STZ.w !w_scratch+8
	PLA
	JSR world_fx_back
	BCC +
	RTS
+	LDA.w !w_scratch+4
	CMP.w #18
	BCC +
	RTS
+	; sparks at radius 2 + age/3: (r,0) (0,r) (-r,0) (0,-r)
	LDX.w #3
	JSR world_div8
	CLC
	ADC.w #2
	STA.w !w_scratch                 ; r
	LDA.w !w_scratch+6
	SEC
	SBC.w #8
	STA.w !wa_tx                     ; spark origin x (top-left)
	LDA.w !w_scratch+12
	SEC
	SBC.w #8
	STA.w !wa_ty
	LDA.w !w_scratch+2
	LDX.w #6
	JSR world_mod
	CLC
	ADC.w #!FX_IMPACT_SPARK_0
	STA.w !w_scratch+2
	STZ.w !w_scratch+8
	LDY.w #0
.spark
	TYX
	LDA.l .sx,X
	BEQ +
	BPL ++
	LDA.w !wa_tx
	SEC
	SBC.w !w_scratch
	BRA +++
++	LDA.w !wa_tx
	CLC
	ADC.w !w_scratch
	BRA +++
+	LDA.w !wa_tx
+++	STA.w !w_scratch+10
	LDA.l .sy,X
	BEQ +
	BPL ++
	LDA.w !wa_ty
	SEC
	SBC.w !w_scratch
	BRA +++
++	LDA.w !wa_ty
	CLC
	ADC.w !w_scratch
	BRA +++
+	LDA.w !wa_ty
+++	STA.w !w_scratch+12
	LDA.w !w_scratch+2
	PHY
	JSR world_fx_back
	PLY
	BCS .out
	INY
	INY
	CPY.w #8
	BCC .spark
.out
	RTS
.sx: dw 1, 0, -1, 0
.sy: dw 0, 1, 0, -1
