; Kind renderers, called inside fx_frame's direct-page frame. Each draws the
; current effect (!d_cur, screen coordinates; !C_T = age for spawned kinds,
; the client clock for draws). Scratch: !d_ks (16 bytes) and the direction
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
	STA !d_ks                     ; group
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
	LDA !d_ks
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
	LDA !d_ks
	JSR fx_stamp
	LDX.w #7
	LDY.w #-3
	JSR fx_at
	LDA !d_cur+!C_T
	LSR
	TAX
	LDY.w #$0000
	LDA !d_ks
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
	STA !d_ks                     ; group
	LDA !d_cur+!C_DIR
	JSR fx_set_dir
	LDA !d_cur+!C_T              ; distance = min(range, (age+1)*14)
	INC
	STA !d_ks+2
	ASL
	ASL
	ASL
	ASL
	SEC
	SBC !d_ks+2
	SBC !d_ks+2
	CMP !d_cur+!C_A
	BCC +
	LDA !d_cur+!C_A
+	STA !d_ks+2                   ; front distance
	STZ !d_ks+4                   ; i
.loop
	LDA !d_ks+4                   ; d = distance - 7i
	ASL
	ASL
	ASL
	SEC
	SBC !d_ks+4
	EOR.w #$FFFF
	SEC
	ADC !d_ks+2
	JSR fx_scale_dir
	JSR fx_at
	LDA.w #3
	SEC
	SBC !d_ks+4
	TAX
	LDY !d_turn
	LDA !d_ks
	JSR fx_stamp
	INC !d_ks+4
	LDA !d_ks+4
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
	LDA !d_ks
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
	STA !d_ks+14
	LDA !d_cur+!C_T
	CMP.w #14
	BCC +
	RTS
+	LDA !d_cur+!C_KIND
	AND.w #!FX_F_GOLD<<8
	BEQ +
	INC !d_ks+14
+	LDA !d_ks+14                  ; ((R16 ? 2 : 0) + gold) * 14 + age
	ASL
	ASL
	ASL
	ASL
	SEC
	SBC !d_ks+14
	SBC !d_ks+14
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
	LDA !d_cur+!C_A
	AND.w #$0002
	BEQ fx_explode_one
	; dungeon-demolition.js brazierBurst: three Exploder animations (delay,
	; offset, turn) = (0, 0,-8, 0), (8, -10,2, 3), (12, 10,2, 1).
	LDX.w #$0000
.burst
	PHX
	LDA !d_cur+!C_T
	SEC
	SBC.l .delay,X
	BMI .skip
	CMP.w #42
	BCS .skip
	STA !d_ks+2                  ; this burst's age
	LDA.l .turn,X
	STA !d_ks+4
	LDA.l .dy,X
	TAY
	LDA.l .dx,X
	TAX
	JSR fx_at
	LDA !d_ks+2
	LDX.w #$0000                 ; frame = age / 6
-	CMP.w #6
	BCC +
	SBC.w #6
	INX
	BRA -
+	TXA
	ASL
	ASL
	ASL                          ; (frame*2 + 0)*4
	CLC
	ADC !d_ks+4
	CLC
	ADC.w #!FX_ASM_BURST
	JSR fx_emit
.skip
	PLX
	INX
	INX
	CPX.w #6
	BCC .burst
	RTS
.delay
	dw 0, 8, 12
.dx
	dw 0, -10, 10
.dy
	dw -8, 2, 2
.turn
	dw 0, 3, 1
fx_explode_one:
	LDA !d_cur+!C_T
	LDX.w #$0000                 ; frame = age / 6
-	CMP.w #6
	BCC +
	SBC.w #6
	INX
	BRA -
