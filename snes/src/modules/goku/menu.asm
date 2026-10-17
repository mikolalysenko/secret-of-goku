; Full-screen menus (Mode 5), as engine/sprite-layer.js draws them:
;  - menuBody: the boy's 16x32 figure (bank-0 OBJ tiles 30-37, palette 1, a
;    2x4 block of 8x8 cells: Status, Action Grid, save confirmation) becomes
;    Goku's 32x32 front idle cell, blink included, at (x - 8, y), as long as
;    OBJ palette 1 holds the boy's colours (Primm and Popoi keep theirs).
;  - savePortrait: each GAME FILE slot holding a validated GOKU record shows
;    his 16x16 face (base form) on screen rows 31 + 48 * slot, columns 94-109.
; modules_menu_frame -> goku_menu_frame, once per menu frame in vblank right
; after the menu's own uploads (C0:1E08). The menu re-sends its OAM buffer
; (7E:9C00) only when something changed, so this code edits the PPU's OAM
; directly every frame after that upload: the menu's buffer and logic never
; see Goku. Graphics use OBJ name table 2 tiles C0-C9/D0-D9 and E0-E7/F0-F7
; (word $5C00-$5F7F), which no menu screen uses and the field reloads when
; it returns. Every PPU access is checked against core_vblank_lines first;
; when time is short the screen keeps last frame's edits.

; Menu state in pal_work (field-frame scratch; field code does not run in
; menus, and a field frame starts a new menu session, see m_tick)
!m_tmpw   = !pal_work+$00   ; word: scratch
!m_tmpw2  = !pal_work+$02   ; word: scratch
!m_hi     = !pal_work+$04   ; byte: OAM high byte $21E being built
!m_hi2    = !pal_work+$05   ; byte: OAM high byte $21F being built
!m_idle   = !pal_work+$06   ; word: idle cell + 1 in slot C0 (0 = none)
!m_blink  = !pal_work+$08   ; word: blink cell + 1 in slot E0 (0 = none)
!m_form   = !pal_work+$0A   ; byte: form + 1 of the two cells
!m_tile   = !pal_work+$0B   ; byte: slot shown this frame ($C0 / $E0)
!m_hide   = !pal_work+$0C   ; byte: $FF hide / 0 restore (goku_menu_oam_eight)
!m_drawn  = !pal_work+$0D   ; byte: native figure entry hidden in OAM
!m_new    = !pal_work+$0E   ; byte: MF_FIGURE / MF_FACES to show this frame
!m_mask   = !pal_work+$0F   ; byte: quadrant mask of the shown cell
!m_flags  = !pal_work+$10   ; byte: MF_* shown by our OAM edits / in VRAM
!m_entry  = !pal_work+$11   ; byte: first OAM entry of the native figure
!m_imask  = !pal_work+$12   ; byte: quadrant mask of the idle cell
!m_bmask  = !pal_work+$13   ; byte: quadrant mask of the blink cell
!m_tick   = !pal_work+$14   ; word: !core_tick of the last menu frame
!m_x      = !pal_work+$16   ; word: figure origin (native entry e)
!m_y      = !pal_work+$18   ; word
!m_attr   = !pal_work+$1A   ; byte: OBJ attributes of Goku's figure cells
!m_slots  = !pal_work+$1B   ; byte: GAME FILE slots with Goku's face (bits)
!m_pal    = !pal_work+$1C   ; byte: Goku palette id + 1 known in OBJ palette 1
!m_palw   = !pal_work+$1D   ; byte: palette id + 1 to write this frame
!m_ltile  = !pal_work+$1E   ; byte: figure slot last written to OAM
!m_lslots = !pal_work+$1F   ; byte: face slots last written to OAM

!MF_FIGURE   = $01   ; OAM: native figure hidden, Goku drawn at 120-123
!MF_FACES    = $02   ; OAM: faces at 124-127
!MF_FACEVRAM = $04   ; the face tiles are in VRAM

!MENU_OAM   = $9C00          ; the menu's OAM buffer (bank $7E, $220 bytes)
!MENU_IDLE  = $5C00          ; OBJ base $4000, table 2 at +$1000: C0-C7/D0-D7
!MENU_BLINK = $5E00          ; E0-E7/F0-F7
!MENU_FACE  = $5C80          ; C8/C9, D8/D9
!MENU_FIG_ENTRY = 120        ; Goku's figure: OAM entries 120-123
!MENU_LAST_E    = 113        ; the native figure must end below them

