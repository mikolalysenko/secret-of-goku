; The finale's beam bands above the globe, on BG layers. The clash's rays
; are a quarter of the screen wide: as 32x32 OBJ chains they need up to 54
; slivers a line, far past the PPU's 34. Above the globe (lines 0 to its
; rim's top row) the picture switches to Mode 1 and draws Frieza's band on
; BG1 (in front: the view paints it after Goku's) and Goku's on BG2. A
; layer's tiles carry the band's whole cross-section (clear, outer quarter,
; inner half, outer quarter, clear along x + 2y: the browser's edges, which
; have slope -114/229, to within half a pixel; snes/gen/orbit-finale.mjs);
; a window per layer (W1 for BG1, W2 for BG2) cuts the band's two ends
; exactly: the origin's cut (u = 0) and the far end's (u = reach), a ramp
; per reach precomputed in extended data, copied into the HDMA records
; with an unrolled loop. Below that line the globe needs Mode 7 and the
; windows, and the rays keep their sprite cells there (beam.asm, bw_ymin).
; Only the clash's geometry is served: Goku's rays from (28, 136) at
; heading 15, Frieza's from (204, 48) at heading 7.
;
; A window table holds both bands' columns (4 bytes a line); two tables
; alternate, and a band's columns are rewritten only when its reach or
; presence changed since that table held them. In the struggle Goku's band
; runs on under Frieza's to Frieza himself (an end that does not move), so
; only Frieza's end, where they meet, is copied each frame.
; DB = $32, M16/X16 unless noted.

!BD_TABS = $320000|(!BD_TAB_A)      ; long base of the window tables (B follows at +BD_TAB_B-BD_TAB_A)

; Scene start: no band layer, no map loaded, no column in either table.
bands_reset:
	STZ.w !bd_on
	STZ.w !bd_on+2
	STZ.w !bd_end
	STZ.w !bd_tab
	STZ.w !bd_up
	STZ.w !bd_mr
	STZ.w !bd_mr+2
	STZ.w !bd_lines
	LDA.w #$FFFE                   ; (no column matches)
	STA.w !bd_key
	STA.w !bd_key+2
	STA.w !bd_key+4
	STA.w !bd_key+6
	RTS

; Frame side, after fc_rays and before the globe's tables: which rays the
; layers draw, the lines they cover, their windows (in the table the HDMA
; is not reading; globe_itables points the lead lines at it) and the
; bands' bounds for the stars' culling.
bands_frame:
	STZ.w !bd_on
	STZ.w !bd_on+2
	LDA.w !fn_phase
	BEQ .none
	JSR bands_bounds
	; the band lines end above the globe's first row
	LDA.w !cam_y
	SEC : SBC.w !g_lR
	BMI .none
	BEQ .none
	CMP.w #!OB_LINES
	BCC +
	LDA.w #!OB_LINES
+	STA.w !bd_lines
	LDX.w #$0000
	JSR bands_check
	LDX.w #$0002
	JSR bands_check
	LDA.w !bd_on
	ORA.w !bd_on+2
	BEQ .none
	LDA.w !bd_lines
	STA.w !bd_end
	JMP bands_windows
.none
	LDA.w !bd_end
	ORA.w !bd_tab
	BEQ +
	STZ.w !bd_end
	STZ.w !bd_tab
	LDA.w #$0001
	STA.w !g_ichg                  ; the globe's tables without band lines
+	RTS

; X = group: its ray qualifies (the clash's origin and heading, an even
; radius 2-48, a length) and its layer has a map; a map for another radius
; is replaced (one upload a vblank; the band keeps the old cross-section for
; that frame), and until the first one the ray stays sprites.
bands_check:
	JSR bands_clash_ray
	BCC .no
	LDA.w !fr_r,X
	CMP.w !bd_mr,X
	BEQ .ready
	LDA.w !bd_up
	BNE .old                       ; another map is on its way
	LDA.w !fr_r,X
	STA.w !bd_upr
	TXA
	INC : INC
	STA.w !bd_up                   ; group * 2 + 2
.old
	LDA.w !bd_mr,X
	BEQ .no
.ready
	LDA.w #$0001
	STA.w !bd_on,X
.no
	RTS

; X = group: carry set when its ray is one of the clash's (origin, heading,
; an even radius 4-48, a length 1-360). (The layers' tiles hold one edge
; per tile: a narrow band's quarters are thinner than a tile, and its
; edges come out within a pixel; the 2-pixel ray stays sprites.)
bands_clash_ray:
	LDA.w !fr_r,X
	CMP.w #4
	BCC .no
	CMP.w #49
	BCS .no
	LDA.w !fr_len,X
	BEQ .no
	CMP.w #361
	BCS .no
	LDA.w !fr_head,X
	CMP.l .head,X
	BNE .no
	LDA.w !fr_x,X
	CMP.l .ox,X
	BNE .no
	LDA.w !fr_y,X
	CMP.l .oy,X
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS
.head
	dw 15, 7