+	TXA
	ASL                          ; (frame*2 + mirror)*4 + turn
	STA !d_ks
	LDA !d_cur+!C_A
	AND.w #$0001
	ORA !d_ks
	ASL
	ASL
	STA !d_ks
	LDA !d_cur+!C_DIR
	AND.w #$0003
	CLC
	ADC !d_ks
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
	STA !d_ks
	LDA !d_cur+!C_DIR
	AND.w #$0007
	ORA !d_ks
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
	STA !d_ks
	LDA !d_cur+!C_DIR
	AND.w #$0003
	CLC
	ADC !d_ks
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
	STA !d_ks
	ASL
	ASL
	ASL
	SEC
	SBC !d_ks
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
;---------------------------------------------------------------------------
; FX_DEBRIS: chunks in the caller's colours (DYN palette), behind the
; natives. Style 0 rubble (sprite-layer.js rubble(): !C_A >> 8 chunks of
; size 2/3 on ballistic arcs), style 1 ceiling dust (ceiling-escape.js: 20
; chunks of size 2-4 spreading on the golden angle). !C_B seed, !C_T age.
!dbr_n   = !d_ks+$0           ; chunks left
!dbr_i   = !d_ks+$2           ; chunk index
!dbr_h   = !d_ks+$4           ; hash
!dbr_vx  = !d_ks+$6           ; x speed (1/8 px per frame), signed
!dbr_dx  = !d_ks+$8           ; offset from the effect
!dbr_dy  = !d_ks+$A
!dbr_t   = !d_ks+$C
!dbr_s   = !d_ks+$E           ; sign scratch
fx_k_debris:
	LDA.w #$0000
	JSR fx_depth
	LDA !d_cur+!C_A
	AND.w #$0001
	BEQ +
	JMP fx_debris_dust
+	LDA !d_cur+!C_A
	XBA
	AND.w #$00FF
	STA !dbr_n
	STZ !dbr_i
.chunk
	; h = xorshift(seed + i*71)
	LDA !dbr_i
	ASL
	ASL
	ASL
	SEC
	SBC !dbr_i                   ; i*7
	STA !dbr_t
	LDA !dbr_i
	ASL
	ASL
	ASL
	ASL
	ASL
	ASL                          ; i*64
	CLC
	ADC !dbr_t
	CLC
	ADC !d_cur+!C_B
	STA !dbr_h
	ASL
	ASL
	ASL
	ASL
	ASL
	ASL
	ASL
	EOR !dbr_h
	STA !dbr_h
	XBA
	AND.w #$00FF
	LSR
	EOR !dbr_h
	STA !dbr_h
	XBA
	AND.w #$FF00
	EOR !dbr_h
	STA !dbr_h
	; vx = (h_hi * 25 >> 8) - 12, x offset = (h_lo * 15 >> 8) - 7
	XBA
	AND.w #$00FF
	LDX.w #25
	JSR fx_mul8
	XBA
	AND.w #$00FF
	SEC
	SBC.w #12
	STA !dbr_vx
	LDA !dbr_h
	AND.w #$00FF
	LDX.w #15
	JSR fx_mul8
	XBA
	AND.w #$00FF
	SEC
	SBC.w #7
	STA !dbr_dx
	; dx += vx*age/8
	LDA !dbr_vx
	STA !dbr_s
	BPL +
	EOR.w #$FFFF
	INC
+	LDX !d_cur+!C_T
	JSR fx_mul8
	LSR
	LSR
	LSR
	BIT !dbr_s
	BPL +
	EOR.w #$FFFF
	INC
+	CLC
	ADC !dbr_dx
	STA !dbr_dx
	; dy = -5 + age*(age - 22 - 3i)/10
	LDA !dbr_i
	ASL
	ADC !dbr_i
	CLC
	ADC.w #22
	EOR.w #$FFFF
	SEC
	ADC !d_cur+!C_T              ; t = age - 22 - 3i
	STA !dbr_s
	BPL +
	EOR.w #$FFFF
	INC
+	LDX !d_cur+!C_T
	JSR fx_mul8                  ; age*|t|
	LDX.w #10
	JSR fx_div8
	BIT !dbr_s
	BPL +
	EOR.w #$FFFF
	INC
+	SEC
	SBC.w #5
	STA !dbr_dy
	CLC
	ADC !d_cur+!C_Y              ; below line 208: not drawn
	CMP.w #209
	BPL .next
	; size (i&1)+2, turn (age>>3)+i: assembly (size-2)*3 + turn%3
	LDA !d_cur+!C_T
	LSR
	LSR
	LSR
	CLC
	ADC !dbr_i
-	CMP.w #3
	BCC +
	SBC.w #3
	BRA -
+	STA !dbr_t
	LDA !dbr_i
	AND.w #$0001
	STA !dbr_s
	ASL
	ADC !dbr_s
	CLC
	ADC !dbr_t
	CLC
	ADC.w #!FX_ASM_RUBBLE
	PHA
	LDX !dbr_dx
	LDY !dbr_dy
	JSR fx_at
	PLA
	JSR fx_emit
