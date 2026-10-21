; The distant bodies' pictures and drawing (scenery.asm keeps their places).
; Pictures (orbit-scenery.mjs, extended data orbit_bodies; OBJ palette 0,
; priority 0: behind the Mode 7 globe, as the browser paints them before the
; planet, and before the stars in OAM): the planetoid in the four free fx
; cells $028-$02E (home B); the moon in beam slot 5 in the fight (Frieza's
; beams there take two chains at most) and in the clash in the Death Disc
; cells $1A0-$1A6 (home C: no discs fly in the clash); the outer planet in
; the 32 px Death Ball's slot $004 (home A) while no such ball shows, else
; in beam slot 4 while Frieza's beam leaves it free, else not drawn.
; DB = $32, M16/X16.

!SC_HOME_A_VRAM = $6000+($004*16)  ; the outer planet: 4 rows of 128 bytes
!SC_HOME_B_VRAM = $6000+($028*16)  ; the planetoid: 2 rows of 256 bytes
!SC_HOME_C_VRAM = $6000+($1A0*16)  ; the moon in the clash: 2 rows of 256 bytes
!SC_KEY = $A000                    ; beam-slot key of a body's picture ($A000 | index)

; Drawing (scene.asm, after the fight's own sprites and before the stars):
; the impacts (fx.burst large, behind the globe), then the bodies; while the
; battle's picture shows (the fight, the clash, the fall), not the pullback.
sc_draw_live:
	LDA.w !g_pull
	BNE +
	LDA.w !f_on
	ORA.w !od_on
	BNE sc_draw
+	RTS
sc_draw:
	JSR sc_wants
	; impacts: fd_burst (nine sub-bursts) at the shattered body's place,
	; its copy kept, at priority 0
	LDX.w #(!OSC_N-1)*2
.imp
	TXA : ASL : TAY
	LDA.w !sc_imp,Y
	BEQ .nextImp
	CMP.w #!OFX_BURST_L_AGES+1
	BCS .nextImp                   ; (its burst over: the impact only counts on)
	PHX
	LDA.w !sc_imp+2,Y              ; the copy's offsets (bytes: x, y)
	BNE .copy
	LDA.l !sc_pos+0,X
	STA.w !d_t2
	LDA.l !sc_pos+6,X
	STA.w !d_t3
	BRA .at
.copy
	AND.w #$00FF
	CMP.w #$0080 : BCC + : ORA.w #$FF00
+	STA.w !d_t0
	ASL : ASL
	CLC : ADC.w !d_t0              ; 5 n
	ASL : ASL : ASL : ASL : ASL : ASL ; 320 n
	CLC : ADC.l !sc_pos+0,X
	STA.w !d_t2
	LDA.w !sc_imp+3,Y
	AND.w #$00FF
	CMP.w #$0080 : BCC + : ORA.w #$FF00
+	STA.w !d_t0
	ASL : ASL : ASL
	CLC : ADC.w !d_t0              ; 9 n
	ASL : ASL : ASL : ASL : ASL    ; 288 n
	CLC : ADC.l !sc_pos+6,X
	STA.w !d_t3
.at
	STZ.w !d_pri                   ; (behind the globe)
	LDA.w !sc_imp,Y
	DEC                            ; its age
	LDY.w #9
	JSR fd_burst_at
	PLX
.nextImp
	DEX : DEX
	BPL .imp
	; the bodies
	LDA.w !sc_dead
	LSR
	BCS +
	JSR sc_draw_moon
+	LDA.w !sc_dead
	AND.w #$0002
	BNE +
	JSR sc_draw_outer
+	LDA.w !sc_dead
	AND.w #$0004
	BNE +
	JSR sc_draw_planetoid
+	RTS

; The moon: home C (the Death Disc cells, four 16x16) in the clash, beam
; slot 5 (32x32) in the fight; while its home holds a moon picture.
sc_draw_moon:
	LDX.w #0
	JSR sc_corner
	LDA.w !fn_phase
	BEQ .fight
	LDA.l !sc_have+4
	CMP.w #$FFFF
	BEQ .no
	LDA.w #$1A0|(!OFX_PAL_FIRE<<9)
	JMP sc_put_cells
.fight
	LDA.w !bs_have+10
	AND.w #$F000
	CMP.w #!SC_KEY
	BNE .no
	LDA.w #$084|(!OFX_PAL_FIRE<<9)
	JMP sc_put_big
.no
	RTS

; The outer planet: home A ($004) while no 32 px Death Ball is wanted, else
; beam slot 4 when it holds the outer planet's picture.
sc_draw_outer:
	LDX.w #2
	JSR sc_corner
	LDA.w !v_d32
	CMP.w #$FFFF
	BNE .slot
	LDA.l !sc_have
	CMP.w #$FFFF
	BEQ .no
	LDA.w #$004|(!OFX_PAL_FIRE<<9)
	JMP sc_put_big
.slot
	LDA.w !bs_have+8
	AND.w #$F000
	CMP.w #!SC_KEY
	BNE .no
	LDA.w #$080|(!OFX_PAL_FIRE<<9)
	JMP sc_put_big
.no
	RTS

; The planetoid: home B (the free fx cells, four 16x16).
sc_draw_planetoid:
	LDX.w #4
	JSR sc_corner
	LDA.l !sc_have+2
	CMP.w #$FFFF
	BEQ +
	LDA.w #$028|(!OFX_PAL_FIRE<<9)
	JMP sc_put_cells
+	RTS

; d_x, d_y = body X16's (* 2) top left: its centre - 16.
sc_corner:
	LDA.l !sc_pos+0,X
	SEC : SBC.w #16
	STA.w !d_x
	LDA.l !sc_pos+6,X
	SEC : SBC.w #16
	STA.w !d_y
	RTS

; A16 = tile word: a 32x32 at d_x, d_y; or four 16x16 cells side by side
; (tiles +0, +2, +4, +6) as the picture's quarters: all four at once while
; the square is on the screen (x 0-224, y 0-192: nothing clipped, no
; high-table bits) and four slots are left, else one at a time.
sc_put_big:
	STA.w !d_ta
	; on the screen (x 0-224, y 0-192) with a slot left: the entry and its
	; size bit at once
	LDA.w !d_x
	CMP.w #225
	BCS .one
	LDA.w !d_y
	CMP.w #193
	BCS .one
	LDX.w !o_slot
	CPX.w #$0200
	BCS .full
	XBA
	ORA.w !d_x                     ; x | y << 8
	STA.w $0800,X
	LDA.w !d_ta
	STA.w $0802,X
	TXA
	AND.w #$000C                   ; (its pair in the high-table byte, * 4)
	ORA.w #$0002                   ; (large)
	PHX
	TAX
	LDA.l ofx_hibits,X
	AND.w #$00FF
	STA.w !d_t6
	PLX
	TXA
	LSR : LSR : LSR : LSR
	TAX
	SEP #$20
	LDA.w $0A00,X
	ORA.w !d_t6
	STA.w $0A00,X
	REP #$20
	LDA.w !o_slot
	CLC : ADC.w #4
	STA.w !o_slot
.full
	RTS
.one
	LDA.w #$0001
	STA.w !d_big
	JMP ofx_put
sc_put_cells:
	STA.w !d_t0
	LDA.w !d_x
	CMP.w #225
	BCS .one
	LDA.w !d_y
	CMP.w #193
	BCS .one
	LDX.w !o_slot
	CPX.w #$0200-15
	BCS .one
	LDA.w !d_y
	XBA
	ORA.w !d_x                     ; x | y << 8
	STA.w $0800,X
	CLC : ADC.w #16
	STA.w $0804,X                  ; x + 16
	CLC : ADC.w #$1000-16
	STA.w $0808,X                  ; x, y + 16
	CLC : ADC.w #16
	STA.w $080C,X
	LDA.w !d_t0
	STA.w $0802,X
	INC : INC
	STA.w $0806,X
	INC : INC
	STA.w $080A,X
	INC : INC
	STA.w $080E,X
	TXA
	CLC : ADC.w #16
	STA.w !o_slot
	RTS
.one
	STZ.w !d_big
	LDA.w !d_t0
	STA.w !d_ta
	JSR ofx_put
	LDA.w !d_x : CLC : ADC.w #16 : STA.w !d_x
	LDA.w !d_t0 : CLC : ADC.w #2 : STA.w !d_ta
	JSR ofx_put
	LDA.w !d_x : SEC : SBC.w #16 : STA.w !d_x
	LDA.w !d_y : CLC : ADC.w #16 : STA.w !d_y
	LDA.w !d_t0 : CLC : ADC.w #4 : STA.w !d_ta
	JSR ofx_put
	LDA.w !d_x : CLC : ADC.w #16 : STA.w !d_x
	LDA.w !d_t0 : CLC : ADC.w #6 : STA.w !d_ta
	JMP ofx_put

; The pictures each home wants for this frame's radii (sc_want: A the outer
; planet at $004, B the planetoid, C the moon's cells), $FFFF when none.
sc_wants:
	; (only when the radii, the bodies, the Death Ball's slot or the phase
	; change)
	LDA.w !sc_dead
	AND.w #$0007
	XBA
	ORA.w !cam_r
	LDX.w !v_d32
	CPX.w #$FFFF
	BEQ +
	ORA.w #$0800
+	LDX.w !fn_phase
	BEQ +
	ORA.w #$1000
+	CMP.w !sc_wkey
	BNE +
	RTS
+	STA.w !sc_wkey
	STA.l !sc_nwant                ; (the vblank looks again)
	LDA.w #$FFFF
	STA.l !sc_want
	STA.l !sc_want+2
	STA.l !sc_want+4
	; home A: the outer planet while alive and no 32 px Death Ball wanted
	LDA.w !sc_dead
	AND.w #$0002
	BNE +
	LDA.w !v_d32
	CMP.w #$FFFF
	BNE +
	LDX.w #2
	LDA.w #!OSC_OUTER
	JSR sc_pic
	STA.l !sc_want
+	; home B: the planetoid
	LDA.w !sc_dead
	AND.w #$0004
	BNE +
	LDX.w #4
	LDA.w #!OSC_PLANETOID
	JSR sc_pic
	STA.l !sc_want+2
+	; home C: the moon in the clash
	LDA.w !sc_dead
	LSR
	BCS +
	LDA.w !fn_phase
	BEQ +
	LDX.w #0
	LDA.w #!OSC_MOON_CELLS
	JSR sc_pic
	STA.l !sc_want+4
+	RTS

; A16 = the picture of body X16 (* 2) for its radius: A16 (the set's first)
; + clamp(r - the set's first radius, 0, its last).
sc_pic:
	STA.w !d_t0
	LDA.l !sc_pos+12,X
	SEC : SBC.l .r0,X
	BPL +
	LDA.w #0
+	CMP.l .span,X
	BCC +
	LDA.l .span,X
	DEC
+	CLC : ADC.w !d_t0
	RTS
.r0	dw !OSC_MOON_CELLS_R0, !OSC_OUTER_R0, !OSC_PLANETOID_R0
.span	dw !OSC_MOON_CELLS_R1-!OSC_MOON_CELLS_R0+1, !OSC_OUTER_R1-!OSC_OUTER_R0+1, !OSC_PLANETOID_R1-!OSC_PLANETOID_R0+1

; Beam-slot pictures (beam_queue, after the auras'): the moon in slot 5 in
; the fight while Frieza's beam has no third chain, the outer planet in
; slot 4 while a 32 px Death Ball holds its own slot and Frieza's beam no
; second chain; while the queue has room.
sc_queue:
	LDA.w !f_on                    ; (only while the fight shows: not in the
	BEQ +                          ; second surge's cinematic, whose pullback's
	LDA.w !g_pull                  ; beam holds slots 3-5)
	BNE +
	LDA.l !orbit_mt
	BEQ ++
+	RTS
++	LDA.w !sc_dead
	LSR
	BCS .outer
	LDA.w !fn_phase
	BNE .outer
	LDA.w !bw_key+2
	CMP.w #$FFFF
	BEQ +
	LDA.w !bw_j+2
	CMP.w #2
	BCS .outer
+	LDX.w #0
	LDA.w #!OSC_MOON_BEAM
	JSR sc_pic
	LDY.w #10
	JSR sc_enqueue
.outer
	LDA.w !sc_dead
	AND.w #$0002
	BNE .out
	LDA.w !v_d32
	CMP.w #$FFFF
	BEQ .out
	LDA.w !bw_key+2
	CMP.w #$FFFF
	BEQ +
	LDA.w !bw_j+2
	BNE .out
+	LDX.w #2
	LDA.w #!OSC_OUTER
	JSR sc_pic
	LDY.w #8
	JMP sc_enqueue
.out
	RTS

; Picture A16 (an index in orbit_bodies) for beam slot Y16 (* 2), unless the
; slot holds it or the queue is full.
sc_enqueue:
	ORA.w #!SC_KEY
	CMP.w !bs_have,Y
	BEQ .out
	STA.w !d_t0
	LDA.w !bq_n
	CMP.w #4
	BCS .out
	ASL : ASL : ASL
	TAX
	TYA
	STA.w !BQ_E+0,X
	LDA.w !d_t0
	AND.w #$00FF
	XBA : ASL                      ; * 512
	CLC : ADC.w #(!XDATA_ORBIT_BODIES)&$FFFF
	STA.w !BQ_E+2,X
	LDA.w #(!XDATA_ORBIT_BODIES)>>16
	STA.w !BQ_E+4,X
	LDA.w !d_t0
	STA.w !BQ_E+6,X
	INC.w !bq_n
.out
	RTS

; Vblank (orbit_nmi_cells, after the beams' pictures): a home's wanted
; picture it lacks, one a vblank while there is room. Home A ($004) makes
; the 32 px Death Ball's record stale, so the ball comes back whole.
; M16/X16, DB = $32.
sc_nmi:
	LDA.l !sc_nwant
	BNE +
	RTS                            ; (every home holds what it wants)
+	LDX.w #0
-	LDA.l !sc_want,X
	CMP.w #$FFFF
	BEQ +
	CMP.l !sc_have,X
	BNE .send
+	INX : INX
	CPX.w #6
	BCC -
	LDA.w #0
	STA.l !sc_nwant
	RTS
.send
	PHX
	LDA.w #5
	JSR orbit_nmi_room
	PLX
	BCC +
	RTS
+	LDA.l !sc_want,X
	STA.l !sc_have,X
	AND.w #$00FF
	XBA : ASL
	CLC : ADC.w #(!XDATA_ORBIT_BODIES)&$FFFF
	STA.w !n_src
	LDA.w #(!XDATA_ORBIT_BODIES)>>16
	STA.w !n_bank
	CPX.w #0
	BNE .cells
	LDA.w #$FFFF                   ; (the Death Ball's picture is gone)
	STA.w !v_d32_h
	LDA.w #!SC_HOME_A_VRAM
	STA.w !n_vram
	LDA.w #4
	STA.w !n_rows
	LDA.w #128
	STA.w !n_len
	JMP orbit_nmi_rows
.cells
	LDA.w #!SC_HOME_B_VRAM
	CPX.w #2
	BEQ +
	LDA.w #!SC_HOME_C_VRAM
+	STA.w !n_vram
	LDA.w #2
	STA.w !n_rows
	LDA.w #256
	STA.w !n_len
	JMP orbit_nmi_rows
