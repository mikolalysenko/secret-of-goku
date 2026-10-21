; sprite-layer.js / drawKiAura, height 32. All eight power levels and twelve
; phases are exact browser pixels. Sparse 8x8 OBJ share at most 31 tiles in
; the 32 spare tiles of world A; B/C remain with the radar and flyby.
; Combat is included after world: read its documented state by block offset.
!WORLD_CB = (!RAM_COMBAT&$FFFF)

; Called after the body and shadow, X = OAM byte cursor. No PPU writes.
world_aura_draw:
	PHX
	LDA.w !w_dock                   ; browser docking returns before its aura
	BEQ +
	PLX
	RTS
+	LDA.w !WORLD_CB+$0C             ; mod.frame: intentional 30 Hz strobe
	LSR
	BCC +
	PLX
	RTS
+	LDA.w !goku_act
	AND.w #$00FF
	CMP.w #!GOKU_K_FOCUS
	BEQ .focus
	CMP.w #!GOKU_K_TRANSFORM
	BEQ .transform
	CMP.w #!GOKU_K_REVERT
	BEQ .revert
	LDA.w !w_charging
	BEQ .none
	LDX.w !w_charge
	LDA.w !w_form
	BNE .ssjCharge
	CPX.w #90
	BCC +
	LDX.w #90
+	LDA.l world_aura_charge_base,X
	BRA .value
.ssjCharge
	CPX.w #45
	BCC +
	LDX.w #45
+	LDA.l world_aura_charge_ssj,X
	BRA .value
.focus
	LDX.w !WORLD_CB+$2E             ; powerCharge, 0..96
	CPX.w #96
	BCC +
	LDX.w #96
+	LDA.w !w_form
	XBA
	LSR
	ORA.l world_aura_focus,X
	BRA .value
.transform
	LDX.w !goku_act_age
	LDA.w !WORLD_CB+$18
	CMP.w #72
	BEQ +
	LDA.l world_aura_transform32,X
	BRA .value
+	LDA.l world_aura_transform72,X
	BRA .value
.revert
	LDX.w !goku_act_age
	LDA.w !WORLD_CB+$18
	CMP.w #10
	BEQ +
	LDA.l world_aura_revert20,X
	BRA .value
+	LDA.l world_aura_revert10,X
.value
	AND.w #$00FF
	CMP.w #$00FF                   ; zero-power tail of a reversion
	BNE +
.none
	PLX
	RTS
+	STA.w !w_scratch+14            ; level base | gold bit 7
	LDA.w !WORLD_CB+$0C
	LDX.w #3
	JSR world_div8
	LDX.w #12
	JSR world_mod                  ; floor(clock/3) % 12
	STA.w !w_scratch+6
	LDA.w !w_scratch+14
	AND.w #$007F
	CLC
	ADC.w !w_scratch+6
	TAX                            ; frame 0..95
	LDA.l world_aura_count,X
	AND.w #$00FF
	ASL : ASL
	CLC : ADC $01,S
	CMP.w #$00F1
	BCS .none                      ; never write beyond world's OAM run
	STA.w !w_scratch+6             ; end cursor
	TXA
	INC
	XBA
	ORA.w !w_pal_dirty
	ORA.w #$0004
	STA.w !w_pal_dirty             ; source id, consumed in this frame's NMI
	LDA.w !w_scratch+14
	AND.w #$0080
	LSR : LSR : LSR : LSR
	TSB.w !w_pal_dirty             ; gold selects palette 7's gold ramp
	TXA : ASL : TAX
	LDA.l world_aura_oam_offset,X
	TAX
	JSR world_goku_xy              ; banked, bobbing body origin
	LDA.w !w_scratch+2
	SEC : SBC.w #32
	XBA
	STA.w !w_scratch+8
	LDA.w !w_scratch
	SEC : SBC.w #8
	ORA.w !w_scratch+8
	STA.w !w_scratch+8             ; (centre.x-24) | (centre.y-48)<<8
	PLA
	STA.w !w_scratch+4
	TAY
