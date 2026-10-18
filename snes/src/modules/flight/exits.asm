; Opening field exits and NPC pass-through (native-local-flight.js cycle
; hooks at C0:D84C and C1:CFE5 / C1:D017).

; ---------------------------------------------------------------------------
; 00:D849 (replaced STA $08 / TAY / LDA [$0A],Y), M16 X16, DB = $7E: the
; movement step samples its destination metatile after collision. On the
; four opening-path maps (128-131) an airborne hero moving out through a
; passage whose marker (behaviour bit 7) maps to that passage's door event
; samples the marker instead, so the native door, fade, camera and party
; movement run as when walking through it ($08 keeps the real destination).
fl_hook_d849:
	STA $08
	TAY
	LDA $10
	BNE .native
	LDA.w !fl_hook
	AND.w #!FLH_PHASE
	BEQ .native
	LDA.w !fl_mflags
	AND.w #!FLM_OPENING
	BEQ .native
	PHX
	PHY
	JSR fl_step_eligible
	BCC .pull
	JSR fl_flight_exit
	BCC .pull
	PLY
	TAY                          ; the exit's marker cell
	PLX
	LDA [$0A],Y
	JML $00D84E
.pull
	PLY
	PLX
.native
	LDA [$0A],Y
	JML $00D84E

; flightExit(): carry set with A = idx (layer 0) of the exit's marker.
fl_flight_exit:
	LDA $E00B
	AND.w #$0080
	BNE .no                      ; layer 0 only
	LDA $1E
	JSR fl_unpack
	STA.w !fl_t0                 ; dx
	LDA $1F
	JSR fl_unpack
	STA.w !fl_t1                 ; dy
	LDA $E002
	CLC
	ADC.w !fl_t0
	STA.w !fl_t2                 ; x + dx
	CMP.w !fl_wpx
	BCS .no
	LDA $E004
	CLC
	ADC.w !fl_t1
	STA.w !fl_t3                 ; y + dy
	CMP.w !fl_hpx
	BCS .no
	; the destination must not be a marker itself
	AND.w #$FFF0
	ASL : ASL : ASL
	STA.w !fl_t4
	LDA.w !fl_t2
	LSR : LSR : LSR : LSR
	ORA.w !fl_t4
	TAX
	JSR fl_fetch
	LDA.w !fl_d_beh
	AND.w #$0080
	BNE .no
	LDX.w #$0000
.exit
	LDA.l fl_opening_exits,X
	CMP.w #$FFFF
	BEQ .no
	CMP $DC
	BNE .next
	JSR fl_exit_match
	BCS .yes
.next
	TXA
	CLC
	ADC.w #9
	TAX
	BRA .exit
.no
	CLC
	RTS
.yes
	SEC
	RTS

; X = offset of an fl_opening_exits row (map, x, y, n, axis, sign, door|$800)
; for this map. Carry set with A = its marker idx when the move goes out
; through it. Preserves X.
fl_exit_match:
	; only a movement out through the passage counts: sign of dx (axis 0)
	; or dy (axis 1) equal to the exit's
	LDA.l fl_opening_exits+5,X
	AND.w #$00FF
	BEQ +
	LDA.w !fl_t1
	BRA ++
+	LDA.w !fl_t0
++	BEQ .no1
	BMI .neg
	LDA.w #$0001
	BRA .sign
.neg
	LDA.w #$00FF
.sign
	STA.w !fl_t4
	LDA.l fl_opening_exits+6,X
	AND.w #$00FF
	CMP.w !fl_t4
	BEQ .dir
.no1
	CLC
	RTS
.dir
	; along: within the exit's tile on its axis; across: the passage and
	; two tiles either side
	LDA.l fl_opening_exits+5,X
	AND.w #$00FF
	BNE .vert
	LDA.l fl_opening_exits+2,X   ; exit x (along)
	AND.w #$00FF
	ASL : ASL : ASL : ASL
	EOR.w #$FFFF
	SEC
	ADC.w !fl_t2                 ; x - start
	CMP.w #16
	BCS .no1
	LDA.l fl_opening_exits+3,X   ; exit y (edge)
	AND.w #$00FF
	ASL : ASL : ASL : ASL
	STA.w !fl_t4
	LDA.w !fl_t3                 ; across = y
	BRA .across
