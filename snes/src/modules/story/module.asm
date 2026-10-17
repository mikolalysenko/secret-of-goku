; Story module: the browser mod's event system on the cartridge.
; See docs/agents/snes-port/story.md.
;
; The native event interpreter (C1:E8C7, ticked from 00:B09C) still draws
; every window, runs choices, actors, doors, rewards and credits. This
; module, like engine/native-story.js, only changes which script it runs:
;  - story_resolve  (C1:E794)  event start -> compiled party/route variant
;                              in banks F0-F7 (snes/gen/story.mjs output)
;  - story_fetch    (C1:E8EF)  per-opcode: crisis greeting prefix/resume,
;                              Dragon Ball grant markers, absent-companion
;                              movement skips, companion spell grants, and
;                              the 3D hook opcode extension
;  - story_map_load (00:C481)  story-area prerequisites before map objects
;  - story_object   (00:DD85)  per-record object overlays (+ owner filters)
;  - story_field_frame         queued requests, spell re-grants, Water
;                              Palace/Tree Palace Jema, Potos gatekeeper

incsrc "story/defines.asm"
incsrc "story/events.asm"
incsrc "story/data.asm"

; ---------------------------------------------------------------------------
; WRAM (!RAM_STORY, $100 bytes, bank 7E)
!story_last_event    = !RAM_STORY+$00 ; word: id of the script last entered by redirect
!story_relocations   = !RAM_STORY+$02 ; word: redirect counter (debug)
!story_skipped       = !RAM_STORY+$04 ; word: absent-actor commands skipped (debug)
!story_q_valid       = !RAM_STORY+$06 ; byte: a request is queued
!story_q_event       = !RAM_STORY+$08 ; word: queued event id, or $800|door
!story_q_actor       = !RAM_STORY+$0A ; word: requesting NPC slot offset (0 = none)
!story_q_map         = !RAM_STORY+$0C ; word: map at request time
!story_q_npc_event   = !RAM_STORY+$0E ; word: that NPC's $E03E word at request time
!story_greeted       = !RAM_STORY+$10 ; byte: crisis greeting shown this interaction
!story_greet_pending = !RAM_STORY+$11 ; byte: greeting running, resume pending
!story_greet_resume  = !RAM_STORY+$12 ; long: script pointer to resume at
!story_greet_end     = !RAM_STORY+$15 ; long: greeting's final NOP
!story_greet_count   = !RAM_STORY+$18 ; word (debug)
!story_cand_valid    = !RAM_STORY+$1A ; byte: an event just started (first fetch pending)
!story_cand_id       = !RAM_STORY+$1C ; word: its requested id
!story_cand_ptr      = !RAM_STORY+$1E ; long: its first script pointer
!story_area_changes  = !RAM_STORY+$22 ; word (debug)
!story_gate_latched  = !RAM_STORY+$24 ; byte
!story_gate_started  = !RAM_STORY+$25 ; byte
!story_gate_home     = !RAM_STORY+$26 ; word: guard slot base ($E000+), 0 = none
!story_gate_x        = !RAM_STORY+$28 ; word
!story_gate_y        = !RAM_STORY+$2A ; word
!story_gate_triggers = !RAM_STORY+$2C ; word
!story_water_len     = !RAM_STORY+$2E ; word: last Water Palace script length
!story_can_act       = !RAM_STORY+$30 ; byte: canAttack this field frame
!story_vm_pc         = !RAM_STORY+$32 ; word: route program counter
!story_tmp0          = !RAM_STORY+$34 ; word scratch
!story_tmp1          = !RAM_STORY+$36 ; word
!story_tmp2          = !RAM_STORY+$38 ; word
!story_tmp3          = !RAM_STORY+$3A ; word
!story_tmp4          = !RAM_STORY+$3C ; word
!story_tmp5          = !RAM_STORY+$3E ; word
!story_best          = !RAM_STORY+$40 ; long+: 32-bit distance scratch (4 bytes)
!story_dist          = !RAM_STORY+$44 ; 4 bytes
!story_keep          = !RAM_STORY+$48 ; word
!story_wx            = !RAM_STORY+$4A ; word: water walk hero x
!story_wy            = !RAM_STORY+$4C ; word: water walk hero y
!story_wlen          = !RAM_STORY+$4E ; word: water walk write index
!story_wji           = !RAM_STORY+$50 ; word: Jema selector (index+1)
!story_wtx           = !RAM_STORY+$52 ; word
!story_wty           = !RAM_STORY+$54 ; word
!story_wdelta        = !RAM_STORY+$56 ; word (signed)
!story_wstep         = !RAM_STORY+$58 ; word (signed)
!story_waxis         = !RAM_STORY+$5A ; word: 0 x, 2 y
!story_wpts          = !RAM_STORY+$5C ; word: remaining points
!story_wptr          = !RAM_STORY+$5E ; word: point list cursor
!story_wpoints       = !RAM_STORY+$60 ; 3 x (x,y) words = 12 bytes
!story_fetch_op      = !RAM_STORY+$6C ; word
!story_record        = !RAM_STORY+$6E ; word: object record index
!story_hook_id       = !RAM_STORY+$70 ; word
!story_hook_event    = !RAM_STORY+$72 ; word
!story_grant_hits    = !RAM_STORY+$74 ; word (debug)
!story_qresult       = !RAM_STORY+$76 ; word: last query result
!story_req_id        = !RAM_STORY+$78 ; word: event id being resolved
!story_name_buf      = !RAM_STORY+$7A ; 12 bytes: displayName(n) for the name copy
!story_ff_ptr        = !RAM_STORY+$86 ; long: window last scanned by fast-forward
!story_ff_valid      = !RAM_STORY+$89 ; byte: !story_ff_ptr is current
!story_ff_choice     = !RAM_STORY+$8A ; byte: that window has a choice
!story_objlist_start = !RAM_STORY+$8C ; word: map object list start (header) in its bank
!story_objlist_end   = !RAM_STORY+$8E ; word: list end (start + 8 + 8n)
!story_objlist_bank  = !RAM_STORY+$90 ; byte: bank of the list (C8 = cartridge)
!story_sweeping      = !RAM_STORY+$91 ; byte: test sweep evaluates routes only
; $92-$FF free

; Persistent fields (!PERSIST_STORY, $C0 bytes, battery SRAM, per save slot)
!story_p_version   = !PERSIST_STORY+$00 ; 1 once initialised
!story_p_mask      = !PERSIST_STORY+$01 ; Dragon Ball ledger: balls held (bit = palace)
!story_p_seeds     = !PERSIST_STORY+$02 ; balls personally collected from the seeds
!story_p_delivered = !PERSIST_STORY+$03 ; legacy delivery count (compatibility only)
!story_p_wished    = !PERSIST_STORY+$04 ; restoration wish granted
!story_p_fast      = !PERSIST_STORY+$05 ; retired Luka fast track (event 88) seen
!story_p_spells    = !PERSIST_STORY+$08 ; 2 x 8: spell grants for girl/sprite slots

!STORY_WATER_BUF   = !SRAM_WORK_STORY    ; $33:6000, Water Palace walk script (<= $200)
!STORY_TEST_QUERIES = !SRAM_WORK_STORY+$0700 ; test builds: one byte per foreign query id
!STORY_TEST_LOG     = !SRAM_WORK_STORY+$0800 ; test builds: word count, then 128 (id, A, X) entries
!STORY_TEST_SWEEP   = !SRAM_WORK_STORY+$0B10 ; test builds: request byte, then a pointer per routed event

pushpc
org !CODE_STORY
story_code_start:

; ===========================================================================
; Hook / query plumbing
; ===========================================================================

; Call story_hook_table[A] with A = !story_hook_event and the caller's X/Y.
; M16/X16, DB=$7E, D=0. Preserves X and Y.
story_call_hook:
	PHX
	PHY
	AND.w #$00FF
	BEQ .none
	CMP.w #!STORY_HOOK_COUNT
	BCS .none
	STA.l !story_tmp5
	ASL
	CLC
	ADC.l !story_tmp5
	TAX
	PHB
	PEA $7E7E : PLB : PLB
	PHK
	PER .back-1
	SEP #$20
	LDA.l story_hook_table+2,X
	PHA
	REP #$20
	LDA.l story_hook_table,X
	DEC
	PHA
	; stack: target(3) return(3) B(1) Y(2) X(2): hand the hook the caller's X/Y
	LDA $08,S
	TAY
	LDA $0A,S
	TAX
	LDA.l !story_hook_event
	RTL
.back
	REP #$30
	PLB
.none
	PLY
	PLX
	RTS

; Query A (id) -> A (value 0-255). M16/X16. Preserves X and Y.
story_query:
	PHX
	PHY
	AND.w #$00FF
	CMP.w #$0080
	BCS .ram
	STA.l !story_tmp5
	ASL
	CLC
	ADC.l !story_tmp5
	TAX
	PHB
	PEA $7E7E : PLB : PLB
	PHK
	PER .back-1
	SEP #$20
	LDA.l story_query_table+2,X
	PHA
	REP #$20
	LDA.l story_query_table,X
	DEC
	PHA
	RTL
.back
	REP #$30
	PLB
	AND.w #$00FF
	STA.l !story_qresult
	PLY
	PLX
	LDA.l !story_qresult
	RTS
.ram
	; entry = 6 bytes: address, count, three thresholds
	SEC
	SBC.w #$0080
	STA.l !story_tmp5
	ASL
	CLC
	ADC.l !story_tmp5
	ASL
	TAX                          ; X = entry offset
	PHX
	LDA.l story_ramq_table,X
	TAX
	LDA.l $7E0000,X
	AND.w #$00FF
	STA.l !story_tmp5            ; byte value
	PLX
	LDA.l story_ramq_table+2,X
	AND.w #$00FF
	STA.l !story_tmp4            ; threshold count
	LDY.w #$0000
	LDA.l !story_tmp4
	BEQ .done
	LDA.l story_ramq_table+3,X
	JSR .reached
	BCC .done
	INY
	LDA.l !story_tmp4
	CMP.w #$0002
	BCC .done
	LDA.l story_ramq_table+4,X
	JSR .reached
	BCC .done
	INY
	LDA.l !story_tmp4
	CMP.w #$0003
	BCC .done
	LDA.l story_ramq_table+5,X
	JSR .reached
	BCC .done
	INY
	BRA .done
.reached
	; carry set when threshold (A low byte) <= value
	AND.w #$00FF
	CMP.l !story_tmp5
	BEQ +
	BCS ++
