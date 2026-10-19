; OAM additions (included by core.asm inside the core code bank).
;
; The field and world loops build the OAM buffer at $7E:0800 (low table,
; 128 x 4 bytes: X, Y, tile, attr) and $7E:0A00 (high table, 2 bits per
; sprite: bit0 X bit 8, bit1 large size); NMI DMAs all $220 bytes. A lower
; slot index draws in front of a higher one. Hidden slots hold X=$FF, Y=$E0.
;
; Field (also boss arenas, events): C0:BCCC resets the cursor $7C, HUD
; portraits (C1:E61D) and actors (C0:E38E, back-to-front lists $0540/$0500)
; append through C0:E640/E849, C0:BCAB hides slots from $7C up to last
; frame's end ($0120). Sizes are 16x16 / 32x32 (OBJSEL $63).
; World flight: slots 0-63 world objects (rebuilt over two frames), 64-83
; Flammie and effects; 84-127 are never written (OBJSEL $03: 8x8 / 16x16).
; Menus use their own buffer ($7E:9C00); rings clear the field buffer
; before building their own sprites. Neither mode draws module sprites.
;
; API (parameters in !core_spr_x/y/tile/size, JSL, M16/X16, DB = $7E):
;   core_oam_add       - behind the native sprites (field: right after them;
;                        world: slots 88-127). Carry set when full or the
;                        mode has no module sprites. Offscreen sprites are
;                        dropped (carry clear).
;   core_oam_add_front - field only: in front of every native sprite. Staged
;                        (max 16). Ground commit appends and rotates PPU
;                        priority; flight inserts physically. Carry = full.
;   core_oam_hide      - A = slot: hide it (X=$FF, Y=$E0).
;   core_oam_meta, core_oam_meta_front - a meta-sprite: up to 16 pieces that
;                        share an anchor, a base tile word and a mirror (see
;                        below). _front stages pieces in front while the 16
;                        front slots last, then the rest behind.
; !core_oam_native = first slot after this frame's native sprites (before the
; front commit) so modules can inspect or modify native entries [0, native).
; Limits: 128 sprites, 32 sprites or 34 8-pixel slivers per scanline (a 16x16
; sprite is 2 slivers, a 32x32 is 4); excess sprites on a line drop out.

!CORE_WORLD_FIRST = 88             ; first world-mode module slot
!CORE_WORLD_NATIVE_END = 84        ; world natives never use slots >= 84

; Prepare the module area for the frame (core_frame_begin).
core_oam_begin:
	STZ.w !core_oam_front_n&$FFFF
	LDA.w !core_mode&$FFFF
	CMP.w #!CORE_MODE_FIELD
	BEQ .field
	CMP.w #!CORE_MODE_WORLD
	BEQ .world
	STZ.w !core_oam_cursor&$FFFF
	STZ.w !core_oam_limit&$FFFF
	STZ.w !core_oam_native&$FFFF
	RTS
.field
	LDA $7C                          ; native cursor (bytes) after this frame's build
	CMP.w #$0201
	BCC +
	LDA.w #$0200
+	AND.w #$03FC
	STA.w !core_oam_cursor&$FFFF
	LSR : LSR
	STA.w !core_oam_native&$FFFF
	LDA.w #$0200
	STA.w !core_oam_limit&$FFFF
	RTS
.world
	LDX.w #!CORE_WORLD_FIRST*4
	LDA.l !core_oam_world_hw
	TAY
	JSR core_oam_hide_range
	LDA.w #!CORE_WORLD_FIRST*4
	STA.w !core_oam_cursor&$FFFF
	STA.l !core_oam_world_hw
	LDA.w #!CORE_WORLD_FIRST
	STA.w !core_oam_native&$FFFF
	LDA.w #$0200
	STA.w !core_oam_limit&$FFFF
	RTS

; A = new mode, !core_mode = old mode. Clean up module sprites the new
; mode's natives will not overwrite, then store the new mode.
core_oam_mode_changed:
	PHA
	LDA.w !core_mode&$FFFF
	CMP.w #!CORE_MODE_WORLD
	BNE .notWorld
	; Leaving world flight: hide slots 88-127 we drew, above any field native.
	LDX.w #!CORE_WORLD_FIRST*4
	LDA $01,S
	CMP.w #!CORE_MODE_FIELD
	BNE +
	LDA $7C
	CMP.w #!CORE_WORLD_FIRST*4
	BCC +
	TAX
