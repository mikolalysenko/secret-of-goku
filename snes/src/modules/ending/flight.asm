; The wish flight (scatter 14F, 30-480; wish-flight.js): Shenron leaves,
; the seven Balls rise over the night world, hang, then scatter.
;
; Mode 7 floor (BG1): the world's own characters and a 128x128 tile window
; of its map (chosen by ending-flight.mjs), converted from the cartridge's
; world data while the picture is black (LD_M7TILES, LD_M7ROWS). One
; matrix per line K = y - horizon + 6 from the browser's perspective:
; A = -vy T1(K), B = vx T2(K) on HDMA channel 2, C = vx T1(K), D = vy T2(K)
; on channel 3 (both indirect, tables in s_big, a second one built over a
; few frames while the camera turns); per frame M7X/Y = the camera,
; M7HOFS = M7X - 128, M7VOFS = M7Y + 6 - horizon (so B y + B (VOFS - M7Y)
; = B K). Above the horizon BG1 is off (TM, channel 5) and the backdrop is
; the browser's gradient (channel 6 writes colour 0); channel 4 puts Mode 7
; back after the field IRQ's HUD split at line 196.
;
; Sprites in OBJ name table 1 (VRAM $5000, tiles 256-383; OBJSEL base
; $4000, whose table 0 is BG3's font and never used): the vista's cell
; rows 0-3 (Balls, Shenron, star tiles), then sparks and the smaller Balls
; once Shenron has gone. Stars are 8x8 at priority 0 (behind the floor).
; CGRAM: colour 0 the sky; the floor's palettes 4-7 and 9-12 (the world's
; night colours); OBJ palettes 0/5 Shenron, 6 the Balls, 7 sparks + stars.
!FL_OBJSEL  = $02             ; 8x8/16x16, name base $4000, table 1 at $5000
!FL_OBJ     = $5000
!FL_ATTR_STAR  = $0F00        ; priority 0, palette 7, N = 1
!FL_ATTR_BALL  = $3D00        ; priority 3, palette 6, N = 1
!FL_ATTR_SPARK = $3F00        ; priority 3, palette 7, N = 1
!FL_BALL10  = 16              ; cells (ending-flight.mjs FCELL)
!FL_SPARK   = 8
!FL_AB0     = !s_big          ; matrix tables: buffer b at + b * $4A0
!FL_CD0     = !s_big+$250     ; (148 entries of 4 bytes each)
!FL_BUFSTEP = $4A0
!FL_SETS    = !s_hdmabuf+$40  ; two sets of the small HDMA tables:
!FL_SET     = $54             ;   +0 AB indirect, +$10 CD indirect, +$20 gradient
!FL_BUILD   = 12              ; matrix entries built per frame while turning
!FL_KN      = !ENDING_FLIGHT_KMAX-!ENDING_FLIGHT_KMIN+1

!fl_h       = !s_var+$00   ; word  horizon
!fl_dy      = !s_var+$02   ; word  Shenron's y (signed)
!fl_by      = !s_var+$04   ; word  the Balls' ring centre y
!fl_rad     = !s_var+$06   ; word  ring radius
!fl_vx      = !s_var+$08   ; word  heading of the displayed matrix table
!fl_vy      = !s_var+$0A
!fl_tx      = !s_var+$0C   ; word  heading this frame
!fl_ty      = !s_var+$0E
!fl_bvx     = !s_var+$10   ; word  heading of the table being built
!fl_bvy     = !s_var+$12
!fl_bk      = !s_var+$14   ; word  next entry of the build, $FFFF none
!fl_buf     = !s_var+$16   ; word  displayed table buffer (0/1)
!fl_bkmax   = !s_var+$18   ; word  last entry the build needs
!fl_cx      = !s_var+$1A   ; word  camera (world pixels)
!fl_cy      = !s_var+$1C
!fl_i       = !s_var+$1E
!fl_tmp     = !s_var+$20
!fl_tmp2    = !s_var+$22
!fl_x       = !s_var+$24
!fl_y       = !s_var+$26
!fl_away    = !s_var+$28
!fl_tile    = !s_var+$2A
!fl_set     = !s_var+$2C   ; word  small-table set the vblank uses (0/1)
!fl_swap    = !s_var+$2E   ; word  the scatter's cells are queued
!fl_t1      = !s_var+$30
!fl_t2      = !s_var+$32
!fl_out     = !s_var+$34
!fl_live    = !s_var+$36   ; word  the flight stage is up (vs the vista)
!fl_q12     = !s_var+$38   ; word  star drift of the cached entries: age/12
!fl_q18     = !s_var+$3A   ;       and age/18 ($FFFF: none yet)
!fl_tw      = !s_var+$3C   ; 3 words: the trail sparks' OAM words (j = 1, 2, 3)
!fl_up      = !s_var+$42   ; word  0 / 255: flight_mag rounds down / up
!fl_smallv  = !s_var+$44   ; word  small Ball size in row 3 (0-2), $FFFF none
!fl_key     = !s_var+$46   ; word  what the last small-table set was built for
!fl_stq     = !s_var+$48   ; word  frames to the stars' next copy (0: copy now)

; ---------------------------------------------------------------------------
; The scatter starts with the vista: no flight stage yet.
flight_reset:
	REP #$30
	STZ.w !fl_live
	RTS

