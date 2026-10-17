; Mantis Ant's victory beat (engine/boss-victory.js) for Frieza's fall:
; the native death cue on the fatal hit, explosion bursts, the music fade,
; Frieza flashing red and white until he vanishes, the whiteout, the boss
; fanfare inside it, then the pouch chime after the fanfare. The orbit
; stream runs it in space through frieza_victory_start/_tick/_draw; on the
; ground (without the orbit stream) the fight ends here and event C7 follows.

; boss-victory.js bossVictoryTiming (frames from the fatal hit)
!FZV_FADE      = 143
!FZV_WHITE     = 306
!FZV_VANISH    = 326
!FZV_JINGLE    = 375
!FZV_REVEAL    = 631
!FZV_CLEAR     = 791
!FZV_ACQUIRE   = 375+540          ; the chime once the 540-frame fanfare ends
!FZV_DONE      = 375+540+120      ; then the 120-frame hold before travel

; frieza_victory_start: A16 = x, X16 = y (map) of the fallen Frieza. Any DB.
frieza_victory_start:
	PHB
	PHP
	REP #$30
	PEA $7E7E
	PLB
	PLB
	STA.l !fzv_x
	TXA
	STA.l !fzv_y
	LDA.w #$0000
	STA.l !fzv_age
	SEP #$20
	LDA.b #1
	STA.l !fzv_on
	REP #$20
	JSR fz_victory_cues               ; the death cue on the hit itself
	PLP
	PLB
	RTL

; frieza_victory_tick: advance one frame; C set while it runs. Any DB.
frieza_victory_tick:
	PHB
	PHP
	REP #$30
	PEA $7E7E
	PLB
	PLB
	LDA.l !fzv_on
	AND.w #$00FF
	BEQ .no
	LDA.l !fzv_age
	INC
	STA.l !fzv_age
	JSR fz_victory_cues
	PLP
	PLB
	SEC
	RTL
.no
	PLP
	PLB
	CLC
	RTL

; The SPC commands of the beat (bossVictoryCommands), queued through core.
fz_victory_cues:
	LDA.l !fzv_age
	BNE +
	LDA.w #$9402                      ; death: 02 94 0F 80
	LDX.w #$800F
	JMP fz_queue_sound
+	CMP.w #!FZV_FADE
	BNE +
	LDA.w #$8080                      ; fade: 80 80 00 00
	LDX.w #$0000
	JMP fz_queue_sound
+	CMP.w #!FZV_JINGLE
	BNE +
	; C3:0198 skips a song already selected: restart a cached fanfare
	SEP #$20
	LDA $1E05
	CMP.b #$18
	BNE ++
	LDA.b #$FF
	STA $1E05
++	REP #$20
	LDA.w #$1801                      ; jingle: 01 18 44 8F
	LDX.w #$8F44
	JMP fz_queue_sound
+	CMP.w #!FZV_ACQUIRE
	BNE +
	LDA.w #$D802                      ; acquire: 02 D8 00 88
	LDX.w #$8800
	JMP fz_queue_sound
+	; the bursts
	LDX.w #0
-	CMP.l fz_victory_bursts,X
	BEQ .burst
	INX
	INX
	CPX.w #13*2
	BCC -
	RTS
.burst
	PHX
	LDA.w #$1502                      ; burst: 02 15 0F 00
	LDX.w #$000F
	JSR fz_queue_sound
	PLX
	; a white-hot burst at orbitVectors[(i*7)&15] * (12 + i%4*5) / 256
	TXA
	LSR
	STA !fz_t0                        ; i
	CMP.w #12
	BCS .out                          ; the last one has no burst of its own
	ASL
	ASL
	ASL
	SEC
	SBC !fz_t0                        ; i * 7
	AND.w #$000F
	ASL
	ASL
	TAX
	LDA.l frieza_orbit_vectors,X
	STA !fz_t1
	LDA.l frieza_orbit_vectors+2,X
	STA !fz_t2
	LDA !fz_t0
	AND.w #$0003
	STA !fz_t3
	ASL
	ASL
	CLC
	ADC !fz_t3
	CLC
	ADC.w #12                         ; 12 + i%4*5
	TAY
	LDA !fz_t1
	JSR fz_smul_dist
	CLC
	ADC.l !fzv_x
	STA !fz_ax
	LDA !fz_t2
	JSR fz_smul_dist
	CLC
	ADC.l !fzv_y
	SEC
	SBC.w #16
	STA !fz_ay
	JSR fz_fx_explode
.out
	RTS
fz_victory_bursts:
	dw 36,56,76,96,116,137,157,177,197,217,237,257,326

; A16 = vector component (8.8), Y16 = distance -> A16 = v * d / 256.
fz_smul_dist:
	STA !fz_t5
	TYA
	LDY !fz_t5
	JMP fz_smul88

; A16 = command bytes 0-1, X16 = bytes 2-3: through core's sound queue.
fz_queue_sound:
	JSL core_sound_queue
	RTS

; Frieza's colours during the beat (bossDeathColor phases): red on phases
; 0-1, white on 2-3; a phase lasts 8 frames, 4 after 180. A16 = variant.
fz_victory_variant:
	LDA.l !fzv_age
	CMP.w #180
	BCS .fast
	LSR
	LSR
	LSR
	BRA +
