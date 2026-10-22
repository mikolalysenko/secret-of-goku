; The distant bodies on the sprite lines, in the third code area (stars.asm
; and scdraw.asm call the far entries with JSL). The PPU fetches at most 34
; slivers a line, last sprite in OAM first, and drops those first in OAM:
; the beams, the bursts, Goku and Frieza. The bodies come last but for the
; stars, so a body on a full line would take its slivers from them; a body
; is drawn whole or not at all.
; The stars' row limits (stars.asm stars_limits) hold no star on a row a
; beam's cells cover (the stars there go at once and none comes back while
; the beam holds the row), and count every body on its rows: where a beam
; crosses them its slivers go with the beams' (its room there), and on a
; row of the bodies' alone the stars leave !SL_MARGIN slivers a line for
; Goku, Frieza, the shots and the bursts, for which no body hides. And when
; a beam takes new rows, the stars there are hidden at once (sl_cull),
; before the lists' builds catch up.
; A body yields to a beam (not drawn) while its rows there have no room
; (the beams' and the bodies' slivers past 34 - !SC_SPARE); the stars
; there are gone at once (sl_cull), so no body waits for the star lists.
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
; (scdraw.asm sc_note takes the common cases itself.)
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

; Carry set when body X16 (* 2) yields this frame: blocked, and after that
; while it holds (sb_hold: $8000 | $4000 after a frame without room | the
; beams it yields to << 8 | frames held, to !SL_HOLD; sb_room: frames of
; room running). Keeps X.
sl_yield:
	LDA.l sc_bodybits,X
	AND.w !sb_blk
	BEQ .room                      ; (room there)
	LDA.w #$C000                   ; (held, no room)
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
	BEQ +
	LDA.w #1
	STA.w !s_left                  ; (made again: sl_count)
+	RTS

