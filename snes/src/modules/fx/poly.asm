; Colour-math polygons for the full-screen waves (sprite-layer.js
; giantBeam). Window 1 is the beam's outline on each scanline: inside it
; the main screen's BG1/BG2 are masked, so the backdrop shows, and HDMA
; channel 3 sets the backdrop colour (CGRAM 0) per scanline. Beams along
; the scanlines (left/right) take the browser's band colour per line; beams
; across them (up/down) show the rim colour, and colour math adds the fixed
; colour inside window 2 (the core): core = rim + fixed. Native sprites and
; BG3 (HUD, text) stay in front. fx_frame builds the tables into the back
; buffer (or shows the last ones again when nothing changed); fx_nmi
; programs channels 2/3 and the window/math registers.

!FX_PBASE = $310000                ; tables live in the SRAM work bank
assert !FX_PBASE == (!FX_SRAM&$FF0000), "fx polygon tables: bank of !FX_SRAM"
!FX_PLINES = 224                   ; HDMA lines described (0-223); the end byte is
                                   ; read on line 224, so a channel is always
                                   ; terminated when its frame ends

; Locals while a polygon is built: !d_tiles and !d_ks are free in the beam
; renderer until its first emit; !d_tmp is the writer's scratch.
!fxp_x    = !d_tiles+$00   ; palms (screen)
!fxp_y    = !d_tiles+$02
!fxp_len  = !d_tiles+$04   ; length (the visible part)
!fxp_hw   = !d_tiles+$06   ; half-width (1-255)
!fxp_t    = !d_tiles+$08   ; taper (9-255)
!fxp_ph   = !d_tiles+$0A   ; phase (age / 2)
!fxp_out  = !d_tiles+$0C   ; table write address (bank !FX_PBASE)
!fxp_end  = !d_tiles+$0E   ; first address past the buffer
!fxp_cnt  = !d_tiles+$10   ; lines in the pending run
!fxp_r0   = !d_tiles+$12   ; pending run record
!fxp_r1   = !d_tiles+$14
!fxp_rsz  = !d_tiles+$16   ; entry size: 3 (two-byte records) or 5
!fxp_line = !d_tiles+$18   ; lines described so far
!fxp_d    = !d_tiles+$1A   ; distance from the palms of the current line
!fxp_q    = !d_tiles+$1C   ; lines per evaluated taper / cap / horn step
!fxp_rip  = !d_tiles+$1E   ; nonzero: ripple (bands +2 every third 8 px)
!fxp_left = !d_tiles+$20   ; lines left in the beam / last beam line
!fxp_dt   = !d_tiles+$22   ; d where the taper ends (taper - 8)
!fxp_first = !d_tiles+$24  ; first beam line (up/down)
!fxp_top  = !d_tiles+$26   ; top line / scratch (left/right)
!fxp_axis = !d_tiles+$28   ; axis line + 1 (left/right)
!fxp_col  = !d_tiles+$2A   ; offset of the style's row in fx_wave_colors
!fxp_ovf  = !d_tiles+$2C   ; nonzero: a table did not fit
!fxp_sd   = !d_tiles+$2E   ; walk direction in d per line: 1 (down) / $FFFF (up)
!fxp_n    = !d_ks+$00       ; lines of the current step
!fxp_b    = !d_ks+$02       ; body bound (up/down)
!fxp_r    = !d_ks+$04       ; radius (up/down)
!fxp_o    = !d_ks+$06       ; outline record (up/down)
!fxp_ra   = !d_ks+$08       ; ripple amount (up/down)
!fxp_ds   = !d_ks+$0A       ; horn start d (left/right)
!fxp_de   = !d_ks+$0C       ; rounded end d (left/right)
!fxp_a    = !d_ks+$0E       ; distance from the axis (left/right)
!fxh_as   = !d_ks+$02       ; a * taper*256/hw (left/right)
!fxh_ar   = !d_ks+$04       ; a * 65535/hw
!fxh_ss   = !d_ks+$06       ; taper*256/hw
!fxh_sr   = !d_ks+$08       ; 65535/hw
!fxh_qs   = !d_r0+$0       ; q * the steps
!fxh_qr   = !d_r0+$2

; ---------------------------------------------------------------------------
; Beam polygon for the current effect (FX_BEAM_WAVE / FINAL / GALICK):
; !d_cur X/Y palms, DIR facing, A length, B half-width, C taper (0 = 44),
; T age. C clear when the polygon shows it (or nothing of it is on
; screen); C set to fall back to OBJ (world flight, the game's HDMA on
; channels 2/3, a second wave this frame, or tables that do not fit).
fx_poly_beam:
	LDA.w !core_mode&$FFFF
	CMP.w #!CORE_MODE_FIELD
	BNE .no
	LDA.l !fx_poly_req           ; one polygon per frame
	BNE .no
	LDA.l !fx_poly_on            ; channels 2/3 are the game's while it uses them
	BNE +
	LDA.w $002C
	AND.w #$000C
	BNE .no
+	LDA !d_cur+!C_KIND
	BIT.w #!FX_F_HEADING<<8      ; 16 headings: OBJ only
	BNE .no
	LDA !d_cur+!C_A
	BEQ .gone
	BMI .gone
	STA !fxp_len
	LDA !d_cur+!C_B
	BEQ .gone
	BMI .gone
	CMP.w #256
	BCC +
	LDA.w #255
+	STA !fxp_hw
	LDA !d_cur+!C_C
	BNE +
	LDA.w #44
+	CMP.w #9
	BCS +
	LDA.w #9
+	CMP.w #256
	BCC +
	LDA.w #255
+	STA !fxp_t
	SEC
	SBC.w #8
	STA !fxp_dt
	LDA !d_cur+!C_T
	LSR
	STA !fxp_ph
	LDA !d_cur+!C_X
	STA !fxp_x
	LDA !d_cur+!C_Y
	STA !fxp_y
	LDA !d_cur+!C_KIND           ; colour row: style 1-3 -> 0-2
	AND.w #$0003
	DEC
	ASL
	ASL
	ASL
	STA !fxp_col
	; Only the visible part matters: a far end past the screen edge (its
	; 12 px rounding included) draws the same picture.
	LDA !d_cur+!C_DIR
	AND.w #$0003
	ASL
	TAX
	JMP (.clip,X)
