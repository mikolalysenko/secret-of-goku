; Telepathy policy (engine/native-radio.js, power-intro.js): message queue,
; the Super Saiyan charge remarks, barrier and ceiling reactions, first
; flight banter, and the public API. Included in the UI code bank.
;
; Queue entries (SRAM !ui_s_queue, 8 bytes): +0 id+1, +2 param, +4 map+1
; (barrier messages: the map they belong to; 0 any), +6 frames left.

; Enter a public routine from any caller state: saves P/DB/D, sets
; M16/X16, DB = $7E, D = 0, keeps A/X/Y.
macro ui_api_enter()
	PHP
	PHB
	PHD
	REP #$30
	PHA
	LDA.w #$0000
	TCD
	PLA
	PEA $7E7E
	PLB
	PLB
endmacro
; Leave with the carry from the body (PLD/PLB keep it; PLP is replaced).
macro ui_api_leave()
	PLD
	PLB
	BCS ?set
	PLP
	CLC
	RTL
?set:
	PLP
	SEC
	RTL
endmacro

; ===========================================================================
; Queue primitives (M16/X16, DB = $7E). The entry to add is in
; tmp0 (id+1), tmp1 (param), tmp2 (map+1), tmp3 (frames).

; Append. Carry set when full (the entry is dropped, as nothing in the
; browser expects more than a handful of queued lines).
ui_q_push:
	LDA.w !ui_qn&$FFFF
	CMP.w #!UI_QMAX
	BCS .full
	ASL : ASL : ASL
	TAX
	JSR ui_q_store
	INC.w !ui_qn&$FFFF
	CLC
	RTS
.full
	SEC
	RTS

; Insert at the front; when full the last entry falls off.
ui_q_unshift:
	LDA.w !ui_qn&$FFFF
	CMP.w #!UI_QMAX
	BCC +
	DEC.w !ui_qn&$FFFF                ; drop the last
+	LDA.w !ui_qn&$FFFF
	BEQ .store
	ASL : ASL : ASL
	TAX                               ; byte offset of the slot after the last
.shift
	LDA.l !ui_s_queue-8,X
	STA.l !ui_s_queue,X
	LDA.l !ui_s_queue-6,X
	STA.l !ui_s_queue+2,X
	LDA.l !ui_s_queue-4,X
	STA.l !ui_s_queue+4,X
	LDA.l !ui_s_queue-2,X
	STA.l !ui_s_queue+6,X
	TXA : SEC : SBC.w #$0008 : TAX
	BNE .shift
.store
	LDX.w #$0000
	JSR ui_q_store
	INC.w !ui_qn&$FFFF
	RTS

ui_q_store:
	LDA.w !ui_tmp0&$FFFF : STA.l !ui_s_queue+0,X
	LDA.w !ui_tmp1&$FFFF : STA.l !ui_s_queue+2,X
	LDA.w !ui_tmp2&$FFFF : STA.l !ui_s_queue+4,X
	LDA.w !ui_tmp3&$FFFF : STA.l !ui_s_queue+6,X
	RTS

; Remove entry X (byte offset), keeping the order. Preserves X and tmp0-5.
ui_q_remove:
	PHX
	LDA.w !ui_qn&$FFFF : ASL : ASL : ASL
	STA.w !ui_qend&$FFFF
.loop
	TXA : CLC : ADC.w #$0008 : TAY     ; next entry
	CPY.w !ui_qend&$FFFF
	BCS .done
	TYX
	LDA.l !ui_s_queue+0,X : STA.l !ui_s_queue-8,X
	LDA.l !ui_s_queue+2,X : STA.l !ui_s_queue-6,X
	LDA.l !ui_s_queue+4,X : STA.l !ui_s_queue-4,X
	LDA.l !ui_s_queue+6,X : STA.l !ui_s_queue-2,X
	BRA .loop
.done
	DEC.w !ui_qn&$FFFF
	PLX
	RTS

; Make queue entry X (byte offset) current and remove it.
ui_q_take:
	LDA.l !ui_s_queue+0,X : STA.w !ui_cur&$FFFF
	LDA.l !ui_s_queue+2,X : STA.w !ui_cur_par&$FFFF
	LDA.l !ui_s_queue+4,X : STA.w !ui_cur_map&$FFFF
	LDA.l !ui_s_queue+6,X : STA.w !ui_left&$FFFF
	JMP ui_q_remove

