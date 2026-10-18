; The Tree vista (engine/frieza-tree-view.js): during the Tree scenes on
; map 236 the picture is the browser's fixed view of the Mana Tree instead of
; the native camera. The two planes are generated tilemaps over the native
; tile set (snes/gen/frieza.mjs checks them pixel for pixel against
; mana-tree-vista.js): BG2 shows the Tree (whole, or its ruins once the ball
; struck), BG1 the cliff in front; the backdrop is the sky colour. On top:
; the tiny Frieza, his Death Ball (16-32 px, fx), the five large bursts of
; the impact, the native Goku and companions moved onto the cliff and every
; other native sprite hidden; the impact shakes the picture for 48 frames
; and flashes it white for 20. tree-return dims the vista to black over 48
; frames; tree-wake brings the native picture back over 40.
; VRAM: the tilemaps in BG char space $2000-$2BFF (tiles $200-$2BF, unused by
; map 236) and a blank tile at $2FF; uploaded in Frieza's vblank, 2 KiB a
; frame, when the vista is first wanted on the map.

!FZT_FG    = $2000
!FZT_BG    = $2400
!FZT_RUINS = $2800
!FZT_BLANKV = $2FF0
!FZT_BG1SC = $51                      ; the field's own BG1SC / BG2SC (C1:FD5B)
!FZT_BG2SC = $39

