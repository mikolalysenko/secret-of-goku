; Palette substitution. The boy's OBJ palette is palette 1 on ordinary maps
; and palette 5 (the colour-math copy) on water maps such as the waterfall;
; his body descriptor says which ($E093 bits 1-3). It lives in the game's
; CGRAM buffer at $7E:0600, uploaded by the field NMI. Each frame we absorb
; whatever the game wrote to that palette (per entry, so partial writes are
; followed), then write Goku's colours:
;   - the boy's base palette  -> Goku's palette for the displayed cell
;   - petrify ($E190 & $40)   -> Goku's colours mapped onto the stone ramp
;   - any other change (poison, flash, ghost...) -> the per-entry difference
;     from the boy's base palette, applied to Goku's matching colours
; (engine/sprite-layer.js tint()). Index 1 always keeps the game's value:
; it is every actor's shadow colour.

!PALBUF = $0600
!BOY_PALETTE = $C81EFE       ; original boy palette (16 words) in the cartridge

; modules_field_frame entry: M16 X16, DB = $7E, D = 0, after the frame's logic.
goku_frame:
	PHP
	JSR goku_ensure_init
	REP #$30
	SEP #$20
	STZ !shadow_hidden
	JSR goku_check_on
	LDA.b #$00
	ROL
	STA !replacing
	BEQ .off
	; the hero's OBJ cells (C0-C7/D0-D7) are ours while Goku stands in
	REP #$30
	LDA.w #!VRAM_FIELD_HERO
	LDX.w #!GOKU_OWNER
	JSL core_vram_claim
	JSR goku_palette
	JSR goku_palette_unflash
	SEP #$20
	; HUD portrait in the current form
	LDA !goku_form
	AND.b #$01
	INC
	CMP !hud_form
	BEQ .end
	LDA.b #!GOKU_UP_HUD
	TSB !up_flags
	BRA .end
.off
	LDA !was_replacing
	BEQ .end
	; replacement just ended: give the game its palette and tiles back
	JSR goku_palette_restore
	LDA.w #!VRAM_FIELD_HERO
	LDX.w #!GOKU_OWNER
	JSL core_vram_release
	SEP #$20
	LDA.b #!GOKU_UP_NATIVE
	TSB !up_flags
	STZ !hud_form
	REP #$20
	LDA.w #!GOKU_NONE
	STA !vram_cell
	STA !up_cell
.end
	SEP #$20
	LDA !replacing
	STA !was_replacing
	PLP
	RTL

; ---------------------------------------------------------------------------
; Track the boy's palette slot and substitute Goku's colours there.
goku_palette:
	SEP #$20
	; the boy's slot: palette 1 or 5 from his body descriptor
	LDA $E093
	LSR
	AND.b #$07
	CMP.b #1
	BEQ .slot
	CMP.b #5
	BEQ .slot
	LDA !pal_slot            ; another palette: keep the current slot
	BNE .slot
	LDA.b #1
.slot
	CMP !pal_slot
	BEQ .same
	PHA
	JSR goku_palette_restore ; give the previous slot back
	SEP #$20
	PLA
	STA !pal_slot
	STZ !pal_valid
.same
	; X = buffer offset of the slot (+$100 + slot*32)
	REP #$30
	LDA !pal_slot
	AND.w #$0007
	ASL
	ASL
	ASL
	ASL
	ASL
	CLC
	ADC.w #$0100
	STA !t_d
	; fast path: nothing to do while the slot still holds exactly what we
	; wrote, the displayed cell's palette and the petrify bit are unchanged
	LDA !pal_valid
	AND.w #$00FF
	BEQ .absorb
	SEP #$20
	LDA !cur_pal
	CMP !pal_id_out
	BNE .absorb8
	LDA $E190
	AND.b #$40
	CMP !pal_stone
	BNE .absorb8
	REP #$20
	LDA !t_d
	CLC
	ADC.w #!PALBUF+2
	TAX                      ; X -> slot entry 1
	LDY.w #$0002
.fast
	LDA $0000,X
	CMP !pal_out,Y
	BNE .absorb
	INX
	INX
	INY
	INY
	CPY.w #$0020
	BCC .fast
	RTS
.absorb8
	REP #$20