; Put the current message back at the front of the queue (keeps its time).
ui_cur_to_front:
	LDA.w !ui_cur&$FFFF
	BEQ .none
	STA.w !ui_tmp0&$FFFF
	LDA.w !ui_cur_par&$FFFF : STA.w !ui_tmp1&$FFFF
	LDA.w !ui_cur_map&$FFFF : STA.w !ui_tmp2&$FFFF
	LDA.w !ui_left&$FFFF : STA.w !ui_tmp3&$FFFF
	JSR ui_q_unshift
	STZ.w !ui_cur&$FFFF
.none
	RTS

; Kind of message id+1 in A16 -> A16 = kind; Y = id. Kind bits in tmp4.
ui_kind_of:
	DEC
	TAY
	TAX
	LDA.l ui_msg_kind,X
	AND.w #$00FF
	PHA
	TAX
	LDA.l ui_kind_bits,X
	AND.w #$00FF
	STA.w !ui_tmp4&$FFFF
	PLA
	RTS

; Push message A16 (id) with param X16 at the back: frames from the table.
ui_say_id:
	STX.w !ui_tmp1&$FFFF
	INC
	STA.w !ui_tmp0&$FFFF
	DEC
	ASL
	TAX
	LDA.l ui_msg_frames,X
	STA.w !ui_tmp3&$FFFF
	STZ.w !ui_tmp2&$FFFF
	JMP ui_q_push

; Drop everything (radio disabled / Goku absent).
ui_drop_all:
	STZ.w !ui_cur&$FFFF
	STZ.w !ui_qn&$FFFF
	STZ.w !ui_held&$FFFF
	STZ.w !ui_warned&$FFFF
	RTS

; Remove every message of kind A16 (current and queued).
ui_dismiss_kind:
	STA.w !ui_tmp5&$FFFF
	LDA.w !ui_cur&$FFFF
	BEQ .queue
	JSR ui_kind_of
	CMP.w !ui_tmp5&$FFFF
	BNE .queue
	STZ.w !ui_cur&$FFFF
.queue
	LDX.w #$0000
.loop
	LDA.w !ui_qn&$FFFF : ASL : ASL : ASL
	STA.w !ui_tmp3&$FFFF
	CPX.w !ui_tmp3&$FFFF
	BCS .done
	PHX
	LDA.l !ui_s_queue,X
	JSR ui_kind_of
	PLX
	CMP.w !ui_tmp5&$FFFF
	BNE .next
	JSR ui_q_remove                   ; X stays: the next entry moved here
	BRA .loop
.next
	TXA : CLC : ADC.w #$0008 : TAX
	BRA .loop
.done
	RTS

; Remove barrier messages that belong to another map (current and queued).
; A16 = map + 1.
ui_drop_foreign_barriers:
	STA.w !ui_tmp5&$FFFF
	LDA.w !ui_cur_map&$FFFF
	BEQ .queue
	CMP.w !ui_tmp5&$FFFF
	BEQ .queue
	STZ.w !ui_cur&$FFFF
.queue
	LDX.w #$0000
.loop
	LDA.w !ui_qn&$FFFF : ASL : ASL : ASL
	STA.w !ui_tmp3&$FFFF
	CPX.w !ui_tmp3&$FFFF
	BCS .done
	LDA.l !ui_s_queue+4,X
	BEQ .next
	CMP.w !ui_tmp5&$FFFF
	BEQ .next
	JSR ui_q_remove
	BRA .loop
.next
	TXA : CLC : ADC.w #$0008 : TAX
	BRA .loop
.done
	RTS

; ===========================================================================
; Per-frame policy: native-radio.js tick() in the same order. Runs in field
; and world frames. Sets !ui_vis.
ui_radio_tick:
	STZ.w !ui_vis&$FFFF
	; The charge input of this frame (absent = not charging).
	LDA.w !ui_charge_in&$FFFF
	STA.w !ui_charge_seen&$FFFF
	STZ.w !ui_charge_in&$FFFF
	; Idle fast path: nothing shown or queued, no charge, no cooldown and
	; no first-flight banter pending: the browser's tick() changes nothing.
	ORA.w !ui_cur&$FFFF
	ORA.w !ui_qn&$FFFF
	ORA.w !ui_cool&$FFFF
	ORA.w !ui_bcool&$FFFF
	ORA.w !ui_rcool&$FFFF
	ORA.w !ui_held&$FFFF
	ORA.w !ui_warned&$FFFF
	BNE .work
	LDA.l !core_mode
	CMP.w #!CORE_MODE_WORLD
	BNE .idle
	LDA.l !ui_p_flags
	AND.w #!UIF_FIRST_FLIGHT
	BEQ .work
