; King Kai's planet epilogue (engine/kai-planet.js, planet-view.js kaiPlanet).
; Phases KAI (arrival: good fades in over 32 frames; Goku appears through
; blue teleport lines) and COMPLETE (King Kai's last pose and the end card).
;
; VRAM: BG tiles from $0000 (the map, then the card), BG1 map $3800, BG2
; (card) map $3C00; OBJ name base $4000 (OBJSEL $62), our 16x16 cells from
; tile $100 at $5000 (the native BG1 map, idle while we own the picture).
!KAI_BG1SC     = $38
!KAI_BG2SC     = $3C
!KAI_OBJSEL    = $62
!KAI_CELL_VRAM = $5000
!KAI_CELL_TILE = $0100

!KC_KAI   = 0          ; 16x16 cell numbers
!KC_BUB   = 4
!KC_GOKU  = 8
!KC_LINES = 12

!KAI_ATTR_KAI   = $2000   ; priority 2, palette 0
!KAI_ATTR_BUB   = $2200   ; palette 1
!KAI_ATTR_GOKU  = $2400   ; palette 2
!KAI_ATTR_LINES = $2600   ; palette 3

; Scene variables.
!k_bx       = !s_var+$00   ; word 8.8   Bubbles (kai-planet.js newKaiScene)
!k_by       = !s_var+$02
!k_has      = !s_var+$04   ; word  target active
!k_wait     = !s_var+$06
!k_dir      = !s_var+$08   ; word  0 down, 1 up, 2 left, 3 right
!k_phase    = !s_var+$0A   ; word  walk clock mod 36 (frame = phase / 9)
!k_walk     = !s_var+$0C
!k_sx       = !s_var+$0E   ; 8.8 signed step
!k_sy       = !s_var+$10
!k_n        = !s_var+$12   ; steps left on this leg
!k_kaif     = !s_var+$14   ; King Kai frame uploaded ($FFFF none)
!k_bubf     = !s_var+$16   ; Bubbles frame uploaded
!k_try      = !s_var+$18
!k_ang      = !s_var+$1A
!k_r        = !s_var+$1C
!k_cx       = !s_var+$1E   ; candidate target
!k_cy       = !s_var+$20
!k_dx       = !s_var+$22
!k_dy       = !s_var+$24
!k_ax       = !s_var+$26
!k_ay       = !s_var+$28
!k_j        = !s_var+$2A
!k_px       = !s_var+$2C
!k_py       = !s_var+$2E
!k_d        = !s_var+$30
!k_complete = !s_var+$32
!k_bxi      = !s_var+$34   ; integer position
!k_byi      = !s_var+$36
!k_tmp      = !s_var+$38
!k_tmp2     = !s_var+$3A

start_kai:
	REP #$30
	LDA.w #$0000
	STA.w !k_complete
	JMP kai_setup

start_complete:
	REP #$30
	LDA.w #$0001
	STA.w !k_complete
	SEP #$20
	LDA.w !s_family
	CMP.b #!FAM_KAI
	REP #$20
	BEQ .loaded
	JMP kai_setup
.loaded
	RTS

kai_setup:
	SEP #$20
	LDA.b #!FAM_KAI
	JSR begin_fullscreen
	REP #$30
	LDA.l !ending_flags
	AND.w #!EF_BAD
	BNE .bad
	LDA.w #kai_script_good
	JSR set_script
	LDX.w #ending_card_good_palette
	BRA .card
.bad
	LDA.w #kai_script_bad
	JSR set_script
	LDX.w #ending_card_bad_palette
.card
	LDA.w #$0010
	LDY.w #$0070              ; card: BG palette 7
	JSR pal_set
	LDA.w #$0060
	LDX.w #ending_kai_bg_palettes
	LDY.w #$0010              ; map: BG palettes 1-6
	JSR pal_set
	LDA.w #$0010
	LDX.w #ending_kai_npc_palette
	LDY.w #$0080
	JSR pal_set
	LDA.w #$0010
	LDX.w #ending_bubbles_palette
	LDY.w #$0090
	JSR pal_set
	LDA.w #$0010
	LDX.w #ending_lines_palette
	LDY.w #$00B0
	JSR pal_set
	LDA.w #$0010
	LDX.w #$0070
	JSR pal_range             ; BG palettes 1-7
	LDA.w #$0080
	LDX.w #$0040
	JSR pal_range             ; OBJ palettes 0-3
	SEP #$20
	LDA.b #$00 : STA.w !s_bg12nba
	LDA.b #!KAI_BG1SC : STA.w !s_bg1sc
	LDA.b #!KAI_BG2SC : STA.w !s_bg2sc
	LDA.b #!KAI_OBJSEL : STA.w !s_objsel
	REP #$30
	LDA.w #!KAI_CELL_VRAM
	STA.w !s_cellvram
	LDA.w #!KAI_CELL_TILE
	STA.w !s_celltile
	; Goku (goku module cells: sheet 0/1, column 0, row 0 = standing,
	; facing down), the line cells, the first King Kai and Bubbles frames.
	LDA.w #!KC_GOKU
	STA.w !s_tmp+6
	LDA.w #$00A0              ; OBJ palette 2
	STA.w !s_tmp+4
	LDA.w #$0000
	JSR kai_goku_is_ssj
	BCC .sheet
	LDA.w #$0001
.sheet
	LDX.w #$0000
	LDY.w #$0000
	JSR queue_goku
	LDA.w #ending_kai_lines_cells
	STA.w !q_src
	SEP #$20
	LDA.b #(ending_kai_lines_cells>>16)
	STA.w !q_src+2
	REP #$20
	LDA.w #!KC_LINES
	STA.w !k_tmp
.line
	LDA.w !k_tmp
	JSR cell_vram
	STA.w !q_dest
	SEP #$20
	LDA.b #!LD_CELL16
	STA.w !q_mode
	REP #$20
	LDA.w #$0080
	STA.w !q_size
	JSR queue_add
	LDA.w !q_src
	CLC
	ADC.w #$0080
	STA.w !q_src
	INC.w !k_tmp
	LDA.w !k_tmp
	CMP.w #!KC_LINES+3
	BCC .line
	LDA.w #$FFFF
	STA.w !k_kaif
	STA.w !k_bubf
	; Bubbles: newKaiScene() {x:86, y:160, wait:40, direction:'down'}.
	LDA.w #86*256
	STA.w !k_bx
	LDA.w #160*256
	STA.w !k_by
	LDA.w #$0000
	STA.w !k_has
	STA.w !k_dir
	STA.w !k_phase
	STA.w !k_walk
	STA.w !k_n
	STA.w !k_try
	LDA.w #40
	STA.w !k_wait
	LDA.w #$4149              ; low half of the browser's 0x4b4149 seed
	STA.w !s_rng
	JSR kai_frames            ; upload the first poses with the script
	RTS

; Carry set when Goku is drawn in Super Saiyan form (bad ending, permanent).
kai_goku_is_ssj:
	PHA
	LDA.l !ending_flags
	AND.w #!EF_BAD|!EF_SSJ
	CMP.w #!EF_BAD|!EF_SSJ
	BEQ .ssj
	PLA
	CLC
	RTS
.ssj
	PLA
	SEC
	RTS

kai_script_good:
	%ld(ending_kai_bg_tiles, !LD_VRAM, $0000, !ENDING_KAI_BG_TILES_SIZE)
	%ld(ending_kai_bg_map, !LD_VRAM, $3800, $0800)
	%ld(ending_kai_card_good_tiles, !LD_VRAM, !ENDING_CARD_BASE*16, !ENDING_KAI_CARD_GOOD_TILES_SIZE)
	%ld(ending_kai_card_good_map, !LD_VRAM, $3C00, $0800)
	%ld_end()
kai_script_bad:
	%ld(ending_kai_bg_tiles, !LD_VRAM, $0000, !ENDING_KAI_BG_TILES_SIZE)
	%ld(ending_kai_bg_map, !LD_VRAM, $3800, $0800)
	%ld(ending_kai_card_bad_tiles, !LD_VRAM, !ENDING_CARD_BASE*16, !ENDING_KAI_CARD_BAD_TILES_SIZE)
	%ld(ending_kai_card_bad_map, !LD_VRAM, $3C00, $0800)
	%ld_end()

; ---------------------------------------------------------------------------
frame_kai:
	REP #$30
	; Good arrival fades in from black over 32 frames.
	LDA.w #$0000
	STA.w !s_fadeb
	LDA.l !ending_flags
	AND.w #!EF_BAD
	BNE .lit
	LDA.w !k_complete
	BNE .lit
	LDA.l !ending_age
	CMP.w #32
	BCS .lit
	EOR.w #$FFFF
	SEC
	ADC.w #32                 ; 32 - age
	ASL : ASL : ASL           ; * 8 (256 = black)
	STA.w !s_fadeb
.lit
	JSR kai_tick
	JSR kai_frames
	JSR kai_draw
	; Layers: dialogue (BG3) above the map for y < 170; the card replaces
	; BG3 at the end.
	SEP #$20
	LDA.b #$11                ; BG1, OBJ from line 170
	STA.w !s_tmcut
	LDA.b #$01
	STA.w !s_bg3cut
	LDA.b #$15                ; BG1, BG3, OBJ
	LDX.w !k_complete
	BEQ .tm
	LDA.b #$00
	STA.w !s_bg3cut
	LDA.b #$13                ; BG1, BG2, OBJ
.tm
	STA.w !s_tm
	REP #$30
	LDA.w !k_complete
	BEQ .arrival
	; THE END: the game keeps running underneath; hide its input.
	LDA.w #$FFF0
	STA.l !core_pad_mask
	SEP #$20
	LDA.l !ending_status
	ORA.b #!ES_COMPLETE
	STA.l !ending_status
	REP #$20
	JMP mark_done
.arrival
	LDA.l !ending_age
	CMP.w #32
	BCC .out
	JMP mark_done
.out
	RTS

; Queue cell uploads when King Kai's pose or Bubbles' frame changes.
kai_frames:
	REP #$30
	JSR kai_pose
	CMP.w !k_kaif
	BEQ .bub
	STA.w !k_kaif
	JSR kai_npc_src
	LDA.w #!KC_KAI
	JSR queue_quad
.bub
	JSR kai_bubbles_frame
	CMP.w !k_bubf
	BEQ .done
	STA.w !k_bubf
	JSR kai_npc_src
	LDA.w #!KC_BUB
	JSR queue_quad
.done
	RTS

; q_src = kai_npc_cells + frame * 512 (A = frame 0-15).
kai_npc_src:
	XBA
	ASL
	AND.w #$FE00
	CLC
	ADC.w #ending_kai_npc_cells
	STA.w !q_src
	SEP #$20
	LDA.b #(ending_kai_npc_cells>>16)
	STA.w !q_src+2
	REP #$20
	RTS

; King Kai's pose: complete 3, bad 2, otherwise floor(age/28) % 2.
kai_pose:
	LDA.w !k_complete
	BEQ .notDone
	LDA.w #$0003
	RTS
.notDone
	LDA.l !ending_flags
	AND.w #!EF_BAD
	BEQ .talk
	LDA.w #$0002
	RTS
.talk
	LDA.l !ending_age
	LDY.w #28
	JSR div_a_y
	AND.w #$0001
	RTS

; Bubbles' frame 4-15: row by direction, walk frame (phase/9) or 1.
kai_bubbles_frame:
	LDA.w #$0001
	LDX.w !k_walk
	BEQ .still
	LDA.w !k_phase
	LDY.w #9
	JSR div_a_y
.still
	STA.w !k_tmp
	LDA.w !k_dir
	ASL
	TAX
	LDA.l kai_dir_row,X
	CLC
	ADC.w !k_tmp
	RTS
kai_dir_row:
	dw 4, 8, 12, 12

; ---------------------------------------------------------------------------
; Bubbles (kai-planet.js tickKaiScene): pauses, picks a reachable lawn
; target that avoids both speakers, walks 0.42 px/frame, pauses again.
kai_tick:
	REP #$30
	SEP #$20
	LDA.w !s_loading
	REP #$20
	BEQ .live
	RTS
.live
	STZ.w !k_walk
	LDA.w !k_wait
	BEQ .noWait
	DEC.w !k_wait
	RTS
.noWait
	LDA.w !k_has
	BNE .move
	; The browser tries up to 32 targets in one tick; here at most 4 per
	; frame (a search may take up to 8 frames), so no frame overruns.
	LDA.w !k_try
	BNE .search
	LDA.w #32
	STA.w !k_try
.search
	JSR kai_pick
	BCC .move
	LDA.w !k_try
	BEQ .giveUp
	RTS
.giveUp
	LDA.w #20
	STA.w !k_wait
	RTS
.move
	LDA.w !k_n
	BNE .step
	; Arrived: rest 35 + random*100 frames.
	STZ.w !k_has
	JSR random8
	LDY.w #100
	JSR mul_a_y
	XBA
	AND.w #$00FF
	CLC
	ADC.w #35
	STA.w !k_wait
	RTS
.step
	LDA.w !k_bx
	CLC
	ADC.w !k_sx
	STA.w !k_bx
	LDA.w !k_by
	CLC
	ADC.w !k_sy
	STA.w !k_by
	DEC.w !k_n
	LDA.w #$0001
	STA.w !k_walk
	LDA.w !k_phase
	INC
	CMP.w #36
	BCC .ph
	LDA.w #$0000
.ph
	STA.w !k_phase
	RTS

kai_pos_int:
	LDA.w !k_bx
	CLC
	ADC.w #$0080
	XBA
	AND.w #$00FF
	STA.w !k_bxi
	LDA.w !k_by
	CLC
	ADC.w #$0080
	XBA
	AND.w #$00FF
	STA.w !k_byi
	RTS

; Try up to four targets (k_try counts the remaining tries of this search).
; Carry clear = leg set up; carry set = none yet (k_try = 0: search failed).
kai_pick:
	JSR kai_pos_int
	LDA.w #4
	STA.w !k_tmp2
.try
	JSR random8
	STA.w !k_ang
	JSR random8
	TAX
	LDA.l ending_sqrt8,X
	AND.w #$00FF
	STA.w !k_r
	; x = 128 + cos(a)*52*r, y = 145 + sin(a)*31*r
	LDX.w !k_ang
	LDA.l ending_cos52,X
	JSR sext8
	LDY.w !k_r
	JSR muls_a_y_shr8
	CLC
	ADC.w #128
	STA.w !k_cx
	LDX.w !k_ang
	LDA.l ending_sin31,X
	JSR sext8
	LDY.w !k_r
	JSR muls_a_y_shr8
	CLC
	ADC.w #145
	STA.w !k_cy
	; Not within 12 px of where Bubbles stands.
	LDA.w !k_cx
	SEC
	SBC.w !k_bxi
	STA.w !k_dx
	JSR square
	STA.w !k_d
	LDA.w !k_cy
	SEC
	SBC.w !k_byi
	STA.w !k_dy
	JSR square
	CLC
	ADC.w !k_d
	STA.w !k_d
	CMP.w #144
	BCC .next
	; Every 1/16 of the route stays on the lawn, clear of the speakers.
	STZ.w !k_ax
	STZ.w !k_ay
	LDA.w #16
	STA.w !k_j
.path
	LDA.w !k_ax
	CLC
	ADC.w !k_dx
	STA.w !k_ax
	JSR asr4
	CLC
	ADC.w !k_bxi
	STA.w !k_px
	LDA.w !k_ay
	CLC
	ADC.w !k_dy
	STA.w !k_ay
	JSR asr4
	CLC
	ADC.w !k_byi
	STA.w !k_py
	JSR kai_on_lawn
	BCS .next
	DEC.w !k_j
	BNE .path
	BRA .accept
.next
	DEC.w !k_try
	BEQ .out
	DEC.w !k_tmp2
	BEQ .out
	JMP .try
.out
	SEC
	RTS
.accept
	; d = |route|, n = ceil((d - 0.5) / 0.42) frames, step = route * 0.42 / d.
	LDA.w !k_d
	JSR isqrt
	BNE .dOk
	INC
.dOk
	STA.w !k_d
	XBA
	SEC
	SBC.w #128-107            ; d*256 - 128 + 107 (ceil)
	LDY.w #108
	JSR div_a_y
	STA.w !k_n
	LDA.w !k_dx
	JSR kai_step
	STA.w !k_sx
	LDA.w !k_dy
	JSR kai_step
	STA.w !k_sy
	; Facing: horizontal when |dx| > |dy|.
	LDA.w !k_dx
	JSR abs16
	STA.w !k_tmp
	LDA.w !k_dy
	JSR abs16
	CMP.w !k_tmp
	BCS .vertical
	LDA.w #$0003
	LDX.w !k_dx
	BPL .face
	LDA.w #$0002
	BRA .face
.vertical
	LDA.w #$0000
	LDX.w !k_dy
	BPL .face
	LDA.w #$0001
.face
	STA.w !k_dir
	LDA.w #$0001
	STA.w !k_has
	STZ.w !k_try
	CLC
	RTS

; A = route component (signed px) -> 8.8 step = A * 108 / d (signed).
kai_step:
	STA.w !k_tmp
	JSR abs16
	LDY.w #108
	JSR mul_a_y
	LDY.w !k_d
	JSR div_a_y
	LDX.w !k_tmp
	BPL .pos
	EOR.w #$FFFF
	INC
.pos
	RTS

abs16:
	CMP.w #$8000
	BCC .pos
	EOR.w #$FFFF
	INC
.pos
	RTS

; Arithmetic shift right by 4 (signed).
asr4:
	CMP.w #$8000
	ROR
	CMP.w #$8000
	ROR
	CMP.w #$8000
	ROR
	CMP.w #$8000
	ROR
	RTS

; Sign-extend the byte in A (16-bit A, high byte ignored).
sext8:
	AND.w #$00FF
	CMP.w #$0080
	BCC .pos
	ORA.w #$FF00
.pos
	RTS

; onKaiLawn(k_px, k_py): inside the lawn ellipse (56 x 35 around 128,145)
; and more than 14 px from King Kai (116,139) and Goku (151,162).
; Carry clear = on the lawn.
kai_on_lawn:
	LDA.w !k_py
	SEC
	SBC.w #145
	JSR abs16
	CMP.w #35
	BCS .off
	ASL
	TAX
	LDA.w !k_px
	SEC
	SBC.w #128
	JSR abs16
	CMP.w #56
	BCS .off
	JSR square
	CMP.l ending_kai_lawn,X
	BEQ .inside
	BCS .off
.inside
	LDA.w !k_px
	SEC
	SBC.w #!ENDING_KAI_X
	JSR square
	STA.w !k_tmp
	LDA.w !k_py
	SEC
	SBC.w #!ENDING_KAI_Y
	JSR square
	CLC
	ADC.w !k_tmp
	CMP.w #197
	BCC .off
	LDA.w !k_px
	SEC
	SBC.w #!ENDING_KAI_GOKU_X
	JSR square
	STA.w !k_tmp
	LDA.w !k_py
	SEC
	SBC.w #!ENDING_KAI_GOKU_Y
	JSR square
	CLC
	ADC.w !k_tmp
	CMP.w #197
	BCC .off
	CLC
	RTS
.off
	SEC
	RTS

; ---------------------------------------------------------------------------
; Sprites: actors back-to-front by y (planet-view sorts ascending and draws
; later ones on top; OAM puts the front sprite first).
kai_draw:
	REP #$30
	JSR oam_begin
	SEP #$20
	LDA.w !s_loading
	REP #$20
	BEQ .live
	RTS
.live
	JSR kai_pos_int
	; Teleport lines first (in front) while Goku arrives.
	LDA.w !k_complete
	BNE .noLines
	LDA.l !ending_age
	CMP.w #12
	BCS .noLines
	JSR kai_lines
.noLines
	LDA.w !k_byi
	CMP.w #!ENDING_KAI_GOKU_Y+1
	BCC .notFront
	JSR kai_draw_bubbles
	JSR kai_draw_goku
	JMP kai_draw_kai
.notFront
	CMP.w #!ENDING_KAI_Y
	BCC .behind
	JSR kai_draw_goku
	JSR kai_draw_bubbles
	JMP kai_draw_kai
.behind
	JSR kai_draw_goku
	JSR kai_draw_kai
	JMP kai_draw_bubbles

kai_draw_kai:
	LDA.w #!ENDING_KAI_X
	STA.w !o_x
	LDA.w #!ENDING_KAI_Y
	STA.w !o_y
	LDA.w #!KAI_ATTR_KAI
	STA.w !q_attr
	LDA.w #!KC_KAI
	JMP draw_quad

kai_draw_bubbles:
	LDA.w !k_bxi
	STA.w !o_x
	LDA.w !k_byi
	STA.w !o_y
	LDA.w #!KAI_ATTR_BUB
	LDX.w !k_dir
	CPX.w #$0002
	BNE .noFlip
	ORA.w #$4000
.noFlip
	STA.w !q_attr
	LDA.w #!KC_BUB
	JMP draw_quad

; Goku stands at (151,162); during the arrival he appears after frame 5.
kai_draw_goku:
	LDA.w !k_complete
	BNE .show
	LDA.l !ending_age
	CMP.w #12
	BCS .show
	CMP.w #6
	BCS .show
	RTS
.show
	LDA.w #!ENDING_KAI_GOKU_X
	STA.w !o_x
	LDA.w #!ENDING_KAI_GOKU_Y+1
	STA.w !o_y
	LDA.w #!KAI_ATTR_GOKU
	STA.w !q_attr
	LDA.w #!KC_GOKU
	JMP draw_quad

; Nine one-pixel lines (x, y0, length, colour), two 16-pixel cells each.
kai_lines:
	LDX.w #$0000
.line
	PHX
	LDA.l ending_lines_geometry,X
	AND.w #$00FF
	STA.w !o_x
	LDA.l ending_lines_geometry+1,X
	AND.w #$00FF
	STA.w !o_y
	LDA.l ending_lines_geometry+3,X
	AND.w #$00FF
	CLC
	ADC.w #!KC_LINES
	JSR cell_tile
	ORA.w #!KAI_ATTR_LINES
	STA.w !k_tmp
	STZ.w !o_size
	JSR oam_put
	LDA.w !o_y
	CLC
	ADC.w #16
	STA.w !o_y
	LDA.w !k_tmp
	JSR oam_put
	PLX
	INX : INX : INX : INX
	CPX.w #36
	BCC .line
	RTS