+	LDA.l !core_oam_world_hw
	TAY
	JSR core_oam_hide_range
	LDA.w #$0000
	STA.l !core_oam_world_hw
	BRA .store
.notWorld
	CMP.w #!CORE_MODE_FIELD
	BNE .store
	LDA $01,S
	CMP.w #!CORE_MODE_WORLD
	BNE .store
	; Field -> world: world natives own 0-83; hide field module slots >= 84.
	LDX.w #!CORE_WORLD_NATIVE_END*4
	LDA.l !core_oam_field_hw
	TAY
	JSR core_oam_hide_range
.store
if not(defined("CORE_OAM_ROTATION_SLOW")) && not(defined("CORE_OAM_COMMIT_SLOW"))
	SEP #$20
	LDA.b #0
	STA.l !core_oam_first
	REP #$20
endif
	PLA
	STA.w !core_mode&$FFFF
	RTS

; Hide byte offsets [X, Y) (multiples of 4) and clear their high bits.
; Y = 224 is below the 224-line picture for both OBJSEL $63 sizes (16/32),
; so the high-table bits need not change: a hidden slot costs one store
; (requested by the UI stream: re-hiding the radar dial was ~11 lines/frame).
core_oam_hide_range:
	STY.w !core_tmp0&$FFFF
	CPY.w #$0200
	BCC .loop
	LDA.w #$0200 : STA.w !core_tmp0&$FFFF
.loop
	CPX.w !core_tmp0&$FFFF
	BCS .done
	LDA.w #$E0FF
	STA.w $0800,X
	INX : INX : INX : INX
	BRA .loop
.done
	RTS

; Set the 2 high-table bits of slot Y16 to A16 (bit0 X bit 8, bit1 size).
; Clobbers A, X, Y.
core_oam_set_hi:
	AND.w #$0003
	STA.w !core_tmp1&$FFFF
	TYA : AND.w #$0003 : ASL : ASL
	ORA.w !core_tmp1&$FFFF
	TAX
	TYA : LSR : LSR : TAY
	SEP #$20
	LDA.w $0A00,Y
	AND.l core_hi_keep,X
	ORA.l core_hi_bits,X
	STA.w $0A00,Y
	REP #$20
	RTS
core_hi_keep:
	db $FC,$FC,$FC,$FC, $F3,$F3,$F3,$F3, $CF,$CF,$CF,$CF, $3F,$3F,$3F,$3F
core_hi_bits:
	db $00,$01,$02,$03, $00,$04,$08,$0C, $00,$10,$20,$30, $00,$40,$80,$C0

; Carry set when the parameters are entirely offscreen.
core_spr_cull:
	LDA.w !core_spr_x&$FFFF
	CLC : ADC.w #$0040                 ; x in [-64, 256)  <=>  x+64 in [0, 320)
	CMP.w #$0140
	BCS .out
	LDA.w !core_spr_y&$FFFF
	CLC : ADC.w #$0040                 ; y in [-64, 224)
	CMP.w #$0120
	BCS .out
	; Entirely above the screen (y + height <= 0) would wrap its 8-bit Y to
	; 192-240 and show at the bottom; cull it. Partly visible sprites keep
	; Y = 256 + y and wrap onto the top lines as on hardware. Heights follow
	; the game's OBJSEL ($63: 16x16 small, 32x32 large).
	LDA.w !core_spr_y&$FFFF
	BPL .in
	LDX.w #16
	LDA.w !core_spr_size&$FFFF
	BEQ +
	LDX.w #32
+	TXA
	CLC : ADC.w !core_spr_y&$FFFF
	BEQ .out
	BMI .out
.in
	CLC
	RTS
.out
	SEC
	RTS

; High bits (A16 = xhi | size<<1) of the parameter block.
core_spr_hibits:
	LDA.w !core_spr_size&$FFFF
	BEQ +
	LDA.w #$0002
