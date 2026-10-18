; Vegeta's sprite: pose choice (vegetaPose), OBJ blocks streamed into the
; OBJ VRAM of actor slot 3 (the Doppelganger's own streaming region, unused
; while the trial holds the slot inactive), double-buffered so a pose is
; shown only once its tiles are complete, and his palette.
;
; VRAM (OBJ name table 0, tiles of the slot-3 region of C1:9FAA):
;   buffer A  tiles $080-$089 (top) / $090-$099 (bottom)   word $6800 / $6900
;   buffer B  tiles $0E0-$0E9 / $0F0-$0F9                   word $6E00 / $6F00
;   echo      tiles $068-$06F / $078-$07F (blocks 0-3) and $0C8-$0C9 / $0D8-$0D9 (block 4)
; A frame has at most !VEGETA_MAX_BLOCKS (5) 16x16 blocks.

assert !VEGETA_MAX_BLOCKS <= 5, "vegeta frames need more than 5 blocks"

; ---------------------------------------------------------------------------
; vegetaPose(s): A = frame index 0-31; !vg_t0 = recoil dx, !vg_t1 = recoil dy.
vg_pose:
	; gold = tier * 8
	LDA !vg_tier
	AND.w #$0001
	ASL : ASL : ASL
	STA !vg_t2
	SEP #$20
	LDA !vg_phase
	CMP.b #!VP_TRANSFORM
	BNE +
	REP #$20
	LDA.w #7
	BRA .gold
+	CMP.b #!VP_BATTLE
	REP #$20
	BEQ +
	LDA.w #0
	BRA .gold
+	LDA !vg_act
	AND.w #$00FF
	CMP.w #!VA_BEAM
	BNE .notbeam
	LDA.l !vs_beam_on
	AND.w #$00FF
	BEQ +
	LDA.w #6
	BRA .gold
+	LDA.w #5
	BRA .gold
.notbeam
	CMP.w #!VA_VOLLEY
	BNE .notvolley
	JSR vg_volley_hand
	BRA .gold
.notvolley
	CMP.w #!VA_RUSH
	BEQ .strike
	CMP.w #!VA_COUNTER
	BEQ .strike
	JSR vg_legs
	BRA .gold
.strike
	JSR vg_strike_pose
.gold
	CLC
	ADC !vg_t2
	PHA
	; recoil = hurt > 6 ? 2 : hurt > 2 ? 1 : 0, opposite to the facing (set
	; last: the pose helpers use the vg_t* words)
	STZ !vg_t0
	STZ !vg_t1
	LDA !vg_hurt
	AND.w #$00FF
	LDX.w #$0000
	CMP.w #7
	BCC +
	INX
+	CMP.w #3
	BCC +
	INX
+	TXA
	BEQ .norecoil
	STA !vg_t2
	LDA !vg_facing
	AND.w #$0003
	ASL
	TAX
	LDA.l vg_dir_dx,X
	JSR .times                    ; -dx * recoil
	STA !vg_t0
	LDA.l vg_dir_dy,X
	JSR .times
	STA !vg_t1
.norecoil
	PLA
	RTS
; A = signed unit (-1/0/1), !vg_t2 = recoil -> A = -unit * recoil
.times
	CMP.w #$0000
	BEQ +
	BMI .pos
	LDA !vg_t2
	EOR.w #$FFFF
	INC
	RTS
.pos
	LDA !vg_t2
+	RTS

; Direction vectors [0,1],[1,0],[-1,0],[0,-1] (down, right, left, up).
vg_dir_dx:
	dw 0, 1, -1, 0
vg_dir_dy:
	dw 1, 0, 0, -1

; Guard frame (without gold): facing 0 -> 16, 3 -> 19, sides -> 1.
vg_guard:
	LDA !vg_facing
	AND.w #$0003
	BEQ .down
	CMP.w #3
	BEQ .up
	LDA.w #1
	RTS
.down
	LDA.w #16
	RTS
.up
	LDA.w #19
	RTS