; Age 30 of the scatter: the flight stage under black (the clock waits).
flight_load:
	SEP #$20
	LDA.b #!FAM_FLIGHT
	JSR begin_fullscreen
	SEP #$20
	LDA.b #$07                ; Mode 7
	STA.w !s_bgmode
	LDA.b #!FL_OBJSEL
	STA.w !s_objsel
	LDA.b #$01
	STA.w !s_mode7
	LDA.b #$00
	STA.w !s_m7sel            ; repeat the window
	REP #$30
	LDA.w #$0001
	STA.w !fl_live
	STZ.w !fl_swap
	STZ.w !fl_set
	STZ.w !fl_buf
	STZ.w !s_m7b
	STZ.w !s_m7c
	LDA.w #$0100
	STA.w !s_m7a
	STA.w !s_m7d
	; the floor's colours: palettes 4-7 and 9-12 of the night table
	LDA.w #4
	JSR flight_floor_pal
	LDA.w #5
	JSR flight_floor_pal
	LDA.w #6
	JSR flight_floor_pal
	LDA.w #7
	JSR flight_floor_pal
	LDA.w #9
	JSR flight_floor_pal
	LDA.w #10
	JSR flight_floor_pal
	LDA.w #11
	JSR flight_floor_pal
	LDA.w #12
	JSR flight_floor_pal
	; OBJ palettes 0/5 Shenron, 6 the Balls, 7 sparks + stars
	LDA.w #$0010
	LDX.w #ending_vista_dragon_pal
	LDY.w #$0080
	JSR pal_set
	LDA.w #$0010
	LDX.w #ending_vista_dragon_pal+32
	LDY.w #$00D0
	JSR pal_set
	LDA.w #$0010
	LDX.w #ending_vista_ball_pal
	LDY.w #$00E0
	JSR pal_set
	LDA.w #$000C
	LDX.w #ending_vista_spark_pal
	LDY.w #$00F0
	JSR pal_set
	LDA.w #$0004
	LDX.w #flight_star_pal
	LDY.w #$00FC
	JSR pal_set
	LDA.w #$0040
	LDX.w #$0040
	JSR pal_range             ; floor palettes 4-7
	LDA.w #$0080
	LDX.w #$0080
	JSR pal_range             ; colours 128-255: OBJ and floor palettes 9-12
	; the first matrix table: heading 12, every entry
	LDA.w #$0000
	STA.w !fl_bvx
	LDA.w #$FF00              ; -256
	STA.w !fl_bvy
	STZ.w !fl_bk
	LDA.w #!FL_KN-1
	STA.w !fl_bkmax
	LDA.w #$FFFF
	STA.w !fl_vx              ; nothing displayed yet
	STA.w !fl_q12
	STA.w !fl_q18
	STA.w !fl_key
	STZ.w !fl_stq
	JSR flight_dragon_image
	LDA.w #flight_script
	JMP set_script

flight_script:
	%ld(ending_flight_tileuse, !LD_M7TILES, $0000, 240)
	%ld(ending_flight_tileuse, !LD_M7ROWS, $0000, 128)
	%ld(ending_vista_obj, !LD_VRAM, !FL_OBJ, $1000)
	%ld_end()

flight_star_pal:
	dw (10)|(13<<5)|(20<<10), (13)|(16<<5)|(23<<10), (16)|(19<<5)|(26<<10), (19)|(22<<5)|(29<<10)
flight_bgmode_hdma:
	db 127,$07, 69,$07, 1,$07, 0   ; Mode 7 at 0, 127 and 196 (after the HUD split)

; Night colours of world palette A (4-12) into CGRAM A * 16: colour 0 is the
; table's first word (the browser's index 0), colour i the word at
; C6:483E + 30 A + 2 i.
flight_floor_pal:
	STA.w !fl_tmp
	ASL : ASL : ASL : ASL : ASL   ; CGRAM byte offset A * 32
	STA.w !fl_tmp2
	TAX
	LDA.l $C6483E
	JSR pal_store
	LDA.w !fl_tmp
	ASL : ASL : ASL : ASL : ASL   ; 30 A = 32 A - 2 A
	SEC
	SBC.w !fl_tmp
	SEC
	SBC.w !fl_tmp
	STA.w !fl_i
	LDY.w #$0001
.colour
	TYA
	ASL
	CLC
	ADC.w !fl_i
	TAX
	LDA.l $C6483E,X
	AND.w #$7FFF
	PHA
	TYA
	ASL
	CLC
	ADC.w !fl_tmp2
	TAX
	PLA
	JSR pal_store
	INY
	CPY.w #$0010
	BCC .colour
	RTS

; ---------------------------------------------------------------------------
; Scatter frame from age 30 (frame_scatter): the flight.
ending_wish_frame:
	LDA.w !fl_live
	BNE .live
	JMP flight_load
.live
	JSR flight_status
	JSR flight_pose
	JSR flight_heading
	JSR flight_camera
	JSR flight_tables
	JSR flight_fades
	JSR oam_begin
	JSR flight_sprites
	JSR flight_scatter_cells
	LDA.l !ending_age
	CMP.w #479
	BCC .out
	JMP mark_done
.out
	RTS

; While loading: the first matrix table (no time limit, the picture is
; black).
flight_loading:
	LDA.w !fl_bk
	BMI .done
	LDA.w #!FL_KN
	JSR flight_build_n
.done
	RTS

; Muted throughout (musicMuted), airborne 60-420; flight 60, charged 300.
flight_status:
	SEP #$20
	LDA.l !ending_status
	ORA.b #!ES_MUTED
	AND.b #~!ES_AIRBORNE
	STA.l !ending_status
	REP #$20
	LDA.l !ending_age
	CMP.w #60
	BCC .done
	BNE .notRise
	PHA
	LDA.w #!ESFX_FLIGHT
	JSR fatal_sfx
	PLA
.notRise
	CMP.w #300
	BNE .notScatter
	PHA
	LDA.w #!ESFX_CHARGED
	JSR fatal_sfx
	PLA
.notScatter
	CMP.w #420
	BCS .done
	SEP #$20
	LDA.l !ending_status
	ORA.b #!ES_AIRBORNE
	STA.l !ending_status
	REP #$20
.done
	RTS

; wishFlightPose for ages 60-240 (clamped): horizon, Shenron's y, the ring.
flight_pose:
	LDA.l !ending_age
	CMP.w #60
	BCS .from
	LDA.w #60
.from
	CMP.w #241
	BCC .to
	LDA.w #240
.to
	SEC
	SBC.w #60
	ASL : ASL
	TAX
	LDA.l ending_flight_pose,X
	AND.w #$00FF
	STA.w !fl_h
	LDA.l ending_flight_pose+1,X
	AND.w #$00FF
	CMP.w #$0080
	BCC .pos
	ORA.w #$FF00