.no
	SEC
	RTS
.gone                            ; nothing of it on screen
	CLC
	RTS
.clip
	dw .down, .right, .left, .up
.down
	LDA.w #237
	SEC
	SBC !fxp_y
	BRA .lim
.right
	LDA.w #268
	SEC
	SBC !fxp_x
	BRA .lim
.left
	LDA !fxp_x
	CLC
	ADC.w #13
	BRA .lim
.up
	LDA !fxp_y
	CLC
	ADC.w #13
.lim
	BMI .gone
	BEQ .gone
	CMP !fxp_len
	BCS +
	STA !fxp_len
+	JSR fx_poly_estimate         ; !fxp_q / !fxp_rip; C set: nothing visible
	BCS .gone
	JSR fx_poly_key              ; the same picture as last time?
	BCS .build
	LDA.l !fx_pshown             ; show those tables again
	STA.l !fx_preuse
	JSR fx_poly_kind
	STA.l !fx_poly_req
	CLC
	RTS
.build
	LDA.w #$0000
	STA.l !fx_preuse
	JSR fx_poly_build
	BCS .fail
	LDA.l !fx_s                  ; the key now describes these tables
	STA.l !fx_pkey+8
	LDA.w #$0000
	STA.l !fx_pshown
	CLC
	RTS
.fail
	SEC
	RTS

; 1 (up/down: windows 1 and 2, colour math) or 2 (left/right: window 1).
fx_poly_kind:
	LDA !d_cur+!C_DIR
	AND.w #$0003
	BEQ .v
	CMP.w #3
	BEQ .v
	LDA.w #$0002
	RTS
.v
	LDA.w #$0001
	RTS

; Key of this polygon: x, y, visible length, hw | taper << 8, the game's
; backdrop colour, and dir | style << 2 | ripple phase << 4 (the validity
; word, +8). Differing words are written to !fx_pkey right away; the
; validity word waits in !fx_s until a build succeeds. C clear when the
; key is unchanged (the tables on file show this picture).
fx_poly_key:
	STZ !d_tmp+6
	LDA !fxp_x
	LDX.w #0
	JSR .word
	LDA !fxp_y
	LDX.w #2
	JSR .word
	LDA !fxp_len
	LDX.w #4
	JSR .word
	LDA !fxp_t
	XBA
	ORA !fxp_hw
	LDX.w #6
	JSR .word
	LDA.l $7E0600
	LDX.w #10
	JSR .word
	LDA !fxp_rip                   ; ripple pattern: (phase % 3) + 1
	BEQ +
	LDA !fxp_ph
	STA.l $004204
	SEP #$20
	LDA.b #3
	STA.l $004206
	REP #$20
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	LDA.l $004216
	INC
	ASL
	ASL
	ASL
	ASL
+	STA.l !fx_s
	LDA !d_cur+!C_KIND
	AND.w #$0003
	ASL
	ASL
	ORA.l !fx_s
	STA.l !fx_s
	LDA !d_cur+!C_DIR
	AND.w #$0003
	ORA.l !fx_s
	STA.l !fx_s
	CMP.l !fx_pkey+8
	BNE .differ
	LDA !d_tmp+6
	BNE .differ
	CLC
	RTS
.differ
	SEC
	RTS
.word
	CMP.l !fx_pkey,X
	BEQ +
	STA.l !fx_pkey,X
	INC !d_tmp+6
+	RTS

; Choose !fxp_q / !fxp_rip so the tables should fit one buffer (the build
; still checks): exact steps with the ripple first. C set when the beam
; has no visible line.
fx_poly_estimate:
	JSR fx_poly_kind
	CMP.w #1
	BEQ .vert
	; left/right: visible lines 2hw+1 clipped; 3 bytes per step, plus the
	; colour table (at most 10 entries) and the empty runs.
	STZ !fxp_rip
	LDA !fxp_y
	CLC
	ADC !fxp_hw
	CMP.w #!FX_PLINES
	BMI +
	LDA.w #!FX_PLINES-1
+	STA !fxp_n
	LDA !fxp_y
	SEC
	SBC !fxp_hw
	BPL +
	LDA.w #$0000
+	STA !fxp_b
	LDA !fxp_n
	SEC
	SBC !fxp_b
	BMI .none
	INC
	STA !fxp_n                     ; visible lines
	LDA.w #$0001
	STA !fxp_q
.hTry
	LDA !fxp_n
	JSR fx_ceil_q
	CLC
	ADC.w #5
	STA !fxp_b
	ASL
	ADC !fxp_b                     ; * 3
	CLC
	ADC.w #52
	CMP.w #!FX_PBUF_SIZE+1
	BCC .ok
	LDA !fxp_q
	CMP.w #8
	BCS .ok
	ASL
	STA !fxp_q
	BRA .hTry
.ok
	CLC
	RTS
.none
	SEC
	RTS
.vert
	LDA.w #$0001
	STA !fxp_sd
	LDA !d_cur+!C_DIR
	AND.w #$0003
	BEQ +
	LDA.w #$FFFF
	STA !fxp_sd
+	JSR fx_pv_range
	BCS .none
	LDA.w #$0001
	STA !fxp_q
	STZ !fxp_rip                   ; see the ripple note in fx.md
.vTry
	; taper lines (up to taper-8), cap lines (12), the body as one run or
	; one run per 8 px with the ripple; 5 bytes each, colours 32 bytes.
	LDA !fxp_dt
	CMP !fxp_left
	BCC +
	LDA !fxp_left
+	STA !fxp_r                     ; taper lines
	JSR fx_ceil_q
	STA !fxp_o
	LDA.w #12
	JSR fx_ceil_q
	CLC
	ADC !fxp_o
	STA !fxp_o
	LDA !fxp_left
	SEC
	SBC !fxp_r
	SEC
	SBC.w #12
	BPL +
	LDA.w #$0000