.ox
	dw 28, 204
.oy
	dw 136, 48

; The rays' bounds for the stars' culling (stars.asm), per group: the
; cross-section's outer thresholds (x + 2y, for its radius) and the two
; ends' cuts as 2x - y (the cut lines have slope 114/229; taken at row
; 105). A ray outside the clash's geometry culls nothing (empty bounds).
bands_bounds:
	LDX.w #$0000
	JSR .one
	LDX.w #$0002
.one
	LDA.w #$7FFF
	STA.w !bd_to1,X                ; (empty)
	STZ.w !bd_to2,X
	JSR bands_clash_ray
	BCS +
	RTS
+	; To1, To2 for its radius (orbit_fn_bthr: band-major, 4 bytes a radius)
	STX.w !bd_t+6
	LDA.w !fr_r,X
	LSR
	DEC
	ASL : ASL
	CPX.w #$0000
	BEQ +
	CLC : ADC.w #!OB_RS*4
+	TAY
	TYX
	LDA.l orbit_fn_bthr,X
	LDX.w !bd_t+6
	STA.w !bd_to1,X
	TYX
	LDA.l orbit_fn_bthr+2,X
	LDX.w !bd_t+6
	STA.w !bd_to2,X
	; the far end's cut at row 105: Goku's x <= 28 + floor((256 L + 255 -
	; 3534) / 229), Frieza's x >= 204 + ceil((6243 - 256 L - 255) / 229)
	LDA.w !fr_len,X
	XBA
	AND.w #$FF00
	STA.w !bd_t
	LDA.w !fr_len,X
	XBA
	AND.w #$00FF
	STA.w !bd_t+2
	CPX.w #$0000
	BNE .frieza
	LDA.w !bd_t : SEC : SBC.w #3279 : STA.w !bd_t
	LDA.w !bd_t+2 : SBC.w #$0000 : STA.w !bd_t+2
	JSR bands_fdiv
	LDA.w !bd_q
	CLC : ADC.w #28
	ASL
	SEC : SBC.w #105
	STA.w !bd_uhi                  ; 2x - y <= this
	LDA.w #2*13-105                ; the origin's cut: x >= 13 at row 105
	STA.w !bd_ulo
	RTS
.frieza
	; ceil((5988 - 256 L) / 229) = floor((6216 - 256 L) / 229)
	LDA.w #6216 : SEC : SBC.w !bd_t : STA.w !bd_t
	LDA.w #$0000 : SBC.w !bd_t+2 : STA.w !bd_t+2
	JSR bands_fdiv
	LDA.w !bd_q
	CLC : ADC.w #204
	ASL
	SEC : SBC.w #105
	STA.w !bd_ulo+2                ; 2x - y >= this
	LDA.w #2*232-105               ; the origin's cut: x <= 232 at row 105
	STA.w !bd_uhi+2
	RTS

; The back table's columns for both groups (Frieza's in W1, Goku's in W2):
; the table neither on screen nor published and waiting for a vblank.
bands_windows:
	LDA.w !bd_tab
	CMP.w !bd_shown
	BEQ +
	RTS                            ; the last one is not on screen yet
+	LDA.w #!BD_TAB_A
	LDY.w #$0000                   ; table 0
	CMP.w !bd_tab
	BNE +
	LDA.w #!BD_TAB_B
	LDY.w #$0004                   ; table 1
+	STA.w !bd_out
	STY.w !bd_kofs
	STZ.w !bd_wrote
	; Goku's band: in the struggle, on to Frieza (u 196, under Frieza's
	; band), else to its own end
	LDA.w !fr_len
	LDX.w !fn_phase
	CPX.w #!FN_STRUGGLE
	BNE +
	LDX.w !bd_on+2
	BEQ +
	LDA.w #196
+	STA.w !bd_rch
	LDX.w #$0000
	JSR bands_column
	; Frieza's band: to where they meet
	LDA.w !fr_len+2
	CMP.w #256
	BCC +
	LDA.w #255
+	STA.w !bd_rch+2
	LDX.w #$0002
	JSR bands_column
	LDA.w !bd_wrote
	BEQ +
	LDA.w !bd_out
	STA.w !bd_tab                  ; published with the globe's tables
	LDA.w #$0001
	STA.w !g_ichg
