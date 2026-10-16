; Test entry point. Lua tests poke !dbg_cmd (SRAM, CPU bus $33:7720) after
; filling the arguments; the command runs at the next field frame boundary.
;   1  destroy_hit with !arg_* (WRAM $7E:D990..)        -> dbg_res = result
;   2  start native event !dbg_arg (e.g. $800|door)     -> dbg_res = 1 started
;   3  destroy_orb_hit, actor offset !dbg_arg            -> dbg_res = 1 queued
dst_debug_frame:
	LDA.l !dbg_cmd : BNE +
	RTS
+	CMP.w #1 : BNE .event
	JSL destroy_hit
	BRA .done
.event
	CMP.w #2 : BNE .orb
	LDA.l !dbg_arg
	LDX.w #0
	JSR dst_run_event
	LDA.w #0 : ROL
	BRA .done
.orb
	CMP.w #3 : BNE .unknown
	LDA.l !dbg_arg : TAX
	JSL destroy_orb_hit
	LDA.w #0 : ROL
	BRA .done
.unknown
	LDA.w #$FFFF
.done
	STA.l !dbg_res
	LDA.w #0 : STA.l !dbg_cmd
	LDA.l !dbg_n : INC : STA.l !dbg_n
	RTS
