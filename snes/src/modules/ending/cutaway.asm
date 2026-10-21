; ===========================================================================
; The Fortress cutaway in world flight (second code area, $AA:C000).
; planet-view.js prepare() with a shot (world-ki.js cutaway, 186 frames):
; the world module counts !w_cut_age 0-185 after its Fortress explosion and
; keeps flying the world underneath; while it runs, the picture is ours:
; Mode 1 with an oriented globe on BG1 (night during Frieza's crisis,
; planet-view drawPlanet), the stars, the beam and its shock ring on BG2
; (footprint cells redrawn per age), the dust as OBJ, the fade (164-186) in
; the palettes. Everything per age comes from ending-cutaway.mjs. The world
; module's own stand-in fades $E6, which keeps the world black after the
; cutaway until the deck landing.
;
; VRAM (words), clear of what world flight still writes meanwhile (Mode 7
; characters $2200-$2FFF animated by the native NMI, its sky map rows in
; $5000-$5FFF, the world module's OBJ region $6600-$6FFF): BG1 characters
; from $3000 (blank, then one slot per globe cell; below $4C00),
; BG1 map $4C00, BG2 map $6000, BG2 characters $7000
; (stars, then the footprint slots), OBJ tiles 64-93 at $6400 (OBJ base
; $6000 as the world's). The native Mode 7 row and column uploads are
; dropped meanwhile ($2E/$2F) and the world module pauses its crater
; refresh: their VRAM is ours, and the deck landing reloads everything.
; ===========================================================================

!CUT_BG1_MAP = $4C00
!CUT_BG1_CHR = $3000
!CUT_BG2_MAP = $6000
!CUT_BG2_CHR = $7000
!CUT_OBJ_CHR = $6400
assert !ENDING_CUT_GLOBE_COLS == 8 && !ENDING_CUT_GLOBE_ROWS == 4, "cutaway selector grid changed"

; World frame (modules_world_frame, after the world module): M16/X16, DB = $7E.
; The cutaway runs while the world module's block is live (its magic word),
; its explosion was the Fortress's and !w_cut_age counts 0-185.
ending_world_frame:
	PHP
	REP #$30
	LDA.l $7E0000|!w_magic
	CMP.w #!WORLD_MAGIC
	BNE .idle
	LDA.l $7E0000|!w_expl_flags
	AND.w #$0002
	BEQ .idle
	LDA.l $7E0000|!w_cut_age
	CMP.w #!ENDING_CUT_AGES
	BCC .running
.idle
	SEP #$20
	LDA.l !ending_cut_on
	BEQ .out
	LDA.b #$00
	STA.l !ending_cut_on
	LDA.b #$01
	STA.l !ending_cut_end          ; VTIME back at the next vblank
	BRA .out
.running
	STA.l !ending_cut_age
	SEP #$20
	LDA.l !ending_cut_on
	BNE .on
	; First frame: the next vblank loads the stage under forced blank.
	LDA.b #$01
	STA.l !ending_cut_on
	STA.l !ending_cut_load
	LDA.b #$FF
	STA.l !ending_cut_level        ; no palette uploaded yet
	REP #$30
	LDA.w #!STORY_Q_FRIEZA_CRISIS  ; planet-view drawPlanet(target, crisisActive)
	JSL ending_query_far
	REP #$30
	AND.w #$00FF
	SEP #$20
	BEQ +
	LDA.b #$01
+	STA.l !ending_cut_night
	JSR cut_select_globe
	BRA .out                       ; no OAM yet: the world's HDMA may hold channel 7
.on
	LDA.l !ending_cut_load
	BNE .out                       ; the stage is not loaded yet
	; the native Mode 7 row/column uploads would land in our VRAM
	LDA.b #$00
	STA.l $7E002E
	STA.l $7E002F
	JSR cut_oam
.out
	PLP
	RTL

; Once per cutaway. world-ki latches the target when firing, before the
; Fortress moves again. planet-view rounds it to eight units first. An
; 8x4 nearest grid wraps at 4096, plus the two retained reference targets
; when their wrapped Manhattan distance is smaller. Zero is valid.
cut_select_globe:
	REP #$30
	LDA.l $7E0000|!w_shot_tx
	CLC : ADC.w #4
	AND.w #$0FF8
	STA.l !ending_target_x
	CLC : ADC.w #256
	AND.w #$0E00
	XBA : LSR
	STA.l !ending_cut_globe
	LDA.l $7E0000|!w_shot_ty
	CLC : ADC.w #4
	AND.w #$0FF8
	STA.l !ending_target_y
	CLC : ADC.w #512
	AND.w #$0C00
	XBA : ASL
	ORA.l !ending_cut_globe
	STA.l !ending_cut_globe
	; Distance to the nearest regular grid point.
	LDA.l !ending_target_x
	AND.w #$01FF
	CMP.w #256
	BCC +
	EOR.w #$01FF : INC
+	STA.l !ending_tmp
	LDA.l !ending_target_y
	AND.w #$03FF
	CMP.w #512
	BCC +
	EOR.w #$03FF : INC
+	CLC : ADC.l !ending_tmp
	STA.l !ending_tmp
	; Preserve the native flight preset and the established default picture.
	LDX.w #$0000
.extra
	LDA.l !ending_target_x
	SEC : SBC.l ending_cut_globe_extra_targets,X
	JSR cut_wrap_distance
	STA.l !ending_tmp2
	LDA.l !ending_target_y
	SEC : SBC.l ending_cut_globe_extra_targets+2,X
	JSR cut_wrap_distance
	CLC : ADC.l !ending_tmp2
	CMP.l !ending_tmp
	BCS +
	STA.l !ending_tmp
	TXA : LSR : LSR
	CLC : ADC.w #(!ENDING_CUT_GLOBE_COLS*!ENDING_CUT_GLOBE_ROWS)
	STA.l !ending_cut_globe
+	INX : INX : INX : INX
	CPX.w #(!ENDING_CUT_GLOBE_EXTRAS*4)
	BNE .extra
	SEP #$20
	RTS
cut_wrap_distance:
	AND.w #$0FFF
	CMP.w #$0800
	BCC +
	EOR.w #$0FFF : INC
+	RTS

; This age's OAM image (dust) into the game's OAM buffer ($7E:0800, 544
; bytes; the world NMI uploads it): DMA channel 7 to WMDATA.
cut_oam:
	PHB
	PEA $3232 : PLB : PLB
	REP #$30
	LDA.l !ending_cut_age
	LDX.w #$0000
-	CMP.w #!ENDING_CUT_OAM_AGES
	BCC +
	SBC.w #!ENDING_CUT_OAM_AGES
	INX : INX : INX
	BRA -
+	STA.l !ending_tmp              ; age within the blob
	ASL : ASL : ASL : ASL : ASL    ; * 32
	STA.l !ending_tmp2
	LDA.l !ending_tmp
	XBA                            ; * 256
	ASL                            ; * 512
	CLC
	ADC.l !ending_tmp2             ; * 544
	CLC
	ADC.l ending_cut_oam_blobs,X
	JSL ending_dma_guard           ; not across the world vblank NMI
	STA.w $4372
	SEP #$20
	LDA.l ending_cut_oam_blobs+2,X
	STA.w $4374
	LDA.b #$00
	STA.w $4370                    ; A -> B, one register
	STA.w $2183
	LDA.b #$80                     ; WMDATA
	STA.w $4371
	REP #$20
	LDA.w #$0800
	STA.w $2181
	LDA.w #544
	STA.w $4375
	SEP #$20
	LDA.b #$80
.trigger
	STA.w $420B
	REP #$30
	PLB
	RTS

; World vblank (modules_world_nmi, after the world module's uploads; the
; world NMI is not force-blanked). DB = $80 on entry.
ending_world_nmi:
	PHB
	PHP
	PEA $3232 : PLB : PLB
	SEP #$20
	LDA.l !ending_cut_on
	BNE .on
	LDA.l !ending_cut_end
	BEQ .out
	LDA.b #$00
	STA.l !ending_cut_end
.restore
	STZ.w $420A                    ; VTIME below 256 again: the horizon IRQ returns
	BRA .out
.on
	LDA.b #$01                     ; VTIME >= 256: no horizon split (IRQ C0:8A4B
	STA.w $420A                    ; would switch to Mode 7) over our picture
	STZ.w $420C                    ; the world's HDMA off from the next frame
	LDA.l !ending_cut_load
	BEQ .live
	JSR cut_load
	BRA .out
.live
	JSR cut_regs
	SEP #$20
	LDA.b #$0F
	STA.w $2100
	JSR cut_cgram
	JSR cut_footprint
.out
	PLP
	PLB
	RTL

; PPU registers of the picture (each vblank: the world NMI sets its own).
cut_regs:
	SEP #$20
	LDA.b #$03 : STA.w $2101       ; OBJ base $6000, 8x8/16x16
	LDA.b #$01 : STA.w $2105       ; Mode 1
	STZ.w $2106
	LDA.b #(!CUT_BG1_MAP>>8) : STA.w $2107
	LDA.b #(!CUT_BG2_MAP>>8) : STA.w $2108
	LDA.b #((!CUT_BG2_CHR>>12)<<4)|(!CUT_BG1_CHR>>12) : STA.w $210B
	STZ.w $210D : STZ.w $210D
	STZ.w $210F : STZ.w $210F
	LDA.b #$FF                     ; V = -1: picture row 0 on the line of OBJ y 0
	STA.w $210E : STA.w $210E
	STA.w $2110 : STA.w $2110
	LDA.b #$13 : STA.w $212C       ; BG1, BG2, OBJ
	STZ.w $212D
	STZ.w $212E : STZ.w $212F
	STZ.w $2123 : STZ.w $2124 : STZ.w $2125
	STZ.w $2130 : STZ.w $2131
	REP #$20
	RTS

; The whole stage under forced blank (its DMA runs into the next frame,
; which stays black): globe, stars, the age's footprint, BG2 map, dust
; tiles, palette and registers.
cut_load:
	SEP #$20
	LDA.b #$80
	STA.w $2100
	LDA.b #$00
	STA.l !ending_cut_load
	JSR cut_globe
.stars
	SEP #$20
	LDA.b #ending_space_star_tiles>>16 : STA.l !ending_cut_bank
	REP #$20
	LDA.w #!CUT_BG2_CHR
	LDX.w #ending_space_star_tiles
	LDY.w #!ENDING_SPACE_STAR_TILES_SIZE
	JSR cut_vram
	SEP #$20
	LDA.b #ending_cut_fp0>>16 : STA.l !ending_cut_bank
	REP #$20
	LDA.w #!ENDING_CUT_FP_VRAM
	LDX.w #ending_cut_fp0
	LDY.w #!ENDING_CUT_FP0_SIZE
	JSR cut_vram
	SEP #$20
	LDA.b #ending_cut_bg2_map>>16 : STA.l !ending_cut_bank
	REP #$20
	LDA.w #!CUT_BG2_MAP
	LDX.w #ending_cut_bg2_map
	LDY.w #$0800
	JSR cut_vram
	SEP #$20
	LDA.b #ending_cut_obj>>16 : STA.l !ending_cut_bank
	REP #$20
	LDA.w #!CUT_OBJ_CHR
	LDX.w #ending_cut_obj
	LDY.w #!ENDING_CUT_OBJ_SIZE
	JSR cut_vram
	LDA.w #$0000
	STA.l !ending_cut_shown        ; age 0's footprint is in VRAM
	STA.l !ending_cut_runs
	JSR cut_cgram
	JSR cut_regs
	REP #$30
	RTS
; Scatter consecutive runs from the shared dictionary, then set the map's
; palette/flip rows. All writes are under cut_load's forced blank, HDMA off.
; A run is a word dictionary tile number followed by a byte tile count;
; it never crosses a bank. The maps all use fixed sequential BG1 slots.
; No temporary tile/map buffer and no decoder in the live frame path.
cut_globe:
	LDA.b #ending_cut_globe_tiles0>>16
	STA.l !ending_cut_bank
	REP #$30
	LDA.w #!CUT_BG1_CHR
	LDX.w #$0000
	LDY.w #32                      ; transparent tile 0
	JSR cut_vram
	SEP #$20
	LDA.b #ending_cut_globe_refs>>16
	STA.l !ending_cut_bank
	REP #$20
	LDA.w #!CUT_BG1_MAP
	LDX.w #ending_cut_globe_refs    ; shared map: sequential tile IDs, no attributes
	LDY.w #$0800
	JSR cut_vram
	PHB
	PEA $AAAA : PLB : PLB          ; fast tables in this code quarter; I/O visible
	LDA.l !ending_cut_globe
	ASL : ASL : TAX                ; four-byte descriptor: first run, run end
	LDA.w ending_cut_globe_offsets+2,X
	STA.l !ending_tmp2
	LDA.w ending_cut_globe_offsets,X
	SEC : SBC.w #(!ENDING_CUT_GLOBE_WIDTH*!ENDING_CUT_GLOBE_HEIGHT)
	STA.l !ending_tmp              ; attributes immediately precede the runs
	LDA.w ending_cut_globe_offsets,X
	TAX
	LDA.w #(!CUT_BG1_CHR+16)
	STA.w $2116                    ; all runs append to consecutive VRAM slots
.run
	LDA.l ending_cut_globe_refs,X
	ASL : ASL : ASL : ASL : ASL
	AND.w #$7FFF
	STA.w $4372
	LDA.l ending_cut_globe_refs+1,X
	AND.w #$001C                   ; dictionary tile bits 10-12 = bank index
	LSR : LSR : TAY
	SEP #$20
	LDA.w ending_cut_globe_banks,Y
	STA.w $4374
	REP #$20
	LDA.l ending_cut_globe_refs+2,X
	AND.w #$00FF
	ASL : ASL : ASL : ASL : ASL
	STA.w $4375
	SEP #$20
	LDA.b #$80
	STA.w $420B
	REP #$20
	INX : INX : INX
	TXA : CMP.l !ending_tmp2
	BNE .run
	LDA.l !ending_tmp
	CLC : ADC.w #ending_cut_globe_refs
	STA.w $4372
	SEP #$20
	LDA.b #ending_cut_globe_refs>>16
	STA.w $4374
	STZ.w $4370                    ; A -> B, one register (map high bytes only)
	LDA.b #$19
	STA.w $4371
	REP #$20
	LDX.w #$0000
.map
	LDA.w ending_cut_globe_map_rows,X
	STA.w $2116
	LDA.w #!ENDING_CUT_GLOBE_WIDTH
	STA.w $4375
	SEP #$20
	LDA.b #$80
	STA.w $420B                    ; $2119 increments the VRAM word address
	REP #$20
	INX : INX
	CPX.w #(!ENDING_CUT_GLOBE_HEIGHT*2)
	BNE .map
	PLB
	SEP #$20
	RTS

; VRAM word address A, source X (low 16) in bank !ending_cut_bank, Y bytes:
; DMA channel 7 into $2118/$2119. M16/X16, DB = $32.
cut_vram:
	STA.w $2116
	STX.w $4372
	STY.w $4375
	SEP #$20
	LDA.l !ending_cut_bank
	STA.w $4374
	LDA.b #$80
	STA.w $2115
	LDA.b #$01
	STA.w $4370                    ; A -> B, two registers
	LDA.b #$18
	STA.w $4371
	LDA.b #$80
	STA.w $420B
	REP #$20
	RTS

; The palette of this age's fade level (planet-view: age > 164, factor
; (186 - age) / 22): 512 bytes into CGRAM when the level changes, and again
; after world flight's NMI uploaded its own palette (C0:8A79: $E3 bit 6,
; $F5 bit 0 clear, $F4 bit 7 clear).
cut_cgram:
	SEP #$20
	LDA.l $7E00E3
	AND.b #$40
	BEQ .level
	LDA.l $7E00F5
	LSR
	BCS .level
	LDA.l $7E00F4
	BPL .upload                    ; the game's palette went in this vblank
