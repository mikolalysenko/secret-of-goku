; Public API for other modules (combat, flight, story, scenes). See
; docs/agents/snes-port/goku.md. Entry points are JSL-callable from any bank
; with any DB; they preserve DB, D and the caller's M/X unless noted.
; Request fields (goku_form, goku_act*, goku_mode*, goku_lift, goku_ctl,
; goku_cell_req) may also be written directly with DB = $7E.

; One-time state set-up (zeroed WRAM means "cell 0 in VRAM" otherwise).
goku_ensure_init:
	PHP
	SEP #$20
	LDA.l $7E0000|!goku_inited
	BNE .done
	LDA.b #$01
	STA.l $7E0000|!goku_inited
	REP #$20
	LDA.w #!GOKU_NONE
	STA.l $7E0000|!vram_cell
	STA.l $7E0000|!up_cell
	LDA.w #$0000
	STA.l $7E0000|!hud_form
	STA.l !pal_air_valid
.done
	PLP
	RTS

; goku_api_set_form: A (low byte) = 0 base, 1 Super Saiyan. Takes effect on
; the next rendered frame (cells, palette, HUD portrait). Play the
; transformation itself with goku_act = GOKU_K_TRANSFORM / GOKU_K_REVERT.
goku_api_set_form:
	PHP
	SEP #$20
	AND.b #$01
	STA.l $7E0000|!goku_form
	PLP
	RTL

; goku_api_active: C set while Goku stands in for the boy this frame.
goku_api_active:
	PHP
	SEP #$20
	LDA.l $7E0000|!replacing
	BEQ .no
	PLP
	SEC
	RTL
.no
	PLP
	CLC
	RTL

; goku_api_cell: A = sheet (0 base, 1 Super Saiyan, 2 SSJ lead jab),
; X = column, Y = row -> A16 = cell id, $FFFF when the sheet has no art there.
; Exit M16 X16.
goku_api_cell:
	REP #$30
	AND.w #$0003
	ASL
	PHX
	TAX
	LDA.l goku_sheet_base,X
	STA.l $7E0000|!t_a
	PLA
	ASL
	ASL
	CLC
	ADC.l $7E0000|!t_a
	STA.l $7E0000|!t_a
	TYA
	AND.w #$0003
	CLC
	ADC.l $7E0000|!t_a
	ASL
	TAX
	LDA.l goku_cell_index,X
	RTL

; Fetch a packed socket without a per-column search. The field's byte
; pose fields and the scripted API's word fields share the same table.
macro goku_socket_lookup(column, row, sheet, byte_fields)
	LDA <row>
	AND.w #3
	ASL
	STA !t_a
	LDA <column>
if <byte_fields>
	AND.w #$00FF
endif
	CMP.w #32
	BCS .none
	ASL
	ASL
	ASL
	ORA !t_a
	TAX
	LDA <sheet>
if <byte_fields>
	AND.w #$00FF
endif
	BEQ ?base
	CMP.w #1
	BNE .none
	LDA.l goku_socket_xy+256,X
	BRA ?coords
?base:
	LDA.l goku_socket_xy,X
?coords:
	CMP.w #$FFFF
	BEQ .none
	PHA
	AND.w #$00FF
	STA !t_a
	PLA
	XBA
	AND.w #$00FF
	STA !t_b
endmacro

; goku_api_hand: hand socket of the displayed pose, in screen pixels.
; Out: C set and A16 = x, X16 = y when the current cell has an authored
; socket (charge, beam and blast poses); C clear otherwise. Exit M16 X16.
goku_api_hand:
	PHB
	PEA $7E7E
	PLB
	PLB
	REP #$30
if not(defined("GOKU_SOCKET_SLOW"))
	%goku_socket_lookup(!p_col, !p_rowout, !p_sheet, 1)
else
	LDA !p_col
	AND.w #$00FF
	STA !t_c
	LDA !p_rowout
	STA !t_d
	LDA !p_sheet
	AND.w #$00FF
	JSR goku_socket_find
	BCC .none
endif
	; cell origin: (anchor x - 16, feet - 31 - lift), feet = $E022 - $E045
	LDA $E020
	SEC
	SBC.w #16
	CLC
	ADC !t_a
	PHA
	LDA $E022
	SEC
	SBC $E045
	SEC
	SBC !p_lift
	SEC
	SBC.w #31
	CLC
	ADC !t_b
	TAX
	PLA
	PLB
	SEC
	RTL
.none
	PLB
	CLC
	RTL

