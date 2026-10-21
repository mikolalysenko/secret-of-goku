; The second surge's cosmic montage (frieza-cinematic.js cosmicShots;
; frieza-collateral-view.js for the town shots, aerial-melee.js for the
; aerial cuts) and its pullback (planet-view.js cosmicBattle), from
; collateralStart to cosmicDuration, before the orbit's intro. Code and its
; generated tables in the orbit's second code area ($A1:C000); the clock in
; WRAM (!orbit_mt...), a shot's working state over the globe's window
; blocks (!MW: the pullback rebuilds them), its colours sent in the game's
; own palette transfer (orbit_cgram_upload). DB = $32, M16/X16 unless
; noted.
;
; A cut (a new shot) holds the picture in force blank through the field's
; brightness shadow ($E6 bit 7: the game writes INIDISP from it after the
; modules' vblank work) while the vblank loads the shot in three large
; steps (the field keeps force blank over our hook and no HDMA runs there);
; the shot shows from the vblank that finishes the load.
;
; Town shots, Mode 1 with BG3 in front: BG1 = the map's layer 0, BG2 =
; layer 1 (tiles from $0000, 64x32 maps at $2000 / $2800, scrolled by the
; pan and the shake); BG3 the laser (map $3400, one solid tile shown inside
; window 1, its core lit by colour math inside window 2, per line from an
; HDMA table) or the caption (map $3000, the orbit's text tiles); OBJ
; 8x8 / 16x16 at $6000: the embers ($000-$01B), the people (8x8, two slots
; of 16 tiles each from $020, streamed), the rabite ($040-$05F), the
; Exploder bursts (the orbit's resident cells), the fragments ($160-$16F)
; and the ring's dot ($170) over the stars' cells (the pullback reloads
; them).
; HDMA channel 2 writes TM again at line 196, after the field IRQ's HUD
; split; channel 6 the laser's windows.

!MTT          = !XDATA_ORBIT_MT_TABLES  ; the generated tables (orbit-montage.mjs)
!MT_TM_TOWN    = $13               ; BG1, BG2, OBJ (BG3: the laser, the caption)
!MT_PEOPLE_T   = $020              ; OBJ tiles: person i's slots at $020 + 32 i, + 16
!MT_RING_T     = $170
!MT_FRAG_T     = $160
!MT_RABITE_T   = $040
!MT_EMBER_T    = $000              ; 16x16 cells $000, $002 ... $00A
!MT_ATTR       = $3000             ; OBJ priority 3
!MT_NMI_SLACK  = 6                 ; the montage's uploads end 6 lines before !ORBIT_NMI_END

; ---------------------------------------------------------------------------
; The surge's cinematic starts (orbit_enter_try, !OE_SURGE), before the
; scene's load: the picture black from this vblank. JSL, DB = $32.
montage_start:
	PHP
	REP #$30
	LDA.w #$0001
	STA.l !orbit_mt
	LDA.w #!ORBIT_SURGE_DECK
	STA.l !orbit_mage
	LDA.w #$FFFF
	STA.l !orbit_mshot
	LDA.w #$0000
	STA.l !orbit_msage
	SEP #$20
	STA.l !orbit_mpic
	STA.l !orbit_mcut
	LDA.w $00E6                    ; the field's brightness, kept for the end
	STA.l !orbit_me6
	ORA.b #$80
	STA.w $00E6
	REP #$20
	PLP
	RTL

; ---------------------------------------------------------------------------
; Frame side (orbit_live_frame while !orbit_mt): the clock, a cut on a new
; shot, the shot's state for the vblank. JSL, DB = $32.
montage_frame:
	PHP
	REP #$30
	; one step per field vblank since the last frame (at most 4; one after
	; a menu): the browser's surge clock runs at the video rate
	LDA.l $7E0000|!cb_vblanks
	SEC : SBC.w !f_vbl
	BEQ +
	CMP.w #5
	BCC ++
+	LDA.w #1
++	STA.w !f_steps
	LDA.l $7E0000|!cb_vblanks
	STA.w !f_vbl
	LDA.l !core_frame_ring
	CLC : ADC.l !core_frame_menu
	CMP.w !f_menus
	BEQ +
	STA.w !f_menus
	LDA.w #1
	STA.w !f_steps
+
-	JSR mt_step
	REP #$30
	DEC.w !f_steps
	BNE -
	SEP #$20
	LDA.l !orbit_mpic
	CMP.b #!MT_PIC_TOWN
	REP #$20
	BNE +
	JSR mt_town_frame
+	PLP
	RTL

; One step of the surge's clock: the shot holding the new age (cosmicBeat),
; a cut when it changes, the beat's sounds.
mt_step:
	LDA.l !orbit_mage
	INC
	STA.l !orbit_mage
	CMP.w #!MT_END
	BCC +
	JMP mt_end
+	SEC : SBC.w #!ORBIT_SURGE_DECK
	LDX.w #$0000
	LDY.w #$0000
-	CMP.l orbit_mt_shots+4,X       ; the shot's duration
	BCC .found
	SEC : SBC.l orbit_mt_shots+4,X
	INY
	INX : INX : INX : INX : INX : INX
	CPY.w #!MT_SHOTS
	BCC -
.found
	STA.l !orbit_msage             ; (the pullback's age past the shots)
	TYA
	CMP.l !orbit_mshot
	BEQ +
	STA.l !orbit_mshot
	JSR mt_cut
+	JMP mt_sounds

; cosmicDuration: frieza.js enterOrbit; the orbit's intro and fight from
; here (Frieza's clock went on through the surge: b.age), the picture the
; pullback's.
mt_end:
	LDA.w #$0000
	STA.l !orbit_mt
	LDA.w !b_age
	CLC : ADC.w #!MT_END-!ORBIT_SURGE_DECK
	STA.w !b_age
	SEP #$20
	LDA.w $00E6                    ; (the field's brightness, if still blanked)
	BPL +
	LDA.l !orbit_me6
	STA.w $00E6
+	REP #$20
	RTS

; The current shot's table entry: X16 = its offset in orbit_mt_shots; A16 =
; its kind (!MT_TOWN / !MT_AERIAL, $FFFF past the shots).
mt_shot_entry:
	LDA.l !orbit_mshot
	CMP.w #!MT_SHOTS
	BCC +
	LDA.w #$FFFF
	RTS
+	ASL
	STA.w !mw_tmp
	ASL
	CLC : ADC.w !mw_tmp
	TAX
	LDA.l orbit_mt_shots+0,X
	RTS

; A new shot: its picture loads behind force blank (the vblank's steps).
mt_cut:
	JSR mt_shot_entry
	CMP.w #!MT_TOWN
	BEQ .town
	CMP.w #$FFFF
	BEQ .pullback
	; (the aerial cuts: next; meanwhile black)
	SEP #$20
	LDA.b #$00
	STA.l !orbit_mpic
	STA.l !orbit_mcut
	LDA.w $00E6
	ORA.b #$80
	STA.w $00E6
	REP #$20
	RTS
.pullback
	; the globe's picture: the scene's whole load (its first step on),
	; still in force blank; it shows when the load ends (scene.asm)
	JSL orbit_picture_init_far
	REP #$30
	SEP #$20
	LDA.b #$00
	STA.l !orbit_mpic
	STA.l !orbit_mcut
	LDA.b #!OS_LOADING
	STA.l !orbit_state
	LDA.w $00E6
	ORA.b #$80
	STA.w $00E6
	REP #$20
	RTS
.town
	LDA.l orbit_mt_shots+2,X       ; the town
	STA.w !mw_town
	SEP #$20
	LDA.w $00E6
	ORA.b #$80
	STA.w $00E6
	LDA.b #$01
	STA.l !orbit_mcut
	LDA.b #!MT_PIC_TOWN
	STA.l !orbit_mpic
	REP #$20
	STZ.w !mw_ruin
	STZ.w !mw_laser
	STZ.w !mw_red
	STZ.w !mw_wshow                ; the laser's tables: 0 shown, 1 written next
	STZ.w !mw_wset
	LDX.w #4                       ; the people's slots empty, A shown
-	LDA.w #$FFFF
	STA.w !mw_pa,X
	STA.w !mw_pb,X
	STA.w !mw_pdue,X
	STZ.w !mw_pf,X
	DEX : DEX
	BPL -
	RTS

; The beat's sounds (frieza.js tick, 'frieza-cosmic'): the laser 12 frames
; before a town's hit, the Fortress break at it.
mt_sounds:
	JSR mt_shot_entry
	CMP.w #!MT_TOWN
	BNE .out
	LDA.l orbit_mt_shots+2,X
	JSR mt_town_entry
	LDA.l orbit_mt_towns+4,X       ; hit
	SEC : SBC.w #12
	CMP.l !orbit_msage
	BNE +
	LDA.w #!AUDIO_SFX_FRIEZA_LASER
	JSL audio_sfx
	REP #$30
	RTS
+	LDA.l orbit_mt_towns+4,X
	CMP.l !orbit_msage
	BNE .out
	LDA.w #!AUDIO_SFX_FORTRESS_BREAK
	JSL audio_sfx
	REP #$30
.out
	RTS

; A16 = a town -> X16 = its entry in orbit_mt_towns (12 bytes).
mt_town_entry:
	ASL : ASL
	STA.w !mw_tmp
	ASL
	CLC : ADC.w !mw_tmp
	TAX
	RTS

; ---------------------------------------------------------------------------
; A town shot's frame (frieza-collateral-view.js draw): dt, the pan, the
; shake, the hit point, the tint, the ruin, the people's cells, the laser.
mt_town_frame:
	LDA.w !mw_town
	JSR mt_town_entry
	STX.w !mw_tent
	LDA.l !orbit_msage
	SEC : SBC.l orbit_mt_towns+4,X
	STA.w !mw_dt                   ; dt = t - hit
	LDA.l !orbit_msage             ; pan = min(12, floor(t / 24))
	STA.l $004204
	SEP #$20
	LDA.b #24
	STA.l $004206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.l $004214
	CMP.w #12
	BCC +
	LDA.w #12
+	STA.w !mw_pan
	LDA.l orbit_mt_towns+0,X       ; hit = blast - (pan, 0)
	SEC : SBC.w !mw_pan
	STA.w !mw_hitx
	LDA.l orbit_mt_towns+2,X
	STA.w !mw_hity
	; the shake: dt 0..11, -2 / +2 every two frames
	STZ.w !mw_shake
	LDA.w !mw_dt
	BMI +
	CMP.w #12
	BCS +
	AND.w #$0003
	CMP.w #2
	LDA.w #$FFFE
	BCC ++
	LDA.w #$0002
++	STA.w !mw_shake
+	; the tint: 5 over 86..109 and 131..154, 2 from 156
	LDA.l !orbit_msage
	LDY.w #0
	CMP.w #86
	BCC .tint
	CMP.w #110
	BCC .red5
	CMP.w #131
	BCC .tint
	CMP.w #155
	BCC .red5
	CMP.w #156
	BCC .tint
	LDY.w #2
	BRA .tint
.red5
	LDY.w #5
.tint
	STY.w !mw_red
	; the ruin: into the maps' second copy from the shot's first frame
	; (the vblank's spare room), shown from the hit
	LDA.w !mw_ruin
	BNE +
	INC.w !mw_ruin
+	JSR mt_people
	JMP mt_laser

; The people (civilianPose, generated per frame): each one's screen place
; and pose. Two tile slots each: the pose shows from the slot holding it,
; else the last one stays a frame; the other slot gets the pose wanted now
; or the one person i will want i + 1 frames on (the vblank sends its 15
; tiles while it has room).
mt_people:
	LDX.w !mw_tent
	LDA.l orbit_mt_towns+8,X       ; people
	STA.w !mw_np
	BNE +
	RTS
+	LDA.l orbit_mt_towns+6,X       ; the last record's t
	DEC
	STA.w !mw_tmp+8
	LDA.w !mw_town
	ASL : ASL
	TAX
	LDA.l orbit_mt_people_at+2,X
	STA.w !mw_ptr+2                ; the records' bank
	LDY.w #$0000
.person
	; x - 12 (word), y | cell << 8 | flip << 15 (word)
	LDA.l !orbit_msage
	JSR mt_person_rec
	JSR mt_read_word
	SEC : SBC.w !mw_pan
	STA.w !mw_px,Y
	JSR mt_read_word
	STA.w !mw_pcell,Y
	AND.w #$00FF
	STA.w !mw_py,Y
	LDA.w !mw_pcell,Y
	XBA
	AND.w #$001F
	STA.w !mw_tmp+10               ; the pose wanted now
	JSR mt_slot_cells
	LDA.w !mw_tmp+10
	CMP.w !mw_tmp+12
	BEQ .ahead
	CMP.w !mw_tmp+14
	BNE .late
	LDA.w !mw_pf,Y                 ; (in the other slot: shown from it)
	EOR.w #$0001
	STA.w !mw_pf,Y
	JSR mt_slot_cells
	BRA .ahead
.late
	STA.w !mw_pdue,Y               ; (not loaded: the last pose stays a frame)
	BRA .next
.ahead
	TYA                            ; the pose i + 1 frames on
	LSR
	SEC
	ADC.l !orbit_msage
	CMP.w !mw_tmp+8
	BCC +
	LDA.w !mw_tmp+8
+	JSR mt_person_rec
	JSR mt_read_word
	JSR mt_read_word
	XBA
	AND.w #$001F
	CMP.w !mw_tmp+12
	BEQ +
	CMP.w !mw_tmp+14
	BEQ +
	STA.w !mw_pdue,Y
	BRA .next
+	LDA.w #$FFFF
	STA.w !mw_pdue,Y
.next
	INY : INY
	TYA
	LSR
	CMP.w !mw_np
	BCS +
	JMP .person
+	RTS

; A16 = t -> !mw_ptr = person Y16 / 2's record at t ((t * people + person)
; * 4 into the town's table; the bank already in !mw_ptr+2). Y kept.
mt_person_rec:
	STA.w !mw_tmp
	LDA.w !mw_np
	CMP.w #3
	BNE +
	LDA.w !mw_tmp                  ; t * 3
	ASL
	ADC.w !mw_tmp
	BRA ++
+	CMP.w #2
	BNE +
	LDA.w !mw_tmp
	ASL
	BRA ++
+	LDA.w !mw_tmp
++	STA.w !mw_tmp
	TYA
	LSR
	CLC : ADC.w !mw_tmp
	ASL : ASL
	STA.w !mw_tmp
	LDA.w !mw_town
	ASL : ASL
	TAX
	LDA.l orbit_mt_people_at,X
	CLC : ADC.w !mw_tmp
	STA.w !mw_ptr
	RTS

; Person Y16 / 2's slots: !mw_tmp+12 = the cell the shown one holds, +14
; the other's ($FFFF: none). Y kept.
mt_slot_cells:
	LDA.w !mw_pf,Y
	BNE +
	LDA.w !mw_pa,Y
	STA.w !mw_tmp+12
	LDA.w !mw_pb,Y
	STA.w !mw_tmp+14
	RTS
+	LDA.w !mw_pb,Y
	STA.w !mw_tmp+12
	LDA.w !mw_pa,Y
	STA.w !mw_tmp+14
	RTS

; A16 = the word at the long pointer !mw_ptr (bank in !mw_ptr+2), which
; moves on by two. Y kept.
mt_read_word:
	PHB
	SEP #$20
	LDA.w !mw_ptr+2
	PHA
	REP #$20
	LDX.w !mw_ptr
	PLB
	LDA.w $0000,X
	PLB
	PHA
	LDA.w !mw_ptr
	INC : INC
	STA.w !mw_ptr
	PLA
	RTS

; The laser's windows (dt -12..12): HDMA channel 6 reads the generated
; rows (W1 = the band, W2 = the core, per line from the top) indirectly
; from the town's blob; the table the vblank does not show gets its
; entries: the beam's rows in runs of up to 127 (its first transfer is the
; first line shown), the lines after them with the windows off.
mt_laser:
	STZ.w !mw_laser
	LDA.w !mw_dt
	CLC : ADC.w #12
	CMP.w #25
	BCC +
	RTS
+	ASL : ASL
	STA.w !mw_tmp
	LDA.w !mw_town
	ASL
	TAX
	LDA.l orbit_mt_laser_ptrs,X    ; the town's (offset, rows) per dt
	CLC : ADC.w !mw_tmp
	TAX
	LDA.l !MTT+2,X
	BNE +
	RTS                            ; (no row on the screen yet)
+	STA.w !mw_rows
	LDA.l !MTT,X
	STA.w !mw_tmp+2
	LDA.w !mw_town
	ASL : ASL
	TAX
	LDA.l orbit_mt_laser_at+2,X
	STA.w !mw_lbank
	LDA.l orbit_mt_laser_at,X      ; the blob: the windows off first
	STA.w !mw_loff
	CLC : ADC.w !mw_tmp+2
	STA.w !mw_ptr                  ; the beam's first row
	LDA.w #224
	SEC : SBC.w !mw_rows
	STA.w !mw_tmp+4                ; lines after the beam
	; the table the vblank does not show
	LDA.w !mw_wshow
	EOR.w #$0001
	STA.w !mw_wset
	BEQ +
	LDA.w #!MW_WIN1
	BRA ++
+	LDA.w #!MW_WIN0
++	TAY
.rows
	LDA.w !mw_rows
	BEQ .rest
	CMP.w #128
	BCC +
	LDA.w #127
+	STA.w !mw_tmp+6
	ORA.w #$0080                   ; repeat: a row a line
	SEP #$20
	STA.w $0000,Y
	REP #$20
	LDA.w !mw_ptr
	STA.w $0001,Y
	INY : INY : INY
	LDA.w !mw_tmp+6
	ASL : ASL
	CLC : ADC.w !mw_ptr
	STA.w !mw_ptr
	LDA.w !mw_rows
	SEC : SBC.w !mw_tmp+6
	STA.w !mw_rows
	BRA .rows
.rest
	LDA.w !mw_tmp+4
	BEQ .end
	CMP.w #128
	BCC +
	LDA.w #127
+	STA.w !mw_tmp+6
	JSR .off
	LDA.w !mw_tmp+4
	SEC : SBC.w !mw_tmp+6
	STA.w !mw_tmp+4
	BRA .rest
.end
	SEP #$20
	LDA.b #$00
	STA.w $0000,Y                  ; (the end)
	REP #$20
	LDA.w #$0001
	STA.w !mw_laser
	RTS
; An entry of A16 lines (1-127) with the windows off (written once).
.off
	SEP #$20
	STA.w $0000,Y
	REP #$20
	LDA.w !mw_loff
	STA.w $0001,Y
	INY : INY : INY
	RTS

; ---------------------------------------------------------------------------
; OAM (orbit_oam_frame, after the native sprites, all of them hidden while
; the montage shows): JSL, DB = $32.
montage_oam:
	PHP
	REP #$30
	SEP #$20
	LDA.l !orbit_mpic
	CMP.b #!MT_PIC_TOWN
	REP #$20
	BNE +
	JSR mt_town_oam
+	PLP
	RTL

; The generated sprite lists (orbit-montage.mjs, in this bank): a count
; word, the box of the sprites' top lefts (min x, max x, min y, max y, each
; + 128: bytes), then per sprite dx + 128, dy + 128 (bytes) and its tile |
; attributes word. mt_list8 / mt_list16: the list at X16 about (!d_t0,
; !d_t1) (each less 128), !d_t2 added to every tile | attributes word,
; into the OAM from !o_slot on. A list wholly on the screen, with room
; for all of it, goes in with low bytes only; else each sprite is checked
; (those wholly off the screen skipped, x bit 8 for those partly left of
; it). The 16x16 ones get their size bits from mt_large, once for a run of
; them.
!MTL = (orbit_mt_lists&$FF0000)

mt_list16:
	LDA.w #15
	BRA mt_list
mt_list8:
	LDA.w #7
mt_list:
	STA.w !d_t4                    ; size - 1
	LDA.l !MTL,X
	BNE +
	RTS
+	ASL : ASL
	STA.w !d_t5                    ; count * 4: the entries' bytes, the OAM's
	TXA
	CLC : ADC.w #6
	TAX                            ; the first entry
	CLC : ADC.w !d_t5
	STA.w !d_t3                    ; the entries' end
	LDA.w !o_slot
	CLC : ADC.w !d_t5
	CMP.w #$0201
	BCS .slow                      ; (not room for all)
	LDA.l !MTL-4,X                 ; the box on the screen?
	AND.w #$00FF
	CLC : ADC.w !d_t0
	BMI .slow
	LDA.l !MTL-3,X
	AND.w #$00FF
	CLC : ADC.w !d_t0
	CLC : ADC.w !d_t4
	CMP.w #256
	BCS .slow
	LDA.l !MTL-2,X
	AND.w #$00FF
	CLC : ADC.w !d_t1
	BMI .slow
	LDA.l !MTL-1,X
	AND.w #$00FF
	CLC : ADC.w !d_t1
	CLC : ADC.w !d_t4
	CMP.w #224
	BCS .slow
	LDY.w !o_slot
	SEP #$20
.fast
	LDA.l !MTL,X
	CLC : ADC.w !d_t0
	STA.w $0800,Y
	LDA.l !MTL+1,X
	CLC : ADC.w !d_t1
	STA.w $0801,Y
	REP #$20
	LDA.l !MTL+2,X
	CLC : ADC.w !d_t2
	STA.w $0802,Y
	SEP #$20
	INY : INY : INY : INY
	INX : INX : INX : INX
	CPX.w !d_t3
	BNE .fast
	REP #$20
	STY.w !o_slot
	RTS
.slow
	LDA.w !d_t4
	CLC : ADC.w #256
	STA.w !d_t5                    ; x + size - 1 below this: on the screen
	SEC : SBC.w #32
	STA.w !d_t6                    ; y + size - 1 below this
	LDY.w !o_slot
.loop
	CPY.w #$0200
	BCS .full
	LDA.l !MTL,X
	AND.w #$00FF
	CLC : ADC.w !d_t0
	STA.w !d_x
	CLC : ADC.w !d_t4
	CMP.w !d_t5
	BCS .skip                      ; (unsigned: left of the screen too)
	LDA.l !MTL+1,X
	AND.w #$00FF
	CLC : ADC.w !d_t1
	STA.w !d_y
	CLC : ADC.w !d_t4
	CMP.w !d_t6
	BCS .skip
	SEP #$20
	LDA.w !d_x : STA.w $0800,Y
	LDA.w !d_y : STA.w $0801,Y
	REP #$20
	LDA.l !MTL+2,X
	CLC : ADC.w !d_t2
	STA.w $0802,Y
	LDA.w !d_x
	BPL +
	JSR mt_hi_x
+	INY : INY : INY : INY
.skip
	INX : INX : INX : INX
	CPX.w !d_t3
	BNE .loop
.full
	STY.w !o_slot
	RTS

; 8x8 sprites from a generated record at !MTT + X16 (a count word, the box
; as the lists', then per sprite dx + 128, dy + 128) about (!d_t0, !d_t1)
; (each less 128): tile | attributes !d_ta, !d_t2 added for each next one.
mt_dots:
	LDA.l !MTT,X
	BNE +
	RTS
+	ASL
	STA.w !d_t5                    ; count * 2: the pairs' bytes
	ASL
	STA.w !d_t4                    ; count * 4: the OAM's
	TXA
	CLC : ADC.w #6
	TAX
	CLC : ADC.w !d_t5
	STA.w !d_t3                    ; the pairs' end
	LDA.w !o_slot
	CLC : ADC.w !d_t4
	CMP.w #$0201
	BCS .slow
	LDA.l !MTT-4,X                 ; the box on the screen?
	AND.w #$00FF
	CLC : ADC.w !d_t0
	BMI .slow
	LDA.l !MTT-3,X
	AND.w #$00FF
	CLC : ADC.w !d_t0
	CMP.w #256-7
	BCS .slow
	LDA.l !MTT-2,X
	AND.w #$00FF
	CLC : ADC.w !d_t1
	BMI .slow
	LDA.l !MTT-1,X
	AND.w #$00FF
	CLC : ADC.w !d_t1
	CMP.w #224-7
	BCS .slow
	LDY.w !o_slot
.fast
	SEP #$20
	LDA.l !MTT,X
	CLC : ADC.w !d_t0
	STA.w $0800,Y
	LDA.l !MTT+1,X
	CLC : ADC.w !d_t1
	STA.w $0801,Y
	REP #$20
	LDA.w !d_ta
	STA.w $0802,Y
	CLC : ADC.w !d_t2
	STA.w !d_ta
	INY : INY : INY : INY
	INX : INX
	CPX.w !d_t3
	BNE .fast
	STY.w !o_slot
	RTS
.slow
	LDY.w !o_slot
.loop
	CPY.w #$0200
	BCS .full
	LDA.l !MTT,X
	AND.w #$00FF
	CLC : ADC.w !d_t0
	STA.w !d_x
	CLC : ADC.w #7
	CMP.w #256+7
	BCS .skip
	LDA.l !MTT+1,X
	AND.w #$00FF
	CLC : ADC.w !d_t1
	STA.w !d_y
	CLC : ADC.w #7
	CMP.w #224+7
	BCS .skip
	SEP #$20
	LDA.w !d_x : STA.w $0800,Y
	LDA.w !d_y : STA.w $0801,Y
	REP #$20
	LDA.w !d_ta : STA.w $0802,Y
	LDA.w !d_x
	BPL +
	JSR mt_hi_x
+	INY : INY : INY : INY
.skip
	LDA.w !d_ta
	CLC : ADC.w !d_t2
	STA.w !d_ta
	INX : INX
	CPX.w !d_t3
	BNE .loop
.full
	STY.w !o_slot
	RTS

; The x bit 8 of the OAM entry at Y16 (x < 0). X16, Y16 kept.
mt_hi_x:
	PHX
	PHY
	TYA
	LSR : LSR
	AND.w #$0003
	ASL : ASL
	ORA.w #$0001
	TAX                            ; pair * 4 + bit
	TYA
	LSR : LSR : LSR : LSR
	TAY                            ; the high-table byte
	SEP #$20
	LDA.w $0A00,Y
	ORA.l ofx_hibits,X
	STA.w $0A00,Y
	REP #$20
	PLY
	PLX
	RTS

; The OAM entries from offset A16 up to Y16 (exclusive) large (high-table
; bit 1 of each): single entries up to a byte, then whole bytes.
mt_large:
	STY.w !d_t6
	TAY
.lead
	CPY.w !d_t6
	BCS .done
	TYA
	AND.w #$000C
	BEQ .bytes
	JSR .one
	INY : INY : INY : INY
	BRA .lead
.bytes
	TYA
	CLC : ADC.w #16
	CMP.w !d_t6
	BEQ +
	BCS .tail                      ; (fewer than four left)
+	TYA
	LSR : LSR : LSR : LSR
	TAX
	SEP #$20
	LDA.w $0A00,X
	ORA.b #$AA
	STA.w $0A00,X
	REP #$20
	TYA
	CLC : ADC.w #16
	TAY
	BRA .bytes
.tail
	CPY.w !d_t6
	BCS .done
	JSR .one
	INY : INY : INY : INY
	BRA .tail
.done
	RTS
.one
	TYA
	LSR : LSR
	AND.w #$0003
	ASL : ASL
	ORA.w #$0002
	TAX
	PHY
	TYA
	LSR : LSR : LSR : LSR
	TAY
	SEP #$20
	LDA.w $0A00,Y
	ORA.l ofx_hibits,X
	STA.w $0A00,Y
	REP #$20
	PLY
	RTS

; The town's sprites, front to back (the browser paints back to front):
; the fires and their embers, the roof fragments, the bursts, the warning
; ring, the rabite, the people.
mt_town_oam:
	LDA.w !o_slot
	STA.w !mw_ostart
	JSR mt_fires
	LDA.w !mw_ostart
	LDY.w !o_slot
	JSR mt_large
	JSR mt_frags
	LDA.w !o_slot
	STA.w !mw_ostart
	JSR mt_bursts
	LDA.w !mw_ostart
	LDY.w !o_slot
	JSR mt_large
	JSR mt_ring
	JSR mt_rabite
	JMP mt_people_oam

; Fires (dt > 9, cinematic-ruins.js sites, the last first): the Exploder's
; frame age / 7 at the site, age = (dt + 3 seed) mod 53, mirrored by seed
; & 1, shaken; for even seeds an ember (frame age / 8, quarter turn seed &
; 3) rising over it while age < 24.
mt_fires:
	LDA.w !mw_dt
	SEC : SBC.w #10
	BPL +
	RTS
+	LDA.w !mw_town
	ASL
	TAX
	LDA.l orbit_mt_fires_at,X
	TAX                            ; the town's list (offset in the tables)
	LDA.l !MTT,X
	BNE +
	RTS
+	STA.w !mw_tmp                  ; sites left
	DEC                            ; the last site's record: + 2 + (n - 1) * 12
	ASL : ASL
	STA.w !mw_tmp+2
	ASL
	CLC : ADC.w !mw_tmp+2
	STA.w !mw_tmp+2
	TXA
	INC : INC
	CLC : ADC.w !mw_tmp+2
	STA.w !mw_tmp+4                ; the record
.site
	LDX.w !mw_tmp+4
	LDA.l !MTT+4,X                 ; 3 seed + dt, mod 53
	CLC : ADC.w !mw_dt
-	CMP.w #53
	BCC +
	SBC.w #53
	BRA -
+	STA.w !mw_tmp+8                ; age
	CMP.w #24                      ; the ember first (in front of its burst)
	BCS .burst
	LDA.l !MTT+10,X                ; its turn (-1: none)
	BMI .burst
	JSR mt_ember
.burst
	LDX.w !mw_tmp+4
	LDA.l !MTT+0,X                 ; x - pan + shake (less 128)
	SEC : SBC.w !mw_pan
	CLC : ADC.w !mw_shake
	SEC : SBC.w #128
	STA.w !d_t0
	LDA.l !MTT+2,X                 ; y - 5 (less 128)
	STA.w !d_t1
	LDA.w !mw_tmp+8                ; the list: age * 2 + mirroring
	ASL
	ORA.l !MTT+6,X
	ASL
	TAX
	LDA.l orbit_mt_fire_l,X
	TAX
	STZ.w !d_t2
	JSR mt_list16
	LDA.w !mw_tmp+4
	SEC : SBC.w #12
	STA.w !mw_tmp+4
	DEC.w !mw_tmp
	BNE .site
	RTS

; The ember of the site at !mw_tmp+4 (age !mw_tmp+8, A16 = its turn): at
; (x + drift floor(age / 2) - pan, y - age), the list of its frame and
; turn.
mt_ember:
	STA.w !mw_tmp+10
	LDA.w !mw_tmp+8
	LSR
	STA.w !mw_tmp+12               ; floor(age / 2)
	LDA.l !MTT+8,X                 ; drift (-1, 0, 1)
	BEQ .dx
	BPL +
	LDA.w #$0000
	SEC : SBC.w !mw_tmp+12
	BRA .dx
+	LDA.w !mw_tmp+12
.dx
	CLC : ADC.l !MTT+0,X
	SEC : SBC.w !mw_pan
	SEC : SBC.w #128
	STA.w !d_t0
	LDA.l !MTT+2,X                 ; (the burst's y less 128) + 5 - age
	CLC : ADC.w #5
	SEC : SBC.w !mw_tmp+8
	STA.w !d_t1
	LDA.w !mw_tmp+8                ; the list: age * 4 + turn
	ASL : ASL
	ORA.w !mw_tmp+10
	ASL
	TAX
	LDA.l orbit_mt_ember_l,X
	TAX
	STZ.w !d_t2
	JMP mt_list16

; Roof fragments (0 <= dt < 55): 16 cells of the map's pixels about the
; hit (the generated places, the last first), shaken with the picture.
mt_frags:
	LDA.w !mw_dt
	BPL +
	RTS
+	CMP.w #55
	BCC +
	RTS
+	ASL
	TAX
	LDA.l !MTT_FRAG_PTR,X          ; dt's record
	CLC : ADC.w #!MTO_FRAG
	TAX
	LDA.w !mw_hitx
	CLC : ADC.w !mw_shake
	SEC : SBC.w #128
	STA.w !d_t0
	LDA.w !mw_hity
	SEC : SBC.w #128
	STA.w !d_t1
	LDA.w #(!MT_FRAG_T+15)|(4<<9)|!MT_ATTR
	STA.w !d_ta
	LDA.w #$FFFF                   ; (tiles 15 down to 0)
	STA.w !d_t2
	JMP mt_dots

; Exploder bursts (dt >= 0): burst i at age dt - 3 i (0-41) about the hit
; (the generated places), shaken, its list by age and burst (frame age /
; 6, mirrored as the orbit's fx.burst); the last first.
mt_bursts:
	LDA.w !mw_dt
	BPL +
	RTS
+	LDA.w #8
	STA.w !mw_tmp
.burst
	LDA.w !mw_tmp                  ; age = dt - 3 i
	ASL
	ADC.w !mw_tmp
	EOR.w #$FFFF
	SEC : ADC.w !mw_dt
	BMI .next
	CMP.w #42
	BCS .next
	ASL
	STA.w !mw_tmp+2                ; age * 2
	LDA.w !mw_tmp
	ASL
	TAX
	LDA.l orbit_mt_burst_row,X     ; i * 84
	CLC : ADC.w !mw_tmp+2
	STA.w !mw_tmp+2                ; (i * 42 + age) * 2
	TAX
	LDA.l !MTT_BURST_OFF,X         ; the place (x + 128, y + 128), less 256
	AND.w #$00FF
	CLC : ADC.w !mw_hitx
	CLC : ADC.w !mw_shake
	SEC : SBC.w #256
	STA.w !d_t0
	LDA.l !MTT_BURST_OFF+1,X
	AND.w #$00FF
	CLC : ADC.w !mw_hity
	SEC : SBC.w #256
	STA.w !d_t1
	LDA.l orbit_mt_burst_l,X
	TAX
	STZ.w !d_t2
	JSR mt_list16
.next
	DEC.w !mw_tmp
	BPL .burst
	RTS

; The warning ring (-50 <= dt < 0): the generated points about the hit.
mt_ring:
	LDA.w !mw_dt
	BPL .out
	CLC : ADC.w #50
	BMI .out
	ASL
	TAX
	LDA.l !MTT_RING_PTR,X
	CLC : ADC.w #!MTO_RING
	TAX
	LDA.w !mw_hitx
	SEC : SBC.w #128
	STA.w !d_t0
	LDA.w !mw_hity
	SEC : SBC.w #128
	STA.w !d_t1
	LDA.w #!MT_RING_T|(5<<9)|!MT_ATTR
	STA.w !d_ta
	STZ.w !d_t2
	JMP mt_dots
.out
	RTS

; The rabite (its shot, dt < 0): frame (t / 12) mod 2, hopping |t mod 36 -
; 18| >> 2 while t < 100, its picture's top left at (hit x - 12, hit y - 19
; - hop).
mt_rabite:
	LDX.w !mw_tent
	LDA.l orbit_mt_towns+10,X      ; rabite
	BNE +
	RTS
+	LDA.w !mw_dt
	BMI +
	RTS
+	LDY.w #$0000                   ; hop
	LDA.l !orbit_msage
	CMP.w #100
	BCS +
	LDX.w #36
	JSR mt_div
	LDA.l $004216
	SEC : SBC.w #18
	BPL ++
	EOR.w #$FFFF
	INC
++	LSR : LSR
	TAY
+	STY.w !mw_tmp+2
	LDA.w !mw_hitx
	SEC : SBC.w #12+128
	STA.w !d_t0
	LDA.w !mw_hity
	SEC : SBC.w #19+128
	SEC : SBC.w !mw_tmp+2
	STA.w !d_t1
	LDA.l !orbit_msage             ; frame (t / 12) mod 2
	LDX.w #12
	JSR mt_div
	AND.w #$0001
	ASL
	TAX
	LDA.l orbit_mt_rabite_l,X
	TAX
	STZ.w !d_t2
	JMP mt_list8

; The people, the last first: each one's pose list (the shown slot's;
; mirrored when it walks right) from its picture's top left, tiles from that
; slot.
mt_people_oam:
	LDA.w !mw_np
	BNE +
	RTS
+	DEC
	ASL
	STA.w !mw_tmp                  ; person * 2
.person
	LDY.w !mw_tmp
	JSR mt_slot_cells
	LDA.w !mw_tmp+12               ; (nothing loaded yet: not drawn)
	CMP.w #$FFFF
	BEQ .next
	ASL
	STA.w !mw_tmp+2                ; the list: cell * 2 + mirrored
	LDA.w !mw_pcell,Y
	BPL +
	INC.w !mw_tmp+2
+	LDA.w !mw_px,Y
	SEC : SBC.w #128
	STA.w !d_t0
	LDA.w !mw_py,Y
	SEC : SBC.w #128
	STA.w !d_t1
	TYA                            ; the slot's first tile: $020 + 32 i (+ 16: B)
	ASL : ASL : ASL : ASL
	CLC : ADC.w #!MT_PEOPLE_T
	LDX.w !mw_pf,Y
	BEQ +
	CLC : ADC.w #16
+	STA.w !d_t2
	LDA.w !mw_tmp+2
	ASL
	TAX
	LDA.l orbit_mt_people_l,X
	TAX
	JSR mt_list8
.next
	LDA.w !mw_tmp
	SEC : SBC.w #2
	STA.w !mw_tmp
	BPL .person
	RTS

; A16 = A16 / X8 (hardware divider): quotient in A16, remainder in
; $004216.
mt_div:
	STA.l $004204
	TXA
	SEP #$20
	STA.l $004206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.l $004214
	RTS

; ---------------------------------------------------------------------------
; Vblank (orbit_nmi_live while a montage picture is up): a cut's load
; step, else the shot's registers, HDMA, streamed tiles and the ruin.
; JSL, DB = $32.
montage_nmi:
	PHP
	REP #$30
	SEP #$20
	LDA.l !orbit_mcut
	REP #$20
	BEQ .shown
	JSR mt_load
	SEP #$20
	LDA.l !orbit_mcut
	REP #$20
	BEQ .shown                     ; (the last step: shown from this vblank)
	SEP #$20                       ; still loading: no HDMA of ours
	LDA.w !N_HDMA
	AND.b #~!ORBIT_HDMA
	STA.w !N_HDMA
	PLP
	RTL
.shown
	JSR mt_town_nmi
	PLP
	RTL

; One DMA on channel 7 to VRAM: A16 = VRAM word address, X16 = source
; address, Y16 = bytes, !mw_dbank = source bank, !mw_vmain = VMAIN, the
; B-bus register and mode in !mw_dmap ($1801: words; $1800 / $1900: low /
; high bytes; +$08: fixed source).
mt_vdma:
	STA.w $2116
	STX.w $4372
	STY.w $4375
	LDA.w !mw_dmap
	STA.w $4370
	SEP #$20
	LDA.w !mw_dbank
	STA.w $4374
	LDA.w !mw_vmain
	STA.w $2115
	LDA.b #$80
	STA.w $420B
	REP #$20
	RTS

; A cut's loads (force blank: the field's over our hook, then $E6's), three
; steps. 1: the town's tiles; 2: its maps (and their copy for the ruin); 3:
; BG3, the OBJ cells, the people, then the picture shows (the field's
; brightness back).
mt_load:
	LDA.w #$1801
	STA.w !mw_dmap
	LDA.w #$0080
	STA.w !mw_vmain
	SEP #$20
	LDA.l !orbit_mcut
	CMP.b #2
	REP #$20
	BCC .tiles
	BNE +
	JMP mt_load2
+	JMP mt_load3
.tiles
	LDA.w !mw_town
	ASL : ASL : ASL
	TAX
	LDA.l orbit_mt_tiles_at+2,X
	STA.w !mw_dbank
	LDA.l orbit_mt_tiles_at+4,X
	TAY
	LDA.l orbit_mt_tiles_at,X
	TAX
	LDA.w #$0000
	JSR mt_vdma
	SEP #$20
	LDA.b #2
	STA.l !orbit_mcut
	REP #$20
	RTS

mt_load2:
	; BG1 / BG2 maps: per layer rows 0-27 of screen 0 (one run), then
	; columns 32, 33 and 63 (increments of 32 words)
	LDA.w !mw_town
	ASL : ASL
	TAX
	LDA.l orbit_mt_maps_at+2,X
	STA.w !mw_dbank
	LDA.l orbit_mt_maps_at,X
	STA.w !mw_tmp                  ; layer 0's data
	LDA.w #$2000
	JSR mt_layer
	LDA.w !mw_tmp
	CLC : ADC.w #2*(32+3)*!MT_VIEW_ROWS
	STA.w !mw_tmp
	LDA.w #$2800
	JSR mt_layer
	LDA.w !mw_tmp                  ; both again at $5000 / $3800 (the ruin's; the
	                               ; game's own HUD writes reach $5B4D)
	SEC : SBC.w #2*(32+3)*!MT_VIEW_ROWS
	STA.w !mw_tmp
	LDA.w #$5000
	JSR mt_layer
	LDA.w !mw_tmp
	CLC : ADC.w #2*(32+3)*!MT_VIEW_ROWS
	STA.w !mw_tmp
	LDA.w #$3800
	JSR mt_layer
	SEP #$20
	LDA.b #3
	STA.l !orbit_mcut
	REP #$20
	RTS

mt_load3:
	; BG3: the laser's map (every entry the solid tile), the caption's (every
	; entry transparent, then the town's message in rows 1-8 from column 1),
	; the two tiles at $17E-$17F
	LDA.w #orbit_mt_fill>>16
	STA.w !mw_dbank
	LDA.w #$3400
	LDX.w #orbit_mt_fill
	JSR mt_fill
	LDA.w #$3000
	LDX.w #orbit_mt_fill+2
	JSR mt_fill
	LDA.w #$1801
	STA.w !mw_dmap
	LDA.w #$0080
	STA.w !mw_vmain
	LDA.w #orbit_text_maps>>16
	STA.w !mw_dbank
	LDA.w !mw_town                 ; message TOWN1 + town (from 1): 480 bytes each
	CLC : ADC.w #!OTXT_TOWN1-1
	STA.w !mw_tmp
	XBA
	ASL                            ; n * 512
	STA.w !mw_tmp+2
	LDA.w !mw_tmp
	ASL : ASL : ASL : ASL : ASL    ; n * 32
	EOR.w #$FFFF
	SEC : ADC.w !mw_tmp+2          ; n * 480
	CLC : ADC.w #orbit_text_maps
	STA.w !mw_tmp+4
	LDA.w #$3021                   ; row 1, column 1
	STA.w !mw_tmp+6
	LDA.w #8
	STA.w !mw_tmp+8
-	LDA.w !mw_tmp+6
	LDX.w !mw_tmp+4
	LDY.w #60
	JSR mt_vdma
	LDA.w !mw_tmp+4
	CLC : ADC.w #60
	STA.w !mw_tmp+4
	LDA.w !mw_tmp+6
	CLC : ADC.w #32
	STA.w !mw_tmp+6
	DEC.w !mw_tmp+8
	BNE -
	LDA.w #orbit_mt_bg3tiles>>16
	STA.w !mw_dbank
	LDA.w #$4000+($17E*8)
	LDX.w #orbit_mt_bg3tiles
	LDY.w #32
	JSR mt_vdma
	; OBJ: the town's cells (fragments at $160, its rabite at $040), the
	; embers ($000-$01B), the ring's dot ($170), the people's poses
	LDA.w !mw_town
	ASL : ASL : ASL
	TAX
	LDA.l orbit_mt_cells_at+2,X
	STA.w !mw_dbank
	LDA.l orbit_mt_cells_at,X
	STA.w !mw_tmp
	LDA.l orbit_mt_cells_at+4,X
	STA.w !mw_tmp+2                ; bytes: 512, or 1536 with the rabite
	LDA.w #$6000+(!MT_FRAG_T*16)
	LDX.w !mw_tmp
	LDY.w #512
	JSR mt_vdma
	LDA.w !mw_tmp+2
	CMP.w #513
	BCC +
	LDA.w !mw_tmp
	CLC : ADC.w #512
	TAX
	LDA.w #$6000+(!MT_RABITE_T*16)
	LDY.w #1024
	JSR mt_vdma
+	LDA.w #(!XDATA_ORBIT_MT_EMBERS)>>16
	STA.w !mw_dbank
	LDA.w #$6000+(!MT_EMBER_T*16)  ; tiles $000-$00B, $010-$01B (six cells)
	LDX.w #(!XDATA_ORBIT_MT_EMBERS)&$FFFF
	LDY.w #384
	JSR mt_vdma
	LDA.w #$6000+(!MT_EMBER_T*16)+$100
	LDX.w #((!XDATA_ORBIT_MT_EMBERS)&$FFFF)+384
	LDY.w #384
	JSR mt_vdma
	LDA.w #orbit_mt_dot>>16
	STA.w !mw_dbank
	LDA.w #$6000+(!MT_RING_T*16)
	LDX.w #orbit_mt_dot
	LDY.w #32
	JSR mt_vdma
	LDY.w #$0000
-	CPY.w #6
	BCS +
	PHY
	JSR mt_person_cells
	PLY
	INY : INY
	BRA -
+	; the picture: the field's brightness back from this vblank
	SEP #$20
	LDA.l !orbit_me6
	STA.w $00E6
	LDA.b #$00
	STA.l !orbit_mcut
	REP #$20
	RTS
; A16 = a layer's map base: its 28 rows of screen 0, columns 32, 33, 63.
mt_layer:
	STA.w !mw_tmp+2
	LDA.w #$1801
	STA.w !mw_dmap
	LDA.w #$0080
	STA.w !mw_vmain
	LDA.w !mw_tmp+2
	LDX.w !mw_tmp
	LDY.w #2*32*!MT_VIEW_ROWS
	JSR mt_vdma
	LDA.w #$0081                   ; columns: increments of 32 words
	STA.w !mw_vmain
	LDA.w !mw_tmp                  ; column 32 (screen 1's first)
	CLC : ADC.w #2*32*!MT_VIEW_ROWS
	TAX
	LDA.w !mw_tmp+2
	CLC : ADC.w #$0400
	LDY.w #2*!MT_VIEW_ROWS
	JSR mt_vdma
	LDA.w !mw_tmp                  ; column 33
	CLC : ADC.w #2*33*!MT_VIEW_ROWS
	TAX
	LDA.w !mw_tmp+2
	CLC : ADC.w #$0401
	LDY.w #2*!MT_VIEW_ROWS
	JSR mt_vdma
	LDA.w !mw_tmp                  ; column 63 (left of column 0)
	CLC : ADC.w #2*34*!MT_VIEW_ROWS
	TAX
	LDA.w !mw_tmp+2
	CLC : ADC.w #$041F
	LDY.w #2*!MT_VIEW_ROWS
	JMP mt_vdma
; A 32x32 BG3 map at A16 filled with the entry whose two bytes are at X16
; (fixed-source DMAs: the low bytes, then the high bytes).
mt_fill:
	STA.w !mw_tmp+2
	STX.w !mw_tmp+4
	LDA.w #$1808                   ; fixed source, $2118 (low bytes)
	STA.w !mw_dmap
	LDA.w #$0000                   ; increment after the low byte
	STA.w !mw_vmain
	LDA.w !mw_tmp+2
	LDY.w #1024
	JSR mt_vdma
	LDA.w #$1908                   ; fixed source, $2119 (high bytes)
	STA.w !mw_dmap
	LDA.w #$0080
	STA.w !mw_vmain
	LDA.w !mw_tmp+4
	INC
	TAX
	LDA.w !mw_tmp+2
	LDY.w #1024
	JMP mt_vdma

; Person Y16 / 2: its due pose's 15 tiles (480 bytes) into the slot not
; shown (none due: nothing).
mt_person_cells:
	LDA.w !mw_pdue,Y
	CMP.w #$FFFF
	BNE +
	RTS
+	STA.w !mw_tmp+10
	LDA.w #$FFFF
	STA.w !mw_pdue,Y
	TYA                            ; slot A's words: $6000 + ($020 + 32 i) * 16
	XBA
	CLC : ADC.w #$6000+(!MT_PEOPLE_T*16)
	STA.w !mw_tmp+12
	LDA.w !mw_pf,Y
	BNE .a
	LDA.w !mw_tmp+10               ; (A shown: into B)
	STA.w !mw_pb,Y
	LDA.w !mw_tmp+12
	CLC : ADC.w #16*16
	STA.w !mw_tmp+12
	BRA .send
.a
	LDA.w !mw_tmp+10
	STA.w !mw_pa,Y
.send
	LDA.w !mw_tmp+10               ; the source: pose * 480
	ASL : ASL : ASL : ASL
	SEC : SBC.w !mw_tmp+10
	ASL : ASL : ASL : ASL : ASL
	CLC : ADC.w #(!XDATA_ORBIT_MT_PEOPLE)&$FFFF
	TAX
	LDA.w #(!XDATA_ORBIT_MT_PEOPLE)>>16
	STA.w !mw_dbank
	LDA.w #$1801
	STA.w !mw_dmap
	LDA.w #$0080
	STA.w !mw_vmain
	LDA.w !mw_tmp+12
	LDY.w #480
	JMP mt_vdma

; A town shown (vblank): Mode 1 with BG3 in front, the maps and tiles, the
; scroll (the pan and shake; every BG one line up, as the sprites), OBJ
; 8x8 / 16x16, the laser's windows and colour math or the caption, TM again
; at line 196 (after the field IRQ's HUD split), the people's due cells (by
; vblank room), the ruin into the maps' second copy (shown from the hit).
mt_town_nmi:
	SEP #$20
	LDA.b #$09
	STA.w $2105
	LDX.w !mw_dt
	BPL +
	LDA.b #$21                     ; BG1 map $2000, BG2 $2800, 64x32 ...
	STA.w $2107
	LDA.b #$29
	STA.w $2108
	BRA ++
+	LDA.b #$51                     ; ... or the ruined copies at $5000 / $3800
	STA.w $2107
	LDA.b #$39
	STA.w $2108
++
	LDA.b #$30                     ; BG3 map: the caption's ($3000) ...
	LDX.w !mw_laser
	BEQ +
	LDA.b #$34                     ; ... or the laser's ($3400)
+	STA.w $2109
	STZ.w $210B                    ; BG1 / BG2 tiles $0000
	LDA.b #$04                     ; BG3 tiles $4000
	STA.w $210C
	; (the scroll registers share one write latch: each one's two writes
	; back to back)
	REP #$20
	LDA.w !mw_pan
	SEC : SBC.w !mw_shake
	SEP #$20
	STA.w $210D
	XBA
	STA.w $210D
	XBA
	STA.w $210F
	XBA
	STA.w $210F
	LDA.b #$FF                     ; VOFS -1
	STA.w $210E
	LDA.b #$03
	STA.w $210E
	LDA.b #$FF
	STA.w $2110
	LDA.b #$03
	STA.w $2110
	STZ.w $2111
	STZ.w $2111
	STA.w $2112                    ; BG3 VOFS 3: the caption's row 8 on line 4
	STZ.w $2112
	LDA.b #$03                     ; OBJ 8x8 / 16x16, tiles $6000
	STA.w $2101
	STZ.w $212D
	; TM: BG3 for the laser, or for the caption after dt 30
	LDX.w !mw_laser
	BNE .bg3
	REP #$20
	LDA.w !mw_dt
	SEC : SBC.w #31
	SEP #$20
	BPL .bg3
	LDA.b #!MT_TM_TOWN
	BRA .tm
.bg3
	LDA.b #!MT_TM_TOWN|$04
.tm
	STA.w $212C
	STA.w !mw_tmtab+1
	STA.w !mw_tmtab+3
	STA.w !mw_tmtab+5
	LDA.b #127
	STA.w !mw_tmtab+0
	LDA.b #196-127
	STA.w !mw_tmtab+2
	LDA.b #1
	STA.w !mw_tmtab+4
	STZ.w !mw_tmtab+6
	; the laser: BG3 inside W1, colour math (+ (6, 25, 4) on the purple: the
	; core's (31, 30, 31)) inside W2
	LDX.w !mw_laser
	BEQ .noLaser
	LDA.b #$04
	STA.w $212E
	STZ.w $2123
	LDA.b #$03                     ; BG3: W1 enabled, inverted (masked outside)
	STA.w $2124
	LDA.b #$80                     ; colour window: W2
	STA.w $2125
	STZ.w $212A
	STZ.w $212B
	LDA.b #$10                     ; colour math inside the colour window
	STA.w $2130
	LDA.b #$04                     ; add, BG3
	STA.w $2131
	LDA.b #$20|6
	STA.w $2132
	LDA.b #$40|25
	STA.w $2132
	LDA.b #$80|4
	STA.w $2132
	BRA .hdma
.noLaser
	STZ.w $212E
	STZ.w $2124
	STZ.w $2125
	STZ.w $2131
.hdma
	; HDMA: channel 2 TM (mode 0), channel 6 the laser's windows (mode 4)
	REP #$20
	LDA.w #$2C00
	STA.w $4320
	LDA.w #!mw_tmtab
	STA.w $4322
	SEP #$20
	LDA.b #$32
	STA.w $4324
	LDA.w !N_HDMA
	AND.b #~!ORBIT_HDMA
	ORA.b #$04
	LDX.w !mw_laser
	BEQ +
	ORA.b #$40
+	STA.w !N_HDMA
	REP #$20
	LDA.w !mw_laser
	BEQ +
	LDA.w !mw_wset
	STA.w !mw_wshow
	LDA.w #$2644                   ; indirect, mode 4: $2126-$2129
	STA.w $4360
	LDA.w #!MW_WIN0
	LDX.w !mw_wshow
	BEQ ++
	LDA.w #!MW_WIN1
++	STA.w $4362
	SEP #$20
	LDA.b #$32
	STA.w $4364
	LDA.w !mw_lbank                ; the rows' bank
	STA.w $4367
	REP #$20
+	; the people's due cells, while the vblank has room
	LDY.w #$0000
-	CPY.w #6
	BCS +
	LDA.w !mw_pdue,Y
	CMP.w #$FFFF
	BEQ ++
	LDA.w #4+!MT_NMI_SLACK
	JSL orbit_nmi_room_far
	BCS +
	PHY
	JSR mt_person_cells
	PLY
++	INY : INY
	BRA -
+	; the ruin (from the hit on, over a few vblanks)
	LDA.w !mw_ruin
	BEQ +
	CMP.w #2
	BEQ +
	JSR mt_ruin
+	RTS

; The town's ruin overlay (cinematic-ruins.js) into the maps' second copy
; ($5000 / $3800): each changed block's BG1 and BG2 entries, 8 blocks at a
; time while the vblank has room (!mw_ruin 1: due, 3: under way, 2: done).
mt_ruin:
	LDA.w !mw_ruin
	CMP.w #1
	BNE .on
	LDA.w !mw_town                 ; the first: the town's table
	ASL
	TAX
	LDA.l orbit_mt_ruin_at,X
	TAX
	LDA.l !MTT,X
	STA.w !mw_rleft                ; blocks
	INX : INX
	STX.w !mw_rnext
	LDA.w #3
	STA.w !mw_ruin
.on
	SEP #$20
	LDA.b #$80
	STA.w $2115
	REP #$20
.chunk
	LDA.w !mw_rleft
	BEQ .done
	LDA.w #4+!MT_NMI_SLACK
	JSL orbit_nmi_room_far
	BCS .out
	LDA.w #8                       ; (8 blocks: about 3.6 lines)
	STA.w !mw_tmp
	LDX.w !mw_rnext
.block
	LDA.l !MTT,X                   ; the entry's word in a map
	TAY
	CLC : ADC.w #$5000
	STA.w $2116
	LDA.l !MTT+2,X
	STA.w $2118
	TYA
	CLC : ADC.w #$3800
	STA.w $2116
	LDA.l !MTT+4,X
	STA.w $2118
	TXA
	CLC : ADC.w #6
	TAX
	DEC.w !mw_rleft
	BEQ +
	DEC.w !mw_tmp
	BNE .block
+	STX.w !mw_rnext
	BRA .chunk
.done
	LDA.w #2
	STA.w !mw_ruin
.out
	RTS

; ---------------------------------------------------------------------------
; The palette (orbit_cgram_upload while a montage picture is up, at the
; game's own transfer): the town's colours, the game's where it has none.
; JSL, DB = $32, M16/X16; returns carry set (sent).
montage_cgram:
	PHP
	REP #$30
	LDA.w #$2200                   ; A->B, one register: CGDATA
	STA.w !mw_dmap
	LDA.w #(!MTT)>>16              ; (the generated palettes' bank)
	STA.w !mw_dbank
	; 0: the backdrop (black, or under the tint), then the map's palettes
	LDA.w !mw_town
	ASL
	TAX
	LDA.w !mw_red
	BEQ .plain
	CMP.w #5
	BEQ +
	LDA.l orbit_mt_red2_at,X
	BRA ++
+	LDA.l orbit_mt_red5_at,X
++	CLC : ADC.w #(!MTT)&$FFFF      ; the tinted set: backdrop, palettes 1-7
	STA.w !mw_tmp
	TAX
	LDA.w #0
	LDY.w #2
	JSR mt_cgdma
	LDA.w !mw_tmp
	INC : INC
	TAX
	BRA .palettes
.plain
	LDA.w #orbit_mt_zero>>16
	STA.w !mw_dbank
	LDA.w #0
	LDX.w #orbit_mt_zero
	LDY.w #2
	JSR mt_cgdma
	LDA.w #(!MTT)>>16
	STA.w !mw_dbank
	LDA.w !mw_town
	ASL
	TAX
	LDA.l orbit_mt_pal_at,X
	CLC : ADC.w #(!MTT)&$FFFF
	TAX
.palettes
	; 16-127: the map's palettes 1-7
	LDA.w #16
	LDY.w #2*112
	JSR mt_cgdma
	; 1-3: the game's; 4-11: the caption's palettes; 12-15: the laser's
	LDA.w #2
	LDY.w #6
	JSL core_cgram_native
	LDA.w #orbit_text_pal>>16
	STA.w !mw_dbank
	LDA.w #4
	LDX.w #orbit_text_pal
	LDY.w #16
	JSR mt_cgdma
	LDA.w #orbit_mt_laserpal>>16
	STA.w !mw_dbank
	LDA.w #12
	LDX.w #orbit_mt_laserpal
	LDY.w #8
	JSR mt_cgdma
	; OBJ 0: fire; 1-3: the people (or 3: the rabite); 4: the fragments;
	; 5: the ring and the embers; 6-7: the game's
	LDA.w #orbit_obj_pals_01>>16
	STA.w !mw_dbank
	LDA.w #128
	LDX.w #orbit_obj_pals_01
	LDY.w #32
	JSR mt_cgdma
	LDA.w #(!MTT)>>16
	STA.w !mw_dbank
	LDA.w #144
	LDX.w #(!MTT_OBJPAL)&$FFFF
	LDY.w #96
	JSR mt_cgdma
	LDA.w !mw_town
	JSR mt_town_entry
	LDA.l orbit_mt_towns+10,X      ; the rabite's palette over 3
	BEQ +
	LDA.w #176
	LDX.w #(!MTT_RABPAL)&$FFFF
	LDY.w #32
	JSR mt_cgdma
+	LDA.w !mw_town
	ASL
	TAX
	LDA.l orbit_mt_fragpal_at,X
	CLC : ADC.w #(!MTT)&$FFFF
	TAX
	LDA.w #192
	LDY.w #32
	JSR mt_cgdma
	LDA.w #208
	LDX.w #(!MTT_RINGPAL)&$FFFF
	LDY.w #32
	JSR mt_cgdma
	LDA.w #2*224
	LDY.w #64
	JSL core_cgram_native
	PLP
	SEC
	RTL

; CGRAM from A16 (colour index), X16 = source, Y16 = bytes, bank
; !mw_dbank: one DMA on channel 7.
mt_cgdma:
	SEP #$20
	STA.w $2121
	REP #$20
	STX.w $4372
	STY.w $4375
	LDA.w !mw_dmap
	STA.w $4370
	SEP #$20
	LDA.w !mw_dbank
	STA.w $4374
	LDA.b #$80
	STA.w $420B
	REP #$20
	RTS