.idle
	JSR ui_map_id                     ; keep the map history current
	STA.w !ui_lastmap&$FFFF
	RTS
.work
	JSR ui_goku_active
	BNE .active
	JMP ui_drop_all
.active
	LDA.w !ui_charge_seen&$FFFF
	AND.w #$8000|!UIC_SUPER
	CMP.w #$8000|!UIC_SUPER
	BEQ +
	STZ.w !ui_held&$FFFF
	STZ.w !ui_warned&$FFFF
+	; Destroying the Fortress makes the flight advice moot.
	LDA.w !ui_in&$FFFF
	AND.w #!UII_FORTRESS_GONE
	BEQ +
	LDA.w #!UI_KIND_FLIGHT
	JSR ui_dismiss_kind
	JSR ui_set_first_flight
+	; A warning does not follow Goku into the next map.
	JSR ui_map_id
	CMP.w !ui_lastmap&$FFFF
	BEQ .samemap
	LDX.w !ui_lastmap&$FFFF
	STA.w !ui_lastmap&$FFFF
	CPX.w #$0000
	BEQ .samemap
	LDA.w !ui_cur&$FFFF
	BEQ .samemap
	JSR ui_kind_of
	CMP.w #!UI_KIND_WARNING
	BNE .samemap
	STZ.w !ui_cur&$FFFF
.samemap
	; Deferred shortcut asides stay in the room where the skip happened.
	LDA.w !ui_lastmap&$FFFF
	JSR ui_drop_foreign_barriers
	; Visibility (paused while hidden).
	LDA.l !core_mode
	CMP.w #!CORE_MODE_WORLD
	BEQ .world
	JSR ui_field_can_show
	BRA .vis
.world
	JSR ui_world_can_show
.vis
	BCS .visible
	RTS
.visible
	LDA.w #$0001
	STA.w !ui_vis&$FFFF
	; First-use banter waits for the attack to finish: an aside that is up
	; goes back to the front of the queue while Goku charges or beams.
	JSR ui_paused
	BEQ .noPause
	LDA.w !ui_cur&$FFFF
	BEQ .noPause
	JSR ui_kind_of
	LDA.w !ui_tmp4&$FFFF              ; kind bits
	AND.w #!UI_KB_ASIDE
	BEQ .noPause
	JSR ui_cur_to_front
.noPause
	; First flight: Luka, Goku and King Kai about the Fortress.
	LDA.l !core_mode
	CMP.w #!CORE_MODE_WORLD
	BNE .noFlight
	LDA.l !ui_p_flags
	AND.w #!UIF_FIRST_FLIGHT
	BNE .noFlight
	JSR ui_set_first_flight
	LDA.w !ui_in&$FFFF
	AND.w #!UII_CRISIS
	BNE .noFlight
	LDA.w #!UI_GROUP_FIRST_FLIGHT
	LDX.w #$0000
	JSR ui_say_group_impl
.noFlight
	LDA.w !ui_cool&$FFFF : BEQ + : DEC.w !ui_cool&$FFFF
+	LDA.w !ui_bcool&$FFFF : BEQ + : DEC.w !ui_bcool&$FFFF
+	LDA.w !ui_rcool&$FFFF : BEQ + : DEC.w !ui_rcool&$FFFF
+	JSR ui_charge_policy
	; Count down, then take the next message (asides wait while paused).
	LDA.w !ui_cur&$FFFF
	BEQ .pick
	DEC.w !ui_left&$FFFF
	BEQ .expire
	BPL .done
.expire
	STZ.w !ui_cur&$FFFF
.pick
	LDA.w !ui_cur&$FFFF
	BNE .done
	JSR ui_paused
	STA.w !ui_tmp5&$FFFF
	LDX.w #$0000
.find
	LDA.w !ui_qn&$FFFF : ASL : ASL : ASL
	STA.w !ui_tmp3&$FFFF
	CPX.w !ui_tmp3&$FFFF
	BCS .done
	LDA.w !ui_tmp5&$FFFF
	BEQ .take
	PHX
	LDA.l !ui_s_queue,X
	JSR ui_kind_of
	PLX
	LDA.w !ui_tmp4&$FFFF
	AND.w #!UI_KB_ASIDE
	BEQ .take
	TXA : CLC : ADC.w #$0008 : TAX
	BRA .find