; ---------------------------------------------------------------------------
; goku_api_scripted: show Goku's cell A16 (from goku_api_cell) with its
; anchor (the cell's centre column, feet line) at screen X16, Y16 for this
; frame, in front of every native sprite with OBJ priority 3, as the
; browser's scene renderers draw him (frieza.js introHero, sprite-layer.js
; plan anchor 0). Actor 0's own body and shadow sprites are hidden for this
; frame; its game state is never touched. Call from a field-frame callback
; every frame the scene shows him, before goku_frame in the dispatch: then
; the cell's palette (base, Super Saiyan, transition) and the browser's
; unflashed colours during a native flash apply the same frame. Stop calling
; to release (the next frame is the ordinary Goku again). C set when drawn
; (Goku stands in and the cell exists), C clear otherwise. Any M/X (A, X and
; Y are read as 16 bits); exit M16 X16; keeps DB and D.
; goku_api_scripted_prio: the same with the OBJ priority (0-3) in the low
; byte of !core_scratch.
goku_api_scripted:
	PHP
	REP #$30
	PHA
	LDA.w #$0003
	STA.l !core_scratch
	PLA
	PLP
goku_api_scripted_prio:
	PHB
	PHD
	PHP
	REP #$30
	PHA
	PEA $7E7E
	PLB
	PLB
	LDA.w #$0000
	TCD
	PLA
	STA !t_b                 ; cell
	STX !t_c                 ; anchor x
	STY !t_d                 ; anchor y
	JSR goku_ensure_init
	JSR goku_check_on
	BCC .no
	REP #$30
	LDA !t_b
	CMP.w #!GOKU_CELL_COUNT
	BCS .no
	; the cell into the hero OBJ tiles this vblank; a field cell the body
	; requested earlier in the frame is cancelled
	TAX
	SEP #$20
	LDA.l goku_cell_pal,X
	STA !cur_pal
	LDA !vram_small
	BNE .upload
	REP #$20
	TXA
	CMP !vram_cell
	BNE .upload
	LDA.w #!GOKU_NONE
	STA !up_cell
	BRA .hide
.upload
	REP #$20
	STX !up_cell
	SEP #$20
	STZ !up_small
.hide
	JSR goku_scripted_hide
	JSR goku_scripted_draw
	SEP #$20
	LDA.b #$01
	STA !scr_shown           ; goku_frame keeps the cell unflashed
	PLP
	PLD
	PLB
	REP #$30
	SEC
	RTL
.no
	PLP
	PLD
	PLB
	REP #$30
	CLC
	RTL

; Hide actor 0's sprites appended this frame: the body slots
; [rec_body0, rec_body1) and the shadow slot, when the records are this
; frame's (the slots stay put until the core commits front sprites at the
; end of the frame). DB = $7E.
goku_scripted_hide:
	SEP #$20
	LDA.l !core_frame
	CMP !rec_stamp
	BNE .done
	LDA !rec_body0
	STA !t_a
.body
	SEP #$20
	LDA !t_a
	CMP !rec_body1
	BCS .shadow
	REP #$20
	AND.w #$00FF
	JSL core_oam_hide
	SEP #$20
	INC !t_a
	BRA .body
.shadow
	LDA !rec_shadow
	BMI .done
	REP #$20
	AND.w #$00FF
	JSL core_oam_hide
.done
	REP #$30
	RTS

