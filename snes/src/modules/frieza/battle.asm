; Ground fight (frieza.js startBattle / tick battle branch / draw battle
; branch, frieza-combat.js). Boss state lives in WRAM after the scene block.

!fzf_x          = !FZ+$58   ; word: map x
!fzf_y          = !FZ+$5A   ; word: map y (feet are y + 12)
!fzf_hp_lo      = !FZ+$5C   ; word: HP (24-bit: lo word, hi byte)
!fzf_hp_hi      = !FZ+$5E   ; word
!fzf_age        = !FZ+$60   ; word
!fzf_clock      = !FZ+$62   ; word: frames to the next attack
!fzf_cycle      = !FZ+$64   ; byte: attack pattern index
!fzf_node       = !FZ+$65   ; byte: current node
!fzf_nodes      = !FZ+$66   ; byte: node count (<= 6)
!fzf_tier       = !FZ+$67   ; byte: 0, 1 after the first surge
!fzf_stun       = !FZ+$68   ; byte
!fzf_grace      = !FZ+$69   ; byte
!fzf_hurt       = !FZ+$6A   ; byte
!fzf_recoil     = !FZ+$6B   ; byte
!fzf_guard      = !FZ+$6C   ; byte
!fzf_dash       = !FZ+$6D   ; byte
!fzf_windup     = !FZ+$6E   ; byte
!fzf_flags      = !FZ+$6F   ; byte: !FBF_*
!fzf_terrain    = !FZ+$70   ; word: Goku's terrain byte at the start ($E00B)
!fzf_node_x     = !FZ+$72   ; 6 words
!fzf_node_y     = !FZ+$7E   ; 6 words
!FZF_END        = !FZ+$8A
assert !FZF_END <= !FZ+$C0, "frieza WRAM overflow"

!FZFF_ACTIVE    = $01       ; s.boss exists
!FZFF_MUSCULAR  = $02
!FZFF_COUNTER   = $04
!FZFF_SPACE     = $08       ; the orbit stream owns the fight (b.space)

!FRIEZA_HP_LO  = 96000&$FFFF
!FRIEZA_HP_HI  = 96000>>16

fz_battle_reset:
	SEP #$20
	STZ !fzf_flags
	REP #$20
	LDA.w #$0000
	STA !fz_atlas
	RTS

; C set while a power surge holds the fight (inputLocked).
fz_battle_surging:
	CLC
	RTS