.level
	REP #$30
	JSR cut_level
	SEP #$20
	CMP.l !ending_cut_level
	BNE .upload
	REP #$30
	RTS
.upload
	REP #$30
	JSR cut_level
	SEP #$20
	STA.l !ending_cut_level
	REP #$30
	AND.w #$00FF
	XBA
	ASL                            ; level * 512
	TAX
	SEP #$20
	STZ.w $2121
	LDA.b #$00
	STA.w $4370                    ; A -> B, one register
	LDA.b #$22
	STA.w $4371
	LDA.l !ending_cut_night
	REP #$20
	BEQ .day
	TXA
	CLC
	ADC.w #ending_cut_pal_night
	STA.w $4372
	SEP #$20
	LDA.b #ending_cut_pal_night>>16
	BRA .go
.day
	TXA
	CLC
	ADC.w #ending_cut_pal_day
	STA.w $4372
	SEP #$20
	LDA.b #ending_cut_pal_day>>16
.go
	STA.w $4374
	REP #$20
	LDA.w #512
	STA.w $4375
	SEP #$20
	LDA.b #$80
	STA.w $420B
	REP #$30
	RTS

; A16 = the fade level of this age: 0 (none) up to 21.
cut_level:
	LDA.l !ending_cut_age
	SEC
	SBC.w #164
	BCS +
	LDA.w #$0000