+	STA.w !core_tmp1&$FFFF
	LDA.w !core_spr_x&$FFFF
	AND.w #$0100
	BEQ +
	LDA.w #$0001
+	ORA.w !core_tmp1&$FFFF
	RTS

; Behind the native sprites.
core_oam_add:
	LDA.w !core_oam_limit&$FFFF
	BEQ .full
	; room: cursor + 4 + front reservation <= limit
	LDA.w !core_oam_front_n&$FFFF
	CLC : ADC.w #$0003 : AND.w #$FFFC : ASL : ASL
	CLC : ADC.w !core_oam_cursor&$FFFF
	CLC : ADC.w #$0004
	CMP.w !core_oam_limit&$FFFF
	BEQ .room
	BCS .full
.room
	JSR core_spr_cull
	BCS .culled
	LDX.w !core_oam_cursor&$FFFF
	SEP #$20
	LDA.w !core_spr_x&$FFFF : STA.w $0800,X
	LDA.w !core_spr_y&$FFFF : STA.w $0801,X
	REP #$20
	LDA.w !core_spr_tile&$FFFF : STA.w $0802,X
	TXA : LSR : LSR : TAY
	JSR core_spr_hibits
	JSR core_oam_set_hi
	LDA.w !core_oam_cursor&$FFFF
	CLC : ADC.w #$0004
	STA.w !core_oam_cursor&$FFFF
.culled
	CLC
	RTL
.full
	SEC
	RTL

; In front of every native sprite (field only).
core_oam_add_front:
	LDA.w !core_mode&$FFFF
	CMP.w #!CORE_MODE_FIELD
	BNE .full
	LDA.w !core_oam_front_n&$FFFF
	CMP.w #16
	BCS .full
	INC
	CLC : ADC.w #$0003 : AND.w #$FFFC : ASL : ASL
	CLC : ADC.w !core_oam_cursor&$FFFF
	CMP.w !core_oam_limit&$FFFF
	BEQ .room
	BCS .full
.room
	JSR core_spr_cull
	BCS .culled
	LDA.w !core_oam_front_n&$FFFF
	ASL : ASL : TAX
	SEP #$20
	LDA.w !core_spr_x&$FFFF : STA.w !core_oam_front&$FFFF,X
	LDA.w !core_spr_y&$FFFF : STA.w (!core_oam_front&$FFFF)+1,X
	REP #$20
	LDA.w !core_spr_tile&$FFFF : STA.w (!core_oam_front&$FFFF)+2,X
	LDA.w !core_oam_front_n&$FFFF
	ASL : TAX
	JSR core_spr_hibits
	STA.w !core_oam_front_hi&$FFFF,X
	INC.w !core_oam_front_n&$FFFF
.culled
	CLC
	RTL
.full
	SEC
	RTL

; ---------------------------------------------------------------------------
; Meta-sprites. In: !core_spr_x/y = anchor (signed screen px), !core_spr_tile
; = base tile word (tile | attr << 8: name bit, palette, priority, flips),
; !core_meta_ptr = long pointer to the pieces, A16 = count (1-16), X16 bit 0 =
; mirror (each dx becomes -dx - width; the caller sets the h-flip bit in the
; base word). Piece: 4 bytes {dx s8, dy s8, tile u8 (added to the base word),
; flags u8: bit 0 large}. Each piece is culled like core_spr_cull. Carry set if
; any piece found no slot. JSL, M16/X16, DB = $7E (kept); clobbers A/X/Y.
core_oam_meta_front:
	PHA
	LDA.w #$0001
	BRA core_oam_meta_go
core_oam_meta:
	PHA
	LDA.w #$0000
core_oam_meta_go:
	STA.w !core_meta_front&$FFFF
	PLA
	AND.w #$001F
	BNE +
	CLC
	RTL
+	CMP.w #17
	BCC +
	LDA.w #16
+	STA.w !core_meta_n&$FFFF
	STZ.w !core_meta_fail&$FFFF
	; Anchors: a mirrored piece sits at ax - dx - width.
	TXA : AND.w #$0001 : STA.w !core_meta_mir&$FFFF
	LDA.w !core_spr_x&$FFFF
	STA.w !core_meta_axs&$FFFF
	STA.w !core_meta_axl&$FFFF
	LDA.w !core_meta_mir&$FFFF
	BEQ +
	LDA.w !core_spr_x&$FFFF
	SEC : SBC.w #16 : STA.w !core_meta_axs&$FFFF
	SEC : SBC.w #16 : STA.w !core_meta_axl&$FFFF
