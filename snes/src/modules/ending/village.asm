; Potos village and Goku's departure (good ending), over the native picture
; (shenron-ending.js prepare 'village'/'depart', ending-departure.js,
; planet-view.js depart).
;
; Village (A5): Randi is the native boy again (ES_NATIVEBOY: the goku
; module keeps him, GOKU_CTL_SUPPRESS); Goku stands beside him, his 32x32
; cell's top-left at the boy's (x + 10, y - 31) every frame.
; Departure (DE, 300 frames): from the boy's position + 26, Goku stands,
; gathers ki (12-56, two charge orbs until 72) and lifts off (56: y - .055
; t^2); the whole picture whitens (114-144); then the day globe with a
; miniature Goku flying off (144-300), the white clearing (144-174) and a
; fade to black (266-300).
;
; Overlay sprites: core front OAM (in front of every native sprite; the
; dialogue's BG3 priority tiles stay above), cells in the OBJ VRAM region
; FIELD_OBJ_A (claimed from core), OBJ palettes 6 (orbs) and 7 (Goku) in
; the game's palette buffer.
!OV_OWNER     = $09          ; core_vram_claim owner (module bank A9/E9)
!OV_CELL_ORB  = 4            ; cells 4-5 (cells 0-3: Goku's quad)
!OV_PAL_ORB   = $00E0        ; OBJ palette 6 (first colour)
!OV_PAL_GOKU  = $00F0        ; OBJ palette 7
!OV_ATTR_ORB  = $3C00        ; priority 3, palette 6
!OV_ATTR_GOKU = $3E00        ; priority 3, palette 7
!DP_CHARGE  = 12             ; ending-departure.js departureTiming
!DP_LAUNCH  = 56
!DP_CLOUD   = 114
!DP_SPACE   = 144
!DP_CLEAR   = 174
!DP_FADE    = 266
!DP_END     = 300
!DP_COPY    = !DP_CLOUD-7    ; the game's colours are taken over 7 frames

!ov_cell    = !s_var+$00   ; word  Goku pose queued (column | row << 8), $FFFF none
!ov_orb0    = !s_var+$02   ; word  orb frame queued into cell 4, $FFFF none
!ov_orb1    = !s_var+$04   ; word  cell 5
!ov_x       = !s_var+$06   ; word  departure take-off point
!ov_y       = !s_var+$08
!ov_gx      = !s_var+$0A   ; word  Goku's bottom centre this frame
!ov_gy      = !s_var+$0C
!ov_tmp     = !s_var+$0E
!ov_ready   = !s_var+$10   ; word  bit 0 Goku's, bit 1 the orbs' cells reached VRAM
!ov_tile    = !s_var+$12   ; word  quad tile and attributes
!ov_buf     = !s_var+$14   ; word  the game's palette buffer (cloud copy)
!ov_end     = !s_var+$16   ; word
!ov_space   = !s_var+$5C   ; word  the space half has started (clear of sp_*)

; ---------------------------------------------------------------------------
; Take the overlay: the native picture stays, our sprites go in front.
begin_overlay:
	; (the game's palette buffer is never written: the upload handler sends
	; our ranges in its place, ending_cgram_upload)
	SEP #$20
	LDA.b #!FAM_OVERLAY
	STA.w !s_family
	LDA.b #$01
	STA.l !ending_live
	LDA.b #$00
	STA.w !s_loading
	STA.w !s_ldvis
	STA.w !s_regson
	STA.w !s_fullscreen
	STA.w !s_palcount
	STA.w !s_bg3cut
	STA.w !s_win
	LDA.l !ending_status
	ORA.b #!ES_ACTIVE|!ES_NATIVEBOY
	STA.l !ending_status
	REP #$30
	STZ.w !s_fadeb
	STZ.w !s_fadew
	STZ.w !s_fadeb2
	STZ.w !s_glowr
	STZ.w !s_glowg
	STZ.w !s_glowb
	STZ.w !s_edgeon
	STZ.w !ov_space
	LDA.w #$FFFF
	STA.w !s_fadekey
	LDA.w #$00FF
	STA.w !s_ebright
	LDA.w !s_dqtail
	STA.w !s_dqhead
	LDA.l $7E0000+!N_MAP
	STA.l !ending_map0
	JSR overlay_reset
	; OBJ VRAM for our cells
	SEP #$20
	LDA.w !s_ovclaim
	BNE .claimed
	REP #$30
	PHB
	PEA $7E7E : PLB : PLB
	LDA.w #!VRAM_FIELD_OBJ_A
	LDX.w #!OV_OWNER
	JSL core_vram_claim
	PLB
	REP #$30
	BCS .palette              ; held by another module: no sprites
	SEP #$20
	LDA.b #$01
	STA.w !s_ovclaim
.claimed
	REP #$30
	LDA.w #$7220              ; core_vram_base, FIELD_OBJ_A
	STA.w !s_cellvram
	LDA.w #$0122
	STA.w !s_celltile
.palette
	; OBJ palettes 6-7 (the orbs here; Goku's colours come with his pose)
	REP #$30
	LDA.w #$0010
	LDX.w #ending_orb_palette
	LDY.w #!OV_PAL_ORB
	JSR pal_set
	LDA.w #!OV_PAL_ORB
	LDX.w #$0020
	JMP pal_range

; Nothing of ours in the cells yet.
overlay_reset:
	REP #$30
	LDA.w #$FFFF
	STA.w !ov_cell
	STA.w !ov_orb0
	STA.w !ov_orb1
	STZ.w !ov_ready
	RTS

; A native map load under the overlay: the scene goes on (Goku stays with
; the boy, as in the browser) and the cells are sent again.
overlay_map_change:
	REP #$30
	LDA.w !N_MAP
	STA.l !ending_map0
	JMP overlay_reset

; Give the OBJ VRAM region back (release paths, the departure's space).
end_overlay:
	PHP
	SEP #$20
	LDA.w !s_ovclaim
	BEQ .done
	LDA.b #$00
	STA.w !s_ovclaim
	REP #$30
	PHB
	PEA $7E7E : PLB : PLB
	LDA.w #!VRAM_FIELD_OBJ_A
	LDX.w #!OV_OWNER
	JSL core_vram_release
	PLB
.done
	PLP
	RTS

; One 16x16 front sprite: o_x/o_y (signed), A16 = OAM bytes 2-3. A sprite
; above y = -32 would wrap to the bottom of the screen: skipped.
ov_put:
	STA.l !core_spr_tile
	LDA.w !o_y
	CLC
	ADC.w #$0020
	CMP.w #$0100              ; y in [-32, 224)
	BCS .skip
	LDA.w !o_x
	STA.l !core_spr_x
	LDA.w !o_y
	STA.l !core_spr_y
	LDA.w #$0000
	STA.l !core_spr_size
	PHB
	PEA $7E7E : PLB : PLB
	JSL core_oam_add_front
	PLB
	REP #$30
.skip
	RTS

; Cells reach VRAM in the vblank after they are queued; before the first
; upload they hold nothing of ours.
ov_track:
	JSR queue_idle
	BNE .busy
	LDA.w !ov_cell
	CMP.w #$FFFF
	BEQ .noGoku
	LDA.w #$0001
	TSB.w !ov_ready
.noGoku
	LDA.w !ov_orb0
	CMP.w #$FFFF
	BEQ .busy
	LDA.w #$0002
	TSB.w !ov_ready
.busy
	RTS

; Goku's quad (cells 0-3) with its bottom centre at (ov_gx, ov_gy).
ov_goku:
	LDA.w !ov_ready
	AND.w #$0001
	BEQ .none
	LDA.w #$0000
	JSR cell_tile
	ORA.w #!OV_ATTR_GOKU
	STA.w !ov_tile
	LDA.w !ov_gx
	SEC
	SBC.w #16
	STA.w !o_x
	LDA.w !ov_gy
	SEC
	SBC.w #32
	STA.w !o_y
	LDA.w !ov_tile
	JSR ov_put                ; TL
	LDA.w !o_x
	CLC
	ADC.w #16
	STA.w !o_x
	LDA.w !ov_tile
	CLC
	ADC.w #$0002
	JSR ov_put                ; TR
	LDA.w !o_y
	CLC
	ADC.w #16
	STA.w !o_y
	LDA.w !ov_tile
	CLC
	ADC.w #$0006
	JSR ov_put                ; BR
	LDA.w !o_x
	SEC
	SBC.w #16
	STA.w !o_x
	LDA.w !ov_tile
	CLC
	ADC.w #$0004
	JMP ov_put                ; BL
.none
	RTS

; Goku's pose (base form, atlas column X, row Y) into cells 0-3 and OBJ
; palette 7 when it changed.
ov_pose:
	STX.w !ov_tmp
	TYA
	XBA
	ORA.w !ov_tmp
	CMP.w !ov_cell
	BEQ .same
	STA.w !ov_cell
	LDA.w !s_ovclaim
	AND.w #$00FF
	BEQ .same
	LDA.w #$0000
	STA.w !s_tmp+6            ; cells 0-3
	LDA.w #!OV_PAL_GOKU
	STA.w !s_tmp+4
	LDA.w #$0000              ; base form (the summon cue ended Super Saiyan)
	JSR queue_goku
.same
	RTS

; ---------------------------------------------------------------------------
start_village:
	REP #$30
	JMP begin_overlay

frame_village:
	REP #$30
	LDX.w #$0000
	LDY.w #$0000
	JSR ov_pose
	JSR ov_track
	; blit at (x + 10, y - 31): the quad's bottom centre is (x + 26, y + 1)
	LDA.l $7EE020
	CLC
	ADC.w #26
	STA.w !ov_gx
	LDA.l $7EE022
	INC
	STA.w !ov_gy
	JSR ov_goku
	JMP mark_done

; ---------------------------------------------------------------------------
start_depart:
	REP #$30
	JSR begin_overlay
	REP #$30
	; the take-off point: the boy + 26 (shenron-ending cue('depart'))
	LDA.l $7EE020
	CLC
	ADC.w #26
	STA.w !ov_x
	STA.l !ending_depart_x
	LDA.l $7EE022
	STA.w !ov_y
	STA.l !ending_depart_y
	RTS

frame_depart:
	REP #$30
	LDA.l !ending_age
	CMP.w #!DP_SPACE
	BCC .village
	JMP depart_space
.village
	JSR depart_status
	; departurePose: column 0 / 54 (charging) / 38 (flight), row 0 / 3
	LDX.w #$0000
	LDY.w #$0000
	LDA.l !ending_age
	CMP.w #!DP_CHARGE
	BCC .cell
	LDX.w #54
	CMP.w #!DP_LAUNCH
	BCC .cell
	LDX.w #38
	LDY.w #3
.cell
	JSR ov_pose
	JSR ov_track
	; the take-off point, risen by .055 t^2 after the launch
	LDA.w !ov_x
	STA.w !ov_gx
	LDA.w !ov_y
	STA.w !ov_gy
	LDA.l !ending_age
	SEC
	SBC.w #!DP_LAUNCH
	BCC .ground
	ASL
	TAX
	LDA.l ending_depart_rise,X
	CLC
	ADC.w !ov_gy
	STA.w !ov_gy
.ground
	; the cell's top-left is (x - 16, y - 31): bottom centre (x, y + 1)
	INC.w !ov_gy
	JSR depart_orbs
	JSR ov_goku
	JMP depart_cloud

; Charging 12-56, airborne 56-266 (shenron-ending charging/airborne); the
; flight sound at the launch.
depart_status:
	SEP #$20
	LDA.l !ending_status
	AND.b #~(!ES_CHARGING|!ES_AIRBORNE)
	STA.l !ending_status
	REP #$20
	LDA.l !ending_age
	CMP.w #!DP_CHARGE
	BCC .done
	CMP.w #!DP_FADE
	BCS .done
	LDX.w #!ES_AIRBORNE
	CMP.w #!DP_LAUNCH
	BCS .set
	LDX.w #!ES_CHARGING
.set
	TXA
	SEP #$20
	ORA.l !ending_status
	STA.l !ending_status
	REP #$20
	LDA.l !ending_age
	CMP.w #!DP_LAUNCH
	BNE .done
	LDA.w #!ESFX_FLIGHT
	JSR ending_sound
.done
	RTS

; Charge orbs (12 <= age < 72): charge-orb frames age/8 and age/8 + 2
; (of 5), stamped at (x - 13, y - 14) and (x + 13, y - 8) of the pose
; (orbit-effects stamp: the 16x16 cell's top-left at (x - 8, y - 8)).
depart_orbs:
	LDA.l !ending_age
	CMP.w #!DP_CHARGE
	BCC .off
	CMP.w #!DP_LAUNCH+16
	BCC .on
.off
	RTS
.on
	LSR : LSR : LSR
	STA.w !ov_tmp
	LDY.w #!ENDING_ORB_FRAMES
	JSR div_a_y               ; X = frame % 5
	TXA
	LDX.w #!OV_CELL_ORB
	LDY.w #!ov_orb0
	JSR depart_orb_cell
	LDA.w !ov_tmp
	CLC
	ADC.w #$0002
	LDY.w #!ENDING_ORB_FRAMES
	JSR div_a_y
	TXA
	LDX.w #!OV_CELL_ORB+1
	LDY.w #!ov_orb1
	JSR depart_orb_cell
	LDA.w !ov_ready
	AND.w #$0002
	BEQ .off
	; the pose is (ov_gx, ov_gy - 1)
	LDA.w !ov_gx
	SEC
	SBC.w #13+8
	STA.w !o_x
	LDA.w !ov_gy
	SEC
	SBC.w #1+14+8
	STA.w !o_y
	LDA.w #!OV_CELL_ORB
	JSR cell_tile
	ORA.w #!OV_ATTR_ORB
	JSR ov_put
	LDA.w !ov_gx
	CLC
	ADC.w #13-8
	STA.w !o_x
	LDA.w !ov_gy
	SEC
	SBC.w #1+8+8
	STA.w !o_y
	LDA.w #!OV_CELL_ORB+1
	JSR cell_tile
	ORA.w #!OV_ATTR_ORB
	JMP ov_put

; Orb frame A into cell X when the frame recorded at Y changed.
depart_orb_cell:
	CMP.w $0000,Y
	BNE .new
	RTS
.new
	STA.w $0000,Y
	XBA                       ; frame * 256
	LSR                       ; * 128 bytes per cell
	CLC
	ADC.w #ending_orb_cells
	STA.w !q_src
	TXA
	JSR cell_vram
	STA.w !q_dest
	SEP #$20
	LDA.b #ending_orb_cells>>16
	STA.w !q_src+2
	LDA.b #!LD_CELL16
	STA.w !q_mode
	REP #$20
	LDA.w #$0080
	STA.w !q_size
	JMP queue_add

; The cloud (114-144): the whole picture mixes towards white by
; (age - 114) / 30, each pixel as one colour (shenron-ending depart). Every
; colour goes through the palette pipeline (colour math could only add a
; constant): from 107 the game's colours 0-223 become base colours (32 a
; frame, straight into s_palout as well: white 0), and at 114 one range
; takes all 256 colours. palette_build's round robin (as many colours as
; the frame has time for) leaves a colour a few frames behind the mix.
depart_cloud:
	LDA.l !ending_age
	CMP.w #!DP_COPY
	BCS .from
	RTS
.from
	CMP.w #!DP_CLOUD
	BCS .cloud
	SEC
	SBC.w #!DP_COPY
	XBA                       ; block * 64 bytes (32 colours)
	LSR : LSR
	JMP depart_copy
.cloud
	BNE .level
	SEP #$20
	LDA.b #$00
	STA.w !s_palcount
	REP #$20
	LDA.w #$0000
	LDX.w #$0000              ; count 0 = 256 colours
	JSR pal_range
	SEP #$20
	LDA.b #$00
	STA.w !s_pbnow            ; the outputs are current (white 0)
	REP #$20
.level
	LDA.l !ending_age
	SEC
	SBC.w #!DP_CLOUD
	XBA
	LDY.w #30
	JSR div_a_y
	STA.w !s_fadew
	RTS

; 32 colours from byte offset A of the game's palette buffer (the one the
; field NMI uploads: 7E:0600, 7E:BE00 while $2A is set) into base colours
; and outputs.
depart_copy:
	STA.w !ov_tmp
	CLC
	ADC.w #$0040
	STA.w !ov_end
	LDA.w $002A
	AND.w #$00FF
	BEQ .main
	LDA.w #$BE00-$0600
.main
	CLC
	ADC.w #$0600
	STA.w !ov_buf
.copy
	LDA.w !ov_tmp
	CLC
	ADC.w !ov_buf
	TAX
	LDA.l $7E0000,X
	LDX.w !ov_tmp
	STA.w !s_palout,X
	JSR pal_store
	INX : INX
	STX.w !ov_tmp
	CPX.w !ov_end
	BCC .copy
	RTS

; ---------------------------------------------------------------------------
; 144-300 (planet-view depart): the day globe and stars, Goku's miniature
; on departureOrbit, white (174 - age) / 30, black (age - 266) / 34.
; Shenron's depart shade turns every pixel into the scene's, the dialogue
; too. The stage loads under the white with the clock running: the event
; script waits 300 frames from DE.
depart_space:
	LDA.w !ov_space
	BNE .live
	INC.w !ov_space
	JSR end_overlay
	LDA.w #!SPB_DAY
	JSR space_load
	LDA.w #depart_script
	JSR set_script
	SEP #$20
	LDA.b #$01
	STA.w !s_ldvis
	LDA.b #$00                    ; under pure white: the new ranges join the
	STA.w !s_pbnow                ; round robin rather than all in this frame
	REP #$30
	JSR space_phase_init
	REP #$30
	STZ.w !s_fadeb
	LDA.w #$0100
	STA.w !s_fadew
	JMP depart_status
.live
	LDA.w !ov_space
	CMP.w #$0002
	BCS .shown
	INC.w !ov_space
	; the miniature of the flight pose (sheet 0, column 38, row 3), one
	; frame after the load (the picture is still all white)
	LDA.w #$0000
	LDX.w #38
	LDY.w #3
	JSL goku_api_cell
	REP #$30
	CMP.w #$FFFF
	BEQ .shown
	JSR queue_goku_mini
.shown
	REP #$30
	JSR depart_status
	JSR oam_begin
	SEP #$20
	LDA.b #$13                ; BG1 globe, BG2 stars, OBJ: no dialogue,
	STA.w !s_tm               ; also below the field IRQ's HUD split
	STA.w !s_tmcut
	LDA.b #$01
	STA.w !s_bg3cut
	REP #$20
	JSR space_sky
	LDA.l !ending_age
	CMP.w #!DP_CLEAR
	BCS .clear
	EOR.w #$FFFF
	SEC
	ADC.w #!DP_CLEAR
	XBA
	LDY.w #30
	JSR div_a_y
	BRA .white
.clear
	LDA.w #$0000
.white
	STA.w !s_fadew
	LDA.l !ending_age
	SEC
	SBC.w #!DP_FADE
	BCS .dark
	LDA.w #$0000
	BRA .black
.dark
	CMP.w #34
	BCC .part
	LDA.w #$0100
	BRA .black
.part
	XBA
	LDY.w #34
	JSR div_a_y
.black
	STA.w !s_fadeb
	; the miniature: its cell's top-left at (x - 8, y - 16)
	JSR queue_idle
	BNE .end
	LDA.l !ending_age
	SEC
	SBC.w #!DP_SPACE
	CMP.w #!ENDING_ORBIT_LAST
	BCC .t
	LDA.w #!ENDING_ORBIT_LAST
.t
	ASL : ASL
	TAX
	LDA.l ending_depart_orbit,X
	SEC
	SBC.w #8
	STA.w !o_x
	LDA.l ending_depart_orbit+2,X
	SEC
	SBC.w #16
	STA.w !o_y
	STZ.w !o_size
	LDA.w #$0000
	JSR cell_tile
	ORA.w #!SP_ATTR_GOKU
	JSR oam_put
.end
	LDA.l !ending_age
	CMP.w #!DP_END-1
	BCC .out
	JMP mark_done
.out
	RTS

; Only what the departure shows: stars (and their twinkles), the day globe.
depart_script:
	%ld(ending_space_star_tiles, !LD_VRAM, !SP_TILES, !ENDING_SPACE_STAR_TILES_SIZE)
	%ld(ending_space_star_map, !LD_VRAM, !SP_MAP2, $0800)
	%ld(ending_space_day_tiles, !LD_VRAM, !SP_TILES+(!ENDING_STAR_TILES*16), !ENDING_SPACE_DAY_TILES_SIZE)
	%ld(ending_space_day_map, !LD_VRAM, !SP_MAP1, $0800)
	%ld(ending_space_extra_tiles, !LD_VRAM, !SP_TILES+(!ENDING_SPACE_CURTAIN_BASE*16), !ENDING_SPACE_EXTRA_TILES_SIZE)
	%ld_end()

; The goku module's 16x16 miniature of cell A (goku_cell_mini: four tile
; words TL, TR, BL, BR per cell) into scene cell 0, its palette into OBJ
; palette 1 (colours 144-159).
queue_goku_mini:
	STA.w !l_qcell
	ASL : ASL : ASL
	STA.w !l_quadx
	LDX.w #$0000              ; DMA table offset
	LDY.w #$0000              ; tile 0-3
.tile
	PHX
	TYA
	ASL
	CLC
	ADC.w !l_quadx
	TAX
	LDA.l goku_cell_mini,X
	PLX
	PHA
	ASL : ASL : ASL : ASL : ASL
	STA.w !s_goku_dma,X       ; source address
	PLA
	XBA
	AND.w #$00FF
	LSR : LSR : LSR
	CLC
	ADC.w #$00F8
	SEP #$20
	STA.w !s_goku_dma+2,X     ; bank
	REP #$20
	; VRAM: cell 0 + (t & 1) * $10 + (t >> 1) * $100
	TYA
	AND.w #$0001
	BEQ .left
	LDA.w #$0010
.left
	STA.w !l_m0
	TYA
	AND.w #$0002
	BEQ .top
	LDA.w #$0100
.top
	CLC
	ADC.w !l_m0
	CLC
	ADC.w !s_cellvram
	STA.w !s_goku_dma+3,X
	TXA
	CLC
	ADC.w #$0005
	TAX
	INY
	CPY.w #$0004
	BCC .tile
	LDA.w #!s_goku_dma
	STA.w !q_src
	LDA.w #4*5                ; table length
	STA.w !q_dest
	SEP #$20
	LDA.b #$32
	STA.w !q_src+2
	LDA.b #!LD_GOKU
	STA.w !q_mode
	REP #$20
	LDA.w #$0080
	STA.w !q_size
	JSR queue_add
	LDX.w !l_qcell
	LDA.l goku_cell_pal,X
	AND.w #$0007
	ASL : ASL : ASL : ASL : ASL
	TAX
	LDY.w #$0120              ; colour 144 (byte offset)
	LDA.w #$0010
	STA.w !l_palc
.colour
	LDA.l goku_palettes,X
	PHX
	TYX
	JSR pal_store
	PLX
	INX : INX
	INY : INY
	DEC.w !l_palc
	BNE .colour
	SEP #$20
	LDA.b #$03
	TSB.w !s_paldirty
	REP #$20
	RTS
