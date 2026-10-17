; World flight (Mode 7): the telepathy/radar band and the Dragon Radar dial.
; Included in the UI code bank. Browser: native-radio.js (aerial messages at
; line 152), dragon-radar.js (panel at 152-215, dial 48x48 at (8,8)).
;
; The bottom of the world screen is Mode 7, which has no BG3, and a 240x64
; window would need 60 16x16 sprites (the world gives modules 40). So the
; band is switched to Mode 1 for lines 152-215 by two IRQs chained off the
; game's horizon IRQ (C0:8A4B, hijacked):
;   horizon (native timing): the game's own work; arms V=151 when shown.
;   V=151: in this HBlank the band colours (palettes 2/3, CGRAM 9-15; the
;          Mode 7 ground uses colours 64+) go in by DMA; in the next HBlank
;          BGMODE $09 (BG3 priority) and TM $14 (BG3 + OBJ). Arms V=216.
;   V=216: BGMODE 7 and TM $13 back; in the next HBlank the sky's colours
;          9-15 are restored by DMA (from a copy read in vblank).
; BG3 (unused elsewhere in flight) points at core OBJ region B: map $7000
; (rows 19-26 = $7260-$735F), tiles from $7000 (the opaque world atlas at
; tile $6C = $7360). The band is opaque: the window's dither holes and the
; side gutters are black, since the ground cannot show through.
; The dial is OBJ (palette 3 = CGRAM 176-191, unused by sky and ground) in
; core region C (tiles $190-$1FF): nine static 16x16 cells, the sweep as
; up to !UI_SWEEP_TILES 8x8 sprites for 64 angles, the blip and the centre.

!UI_VRAM_OWNER = $0C              ; core_vram_claim owner id (bank $AC)
!UI_BAND_V0 = 152                 ; IRQ line before the band (BGMODE lands at line 153 = output 152)
!UI_BAND_V1 = 216                 ; IRQ line of the band's end
!UI_BAND_H  = 40                  ; IRQ dot: the handler reaches its HBlank wait well before dot 274
!UI_NATIVE_HTIME = 132            ; the game's horizon IRQ dot
!UI_BAND_ROW = 19                 ; BG3 rows 19-26 = lines 152-215 (VOFS -1)
!UI_WMAP  = $7000                 ; BG3 map (BG3SC $70)
!UI_WCHR  = $7000                 ; BG3 tiles (BG34NBA $07)
!UI_DIAL_VRAM = $7900             ; OBJ tile $190
!UI_DIAL_TILE = $190
!UI_SWEEP_TILE = $196
!UI_BLIP_TILE  = $1A6
!UI_CTR_TILE   = $1A7
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
	LDA.w !ui_cur&$FFFF
	STA.w !ui_tmp5&$FFFF
	LDA.w !ui_cur_par&$FFFF
	STA.w !ui_tmp4&$FFFF
	JSR ui_band_prepare
	BCS .wait
	LDA.w !ui_tmp5&$FFFF
	CMP.w !ui_band_key&$FFFF
	BNE .drawRadio
	LDA.w !ui_tmp4&$FFFF
	CMP.w !ui_band_par&$FFFF
	BEQ .shown
.drawRadio
	JSR ui_build_text
	BRA .upload
.radar
	JSR ui_band_prepare
	BCS .dial
	JSR ui_radar_key
	CMP.w !ui_band_key&$FFFF
	BEQ .shownRadar
	STA.w !ui_tmp5&$FFFF
	STZ.w !ui_tmp4&$FFFF
	JSR ui_radar_text
.upload
	JSR ui_build_wmap
	LDA.w #!SRAM_WORK_UI>>16
	STA.w !core_scratch&$FFFF
	LDA.w #!UI_WMAP+(!UI_BAND_ROW*32)
	LDX.w #$0200
	LDY.w #!ui_s_map&$FFFF
	JSL core_queue_vram
	BCS .wait
	LDA.w !ui_tmp5&$FFFF : STA.w !ui_band_key&$FFFF
	LDA.w !ui_tmp4&$FFFF : STA.w !ui_band_par&$FFFF
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

