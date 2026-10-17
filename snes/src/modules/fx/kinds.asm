; Kind renderers, called inside fx_frame's direct-page frame. Each draws the
; current effect (!d_cur, screen coordinates; !C_T = age for spawned kinds,
; the client clock for draws). Scratch: !d_s (16 bytes) and the direction
; registers. M16/X16, DB = $7E.

fx_kind_table:
	dw fx_k_none, fx_k_impact, fx_k_ki, fx_k_burst, fx_k_explode, fx_k_ember
	dw fx_k_detonate, fx_k_status, fx_k_debris, fx_k_sparks
	dw fx_k_none, fx_k_none, fx_k_none, fx_k_none, fx_k_none, fx_k_none
	dw fx_k_orb, fx_k_aura, fx_k_lightning, fx_k_deathball, fx_k_disc, fx_k_finger, fx_k_cell
fx_beam_table:
	dw fx_b_kame, fx_b_wave, fx_b_wave, fx_b_wave, fx_b_strip, fx_b_laser, fx_b_strip

fx_k_none:
	RTS

; Draw assembly A at the current effect's position.
fx_emit_here:
	PHA
	LDX.w #$0000
	LDY.w #$0000
	JSR fx_at
	PLA
	JMP fx_emit

; ---------------------------------------------------------------------------
; FX_IMPACT (sprite-layer.js 'impact'): spark frame min(5,age/2) turned to
; the hit direction, two more at (-7,+3) and (+7,-3) for five frames.
fx_k_impact:
	LDA.w #!FX_E_FRONT
	JSR fx_depth
	LDA.w #!FX_G_IMPACT
	JSR fx_variant
	STA !d_s                     ; group
	LDA !d_cur+!C_DIR
	JSR fx_set_dir
	LDX.w #$0000
	LDY.w #$0000
	JSR fx_at
	LDA !d_cur+!C_T
	LSR
	CMP.w #6
	BCC +
	LDA.w #5
+	TAX
	LDY !d_turn
	LDA !d_s
	JSR fx_stamp
	LDA !d_cur+!C_T
	CMP.w #5
	BCS .done
	LDX.w #-7
	LDY.w #3
	JSR fx_at
	LDA !d_cur+!C_T
	LSR
	TAX
	LDY.w #$0000
	LDA !d_s
	JSR fx_stamp
	LDX.w #7
	LDY.w #-3
	JSR fx_at
	LDA !d_cur+!C_T
	LSR
	TAX
	LDY.w #$0000
	LDA !d_s
	JSR fx_stamp
.done
	RTS

; ---------------------------------------------------------------------------
; FX_KI (sprite-layer.js 'ki'): three charge-orb cells 7 px apart behind the
; front at min(range,(age+1)*14), frames 3/2/1 front to back, turned along
; the flight; the palm cell (frame 1) for the first two frames.
fx_k_ki:
	LDA.w #!FX_E_FRONT
	JSR fx_depth
	JSR fx_depth_up
	LDA.w #!FX_G_ORB
	JSR fx_variant
	STA !d_s                     ; group
	LDA !d_cur+!C_DIR
	JSR fx_set_dir
	LDA !d_cur+!C_T              ; distance = min(range, (age+1)*14)
	INC
	STA !d_s+2
	ASL
	ASL
	ASL
	ASL
	SEC
	SBC !d_s+2
	SBC !d_s+2
	CMP !d_cur+!C_A
	BCC +
	LDA !d_cur+!C_A
+	STA !d_s+2                   ; front distance
	STZ !d_s+4                   ; i
.loop
	LDA !d_s+4                   ; d = distance - 7i
	ASL
	ASL
	ASL
	SEC
	SBC !d_s+4
	EOR.w #$FFFF
	SEC
	ADC !d_s+2
	JSR fx_scale_dir
	JSR fx_at
	LDA.w #3
	SEC
	SBC !d_s+4
	TAX
	LDY !d_turn
	LDA !d_s
	JSR fx_stamp
	INC !d_s+4
	LDA !d_s+4
	CMP.w #3
	BCC .loop
	LDA !d_cur+!C_T
	CMP.w #2
	BCS .done
	LDX.w #$0000
	LDY.w #$0000
	JSR fx_at
	LDX.w #1
	LDY.w #$0000
	LDA !d_s
	JSR fx_stamp
.done
	RTS