.fast
	LSR
	LSR
+	AND.w #$0003
	CMP.w #2
	BCS .white
	LDA.w #1
	RTS
.white
	LDA.w #2
	RTS

; bossVictoryWhite(age) as 0-31: the screen whitens from 143 to 306, holds
; to 631 and clears by 791.
fz_victory_white:
	LDA.l !fzv_age
	CMP.w #!FZV_FADE
	BCC .none
	CMP.w #!FZV_WHITE
	BCS .held
	; floor(31 * (age - 143) / 163)
	SEC
	SBC.w #!FZV_FADE
	STA !fz_m0
	LDA.w #31
	STA !fz_m1
	JSR fz_mul16
	LDA !fz_m2
	LDX.w #163
	JMP fz_divx
.held
	CMP.w #!FZV_REVEAL
	BCS +
	LDA.w #31
	RTS
+	CMP.w #!FZV_CLEAR
	BCS .none
	; ceil(31 * (791 - age) / 160)
	EOR.w #$FFFF
	SEC
	ADC.w #!FZV_CLEAR
	STA !fz_m0
	LDA.w #31
	STA !fz_m1
	JSR fz_mul16
	LDA !fz_m2
	CLC
	ADC.w #159
	LDX.w #160
	JMP fz_divx
.none
	LDA.w #0
	RTS

; ---------------------------------------------------------------------------
; The ground ending of the fight (frieza.js win() and the won branch when
; the orbit stream is not built in).

; win(): stage won, attacks dropped, the beat starts at Frieza.
fz_win:
	LDA.w #!FZST_WON
	JSR fz_set_stage
	STZ !fzf_hp_lo
	STZ !fzf_hp_hi
	STZ !fzf_age
	JSR fz_drop_attacks
	JSR fz_scene_clear
	LDA.w #!FZW_CANCEL
	TSB !fz_pend
	LDA.w #$00F0                      ; stop: F0 00 00 00
	LDX.w #$0000
	JSR fz_queue_sound
	LDA !fzf_x
	LDX !fzf_y
	JSL frieza_victory_start
	RTS

; The won stage on the ground: the beat, then the victory event once the
; fanfare and the chime are done (frieza.js requests F.victory at landed).
fz_won_tick:
	JSR fz_stage
	CMP.w #!FZST_WON
	BNE .out
	LDA $DC
	CMP.w #246
	BNE .out
	JSR fz_battle_space
	BCS .out                          ; the orbit stream's
	JSR fz_native_field
	BCC .out
	JSL frieza_victory_tick
	BCC .request
	JSR fz_victory_white
	SEP #$20
	STA.l !fzv_white
	BEQ +
	LDA.b #!FZT_WHITE                 ; the vblank whitens this frame
	TSB !fz_tflags
+	REP #$20
	LDA.l !fzv_age
	CMP.w #!FZV_DONE
	BCC .out
	SEP #$20
	LDA.b #0
	STA.l !fzv_on
	STA.l !fzv_white
	REP #$20
.request
	JSR fz_can_act
	BCC .out
	LDA.w #$00C7
	LDX.w #$0000
	JSL story_api_request
.out
	RTS

; Frieza's last frames (pose 7, the death flashes) until he vanishes.
fz_won_draw:
	JSR fz_stage
	CMP.w #!FZST_WON
	BNE .out
	LDA $DC
	CMP.w #246
	BNE .out
	JSR fz_battle_space
	BCS .out
	LDA.l !fzv_on
	AND.w #$00FF
	BEQ .out
	LDA.l !fzv_age
	CMP.w #!FZV_VANISH
	BCS .out
	JSR fz_camera
	JSR fz_victory_variant
	SEP #$20
	STA !fz_spr_var
	REP #$20
	LDA.w #6
	ORA !fz_atlas
	STA !fz_spr_id
	LDA !fzf_x
	SEC
	SBC !fz_cam_x
	STA !fz_spr_x
	LDA !fzf_y
	CLC
	ADC.w #8
	SEC
	SBC !fz_cam_y
	STA !fz_spr_y
	STZ !fz_spr_fl
	JSR fz_spr_draw
.out
	RTS

; Whiteout in vblank (DB = $80): fixed-colour addition on every layer while
; this frame's logic asked for it; the map's own colour math (C2:AAB3:
; CGWSEL 2, CGADSUB = $23) comes back the vblank after it ends.
fz_won_nmi:
	LDA.l $7E0000|!fz_tflags
	AND.w #!FZT_WHITE
	BEQ .off
	SEP #$20
	LDA.b #$00
	STA $2130                         ; colour math always on, fixed colour
	LDA.b #$3F
	STA $2131                         ; add to every layer and the backdrop
	LDA.l !fzv_white
	AND.b #$1F
	ORA.b #$E0
	STA $2132                         ; R = G = B = white amount
	REP #$20
	RTS
.off
	LDA.l $7E0000|!fz_tflags
	AND.w #!FZT_WPREV
	BEQ .out
	SEP #$20
	LDA.b #$02
	STA $2130
	LDA.l $000023
	STA $2131
	LDA.b #$E0
	STA $2132
	REP #$20
.out
	RTS
