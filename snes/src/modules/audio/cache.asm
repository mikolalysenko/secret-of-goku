; Song-load-only, non-moving instrument cache. The retail allocator compacts
; all retained instruments when its contiguous tail fills. Fill actual holes
; first, retaining unrelated samples until a new allocation overlaps them.
; Only fragmentation of the REQUIRED set invokes downward compaction.
; Native cache ids/start/size and the final metadata sender remain the ABI.
; D=$1E00, DB=0, X16. $8A flags: 0 disposable, 1 retained, 2 upload, 3 moved.
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
	LDA $05 : AND.w #$00FF
	ASL : ASL : ASL : ASL : ASL : TAX
	LDY.w #$0000
.list
	LDA.l $C33F22,X : STA.w $1EAA,Y
	LDA.w #$0000 : STA.w $1E8A,Y
	INX : INX : INY : INY
	CPY.w #$0020 : BNE .list
	LDX.w #$0000
.retain
	LDA $28,X : BEQ .next
	LDA $48,X : CMP $F8 : BCC .discard
	CLC : ADC $6A,X : CMP $F1 : BCS .discard
	LDA $28,X
	LDY.w #$0000
.required
	CMP.w $1EAA,Y : BEQ .keep
	INY : INY : CPY.w #$0020 : BNE .required
	BRA .next
.keep
	LDA.w #$0001 : STA $8A,X
	BRA .next
.discard
	STZ $28,X
.next
	INX : INX : CPX.w #$0020 : BNE .retain
	JSR audio_cache_sort

audio_cache_allocate:
	; Follow the authored instrument order (arrangements put shared samples
	; first). Among legal holes, minimize evicted bytes, then address.
	LDY.w #$0000
.missing
	LDA.w $1EAA,Y : BEQ .ready
	LDX.w #$0000
.find
	CMP $28,X : BEQ .next
	INX : INX : CPX.w #$0020 : BNE .find
	STA $19 : ASL : TAX
	LDA.l audio_cache_lengths,X : STA $17
	BRA .gap
.next
	INY : INY : CPY.w #$0020 : BNE .missing
.ready
	JMP audio_cache_uploads
.gap
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
	LDA $28,X : BEQ .extent_next
	LDA $48,X : CMP $1D : BCS .extent_next
	CLC : ADC $6A,X : CMP $1B : BCC .extent_next : BEQ .extent_next
	LDA $8A,X : BNE .candidate_next
	LDA $23 : CLC : ADC $6A,X : STA $23
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
.candidate_next
	INC $25 : INC $25
	LDX $25 : CPX.w #$0020 : BEQ .chosen
	LDA $28,X : BEQ .candidate_next
	LDA $48,X : CLC : ADC $6A,X
	LDY $1F : BNE .candidate
	CMP $21 : BCS .candidate_next
	BRA .candidate
.chosen
	LDA $1F : CMP.w #$FFFF : BNE .found
	JSR audio_cache_compact
	JSR audio_cache_sort
	JMP audio_cache_allocate
.found
	LDA $21 : STA $1B : CLC : ADC $17 : STA $1D
	; Evict only disposable entries overlapping the chosen extent.
	LDX.w #$0000
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
	INX : INX : BRA .disposable
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
.again
	STZ $23
	LDX.w #$0000
.pair
	LDA $2A,X : BEQ .next
	LDA $28,X : BEQ .swap
	LDA $48,X : CMP $4A,X : BCC .next : BEQ .next
.swap
	LDY $28,X : LDA $2A,X : STA $28,X : TYA : STA $2A,X
	LDY $48,X : LDA $4A,X : STA $48,X : TYA : STA $4A,X
	LDY $6A,X : LDA $6C,X : STA $6A,X : TYA : STA $6C,X
	LDY $8A,X : LDA $8C,X : STA $8A,X : TYA : STA $8C,X
	INC $23
.next
	INX : INX : CPX.w #$001E : BNE .pair
	LDA $23 : BNE .again
	RTS

audio_cache_compact:
	; Pack only until the requested hole exists ($17=0 rescues the whole set
	; below a newly enlarged echo buffer). Unuploaded allocations move for
	; free. Every physical move is downward: native forward-copy semantics.
	LDX.w #$0000
.clear
	LDA $8A,X : BNE .next
	STZ $28,X : STZ $8A,X
.next
	INX : INX : CPX.w #$0020 : BNE .clear
	LDA $F8 : STA $1B
.select
	LDA.w #$FFFF : STA $1D
	LDY.w #$FFFF
	LDX.w #$0000
.scan
	LDA $8A,X : BEQ .scan_next
	CMP.w #$0003 : BCS .scan_next
	LDA $48,X : CMP $1D : BCS .scan_next
	STA $1D : TXY
.scan_next
	INX : INX : CPX.w #$0020 : BNE .scan
	CPY.w #$FFFF : BEQ .done
	TYX
	LDA $17 : BEQ .move
	CLC : ADC $1B : CMP $1D : BCC .done : BEQ .done
.move
	LDA $48,X : CMP $1B : BEQ .same
	LDA $8A,X : CMP.w #$0002 : BEQ .planned
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
	INC $8A,X : INC $8A,X
	BRA .select
.done
	LDX.w #$0000
.reset
	LDA $8A,X : BEQ .reset_next
	CMP.w #$0003 : BCC .reset_next
	DEC $8A,X : DEC $8A,X
.reset_next
	INX : INX : CPX.w #$0020 : BNE .reset
	RTS

audio_cache_uploads:
	LDX.w #$0000
.slot
	LDA $8A,X : CMP.w #$0002 : BNE .next
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