; C set while the fight is in space (the orbit stream's).
fz_battle_space:
	LDA !fzf_flags
	AND.w #!FZFF_SPACE
	BEQ +
	SEC
	RTS
+	CLC
	RTS

; startBattle(): carry the court pose into combat, nodes around Goku.
fz_start_battle:
	; the arrival pose of the court scene (before the scene is cleared)
	STZ !fz_t0
	JSR fz_scene_kind
	BEQ .nocourt
	LDA !fz_sflags
	AND.w #!FZSF_COURT
	BEQ .nocourt
	JSR fz_scene_pose
	LDA !fz_px
	CLC
	ADC !fz_cam_x
	STA !fz_t1                        ; arrival x (map)
	LDA !fz_py
	CLC
	ADC !fz_cam_y
	SEC
	SBC.w #8
	STA !fz_t2                        ; arrival y - 8
	INC !fz_t0
.nocourt
	LDA.w #!FZST_BATTLE
	JSR fz_set_stage
	JSR fz_scene_clear
	; nodes: h + (-60,-50), (60,-50), (60,30), (-60,30), (0,-30); h.y = feet - 12
	SEP #$20
	STZ !fzf_nodes
	REP #$20
	LDA !fz_t0
	BEQ +
	LDA !fz_t1
	STA !fzf_node_x
	LDA !fz_t2
	STA !fzf_node_y
	SEP #$20
	INC !fzf_nodes
	REP #$20
+	JSR fz_start_nodes
	; the boss
	LDA !fzf_node_x
	STA !fzf_x
	LDA !fzf_node_y
	STA !fzf_y
	LDA.w #!FRIEZA_HP_LO
	STA !fzf_hp_lo
	LDA.w #!FRIEZA_HP_HI
	STA !fzf_hp_hi
	STZ !fzf_age
	LDA.w #90
	STA !fzf_clock
	LDA $E00B
	AND.w #$00FF
	STA !fzf_terrain
	SEP #$20
	STZ !fzf_cycle
	STZ !fzf_node
	STZ !fzf_tier
	STZ !fzf_stun
	LDA.b #60
	STA !fzf_grace
	STZ !fzf_hurt
	STZ !fzf_recoil
	STZ !fzf_guard
	STZ !fzf_dash
	STZ !fzf_windup
	LDA.b #!FZFF_ACTIVE
	STA !fzf_flags
	REP #$20
	STZ !fz_atlas
	LDA.w #!FZW_CANCEL
	TSB !fz_pend
	RTS

; Append the five patrol nodes around Goku (frieza.js filters them with
; local flight's canLand; without that service every node is kept).
fz_start_nodes:
	STZ !fz_t3                        ; offset table index (bytes)
.loop
	LDX !fz_t3
	LDA $E002
	CLC
	ADC.l fz_node_dx,X
	STA !fz_t5                        ; node x
	LDA $E004
	SEC
	SBC.w #12
	CLC
	ADC.l fz_node_dy,X
	STA !fz_t4                        ; node y
	CLC
	ADC.w #12
	STA !fz_t6                        ; its feet
	JSR fz_bind_can_land              ; C set: walkable floor
	BCC .skip
	LDA !fzf_nodes
	AND.w #$00FF
	ASL
	TAX
	LDA !fz_t5
	STA !fzf_node_x,X
	LDA !fz_t4
	STA !fzf_node_y,X
	SEP #$20
	INC !fzf_nodes
	REP #$20
.skip
	LDA !fz_t3
	INC
	INC
	STA !fz_t3
	CMP.w #10
	BCC .loop
	LDA !fzf_nodes
	AND.w #$00FF
	BNE .done
	; none: one above Goku
	LDA $E002
	STA !fzf_node_x
	LDA $E004
	SEC
	SBC.w #36
	STA !fzf_node_y
	SEP #$20
	INC !fzf_nodes
	REP #$20
.done
	RTS
fz_node_dx:
	dw -60,60,60,-60,0
fz_node_dy:
	dw -50,-50,30,30,-30

; Per-frame battle logic (frieza.js tick(), stage battle on map 246).
fz_battle_tick:
	LDA !fzf_flags
	AND.w #!FZFF_ACTIVE
	BEQ .out
	JSR fz_stage
	CMP.w #!FZST_BATTLE
	BNE .out
	LDA $DC
	CMP.w #246
	BNE .out
	INC !fzf_age
.out
	RTS

; Frieza on the deck (frieza.js draw(), battle branch).
fz_battle_draw:
	LDA !fzf_flags
	AND.w #!FZFF_ACTIVE|!FZFF_SPACE
	CMP.w #!FZFF_ACTIVE
	BNE .out
	JSR fz_stage
	CMP.w #!FZST_BATTLE
	BNE .out
	LDA $DC
	CMP.w #246
	BNE .out
	JSR fz_camera
	; idle: frame floor(age / 16) % 2 (4 once enraged), facing Goku
	LDA !fzf_age
	LSR
	LSR
	LSR
	LSR
	AND.w #$0001
	STA !fz_t0
	LDA !fzf_tier
	AND.w #$00FF
	BEQ +
	LDA.w #4
	STA !fz_t0
+	LDA !fz_t0
	ORA !fz_atlas
	STA !fz_spr_id
	LDA !fzf_x
	SEC
	SBC !fz_cam_x
	STA !fz_spr_x
	LDA !fzf_y
	CLC
	ADC.w #8
	SEC
	SBC !fz_cam_y
	STA !fz_spr_y
	STZ !fz_spr_fl
	LDA !fzf_x
	CMP $E002
	BCS +
	LDA.w #!FZD_FLIP                  ; face = b.x < h.x
	STA !fz_spr_fl
+	JSR fz_spr_draw
.out
	RTS