.take
	JSR ui_q_take
.done
	RTS

; A16 != 0 while asides must wait: any charge input this frame (charging in
; either form, or a beam reported through ui_charge_tick) or the beam input.
ui_paused:
	LDA.w !ui_in&$FFFF
	AND.w #!UII_ACTION_BEAM
	ORA.w !ui_charge_seen&$FFFF
	RTS

ui_set_first_flight:
	SEP #$20
	LDA.l !ui_p_flags
	ORA.b #!UIF_FIRST_FLIGHT
	STA.l !ui_p_flags
	REP #$20
	RTS

; ---------------------------------------------------------------------------
; Super Saiyan charge remarks: after 90 visible frames at full power, one
; decision per sustained charge (the latch includes silent outcomes); the
; first three charges always get a warning, later ones a 10% roll from the
; saved xorshift32 state. A global 300-frame cooldown and the current
; message's state can postpone the decision.
ui_charge_policy:
	LDA.w !ui_charge_seen&$FFFF
	AND.w #$8000|!UIC_SUPER|!UIC_FULL
	CMP.w #$8000|!UIC_SUPER|!UIC_FULL
	BEQ .full
	STZ.w !ui_held&$FFFF
	RTS
.full
	INC.w !ui_held&$FFFF
	LDA.w !ui_held&$FFFF
	CMP.w #90
	BCC .out
	LDA.w !ui_warned&$FFFF
	ORA.w !ui_cool&$FFFF
	BNE .out
	LDA.w !ui_cur&$FFFF
	BEQ ui_charge_decide
	JSR ui_kind_of
	CMP.w #!UI_KIND_WARNING
	BEQ .out
	LDA.w !ui_left&$FFFF
	CMP.w #60
	BCC ui_charge_decide
.out
	RTS
ui_charge_decide:
	LDA.w #$0001
	STA.w !ui_warned&$FFFF
	LDA.l !ui_p_attempts
	INC
	STA.l !ui_p_attempts
	JSR ui_roll                       ; advance the generator every decision
	LDA.l !ui_p_attempts
	CMP.w #$0004
	BCC .warn
	JSR ui_roll_mod10
	BEQ .warn
	RTS
.warn
	; message = kaiWarnings[warning++ % 6]
	LDA.l !ui_p_warning
	AND.w #$00FF
	STA.w !ui_tmp0&$FFFF
	INC
	SEP #$20
	STA.l !ui_p_warning
	REP #$20
	LDA.w !ui_tmp0&$FFFF
.mod6
	CMP.w #$0006
	BCC +
	SBC.w #$0006
	BRA .mod6
+	CLC : ADC.w #!UI_MSG_KAI_WARNING_0
	PHA
	JSR ui_cur_to_front
	PLA
	INC
	STA.w !ui_cur&$FFFF
	STZ.w !ui_cur_par&$FFFF
	STZ.w !ui_cur_map&$FFFF
	DEC
	ASL
	TAX
	LDA.l ui_msg_frames,X
	STA.w !ui_left&$FFFF
	LDA.w #300
	STA.w !ui_cool&$FFFF
.out
	RTS

; xorshift32 (x ^= x << 13; x ^= x >> 17; x ^= x << 5) on !ui_p_roll.
; An unset (zero) state starts from the browser's seed $6D2B79F5.
ui_roll:
	LDA.l !ui_p_roll
	ORA.l !ui_p_roll+2
	BNE +
	LDA.w #$79F5 : STA.l !ui_p_roll
	LDA.w #$6D2B : STA.l !ui_p_roll+2
+	LDA.l !ui_p_roll   : STA.w !ui_tmp0&$FFFF
	LDA.l !ui_p_roll+2 : STA.w !ui_tmp1&$FFFF
	LDY.w #13
	JSR ui_x_shl_xor
	; x ^= x >> 17: the high word shifted right by 1 into the low word
	LDA.w !ui_tmp1&$FFFF
	LSR
	EOR.w !ui_tmp0&$FFFF
	STA.w !ui_tmp0&$FFFF
	LDY.w #5
	JSR ui_x_shl_xor
	LDA.w !ui_tmp0&$FFFF : STA.l !ui_p_roll
	LDA.w !ui_tmp1&$FFFF : STA.l !ui_p_roll+2
	RTS
