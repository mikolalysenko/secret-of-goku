; Per-frame driver: called last in modules_field_frame, after every client
; requested its effects. Entered M16/X16, DB = $7E, D = 0.

fx_frame:
if defined("FX_TEST")
	JSR fx_ensure_init
	JSR fx_test_frame
	JSR fx_test_vline
	STA.l !FXT_BOX+$A8           ; scanline when fx_frame started
endif
	; Idle fast path: no request since the last frame and nothing held
	; (every API call sets !fx_busy; fx_finish recomputes it). Garbage SRAM
	; at power-on reads nonzero here or initialises on the first request.
	LDA.l !fx_busy
	BNE .full
if defined("FX_TEST")
	LDA.l !fx_frame              ; tests count fx frames
	INC
	STA.l !fx_frame
endif
	RTL
.full
	JSR fx_ensure_init
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
	STA !d_lasta
	JSR fx_destroy_poll
	JSR fx_begin
	BCS .idle
if not(defined("FX_AURA_POLY"))
	; A lone aura emits nothing on the browser's odd-clock strobe. Keep
	; its cells warm without scanning native palettes or reserving OAM.
	LDA.l !fx_ndraw
	CMP.w #16
	BNE .visible
	LDA.l !fx_nlive
	BNE .visible
	LDA.l !fx_draws+!D_KIND
	AND.w #$00FF
	CMP.w #!FX_AURA
	BNE .visible
	LDA.l !fx_draws+!D_T
	LSR
	BCC .visible
	JSR fx_run_draws
	JMP fx_finish
.visible
endif
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
	JSR fx_run_draws
if defined("FX_TEST")
	JSR fx_test_vline
	STA.l !FXT_BOX+$B4          ; after the continuous draws
endif
	JSR fx_run_slots
if defined("FX_TEST")
	JSR fx_test_vline
	STA.l !FXT_BOX+$B6          ; after the spawned effects
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
	LDA.l !fx_ndraw
	BEQ +
	LDA.w #$0000
	STA.l !fx_ndraw
+	RTL

; Scene bookkeeping, camera, per-frame resets. C set when there is nothing
; to draw this frame.
fx_begin:
	LDA.w #$FFFF
	STA.l !fx_dual_pair
	STA.l !fx_clspal
	STA.l !fx_clspal+2
	STA.l !fx_clspal+4
	SEP #$20
	STA.l !fx_clspal+6
	REP #$20
	LDA.w #$0000
	STA.l !fx_palfree
	STA.l !fx_front
	STA.l !fx_poly_req
	LDA.l !fx_pbig               ; no request yet this frame
	AND.w #$FFFE
	STA.l !fx_pbig
	LDA.w #$0000
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