.piece
	LDA.l !XDATA_WORLD_AURA_OAM,X
	CLC : ADC.w !w_scratch+8        ; no carry between x/y (whole flame on screen)
	STA.w $0800,Y
	LDA.l !XDATA_WORLD_AURA_OAM+2,X
	STA.w $0802,Y
	INX : INX : INX : INX
	INY : INY : INY : INY
	CPY.w !w_scratch+6
	BCC .piece
	; Aura is the last run: preserve preceding large sprites, then clear
	; size bits for its small sprites (unused slots may be small too).
	LDA.w !w_scratch+4
	AND.w #$000C
	LSR : TAX
	LDA.l .keep,X
	STA.w !w_scratch+10
	LDA.w !w_scratch+4
	LSR : LSR : LSR : LSR
	TAX
	SEP #$20
	LDA.w $0A00,X
	AND.w !w_scratch+10
	STA.w $0A00,X
.high
	INX
	CPX.w #15
	BCS +
	STZ.w $0A00,X
	BRA .high
+	REP #$20
	TYX
	RTS
.keep
	dw $0000,$0003,$000F,$003F

; Called only by the existing dirty-palette path. D=$4300, selected DMA
; channel/mask in w_scratch/+2. Upload before Goku's optional hidden cell.
; The world NMI has already uploaded this frame's OAM, so if the budget is
; unavailable hide the aura run in OAM instead of exposing stale tile art.
world_nmi_aura:
	JSL core_vblank_lines
	CMP.w #2                       ; even the OAM fallback must fit in vblank
	BCS +
	RTS
+
	CMP.w #12
	BCS .upload
	LDA.w !w_pal_dirty
	XBA : AND.w #$00FF : DEC : TAX
	LDA.l world_aura_count,X
	AND.w #$00FF
	ASL : ASL
	STA.w !w_scratch+4
	LDA.w !w_oam_used
	SEC : SBC.w !w_scratch+4
	LSR
	STA.l $002102                  ; address low + high (no priority rotation)
	LDX.w !w_scratch
	LDA.w #$0400
	STA $00,X
	LDA.w #world_aura_hidden
	STA $02,X
	LDA.w #world_aura_hidden>>16
	STA $04,X
	LDA.w !w_scratch+4
	STA $05,X
	JMP .send
.upload
	LDA.w !w_pal_dirty
	XBA : AND.w #$00FF : DEC
	ASL : ASL : TAX
	LDA.l world_aura_dma,X
	PHA
	LDA.l world_aura_dma+2,X
	LDX.w !w_scratch
	STA $04,X
	PLA
	STA $02,X
	LDA.w #$1801
	STA $00,X
	SEP #$20
	LDA.b #$80
	STA.l $002115
	REP #$20
macro world_aura_row(vram, bytes)
	LDA.w #<vram>
	STA.l $002116
	LDA.w #<bytes>
	STA $05,X
	JSR .send
endmacro
	%world_aura_row($6600,384)
	%world_aura_row($6700,384)
	%world_aura_row($66E0,64)
	%world_aura_row($67E0,64)
	%world_aura_row($6CE0,64)
	%world_aura_row($6DE0,64)
	; Palette 7 is unused by ordinary world art; the locked flyby borrows
	; it. Upload on every visible flame, so flyby/map returns need no cache.
	SEP #$20
	LDA.b #240
	STA.l $002121
	REP #$20
	LDA.w #$2200
	STA $00,X
	LDA.w !w_pal_dirty
	AND.w #$0008
	ASL : ASL
	CLC : ADC.w #world_aura_palette
	STA $02,X
	LDA.w #world_aura_palette>>16
	STA $04,X
	LDA.w #32
	STA $05,X
.send
	SEP #$20
	LDA.w !w_scratch+2
	STA.l $00420B
	REP #$20
	RTS
world_aura_hidden:
for i = 0..36
	db $00,$E0,$00,$00
endfor
