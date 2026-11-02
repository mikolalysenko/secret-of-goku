; Resumable native loader for Vegeta's $3E/$3F cues. The accepted command
; keeps $1E00 nonzero until the same FE release as C3:0596, so core_sound_pump
; and every direct native client retain their FIFO. All continuation state is
; owned audio WRAM (au_sl_*); native DP is scratch only inside atomic helpers.
;
; A packet is kicked once, then polled without a busy wait. Source/destination
; cursors advance only after its complete acknowledgement. Data transfers admit
; at most twelve packets per frame and stop at the ordinary audio line limit.
; Cache planners return NEED_COMPACT instead of leaving an allocator/recursion
; suspended. Physical moves are forward, in extent order, in <=256-byte pieces.

!SL_FADE_PROBE   = 1
!SL_FADE_ARM     = 2
!SL_FADE_ECHO    = 3
!SL_KOFF_WRITE   = 4
!SL_KOFF_PORTS   = 5
!SL_KOFF_TOKEN   = 6
!SL_KOFF_ACK     = 7
!SL_ECHO0        = 8
!SL_ECHO0_WAIT   = 9
!SL_ECHO1        = 10
!SL_ECHO1_WAIT   = 11
!SL_LONG_CHECK   = 12
!SL_INSTALL      = 13
!SL_VECTORS      = 14
!SL_SEQ_HEADER   = 15
!SL_SEQ_PREP     = 16
!SL_CACHE_PLAN   = 17
!SL_COMPACT_INIT = 18
!SL_COMPACT_SCAN = 19
!SL_MOVE_DEST    = 20
!SL_MOVE_LEN     = 21
!SL_REPLAN       = 22
!SL_UPLOAD_NEXT  = 23
!SL_META_PREP    = 24
!SL_META_BLOCK   = 25
!SL_META_DONE    = 26
!SL_EXT_PREP     = 27
!SL_EXT_BLOCK    = 28
!SL_EXT_DATA     = 29
!SL_EXT_DONE     = 30
!SL_EXT_COMMIT   = 31
!SL_RESTORE      = 32
!SL_FINAL        = 33
!SL_DATA3        = 34
!SL_DATA2        = 35
!SL_HEADER       = 36
!SL_MUTE         = 37
!SL_UNMUTE       = 38
!SL_MUTE_VECTOR  = 39
!SL_MUTE_INVOKE  = 40
!SL_UNMUTE_VECTOR = 41
!SL_UNMUTE_INVOKE = 42
!SL_COPY_FINISH  = 43
!SL_DATA3_FINISH = 44
!au_sl_after = !au_sl_msrc

; C3:0198, after the native dispatcher consumed byte zero. Restore it for an
; accepted asynchronous command. Unextended drivers and all other songs take
; the existing synchronous path byte for byte.
audio_songload_begin:
	SEP #$20 : CMP.b #1 : BEQ + : JMP audio_songload_begin_other : +
	LDA.l $7E0000+!au_flags : BIT.b #$40 : BEQ + : JMP audio_songload_begin_native : +
	LDA $01
	CMP.b #$3E : BEQ +
	CMP.b #$3F : BEQ + : JMP audio_songload_begin_native : +
+	CMP $05 : BNE + : JMP audio_songload_begin_native : +
audio_songload_accept:
	PHB
	LDA.b #$7E : PHA : PLB
	REP #$20
	LDX.w #$0000
-	LDA.w #$0000 : STA.w !au_sl_state,X
	INX : INX : CPX.w #$0020 : BNE -
	SEP #$20
	LDA $01 : STA.w !au_sl_extmask
	LDA $02 : STA.w !au_sl_aux : STA.w !au_sl_extmask+1
	LDA $03 : STA.w !au_sl_mode
	LDA.b #2 : STA.l !au_load_fast
	LDA.b #1 : STA.w $1E00 : STA.w !au_sl_state
	PLB
audio_songload_accepted:
	JML $C3018D
