; Attack geometry, native damage queueing, punches, ki, beams, the
; transformation burst and launches (mana-mod.js targets, hit, strike,
; fireKi, releaseCharge, updateProjectiles, transformBurst, updateKnockbacks).
; Actor records: $7E:E000 + slot*$200; enemies are slots 3-11.
;
; Scratch use: cb_t4-cb_t9 are clobbered by cb_targets, cb_hit and the
; effect helpers; loops keep their state in cb_t0-cb_t3, cb_td-cb_tf and
; ag_*, which those helpers never touch. Math uses cb_mq*/cb_m*.

!ACT_FIRST = $0600
!ACT_END   = $1800

; ---------------------------------------------------------------------------
; combat_targets: living hostile actors inside an attack box.
; In: ag_x/ag_y origin (map), ag_dir facing, ag_range, ag_width (across,
; inclusive), ag_behind, ag_cy (subtracted from the actor's y).
; Out: ag_list = slot mask (bit 0 = slot 3), then the virtual targets
; (bits 9-15, virtual.asm). Party, NPC species >= 128, inactive, defeated
; and 0-HP actors are never targets.
macro cb_native_target(slot)
	; Unrolled slots avoid rebuilding X and the slot mask for every shot.
	; Native actor coordinates are map pixels (well inside signed 16-bit).
	LDA.w $E000+(<slot>*$200)
	AND.w #$0001
	BEQ ?next
	; Reject distant actors before reading species, HP and defeat status.
	; Most projectile queries cover a small moving segment of the field.
	LDA.w $E002+(<slot>*$200)
	SEC
	SBC !cb_t4
	CMP !cb_t6
	BCS ?next
	LDA.w $E004+(<slot>*$200)
	SEC
	SBC !cb_t5
	CMP !cb_t7
	BCS ?next
	LDA.w $E180+(<slot>*$200)
	AND.w #$00FF
	CMP.w #$0080
	BCS ?next
	LDA.w $E182+(<slot>*$200)
	BEQ ?next
	LDA.w $E191+(<slot>*$200)
	AND.w #$0080
	BNE ?next
	LDA.w #1<<(<slot>-3)
	TSB !ag_list
?next:
endmacro

cb_targets:
	STZ !ag_list
	; Resolve the facing once into an inclusive axis-aligned rectangle.
	; (position - minimum) < extent+1 also rejects a negative distance,
	; removing the per-actor rotation, absolute value and signed branches.
	LDA !ag_width
	ASL
	INC
	STA !cb_t6                    ; cross-axis extent + 1
	LDA !ag_range
	CLC
	ADC !ag_behind
	INC
	STA !cb_t7                    ; along-axis extent + 1
	LDA !ag_dir
	CMP.w #$0001
	BEQ .horizontal
	CMP.w #$0002
	BEQ .horizontal
	LDA !ag_x
	SEC
	SBC !ag_width
	STA !cb_t4
	LDA !ag_y
	CLC
	ADC !ag_cy
	LDX !ag_dir
	BEQ .down
	SEC
	SBC !ag_range
	BRA .y
.down
	SEC
	SBC !ag_behind
	BRA .y
.horizontal
	LDA !cb_t6
	LDX !cb_t7
	STA !cb_t7
	STX !cb_t6
	LDA !ag_x
	LDX !ag_dir
	CPX.w #$0001
	BEQ .right
	SEC
	SBC !ag_range
	BRA .x
.right
	SEC
	SBC !ag_behind
.x
	STA !cb_t4
	LDA !ag_y
	CLC
	ADC !ag_cy
	SEC
	SBC !ag_width
.y
	STA !cb_t5
	for slot = 3..12
		%cb_native_target(!slot)
	endfor
	; after the actors: the registered virtual targets (modules.asm), from
	; the field frame's cache (virtual.asm)
	LDA.l !vt_state
	BMI +
	JSR cb_vt_refresh
+	AND.w #$7FFF
	BEQ +
	JMP cb_vt_targets
+	RTS

; along = x*dx + y*dy, across = |x*dy - y*dx| for the facing in ag_dir,
; x/y in cb_t4/cb_t5. Out: A16 = along (signed), cb_t6 = across.
cb_along_across:
	LDA !ag_dir
	AND.w #$0003
	BEQ .down
	CMP.w #$0001
	BEQ .right
	CMP.w #$0002
	BEQ .left
	LDA !cb_t4                    ; up: along = -y, across = |x|
	JSR cb_abs
	STA !cb_t6
	LDA !cb_t5
	EOR.w #$FFFF
	INC
	RTS
.down
	LDA !cb_t4
	JSR cb_abs
	STA !cb_t6
	LDA !cb_t5
	RTS
.right
	LDA !cb_t5
	JSR cb_abs
	STA !cb_t6
	LDA !cb_t4
	RTS
.left
	LDA !cb_t5
	JSR cb_abs
	STA !cb_t6
	LDA !cb_t4
	EOR.w #$FFFF
	INC
	RTS

cb_abs:
	CMP.w #$8000
	BCC +
	EOR.w #$FFFF
	INC
+	RTS

; A16 = slot index 0-8 -> A16 = actor offset.
cb_slot_offset:
	XBA
	ASL
	CLC
	ADC.w #!ACT_FIRST
	RTS

; A16 = bit index -> A16 = 1 << index. Preserves X, Y.
cb_bit_of:
	PHX
	TAX
	LDA.w #$0001
-	CPX.w #$0000
	BEQ +
	ASL
	DEX
	BRA -
+	PLX
	RTS

; ---------------------------------------------------------------------------
; combat_hit: queue damage on actor X (offset) through the native consumer
; C0:4053, attributed to Goku (+1F0 = +1EC = 0). Its display/queue clamps
; at 999: the excess is applied to HP first, leaving at least 1 HP for the
; native lethal hit, so the game runs numbers, reactions, rewards and death.
; In: X = actor offset, cb_hit_dmg, cb_hit_dir (0-3; $0080 radial with
; cb_hit_dx/dy), cb_hit_launch. Out: cb_hit_before / cb_hit_after (HP),
; cb_hit_orb. Preserves X; clobbers cb_t7-cb_t9.
cb_hit:
	LDA $E182,X
	STA !cb_hit_before
	SEP #$20
	STZ !cb_hit_orb
	REP #$20
	LDA $E180,X
	AND.w #$00FF
	CMP.w #$0055                  ; Crystal Orb: its own elemental test
	BNE .notOrb
	LDA !cb_hit_before
	STA !cb_hit_after
	SEP #$20
	INC !cb_hit_orb
	REP #$20
	PHX
	JSR cb_bind_orb_hit
	PLX
	RTS
.notOrb
	LDA !cb_hit_dmg
	PHX
	JSR cb_bind_damage_hook        ; Beast / Dark Lich resistance (frieza)
	PLX
	STA !cb_t7                    ; damage
	CLC
	ADC $E1F1,X
	BCC +
	LDA.w #$FFFF
+	STA !cb_t8                    ; total
	CMP.w #1000
	BCC .clamp
	SEC
	SBC.w #999
	STA !cb_t9                    ; excess
	LDA !cb_hit_before
	SEC
	SBC !cb_t9
	BCC .one
	BNE .hp
.one
	LDA.w #$0001
.hp
	STA $E182,X
.clamp
	LDA !cb_t8
	CMP.w #1000
	BCC +
	LDA.w #999
+	STA $E1F1,X
	SEP #$20
	STZ $E1F0,X
	STZ $E1EC,X
	REP #$20
	INC !cb_hits
	JSR cb_sound_mark
	; after = max(0, hp - damage)
	LDA !cb_hit_before
	SEC
	SBC !cb_t7
	BCS +
	LDA.w #$0000
+	STA !cb_hit_after
	; small enemies fly; bosses (species >= 84) stay in their arena
	LDA !cb_hit_launch
	AND.w #$00FF
	BEQ .out
	LDA $E180,X
	AND.w #$00FF
	CMP.w #84
	BCS .out
	JSR cb_launch_start
.out
	RTS

; Remember that combat queued actor X's hit (native-combat-sound.js mark).
; Preserves X.
cb_sound_mark:
	PHX
	TXA
	SEC
	SBC.w #!ACT_FIRST
	LSR : LSR : LSR : LSR : LSR : LSR    ; slot * 8
	TAY                           ; Y = mark offset
	LDA $E180,X
	TYX
	SEP #$20
	STA.l !SM+!sm_sp,X
	LDA.b #$01
	STA.l !SM+!sm_on,X
	REP #$20
	LDA !cb_frame
	STA.l !SM+!sm_frame,X
	LDA $DC
	STA.l !SM+!sm_map,X
	PLX
	RTS

; ---------------------------------------------------------------------------
; Launch record for actor X: 12-frame eased arc of 56 px (88 in Super
; Saiyan) along cb_hit_dir, or radially (cb_hit_dx/dy). Replaces a running
; launch of the same actor. Preserves X.
cb_launch_start:
	PHX
	TXY                           ; Y = actor offset
	TXA
	SEC
	SBC.w #!ACT_FIRST
	LSR : LSR : LSR : LSR : LSR   ; slot * 16
	TAX
	LDA.w #56
	PHX
	LDX.w #88
	JSR cb_by_form
	PLX
	SEP #$20
	STA.l !KB+!kb_dist,X
	LDA.b #$01
	STA.l !KB+!kb_on,X
	LDA $E180,Y
	STA.l !KB+!kb_sp,X
	LDA !cb_hit_dir
	STA.l !KB+!kb_dir,X
	LDA.b #$00
	STA.l !KB+!kb_hold,X
	STA.l !KB+!kb_age,X
	REP #$20
	LDA $E002,Y
	STA.l !KB+!kb_x,X
	LDA $E004,Y
	STA.l !KB+!kb_y,X
	LDA !cb_hit_dx
	STA.l !KB+!kb_dx,X
	LDA !cb_hit_dy
	STA.l !KB+!kb_dy,X
	TXA
	LSR : LSR : LSR : LSR
	JSR cb_bit_of
	TSB !cb_kb_mask
	PLX
	RTS

; Hold the launches of the slots in A16 (mask) for cb_t0 frames.
cb_launch_hold:
	STA !cb_t1
	LDX.w #$0000
.loop
	LSR !cb_t1
	BCC .next
	LDA.l !KB+!kb_on,X
	AND.w #$00FF
	BEQ .next
	SEP #$20
	LDA !cb_t0
	STA.l !KB+!kb_hold,X
	REP #$20
.next
	TXA
	CLC
	ADC.w #16
	TAX
	CPX.w #9*16
	BCC .loop
	RTS

cb_launch_clear:
	LDA.w #$0000
	LDX.w #9*16-2
-	STA.l !KB,X
	DEX : DEX
	BPL -
	STZ !cb_kb_mask
	RTS

; updateKnockbacks(): one frame of every launch. The native kill routine
; turns the actor into death effect F9; that effect keeps flying.
cb_update_launches:
	LDA !cb_kb_mask
	STA !cb_kb_iter
	LDX.w #$0000
	LDY.w #!ACT_FIRST
.loop
	LSR !cb_kb_iter
	BCS +
	JMP .next
+	LDA $E000,Y
	AND.w #$0001
	BEQ .drop
	LDA $E180,Y
	AND.w #$00FF
	STA !cb_t0
	LDA.l !KB+!kb_sp,X
	AND.w #$00FF
	CMP !cb_t0
	BEQ .same
	LDA !cb_t0
	CMP.w #$00F9
	BNE .drop
	LDA $E191,Y
	AND.w #$0080
	BEQ .drop
.same
	LDA.l !KB+!kb_hold,X
	AND.w #$00FF
	BEQ .move
	SEP #$20
	DEC
	STA.l !KB+!kb_hold,X
	REP #$20
	JMP .next
.drop
	JSR cb_launch_end
	JMP .next
.move
	SEP #$20
	LDA.l !KB+!kb_age,X
	INC
	STA.l !KB+!kb_age,X
	REP #$20
	AND.w #$00FF
	CMP.w #13
	BCC +
	LDA.w #12
+	ASL
	STA !cb_t1                    ; age*2 (table index)
	STX !cb_t2
	STY !cb_t3
	JSR cb_launch_offsets          ; cb_t4 = dx, cb_t5 = dy (pixels)
	LDX !cb_t2
	LDY !cb_t3
	LDA.l !KB+!kb_x,X
	CLC
	ADC !cb_t4
	JSR cb_clamp_map
	STA $E002,Y
	LDA.l !KB+!kb_y,X
	CLC
	ADC !cb_t5
	JSR cb_clamp_map
	STA $E004,Y
	LDA !cb_t1
	LSR
	TAX
	LDA.l combat_launch_lift,X
	SEP #$20
	STA $E045,Y
	REP #$20
	LDX !cb_t2
	LDA.l !KB+!kb_age,X
	AND.w #$00FF
	CMP.w #12
	BCC .next
	JSR cb_launch_end
.next
	TYA
	CLC
	ADC.w #$0200
	TAY
	TXA
	CLC
	ADC.w #16
	TAX
	LDA !cb_kb_iter
	BEQ +
	JMP .loop
+	RTS

; Launch record X ends (bit cleared). Preserves X, Y.
cb_launch_end:
	SEP #$20
	LDA.b #$00
	STA.l !KB+!kb_on,X
	REP #$20
	TXA
	LSR : LSR : LSR : LSR
	JSR cb_bit_of
	TRB !cb_kb_mask
	RTS

; Signed clamp to [8, 1016] (the browser's map bound).
cb_clamp_map:
	CMP.w #$8000
	BCS .low
	CMP.w #8
	BCC .low
	CMP.w #1017
	BCC .ok
	LDA.w #1016
	RTS
.low
	LDA.w #8
.ok
	RTS

; Offsets of launch record X at table index cb_t1 (= age*2): axis launches
; use the exact tables, radial ones dx/dy * ease. Out: cb_t4 / cb_t5.
cb_launch_offsets:
	STZ !cb_t4
	STZ !cb_t5
	LDA.l !KB+!kb_dir,X
	AND.w #$00FF
	CMP.w #$0080
	BCS .radial
	STA !cb_t6                    ; facing
	LDA.l !KB+!kb_dist,X
	AND.w #$00FF
	CMP.w #88
	BEQ .far
	LDX !cb_t1
	LDA.l combat_launch_56p,X
	STA !cb_t7
	LDA.l combat_launch_56n,X
	STA !cb_t8
	BRA .axis
.far
	LDX !cb_t1
	LDA.l combat_launch_88p,X
	STA !cb_t7
	LDA.l combat_launch_88n,X
	STA !cb_t8
.axis
	LDA !cb_t6
	BEQ .down
	CMP.w #$0001
	BEQ .right
	CMP.w #$0002
	BEQ .left
	LDA !cb_t8                    ; up
	STA !cb_t5
	RTS
.down
	LDA !cb_t7
	STA !cb_t5
	RTS
.right
	LDA !cb_t7
	STA !cb_t4
	RTS
.left
	LDA !cb_t8
	STA !cb_t4
	RTS
.radial
	PHX
	LDX !cb_t1
	LDA.l combat_launch_ease16,X
	STA !cb_t9                    ; ease (0.16)
	PLX
	LDA.l !KB+!kb_dx,X
	JSR cb_scale_ease
	STA !cb_t4
	LDX !cb_t2
	LDA.l !KB+!kb_dy,X
	JSR cb_scale_ease
	STA !cb_t5
	RTS

; A16 = signed 8.8 offset v, cb_t9 = ease (0.16) -> A16 = round(v*ease) in
; whole pixels, half rounding toward +inf (Math.round).
cb_scale_ease:
	STA !cb_t6                    ; sign
	JSR cb_abs
	STA !cb_mq
	LDA !cb_t9
	JSR cb_mul16                  ; cb_mq2:cb_mq1 = |v|*ease (8.24)
	LDA !cb_t6
	CMP.w #$8000
	BCS .neg
	LDA !cb_mq2                   ; 8.8 = high word
	CLC
	ADC.w #$0080
	XBA
	AND.w #$00FF
	RTS
.neg
	; round(-m) = -floor(m + 0.5 - ulp): -(m + $7F) >> 8 with the low word
	LDA !cb_mq2
	CLC
	ADC.w #$007F
	LDX !cb_mq1
	CPX.w #$0000
	BEQ +
	INC                           ; a fraction below the 8.8 grid: > .5 exactly
+	XBA
	AND.w #$00FF
	EOR.w #$FFFF
	INC
	RTS

; A16 * cb_mq -> cb_mq2:cb_mq1 (unsigned 32-bit). Preserves X, Y.
cb_mul16:
	; four 8x8 products on the CPU multiplier ($4202/$4203 -> $4216, ready
	; 8 cycles after the $4203 write; the game's interrupt handlers never
	; use it, like the game's own field code)
	STA !cb_mq3                   ; b
	SEP #$20
	LDA !cb_mq                    ; al
	STA.l $004202
	LDA !cb_mq3                   ; bl
	STA.l $004203
	NOP : NOP : NOP : NOP
	REP #$20
	LDA.l $004216
	STA !cb_mq1                   ; al*bl
	SEP #$20
	LDA !cb_mq3+1                 ; bh
	STA.l $004203
	NOP : NOP : NOP : NOP
	REP #$20
	LDA.l $004216
	STA !cb_mq2                   ; al*bh
	SEP #$20
	LDA !cb_mq+1                  ; ah
	STA.l $004202
	LDA !cb_mq3                   ; bl
	STA.l $004203
	NOP : NOP : NOP : NOP
	REP #$20
	LDA.l $004216                 ; ah*bl
	CLC
	ADC !cb_mq2
	STA !cb_mq2                   ; m = al*bh + ah*bl, carry = bit 16
	LDA.w #$0000
	ROL
	STA !cb_mq                    ; bit 16 of m
	SEP #$20
	LDA !cb_mq3+1                 ; bh
	STA.l $004203                 ; ah*bh (read below, long after)
	REP #$20
	LDA !cb_mq2                   ; low word += (m & $FF) << 8
	AND.w #$00FF
	XBA
	CLC
	ADC !cb_mq1
	STA !cb_mq1
	LDA !cb_mq2                   ; high word = (m >> 8) + carry
	XBA
	AND.w #$00FF
	ADC.w #$0000
	STA !cb_mq2
	LDA !cb_mq                    ; + bit 16 of m (<< 8)
	XBA
	CLC
	ADC !cb_mq2
	STA !cb_mq2
	LDA.l $004216                 ; + ah*bh
	CLC
	ADC !cb_mq2
	STA !cb_mq2
	STZ !cb_mq
	RTS

; ---------------------------------------------------------------------------
; strike(): the punch connects on its impact frame.
cb_strike:
	LDA $E002
	STA !ag_x
	LDA $E004
	STA !ag_y
	LDA !cb_act_face
	AND.w #$0003
	STA !ag_dir
	STZ !ag_cy
	LDA.w #10
	STA !ag_behind
	LDA.w #24
	STA !ag_width
	JSR cb_damage_scale
	LDA !cb_act_arg
	AND.w #$0003
	CMP.w #$0002
	BEQ .kick
	LDA.w #44
	STA !ag_range
	LDA !cb_scale
	BRA .dmg
.kick
	LDA.w #54
	STA !ag_range
	LDA.l combat_damage_table+2,X
.dmg
	STA !cb_hit_dmg
	JSR cb_targets
	LDA !ag_dir
	STA !cb_hit_dir
	SEP #$20
	LDA.b #$01
	STA !cb_hit_launch
	REP #$20
	LDA !ag_list
	STA !cb_td                    ; remaining targets
	STZ !cb_te                    ; contacts
	STZ !cb_tf                    ; bit index
.each
	LDA !cb_td
	BEQ .done
	LSR !cb_td
	BCC .nextBit
	LDA !cb_tf
	CMP.w #!VT_BIT0
	BCC .actor
	JSR cb_vt_hit                 ; a virtual target: its own hit()
	BRA .took
.actor
	JSR cb_slot_offset
	TAX
	JSR cb_hit
.took
	LDA !cb_hit_orb
	AND.w #$00FF
	BNE .nextBit
	LDA !cb_hit_after
	CMP !cb_hit_before
	BCS .nextBit
	LDA !cb_tf
	JSR cb_bit_of
	TSB !cb_te
.nextBit
	INC !cb_tf
	BRA .each
.done
	; contact hold: 3 frames, 5 for the finishing kick
	SEP #$20
	STZ !cb_act_pause
	REP #$20
	LDA !cb_te
	BEQ .noContact
	LDA !cb_act_arg
	AND.w #$0003
	CMP.w #$0002
	BEQ +
	LDA.w #3
	BRA ++
+	LDA.w #5
++	SEP #$20
	STA !cb_act_pause
	INC
	STA !cb_t0
	REP #$20
	LDA !cb_te
	JSR cb_launch_hold
.noContact
	; a miss pulses native B (talk, chests); a struck barrier does not
	LDA !ag_list
	BNE +
	SEP #$20
	LDA.b #$02
	STA !cb_tap
	REP #$20
+	LDA.w #28                     ; punches break objects just ahead
	STA.l !da_len
	LDA.w #9
	STA.l !da_half
	LDA.w #$0000
	STA.l !da_taper
	LDA.w #256
	STA.l !da_str
	LDA.w #$0000
	STA.l !da_id
	LDA.w #$0000                  ; kind 0: punch / kick
	JSR cb_destroy_attack
	BIT.w #$0002
	BEQ +
	SEP #$20
	STZ !cb_tap
	REP #$20
+	; sparks at every contact, quake and the impact cue
	LDA !cb_te
	BNE +
	RTS
+	STA !cb_td
	STZ !cb_tf
.spark
	LDA !cb_td
	BEQ .feedback
	LSR !cb_td
	BCC .nextSpark
	LDA !cb_tf
	JSR cb_target_xy              ; the actor's or the virtual target's spot
	LDA !cb_t5
	SEC
	SBC.w #12
	STA !cb_t5
	LDA !cb_act_pause
	AND.w #$00FF
	STA !cb_t6                    ; hold
	LDA.w #10
	STA !cb_t7                    ; life
	LDA !ag_dir
	STA !cb_t8
	LDA !cb_act_super
	AND.w #$00FF
	STA !cb_t9
	JSR cb_effect_impact
.nextSpark
	INC !cb_tf
	BRA .spark
.feedback
	LDA.w #3
	LDX.w #5
	JSR cb_by_super
	STA !cb_t0
	LDA !cb_act_arg
	AND.w #$0003
	CMP.w #$0002
	BNE .hit
	LDA !cb_t0
	CLC
	ADC.w #3
	JSR cb_quake
	LDA.w #!AUDIO_SFX_KICK_ID
	JMP cb_sfx
.hit
	LDA !cb_t0
	JSR cb_quake
	LDA.w #!AUDIO_SFX_HIT_ID
	JMP cb_sfx

; ---------------------------------------------------------------------------
; handOrigin(): palm of the pose. A16 = technique (0 beam, 1/2 ki hand 0/1,
; 3 charge), cb_t8 = facing. Out: cb_t4 = x, cb_t5 = y (map). The pygmy
; miniature halves the offsets (rounded as Math.round).
cb_hand_origin:
	STA !cb_t9
	LDA !cb_form
	AND.w #$0001
	ASL : ASL
	CLC
	ADC !cb_t9
	ASL : ASL
	STA !cb_t9
	LDA !cb_t8
	AND.w #$0003
	CLC
	ADC !cb_t9
	ASL
	TAX
	LDA.l combat_sockets,X
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	STA !cb_t4                    ; dx
	LDA.l combat_sockets+1,X
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	STA !cb_t5                    ; dy
	LDA $E180
	AND.w #$00FF
	CMP.w #$00F6
	BNE .full
	LDA !cb_t4
	INC
	CMP.w #$8000
	ROR
	STA !cb_t4
	LDA !cb_t5
	INC
	CMP.w #$8000
	ROR
	STA !cb_t5
.full
	LDA !cb_t4
	CLC
	ADC $E002
	STA !cb_t4
	LDA $E045
	AND.w #$00FF
	STA !cb_t6
	LDA !cb_t5
	CLC
	ADC $E004
	SEC
	SBC !cb_t6
	SEC
	SBC !goku_lift
	STA !cb_t5
	RTS

; ---------------------------------------------------------------------------
; fireKi(): the palm releases one shot (life 22, 14 px per frame).
cb_fire_ki:
	LDA !cb_act_face
	AND.w #$0003
	STA !cb_t8
	LDA !cb_act_arg
	AND.w #$0001
	INC
	JSR cb_hand_origin
	JSR cb_damage_scale
	LDA.l combat_damage_table+4,X
	STA !cb_t7
	JSR cb_effect_alloc
	BCC +
	RTS
+	SEP #$20
	LDA.b #!ERK_KI
	STA.l !ER+!er_kind,X
	LDA.b #$00
	STA.l !ER+!er_hold,X
	LDA.b #22
	STA.l !ER+!er_life,X
	STA.l !ER+!er_max,X
	LDA !cb_act_face
	AND.b #$03
	STA.l !ER+!er_dir,X
	LDA.b #$00
	LDY !cb_act_super-1           ; high byte = cb_act_super
	CPY.w #$0100
	BCC +
	LDA.b #!ERF_SUPER
+	STA !cb_t9
	LDA !cb_act_arg
	AND.b #$01
	BEQ +
	LDA.b #!ERF_HAND
+	ORA !cb_t9
	STA.l !ER+!er_flags,X
	REP #$20
	LDA !cb_t4
	STA.l !ER+!er_x,X
	LDA !cb_t5
	STA.l !ER+!er_y,X
	LDA !cb_t7
	STA.l !ER+!er_dmg,X
	LDA.w #$0000
	STA.l !ER+!er_hits,X
	JSR cb_fx_spawn_ki             ; X = record
	LDA.w #!AUDIO_SFX_BLAST_ID
	JMP cb_sfx

; ---------------------------------------------------------------------------
; releaseCharge(): Kamehameha along the locked facing. Strength = charge /
; cap (quarter-strength minimum damage); a full Super Saiyan charge gives the
; 64-frame wave (80 px half width, 640 px, 48 px per frame).
cb_fire_beam:
	LDA !cb_facing
	AND.w #$0003
	STA !cb_t8
	LDA.w #$0000
	JSR cb_hand_origin
	SEP #$20
	LDA !cb_charge
	STA !bm_charge
	STZ !bm_mega
	STZ !bm_barrier
	LDA !cb_form
	BEQ .normal
	LDA !bm_charge
	CMP.b #45
	BCC .normal
	LDA.b #$01
	STA !bm_mega
.normal
	REP #$20
	LDA !bm_mega
	AND.w #$00FF
	BEQ +
	LDA.w #640
	STA !bm_range
	LDA.w #48
	STA !bm_speed
	LDA.w #64
	BRA ++
+	LDA.w #320
	STA !bm_range
	LDA.w #32
	STA !bm_speed
	LDA.w #24
++	STA !cb_t3                    ; life
	; damage = round(scale * max(.25, strength)) (exact table)
	JSR cb_damage_scale
	LDA !cb_form
	AND.w #$0001
	ASL
	STA !cb_t0
	LDA !cb_gi
	AND.w #$0001
	ORA !cb_t0
	ASL
	TAX
	LDA.l cb_beam_tables,X
	STA !cb_t0
	LDA !bm_charge
	AND.w #$00FF
	ASL
	CLC
	ADC !cb_t0
	TAX
	LDA.l combat_data_start&$FF0000,X
	STA !cb_t2                    ; damage
	; a fresh destroy attack id for this beam (never 0)
	SEP #$20
	INC !cb_attack_id
	BNE +
	INC !cb_attack_id
+	LDA !cb_attack_id
	STA !bm_id
	REP #$20
	; point blank: the palms can already be inside a solid tile
	LDA $E002
	STA !ag_x
	LDA $E004
	STA !ag_y
	LDA !cb_t8
	STA !ag_dir
	LDA.w #28
	STA.l !da_len
	LDA.w #9
	STA.l !da_half
	LDA.w #$0000
	STA.l !da_taper
	JSR cb_beam_strength
	STA.l !da_str
	LDA !bm_id
	AND.w #$00FF
	STA.l !da_id
	LDA !bm_mega
	AND.w #$00FF
	CLC
	ADC.w #2                      ; kind 2 beam, 3 full SSJ wave
	JSR cb_destroy_attack
	; the beam record
	JSR cb_effect_beam_slot
	SEP #$20
	LDA.b #!ERK_BEAM
	STA.l !ER+!er_kind,X
	LDA !cb_t8
	STA.l !ER+!er_dir,X
	LDA.b #$00
	STA.l !ER+!er_hold,X
	LDA !cb_t3
	STA.l !ER+!er_life,X
	STA.l !ER+!er_max,X
	LDA.b #$00
	LDY !cb_form-1                ; high byte = cb_form
	CPY.w #$0100
	BCC +
	LDA.b #!ERF_SUPER
+	LDY !bm_mega-1
	CPY.w #$0100
	BCC +
	ORA.b #!ERF_MEGA
+	STA.l !ER+!er_flags,X
	REP #$20
	LDA !cb_t4
	STA.l !ER+!er_x,X
	LDA !cb_t5
	STA.l !ER+!er_y,X
	LDA !cb_t2
	STA.l !ER+!er_dmg,X
	LDA.w #$0000
	STA.l !ER+!er_hits,X
	; per-target pulse timers start empty (species $FF never matches)
	LDA.w #$FFFF
	LDX.w #30
-	STA.l !BP,X
	DEX : DEX
	BPL -
	; the beam action: planted until 4 frames after the beam
	LDA !cb_t3
	CLC
	ADC.w #4
	STA !cb_t0
	SEP #$20
	LDA.b #!GOKU_K_BEAM
	JSR cb_begin_action
	SEP #$20
	LDA !cb_t8
	STA !cb_act_face
	STZ !cb_queued
	REP #$20
	STZ !cb_charge
	; feedback, cue and the shout
	LDA.w #10
	LDX.w #14
	JSR cb_by_form
	TAX
	LDA !bm_mega
	AND.w #$00FF
	BEQ +
	LDX.w #36
+	TXA
	JSR cb_quake
	LDA.w #!AUDIO_SFX_BEAM_ID
	JSR cb_sfx
	JSR cb_bind_voice_release
	RTS

cb_beam_tables:
	dw combat_beam_damage_base, combat_beam_damage_base_gi
	dw combat_beam_damage_ssj, combat_beam_damage_ssj_gi

; Strength of the live beam, 0-256 (charge * 256 / cap).
; The live beam's picture for this frame (drawn by cb_effects_draw at the
; frame end): palms ag_x/ag_y, facing ag_dir, length cb_t2, half width
; cb_t3, taper cb_t1, age cb_t0.
cb_beam_picture:
	LDA !bm_mega
	AND.w #$00FF
	BEQ +
	LDA.w #$0001                  ; full wave
	BRA ++
+	LDA !cb_form
	AND.w #$00FF
	BEQ ++
	LDA.w #$0002                  ; Super Saiyan colours
++	STA.l !bd_kind
	LDA !ag_x
	STA.l !bd_x
	LDA !ag_y
	STA.l !bd_y
	LDA !ag_dir
	STA.l !bd_dir
	LDA !cb_t2
	STA.l !bd_len
	LDA !cb_t3
	STA.l !bd_half
	LDA !cb_t1
	STA.l !bd_taper
	LDA !cb_t0
	STA.l !bd_age
	LDA.w #$0001
	STA.l !bd_on
	RTS

; strength 0-256 of the running charge (King Kai, energy beds, the orb)
cb_bind_strength:
	LDA !cb_charge
	AND.w #$00FF
	BRA cb_strength
cb_beam_strength:
	LDA !bm_charge
	AND.w #$00FF
; A16 = charge: A16 = floor(min(charge, cap) * 256 / cap), cap 90 / 45 (SSJ).
cb_strength:
	TAX
	LDA !cb_form
	AND.w #$00FF
	BEQ .base
	CPX.w #45
	BCC +
	LDX.w #45
+	TXA
	ASL
	TAX
	LDA.l combat_strength_ssj,X
	RTS
.base
	CPX.w #90
	BCC +
	LDX.w #90
+	TXA
	ASL
	TAX
	LDA.l combat_strength_base,X
	RTS

; ---------------------------------------------------------------------------
; updateProjectiles(): ki shots and the beam advance and hit what their
; visible front covers. Beams pulse each target every 8 frames (6 for the
; full wave); ki stops at its first hit.
cb_update_projectiles:
	LDA !cb_fx_mask
	STA !cb_fx_iter
	LDX.w #$0000
.loop
	STX !cb_tf                    ; record offset
	LSR !cb_fx_iter
	BCC .next
	LDA.l !ER+!er_kind,X
	AND.w #$00FF
	CMP.w #!ERK_KI
	BEQ .ki
	CMP.w #!ERK_BEAM
	BNE .next
	JSR cb_beam_frame
	BRA .next
.ki
	JSR cb_ki_frame
.next
	LDA !cb_tf
	CLC
	ADC.w #!ER_SIZE
	TAX
	LDA !cb_fx_iter
	BNE .loop
	RTS

; Projectile set-up: X = record. Fills ag_* (origin, dir, cy 12, behind 8)
; and cb_t0 = age.
cb_proj_setup:
	LDA.l !ER+!er_x,X
	STA !ag_x
	LDA.l !ER+!er_y,X
	STA !ag_y
	LDA.l !ER+!er_dir,X
	AND.w #$0003
	STA !ag_dir
	LDA.w #12
	STA !ag_cy
	LDA.w #8
	STA !ag_behind
	LDA.l !ER+!er_max,X
	SEC
	SBC.l !ER+!er_life,X
	AND.w #$00FF
	STA !cb_t0                    ; age
	RTS

; C set when actor Y has a lethal queued hit (pending >= HP); never for
; puzzle orbs.
cb_lethal_pending:
	LDA $E180,Y
	AND.w #$00FF
	CMP.w #$0055
	BEQ .no
	LDA $E1F1,Y
	BEQ .no
	CMP $E182,Y
	BCC .no
	SEC
	RTS
.no
	CLC
	RTS

; along/across of actor Y from the projectile origin (ag_*), cy 12.
; Out: A16 = along, cb_t6 = across.
cb_proj_along:
	LDA $E002,Y
	SEC
	SBC !ag_x
	STA !cb_t4
	LDA $E004,Y
	SEC
	SBC.w #12
	SEC
	SBC !ag_y
	STA !cb_t5
	JMP cb_along_across

; A projectile (record cb_tf) hit target bit cb_te (actor Y for bits 0-8):
; damage, cue and an impact spark.
cb_proj_hit:
	LDX !cb_tf
	LDA.l !ER+!er_dmg,X
	STA !cb_hit_dmg
	LDA.l !ER+!er_dir,X
	AND.w #$0003
	STA !cb_hit_dir
	LDA.l !ER+!er_flags,X
	AND.w #!ERF_SUPER
	STA !cb_bslot                 ; super (spark tone)
	SEP #$20
	LDA.b #$01
	STA !cb_hit_launch
	REP #$20
	LDA !cb_te
	CMP.w #!VT_BIT0
	BCS .virtual
	TYX
	JSR cb_hit
	PHX
	LDA.w #!AUDIO_SFX_IMPACT_ID
	JSR cb_sfx
	PLX
	LDA $E002,X
	STA !cb_t4
	LDA $E004,X
	BRA .spark
.virtual
	JSR cb_vt_hit
	LDA.w #!AUDIO_SFX_IMPACT_ID
	JSR cb_sfx
	LDA !cb_te
	JSR cb_target_xy
	LDA !cb_t5
.spark
	SEC
	SBC.w #12
	STA !cb_t5
	STZ !cb_t6                    ; hold
	LDA.w #12
	STA !cb_t7                    ; life
	LDA !cb_hit_dir
	STA !cb_t8
	LDA !cb_bslot
	STA !cb_t9
	JMP cb_effect_impact

; One ki frame (record cb_tf).
cb_ki_frame:
	LDX !cb_tf
	JSR cb_proj_setup
	; length = min(256, (age+1)*14), half width 8 / 12 (+8)
	LDA !cb_t0
	INC
	ASL
	STA !cb_t1
	ASL : ASL : ASL               ; *16
	SEC
	SBC !cb_t1                    ; *14
	CMP.w #256
	BCC +
	LDA.w #256
+	STA !ag_range
	STA !cb_t2                    ; length
	; Only the front 30 px can hit. Fold that existing narrow-phase test
	; into the query rectangle, keeping the launch-frame rear limit (-8).
	; A negative behind value moves the rear edge ahead of the origin.
	CMP.w #22
	BCC +
	LDA.w #30
	SEC
	SBC !cb_t2
	STA !ag_behind
+
	LDX !cb_tf
	LDA.l !ER+!er_flags,X
	AND.w #!ERF_SUPER
	BEQ +
	LDA.w #12+8
	BRA ++
+	LDA.w #8+8
++	STA !ag_width
	JSR cb_targets
	LDA !ag_list
	STA !cb_td
	STZ !cb_te
.each
	LDA !cb_td
	BNE +
	RTS
+	LSR !cb_td
	BCC .nextBit
	LDA !cb_te
	CMP.w #!VT_BIT0
	BCS .virtual
	JSR cb_slot_offset
	TAY
	LDA !cb_te
	JSR cb_bit_of
	STA !cb_t3
	LDX !cb_tf
	LDA.l !ER+!er_hits,X
	AND !cb_t3
	BNE .nextBit                  ; one contact per shot
	JSR cb_lethal_pending
	BCS .nextBit
	; only the front segment: along >= length - 14 - 16
	JSR cb_proj_along
	BRA .front
.virtual
	; a virtual target: nothing pending (custom entities), its own spot
	JSR cb_bit_of
	STA !cb_t3
	LDX !cb_tf
	LDA.l !ER+!er_hits,X
	AND !cb_t3
	BNE .nextBit
	LDA !cb_te
	JSR cb_proj_along_bit
.front
	CLC
	ADC.w #14+16
	SEC
	SBC !cb_t2
	BMI .nextBit
	LDX !cb_tf
	LDA.l !ER+!er_hits,X
	ORA !cb_t3
	STA.l !ER+!er_hits,X
	JSR cb_proj_hit
	; the shot is spent
	LDX !cb_tf
	JSR cb_fx_kill_record
	LDX !cb_tf
	JMP cb_effect_free
.nextBit
	INC !cb_te
	BRA .each

; One beam frame (record cb_tf).
cb_beam_frame:
	LDX !cb_tf
	JSR cb_proj_setup
	; length = min(range, (age+1)*speed)
	LDA !bm_speed
	STA !cb_mq
	LDA !cb_t0
	INC
	JSR cb_mul16
	LDA !cb_mq1
	CMP !bm_range
	BCC +
	LDA !bm_range
+	STA !cb_t2                    ; length
	STA !ag_range
	; half width: normal beams by charge, the full wave by age
	LDA !bm_mega
	AND.w #$00FF
	BEQ .normal
	LDA !cb_t0
	AND.w #$003F
	TAX
	LDA.l combat_mega_hw,X
	AND.w #$00FF
	STA !cb_t3                    ; floor(half width)
	CLC
	ADC.w #8
	STA !ag_width
	LDA.w #44
	STA !cb_t1                    ; taper
	BRA .geom
.normal
	LDA !bm_charge
	AND.w #$00FF
	TAX
	LDA !cb_form
	AND.w #$00FF
	BEQ +
	LDA.l combat_beam_across_ssj,X
	BRA ++
+	LDA.l combat_beam_across_base,X
++	AND.w #$00FF
	STA !ag_width                 ; floor(halfWidth + 8)
	SEC
	SBC.w #8
	STA !cb_t3                    ; floor(halfWidth)
	STZ !cb_t1
.geom
	; the map (plants, rocks, gates and switches under the beam) and the
	; drawing take the field frame's last step only: destroy_hit is once per
	; frame per attack, and the cells a beam covers only grow
	LDA !cb_steps
	AND.w #$00FF
	CMP.w #2
	BCS .catchUp
	LDA !cb_t2
	STA.l !da_len
	LDA !cb_t3
	STA.l !da_half
	LDA !cb_t1
	STA.l !da_taper
	JSR cb_beam_strength
	STA.l !da_str
	LDA !bm_id
	AND.w #$00FF
	STA.l !da_id
	LDA !bm_mega
	AND.w #$00FF
	CLC
	ADC.w #2
	JSR cb_destroy_attack
	JSR cb_beam_picture
.catchUp
	JSR cb_targets
	LDA !ag_list
	STA !cb_td
	STZ !cb_te
.each
	LDA !cb_td
	BNE +
	RTS
+	LSR !cb_td
	BCS +
	JMP .nextBit
+	LDA !cb_te
	JSR cb_bit_of
	STA !cb_bx                    ; bit
	LDA !cb_te
	CMP.w #!VT_BIT0
	BCC .actor
	JSR cb_vt_species             ; a virtual target: never an orb
	STA !cb_bslot                 ; species (until cb_proj_hit)
	BRA .pulse
.actor
	JSR cb_slot_offset
	TAY
	LDA $E180,Y
	AND.w #$00FF
	STA !cb_bslot                 ; species (until cb_proj_hit)
	; orbs: one activation per beam
	CMP.w #$0055
	BNE .pulse
	LDX !cb_tf
	LDA.l !ER+!er_hits,X
	AND !cb_bx
	BEQ .live
	JMP .nextBit
.pulse
	; the same target at most every 8 frames (6 for the wave)
	LDA !cb_te
	ASL
	TAX
	LDA.l !BP,X
	AND.w #$00FF
	CMP !cb_bslot
	BNE .live
	LDA.l !BP,X
	XBA
	AND.w #$00FF
	STA !cb_by                    ; age of the last pulse
	LDA !cb_t0
	SEC
	SBC !cb_by
	STA !cb_by                    ; frames since
	LDA !bm_mega
	AND.w #$00FF
	BEQ +
	LDA.w #6
	BRA ++
+	LDA.w #8
++	CMP !cb_by
	BEQ .live
	BCC .live
	JMP .nextBit
.live
	LDA !cb_te
	CMP.w #!VT_BIT0
	BCS .taper                    ; virtual targets have nothing pending
	JSR cb_lethal_pending
	BCC .taper
	JMP .nextBit
.taper
	; the wave's taper: across - 8 <= hw * min(1, (max(0,along)+8)/44)
	LDA !cb_t1
	BEQ .take
	LDA !cb_te
	CMP.w #!VT_BIT0
	BCS +
	JSR cb_proj_along             ; A = along, cb_t6 = across
	BRA ++
+	JSR cb_proj_along_bit
++	CMP.w #$8000
	BCC +
	LDA.w #$0000
+	CLC
	ADC.w #8
	CMP.w #44
	BCS .take                     ; full width there (checked by targets)
	STA !cb_by                    ; along + 8 (< 44)
	LDA !cb_t6
	SEC
	SBC.w #8
	BMI .take                     ; inside 8 px of the axis
	; outside when 3*(across-8)*44 > H3*(along+8)
	STA !cb_mq
	ASL
	CLC
	ADC !cb_mq                    ; *3
	STA !cb_mq
	LDA.w #44
	JSR cb_mul16
	LDA !cb_mq1
	STA !cb_m0                    ; lhs (< 2^16: across <= 88)
	LDA !cb_t0
	AND.w #$003F
	ASL
	TAX
	LDA.l combat_mega_h3,X
	STA !cb_mq
	LDA !cb_by
	JSR cb_mul16                  ; rhs in cb_mq1 (< 2^16)
	LDA !cb_m0
	CMP !cb_mq1
	BEQ .take
	BCC .take
	JMP .nextBit
.take
	; record, pulse timer and the hit
	LDX !cb_tf
	LDA.l !ER+!er_hits,X
	ORA !cb_bx
	STA.l !ER+!er_hits,X
	LDA !cb_te
	ASL
	TAX
	SEP #$20
	LDA !cb_bslot
	STA.l !BP,X
	LDA !cb_t0
	STA.l !BP+1,X
	REP #$20
	JSR cb_proj_hit
.nextBit
	INC !cb_te
	JMP .each

; ---------------------------------------------------------------------------
; transformBurst(): the first gold frame hits everything within 56 px for
; 75% of Super Saiyan strength, once; small enemies fly out radially.
cb_transform_burst:
	LDA !cb_can
	AND.w #$00FF
	BNE +
	RTS
+	LDA !cb_world
	AND.w #$00FF
	BEQ +
	RTS
+	; the ring of energy around the body
	LDA $E002
	STA !cb_t4
	LDA $E045
	AND.w #$00FF
	STA !cb_t5
	LDA $E004
	SEC
	SBC.w #16
	SEC
	SBC !cb_t5
	SEC
	SBC !goku_lift
	STA !cb_t5
	JSR cb_effect_burst
	; candidates: |x|, |y| <= 56
	LDA $E002
	STA !ag_x
	LDA $E004
	STA !ag_y
	LDA.w #$0001
	STA !ag_dir
	LDA.w #56
	STA !ag_range
	STA !ag_width
	STA !ag_behind
	STZ !ag_cy
	JSR cb_targets
	JSR cb_damage_scale
	LDA.l combat_damage_table+6,X
	STA !cb_hit_dmg
	SEP #$20
	LDA.b #$01
	STA !cb_hit_launch
	STZ !cb_burst_done
	REP #$20
	LDA !ag_list
	STA !cb_td
	STZ !cb_te
.each
	LDA !cb_td
	BNE +
	RTS
+	LSR !cb_td
	BCS +
	JMP .nextBit
+	LDA !cb_te
	CMP.w #!VT_BIT0
	BCC .actor
	JSR cb_target_xy              ; a virtual target: no orb, nothing pending
	BRA .dist
.actor
	JSR cb_slot_offset
	STA !cb_bslot
	TAX
	TXY
	; puzzle orbs need an aimed attack; lethal queues finish natively
	LDA $E180,X
	AND.w #$00FF
	CMP.w #$0055
	BNE +
	JMP .nextBit
+	JSR cb_lethal_pending
	BCC +
	JMP .nextBit
+	LDA $E002,X
	STA !cb_t4
	LDA $E004,X
	STA !cb_t5
.dist
	; distance <= 56
	LDA !cb_t4
	SEC
	SBC $E002
	STA !cb_bx
	LDA !cb_t5
	SEC
	SBC $E004
	STA !cb_by
	LDA !cb_bx
	JSR cb_abs
	STA !cb_mq
	JSR cb_mul16
	LDA !cb_mq1
	STA !cb_d2
	LDA !cb_by
	JSR cb_abs
	STA !cb_mq
	JSR cb_mul16
	LDA !cb_mq1
	CLC
	ADC !cb_d2
	STA !cb_d2                    ; x^2 + y^2 (<= 6272)
	CMP.w #56*56+1
	BCC +
	JMP .nextBit
+	; direction: (x, y) / d, or the facing when d = 0
	LDA !cb_d2
	BNE .radial
	LDA !cb_facing
	AND.w #$0003
	STA !cb_hit_dir
	STZ !cb_hit_dx
	STZ !cb_hit_dy
	BRA .hit
.radial
	JSR cb_isqrt_d2               ; cb_m9 = d (8.8)
	LDA !cb_bx
	JSR cb_radial_component
	STA !cb_hit_dx
	LDA !cb_by
	JSR cb_radial_component
	STA !cb_hit_dy
	LDA.w #$0080
	STA !cb_hit_dir
.hit
	LDA !cb_te
	CMP.w #!VT_BIT0
	BCC +
	JSR cb_vt_hit                 ; a virtual target: its own hit()
	BRA ++
+	LDX !cb_bslot
	JSR cb_hit
++	SEP #$20
	INC !cb_burst_done
	REP #$20
	JSR cb_burst_spark
.nextBit
	INC !cb_te
	JMP .each

; The burst's spark on the target at Goku + (cb_bx, cb_by), along the
; dominant axis of (x, y).
cb_burst_spark:
	LDA !cb_d2
	BNE +
	LDA !cb_facing
	AND.w #$0003
	BRA .dir
+	LDA !cb_bx
	JSR cb_abs
	STA !cb_t9
	LDA !cb_by
	JSR cb_abs
	CMP !cb_t9
	BEQ .horiz
	BCS .vert
.horiz
	LDA !cb_bx
	CMP.w #$8000
	BCS +
	LDA.w #$0001
	BRA .dir
+	LDA.w #$0002
	BRA .dir
.vert
	LDA !cb_by
	CMP.w #$8000
	BCS +
	LDA.w #$0000
	BRA .dir
+	LDA.w #$0003
.dir
	STA !cb_t8
	LDA $E002
	CLC
	ADC !cb_bx
	STA !cb_t4                    ; the target's x
	LDA $E004
	CLC
	ADC !cb_by
	SEC
	SBC.w #12
	STA !cb_t5                    ; its y - 12
	STZ !cb_t6
	LDA.w #10
	STA !cb_t7
	LDA.w #$0001
	STA !cb_t9
	JMP cb_effect_impact

; A16 = signed component c, cb_m9 = d (8.8) -> A16 = D * c / d in 8.8
; (D = launch distance of the current form), rounded.
cb_radial_component:
	STA !cb_m8                    ; sign
	JSR cb_abs
	STA !cb_mq
	LDA.w #56
	LDX.w #88
	JSR cb_by_form
	JSR cb_mul16                  ; |c| * D (< 2^13)
	; (|c| * D << 16) / d8 = |c| * D / d in 8.8
	LDA !cb_mq1
	STA !cb_m0                    ; dividend high
	STZ !cb_m1                    ; dividend low
	LDA !cb_m9
	STA !cb_m2                    ; divisor
	JSR cb_div32
	LDX !cb_m8
	CPX.w #$8000
	BCC +
	EOR.w #$FFFF
	INC
+	RTS

; cb_m0:cb_m1 / cb_m2 -> A16 = rounded quotient (requires cb_m0 < cb_m2).
cb_div32:
	STZ !cb_m3                    ; quotient
	LDY.w #16
.bit
	ASL !cb_m1
	ROL !cb_m0
	BCS .sub                      ; bit 16 set: certainly >= divisor
	LDA !cb_m0
	CMP !cb_m2
	BCC .zero
.sub
	LDA !cb_m0
	SEC
	SBC !cb_m2
	STA !cb_m0
	SEC
	ROL !cb_m3
	BRA .next
.zero
	ASL !cb_m3
.next
	DEY
	BNE .bit
	; round half up: 2 * remainder >= divisor
	LDA !cb_m0
	ASL
	BCS .up
	CMP !cb_m2
	BCC .done
.up
	INC !cb_m3
.done
	LDA !cb_m3
	RTS

; cb_m9 = floor(sqrt(cb_d2 * 65536)) = d in 8.8 (digit by digit on 32 bits).
cb_isqrt_d2:
	LDA !cb_d2
	STA !cb_m0                    ; N high
	STZ !cb_m1                    ; N low
	STZ !cb_m2                    ; res high
	STZ !cb_m3                    ; res low
	LDA.w #$4000
	STA !cb_m4                    ; bit high (2^30)
	STZ !cb_m5                    ; bit low
.loop
	; t = res + bit
	LDA !cb_m3
	CLC
	ADC !cb_m5
	STA !cb_m7
	LDA !cb_m2
	ADC !cb_m4
	STA !cb_m6
	; N >= t ?
	LDA !cb_m1
	SEC
	SBC !cb_m7
	STA !cb_m8
	LDA !cb_m0
	SBC !cb_m6
	BCC .less
	STA !cb_m0
	LDA !cb_m8
	STA !cb_m1
	; res = (res >> 1) + bit
	LSR !cb_m2
	ROR !cb_m3
	LDA !cb_m3
	CLC
	ADC !cb_m5
	STA !cb_m3
	LDA !cb_m2
	ADC !cb_m4
	STA !cb_m2
	BRA .shift
.less
	LSR !cb_m2
	ROR !cb_m3
.shift
	LSR !cb_m4
	ROR !cb_m5
	LSR !cb_m4
	ROR !cb_m5
	LDA !cb_m4
	ORA !cb_m5
	BNE .loop
	LDA !cb_m3
	STA !cb_m9
	RTS
