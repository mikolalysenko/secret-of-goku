; The Fortress's collapse (engine/fortress-collapse.js): once Goku's wave
; destroyed the Mana Fortress (the world module's flag), its deck (map 255)
; keeps breaking up. Three fractures where the view settles, one every 32
; frames after (with the break sound and a 5-frame pulse), scars drawn by
; the holes renderer in the deck's colours, and a warm tint with a red
; alarm pulse every 84 frames. The world module sends the crisis cue and the
; post-destruction event; flight's canLand keeps fractures on real floor.
;
; Tint: the browser adds 2 + alarm to red and takes 2 + alarm/2 from green
; and 3 + alarm/2 from blue on BG1/BG2. The deck has no colour math of its
; own, so the cartridge adds the fixed colour (2 + alarm, 0, 0) to BG1 and
; BG2 in vblank: the red alarm; colour math has one operation, so the
; green/blue loss is left out (frieza.md, Known differences).

fz_collapse_tick:
	JSR fz_collapse_active
	BCS +
	RTS
+	; the deck owns the arena from now on
	LDA.l !fzs_arena_map
	CMP.w #255
	BEQ +
	JSR fz_arena_clear                ; map 255, no holes yet
	LDA.w #0
	STA.l !fzc_age
	STA.l !fzc_n
+	; the tint every frame (the alarm phase is the age's)
	JSR fz_collapse_tint
	; the rest pauses with the native field (menus, events, a fallen Goku)
	JSR fz_native_field
	BCS +
	RTS
+	LDA $E000
	AND.w #$0001
	BNE +
	RTS
+	LDA $EC
	AND.w #$00FE
	BEQ +
	RTS
+	; spots: recomputed when none are left or the view moved 128 px
	LDA.l !fzc_n
	BEQ .spots
	LDA $A8
	SEC
	SBC.l !fzc_cx
	JSR fz_abs
	CMP.w #129
	BCS .spots
	LDA $AA
	SEC
	SBC.l !fzc_cy
	JSR fz_abs
	CMP.w #129
	BCC .age
.spots
	JSR fz_collapse_spots
	LDA.l !fzc_n
	BNE +
	RTS
+	; three fractures at once: spots[floor(i * n / 3)], radius 14 + 3i
	LDA.w #0
-	PHA
	JSR fz_collapse_third
	PLA
	PHA
	ASL
	CLC
	ADC $01,S
	CLC
	ADC.w #14                         ; 14 + 3i
	JSR fz_break_floor
	PLA
	INC
	CMP.w #3
	BCC -
.age
	LDA.l !fzc_age
	INC
	STA.l !fzc_age
	AND.w #$001F
	CMP.w #1
	BNE .out
	; every 32 frames: spots[(floor(age / 32) * 7 + 3) % n], 12 + floor(age/32)%3 * 5
	LDA.l !fzc_age
	LSR
	LSR
	LSR
	LSR
	LSR
	STA !fz_t6                        ; floor(age / 32)
	ASL
	ASL
	ASL
	SEC
	SBC !fz_t6                        ; * 7
	CLC
	ADC.w #3
	PHA
	LDA.l !fzc_n
	TAX
	PLA
	JSR fz_divmod                     ; A16 = remainder
	JSR fz_collapse_spot
	LDA !fz_t6
	LDX.w #3
	JSR fz_divmod
	STA !fz_t7
	ASL
	ASL
	CLC
	ADC !fz_t7                        ; * 5
	CLC
	ADC.w #12
	JSR fz_break_floor
	LDA.w #!FZ_SFX_FORTRESS
	JSR fz_sfx
	LDA.w #5
	JMP fz_pulse
.out
	RTS

; C set while the collapse runs: on, map 255 in Mode 1, the Fortress
; destroyed, no ending owning the player.
fz_collapse_active:
	LDA $DC
	CMP.w #255
	BNE .no
	LDA $29
	AND.w #$0004
	BNE .no
	JSR fz_on
	BCC .no
	JSR fz_bind_ending_active
	BCS .no
	JSR fz_bind_fortress_destroyed
	RTS
.no
	CLC
	RTS

; A16 = i (0-2) -> !fz_ax/!fz_ay = spots[floor(i * n / 3)].
fz_collapse_third:
	STA !fz_m0
	LDA.l !fzc_n
	STA !fz_m1
	JSR fz_mul16
	LDA !fz_m2
	LDX.w #3
	JSR fz_divmod
	LDA !fz_m5
; A16 = spot index -> !fz_ax/!fz_ay.
fz_collapse_spot:
	ASL
	ASL
	TAX
	LDA.l !FZC_SPOTS,X
	STA !fz_ax
	LDA.l !FZC_SPOTS+2,X
	STA !fz_ay
	RTS

; The spot grid: every 32 px (x 16-240, y 32-192) of the view, away from
; Goku (26 px) and on landable floor.
fz_collapse_spots:
	LDA $A8
	STA.l !fzc_cx
	LDA $AA
	STA.l !fzc_cy
	LDA.w #0
	STA.l !fzc_n
	LDA.w #32
	STA !fz_t1                        ; y
.row
	LDA.w #16
	STA !fz_t0                        ; x
.col
	LDA !fz_t0
	CLC
	ADC $A8
	STA !fz_t5                        ; world x
	LDA !fz_t1
	CLC
	ADC $AA
	STA !fz_t6                        ; world y
	LDA !fz_t5
	SEC
	SBC $E002
	PHA
	LDA !fz_t6
	SEC
	SBC $E004
	TAX
	PLA
	LDY.w #26
	JSR fz_dist_lt                    ; C set: too close to Goku
	BCS .next
	JSR fz_bind_can_land              ; (!fz_t5, !fz_t6)
	BCC .next
	LDA.l !fzc_n
	ASL
	ASL
	TAX
	LDA !fz_t5
	STA.l !FZC_SPOTS,X
	LDA !fz_t6
	STA.l !FZC_SPOTS+2,X
	LDA.l !fzc_n
	INC
	STA.l !fzc_n
.next
	LDA !fz_t0
	CLC
	ADC.w #32
	STA !fz_t0
	CMP.w #256
	BCC .col
	LDA !fz_t1
	CLC
	ADC.w #32
	STA !fz_t1
	CMP.w #208
	BCC .row
	RTS

; alarm = phase < 16 ? round(sin(phase * pi / 16) * 9) : 0, phase = age % 84;
; the vblank subtracts (0, 2 + alarm/2, 3 + alarm/2) from BG1 and BG2.
fz_collapse_tint:
	LDA.l !fzc_age
	LDX.w #84
	JSR fz_divmod                     ; A16 = phase
	CMP.w #16
	BCC +
	LDA.w #0
	BRA ++
+	TAX
	LDA.l fz_alarm_table,X
	AND.w #$00FF
++	SEP #$20
	STA.l !fzv_white                  ; the alarm level for the vblank
	LDA.b #2
	STA.l !fzv_mode
	LDA.b #!FZT_WHITE
	TSB !fz_tflags
	REP #$20
	RTS
fz_alarm_table:                       ; round(sin(i * pi / 16) * 9), i = 0-15
	db 0, 2, 3, 5, 6, 7, 8, 9, 9, 9, 8, 7, 6, 5, 3, 2