+	LDA.w !core_spr_y&$FFFF : STA.w !core_meta_ay&$FFFF
	LDA.w !core_spr_tile&$FFFF : STA.w !core_meta_base&$FFFF
	; Room, once: front slots (field, up to 16 staged; every 4 shift the
	; natives by 4 slots) and back slots behind the natives.
	STZ.w !core_meta_ffree&$FFFF
	STZ.w !core_meta_bfree&$FFFF
	LDA.w !core_oam_limit&$FFFF
	BEQ .roomDone
	LDA.w !core_oam_front_n&$FFFF
	CLC : ADC.w #$0003 : AND.w #$FFFC : ASL : ASL
	CLC : ADC.w !core_oam_cursor&$FFFF
	STA.w !core_tmp0&$FFFF              ; first byte the back sprites cannot use
	LDA.w !core_oam_limit&$FFFF
	SEC : SBC.w !core_tmp0&$FFFF
	BCC .roomDone
	STA.w !core_meta_bfree&$FFFF
	LDA.w !core_meta_front&$FFFF
	BEQ .roomDone
	LDA.w !core_mode&$FFFF
	CMP.w #!CORE_MODE_FIELD
	BNE .roomDone
	LDA.w #16
	SEC : SBC.w !core_oam_front_n&$FFFF
	BCC .roomDone
	STA.w !core_meta_ffree&$FFFF
.roomDone
	; Copy the pieces (any bank) into !core_meta_buf, a word at a time.
	LDA.w !core_meta_n&$FFFF
	ASL : ASL : TAX                     ; byte count (4-64)
	CLC : ADC.w !core_meta_ptr&$FFFF
	TAY                                 ; source end in its bank
	PHB
	SEP #$20
	LDA.w (!core_meta_ptr&$FFFF)+2 : PHA : PLB
	REP #$20
.copy
	DEY : DEY
	DEX : DEX
	LDA $0000,Y
	STA.l !core_meta_buf,X
	TXA
	BNE .copy
	PLB
	LDX.w #$0000
.piece
	; X = piece offset in the buffer for the whole body.
	LDA.w (!core_meta_buf&$FFFF)+3,X    ; flags
	LSR                                 ; C = large
	LDA.w !core_meta_axs&$FFFF
	BCC +
	LDA.w !core_meta_axl&$FFFF
+	STA.w !core_meta_x&$FFFF
	LDA.w !core_meta_buf&$FFFF,X        ; dx (s8)
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	LDY.w !core_meta_mir&$FFFF
	BEQ +
	EOR.w #$FFFF : INC
+	CLC : ADC.w !core_meta_x&$FFFF
	STA.w !core_meta_x&$FFFF
	CLC : ADC.w #$0040                ; x in [-64, 256)
	CMP.w #$0140
	BCC +
	JMP .next
+	LDA.w (!core_meta_buf&$FFFF)+1,X    ; dy (s8)
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	CLC : ADC.w !core_meta_ay&$FFFF
	STA.w !core_meta_y&$FFFF
	CLC : ADC.w #$0040                ; y in [-64, 224)
	CMP.w #$0120
	BCC +
	JMP .next
+	LDA.w !core_meta_y&$FFFF
	BPL .yok
	CLC : ADC.w #16                     ; entirely above the screen: y + height <= 0
	PHA
	LDA.w (!core_meta_buf&$FFFF)+3,X
	LSR
	PLA
	BCC +
	ADC.w #15                           ; C set: +16 more for a 32x32 piece
+	CMP.w #$0001
	BPL .yok
	JMP .next
.yok
	; high bits: size << 1 | x bit 8
	LDA.w (!core_meta_buf&$FFFF)+3,X
	AND.w #$0001
	ASL
	STA.w !core_meta_hib&$FFFF
	LDA.w !core_meta_x&$FFFF
	AND.w #$0100
	BEQ +
	INC.w !core_meta_hib&$FFFF