+	LDX !fxp_rip
	BEQ +
	LSR
	LSR
	LSR
	BRA ++
+	LDA.w #$0000
++	CLC
	ADC !fxp_o
	CLC
	ADC.w #6                     ; body bounds, empties, 127-line splits
	STA !fxp_o
	ASL
	ASL
	ADC !fxp_o                     ; * 5
	CLC
	ADC.w #32
	CMP.w #!FX_PBUF_SIZE+1
	BCC .ok
	LDA !fxp_rip                   ; without the ripple, then coarser steps
	BEQ +
	STZ !fxp_rip
	BRA .vTry
+	LDA !fxp_q
	CMP.w #8
	BCS .ok
	ASL
	STA !fxp_q
	BRA .vTry

; A = n -> ceil(n / !fxp_q) (q = 1, 2, 4, 8).
fx_ceil_q:
	CLC
	ADC !fxp_q
	DEC
	LDX !fxp_q
-	CPX.w #2
	BCC +
	LSR
	PHA
	TXA
	LSR
	TAX
	PLA
	BRA -
+	RTS

; Build both tables into the back buffer from the estimated quality, then
; coarser steps while they do not fit. The key is invalid until the build
; succeeds (a failed attempt may have moved the table pointers).
fx_poly_build:
	LDA.w #$FFFF
	STA.l !fx_pkey+8
.try
	JSR fx_poly_tables
	LDA !fxp_ovf
	BNE +
	CLC
	RTS
+	LDA !fxp_rip
	BEQ +
	STZ !fxp_rip
	BRA .try
+	LDA !fxp_q
	CMP.w #8
	BCS .fail
	ASL
	STA !fxp_q
	BRA .try
.fail
	SEC
	RTS

; One build attempt with the current !fxp_q / !fxp_rip (!fxp_ovf when it did not
; fit); sets the request for fx_nmi when it did.
fx_poly_tables:
	STZ !fxp_ovf
	LDA.l !fx_pbuf
	CLC
	ADC.w #!fx_poly&$FFFF
	TAX                          ; the buffer's first byte stays 0: fx_nmi
	ADC.w #!FX_PBUF_SIZE         ; points idle channels at it (fx_nmi_poly)
	STA !fxp_end
	SEP #$20
	LDA.b #$00
	STA.l !FX_PBASE,X
	REP #$20
	INX
	STX !fxp_out
	TXA
	STA.l !fx_ptab3
	JSR fx_poly_kind
	CMP.w #1
	BEQ .vert
	; Left / right: band colour per line, outline from the horn to the cap.
	JSR fx_ph_colours
	LDA !fxp_out
	STA.l !fx_ptab2
	JSR fx_ph_windows
	LDA !fxp_ovf
	BNE +
	LDA.w #$0001
	STA.l !fx_pdmap
	LDA.w #$0002
	STA.l !fx_poly_req
+	RTS
.vert
	JSR fx_pv_range
	BCS .off
	JSR fx_pv_colours
	LDA !fxp_out
	STA.l !fx_ptab2
	JSR fx_pv_windows
	LDA !fxp_ovf
	BNE .off
	LDA.w #$0004
	STA.l !fx_pdmap
	JSR fx_pv_fixed
	LDA.w #$0001
	STA.l !fx_poly_req
.off
	RTS