; x ^= x << Y (x in tmp0 lo / tmp1 hi).
ui_x_shl_xor:
	LDA.w !ui_tmp0&$FFFF : STA.w !ui_tmp2&$FFFF
	LDA.w !ui_tmp1&$FFFF : STA.w !ui_tmp3&$FFFF
.shift
	ASL.w !ui_tmp2&$FFFF
	ROL.w !ui_tmp3&$FFFF
	DEY
	BNE .shift
	LDA.w !ui_tmp0&$FFFF : EOR.w !ui_tmp2&$FFFF : STA.w !ui_tmp0&$FFFF
	LDA.w !ui_tmp1&$FFFF : EOR.w !ui_tmp3&$FFFF : STA.w !ui_tmp1&$FFFF
	RTS
; A16 = !ui_p_roll mod 10 (unsigned 32-bit), Z set when 0.
ui_roll_mod10:
	LDA.l !ui_p_roll   : STA.w !ui_tmp0&$FFFF
	LDA.l !ui_p_roll+2 : STA.w !ui_tmp1&$FFFF
	LDA.w #$0000
	LDY.w #32
.bit
	ASL.w !ui_tmp0&$FFFF
	ROL.w !ui_tmp1&$FFFF
	ROL
	CMP.w #10
	BCC +
	SBC.w #10
+	DEY
	BNE .bit
	CMP.w #$0000
	RTS

; ===========================================================================
; Group helpers. A16 = id | count << 12 (a !UI_GROUP_* value or a single id),
; X16 = param for every message.
ui_say_group_impl:
	STX.w !ui_tmp1&$FFFF
	PHA
	XBA : LSR : LSR : LSR : LSR
	AND.w #$000F
	BNE +
	INC                               ; a plain id: one message
+	STA.w !ui_tmp5&$FFFF
	PLA
	AND.w #$0FFF
.loop
	PHA
	LDX.w !ui_tmp1&$FFFF
	PHX
	JSR ui_say_id
	PLX
	STX.w !ui_tmp1&$FFFF
	PLA
	INC
	DEC.w !ui_tmp5&$FFFF
	BNE .loop
	RTS

; interrupt(): the new messages first, then the current one if it is kept,
; then the kept queue; flight/warning/aside/core-crisis kinds are dropped.
ui_interrupt_impl:
	STX.w !ui_tmp1&$FFFF
	PHA
	; drop non-kept queued entries
	LDX.w #$0000
.filter
	LDA.w !ui_qn&$FFFF : ASL : ASL : ASL
	STA.w !ui_tmp3&$FFFF
	CPX.w !ui_tmp3&$FFFF
	BCS .filtered
	PHX
	LDA.l !ui_s_queue,X
	JSR ui_kind_of
	PLX
	LDA.w !ui_tmp4&$FFFF
	AND.w #!UI_KB_DROP
	BEQ .keep
	JSR ui_q_remove
	BRA .filter
.keep
	TXA : CLC : ADC.w #$0008 : TAX
	BRA .filter
.filtered
	; the current one goes back to the front if kept
	LDA.w !ui_cur&$FFFF
	BEQ .noCur
	JSR ui_kind_of
	LDA.w !ui_tmp4&$FFFF
	AND.w #!UI_KB_DROP
	BNE .dropCur
	JSR ui_cur_to_front
	BRA .noCur
.dropCur
	STZ.w !ui_cur&$FFFF
.noCur
	; new messages in front, in order: unshift from the last one
	PLA
	PHA
	XBA : LSR : LSR : LSR : LSR
	AND.w #$000F
	BNE +
	INC
+	STA.w !ui_tmp5&$FFFF
	PLA
	AND.w #$0FFF
	CLC : ADC.w !ui_tmp5&$FFFF
	DEC                               ; last id
.ins
	PHA
	INC
	STA.w !ui_tmp0&$FFFF
	DEC
	ASL
	TAX
	LDA.l ui_msg_frames,X
	STA.w !ui_tmp3&$FFFF
	STZ.w !ui_tmp2&$FFFF
	LDX.w !ui_tmp1&$FFFF
	PHX
	JSR ui_q_unshift
	PLX
	STX.w !ui_tmp1&$FFFF
	PLA
	DEC
	DEC.w !ui_tmp5&$FFFF
	BNE .ins
	STZ.w !ui_cur&$FFFF
	JSR ui_set_first_flight
	RTS

