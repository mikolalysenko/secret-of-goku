; Low-priority UI lease of cells unused by this frame's FX. Called AFTER
; fx_frame, DB=$7E, D=0, M16/X16. The caller uploads through core_queue_vram
; and does not draw a new cell until that queue drains. Native FX always
; allocates first; outstanding UI transfers pin their cells until completion.
fx_overlay_begin:
	JSR fx_ensure_init
	LDA.w $00DC
	CMP.l !fx_map
	BEQ +
	STA.l !fx_map
	JSR fx_reset_scene
+	LDA.w #!CORE_MODE_FIELD
	STA.l !fx_mode
	LDA.w #0
	STA.l !fx_idle
	LDA.l !fx_regions
	CMP.w #7
	BEQ +
	JSR fx_claim
+	LDA.w $0056                  ; FX may have idled this frame (native.asm)
	AND.w #$0007
	CMP.w #5
	BCC +
	LDA.w #0
+	JSR fx_native_drop
	JSR fx_native_mask           ; A = entries the game streams or shows
	RTL

; A = opaque key ($8000..$FFFD), X = allow a miss (0/1).
; C clear: A = OBJ tile, X = entry*2, Y = 0 resident / 1 newly leased.
; C set: no cell. New leases invalidate the old FX residency bit/hint.
fx_overlay_cell:
	STA.l !fx_e
	STX.w !core_scratch&$FFFF
	AND.w #!FX_HASH_SIZE-1
	TAX
	LDA.l !fx_hash,X
	AND.w #$00FF
	CMP.w #30
	BCS +
	TAX
	LDA.l !fx_ccell,X
	CMP.l !fx_e
	BNE +
	LDY.w #0
	JMP .stamp
+	LDA.l !fx_e
	LDX.w #0
.find
	CMP.l !fx_ccell,X
	BNE +
	JMP .hit
+
	INX : INX
	CPX.w #30
	BCC .find
	LDA.w !core_scratch&$FFFF
	BNE +
	JMP .fail
+
	JSR fx_native_mask           ; FX's pending uploads and the game's cells
	ORA.l !fx_cpend
	STA.l !fx_e+4
	LDY.w #$FFFF
	LDA.w #0
	STA.l !fx_e+2
	LDX.w #0
.search
	LDA.l fx_entry_bit,X
	AND.l !fx_e+4
	BNE .next
	LDA.l !fx_ccell,X
	CMP.w #$FFFE
	BEQ .next
	BCS .take
	CMP.w #$8000
	BCS +
	; Keep native FX's recently used cells warm, including intermittent
	; animation cells not referenced on this exact frame.
	LDA.l !fx_frame
	SEC : SBC.l !fx_cused,X
	CMP.w #120
	BCC .next
+	LDA.l !fx_frame
	SEC : SBC.l !fx_cused,X
	BEQ .next
	CMP.l !fx_e+2
	BCC .next
	STA.l !fx_e+2
	TXY
.next
	INX : INX
	CPX.w #30
	BCC .search
	CPY.w #$FFFF
	BNE +
	JMP .fail
+
	TYX
.take
	PHX
	LDA.l !fx_ccell,X
	CMP.w #512
	BCS +
	PHA
	SEP #$20
	LDA.l !fx_evict                   ; an FX cell leaves (fx_warm's callers look again)
	INC
	STA.l !fx_evict
	REP #$20
	PLA
+	CMP.w #!FX_RBITS_SIZE*8           ; UI keys and cells past the bitmap have no bit
	BCS .replace
	PHA
	AND.w #7
	TAX
	LDA.l fx_bit8,X
	AND.w #$00FF
	EOR.w #$FFFF
	STA.l !fx_e+2
	PLA
	LSR : LSR : LSR
	TAX
	LDA.l !fx_rbits,X
	AND.l !fx_e+2
	SEP #$20
	STA.l !fx_rbits,X
	REP #$20
.replace
	PLX
	LDA.l !fx_e
	STA.l !fx_ccell,X
	LDY.w #1
	BRA .hint
.hit
	LDY.w #0
.hint
	PHX
	LDA.w #1
	STA.l !fx_hash_dirty
	LDA.l !fx_e
	AND.w #!FX_HASH_SIZE-1
	TAX
	PLA
	SEP #$20
	STA.l !fx_hash,X
	REP #$20
	TAX
.stamp
	LDA.l !fx_frame
	STA.l !fx_cused,X
	LDA.l fx_entry_tile,X
	CLC
	RTL
.fail
	SEC
	RTL
