; Core dispatch entries: the field frame (frieza.js tick() + draw()), the
; field vblank, saves/loads and new games.

; modules_field_frame: after the game's logic and OAM build. M16/X16,
; DB = $7E, D = 0.
frieza_field_frame:
	; quiet fast path (about a third of a scanline): nothing of Frieza's
	; runs until a hook, a map change, a query's guard or Goku's arrival
	; wakes the module (fz_try_quiet)
	LDA !fz_wasidle
	LSR                               ; C: quiet
	BCC .busy
	AND.w #!FZI_PERM>>1
	BEQ +
	JSR fz_quiet_perm
+	LDA $DC
	CMP !fz_lastmap
	BNE .busy
	LDA $F4                           ; the NMI frame counter: a slot every 4th
	AND.w #$0003
	BEQ +
	RTL
+	JMP fz_quiet_slot
.busy
	; an ending scene owns the picture and all of the scene SRAM
	; ($32:6000-7FFF): Frieza's state there is gone
	JSR fz_bind_ending_active
	BCC +
	SEP #$20
	LDA.b #!FZI_SRAM
	TRB !fz_wasidle
	REP #$20
+	; the first field frame of a session that did not come through the
	; load or new-game hooks (title attract, imported states): settle the
	; block and forget whatever the per-visit WRAM held
	LDA !fz_init
	AND.w #$00FF
	CMP.w #$00A5
	BEQ +
	JSR fz_guard
	JSR fz_reset_transient
	SEP #$20
	LDA.b #$A5
	STA !fz_init
	REP #$20
+	; leaving an idle stretch: loads and fades may have rewritten VRAM
	LDA !fz_wasidle
	AND.w #!FZI_IDLE
	BEQ +
	SEP #$20
	LDA.b #!FZI_IDLE
	TRB !fz_wasidle
	REP #$20
	JSR fz_spr_invalidate
+	JSR fz_spr_begin
	JSR fz_session
	JSR fz_on
	BCS +
	JSR fz_danger_tick                ; Goku off: only a danger bit to drop
	JSR fz_vram_settle
	JMP fz_try_quiet
+	JSR fz_danger_tick
	JSR fz_bind_ending_active
	BCC .notEnding
	; during an ending only what lives outside the scene SRAM runs
	JSR fz_scene_free
	JSR fz_apply_pending
	JSR fz_story_permanent
	JSR fz_death_tick
	JSR fz_lock_tick
	JSR fz_vram_settle
	JMP fz_try_quiet
.notEnding
	JSR fz_scene_sram                 ; C set: the scene SRAM is Frieza's this frame
	BCS .own
	; nothing of Frieza's there (or another set piece holds it): story-level
	; work only
	JSR fz_apply_pending
	JSR fz_quake_tick
	JSR fz_story_tick
	JSR fz_death_tick
	JSR fz_lock_tick
	JSR fz_vram_settle
	JSR fz_music_tick
	JMP fz_try_quiet
.own
	JSR fz_apply_pending
	JSR fz_quake_tick
	JSR fz_story_tick
	JSR fz_scene_tick
	JSR fz_scene_camera
	JSR fz_battle_tick
	JSR fz_collapse_tick
	JSR fz_beast_tick
	JSR fz_death_tick
	JSR fz_won_tick
	JSR fz_lock_tick
	; Mode 7 arenas (Beast, Fortress bosses) have no Frieza sprites; an
	; ending scene owns the picture
	LDA $29
	AND.w #$0004
	BNE .notdrawn
	JSR fz_bind_ending_active
	BCS .notdrawn
	JSR fz_draw_scene
	JSR fz_scene_effects
	JSR fz_tree_frame
	JSR fz_lb_tick
	JSR fz_battle_draw
	JSR fz_won_draw
	JSR fz_holes_frame
.notdrawn
	JSR fz_balls_tick
	JSR fz_vram_settle
	JSR fz_music_tick
	JMP fz_try_quiet