; ---------------------------------------------------------------------------
; modules_menu_frame: M16 X16, DB = $7E, D = 0, in vblank.
goku_menu_frame:
	PHP
	PHB
	PHD
	REP #$30
	PEA $7E7E
	PLB
	PLB
	LDA.w #$0000
	TCD
	JSR goku_ensure_init
	REP #$30
	; another mode ran since the last menu frame: the field has reloaded
	; VRAM, CGRAM and OAM, so nothing of ours is in any of them any more
	LDA.l !core_tick
	DEC
	CMP !m_tick
	BEQ .session
	STZ !m_idle
	STZ !m_blink
	SEP #$20
	STZ !m_form
	STZ !m_flags
	STZ !m_pal
	REP #$20
.session
	LDA.l !core_tick
	STA !m_tick
	JSL core_vblank_lines
	CMP.w #16
	BCC .done
	SEP #$20
	STZ !m_new
	STZ !m_palw
	JSR goku_menu_figure
	SEP #$20
	LDA !m_new
	BNE .show                ; the figure and the faces never share a screen
	JSR goku_menu_faces
.show
	JSR goku_menu_palette
	JSR goku_menu_oam
	BCC .done                ; no time left: OAM keeps last frame's edits
	SEP #$20
	LDA !m_flags
	AND.b #!MF_FACEVRAM
	ORA !m_new
	STA !m_flags
.done
	REP #$30
	PLD
	PLB
	PLP
	RTL

; ---------------------------------------------------------------------------
; The figure. Sets MF_FIGURE in m_new when Goku's cell can be shown.
goku_menu_figure:
	SEP #$20
	LDA.l !persist_goku_active
	BEQ .none
	LDA !goku_ctl
	AND.b #!GOKU_CTL_SUPPRESS
	BNE .none
	JSR goku_menu_find
	BCC .none
	JSR goku_menu_slots_free
	BCC .none
	JSR goku_menu_pal_check
	BCS .boy
.none
	SEP #$20
	RTS
.boy
	JSR goku_menu_pose       ; C set while blinking
	SEP #$20
	LDA.b #$C0
	BCC .slot
	LDA.b #$E0
.slot
	STA !m_tile
	; both cells of the form in VRAM (one upload per frame)
	LDA !goku_form
	AND.b #$01
	INC
	CMP !m_form
	BEQ .cells
	STA !m_form
	REP #$20
	STZ !m_idle
	STZ !m_blink
	SEP #$20
.cells
	REP #$30
	LDA !m_idle
	BNE .blink_cell
	LDA.w #!MENU_IDLE
	LDX.w #!GOKU_CLIP_IDLE
	JSR goku_menu_upload
	BCC .no
	STA !m_idle
	SEP #$20
	TXA
	STA !m_imask
	BRA .no                  ; shown once both cells are in
.blink_cell
	LDA !m_blink
	BNE .ready
	LDA.w #!MENU_BLINK
	LDX.w #!GOKU_CLIP_BLINK
	JSR goku_menu_upload
	BCC .no
	STA !m_blink
	SEP #$20
	TXA
	STA !m_bmask
	BRA .no
.ready
	SEP #$20
	LDA !m_tile
	CMP.b #$C0
	BNE .blinking
	LDA !m_imask
	BRA .mask
.blinking
	LDA !m_bmask
.mask
	STA !m_mask
	LDA.b #!MF_FIGURE
	TSB !m_new
.no
	SEP #$20
	RTS

; Find the boy's figure in the menu's OAM buffer: entry e (a multiple of
; 4, as every menu places it) with tile 30, palette 1, name table 1, no
; flips, on screen, followed by tiles 31-37 in two columns 8 px apart; all
; eight small with x9 clear (their two high-table bytes are 0). C set:
; m_entry, m_x, m_y, m_attr. Exit M8 X16.
goku_menu_find:
	REP #$30
	LDX.w #$0000
.scan
	SEP #$20
	LDA !MENU_OAM+2,X
	CMP.b #$30
	BNE .next
	LDA !MENU_OAM+3,X
	AND.b #$CF
	CMP.b #$02
	BNE .next
	LDA !MENU_OAM+1,X
	CMP.b #224
	BCS .next
	JSR goku_menu_find_rest
	BCS .found