; ===========================================================================
; Public API (JSL from any module; any M/X/DB; DB/D preserved).

; ui_say: A16 = message id or !UI_GROUP_* value, X16 = parameter (low byte
; number for "<f1>", high byte string index for "<f0>"). Carry set when the
; radio is off (Goku not active) or the queue was full.
ui_say:
	%ui_api_enter()
	PHA
	JSR ui_goku_active
	BEQ .off
	PLA
	JSR ui_say_group_impl
	%ui_api_leave()
.off
	PLA
	SEC
	%ui_api_leave()

; ui_interrupt: as ui_say, with the browser's interrupt() semantics (a
; catastrophe replaces stale flight/warning/aside lines; never opens a
; native dialogue).
ui_interrupt:
	%ui_api_enter()
	JSR ui_interrupt_impl
	CLC
	%ui_api_leave()

; ui_dismiss: A16 = kind (!UI_KIND_*): drop that kind, shown or queued.
ui_dismiss:
	%ui_api_enter()
	JSR ui_dismiss_kind
	CLC
	%ui_api_leave()

; ui_barrier: A16 = barrier index (!UI_BARRIER_*), X16 = map. Authored
; progression shortcuts only: one key per barrier (saved), an 8-second
; shared cooldown, and blasts that hit several barriers coalesce into one
; remark. Carry clear = a remark was queued.
ui_barrier:
	%ui_api_enter()
	JSR ui_barrier_impl
	%ui_api_leave()

ui_barrier_impl:
	CMP.w #!UI_BARRIER_COUNT
	BCS ui_no
	STA.w !ui_bidx&$FFFF
	INX
	STX.w !ui_tmp2&$FFFF              ; map + 1
	JSR ui_goku_active
	BEQ ui_no
	; key = barrier index (bit in !ui_p_barriers); remembered even when silent
	LDA.w !ui_bidx&$FFFF
	JSR ui_bitpos
	SEP #$20
	LDA.l !ui_p_barriers,X
	AND.w !ui_tmp3&$FFFF
	BNE ui_no8
	LDA.l !ui_p_barriers,X
	ORA.w !ui_tmp3&$FFFF
	STA.l !ui_p_barriers,X
	REP #$20
	; a barrier remark already up or queued, or the cooldown: stay silent
	LDA.w !ui_bcool&$FFFF
	BNE ui_no
	LDA.w !ui_cur&$FFFF
	BEQ +
	JSR ui_kind_of
	CMP.w #!UI_KIND_BARRIER
	BEQ ui_no
+	JSR ui_queue_has_barrier
	BCS ui_no
	BRA ui_barrier_say
ui_no8:
	REP #$20
ui_no:
	SEC
	RTS

; A16 = bit number -> X16 = byte offset, !ui_tmp3 = its mask.
ui_bitpos:
	PHA
	AND.w #$0007
	TAX
	LDA.l ui_bit,X
	AND.w #$00FF
	STA.w !ui_tmp3&$FFFF
	PLA
	LSR : LSR : LSR
	TAX
	RTS

; Carry set when a barrier remark is queued.
ui_queue_has_barrier:
	LDX.w #$0000
.scan
	LDA.w !ui_qn&$FFFF : ASL : ASL : ASL
	STA.w !ui_tmp3&$FFFF
	CPX.w !ui_tmp3&$FFFF
	BCS .none
	PHX
	LDA.l !ui_s_queue,X
	JSR ui_kind_of
	PLX
	CMP.w #!UI_KIND_BARRIER
	BEQ .yes
	TXA : CLC : ADC.w #$0008 : TAX
	BRA .scan
.none
	CLC
	RTS
.yes
	SEC
	RTS

ui_barrier_say:
	; choices[barrierCount++ % choices.length]
	LDX.w !ui_bidx&$FFFF
	LDA.l ui_barrier_count,X
	AND.w #$00FF
	STA.w !ui_tmp5&$FFFF
	LDA.l !ui_p_bcount
	AND.w #$00FF
	PHA
	INC
	SEP #$20
	STA.l !ui_p_bcount
	REP #$20
	PLA
.mod
	CMP.w !ui_tmp5&$FFFF
	BCC +
	SBC.w !ui_tmp5&$FFFF
	BRA .mod
