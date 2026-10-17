; Recipe interpreter (included by module.asm in the debug code bank).
; Recipes are generated from engine/quick-start.js by snes/gen/debug.mjs
; (see that file for how each browser step maps to an op). Ops run in field
; and world frames: each returns carry clear when done (after advancing
; !dbg_pc) or carry set to be called again next frame. A wait longer than
; !DBG_OP_TIMEOUT frames fails the preset (status FAILED, op in !dbg_error).

macro dbg_arg8(off)
	LDA.l !dbg_pc
	TAX
	LDA.l !DBG_BASE+<off>,X
	AND.w #$00FF
endmacro
macro dbg_arg16(off)
	LDA.l !dbg_pc
	TAX
	LDA.l !DBG_BASE+<off>,X
endmacro
macro dbg_next(len)
	LDA.l !dbg_pc
	CLC
	ADC.w #<len>
	STA.l !dbg_pc
	CLC
	RTS
endmacro

; Reset the per-op state for the op at !dbg_pc.
debug_op_reset:
	LDA.w #$0000
	STA.l !dbg_state
	STA.l !dbg_timer
	STA.l !dbg_stable
	STA.l !dbg_op_frames
	STA.l !dbg_hooks_done
	RTS

; Run ops until one waits or the recipe ends (at most 48 per frame).
debug_recipe_run:
	LDA.w #48
	PHA
.loop
	%dbg_arg8(0)
	CMP.w #(debug_op_table_end-debug_op_table)/2
	BCC +
	PLA
	LDA.w #$00EF                    ; bad opcode
	JMP debug_fail
+	ASL
	TAX
	JSR (debug_op_table,X)
	BCS .wait
	JSR debug_op_reset
	JSR debug_armed                 ; END disarms
	BCC .done
	LDA $01,S
	DEC
	STA $01,S
	BNE .loop
.done
	PLA
	RTS
.wait
	PLA
	LDA.l !dbg_op_frames
	INC
	STA.l !dbg_op_frames
	CMP.w #!DBG_OP_TIMEOUT
	BCC +
	%dbg_arg8(0)
	JMP debug_fail
+	RTS

debug_op_table:
	dw debug_op_end, debug_op_wait, debug_op_poke8, debug_op_poke16
	dw debug_op_poken, debug_op_fill, debug_op_flag, debug_op_raise
	dw debug_op_senzu, debug_op_ledger, debug_op_script, debug_op_travel
	dw debug_op_request, debug_op_until, debug_op_hook, debug_op_form
	dw debug_op_takeoff, debug_op_worldaim, debug_op_teleport, debug_op_press
	dw debug_op_sword, debug_op_opening, debug_op_refill, debug_op_cancel
	dw debug_op_mark
debug_op_table_end:
assert (debug_op_table_end-debug_op_table)/2 == !DEBUG_OP_MARK+1, "debug op table out of step with snes/gen/debug.mjs"

; END: the browser's final capture point. The game is the player's again.
debug_op_end:
	LDA.l !dbg_frames
	STA.l !dbg_done_frame
	LDA.w #!DBG_ST_DONE
	JSR debug_disarm
	CLC
	RTS

