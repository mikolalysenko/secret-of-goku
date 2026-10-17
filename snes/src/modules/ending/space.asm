; Space pictures (engine/planet-view.js): the doomed globe under the
; dialogue, its explosion (seams, flash, fragments, sparks, shock ring) and
; Goku's escape. The fatal sequence reuses this stage (fatal.asm).
;
; VRAM: OBJ tiles $0000-$1FFF (fragments; the spark strip, tile rows 30-31,
; also holds Goku's escape cell), BG tiles $2000-$3FFF (stars, globe, card,
; teleport lines, twinkles), BG1 map $5000 (globe, teleport lines or card),
; BG2 map $5400 (stars). CGRAM: backdrop = the sky, BG palettes 1-6 globe,
; 7 stars/card/lines; OBJ palette 0 sparks, 1 Goku, 4-7 fragments (fade
; group 1). Windows: HDMA channel 6 (disc, shock ring) for colour math.
!SP_OBJSEL   = $60            ; OBJ 16x16/32x32, tiles at $0000
!SP_BG12NBA  = $22            ; BG1/BG2 tiles at $2000
!SP_BG1SC    = $50            ; BG1 map $5000
!SP_BG2SC    = $54            ; BG2 map $5400
!SP_TILES    = $2000
!SP_MAP1     = $5000
!SP_MAP2     = $5400
!SP_SKY      = $0800          ; planet-view sky rgb(0,0,2)
!SP_CRACK_HOT  = $099E        ; rgb(30,12,2) while age < 30
!SP_CRACK_GLOW = $437F        ; rgb(31,27,16) after

!SPB_NIGHT   = $0001          ; BG1 holds: night globe
!SPB_DAY     = $0002          ; day globe
!SPB_CURTAIN = $0003          ; teleport lines
!SPB_CARD    = $0004          ; GAME OVER card
!SPB_CRACKED = $0080          ; (night globe) seams already written

!SP_ATTR_SPARK = $2000        ; OBJ palette 0, priority 2
!SP_ATTR_GOKU  = $2200        ; OBJ palette 1, priority 2

