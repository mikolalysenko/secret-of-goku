; Text panels (frieza-orbit-view.js textPanel with native-radio.js): the
; retail message window at the top of the screen. The picture's first
; !ORBIT_TEXT_LINES lines switch to Mode 1 (BG3 with priority, over
; everything) while a panel shows; BG3 map rows 1-8 hold the message's
; generated tiles (snes/gen/orbit-text.mjs, BG3 tiles $180-$1FF loaded with
; the scene). DB = $32, M16/X16.

!ORBIT_TEXT_LINES = 73             ; PPU lines 0-72 (the window: lines 9-72, the browser's rows 8-71)

; Frame side: which message shows (0: none).
text_frame:
	STZ.w !t_want
	LDA.w !f_on
	BEQ .set
	LDA.w !fn_phase
	BEQ .intro
	JSR text_finale
	BRA .set
.intro
	; frieza-cinematic.js orbitIntroText: 60 quiet frames, five 150-frame
	; lines, 45 quiet; after the intro Luna's remark from its age 0
	LDA.w !f_intro
	BNE +
	LDA.w !sc_aside
	CMP.w #91
	BCC .set
	LDA.w #!OTXT_LUNA
	STA.w !t_want
	BRA .set
+
	EOR.w #$FFFF
	SEC : ADC.w #!ORBIT_INTRO_FRAMES ; age = frames - remaining
	SEC : SBC.w #60
	BMI .set
	CMP.w #5*150
	BCS .set
	STA.w $4204
	SEP #$20
	LDA.b #150
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	CLC : ADC.w #!OTXT_INTRO1
	STA.w !t_want
.set
	; the band (Mode 1 lines) once a message's rows are in BG3: the vblank
	; that sends them also picks the panel's BG3 scroll, and the band
	; switches with the window rows in the next indirect set
	SEP #$20
	LDA.b #$00
	LDX.w !t_want
	BEQ +
	LDX.w !t_have
	BEQ +
	LDA.b #!ORBIT_TEXT_LINES
+	STA.w !g_text
	LDA.w !bd_end                  ; the finale's band layers are Mode 1 lines too
	CMP.w !g_text
	BCC +
	STA.w !g_text
+	REP #$30
	RTS

; frieza-finale-view.js: the phase's line (clashLines); the struggle's
; after 100 frames only during Frieza's surges; the victory's aftermath
; between the fanfare and the descent.
text_finale:
	LDA.w !fn_phase
	CMP.w #!FN_STRUGGLE
	BNE .notStruggle
	LDA.w !fn_age
	CMP.w #101
	BCC .phase
	JSR finale_surge               ; A = surge + 1
	BEQ .none
	CLC : ADC.w #!OTXT_SURGE1-1
	STA.w !t_want
	RTS
.notStruggle
	CMP.w #!FN_WIN
	BNE .phase
	LDA.w !fn_age
	CMP.w #!FNT_V_QUIET
	BCC .none
	CMP.w #!FNT_V_DESCENT
	BCS .none
	LDA.w #!OTXT_AFTERMATH
	STA.w !t_want
	RTS
.phase
	LDA.w !fn_phase
	CLC : ADC.w #!OTXT_GATHER-!FN_GATHER
	STA.w !t_want
.none
	RTS

; NMI side (DB = $32, M16): the map rows of a new message, or blank rows.
text_nmi:
	LDA.w !t_want
	CMP.w !t_have
	BNE +
	RTS
+	LDA.w #6
	JSR orbit_nmi_room
	BCC +
	RTS
+	LDA.w !t_want
	STA.w !t_have
	BEQ .blank
	DEC
	ASL : ASL : ASL : ASL          ; * 480 = (* 16) * 30
	STA.w !n_src
	ASL : ASL : ASL : ASL          ; * 256
	SEC : SBC.w !n_src             ; * 240
	ASL                            ; * 480
	CLC : ADC.w #orbit_text_maps
	STA.w !n_src
	LDA.w #orbit_text_maps>>16
	STA.w !n_bank
	LDA.w #60
	STA.w !n_len
	BRA .rows
.blank
	LDA.w #orbit_text_blank
	STA.w !n_src
	LDA.w #orbit_text_blank>>16
	STA.w !n_bank
	STZ.w !n_len                   ; (the same zero row each time)
.rows
	; 8 rows of 30 entries to BG3 map ($5800) rows 1-8, columns 1-30
	LDA.w #$5800+32+1
	STA.w !n_vram
	LDA.w #8
	STA.w !n_rows
	SEP #$20
	LDA.b #$80
	STA.w $2115
	LDA.w !n_bank
	STA.w $4374
	REP #$20
	LDA.w #$1801
	STA.w $4370
.row
	LDA.w !n_vram
	STA.w $2116
	CLC : ADC.w #32
	STA.w !n_vram
	LDA.w !n_src
	STA.w $4372
	CLC : ADC.w !n_len
	STA.w !n_src
	LDA.w #60
	STA.w $4375
	SEP #$20
	LDA.b #$80
	STA.w $420B
	REP #$20
	DEC.w !n_rows
	BNE .row
	RTS

; BG3 palettes 1 (window) and 2 (text), CGRAM 4-11, every vblank. A8.
text_palettes:
	LDA.b #4
	STA.w $2121
	REP #$20
	LDA.w #$2200                   ; DMA mode 0 to $2122
	STA.w $4370
	LDA.w #orbit_text_pal
	STA.w $4372
	LDA.w #16
	STA.w $4375
	SEP #$20
	LDA.b #orbit_text_pal>>16
	STA.w $4374
	LDA.b #$80
	STA.w $420B
	RTS

; BG3VOFS by HDMA (channel 5): -1 down to the panel's last line, then 0.
orbit_vofs_panel:
	db !ORBIT_TEXT_LINES : dw $03FF
	db 1 : dw $0000
	db 0
orbit_vofs_plain:
	db 1 : dw $0000
	db 0

orbit_text_blank:
	fillbyte $00 : fill 60
