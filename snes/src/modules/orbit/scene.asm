; Scene ownership: field-frame and field-vblank hooks, commands, the art
; load, PPU registers of the globe picture and the hand-back to the field.
; Included by module.asm in the code bank.

; ---------------------------------------------------------------------------
; modules_field_frame: after the game's logic and OAM build, before the NMI
; handshake. M16/X16, DB = $7E, D = 0.
orbit_field_frame:
	PHB
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
	LDA.l !orbit_state
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
	REP #$30
.common
	JSR orbit_suppress_native
	JSR orbit_oam_frame
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

; Tests: show the globe with the camera already written to the scene block.
orbit_start_test:
	REP #$30
	JSR orbit_scene_init
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
	LDA.w #$FFFF
	STA.w !g_cx
	STA.w !g_lr
	STA.w !g_icy
	STZ.w !g_lw
	STZ.w !g_cur_it
	STZ.w !g_ichg
	STZ.w !g_bld
	STZ.w !f_on
	STZ.w !v_pband
	STZ.w !v_pmode
	STZ.w !t_want
	STZ.w !t_have
	JSR beam_init
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
	; starfield: fresh accumulators, everything stale
	LDA.w #$0000
	STA.l !orbit_frame
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
	RTS

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
	JSR orbit_vcount
	CMP.w #!ORBIT_DEADLINE
	BCS .done
	JSR beam_update                ; beam pictures first: the most visible
	REP #$30
	JSR orbit_vcount
	CMP.w #!ORBIT_DEADLINE
	BCS .done
	LDA.w !g_bld
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
	LDA.w !f_on
	BEQ .noFight
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
-	JSR fight_frame
	REP #$30
	DEC.w !f_steps
	BNE -
	LDA.w !fn_phase
	BEQ +
	JSR finale_camera              ; the clash's own camera (clashCamera)
+	JSR text_frame
	INC.w !cam_age
	JSR globe_frame
	JSR stars_frame
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

; frieza.js returnToFortress (finale.asm, at victoryTiming.return): the
; picture goes back to the native deck. (Next: the deck's reload.)
orbit_return:
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
	JSR fight_draw
	JSR stars_oam
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
	PHP
	SEP #$20
	LDA.l !orbit_state
	BNE .on
	PLP
	RTL
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
	LDA.b #$00
	STA.l !orbit_flags
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
; the field NMI keeps until C0:C15F), then the star cells.
orbit_nmi_load:
	SEP #$20
	STZ.w $212C
	STZ.w $212D
	LDA.w !N_HDMA
	AND.b #~!ORBIT_HDMA
	STA.w !N_HDMA
	LDA.l !orbit_load
	CMP.b #$08
	BCS .stars
	; Step n: VRAM words n*$800.., ROM $F6:n*$1000.
	REP #$20
	AND.w #$00FF
	XBA                            ; n * $100
	ASL : ASL : ASL                ; n * $800 (VRAM word address)
	STA.w $2116
	ASL                            ; n * $1000 (source offset)
	CLC : ADC.w #orbit_globe_vram
	STA.w $4372
	LDA.w #$1801                   ; DMA mode 1 to $2118/$2119
	STA.w $4370
	LDA.w #$1000
	STA.w $4375
	SEP #$20
	LDA.b #orbit_globe_vram>>16
	STA.w $4374
	LDA.b #$80
	STA.w $2115
	LDA.b #$80
	STA.w $420B
	JMP .next
.stars
	CMP.b #$08
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
	BRA .next
.effects
	; Steps 9-11: the fight's resident effect cells (OBJ tiles $080-$0FF,
	; $100-$13F, $180-$1BF); step 12: the text panel's BG3 tiles; step 13:
	; OBJ tiles $000-$03F (the cells beside the dynamic ones).
	CMP.b #$0C
	BEQ .text
	CMP.b #$0D
	BNE +
	JMP .fxd
+	BCS .finish
	REP #$20
	AND.w #$00FF
	SEC : SBC.w #$0009
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

