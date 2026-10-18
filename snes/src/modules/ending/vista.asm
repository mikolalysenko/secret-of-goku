; Shenron's vista (good ending: summon 6B, dragon A3, wish A4) and the
; first 30 frames of the wish flight (the wish picture fading out).
; shenron-ending.js prepare(): the Tree's far plane (BG2, ruined until the
; wish), Shenron rising between it and the cliff (BG1, priority tiles; OBJ
; priority 2), the seven Balls (and Dryad's eighth) around Goku, gold
; sparks, the fallout flakes; the dialogue stays above for y < 170.
;
; VRAM: OBJ cells $0000 (Balls, sparks, flake, Shenron, then Goku's four),
; BG1 map $1800 (32x32), BG tiles $2000, BG2 map $5000 (64x32). CGRAM:
; backdrop = the map's sky, BG palettes 1-7 = the map's own, OBJ palettes
; 0-1 Shenron, 2 Balls and flake, 3 sparks, 4 Goku.
!VS_OBJSEL   = $60            ; OBJ 16x16/32x32, tiles at $0000
!VS_BG12NBA  = $22            ; BG1/BG2 tiles at $2000
!VS_BG1SC    = $18            ; BG1 map $1800, 32x32
!VS_BG2SC    = $51            ; BG2 map $5000, 64x32
!VS_TILES    = $2000
!VS_MAP1     = $1800
!VS_MAP2     = $5000
!VS_ATTR_BALL  = $3400        ; priority 3, OBJ palette 2
!VS_ATTR_SPARK = $3600        ; palette 3
!VS_ATTR_GOKU  = $3800        ; palette 4
!CELL_VS_BALL  = 0            ; cells (ending-vista.mjs CELL)
!CELL_VS_SPARK = 32
!CELL_VS_FLAKE = 36

!vs_want    = !s_var+$00   ; word  BG2 should show the whole Tree
!vs_have    = !s_var+$02   ; word  BG2 shows (or has queued) the whole Tree
!vs_scroll  = !s_var+$04   ; word
!vs_dy      = !s_var+$06   ; word  Shenron's y
!vs_i       = !s_var+$08
!vs_tmp     = !s_var+$0A
!vs_age     = !s_var+$0C   ; word  the picture's age
!vs_phase   = !s_var+$0E   ; word  the picture's phase (summon, dragon, wish)
!vs_tile    = !s_var+$10
!vs_x       = !s_var+$12
!vs_flakes  = !s_var+$14   ; word  age/3 of the flakes in s_big ($FFFF none)

; ---------------------------------------------------------------------------
; Phase start (SUMMON, DRAGON, WISH; SCATTER keeps the wish picture). A
; live vista is kept; the wish asks for the whole Tree.
start_vista:
	REP #$30
	SEP #$20
	LDA.w !s_family
	CMP.b #!FAM_VISTA
	BNE .load
	LDA.w !s_loading
	BEQ .live
.load
	REP #$30
	JSR vista_load
.live
	REP #$30
	LDA.l !ending_phase
	AND.w #$00FF
	LDX.w #$0000
	CMP.w #!EP_WISH
	BEQ .whole
	CMP.w #!EP_SCATTER
	BNE .want
.whole
	LDX.w #$0001
.want
	STX.w !vs_want
	RTS

start_scatter:
	JSR flight_reset
	SEP #$20
	LDA.l !ending_status
	ORA.b #!ES_MUTED              ; musicMuted for the whole scatter
	STA.l !ending_status
	REP #$30
	JMP start_vista

vista_load:
	SEP #$20
	LDA.b #!FAM_VISTA
	JSR begin_fullscreen
	SEP #$20
	LDA.b #!VS_BG12NBA : STA.w !s_bg12nba
	LDA.b #!VS_BG1SC : STA.w !s_bg1sc
	LDA.b #!VS_BG2SC : STA.w !s_bg2sc
	LDA.b #!VS_OBJSEL : STA.w !s_objsel
	REP #$30
	STZ.w !s_cellvram
	STZ.w !s_celltile
	STZ.w !vs_have
	LDA.w #$FFFF
	STA.w !vs_flakes
	; the sky (colour 0), the map's palettes 1-7, Shenron, the Balls, sparks
	LDA.w #$0001
	LDX.w #ending_vista_bg_pal
	LDY.w #$0000
	JSR pal_set
	LDA.w #112
	LDX.w #ending_vista_bg_pal+2
	LDY.w #$0010
	JSR pal_set
	LDA.w #$0020
	LDX.w #ending_vista_dragon_pal
	LDY.w #$0080
	JSR pal_set
	LDA.w #$0010
	LDX.w #ending_vista_ball_pal
	LDY.w #$00A0
	JSR pal_set
	LDA.w #$0010
	LDX.w #ending_vista_spark_pal
	LDY.w #$00B0
	JSR pal_set
	LDA.w #$0010
	LDX.w #$0070
	JSR pal_range             ; BG palettes 1-7 (the backdrop is range 0)
	LDA.w #$0080
	LDX.w #$0050
	JSR pal_range             ; OBJ palettes 0-4
	; Goku from behind (base form, column 0, row 3), OBJ palette 4
	LDA.w #!ENDING_VISTA_GOKU_CELL
	STA.w !s_tmp+6
	LDA.w #$00C0
	STA.w !s_tmp+4
	LDA.w #$0000
	LDX.w #$0000
	LDY.w #3
	JSR queue_goku
	LDA.w #vista_script
	JMP set_script

vista_script:
	%ld(ending_vista_obj, !LD_VRAM, $0000, !ENDING_VISTA_OBJ_SIZE)
	%ld(ending_vista_bg_tiles, !LD_VRAM, !VS_TILES, !ENDING_VISTA_BG_TILES_SIZE)
	%ld(ending_vista_bg1_map, !LD_VRAM, !VS_MAP1, $0800)
	%ld(ending_vista_bg2_map, !LD_VRAM, !VS_MAP2, $1000)
	%ld_end()

; ---------------------------------------------------------------------------
frame_summon:
	REP #$30
	LDA.l !ending_age
	STA.w !vs_age
	CMP.w #48
	BCC .fade
	JSR mark_done
	STZ.w !s_fadeb
	BRA .draw
.fade
	; dim(1 - age/48): black (48 - age) / 48
	EOR.w #$FFFF
	SEC
	ADC.w #48
	XBA
	LDY.w #48
	JSR div_a_y
	STA.w !s_fadeb
.draw
	STZ.w !s_fadew
	LDA.w #!EP_SUMMON
	JMP vista_frame

frame_dragon:
	REP #$30
	STZ.w !s_fadeb
	STZ.w !s_fadew
	LDA.l !ending_age
	STA.w !vs_age
	CMP.w #96
	BCC .rising
	JSR mark_done
.rising
	LDA.w #!EP_DRAGON
	JMP vista_frame

frame_wish:
	REP #$30
	STZ.w !s_fadeb
	LDA.l !ending_age
	STA.w !vs_age
	CMP.w #72
	BCC .early
	JSR mark_done
.early
	LDA.l !ending_age
	CMP.w #36
	BCC .flash
	STZ.w !s_fadew
	BRA .draw
.flash
	; brighten(.65 (1 - age/36)): white (36 - age) * 166 / 36
	EOR.w #$FFFF
	SEC
	ADC.w #36
	LDY.w #166
	JSR mul_a_y
	LDY.w #36
	JSR div_a_y
	STA.w !s_fadew
.draw
	LDA.w #!EP_WISH
	JMP vista_frame

; The flight's first 30 frames: the wish picture at age 96, dimmed by
; age/30; then the flight (flight.asm).
frame_scatter:
	REP #$30
	STZ.w !s_fadew
	LDA.l !ending_age
	CMP.w #30
	BCC .wish
	JMP ending_wish_frame
.wish
	XBA
	LDY.w #30
	JSR div_a_y
	STA.w !s_fadeb
	LDA.w #96
	STA.w !vs_age
	LDA.w #!EP_WISH
	JMP vista_frame

; ---------------------------------------------------------------------------
; The picture for phase A at vs_age (shenron-ending prepare).
vista_frame:
	STA.w !vs_phase
	JSR oam_begin
	JSR vista_tree
	SEP #$20
	LDA.b #$17                ; BG1 cliff, BG2 Tree, BG3 dialogue, OBJ
	STA.w !s_tm
	LDA.b #$13                ; no dialogue (or HUD) from line 170
	STA.w !s_tmcut
	LDA.b #$01
	STA.w !s_bg3cut
	LDA.b #$00
	STA.w !s_win
	STA.w !s_cgadsub
	STA.w !s_wobjsel
	REP #$20
	; rise: summon 1 (row 0 of the table), dragon max(0, 1 - age/96), wish 0
	LDA.w !vs_phase
	CMP.w #!EP_SUMMON
	BNE .notSummon
	LDA.w #$0000
	BRA .row
.notSummon
	CMP.w #!EP_WISH
	BEQ .top
	LDA.w !vs_age
	CMP.w #96
	BCC .row
.top
	LDA.w #96
.row
	ASL : ASL
	TAX
	LDA.l ending_vista_rise,X
	STA.w !vs_dy
	LDA.l ending_vista_rise+2,X
	STA.w !vs_scroll
	; BG2 (from row 40, x 24): y = 44 - round(scroll/4), x = 30
	CLC
	ADC.w #$0002
	LSR : LSR
	EOR.w #$FFFF
	SEC
	ADC.w #44-40-1
	STA.w !s_bg2v
	LDA.w #30-24
	STA.w !s_bg2h
	; BG1 (from row 144): y = 156 - scroll
	LDA.w #156-144-1
	SEC
	SBC.w !vs_scroll
	STA.w !s_bg1v
	STZ.w !s_bg1h
	; sprites, front to back
	JSR vista_sparks
	JSR vista_goku
	LDA.w !vs_phase
	CMP.w #!EP_SUMMON
	BNE .noFlakes
	JSR vista_flakes
.noFlakes
	JSR vista_balls
	LDA.w !vs_phase
	CMP.w #!EP_SUMMON
	BEQ .noDragon
	JSR vista_dragon
.noDragon
	RTS

; BG2 shows the whole Tree once the wish asks for it (the span of the map
; that differs, through the transfer queue).
vista_tree:
	LDA.w !vs_want
	CMP.w !vs_have
	BEQ .same
	STA.w !vs_have
	LDA.w #ending_vista_bg2_whole
	STA.w !q_src
	SEP #$20
	LDA.b #ending_vista_bg2_whole>>16
	STA.w !q_src+2
	LDA.b #!LD_VRAM
	STA.w !q_mode
	REP #$20
	LDA.w #!VS_MAP2+!ENDING_VISTA_WHOLE_AT
	STA.w !q_dest
	LDA.w #!ENDING_VISTA_WHOLE_WORDS*2
	STA.w !q_size
	JMP queue_add
.same
	RTS

; Gold sparks: dragon (age < 96) four rising from (106 + 15i, 172 + scroll),
; frames (age >> 2) + i, y up by (3 age + 29 i) % 112; wish (age < 72) four
; at (114 + 24 (i & 1), 132 + 26 (i >> 1)), frames (age >> 3) + i. Stepped
; per spark, written with vista_put (all on screen).
vista_sparks:
	LDA.w !vs_phase
	CMP.w #!EP_DRAGON
	BEQ .dragon
	CMP.w #!EP_WISH
	BEQ .wish
	RTS
.dragon
	LDA.w !vs_age
	CMP.w #96
	BCC .dGo
	RTS
.dGo
	LSR : LSR
	JSR vista_spark_first     ; vs_i = the first frame
	LDA.w !vs_age
	ASL
	CLC
	ADC.w !vs_age
	LDY.w #112
	JSR div_a_y
	STX.w !vs_tmp             ; (3 age) % 112
	LDA.w #106-8
	STA.w !o_x
	LDA.w #4
	STA.w !vs_x               ; sparks left
.dLoop
	LDA.w #172-8
	CLC
	ADC.w !vs_scroll
	SEC
	SBC.w !vs_tmp
	STA.w !o_y
	JSR vista_spark_put
	LDA.w !o_x
	CLC
	ADC.w #15
	STA.w !o_x
	LDA.w !vs_tmp
	CLC
	ADC.w #29
	CMP.w #112
	BCC .d112
	SBC.w #112
.d112
	STA.w !vs_tmp
	DEC.w !vs_x
	BNE .dLoop
	RTS
.wish
	LDA.w !vs_age
	CMP.w #72
	BCC .wGo
	RTS
.wGo
	LSR : LSR : LSR
	JSR vista_spark_first
	STZ.w !vs_x               ; i
.wLoop
	LDA.w !vs_x
	AND.w #$0001
	BEQ .left
	LDA.w #24
.left
	CLC
	ADC.w #114-8
	STA.w !o_x
	LDA.w !vs_x
	AND.w #$0002
	BEQ .upper
	LDA.w #26
.upper
	CLC
	ADC.w #132-8
	STA.w !o_y
	JSR vista_spark_put
	INC.w !vs_x
	LDA.w !vs_x
	CMP.w #4
	BCC .wLoop
	RTS

; vs_i = frame A % the spark frames.
vista_spark_first:
	LDY.w #!ENDING_VISTA_SPARKS
	JSR div_a_y
	STX.w !vs_i
	RTS
; Spark frame vs_i at o_x/o_y, then the next frame.
vista_spark_put:
	LDA.w !vs_i
	ASL                       ; the four spark cells share one cell row
	CLC
	ADC.w #((!CELL_VS_SPARK>>3)*32)+((!CELL_VS_SPARK&7)*2)
	ORA.w #!VS_ATTR_SPARK
	JSR vista_put
	LDA.w !vs_i
	INC
	CMP.w #!ENDING_VISTA_SPARKS
	BCC .frame
	LDA.w #$0000
.frame
	STA.w !vs_i
	RTS

; A small sprite known to be on screen (x 0-255, y -16..223): A16 = OAM
; bytes 2-3 at o_x/o_y, straight into the next slot (no high-table bits).
vista_put:
	LDX.w !s_oamslot
	CPX.w #$0200
	BCS .full
	STA.w !N_OAM+2,X
	SEP #$20
	LDA.w !o_x
	STA.w !N_OAM,X
	LDA.w !o_y
	STA.w !N_OAM+1,X
	REP #$20
	TXA
	CLC
	ADC.w #$0004
	STA.w !s_oamslot
.full
	RTS

; Goku from behind, the cell's top-left at (112, 172 + scroll).
vista_goku:
	LDA.w #128
	STA.w !o_x
	LDA.w #172+32
	CLC
	ADC.w !vs_scroll
	STA.w !o_y
	LDA.w #!VS_ATTR_GOKU
	STA.w !q_attr
	LDA.w #!ENDING_VISTA_GOKU_CELL
	JMP draw_quad

; The fallout (summon): 32 flakes at ((61 i + age/12) % 256,
; (47 i + age/3) % 224). They move every third frame: their 32 OAM entries
; are built into s_big then and block-copied into OAM every frame (small
; sprites at x 0-255 need no high-table bits).
vista_flakes:
	LDA.w !vs_age
	LDY.w #3
	JSR div_a_y
	CMP.w !vs_flakes
	BEQ .copy
	STA.w !vs_flakes
	JSR vista_flakes_build
.copy
	LDA.w !s_oamslot
	CMP.w #$0200-$80+1
	BCS .full
	CLC
	ADC.w #!N_OAM
	TAY
	LDX.w #!s_big
	LDA.w #$007F
	PHB
	MVN $7E,$32
	PLB
	LDA.w !s_oamslot
	CLC
	ADC.w #$0080
	STA.w !s_oamslot
.full
	RTS

; The 32 entries for age/3 = A at s_big.
vista_flakes_build:
	LDY.w #224
	JSR div_a_y
	STX.w !vs_tmp             ; y of flake 0
	LDA.w !vs_age
	LDY.w #12
	JSR div_a_y
	STA.w !vs_x
	LDA.w #!CELL_VS_FLAKE
	JSR cell_tile
	ORA.w #!VS_ATTR_BALL
	STA.w !vs_tile
	LDX.w #$0000
.loop
	SEP #$20
	LDA.w !vs_x
	STA.w !s_big,X
	LDA.w !vs_tmp
	STA.w !s_big+1,X
	REP #$20
	LDA.w !vs_tile
	STA.w !s_big+2,X
	LDA.w !vs_x
	CLC
	ADC.w #61
	STA.w !vs_x
	LDA.w !vs_tmp
	CLC
	ADC.w #47
	CMP.w #224
	BCC .y
	SBC.w #224
.y
	STA.w !vs_tmp
	INX : INX : INX : INX
	CPX.w #$0080
	BCC .loop
	RTS

; The seven Balls around (128, 184 + scroll), Dryad's eighth at
; (128, 172 + scroll), drawn after the first seven (in front). Ball i is
; cell i: tile 2i.
vista_balls:
	LDA.l !ending_flags
	AND.w #!EF_EIGHTH
	BEQ .seven
	LDA.w #128-8
	STA.w !o_x
	LDA.w #172-8
	CLC
	ADC.w !vs_scroll
	STA.w !o_y
	LDA.w #((!CELL_VS_BALL+7)*2)|!VS_ATTR_BALL
	JSR vista_put
.seven
	LDX.w #6*4
.loop
	LDA.l ending_vista_ring,X
	STA.w !o_x
	LDA.l ending_vista_ring+2,X
	CLC
	ADC.w !vs_scroll
	STA.w !o_y
	STX.w !vs_tmp
	TXA
	LSR                       ; i * 2 = the ball's tile
	CLC
	ADC.w #(!CELL_VS_BALL*2)|!VS_ATTR_BALL
	JSR vista_put
	LDA.w !vs_tmp
	SEC
	SBC.w #4
	TAX
	BPL .loop
	RTS

; Shenron: blit(dragon, 92, y, 72, 79), his cells from the generator's
; list (x, dy, OAM word with priority 2: behind the cliff; rows in order),
; written straight into OAM (x 92-156: no high-table bits). His y is 66 or
; more here, so the first cell below the screen ends the list.
vista_dragon:
	LDA.w !vs_dy
	CMP.w #224
	BCS .none
	LDY.w !s_oamslot
	LDX.w #$0000
	SEP #$20
.loop
	CPY.w #$0200
	BCS .full
	LDA.l ending_vista_dragon_oam+1,X
	CLC
	ADC.w !vs_dy
	BCS .full                 ; y >= 256: this row and those below are off
	CMP.b #224
	BCS .full
	STA.w !N_OAM+1,Y
	LDA.l ending_vista_dragon_oam,X
	STA.w !N_OAM,Y
	REP #$20
	LDA.l ending_vista_dragon_oam+2,X
	STA.w !N_OAM+2,Y
	SEP #$20
	INY : INY : INY : INY
	INX : INX : INX : INX
	CPX.w #!ENDING_VISTA_DRAGON_CELLS*4
	BCC .loop
.full
	REP #$20
	STY.w !s_oamslot
.none
	RTS