+	STA.w !ui_tmp5&$FFFF
	LDA.w !ui_bidx&$FFFF
	ASL
	TAX
	LDA.l ui_barrier_first,X
	CLC : ADC.w !ui_tmp5&$FFFF        ; message id
	PHA
	INC
	STA.w !ui_tmp0&$FFFF
	PLA
	ASL
	TAX
	LDA.l ui_msg_frames,X
	STA.w !ui_tmp3&$FFFF
	STZ.w !ui_tmp1&$FFFF
	JSR ui_q_push                     ; tmp2 = map + 1
	LDA.w #480
	STA.w !ui_bcool&$FFFF
	CLC
	RTS

ui_bit:
	db $01,$02,$04,$08,$10,$20,$40,$80

; ui_destroy_reaction: A16 = destroy-module reaction id
; (dist/snes/gen/destroy/reactions.json), X16 = map. As ui_barrier.
ui_destroy_reaction:
	%ui_api_enter()
	CMP.w #!UI_DESTROY_REACTIONS
	BCS .no
	PHX
	TAX
	LDA.l ui_destroy_react,X
	PLX
	AND.w #$00FF
	CMP.w #$00FF
	BEQ .no
	JSR ui_barrier_impl
	%ui_api_leave()
.no
	SEC
	%ui_api_leave()

; ui_ceiling_escape: A16 = map Goku punched out of. A passing aside, never
; part of the takeoff: the first exit from each room counts; three silent
; exits and two minutes between remarks; never queued behind other lines;
; the finite pool is not repeated. Carry clear = a remark was queued.
ui_ceiling_escape:
	%ui_api_enter()
	JSR ui_ceiling_impl
	%ui_api_leave()

ui_ceiling_impl:
	AND.w #$01FF
	STA.w !ui_tmp4&$FFFF
	LDA.l !ui_p_rexits
	INC
	STA.l !ui_p_rexits
	; roofs.has(map)?
	LDA.w !ui_tmp4&$FFFF
	JSR ui_bitpos
	SEP #$20
	LDA.l !ui_p_roofs,X
	AND.w !ui_tmp3&$FFFF
	BNE .no8
	LDA.l !ui_p_roofs,X
	ORA.w !ui_tmp3&$FFFF
	STA.l !ui_p_roofs,X
	REP #$20
	JSR ui_goku_active
	BEQ .no
	LDA.w !ui_cur&$FFFF
	ORA.w !ui_qn&$FFFF
	ORA.w !ui_rcool&$FFFF
	BNE .no
	LDA.l !ui_p_rremarks
	AND.w #$00FF
	BEQ .first
	CMP.w #((!UI_GROUP_CEILING>>12)&15)
	BCS .no
	LDA.l !ui_p_rexits
	SEC : SBC.l !ui_p_rlast
	CMP.w #$0004
	BCC .no
.first
	LDA.l !ui_p_rremarks
	AND.w #$00FF
	PHA
	INC
	SEP #$20
	STA.l !ui_p_rremarks
	REP #$20
	PLA
	CLC : ADC.w #!UI_MSG_CEILING_0
	LDX.w #$0000
	JSR ui_say_id
	LDA.l !ui_p_rexits
	STA.l !ui_p_rlast
	LDA.w #7200
	STA.w !ui_rcool&$FFFF
	CLC
	RTS
.no8
	REP #$20
.no
	SEC
	RTS

; ui_charge_tick: call every frame while Goku charges. A16 = !UIC_* flags
; (SUPER: Super Saiyan form, FULL: full power, BEAM: a beam action runs).
; A frame without a call counts as released.
ui_charge_tick:
	PHP
	REP #$20
	ORA.w #$8000
	STA.l !ui_charge_in
	PLP
	RTL

; ui_charge_release: the charge ended (release, cancel, menu).
ui_charge_release:
	PHP
	REP #$20
	LDA.w #$0000
	STA.l !ui_charge_in
	PLP
	RTL

; ui_power_intro_super: the first Super Saiyan transformation (power-intro.js
; transform()). Carry clear the first time: queue the three reveal lines;
; the caller lingers in the gold pose (72 frames in the browser).
ui_power_intro_super:
	%ui_api_enter()
	SEP #$20
	LDA.l !ui_p_flags
	BIT.b #!UIF_INTRO_SUPER
	BNE .seen
	ORA.b #!UIF_INTRO_SUPER
	STA.l !ui_p_flags
	REP #$20
	LDA.w #!UI_GROUP_POWER_SUPER
	LDX.w #$0000
	JSR ui_say_group_impl
	CLC
	%ui_api_leave()
