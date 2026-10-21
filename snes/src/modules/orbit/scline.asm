; The distant bodies on the sprite lines, in the third code area (stars.asm
; and scdraw.asm call the far entries with JSL). The PPU fetches at most 34
; slivers a line, last sprite in OAM first, and drops those first in OAM:
; the beams, the bursts, Goku and Frieza. The bodies come last but for the
; stars, so a body on a full line would take its slivers from them; a body
; is drawn whole or not at all.
; The stars' row limits (stars.asm stars_limits) count every body on its
; rows: where a beam crosses them with the beams' slivers (the stars yield
; its share), and on its other rows with a margin (the stars there leave
; !SL_MARGIN slivers a line for Goku, Frieza, the shots and the bursts, for
; which no body hides).
; A body yields to a beam (not drawn) while its rows there have no room
; (the beams' and the bodies' slivers past 34 - !SC_SPARE), or while the
; stars have not yet made its room (star lists 1-2 not both rebuilt since
; the limits began counting it there, moved it or made its rows stricter).
; Once it yields it stays hidden !SL_HOLD frames at least, then until the
; beams on when it yielded are gone or its rows have had room for !SL_ROOM
; frames running (!SL_ROOM_B after a frame without room): one hide for a
; beam's pass, no flicker.
; DB = $32, M16/X16.

; (!SL_MARGIN, !SL_HOLD, !SL_ROOM and !SL_ROOM_B: module.asm)

sl_note_far:
	JSR sl_note : RTL
sl_bodies_far:
	JSR sl_bodies : RTL
sl_count_far:
	JSR sl_count : RTL
sl_reset_far:
	JSR sl_reset : RTL

; Body X16 (* 2) about to be drawn with its top left at d_x, d_y, A16
; pixels square (16 or 32): its rows on the sprite lines for the next
; frame's limits (sb_dsig: top | bottom << 5 | slivers / 2 << 10 | $8000;
; 0 off the screen), then carry set when it yields (not drawn). Keeps X.
; (scdraw.asm sc_note takes the common case itself.)
sl_note:
	STA.w !sl_half
	LDA.w !d_x
	CMP.w #256
	BPL .off
	CLC : ADC.w !sl_half
	BMI .off
	BEQ .off
	; (the rows the limits took from it, while its top line and size stay)
	LDA.w !sl_half
	XBA : ASL                      ; size << 9
	CLC : ADC.w !d_y
	CMP.w !sb_cy,X
	BNE +
	LDA.w !sb_lsig,X
	BEQ ++                         ; (none in the limits yet: anew)
	STA.w !sb_dsig,X
	JMP sl_yield
+	STA.w !sb_cy,X
++	LDA.w !d_y
	CMP.w #224
	BPL .off
	CLC : ADC.w !sl_half
	DEC                            ; (its last line)
	BMI .off
	CMP.w #224
	BCC +
	LDA.w #223
+	AND.w #$00F8
	ASL : ASL                      ; (bottom row << 5)
	STA.w !sl_b
	LDA.w !d_y
	BPL +
	LDA.w #0
+	LSR : LSR : LSR
	ORA.w !sl_b
	STA.w !sl_b
	LDA.w !sl_half                 ; (size << 6: slivers / 2 << 10)
	XBA : LSR : LSR
	ORA.w !sl_b
	ORA.w #$8000
	STA.w !sb_dsig,X
	JMP sl_yield
.off
	STZ.w !sb_dsig,X
	LDA.w #$FFFF
	STA.w !sb_cy,X
	JSR sl_back                    ; (off the screen: back afresh)
	CLC
	RTS

; Carry set when body X16 (* 2) yields this frame: blocked, or counted on
; a beam's rows before both star lists were rebuilt since its wait began
; (sb_kg); and after that while it holds (sb_hold: $8000 | $4000 after a
; frame without room | the beams it yields to << 8 | frames held, to
; !SL_HOLD; sb_room: frames of room running). Keeps X.
sl_yield:
	LDA.l sc_bodybits,X
	AND.w !sb_blk
	BEQ +
	LDA.w #$4000                   ; (no room)
	BRA .yield
+	LDA.l sc_bodybits,X
	AND.w !sb_stale
	BEQ .room                      ; (no wait for the star lists)
	LDA.w #$0000
.yield
	ORA.w #$8000
	STA.w !sl_g
	JSR sl_on                      ; (the beams on now)
	XBA
	ORA.w !sl_g
	ORA.w !sb_hold,X               ; (with those it yielded to before, held so long)
	AND.w #$C3FF
	JSR sl_age
	STA.w !sb_hold,X
	STZ.w !sb_room,X
	LDA.l sc_bodybits,X
	TSB.w !sb_held
	SEC
	RTS