; WAIT n16: n frames (the browser's pump(n)).
debug_op_wait:
	LDA.l !dbg_state
	BNE .count
	%dbg_arg16(1)
	BEQ .done
	STA.l !dbg_timer
	LDA.w #$0001
	STA.l !dbg_state
	SEC
	RTS
.count
	LDA.l !dbg_timer
	DEC
	STA.l !dbg_timer
	BEQ .done
	SEC
	RTS
.done
	%dbg_next(3)

; POKE8 a16 v8 / POKE16 a16 v16: WRAM bank $7E.
debug_op_poke8:
	%dbg_arg8(3)
	PHA
	%dbg_arg16(1)
	TAX
	PLA
	SEP #$20
	STA.l $7E0000,X
	REP #$20
	%dbg_next(4)
debug_op_poke16:
	%dbg_arg16(3)
	PHA
	%dbg_arg16(1)
	TAX
	PLA
	STA.l $7E0000,X
	%dbg_next(5)

; POKEN a16 n8 bytes: copy n bytes from the recipe.
debug_op_poken:
	%dbg_arg8(3)
	STA.l !dbg_tmp1                 ; count
	PHA
	%dbg_arg16(1)
	TAY                             ; destination
	LDA.l !dbg_pc
	CLC
	ADC.w #$0004
	TAX                             ; source
-	SEP #$20
	LDA.l !DBG_BASE,X
	PHX
	TYX
	STA.l $7E0000,X
	PLX
	REP #$20
	INX
	INY
	LDA.l !dbg_tmp1
	DEC
	STA.l !dbg_tmp1
	BNE -
	PLA
	CLC
	ADC.w #$0004
	CLC
	ADC.l !dbg_pc
	STA.l !dbg_pc
	CLC
	RTS

; FILL a16 n16 v8.
debug_op_fill:
	%dbg_arg16(3)
	STA.l !dbg_tmp1
	%dbg_arg8(5)
	STA.l !dbg_tmp0
	%dbg_arg16(1)
	TAX
	LDA.l !dbg_tmp1
	BEQ .done
	TAY
	SEP #$20
	LDA.l !dbg_tmp0
-	STA.l $7E0000,X
	INX
	DEY
	BNE -
	REP #$20
.done
	%dbg_next(6)

; FLAG f v: $CF00+f = v. RAISE f v: never lowers (frieza-crisis.js
; activateTwilight).
debug_op_flag:
	%dbg_arg8(2)
	PHA
	%dbg_arg8(1)
	TAX
	PLA
	SEP #$20
	STA.l $7ECF00,X
	REP #$20
	%dbg_next(3)
debug_op_raise:
	%dbg_arg8(2)
	PHA
	%dbg_arg8(1)
	TAX
	PLA
	SEP #$20
	CMP.l $7ECF00,X
	BCC +
	STA.l $7ECF00,X
+	REP #$20
	%dbg_next(3)

; SENZU: a full stack of four Senzu Beans ($A5) in the first slot that
; holds item 5 (the former Cup of Wishes), else the first empty slot.
debug_op_senzu:
	SEP #$20
	LDX.w #$0000
-	LDA.l $7ECC48,X
	AND.b #$1F
	CMP.b #$05
	BEQ .put
	INX
	CPX.w #12
	BCC -
	LDX.w #$0000
-	LDA.l $7ECC48,X
	CMP.b #$FF
	BEQ .put
	INX
	CPX.w #12
	BCC -
	BRA .out
.put
	LDA.b #$A5
	STA.l $7ECC48,X
.out
	REP #$20
	%dbg_next(1)

; LEDGER held collected delivered wished (dragon-quest.js restore): the
; story module's persistent Dragon Ball ledger, marked initialised.
debug_op_ledger:
	SEP #$20
	LDA.b #$01
	STA.l !story_p_version
	REP #$20
	%dbg_arg8(1)
	SEP #$20
	STA.l !story_p_mask
	REP #$20
	%dbg_arg8(2)
	SEP #$20
	STA.l !story_p_seeds
	REP #$20
	%dbg_arg8(3)
	SEP #$20
	STA.l !story_p_delivered
	REP #$20
	%dbg_arg8(4)
	SEP #$20
	STA.l !story_p_wished
	REP #$20
	%dbg_next(5)

; SCRIPT ptr16: run native event bytes through the borrowed END slot 98,
; as fullParty does: story.request(98) (canAttack-gated, started by the
; story module at a field frame), then the event's pointer moves to the
; script before the interpreter runs (debug_field_frame follows
; story_field_frame in the same frame).
debug_op_script:
	LDA.l !dbg_state
	BNE .started
	JSR debug_field_mode
	BCC .wait
	LDA.w #$0098
	LDX.w #$0000
	JSL story_api_request
	BCC .wait
	LDA.w #$0001
	STA.l !dbg_state
.wait
	SEC
	RTS
.started
	JSL story_api_queued
	AND.w #$00FF
	BNE .wait
	SEP #$20
	LDA $D0
	REP #$20
	AND.w #$00FF
	BEQ .wait
	%dbg_arg16(1)
	STA $D1
	SEP #$20
	LDA.b #!DBG_BANK
	STA $D3
	REP #$20
	%dbg_next(3)

; TRAVEL door16 / REQUEST event16: the story module's travel/request (Goku
; active and canAttack, nothing queued), retried until accepted, done once
; the story module started it.
debug_op_travel:
	LDA.l !dbg_state
	BNE debug_op_started
	%dbg_arg16(1)
	JSL story_api_travel
	BRA debug_op_queued
