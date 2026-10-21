; The space fight's sprites (engine/frieza-orbit-view.js draw with
; orbit-effects.js). OAM is front to back, so the browser's paint order is
; reversed: hit bursts, Frieza's warning and shots, Goku's ki, his wave and
; hand charge, Frieza, Goku, ricochets; the stars follow (scene.asm).
; DB = $32 (low WRAM, so the OAM buffer at $0800, is visible), M16/X16.

; ---------------------------------------------------------------------------
; One OAM entry at !o_slot: !d_x, !d_y (signed), !d_ta (tile | attributes),
; !d_big (0: 16x16, 1: 32x32). Entries entirely off screen are skipped.
ofx_put:
	LDX.w !o_slot
	CPX.w #$0200
	BCC +
	RTS
+
	LDA.w #16
	LDY.w !d_big
	BEQ +
	LDA.w #32
+	DEC
	STA.w !d_t7                    ; size - 1
	CLC : ADC.w !d_x
	BMI .done                      ; right edge left of the screen
	LDA.w !d_x
	CMP.w #256
	BPL .done
	LDA.w !d_t7
	CLC : ADC.w !d_y
	BMI .done
	LDA.w !d_y
	CMP.w #224
	BPL .done
	SEP #$20
	LDA.w !d_x : STA.w $0800,X
	LDA.w !d_y : STA.w $0801,X
	REP #$20
	LDA.w !d_ta : STA.w $0802,X
	; high table: bit 0 = x bit 8, bit 1 = large
	LDA.w !d_big
	ASL
	BIT.w !d_x
	BPL +
	ORA.w #$0001
+	CMP.w #$0000
	BEQ .next
	STA.w !d_t6
	TXA
	LSR : LSR : LSR : LSR
	TAY                            ; high table byte
	TXA
	LSR : LSR
	AND.w #$0003
	ASL : ASL
	ORA.w !d_t6
	TAX                            ; pair * 4 + bits
	SEP #$20
	LDA.w $0A00,Y
	ORA.l ofx_hibits,X
	STA.w $0A00,Y
	REP #$20
	LDX.w !o_slot
.next
	TXA
	CLC : ADC.w #$0004
	STA.w !o_slot
.done
	RTS

ofx_hibits:
	db $00,$01,$02,$03, $00,$04,$08,$0C, $00,$10,$20,$30, $00,$40,$80,$C0

; Clear the high-table bits of every slot from !o_slot on (the native
; sprites before it keep theirs): mask the first byte, zero the next and
; fill the rest of the 32 bytes with an overlapping block move.
ofx_clear_hi:
	LDA.w !o_slot
	LSR : LSR : LSR : LSR
	TAY                            ; high-table byte of the first slot
	LDA.w !o_slot
	LSR : LSR
	AND.w #$0003
	TAX
	SEP #$20
	LDA.w $0A00,Y
	AND.l .keep,X
	STA.w $0A00,Y
	REP #$20
	INY
	CPY.w #32
	BCS .done
	SEP #$20
	LDA.b #$00
	STA.w $0A00,Y
	REP #$20
	CPY.w #31
	BCS .done
	STY.w !d_t0
	LDA.w #30
	SEC : SBC.w !d_t0              ; bytes after this one, minus 1
	PHA
	TYA
	CLC : ADC.w #$0A00
	TAX                            ; source: the zeroed byte
	INC
	TAY                            ; destination: the next one
	PLA
	PHB
	MVN $7E,$7E
	PLB
.done
	RTS
.keep
	db $00,$03,$0F,$3F

