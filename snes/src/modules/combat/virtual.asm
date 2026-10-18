; Virtual targets: enemies that are not native actors (mana-mod.js
; entities(): frieza.js entity() is index 12, joch-trial.js stands in for
; slot 3). Modules register them in snes/src/modules.asm:
;
;   modules_combat_targets:
;       dl <query>, <hit> : db <browser entity index>, <flags (!CVT_*)>
;
; query: C set while the target can be struck: A16 = species in the low
;        byte (the terrain byte, actor +$0B, in the high byte for Instant
;        Transmission's landing; combat ignores it), X16 = x, Y16 = y (map:
;        the point entity() reports, which the attack boxes test).
; hit:   A16 = Goku's damage, X16 = 1 while combat's action is a punch
;        (mana-mod.js hit() callers: action.kind === 'punch'), 0 otherwise.
;        Returns A16 = HP taken; 0 means no contact (hit().after >= before).
; Both are JSL with DB = $7E, D = 0, M16/X16; they may change A, X, Y and
; must preserve DB and D. A hit runs inside combat's step: it may queue
; work, but should defer combat_api_cancel to its own frame (frieza's
; fz_win does).
;
; Target bits: combat's target masks (ag_list, the ki shots' er_hits, the
; beam pulse timers) use bits 0-8 for actor slots 3-11 and bits 9-15 for
; table entries 0-6. Scans therefore visit the actors first, then the
; virtual targets in table order (frieza.js's index 12 also comes after the
; actors in the browser). The first scan of a field frame fills a cache
; with every entry's query (!vt_state); the targets change only through
; hits during combat's steps (scene modules tick at the frame end), so the
; cache serves every catch-up step. A hit makes it stale, so the next scan
; asks again and a fallen target leaves at once, as entity() returning null
; does. (!VT_TABLE, !VT_TABLE_LEN and !VT_BIT0 are defined in module.asm.)

; ---------------------------------------------------------------------------
; The virtual part of cb_targets: A16 = live entries (not 0); those inside
; the attack box (ag_*) join ag_list (bit 9 + entry). Clobbers cb_t4-cb_t9.
cb_vt_targets:
	STA !cb_t9                    ; live entries left
	LDX.w #$0000                  ; cache offset
	LDY.w #1<<!VT_BIT0            ; target bit
.entry
	LSR !cb_t9
	BCC .next
	LDA.l !VT_E+2,X
	SEC
	SBC !ag_x
	STA !cb_t4                    ; x
	LDA.l !VT_E+4,X
	SEC
	SBC !ag_cy
	SEC
	SBC !ag_y
	STA !cb_t5                    ; y
	JSR cb_along_across           ; A = along, cb_t6 = across (keeps X, Y)
	STA !cb_t7
	CLC
	ADC !ag_behind
	BMI .next                     ; along < -behind
	LDA !cb_t7
	SEC
	SBC !ag_range
	BEQ +
	BPL .next                     ; along > range
+	LDA !cb_t6
	CMP !ag_width
	BEQ +
	BCS .next
+	TYA
	TSB !ag_list
.next
	TYA
	ASL
	TAY
	TXA
	CLC
	ADC.w #8
	TAX
	LDA !cb_t9
	BNE .entry
	RTS

; Fill the cache: every entry's query. Out: A16 = !vt_state ($8000 | the
; live entries). Clobbers cb_t5, cb_t8, X, Y.
cb_vt_refresh:
	LDA.w #$8000
	STA.l !vt_state
	LDA.w #$0001
	STA !cb_t8                    ; the entry's live bit
	LDX.w #$0000
.entry
	CPX.w #!VT_TABLE_LEN
	BCS .done
	PHX
	JSR cb_vt_query               ; C: A16 = species | terrain << 8, X16 = x, Y16 = y
	BCC .gone
	STA !cb_t5
	AND.w #$00FF
	CMP.w #$0080                  ; species >= 128 are never targets (targets())
	BCS .gone
	TXA
	PLX
	STA.l !VT_E+2,X
	TYA
	STA.l !VT_E+4,X
	LDA !cb_t5
	STA.l !VT_E+0,X
	LDA.l !vt_state
	ORA !cb_t8
	STA.l !vt_state
	BRA .next
.gone
	PLX
.next
	ASL !cb_t8
	TXA
	CLC
	ADC.w #8
	TAX
	BRA .entry
.done
	LDA.l !vt_state
	RTS