; Live picture: Mode 7 globe registers, windows, colour math, palettes and
; the HDMA channels for the next frame.
orbit_nmi_live:
	PHB
	PEA.w $3232 : PLB : PLB
	SEP #$20
	LDA.b #$07
	STA.w $2105
	STZ.w $211A                    ; M7SEL: wrap, no flips
	LDA.b #$00                     ; M7B = M7C = 0 (M7A, M7D come by HDMA)
	STA.w $211C : STA.w $211C
	STA.w $211D : STA.w $211D
	LDA.w !g_m7x : STA.w $211F
	LDA.w !g_m7x+1 : STA.w $211F
	LDA.w !g_ybase : STA.w $2120
	LDA.w !g_ybase+1 : STA.w $2120
	LDA.w !g_hofs : STA.w $210D
	LDA.w !g_hofs+1 : STA.w $210D
	LDA.w !g_vofs : STA.w $210E
	LDA.w !g_vofs+1 : STA.w $210E
	LDA.b #$03                     ; BG1: window 1, inverted (shown inside W1)
	STA.w $2123
	STZ.w $2124
	LDA.b #$A0                     ; colour window: W1 and W2
	STA.w $2125
	STZ.w $212A
	LDA.b #$08                     ; colour window = W1 XOR W2 (the rim)
	STA.w $212B
	LDA.b #$01                     ; mask BG1 on the main screen
	STA.w $212E
	STZ.w $212F
	LDA.b #$10                     ; colour math inside the colour window only
	STA.w $2130
	LDA.b #$20                     ; add, on the backdrop
	STA.w $2131
	LDA.b #$20|!ORBIT_RIM_R : STA.w $2132
	LDA.b #$40|!ORBIT_RIM_G : STA.w $2132
	LDA.b #$80|!ORBIT_RIM_B : STA.w $2132
	LDA.b #$15                     ; BG1, BG3, OBJ
	STA.w $212C
	STZ.w $212D
	; Colours: backdrop = sky, the globe (light level 3), the stars.
	STZ.w $2121
	LDA.b #!ORBIT_SKY : STA.w $2122
	LDA.b #!ORBIT_SKY>>8 : STA.w $2122
	LDA.b #!ORBIT_GLOBE_CGRAM
	STA.w $2121
	REP #$20
	LDA.w #$2200                   ; DMA mode 0 to $2122
	STA.w $4370
	LDA.w #orbit_globe_pal+(2*2*96) ; light level 3
	STA.w $4372
	LDA.w #2*!ORBIT_GLOBE_COLORS
	STA.w $4375
	SEP #$20
	LDA.b #orbit_globe_pal>>16
	STA.w $4374
	LDA.b #$80
	STA.w $420B
	JSR orbit_nmi_obj_palettes
	JSR text_palettes
	; HDMA: channel 2 BGMODE, 3 M7A, 4 M7Y, 6 windows (tables in bank $32).
	REP #$20
	LDA.w #$0500                   ; mode 0, $2105
	STA.w $4320
	LDA.w #!hb_mode
	STA.w $4322
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
	; channel 5: BG3VOFS -1 over a text panel's lines (BG rows show one
	; line earlier than sprites and the browser's overlay), 0 for the HUD
	LDA.w #$1202                   ; mode 2, $2112 (twice)
	STA.w $4350
	LDA.w #orbit_vofs_plain
	LDX.w !t_have
	BEQ +
	LDA.w #orbit_vofs_panel
+	STA.w $4352
	SEP #$20
	LDA.b #orbit_vofs_plain>>16
	STA.w $4354
	LDA.b #$32
	STA.w $4324
	STA.w $4334
	STA.w $4344
	STA.w $4364
	STA.w $4367                    ; window records in the scene block
	LDA.b #!FL>>16
	STA.w $4337                    ; M7A / M7D rows in ROM
	STA.w $4347
	LDA.w !N_HDMA
	ORA.b #!ORBIT_HDMA
	STA.w !N_HDMA
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
	REP #$20
	LDA.w #$2200                   ; DMA mode 0 to $2122
	STA.w $4370
	LDA.w #32
	STA.w $4375
	SEP #$20
	LDA.b #orbit_fx_pal_fire>>16
	STA.w $4374
	LDX.w #$0000