; A 16x16 stamp centred at (A16 = x, X16 = y) with tile|attr Y16
; (orbit-effects.js stamp: the cell's top left at round(x) - 8).
ofx_stamp:
	SEC : SBC.w #8
	STA.w !d_x
	TXA
	SEC : SBC.w #8
	STA.w !d_y
	STY.w !d_ta
	STZ.w !d_big
	JMP ofx_put

; round(a * b / 256) as Math.round (halves up): A16 = a (|a| < 1024),
; X16 = b (8.8, |b| <= 256).
ofx_mulr:
	STA.w !m_t0
	STX.w !m_t1
	EOR.w !m_t1
	STA.w !m_t2                    ; sign of the product
	LDA.w !m_t0
	JSR orbit_abs
	STA.w !m_t3                    ; |a|
	TXA
	JSR orbit_abs
	CMP.w #$0100
	BCC +
	LDA.w !m_t3                    ; |b| = 256: |a| exactly
	BRA .sign
+	STA.w !m_t1                    ; |b|
	SEP #$20
	LDA.w !m_t1 : STA.w $4202
	LDA.w !m_t3 : STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	STA.w !m_t4                    ; |a| low byte * |b|
	SEP #$20
	LDA.w !m_t3+1 : STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	STA.w !m_t5                    ; |a| high byte * |b| (whole pixels)
	LDA.w !m_t2
	BMI .neg
	LDA.w !m_t4
	CLC : ADC.w #128
	XBA : AND.w #$00FF
	CLC : ADC.w !m_t5
	RTS
.neg
	LDA.w !m_t4
	CLC : ADC.w #127
	XBA : AND.w #$00FF
	CLC : ADC.w !m_t5
	EOR.w #$FFFF : INC
	RTS
.sign
	BIT.w !m_t2
	BPL +
	EOR.w #$FFFF : INC
+	RTS

; ---------------------------------------------------------------------------
fight_draw:
	LDA.w !f_on
	BNE +
	RTS
+	LDA.w !fn_phase
	BEQ +
	JMP fc_draw                    ; the finale's own picture (fdraw.asm)
+	JSR fd_beam_wants
	JSR aura_wants
	JSR fd_hits
	JSR fd_warning
	JSR fd_boss_shots
	JSR fd_ki
	JSR fd_wave
	JSR fd_charge
	JSR fd_frieza
	LDA.w !f_age                   ; (Frieza's aura behind him, in front of Goku)
	JSR aura_draw_frieza
	JSR fd_goku
	LDA.w !f_age
	JSR aura_draw_goku
	JMP fd_ricochets

; o.hits: fx.burst (three Exploder bursts four frames apart) and, for three
; frames, the impact spark.
fd_hits:
	LDX.w #(!HIT_N-1)*6
.hit
	LDA.w !FS_HITS+4,X
	CMP.w #54
	BCS .next
	STX.w !d_hit
	CMP.w #3
	BCS +
	ASL
	TAX
	LDA.l .sparks,X
	TAY
	LDX.w !d_hit
	LDA.w !FS_HITS+2,X
	PHA
	LDA.w !FS_HITS+0,X
	PLX
	JSR ofx_stamp
	LDX.w !d_hit
+	LDA.w !FS_HITS+0,X
	STA.w !d_t2
	LDA.w !FS_HITS+2,X
	STA.w !d_t3
	LDA.w !FS_HITS+4,X
	LDY.w #3
	JSR fd_burst
	LDX.w !d_hit
.next
	TXA : SEC : SBC.w #$0006 : TAX
	BPL .hit
	RTS
.sparks
	dw !OFX_SPARK_0|(!OFX_PAL_BLUE<<9)|!OA_PRI
	dw !OFX_SPARK_1|(!OFX_PAL_BLUE<<9)|!OA_PRI
	dw !OFX_SPARK_2|(!OFX_PAL_BLUE<<9)|!OA_PRI

; fx.burst at (!d_t2, !d_t3), age A16, Y16 = sub-bursts (3 small, 9 large):
; the age's OAM entries (orbit-fx.mjs, extended data orbit_burst: the
; Exploder frames, 32x32 where four parts fill the square, at their
; sub-bursts' offsets, mirrors and order), at priority d_pri (fd_burst:
; over the globe; scenery's impacts enter at fd_burst_at with 0).
assert !OFX_BURST_S_PRI == !OA_PRI, "the small bursts' priority (orbit-fx.mjs)"
fd_burst:
	PHA
	LDA.w #!OA_PRI
	STA.w !d_pri
	PLA
fd_burst_at:
	CPY.w #9
	BEQ .large
	CMP.w #!OFX_BURST_S_AGES
	BCC .entries
	RTS
.large
	CMP.w #!OFX_BURST_L_AGES
	BCC +
	RTS
+	CLC : ADC.w #!OFX_BURST_S_AGES  ; (the large burst's ages follow)
.entries
	ASL : ASL : ASL : ASL          ; (16 bytes an age)
	TAX
	LDA.l !XDATA_ORBIT_BURST+2,X
	BNE +
	RTS
+	STA.w !m_t7                    ; entries
	; wholly on the screen (every top left at x 0-255, y -31-223) with room
	; for all: the packed entries and the high-table bytes as they are
	LDA.l !XDATA_ORBIT_BURST+8,X
	CLC : ADC.w !d_t2
	BMI .slow
	STA.w !m_t5                    ; the base's x
	LDA.l !XDATA_ORBIT_BURST+10,X
	CLC : ADC.w !d_t2
	CMP.w #256
	BCS .slow
	LDA.l !XDATA_ORBIT_BURST+12,X
	CLC : ADC.w !d_t3
	STA.w !m_t6                    ; its y
	CLC : ADC.w #31
	BMI .slow
	LDA.l !XDATA_ORBIT_BURST+14,X
	CLC : ADC.w !d_t3
	CMP.w #224
	BPL .slow
	LDA.w !m_t7
	ASL : ASL
	CLC : ADC.w !o_slot
	CMP.w #$0201
	BCC .fast
.slow
	LDA.l !XDATA_ORBIT_BURST,X
	TAX                            ; the first's offset
	LDY.w !o_slot
	JMP .e
.fast
	LDA.w !m_t6
	XBA
	AND.w #$FF00
	ORA.w !m_t5
	STA.w !m_t5                    ; base: x | y << 8
	; the high-table bytes for the first slot's place (0-3): the first one
	; ORed (earlier entries share it), the rest stored
	LDA.w !o_slot
	AND.w #$000C
	CLC : ADC.l !XDATA_ORBIT_BURST+6,X
	STA.w !d_t4                    ; its bytes' offset
	LDA.w !o_slot
	LSR : LSR
	AND.w #$0003
	CLC : ADC.w !m_t7
	CLC : ADC.w #3
	LSR : LSR
	STA.w !d_t5                    ; bytes
	LDA.l !XDATA_ORBIT_BURST+4,X
	STA.w !d_t6                    ; the packed entries' offset
	LDA.w !o_slot
	LSR : LSR : LSR : LSR
	TAY
	LDX.w !d_t4
	SEP #$20
	LDA.l !XDATA_ORBIT_BURST,X
	ORA.w $0A00,Y
	STA.w $0A00,Y
-	DEC.w !d_t5
	BEQ +
	INX
	INY
	LDA.l !XDATA_ORBIT_BURST,X
	STA.w $0A00,Y
	BRA -
+	REP #$20
	; the entries (their priority in them: orbit-fx.mjs), two at a time
	LDX.w !d_t6
	LDY.w !o_slot
	LDA.w !m_t7
	LSR
	STA.w !m_t7                    ; pairs
	BCC .f
	LDA.l !XDATA_ORBIT_BURST,X     ; (an odd one first)
	CLC : ADC.w !m_t5
	STA.w $0800,Y
	LDA.l !XDATA_ORBIT_BURST+2,X
	STA.w $0802,Y
	INX : INX : INX : INX
	INY : INY : INY : INY
	LDA.w !m_t7
	BEQ .fdone
.f
	LDA.l !XDATA_ORBIT_BURST,X
	CLC : ADC.w !m_t5
	STA.w $0800,Y
	LDA.l !XDATA_ORBIT_BURST+2,X
	STA.w $0802,Y
	LDA.l !XDATA_ORBIT_BURST+4,X
	CLC : ADC.w !m_t5
	STA.w $0804,Y
	LDA.l !XDATA_ORBIT_BURST+6,X
	STA.w $0806,Y
	TXA
	CLC : ADC.w #8
	TAX
	TYA
	CLC : ADC.w #8
	TAY
	DEC.w !m_t7
	BNE .f
.fdone
	STY.w !o_slot
	RTS
.e
	CPY.w #$0200
	BCS .done
	; x on the screen: -31 <= x <= 255 (a 16x16 left of -15 is set but
	; unseen), y: -31 <= y <= 223
	LDA.l !XDATA_ORBIT_BURST+0,X
	CLC : ADC.w !d_t2
	STA.w !m_t5
	CLC : ADC.w #31
	CMP.w #256+31
	BCS .skip
	LDA.l !XDATA_ORBIT_BURST+2,X
	CLC : ADC.w !d_t3
	STA.w !m_t6
	CLC : ADC.w #31
	CMP.w #224+31
	BCS .skip
	SEP #$20
	LDA.w !m_t5 : STA.w $0800,Y
	LDA.w !m_t6 : STA.w $0801,Y
	REP #$20
	LDA.l !XDATA_ORBIT_BURST+4,X
	ORA.w !d_pri
	STA.w $0802,Y
	; high table: 32x32 (2), left of the screen (x's bit 8: 1)
	LDA.l !XDATA_ORBIT_BURST+6,X
	BIT.w !m_t5
	BPL +
	ORA.w #1
+	CMP.w #$0000
	BEQ +
	JSR fd_hibits
+	INY : INY : INY : INY
.skip
	TXA
	CLC : ADC.w #8
	TAX
	DEC.w !m_t7
	BNE .e
.done
	STY.w !o_slot
.none
	RTS

; OR the high-table bits A16 (1 x's bit 8, 2 large) into the OAM entry at
; Y16 (its offset). Keeps X, Y.
fd_hibits:
	PHX
	STA.w !m_t4
	TYA
	LSR : LSR
	AND.w #$0003
	ASL : ASL
	ORA.w !m_t4
	TAX                            ; pair * 4 + bits
	LDA.l ofx_hibits,X
	AND.w #$00FF
	STA.w !m_t4
	TYA
	LSR : LSR : LSR : LSR
	TAX                            ; its high-table byte
	SEP #$20
	LDA.w $0A00,X
	ORA.w !m_t4
	STA.w $0A00,X
	REP #$20
	PLX
	RTS

; Frieza's warning: the growing Death Ball over him, the pink charge of a
; beam, the finger glint of a laser, a disc over his head.
fd_warning:
	LDA.w !w_kind
	BNE +
	RTS
+	CMP.w #!WK_ORB
	BNE .notOrb
	; size 16 + 16 * floor(age * 2 / wait): 16 for the first half, then 32
	LDA.w !w_age
	ASL
	CMP.w !w_wait
	BCS .big
	JSR fd_death_frame16
	LDA.w !b_x : SEC : SBC.w #8 : STA.w !d_x
	LDA.w !b_y : SEC : SBC.w #18 : STA.w !d_y
	LDA.w #!OV_D16|(!OFX_PAL_PINK<<9)|!OA_PRI
	STA.w !d_ta
	STZ.w !d_big
	JMP ofx_put
.big
	JSR fd_death_frame32
	LDA.w !b_x : SEC : SBC.w #16 : STA.w !d_x
	LDA.w !b_y : SEC : SBC.w #26 : STA.w !d_y
	LDA.w #!OV_D32|(!OFX_PAL_PINK<<9)|!OA_PRI
	STA.w !d_ta
	LDA.w #$0001
	STA.w !d_big
	JMP ofx_put
.notOrb
	CMP.w #!WK_BEAM
	BNE .notBeam
	; charge(b.x - 8, b.y + 4, age / wait, pink): frame floor(4 age / wait)
	LDA.w !w_age
	ASL : ASL
	STA.w $4204
	SEP #$20
	LDA.w !w_wait
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	CMP.w #5
	BCC +
	LDA.w #4
+	ASL
	TAX
	LDA.l .pcharge,X
	TAY
	LDA.w !b_y
	CLC : ADC.w #4
	TAX
	LDA.w !b_x
	SEC : SBC.w #8
	JMP ofx_stamp
.notBeam
	CMP.w #!WK_LASER
	BNE .disc
	JSR fight_finger               ; X = x, Y = y
	PHY
	LDA.w !f_age
	JSR fd_finger_tile
	TAY
	TXA
	PLX
	JMP ofx_stamp
.disc
	LDA.w !b_y
	SEC : SBC.w #9
	TAX
	LDA.w !f_age
	TAY
	LDA.w !b_x
	JMP fd_disc
.pcharge
	dw !OFX_PCHARGE_0|(!OFX_PAL_PINK<<9)|!OA_PRI
	dw !OFX_PCHARGE_1|(!OFX_PAL_PINK<<9)|!OA_PRI
	dw !OFX_PCHARGE_2|(!OFX_PAL_PINK<<9)|!OA_PRI
	dw !OFX_PCHARGE_3|(!OFX_PAL_PINK<<9)|!OA_PRI
	dw !OFX_PCHARGE_4|(!OFX_PAL_PINK<<9)|!OA_PRI

; A16 = age -> A16 = the finger glint's tile word (charge-orb (age>>3)&1).
fd_finger_tile:
	AND.w #$0008
	BNE +
	LDA.w #!OFX_FINGER_0|(!OFX_PAL_PINK<<9)|!OA_PRI
	RTS
+	LDA.w #!OFX_FINGER_1|(!OFX_PAL_PINK<<9)|!OA_PRI
	RTS

; The Death Ball frame shared by every orb and warning this frame:
; (space age >> 3) % 12 (the browser animates each orb by its own age).
fd_death_frame:
	LDA.w !f_age
	LSR : LSR : LSR
	STA.w $4204
	SEP #$20
	LDA.b #12
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4216
	RTS
fd_death_frame32:
	JSR fd_death_frame
	STA.w !v_d32
	RTS
fd_death_frame16:
	JSR fd_death_frame
	STA.w !v_d16
	RTS

; disc(x, y, age): A16 = x, X16 = y, Y16 = age. Tilt [0, 1, 0, -1] by
; (age >> 3) & 3; 32x16 from (x - 16, y - 8).
fd_disc:
	STA.w !d_t0
	STX.w !d_t1
	TYA
	LSR : LSR
	AND.w #$0006
	TAX
	LDA.l .left,X
	STA.w !d_t2
	LDA.l .right,X
	STA.w !d_t3
	STZ.w !d_big
	LDA.w !d_t1
	SEC : SBC.w #8
	STA.w !d_y
	LDA.w !d_t0
	SEC : SBC.w #16
	STA.w !d_x
	LDA.w !d_t2
	STA.w !d_ta
	JSR ofx_put
	LDA.w !d_t1
	SEC : SBC.w #8
	STA.w !d_y
	LDA.w !d_t0
	STA.w !d_x
	LDA.w !d_t3
	STA.w !d_ta
	JMP ofx_put
.left
	dw !OFX_DISC_00|(!OFX_PAL_PINK<<9)|!OA_PRI, !OFX_DISC_P0|(!OFX_PAL_PINK<<9)|!OA_PRI
	dw !OFX_DISC_00|(!OFX_PAL_PINK<<9)|!OA_PRI, !OFX_DISC_M0|(!OFX_PAL_PINK<<9)|!OA_PRI
.right
	dw !OFX_DISC_01|(!OFX_PAL_PINK<<9)|!OA_PRI, !OFX_DISC_P1|(!OFX_PAL_PINK<<9)|!OA_PRI
	dw !OFX_DISC_01|(!OFX_PAL_PINK<<9)|!OA_PRI, !OFX_DISC_M1|(!OFX_PAL_PINK<<9)|!OA_PRI

; Frieza's shots: orbs (32 px Death Balls), discs, lasers (finger glint at
; the origin; the line itself with the beams), beams (pink orb at the
; origin; the band with the beams).
fd_boss_shots:
	LDA.w !o_slot
	PHA
	LDX.w #$0002                   ; Frieza's beam or laser band
	JSR beam_draw
	PLA
	JSR fd_laser_hit
	LDX.w #(!BS_N-1)*16
.shot
	STX.w !d_hit
	LDA.w !FS_BOSS+!bs_kind,X
	BNE +
	JMP .next
+
	LDA.w !FS_BOSS+!bs_age,X
	CMP.w #330
	BCS .next
	LDA.w !FS_BOSS+!bs_kind,X
	CMP.w #!WK_ORB
	BNE .notOrb
	JSR fd_death_frame32
	LDX.w !d_hit
	LDA.w !FS_BOSS+!bs_x,X : SEC : SBC.w #16 : STA.w !d_x
	LDA.w !FS_BOSS+!bs_y,X : SEC : SBC.w #16 : STA.w !d_y
	LDA.w #!OV_D32|(!OFX_PAL_PINK<<9)|!OA_PRI
	STA.w !d_ta
	LDA.w #$0001
	STA.w !d_big
	JSR ofx_put
	BRA .next
.notOrb
	CMP.w #!WK_DISC
	BNE .notDisc
	LDA.w !FS_BOSS+!bs_age,X
	TAY
	LDA.w !FS_BOSS+!bs_y,X
	PHA
	LDA.w !FS_BOSS+!bs_x,X
	PLX
	JSR fd_disc
	BRA .next
.notDisc
	CMP.w #!WK_LASER
	BNE .beam
	LDA.w !FS_BOSS+!bs_age,X
	CMP.w #16
	BCS .next
	JSR fd_finger_tile
	TAY
	LDA.w !FS_BOSS+!bs_y,X
	PHA
	LDA.w !FS_BOSS+!bs_x,X
	PLX
	JSR ofx_stamp
	BRA .next
.beam
	LDA.w !FS_BOSS+!bs_age,X
	CMP.w #42
	BCS .next
	LDY.w #!OFX_PORB_4|(!OFX_PAL_PINK<<9)|!OA_PRI
	LDA.w !FS_BOSS+!bs_y,X
	PHA
	LDA.w !FS_BOSS+!bs_x,X
	PLX
	JSR ofx_stamp
.next
	LDX.w !d_hit
	TXA : SEC : SBC.w #$0010 : TAX
	BMI +
	JMP .shot
+
	RTS

; The finger laser across the screen, its hit's bursts, Frieza and Goku
; pass the PPU's 34 slivers a line on the laser's lines, and the bursts,
; first in OAM, lost theirs. The laser's cells under the freshest hit
; (younger than 24 frames, the bursts at their fullest), their middle
; within 16 pixels of it, are hidden: the bursts cover the laser there.
; A16 = o_slot before the laser's run (beam_copy_run aligns it to 16).
fd_laser_hit:
	CLC : ADC.w #15
	AND.w #$FFF0
	STA.w !d_t6                    ; the run's first entry
	LDA.w !bw_key+2
	CMP.w #$FFFF
	BEQ .out
	AND.w #!BK_LASER
	BEQ .out
	; the freshest hit
	LDA.w #24
	STA.w !d_t7
	LDY.w #$FFFF
	LDX.w #(!HIT_N-1)*6
-	LDA.w !FS_HITS+4,X
	CMP.w !d_t7
	BCS +
	STA.w !d_t7
	TXY
+	TXA
	SEC : SBC.w #6
	TAX
	BPL -
	CPY.w #$FFFF
	BEQ .out
	LDA.w !FS_HITS+0,Y
	STA.w !d_t0                    ; hit x
	LDA.w !FS_HITS+2,Y
	STA.w !d_t1                    ; hit y
	LDX.w !d_t6
.cell
	CPX.w !o_slot
	BCS .out
	; the hit's line within the cell's 32
	LDA.w $0801,X
	AND.w #$00FF
	CMP.w #224
	BCS .next                      ; (hidden)
	STA.w !d_t2
	LDA.w !d_t1
	SEC : SBC.w !d_t2
	CMP.w #32
	BCS .next
	; the cell's middle within 16 of the hit: x + 16 - hit x in -16..16
	JSR fd_oam_x
	CLC : ADC.w #16+16
	SEC : SBC.w !d_t0
	CMP.w #33
	BCS .next
	SEP #$20
	LDA.b #$E0
	STA.w $0801,X
	REP #$20
.next
	INX : INX : INX : INX
	BRA .cell
.out
	RTS

; A16 = the x of the OAM entry at X16 (8 bits and the high table's bit 8,
; signed). Keeps X.
fd_oam_x:
	PHX
	TXA
	LSR : LSR
	AND.w #$0003
	ASL
	STA.w !d_t3                    ; (entry within its high-table byte) * 2
	TXA
	LSR : LSR : LSR : LSR
	TAY
	LDA.w $0A00,Y
	LDY.w !d_t3
-	DEY
	BMI +
	LSR
	BRA -
+	AND.w #$0001
	XBA
	STA.w !d_t3                    ; $0100 when bit 8
	PLX
	LDA.w $0800,X
	AND.w #$00FF
	ORA.w !d_t3
	CMP.w #$0100
	BCC +
	ORA.w #$FE00                   ; (256-511: negative)
+	RTS

; Goku's ki blasts: charge-orb frame 1.
fd_ki:
	LDX.w #(!FS_N-1)*8
.shot
	LDA.w !FS_SHOTS+6,X
	CMP.w #31
	BCS .next
	STX.w !d_hit
	LDY.w #!OFX_ORB_1|(!OFX_PAL_BLUE<<9)|!OA_PRI
	LDA.w !FS_SHOTS+2,X
	PHA
	LDA.w !FS_SHOTS+0,X
	PLX
	JSR ofx_stamp
	LDX.w !d_hit
.next
	TXA : SEC : SBC.w #$0008 : TAX
	BPL .shot
	RTS

; Goku's wave: the charge orb (frame 4) at his palms; the band follows with
; the beams.
fd_wave:
	LDA.w !fb_on
	BNE +
	RTS
+	LDX.w #$0000
	JSR beam_draw
	LDY.w #!OFX_ORB_4|(!OFX_PAL_BLUE<<9)|!OA_PRI
	LDX.w !fb_y
	LDA.w !fb_x
	JMP ofx_stamp

; This frame's beam bands (frieza-orbit-view.js ray / deathBeam): Goku's
; wave (group 0) and Frieza's laser, else his youngest beam (group 1); the
; band colour frames.
fd_beam_wants:
	LDA.w !f_age
	LSR : LSR
	AND.w #$0001
	STA.w !v_band
	STA.w !v_pband
	STZ.w !v_pmode
	; Goku's wave: w = max(2, round(width * envelope / 2) * 2)
	LDX.w #$0000
	LDA.w !fb_on
	BNE +
	JSR beam_off
	BRA .frieza
+	LDA.w !fb_x : STA.w !bw_x
	LDA.w !fb_y : STA.w !bw_y
	LDA.w !fb_head : STA.w !bg_tmp
	JSR fd_wave_width8
	JSR fd_band_radius
	STA.w !bg_tmp+2
	STZ.w !bg_tmp+4
	LDA.w #350 : STA.w !bg_tmp+6
	LDA.w #(!OFX_PAL_BLUE<<9)|!OA_PRI : STA.w !bg_tmp+8
	LDX.w #$0000
	JSR beam_want
.frieza
	; the laser in flight, else the youngest beam
	LDA.w #$FFFF
	STA.w !d_t0                    ; chosen shot
	LDX.w #(!BS_N-1)*16
-	LDA.w !FS_BOSS+!bs_kind,X
	CMP.w #!WK_LASER
	BNE +
	LDA.w !FS_BOSS+!bs_age,X
	CMP.w #16
	BCS +
	STX.w !d_t0
	JMP .laser
+	TXA : SEC : SBC.w #$0010 : TAX
	BPL -
	LDA.w #999
	STA.w !d_t1
	LDX.w #(!BS_N-1)*16
-	LDA.w !FS_BOSS+!bs_kind,X
	CMP.w #!WK_BEAM
	BNE +
	LDA.w !FS_BOSS+!bs_age,X
	CMP.w #42
	BCS +
	CMP.w !d_t1
	BCS +
	STA.w !d_t1
	STX.w !d_t0
+	TXA : SEC : SBC.w #$0010 : TAX
	BPL -
	LDX.w !d_t0
	BPL .beam
	LDX.w #$0002
	JMP beam_off
.beam
	LDA.w !FS_BOSS+!bs_x,X : STA.w !bw_x+2
	LDA.w !FS_BOSS+!bs_y,X : STA.w !bw_y+2
	LDA.w !FS_BOSS+!bs_head,X : STA.w !bg_tmp
	; width 12 min(1, age/6, (42-age)/8) in 8.8: 512 age, 384 (42-age)
	LDA.w !FS_BOSS+!bs_age,X
	STA.w !d_t2
	XBA : LSR                      ; 128 age
	ASL : ASL                      ; 512 age
	CMP.w #3072
	BCC +
	LDA.w #3072
+	STA.w !d_t3
	LDA.w #42
	SEC : SBC.w !d_t2
	SEP #$20
	STA.w $4202
	LDA.b #192
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	ASL                            ; 384 (42 - age)
	CMP.w !d_t3
	BCS +
	STA.w !d_t3
+	LDA.w !d_t3
	JSR fd_band_radius
	STA.w !bg_tmp+2
	STZ.w !bg_tmp+4
	; length min(360, age * 30)
	LDA.w !d_t2
	SEP #$20
	STA.w $4202
	LDA.b #30
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	CMP.w #360
	BCC +
	LDA.w #360
+	STA.w !bg_tmp+6
	LDA.w #(!OFX_PAL_PINK<<9)|!OA_PRI : STA.w !bg_tmp+8
	LDX.w #$0002
	JMP beam_want
.laser
	LDA.w !FS_BOSS+!bs_x,X : STA.w !bw_x+2
	LDA.w !FS_BOSS+!bs_y,X : STA.w !bw_y+2
	LDA.w !FS_BOSS+!bs_head,X : STA.w !bg_tmp
	LDA.w !FS_BOSS+!bs_age,X
	LSR : LSR
	AND.w #$0001
	STA.w !v_pband
	LDA.w #$0001
	STA.w !v_pmode
	STA.w !bg_tmp+2                ; R 1
	STA.w !bg_tmp+4                ; laser
	LDA.w #350 : STA.w !bg_tmp+6
	LDA.w #(!OFX_PAL_PINK<<9)|!OA_PRI : STA.w !bg_tmp+8
	LDX.w #$0002
	JMP beam_want

; A16 = width in 8.8 -> A16 = max(2, round(width / 2) * 2).
fd_band_radius:
	CLC : ADC.w #256
	XBA : AND.w #$00FF
	LSR
	ASL
	CMP.w #2
	BCS +
	LDA.w #2
+	RTS

; Goku's wave width (8.8) times min(1, age/6, (max-age)/10).
fd_wave_width8:
	LDA.w !fb_age
	CMP.w #6
	BCS .full
	; fb_width * age / 6
	LDA.w !fb_width
	STA.w $4204
	SEP #$20
	LDA.b #6
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214                    ; fb_width / 6
	STA.w !d_t3
	LDA.w #0
	LDX.w !fb_age
	BEQ +
-	CLC : ADC.w !d_t3
	DEX
	BNE -
+	BRA .tail
.full
	LDA.w !fb_width
.tail
	STA.w !d_t3
	LDA.w !fb_max
	SEC : SBC.w !fb_age
	CMP.w #10
	BCS .done
	; (max - age) / 10 * fb_width: (fb_width / 10) * (max - age)
	STA.w !d_t4
	LDA.w !fb_width
	STA.w $4204
	SEP #$20
	LDA.b #10
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	STA.w !d_t5
	LDA.w #0
	LDX.w !d_t4
	BEQ +
-	CLC : ADC.w !d_t5
	DEX
	BNE -
+	CMP.w !d_t3
	BCS .done
	RTS
.done
	LDA.w !d_t3
	RTS

; The hand charge while L+Y builds the wave: charge-orb frame
; floor(charge * 4 / 45) sampled 2:1, at the charge cell's hand socket.
fd_charge:
	LDA.w !f_charge
	BNE +
	RTS
+	ASL : ASL
	STA.w $4204
	SEP #$20
	LDA.b #45
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	ASL
	TAX
	LDA.l .tiles,X
	STA.w !d_t4
	JSR fd_facing
	ASL
	TAX
	LDA.l orbit_charge_hand+1,X
	AND.w #$00FF
	CMP.w #$0080
	BCC + : ORA.w #$FF00
+	CLC : ADC.w !f_hy
	PHA
	LDA.l orbit_charge_hand,X
	AND.w #$00FF
	CMP.w #$0080
	BCC + : ORA.w #$FF00
+	CLC : ADC.w !f_hx
	PLX
	LDY.w !d_t4
	JMP ofx_stamp
.tiles
	dw !OFX_CHARGE_0|(!OFX_PAL_BLUE<<9)|!OA_PRI
	dw !OFX_CHARGE_1|(!OFX_PAL_BLUE<<9)|!OA_PRI
	dw !OFX_CHARGE_2|(!OFX_PAL_BLUE<<9)|!OA_PRI
	dw !OFX_CHARGE_3|(!OFX_PAL_BLUE<<9)|!OA_PRI
	dw !OFX_CHARGE_4|(!OFX_PAL_BLUE<<9)|!OA_PRI

; orbit-duel.js orbitFacing: sheet row of the heading -> A16 (0 down,
; 1 left, 2 right, 3 up).
fd_facing:
	LDA.w !f_heading
	AND.w #$000F
	TAX
	LDA.l .rows,X
	AND.w #$00FF
	RTS
.rows
	db 2,2,0,0,0,0,1,1,1,1,3,3,3,3,2,2

; Frieza: the muscular sheet at half size (frame: pointing 2, hurt 6,
; warning 3, rushing/side-stepping/exchanging 5, else 4), facing Goku or
; the laser's side; an impact spark while he blinks out.
fd_frieza:
	LDA.w !b_blink
	BEQ .body
	EOR.w #$FFFF
	SEC : ADC.w #6                 ; 6 - blink
	ASL
	TAX
	LDA.l fd_spark_tiles,X
	TAY
	LDX.w !b_y
	LDA.w !b_x
	JMP ofx_stamp
.body
	; pointer pose: a laser warning, or a laser younger than 16 frames
	STZ.w !d_t0                    ; flip
	LDA.w !w_kind
	CMP.w #!WK_LASER
	BNE .shot
	LDA.w !w_tx
	CMP.w !b_x
	BEQ +
	BMI +
	INC.w !d_t0
+	LDA.w #2
	BRA .frame
.shot
	LDX.w #(!BS_N-1)*16
-	LDA.w !FS_BOSS+!bs_kind,X
	CMP.w #!WK_LASER
	BNE +
	LDA.w !FS_BOSS+!bs_age,X
	CMP.w #16
	BCS +
	LDA.w !FS_BOSS+!bs_head,X       ; flip when the shot heads right (dx > 0)
	JSR orbit_vec
	TXA
	BEQ ++
	BMI ++
	INC.w !d_t0
++	LDA.w #2
	BRA .frame
+	TXA : SEC : SBC.w #$0010 : TAX
	BPL -
	; facing Goku
	LDA.w !b_x
	CMP.w !f_hx
	BEQ +
	BMI +
	INC.w !d_t0
+	LDA.w #6
	LDX.w !b_hurt
	BNE .frame
	LDA.w #3
	LDX.w !w_kind
	BNE .frame
	LDA.w #5
	LDX.w !b_dash
	BNE .frame
	LDX.w !b_evn
	BNE .frame
	LDX.w !f_duel
	BNE .frame
	LDA.w #4
.frame
	ASL
	ORA.w !d_t0                    ; cells: frame * 2 + flip, 512 bytes each
	XBA
	ASL
	CLC : ADC.w #!OSP_FRIEZA_0
	STA.w !v_frieza
	LDA.w !b_x : SEC : SBC.w #12 : STA.w !d_x
	LDA.w !b_y : SEC : SBC.w #12 : STA.w !d_y
	LDA.w #!OV_FRIEZA|(!OFX_PAL_FRIEZA<<9)|!OA_PRI
	STA.w !d_ta
	LDA.w #$0001
	STA.w !d_big
	JMP ofx_put

fd_spark_tiles:
	dw !OFX_SPARK_0|(!OFX_PAL_BLUE<<9)|!OA_PRI
	dw !OFX_SPARK_1|(!OFX_PAL_BLUE<<9)|!OA_PRI
	dw !OFX_SPARK_2|(!OFX_PAL_BLUE<<9)|!OA_PRI
	dw !OFX_SPARK_3|(!OFX_PAL_BLUE<<9)|!OA_PRI
	dw !OFX_SPARK_4|(!OFX_PAL_BLUE<<9)|!OA_PRI
	dw !OFX_SPARK_5|(!OFX_PAL_BLUE<<9)|!OA_PRI

; Goku at 16x16 (charge 18, focus 21, wave 20, punch 12 / kick 16 late in
; an exchange, flying 36-39 every 5 frames, idle 34) on his facing row; an
; impact spark while Instant Transmission hides him.
fd_goku:
	LDA.w !f_teleport
	CMP.w #7
	BCC .body
	; spark frame floor((12 - teleport) / 2) mod 6
	EOR.w #$FFFF
	SEC : ADC.w #12
	CMP.w #$8000
	ROR
	CLC : ADC.w #6
	CMP.w #6
	BCC +
	SEC : SBC.w #6
+	ASL
	TAX
	LDA.l fd_spark_tiles,X
	TAY
	LDX.w !f_hy
	LDA.w !f_hx
	JMP ofx_stamp
.body
	LDA.w #!OPOSE_CHARGE
	LDX.w !f_charge
	BNE .pose
	LDA.w #!OPOSE_FOCUS
	LDX.w !f_focus
	BEQ +
	LDX.w !fb_on
	BEQ .pose
+	LDA.w #!OPOSE_BEAM
	LDX.w !fb_on
	BNE .pose
	LDA.w !f_punch
	BEQ .move
	LDA.w #!OPOSE_PUNCH
	LDX.w !f_duel
	BEQ .pose
	LDA.w !f_duel
	AND.w #$7FFF
	CMP.w #55
	LDA.w #!OPOSE_PUNCH
	BCC .pose
	LDA.w #!OPOSE_KICK
	BRA .pose
.move
	LDA.w #!OPOSE_IDLE
	LDX.w !f_moving
	BEQ .pose
	LDA.w !f_age                   ; 36 + floor(age / 5) % 4
	STA.w $4204
	SEP #$20
	LDA.b #5
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	AND.w #$0003
	CLC : ADC.w #!OPOSE_FLY0
.pose
	ASL : ASL
	STA.w !d_t0
	JSR fd_facing
	CLC : ADC.w !d_t0              ; pose * 4 + row
	XBA
	LSR                            ; * 128
	CLC : ADC.w #!OSP_GOKU_IDLE_0
	STA.w !v_goku
	LDA.w !f_hx : SEC : SBC.w #8 : STA.w !d_x
	LDA.w !f_hy : SEC : SBC.w #8 : STA.w !d_y
	LDA.w #!OV_GOKU|(1<<9)|!OA_PRI
	STA.w !d_ta
	STZ.w !d_big
	JMP ofx_put

; Ricochets flying into the distance: 12 px a frame, shown for 28 frames
; (charge-orb frame 0, gold for Frieza's).
fd_ricochets:
	LDX.w #(!RIC_N-1)*8
.ric
	LDA.w !FS_RIC+6,X
	AND.w #$00FF
	CMP.w #28
	BCS .next
	STX.w !d_hit
	STA.w !d_t0
	ASL
	CLC : ADC.w !d_t0
	ASL : ASL                      ; distance = age * 12
	STA.w !d_t0
	LDA.w !FS_RIC+4,X
	JSR orbit_vec                  ; X = vx, Y = vy
	STY.w !d_t1
	LDA.w !d_t0
	JSR ofx_mulr
	LDX.w !d_hit
	CLC : ADC.w !FS_RIC+0,X
	STA.w !d_t2
	LDA.w !d_t0
	LDX.w !d_t1
	JSR ofx_mulr
	LDX.w !d_hit
	CLC : ADC.w !FS_RIC+2,X
	STA.w !d_t3
	LDY.w #!OFX_ORB_0|(!OFX_PAL_BLUE<<9)|!OA_PRI
	LDA.w !FS_RIC+7,X
	AND.w #$00FF
	CMP.w #1
	BNE +
	LDY.w #!OFX_GORB_0|(!OFX_PAL_GOLD<<9)|!OA_PRI
+	LDX.w !d_t3
	LDA.w !d_t2
	JSR ofx_stamp
	LDX.w !d_hit
.next
	TXA : SEC : SBC.w #$0008 : TAX
	BPL .ric
	RTS