.next
	INC !dbr_i
	DEC !dbr_n
	BEQ +
	JMP .chunk
+	RTS

; Ceiling dust: 20 chunks on precomputed paths (fx_dust_xy, the browser's
; rounded positions per age and chunk); size 2 + i%3, turn (age>>2) + i.
fx_debris_dust:
	LDA !d_cur+!C_T
	CMP.w #46
	BCC +
	RTS
+	ASL                          ; age * 20 chunks * 4 bytes
	ASL
	STA !dbr_t
	ASL
	ASL
	CLC
	ADC !dbr_t
	ASL
	ASL
	STA !dbr_h                   ; offset of this age's row
	STZ !dbr_n                   ; position in the drawing order
.chunk
	LDX !dbr_n                   ; chunks sharing a cell in a row (the set-up
	LDA.l .order,X               ; assembly is placed again without setup)
	AND.w #$00FF
	STA !dbr_i
	ASL
	ASL
	CLC
	ADC !dbr_h
	TAX
	LDA.l fx_dust_xy+2,X
	TAY
	LDA.l fx_dust_xy,X
	TAX
	JSR fx_at
	LDX !dbr_i                   ; size 2 + i%3 -> (i%3)*8
	LDA.l .size,X
	AND.w #$00FF
	STA !dbr_s
	LDA !d_cur+!C_T              ; gap pattern: two of the eight turns, so
	LSR                          ; the twenty chunks need at most six cells
	LSR                          ; of the VRAM cache (fifteen)
	CLC
	ADC !dbr_i
	AND.w #$0001
	ASL
	ASL
	ORA !dbr_s
	CLC
	ADC.w #!FX_ASM_DUST
	JSR fx_emit
	INC !dbr_n
	LDA !dbr_n
	CMP.w #20
	BCC .chunk
	RTS
.order                           ; i grouped by i % 6 (size i % 3, turn parity)
	db 0, 6, 12, 18, 1, 7, 13, 19, 2, 8, 14, 3, 9, 15, 4, 10, 16, 5, 11, 17
.size
	for i = 0..20
		db (!i%3)*8
	endfor

; A (0-255) * X (0-255) -> A. M16/X16.
fx_mul8:
	SEP #$20
	STA.l $004202
	TXA
	STA.l $004203
	REP #$20
	NOP
	NOP
	NOP
	LDA.l $004216
	RTS

; A (16-bit) * X (0-255) -> A (low 16 bits).
fx_mul16x8:
	PHA
	SEP #$20
	STA.l $004202
	TXA
	STA.l $004203                ; low byte * X
	REP #$20
	NOP
	NOP
	NOP
	LDA.l $004216
	STA !d_tmp+6
	PLA
	XBA
	SEP #$20
	STA.l $004202
	TXA
	STA.l $004203                ; high byte * X
	REP #$20
	NOP
	NOP
	NOP
	LDA.l $004216
	XBA
	AND.w #$FF00
	CLC
	ADC !d_tmp+6
	RTS

; A (16-bit) / X (1-255) -> A. M16/X16.
fx_div8:
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
	LDA.l $004214
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
+	STA !d_ks
	LDA !d_cur+!C_A
	CMP.w #25
	BCS +
	LDA.w #!FX_ASM_DEATH16
	BRA ++
+	LDA.w #!FX_ASM_DEATH32
++	CLC
	ADC !d_ks
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
	STA !d_ks
	LDA !d_cur+!C_DIR
	AND.w #$0003
	CLC
	ADC !d_ks
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
+	STA !d_ks+2                   ; bands
	LDA !d_cur+!C_KIND
	BIT.w #!FX_F_SSJ<<8
	BEQ +
	INC !d_ks+2
	INC !d_ks+2
+	LDA.w #$0000                 ; band set 0: blue
	JMP fx_beam_strips

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
+	STA !d_ks+2
	LDA !d_cur+!C_KIND
	AND.w #$007F
	CMP.w #!FX_BEAM_FIRE
	LDA.w #1                     ; pink
	BCC +
	LDA.w #2                     ; fire
+	JMP fx_beam_strips