; !fz_vista bits (WRAM, rebuilt every field frame; the vblank only acts on
; this frame's request)
!FZV_ON     = $01                     ; show the vista
!FZV_PREV   = $02                     ; it showed last frame (restore when not now)
!FZV_BRIGHT = $04                     ; override the brightness (!fzt_bright)
!FZV_UP     = $08                     ; upload the tilemaps if they are not up

; Busy field frame: the Tree scenes' picture.
fz_tree_frame:
	JSR fz_scene_kind
	CMP.w #!FZS_TREE_ESTABLISH
	BEQ .tree
	CMP.w #!FZS_TREE_ARRIVAL
	BCC .out
	CMP.w #!FZS_TREE_WAKE+1
	BCC .tree
.out
	RTS
.tree
	CMP.w #!FZS_TREE_WAKE
	BNE +
	; the native picture fades back in over 40 frames
	LDA !fz_sage
	CMP.w #40
	BCS .out
	ASL
	ASL
	ASL
	ASL                               ; age * 16
	SEC
	SBC !fz_sage                      ; age * 15
	CLC
	ADC.w #20                         ; round(15 * age / 40)
	LDX.w #40
	JSR fz_divmod
	LDA !fz_m5
	JMP fz_tree_bright
+	CMP.w #!FZS_TREE_RETURN
	BNE .vista
	LDA !fz_sage
	CMP.w #48
	BCC +
	LDA.w #0                          ; black until the wake
	JMP fz_tree_bright
+	; dim the vista: round(15 * (1 - age / 48))
	EOR.w #$FFFF
	SEC
	ADC.w #48
	STA !fz_m0
	ASL
	ASL
	ASL
	ASL
	SEC
	SBC !fz_m0                        ; (48 - age) * 15
	CLC
	ADC.w #24
	LDX.w #48
	JSR fz_divmod
	LDA !fz_m5
	JSR fz_tree_bright
.vista
	; the vista needs map 236's tiles (tree-return may outlive the map)
	LDA $DC
	CMP.w #236
	BEQ +
	RTS
+	SEP #$20
	LDA.b #!FZV_UP
	TSB !fz_vista
	REP #$20
	LDA.l !fzt_up
	AND.w #$00FF
	CMP.w #4
	BCS +
	LDA.w #0                          ; not up yet: hold the picture black
	JMP fz_tree_bright
+	SEP #$20
	LDA.b #!FZV_ON
	TSB !fz_vista
	REP #$20
	JSR fz_camera
	; shake: impact ages < 48, -1 / +1 every 4 frames; ruins from impact 18
	STZ !fz_t7
	LDA.w #0
	STA.l !fzt_ruins
	JSR fz_scene_kind
	CMP.w #!FZS_TREE_IMPACT
	BNE .noimpact
	LDA !fz_sage
	CMP.w #18
	BCC +
	SEP #$20
	LDA.b #1
	STA.l !fzt_ruins
	REP #$20
+	LDA !fz_sage
	CMP.w #48
	BCS .flash
	AND.w #$0007
	CMP.w #4
	LDA.w #$FFFF
	BCC +
	LDA.w #1
+	STA !fz_t7
.flash
	; white for 20 frames: light = (20 - age) / 24 of the way to white
	LDA !fz_sage
	CMP.w #20
	BCS .shaken
	EOR.w #$FFFF
	SEC
	ADC.w #20
	STA !fz_m0
	ASL
	ASL
	ASL
	ASL
	ASL
	SEC
	SBC !fz_m0                        ; (20 - age) * 31
	LDX.w #24
	JSR fz_divmod
	LDA !fz_m5
	SEP #$20
	STA.l !fzv_white
	LDA.b #0
	STA.l !fzv_mode
	LDA.b #!FZT_WHITE
	TSB !fz_tflags
	REP #$20
	BRA .shaken
.noimpact
	CMP.w #!FZS_TREE_LEAVE
	BCC .shaken
	SEP #$20                          ; leave and return keep the ruins
	LDA.b #1
	STA.l !fzt_ruins
	REP #$20
.shaken
	LDA !fz_t7
	SEP #$20
	STA.l !fzt_shake
	REP #$20
	JSR fz_tree_natives
	JSR fz_tree_goku
	; the tiny Frieza (not while the vista establishes or fades)
	JSR fz_scene_kind
	CMP.w #!FZS_TREE_ESTABLISH
	BEQ .noFrieza
	CMP.w #!FZS_TREE_RETURN
	BEQ .noFrieza
	JSR fz_tree_pose                  ; -> !fz_px, !fz_py, !fz_pframe
	LDA !fz_pframe
	AND.w #$0007
	ORA.w #$0008                      ; tiny
	STA !fz_spr_id
	LDA !fz_px
	JSR fz_tree_addshake
	STA !fz_spr_x
	LDA !fz_py
	STA !fz_spr_y
	STZ !fz_spr_fl
	JSR fz_spr_draw
	JSR fz_tree_ball
.noFrieza
	JSR fz_scene_kind
	CMP.w #!FZS_TREE_IMPACT
	BNE +
	JSR fz_tree_bursts
+	RTS

; The vista's tilemaps are no longer known to be in VRAM (a map load, a
; dark frame, frames without the module): the next vista frame uploads them.
fz_vista_invalidate:
	LDA !fz_wasidle
	AND.w #!FZI_SRAM
	BEQ +
	SEP #$20
	LDA.b #0
	STA.l !fzt_up
	REP #$20
+	RTS

; Goku on the cliff: his back cell (column 0, row 3) with its top-left at
; (112 + shake, 156), as frieza-tree-view.js blits it.
fz_tree_goku:
	LDA.l !goku_form|$7E0000
	AND.w #$0001
	LDX.w #0
	LDY.w #3
	JSL goku_api_cell
	CMP.w #$FFFF
	BEQ +
	PHA
	LDA.w #128
	JSR fz_tree_addshake
	TAX
	LDY.w #187
	PLA
	JSL goku_api_scripted
+	RTS

; A16 += the impact's shake this frame (!fzt_shake, signed; the routines
; the vista calls use the scratch words). X, Y kept.
fz_tree_addshake:
	PHA
	LDA.l !fzt_shake
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	CLC
	ADC $01,S
	STA $01,S
	PLA
	RTS

; A16 = brightness 0-15 for the vblank to force.
fz_tree_bright:
	SEP #$20
	STA.l !fzt_bright
	LDA.b #!FZV_BRIGHT
	TSB !fz_vista
	REP #$20
	RTS

