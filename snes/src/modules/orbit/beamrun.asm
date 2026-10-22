; The beam runs' chains as last prepared (beam.asm beam_build_run), in the
; orbit's third code area: a run built again when only its origin, its
; length or the band layers' line moved takes them from here instead of
; preparing each chain afresh (beam_prep_chain: its slot's picture, its tile
; word, its cell 0's place: 1.7 lines a chain). Their tile words and their
; cells' places relative to the origin depend only on the key, the chains,
; the flips, the palette and the slots with a picture: those words of this
; frame's signature (bc_sig) and the cached run's (BC_SIG) the same, the
; kept ones are this frame's too.
; DB = $32, M16/X16; X16 = group (0 / 2) on entry and on return.

beam_prep_again_far:
	JSR beam_prep_again : RTL
beam_run_far:
	JSR beam_run : RTL
beam_prep_keep_far:
	JSR beam_prep_keep : RTL

; Carry set when group X's chains as kept (BC_PREP) serve this frame's
; signature: bp_n, bp_tile, bp_x, bp_y (cell 0's top left, from this
; frame's origin) and the step bp_dx, bp_dy set as beam_prep_chain and the
; step would set them.
beam_prep_again:
if defined("BEAM_PREP_CHECK")
	STZ.w !bk_reused
	LDA.w !bk_force                ; (the check's second build: afresh)
	BEQ +
	JMP .no
+
endif
	TXA
	ASL : ASL : ASL : ASL : ASL
	TAY                            ; (its kept block: 64 bytes a group)
	LDA.w !BC_PREP+0,Y
	BEQ .no
	TXA
	ASL : ASL : ASL
	TAX                            ; (the cached signature: 16 bytes a group)
	LDA.w !bc_sig+0 : CMP.w !BC_SIG+0,X : BNE .no
	LDA.w !bc_sig+2 : CMP.w !BC_SIG+2,X : BNE .no
	LDA.w !bc_sig+8 : CMP.w !BC_SIG+8,X : BNE .no
	LDA.w !bc_sig+10 : CMP.w !BC_SIG+10,X : BNE .no
	LDA.w !bc_sig+12 : CMP.w !BC_SIG+12,X : BNE .no
	LDA.w !BC_PREP+2,Y : STA.w !bp_n
	LDA.w !BC_PREP+4,Y : STA.w !bp_dx
	LDA.w !BC_PREP+6,Y : STA.w !bp_dy
	LDX.w !bg_tmp+14
	LDA.w !bw_x,X : STA.w !d_t2
	LDA.w !bw_y,X : STA.w !d_t3
	LDX.w #0                       ; (chain * 2)
-	CPX.w !bp_n
	BCS +
	LDA.w !BC_PREP+8,Y : STA.w !bp_tile,X
	LDA.w !BC_PREP+18,Y : CLC : ADC.w !d_t2 : STA.w !bp_x,X
	LDA.w !BC_PREP+28,Y : CLC : ADC.w !d_t3 : STA.w !bp_y,X
	INX : INX
	INY : INY
	BRA -
+
if defined("BEAM_PREP_CHECK")
	INC.w !bk_reused
endif
	LDX.w !bg_tmp+14
	SEC
	RTS
.no
	LDX.w !bg_tmp+14
	CLC
	RTS

; Group X's chains just prepared (and the step) kept for its next build:
; the tile words, cell 0's top left less the origin.
beam_prep_keep:
	TXA
	ASL : ASL : ASL : ASL : ASL
	TAY
	LDA.w #1 : STA.w !BC_PREP+0,Y
	LDA.w !bp_n : STA.w !BC_PREP+2,Y
	LDA.w !bp_dx : STA.w !BC_PREP+4,Y
	LDA.w !bp_dy : STA.w !BC_PREP+6,Y
	LDA.w !bw_x,X : STA.w !d_t2
	LDA.w !bw_y,X : STA.w !d_t3
	LDX.w #0
-	CPX.w !bp_n
	BCS +
	LDA.w !bp_tile,X : STA.w !BC_PREP+8,Y
	LDA.w !bp_x,X : SEC : SBC.w !d_t2 : STA.w !BC_PREP+18,Y
	LDA.w !bp_y,X : SEC : SBC.w !d_t3 : STA.w !BC_PREP+28,Y
	INX : INX
	INY : INY
	BRA -
+	LDX.w !bg_tmp+14
	RTS

; ---------------------------------------------------------------------------
; Group X16's run into its cache (beam.asm beam_build_run, its chains
; prepared: bp_n, bp_tile, bp_x and bp_y their cell 0's top left, the step
; bp_dx, bp_dy), cell index-major: each chain's cell at its cell 0's place
; plus the index times the step, left out off the screen (x + 31 past 286,
; y + 31 past 254) or wholly inside the band layers' lines (y + 31 above
; bw_ymin); the high-table bits gathered four entries a byte, each entry's
; shifted in from the top (x bit 8, then large); the run's length after
; each index (12, below a band layer its length); its bytes and this
; frame's signature. About half the old loop's cost a cell: the chains'
; places are not stepped cell by cell, the bits need no table or count, the
; write pointer stays in X. Keeps X.
beam_run:
	TXA
	XBA : LSR                      ; (256 bytes a group)
	CLC : ADC.w #!BC_OAM
	STA.w !bp_base
	TXA
	ASL : ASL : ASL                ; (16 high-table bytes a group)
	CLC : ADC.w #!BC_HI
	STA.w !bp_hib
	TXA
	BEQ +
	LDA.w #24                      ; (12 lengths a group)
+	CLC : ADC.w #!BC_BND
	STA.w !bp_ptr                  ; (the next length's address)
	LDA.w !bw_ymin,X
	STA.w !bc_tmp                  ; (y + 31 above it: inside the layers' lines)
	LDA.w #12                      ; indices: 12, below a band layer its length
	LDY.w !bw_ymin,X
	BEQ +
	LDA.w !bw_len,X
	CMP.w #12
	BCC +
	LDA.w #12
+	STA.w !bg_ct
	LDA.w #31                      ; (the index's offsets, + 31)
	STA.w !bg_mask+0
	STA.w !bg_mask+2
	STZ.w !bg_mask+4               ; (the high bits gathered)
	STZ.w !bp_i
	LDX.w !bp_base                 ; (X: the write pointer)
.index
	LDY.w #$0000                   ; (chain * 2)
.chain
	CPY.w !bp_n
	BCS .indexDone
	LDA.w !bp_x,Y
	CLC : ADC.w !bg_mask+0         ; x + 31
	CMP.w #287
	BCS .next
	STA.w !bg_mask+6
	LDA.w !bp_y,Y
	CLC : ADC.w !bg_mask+2         ; y + 31
	CMP.w #255
	BCS .next
	CMP.w !bc_tmp
	BCC .next
	SBC.w #31                      ; y (carry set)
	SEP #$20
	STA.w $0001,X
	REP #$20
	LDA.w !bg_mask+6
	SEC : SBC.w #31                ; x
	SEP #$20
	STA.w $0000,X
	XBA                            ; (x's high byte: $FF below 0, x bit 8)
	LSR
	ROR.w !bg_mask+4               ; (x bit 8, then large, in from the top)
	SEC
	ROR.w !bg_mask+4
	REP #$20
	LDA.w !bp_tile,Y
	STA.w $0002,X
	TXA
	CLC : ADC.w #4
	TAX
	AND.w #$000C
	BNE .next
	PHX                            ; (four entries: their byte)
	LDX.w !bp_hib
	SEP #$20
	LDA.w !bg_mask+4
	STA.w $0000,X
	REP #$20
	INX
	STX.w !bp_hib
	PLX
.next
	INY : INY
	BRA .chain
.indexDone
	TXA                            ; the run's length after this index
	SEC : SBC.w !bp_base
	PHX
	LDX.w !bp_ptr
	STA.w $0000,X
	INX : INX
	STX.w !bp_ptr
	PLX
	LDA.w !bg_mask+0 : CLC : ADC.w !bp_dx : STA.w !bg_mask+0
	LDA.w !bg_mask+2 : CLC : ADC.w !bp_dy : STA.w !bg_mask+2
	INC.w !bp_i
	LDA.w !bp_i
	CMP.w !bg_ct
	BCS +
	JMP .index
+	TXA                            ; the last partial group of high bits, its
	SEC : SBC.w !bp_base           ; entries down to the byte's low pairs
	STA.w !bg_mask+6               ; (the run's bytes)
	AND.w #$000C
	BEQ .bytes
	LSR : LSR
	TAY                            ; (its entries: 1-3)
	SEP #$20
	LDA.w !bg_mask+4
-	LSR : LSR
	INY
	CPY.w #4
	BCC -
	LDX.w !bp_hib
	STA.w $0000,X
	REP #$20
.bytes
	LDX.w !bg_tmp+14               ; its bytes and the signature
	LDA.w !bg_mask+6
	STA.w !BC_BYTES,X
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
	LDX.w !bg_tmp+14
	RTS

if defined("BEAM_RUN_CHECK")
; The check build (-DBEAM_RUN_CHECK): each run made by beam_run is made
; again by the old loop (beam.asm) and the two compared (their bytes,
; lengths, entries and high-table bytes): rb_checks counts them, rb_diff
; those that differ.
beam_run_mid_far:
	JSR beam_run_sums
	STA.w !rb_sum
	STY.w !rb_xor
	LDX.w !bg_tmp+14
	RTL
beam_run_end_far:
	INC.w !rb_checks
	JSR beam_run_sums
	CMP.w !rb_sum
	BNE +
	CPY.w !rb_xor
	BEQ ++
+	INC.w !rb_diff
++	LDX.w !bg_tmp+14
	RTL
endif

if defined("BEAM_PREP_CHECK")
; The check build (-DBEAM_PREP_CHECK): a run built from the kept chains is
; built again from chains prepared afresh, and the two runs compared (their
; bytes, lengths per cell index, entries and high-table bytes): bk_checks
; counts the runs compared, bk_diff those that differ.
beam_check_mid_far:
	JSR beam_check_mid : RTL
beam_check_end_far:
	JSR beam_check_end : RTL
; Carry set when the run just built took the kept chains: its sums kept,
; the next build forced afresh.
beam_check_mid:
	LDA.w !bk_reused
	BNE +
	CLC
	RTS
+	JSR beam_run_sums
	STA.w !bk_sum
	STY.w !bk_xor
	LDA.w #1
	STA.w !bk_force
	LDX.w !bg_tmp+14
	SEC
	RTS
beam_check_end:
	STZ.w !bk_force
	INC.w !bk_checks
	JSR beam_run_sums
	CMP.w !bk_sum
	BNE +
	CPY.w !bk_xor
	BEQ ++
+	INC.w !bk_diff
++	LDX.w !bg_tmp+14
	RTS
endif
if defined("BEAM_PREP_CHECK") || defined("BEAM_RUN_CHECK")
; A16 = the sum, Y16 = the exclusive or of group bg_tmp+14's run: its
; bytes, its 12 lengths, its entries' words, its 16 high-table bytes.
beam_run_sums:
	LDX.w !bg_tmp+14
	LDA.w !BC_BYTES,X
	STA.w !bk_s
	STA.w !bk_x
	TXA
	BEQ +
	LDA.w #24
+	TAX                            ; (the lengths: 12 words a group)
	LDY.w #12
-	LDA.w !BC_BND,X
	JSR .add
	INX : INX
	DEY
	BNE -
	LDA.w !bg_tmp+14
	XBA : LSR
	TAX                            ; (the entries: 256 bytes a group)
	LDA.w !BC_BYTES
	LDY.w !bg_tmp+14
	BEQ +
	LDA.w !BC_BYTES+2
+	LSR
	TAY                            ; (words)
	BEQ +
-	LDA.w !BC_OAM,X
	JSR .add
	INX : INX
	DEY
	BNE -
+	LDA.w !bg_tmp+14
	ASL : ASL : ASL
	TAX                            ; (the high-table bytes: 16 a group)
	LDY.w #8
-	LDA.w !BC_HI,X
	JSR .add
	INX : INX
	DEY
	BNE -
	LDA.w !bk_s
	LDY.w !bk_x
	RTS
.add
	PHA
	CLC : ADC.w !bk_s
	STA.w !bk_s
	LDA.w !bk_x                    ; (rotated: the words' order counts)
	ASL
	ADC.w #0
	STA.w !bk_x
	PLA
	EOR.w !bk_x
	STA.w !bk_x
	RTS
endif