; Scene variables (s_var).
!sp_bg1     = !s_var+$00   ; word  BG1 contents (!SPB_*)
!sp_seed    = !s_var+$02   ; word  crack tiles seeded into the ring mirror
!sp_crack   = !s_var+$04   ; word  next crack age to apply
!sp_heat    = !s_var+$06   ; word  drift t of the fragment colours ($FFFF none)
!sp_winbuf  = !s_var+$08   ; word  window buffer offset built last (0 / $400)
!sp_t       = !s_var+$0A   ; word  drift t of this frame
!sp_twin    = !s_var+$0C   ; word  twinkling stars (bit per star)
!sp_strip   = !s_var+$0E   ; word  nonzero: Goku's cell occupies the spark strip
!sp_x       = !s_var+$10   ; word  piece position
!sp_y       = !s_var+$12
!sp_i       = !s_var+$14
!sp_n       = !s_var+$16
!sp_tmp     = !s_var+$18
!sp_tmp2    = !s_var+$1A
!sp_r       = !s_var+$1C   ; disc / ring radius
!sp_d       = !s_var+$1E   ; line reach D
!sp_k       = !s_var+$20
!sp_ksq     = !s_var+$22
!sp_dsq     = !s_var+$24
!sp_rsq     = !s_var+$26
!sp_j88     = !s_var+$28
!sp_step    = !s_var+$2A
!sp_xo      = !s_var+$2C
!sp_xi      = !s_var+$2E
!sp_buf     = !s_var+$30   ; window buffer address being built
!sp_q4      = !s_var+$32
!sp_cull    = !s_var+$34   ; cull row offset (t < 8), $FFFF none
!sp_mask    = !s_var+$36   ; 4 bytes: spark keep bits
!sp_xy      = !s_var+$3A   ; spark row offset
!sp_age     = !s_var+$3C   ; sky clock (twinkles)
!sp_goku    = !s_var+$3E   ; word  escape Goku visible this frame
!sp_band    = !s_var+$40   ; word  escape line age
!sp_px      = !s_var+$42   ; word  table offset
!sp_shape   = !s_var+$44   ; word  window shape in the buffers (0 none, 1 disc, 2 ring)
!sp_chrok   = !s_var+$46   ; word  fragment tiles/attributes are in their OAM slots
!sp_dots    = !s_var+$48   ; word  ring dot mask byte (code bank)
!sp_bit     = !s_var+$4A   ; byte  mask bit
!sp_eage    = !s_var+$50   ; word  explosion age (explodingPlanet's clock)

; ---------------------------------------------------------------------------
; Phase start (DOOMED, EXPLODE, ESCAPE). A live space picture is kept when
; BG1 already holds what the phase needs; the escape swaps in its teleport
; lines through the transfer queue; anything else reloads (black frames).
start_space:
	REP #$30
	JSR space_want
	STA.w !s_tmp
	SEP #$20
	LDA.w !s_family
	CMP.b #!FAM_SPACE
	BNE .load
	LDA.w !s_loading
	BNE .load
	REP #$20
	LDA.w !sp_bg1
	CMP.w !s_tmp
	BEQ .keep
	LDA.w !s_tmp
	CMP.w #!SPB_CURTAIN
	BNE .load
	JSR space_queue_curtain
	BRA .keep
.load
	REP #$30
	LDA.w !s_tmp
	JSR space_load
.keep
	JMP space_phase_init

; What BG1 must hold for the current phase: the escape shows the teleport
; lines; the doomed globe is on its night side during Frieza's crisis;
; the explosion (and the fatal sequence) always uses the night globe.
space_want:
	LDA.l !ending_phase
	AND.w #$00FF
	CMP.w #!EP_ESCAPE
	BNE .notEscape
	LDA.w #!SPB_CURTAIN
	RTS
.notEscape
	CMP.w #!EP_DOOMED
	BNE .night
	LDA.l !ending_flags
	AND.w #!EF_NIGHT
	BNE .night
	LDA.w #!SPB_DAY
	RTS
.night
	LDA.w #!SPB_NIGHT
	RTS

; Take the screen and load the space stage with BG1 = A (!SPB_*).
space_load:
	PHA
	SEP #$20
	LDA.b #!FAM_SPACE
	JSR begin_fullscreen
	REP #$30
	PLA
	STA.w !sp_bg1
	SEP #$20
	LDA.b #!SP_BG12NBA : STA.w !s_bg12nba
	LDA.b #!SP_BG1SC : STA.w !s_bg1sc
	LDA.b #!SP_BG2SC : STA.w !s_bg2sc
	LDA.b #!SP_OBJSEL : STA.w !s_objsel
	REP #$30
	LDA.w #!ENDING_SPARK_TILE*16
	STA.w !s_cellvram
	LDA.w #!ENDING_SPARK_TILE
	STA.w !s_celltile
	STZ.w !sp_strip
	; Palettes: the sky backdrop, globe 1-6, stars/card/lines 7, sparks,
	; fragments (fade group 1).
	LDA.w #!SP_SKY
	LDX.w #$0000
	JSR pal_store
	LDA.w !sp_bg1
	CMP.w #!SPB_DAY
	BEQ .dayPal
	LDX.w #ending_space_night_pal
	BRA .globePal
.dayPal
	LDX.w #ending_space_day_pal
.globePal
	LDA.w #$0060
	LDY.w #$0010
	JSR pal_set
	LDA.w #$0010
	LDX.w #ending_space_pal7
	LDY.w #$0070
	JSR pal_set
	LDA.w #$0010
	LDX.w #ending_spark_pal
	LDY.w #$0080
	JSR pal_set
	LDA.w #$0040
	LDX.w #ending_frag_pal
	LDY.w #$00C0
	JSR pal_set
	LDA.w #$0001
	LDX.w #$007F
	JSR pal_range             ; BG colours 1-127
	LDA.w #$0080
	LDX.w #$0020
	JSR pal_range             ; OBJ palettes 0-1
	LDA.w #$00C0
	LDX.w #$0040
	JSR pal_range             ; OBJ palettes 4-7
	SEP #$20
	LDA.b #$02
	STA.w !s_palgrp+3         ; ... a direct range (generator palettes)
	REP #$30
	LDA.w #ending_frag_fadepal
	STA.w !s_dirsrc
	STZ.w !s_edgeon
	LDA.w !sp_bg1
	CMP.w #!SPB_DAY
	BEQ .day
	CMP.w #!SPB_CURTAIN
	BEQ .curtain
	LDA.w #space_script_night
	JMP set_script
.day
	LDA.w #space_script_day
	JMP set_script
.curtain
	LDA.w #space_script_escape
	JMP set_script

space_script_night:
	%ld(ending_space_obj, !LD_VRAM, $0000, !ENDING_SPACE_OBJ_BYTES)
	%ld(ending_space_star_tiles, !LD_VRAM, !SP_TILES, !ENDING_SPACE_STAR_TILES_SIZE)
	%ld(ending_space_star_map, !LD_VRAM, !SP_MAP2, $0800)
	%ld(ending_space_night_tiles, !LD_VRAM, !SP_TILES+(!ENDING_STAR_TILES*16), !ENDING_SPACE_NIGHT_TILES_SIZE)
	%ld(ending_space_night_map, !LD_VRAM, !SP_MAP1, $0800)
	%ld(ending_space_card_tiles, !LD_VRAM, !SP_TILES+(!ENDING_SPACE_CARD_BASE*16), !ENDING_SPACE_CARD_TILES_SIZE)
	%ld(ending_space_extra_tiles, !LD_VRAM, !SP_TILES+(!ENDING_SPACE_CURTAIN_BASE*16), !ENDING_SPACE_EXTRA_TILES_SIZE)
	%ld_end()
space_script_day:
	%ld(ending_space_obj, !LD_VRAM, $0000, !ENDING_SPACE_OBJ_BYTES)
	%ld(ending_space_star_tiles, !LD_VRAM, !SP_TILES, !ENDING_SPACE_STAR_TILES_SIZE)
	%ld(ending_space_star_map, !LD_VRAM, !SP_MAP2, $0800)
	%ld(ending_space_day_tiles, !LD_VRAM, !SP_TILES+(!ENDING_STAR_TILES*16), !ENDING_SPACE_DAY_TILES_SIZE)
	%ld(ending_space_day_map, !LD_VRAM, !SP_MAP1, $0800)
	%ld(ending_space_card_tiles, !LD_VRAM, !SP_TILES+(!ENDING_SPACE_CARD_BASE*16), !ENDING_SPACE_CARD_TILES_SIZE)
	%ld(ending_space_extra_tiles, !LD_VRAM, !SP_TILES+(!ENDING_SPACE_CURTAIN_BASE*16), !ENDING_SPACE_EXTRA_TILES_SIZE)
	%ld_end()
space_script_escape:
	%ld(ending_space_obj, !LD_VRAM, $0000, !ENDING_SPACE_OBJ_BYTES)
	%ld(ending_space_star_tiles, !LD_VRAM, !SP_TILES, !ENDING_SPACE_STAR_TILES_SIZE)
	%ld(ending_space_star_map, !LD_VRAM, !SP_MAP2, $0800)
	%ld(ending_space_card_tiles, !LD_VRAM, !SP_TILES+(!ENDING_SPACE_CARD_BASE*16), !ENDING_SPACE_CARD_TILES_SIZE)
	%ld(ending_space_extra_tiles, !LD_VRAM, !SP_TILES+(!ENDING_SPACE_CURTAIN_BASE*16), !ENDING_SPACE_EXTRA_TILES_SIZE)
	%ld(ending_space_curtain_map, !LD_VRAM, !SP_MAP1, $0800)
	%ld_end()

; BG1 map <- the teleport lines (the globe is gone or never shown).
space_queue_curtain:
	REP #$30
	LDA.w #ending_space_curtain_map
	STA.w !q_src
	SEP #$20
	LDA.b #ending_space_curtain_map>>16
	STA.w !q_src+2
	LDA.b #!LD_VRAM
	STA.w !q_mode
	REP #$20
	LDA.w #!SP_MAP1
	STA.w !q_dest
	LDA.w #$0800
	STA.w !q_size
	JSR queue_add
	LDA.w #!SPB_CURTAIN
	STA.w !sp_bg1
	RTS

; Per-phase state. The escape puts Goku's cell into the spark strip; the
; explosion restores the strip if a previous escape used it.
space_phase_init:
	REP #$30
	LDA.w #$FFFF
	STA.w !sp_heat
	STZ.w !sp_winbuf
	STZ.w !sp_shape
	STZ.w !sp_chrok
	STZ.w !s_glowr
	STZ.w !s_glowg
	STZ.w !s_glowb
	LDA.w #$0001
	STA.w !sp_crack
	STZ.w !sp_seed
	STZ.w !sp_goku
	STZ.w !s_fadeb2
	JSR space_twinkle_reset
	LDA.l !ending_phase
	AND.w #$00FF
	CMP.w #!EP_ESCAPE
	BEQ .escape
	LDA.w !sp_strip
	BEQ .colour
	JSR space_queue_strip
.colour
	; seams start hot (only revealed seam pixels use colour 15)
	LDA.w #!SP_CRACK_HOT
	JMP space_crack_colour
.escape
	LDA.w !sp_strip
	BNE .ready                ; uploaded during the explosion's drift
	JMP space_queue_goku
.ready
	RTS

; Goku's escape pose into the spark strip (free once the sparks end).
space_queue_goku:
	REP #$30
	LDA.w #$0000              ; cell 0 of the strip
	STA.w !s_tmp+6
	LDA.w #$0090              ; OBJ palette 1
	STA.w !s_tmp+4
	LDA.w #$0000
	JSR kai_goku_is_ssj
	BCC .sheet
	LDA.w #$0001
.sheet
	; planet-view escape: atlas column 22 (Super Saiyan) / 26, row 0
	LDX.w #26
	CMP.w #$0000
	BEQ .base
	LDX.w #22
.base
	LDY.w #$0000
	JSR queue_goku
	LDA.w #$0001
	STA.w !sp_strip
	RTS

; Spark strip tiles back from ROM (tile rows 30-31, columns 0-7).
space_queue_strip:
	REP #$30
	STZ.w !sp_strip
	LDA.w #ending_space_obj+(!ENDING_SPARK_TILE*32)
	STA.w !q_src
	LDA.w #!ENDING_SPARK_TILE*16
	STA.w !q_dest
	JSR .row
	LDA.w #ending_space_obj+((!ENDING_SPARK_TILE+16)*32)
	STA.w !q_src
	LDA.w #(!ENDING_SPARK_TILE+16)*16
	STA.w !q_dest
.row
	SEP #$20
	LDA.b #ending_space_obj>>16
	STA.w !q_src+2
	LDA.b #!LD_VRAM
	STA.w !q_mode
	REP #$20
	LDA.w #$0100
	STA.w !q_size
	JMP queue_add

; Colour 15 of BG palettes 1-6 (the seams) = A.
space_crack_colour:
	REP #$30
	STA.w !sp_tmp
	LDX.w #$003E              ; palette 1, colour 15 (byte offset)
.loop
	LDA.w !sp_tmp
	JSR pal_store
	TXA
	CLC
	ADC.w #$0020
	TAX
	CPX.w #$00E0
	BCC .loop
	SEP #$20
	LDA.b #$01
	TSB.w !s_paldirty
	REP #$20
	RTS

; ---------------------------------------------------------------------------
; Doomed: the globe under the dialogue (night during Frieza's crisis).
frame_doomed:
	REP #$30
	JSR oam_begin
	JSR space_globe_layers
	STZ.w !s_bg1h
	JSR space_sky
	JMP mark_done

; Explosion (bad ending): explodingPlanet(age), the blast sound at 48;
; BG1 takes the teleport lines and the spark strip Goku's escape pose once
; they are free.
frame_explode:
	REP #$30
	LDA.l !ending_age
	CMP.w #48
	BNE .notBlast
	SEP #$20
	LDA.b #!ESFX_POWERBURST
	STA.l !ending_sfx
	REP #$20
	JSR space_queue_curtain
.notBlast
	LDA.l !ending_age
	CMP.w #48+70
	BNE .noGoku
	JSR space_queue_goku
.noGoku
	LDA.l !ending_age
	JSR space_explode
	LDA.l !ending_age
	CMP.w #48+115
	BCC .out
	JMP mark_done
.out
	RTS

; planet-view explodingPlanet(A): seams spread for 48 frames (shaking
; after 25), then the fragments drift for 115.
space_explode:
	REP #$30
	STA.w !sp_eage
	JSR oam_begin
	LDA.w !sp_eage
	CMP.w #48
	BCS .drift
	JSR space_cracks
	; seams: hot below 30, white-hot after
	LDA.w !sp_eage
	CMP.w #30
	BNE .noGlow
	LDA.w #!SP_CRACK_GLOW
	JSR space_crack_colour
.noGlow
	JSR space_globe_layers
	JSR space_shake
	JSR space_sky
	RTS
.drift
	SEC
	SBC.w #48
	JSR space_drift
	JSR space_sky
	RTS

; Escape: the drift continues from t = 77; Goku stands in front of the
; fragments and blue teleport lines close over him for 15 frames.
frame_escape:
	REP #$30
	JSR oam_begin
	STZ.w !sp_goku
	LDA.l !ending_age
	CMP.w #15
	BCS .gone
	; only once Goku's cell and the lines are in VRAM
	LDA.w !s_dqhead
	CMP.w !s_dqtail
	BNE .gone
	LDA.w !sp_bg1
	CMP.w #!SPB_CURTAIN
	BNE .gone
	LDA.w #$0001
	STA.w !sp_goku
.gone
	LDA.l !ending_age
	CLC
	ADC.w #77
	JSR space_drift
	JSR space_sky
	; TM band: BG1 lines from 64+age to 104-age
	SEP #$20
	LDA.b #$00
	STA.w !s_band_top
	STA.w !s_band_bot
	REP #$20
	LDA.w !sp_goku
	BEQ .noBand
	LDA.l !ending_age
	CLC
	ADC.w #64
	SEP #$20
	STA.w !s_band_top
	REP #$20
	LDA.w #105
	SEC
	SBC.l !ending_age
	SEP #$20
	STA.w !s_band_bot
	LDA.b #$01
	STA.w !s_band_bits
	REP #$20
.noBand
	LDA.l !ending_age
	CMP.w #38
	BCC .out
	JMP mark_done
.out
	RTS

; Layers for the globe: BG1 globe, BG2 stars, dialogue above for y < 170.
space_globe_layers:
	STZ.w !s_fadeb
	SEP #$20
	LDA.b #$07                ; BG1, BG2, BG3
	STA.w !s_tm
	LDA.b #$03
	STA.w !s_tmcut
	LDA.b #$01
	STA.w !s_bg3cut
	LDA.b #$00
	STA.w !s_win
	STA.w !s_cgadsub
	STA.w !s_wobjsel
	REP #$20
	RTS

; Shake after age 25: the globe and its seams move 1 px left/right.
space_shake:
	LDA.w !sp_eage
	CMP.w #26
	BCC .still
	AND.w #$0003
	CMP.w #$0002
	LDA.w #$0001              ; shake -1: picture left
	BCC .set
	LDA.w #$FFFF              ; shake +1
	BRA .set
.still
	LDA.w #$0000
.set
	STA.w !s_bg1h
	RTS

; ---------------------------------------------------------------------------
; Stars: the bright ones show a cross while (age + phase) % 240 < 9
; (planet-view sky). ending_twinkle rows (22 bytes): phase, word count,
; 3 x (VRAM address, plain word, twinkle word).
space_sky:
	REP #$30
	STZ.w !sp_i
.star
	LDA.w !sp_i
	CMP.w #!ENDING_TWINKLES
	BCC .more
	RTS
.more
	JSR space_star_row
	LDX.w !sp_px
	LDA.l ending_twinkle,X    ; phase
	CLC
	ADC.l !ending_age
	LDY.w #240
	JSR div_a_y               ; X = remainder
	LDY.w #$0000              ; wanted: 0 plain, 2 cross
	CPX.w #9
	BCS .want
	LDY.w #$0002
.want
	STY.w !sp_n
	LDA.w !sp_i
	ASL
	TAX
	LDA.l bit_table,X
	STA.w !sp_tmp2
	AND.w !sp_twin
	BEQ .shown
	LDA.w #$0002
.shown
	CMP.w !sp_n
	BEQ .next
	LDA.w !sp_twin
	EOR.w !sp_tmp2
	STA.w !sp_twin
	LDA.w !sp_n
	JSR space_twinkle_words
.next
	INC.w !sp_i
	BRA .star

; sp_px = sp_i * 22.
space_star_row:
	LDA.w !sp_i
	ASL
	STA.w !sp_tmp
	ASL : ASL
	STA.w !sp_px
	ASL
	CLC
	ADC.w !sp_px              ; * 24
	SEC
	SBC.w !sp_tmp             ; * 22
	STA.w !sp_px
	RTS

; Queue the map words of the star at row sp_px: A = 0 plain, 2 cross.
space_twinkle_words:
	STA.w !sp_k
	LDX.w !sp_px
	LDA.l ending_twinkle+2,X
	STA.w !sp_ksq             ; words
	TXA
	CLC
	ADC.w #$0004
	STA.w !sp_dsq             ; first triple
.word
	LDA.w !sp_ksq
	BEQ .done
	LDA.w !sp_dsq
	CLC
	ADC.w !sp_k
	TAX
	LDA.l ending_twinkle+2,X  ; plain (+2) or cross (+4)
	PHA
	LDX.w !sp_dsq
	LDA.l ending_twinkle,X    ; VRAM address
	TAX
	PLA
	JSR vram_word
	LDA.w !sp_dsq
	CLC
	ADC.w #$0006
	STA.w !sp_dsq
	DEC.w !sp_ksq
	BRA .word
.done
	RTS

; Every star plain (each phase restarts the sky clock).
space_twinkle_reset:
	REP #$30
	STZ.w !sp_twin
	STZ.w !sp_i
.star
	LDA.w !sp_i
	CMP.w #!ENDING_TWINKLES
	BCS .done
	JSR space_star_row
	LDA.w #$0000
	JSR space_twinkle_words
	INC.w !sp_i
	BRA .star
.done
	RTS

; ---------------------------------------------------------------------------
; Seams (explode age 1-47): seed the ring mirror (s_big, 128 tiles) with
; base tiles from ROM, store the rows revealed at this age and upload the
; changed span. Tables from snes/gen/ending.mjs (ending_crack_*).
space_cracks:
	REP #$30
	LDA.w !sp_eage
	ASL : ASL : ASL
	TAX
	LDA.l ending_crack_ages+2,X
	AND.w #$00FF
	STA.w !sp_n               ; tiles that must be seeded by now
.forced
	LDA.w !sp_seed
	CMP.w !sp_n
	BCS .ahead
	JSR space_seed
	BRA .forced
.ahead
	; up to 8 more whose ring slot is free
	LDA.w #8
	STA.w !sp_i
.aheadLoop
	LDA.w !sp_seed
	CMP.w #!ENDING_CRACK_TILES
	BCS .events
	TAX
	LDA.l ending_crack_seed,X
	AND.w #$00FF
	CMP.w !sp_eage
	BEQ .seedOne
	BCS .events
.seedOne
	JSR space_seed
	DEC.w !sp_i
	BNE .aheadLoop
.events
	LDA.w !sp_crack
	CMP.w !sp_eage
	BEQ .apply
	BCC .apply
	RTS
.apply
	JSR space_crack_age
	INC.w !sp_crack
	BRA .events

; Seed tile sp_seed: 32 bytes from the night globe tiles into its slot.
space_seed:
	PHB
	LDA.w !sp_seed
	CLC
	ADC.w #!ENDING_CRACK_NONCRACK
	ASL : ASL : ASL : ASL : ASL
	CLC
	ADC.w #ending_space_night_tiles&$FFFF
	TAX
	LDA.w !sp_seed
	AND.w #$007F
	ASL : ASL : ASL : ASL : ASL
	CLC
	ADC.w #!s_big
	TAY
	LDA.w #$001F
	MVN $32,(ending_space_night_tiles>>16)
	PLB
	INC.w !sp_seed
	RTS

; Rows revealed at age sp_crack, then the upload of the changed span.
space_crack_age:
	LDA.w !sp_crack
	ASL : ASL : ASL
	TAX
	LDA.l ending_crack_ages+8,X   ; next age's first event
	STA.w !sp_tmp2
	LDA.l ending_crack_ages+4,X
	STA.w !sp_tmp             ; lo | span << 8
	LDA.l ending_crack_ages,X
	TAX
.event
	CPX.w !sp_tmp2
	BCS .upload
	LDA.l ending_space_crack_events,X
	TAY
	LDA.l ending_space_crack_events+2,X
	STA.w !s_big,Y
	LDA.l ending_space_crack_events+4,X
	STA.w !s_big+16,Y
	TXA
	CLC
	ADC.w #$0006
	TAX
	BRA .event
.upload
	LDA.w !sp_tmp
	AND.w #$FF00
	BNE .span
	RTS
.span
	LDA.w !sp_bg1
	ORA.w #!SPB_CRACKED
	STA.w !sp_bg1
	LDA.w !sp_tmp
	XBA
	AND.w #$00FF
	STA.w !sp_n               ; tiles
	LDA.w !sp_tmp
	AND.w #$00FF
	STA.w !sp_i               ; first tile k
.part
	; this part: from slot (k & 127) up to the ring's end
	LDA.w !sp_i
	AND.w #$007F
	STA.w !sp_tmp
	LDA.w #128
	SEC
	SBC.w !sp_tmp
	CMP.w !sp_n
	BCC .fit
	LDA.w !sp_n
.fit
	STA.w !sp_tmp2            ; tiles in this part
	LDA.w !sp_tmp
	ASL : ASL : ASL : ASL : ASL
	CLC
	ADC.w #!s_big
	STA.w !q_src
	LDA.w !sp_i
	CLC
	ADC.w #!ENDING_CRACK_FIRST
	ASL : ASL : ASL : ASL
	CLC
	ADC.w #!SP_TILES
	STA.w !q_dest
	LDA.w !sp_tmp2
	ASL : ASL : ASL : ASL : ASL
	STA.w !q_size
	SEP #$20
	LDA.b #$32
	STA.w !q_src+2
	LDA.b #!LD_VRAM
	STA.w !q_mode
	REP #$20
	JSR queue_add
	LDA.w !sp_i
	CLC
	ADC.w !sp_tmp2
	STA.w !sp_i
	LDA.w !sp_n
	SEC
	SBC.w !sp_tmp2
	STA.w !sp_n
	BNE .part
	RTS

; ---------------------------------------------------------------------------
; Drift frame t (A): sparks, (escape) Goku, fragments, flash and ring.
space_drift:
	REP #$30
	STA.w !sp_t
	JSR space_sparks
	LDA.w !sp_goku
	BEQ .noGoku
	; planet-view: blit at (168,68): bottom centre (184,100)
	LDA.w #184
	STA.w !o_x
	LDA.w #100
	STA.w !o_y
	LDA.w #!SP_ATTR_GOKU
	STA.w !q_attr
	LDA.w #$0000
	JSR draw_quad
.noGoku
	JSR space_frag_colours
	JSR space_pieces
	JSR space_windows
	STZ.w !s_fadeb
	SEP #$20
	LDA.b #$16                ; BG2, BG3, OBJ
	STA.w !s_tm
	LDA.b #$12
	STA.w !s_tmcut
	LDA.b #$01
	STA.w !s_bg3cut
	REP #$20
	STZ.w !s_bg1h
	RTS

; Sparks (t < 70) in OAM slots 0-17: per frame the generator's (x, y)
; pairs and high bytes (ending_space_spark_oam: the 18 gold-spark cells on
; their spirals, those the scanline budget keeps); frame (t/4 + i) % 4.
space_sparks:
	LDA.w !sp_t
	CMP.w #70
	BCC .on
	RTS
.on
	; row = t * 41
	SEP #$20
	STA.w $4202
	LDA.b #41
	STA.w $4203
	REP #$20
	LDA.w !sp_t
	LSR : LSR
	STA.w !sp_tmp             ; animation base
	LDA.w $4216
	TAX
	LDY.w #$0000
.spark
	LDA.l ending_space_spark_oam,X
	STA.w !N_OAM,Y
	LDA.w !sp_tmp
	AND.w #$0003
	ASL
	ORA.w #!ENDING_SPARK_TILE|!SP_ATTR_SPARK
	STA.w !N_OAM+2,Y
	INC.w !sp_tmp
	INX : INX
	INY : INY : INY : INY
	CPY.w #18*4
	BCC .spark
	STY.w !s_oamslot
	; high bytes of slots 0-19
	LDY.w #$0000
.hi
	SEP #$20
	LDA.l ending_space_spark_oam,X
	STA.w !N_OAMHI,Y
	REP #$20
	INX
	INY
	CPY.w #5
	BCC .hi
	RTS

; Fragment colours (OBJ palettes 4-7, a direct range): while t < 48 the
; generator's palette for the frame's face glow (planet-view shade(): face
; +10/+4/0 of the heat) with the seam (+26/+12/+2) and depth (8+18h, 3+6h,
; 3) set per frame; after, the palette of the fade level ((115 - t) / 65 on
; the pipeline's 33 levels). pal_commit copies it into the game's buffer.
space_frag_colours:
	LDA.w !sp_t
	CMP.w #48
	BCC .heat
	; fade: extra black 0 until t = 50, 256 at t = 115
	STZ.w !s_edgeon
	SEC
	SBC.w #50
	BPL .fading
	LDA.w #$0000
	BRA .level
.fading
	CMP.w #65
	BCC .part
	LDA.w #$0100
	BRA .level
.part
	XBA                       ; * 256
	LDY.w #65
	JSR div_a_y
.level
	JSR fade_level
	XBA
	LSR                       ; * 128 bytes per palette set
	CLC
	ADC.w #ending_frag_fadepal
	STA.w !s_dirsrc
	RTS
.heat
	CMP.w !sp_heat
	BNE .build
	RTS
.build
	STA.w !sp_heat
	TAX
	LDA.l ending_frag_glowstate,X
	AND.w #$00FF
	XBA
	LSR                       ; * 128
	CLC
	ADC.w #ending_frag_glowpal
	STA.w !s_dirsrc
	LDA.w !sp_heat
	ASL : ASL : ASL
	TAX
	LDA.l ending_heat+2,X     ; g26 | g12 << 8
	STA.w !sp_y
	LDA.l ending_heat+4,X     ; g2 | g18 << 8
	STA.w !sp_r
	LDA.l ending_heat+6,X     ; g6
	STA.w !sp_d
	; depth (8 + g18, 3 + g6, 3)
	LDA.w !sp_r
	XBA
	AND.w #$00FF
	CLC
	ADC.w #8
	STA.w !sp_tmp2
	LDA.w !sp_d
	AND.w #$00FF
	CLC
	ADC.w #3
	ASL : ASL : ASL : ASL : ASL
	ORA.w !sp_tmp2
	ORA.w #3<<10
	STA.w !sp_tmp2
	; seam glow amounts
	LDA.w !sp_y
	AND.w #$00FF
	STA.w !sp_k
	LDA.w !sp_y
	XBA
	AND.w #$00FF
	STA.w !sp_ksq
	LDA.w !sp_r
	AND.w #$00FF
	STA.w !sp_dsq
	LDX.w #$0000              ; palette * 4: s_edge entries (depth, seam)
	LDA.w #28
	STA.w !sp_n
.edge
	LDA.w !sp_tmp2
	STA.w !s_edge,X
	PHX
	LDX.w !sp_n
	LDA.l ending_frag_pal+2,X
	STA.w !sp_tmp
	JSR space_glow
	PLX
	LDA.w !sp_tmp
	STA.w !s_edge+2,X
	INX : INX : INX : INX
	LDA.w !sp_n
	CLC
	ADC.w #$0020
	STA.w !sp_n
	CMP.w #$0080
	BCC .edge
	LDA.w #$0001
	STA.w !s_edgeon
	RTS

; sp_tmp (RGB555) + (sp_k, sp_ksq, sp_dsq) per channel, clamped to 31.
space_glow:
	LDA.w !sp_tmp
	AND.w #$001F
	CLC
	ADC.w !sp_k
	CMP.w #32
	BCC .r
	LDA.w #31
.r
	STA.w !sp_j88
	LDA.w !sp_tmp
	LSR : LSR : LSR : LSR : LSR
	AND.w #$001F
	CLC
	ADC.w !sp_ksq
	CMP.w #32
	BCC .g
	LDA.w #31
.g
	ASL : ASL : ASL : ASL : ASL
	TSB.w !sp_j88
	LDA.w !sp_tmp
	XBA
	LSR : LSR
	AND.w #$001F
	CLC
	ADC.w !sp_dsq
	CMP.w #32
	BCC .b
	LDA.w #31
.b
	XBA
	ASL : ASL
	ORA.w !sp_j88
	STA.w !sp_tmp
	RTS

; Fragments (t < 115) in a fixed OAM block (slots 24-71, below the sparks
; and Goku): per frame the generator's (x, y) pairs and high-table bytes
; (ending_space_frag_oam: pieces at rest corner + |round(dx*d)| radially,
; d = t*speed + .003 t^2 as fragmentPose; hidden ones at y = 224).
!SP_FRAG_SLOT = 24
space_pieces:
	; free slots before the block stay hidden
	LDY.w !s_oamslot
.hide
	CPY.w #!SP_FRAG_SLOT*4
	BCS .hidden
	LDA.w #$E000              ; x 0, y 224
	STA.w !N_OAM,Y
	INY : INY : INY : INY
	BRA .hide
.hidden
	LDA.w !sp_t
	CMP.w #115
	BCC .on
	STY.w !s_oamslot
	RTS
.on
	; row = t * 108
	SEP #$20
	STA.w $4202
	LDA.b #108
	STA.w $4203
	NOP : NOP : NOP : NOP
	REP #$20
	; tiles and attributes: the game's hide loop writes only X and Y, so
	; they stay in place except in slots its own sprites took this frame
	LDA.w !sp_chrok
	BEQ .allChr
	LDA.l !core_oam_native
	CMP.w #!SP_FRAG_SLOT+1
	BCC .chrDone
	CMP.w #!SP_FRAG_SLOT+48
	BCC .someChr
.allChr
	LDA.w #!SP_FRAG_SLOT+48
.someChr
	ASL : ASL
	STA.w !sp_n               ; end (OAM byte offset)
	LDX.w #$0000
	LDY.w #!SP_FRAG_SLOT*4
.chr
	LDA.l ending_frag_chr,X
	STA.w !N_OAM+2,Y
	INX : INX
	INY : INY : INY : INY
	CPY.w !sp_n
	BCC .chr
	LDA.w #$0001
	STA.w !sp_chrok
.chrDone
	LDA.w $4216
	TAX
	LDY.w #!SP_FRAG_SLOT*4
.sprite
	LDA.l ending_space_frag_oam,X
	STA.w !N_OAM,Y
	INX : INX
	INY : INY : INY : INY
	CPY.w #(!SP_FRAG_SLOT+48)*4
	BCC .sprite
	STY.w !s_oamslot
	; the block's 12 high-table bytes
	LDY.w #$0000
.hi
	LDA.l ending_space_frag_oam,X
	STA.w !N_OAMHI+(!SP_FRAG_SLOT/4),Y
	INX : INX
	INY : INY
	CPY.w #12
	BCC .hi
	RTS

; ---------------------------------------------------------------------------
; Flash disc (t < 8) and shock ring (t < 90) as colour-math windows. Four
; indirect HDMA channels write WH0-WH3 per line from byte arrays (two
; buffers in s_big; constant tables ending_space_win_hdma read index d on
; lines 140 +- d). The generator's per-frame data (ending_win_rows /
; ending_space_win_data) gives the disc's half width or the ring arc's
; inner x per line offset d; lookups (ending_space_win_ta) clip them.
!SPW_U0   = $000
!SPW_U1   = $080
!SPW_U2   = $100
!SPW_U3   = $180
!SPW_EMPTY = $200
!SPW_DBUF = $280
space_windows:
	LDA.w !sp_t
	CMP.w #90
	BCC .on
	SEP #$20
	LDA.b #$00
	STA.w !s_win
	STA.w !s_cgadsub
	STA.w !s_wobjsel
	REP #$20
	RTS
.on
	; the shape (1 disc, 2 ring): a new one starts from empty arrays
	LDA.w #$0001
	LDX.w !sp_t
	CPX.w #8
	BCC .shape
	INC
.shape
	CMP.w !sp_shape
	BEQ .same
	STA.w !sp_shape
	LDA.w #!s_big
	JSR space_win_clear
	LDA.w #!s_big+$400
	JSR space_win_clear
.same
	; build into the buffer the vblank is not using
	LDA.w !sp_winbuf
	EOR.w #$0400
	AND.w #$0400
	STA.w !sp_winbuf
	CLC
	ADC.w #!s_big
	STA.w !sp_buf
	; this frame's data -> DBUF
	LDA.w !sp_t
	ASL : ASL
	TAX
	LDA.l ending_win_rows+2,X
	AND.w #$00FF
	STA.w !sp_d
	LDA.l ending_win_rows+2,X
	XBA
	AND.w #$00FF
	STA.w !sp_r
	LDA.l ending_win_rows,X
	CLC
	ADC.w #ending_space_win_data&$FFFF
	TAX
	LDA.w !sp_buf
	CLC
	ADC.w #!SPW_DBUF
	TAY
	LDA.w !sp_d               ; D + 1 bytes
	PHB
	MVN $32,(ending_space_win_data>>16)
	PLB
	; Y walks buf + d; end = buf + D + 1
	LDA.w !sp_buf
	CLC
	ADC.w !sp_d
	INC
	STA.w !sp_k
	LDY.w !sp_buf
	SEP #$20
	LDA.b #$00
	XBA                       ; B = 0: TAX takes the byte as an index
	LDA.w !sp_t
	CMP.b #8
	BCS .ring
.disc
	LDA.w !SPW_DBUF,Y         ; k(d)
	TAX
	LDA.l ending_space_win_ta+$100,X  ; 87 - k
	STA.w !SPW_U0,Y
	LDA.l ending_space_win_ta+$200,X  ; 87 + k
	STA.w !SPW_U1,Y
	INY
	CPY.w !sp_k
	BCC .disc
	REP #$20
	LDA.w #$FF3F              ; white
	JMP .math
.ring
	; outer edges of line 0: the radius
	LDA.w !sp_r
	TAX
	LDA.l ending_space_win_ta,X
	STA.w !SPW_U0,Y
	LDA.l ending_space_win_ta+$300,X
	STA.w !SPW_U3,Y
	; the line mask of the browser's 180 dots (lines without one stay empty)
	REP #$20
	LDA.w !sp_t
	ASL : ASL : ASL : ASL
	CLC
	ADC.w #ending_ring_dots
	STA.w !sp_dots
	SEP #$20
	LDA.b #$00
	XBA                       ; B = 0 again for TAX
	LDA.b #$01
	STA.w !sp_bit
.arc
	LDA.w !SPW_DBUF,Y         ; inner x(d)
	TAX
	LDA.l ending_space_win_ta,X       ; outer edges of line d + 1
	STA.w !SPW_U0+1,Y
	LDA.l ending_space_win_ta+$300,X
	STA.w !SPW_U3+1,Y
	; a dot on this line?
	PHX
	LDX.w !sp_dots
	LDA.l !CB,X
	PLX
	AND.w !sp_bit
	BEQ .arcGap
	LDA.l ending_space_win_ta+$100,X
	STA.w !SPW_U1,Y
	LDA.l ending_space_win_ta+$200,X
	STA.w !SPW_U2,Y
	BRA .arcNext
.arcGap
	LDA.b #$01
	STA.w !SPW_U0,Y
	LDA.b #$00
	STA.w !SPW_U1,Y
	LDA.b #$FF
	STA.w !SPW_U2,Y
	LDA.b #$FE
	STA.w !SPW_U3,Y
.arcNext
	ASL.w !sp_bit
	BCC .arcByte
	ROL.w !sp_bit             ; back to bit 0
	REP #$20
	INC.w !sp_dots
	SEP #$20
.arcByte
	INY
	CPY.w !sp_k
	BCC .arc
	REP #$20
	LDA.w !sp_t
	CMP.w #28
	LDA.w #$FF3F              ; blue[3] = white while t < 28
	BCC .math
	LDA.w #$5126              ; blue[1] = (6,17,30)
.math
	SEP #$20
	STA.w !s_coldr
	XBA
	CMP.b #$FF
	BNE .blue
	LDA.b #$5F : STA.w !s_coldg
	LDA.b #$9F : STA.w !s_coldb
	BRA .regs
.blue
	STA.w !s_coldg
	LDA.b #$9E : STA.w !s_coldb
.regs
	LDA.b #$10                ; math inside the colour window, fixed colour
	STA.w !s_cgwsel
	LDA.b #$33                ; add: BG1, BG2, OBJ, backdrop
	STA.w !s_cgadsub
	LDA.b #$A0                ; colour window = W1 | W2
	STA.w !s_wobjsel
	LDA.b #$00
	STA.w !s_wobjlog
	LDA.b #$01
	STA.w !s_win
	REP #$20
	LDA.w !sp_winbuf
	STA.w !s_winptr           ; the next vblank uses this buffer
	RTS

; Arrays of the buffer at A to the empty window: U0 = 1, U1 = 0, U2 = $FF,
; U3 = $FE (128 bytes each), and the four empty bytes.
space_win_clear:
	STA.w !sp_tmp
	LDX.w #$0000
.array
	TXA
	XBA
	LSR                       ; X * 128
	CLC
	ADC.w !sp_tmp
	TAY
	SEP #$20
	LDA.l ending_win_empty,X
	STA.w $0000,Y
	REP #$20
	PHX
	TYX
	INY
	LDA.w #126                ; 127 more bytes
	PHB
	MVN $32,$32               ; propagates the first byte
	PLB
	PLX
	TXA
	CLC
	ADC.w !sp_tmp
	CLC
	ADC.w #!SPW_EMPTY
	TAY
	SEP #$20
	LDA.l ending_win_empty,X
	STA.w $0000,Y
	REP #$20
	INX
	CPX.w #$0004
	BCC .array
	RTS
