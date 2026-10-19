; Destroy module entry points and frame services.
; All routines run with P = M16/X16 and DB = $7E unless noted; internal
; routines are JSR/RTS within this bank.

!cs #= (!core_scratch)&$FFFF   ; 16 bytes of call-local scratch shared by modules

; ---------------------------------------------------------------------------
; destroy_field_frame (JSL from modules_field_frame): after the game's frame
; logic, before the NMI handshake. Runs the debug trigger, the demolition
; planner, pending barrier events and orb events.
destroy_field_frame:
	REP #$30
	JSR dst_vline : STA.w !d_vstart      ; the background work's budget
	JSR dst_sync_map
	JSR dst_classes_watch
	JSR dst_debug_frame
	JSR dst_walls_work
	JSR dst_barrier_tick
	JSR dst_orb_tick
	JSR dst_hit_continue
	JSR ss_frame
	LDA.w #0 : STA.l !hp_worked
	RTL

; A beam's band or barrier box left for later (dst_step_next) that no
; destroy_hit call worked on this frame: continue them from the saved
; arguments. Dropped when the field stops being idle (an event, a menu: the
; beam ended).
; Combat runs before core_frame increments; this continuation runs after.
; A per-field latch avoids scanning twice across that boundary, including
; lag frames and the core counter's wrap. Debug hits use the same latch.
dst_hit_continue:
	LDA.l !hp_id : BNE +
	RTS
+	LDA.l !hp_worked : BEQ +
	RTS
+	JSR dst_ground_ok : BCS +
	LDA.w #0 : STA.l !hp_id : STA.l !hp_left
	RTS
+	LDA.w #1 : STA.l !hp_worked
	JSR dst_vline : STA.l !cl_t0
	LDA.l !hp_id : STA.w !arg_id
	LDA.l !hp_x : STA.w !arg_x
	LDA.l !hp_y : STA.w !arg_y
	LDA.l !hp_dir : STA.w !arg_dir
	LDA.l !hp_len : STA.w !arg_len
	LDA.l !hp_half : STA.w !arg_half
	LDA.l !hp_taper : STA.w !arg_taper
	LDA.l !hp_kind : STA.w !arg_kind
	LDA.l !hp_str : STA.w !arg_str
	LDA.l !hp_layer : STA.w !arg_layer
	STZ.w !d_flags
	LDA.l !hp_left : AND.w #1 : BEQ +
	JSR dst_scan_attack
+	LDA.l !hp_left : AND.w #2 : BEQ +
	JSR dst_barrier_hit
+	RTS

; ---------------------------------------------------------------------------
; destroy_hit (JSL): one attack against the map. Arguments in !arg_*.
;   P = M16/X16, DB = $7E. Returns A = bit 0 tiles queued, bit 1 barrier or
;   switch struck, bit 2 queue full (rescan next call).
; Punches (kind 0) and beams (2/3) break objects; full SSJ beams (3) also
; demolish dungeon walls and shatter braziers; ki blasts (1) only reach orbs
; (destroy_orb_hit). Beams keep one non-zero arg_id for their lifetime: each
; call only scans newly covered cells, and the beam operates one barrier.
destroy_hit:
	PHB
	PHP
	REP #$30
	PEA $7E7E : PLB : PLB
	JSR dst_sync_map
	STZ.w !d_flags
	JSR dst_ground_ok
	BCC .done
	LDA.w !arg_kind : CMP.w #1 : BEQ .done
	JSR ss_hit                   ; the Sandship breakout wave
	LDA.w #1 : STA.l !hp_worked
	JSR dst_vline : STA.l !cl_t0 ; the growth steps' time span starts
	JSR dst_scan_attack          ; plants, objects, braziers, wall candidates
	JSR dst_barrier_hit          ; gates, locks, hit/floor switches
.done
	LDA.w !d_flags
	PLP
	PLB
	RTL

; ---------------------------------------------------------------------------
; destroy_orb_hit (JSL): an attack touched actor X (offset from $7E:E000,
; e.g. $0600 for slot 3). Queues the orb's own puzzle event with the spell
; byte its element test expects. Carry set when accepted (one at a time).
destroy_orb_hit:
	PHB
	PHP
	REP #$30
	PEA $7E7E : PLB : PLB
	JSR dst_orb_queue
	BCC .no
	PLP : PLB
	SEC
	RTL
.no
	PLP : PLB
	CLC
	RTL