; End of a busy frame (JMP, ends in RTL): when nothing of Frieza's runs, the
; next frames take the quiet path. Cached for it: Goku's presence (his
; arrival wakes the module), the permanent form's upkeep and Dryad's pending
; hint. The Dark Lich (species 121) fights only on map 246, which is always
; busy, so quiet frames do not look for him.
fz_try_quiet:
	LDA !fz_init
	AND.w #$F8FF
	CMP.w #$00A5
	BNE .stay
	LDA !fz_pend
	ORA !fz_scene
	BEQ +
.stay
	RTL
+	SEP #$20
	LDA !fz_music
	ORA !fz_quake
	ORA !fzd_on
	REP #$20
	BNE .no
	LDA !fzl_base
	INC                               ; $FFFF: no Dark Lich tracked
	BNE .no
	LDA !fz_wasidle                   ; the Balls' VRAM region to give back
	AND.w #!FZI_BALLS
	BNE .no
	LDA !fz_mapflag
	AND.w #$00FF
	BNE .no
	LDA.l !persist_goku_active
	AND.w #$00FF
	BEQ .away
	LDA.l !fzp_stage
	AND.w #$00FF
	BEQ +
	CMP.w #!FZST_DEFEATED
	BNE .no
+	LDA.w #!FZI_IDLE|!FZI_GOKU
	STA !fz_t0
	LDA.w #!FZFL_PERMANENT
	JSR fz_flag
	BEQ +
	LDA.w #!FZI_PERM
	TSB !fz_t0
+	LDA.w #!FZFL_HINTED
	JSR fz_flag
	BNE .set
	LDA.w #!FZI_HINT
	TSB !fz_t0
	BRA .set
.away
	LDA.w #!FZI_IDLE                  ; Goku has not arrived: nothing runs
	STA !fz_t0
.set
	SEP #$20
	LDA !fz_wasidle
	AND.b #~(!FZI_GOKU|!FZI_PERM|!FZI_HINT)
	ORA !fz_t0
	STA !fz_wasidle
	STZ !fz_tflags                    ; (quiet requires them clear: the fast path compares the word)
	REP #$20
.no
	RTL

; Quiet frames: the permanent form back whenever Goku lost it.
fz_quiet_perm:
	LDA.l !goku_form|$7E0000
	AND.w #$00FF
	BNE +
	JMP fz_story_permanent
+	RTS

; Every 4th quiet frame (JMP, ends in RTL): the state checked again (hooks,
; cues and the guard wake the module themselves; this is the safety net),
; then Goku's arrival (every 16 frames) or Dryad's hint (every 64).
fz_quiet_slot:
	LDA !fz_init                      ; $A5 settled, transient flags all clear
	EOR.w #$00A5
	ORA !fz_pend
	ORA !fz_scene                     ; scene kind and its flags
	BNE .wake
	LDA $F4
	AND.w #$000C
	BEQ .goku
	CMP.w #$0004
	BEQ .hint
	RTL
.goku
	LDA.l !persist_goku_active
	AND.w #$00FF
	BEQ +
	LDA.w #!FZI_GOKU
+	EOR !fz_wasidle
	AND.w #!FZI_GOKU
	BNE .wake
	RTL
.hint
	LDA $F4
	AND.w #$0030
	BNE .out
	LDA !fz_wasidle
	AND.w #!FZI_HINT
	BEQ .out
	JSR fz_story_hint_now             ; (speaking sets a flag: that wakes the module)
	RTL
.out
	RTL
.wake
	SEP #$20
	LDA.b #!FZI_IDLE
	TRB !fz_wasidle
	REP #$20
	RTL

; modules_field_nmi: in vblank after the game's uploads (DB = $80).
frieza_field_nmi:
	LDA.l $7E0000|!fz_wasidle         ; high byte !fz_vista: N = !FZV_NMI, the frame
	BMI +                             ; asked for vblank work (fz_vram_settle)
	RTL
+	JSR fz_balls_nmi
	JSR fz_spr_nmi
	JSR fz_won_nmi
	JSR fz_tree_nmi
	JSR fz_holes_nmi
	; quiet frames rebuild no requests: this vblank was their last
	LDA.l $7E0000|!fz_wasidle
	AND.w #!FZI_IDLE
	BEQ +
	SEP #$20
	LDA.b #0
	STA.l $7E0000|!fz_vista
	REP #$20
