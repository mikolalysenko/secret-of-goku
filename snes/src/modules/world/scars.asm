; Permanent craters on the world map (engine/world-scars.js): a strong
; aerial wave scars the landscape where it lands; towns within 0.4 x the
; crater size are destroyed (Potos-hole crater art, persistent until the
; restoration wish). Persistent list in !pw_scars: +0 word x | size<<12
; (size 0: 144 px, 1: 224 px for the full SSJ wave), +2 word y.

; world_scar_strike: A16 = world x, X16 = world y, Y16 = shot flags (bit 0
; mega). M16/X16, DB = $7E.
world_scar_strike:
	AND.w #$0FFF
	STA.w !w_scratch+0               ; x
	TXA
	AND.w #$0FFF
	STA.w !w_scratch+2               ; y
	TYA
	AND.w #!SF_MEGA
	STA.w !w_scratch+4               ; size bit
	; towns inside the blast (hypot < size * .4: 57.6 / 89.6 px)
	STZ.w !w_scratch+6               ; fresh towns found
	LDA.w #$FFFF
	STA.w !w_msg_arg
	LDY.w #$0000
.town
	PHY
	TYA
	ASL
	TAX
	LDA.l world_town_maps,X
	ASL
	TAX
	LDA.l $C67A80,X
	PHA
	AND.w #$00FF
	ASL
	ASL
	ASL
	ASL
	STA.w !w_scratch+8               ; town x
	PLA
	XBA
	AND.w #$00FF
	ASL
	ASL
	ASL
	ASL
	STA.w !w_scratch+10              ; town y
	LDX.w #3318                      ; 57.6^2
	LDA.w !w_scratch+4
	BEQ +
	LDX.w #8028                      ; 89.6^2
+	STX.w !w_scratch+12
	LDA.w !w_scratch+8
	LDX.w !w_scratch+0
	JSR world_delta
	TAY
	LDA.w !w_scratch+10
	LDX.w !w_scratch+2
	JSR world_delta
	TAX
	TYA
	JSR world_dist2                  ; C set when beyond 255 px
	BCS .nextTown
	CMP.w !w_scratch+12
	BCS .nextTown
	; destroyed: mark the town, remember the first fresh one
	LDA $01,S
	ASL
	TAX
	LDA.l world_bit,X
	STA.w !w_scratch+14
	AND.l !pw_towns
	BNE .nextTown
	LDA.l !pw_towns
	ORA.w !w_scratch+14
	STA.l !pw_towns
	LDA.w !w_msg_arg
	CMP.w #$FFFF
	BNE .nextTown
	LDA $01,S
	STA.w !w_msg_arg
.nextTown
	PLY
	INY
	CPY.w #!WORLD_TOWN_COUNT
	BCS +
	JMP .town
+
	; merge into a crater within 24 px, else add one
	LDA.l !pw_count
	AND.w #$00FF
	ASL
	ASL
	STA.w !w_scratch+12              ; end offset
	LDY.w #$0000
.scan
	CPY.w !w_scratch+12
	BCS .add
	TYX
	LDA.l !pw_scars,X
	AND.w #$0FFF
	LDX.w !w_scratch+0
	JSR world_delta
	PHA
	TYX
	LDA.l !pw_scars+2,X
	LDX.w !w_scratch+2
	JSR world_delta
	TAX
	PLA
	JSR world_dist2
	BCS .nextScar
	CMP.w #576                       ; 24^2
	BCS .nextScar
	; grow it to the larger size
	LDA.w !w_scratch+4
	BEQ .done
	TYX
	LDA.l !pw_scars,X
	ORA.w #$1000
	STA.l !pw_scars,X
	JSR world_scar_refresh
	BRA .done
.nextScar
	INY
	INY
	INY
	INY
	BRA .scan
.add
	LDA.l !pw_count
	AND.w #$00FF
	CMP.w #!WORLD_MAX_SCARS
	BCS .done                        ; list full: towns are still marked
	ASL
	ASL
	TAX
	LDA.w !w_scratch+4
	BEQ +
	LDA.w #$1000
+	ORA.w !w_scratch+0
	STA.l !pw_scars,X
	LDA.w !w_scratch+2
	STA.l !pw_scars+2,X
	SEP #$20
	LDA.l !pw_count
	INC
	STA.l !pw_count
	REP #$20
	JSR world_scar_refresh            ; X = the new entry
.done
	; King Kai's collateral remark for the first fresh town
	LDA.w !w_msg_arg
	CMP.w #$FFFF
	BEQ +
	LDA.w #!MSG_TOWN
	JSR world_message