debug_op_request:
	LDA.l !dbg_state
	BNE debug_op_started
	%dbg_arg16(1)
	LDX.w #$0000
	JSL story_api_request
debug_op_queued:
	BCC +
	LDA.w #$0001
	STA.l !dbg_state
+	SEC
	RTS
debug_op_started:
	JSL story_api_queued
	AND.w #$00FF
	BEQ +
	SEC
	RTS
+	%dbg_next(3)

; UNTIL map16 species8 flags8 payload16: wait for what the browser's polling
; loop or guard waits for. map $FFFF = any; flags !DEBUG_UNTIL_*.
debug_op_until:
	%dbg_arg8(4)
	STA.l !dbg_tmp2                 ; flags
	AND.w #!DEBUG_UNTIL_WORLD
	BEQ .field
	JSR debug_until_world
	BRA .checked
.field
	JSR debug_until_field
.checked
	BCC .no
	LDA.l !dbg_tmp2
	AND.w #!DEBUG_UNTIL_SCENE
	BEQ .yes
	%dbg_arg16(5)
	TAY
	LDA.w #!DEBUG_HOOK_SCENE
	JSR debug_call_hooks
	BCS .no
.yes
	%dbg_next(7)
.no
	LDA.l !dbg_tmp2
	AND.w #!DEBUG_UNTIL_ADVANCE
	BEQ +
	LDA.l !core_mode
	CMP.w #!CORE_MODE_FIELD
	BNE +
	JSR debug_advance
+	LDA.w #$0000
	STA.l !dbg_hooks_done           ; SCENE hooks are polled afresh
	SEC
	RTS

; World flight, interactive (native-flight.js: $8C = 0, no fade bits).
debug_until_world:
	LDA.l !core_mode
	CMP.w #!CORE_MODE_WORLD
	BNE .no
	SEP #$20
	LDA $8C
	BNE .no8
	LDA $FE
	AND.b #$C0
	BNE .no8
	REP #$20
	SEC
	RTS
.no8
	REP #$20
.no
	CLC
	RTS

; Field conditions of UNTIL (flags in !dbg_tmp2). Carry set when all hold.
debug_until_field:
	LDA.l !core_mode
	CMP.w #!CORE_MODE_FIELD
	BNE .no
	%dbg_arg16(1)
	CMP.w #$FFFF
	BEQ +
	STA.l !dbg_tmp0
	LDA $DC
	AND.w #$01FF
	CMP.l !dbg_tmp0
	BNE .no
+	LDA.l !dbg_tmp2
	AND.w #!DEBUG_UNTIL_CAN_ACT
	BEQ +
	JSR debug_can_act
	BCC .no
+	SEP #$20
	LDA.l !dbg_tmp2
	AND.b #!DEBUG_UNTIL_IDLE
	BEQ +
	LDA $D0
	BNE .no8
+	LDA.l !dbg_tmp2
	AND.b #!DEBUG_UNTIL_WINDOW
	BEQ +
	LDA $D0
	BPL .no8
+	LDA.l !dbg_tmp2
	AND.b #!DEBUG_UNTIL_EVENT
	BEQ +
	LDA $D0
	BEQ .no8
+	REP #$20
	LDA.l !dbg_tmp2
	AND.w #!DEBUG_UNTIL_ENEMY
	BEQ .yes
	%dbg_arg8(3)
	JSR debug_live_enemy
	BCC .no
.yes
	SEC
	RTS
.no8
	REP #$20
.no
	CLC
	RTS

; A = species (0 any) -> carry set when a live enemy (actor slot 3+) exists.
debug_live_enemy:
	STA.l !dbg_tmp1
	LDX.w #$0600
-	LDA.l $7EE000,X
	AND.w #$0001
	BEQ .next
	LDA.l $7EE182,X
	BEQ .next
	LDA.l !dbg_tmp1
	BEQ .found
	LDA.l $7EE180,X
	AND.w #$00FF
	CMP.l !dbg_tmp1
	BEQ .found