+	RTL

; modules_title_boot: the scene SRAM block is battery backed (and random at
; power-on): forget every Frieza scene's state there.
frieza_title_boot:
	LDA.w #$0000
	LDX.w #$01FE
-	STA.l !FZSB,X
	DEX
	DEX
	BPL -
	LDX.w #$000E
-	STA.l !FZHB,X
	STA.l !FZHB+$680,X
	STA.l !FZHB+$690,X
	DEX
	DEX
	BPL -
	RTL

; inputLocked: a surge or the won beat owns the pad (mana-mod.js zeroes the
; whole pad); combat is held through its input lock.
fz_lock_tick:
	JSR fz_input_locked
	BCC .free
	LDA.w #$FFFF
	STA.l !core_pad_mask              ; every button hidden
	LDA !fz_tflags
	AND.w #!FZT_LOCKED
	BNE .out
	SEP #$20
	LDA.b #!FZT_LOCKED
	TSB !fz_tflags
	REP #$20
	JMP fz_bind_input_lock
.free
	LDA !fz_tflags
	AND.w #!FZT_LOCKED
	BEQ .out
	SEP #$20
	LDA.b #!FZT_LOCKED
	TRB !fz_tflags
	REP #$20
	JMP fz_bind_input_unlock
.out
	RTS

; Dangerous encounters (native-hit-recovery.js dangerous()): the Frieza
; fight (stage battle or won), the fed Beast before its defeat on map 253,
; the empowered Dark Lich alive on his map. Combat then keeps the native
; damage and deflects nothing; told every frame (two stores).
fz_danger_tick:
	JSR fz_dangerous
	BCC .safe
	LDA !fz_tflags
	AND.w #!FZT_DANGER
	BNE .out
	SEP #$20
	LDA.b #!FZT_DANGER
	TSB !fz_tflags
	REP #$20
	JMP fz_bind_danger
.safe
	LDA !fz_tflags
	AND.w #!FZT_DANGER
	BEQ .out
	SEP #$20
	LDA.b #!FZT_DANGER
	TRB !fz_tflags
	REP #$20
	JMP fz_bind_safe
.out
	RTS

; C set while the encounter is dangerous.
fz_dangerous:
	JSR fz_on
	BCC .no
	JSR fz_stage
	CMP.w #!FZST_BATTLE
	BEQ .yes
	CMP.w #!FZST_WON
	BEQ .yes
	LDA $DC
	CMP.w #253
	BNE .lich
	LDA.l !fzp_beast
	AND.w #!FZX_FED|!FZX_WON
	CMP.w #!FZX_FED
	BEQ .yes
.lich
	LDA !fzl_base
	CMP.w #$FFFF
	BEQ .no
	LDA $DC
	CMP !fzl_map
	BNE .no
	LDX !fzl_base
	LDA $E182,X
	BEQ .no
	LDA $E191,X
	AND.w #$0080
	BNE .no
.yes
	SEC
	RTS
.no
	CLC
	RTS

; Session bookkeeping: VRAM residency survives only an unbroken run of field
; frames on one map with the picture on; map changes reset the per-room
; state (frieza.js tick(): s.lastMap, s.offered, scenes of other maps).
fz_session:
	LDA.l !core_tick
	DEC
	CMP !fz_lasttick
	BEQ +
	JSR fz_spr_invalidate             ; frames passed without us: a load
	JSR fz_vista_invalidate
+	LDA.l !core_tick
	STA !fz_lasttick
	; picture off (forced blank or brightness 0): loads may rewrite VRAM
	SEP #$20
	LDA $E6
	BMI .blank
	AND.b #$0F
	BNE .lit
.blank
	LDA.b #!FZT_FORCED
	TSB !fz_tflags
	REP #$20
	JSR fz_spr_invalidate
	JSR fz_vista_invalidate
	BRA .map
.lit
	LDA.b #!FZT_FORCED
	TRB !fz_tflags
	REP #$20