+	SEC
	RTS
++	CLC
	RTS
.done
	TYA
	STA.l !story_qresult
	PLY
	PLX
	LDA.l !story_qresult
	RTS

; Stub targets for hooks/queries nobody implements yet.
story_hook_stub:
	RTL
story_query_zero:
	LDA.w #$0000
	RTL

; ===========================================================================
; Story-owned queries (story_query_table entries)
; ===========================================================================
story_query_mask:
	JSR story_party_mask
	RTL
story_query_quest_count:
	LDA.l !story_p_mask
	JSR story_popcount7
	RTL
story_query_quest_held7:
	; held = popcount(mask & ~(frieza stolen ? stolenMask : 0)) == 7
	LDA.l !story_p_mask
	AND.w #$007F
	CMP.w #$007F
	BNE .no
	LDA.w #!STORY_Q_FRIEZA_STOLEN
	JSR story_query
	BEQ .yes
	LDA.w #!STORY_Q_FRIEZA_STOLEN_CLASS
	JSR story_query
	BNE .no
.yes
	LDA.w #$0001
	RTL
.no
	LDA.w #$0000
	RTL
story_query_quest_seeds_all:
	LDA.l !story_p_seeds
	AND.w #$007F
	CMP.w #$007F
	BEQ +
	LDA.w #$0000
	RTL
+	LDA.w #$0001
	RTL
story_query_quest_mask_all:
	LDA.l !story_p_mask
	AND.w #$007F
	CMP.w #$007F
	BEQ +
	LDA.w #$0000
	RTL
+	LDA.w #$0001
	RTL
story_query_quest_wished:
	LDA.l !story_p_wished
	AND.w #$0001
	RTL

; A = byte -> A = popcount of its low 7 bits. M16.
story_popcount7:
	AND.w #$007F
	STA.l !story_tmp5
	LDA.w #$0000
	PHX
	LDX.w #$0007
-	LSR.w !story_tmp5&$FFFF
	ADC.w #$0000
	DEX
	BNE -
	PLX
	RTS

; Party mask (bit0 girl, bit1 sprite) from the actor active bits. M16.
story_party_mask:
	LDA.l $7EE200
	AND.w #$0001
	STA.l !story_tmp5
	LDA.l $7EE400
	AND.w #$0001
	ASL
	ORA.l !story_tmp5
	RTS

; ===========================================================================
; Event start: C1:E794 (JSL, M16/X16, DB=$7E, D=0, $00 = event id < $800)
; Replaces the original table lookup; returns with M8 to C1:E798, which
; branches to E7BA.
; ===========================================================================
story_resolve:
	PHY
	LDA $00
	STA.l !story_req_id
	AND.w #$03FF
	ASL
	TAX
	LDA $00
	CMP.w #$0400
	BCS .high
	LDA.l $C90000,X
	STA $D1
	SEP #$20
	LDA.b #$C9
	BRA .bank
.high
	LDA.l $CA0000,X
	STA $D1
	SEP #$20
	LDA.b #$CA
.bank
	STA $D3
	LDA.l !persist_goku_active
	BEQ .done
	REP #$30
	LDA.l !story_req_id
	ASL
	TAX
	LDA.l story_dispatch,X
	BEQ .candidate
	JSR story_run_program
.candidate
	; The crisis greeting is decided at this script's first fetch, as the
	; browser does, once the caller has set the event actor ($3A).
	REP #$30
	LDA.l !story_req_id
	STA.l !story_cand_id
	LDA $D1
	STA.l !story_cand_ptr
	SEP #$20
	LDA $D3
	STA.l !story_cand_ptr+2
	LDA.b #$01
	STA.l !story_cand_valid
.done
	REP #$30
	LDA.l !story_req_id
	AND.w #$03FF
	ASL
	TAX
	PLY
	SEP #$20
	RTL

; Run the route program at A (address in !DATA_STORY bank). M16/X16.
; Sets D1-D3 and runs the entered script's hooks. Leaves D1-D3 alone if the
; program falls off a dynamic resolver without a result (never in data).
story_run_program:
	STA.l !story_vm_pc
.loop
	LDA.l !story_vm_pc
	TAX
	LDA.l !DATA_STORY,X
	AND.w #$00FF
	BNE +
	JMP .ret
+	CMP.w #$0001
	BEQ .switch
	CMP.w #$0002
	BEQ .hook
	CMP.w #$0003
	BEQ .dynamic
	CMP.w #$0004
	BEQ .goto
	RTS                          ; unknown: keep the native script
.goto
	LDA.l !DATA_STORY+1,X
	STA.l !story_vm_pc
	BRA .loop
.hook
	LDA.l !story_sweeping
	AND.w #$00FF
	BNE .skip_hook
	LDA.l !story_req_id          ; route effects see A = requested event id
	STA.l !story_hook_event
	LDA.l !DATA_STORY+1,X
	JSR story_call_hook
.skip_hook
	LDA.l !story_vm_pc
	CLC
	ADC.w #$0002
	STA.l !story_vm_pc
	BRA .loop
.dynamic
	LDA.l !story_sweeping
	AND.w #$00FF
	BNE .skip_dynamic
	JSR story_water_palace
	BCS .entered
.skip_dynamic
	LDA.l !story_vm_pc
	CLC
	ADC.w #$0002
	STA.l !story_vm_pc
	BRA .loop
.switch
	LDA.l !DATA_STORY+1,X
	JSR story_query              ; A = value
	STA.l !story_tmp0
	LDA.l !story_vm_pc
	TAX
	LDA.l !DATA_STORY+2,X
	AND.w #$00FF
	DEC
	CMP.l !story_tmp0
	BCC .clamp                   ; n-1 < value: use n-1
	LDA.l !story_tmp0
.clamp
	ASL
	CLC
	ADC.l !story_vm_pc
	TAX
	LDA.l !DATA_STORY+3,X
	STA.l !story_vm_pc
	JMP .loop
.ret
	LDA.l !DATA_STORY+1,X
	STA $D1
	SEP #$20
	LDA.l !DATA_STORY+3,X
	STA $D3
	REP #$20
	LDA.l !DATA_STORY+4,X
	STA.l !story_last_event
.entered
	LDA.l !story_sweeping
	AND.w #$00FF
	BEQ +
	RTS
+	LDA.l !story_relocations
	INC
	STA.l !story_relocations
	; frieza/sandship/trial observe every entry, then the script's own hooks.
	LDA.l !story_last_event
	STA.l !story_hook_event
	LDA.w #!STORY_H_EVENT_ANY
	JSR story_call_hook
	LDA.l !story_last_event
	CMP.w #$0800
	BCS .hooks_done
	TAX
	LDA.l story_event_hook_index,X
	AND.w #$00FF
	BEQ .hooks_done
	ASL
	TAX
	LDA.l story_hook_list_ptr,X
	TAX                          ; cursor stays in X: story_call_hook preserves it,
.hook_list                       ; and hooks may call story APIs that use scratch RAM
	LDA.l !DATA_STORY,X          ; list lives in this bank (ptr is bank-relative)
	AND.w #$00FF
	BEQ .hooks_done
	JSR story_call_hook
	INX
	BRA .hook_list
.hooks_done
	RTS

; ===========================================================================
; Per-opcode fetch: JML from 01:E8EF (M8/X8, DB=$7E, D=0). Exits:
;   native fetch  -> REP #$20 : LDA [$D1] : JML $01E8F3 (X must be 8-bit)
;   re-dispatch   -> JML $01E8D3 (interpreter loop head)
; ===========================================================================
story_fetch:
	LDA.l !persist_goku_active
	BNE .active
.native
	REP #$20
	LDA [$D1]
	JML $01E8F3
.active
	REP #$30
	PHY
	; 1. A finished crisis greeting resumes the NPC's real script.
	LDA.w !story_greet_pending&$FFFF
	AND.w #$00FF
	BEQ .candidate
	LDA $D1
	CMP.w !story_greet_end&$FFFF
	BNE .candidate
	SEP #$20
	LDA $D3
	CMP.w !story_greet_end+2&$FFFF
	REP #$20
	BNE .candidate
	LDA.w !story_greet_resume&$FFFF
	STA $D1
	SEP #$20
	LDA.w !story_greet_resume+2&$FFFF
	STA $D3
	STZ.w !story_greet_pending&$FFFF
	STZ.w !story_cand_valid&$FFFF
	REP #$20
	BRA .grants
	; 2. First fetch of a started event: crisis greeting prefix.
.candidate
	SEP #$20
	LDA.w !story_cand_valid&$FFFF
	BEQ .grants16
	STZ.w !story_cand_valid&$FFFF
	REP #$20
	LDA $D1
	CMP.w !story_cand_ptr&$FFFF
	BNE .grants
	SEP #$20
	LDA $D3
	CMP.w !story_cand_ptr+2&$FFFF
	REP #$20
	BNE .grants
	JSR story_greeting
	BRA .grants
.grants16
	REP #$20
	; 3. Dragon Ball grant markers in compiled scripts.
.grants
	JSR story_grant_check
	; 4. Absent companions never take movement commands.
	JSR story_skip_absent
	; 5. Spell grants to an absent companion are kept for recruitment.
	JSR story_spell_record
	; 6. Opcode extension: 3D hh = call story_hook_table[hh].
	SEP #$20
	LDA [$D1]
	CMP.b #!STORY_OP_HOOK
	BNE .fetch
	LDY.w #$0001
	LDA [$D1],Y
	REP #$30
	AND.w #$00FF
	PHA
	LDA.w !story_last_event&$FFFF
	STA.w !story_hook_event&$FFFF
	PLA
	JSR story_call_hook
	REP #$30
	LDA $D1
	CLC
	ADC.w #$0002
	STA $D1
	PLY
	SEP #$30
	JML $01E8D3
.fetch
	REP #$30
	PLY
	SEP #$30
	REP #$20
	LDA [$D1]
	JML $01E8F3

; Crisis greeting at an event's first fetch (M16/X16). The browser's
; conditions: crisis, not yet greeted, no greeting running, the event's
; actor ($3A) is an active NPC slot whose own event is this one, and the
; event has a greeting kind.
story_greeting:
	SEP #$20
	LDA.w !story_greeted&$FFFF
	ORA.w !story_greet_pending&$FFFF
	REP #$20
	BEQ +
	JMP .no
