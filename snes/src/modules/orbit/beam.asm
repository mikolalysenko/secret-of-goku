; Beam bands (engine/orbit-effects.js beam: Goku's wave, Frieza's beam and
; finger laser). The browser paints a band of radius R across the beam's
; axis, uniform along it: outer quarters in the beam-body's row-6 colour,
; the inner half in its row-7 colour (the laser: one pixel each side of a
; white core). On the cartridge a beam is drawn as parallel chains of 32x32
; OBJ cells marching along the axis; every cell of one chain shows the same
; picture, so a beam needs one picture per chain (chains -j and j are the
; same picture turned half round). Pictures are generated at run time into
; a 512-byte buffer (rows of the exact floor((-x vy + y vx) / 256) test,
; a floor DDA per threshold), sent by the NMI, and kept per VRAM slot with
; the key they were made for: a steady beam costs nothing; while a beam
; grows or fades, one picture is made at a time and the chains show the
; nearest one already made.
;
; Groups: 0 = Goku's wave (slots 0-2, OBJ $040/$044/$048), 1 = Frieza's
; beam or laser (slots 3-5, OBJ $04C/$080/$084). DB = $32, M16/X16.


; (defines: module.asm)

beam_slot_vram:
	dw $6000+($040*16), $6000+($044*16), $6000+($048*16)
	dw $6000+($04C*16), $6000+($080*16), $6000+($084*16)
beam_slot_tile:
	dw $040, $044, $048, $04C, $080, $084

; Scene start: no pictures, nothing wanted, planes 2-3 of the buffer zero.
beam_init:
	LDA.w #$FFFF
	STA.w !bw_key
	STA.w !bw_key+2
	LDX.w #10
-	STA.w !bs_have,X
	DEX : DEX
	BPL -
	STZ.w !bg_on
	STZ.w !bg_ready
	; no cached runs
	LDA.w #$FFFF
	LDX.w #30
-	STA.w !BC_SIG,X
	DEX : DEX
	BPL -
	STZ.w !BC_BYTES
	STZ.w !BC_BYTES+2
	LDA.w #$0000
	STA.w !BEAM_BUF
	LDX.w #!BEAM_BUF
	LDY.w #!BEAM_BUF+2
	LDA.w #510-1
	PHB
	MVN $32,$32
	PLB
	RTS

; ---------------------------------------------------------------------------
; Want group X (0 / 2): origin (A16 = x, Y16 = y set in bw_x/bw_y by the
; caller), heading in !bg_tmp, radius in !bg_tmp+2 (even, >= 1), laser flag
; in !bg_tmp+4, length (pixels) in !bg_tmp+6, palette word in !bg_tmp+8.
beam_want:
	LDA.w !bg_tmp
	AND.w #$000F
	ASL
	PHX
	TAX
	LDA.l orbit_fx_beam_heading,X
	PLX
	STA.w !bg_tmp+10
	; mirror flips and signs
	STZ.w !bw_flip,X
	STZ.w !bw_sx,X
	STZ.w !bw_sy,X
	BIT.w #$0100
	BEQ +
	DEC.w !bw_sx,X
	PHA
	LDA.w #$4000
	STA.w !bw_flip,X
	PLA
+	BIT.w #$0200
	BEQ +
	DEC.w !bw_sy,X
	PHA
	LDA.w !bw_flip,X
	ORA.w #$8000
	STA.w !bw_flip,X
	PLA
+	AND.w #$0007                   ; class
	STA.w !bg_tmp+12
	; key of chain 0
	ASL : ASL : ASL : ASL : ASL : ASL
	ORA.w !bg_tmp+2
	LDY.w !bg_tmp+4
	BEQ +
	ORA.w #!BK_LASER
