; The browser's 64 Voronoi masks at 45-degree steps. The generator assigns
; 124 OBJ cache cells (four cells stay reserved for sparks/Goku), schedules
; replacements after their last use, and budgets sprites/slivers per frame.
; DB=$32, M16/X16. Code and schedule live in the second ending code area.
shards_frame:
	REP #$30
	; Front slots not taken by sparks/Goku are hidden.
	LDY.w !s_oamslot
	LDA.w #$E000
.hide
	CPY.w #!SP_FRAG_SLOT*4
	BCS .hidden
	STA.w !N_OAM,Y
	INY : INY : INY : INY
	BRA .hide
.hidden
	STY.w !s_oamslot
	LDA.w !sp_t
	CMP.w #115
	BCC .on
	LDA.w #114
	STA.w !sh_clock
	RTL
.on
	STA.w !sh_clock
	ASL : ASL : ASL
	STA.w !sh_end
	TAX
	LDA.l ending_shard_frames,X
	STA.w !sh_src
	TAY
	LDA.l ending_shard_frames+2,X
	AND.w #$00FF
	STA.w !s_wqarg
	STA.w !sh_bank
	LDA.l ending_shard_frames+4,X
	STA.w !sh_size
	LDX.w #!N_OAM+(!SP_FRAG_SLOT*4)
	JSL shards_wq
	LDA.w !sh_src
	CLC
	ADC.w !sh_size
	TAY
	LDA.w !sh_bank
	STA.w !s_wqarg
	LDX.w !sh_end
	LDA.l ending_shard_frames+6,X
	LDX.w #!N_OAMHI+(!SP_FRAG_SLOT/4)
	JSL shards_wq
	LDA.w #512
	STA.w !s_oamslot
	RTL

; Run at the beginning of the game's field palette/OAM upload, while HDMA
; is off. Every cell is two 64-byte row DMAs. No half cell is ever used by
; OAM: all this frame's scheduled cells finish before its OAM is uploaded.
shards_preupload:
	LDA.w !s_family
	AND.w #$00FF
	CMP.w #!FAM_SPACE
	BEQ +
	RTS
+	LDA.w !s_loading
	AND.w #$00FF
	BEQ +
	RTS
+	LDA.w #3
	STA.w !sh_left
.cell
	LDX.w !sh_job
	CPX.w #!ENDING_SHARD_JOBS*8
	BCS .done
	LDA.l ending_shard_jobs+3,X
	AND.w #$00FF
	CMP.w !sh_clock
	BCC .due
	BEQ .due
	BRA .done
.due
	; Leave the native palette/OAM transfers and the later ending NMI
	; their budget. A deadline miss hides the group and is a test failure.
	JSL core_vblank_lines
	CMP.w #26
	BCC .done
	JSR shards_copy_cell
	DEC.w !sh_left
	BEQ .done
	JMP .cell
.done
	LDA.w !sh_clock
	ASL
	TAX
	LDA.l ending_shard_need,X
	CMP.w !sh_job
	BCC .ready
	BEQ .ready
	INC.w !sh_late
	; Hardware-safe fallback if a future integration leaves too little
	; vblank time: no sprite may reveal a partially prepared cache image.
	STZ.w !s_wqn
	LDX.w #!SP_FRAG_SLOT*4
	SEP #$20
	LDA.b #224
.hide
	STA.w !N_OAM+1,X
	INX : INX : INX : INX
	CPX.w #512
	BCC .hide
	REP #$20
.ready
	RTS

; X is the job offset. Both source rows are in the same xdata bank.
shards_copy_cell:
	LDA.l ending_shard_jobs,X
	STA.w $4372
	LDA.l ending_shard_jobs+4,X
	STA.w $2116
	LDA.w #$0040
	STA.w $4375
	LDA.w #$1801
	STA.w $4370
	SEP #$20
	LDA.l ending_shard_jobs+2,X
	STA.w $4374
	LDA.b #$80
	STA.w $2115
.top
	STA.w $420B
	REP #$20
	LDA.l ending_shard_jobs+6,X
	STA.w $4372
	LDA.l ending_shard_jobs+4,X
	CLC
	ADC.w #$0100
	STA.w $2116
	LDA.w #$0040
	STA.w $4375
	SEP #$20
	LDA.b #$80
.bottom
	STA.w $420B
	REP #$20
	TXA
	CLC
	ADC.w #8
	STA.w !sh_job
	RTS

; Load-script operation. A direct escape or a native reload can start past
; frame zero; prepare its cache while the existing scene loader is black.
; Normal explosions prepare only t=0 here, then stream during vblank.
shards_load:
	REP #$30
	LDA.l !ending_phase
	AND.w #$00FF
	CMP.w #!EP_ESCAPE
	BEQ .escape
	CMP.w #!EP_EXPLODE
	BEQ .explode
	CMP.w #!EP_FATAL
	BEQ .fatal
	LDA.w #0
	BRA .goal
.escape
	LDA.w #77
	BRA .goal
.explode
	LDA.l !ending_age
	SEC
	SBC.w #48
	BRA .clamp
.fatal
	LDA.l !ending_age
	SEC
	SBC.w #624
.clamp
	BCS +
	LDA.w #0
+	CMP.w #78
	BCC .goal
	LDA.w #77
.goal
	STA.w !sh_clock
.cell
	LDX.w !sh_job
	CPX.w #!ENDING_SHARD_JOBS*8
	BCS .done
	LDA.l ending_shard_jobs+3,X
	AND.w #$00FF
	CMP.w !sh_clock
	BCC .due
	BNE .done
.due
	LDA.w !s_budget
	CMP.w #512
	BCC .pause
	JSR shards_copy_cell
	LDA.w !s_budget
	SEC
	SBC.w #512
	STA.w !s_budget
	BRA .cell
.done
	LDA.w !s_cur+6
	STA.w !s_curoff
	CLC
	RTL
.pause
	SEC
	RTL
