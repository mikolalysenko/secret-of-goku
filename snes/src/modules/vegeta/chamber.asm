; The Hyperbolic Time Chamber (engine/time-chamber.js): map 72 expanded to
; 64 x 64 metatiles (static piece/door patches below), drawn with real BG
; tiles instead of the browser's per-pixel hook.
;
; Layers: BG1 (grid 7F:0000, metatiles 7F:C000) keeps the browser's
; collision layout exactly (floor 70, wall 11), which other modules' rules
; depend on (destroy/flight protect every layer-0 tile but 70); both ids are
; drawn transparent. BG2 (grid 7F:4000, metatiles 7F:C800) carries the whole
; picture: palace-stone floor, 64-pixel seams, border and the pavilion, one
; visual metatile per 16x16 cell. Its descriptors stay the native ones (all
; "13 06 00 00" in tileset 10), so collision and triggers are unchanged.
;
; Both hooks run inside the native map load (C0:BC0B), under its forced
; blank: the tileset tables are patched right after C2:A000 builds them and
; the BG2 grid right after the pieces are decompressed, before the initial
; screen is built from them (C0:CA95 loop), so the first displayed frame is
; already the chamber and the native scroll loader keeps drawing it.

; ---------------------------------------------------------------------------
; Static ROM patches (time-chamber.js load(): the browser patches the same
; bytes at ROM load, whether or not Goku is active).
%orig1(!VEGETA_PIECE_START, !VEGETA_ORIG_PIECE0)
%orig1(!VEGETA_PIECE_START+!VEGETA_PIECE_SLOT-1, !VEGETA_ORIG_PIECE_LAST)
%orig2(!VEGETA_PIECE_PTR, !VEGETA_ORIG_PTR)
%orig1(!VEGETA_DOOR_X, !VEGETA_ORIG_DOOR)
assert !VEGETA_PIECE_LEN <= !VEGETA_PIECE_SLOT, "chamber pieces exceed the trial slot"
%patch(!VEGETA_PIECE_START, !VEGETA_PIECE_LEN, vegeta)
pushpc
org !VEGETA_PIECE_START
	%vegeta_piece_bytes()
pullpc
%patch(!VEGETA_PIECE_PTR, 2, vegeta)
pushpc
org !VEGETA_PIECE_PTR
	dw !VEGETA_NEW_PTR
pullpc
%patch(!VEGETA_DOOR_X, 1, vegeta)
pushpc
org !VEGETA_DOOR_X
	db !VEGETA_NEW_DOOR
pullpc

; Tileset tables: C0:C4CA JSL $02A000 (header byte 2 = tileset in $1C).
%orig4($C0C4CA, $02A00022)
%hijack_jsl($C0C4CA, vegeta_tileset_hook, 4, vegeta)
; After the pieces (C0:C9F2 JSR $CB90 / C9F5 JSR $D037):
;   C0:C9F8 REP #$20 / SEP #$10
%orig4($C0C9F8, $10E220C2)
%hijack_jsl($C0C9F8, vegeta_grid_hook, 4, vegeta)

; ---------------------------------------------------------------------------
; C carry set when the map being loaded is the expanded chamber.
; Any M/X; preserves A (8 or 16 bit) and X/Y.
vegeta_is_chamber:
	PHP
	REP #$20
	PHA
	LDA.l $7E00DC
	CMP.w #!VEGETA_CHAMBER_MAP
	BNE .no
	PLA
	PLP
	SEC
	RTS
.no
	PLA
	PLP
	CLC
	RTS

; JSL from C0:C4CA, M8/X8, D = 0. Runs the native tileset loader, then for
; the chamber: BG1 floor/wall metatiles transparent, BG2 visual metatiles,
; BG palettes 2-7 and the chamber's BG tiles (VRAM tiles 0..n-1).
vegeta_tileset_hook:
	JSL $02A000
	JSR vegeta_is_chamber
	BCS .chamber
	RTL
.chamber
	PHP
	PHB
	REP #$30
	; BG1 metatiles 70 (floor) and 11 (wall): tile 0, transparent.
	LDA.w #$0000
	LDX.w #$0006
-	STA.l $7FC000+(70*8),X
	STA.l $7FC000+(11*8),X
	DEX
	DEX
	BPL -
	; BG2 metatiles 1..n (local ids; 0 stays the native blank).
	LDX.w #vegeta_chamber_meta
	LDY.w #$C808
	LDA.w #(!VEGETA_CHAMBER_METAS*8)-1
	db $54,$7F,vegeta_chamber_meta>>16 ; MVN data bank -> 7F
	; BG palettes 2-7 (colours 32-127) in the game's CGRAM buffer.
	LDX.w #vegeta_chamber_pal
	LDY.w #$0640
	LDA.w #(!VEGETA_CHAMBER_PALS*32)-1
	db $54,$7E,vegeta_chamber_pal>>16  ; MVN data bank -> 7E
	PEA $0000
	PLB
	PLB
	JSR vegeta_chamber_upload
	PLB
	PLP
	RTL

; JSL from C0:C9F8 (M8/X16 entering), replaced REP #$20 / SEP #$10. For the
; chamber, the BG2 grid (7F:4000, 128-byte rows) gets the visual layout.
vegeta_grid_hook:
	JSR vegeta_is_chamber
	BCC .done
	PHP
	PHB
	REP #$30
	LDA.w #$0000
.row
	PHA
	; X = source (bank E8), Y = 7F:4000 + row*128
	ASL
	ASL
	ASL
	ASL
	ASL
	ASL
	CLC
	ADC.w #vegeta_chamber_grid
	TAX
	LDA $01,S
	XBA
	LSR
	CLC
	ADC.w #$4000
	TAY
	LDA.w #!VEGETA_CHAMBER_W-1
	db $54,$7F,vegeta_chamber_grid>>16 ; MVN data bank -> 7F
	PLA
	INC
	CMP.w #!VEGETA_CHAMBER_H
	BCC .row
	PLB
	PLP
.done
	REP #$20
	SEP #$10
	RTL

; Upload the chamber's BG tiles to VRAM $0000 (BG1/BG2 character base) on
; DMA channel 6. Called inside the map load (forced blank, as the native
; graphics loader's own direct uploads at C1:F413). The transfer starts right
; after a vblank so the field NMI cannot touch the DMA/VRAM registers between
; setup and trigger; the CPU is halted for the transfer itself (~40 lines).
; M16/X16 in, DB = $00.
vegeta_chamber_upload:
	SEP #$20
-	LDA.w $4212
	BPL -                         ; wait for vblank
-	LDA.w $4212
	BMI -                         ; and for its end: top of a frame
	LDA.b #$80
	STA.w $2115                   ; increment after $2119
	REP #$20
	STZ.w $2116
	LDA.w #$1801                  ; A->B, two registers, $2118/$2119
	STA.w $4360
	LDA.w #vegeta_chamber_tiles
	STA.w $4362
	SEP #$20
	LDA.b #vegeta_chamber_tiles>>16
	STA.w $4364
	REP #$20
	LDA.w #!VEGETA_CHAMBER_TILE_BYTES
	STA.w $4365
	SEP #$20
	LDA.b #$40
	STA.w $420B
	REP #$20
	RTS