; ---------------------------------------------------------------------------
; C0:C7C3 hook. Entered by JSL in place of SEP #$30 / LDA $2E with the
; caller's registers; exits with them restored plus the replaced
; instructions' effect (8-bit A/X/Y, A = $2E, flags from the load).
destroy_redraw_hook:
	PHP
	REP #$30
	PHA : PHX : PHY
	PHB : PHD
	PEA $0000 : PLD
	PEA $7E7E : PLB : PLB
	LDA.w !d_qlive : ORA.w !d_cn
	BEQ .exit
	JSR dst_apply_frame
.exit
	PLD : PLB
	PLY : PLX : PLA
	PLP
	SEP #$30
	LDA $2E
	RTL

; ---------------------------------------------------------------------------
; Map change: the browser mod drops queued work for other maps and forgets
; smashed objects (native respawn on re-entry), demolition plans and
; pending barrier/orb hits.
dst_sync_map:
	LDA.w !m_init : CMP.w #$D5A1 : BEQ .inited
	; First call since reset (core_boot zeroes WRAM; SRAM holds garbage):
	; clear the slower state and the planner, barrier and hit words.
	LDA.w #0
	LDX.w #$3E
-	STA.l !DSTATE,X
	DEX : DEX : BPL -
	LDX.w #$7E
-	STA.l !DW,X                        ; !DW, !NTO, !PL, !DH ($80 bytes)
	DEX : DEX : BPL -
	STA.l !FX_SEQ : STA.l !FX_KIND : STA.l !FX_X : STA.l !FX_Y
	STA.l !ss_vis : STA.l !ss_work          ; the Sandship work restarts in its window
	STA.l !hp_id : STA.l !hp_left : STA.l !hp_worked
	LDA.w #$D5A1 : STA.w !m_init
	LDA.w #$FFFF : STA.w !d_map
.inited
	LDA $DC
	CMP.w !d_map
	BEQ .same
	STA.w !d_map
	STZ.w !d_qn
	STZ.w !d_qlive
	STZ.w !d_cn
	STZ.w !d_bnext
	STZ.w !d_aid
	LDA.w #0
	STA.l !bp_state
	STA.l !orb_base
	STA.l !pj_state
	STA.l !pl_stage
	STA.l !pl_wait
	STA.l !bb_id                       ; no beam's searched extent carries over
	STA.l !hp_id                       ; nor a beam's band left for later
	STA.l !hp_left
	STA.l !hp_worked
	LDA.w #$FFFF : STA.w !d_last
	JSR dst_run_fail_clear
	JSR dst_classes_reset
	; Map context from destroy_map_info (snes/gen/destroy.mjs).
	LDA $DC : AND.w #$01FF : ASL : ASL : ASL : TAX
	LDA.l destroy_map_info,X : AND.w #$00FF : STA.w !m_hdr
	AND.w #$003F : STA.w !m_ts
	LDA.l destroy_map_info+1,X : AND.w #$00FF : STA.w !m_grp
	LDA.l destroy_map_info+2,X : AND.w #$00FF : STA.w !m_bits
.same
	RTS

; ---------------------------------------------------------------------------
; Goku may attack: native field play with no event, menu, fade, hurt pose
; or incapacitating status (mana-mod.js canAttack / native-plants ground()).
; Carry set when allowed. A clobbered.
dst_ground_ok:
	SEP #$20
	LDA $E4 : CMP.b #1 : BNE .no
	LDA $E5 : CMP.b #1 : BNE .no
	LDA $D0 : BNE .no
	LDA $EC : AND.b #$FE : BNE .no
	LDA $ED : AND.b #$40 : BNE .no
	LDA.w $E000 : AND.b #1 : BEQ .no
	LDA.w $E02C : AND.b #1 : BEQ .no
	LDA.w $E190 : AND.b #$70 : BNE .no
	LDA.w $E191 : AND.b #$D5 : BNE .no
	LDA.w $E011 : CMP.b #$8C : BCC .ok
	CMP.b #$90 : BCC .no
.ok
	REP #$20
	SEC
	RTS
.no
	REP #$20
	CLC
	RTS

; ---------------------------------------------------------------------------
; Start a native event through the field dispatcher C1:E76D, as the browser
; mod's story.request() does at this same frame boundary.
;   A = event id (0..$7FF), X = actor offset for $3A ($0000 none).
;   Carry set when started. Story-authored barrier events whose table entry
;   is still the retail END slot run this module's compiled copy instead.
dst_run_event:
	STA.w !d_t0
	STX.w !d_t1
	; Same idle field as core_event_pump, and no other module's request
	; waiting there.
	LDA.l !CORE_EVREQ : BNE .no
	SEP #$20
	LDA $D0 : BNE .no8
	LDA $FF : BNE .no8
	LDA $E8 : AND.b #$04 : BNE .no8
	REP #$20
	STZ $D4
	LDA.w !d_t1 : STA $3A
	LDA.w !d_t0
	PHB
	JSL $01E76D
	PLB
	REP #$30
	SEP #$20
	LDA $D0 : CMP.b #1
	REP #$20
	BNE .failed
	; Retail END slot still selected? Then use the compiled script.
	LDX.w #0