; Build the band's 8 rows (32 entries) in !ui_s_map from !ui_s_text: the
; native window layout with the world atlas, black gutters.
!UI_WT_FRAME = $2000|(3<<10)
!UI_WT_TEXT  = $2000|(2<<10)
ui_build_wmap:
	LDX.w #$0000
	LDA.w #!UI_WT_FRAME|!UI_W_CORNER
	LDY.w #!UI_WT_FRAME|!UI_W_EDGE
	JSR ui_wm_edge
	LDX.w #$01C0
	LDA.w #!UI_WT_FRAME|!UI_W_CORNER|$8000
	LDY.w #!UI_WT_FRAME|!UI_W_EDGE|$8000
	JSR ui_wm_edge
	LDA.w #$0040
	STA.w !ui_tmp0&$FFFF              ; row byte offset
	STZ.w !ui_tmp1&$FFFF              ; text offset of the line
	STZ.w !ui_tmp2&$FFFF              ; 0 top, 1 bottom half
.row
	LDX.w !ui_tmp0&$FFFF
	LDA.w #!UI_WT_FRAME|!UI_W_BLACK
	STA.l !ui_s_map+$00,X
	STA.l !ui_s_map+$3E,X
	LDA.w #!UI_WT_FRAME|!UI_W_SIDE
	STA.l !ui_s_map+$02,X
	ORA.w #$4000
	STA.l !ui_s_map+$3C,X
	LDY.w #$0000
.col
	TYA
	CLC : ADC.w !ui_tmp1&$FFFF
	TAX
	LDA.l !ui_s_text,X
	AND.w #$00FF
	CMP.w #!UI_ATLAS_FIRST
	BCC .space
	CMP.w #(!UI_ATLAS_FIRST+!UI_ATLAS_GLYPHS)
	BCC +
.space
	LDA.w #!UI_ATLAS_FIRST
+	SEC : SBC.w #!UI_ATLAS_FIRST
	TAX
	LDA.l ui_wglyph,X
	AND.w #$00FF
	CLC : ADC.w !ui_tmp2&$FFFF
	ORA.w #!UI_WT_TEXT
	STA.w !ui_tmp3&$FFFF
	TYA
	ASL
	CLC : ADC.w !ui_tmp0&$FFFF
	TAX
	LDA.w !ui_tmp3&$FFFF
	STA.l !ui_s_map+$04,X
	INY
	CPY.w #28
	BCC .col
	LDA.w !ui_tmp0&$FFFF
	CLC : ADC.w #$0040
	STA.w !ui_tmp0&$FFFF
	LDA.w !ui_tmp2&$FFFF
	EOR.w #$0001
	STA.w !ui_tmp2&$FFFF
	BEQ +
	JMP .row
+	LDA.w !ui_tmp1&$FFFF
	CLC : ADC.w #28
	STA.w !ui_tmp1&$FFFF
	CMP.w #84
	BCS +
	JMP .row
+	RTS
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
	BRA .dial
.on
	LDA.w #$0001
	STA.l !ui_band_was
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
	LDA.l !ui_dial_up
	BEQ .done
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
	; the horizon: arm the band when it is shown, then the game's handler
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
	BNE .no                           ; the radio has the band
+	LDA.w !ui_charge_seen&$FFFF
	BNE .no
	JSR ui_world_can_show
	BCC .no
	JSL !UI_RADAR_STATE_FN
	REP #$30
	STA.w !ui_rmask&$FFFF
	STX.w !ui_rflags&$FFFF
	TXA
	AND.w #!UIR_DOCKING|!UIR_SHOT
	BNE .no
	JSR ui_radar_target
	BCC .no
	JSR ui_radar_bearing
	LDA.w #$0001
	STA.w !ui_radar_on&$FFFF
.no
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

; radarBearing(): relative angle = heading - atan2(-dx, -dy) (heading units,
; 1024 per turn), distance = hypot(dx, dy) on the 4096 wrap; the guide and
; the blip position.
!ui_dx = !ui_tmp0
!ui_dy = !ui_tmp1
ui_radar_bearing:
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
	; beta = atan2(-dx, -dy): angle of (-dx, -dy) measured from +y towards +x
	LDA.w !ui_dx&$FFFF
	EOR.w #$FFFF : INC
	STA.w !ui_tmp2&$FFFF              ; sx = -dx (component along "sin")
	LDA.w !ui_dy&$FFFF
	EOR.w #$FFFF : INC
	STA.w !ui_tmp3&$FFFF              ; cy = -dy (component along "cos")
	JSR ui_atan2                      ; A = beta (0-1023), !ui_rdist = hypot
	STA.w !ui_tmp4&$FFFF
	LDA.w $00F6
	SEC : SBC.w !ui_tmp4&$FFFF
	CLC : ADC.w #512
	AND.w #$03FF
	SEC : SBC.w #512
	STA.w !ui_rrel&$FFFF              ; heading - beta in (-512, 512]
	; guide
	LDA.w !ui_rdist&$FFFF
	CMP.w #100
	BCS +
	LDA.w #0
	BRA .guide