.next
	REP #$21
	TXA
	ADC.w #16                ; next multiple-of-4 entry
	TAX
	CPX.w #!MENU_LAST_E*4
	BCC .scan
	SEP #$20
	CLC
	RTS
.found
	REP #$20
	TXA
	LSR
	LSR
	SEP #$20
	STA !m_entry
	LDA !MENU_OAM+3,X
	AND.b #$30               ; the figure's priority
	ORA.b #$03               ; palette 1, name table 2
	STA !m_attr
	SEC
	RTS

; X = buffer offset of entry e (tile 30, e a multiple of 4). C set when the
; other seven cells and the size/x9 bits match. M8 X16; keeps X.
goku_menu_find_rest:
	PHX
	REP #$20
	TXA
	LSR
	LSR
	LSR
	LSR
	TAY                      ; high-table byte of entries e..e+3
	SEP #$20
	LDA !MENU_OAM+$200,Y
	ORA !MENU_OAM+$201,Y
	BNE .no
	LDA !MENU_OAM+0,X
	STA !m_x
	STZ !m_x+1
	LDA !MENU_OAM+1,X
	STA !m_y
	STZ !m_y+1
	LDY.w #$0001             ; cell k = 1..7: tile 30+k at (k&1, k>>1) * 8
.k
	INX
	INX
	INX
	INX
	TYA
	CLC
	ADC.b #$30
	CMP !MENU_OAM+2,X
	BNE .no
	LDA !MENU_OAM+3,X
	AND.b #$CF
	CMP.b #$02
	BNE .no
	TYA
	AND.b #$01
	ASL
	ASL
	ASL
	CLC
	ADC !m_x
	CMP !MENU_OAM+0,X
	BNE .no
	TYA
	LSR
	ASL
	ASL
	ASL
	CLC
	ADC !m_y
	CMP !MENU_OAM+1,X
	BNE .no
	INY
	CPY.w #8
	BCC .k
	PLX
	SEC
	RTS
.no
	PLX
	CLC
	RTS

; C set when the menu leaves OAM entries 120-127 off screen. Exit M8 X16.
goku_menu_slots_free:
	REP #$30
	LDX.w #!MENU_FIG_ENTRY*4
.entry
	SEP #$20
	LDA !MENU_OAM+1,X
	CMP.b #224
	BCC .busy
	REP #$21
	TXA
	ADC.w #4
	TAX
	CPX.w #512
	BCC .entry
	SEP #$20
	SEC
	RTS
.busy
	CLC
	RTS

; ---------------------------------------------------------------------------
; OBJ palette 1 must hold the boy's menu colours (C8:1F00, loaded by
; C7:5E64; sprite-layer.js boyMenuPalette) or Goku's (written here). The
; first frame compares all 15 colours, later frames three. C set when the
; figure is the boy's; m_palw = palette to write. Exit M8 X16.
goku_menu_pal_check:
	SEP #$20
	LDA !goku_form
	AND.b #$01
	INC
	CMP !m_pal
	BNE .full
	REP #$30
	AND.w #$00FF
	DEC
	LDY.w #3
	JSR goku_menu_cg_is      ; still Goku's (form palette id = form)
	BCS .ok
.full
	SEP #$20
	STZ !m_pal
	REP #$30
	JSR goku_menu_cg_is_boy
	BCS .write
	LDA.w #$0000
	LDY.w #15
	JSR goku_menu_cg_is
	BCS .write               ; a Goku palette: rewrite for the current form
	LDA.w #$0001
	LDY.w #15
	JSR goku_menu_cg_is
	BCC .no
.write
	SEP #$20
	LDA !goku_form
	AND.b #$01
	INC
	STA !m_palw
.ok
	SEP #$20
	SEC
	RTS
.no
	SEP #$20
	CLC
	RTS

; C set when OBJ palette 1 colours 1-15 hold the boy's menu colours.
; M16 X16.
goku_menu_cg_is_boy:
	SEP #$20
	LDA.b #$91
	STA.l $002121
	LDX.w #$0000