.pos
	STA.w !fl_dy
	LDA.l ending_flight_pose+2,X
	AND.w #$00FF
	STA.w !fl_by
	LDA.l ending_flight_pose+3,X
	AND.w #$00FF
	STA.w !fl_rad
	; after the scatter: radius 12 + 3 away
	LDA.l !ending_age
	SEC
	SBC.w #300
	BCS .away
	LDA.w #$0000
.away
	STA.w !fl_away
	BEQ .done
	ASL
	CLC
	ADC.w !fl_away
	CLC
	ADC.w #12
	STA.w !fl_rad
.done
	RTS

; The heading this frame (ages 180-420, clamped), a new table build when
; it moved and no build runs.
flight_heading:
	LDA.l !ending_age
	CMP.w #180
	BCS .from
	LDA.w #180
.from
	CMP.w #421
	BCC .to
	LDA.w #420
.to
	SEC
	SBC.w #180
	ASL
	TAX
	LDA.l ending_flight_turn,X
	AND.w #$00FF
	STA.w !fl_tx
	LDA.l ending_flight_turn+1,X
	AND.w #$00FF
	SEC
	SBC.w #256
	STA.w !fl_ty
	LDA.w !fl_bk
	BPL .busy
	LDA.w !fl_tx
	CMP.w !fl_vx
	BNE .start
	LDA.w !fl_ty
	CMP.w !fl_vy
	BEQ .busy
.start
	LDA.w !fl_tx
	STA.w !fl_bvx
	LDA.w !fl_ty
	STA.w !fl_bvy
	STZ.w !fl_bk
	; entries the floor shows now: K up to 224 - horizon + 6
	LDA.w #224+6-!ENDING_FLIGHT_KMIN
	SEC
	SBC.w !fl_h
	CMP.w #!FL_KN
	BCC .max
	LDA.w #!FL_KN-1
.max
	STA.w !fl_bkmax
.busy
	RTS


; A entries: A = -vy T1, B = vx T2, C = vx T1, D = vy T2 (8.8; vx >= 0 and
; vy < 0 on this turn, |vy| up to 256). Swaps the buffers when complete.
flight_build_n:
	STA.w !fl_i
.entry
	LDA.w !fl_bk
	ASL : ASL
	TAX
	LDA.l ending_flight_t12,X
	STA.w !fl_t1
	LDA.l ending_flight_t12+2,X
	STA.w !fl_t2
	; the back buffer's entry offset
	LDA.w !fl_buf
	BEQ .b1
	LDA.w #$0000
	BRA .b
.b1
	LDA.w #!FL_BUFSTEP
.b
	CLC
	ADC.w !fl_bk
	CLC
	ADC.w !fl_bk
	CLC
	ADC.w !fl_bk
	CLC
	ADC.w !fl_bk
	STA.w !fl_tmp2
	; A = |vy| T1, D = -|vy| T2
	LDA.w !fl_bvy
	EOR.w #$FFFF
	INC
	STA.w !fl_tmp
	LDA.w !fl_t1
	JSR flight_mul
	LDX.w !fl_tmp2
	STA.w !FL_AB0,X
	LDA.w !fl_t2
	JSR flight_mul
	EOR.w #$FFFF
	INC
	LDX.w !fl_tmp2
	STA.w !FL_CD0+2,X
	; B = vx T2, C = vx T1
	LDA.w !fl_bvx
	STA.w !fl_tmp
	LDA.w !fl_t2
	JSR flight_mul
	LDX.w !fl_tmp2
	STA.w !FL_AB0+2,X
	LDA.w !fl_t1
	JSR flight_mul
	LDX.w !fl_tmp2
	STA.w !FL_CD0,X
	LDA.w !fl_bk
	INC
	STA.w !fl_bk
	CMP.w !fl_bkmax
	BEQ .more
	BCS .complete
.more
	DEC.w !fl_i
	BEQ .paused
	JMP .entry
.paused
	RTS
.complete
	LDA.w !fl_buf
	EOR.w #$0001
	STA.w !fl_buf
	LDA.w !fl_bvx
	STA.w !fl_vx
	LDA.w !fl_bvy
	STA.w !fl_vy
	LDA.w #$FFFF
	STA.w !fl_bk
	RTS

; A16 = T * fl_tmp / 256 (fl_tmp 0..256).
flight_mul:
	LDY.w !fl_tmp
	CPY.w #$0100
	BCS .whole
	JMP mulu16_8_shr8
.whole
	RTS

; The flight's HDMA in vblank: channels 2, 3 (matrix, indirect from the
; small-table set the frame side finished last), 4 (Mode 7 after the HUD
; split), 6 (the sky gradient into colour 0). Called after nmi_regs.
nmi_flight:
	SEP #$20
	LDA.w !s_family
	CMP.b #!FAM_FLIGHT
	BNE .out
	LDA.w !s_loading
	BNE .out
	REP #$20
	LDA.w !fl_set
	BEQ .s0
	LDA.w #!FL_SET
.s0
	CLC
	ADC.w #!FL_SETS
	STA.w $4322
	CLC
	ADC.w #$0010
	STA.w $4332
	CLC
	ADC.w #$0010
	STA.w $4362
	LDA.w #$1B43              ; indirect, mode 3: M7A, M7B
	STA.w $4320
	LDA.w #$1D43              ; M7C, M7D
	STA.w $4330
	LDA.w #$0500              ; mode 0: BGMODE
	STA.w $4340
	LDA.w #flight_bgmode_hdma
	STA.w $4342
	LDA.w #$2103              ; mode 3: CGADD twice, CGDATA twice
	STA.w $4360
	SEP #$20
	LDA.b #$32
	STA.w $4324
	STA.w $4334
	STA.w $4364
	STA.w $4327
	STA.w $4337
	LDA.b #!CODE_BANK
	STA.w $4344
	LDA.w !s_hdma
	ORA.b #$5C
	STA.w !s_hdma
	LDA.w !N_HDMA
	ORA.b #$5C
	STA.w !N_HDMA
	JSR nmi_flight_build