+	CMP.w #22
	BCC +
	LDA.w #21
+	RTS

; Bring the footprint up to this frame's age: each age's runs (word VRAM
; address, byte count, tiles) while the vblank's DMA budget lasts (lines
; left before core's last transfer line x 160 bytes, 96 more counted per
; run for its setup); an age cut short continues at the next vblank.
cut_footprint:
	REP #$30
	SEP #$20
	LDA.b #$80 : STA.w $2115
	LDA.b #$01 : STA.w $4370       ; A -> B, two registers
	LDA.b #$18 : STA.w $4371
	REP #$20
.age
	LDA.l !ending_cut_runs
	BNE .resume
	LDA.l !ending_cut_shown
	CMP.l !ending_cut_age
	BCC .start
	RTS
.start
	INC                            ; the next age
	STA.l !ending_tmp
	ASL : ASL
	CLC
	ADC.l !ending_tmp              ; * 5: dl first run, dw run count
	TAX
	LDA.l ending_cut_delta_rows+3,X
	BNE .some
	LDA.l !ending_tmp              ; nothing changes at this age
	STA.l !ending_cut_shown
	BRA .age
.some
	STA.l !ending_cut_runs
	LDA.l ending_cut_delta_rows,X
	STA.l !ending_cut_ptr
	LDA.l ending_cut_delta_rows+1,X
	STA.l !ending_cut_ptr+1