+	RTS

; A16 = dx, X16 = dy (signed) -> A16 = dx^2 + dy^2, C clear; C set when
; either |d| > 255 (out of every radius used here). Clobbers X/Y.
world_dist2:
	PHX
	JSR .sq
	BCS .far
	PHA
	LDA $03,S
	JSR .sq
	BCS .far2
	CLC
	ADC $01,S
	BCS .far2                        ; > 65535
	PLX
	PLX
	CLC
	RTS
.far2
	PLX
.far
	PLX
	SEC
	RTS
.sq
	BPL +
	EOR.w #$FFFF
	INC
+	CMP.w #256
	BCS +
	SEP #$20
	STA.l $004202
	STA.l $004203
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	CLC
+	RTS

; ---------------------------------------------------------------------------
; Crater art in the Mode 7 world (world-scars.js stamps the art into the
; surface sample; here the craters become world-map tiles). The world map
; is 512 x 512 tiles of 8 px, RLE rows decompressed by C0:99F3 into a ring
; of 128 rows at 7F:0000 (row & 127, 512 bytes each); the Mode 7 tilemap
; streams rows and columns from that ring. Patching each row as it is
; decompressed draws the craters with the world's own streaming; a crater
; made in flight also patches the rows already in the ring and refreshes
; the part of the VRAM window it covers. Crater characters $E0-$FF (never
; used by the world map) are uploaded at every world entry. Landing checks
; read the original terrain from the ROM row (world_land_tile_hook).

; A16 = row (wrapped to 0..511). Same ring location as C0:99F3, DB kept,
; M16/X16 and D=0 on return. The fixed terrain is pre-expanded in ROM.
; MVN is interruptible, so this never borrows an active HDMA channel.
world_copy_row:
	REP #$30
	AND.w #$01FF
	PHA
	LSR : LSR : LSR : LSR : LSR : LSR
	ASL
	TAX
	PLA
	JSR (.banks,X)
	LDA.w #$0000
	TCD
	RTS
.banks
	dw world_copy_row_0, world_copy_row_1, world_copy_row_2, world_copy_row_3
	dw world_copy_row_4, world_copy_row_5, world_copy_row_6, world_copy_row_7
macro world_row_copy(src, num)
world_copy_row_<num>:
	PHA
	XBA
	ASL
	AND.w #$FE00
	TAY
	PLA
	AND.w #$003F
	XBA
	ASL
	CLC
	ADC.w #<src>&$FFFF
	TAX
	LDA.w #511
	PHB
	MVN $7F,(<src>>>16)
	PLB
	RTS
endmacro
%world_row_copy(!XDATA_WORLD_ROWS_0, 0)
%world_row_copy(!XDATA_WORLD_ROWS_1, 1)
%world_row_copy(!XDATA_WORLD_ROWS_2, 2)
%world_row_copy(!XDATA_WORLD_ROWS_3, 3)
%world_row_copy(!XDATA_WORLD_ROWS_4, 4)
%world_row_copy(!XDATA_WORLD_ROWS_5, 5)
%world_row_copy(!XDATA_WORLD_ROWS_6, 6)
%world_row_copy(!XDATA_WORLD_ROWS_7, 7)

; Crater entry X16 (byte offset in !pw_scars) -> w_scar_x0/y0 (tile column
; and row of the top-left, 0-511), w_scar_w/h (tiles), w_scar_id = layout
; address (bank $AD). M16/X16, any DB (long reads).
world_scar_geometry:
	LDA.l !pw_scars,X
	PHA
	AND.w #$1000
	BEQ .small
	LDA.w #!WORLD_CRATER_W1
	STA.l $7E0000|!w_scar_w
	LDA.w #!WORLD_CRATER_H1
	STA.l $7E0000|!w_scar_h
	LDA.w #world_crater_layout1
	BRA .size
.small
	LDA.w #!WORLD_CRATER_W0
	STA.l $7E0000|!w_scar_w
	LDA.w #!WORLD_CRATER_H0
	STA.l $7E0000|!w_scar_h
	LDA.w #world_crater_layout0