; A later direct native command arrives while the accepted song is active.
; Append it to the same core FIFO (with the queue's ordinary full behavior),
; restore the held command, and return without touching the SPC or loader DP.
audio_songload_requeue:
	REP #$20
	LDA.l !core_snd_tail : INC : AND.w #$0007 : CMP.l !core_snd_head
	BEQ audio_songload_requeue_restore
	PHA
	LDA.l !core_snd_tail : ASL : ASL : TAX
	LDA $00 : STA.l !core_snd_queue,X
	LDA $02 : STA.l !core_snd_queue+2,X
	PLA : STA.l !core_snd_tail
audio_songload_requeue_restore:
	SEP #$20
	LDA.b #1 : STA $00
	LDA.w !au_sl_state : CMP.b #!SL_KOFF_PORTS : BCC .early
	LDA $05 : STA $01 : LDA $06 : STA $02 : LDA $07 : STA $03
	JML $C3018D
.early
	LDA.w !au_sl_extmask : STA $01
	LDA.w !au_sl_extmask+1 : STA $02
	LDA.w !au_sl_mode : STA $03
	JML $C3018D

audio_songload_begin_native:
	LDA.b #1
	JML $C30198
audio_songload_begin_other:
	JML $C30183

; M16/X16, DB=$7E, D=0. Return C set while the song still owns the mailbox.
; Vblank admits the fixed packet budget; visible frames use the ordinary line
; limit. A late frame that already wrapped does no visible-side catch-up work.
audio_sl_lines:
	JSR au_lines_left : BNE .some
	LDA.l $00213F : LDA.l $002137 : LDA.l $00213D
	XBA : LDA.l $00213D : AND.b #$01 : BEQ .none
	LDA.b #40
.some
	RTS
.none
	LDA.b #0 : RTS
audio_songload_frame:
	SEP #$20 : REP #$10
	LDA.w !au_sl_state : BEQ .inactive
	LDA.b #12 : STA.w !au_sl_budget
	JMP audio_sl_dispatch
.inactive
	CLC : RTS
.active
audio_sl_done:
	SEC : RTS
audio_sl_dispatch:
	LDA.w !au_sl_state : XBA : LDA.b #0 : XBA : ASL : TAX
	JMP (audio_sl_states,X)
audio_sl_states:
	dw audio_sl_done
	dw audio_sl_fade_probe,audio_sl_fade_arm,audio_sl_fade_echo
	dw audio_sl_koff_write,audio_sl_koff_ports,audio_sl_koff_token,audio_sl_koff_ack
	dw audio_sl_echo0,audio_sl_echo0_wait,audio_sl_echo1,audio_sl_echo1_wait
	dw audio_sl_long_check,audio_sl_install,audio_sl_vectors
	dw audio_sl_seq_header,audio_sl_seq_prep,audio_sl_cache_plan
	dw audio_sl_compact_init,audio_sl_compact_scan,audio_sl_move_dest,audio_sl_move_len
	dw audio_sl_replan,audio_sl_upload_next,audio_sl_meta_prep
	dw audio_sl_meta_block,audio_sl_meta_done,audio_sl_ext_prep
	dw audio_sl_ext_block,audio_sl_ext_data,audio_sl_ext_done,audio_sl_ext_commit
	dw audio_sl_restore,audio_sl_final,audio_sl_data3,audio_sl_data2,audio_sl_header
	dw audio_sl_mute,audio_sl_unmute,audio_sl_mute_vector,audio_sl_mute_invoke
	dw audio_sl_unmute_vector,audio_sl_unmute_invoke,audio_sl_copy_finish,audio_sl_payload_settle

; Native command 01's optional previous-song cut, then KOFF/echo setup.
audio_sl_fade_probe:
	LDA.l $002142 : BEQ .ready
	LDA.w !au_sl_aux : AND.b #$F0 : BEQ .ready
	STA.l $002141
	LDA.b #!SL_FADE_ARM : STA.w !au_sl_state : JMP audio_sl_done
.ready
	LDA.b #!SL_KOFF_WRITE : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_fade_arm:
	LDA.l $002140 : CMP.b #$83 : BNE + : JMP audio_sl_done : +
	LDA.b #$83 : STA.l $002140
	LDA.b #!SL_FADE_ECHO : STA.w !au_sl_state : JMP audio_sl_done
audio_sl_fade_echo:
	LDA.l $002140 : CMP.b #$83 : BEQ + : JMP audio_sl_done : +
	LDA.b #$00 : STA.l $002140
	LDA.b #!SL_KOFF_WRITE : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_koff_write:
	LDA.w $1E05 : BMI +
	STA.w $1E09 : LDX.w $1E06 : STX.w $1E0A
+	LDA.w $1E01 : STA.l $002141 : STA.w $1E05
	LDA.w $1E02 : STA.l $002142 : AND.b #$0F : STA.w $1E06
	LDA.w $1E03 : STA.l $002143 : STA.w $1E07
	LDA.b #1 : STA.w !au_sl_token
	LDA.b #!SL_KOFF_PORTS : STA.w !au_sl_state : JMP audio_sl_done
audio_sl_koff_ports:
	LDA.l $002141 : BEQ + : JMP audio_sl_done : +
	LDA.b #!SL_KOFF_TOKEN : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_koff_token:
	LDA.l $002140 : CMP.b #1 : BNE + : JMP audio_sl_done : +
	LDA.b #1 : STA.l $002140
	LDA.b #!SL_KOFF_ACK : STA.w !au_sl_state : JMP audio_sl_done
audio_sl_koff_ack:
	LDA.l $002140 : CMP.b #1 : BEQ + : JMP audio_sl_done : +
	LDA.b #2 : STA.w !au_sl_token
	LDA.b #!SL_ECHO0 : STA.w !au_sl_state : JMP audio_sl_dispatch

; Custom echo table and cap, in the native EDL/EVOL then EFB/FIR order.
audio_sl_echo0:
	LDA.w $1E05 : SEC : SBC.b #$3B : XBA : LDA.b #0 : XBA : ASL : ASL : TAX
	LDA.l audio_echo_table,X
	PHX : LDX.w $1E05 : CMP.l audio_custom_edl_caps,X : BCC +
	LDA.l audio_custom_edl_caps,X
+	PLX
	STA.l $002142 : CMP.w $1EF0 : BEQ +
	STA.w $1EF0
	ASL : ASL : ASL : EOR.b #$FF : INC : CLC : ADC.b #$FA : STA.w $1EF2
+	LDA.l audio_echo_table+1,X : STA.l $002143
	LDA.w !au_sl_token : STA.l $002140
	LDA.b #!SL_ECHO0_WAIT : STA.w !au_sl_state : JMP audio_sl_done
audio_sl_echo0_wait:
	LDA.l $002140 : CMP.w !au_sl_token : BEQ + : JMP audio_sl_done : +
	INC.w !au_sl_token
	LDA.b #!SL_ECHO1 : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_echo1:
	LDA.w $1E05 : SEC : SBC.b #$3B : XBA : LDA.b #0 : XBA : ASL : ASL : TAX
	LDA.l audio_echo_table+2,X : STA.l $002142
	LDA.l audio_echo_table+3,X : STA.l $002143
	LDA.w !au_sl_token : STA.l $002140
	LDA.b #!SL_ECHO1_WAIT : STA.w !au_sl_state : JMP audio_sl_done
audio_sl_echo1_wait:
	LDA.l $002140 : CMP.w !au_sl_token : BEQ + : JMP audio_sl_done : +
	INC.w !au_sl_token
	LDA.b #!SL_LONG_CHECK : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_long_check:
	LDA.w $1EF3 : BNE + : JMP audio_sl_install : +
	REP #$20
	LDA.l $C32137 : STA.w !au_sl_left
	LDA.w #$2139 : STA.w !au_sl_src
	LDA.w #$2C00 : STA.w !au_sl_dst
	SEP #$20
	LDA.b #$C3 : STA.w !au_sl_src+2
	LDA.b #2 : STA.w !au_sl_mode
	LDA.b #!SL_DATA2 : STA.w !au_sl_next
	LDA.b #!SL_INSTALL : STA.w !au_sl_after
	LDA.b #!SL_HEADER : STA.w !au_sl_state : JMP audio_sl_dispatch

; Native-mode stubs in the sequence buffer suspend the echo ring with EDL=0.
; The acknowledgement follows each stub. The enable stub is built in owned WRAM
; with the configured EDL immediate and runs after the last temporary transfer.
audio_sl_mute:
	REP #$20
	LDA.w #audio_sl_disable_stub&$FFFF : STA.w !au_sl_src
	LDA.w #12 : STA.w !au_sl_left
	LDA.w #$1A00 : STA.w !au_sl_dst
	SEP #$20 : LDA.b #bank(audio_sl_disable_stub) : STA.w !au_sl_src+2
	LDA.b #2 : STA.w !au_sl_mode : STZ.w !au_sl_token
	LDA.b #!SL_DATA2 : STA.w !au_sl_next
	LDA.b #!SL_MUTE_VECTOR : STA.w !au_sl_after
	LDA.b #!SL_HEADER : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_unmute:
	REP #$20 : LDX.w #$0000
-	LDA.l audio_sl_enable_stub,X : STA.w !au_sl_aux,X
	INX : INX : CPX.w #12 : BNE -
	SEP #$20
	LDA.w $1E05 : SEC : SBC.b #$3B : XBA : LDA.b #0 : XBA : ASL : ASL : TAX
	LDA.l audio_echo_table,X
	PHX : LDX.w $1E05 : CMP.l audio_custom_edl_caps,X : BCC +
	LDA.l audio_custom_edl_caps,X
+	PLX : STA.w !au_sl_aux+4
	REP #$20
	LDA.w #!au_sl_aux : STA.w !au_sl_src
	LDA.w #12 : STA.w !au_sl_left
	LDA.w #$1A00 : STA.w !au_sl_dst
	SEP #$20 : LDA.b #$7E : STA.w !au_sl_src+2
	LDA.b #2 : STA.w !au_sl_mode : STZ.w !au_sl_token
	LDA.b #!SL_DATA2 : STA.w !au_sl_next
	LDA.b #!SL_UNMUTE_VECTOR : STA.w !au_sl_after
	LDA.b #!SL_HEADER : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_mute_vector:
	LDA.b #!SL_MUTE_INVOKE : STA.w !au_sl_after : BRA audio_sl_stub_vector
audio_sl_unmute_vector:
	LDA.b #!SL_UNMUTE_INVOKE : STA.w !au_sl_after
audio_sl_stub_vector:
	REP #$20
	LDA.w #audio_sl_stub_address&$FFFF : STA.w !au_sl_src
	LDA.w #2 : STA.w !au_sl_left
	LDA.w #$1420 : STA.w !au_sl_dst
	SEP #$20 : LDA.b #bank(audio_sl_stub_address) : STA.w !au_sl_src+2
	LDA.b #2 : STA.w !au_sl_mode : STZ.w !au_sl_token
	LDA.b #!SL_DATA2 : STA.w !au_sl_next
	LDA.b #!SL_HEADER : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_mute_invoke:
	LDA.b #!SL_INSTALL : STA.w !au_sl_next : BRA audio_sl_stub_invoke
audio_sl_unmute_invoke:
	LDA.b #!SL_RESTORE : STA.w !au_sl_next
audio_sl_stub_invoke:
	REP #$20 : LDA.w #$1A00 : STA.w !au_sl_dst : SEP #$20
	LDA.b #3 : STA.w !au_sl_mode : STZ.w !au_sl_token
	LDA.b #!SL_HEADER : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_disable_stub:
	db $8F,$7D,$F2,$8F,$00,$F3,$D8,$F4,$5F,$EA,$11,$00
audio_sl_enable_stub:
	db $8F,$7D,$F2,$E8,$00,$C4,$F3,$D8,$F4,$5F,$EA,$11
audio_sl_stub_address:
	dw $1A00

; The same temporary receiver/vector installation as the synchronous fast path.
audio_sl_install:
	PHD : REP #$20 : LDA.w #$1E00 : TCD : SEP #$20
	JSR audio_extended_prepare
	REP #$20 : PLD : SEP #$20
	LDA.b #!SL_SEQ_HEADER : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_vectors:
	REP #$20
	LDA.w #audio_songload_vectors_data&$FFFF : STA.w !au_sl_src
	LDA.w #$0008 : STA.w !au_sl_left
	LDA.w #$1420 : STA.w !au_sl_dst
	SEP #$20
	LDA.b #bank(audio_songload_vectors_data) : STA.w !au_sl_src+2
	LDA.b #2 : STA.w !au_sl_mode : STZ.w !au_sl_token
	LDA.b #!SL_DATA2 : STA.w !au_sl_next
	LDA.b #!SL_SEQ_HEADER : STA.w !au_sl_after
	LDA.b #!SL_HEADER : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_seq_header:
	REP #$20 : LDA.w #$1A00 : STA.w !au_sl_dst : SEP #$20
	LDA.b #3 : STA.w !au_sl_mode : STZ.w !au_sl_token
	LDA.b #!SL_SEQ_PREP : STA.w !au_sl_next
	LDA.b #!SL_HEADER : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_seq_prep:
	REP #$20
	LDA.w $1E05 : AND.w #$00FF
	ASL : STA $14
	LDA.w $1E05 : AND.w #$00FF : CLC : ADC $14 : TAX
	SEP #$20
	LDA.l $C33D3B,X : STA.w !au_sl_src+2
	REP #$20
	LDA.l $C33D39,X : STA.w !au_sl_src : STA $14
	SEP #$20 : LDA.w !au_sl_src+2 : STA $16 : REP #$20
	LDA [$14] : STA.w !au_sl_left
	INC.w !au_sl_src : INC.w !au_sl_src
	LDA.w #$0000 : STA $14
	LDA.w !au_sl_left : CMP.w #$1200 : BCC +
	INC $14
+	LDA $14 : STA.w $1EF3
	SEP #$20
	LDA.b #!SL_CACHE_PLAN : STA.w !au_sl_after
	LDA.b #!SL_DATA3 : STA.w !au_sl_state : JMP audio_sl_dispatch

; Planning is atomic. A compaction request carries only the policy and hole
; size in owned WRAM; the allocator is re-entered after the moves finish.
audio_sl_cache_plan:
	JSR audio_sl_lines : CMP.b #24 : BCS + : JMP audio_sl_done : +
	PHD : REP #$20 : LDA.w #$1E00 : TCD
	JSR audio_cache_plan
	PHA : LDA.w #$0000 : TCD : PLA : PLD : SEP #$20
	CMP.b #1 : BEQ +
	LDA.b #!SL_UPLOAD_NEXT : STA.w !au_sl_state : STZ.w !au_sl_index : STZ.w !au_sl_index+1
	JMP audio_sl_dispatch
+	LDA.b #!SL_COMPACT_INIT : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_replan:
	JSR audio_sl_lines : CMP.b #24 : BCS + : JMP audio_sl_done : +
	PHD : REP #$20 : LDA.w #$1E00 : TCD
	LDA.w !au_sl_aux : BNE +
	JSR audio_cache_append : BRA ++
+	JSR audio_cache_allocate
++	PHA : LDA.w #$0000 : TCD : PLA : PLD : SEP #$20
	CMP.b #1 : BEQ +
	LDA.b #!SL_UPLOAD_NEXT : STA.w !au_sl_state : STZ.w !au_sl_index : STZ.w !au_sl_index+1
	JMP audio_sl_dispatch
+	LDA.b #!SL_COMPACT_INIT : STA.w !au_sl_state : JMP audio_sl_dispatch

audio_sl_compact_init:
	REP #$20 : LDX.w #$0000
-	LDA.w $1E8A,X : AND.w #$00FF : BNE +
	STZ.w $1E28,X : STZ.w $1E8A,X
+	INX : INX : CPX.w #$0020 : BNE -
	LDA.w $1EF8 : STA.w !au_sl_tail
	STZ.w !au_sl_index
	SEP #$20
	LDA.b #!SL_COMPACT_SCAN : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_compact_scan:
	REP #$20
audio_sl_compact_scan_loop:
	LDX.w !au_sl_index : CPX.w #$0020 : BCC +
audio_sl_compact_scan_done:
	PHD : REP #$20 : LDA.w #$1E00 : TCD : JSR audio_cache_sort
	LDA.w #$0000 : TCD : PLD : SEP #$20
	LDA.b #!SL_REPLAN : STA.w !au_sl_state : JMP audio_sl_dispatch
+	LDA.w $1E28,X : BEQ audio_sl_compact_scan_skip
	LDA.w !au_sl_need : BEQ audio_sl_compact_scan_move
	CLC : ADC.w !au_sl_tail : CMP.w $1E48,X : BCC audio_sl_compact_scan_done : BEQ audio_sl_compact_scan_done
audio_sl_compact_scan_move:
	LDA.w $1E48,X : CMP.w !au_sl_tail : BEQ audio_sl_compact_scan_same
	LDA.w $1E8A,X : AND.w #$00FF : CMP.w #$0002 : BEQ audio_sl_compact_scan_planned
	LDA.w $1E48,X : STA.w !au_sl_msrc
	LDA.w !au_sl_tail : STA.w !au_sl_mdst
	LDA.w $1E6A,X : STA.w !au_sl_mleft
	SEP #$20
; Profiler entry: one logical extent, before its <=256-byte pieces.
audio_sl_compact_move:
	REP #$20 : LDA.w !au_sl_msrc : STA.w !au_sl_dst : SEP #$20
	LDA.b #7 : STA.w !au_sl_mode : STZ.w !au_sl_token
	LDA.b #!SL_MOVE_DEST : STA.w !au_sl_next
	LDA.b #!SL_HEADER : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_compact_scan_planned:
	LDA.w !au_sl_tail : STA.w $1E48,X
audio_sl_compact_scan_same:
	LDA.w $1E6A,X : CLC : ADC.w !au_sl_tail : STA.w !au_sl_tail
audio_sl_compact_scan_skip:
	INC.w !au_sl_index : INC.w !au_sl_index : JMP audio_sl_compact_scan_loop
audio_sl_move_dest:
	LDA.w !au_sl_step : BNE .wait
	JSR audio_sl_lines : CMP.b #1 : BCS + : JMP audio_sl_done : +
	REP #$20 : LDA.w !au_sl_mdst : STA.l $002142 : SEP #$20
	LDA.w !au_sl_token : STA.l $002140
	LDA.b #1 : STA.w !au_sl_step : JMP audio_sl_done
.wait
	LDA.l $002140 : CMP.w !au_sl_token : BEQ + : JMP audio_sl_done : +
	INC.w !au_sl_token : STZ.w !au_sl_step
	LDA.b #!SL_MOVE_LEN : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_move_len:
	LDA.w !au_sl_step : BNE .wait
	JSR audio_sl_lines : CMP.b #1 : BCS + : JMP audio_sl_done : +
	REP #$20
	LDA.w !au_sl_mleft : CMP.w #$0800 : BCC +
	LDA.w #$0800
+	STA.w !au_sl_dst : STA.l $002142 : SEP #$20
	LDA.w !au_sl_token : STA.l $002140
	LDA.b #1 : STA.w !au_sl_step : JMP audio_sl_done
.wait
	LDA.l $002140 : CMP.w !au_sl_token : BEQ + : JMP audio_sl_done : +
	STZ.w !au_sl_step
	REP #$20
	LDA.w !au_sl_msrc : CLC : ADC.w !au_sl_dst : STA.w !au_sl_msrc
	LDA.w !au_sl_mdst : CLC : ADC.w !au_sl_dst : STA.w !au_sl_mdst
	LDA.w !au_sl_mleft : SEC : SBC.w !au_sl_dst : STA.w !au_sl_mleft : BEQ .extent
	SEP #$20 : INC.w !au_sl_token : BNE + : INC.w !au_sl_token
+	REP #$20 : LDA.w !au_sl_msrc : STA.w !au_sl_dst : SEP #$20
	LDA.b #8 : STA.w !au_sl_extmask
	LDA.b #!SL_HEADER : STA.w !au_sl_next
	LDA.b #!SL_COPY_FINISH : STA.w !au_sl_state : JMP audio_sl_dispatch
.extent
	LDX.w !au_sl_index
	LDA.w !au_sl_tail : STA.w $1E48,X
	LDA.w $1E6A,X : CLC : ADC.w !au_sl_tail : STA.w !au_sl_tail
	INC.w !au_sl_index : INC.w !au_sl_index
	SEP #$20 : LDA.b #8 : STA.w !au_sl_extmask
	LDA.b #!SL_COMPACT_SCAN : STA.w !au_sl_next
	SEP #$20 : LDA.b #!SL_COPY_FINISH : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_copy_finish:
	LDA.w !au_sl_extmask : BEQ +
	DEC.w !au_sl_extmask : JMP audio_sl_done
+	LDA.w !au_sl_next : STA.w !au_sl_state : JMP audio_sl_dispatch

; Upload only slots marked by the plan, retaining their address/list order.
audio_sl_upload_next:
	REP #$20
	LDX.w !au_sl_index : CPX.w #$0020 : BCC +
	SEP #$20 : LDA.b #!SL_META_PREP : STA.w !au_sl_state : JMP audio_sl_dispatch
+	LDA.w $1E8A,X : AND.w #$00FF : CMP.w #$0002 : BEQ .found
	INC.w !au_sl_index : INC.w !au_sl_index
	SEP #$20 : JMP audio_sl_upload_next
.found
; Profiler entry: X=cache slot, with the same id/address/length as the sync path.
audio_sl_upload:
	STX.w !au_sl_aux
	LDA.w $1E28,X : DEC : STA $14 : ASL : CLC : ADC $14 : TAX
	LDA.l $C33DF9,X : CLC : ADC.w #$0002 : STA.w !au_sl_src
	SEP #$20 : LDA.l $C33DFB,X : STA.w !au_sl_src+2
	REP #$20 : LDX.w !au_sl_aux
	LDA.w $1E6A,X : STA.w !au_sl_left
	LDA.w $1E48,X : STA.w !au_sl_dst
	INC.w !au_sl_index : INC.w !au_sl_index
	SEP #$20
	LDA.b #3 : STA.w !au_sl_mode : STZ.w !au_sl_token
	LDA.b #!SL_DATA3 : STA.w !au_sl_next
	LDA.b #!SL_UPLOAD_NEXT : STA.w !au_sl_after
	LDA.b #!SL_HEADER : STA.w !au_sl_state : JMP audio_sl_dispatch

; Native tuning/DIR/ADSR staging and its three mode-2 metadata blocks.
audio_sl_meta_prep:
	REP #$20 : STZ.w !au_sl_index : LDY.w #$0000
.next
	LDX.w !au_sl_index : LDA.w $1EAA,X : BEQ .ready
	LDX.w #$0000
.find
	CMP.w $1E28,X : BEQ +
	INX : INX : BRA .find
+	STX.w !au_sl_aux
	DEC : ASL : STA.w !au_sl_tail : TAX
	LDA.l $C33E9E,X : STA $10
	LDX.w !au_sl_tail : LDA.l $C33E5C,X : STA $14
	LDX.w !au_sl_aux : LDA.w $1E48,X : STA.w $1F40,Y
	CLC : ADC $14 : STA.w $1F42,Y
	LDX.w !au_sl_tail : LDA.l $C33EE0,X : STA $12
	LDX.w !au_sl_index
	LDA $10 : STA.w $1F00,X
	LDA $12 : STA.w $1FC0,X
	INC.w !au_sl_index : INC.w !au_sl_index
	INY : INY : INY : INY : JMP .next
.ready
	STZ.w !au_sl_index : SEP #$20
	LDA.b #!SL_META_BLOCK : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_meta_block:
	LDX.w !au_sl_index
	REP #$20
	LDA.l audio_sl_meta_dest,X : STA.w !au_sl_dst
	LDA.l audio_sl_meta_src,X : STA.w !au_sl_src
	LDA.l audio_sl_meta_size,X : STA.w !au_sl_left
	SEP #$20
	LDA.b #$7E : STA.w !au_sl_src+2
	LDA.b #2 : STA.w !au_sl_mode : STZ.w !au_sl_token
	LDA.b #!SL_DATA2 : STA.w !au_sl_next
	LDA.b #!SL_META_DONE : STA.w !au_sl_after
	LDA.b #!SL_HEADER : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_meta_dest: dw $1840,$1980,$18C0
audio_sl_meta_src: dw $1F00,$1F40,$1FC0
audio_sl_meta_size: dw 64,128,64
audio_sl_meta_done:
	INC.w !au_sl_index : INC.w !au_sl_index
	LDA.w !au_sl_index : CMP.b #6 : BCC +
	LDA.b #!SL_EXT_PREP : STA.w !au_sl_state : JMP audio_sl_dispatch
+	LDA.b #!SL_META_BLOCK : STA.w !au_sl_state : JMP audio_sl_dispatch

; Optional extended-table replacement, split at every native word packet.
audio_sl_ext_prep:
	LDA.l !au_ext_tables : BNE + : JMP audio_sl_ext_commit : +
	STZ.w !au_sl_index : STZ.w !au_sl_aux : STZ.w !au_sl_aux+1
	REP #$20 : LDA.w #$055F : STA.w !au_sl_extmask
	LDA.l $7E0000+!au_ext_state : AND.w #$00FF : CMP.w #$0003 : BEQ +
	STZ.w !au_sl_extmask : LDA.w #$0018 : STA.w !au_sl_aux
+	SEP #$20
audio_sl_ext_block:
	LDX.w !au_sl_index
	REP #$20 : LDA.l audio_extended_destinations,X : STA.w !au_sl_dst : SEP #$20
	LDA.b #2 : STA.w !au_sl_mode : STZ.w !au_sl_token
	LDA.b #8 : STA.w !au_sl_left : STZ.w !au_sl_left+1
	LDA.b #!SL_EXT_DATA : STA.w !au_sl_next
	LDA.b #!SL_EXT_DONE : STA.w !au_sl_after
	LDA.b #!SL_HEADER : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_ext_data:
	LDA.w !au_sl_step : BNE .wait
.kick
	JSR audio_sl_lines : CMP.b #1 : BCS + : JMP audio_sl_done : +
	LDX.w !au_sl_aux
	REP #$20 : LDA.l audio_extended_tables_data,X
	LSR.w !au_sl_extmask : BCC +
	CLC : ADC.l !au_ext_next
+	STA.l $002142 : SEP #$20
	LDA.w !au_sl_token : STA.l $002140
	LDA.b #1 : STA.w !au_sl_step : JMP audio_sl_done
.wait
	LDA.l $002140 : CMP.w !au_sl_token : BEQ + : JMP audio_sl_done : +
	STZ.w !au_sl_step
	INC.w !au_sl_token : BNE + : INC.w !au_sl_token
+	INC.w !au_sl_aux : INC.w !au_sl_aux
	DEC.w !au_sl_left : DEC.w !au_sl_left
	DEC.w !au_sl_budget : BNE + : JMP audio_sl_done : +
	LDA.w !au_sl_left : BNE .kick
	LDA.w !au_sl_after : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_ext_done:
	INC.w !au_sl_index : INC.w !au_sl_index
	LDA.w !au_sl_index : CMP.b #6 : BCS audio_sl_ext_commit
	LDA.w $1EF3 : BNE audio_sl_ext_commit
	JMP audio_sl_ext_block
audio_sl_ext_commit:
	PHD : REP #$20 : LDA.w #$1E00 : TCD : SEP #$20
	JSR audio_extended_finish_commit
	REP #$20 : PLD : SEP #$20
	LDA.b #!SL_FINAL : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_restore:
	REP #$20
	LDA.w #(audio_songload_vectors_data+8)&$FFFF : STA.w !au_sl_src
	LDA.w #$0008 : STA.w !au_sl_left
	LDA.w #$1420 : STA.w !au_sl_dst
	SEP #$20
	LDA.b #bank(audio_songload_vectors_data) : STA.w !au_sl_src+2
	LDA.b #2 : STA.w !au_sl_mode : STZ.w !au_sl_token
	LDA.b #!SL_DATA2 : STA.w !au_sl_next
	LDA.b #!SL_FINAL : STA.w !au_sl_after
	LDA.b #!SL_HEADER : STA.w !au_sl_state : JMP audio_sl_dispatch

; FE mode 2/3/4 header: mode, destination, token zero/current. The first data
; token follows only after the complete header echo.
audio_sl_header:
	LDA.w !au_sl_step : BNE .wait
	LDA.w !au_sl_mode : STA.l $002141
	REP #$20 : LDA.w !au_sl_dst : STA.l $002142 : SEP #$20
	LDA.w !au_sl_token : STA.l $002140
	LDA.b #1 : STA.w !au_sl_step : JMP audio_sl_done
.wait
	LDA.l $002140 : CMP.w !au_sl_token : BEQ + : JMP audio_sl_done : +
	STZ.w !au_sl_step
	INC.w !au_sl_token : BNE + : INC.w !au_sl_token
+	LDA.w !au_sl_next : STA.w !au_sl_state : JMP audio_sl_dispatch

; Three-byte FE payload packets, including retail padding in the last triple.
audio_sl_data3:
	LDA.w !au_sl_step : BNE .wait
.kick
	JSR audio_sl_lines : CMP.b #1 : BCS + : JMP audio_sl_done : +
	LDX.w !au_sl_src : PHB : LDA.w !au_sl_src+2 : PHA : PLB
	LDA.w $0000,X : STA.l $002141
	LDA.w $0001,X : STA.l $002142
	LDA.w $0002,X : STA.l $002143
	PLB
	LDA.w !au_sl_token : STA.l $002140
	LDA.b #1 : STA.w !au_sl_step
	LDA.w !au_sl_after : CMP.b #!SL_CACHE_PLAN : BEQ .no_poll
	LDY.w #32
-	DEY : BNE -
	LDY.w #16
-	LDA.l $002140 : CMP.w !au_sl_token : BEQ .wait
	DEY : BNE -
.no_poll
	JMP audio_sl_done
.wait
	LDA.l $002140 : CMP.w !au_sl_token : BEQ + : JMP audio_sl_done : +
	STZ.w !au_sl_step
	INC.w !au_sl_token : BNE + : INC.w !au_sl_token
+	DEC.w !au_sl_budget
	REP #$20 : LDA.w !au_sl_left : CMP.w #$0003 : BCC .finish : BEQ .finish
	LDA.w !au_sl_src : CLC : ADC.w #$0003 : STA.w !au_sl_src : BCC +
	SEP #$20 : INC.w !au_sl_src+2 : REP #$20
+	LDA.w !au_sl_left : SEC : SBC.w #$0003 : STA.w !au_sl_left : SEP #$20
	LDA.w !au_sl_budget : BNE + : JMP audio_sl_done : + : JMP .kick
.finish
	SEP #$20 : LDA.w !au_sl_after : STA.w !au_sl_next
	LDA.b #16 : STA.w !au_sl_extmask
	LDA.b #!SL_DATA3_FINISH : STA.w !au_sl_state : JMP audio_sl_dispatch
audio_sl_payload_settle:
	LDA.w !au_sl_extmask : BEQ +
	DEC.w !au_sl_extmask : JMP audio_sl_done
+	LDA.w !au_sl_next : STA.w !au_sl_state : JMP audio_sl_dispatch

; Two-byte native packets for receiver/vector/echo/metadata blocks.
audio_sl_data2:
	LDA.w !au_sl_step : BNE .wait
.kick
	JSR audio_sl_lines : CMP.b #1 : BCS + : JMP audio_sl_done : +
	LDX.w !au_sl_src : PHB : LDA.w !au_sl_src+2 : PHA : PLB
	REP #$20 : LDA.w $0000,X : STA.l $002142 : SEP #$20 : PLB
	LDA.w !au_sl_token : STA.l $002140
	LDA.b #1 : STA.w !au_sl_step : JMP audio_sl_done
.wait
	LDA.l $002140 : CMP.w !au_sl_token : BEQ + : JMP audio_sl_done : +
	STZ.w !au_sl_step
	INC.w !au_sl_token : BNE + : INC.w !au_sl_token
+	DEC.w !au_sl_budget
	REP #$20
	LDA.w !au_sl_src : CLC : ADC.w #$0002 : STA.w !au_sl_src : BCC +
	SEP #$20 : INC.w !au_sl_src+2 : REP #$20
+	LDA.w !au_sl_left : SEC : SBC.w #$0002 : STA.w !au_sl_left : SEP #$20 : BEQ .finish
	LDA.w !au_sl_budget : BNE + : JMP audio_sl_done : + : JMP .kick
.finish
	LDA.w !au_sl_after : STA.w !au_sl_state : JMP audio_sl_dispatch

; The asynchronous counterpart of C3:0596. No driver-start ($0DDD) wait.
audio_sl_final:
	LDA.b #0 : STA.l !au_load_fast
	LDA.b #$00 : STA.l $002141 : STA.l $002140 : STA.w $1E00 : STA.w !au_sl_state
audio_songload_release:
	CLC : RTS

%orig4($C3017F, $15F001C9)
%hijack($C3017F, audio_songload_begin, 4, audio)