; treeFriezaPose: the arrival and the departure from tables (hover bob in
; them), else (182, 126 + hover); the charge and throw frames.
fz_tree_pose:
	JSR fz_scene_clock
	JSR fz_hover
	INC                               ; 0-2
	ASL
	TAY                               ; hover column (word offset of the table)
	JSR fz_scene_kind
	CMP.w #!FZS_TREE_ARRIVAL
	BEQ .arrive
	CMP.w #!FZS_TREE_LEAVE
	BEQ .leave
	LDA.w #182
	STA !fz_px
	TYA
	LSR
	DEC
	CLC
	ADC.w #126
	STA !fz_py
	BRA .frame
.arrive
	LDA !fz_sage
	CMP.w #96
	BCC +
	LDA.w #96
+	ASL
	TAX
	LDA.l frieza_tree_arrive_x,X
	STA !fz_px
	CPY.w #0
	BNE +
	LDA.l frieza_tree_arrive_y0,X
	BRA ++
+	CPY.w #2
	BNE +
	LDA.l frieza_tree_arrive_y1,X
	BRA ++
+	LDA.l frieza_tree_arrive_y2,X
++	STA !fz_py
	BRA .frame
.leave
	LDA !fz_sage
	CMP.w #120
	BCC +
	LDA.w #120
+	ASL
	TAX
	LDA.l frieza_tree_leave_x,X
	STA !fz_px
	CPY.w #0
	BNE +
	LDA.l frieza_tree_leave_y0,X
	BRA ++
+	CPY.w #2
	BNE +
	LDA.l frieza_tree_leave_y1,X
	BRA ++
+	LDA.l frieza_tree_leave_y2,X
++	STA !fz_py
.frame
	JSR fz_scene_kind
	CMP.w #!FZS_TREE_CHARGE
	BNE +
	JSR fz_charge_frame
	BRA ++
+	CMP.w #!FZS_TREE_SHOT
	BNE +
	JSR fz_throw_frame
	BRA ++
+	LDA.w #0
++	SEP #$20
	STA !fz_pframe
	REP #$20
	RTS

; The tree Death Ball: over his head while he charges (16 -> 32 px), then
; thrown to (150, 126) over 40 frames. fx's red ball at screen spots.
fz_tree_ball:
	JSR fz_scene_clock
	LSR
	LSR
	LSR
	LDX.w #12
	JSR fz_divmod
	STA !fz_t3                        ; art frame
	JSR fz_scene_kind
	CMP.w #!FZS_TREE_CHARGE
	BEQ .charge
	CMP.w #!FZS_TREE_SHOT
	BEQ .shot
	RTS
.charge
	LDA !fz_sage
	CMP.w #89
	BCC +
	LDA.w #88
+	TAX
	LDA.l frieza_tree_charge_size,X
	AND.w #$00FF
	PHA
	LDA !fz_px
	JSR fz_tree_addshake
	TAX
	LDA !fz_py
	SEC
	SBC.w #42
	TAY
	PLA
	JMP fz_fx_deathball_screen
.shot
	LDA !fz_sage
	CMP.w #!FRIEZA_TREE_SHOT_LEN
	BCC +
	RTS
+	ASL
	TAX
	LDA.l frieza_tree_shot_x,X
	JSR fz_tree_addshake
	PHA
	; y by the throw pose's bob (p.y = 126 + bob)
	LDA !fz_py
	SEC
	SBC.w #126
	BEQ .b0
	BMI .bm
	LDA.l frieza_tree_shot_y2,X
	BRA +
.bm
	LDA.l frieza_tree_shot_y0,X
	BRA +
.b0
	LDA.l frieza_tree_shot_y1,X
+	TAY
	PLX
	LDA.w #32
	JMP fz_fx_deathball_screen

; The impact's five large bursts at (150 + (i%3 - 1) * 14, 123 + (i>>1) * 16),
; 12 frames apart (fx works in map pixels: the native camera is added).
fz_tree_bursts:
	LDX.w #0
-	LDA !fz_sage
	SEC
	SBC.l fz_tree_burst_t,X
	BMI +
	CMP.w #74
	BCS +
	PHX
	PHA
	LDA.l fz_tree_burst_x,X
	CLC
	ADC !fz_cam_x
	JSR fz_tree_addshake
	STA !fz_ax
	LDA.l fz_tree_burst_y,X
	CLC
	ADC !fz_cam_y
	STA !fz_ay
	PLA
	JSR fz_lb_spawn
	PLX