.find
	LDA.l destroy_script_table,X
	CMP.w #$FFFF : BEQ .started
	CMP.w !d_t0 : BEQ .match
	TXA : CLC : ADC.w #8 : TAX
	BRA .find
.match
	SEP #$20
	LDA.l destroy_script_table+7,X : CMP $D3 : BNE .started8
	REP #$20
	LDA.l destroy_script_table+2,X : CMP $D1 : BNE .started
	LDA.l destroy_script_table+4,X : STA $D1
	SEP #$20
	LDA.l destroy_script_table+6,X : STA $D3
.started8
	REP #$20
.started
	SEC
	RTS
.no8
	REP #$20
.no
.failed
	CLC
	RTS

; ---------------------------------------------------------------------------
; destroy_reset (JSL, modules_load / modules_new_game): forget every
; transient edit, plan and pending hit; the next frame re-initialises.
destroy_reset:
	REP #$30
	STZ.w !m_init
	RTL

; destroy_title_boot (JSL, modules_title_boot): nothing of the Sandship's
; vblank work survives a reset (the persistent block keeps its words).
destroy_title_boot:
	REP #$30
	LDA.w #0
	STA.l !ss_vis : STA.l !ss_work : STA.l !ss_own
	; the effect record fx polls every frame: battery noise until the first
	; map change otherwise (second-emulator checks)
	STA.l !FX_SEQ : STA.l !FX_KIND
	RTL

; destroy_world_frame (JSL, modules_world_frame): the broken Mana Tree cloud
; barrier keeps its landing lock open (world-ki.js: $E3 bit 6 while flying).
destroy_world_frame:
	REP #$30
	LDA.l !P_TREE : AND.w #$0001 : BEQ +
	SEP #$20
	LDA $E3 : ORA.b #$40 : STA $E3
	REP #$20
+	RTL

; destroy_tree_barrier_break (JSL, for the world-flight module): a full wave
; reached the cloud barrier around Pure Land. Remembers it (saved with the
; GAME FILE) and opens the landing lock now. Boss progress is untouched.
destroy_tree_barrier_break:
	PHP
	REP #$30
	SEP #$20
	LDA.l !P_TREE : ORA.b #$01 : STA.l !P_TREE
	LDA.l $7E00E3 : ORA.b #$40 : STA.l $7E00E3
	PLP
	RTL

; ---------------------------------------------------------------------------
; C0:CC2D (map piece loader: LDA $7ECF00,X reads the story flag that gates
; the piece at [$20]; 8-bit A/X, DB = $7F). Watts's shortcut entrance on
; map 73 shows once its door broke, as if its range were 0..15 instead of
; 6..15 (native-story.js storyRead returns $0F for its range byte), and
; CF14 itself is left alone (it also drives Gnome and palace progress).
destroy_piece_flag:
	LDA.l $7ECF00,X
	PHA
	LDA $22 : CMP.b #$C8 : BNE .keep
	LDA $21 : CMP.b #!DESTROY_SHORTCUT_HI : BNE .keep
	LDA $20 : CMP.b #!DESTROY_SHORTCUT_LO : BNE .keep
	LDA.l !P_DOORS : AND.b #1<<!DESTROY_DOOR_GAIA_SHORTCUT : BEQ .keep
	PLA
	CMP.b #16 : BCS +                  ; above 15: outside 0..15 as well
	LDA.b #15                          ; inside the record's own 6..15
+	RTL
.keep
	PLA
	RTL

; ---------------------------------------------------------------------------
; Story queries DOOR_* (docs/agents/snes-port/story.md; barriers.doorBroken):
; JSL, M16/X16, DB = $7E. A16 = 1 when that breakable door is broken. Story
; routes the doors' trigger events (16A/16B, 55A/55B) on these.
destroy_query_door_gaia:
	LDA.w #1<<!DESTROY_DOOR_GAIA_SHORTCUT
	BRA destroy_query_door
destroy_query_door_pandora:
	LDA.w #1<<!DESTROY_DOOR_PANDORA_RUINS_EXIT
	BRA destroy_query_door
destroy_query_door_northtown:
	LDA.w #1<<!DESTROY_DOOR_NORTHTOWN_RUINS_SEAL
destroy_query_door:
	AND.l !P_DOORS
	AND.w #$00FF : BEQ +
	LDA.w #1
+	RTL
