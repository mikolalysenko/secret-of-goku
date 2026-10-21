; The victory's colours (frieza-finale-view.js through boss-victory.js),
; t = the win's clock past the impact (fn_age - !FNT_V_IMPACT):
; - Frieza's death flash (bossDeathColor) while he shows (0 <= t <
;   vanish): his dark shades kept, the rest red for two phases and white
;   for two, phases of 8 frames, of 4 from t = 180;
; - the whiteout (bossVictoryWhite through planet-view.js flash(white,
;   native): w = 31 times its level, added to every channel and clamped):
;   from t = 143 it climbs to 31 at 306, holds to 631 and is gone by 791.
;   The vblank sends the colours the generator washed (orbit.mjs
;   victoryColours) in place of the scene's own: the backdrop, the globe,
;   OBJ palettes 4-7 and Goku's band layer. The rim's colour math adds to
;   the washed backdrop as before, and the browser's text panel and HUD,
;   the game's, over its picture, keep their colours: BG3, the game's
;   palettes and OBJ palette 1, which the HUD portrait shares with Goku.
;   So through the win Goku is drawn with palette 5 (fdraw.asm fc_goku_at),
;   which holds his Super Saiyan colours there (no pink ray is left).
; The frame decides them with its OBJ palettes (orbit_pals_frame), for the
; vblank that shows its sprites: wv_white (w), wv_base (level w's colours
; in orbit_wash), wv_sky (the backdrop), wv_p6 (palette 6's place in a
; level: Frieza's own colours, red or white). DB = $32, M16/X16.
assert !OWASH_SKY0 == !ORBIT_SKY, "the whiteout's backdrop is not the scene's sky"
orbit_wash = !XDATA_ORBIT_WASH         ; (a symbol for the tests' watch)

; Frame side (orbit_pals_frame, every live frame).
wash_frame:
	STZ.w !wv_white
	LDA.w #!OWASH_FRIEZA
	STA.w !wv_p6
	LDA.w #!ORBIT_SKY
	STA.w !wv_sky
	LDA.w !fn_phase
	CMP.w #!FN_WIN
	BEQ +
-	RTS
+	LDA.w !fn_age
	SEC : SBC.w #!FNT_V_IMPACT     ; t
	BMI -
	STA.w !d_t0
	CMP.w #!FNT_B_VANISH
	BCS .white
	; Frieza's: phase floor(t / 8) (from 180: t / 4) mod 4, 0-1 red
	CMP.w #180
	BCS +
	LSR
+	LSR : LSR : LSR
	LDX.w #!OWASH_RED
	AND.w #$0001
	BEQ +
	LDX.w #!OWASH_WHITE
+	STX.w !wv_p6
.white
	LDA.w !d_t0
	CMP.w #!FNT_B_FADE
	BCC .out
	CMP.w #!FNT_B_WHITE
	BCS .hold
	SEC : SBC.w #!FNT_B_FADE       ; floor(31 (t - fade) / (white - fade))
	JSR wash_x31
	LDX.w #!FNT_B_WHITE-!FNT_B_FADE
	BRA .div
.hold
	CMP.w #!FNT_B_REVEAL
	BCS .clear
	LDA.w #31
	BRA .level
.clear
	CMP.w #!FNT_B_CLEAR
	BCS .out
	EOR.w #$FFFF                   ; ceil(31 (clear - t) / (clear - reveal))
	SEC : ADC.w #!FNT_B_CLEAR
	JSR wash_x31
	CLC : ADC.w #!FNT_B_CLEAR-!FNT_B_REVEAL-1
	LDX.w #!FNT_B_CLEAR-!FNT_B_REVEAL
.div
	STA.w $4204
	SEP #$20
	TXA
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	BEQ .out
.level
	STA.w !wv_white
	ASL
	TAX
	LDA.l orbit_wash_sky,X
	STA.w !wv_sky
	; level w's colours: orbit_wash + (w - 1) * !OWASH_SIZE
	LDA.w !wv_white
	DEC
	SEP #$20
	STA.w $4202
	LDA.b #!OWASH_SIZE/2
	STA.w $4203
	REP #$20
	NOP : NOP : NOP : NOP
	LDA.w $4216
	ASL
	CLC : ADC.w #(!XDATA_ORBIT_WASH)&$FFFF
	STA.w !wv_base
.out
	RTS

; A16 = A16 * 31 (d_t1 scratch).
wash_x31:
	STA.w !d_t1
	ASL : ASL : ASL : ASL : ASL
	SEC : SBC.w !d_t1
	RTS

; OBJ palette 5 through the win (orbit_pals_frame): Goku's Super Saiyan
; colours, as palette 1 holds them (copied once: the pink band colours no
; longer come there).
wash_goku_palette:
	LDA.w !OBJ_PALS45+32+2
	CMP.l orbit_pal_goku_ssj+2
	BNE +
	LDA.w !OBJ_PALS45+32+30
	CMP.l orbit_pal_goku_ssj+30
	BNE +
	RTS
+	LDX.w #30
-	LDA.l orbit_pal_goku_ssj,X
	STA.w !OBJ_PALS45+32,X
	DEX : DEX
	BPL -
	RTS

; ---------------------------------------------------------------------------
; Vblank side (orbit_nmi_obj_palettes, after palettes 0-1; M16/X16, DMA
; channel 7 set for $2122). Neither uses the frame's scratch or the
; multiplier and divider (the frame may be using them).

; The whiteout (w > 0): palettes 4-7 from level w (palette 4 with this
; frame's band colours, Goku's in 5, Frieza's own, red or white in 6).
wash_obj_palettes:
	LDY.w #(!XDATA_ORBIT_WASH)>>16
	LDA.w !v_band
	AND.w #$0001
	BEQ +
	LDA.w #!OWASH_BLUE1-!OWASH_BLUE0
+	CLC : ADC.w #!OWASH_BLUE0
	CLC : ADC.w !wv_base
	LDX.w #192
	JSR wash_dma32
	LDA.w #!OWASH_SSJ
	CLC : ADC.w !wv_base
	LDX.w #208
	JSR wash_dma32
	LDA.w !wv_p6
	CLC : ADC.w !wv_base
	LDX.w #224
	JSR wash_dma32
	LDA.w #!OWASH_GOLD
	CLC : ADC.w !wv_base
	LDX.w #240
	JSR wash_dma32
	LDA.w #!OWASH_FIRE             ; palette 0: the fire and the distant bodies
	CLC : ADC.w !wv_base
	LDX.w #128
	JMP wash_dma32

; Frieza's death flash before the whiteout (w = 0, A16 = wv_p6: red or
; white): palette 6 his, palette 7 the gold.
wash_frieza_palettes:
	LDY.w #orbit_pal_frieza_red>>16
	LDX.w #224
	CMP.w #!OWASH_RED
	BNE +
	LDA.w #orbit_pal_frieza_red
	BRA ++
+	LDA.w #orbit_pal_frieza_white
++	JSR wash_dma32
	LDA.w #orbit_obj_pals_67+32
	LDY.w #orbit_obj_pals_67>>16
	LDX.w #240
	JMP wash_dma32

; 32 bytes from Y16:A16 (bank, address) to CGRAM X16. Keeps Y.
wash_dma32:
	STA.w $4372
	LDA.w #32
	STA.w $4375
	SEP #$20
	TXA
	STA.w $2121
	TYA
	STA.w $4374
	LDA.b #$80
	STA.w $420B
	REP #$20
	RTS
