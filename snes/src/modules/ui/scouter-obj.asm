; Late field renderer. FX has already spent its cells and vblank budget.
; Locals on the stack; no additional persistent WRAM/SRAM allocation.
!sd_actor = $00
!sd_record = $02
!sd_x = $04
!sd_y = $06
!sd_fmt = $08
!sd_n = $0A
!sd_part = $0C
!sd_tiles = $0E                    ; four tile words
!sd_ready = $16
!sd_cut = $18
!sd_sx = $1A
!sd_sy = $1C
!sd_key = $1E
!sd_entry = $20
!sd_dst = $22
!sd_src = $24
!sd_bank = $26
!sd_uploads = $28
!sd_flags = $2A
!sd_visible = $2C
!sd_wait = $2E
!sd_allow = $30
!sd_corner = $32
!sd_pass = $34
!sd_tile = $36
!sd_hist = $38                   ; 32 bytes: conservative 8-line half-sliver counts
!sd_size = $58
macro sc_far(target)
	PHD : PEA $0000 : PLD
	JSL <target>
	PLD
endmacro

ui_sc_draw_frame:
	LDA.w !ui_sc&$FFFF
	BIT.w #!UISC_ACTIVE
	BNE +
	RTL
+	; Retire old-map uploads even when this frame is too late to draw.
	LDA.w $00DC : CMP.w !sc_map&$FFFF : BEQ +
	JSR ui_sc_leave
	JSR ui_sc_start
+	LDA.w #!UISC_DRAW
	TRB.w !ui_sc&$FFFF
	STZ.w !sc_numbers&$FFFF
	STZ.w !sc_corners&$FFFF
	LDA.w !ui_block&$FFFF
	BNE .yield
	LDA.w $00EC : AND.w #$40FE : BNE .yield
	JSL modules_field_current
	BCC .yield
	JSR ui_sc_vline
	CMP.w #160
	BCC +
.yield
	LDA.w #!UISC_DRAW
	TRB.w !ui_sc&$FFFF
	RTL
+	JSR ui_sc_prepare
.prepared
	LDA.w !ui_sc&$FFFF
	BIT.w #!UISC_DRAW
	BNE +
	RTL
+	JSR ui_sc_vline
	CMP.w #176
	BCC +
	JMP .yield
+	PHD
	TSC : SEC : SBC.w #!sd_size : TCS : INC : TCD
	STZ !sd_uploads
	STZ !sd_pass
	STZ.w !ui_front_n&$FFFF
	LDA.l !core_dma_count
	BNE +
	STZ.w !sc_pending&$FFFF
+	LDA.w !sc_pending&$FFFF
	STA !sd_wait
	LDA.l !fx_frame
	CMP.w !sc_lastfx&$FFFF
	BNE +
	INC
	STA.l !fx_frame
+	STA.w !sc_lastfx&$FFFF
	%sc_far(fx_overlay_begin)        ; A = cache entries the game claims
	AND.w !sc_pending&$FFFF          ; a deferred upload would land after its stream
	BEQ +
	JSR ui_sc_cancel_uploads
+	LDA.w #!UISC_RESIDENT : TSB.w !ui_sc&$FFFF
	JSR ui_sc_limits
	JSR ui_sc_palette
	LDA.w !sc_pal&$FFFF
	BNE +
	JMP .done
+	STZ !sd_actor
.actor
	LDA !sd_actor : XBA : AND.w #$001E : TAY
	STY !sd_record
	LDA.w !sc_age&$FFFF,Y
	CMP.w #$FFFF
	BNE +
	JMP .next
+	PHA
	LDX !sd_actor
	CPX.w #$1800
	BEQ .virtual
	LDA.w $E020,X : STA !sd_x
	LDA.w $E022,X : STA !sd_y
	BRA .position
.virtual
	JSR ui_sc_actor
	LDA.w !ui_tmp0&$FFFF : STA !sd_x
	LDA.w !ui_tmp1&$FFFF : STA !sd_y
.position
	PLA
	AND.w #$7FFF
	LDX.w #1
	CMP.w #24
	BCS +
	AND.w #4
	BNE +
	LDX.w #0
+	STX !sd_visible
	LDA !sd_pass
	BNE .corners
	JSL modules_field_current
	BCS +
	JMP .done
