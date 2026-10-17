; Broken floor (engine/frieza-arena.js): a persistent set of whole 16x16
; map cells. Fractures are clipped to cells where local flight can land;
; flight crosses them (!FLIGHT_MISSING_FLOOR = frieza_floor_hole), and the
; debris bursts are drawn through fx. The cells live in a bitmap of the
; scene SRAM block (128 cells x 64 rows covers maps up to 2048 x 1024).

fz_arena_clear:
	LDA.w #$0000
	LDX.w #$03FE
-	STA.l !FZ_HOLES,X
	DEX
	DEX
	BPL -
	STA.l !fzs_arena_rev
	STA.l !fzs_holes_n
	LDA $DC
	STA.l !fzs_arena_map
	RTS

; Bursts age in fx; nothing to tick here (frieza.js tickFriezaArena).
fz_arena_tick:
	RTS

; breakFloor(x, y, radius) with the sound and quake (frieza.js breakFloor):
; A16 = radius, centre !fz_ax/!fz_ay.
fz_break_floor_loud:
	PHA
	JSR fz_break_floor
	LDA.w #!FZ_SFX_FORTRESS
	JSR fz_sfx
	PLA
	CMP.w #31
	LDA.w #6
	BCC +
	LDA.w #14
+	JMP fz_pulse

; fractureFortress(): every cell within the radius (y stretched 1.5x)
; that is already broken or landable floor becomes a hole; a debris burst.
fz_break_floor:
	STA !fz_t0                        ; radius
	; cell rows ty0..ty1, columns tx0..tx1
	LDA !fz_ay
	SEC
	SBC !fz_t0
	JSR fz_cell_of
	STA !fz_t1                        ; ty
	LDA !fz_ay
	CLC
	ADC !fz_t0
	JSR fz_cell_of
	STA !fz_t2                        ; ty1
.row
	LDA !fz_t1
	CMP !fz_t2
	BEQ +
	BMI +
	JMP .done
+	LDA !fz_ax
	SEC
	SBC !fz_t0
	JSR fz_cell_of
	STA !fz_t3                        ; tx
	LDA !fz_ax
	CLC
	ADC !fz_t0
	JSR fz_cell_of
	STA !fz_t4                        ; tx1
.col
	LDA !fz_t3
	CMP !fz_t4
	BEQ +
	BMI +
	JMP .nextRow
+	; cell centre (px, py) = (tx * 16 + 8, ty * 16 + 8)
	LDA !fz_t3
	ASL
	ASL
	ASL
	ASL
	CLC
	ADC.w #8
	STA !fz_t5
	LDA !fz_t1
	ASL
	ASL
	ASL
	ASL
	CLC
	ADC.w #8
	STA !fz_t6
	; hypot(px - x, (py - y) * 1.5) <= radius, exactly in doubled units:
	; (2 dx)^2 + (3 dy)^2 <= (2 r)^2
	LDA !fz_t6
	SEC
	SBC !fz_ay
	STA !fz_t7
	ASL
	CLC
	ADC !fz_t7                        ; 3 dy
	TAX
	LDA !fz_t5
	SEC
	SBC !fz_ax
	ASL                               ; 2 dx
	PHA
	LDA !fz_t0
	ASL
	TAY                               ; 2 r
	PLA
	JSR fz_dist_le
	BCC .skipCell
	JSR fz_hole_test                  ; already broken?
	BCS .mark
	; landable floor?
	JSR fz_bind_can_land              ; (!fz_t5, !fz_t6), Goku's layer
	BCC .skipCell
.mark
	JSR fz_hole_set
.skipCell
	INC !fz_t3
	JMP .col
.nextRow
	INC !fz_t1
	JMP .row
.done
	LDA.l !fzs_arena_rev
	INC
	STA.l !fzs_arena_rev
	JMP fz_fx_debris                  ; burst at !fz_ax/!fz_ay

; A16 = pixel (signed) -> A16 = cell (floor(p / 16)), clamped to 0.
fz_cell_of:
	BPL +
	LDA.w #0
	RTS
+	LSR
	LSR
	LSR
	LSR
	RTS

; Bitmap address of cell (!fz_t3, !fz_t1): X = byte offset, A = bit mask.
; C set when outside the bitmap.
fz_hole_addr:
	LDA !fz_t3
	CMP.w #128
	BCS .out
	LDA !fz_t1
	CMP.w #64
	BCS .out
	ASL
	ASL
	ASL
	ASL
	STA !fz_m4
	LDA !fz_t3
	LSR
	LSR
	LSR
	CLC
	ADC !fz_m4
	TAX
	LDA !fz_t3
	AND.w #$0007
	PHX
	TAX
	LDA.l fz_bit8,X
	AND.w #$00FF
	PLX
	CLC
	RTS
.out
	SEC
	RTS
fz_bit8:
	db $01,$02,$04,$08,$10,$20,$40,$80

fz_hole_test:
	JSR fz_hole_addr
	BCS .no
	STA !fz_m5
	LDA.l !FZ_HOLES,X
	AND !fz_m5
	AND.w #$00FF
	BEQ .no
	SEC
	RTS
.no
	CLC
	RTS

fz_hole_set:
	JSR fz_hole_addr
	BCS .out
	STA !fz_m5
	LDA.l !FZ_HOLES,X
	AND !fz_m5
	AND.w #$00FF
	BNE .out
	SEP #$20
	LDA.l !FZ_HOLES,X
	ORA !fz_m5
	STA.l !FZ_HOLES,X
	REP #$20
	LDA.l !fzs_holes_n
	INC
	STA.l !fzs_holes_n
.out
	RTS

; ownsArena() && s.boss && !space: the deck's holes count.
fz_arena_owned:
	JSR fz_on
	BCC .no
	LDA $DC
	CMP.w #246
	BNE .no
	LDA !fzf_flags
	AND.w #!FZFF_ACTIVE|!FZFF_SPACE
	CMP.w #!FZFF_ACTIVE
	BNE .no
	JSR fz_stage
	BEQ .no
	CMP.w #!FZST_TRIAL
	BEQ .no
	SEC
	RTS
.no
	CLC
	RTS

; floorHole(x, y, layer) for local flight (!FLIGHT_MISSING_FLOOR): JSL,
; !fl_q_x / !fl_q_y in flight's WRAM are the footprint centre. C set over a
; hole of the fight's deck. Any DB.
frieza_floor_hole:
	PHB
	PHP
	REP #$30
	PEA $7E7E
	PLB
	PLB
	JSR fz_arena_owned
	BCC .no
	LDA.l !fzs_arena_map
	CMP $DC
	BNE .no
	PHX
	PHY
	LDA !fz_t1
	PHA
	LDA !fz_t3
	PHA
	JSR fz_bind_flight_query          ; A16 = x, X16 = y of the query
	TXY
	JSR fz_cell_of
	STA !fz_t3
	TYA
	JSR fz_cell_of
	STA !fz_t1
	JSR fz_hole_test
	PLA
	STA !fz_t3
	PLA
	STA !fz_t1
	PLY
	PLX
	BCC .no
	PLP
	PLB
	SEC
	RTL
.no
	PLP
	PLB
	CLC
	RTL
