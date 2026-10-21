; The orbital starfield (planet-view.js sky() through orbit-camera.js
; projectOrbitBackground): 100 seeded stars in four shades, three parallax
; depths, bright stars twinkling as a cross for 9 of every 240 frames.
; Stars are 16x16 OBJ (one dot each, priority 0: behind the Mode 7 globe,
; which hides them where it is opaque). DB = $32, M16/X16.
;
; Per depth d (1-3), with dz = 8.8 zoom delta and O = integer offset:
;   x = sx + O_x + round((sx - 128) dz / 256),   y likewise around 112
;   dz  = (r - 104) d 256 / 832               (~ |r-104| * 79 * d / 256)
;   O   = round(((cam - centre) - travel * k / 1024) * d / 8)  (k = 164 x, 82 y)
; One 16.16 accumulator per axis holds the depth-1 travel term; depth d is
; d times it (modulo the screen), so nothing jumps when the browser's
; counters would wrap. The offset is rounded before the zoom term is added
; (the browser rounds their sum; they differ by a pixel at most, and only
; while the camera zooms). Each depth keeps its visible stars as a list of
; OAM entries, rebuilt when that depth's offsets or zoom, the globe or a
; twinkle change: one depth at a time, in the frame's spare time. A star
; under the globe's rim chord on its line (the published window block, so
; exactly the pixels the browser's planet paints over it) is left out;
; every frame copies the lists into OAM. The second surge's pullback draws
; sky() with no camera (offsets and zoom 0) and the surge's own clock.
;
; The PPU fetches at most 34 slivers (8 pixels of a sprite's width) a line
; and leaves out those of the sprites first in OAM: the bursts, the beams'
; cells. A star takes 2 on each of its 16 lines. While beams show, the
; rows (8 lines) under their cells limit the stars of lists 1-2 that may
; cover them (stars_limits: (34 - !SC_SPARE - the beams' slivers a line)
; / 2, both lists together), and so do the distant bodies' rows (their
; slivers and a margin: scline.asm); a build leaves out a star past a
; limit, and a change of the limits rebuilds the lists (s_kgen).

stars_frame:
	REP #$30
	LDA.w !g_pull
	BEQ .live
	; the pullback: the clock pullbackStart + t (mod 240), no camera
	LDA.l !orbit_msage
	CLC : ADC.w #!FND_PULL_SKY
-	CMP.w #240
	BCC +
	SEC : SBC.w #240
	BRA -
+	STA.w !st_age240
	LDX.w #$0006
-	STZ.w !sx_want,X
	STZ.w !sy_want,X
	STZ.w !sz_want,X
	DEX : DEX
	BNE -
	JMP .twinkles
.live
	; sky clock modulo 240
	LDA.w !st_age240
	INC
	CMP.w #240
	BCC +
	LDA.w #$0000
+	STA.w !st_age240
	; travel accumulators (depth 1): x -= tdx * 1312, y -= tdy * 656
	LDA.w !cam_tdx
	BEQ +
	LDY.w #1312
	JSR stars_mul16
	LDA.w !st_ax : SEC : SBC.w !s_tmp+0 : STA.w !st_ax
	LDA.w !st_ax+2 : SBC.w !s_tmp+2 : STA.w !st_ax+2
+	LDA.w !cam_tdy
	BEQ +
	LDY.w #656
	JSR stars_mul16
	LDA.w !st_ay : SEC : SBC.w !s_tmp+0 : STA.w !st_ay
	LDA.w !st_ay+2 : SBC.w !s_tmp+2
	JSR stars_mod224
	STA.w !st_ay+2
+	; wanted offsets and zoom per depth
	LDX.w #$0002
.depth
	; O_x(d) = round(d * (travel x + (cx - 95) * 32)), low byte (8.8 maths)
	LDA.w !cam_x
	SEC : SBC.w #95
	ASL : ASL : ASL : ASL : ASL
	CLC : ADC.w !st_ax+1           ; 8.8 (integer part wraps mod 256)
	JSR stars_times_x
	CLC : ADC.w #$0080
	XBA : AND.w #$00FF
	STA.w !sx_want,X
	; O_y(d) = (d * integer + round(d * (fraction + (cy - 154) * 32))) mod 224
	LDA.w !cam_y
	SEC : SBC.w #154
	ASL : ASL : ASL : ASL : ASL
	STA.w !s_tmp+4
	LDA.w !st_ay+1
	AND.w #$00FF
	CLC : ADC.w !s_tmp+4
	JSR stars_times_x
	CLC : ADC.w #$0080
	JSR stars_asr8
	STA.w !s_tmp+6
	LDA.w !st_ay+2
	JSR stars_times_x
	CLC : ADC.w !s_tmp+6
	JSR stars_mod224
	STA.w !sy_want,X
	; dz(d) = sign * (|r - 104| * 79 * d) / 256
	LDA.w !cam_r
	SEC : SBC.w #104
	STA.w !s_tmp+6
	JSR stars_abs
	SEP #$20
	STA.w $4202
	LDA.b #79
	STA.w $4203
	NOP : NOP : NOP : NOP
	REP #$20
	LDA.w $4216
	JSR stars_times_x
	XBA : AND.w #$00FF
	BIT.w !s_tmp+6
	BPL +
	EOR.w #$FFFF : INC
+	STA.w !sz_want,X
	INX : INX
	CPX.w #$0008
	BCS +
	JMP .depth
+
.twinkles
	; bright-star twinkles (depth 3): one bit per star, set while NOT twinkling
	STZ.w !s_tmp+2
	LDX.w #4*!ORBIT_STARS_D2
.tw
	CPX.w #4*!ORBIT_STARS_D3
	BCS .twDone
	LDA.l orbit_stars+3,X
	AND.w #$00FF
	CLC : ADC.w !st_age240
	CMP.w #240
	BCC +
	SEC : SBC.w #240
+	CMP.w #9
	ROL.w !s_tmp+2
	INX : INX : INX : INX
	BRA .tw
.twDone
	LDA.w !s_tmp+2
	STA.w !s_tw
	JMP stars_limits

; Spare time (orbit_background): continue the rebuild in progress, else
; start the first stale depth, looking from the one after the last started
; (while the camera moves, the globe's rows make every depth stale each
; frame: each in turn); A16 = stars to process at most.
stars_background:
	STA.w !s_left
	LDA.w !s_bd
	BEQ +
	JMP stars_build_step
+	LDX.w !s_bnext
	LDA.w !g_pull                  ; (the pullback: depth 1 first; its frames have
	BEQ +                          ; no time for the stars the others would show)
	LDX.w #$0002
+	LDY.w #3                       ; depths to look at
.stale
	LDA.w !sx_want,X
	CMP.w !sx_have,X
	BNE .rebuild
	LDA.w !sy_want,X
	CMP.w !sy_have,X
	BNE .rebuild
	LDA.w !sz_want,X
	CMP.w !sz_have,X
	BNE .rebuild
	LDA.w !s_kgen
	CMP.w !sk_have,X
	BNE .rebuild
	CPX.w #$0006
	BNE +
	LDA.w !s_tw
	CMP.w !s_twhave
	BNE .rebuild
+	INX : INX
	CPX.w #$0008
	BCC +
	LDX.w #$0002
+	DEY
	BNE .stale
	STZ.w !sc_hot                  ; (every depth follows the limits)
	RTS
.rebuild
	TXA                            ; (the next look starts after this one)
	CLC : ADC.w #2
	CMP.w #$0008
	BCC +
	LDA.w #$0002
+	STA.w !s_bnext
	LDA.w !s_left
	PHA
	JSR stars_build_start
	PLA
	STA.w !s_left
	JMP stars_build_step

; A16 = A16 * d, d = X/2 (1-3).
stars_times_x:
	CPX.w #$0004
	BCC .one
	BEQ .two
	STA.w !s_tmp+8
	ASL
	CLC : ADC.w !s_tmp+8
	RTS
.two
	ASL
.one
	RTS

; Arithmetic shift right by 8 (A16 signed).
stars_asr8:
	CMP.w #$0000
	BMI +
	XBA : AND.w #$00FF
	RTS
+	XBA : ORA.w #$FF00
	RTS

stars_abs:
	CMP.w #$0000
	BPL +
	EOR.w #$FFFF : INC
+	RTS

; Signed A16 into 0..223.
stars_mod224:
	CMP.w #$0000
-	BPL +
	CLC : ADC.w #224
	BRA -
+	CMP.w #224
	BCC +
	SEC : SBC.w #224
	BRA +
+	RTS

; s_tmp+0..3 = signed A16 (|A| < 256) * Y16 (32-bit result).
stars_mul16:
	STY.w !s_tmp+4
	STA.w !s_tmp+6                 ; sign
	JSR stars_abs
	SEP #$20
	STA.w $4202
	LDA.w !s_tmp+4
	STA.w $4203
	NOP : NOP : NOP : NOP
	REP #$20
	LDA.w $4216
	STA.w !s_tmp+0
	SEP #$20
	LDA.w !s_tmp+5
	STA.w $4203
	NOP : NOP : NOP : NOP
	REP #$20
	LDA.w $4216                    ; high partial: add << 8
	XBA
	PHA
	AND.w #$FF00
	CLC : ADC.w !s_tmp+0
	STA.w !s_tmp+0
	PLA
	AND.w #$00FF
	ADC.w #$0000
	STA.w !s_tmp+2
	LDA.w !s_tmp+6
	BPL +
	LDA.w !s_tmp+0
	EOR.w #$FFFF
	CLC : ADC.w #$0001
	STA.w !s_tmp+0
	LDA.w !s_tmp+2
	EOR.w #$FFFF
	ADC.w #$0000
	STA.w !s_tmp+2
+	RTS

; Start rebuilding the list of depth X/2 with the wanted offsets and the
; globe as published now.
stars_build_start:
	STX.w !s_bd
	; lists 1-2: their stars on each row from nothing
	CPX.w #$0006
	BCS +
	LDA.l stars_counts_at-2,X
	TAX
	LDY.w #13
-	STZ.w $0000,X
	INX : INX
	DEY
	BPL -
	LDX.w !s_bd
+
	LDA.w !sx_want,X : STA.w !sx_have,X
	LDA.w !sy_want,X : STA.w !sy_have,X
	LDA.w !sz_want,X : STA.w !sz_have,X
	LDA.w !s_kgen : STA.w !sk_have,X
	LDA.w !s_tw : STA.w !s_twhave
	LDA.l stars_list_at-2,X : STA.w !s_bout
	LDA.l stars_last-2,X : STA.w !s_bend
	LDA.l stars_first-2,X : STA.w !s_bpos
	; culling rows: the rim chords of lines cy - R .. cy + R
	STZ.w !s_cn
	LDA.w !g_lr
	CMP.w #$FFFF
	BEQ +
	LDA.w !cam_y
	SEC : SBC.w !g_lR
	STA.w !s_ctop
	LDA.w !g_lR
	ASL
	INC
	STA.w !s_cn
	LDA.w !g_lw
	STA.w !s_cblk
	LDA.w !g_wbank                 ; (the scene block, or the descent's rows)
	STA.w !s_cbank
+	RTS

; Up to s_left stars of the list being rebuilt.
stars_build_step:
	LDX.w !s_bd
	LDA.w !sx_have,X : STA.w !s_tmp+0   ; O_x
	LDA.w !sy_have,X : STA.w !s_tmp+2   ; O_y
	LDA.w !sz_have,X : STA.w !s_tmp+4   ; dz
	JSR stars_abs
	SEP #$20
	STA.w $4202                    ; |dz| (< 256) for the zoom products
	REP #$20
	LDY.w !s_bout
	LDX.w !s_bpos
.star
	CPX.w !s_bend
	BCC +
	JMP .done
+	DEC.w !s_left
	BMI .stop
	JSR orbit_late
	BCC +
.stop
	STX.w !s_bpos                  ; the rest next frame
	STY.w !s_bout
	RTS
+	; x = sx + O_x (+ zoom), mod 256
	LDA.l orbit_stars,X
	AND.w #$00FF
	STA.w !s_tmp+6
	LDA.w !s_tmp+4
	BEQ +
	LDA.w !s_tmp+6
	SEC : SBC.w #128
	JSR stars_zoom
	CLC : ADC.w !s_tmp+6
	STA.w !s_tmp+6
+	LDA.w !s_tmp+6
	CLC : ADC.w !s_tmp+0
	AND.w #$00FF
	STA.w !s_tmp+6                 ; x
	; y = sy + O_y (+ zoom), mod 224
	LDA.l orbit_stars+1,X
	AND.w #$00FF
	STA.w !s_tmp+8
	LDA.w !s_tmp+4
	BEQ +
	LDA.w !s_tmp+8
	SEC : SBC.w #112
	JSR stars_zoom
	CLC : ADC.w !s_tmp+8
	STA.w !s_tmp+8
+	LDA.w !s_tmp+8
	CLC : ADC.w !s_tmp+2
	JSR stars_mod224
	STA.w !s_tmp+8                 ; y
	; under the rim chord of its line: hidden by the globe
	SEC : SBC.w !s_ctop
	CMP.w !s_cn
	BCS .emit
	ASL : ASL
	CLC : ADC.w !s_cblk
	STY.w !s_tmp+14
	TAY
	SEP #$20
	PHB                            ; (the rows' bank for the two reads)
	LDA.w !s_cbank
	PHA
	LDA.w !s_tmp+6
	PLB
	CMP.w $0002,Y                  ; x < W2L: outside
	BCC .keep
	CMP.w $0003,Y                  ; x > W2R: outside
	BEQ .hide
	BCS .keep
.hide
	PLB
	REP #$20
	LDY.w !s_tmp+14
	JMP .next
.keep
	PLB
	REP #$20
	LDY.w !s_tmp+14
.emit
	; well inside one of the finale's rays: hidden by it (its sprite
	; would only take slivers from the beam's cells)
	LDA.w !fn_phase
	BEQ +
	JSR stars_band_hidden
	BCC +
	JMP .next
+	; past a row's limit under the beams (lists 1-2)
	LDA.w !sc_on
	BEQ +
	LDA.w !s_bd
	CMP.w #$0006
	BCS +
	JSR stars_limit_rule
	BCC +
	JMP .next
+	LDA.l orbit_stars+2,X          ; flags | phase << 8
	STA.w !s_tmp+10
	AND.w #$0003
	ASL
	ORA.w #!ORBIT_STAR_TILE&$FF
	STA.w !s_tile
	LDA.w !s_tmp+10
	BIT.w #$0080
	BEQ .write
	XBA
	AND.w #$00FF
	CLC : ADC.w !st_age240
	CMP.w #240
	BCC +
	SEC : SBC.w #240
+	CMP.w #9
	BCS .write
	LDA.w !s_tile
	CLC : ADC.w #$0008
	STA.w !s_tile
	LDA.w !s_tmp+6
	BEQ +
	DEC.w !s_tmp+6
+	LDA.w !s_tmp+8
	BEQ .write
	DEC.w !s_tmp+8
.write
	SEP #$20
	LDA.w !s_tmp+6
	STA.w $0000,Y
	LDA.w !s_tmp+8
	STA.w $0001,Y
	LDA.w !s_tile
	STA.w $0002,Y
	LDA.b #((!ORBIT_STAR_TILE>>8)&1)|(!ORBIT_STAR_PAL<<1)
	STA.w $0003,Y
	REP #$20
	INY : INY : INY : INY
.next
	INX : INX : INX : INX
	JMP .star
.done
	LDX.w !s_bd
	TYA
	SEC : SBC.l stars_list_at-2,X
	STA.w !s_lists-2,X
	LDA.w !sk_have,X               ; (finished: the generation it was built with)
	STA.w !sk_done,X
	STZ.w !s_bd
	RTS

stars_counts_at:
	dw !sc_cnt, !sc_cnt2
stars_list_at:
	dw !s_list1, !s_list2, !s_list3
stars_first:
	dw 0, 4*!ORBIT_STARS_D1, 4*!ORBIT_STARS_D2
stars_last:
	dw 4*!ORBIT_STARS_D1, 4*!ORBIT_STARS_D2, 4*!ORBIT_STARS_D3

; A16 = round(A * dz / 256) for signed A (|A| <= 128); $4202 = |dz|,
; s_tmp+4 = dz (sign).
stars_zoom:
	STA.w !s_tmp+10
	EOR.w !s_tmp+4
	STA.w !s_tmp+12+2              ; product sign (s_tmp+14)
	LDA.w !s_tmp+10
	JSR stars_abs
	SEP #$20
	STA.w $4203
	NOP : NOP : NOP : NOP
	REP #$20
	LDA.w $4216
	CLC : ADC.w #$0080
	XBA : AND.w #$00FF
	BIT.w !s_tmp+14
	BPL +
	EOR.w #$FFFF : INC
+	RTS

; Copy the three lists into OAM at o_slot.
stars_oam:
	REP #$30
	LDX.w #$0002
.list
	PHX
	LDA.w !s_lists-2,X             ; bytes
	BEQ .next
	STA.w !s_tmp+0
	CLC : ADC.w !o_slot
	CMP.w #$0201
	BCC +
	LDA.w #$0200
	SEC : SBC.w !o_slot
	BEQ .next
	BMI .next
	STA.w !s_tmp+0
+	LDA.l stars_list_at-2,X
	TAX                            ; source
	LDA.w !o_slot
	CLC : ADC.w #$0800
	TAY                            ; destination
	LDA.w !s_tmp+0
	DEC
	PHB
	MVN $7E,$32
	PLB
	LDA.w !o_slot
	CLC : ADC.w !s_tmp+0
	STA.w !o_slot
.next
	PLX
	INX : INX
	CPX.w #$0008
	BCC .list
	RTS

; The star at y = s_tmp+8 for list s_bd (2 / 4) with the rows' limits:
; each of its rows y / 8 .. (y + 15) / 8 holding fewer stars of both
; lists than its limit, it is counted for its list (carry clear); else
; carry set (left out). Keeps X, Y.
stars_limit_rule:
	PHX
	LDA.w !s_tmp+8
	LSR : LSR : LSR
	STA.w !s_tmp+10                ; first row
	TAX
	LDA.w !s_tmp+8
	CLC : ADC.w #15
	LSR : LSR : LSR
	CMP.w #28
	BCC +
	LDA.w #27
+	STA.w !s_tmp+12                ; last row
	SEP #$20
-	LDA.w !sc_cnt,X
	CLC : ADC.w !sc_cnt2,X
	CMP.w !sc_k,X
	BCS .out
	CPX.w !s_tmp+12
	INX
	BCC -
	REP #$20
	; kept: counted on its rows, in its list's counts
	LDX.w !s_tmp+10
	LDA.w !s_bd
	CMP.w #$0004
	BNE +
	TXA
	CLC : ADC.w #28
	TAX
	LDA.w !s_tmp+12
	CLC : ADC.w #28
	STA.w !s_tmp+12
+	SEP #$20
-	INC.w !sc_cnt,X
	CPX.w !s_tmp+12
	INX
	BCC -
	REP #$20
	PLX
	CLC
	RTS
.out
	REP #$20
	PLX
	SEC
	RTS

; ---------------------------------------------------------------------------
; The limits for this frame's beams (stars_frame's end). Per group: the
; rows its cells cover, from the origin to the screen's edge along its
; heading (cells i = 0 .. n - 1, chains j = -J .. J: top left A0 + i P +
; j S, mirrored by its signs) and its slivers on each line of them by
; heading class (32x32 cells: class 0 the cells of a chain, its chains one
; above another; class 1 two cells of every chain; classes 2-4 one of
; every chain). Only when a group's inputs change (sc_in); where its rows
; grow or its slivers rise (or it turns on or off), the limits are made
; again and the lists rebuilt: a group still on keeps the rows it holds
; while its own lie within them (looser limits need no rebuild, and the
; edge of a ray going back and forth over a row no longer remakes them;
; the rows go when the group turns off).
stars_limits:
	LDA.w !g_pull                  ; (none in the pullback: its frames have no time
	BEQ +                          ; for the rebuilds)
	LDA.w !sc_on
	BEQ ++
	JSR stars_limits_reset
	INC.w !s_kgen
++	RTS
+	STZ.w !s_left                  ; (nonzero: a group's rows changed)
	LDX.w #$0002
.group
	JSR stars_group_inputs         ; changed? (and kept in sc_in)
	BCC .next
	JSR stars_group_rows           ; -> s_tmp+0 slivers, +2 top row, +4 bottom row
	TXA
	ASL
	TAY                            ; sig offset (group * 4)
	SEP #$20
	LDA.w !s_tmp+0                 ; (still on, no heavier, within its rows:
	BEQ +                          ; the limits it holds stay, as looser ones
	LDA.w !sc_sig,Y                ; need no stars rebuilt)
	BEQ .changed
	CMP.w !s_tmp+0
	BCC .changed
	LDA.w !s_tmp+2
	CMP.w !sc_sig+1,Y
	BCC .changed
	LDA.w !sc_sig+2,Y
	CMP.w !s_tmp+4
	BCS .same
	BRA .changed
+	CMP.w !sc_sig,Y                ; (off: changed if it was on)
	BEQ .same
.changed
	LDA.w !s_tmp+0 : STA.w !sc_sig,Y
	LDA.w !s_tmp+2 : STA.w !sc_sig+1,Y
	LDA.w !s_tmp+4 : STA.w !sc_sig+2,Y
	LDA.b #1
	STA.w !s_left
.same
	REP #$20
.next
	DEX : DEX
	BPL .group
	JSL sl_bodies_far              ; (the distant bodies' rows: scline.asm)
	LDA.w !s_left
	AND.w #$00FF
	BNE +
	RTS
+	JSR stars_limits_free
	; the beams' slivers into the rows (then the bodies' and the limits)
	LDY.w #$0000
.sum
	SEP #$20
	LDA.w !sc_sig,Y
	BEQ .sumNext
	STA.w !s_tmp+0
	REP #$20
	LDA.w !sc_sig+1,Y
	AND.w #$00FF
	TAX
	SEP #$20
-	LDA.w !sc_k,X
	CMP.b #!SC_FREE
	BNE +
	LDA.b #0                       ; (the row's first slivers)
+	CLC : ADC.w !s_tmp+0
	STA.w !sc_k,X
	LDA.b #1
	STA.w !sc_on
	TXA
	CMP.w !sc_sig+2,Y
	INX
	BCC -
.sumNext
	REP #$20
	INY : INY : INY : INY
	CPY.w #8
	BCC .sum
	JSL sl_count_far               ; (the distant bodies' rows, then the limits: scline.asm)
	INC.w !s_kgen                  ; (every list rebuilt with them, first)
	LDA.w #$0001
	STA.w !sc_hot
	RTS

; Every row free of limits.
stars_limits_free:
	LDA.w #(!SC_FREE<<8)|!SC_FREE
	LDX.w #26
-	STA.w !sc_k,X
	DEX : DEX
	BPL -
	STZ.w !sc_on
	RTS

; The scene's start: no limits, no beams seen, no stars counted; the
; stale depths looked at from the first.
stars_limits_reset:
	LDA.w #$0002
	STA.w !s_bnext
	STZ.w !sc_hot
	JSR stars_limits_free
	LDA.w #$0000
	LDX.w #22
-	STA.w !sc_in,X
	DEX : DEX
	BPL -
	LDX.w #54
-	STA.w !sc_cnt,X
	DEX : DEX
	BPL -
	STA.w !sc_sig
	STA.w !sc_sig+2
	STA.w !sc_sig+4
	STA.w !sc_sig+6
	JSL sl_reset_far
	RTS

; Carry set when group X's beam differs from the one its limits were made
; for (sc_in: class | $8000 when on, chains, x, y, signs, the band layers'
; line), which then becomes the one kept. Keeps X.
stars_group_inputs:
	TXA
	STA.w !s_tmp+12
	ASL
	CLC : ADC.w !s_tmp+12
	ASL
	TAY                            ; group * 12
	LDA.w !bw_key,X
	CMP.w #$FFFF
	BNE +
	LDA.w #$0000                   ; (off)
	BRA ++
+	AND.w #$01C0                   ; class
	ORA.w #$8000
++	STA.w !s_tmp+6
	LDA.w !bw_sx,X
	AND.w #$0001
	STA.w !s_tmp+8
	LDA.w !bw_sy,X
	AND.w #$0002
	ORA.w !s_tmp+8
	STA.w !s_tmp+8                 ; signs
	STZ.w !s_tmp+12                ; (changed)
	LDA.w !s_tmp+6
	CMP.w !sc_in,Y
	BEQ +
	STA.w !sc_in,Y
	INC.w !s_tmp+12
+	LDA.w !s_tmp+6
	BEQ .done                      ; (off: the rest does not matter)
	LDA.w !bw_j,X
	CMP.w !sc_in+2,Y
	BEQ +
	STA.w !sc_in+2,Y
	INC.w !s_tmp+12
+	LDA.w !bw_x,X
	CMP.w !sc_in+4,Y
	BEQ +
	STA.w !sc_in+4,Y
	INC.w !s_tmp+12
+	LDA.w !bw_y,X
	CMP.w !sc_in+6,Y
	BEQ +
	STA.w !sc_in+6,Y
	INC.w !s_tmp+12
+	LDA.w !s_tmp+8
	CMP.w !sc_in+8,Y
	BEQ +
	STA.w !sc_in+8,Y
	INC.w !s_tmp+12
+	LDA.w !bw_ymin,X
	CMP.w !sc_in+10,Y
	BEQ .done
	STA.w !sc_in+10,Y
	INC.w !s_tmp+12
.done
	LDA.w !s_tmp+12
	CMP.w #1                       ; carry set: changed
	RTS

; Group X (0 / 2): s_tmp+0 = its slivers a line (0: none, on no row of
; the screen), +2 its top row, +4 its bottom row (0-27). Keeps X.
stars_group_rows:
	STZ.w !s_tmp+0
	LDA.w !bw_key,X
	CMP.w #$FFFF
	BNE +
	JMP .off
+	LSR : LSR : LSR : LSR : LSR : LSR
	AND.w #$0007
	STA.w !s_tmp+6                 ; class
	; n: cells to the screen's edge along the heading (at most 12)
	CMP.w #4
	BCS .vertical
	LDY.w !bw_sx,X
	LDA.w !bw_x,X
	CPY.w #$0000
	BNE +
	EOR.w #$FFFF
	CLC : ADC.w #256               ; 255 - x
+	CMP.w #$8000
	BCC +
	JMP .off                       ; (the origin past that edge)
+	LSR : LSR : LSR : LSR          ; / 16
	LDY.w !s_tmp+6
	CPY.w #3
	BEQ .n                         ; (class 3: 16 a cell)
	LSR                            ; / 32
	BRA .n
.vertical
	LDY.w !bw_sy,X
	LDA.w !bw_y,X
	CPY.w #$0000
	BNE +
	EOR.w #$FFFF
	CLC : ADC.w #224               ; 223 - y
+	CMP.w #$8000
	BCC +
	JMP .off
+	LSR : LSR : LSR : LSR : LSR
.n
	INC
	CMP.w #12
	BCC +
	LDA.w #12
+	STA.w !s_tmp+8                 ; n
	; slivers a line: class 0 4 min(n, 9); class 1 8 (2J + 1); else 4 (2J + 1)
	LDA.w !bw_j,X
	ASL
	INC
	ASL : ASL
	LDY.w !s_tmp+6
	CPY.w #1
	BNE +
	ASL
+	CPY.w #0
	BNE +
	LDA.w !s_tmp+8
	CMP.w #9
	BCC ++
	LDA.w #9
++	ASL : ASL
+	STA.w !s_tmp+0
	; lines: T = A0y + j Sy + i Py over the chains and cells
	PHX
	LDA.w !s_tmp+6
	JSR beam_class_offset
	TAX
	LDA.l orbit_fx_beam_class+18,X  ; Sy
	STA.w !s_tmp+10
	LDA.l orbit_fx_beam_class+14,X  ; Py
	STA.w !s_tmp+12
	LDA.l orbit_fx_beam_class+10,X  ; A0y
	STA.w !s_tmp+14
	PLX
	LDA.w !bw_j,X                  ; J Sy (J <= 2)
	TAY
	LDA.w #0
-	DEY
	BMI +
	CLC : ADC.w !s_tmp+10
	BRA -
+	STA.w !s_tmp+10
	LDA.w !s_tmp+8                 ; (n - 1) Py
	DEC
	TAY
	LDA.w #0
-	DEY
	BMI +
	CLC : ADC.w !s_tmp+12
	BRA -
+	CLC : ADC.w !s_tmp+14
	CLC : ADC.w !s_tmp+10
	STA.w !s_tmp+12                ; Tmax
	LDA.w !s_tmp+14
	SEC : SBC.w !s_tmp+10
	STA.w !s_tmp+10                ; Tmin
	LDA.w !bw_sy,X
	BNE .up
	LDA.w !bw_y,X                  ; lines y + Tmin .. y + Tmax + 31
	CLC : ADC.w !s_tmp+10
	STA.w !s_tmp+2
	LDA.w !bw_y,X
	CLC : ADC.w !s_tmp+12
	CLC : ADC.w #31
	STA.w !s_tmp+4
	BRA .rows
.up
	LDA.w !bw_y,X                  ; lines y - Tmax - 31 .. y - Tmin
	SEC : SBC.w !s_tmp+12
	SEC : SBC.w #31
	STA.w !s_tmp+2
	LDA.w !bw_y,X
	SEC : SBC.w !s_tmp+10
	STA.w !s_tmp+4
.rows
	; on the screen, below the band layers' lines (bw_ymin)
	LDA.w !s_tmp+2
	CMP.w !bw_ymin,X
	BPL +
	LDA.w !bw_ymin,X
+	BPL +
	LDA.w #0
+	STA.w !s_tmp+2
	LDA.w !s_tmp+4
	BMI .off
	CMP.w #224
	BCC +
	LDA.w #223
+	CMP.w !s_tmp+2
	BMI .off
	LSR : LSR : LSR
	STA.w !s_tmp+4
	LDA.w !s_tmp+2
	CMP.w #224
	BCS .off
	LSR : LSR : LSR
	STA.w !s_tmp+2
	RTS
.off
	STZ.w !s_tmp+0
	STZ.w !s_tmp+2
	STZ.w !s_tmp+4
	RTS

; Carry set when the star at (s_tmp+6, s_tmp+8) lies well inside one of
; the finale's rays (3 pixels in): within its cross-section (To1 + 3 <=
; x + 2y <= To2 - 3) and between its ends (Ulo + 6 <= 2x - y <= Uhi - 6;
; bands.asm bands_bounds). Its sprite would only take slivers from the
; beam's cells. Keeps X and Y.
stars_band_hidden:
	PHX
	; around the band layers' last line the beam's cells straddle it (32
	; lines tall, mostly hidden behind the layers, yet each still takes its
	; slivers): no stars there, so the sparks in front keep theirs
	LDA.w !bd_end
	BEQ +
	SEC : SBC.w #24
	CMP.w !s_tmp+8
	BEQ .yes
	BCS +
	LDA.w !bd_end
	CLC : ADC.w #8
	CMP.w !s_tmp+8
	BCS .yes
+	LDA.w !s_tmp+8
	ASL
	CLC : ADC.w !s_tmp+6
	STA.w !s_tmp+12                ; d = x + 2y
	LDA.w !s_tmp+6
	ASL
	SEC : SBC.w !s_tmp+8
	STA.w !s_tmp+14                ; e = 2x - y
	LDX.w #$0000
	JSR .in
	BCS .yes
	LDX.w #$0002
	JSR .in
	BCS .yes
	PLX
	CLC
	RTS
.yes
	PLX
	SEC
	RTS
.in
	LDA.w !bd_to1,X
	CLC : ADC.w #3
	CMP.w !s_tmp+12
	BEQ +
	BCS .no                        ; (To1 = $7FFF: no ray)
+	LDA.w !bd_to2,X
	SEC : SBC.w #3
	CMP.w !s_tmp+12
	BCC .no
	LDA.w !bd_ulo,X
	CLC : ADC.w #6
	SEC : SBC.w !s_tmp+14
	BEQ +
	BPL .no                        ; Ulo + 6 > e
+	LDA.w !bd_uhi,X
	SEC : SBC.w #6
	SEC : SBC.w !s_tmp+14
	BMI .no                        ; Uhi - 6 < e
	SEC
	RTS
.no
	CLC
	RTS
