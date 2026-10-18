; Test entry point. Lua tests poke !dbg_cmd (SRAM, CPU bus $33:7720) after
; filling the arguments; the command runs at the next field frame boundary.
;   1  destroy_hit with !arg_* (WRAM $7E:D990..)        -> dbg_res = result
;   2  start native event !dbg_arg (e.g. $800|door)     -> dbg_res = 1 started
;   3  destroy_orb_hit, actor offset !dbg_arg            -> dbg_res = 1 queued
;   4  run the event script in !dbg_script (door loader)  -> dbg_res = 1 started
;   5  plan the breach of wall offset !dbg_arg, no edits  -> dbg_res = 1 planned
;   6  Sandship: count a bulkhead strike (onDemolish)    -> dbg_res = breaks
;   7  story_api_request(!dbg_arg, actor !ssw_dbgactor)  -> dbg_res = 1 queued
;   8  Sandship floorHole footprint at (!arg_x, !arg_y)  -> dbg_res = 1 hole
;   9  Sandship takeoff (flight's L+R binding)            -> dbg_res = 1 taken
dst_debug_frame:
	LDA.l !dbg_cmd : BNE +
	RTS
+	CMP.w #1 : BNE .event
	JSL destroy_hit
	JMP .done
.event
	CMP.w #2 : BNE .orb
	LDA.l !dbg_arg
	LDX.w #0
	JSR dst_run_event
	LDA.w #0 : ROL
	JMP .done
.orb
	CMP.w #3 : BNE .script
	LDA.l !dbg_arg : TAX
	JSL destroy_orb_hit
	LDA.w #0 : ROL
	JMP .done
.script
	; 4: run the event script stored at !dbg_script (e.g. 04 18 <door> 05 00,
	; the QA tools' native door loader) through the field dispatcher.
	CMP.w #4 : BNE .plan
	SEP #$20
	LDA $D0
	REP #$20
	AND.w #$00FF : BNE .busy
	STZ $D4 : STZ $3A
	LDA.w #0
	PHB
	JSL $01E76D
	PLB
	REP #$30
	LDA.w #!dbg_script&$FFFF : STA $D1
	SEP #$20
	LDA.b #!dbg_script>>16 : STA $D3
	REP #$20
	LDA.w #1
	JMP .done
.busy
	LDA.w #0
	JMP .done
.plan
	; 5: plan (without queueing) the breach of wall cell !dbg_arg for the
	; direction in !arg_dir; the plan stays in the worker words.
	CMP.w #5 : BEQ +
	CMP.w #6 : BEQ .strike
	CMP.w #7 : BEQ .request
	CMP.w #8 : BEQ .hole
	CMP.w #9 : BEQ .takeoff
	JMP .unknown
.takeoff
	; 9: flight's L+R takeoff binding (!SANDSHIP_TAKEOFF)
	JSL destroy_ss_takeoff
	LDA.w #0 : ROL
	JMP .done
.hole
	; 8: the wreck's floor hole under the footprint at (arg_x, arg_y)
	LDX.w !arg_x
	LDY.w !arg_y
	JSR ss_floor_hole
	LDA.w #0 : ROL
	JMP .done
+
	LDA.l !pl_stage : BEQ +
	RTS                                ; a walk's plan is open: next frame
+	JSR dst_dm_context
	LDA.l !dbg_arg : STA.w !w_off
	LDA.w !arg_dir : AND.w #3 : STA.w !w_dir
	LDA.w #1 : STA.l !dbg_dry
	JSR dst_breach
	LDA.w #0 : STA.l !dbg_dry
	LDA.w #0 : ROL
	JMP .done
.request
	; 7: a story request, as the browser spec's m.story.request(id, {actor})
	LDA.l !ssw_dbgactor : TAX
	LDA.l !dbg_arg
	JSL story_api_request
	LDA.w #0 : ROL
	JMP .done
.strike
	; 6: the browser spec's onDemolish() stand-in for further strikes
	JSR ss_on_demolish
	LDA.l !ss_breaks
	JMP .done
.unknown
	LDA.w #$FFFF
.done
	STA.l !dbg_res
	LDA.w #0 : STA.l !dbg_cmd
	LDA.l !dbg_n : INC : STA.l !dbg_n
	RTS