; stars_limits, making the limits: on each row (sc_k, $80 for none) the
; beams' slivers (sc_sig) and the bodies' slivers on their rows, then the
; limits (sl_limits): none on a beam's row, (34 - !SL_MARGIN - slivers) /
; 2 on a row of the bodies' alone, no limit on a row of neither. A body
; is blocked (sb_blk) when one of its rows a beam crosses has no room for
; it (34 - !SC_SPARE), else its slivers go on all its rows (bit 7 marks
; those no beam crosses: the beams' slivers stay below 128). And the
; stars on the rows a beam newly holds are hidden at once (sl_cull),
; unless they were hidden already and no list's build has begun since
; (sl_culled).
sl_count:
	; the rows: $80 (no beam, no body: free once made, sl_limits), then
	; the beams' slivers
	LDA.w #$8080
	LDX.w #26
-	STA.w !sc_k,X
	DEX : DEX
	BPL -
	STZ.w !sc_on
	LDY.w #$0000
.sum
	SEP #$20
	LDA.w !sc_sig,Y
	BEQ .sumNext
	STA.w !s_tmp+0
	STA.w !sc_on                   ; (a row with a limit)
	REP #$20
	LDA.w !sc_sig+2,Y
	AND.w #$00FF
	INC
	STA.w !s_tmp+2                 ; (past its bottom row)
	LDA.w !sc_sig+1,Y
	AND.w #$00FF
	TAX
	SEP #$20
-	LDA.w !sc_k,X
	BPL +                          ; (slivers there already)
	LDA.b #0                       ; ($80: the row's first)
+	CLC : ADC.w !s_tmp+0
	STA.w !sc_k,X
	INX
	CPX.w !s_tmp+2
	BCC -
.sumNext
	REP #$20
	INY : INY : INY : INY
	CPY.w #8
	BCC .sum
	; the bodies'
	STZ.w !sb_blk
	LDX.w #0
.body
	LDA.w !sb_lsig,X
	BNE +
	JMP .next
+	JSR sl_rows
	PHX
	JSR sl_near                    ; (a beam group's rows meet its rows?)
	LDX.w !sl_t
	SEP #$20
	BCC .apply
	LDA.b #34-!SC_SPARE+1          ; (no room from these slivers on)
	SEC : SBC.w !sl_s
	STA.w !sl_n
-	LDA.w !sc_k,X                  ; room on each row a beam crosses?
	BMI +                          ; (none there: the bodies' alone)
	CMP.w !sl_n
	BCS .full
+	CPX.w !sl_b
	INX
	BCC -
	LDX.w !sl_t
.apply                             ; its slivers on all its rows (bit 7
-	LDA.w !sc_k,X                  ; marks those no beam crosses)
	CLC : ADC.w !sl_s
	STA.w !sc_k,X
	CPX.w !sl_b
	INX
	BCC -
	LDA.b #1
	STA.w !sc_on                   ; (a row with a limit)
	REP #$20
	PLX
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
	; the limits (sl_limits: none on a beam's row; on a row of the bodies'
	; alone, (34 - margin - slivers) / 2; no limit on a row of neither)
	SEP #$30
	LDX.w !sc_k+0 : LDA.l sl_limits,X : STA.w !sc_k+0
	LDX.w !sc_k+1 : LDA.l sl_limits,X : STA.w !sc_k+1
	LDX.w !sc_k+2 : LDA.l sl_limits,X : STA.w !sc_k+2
	LDX.w !sc_k+3 : LDA.l sl_limits,X : STA.w !sc_k+3
	LDX.w !sc_k+4 : LDA.l sl_limits,X : STA.w !sc_k+4
	LDX.w !sc_k+5 : LDA.l sl_limits,X : STA.w !sc_k+5
	LDX.w !sc_k+6 : LDA.l sl_limits,X : STA.w !sc_k+6
	LDX.w !sc_k+7 : LDA.l sl_limits,X : STA.w !sc_k+7
	LDX.w !sc_k+8 : LDA.l sl_limits,X : STA.w !sc_k+8
	LDX.w !sc_k+9 : LDA.l sl_limits,X : STA.w !sc_k+9
	LDX.w !sc_k+10 : LDA.l sl_limits,X : STA.w !sc_k+10
	LDX.w !sc_k+11 : LDA.l sl_limits,X : STA.w !sc_k+11
	LDX.w !sc_k+12 : LDA.l sl_limits,X : STA.w !sc_k+12
	LDX.w !sc_k+13 : LDA.l sl_limits,X : STA.w !sc_k+13
	LDX.w !sc_k+14 : LDA.l sl_limits,X : STA.w !sc_k+14
	LDX.w !sc_k+15 : LDA.l sl_limits,X : STA.w !sc_k+15
	LDX.w !sc_k+16 : LDA.l sl_limits,X : STA.w !sc_k+16
	LDX.w !sc_k+17 : LDA.l sl_limits,X : STA.w !sc_k+17
	LDX.w !sc_k+18 : LDA.l sl_limits,X : STA.w !sc_k+18
	LDX.w !sc_k+19 : LDA.l sl_limits,X : STA.w !sc_k+19
	LDX.w !sc_k+20 : LDA.l sl_limits,X : STA.w !sc_k+20
	LDX.w !sc_k+21 : LDA.l sl_limits,X : STA.w !sc_k+21
	LDX.w !sc_k+22 : LDA.l sl_limits,X : STA.w !sc_k+22
	LDX.w !sc_k+23 : LDA.l sl_limits,X : STA.w !sc_k+23
	LDX.w !sc_k+24 : LDA.l sl_limits,X : STA.w !sc_k+24
	LDX.w !sc_k+25 : LDA.l sl_limits,X : STA.w !sc_k+25
	LDX.w !sc_k+26 : LDA.l sl_limits,X : STA.w !sc_k+26
	LDX.w !sc_k+27 : LDA.l sl_limits,X : STA.w !sc_k+27
	REP #$30
	STZ.w !sb_mv
	; the stars on the rows a beam newly holds, hidden now (the lists, built
	; before these limits, would have the beam lose slivers there until
	; their builds catch up: a growing ray's rows)
	JSR sl_hot
	BCC +
	JSR sl_culled
	BCS +
	JSR sl_cull
+	RTS

; Carry set when the rows sl_hot found (sl_t .. sl_b) were culled already
; and no star list's build has begun since (sk_have: their stars there are
; still hidden); else they become the culled rows (sb_cull: the top row,
; the bottom row << 8; sb_cgen: the generation these limits get).
sl_culled:
	LDA.w !s_kgen
	INC
	STA.w !sl_g                    ; (these limits' generation)
	LDX.w #2                       ; a build begun since the last cull?
-	LDA.w !sk_have,X
	SEC : SBC.w !sb_cgen
	BPL .anew
	INX : INX
	CPX.w #8
	BCC -
	SEP #$20
	LDA.w !sl_t                    ; within the culled rows?
	CMP.w !sb_cull
	BCC .wider
	LDA.w !sb_cull+1
	CMP.w !sl_b
	BCC .wider
	REP #$20
	SEC
	RTS
.wider                             ; (the culled rows and these)
	LDA.w !sb_cull
	CMP.w !sl_t
	BCS +
	STA.w !sl_t
+	LDA.w !sb_cull+1
	CMP.w !sl_b
	BCC .anew8
	STA.w !sl_b
.anew8
	REP #$20
.anew
	SEP #$20
	LDA.w !sl_t
	STA.w !sb_cull
	LDA.w !sl_b
	STA.w !sb_cull+1
	REP #$20
	LDA.w !sl_g
	STA.w !sb_cgen
	JMP sl_lines

; Carry set when a beam group's rows meet sl_t .. sl_b (the limits' groups).
sl_near:
	SEP #$20
	LDA.w !sc_sig
	BEQ +
	LDA.w !sc_sig+1                ; group 0's top past the bottom?
	CMP.w !sl_b
	BEQ ++
	BCS +
++	LDA.w !sc_sig+2                ; its bottom above the top?
	CMP.w !sl_t
	BCS .yes
+	LDA.w !sc_sig+4
	BEQ .no
	LDA.w !sc_sig+5
	CMP.w !sl_b
	BEQ +
	BCS .no
+	LDA.w !sc_sig+6
	CMP.w !sl_t
	BCS .yes
.no
	REP #$20
	CLC
	RTS
.yes
	REP #$20
	SEC
	RTS

; A row's stars allowed for its slivers (sc_k as made: $80 neither a beam
; nor a body, !SC_FREE; bit 7 a row of the bodies' alone; else a beam's
; row, which holds none).
sl_limits:
	!sl_v = 0
	while !sl_v < 256
		if !sl_v == 128
			db !SC_FREE
		elseif !sl_v == !SC_FREE
			db !SC_FREE
		elseif !sl_v >= 128
			if 34-!SL_MARGIN-(!sl_v-128) > 0
				db (34-!SL_MARGIN-(!sl_v-128))/2
			else
				db 0
			endif
		else
			db 0                       ; (a beam's row: no star while it holds it)
		endif
		!sl_v #= !sl_v+1
	endwhile

; A16 = a body's rows signature: sl_t its top row, sl_b its bottom row,
; sl_s its slivers a line. Y16 lost.
sl_rows:
	TAY
	AND.w #$001F
	STA.w !sl_t
	TYA
	LSR : LSR : LSR : LSR : LSR
	AND.w #$001F
	STA.w !sl_b
	TYA
	XBA : LSR : LSR
	AND.w #$0003
	ASL
	STA.w !sl_s
	RTS

; sl_t .. sl_b = the rows the beam groups newly hold since the last limits
; (a group on anew or heavier: all its rows; one moved: its rows outside
; the old ones; both groups' together); carry set when any. The groups'
; rows become the last ones (sb_psig).
sl_hot:
	LDA.w #$00FF
	STA.w !sl_t                    ; (no rows: top past bottom)
	STZ.w !sl_b
	LDY.w #0
	LDX.w #0
	JSR .group
	LDY.w #4
	LDX.w #3
	JSR .group
	LDA.w !sl_t
	CMP.w !sl_b
	BEQ +
	BCC +
	CLC                            ; (none)
	RTS
+	SEC
	RTS
.group                             ; (Y: its sc_sig, X: its sb_psig)
	SEP #$20
	LDA.w !sc_sig,Y
	BEQ .save                      ; (off: nothing newly held)
	CMP.w !sb_psig,X
	BEQ +
	BCS .all                       ; (on anew, or heavier)
+	LDA.w !sc_sig+1,Y              ; above its old top?
	CMP.w !sb_psig+1,X
	BCS +
	STA.w !sl_n                    ; rows top .. old top - 1
	LDA.w !sb_psig+1,X
	DEC
	JSR .add
+	LDA.w !sc_sig+2,Y              ; below its old bottom?
	CMP.w !sb_psig+2,X
	BEQ .save
	BCC .save
	LDA.w !sb_psig+2,X             ; rows old bottom + 1 .. bottom
	INC
	STA.w !sl_n
	LDA.w !sc_sig+2,Y
	JSR .add
	BRA .save
.all
	LDA.w !sc_sig+1,Y
	STA.w !sl_n
	LDA.w !sc_sig+2,Y
	JSR .add
.save
	LDA.w !sc_sig,Y
	STA.w !sb_psig,X
	LDA.w !sc_sig+1,Y
	STA.w !sb_psig+1,X
	LDA.w !sc_sig+2,Y
	STA.w !sb_psig+2,X
	REP #$20
	RTS
.add                               ; (M8: rows sl_n .. A into sl_t .. sl_b)
	CMP.w !sl_b
	BCC +
	STA.w !sl_b
+	LDA.w !sl_n
	CMP.w !sl_t
	BCS +
	STA.w !sl_t
+	RTS

; sl_n / sl_s = the ys of the stars on rows sl_t .. sl_b; carry clear.
sl_lines:
	LDA.w !sl_t
	ASL : ASL : ASL                ; (the top row's first line - 15) ..
	SEC : SBC.w #15
	BPL +
	LDA.w #0
+	STA.w !sl_n
	LDA.w !sl_b                    ; .. the bottom row's last line
	ASL : ASL : ASL
	CLC : ADC.w #8
	SEC : SBC.w !sl_n
	STA.w !sl_s
	CLC
	RTS

; The stars of every list with y in sl_n .. sl_n + sl_s - 1 (sl_lines)
; hidden (y = $E0) until the list's next build: four entries a step, then
; the rest.
sl_cull:
	LDX.w #2
.list
	LDA.w !s_lists-2,X             ; (bytes)
	BNE +
	JMP .next
+	STA.w !sl_t
	LDA.l stars_list_at-2,X
	STA.w !sl_b                    ; (its first entry)
	CLC : ADC.w !sl_t
	STA.w !sl_g                    ; (its end)
	LDA.w !sl_t
	AND.w #$FFF0
	CLC : ADC.w !sl_b
	STA.w !sl_t                    ; (the end of its fours)
	PHX
	LDX.w !sl_b
	SEP #$20
	CPX.w !sl_t
	BCS .rest
.four
	SEC
	LDA.w $0001,X
	SBC.w !sl_n
	CMP.w !sl_s
	BCS +
	LDA.b #$E0
	STA.w $0001,X
	SEC
+	LDA.w $0005,X
	SBC.w !sl_n
	CMP.w !sl_s
	BCS +
	LDA.b #$E0
	STA.w $0005,X
	SEC
+	LDA.w $0009,X
	SBC.w !sl_n
	CMP.w !sl_s
	BCS +
	LDA.b #$E0
	STA.w $0009,X
	SEC
+	LDA.w $000D,X
	SBC.w !sl_n
	CMP.w !sl_s
	BCS +
	LDA.b #$E0
	STA.w $000D,X
+	REP #$21
	TXA
	ADC.w #16
	TAX
	SEP #$20
	CPX.w !sl_t
	BCC .four
.rest
	CPX.w !sl_g
	BCS .done
	SEC
	LDA.w $0001,X
	SBC.w !sl_n
	CMP.w !sl_s
	BCS +
	LDA.b #$E0
	STA.w $0001,X
+	INX : INX : INX : INX
	BRA .rest
.done
	REP #$20
	PLX
.next
	INX : INX
	CPX.w #8
	BCS +
	JMP .list
+	RTS

; stars_limits_reset: no body on the lines, none blocked or held; every
; list as made under the limits now.
sl_reset:
	STZ.w !sb_blk
	STZ.w !sb_mv
	STZ.w !sb_held
	LDX.w #(!OSC_N-1)*2
-	STZ.w !sb_lsig,X
	STZ.w !sb_dsig,X
	STZ.w !sb_hold,X
	STZ.w !sb_room,X
	LDA.w #$FFFF
	STA.w !sb_cy,X
	DEX : DEX
	BPL -
if defined("HELD_CHECK")
	STZ.w !hc_checks
	STZ.w !hc_diff
endif
	STZ.w !sb_psig                 ; (no beam group's rows yet, none culled)
	STZ.w !sb_psig+2
	STZ.w !sb_psig+4
	LDA.w #$00FF
	STA.w !sb_cull
	LDA.w !s_kgen
	STA.w !sb_cgen
	RTS