+
	JSR ui_sc_vline
	CMP.w #192
	BCC +
	JMP .done
+
	LDY !sd_record
	LDA.w !sc_fmt&$FFFF,Y
	LDX !sd_actor
	BNE +
	PHA
	LDA.w !sc_stage&$FFFF
	CMP.w #$FFFF
	BEQ .newStage
	PLA
	LDA.w !sc_stage&$FFFF
	BRA +
.newStage
	PLA
	STA.w !sc_stage&$FFFF
+	STA !sd_fmt
	LDA.w #1 : STA !sd_allow
	JSR ui_sc_number
	LDA !sd_actor
	BNE .next
	LDA !sd_ready
	BEQ .oldGoku
	LDA !sd_fmt
	STA.w !sc_shown&$FFFF
	LDA.w #$FFFF : STA.w !sc_stage&$FFFF
	BRA .next
.oldGoku
	LDA.w !sc_shown&$FFFF
	CMP.w #$FFFF
	BEQ .next
	STA !sd_fmt
	STZ !sd_allow
	JSR ui_sc_number
	BRA .next
.corners
	JSL modules_field_current
	BCS +
	JMP .done
+
	JSR ui_sc_vline
	CMP.w #192
	BCC +
	JMP .done
+
	JSR ui_sc_corners
	LDX !sd_record
	LDA.l ui_sc_actor_bits,X
	ORA.w !sc_corners&$FFFF
	STA.w !sc_corners&$FFFF
.next
	LDA !sd_actor
	CLC : ADC.w #$0200 : STA !sd_actor
	CMP.w #$1A00
	BCS +
	JMP .actor
+	LDA !sd_pass
	BNE .done
	INC !sd_pass
	STZ !sd_actor
	JMP .actor
.done
	TSC : CLC : ADC.w #!sd_size : TCS
	PLD
	RTL

; Resolve the whole number before emitting any of it. Cells are immutable
; and cached by glyph run, so unchanged readings require no rendering/DMA.
ui_sc_number:
	LDA.w #1 : STA !sd_ready
	LDX !sd_fmt
	CPX.w #$FFFF
	BNE +
	JMP .hidden
+
	LDA.l !XDATA_UI_SC_FORMATS,X
	AND.w #$00FF
	STA !sd_cut
	LDA !sd_x
	SEC : SBC !sd_cut : DEC : STA !sd_sx
	LDA !sd_y
	SEC : SBC.w #41 : STA !sd_sy
	STZ !sd_cut
	LDA.w !ui_vis&$FFFF
	BEQ .layout
	LDA.w #72
	SEC : SBC !sd_sy
	BMI .layout
	CMP.w #7
	BCS .hidden
	STA !sd_cut
.layout
	LDA.l !XDATA_UI_SC_FORMATS+1,X
	AND.w #$00FF
	STA !sd_n
	STZ !sd_part
.resolve
	LDA !sd_part
	ASL : CLC : ADC !sd_fmt : TAX
	LDA.l !XDATA_UI_SC_FORMATS+2,X
	CLC : ADC !sd_cut
	JSR ui_sc_cell
	BCS .missing
	LDA !sd_part : ASL : TAX
	LDA !sd_tile
	STA !sd_tiles,X
	BRA .resolved
.missing
	STZ !sd_ready
.resolved
	INC !sd_part
	LDA !sd_part
	CMP !sd_n
	BCC .resolve
	LDA !sd_ready
	AND !sd_visible
	BEQ .return
	LDX !sd_record
	LDA.l ui_sc_actor_bits,X
	ORA.w !sc_numbers&$FFFF
	STA.w !sc_numbers&$FFFF
	STZ !sd_part
.draw
	LDA !sd_part : ASL : TAX
	LDA !sd_tiles,X
	JSR ui_sc_sprite
	LDA !sd_sx : CLC : ADC.w #12 : STA !sd_sx
	INC !sd_part
	LDA !sd_part : CMP !sd_n
	BCC .draw
.return
	RTS
.hidden
	; No visible pixels, but the layout is not yet a committed Goku image.
	STZ !sd_ready
	RTS

