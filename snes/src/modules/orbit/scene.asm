; Scene ownership: field-frame and field-vblank hooks, commands, the art
; load, PPU registers of the globe picture and the hand-back to the field.
; Included by module.asm in the code bank.

; ---------------------------------------------------------------------------
; modules_field_frame: after the game's logic and OAM build, before the NMI
; handshake. M16/X16, DB = $7E, D = 0. Idle (no scene, command, waiting
; entry or return to the deck): three loads.
orbit_field_frame:
	LDA.l !orbit_state             ; (the state and the command byte)
	ORA.l !orbit_enter             ; (the waiting entry and the return's step)
	BNE +
	RTL
+	PHB
	PHP
	REP #$30
	SEP #$20
	LDA.l !orbit_cmd
	BEQ .noCmd
	PHA
	LDA.b #!OC_NONE
	STA.l !orbit_cmd
	PLA
	PEA.w $3232 : PLB : PLB
	JSR orbit_command
.noCmd
	SEP #$20
	LDA.l !orbit_enter
	BEQ +
	PEA.w $3232 : PLB : PLB
	REP #$30
	JSR orbit_enter_try
	SEP #$20
+	LDA.l !orbit_rstep
	BEQ +
	PEA.w $3232 : PLB : PLB
	REP #$30
	JSR orbit_return_frame
	SEP #$20
+	LDA.l !orbit_state
	BEQ .out
	PEA.w $3232 : PLB : PLB
	REP #$30
	LDA.l !orbit_frame
	INC
	STA.l !orbit_frame
	SEP #$20
	LDA.l !orbit_state
	CMP.b #!OS_LIVE
	BNE .notLive
	REP #$30
	JSR orbit_live_frame
	BRA .common
.notLive
	CMP.b #!OS_LOADING
	REP #$30
	BNE .common
	LDA.l !orbit_mt                ; (the cinematic's clock runs through its loads)
	BEQ .common
	JSL montage_frame
	REP #$30
.common
	; while the scene loads (the picture black), the second surge's
	; cinematic shows or the orbit's picture is up (the fight, the clash,
	; the fall), no native actor is drawn: this frame's vblank skips the
	; game's actor cell streaming (core_actor_cells; in the clash's recoil
	; it ran to line 255 and pushed the module vblanks past line 261). Not
	; in the stopping frame, whose vblank gives the field its picture back.
	SEP #$20
	LDA.l !orbit_state
	CMP.b #!OS_LOADING
	BEQ +
	CMP.b #!OS_LIVE
	REP #$20
	BNE ++
+	REP #$20
	LDA.l !core_frame
	STA.l !core_actor_hold
++	JSR orbit_suppress_native
	JSR orbit_oam_frame
	%orbit_mark(6)
	SEP #$20
	LDA.l !orbit_state
	CMP.b #!OS_LIVE
	REP #$30
	BNE +
	JSR orbit_background
+
if defined("ORBIT_TIMING")
	JSR orbit_vcount
	STA.l !orbit_fline
endif
.out
	PLP
	PLB
	RTL

; A (8-bit) = command; DB = $32.
orbit_command:
	CMP.b #!OC_TEST_GLOBE
	BNE .notTest
	JMP orbit_start_test
.notTest
	CMP.b #!OC_TEST_FIGHT
	BNE .notFight
	JMP orbit_start_fight_test
.notFight
	CMP.b #!OC_API_INTRO
	BEQ .api
	CMP.b #!OC_API_FIGHT
	BNE .notApi
.api
	; through the public entry, as the frieza module and the debug presets
	REP #$30
	AND.w #$00FF
	SEC : SBC.w #!OC_API_INTRO-!OE_INTRO
	PHA
	JSL orbit_api_defaults
	PLA
	JSL orbit_api_enter
	SEP #$20
	RTS
.notApi
	CMP.b #!OC_STOP
	BNE .done
	LDA.l !orbit_state
	BEQ .done
	LDA.b #!OS_STOP
	STA.l !orbit_state
	REP #$30
	JSR orbit_fight_off
	SEP #$20
.done
	RTS

; The scene work area (core_scene_claim, !SCENE_ORBIT) becomes the orbit's
; before its scene first writes there; Frieza's fight hands it over (his
; claim is given back for him: his module then runs only its WRAM work
; until the orbit releases the area; the orbit leaves his fight block,
; $32:7800-7BFF, alone, as frieza_orbit_won still clears his shots
; there). Carry set while another set piece holds it. M16/X16.
orbit_claim:
	LDA.w #!SCENE_ORBIT
	JSL core_scene_claim
	BCC .done
	JSL core_scene_owner
	CMP.w #!SCENE_FRIEZA
	BNE .busy
	JSL core_scene_release
	LDA.w #!SCENE_ORBIT
	JSL core_scene_claim
	BRA .done
.busy
	SEC
.done
	REP #$30
	RTS

; Tests: show the globe with the camera already written to the scene block.
orbit_start_test:
	REP #$30
	JSR orbit_claim
	BCC +
	RTS                            ; (another set piece holds the area)
+	JSR orbit_scene_init
	SEP #$20
	LDA.b #!OS_LOADING
	STA.l !orbit_state
	LDA.b #!OF_ACTIVE
	STA.l !orbit_flags
	REP #$30
	RTS

; Tests: the space fight with no intro (quick-start.js 'space'): Frieza's
; HP in !orbit_arg, the globe target already in !cam_lon / !cam_lat.
orbit_start_fight_test:
	REP #$30
	JSR orbit_start_test
	LDA.l !orbit_arg
	LDX.w !cam_lon
	LDY.w !cam_lat
	JSR fight_start
	STZ.w !f_intro
	JSR orbit_fight_on
	RTS

; The fight takes over: Goku's pad and combat (combat_api_input_lock: native
; input masked, combat paused; combat_api_danger: Frieza's hits unscaled, as
; the browser's damagePlayer), the 60 Hz step clock.
orbit_fight_on:
	LDA.w #$0001
	STA.w !f_on
	LDA.l $7E0000|!cb_vblanks
	STA.w !f_vbl
	LDA.l !core_frame_ring
	CLC : ADC.l !core_frame_menu
	STA.w !f_menus
	LDA.w #!ORBIT_COMBAT_OWNER
	JSL combat_api_input_lock
	LDA.w #!ORBIT_COMBAT_OWNER
	JSL combat_api_danger
	REP #$30
	RTS

; Give Goku's pad and combat back.
orbit_fight_off:
	LDA.w !f_on
	BEQ +
	STZ.w !f_on
	LDA.w #!ORBIT_COMBAT_OWNER
	JSL combat_api_input_unlock
	LDA.w #!ORBIT_COMBAT_OWNER
	JSL combat_api_safe
+	REP #$30
	RTS