.absorb
	SEP #$20
	LDA $E190
	AND.b #$40
	STA !pal_stone
	REP #$20
	; absorb the game's writes into pal_native
	STZ !t_c                 ; changed flag
	LDY.w #$001E
.absorb_loop
	TYA
	CLC
	ADC !t_d
	TAX
	LDA !PALBUF,X
	PHA
	LDA !pal_valid
	AND.w #$00FF
	BEQ .take
	LDA $01,S
	CMP !pal_out,Y
	BEQ .keep
.take
	PLA
	STA !pal_native,Y
	INC !t_c
	BRA .absorb_next
.keep
	PLA
.absorb_next
	DEY
	DEY
	BNE .absorb_loop
	SEP #$20
	LDA.b #$01
	STA !pal_valid
	; status: 0 normal, 1 petrify, 2 tint
	LDA $E190
	AND.b #$40
	BEQ .not_stone
	LDA.b #1
	BRA .status
.not_stone
	REP #$20
	LDX.w #$001E
.cmp_boy
	LDA !pal_native,X
	CMP.l !BOY_PALETTE,X
	BNE .tinted
	DEX
	DEX
	BNE .cmp_boy
	SEP #$20
	LDA.b #0
	BRA .status
.tinted
	SEP #$20
	LDA.b #2
.status
	STA !t_b                 ; status
	; rebuild when anything changed
	LDA !t_c
	ORA !t_c+1
	BNE .rebuild
	LDA !t_b
	CMP !pal_status
	BNE .rebuild
	LDA !cur_pal
	CMP !pal_id_out
	BEQ .done
.rebuild
	LDA !t_b
	STA !pal_status
	LDA !cur_pal
	STA !pal_id_out
	JSR goku_palette_build
	; write the slot
	REP #$30
	LDY.w #$001E
.write
	TYA
	CLC
	ADC !t_d
	TAX
	LDA !pal_out,Y
	STA !PALBUF,X
	DEY
	DEY
	BNE .write
.done
	REP #$30
	RTS

; Build pal_out[1..15] for palette id pal_id_out and status pal_status.
; Keeps t_d.
goku_palette_build:
	REP #$30
	LDA !pal_id_out
	AND.w #$00FF
	ASL
	ASL
	ASL
	ASL
	STA !t_a                 ; palette id * 16 (byte tables)
	ASL
	STA !t_c                 ; palette id * 32 (colour table)
	LDA !pal_native+2
	STA !pal_out+2           ; index 1: the game's shadow colour
	LDA !pal_status
	AND.w #$00FF
	BEQ .normal
	CMP.w #1
	BEQ .stone
	JMP .tint
.normal
	LDA !t_c
	CLC
	ADC.w #4
	TAX
	LDY.w #$0004
.normal_loop
	LDA.l goku_palettes,X
	STA !pal_out,Y
	INX
	INX
	INY
	INY
	CPY.w #$0020
	BCC .normal_loop
	RTS
.stone
	; out[k] = native[ramp[shade[k]]], ramp = 1,6,5,4,3,2
	LDY.w #$0002             ; k = 2
.stone_loop
	TYA
	CLC
	ADC !t_a
	TAX
	LDA.l goku_tint_shade,X
	AND.w #$00FF
	TAX
	LDA.l goku_stone_ramp,X
	AND.w #$00FF
	ASL
	TAX
	LDA !pal_native,X
	PHA
	TYA
	ASL
	TAX
	PLA
	STA !pal_out,X
	INY
	CPY.w #$0010
	BCC .stone_loop
	RTS
.tint
	; out[k] = clamp(goku[k] + native[m] - boy[m]) per channel, m = map[k]
	LDY.w #$0002