; Cell key A -> tile sd_tile (and A), C clear once VRAM contains it.
; At most one new cell / 128 bytes per frame, after other queue clients
; and only when FX has no cell upload pending.
ui_sc_cell:
	STA !sd_key
	AND.w #!FX_HASH_SIZE-1
	TAX
	LDA.l !fx_hash,X
	AND.w #$00FF
	CMP.w #30
	BCS .lookup
	TAX
	LDA.l !fx_ccell,X
	EOR !sd_key
	CMP.w #$8000
	BNE .lookup
	LDA.l !fx_frame
	STA.l !fx_cused,X
	LDA.l fx_entry_tile,X
	BRA .resident
.lookup
	LDX.w #0
	LDA !sd_allow
	BEQ .get
	LDA !sd_wait
	BNE .get
	LDA.l !fx_cpend
	BNE .get
	LDA !sd_uploads
	CMP.w #1
	BCS .get
	LDA.l !core_dma_count
	CMP.w #7
	BCS .get
	LDA.l !core_dma_bytes
	CMP.w #!CORE_DMA_BUDGET-127
	BCS .get
	LDX.w #1
.get
	LDA !sd_key
	ORA.w #$8000
	%sc_far(fx_overlay_cell)
	BCC +
	JMP .fail
+
	STX !sd_entry
	CPY.w #0
	BNE .upload
.resident
	PHA
	LDA.l fx_entry_bit,X
	AND.w !sc_pending&$FFFF
	BEQ +
	PLA
	BRA .fail
+	PLA
	ORA.w !sc_pal&$FFFF
	STA !sd_tile
	CLC
	RTS
.upload
	LDA.l fx_entry_bit,X
	ORA.w !sc_pending&$FFFF
	STA.w !sc_pending&$FFFF
	LDA.l fx_entry_vram,X
	STA !sd_dst
	LDA !sd_key
	XBA : AND.w #$00FF
	STA !sd_src
	ASL : CLC : ADC !sd_src : TAX
	LDA.l ui_sc_banks+1,X
	XBA : AND.w #$00FF : STA !sd_bank
	LDA !sd_key
	AND.w #$00FF
	XBA : LSR : LSR
	CLC : ADC.l ui_sc_banks,X
	STA !sd_src
	TAY
	LDA !sd_bank
	STA.w !core_scratch&$FFFF
	LDA !sd_dst
	LDX.w #64
	%sc_far(core_queue_vram)
	LDY.w #!UI_ZERO_ROWS&$FFFF
	LDA.w #!UI_ZERO_ROWS>>16
	STA.w !core_scratch&$FFFF
	LDA !sd_dst
	CLC : ADC.w #$0100
	LDX.w #64
	%sc_far(core_queue_vram)
	INC !sd_uploads
.fail
	SEC
	RTS

ui_sc_corners:
	LDA !sd_visible
	BNE +
	RTS
+	LDA.w #1 : STA !sd_allow
	LDA !sd_x : SEC : SBC.w #12 : CMP.w #228
	BCS .clipped
	LDA !sd_y : SEC : SBC.w #28 : CMP.w #211
	BCS .clipped
	LDA.w !ui_vis&$FFFF
	BEQ .batch
	LDA !sd_y : CMP.w #100
	BCC .clipped
.batch
	LDA.w !ui_front_n&$FFFF
	BNE .tile
	LDA.w #!UI_SC_CORNER
	JSR ui_sc_cell
	BCS .return
	LDA !sd_tile
	STA.w !ui_front_n&$FFFF
.tile
	STA !sd_tile
	JMP ui_sc_reticle_batch
.return
	RTS
.clipped
	STZ !sd_corner
.loop
	LDA !sd_corner : ASL : TAX
	LDA.l ui_sc_corner_dx,X
	CLC : ADC !sd_x : STA !sd_sx
	LDA.l ui_sc_corner_dy,X
	CLC : ADC !sd_y : STA !sd_sy
	LDA.l ui_sc_corner_flip,X
	STA !sd_flags
	LDA.w #!UI_SC_CORNER
	STA !sd_key
	LDA.w !ui_vis&$FFFF
	BEQ .cell
	LDA !sd_corner
	AND.w #2
	BEQ .top
	LDA !sd_y : SEC : SBC.w #1
	BRA .crop