; Map or mode change: drop spawned effects, forget cached cells (the
; regions' VRAM may have been reloaded) and give the regions back, so a
; module that claims them on arrival (title) is not refused while FX idles.
fx_reset_scene:
	JSR fx_clear_old_slots
	JSR fx_clear_rbits
	LDA.w #$FFFF
	STA.l !fx_dball_last
	STA.l !fx_dball_last+32
	LDA.w #$0000
	STA.l !fx_cpend
	STA.l !fx_cfail
	STA.l !fx_quake
	LDA.w #$FFFF                 ; a new scene builds its polygon afresh
	STA.l !fx_pkey+8
	JSR fx_release               ; claims are made again only when something is drawn
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

; End the spawned effects of the previous scene; effects spawned this frame
; (age $FFFF, already for the new scene) stay.
fx_clear_old_slots:
	LDA.l !fx_nlive
	BEQ .done
	LDX.w #$0000
.loop
	LDA.l !fx_slots+!S_KIND,X
	AND.w #$00FF
	BEQ .next
	LDA.l !fx_slots+!S_AGE,X
	CMP.w #$FFFF
	BEQ .next
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
	CPX.w #!FX_SLOTS*16
	BCC .loop
	LDA.l !fx_nlive
	BNE .done
	STA.l !fx_hiwater
.done
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

; No cell is resident (scene change, regions lost). Invalidate the fast
; hash too: unchanged entries of other regions must still re-upload after
; a conservative reset, even if their cell ids match. Preserves A and X.
fx_clear_rbits:
	PHA
	PHX
	LDA.l !fx_hash_dirty
	BEQ .done                   ; repeated region changes already invalidated it
	LDA.w #$0000
	STA.l !fx_hash_dirty
	LDX.w #!FX_RBITS_SIZE-2
-	STA.l !fx_rbits,X
	DEX
	DEX
	BPL -
	LDA.w #$FFFF
	LDX.w #!FX_HASH_SIZE-2
-	STA.l !fx_hash,X
	DEX
	DEX
	BPL -
.done
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
.scan_start
if not(defined("FX_PALSCAN_SLOW"))
	; Whole groups only; the exact tail follows. Rounded-up groups counted
	; last frame's hidden aura as a native owner of its own palette.
	LSR : LSR : LSR
	AND.w #$FFFE
	TAX
	LDA !d_tmp
	AND.w #$FFF0
	TAY
	LDA.w #0                    ; TAX in the byte scan must have B = 0
	SEP #$20
	JMP (.groups,X)
.groups
	for group = 0..33
		dw .scan_end-(32*!group)
	endfor
.scan_body
	for sprite = 0..128
		LDA.w $0803+((127-!sprite)*4)
		AND.b #$0E
		TAX
		STA !d_tiles,X
	endfor
.scan_end
	assert .scan_end-.scan_body == 128*8, "palette scan jump stride changed"
.tail
	CPY !d_tmp
	BCS .front
	LDA.w $0803,Y
	AND.b #$0E
	TAX
	STA !d_tiles,X
	INY : INY : INY : INY
	BRA .tail
else
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
	REP #$21                     ; M16, C clear
	TYA
	ADC.w #4
	TAY
	LDA.w #0                     ; clear B after cursor $100 for the byte TAX
	SEP #$20
	CPY !d_tmp
	BCC .loop
endif
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
	EOR.w #$00FF
	AND.w #$00FC
	STA.l !fx_palfree
	BNE .available
	; The fast conservative scan includes hidden/stale sprites inside the
	; native cursor. Retry without hidden Y slots before declaring it full.
	LDA.w #$00FC
	STA.l !fx_palfree
	LDA.w !core_oam_cursor&$FFFF
	CMP.w #512
	BCC +
	LDA.w #512
+	STA !d_tmp
	LDY.w #0
.visible
	CPY !d_tmp
	BCS .visibleFront
	LDA.w $0801,Y
	AND.w #$00FF
	CMP.w #$00E0
	BEQ .visibleNext
	LDA.w $0803,Y
	AND.w #$000E
	TAX
	LDA.l fx_palbit,X
	EOR.w #$FFFF
	AND.l !fx_palfree
	STA.l !fx_palfree
.visibleNext
	INY : INY : INY : INY
	BRA .visible
.visibleFront
	LDA.w !core_oam_front_n&$FFFF
	ASL : ASL
	STA !d_tmp
	LDY.w #0
.visibleFrontLoop
	CPY !d_tmp
	BCS .available
	LDA.w (!core_oam_front&$FFFF)+3,Y
	AND.w #$000E
	TAX
	LDA.l fx_palbit,X
	EOR.w #$FFFF
	AND.l !fx_palfree
	STA.l !fx_palfree
	INY : INY : INY : INY
	BRA .visibleFrontLoop
.available
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
	BNE +
	JMP .next
+	LDA.l !fx_slots+!S_AGE,X
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
	LDA.l !fx_front              ; the OAM state before this effect
	PHA
	LDA.w !core_oam_front_n&$FFFF
	PHA
	LDA.w !core_oam_cursor&$FFFF
	PHA
	LDA.w #$0000
	STA.l !fx_bmiss
	JSR fx_draw_current
	LDA.l !fx_bmiss
	BEQ .shown
	; A new animation frame whose cells cannot be uploaded in the coming
	; vblank (no time left in this streaming phase) would leave a blank
	; frame: show the previous age instead, whose cells are resident. The
	; age itself runs on, so the effect keeps its client's timing.
	LDA $07,S
	TAX
	LDA.l !fx_slots+!S_AGE,X
	BEQ .shown
	PLA
	STA !d_tmp
	PLA
	STA !d_tmp+2
	PLA
	STA !d_tmp+4
	JSR fx_oam_rollback
	LDA $01,S
	TAX
	JSR fx_load_slot
	DEC !d_cur+!C_T
	JSR fx_draw_current
	PLX
	BRA .next
.shown
	PLA
	PLA
	PLA
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
	STA.l !fx_dual_cur
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
	; The palette hook latches clspal only when this frame completes.
	; nmipal continues to describe the displayed OAM during a lag vblank.
	LDA.l !fx_cpend             ; palettes already went through the early hook
	ORA.l !fx_flashamt
	ORA.l !fx_mathon
	ORA.l !fx_poly_req
	ORA.l !fx_poly_on
	STA.l !fx_nmiwork
	ORA.l !fx_regions            ; anything held keeps the full path running
	ORA.l !fx_flash
	ORA.l !fx_quake
	ORA.l !fx_cfail
	ORA.l !fx_nlive
	STA.l !fx_busy
	LDA.w #$0000
	STA.l !fx_ndraw
	RTS

; native-feedback.js: [0,1,2,4,6,9,13,17][flash]
fx_flash_amounts:
	dw 0, 1, 2, 4, 6, 9, 13, 17

; ---------------------------------------------------------------------------
; destroy's effect records (docs/agents/snes-port/destroy.md): a new record
; spawns a rubble burst in the room's own shades (dungeon-demolition.js,
; at most six alive) or a brazier burst at its map position. Runs before
; fx_begin, inside the frame (D = the frame, !d_tiles free).
fx_destroy_poll:
	LDA.l !FX_DREC_SEQ
	CMP.l !fx_dseq
	BNE +
	RTS
