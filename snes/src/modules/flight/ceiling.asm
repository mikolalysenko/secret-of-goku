; Ceiling escape (ceiling-escape.js, ceiling-exits.js, requestFlight() in
; mana-mod.js). L+R where world flight cannot start (indoors, caves,
; palaces) punches through the roof: a 68-frame punch-and-rise pose (goku
; mode $25), roof chunks and sparks in the room's own colours at the impact
; (age 22, with a quake, 'impact' and 'flight'), then the room's exterior door
; loads (story_api_travel) and world flight starts from there with Goku
; already above the roof (pose age 80). 253 rooms on 35 exterior routes
; (fl_roof_route / fl_roof_exit). Live bosses (species 87-127), native
; dialogue, a running escape, a teleport's camera follow or a pending takeoff
; keep the lock. The escape gives up after 600 frames in one phase.

; --- L+R (requestFlight) ---------------------------------------------------
; Called on the L+R chord's first frame while Goku can act. Carry set when a
; takeoff or an escape started (the frame's other input work is skipped).
fl_ce_lr:
	LDA.l !fl_ce_phase
	BNE .no                      ; ceiling.busy
	JSR fl_ce_boss
	BCS .no                      ; ceiling.bossActive
	; taking off from an unfinished Sandship blows it up instead
	JSR fl_bind_ship_takeoff
	BCC +
	SEC
	RTS
+	JSR fl_bind_cancel           ; cancelCombat()
	; flight.request(): world flight from this map (the world module serves
	; the chord itself when it is in the build)
	JSR fl_bind_world_allowed
	BCS .ceiling
	JSR fl_bind_world_lr         ; without the world module: the native request
	BCS .no
	SEC
	RTS
.ceiling
	JSR fl_ce_request
	RTS
.no
	CLC
	RTS

; ceiling.request(): safe() and an exterior route for this room.
fl_ce_request:
	LDA.w !fl_hook
	AND.w #!FLH_CAMERA
	BNE .no                      ; teleport.pending
	LDA.w !core_event_req&$FFFF
	BNE .no                      ; flight.pending (a queued takeoff)
	LDA $DC
	CMP.w #512
	BCS .no
	TAX
	LDA.l fl_roof_route,X
	AND.w #$00FF
	BEQ .no
	DEC
	ASL
	ASL
	TAX
	LDA.l fl_roof_exit,X
	STA.l !fl_ce_map
	LDA.l fl_roof_exit+2,X
	STA.l !fl_ce_door
	LDA $DC
	STA.l !fl_ce_src
	LDA $E002
	STA.l !fl_ce_x
	LDA $E004
	SEC
	SBC.w #56
	STA.l !fl_ce_y
	LDA.w #$0000
	STA.l !fl_ce_age
	LDA.w #$0001
	STA.l !fl_ce_phase           ; punch
	JSR fl_land_now
	LDA.w #!FL_SFX_SWING
	JSR fl_bind_sfx
	SEC
	RTS
.no
	CLC
	RTS

; bossActive(): a live foe of species 87-127 in actor slots 3-11, or a
; scene's custom one (Frieza, Vegeta). Carry set when one is present.
fl_ce_boss:
	; Vegeta's trial (trial.active) counts whatever his species
	LDA.l !fl_tp_custom
	AND.w #$00FF
	CMP.w #3
	BEQ .yes
	LDX.w #3
.slot
	PHX
	JSR fl_tp_entity             ; X = slot: active, species < $80, HP, alive
	PLX
	BCC .next
	LDA.l !fl_tp_e_species
	CMP.w #87
	BCS .yes
.next
	INX
	CPX.w #13
	BCC .slot
	CLC
	RTS
.yes
	SEC
	RTS

; --- tick() ------------------------------------------------------------------
; Start of the frame's input work. Carry set while an escape runs: localFlight
; and the lift are off and nothing else reads the pad this frame.
fl_ce_tick:
	LDA.l !fl_ce_phase
	BNE +
	CLC
	RTS
+	LDA.l !fl_ce_age
	INC
	STA.l !fl_ce_age
	; the pad belongs to the escape, except while the native scene of the
	; exterior owns it (exit and takeoff phases)
	LDA.l !fl_ce_phase
	CMP.w #1
	BEQ .mask
	LDA.w !fl_state
	AND.w #!FLS_CAN
	BEQ .phase
.mask
	LDA.w !core_pad_mask&$FFFF
	ORA.w #$FFF0
	STA.w !core_pad_mask&$FFFF
.phase
	LDA.l !fl_ce_phase
	CMP.w #1
	BEQ .punch
	CMP.w #2
	BEQ .exit
	; 3: takeoff requested; retry when it did not start (an exterior walk-on
	; event can take control between the request and its start)
	LDA.w !fl_state
	AND.w #!FLS_CAN
	BEQ .timeout
	LDA.w !core_event_req&$FFFF
	BNE .timeout
	JSR fl_bind_world_takeoff
	BRA .timeout
.exit
	LDA $DC
	CMP.l !fl_ce_map
	BNE .timeout
	LDA.w !fl_state
	AND.w #!FLS_CAN
	BEQ .timeout
	JSR fl_bind_world_takeoff
	BCS .timeout
	LDA.w #3
	BRA .next
.punch
	LDA $DC
	CMP.l !fl_ce_src
	BNE .cancel                  ; the native scene took over
	LDA.w !fl_state
	AND.w #!FLS_CAN
	BEQ .cancel
	LDA.l !fl_ce_age
	CMP.w #22
	BNE +
	JSR fl_ce_impact
	LDA.l !fl_ce_age
+	CMP.w #68
	BCC .timeout
	LDA.l !fl_ce_door
	JSR fl_bind_travel           ; the exterior's door (story.travel)
	BCC .timeout
	LDA.w #2
.next
	STA.l !fl_ce_phase
	LDA.w #$0000
	STA.l !fl_ce_age
.timeout
	LDA.l !fl_ce_age
	CMP.w #601
	BCS .cancel
	JSR fl_land_now
	SEC
	RTS
.cancel
	JSR fl_ce_cancel
	CLC
	RTS

fl_ce_cancel:
	LDA.w #$0000
	STA.l !fl_ce_phase
	JSR fl_bind_fx_clear         ; feedback.clear(): quake and particles
	RTS

; The punch reaches the roof: chunks and sparks in the room's colours above
; Goku, a 24-frame quake, 'impact' and 'flight'.
fl_ce_impact:
	JSR fl_ce_colors             ; fl_t0 = stone, fl_t1 = highlight
	LDA.l !fl_ce_x
	TAX
	LDA.l !fl_ce_y
	TAY
	JSR fl_bind_fx_ceiling
	LDA.w #!FL_SFX_IMPACT
	JSR fl_bind_sfx
	LDA.w #!FL_SFX_FLIGHT
	JSR fl_bind_sfx
	RTS

; roofColors(): the unique colours of CGRAM 0-127 that look like stone or
; timber (lightness 19-74; grey within 8, or warm r >= g >= b with steps
; under 12), sorted by lightness (ties in palette order): the one at 40%
; (stone, default $294A) and at 80% (highlight, default $4631). Read from the
; palette the field NMI uploads ($7E:0600, $7E:BE00 while $2A is set). The
; tile cache's SRAM is the scratch (a hash of the colours seen, a count per
; lightness, each colour's lightness or $FF); the cache is cleared after.
; Out: fl_t0, fl_t1. About 8,000 instructions, once, at the impact.
!CE_HASH  = !fl_cache            ; 128 words
!CE_COUNT = !fl_cache+$100       ; 56 bytes: lightness 19-74
!CE_LIGHT = !fl_cache+$140       ; 128 bytes: lightness - 19 of a kept new colour, else $FF
fl_ce_colors:
	JSR fl_ce_hash_clear
	LDX.w #54
	LDA.w #$0000
-	STA.l !CE_COUNT,X
	DEX : DEX
	BPL -
	STZ.w !fl_t6                 ; unique colours kept
	LDA $2A
	AND.w #$00FF
	BEQ +
	LDA.w #$BE00-$0600
+	STA.w !fl_t3                 ; palette mirror offset
	LDY.w #$0000
.a
	JSR fl_ce_color_y            ; A = colour, fl_t2 = lightness - 19; C = kept
	BCC .skip
	JSR fl_ce_hash_add
	BCS .skip                    ; seen before
	LDX.w !fl_t2
	SEP #$20
	LDA.l !CE_COUNT,X
	INC
	STA.l !CE_COUNT,X
	REP #$20
	TYA
	LSR
	TAX
	SEP #$20
	LDA.w !fl_t2
	STA.l !CE_LIGHT,X
	REP #$20
	INC.w !fl_t6
	BRA .anext
.skip
	TYA
	LSR
	TAX
	SEP #$20
	LDA.b #$FF
	STA.l !CE_LIGHT,X
	REP #$20
.anext
	INY : INY
	CPY.w #256
	BCC .a
	; ranks floor(n*.4) and floor(n*.8) (= floor(2n/5), floor(4n/5))
	LDA.w #$294A
	STA.w !fl_t0
	LDA.w #$4631
	STA.w !fl_t1
	LDA.w !fl_t6
	BEQ .done
	ASL
	JSR fl_ce_div5
	JSR fl_ce_bucket
	STA.w !fl_t4                 ; (place << 8) | lightness - 19 of rank k1
	LDA.w !fl_t6
	ASL
	ASL
	JSR fl_ce_div5
	JSR fl_ce_bucket
	STA.w !fl_t5                 ; the same for k2
	; second pass in palette order over the kept colours of those two
	; lightnesses, counting down to the wanted places
	LDX.w #$0000
	SEP #$20
.b
	LDA.l !CE_LIGHT,X
	CMP.w !fl_t4
	BNE .k2
	LDA.w !fl_t4+1
	BNE .dec1
	JSR fl_ce_pick
	STA.w !fl_t0                 ; stone
	SEP #$20
.dec1
	DEC.w !fl_t4+1               ; ($FF once found: never 0 again)
	LDA.l !CE_LIGHT,X
.k2
	CMP.w !fl_t5
	BNE .bnext
	LDA.w !fl_t5+1
	BNE .dec2
	JSR fl_ce_pick
	STA.w !fl_t1                 ; highlight
	SEP #$20
.dec2
	DEC.w !fl_t5+1
.bnext
	INX
	CPX.w #128
	BCC .b
	REP #$20
.done
	JSR fl_cache_clear
	RTS
; X = colour index (M8 in) -> A16 = that colour (M16 out)
fl_ce_pick:
	REP #$20
	TXA
	ASL
	CLC
	ADC.w !fl_t3
	TAY
	LDA $0600,Y
	AND.w #$7FFF
	RTS

; Y = byte offset of colour i, fl_t3 = palette mirror offset. A = fl_t5 =
; colour (15 bits), fl_t2 = lightness - 19; carry set when it passes the
; stone/timber filter. Uses fl_t7 and the stack; preserves Y.
fl_ce_color_y:
	PHY
	TYA
	CLC
	ADC.w !fl_t3
	TAY
	LDA $0600,Y
	PLY
	AND.w #$7FFF
	STA.w !fl_t5
	XBA
	LSR : LSR
	AND.w #$001F
	PHA                          ; [b]
	LDA.w !fl_t5
	ASL : ASL : ASL
	XBA
	AND.w #$001F
	PHA                          ; [g][b]
	LDA.w !fl_t5
	AND.w #$001F
	STA.w !fl_t7                 ; r
	CLC
	ADC $01,S
	CLC
	ADC $03,S
	SEC
	SBC.w #19
	CMP.w #56                    ; lightness 19-74
	BCS .fail
	STA.w !fl_t2
	; grey: max - min <= 8, i.e. every pair within 8
	LDA.w !fl_t7
	SEC
	SBC $01,S
	BPL +
	EOR.w #$FFFF
	INC
+	CMP.w #9
	BCS .warm
	LDA $01,S
	SEC
	SBC $03,S
	BPL +
	EOR.w #$FFFF
	INC
+	CMP.w #9
	BCS .warm
	LDA.w !fl_t7
	SEC
	SBC $03,S
	BPL +
	EOR.w #$FFFF
	INC
+	CMP.w #9
	BCC .keep
.warm
	; warm: r >= g >= b, r - g < 12, g - b < 12
	LDA.w !fl_t7
	SEC
	SBC $01,S
	BCC .fail
	CMP.w #12
	BCS .fail
	LDA $01,S
	SEC
	SBC $03,S
	BCC .fail
	CMP.w #12
	BCS .fail
.keep
	PLA
	PLA
	LDA.w !fl_t5
	SEC
	RTS
.fail
	PLA
	PLA
	CLC
	RTS

fl_ce_hash_clear:
	LDX.w #254
	LDA.w #$FFFF
-	STA.l !CE_HASH,X
	DEX : DEX
	BPL -
	RTS
; A = colour: carry set if it was already in the set, else it is added.
; Preserves Y.
fl_ce_hash_add:
	STA.w !fl_t7
	XBA
	EOR.w !fl_t7
	ASL
	AND.w #$00FE                 ; slot (word offset)
	TAX
.probe
	LDA.l !CE_HASH,X
	CMP.w #$FFFF
	BEQ .add
	CMP.w !fl_t7
	BEQ .seen
	TXA
	INC : INC
	AND.w #$00FE
	TAX
	BRA .probe
.add
	LDA.w !fl_t7
	STA.l !CE_HASH,X
	CLC
	RTS
.seen
	SEC
	RTS

; A = rank: A = (place within its lightness << 8) | lightness - 19.
fl_ce_bucket:
	STA.w !fl_t7
	LDX.w #$0000
.scan
	LDA.l !CE_COUNT,X
	AND.w #$00FF
	CMP.w !fl_t7
	BEQ .over                    ; count == rank left: next bucket
	BCS .here                    ; rank falls inside this bucket
.over
	EOR.w #$FFFF
	SEC
	ADC.w !fl_t7
	STA.w !fl_t7                 ; rank - count
	INX
	CPX.w #56
	BCC .scan
	LDA.w #$FFFF                 ; (unreachable: rank < n)
	RTS
.here
	LDA.w !fl_t7
	XBA
	STX.w !fl_t7
	ORA.w !fl_t7
	RTS

; A = n -> A = floor(n / 5) (hardware divider)
fl_ce_div5:
	STA.l $004204
	SEP #$20
	LDA.b #5
	STA.l $004206
	REP #$20
	NOP : NOP : NOP : NOP : NOP : NOP : NOP : NOP
	LDA.l $004214
	RTS

; --- pose ----------------------------------------------------------------------
; Goku's ceiling pose (goku mode $25): the punch age, then 80 (above the
; roof) until world flight takes over. Called from fl_publish.
fl_ce_pose:
	LDA.l !fl_ce_phase
	BEQ .none
	SEP #$20
	LDA.b #!GOKU_K_CEILING
	STA.l $7E0000|!goku_mode
	LDA.l $7E0000|!goku_ctl
	ORA.b #!GOKU_CTL_AIRBORNE
	STA.l $7E0000|!goku_ctl
	REP #$20
	LDA.l !fl_ce_phase
	CMP.w #1
	BNE +
	LDA.l !fl_ce_age
	BRA ++