; ---------------------------------------------------------------------------
; FX_BURST: the transformation blast ring (sprite-layer.js powerBurst),
; behind the body: one precomputed assembly per age (fx.mjs ringParts).
; !C_A radius 56 (default) or 16; gold with FX_F_GOLD.
fx_k_burst:
	LDA.w #$0000
	JSR fx_depth
	LDA !d_cur+!C_A
	CMP.w #56
	BEQ +
	LDA.w #2
	BRA fx_ring
+	LDA.w #0
	; fall through

; Ring A (0 = radius 56, 2 = radius 16) at the anchor for age !C_T < 14.
fx_ring:
	STA !d_s+14
	LDA !d_cur+!C_T
	CMP.w #14
	BCC +
	RTS
+	LDA !d_cur+!C_KIND
	AND.w #!FX_F_GOLD<<8
	BEQ +
	INC !d_s+14
+	LDA !d_s+14                  ; ((R16 ? 2 : 0) + gold) * 14 + age
	ASL
	ASL
	ASL
	ASL
	SEC
	SBC !d_s+14
	SBC !d_s+14
	CLC
	ADC !d_cur+!C_T
	CLC
	ADC.w #!FX_ASM_RING
	JMP fx_emit_here

; ---------------------------------------------------------------------------
; FX_EXPLODE: one Exploder burst, frame age/6, mirror !C_A, turn !C_DIR.
fx_k_explode:
	LDA.w #$0000
	JSR fx_depth
	LDA !d_cur+!C_T
	LDX.w #$0000                 ; frame = age / 6
-	CMP.w #6
	BCC +
	SBC.w #6
	INX
	BRA -
+	TXA
	ASL                          ; (frame*2 + mirror)*4 + turn
	ORA !d_cur+!C_A
	ASL
	ASL
	STA !d_s
	LDA !d_cur+!C_DIR
	AND.w #$0003
	CLC
	ADC !d_s
	CLC
	ADC.w #!FX_ASM_BURST
	JMP fx_emit_here

; ---------------------------------------------------------------------------
; FX_EMBER: a Fireball ember flying out along one of the eight statusBurst
; directions (!C_DIR 0-7), frame min(2,age/8), turn dir&3.
fx_k_ember:
	LDA.w #$0000
	JSR fx_depth
	LDA !d_cur+!C_T
	CMP.w #28
	BCC +
	RTS
+	ASL                          ; (age*8 + dir)*2
	ASL
	ASL
	STA !d_s
	LDA !d_cur+!C_DIR
	AND.w #$0007
	ORA !d_s
	ASL
	TAX
	LDA.l fx_ember_path,X
	AND.w #$00FF
	SEC
	SBC.w #128
	PHA
	LDA.l fx_ember_path+1,X
	AND.w #$00FF
	SEC
	SBC.w #128
	TAY
	PLX
	JSR fx_at
	LDA !d_cur+!C_T              ; frame min(2, age>>3)
	LSR
	LSR
	LSR
	CMP.w #3
	BCC +
	LDA.w #2
+	ASL
	ASL
	STA !d_s
	LDA !d_cur+!C_DIR
	AND.w #$0003
	CLC
	ADC !d_s
	CLC
	ADC.w #!FX_ASM_EMBER
	JMP fx_emit

; ---------------------------------------------------------------------------
; FX_DETONATE (beam-detonation.js): rolling Exploder cluster and embers, 132
; frames, from the precomputed groups (each shown for two frames).
fx_k_detonate:
	LDA.w #$0000
	JSR fx_depth
	LDX.w #$0000
	LDY.w #$0000
	JSR fx_at
	LDA !d_cur+!C_T
	LSR
	CMP.w #!FX_DET_FRAMES
	BCC +
	RTS
+	JMP fx_emit_group

; ---------------------------------------------------------------------------
; FX_STATUS (sprite-layer.js statusBurst): !C_A shell 0 plain, 1 fire,
; 2 ice, 3 balloon (precomputed per age), then the 16 px ring while age < 14.
fx_k_status:
	LDA.w #$0000
	JSR fx_depth
	LDA !d_cur+!C_A
	BEQ .ring
	DEC                          ; (shell-1)*28 + age
	ASL
	ASL
	STA !d_s
	ASL
	ASL
	ASL
	SEC
	SBC !d_s
	CLC
	ADC !d_cur+!C_T
	CLC
	ADC.w #!FX_ASM_STATUS
	JSR fx_emit_here