+	STA.l !fx_dseq
	LDA.l !FX_DREC_KIND
	CMP.w #2
	BEQ .brazier
	CMP.w #1
	BEQ .rubble
	RTS
.brazier
	SEP #$20
	LDA.b #$02                   ; FX_EXPLODE style: brazier (three bursts)
	STA.l !fx_style
	LDA.b #$00
	STA.l !fx_dir
	REP #$20
	LDA.w #!FX_EXPLODE
	BRA .spawn
.rubble
	LDX.w #$0000                 ; at most six rubble bursts
	LDY.w #$0000
-	LDA.l !fx_slots+!S_KIND,X
	AND.w #$00FF
	CMP.w #!FX_DEBRIS
	BNE +
	INY
+	TXA
	CLC
	ADC.w #16
	TAX
	CPX.w #!FX_SLOTS*16
	BCC -
	CPY.w #6
	BCC +
	RTS
+	JSR fx_room_shades           ; !fx_rgb
	SEP #$20
	LDA.b #$00
	STA.l !fx_style
	REP #$20
	LDA.w #$0000
	STA.l !fx_a                  ; 4 chunks
	STA.l !fx_b                  ; 32 frames
	LDA.w #!FX_DEBRIS
.spawn
	PHA
	LDA.l !FX_DREC_Y
	TAY
	LDA.l !FX_DREC_X
	TAX
	PLA
	%fx_far(fx_spawn)
	LDA.l !FX_DREC_KIND
	CMP.w #1
	BNE +
	LDA.w $00DC                  ; !fx_dyn now holds this room's shades
	STA.l !fx_dshade
+	RTS

