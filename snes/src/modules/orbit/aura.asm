; Ki auras (ki-aura.js drawKiAura at height 16, as frieza-orbit-view.js and
; frieza-finale-view.js draw them): Goku's gold while he charges the wave
; (power min(1, charge / 45)) or focuses (.25 + .45 powerCharge / 96),
; Frieza's pink (power 1, seed 5) while he warns of a beam; in the finale
; Frieza's while he gathers and charges and in Frieza's surges, Goku's
; while he charges. Shown on the even frames of the clock (the browser's
; temporal transparency), behind the fighter.
;
; The generator makes a picture per level (1-8; Frieza's 8 only) and phase
; ((floor(age / 3) + seed) mod 12): a 32x32 cell whose (12, 22) is the
; character's place. It goes into the third slot of the beam group the
; fighter is not firing (Goku: slot 2, OBJ $048; Frieza: slot 5, $084),
; free while that group has fewer than three chains, through the beam
; pictures' vblank queue (beam_queue), keyed $8000 | its index (gold:
; (level - 1) * 12 + phase, pink: 96 + phase). A beam that needs the slot
; takes it back; the aura then waits. DB = $32, M16/X16.

!AURA_GOKU_SLOT   = 4              ; slot 2, times 2 (OBJ $048)
!AURA_FRIEZA_SLOT = 10             ; slot 5, times 2 (OBJ $084)
!AURA_PINK        = 96             ; the first pink picture

; Frame side, after the beams' wants (fight_draw): this frame's pictures,
; au_want = Goku's, au_want+2 = Frieza's ($FFFF: none).
aura_wants:
	REP #$30
	LDA.w #$FFFF
	STA.w !au_want
	STA.w !au_want+2
	; Goku: the wave's charge, else the focus stance (no wave out)
	LDA.w !f_charge
	BEQ .focus
	CMP.w #46
	BCC +
	LDA.w #45
+	TAX
	LDA.l orbit_fx_aura_charge,X
	BRA .goku
.focus
	LDA.w !f_focus
	BEQ .frieza
	LDA.w !fb_on
	BNE .frieza
	LDX.w !f_power
	CPX.w #97
	BCC +
	LDX.w #96
+	LDA.l orbit_fx_aura_focus,X
.goku
	AND.w #$00FF
	DEC
	STA.w !au_tmp                  ; level - 1
	ASL
	CLC : ADC.w !au_tmp            ; * 3
	ASL : ASL                      ; * 12
	STA.w !au_tmp
	LDA.w !f_age
	LDY.w #0                       ; (seed)
	JSR aura_phase
	CLC : ADC.w !au_tmp
	ORA.w #$8000
	LDX.w #$0000
	JSR aura_slot_free
	BCC .frieza
	STA.w !au_want
.frieza
	LDA.w !w_kind
	CMP.w #!WK_BEAM
	BNE .done
	JSR aura_frieza_key
	LDX.w #$0002
	JSR aura_slot_free
	BCC .done
	STA.w !au_want+2
.done
	RTS

; The finale's (frieza-finale-view.js, its clock fn_age): Frieza's while
; he gathers and charges and through his surges, Goku's (power 1) while he
; charges.
aura_wants_finale:
	REP #$30
	LDA.w #$FFFF
	STA.w !au_want
	STA.w !au_want+2
	LDA.w !fn_phase
	CMP.w #!FN_GATHER
	BEQ .frieza
	CMP.w #!FN_CHARGE
	BEQ .charge
	JSR finale_surge               ; (the struggle's surges; 0 otherwise)
	BEQ .done
	BRA .frieza
.charge
	LDA.w !f_charge
	BEQ .frieza
	LDA.w !fn_age
	LDY.w #0
	JSR aura_phase
	CLC : ADC.w #7*12              ; level 8
	ORA.w #$8000
	LDX.w #$0000
	JSR aura_slot_free
	BCC .frieza
	STA.w !au_want
.frieza
	LDA.w !fn_age
	JSR aura_frieza_key_at
	LDX.w #$0002
	JSR aura_slot_free
	BCC .done
	STA.w !au_want+2
.done
	RTS

; A16 = Frieza's picture for the clock in f_age (keeps nothing).
aura_frieza_key:
	LDA.w !f_age
aura_frieza_key_at:
	LDY.w #5                       ; (seed)
	JSR aura_phase
	CLC : ADC.w #!AURA_PINK
	ORA.w #$8000
	RTS

; A16 = (floor(A16 / 3) + Y16) mod 12.
aura_phase:
	STA.w $4204
	SEP #$20
	LDA.b #3
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	TYA
	CLC : ADC.w $4214
	STA.w $4204
	SEP #$20
	LDA.b #12
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4216
	RTS

; Carry set when group X's third slot is free for an aura (the group off
; or fewer than three chains). Keeps A.
aura_slot_free:
	PHA
	LDA.w !bw_key,X
	CMP.w #$FFFF
	BEQ .yes
	LDA.w !bw_j,X
	CMP.w #2
	BCS .no