; JSL the query of the table entry at offset X16 (the registers it returns).
cb_vt_query:
	PHK
	PER .ret-1                    ; the query's RTL comes back here
	SEP #$20
	LDA.l !VT_TABLE+2,X
	PHA
	REP #$20
	LDA.l !VT_TABLE,X
	DEC
	PHA
	RTL                           ; into the query
.ret
	REP #$30
	RTS

; Goku's hit on virtual target bit A16 (9-15) with cb_hit_dmg: the entry's
; own hit routine (mana-mod.js hit(): no native queue, damage number,
; launch or damage hook). Out as cb_hit, for the contact test: cb_hit_orb
; = 0, cb_hit_before = 1, cb_hit_after = 0 when it took HP, else 1. Logs the
; hit (!VT_LOG). Clobbers cb_t7-cb_t9, X, Y.
cb_vt_hit:
	SEC
	SBC.w #!VT_BIT0
	ASL : ASL : ASL
	STA !cb_t7                    ; entry offset
	LDX.w #$0000
	LDA !cb_act
	AND.w #$00FF
	CMP.w #!GOKU_K_PUNCH
	BNE +
	INX                           ; melee
+	LDA !cb_hit_dmg
	JSR cb_vt_hit_call
	STA !cb_t8                    ; HP taken
	; the log: cb_frame, damage, entry | melee << 8, HP taken
	LDA.l !vt_hits
	INC
	STA.l !vt_hits
	DEC
	AND.w #$0007
	ASL : ASL : ASL
	TAX
	LDA !cb_frame
	STA.l !VT_LOG+0,X
	LDA !cb_hit_dmg
	STA.l !VT_LOG+2,X
	LDA !cb_t9
	XBA
	STA !cb_t9
	LDA !cb_t7
	LSR : LSR : LSR
	ORA !cb_t9
	STA.l !VT_LOG+4,X
	LDA !cb_t8
	STA.l !VT_LOG+6,X
	; the next scan asks again: the hit may have ended the target
	LDA.w #$0000
	STA.l !vt_state
	SEP #$20
	STZ !cb_hit_orb
	REP #$20
	LDA.w #$0001
	STA !cb_hit_before
	LDA !cb_t8
	BEQ +
	LDA.w #$0000
	BRA ++
+	LDA.w #$0001
++	STA !cb_hit_after
	RTS

; JSL the hit routine of the entry at offset cb_t7: A16 = damage, X16 =
; melee (kept in cb_t9). Returns its A16.
cb_vt_hit_call:
	STA !cb_t8
	STX !cb_t9
	LDX !cb_t7
	PHK
	PER .ret-1                    ; the hit's RTL comes back here
	SEP #$20
	LDA.l !VT_TABLE+5,X
	PHA
	REP #$20
	LDA.l !VT_TABLE+3,X
	DEC
	PHA
	LDA !cb_t8
	LDX !cb_t9
	RTL                           ; into the hit routine
.ret
	REP #$30
	RTS

; ---------------------------------------------------------------------------
; Per-bit accessors (bits 0-8: actor slots 3-11; 9-15: virtual entries).

; A16 = target bit: cb_t4 = x, cb_t5 = y (map). Clobbers X.
cb_target_xy:
	CMP.w #!VT_BIT0
	BCS .virtual
	JSR cb_slot_offset
	TAX
	LDA $E002,X
	STA !cb_t4
	LDA $E004,X
	STA !cb_t5
	RTS
.virtual
	JSR cb_vt_offset
	LDA.l !VT_E+2,X
	STA !cb_t4
	LDA.l !VT_E+4,X
	STA !cb_t5
	RTS

; A16 = virtual target bit (9-15) -> X16 = its cache offset.
cb_vt_offset:
	SEC
	SBC.w #!VT_BIT0
	ASL : ASL : ASL
	TAX
	RTS

; A16 = virtual target bit (9-15) -> A16 = its species. Clobbers X.
cb_vt_species:
	JSR cb_vt_offset
	LDA.l !VT_E,X
	AND.w #$00FF
	RTS

; Along / across of target bit A16 from the projectile origin (ag_*, the
; target's y - 12), as cb_proj_along does for actor Y. Out: A16 = along,
; cb_t6 = across. Clobbers X, cb_t4, cb_t5.
cb_proj_along_bit:
	JSR cb_target_xy
	LDA !cb_t4
	SEC
	SBC !ag_x
	STA !cb_t4
	LDA !cb_t5
	SEC
	SBC.w #12
	SEC
	SBC !ag_y
	STA !cb_t5
	JMP cb_along_across
