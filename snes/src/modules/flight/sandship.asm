; The Sandship's flight-side rules (sandship.js): flight passes over every
; wall on the ship and in the dunes after it (openAir, set with the map
; context); hovering over a ship door for three frames takes it through the
; story's flight-door event 07A (the door answers the SANDSHIP_DOOR query),
; once Goku has been off every door since entering the room; a Goku stuck
; inside a breached wall for eight frames lifts into a hover. The wreck, the
; crash and the roof takeoff's explosion belong to the Sandship runtime
; (no owner yet; `!SANDSHIP_TAKEOFF` hooks the takeoff in fl_ce_lr).

; Ship maps (sandship-wreck.js shipMaps) and the dunes (91). Carry set when
; A16 = map is one of them; with fl_t7 = 1 for a ship map, 0 for the dunes.
; fl_ctx_load keeps the answer in !fl_open_air (1 ship, 2 dunes, 0 none).
fl_ship_map:
	LDX.w #0
-	CMP.l .maps,X
	BEQ .ship
	INX : INX
	CPX.w #16
	BCC -
	CMP.w #91
	BEQ .dunes
	CLC
	RTS
.ship
	LDA.w #1
	STA.w !fl_t7
	SEC
	RTS
.dunes
	STZ.w !fl_t7
	SEC
	RTS
.maps
	dw 98, 99, 270, 271, 318, 319, 324, 339

; The ship's per-frame rules, at the start of the frame's input work (the
; browser's sandship.tick()). M16/X16, DB = $7E.
fl_ship_tick:
	LDA.w !fl_state
	AND.w #!FLS_CAN
	BNE +
	SEP #$20
	LDA.b #$00
	STA.l !fl_sd_embedded        ; unstick(): only while Goku can act
	REP #$20
	RTS
+	LDA.w !fl_open_air           ; the current map's context (Goku can act)
	CMP.w #1
	BEQ +
	RTS                          ; not on the ship (the dunes: open air only)
+	; --- flyThroughDoor() ---
	LDA $DC
	CMP.l !fl_sd_room
	BEQ +
	STA.l !fl_sd_room
	SEP #$20
	LDA.b #$00
	STA.l !fl_sd_clear           ; must leave the arrival door first
	REP #$20
+	LDA.w !fl_state
	AND.w #!FLS_CAN
	BEQ .nodoor                  ; not ready
	LDA $D0
	AND.w #$00FF
	BNE .nodoor
	JSR fl_ship_door_under       ; carry set: A = door, X = key (idx)
	BCS .under
	SEP #$20
	LDA.b #$01
	STA.l !fl_sd_clear
	REP #$20
	BRA .nodoor
.under
	STA.w !fl_t6
	LDA.w !fl_state
	AND.w #!FLS_FLY
	BEQ .nodoor
	LDA.l !fl_sd_clear
	AND.w #$00FF
	BEQ .nodoor
	TXA
	CMP.l !fl_sd_last
	BEQ +
	STA.l !fl_sd_last
	SEP #$20
	LDA.b #$00
	STA.l !fl_sd_frames
	REP #$20
+	SEP #$20
	LDA.l !fl_sd_frames
	INC
	STA.l !fl_sd_frames
	CMP.b #3
	REP #$20
	BNE .unstick
	; through this door, as walking would (story event 07A, SANDSHIP_DOOR)
	LDA.w !fl_t6
	SEC
	SBC.w #$019F                 ; 1 + (door - $1A0)
	STA.l !fl_sd_door
	LDA.w #$007A
	LDX.w #$0000
	JSL story_api_request
	BRA .unstick
.nodoor
	LDA.w #$FFFF
	STA.l !fl_sd_last
	SEP #$20
	LDA.b #$00
	STA.l !fl_sd_frames
	REP #$20
.unstick
	; --- unstick(): standing where Goku cannot land for 8 frames lifts him
	LDA.w !fl_state
	AND.w #!FLS_CAN
	BEQ .ok
	LDA $D0
	AND.w #$00FF
	BNE .ok
	LDA.w !fl_state
	AND.w #!FLS_FLY
	BNE .ok
	JSR fl_hero_land
	BCS .ok
	SEP #$20
	LDA.l !fl_sd_embedded
	INC
	STA.l !fl_sd_embedded
	CMP.b #8
	REP #$20
	BCC .done
	SEP #$20
	LDA.b #!FLS_FLY
	TSB.w !fl_state              ; localFlight = true
	REP #$20
.ok
	SEP #$20
	LDA.b #$00
	STA.l !fl_sd_embedded
	REP #$20
.done
	RTS

; doorUnder(): the marker under Goku whose trigger is a ship door ($800 |
; $1A0-$1BF), as C0:D84C reads it. Carry set with A = door, X = the cell idx.
fl_ship_door_under:
	JSR fl_hero_tile
	BCS .no
	PHX
	JSR fl_fetch
	PLX
	LDA.w !fl_d_beh
	AND.w #$0080
	BEQ .no
	LDA $4D
	AND.w #$00FF
	STA.w !fl_t5
	LDA.w !fl_d_tile
	SEC
	SBC.w !fl_t5
	BCC .no
	STA.w !fl_t5
	LDA $B8
	AND.w #$0004
	BEQ +
	INC.w !fl_t5
+	ASL.w !fl_t5
	PHX
	LDA $DC
	ASL
	TAX
	LDA.l $C84000,X
	CLC
	ADC.w !fl_t5
	TAX
	LDA.l $C80000,X
	PLX
	SEC
	SBC.w #$0800
	CMP.w #$01A0
	BCC .no
	CMP.w #$01C0
	BCS .no
	SEC
	RTS
.no
	CLC
	RTS

; Story query SANDSHIP_DOOR: 0 none, 1 + i for door $1A0 + i (the door the
; flight-door event takes).
fl_story_ship_door:
	LDA.l !fl_sd_door
	RTL