.yes
	PLA
	SEC
	RTS
.no
	PLA
	CLC
	RTS

; OAM, behind the fighter (after its sprite): Goku's at (f_hx, f_hy),
; Frieza's at (b_x, b_y), on the even frames of the clock in A (its low
; byte will do: the fighters' drawing may return with M8), while the slot
; holds an aura picture.
aura_draw_goku:
	REP #$30
	LDY.w !au_want
	CPY.w #$FFFF
	BEQ .no
	LSR
	BCS .no
	LDA.w !bs_have+!AURA_GOKU_SLOT
	BPL .no                        ; (bit 15: an aura's picture)
	LDA.w !f_hx
	SEC : SBC.w #12
	STA.w !d_x
	LDA.w !f_hy
	SEC : SBC.w #22
	STA.w !d_y
	LDA.w #$048|(!OFX_PAL_GOLD<<9)|!OA_PRI
	BRA aura_put
.no
	RTS

aura_draw_frieza:
	REP #$30
	LDY.w !au_want+2
	CPY.w #$FFFF
	BEQ .no
	LSR
	BCS .no
	LDA.w !bs_have+!AURA_FRIEZA_SLOT
	BPL .no
	LDA.w !b_x
	SEC : SBC.w #12
	STA.w !d_x
	LDA.w !b_y
	SEC : SBC.w #22
	STA.w !d_y
	LDA.w #$084|(!OFX_PAL_PINK<<9)|!OA_PRI
	BRA aura_put
.no
	RTS

aura_put:
	STA.w !d_ta
	LDA.w #$0001
	STA.w !d_big
	JMP ofx_put

; After the beams' queue (beam_queue): each wanted aura picture its slot
; lacks, while the queue has room.
aura_queue:
	REP #$30
	LDX.w #$0000
	JSR .one
	LDX.w #$0002
.one
	LDA.w !bq_n
	CMP.w #4
	BCS .out
	LDA.w !au_want,X
	CMP.w #$FFFF
	BEQ .out
	STA.w !bg_tmp+12               ; key
	LDY.w #!AURA_GOKU_SLOT
	CPX.w #$0000
	BEQ +
	LDY.w #!AURA_FRIEZA_SLOT
+	STY.w !bg_tmp+2
	CMP.w !bs_have,Y
	BEQ .out
	; its picture: index * 512 in orbit_aura_a (0-47) or orbit_aura_b
	AND.w #$00FF
	CMP.w #48
	BCS .b
	XBA : ASL
	CLC : ADC.w #(!XDATA_ORBIT_AURA_A)&$FFFF
	STA.w !bg_tmp+8
	LDA.w #(!XDATA_ORBIT_AURA_A)>>16
	BRA .queue
.b
	SEC : SBC.w #48
	XBA : ASL
	CLC : ADC.w #(!XDATA_ORBIT_AURA_B)&$FFFF
	STA.w !bg_tmp+8
	LDA.w #(!XDATA_ORBIT_AURA_B)>>16
.queue
	STA.w !bg_tmp+10
	PHX
	LDA.w !bq_n
	ASL : ASL : ASL
	TAX
	LDA.w !bg_tmp+2 : STA.w !BQ_E+0,X
	LDA.w !bg_tmp+8 : STA.w !BQ_E+2,X
	LDA.w !bg_tmp+10 : STA.w !BQ_E+4,X
	LDA.w !bg_tmp+12 : STA.w !BQ_E+6,X
	INC.w !bq_n
	PLX
.out
	RTS
