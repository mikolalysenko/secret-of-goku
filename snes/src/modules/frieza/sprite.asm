; Frieza's 48 px OBJ renderer (engine/frieza-sprite.js drawFriezaSprite).
;
; Every frame of both atlases (normal, full power) at both sizes (48 px,
; tiny 24 px) is pre-cut by snes/gen/frieza.mjs into at most eight 16x16
; pieces. Two VRAM buffers of eight cells (tiles $0C0-$0DF and $0E0-$0FF)
; hold the displayed frame and the next one: a frame not yet resident is
; uploaded into the back buffer in vblank (two DMAs) and shown from the
; next frame on, so the picture never mixes two frames. The palette goes
; to a free OBJ palette in vblank, after the game's own CGRAM upload.

; Forget what the buffers hold (map or mode change, fades, loads).
fz_spr_invalidate:
	LDA.w #$FFFF
	STA !fz_spr_res0
	STA !fz_spr_res1
	STA !fz_spr_pend
	STA.l !fzh_key                    ; the broken floor too
	SEP #$20
	LDA.b #0
	STA.l !fzh_tiles
	REP #$20
	RTS

; Start of a field frame: nothing drawn yet, no vblank work allowed until
; this frame's logic grants it (the whiteout of last frame is remembered
; so the vblank can give the colour math back).
fz_spr_begin:
	SEP #$20
	LDA.b #$FF
	STA !fz_spr_pal
	STA !fz_spr_pal2
	STZ !fz_spr_cnt
	STZ !fz_spr_var
	LDA !fz_tflags
	AND.b #!FZT_WHITE
	ASL                               ; -> !FZT_WPREV
	STA !fz_t0
	LDA !fz_tflags
	AND.b #~(!FZT_PALSCAN|!FZT_HOLES|!FZT_WHITE|!FZT_WPREV)
	ORA !fz_t0
	STA !fz_tflags
	LDA.b #0
	STA.l !fzb_req                    ; no Ball set drawn yet
	REP #$20
	RTS

