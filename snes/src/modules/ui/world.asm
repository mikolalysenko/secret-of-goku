; World flight (Mode 7): the telepathy/radar band and the Dragon Radar dial.
; Included in the UI code bank. Browser: native-radio.js (aerial messages at
; line 152), dragon-radar.js (panel at 152-215, dial 48x48 at (8,8)).
;
; The bottom of the world screen is Mode 7, which has no BG3, and a 240x64
; window would need 60 16x16 sprites (the world gives modules 40). So the
; band is switched to Mode 1 for lines 152-215 by two IRQs chained off the
; game's horizon IRQ (C0:8A4B, hijacked):
;   horizon (native timing): the game's own work; arms V=152 when shown.
;   V=152: in the HBlank after the game's HDMA burst, BGMODE $09 (BG3
;          priority) and TM $14 (BG3 + OBJ). Arms V=216.
;   V=216: BGMODE 7 and TM $13 back; the game's horizon timer again.
; The band's colours (palettes 2/3, CGRAM 9-15; the Mode 7 ground uses
; colours 64+) go in by HDMA channel 6 on lines 145-151, the sky's (read
; back in vblank) on lines 217-223.
; BG3 (unused elsewhere in flight) points at core OBJ region B: map $7000
; (rows 19-26 = $7260-$735F), tiles from $7000 (the opaque world atlas at
; tile $6C = $7360). The band is opaque: the window's dither holes and the
; side gutters are black, since the ground cannot show through.
; The dial is OBJ (palette 3 = CGRAM 176-191, unused by sky and ground) in
; core region C (tiles $190-$1FF): nine static 16x16 cells, the sweep as
; three 8x8 segment sprites for 64 angles, the blip and the centre.

!UI_VRAM_OWNER = $0C              ; core_vram_claim owner id (bank $AC)
!UI_BAND_V0 = 152                 ; IRQ line before the band (BGMODE lands at line 153 = output 152)
!UI_BAND_V1 = 216                 ; IRQ line of the band's end
!UI_BAND_H  = 160                 ; IRQ dot: the handler (~120 dots with the entry) reaches its
                                  ; HBlank wait before the HDMA burst ends (~330); waiting less
!UI_NATIVE_HTIME = 132            ; the game's horizon IRQ dot
!UI_BAND_ROW = 19                 ; BG3 rows 19-26 = lines 152-215 (VOFS -1)
!UI_WMAP  = $7000                 ; BG3 map (BG3SC $70)
!UI_WCHR  = $7000                 ; BG3 tiles (BG34NBA $07)
!UI_DIAL_PAL   = 3