; legs(): the walk/backstep cells (without gold).
vg_legs:
	; moving = age < movingUntil (battle only; caller is in battle)
	LDA !vg_age
	CMP !vg_moving_until
	BCC .moving
	JMP vg_guard
.moving
	LDA !vg_backstep
	AND.w #$00FF
	BEQ .walk
	; shuffle = floor(travel/16) & 1
	LDA !vg_travel
	LSR : LSR : LSR : LSR
	AND.w #$0001
	BNE +
	JMP vg_guard
+	LDA !vg_facing
	AND.w #$0003
	BEQ .bdown
	CMP.w #3
	BEQ .bup
	LDA.w #22
	RTS
.bdown
	LDA.w #17
	RTS
.bup
	LDA.w #20
	RTS
.walk
	; 16 + (facing 0 ? 1 : facing 3 ? 4 : 6) + walk, walk = floor(travel/12) & 1
	LDA !vg_travel
	LDX.w #12
	JSR vg_udiv16
	AND.w #$0001
	STA !vg_t3
	LDA !vg_facing
	AND.w #$0003
	BEQ .wdown
	CMP.w #3
	BEQ .wup
	LDA.w #22
	BRA .wadd
.wdown
	LDA.w #17
	BRA .wadd
.wup
	LDA.w #20
.wadd
	CLC
	ADC !vg_t3
	RTS

; Volley: hands return to the hip between shots.
vg_volley_hand:
	LDA !vg_act_age
	SEC
	SBC.w #42
	BMI .hip
	STA !vg_t3                    ; at
	LDX.w #20                     ; spacing
	LDY.w #3*20                   ; spacing * count
	LDA !vg_tier
	AND.w #$0001
	BEQ +
	LDX.w #13
	LDY.w #5*13
+	TYA
	CMP !vg_t3
	BCC .hip
	BEQ .hip
	LDA !vg_t3
	JSR vg_umod16                 ; at % spacing (X)
	CMP.w #7
	BCS .hip
	LDA.w #6
	RTS
.hip
	LDA.w #5
	RTS

; Rush / counter: strike while committed, lunge cell or legs while dashing.
vg_strike_pose:
	; end = rush ? 58 : 40, strike = rush ? 3 : 4
	LDA !vg_act
	AND.w #$00FF
	CMP.w #!VA_RUSH
	BEQ .rush
	LDA.w #40
	STA !vg_t3
	LDA.w #4
	BRA +
.rush
	LDA.w #58
	STA !vg_t3
	LDA.w #3
+	PHA                           ; strike frame
	; from = contact ?? end-8 ; until = contact==null ? end+10 : contact+14
	LDA !vg_contact
	CMP.w #$FFFF
	BNE .contact
	LDA !vg_t3
	SEC
	SBC.w #8
	TAX                           ; from
	LDA !vg_t3
	CLC
	ADC.w #10
	TAY                           ; until
	BRA .test
.contact
	TAX
	CLC
	ADC.w #14
	TAY
.test
	STY !vg_t1
	TXA
	CMP !vg_act_age
	BEQ +
	BCS .nostrike                 ; age < from
+	LDA !vg_act_age
	CMP !vg_t1
	BCS .nostrike                 ; age >= until
	PLA
	RTS
.nostrike
	PLA
	; age >= 24 && age < end: side lunge (2) or legs
	LDA !vg_act_age
	CMP.w #24
	BCC .guard
	CMP !vg_t3
	BCS .guard
	LDA !vg_facing
	AND.w #$0003
	CMP.w #1
	BEQ .lunge
	CMP.w #2
	BEQ .lunge
	JMP vg_legs
.lunge
	LDA.w #2
	RTS
.guard
	JMP vg_guard

; Unsigned A / X -> A (quotient), Y = remainder. X != 0. Small values.
vg_udiv16:
	CPX.w #256
	BCS .wide
	STA.l $004204                 ; 8-bit divisor: the CPU's divider
	SEP #$20
	TXA
	STA.l $004206
	REP #$20
	NOP
	NOP
	NOP
	NOP
	NOP
	NOP
	LDA.l $004216
	TAY
	LDA.l $004214
	RTS