.out
	REP #$30
	RTS

; Matrix entries of the table being built, with the PPU's multiplier (free
; in vblank: M7A/M7B are reloaded by the matrix HDMA at line 0), as many
; as the vblank has time for. With h = v / 2 (signed bytes) each product
; is T h / 128 = T v / 256: A = -(T1 hy), B = T2 hx, C = T1 hx, D = T2 hy.
nmi_flight_build:
	REP #$30
	LDA.w !fl_bk
	BPL .entry
	RTS
.entry
	JSL core_vblank_lines
	CMP.w #4
	BCS .room
	RTS
.room
	LDA.w !fl_bk
	ASL : ASL
	TAX
	LDA.w !fl_buf
	BEQ .b1
	LDA.w #$0000
	BRA .b
.b1
	LDA.w #!FL_BUFSTEP
.b
	CLC
	ADC.w !fl_bk
	CLC
	ADC.w !fl_bk
	CLC
	ADC.w !fl_bk
	CLC
	ADC.w !fl_bk
	TAY                           ; the back buffer's entry
	SEP #$20
	LDA.l ending_flight_t12,X     ; M7A = T1
	STA.w $211B
	LDA.l ending_flight_t12+1,X
	STA.w $211B
	LDA.w !fl_bvy+1               ; hy = vy / 2
	LSR
	LDA.w !fl_bvy
	ROR
	STA.w !s_nmitmp+8
	STA.w $211C
	JSR .product
	EOR.w #$FFFF
	INC
	STA.w !FL_AB0,Y               ; A
	SEP #$20
	LDA.w !fl_bvx                 ; hx = vx / 2
	LSR
	STA.w !s_nmitmp+9
	STA.w $211C
	JSR .product
	STA.w !FL_CD0,Y               ; C
	SEP #$20
	LDA.l ending_flight_t12+2,X   ; M7A = T2
	STA.w $211B
	LDA.l ending_flight_t12+3,X
	STA.w $211B
	LDA.w !s_nmitmp+9
	STA.w $211C
	JSR .product
	STA.w !FL_AB0+2,Y             ; B
	SEP #$20
	LDA.w !s_nmitmp+8
	STA.w $211C
	JSR .product
	STA.w !FL_CD0+2,Y             ; D
	LDA.w !fl_bk
	INC
	STA.w !fl_bk
	CMP.w !fl_bkmax
	BEQ .more
	BCS .complete
.more
	JMP .entry
.complete
	LDA.w !fl_buf
	EOR.w #$0001
	STA.w !fl_buf
	LDA.w !fl_bvx
	STA.w !fl_vx
	LDA.w !fl_bvy
	STA.w !fl_vy
	LDA.w #$FFFF
	STA.w !fl_bk
	RTS
; The 24-bit product >> 7 -> A16 (M8 on entry, M16 on exit).
.product
	LDA.w $2134
	ASL
	REP #$20
	LDA.w $2135
	ROL
	RTS

; The camera: travel = round(0.75 age) along the displayed heading from the
; browser's origin (as its (v travel) >> 8); Mode 7 centre and scroll.
flight_camera:
	LDA.l !ending_age
	ASL
	CLC
	ADC.l !ending_age
	CLC
	ADC.w #$0002
	LSR : LSR
	STA.w !fl_tmp2            ; travel (0..360)
	LDY.w !fl_vx              ; 0..229
	JSR mulu16_8_shr8
	CLC
	ADC.w #!ENDING_FLIGHT_OX
	STA.w !fl_cx
	; vy < 0: OY - ceil(|vy| travel / 256)
	LDA.w !fl_vy
	EOR.w #$FFFF
	INC
	TAY
	LDA.w !fl_tmp2
	CPY.w #$0100
	BCS .whole                ; |vy| = 256: the travel itself
	JSR mulu16_8_shr8_up
.whole
	EOR.w #$FFFF
	SEC
	ADC.w #!ENDING_FLIGHT_OY
	STA.w !fl_cy
	; Mode 7: centre = the camera in the 1024-pixel window, HOFS = X0 - 128,
	; VOFS = Y0 + 6 - horizon
	LDA.w !fl_cx
	AND.w #$03FF
	STA.w !s_m7x
	SEC
	SBC.w #128
	STA.w !s_bg1h
	LDA.w !fl_cy
	AND.w #$03FF
	STA.w !s_m7y
	CLC
	ADC.w #6
	SEC
	SBC.w !fl_h
	STA.w !s_bg1v
	RTS

; The small HDMA tables for the next vblank (the other set): the matrix
; channels' indirect lists (sky lines, then the table from K = 13), the
; sky gradient into colour 0; TM through the cut table (BG1 from the line
; under the horizon).
flight_tables:
	; unchanged horizon, table buffer and fade curves: the last set stands
	LDA.w !fl_h
	XBA
	ORA.w !fl_buf
	EOR.w !s_fadekey
	EOR.w !l_fadew
	CMP.w !fl_key
	BNE .build
	RTS
.build
	STA.w !fl_key
	LDA.w !fl_set
	EOR.w #$0001
	BEQ .s0
	LDA.w #!FL_SET
.s0
	CLC
	ADC.w #!FL_SETS
	STA.w !fl_tmp2            ; this set's base
	; the displayed buffer's tables
	LDA.w !fl_buf
	BEQ .d0
	LDA.w #!FL_BUFSTEP
.d0
	STA.w !fl_tmp
	TAX
	LDA.w #!FL_AB0
	CLC
	ADC.w !fl_tmp
	LDX.w !fl_tmp2
	JSR flight_indirect
	LDA.w #!FL_CD0
	CLC
	ADC.w !fl_tmp
	PHA
	LDA.w !fl_tmp2
	CLC
	ADC.w #$0010
	TAX
	PLA
	JSR flight_indirect
	; the gradient: rgb(0, 1 + (y >> 6), 4 + (y >> 5)) for y <= horizon
	LDA.w !fl_tmp2
	CLC
	ADC.w #$0020
	TAX
	STZ.w !fl_y