+	INX
	INX
	CPX.w #5*2
	BCC -
	RTS
fz_tree_burst_t:
	dw 0, 12, 24, 36, 48
fz_tree_burst_x:
	dw 136, 150, 164, 136, 150
fz_tree_burst_y:
	dw 123, 123, 139, 139, 155

; Native sprites: Goku and the two companions move onto the cliff (their
; real cells, as the browser's companion() and its atlas Goku at (112, 156)),
; everything else is hidden. Owners by their screen anchors (boxes):
; anchors in !fz_t0-!fz_t5 (x, feet y), moves in !fz_m0-!fz_m5.
fz_tree_natives:
	LDX.w #$0000                      ; Goku
	JSR .anchor
	STA !fz_t0
	STY !fz_t1
	LDA.w #128
	SEC
	SBC !fz_t0
	STA !fz_m0
	LDA.w #187
	SEC
	SBC !fz_t1
	STA !fz_m1
	LDA.w #139                        ; the girl (companion(139, 102, 200))
	JSR fz_find_species
	BCC .noGirl
	JSR .anchor
	STA !fz_t2
	STY !fz_t3
	LDA.w #102
	JSR fz_tree_addshake
	SEC
	SBC !fz_t2
	STA !fz_m2
	LDA.w #200
	SEC
	SBC !fz_t3
	STA !fz_m3
	BRA +
.noGirl
	LDA.w #$7FFF
	STA !fz_t2
+	LDA.w #140                        ; the sprite (companion(140, 154, 200))
	JSR fz_find_species
	BCC .noSprite
	JSR .anchor
	STA !fz_t4
	STY !fz_t5
	LDA.w #154
	JSR fz_tree_addshake
	SEC
	SBC !fz_t4
	STA !fz_m4
	LDA.w #200
	SEC
	SBC !fz_t5
	STA !fz_m5
	BRA +
.noSprite
	LDA.w #$7FFF
	STA !fz_t4
+	; the native slots
	LDA.l !core_oam_native
	CMP.w #129
	BCC +
	LDA.w #128
+	ASL
	ASL
	TAX
.slot
	DEX
	DEX
	DEX
	DEX
	BPL +
	RTS
+	LDA.w $0800,X
	AND.w #$00FF
	STA !fz_m6                        ; x
	LDA.w $0801,X
	AND.w #$00FF
	CMP.w #$00E0
	BCC +
	ORA.w #$FF00
+	STA !fz_m7                        ; y (signed)
	LDY.w #0
	JSR .owned
	BCS .move
	LDY.w #4
	JSR .owned
	BCS .move
	LDY.w #8
	JSR .owned
	BCS .move
.hide
	LDA.w #$E0FF                      ; nobody's: hidden
	STA.w $0800,X
	BRA .slot
.move
	LDA !fz_m6
	CLC
	ADC.w !fz_m0,Y
	BMI .hide
	CMP.w #256
	BCS .hide
	SEP #$20
	STA.w $0800,X
	REP #$20
	LDA !fz_m7
	CLC
	ADC.w !fz_m1,Y
	SEP #$20
	STA.w $0801,X
	REP #$20
	JSR fz_oam_clear_x9
	BRA .slot
; actor X (offset) -> A16 = screen x, Y16 = feet y
.anchor
	LDA $E074,X
	AND.w #$007F
	CLC
	ADC $E022,X
	TAY
	LDA $E020,X
	RTS
; C set when the slot (!fz_m6, !fz_m7) is a body cell of actor Y (0, 4, 8):
; left edge within [x - 24, x + 8), top edge within [feet - 48, feet - 6)
.owned
	LDA.w !fz_t0,Y
	CMP.w #$7FFF
	BEQ .no
	LDA !fz_m6
	SEC
	SBC.w !fz_t0,Y
	CLC
	ADC.w #24
	CMP.w #32
	BCS .no
	LDA !fz_m7
	SEC
	SBC.w !fz_t1,Y
	CLC
	ADC.w #48
	CMP.w #42
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS

; Slot X/4: the high-table X bit 8 cleared (the moved sprite is on screen).
fz_oam_clear_x9:
	PHX
	TXA
	LSR
	LSR
	PHA
	AND.w #$0003
	ASL
	TAY                               ; bit pair (0, 2, 4, 6)
	PLA
	LSR
	LSR
	TAX                               ; high-table byte
	SEP #$20
	LDA.w $0A00,X
	AND.w fz_x9_keep,Y
	STA.w $0A00,X
	REP #$20
	PLX
	RTS
fz_x9_keep:
	db $FE,$00,$FB,$00,$EF,$00,$BF,$00

; Vblank (DB = $80): uploads, then the vista's registers or their return.
fz_tree_nmi:
	LDA.l $7E0000|!fz_vista
	AND.w #!FZV_UP
	BEQ .show
	; a load may have rewritten the planes since they went up (the Tree's
	; event reloads its map without a field frame seeing it dark)
	LDA.l !fzt_up
	AND.w #$00FF
	CMP.w #4
	BCC +
	JSR fz_vista_verify
	BCC +
	SEP #$20
	LDA.b #0
	STA.l !fzt_up
	REP #$20
+	LDA.l !fzt_up
	AND.w #$00FF
	CMP.w #4
	BCS .show
	PHA
	JSL core_vblank_lines
	CMP.w #16
	PLA
	BCC .show
	; chunk 0 fg, 1 bg, 2 ruins (2 KiB each), 3 the blank tile
	ASL
	TAX
	SEP #$20
	LDA.b #$80
	STA $2115
	LDA.b #$01
	STA $4370
	LDA.b #$18
	STA $4371
	LDA.b #frieza_vista_fg>>16
	STA $4374
	REP #$20
	LDA.l fz_vista_dest,X
	STA $2116
	LDA.l fz_vista_src,X
	STA $4372
	LDA.l fz_vista_len,X
	STA $4375
	SEP #$20
	LDA.b #$80
	STA $420B
	LDA.l !fzt_up
	INC
	STA.l !fzt_up
	REP #$20
.show
	LDA.l $7E0000|!fz_vista
	AND.w #!FZV_ON
	BNE +
	JMP .notShown
+	LDA.l !fzt_up                     ; planes lost this vblank: black until they are back
	AND.w #$00FF
	CMP.w #4
	BCS +
	SEP #$20
	LDA.b #$80
	STA $2100
	REP #$20
	RTS
+	; scroll = -shake (10 bits)
	LDA.l !fzt_shake
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	EOR.w #$FFFF
	INC
	AND.w #$03FF
	STA.l $7E0000|!fz_t0
	SEP #$20
	LDA.b #!FZT_FG>>8                 ; BG1: the cliff
	STA $2107
	LDA.l !fzt_ruins
	BEQ +
	LDA.b #!FZT_RUINS>>8
	BRA ++
+	LDA.b #!FZT_BG>>8                 ; BG2: the Tree
++	STA $2108
	; the scroll registers share one write latch: each gets its two bytes
	; in a row (low, high)
	LDA.l $7E0000|!fz_t0
	STA $210D
	LDA.l $7E0000|!fz_t0+1
	STA $210D
	STZ $210E
	STZ $210E
	LDA.l $7E0000|!fz_t0
	STA $210F
	LDA.l $7E0000|!fz_t0+1
	STA $210F
	STZ $2110
	STZ $2110
	STZ $2121                         ; the sky behind both planes
	LDA.b #!FRIEZA_VISTA_SKY
	STA $2122
	LDA.b #!FRIEZA_VISTA_SKY>>8
	STA $2122
	REP #$20
	; no switch to the HUD at line 196 (VTIME beyond the frame): the cliff
	; runs to the bottom
	LDA.w #$01FF
	STA $4209
	JSR fz_tree_tm
	BRA .bright
.notShown
	LDA.l $7E0000|!fz_vista
	AND.w #!FZV_PREV
	BEQ .bright
	SEP #$20
	LDA.b #!FZT_BG1SC
	STA $2107
	LDA.b #!FZT_BG2SC
	STA $2108
	LDA.l $7E0021                     ; the field's TM back (the shadow C1:FF81 writes), channel 4 off
	STA $212C
	LDA.l $7E002C
	AND.b #$EF
	STA.l $7E002C
	REP #$20
	LDA.w #$00C4                      ; the field's HUD line (C0:BC6C)
	STA $4209
.bright
	LDA.l $7E0000|!fz_vista
	AND.w #!FZV_BRIGHT
	BEQ .out
	SEP #$20
	LDA.l $7E0000|$E6                 ; the game's INIDISP: keep a forced blank
	BMI +
	LDA.l !fzt_bright
	AND.b #$0F
	STA $2100
+	REP #$20
.out
	RTS
; BG3 under the vista from line 170 down (frieza-tree-view.js plan(): above
; it BG3, the dialogue, shows through; below it the vista paints every
; layer, the HUD rows too; tree-return paints them all from the top): HDMA
; channel 4 writes TM ($212C) from a table in the scene SRAM, the game's TM
; ($21) on lines 0-169 and the same without BG3 from line 170 (the write in
; line 170's H-blank shows from picture row 170). The table is rebuilt every
; vblank; the channel runs while $2C bit 4 is set (core writes $2C to
; HDMAEN after the modules; no other module runs HDMA on channel 4 in the
; field, and the ones that send general DMA on it do so before Frieza's
; vblank). DB = $80, M16/X16.
fz_tree_tm:
	SEP #$20
	LDA.l $7E0021                     ; the field's TM (C1:FF81)
	STA.l !fzt_tm+1
	STA.l !fzt_tm+3
	AND.b #$FB                        ; without BG3
	STA.l !fzt_tm+5
	LDA.l $7E0000|!fz_scene
	CMP.b #!FZS_TREE_RETURN
	BNE +
	LDA.l !fzt_tm+5                   ; tree-return: from the top
	STA.l !fzt_tm+1
	STA.l !fzt_tm+3
+	LDA.b #85                         ; lines 0-84, 85-169, then 170 on
	STA.l !fzt_tm+0
	STA.l !fzt_tm+2
	LDA.b #1
	STA.l !fzt_tm+4
	LDA.b #0
	STA.l !fzt_tm+6
	STZ $4340                         ; one byte a line, A -> B, direct table
	LDA.b #$2C
	STA $4341
	LDA.b #!fzt_tm>>16
	STA $4344
	REP #$20
	LDA.w #!fzt_tm&$FFFF
	STA $4342
	SEP #$20
	LDA.l $7E002C
	ORA.b #$10
	STA.l $7E002C
	REP #$20
	RTS

; C set when a checked word of the planes in VRAM differs from the data
; (frieza_vista_check: first, middle and last of each plane). DB = $80.
fz_vista_verify:
	SEP #$20
	LDA.b #$80
	STA $2115                         ; increment after the high byte
	REP #$20
	LDX.w #0
-	LDA.l fz_vista_probe,X
	STA $2116
	LDA $2139                         ; the prefetched word (low, high)
	CMP.l frieza_vista_check,X
	BNE .lost
	INX
	INX
	CPX.w #18
	BCC -
	CLC
	RTS
.lost
	SEC
	RTS
fz_vista_probe:
	dw !FZT_FG, !FZT_FG+$200, !FZT_FG+$3FF
	dw !FZT_BG, !FZT_BG+$200, !FZT_BG+$3FF
	dw !FZT_RUINS, !FZT_RUINS+$200, !FZT_RUINS+$3FF
fz_vista_dest:
	dw !FZT_FG, !FZT_BG, !FZT_RUINS, !FZT_BLANKV
fz_vista_src:
	dw frieza_vista_fg, frieza_vista_bg, frieza_vista_ruins, frieza_vista_zero
fz_vista_len:
	dw 2048, 2048, 2048, 32
