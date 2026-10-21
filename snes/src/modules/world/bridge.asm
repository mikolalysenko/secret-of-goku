; Bridges to the other streams. Each one calls the other module when that
; module is part of the build (its generated ids file exists, which also
; means its code is assembled) and otherwise keeps a local stand-in that
; records the request in world RAM, which is what the world tests read:
;
;   audio   audio/ids.asm      world_sfx -> audio_sfx (!w_sfx_last)
;   ui      ui/defines.asm     world_message -> ui_say / ui_interrupt (!w_msg)
;   destroy destroy/tables.asm world_barrier_hit -> destroy_tree_barrier_break
;                              (!w_barrier_req)
;   frieza  story queries      FRIEZA_CRISIS / FRIEZA_STOLEN through
;                              story_query_table (0 until frieza answers)

if getfilestatus("audio/ids.asm") == 0
	incsrc "audio/ids.asm"
endif
if getfilestatus("ui/defines.asm") == 0
	incsrc "ui/defines.asm"
endif
incsrc "story/defines.asm"

; ---------------------------------------------------------------------------
; Sounds (mod.playSound in native-flight.js / world-ki.js). A = !SFX_*; any
; M/X, DB/D any; preserves A/X/Y. Main-loop code only.
world_sfx_takeoff:
	PHP
	REP #$20
	LDA.w #!SFX_TAKEOFF
	BRA world_sfx_note
world_sfx_landing:
	PHP
	REP #$20
	LDA.w #!SFX_LANDING
	BRA world_sfx_note
world_sfx:
	PHP
	REP #$20
world_sfx_note:
	STA.l $7E0000|!w_sfx_last
if defined("AUDIO_SFX_FLIGHT")
	PHA
	PHX
	REP #$30
	ASL
	TAX
	LDA.l world_sfx_audio,X
	BEQ +
if defined("AUDIO_CUSTOM_SAMPLES")
if !AUDIO_CUSTOM_SAMPLES
	CMP.w #!AUDIO_SFX_FLIGHT
	BNE .ordinary
	JSL audio_world_takeoff
	BRA .sent
.ordinary
endif
endif
	JSL audio_sfx
if defined("AUDIO_CUSTOM_SAMPLES")
if !AUDIO_CUSTOM_SAMPLES
.sent
endif
endif
+	REP #$30
	PLX
	PLA
endif
	PLP
	RTS
if defined("AUDIO_SFX_FLIGHT")
; !SFX_* -> !AUDIO_SFX_*. The charge bed and the Kamehameha voice belong to
; whoever owns the charge (combat: audio_loop / audio_voice).
world_sfx_audio:
	dw 0, !AUDIO_SFX_FLIGHT, !AUDIO_SFX_LANDING, 0, !AUDIO_SFX_CHARGED
	dw !AUDIO_SFX_BLAST, !AUDIO_SFX_BEAM, !AUDIO_SFX_DEFLECT, !AUDIO_SFX_IMPACT
	dw !AUDIO_SFX_DISTANT_IMPACT
endif

; ---------------------------------------------------------------------------
; Telepathy lines of world-ki.js / world-scars.js (mod.radio). A16 = !MSG_*,
; !w_msg_arg = town index for !MSG_TOWN. M16/X16, DB = $7E, D = 0.
world_message:
	STA.w !w_msg
	INC.w !w_msg_count
if defined("UI_MSG_COUNT")
	PHP
	PHX
	PHY
	CMP.w #!MSG_SHIELD
	BNE .town
	; interrupt(fortressDeflectionMessages, {kind:'fortress-shield'})
	LDA.w #!UI_GROUP_FORTRESS_SHIELD
	LDX.w #$0000
	JSL ui_interrupt
	BRA .done
.town
	CMP.w #!MSG_TOWN
	BNE .barrier
	; say("KING KAI:That was <town>! ...") then say("GOKU:I promise ...");
	; the town name table is blastTowns order, as world_town_maps
	LDA.w !w_msg_arg
	XBA
	AND.w #$FF00
	TAX
	LDA.w #!UI_MSG_WORLD_SCARS_COLLATERAL_0
	JSL ui_say
	REP #$30
	LDA.w #!UI_MSG_WORLD_SCARS_COLLATERAL_1
	LDX.w #$0000
	JSL ui_say
	BRA .done
.barrier
	CMP.w #!MSG_BARRIER
	BNE .done
	; interrupt(crisis ? the five-minute line : treeBlastMessages)
	LDA.w #!STORY_Q_FRIEZA_CRISIS
	JSR world_story_query
	BEQ +
	LDA.w #!UI_MSG_WORLD_KI_TREE_BLAST
	BRA ++
+	LDA.w #!UI_GROUP_TREE_BLAST
++	LDX.w #$0000
	JSL ui_interrupt
.done
	REP #$30
	PLY
	PLX
	PLP
endif
	RTS

; ---------------------------------------------------------------------------
; A full wave opened the Mana Tree cloud barrier. The destroy stream owns the
; landing lock ($E3 bit 6, re-applied every world frame, saved with the game
; file). M16/X16, DB = $7E.
world_barrier_hit:
	LDA.w #$0001
	STA.w !w_barrier_req
if getfilestatus("destroy/tables.asm") == 0
	JSL destroy_tree_barrier_break
	REP #$30
endif
	RTS

; Frieza's chase keeps the barrier (world-ki.js: !frieza.unresolved and
; !frieza.crisisActive), or the request flag !w_frieza_barrier_lock.
; Z clear when the barrier must stay. M16/X16, DB = $7E.
world_barrier_held:
	LDA.w !w_frieza_barrier_lock
	BNE +
	LDA.w #!STORY_Q_FRIEZA_CRISIS
	JSR world_story_query
	BNE +
	LDA.w #!STORY_Q_FRIEZA_STOLEN
	JSR world_story_query
+	RTS

; A story query (docs/agents/snes-port/story.md, story_query_table): A16 =
; id < $80 -> A16 = value (0-255), Z from the value. Unimplemented queries
; answer 0 without a call, as story_query does. M16/X16, DB = $7E, D = 0;
; preserves X/Y.
world_story_query:
	PHX
	PHY
	AND.w #$007F
	PHA
	ASL
	CLC
	ADC $01,S
	TAX                              ; id * 3
	PLA
	LDA.l story_query_table,X
	CMP.w #story_query_zero&$FFFF
	BNE +
	LDA.l story_query_table+1,X
	CMP.w #(story_query_zero>>8)&$FFFF
	BNE +
	LDA.w #$0000
	BRA .result
+	PHB
	PEA $7E7E
	PLB
	PLB
	PHK
	PER .back-1
	SEP #$20
	LDA.l story_query_table+2,X
	PHA
	REP #$20
	LDA.l story_query_table,X
	DEC
	PHA
	RTL                              ; JSL through the table entry
.back
	REP #$30
	PLB
.result
	PLY
	PLX
	AND.w #$00FF
	RTS