+	RTS

; X = group: its two window bytes in the back table, unless the table
; holds them: the origin's cut (fixed; copied when the table had no band
; there) and the far end's (the reach's ramp).
bands_column:
	LDA.w #$FFFF
	LDY.w !bd_on,X
	BEQ +
	LDA.w !bd_rch,X
+	STA.w !bd_t
	TXA
	CLC : ADC.w !bd_kofs
	TAY                            ; key slot (group + table)
	LDA.w !bd_key,Y
	STA.w !bd_t+2                  ; what the table holds
	LDA.w !bd_t
	CMP.w !bd_t+2
	BNE +
	RTS
+	STA.w !bd_key,Y
	INC.w !bd_wrote
	STX.w !bd_g                    ; group
	; the table's long offset: + (B - A) for table 1, + the group's side
	LDA.w #$0000
	LDY.w !bd_kofs
	BEQ +
	LDA.w #(!BD_TAB_B)-(!BD_TAB_A)
+	STA.w !bd_t+6
	LDA.w !bd_t
	CMP.w #$FFFF
	BNE .band
	; no band: empty window (left $FF, right 0) in the group's W
	LDA.w #(!XDATA_ORBIT_BANDS+!OB_EMPTY)&$FFFF
	LDY.w #2                       ; Goku's: W2
	CPX.w #$0000
	BEQ +
	LDY.w #0                       ; Frieza's: W1
+	STY.w !bd_t+4
	JSR .copy
	LDA.w !bd_t+4
	INC
	TAY
	LDA.w #(!XDATA_ORBIT_BANDS+!OB_EMPTY+!OB_LINES)&$FFFF
	JMP .copy
.band
	; the origin's cut, when the table had none of this band
	LDA.w !bd_t+2
	CMP.w #$FFFE
	BCC .far
	LDA.w #(!XDATA_ORBIT_BANDS+!OB_ORIGIN)&$FFFF
	LDY.w #2                       ; Goku's: the left of W2
	LDX.w !bd_g
	BEQ +
	LDA.w #(!XDATA_ORBIT_BANDS+!OB_ORIGIN+!OB_LINES)&$FFFF
	LDY.w #1                       ; Frieza's: the right of W1
+	JSR .copy
.far
	; the far end's ramp for the reach (106 bytes a reach)
	LDX.w !bd_g
	LDA.w !bd_rch,X
	ASL
	STA.w !bd_t+2                  ; 2 L
	ASL : ASL
	CLC : ADC.w !bd_t+2            ; 10 L
	STA.w !bd_t+2
	ASL : ASL
	CLC : ADC.w !bd_t+2            ; 50 L
	STA.w !bd_t+2
	LDA.w !bd_rch,X
	ASL : ASL
	CLC : ADC.w !bd_t+2            ; 54 L
	ASL                            ; 108 L
	SEC : SBC.w !bd_rch,X
	SEC : SBC.w !bd_rch,X          ; 106 L
	CPX.w #$0000
	BNE .ffrieza
	LDY.w !bd_rch
	CPY.w #300
	BCS .g1
	CLC : ADC.w #(!XDATA_ORBIT_CUT_G0)&$FFFF
	LDY.w #3                       ; Goku's: the right of W2
	JMP .copyBank0
.g1
	SEC : SBC.w #300*!OB_LINES
	CLC : ADC.w #(!XDATA_ORBIT_CUT_G1)&$FFFF
	LDY.w #3
	JMP .copyBank1
.ffrieza
	CLC : ADC.w #(!XDATA_ORBIT_CUT_F)&$FFFF
	LDY.w #0                       ; Frieza's: the left of W1
	JMP .copyBankF
; A16 = source offset in the band data's bank, Y16 = byte within the record
.copy
	STA.w !bd_t+8
	SEP #$20
	LDA.b #!XDATA_ORBIT_BANDS>>16
	BRA .go
.copyBank0
	STA.w !bd_t+8
	SEP #$20
	LDA.b #!XDATA_ORBIT_CUT_G0>>16
	BRA .go
.copyBank1
	STA.w !bd_t+8
	SEP #$20
	LDA.b #!XDATA_ORBIT_CUT_G1>>16
	BRA .go
.copyBankF
	STA.w !bd_t+8
	SEP #$20
	LDA.b #!XDATA_ORBIT_CUT_F>>16