; FX_BEAM_LASER (orbit-effects.js deathBeam: beam(...,1,age,'pink')): the
; Death Beam from the finger (X/Y) in 16 headings (!C_DIR with
; FX_F_HEADING, else the facing), !C_A reach, !C_T age; colour frame
; (age >> 2) & 1; the finger glint on top. Headings 0 / 8 are three lines
; across the screen, a polygon when it is free; otherwise 16x16 windows
; step along the beam (fx.mjs: window 0 at the finger, then the body
; window), behind the natives.
fx_b_laser:
	LDA !d_cur+!C_KIND
	BIT.w #!FX_F_HEADING<<8
	BNE +
	LDA !d_cur+!C_DIR
	AND.w #$0003
	TAX
	LDA.l .face,X
	BRA ++
+	LDA !d_cur+!C_DIR
++	AND.w #$000F
	STA !d_ks                    ; heading
	LDA !d_cur+!C_T
	LSR
	LSR
	AND.w #$0001
	STA !d_ks+2                  ; colour frame
	JSR fx_k_finger
	LDA !d_ks
	AND.w #$0007
	BNE .obj
	JSR fx_poly_laser
	PHP
	LDA.w #$FFFF                 ; the builder used !d_tiles
	STA !d_lasta
	PLP
	BCS .obj
	RTS
.obj
	LDA.w #$0000                 ; behind the natives
	JSR fx_depth
	LDA !d_ks                    ; FX_ASM_LASER + ((h&3)*2 + frame)*8 + h/4
	AND.w #$0003
	ASL
	ORA !d_ks+2
	ASL
	ASL
	ASL
	STA !d_ks+4
	LDA !d_ks
	LSR
	LSR
	CLC
	ADC !d_ks+4
	ADC.w #!FX_ASM_LASER
	STA !d_ks+4                  ; window 0; the body window is 4 on
	LDA !d_ks                    ; step (signed bytes)
	ASL
	TAX
	LDA.l fx_laser_step,X
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	STA !d_ks+6
	LDA.l fx_laser_step+1,X
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	STA !d_ks+8
	LDA !d_ks                    ; body windows: reach / step length
	AND.w #$0003
	ASL
	TAX
	LDA.l fx_laser_len,X         ; quarter pixels
	TAX
	LDA !d_cur+!C_A
	ASL
	ASL
	JSR fx_div8
	STA !d_ks+$A
	LDX.w #$0000
	LDY.w #$0000
	JSR fx_at
	LDA !d_ks+4
	JSR fx_emit
	LDA !d_ks+4
	CLC
	ADC.w #4
	STA !d_ks+4
.window
	LDA !d_ks+$A
	BEQ .done
	DEC !d_ks+$A
	LDA !d_x
	CLC
	ADC !d_ks+6
	STA !d_x
	LDA !d_y
	CLC
	ADC !d_ks+8
	STA !d_y
	; stop once the beam has left the screen for good
	LDA !d_x
	BPL +
	CMP.w #-32
	BCS ++
	LDA !d_ks+6
	BEQ .done
	BMI .done
	BRA ++
+	CMP.w #288
	BCC ++
	LDA !d_ks+6
	BPL .done
++	LDA !d_y
	BPL +
	CMP.w #-32
	BCS ++
	LDA !d_ks+8
	BEQ .done
	BMI .done
	BRA ++
+	CMP.w #256
	BCC ++
	LDA !d_ks+8
	BPL .done
++	LDA !d_ks+4
	JSR fx_emit
	BRA .window
.done
	RTS
.face                            ; facing (down, right, left, up) -> heading
	db 4, 0, 8, 12

; Strip beam: A = band set (0 blue, 1 pink, 2 fire), !d_ks+2 bands.
fx_beam_strips:
	STA !d_ks+4                   ; set
	LDA !d_ks+2
	CMP.w #8
	BCC +
	LDA.w #7
	STA !d_ks+2
+	LDA !d_cur+!C_DIR
	JSR fx_set_dir
	LDA !d_cur+!C_T              ; phase
	LSR
	STA !d_ks+6
	; Head (blue / pink sets) and orb, in front unless the beam points up.
	LDA.w #!FX_E_FRONT
	JSR fx_depth
	JSR fx_depth_up
	LDA !d_ks+4
	CMP.w #2
	BCS .noHead
	LDA !d_cur+!C_A
	JSR fx_scale_dir
	JSR fx_at
	LDA !d_ks+4
	ASL
	TAX
	LDA.l .head,X
	LDX !d_ks+6
	LDY !d_turn
	JSR fx_stamp
