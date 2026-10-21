; The wreck's blasts (engine/sandship-wreck.js tick's blasts and sandship.js
; crashTick), simplified for the cartridge.
;
; The browser burns fires all over the wrecked rooms (Exploder flames, rising
; embers, smoke) and makes a site explode every 150 frames (at 75): five
; Exploder bursts with the Fortress-break sound and a quake; the crash adds
; such a blast around Goku every 10 frames while he is aboard. Here the fires
; are left out: a flame cost fx about 9 scanlines and a burning burst 18-33,
; in rooms whose own logic already runs late. A blast is its sound, its quake
; and a red flash: the alarm's 24-frame pulse started over in the wreck's
; tint (!ssw_red, wreck.asm ss_pal_choose). The alarm and the firelight
; flicker still tint the rooms as in the browser.

if getfilestatus("audio/ids.asm") == 0
	incsrc "audio/ids.asm"
endif

; ---------------------------------------------------------------------------
; Field side (ss_visuals, inside the arc's window), M16/X16, DB = $7E: the
; flash's clock and the wreck's blast every 150 frames.
ss_blasts:
	LDA.l !ssw_red : CMP.w #24 : BCS +
	INC : STA.l !ssw_red
+	LDA.l !ss_flags : AND.w #!SSF_WRECK : BNE +
	RTS
+	LDA.l !ss_flash : CMP.w #128 : BCC +          ; none over a white screen
	RTS
+	LDA.w $00DC : JSR ss_ship_map : BCS +
	RTS
+	; at 75 of each 150 frames, once (the clock may stand still a frame)
	LDA.l !ssw_ck_150 : CMP.w #75 : BEQ +
	RTS
+	LDA.l !ssw_ck_q150 : CMP.l !ssw_blast_q : BNE +
	RTS
+	STA.l !ssw_blast_q
	LDA.w #6
; A = the quake's strength: the flash, the quake and the sound.
ss_wreck_blast:
	PHA
	LDA.w #0 : STA.l !ssw_red
	PLA
if defined("FX_EXPLODE")
	JSL fx_quake
endif
if defined("AUDIO_SFX_FORTRESS_BREAK")
	LDA.w #!AUDIO_SFX_FORTRESS_BREAK : JSL audio_sfx
endif
	RTS

; crashTick's blasts around Goku (every 10 frames of the crash while aboard,
; ss_crash_tick): A = the crash's age; the quake grows as the browser's
; pulse(4 + min(8, age >> 4)).
ss_crash_blast:
	PHA
	LDA.l !ss_flags : AND.w #!SSF_WRECK : BEQ .no
	LDA.w $00DC : JSR ss_ship_map : BCC .no
	LDA $01,S : LDX.w #10 : JSR dst_div16 : STA.l !ssw_tmp+4
	ASL : ASL : CLC : ADC.l !ssw_tmp+4 : ASL                ; q * 10
	EOR.w #$FFFF : SEC : ADC $01,S : BNE .no              ; not a multiple of 10
	LDA.l !ssw_tmp+4 : CMP.w #121 : BCS .no
	LDA $01,S : LSR : LSR : LSR : LSR : CMP.w #8 : BCC +
	LDA.w #8
+	CLC : ADC.w #4
	JSR ss_wreck_blast
.no
	PLA
	RTS