.ring
	LDA.w #2
	JMP fx_ring

; ---------------------------------------------------------------------------
; FX_DEBRIS: not implemented yet.
fx_k_debris:
	RTS

; ---------------------------------------------------------------------------
; FX_SPARKS (ceiling-escape.js impact): eight impact sparks spreading out
; while age < 12 (precomputed per age).
fx_k_sparks:
	LDA.w #$0000
	JSR fx_depth
	LDA !d_cur+!C_T
	CMP.w #12
	BCC +
	RTS
+	CLC
	ADC.w #!FX_ASM_SPARKS
	JMP fx_emit_here

; ---------------------------------------------------------------------------
; FX_ORB: charge orb frame !C_A (0-4) at the palm; FX_F_GOKU anchors it to
; goku_api_hand. In front unless facing up (!C_DIR = 3).
fx_k_orb:
	LDA.w #!FX_E_FRONT
	JSR fx_depth
	JSR fx_depth_up
	LDA !d_cur+!C_KIND
	BIT.w #!FX_F_GOKU<<8
	BEQ .placed
	%fx_far(goku_api_hand)       ; C set: A = x, X = y (screen)
	BCS +
	RTS
+	CLC
	ADC !d_cur+!C_X
	STA !d_cur+!C_X
	TXA
	CLC
	ADC !d_cur+!C_Y
	STA !d_cur+!C_Y
.placed
	LDX.w #$0000
	LDY.w #$0000
	JSR fx_at
	LDA.w #!FX_G_ORB
	JSR fx_variant
	LDX !d_cur+!C_A
	LDY.w #$0000
	JMP fx_stamp

; ---------------------------------------------------------------------------
; FX_AURA and FX_LIGHTNING: not implemented yet.
fx_k_aura:
	RTS
fx_k_lightning:
	RTS

; ---------------------------------------------------------------------------
; FX_DEATHBALL: !C_A diameter, !C_T frame (0-11). 16 and 32 px balls are
; OBJ; larger sizes draw the 32 px ball until the polygon renderer lands.
fx_k_deathball:
	LDA.w #$0000
	JSR fx_depth
	LDA !d_cur+!C_T
-	CMP.w #12
	BCC +
	SBC.w #12
	BRA -
+	STA !d_s
	LDA !d_cur+!C_A
	CMP.w #25
	BCS +
	LDA.w #!FX_ASM_DEATH16
	BRA ++
+	LDA.w #!FX_ASM_DEATH32
++	CLC
	ADC !d_s
	JMP fx_emit_here

; FX_DISC: tilt [0,1,0,-1][(age>>3)&3].
fx_k_disc:
	LDA.w #$0000
	JSR fx_depth
	LDA !d_cur+!C_T
	LSR
	LSR
	LSR
	AND.w #$0003
	ASL
	TAX
	LDA.l .tilt,X
	CLC
	ADC.w #!FX_ASM_DISC
	JMP fx_emit_here
.tilt
	dw 0, 1, 0, 2

; FX_FINGER: charge glint frame (age>>3)&1.
fx_k_finger:
	LDA.w #!FX_E_FRONT
	JSR fx_depth
	LDA !d_cur+!C_T
	LSR
	LSR
	LSR
	AND.w #$0001
	CLC
	ADC.w #!FX_ASM_FINGER
	JMP fx_emit_here

; FX_CELL: any native cell. !C_A group (FX_G_*), !C_B frame, !C_DIR turn.
fx_k_cell:
	LDA.w #$0000
	JSR fx_depth
	LDX.w #$0000
	LDY.w #$0000
	JSR fx_at
	LDA !d_cur+!C_A
	CMP.w #!FX_G_BURST
	BEQ .burst
	CMP.w #!FX_G_EMBER
	BEQ .ember
	BCS .none
	JSR fx_variant
	LDX !d_cur+!C_B
	PHA
	LDA !d_cur+!C_DIR
	AND.w #$0003
	TAY
	PLA
	JMP fx_stamp
.burst
	LDA !d_cur+!C_B              ; frame 0-6
	CMP.w #7
	BCS .none
	ASL
	ASL
	ASL
	BRA .turned
.ember
	LDA !d_cur+!C_B
	CMP.w #3
	BCS .none
	ASL
	ASL
	CLC
	ADC.w #!FX_ASM_EMBER-!FX_ASM_BURST