.noHead
	LDX.w #$0000
	LDY.w #$0000
	JSR fx_at
	LDA !d_ks+4
	ASL
	TAX
	LDA.l .orb,X
	LDX.w #4
	LDY.w #$0000
	JSR fx_stamp
	; Left / right: the strip rows as a polygon (poly.asm), no sprites.
	LDA !d_dy
	BNE .obj
	JSR fx_poly_strip
	PHP
	LDA.w #$FFFF                 ; the builder used !d_tiles
	STA !d_lasta
	PLP
	BCS .obj
	RTS
.obj
	; Strips behind the natives.
	LDA.w #$0000
	JSR fx_depth
	LDA !d_ks+4                   ; fx_band_index[((set*2 + frame)*7 + bands-1)*4 + turn]
	ASL
	STA !d_ks
	LDA !d_ks+6
	AND.w #$0001
	ORA !d_ks
	STA !d_ks
	ASL
	ASL
	ASL
	SEC
	SBC !d_ks                     ; *7
	CLC
	ADC !d_ks+2
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
	LDA !d_dy                    ; a row of strips across the screen: leave
	BNE +                        ; the natives on its lines their slivers
	LDA !d_y
	JSR fx_row_room
	CMP $01,S
	BCS +
	STA $01,S                    ; fewer strips: the far end goes first
+	PLA
	BEQ .done
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
	STA !d_ks+2
	LDA.w #$0000
	JMP fx_beam_strips

