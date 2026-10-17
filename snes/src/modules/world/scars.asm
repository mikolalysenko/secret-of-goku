; Permanent craters on the world map (engine/world-scars.js): a strong
; aerial wave scars the landscape where it lands; towns within 0.4 x the
; crater size are destroyed (Potos-hole crater art, persistent until the
; restoration wish). Persistent list in !pw_scars: +0 word x | size<<12
; (size 0: 144 px, 1: 224 px for the full SSJ wave), +2 word y.

; world_scar_strike: A16 = world x, X16 = world y, Y16 = shot flags (bit 0
; mega). M16/X16, DB = $7E.
world_scar_strike:
	AND.w #$0FFF
	STA.w !w_scratch+0               ; x
	TXA
	AND.w #$0FFF
	STA.w !w_scratch+2               ; y
	TYA
	AND.w #!SF_MEGA
	STA.w !w_scratch+4               ; size bit
	; towns inside the blast (hypot < size * .4: 57.6 / 89.6 px)
	STZ.w !w_scratch+6               ; fresh towns found
	LDA.w #$FFFF
	STA.w !w_msg_arg
	LDY.w #$0000
.town
	PHY
	TYA
	ASL
	TAX
	LDA.l world_town_maps,X
	ASL
	TAX
	LDA.l $C67A80,X
	PHA
	AND.w #$00FF
	ASL
	ASL
	ASL
	ASL
	STA.w !w_scratch+8               ; town x
	PLA
	XBA
	AND.w #$00FF
	ASL
	ASL
	ASL
	ASL
	STA.w !w_scratch+10              ; town y
	LDX.w #3318                      ; 57.6^2
	LDA.w !w_scratch+4
	BEQ +
	LDX.w #8028                      ; 89.6^2
+	STX.w !w_scratch+12
	LDA.w !w_scratch+8
	LDX.w !w_scratch+0
	JSR world_delta
	TAY
	LDA.w !w_scratch+10
	LDX.w !w_scratch+2
	JSR world_delta
	TAX
	TYA
	JSR world_dist2                  ; C set when beyond 255 px
	BCS .nextTown
	CMP.w !w_scratch+12
	BCS .nextTown
	; destroyed: mark the town, remember the first fresh one
	LDA $01,S
	ASL
	TAX
	LDA.l world_bit,X
	STA.w !w_scratch+14
	AND.l !pw_towns
	BNE .nextTown
	LDA.l !pw_towns
	ORA.w !w_scratch+14
	STA.l !pw_towns
	LDA.w !w_msg_arg
	CMP.w #$FFFF
	BNE .nextTown
	LDA $01,S
	STA.w !w_msg_arg
.nextTown
	PLY
	INY
	CPY.w #!WORLD_TOWN_COUNT
	BCS +
	JMP .town
+
	; merge into a crater within 24 px, else add one
	LDA.l !pw_count
	AND.w #$00FF
	ASL
	ASL
	STA.w !w_scratch+12              ; end offset
	LDY.w #$0000
.scan
	CPY.w !w_scratch+12
	BCS .add
	TYX
	LDA.l !pw_scars,X
	AND.w #$0FFF
	LDX.w !w_scratch+0
	JSR world_delta
	PHA
	TYX
	LDA.l !pw_scars+2,X
	LDX.w !w_scratch+2
	JSR world_delta
	TAX
	PLA
	JSR world_dist2
	BCS .nextScar
	CMP.w #576                       ; 24^2
	BCS .nextScar
	; grow it to the larger size
	LDA.w !w_scratch+4
	BEQ .done
	TYX
	LDA.l !pw_scars,X
	ORA.w #$1000
	STA.l !pw_scars,X
	BRA .done
.nextScar
	INY
	INY
	INY
	INY
	BRA .scan
.add
	LDA.l !pw_count
	AND.w #$00FF
	CMP.w #!WORLD_MAX_SCARS
	BCS .done                        ; list full: towns are still marked
	ASL
	ASL
	TAX
	LDA.w !w_scratch+4
	BEQ +
	LDA.w #$1000
+	ORA.w !w_scratch+0
	STA.l !pw_scars,X
	LDA.w !w_scratch+2
	STA.l !pw_scars+2,X
	SEP #$20
	LDA.l !pw_count
	INC
	STA.l !pw_count
	REP #$20
	TXA
	LSR
	LSR
	STA.w !w_scar_id
	JSR world_scar_refresh
.done
	; King Kai's collateral remark for the first fresh town
	LDA.w !w_msg_arg
	CMP.w #$FFFF
	BEQ +
	LDA.w #!MSG_TOWN
	JSR world_message
+	RTS

; A16 = dx, X16 = dy (signed) -> A16 = dx^2 + dy^2, C clear; C set when
; either |d| > 255 (out of every radius used here). Clobbers X/Y.
world_dist2:
	PHX
	JSR .sq
	BCS .far
	PHA
	LDA $03,S
	JSR .sq
	BCS .far2
	CLC
	ADC $01,S
	BCS .far2                        ; > 65535
	PLX
	PLX
	CLC
	RTS
.far2
	PLX
.far
	PLX
	SEC
	RTS
.sq
	BPL +
	EOR.w #$FFFF
	INC
+	CMP.w #256
	BCS +
	SEP #$20
	STA.l $004202
	STA.l $004203
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	CLC
+	RTS

; Crater art for a new crater (Mode 7 tiles: next milestone). Placeholder
; keeps the refresh bookkeeping in one place.
world_scar_refresh:
	RTS