.turned
	STA !d_s
	LDA !d_cur+!C_DIR
	AND.w #$0003
	CLC
	ADC !d_s
	CLC
	ADC.w #!FX_ASM_BURST
	JMP fx_emit
.none
	RTS

; ---------------------------------------------------------------------------
; Beams (fx_beam). !C_X/!C_Y palms, !C_DIR facing, !C_A length, !C_B width
; or half-width, !C_C taper, !C_T age (phase = age/2).

; FX_BEAM_KAME (sprite-layer.js): band unions of the 16x4 Lucent strip every
; 16 px from d=8 while d < length, the head at the front, orb frame 4 at
; the palms. Bands max(1,round(width/4)), +2 with FX_F_SSJ.
fx_b_kame:
	LDA !d_cur+!C_B
	CLC
	ADC.w #2
	LSR
	LSR
	BNE +
	INC
+	STA !d_s+2                   ; bands
	LDA !d_cur+!C_KIND
	BIT.w #!FX_F_SSJ<<8
	BEQ +
	INC !d_s+2
	INC !d_s+2
+	LDA.w #$0000                 ; band set 0: blue
	BRA fx_beam_strips

; FX_BEAM_FRIEZA / FX_BEAM_FIRE: the orbit beam() strip in Frieza's pink or
; the Fireball colours; width / 3 bands.
fx_b_strip:
	LDA !d_cur+!C_B
	LDX.w #$0000
-	CMP.w #3
	BCC +
	SBC.w #3
	INX
	BRA -
+	TXA
	BNE +
	INC
+	STA !d_s+2
	LDA !d_cur+!C_KIND
	AND.w #$007F
	CMP.w #!FX_BEAM_FIRE
	LDA.w #1                     ; pink
	BCC fx_beam_strips
	LDA.w #2                     ; fire
	BRA fx_beam_strips

; FX_BEAM_LASER: not implemented yet (needs diagonal strips).
fx_b_laser:
	RTS

; Strip beam: A = band set (0 blue, 1 pink, 2 fire), !d_s+2 bands.
fx_beam_strips:
	STA !d_s+4                   ; set
	LDA !d_s+2
	CMP.w #8
	BCC +
	LDA.w #7
	STA !d_s+2
+	LDA !d_cur+!C_DIR
	JSR fx_set_dir
	LDA !d_cur+!C_T              ; phase
	LSR
	STA !d_s+6
	; Head (blue / pink sets) and orb, in front unless the beam points up.
	LDA.w #!FX_E_FRONT
	JSR fx_depth
	JSR fx_depth_up
	LDA !d_s+4
	CMP.w #2
	BCS .noHead
	LDA !d_cur+!C_A
	JSR fx_scale_dir
	JSR fx_at
	LDA !d_s+4
	ASL
	TAX
	LDA.l .head,X
	LDX !d_s+6
	LDY !d_turn
	JSR fx_stamp
.noHead
	LDX.w #$0000
	LDY.w #$0000
	JSR fx_at
	LDA !d_s+4
	ASL
	TAX
	LDA.l .orb,X
	LDX.w #4
	LDY.w #$0000
	JSR fx_stamp
	; Strips behind the natives.
	LDA.w #$0000
	JSR fx_depth
	LDA !d_s+4                   ; fx_band_index[((set*2 + frame)*7 + bands-1)*4 + turn]
	ASL
	STA !d_s
	LDA !d_s+6
	AND.w #$0001
	ORA !d_s
	STA !d_s
	ASL
	ASL
	ASL
	SEC
	SBC !d_s                     ; *7
	CLC
	ADC !d_s+2
	DEC
	ASL
	ASL
	CLC
	ADC !d_turn
	ASL
	TAX
	LDA.l fx_band_index,X
	JSR fx_emit_setup            ; one strip assembly, placed every 16 px
	BCS .done
	LDA !d_cur+!C_A              ; strips at d = 8, 24, ... while d < length
	SEC
	SBC.w #8
	BEQ .done
	BMI .done
	CLC
	ADC.w #15
	LSR
	LSR
	LSR
	LSR
	PHA
	LDA.w #8
	JSR fx_scale_dir
	JSR fx_at
	LDA.w #16
	STA !d_rstep
	PLA
	JSR fx_emit_run
.done
	RTS
.head
	dw !FX_SG_BEAM_HEAD, !FX_SG_PINK_BEAM_HEAD, !FX_SG_BEAM_HEAD