+	LDA.w !ui_rrel&$FFFF
	BPL +
	EOR.w #$FFFF : INC
+	CMP.w #33                         ; |angle| < 0.2 rad (32.6 units)
	BCS +
	LDA.w #1
	BRA .guide
+	CMP.w #441                        ; |angle| > 2.7 rad (440.0 units)
	BCC +
	LDA.w #2
	BRA .guide
+	LDA.w !ui_rrel&$FFFF
	BMI +
	LDA.w #4                          ; RIGHT
	BRA .guide
+	LDA.w #3                          ; LEFT
.guide
	STA.w !ui_rguide&$FFFF
	; blip: radius = min(18, dist / 50) (8.8), at the relative angle
	LDA.w !ui_rdist&$FFFF
	CMP.w #900
	BCC +
	LDA.w #18<<8
	BRA .rad
+	ASL : ASL : ASL : ASL : ASL       ; dist * 32 (< 28800)
	STA.l $004204
	SEP #$20
	LDA.b #25                         ; /25: dist*256/200... (dist*32/25 = dist/50*256/... see below)
	STA.l $004206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.l $004214                     ; dist*32/25 = dist*256/200 -> need dist*256/50
	ASL : ASL                         ; * 4: radius in 8.8
.rad
	STA.w !ui_tmp2&$FFFF              ; radius 8.8
	; x = 24 + sin(rel) * r, y = 24 - cos(rel) * r (rounded)
	LDA.w !ui_rrel&$FFFF
	LSR : LSR                         ; 1024 -> 256 steps (sign kept by AND)
	AND.w #$00FF
	PHA
	ASL
	TAX
	LDA.l ui_sin256,X
	JSR ui_mul_r                      ; A = sin * r (8.8 * 8.8 -> pixels*256)
	CLC : ADC.w #(24<<8)+128
	XBA : AND.w #$00FF
	STA.w !ui_blip_x&$FFFF
	PLA
	CLC : ADC.w #64                   ; cos = sin(a + 90 deg)
	AND.w #$00FF
	ASL
	TAX
	LDA.l ui_sin256,X
	JSR ui_mul_r
	EOR.w #$FFFF : INC
	CLC : ADC.w #(24<<8)+128
	XBA : AND.w #$00FF
	STA.w !ui_blip_y&$FFFF
	RTS

; A16 = signed 8.8 (|v| <= 256) times !ui_tmp2 (radius 8.8, <= 18.0)
; -> A16 = signed product in 8.8 (pixels * 256).
ui_mul_r:
	PHP
	CMP.w #$8000
	ROR.w !ui_tmp5&$FFFF              ; sign in bit 15 of tmp5
	BIT.w !ui_tmp5&$FFFF
	BPL +
	EOR.w #$FFFF : INC
+	STA.w !ui_tmp3&$FFFF              ; |v| (0-256)
	; |v| * r / 256 with 16x16 via the 8x8 multiplier
	; r = rh*256 + rl, v = vh*256 + vl (vh 0/1)
	SEP #$20
	LDA.w !ui_tmp3&$FFFF : STA.l $004202
	LDA.w !ui_tmp2&$FFFF : STA.l $004203   ; vl * rl
	REP #$20
	NOP : NOP : NOP
	LDA.l $004216
	XBA : AND.w #$00FF                ; (vl*rl) >> 8
	STA.w !ui_tmp4&$FFFF
	SEP #$20
	LDA.w !ui_tmp3&$FFFF : STA.l $004202
	LDA.w (!ui_tmp2&$FFFF)+1 : STA.l $004203 ; vl * rh
	REP #$20
	NOP : NOP : NOP
	LDA.l $004216
	CLC : ADC.w !ui_tmp4&$FFFF
	STA.w !ui_tmp4&$FFFF
	LDA.w (!ui_tmp3&$FFFF)+1          ; vh: |v| = 256 -> + r
	AND.w #$00FF
	BEQ +
	LDA.w !ui_tmp2&$FFFF
	CLC : ADC.w !ui_tmp4&$FFFF
	STA.w !ui_tmp4&$FFFF
+	LDA.w !ui_tmp4&$FFFF
	BIT.w !ui_tmp5&$FFFF
	BPL +
	EOR.w #$FFFF : INC
