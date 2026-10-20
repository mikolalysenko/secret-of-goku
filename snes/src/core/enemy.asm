; While both CPU companions are carried, phases 3/4 have room for the
; second/third enemy's AI and animation. Move that work two field updates
; later, retaining native status/timers and every-frame movement/contact.
; Ordinary ground actors, bosses, scenes and human companions stay native.
; CORE_ENEMY_SYNC restores the original enemy schedule for comparisons.

core_enemy_reset:
	REP #$20
	LDA.w #0
	STA.l !core_enemy_pending
	STA.l !core_enemy_species1
	LDA.w #$FFFF
	STA.l !core_enemy_map
	LDA.w #!CORE_ENEMY_MAGIC
	STA.l !core_enemy_magic
	RTS

; M8/X16, DB=$7E. Same idle combat context for submitting and resuming.
; Flight may end before the pending job runs; don't discard that update.
core_enemy_context:
	SEP #$20
	LDA $D0
	ORA $FF
	ORA $52
	BNE .no
	LDA $EC
	AND.b #$FE
	BNE .no
	LDA $ED
	AND.b #$C0
	CMP.b #$80
	BNE .no
	LDA $F1
	AND.b #$C0
	BNE .no
	LDA $E8
	AND.b #4
	BNE .no
	LDA $5C
	BMI .no
	LDA.l !persist_goku_active
	BEQ .no
	SEC
	RTS
.no
	CLC
	RTS

; Entry is the native post-status hook, X=$0800/$0A00. Returning through
; F4E2 leaves FD07's following F1CF upkeep on its original phase.
core_enemy_queue:
	JSR core_enemy_take          ; a direct update supersedes any older job
	LDA $56
	CPX.w #$0800
	BNE .third
	CMP.b #1
	BRA .phase
.third
	CMP.b #2
.phase
	BNE .native
	JSL fl_enemy_ready_l
	BCC .native
	LDA.w $E180,X
	CMP.b #$54                  ; no bosses, orbs, NPCs or defeat sheets
	BCS .native
	JSR core_enemy_context
	BCC .native
	REP #$20
	LDA.l !core_enemy_magic
	CMP.w #!CORE_ENEMY_MAGIC
	BNE .reset
	LDA.l !core_enemy_map
	CMP $DC
	BEQ .store
.reset
	JSR core_enemy_reset
.store
	LDA $DC
	STA.l !core_enemy_map
	SEP #$20
	LDA.w $E180,X
	CPX.w #$0800
	BNE .store_third
	STA.l !core_enemy_species0
	LDA.l !core_enemy_pending
	ORA.b #1
	BRA .pending
.store_third
	STA.l !core_enemy_species1
	LDA.l !core_enemy_pending
	ORA.b #2
.pending
	STA.l !core_enemy_pending
	JML $80F4E2
.native
	LDA.w $E060,X
	JML $80F512

; M8, X=$0800/$0A00. Preserves X/Y/DB/D.
core_enemy_take:
	LDA.l !core_enemy_pending
	CPX.w #$0800
	BNE .third
	AND.b #$FE
	BRA .store
.third
	AND.b #$FD
.store
	STA.l !core_enemy_pending
	RTS

core_enemy_work:
	SEP #$20
	REP #$10
	LDA.l !core_enemy_pending
	BEQ .done
	JSR core_enemy_context
	BCC .reset
	REP #$20
	LDA.l !core_enemy_magic
	CMP.w #!CORE_ENEMY_MAGIC
	BNE .reset
	LDA.l !core_enemy_map
	CMP $DC
	BNE .reset
	SEP #$20
	LDA $56
	CMP.b #3
	BEQ .second
	CMP.b #4
	BNE .done
	LDX.w #$0A00
	LDA.l !core_enemy_pending
	AND.b #2
	BEQ .done
	LDA.l !core_enemy_species1
	BRA .live
.second
	LDX.w #$0800
	LDA.l !core_enemy_pending
	AND.b #1
	BEQ .done
	LDA.l !core_enemy_species0
.live
	CMP.l $7EE180,X
	BNE .drop
	LDA.l $7EE000,X
	AND.b #1
	BEQ .drop
	JSR core_enemy_take
	PHB
	LDA.b #$7E
	PHA
	PLB
	STX $14
	PHK
	PER .returned-1
	PEA $B294-1
	LDA.w $E060,X
	JML $80F512
.returned
	PLB
.done
	RTS
.drop
	JMP core_enemy_take
.reset
	JMP core_enemy_reset