+	LDA.w !story_cand_id&$FFFF
	TAX
	LDA.l story_greeting_kind,X
	AND.w #$00FF
	BEQ .no
	STA.w !story_tmp2&$FFFF
	LDA $3A
	CMP.w #$0600
	BCC .no
	CMP.w #$1800
	BCS .no
	AND.w #$01FF
	BNE .no
	LDX $3A
	LDA.l $7EE000,X
	AND.w #$0001
	BEQ .no
	LDA.l $7EE03E,X
	AND.w #$07FF
	CMP.w !story_cand_id&$FFFF
	BNE .no
	LDA.w #!STORY_Q_FRIEZA_CRISIS
	JSR story_query
	BEQ .no
	; greet: resume = this pointer; pointer = greeting script
	SEP #$20
	LDA.b #$01
	STA.w !story_greeted&$FFFF
	STA.w !story_greet_pending&$FFFF
	REP #$20
	LDA.w !story_greet_count&$FFFF
	INC
	STA.w !story_greet_count&$FFFF
	LDA $D1
	STA.w !story_greet_resume&$FFFF
	SEP #$20
	LDA $D3
	STA.w !story_greet_resume+2&$FFFF
	REP #$20
	LDA.w !story_tmp2&$FFFF
	STA.w !story_tmp3&$FFFF
	ASL
	CLC
	ADC.w !story_tmp3&$FFFF
	TAX                          ; kind*3
	LDA.l story_greeting_start,X
	STA $D1
	LDA.l story_greeting_end,X
	STA.w !story_greet_end&$FFFF
	SEP #$20
	LDA.l story_greeting_start+2,X
	STA $D3
	LDA.l story_greeting_end+2,X
	STA.w !story_greet_end+2&$FFFF
	REP #$20
.no
	RTS

; Grant markers: a bit per 256-byte page of $F0-$F7:8000-FFFF, then an
; exact match in story_grant_table. M16/X16.
story_grant_check:
	SEP #$20
	LDA $D3
	CMP.b #$F0
	BCS +
	JMP .no8
+	CMP.b #$F8
	BCC +
	JMP .no8
+	REP #$20
	LDA $D1
	CMP.w #$8000
	BCC .no
	; byte = (bank-F0)*16 + ((addr-8000)>>11); bit = ((addr-8000)>>8)&7
	SEC
	SBC.w #$8000
	XBA
	AND.w #$00FF                   ; page 0..127
	STA.w !story_tmp0&$FFFF
	LSR
	LSR
	LSR
	STA.w !story_tmp1&$FFFF
	LDA $D3
	AND.w #$0007
	ASL
	ASL
	ASL
	ASL
	CLC
	ADC.w !story_tmp1&$FFFF
	TAX
	PHX
	LDA.w !story_tmp0&$FFFF
	AND.w #$0007
	TAX
	LDA.l story_bits,X
	AND.w #$00FF
	STA.w !story_tmp1&$FFFF
	PLX
	LDA.l story_grant_pages,X
	AND.w !story_tmp1&$FFFF
	BEQ .no
	LDX.w #$0000
.scan
	LDA.l story_grant_table+3,X
	AND.w #$00FF
	CMP.w #$00FF
	BEQ .no
	LDA.l story_grant_table,X
	CMP $D1
	BNE .skip
	SEP #$20
	LDA.l story_grant_table+2,X
	CMP $D3
	REP #$20
	BNE .skip
	LDA.w !story_grant_hits&$FFFF
	INC
	STA.w !story_grant_hits&$FFFF
	LDA.l story_grant_table+3,X
	AND.w #$00FF
	JSR story_quest_collect
	BRA .no
.skip
	TXA
	CLC
	ADC.w #$0004
	TAX
	BRA .scan
.no8
	REP #$20
.no
	RTS
story_bits:
	db $01,$02,$04,$08,$10,$20,$40,$80

; Skip up to 32 movement commands (31/32/34) addressed to an absent party
; member (selector 1-3), or to map 236's companion stand-ins (5/6). M16/X16.
story_skip_absent:
	LDA.w #$0020
	STA.w !story_tmp4&$FFFF
.loop
	SEP #$20
	LDA [$D1]
	CMP.b #$31
	BEQ .move
	CMP.b #$32
	BEQ .move
	CMP.b #$34
	BEQ .move
.out
	REP #$20
	RTS
.move
	LDY.w #$0001
	LDA [$D1],Y                  ; selector
	REP #$20
	AND.w #$00FF
	BEQ .out
	CMP.w #$0004
	BCS .standin
	DEC                          ; party index 0-2
	XBA
	ASL                          ; *$200
	TAX
	LDA.l $7EE000,X
	AND.w #$0001
	BNE .out
	BRA .skip
.standin
	CMP.w #$0005
	BEQ +
	CMP.w #$0006
	BNE .out
+	STA.w !story_tmp3&$FFFF
	LDA.w $00DC
	CMP.w #236
	BNE .out
	LDA.w !story_tmp3&$FFFF
	SEC
	SBC.w #$0004                   ; 5 -> slot 1, 6 -> slot 2
	XBA
	ASL
	TAX
	LDA.l $7EE000,X
	AND.w #$0001
	BNE .out
.skip
	LDA $D1
	CLC
	ADC.w #$0003
	STA $D1
	LDA.w !story_skipped&$FFFF
	INC
	STA.w !story_skipped&$FFFF
	DEC.w !story_tmp4&$FFFF
	BNE .loop
	RTS

; 39 actor attr value with actor 2/3 and attr C8-CF: remember the spell
; grant for that companion slot. M16/X16.
story_spell_record:
	SEP #$20
	LDA [$D1]
	CMP.b #$39
	BNE .out
	LDY.w #$0001
	LDA [$D1],Y                  ; actor
	CMP.b #$02
	BCC .out
	CMP.b #$04
	BCS .out
	SEC
	SBC.b #$02
	ASL
	ASL
	ASL
	STA.w !story_tmp0&$FFFF       ; companion*8
	INY
	LDA [$D1],Y                  ; attribute
	CMP.b #$C8
	BCC .out
	CMP.b #$D0
	BCS .out
	SEC
	SBC.b #$C8
	CLC
	ADC.w !story_tmp0&$FFFF
	REP #$20
	AND.w #$00FF
	TAX
	SEP #$20
	INY
	LDA [$D1],Y                  ; value
	ORA.l !story_p_spells,X
	STA.l !story_p_spells,X
.out
	REP #$20
	RTS

; ===========================================================================
; Dragon Ball ledger (engine/dragon-quest.js), persistent
; ===========================================================================

; A = palace index 0-6. Carry set when newly collected. M16/X16.
story_quest_collect:
	CMP.w #$0007
	BCS .no
	TAX
	SEP #$20
	LDA.l story_bits,X
	STA.w !story_tmp0&$FFFF
	AND.l !story_p_seeds
	BNE .no8
	LDA.w !story_tmp0&$FFFF
	ORA.l !story_p_seeds
	STA.l !story_p_seeds
	LDA.w !story_tmp0&$FFFF
	AND.l !story_p_mask
	BEQ .new
	LDA.l !story_p_delivered
	BEQ .new
	DEC
	STA.l !story_p_delivered
.new
	LDA.w !story_tmp0&$FFFF
	ORA.l !story_p_mask
	STA.l !story_p_mask
	REP #$20
	TXA
	STA.w !story_hook_event&$FFFF
	LDA.w #!STORY_H_QUEST_COLLECTED
	JSR story_call_hook
	SEC
	RTS
.no8
	REP #$20
.no
	CLC
	RTS

; JSL API: collect palace A. Carry set when new.
story_api_quest_collect:
	PHB
	PHD
	PHP
	REP #$30
	PEA $7E7E : PLB : PLB
	PEA $0000 : PLD
	JSR story_quest_collect
	BCC +
	PLP
	PLD
	PLB
	SEC
	RTL
+	PLP
	PLD
	PLB
	CLC
	RTL

; JSL API: Frieza returns the stolen pouch: mask |= seeds.
story_api_quest_recover:
	PHP
	SEP #$20
	LDA.l !story_p_seeds
	ORA.l !story_p_mask
	STA.l !story_p_mask
	PLP
	RTL

; JSL API: the wish (shenron cue 'wish'). Grants only on the good outcome.
story_api_quest_wish:
	PHB
	PHD
	PHP
	REP #$30
	PEA $7E7E : PLB : PLB
	PEA $0000 : PLD
	LDA.l !story_p_mask
	AND.w #$007F
	CMP.w #$007F
	BNE .out
	LDA.l !story_p_seeds
	AND.w #$007F
	CMP.w #$007F
	BNE .out
	JSR story_ending_result
	BNE .out
	SEP #$20
	LDA.b #$01
	STA.l !story_p_wished
	REP #$20
	LDA.w #$0000
	STA.w !story_hook_event&$FFFF
	LDA.w #!STORY_H_QUEST_WISH_CEILING
	JSR story_call_hook
	LDA.w #!STORY_H_QUEST_WISH_SCARS
	JSR story_call_hook
.out
	PLP
	PLD
	PLB
	RTL

; engine/ending-rules.js endingResult: A = 0 good, 1 fortress, 2 balls,
; 3 frieza, 4 beast (Z set when good). M16/X16.
story_ending_result:
	LDA.w #!STORY_Q_FORTRESS_DESTROYED
	JSR story_query
	BEQ +
	LDA.w #$0001
	RTS
+	LDA.l !story_p_seeds
	AND.w #$007F
	CMP.w #$007F
	BNE .balls
	LDA.l !story_p_mask
	AND.w #$007F
	CMP.w #$007F
	BEQ +
.balls
	LDA.w #$0002
	RTS
+	LDA.w #!STORY_Q_FRIEZA_DEFEATED
	JSR story_query
	BEQ .frieza
	LDA.w #!STORY_Q_FRIEZA_STOLEN
	JSR story_query
	BEQ +
.frieza
	LDA.w #$0003
	RTS
+	LDA.w #!STORY_Q_BEAST_FED
	JSR story_query
	BEQ .beast
	LDA.w #!STORY_Q_BEAST_STARTED
	JSR story_query
	BEQ .beast
	LDA.w #!STORY_Q_BEAST_WON
	JSR story_query
	BEQ .beast
	LDA.w #$0000
	RTS
.beast
	LDA.w #$0004
	RTS

; JSL API: A = ending reason (see above).
story_api_ending_result:
	PHB
	PHD
	PHP
	REP #$30
	PEA $7E7E : PLB : PLB
	PEA $0000 : PLD
	JSR story_ending_result
	PLP
	PLD
	PLB
	RTL