.top
	LDA !sd_sy
.crop
	STA !sd_cut
	LDA.w #72 : SEC : SBC !sd_cut
	BMI .cell
	CMP.w #4
	BCS .next
	STA !sd_cut
	LDA !sd_flags
	BPL +
	LDA !sd_cut : CLC : ADC.w #4 : STA !sd_cut
+	LDA !sd_key : CLC : ADC !sd_cut : STA !sd_key
.cell
	LDA !sd_key
	CMP.w #!UI_SC_CORNER
	BNE .resolve
	LDA.w !ui_front_n&$FFFF
	BEQ .resolve
	STA !sd_tile
	BRA .show
.resolve
	LDA !sd_key
	JSR ui_sc_cell
	BCS .next
	LDA !sd_key
	CMP.w #!UI_SC_CORNER
	BNE .show
	LDA !sd_tile
	STA.w !ui_front_n&$FFFF
.show
	LDA !sd_visible
	BEQ .next
	LDA !sd_tile
	ORA !sd_flags
	JSR ui_sc_sprite
.next
	INC !sd_corner
	LDA !sd_corner : CMP.w #4
	BCS +
	JMP .loop
+	RTS
; The common, fully on-screen reticle is one front/rear OAM batch. Reserve
; its two pairs of scanline spans, then write four sprites without four
; cache lookups, four capacity checks, or four high-table read/modify/writes.
ui_sc_reticle_batch:
	LDA.w !core_oam_cursor&$FFFF
	CLC : ADC.w #16+64
	CMP.w !core_oam_limit&$FFFF
	BCC +
	BEQ +
	RTS
+	LDA !sd_y : SEC : SBC.w #28 : STA !sd_sy
	JSR .room2
	BCC +
	RTS
+	LDA !sd_y : SEC : SBC.w #13 : STA !sd_sy
	JSR .room2
	BCC .emit
	; Undo the top pair if the bottom pair has no room.
	LDA !sd_y : SEC : SBC.w #28 : LSR : LSR : LSR : TAX
	LDA !sd_hist,X : SEC : SBC.w #$0202 : STA !sd_hist,X
	SEP #$20
	LDA !sd_hist+2,X : SEC : SBC.b #2 : STA !sd_hist+2,X
	REP #$20
	RTS
.emit
	LDA.w !core_oam_front_n&$FFFF
	CMP.w #13
	BCS .rear
	ASL : ASL : TAY
	LDA !sd_x : SEC : SBC.w #12 : STA !sd_sx
	LDA !sd_y : SEC : SBC.w #28 : XBA : ORA !sd_sx
	STA.w !core_oam_front&$FFFF,Y
	CLC : ADC.w #9 : STA.w (!core_oam_front&$FFFF)+4,Y
	CLC : ADC.w #$0F00 : STA.w (!core_oam_front&$FFFF)+12,Y
	SEC : SBC.w #9 : STA.w (!core_oam_front&$FFFF)+8,Y
	LDA !sd_tile : STA.w (!core_oam_front&$FFFF)+2,Y
	ORA.w #$4000 : STA.w (!core_oam_front&$FFFF)+6,Y
	ORA.w #$8000 : STA.w (!core_oam_front&$FFFF)+14,Y
	EOR.w #$4000 : STA.w (!core_oam_front&$FFFF)+10,Y
	TYA : LSR : TAX
	STZ.w !core_oam_front_hi&$FFFF,X
	STZ.w (!core_oam_front_hi&$FFFF)+2,X
	STZ.w (!core_oam_front_hi&$FFFF)+4,X
	STZ.w (!core_oam_front_hi&$FFFF)+6,X
	LDA.w !core_oam_front_n&$FFFF : CLC : ADC.w #4
	STA.w !core_oam_front_n&$FFFF
	RTS
