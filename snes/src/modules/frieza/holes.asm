; Broken floor on the screen: the browser repaints BG1 floor pixels of
; every broken cell (frieza.js scarLine/scarColor). Here each visible broken
; cell's four BG1 tilemap entries point at sixteen generated tiles (the
; quadrant shapes for each pair of broken neighbours) in a free BG palette;
; they are rewritten in vblank whenever the native streamer may have redrawn
; them (the camera crossed a tile, the holes changed, every 64 frames).
; Collision and map data stay untouched, as in the browser.

!FZH_TILE      = $01C0           ; BG char tiles $1C0-$1CF (word $1C00): unused on map 246
!FZH_VRAM      = $1C00
!FZH_PAL       = 6               ; BG palette 6: unused by map 246's layers
!FZH_PALADDR #= $0600+((16*!FZH_PAL+1)*2)   ; its colour 1 in the game's CGRAM buffer
!FZH_MAX       = 400             ; listed hole cells
!FZH_WMAX      = 64              ; tilemap row pairs per rebuild (32 cells)

; A new broken cell (!fz_t3, !fz_t1): list it with its broken neighbours and
; tell those neighbours (fz_hole_set calls this for every new cell).
fz_holes_add:
	LDA.l !fzh_count
	CMP.w #!FZH_MAX
	BCC +
	RTS
+	STA !fz_t7
	ASL
	CLC
	ADC !fz_t7
	TAX                               ; the new entry: count * 3
	STX !fz_t6
	LDA !fz_t7
	INC
	STA.l !fzh_count
	SEP #$20
	LDA !fz_t3
	STA.l !FZ_HLIST,X
	LDA !fz_t1
	STA.l !FZ_HLIST+1,X
	LDA.b #0
	STA.l !FZ_HLIST+2,X
	REP #$20
	; scan the older entries for the four neighbours
	LDX.w #0
.scan
	CPX !fz_t6
	BCS .done
	LDA.l !FZ_HLIST+1,X
	AND.w #$00FF
	CMP !fz_t1
	BNE .vert
	; same row: left or right of the new cell
	LDA.l !FZ_HLIST,X
	AND.w #$00FF
	INC
	CMP !fz_t3
	BNE +
	LDA.w #$0102                      ; left: it gets E, the new cell W
	JSR .link
	BRA .next
+	DEC
	DEC
	CMP !fz_t3
	BNE .next
	LDA.w #$0201                      ; right: it gets W, the new cell E
	JSR .link
	BRA .next
.vert
	STA !fz_t5                        ; its row
	LDA.l !FZ_HLIST,X
	AND.w #$00FF
	CMP !fz_t3
	BNE .next
	LDA !fz_t5
	INC
	CMP !fz_t1
	BNE +
	LDA.w #$0408                      ; above: it gets S, the new cell N
	JSR .link
	BRA .next
+	DEC
	DEC
	CMP !fz_t1
	BNE .next
	LDA.w #$0804                      ; below: it gets N, the new cell S
	JSR .link
.next
	INX
	INX
	INX
	BRA .scan
.done
	LDA.w #$FFFF                      ; the screen needs a rewrite
	STA.l !fzh_key
	RTS
; A16 = the new cell's bit << 8 | the neighbour's bit (neighbour X).
.link
	PHX
	STA !fz_m4
	SEP #$20
	LDA.l !FZ_HLIST+2,X
	ORA !fz_m4
	STA.l !FZ_HLIST+2,X
	LDX !fz_t6
	LDA.l !FZ_HLIST+2,X
	ORA !fz_m4+1
	STA.l !FZ_HLIST+2,X
	REP #$20
	PLX
	RTS

fz_holes_clear:
	LDA.w #0
	STA.l !fzh_count
	STA.l !fzh_wcount
	STA.l !fzh_wcursor
	LDA.w #$FFFF
	STA.l !fzh_key
	RTS

; Field frame: palette, tiles and the write list for the visible holes.
fz_holes_frame:
	JSR fz_arena_owned
	BCS +
	RTS
+	LDA.l !fzh_count
	BNE +
	RTS
+	SEP #$20
	LDA.b #!FZT_HOLES                 ; the vblank may upload and write
	TSB !fz_tflags
	REP #$20
	; the hole colours, cloud phases rotating every 24 frames
	LDA !fzf_age
	LDX.w #24
	JSR fz_divmod
	LDA !fz_m5
	LDX.w #3
	JSR fz_divmod                     ; A16 = phase 0-2
	STA !fz_t0
	LDX.w #0
-	TXA
	CLC
	ADC !fz_t0
	CMP.w #3
	BCC +
	SBC.w #3
