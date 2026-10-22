; Song-load-only instrument cache, two allocators chosen by song history.
; A first visit (no return within the last four changes) uses the retail
; allocator: append missing samples at the tail; when the tail is full,
; pack the required set from the floor once, then append. That keeps the
; most shared samples low, where a later song's larger echo cannot reach
; them. A return to a recent song (field/town/battle) keeps its warm working
; set with the non-moving cache: fill actual holes first, retaining unrelated
; samples until a new allocation overlaps them; only fragmentation of the
; REQUIRED set invokes downward compaction.
; Native cache ids/start/size and the final metadata sender remain the ABI.
; D=$1E00, DB=0, X16. $8A flags: low byte: 0 disposable, 1 retained, 2 upload.
; Bit 8 remembers the preceding song: prefer retaining its unused samples.
if !AUDIO_CUSTOM_SAMPLES

audio_cache_echo:
	; Keep the actual echo ceiling in $F1/$F2, but inspect each extent below.
	; Retail's truncation assumes entries are contiguous and address-sorted.
	JML $C30651

audio_cache_plan:
	REP #$20
	LDA $05 : AND.w #$00FF
	TAX : LDA.l audio_cache_counts,X : AND.w #$00FF
	ASL : STA $EA : ASL : STA $EC
	LDA $05 : AND.w #$00FF : ASL : STA $CC
	ASL : ASL : ASL : ASL : CLC : ADC $CC : STA $CA
	LDA $05 : AND.w #$00FF
	ASL : ASL : ASL : ASL : ASL : TAX
	LDY.w #$0000
.list
	LDA.l $C33F22,X : STA.w $1EAA,Y
	LDA.w $1E8A,Y : AND.w #$00FF : BEQ +
	LDA.w #$0100
+	STA.w $1E8A,Y
	INX : INX : INY : INY
	CPY.w #$0020 : BNE .list
	LDX.w #$0000
.retain
	LDA $28,X : BEQ .next
	LDA $48,X : CMP $F8 : BCC .discard
	CLC : ADC $6A,X : CMP $F1 : BCS .discard
	; One ROM membership lookup replaces a 16-entry linear search.
	TXY : LDA $28,X : CLC : ADC $CA : TAX
	LDA.l audio_cache_members,X : LSR : TYX : BCC .next
.keep
	LDA $8A,X : ORA.w #$0001 : STA $8A,X
	BRA .next
.discard
	STZ $28,X
.next
	INX : INX : CPX.w #$0020 : BNE .retain
	JSR audio_cache_sort
	JSR audio_cache_history
	BEQ +
	JMP audio_cache_allocate
+	JMP audio_cache_append

; The last four song changes (id + 1; zero is empty, as in cleared WRAM) and
; a three-load window after a return. Song loads only: no frame work.
; A16 in and out; Z set when this load is a first visit (no recent return).
audio_cache_history:
	SEP #$20
	LDA.l !au_cache_heat : BEQ +
	DEC : STA.l !au_cache_heat
+	LDA $05 : INC
	LDX.w #$0000
.find
	CMP.l !au_cache_history,X : BEQ .return
	INX : CPX.w #$0004 : BNE .find
	BRA .push
.return
	XBA : LDA.b #$03 : STA.l !au_cache_heat : XBA
.push
	XBA
	LDA.l !au_cache_history+2 : STA.l !au_cache_history+3
	LDA.l !au_cache_history+1 : STA.l !au_cache_history+2
	LDA.l !au_cache_history : STA.l !au_cache_history+1
	XBA : STA.l !au_cache_history
	LDA.l !au_cache_heat
	REP #$20
	RTS