; dungeon-demolition.js shades: among the BG colours (CGRAM 0-127, the
; game's buffer at $7E:0600) those with 18 < r+g+b < 75 that are grey
; (max - min <= 8) or warm (r >= g >= b, steps < 12); the colours nearest
; 20%, 50% and 85% of their lightness range (the browser takes the same
; ranks of the sorted list) into !fx_rgb, defaults $18C6/$294A/$4631.
; Cached per map (!fx_dshade).
!rs_n    = !d_tiles+$00       ; qualifying colours kept (up to 20)
!rs_min  = !d_tiles+$02
!rs_max  = !d_tiles+$04
!rs_c    = !d_tiles+$06       ; colour
!rs_r    = !d_tiles+$08
!rs_g    = !d_tiles+$0A
!rs_b    = !d_tiles+$0C
!rs_l    = !d_tiles+$0E       ; lightness
!rs_list = !d_tiles+$10       ; 20 words: kept colours (32 bytes, to +$2F)
!rs_t    = !d_ks+$0           ; target lightness
!rs_best = !d_ks+$2           ; best distance
!rs_k    = !d_ks+$4           ; target index (0, 2, 4)
!rs_i    = !d_ks+$6           ; kept-colour index * 2
fx_room_shades:
	LDA.w $00DC
	CMP.l !fx_dshade
	BNE .compute
	LDA.l !fx_dyn
	STA.l !fx_rgb
	LDA.l !fx_dyn+2
	STA.l !fx_rgb+2
	LDA.l !fx_dyn+4
	STA.l !fx_rgb+4
	RTS
.compute
	LDA.w #$18C6                 ; the browser's defaults
	STA.l !fx_rgb
	LDA.w #$294A
	STA.l !fx_rgb+2
	LDA.w #$4631
	STA.l !fx_rgb+4
	STZ !rs_n
	LDA.w #$00FF
	STA !rs_min
	STZ !rs_max
	LDX.w #$0000
.scan
	LDA.l $7E0600,X
	STA !rs_c
	AND.w #$001F
	STA !rs_r
	LDA !rs_c
	LSR
	LSR
	LSR
	LSR
	LSR
	AND.w #$001F
	STA !rs_g
	LDA !rs_c
	XBA
	LSR
	LSR
	AND.w #$001F
	STA !rs_b
	CLC
	ADC !rs_g
	CLC
	ADC !rs_r
	STA !rs_l
	CMP.w #19
	BCC .next
	CMP.w #75
	BCS .next
	; grey: max - min <= 8
	LDA !rs_r
	CMP !rs_g
	BCS +
	LDA !rs_g
+	CMP !rs_b
	BCS +
	LDA !rs_b
+	STA !rs_t                    ; max
	LDA !rs_r
	CMP !rs_g
	BCC +
	LDA !rs_g
+	CMP !rs_b
	BCC +
	LDA !rs_b
+	EOR.w #$FFFF
	SEC
	ADC !rs_t                    ; max - min
	CMP.w #9
	BCC .keep
	; warm: r >= g >= b, r - g < 12, g - b < 12
	LDA !rs_r
	SEC
	SBC !rs_g
	BCC .next
	CMP.w #12
	BCS .next
	LDA !rs_g
	SEC
	SBC !rs_b
	BCC .next
	CMP.w #12
	BCS .next
.keep
	LDA !rs_l
	CMP !rs_min
	BCS +
	STA !rs_min
+	CMP !rs_max
	BCC +
	STA !rs_max
+	LDA !rs_n                    ; keep the first twenty
	CMP.w #20
	BCS .next
	ASL
	PHX
	TAX
	LDA !rs_c
	STA !rs_list,X
	PLX
	INC !rs_n
.next
	INX
	INX
	CPX.w #256
	BCS +
	JMP .scan
+	LDA !rs_n
	BNE +
	RTS
+	; targets: min + (max-min) * {51, 128, 218} / 256
	STZ !rs_k
.target
	LDX !rs_k
	LDA.l .mul,X
	TAX
	LDA !rs_max
	SEC
	SBC !rs_min
	JSR fx_mul8
	XBA
	AND.w #$00FF
	CLC
	ADC !rs_min
	STA !rs_t
	LDA.w #$7FFF
	STA !rs_best
	STZ !rs_i
.near
	LDX !rs_i
	LDA !rs_list,X
	STA !rs_c
	AND.w #$001F                 ; lightness of the kept colour
	STA !rs_l
	LDA !rs_c
	LSR
	LSR
	LSR
	LSR
	LSR
	AND.w #$001F
	CLC
	ADC !rs_l
	STA !rs_l
	LDA !rs_c
	XBA
	LSR
	LSR
	AND.w #$001F
	CLC
	ADC !rs_l
	SEC
	SBC !rs_t
	BPL +
	EOR.w #$FFFF
	INC
+	CMP !rs_best
	BCS +
	STA !rs_best
	LDX !rs_k
	LDA !rs_c
	STA.l !fx_rgb,X
+	INC !rs_i
	INC !rs_i
	LDA !rs_i
	LSR
	CMP !rs_n
	BCC .near
	INC !rs_k
	INC !rs_k
	LDA !rs_k
	CMP.w #6
	BCS +
	JMP .target
+	RTS
.mul
	dw 51, 128, 218