+	PLP
	RTS

; atan2 for (sx, cy) in tmp2/tmp3 (signed, |v| <= 2048): A16 = angle in
; heading units (0-1023) measured from +cy towards +sx; !ui_rdist = hypot.
ui_atan2:
	LDA.w !ui_tmp2&$FFFF
	BPL +
	EOR.w #$FFFF : INC
+	STA.w !ui_tmp4&$FFFF              ; |sx|
	LDA.w !ui_tmp3&$FFFF
	BPL +
	EOR.w #$FFFF : INC
+	STA.w !ui_tmp5&$FFFF              ; |cy|
	; octant: t = min/max * 128, base angle from the larger axis
	LDA.w !ui_tmp4&$FFFF
	ORA.w !ui_tmp5&$FFFF
	BNE .nz
	STZ.w !ui_rdist&$FFFF
	LDA.w #$0000
	RTS
.nz
	LDA.w !ui_tmp4&$FFFF
	CMP.w !ui_tmp5&$FFFF
	BCC .cyBig
	; |sx| >= |cy|: a = 256 - atan(|cy|/|sx|)
	LDX.w !ui_tmp5&$FFFF              ; min
	LDY.w !ui_tmp4&$FFFF              ; max
	JSR ui_ratio128                   ; A = k (0-128), dist computed
	TAX
	LDA.l ui_atan128,X
	AND.w #$00FF
	EOR.w #$FFFF : INC
	CLC : ADC.w #256
	BRA .quad
.cyBig
	LDX.w !ui_tmp4&$FFFF
	LDY.w !ui_tmp5&$FFFF
	JSR ui_ratio128
	TAX
	LDA.l ui_atan128,X
	AND.w #$00FF
.quad
	; a in [0, 256] for the first quadrant (sx >= 0, cy >= 0)
	STA.w !ui_tmp4&$FFFF
	LDA.w !ui_tmp3&$FFFF
	BMI .cyNeg
	LDA.w !ui_tmp2&$FFFF
	BPL .q1
	; sx < 0, cy >= 0: 1024 - a
	LDA.w #1024
	SEC : SBC.w !ui_tmp4&$FFFF
	AND.w #$03FF
	RTS
.q1
	LDA.w !ui_tmp4&$FFFF
	RTS
.cyNeg
	LDA.w !ui_tmp2&$FFFF
	BPL .q2
	; sx < 0, cy < 0: 512 + a
	LDA.w #512
	CLC : ADC.w !ui_tmp4&$FFFF
	RTS
.q2
	; sx >= 0, cy < 0: 512 - a
	LDA.w #512
	SEC : SBC.w !ui_tmp4&$FFFF
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
	; distance = max * sec[k] / 256 (max = original Y)
	ASL
	TAX
	LDA.l ui_sec128,X                 ; 256..362
	STA.w !ui_tmp0&$FFFF
	TYA
	STA.w !ui_tmp1&$FFFF              ; max (12-bit)
	; (max * sec) >> 8 with the 8x8 multiplier: max = mh*256 + ml
	SEP #$20
	LDA.w !ui_tmp1&$FFFF : STA.l $004202
	LDA.w !ui_tmp0&$FFFF : STA.l $004203       ; ml * sl
	REP #$20
	NOP : NOP : NOP
	LDA.l $004216
	XBA : AND.w #$00FF
	STA.w !ui_rdist&$FFFF
	SEP #$20
	LDA.w !ui_tmp1&$FFFF : STA.l $004202
	LDA.w (!ui_tmp0&$FFFF)+1 : STA.l $004203   ; ml * sh
	REP #$20
	NOP : NOP : NOP
	LDA.l $004216
	CLC : ADC.w !ui_rdist&$FFFF
	STA.w !ui_rdist&$FFFF
	SEP #$20
	LDA.w (!ui_tmp1&$FFFF)+1 : STA.l $004202
	LDA.w !ui_tmp0&$FFFF : STA.l $004203       ; mh * sl
	REP #$20
	NOP : NOP : NOP
	LDA.l $004216
	CLC : ADC.w !ui_rdist&$FFFF
	STA.w !ui_rdist&$FFFF
	SEP #$20
	LDA.w (!ui_tmp1&$FFFF)+1 : STA.l $004202
	LDA.w (!ui_tmp0&$FFFF)+1 : STA.l $004203   ; mh * sh (<< 8)
	REP #$20
	NOP : NOP : NOP
	LDA.l $004216
	XBA : AND.w #$FF00
	CLC : ADC.w !ui_rdist&$FFFF
	STA.w !ui_rdist&$FFFF
	PLA
	RTS