.seen
	REP #$20
	SEC
	%ui_api_leave()

; ui_power_intro_flight: Goku hovers in local flight (call while hovering).
; The first time Goku can act while hovering, queue the two banter lines.
; Carry clear when they were queued.
ui_power_intro_flight:
	%ui_api_enter()
	SEP #$20
	LDA.l !ui_p_flags
	BIT.b #!UIF_INTRO_FLIGHT
	REP #$20
	BNE .no
	JSR ui_field_can_show
	BCC .no
	SEP #$20
	LDA.l !ui_p_flags
	ORA.b #!UIF_INTRO_FLIGHT
	STA.l !ui_p_flags
	REP #$20
	LDA.w #!UI_GROUP_POWER_FLIGHT
	LDX.w #$0000
	JSR ui_say_group_impl
	CLC
	%ui_api_leave()
.no
	SEC
	%ui_api_leave()

; ui_restore_first_flight: the browser's radio.restore({firstFlight:true})
; (Frieza's full-power phase): every message and counter back to its
; default, first-flight banter marked as given.
ui_restore_first_flight:
	%ui_api_enter()
	JSR ui_drop_all
	STZ.w !ui_cool&$FFFF
	STZ.w !ui_bcool&$FFFF
	STZ.w !ui_rcool&$FFFF
	STZ.w !ui_lastmap&$FFFF
	LDA.w #$0000
	LDX.w #$001E
.clr
	STA.l !PERSIST_UI+$02,X           ; attempts .. barriers (keeps flags/warning byte at +0/+1)
	DEX : DEX
	BPL .clr
	LDX.w #$003E
.clrRoofs
	STA.l !ui_p_roofs,X
	DEX : DEX
	BPL .clrRoofs
	SEP #$20
	LDA.b #$00
	STA.l !ui_p_warning
	LDA.l !ui_p_flags
	ORA.b #!UIF_FIRST_FLIGHT
	STA.l !ui_p_flags
	REP #$20
	CLC
	%ui_api_leave()

; ui_status: A16 = current message id + 1 (0 none), X16 = queued count,
; Y16 = 1 when the window is visible this frame. Exit M16/X16.
ui_status:
	PHB
	PHD
	REP #$30
	PEA $7E7E : PLB : PLB
	PEA $0000 : PLD
	LDX.w !ui_qn&$FFFF
	LDY.w !ui_vis&$FFFF
	LDA.w !ui_cur&$FFFF
	PLD
	PLB
	RTL

; ui_hide / ui_unhide: A16 = owner bit; while any bit is set the radio and
; radar stay hidden and paused (cinematics, ceiling escapes, endings).
ui_hide:
	PHP
	REP #$20
	ORA.l !ui_block
	STA.l !ui_block
	PLP
	RTL
ui_unhide:
	PHP
	REP #$20
	EOR.w #$FFFF
	AND.l !ui_block
	STA.l !ui_block
	PLP
	RTL

; ui_set_inputs: A16 = !UII_* bits to set, X16 = bits to clear.
ui_set_inputs:
	PHP
	REP #$30
	PHA
	TXA
	EOR.w #$FFFF
	AND.l !ui_in
	ORA $01,S
	STA.l !ui_in
	PLA
	PLP
	RTL

; Story hook QUEST_COLLECTED (A = palace 0-6): "DRAGON BALLS: n / 7".
ui_hook_quest_collected:
	%ui_api_enter()
	AND.w #$0007
	STA.w !ui_tmp4&$FFFF
	JSL !UI_QUEST_STATUS_FN
	REP #$30
	AND.w #$007F                      ; held mask
	LDY.w #$0000
.pop
	LSR
	BCC +
	INY
+	CMP.w #$0000
	BNE .pop
	TYA
	STA.w !ui_tmp5&$FFFF              ; count
	LDA.w !ui_tmp4&$FFFF
	XBA
	ORA.w !ui_tmp5&$FFFF
	TAX                               ; param: count | palace << 8
	LDA.w #!UI_MSG_DRAGON_QUEST
	JSR ui_say_group_impl
	CLC
	%ui_api_leave()

; Without the story module: held | collected << 8 from !ui_stub_q.
ui_stub_quest_status:
	LDA.l !ui_stub_q
	LDX.w #$0000
	RTL