.seg
	LDA.w !fl_h
	INC
	SEC
	SBC.w !fl_y               ; lines left down to the horizon
	BEQ .gradDone
	BMI .gradDone
	CMP.w #32
	BCC .count
	LDA.w #32
.count
	STA.w !fl_i
	SEP #$20
	STA.w $0000,X
	LDA.b #$00
	STA.w $0001,X
	STA.w $0002,X
	REP #$20
	; the colour through the current fade curves
	LDA.w !fl_y
	LSR : LSR : LSR : LSR : LSR
	CLC
	ADC.w #4
	ASL
	TAY
	LDA.w !s_fadebt,Y
	STA.w !fl_out
	LDA.w !fl_y
	LSR : LSR : LSR : LSR : LSR : LSR
	INC
	ASL
	TAY
	LDA.w !s_fadeg,Y
	ORA.w !fl_out
	ORA.w !s_fader            ; red 0
	STA.w $0003,X
	INX : INX : INX : INX : INX
	LDA.w !fl_y
	CLC
	ADC.w !fl_i
	STA.w !fl_y
	BRA .seg
.gradDone
	SEP #$20
	LDA.b #$00
	STA.w $0000,X
	; TM: OBJ above, BG1 + OBJ from the line under the horizon
	LDA.b #$10
	STA.w !s_tm
	LDA.b #$11
	STA.w !s_tmcut
	LDA.b #$01
	STA.w !s_bg3cut
	STA.w !s_band_bits
	LDA.w !fl_h
	INC
	STA.w !s_band_top
	LDA.b #170
	STA.w !s_band_bot
	REP #$20
	LDA.w !fl_set
	EOR.w #$0001
	STA.w !fl_set
	RTS

; Indirect HDMA list at X for the matrix table at A: the lines down to the
; horizon + 6 (one entry: the first table entry, BG1 is off or far there),
; then K = 13 on, two repeat entries of up to 127 lines.
flight_indirect:
	STA.w !fl_out
	LDA.w !fl_h
	CLC
	ADC.w #7
	SEP #$20
	STA.w $0000,X             ; at most 149 lines: one entry when < 128
	REP #$20
	CMP.w #128
	BCC .one
	; two sky entries
	SEP #$20
	LDA.b #100
	STA.w $0000,X
	REP #$20
	LDA.w !fl_out
	STA.w $0001,X
	INX : INX : INX
	LDA.w !fl_h
	CLC
	ADC.w #7-100
	SEP #$20
	STA.w $0000,X
	REP #$20
.one
	LDA.w !fl_out
	STA.w $0001,X
	INX : INX : INX
	; the floor: 224 - (horizon + 7) lines from entry 0
	LDA.w #224-7
	SEC
	SBC.w !fl_h
	CMP.w #128
	BCC .last
	SEP #$20
	LDA.b #$80|127
	STA.w $0000,X
	REP #$20
	LDA.w !fl_out
	STA.w $0001,X
	CLC
	ADC.w #127*4
	STA.w !fl_out
	INX : INX : INX
	LDA.w #224-7-127
	SEC
	SBC.w !fl_h
.last
	ORA.w #$0080
	SEP #$20
	STA.w $0000,X
	REP #$20
	LDA.w !fl_out
	STA.w $0001,X
	SEP #$20
	LDA.b #$00
	STA.w $0003,X
	REP #$20
	RTS

; Fades: black (60 - age) / 30 until 60; the scatter's flash, white
; (304 - age) / 8 for 300-303.
flight_fades:
	STZ.w !s_fadeb
	STZ.w !s_fadew
	LDA.l !ending_age
	CMP.w #60
	BCS .lit
	EOR.w #$FFFF
	SEC
	ADC.w #60
	XBA
	LDY.w #30
	JSR div_a_y
	STA.w !s_fadeb
	RTS
.lit
	SEC
	SBC.w #300
	BCC .done
	CMP.w #4
	BCS .done
	EOR.w #$FFFF
	SEC
	ADC.w #4                  ; 304 - age
	XBA
	LSR : LSR : LSR           ; * 32
	STA.w !s_fadew
.done
	RTS

; At 240 Shenron has gone: his cells take the sparks (the vista's cells
; 32-35 into cells 8-11), the Balls at size 10 (cell row 2), and row 3's
; lower tiles are cleared (below the small Balls; the star tiles' lower
; pair, columns 14-15, stays). From away 32 row 3's upper tiles hold the
; current small size (8, 6, 4).
flight_scatter_cells:
	LDA.w !fl_swap
	BNE .small
	LDA.l !ending_age
	CMP.w #240
	BCS .swap
	RTS
.swap
	INC.w !fl_swap
	LDA.w #$FFFF
	STA.w !fl_smallv
	LDA.w #ending_vista_obj+$1000
	LDX.w #!FL_OBJ+$200
	LDY.w #$0100
	JSR flight_queue
	LDA.w #ending_vista_obj+$1200
	LDX.w #!FL_OBJ+$300
	LDY.w #$0100
	JSR flight_queue
	LDA.w #ending_flight_cells
	LDX.w #!FL_OBJ+$400
	LDY.w #$0400
	JSR flight_queue_cells
	LDA.w #flight_zero
	STA.w !q_src
	SEP #$20
	LDA.b #flight_zero>>16
	STA.w !q_src+2
	LDA.b #!LD_FILL
	STA.w !q_mode
	REP #$20
	LDA.w #!FL_OBJ+$700
	STA.w !q_dest
	LDA.w #14*32
	STA.w !q_size
	JMP queue_add
.small
	; the small size the Balls need now: away 32-47 size 8, 48-63 6, 64+ 4
	LDA.w !fl_away
	LSR : LSR : LSR : LSR
	SEC
	SBC.w #2
	BCC .none
	CMP.w #3
	BCC .k
	LDA.w #2