.orb
	dw !FX_SG_CHARGE_ORB, !FX_SG_PINK_CHARGE_ORB, !FX_SG_GOLD_CHARGE_ORB

; FX_BEAM_WAVE / FINAL / GALICK (giantBeam): the colour-math polygon
; (poly.asm) with native cells along both edges and the orb at the palms;
; where no polygon is possible, the widest strip (7 bands) in blue.
fx_b_wave:
if defined("FX_TEST")
	JSR fx_test_vline
	STA.l !FXT_BOX+$B8           ; before the polygon
endif
	JSR fx_poly_beam
	PHP
	LDA.w #$FFFF                 ; the builder used !d_tiles
	STA !d_lasta
if defined("FX_TEST")
	JSR fx_test_vline
	STA.l !FXT_BOX+$BA           ; after the polygon
endif
	PLP
	BCC fx_wave_edges
	LDA.w #7
	STA !d_s+2
	LDA.w #$0000
	JMP fx_beam_strips

; giantBeam's edge cells: for d = 18 + (phase*7)%28, every 28 px below
; min(length, 360), on both sides at radius(d) - 2: impact sparks, every
; third one a Thunderbolt cell (Final Flash: gold sparks / gold arcs),
; frame phase % 2, turned along the beam; charge orb frame 4 at the palms.
; Two passes (sparks, then the third cells) each set one assembly up. Cells
; in the taper are placed one by one; past it every residue class of the
; 28 px grid is a run 84 px apart on each side (fx_emit_run's fast path).
!w_d    = !d_s+$0             ; distance along the beam
!w_k    = !d_s+$2             ; (floor(d/28) + phase) % 3 at w_d
!w_lim  = !d_s+$4             ; min(length, 360)
!w_ph   = !d_s+$6             ; phase
!w_r    = !d_s+$8             ; radius(d) - 2
!w_x    = !d_s+$A             ; axis point at w_d
!w_y    = !d_s+$C
!w_j    = !d_s+$E             ; residue classes left
!w_hw   = !fx_e+$0            ; (SRAM scratch, free while drawing)
!w_t    = !fx_e+$2
!w_dt   = !fx_e+$4
!w_pass = !fx_e+$6            ; 0: the sparks, 1: the Thunderbolt / arc cells
!w_gold = !fx_e+$8            ; 0 blue, 2 gold (table offset)
!w_n    = !fx_e+$A            ; placements in the run
fx_wave_edges:
	LDA !d_cur+!C_DIR
	JSR fx_set_dir
	LDA !d_cur+!C_T
	LSR
	STA !w_ph
	LDA !d_cur+!C_KIND
	AND.w #$0003
	CMP.w #!FX_BEAM_FINAL
	BNE +
	LDA.w #2
	BRA ++
+	LDA.w #0
++	STA.l !w_gold
	LDA !d_cur+!C_B              ; geometry as fx_poly_beam
	CMP.w #256
	BCC +
	LDA.w #255
+	STA.l !w_hw
	LDA !d_cur+!C_C
	BNE +
	LDA.w #44
+	CMP.w #9
	BCS +
	LDA.w #9
+	CMP.w #256
	BCC +
	LDA.w #255
+	STA.l !w_t
	SEC
	SBC.w #8
	STA.l !w_dt
	; Orb at the palms, in front unless the beam points up.
	LDA.w #!FX_E_FRONT
	JSR fx_depth
	JSR fx_depth_up
	LDX.w #$0000
	LDY.w #$0000
	JSR fx_at
	LDA.l !w_gold
	TAX
	LDA.l .orb,X
	LDX.w #4
	LDY !d_turn
	JSR fx_stamp
if defined("FX_TEST")
	JSR fx_test_vline
	STA.l !FXT_BOX+$BC           ; after the orb
endif
	; Edge cells behind the natives.
	LDA.w #$0000
	JSR fx_depth
	LDA !d_cur+!C_A
	CMP.w #360
	BCC +
	LDA.w #360
+	STA !w_lim
	LDA.w #$0000
	STA.l !w_pass
.pass
	LDA.l !w_gold                ; this pass's assembly, set up once
	TAX
	LDA.l !w_pass
	BNE +
	LDA.l .spark,X
	BRA ++
+	LDA.l .arc,X
++	PHA
	LDA !w_ph
	AND.w #$0001
	TAX
	PLA
	LDY !d_turn
	JSR fx_stamp_id
	JSR fx_emit_setup
	BCC +
	JMP .nextPass
+	LDA !w_ph                    ; d = 18 + 7 * (phase & 3)
	AND.w #$0003
	STA !w_d
	ASL
	ASL
	ASL
	SEC
	SBC !w_d
	CLC
	ADC.w #18
	STA !w_d
	CMP.w #28
	LDA.w #$0000
	ROL                          ; floor(d / 28)
	CLC
	ADC !w_ph
-	CMP.w #3
	BCC +
	SBC.w #3
	BRA -
+	STA !w_k
.taper                           ; cells inside the taper, one by one
	LDA !w_d
	CMP !w_lim
	BCC +
	JMP .nextPass
+	CMP.l !w_dt
	BCS .runs
	JSR .match
	BCS .tnext
	LDA !w_d                     ; radius = hw * (d + 8) / taper
	CLC
	ADC.w #8
	TAX
	SEP #$20
	LDA.l !w_hw
	STA.l $004202
	TXA
	STA.l $004203
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	STA.l $004204
	SEP #$20
	LDA.l !w_t
	STA.l $004206
	REP #$20
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	LDA.l $004214
	SEC
	SBC.w #2
	BPL +
	LDA.w #$0000
+	STA !w_r
	JSR .axis
	LDA.w #1
	STA.l !w_n
	JSR .sides
.tnext
	JSR .advance
	JMP .taper
.runs                            ; past the taper: the full radius
	LDA.l !w_hw
	SEC
	SBC.w #2
	BPL +
	LDA.w #$0000
+	STA !w_r
	LDA.w #3
	STA !w_j
.run
	LDA !w_d
	CMP !w_lim
	BCS .nextPass
	JSR .match
	BCS .rnext
	LDA !w_lim                   ; placements: ceil((lim - d) / 84)
	SEC
	SBC !w_d
	CLC
	ADC.w #83
	STA.l $004204
	SEP #$20
	LDA.b #84
	STA.l $004206
	REP #$20
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	LDA.l $004214
	STA.l !w_n
	JSR .axis
	JSR .sides
.rnext
	JSR .advance
	DEC !w_j
	BNE .run
.nextPass
	LDA.l !w_pass
	BNE +
	INC
	STA.l !w_pass
if defined("FX_TEST")
	JSR fx_test_vline
	STA.l !FXT_BOX+$BE           ; after the first pass
endif
	JMP .pass
+	RTS
.match                           ; C clear when cell k belongs to this pass
	LDA !w_k
	BEQ +
	LDA.l !w_pass                ; a spark: pass 0
	CMP.w #1
	RTS
+	LDA.l !w_pass                ; every third: pass 1
	EOR.w #$0001
	CMP.w #1
	RTS
.advance                         ; next cell on the 28 px grid
	LDA !w_d
	CLC
	ADC.w #28
	STA !w_d
	LDA !w_k
	INC
	CMP.w #3
	BCC +
	LDA.w #0
+	STA !w_k
	RTS
.axis                            ; axis point at d
	LDA !w_d
	JSR fx_scale_dir
	TXA
	CLC
	ADC !d_cur+!C_X
	STA !w_x
	TYA
	CLC
	ADC !d_cur+!C_Y
	STA !w_y
	RTS
.sides                           ; !w_n placements 84 px apart at +r, then -r
	LDA.w #84
	STA !d_rstep
	LDA !d_dx
	BEQ .svert
	LDA !w_x
	STA !d_x
	LDA !w_y
	CLC
	ADC !w_r
	STA !d_y
	LDA.l !w_n
	JSR fx_emit_run
	LDA !w_x
	STA !d_x
	LDA !w_y
	SEC
	SBC !w_r
	STA !d_y
	LDA.l !w_n
	JMP fx_emit_run
.svert
	LDA !w_y
	STA !d_y
	LDA !w_x
	CLC
	ADC !w_r
	STA !d_x
	LDA.l !w_n
	JSR fx_emit_run
	LDA !w_y
	STA !d_y
	LDA !w_x
	SEC
	SBC !w_r
	STA !d_x
	LDA.l !w_n
	JMP fx_emit_run
.orb
	dw !FX_SG_CHARGE_ORB, !FX_SG_GOLD_CHARGE_ORB
.spark
	dw !FX_SG_IMPACT_SPARK, !FX_SG_GOLD_SPARK
.arc
	dw !FX_SG_LIGHTNING, !FX_SG_GOLD_ARC
