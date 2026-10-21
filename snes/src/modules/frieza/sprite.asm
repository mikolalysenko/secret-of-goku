; Frieza's 48 px OBJ renderer (engine/frieza-sprite.js drawFriezaSprite).
;
; Every frame of both atlases (normal, full power) at both sizes (48 px,
; tiny 24 px) is pre-cut by snes/gen/frieza.mjs into at most eight 16x16
; pieces. Two VRAM buffers of eight cells (tiles $0C0-$0DF and $0E0-$0FF)
; hold the displayed frame and the next one: a frame not yet resident is
; uploaded into the back buffer in vblank (two DMAs) and shown from the
; next frame on, so the picture never mixes two frames. The palette goes
; to a free OBJ palette inside the game's own CGRAM transfer
; (frieza_cgram_upload), on every vblank that sends the palette.

; Forget what the buffers hold (map or mode change, fades, loads).
; Scene-scoped VRAM in core's pool: Frieza's OBJ buffers (!VRAM_SCENE_OBJ)
; and the hole tiles (!VRAM_SCENE_BG) are claimed by the frames that use
; them (fz_spr_draw, fz_holes_frame) and given back on every frame that
; does not (the scene ended, the map changed, nothing drawn), so orbit,
; ending or Vegeta scenes can take them; what was resident is uploaded
; again after the next claim.
fz_vram_settle:
	LDA !fz_spr_cnt
	AND.w #$00FF
	BNE +
	LDA !fz_spr_pend
	CMP.w #$FFFF
	BNE +
	LDA.w #!VRAM_SCENE_OBJ
	LDX.w #!FZ_VRAM_OWNER
	JSL core_vram_release
	LDA.w #$FFFF
	STA !fz_spr_res0
	STA !fz_spr_res1
+	LDA !fz_tflags
	AND.w #!FZT_HOLES
	BNE +
	LDA.w #!VRAM_SCENE_BG
	LDX.w #!FZ_VRAM_OWNER
	JSL core_vram_release
	LDA !fz_wasidle
	AND.w #!FZI_SRAM
	BEQ +
	SEP #$20
	LDA.b #0
	STA.l !fzh_tiles
	REP #$20
+	JSR fz_spr_publish
	; the vblank's early-out (!FZV_NMI): does this frame leave it any work?
	; (the colours go up in the game's palette transfer, not there)
	LDA !fz_tflags
	AND.w #!FZT_WHITE|!FZT_WPREV|!FZT_HOLES
	BNE .nmi
	LDA !fz_vista
	AND.w #$003F                      ; the vista's requests, the Balls
	BNE .nmi
	LDA !fz_spr_pend
	INC                               ; $FFFF: no frame to upload
	BNE .nmi
	RTS
.nmi
	SEP #$20
	LDA.b #!FZV_NMI
	TSB !fz_vista
	REP #$20
	RTS

; End of every busy field frame, after all drawing: the colours this frame's
; sprites and backdrop need, for the palette transfer (!FZCG_*, one word
; store, so a vblank never sees half of it; frieza_cgram_upload takes it
; with the frame's OAM).
fz_spr_publish:
	STZ !fz_t0
	LDA !fz_spr_pal
	AND.w #$00FF
	CMP.w #$0008
	BCS .second
	ORA.w #!FZCG_MAIN
	STA !fz_t0
	LDA !fz_spr_var
	AND.w #$0007
	ASL
	ASL
	ASL
	ASL
	TSB !fz_t0
.second
	LDA !fz_spr_pal2
	AND.w #$00FF
	CMP.w #$0008
	BCS .backdrop
	ORA.w #!FZCG_SECOND>>8
	XBA
	TSB !fz_t0
	; the Balls requested this frame, else the afterimages
	LDA !fz_vista
	AND.w #!FZV_BALLS                 ; (set << 4)
	XBA                               ; set << 12
	TSB !fz_t0
.backdrop
	LDA !fz_vista
	AND.w #$0001                      ; !FZV_ON (vista.asm): the Tree vista shows
	BEQ +
	LDA.w #!FZCG_SKY
	TSB !fz_t0
	BRA .store
+	LDA !fz_tflags
	AND.w #!FZT_WHITE
	BEQ .store
	LDA.l !fzv_mode
	AND.w #$00FF
	CMP.w #1                          ; the Emperor's black frame
	BNE .store
	LDA.w #!FZCG_BLACK
	TSB !fz_t0
.store
	LDA.l !core_frame
	STA.l !fz_cgframe
	LDA !fz_t0
	STA.l !fz_cgnext
	BEQ +
	STA.l !fz_cgany                   ; the chain calls the handler from now on
+	RTS

; ---------------------------------------------------------------------------
; modules_cgram_upload (core/cgram.asm), before fx_cgram_upload: the field
; NMI's palette transfer (C0:C0F0), on every vblank that sends the palette:
; every completed frame, and every vblank while a dialogue window is open
; ($1D04 bit 5), lag ones included. Module vblank callbacks run only for
; completed frames, so a borrowed OBJ palette written there showed the
; game's colours for a lag frame. JSL, M16/X16, DB = 0, D = 0; A, X, Y not
; kept; carry set when the palette went up here (FX then puts its own
; displayed palettes over it), clear for the next handler or the game.
;
; The colours follow the OAM on screen after this vblank (C0:C118 uploads
; OAM when $EC & 9). A completed frame's ($EC bit 0, set at C0:B077 after
; core's frame hook; core's ready word) shows what that frame published
; (stamped with its !core_frame; consumed here): the game's buffer, then
; Frieza's ranges over it. Another upload (bit 3 alone: a ring menu's
; icons) shows nothing of Frieza's. No upload (a lag vblank) keeps the OAM
; and so the OBJ colours that went up with it, as FX does: only the game's
; BG half goes up, then Frieza's backdrop; this while the set belongs to
; the frame on screen (an earlier handler may have held the transfers
; since), else nothing of Frieza's.
frieza_cgram_upload:
	LDA.l !fz_cgnext
	ORA.l !fz_cgshow
	BNE .work
	STA.l !fz_cgany                   ; (fz_spr_publish writes it after the set)
	CLC
	RTL
