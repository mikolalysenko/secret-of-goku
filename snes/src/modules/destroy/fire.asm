; The wreck's fires (engine/sandship-wreck.js prepareSites, tick, draw and
; sandship.js crashTick), drawn by the effects library (fx) with the
; cartridge's own Exploder and Fireball cells.
;
; Sites: per wrecked room load, spread(floorSpots(map, 24, 40), 10 in the big
; rooms else 7, 52 px) over the browser's hash order (generator tables), and
; five fires on the breach's rim when it is in this room. Each site burns:
; Exploder frames 3/4 (4/5 for the larger ones, 4 px lower) swelling every 7
; frames, a Fireball ember rising 0.6 px a frame through a 24-frame cycle,
; the smallest sites two embers. Every 150 frames (at 75) a site explodes:
; five Exploder bursts on a golden-angle spiral, 3 frames apart, with the
; Fortress-break sound and a quake; the crash adds one such blast around Goku
; every 10 frames.
;
; Deviations: fx keeps at most 8 continuous draws a frame for every client,
; so the fires on screen share !SS_FIRE_DRAWS of them, rotating a site each
; frame when there are more (sites farther down the list flicker); no smoke
; columns; bursts sit at the spiral's 6-frame spread instead of drifting;
; Exploder cells are not mirrored; the exploding site follows a fixed
; pseudo-random order instead of the browser's hash.

!SS_FIRE_DRAWS = 6      ; fx draw entries the fires may take per frame

if defined("FX_EXPLODE")
	incsrc "audio/ids.asm"

