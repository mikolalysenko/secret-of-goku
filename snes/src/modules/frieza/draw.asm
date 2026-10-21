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

; Dash afterimages (frieza.js draw(): frame 5 behind Frieza while each
; lives, 16 frames). The browser dithers each one (a third of its pixels in
; the ghost violet); here every other one (spawn parity, !af_par: at most
; three at a time, so their slivers leave Frieza's own on his lines; all six
; overran 34 slivers a line and the PPU then drops the first sprites',
; Frieza's) is drawn every frame, solid, in that dither's mean over the
; arena floor (generator: the ghost row of frieza_palettes). They need frame
; 5 resident and not about to be replaced (a pending upload into that
; buffer lands in this vblank), so they outlive the dash as in the browser.
; Each fully visible one is placed straight into the core's back area (as
; fx_emit does: one add of the generated, biased piece offsets per piece,
; frieza_ghost_pack; the native build cleared the high bits of those
; slots); one at a screen edge goes through core_oam_meta, which culls per
; piece.
fz_draw_afterimages:
	LDA !fz_spr_cnt                   ; Frieza drawn: his VRAM claim holds
	AND.w #$00FF
	BNE .drawn
.none
	RTS
.drawn
	; the buffer holding frame 5, if no upload targets it this vblank
	LDA !fz_spr_buf
	AND.w #$0001
	STA !fz_t0                        ; displayed buffer
	LDA.w #5
	ORA !fz_atlas
	CMP !fz_spr_res0
	BNE +
	LDX.w #0
	BRA .found
+	CMP !fz_spr_res1
	BNE .none
	LDX.w #1
.found
	CPX !fz_t0
	BEQ +                             ; the displayed one stays
	LDA !fz_spr_pend
	CMP.w #$FFFF
	BNE .none                         ; the back buffer is being refilled
+	LDA.w #!FZ_TILE_BUF0|$3000        ; base word: piece 0's tile, priority 3,
	CPX.w #0                          ; the ghost palette (with the first one
	BEQ +                             ; drawn) and facing Goku (mirrored)
	LDA.w #!FZ_TILE_BUF1|$3000
+	STA !fz_t3
	LDA !fz_t7
	BEQ +
	LDA.w #$4000
	TSB !fz_t3
+	; tables of this atlas and mirror ((atlas * 2 + mirror): 16 bytes of
	; offsets, 8 of bounds)
	LDA !fz_atlas
	LSR
	LSR
	LSR
	ORA !fz_t7
	ASL
	ASL
	ASL
	STA !fz_t4                        ; bounds
	ASL
	STA !fz_t6                        ; offsets
	; the descriptor: piece count (and the pieces, for edge cases)
	LDA.w #5
	ORA !fz_atlas
	ASL
	TAX
	LDA.l frieza_frame_table,X
	TAX
	LDA.l !DATA_FRIEZA+2,X
	AND.w #$00FF
	STA !fz_t5                        ; pieces
	INX
	INX
	INX
	STX !fz_t2                        ; piece list (bank !DATA_FRIEZA)
	LDX.w #(!FZ_AFTER_N-1)*6
.loop
	STX !fz_sx_i
	LDA.l !FZ_AFTER+!af_age,X         ; alive ($FF none) and of the drawn
	AND.w #$01FF                      ; half (!af_par, bit 8 here)
	CMP.w #$00FF
	BCS .next
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
	LDA !fz_spr_pal2                  ; the second palette, once one is drawn
	AND.w #$00FF
	CMP.w #$00FF
	BNE +
	JSR fz_spr_palette2
	LDA !fz_spr_pal2
	AND.w #$0007
	XBA
	ASL
	TSB !fz_t3
+	JSR fz_ghost_put
.next
	LDA !fz_sx_i
	SEC
	SBC.w #6
	TAX
	BPL .loop
	RTS

; One afterimage at (!fz_spr_x, !fz_spr_y): !fz_t3 base word, !fz_t4 / t6
; bounds / offsets of the tables, !fz_t5 pieces, !fz_t2 the piece list.
fz_ghost_put:
	; every piece inside x 0-255, y 0-223 (no high bits, no wrap)?
	LDX !fz_t4
	LDA !fz_spr_x
	CLC
	ADC.l frieza_ghost_box,X
	BMI .edge0
	LDA !fz_spr_x
	CLC
	ADC.l frieza_ghost_box+2,X
	CMP.w #241
	BCS .edge0
	LDA !fz_spr_y
	CLC
	ADC.l frieza_ghost_box+4,X
	BMI .edge0
	LDA !fz_spr_y
	CLC
	ADC.l frieza_ghost_box+6,X
	CMP.w #209
	BCC .room
.edge0
	JMP .edge
.room
	; room behind the natives for all its pieces (core_oam_meta's rule: the
	; staged front sprites keep their rounded reservation)
	LDA.w !core_oam_front_n&$FFFF
	CLC
	ADC.w #3
	AND.w #$FFFC
	ASL
	ASL
	CLC
	ADC.w !core_oam_cursor&$FFFF
	STA !fz_t1
	LDA !fz_t5
	ASL
	ASL
	CLC
	ADC !fz_t1
	CMP.w !core_oam_limit&$FFFF
	BEQ +
	BCS .edge0                        ; (what fits, piece by piece)
+	; K = (y - 128) << 8 | (x - 128): each offset + K is OAM bytes 0-1
	LDA !fz_spr_y
	SEC
	SBC.w #128
	XBA
	AND.w #$FF00
	STA !fz_t0
	LDA !fz_spr_x
	SEC
	SBC.w #128
	CLC
	ADC !fz_t0
	STA !fz_t0
	LDA !fz_t3
	STA !fz_t1                        ; tile word of piece 0 (+2 a piece)
	LDA !fz_t5
	STA !fz_m0                        ; pieces left
	LDX !fz_t6
	LDY.w !core_oam_cursor&$FFFF
-	LDA.l frieza_ghost_pack,X
	CLC
	ADC !fz_t0
	STA.w $0800,Y
	LDA !fz_t1
	STA.w $0802,Y
	INC
	INC
	STA !fz_t1
	INX
	INX
	INY
	INY
	INY
	INY
	DEC !fz_m0
	BNE -
	TYA
	STA.w !core_oam_cursor&$FFFF
	RTS
.edge
	LDA !fz_t3
	STA.l !core_spr_tile
	LDA !fz_spr_x
	STA.l !core_spr_x
	LDA !fz_spr_y
	STA.l !core_spr_y
	LDA.w #(!DATA_FRIEZA&$FFFF)
	CLC
	ADC !fz_t2
	STA.l !core_meta_ptr
	SEP #$20
	LDA.b #!DATA_FRIEZA>>16
	STA.l !core_meta_ptr+2
	REP #$20
	LDA !fz_t7
	AND.w #$0001
	TAX                               ; mirror
	LDA !fz_t5
	JSL core_oam_meta
	RTS

; The surge's lightning and aura; the riposte's coil and sparks.
fz_draw_surge:
	LDA.l !fzs_surge
	AND.w #$00FF
	BEQ .riposte
	; lightning on even frames at (bx -/+ 16, by - 18), frame t >> 3
	LDA.l !core_frame
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