+	LDA.w #80
++	STA.l $7E0000|!goku_mode_age
	RTS
.none
	LDA.l $7E0000|!goku_mode
	AND.w #$00FF
	CMP.w #!GOKU_K_CEILING
	BNE +
	SEP #$20
	LDA.b #$00
	STA.l $7E0000|!goku_mode     ; only the mode flight set
	REP #$20
+	RTS

; --- world flight frame ----------------------------------------------------------
; modules_world_frame: the escape completes once world flight runs (King
; Kai's remark through ui_ceiling_escape); an earlier phase keeps aging and
; times out as in the browser.
flight_world_frame:
	PHP
	REP #$30
	LDA.l !fl_ce_phase
	BEQ .out
	CMP.w #3
	BEQ .done
	LDA.l !fl_ce_age
	INC
	STA.l !fl_ce_age
	CMP.w #601
	BCC .out
	LDA.w #$0000
	STA.l !fl_ce_phase
	BRA .out
.done
	LDA.w #$0000
	STA.l !fl_ce_phase
	SEP #$20
	LDA.l $7E0000|!goku_mode
	CMP.b #!GOKU_K_CEILING
	BNE +
	LDA.b #$00
	STA.l $7E0000|!goku_mode
+	REP #$20
	LDA.l !fl_ce_src
	JSR fl_bind_ui_ceiling       ; radio.escapedCeiling(source)
.out
	PLP
	RTL