+	ASL
	TAY
	PHX
	TYX
	LDA.l frieza_hole_colors,X
	PLX
	PHA
	TXA
	ASL
	TAY
	PLA
	STA.w !FZH_PALADDR,Y
	INX
	CPX.w #3
	BCC -
	LDX.w #6
-	LDA.l frieza_hole_colors,X
	STA.w !FZH_PALADDR,X
	INX
	INX
	CPX.w #14
	BCC -
	; the tiles, once per stay on the map: fz_holes_nmi uploads them before
	; any tilemap entry may point at them
	LDA.l !fzh_tiles
	AND.w #$00FF
	CMP.w #2
	BEQ +
	SEP #$20
	LDA.b #1
	STA.l !fzh_tiles
	REP #$20
	LDA.w #$FFFF
	STA.l !fzh_key                    ; rebuild once they are in
	RTS
+	; rebuild the write list when the camera crossed a tile or every 64 frames
	JSR fz_camera
	LDA !fz_cam_x
	LSR
	LSR
	LSR
	AND.w #$00FF
	STA !fz_t0
	LDA !fz_cam_y
	ASL
	ASL
	ASL
	ASL
	ASL
	AND.w #$FF00                      ; (camY >> 3) << 8
	ORA !fz_t0
	STA !fz_t0                        ; camera tile key
	LDA.w !core_frame&$FFFF
	AND.w #$003F
	BEQ .rebuild
	LDA !fz_t0
	CMP.l !fzh_key
	BNE .rebuild
	RTS
.rebuild
	LDA !fz_t0
	STA.l !fzh_key
	JMP fz_holes_build

; The write list: for each visible hole, two tilemap rows of two entries.
fz_holes_build:
	; tilemap offsets of the map: (scroll register - camera) mod 512 / 256
	LDA $5E
	AND.w #$0002
	EOR $B0
	SEC
	SBC !fz_cam_x
	AND.w #$01FF
	STA !fz_t4                        ; offX
	LDA $5F
	AND.w #$0002
	EOR $B2
	SEC
	SBC !fz_cam_y
	AND.w #$00FF
	STA !fz_t5                        ; offY
	LDA.w #0
	STA.l !fzh_wcount
	STA.l !fzh_wcursor
	LDX.w #0
	STX !fz_t6
.loop
	LDX !fz_t6
	; visible? cx*16 in (camX - 16, camX + 256), cy*16 in (camY - 16, camY + 224)
	LDA.l !FZ_HLIST,X
	AND.w #$00FF
	ASL
	ASL
	ASL
	ASL
	STA !fz_t2                        ; x
	SEC
	SBC !fz_cam_x
	CLC
	ADC.w #16
	BMI .skip
	CMP.w #256+16
	BCS .skip
	LDA.l !FZ_HLIST+1,X
	AND.w #$00FF
	ASL
	ASL
	ASL
	ASL
	STA !fz_t3                        ; y
	SEC
	SBC !fz_cam_y
	CLC
	ADC.w #16
	BMI .skip
	CMP.w #224+16
	BCS .skip
	JSR fz_holes_emit
	LDA.l !fzh_wcount
	CMP.w #!FZH_WMAX
	BCS .done
.skip
	LDA !fz_t6
	CLC
	ADC.w #3
	STA !fz_t6
	LDA.l !fzh_count
	ASL
	CLC
	ADC.l !fzh_count
	CMP !fz_t6
	BEQ .done
	BCS .loop
.done
	RTS

; Two write-list rows for the hole at map (!fz_t2, !fz_t3), entry X.
fz_holes_emit:
	LDA.l !FZ_HLIST+2,X
	AND.w #$000F
	STA !fz_t7                        ; neighbours: W 1, E 2, N 4, S 8
	; tilemap column/row of the cell's top-left tile
	LDA !fz_t2
	CLC
	ADC !fz_t4
	AND.w #$01FF
	LSR
	LSR
	LSR
	STA !fz_m0                        ; tc (even)
	LDA !fz_t3
	CLC
	ADC !fz_t5
	AND.w #$00FF
	LSR
	LSR
	LSR
	STA !fz_m1                        ; tr (even)
	; address = $5000 + (tc & 32 ? $400 : 0) + tr * 32 + (tc & 31)
	ASL
	ASL
	ASL
	ASL
	ASL
	STA !fz_m2
	LDA !fz_m0
	AND.w #$001F
	CLC
	ADC !fz_m2
	STA !fz_m2
	LDA !fz_m0
	AND.w #$0020
	BEQ +
	LDA.w #$0400