.rear
	LDX.w !core_oam_cursor&$FFFF
	LDA !sd_x : SEC : SBC.w #12 : STA !sd_sx
	LDA !sd_y : SEC : SBC.w #28 : XBA : ORA !sd_sx
	STA.w $0800,X
	CLC : ADC.w #9 : STA.w $0804,X
	CLC : ADC.w #$0F00 : STA.w $080C,X
	SEC : SBC.w #9 : STA.w $0808,X
	LDA !sd_tile : STA.w $0802,X
	ORA.w #$4000 : STA.w $0806,X
	ORA.w #$8000 : STA.w $080E,X
	EOR.w #$4000 : STA.w $080A,X
	TXA : LSR : LSR : LSR : LSR : TAY
	TXA : AND.w #12 : LSR : TAX
	LDA.w $0A00,Y : AND.l ui_sc_four_hi,X : STA.w $0A00,Y
	LDA.w !core_oam_cursor&$FFFF : CLC : ADC.w #16
	STA.w !core_oam_cursor&$FFFF
	RTS
.room2
	LDA !sd_sy : LSR : LSR : LSR : TAX
	SEP #$20
	LDA !sd_hist,X : CMP.b #16 : BCS .no
	LDA !sd_hist+1,X : CMP.b #16 : BCS .no
	LDA !sd_hist+2,X : CMP.b #16 : BCS .no
	LDA !sd_hist,X : CLC : ADC.b #2 : STA !sd_hist,X
	LDA !sd_hist+1,X : CLC : ADC.b #2 : STA !sd_hist+1,X
	LDA !sd_hist+2,X : CLC : ADC.b #2 : STA !sd_hist+2,X
	REP #$20
	CLC
	RTS
.no
	REP #$20
	SEC
	RTS
ui_sc_four_hi: dw $FF00,$FC03,$F00F,$C03F

ui_sc_corner_dx: dw -12,-3,-12,-3
ui_sc_corner_dy: dw -28,-28,-13,-13
ui_sc_corner_flip: dw $0000,$4000,$8000,$C000

; Same front staging contract as core_oam_add_front / FX's batch emitter.
; Numbers are emitted first; after 16 front entries, corners use rear OAM.
; No PPU writes here. All field sprites are 16x16 (two slivers).
ui_sc_sprite:
	STA !sd_tile
	LDA !sd_sx : CLC : ADC.w #15 : CMP.w #271
	BCS .out
	LDA !sd_sy : CLC : ADC.w #15 : CMP.w #239
	BCS .out
	JSR ui_sc_room_on_lines
	BCS .out
	LDA.w !core_oam_front_n&$FFFF
	CMP.w #16
	BCS .back
	INC : CLC : ADC.w #3 : AND.w #$FFFC : ASL : ASL
	CLC : ADC.w !core_oam_cursor&$FFFF
	CMP.w !core_oam_limit&$FFFF
	BEQ +
	BCS .out
+	LDA.w !core_oam_front_n&$FFFF
	ASL : ASL : TAX
	SEP #$20
	LDA !sd_sx : STA.w !core_oam_front&$FFFF,X
	LDA !sd_sy : STA.w (!core_oam_front&$FFFF)+1,X
	REP #$20
	LDA !sd_tile : STA.w (!core_oam_front&$FFFF)+2,X
	TXA : LSR : TAX
	LDA !sd_sx : XBA : AND.w #1
	STA.w !core_oam_front_hi&$FFFF,X
	INC.w !core_oam_front_n&$FFFF
.out
	RTS
.back
	LDA.w !core_oam_cursor&$FFFF
	CLC : ADC.w #4+64
	CMP.w !core_oam_limit&$FFFF
	BEQ +
	BCS .out
+	LDX.w !core_oam_cursor&$FFFF
	SEP #$20
	LDA !sd_sx : STA.w $0800,X
	LDA !sd_sy : STA.w $0801,X
	REP #$20
	LDA !sd_tile : STA.w $0802,X
	TXA : LSR : LSR : LSR : LSR : TAY
	TXA : AND.w #12 : TAX
	LDA !sd_sx
	BPL +
	INX
+	SEP #$20
	LDA.w $0A00,Y
	AND.l core_hi_keep,X
	ORA.l core_hi_bits,X
	STA.w $0A00,Y
	REP #$20
	LDA.w !core_oam_cursor&$FFFF
	CLC : ADC.w #4
	STA.w !core_oam_cursor&$FFFF
	RTS

