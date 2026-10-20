; Companion status runs on its fixed native tick. Delay only the following
; CPU AI/animation during ki/charge/teleport until the frame can afford it. Each
; job finishes within four field updates, before its next five-frame tick.
if not(defined("CORE_PARTY_BUDGET_LINE"))
!CORE_PARTY_BUDGET_LINE = 90
endif
if not(defined("CORE_PARTY_MAX_AGE"))
!CORE_PARTY_MAX_AGE = 4
endif
assert !CORE_PARTY_MAX_AGE < 5, "companion work must finish before its next native tick"

; M16 on return, X/Y/DB/D preserved. New games, successful loads, mode
; changes and title/boot discard work from the previous actor context.
core_party_reset:
	REP #$20
	LDA.w #0
	STA.l !core_party_pending   ; also queuing
	STA.l !core_party_age0      ; both ages
	LDA.w #$FFFF
	STA.l !core_party_map
	LDA.w #!CORE_PARTY_MAGIC
	STA.l !core_party_magic
	RTS

core_party_begin:
	SEP #$20
	REP #$10
	LDA.b #0
	STA.l !core_party_queuing
	LDA.l !core_party_pending
	BNE +
	RTS
+
	JSR core_party_context
	BCS .age
	JMP core_party_reset
.age
	LDA.l !core_party_pending
	BIT.b #1
	BEQ +
	LDA.l !core_party_age0
	INC
	STA.l !core_party_age0
+	LDA.l !core_party_pending
	BIT.b #2
	BEQ +
	LDA.l !core_party_age1
	INC
	STA.l !core_party_age1
+	RTS

; C set while queued work still belongs to an idle field. Check again
; after status handling, which may have opened an event or changed actors.
; Returns M8, preserves X/Y/DB/D.
core_party_context:
	REP #$20
	LDA.l !core_party_magic
	CMP.w #!CORE_PARTY_MAGIC
	BNE .no
	LDA $DC
	CMP.l !core_party_map
	BNE .no
	SEP #$20
	LDA $D0
	ORA $FF
	ORA $52
	BNE .no
	LDA $EC
	AND.b #$FE
	BNE .no
	LDA $ED
	AND.b #$40
	BNE .no
	LDA $F1
	AND.b #$C0
	BNE .no
	LDA $E8
	AND.b #4
	BNE .no
	LDA.l !persist_goku_active
	BEQ .no
	SEC
	RTS
.no
	SEP #$20
	CLC
	RTS

; Called by the flight status hook only after its live passenger gate.
; No queued work for Goku, enemies, events or human-controlled companions.
; M8/X16, DB=$7E, D=0, X actor offset. Native timers/status already ran.
core_party_queue:
if not(defined("CORE_PARTY_SYNC"))
	LDA.l !core_party_queuing
	BEQ .native
	CPX.w #$0200
	BEQ .check
	CPX.w #$0400
	BNE .native
.check
	LDA.w $E02C,X
	ORA $D0
	ORA $FF
	ORA $52
	BNE .direct
	LDA $EC
	AND.b #$FE
	BNE .direct
	LDA $ED
	AND.b #$40
	BNE .direct
	LDA $F1
	AND.b #$C0
	BNE .direct
	LDA $E8
	AND.b #4
	BNE .direct
	REP #$20
	LDA.l !core_party_magic
	CMP.w #!CORE_PARTY_MAGIC
	BNE .reset
	; A status callback may have changed maps after core_party_begin.
	; Never relabel another member's old job with the new map.
	LDA $DC
	CMP.l !core_party_map
	BEQ +
.reset
	JSR core_party_reset
+	SEP #$20
	CPX.w #$0200
	BEQ .girl
	LDA.l !core_party_pending
	ORA.b #2
	BRA .store
.girl
	LDA.l !core_party_pending
	ORA.b #1
.store
	STA.l !core_party_pending
	REP #$20
	LDA $DC
	STA.l !core_party_map
	SEP #$20
	JML $80F4E2
.direct
	JSR core_party_take
endif
.native
	LDA.w $E060,X
	JML $80F512

; Drop one pending job. X=$0200/$0400, M8/X16; preserves X/DB.
core_party_take:
	CPX.w #$0200
	BNE .sprite
	LDA.l !core_party_pending
	AND.b #$FE
	STA.l !core_party_pending
	LDA.b #0
	STA.l !core_party_age0
	RTS
.sprite
	LDA.l !core_party_pending
	AND.b #$FD
	STA.l !core_party_pending
	LDA.b #0
	STA.l !core_party_age1
	RTS

core_party_work:
	SEP #$20
	REP #$10
	LDA.l !core_party_pending
	BEQ .done
	JSR core_party_context
	BCS +
	JMP core_party_reset
+	LDA.l !core_party_pending
	; Pick the older member when both are waiting, so neither starves.
	CMP.b #1
	BEQ .girl
	CMP.b #2
	BEQ .sprite
	LDA.l !core_party_age0
	CMP.l !core_party_age1
	BCC .sprite
.girl
	LDX.w #$0200
	LDA.l !core_party_age0
	BRA .budget
.sprite
	LDX.w #$0400
	LDA.l !core_party_age1
.budget
	PHA
	LDA.l $7EE000,X
	BEQ .drop
	LDA.l $7EE02C,X
	BNE .drop
	PLA
	CMP.b #!CORE_PARTY_MAX_AGE
	BCS .run
	JSR core_vcount
	CMP.w #!CORE_PARTY_BUDGET_LINE
	BCS .done
	BRA .run
.drop
	PLA
	JSR core_party_take
	RTS
.run
	SEP #$20
	JSR core_party_take
.actor
	PHB
	LDA.b #$7E
	PHA
	PLB
	STX $14
	PHK
	PER .returned-1
	PEA $B294-1
	JML $80F50D
.returned
	PLB
.done
	RTS