.colour
	LDA.l $00213B
	CMP.l !BOY_PALETTE+2,X
	BNE .no
	LDA.l $00213B
	AND.b #$7F               ; bit 7 reads open bus
	CMP.l !BOY_PALETTE+3,X
	BNE .no
	INX
	INX
	CPX.w #30
	BCC .colour
	REP #$20
	SEC
	RTS
.no
	REP #$20
	CLC
	RTS

; A16 = Goku palette id, Y = colours to compare (from colour 1): C set when
; OBJ palette 1 holds them. M16 X16.
goku_menu_cg_is:
	ASL
	ASL
	ASL
	ASL
	ASL
	INC
	INC
	TAX                      ; colour 1 of the palette
	SEP #$20
	LDA.b #$91
	STA.l $002121
.colour
	LDA.l $00213B
	CMP.l goku_palettes,X
	BNE .no
	LDA.l $00213B
	AND.b #$7F
	CMP.l goku_palettes+1,X
	BNE .no
	INX
	INX
	DEY
	BNE .colour
	REP #$20
	SEC
	RTS
.no
	REP #$20
	CLC
	RTS

; Write palette m_palw - 1 into OBJ palette 1 (colours 1-15) when asked and
; vblank has room; otherwise nothing of ours shows this frame. Exit M8 X16.
goku_menu_palette:
	SEP #$20
	LDA !m_palw
	BEQ .done
	REP #$30
	JSL core_vblank_lines
	CMP.w #6
	BCC .skip
	SEP #$20
	LDA !m_palw
	STA !m_pal
	REP #$20
	AND.w #$00FF
	DEC
	ASL
	ASL
	ASL
	ASL
	ASL
	INC
	INC
	TAX
	SEP #$20
	LDA.b #$91
	STA.l $002121
	LDY.w #30
.byte
	LDA.l goku_palettes,X
	STA.l $002122
	INX
	DEY
	BNE .byte
.done
	SEP #$20
	RTS
.skip
	SEP #$20
	STZ !m_new
	RTS

; ---------------------------------------------------------------------------
; The menu pose (pose() with menu = true): idle in the front row; the pose
; state (age, stationary frames, idle blink clock) advances as on the
; field. C set while the idle blink shows. Exit M8 X16.
goku_menu_pose:
	SEP #$20
	STZ !p_kind              ; GOKU_K_IDLE
	STZ !p_row
	STZ !st_blocked
	LDA.b #$01
	STA !p_newframe
	LDA !st_facing
	STA !p_facing
	REP #$30
	STZ !p_dist
	LDA !st_stat
	CMP.w #$7FFF
	BCS .stat
	INC !st_stat
.stat
	JSR pose_update_state
	SEP #$20
	LDA !st_blink            ; pk_idle: age % 180 in 150..154
	CMP.b #150
	BCC .open
	CMP.b #155
	BCS .open
	SEC
	RTS
.open
	CLC
	RTS

; Upload the front-row cell of clip X (age 0, current form) to VRAM A16
; when vblank has room. C set: A16 = cell + 1, X = its quadrant mask.
; M16 X16 in; exit M16 X16.
goku_menu_upload:
	STA !m_tmpw2
	STX !m_tmpw
	JSL core_vblank_lines
	CMP.w #14
	BCC .none
	LDA $2C                  ; channels 4-7 must be free of HDMA
	AND.w #$00F0
	BEQ .room
.none
	REP #$30
	CLC
	RTS
.room
	STZ !t_age
	SEP #$20
	STZ !t_row
	STZ !p_var
	LDA !m_tmpw
	JSR pose_track
	JSR pose_post
	JSR pose_cell_lookup
	REP #$30
	LDA !p_cell
	ASL
	ASL
	ASL
	ASL
	ASL                      ; cell * 32 bytes
	TAY
	LDA.w #$4300
	TCD
	LDA.w #$1801
	STA $40
	STA $50
	STA $60
	STA $70
	SEP #$20
	LDA.b #$80
	STA.l $002115
	REP #$20
	TYX
	LDA !m_tmpw2
	JSR goku_burst4          ; cell rows 0-7: tiles +0..+3
	LDA !m_tmpw2
	CLC
	ADC.w #$0100
	JSR goku_burst4          ; rows 8-15: +16..+19
	LDA !m_tmpw2
	CLC
	ADC.w #$0040
	JSR goku_burst4          ; rows 16-23: +4..+7
	LDA !m_tmpw2
	CLC
	ADC.w #$0140
	JSR goku_burst4          ; rows 24-31: +20..+23
	LDA.w #$0000
	TCD
	LDX !p_cell
	SEP #$20
	LDA.l goku_cell_mask,X
	REP #$20
	AND.w #$00FF
	TAX
	LDA !p_cell
	INC
	SEC
	RTS