.k
	CMP.w !fl_smallv
	BEQ .none
	STA.w !fl_smallv
	XBA                       ; k * 512
	ASL
	CLC
	ADC.w #ending_flight_cells+$400
	LDX.w #!FL_OBJ+$600
	LDY.w #$0200
	JMP flight_queue_cells
.none
	RTS
flight_zero:
	db $00
; LD_VRAM of Y bytes from vista_obj offset A (or flight_cells) to VRAM X.
flight_queue:
	STA.w !q_src
	SEP #$20
	LDA.b #ending_vista_obj>>16
	BRA flight_queue_bank
flight_queue_cells:
	STA.w !q_src
	SEP #$20
	LDA.b #ending_flight_cells>>16
flight_queue_bank:
	STA.w !q_src+2
	LDA.b #!LD_VRAM
	STA.w !q_mode
	REP #$20
	STX.w !q_dest
	STY.w !q_size
	JMP queue_add

; ---------------------------------------------------------------------------
; Sprites. OAM slots 0-41 are the front group, front to back: the
; scatter's big spark, the Balls (each before its trail), Shenron; all
; 16x16 (the small Balls are the top-left tiles of empty cells), unused
; slots hidden. Slots 42-127 are the stars (8x8, priority 0), block-copied
; every frame from their entries at FL_STARS (DMA through WMDATA), which
; only change when the field drifts (x every 12 frames, y every 18).
!FL_FRONT = 42
!FL_STARS = !s_big+$A00         ; 86 OAM entries

flight_sprites:
	STZ.w !s_oamslot
	LDA.w !fl_away
	BNE .scattered
	; before the scatter: the ring in slots 0-6, Shenron 7-29
	JSR flight_ring
	LDA.l !ending_age
	CMP.w #240
	BCS .large
	JSR flight_dragon
	BRA .large
.scattered
	; big spark: (128, 56) for 30 frames from 300, frame (age - 300) / 3
	CMP.w #31
	BCS .noBig
	DEC
	LDY.w #3
	JSR div_a_y
	JSR flight_spark_tile
	STA.w !fl_tile
	LDA.w #128-8
	STA.w !fl_x
	LDA.w #56-8
	STA.w !fl_y
	JSR flight_put
.noBig
	LDA.l !ending_age
	CMP.w #420
	BCS .large
	JSR flight_balls
.large
	; the front group's size bits: every sprite large
	LDA.w !s_oamslot
	LSR : LSR : LSR : LSR         ; whole high-table bytes
	TAX
	SEP #$20
	LDA.b #$AA
.byte
	DEX
	BMI .partial
	STA.w !N_OAMHI,X
	BRA .byte