; Budget every existing OBJ, including staged FX, before adding UI. Eight-
; line bins conservatively count a partially intersecting sprite as present
; on the entire bin. <=34 slivers also implies <=17 of these 16/32px OBJs,
; below the 32-sprite limit. UI yields whole pieces instead of overflowing.
ui_sc_limits:
	LDX.w #30
-	STZ !sd_hist,X
	DEX : DEX
	BPL -
	STZ.w !ui_tmp0&$FFFF              ; visible OBJ palette mask
	LDY.w #0
.native
	CPY.w !core_oam_cursor&$FFFF
	BCC +
	JMP .front
+	TYA : LSR : LSR : LSR : LSR : TAX
	LDA.w $0A00,X : STA !sd_flags
	LDA.w #0
	SEP #$20
	for spr = 0..4
		LDA.w $0801+(!spr*4),Y
		CMP.b #224
		BEQ +
		STA !sd_src
		LDA.w $0803+(!spr*4),Y : TAX
		LDA.l fx_attr_palbit,X
		ORA.w !ui_tmp0&$FFFF : STA.w !ui_tmp0&$FFFF
		REP #$20
		LDA !sd_flags
		AND.w #2<<(!spr*2) : CMP.w #2<<(!spr*2)
		LDA !sd_src : AND.w #$00FF
		JSR .mark
		LDA.w #0
		SEP #$20
+
	endfor
	REP #$20
	TYA : CLC : ADC.w #16 : TAY
	JMP .native
.front
	LDY.w #0
.floop
	TYA : LSR : LSR
	CMP.w !core_oam_front_n&$FFFF
	BCS .done
	ASL : TAX
	LDA.w !core_oam_front_hi&$FFFF,X : STA !sd_flags
	LDA.w (!core_oam_front&$FFFF)+3,Y : AND.w #$00FF : TAX
	LDA.l fx_attr_palbit,X : AND.w #$00FF
	ORA.w !ui_tmp0&$FFFF : STA.w !ui_tmp0&$FFFF
	LSR !sd_flags : LSR !sd_flags
	LDA.w (!core_oam_front&$FFFF)+1,Y
	AND.w #$00FF
	JSR .mark
	INY : INY : INY : INY
	BRA .floop
.done
	RTS
; C=large, A=y. Packed half-sliver counters, padded past line 223.
; With any room for UI, <128 native/FX OBJs means each byte stays <256.
.mark
	BCS .large
	CMP.w #224
	BCC .small
	CMP.w #241
	BCC .done
	; a small OBJ wraps from the bottom to visible lines 0..14
	LDA.w #0
.small
	LSR : LSR : LSR : TAX
	LDA !sd_hist,X : CLC : ADC.w #$0101 : STA !sd_hist,X
	SEP #$20
	INC !sd_hist+2,X
	REP #$20
	RTS
.large
	CMP.w #224
	BCC +
	BEQ .done
	LDA.w #0
+	LSR : LSR : LSR : TAX
	LDA !sd_hist,X : CLC : ADC.w #$0202 : STA !sd_hist,X
	LDA !sd_hist+2,X : CLC : ADC.w #$0202 : STA !sd_hist+2,X
	SEP #$20
	LDA !sd_hist+4,X : CLC : ADC.b #2 : STA !sd_hist+4,X
	REP #$20
	RTS

ui_sc_room_on_lines:
	LDA !sd_sy
	BPL +
	LDA.w #0
+	LSR : LSR : LSR : TAX
	SEP #$20
	LDA !sd_hist,X : CMP.b #17 : BCS .no
	LDA !sd_hist+1,X : CMP.b #17 : BCS .no
	LDA !sd_hist+2,X : CMP.b #17 : BCS .no
	INC !sd_hist,X
	INC !sd_hist+1,X
	INC !sd_hist+2,X
	REP #$20
	CLC
	RTS
.no
	REP #$20
	SEC
	RTS

; Beam-counter latch, main-thread only; no PPU-memory writes.
ui_sc_vline:
	SEP #$20
	LDA.l $00213F
	LDA.l $002137
	LDA.l $00213D
	XBA
	LDA.l $00213D
	AND.b #1
	XBA
	REP #$20
	RTS

ui_sc_actor_bits: dw $0001,$0002,$0004,$0008,$0010,$0020,$0040,$0080,$0100,$0200,$0400,$0800,$1000