.room
	LDA.w !sb_hold,X
	BNE .held
	CLC                            ; (drawn)
	RTS
.held
	JSR sl_age
	STA.w !sb_hold,X
	INC.w !sb_room,X               ; (a frame of room)
	AND.w #$00FF
	CMP.w #!SL_HOLD
	BCC .keep                      ; (not held long enough yet)
	LDA.w !sb_hold,X
	XBA
	AND.w #$0003
	STA.w !sl_t                    ; (the beams it yields to)
	JSR sl_on
	AND.w !sl_t
	BEQ .back                      ; (gone)
	LDA.w #!SL_ROOM
	BIT.w !sb_hold,X
	BVC +
	LDA.w #!SL_ROOM_B              ; (after a frame without room)
+	CMP.w !sb_room,X
	BEQ .back
	BCS .keep
.back
	JSR sl_back
	CLC
	RTS
.keep
	SEC
	RTS

; A16 = a hold, a frame more held (to !SL_HOLD).
sl_age:
	PHA
	AND.w #$00FF
	CMP.w #!SL_HOLD
	PLA
	BCS +
	INC
+	RTS

; Body X16 (* 2) no longer held back. Keeps X.
sl_back:
	STZ.w !sb_hold,X
	STZ.w !sb_room,X
	LDA.l sc_bodybits,X
	TRB.w !sb_held
	RTS

; A16 = the beam groups the limits hold (bit 0 group 0, bit 1 group 1).
sl_on:
	LDA.w !sc_sig
	AND.w #$00FF
	BEQ +
	LDA.w #1
+	STA.w !sl_n
	LDA.w !sc_sig+4
	AND.w #$00FF
	BEQ +
	LDA.w #2
+	ORA.w !sl_n
	RTS

; stars_limits, each frame: the rows the bodies took on the last frame's
; lines (sb_dsig) become the ones the limits count (sb_lsig); a change
; makes the limits again (s_left; sb_mv the bodies whose rows changed).
sl_bodies:
	assert !OSC_N == 3, "sl_bodies takes three bodies"
	LDA.w !sb_dsig
	CMP.w !sb_lsig
	BEQ +
	STA.w !sb_lsig
	LDA.w #$0001
	TSB.w !sb_mv
+	LDA.w !sb_dsig+2
	CMP.w !sb_lsig+2
	BEQ +
	STA.w !sb_lsig+2
	LDA.w #$0002
	TSB.w !sb_mv
+	LDA.w !sb_dsig+4
	CMP.w !sb_lsig+4
	BEQ +
	STA.w !sb_lsig+4
	LDA.w #$0004
	TSB.w !sb_mv
+	LDA.w !sb_mv
	BEQ sl_stale
	LDA.w #1
	STA.w !s_left
	BRA sl_stale                   ; (made again after the limits: sl_count)