.map
	LDA $DC
	CMP !fz_lastmap
	BEQ .same
	STA !fz_lastmap
	JSR fz_frieza_map
	SEP #$20
	STA !fz_mapflag
	REP #$20
	JSR fz_vista_invalidate           ; a new map's tiles: the vista uploads again
	JSR fz_spr_invalidate
	LDA.l !core_frame
	STA !fz_room_since
	LDA.w #!FZFL_OFFERED
	JSR fz_clear
	JSR fz_scene_kind
	BEQ .same
	CMP.w #!FZS_TREE_RETURN
	BEQ .same
	LDA !fz_smap
	CMP $DC
	BEQ .same
	JSR fz_scene_clear
.same
	RTS

; A16 = 1 when map $DC is one of Frieza's (arena 246, the Beast 253, the
; altar 431, Rider III 419, the deck 195, the Tree 236), else 0.
fz_frieza_map:
	LDA $DC
	CMP.w #246
	BEQ .yes
	CMP.w #253
	BEQ .yes
	CMP.w #431
	BEQ .yes
	CMP.w #419
	BEQ .yes
	CMP.w #195
	BEQ .yes
	CMP.w #236
	BEQ .yes
	CMP.w #255                        ; the deck (its collapse)
	BEQ .yes
	LDA.w #$0000
	RTS
.yes
	LDA.w #$0001
	RTS

; Deferred hook work (hooks run inside the event dispatcher).
fz_apply_pending:
	LDA !fz_pend
	BNE +
	RTS
+	STZ !fz_pend
	STA !fz_t0
	AND.w #!FZW_CANCEL
	BEQ +
	JSR fz_bind_cancel_combat
+	LDA !fz_t0
	AND.w #!FZW_FADE
	BEQ +
	; C0:8B16's ordinary 60-frame fade; CF4E then exposes Dark Lich
	SEP #$20
	STZ $E7
	LDA.b #$01
	STA $E4
	LDA.b #$04
	STA $E5
	LDA $E2
	ORA.b #$01
	STA $E2
	REP #$20
+	LDA !fz_t0
	AND.w #!FZW_POPOI
	BEQ +
	JSR fz_popoi_descriptor
+	LDA !fz_t0
	AND.w #!FZW_FORM_BASE
	BEQ +
	JSR fz_form_base
+	LDA !fz_t0
	AND.w #!FZW_FORM_SSJ
	BEQ +
	JSR fz_form_permanent
+	LDA !fz_t0
	AND.w #!FZW_REVIVE
	BEQ +
	JSR fz_revive_party
+	RTS

; An unrecruited Popoi has no actor graphics descriptor yet: mirror
; C1:DFD3's setup (the ROM's 16 bytes at D0:0820) before the native
; ADD_CHARACTER of the showdown animates him.
fz_popoi_descriptor:
	LDX.w #$000E
-	LDA.l $D00820,X
	STA $E470,X
	DEX
	DEX
	BPL -
	LDA $E477
	STA $E465
	LDA $E470
	AND.w #$03FF
	ASL
	ASL
	ASL
	ASL
	ASL
	ASL
	STA $E480
	LDA $E471
	LSR
	LSR
	AND.w #$0007
	CLC
	ADC.w #$00D5
	SEP #$20
	STA $E482
	REP #$20
	RTS

; Showdown: back to base form (the permanent form is earned again).
fz_form_base:
	LDA.l !goku_form|$7E0000
	AND.w #$00FF
	BEQ +
	LDA.w #!FZ_SFX_REVERT
	JSR fz_sfx
+	SEP #$20
	LDA.b #$00
	STA.l !persist_ssj_lock
	REP #$20
	LDA.w #$0000
	JMP fz_bind_set_form

