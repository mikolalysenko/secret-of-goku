; Body rendering: replaces the boy's OAM entries with Goku's 2x2 16x16 cell
; (or one 16x16 miniature) at the native renderer's anchor, priority and
; palette, in the boy's own OAM order.
;
; asar does not track REP/SEP: every immediate below carries .b or .w to
; match the M/X state at that point. Index registers are 16-bit throughout.

; C0:E5E0 hook (replaced REP #$20 / LDA $E083,X / AND #$000F / STA $02 /
; BEQ $E5DF). Entered from bank 00: M8 X16, X = actor offset, DB = $7E, D = 0.
goku_body_hook:
	CPX.w #$0000
	BNE .native
	JSR goku_render_boy
	BCS .done
	LDX.w #$0000
.native
	REP #$20
	LDA $E083,X
	AND.w #$000F
	STA $02
	BEQ .done
	JML $00E5EC
.done
	SEP #$20
	JML $00E5DF              ; RTS to the native caller

; C0:E760 hook (replaced SEP #$20 / LDY #$FFF8). Shadow of actor X.
goku_shadow_hook:
	SEP #$20
	CPX.w #$0000
	BNE .native
	LDA !shadow_hidden
	BEQ .native
	JML $00E76C              ; RTS: no shadow this frame
.native
	LDY.w #$FFF8
	JML $00E765

; Should Goku stand in for the boy right now? C set = yes. Preserves M/X;
; any DB (long addressing only).
goku_check_on:
	PHP
	SEP #$20
	LDA.l !persist_goku_active
	BEQ .no
	LDA.l $7E0000|!goku_ctl
	AND.b #!GOKU_CTL_SUPPRESS
	BNE .no
	; Snowman and moogle are shared native transformation sprites.
	LDA.l $7EE190
	AND.b #$20
	BNE .no
	LDA.l $7EE191
	AND.b #$10
	BNE .no
	PLP
	SEC
	RTS
.no
	PLP
	CLC
	RTS

; Render actor 0 as Goku. M8 X16 DB=$7E D=0. C set if handled (drawn or
; deliberately hidden), clear to let the native body draw.
goku_render_boy:
	JSR goku_ensure_init
	JSR goku_check_on
	BCS .on
	RTS
.on
	REP #$30
	LDA $E083
	AND.w #$000F
	BNE .body
	SEP #$20
	SEC                      ; the native body is absent: so is Goku
	RTS
.body
	PHX
	PHY
	JSR goku_pose            ; p_cell, p_flags, p_lift
	JSR goku_anchor          ; $04/$06 exactly as C0:E5F5 (incl. shake decay)
	SEP #$20
	LDA !goku_ctl
	AND.b #!GOKU_CTL_HIDE|!GOKU_CTL_HIDESHADOW
	STA !shadow_hidden
	LDA !p_flags
	AND.b #!GOKU_PF_HIDDEN
	TSB !shadow_hidden
	LDA !p_flags
	AND.b #!GOKU_PF_HIDDEN
	BNE .hidden
	LDA !goku_ctl
	AND.b #!GOKU_CTL_HIDE
	BNE .hidden
	JSR goku_request_cell
	JSR goku_emit
.hidden
	REP #$30
	PLY
	PLX
	SEP #$20
	SEC
	RTS

; C0:E5F5-E63E: $04 = screen X, $06 = screen Y - shadow height - lift, plus
; the timed shake in $E00D (decays by $10 per frame). Actor 0.
goku_anchor:
	REP #$30
	LDA $E020
	STA $04
	LDA $E074
	AND.w #$007F
	CLC
	ADC $E045
	EOR.w #$FFFF
	SEC
	ADC $E022
	STA $06
	SEP #$20
	LDA $E00D
	BEQ .done
	SEC
	SBC.b #$10
	STA $E00D
	BCS .shake
	LDA.b #$00
	STA $E00D
	BRA .done
.shake
	LSR
	BCC .noX
	PHA
	LDA $F4
	AND.b #$01
	ASL
	EOR $04
	STA $04
	PLA
.noX
	LSR
	BCC .done
	LDA $F4
	AND.b #$01
	ASL
	EOR $06
	STA $06
.done
	REP #$30
	RTS

; Write Goku's OAM entries. M16 X16 on exit.
; Full cell: 16x16 quadrants q0..q3 at (X-16,top),(X,top),(X-16,top+16),(X,top+16)
; with VRAM tiles C0/C2/C4/C6. top = feet - 31 - lift, feet = $06 + shadow height.
; Miniature (pygmy, species $F6): one 16x16 at (X-8, feet-15-lift), tile C0.
goku_emit:
	REP #$30
	LDA $E074
	AND.w #$007F
	CLC
	ADC $06
	SEC
	SBC !p_lift
	STA !e_feet              ; feet line minus extra lift
	LDA !p_flags
	AND.w #!GOKU_PF_SMALL
	BEQ .full
	; miniature
	LDA !e_feet
	SEC
	SBC.w #15
	STA !e_y
	CLC
	ADC.w #8
	JSR goku_part_attr
	XBA
	ORA.w #$00C0
	STA !e_tile
	LDA $04
	SEC
	SBC.w #8
	JMP goku_emit_at
.full
	LDX !p_cell
	LDA.l goku_cell_mask,X
	AND.w #$000F
	STA !e_mask
	LDA !e_feet
	SEC
	SBC.w #31
	STA !e_y                 ; top row
	; one attribute per 16-line row, from the native part covering its centre
	CLC
	ADC.w #24
	JSR goku_part_attr
	XBA
	ORA.w #$00C4
	STA !e_q                 ; bottom row: tile C4 | attr << 8
	LDA !e_y
	CLC
	ADC.w #8
	JSR goku_part_attr
	XBA
	ORA.w #$00C0
	STA !e_tile              ; top row: tile C0 | attr << 8
	LDA !e_mask
	LSR
	BCC .q1
	LDA $04
	SEC
	SBC.w #16
	JSR goku_emit_at
.q1
	INC !e_tile
	INC !e_tile              ; C2
	LDA !e_mask
	AND.w #$0002
	BEQ .bottom
	LDA $04
	JSR goku_emit_at
.bottom
	LDA !e_y
	CLC
	ADC.w #16
	STA !e_y
	LDA !e_q
	STA !e_tile              ; C4
	LDA !e_mask
	AND.w #$0004
	BEQ .q3
	LDA $04
	SEC
	SBC.w #16
	JSR goku_emit_at
.q3
	INC !e_tile
	INC !e_tile              ; C6
	LDA !e_mask
	AND.w #$0008
	BEQ .done
	LDA $04
	JMP goku_emit_at
.done
	RTS

; OAM attribute for a screen line (A16 in, A16 out = attribute byte):
; priority and palette of the boy's native body part covering that line
; (descriptor 0 otherwise), no flips, name select 1 (engine/sprite-layer.js
; inject(): per-line part). Airborne Goku uses priority 3 and drops the water
; palette. M16 X16; keeps e_* inputs.
goku_part_attr:
	SEC
	SBC $06                  ; line relative to the native anchor
	STA !t_b
	LDA $E083
	AND.w #$000F
	STA !t_c                 ; native part count
	LDY.w #$0000             ; descriptor offset
.scan
	LDA !t_c
	BEQ .default
	LDA $E091,Y              ; dy (signed byte)
	AND.w #$00FF
	CMP.w #$0080
	BCC .dypos
	ORA.w #$FF00
.dypos
	STA !t_d
	LDA !t_b
	SEC
	SBC !t_d
	CMP.w #16                ; 0 <= line - dy < 16 (unsigned compare)
	BCC .found
	INY
	INY
	INY
	INY
	DEC !t_c
	BRA .scan
.default
	LDY.w #$0000
.found
	LDA $E093,Y
	AND.w #$003E
	ORA.w #$0001
	SEP #$20
	PHA
	LDA !goku_ctl
	AND.b #!GOKU_CTL_AIRBORNE
	BEQ .ground
	PLA
	AND.b #$F7               ; palette 5 -> 1 (no water colour math)
	ORA.b #$30               ; priority 3
	BRA .done
.ground
	PLA
.done
	REP #$30
	AND.w #$00FF
	RTS

; One 16x16 OAM entry, mirroring C0:E640: A16 = x, e_y = y, e_tile = tile |
; attribute << 8. Skipped when the buffer is full or the entry is outside
; -16..223 / -16..255.
goku_emit_at:
	STA !e_x
	LDY $7C
	CPY.w #$0200
	BCS .skip
	CLC
	ADC.w #16
	CMP.w #$0110             ; -16 <= x < 256
	BCS .skip
	LDA !e_y
	CLC
	ADC.w #16
	CMP.w #$00F0             ; -16 <= y < 224
	BCS .skip
	LDA !e_tile
	STA $0802,Y              ; tile, attribute
	SEP #$20
	LDA !e_y
	STA $0801,Y
	LDA !e_x
	STA $0800,Y
	LDA !e_x+1
	BEQ .nomsb
	REP #$20
	LDA $5A
	AND.w #$00FF
	TAX
	SEP #$20
	LDA $0A00,X
	EOR $59
	STA $0A00,X
.nomsb
	REP #$20
	TYA
	CLC
	ADC.w #$0004
	STA $7C
	SEP #$20
	LDA $59
	ASL
	ASL
	BCC +
	INC $5A
	LDA.b #$01
+	STA $59
.skip
	REP #$30
	RTS