.resume
	; Refresh for each age, including after empty ages. A still/test age jump
	; may replay many ages in one NMI; their bookkeeping also costs time.
	JSL core_vblank_lines
	REP #$30
	ASL : ASL : ASL : ASL : ASL    ; lines * 32
	STA.l !ending_tmp2
	ASL : ASL                      ; * 128
	CLC
	ADC.l !ending_tmp2             ; * 160
	STA.l !ending_cut_budget
	PHB
	SEP #$20
	LDA.l !ending_cut_ptr+2
	STA.w $4374
	PHA
	PLB                            ; DB = the runs' bank: I/O by long addressing
	REP #$20
	LDA.l !ending_cut_ptr
	TAX
.run
	LDA.w $0002,X                  ; bytes
	CLC
	ADC.w #96
	CMP.l !ending_cut_budget
	BCS .later
	EOR.w #$FFFF
	SEC
	ADC.l !ending_cut_budget
	STA.l !ending_cut_budget
	LDA.w $0000,X
	STA.l $002116
	LDA.w $0002,X
	STA.l $004375
	TXA
	CLC
	ADC.w #4
	STA.l $004372
	SEP #$20
	LDA.b #$80
	STA.l $00420B
.ran                                 ; (the DMA has ended when the CPU runs on)
	REP #$20
	TXA
	CLC
	ADC.w #4
	CLC
	ADC.w $0002,X
	TAX
	LDA.l !ending_cut_runs
	DEC
	STA.l !ending_cut_runs
	BNE .run
	PLB
	LDA.l !ending_cut_shown
	INC
	STA.l !ending_cut_shown
	JMP .age
.later
	TXA
	STA.l !ending_cut_ptr
	PLB
	RTS

incsrc "ending/ending_cut_tables.asm"