.size
	STA.l $7E0000|!w_scar_id
	PLA
	AND.w #$0FFF
	LSR
	LSR
	LSR
	PHA
	LDA.l $7E0000|!w_scar_w
	LSR
	EOR.w #$FFFF
	SEC
	ADC $01,S
	AND.w #$01FF
	STA.l $7E0000|!w_scar_x0
	PLA
	LDA.l !pw_scars+2,X
	AND.w #$0FFF
	LSR
	LSR
	LSR
	PHA
	LDA.l $7E0000|!w_scar_h
	LSR
	EOR.w #$FFFF
	SEC
	ADC $01,S
	AND.w #$01FF
	STA.l $7E0000|!w_scar_y0
	PLA
	RTS

; Patch world row A16 (0-511) in the 7F ring with every crater crossing it.
; M16/X16, DB = $7E.
world_scar_patch_row:
	AND.w #$01FF
	STA.w !w_scratch                 ; row
	LDA.l !pw_count
	AND.w #$00FF
	BNE +
	RTS
+	ASL
	ASL
	STA.w !w_scratch+2               ; end offset
	LDX.w #$0000
.crater
	STX.w !w_scratch+4
	JSR world_scar_geometry
	LDA.w !w_scratch
	SEC
	SBC.w !w_scar_y0
	AND.w #$01FF                     ; row within the crater (wrapping)
	CMP.w !w_scar_h
	BCS .next
	; layout row = layout + ty * w
	SEP #$20
	STA.l $004202
	LDA.w !w_scar_w
	STA.l $004203
	REP #$20
	LDA.w !w_scratch
	AND.w #$007F
	XBA
	ASL
	STA.w !w_scratch+6               ; ring row base: (row & 127) * 512
	LDA.l $004216
	CLC
	ADC.w !w_scar_id
	TAY
	LDA.w !w_scar_x0
	STA.w !w_scratch+8               ; column
	LDA.w !w_scar_w
	STA.w !w_scratch+10              ; cells left
	PHB
	PHK
	PLB                              ; layouts are in this bank
.cell
	SEP #$20
	LDA.w $0000,Y
	BEQ .keep
	PHA
	REP #$20
	LDA.l $7E0000|(!w_scratch+8)
	AND.w #$01FF
	ORA.l $7E0000|(!w_scratch+6)
	TAX
	SEP #$20
	PLA
	STA.l $7F0000,X
.keep
	REP #$20
	INY
	LDA.l $7E0000|(!w_scratch+8)
	INC
	STA.l $7E0000|(!w_scratch+8)
	LDA.l $7E0000|(!w_scratch+10)
	DEC
	STA.l $7E0000|(!w_scratch+10)
	BNE .cell
	PLB
.next
	LDX.w !w_scratch+4
	INX
	INX
	INX
	INX
	CPX.w !w_scratch+2
	BCS +
	JMP .crater
+
	RTS

; A crater made in flight (world_scar_strike, X16 = its entry offset):
; rows already in the ring are patched one per frame (world_scar_tick) and
; the NMI rewrites its cells in the tilemap window (world_nmi_scars).
; M16/X16, DB = $7E.
world_scar_refresh:
	LDA.w !core_mode&$FFFF
	CMP.w #!CORE_MODE_WORLD
	BEQ +
	RTS
+	JSR world_scar_geometry
	LDA.w !w_scar_x0
	STA.w !w_ref_x0
	LDA.w !w_scar_w
	STA.w !w_ref_w
	LDA.w !w_scar_y0
	STA.w !w_scar_ring
	CLC
	ADC.w !w_scar_h
	STA.w !w_scar_ring_end
	RTS

; Per world frame: once the NMI finished the previous row, patch the next
; crater row (when the ring holds it: within 60 rows of the camera) and hand
; it to the NMI. M16/X16, DB = $7E.
world_scar_tick:
	LDA.w !w_scar_ring
	CMP.w #$FFFF
	BEQ .done
	LDA.w !w_scar_pend
	BNE .done
.find
	LDA.w !w_scar_ring
	CMP.w !w_scar_ring_end
	BCC +
	LDA.w #$FFFF
	STA.w !w_scar_ring
.done
	RTS
+	INC.w !w_scar_ring
	AND.w #$01FF
	STA.w !w_scar_row
	; in the ring (and the tilemap window) when |row - camera row| <= 60
	LDA $FC
	LSR
	LSR
	LSR
	EOR.w #$FFFF
	SEC
	ADC.w !w_scar_row
	CLC
	ADC.w #60
	AND.w #$01FF
	CMP.w #121
	BCS .find                        ; streams in (patched) later
	LDA.w !w_scar_row
	JSR world_scar_patch_row
	LDA.w !w_ref_x0
	STA.w !w_scar_col
	LDA.w !w_ref_w
	STA.w !w_scar_pend
	RTS

