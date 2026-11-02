; The bursts on the sprite lines, in the orbit's third code area: scene.asm
; calls bl_pass_far first in a fight frame's spare time, on the frame's
; finished OAM (the vblank sends it). The PPU fetches at most 34 slivers a
; line, last sprite in OAM first, and leaves out those of the sprites first
; in OAM: on a full line the hit bursts, drawn first (in front of all),
; lost theirs, torn in strips that changed from frame to frame. Under the
; beams (whose rows hold no star: stars.asm) two things filled those lines:
; - a distant body's impact, the large burst behind the globe and every
;   fighter (drawn after them, so it kept its slivers), behind a hit burst
;   on rows where the beams are heavy (!BL_HEAVY slivers a line or more by
;   the stars' limits, sc_sig): its parts whose boxes meet the hits' give
;   way, hidden whole (they lie behind the hit and the beams);
; - Frieza's finger laser, seven cells across the screen beside its hit's
;   bursts, Frieza and Goku: a hit's outer sub-bursts on its rows give way
;   (the core stays).
; Counting the slivers on each line would choose exactly, but its scan of
; the frame's entries took 20-50 lines, more than the spare time of the
; frames that need it. DB = $32, M16/X16.

bl_pass_far:
	JSR bl_pass
	RTL

bl_pass:
	LDA.w !f_on
	BEQ .out
	LDA.w !fn_phase                ; (the fight's own picture: not the clash,
	ORA.w !od_on                   ; the fall or the pullback)
	ORA.w !g_pull
	BNE .out
	LDA.w !bl_h1
	CMP.w !bl_h0
	BEQ .out                       ; (no hit drawn)
	JSR bl_vcount
	CMP.w #!BL_LATE
	BCS .out
	JSR bl_impacts
	JSR bl_laser
.out
	RTS

; The current scanline (A16).
bl_vcount:
	SEP #$20
	LDA.w $2137                    ; latch H/V counters
	LDA.w $213D                    ; OPVCT low
	XBA
	LDA.w $213D                    ; high bit
	AND.b #$01
	XBA
	REP #$20
	PHA
	SEP #$20
	LDA.w $213F                    ; reset the OPVCT flip-flop
	REP #$20
	PLA
	RTS

; Entry X with its high-table bits in A (bit 0: x's bit 8, bit 1: 32x32):
; carry set when it shows, with its box: x from bl_x0 to bl_x1 - 1 (x
; signed), lines from bl_y0 to bl_y1 (0-223).
bl_box:
	STA.w !bl_t
	AND.w #$0002                   ; size: 16, or 32 when large
	ASL : ASL : ASL
	CLC : ADC.w #16
	STA.w !bl_sz
	LDA.w $0800,X                  ; x: low byte, less 256 by bit 8
	AND.w #$00FF
	LSR.w !bl_t
	BCC +
	ORA.w #$FF00
+	STA.w !bl_x0
	CLC : ADC.w !bl_sz
	STA.w !bl_x1
	LDA.w $0801,X                  ; lines
	AND.w #$00FF
	CMP.w #224
	BCS .above
	STA.w !bl_y0
	CLC : ADC.w !bl_sz
	DEC
	CMP.w #224
	BCC +
	LDA.w #223
+	STA.w !bl_y1
	SEC
	RTS
.above
	CLC : ADC.w !bl_sz             ; (y 224-255: from line 0 when it
	SEC : SBC.w #257               ; reaches past 255)
	BMI .none
	STA.w !bl_y1
	STZ.w !bl_y0
	SEC
	RTS
.none
	CLC
	RTS

; The high-table bits of entry X (bits 0-1 of A).
bl_hbits:
	TXA
	LSR : LSR
	AND.w #$0003
	TAY
	PHX
	TXA
	LSR : LSR : LSR : LSR
	TAX
	LDA.w $0A00,X
	PLX
-	DEY
	BMI +
	LSR : LSR
	BRA -
+	RTS

; The impacts' parts behind the hits (their boxes meeting the hits' box,
; every hit part's together, less !BL_INSET each side) on rows where the
; beams are heavy give way: most of those lie behind the hit and the
; beams.
bl_impacts:
	LDA.w !bl_i1
	CMP.w !bl_i0
	BNE +
	RTS                            ; (no impact drawn)
+	JSR bl_heavy
	BCS +
	RTS                            ; (no heavy rows)
+	; the hits' box: their parts (palette 0, priority 2; not the sparks)
	LDA.w #1024                    ; (x signed, -256 to 288: the bounds
	STA.w !bl_hx0                  ; well beyond)
	EOR.w #$FFFF
	STA.w !bl_hx1
	LDA.w #$00FF
	STA.w !bl_hy0
	STZ.w !bl_hy1
	LDX.w !bl_h0
.hit
	LDA.w $0802,X
	AND.w #$3E00
	CMP.w #$2000
	BNE .hnext
	JSR bl_hbits
	JSR bl_box
	BCC .hnext
	LDA.w !bl_x0
	CMP.w !bl_hx0
	BPL +
	STA.w !bl_hx0
+	LDA.w !bl_x1
	CMP.w !bl_hx1
	BMI +
	STA.w !bl_hx1
+	LDA.w !bl_y0
	CMP.w !bl_hy0
	BCS +
	STA.w !bl_hy0
+	LDA.w !bl_y1
	CMP.w !bl_hy1
	BCC .hnext
	STA.w !bl_hy1
.hnext
	INX : INX : INX : INX
	CPX.w !bl_h1
	BCC .hit
	LDA.w !bl_hx0                  ; (less !BL_INSET each side: the parts'
	CLC : ADC.w #!BL_INSET         ; edges are mostly clear, and an impact
	STA.w !bl_hx0                  ; part a line or a pixel into the box
	LDA.w !bl_hx1                  ; would go for nothing)
	SEC : SBC.w #!BL_INSET
	STA.w !bl_hx1
	LDA.w !bl_hy0
	CLC : ADC.w #!BL_INSET
	STA.w !bl_hy0
	LDA.w !bl_hy1
	SEC : SBC.w #!BL_INSET
	BMI +
	STA.w !bl_hy1
	CMP.w !bl_hy0
	BCS ++
+	RTS                            ; (none of them shows)
++	; the impacts' parts
	LDX.w !bl_i0
.imp
	JSR bl_hbits
	JSR bl_box
	BCC .next
	LDA.w !bl_x0                   ; (its box meets the hits': x0 < hx1,
	CMP.w !bl_hx1                  ; hx0 < x1, y0 <= hy1, hy0 <= y1)
	BPL .next
	LDA.w !bl_hx0
	CMP.w !bl_x1
	BPL .next
	LDA.w !bl_y0
	CMP.w !bl_hy1
	BEQ +
	BCS .next
+	LDA.w !bl_hy0
	CMP.w !bl_y1
	BEQ +
	BCS .next
+	; the rows they share (the later first line, the earlier last) on a
	; heavy span
	LDA.w !bl_y0
	CMP.w !bl_hy0
	BCS +
	LDA.w !bl_hy0
+	LSR : LSR : LSR
	STA.w !bl_t                    ; (first row)
	LDA.w !bl_y1
	CMP.w !bl_hy1
	BCC +
	LDA.w !bl_hy1
+	LSR : LSR : LSR
	SEP #$20                       ; (last row; each heavy span k: its first
	CMP.w !bl_c+0                  ; <= our last and our first <= its last)
	BCC +
	PHA
	LDA.w !bl_c+1
	CMP.w !bl_t
	PLA
	BCS .hide
+	CMP.w !bl_c+2
	BCC +
	PHA
	LDA.w !bl_c+3
	CMP.w !bl_t
	PLA
	BCS .hide
+	CMP.w !bl_c+4
	BCC .keep
	LDA.w !bl_c+5
	CMP.w !bl_t
	BCS .hide
.keep
	REP #$20
.next
	INX : INX : INX : INX
	CPX.w !bl_i1
	BCS +
	JMP .imp
+	RTS
.hide
	LDA.b #$E0                     ; (below the screen)
	STA.w $0801,X
	BRA .keep

; The heavy rows in bl_c (three spans: first, last byte each; first >
; last: none): a beam group's rows when its slivers a line reach
; !BL_HEAVY, or both groups' common rows when neither alone does but
; together they do (sc_sig: slivers, top row, bottom row; 0: off). Carry
; set when there is one.
bl_heavy:
	SEP #$20
	LDA.b #$FF
	STA.w !bl_c+0
	STA.w !bl_c+2
	STA.w !bl_c+4
	STZ.w !bl_c+1
	STZ.w !bl_c+3
	STZ.w !bl_c+5
	STZ.w !bl_t                    ; (any)
	LDA.w !sc_sig+0
	CMP.b #!BL_HEAVY
	BCC +
	LDA.w !sc_sig+1
	STA.w !bl_c+0
	LDA.w !sc_sig+2
	STA.w !bl_c+1
	INC.w !bl_t
+	LDA.w !sc_sig+4
	CMP.b #!BL_HEAVY
	BCC +
	LDA.w !sc_sig+5
	STA.w !bl_c+2
	LDA.w !sc_sig+6
	STA.w !bl_c+3
	INC.w !bl_t
+	LDA.w !sc_sig+0                ; (both light, together heavy)
	BEQ .done
	CMP.b #!BL_HEAVY
	BCS .done
	LDA.w !sc_sig+4
	BEQ .done
	CMP.b #!BL_HEAVY
	BCS .done
	CLC : ADC.w !sc_sig+0
	CMP.b #!BL_HEAVY
	BCC .done
	LDA.w !sc_sig+1                ; (the later top, the earlier bottom)
	CMP.w !sc_sig+5
	BCS +
	LDA.w !sc_sig+5
+	STA.w !bl_c+4
	LDA.w !sc_sig+2
	CMP.w !sc_sig+6
	BCC +
	LDA.w !sc_sig+6
+	STA.w !bl_c+5
	INC.w !bl_t
.done
	REP #$20
	LDA.w !bl_t
	AND.w #$00FF
	CMP.w #$0001                   ; (carry set when any)
	RTS

; Frieza's finger laser: a hit's outer parts on its rows (the stars'
; limits', sc_sig group 1) give way, its core stays.
bl_laser:
	LDA.w !bw_key+2
	CMP.w #$FFFF
	BEQ .out
	AND.w #!BK_LASER
	BEQ .out
	LDA.w !sc_sig+4
	AND.w #$00FF
	BEQ .out
	JSR bl_cores
	LDX.w !bl_h0
.e
	LDA.w $0802,X
	AND.w #$3E00
	CMP.w #$2000
	BNE .next                      ; (not a hit's part: a spark)
	LDA.w $0800,X                  ; (a core stays)
	LDY.w !bl_nc
-	DEY : DEY
	BMI .outer
	CMP.w !bl_core,Y
	BNE -
	BRA .next
.outer
	JSR bl_hbits
	JSR bl_box
	BCC .next
	LDA.w !bl_y0                   ; (its rows: first in bl_t, last in A)
	LSR : LSR : LSR
	STA.w !bl_t
	LDA.w !bl_y1
	LSR : LSR : LSR
	SEP #$20
	CMP.w !sc_sig+5                ; (the laser's top <= our last
	BCC +                          ; and our first <= its bottom)
	LDA.w !sc_sig+6
	CMP.w !bl_t
	BCC +
	LDA.b #$E0                     ; (below the screen)
	STA.w $0801,X
+	REP #$20
.next
	INX : INX : INX : INX
	CPX.w !bl_h1
	BCC .e
.out
	RTS

; The live hits' cores (sub-burst 0 to age 41, Exploder frame f = age / 6):
; their entries' top lefts at the hit's point, x | y << 8 (bytes, as in
; OAM): frame 0 (-8, -8), frames 1-4 (-12, -12 - f), frames 5-6 (-12,
; -12 - f) and (4, -12 - f) (orbit-fx.mjs: sub-burst 0 at the point,
; unmirrored).
bl_cores:
	STZ.w !bl_nc
	LDX.w #(!HIT_N-1)*6
.hit
	LDA.w !FS_HITS+4,X
	CMP.w #42
	BCS .next
	LDY.w #$0000
-	CMP.w #6
	BCC +
	SBC.w #6                       ; (carry set)
	INY
	BRA -
+	STY.w !bl_x0                   ; (f)
	TYA
	BNE .later
	LDA.w !FS_HITS+2,X             ; frame 0
	SEC : SBC.w #8
	XBA
	AND.w #$FF00
	STA.w !bl_x1
	LDA.w !FS_HITS+0,X
	SEC : SBC.w #8
	AND.w #$00FF
	ORA.w !bl_x1
	JSR .add
	BRA .next
.later
	LDA.w !FS_HITS+2,X
	SEC : SBC.w #12
	SEC : SBC.w !bl_x0
	XBA
	AND.w #$FF00
	STA.w !bl_x1                   ; (y << 8)
	LDA.w !FS_HITS+0,X
	SEC : SBC.w #12
	AND.w #$00FF
	ORA.w !bl_x1
	JSR .add
	LDA.w !bl_x0
	CMP.w #5
	BCC .next
	LDA.w !FS_HITS+0,X             ; (frames 5-6: the second part)
	CLC : ADC.w #4
	AND.w #$00FF
	ORA.w !bl_x1
	JSR .add
.next
	TXA
	SEC : SBC.w #6
	TAX
	BPL .hit
	RTS
.add
	LDY.w !bl_nc
	STA.w !bl_core,Y
	INY : INY
	STY.w !bl_nc
	RTS