+	LDA.w (!core_meta_buf&$FFFF)+2,X
	AND.w #$00FF
	CLC : ADC.w !core_meta_base&$FFFF
	STA.w !core_meta_tile&$FFFF
	STX.w !core_meta_pi&$FFFF
	LDA.w !core_meta_ffree&$FFFF
	BEQ .back
	DEC.w !core_meta_ffree&$FFFF
	; stage in front
	LDA.w !core_oam_front_n&$FFFF
	ASL : ASL : TAY
	SEP #$20
	LDA.w !core_meta_x&$FFFF : STA.w !core_oam_front&$FFFF,Y
	LDA.w !core_meta_y&$FFFF : STA.w (!core_oam_front&$FFFF)+1,Y
	REP #$20
	LDA.w !core_meta_tile&$FFFF : STA.w (!core_oam_front&$FFFF)+2,Y
	TYA : LSR : TAY
	LDA.w !core_meta_hib&$FFFF : STA.w !core_oam_front_hi&$FFFF,Y
	INC.w !core_oam_front_n&$FFFF
	BRA .placed
.back
	LDA.w !core_meta_bfree&$FFFF
	BEQ .nofit
	SEC : SBC.w #$0004
	STA.w !core_meta_bfree&$FFFF
	JSR core_meta_back_put
	BRA .placed
.nofit
	LDA.w #$0001 : STA.w !core_meta_fail&$FFFF
.placed
	LDX.w !core_meta_pi&$FFFF
.next
	INX : INX : INX : INX
	DEC.w !core_meta_n&$FFFF
	BEQ .done
	JMP .piece
.done
	LDA.w !core_meta_fail&$FFFF
	LSR                               ; carry = a piece found no slot
	RTL

; Put the piece behind the natives at the cursor (room was counted). DB = $7E.
core_meta_back_put:
	LDY.w !core_oam_cursor&$FFFF
	SEP #$20
	LDA.w !core_meta_x&$FFFF : STA.w $0800,Y
	LDA.w !core_meta_y&$FFFF : STA.w $0801,Y
	REP #$20
	LDA.w !core_meta_tile&$FFFF : STA.w $0802,Y
	TYA : LSR : LSR : TAY
	LDA.w !core_meta_hib&$FFFF
	JSR core_oam_set_hi
	LDA.w !core_oam_cursor&$FFFF
	CLC : ADC.w #$0004
	STA.w !core_oam_cursor&$FFFF
	RTS

; Hide slot A16 (0-127).
core_oam_hide:
	AND.w #$007F
	ASL : ASL : TAX
	LDA.w #$E0FF
	STA.w $0800,X
	RTL

; Field commit: insert staged front sprites, record the new end so the
; game's next C0:BCAB hides our slots.
; Enter an unrolled descending word copy at its requested length. Each
; word uses six ROM bytes, so cursor*3 selects the first instruction.
; The synthetic RTS consumes only its computed target; the caller's
; return stays underneath it. Copies remain interruptible, like MVP.
if not(defined("CORE_OAM_COMMIT_SLOW"))
core_oam_shift_low:
	LDY.w !core_tmp1&$FFFF             ; destination displacement, 4G
	LDA.w !core_oam_cursor&$FFFF
	ASL
	CLC : ADC.w !core_oam_cursor&$FFFF
	EOR.w #$FFFF
	CLC : ADC.w #core_oam_shift_low_end
	PHA
	RTS
	for word = 0..256
		!offset #= 510-(!word*2)
		LDA.w $0800+!offset
		STA.w $0800+!offset,Y
	endfor
core_oam_shift_low_end:
	RTS

core_oam_copy_front:
	LDA.w !core_oam_front_n&$FFFF
	ASL
	CLC : ADC.w !core_oam_front_n&$FFFF
	ASL : ASL                         ; twelve ROM bytes per staged sprite
	EOR.w #$FFFF
	CLC : ADC.w #core_oam_copy_front_end
	PHA
	RTS
	for word = 0..32
		!offset #= 62-(!word*2)
		LDA.w (!core_oam_front&$FFFF)+!offset
		STA.w $0800+!offset
	endfor
core_oam_copy_front_end:
	RTS
