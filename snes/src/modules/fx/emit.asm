; Sprite emission inside fx_frame (direct-page frame, module.asm): an
; assembly's distinct cells are resolved once (VRAM cache + palette class),
; then its parts are placed straight after the core's OAM cursor.
; M16/X16, DB = $7E.

; fx_stamp: A = stamp group (FX_SG_*), X = frame (wrapped by the group's
; frame count, as the browser's stamp()), Y = quarter turn 0-3. Anchor
; !d_x/!d_y, depth !d_ef.
fx_stamp:
	PHY                          ; turn
	PHX                          ; frame
	TAX
	LDA.l fx_stamp_frames,X
	AND.w #$00FF
	STA !d_tmp
	TXA
	ASL
	TAX
	LDA.l fx_stamp_base,X
	STA !d_tmp+2
	PLA
	BPL .mod
	LDA.w #$0000
.mod
	CMP !d_tmp
	BCC +
	SBC !d_tmp
	BRA .mod
+	ASL
	ASL
	CLC
	ADC !d_tmp+2
	CLC
	ADC $01,S
	PLY
	; fall through

; fx_emit: A = assembly id, drawn at !d_x/!d_y with !d_ef.
fx_emit:
	JSR fx_emit_setup
	BCC fx_emit_place
	RTS

; Resolve assembly A's cells into four pre-flipped OAM words each
; (!d_tiles), remember where its parts are. C set when it has no parts.
; Record: parts, cells, bbox (min x, min y, max x, max y), cell words,
; parts of 3 bytes (x+128, y+128, cell*8 | v*4 | h*2).
fx_emit_setup:
	ASL
	TAX
	LDA.l fx_asm_ptr,X
	STA !d_pofs
	CLC
	ADC.w #fx_asm_data&$FFFF
	STA !d_ptr
	SEP #$20
	LDA.b #fx_asm_data>>16
	STA !d_ptr+2
	REP #$20
	LDA [!d_ptr]                 ; parts | cells << 8
	AND.w #$00FF
	BNE +
	SEC
	RTS
+	STA !d_np
	LDA [!d_ptr]
	XBA
	AND.w #$00FF
	STA !d_nc
	LDY.w #$0006
	LDX.w #$0000
.cell
	LDA [!d_ptr],Y
	PHY
	PHX
	JSR fx_resolve               ; A = OAM word, $FFFF when unavailable
	PLX
	PLY
	STA !d_tiles,X
	BMI .missing
	ORA.w #$4000
	STA !d_tiles+2,X             ; h-flip
	EOR.w #$C000
	STA !d_tiles+4,X             ; v-flip
	ORA.w #$4000
	STA !d_tiles+6,X             ; both
	BRA .next
.missing
	STA !d_tiles+2,X
	STA !d_tiles+4,X
	STA !d_tiles+6,X
.next
	INY
	INY
	TXA
	CLC
	ADC.w #8
	TAX
	DEC !d_nc
	BNE .cell
	TYA
	CLC
	ADC !d_pofs
	STA !d_pofs                  ; first part
	CLC
	RTS

; Place the set-up assembly at !d_x/!d_y. A fully visible assembly drawn
; behind the natives in the field takes the fast path: one 16-bit add gives
; (y << 8) | x exactly when every part is inside the screen.
fx_emit_place:
	LDA !d_ef
	ORA !d_size
	BNE .slow
	LDY.w #$0002
	LDA [!d_ptr],Y               ; min x | min y << 8
	TAX
	AND.w #$00FF
	EOR.w #$0080
	SEC
	SBC.w #$0080
	CLC
	ADC !d_x
	BMI .slow
	TXA
	XBA
	AND.w #$00FF
	EOR.w #$0080
	SEC
	SBC.w #$0080
	CLC
	ADC !d_y
	BMI .slow
	LDY.w #$0004
	LDA [!d_ptr],Y               ; max x | max y << 8
	TAX
	AND.w #$00FF
	EOR.w #$0080
	SEC
	SBC.w #$0080
	CLC
	ADC !d_x
	CMP.w #256
	BCS .slow
	TXA
	XBA
	AND.w #$00FF
	EOR.w #$0080
	SEC
	SBC.w #$0080
	CLC
	ADC !d_y
	CMP.w #224
	BCC .fast
.slow
	JMP fx_emit_slow
.fast
	LDA !d_y                     ; K = ((y - 128) << 8) + (x - 128)
	SEC
	SBC.w #128
	XBA
	AND.w #$FF00
	STA !d_k
	LDA !d_x
	SEC
	SBC.w #128
	CLC
	ADC !d_k
	STA !d_k
	LDA !d_end                   ; parts that fit
	SEC
	SBC.w !core_oam_cursor&$FFFF
	BCC .full
	BEQ .full
	LSR
	LSR
	CMP !d_np
	BCC +
	LDA !d_np
+	STA !d_n
	LDX !d_pofs
	LDY.w !core_oam_cursor&$FFFF
.fpart
	LDA.l fx_asm_data,X          ; x+128 | (y+128) << 8
	CLC
	ADC !d_k
	STA.w $0800,Y
	LDA.l fx_asm_data+2,X        ; cell*8 | flips
	AND.w #$00FF
	PHX
	TAX
	LDA !d_tiles,X
	PLX
	BMI .fmiss
	STA.w $0802,Y
	INY
	INY
	INY
	INY
.fnext
	INX
	INX
	INX
	DEC !d_n
	BNE .fpart
	TYA
	STA.w !core_oam_cursor&$FFFF
.full
	RTS
.fmiss
	LDA.w #$E0FF                 ; cell not resident: keep the slot hidden
	STA.w $0800,Y
	BRA .fnext

; fx_emit_run: the set-up assembly placed A times, first at !d_x/!d_y,
; then every 16 px along the direction registers (beam strips). The
; bounding box is checked once: placements whose along-the-beam coordinate
; keeps the whole assembly on screen take the fast path (K steps by 16 or
; 16 * 256; one-part assemblies reuse a precomputed OAM word), the ones
; crossing a screen edge take the per-part path, and the run stops once it
; has left the screen.
;   !d_tmp count, +2 lo, +4 hi (along), +6 K step; !d_r0 along value,
;   +2 along step, +4 part word, +6 OAM word (one-part assemblies)
fx_emit_run:
	STA !d_tmp
	LDA !d_ef
	ORA !d_size
	BEQ +
	JMP .allSlow
+	LDA !d_dy
	BNE .vertical
	LDA !d_x
	STA !d_r0                    ; along = x
	LDA !d_dx
	ASL
	ASL
	ASL
	ASL
	STA !d_r0+2                  ; along step
	STA !d_tmp+6                 ; K step +-16
	LDY.w #$0003                 ; across = y: min y / max y must fit
	LDA [!d_ptr],Y
	JSR .sext
	CLC
	ADC !d_y
	BPL +
	JMP .allSlow
+	LDY.w #$0005
	LDA [!d_ptr],Y
	JSR .sext
	CLC
	ADC !d_y
	CMP.w #224
	BCC +
	JMP .allSlow
+	LDY.w #$0002                 ; along range: x in [-min x, 255 - max x]
	BRA .range
.vertical
	LDA !d_y
	STA !d_r0                    ; along = y
	LDA !d_dy
	ASL
	ASL
	ASL
	ASL
	STA !d_r0+2
	XBA
	AND.w #$FF00
	STA !d_tmp+6                 ; K step +-16 * 256
	LDY.w #$0002                 ; across = x
	LDA [!d_ptr],Y
	JSR .sext
	CLC
	ADC !d_x
	BPL +
	JMP .allSlow
+	LDY.w #$0004
	LDA [!d_ptr],Y
	JSR .sext
	CLC
	ADC !d_x
	CMP.w #256
	BCC +
	JMP .allSlow
+	LDY.w #$0003                 ; along range: y in [-min y, 223 - max y]
	LDA [!d_ptr],Y
	JSR .sext
	EOR.w #$FFFF
	INC
	STA !d_tmp+2
	LDY.w #$0005
	LDA [!d_ptr],Y
	JSR .sext
	EOR.w #$FFFF
	SEC
	ADC.w #223
	STA !d_tmp+4
	BRA .kinit
.range
	LDA [!d_ptr],Y               ; Y = 2: min x
	JSR .sext
	EOR.w #$FFFF
	INC
	STA !d_tmp+2
	LDY.w #$0004
	LDA [!d_ptr],Y
	JSR .sext
	EOR.w #$FFFF
	SEC
	ADC.w #255
	STA !d_tmp+4
.kinit
	LDA !d_y                     ; K = ((y - 128) << 8) + (x - 128)
	SEC
	SBC.w #128
	XBA
	AND.w #$FF00
	STA !d_k
	LDA !d_x
	SEC
	SBC.w #128
	CLC
	ADC !d_k
	STA !d_k
	LDA !d_np                    ; one part: precompute its words
	CMP.w #1
	BNE .loop
	LDX !d_pofs
	LDA.l fx_asm_data,X
	STA !d_r0+4
	LDA.l fx_asm_data+2,X
	AND.w #$00FF
	TAX
	LDA !d_tiles,X
	STA !d_r0+6
.loop
	LDA !d_r0                    ; along coordinate inside the fast range?
	CMP !d_tmp+2
	BMI .edge
	CMP !d_tmp+4
	BEQ .inside
	BPL .edge
.inside
	LDY.w !core_oam_cursor&$FFFF
	LDA !d_np
	CMP.w #1
	BNE .multi
	CPY !d_end
	BCS .step                    ; the module area is full
	LDA !d_r0+6
	BMI .step                    ; cell not resident
	STA.w $0802,Y
	LDA !d_r0+4
	CLC
	ADC !d_k
	STA.w $0800,Y
	TYA
	CLC
	ADC.w #4
	STA.w !core_oam_cursor&$FFFF
	BRA .step
.multi
	STA !d_n
	LDX !d_pofs
.part
	CPY !d_end
	BCS .stored
	LDA.l fx_asm_data+2,X
	AND.w #$00FF
	PHX
	TAX
	LDA !d_tiles,X
	PLX
	BMI .pnext
	STA.w $0802,Y
	LDA.l fx_asm_data,X
	CLC
	ADC !d_k
	STA.w $0800,Y
	INY
	INY
	INY
	INY
.pnext
	INX
	INX
	INX
	DEC !d_n
	BNE .part
.stored
	TYA
	STA.w !core_oam_cursor&$FFFF
	BRA .step
.edge
	; Off the fast range: stop once the run has left the screen for good,
	; else draw this placement with the per-part path.
	LDA !d_r0+2
	BMI +
	LDA !d_r0
	CMP.w #272
	BPL .done                    ; moving right / down, past the edge
	BRA ++
+	LDA !d_r0
	CMP.w #-144
	BMI .done                    ; moving left / up, past the edge
++	JSR fx_emit_slow
.step
	LDA !d_dx                    ; next placement
	ASL
	ASL
	ASL
	ASL
	CLC
	ADC !d_x
	STA !d_x
	LDA !d_dy
	ASL
	ASL
	ASL
	ASL
	CLC
	ADC !d_y
	STA !d_y
	LDA !d_r0
	CLC
	ADC !d_r0+2
	STA !d_r0
	LDA !d_k
	CLC
	ADC !d_tmp+6
	STA !d_k
	DEC !d_tmp
	BEQ .done
	JMP .loop
.done
	RTS
.allSlow
	JSR fx_emit_slow
	LDA !d_dx
	ASL
	ASL
	ASL
	ASL
	CLC
	ADC !d_x
	STA !d_x
	LDA !d_dy
	ASL
	ASL
	ASL
	ASL
	CLC
	ADC !d_y
	STA !d_y
	DEC !d_tmp
	BNE .allSlow
	RTS
.sext                            ; low byte of A as a signed value
	AND.w #$00FF
	EOR.w #$0080
	SEC
	SBC.w #$0080
	RTS

; Per-part path: culls each part, sets the high-table bits, and handles
; front sprites and world flight's large size.
fx_emit_slow:
	LDA !d_x                     ; offsets are +128; +15 folds in the cull
	SEC
	SBC.w #128-15
	STA !d_ax
	LDA !d_y
	SEC
	SBC.w #128-15
	STA !d_ay
	LDA !d_np
	STA !d_n
	LDX !d_pofs
.part
	LDA.l fx_asm_data,X          ; x+128 | (y+128) << 8
	TAY
	AND.w #$00FF
	CLC
	ADC !d_ax                    ; x + 15
	CMP.w #256+15
	BCS .skip                    ; off screen
	SBC.w #14                    ; C clear: x
	STA !d_sx
	TYA
	XBA
	AND.w #$00FF
	CLC
	ADC !d_ay
	CMP.w #224+15
	BCS .skip
	SBC.w #14
	STA !d_sy
	LDA.l fx_asm_data+2,X        ; cell*8 | flips
	AND.w #$00FF
	PHX
	TAX
	LDA !d_tiles,X
	PLX
	BMI .skip                    ; cell not resident and no upload room
	STA !d_tile
	PHX
	LDA !d_ef
	LSR
	BCS .front
.back
	LDX.w !core_oam_cursor&$FFFF
	CPX !d_end
	BCS .done                    ; the module area is full
	SEP #$20
	LDA !d_sx
	STA.w $0800,X
	LDA !d_sy
	STA.w $0801,X
	REP #$20
	LDA !d_tile
	STA.w $0802,X
	LDA !d_sx
	BMI .hi
	LDA !d_size
	BEQ .placed
.hi
	JSR fx_hibits
.placed
	TXA
	CLC
	ADC.w #4
	STA.w !core_oam_cursor&$FFFF
.done
	PLX
.skip
	INX
	INX
	INX
	DEC !d_n
	BEQ +
	JMP .part
+	RTS
.front
	; Staged in the core's front list exactly as core_oam_add_front does
	; (same room rule); the core commit moves them before the natives.
	LDA.l !fx_front
	CMP.w #!FX_FRONT_MAX
	BCS .back
	LDA.w !core_oam_front_n&$FFFF
	CMP.w #16
	BCS .back
	INC
	CLC
	ADC.w #3
	AND.w #$FFFC
	ASL
	ASL
	CLC
	ADC.w !core_oam_cursor&$FFFF
	CMP.w !core_oam_limit&$FFFF
	BEQ +
	BCS .back
+	LDA.w !core_oam_front_n&$FFFF
	ASL
	ASL
	TAX
	SEP #$20
	LDA !d_sx
	STA.w !core_oam_front&$FFFF,X
	LDA !d_sy
	STA.w (!core_oam_front&$FFFF)+1,X
	REP #$20
	LDA !d_tile
	STA.w (!core_oam_front&$FFFF)+2,X
	TXA
	LSR
	TAX
	LDA !d_sx                    ; high bits: X bit 8 | size
	ASL
	LDA !d_size
	ADC.w #$0000
	STA.w !core_oam_front_hi&$FFFF,X
	INC.w !core_oam_front_n&$FFFF
	LDA.l !fx_front
	INC
	STA.l !fx_front
	LDA.w !core_oam_front_n&$FFFF
	AND.w #$0003
	CMP.w #1
	BNE .done
	JSR fx_oam_limit             ; a new group of four front slots is reserved
	BRA .done

; OR the high-table bits of OAM offset X: X bit 8 when x < 0, size bit in
; world flight. Preserves X and Y.
fx_hibits:
	PHX
	LDA !d_sx
	ASL                          ; C = x < 0
	LDA !d_size
	ADC.w #$0000                 ; v = xhi | size
	ASL
	ASL
	STA !d_tmp+2
	TXA
	LSR
	LSR
	AND.w #$0003
	ORA !d_tmp+2
	TAX
	LDA.l fx_hiv,X
	AND.w #$00FF
	STA !d_tmp+2
	LDA $01,S
	LSR
	LSR
	LSR
	LSR
	TAX
	SEP #$20
	LDA.w $0A00,X
	ORA !d_tmp+2
	STA.w $0A00,X
	REP #$20
	PLX
	RTS

; High-table bits: [v*4 + slot&3] = v << 2*(slot&3), v = xhi | size<<1.
fx_hiv:
	db $00,$00,$00,$00, $01,$04,$10,$40, $02,$08,$20,$80, $03,$0C,$30,$C0

; Back sprites go straight after the core's OAM cursor, exactly as
; core_oam_add places them (same room rule: cursor + 4 + the staged front
; group <= limit; the game clears the high table each frame, so only set
; bits are ORed in). !d_end = first cursor value without room.
fx_oam_limit:
	LDA.w !core_oam_front_n&$FFFF
	CLC
	ADC.w #3
	AND.w #$FFFC
	ASL
	ASL
	CLC
	ADC.w #3
	EOR.w #$FFFF
	SEC
	ADC.w !core_oam_limit&$FFFF  ; limit - reserve - 3
	BPL +
	LDA.w #$0000
+	STA !d_end
	RTS

; Cell word A (cell | class << 9) -> OAM word bits 0-13 (tile, palette,
; priority 3), or $FFFF when the cell cannot be shown this frame.
fx_resolve:
	AND.w #$0FFF
	CMP !d_lastc
	BNE +
	LDA !d_lasto
	RTS
+	STA !d_lastc
	JSR fx_cache_get
	BCC +
	LDA.w #$FFFF
+	STA !d_lasto
	RTS

; VRAM cell cache. A = cell word -> C clear and A = OAM word; C set when the
; cell is not resident and cannot be uploaded this frame. Missing cells
; take a free entry or the least recently drawn one (never one drawn this
; frame); at most !fx_cbudget new cells per frame.
fx_cache_get:
	STA !d_tmp+4                 ; cell word
	AND.w #$01FF
	STA !d_tmp                   ; cell id
	JSR fx_rbit                  ; X = byte, A = bit
	AND.l !fx_rbits,X
	AND.w #$00FF
	BNE +
	JMP .miss                    ; not resident: nothing to search
+	LDA !d_tmp
	AND.w #$001F
	TAX
	LDA.l !fx_hash,X
	AND.w #$00FF
	CMP.w #30
	BCS .scan
	TAX
	LDA.l !fx_ccell,X
	CMP !d_tmp
	BEQ .hit
.scan
	LDA !d_tmp
	LDX.w #$0000
-	CMP.l !fx_ccell,X
	BEQ .found
	INX
	INX
	CPX.w #30
	BCC -
	JMP .miss
.found
	PHX                          ; remember the entry for this cell's bucket
	LDA !d_tmp
	AND.w #$001F
	TAX
	PLA
	SEP #$20
	STA.l !fx_hash,X
	REP #$20
	TAX
.hit
	LDA.l fx_entry_bit,X         ; an upload that slipped: not drawn until it lands
	AND.l !fx_cfail
	BEQ +
	JMP .fail
+	LDA.l !fx_frame
	STA.l !fx_cused,X
	LDA.l fx_entry_tile,X
	STA !d_tmp+2
	LDA !d_white
	BEQ +
	LDA.w #!FX_CLASS_WHITE
	BRA ++
+	LDA !d_tmp+4                 ; class = cell word >> 9
	XBA
	LSR
	AND.w #$0007
++	JSR fx_class_pal
	BCS .fail
	XBA
	ASL                          ; palette << 9
	ORA !d_tmp+2
	ORA.w #$3000                 ; priority 3
	CLC
	RTS
.fail
	SEC
	RTS
.miss
	LDA.l !fx_cbudget
	BEQ .fail
	; One pass: the first free entry wins, else the least recently drawn
	; usable entry that was not drawn this frame.
	STZ !d_tmp+2                 ; oldest age seen
	LDY.w #$FFFF
	LDX.w #$0000
.scanFree
	LDA.l !fx_ccell,X
	CMP.w #$FFFE
	BEQ .nextFree                ; region not ours
	BCS .take                    ; $FFFF: free
	LDA.l !fx_frame
	SEC
	SBC.l !fx_cused,X
	BEQ .nextFree                ; drawn this frame
	CMP !d_tmp+2
	BCC .nextFree
	STA !d_tmp+2
	TXY
.nextFree
	INX
	INX
	CPX.w #30
	BCC .scanFree
	CPY.w #$FFFF
	BEQ .fail
	TYX
.take
	PHX
	LDA.l !fx_ccell,X            ; the evicted cell is no longer resident
	CMP.w #$01FF+1
	BCS +
	JSR fx_rbit
	EOR.w #$FFFF
	AND.l !fx_rbits,X
	SEP #$20
	STA.l !fx_rbits,X
	REP #$20
+	LDA !d_tmp
	JSR fx_rbit
	ORA.l !fx_rbits,X
	SEP #$20
	STA.l !fx_rbits,X
	REP #$20
	PLX
	LDA !d_tmp
	STA.l !fx_ccell,X
	LDA.l fx_entry_bit,X
	ORA.l !fx_cpend
	STA.l !fx_cpend
	LDA.l !fx_cbudget
	DEC
	STA.l !fx_cbudget
	JMP .found

; Cell id A -> X = byte offset in !fx_rbits, A = its bit. Preserves Y.
fx_rbit:
	PHA
	AND.w #$0007
	TAX
	LDA.l fx_bit8,X
	AND.w #$00FF
	STA !d_tmp+6
	PLA
	LSR
	LSR
	LSR
	TAX
	LDA !d_tmp+6
	RTS
fx_bit8:
	db $01,$02,$04,$08,$10,$20,$40,$80

; Palette class A -> OBJ palette (C clear), assigned on first use in the
; frame from the palettes no other sprite uses, preferring 3/2 (never in
; OBJ colour math), then 7, 6, 5, 4. C set when none is free.
fx_class_pal:
	TAX
	LDA.l !fx_clspal,X
	AND.w #$00FF
	CMP.w #$00FF
	BEQ .assign
	CLC
	RTS
.assign
	PHX
	LDX.w #$0000
.try
	LDA.l fx_pal_pref_bit,X
	AND.l !fx_palfree
	BNE .got
	INX
	INX
	CPX.w #12
	BCC .try
	PLX
	SEC
	RTS
.got
	EOR.l !fx_palfree
	STA.l !fx_palfree
	LDA.l fx_pal_pref_num,X
	PLX
	SEP #$20
	STA.l !fx_clspal,X
	REP #$20
	AND.w #$00FF
	CLC
	RTS

fx_pal_pref_bit:
	dw $08, $04, $80, $40, $20, $10
fx_pal_pref_num:
	dw 3, 2, 7, 6, 5, 4

; Cache entries: OBJ tile of each 16x16 cell (field regions A, B, C), its
; VRAM word address and pending bit.
fx_entry_tile:
	dw $122, $124, $126, $128, $12A, $12C, $12E
	dw $184, $186, $188, $18A
	dw $1A8, $1AA, $1AC, $1AE, $000
fx_entry_vram:
	dw $7220, $7240, $7260, $7280, $72A0, $72C0, $72E0
	dw $7840, $7860, $7880, $78A0
	dw $7A80, $7AA0, $7AC0, $7AE0, $0000
fx_entry_bit:
	dw $0001, $0002, $0004, $0008, $0010, $0020, $0040, $0080
	dw $0100, $0200, $0400, $0800, $1000, $2000, $4000, $8000

; Anchor at the current effect plus (X, Y).
fx_at:
	TXA
	CLC
	ADC !d_cur+!C_X
	STA !d_x
	TYA
	CLC
	ADC !d_cur+!C_Y
	STA !d_y
	RTS

; Depth: A = !FX_E_FRONT for kinds drawn in front by default, else 0;
; FX_F_FRONT / FX_F_BACK override.
fx_depth:
	STA !d_ef
	LDA !d_cur+!C_KIND
	BIT.w #!FX_F_FRONT<<8
	BEQ +
	LDA.w #!FX_E_FRONT
	STA !d_ef
	LDA !d_cur+!C_KIND
+	BIT.w #!FX_F_BACK<<8
	BEQ +
	STZ !d_ef
+	RTS

; Effects aimed up draw behind the native sprites (the browser's behindBody).
fx_depth_up:
	LDA !d_cur+!C_DIR
	AND.w #$0003
	CMP.w #3
	BNE +
	LDA !d_cur+!C_KIND
	BIT.w #!FX_F_HEADING<<8
	BNE +
	STZ !d_ef
+	RTS

; Direction registers from facing A: unit vector and quarter turn.
fx_set_dir:
	AND.w #$0003
	ASL
	TAX
	LDA.l fx_dir_dx,X
	STA !d_dx
	LDA.l fx_dir_dy,X
	STA !d_dy
	LDA.l fx_dir_turn,X
	STA !d_turn
	RTS

; A = distance d -> X = dx*d, Y = dy*d (direction registers). Preserves A.
fx_scale_dir:
	PHA
	LDA !d_dx
	BEQ .x0
	BMI .xn
	LDA $01,S
	BRA .xs
.xn
	LDA.w #$0000
	SEC
	SBC $01,S
	BRA .xs
.x0
	LDA.w #$0000
.xs
	TAX
	LDA !d_dy
	BEQ .y0
	BMI .yn
	LDA $01,S
	BRA .ys
.yn
	LDA.w #$0000
	SEC
	SBC $01,S
	BRA .ys
.y0
	LDA.w #$0000
.ys
	TAY
	PLA
	RTS

; Stamp group variants by flags: A = base FX_G_* group -> stamp group.
fx_variant:
	PHA
	LDA !d_cur+!C_KIND
	BIT.w #!FX_F_PINK<<8
	BNE .pink
	BIT.w #!FX_F_GOLD<<8
	BNE .gold
	PLA
	RTS
.gold
	PLA
	ASL
	TAX
	LDA.l fx_gold_group,X
	RTS
.pink
	PLA
	ASL
	TAX
	LDA.l fx_pink_group,X
	RTS
fx_gold_group:   ; orb, body, head, impact, lightning, limpact, gspark, garc, aarc
	dw !FX_SG_GOLD_CHARGE_ORB, !FX_SG_GOLD_BEAM_BODY, !FX_SG_GOLD_BEAM_HEAD, !FX_SG_GOLD_SPARK
	dw !FX_SG_LIGHTNING, !FX_SG_LIGHTNING_IMPACT, !FX_SG_GOLD_SPARK, !FX_SG_GOLD_ARC, !FX_SG_GOLD_ARC
fx_pink_group:
	dw !FX_SG_PINK_CHARGE_ORB, !FX_SG_PINK_BEAM_BODY, !FX_SG_PINK_BEAM_HEAD, !FX_SG_PINK_IMPACT_SPARK
	dw !FX_SG_PINK_LIGHTNING, !FX_SG_LIGHTNING_IMPACT, !FX_SG_GOLD_SPARK, !FX_SG_GOLD_ARC, !FX_SG_AURA_ARC

; fx_emit_group: A = detonation frame (0 - FX_DET_FRAMES-1), anchor
; !d_x/!d_y. Entries: assembly | white << 15, x, y (words).
fx_emit_group:
	ASL
	TAX
	LDA.l fx_det_ptr,X
	TAX
	LDA.l fx_det_data,X
	AND.w #$00FF
	BNE +
	RTS
+	PHA                          ; entries left
	INX
.entry
	PHX
	LDA !d_x
	PHA
	LDA !d_y
	PHA
	LDA.l fx_det_data,X          ; white flag: all-white palette
	AND.w #$8000
	CMP !d_white
	BEQ +
	STA !d_white
	LDA.w #$FFFF
	STA !d_lastc
+	LDA.l fx_det_data+2,X
	CLC
	ADC !d_x
	STA !d_x
	LDA.l fx_det_data+4,X
	CLC
	ADC !d_y
	STA !d_y
	LDA.l fx_det_data,X
	AND.w #$7FFF
	JSR fx_emit
	PLA
	STA !d_y
	PLA
	STA !d_x
	PLA
	CLC
	ADC.w #6
	TAX
	LDA $01,S
	DEC
	STA $01,S
	BNE .entry
	PLA
	STZ !d_white
	LDA.w #$FFFF
	STA !d_lastc
	RTS