.vert
	LDA.l fl_opening_exits+3,X   ; exit y (along)
	AND.w #$00FF
	ASL : ASL : ASL : ASL
	EOR.w #$FFFF
	SEC
	ADC.w !fl_t3                 ; y - start
	CMP.w #16
	BCS .no1
	LDA.l fl_opening_exits+2,X   ; exit x (edge)
	AND.w #$00FF
	ASL : ASL : ASL : ASL
	STA.w !fl_t4
	LDA.w !fl_t2                 ; across = x
.across
	; across - (edge - 32) < n*16 + 64
	CLC
	ADC.w #32
	SEC
	SBC.w !fl_t4
	STA.w !fl_t4
	LDA.l fl_opening_exits+4,X   ; n
	AND.w #$00FF
	ASL : ASL : ASL : ASL
	CLC
	ADC.w #64
	CMP.w !fl_t4
	BEQ .no
	BCC .no
	; the exit tile is a marker whose trigger is this exit's door event
	LDA.l fl_opening_exits+3,X
	AND.w #$00FF
	XBA
	LSR                          ; y * 128
	STA.w !fl_t4
	LDA.l fl_opening_exits+2,X
	AND.w #$00FF
	ORA.w !fl_t4
	STA.w !fl_t4                 ; marker idx
	PHX
	TAX
	JSR fl_fetch
	PLX
	LDA.w !fl_d_beh
	AND.w #$0080
	BEQ .no
	LDA $4D
	AND.w #$00FF
	STA.w !fl_t5
	LDA.w !fl_d_tile
	SEC
	SBC.w !fl_t5
	BCC .no                      ; tile < $4D
	STA.w !fl_t5
	LDA $B8
	AND.w #$0004
	BEQ +
	INC.w !fl_t5
+	LDA.w !fl_t5
	ASL
	STA.w !fl_t5
	PHX
	LDA $DC
	ASL
	TAX
	LDA.l $C84000,X              ; the map's trigger table
	CLC
	ADC.w !fl_t5
	TAX
	LDA.l $C80000,X
	PLX
	CMP.l fl_opening_exits+7,X   ; door event $800 | door
	BNE .no
	LDA.w !fl_t4
	SEC
	RTS
.no
	CLC
	RTS

; ---------------------------------------------------------------------------
; NPC pass-through. Actor contact (C1:CFxx) has already run interaction
; scripts; an airborne Goku passes over an NPC (species >= $80) without
; pushing either actor. Enemy hits and conversations on the ground keep the
; native handling. X/Y = the two actors' offsets.
; 01:CFE5 (replaced SEP #$20 / LDA $E074,Y)
fl_hook_cfe5:
	JSR fl_npc_pass
	BCS .pass
	SEP #$20
	LDA $E074,Y
	JML $01CFEA
.pass
	JML $01CFE4                  ; the contact routine's RTS
; 01:D017 (replaced LDA $E006,X / BEQ $D042), reached with either M width
fl_hook_d017:
	JSR fl_npc_pass
	BCS .pass
	LDA.w $E006,X
	BEQ +
	JML $01D01C
+	JML $01D042
.pass
	JML $01CFE4

; Carry set when this contact is Goku (phasing, eligible) with an NPC.
; Preserves P (except carry), X and Y. DB = $7E, X16.
fl_npc_pass:
	PHP
	REP #$20
	LDA.w !fl_hook
	AND.w #!FLH_PHASE
	BEQ .no
	; other = X == 0 ? Y : (Y == 0 ? X : none)
	TXA
	BEQ .y
	TYA
	BNE .no
	TXA
	BRA .other
.y
	TYA
.other
	CMP.w #$0600
	BCC .no
	CMP.w #$1800
	BCS .no
	PHX
	PHY
	TAX
	LDA.l $7EE000,X
	AND.w #$0001
	BEQ .pull
	LDA.l $7EE180,X
	AND.w #$0080
	BEQ .pull                    ; an enemy (species < $80)
	JSR fl_step_eligible
	BCC .pull
	PLY
	PLX
	PLP
	SEC
	RTS
.pull
	PLY
	PLX
.no
	PLP
	CLC
	RTS