; The retail allocator's plan. Its fit test counts every missing list
; entry, a duplicated one twice (song $18's two strike entries), as the
; retail planner does, so the cache packs at the same loads; the sample is
; sent once.
audio_cache_append:
	STZ $17                     ; missing bytes (saturated)
	STZ $21                     ; missing entries
	LDY.w #$0000
.sum
	LDA.w $1EAA,Y : BEQ .counted
	LDX.w #$0000
.find
	CMP $28,X : BEQ .cached
	INX : INX : CPX.w #$0020 : BNE .find
	ASL : TAX
	LDA.l audio_cache_lengths,X : CLC : ADC $17 : BCC +
	LDA.w #$FFFF
+	STA $17
	INC $21
.cached
	INY : INY : CPY.w #$0020 : BNE .sum
.counted
	LDA $21 : BNE +
	JMP audio_cache_uploads
+	JSR .tail                   ; $1B = tail, $1D = live slots
	LDA $1D : CLC : ADC $21 : CMP.w #$0011 : BCS .pack
	LDA $1B : CLC : ADC $17 : BCS .pack
	CMP $F1 : BCC .append
.pack
	STZ $17                     ; pack the whole required set once
	JSR audio_cache_compact
	JSR audio_cache_sort
	JSR .tail
.append
	; Each missing list entry once, in list order, at the tail. Empty slots
	; follow the sorted live ones, so the slots stay address-ordered.
	LDY.w #$0000
.next
	LDA.w $1EAA,Y : BEQ .done
	STA $19
	LDX.w #$0000
.have
	CMP $28,X : BEQ .skip
	INX : INX : CPX.w #$0020 : BNE .have
	LDX.w #$0000
.empty
	LDA $28,X : BEQ .place
	INX : INX : BRA .empty
.place
	LDA $19 : STA $28,X
	ASL : PHX : TAX
	LDA.l audio_cache_lengths,X
	PLX
	STA $6A,X
	LDA $1B : STA $48,X
	CLC : ADC $6A,X : STA $1B
	LDA.w #$0002 : STA $8A,X
.skip
	INY : INY : CPY.w #$0020 : BNE .next
.done
	JMP audio_cache_uploads
.tail
	LDA $F8 : STA $1B
	STZ $1D
	LDX.w #$0000
.live
	LDA $28,X : BEQ .end
	LDA $48,X : CLC : ADC $6A,X : STA $1B
	INC $1D
	INX : INX : CPX.w #$0020 : BNE .live
.end
	RTS

audio_cache_allocate:
	; Follow the authored instrument order (arrangements put shared samples
	; first). Among legal holes, minimize shared-instrument loss, then address.
	LDY.w #$0000
.missing
	LDA.w $1EAA,Y : BEQ .ready
	BMI .next
	LDX.w #$0000
.find
	CMP $28,X : BEQ .have
	INX : INX : CPX.w #$0020 : BNE .find
	STA $19 : ASL : TAX
	LDA.l audio_cache_lengths,X : STA $17
	BRA .gap
.have
	; Required entries cannot be evicted. Skip repeated 16-slot lookups for
	; entries already resolved by an earlier allocation pass.
	LDA.w $1EAA,Y : ORA.w #$8000 : STA.w $1EAA,Y
.next
	INY : INY : CPY.w #$0020 : BNE .missing
.ready
	LDY.w #$0000
.unmark
	LDA.w $1EAA,Y : AND.w #$7FFF : STA.w $1EAA,Y
	INY : INY : CPY.w #$0020 : BNE .unmark
	JMP audio_cache_uploads
.gap
	; A completely free gap has zero eviction cost. Find the earliest one in
	; one linear scan before doing the weighted overlapping-extent search.
	LDA $F8 : STA $1B : LDX.w #$0000
.free
	LDA $28,X : BEQ .free_tail
	LDA $48,X : SEC : SBC $1B : CMP $17 : BCS .free_found
	LDA $48,X : CLC : ADC $6A,X : STA $1B
	INX : INX : CPX.w #$0020 : BNE .free
.free_tail
	LDA $1B : CLC : ADC $17 : BCS .weighted
	CMP $F1 : BCS .weighted
.free_found
	LDA $1B : STA $21 : STZ $1F : JMP .found
.weighted
	LDA.w #$FFFF : STA $1F
	LDA.w #$FFFE : STA $25
	LDA $F8
.candidate
	STA $1B
	CLC : ADC $17 : BCS .candidate_next
	STA $1D : CMP $F1 : BCS .candidate_next
	STZ $23
	LDX $25 : INX : INX
	CPX.w #$0020 : BEQ .scanned
.extent
	; Slots are address-sorted with empties last: the first slot at or
	; above the candidate's end, or empty, ends the overlap scan.
	LDA $28,X : BEQ .scanned
	LDA $48,X : CMP $1D : BCS .scanned
	CLC : ADC $6A,X : CMP $1B : BCC .extent_next : BEQ .extent_next
	LDA $8A,X : AND.w #$00FF : BNE .candidate_next
	PHX : LDA $28,X : ASL : TAX
	LDA.l audio_cache_costs,X : PLX : TAY
	LDA $8A,X : BIT.w #$0100 : BEQ .unrecent
	TYA : ASL : TAY
.unrecent
	TYA : CLC : ADC $23 : STA $23
	CMP $1F : BCC .extent_next : BNE .candidate_next
	LDA $1B : CMP $21 : BCS .candidate_next
.extent_next
	INX : INX : CPX.w #$0020 : BNE .extent
.scanned
	LDA $23 : CMP $1F : BCC .best : BNE .candidate_next
	LDA $1B : CMP $21 : BCS .candidate_next
.best
	LDA $23 : STA $1F
	LDA $1B : STA $21
	LDA $1F : BEQ .chosen
.candidate_next
	INC $25 : INC $25
	LDX $25 : CPX.w #$0020 : BEQ .chosen
	LDA $28,X : BEQ .candidate_next
	LDA $48,X : CLC : ADC $6A,X
	LDY $1F : BEQ + : JMP .candidate
+
	CMP $21 : BCS .candidate_next
	BRL .candidate
.chosen
	LDA $1F : CMP.w #$FFFF : BNE .found
	JSR audio_cache_compact
	JSR audio_cache_sort
	JMP audio_cache_allocate
.found
	LDA $21 : STA $1B : CLC : ADC $17 : STA $1D
	; Evict only disposable entries overlapping the chosen extent.
	LDX.w #$0000
	LDA $1F : BEQ .slot
.evict
	LDA $28,X : BEQ .evict_next
	LDA $48,X : CMP $1D : BCS .evict_next
	CLC : ADC $6A,X : CMP $1B : BCC .evict_next : BEQ .evict_next
	STZ $28,X
.evict_next
	INX : INX : CPX.w #$0020 : BNE .evict
	LDX.w #$0000
.slot
	LDA $28,X : BEQ .place
	INX : INX : CPX.w #$0020 : BNE .slot
	LDX.w #$0000
.disposable
	LDA $8A,X : BEQ .place
	INX : INX : CPX.w #$0020 : BNE .disposable
	LDX.w #$0000
.recent
	LDA $8A,X : AND.w #$00FF : BEQ .place
	INX : INX : BRA .recent
.place
	LDA $19 : STA $28,X
	LDA $17 : STA $6A,X
	LDA $1B : STA $48,X
	LDA.w #$0002 : STA $8A,X
	JSR audio_cache_sort
	JMP audio_cache_allocate

; Address ordering makes each candidate test start AFTER its left neighbour,
; avoiding repeated scans of extents that provably cannot overlap it.
audio_cache_sort:
	; Only one new allocation (or zeroed entries) normally changed. Insertion
	; sorting shifts it once instead of making fifteen full bubble passes.
	LDX.w #$0002
.outer
	STX $23
	LDA $28,X : BEQ .next
	DEX : DEX
.compare
	LDA $28,X : BEQ .swap
	LDA $48,X : CMP $4A,X : BCC .next : BEQ .next
.swap
	LDY $28,X : LDA $2A,X : STA $28,X : TYA : STA $2A,X
	LDY $48,X : LDA $4A,X : STA $48,X : TYA : STA $4A,X
	LDY $6A,X : LDA $6C,X : STA $6A,X : TYA : STA $6C,X
	LDY $8A,X : LDA $8C,X : STA $8A,X : TYA : STA $8C,X
	CPX.w #$0000 : BEQ .next
	DEX : DEX : BRA .compare
.next
	LDX $23 : INX : INX : CPX.w #$0020 : BNE .outer
	RTS

audio_cache_compact:
	; Pack only until the requested hole exists ($17=0 rescues the whole set
	; below a newly enlarged echo buffer). Unuploaded allocations move for
	; free. Every physical move is downward: native forward-copy semantics.
	; Callers keep the slots address-sorted, so live entries are visited in
	; address order by index (no minimum search per move).
	LDX.w #$0000
.clear
	LDA $8A,X : AND.w #$00FF : BNE .next
	STZ $28,X : STZ $8A,X
.next
	INX : INX : CPX.w #$0020 : BNE .clear
	LDA $F8 : STA $1B
	LDX.w #$0000
.walk
	LDA $28,X : BEQ .skip
	LDA $17 : BEQ .move
	CLC : ADC $1B : CMP $48,X : BCC .done : BEQ .done
.move
	LDA $48,X : CMP $1B : BEQ .same
	LDA $8A,X : AND.w #$00FF : CMP.w #$0002 : BEQ .planned
	PHX
.copy
	; Profiler entry: X=cache slot, $1B=destination, $6A,X=length.
	LDY $48,X : STY.w $2142
	SEP #$20
	LDA.b #$07 : STA.w $2141
	LDA.b #$00 : JSR audio_songload_ack
	LDY $1B : STY.w $2142
	LDA.b #$01 : JSR audio_songload_ack
	LDY $6A,X : STY.w $2142
	LDA.b #$02 : JSR audio_songload_ack
	REP #$20
	PLX
.planned
	LDA $1B : STA $48,X
.same
	CLC : ADC $6A,X : STA $1B
.skip
	INX : INX : CPX.w #$0020 : BNE .walk
.done
	RTS

audio_cache_uploads:
	LDX.w #$0000
.slot
	LDA $8A,X : AND.w #$00FF : CMP.w #$0002 : BNE .next
	PHX
	LDY $48,X : STY.w $2142
	SEP #$20
	LDA.l !au_load_fast : BEQ .native
	LDA.b #$04 : BRA .mode
.native
	LDA.b #$03
.mode
	STA.w $2141
	LDA.b #$00 : JSR audio_songload_ack
	REP #$20
	LDA $28,X : DEC : STA $14
	ASL : CLC : ADC $14 : TAY
	LDA $6A,X : PHA
	TYX
	LDA.l $C33DF9,X : STA $14
	SEP #$20
	LDA.l $C33DFB,X : STA $16
	LDY $14 : STZ $14 : STZ $15
	INY : BNE + : INC $16
+	INY : BNE + : INC $16
+	PLX
	LDA.b #$01 : STA $10
.send
	; Profiler entry: X=bytes, ROM source=[$14],Y, planned destination above.
	JSR audio_songload_send
	REP #$20
	PLX
.next
	INX : INX : CPX.w #$0020 : BNE .slot
	JML $C304C2

%orig4($C3028D, $00A220C2)
%orig1($C30291, $00)
%hijack($C3028D, audio_cache_plan, 5, audio)
%orig4($C30635, $0000A29B)
%hijack($C30635, audio_cache_echo, 4, audio)
endif