.wide
	STX !vg_t1
	STA !vg_t0
	LDA.w #$0000
	LDX.w #16
-	ASL !vg_t0
	ROL
	CMP !vg_t1
	BCC +
	SBC !vg_t1
	INC !vg_t0
+	DEX
	BNE -
	TAY
	LDA !vg_t0
	LDX !vg_t1
	RTS
; Unsigned A % X -> A.
vg_umod16:
	JSR vg_udiv16
	TYA
	RTS

; ---------------------------------------------------------------------------
; Camera the BG is drawn with (view-camera.js): $A8/$AA plus the fine part
; of BG1's scroll as the next NMI writes it (quake bit included).
; Out: !vg_t2 = camera x, !vg_t3 = camera y (also !vs_cam_x/!vs_cam_y).
vg_camera:
	SEP #$20
	LDA $5E
	AND.b #$02
	EOR $B0
	XBA
	LDA $B1
	XBA
	REP #$20
	SEC
	SBC $A8
	CLC
	ADC.w #8
	AND.w #$000F
	CLC
	ADC $A8
	SEC
	SBC.w #8
	STA !vg_t2
	SEP #$20
	LDA $5F
	AND.b #$02
	EOR $B2
	XBA
	LDA $B3
	XBA
	REP #$20
	SEC
	SBC $AA
	CLC
	ADC.w #8
	AND.w #$000F
	CLC
	ADC $AA
	SEC
	SBC.w #8
	STA !vg_t3
	STA.l !vs_cam_y
	LDA !vg_t2
	STA.l !vs_cam_x
	RTS

; ---------------------------------------------------------------------------
; Draw frame A (0-31) with the anchor at map (X16, Y16) through the buffer
; whose first tile is in !vs_draw_tile; !vs_draw_attr = OAM attribute high
; byte bits (palette/priority/flip), !vs_draw_front = 1 front, 0 behind.
; Uses !vs_draw_* scratch in SRAM.
vg_draw_frame:
	AND.w #$001F
	STA !vg_t3                    ; frame
	TXA
	SEC
	SBC.l !vs_cam_x
	STA !vg_t0                    ; anchor screen x
	TYA
	SEC
	SBC.l !vs_cam_y
	DEC                           ; OBJ rows show one line below their Y
	STA !vg_t1                    ; anchor OAM y
	LDA.l !vs_draw_attr
	STA !vg_t2                    ; palette, priority, flip ($4000)
	AND.w #$4000
	BEQ +
	LDA !vg_t0                    ; flipped: x = anchor - (dx + 16)
	SEC
	SBC.w #16
	STA !vg_t0
+	STZ.w !core_spr_size&$FFFF
	; frame table entry: count, data offset, offsets pointer
	LDA !vg_t3
	ASL
	ASL
	CLC
	ADC !vg_t3                    ; * 5
	TAX
	LDA.l vegeta_frame_table,X
	AND.w #$00FF
	BEQ .done
	TAY                           ; blocks left
	LDA.l vegeta_frame_table+3,X
	TAX                           ; dx, dy (signed bytes) at !DATA_VEGETA + X
	LDA.l !vs_draw_tile
	STA !vg_t3                    ; tile of this block
.loop
	LDA.l !DATA_VEGETA+1,X
	AND.w #$00FF
	EOR.w #$0080
	SEC
	SBC.w #$0080
	CLC
	ADC !vg_t1
	STA.w !core_spr_y&$FFFF
	LDA.l !DATA_VEGETA,X
	AND.w #$00FF
	EOR.w #$0080
	SEC
	SBC.w #$0080
	BIT !vg_t2                    ; V = flip
	BVC +
	EOR.w #$FFFF
	INC