; ---------------------------------------------------------------------------
; Field side (ss_visuals, inside the arc's window), M16/X16, DB = $7E.
ss_fires:
	LDA.l !ss_flags : AND.w #!SSF_WRECK : BNE +
	RTS
+	; fx colours its own palettes after the CGRAM upload: no fires over a
	; white screen (the browser whitens them with everything else)
	LDA.l !ss_flash : CMP.w #128 : BCC +
	RTS
+	LDA.w $00DC : JSR ss_ship_map : BCS +
	RTS
+	JSR ss_fire_sites : BCS +
	RTS
+	JSR ss_fire_clock
	JSR ss_fire_draw
	JSR ss_fire_blast
	JMP ss_blasts_tick

; This load's sites (once the room's collision is under Goku's feet).
; Carry set when they are ready.
ss_fire_sites:
	LDA.l !ssw_site_map : CMP.w $00DC : BNE .make
	LDA.l !ssw_site_load : CMP.l !ssw_loads : BNE .make
	LDA.l !ssw_site_n : CMP.w #$FFFF : BEQ .make
	SEC
	RTS
.make
	; the field must be up with this room's floor under Goku
	SEP #$20
	LDA.w $00E6 : BMI .not8
	REP #$20
	LDA.w $E004 : STA.l !ssw_tmp+2
	LDA.w $E002 : JSR ss_floor_px : BCS +
.not
	CLC
	RTS
.not8
	REP #$20
	BRA .not
+	LDA.w $00DC : STA.l !ssw_site_map
	LDA.l !ssw_loads : STA.l !ssw_site_load
	LDA.w #0 : STA.l !ssw_site_n : STA.l !ssw_site_rr
	LDA.w #$FFFF : STA.l !ssw_blast_a : STA.l !ssw_blast_b
	JSR ss_ship_entry : TXA : STA.l !ssw_tmp+14
	TAX
	LDA.l ss_ship_dir+12,X : STA.l !ssw_tmp+12   ; sites wanted
	LDA.l ss_ship_dir+10,X : STA.l !sp_left
	LDA.l ss_ship_dir+8,X : STA.l !sp_k
	; spread(floorSpots(map, 24, 40), n, 52)
.spot
	LDA.l !ssw_site_n : CMP.l !ssw_tmp+12 : BCC +
	JMP .rim
+	LDA.l !sp_left : BNE +
	JMP .rim
+	DEC : STA.l !sp_left
	LDA.l !sp_k : TAX
	INC : INC : STA.l !sp_k
	LDA.l !DATA_DESTROY,X : PHA
	AND.w #$00FF : JSR .cell24 : STA.l !sp_x
	PLA : XBA : AND.w #$00FF : JSR .cell24 : STA.l !sp_y
	STA.l !ssw_tmp+2
	LDA.l !sp_x : JSR ss_floor_px : BCS +
	JMP .spot
+	; 40 px from Goku
	LDA.l !sp_x : SEC : SBC.w $E002 : STA.l !ssw_tmp+4
	LDA.l !sp_y : SEC : SBC.w $E004 : STA.l !ssw_tmp+6
	LDA.w #1600 : JSR ss_far_enough : BCS +
	JMP .spot
+	; 52 px from every site taken
	LDX.w #0
-	TXA : CMP.l !ssw_site_n : BCS .take
	ASL : TAX
	LDA.l !sp_x : SEC : SBC.l !ssw_site_x,X : STA.l !ssw_tmp+4
	LDA.l !sp_y : SEC : SBC.l !ssw_site_y,X : CLC : ADC.w #4 : STA.l !ssw_tmp+6
	TXA : LSR : TAX
	PHX
	LDA.w #2704 : JSR ss_far_enough
	PLX
	BCS +
	JMP .spot
+	INX
	BRA -
.take
	; the site burns 4 px above the spot; seed i*7+3
	LDA.l !ssw_site_n : PHA
	ASL : TAX
	LDA.l !sp_x : STA.l !ssw_site_x,X
	LDA.l !sp_y : SEC : SBC.w #4 : STA.l !ssw_site_y,X
	LDA $01,S : ASL : ASL : ASL : SEC : SBC $01,S : CLC : ADC.w #3   ; i*7+3
	PLX
	JSR ss_fire_params
	LDA.l !ssw_site_n : INC : STA.l !ssw_site_n
	JMP .spot
.rim
	LDA.l !ssw_site_n : STA.l !ssw_site_nr
	; the breach's rim (seed 40+i*5, the larger fire)
	LDA.l !ss_bmap : CMP.w $00DC : BEQ +
	JMP .done
+
	LDA.l !ss_bx : JSR ss_phase4 : STA.l !ssw_tmp+8
	LDA.l !ss_by : JSR ss_phase4 : ASL : ASL : ORA.l !ssw_tmp+8
	STA.l !ssw_tmp+8 : ASL : ASL : CLC : ADC.l !ssw_tmp+8 : ASL : STA.l !ssw_tmp+8   ; variant*10
	LDY.w #0
.rim_loop
	LDA.l !ssw_site_n : CMP.w #15 : BCS .done
	ASL : TAX
	PHX
	LDA.l !ssw_tmp+8 : TAX
	LDA.l ss_breach_rims,X : AND.w #$00FF : EOR.w #$0080 : SEC : SBC.w #$0080
	CLC : ADC.l !ss_bx : STA.l !ssw_tmp+4
	LDA.l ss_breach_rims+1,X : AND.w #$00FF : EOR.w #$0080 : SEC : SBC.w #$0080
	CLC : ADC.l !ss_by : STA.l !ssw_tmp+6
	INX : INX : TXA : STA.l !ssw_tmp+8
	PLX
	LDA.l !ssw_tmp+4 : STA.l !ssw_site_x,X
	LDA.l !ssw_tmp+6 : STA.l !ssw_site_y,X
	TXA : LSR : TAX
	TYA : ASL : ASL : CLC : ADC.w #40 : STA.l !ssw_tmp+4   ; 40 + i*5
	TYA : CLC : ADC.l !ssw_tmp+4
	ORA.w #$8000                                          ; rim
	JSR ss_fire_params
	LDA.l !ssw_site_n : INC : STA.l !ssw_site_n
	INY : CPY.w #5 : BCC .rim_loop
.done
	SEC
	RTS
; A = cell index -> its centre on the 24 px grid (i*24 + 12)
.cell24
	ASL : ASL : ASL : PHA
	ASL : CLC : ADC $01,S : CLC : ADC.w #12
	PLX
	RTS

; A = seed (bit 15: rim), X = site: the per-site animation constants
; (!ssw_site_p + 4X): q7 = seed*5 / 7, r7 | s4 << 4 | size << 6,
; m24 | s3 << 5, s5 (the browser's seed arithmetic precomputed).
ss_fire_params:
	PHA
	TXA : ASL : ASL : TAX
	LDA $01,S : AND.w #$7FFF : STA.l !ssw_tmp+4          ; seed
	ASL : ASL : CLC : ADC.l !ssw_tmp+4 : STA.l !ssw_tmp+6   ; seed*5
	LDY.w #7 : JSR ss_divmod : STA.l !ssw_tmp+10       ; r7, Y = q7
	TYA : SEP #$20 : STA.l !ssw_site_p,X : REP #$20
	LDA.l !ssw_tmp+4 : LDY.w #4 : JSR ss_divmod : ASL : ASL : ASL : ASL : ORA.l !ssw_tmp+10 : STA.l !ssw_tmp+10   ; s4
	; size: rim 1, else seed % 3
	LDA $01,S : BPL +
	LDA.w #1 : BRA ++
+	LDA.l !ssw_tmp+4 : LDY.w #3 : JSR ss_divmod
++	XBA : LSR : LSR : ORA.l !ssw_tmp+10               ; size << 6
	SEP #$20 : STA.l !ssw_site_p+1,X : REP #$20
	LDA.l !ssw_tmp+6 : LDY.w #24 : JSR ss_divmod : STA.l !ssw_tmp+10   ; m24
	LDA.l !ssw_tmp+4 : LDY.w #3 : JSR ss_divmod : ASL : ASL : ASL : ASL : ASL : ORA.l !ssw_tmp+10
	SEP #$20 : STA.l !ssw_site_p+2,X : REP #$20
	LDA.l !ssw_tmp+4 : LDY.w #5 : JSR ss_divmod
	SEP #$20 : STA.l !ssw_site_p+3,X : REP #$20
	PLA
	RTS
; A / Y for small quotients: A = remainder, Y = quotient (core scratch).
ss_divmod:
	STY.w !cs+$0
	LDY.w #0
-	CMP.w !cs+$0 : BCC +
	SEC : SBC.w !cs+$0
	INY
	BRA -
+	RTS

; The fires' clock from the wreck's age: t / 7 and t % 7, (t / 5) % 3, t % 24.
ss_fire_clock:
	LDA.l !ss_wage : LDX.w #7 : JSR dst_div16 : STA.l !ssw_fire_t7
	ASL : ASL : ASL : SEC : SBC.l !ssw_fire_t7              ; q * 7
	EOR.w #$FFFF : SEC : ADC.l !ss_wage : STA.l !ssw_fire_r7
	LDA.l !ss_wage : LDX.w #5 : JSR dst_div16 : STA.l !ssw_tmp+4   ; t / 5
	LDX.w #3 : JSR dst_div16 : STA.l !ssw_tmp+6
	ASL : CLC : ADC.l !ssw_tmp+6                          ; q * 3
	EOR.w #$FFFF : SEC : ADC.l !ssw_tmp+4 : STA.l !ssw_fire_e3
	LDA.l !ss_wage : LDX.w #24 : JSR dst_div16 : STA.l !ssw_tmp+4
	ASL : CLC : ADC.l !ssw_tmp+4 : ASL : ASL : ASL         ; q * 24
	EOR.w #$FFFF : SEC : ADC.l !ss_wage : STA.l !ssw_fire_m24
	RTS

; Draw the sites on screen, a rotating start so every site gets its turn.
ss_fire_draw:
	LDA.l !ssw_site_n : BNE +
	RTS
+	LDA.w #!SS_FIRE_DRAWS : STA.l !ssw_fire_left
	; the camera of fx (actor 0)
	LDA.w $E002 : SEC : SBC.w $E020 : STA.l !ssw_fire_cx
	LDA.w $E004 : SEC : SBC.w $E022 : STA.l !ssw_fire_cy
	; each site's flame (the rim's first, the others from a rotating start),
	; then the embers with the entries left
	LDA.w #0 : STA.l !ssw_fire_pass
-	LDA.w #0 : STA.l !ssw_fire_cnt
.site
	LDA.l !ssw_fire_left : BEQ .pass_done
	LDA.l !ssw_fire_cnt : CMP.l !ssw_site_n : BCS .pass_done
	JSR ss_fire_order : STA.l !ssw_fire_k
	ASL : TAX
	; on screen (with the cells' reach)?
	LDA.l !ssw_site_x,X : SEC : SBC.l !ssw_fire_cx : CLC : ADC.w #24
	CMP.w #256+48 : BCS .skip
	LDA.l !ssw_site_y,X : SEC : SBC.l !ssw_fire_cy : CLC : ADC.w #32
	CMP.w #224+48 : BCS .skip
	TXA : ASL : TAX                                       ; params at 4k
	LDA.l !ssw_fire_pass : BNE +
	JSR ss_fire_main
	BRA .skip
+	JSR ss_fire_extra
.skip
	LDA.l !ssw_fire_cnt : INC : STA.l !ssw_fire_cnt
	BRA .site
.pass_done
	LDA.l !ssw_fire_pass : BNE +
	INC : STA.l !ssw_fire_pass
	LDA.l !ssw_fire_left : BNE -
+	; the next frame starts the others one site later
	LDA.l !ssw_site_nr : BEQ +
	LDA.l !ssw_site_rr : INC
	CMP.l !ssw_site_nr : BCC ++
	LDA.w #0
++	STA.l !ssw_site_rr
+	RTS

; The site visited j-th (!ssw_fire_cnt): the rim's sites first, then the
; others from !ssw_site_rr on. A = site index.
ss_fire_order:
	LDA.l !ssw_site_n : SEC : SBC.l !ssw_site_nr : STA.l !ssw_tmp+4   ; rim sites
	LDA.l !ssw_fire_cnt : CMP.l !ssw_tmp+4 : BCS +
	CLC : ADC.l !ssw_site_nr
	RTS
+	SEC : SBC.l !ssw_tmp+4 : CLC : ADC.l !ssw_site_rr
	CMP.l !ssw_site_nr : BCC +
	SBC.l !ssw_site_nr
+	RTS

; A site's flame (X = params offset): its Exploder frame swelling every 7
; frames (3/4, the larger fires 4/5 and 4 px lower), the smallest sites their
; ember. While a blast burns, the sites keep only their embers: fx caches 15
; cells, a blast needs up to 12 and the steady Exploder frames 10 more.
ss_fire_main:
	LDA.l !ssw_blast_end : BEQ +
	JMP ss_fire_ember
+	LDA.l !ssw_site_p+1,X : AND.w #$00C0 : CMP.w #$0080 : BNE +
	JMP ss_fire_ember
+	PHA
	; step = t7 + q7 + (r7_t + r7 >= 7)
	LDA.l !ssw_site_p+1,X : AND.w #$0007 : CLC : ADC.l !ssw_fire_r7
	CMP.w #7 : LDA.w #0 : ROL : STA.l !ssw_tmp+4          ; carry from the compare
	LDA.l !ssw_site_p,X : AND.w #$00FF : CLC : ADC.l !ssw_fire_t7
	CLC : ADC.l !ssw_tmp+4 : AND.w #1 : STA.l !ssw_tmp+4  ; step & 1
	PLA : BNE .size1
	LDA.l !ssw_tmp+4 : CLC : ADC.w #3
	LDY.w #0
	JMP ss_fire_burst
.size1
	LDA.l !ssw_tmp+4 : CLC : ADC.w #4
	LDY.w #4
	JMP ss_fire_burst

; The rest of a site (X = params offset): the ember above an Exploder flame,
; the smallest sites' second ember.
ss_fire_extra:
	LDA.l !ssw_blast_end : BEQ +
	RTS
+	LDA.l !ssw_site_p+1,X : AND.w #$00C0 : CMP.w #$0080 : BEQ +
	JMP ss_fire_ember
+	; size 2: a second ember at (5, 2), frame +1, turn (seed+1)%4
	LDA.l !ssw_site_p+2,X : AND.w #$0060 : LSR : LSR : LSR : LSR : LSR
	INC : CLC : ADC.l !ssw_fire_e3 : JSR ss_mod3
	STA.l !fx_b
	LDA.l !ssw_site_p+1,X : AND.w #$0030 : LSR : LSR : LSR : LSR : INC : AND.w #3
	SEP #$20 : STA.l !fx_dir : REP #$20
	LDA.w #!FX_G_EMBER : STA.l !fx_a
	TXA : LSR : TAX
	LDA.l !ssw_site_y,X : CLC : ADC.w #2 : TAY
	LDA.l !ssw_site_x,X : CLC : ADC.w #5 : TAX
	LDA.w #!FX_CELL
	JSL fx_draw
	LDA.l !ssw_fire_left : DEC : STA.l !ssw_fire_left
	RTS

; A site's ember (X = params offset): frame (t/5 + seed) % 3, turn seed % 4,
; rising through its 24-frame cycle.
ss_fire_ember:
	LDA.l !ssw_site_p+2,X : AND.w #$0060 : LSR : LSR : LSR : LSR : LSR
	CLC : ADC.l !ssw_fire_e3 : JSR ss_mod3
	STA.l !fx_b
	LDA.l !ssw_site_p+1,X : AND.w #$0030 : LSR : LSR : LSR : LSR
	SEP #$20 : STA.l !fx_dir : REP #$20
	LDA.w #!FX_G_EMBER : STA.l !fx_a
	; y - (size 2 ? 2 : 10) - rise((t + seed*5) % 24)
	LDA.l !ssw_site_p+2,X : AND.w #$001F : CLC : ADC.l !ssw_fire_m24
	CMP.w #24 : BCC +
	SBC.w #24
+	PHX
	TAX
	LDA.l ss_ember_rise,X : AND.w #$00FF : STA.l !ssw_tmp+6
	PLX
	LDA.w #10 : STA.l !ssw_tmp+8
	LDA.l !ssw_site_p+1,X : AND.w #$00C0 : CMP.w #$0080 : BNE +
	LDA.w #2 : STA.l !ssw_tmp+8
+	; x + (seed % 5 - 2) * 2
	LDA.l !ssw_site_p+3,X : AND.w #$00FF : SEC : SBC.w #2 : ASL : STA.l !ssw_tmp+10
	TXA : LSR : TAX
	LDA.l !ssw_site_y,X : SEC : SBC.l !ssw_tmp+8 : SEC : SBC.l !ssw_tmp+6 : TAY
	LDA.l !ssw_site_x,X : CLC : ADC.l !ssw_tmp+10 : TAX
	LDA.w #!FX_CELL
	JSL fx_draw
	LDA.l !ssw_fire_left : DEC : STA.l !ssw_fire_left
	RTS
ss_mod3:
-	CMP.w #3 : BCC +
	SBC.w #3
	BRA -
+	RTS

; A = Exploder frame, Y = y offset, X = params offset of the site.
ss_fire_burst:
	STA.l !fx_b
	LDA.w #!FX_G_BURST : STA.l !fx_a
	SEP #$20 : LDA.b #0 : STA.l !fx_dir : REP #$20
	TYA : STA.l !ssw_tmp+6
	PHX
	TXA : LSR : TAX
	LDA.l !ssw_site_y,X : CLC : ADC.l !ssw_tmp+6 : TAY
	LDA.l !ssw_site_x,X : TAX
	LDA.w #!FX_CELL
	JSL fx_draw
	PLX
	LDA.l !ssw_fire_left : DEC : STA.l !ssw_fire_left
	RTS

; Every 150 frames (at 75) a site explodes.
ss_fire_blast:
	; a blast's bursts live 42 frames after their 12 frames of starts
	LDA.l !ssw_blast_end : BEQ +
	DEC : STA.l !ssw_blast_end
+
	LDA.l !ss_wage : LDX.w #150 : JSR dst_div16 : STA.l !ssw_tmp+4
	ASL : ASL : ASL : ASL : SEC : SBC.l !ssw_tmp+4         ; q * 15
	ASL                                                   ; q * 30 ... *5 below
	STA.l !ssw_tmp+6
	ASL : ASL : CLC : ADC.l !ssw_tmp+6                    ; q * 150
	EOR.w #$FFFF : SEC : ADC.l !ss_wage
	CMP.w #75 : BEQ +
	RTS
+	; a fixed pseudo-random site: (q * 7 + loads * 3) % n
	LDA.l !ssw_tmp+4 : ASL : ASL : ASL : SEC : SBC.l !ssw_tmp+4 : STA.l !ssw_tmp+6
	LDA.l !ssw_site_n : BNE +
	RTS
+	STA.w !cs+$0
	LDA.l !ssw_loads : ASL : CLC : ADC.l !ssw_loads : CLC : ADC.l !ssw_tmp+6
-	CMP.w !cs+$0 : BCC +
	SEC : SBC.w !cs+$0
	BRA -
+	ASL : TAX
	LDA.l !ssw_site_y,X : TAY
	LDA.l !ssw_site_x,X : TAX
	JSR ss_blast_start
	LDA.w #6 : JSL fx_quake
	LDA.w #!AUDIO_SFX_FORTRESS_BREAK : JSL audio_sfx
	RTS

; X = x, Y = y: a blast (five bursts, 3 frames apart) in a free slot (else
; the older one is replaced).
ss_blast_start:
	LDA.w #54 : STA.l !ssw_blast_end
	LDA.l !ssw_blast_a : CMP.w #$FFFF : BEQ .a
	LDA.l !ssw_blast_b : CMP.w #$FFFF : BEQ .b
	LDA.l !ssw_blast_a : CMP.l !ssw_blast_b : BCS .a
.b
	LDA.w #0 : STA.l !ssw_blast_b
	TXA : STA.l !ssw_blast_b+2
	TYA : STA.l !ssw_blast_b+4
	RTS
.a
	LDA.w #0 : STA.l !ssw_blast_a
	TXA : STA.l !ssw_blast_a+2
	TYA : STA.l !ssw_blast_a+4
	RTS

; The blasts' bursts: burst i at age 3i (FX_EXPLODE: 7 Exploder frames x 6).
ss_blasts_tick:
	LDX.w #0
	JSR .slot
	LDX.w #6
.slot
	LDA.l !ssw_blast_a,X : CMP.w #$FFFF : BNE +
	RTS
+	PHX
	; i = age / 3 when age % 3 == 0, i < 5
	LDY.w #0
-	CMP.w #3 : BCC +
	SBC.w #3
	INY
	BRA -
+	CMP.w #0 : BNE .later
	CPY.w #5 : BCS .later
	TYA : AND.w #3
	SEP #$20 : STA.l !fx_dir : REP #$20
	TYA : AND.w #1
	SEP #$20 : STA.l !fx_style : REP #$20
	TYA : ASL : TAX                                       ; offsets 2i
	LDA.l ss_burst_off,X : AND.w #$00FF : EOR.w #$0080 : SEC : SBC.w #$0080 : STA.l !ssw_tmp+4
	LDA.l ss_burst_off+1,X : AND.w #$00FF : EOR.w #$0080 : SEC : SBC.w #$0080 : STA.l !ssw_tmp+6
	LDA $01,S : TAX
	LDA.l !ssw_blast_a+4,X : CLC : ADC.l !ssw_tmp+6 : TAY
	LDA.l !ssw_blast_a+2,X : CLC : ADC.l !ssw_tmp+4 : TAX
	LDA.w #!FX_EXPLODE
	JSL fx_spawn
.later
	PLX
	LDA.l !ssw_blast_a,X : INC
	CMP.w #13 : BCC +
	LDA.w #$FFFF
+	STA.l !ssw_blast_a,X
	RTS

; crashTick's blasts around Goku (every 10 frames of the crash while aboard,
; ss_crash_tick): A = the crash's age.
ss_crash_blast:
	PHA
	LDA.l !ss_flags : AND.w #!SSF_WRECK : BEQ .no
	LDA.w $00DC : JSR ss_ship_map : BCC .no
	LDA $01,S : LDX.w #10 : JSR dst_div16 : STA.l !ssw_tmp+4
	ASL : ASL : CLC : ADC.l !ssw_tmp+4 : ASL                ; q * 10
	EOR.w #$FFFF : SEC : ADC $01,S : BNE .no              ; not a multiple of 10
	LDA.l !ssw_tmp+4 : CMP.w #121 : BCS .no
	ASL : TAX
	LDA.l ss_crash_off,X : AND.w #$00FF : EOR.w #$0080 : SEC : SBC.w #$0080
	CLC : ADC.w $E002 : STA.l !ssw_tmp+6
	LDA.l ss_crash_off+1,X : AND.w #$00FF : EOR.w #$0080 : SEC : SBC.w #$0080
	CLC : ADC.w $E004 : TAY
	LDA.l !ssw_tmp+6 : TAX
	JSR ss_blast_start
	; pulse(4 + min(8, age >> 4))
	LDA $01,S : LSR : LSR : LSR : LSR : CMP.w #8 : BCC +
	LDA.w #8
+	CLC : ADC.w #4 : JSL fx_quake
	LDA.w #!AUDIO_SFX_FORTRESS_BREAK : JSL audio_sfx
.no
	PLA
	RTS

else
ss_fires:
	RTS
ss_crash_blast:
	RTS
endif