+	CLC
	ADC !fz_m2
	CLC
	ADC.w #$5000
	STA !fz_m2                        ; row 0 address
	; the four tile entries: base + q*4 + (vert << 1 | horiz)
	LDA !fz_t7
	AND.w #$0001                      ; W
	STA !fz_m3
	LDA !fz_t7
	AND.w #$0004                      ; N
	LSR
	ORA !fz_m3
	ORA.w #!FZH_TILE|(!FZH_PAL<<10)
	STA !fz_m3                        ; TL
	LDA !fz_t7
	AND.w #$0002                      ; E
	LSR
	STA !fz_m4
	LDA !fz_t7
	AND.w #$0004
	LSR
	ORA !fz_m4
	ORA.w #(!FZH_TILE+4)|(!FZH_PAL<<10)
	STA !fz_m4                        ; TR
	LDA !fz_t7
	AND.w #$0001
	STA !fz_m5
	LDA !fz_t7
	AND.w #$0008                      ; S
	LSR
	LSR
	ORA !fz_m5
	ORA.w #(!FZH_TILE+8)|(!FZH_PAL<<10)
	STA !fz_m5                        ; BL
	LDA !fz_t7
	AND.w #$0002
	LSR
	STA !fz_m6
	LDA !fz_t7
	AND.w #$0008
	LSR
	LSR
	ORA !fz_m6
	ORA.w #(!FZH_TILE+12)|(!FZH_PAL<<10)
	STA !fz_m6                        ; BR
	; append (addr, TL, TR) and (addr + 32, BL, BR)
	LDA.l !fzh_wcount
	ASL
	CLC
	ADC.l !fzh_wcount
	ASL                               ; * 6
	TAX
	LDA !fz_m2
	STA.l !FZ_HWRITE,X
	LDA !fz_m3
	STA.l !FZ_HWRITE+2,X
	LDA !fz_m4
	STA.l !FZ_HWRITE+4,X
	LDA !fz_m2
	CLC
	ADC.w #32
	STA.l !FZ_HWRITE+6,X
	LDA !fz_m5
	STA.l !FZ_HWRITE+8,X
	LDA !fz_m6
	STA.l !FZ_HWRITE+10,X
	LDA.l !fzh_wcount
	INC
	INC
	STA.l !fzh_wcount
	RTS

; Vblank (DB = $80): the tiles first, then the pending rows while time
; allows (about 0.4 scanline a row from SRAM).
fz_holes_nmi:
	LDA.l $7E0000|!fz_tflags
	AND.w #!FZT_HOLES
	BNE +
	RTS
+	LDA.l !fzh_tiles
	AND.w #$00FF
	CMP.w #2
	BEQ .rows
	CMP.w #1
	BEQ +
	RTS
+	; 512 bytes: about 3.2 scanlines of DMA, with a margin
	JSL core_vblank_lines
	CMP.w #6
	BCS +
	RTS
+	SEP #$20
	LDA.b #$80
	STA $2115
	LDA.b #$01
	STA $4370
	LDA.b #$18
	STA $4371
	LDA.b #frieza_hole_tiles>>16
	STA $4374
	REP #$20
	LDA.w #!FZH_VRAM
	STA $2116
	LDA.w #frieza_hole_tiles&$FFFF
	STA $4372
	LDA.w #512
	STA $4375
	SEP #$20
	LDA.b #$80
	STA $420B
	LDA.b #2
	STA.l !fzh_tiles
	REP #$20
	RTS
.rows
	LDA.l !fzh_wcursor
	CMP.l !fzh_wcount
	BCC +
	RTS
+	LDA.l $7E0000|$DC                 ; still on the fractured map
	CMP.l !fzs_arena_map
	BEQ +
	RTS
+	JSL core_vblank_lines
	CMP.w #4
	BCS +
	RTS
+	DEC
	DEC
	ASL                               ; (lines - 2) * 2 rows
	STA.l $7E0000|!fz_t0
	SEP #$20
	LDA.b #$80
	STA $2115
	REP #$20
	LDA.l !fzh_wcursor
	ASL
	CLC
	ADC.l !fzh_wcursor
	ASL
	TAX
.row
	LDA.l !FZ_HWRITE,X
	STA $2116
	LDA.l !FZ_HWRITE+2,X
	STA $2118
	LDA.l !FZ_HWRITE+4,X
	STA $2118
	TXA
	CLC
	ADC.w #6
	TAX
	LDA.l !fzh_wcursor
	INC
	STA.l !fzh_wcursor
	CMP.l !fzh_wcount
	BCS .done
	LDA.l $7E0000|!fz_t0
	DEC
	STA.l $7E0000|!fz_t0
	BNE .row
.done
	RTS