; Fresh scene state (the camera fields are the caller's).
orbit_scene_init:
	REP #$30
	JSR orbit_m7_none              ; (VRAM: nothing of the globe's yet)
	LDA.w #$FFFF                   ; no deferred upload (pull.asm)
	STA.l !orbit_pdef
	LDA.w #$0000                   ; no return, no landing spot, no cinematic
	STA.l !orbit_pball
	STA.l !orbit_land
	STA.l !orbit_lfound
	STA.l !orbit_mt
	STA.l !orbit_frame
	SEP #$20
	STA.l !orbit_rstep
	STA.l !orbit_mpic
	STA.l !orbit_mcut
	REP #$20
	LDA.w #$FFFF
	STA.l !orbit_li
	LDX.w #10                      ; no distant body's picture wanted or held (scdraw.asm:
-	STA.l !sc_want,X               ; the vblank sends none before the fight's start)
	DEX : DEX
	BPL -
	LDA.w #$0000
	STA.l !sc_nwant
	STZ.w !f_on
	LDX.w #(!FN_END)-(!FN)-2       ; no struggle, no death
-	STZ.w !FN,X
	DEX : DEX
	BPL -
; The picture's state (the scene's start, the cinematic's pullback): the
; globe's blocks and tables, the band layers, the beam pictures, the
; dynamic cells, the starfield, no text band, the load from its first step.
orbit_picture_init:
	REP #$30
	LDA.w #$FFFF
	STA.w !g_cx
	STA.w !g_lr
	STA.w !g_icy
	STZ.w !g_lw
	STZ.w !g_cur_it
	STZ.w !g_shown_it
	STZ.w !g_itband
	STZ.w !g_itband+2
	STZ.w !g_itend
	STZ.w !g_itend+2
	STZ.w !bd_shown
	STZ.w !bd_sline
	STZ.w !g_ichg
	STZ.w !g_bld
	STZ.w !g_desc                  ; the fight's tables, not the descent's
	STZ.w !g_pull                  ; (the pullback sets it after this)
	LDA.w #196
	STA.w !g_mend
	LDA.w #$FFFF
	STA.w !g_dk
	JSR globe_fight_banks
	LDA.w !g_lbank
	STA.w !g_itbank
	STA.w !g_itbank+2
	LDA.w !g_wbank
	STA.w !g_itwbank
	STA.w !g_itwbank+2
	STA.w !s_cbank
	STZ.w !v_pband
	STZ.w !v_pmode
	STZ.w !t_want
	STZ.w !t_have
	JSR beam_init
	JSR bands_reset
	JSR orbit_obj_pals_init
	STZ.w !v_band
	LDA.w #$FFFF                   ; no dynamic cell uploaded or wanted
	STA.w !v_frieza
	STA.w !v_frieza_h
	STA.w !v_goku
	STA.w !v_goku_h
	STA.w !v_d32
	STA.w !v_d32_h
	STA.w !v_d16
	STA.w !v_d16_h
	STA.w !v_dbig
	; starfield: fresh accumulators, everything stale
	LDA.w #$0000
	STA.w !cam_tdx
	STA.w !cam_tdy
	STA.w !st_ax
	STA.w !st_ax+2
	STA.w !st_ay
	STA.w !st_ay+2
	STA.w !st_age240
	STA.w !s_kgen
	STA.w !s_bd
	STA.w !s_lists
	STA.w !s_lists+2
	STA.w !s_lists+4
	JSR stars_limits_reset         ; (no limits; the stale depths looked at from the first)
	LDA.w #$FFFF
	STA.w !s_twhave
	LDX.w #$0006
.clr
	STA.w !sx_have,X
	STA.w !sy_have,X
	STA.w !sz_have,X
	STA.w !sk_have,X
	DEX : DEX
	BPL .clr
	SEP #$20
	STZ.w !g_text
	LDA.b #$FF
	STA.w !g_textset
	LDA.b #$00
	STA.l !orbit_load
	REP #$30
	LDA.w #$FFFF                   ; (both sets' BGMODE tables valid from the start)
	STA.w !hb_have
	STA.w !hb_have+2
	LDX.w #$0000
	JSR globe_mode_write
	LDX.w #!IT_SIZE
	JMP globe_mode_write

; Keep the game from writing BG VRAM while the picture is ours: BG row and
; column streaming (C0:C692) and animated tiles (C0:C306/C339).
orbit_suppress_native:
	SEP #$20
	STZ.w !N_ROWREQ
	STZ.w !N_COLREQ
	LDA.w !N_ANIM1
	AND.b #$7F
	STA.w !N_ANIM1
	LDA.w !N_ANIM2
	AND.b #$7F
	STA.w !N_ANIM2
	REP #$30
	RTS

; The frame's spare time, after the picture's registers and OAM are ready:
; the globe's next window block, then the starfield's rebuild, each until
; the scanline reaches !ORBIT_DEADLINE (leaving the modules after us and
; the frame's end their usual lines). Measured costs: about one line per
; window row, two per star.
orbit_background:
	SEP #$20
	LDA.l !orbit_mpic
	REP #$20
	BEQ +
	RTS                            ; (a montage picture: no globe, stars or beams)
+	JSR orbit_vcount
	CMP.w #!ORBIT_DEADLINE
	BCS .done
	JSR beam_update                ; beam pictures first: the most visible
	REP #$30
	JSR orbit_vcount
	CMP.w #!ORBIT_DEADLINE
	BCS .done
	LDA.w !sc_hot                  ; (the stars' limits changed: their rebuilds first)
	BEQ +
	LDA.w #100
	JSR stars_background
	REP #$30
	JSR orbit_vcount
	CMP.w #!ORBIT_DEADLINE
	BCS .done
+	LDA.w !g_bld
	BEQ .stars
	LDA.w #$00FF                   ; rows: as many as the deadline allows
	STA.w !g_bld_n
	JSR globe_build_step
	REP #$30
.stars
	JSR orbit_vcount
	CMP.w #!ORBIT_DEADLINE
	BCS .done
	LDA.w #100                     ; stars: as many as the deadline allows
	JSR stars_background
	REP #$30
	; the descent: the landing spot for the return, in what is left
	LDA.w !g_desc
	BEQ .done
	JSR orbit_land_search
.done
	REP #$30
	RTS

; Carry set once the scanline reached !ORBIT_DEADLINE (any M/X; keeps A).
orbit_late:
	PHP
	REP #$20
	PHA
	JSR orbit_vcount
	CMP.w #!ORBIT_DEADLINE
	PLA
	BCS .late
	PLP
	CLC
	RTS
.late
	PLP
	SEC
	RTS

; Current scanline (A16), for timing tests.
orbit_vcount:
	SEP #$20
	LDA.w $2137                    ; latch H/V counters
	LDA.w $213D                    ; OPVCT low
	XBA
	LDA.w $213D                    ; high bit
	AND.b #$01
	XBA
	REP #$20
	PHA
	SEP #$20
	LDA.w $213F                    ; reset the OPVCT flip-flop
	REP #$20
	PLA
	RTS

; ---------------------------------------------------------------------------
; Live frame: camera, globe tables, stars.
orbit_live_frame:
	REP #$30
	%orbit_mark(0)
	LDA.l !orbit_mt
	BEQ .fight
	; the second surge's cinematic (montage.asm) before the orbit's intro
	JSL montage_frame
	REP #$30
	LDA.l !orbit_mt
	BEQ .fight                     ; (it ended: the fight from here)
	LDA.l !orbit_mshot
	CMP.w #!MT_SHOTS
	BCC +
	JMP pull_frame                 ; the pullback (pull.asm)
+	RTS
.fight
	LDA.w !g_pull
	BEQ +
	JSR pull_end                   ; (the pullback ended: the intro from here)
+	JSR death_check
	BCC +
	JMP death_live                 ; Goku fell in space
+	LDA.w !f_on
	BNE +
	JMP .noFight
+
	; The browser runs the fight once per video frame, also while the
	; game's own logic lags: one step per field vblank since the last frame
	; (combat's public counter), at most 4; a step only after a ring or
	; full-screen menu (the fight was paused there).
	LDA.l $7E0000|!cb_vblanks
	SEC : SBC.w !f_vbl
	BEQ +
	CMP.w #5
	BCC ++
+	LDA.w #1
++	STA.w !f_steps
	LDA.l $7E0000|!cb_vblanks
	STA.w !f_vbl
	LDA.l !core_frame_ring
	CLC : ADC.l !core_frame_menu
	CMP.w !f_menus
	BEQ +
	STA.w !f_menus
	LDA.w #1
	STA.w !f_steps
+	STZ.w !cam_tdx
	STZ.w !cam_tdy
	JSL sc_frame_start_far
-	JSR fight_frame
	REP #$30
	DEC.w !f_steps
	BNE -
	%orbit_mark(1)
	LDA.w !fn_phase
	BEQ +
	JSR finale_camera              ; the clash's own camera (clashCamera)
	JSR fc_rays                    ; its rays, for the band layers
+	JSL sc_update_far              ; (the distant bodies: the last step's steering, the clash's camera)
	%orbit_mark(2)
	JSR bands_frame
	%orbit_mark(3)
	JSR text_frame
	INC.w !cam_age
	JSR globe_frame
	%orbit_mark(4)
	JSR stars_frame
	%orbit_mark(5)
	STZ.w !cam_tdx
	STZ.w !cam_tdy
	RTS
.noFight
	SEP #$20
	LDA.l !orbit_test
	AND.b #!OT_SPIN
	REP #$20
	BEQ .noSpin
	; tickOrbit: longitude += 2, travelX += 2 every frame.
	LDA.w !cam_lon
	CLC : ADC.w #$0002
	AND.w #$0FFF
	STA.w !cam_lon
	LDA.w #$0002
	STA.w !cam_tdx
.noSpin
	INC.w !cam_age
	JSR globe_frame
	JSR stars_frame
	STZ.w !cam_tdx
	STZ.w !cam_tdy
	RTS

; ---------------------------------------------------------------------------
; frieza.js returnToFortress (finale.asm at victoryTiming.return; the
; victory event while the fight is still in space: bind.asm): back to the
; deck. The orbit's picture replaced the deck's VRAM, so the field reloads
; map 246 through its door with the entry tile moved to Goku's landing spot
; (returnToFortress's nearest landable floor, searched during the descent:
; orbit_land_search), as the debug module's teleport does; the field's
; fade-out runs over the descent's last frame (a step a frame), then the
; scene stops; after the load Goku stands on the exact spot, the world
; module's landing pose plays as the deck fades in, and the landing clock
; (frieza.js b.age: frames the field can act) runs to victoryTiming.landed:
; frieza_orbit_landed, whose victory event (C7) takes the story on.
; M16/X16, DB = $32.
orbit_return:
	SEP #$20
	LDA.l !orbit_rstep
	BNE +
	LDA.b #!RS_DOOR
	STA.l !orbit_rstep
	REP #$20
	LDA.w #$0001
	STA.l !orbit_land
+	REP #$30
	RTS

; The return's steps, every field frame from the next one on (M16/X16,
; DB = $32; the scene block is not the orbit's from RS_LOAD on).
orbit_return_frame:
	; the landing clock: frames the field can act with no victory command
	; queued (frieza.js 'won' tick: canAttack, victoryAudio.pending), and
	; no transition under way (the door's quickened fade leaves the fade
	; timers settled)
	LDA.l !orbit_land
	BEQ +
	LDA.w $00FF
	AND.w #$00FF
	BNE +
	JSR finale_can_attack
	BCC +
	LDA.l !core_snd_head
	CMP.l !core_snd_tail
	BNE +
	LDA.l !orbit_land
	INC
	BEQ +                          ; (saturates)
	STA.l !orbit_land
+	LDA.l !orbit_rstep
	AND.w #$00FF
	CMP.w #!RS_LAND+1
	BCC +
	JMP orbit_ret_end              ; (no such step)
+	DEC
	ASL
	TAX
	JMP (.steps,X)
.steps
	dw orbit_ret_door, orbit_ret_asked, orbit_ret_fade, orbit_ret_load, orbit_ret_land

; RS_DOOR: the landing spot (the search normally ended during the descent),
; then the deck's door through core's event request (busy: next frame).
orbit_ret_door:
	JSR orbit_ret_dark
	BCC +
	RTS                            ; (another transition took the picture)
+	LDA.l !orbit_lfound
	BNE +
	JSR orbit_land_search
	LDA.l !orbit_lfound
	BNE +
	RTS
+	LDA.w #$0800|!ORBIT_DECK_DOOR
	JSL core_event_request
	REP #$30
	BCS +
	SEP #$20
	LDA.b #!RS_ASKED
	STA.l !orbit_rstep
	REP #$20
+	RTS

; RS_ASKED: once the pump started the door (C1:E7DF read its record into
; $DC/$DE/$DF), the entry tile at the landing spot (x / 16; y / 16 * 2 with
; the door's layer bit) and the fade-out a step a frame (the door's: 4).
orbit_ret_asked:
	JSR orbit_ret_dark
	BCC +
	RTS
+	LDA.l !core_event_req
	BEQ +
	RTS                            ; waiting for an idle frame
+	LDA.l !core_event_last
	CMP.w #$0800|!ORBIT_DECK_DOOR
	BEQ +
	SEP #$20                       ; (cancelled: ask again)
	LDA.b #!RS_DOOR
	STA.l !orbit_rstep
	REP #$20
	RTS
+	LDA.l !orbit_lx
	LSR : LSR : LSR : LSR
	SEP #$20
	STA.w $00DE
	REP #$20
	LDA.l !orbit_ly
	LSR : LSR : LSR
	AND.w #$00FE
	SEP #$20
	PHA
	LDA.w $00DF
	AND.b #$01
	ORA $01,S
	STA.w $00DF
	PLA
	LDA.b #$01
	STA.w $00E4
	STA.w $00E5
	LDA.b #!RS_FADE
	STA.l !orbit_rstep
	REP #$20
	RTS

; RS_FADE: the field's fade-out, until orbit_ret_dark stops the scene.
orbit_ret_fade:
	JSR orbit_ret_dark
	RTS

; Carry set once the field's picture is dark (brightness 1 or less, or
; blanked: the field loads next, and no frame of ours runs during it):
; the scene stops (the next vblank of ours gives the picture back and the
; scene work area), Goku's pad and combat go back, RS_LOAD. M16.
orbit_ret_dark:
	SEP #$20
	LDA.w $00FF
	BEQ .lit                       ; (no transition: a dim frame is not one)
	LDA.w $00E6
	BMI .dark
	AND.b #$0F
	CMP.b #$02
	BCC .dark
.lit
	REP #$20
	CLC
	RTS
.dark
	LDA.b #!RS_LOAD
	STA.l !orbit_rstep
	LDA.l !orbit_state
	CMP.b #!OS_LIVE
	BNE +
	LDA.b #!OS_STOP
	STA.l !orbit_state
	REP #$30
	JSR orbit_fight_off
+	REP #$30
	SEC
	RTS

; RS_LOAD: the first frame after the field's load (its transition request
; $FF clear again and the screen no longer blanked: the fade-in): the
; stop's bookkeeping if no vblank of ours ran since it; on the deck, Goku
; on the exact spot and the landing pose; elsewhere (another transition)
; the return ends there.
orbit_ret_load:
	SEP #$20
	LDA.w $00FF
	BNE .wait
	LDA.w $00E6
	BPL +
.wait
	REP #$20
	RTS                            ; the load is still to come
+	SEP #$20
	LDA.l !orbit_state
	BEQ +
	LDA.b #!OS_OFF                 ; (no vblank of ours since the stop: the
	STA.l !orbit_state             ; field's loader set its registers)
	LDA.b #!OF_ACTIVE
	STA.l !orbit_flags
	REP #$30
	LDA.w #!SCENE_ORBIT
	JSL core_scene_release
+	REP #$30
	LDA.w $00DC
	AND.w #$01FF
	CMP.w #!ORBIT_DECK_MAP
	BEQ +
	JMP orbit_ret_end              ; (not the deck: no landing)
+	LDA.l !orbit_lx
	STA.l $7EE002
	LDA.l !orbit_ly
	STA.l $7EE004
	JSR orbit_bind_landing
	SEP #$20
	LDA.b #!RS_LAND
	STA.l !orbit_rstep
	REP #$30
	RTS

; RS_LAND: victoryTiming.landed (84 frames of the clock after the return):
; frieza_orbit_landed (its victory event C7), the return ends.
orbit_ret_land:
	LDA.l !orbit_land
	CMP.w #1+!FNT_V_LANDED-!FNT_V_RETURN
	BCS +
	RTS
+	JSR orbit_ret_end
	JMP orbit_bind_landed

; The return ends: no step, no landing clock, bit 0 given up.
orbit_ret_end:
	LDA.w #$0000
	STA.l !orbit_land
	SEP #$20
	STA.l !orbit_rstep
	LDA.l !orbit_flags
	AND.b #~!OF_ACTIVE
	STA.l !orbit_flags
	REP #$30
	RTS

; returnToFortress's landing spot: the nearest point to Goku's place on
; the deck, in 8-pixel steps within 128 each way (ordered by distance, ties
; as the browser's stable sort leaves them: orbit-finale.mjs, extended
; data), where he can land (canLand at the fight's terrain: bind.asm).
; One candidate a call, more until the frame's deadline; orbit_lfound 1
; with the spot in orbit_lx / ly, or 2: none (the browser keeps Goku
; hovering; here he comes down where he is: orbit_lx / ly = his place).
; M16/X16.
orbit_land_search:
	LDA.l !orbit_lfound
	BEQ +
	RTS
+	LDA.l !orbit_li
	CMP.w #$FFFF
	BNE .one
	LDA.l $7EE002
	STA.l !orbit_lhx
	LDA.l $7EE004
	STA.l !orbit_lhy
	LDA.w #$0000
	STA.l !orbit_li
	BRA .one
.next
	JSR orbit_late
	BCS .out
.one
	LDA.l !orbit_li
	CMP.w #!FND_LAND_N*4
	BCS .none
	TAX
	CLC : ADC.w #$0004
	STA.l !orbit_li
	LDA.l !XDATA_ORBIT_LAND,X
	CLC : ADC.l !orbit_lhx
	STA.l !orbit_lx
	LDA.l !XDATA_ORBIT_LAND+2,X
	CLC : ADC.l !orbit_lhy
	STA.l !orbit_ly
	TAX
	LDA.l !orbit_lx
	JSR orbit_bind_can_land
	REP #$30
	BCC .next
	LDA.w #$0001
	STA.l !orbit_lfound
	RTS
.none
	LDA.l !orbit_lhx               ; (none: he comes down where he is)
	STA.l !orbit_lx
	LDA.l !orbit_lhy
	STA.l !orbit_ly
	LDA.w #$0002
	STA.l !orbit_lfound
.out
	RTS

; ---------------------------------------------------------------------------
; OAM: keep the native HUD sprites (lines 190+), hide the rest of the
; game's sprites (the party on the deck, shadows, numbers), then ours.
; Other modules' sprites are refused for the frame (cursor at the end).
orbit_oam_frame:
	REP #$30
	LDA.l !core_oam_native
	AND.w #$007F
	ASL : ASL
	STA.w !o_tmp                   ; native end (bytes)
	LDX.w #$0000
	LDA.l !orbit_mt                ; (the cinematic has no HUD: all hidden,
	BEQ .native                    ; its sprites from the first slot)
	LDA.w #$E0FF
-	CPX.w !o_tmp
	BCS +
	STA.w $0800,X
	INX : INX : INX : INX
	BRA -
+	LDX.w #$0000
	BRA .nativeDone
.native
	CPX.w !o_tmp
	BCS .nativeDone
	LDA.w $0801,X                  ; y (low byte)
	AND.w #$00FF
	CMP.w #190
	BCC .hide
	CMP.w #224
	BCC .keep
.hide
	LDA.w #$E0FF
	STA.w $0800,X
.keep
	INX : INX : INX : INX
	BRA .native
.nativeDone
	STX.w !o_slot
	JSR ofx_clear_hi
	SEP #$20
	LDA.l !orbit_state
	CMP.b #!OS_LIVE
	REP #$20
	BNE .close
	SEP #$20
	LDA.l !orbit_mpic
	REP #$20
	BEQ +
	JSL montage_oam                ; (a montage picture: its sprites)
	JMP .close
+	LDA.w #$FFFF                   ; (no aura or burst unless the fight's
	STA.w !au_want                 ; drawing wants one this frame)
	STA.w !au_want+2
	STA.w !vb_want
	STA.w !vb_want+2
	LDA.w !od_on
	BEQ +
	JSR death_draw
	BRA ++
+	LDA.w !g_pull
	BEQ +
	JSR pull_draw                  ; (the second surge's pullback)
	BRA ++
+	JSR fight_draw
++	JSR sc_draw_live               ; the distant bodies, behind the rest (scdraw.asm)
	%orbit_mark(7)
	JSR stars_oam
	REP #$30
	JSR orbit_pals_frame
	JSR beam_queue
.close
	; Close the module area at our end: other modules add nothing while
	; the orbit owns the picture, and the game's next OAM pass (C0:BCAB,
	; up to the core's $0120 = this cursor) hides whatever we leave, so the
	; slots after ours are already hidden when we run.
	LDA.w !o_slot
	STA.l !core_oam_cursor
	STA.l !core_oam_limit
	RTS

; ---------------------------------------------------------------------------
; modules_field_nmi: after the game's uploads, still force-blanked.
; M16/X16, DB = $80, D = 0.
orbit_field_nmi:
	LDA.l !orbit_state
	AND.w #$00FF
	BNE +
	RTL
+	PHP
	SEP #$20
.on
	CMP.b #!OS_LOADING
	BNE .notLoading
	JSR orbit_nmi_load
	BRA .done
.notLoading
	CMP.b #!OS_LIVE
	BNE .notLive
	JSR orbit_nmi_live
	BRA .done
.notLive
	CMP.b #!OS_STOP
	BNE .done
	JSR orbit_nmi_restore
	SEP #$20
	LDA.b #!OS_OFF
	STA.l !orbit_state
	LDA.l !orbit_rstep             ; (a return keeps bit 0 to the landing)
	BEQ +
	LDA.b #!OF_ACTIVE
+	STA.l !orbit_flags
	REP #$30
	LDA.w #!SCENE_ORBIT            ; the scene work area is free again
	JSL core_scene_release
	SEP #$20
.done
if defined("ORBIT_TIMING")
	REP #$30
	JSR orbit_vcount
	STA.l !orbit_vline
endif
	PLP
	RTL

; Loading: the picture stays black (TM = 0, our HDMA off) while the Mode 7
; image goes up in 4 KiB steps (~25 lines each, still inside the force-blank
; the field NMI keeps until C0:C15F; the chunks already in VRAM skipped),
; then the star cells and the rest.
orbit_nmi_load:
	SEP #$20
	STZ.w $212C
	STZ.w $212D
	LDA.w !N_HDMA
	AND.b #~!ORBIT_HDMA
	STA.w !N_HDMA
	LDA.l !orbit_load
	CMP.b #64
	BCC .m7
	JMP .stars
.m7
	; Steps 0-63 are the Mode 7 image's 512-byte chunks (VRAM words c *
	; $100, ROM $F6:c * $200): the ones not in VRAM already, eight a vblank
	REP #$30
	LDY.w #8
.chunk
	LDA.l !orbit_load
	AND.w #$00FF
	CMP.w #64
	BCS .m7end
	PHA
	JSR orbit_m7_have
	PLA
	BCS +
	JSR orbit_m7_send
	DEY
+	SEP #$20
	LDA.l !orbit_load
	INC
	STA.l !orbit_load
	REP #$20
	CPY.w #$0000
	BNE .chunk
.m7end
	SEP #$20
	CPY.w #8
	BEQ +
	RTS
+	LDA.l !orbit_load              ; (nothing sent: the star cells in this vblank)
	CMP.b #64
	BCS .stars
	RTS
.stars
	CMP.b #64
	BNE .effects
	REP #$20
	LDA.w #!ORBIT_STAR_VRAM
	STA.w $2116
	LDA.w #orbit_star_tiles
	STA.w $4372
	LDA.w #$1801
	STA.w $4370
	LDA.w #$0400
	STA.w $4375
	SEP #$20
	LDA.b #orbit_star_tiles>>16
	STA.w $4374
	LDA.b #$80
	STA.w $2115
	LDA.b #$80
	STA.w $420B
	; the cinematic's pullback: OBJ tiles $100-$13F (the beam's orb) too,
	; the rest after its load (pull.asm pull_defer)
	REP #$20
	LDA.l $320000|!g_pull
	SEP #$20
	BEQ +
	REP #$20
	LDA.w #$7000
	STA.w $2116
	LDA.w #orbit_fx_vram_b
	STA.w $4372
	LDA.w #$0800
	STA.w $4375
	SEP #$20
	LDA.b #orbit_fx_vram_b>>16
	STA.w $4374
	LDA.b #$80
	STA.w $420B
	LDA.b #71
	STA.l !orbit_load
	RTS
+	JMP .next
.effects
	; Steps 65-67: the fight's resident effect cells (OBJ tiles $080-$0FF,
	; $100-$13F, $180-$1BF); step 68: the text panel's BG3 tiles; step 69:
	; OBJ tiles $000-$03F (the cells beside the dynamic ones); step 70: the
	; finale's band layer tiles.
	CMP.b #68
	BNE +
	JMP .text
+
	CMP.b #69
	BNE +
	JMP .fxd
+	CMP.b #70
	BNE +
	JMP .bands
+	BCS .finish
	REP #$20
	AND.w #$00FF
	SEC : SBC.w #65
	ASL : ASL
	TAX
	LDA.l .fxSteps,X
	STA.w $2116
	LDA.l .fxSteps+2,X
	STA.w $4372
	LDA.w #$1801
	STA.w $4370
	LDA.w #$0800
	CPX.w #$0000
	BNE +
	LDA.w #$1000
+	STA.w $4375
	SEP #$20
	LDA.b #orbit_fx_vram_a>>16
	STA.w $4374
	LDA.b #$80
	STA.w $2115
	LDA.b #$80
	STA.w $420B
	BRA .next
.finish
	LDA.b #!OS_LIVE
	STA.l !orbit_state
	LDA.l !orbit_flags
	ORA.b #!OF_LIVE
	STA.l !orbit_flags
	REP #$20                       ; the cinematic's pullback: its picture shows
	LDA.l !orbit_mt
	BEQ +
	LDA.l !orbit_mshot
	CMP.w #!MT_SHOTS
	BCC +
	CMP.w #$FFFF
	BEQ +
	SEP #$20
	LDA.l !orbit_me6
	STA.w $00E6
+	SEP #$20
	RTS
.next
	LDA.l !orbit_load
	INC
	STA.l !orbit_load
	RTS
.text
	REP #$20
	LDA.w #$4000+(!OTXT_TILE0*8)
	STA.w $2116
	LDA.w #orbit_text_tiles
	STA.w $4372
	LDA.w #$1801
	STA.w $4370
	LDA.w #!OTXT_TILES*16
	STA.w $4375
	SEP #$20
	LDA.b #orbit_text_tiles>>16
	STA.w $4374
	LDA.b #$80
	STA.w $2115
	LDA.b #$80
	STA.w $420B
	JMP .next
.bands
	REP #$20
	LDA.w #!BD_TILES
	STA.w $2116
	LDA.w #orbit_band_tiles
	STA.w $4372
	LDA.w #$1801
	STA.w $4370
	LDA.w #45*32
	STA.w $4375
	SEP #$20
	LDA.b #orbit_band_tiles>>16
	STA.w $4374
	LDA.b #$80
	STA.w $2115
	LDA.b #$80
	STA.w $420B
	JMP .next
.fxd
	REP #$20
	LDA.w #$6000
	STA.w $2116
	LDA.w #orbit_fx_vram_d
	STA.w $4372
	LDA.w #$1801
	STA.w $4370
	LDA.w #$0800
	STA.w $4375
	SEP #$20
	LDA.b #orbit_fx_vram_d>>16
	STA.w $4374
	LDA.b #$80
	STA.w $2115
	LDA.b #$80
	STA.w $420B
	JMP .next
.fxSteps
	dw $6800, orbit_fx_vram_a
	dw $7000, orbit_fx_vram_b
	dw $7800, orbit_fx_vram_c

; A16 = a chunk c (0-63) of the Mode 7 image -> carry set when it is in
; VRAM (!orbit_m7have). Keeps Y. M16/X16.
orbit_m7_have:
	JSR orbit_m7_bit
	SEP #$20
	AND.l !orbit_m7have,X
	REP #$20
	BEQ +
	SEC
	RTS
+	CLC
	RTS

; A16 = a chunk c: its 512 bytes to VRAM words c * $100 (DMA channel 7,
; in force blank or vblank), and its bit set. Keeps Y. M16/X16.
orbit_m7_send:
	PHA
	XBA                            ; c * $100
	STA.w $2116
	ASL                            ; c * $200
	CLC : ADC.w #orbit_globe_vram
	STA.w $4372
	LDA.w #$1801
	STA.w $4370
	LDA.w #$0200
	STA.w $4375
	SEP #$20
	LDA.b #orbit_globe_vram>>16
	STA.w $4374
	LDA.b #$80
	STA.w $2115
	STA.w $420B
	REP #$20
	PLA
	JSR orbit_m7_bit
	SEP #$20
	ORA.l !orbit_m7have,X
	STA.l !orbit_m7have,X
	REP #$20
	RTS
orbit_m7_send_far:
	JSR orbit_m7_send
	RTL

; A16 = a chunk c -> X16 = its byte in !orbit_m7have (c >> 3), A16 = its
; bit. Keeps Y.
orbit_m7_bit:
	PHA
	LSR : LSR : LSR
	TAX
	PLA
	AND.w #$0007
	PHX
	TAX
	LDA.l .bits,X
	AND.w #$00FF
	PLX
	RTS
.bits
	db $01,$02,$04,$08,$10,$20,$40,$80

; No Mode 7 chunk in VRAM (a scene's start, a shot's load over them).
; Any M/X.
orbit_m7_none:
	PHP
	REP #$20
	LDA.w #$0000
	STA.l !orbit_m7have
	STA.l !orbit_m7have+2
	STA.l !orbit_m7have+4
	STA.l !orbit_m7have+6
	STA.l !orbit_m7next
	PLP
	RTS
orbit_m7_none_far:
	JSR orbit_m7_none
	RTL

; Live picture: Mode 7 globe registers, windows, colour math, palettes and
; the HDMA channels for the next frame.
orbit_nmi_live:
	PHB
	PEA.w $3232 : PLB : PLB
	SEP #$20
	LDA.l !orbit_mpic
	BEQ +
	JSL montage_nmi                ; (a montage picture)
	PLB
	RTS
+
	; The registers only the scene writes (the game's own vblank leaves
	; them alone): once, and again each vblank that has the time. A late
	; one (the game's own work ran long: its digits after a hit) keeps
	; them, so that ours still ends inside vblank. (BG1 / main screen /
	; window masks: bands_nmi.)
	REP #$20
	JSR orbit_vcount
	CMP.w #!ORBIT_NMI_LATE
	SEP #$20
	BCC .fixed
	LDA.w !n_static
	BNE .dynamic
.fixed
	LDA.b #$01
	STA.w !n_static
	LDA.b #$07
	STA.w $2105
	STZ.w $211A                    ; M7SEL: wrap, no flips
	LDA.b #$00                     ; M7B = M7C = 0 (M7A, M7D come by HDMA)
	STA.w $211C : STA.w $211C
	STA.w $211D : STA.w $211D
	STZ.w $2124
	LDA.b #$A0                     ; colour window: W1 and W2
	STA.w $2125
	STZ.w $212A
	LDA.b #$08                     ; colour window = W1 XOR W2 (the rim)
	STA.w $212B
	STZ.w $212F
	LDA.b #$10                     ; colour math inside the colour window only
	STA.w $2130
	LDA.b #$20                     ; add, on the backdrop
	STA.w $2131
	LDA.b #$20|!ORBIT_RIM_R : STA.w $2132
	LDA.b #$40|!ORBIT_RIM_G : STA.w $2132
	LDA.b #$80|!ORBIT_RIM_B : STA.w $2132
	STZ.w $212D
	; BG3 (the HUD, the text panels): the field's map and tiles as C1:FD65
	; sets them (the cosmic montage's shots had BG3 elsewhere)
	LDA.l $7E00E8
	LSR
	LDA.b #$58
	BCC +
	LDA.b #$5C
+	STA.w $2109
	LDA.b #$04
	STA.w $210C
.dynamic
	LDA.w !g_m7x : STA.w $211F
	LDA.w !g_m7x+1 : STA.w $211F
	LDA.w !g_ybase : STA.w $2120
	LDA.w !g_ybase+1 : STA.w $2120
	LDA.w !g_hofs : STA.w $210D
	LDA.w !g_hofs+1 : STA.w $210D
	LDA.w !g_vofs : STA.w $210E
	LDA.w !g_vofs+1 : STA.w $210E
	; (the colours went with the game's palette transfer: orbit_cgram_live)
	; HDMA: channel 2 BGMODE, 3 M7A, 4 M7Y, 6 windows (tables in bank $32).
	REP #$20
	LDA.w #$0500                   ; mode 0, $2105
	STA.w $4320
	LDA.w #!hb_mode                ; (the BGMODE table of the set it takes)
	LDX.w !g_cur_it
	BEQ +
	LDA.w #!hb_mode1
+	STA.w $4322
	LDA.w #$1B42                   ; indirect, mode 2, $211B (M7A)
	STA.w $4330
	LDA.w !g_cur_it
	CLC : ADC.w #!IT_BASE+!it_m7a
	STA.w $4332
	LDA.w #$1E42                   ; indirect, mode 2, $211E (M7D)
	STA.w $4340
	LDA.w !g_cur_it
	CLC : ADC.w #!IT_BASE+!it_m7d
	STA.w $4342
	LDA.w #$2644                   ; indirect, mode 4, $2126-$2129
	STA.w $4360
	LDA.w !g_cur_it
	CLC : ADC.w #!IT_BASE+!it_win
	STA.w $4362
	; what the HDMA reads from now on (the frame's double buffers wait on it)
	LDA.w !g_cur_it
	STA.w !g_shown_it
	LDX.w #$0000
	CMP.w #$0000
	BEQ +
	LDX.w #$0002
+	LDA.w !g_itband,X
	STA.w !bd_shown
	LDA.w !g_itend,X
	STA.w !bd_sline
	SEP #$20
	LDA.w !g_itwbank,X             ; the set's window records: the scene block or the descent's
	STA.w $4367
	LDA.w !g_itbank,X              ; its M7A / M7D rows: bank F7 or the descent's
	STA.w $4337
	STA.w $4347
	REP #$20
	; channel 5: BG3VOFS -1 over a text panel's lines (BG rows show one
	; line earlier than sprites and the browser's overlay), 0 for the HUD;
	; in the pullback TM, the globe's again after the field IRQ's HUD split
	LDA.w #$1202                   ; mode 2, $2112 (twice)
	LDX.w #orbit_vofs_plain
	LDY.w !t_have
	BEQ +
	LDX.w #orbit_vofs_panel
+	LDY.w !g_pull
	BEQ +
	LDA.w #$2C00                   ; mode 0, $212C
	LDX.w #orbit_tm_pull
+	STA.w $4350
	STX.w $4352
	SEP #$20
	LDA.b #orbit_vofs_plain>>16
	STA.w $4354
	LDA.b #$32                     ; the tables in the scene block
	STA.w $4324
	STA.w $4334
	STA.w $4344
	STA.w $4364
	LDA.w !N_HDMA
	ORA.b #!ORBIT_HDMA
	STA.w !N_HDMA
	JSR bands_nmi                  ; the finale's band layers (or the plain layers)
	SEP #$20
	JSR orbit_nmi_cells
	REP #$30
	JSR text_nmi
	SEP #$20
	PLB
	RTS

; OBJ palettes the scene owns: 0 fire, 4 blue, 5 pink, 6 Frieza, 7 gold
; and the stars, 1 Goku (Super Saiyan, as the goku module sets it for his
; form and HUD portrait); the beam bands (entries 2-3 of 4 and 5) take this frame's
; beam-body colours. A8, DB = $32.
orbit_nmi_obj_palettes:
	; palettes 0-1 and 6-7 laid out in CGRAM order in ROM (orbit-sprites.mjs),
	; 4-5 from the scene's image with this frame's band colours
	REP #$20
	LDA.w #$2200                   ; DMA mode 0 to $2122
	STA.w $4370
	LDA.w #orbit_obj_pals_01
	LDX.w !od_base                 ; (the orbital death after the revert)
	BEQ +
	LDA.w #orbit_obj_pals_01b
+	STA.w $4372
	LDA.w #64
	STA.w $4375
	SEP #$20
	LDA.b #orbit_obj_pals_01>>16
	STA.w $4374
	LDA.b #128
	STA.w $2121
	LDA.b #$80
	STA.w $420B
	REP #$20
	LDA.w !wv_white
	BEQ +
	JMP wash_obj_palettes          ; (the victory's whiteout: wash.asm)
+	LDA.w #!OBJ_PALS45
	STA.w $4372
	LDA.w #64
	STA.w $4375
	SEP #$20
	LDA.b #$32
	STA.w $4374
	LDA.b #192
	STA.w $2121
	LDA.b #$80
	STA.w $420B
	REP #$20
	LDA.w !wv_p6
	CMP.w #!OWASH_FRIEZA
	BEQ +
	JMP wash_frieza_palettes       ; (his death flash: wash.asm)
+	LDA.w #orbit_obj_pals_67
	STA.w $4372
	LDA.w #64
	STA.w $4375
	SEP #$20
	LDA.b #orbit_obj_pals_67>>16
	STA.w $4374
	LDA.b #224
	STA.w $2121
	LDA.b #$80
	STA.w $420B
	RTS

; This frame's band colours into OBJ palettes 4-5 as the vblank sends them
; (the drawing picked their frames): Goku's (blue) in entries 2-3 of
; palette 4; Frieza's (pink) in entries 1-3 of palette 5: beam (1 white,
; 2 A, 3 B) or laser (1 A, 2 B, 3 white); in the win Goku's colours in
; palette 5 instead, and the victory's colours (wash.asm). M16/X16, DB = $32.
orbit_pals_frame:
	JSR wash_frame
	LDA.w !v_band
	AND.w #$0001
	ASL : ASL
	TAX
	LDA.l orbit_fx_band_blue,X
	STA.w !OBJ_PALS45+4
	LDA.l orbit_fx_band_blue+2,X
	STA.w !OBJ_PALS45+6
	LDA.w !fn_phase
	CMP.w #!FN_WIN
	BNE +
	JMP wash_goku_palette
+	LDA.w !v_pband
	AND.w #$0001
	ASL : ASL
	TAX
	LDA.w !v_pmode
	BNE .laser
	LDA.w #$7FFF
	STA.w !OBJ_PALS45+32+2
	LDA.l orbit_fx_band_pink,X
	STA.w !OBJ_PALS45+32+4
	LDA.l orbit_fx_band_pink+2,X
	STA.w !OBJ_PALS45+32+6
	RTS
.laser
	LDA.l orbit_fx_band_pink,X
	STA.w !OBJ_PALS45+32+2
	LDA.l orbit_fx_band_pink+2,X
	STA.w !OBJ_PALS45+32+4
	LDA.w #$7FFF
	STA.w !OBJ_PALS45+32+6
	RTS

; Scene start: OBJ palettes 4-5 (blue, pink: adjacent in orbit-fx.mjs's
; data) into the scene's image, the vblank's flags. M16/X16, DB = $32.
orbit_obj_pals_init:
	PHB
	LDX.w #orbit_fx_pal_blue
	LDY.w #!OBJ_PALS45
	LDA.w #63
	MVN $32,orbit_fx_pal_blue>>16
	PLB
	STZ.w !n_static
	STZ.w !n_turn
	JMP orbit_pals_frame

; Dynamic cells wanted by the frame (Frieza's frame, Goku's pose, the Death
; Ball frames), each sent once, while the vblank lasts. A8, DB = $32.
orbit_nmi_cells:
	REP #$30
	JSR pull_nmi_ball              ; (the pullback's Death Ball)
	; Frieza: 4 rows of 128 bytes from bank FA to tiles $000
	LDA.w !v_frieza
	CMP.w !v_frieza_h
	BEQ .goku
	LDA.w #5
	JSR orbit_nmi_room
	BCS .goku
	LDA.w !v_frieza
	STA.w !v_frieza_h
	STA.w !n_src
	LDA.w #!OSP_BANK
	STA.w !n_bank
	LDA.w #$6000+(!OV_FRIEZA*16)
	STA.w !n_vram
	LDA.w #4
	STA.w !n_rows
	LDA.w #128
	STA.w !n_len
	JSR orbit_nmi_rows
.goku
	LDA.w !v_goku
	CMP.w !v_goku_h
	BEQ .d32
	LDA.w #2
	JSR orbit_nmi_room
	BCS .d32
	LDA.w !v_goku
	STA.w !v_goku_h
	STA.w !n_src
	LDA.w #!OSP_BANK
	STA.w !n_bank
	LDA.w #$6000+(!OV_GOKU*16)
	STA.w !n_vram
	LDA.w #2
	STA.w !n_rows
	LDA.w #64
	STA.w !n_len
	JSR orbit_nmi_rows
.d32
	LDA.w !v_d32
	CMP.w !v_d32_h
	BEQ .d16
	LDA.w #5
	JSR orbit_nmi_room
	BCS .d16
	LDA.w !v_d32
	STA.w !v_d32_h
	PHA
	LDA.w #$FFFF                   ; (the outer planet's picture there is gone)
	STA.l !sc_have
	STA.l !sc_nwant
	PLA
	XBA : ASL                      ; * 512
	CLC : ADC.w #orbit_fx_death
	STA.w !n_src
	LDA.w #orbit_fx_death>>16
	STA.w !n_bank
	LDA.w #$6000+(!OV_D32*16)
	STA.w !n_vram
	LDA.w #4
	STA.w !n_rows
	LDA.w #128
	STA.w !n_len
	JSR orbit_nmi_rows
.d16
	LDA.w !v_d16
	CMP.w !v_d16_h
	BEQ .beam
	LDA.w #2
	JSR orbit_nmi_room
	BCS .beam
	LDA.w !v_d16
	STA.w !v_d16_h
	XBA : LSR                      ; * 128
	CLC : ADC.w #orbit_fx_death+(12*512)
	STA.w !n_src
	LDA.w #orbit_fx_death>>16
	STA.w !n_bank
	LDA.w #$6000+(!OV_D16*16)
	STA.w !n_vram
	LDA.w #2
	STA.w !n_rows
	LDA.w #64
	STA.w !n_len
	JSR orbit_nmi_rows
.beam
	JSR vb_nmi                     ; (the boss bursts' pictures first: bursts.asm)
	; a finished beam picture: 4 rows of 128 bytes to its slot
	LDA.w !bg_ready
	BEQ .out
	LDA.w #5
	JSR orbit_nmi_room
	BCS .out
	LDA.w !bg_ready
	DEC
	ASL
	TAX
	LDA.l beam_slot_vram,X
	STA.w !n_vram
	LDA.w !bg_key
	STA.w !bs_have,X
	STZ.w !bg_ready
	LDA.w !bg_src                  ; the buffer, or a picture made by the generator
	STA.w !n_src
	LDA.w !bg_bank
	STA.w !n_bank
	LDA.w #4
	STA.w !n_rows
	LDA.w #128
	STA.w !n_len
	JSR orbit_nmi_rows
.out
	; what is left: the band layer's map and the generator's class-1
	; pictures, taking turns when both wait
	LDA.w !n_turn
	BEQ +
	JSR orbit_nmi_queue
	JSR bands_nmi_map
	JSR sc_nmi                     ; (the distant bodies' pictures: scdraw.asm)
	SEP #$20
	RTS
+	JSR bands_nmi_map
	JSR orbit_nmi_queue
	JSR sc_nmi                     ; (the distant bodies' pictures: scdraw.asm)
	SEP #$20
	RTS

; The generator's class-1 pictures the frame queued (beam_queue), in its
; order, while the vblank has room. M16/X16.
orbit_nmi_queue:
-	LDA.w !bq_i
	CMP.w !bq_n
	BCS +
	LDA.w #5
	JSR orbit_nmi_room
	BCS +
	LDA.w !bq_i
	ASL : ASL : ASL
	TAY
	LDX.w !BQ_E+0,Y
	LDA.l beam_slot_vram,X
	STA.w !n_vram
	LDA.w !BQ_E+6,Y
	STA.w !bs_have,X
	LDA.w !BQ_E+2,Y
	STA.w !n_src
	LDA.w !BQ_E+4,Y
	STA.w !n_bank
	LDA.w #4
	STA.w !n_rows
	LDA.w #128
	STA.w !n_len
	JSR orbit_nmi_rows
	INC.w !bq_i
	STZ.w !n_turn
	BRA -
+	RTS

; Carry clear when the vblank has room for an upload of A16 scanlines: it
; would end by !ORBIT_NMI_END. The modules after ours and the field's HDMA
; enable must still come before line 262: past it the HDMA misses its
; start of frame and the picture is lost for a frame. A 512-byte cell in
; 4 rows takes 4.3 lines, a band map (896 bytes) 5.5, a text panel 6.
; The game's own vblank (its palette, OAM and, during a hit, its digits)
; ends anywhere from line 236 to 250. M16.
orbit_nmi_room:
	STA.w !n_cost
	SEP #$20
	LDA.w $213F
	LDA.w $2137
	LDA.w $213D
	XBA
	LDA.w $213D
	AND.b #$01
	XBA
	REP #$20
	CMP.w #225
	BCC .late
	CLC : ADC.w !n_cost
	CMP.w #!ORBIT_NMI_END+1
	BCS .late
	CLC
	RTS
.late
	SEC
	RTS

; orbit_nmi_room and orbit_picture_init for the second code area (JSL;
; M16, DB = $32).
orbit_nmi_room_far:
	JSR orbit_nmi_room
	RTL

orbit_picture_init_far:
	JSR orbit_picture_init
	RTL

; modules_cgram_upload (core/cgram.asm, at the game's own palette transfer;
; JSL, M16/X16, DB = 0): while the scene shows, its colours in that same
; transfer (carry set: sent): a montage picture's, or the game's palette
; with the globe picture's colours over it. The transfer also runs on lag
; vblanks that skip the modules' vblank work (the game's damage flash, an
; open ring menu): the scene's colours hold there too. Else the game's own.
orbit_cgram_upload:
	PHP
	SEP #$20
	LDA.l !orbit_state
	CMP.b #!OS_LIVE
	BNE .no
	REP #$30
	PHB
	PEA.w $3232 : PLB : PLB
	SEP #$20
	LDA.l !orbit_mpic
	REP #$20
	BEQ .globe
	JSL montage_cgram
	BRA .sent
.globe
	JSR orbit_cgram_live
	; HDMA channels 0-1 (the band lines' colour math and BG1 scroll, then
	; the rim's): the native NMI clears their $2C bits before this transfer
	; (C0:C0DE, the game's window channels, while $010E is set), and on a
	; vblank that skips the modules (an incomplete frame) nothing set them
	; again: that frame ran without them, the bands' windows taking the
	; rim's colour math (bright blue blocks over the rays). Their registers
	; and tables are still ours there (the module vblank set them up, and
	; the game sends nothing on them), so they stay on.
	LDA.w !n_static
	AND.w #$00FF
	BEQ .sent
	SEP #$20
	LDA.b #$03
	TSB.w !N_HDMA
	REP #$20
.sent
	PLB
	PLP
	SEC
	RTL
.no
	PLP
	CLC
	RTL

; The globe picture's colours (DB = $32, M16/X16): the game's palette, then
; over it the backdrop (the sky), the globe (light level 3), OBJ palettes
; 0-1 and 4-7, the text panel's while one shows or is due, the band
; layers' while the set the vblank takes shows them.
orbit_cgram_live:
	LDA.w #$0000
	LDY.w #512
	JSL core_cgram_native
	SEP #$20
	STZ.w $2121
	LDA.w !wv_sky : STA.w $2122    ; (the sky; washed in the victory's
	LDA.w !wv_sky+1 : STA.w $2122  ; whiteout: wash.asm)
	LDA.b #!ORBIT_GLOBE_CGRAM
	STA.w $2121
	REP #$20
	LDA.w #$2200                   ; DMA mode 0 to $2122
	STA.w $4370
	LDA.w #2*!ORBIT_GLOBE_COLORS
	STA.w $4375
	LDA.w !wv_white
	BNE +
	LDA.w #orbit_globe_pal+(2*2*96) ; light level 3
	STA.w $4372
	SEP #$20
	LDA.b #orbit_globe_pal>>16
	BRA ++
+	LDA.w !wv_base                 ; (washed)
	STA.w $4372
	SEP #$20
	LDA.b #(!XDATA_ORBIT_WASH)>>16
++	STA.w $4374
	LDA.b #$80
	STA.w $420B
	JSR orbit_nmi_obj_palettes
	REP #$20
	LDA.w !t_have
	ORA.w !t_want
	SEP #$20
	BEQ +
	JSR text_palettes
+	REP #$20
	LDX.w #$0000                   ; (the set the vblank takes: its band lines)
	LDA.w !g_cur_it
	BEQ +
	LDX.w #$0002
+	LDA.w !g_itend,X
	BEQ +
	LDA.w !g_itband,X
	BEQ +
	JSR bands_cgram
+	REP #$30
	RTS

; n_rows DMAs of n_len bytes from n_bank:n_src to n_vram, n_vram + $100,
; ... (OBJ rows are 16 tiles apart). M16/X16.
orbit_nmi_rows:
	SEP #$20
	LDA.b #$80
	STA.w $2115
	LDA.w !n_bank
	STA.w $4374
	REP #$20
	LDA.w #$1801
	STA.w $4370
.row
	LDA.w !n_vram
	STA.w $2116
	CLC : ADC.w #$0100
	STA.w !n_vram
	LDA.w !n_src
	STA.w $4372
	CLC : ADC.w !n_len
	STA.w !n_src
	LDA.w !n_len
	STA.w $4375
	SEP #$20
	LDA.b #$80
	STA.w $420B
	REP #$20
	DEC.w !n_rows
	BNE .row
	RTS

; Give the picture back: the field's registers from the map loader's
; shadows (C2:AAB3), our HDMA channels off. The game re-sends its palette
; and BG scroll itself every frame.
orbit_nmi_restore:
	SEP #$20
	LDA.b #$09
	STA.w $2105
	STZ.w $211A
	STZ.w $2123
	STZ.w $2124
	STZ.w $2125
	STZ.w $212A
	STZ.w $212B
	STZ.w $212E
	STZ.w $212F
	LDA.b #$02
	STA.w $2130
	LDA.w !N_CGADSUB
	STA.w $2131
	LDA.b #$E0
	STA.w $2132
	LDA.w !N_TM
	STA.w $212C
	LDA.w !N_TS
	STA.w $212D
	LDA.w !N_HDMA
	AND.b #~!ORBIT_HDMA
	STA.w !N_HDMA
	RTS

orbit_star_colors:
	dw !ORBIT_STAR_COLORS
