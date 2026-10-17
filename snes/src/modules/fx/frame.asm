; Per-frame driver: called last in modules_field_frame, after every client
; requested its effects. Entered M16/X16, DB = $7E, D = 0.

fx_frame:
	JSR fx_ensure_init
if defined("FX_TEST")
	JSR fx_test_frame
	JSR fx_test_vline
	STA.l !FXT_BOX+$A8           ; scanline when fx_frame started
endif
	PHD
	TSC
	SEC
	SBC.w #!FXF_SIZE
	TCS
	INC
	TCD                          ; D = frame on the stack
	LDA.w #$0000
	STA !d_size                  ; field OBJSEL $63: a 16x16 cell is the small size
	JSR fx_frame_body
	TSC
	CLC
	ADC.w #!FXF_SIZE
	TCS
	PLD
if defined("FX_TEST")
	JSR fx_test_vline
	STA.l !FXT_BOX+$9E           ; scanline when fx_frame ended
	LDA.l !FXT_BOX+$A8
	STA.l !FXT_BOX+$9C
endif
	RTL

fx_frame_body:
	LDA.w #$0000
	STA !d_white
	STA !d_ef
	LDA.w #$FFFF
	STA !d_lastc
	JSR fx_begin
	BCS .idle
if defined("FX_TEST")
	JSR fx_test_vline
	STA.l !FXT_BOX+$B0          ; after fx_begin
endif
	JSR fx_palscan
	JSR fx_oam_limit
if defined("FX_TEST")
	LDA.w !core_oam_cursor&$FFFF
	STA.l !FXT_BOX+$AA          ; cursor before FX drew
endif
if defined("FX_TEST")
	JSR fx_test_vline
	STA.l !FXT_BOX+$B2          ; after the palette scan
endif
	JSR fx_run_slots
if defined("FX_TEST")
	JSR fx_test_vline
	STA.l !FXT_BOX+$B4          ; after the spawned effects
endif
	JSR fx_run_draws
if defined("FX_TEST")
	JSR fx_test_vline
	STA.l !FXT_BOX+$B6          ; after the draw list
endif
if defined("FX_TEST")
	LDA.w !core_oam_cursor&$FFFF ; sprites FX added this frame
	SEC
	SBC.l !FXT_BOX+$AA
	LSR
	LSR
	CLC
	ADC.l !fx_front
	STA.l !fx_sprites
endif
.idle
	JMP fx_finish

; World-flight frame: world rendering is not wired yet, so only the
; bookkeeping runs (the draw list is dropped).
fx_world_frame:
	JSR fx_ensure_init
	LDA.w #$0000
	STA.l !fx_ndraw
	RTL

; Scene bookkeeping, camera, per-frame resets. C set when there is nothing
; to draw this frame.
fx_begin:
	LDA.w #$FFFF
	STA.l !fx_clspal
	STA.l !fx_clspal+2
	STA.l !fx_clspal+4
	LDA.w #$0000
	STA.l !fx_front
	STA.l !fx_poly_req
if defined("FX_TEST")
	STA.l !fx_sprites
	STA.l !fx_dropped
endif
	; Upload budget: the streaming phase of the coming vblank decides how
	; much time the game leaves (in Potos one phase in five leaves none).
	; Each cell costs about two scanlines; keep two lines spare.
	LDA.w $0056
	AND.w #$0007
	CMP.w #5
	BCC +
	LDA.w #$0000
+	STA.l !fx_phase
	ASL
	TAX
	LDA.l !fx_vblp,X
	SEC
	SBC.w #3
	BPL +
	LDA.w #$0000
+	LSR
	CMP.w #8
	BCC +
	LDA.w #8
+	STA.l !fx_cbudget
	LDA.l !fx_frame
	INC
	STA.l !fx_frame
	; A new map or mode invalidates the scene: its VRAM was reloaded.
	LDA.w $00DC
	CMP.l !fx_map
	BEQ +
	STA.l !fx_map
	JSR fx_reset_scene
+	LDA.w !core_mode&$FFFF
	CMP.l !fx_mode
	BEQ +
	STA.l !fx_mode
	JSR fx_reset_scene
+	; Draw entries from an older tick are stale (no client drew this frame).
	LDA.l !fx_tick
	CMP.w !core_tick&$FFFF
	BEQ +
	LDA.w !core_tick&$FFFF
	STA.l !fx_tick
	LDA.w #$0000
	STA.l !fx_ndraw
+	; Anything to show?
	LDA.l !fx_ndraw
	ORA.l !fx_nlive
	BNE .active
	LDA.l !fx_idle
	INC
	STA.l !fx_idle
	CMP.w #120
	BCC +
	JSR fx_release