.tint_loop
	TYA
	CLC
	ADC !t_a
	TAX
	LDA.l goku_tint_map,X
	AND.w #$00FF
	ASL
	STA !t_b                 ; m * 2
	TYA
	ASL
	CLC
	ADC !t_c
	TAX
	LDA.l goku_palettes,X
	STA !e_q                 ; goku colour (pal_work scratch)
	LDX !t_b
	LDA !pal_native,X
	STA !e_x                 ; native[m]
	LDA.l !BOY_PALETTE,X
	STA !e_y                 ; boy[m]
	; red
	LDA !e_q
	AND.w #$001F
	STA !e_tile
	LDA !e_x
	AND.w #$001F
	CLC
	ADC !e_tile
	STA !e_tile
	LDA !e_y
	AND.w #$001F
	STA !e_mask
	LDA !e_tile
	CLC
	ADC.w #32
	SEC
	SBC !e_mask
	JSR .clamp
	STA !e_attr
	; green
	LDA !e_q
	JSR .green
	STA !e_tile
	LDA !e_x
	JSR .green
	CLC
	ADC !e_tile
	STA !e_tile
	LDA !e_y
	JSR .green
	STA !e_mask
	LDA !e_tile
	CLC
	ADC.w #32
	SEC
	SBC !e_mask
	JSR .clamp
	ASL
	ASL
	ASL
	ASL
	ASL
	ORA !e_attr
	STA !e_attr
	; blue
	LDA !e_q
	JSR .blue
	STA !e_tile
	LDA !e_x
	JSR .blue
	CLC
	ADC !e_tile
	STA !e_tile
	LDA !e_y
	JSR .blue
	STA !e_mask
	LDA !e_tile
	CLC
	ADC.w #32
	SEC
	SBC !e_mask
	JSR .clamp
	XBA
	ASL
	ASL                      ; << 10
	ORA !e_attr
	PHA
	TYA
	ASL
	TAX
	PLA
	STA !pal_out,X
	INY
	CPY.w #$0010
	BCS .tint_done
	JMP .tint_loop
.tint_done
	RTS
; value + 32 -> clamp(value - 32, 0, 31)
.clamp
	SEC
	SBC.w #32
	BPL .clamp_hi
	LDA.w #0
	RTS
.clamp_hi
	CMP.w #32
	BCC .clamp_ok
	LDA.w #31
.clamp_ok
	RTS
.green
	LSR
	LSR
	LSR
	LSR
	LSR
	AND.w #$001F
	RTS
.blue
	XBA
	LSR
	LSR
	AND.w #$001F
	RTS

goku_stone_ramp:
	db 1,6,5,4,3,2

; Native flash: while $2A is set the field NMI uploads 7E:BE00, which the
; flash (C2:C820, in the frame logic before this hook) rebuilds from 0600
; every frame with a brightness offset (OBJ palettes too while bit 6 is
; set), Goku's slot included. On the field the browser's tint() follows that
; flash too, but its scene renderers (arrival.drawScene, the Frieza scenes)
; draw Goku unflashed: so while a scene shows an explicit cell
; (!goku_cell_req, e.g. the arrival's hop) his colours 2-15 go back into the
; BE00 copy of his slot. Entry 1 is every actor's shadow (and only 50 of
; Goku's ~159,000 pixels): it keeps the native flash. DB = $7E.
!PALFLASH = $BE00
goku_palette_unflash:
	SEP #$20
	LDA $2A
	BEQ .done
	LDA !pal_valid
	BEQ .done
	LDA !goku_cell_req
	ORA !goku_cell_req+1
	BEQ .done
	REP #$30
	LDA !pal_slot
	AND.w #$0007
	ASL
	ASL
	ASL
	ASL
	ASL
	CLC
	ADC.w #$0100
	STA !t_d
	LDY.w #$001E
.loop
	TYA
	CLC
	ADC !t_d
	TAX
	LDA !pal_out,Y
	STA !PALFLASH,X
	DEY
	DEY
	CPY.w #$0004
	BCS .loop
.done
	REP #$30
	RTS

; Give the tracked slot back: entries still holding our colours get the
; game's own values.
goku_palette_restore:
	REP #$30
	LDA !pal_valid
	AND.w #$00FF
	BEQ .done
	LDA !pal_slot
	AND.w #$0007
	ASL
	ASL
	ASL
	ASL
	ASL
	CLC
	ADC.w #$0100
	STA !t_d
	LDY.w #$001E
.loop
	TYA
	CLC
	ADC !t_d
	TAX
	LDA !PALBUF,X
	CMP !pal_out,Y
	BNE .next
	LDA !pal_native,Y
	STA !PALBUF,X
.next
	DEY
	DEY
	BNE .loop
	SEP #$20
	STZ !pal_valid
.done
	REP #$30
	RTS