;---------------------------------------------------------------------------
; Left / right Kamehameha-type strips (fx_beam_strips) as a polygon. Every
; row of the strip assemblies (band unions of Lucent Beam's 16x4 strip, one
; cell or two stacked) is one colour across the cell (fx.mjs asserts it),
; so every line of the beam is one colour from the palms to the last strip:
; window 1 per line and the backdrop colour per line give exactly the OBJ
; strips without their sprites. Sixteen 16x16 strips on a row are 32 of the
; PPU's 34 slivers per line, so next to the natives on Goku's lines they
; cannot all show (and the PPU drops the natives' slivers).
; In: !d_ks+2 bands, +4 set (0 blue, 1 pink, 2 fire), +6 phase, !d_dx,
; !d_turn, !d_cur. C clear when drawn (or nothing to draw); C set: OBJ
; strips (!d_ks+0-7 are kept for them).
!fxs_rec  = !d_ks+$08         ; the strip's record in fx_strip_data
!fxs_n    = !d_ks+$0C         ; its lines
!fxs_cls  = !d_ks+$0E         ; palette class * 32
!fxs_o    = !d_r0+$00         ; window record of the beam's lines
fx_poly_strip:
	LDA.w !core_mode&$FFFF
	CMP.w #!CORE_MODE_FIELD
	BNE .no0
	LDA.l !fx_poly_req           ; one polygon per frame
	BNE .no0
	LDA.l !fx_poly_on
	BNE +
	LDA.w $002C
	AND.w #$000C
	BNE .no0
+	LDA !d_cur+!C_KIND
	BIT.w #!FX_F_HEADING<<8
	BEQ .go
.no0
	SEC
	RTS
.go
	LDA !d_cur+!C_A              ; strips at d = 8, 24, ... while d < length
	SEC
	SBC.w #8
	BEQ .none
	BMI .none
	CLC
	ADC.w #15
	AND.w #$FFF0
	STA !fxp_len                 ; 16 * strips
	LDA !d_cur+!C_X
	STA !fxp_x
	LDA !d_cur+!C_Y
	STA !fxp_y
	LDA !d_ks+4                  ; key fields: bands | set << 4, frame
	ASL
	ASL
	ASL
	ASL
	ORA !d_ks+2
	STA !fxp_hw
	LDA !d_ks+6
	AND.w #$0001
	STA !fxp_t
	STZ !fxp_rip
	LDX !d_ks+4                  ; palette class of the set
	LDA.l .class,X
	AND.w #$00FF
	STA !fxs_cls
	; the strip's lines: fx_strip_ptr[((set*2 + frame)*7 + bands-1)*2 + left]
	LDA !d_ks+4
	ASL
	ORA !fxp_t
	STA !fxp_ds
	ASL
	ASL
	ASL
	SEC
	SBC !fxp_ds                  ; (set*2 + frame) * 7
	CLC
	ADC !d_ks+2
	DEC
	ASL
	STA !fxp_ds
	LDA !d_turn                  ; 0 right, 2 left
	LSR
	ORA !fxp_ds
	ASL
	TAX
	LDA.l fx_strip_ptr,X
	STA !fxs_rec
	TAX
	LDA.l fx_strip_data,X        ; first line - palms' line (signed) | lines << 8
	XBA
	AND.w #$00FF
	BEQ .none
	STA !fxs_n
	JSR fx_poly_key
	BCS .build
	LDA.l !fx_pshown             ; the same picture: show those tables again
	STA.l !fx_preuse
	LDA.w #$0002
	STA.l !fx_poly_req
	CLC
	RTS
.none
	CLC
	RTS
.build
	LDA.w #$FFFF
	STA.l !fx_pkey+8
	LDA.w #$0000
	STA.l !fx_preuse
	STZ !fxp_ovf
	LDA.l !fx_pbuf
	CLC
	ADC.w #!fx_poly&$FFFF
	TAX
	ADC.w #!FX_PBUF_SIZE
	STA !fxp_end
	SEP #$20
	LDA.b #$00
	STA.l !FX_PBASE,X            ; the buffer's first byte stays 0
	REP #$20
	INX
	STX !fxp_out
	TXA
	STA.l !fx_ptab3
	; window: x0..x1 of the strips (right: palms .. +len-1; left: mirrored)
	LDA !d_dx
	BMI +
	LDA !fxp_x
	STA !fxp_top
	CLC
	ADC !fxp_len
	DEC
	STA !fxp_axis
	BRA ++
+	LDA !fxp_x
	STA !fxp_axis
	SEC
	SBC !fxp_len
	INC
	STA !fxp_top
++	LDA !fxp_top                 ; record for the beam's lines
	STA !d_tmp
	LDA !fxp_axis
	STA !d_tmp+2
	JSR fx_pw_lohi
	STA !fxs_o
	LDX !fxs_rec                 ; the first line
	LDA.l fx_strip_data,X
	AND.w #$00FF
	EOR.w #$0080
	SEC
	SBC.w #$0080
	CLC
	ADC !fxp_y
	STA !fxp_first
	; Channel 3: the game's backdrop, each line's colour, the backdrop.
	LDA.w #5
	JSR fx_pw_open
	LDA.w #4
	JSR fx_pw_colour
	LDA !fxp_first
	JSR fx_pw_to
	STZ !fxp_d
.crow
	JSR .line
	BEQ +
	ASL
	CLC
	ADC !fxs_cls
	TAX
	LDA.l fx_class_palettes,X
	TAY
	LDX.w #$0000
	BRA ++
+	LDA.l $7E0600
	TAY
	LDX.w #$0000
++	LDA !fxp_first
	CLC
	ADC !fxp_d
	CMP.w #!FX_PLINES            ; off the screen (above: negative)
	BCS +
	LDA.w #1
	JSR fx_pw
+	INC !fxp_d
	LDA !fxp_d
	CMP !fxs_n
	BCC .crow
	LDA.w #4
	JSR fx_pw_colour
	JSR fx_pw_close
	; Channel 2 (mode 1): the strips' span on lines with colour.
	LDA !fxp_out
	STA.l !fx_ptab2
	LDA.w #3
	JSR fx_pw_open
	LDX.w #$00FF
	LDY.w #$0000
	LDA !fxp_first
	JSR fx_pw_to
	STZ !fxp_d
.wrow
	JSR .line
	BEQ +
	LDX !fxs_o
	BRA ++
+	LDX.w #$00FF
++	LDY.w #$0000
	LDA !fxp_first
	CLC
	ADC !fxp_d
	CMP.w #!FX_PLINES
	BCS +
	LDA.w #1
	JSR fx_pw
+	INC !fxp_d
	LDA !fxp_d
	CMP !fxs_n
	BCC .wrow
	LDX.w #$00FF
	LDY.w #$0000
	JSR fx_pw_close
	LDA !fxp_ovf
	BEQ +
	SEC
	RTS
+	LDA.w #$0001
	STA.l !fx_pdmap
	LDA.w #$0002
	STA.l !fx_poly_req
	LDA.l !fx_s                  ; the key now describes these tables
	STA.l !fx_pkey+8
	LDA.w #$0000
	STA.l !fx_pshown
	CLC
	RTS
.line                            ; A = colour index of line !fxp_d (Z set: none)
	LDA !fxs_rec
	CLC
	ADC !fxp_d
	TAX
	LDA.l fx_strip_data+2,X
	AND.w #$00FF
	RTS
.class                           ; palette class of the band sets
	db !FX_CLASS_BLUE*32, !FX_CLASS_PINK*32, !FX_CLASS_FIRE*32

; ---------------------------------------------------------------------------
; Table writer. fx_pw_open: A = entry size (3: two-byte records, 5: four).
fx_pw_open:
	STA !fxp_rsz
	STZ !fxp_cnt
	STZ !fxp_line
	RTS

; Lines A with records X / Y (Y = 0 for two-byte records). Equal
; consecutive records merge into one entry. Preserves X and Y.
fx_pw:
	PHA
	CLC
	ADC !fxp_line
	STA !fxp_line
	PLA
	CPX !fxp_r0
	BNE .new
	CPY !fxp_r1
	BNE .new
	CLC
	ADC !fxp_cnt
	STA !fxp_cnt
	RTS
.new
	PHA
	PHX
	PHY
	JSR fx_pw_flush
	PLY
	PLX
	PLA
	STX !fxp_r0
	STY !fxp_r1
	STA !fxp_cnt
	RTS

; Lines from the current line up to line A (exclusive, at most the table's
; end), records X / Y. Nothing when A is not past the current line.
; Preserves X and Y.
fx_pw_to:
	CMP.w #$8000                 ; negative: before the screen
	BCS .none
	CMP.w #!FX_PLINES
	BCC +
	LDA.w #!FX_PLINES
+	SEC
	SBC !fxp_line
	BEQ .none
	BMI .none
	JMP fx_pw
.none
	RTS

; Write the pending run as entries of at most 127 lines.
fx_pw_flush:
	LDA !fxp_cnt
	BEQ .done
.loop
	CMP.w #128
	BCC +
	LDA.w #127
+	STA !d_tmp+6                 ; lines in this entry
	LDA !fxp_out
	TAX
	CLC
	ADC !fxp_rsz
	CMP !fxp_end
	BCC +
	BEQ +
	LDA.w #$0001
	STA !fxp_ovf
	STZ !fxp_cnt
	RTS
+	STA !fxp_out
	SEP #$20
	LDA !d_tmp+6
	STA.l !FX_PBASE,X
	REP #$20
	LDA !fxp_r0
	STA.l !FX_PBASE+1,X
	LDA !fxp_rsz
	CMP.w #5
	BNE +
	LDA !fxp_r1
	STA.l !FX_PBASE+3,X
+	LDA !fxp_cnt
	SEC
	SBC !d_tmp+6
	STA !fxp_cnt
	BNE .loop
.done
	RTS

; Finish a table: records X / Y to the last line, then a 127-line entry of
; the same (neutral) record and the end byte. HDMA stops at line 224 with
; that entry still counting down: if the field NMI's $420C write lands
; after the next frame's HDMA start, the channel resumes without its
; start-of-frame reload and only counts that entry down (no transfers)
; until it reads the end byte. A channel stopped right at its end byte
; would instead underflow its line counter into a 127-line repeat and write
; whatever follows in memory (hardware and Mesen alike).
fx_pw_close:
	LDA.w #!FX_PLINES
	JSR fx_pw_to
	JSR fx_pw_flush
	LDA.w #127                   ; the padding entry (record unchanged)
	STA !fxp_cnt
	JSR fx_pw_flush
	LDA !fxp_ovf
	BNE .full
	LDA !fxp_out
	CMP !fxp_end
	BCS .full
	TAX
	INC
	STA !fxp_out
	SEP #$20
	LDA.b #$00
	STA.l !FX_PBASE,X            ; end byte
	REP #$20
	RTS
.full
	LDA.w #$0001
	STA !fxp_ovf
	RTS

; Window record for pixels lo..hi (signed, !d_tmp / !d_tmp+2), clipped to
; the screen: A = lo | hi << 8, or $00FF (empty) when nothing is left.
fx_pw_lohi:
	LDA !d_tmp+2
	BMI .empty
	LDA !d_tmp
	BPL +
	LDA.w #$0000
	STA !d_tmp
+	CMP.w #$0100
	BCS .empty
	LDA !d_tmp+2
	CMP.w #$0100
	BCC +
	LDA.w #$00FF
+	CMP !d_tmp
	BCC .empty
	XBA
	ORA !d_tmp
	RTS
.empty
	LDA.w #$00FF
	RTS

; Window record for x-A .. x+A (A < 0: empty).
fx_pw_span:
	CMP.w #$8000
	BCS .empty
	STA !d_tmp+4
	LDA !fxp_x
	SEC
	SBC !d_tmp+4
	STA !d_tmp
	LDA !fxp_x
	CLC
	ADC !d_tmp+4
	STA !d_tmp+2
	JMP fx_pw_lohi
.empty
	LDA.w #$00FF
	RTS

; Colour record (mode 3: CGADD, CGADD, CGDATA, CGDATA): X = 0, Y = BGR555.
; A = band 0-3 of the style, or 4 for the game's own backdrop.
fx_pw_colour:
	CMP.w #4
	BCC +
	LDA.l $7E0600
	TAY
	LDX.w #$0000
	RTS
+	ASL
	CLC
	ADC !fxp_col
	TAX
	LDA.l fx_wave_colors,X
	TAY
	LDX.w #$0000
	RTS

; ---------------------------------------------------------------------------
; Up / down beams. Visible lines and d of the first one; C set when none.
; Out: !fxp_first, !fxp_left (lines), !fxp_d.
fx_pv_range:
	LDA !fxp_sd
	BMI .up
	LDA !fxp_y                     ; down: lines y .. y+len
	BPL +
	LDA.w #$0000
+	STA !fxp_first
	SEC
	SBC !fxp_y
	STA !fxp_d                     ; d = first line - y
	CMP !fxp_len
	BEQ +
	BCS .none
+	LDA !fxp_y
	CLC
	ADC !fxp_len
	BRA .last
.up
	LDA !fxp_y                     ; up: lines y-len .. y
	SEC
	SBC !fxp_len
	BPL +
	LDA.w #$0000
+	STA !fxp_first
	LDA !fxp_y
	SEC
	SBC !fxp_first
	BMI .none
	STA !fxp_d                     ; d = y - first line
	LDA !fxp_y
.last
	BMI .none
	CMP.w #224
	BCC +
	LDA.w #223
+	SEC
	SBC !fxp_first                 ; last - first
	BMI .none
	INC
	STA !fxp_left
	LDA !fxp_first
	CMP.w #224
	BCS .none
	CLC
	RTS
.none
	SEC
	RTS

; Channel 3: the game's backdrop, the rim colour (band 1) on the beam's
; lines, the game's backdrop below.
fx_pv_colours:
	LDA.w #5
	JSR fx_pw_open
	LDA.w #4
	JSR fx_pw_colour
	LDA !fxp_first
	JSR fx_pw_to
	LDA.w #1
	JSR fx_pw_colour
	LDA !fxp_first
	CLC
	ADC !fxp_left
	JSR fx_pw_to
	LDA.w #4
	JSR fx_pw_colour
	JMP fx_pw_close

; Channel 2 (mode 4: W1L, W1R, W2L, W2R) per line.
fx_pv_windows:
	LDA.w #5
	JSR fx_pw_open
	LDX.w #$00FF
	LDY.w #$00FF
	LDA !fxp_first
	JSR fx_pw_to                 ; above the beam: empty
.loop
	LDA !fxp_d
	CMP !fxp_dt
	BCC .eval                    ; taper
	LDA !fxp_len
	SEC
	SBC !fxp_d
	CMP.w #12
	BCC .eval                    ; rounded end
	; Body: full width; one run to the end of this 8 px ripple chunk (or
	; of the body) in the walk direction.
	LDA !fxp_sd
	BMI .bodyUp
	LDA !fxp_len
	SEC
	SBC.w #12
	STA !fxp_b                     ; last body d
	LDA !fxp_rip
	BEQ +
	LDA !fxp_d
	ORA.w #$0007
	CMP !fxp_b
	BCS +
	STA !fxp_b
+	LDA !fxp_b
	SEC
	SBC !fxp_d
	INC
	BRA .body
.bodyUp
	LDA !fxp_dt
	STA !fxp_b                     ; first body d
	LDA !fxp_rip
	BEQ +
	LDA !fxp_d
	AND.w #$FFF8
	CMP !fxp_b
	BCC +
	STA !fxp_b
+	LDA !fxp_d
	SEC
	SBC !fxp_b
	INC
.body
	STA !fxp_n
	LDA !fxp_hw
	BRA .rec
.eval
	LDA !fxp_q
	STA !fxp_n
	JSR fx_pv_edge
.rec
	JSR fx_pv_rec                ; X / Y records
	LDA !fxp_n
	CMP !fxp_left
	BCC +
	LDA !fxp_left
	STA !fxp_n
+	JSR fx_pw
	LDA !fxp_ovf
	BEQ +
	RTS
+	LDA !fxp_left
	SEC
	SBC !fxp_n
	STA !fxp_left
	BEQ .done
	LDA !fxp_sd                    ; d += sd * lines
	BMI +
	LDA !fxp_d
	CLC
	ADC !fxp_n
	STA !fxp_d
	JMP .loop
+	LDA !fxp_d
	SEC
	SBC !fxp_n
	STA !fxp_d
	BMI .done
	JMP .loop
.done
	LDX.w #$00FF
	LDY.w #$00FF
	JMP fx_pw_close

; Edge (half outline) at !fxp_d: hw * min(1, (d+8)/taper), times
; sqrt((len-d)/12) on the last 12 px.
fx_pv_edge:
	LDA !fxp_d
	CMP !fxp_dt
	BCS .full
	JSR fx_taper_r
	BRA .cap
.full
	LDA !fxp_hw
.cap
	STA !fxp_r
	LDA !fxp_len
	SEC
	SBC !fxp_d
	CMP.w #12
	BCS .done
	TAX
	SEP #$20
	LDA !fxp_r
	STA.l $004202
	LDA.l fx_capf,X
	STA.l $004203                ; r * capf
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	XBA
	AND.w #$00FF
	RTS
.done
	LDA !fxp_r
	RTS

; Taper radius at d = A (below taper - 8): hw * (d + 8) / taper.
fx_taper_r:
	CLC
	ADC.w #8
	TAX                          ; d + 8 < 256
	SEP #$20
	LDA !fxp_hw
	STA.l $004202
	TXA
	STA.l $004203                ; hw * (d + 8)
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	STA.l $004204
	SEP #$20
	LDA !fxp_t
	STA.l $004206                ; / taper
	REP #$20
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	LDA.l $004214
	RTS

; Records for edge A at !fxp_d: X = outline, Y = core (edge - 9 - ripple).
fx_pv_rec:
	PHA
	JSR fx_pw_span
	STA !fxp_o
	STZ !fxp_ra
	LDA !fxp_rip
	BEQ +
	LDA !fxp_d
	LSR
	LSR
	LSR
	CLC
	ADC !fxp_ph
	AND.w #$007F
	TAX
	LDA.l fx_rip3,X
	AND.w #$00FF
	STA !fxp_ra
+	PLA
	SEC
	SBC.w #9
	SEC
	SBC !fxp_ra
	JSR fx_pw_span
	TAY
	LDX !fxp_o
	RTS

; Fixed colour = core - rim per component (never negative), as the three
; COLDATA writes in !fx_pfix.
fx_pv_fixed:
	LDX !fxp_col
	LDA.l fx_wave_colors+6,X     ; core
	STA !fxp_r
	LDA.l fx_wave_colors+2,X     ; rim
	STA !fxp_o
	LDA !fxp_r                     ; red
	AND.w #$001F
	STA !fxp_ra
	LDA !fxp_o
	AND.w #$001F
	JSR .diff
	ORA.w #$0020
	SEP #$20
	STA.l !fx_pfix
	REP #$20
	LDA !fxp_r                     ; green
	LSR
	LSR
	LSR
	LSR
	LSR
	AND.w #$001F
	STA !fxp_ra
	LDA !fxp_o
	LSR
	LSR
	LSR
	LSR
	LSR
	AND.w #$001F
	JSR .diff
	ORA.w #$0040
	SEP #$20
	STA.l !fx_pfix+1
	REP #$20
	LDA !fxp_r                     ; blue
	XBA
	LSR
	LSR
	AND.w #$001F
	STA !fxp_ra
	LDA !fxp_o
	XBA
	LSR
	LSR
	AND.w #$001F
	JSR .diff
	ORA.w #$0080
	SEP #$20
	STA.l !fx_pfix+2
	REP #$20
	RTS
.diff                            ; A = max(0, !fxp_ra - A)
	STA !d_tmp
	LDA !fxp_ra
	SEC
	SBC !d_tmp
	BPL +
	LDA.w #$0000
+	RTS

; ---------------------------------------------------------------------------
; Left / right beams. Channel 3: the band of each line by its distance from
; the axis (the browser's bands 3 / 9 / 17 px inside the edge), the game's
; backdrop elsewhere.
fx_ph_colours:
	LDA.w #5
	JSR fx_pw_open
	LDA !fxp_y
	SEC
	SBC !fxp_hw
	STA !fxp_top                   ; top line
	LDA !fxp_y
	INC
	STA !fxp_axis                  ; the top half ends with the axis line
	LDA.w #4
	JSR fx_pw_colour
	LDA !fxp_top
	JSR fx_pw_to
	LDA.w #0
	JSR fx_pw_colour
	LDA.w #3
	JSR .top
	LDA.w #1
	JSR fx_pw_colour
	LDA.w #9
	JSR .top
	LDA.w #2
	JSR fx_pw_colour
	LDA.w #17
	JSR .top
	LDA.w #3
	JSR fx_pw_colour
	LDA !fxp_axis
	JSR fx_pw_to
	LDA !fxp_y                     ; bottom half: y + hw - 16, - 8, - 2, + 1
	CLC
	ADC !fxp_hw
	STA !fxp_top
	SEC
	SBC.w #16
	JSR fx_pw_to
	LDA.w #2
	JSR fx_pw_colour
	LDA !fxp_top
	SEC
	SBC.w #8
	JSR fx_pw_to
	LDA.w #1
	JSR fx_pw_colour
	LDA !fxp_top
	DEC
	DEC
	JSR fx_pw_to
	LDA.w #0
	JSR fx_pw_colour
	LDA !fxp_top
	INC
	JSR fx_pw_to
	LDA.w #4
	JSR fx_pw_colour
	JMP fx_pw_close
.top                             ; to line top + A, not past the axis
	CLC
	ADC !fxp_top
	CMP !fxp_axis
	BMI +
	LDA !fxp_axis
+	JMP fx_pw_to

; Channel 2 (mode 1: W1L, W1R), evaluated every !fxp_q lines. The horn and
; the rounded end follow a = |line - y| through two accumulators stepped by
; q lines (two divisions per build, none per line).
fx_ph_windows:
	LDA.w #3
	JSR fx_pw_open
	LDA !fxp_t                     ; taper * 256 / hw
	XBA
	AND.w #$FF00
	STA.l $004204
	SEP #$20
	LDA !fxp_hw
	STA.l $004206
	REP #$20
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	LDA.l $004214
	STA !fxh_ss
	LDA.w #$FFFF                 ; 65535 / hw
	STA.l $004204
	SEP #$20
	LDA !fxp_hw
	STA.l $004206
	REP #$20
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	LDA.l $004214
	STA !fxh_sr
	LDA !fxh_ss
	JSR fx_mul_q
	STA !fxh_qs
	LDA !fxh_sr
	JSR fx_mul_q
	STA !fxh_qr
	LDX.w #$00FF
	LDY.w #$0000
	LDA !fxp_y
	SEC
	SBC !fxp_hw
	JSR fx_pw_to                 ; above the beam: empty
	LDA !fxp_y
	CLC
	ADC !fxp_hw
	CMP.w #!FX_PLINES
	BMI +
	LDA.w #!FX_PLINES-1
+	STA !fxp_left                  ; last beam line
	LDA !fxp_line
	JSR fx_ph_acc
.loop
	LDA !fxp_left
	SEC
	SBC !fxp_line
	BMI .done
	INC
	CMP !fxp_q
	BCC +
	LDA !fxp_q
+	STA !fxp_n
	JSR fx_ph_rec
	TAX
	LDY.w #$0000
	LDA !fxp_n
	JSR fx_pw                    ; advances !fxp_line
	LDA !fxp_ovf
	BEQ +
	RTS
+	LDA !fxp_line                  ; step a to the new line
	CMP !fxp_y
	BEQ .dec
	BMI .dec                     ; still above (or at) the axis: a - q
	SEC
	SBC !fxp_q
	CMP !fxp_y
	BPL .inc                     ; already below: a + q
	LDA !fxp_line                  ; crossed the axis: from scratch
	JSR fx_ph_acc
	BRA .loop
.inc
	LDA !fxh_as
	CLC
	ADC !fxh_qs
	STA !fxh_as
	LDA !fxh_ar
	CLC
	ADC !fxh_qr
	STA !fxh_ar
	BRA .loop
.dec
	LDA !fxh_as
	SEC
	SBC !fxh_qs
	STA !fxh_as
	LDA !fxh_ar
	SEC
	SBC !fxh_qr
	STA !fxh_ar
	BRA .loop
.done
	LDX.w #$00FF
	LDY.w #$0000
	JMP fx_pw_close

; Accumulators for line A: a = |line - y|, a * steps.
fx_ph_acc:
	SEC
	SBC !fxp_y
	BPL +
	EOR.w #$FFFF
	INC
+	CMP.w #256
	BCC +
	LDA.w #255
+	STA !fxp_a
	LDX !fxh_ss
	JSR fx_mul8x16
	STA !fxh_as
	LDA !fxp_a
	LDX !fxh_sr
	JSR fx_mul8x16
	STA !fxh_ar
	RTS

; A (0-255) * X -> A (low 16 bits).
fx_mul8x16:
	SEP #$20
	STA.l $004202
	TXA
	STA.l $004203                ; a * low byte
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	STA !d_tmp+6
	TXA
	XBA
	SEP #$20
	STA.l $004203                ; a * high byte
	NOP
	NOP
	NOP
	NOP
	REP #$20
	LDA.l $004216
	XBA
	AND.w #$FF00
	CLC
	ADC !d_tmp+6
	RTS

; A * !fxp_q (1, 2, 4, 8).
fx_mul_q:
	LDX !fxp_q
-	CPX.w #2
	BCC +
	ASL
	PHA
	TXA
	LSR
	TAX
	PLA
	BRA -
+	RTS

; Outline of the line at the accumulators: from the horn,
; d = ceil(a*taper/hw) - 8, to the rounded end, d = len - ceil(12 (a/hw)^2).
; A = window record.
fx_ph_rec:
	LDA !fxh_as
	CLC
	ADC.w #$00FF
	XBA
	AND.w #$00FF                 ; ceil(a * taper / hw)
	SEC
	SBC.w #8
	BPL +
	LDA.w #$0000
+	STA !fxp_ds
	LDA !fxh_ar                    ; 64 a / hw -> ceil(12 (a/hw)^2)
	XBA
	LSR
	LSR
	AND.w #$003F
	TAX
	LDA.l fx_kc_tab,X
	AND.w #$00FF
	STA !fxp_de
	LDA !fxp_len
	SEC
	SBC !fxp_de                    ; end d
	STA !fxp_de
	SEC
	SBC !fxp_ds
	BMI .empty
	LDA !d_cur+!C_DIR
	AND.w #$0003
	CMP.w #2
	BEQ .left
	LDA !fxp_x                     ; right: x + start .. x + end
	CLC
	ADC !fxp_ds
	STA !d_tmp
	LDA !fxp_x
	CLC
	ADC !fxp_de
	STA !d_tmp+2
	JMP fx_pw_lohi
.left
	LDA !fxp_x                     ; left: x - end .. x - start
	SEC
	SBC !fxp_de
	STA !d_tmp
	LDA !fxp_x
	SEC
	SBC !fxp_ds
	STA !d_tmp+2
	JMP fx_pw_lohi
.empty
	LDA.w #$00FF
	RTS

; floor(256 * sqrt(k / 12)), k = 0..11
fx_capf:
	db 0, 73, 104, 128, 147, 165, 181, 195, 209, 221, 233, 245
; ceil(12 (i/64)^2), i = 0..63
fx_kc_tab:
	db 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1
	db 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3
	db 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7
	db 7, 8, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12
; Ripple: 2 when ((d >> 3) + phase) % 3 == 0
fx_rip3:
	for i = 0..128
		if !i%3 == 0
			db 2
		else
			db 0
		endif
	endfor

; ---------------------------------------------------------------------------
; Vblank (first in fx_nmi, DB = $80, only while there is time left): program
; the polygon of this frame, or put the registers back after the last one.
fx_nmi_poly:
	LDA.l !fx_poly_req
	BNE .on
	LDA.l !fx_poly_on
	BEQ +
	JSR fx_poly_restore
+	RTS
.on
	SEP #$20
	LDA.l !fx_pdmap
	STA $4320                    ; channel 2: window edges
	LDA.b #$26
	STA $4321
	LDA.b #!FX_SRAM>>16
	STA $4324
	STA $4334
	LDA.b #$03                   ; channel 3: CGADD, CGADD, CGDATA, CGDATA
	STA $4330
	LDA.b #$21
	STA $4331
	REP #$20
	LDA.l !fx_ptab2
	STA $4322
	LDA.l !fx_ptab3
	STA $4332
	; Prime both channels as if they had just counted down a 127-line entry
	; that ends at a 0 byte (the buffer's first byte): if the field NMI's
	; $420C write lands after the next frame's HDMA start, a channel that
	; is switched on without its frame-start reload only counts down and
	; stops. In time, the frame-start reload replaces all of this.
	DEC
	STA $4328
	STA $4338
	SEP #$20
	LDA.b #$7F
	STA $432A
	STA $433A
	LDA.b #$22                   ; BG1 / BG2 masked inside window 1 ...
	STA $2123
	LDA.b #$03                   ; ... on the main screen
	STA $212E
	LDA.l !fx_poly_req
	CMP.b #$01
	BNE .flat
	LDA.b #$80                   ; colour window = window 2 (the core)
	STA $2125
	LDA.b #$10                   ; math only inside it, fixed colour
	STA $2130
	LDA.b #$20                   ; added to the backdrop only
	STA $2131
	LDA.l !fx_pfix
	STA $2132
	LDA.l !fx_pfix+1
	STA $2132
	LDA.l !fx_pfix+2
	STA $2132
	BRA .enable
.flat
	LDA.b #$20                   ; colour window = window 1: no math on the
	STA $2125                    ; beam, the game's own math elsewhere
	LDA.b #$22
	STA $2130
	LDA.l $7E0023
	STA $2131
	LDA.b #$E0
	STA $2132
.enable
	LDA.l $7E002C
	ORA.b #$0C
	STA.l $7E002C
	REP #$20
	LDA.l !fx_poly_req
	STA.l !fx_poly_on
	LDA.l !fx_preuse             ; tables already on screen: same buffer
	BNE +
	LDA.l !fx_pbuf               ; the next build goes to the other buffer
	EOR.w #!FX_PBUF_SIZE
	STA.l !fx_pbuf
	LDA.w #$0001
	STA.l !fx_pshown
+	RTS

; Registers back to the field's own values (no windows, CGWSEL 2, the
; game's CGADSUB shadow, black fixed colour, its backdrop colour) and
; channels 2/3 off. The tables and their key stay: the same polygon next
; frame shows them again. Long addressing: also called from the ring menu
; frame.
fx_poly_restore:
	SEP #$20
	LDA.b #$00
	STA.l $002123
	STA.l $002125
	STA.l $00212E
	LDA.b #$02
	STA.l $002130
	LDA.l $7E0023
	STA.l $002131
	LDA.b #$E0
	STA.l $002132
	LDA.b #$00
	STA.l $002121
	LDA.l $7E0600
	STA.l $002122
	LDA.l $7E0601
	STA.l $002122
	LDA.l $7E002C
	AND.b #$F3
	STA.l $7E002C
	REP #$20
	LDA.w #$0000
	STA.l !fx_poly_on
	STA.l !fx_mathon             ; any flash state went with it
	RTS

; Ring menu frame (in vblank, DB = $7E): the field NMI stops running FX
; while the ring is open, so a polygon is switched off here.
fx_ring_frame:
	LDA.l !fx_poly_on
	BEQ +
	LDA.l !fx_magic
	CMP.w #!FX_MAGIC
	BNE +
	JSR fx_poly_restore
+	RTL