+	SEC
	RTS
.active
	LDA.w #$0000
	STA.l !fx_idle
	LDA.l !fx_regions
	CMP.w #$0007
	BEQ +
	JSR fx_claim
+
	; Camera from actor 0 (map position minus screen position), as the
	; browser's cameraX/Y.
	LDA.w $E002
	SEC
	SBC.w $E020
	STA.l !fx_camx
	LDA.w $E004
	SEC
	SBC.w $E022
	STA.l !fx_camy
	CLC
	RTS

; Map or mode change: drop spawned effects and forget cached cells (the
; regions' VRAM may have been reloaded).
fx_reset_scene:
	JSR fx_clear_slots
	JSR fx_clear_rbits
	LDA.w #$0000
	STA.l !fx_cpend
	STA.l !fx_cfail
	STA.l !fx_quake
	JSR fx_claim                 ; re-validate held regions (a title reset clears claims)
	LDX.w #$001E
-	LDA.l !fx_ccell,X
	CMP.w #$FFFE
	BEQ +
	LDA.w #$FFFF
	STA.l !fx_ccell,X
+	DEX
	DEX
	BPL -
	RTS

; Claim (or confirm) the field OBJ regions. Entries of a region we do not
; hold are unusable; a region claimed afresh starts empty.
fx_claim:
	LDA.w !core_mode&$FFFF
	CMP.w #!CORE_MODE_FIELD
	BEQ +
	RTS
+	LDX.w #$0000                 ; region index 0-2
.loop
	PHX
	LDA.l fx_region_id,X
	AND.w #$00FF
	LDX.w #!FX_OWNER
	%fx_far(core_vram_claim)
	PLX
	BCS .lost
	LDA.l fx_region_bit,X
	AND.w #$00FF
	AND.l !fx_regions
	BNE .next                    ; already ours
	LDA.l fx_region_bit,X
	AND.w #$00FF
	ORA.l !fx_regions
	STA.l !fx_regions
	LDA.w #$FFFF
	JSR fx_region_mark
	BRA .next
.lost
	LDA.l fx_region_bit,X
	AND.w #$00FF
	AND.l !fx_regions
	BEQ .next
	EOR.l !fx_regions
	STA.l !fx_regions
	LDA.w #$FFFE
	JSR fx_region_mark
.next
	INX
	CPX.w #3
	BCC .loop
	RTS

; Release every region after a long idle stretch.
fx_release:
	LDA.l !fx_regions
	BNE +
	RTS
+	LDX.w #$0000
.loop
	LDA.l fx_region_bit,X
	AND.w #$00FF
	AND.l !fx_regions
	BEQ .next
	PHX
	LDA.l fx_region_id,X
	AND.w #$00FF
	LDX.w #!FX_OWNER
	%fx_far(core_vram_release)
	PLX
	LDA.w #$FFFE
	JSR fx_region_mark
.next
	INX
	CPX.w #3
	BCC .loop
	LDA.w #$0000
	STA.l !fx_regions
	STA.l !fx_cpend
	RTS

; No cell is resident (scene change, regions lost). Preserves A and X.
fx_clear_rbits:
	PHA
	PHX
	LDA.w #$0000
	LDX.w #62
-	STA.l !fx_rbits,X
	DEX
	DEX
	BPL -
	PLX
	PLA
	RTS

; Set every cache entry of region X (0-2) to A ($FFFF free, $FFFE unusable)
; and drop their pending uploads. Preserves X.
fx_region_mark:
	JSR fx_clear_rbits           ; conservative: re-found cells re-upload
	PHX
	STA.l !fx_e
	LDA.l fx_region_last,X
	AND.w #$00FF
	STA.l !fx_e+2                ; last entry * 2
	LDA.l fx_region_first,X
	AND.w #$00FF
	TAX
-	LDA.l !fx_e
	STA.l !fx_ccell,X
	LDA.l fx_entry_bit,X
	EOR.w #$FFFF
	AND.l !fx_cpend
	STA.l !fx_cpend
	TXA
	CMP.l !fx_e+2
	INX
	INX
	BCC -
	PLX
	RTS

fx_region_id:
	db !VRAM_FIELD_OBJ_A, !VRAM_FIELD_OBJ_B, !VRAM_FIELD_OBJ_C
fx_region_bit:
	db $01, $02, $04
fx_region_first:                 ; first / last cache entry * 2
	db 0*2, 7*2, 11*2
fx_region_last:
	db 6*2, 10*2, 14*2

; Which OBJ palettes are already used by the sprites in OAM (natives and
; the modules that drew before FX, including staged front sprites), and
; which FX may take: 2-7, never 0/1. Everything below the cursor counts
; (hidden natives and a few stale slots only make the choice more
; conservative). Marks go to !d_tiles (free until the first assembly):
; byte 2p becomes < $80 when palette p is seen.
fx_palscan:
	LDA.w #$FFFF
	STA !d_tiles+2
	STA !d_tiles+4
	STA !d_tiles+6
	STA !d_tiles+8
	STA !d_tiles+10
	STA !d_tiles+12
	STA !d_tiles+14
	LDA.w !core_oam_cursor&$FFFF
	CMP.w #$0201
	BCC +
	LDA.w #$0200
+	STA !d_tmp                   ; end offset
	LDA.w #$0000                 ; B = 0: TAX copies the masked byte only
	TAY
	SEP #$20
	CPY !d_tmp
	BCS .front
.loop
	LDA.w $0803,Y
	AND.b #$0E
	TAX
	STA !d_tiles,X
	LDA.w $0807,Y
	AND.b #$0E
	TAX
	STA !d_tiles,X
	LDA.w $080B,Y
	AND.b #$0E
	TAX
	STA !d_tiles,X
	LDA.w $080F,Y
	AND.b #$0E
	TAX
	STA !d_tiles,X
	REP #$21                     ; M16, C clear
	TYA
	ADC.w #16
	TAY
	SEP #$20
	CPY !d_tmp
	BCC .loop                    ; (up to three stale slots past the end count too)
.front
	REP #$20
	LDA.w !core_oam_front_n&$FFFF
	BEQ .done
	ASL
	ASL
	STA !d_tmp
	LDA.w #$0000
	TAY
	SEP #$20
.floop
	LDA.w (!core_oam_front&$FFFF)+3,Y
	AND.b #$0E
	TAX
	STA !d_tiles,X
	INY
	INY
	INY
	INY
	CPY !d_tmp
	BCC .floop
	REP #$20
.done
	STZ !d_tmp+2                 ; used: bit5..0 = palettes 7..2
	LDX.w #14
.collect
	ASL !d_tmp+2
	LDA !d_tiles,X
	AND.w #$00FF
	CMP.w #$0080
	BCS +
	INC !d_tmp+2
+	DEX
	DEX
	CPX.w #4
	BCS .collect
	LDA !d_tmp+2
	ASL
	ASL
	STA.l !fx_palused
	EOR.w #$00FF
	AND.w #$00FC
	STA.l !fx_palfree
	RTS

; OAM attribute byte -> bit of its palette (bits 1-3).
fx_attr_palbit:
	for i = 0..256
		db 1<<((!i>>1)&7)
	endfor

fx_palbit:                       ; indexed by palette * 2
	db $01,$00,$02,$00,$04,$00,$08,$00,$10,$00,$20,$00,$40,$00,$80,$00

; Advance and draw every spawned effect.
fx_run_slots:
	LDA.l !fx_nlive
	BNE +
	RTS
+	LDX.w #$0000
.loop
	LDA.l !fx_slots+!S_KIND,X
	AND.w #$00FF
	BEQ .next
	LDA.l !fx_slots+!S_AGE,X
	CMP.w #$FFFF
	BNE .old
	LDA.w #$0000                 ; spawned this frame: age 0
	BRA .store
.old
	SEP #$20
	LDA.l !fx_slots+!S_HOLD,X
	BEQ .inc
	DEC
	STA.l !fx_slots+!S_HOLD,X    ; contact hold freezes the age
	REP #$20
	BRA .check
.inc
	REP #$20
	LDA.l !fx_slots+!S_AGE,X
	INC
.store
	STA.l !fx_slots+!S_AGE,X
.check
	LDA.l !fx_slots+!S_LIFE,X
	AND.w #$00FF
	CMP.l !fx_slots+!S_AGE,X
	BEQ .kill
	BCC .kill
	PHX
	JSR fx_load_slot
	JSR fx_draw_current
	PLX
	BRA .next
.kill
	SEP #$20
	LDA.b #$00
	STA.l !fx_slots+!S_KIND,X
	REP #$20
	LDA.l !fx_nlive
	DEC
	STA.l !fx_nlive
.next
	TXA
	CLC
	ADC.w #16
	TAX
	TXA
	CMP.l !fx_hiwater
	BCS +
	JMP .loop
+	LDA.l !fx_nlive
	BNE +
	STA.l !fx_hiwater            ; all slots free again
+	RTS

; Slot X -> current effect (screen coordinates).
fx_load_slot:
	LDA.l !fx_slots+!S_KIND,X
	STA !d_cur+!C_KIND
	LDA.l !fx_slots+!S_X,X
	STA !d_cur+!C_X
	LDA.l !fx_slots+!S_Y,X
	STA !d_cur+!C_Y
	LDA.l !fx_slots+!S_DIR,X
	AND.w #$00FF
	STA !d_cur+!C_DIR
	LDA.l !fx_slots+!S_A,X
	STA !d_cur+!C_A
	LDA.l !fx_slots+!S_B,X
	STA !d_cur+!C_B
	STZ !d_cur+!C_C
	LDA.l !fx_slots+!S_AGE,X
	STA !d_cur+!C_T
	JMP fx_to_screen

; Draw every entry of this frame's draw list.
fx_run_draws:
	LDX.w #$0000
.loop
	TXA
	CMP.l !fx_ndraw
	BCS .done
	PHX
	LDA.l !fx_draws+$0,X
	STA !d_cur+$0
	LDA.l !fx_draws+$2,X
	STA !d_cur+$2
	LDA.l !fx_draws+$4,X
	STA !d_cur+$4
	LDA.l !fx_draws+$6,X
	STA !d_cur+$6
	LDA.l !fx_draws+$8,X
	STA !d_cur+$8
	LDA.l !fx_draws+$A,X
	STA !d_cur+$A
	LDA.l !fx_draws+$C,X
	STA !d_cur+$C
	LDA.l !fx_draws+$E,X
	STA !d_cur+$E
	JSR fx_to_screen
	JSR fx_draw_current
	PLX
	TXA
	CLC
	ADC.w #16
	TAX
	BRA .loop
.done
	RTS

; Map coordinates -> screen, unless FX_F_SCREEN or FX_F_GOKU (an offset).
fx_to_screen:
	LDA !d_cur+!C_KIND
	AND.w #(!FX_F_SCREEN|!FX_F_GOKU)<<8
	BNE .done
	LDA !d_cur+!C_X
	SEC
	SBC.l !fx_camx
	STA !d_cur+!C_X
	LDA !d_cur+!C_Y
	SEC
	SBC.l !fx_camy
	STA !d_cur+!C_Y
.done
	RTS

; Dispatch the current effect to its renderer.
fx_draw_current:
	LDA !d_cur+!C_KIND
	AND.w #$00FF
	BIT.w #$0080
	BNE .beam
	CMP.w #!FX_CELL+1
	BCS .none
	ASL
	TAX
	JMP (fx_kind_table,X)
.beam
	AND.w #$007F
	CMP.w #!FX_BEAM_FIRE+1
	BCS .none
	ASL
	TAX
	JMP (fx_beam_table,X)
.none
	RTS

; Flash ramp, quake timer, palettes for the vblank, draw-list reset.
fx_finish:
	LDA.l !fx_flash
	BEQ .noflash
	ASL
	TAX
	LDA.l fx_flash_amounts,X
	STA.l !fx_flashamt
	LDA.l !fx_flash
	DEC
	STA.l !fx_flash
	BRA .quake
.noflash
	STA.l !fx_flashamt
.quake
	LDA.l !fx_quake
	BEQ .pal
	SEP #$20
	LDA.w $0049
	CMP.b #$E0
	REP #$20
	BEQ .ours
	LDA.w #$0000                 ; an event took the quake byte back
	STA.l !fx_quake
	BRA .pal
.ours
	LDA.l !fx_quake
	DEC
	STA.l !fx_quake
	BNE .pal
	SEP #$20
	LDA.l !fx_quakeprev
	STA.w $0049
	REP #$20
.pal
	LDA.l !fx_clspal
	STA.l !fx_nmipal
	TAX                          ; vblank work: palettes, uploads, colour math
	LDA.l !fx_clspal+2
	STA.l !fx_nmipal+2
	STA.l !fx_e
	LDA.l !fx_clspal+4
	STA.l !fx_nmipal+4
	AND.l !fx_e
	STA.l !fx_e
	TXA
	AND.l !fx_e
	EOR.w #$FFFF                 ; nonzero when some class got a palette
	ORA.l !fx_cpend
	ORA.l !fx_flashamt
	ORA.l !fx_mathon
	ORA.l !fx_poly_req
	ORA.l !fx_poly_on
	STA.l !fx_nmiwork
	LDA.w #$0000
	STA.l !fx_ndraw
	RTS

; native-feedback.js: [0,1,2,4,6,9,13,17][flash]
fx_flash_amounts:
	dw 0, 1, 2, 4, 6, 9, 13, 17
