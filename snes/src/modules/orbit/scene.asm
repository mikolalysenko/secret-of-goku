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
	CMP.b #!OC_STOP
	BNE .done
	LDA.l !orbit_state
	BEQ .done
	LDA.b #!OS_STOP
	STA.l !orbit_state
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
	; starfield: fresh accumulators, everything stale
	LDA.w #$7FFF
	STA.w !s_kx
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
	STA.w !s_qb
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
	SEP #$20
	LDA.l !orbit_state
	CMP.b #!OS_LIVE
	REP #$20
	BNE .close
	JSR stars_oam
.close
	; Hide what is left of the table and close the module area.
	LDX.w !o_slot
.rest
	CPX.w #$0200
	BCS .full
	LDA.w #$E0FF
	STA.w $0800,X
	INX : INX : INX : INX
	BRA .rest
.full
	LDA.w #$0200
	STA.l !core_oam_cursor
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
	BRA .next
.stars
	CMP.b #$08
	BNE .finish
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
	LDA.b #128+(16*!ORBIT_STAR_PAL)+1
	STA.w $2121
	LDX.w #$0000
.starPal
	LDA.l orbit_star_colors,X
	STA.w $2122
	INX
	CPX.w #$0008
	BCC .starPal
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
	SEP #$20
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
	PLB
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