; sb_stale = the bodies counted on a beam's rows whose wait is not over:
; star lists 1-2 not both built since sb_kg (they change only in the
; frames' spare time, after the drawing).
sl_stale:
	STZ.w !sb_stale
	LDA.w !sb_cnt
	BEQ .none
	LDX.w #(!OSC_N-1)*2
-	LDA.l sc_bodybits,X
	AND.w !sb_cnt
	BEQ +
	LDA.w !sk_done+2
	SEC : SBC.w !sb_kg,X
	BMI ++
	LDA.w !sk_done+4
	SEC : SBC.w !sb_kg,X
	BPL +
++	LDA.l sc_bodybits,X
	TSB.w !sb_stale
+	DEX : DEX
	BPL -
.none
	RTS

; stars_limits, making the limits (sc_k: the beams' slivers on each row,
; !SC_FREE where none): the bodies' slivers on their rows, then the limits,
; (34 - !SC_SPARE - slivers) / 2 stars a row, (34 - !SL_MARGIN - slivers) /
; 2 on a row no beam crosses. A body is blocked (sb_blk) when one of its
; rows a beam crosses has no room for it (34 - spare), else its slivers go
; on all its rows (bit 7 marks those no beam crosses: the beams' slivers
; stay below 128) and, on a beam's rows, it is counted there (sb_cnt). A
; body counted there anew, moved, or with its rows' limit made stricter
; begins a new wait for the star lists (sb_kg: the generation these
; limits get).
sl_count:
	LDA.w !sb_cnt
	STA.w !sl_was
	STZ.w !sb_cnt
	STZ.w !sb_blk
	LDX.w #0
.body
	LDA.w !sb_lsig,X
	BNE +
	JMP .next
+	JSR sl_rows
	STZ.w !sl_n                    ; (rows a beam crosses)
	PHX
	LDX.w !sl_t
	SEP #$20
-	LDA.w !sc_k,X                  ; room on each row a beam crosses?
	BMI +                          ; (none there: free, or the bodies' alone)
	INC.w !sl_n
	CLC : ADC.w !sl_s
	CMP.b #34-!SC_SPARE+1
	BCS .full
+	CPX.w !sl_b
	INX
	BCC -
	LDX.w !sl_t                    ; its slivers on all its rows
-	LDA.w !sc_k,X
	CMP.b #!SC_FREE
	BNE +
	LDA.b #$80                     ; (the bodies' alone)
+	CLC : ADC.w !sl_s
	STA.w !sc_k,X
	CPX.w !sl_b
	INX
	BCC -
	LDA.b #1
	STA.w !sc_on                   ; (a row with a limit)
	LDA.w !sl_n
	REP #$20
	PLX
	AND.w #$00FF
	BEQ .next                      ; (on no beam's rows)
	LDA.l sc_bodybits,X
	TSB.w !sb_cnt
	BRA .next
.full
	REP #$20
	PLX
	LDA.l sc_bodybits,X
	TSB.w !sb_blk
.next
	INX : INX
	CPX.w #!OSC_N*2
	BCC .body
	; the limits: (34 - spare - slivers) / 2 stars a row; on a row of the
	; bodies' alone, (34 - margin - slivers) / 2
	LDX.w #27
	SEP #$20
.lim
	LDA.w !sc_k,X
	BPL .spare
	CMP.b #!SC_FREE
	BEQ .free
	AND.b #$7F
	EOR.b #$FF
	SEC : ADC.b #34-!SL_MARGIN     ; 34 - margin - slivers
	BRA .clamp
.spare
	EOR.b #$FF
	SEC : ADC.b #34-!SC_SPARE      ; 34 - spare - slivers
.clamp
	BPL +
	LDA.b #0
+	LSR
	STA.w !sc_k,X
.free
	DEX
	BPL .lim
	REP #$20
	; the waits: a body counted on a beam's rows anew, moved or made
	; stricter there waits from these limits on
	LDA.w !s_kgen
	INC
	STA.w !sl_g                    ; (the generation these limits get)
	LDX.w #0
.wait
	LDA.l sc_bodybits,X
	AND.w !sb_cnt
	BEQ .nw
	JSR sl_strict
	CMP.w !sb_klim,X
	STA.w !sb_klim,X
	BCC .new                       ; (stricter)
	LDA.l sc_bodybits,X
	AND.w !sl_was
	BEQ .new                       ; (counted there anew)
	LDA.l sc_bodybits,X
	AND.w !sb_mv
	BEQ .nw                        ; (unmoved)
.new
	LDA.w !sl_g
	STA.w !sb_kg,X
.nw
	INX : INX
	CPX.w #!OSC_N*2
	BCC .wait
	STZ.w !sb_mv
	JMP sl_stale

; A16 = a body's rows signature: sl_t its top row, sl_b its bottom row,
; sl_s its slivers a line.
sl_rows:
	PHA
	AND.w #$001F
	STA.w !sl_t
	PLA
	PHA
	LSR : LSR : LSR : LSR : LSR
	AND.w #$001F
	STA.w !sl_b
	PLA
	XBA : LSR : LSR
	AND.w #$0003
	ASL
	STA.w !sl_s
	RTS

; A16 = the fewest stars body X16's (* 2) rows allow (the limits made).
; Keeps X.
sl_strict:
	LDA.w !sb_lsig,X
	JSR sl_rows
	PHX
	LDA.w #$00FF
	STA.w !sl_n
	LDX.w !sl_t
	SEP #$20
-	LDA.w !sc_k,X
	CMP.w !sl_n
	BCS +
	STA.w !sl_n
+	CPX.w !sl_b
	INX
	BCC -
	REP #$20
	PLX
	LDA.w !sl_n
	AND.w #$00FF
	RTS

; stars_limits_reset: no body on the lines, none counted, blocked or held;
; every list as made under the limits now.
sl_reset:
	STZ.w !sb_cnt
	STZ.w !sb_blk
	STZ.w !sb_mv
	STZ.w !sb_held
	STZ.w !sb_stale
	LDX.w #(!OSC_N-1)*2
-	STZ.w !sb_lsig,X
	STZ.w !sb_dsig,X
	STZ.w !sb_hold,X
	STZ.w !sb_room,X
	LDA.w #$FFFF
	STA.w !sb_cy,X
	DEX : DEX
	BPL -
	LDA.w !s_kgen
	STA.w !sk_done+2
	STA.w !sk_done+4
	STA.w !sk_done+6
	RTS