core_oam_partial_hi:
	db $FF,$03,$0F,$3F
endif

macro core_oam_commit(name, fast)
<name>:
	LDA.w !core_oam_front_n&$FFFF
	BNE .front
	JMP .done
.front
if <fast> == 0 && not(defined("CORE_OAM_COMMIT_SLOW"))
	; Preserve the measured airborne schedule while its CPU peaks remain
	; open. The faster ground commit helps charge/release, but applying it
	; to flight changed input/actor alignment and worsened the long ki run.
	LDA.w !RAM_FLIGHT&$FFFF
	BIT.w #1                         ; flight's published FLS_FLY bit
	BNE +
	JMP core_oam_commit_batch
+	LDA.w !core_oam_front_n&$FFFF
endif
	CLC : ADC.w #$0003 : AND.w #$FFFC
	STA.w !core_tmp2&$FFFF            ; G = reserved slots (multiple of 4)
	; Low table: [0, cursor) -> [4G, cursor + 4G)
	LDA.w !core_oam_cursor&$FFFF
	BEQ .lowDone
	LDA.w !core_tmp2&$FFFF
	ASL : ASL
	STA.w !core_tmp1&$FFFF            ; 4G bytes
if <fast> == 0
	LDA.w !core_oam_cursor&$FFFF
	CLC : ADC.w #$0800-1
	TAX                               ; source end
	CLC : ADC.w !core_tmp1&$FFFF
	TAY                               ; destination end
	LDA.w !core_oam_cursor&$FFFF
	DEC
	PHB
	MVP $7E,$7E
	PLB
else
	JSR core_oam_shift_low
endif
	; High table: bytes [0, H) -> [G/4, H + G/4), H = ceil(cursor / 16)
	LDA.w !core_oam_cursor&$FFFF
	CLC : ADC.w #$000F
	LSR : LSR : LSR : LSR
	BEQ .lowDone
	STA.w !core_tmp1&$FFFF            ; H
	LDA.w !core_tmp2&$FFFF
	LSR : LSR
	STA.w !core_tmp0&$FFFF            ; G/4
	LDA.w !core_tmp1&$FFFF
	CLC : ADC.w #$0A00-1
	TAX
	CLC : ADC.w !core_tmp0&$FFFF
	TAY
	LDA.w !core_tmp1&$FFFF
	DEC
	PHB
	MVP $7E,$7E
	PLB
.lowDone
if <fast> == 0
	; Clear the high bytes of the reserved group.
	LDA.w !core_tmp2&$FFFF
	LSR : LSR
	TAX
	SEP #$20
.clrHi
	DEX
	BMI .clrDone
	STZ.w $0A00,X
	BRA .clrHi
.clrDone
	REP #$20
	; Staged sprites into slots 0..n-1, the rest of the group hidden.
	LDX.w #$0000
.put
	TXA : LSR : LSR
	CMP.w !core_oam_front_n&$FFFF
	BCS .hide
	LDA.w !core_oam_front&$FFFF,X : STA.w $0800,X
	LDA.w (!core_oam_front&$FFFF)+2,X : STA.w $0802,X
	PHX
	TXA : LSR : TAX
	LDA.w !core_oam_front_hi&$FFFF,X
	PHA
	TXA : LSR : TAY
	PLA
	JSR core_oam_set_hi
	PLX
	BRA .nextPut
.hide
	LDA.w #$E0FF : STA.w $0800,X
.nextPut
	INX : INX : INX : INX
	TXA : LSR : LSR
	CMP.w !core_tmp2&$FFFF
	BCC .put
else
	JSR core_oam_copy_front
	; Hide only the at-most-three padding slots; their tile bytes stay put.
	LDA.w !core_oam_front_n&$FFFF
	ASL : ASL : TAX
	LDA.w !core_tmp2&$FFFF
	ASL : ASL : TAY
	JSR core_oam_hide_range
	; Staged high words are 0..3. Pack four at a time, then mask the last
	; partial group so unused staging entries can contain arbitrary bytes.
	LDA.w !core_tmp2&$FFFF
	LSR : LSR
	STA.w !core_tmp0&$FFFF
	LDX.w #0
	LDY.w #0