; ---------------------------------------------------------------------------
; GAME FILE faces. Sets MF_FACES in m_new and m_slots.
goku_menu_faces:
	SEP #$20
	STZ !m_slots
	JSR goku_menu_file_screen
	BCC .done
	JSR goku_menu_slots_free
	BCC .done
	LDY.w #$0000
.slot
	JSR goku_menu_record
	ROR !m_slots             ; slot 0 ends in bit 4
	INY
	CPY.w #4
	BCC .slot
	LDA !m_slots
	LSR
	LSR
	LSR
	LSR
	STA !m_slots
	BEQ .done
	LDA !m_flags
	AND.b #!MF_FACEVRAM
	BNE .palette
	LDA $2C
	BMI .none                ; channel 7 runs HDMA
	REP #$30
	JSL core_vblank_lines
	CMP.w #6
	BCC .none
	LDA.w #!MENU_FACE
	LDX.w #$0000             ; the base form, as the browser's atlas
	JSR goku_portrait_dma
	SEP #$20
	LDA.b #!MF_FACEVRAM
	TSB !m_flags
	BRA .none                ; shown from the next frame
.palette
	; nothing else draws with OBJ palette 1 on this screen: the base
	; palette goes there (re-checked, other screens reload palette 1)
	LDA !m_pal
	CMP.b #1
	BNE .write
	REP #$30
	LDA.w #$0000
	LDY.w #3
	JSR goku_menu_cg_is
	SEP #$20
	BCS .show
.write
	STZ !m_pal
	LDA.b #1                 ; base palette + 1
	STA !m_palw
.show
	LDA.b #!MF_FACES
	TSB !m_new
	RTS
.none
	SEP #$20
	STZ !m_slots
.done
	SEP #$20
	RTS

; C set when BG2's map ($5800) shows the four GAME FILE windows: their left
; edge tile $20 in column 7 of rows 2/8/14/20 and its vertical mirror on
; rows 7/13/19/25 (sprite-layer.js refreshSaveFaces). Exit M8 X16.
goku_menu_file_screen:
	SEP #$20
	LDA.b #$80
	STA.l $002115            ; increment after the high byte
	REP #$30
	LDX.w #$0000
.word
	LDA.l goku_menu_file_rows,X
	STA.l $002116            ; prefetches the word
	SEP #$20
	LDA.l $002139
	XBA
	LDA.l $00213A
	XBA
	REP #$20
	AND.w #$C3FF
	CMP.l goku_menu_file_vals,X
	BNE .no
	INX
	INX
	CPX.w #16
	BCC .word
	SEP #$20
	SEC
	RTS
.no
	SEP #$20
	CLC
	RTS

goku_menu_file_rows:
	dw $5847, $58E7, $5907, $59A7, $59C7, $5A67, $5A87, $5B27
goku_menu_file_vals:
	dw $0020, $8020, $0020, $8020, $0020, $8020, $0020, $8020

; C set when GAME FILE slot Y holds a validated GOKU record: $A215 keeps two
; bits per slot (C7:5C3B; 3 = none, bit 0 = the backup copy at +$1000); the
; $400-byte records at $30:6000 (C7:5BDA) carry $C5 at +0, $3A at +$2BB and
; the name at +3. M8 X16; keeps Y.
goku_menu_record:
	PHY
	REP #$20
	TYA
	XBA
	ASL
	ASL                      ; slot * $400
	STA !m_tmpw
	SEP #$20
	LDA $A215
	CPY.w #$0000
	BEQ .bits
.shift
	LSR
	LSR
	DEY
	BNE .shift
.bits
	AND.b #$03
	CMP.b #$03
	BEQ .no
	LSR                      ; bit 0: the backup copy
	REP #$20
	LDA !m_tmpw
	BCC .copy
	ADC.w #$0FFF             ; + $1000 (carry set)
