; Joch's trial (engine/joch-trial.js): state, intro staging, Vegeta's AI,
; attacks, damage both ways, transformation, the draw and the return.
;
; Frame order. The browser runs trial.tick() before each frame's native
; logic and draw() after it. modules_field_frame runs after the native
; logic of frame N: we draw (state after frame N's combat step), then tick
; for frame N+1, which comes before frame N+1's combat step (C0:B0AC), so
; tick, Goku's attacks (vegeta_api_hit) and draw keep the browser's order.

; ---------------------------------------------------------------------------
; Predicates (M16/X16, DB = $7E).

; C set while Goku stands in for the boy (mod.options.enabled && gokuActive).
vg_goku_on:
	LDA.l !persist_goku_active
	AND.w #$00FF
	CMP.w #$0001
	RTS

; C set when the trial is wanted: Goku active, map 72, trial stage CF3F < 6.
vg_wanted:
	JSR vg_goku_on
	BCC .no
	LDA $DC
	CMP.w #!VEGETA_CHAMBER_MAP
	BNE .no
	LDA.l $7ECF3F
	AND.w #$00FF
	CMP.w #6
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS

; A = party mask: bit0 girl ($E200 active), bit1 sprite ($E400 active).
vg_party:
	LDA.l $7EE200
	AND.w #$0001
	STA !vg_t0
	LDA.l $7EE400
	AND.w #$0001
	ASL
	ORA !vg_t0
	RTS

; C set on the field loop (native field NMI/IRQ vectors installed).
vg_native_field:
	LDA.l $000100
	CMP.w #$A85C
	BNE .no
	LDA.l $000102
	CMP.w #$00C0
	BNE .no
	LDA.l $000104
	CMP.w #$CF5C
	BNE .no
	LDA.l $000106
	CMP.w #$00C1
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; canAttack (mana-mod.js): C set when Goku is controllable on the field.
vg_can_attack:
	JSR vg_goku_on
	BCC .no16
	JSR vg_native_field
	BCC .no16
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
	LDA.l $7EE011                 ; native hurt poses
	CMP.b #$8D
	BEQ .no
	CMP.b #$8E
	BEQ .no
	REP #$20
	SEC
	RTS
.no
	REP #$20
.no16
	CLC
	RTS

; C set when the Doppelganger of slot 3 is live (active, species $2E).
vg_slot_live:
	LDA.l $7EE600
	AND.w #$0001
	BEQ .no
	LDA.l $7EE780
	AND.w #$00FF
	CMP.w #!VEGETA_SPECIES
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; canFly(x, y) of native-local-flight.js in the expanded chamber: inside
; [8, size-8] and every sample of the footprint (x-6..x+6, y-4..y+4) on a
; layer-0 floor tile (70; every other layer-0 tile of the 64x64 room is
; protected). A = x, X = y -> C set when safe. Preserves X/Y.
vg_safe:
	PHX
	PHY
	TAY                           ; Y = x, X = y
	CPY.w #8
	BCC .out
	LDA $C0
	SEC
	SBC.w #8
	STA !vg_t0
	CPY !vg_t0
	BEQ +
	BCS .out                      ; x > width - 8
+	CPX.w #8
	BCC .out
	LDA $C2
	SEC
	SBC.w #8
	STA !vg_t0
	CPX !vg_t0
	BEQ .cells
	BCC .cells                    ; y <= height - 8
.out
	PLY
	PLX
	CLC
	RTS
.cells
	; The nine samples (x-6, x, x+6) x (y-4, y, y+4) lie in at most two
	; columns and two rows of 16 px cells, and all four corners are among
	; them: the footprint is safe when those cells are floor (70). A word
	; read gives a row's two cells; the second column counts when x-6 is 4+
	; px into its cell, the second row when y-4 is 8+ px into its cell.
	TXA
	SEC
	SBC.w #4
	PHA                           ; y - 4
	AND.w #$FFF0
	ASL
	ASL
	ASL
	STA !vg_t0                    ; r0 * 128
	TYA
	SEC
	SBC.w #6
	PHA                           ; x - 6
	LSR
	LSR
	LSR
	LSR
	CLC
	ADC !vg_t0
	TAX                           ; (r0, c0)
	LDA $01,S
	AND.w #$000F
	CMP.w #4
	LDA.w #$00FF
	BCC +
	LDA.w #$FFFF
+	STA !vg_t0                    ; the columns that count
	LDA.l $7F0000,X
	EOR.w #$4646
	AND !vg_t0
	BNE .no2
	LDA $03,S
	AND.w #$000F
	CMP.w #8
	BCC .yes
	LDA.l $7F0000+128,X           ; (r1, c0)
	EOR.w #$4646
	AND !vg_t0
	BNE .no2
.yes
	PLA
	PLA
	PLY
	PLX
	SEC
	RTS
.no2
	PLA
	PLA
	PLY
	PLX
	CLC
	RTS
vg_safe_dx:
	dw -6, 0, 6, -6, 0, 6, -6, 0, 6
vg_safe_dy:
	dw -4, -4, -4, 0, 0, 0, 4, 4, 4

; ---------------------------------------------------------------------------
; modules_field_frame entry (M16/X16, DB = $7E, D = 0).
vegeta_field_frame:
	PHP
	SEP #$20
	LDA !vg_on
	CMP.b #!VG_ON
	BEQ .trial
	; no trial: nothing to do outside the chamber, unless a combat lock or
	; the music cue is still to be given back (every field frame of the
	; game runs this, keep it short)
	LDA $DD
	BNE +
	LDA $DC
	CMP.b #!VEGETA_CHAMBER_MAP
	BEQ .room
+	LDA !vg_misc
	AND.b #$03
	ORA !vg_music
	BNE .room
	PLP
	RTL
.trial
	REP #$30
if defined("VEGETA_TEST")
	SEP #$20
	LDA.b #$FF
	STA.l !vs_log_pose
	REP #$20
endif
	JSR vg_draw
.room
	REP #$30
if defined("VEGETA_TEST")
	JSR vg_test_mailbox
	SEP #$20
	LDA !vg_on
	CMP.b #!VG_ON
	REP #$20
	BNE +
	JSR vg_test_log_tick
+
endif
	JSR vg_tick
	JSR vg_locks
	JSR vg_music
	JSR vb_flight_target
	PLP
	RTL

; Combat locks from the trial state: a dangerous encounter while the battle
; runs (api.dangerous: no damage scaling for Goku), and Goku's pad during a
; clash or the draw (clashInput / api.inputLocked: draw while no event runs).
vg_locks:
	JSR vg_active
	BCS .on
	LDA.w #0
	JSR vb_danger
	SEP #$20
	LDA !vg_clash_on
	REP #$20
	BNE +
	LDA.w #0
	JSR vb_input_lock
+	RTS
.on
	SEP #$20
	LDA !vg_phase
	CMP.b #!VP_BATTLE
	REP #$20
	BEQ +
	LDA.w #0
	BRA ++
+	LDA.w #1
++	JSR vb_danger
	SEP #$20
	LDA !vg_clash_on
	BNE .lock
	LDA !vg_phase
	CMP.b #!VP_DRAW
	BNE .unlock
	LDA $D0
	BNE .unlock
	REP #$20
	LDA.w #2                      ; the draw: the last wave finishes (a hold)
	JMP vb_input_lock
.lock
	REP #$20
	LDA.w #1
	JMP vb_input_lock
.unlock
	REP #$20
	LDA.w #0
	JMP vb_input_lock

if defined("VEGETA_TEST")
; Test mailbox: !vs_dbg_cmd 1 = hit(!vs_dbg_a, flags !vs_dbg_b), as the
; browser tests call trial.hit(entity, amount) between frames.
vg_test_mailbox:
	SEP #$20
	LDA !vg_on
	CMP.b #!VG_ON
	REP #$20
	BNE .out
	LDA.l !vs_dbg_cmd
	AND.w #$00FF
	BEQ .out
	CMP.w #1
	BNE .done
	LDA.l !vs_dbg_b
	ORA.w #$0004                  ; (the log's mailbox bit)
	TAX
	LDA.l !vs_dbg_a
	JSR vg_test_log_hit           ; counts the hit in !vs_dbg_n
	STA.l !vs_s0
	TXA
	AND.w #$FFFB
	STA.l !vs_s1
	JSR vg_hit
.done
	SEP #$20
	LDA.b #0
	STA.l !vs_dbg_cmd
	REP #$20
.out
	RTS
endif

; modules_load / modules_new_game: no trial survives a load. The locks,
; the music cue and the combat window start clear (WRAM is random at
; power-on; the field frame's short path relies on them).
vegeta_reset:
	PHP
	REP #$30
	JSR vg_end
	SEP #$20
	STZ !vg_misc
	STZ !vg_music
	STZ !vg_cwin
	PLP
	RTL

; s = null: forget the trial and give back what it held.
vg_end:
	SEP #$20
	LDA !vg_on
	CMP.b #!VG_ON
	BNE .off
	STZ !vg_on
	REP #$20
	JSR vb_release_all
	RTS
.off
	STZ !vg_on
	REP #$20
	RTS

; ---------------------------------------------------------------------------
; start(introduced): A = 1 when the walk-on event introduced the trial.
vg_start:
	STA.l !vs_s0
	JSR vg_wanted
	BCS +
	RTS
+	SEP #$20
	LDA !vg_on
	CMP.b #!VG_ON
	REP #$20
	BNE .new
	LDA.l !vs_s0
	BEQ +
	SEP #$20
	LDA.b #!VF_INTRODUCED
	TSB !vg_flags
	REP #$20
+	RTS
.new
	LDA.l !vs_s0
	PHA                           ; introduced (the clear below wipes !vs_s0)
	; clear the WRAM block and the SRAM record
	LDX.w #$0000
	LDA.w #$0000
-	STA !VG,X
	INX
	INX
	CPX.w #$0030
	BCC -
	LDX.w #$0000
-	STA.l !VS,X
	INX
	INX
	CPX.w #!vs_end-!VS
	BCC -
	JSR vg_party
	SEP #$20
	STA !vg_mask
	LDA.b #!VP_INTRO
	STA !vg_phase
	REP #$20
	PLA
	SEP #$20
	BEQ +
	LDA.b #!VF_INTRODUCED
	TSB !vg_flags
+	LDA.b #$FF
	STA !vg_front
	STA !vg_back
	STA !vg_want
	STA !vg_echo_frame
	STA !vg_echo_want
	STA !vg_pal_flash
	STZ !vg_misc
	LDA.b #!VG_ON
	STA !vg_on
	REP #$20
	LDA.w #!VEGETA_HP0
	STA !vg_hp
	LDA.w #75
	STA !vg_clock
	LDA.w #90
	STA !vg_grace
	LDA.w #-1000
	STA !vg_last_melee
	LDA.w #$FFFF
	STA !vg_contact
	; lists empty
	JSR vg_clear_shots
	JSR vg_clear_rocks
	LDX.w #(!VS_BURSTS-1)*6
-	LDA.w #$FFFF
	STA.l !vs_bursts+4,X
	TXA
	SEC
	SBC.w #6
	TAX
	BPL -
	LDX.w #(!VS_ECHOES-1)*8
-	LDA.w #$FFFF
	STA.l !vs_echoes+4,X
	TXA
	SEC
	SBC.w #8
	TAX
	BPL -
	JSR vg_clash_clear
	RTS

vg_clear_shots:
	SEP #$20
	LDA.b #$00
	STA.l !vs_live_shots
	LDX.w #(!VS_SHOTS-1)*8
-	LDA.b #$FF
	STA.l !vs_shots+7,X
	REP #$20
	TXA
	SEC
	SBC.w #8
	TAX
	SEP #$20
	BPL -
	REP #$20
	RTS

vg_clear_rocks:
	SEP #$20
	LDA.b #$00
	STA.l !vs_live_rocks
	REP #$20
	LDX.w #(!VS_ROCKS-1)*6
-	LDA.w #$FFFF
	STA.l !vs_rocks+4,X
	TXA
	SEC
	SBC.w #6
	TAX
	BPL -
	RTS

; Story hook TRIAL_START (entering 3DB): start(true). Inside the event
; interpreter: short, no events. M16/X16, DB = $7E, D = 0.
vegeta_story_trial_start:
	PHP
	REP #$30
	LDA.w #$0001
	JSR vg_start
	PLP
	RTL

; Story queries: TRIAL_ACTIVE (api.active) and TRIAL_PARTY (s.mask).
vegeta_q_trial_active:
	PHP
	REP #$30
	JSR vg_active
	LDA.w #$0000
	ROL
	PLP
	RTL
vegeta_q_trial_party:
	PHP
	REP #$30
	SEP #$20
	LDA !vg_on
	CMP.b #!VG_ON
	REP #$20
	BNE .none
	LDA !vg_mask
	AND.w #$00FF
	PLP
	RTL
.none
	LDA.w #$0000
	PLP
	RTL

; api.active: C set when s exists and the trial is wanted.
vg_active:
	SEP #$20
	LDA !vg_on
	CMP.b #!VG_ON
	REP #$20
	BNE .no
	JMP vg_wanted
.no
	CLC
	RTS

; ---------------------------------------------------------------------------
; tick()
vg_tick:
	JSR vg_goku_on
	BCS +
	RTS
+	JSR vg_wanted
	BCS .wanted
	; Keep the saved lineup until native ADD_CHARACTER has completed on
	; return. It owns graphics, names and the original trial heal.
	SEP #$20
	LDA !vg_on
	CMP.b #!VG_ON
	REP #$20
	BNE .ret
	LDA $DC
	CMP.w #!VEGETA_CHAMBER_MAP
	BEQ .ret
	JSR vg_can_attack
	BCC .ret
	JSR vg_party
	AND !vg_mask
	AND.w #$0003
	STA !vg_t0
	LDA !vg_mask
	AND.w #$0003
	CMP !vg_t0
	BNE .ret
	JSR vg_end
.ret
	RTS
.wanted
	SEP #$20
	LDA !vg_on
	CMP.b #!VG_ON
	REP #$20
	BEQ .have
	JSR vg_slot_live
	BCC .ret
	LDA.w #$0000
	JSR vg_start
	SEP #$20
	LDA !vg_on
	CMP.b #!VG_ON
	REP #$20
	BNE .ret
.have
	LDA !vg_flags
	AND.w #!VF_SPAWNED
	BNE .spawned
	JSR vg_slot_live
	BCC .ret
	; spawn: take the Doppelganger's position and terrain
	SEP #$20
	LDA.b #!VF_SPAWNED
	TSB !vg_flags
	LDA.l $7EE60B
	STA !vg_terrain
	LDA.l $7EE791
	AND.b #$7F
	STA.l $7EE791
	REP #$20
	LDA.l $7EE602
	STA !vg_x
	LDA.l $7EE604
	STA !vg_y
	LDA.w #!VEGETA_HP0
	STA.l $7EE784
	STA.l $7EE782
.spawned
	SEP #$20
	LDA !vg_phase
	CMP.b #!VP_INTRO
	REP #$20
	BNE +
	JSR vg_stage_intro
+	JSR vg_suppress_clones
	LDA !vg_x
	STA.l $7EE602
	LDA !vg_y
	STA.l $7EE604
	SEP #$20
	LDA !vg_terrain
	STA.l $7EE60B
	REP #$20
	; Rings, native dialogue, fades and death own time.
	JSR vg_native_field
	BCC .ret2
	SEP #$20
	LDA $D0
	BNE .ret8
	LDA $EC
	AND.b #$FE
	BNE .ret8
	LDA $FF
	BNE .ret8
	LDA.l $7EE191
	BMI .ret8
	LDA $E6
	BMI .ret8                     ; forced blank
	REP #$20
	LDA.l $7EE182
	BEQ .ret2
	; A checkpoint/warp can skip the door's walk-on event.
	SEP #$20
	LDA !vg_phase
	CMP.b #!VP_INTRO
	REP #$20
	BNE .battle
	LDA !vg_flags
	AND.w #!VF_INTRODUCED
	BNE +
	LDA.w #$03DB
	LDX.w #$0000
	JSL story_api_request
	RTS
+	LDA !vg_flags
	AND.w #!VF_COMPLETE
	BEQ .ret2
	SEP #$20
	LDA.b #!VP_BATTLE
	STA !vg_phase
	REP #$20
.battle
	JMP vg_tick_live
.ret8
	REP #$20
.ret2
	RTS

; Intro staging (every tick, also during the walk-on event): Vegeta beside
; Goku, black until the walk and camera have been still for 12 frames, then
; the native brightness ramp; Goku faces the camera in base form.
vg_stage_intro:
	LDX.w #0
.try
	LDA.l $7EE002
	CLC
	ADC.l vg_stage_dx,X
	STA.l !vs_s0
	LDA.l $7EE004
	CLC
	ADC.l vg_stage_dy,X
	STA.l !vs_s1
	PHX
	TAX
	LDA.l !vs_s0
	JSR vg_safe
	PLX
	BCS .found
	INX
	INX
	CPX.w #8
	BCC .try
	BRA .placed
.found
	LDA.l !vs_s0
	STA !vg_x
	LDA.l !vs_s1
	STA !vg_y
.placed
	JSR vg_face_hero
	; entrance
	LDA !vg_flags
	AND.w #!VF_REVEALED
	BEQ .notrevealed
	SEP #$20
	LDA $E2
	AND.b #$01
	BNE +
	LDA $E6
	CMP.b #15
	BNE +
	LDA.b #$01
	STA $E4
	STA $E5
	LDA.b #!VF_COMPLETE
	TSB !vg_flags
+	REP #$20
	JMP .goku
.notrevealed
	SEP #$20
	LDA $E6
	REP #$20
	BPL +
	JMP .done
+
	; view = [hero x, hero y, $A8, $AA]; still = same as last frame
	LDA.l !vs_view_ok
	AND.w #$00FF
	BEQ .moved
	LDA.l $7EE002
	CMP.l !vs_view
	BNE .moved
	LDA.l $7EE004
	CMP.l !vs_view+2
	BNE .moved
	LDA $A8
	CMP.l !vs_view+4
	BNE .moved
	LDA $AA
	CMP.l !vs_view+6
	BNE .moved
	SEP #$20
	LDA.l !vs_stable
	INC
	STA.l !vs_stable
	REP #$20
	BRA .viewed
.moved
	SEP #$20
	LDA.b #$00
	STA.l !vs_stable
	REP #$20
.viewed
	LDA.l $7EE002
	STA.l !vs_view
	LDA.l $7EE004
	STA.l !vs_view+2
	LDA $A8
	STA.l !vs_view+4
	LDA $AA
	STA.l !vs_view+6
	SEP #$20
	LDA.b #$01
	STA.l !vs_view_ok
	LDA.l !vs_stable
	CMP.b #12
	BCC .black
	LDA !vg_flags
	AND.b #!VF_INTRODUCED
	BEQ .black
	; reveal: a one-second native brightness ramp
	LDA.b #!VF_REVEALED
	TSB !vg_flags
	LDA.b #36
	STA !vg_arrival
	LDA.b #15
	STA $E7
	LDA.b #$01
	STA $E4
	LDA.b #$04
	STA $E5
	LDA.b #$01
	TSB $E2
	REP #$20
	BRA .goku
.black
	STZ $E6
	STZ $E7
	LDA.b #$01
	STA $E4
	STA $E5
	TRB $E2
	REP #$20
	RTS
.goku
	; Reveal Goku facing the camera in base form.
	JSR vb_goku_ssj
	BCC +
	JSR vb_set_base_form
+	SEP #$20
	LDA.b #$01
	STA.l $7EE010
	REP #$20
.done
	RTS
vg_stage_dx:
	dw 56, -56, 32, -32
vg_stage_dy:
	dw 0, 0, 16, 16

; facing = face(hero - s)
vg_face_hero:
	LDA.l $7EE004
	SEC
	SBC !vg_y
	TAX
	LDA.l $7EE002
	SEC
	SBC !vg_x
	JSR vg_face
	SEP #$20
	STA !vg_facing
	REP #$20
	RTS

; Clones stay inactive; slot 3 keeps Vegeta's position for other systems.
vg_suppress_clones:
	SEP #$20
	LDA.l $7EE600
	AND.b #$FE
	STA.l $7EE600
	LDA.l $7EE800
	AND.b #$FE
	STA.l $7EE800
	LDA.l $7EEA00
	AND.b #$FE
	STA.l $7EEA00
	LDA.l $7EE991
	ORA.b #$80
	STA.l $7EE991
	LDA.l $7EEB91
	ORA.b #$80
	STA.l $7EEB91
	REP #$20
	LDA.w #$0000
	STA.l $7EE7F1
	STA.l $7EE9F1
	STA.l $7EEBF1
	STA.l $7EE982
	STA.l $7EEB82
	RTS