; Gold: the permanent Super Saiyan form (core's !persist_ssj_lock).
fz_form_permanent:
	SEP #$20
	LDA.b #$01
	STA.l !persist_ssj_lock
	REP #$20
	JSR fz_bind_power_intro_shown
	LDA.w #$0001
	JMP fz_bind_set_form

; The wish revives the companions who were members: full health, no status
; (frieza.js revive(); the browser also restores a stat snapshot taken at
; the showdown, which the save block has no room for, see frieza.md).
fz_revive_party:
	LDA.w #!FZFL_PRIMM
	JSR fz_flag
	BEQ +
	LDA $E384
	STA $E382
	STZ $E390
+	LDA.w #!FZFL_POPOI
	JSR fz_flag
	BEQ +
	LDA $E584
	STA $E582
	STZ $E590
+	RTS

; The permanent Super Saiyan form holds outside the endings that relax it.
fz_story_permanent:
	LDA.w #!FZFL_PERMANENT
	JSR fz_flag
	BEQ .out
	LDA !fzd_on                       ; a finale death reverts him
	AND.w #$00FF
	BNE .out
	JSR fz_bind_ending_relaxed
	BCS .out
	LDA.l !goku_form|$7E0000
	AND.w #$00FF
	BNE .out
	LDA.w #$0001
	JMP fz_bind_set_form
.out
	RTS

; Dryad's invitation, once: eligible() (pendingEntrance && (all seven
; seeds || CFAF >= 2)), looked at every eighth frame (the radio line comes
; at most 7 frames after the browser's).
fz_story_hint:
	LDA.l !core_frame
	AND.w #$0007
	BEQ fz_story_hint_now
	RTS
fz_story_hint_now:
	LDA.w #!FZFL_HINTED
	JSR fz_flag
	BNE .out
	; pendingEntrance's cheap parts first: the quest query costs lines
	JSR fz_stage
	BNE .out
	LDX.w #$004E
	JSR fz_cf
	CMP.w #9
	BCS .out
	LDX.w #$00AF
	JSR fz_cf
	CMP.w #2
	BCS +
	JSR fz_quest
	XBA
	AND.w #$007F
	CMP.w #$007F
	BNE .out
+	JSR fz_pending_entrance
	BCC .out
	LDA.w #!FZFL_HINTED
	JSR fz_set
	JMP fz_bind_hint
.out
	RTS

; Story-level per-frame work (tick() before the scene branch).
fz_story_tick:
	JSR fz_story_permanent
	; establishing cues while the new map's picture is not up: forced blank,
	; or (the Tree) the first two field frames on the map
	LDA !fz_tflags
	AND.w #!FZT_FORCED
	BNE +
	LDA $DC
	CMP.w #236
	BNE .hint
	JSR fz_scene_kind
	BNE .hint
	LDA.l !core_frame
	SEC
	SBC !fz_room_since
	CMP.w #2
	BCC .tree
	BRA .hint
+	JSR fz_scene_kind
	BNE .hint
	LDA $DC
	CMP.w #236
	BNE +
.tree
	JSR fz_needs_tree
	BCC .hint
	LDA.w #!FZS_TREE_ESTABLISH
	JSR fz_cue
	BRA .hint
+	CMP.w #195
	BNE .hint
	LDA.w #!FZFL_OUTDOOR
	JSR fz_flag
	BEQ .hint
	LDA.w #!FZS_CORE_ARRIVAL
	JSR fz_cue
.hint
	JSR fz_story_hint
.requests
	; only the altar room and Rider III's room take requests
	LDA $DC
	CMP.w #431
	BEQ +
	CMP.w #419
	BNE .rider
+	JSR fz_pending_entrance
	BCC .rider
	LDA $DC
	CMP.w #431
	BEQ .altar
	; the retail room starts its old boss on one floor marker, which
	; flight can skip: Frieza greets Goku on entering after Hexas
	LDA.w #!FZFL_EMPEROR
	JSR fz_flag
	BEQ .rider
	LDX.w #$0044
	JSR fz_cf
	CMP.w #6
	BCC .rider
	LDA.w #$00A7
	BRA .request
.altar
	LDA.w #!FZFL_EMPEROR
	JSR fz_flag
	BNE .rider
	LDX.w #$0044
	JSR fz_cf
	CMP.w #2
	BCC .rider
	; within 90 px of (232, 200) (hero = feet - 12)
	LDA $E002
	SEC
	SBC.w #232
	JSR fz_square_small
	BCS .rider
	STA !fz_t0
	LDA $E004
	SEC
	SBC.w #212
	JSR fz_square_small
	BCS .rider
	CLC
	ADC !fz_t0
	BCS .rider
	CMP.w #8100
	BCS .rider
	LDA.w #$04A6
.request
	LDX.w #$0000
	JSL story_api_request
	RTS
.rider
	; Rider III: a hero who flew past the floor trigger, idle 45 frames
	JSR fz_stage
	CMP.w #!FZST_PALACE
	BNE .out
	LDA $DC
	CMP.w #419
	BNE .out
	LDX.w #$0044
	JSR fz_cf
	CMP.w #6
	BNE .out
	LDA.l !core_frame
	SEC
	SBC !fz_room_since
	CMP.w #46
	BCC .out
	LDA.w #$04A3
	LDX.w #$0000
	JSL story_api_request
.out
	RTS

; A16 = signed value -> A16 = value^2 when |value| < 256 (C clear),
; C set when it is too large to matter.
fz_square_small:
	BPL +
	EOR.w #$FFFF
	INC
+	CMP.w #256
	BCS .big
	SEP #$20
	STA.l $004202
	STA.l $004203
	REP #$20
	NOP
	NOP
	NOP
	NOP
	LDA.l $004216
	CLC
	RTS
.big
	SEC
	RTS

; Local quake for builds without the fx module (native-feedback.js pulse:
; the game's own BG quake byte $49 = $E0, restored unless an event took it).
fz_quake_tick:
	LDA !fz_quake
	AND.w #$00FF
	BEQ .out
	SEP #$20
	DEC !fz_quake
	BNE +
	LDA $49
	CMP.b #$E0
	BNE +
	LDA !fz_quake_prev
	STA $49
+	REP #$20
.out
	RTS

; Music cue (frieza.js music getter): the arrival theme in Frieza's
; scenes, the battle theme on the ground; orbit picks its own.
fz_music_tick:
	JSR fz_music_cue
	SEP #$20
	CMP !fz_music
	BEQ .same
	STA !fz_music
	REP #$20
	AND.w #$00FF
	BNE .bind
	; won: win() stopped the theme (F0); nothing native comes back under
	; the beat and its fanfare
	JSR fz_stage
	CMP.w #!FZST_WON
	BEQ .out
	LDA.w #$0000
.bind
	JMP fz_bind_music
.same
	REP #$20
.out
	RTS

; A8/16 = cue (!FZM_*, 0 = native).
fz_music_cue:
	JSR fz_stage
	CMP.w #!FZST_BATTLE
	BEQ .battle
	CMP.w #!FZST_WON
	BEQ .won
	CMP.w #!FZST_THEFT
	BEQ .arrival
	CMP.w #!FZST_SHOWDOWN
	BEQ .arrival
	JSR fz_scene_kind
	BEQ .native
	CMP.w #!FZS_GOLD
	BEQ .battle
	CMP.w #!FZS_EIGHTH
	BEQ .arrival
	CMP.w #!FZS_EMPEROR_WAIT
	BEQ .arrival
	CMP.w #!FZS_ALTAR_LEAVE
	BEQ .arrival
	CMP.w #!FZS_TRIAL_ENTRY
	BEQ .arrival
	CMP.w #!FZS_TRIAL_TAUNT
	BEQ .arrival
	CMP.w #!FZS_EMPOWER
	BEQ .arrival
	CMP.w #!FZS_TRIAL_LEAVE
	BEQ .arrival
	CMP.w #!FZS_TREE_ARRIVAL
	BCC .native
	CMP.w #!FZS_TREE_LEAVE
	BEQ .native
	CMP.w #!FZS_TREE_WAKE+1
	BCC .arrival
	CMP.w #!FZS_TREE_ESTABLISH
	BEQ .arrival
.native
	LDA.w #$0000
	RTS
.arrival
	LDA.w #!FZM_ARRIVAL
	RTS
.battle
	LDA !fzf_flags
	AND.w #!FZFF_SPACE
	BNE .orbit
	LDA.w #!FZM_BATTLE
	RTS
.won
	; the orbital victory keeps the orbit theme until its whiteout
	LDA !fzf_flags
	AND.w #!FZFF_SPACE
	BEQ .native
	LDA.l !fzv_on
	AND.w #$00FF
	BEQ .native
	LDA.l !fzv_age
	CMP.w #!FZV_WHITE
	BCS .native
.orbit
	LDA.w #!FZM_ORBIT
	RTS
