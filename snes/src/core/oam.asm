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
; Menus use their own buffer ($7E:9C00) and rings keep the frozen field
; sprites in slots 0-63 and draw icons from slot 64: no module sprites there.
;
; API (parameters in !core_spr_x/y/tile/size, JSL, M16/X16, DB = $7E):
;   core_oam_add       - behind the native sprites (field: right after them;
;                        world: slots 88-127). Carry set when full or the
;                        mode has no module sprites. Offscreen sprites are
;                        dropped (carry clear).
;   core_oam_add_front - field only: in front of every native sprite. Staged
;                        (max 16); the commit shifts the native sprites up by
;                        a multiple of 4 slots. Carry set when it cannot fit.
;   core_oam_hide      - A = slot: hide it (X=$FF, Y=$E0).
; !core_oam_native = first slot after this frame's native sprites (before the
; front shift) so modules can inspect or modify native entries [0, native).
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
	LDY.w !core_oam_world_hw&$FFFF
	JSR core_oam_hide_range
	LDA.w #!CORE_WORLD_FIRST*4
	STA.w !core_oam_cursor&$FFFF
	STA.w !core_oam_world_hw&$FFFF
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
+	LDY.w !core_oam_world_hw&$FFFF
	JSR core_oam_hide_range
	STZ.w !core_oam_world_hw&$FFFF
	BRA .store
.notWorld
	CMP.w #!CORE_MODE_FIELD
	BNE .store
	LDA $01,S
	CMP.w #!CORE_MODE_WORLD
	BNE .store
	; Field -> world: world natives own 0-83; hide field module slots >= 84.
	LDX.w #!CORE_WORLD_NATIVE_END*4
	LDY.w !core_oam_field_hw&$FFFF
	JSR core_oam_hide_range
.store
	PLA
	STA.w !core_mode&$FFFF
	RTS

; Hide byte offsets [X, Y) (multiples of 4) and clear their high bits.
core_oam_hide_range:
	STY.w !core_tmp0&$FFFF
.loop
	CPX.w !core_tmp0&$FFFF
	BCS .done
	CPX.w #$0200
	BCS .done
	LDA.w #$E0FF
	STA.w $0800,X
	PHX
	TXA : LSR : LSR : TAY
	LDA.w #$0000
	JSR core_oam_set_hi
	PLX
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

; Hide slot A16 (0-127).
core_oam_hide:
	AND.w #$007F
	ASL : ASL : TAX
	LDA.w #$E0FF
	STA.w $0800,X
	RTL

; Field commit: insert staged front sprites, record the new end so the
; game's next C0:BCAB hides our slots.
core_oam_commit_field:
	LDA.w !core_oam_front_n&$FFFF
	BNE .front
	JMP .done
.front
	CLC : ADC.w #$0003 : AND.w #$FFFC
	STA.w !core_tmp2&$FFFF            ; G = reserved slots (multiple of 4)
	; Low table: [0, cursor) -> [4G, cursor + 4G)
	LDA.w !core_oam_cursor&$FFFF
	BEQ .lowDone
	LDA.w !core_tmp2&$FFFF
	ASL : ASL
	STA.w !core_tmp1&$FFFF            ; 4G bytes
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
	; Account for the shift.
	LDA.w !core_tmp2&$FFFF
	ASL : ASL
	CLC : ADC.w !core_oam_cursor&$FFFF
	STA.w !core_oam_cursor&$FFFF
	STZ.w !core_oam_front_n&$FFFF
.done
	LDA.w !core_oam_cursor&$FFFF
	STA.w $0120                       ; next frame's C0:BCAB hides up to here
	STA.w !core_oam_field_hw&$FFFF
	RTS

; World commit: remember what to hide next frame.
core_oam_commit_world:
	LDA.w !core_oam_cursor&$FFFF
	STA.w !core_oam_world_hw&$FFFF
	RTS