.copy
	TAX
	SEP #$20
	LDA.l $306000,X
	CMP.b #$C5
	BNE .no
	LDA.l $3062BB,X
	CMP.b #$3A
	BNE .no
	LDA.l $306003,X
	CMP.b #$A1
	BNE .no
	LDA.l $306004,X
	CMP.b #$A9
	BNE .no
	LDA.l $306005,X
	CMP.b #$A5
	BNE .no
	LDA.l $306006,X
	CMP.b #$AF
	BNE .no
	LDA.l $306007,X
	BNE .no
	PLY
	SEC
	RTS
.no
	PLY
	CLC
	RTS

; ---------------------------------------------------------------------------
; OAM edits for this frame (after the menu's own upload). C set when
; applied, clear when vblank had no room (the PPU keeps last frame's). M8
; X16.
goku_menu_oam:
	SEP #$20
	LDA !m_flags
	ORA !m_new
	AND.b #!MF_FIGURE|!MF_FACES
	BNE .work
	SEC
	RTS
.work
	REP #$30
	JSL core_vblank_lines
	CMP.w #6
	SEP #$20
	BCS .room
	RTS
.room
	JSR goku_menu_oam_same
	BCC .edit
	RTS                      ; last frame's edits stand (C set)
.edit
	; the native figure: give back entries hidden last frame when the
	; figure is gone or moved, then hide this frame's
	LDA !m_flags
	AND.b #!MF_FIGURE
	BEQ .hide
	LDA !m_new
	AND.b #!MF_FIGURE
	BEQ .restore
	LDA !m_drawn
	CMP !m_entry
	BEQ .hide
.restore
	STZ !m_hide
	LDA !m_drawn
	JSR goku_menu_oam_eight
.hide
	LDA !m_new
	AND.b #!MF_FIGURE
	BEQ .tail
	LDA.b #$FF
	STA !m_hide
	LDA !m_entry
	STA !m_drawn
	JSR goku_menu_oam_eight
.tail
	JSR goku_menu_oam_ours
	LDA !m_tile
	STA !m_ltile
	LDA !m_slots
	STA !m_lslots
	LDA.b #$00
	STA.l $002102            ; OAM address back to 0, as the menu leaves it
	STA.l $002103
	SEC
	RTS

; C set when OAM already holds this frame's edits: the same things shown as
; last frame (figure slot and entry, face slots) and the menu has not
; re-sent its buffer since (the boy's first cell, or the first face, still
; reads back as written). M8 X16.
goku_menu_oam_same:
	LDA !m_flags
	AND.b #!MF_FIGURE|!MF_FACES
	CMP !m_new
	BNE .no
	AND.b #!MF_FIGURE
	BEQ .faces
	LDA !m_tile
	CMP !m_ltile
	BNE .no
	LDA !m_drawn
	CMP !m_entry
	BNE .no
	JSR goku_menu_oam_y
	CMP.b #$F0
	BNE .no
	SEC
	BRA .done
.faces
	LDA !m_slots
	CMP !m_lslots
	BNE .no
	STA !m_tmpw
	LDX.w #$0000
.slot
	LSR !m_tmpw
	BCS .face
	INX
	CPX.w #4
	BCC .slot
	BRA .no
.face
	TXA
	CLC
	ADC.b #124
	JSR goku_menu_oam_y
	CMP.l goku_menu_face_y,X
	BNE .no
	SEC
	BRA .done
.no
	CLC
.done
	LDA.b #$00               ; (keeps C)
	STA.l $002102
	STA.l $002103
	RTS

; A8 = OAM entry: A8 = its y as the PPU holds it. Keeps X.
goku_menu_oam_y:
	ASL
	STA.l $002102
	LDA.b #$00
	STA.l $002103
	LDA.l $002138            ; x
	LDA.l $002138            ; y
	RTS

goku_menu_face_y:
	db 30, 78, 126, 174

; Entries A8..A8+7 from the menu's buffer, y moved off screen when m_hide
; is $FF. M8 X16.
goku_menu_oam_eight:
	PHA
	ASL
	STA.l $002102
	LDA.b #$00
	STA.l $002103
	PLA
	REP #$20
	AND.w #$00FF
	ASL
	ASL
	TAX
	SEP #$20
	LDY.w #8
.entry
	LDA !MENU_OAM+0,X
	STA.l $002104
	LDA !MENU_OAM+1,X
	BIT !m_hide
	BPL .y
	LDA.b #$F0
.y
	STA.l $002104
	LDA !MENU_OAM+2,X
	STA.l $002104
	LDA !MENU_OAM+3,X
	STA.l $002104
	INX
	INX
	INX
	INX
	DEY
	BNE .entry
	RTS

; Entry 120+q: Goku's figure quadrant q (16x16, m_tile + 0/2/4/6 of table
; 2) or the menu's own entry; m_hi collects the high-table bits.
macro menu_fig_quad(entry, qbit, xoff, yoff, toff, hi0, hi1, keep)
	LDA !m_new
	AND.b #!MF_FIGURE
	BEQ ?own
	LDA !m_mask
	AND.b #<qbit>
	BEQ ?own
	REP #$20
	LDA !m_x
	CLC
	ADC.w #<xoff>
	STA !m_tmpw
	SEP #$20
	STA.l $002104
	LDA !m_y
	CLC
	ADC.b #<yoff>
	STA.l $002104
	LDA !m_tile
	CLC
	ADC.b #<toff>
	STA.l $002104
	LDA !m_attr
	STA.l $002104
	LDA !m_hi
	AND.b #<keep>
	STA !m_hi
	LDA !m_tmpw+1
	AND.b #$01
	BNE ?x9
	LDA.b #<hi0>
	BRA ?bits
?x9:
	LDA.b #<hi1>
?bits:
	ORA !m_hi
	STA !m_hi
	BRA ?next
?own:
	LDA !MENU_OAM+(<entry>*4)
	STA.l $002104
	LDA !MENU_OAM+(<entry>*4)+1
	STA.l $002104
	LDA !MENU_OAM+(<entry>*4)+2
	STA.l $002104
	LDA !MENU_OAM+(<entry>*4)+3
	STA.l $002104
?next:
endmacro

; Entry 124+slot: Goku's face (16x16, tile C8 of table 2, palette 1,
; priority 3) when the slot holds his record, else the menu's own entry.
macro menu_face(entry, sbit, y, hi, keep)
	LDA !m_new
	AND.b #!MF_FACES
	BEQ ?own
	LDA !m_slots
	AND.b #<sbit>
	BEQ ?own
	LDA.b #94
	STA.l $002104
	LDA.b #<y>
	STA.l $002104
	LDA.b #$C8
	STA.l $002104
	LDA.b #$33
	STA.l $002104
	LDA !m_hi2
	AND.b #<keep>
	ORA.b #<hi>
	STA !m_hi2
	BRA ?next