; Goku's cell t_b as up to four 16x16 OBJ (empty quadrants skipped) from the
; hero tiles C0-C7/D0-D7 of name table 2, cell top-left at (x - 16,
; y - 31) for the anchor (t_c, t_d), Goku's palette slot, priority from
; !core_scratch; in front of the native sprites (behind them when the
; core's 16 front slots are taken). DB = $7E.
macro goku_scripted_quad(qbit, dx, dy, tile)
	LDA !t_a
	AND.w #<qbit>
	BEQ ?skip
	LDA !t_c
	CLC
	ADC.w #<dx>
	STA.l !core_spr_x
	LDA !t_d
	CLC
	ADC.w #<dy>
	STA.l !core_spr_y
	LDA !e_attr
	ORA.w #<tile>
	STA.l !core_spr_tile
	LDA.w #$0000
	STA.l !core_spr_size
	JSL core_oam_add_front
	BCC ?skip
	JSL core_oam_add
?skip:
endmacro

goku_scripted_draw:
	REP #$30
	LDX !t_b
	LDA.l goku_cell_mask,X
	AND.w #$000F
	STA !t_a
	; OAM bytes 2-3: tile $1C0+ (name table 2), palette, priority: the
	; attribute byte vhoopppN = prio << 4 | pal << 1 | 1
	LDA !pal_slot
	AND.w #$0007
	BNE .slot
	LDA.w #$0001
.slot
	ASL
	STA !e_attr
	LDA.l !core_scratch
	AND.w #$0003
	ASL
	ASL
	ASL
	ASL
	ORA !e_attr
	ORA.w #$0001
	XBA
	STA !e_attr
	%goku_scripted_quad($01, $FFF0, $FFE1, $C0)
	%goku_scripted_quad($02, $0000, $FFE1, $C2)
	%goku_scripted_quad($04, $FFF0, $FFF1, $C4)
	%goku_scripted_quad($08, $0000, $FFF1, $C6)
	REP #$30
	RTS

; ---------------------------------------------------------------------------
; goku_api_socket: the hand socket of a pose, relative to its cell's anchor
; (centre column, feet line). A = sheet (0 base, 1 Super Saiyan), X =
; column, Y = row. Out: C set and A16 = dx, X16 = dy (signed) when the pose
; has an authored socket (charge, beam, blast columns), C clear otherwise.
; For scenes that place a cell themselves (goku_api_scripted): hand = anchor
; + (dx, dy). Exit M16 X16; keeps DB.
goku_api_socket:
	PHB
	PEA $7E7E
	PLB
	PLB
	REP #$30
	STX !t_c                 ; column
	STY !t_d                 ; row
	AND.w #$0003
	JSR goku_socket_find
	BCC .none
	LDA !t_a
	SEC
	SBC.w #16
	PHA
	LDA !t_b
	SEC
	SBC.w #31
	TAX
	PLA
	PLB
	SEC
	RTL
.none
	PLB
	CLC
	RTL

; A16 = sheet, t_c = column, t_d = row -> C set, t_a/t_b = socket within
; the 32x32 cell. M16 X16, DB = $7E.
goku_socket_find:
if not(defined("GOKU_SOCKET_SLOW"))
	STA !t_b
	%goku_socket_lookup(!t_c, !t_d, !t_b, 0)
else
	CMP.w #2
	BCS .none                ; lead-jab sheet: no sockets
	CMP.w #1
	BEQ .ssj
	LDX.w #goku_sockets_goku&$FFFF
	BRA .scan
.ssj
	LDX.w #goku_sockets_ssj&$FFFF
.scan
	; entries: column, then (x,y) for rows 0-3; $FF ends the table
	LDA.l !DATA_GOKU,X
	AND.w #$00FF
	CMP.w #$00FF
	BEQ .none
	CMP !t_c
	BEQ .found
	TXA
	CLC
	ADC.w #9
	TAX
	BRA .scan
.found
	LDA !t_d
	AND.w #$0003
	ASL
	STA !t_a
	TXA
	SEC
	ADC !t_a
	TAX
	LDA.l !DATA_GOKU,X
	AND.w #$00FF
	STA !t_a
	LDA.l !DATA_GOKU+1,X
	AND.w #$00FF
	STA !t_b
endif
	SEC
	RTS
.none
	CLC
	RTS

; ---------------------------------------------------------------------------
; Test builds (-DGOKU_TRACE): a field-frame caller for goku_api_scripted, fed
; by the tests through 7E:7F40 (word cell + 1, 0 = off; word x; word y; byte
; priority; result byte C at +8), and goku_api_socket (+10 sheet, +11
; column, +12 row, +13 = 1 to ask; out +14 dx, +16 dy, +18 C). Called first
; in goku_frame.
if defined("GOKU_TRACE")
!GOKU_TEST_SCR = $7E7F40
goku_test_scripted:
	PHP
	SEP #$20
	LDA.l !GOKU_TEST_SCR+13
	BEQ .scripted
	LDA.b #$00
	STA.l !GOKU_TEST_SCR+13
	REP #$30
	LDA.l !GOKU_TEST_SCR+11
	AND.w #$00FF
	TAX
	LDA.l !GOKU_TEST_SCR+12
	AND.w #$00FF
	TAY
	LDA.l !GOKU_TEST_SCR+10
	AND.w #$00FF
	JSL goku_api_socket
	STA.l !GOKU_TEST_SCR+14
	TXA
	STA.l !GOKU_TEST_SCR+16
	SEP #$20
	LDA.b #$00
	ROL
	STA.l !GOKU_TEST_SCR+18
.scripted
	REP #$30
	LDA.l !GOKU_TEST_SCR
	BEQ .done
	DEC
	PHA
	SEP #$20
	LDA.l !GOKU_TEST_SCR+6
	STA.l !core_scratch
	REP #$20
	LDA.l !GOKU_TEST_SCR+2
	TAX
	LDA.l !GOKU_TEST_SCR+4
	TAY
	PLA
	JSL goku_api_scripted_prio
	SEP #$20
	LDA.b #$00
	ROL
	STA.l !GOKU_TEST_SCR+8
.done
	PLP
	RTS
endif