.go
	PHB
	PHA
	PLB                            ; DB = the source's bank
	REP #$20
	TYA
	CLC : ADC.l $320000|!bd_t+6    ; table + the record's byte
	TAX
	LDA.l $320000|!bd_t+8
	TAY
	SEP #$20
	JSR bands_copy
	REP #$20
	PLB
	RTS

; 106 bytes from DB:Y.. to the window table at long $32:BD_TAB_A + X, a
; byte every 4. A8, any DB (the source's).
bands_copy:
!bci = 0
while !bci < !OB_LINES
	LDA.w !bci,Y
	STA.l !BD_TABS+(!bci*4),X
!bci #= !bci+1
endwhile
	RTS

; floor(N / 229) for the signed 32-bit N in bd_t -> bd_q (quotient),
; bd_rm (remainder 0-228). |N| < 2^24.
bands_fdiv:
	LDA.w !bd_t+2
	BMI .neg
	JSR .udiv
	RTS
.neg
	; floor(N / d) = -floor((-N - 1) / d) - 1, remainder d - 1 - r'
	LDA.w #$0000 : SEC : SBC.w !bd_t : STA.w !bd_t
	LDA.w #$0000 : SBC.w !bd_t+2 : STA.w !bd_t+2
	LDA.w !bd_t : SEC : SBC.w #1 : STA.w !bd_t
	LDA.w !bd_t+2 : SBC.w #0 : STA.w !bd_t+2
	JSR .udiv
	LDA.w !bd_q
	EOR.w #$FFFF                   ; -q - 1
	STA.w !bd_q
	LDA.w #228
	SEC : SBC.w !bd_rm
	STA.w !bd_rm
	RTS
; unsigned bd_t (< 2^24) / 229: the high 16 bits, then the low byte
.udiv
	LDA.w !bd_t+1                  ; bits 8-23
	STA.w $4204
	SEP #$20
	LDA.b #229
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	XBA
	AND.w #$FF00                   ; q1 << 8 (q1 < 256: N < 2^24)
	STA.w !bd_q
	LDA.w $4216                    ; r1 * 256 + low byte
	XBA
	AND.w #$FF00
	STA.w !bd_t+4
	LDA.w !bd_t
	AND.w #$00FF
	ORA.w !bd_t+4
	STA.w $4204
	SEP #$20
	LDA.b #229
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	ORA.w !bd_q
	STA.w !bd_q
	LDA.w $4216
	STA.w !bd_rm
	RTS

; ---------------------------------------------------------------------------
; Field vblank (orbit_nmi_live, DB = $32): the layers' registers, BG1's
; scroll split (its registers are Mode 7's), the bands' colours and one
; pending map.
bands_nmi:
	; HDMA channels 0 and 1 run all the time the orbit shows, so that the
	; field's $420C write (after the modules, at a line the game's own
	; vblank decides) never switches them on mid-frame: channel 1 (mode 3
	; on $210D/$210E) gives BG1 the band layer's scroll (0, -1) over the
	; band lines, then the globe's M7HOFS / M7VOFS (they share registers);
	; channel 0 (mode 0 on $2131) turns the colour math off over the band
	; lines (the rim adds to the backdrop inside W1 XOR W2, and there the
	; windows are the bands' ends), then on for the rim.
	SEP #$20
	LDX.w #$0000
	LDA.w !bd_sline                ; (the set the HDMA takes: its band lines)
	BEQ +
	STA.w !BD_SCROLL+0
	STZ.w !BD_SCROLL+1
	STZ.w !BD_SCROLL+2
	LDA.b #$FF : STA.w !BD_SCROLL+3
	LDA.b #$03 : STA.w !BD_SCROLL+4
	LDX.w #$0005
+	LDA.b #$01 : STA.w !BD_SCROLL+0,X
	LDA.w !g_hofs : STA.w !BD_SCROLL+1,X
	LDA.w !g_hofs+1 : STA.w !BD_SCROLL+2,X
	LDA.w !g_vofs : STA.w !BD_SCROLL+3,X
	LDA.w !g_vofs+1 : STA.w !BD_SCROLL+4,X
	STZ.w !BD_SCROLL+5,X
	LDX.w #$0000
	LDA.w !bd_sline
	BEQ +
	STA.w !BD_SCROLL+12
	STZ.w !BD_SCROLL+13
	LDX.w #$0002
+	LDA.b #$01 : STA.w !BD_SCROLL+12,X
	LDA.b #$20 : STA.w !BD_SCROLL+13,X
	STZ.w !BD_SCROLL+14,X
	REP #$20
	LDA.w #$0D03                   ; mode 3, $210D
	STA.w $4310
	LDA.w #!BD_SCROLL
	STA.w $4312
	LDA.w #$3100                   ; mode 0, $2131
	STA.w $4300
	LDA.w #!BD_SCROLL+12
	STA.w $4302
	SEP #$20
	LDA.b #$32
	STA.w $4314
	STA.w $4304
	LDA.w !bd_sline
	BNE .on
	LDA.b #$15                     ; BG1, BG3, OBJ
	STA.w $212C
	LDA.b #$01
	STA.w $212E
	LDA.b #$03
	STA.w $2123
	REP #$20
	RTS
.on
	LDA.b #(!BD_TILES>>12)|((!BD_TILES>>12)<<4)
	STA.w $210B                    ; BG1/BG2 tiles
	LDA.b #(!BD_MAP1>>8)&$FC
	STA.w $2107                    ; BG1 map, 32x32
	LDA.b #(!BD_MAP2>>8)&$FC
	STA.w $2108                    ; BG2 map
	STZ.w $210F : STZ.w $210F      ; BG2 HOFS 0
	LDA.b #$FF : STA.w $2110       ; BG2 VOFS -1 (BG rows show a line early)
	LDA.b #$03 : STA.w $2110
	LDA.b #$17                     ; BG1, BG2, BG3, OBJ
	STA.w $212C
	LDA.b #$03                     ; BG1 and BG2 windowed on the main screen
	STA.w $212E
	LDA.b #$C3                     ; BG1 shown in W1, BG2 in W2
	STA.w $2123
	; colours 1-2 of BG palette 7 (Goku's, CGRAM 113-114) and of BG
	; palette 1 (Frieza's, CGRAM 17-18): the band frame's outer and inner
	REP #$20
	LDA.w !v_band
	AND.w #$0001
	ASL : ASL
	TAX
	SEP #$20
	LDA.b #113
	STA.w $2121
	LDA.l orbit_fx_band_blue,X : STA.w $2122
	LDA.l orbit_fx_band_blue+1,X : STA.w $2122
	LDA.l orbit_fx_band_blue+2,X : STA.w $2122
	LDA.l orbit_fx_band_blue+3,X : STA.w $2122
	REP #$20
	LDA.w !v_pband
	AND.w #$0001
	ASL : ASL
	TAX
	SEP #$20
	LDA.b #17
	STA.w $2121
	LDA.l orbit_fx_band_pink,X : STA.w $2122
	LDA.l orbit_fx_band_pink+1,X : STA.w $2122
	LDA.l orbit_fx_band_pink+2,X : STA.w $2122
	LDA.l orbit_fx_band_pink+3,X : STA.w $2122
	REP #$20
	RTS

; A pending map: rows 0-13 of the group's layer for its radius, one DMA
; of the generator's map (896 bytes, some 6 lines); n_turn then lets the
; beam pictures go first next time. M16.
bands_nmi_map:
	LDA.w !bd_up
	BNE +
	RTS
+	LDA.w #6
	JSR orbit_nmi_room
	BCC +
	RTS
+	LDA.w !bd_upr
	LSR
	DEC
	SEP #$20
	STA.w $4202
	LDA.b #!OB_MAP_SIZE>>6
	STA.w $4203
	REP #$20
	NOP : NOP : NOP
	LDA.w $4216
	ASL : ASL : ASL : ASL : ASL : ASL  ; (R / 2 - 1) * 896
	LDX.w !bd_up
	CPX.w #$0004
	BEQ .frieza
	CLC : ADC.w #(!XDATA_ORBIT_BAND_MAPS_G)&$FFFF
	STA.w $4372
	LDA.w #!BD_MAP2                ; Goku's band: BG2
	STA.w $2116
	SEP #$20
	LDA.b #(!XDATA_ORBIT_BAND_MAPS_G)>>16
	BRA .send
.frieza
	CLC : ADC.w #(!XDATA_ORBIT_BAND_MAPS_F)&$FFFF
	STA.w $4372
	LDA.w #!BD_MAP1                ; Frieza's: BG1
	STA.w $2116
	SEP #$20
	LDA.b #(!XDATA_ORBIT_BAND_MAPS_F)>>16
.send
	STA.w $4374
	LDA.b #$80
	STA.w $2115
	REP #$20
	LDA.w #$1801
	STA.w $4370
	LDA.w #!OB_MAP_SIZE
	STA.w $4375
	SEP #$20
	LDA.b #$80
	STA.w $420B
	REP #$20
	LDX.w !bd_up
	LDA.w !bd_upr
	STA.w !bd_mr-2,X
	STZ.w !bd_up
	LDA.w #$0001
	STA.w !n_turn
	RTS