; Key of the radar text (changes when anything shown changes).
ui_radar_key:
	LDA.w !ui_rguide&$FFFF
	ASL : ASL : ASL : ASL
	ORA.w !ui_rtarget&$FFFF
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
	STA $01,S
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
	LDA.w #$8080
	LDX.w #82
.fill
	STA.l !ui_s_text,X
	DEX : DEX
	BPL .fill
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
	JSR ui_put_rom
	; line 2
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

; Copy the zero-terminated string at X (this bank) to the text cursor.
ui_put_rom:
	LDA.l !UI_BANKBASE,X
	AND.w #$00FF
	BEQ .done
	PHX
	JSR ui_bt_put
	PLX
	INX
	BRA ui_put_rom
.done
	RTS

ui_rs_guides:
	dw ui_rs_land, ui_rs_ahead, ui_rs_around, ui_rs_left, ui_rs_right
ui_rs_tnames:   ; 7 tree, 8 frieza, 9 dryad, 10 finale (Mana Beast when the Fortress is gone)
	dw ui_rs_tree_name, ui_rs_frieza_name, ui_rs_dryad_name, ui_rs_fortress_name
ui_rs_thints:
	dw ui_rs_tree_hint, ui_rs_frieza_hint, ui_rs_dryad_hint, ui_rs_finale_hint

; Without the providers: held | collected << 8 from !ui_stub_q, flags from
; !ui_stub_rf (tests).
ui_stub_radar_state:
	LDA.l !ui_stub_rf
	TAX
	LDA.l !ui_stub_q
	RTL

; ===========================================================================
; Dial: OBJ in region C.
ui_dial_hide:
	RTS

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
	CMP.w #7
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
	CMP.w !ui_sweep_up&$FFFF
	BEQ .sprites
	PHA
	DEC
	JSR ui_sweep_draw
	LDA.w #!SRAM_WORK_UI>>16
	STA.w !core_scratch&$FFFF
	LDA.w #!UI_DIAL_VRAM+((!UI_SWEEP_TILE-!UI_DIAL_TILE)*16)
	LDX.w #!UI_SWEEP_TILES*32
	LDY.w #!ui_s_sweep&$FFFF
	JSL core_queue_vram
	PLA
	BCS .sprites                      ; retry next frame
	STA.w !ui_sweep_up&$FFFF
.sprites
	; centre, blip (blinking), sweep tiles, then the nine base cells
	LDA.w #8+24
	STA.w !core_spr_x&$FFFF
	LDA.w #8+24
	STA.w !core_spr_y&$FFFF
	LDA.w #!UI_CTR_TILE|(!UI_DIAL_PAL<<9)|(3<<12)
	STA.w !core_spr_tile&$FFFF
	STZ.w !core_spr_size&$FFFF
	JSL core_oam_add
	LDA.w !ui_frame&$FFFF             ; frame % 30 < 22
	LDX.w #30
	JSR ui_mod
	CMP.w #22
	BCS .noBlip
	LDA.w !ui_blip_x&$FFFF
	CLC : ADC.w #8-1
	STA.w !core_spr_x&$FFFF
	LDA.w !ui_blip_y&$FFFF
	CLC : ADC.w #8-1
	STA.w !core_spr_y&$FFFF
	LDA.w #!UI_BLIP_TILE|(!UI_DIAL_PAL<<9)|(3<<12)
	STA.w !core_spr_tile&$FFFF
	JSL core_oam_add
.noBlip
	LDA.w !ui_sweep_up&$FFFF
	BEQ .base9
	DEC
	ASL
	TAX                               ; angle * 2 * tiles: positions table
	LDA.w #!UI_SWEEP_TILES
	STA.w !ui_tmp1&$FFFF
	TXA
	LDX.w #$0000
	LDY.w !ui_tmp1&$FFFF
	JSR ui_mul16
	TAX
	LDY.w #$0000