; Internal hooks
story_hook_fast_track:
	SEP #$20
	LDA.b #$01
	STA.l !story_p_fast
	REP #$20
	RTL
story_hook_repair_if_wished:
	LDA.l !story_p_wished
	AND.w #$0001
	BEQ +
	LDA.w #!STORY_H_FRIEZA_REPAIR_CORE
	JSR story_call_hook
+	RTL

; ===========================================================================
; Requests (native-story.js request/travel). JSL API.
; ===========================================================================

; A16 = event id (< $800), X16 = NPC slot offset ($600-$17FF step $200) or 0.
; Carry set when queued; the event starts at the next field frame.
story_api_request:
	PHB
	PHD
	PHP
	REP #$30
	PEA $7E7E : PLB : PLB
	PEA $0000 : PLD
	CMP.w #$0800
	BCS .fail
	STA.w !story_tmp0&$FFFF
	STX.w !story_tmp1&$FFFF
	JSR story_request_allowed
	BCC .fail
	LDA.w !story_tmp1&$FFFF
	BEQ .ok
	CMP.w #$0600
	BCC .fail
	CMP.w #$1800
	BCS .fail
	AND.w #$01FF
	BNE .fail
	LDX.w !story_tmp1&$FFFF
	LDA.l $7EE000,X
	AND.w #$0001
	BEQ .fail
	LDA.l $7EE03E,X
	STA.w !story_q_npc_event&$FFFF
	LDA.w $00DC
	STA.w !story_q_map&$FFFF
.ok
	LDA.w !story_tmp1&$FFFF
	STA.w !story_q_actor&$FFFF
	LDA.w !story_tmp0&$FFFF
	STA.w !story_q_event&$FFFF
	SEP #$20
	LDA.b #$01
	STA.w !story_q_valid&$FFFF
	PLP
	PLD
	PLB
	SEC
	RTL
.fail
	PLP
	PLD
	PLB
	CLC
	RTL

; A16 = door (1-$3FF). Carry set when queued.
story_api_travel:
	PHB
	PHD
	PHP
	REP #$30
	PEA $7E7E : PLB : PLB
	PEA $0000 : PLD
	CMP.w #$0001
	BCC .fail
	CMP.w #$0400
	BCS .fail
	ORA.w #$0800
	STA.w !story_tmp0&$FFFF
	JSR story_request_allowed
	BCC .fail
	LDA.w #$0000
	STA.w !story_q_actor&$FFFF
	LDA.w !story_tmp0&$FFFF
	STA.w !story_q_event&$FFFF
	SEP #$20
	LDA.b #$01
	STA.w !story_q_valid&$FFFF
	PLP
	PLD
	PLB
	SEC
	RTL
.fail
	PLP
	PLD
	PLB
	CLC
	RTL

; No queued request, Goku active and controllable. M16, DB=7E.
story_request_allowed:
	SEP #$20
	LDA.w !story_q_valid&$FFFF
	BNE .no
	LDA.l !persist_goku_active
	BEQ .no
	REP #$20
	JSR story_compute_can_act
	BCC .no16
	SEC
	RTS
.no
	REP #$20
.no16
	CLC
	RTS

; JSL API: start event A16 now if the interpreter is idle (used by tests).
story_api_queued:
	LDA.l !story_q_valid
	AND.w #$00FF
	RTL

; ===========================================================================
; canAttack (mana-mod.js): Goku active and controllable in the field.
; Carry set when true. M16/X16, DB=$7E.
; ===========================================================================
story_compute_can_act:
	SEP #$20
	LDA.l !persist_goku_active
	BEQ .no
	; native field vectors at $0100-$0107: 5C A8 C0 00 5C CF C1 00
	REP #$20
	LDA.l $000100
	CMP.w #$A85C
	BNE .no16
	LDA.l $000102
	CMP.w #$00C0
	BNE .no16
	LDA.l $000104
	CMP.w #$CF5C
	BNE .no16
	LDA.l $000106
	CMP.w #$00C1
	BNE .no16
	SEP #$20
	LDA $E4
	CMP.b #$01
	BNE .no
	LDA $E5
	CMP.b #$01
	BNE .no
	LDA.l $7EE000
	AND.b #$01
	BEQ .no
	LDA.l $7EE02C
	AND.b #$01
	BEQ .no
	LDA $EC
	AND.b #$FE
	BNE .no
	LDA $ED
	AND.b #$40
	BNE .no
	LDA $D0
	BNE .no
	LDA.l $7EE190
	AND.b #$70
	BNE .no
	LDA.l $7EE191
	AND.b #$D5
	BNE .no
	LDA.l $7EE011                ; native hurt poses 8C-8F
	CMP.b #$8C
	BCC +
	CMP.b #$90
	BCC .no
+	REP #$20
	LDA.w #!STORY_Q_ENDING_ACTIVE
	JSR story_query
	BNE .no16
	SEC
	RTS
.no
	REP #$20
.no16
	CLC
	RTS