.packHi
	LDA.w (!core_oam_front_hi&$FFFF)+6,X
	ASL : ASL
	ORA.w (!core_oam_front_hi&$FFFF)+4,X
	ASL : ASL
	ORA.w (!core_oam_front_hi&$FFFF)+2,X
	ASL : ASL
	ORA.w !core_oam_front_hi&$FFFF,X
	SEP #$20
	STA.w $0A00,Y
	REP #$20
	INY
	TXA : CLC : ADC.w #8 : TAX
	CPY.w !core_tmp0&$FFFF
	BCC .packHi
	LDA.w !core_oam_front_n&$FFFF
	AND.w #3
	TAX
	SEP #$20
	LDA.l core_oam_partial_hi,X
	AND.w $09FF,Y
	STA.w $09FF,Y
	REP #$20
endif
	; Account for the shift.
	LDA.w !core_tmp2&$FFFF
	ASL : ASL
	CLC : ADC.w !core_oam_cursor&$FFFF
	STA.w !core_oam_cursor&$FFFF
	STZ.w !core_oam_front_n&$FFFF
.done
	LDA.w !core_oam_cursor&$FFFF
	STA.w $0120                       ; next frame's C0:BCAB hides up to here
	STA.l !core_oam_field_hw
	RTS
endmacro

if defined("CORE_OAM_ROTATION_SLOW") || defined("CORE_OAM_COMMIT_SLOW")
%core_oam_commit(core_oam_commit_field, 0)
else
%core_oam_commit(core_oam_commit_legacy, 0)
endif
if not(defined("CORE_OAM_COMMIT_SLOW"))
%core_oam_commit(core_oam_commit_batch, 1)
endif

if not(defined("CORE_OAM_ROTATION_SLOW")) && not(defined("CORE_OAM_COMMIT_SLOW"))
; Keep native and rear entries in place; their relative order is unchanged.
; The PPU starts at the appended foreground group and wraps through hidden
; slots back to native slot zero. Reservation and next-frame cleanup keep
; their existing rounded capacity. No extra DMA bytes or OBJ slots.
if not(defined("CORE_OAM_ROTATION_AIR"))
core_oam_commit_ground:
endif
core_oam_commit_field:
core_oam_commit_rotated:
	SEP #$20
	LDA.b #0
	STA.l !core_oam_first
	REP #$20
if not(defined("CORE_OAM_ROTATION_AIR"))
	; Keep the existing airborne insertion while crowded aerial timing is
	; open. Rotating every mode reduces its largest spike but worsens the
	; sustained ki sequence; ground charging benefits without that change.
	LDA.w !RAM_FLIGHT&$FFFF
	BIT.w #1
	BEQ +
	JMP core_oam_commit_legacy
+
endif
	LDA.w !core_oam_front_n&$FFFF
	BEQ .done
	LDY.w !core_oam_cursor&$FFFF
	TYA : LSR : LSR
	STA.w !core_tmp0&$FFFF
	ORA.w #$0080
	SEP #$20
	STA.l !core_oam_first
	REP #$20
	JSR core_oam_append_front
	JSR core_oam_append_hi
	; Hide the same zero-to-three padding slots as the shifted layout.
	LDA.w !core_oam_front_n&$FFFF
	ASL : ASL
	CLC : ADC.w !core_oam_cursor&$FFFF
	TAX
	LDA.w !core_oam_front_n&$FFFF
	CLC : ADC.w #3 : AND.w #$FFFC : ASL : ASL
	CLC : ADC.w !core_oam_cursor&$FFFF
	STA.w !core_oam_cursor&$FFFF
	TAY
	JSR core_oam_hide_range
	STZ.w !core_oam_front_n&$FFFF
.done
	LDA.w !core_oam_cursor&$FFFF
	STA.w $0120
	STA.l !core_oam_field_hw
	RTS

; Y = native/rear byte end. Copy at most 64 staged bytes, without moving
; the native list. Like the old word copy, this remains interruptible.
core_oam_append_front:
	LDA.w !core_oam_front_n&$FFFF
	ASL
	CLC : ADC.w !core_oam_front_n&$FFFF
	ASL : ASL
	EOR.w #$FFFF
	CLC : ADC.w #core_oam_append_front_end
	PHA
	RTS
	for word = 0..32
		!offset #= 62-(!word*2)
		LDA.w (!core_oam_front&$FFFF)+!offset
		STA.w $0800+!offset,Y
	endfor