+	STA.w !bw_key,X
	LDA.w !bg_tmp+8
	STA.w !bw_pal,X
	; chains each side: j while j * across - half <= R (at most 2)
	PHX
	LDA.w !bg_tmp+12
	JSR beam_class_offset
	TAY                            ; class row offset
	TYX
	LDA.l orbit_fx_beam_class+24,X ; across (x256)
	STA.w !bg_tmp+14
	LDA.l orbit_fx_beam_class+26,X ; half (x256)
	EOR.w #$FFFF : INC
	CLC : ADC.w !bg_tmp+14         ; across - half
	STA.w !bg_mask                 ; (scratch) 1 * across - half
	LDA.w !bg_tmp+2
	INC
	XBA : AND.w #$FF00             ; (R + 1) * 256
	STA.w !bg_mask+2
	LDA.w #0
	STA.w !bg_mask+4               ; J
	LDA.w !bg_mask
-	CMP.w !bg_mask+2               ; j * across - half < (R + 1) * 256 ?
	BPL +
	INC.w !bg_mask+4
	CLC : ADC.w !bg_tmp+14
	LDY.w !bg_mask+4
	CPY.w #2
	BCC -
+	PLX
	LDA.w !bg_mask+4
	STA.w !bw_j,X
	; cells along the axis: length / |P| + 1 (|P| = 32, 36, 45, 36, 32),
	; at most 12
	LDA.w !bg_tmp+6
	STA.w $4204
	PHX
	LDX.w !bg_tmp+12
	SEP #$20
	LDA.l .period,X
	STA.w $4206
	REP #$20
	PLX
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4214
	INC
	CMP.w #12
	BCC +
	LDA.w #12
+	STA.w !bw_len,X
	RTS
.period
	db 32, 36, 45, 36, 32