+	CLC
	ADC !vg_t0
	STA.w !core_spr_x&$FFFF
	LDA !vg_t3
	ORA !vg_t2
	STA.w !core_spr_tile&$FFFF
	PHX
	PHY
	LDA.l !vs_draw_front
	BEQ .back
	JSL core_oam_add_front
	BRA .next
.back
	JSL core_oam_add
.next
	PLY
	PLX
	INX
	INX
	; the next block's tiles (the echo's fifth block is at !VGB_E4_TILE)
	LDA !vg_t3
	INC
	INC
	CMP.w #!VGB_E_TILE+8
	BNE +
	LDA.w #!VGB_E4_TILE
+	STA !vg_t3
	DEY
	BNE .loop
.done
	RTS

; ---------------------------------------------------------------------------
; Vegeta's body this frame: pick the buffer holding the pose (or request
; it) and draw. A = frame, X/Y = anchor (map), flip in !vs_draw_attr.
vg_draw_body:
	SEP #$20
	CMP !vg_front
	BEQ .front
	CMP !vg_back
	BEQ .swap
	STA !vg_want                   ; upload it into the back buffer next vblank
	LDA !vg_front
	CMP.b #$FF
	REP #$20
	BNE .old
	RTS                            ; nothing uploaded yet
.old
	SEP #$20
	LDA !vg_front                  ; keep showing the last complete pose
	BRA .front
.swap
	LDA !vg_back
	PHA
	LDA !vg_front
	STA !vg_back
	PLA
	STA !vg_front
	LDA !vg_front_buf
	EOR.b #$01
	STA !vg_front_buf
.front
	REP #$20
	AND.w #$00FF
	PHA
	LDA !vg_front_buf
	AND.w #$00FF
	BEQ +
	LDA.w #!VGB_B_TILE
	BRA ++
+	LDA.w #!VGB_A_TILE
++	STA.l !vs_draw_tile
	PLA
	JMP vg_draw_frame

; ---------------------------------------------------------------------------
; Palette 4 in the game's CGRAM buffer: Vegeta's colours, or white for the
; hit flash (flash: hurt > 0 and hurt & 2). Every drawn frame (the game may
; reload enemy palettes). A = 0 colours, 1 white.
vg_write_palette:
	PHB
	CMP.w #$0000
	BNE .white
	LDX.w #vegeta_pal+2
	LDY.w #$0600+((128+(!VEGETA_OBJ_PAL*16)+1)*2)
	LDA.w #30-1
	db $54,$7E,vegeta_pal>>16      ; MVN data bank -> 7E
	PLB
	RTS
.white
	PLB
	LDA.w #$7FFF
	LDX.w #28
-	STA.l $7E0600+((128+(!VEGETA_OBJ_PAL*16)+1)*2),X
	DEX
	DEX
	BPL -
	RTS

; ---------------------------------------------------------------------------
; Field vblank (modules_field_nmi, DB = $80): upload a requested pose into
; the back buffer, and the echo frame, when the vblank has room.
vegeta_nmi:
	; no trial: back at once (every field vblank runs this, ahead of the
	; modules whose uploads follow)
	PHP
	SEP #$20
	LDA.l $7E0000|!vg_on
	CMP.b #!VG_ON
	BEQ +
	PLP
	RTL
+	PLP
	PHB
	PHP
	REP #$30
	PEA $7E7E
	PLB
	PLB
	SEP #$20
	LDA !vg_want
	CMP.b #$FF
	BEQ .echo
	REP #$20
	JSL core_vblank_lines
	CMP.w #10
	BCC .out16
	SEP #$20
	LDA !vg_want
	REP #$20
	AND.w #$001F
	PHA
	LDA !vg_front_buf
	AND.w #$00FF
	BNE +
	LDA.w #$6000+(!VGB_B_TILE*16)
	BRA ++
+	LDA.w #$6000+(!VGB_A_TILE*16)
++	TAY                           ; VRAM word address of the back buffer
	PLA
	JSR vg_upload_rows
	SEP #$20
	LDA !vg_want
	STA !vg_back
	LDA.b #$FF
	STA !vg_want