; giantBeam's edge cells: for d = 18 + (phase*7)%28, every 28 px below
; min(length, 360), on both sides at radius(d) - 2: impact sparks, every
; third one a Thunderbolt cell (Final Flash: gold sparks / gold arcs),
; frame phase % 2, turned along the beam; charge orb frame 4 at the palms.
; Two passes (sparks, then the third cells) each set one assembly up. Cells
; in the taper are placed one by one; past it every residue class of the
; 28 px grid is a run 84 px apart on each side (fx_emit_run's fast path).
!fxw_d    = !d_ks+$0             ; distance along the beam
!fxw_k    = !d_ks+$2             ; (floor(d/28) + phase) % 3 at w_d
!fxw_lim  = !d_ks+$4             ; min(length, 360)
!fxw_ph   = !d_ks+$6             ; phase
!fxw_r    = !d_ks+$8             ; radius(d) - 2
!fxw_x    = !d_ks+$A             ; axis point at w_d
!fxw_y    = !d_ks+$C
!fxw_j    = !d_ks+$E             ; residue classes left
!fxw_hw   = !fx_e+$0            ; (SRAM scratch, free while drawing)
!fxw_t    = !fx_e+$2
!fxw_dt   = !fx_e+$4
!fxw_pass = !fx_e+$6            ; 0: the sparks, 1: the Thunderbolt / arc cells
!fxw_gold = !fx_e+$8            ; 0 blue, 2 gold (table offset)
!fxw_n    = !fx_e+$A            ; placements in the run
fx_wave_edges:
	LDA !d_cur+!C_DIR
	JSR fx_set_dir
	LDA !d_cur+!C_T
	LSR
	STA !fxw_ph
	LDA !d_cur+!C_KIND
	AND.w #$0003
	CMP.w #!FX_BEAM_FINAL
	BNE +
	LDA.w #2
	BRA ++
+	LDA.w #0
++	STA.l !fxw_gold
	LDA !d_cur+!C_B              ; geometry as fx_poly_beam
	CMP.w #256
	BCC +
	LDA.w #255
+	STA.l !fxw_hw
	LDA !d_cur+!C_C
	BNE +
	LDA.w #44
+	CMP.w #9
	BCS +
	LDA.w #9
+	CMP.w #256
	BCC +
	LDA.w #255
+	STA.l !fxw_t
	SEC
	SBC.w #8
	STA.l !fxw_dt
	; Orb at the palms, in front unless the beam points up.
	LDA.w #!FX_E_FRONT
	JSR fx_depth
	JSR fx_depth_up
	LDX.w #$0000
	LDY.w #$0000
	JSR fx_at
	LDA.l !fxw_gold
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
+	STA !fxw_lim
	LDA.w #$0000
	STA.l !fxw_pass
.pass
	LDA.l !fxw_gold                ; this pass's assembly, set up once
	TAX
	LDA.l !fxw_pass
	BNE +
	LDA.l .spark,X
	BRA ++
+	LDA.l .arc,X
++	PHA
	LDA !fxw_ph
	AND.w #$0001
	TAX
	PLA
	LDY !d_turn
	JSR fx_stamp_id
	JSR fx_emit_setup
	BCC +
	JMP .nextPass
+	LDA !fxw_ph                    ; d = 18 + 7 * (phase & 3)
	AND.w #$0003
	STA !fxw_d
	ASL
	ASL
	ASL
	SEC
	SBC !fxw_d
	CLC
	ADC.w #18
	STA !fxw_d
	CMP.w #28
	LDA.w #$0000
	ROL                          ; floor(d / 28)
	CLC
	ADC !fxw_ph
-	CMP.w #3
	BCC +
	SBC.w #3
	BRA -
+	STA !fxw_k
.taper                           ; cells inside the taper, one by one
	LDA !fxw_d
	CMP !fxw_lim
	BCC +
	JMP .nextPass
+	CMP.l !fxw_dt
	BCS .runs
	JSR .match
	BCS .tnext
	LDA !fxw_d                     ; radius = hw * (d + 8) / taper
	CLC
	ADC.w #8
	TAX
	SEP #$20
	LDA.l !fxw_hw
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
	LDA.l !fxw_t
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
+	STA !fxw_r
	JSR .axis
	LDA.w #1
	STA.l !fxw_n
	JSR .sides
.tnext
	JSR .advance
	JMP .taper
.runs                            ; past the taper: the full radius
	LDA.l !fxw_hw
	SEC
	SBC.w #2
	BPL +
	LDA.w #$0000
+	STA !fxw_r
	LDA.w #3
	STA !fxw_j
.run
	LDA !fxw_d
	CMP !fxw_lim
	BCS .nextPass
	JSR .match
	BCS .rnext
	LDA !fxw_lim                   ; placements: ceil((lim - d) / 84)
	SEC
	SBC !fxw_d
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
	STA.l !fxw_n
	JSR .axis
	JSR .sides
.rnext
	JSR .advance
	DEC !fxw_j
	BNE .run
.nextPass
	LDA.l !fxw_pass
	BNE +
	INC
	STA.l !fxw_pass
if defined("FX_TEST")
	JSR fx_test_vline
	STA.l !FXT_BOX+$BE           ; after the first pass
endif
	JMP .pass
+	RTS
.match                           ; C clear when cell k belongs to this pass
	LDA !fxw_k
	BEQ +
	LDA.l !fxw_pass                ; a spark: pass 0
	CMP.w #1
	RTS
+	LDA.l !fxw_pass                ; every third: pass 1
	EOR.w #$0001
	CMP.w #1
	RTS
.advance                         ; next cell on the 28 px grid
	LDA !fxw_d
	CLC
	ADC.w #28
	STA !fxw_d
	LDA !fxw_k
	INC
	CMP.w #3
	BCC +
	LDA.w #0
+	STA !fxw_k
	RTS
.axis                            ; axis point at d
	LDA !fxw_d
	JSR fx_scale_dir
	TXA
	CLC
	ADC !d_cur+!C_X
	STA !fxw_x
	TYA
	CLC
	ADC !d_cur+!C_Y
	STA !fxw_y
	RTS
.sides                           ; !fxw_n placements 84 px apart at +r, then -r
	LDA.w #84
	STA !d_rstep
	LDA !d_dx
	BEQ .svert
	LDA !fxw_x
	STA !d_x
	LDA !fxw_y
	CLC
	ADC !fxw_r
	STA !d_y
	LDA.l !fxw_n
	JSR fx_emit_run
	LDA !fxw_x
	STA !d_x
	LDA !fxw_y
	SEC
	SBC !fxw_r
	STA !d_y
	LDA.l !fxw_n
	JMP fx_emit_run
.svert
	LDA !fxw_y
	STA !d_y
	LDA !fxw_x
	CLC
	ADC !fxw_r
	STA !d_x
	LDA.l !fxw_n
	JSR fx_emit_run
	LDA !fxw_y
	STA !d_y
	LDA !fxw_x
	SEC
	SBC !fxw_r
	STA !d_x
	LDA.l !fxw_n
	JMP fx_emit_run
.orb
	dw !FX_SG_CHARGE_ORB, !FX_SG_GOLD_CHARGE_ORB
.spark
	dw !FX_SG_IMPACT_SPARK, !FX_SG_GOLD_SPARK
.arc
	dw !FX_SG_LIGHTNING, !FX_SG_GOLD_ARC