.partial
	REP #$20
	LDA.w !s_oamslot
	LSR : LSR : LSR : LSR
	TAY
	LDA.w !s_oamslot
	LSR : LSR
	AND.w #$0003
	TAX
	SEP #$20
	LDA.l flight_size_mask,X
	STA.w !N_OAMHI,Y
	REP #$20
	; hide what the front group left unused: Y = 224 (the Y byte is enough;
	; CPU stores, as a frame-thread DMA could meet the floor's HDMA)
	LDX.w !s_oamslot
	SEP #$20
	LDA.b #$E0
.hide
	CPX.w #!FL_FRONT*4
	BCS .hidden
	STA.l $7E0000+!N_OAM+1,X
	INX : INX : INX : INX
	BRA .hide
.hidden
	REP #$20
.stars
	JMP flight_stars
flight_hidden:
	db $E0
flight_size_mask:
	db $00,$02,$0A,$2A

; OAM word of spark frame A (any; four frames).
assert !ENDING_VISTA_SPARKS == 4, "the flight's spark frames are four"
flight_spark_tile:
	AND.w #$0003
	ASL
	CLC
	ADC.w #((!FL_SPARK>>3)*32)+((!FL_SPARK&7)*2)
	ORA.w #!FL_ATTR_SPARK
	RTS

; The next front slot (16x16): fl_tile at (fl_x, fl_y). Left out when not
; wholly within x 0-255 or above y -16 / below 223 (no x bit 8: a sprite
; crossing the left edge pops in whole).
flight_put:
	LDA.w !fl_x
	CMP.w #256
	BCS .skip
	LDA.w !fl_y
	CLC
	ADC.w #16
	CMP.w #224+16
	BCS .skip
	LDX.w !s_oamslot
	CPX.w #!FL_FRONT*4
	BCS .skip
	LDA.w !fl_tile
	STA.w !N_OAM+2,X
	SEP #$20
	LDA.w !fl_x
	STA.w !N_OAM,X
	LDA.w !fl_y
	STA.w !N_OAM+1,X
	REP #$20
	TXA
	CLC
	ADC.w #$0004
	STA.w !s_oamslot
.skip
	RTS

; The seven Balls after the scatter: (128 + (dx r >> 8), y + (dy r >> 8)),
; r = 12 + 3 away; size 12 - 2 (away >> 4), at least 4; three sparks trail
; each (frames (age >> 2) + j).
flight_balls:
	LDA.l !ending_age
	LSR : LSR
	INC
	JSR flight_spark_tile
	STA.w !fl_tw
	LDA.l !ending_age
	LSR : LSR
	INC : INC
	JSR flight_spark_tile
	STA.w !fl_tw+2
	LDA.l !ending_age
	LSR : LSR
	INC : INC : INC
	JSR flight_spark_tile
	STA.w !fl_tw+4
	LDA.w #6
	STA.w !fl_i
.ball
	LDA.w !fl_i
	ASL : ASL
	TAX
	LDA.l ending_flight_ballvec,X
	JSR flight_smul_rad
	CLC
	ADC.w #128
	STA.w !fl_x
	LDA.w !fl_i
	ASL : ASL
	TAX
	LDA.l ending_flight_ballvec+2,X
	JSR flight_smul_rad
	CLC
	ADC.w !fl_by
	STA.w !fl_y
	; far off the screen: neither the Ball nor its trail shows
	LDA.w !fl_x
	CLC
	ADC.w #48
	CMP.w #256+96
	BCS .gone
	LDA.w !fl_y
	CLC
	ADC.w #48
	CMP.w #224+96
	BCC .near
.gone
	JMP .next
.near
	LDA.w !fl_x
	PHA
	LDA.w !fl_y
	PHA
	LDA.w !fl_away
	LSR : LSR : LSR : LSR
	BEQ .big12
	CMP.w #1
	BEQ .big10
	; 8, 6, 4: the top-left tile of row 3's column 2 i, at (x - 4, y - 4)
	LDA.w !fl_i
	ASL
	ADC.w #(3*32)|!FL_ATTR_BALL
	STA.w !fl_tile
	LDA.w !fl_x
	SEC
	SBC.w #4
	STA.w !fl_x
	LDA.w !fl_y
	SEC
	SBC.w #4
	BRA .put
.big10
	LDA.w !fl_i
	ASL
	ADC.w #(((!FL_BALL10>>3)*32)+((!FL_BALL10&7)*2))|!FL_ATTR_BALL
	BRA .big
.big12
	LDA.w !fl_i
	ASL                       ; Balls in cells 0-6: tiles 2 i
	ORA.w #!FL_ATTR_BALL
.big
	STA.w !fl_tile
	LDA.w !fl_x
	SEC
	SBC.w #8
	STA.w !fl_x
	LDA.w !fl_y
	SEC
	SBC.w #8
.put
	STA.w !fl_y
	JSR flight_put
	PLA
	STA.w !fl_y
	PLA
	STA.w !fl_x
	JSR flight_trail
.next
	DEC.w !fl_i
	BMI .done
	JMP .ball
.done
	RTS

; (A16 signed, -256..256) * radius >> 8, rounded down as JavaScript's >>:
; |d| r / 256 rounded down for d >= 0, up (then negated) for d < 0. One
; 8x8 multiply: r is at most 9 bits (|d| r_hi * 256 >> 8 = |d| r_hi).
flight_smul_rad:
	STZ.w !fl_up
	CMP.w #$8000
	BCC flight_mag
	EOR.w #$FFFF
	INC
	LDY.w #$00FF
	STY.w !fl_up
	JSR flight_mag
	EOR.w #$FFFF
	INC
	RTS
flight_mag:
	CMP.w #$0100
	BCC .mul
	LDA.w !fl_rad
	RTS
.mul
	STA.w !fl_t1
	SEP #$20
	STA.w $4202
	LDA.w !fl_rad
	STA.w $4203
	REP #$20
	LDA.w !fl_rad
	AND.w #$0100
	BEQ .low
	LDA.w !fl_t1
.low
	STA.w !fl_t2
	LDA.w $4216
	CLC
	ADC.w !fl_up
	XBA
	AND.w #$00FF
	CLC
	ADC.w !fl_t2
	RTS

; One trail spark at row offset <row>, OAM word fl_tw + <tw>, into slot Y + <slot>.
macro flight_trail_fast(row, tw, slot)
	LDA.w !fl_y
	SEC
	SBC.l ending_flight_trail+<row>+2,X
	XBA
	AND.w #$FF00
	STA.w !fl_tmp
	LDA.w !fl_x
	SEC
	SBC.l ending_flight_trail+<row>,X
	AND.w #$00FF
	ORA.w !fl_tmp
	STA.w !N_OAM+<slot>,Y
	LDA.w !fl_tw+<tw>
	STA.w !N_OAM+<slot>+2,Y
endmacro

; Ball fl_i's three trailing sparks (j = 3, 2, 1: front to back) at the
; ball minus (d 7 j >> 8), top-left 8 more (ending_flight_trail), straight
; into the next front slots.
flight_trail:
	LDA.w !fl_i
	ASL : ASL
	STA.w !fl_tmp
	ASL
	CLC
	ADC.w !fl_tmp
	TAX                           ; ball i's rows
	; within 29 px of a ball well inside the screen: all three show,
	; written without checks
	LDA.w !fl_x
	SEC
	SBC.w #32
	CMP.w #256-64
	BCS .toChecked
	LDA.w !fl_y
	SEC
	SBC.w #32
	CMP.w #224-64
	BCS .toChecked
	LDY.w !s_oamslot
	CPY.w #(!FL_FRONT-3)*4+1
	BCC .fast
.toChecked
	JMP .checked
.fast
	%flight_trail_fast(8, 4, 0)
	%flight_trail_fast(4, 2, 4)
	%flight_trail_fast(0, 0, 8)
	TYA
	CLC
	ADC.w #12
	STA.w !s_oamslot
	RTS
.checked
	TXA
	CLC
	ADC.w #8                      ; j = 3
	TAX
	LDA.w #4
	STA.w !fl_t1                  ; fl_tw offset of j = 3
.spark
	LDA.w !fl_x
	SEC
	SBC.l ending_flight_trail,X
	CMP.w #256
	BCS .skip
	STA.w !fl_tmp
	LDA.w !fl_y
	SEC
	SBC.l ending_flight_trail+2,X
	CLC
	ADC.w #16
	CMP.w #224+16
	BCS .skip
	SBC.w #16-1                   ; carry clear: A - 16
	STA.w !fl_tmp2
	LDY.w !s_oamslot
	CPY.w #!FL_FRONT*4
	BCS .skip
	PHX
	LDX.w !fl_t1
	LDA.w !fl_tw,X
	STA.w !N_OAM+2,Y
	PLX
	SEP #$20
	LDA.w !fl_tmp
	STA.w !N_OAM,Y
	LDA.w !fl_tmp2
	STA.w !N_OAM+1,Y
	REP #$20
	TYA
	CLC
	ADC.w #$0004
	STA.w !s_oamslot
.skip
	DEX : DEX : DEX : DEX
	DEC.w !fl_t1
	DEC.w !fl_t1
	BPL .spark
	RTS

; The ring before the scatter (radius 12-28 from flight_ring's table):
; slots 0-6, always on the screen.
flight_ring:
	LDA.w !fl_rad
	SEC
	SBC.w #12
	ASL
	STA.w !fl_tmp
	ASL : ASL : ASL
	SEC
	SBC.w !fl_tmp                 ; (r - 12) * 14
	TAX
	LDA.w !fl_by
	SEC
	SBC.w #8
	STA.w !fl_tmp
	LDY.w #$0000
	SEP #$20
.ball
	LDA.l ending_flight_ring,X
	CLC
	ADC.b #128-8
	STA.w !N_OAM,Y
	LDA.l ending_flight_ring+1,X
	CLC
	ADC.w !fl_tmp
	STA.w !N_OAM+1,Y
	TYA
	LSR                           ; Ball i (slot 4 i): tile 2 i
	STA.w !N_OAM+2,Y
	LDA.b #!FL_ATTR_BALL>>8
	STA.w !N_OAM+3,Y
	INX : INX
	INY : INY : INY : INY
	CPY.w #7*4
	BCC .ball
	REP #$20
	STY.w !s_oamslot
	RTS

; Shenron (until 240) in slots 7-29: his entries at FL_DRAGON (x and tile
; fixed), each row's y (dy + fl_dy; 224, hidden, off the screen) set, then
; one DMA.
!FL_DRAGON = !FL_STARS+(86*4)
flight_dragon_image:
	LDX.w #$0000
.cell
	LDA.l ending_flight_dragon_oam,X
	STA.w !FL_DRAGON,X
	LDA.l ending_flight_dragon_oam+2,X
	STA.w !FL_DRAGON+2,X
	INX : INX : INX : INX
	CPX.w #!ENDING_FLIGHT_DRAGON_CELLS*4
	BCC .cell
	RTS

flight_dragon:
	LDX.w #$0001
	STZ.w !fl_tmp2
.row
	LDA.w !fl_tmp2
	ASL : ASL : ASL : ASL
	CLC
	ADC.w !fl_dy
	CLC
	ADC.w #16
	CMP.w #224+16
	BCC .on
	LDA.w #224+16
.on
	SEC
	SBC.w #16
	STA.w !fl_tmp
	PHX
	LDX.w !fl_tmp2
	LDA.l ending_flight_dragon_rows,X
	PLX
	AND.w #$00FF
	BEQ .nextRow
	TAY
	SEP #$20
	LDA.w !fl_tmp
.cell
	STA.w !FL_DRAGON,X
	INX : INX : INX : INX
	DEY
	BNE .cell
	REP #$20
.nextRow
	INC.w !fl_tmp2
	LDA.w !fl_tmp2
	CMP.w #5
	BCC .row
	; Shenron's cells into the OAM buffer in the field vblank (wq_push)
	LDA.w #$0032
	STA.w !s_wqarg
	LDX.w #!N_OAM+(7*4)
	LDY.w #!FL_DRAGON
	LDA.w #!ENDING_FLIGHT_DRAGON_CELLS*4
	JSR wq_push
	LDA.w #(7+!ENDING_FLIGHT_DRAGON_CELLS)*4
	STA.w !s_oamslot
	RTS

; Stars: their entries follow the drift (x - age/12, y + age/18 mod 160).
; They stay in the game's OAM image in slots 42-127: the module area ends at
; slot 42 (s_oamslot), so the game's next OAM pass hides nothing after it.
; The 86 entries are copied in there when they move, and every 64 frames,
; by the vblank's low-priority copy (s_lw, nmi_lowcopy: cells and rows go
; first): no frame-thread DMA, which could meet the floor's HDMA.
flight_stars:
	LDA.l !ending_age
	LDY.w #12
	JSR div_a_y
	CMP.w !fl_q12
	BEQ .xSame
	STA.w !fl_q12
	JSR flight_stars_x
	STZ.w !fl_stq
.xSame
	LDA.l !ending_age
	LDY.w #18
	JSR div_a_y
	CMP.w !fl_q18
	BEQ .ySame
	STA.w !fl_q18
	JSR flight_stars_y
	STZ.w !fl_stq
.ySame
	LDA.w !fl_stq
	BEQ .copy
	DEC.w !fl_stq
	BRA .slot
.copy
	LDA.w #64
	STA.w !fl_stq
	LDA.w #!N_OAM+(!FL_FRONT*4)
	STA.w !s_lw+0
	LDA.w #!FL_STARS
	STA.w !s_lw+2
	LDA.w #$0032
	STA.w !s_lw+4
	LDA.w #86*4
	STA.w !s_lw+6                 ; published last
.slot
	LDA.w #!FL_FRONT*4
	STA.w !s_oamslot
	RTS

; x bytes of all stars for the drift fl_q12; their tiles and attributes.
flight_stars_x:
	LDY.w #$0000
	LDX.w #$0000
	SEP #$20
.star
	LDA.l ending_flight_stars,X
	SEC
	SBC.w !fl_q12
	STA.w !FL_STARS,Y
	LDA.l ending_flight_stars+2,X
	STA.w !FL_STARS+2,Y
	LDA.b #!FL_ATTR_STAR>>8
	STA.w !FL_STARS+3,Y
	INY : INY : INY : INY
	INX : INX : INX
	CPX.w #86*3
	BCC .star
	REP #$20
	RTS

; y bytes of all stars for the drift fl_q18 (mod 160).
flight_stars_y:
	LDA.w !fl_q18
	LDY.w #160
	JSR div_a_y
	STX.w !fl_tmp
	LDY.w #$0000
	LDX.w #$0000
	SEP #$20
.star
	LDA.l ending_flight_stars+1,X
	CLC
	ADC.w !fl_tmp
	BCS .wrap
	CMP.b #160
	BCC .y
.wrap
	SBC.b #160
.y
	STA.w !FL_STARS+1,Y
	INY : INY : INY : INY
	INX : INX : INX
	CPX.w #86*3
	BCC .star
	REP #$20
	RTS