; ===========================================================================
; Map load: 00:C481 (JSL, replaces REP #$30 / LDA $DC). Story-area floors
; are raised before the loader reads the map's objects and pieces.
; ===========================================================================
story_map_load:
	PHB
	PHP
	REP #$30
	PEA $7E7E : PLB : PLB
	SEP #$20
	LDA.l !persist_goku_active
	REP #$20
	BEQ +
	LDA.l $7E00DC
	JSR story_prepare_area
+	PLP
	PLB
	REP #$30
	LDA $DC
	RTL

; A = map. Raise each listed floor of every story area containing it.
; M16/X16, DB=$7E.
story_prepare_area:
	STA.w !story_tmp0&$FFFF
	LDX.w #$0000
.scan
	LDA.l story_area_table,X
	CMP.w #$FFFF
	BEQ .done
	CMP.w !story_tmp0&$FFFF
	BNE .next
	LDA.l story_area_table+2,X
	AND.w #$00FF
	TAY
	SEP #$20
	LDA.l story_area_table+3,X
	CMP $CF00,Y
	BCC .next8
	BEQ .next8
	STA $CF00,Y
	REP #$20
	LDA.w !story_area_changes&$FFFF
	INC
	STA.w !story_area_changes&$FFFF
.next8
	REP #$20
.next
	TXA
	CLC
	ADC.w #$0004
	TAX
	BRA .scan
.done
	RTS

; ===========================================================================
; Object list: 00:C487 (JSL, M16/X16, D=0, X = map*2). Replaces the loader's
; LDA $C87000,X / STA $1D / LDA $C87002,X / PHA / SEP #$30 / LDA #$C8 /
; STA $1F (C0:C48B branches on to C498). Owners of browser read views that
; add records or patch the header (Sandship wreck, ending reunion) may point
; the list at a RAM copy: !story_objlist_start/_end/_bank.
; ===========================================================================
story_object_list:
	LDA.l $C87000,X
	STA.l !story_objlist_start
	LDA.l $C87002,X
	STA.l !story_objlist_end
	SEP #$20
	LDA.b #$C8
	STA.l !story_objlist_bank
	REP #$20
	LDA.l !persist_goku_active
	AND.w #$00FF
	BEQ .write
	PHB
	PEA $7E7E : PLB : PLB
	PHX
	LDA.l $7E00DC
	STA.l !story_hook_event
	LDA.w #!STORY_H_OBJECT_LIST_SANDSHIP
	JSR story_call_hook
	LDA.w #!STORY_H_OBJECT_LIST_ENDING
	JSR story_call_hook
	PLX
	PLB
.write
	LDA.l !story_objlist_start
	STA $1D
	SEP #$20
	LDA.l !story_objlist_bank
	STA $1F
	REP #$20
	; the list end stays on the stack under our return address, exactly as
	; the original PHA left it (pulled again at C0:C516)
	PLA
	STA.l !story_tmp5             ; return address
	SEP #$20
	PLA
	STA.l !story_tmp4             ; return bank
	REP #$20
	LDA.l !story_objlist_end
	PHA
	SEP #$20
	LDA.l !story_tmp4
	PHA
	REP #$20
	LDA.l !story_tmp5
	PHA
	SEP #$30
	RTL

; ===========================================================================
; Object records: 00:DD85 (JSL, M8/X16, DB=$7E, X = slot*16, $0D-$0F = the
; record in ROM). Replaces LDA #$01 / STA $C800,X after the 8 record bytes
; were copied to $C808+X. Mirrors the story-owned read overlays of
; native-story.js storyRead; owners' overlays run through hooks.
; ===========================================================================
story_object:
	PHP
	REP #$30
	PHY
	LDA.l !persist_goku_active
	AND.w #$00FF
	BNE +
	JMP .done
+	TXA
	LSR
	LSR
	LSR
	LSR
	STA.w !story_record&$FFFF
	STA.w !story_hook_event&$FFFF
	; owners first, in the browser's overlay order
	LDA.w #!STORY_H_OBJECT_SANDSHIP
	JSR story_call_hook
	LDA.w #!STORY_H_OBJECT_ENDING
	JSR story_call_hook
	LDA.w #!STORY_H_OBJECT_FRIEZA
	JSR story_call_hook
	LDA.w $00DC
	CMP.w #139
	BEQ .luka
	CMP.w #195
	BEQ .treejema
	CMP.w #236
	BEQ .tree
	CMP.w #408
	BEQ .northtown
	BRA .owners
.luka
	; Water Palace: keep the introduction's Jema until CF11 reaches 10.
	LDA.w !story_record&$FFFF
	CMP.w #$0006
	BNE .owners
	SEP #$20
	LDA $CF11
	CMP.b #$0A
	BCS .owners8
	LDA.b #$F0
	STA $C809,X
	BRA .owners8
.treejema
	; Tree Palace approach Jema: dry path, facing the player.
	LDA.w !story_record&$FFFF
	CMP.w #$0006
	BNE .owners
	SEP #$20
	LDA.b #$AF
	STA $C80B,X
	LDA.b #$40
	STA $C80C,X
	BRA .owners8
.tree
	; The Tree's first shot: hide stand-ins for absent companions.
	LDA.w !story_record&$FFFF
	BEQ .owners
	CMP.w #$0003
	BCS .owners
	XBA
	ASL
	TAY                          ; record 1 -> $E200, 2 -> $E400
	SEP #$20
	LDA $E000,Y
	AND.b #$01
	BNE .owners8
	LDA.b #$F0
	STA $C809,X
	BRA .owners8
.northtown
	; New Northtown scenes never abduct Primm (old captive saves keep it).
	SEP #$20
	LDA $CF0D
	CMP.b #$08
	BCS .owners8
	REP #$20
	LDA.w !story_record&$FFFF
	SEP #$20
	BEQ .captive
	CMP.b #$01
	BNE .owners8
	LDA.b #$55
	STA $C809,X
	BRA .owners8
.captive
	LDA.b #$F0
	STA $C809,X
.owners8
	REP #$20
.owners
	LDA.w #!STORY_H_OBJECT_TRIAL
	JSR story_call_hook
	; Recompute the derived flags from bytes 2/3 (possibly overridden).
	SEP #$20
	LDA $C80A,X
	LSR
	STA.w !story_tmp0&$FFFF
	LDA $C80B,X
	AND.b #$80
	ORA.w !story_tmp0&$FFFF
	AND.b #$C0
	STA $C807,X
.done
	REP #$30
	PLY
	PLP
	SEP #$20
	LDA.b #$01
	STA $C800,X
	RTL

; ===========================================================================
; Field frame (core dispatch; M16/X16, DB=$7E, D=0)
; ===========================================================================
story_field_frame:
	SEP #$20
	LDA.l !persist_goku_active
	REP #$20
	BNE +
	RTL
+	JSR story_init_persist
	JSR story_compute_can_act
	SEP #$20
	LDA.b #$00
	ROL
	STA.w !story_can_act&$FFFF
	; 1. greeting latch resets once the player has control again
	BEQ .nolatch
	LDA $D0
	ORA.w !story_greet_pending&$FFFF
	BNE .nolatch
	STZ.w !story_greeted&$FFFF
.nolatch
	REP #$20
	LDA.w !story_can_act&$FFFF
	AND.w #$00FF
	BEQ .spells
	; 2. Fire Palace brazier room entered from an older state
	LDA $DC
	CMP.w #240
	BNE +
	SEP #$20
	LDA $CF2B
	CMP.b #$02
	REP #$20
	BCS +
	LDA.w #240
	JSR story_prepare_area
+	; 3. Water Palace duplicate Jema / 4. Tree Palace Jema position
	LDA $DC
	CMP.w #139
	BNE +
	JSR story_jema_dedupe
	BRA .spells
+	CMP.w #195
	BNE .spells
	JSR story_jema_tree_palace
.spells
	JSR story_spell_regrant
	; 5. retired fast track: straight to the Beast
	LDA.w !story_can_act&$FFFF
	AND.w #$00FF
	BEQ .noqueue
	LDA.l !story_p_fast
	AND.w #$00FF
	BEQ .gate
	SEP #$20
	LDA.w !story_q_valid&$FFFF
	REP #$20
	BNE .gate
	LDA $DC
	CMP.w #246
	BNE .gate
	LDA $CF4E
	AND.w #$00FF
	CMP.w #$0008
	BNE .gate
	LDA.w #!STORY_Q_FRIEZA_STOLEN
	JSR story_query
	BNE .gate
	LDA.w #$0429
	STA.w !story_q_event&$FFFF
	STZ.w !story_q_actor&$FFFF
	SEP #$20
	LDA.b #$01
	STA.w !story_q_valid&$FFFF
	REP #$20
.gate
	JSR story_start_queued
.noqueue
	JSR story_potos_gatekeeper
if defined("STORY_FAST_FORWARD")
	JSR story_fast_forward
endif
if defined("STORY_TEST")
	JSR story_test_sweep
endif
	RTL

; Start the queued request, as native-story.js does at C0:B073.
story_start_queued:
	SEP #$20
	LDA.w !story_q_valid&$FFFF
	REP #$20
	BEQ .out
	LDA.w !story_can_act&$FFFF
	AND.w #$00FF
	BEQ .out
	SEP #$20
	STZ.w !story_q_valid&$FFFF
	REP #$20
	LDA.w !story_q_actor&$FFFF
	BEQ .start
	; the requesting NPC must still be here, unchanged
	LDA $DC
	CMP.w !story_q_map&$FFFF
	BNE .out
	LDX.w !story_q_actor&$FFFF
	LDA.l $7EE000,X
	AND.w #$0001
	BEQ .out
	LDA.l $7EE03E,X
	CMP.w !story_q_npc_event&$FFFF
	BNE .out
.start
	STZ $D4
	LDA.w !story_q_actor&$FFFF
	STA $3A
	LDA.w !story_q_event&$FFFF
	JSL $01E76D
	REP #$30
	PEA $0000 : PLD
	PEA $7E7E : PLB : PLB
.out
	RTS

; Spell grants retained for absent companions are OR-ed back once present.
story_spell_regrant:
	SEP #$20
	LDA.l $7EE200
	AND.b #$01
	BEQ .sprite
	LDX.w #$0000
-	LDA.l !story_p_spells,X
	ORA.l $7EE3C8,X
	STA.l $7EE3C8,X
	INX
	CPX.w #$0008
	BNE -
.sprite
	LDA.l $7EE400
	AND.b #$01
	BEQ .out
	LDX.w #$0000
-	LDA.l !story_p_spells+8,X
	ORA.l $7EE5C8,X
	STA.l $7EE5C8,X
	INX
	CPX.w #$0008
	BNE -
.out
	REP #$20
	RTS

; First field frame with Goku: initialise the ledger for a run that has no
; story fields yet (new game, or a save made before this module existed).
story_init_persist:
	SEP #$20
	LDA.l !story_p_version
	BNE .out
	; dragon-quest.js restore(): infer collected Balls from $CF90-$CF96 == 1
	LDA.b #$00
	STA.w !story_tmp0&$FFFF
	LDX.w #$0006
-	LDA $CF90,X
	CMP.b #$01
	CLC
	BNE +
	SEC
+	ROL.w !story_tmp0&$FFFF
	DEX
	BPL -
	LDA.w !story_tmp0&$FFFF
	STA.l !story_p_mask
	STA.l !story_p_seeds
	LDA.b #$00
	STA.l !story_p_delivered
	STA.l !story_p_wished
	STA.l !story_p_fast
	; native-story.js restore(): spell grants start from the current slots
	LDX.w #$0007
-	LDA.l $7EE3C8,X
	STA.l !story_p_spells,X
	LDA.l $7EE5C8,X
	STA.l !story_p_spells+8,X
	DEX
	BPL -
	LDA.b #$01
	STA.l !story_p_version
.out
	REP #$20
	RTS

; Water Palace (map 139): remove a stale duplicate Jema after the first
; conversation; keep the one nearest his scripted position.
story_jema_dedupe:
	STZ.w !story_tmp3&$FFFF       ; count
	STZ.w !story_keep&$FFFF
	LDA.w #$FFFF
	STA.w !story_best&$FFFF
	STA.w !story_best+2&$FFFF
	; target position for the current stage
	SEP #$20
	LDA $CF11
	REP #$20
	AND.w #$00FF
	CMP.w #$000A
	BCS .late
	LDY.w #$0131
	CMP.w #$0008
	BCS .mid
	LDA.w #212
	STA.w !story_wtx&$FFFF
	LDA.w #404
	STA.w !story_wty&$FFFF
	BRA .scan0
.mid
	LDA.w #260
	STA.w !story_wtx&$FFFF
	LDA.w #276
	STA.w !story_wty&$FFFF
	BRA .scan0
.late
	LDY.w #$0212
	LDA.w #260
	STA.w !story_wtx&$FFFF
	LDA.w #308
	STA.w !story_wty&$FFFF
.scan0
	STY.w !story_tmp4&$FFFF       ; event to keep
	LDX.w #$0600
.scan
	JSR story_is_jema
	BCC .next
	INC.w !story_tmp3&$FFFF
	LDA.l $7EE03E,X
	AND.w #$07FF
	CMP.w !story_tmp4&$FFFF
	BNE .next
	JSR story_distance
	; strictly nearer than the best so far (first wins ties)
	LDA.w !story_dist+2&$FFFF
	CMP.w !story_best+2&$FFFF
	BCC .better
	BNE .next
	LDA.w !story_dist&$FFFF
	CMP.w !story_best&$FFFF
	BCS .next
.better
	LDA.w !story_dist&$FFFF
	STA.w !story_best&$FFFF
	LDA.w !story_dist+2&$FFFF
	STA.w !story_best+2&$FFFF
	STX.w !story_keep&$FFFF
.next
	TXA
	CLC
	ADC.w #$0200
	TAX
	CPX.w #$1800
	BCC .scan
	LDA.w !story_tmp3&$FFFF
	CMP.w #$0002
	BCC .out
	LDA.w !story_keep&$FFFF
	BEQ .out
	LDX.w #$0600
.drop
	JSR story_is_jema
	BCC .keep
	CPX.w !story_keep&$FFFF
	BEQ .keep
	SEP #$20
	LDA.l $7EE000,X
	AND.b #$FE
	STA.l $7EE000,X
	REP #$20
.keep
	TXA
	CLC
	ADC.w #$0200
	TAX
	CPX.w #$1800
	BCC .drop
.out
	RTS

; X = slot offset. Carry set for an active Jema (species A0) whose event is
; 131 or 212.
story_is_jema:
	LDA.l $7EE000,X
	AND.w #$0001
	BEQ .no
	LDA.l $7EE180,X
	AND.w #$00FF
	CMP.w #$00A0
	BNE .no
	LDA.l $7EE03E,X
	AND.w #$07FF
	CMP.w #$0131
	BEQ .yes
	CMP.w #$0212
	BEQ .yes
.no
	CLC
	RTS
.yes
	SEC
	RTS

; !story_dist = (x-wtx)^2 + (y-wty)^2 for slot X (32-bit, unsigned).
story_distance:
	LDA.l $7EE002,X
	SEC
	SBC.w !story_wtx&$FFFF
	JSR story_square
	LDA.w !story_tmp0&$FFFF
	STA.w !story_dist&$FFFF
	LDA.w !story_tmp1&$FFFF
	STA.w !story_dist+2&$FFFF
	LDA.l $7EE004,X
	SEC
	SBC.w !story_wty&$FFFF
	JSR story_square
	LDA.w !story_tmp0&$FFFF
	CLC
	ADC.w !story_dist&$FFFF
	STA.w !story_dist&$FFFF
	LDA.w !story_tmp1&$FFFF
	ADC.w !story_dist+2&$FFFF
	STA.w !story_dist+2&$FFFF
	RTS

; A = signed 16-bit -> tmp0/tmp1 = A*A (32-bit). Shift-add, preserves X.
story_square:
	BPL +
	EOR.w #$FFFF
	INC
+	STA.w !story_tmp2&$FFFF       ; multiplicand (low 16)
	STA.w !story_tmp5&$FFFF       ; multiplier bits
	STZ.w !story_tmp3&$FFFF       ; multiplicand high
	STZ.w !story_tmp0&$FFFF
	STZ.w !story_tmp1&$FFFF
	PHX
	LDX.w #$0010
.bit
	LSR.w !story_tmp5&$FFFF
	BCC .shift
	LDA.w !story_tmp0&$FFFF
	CLC
	ADC.w !story_tmp2&$FFFF
	STA.w !story_tmp0&$FFFF
	LDA.w !story_tmp1&$FFFF
	ADC.w !story_tmp3&$FFFF
	STA.w !story_tmp1&$FFFF
.shift
	ASL.w !story_tmp2&$FFFF
	ROL.w !story_tmp3&$FFFF
	DEX
	BNE .bit
	PLX
	RTS

; Tree Palace (map 195): the early approach Jema (event 4AC) stands still on
; the dry path. E044 bit 7 is the native stationary-NPC flag.
story_jema_tree_palace:
	LDX.w #$0600
.scan
	LDA.l $7EE000,X
	AND.w #$0001
	BEQ .next
	LDA.l $7EE180,X
	AND.w #$00FF
	CMP.w #$00A0
	BNE .next
	LDA.l $7EE03E,X
	AND.w #$07FF
	CMP.w #$04AC
	BNE .next
	LDA.l $7EE044,X
	AND.w #$0080
	BNE .next
	LDA.w #452
	STA.l $7EE002,X
	LDA.w #756
	STA.l $7EE004,X
	SEP #$20
	LDA.b #$00
	STA.l $7EE006,X
	STA.l $7EE007,X
	LDA.b #$02
	STA.l $7EE00B,X
	LDA.l $7EE044,X
	ORA.b #$80
	STA.l $7EE044,X
	REP #$20
.next
	TXA
	CLC
	ADC.w #$0200
	TAX
	CPX.w #$1800
	BCC .scan
	RTS

; ===========================================================================
; Water Palace Jema (engine/water-palace.js), dynamic route for event 131.
; Carry set: D1-D3 point at a freshly built walk script in SRAM.
; ===========================================================================
story_water_palace:
	LDA $DC
	CMP.w #139
	BNE .no
	SEP #$20
	LDA $CF11
	CMP.b #$08
	REP #$20
	BCS .no
	; first active species-A0 entity (party slots included, as entities())
	LDX.w #$0000
.find
	LDA.l $7EE000,X
	AND.w #$0001
	BEQ .nextj
	LDA.l $7EE180,X
	AND.w #$00FF
	CMP.w #$00A0
	BEQ .found
.nextj
	TXA
	CLC
	ADC.w #$0200
	TAX
	CPX.w #$1800
	BCC .find
.no
	CLC
	RTS
.found
	TXA
	XBA
	LSR                          ; index = X/$200
	INC
	STA.w !story_wji&$FFFF        ; selector = index+1
	; leader: first of E000/E200/E400 active and controlled by player 1
	LDX.w #$0000
.leader
	LDA.l $7EE000,X
	AND.w #$0001
	BEQ +
	LDA.l $7EE02C,X
	AND.w #$0001
	BNE .lead
+	TXA
	CLC
	ADC.w #$0200
	TAX
	CPX.w #$0600
	BCC .leader
	LDX.w #$0000
.lead
	LDA.l $7EE002,X
	STA.w !story_wx&$FFFF
	LDA.l $7EE004,X
	STA.w !story_wy&$FFFF
	; prefix
	LDX.w #$0000
-	LDA.l story_water_prefix,X
	SEP #$20
	STA.l !STORY_WATER_BUF,X
	REP #$20
	INX
	CPX.w #!STORY_WATER_PREFIX_LEN
	BNE -
	STX.w !story_wlen&$FFFF
	; Jema's guide: two stair walks and the right turn, each then WAIT
	LDA.w #$003C
	JSR story_water_emit_jema
	LDA.w #$003C
	JSR story_water_emit_jema
	LDA.w #$00AE
	JSR story_water_emit_jema
	; Goku follows the dry stair: points depend on which bank he is on
	LDA.w !story_wy&$FFFF
	CMP.w #325
	BCC .north
	LDA.w #216
	STA.w !story_wpoints&$FFFF
	LDA.w !story_wy&$FFFF
	STA.w !story_wpoints+2&$FFFF
	LDA.w #216
	STA.w !story_wpoints+4&$FFFF
	LDA.w #308
	STA.w !story_wpoints+6&$FFFF
	LDA.w #280
	STA.w !story_wpoints+8&$FFFF
	LDA.w #308
	STA.w !story_wpoints+10&$FFFF
	LDA.w #$0003
	BRA .route
.north
	LDA.w #280
	STA.w !story_wpoints&$FFFF
	LDA.w !story_wy&$FFFF
	STA.w !story_wpoints+2&$FFFF
	LDA.w #280
	STA.w !story_wpoints+4&$FFFF
	LDA.w #308
	STA.w !story_wpoints+6&$FFFF
	LDA.w #$0002
.route
	STA.w !story_wpts&$FFFF
	STZ.w !story_wptr&$FFFF
.point
	LDX.w !story_wptr&$FFFF
	LDA.w !story_wpoints&$FFFF,X
	STA.w !story_wtx&$FFFF
	LDA.w !story_wpoints+2&$FFFF,X
	STA.w !story_wty&$FFFF
	STZ.w !story_waxis&$FFFF
	JSR story_water_axis
	LDA.w #$0002
	STA.w !story_waxis&$FFFF
	JSR story_water_axis
	LDA.w !story_wptr&$FFFF
	CLC
	ADC.w #$0004
	STA.w !story_wptr&$FFFF
	DEC.w !story_wpts&$FFFF
	BNE .point
	; suffix with Jema's selector
	LDX.w !story_wlen&$FFFF
	LDY.w #$0000
-	TYX
	LDA.l story_water_suffix,X
	AND.w #$00FF
	CPY.w #!STORY_WATER_SUFFIX_JI
	BNE +
	LDA.w !story_wji&$FFFF
+	LDX.w !story_wlen&$FFFF
	SEP #$20
	STA.l !STORY_WATER_BUF,X
	REP #$20
	INC.w !story_wlen&$FFFF
	INY
	CPY.w #!STORY_WATER_SUFFIX_LEN
	BNE -
	LDA.w !story_wlen&$FFFF
	STA.w !story_water_len&$FFFF
	CMP.w #$0201
	BCC +
	JMP .no                      ; the browser rejects walks over 512 bytes
+
	LDA.w #!STORY_WATER_BUF&$FFFF
	STA $D1
	SEP #$20
	LDA.b #!STORY_WATER_BUF>>16
	STA $D3
	REP #$20
	LDA.w #$0131
	STA.w !story_last_event&$FFFF
	SEC
	RTS

; Emit 32 ji A, 08.
story_water_emit_jema:
	PHA
	LDA.w #$0032
	JSR story_water_put
	LDA.w !story_wji&$FFFF
	JSR story_water_put
	PLA
	JSR story_water_put
	LDA.w #$0008
	JMP story_water_put

story_water_put:
	LDX.w !story_wlen&$FFFF
	CPX.w #$0200
	BCS +
	SEP #$20
	STA.l !STORY_WATER_BUF,X
	REP #$20
+	INC.w !story_wlen&$FFFF
	RTS

; One axis of water-palace.js route() for actor 0 (speed 2):
;   delta = round((target-pos)/2); steps of at most 60, each followed by 08.
story_water_axis:
	LDX.w !story_waxis&$FFFF
	LDA.w !story_wtx&$FFFF,X
	SEC
	SBC.w !story_wx&$FFFF,X
	; Math.round(n/2) = (n+1)>>1 (arithmetic)
	CLC
	ADC.w #$0001
	CMP.w #$8000
	ROR
	STA.w !story_wdelta&$FFFF
.step
	LDA.w !story_wdelta&$FFFF
	BEQ .out
	BMI .neg
	CMP.w #61
	BCC +
	LDA.w #60
+	STA.w !story_wstep&$FFFF
	BRA .emit
.neg
	CMP.w #$FFC4                   ; -60
	BCS +
	LDA.w #$FFC4
+	STA.w !story_wstep&$FFFF
.emit
	LDA.w #$0032
	JSR story_water_put
	LDA.w #$0000
	JSR story_water_put
	; code: x: + -> 80+|s|, - -> C0+|s|; y: + -> 40+|s|, - -> |s|
	LDA.w !story_wstep&$FFFF
	BPL +
	EOR.w #$FFFF
	INC
+	STA.w !story_tmp0&$FFFF
	LDA.w !story_waxis&$FFFF
	BNE .yaxis
	LDA.w !story_wstep&$FFFF
	BMI +
	LDA.w #$0080
	BRA .code
+	LDA.w #$00C0
	BRA .code
.yaxis
	LDA.w !story_wstep&$FFFF
	BMI +
	LDA.w #$0040
	BRA .code
+	LDA.w #$0000
.code
	CLC
	ADC.w !story_tmp0&$FFFF
	JSR story_water_put
	LDA.w #$0008
	JSR story_water_put
	; delta -= step; pos += step*2
	LDA.w !story_wdelta&$FFFF
	SEC
	SBC.w !story_wstep&$FFFF
	STA.w !story_wdelta&$FFFF
	LDX.w !story_waxis&$FFFF
	LDA.w !story_wstep&$FFFF
	ASL
	CLC
	ADC.w !story_wx&$FFFF,X
	STA.w !story_wx&$FFFF,X
	BRA .step
.out
	RTS

; ===========================================================================
; Potos gatekeeper (engine/potos-story.js): flying low over the banished
; village gate makes the guard shout Goku down (event 9B).
; ===========================================================================
story_potos_gatekeeper:
	LDA $DC
	CMP.w #131
	BEQ +
	SEP #$20
	STZ.w !story_gate_latched&$FFFF
	REP #$20
	STZ.w !story_gate_home&$FFFF
	RTS
+	LDA.w !story_gate_home&$FFFF
	BEQ .tick
	SEP #$20
	LDA $D0
	BEQ +
	LDA.b #$01
	STA.w !story_gate_started&$FFFF
+	LDA.w !story_gate_started&$FFFF
	REP #$20
	AND.w #$00FF
	BEQ .tick
	LDA.w !story_can_act&$FFFF
	AND.w #$00FF
	BEQ .tick
	; repeating the joke must not walk the guard away from his post
	LDX.w !story_gate_home&$FFFF
	LDA.l $7E003E,X
	AND.w #$07FF
	CMP.w #$010B
	BNE +
	LDA.w !story_gate_x&$FFFF
	STA.l $7E0002,X
	LDA.w !story_gate_y&$FFFF
	STA.l $7E0004,X
+	STZ.w !story_gate_home&$FFFF
.tick
	LDA.w !story_can_act&$FFFF
	AND.w #$00FF
	BNE +
	RTS
+	; the gate guard: species C4 running event 10B, entity index >= 3
	LDX.w #$0600
.find
	LDA.l $7EE000,X
	AND.w #$0001
	BEQ .next
	LDA.l $7EE180,X
	AND.w #$00FF
	CMP.w #$00C4
	BNE .next
	LDA.l $7EE03E,X
	AND.w #$07FF
	CMP.w #$010B
	BEQ .found
.next
	TXA
	CLC
	ADC.w #$0200
	TAX
	CPX.w #$1800
	BCC .find
	RTS
.found
	LDA.l $7EE002
	SEC
	SBC.l $7EE002,X
	STA.w !story_tmp0&$FFFF       ; dx
	LDA.l $7EE004
	SEC
	SBC.l $7EE004,X
	STA.w !story_tmp1&$FFFF       ; dy
	SEP #$20
	LDA.w !story_gate_latched&$FFFF
	REP #$20
	BEQ .trigger
	; unlatch once more than 64 px away
	LDA.w !story_tmp0&$FFFF
	JSR story_abs
	CMP.w #65
	BCS .unlatch
	STA.w !story_tmp2&$FFFF
	LDA.w !story_tmp1&$FFFF
	JSR story_abs
	CMP.w #65
	BCS .unlatch
	STA.w !story_tmp3&$FFFF
	PHX
	LDA.w !story_tmp2&$FFFF
	JSR story_square
	LDA.w !story_tmp0&$FFFF
	STA.w !story_tmp4&$FFFF
	LDA.w !story_tmp3&$FFFF
	JSR story_square
	PLX
	LDA.w !story_tmp0&$FFFF
	CLC
	ADC.w !story_tmp4&$FFFF
	CMP.w #4097
	BCC .stay
.unlatch
	SEP #$20
	STZ.w !story_gate_latched&$FFFF
	REP #$20
.stay
	RTS
.trigger
	SEP #$20
	LDA $CF10
	CMP.b #$0A
	REP #$20
	BCC .stay
	LDA.w #!STORY_Q_LOCAL_FLIGHT
	JSR story_query
	BEQ .stay
	LDA.w !story_tmp0&$FFFF
	JSR story_abs
	CMP.w #21
	BCS .stay
	LDA.w !story_tmp1&$FFFF       ; -32 <= dy <= -8
	BPL .stay
	CMP.w #$FFF9                   ; dy > -8
	BCS .stay
	CMP.w #$FFE0                   ; dy < -32
	BCC .stay
	STX.w !story_tmp2&$FFFF
	LDA.w #$009B
	JSL story_api_request
	REP #$30
	BCC .stay
	LDX.w !story_tmp2&$FFFF
	SEP #$20
	LDA.b #$01
	STA.w !story_gate_latched&$FFFF
	STZ.w !story_gate_started&$FFFF
	REP #$20
	INC.w !story_gate_triggers&$FFFF
	TXA
	CLC
	ADC.w #$E000
	STA.w !story_gate_home&$FFFF
	LDA.l $7EE002,X
	STA.w !story_gate_x&$FFFF
	LDA.l $7EE004,X
	STA.w !story_gate_y&$FFFF
	LDA.w #$0000
	STA.w !story_hook_event&$FFFF
	LDA.w #!STORY_H_FLIGHT_LAND
	JSR story_call_hook
	RTS

story_abs:
	BPL +
	EOR.w #$FFFF
	INC
+	RTS

; ===========================================================================
; Character names (engine/native-names.js). C0:1866 copies the 12 bytes of
; name slot n ($CC00+12n) into the text buffer $A22F for a 57 n code. JSL
; per byte: M8/X16, DB=$7E, X = 12n+i, Y = i, loop counter in B.
; ===========================================================================
story_name_byte:
	PHP
	REP #$30
	PHA
	PHX
	PHY
	CPX.w #$0030
	BCS .native                  ; only slots 0-3 ($CC00-$CC2F)
	CPY.w #$0000
	BNE .copy
	LDA.w #$0000                 ; n = X/12 (X = 12n at i = 0)
	CPX.w #$000C
	BCC +
	INC
	CPX.w #$0018
	BCC +
	INC
	CPX.w #$0024
	BCC +
	INC
+	PHY
	JSR story_display_name
	PLY
.copy
	TYX
	SEP #$20
	LDA.l !story_name_buf,X
	STA.w $A22F,Y
	BRA .out
.native
	SEP #$20
	LDA.w $CC00,X
	STA.w $A22F,Y
.out
	REP #$30
	PLY
	PLX
	PLA
	PLP
	RTL

; A = n (0-3) -> !story_name_buf = displayName(n), zero padded to 12.
; M16/X16. Clobbers A/X/Y.
story_display_name:
	STA.l !story_tmp0
	LDX.w #$000A
	LDA.w #$0000
-	STA.l !story_name_buf,X
	DEX
	DEX
	BPL -
	LDA.l !story_tmp0
	CMP.w #$0003
	BEQ .boy
	; slot n: bytes until 0 or FF, at most 12
	ASL
	ASL
	STA.l !story_tmp1            ; 4n
	ASL
	CLC
	ADC.l !story_tmp1            ; 12n
	TAX
	LDY.w #$0000
	SEP #$20
-	LDA.l $7ECC00,X
	BEQ .slot_end
	CMP.b #$FF
	BEQ .slot_end
	PHX
	TYX
	STA.l !story_name_buf,X
	PLX
	INX
	INY
	CPY.w #$000C
	BNE -
.slot_end
	REP #$20
	CPY.w #$0000
	BNE .done
	LDA.l !story_tmp0
	BEQ .done                    ; Goku's slot has no default
	DEC                          ; default 1 or 2
	BRA .default
.boy
	; the boy's name lives in the tail of Goku's slot ($CC06, 6 letters)
	LDX.w #$0000
	SEP #$20
-	LDA.l $7ECC06,X
	BEQ .boy_end
	CMP.b #$FF
	BEQ .boy_end
	STA.l !story_name_buf,X
	INX
	CPX.w #$0006
	BNE -
.boy_end
	REP #$20
	CPX.w #$0000
	BEQ .boy_default
	CPX.w #!STORY_UNNAMED_BOY_LEN
	BNE .done
	; the title editor's untouched default reads as unnamed
	LDX.w #$0000
	SEP #$20
-	LDA.l !story_name_buf,X
	CMP.l story_name_unnamed_boy,X
	BNE .named
	INX
	CPX.w #!STORY_UNNAMED_BOY_LEN
	BNE -
	REP #$20
.boy_default
	LDA.w #$0002
.default
	; A = default index 0-2: copy 12 bytes of story_name_default
	STA.l !story_tmp1
	ASL
	CLC
	ADC.l !story_tmp1
	ASL
	ASL
	TAX                          ; index*12
	LDY.w #$0000
	SEP #$20
-	LDA.l story_name_default,X
	PHX
	TYX
	STA.l !story_name_buf,X
	PLX
	INX
	INY
	CPY.w #$000C
	BNE -
.named
	REP #$20
.done
	RTS

; ===========================================================================
; Public API (JSL; any M/X on entry unless noted; DB/D preserved)
; ===========================================================================

; A16 = n (0-3) -> X16 = address in bank $7E of displayName(n) (12 bytes,
; zero padded). For overlay text (King Kai's radio, captions).
story_api_display_name:
	PHB
	PHD
	PHP
	REP #$30
	PEA $7E7E : PLB : PLB
	PEA $0000 : PLD
	AND.w #$0003
	JSR story_display_name
	PLP
	PLD
	PLB
	REP #$10
	LDX.w #!story_name_buf&$FFFF
	RTL

; A16 = story flag index (0-$FF, i.e. $7E:CF00+n) -> A16 = its value.
story_api_flag_get:
	PHP
	REP #$30
	AND.w #$00FF
	TAX
	LDA.l $7ECF00,X
	AND.w #$00FF
	PLP
	RTL

; A16 = flag index, X16 = value: $7E:CF00+n = value.
story_api_flag_set:
	PHP
	REP #$30
	PHX
	AND.w #$00FF
	TAX
	PLA
	SEP #$20
	STA.l $7ECF00,X
	PLP
	RTL

; A16 = flag index, X16 = minimum: raise the flag to it, never lower
; (the story-area rule). Carry set when it changed.
story_api_flag_raise:
	PHP
	REP #$30
	PHX
	AND.w #$00FF
	TAX
	PLA
	SEP #$20
	CMP.l $7ECF00,X
	BEQ .same
	BCC .same
	STA.l $7ECF00,X
	PLP
	SEC
	RTL
.same
	PLP
	CLC
	RTL

; -> A16 = ledger: low byte balls held (bit = palace), high byte seeds
; personally collected. X16 = bit0 wished.
story_api_quest_status:
	PHP
	REP #$30
	LDA.l !story_p_wished
	AND.w #$0001
	TAX
	LDA.l !story_p_mask
	AND.w #$007F
	STA.l !story_tmp5
	LDA.l !story_p_seeds
	AND.w #$007F
	XBA
	ORA.l !story_tmp5
	PLP
	RTL

; ===========================================================================
; Scene fast-forward (engine/scene-fast-forward.js). Holding R during a
; scene confirms prose with pulsed B and stops at choices; R itself is hidden
; from the game. The browser also runs these frames faster; the cartridge
; cannot, so this is the auto-confirm half. The UI module owns input
; features (plan.md); build with -DSTORY_FAST_FORWARD to run this one from
; the story field frame instead. story_api_window_has_choice is the part
; that needs the event stream.
; ===========================================================================

; JSL API: carry set when the window the interpreter is in ($D1-$D3) holds
; a choice before it closes (or the stream is unknown), as windowHasChoice.
story_api_window_has_choice:
	PHB
	PHD
	PHP
	REP #$30
	PHX
	PHY
	PEA $7E7E : PLB : PLB
	PEA $0000 : PLD
	JSR story_window_has_choice
	PLY
	PLX
	BCS .yes
	PLP
	PLD
	PLB
	CLC
	RTL
.yes
	PLP
	PLD
	PLB
	SEC
	RTL

story_fast_forward:
	LDA.l !core_pad
	AND.w #!PAD_R|!PAD_L
	CMP.w #!PAD_R
	BEQ +
	JMP .off
+	LDA.w #!STORY_Q_FRIEZA_INPUT_LOCKED
	JSR story_query
	BEQ .scene
	LDA.w !core_pad_mask&$FFFF
	ORA.w #!PAD_R
	STA.w !core_pad_mask&$FFFF
	JMP .off
.scene
	SEP #$20
	LDA $D0
	BEQ .off8
	LDA $E4
	BEQ .off8
	LDA $EC
	AND.b #$7E
	BNE .off8
	LDA $D0
	CMP.b #$81
	BEQ .dialog
	CMP.b #$83
	BEQ .dialog
	; scripted motion: R is masked, nothing to confirm
	REP #$20
	STZ.w !story_ff_valid&$FFFF
	BRA .mask
.dialog
	; rescan the window when the script pointer moved
	LDA.w !story_ff_valid&$FFFF
	BEQ .scan
	LDA $D3
	CMP.w !story_ff_ptr+2&$FFFF
	BNE .scan
	REP #$20
	LDA $D1
	CMP.w !story_ff_ptr&$FFFF
	BEQ .known
.scan
	REP #$20
	LDA $D1
	STA.w !story_ff_ptr&$FFFF
	SEP #$20
	LDA $D3
	STA.w !story_ff_ptr+2&$FFFF
	LDA.b #$01
	STA.w !story_ff_valid&$FFFF
	REP #$20
	JSR story_window_has_choice
	SEP #$20
	LDA.b #$00
	ROL
	STA.w !story_ff_choice&$FFFF
	REP #$20
.known
	; mask R in a choice window too; confirm only prose
	LDA.w !story_ff_choice&$FFFF
	AND.w #$00FF
	BNE .mask
	LDA.l !core_frame
	AND.w #$0007
	CMP.w #$0002
	BCS .mask
	LDA.w !core_pad_inject&$FFFF
	ORA.w #!PAD_B
	STA.w !core_pad_inject&$FFFF
.mask
	LDA.w !core_pad_mask&$FFFF
	ORA.w #!PAD_R
	STA.w !core_pad_mask&$FFFF
	RTS
.off8
	REP #$20
.off
	SEP #$20
	STZ.w !story_ff_valid&$FFFF
	REP #$20
	RTS

; windowHasChoice: scan the event stream at D1-D3 (at most 4096 bytes) for a
; selection (58/5B) before the window ends (00/51/02). Carry set = choice,
; or unknown. M16/X16.
story_window_has_choice:
	LDY.w #$0000
.next
	CPY.w #$1000
	BCS .yes
	SEP #$20
	LDA [$D1],Y
	CMP.b #$58
	BEQ .yes8
	CMP.b #$5B
	BEQ .yes8
	CMP.b #$00
	BEQ .no8
	CMP.b #$51
	BEQ .no8
	CMP.b #$02
	BEQ .no8
	REP #$20
	JSR story_command_length
	BRA .next
.yes8
	REP #$20
.yes
	SEC
	RTS
.no8
	REP #$20
	CLC
	RTS

; engine/event-codec.js commandLength at [D1]+Y: Y += length. M16/X16.
story_command_length:
	SEP #$20
	LDA [$D1],Y
	CMP.b #$7D
	BEQ .ascii
	CMP.b #$7F
	BCS .one                     ; 7F and text 80-FF
	CMP.b #$2D
	BEQ .shake
	CMP.b #$10
	BCC .table
	CMP.b #$30
	BCC .two
.table
	REP #$20
	AND.w #$00FF
	TAX
	LDA.l story_opcode_length,X
	AND.w #$00FF
	BRA .add
.shake
	INY
	LDA [$D1],Y
	DEY
	CMP.b #$05
	BEQ .four
	CMP.b #$06
	BEQ .four
	CMP.b #$80
	BCC .two
	CMP.b #$90
	BCS .two
.four
	REP #$20
	LDA.w #$0004
	BRA .add
.two
	REP #$20
	LDA.w #$0002
	BRA .add
.one
	REP #$20
	LDA.w #$0001
.add
	STA.w !story_tmp0&$FFFF
	TYA
	CLC
	ADC.w !story_tmp0&$FFFF
	TAY
	RTS
.ascii
	; credits: literal ASCII up to and including the closing 7E
	INY
-	CPY.w #$1000
	BCS .done
	LDA [$D1],Y
	INY
	CMP.b #$7E
	BNE -
.done
	REP #$20
	RTS

; Opcode lengths 00-7C for opcodes not decided above (event-codec.js).
story_opcode_length:
	db 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1      ; 00-0F
	db 2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2      ; 10-1F
	db 2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2      ; 20-2F
	db 3,3,3,3,3,1,3,3,4,4,4,4,4,1,1,1      ; 30-3F
	db 5,5,5,5,1,1,1,1,6,6,6,6,6,6,6,1      ; 40-4F
	db 1,1,1,1,1,1,1,2,1,2,2,1,1,1,1,1      ; 50-5F
	db 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1      ; 60-6F
	db 1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1      ; 70-7F

; ===========================================================================
; Core save/load hooks: drop volatile requests and greetings with the old run.
; ===========================================================================
story_load:
story_new_game:
	SEP #$20
	STZ.w !story_q_valid&$FFFF
	STZ.w !story_greeted&$FFFF
	STZ.w !story_greet_pending&$FFFF
	STZ.w !story_cand_valid&$FFFF
	STZ.w !story_ff_valid&$FFFF
	STZ.w !story_gate_latched&$FFFF
	REP #$20
	STZ.w !story_gate_home&$FFFF
	RTL

; Addresses for tests and tools (read from ROM through the symbol file).
story_addresses:
	dl !persist_goku_active, !PERSIST_STORY, !RAM_STORY, !STORY_WATER_BUF
	dl !STORY_TEST_LOG, !STORY_TEST_QUERIES, !STORY_TEST_SWEEP

; Test builds (-DSTORY_TEST): every hook appends (id, A, X) to a log and
; every foreign query answers from a table (see the defines at the top).
if defined("STORY_TEST")
	incsrc "story/testhooks.asm"
; A = hook id, event A pushed. M16/X16.
story_test_log:
	STA.l !story_tmp4
	LDA.l !STORY_TEST_LOG
	CMP.w #$0080
	BCS .full
	ASL
	STA.l !story_tmp3
	ASL
	CLC
	ADC.l !story_tmp3
	PHX
	TAX
	LDA.l !story_tmp4
	STA.l !STORY_TEST_LOG+2,X
	LDA $03,S
	STA.l !STORY_TEST_LOG+4,X
	LDA $01,S
	STA.l !STORY_TEST_LOG+6,X
	PLX
	LDA.l !STORY_TEST_LOG
	INC
	STA.l !STORY_TEST_LOG
.full
	PLA
	RTL

; Evaluate every route program under the current party and queries and
; write the chosen script pointers (3 bytes each, routed ids ascending) to
; !STORY_TEST_SWEEP+1. Requested by a nonzero !STORY_TEST_SWEEP. M16/X16.
story_test_sweep:
	LDA.l !STORY_TEST_SWEEP
	AND.w #$00FF
	BNE +
	RTS
+	SEP #$20
	LDA.b #$01
	STA.l !story_sweeping
	REP #$20
	LDA $D1
	PHA
	LDA $D3
	PHA
	LDA.w #$0001
	STA.l !story_tmp2            ; output offset
	LDA.w #$0000
.id
	STA.l !story_req_id
	ASL
	TAX
	LDA.l story_dispatch,X
	BEQ .next
	JSR story_run_program
	LDA.l !story_tmp2
	TAX
	LDA $D1
	STA.l !STORY_TEST_SWEEP,X
	SEP #$20
	LDA $D3
	STA.l !STORY_TEST_SWEEP+2,X
	REP #$20
	TXA
	CLC
	ADC.w #$0003
	STA.l !story_tmp2
.next
	LDA.l !story_req_id
	INC
	CMP.w #$0800
	BCC .id
	PLA
	STA $D3
	PLA
	STA $D1
	SEP #$20
	LDA.b #$00
	STA.l !story_sweeping
	STA.l !STORY_TEST_SWEEP
	REP #$20
	RTS
endif

story_code_end:
assert story_code_end <= !CODE_STORY+$7C00, "story code bank overflow"
pullpc

; ---------------------------------------------------------------------------
; Patches of original code
; ---------------------------------------------------------------------------
; C1:E794 event-table lookup (A5 00 C9 00 ..) -> story_resolve, then branch
; over the rest of the original lookup to E7BA.
%orig4($C1E794, $00C900A5)
%hijack_jsl($C1E794, story_resolve, 4, story)
%orig2($C1E798, $0804)
%patch($C1E798, 2, story)
pushpc
org $C1E798
	db $80, $E7BA-$E79A          ; BRA $E7BA
pullpc
; C1:E8EF opcode fetch (REP #$20 / LDA [$D1]) -> story_fetch
%orig4($C1E8EF, $D1A720C2)
%hijack($C1E8EF, story_fetch, 4, story)
; 00:C481 map object list (REP #$30 / LDA $DC) -> story_map_load
%orig4($C0C481, $DCA530C2)
%hijack_jsl($C0C481, story_map_load, 4, story)
; 00:1866 name copy (LDA $CC00,X / STA $A22F,Y) -> story_name_byte
%orig4($C01866, $99CC00BD)
%orig2($C0186A, $A22F)
%hijack_jsl($C01866, story_name_byte, 6, story)
; 00:C487 map object list bounds -> story_object_list, then BRA to C498
%orig4($C0C487, $C87000BF)
%orig4($C0C48B, $02BF1D85)
%hijack_jsl($C0C487, story_object_list, 4, story)
%patch($C0C48B, 2, story)
pushpc
org $C0C48B
	db $80, $C498-$C48D          ; BRA $C498
pullpc
; 00:DD85 object record copied (LDA #$01 / STA $C800,X) -> story_object
%orig4($C0DD85, $009D01A9)
%orig1($C0DD89, $C8)
%hijack_jsl($C0DD85, story_object, 5, story)