.work
	LDA $EC                           ; D = 0: the NMI request bits
	AND.w #$0009
	BEQ .lag
	LSR
	BCC .none                         ; not a completed frame's OAM
	LDA.l !core_dma_ready
	BEQ .none                         ; (not through core's frame hook)
	LDA.l !fz_cgframe
	CMP.l !core_frame
	BNE .none                         ; this frame published nothing
	LDA.l !fz_cgnext
	BRA .take
.none
	LDA.w #$0000
.take
	STA.l !fz_cgshow
	TAX
	LDA.l !core_frame
	STA.l !fz_cgshowf
	LDA.w #$0000
	STA.l !fz_cgnext                  ; consumed
	TXA
	BNE .send
	STA.l !fz_cgany                   ; nothing pending or on screen (the frame
	CLC                               ; thread waits for this vblank: no race)
	RTL
.lag
	; the OAM on screen stays, and so do the OBJ colours that went up with
	; it (Frieza's, FX's: fx_cgram_upload's rule): only the BG half and the
	; backdrop, while the set belongs to the frame on screen (core's frame
	; counter is that frame, or one more once the lagging frame reached the
	; module dispatch)
	LDA.l !core_frame
	SEC
	SBC.l !fz_cgshowf
	CMP.w #2
	BCS .stale
	LDA.l !fz_cgshow
	BNE +
	CLC
	RTL
+	PHA
	LDA.w #$0000
	LDY.w #256
	JSL core_cgram_native             ; BG colours 0-127
	JMP .backdrop
.stale
	LDA.w #$0000
	STA.l !fz_cgshow
	CLC
	RTL
.send
	PHA                               ; the set ($01,S)
	LDA.w #$0000
	LDY.w #512
	JSL core_cgram_native             ; the game's whole buffer
	LDA $01,S
	BIT.w #!FZCG_MAIN
	BEQ .second
	; Frieza: the row of frieza_palettes over OBJ palette n (32 bytes)
	AND.w #$0070
	ASL                               ; row * 32
	CLC
	ADC.w #frieza_palettes&$FFFF
	TAX
	LDA $01,S
	JSR fz_cg_obj
.second
	LDA $01,S
	BIT.w #!FZCG_SECOND
	BEQ .backdrop
	AND.w #!FZCG_SRC
	BEQ .ghost
	XBA                               ; source << 4 (1 the seven, 2 the eighth)
	ASL                               ; source * 32
	CLC
	ADC.w #(frieza_balls_palette-32)&$FFFF
	TAX
	BRA +
.ghost
	LDX.w #(frieza_palettes+96)&$FFFF ; row 3 (asar's math runs left to right)
+	LDA $01,S
	XBA
	JSR fz_cg_obj
.backdrop
	LDA $01,S
	AND.w #!FZCG_BLACK|!FZCG_SKY
	BEQ .done
	CMP.w #!FZCG_SKY
	LDA.w #$0000                      ; black
	BCC +
	LDA.w #!FRIEZA_VISTA_SKY
+	SEP #$20
	STZ $2121
	STA $2122
	XBA
	STA $2122
	REP #$20
.done
	PLA
	SEC
	RTL

; OBJ palette (A16 bits 0-2) <- 32 bytes at X16 in Frieza's data bank, one
; DMA on channel 7 (the palette transfer's). DB = 0, M16/X16.
fz_cg_obj:
	AND.w #$0007
	ASL
	ASL
	ASL
	ASL
	ORA.w #$0080                      ; CGRAM word 128 + 16n
	SEP #$20
	STA $2121
	REP #$20
	STX $4372
	LDA.w #$2200                      ; A->B, one register: CGDATA
	STA $4370
	LDA.w #32
	STA $4375
	SEP #$20
	LDA.b #frieza_palettes>>16
	STA $4374
	LDA.b #$80
	STA $420B
	REP #$20
	RTS
assert frieza_balls_palette>>16 == frieza_palettes>>16, "fz_cg_obj: the Balls' palettes in Frieza's palette bank"

fz_spr_invalidate:
	LDA.w #$FFFF
	STA !fz_spr_res0
	STA !fz_spr_res1
	STA !fz_spr_pend
	LDA !fz_wasidle
	AND.w #!FZI_SRAM
	BEQ +
	LDA.w #$FFFF
	STA.l !fzh_key                    ; the broken floor too
	SEP #$20
	LDA.b #0
	STA.l !fzh_tiles
	REP #$20
+	RTS

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
	LDA !fz_vista
	AND.b #$01                        ; !FZV_ON -> !FZV_PREV, the rest cleared
	ASL
	STA !fz_vista
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
	LDA.l !core_frame
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
	LDA.l !core_frame
	AND.w #$0007
	JSR fz_pal_chunk
.merge
	LDA.l !core_frame
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
	LDA.l !core_oam_native
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
; (!fz_spr_x, !fz_spr_y) in screen pixels, !fz_spr_fl (!FZD_*). Nothing is
; drawn while another scene holds core's !VRAM_SCENE_OBJ.
fz_spr_draw:
	PHX
	PHY
	LDA.w #!VRAM_SCENE_OBJ
	LDX.w #!FZ_VRAM_OWNER
	JSL core_vram_claim
	PLY
	PLX
	BCC +
	RTS
+	LDA !fz_tflags
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
	STX !fz_t1                        ; piece list (core_oam_meta's 4-byte pieces)
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
+	; tile of cell 0 in the displayed buffer (piece i adds 2i)
	LDA !fz_spr_buf
	AND.w #$0001
	BEQ +
	LDA.w #!FZ_TILE_BUF1
	BRA ++
+	LDA.w #!FZ_TILE_BUF0
++	ORA !fz_t2
	STA.l !core_spr_tile
	LDA !fz_spr_x
	STA.l !core_spr_x
	LDA !fz_spr_y
	STA.l !core_spr_y
	LDA.w #(!DATA_FRIEZA&$FFFF)
	CLC
	ADC !fz_t1
	STA.l !core_meta_ptr
	SEP #$20
	LDA.b #!DATA_FRIEZA>>16
	STA.l !core_meta_ptr+2
	; every piece counts for the VRAM claim (fz_vram_settle)
	LDA !fz_spr_cnt
	CLC
	ADC !fz_t0
	STA !fz_spr_cnt
	REP #$20
	; mirrored: each piece at -dx - 16 (core_oam_meta's X bit 0)
	LDA !fz_spr_fl
	AND.w #!FZD_FLIP
	BEQ +
	LDA.w #$0001
+	TAX
	LDA !fz_spr_fl
	AND.w #!FZD_BACK
	BNE .back
	LDA !fz_t0
	JSL core_oam_meta_front           ; in front while the front slots last
	RTS
.back
	LDA !fz_t0
	JSL core_oam_meta
	RTS

; ---------------------------------------------------------------------------
; Vblank (frieza_field_nmi): DB = $80, M16/X16, D unknown (not used).
; The pending frame upload (the colours went up in the palette transfer).
fz_spr_nmi:
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