.echo
	SEP #$20
	LDA !vg_echo_want
	CMP.b #$FF
	BEQ .ball
	REP #$20
	JSL core_vblank_lines
	CMP.w #10
	BCC .out16
	SEP #$20
	LDA !vg_echo_want
	REP #$20
	AND.w #$001F
	JSR vg_upload_echo
	SEP #$20
	LDA !vg_echo_want
	STA !vg_echo_frame
	LDA.b #$FF
	STA !vg_echo_want
.ball
	REP #$20
	JSR vg_ball_nmi
.out16
.out
	PLP
	PLB
	RTL

; DMA helper: A = bytes, X = source offset (from vegeta_tiles, an xdata bank),
; Y = VRAM word address. Channel 6 (the game's vblank DMA uses 7 and the
; sprite cells 4-7 before us; HDMA uses 0-1 in the field). DB = $7E.
vg_dma:
	PHA
	SEP #$20
	LDA.b #$80
	STA.l $002115
	REP #$20
	TYA
	STA.l $002116
	LDA.w #$1801
	STA.l $004360
	TXA
	CLC
	ADC.w #vegeta_tiles
	STA.l $004362
	SEP #$20
	LDA.b #vegeta_tiles>>16
	STA.l $004364
	REP #$20
	PLA
	STA.l $004365
	SEP #$20
	LDA.b #$40
	STA.l $00420B
	REP #$20
	RTS

; Frame A's two rows to VRAM word Y (top) / Y+$100 (bottom).
vg_upload_rows:
	STY !vg_t3
	STA !vg_t0
	ASL : ASL
	CLC
	ADC !vg_t0
	TAX
	LDA.l vegeta_frame_table,X
	AND.w #$00FF
	XBA                            ; *256
	LSR : LSR                      ; n * 64
	STA !vg_t1
	LDA.l vegeta_frame_table+1,X
	STA !vg_t2                     ; data offset
	TAX
	LDA !vg_t1
	LDY !vg_t3
	JSR vg_dma                     ; top row
	LDA !vg_t2
	CLC
	ADC !vg_t1
	TAX
	LDA !vg_t3
	CLC
	ADC.w #$0100
	TAY
	LDA !vg_t1
	JMP vg_dma                     ; bottom row

; Echo frame A: blocks 0-3 to rows $068/$078, block 4 to $0C8/$0D8.
vg_upload_echo:
	STA !vg_t0
	ASL : ASL
	CLC
	ADC !vg_t0
	TAX
	LDA.l vegeta_frame_table,X
	AND.w #$00FF
	STA !vg_t0                     ; n
	LDA.l vegeta_frame_table+1,X
	STA !vg_t2                     ; data offset
	; blocks 0..min(n,4)-1
	LDA !vg_t0
	CMP.w #5
	BCC +
	LDA.w #4
+	XBA
	LSR : LSR                      ; m * 64
	STA !vg_t1
	LDX !vg_t2
	LDY.w #$6000+(!VGB_E_TILE*16)
	JSR vg_dma
	; bottom row of blocks 0..3: data + n*64
	LDA !vg_t0
	XBA
	LSR : LSR
	CLC
	ADC !vg_t2
	TAX
	LDY.w #$6100+(!VGB_E_TILE*16)
	LDA !vg_t1
	JSR vg_dma
	LDA !vg_t0
	CMP.w #5
	BCC .done
	; block 4: top at data + 4*64, bottom at data + n*64 + 4*64
	LDA !vg_t2
	CLC
	ADC.w #4*64
	TAX
	LDY.w #$6000+(!VGB_E4_TILE*16)
	LDA.w #64
	JSR vg_dma
	LDA !vg_t0
	XBA
	LSR : LSR
	CLC
	ADC !vg_t2
	CLC
	ADC.w #4*64
	TAX
	LDY.w #$6100+(!VGB_E4_TILE*16)
	LDA.w #64
	JSR vg_dma
.done
	RTS