core_oam_append_front_end:
	RTS

; Pack four high entries at a time, including an unaligned native end.
; Only the reserved group changes; the first/last byte can share natives
; or hidden slots. Unaligned groups always end before the final high byte.
core_oam_append_hi:
	LDA.w !core_oam_front_n&$FFFF
	AND.w #3 : TAX
	LDA.l core_oam_partial_hi,X
	AND.w #$00FF
	STA.w !core_tmp2&$FFFF
	LDA.w !core_oam_front_n&$FFFF
	CLC : ADC.w #3 : LSR : LSR
	STA.w !core_tmp0&$FFFF
	LDA.w !core_oam_cursor&$FFFF
	LSR : LSR : LSR : LSR : TAY
	LDA.w !core_oam_cursor&$FFFF
	AND.w #$000C : LSR : TAX
	JMP (core_oam_append_hi_paths,X)
core_oam_append_hi_paths:
	dw core_oam_append_hi_0,core_oam_append_hi_2,core_oam_append_hi_4,core_oam_append_hi_6

macro core_oam_pack_append(name, shift, keep)
<name>:
	LDX.w #0
.loop
	LDA.w (!core_oam_front_hi&$FFFF)+6,X
	ASL : ASL
	ORA.w (!core_oam_front_hi&$FFFF)+4,X
	ASL : ASL
	ORA.w (!core_oam_front_hi&$FFFF)+2,X
	ASL : ASL
	ORA.w !core_oam_front_hi&$FFFF,X
	DEC.w !core_tmp0&$FFFF
	BNE +
	AND.w !core_tmp2&$FFFF
+	AND.w #$00FF
if <shift> == 0
	SEP #$20
	STA.w $0A00,Y
	REP #$20
else
	for bit = 0..<shift>
		ASL
	endfor
	STA.w !core_tmp1&$FFFF
	LDA.w $0A00,Y
	AND.w #<keep>
	ORA.w !core_tmp1&$FFFF
	STA.w $0A00,Y
endif
	INY
	TXA : CLC : ADC.w #8 : TAX
	LDA.w !core_tmp0&$FFFF
	BNE .loop
	RTS
endmacro
%core_oam_pack_append(core_oam_append_hi_0, 0, $FF00)
%core_oam_pack_append(core_oam_append_hi_2, 2, $FC03)
%core_oam_pack_append(core_oam_append_hi_4, 4, $F00F)
%core_oam_pack_append(core_oam_append_hi_6, 6, $C03F)

; C0:C11E, M8/X16, DB=0, D=0. Keep the native DMA and CPU return state.
; OAMADD must be set after DMA: the transfer advances the PPU address.
core_oam_upload:
	LDX.w #0
	STX.w $2102
	LDX.w #$0800
	STX.w $4372
	LDX.w #$0400
	STX.w $4370
	STZ.w $4374
	LDX.w #$0220
	STX.w $4375
	LDA.b #$80
	STA.w $420B
	LDA.l !core_oam_first
	BEQ .done                  ; native setup already disabled rotation
	PHP
	ASL
	STA.w $2102
	LDA.b #0
	ROR
	STA.w $2103
	PLP
.done
	LDA.b #$80
; The remaining native NMI has the same low WRAM/IO mapping in bank $80.
; RTI restores the interrupted bank from the hardware frame on the stack.
core_oam_fast_tail:
	JML $80C13E

; The native full OBJ clear also runs on ring/map entry, without a module
; frame in between. Retire the completed field's priority before those
; native builders replace its sprites. The original REP/LDX are replayed;
; E35A replaces A before use. All continuations share the bank-$80 mirror.
core_oam_native_clear:
	SEP #$20
	LDA.b #0
	STA.l !core_oam_first
	REP #$30
	LDX.w #0
	JML $80E35A
endif

; World commit: remember what to hide next frame.
core_oam_commit_world:
	LDA.w !core_oam_cursor&$FFFF
	STA.l !core_oam_world_hw
	RTS