?own:
	LDA !MENU_OAM+(<entry>*4)
	STA.l $002104
	LDA !MENU_OAM+(<entry>*4)+1
	STA.l $002104
	LDA !MENU_OAM+(<entry>*4)+2
	STA.l $002104
	LDA !MENU_OAM+(<entry>*4)+3
	STA.l $002104
?next:
endmacro

; Entries 120-127 and their high-table bytes ($21E/$21F). M8 X16.
goku_menu_oam_ours:
	LDA !MENU_OAM+$21E
	STA !m_hi
	LDA !MENU_OAM+$21F
	STA !m_hi2
	LDA.b #!MENU_FIG_ENTRY*2
	STA.l $002102
	LDA.b #$00
	STA.l $002103
	%menu_fig_quad(120, $01, $FFF8, 0, 0, $02, $03, $FC)
	%menu_fig_quad(121, $02, $0008, 0, 2, $08, $0C, $F3)
	%menu_fig_quad(122, $04, $FFF8, 16, 4, $20, $30, $CF)
	%menu_fig_quad(123, $08, $0008, 16, 6, $80, $C0, $3F)
	; an OBJ shows from the line below its y: rows 31+48*slot as the browser
	%menu_face(124, $01, 30, $02, $FC)
	%menu_face(125, $02, 78, $08, $F3)
	%menu_face(126, $04, 126, $20, $CF)
	%menu_face(127, $08, 174, $80, $3F)
	LDA.b #$0F               ; word $10F: bytes $21E, $21F
	STA.l $002102
	LDA.b #$01
	STA.l $002103
	LDA !m_hi
	STA.l $002104
	LDA !m_hi2
	STA.l $002104
	RTS