; A16 = class -> A16 = class * 28 (the class table's row).
beam_class_offset:
	ASL : ASL                      ; * 4
	STA.w !bg_ct
	ASL                            ; * 8
	CLC : ADC.w !bg_ct             ; * 12
	ASL                            ; * 24
	CLC : ADC.w !bg_ct             ; * 28
	RTS

beam_off:
	LDA.w #$FFFF
	STA.w !bw_key,X
	RTS

; ---------------------------------------------------------------------------
; Once per frame: continue the picture being made, or start the most
; needed one (chain 0 of Goku's wave first).
beam_update:
	LDA.w !bg_ready
	BEQ +
	RTS                            ; the NMI has not sent the last one yet
+	LDA.w !bg_on
	BEQ .pick
	JMP beam_rows
.pick
	LDX.w #$0000                   ; group
.group
	LDA.w !bw_key,X
	CMP.w #$FFFF
	BEQ .nextGroup
	LDY.w #$0000                   ; chain
.chain
	; slot = group/2*3 + chain
	TXA
	LSR
	STA.w !bg_tmp
	ASL
	CLC : ADC.w !bg_tmp
	STY.w !bg_tmp
	CLC : ADC.w !bg_tmp
	ASL
	STA.w !bg_tmp+2                ; slot * 2
	; key with this chain
	TYA
	XBA : ASL                      ; chain << 9
	ORA.w !bw_key,X
	PHX
	LDX.w !bg_tmp+2
	CMP.w !bs_have,X
	BEQ .have
	PLX
	JMP beam_start                 ; A = key, bg_tmp+2 = slot * 2
.have
	PLX
	INY
	TYA
	CMP.w !bw_j,X
	BEQ .chain
	BCC .chain
.nextGroup
	INX : INX
	CPX.w #$0004
	BCC .group
	RTS

; Start the picture of key A16 for slot bg_tmp+2 / 2.
beam_start:
	STA.w !bg_key
	LDA.w !bg_tmp+2
	LSR
	STA.w !bg_slot
	STZ.w !bg_row
	LDA.w #$0001
	STA.w !bg_on
	; class row
	LDA.w !bg_key
	LSR : LSR : LSR : LSR : LSR : LSR
	AND.w #$0007
	JSR beam_class_offset
	STA.w !bg_cls
	; thresholds (V units, x256): band: outer [-256R, 256(R+1)),
	; inner [256 iLo, 256 (iHi + 1)) with iLo = ((R+2)>>1) - R and
	; iHi = ((3R+3)>>1) - R - 1. Laser: plane 0 [-256, 256), plane 1 [0, 512).
	LDA.w !bg_key
	AND.w #!BK_LASER
	BEQ .band
	LDA.w #$0000 : STA.w !bg_t+0   ; plane 1 lo
	LDA.w #512 : STA.w !bg_t+2     ; plane 1 hi
	LDA.w #-256 : STA.w !bg_t+4    ; plane 0 lo
	LDA.w #256 : STA.w !bg_t+6     ; plane 0 hi
	BRA .v0
.band
	LDA.w !bg_key
	AND.w #$003F
	STA.w !bg_tmp                  ; R
	XBA
	EOR.w #$FFFF : INC
	STA.w !bg_t+0                  ; -256 R
	LDA.w !bg_tmp
	INC
	XBA
	STA.w !bg_t+2                  ; 256 (R + 1)
	LDA.w !bg_tmp
	INC : INC
	LSR
	SEC : SBC.w !bg_tmp
	XBA : AND.w #$FF00
	STA.w !bg_t+4                  ; 256 iLo
	LDA.w !bg_tmp
	ASL
	CLC : ADC.w !bg_tmp
	INC : INC : INC
	LSR
	SEC : SBC.w !bg_tmp            ; iHi + 1
	XBA : AND.w #$FF00
	STA.w !bg_t+6
.v0
	; V of the cell's top-left: V0 + chain * Vstep
	LDX.w !bg_cls
	LDA.l orbit_fx_beam_class+20,X ; V0
	STA.w !bg_vr
	LDA.w !bg_key
	XBA : LSR
	AND.w #$0003                   ; chain
	BEQ +
	TAY
-	LDA.w !bg_vr
	CLC : ADC.l orbit_fx_beam_class+22,X
	STA.w !bg_vr
	DEY
	BNE -
+	; classes 1-3: Q = floor((V - t) / vy), M = (V - t) mod vy per threshold
	LDA.l orbit_fx_beam_class+2,X  ; vy
	BEQ .done
	CMP.w #256
	BEQ .done
	STA.w !bg_tmp+4
	LDY.w #6
.thr
	LDA.w !bg_vr
	SEC : SBC.w !bg_t,Y
	JSR beam_floordiv              ; A = floor(A / vy), bg_tmp+6 = remainder
	STA.w !bg_q,Y
	LDA.w !bg_tmp+6
	STA.w !bg_m,Y
	DEY : DEY
	BPL .thr
.done
	RTS

; floor(A16 / bg_tmp+4) for signed A (|A| < 32768), divisor 1-255;
; remainder (0 .. divisor-1) in bg_tmp+6.
beam_floordiv:
	CMP.w #$0000
	BMI .neg
	STA.w $4204
	SEP #$20
	LDA.w !bg_tmp+4
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4216
	STA.w !bg_tmp+6
	LDA.w $4214
	RTS
.neg
	EOR.w #$FFFF : INC
	STA.w $4204
	SEP #$20
	LDA.w !bg_tmp+4
	STA.w $4206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.w $4216
	BEQ .exact
	; -(q + 1), remainder divisor - r
	EOR.w #$FFFF
	SEC : ADC.w !bg_tmp+4
	STA.w !bg_tmp+6
	LDA.w $4214
	INC
	EOR.w #$FFFF : INC
	RTS
.exact
	STZ.w !bg_tmp+6
	LDA.w $4214
	EOR.w #$FFFF : INC
	RTS

; ---------------------------------------------------------------------------
; Up to !BEAM_ROWS rows of the picture.
beam_rows:
	LDA.w #!BEAM_ROWS
	STA.w !bg_tmp+12
.row
	LDX.w !bg_cls
	LDA.l orbit_fx_beam_class+2,X  ; vy
	BNE .notFlat
	; class 0 (vy = 0): the whole row is in or out of each interval
	LDY.w #$0000
	LDA.w !bg_vr
	JSR beam_row_flat
	BRA .write
.notFlat
	CMP.w #256
	BNE .dda
	; class 4 (vx = 0): every row the same: x in [floor((V - hi)/256)+1,
	; floor((V - lo)/256)] for each interval
	JSR beam_row_vertical
	BRA .write
.dda
	JSR beam_row_dda
.write
	JSR beam_row_store
	; next row: V += vx; DDA steps
	LDX.w !bg_cls
	LDA.w !bg_vr
	CLC : ADC.l orbit_fx_beam_class+0,X
	STA.w !bg_vr
	LDA.l orbit_fx_beam_class+2,X
	BEQ .stepped
	CMP.w #256
	BEQ .stepped
	STA.w !bg_tmp+4                ; vy
	LDA.l orbit_fx_beam_class+4,X  ; qi
	STA.w !bg_tmp+8
	LDA.l orbit_fx_beam_class+6,X  ; rr
	STA.w !bg_tmp+10
	LDX.w #6
.step
	LDA.w !bg_q,X
	CLC : ADC.w !bg_tmp+8
	STA.w !bg_q,X
	LDA.w !bg_m,X
	CLC : ADC.w !bg_tmp+10
	CMP.w !bg_tmp+4
	BCC +
	SBC.w !bg_tmp+4
	INC.w !bg_q,X
+	STA.w !bg_m,X
	DEX : DEX
	BPL .step
.stepped
	INC.w !bg_row
	LDA.w !bg_row
	CMP.w #32
	BCS .complete
	DEC.w !bg_tmp+12
	BEQ +
	JSR orbit_late
	BCS +
	JMP .row
+	RTS
.complete
	STZ.w !bg_on
	LDA.w !bg_slot
	INC
	STA.w !bg_ready
	RTS

; Masks of a row whose pixels all share V (A16): bg_mask = plane 1 (4
; bytes), plane 0 (4 bytes).
beam_row_flat:
	STA.w !bg_tmp
	LDA.w #$0000
	LDY.w !bg_tmp
	CPY.w !bg_t+0
	BMI +
	CPY.w !bg_t+2
	BPL +
	LDA.w #$FFFF
+	STA.w !bg_mask+0
	STA.w !bg_mask+2
	LDA.w #$0000
	CPY.w !bg_t+4
	BMI +
	CPY.w !bg_t+6
	BPL +
	LDA.w #$FFFF
+	STA.w !bg_mask+4
	STA.w !bg_mask+6
	RTS

; Class 4: x in [floor((V - hi) / 256) + 1, floor((V - lo) / 256)].
beam_row_vertical:
	LDA.w !bg_vr
	SEC : SBC.w !bg_t+2
	JSR beam_asr8
	INC
	STA.w !bg_tmp+0                ; xa (plane 1)
	LDA.w !bg_vr
	SEC : SBC.w !bg_t+0
	JSR beam_asr8
	STA.w !bg_tmp+2                ; xb
	LDY.w #0
	JSR beam_mask
	LDA.w !bg_vr
	SEC : SBC.w !bg_t+6
	JSR beam_asr8
	INC
	STA.w !bg_tmp+0
	LDA.w !bg_vr
	SEC : SBC.w !bg_t+4
	JSR beam_asr8
	STA.w !bg_tmp+2
	LDY.w #4
	JMP beam_mask

beam_asr8:
	CMP.w #$0000
	BMI +
	XBA : AND.w #$00FF
	RTS
+	XBA : ORA.w #$FF00
	RTS

; Classes 1-3 from the DDA: x in [Q(hi) + 1, Q(lo)].
beam_row_dda:
	LDA.w !bg_q+2
	INC
	STA.w !bg_tmp+0
	LDA.w !bg_q+0
	STA.w !bg_tmp+2
	LDY.w #0
	JSR beam_mask
	LDA.w !bg_q+6
	INC
	STA.w !bg_tmp+0
	LDA.w !bg_q+4
	STA.w !bg_tmp+2
	LDY.w #4
	; fall through

; bg_mask+Y (4 bytes) = pixels xa (bg_tmp) .. xb (bg_tmp+2) of 0-31.
beam_mask:
	LDA.w !bg_tmp+0
	BPL +
	LDA.w #$0000
+	CMP.w #32
	BCS .empty
	STA.w !bg_tmp+0
	LDA.w !bg_tmp+2
	BMI .empty
	CMP.w #32
	BCC +
	LDA.w #31
+	CMP.w !bg_tmp+0
	BCC .empty
	ASL : ASL
	TAX
	LDA.l orbit_fx_mask_to,X
	STA.w !bg_mask,Y
	LDA.l orbit_fx_mask_to+2,X
	STA.w !bg_mask+2,Y
	LDA.w !bg_tmp+0
	ASL : ASL
	TAX
	LDA.l orbit_fx_mask_from,X
	AND.w !bg_mask,Y
	STA.w !bg_mask,Y
	LDA.l orbit_fx_mask_from+2,X
	AND.w !bg_mask+2,Y
	STA.w !bg_mask+2,Y
	RTS
.empty
	LDA.w #$0000
	STA.w !bg_mask,Y
	STA.w !bg_mask+2,Y
	RTS

; Row bg_row of the picture: tile (row >> 3) * 4 + t, line row & 7: plane 0
; byte at +0, plane 1 at +1 (planes 2-3 stay zero).
beam_row_store:
	LDA.w !bg_row
	AND.w #$0018                   ; (row >> 3) * 8
	ASL : ASL : ASL : ASL          ; * 128 (4 tiles of 32 bytes)
	STA.w !bg_tmp
	LDA.w !bg_row
	AND.w #$0007
	ASL
	CLC : ADC.w !bg_tmp
	CLC : ADC.w #!BEAM_BUF
	TAX
	SEP #$20
	LDA.w !bg_mask+4 : STA.w $0000,X
	LDA.w !bg_mask+0 : STA.w $0001,X
	LDA.w !bg_mask+5 : STA.w $0020,X
	LDA.w !bg_mask+1 : STA.w $0021,X
	LDA.w !bg_mask+6 : STA.w $0040,X
	LDA.w !bg_mask+2 : STA.w $0041,X
	LDA.w !bg_mask+7 : STA.w $0060,X
	LDA.w !bg_mask+3 : STA.w $0061,X
	REP #$20
	RTS


; ---------------------------------------------------------------------------
; Drawing. A band's cells sit at origin + A0 + i * P + j * S (mirrored by
; the beam's quadrant), whatever its radius: the radius only changes the
; pictures in VRAM. So each group keeps a cached run of OAM entries for its
; full length, cell index by cell index (all chains of cell 0, then of
; cell 1, ...), with the run length after each index: a frame copies the
; prefix for the beam's current length. The run is rebuilt only when the
; origin, heading, chain count, palette or the set of slots holding a
; picture changes. DB = $32, M16/X16; X = group (0 / 2).
beam_draw:
	LDA.w !bw_key,X
	CMP.w #$FFFF
	BNE +
	RTS
+	STX.w !bg_tmp+14
	JSR beam_signature
	BEQ +
	JSR beam_build_run
+	JMP beam_copy_run

; The group's signature into bc_sig (8 words); Z set when the cached run
; was built for it.
beam_signature:
	LDX.w !bg_tmp+14
	LDA.w !bw_key,X
	AND.w #$FFC0                   ; class, chain, laser: not the radius
	STA.w !bc_sig+0
	LDA.w !bw_j,X    : STA.w !bc_sig+2
	LDA.w !bw_x,X    : STA.w !bc_sig+4
	LDA.w !bw_y,X    : STA.w !bc_sig+6
	LDA.w !bw_flip,X : STA.w !bc_sig+8
	LDA.w !bw_pal,X  : STA.w !bc_sig+10
	; which of the group's slots hold a picture (any radius)
	TXA
	LSR
	STA.w !bc_tmp
	ASL
	CLC : ADC.w !bc_tmp
	ASL
	TAY
	STZ.w !bc_sig+12
	LDA.w !bs_have,Y
	CMP.w #$FFFF
	BEQ +
	LDA.w #1 : TSB.w !bc_sig+12
+	LDA.w !bs_have+2,Y
	CMP.w #$FFFF
	BEQ +
	LDA.w #2 : TSB.w !bc_sig+12
+	LDA.w !bs_have+4,Y
	CMP.w #$FFFF
	BEQ +
	LDA.w #4 : TSB.w !bc_sig+12
+	STZ.w !bc_sig+14
	; compare (group * 8 words)
	TXA
	ASL : ASL : ASL
	TAX
	LDY.w #$0000
-	LDA.w !bc_sig,Y
	CMP.w !BC_SIG,X
	BNE .differ
	INX : INX
	INY : INY
	CPY.w #16
	BCC -
	LDA.w #$0000
	RTS
.differ
	LDA.w #$0001
	RTS

; Build group bg_tmp+14's run into its cache, cell index-major, and keep
; the signature.
beam_build_run:
	LDX.w !bg_tmp+14
	LDA.w !bw_key,X
	LSR : LSR : LSR : LSR : LSR : LSR
	AND.w #$0007
	JSR beam_class_offset
	STA.w !d_t5                    ; class row
	; chains 0, -1, 1, -2, 2 (as far as J) that have a picture
	STZ.w !bp_n
	STZ.w !d_t4
	JSR beam_prep_chain
	LDX.w !bg_tmp+14
	LDA.w !bw_j,X
	BEQ .prepped
	LDA.w #$FFFF : STA.w !d_t4 : JSR beam_prep_chain
	LDA.w #$0001 : STA.w !d_t4 : JSR beam_prep_chain
	LDX.w !bg_tmp+14
	LDA.w !bw_j,X
	CMP.w #2
	BCC .prepped
	LDA.w #$FFFE : STA.w !d_t4 : JSR beam_prep_chain
	LDA.w #$0002 : STA.w !d_t4 : JSR beam_prep_chain
.prepped
	; the step along the axis, mirrored
	LDX.w !d_t5
	LDA.l orbit_fx_beam_class+12,X
	STA.w !bp_dx
	LDA.l orbit_fx_beam_class+14,X
	STA.w !bp_dy
	LDX.w !bg_tmp+14
	LDA.w !bw_sx,X
	BEQ +
	LDA.w !bp_dx
	EOR.w #$FFFF : INC
	STA.w !bp_dx
+	LDA.w !bw_sy,X
	BEQ +
	LDA.w !bp_dy
	EOR.w #$FFFF : INC
	STA.w !bp_dy
+	; write pointer: the group's cache
	TXA
	XBA : LSR                      ; group * 128 = 256 bytes per group
	CLC : ADC.w #!BC_OAM
	STA.w !bp_base
	STA.w !bp_ptr
	TXA
	ASL : ASL : ASL                ; 16 high-table bytes per group
	CLC : ADC.w #!BC_HI
	STA.w !bp_hib
	STZ.w !bg_mask+4               ; gathered high bits
	STZ.w !bg_mask+6               ; entries in the group of four
	STZ.w !bp_i
.index
	LDY.w #$0000                   ; chain (x2)
.chain
	CPY.w !bp_n
	BCC +
	JMP .indexDone
+	; visible: x in [-31, 255], y in [-31, 223]
	LDA.w !bp_x,Y
	CLC : ADC.w #31
	CMP.w #287
	BCS .nextChain
	LDA.w !bp_y,Y
	CLC : ADC.w #31
	CMP.w #255
	BCS .nextChain
	LDX.w !bp_ptr
	SEP #$20
	LDA.w !bp_x,Y : STA.w $0000,X
	LDA.w !bp_y,Y : STA.w $0001,X
	REP #$20
	LDA.w !bp_tile,Y : STA.w $0002,X
	TXA
	CLC : ADC.w #4
	STA.w !bp_ptr
	; bits: large, x bit 8, at the entry's pair in the group of four
	LDA.w !bg_mask+6
	ASL
	STA.w !bc_tmp
	LDA.w !bp_x+1,Y
	AND.w #$0001
	ORA.w !bc_tmp
	TAX
	LDA.l beam_hi_bits,X
	AND.w #$00FF
	TSB.w !bg_mask+4
	INC.w !bg_mask+6
	LDA.w !bg_mask+6
	CMP.w #4
	BCC .nextChain
	JSR beam_hi_store
.nextChain
	; this chain's next cell
	LDA.w !bp_x,Y
	CLC : ADC.w !bp_dx
	STA.w !bp_x,Y
	LDA.w !bp_y,Y
	CLC : ADC.w !bp_dy
	STA.w !bp_y,Y
	INY : INY
	JMP .chain
.indexDone
	; run length after cell index i (group 1's 12 words follow group 0's)
	LDA.w !bp_i
	ASL
	LDX.w !bg_tmp+14
	BEQ +
	CLC : ADC.w #24
+	TAX
	LDA.w !bp_ptr
	SEC : SBC.w !bp_base
	STA.w !BC_BND,X
	INC.w !bp_i
	LDA.w !bp_i
	CMP.w #12
	BCS +
	JMP .index
+	; the last partial group of high bits
	LDA.w !bg_mask+6
	BEQ +
	JSR beam_hi_store
+	LDX.w !bg_tmp+14
	LDA.w !bp_ptr
	SEC : SBC.w !bp_base
	STA.w !BC_BYTES,X
	; the signature
	TXA
	ASL : ASL : ASL
	TAX
	LDY.w #$0000
-	LDA.w !bc_sig,Y
	STA.w !BC_SIG,X
	INX : INX
	INY : INY
	CPY.w #16
	BCC -
	RTS

; (entries in the group * 2 + x bit 8) -> the high-table bits: large, x bit 8.
beam_hi_bits:
	db $02,$03, $08,$0C, $20,$30, $80,$C0

; The gathered high-table byte of the group of four that ends at bp_ptr.
beam_hi_store:
	LDA.w !bp_ptr
	DEC
	SEC : SBC.w !bp_base
	LSR : LSR : LSR : LSR
	CLC : ADC.w !bp_hib
	TAX
	SEP #$20
	LDA.w !bg_mask+4
	STA.w $0000,X
	REP #$20
	STZ.w !bg_mask+4
	STZ.w !bg_mask+6
	RTS

; Chain d_t4 (signed) of group bg_tmp+14 (class row d_t5): its tile word
; and the top-left of its cell 0 into the bp arrays, if its slot holds a
; picture.
beam_prep_chain:
	LDX.w !bg_tmp+14
	LDA.w !d_t4
	JSR orbit_abs
	STA.w !d_t0
	TXA
	LSR
	STA.w !d_t1
	ASL
	CLC : ADC.w !d_t1
	CLC : ADC.w !d_t0
	ASL
	TAY                            ; slot * 2
	LDA.w !bs_have,Y
	CMP.w #$FFFF
	BNE +
	RTS
+	TYX
	LDA.l beam_slot_tile,X
	STA.w !d_t1
	LDX.w !bg_tmp+14
	LDA.w !bw_flip,X
	LDY.w !d_t4
	BPL +
	EOR.w #$C000                   ; chain -j: chain j turned half round
+	ORA.w !bw_pal,X
	ORA.w !d_t1
	LDY.w !bp_n
	STA.w !bp_tile,Y
	; canonical top-left of cell 0: A0 + j * S
	LDX.w !d_t5
	LDA.l orbit_fx_beam_class+8,X
	STA.w !d_t2
	LDA.l orbit_fx_beam_class+10,X
	STA.w !d_t3
	LDY.w !d_t4
	BEQ .placed
	BMI .neg
-	LDA.w !d_t2 : CLC : ADC.l orbit_fx_beam_class+16,X : STA.w !d_t2
	LDA.w !d_t3 : CLC : ADC.l orbit_fx_beam_class+18,X : STA.w !d_t3
	DEY
	BNE -
	BRA .placed
.neg
-	LDA.w !d_t2 : SEC : SBC.l orbit_fx_beam_class+16,X : STA.w !d_t2
	LDA.w !d_t3 : SEC : SBC.l orbit_fx_beam_class+18,X : STA.w !d_t3
	INY
	BNE -
.placed
	; mirrored axes: the cell's far edge becomes its near one
	LDX.w !bg_tmp+14
	LDY.w !bp_n
	LDA.w !bw_sx,X
	BEQ .xPlain
	LDA.w !bw_x,X
	SEC : SBC.w !d_t2
	SEC : SBC.w #31
	BRA +
.xPlain
	LDA.w !bw_x,X
	CLC : ADC.w !d_t2
+	STA.w !bp_x,Y
	LDA.w !bw_sy,X
	BEQ .yPlain
	LDA.w !bw_y,X
	SEC : SBC.w !d_t3
	SEC : SBC.w #31
	BRA +
.yPlain
	LDA.w !bw_y,X
	CLC : ADC.w !d_t3
+	STA.w !bp_y,Y
	INC.w !bp_n
	INC.w !bp_n
	RTS

; Copy the prefix of group bg_tmp+14's cached run for its current length
; to the aligned !o_slot.
beam_copy_run:
	JSR beam_align
	LDX.w !bg_tmp+14
	LDA.w !BC_BYTES,X
	BNE +
	RTS
+	; prefix: the run length after cell index len - 1
	LDA.w !bw_len,X
	BNE +
	RTS
+	DEC
	CMP.w #12
	BCC +
	LDA.w #11
+	ASL
	CPX.w #$0000
	BEQ +
	CLC : ADC.w #24
+	TAX
	LDA.w !BC_BND,X
	BNE +
	RTS
+	STA.w !bc_tmp                  ; bytes
	; it must fit in OAM
	LDA.w !o_slot
	CLC : ADC.w !bc_tmp
	CMP.w #$0201
	BCC +
	LDA.w #$0200
	SEC : SBC.w !o_slot
	STA.w !bc_tmp
	BNE +
	RTS
+	; entries
	LDA.w !bg_tmp+14
	XBA : LSR
	CLC : ADC.w #!BC_OAM
	TAX
	LDA.w !o_slot
	CLC : ADC.w #$0800
	TAY
	LDA.w !bc_tmp
	DEC
	PHB
	MVN $32,$32
	PLB
	; high-table bytes: whole bytes, the last one masked to its entries
	LDA.w !bc_tmp
	CLC : ADC.w #15
	LSR : LSR : LSR : LSR          ; bytes
	DEC
	PHA
	LDA.w !bg_tmp+14
	ASL : ASL : ASL
	CLC : ADC.w #!BC_HI
	TAX
	LDA.w !o_slot
	LSR : LSR : LSR : LSR
	CLC : ADC.w #$0A00
	TAY
	PLA
	PHB
	MVN $32,$32
	PLB
	LDA.w !bc_tmp
	AND.w #$000F
	BEQ +
	LSR : LSR                      ; entries in the last byte (1-3)
	TAX
	LDA.w !o_slot
	CLC : ADC.w !bc_tmp
	DEC
	LSR : LSR : LSR : LSR
	TAY
	SEP #$20
	LDA.w $0A00,Y
	AND.l beam_keep,X
	STA.w $0A00,Y
	REP #$20
+	LDA.w !o_slot
	CLC : ADC.w !bc_tmp
	STA.w !o_slot
	RTS
beam_keep:
	db $00,$03,$0F,$3F

; Pad !o_slot to a high-table byte (4 slots) with hidden entries.
beam_align:
	LDX.w !o_slot
-	TXA
	AND.w #$000F
	BEQ +
	CPX.w #$0200
	BCS +
	LDA.w #$E0FF
	STA.w $0800,X
	INX : INX : INX : INX
	BRA -
+	STX.w !o_slot
	RTS