; Radar state flags (from !UI_RADAR_STATE_FN in X16)
!UIR_WISHED   = $0001
!UIR_TREE     = $0002             ; frieza.needsTree
!UIR_STOLEN   = $0004             ; frieza.stolen (Frieza holds the Balls)
!UIR_ELIGIBLE = $0008             ; frieza.eligible (Dryad's invitation)
!UIR_DORMANT  = $0010             ; frieza.stage == 'dormant'
!UIR_CRISIS   = $0020             ; five-minute crisis
!UIR_FORT_GONE = $0040            ; Fortress destroyed
!UIR_DOCKING  = $0080             ; Fortress docking approach (radar yields)
!UIR_SHOT     = $0100             ; aerial ki shot or explosion (radar yields)

if not(defined("UI_RADAR_STATE_FN"))
	!UI_RADAR_STATE_FN = ui_stub_radar_state
endif

; ===========================================================================
; World frame (after ui_radio_tick).
ui_world_update:
	JSR ui_radar_update               ; !ui_radar_on, target, bearing
	; band content: the radio when it shows, else the radar panel
	LDA.w !ui_vis&$FFFF
	BEQ .noRadio
	LDA.w !ui_cur&$FFFF
	BNE .radio
.noRadio
	LDA.w !ui_radar_on&$FFFF
	BNE .radar
	JSR ui_band_off
	JMP ui_dial_hide
.radio
	JSR ui_dial_hide
	JSR ui_band_prepare
	BCC +
	JMP .wait
+	LDA.w !ui_cur&$FFFF               ; the content key (the text builders
	STA.w !ui_k5&$FFFF                ; use tmp0-tmp5)
	LDA.w !ui_cur_par&$FFFF
	STA.w !ui_k6&$FFFF
	LDA.w #!UIB_ALL
	STA.w !ui_tmp5&$FFFF
	BRA .content
.radar
	JSR ui_band_prepare
	BCC +
	JMP .dial
+	JSR ui_radar_key
	STA.w !ui_k5&$FFFF
	STZ.w !ui_k6&$FFFF
	; only the guide differs from the staged radar text: rebuild line 1
	LDA.w #!UIB_ALL
	STA.w !ui_tmp5&$FFFF
	LDA.l !ui_s_bmode
	CMP.w #$0002
	BNE .content
	LDA.l !ui_s_bkey
	EOR.w !ui_k5&$FFFF
	AND.w #$8FFF
	BNE .content
	LDA.w #!UIB_TEXT0|!UIB_LINE0
	STA.w !ui_tmp5&$FFFF
.content
	LDA.w !ui_k5&$FFFF
	CMP.w !ui_band_key&$FFFF
	BNE .build
	LDA.w !ui_k6&$FFFF
	CMP.w !ui_band_par&$FFFF
	BNE .build
	JMP .shown
.build
	LDA.w !ui_k5&$FFFF
	LDX.w !ui_k6&$FFFF
	LDY.w #$0002
	JSR ui_bs_step                    ; one build step per frame
	BCC .wait
	LDA.w #!SRAM_WORK_UI>>16
	STA.w !core_scratch&$FFFF
	LDA.w #!UI_WMAP+(!UI_BAND_ROW*32)
	LDX.w #$0200
	LDY.w #!ui_s_map&$FFFF
	JSL core_queue_vram
	BCS .wait
	LDA.w !ui_k5&$FFFF : STA.w !ui_band_key&$FFFF
	LDA.w !ui_k6&$FFFF : STA.w !ui_band_par&$FFFF
	LDA.w !ui_band&$FFFF
	BNE .wait                         ; already shown: new text next vblank
	JSR ui_whdma_blocks
	LDA.w #$0001
	STA.w !ui_band&$FFFF
.wait
	LDA.w !ui_radar_on&$FFFF
	BEQ .out
	JMP ui_dial_draw
.out
	RTS
.shownRadar
.shown
	LDA.w !ui_band&$FFFF
	CMP.w #$0001
	BNE +
	INC.w !ui_band&$FFFF              ; the map went up last vblank: arm the IRQs
+	LDA.w !ui_radar_on&$FFFF
	BEQ .out
.dial
	JMP ui_dial_draw

; Claim region B and upload the opaque world atlas (two halves). Carry set
; while not ready.
ui_band_prepare:
	LDA.w !ui_claims&$FFFF
	AND.w #$0001
	BNE .claimed
	LDA.w #!VRAM_WORLD_OBJ_B
	LDX.w #!UI_VRAM_OWNER
	JSL core_vram_claim
	BCS .busy
	LDA.w #$0001
	TSB.w !ui_claims&$FFFF
.claimed
	LDA.w !ui_watlas&$FFFF
	CMP.w #$0002
	BCS .ready
	TAX
	LDA.w #ui_watlas_data>>16
	STA.w !core_scratch&$FFFF
	CPX.w #$0000
	BNE .half2
	LDA.w #!UI_WCHR+(!UI_WATLAS_TILE*8)
	LDX.w #!UI_WATLAS_BYTES/2
	LDY.w #ui_watlas_data&$FFFF
	JSL core_queue_vram
	BCS .busy
	INC.w !ui_watlas&$FFFF
	SEC
	RTS
.half2
	LDA.w #!UI_WCHR+(!UI_WATLAS_TILE*8)+(!UI_WATLAS_BYTES/4)
	LDX.w #!UI_WATLAS_BYTES-(!UI_WATLAS_BYTES/2)
	LDY.w #(ui_watlas_data+(!UI_WATLAS_BYTES/2))&$FFFF
	JSL core_queue_vram
	BCS .busy
	INC.w !ui_watlas&$FFFF
	CLC                               ; the tilemap may follow in this frame
	RTS
.ready
	CLC
	RTS
.busy
	SEC
	RTS

; The HDMA data blocks: band colours, and the CGADD bytes of the sky block
; (its colours are read in vblank).
ui_whdma_blocks:
	LDX.w #$0000
-	LDA.l ui_wband_block,X
	STA.l !ui_s_wband,X
	STA.l !ui_s_wsky,X                ; same layout; colours replaced in vblank
	INX : INX
	CPX.w #28
	BCC -
	RTS

; Band off (the IRQs stop at the next horizon).
ui_band_off:
	STZ.w !ui_band&$FFFF
	STZ.w !ui_band_key&$FFFF
	RTS

; Leaving world flight: everything off, regions released, atlas forgotten.
ui_world_leave:
	STZ.w !ui_front_n&$FFFF           ; the field rebuilds every slot itself
	STZ.w !ui_band&$FFFF
	STZ.w !ui_band_key&$FFFF
	STZ.w !ui_watlas&$FFFF
	STZ.w !ui_dial_up&$FFFF
	STZ.w !ui_sweep_up&$FFFF
	STZ.w !ui_radar_on&$FFFF
	SEP #$20
	LDA.b #$00
	STA.l !ui_wirq
	REP #$20
	LDA.w !ui_claims&$FFFF
	BEQ .done
	LDA.w #!VRAM_WORLD_OBJ_B
	LDX.w #!UI_VRAM_OWNER
	JSL core_vram_release
	LDA.w #!VRAM_WORLD_OBJ_C
	LDX.w #!UI_VRAM_OWNER
	JSL core_vram_release
	STZ.w !ui_claims&$FFFF
.done
	RTS

; The band's 8 rows (32 entries) in !ui_s_map: the native window layout
; with the world atlas, black gutters. The frame here; the glyph rows of
; each text line by ui_wmap_line0-2 (ui_wtab16: glyph word -> top entry).
!UI_WT_FRAME = $2000|(3<<10)
!UI_WT_TEXT  = $2000|(2<<10)
ui_wmap_edges:
	LDX.w #$0000
	LDA.w #!UI_WT_FRAME|!UI_W_CORNER
	LDY.w #!UI_WT_FRAME|!UI_W_EDGE
	JSR ui_wm_edge
	LDX.w #$01C0
	LDA.w #!UI_WT_FRAME|!UI_W_CORNER|$8000
	LDY.w #!UI_WT_FRAME|!UI_W_EDGE|$8000
	JSR ui_wm_edge
	LDX.w #$0040
.side
	LDA.w #!UI_WT_FRAME|!UI_W_BLACK
	STA.l !ui_s_map+$00,X
	STA.l !ui_s_map+$3E,X
	LDA.w #!UI_WT_FRAME|!UI_W_SIDE
	STA.l !ui_s_map+$02,X
	ORA.w #$4000
	STA.l !ui_s_map+$3C,X
	TXA
	CLC : ADC.w #$0040
	TAX
	CPX.w #$01C0
	BCC .side
	RTS

macro ui_wline(L)
	PHB
	PEA.w ((!SRAM_WORK_UI>>16)<<8)|(!SRAM_WORK_UI>>16)
	PLB
	PLB
	LDY.w #$0000
?c:
	LDA.w 0+(!ui_s_text&$FFFF)+(<L>*56),Y
	TAX
	LDA.l ui_wtab16,X
	STA.w 0+(!ui_s_map&$FFFF)+$44+(<L>*$80),Y
	INC
	STA.w 0+(!ui_s_map&$FFFF)+$84+(<L>*$80),Y
	INY : INY
	CPY.w #56
	BCC ?c
	PLB
	RTS
endmacro
ui_wmap_line0:
	%ui_wline(0)
ui_wmap_line1:
	%ui_wline(1)
ui_wmap_line2:
	%ui_wline(2)
; A = corner, Y = edge entry, X = row offset.
ui_wm_edge:
	STA.w !ui_tmp3&$FFFF
	STY.w !ui_tmp4&$FFFF
	LDA.w #!UI_WT_FRAME|!UI_W_BLACK
	STA.l !ui_s_map+$00,X
	STA.l !ui_s_map+$3E,X
	LDA.w !ui_tmp3&$FFFF
	STA.l !ui_s_map+$02,X
	ORA.w #$4000
	STA.l !ui_s_map+$3C,X
	LDY.w #14
.e
	LDA.w !ui_tmp4&$FFFF
	STA.l !ui_s_map+$04,X
	ORA.w #$4000
	STA.l !ui_s_map+$20,X
	INX : INX
	DEY
	BNE .e
	RTS

; ===========================================================================
; World vblank (DB = $80, not force-blanked): BG3 for the band, the sky's
; colours, the dial palette; the IRQ chain restarts at the horizon.
ui_world_vblank:
	SEP #$20
	LDA.b #$00
	STA.l !ui_wirq
	LDA.b #!UI_NATIVE_HTIME
	STA $4207
	REP #$20
	LDA.l !ui_band
	CMP.w #$0002
	BEQ .on
	SEP #$20
	LDA.b #$40
	TRB $002C                         ; channel 6 HDMA off
	REP #$20
	LDA.l !ui_band_was
	BNE +
	JMP .dial
+	; restore the field's BG3 settings (C1:FD65) for anything native
	LDA.w #$0000
	STA.l !ui_band_was
	SEP #$20
	LDA.l $7E00E8
	LSR
	LDA.b #$58
	BCC +
	LDA.b #$5C
+	STA $2109
	LDA.b #$04
	STA $210C
	REP #$20
	JMP .dial
.on
	SEP #$20
	LDA.b #(!UI_WMAP>>8)&$FC
	STA $2109                         ; BG3 map $7000, 32x32
	LDA.b #(!UI_WCHR>>12)&$0F
	STA $210C                         ; BG3 tiles $7000 (BG4 unused in modes 1/7)
	STZ $2111
	STZ $2111                         ; BG3 HOFS 0
	LDA.b #$FF
	STA $2112
	LDA.b #$03
	STA $2112                         ; BG3 VOFS -1: row 19 at output line 152
	LDA.b #$40
	TSB $002C                         ; the world NMI writes $2C | $3F to HDMAEN
	REP #$20
	; the sky's colours and channel 6 on the band's first frame, then every
	; 8th (world flight uploads no palette by DMA; this follows native
	; palette writes)
	LDA.l !ui_band_was
	BEQ +
	LDA.l !ui_frame
	AND.w #$0007
	BEQ +
	JMP .dial
+	LDA.w #$0001
	STA.l !ui_band_was
	SEP #$20
	; the sky's colours 9-15 as they are now into the restore block
	LDA.b #$09
	STA $2121
	LDX.w #$0000
.read
	LDA $213B
	STA.l !ui_s_wsky+2,X
	LDA $213B
	STA.l !ui_s_wsky+3,X
	INX : INX : INX : INX
	CPX.w #28
	BCC .read
	; channel 6: indirect HDMA, mode 3 -> $2121, table in ROM, data in SRAM
	LDA.b #$43
	STA $4360
	LDA.b #$21
	STA $4361
	LDA.b #ui_whdma_table&$FF
	STA $4362
	LDA.b #(ui_whdma_table>>8)&$FF
	STA $4363
	LDA.b #(ui_whdma_table>>16)&$FF
	STA $4364
	LDA.b #(!SRAM_WORK_UI>>16)&$FF
	STA $4367
	LDA.b #$40
	TSB $002C                         ; the world NMI writes $2C | $3F to HDMAEN
	REP #$20
.dial
	; the dial palette once per claim of region C, then every 8th frame
	LDA.l !ui_dial_up
	BEQ .done
	LDA.l !ui_claims
	AND.w #$0004
	BEQ .pal0
	LDA.l !ui_frame
	AND.w #$0007
	BNE .done
.pal0
	SEP #$20
	LDA.b #(128+(!UI_DIAL_PAL*16)+1)
	STA $2121
	LDX.w #$0000
.pal
	LDA.l ui_dial_colors,X
	STA $2122
	INX
	CPX.w #12
	BCC .pal
	REP #$20
	; and into the world's CGRAM buffers ($0600 and the flash copy $DE00),
	; which the game uploads whole when its palette changes (C0:8A79)
	LDX.w #10
-	LDA.l ui_dial_colors,X
	STA.l $7E0600+((128+(!UI_DIAL_PAL*16)+1)*2),X
	STA.l $7EDE00+((128+(!UI_DIAL_PAL*16)+1)*2),X
	DEX : DEX
	BPL -
	LDA.l !ui_claims
	ORA.w #$0004
	STA.l !ui_claims
.done
	RTL

; ===========================================================================
; World IRQ (C0:8A4B JML; replaced SEP #$20 / PHA / PHB / LDA #$00). Entry:
; the interrupted code's M/X, DB/D unknown. The game's six HDMA channels
; (and our channel 6) take the start of every HBlank, so the writes land
; right after them, before the next line starts rendering.
ui_world_irq:
	SEP #$20
	PHA
	PHB
	LDA.b #$00
	PHA
	PLB                               ; DB = $00
	LDA $4211                         ; acknowledge
	LDA.l !ui_wirq
	BNE .band
	; the horizon: arm the band when it is shown (and this block was set
	; up: a foreign savestate leaves stale WRAM), then the game's handler
	LDA.l !ui_magic
	CMP.b #!UI_MAGIC&$FF
	BNE .native
	LDA.l !ui_magic+1
	CMP.b #!UI_MAGIC>>8
	BNE .native
	LDA.l !ui_band
	CMP.b #$02
	BNE .native
	LDA $00F2                         ; overhead map (Mode 7 throughout): no band
	BMI .native
	LDA.b #!UI_BAND_V0
	STA $4209
	LDA.b #!UI_BAND_H
	STA $4207
	LDA.b #$01
	STA.l !ui_wirq
.native
	JML $008A56                       ; LDA $00F2 / BMI ... (native horizon work)
.band
	CMP.b #$01
	BNE .end
	LDA.b #$09
-	BIT $4212                         ; HBlank (then the HDMA burst runs)
	BVC -
	STA $2105                         ; Mode 1, BG3 priority
	LDA.b #$14
	STA $212C                         ; main: BG3 + OBJ
	LDA.b #!UI_BAND_V1
	STA $4209
	LDA.b #$02
	STA.l !ui_wirq
	PLB
	PLA
	RTI
.end
	LDA.b #$07
-	BIT $4212
	BVC -
	STA $2105                         ; Mode 7 again
	LDA.b #$13
	STA $212C
	LDA.b #!UI_NATIVE_HTIME
	STA $4207
	LDA $0FD8                         ; the game's horizon line (C0:89CF): a lag
	INC                               ; frame skips its NMI rewrite of VTIME
	STA $4209
	LDA.b #$00
	STA.l !ui_wirq
	PLB
	PLA
	RTI

; Band colours (palettes 2/3, CGRAM 9-15) by HDMA channel 6: indirect,
; mode 3 to CGADD, CGADD, CGDATA, CGDATA. The data blocks live in SRAM
; staging (indirect bank $33): the band's colours, and the sky's colours as
; read in vblank (restored below the band for the next frame's sky).
ui_whdma_table:
	db $7F : dw (!ui_s_wsky+24)&$FFFF      ; lines 0-126: colour 15 = sky (no change)
	db $12 : dw (!ui_s_wsky+24)&$FFFF      ; lines 127-144 (Mode 7: unused colours)
	db $87 : dw !ui_s_wband&$FFFF          ; lines 145-151: band colours
	db $41 : dw (!ui_s_wband+24)&$FFFF     ; lines 152-216
	db $87 : dw !ui_s_wsky&$FFFF           ; lines 217-223: sky colours back
	db $00
ui_wband_block:
	db $09,$09 : dw $0000
	db $0A,$0A : dw $2C00
	db $0B,$0B : dw $7FFF
	db $0C,$0C : dw $0000
	db $0D,$0D : dw $0000
	db $0E,$0E : dw $5250
	db $0F,$0F : dw $739C

; ===========================================================================
; Dragon Radar (dragon-radar.js): target, bearing, visibility.
ui_radar_update:
	STZ.w !ui_radar_on&$FFFF
	; visibility: Goku active, world guards, no radio, no charge, no shot,
	; not docking, a target
	LDA.w !ui_vis&$FFFF
	BEQ +
	LDA.w !ui_cur&$FFFF
	BNE .noj                          ; the radio has the band
+	LDA.w !ui_charge_seen&$FFFF
	BNE .noj
	JSR ui_world_can_show
	BCS +
.noj
	JMP .no
+	; the target only changes with story state: re-select every 16 frames
	DEC.w !ui_rtimer&$FFFF
	BPL .keep
	LDA.w #15
	STA.w !ui_rtimer&$FFFF
	JSL !UI_RADAR_STATE_FN
	REP #$30
	STA.w !ui_rmask&$FFFF
	STX.w !ui_rflags&$FFFF
	JSR ui_radar_target
	LDA.w #$0000
	ROL
	STA.w !ui_rvalid&$FFFF
	JSR ui_radar_key_base
.keep
	LDA.w !ui_rvalid&$FFFF
	BEQ .no
	LDA.w !ui_rflags&$FFFF
	AND.w #!UIR_DOCKING|!UIR_SHOT
	BNE .no
	LDA.w !ui_in&$FFFF                ; the same, reported every frame
	AND.w #!UII_WORLD_YIELD
	BNE .no
	JSR ui_world_yield                ; or read from the world module
	BNE .no
	; the Fortress moves: follow it every frame
	LDA.w !ui_rtarget&$FFFF
	CMP.w #8
	BEQ .fort
	CMP.w #10
	BNE .bearing
.fort
	LDA.w $0128 : STA.w !ui_rtx&$FFFF
	LDA.w $012A : STA.w !ui_rty&$FFFF
.bearing
	LDA.w !ui_frame&$FFFF
	LSR
	BCS .geometry
	JSR ui_radar_rotate               ; even frames
	LDA.w !ui_rphase&$FFFF
	ORA.w #$0001
	STA.w !ui_rphase&$FFFF
	BRA .shown
.geometry
	LDA.w !ui_rphase&$FFFF
	LSR
	BCC .shown                        ; nothing rotated since it showed
	JSR ui_radar_geometry             ; odd frames
	LDA.w #$0003
	STA.w !ui_rphase&$FFFF
.shown
	LDA.w !ui_rphase&$FFFF
	AND.w #$0002
	BEQ +                             ; the first bearing is not ready yet
	LDA.w #$0001
	STA.w !ui_radar_on&$FFFF
+	RTS
.no
	STZ.w !ui_rtimer&$FFFF            ; select again as soon as it shows
	STZ.w !ui_rphase&$FFFF
	LDA.w #$FFFF
	STA.w !ui_rlast_h&$FFFF           ; and compute the far blip at once
	RTS

; The world module's public flight state (world.md): Z clear while it
; docks on the Fortress, charges, has an aerial ki shot out, an explosion or
; the planet cutaway running (dragon-radar.js: flight.docking, charging,
; worldKi shot/explosion). The ages are only kept while Goku flies
; (!WF_ACTIVE); world_ram_clear leaves them 0. DB = $7E, M16.
ui_world_yield:
if defined("w_dock")
	LDA.w !w_flags
	AND.w #!WF_ACTIVE
	BEQ .done
	LDA.w !w_dock
	ORA.w !w_shot
	ORA.w !w_charging
	BNE .done
	LDA.w !w_expl_age
	AND.w !w_cut_age
	EOR.w #$FFFF                      ; 0 when both are $FFFF (none)
.done
else
	LDA.w #$0000
endif
	RTS

; radarTarget(): carry set and !ui_rtarget/!ui_rtx/!ui_rty, or carry clear.
ui_radar_target:
	LDA.w !ui_rflags&$FFFF
	AND.w #!UIR_TREE
	BEQ .palaces
	LDA.w #7
	STA.w !ui_rtarget&$FFFF
	LDA.l ui_radar_tree_xy : STA.w !ui_rtx&$FFFF
	LDA.l ui_radar_tree_xy+2 : STA.w !ui_rty&$FFFF
	SEC
	RTS
.palaces
	LDX.w #$0000
.route
	LDA.l ui_radar_route,X
	AND.w #$00FF
	STA.w !ui_tmp0&$FFFF              ; palace index
	PHX
	ASL
	TAX
	LDA.l ui_bitw,X
	PLX
	AND.w !ui_rmask&$FFFF             ; quest.mask & (1 << i)
	BEQ .palace
	INX
	CPX.w #7
	BCC .route
	; all seven held
	LDA.w !ui_rflags&$FFFF
	AND.w #!UIR_STOLEN
	BEQ .notStolen
	LDA.w #8
	BRA .fortress
.notStolen
	LDA.w !ui_rflags&$FFFF
	AND.w #!UIR_ELIGIBLE
	BNE .dryad
	LDA.w !ui_rflags&$FFFF
	AND.w #!UIR_WISHED
	BNE .none
	LDA.w !ui_rmask&$FFFF
	AND.w #$7F00
	CMP.w #$7F00
	BNE .finale
	LDA.w !ui_rflags&$FFFF
	AND.w #!UIR_DORMANT
	BNE .dryad
.finale
	LDA.w #10
.fortress
	STA.w !ui_rtarget&$FFFF
	LDA.w $0128 : STA.w !ui_rtx&$FFFF
	LDA.w $012A : STA.w !ui_rty&$FFFF
	SEC
	RTS
.dryad
	LDA.w #9
	STA.w !ui_rtarget&$FFFF
	LDA.l ui_radar_dryad_xy : STA.w !ui_rtx&$FFFF
	LDA.l ui_radar_dryad_xy+2 : STA.w !ui_rty&$FFFF
	SEC
	RTS
.palace
	LDA.w !ui_tmp0&$FFFF
	STA.w !ui_rtarget&$FFFF
	ASL : ASL
	TAX
	LDA.l ui_radar_palace_xy,X : STA.w !ui_rtx&$FFFF
	LDA.l ui_radar_palace_xy+2,X : STA.w !ui_rty&$FFFF
	SEC
	RTS
.none
	CLC
	RTS

ui_bitw:
	dw $0001,$0002,$0004,$0008,$0010,$0020,$0040,$0080

; radarBearing(): worldAim along/across the heading, distance = hypot on
; the 4096 wrap, the guide and the blip position. In 1/8 px:
;   across = dx cos h - dy sin h,  along = -dx sin h - dy cos h
; each product |a| * |b| / 2^11 rounded (sin/cos signed 1.14, ui_sinq).
!ui_dx = !ui_rdx
!ui_dy = !ui_rdy

; A = <mag> with the sign of <a> * <b> (bit 15 of each).
macro ui_signed(mag, a, b)
	LDA.w <a>&$FFFF
	EOR.w <b>&$FFFF
	BPL ?pos
	LDA.w #$0000
	SEC : SBC.w <mag>&$FFFF
	BRA ?done
?pos:
	LDA.w <mag>&$FFFF
?done:
endmacro

; The bearing runs at 30 Hz in two halves, so neither costs a whole frame:
; even UI frames rotate this frame's state (ui_radar_rotate), odd frames
; turn the result into distance, guide and blip (ui_radar_geometry). The
; inputs of each half are kept in SRAM (!ui_s_rin, then !ui_s_gin for the
; values on screen), which is what the radar test compares with.
ui_radar_rotate:
	LDA.w $00F6 : STA.l !ui_s_rin+0   ; heading
	LDA.w $00FA : STA.l !ui_s_rin+2   ; position
	LDA.w $00FC : STA.l !ui_s_rin+4
	LDA.w !ui_rtx&$FFFF : STA.l !ui_s_rin+6   ; target
	LDA.w !ui_rty&$FFFF : STA.l !ui_s_rin+8
	LDA.w !ui_rtx&$FFFF
	SEC : SBC.w $00FA
	CLC : ADC.w #2048
	AND.w #$0FFF
	SEC : SBC.w #2048
	STA.w !ui_dx&$FFFF                ; worldDelta(target.x, origin.x)
	LDA.w !ui_rty&$FFFF
	SEC : SBC.w $00FC
	CLC : ADC.w #2048
	AND.w #$0FFF
	SEC : SBC.w #2048
	STA.w !ui_dy&$FFFF
	; sin h, cos h and their magnitudes, cached per heading
	LDA.w $00F6
	INC
	CMP.l !ui_s_trig
	BEQ .trig
	STA.l !ui_s_trig
	DEC
	JSR ui_sin14
	STA.l !ui_s_trig+2
	CMP.w #$8000
	BCC +
	EOR.w #$FFFF : INC
+	STA.l !ui_s_trig+6
	LDA.w $00F6
	CLC : ADC.w #256
	JSR ui_sin14
	STA.l !ui_s_trig+4
	CMP.w #$8000
	BCC +
	EOR.w #$FFFF : INC
+	STA.l !ui_s_trig+8
.trig
	LDA.l !ui_s_trig+2 : STA.w !ui_tmp2&$FFFF   ; sin h
	LDA.l !ui_s_trig+4 : STA.w !ui_tmp3&$FFFF   ; cos h
	LDA.l !ui_s_trig+6 : STA.w !ui_mb&$FFFF     ; |sin h|
	LDA.l !ui_s_trig+8 : STA.w !ui_ma&$FFFF     ; |cos h|
	LDA.w !ui_dx&$FFFF
	BPL +
	EOR.w #$FFFF : INC
+	JSR ui_mul2r11
	LDA.w !ui_k5&$FFFF : STA.w !ui_tmp4&$FFFF   ; |dx cos|
	LDA.w !ui_k6&$FFFF : STA.w !ui_tmp5&$FFFF   ; |dx sin|
	LDA.w !ui_dy&$FFFF
	BPL +
	EOR.w #$FFFF : INC
+	JSR ui_mul2r11                    ; k5 = |dy cos|, k6 = |dy sin|
	%ui_signed(!ui_k6, !ui_dy, !ui_tmp2)
	STA.w !ui_bx8&$FFFF               ; dy sin
	%ui_signed(!ui_tmp4, !ui_dx, !ui_tmp3)
	SEC : SBC.w !ui_bx8&$FFFF
	STA.w !ui_bx8&$FFFF               ; across = dx cos - dy sin
	%ui_signed(!ui_tmp5, !ui_dx, !ui_tmp2)
	STA.w !ui_by8&$FFFF               ; dx sin
	%ui_signed(!ui_k5, !ui_dy, !ui_tmp3)
	CLC : ADC.w !ui_by8&$FFFF
	EOR.w #$FFFF : INC
	STA.w !ui_by8&$FFFF               ; along = -(dx sin + dy cos)
	RTS

ui_radar_geometry:
	LDX.w #8
-	LDA.l !ui_s_rin,X                 ; these outputs belong to those inputs
	STA.l !ui_s_gin,X
	DEX : DEX
	BPL -
	; distance = hypot(dx, dy)
	LDA.w !ui_dx&$FFFF
	BPL +
	EOR.w #$FFFF : INC
+	STA.w !ui_tmp4&$FFFF
	LDA.w !ui_dy&$FFFF
	BPL +
	EOR.w #$FFFF : INC
+	STA.w !ui_tmp5&$FFFF
	ORA.w !ui_tmp4&$FFFF
	BNE +
	STZ.w !ui_rdist&$FFFF
	BRA .guide0
+	LDA.w !ui_tmp4&$FFFF
	CMP.w !ui_tmp5&$FFFF
	BCC +
	LDX.w !ui_tmp5&$FFFF
	LDY.w !ui_tmp4&$FFFF
	BRA ++
+	LDX.w !ui_tmp4&$FFFF
	LDY.w !ui_tmp5&$FFFF
++	JSR ui_ratio128                   ; !ui_rdist
	; guide: |angle| < 0.2 rad: along > 0, |across| < along * 13/64
	; (tan 0.2 = 0.2027); |angle| > 2.7: along < 0, |across| < -along *
	; 121/256 (tan 0.4416 = 0.4727); else the side of across
	LDA.w !ui_rdist&$FFFF
	CMP.w #100
	BCS .notLand
.guide0
	LDA.w #0
	BRA .guide
.notLand
	LDA.w !ui_bx8&$FFFF
	BPL +
	EOR.w #$FFFF : INC
+	STA.w !ui_tmp5&$FFFF              ; |across|
	LDA.w !ui_by8&$FFFF
	BMI .behind
	LDX.w #13
	JSR ui_mul_shr                    ; A = along * 13 >> 6 (saturated)
	CMP.w !ui_tmp5&$FFFF
	BCC .side
	BEQ .side
	LDA.w #1                          ; AHEAD
	BRA .guide
.behind
	EOR.w #$FFFF : INC
	LDX.w #121
	JSR ui_mul_shr8
	CMP.w !ui_tmp5&$FFFF
	BCC .side
	BEQ .side
	LDA.w #2                          ; TURN AROUND
	BRA .guide
.side
	LDA.w !ui_bx8&$FFFF
	BMI +
	LDA.w #4                          ; RIGHT
	BRA .guide
+	LDA.w #3                          ; LEFT
.guide
	STA.w !ui_rguide&$FFFF
	; blip = (24 + across * r / dist, 24 - along * r / dist)
	LDA.w !ui_rdist&$FFFF
	CMP.w #900
	BCC .near
	; far: on the r = 18 circle; the direction moves slowly, so recompute
	; when the heading turned and otherwise every 4th geometry pass (8
	; frames). UI_TEST builds recompute every pass, so the radar test checks
	; the arithmetic against the browser's exact blip.
if defined("UI_TEST")
	BRA .far
endif
	LDA.l !ui_s_rin+0
	CMP.w !ui_rlast_h&$FFFF
	BNE .far
	DEC.w !ui_rfar&$FFFF
	BPL .done
.far
	LDA.l !ui_s_rin+0
	STA.w !ui_rlast_h&$FFFF
	LDA.w #3
	STA.w !ui_rfar&$FFFF
.near
	LDA.w !ui_bx8&$FFFF
	JSR ui_blip_axis
	CLC : ADC.w #24
	STA.w !ui_blip_x&$FFFF
	LDA.w !ui_by8&$FFFF
	JSR ui_blip_axis
	EOR.w #$FFFF : INC
	CLC : ADC.w #24
	STA.w !ui_blip_y&$FFFF
.done
	RTS

; A16 = U (0-2048) -> !ui_k5 = U * !ui_ma / 2^11, !ui_k6 = U * !ui_mb / 2^11,
; rounded (!ui_ma, !ui_mb <= 16384). The 8x8 multiplier through D = $4200
; (the world IRQ and NMI handlers use no direct page before setting D);
; WRMPYA stays latched while WRMPYB takes each multiplier byte. Per product
; ((lo*hi' + hi*lo' + (lo*lo' >> 8) + 4) >> 3) + 32 * hi*hi'. Each result
; is read 8+ cycles after its WRMPYB write (16-bit stores also write $4204,
; which starts nothing).
ui_mul2r11:
	PHD
	PHA
	LDA.w #$4200
	TCD
	PLA
	SEP #$10
	TAX
	STX.b $02                         ; WRMPYA = U low (8-bit: no multiplication starts)
	REP #$10
	XBA
	AND.w #$00FF
	STA.w !ui_k4&$FFFF                ; U high
	LDX.w !ui_ma&$FFFF
	STX.b $03                         ; Ul * Cl
	NOP : NOP : NOP : NOP
	LDA.b $16
	LDX.w (!ui_ma+1)&$FFFF
	STX.b $03                         ; Ul * Ch
	XBA
	AND.w #$00FF
	CLC : ADC.w #4
	STA.w !ui_k5&$FFFF                ; (Ul*Cl >> 8) + 4
	LDA.b $16
	LDX.w !ui_mb&$FFFF
	STX.b $03                         ; Ul * Sl
	CLC : ADC.w !ui_k5&$FFFF
	STA.w !ui_k5&$FFFF                ; + Ul*Ch
	LDA.b $16
	LDX.w (!ui_mb+1)&$FFFF
	STX.b $03                         ; Ul * Sh
	XBA
	AND.w #$00FF
	CLC : ADC.w #4
	STA.w !ui_k6&$FFFF                ; (Ul*Sl >> 8) + 4
	LDA.b $16
	SEP #$10
	LDX.w !ui_k4&$FFFF
	STX.b $02                         ; WRMPYA = U high (8-bit: a write to $4203 during a
	REP #$10                          ; running multiplication would be lost)
	LDX.w !ui_ma&$FFFF
	STX.b $03                         ; Uh * Cl
	CLC : ADC.w !ui_k6&$FFFF
	STA.w !ui_k6&$FFFF                ; + Ul*Sh
	LDA.b $16
	LDX.w (!ui_ma+1)&$FFFF
	STX.b $03                         ; Uh * Ch
	CLC : ADC.w !ui_k5&$FFFF
	LSR : LSR : LSR
	STA.w !ui_k5&$FFFF
	LDA.b $16
	LDX.w !ui_mb&$FFFF
	STX.b $03                         ; Uh * Sl
	ASL : ASL : ASL : ASL : ASL
	CLC : ADC.w !ui_k5&$FFFF
	STA.w !ui_k5&$FFFF                ; U * C / 2^11
	LDA.b $16
	LDX.w (!ui_mb+1)&$FFFF
	STX.b $03                         ; Uh * Sh
	CLC : ADC.w !ui_k6&$FFFF
	LSR : LSR : LSR
	STA.w !ui_k6&$FFFF
	LDA.b $16
	ASL : ASL : ASL : ASL : ASL
	CLC : ADC.w !ui_k6&$FFFF
	STA.w !ui_k6&$FFFF                ; U * S / 2^11
	PLD
	RTS

; A16 = v (0-32767) -> (v * X8) >> 6, saturated to $7FFF.
ui_mul_shr:
	STX.w !ui_mb&$FFFF
	JSR ui_mul_u16_u8
	; m (24-bit) >> 6
	LDA.w !ui_m1&$FFFF
	AND.w #$00FF
	CMP.w #$0020
	BCS .sat
	XBA
	ASL : ASL
	STA.w !ui_ma&$FFFF
	LDA.w !ui_m0&$FFFF
	LSR : LSR : LSR : LSR : LSR : LSR
	ORA.w !ui_ma&$FFFF
	RTS
.sat
	LDA.w #$7FFF
	RTS
; A16 = v -> (v * X8) >> 8, saturated.
ui_mul_shr8:
	STX.w !ui_mb&$FFFF
	JSR ui_mul_u16_u8
	LDA.w !ui_m1&$FFFF
	AND.w #$00FF
	CMP.w #$0080
	BCS .sat
	XBA
	STA.w !ui_ma&$FFFF
	LDA.w !ui_m0&$FFFF
	XBA
	AND.w #$00FF
	ORA.w !ui_ma&$FFFF
	RTS
.sat
	LDA.w #$7FFF
	RTS
; m0 (low word) / m1 (high byte) = A16 * !ui_mb (8-bit), unsigned.
ui_mul_u16_u8:
	STA.w !ui_ma&$FFFF
	SEP #$20
	LDA.w !ui_ma&$FFFF : STA.l $004202
	LDA.w !ui_mb&$FFFF : STA.l $004203
	REP #$20
	NOP : NOP : NOP
	LDA.l $004216
	STA.w !ui_m0&$FFFF
	SEP #$20
	LDA.w (!ui_ma&$FFFF)+1 : STA.l $004202
	LDA.w !ui_mb&$FFFF : STA.l $004203
	REP #$20
	NOP : NOP : NOP
	LDA.l $004216                     ; high * b (<< 8)
	STA.w !ui_m1&$FFFF
	XBA
	AND.w #$FF00
	CLC : ADC.w !ui_m0&$FFFF
	STA.w !ui_m0&$FFFF
	LDA.w !ui_m1&$FFFF
	XBA
	AND.w #$00FF
	ADC.w #$0000
	STA.w !ui_m1&$FFFF
	RTS

; A16 = component (1/8 px, signed) -> round(component * r / dist) with
; r = min(18, dist / 50): component / 50 below 900 px, else * 18 / dist.
ui_blip_axis:
	STA.w !ui_tmp5&$FFFF
	BPL +
	EOR.w #$FFFF : INC
+	STA.w !ui_tmp4&$FFFF              ; |v|
	LDA.w !ui_rdist&$FFFF
	CMP.w #900
	BCS .far
	; round(|v| / 400) = ((|v| + 200) / 2) / 200
	LDA.w !ui_tmp4&$FFFF
	CLC : ADC.w #200
	LSR
	STA.l $004204
	SEP #$20
	LDA.b #200
	STA.l $004206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.l $004214
	JMP .sign
.far
	; round(|v| * 9 / (4 dist)) = floor(N / D), N = 9|v| + 2 dist (18 bits),
	; D = 4 dist: the quotient is at most 19, so a restoring division over
	; the low 5 bits of N from R = N >> 5 (< D)
	LDA.w !ui_tmp4&$FFFF
	STA.w !ui_m0&$FFFF
	STZ.w !ui_m1&$FFFF
	ASL.w !ui_m0&$FFFF : ROL.w !ui_m1&$FFFF
	ASL.w !ui_m0&$FFFF : ROL.w !ui_m1&$FFFF
	ASL.w !ui_m0&$FFFF : ROL.w !ui_m1&$FFFF
	LDA.w !ui_m0&$FFFF
	CLC : ADC.w !ui_tmp4&$FFFF
	STA.w !ui_m0&$FFFF
	LDA.w !ui_m1&$FFFF
	ADC.w #$0000
	STA.w !ui_m1&$FFFF                ; 9|v|
	LDA.w !ui_rdist&$FFFF
	ASL
	STA.w !ui_k3&$FFFF
	ASL
	STA.w !ui_k2&$FFFF                ; D = 4 dist
	LDA.w !ui_k3&$FFFF
	CLC : ADC.w !ui_m0&$FFFF
	STA.w !ui_m0&$FFFF
	LDA.w !ui_m1&$FFFF
	ADC.w #$0000                      ; N high (0-3)
	XBA
	ASL : ASL : ASL
	STA.w !ui_k3&$FFFF                ; N high << 11
	LDA.w !ui_m0&$FFFF
	XBA
	ASL : ASL : ASL
	STA.w !ui_k4&$FFFF                ; the low 5 bits of N at the top
	LDA.w !ui_m0&$FFFF
	LSR : LSR : LSR : LSR : LSR
	ORA.w !ui_k3&$FFFF                ; R = N >> 5
	STZ.w !ui_k3&$FFFF                ; quotient
	LDY.w #5
-	ASL.w !ui_k4&$FFFF
	ROL
	CMP.w !ui_k2&$FFFF
	BCC +
	SBC.w !ui_k2&$FFFF
+	ROL.w !ui_k3&$FFFF
	DEY
	BNE -
	LDA.w !ui_k3&$FFFF
.sign
	BIT.w !ui_tmp5&$FFFF
	BPL +
	EOR.w #$FFFF : INC
+	RTS

; A16 = heading units (any; mod 1024) -> sin as signed 1.14 (exact table).
ui_sin14:
	AND.w #$03FF
	STA.w !ui_msign&$FFFF
	AND.w #$00FF
	TAX                               ; i
	LDA.w !ui_msign&$FFFF
	AND.w #$0100                      ; second / fourth quarter: sin(256 - i)
	BEQ +
	TXA
	EOR.w #$FFFF : INC
	CLC : ADC.w #256
	TAX
+	TXA
	ASL
	TAX
	LDA.l ui_sinq,X
	PHA
	LDA.w !ui_msign&$FFFF
	AND.w #$0200                      ; second half turn: negative
	BEQ +
	PLA
	EOR.w #$FFFF : INC
	RTS
+	PLA
	RTS

; X = min, Y = max (> 0): A = round(min * 128 / max) (0-128) and
; !ui_rdist = max * sec(atan(min/max)).
ui_ratio128:
	STX.w !ui_tmp0&$FFFF
	STY.w !ui_tmp1&$FFFF
	; scale both so max < 256 (8-bit divisor)
.scale
	LDA.w !ui_tmp1&$FFFF
	CMP.w #256
	BCC .div
	LSR.w !ui_tmp1&$FFFF
	LSR.w !ui_tmp0&$FFFF
	BRA .scale
.div
	LDA.w !ui_tmp1&$FFFF
	LSR
	STA.w !ui_tmp5&$FFFF              ; max / 2 (rounding)
	LDA.w !ui_tmp0&$FFFF
	XBA                               ; min * 256 (min < 256)
	LSR                               ; min * 128
	CLC : ADC.w !ui_tmp5&$FFFF
	STA.l $004204
	SEP #$20
	LDA.w !ui_tmp1&$FFFF
	BNE +
	INC                               ; never divide by zero
+	STA.l $004206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.l $004214
	CMP.w #129
	BCC +
	LDA.w #128
+	PHA
	; distance = (max * sec[k]) >> 8 = (ml*sl >> 8) + mh*sl + (sec >= 256 ? max : 0)
	; (sec 256..362, max = the original Y)
	ASL
	TAX
	LDA.l ui_sec128,X
	STA.w !ui_tmp0&$FFFF
	STY.w !ui_tmp1&$FFFF
	SEP #$20
	STA.l $004202                     ; WRMPYA = sec low (latched)
	TYA
	STA.l $004203                     ; max low * sec low
	REP #$20
	NOP : NOP : NOP
	LDA.l $004216
	XBA
	AND.w #$00FF
	STA.w !ui_rdist&$FFFF
	SEP #$20
	LDA.w (!ui_tmp1&$FFFF)+1
	STA.l $004203                     ; max high * sec low
	REP #$20
	NOP : NOP : NOP
	LDA.l $004216
	CLC : ADC.w !ui_rdist&$FFFF
	STA.w !ui_rdist&$FFFF
	LDA.w !ui_tmp0&$FFFF
	CMP.w #$0100
	BCC +
	LDA.w !ui_tmp1&$FFFF
	CLC : ADC.w !ui_rdist&$FFFF
	STA.w !ui_rdist&$FFFF
+	PLA
	RTS

; Key of the radar text (changes when anything shown changes): $8000 |
; guide << 12 | target << 8 | stolen/crisis bits 4/7 | held count. All but
; the guide only change when the target is selected (ui_radar_key_base).
ui_radar_key:
	LDA.w !ui_rguide&$FFFF
	XBA
	ASL : ASL : ASL : ASL
	ORA.l !ui_s_rkey
	RTS
ui_radar_key_base:
	LDA.w !ui_rtarget&$FFFF
	XBA
	PHA
	LDA.w !ui_rmask&$FFFF
	JSR ui_popcount7
	ORA $01,S
	STA $01,S
	LDA.w !ui_rflags&$FFFF
	AND.w #!UIR_STOLEN|!UIR_CRISIS
	LSR : LSR                         ; bits 0, 3
	ASL : ASL : ASL : ASL             ; bits 4, 7
	ORA $01,S
	ORA.w #$8000
	STA.l !ui_s_rkey
	PLA
	RTS

; A16 = popcount of bits 0-6.
ui_popcount7:
	AND.w #$007F
	LDY.w #$0000
-	LSR
	BCC +
	INY
+	CMP.w #$0000
	BNE -
	TYA
	RTS

; The radar panel text into !ui_s_text (3 x 28):
;   RADAR <n>/7  <guide>   or   RADAR 8TH BALL  <guide>
;   Next: <name>
;   <hint>                 or   CORE: 5 MINUTES REMAIN
ui_radar_text:
	LDA.w #$0000                      ; spaces
	LDX.w #166
.fill
	STA.l !ui_s_text,X
	DEX : DEX
	BPL .fill
	JSR ui_radar_line1
	BRA ui_radar_lines23
; Line 1 only (the guide changed).
ui_radar_text0:
	LDA.w #$0000
	LDX.w #54
-	STA.l !ui_s_text,X
	DEX : DEX
	BPL -
ui_radar_line1:
	STZ.w !ui_bt_line&$FFFF
	STZ.w !ui_bt_col&$FFFF
	LDX.w #ui_rs_radar
	JSR ui_put_rom
	LDA.w !ui_rflags&$FFFF
	AND.w #!UIR_STOLEN
	BEQ .count
	LDX.w #ui_rs_eighth
	JSR ui_put_rom
	BRA .gap
.count
	LDA.w !ui_rmask&$FFFF
	JSR ui_popcount7
	CLC : ADC.w #$00B5
	JSR ui_bt_put
	LDX.w #ui_rs_of7
	JSR ui_put_rom
.gap
	LDX.w #ui_rs_gap
	JSR ui_put_rom
	LDA.w !ui_rguide&$FFFF
	ASL
	TAX
	LDA.l ui_rs_guides,X
	TAX
	JMP ui_put_rom
ui_radar_lines23:
	LDA.w #28 : STA.w !ui_bt_line&$FFFF
	STZ.w !ui_bt_col&$FFFF
	LDX.w #ui_rs_next
	JSR ui_put_rom
	LDA.w !ui_rtarget&$FFFF
	CMP.w #7
	BCS .special
	ASL
	TAX
	LDA.l ui_radar_names,X
	TAX
	JSR ui_put_rom
	BRA .line3
.special
	SEC : SBC.w #7
	ASL
	TAX
	LDA.l ui_rs_tnames,X
	TAX
	JSR ui_put_rom
.line3
	LDA.w #56 : STA.w !ui_bt_line&$FFFF
	STZ.w !ui_bt_col&$FFFF
	LDA.w !ui_rflags&$FFFF
	AND.w #!UIR_CRISIS
	BEQ .hint
	LDX.w #ui_rs_crisis
	JMP ui_put_rom
.hint
	LDA.w !ui_rtarget&$FFFF
	CMP.w #7
	BCS .shint
	ASL
	TAX
	LDA.l ui_radar_hints,X
	TAX
	JMP ui_put_rom
.shint
	SEC : SBC.w #7
	ASL
	TAX
	LDA.l ui_rs_thints,X
	TAX
	JMP ui_put_rom

; Copy the zero-terminated string at X (this bank) to the text cursor as
; glyph words (the generator checks that every radar line fits 28 columns).
ui_put_rom:
	TXY
	LDA.w !ui_bt_line&$FFFF
	CLC : ADC.w !ui_bt_col&$FFFF
	ASL
	TAX                               ; word offset in !ui_s_text
	PHB
	PHK
	PLB                               ; DB = this bank: the string
.c
	LDA.w $0000,Y
	AND.w #$00FF
	BEQ .done
	SEC : SBC.w #!UI_ATLAS_FIRST
	CMP.w #!UI_ATLAS_GLYPHS
	BCC +
	LDA.w #$0000
+	ASL
	STA.l !ui_s_text,X
	INX : INX
	INY
	BRA .c
.done
	PLB
	TXA
	LSR
	SEC : SBC.w !ui_bt_line&$FFFF
	STA.w !ui_bt_col&$FFFF
	RTS

ui_rs_guides:
	dw ui_rs_land, ui_rs_ahead, ui_rs_around, ui_rs_left, ui_rs_right
ui_rs_tnames:   ; 7 tree, 8 frieza, 9 dryad, 10 finale (Mana Beast when the Fortress is gone)
	dw ui_rs_tree_name, ui_rs_frieza_name, ui_rs_dryad_name, ui_rs_fortress_name
ui_rs_thints:
	dw ui_rs_tree_hint, ui_rs_frieza_hint, ui_rs_dryad_hint, ui_rs_finale_hint

if defined("UI_HAVE_STORY")
; With the story module: the ledger from story_api_quest_status and the
; Frieza/world state through the story query table (frieza and world
; modules fill those queries; unimplemented ones answer 0, as the browser
; does without those modules). UI_TEST builds can still force the stub.
ui_story_radar_state:
	PHP
	PHB
	REP #$30
	PEA $7E7E : PLB : PLB
if defined("UI_TEST")
	LDA.l !ui_stub_q
	BEQ +
	PLB
	PLP
	JMP ui_stub_radar_state
+
endif
	JSL story_api_quest_status
	REP #$30
	STA.w !ui_tmp4&$FFFF
	TXA
	AND.w #$0001                      ; wished
	STA.w !ui_tmp5&$FFFF
	LDX.w #$0000
.q
	LDA.l ui_rq_ids,X
	AND.w #$00FF
	PHX
	JSR ui_story_query
	PLX
	BEQ +
	LDA.l ui_rq_bits,X
	AND.w #$00FF
	TSB.w !ui_tmp5&$FFFF
+	INX
	CPX.w #5
	BCC .q
	LDX.w !ui_tmp5&$FFFF
	LDA.w !ui_tmp4&$FFFF
	PLB
	PLP
	RTL
ui_rq_ids:
	db !STORY_Q_FRIEZA_NEEDS_TREE, !STORY_Q_FRIEZA_STOLEN, !STORY_Q_FRIEZA_ELIGIBLE
	db !STORY_Q_FRIEZA_CRISIS, !STORY_Q_FORTRESS_DESTROYED
ui_rq_bits:
	db !UIR_TREE, !UIR_STOLEN, !UIR_ELIGIBLE, !UIR_CRISIS, !UIR_FORT_GONE

; A16 = story query id (< $80) -> A16 = its value (0 when nobody implements
; it), as story_query (which is local to the story bank) does.
ui_story_query:
	AND.w #$007F
	STA.w !ui_tmp3&$FFFF
	ASL
	CLC : ADC.w !ui_tmp3&$FFFF
	TAX
	LDA.l story_query_table,X
	CMP.w #story_query_zero&$FFFF
	BNE .call
	LDA.l story_query_table+1,X
	CMP.w #(story_query_zero>>8)&$FFFF
	BNE .call
	LDA.w #$0000
	RTS
.call
	PHB
	PEA $7E7E : PLB : PLB
	PHK
	PER .back-1
	SEP #$20
	LDA.l story_query_table+2,X
	PHA
	REP #$20
	LDA.l story_query_table,X
	DEC
	PHA
	RTL
.back
	REP #$30
	PLB
	AND.w #$00FF
	RTS
endif

; Without the providers: held | collected << 8 from !ui_stub_q, flags from
; !ui_stub_rf (tests).
ui_stub_radar_state:
	LDA.l !ui_stub_rf
	TAX
	LDA.l !ui_stub_q
	RTL

; ===========================================================================
; Dial: OBJ in region C (snes/gen/ui.mjs lays out the tiles).
;
; The dial's sprites are one run of consecutive slots at the core's module
; cursor, written straight into the OAM buffer (the core_oam_add contract:
; low table $7E:0800, high table $7E:0A00, !core_oam_cursor advanced so the
; core hides them again next frame): the centre (only when the blip covers
; it), the blinking blip and the three sweep segments (8x8), then the nine
; 16x16 base cells. Lower slots draw in front, so this is the browser's
; drawing order. Natives over the dial follow the run (ui_dial_front).
!UI_DIAL_ATTR = $3700             ; OAM byte 3: priority 3, palette 3, tile bit 8
!UI_DIAL_RUN  = 14                ; most slots the run takes (5 small + 9 large)

; Base cell i (column c, row r): x, y and the OAM tile word, immediate.
macro ui_cellw(i, c, r)
	LDA.w #(8+(<c>*16))|((8+(<r>*16))<<8)
	STA.w $0800+(<i>*4),Y
	LDA.w #((!UI_DIAL_TILE+(<r>*32)+(<c>*2))&$FF)|!UI_DIAL_ATTR
	STA.w $0802+(<i>*4),Y
endmacro

ui_dial_hide:
	JMP ui_dial_unfront

ui_dial_draw:
	; claim region C, upload the base and the effect tiles once
	LDA.w !ui_claims&$FFFF
	AND.w #$0002
	BNE .claimed
	LDA.w #!VRAM_WORLD_OBJ_C
	LDX.w #!UI_VRAM_OWNER
	JSL core_vram_claim
	BCC +
	RTS
+	LDA.w #$0002
	TSB.w !ui_claims&$FFFF
.claimed
	LDA.w !ui_dial_up&$FFFF
	CMP.w #!UI_DIAL_UPS
	BCS .base
	JMP ui_dial_upload
.base
	; sweep angle: the browser's frame * 0.045 rad, 64 steps
	LDA.w !ui_sweep_ph&$FFFF
	CLC : ADC.w #469                  ; 0.045 / 2pi * 65536
	STA.w !ui_sweep_ph&$FFFF
	XBA
	LSR : LSR
	AND.w #$003F
	INC
	STA.w !ui_sweep_up&$FFFF
	LDA.w !core_oam_limit&$FFFF
	SEC : SBC.w !core_oam_cursor&$FFFF
	BCC .noRoom
	CMP.w #!UI_DIAL_RUN*4
	BCS .room
.noRoom
	JMP ui_dial_unfront
.room
	LDY.w !core_oam_cursor&$FFFF
	STY.w !ui_k0&$FFFF                ; first slot (byte offset)
	INC.w !ui_blink&$FFFF             ; the browser's frame % 30 < 22
	LDA.w !ui_blink&$FFFF
	CMP.w #30
	BCC +
	STZ.w !ui_blink&$FFFF
	LDA.w #$0000
+	CMP.w #22
	BCS .sweep
	; the centre is drawn last in the browser: in front of a blip over it
	LDA.w !ui_blip_x&$FFFF
	SEC : SBC.w #23
	CMP.w #3
	BCS .blip
	LDA.w !ui_blip_y&$FFFF
	SEC : SBC.w #23
	CMP.w #3
	BCS .blip
	LDA.w #(8+24)|((8+24)<<8)
	STA.w $0800,Y
	LDA.w #(!UI_CTR_TILE&$FF)|!UI_DIAL_ATTR
	STA.w $0802,Y
	INY : INY : INY : INY
.blip
	LDA.w !ui_blip_y&$FFFF            ; 3x3 at the tile's top left: (bx-1, by-1)
	CLC : ADC.w #8-1
	XBA
	STA.w !ui_k1&$FFFF
	LDA.w !ui_blip_x&$FFFF
	CLC : ADC.w #8-1
	ORA.w !ui_k1&$FFFF
	STA.w $0800,Y
	LDA.w #(!UI_BLIP_TILE&$FF)|!UI_DIAL_ATTR
	STA.w $0802,Y
	INY : INY : INY : INY
.sweep
	LDA.w !ui_sweep_up&$FFFF
	DEC
	ASL : ASL
	STA.w !ui_k1&$FFFF
	ASL
	ADC.w !ui_k1&$FFFF                ; angle * 12 (carry clear)
	TAX
	LDA.l ui_sweep_oam+0,X : STA.w $0800,Y
	LDA.l ui_sweep_oam+2,X : STA.w $0802,Y
	LDA.l ui_sweep_oam+4,X : STA.w $0804,Y
	LDA.l ui_sweep_oam+6,X : STA.w $0806,Y
	LDA.l ui_sweep_oam+8,X : STA.w $0808,Y
	LDA.l ui_sweep_oam+10,X : STA.w $080A,Y
	TYA
	CLC : ADC.w #12
	TAY
	STY.w !ui_k1&$FFFF                ; first 16x16 slot (byte offset)
	%ui_cellw(0, 0, 0) : %ui_cellw(1, 1, 0) : %ui_cellw(2, 2, 0)
	%ui_cellw(3, 0, 1) : %ui_cellw(4, 1, 1) : %ui_cellw(5, 2, 1)
	%ui_cellw(6, 0, 2) : %ui_cellw(7, 1, 2) : %ui_cellw(8, 2, 2)
	TYA
	CLC : ADC.w #9*4
	STA.w !core_oam_cursor&$FFFF
	JSR ui_dial_hibits
	JMP ui_dial_front

; High table bits of the run: slots [!ui_k0, !ui_k1) small, the nine from
; !ui_k1 large, x bit 8 clear. Byte g of the run's bytes (from the byte
; holding the first slot) is $AA masked to the large slots; the first byte
; keeps the bits of the slots before the run. Slots after the run in the
; last byte are free (hidden) or written later through the same table.
; A run starting on a byte boundary (the usual case: the UI's world frame
; runs first) takes four whole bytes from ui_hi_runs.
ui_dial_hibits:
	LDA.w !ui_k0&$FFFF
	BIT.w #$000C
	BNE .general
	LSR : LSR : LSR : LSR
	TAY                               ; byte index of the first slot
	LDA.w !ui_k1&$FFFF
	SEC : SBC.w !ui_k0&$FFFF          ; small slots * 4 (12, 16 or 20)
	SEC : SBC.w #12
	TAX                               ; 0, 4, 8: four bytes per pattern
	LDA.l ui_hi_runs,X : STA.w $0A00,Y
	LDA.l ui_hi_runs+2,X : STA.w $0A02,Y
	RTS
.general
	LSR : LSR
	STA.w !ui_k2&$FFFF                ; first slot
	LSR : LSR
	TAY                               ; byte index
	LDA.w !ui_k1&$FFFF
	LSR : LSR
	STA.w !ui_k3&$FFFF                ; first large slot
	CLC : ADC.w #9-1
	LSR : LSR
	STA.w !ui_k4&$FFFF                ; last byte index
	LDA.w !ui_k2&$FFFF
	AND.w #$FFFC
	EOR.w #$FFFF : INC
	CLC : ADC.w !ui_k3&$FFFF
	TAX                               ; k = first large slot - first byte's slot
	LDA.w !ui_k2&$FFFF
	AND.w #$0003
	STA.w !ui_k2&$FFFF                ; slots kept in the first byte
	SEP #$20
	PHX
	LDX.w !ui_k2&$FFFF
	LDA.w $0A00,Y
	AND.l ui_hi_keep,X
	PLX
	ORA.l ui_hi_large,X
	BRA .store
.next
	REP #$20
	TXA
	SEC : SBC.w #4
	BCS +
	LDA.w #$0000
+	TAX
	SEP #$20
	LDA.l ui_hi_large,X
.store
	STA.w $0A00,Y
	INY
	CPY.w !ui_k4&$FFFF
	BCC .next
	BEQ .next
	REP #$20
	RTS

; Byte-aligned runs of 3, 4 or 5 small slots, then 9 large (four bytes).
ui_hi_runs:
	db $80,$AA,$AA,$AA
	db $00,$AA,$AA,$AA
	db $00,$A8,$AA,$AA
; $AA masked to the slots >= k of a byte (k = 0..12, clamped).
ui_hi_large:
	db $AA,$A8,$A0,$80,$00,$00,$00,$00,$00,$00,$00,$00,$00
; The bits of the first n slots of a byte (n = 0..3).
ui_hi_keep:
	db $00,$03,$0F,$3F
; Value v (0-3) in place for slot (s & 3): [s&3][v].
ui_hi_set:
	db $00,$01,$02,$03, $00,$04,$08,$0C, $00,$10,$20,$30, $00,$40,$80,$C0

; Upload steps (ui_dial_ups): as many as the core queue takes this frame.
ui_dial_upload:
	LDA.w !ui_dial_up&$FFFF
	ASL
	ADC.w !ui_dial_up&$FFFF
	ASL
	TAX                               ; 6 bytes per step
	LDA.w #ui_dial_data>>16
	STA.w !core_scratch&$FFFF
	LDA.l ui_dial_ups+2,X
	CLC : ADC.w #ui_dial_data
	TAY
	LDA.l ui_dial_ups+4,X
	PHA
	LDA.l ui_dial_ups,X
	PLX
	JSL core_queue_vram
	BCS .out
	INC.w !ui_dial_up&$FFFF
	LDA.w !ui_dial_up&$FFFF
	CMP.w #!UI_DIAL_UPS
	BCC ui_dial_upload
.out
	RTS

; The browser draws the dial over every sprite; in world flight module
; sprites sit behind all native slots. Native sprites touching the dial's
; box are copied right after the dial's run and their own slots hidden with
; a marker (X $FE, Y $E0); the list (!ui_front, 8 bytes each: slot, x/y,
; tile/attributes, high bits) gives them back.
; Slots 64-83 (the compass letters, effects) are scanned every frame, the
; world-object slots 0-63 one half per frame (in the flight scenes tested
; none of them reaches the dial's box). A marked native whose half is not
; scanned this frame stays hidden and is copied behind the dial again;
; the others get their entry back before the scan (if the game did not
; rewrite them), so lag frames keep the dial in front and the game's
; buffer only ever differs by entries it is about to overwrite.
!UI_FRONT_MAX = 8
!UI_FRONT_MARK = $E0FE
; The scan reads the Y bytes, 8 slots per pass with 8-bit registers; a Y
; above the dial skips the slot in 9 cycles, an x low byte that cannot
; reach the dial in 13.
macro ui_fscan(addr, k, stub)
	LDA.w <addr>+(<k>*4),X            ; y
	CMP.b #8+48
	BCS ?n
	LDA.w <addr>-1+(<k>*4),X          ; x low byte: 0-55, or 249-255 (x bit 8
	CMP.b #8+48                       ; set: -7..-1, a 16x16 reaching x 8)
	BCC ?c
	CMP.b #249
	BCC ?n
?c:
	LDA.b #<k>*4
	JSR <stub>
?n:
endmacro
macro ui_fpass(addr, stub)
	%ui_fscan(<addr>, 0, <stub>) : %ui_fscan(<addr>, 1, <stub>)
	%ui_fscan(<addr>, 2, <stub>) : %ui_fscan(<addr>, 3, <stub>)
	%ui_fscan(<addr>, 4, <stub>) : %ui_fscan(<addr>, 5, <stub>)
	%ui_fscan(<addr>, 6, <stub>) : %ui_fscan(<addr>, 7, <stub>)
endmacro
ui_dial_front:
	JSR ui_dial_unfront_keep
	LDA.w !ui_frame&$FFFF
	AND.w #$0001
	XBA
	LSR                               ; this frame's half of slots 0-63: X = 0 or 128
	CLC : ADC.w #128
	STA.w !ui_tmp0&$FFFF              ; its end
	SEC : SBC.w #128
	SEP #$30
	TAX
.lo
	%ui_fpass($0801, ui_front_stub_lo)
	TXA
	CLC : ADC.b #32
	TAX
	CPX.w !ui_tmp0&$FFFF              ; 8-bit compare with the end's low byte
	BEQ +
	JMP .lo
+	LDX.b #$00                        ; slots 64-87 (84-87 are never used)
.hi
	%ui_fpass($0901, ui_front_stub_hi)
	TXA
	CLC : ADC.b #32
	TAX
	CPX.b #96
	BEQ +
	JMP .hi
+	REP #$30
	RTS
; A8 = the slot's byte offset in the pass, X8 = the pass: Y16 = OAM byte
; offset, then the candidate test with A8/X16; back with 8-bit registers.
ui_front_stub_hi:
	REP #$31
	AND.w #$00FF
	ORA.w #$0100
	BRA +
ui_front_stub_lo:
	REP #$31
	AND.w #$00FF
+	STA.w !ui_tmp1&$FFFF
	TXA
	ADC.w !ui_tmp1&$FFFF
	TAY
	SEP #$20
	JSR ui_front_cand
	SEP #$30
	RTS

; Y16 = OAM byte offset of a native with y < 56 and an x low byte that may
; touch the dial (A8, X16 = the scan's, kept): move it behind the dial when
; it overlaps [8, 56) x [8, 56). The usual case, an 8x8 at x 0-255 (the
; compass letters), takes a short path; 16x16 or x-bit-8 sprites the full
; test. Returns A8.
ui_front_cand:
	PHX
	REP #$20
	TYA
	LSR : LSR : LSR : LSR
	TAX                               ; its high-table byte
	TYA
	AND.w #$000C
	STA.w !ui_tmp4&$FFFF              ; (slot & 3) * 4
	SEP #$20
	LDA.w $0A00,X
	LDX.w !ui_tmp4&$FFFF
	AND.l ui_hi_field16,X
	BNE .general
	LDA.w $0800,Y                     ; 8x8: 1 <= x < 56 and y >= 1
	BEQ .skip
	CMP.b #8+48
	BCS .skip
	LDA.w $0801,Y
	BEQ .skip
	REP #$20
	STZ.w !ui_tmp3&$FFFF              ; its high bits: small, x bit 8 clear
	BRA .room
.general
	REP #$20
	TYA
	LSR : LSR
	STA.w !ui_tmp2&$FFFF              ; slot
	JSR ui_oam_hibits                 ; A = bit0 x bit 8, bit1 large
	STA.w !ui_tmp3&$FFFF
	AND.w #$0002
	BEQ +
	LDA.w #16
	BRA ++
+	LDA.w #8
++	STA.w !ui_tmp4&$FFFF              ; size in pixels
	LDA.w !ui_tmp3&$FFFF
	LSR                               ; x bit 8 into carry
	LDA.w $0800,Y
	AND.w #$00FF
	BCC +
	ORA.w #$FF00                      ; negative x
+	; overlap with [8, 56) x [8, 56): x < 56, x + size > 8, y + size > 8
	BMI +
	CMP.w #8+48
	BCS .skip16
+	CLC : ADC.w !ui_tmp4&$FFFF
	BMI .skip16
	CMP.w #8+1
	BCC .skip16
	LDA.w $0801,Y
	AND.w #$00FF
	CLC : ADC.w !ui_tmp4&$FFFF
	CMP.w #8+1
	BCC .skip16
.room
	LDA.w !ui_front_n&$FFFF
	CMP.w #!UI_FRONT_MAX
	BCS .skip16
	LDA.w !core_oam_limit&$FFFF       ; room for one more after the run
	SEC : SBC.w !core_oam_cursor&$FFFF
	BCC .skip16
	CMP.w #4
	BCC .skip16
	JSR ui_front_move
.skip16
	SEP #$20
.skip
	PLX
	RTS

; Move native Y (OAM byte offset, !ui_tmp3 its high bits) to the module
; cursor and mark its own slot. M16.
ui_front_move:
	; remember the native entry (SRAM, 8 bytes each)
	LDA.w !ui_front_n&$FFFF
	ASL : ASL : ASL
	TAX
	TYA
	LSR : LSR
	STA.l !ui_front,X                 ; slot
	LDA.w $0800,Y : STA.l !ui_front+2,X
	LDA.w $0802,Y : STA.l !ui_front+4,X
	LDA.w !ui_tmp3&$FFFF : STA.l !ui_front+6,X
	INC.w !ui_front_n&$FFFF
	LDA.w $0800,Y : STA.w !ui_tmp4&$FFFF
	LDA.w $0802,Y : STA.w !ui_tmp5&$FFFF
	LDA.w #!UI_FRONT_MARK
	STA.w $0800,Y
	; fall through: the copy at the cursor
; Add !ui_tmp4 (x/y), !ui_tmp5 (tile/attributes) with high bits !ui_tmp3
; at the module cursor. M16; keeps Y.
ui_front_put:
	PHY
	LDY.w !core_oam_cursor&$FFFF
	LDA.w !ui_tmp4&$FFFF : STA.w $0800,Y
	LDA.w !ui_tmp5&$FFFF : STA.w $0802,Y
	TYA
	CLC : ADC.w #4
	STA.w !core_oam_cursor&$FFFF
	TYA
	AND.w #$000C
	STA.w !ui_tmp4&$FFFF              ; (slot & 3) * 4
	ORA.w !ui_tmp3&$FFFF
	STA.w !ui_tmp5&$FFFF              ; [slot & 3][high bits]
	TYA
	LSR : LSR : LSR : LSR
	TAY                               ; the high-table byte
	SEP #$30
	LDA.w $0A00,Y
	LDX.w !ui_tmp4&$FFFF
	AND.l ui_hi_clr16,X
	LDX.w !ui_tmp5&$FFFF
	ORA.l ui_hi_set,X
	STA.w $0A00,Y
	REP #$30
	PLY
	RTS

; Per (slot & 3) * 4: the slot's two high-table bits, and the byte without them.
ui_hi_field16:
	db $03,0,0,0, $0C,0,0,0, $30,0,0,0, $C0
ui_hi_clr16:
	db $FC,0,0,0, $F3,0,0,0, $CF,0,0,0, $3F

; A = the 2 high-table bits (bit0 x bit 8, bit1 large) of slot !ui_tmp2.
ui_oam_hibits:
	PHX
	LDA.w !ui_tmp2&$FFFF
	LSR : LSR
	TAX
	LDA.w $0A00,X
	AND.w #$00FF
	STA.w !ui_tmp4&$FFFF
	LDA.w !ui_tmp2&$FFFF
	AND.w #$0003
	TAX
	LDA.w !ui_tmp4&$FFFF
-	DEX
	BMI +
	LSR : LSR
	BRA -
+	AND.w #$0003
	PLX
	RTS

; Give back every native entry hidden last frame that the game did not
; rewrite (the dial is going away). DB = $7E.
ui_dial_unfront:
	LDA.w #$FFFF
	BRA ui_unfront_list
; The same before a scan, except natives in the half of slots 0-63 that is
; not scanned this frame: they stay hidden and go behind the dial again.
ui_dial_unfront_keep:
	LDA.w !ui_frame&$FFFF
	AND.w #$0001
ui_unfront_list:
	STA.w !ui_tmp0&$FFFF              ; half scanned now, or $FFFF: all
	LDA.w !ui_front_n&$FFFF
	BEQ .done
	STA.w !ui_tmp1&$FFFF              ; entries to look at
	STZ.w !ui_front_n&$FFFF           ; rebuilt with the kept ones
	LDX.w #$0000                      ; entry offset
.e
	LDA.l !ui_front,X                 ; slot
	ASL : ASL
	TAY                               ; its OAM byte offset
	LDA.w $0800,Y
	CMP.w #!UI_FRONT_MARK
	BNE .next                         ; rewritten by the game: forget it
	LDA.w !ui_tmp0&$FFFF
	BMI .restore
	LDA.l !ui_front,X
	CMP.w #64
	BCS .restore                      ; scanned every frame
	LSR : LSR : LSR : LSR : LSR       ; its half
	EOR.w !ui_tmp0&$FFFF
	LSR
	BCC .restore                      ; scanned this frame
	JSR ui_front_keep
	BRA .next
.restore
	LDA.l !ui_front+2,X : STA.w $0800,Y
	LDA.l !ui_front+4,X : STA.w $0802,Y
.next
	TXA
	CLC : ADC.w #8
	TAX
	DEC.w !ui_tmp1&$FFFF
	BNE .e
.done
	RTS

; Entry X stays hidden: its copy at the cursor again, and the entry moves
; to the end of the rebuilt list (never past X). Y = its OAM offset.
ui_front_keep:
	LDA.w !core_oam_limit&$FFFF
	SEC : SBC.w !core_oam_cursor&$FFFF
	BCC .restore
	CMP.w #4
	BCS +
.restore
	LDA.l !ui_front+2,X : STA.w $0800,Y   ; no room: back in front
	LDA.l !ui_front+4,X : STA.w $0802,Y
	RTS
+	LDA.l !ui_front+2,X : STA.w !ui_tmp4&$FFFF
	LDA.l !ui_front+4,X : STA.w !ui_tmp5&$FFFF
	LDA.l !ui_front+6,X : STA.w !ui_tmp3&$FFFF
	PHX
	JSR ui_front_put
	PLX
	LDA.w !ui_front_n&$FFFF
	ASL : ASL : ASL
	PHY
	TAY                               ; write offset (<= X)
	LDA.l !ui_front,X : PHX : TYX : STA.l !ui_front,X : PLX
	LDA.l !ui_front+2,X : PHX : TYX : STA.l !ui_front+2,X : PLX
	LDA.l !ui_front+4,X : PHX : TYX : STA.l !ui_front+4,X : PLX
	LDA.l !ui_front+6,X : PHX : TYX : STA.l !ui_front+6,X : PLX
	PLY
	INC.w !ui_front_n&$FFFF
	RTS