; Choose free OBJ palettes: ones no native sprite of this frame uses,
; preferring 7, 4, 6, 5 (no colour math in Frieza's maps), then 3, 2, 0.
; fz_spr_palette: the main palette (!fz_spr_pal); fz_spr_palette2: the
; afterimage palette (!fz_spr_pal2). Both stay for the frame.
fz_spr_palette:
	LDA !fz_spr_pal
	AND.w #$00FF
	CMP.w #$00FF
	BEQ +
	RTS
+	JSR fz_pal_scan
	JSR fz_pal_pick
	SEP #$20
	STA !fz_spr_pal
	REP #$20
	RTS
fz_spr_palette2:
	LDA !fz_spr_pal2
	AND.w #$00FF
	CMP.w #$00FF
	BEQ +
	RTS
+	JSR fz_spr_palette                ; the main one first
	JSR fz_pal_pick
	SEP #$20
	STA !fz_spr_pal2
	REP #$20
	RTS

; Palettes the native sprites use -> !fz_spr_used (once a frame). The
; native OAM is read in eight chunks of 16 slots, one chunk a frame, each
; chunk's palettes kept in the scene SRAM block; after a frame without
; Frieza (or the first time) all eight are read at once. A palette a new
; native sprite takes is seen within 8 frames.
fz_pal_scan:
	LDA !fz_tflags
	AND.w #!FZT_PALSCAN
	BEQ +
	RTS
+	SEP #$20
	LDA.b #!FZT_PALSCAN
	TSB !fz_tflags
	REP #$20
	LDA.w !core_frame&$FFFF
	SEC
	SBC.l !fzs_palframe
	CMP.w #2
	BCC .step
	LDA.w #7
-	PHA
	JSR fz_pal_chunk
	PLA
	DEC
	BPL -
	BRA .merge
.step
	LDA.w !core_frame&$FFFF
	AND.w #$0007
	JSR fz_pal_chunk
.merge
	LDA.w !core_frame&$FFFF
	STA.l !fzs_palframe
	SEP #$20
	LDA.l !fzs_palmask
	ORA.l !fzs_palmask+1
	ORA.l !fzs_palmask+2
	ORA.l !fzs_palmask+3
	ORA.l !fzs_palmask+4
	ORA.l !fzs_palmask+5
	ORA.l !fzs_palmask+6
	ORA.l !fzs_palmask+7
	STA !fz_spr_used
	REP #$20
	RTS

; Chunk A16 (0-7): the palettes of native slots 16k..16k+15 (below the
; first module slot) -> !fzs_palmask+k. Hidden slots count too (cheaper;
; at worst a palette looks taken).
fz_pal_chunk:
	PHA
	ASL
	ASL
	ASL
	ASL
	ASL
	ASL
	TAY                               ; first byte offset (k * 64)
	CLC
	ADC.w #64
	STA !fz_m1                        ; chunk end
	LDA.w !core_oam_native&$FFFF
	CMP.w #129
	BCC +
	LDA.w #128
+	ASL
	ASL
	CMP !fz_m1
	BCS +
	STA !fz_m1                        ; the native end comes first
+	SEP #$20
	STZ !fz_m0
.loop
	CPY !fz_m1
	BCS .done
	LDA.w $0803,Y                     ; attributes: palette in bits 1-3
	AND.b #$0E
	TAX
	LDA.l fz_pal_bit2,X
	TSB !fz_m0
	INY
	INY
	INY
	INY
	BRA .loop
.done
	REP #$20
	PLX
	SEP #$20
	LDA !fz_m0
	STA.l !fzs_palmask,X
	REP #$20
	RTS
fz_pal_bit2:                          ; (attributes & $0E) -> palette bit
	db $01,$00,$02,$00,$04,$00,$08,$00,$10,$00,$20,$00,$40,$00,$80,$00

; A16 = the first free palette in the preferred order (marked used).
fz_pal_pick:
	LDX.w #0
-	LDA.l fz_pal_order,X
	AND.w #$00FF
	PHX
	TAX
	LDA.l fz_pal_bit,X
	PLX
	AND !fz_spr_used
	AND.w #$00FF
	BEQ .found
	INX
	CPX.w #7
	BCC -
	LDX.w #0                          ; all taken: share palette 7
.found
	LDA.l fz_pal_order,X
	AND.w #$00FF
	PHA
	TAX
	LDA.l fz_pal_bit,X
	SEP #$20
	TSB !fz_spr_used
	REP #$20
	PLA
	RTS
fz_pal_order:
	db 7,4,6,5,3,2,0,0
fz_pal_bit:
	db $01,$02,$04,$08,$10,$20,$40,$80

; Draw Frieza: !fz_spr_id (atlas<<4 | tiny<<3 | frame), anchor at
; (!fz_spr_x, !fz_spr_y) in screen pixels, !fz_spr_fl (!FZD_*).
fz_spr_draw:
	LDA !fz_tflags
	AND.w #!FZT_VRAM_OK
	BNE +
	JSR fz_spr_invalidate
	SEP #$20
	LDA.b #!FZT_VRAM_OK
	TSB !fz_tflags
	REP #$20
+	; which buffer holds the frame?
	LDA !fz_spr_buf
	AND.w #$0001
	ASL
	TAX
	LDA !fz_spr_res0,X
	CMP !fz_spr_id
	BEQ .have
	TXA
	EOR.w #$0002
	TAX
	LDA !fz_spr_res0,X
	CMP !fz_spr_id
	BNE .missing
	TXA
	LSR
	SEP #$20
	STA !fz_spr_buf
	REP #$20
.have
	LDA !fz_spr_id
	BRA .emit
.missing
	; upload into the back buffer this vblank; meanwhile show what the
	; displayed buffer holds (a one-frame pose lag), if anything
	LDA !fz_spr_id
	STA !fz_spr_pend
	LDA !fz_spr_buf
	AND.w #$0001
	ASL
	TAX
	LDA !fz_spr_res0,X
	CMP.w #$FFFF
	BNE .emit
	RTS
.emit
	ASL
	TAX
	LDA.l frieza_frame_table,X
	TAX                               ; descriptor (bank !DATA_FRIEZA)
	LDA.l !DATA_FRIEZA+2,X
	AND.w #$00FF
	STA !fz_t0                        ; pieces
	INX
	INX
	INX
	STX !fz_t1                        ; piece list
	LDA !fz_spr_fl
	AND.w #!FZD_GHOST
	BEQ +
	JSR fz_spr_palette2
	LDA !fz_spr_pal2
	BRA ++
+	JSR fz_spr_palette
	LDA !fz_spr_pal
++	; attribute word: palette, priority 3, h-flip
	AND.w #$0007
	XBA
	ASL
	ORA.w #$3000
	STA !fz_t2
	LDA !fz_spr_fl
	AND.w #!FZD_FLIP
	BEQ +
	LDA.w #$4000
	TSB !fz_t2
+	; tile of cell 0 in the displayed buffer
	LDA !fz_spr_buf
	AND.w #$0001
	BEQ +
	LDA.w #!FZ_TILE_BUF1
	BRA ++
+	LDA.w #!FZ_TILE_BUF0
++	ORA !fz_t2
	STA !fz_t2                        ; tile | attr of piece 0
.piece
	LDX !fz_t1
	; dx (signed)
	LDA.l !DATA_FRIEZA,X
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	STA !fz_t3
	LDA !fz_spr_fl
	AND.w #!FZD_FLIP
	BEQ +
	LDA !fz_t3                        ; mirrored: -dx - 16
	EOR.w #$FFFF
	SEC
	SBC.w #15
	STA !fz_t3
+	LDA !fz_t3
	CLC
	ADC !fz_spr_x
	STA.w !core_spr_x&$FFFF
	LDA.l !DATA_FRIEZA+1,X
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	CLC
	ADC !fz_spr_y
	STA.w !core_spr_y&$FFFF
	LDA !fz_t2
	STA.w !core_spr_tile&$FFFF
	STZ.w !core_spr_size&$FFFF
	LDA !fz_spr_fl
	AND.w #!FZD_BACK
	BNE .back
	JSL core_oam_add_front
	BCC .added
.back
	JSL core_oam_add
.added
	SEP #$20
	INC !fz_spr_cnt
	REP #$20
	INC !fz_t1
	INC !fz_t1
	INC !fz_t2                        ; next cell: tile + 2
	INC !fz_t2
	DEC !fz_t0
	BNE .piece
	RTS

; ---------------------------------------------------------------------------
; Vblank (frieza_field_nmi): DB = $80, M16/X16, D unknown (not used).
; Palette of this frame's sprites, then the pending frame upload.
fz_spr_nmi:
	LDA.l $7E0000|!fz_spr_pal
	AND.w #$00FF
	CMP.w #$0008
	BCS .upload
	ASL
	ASL
	ASL
	ASL
	ORA.w #$0081                      ; CGRAM 128 + 16 * palette + 1
	SEP #$20
	STA $2121
	REP #$20
	LDA.l $7E0000|!fz_spr_var
	AND.w #$0003
	XBA
	LSR
	LSR
	LSR                               ; variant * 32
	TAX
	LDY.w #15
.color
	LDA.l frieza_palettes+2,X
	SEP #$20
	STA $2122
	XBA
	STA $2122
	REP #$20
	INX
	INX
	DEY
	BNE .color
.upload
	; the afterimage palette (ghost colour)
	LDA.l $7E0000|!fz_spr_pal2
	AND.w #$00FF
	CMP.w #$0008
	BCS .frame
	ASL
	ASL
	ASL
	ASL
	ORA.w #$0081
	SEP #$20
	STA $2121
	REP #$20
	LDA.l !fzb_palsrc
	AND.w #$00FF
	BEQ .ghostpal
	DEC
	XBA
	LSR
	LSR
	LSR                               ; (source - 1) * 32
	TAX
	LDY.w #15
.balls
	LDA.l frieza_balls_palette+2,X
	SEP #$20
	STA $2122
	XBA
	STA $2122
	REP #$20
	INX
	INX
	DEY
	BNE .balls
	BRA .frame
.ghostpal
	LDX.w #3*32
	LDY.w #15
.ghost
	LDA.l frieza_palettes+2,X
	SEP #$20
	STA $2122
	XBA
	STA $2122
	REP #$20
	INX
	INX
	DEY
	BNE .ghost
.frame
	LDA.l $7E0000|!fz_spr_pend
	CMP.w #$FFFF
	BNE +
	RTS
+	ASL
	TAX
	LDA.l frieza_frame_table,X
	TAX
	LDA.l !DATA_FRIEZA+2,X
	AND.w #$00FF
	BNE +
	JMP .drop
+	XBA
	LSR
	LSR                               ; pieces * 64 = bytes per half
	STA.l $7E0000|!fz_t7
	LDA.l !DATA_FRIEZA,X
	STA.l $7E0000|!fz_t6              ; art offset
	; lines: two halves at 160 bytes a line, plus a margin
	LDA.l $7E0000|!fz_t7
	LSR
	LSR
	LSR
	LSR                               ; pieces * 4
	JSR fz_div5_nmi                   ; pieces * 0.8
	CLC
	ADC.w #2
	STA.l $7E0000|!fz_t5
	JSL core_vblank_lines
	CMP.l $7E0000|!fz_t5
	BCS +
	RTS
+	; back buffer
	LDA.l $7E0000|!fz_spr_buf
	AND.w #$0001
	EOR.w #$0001
	STA.l $7E0000|!fz_t4
	BEQ +
	LDA.w #!FZ_VRAM_BUF1
	BRA ++
+	LDA.w #!FZ_VRAM_BUF0
++	STA.l $7E0000|!fz_t3
	SEP #$20
	LDA.b #$80
	STA $2115
	LDA.b #$01
	STA $4370
	LDA.b #$18
	STA $4371
	LDA.b #!FRIEZA_ART_BANK
	STA $4374
	REP #$20
	; top halves
	LDA.l $7E0000|!fz_t3
	STA $2116
	LDA.l $7E0000|!fz_t6
	CLC
	ADC.w #frieza_art&$FFFF
	STA $4372
	LDA.l $7E0000|!fz_t7
	STA $4375
	SEP #$20
	LDA.b #$80
	STA $420B
	REP #$20
	; bottom halves (+16 tiles); the source continues where it stopped
	LDA.l $7E0000|!fz_t3
	CLC
	ADC.w #$0100
	STA $2116
	LDA.l $7E0000|!fz_t7
	STA $4375
	SEP #$20
	LDA.b #$80
	STA $420B
	REP #$20
	; the back buffer now holds the frame
	LDA.l $7E0000|!fz_t4
	ASL
	TAX
	LDA.l $7E0000|!fz_spr_pend
	STA.l $7E0000|!fz_spr_res0,X
.drop
	LDA.w #$FFFF
	STA.l $7E0000|!fz_spr_pend
	RTS

; A16 / 5 (small values; no divider registers in NMI).
fz_div5_nmi:
	LDX.w #0
-	CMP.w #5
	BCC +
	SBC.w #5
	INX
	BRA -
+	TXA
	RTS