.next
	TXA
	CLC
	ADC.w #$0200
	TAX
	CPX.w #$1800
	BCC -
	CLC
	RTS
.found
	SEC
	RTS

; HOOK kind8 payload16: !DEBUG_PRESET_HOOK_ANY, then the preset's hook.
debug_op_hook:
	%dbg_arg16(2)
	TAY
	%dbg_arg8(1)
	JSR debug_call_hooks
	BCC +
	SEC
	RTS
+	%dbg_next(4)

; A = kind, Y = payload offset (debug bank): call the ANY hook and the
; preset's hook, each until it returns carry clear (!dbg_hooks_done keeps
; which finished). Carry set while either still works.
debug_call_hooks:
	STA.l !dbg_hook_args
	TYA
	STA.l !dbg_hook_args+2
	LDA.l !dbg_hooks_done
	AND.w #$0001
	BNE .preset
	LDX.w #3*!DEBUG_PRESET_COUNT
	JSR debug_hook_invoke
	BCS .preset
	LDA.l !dbg_hooks_done
	ORA.w #$0001
	STA.l !dbg_hooks_done
.preset
	LDA.l !dbg_hooks_done
	AND.w #$0002
	BNE .check
	LDA.l !dbg_preset
	AND.w #$00FF
	STA.l !dbg_tmp3
	ASL
	CLC
	ADC.l !dbg_tmp3
	TAX
	JSR debug_hook_invoke
	BCS .check
	LDA.l !dbg_hooks_done
	ORA.w #$0002
	STA.l !dbg_hooks_done
.check
	LDA.l !dbg_hooks_done
	CMP.w #$0003
	BEQ +
	SEC
	RTS
+	CLC
	RTS

; X = offset into debug_hook_table: JSL the target with A = kind,
; X = preset, Y = payload, M16/X16, DB = $7E, D = 0. Carry = its answer.
debug_hook_invoke:
	LDA.l debug_hook_table,X
	CMP.w #debug_hook_stub&$FFFF
	BNE +
	LDA.l debug_hook_table+1,X
	CMP.w #(debug_hook_stub>>8)&$FFFF
	BNE +
	CLC
	RTS
+	PHB
	PEA $7E7E : PLB : PLB
	PHK
	PER .back-1
	SEP #$20
	LDA.l debug_hook_table+2,X
	PHA
	REP #$20
	LDA.l debug_hook_table,X
	DEC
	PHA
	LDA.l !dbg_preset
	AND.w #$00FF
	TAX
	LDA.l !dbg_hook_args+2
	TAY
	LDA.l !dbg_hook_args
	RTL
.back
	REP #$30
	PLB
	RTS

; FORM f: Super Saiyan option (goku_api_set_form).
debug_op_form:
	%dbg_arg8(1)
	JSL goku_api_set_form
	%dbg_next(2)

; TAKEOFF: requestFlight, the native world request $0C00 | map from an idle,
; controllable field (core_event_request).
debug_op_takeoff:
	LDA.l !dbg_state
	BNE .started
	JSR debug_can_act
	BCC .wait
	LDA $DC
	AND.w #$00FF
	ORA.w #$0C00
	JSL core_event_request
	BCS .wait
	LDA.w #$0001
	STA.l !dbg_state
.wait
	SEC
	RTS
.started
	LDA.l !core_event_req
	BNE .wait
	%dbg_next(1)

; WORLDAIM (flight preset): south of the moving Fortress, level, 160 high.
debug_op_worldaim:
	LDA.l !core_mode
	CMP.w #!CORE_MODE_WORLD
	BEQ +
	SEC
	RTS
+	LDA $0128
	STA $FA
	LDA $012A
	CLC
	ADC.w #400
	AND.w #$0FFF
	STA $FC
	STZ $F6
	STZ $F4
	SEP #$20
	LDA.b #160
	STA $F8
	REP #$20
	%dbg_next(1)