.sw
	LDA.l ui_sweep_pos,X
	AND.w #$00FF
	CMP.w #$00FF
	BEQ .swNext
	ASL : ASL : ASL
	CLC : ADC.w #8
	STA.w !core_spr_x&$FFFF
	LDA.l ui_sweep_pos+1,X
	AND.w #$00FF
	ASL : ASL : ASL
	CLC : ADC.w #8
	STA.w !core_spr_y&$FFFF
	TYA
	CLC : ADC.w #!UI_SWEEP_TILE|(!UI_DIAL_PAL<<9)|(3<<12)
	STA.w !core_spr_tile&$FFFF
	STZ.w !core_spr_size&$FFFF
	PHX
	PHY
	JSL core_oam_add
	PLY
	PLX
.swNext
	INX : INX
	INY
	CPY.w #!UI_SWEEP_TILES
	BCC .sw
.base9
	LDA.w #$0001
	STA.w !core_spr_size&$FFFF
	LDY.w #$0000
.cell
	TYA
	LDX.w #3
	JSR ui_mod                        ; column
	STA.w !ui_tmp0&$FFFF
	ASL : ASL : ASL : ASL
	CLC : ADC.w #8
	STA.w !core_spr_x&$FFFF
	TYA
	SEC
	LDX.w #$0000
-	SBC.w #3
	BCC +
	INX
	BRA -
+	TXA                               ; row
	STA.w !ui_tmp1&$FFFF
	ASL : ASL : ASL : ASL
	CLC : ADC.w #8
	STA.w !core_spr_y&$FFFF
	LDA.w !ui_tmp1&$FFFF
	ASL : ASL : ASL : ASL : ASL       ; row * 32 tiles
	CLC : ADC.w !ui_tmp0&$FFFF
	CLC : ADC.w !ui_tmp0&$FFFF        ; + col * 2
	CLC : ADC.w #!UI_DIAL_TILE|(!UI_DIAL_PAL<<9)|(3<<12)
	STA.w !core_spr_tile&$FFFF
	PHY
	JSL core_oam_add
	PLY
	INY
	CPY.w #9
	BCC .cell
	RTS

; Plot sweep angle A (0-63) into the staging tiles !ui_s_sweep.
ui_sweep_draw:
	PHA
	LDA.w #$0000
	LDX.w #(!UI_SWEEP_TILES*32)-2
.clr
	STA.l !ui_s_sweep,X
	DEX : DEX
	BPL .clr
	PLA
	LDY.w #38
	JSR ui_mul16                      ; angle * 38
	TAX
	LDY.w #19
.px
	LDA.l ui_sweep_plot,X
	AND.w #$00FF
	CMP.w #$00FF
	BEQ .next
	PHX
	PHA
	LDA.l ui_sweep_plot+1,X
	PLX
	SEP #$20
	ORA.l !ui_s_sweep,X
	STA.l !ui_s_sweep,X
	REP #$20
	PLX
.next
	INX : INX
	DEY
	BNE .px
	RTS

; Upload steps 0-5: the six tile rows of the base (6 tiles each), step 6:
; blip + centre tiles.
ui_dial_upload:
	LDA.w !ui_dial_up&$FFFF
	CMP.w #6
	BCS .fx
	PHA
	; source: row * 6 tiles * 32 bytes; destination: row * 16 tiles
	LDX.w #$0000
	LDY.w #192
	JSR ui_mul16
	CLC : ADC.w #ui_dial_data
	TAY
	PLA
	XBA                               ; row * $100 words
	CLC : ADC.w #!UI_DIAL_VRAM
	PHA
	LDA.w #ui_dial_data>>16
	STA.w !core_scratch&$FFFF
	PLA
	LDX.w #192
	JSL core_queue_vram
	BCS .out
	INC.w !ui_dial_up&$FFFF
.out
	RTS
.fx
	LDA.w #ui_dialfx_data>>16
	STA.w !core_scratch&$FFFF
	LDA.w #!UI_DIAL_VRAM+((!UI_BLIP_TILE-!UI_DIAL_TILE)*16)
	LDX.w #64
	LDY.w #ui_dialfx_data
	JSL core_queue_vram
	BCS .out
	INC.w !ui_dial_up&$FFFF
	RTS

; A = A * Y (16-bit, small values), X ignored.
ui_mul16:
	STA.w !ui_tmp4&$FFFF
	LDA.w #$0000
	CPY.w #$0000
	BEQ .done
-	CLC : ADC.w !ui_tmp4&$FFFF
	DEY
	BNE -
.done
	RTS

; A = A mod X (A, X > 0 small).
ui_mod:
	STX.w !ui_tmp4&$FFFF
-	CMP.w !ui_tmp4&$FFFF
	BCC +
	SBC.w !ui_tmp4&$FFFF
	BRA -
+	RTS
