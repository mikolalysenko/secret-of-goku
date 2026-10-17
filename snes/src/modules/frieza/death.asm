; Finale deaths (engine/battle-retry.js, boss-rush-death.js): losing to the
; empowered Thanatos, Frieza on the ground or the Mana Beast is terminal.
; The native actor keeps its death (tumble, ghost palette, reaper); events
; 7FF (all-party-dead warp) and 42D/42F (boss victories) are skipped at
; C1:E77B while the sequence runs, so neither a wake-up warp nor a
; companion's last hit can interrupt it. The ending module draws the doomed
; planet and GAME OVER (ending_lose); without it the module plays the
; ground part itself (revert at 18, fade 300-360) and holds black until
; Start returns to the title.

; Death timeline (bossRushDeathTiming)
!FZD_REVERT    = 18
!FZD_FADE      = 300
!FZD_BLACK     = 360

; Encounter keys
!FZE_FRIEZA    = 1
!FZE_THANATOS  = 2
!FZE_BEAST     = 3

; encounter(): the dangerous fight running on this map (A16 = key, 0 none).
fz_encounter:
	LDA $DC
	CMP.w #246
	BEQ .arena
	CMP.w #253
	BNE .none
	LDA.w #!FZ_SPECIES_BEAST
	JSR fz_find_boss
	BCC .none
	LDA.w #!FZE_BEAST
	RTS
.arena
	; frieza.encounter: stage battle, no surge, not in space
	JSR fz_battle_live
	BCC .lich
	JSR fz_battle_surging
	BCS .none
	LDA.w #!FZE_FRIEZA
	RTS
.lich
	LDA.w #!FZ_SPECIES_LICH
	JSR fz_find_boss
	BCC .none
	LDA.w #!FZE_THANATOS
	RTS
.none
	LDA.w #0
	RTS

; battle-retry.js check(), every field frame.
fz_death_tick:
	LDA !fzd_on
	AND.w #$00FF
	BEQ .watch
	JMP fz_death_run
.watch
	JSR fz_bind_ending_active
	BCS .forget
	LDA $DC
	CMP.w #246
	BEQ +
	CMP.w #253
	BNE .forget
+	JSR fz_encounter
	STA !fz_t0
	; Goku fell during (or right after) a dangerous fight
	LDA $E182
	BNE .alive
	LDA !fzd_key
	AND.w #$00FF
	ORA !fz_t0
	BEQ .out
	JMP fz_death_start
.alive
	LDA !fz_t0
	BEQ .out
	JSR fz_can_act
	BCC .out
	LDA !fz_t0
	SEP #$20
	STA !fzd_key
	REP #$20
.out
	RTS
.forget
	SEP #$20
	STZ !fzd_key
	REP #$20
	RTS

; ending.lose(key): the terminal sequence begins.
fz_death_start:
	LDA !fzd_key
	AND.w #$00FF
	BNE +
	LDA !fz_t0
	SEP #$20
	STA !fzd_key
	REP #$20
+	SEP #$20
	LDA.b #1
	STA !fzd_on
	STZ !fzd_gold
	REP #$20
	LDA.w #0
	STA !fzd_age
	LDA.l !goku_form|$7E0000
	AND.w #$0001
	SEP #$20
	STA !fzd_gold
	REP #$20
	LDA.w #!FZW_CANCEL
	TSB !fz_pend
	JSR fz_bind_ending_lose           ; C set when the ending module runs it
	BCC +
	SEP #$20
	LDA.b #2                          ; the ending's sequence
	STA !fzd_on
	REP #$20
+	RTS

; The ground part, when the ending module does not run it: the form reverts
; at 18, the native death plays, the screen fades from 300 to 360 and
; stays black; Start returns to the title.
fz_death_run:
	LDA !fzd_age
	INC
	STA !fzd_age
	LDA !fzd_on
	AND.w #$00FF
	CMP.w #2
	BEQ .out                          ; the ending module draws the rest
	LDA !fzd_age
	CMP.w #!FZD_REVERT
	BNE +
	LDA !fzd_gold
	AND.w #$00FF
	BEQ +
	LDA.w #!FZ_SFX_REVERT
	JSR fz_sfx
	LDA.w #$0000
	JSR fz_bind_set_form
+	LDA !fzd_age
	CMP.w #!FZD_FADE
	BCC .out
	; brightness ceiling: 15 * (360 - age) / 60, then black
	LDA.w #!FZD_BLACK
	SEC
	SBC !fzd_age
	BPL +
	LDA.w #0
+	LSR
	LSR
	CMP.w #16
	BCC +
	LDA.w #15
+	STA !fz_t0
	SEP #$20
	LDA $E6
	AND.b #$0F
	CMP !fz_t0
	BCC +
	LDA !fz_t0
+	STA !fz_t1
	LDA $E6
	AND.b #$F0
	ORA !fz_t1
	STA $E6
	REP #$20
	; black: all input hidden but Start, which returns to the title
	LDA !fzd_age
	CMP.w #!FZD_BLACK
	BCC .out
	LDA.w #$FFFF
	TSB.w !core_pad_mask&$FFFF
	LDA.w !core_pad_new&$FFFF
	AND.w #!PAD_START
	BEQ .out
	JML $C10010                       ; the game's own soft-reset path
.out
	RTS

; C1:E77B (REP #$30 / PHX / CMP #$0800): the event dispatcher. While a
; finale death runs, events 7FF, 42D and 42F return at once (C1:E7C5 RTS,
; before the PHX), as installFinaleDeathGate does.
frieza_event_gate:
	REP #$30
	PHA
	LDA.l $7E0000|!fzd_on
	AND.w #$00FF
	BEQ .native
	LDA $01,S
	CMP.w #$07FF
	BEQ .skip
	CMP.w #$042D
	BEQ .skip
	CMP.w #$042F
	BEQ .skip
.native
	PLA
	PHX
	CMP.w #$0800
	JML $C1E781
.skip
	PLA
	JML $C1E7C5