; TELEPORT door16 x16 y16 (pullSword's teleport.follow): reload the map
; through its own door with the entry tile moved to (x, y), so the native
; loader builds the camera there, then place the hero on the exact pixel.
debug_op_teleport:
	LDA.l !dbg_state
	BNE .loading
	JSR debug_field_idle
	BCC .wait
	%dbg_arg16(1)
	ORA.w #$0800
	JSL $C1E76D
	REP #$30
	%dbg_arg16(3)
	LSR
	LSR
	LSR
	LSR
	SEP #$20
	STA $DE                         ; entry tile x
	REP #$20
	%dbg_arg16(5)
	LSR
	LSR
	LSR
	ASL                             ; tile y * 2
	AND.w #$00FE
	STA.l !dbg_tmp0
	SEP #$20
	LDA $DF
	AND.b #$01                      ; keep the door's layer
	ORA.l !dbg_tmp0
	STA $DF
	REP #$20
	LDA.w #$0001
	STA.l !dbg_state
.wait
	SEC
	RTS
.loading
	JSR debug_field_idle
	BCC .unstable
	LDA.l !dbg_stable
	INC
	STA.l !dbg_stable
	CMP.w #$0008
	BCC .wait
	%dbg_arg16(3)
	STA.l $7EE002
	%dbg_arg16(5)
	STA.l $7EE004
	%dbg_next(7)
.unstable
	LDA.w #$0000
	STA.l !dbg_stable
	SEC
	RTS

; PRESS bits16 frames16: hold buttons for n frames (pump(n, buttons)).
debug_op_press:
	LDA.l !dbg_state
	BNE +
	%dbg_arg16(3)
	STA.l !dbg_timer
	LDA.w #$0001
	STA.l !dbg_state
+	LDA.l !dbg_timer
	BEQ .done
	DEC
	STA.l !dbg_timer
	%dbg_arg16(1)
	JSR debug_press
	SEC
	RTS
.done
	%dbg_next(5)

; SWORD: pullSword's confirm loop (B every 152 frames, prose advanced)
; until the sword scene returned control with CF10 set. Without the
; title/arrival module the original sword pull plays and Goku is crowned
; and made active here, as arrival.js infers for older states.
debug_op_sword:
	SEP #$20
	LDA $CF10
	REP #$20
	AND.w #$00FF
	BEQ .press
	JSR debug_field_idle
	BCC .press
	LDA.l !dbg_stable
	INC
	STA.l !dbg_stable
	CMP.w #$0008
	BCC .wait
	SEP #$20
	LDA.l !persist_goku_active
	REP #$20
	AND.w #$00FF
	BNE +
	SEC
	JSR debug_crown
+	JSR debug_can_act
	BCC .wait
	%dbg_next(1)
.press
	LDA.w #$0000
	STA.l !dbg_stable
	JSR debug_advance
	LDA.l !dbg_timer
	INC
	CMP.w #152
	BCC +
	LDA.w #$0000
+	STA.l !dbg_timer
	CMP.w #$0002
	BCS .wait
	LDA.w #!PAD_B
	JSR debug_press
.wait
	SEC
	RTS

; OPENING: the original opening (legend, bridge, fall) plays with prose
; advanced until the waterfall (map 128) is idle and the sword untouched.
debug_op_opening:
	LDA.l !core_mode
	CMP.w #!CORE_MODE_FIELD
	BNE .wait
	LDA $DC
	AND.w #$01FF
	CMP.w #128
	BNE .busy
	SEP #$20
	LDA $CF10
	REP #$20
	AND.w #$00FF
	BNE .busy
	JSR debug_field_idle
	BCC .busy
	LDA.l !dbg_stable
	INC
	STA.l !dbg_stable
	CMP.w #30
	BCC .wait
	%dbg_next(1)
.busy
	LDA.w #$0000
	STA.l !dbg_stable
	JSR debug_advance
.wait
	SEC
	RTS

; REFILL: companions' HP to their (map-recomputed) maximum.
debug_op_refill:
	LDA.l $7EE384
	STA.l $7EE382
	LDA.l $7EE584
	STA.l $7EE582
	%dbg_next(1)

; CANCEL: cancelInput (nothing is held between ops).
debug_op_cancel:
	%dbg_next(1)

; MARK slot: a browser capture point on the way (late, battle).
debug_op_mark:
	%dbg_arg8(1)
	INC
	STA.l !dbg_marks
	%dbg_next(2)

; Carry set in an interactive field frame.
debug_field_mode:
	LDA.l !core_mode
	CMP.w #!CORE_MODE_FIELD
	BNE +
	JMP debug_can_act
+	CLC
	RTS