; NMI: the crater characters (32 x 64 high bytes at VRAM word $3800) in four
; chunks on entering flight, then up to 8 cells per vblank of the row being
; refreshed (low bytes), only within the 121 columns around the camera that
; the tilemap holds. D = $4300, DB = $7E; channel in w_scratch/+2. Paused
; while the Fortress cutaway runs: the ending module's picture then uses
; that VRAM (the deck landing reloads the world).
world_nmi_scars:
	LDA.w !w_cut_age
	CMP.w #$FFFF
	BNE .done
	LDA.w !w_crater_up
	CMP.w #4
	BCS .row
	JSL core_vblank_lines
	CMP.w #6
	BCC .done
	LDA.w !w_crater_up
	XBA
	ASL                              ; chunk * 512
	PHA
	CLC
	ADC.w #world_crater_chars
	LDX.w !w_scratch
	STA $02,X
	LDA.w #world_crater_chars>>16
	STA $04,X
	LDA.w #512
	STA $05,X
	LDA.w #$1900                     ; one register: VMDATAH (Mode 7 characters)
	STA $00,X
	SEP #$20
	LDA.b #$80
	STA.l $002115
	REP #$20
	PLA                              ; one byte per word: 512 words per chunk
	CLC
	ADC.w #$3800
	STA.l $002116
	SEP #$20
	LDA.w !w_scratch+2
	STA.l $00420B
	REP #$20
	INC.w !w_crater_up
.done
	RTS
.row
	LDA.w !w_scar_pend
	BEQ .done
	JSL core_vblank_lines
	CMP.w #3
	BCC .done
	SEP #$20
	LDA.b #$00                       ; increment after the low byte
	STA.l $002115
	REP #$20
	LDA.w !w_scar_row
	AND.w #$007F
	XBA
	ASL
	STA.w !w_scratch+6               ; ring row base
	LDA.w !w_scar_row
	AND.w #$007F
	XBA
	LSR
	STA.w !w_scratch+8               ; tilemap row: (row & 127) << 7
	LDY.w #8
.cell
	; in the tilemap window: |col - camera col| <= 60
	LDA $FA
	LSR
	LSR
	LSR
	EOR.w #$FFFF
	SEC
	ADC.w !w_scar_col
	CLC
	ADC.w #60
	AND.w #$01FF
	CMP.w #121
	BCS .skip
	LDA.w !w_scar_col
	AND.w #$007F
	ORA.w !w_scratch+8
	STA.l $002116
	LDA.w !w_scar_col
	AND.w #$01FF
	ORA.w !w_scratch+6
	TAX
	SEP #$20
	LDA.l $7F0000,X
	STA.l $002118
	REP #$20
.skip
	INC.w !w_scar_col
	DEC.w !w_scar_pend
	BEQ .done
	DEY
	BNE .cell
	RTS

; ---------------------------------------------------------------------------
; Original terrain of world tile (column A16, row X16; 0-511) from the
; cartridge's RLE rows (C6:8000 pointers, bank bit table C6:7FC0; the same
; decode as world-texture.js). M16/X16, any DB. Clobbers X/Y.
world_orig_tile:
	PHB
	PHA                              ; column
	TXA
	AND.w #$01FF
	PHA                              ; row
	LSR
	LSR
	LSR
	TAX
	LDA.l $C67FC0,X
	PHA
	LDA $03,S                        ; row
	AND.w #$0007
	TAX
	PLA
-	DEX
	BMI +
	LSR
	BRA -
+	AND.w #$0001
	CLC
	ADC.w #$00C6
	SEP #$20
	PHA
	PLB                              ; the row's bank
	REP #$20
	PLA                              ; row
	ASL
	TAX
	LDA.l $C68000,X
	TAY                              ; row data
	PLX                              ; column countdown
	SEP #$20
.op
	LDA.w $0000,Y
	INY
	CMP.b #$C0
	BCS .run
	; single tile
	CPX.w #$0000
	BEQ .found
	DEX
	BRA .op
.run
	SEC
	SBC.b #$BF                       ; count
	REP #$20
	AND.w #$00FF
	STA.l $7E0000|!w_scratch+14
	TXA
	CMP.l $7E0000|!w_scratch+14
	SEP #$20
	BCC .runHit
	REP #$20
	SEC
	SBC.l $7E0000|!w_scratch+14
	TAX
	SEP #$20
	INY
	BRA .op
.runHit
	LDA.w $0000,Y
.found
	REP #$20
	AND.w #$00FF
	PLB
	RTS
