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
; twinkle change: one depth at a time, !STARS_STEP stars per frame. A star
; under the globe's rim chord on its line (the published window block, so
; exactly the pixels the browser's planet paints over it) is left out;
; every frame copies the lists into OAM.

stars_frame:
	REP #$30
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
+	; bright-star twinkles (depth 3): one bit per star, set while NOT twinkling
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
	; a rebuild in progress continues; else the first stale depth starts
	LDA.w !s_bd
	BEQ +
	JMP stars_build_step
+	LDX.w #$0002
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
	BCC .stale
	RTS
.rebuild
	JSR stars_build_start
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
+	RTS

; Up to !STARS_STEP stars of the list being rebuilt.
stars_build_step:
	LDX.w !s_bd
	LDA.w !sx_have,X : STA.w !s_tmp+0   ; O_x
	LDA.w !sy_have,X : STA.w !s_tmp+2   ; O_y
	LDA.w !sz_have,X : STA.w !s_tmp+4   ; dz
	JSR stars_abs
	SEP #$20
	STA.w $4202                    ; |dz| (< 256) for the zoom products
	REP #$20
	LDA.w #!STARS_STEP
	STA.w !s_left
	LDY.w !s_bout
	LDX.w !s_bpos
.star
	CPX.w !s_bend
	BCC +
	JMP .done
+	DEC.w !s_left
	BPL +
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
	LDA.w !s_tmp+6
	CMP.w $0002,Y                  ; x < W2L: outside
	BCC .keep
	CMP.w $0003,Y                  ; x > W2R: outside
	BEQ .hide
	BCS .keep
.hide
	REP #$20
	LDY.w !s_tmp+14
	BRA .next
.keep
	REP #$20
	LDY.w !s_tmp+14
.emit
	LDA.l orbit_stars+2,X          ; flags | phase << 8
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
	STZ.w !s_bd
	RTS

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