.pal
	LDA.l .cgram,X
	STA.w $2121
	REP #$20
	LDA.l .src,X
	STA.w $4372
	LDA.w #32
	STA.w $4375
	SEP #$20
	LDA.b #$80
	STA.w $420B
	INX : INX
	CPX.w #$000C
	BCC .pal
	; band colours: blue entries 2-3, pink entries 2-3
	REP #$20
	LDA.w !v_band
	AND.w #$0001
	ASL : ASL
	TAX
	SEP #$20
	LDA.b #192+2
	STA.w $2121
	LDA.l orbit_fx_band_blue,X : STA.w $2122
	LDA.l orbit_fx_band_blue+1,X : STA.w $2122
	LDA.l orbit_fx_band_blue+2,X : STA.w $2122
	LDA.l orbit_fx_band_blue+3,X : STA.w $2122
	; pink: beam (1 white, 2 A, 3 B) or laser (1 A, 2 B, 3 white), with
	; its own colour frame
	REP #$20
	LDA.w !v_pband
	AND.w #$0001
	ASL : ASL
	TAX
	SEP #$20
	LDA.b #208+1
	STA.w $2121
	LDA.w !v_pmode
	BNE .laser
	LDA.b #$FF : STA.w $2122       ; 1: white
	LDA.b #$7F : STA.w $2122
	LDA.l orbit_fx_band_pink,X : STA.w $2122
	LDA.l orbit_fx_band_pink+1,X : STA.w $2122
	LDA.l orbit_fx_band_pink+2,X : STA.w $2122
	LDA.l orbit_fx_band_pink+3,X : STA.w $2122
	RTS
.laser
	LDA.l orbit_fx_band_pink,X : STA.w $2122
	LDA.l orbit_fx_band_pink+1,X : STA.w $2122
	LDA.l orbit_fx_band_pink+2,X : STA.w $2122
	LDA.l orbit_fx_band_pink+3,X : STA.w $2122
	LDA.b #$FF : STA.w $2122       ; 3: white
	LDA.b #$7F : STA.w $2122
	RTS
.cgram
	dw 128, 192, 208, 224, 240, 144
.src
	dw orbit_fx_pal_fire, orbit_fx_pal_blue, orbit_fx_pal_pink, orbit_pal_frieza, orbit_fx_pal_gold
	dw orbit_pal_goku_ssj          ; palette 1: the goku module's Super Saiyan colours

; Dynamic cells wanted by the frame (Frieza's frame, Goku's pose, the Death
; Ball frames), each sent once, while the vblank lasts. A8, DB = $32.
orbit_nmi_cells:
	REP #$30
	; Frieza: 4 rows of 128 bytes from bank FA to tiles $000
	LDA.w !v_frieza
	CMP.w !v_frieza_h
	BEQ .goku
	JSR orbit_nmi_time
	BCC +
	JMP .out
+
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
	JSR orbit_nmi_time
	BCC +
	JMP .out
+
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
	JSR orbit_nmi_time
	BCC +
	JMP .out
+
	LDA.w !v_d32
	STA.w !v_d32_h
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
	JSR orbit_nmi_time
	BCS .out
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
	; a finished beam picture: 4 rows of 128 bytes to its slot
	LDA.w !bg_ready
	BEQ .out
	JSR orbit_nmi_time
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
	LDA.w #!BEAM_BUF
	STA.w !n_src
	LDA.w #$0032
	STA.w !n_bank
	LDA.w #4
	STA.w !n_rows
	LDA.w #128
	STA.w !n_len
	JSR orbit_nmi_rows
.out
	SEP #$20
	RTS

; Carry set when the scanline is past 247 or not in vblank (a 512-byte
; cell takes about three lines; the field NMI's own work follows ours and
; must end inside vblank, after line 261). M16.
orbit_nmi_time:
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
	CMP.w #248
	BCS .late
	CLC
	RTS
.late
	SEC
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
