; Sandship runtime: engine/sandship.js createSandship (the state machine)
; and the object, door and song parts of engine/sandship-wreck.js.
;
; The KAMEHAMEHA breakout (a full-power wave fired below deck while captive,
; or Sergo's plan) whites out the screen, reloads Goku's own room through
; the escape door (1A9) as a wreck: fled guards and crew are hidden, desert
; monsters are added through the object loader view, the ship's song (25h)
; becomes the boss battle theme. Goku fetches each captive (entering the
; kitchen or cabin starts the rescue), then the deck starts Geshtar (77).
; Five broken bulkheads before stage 10, the roof takeoff, flying out past
; the hull or leaving the ship any unplanned way blow the ship up: the crash
; (event 7D) runs Geshtar's ambush into the Mech Rider. Leaving the dunes
; after the arc sets stage 14.
;
; Routines run with P = M16/X16 and DB = $7E unless noted. State lives in
; !SS (persistent) and !SSW (volatile); see module.asm.

; ---------------------------------------------------------------------------
; Small helpers
ss_set:                                   ; A = !SSF_* bits to set
	ORA.l !ss_flags : STA.l !ss_flags
	RTS
ss_clr:                                   ; A = !SSF_* bits to clear
	EOR.w #$FFFF : AND.l !ss_flags : STA.l !ss_flags
	RTS
ss_say:                                   ; A = !SS_SAY_* remark
	CMP.w #!SS_SAY_DISMISS : BEQ .dismiss
	STA.l !ssw_remark
	LDA.l !ssw_rseq : INC : STA.l !ssw_rseq
	RTS
.dismiss
	; radio.dismiss('sandship'): other lines (the escape's) stay
	LDA.l !ssw_dismiss : INC : STA.l !ssw_dismiss
	RTS

; ss_in_list: A = map, X = table (long label offset within bank) -> carry.
macro ss_member(name, table)
<name>:
	STA.l !ssw_tmp
	PHX
	LDX.w #0
-	LDA.l <table>,X : CMP.w #$FFFF : BEQ .no
	CMP.l !ssw_tmp : BEQ .yes
	INX : INX
	BRA -
.no
	PLX
	LDA.l !ssw_tmp
	CLC
	RTS
.yes
	PLX
	LDA.l !ssw_tmp
	SEC
	RTS
endmacro
%ss_member(ss_ship_map, ss_ship_maps)
%ss_member(ss_hold_map, ss_hold_maps)

; Captive (createSandship captive()): stage 1-6 in the hold, kitchen or
; engine room. Carry.
ss_captive:
	LDA.l $7ECF28 : AND.w #$00FF : BEQ .no
	CMP.w #7 : BCS .no
	LDA.w $00DC : JMP ss_hold_map
.no
	CLC
	RTS

; Captives still held (sandshipCaptives): bit 0 the girl (CF0D >= 8), bit 1
; the sprite (CF0E >= 8). A = bits.
ss_captives:
	LDA.w #0 : STA.l !ssw_tmp+2
	SEP #$20
	LDA.l $7ECF0D : CMP.b #8 : BCC +
	LDA.l !ssw_tmp+2 : ORA.b #1 : STA.l !ssw_tmp+2
+	LDA.l $7ECF0E : CMP.b #8 : BCC +
	LDA.l !ssw_tmp+2 : ORA.b #2 : STA.l !ssw_tmp+2
+	REP #$20
	LDA.l !ssw_tmp+2
	RTS

; canAttack (mana-mod.js): Goku active, native field vectors, the idle
; field of native-plants ground(). Carry.
ss_can_attack:
	LDA.l !persist_goku_active : AND.w #$00FF : BEQ .no
	LDA.l $000100 : CMP.w #$A85C : BNE .no
	LDA.l $000102 : CMP.w #$00C0 : BNE .no
	LDA.l $000104 : CMP.w #$CF5C : BNE .no
	LDA.l $000106 : CMP.w #$00C1 : BNE .no
	JMP dst_ground_ok
.no
	CLC
	RTS

; Flash ramps: !ss_flash = clamp(A * 256 / X, 0, 256) (A signed).
ss_ramp:
	BMI .zero
	PHA
	TXA : STA.l !ssw_tmp+4
	PLA
	CMP.l !ssw_tmp+4 : BCS .full
	XBA : AND.w #$FF00                    ; A * 256 (A < X <= 255)
	JSR dst_div16
	STA.l !ss_flash
	RTS
.full
	LDA.w #256 : STA.l !ss_flash
	RTS
.zero
	LDA.w #0 : STA.l !ss_flash
	RTS
; !ss_flash = max(0, 1 - A/45) (A >= 0)
ss_fade45:
	LDX.w #45 : JSR ss_ramp
	LDA.w #256 : SEC : SBC.l !ss_flash
	STA.l !ss_flash
	RTS

; ---------------------------------------------------------------------------
; Volatile state at boot, load and new game (the browser restores a fresh
; or saved state and its module-level trackers start over).
ss_reset_work:
	LDA.w #$FFFF : STA.l !ssw_lastmap : STA.l !ssw_beam : STA.l !ssw_doorkey : STA.l !ssw_doorroom
	LDA.w #0
	STA.l !ssw_doorf : STA.l !ssw_clear : STA.l !ssw_embed : STA.l !ssw_remark : STA.l !ssw_rseq
	STA.l !ssw_songs : STA.l !ssw_lastsong : STA.l !ssw_loads : STA.l !ssw_dismiss
	LDA.w #$FFFF : STA.l !ssw_dbgdoor
	RTS

; ---------------------------------------------------------------------------
; ss_frame (destroy_field_frame): createSandship tick().
ss_frame:
	LDA.l !persist_goku_active : AND.w #$00FF : BNE +
	RTS
+	LDA.l $7ECF28 : AND.w #$00FF : STA.l !ssw_stage
	; the wreck ages; stage 12 (after the Mech Rider) closes it
	LDA.l !ss_flags : AND.w #!SSF_WRECK : BEQ +
	LDA.l !ss_wage : INC : STA.l !ss_wage
	LDA.l !ssw_stage : CMP.w #12 : BCC +
	LDA.w #!SSF_WRECK|!SSF_BOSS|!SSF_CRASH : JSR ss_clr
+	JSR ss_leaving
	JSR ss_return_gear
	LDA.l !ss_cut : BEQ .free
	; Goku holds still while the screen is white
	LDA.w #$FFFF : ORA.w !core_pad_mask&$FFFF : STA.w !core_pad_mask&$FFFF
	LDA.l !ss_cbits : BIT.w #!SSC_FRESH : BEQ +
	AND.w #$FFFF^!SSC_FRESH : STA.l !ss_cbits   ; started in this frame's hit
	RTS
+	JMP ss_cut_tick
.free
	; the wave was offered: one hint when it is quiet
	LDA.l !ss_flags : AND.w #!SSF_ARMED|!SSF_HINTED : CMP.w #!SSF_ARMED : BNE +
	JSR ss_can_attack : BCC +
	LDA.w #!SSF_HINTED : JSR ss_set
	LDA.w #!SS_SAY_HINT : JSR ss_say
+	JSR ss_escaping
	JSR ss_rescues
	JSR ss_deck
	JSR ss_boss
	RTS

; ---------------------------------------------------------------------------
; leaving(): the dunes' exit after the arc, and unplanned ways off the ship.
ss_leaving:
	LDA.w $00DC : STA.l !ssw_tmp+8         ; now
	LDA.l !ssw_lastmap : STA.l !ssw_tmp+10 ; was
	LDA.l !ssw_tmp+8 : STA.l !ssw_lastmap
	LDA.l !ssw_tmp+10 : CMP.w #!SS_DUNES : BNE .ship
	LDA.l !ssw_tmp+8 : CMP.w #!SS_DUNES : BEQ .ship
	LDA.l !ssw_stage : CMP.w #12 : BCC .ship
	CMP.w #!SS_LEFT_DUNES : BCS .ship
	SEP #$20
	LDA.b #!SS_LEFT_DUNES : STA.l $7ECF28
	REP #$20
	LDA.w #!SS_SAY_DUNES : JMP ss_say
.ship
	LDA.l !ssw_tmp+10 : JSR ss_ship_map : BCC .done
	LDA.l !ssw_tmp+8 : JSR ss_ship_map : BCS .done
	CMP.w #!SS_ARENA : BEQ .done
	LDA.l !ss_cut : CMP.w #2 : BEQ .done
	LDA.l !ssw_stage : BEQ .done
	CMP.w #10 : BCS .done
	; off the ship by a route nobody planned: it blows up behind him
	LDA.w #!SSF_ESCAPED : JMP ss_set
.done
	RTS

; ---------------------------------------------------------------------------
; returnGear(): each member gets exactly the gear the capture stowed: Goku
; once the ship is wrecked (or the arc ends), a companion as soon as they are
; back after being held.
ss_return_gear:
	LDA.l !ss_gbits : AND.w #$0007 : BNE +
	RTS
+	LDX.w #0                                ; member i
.member
	PHX
	TXA : JSR ss_bit
	STA.l !ssw_tmp+6                        ; 1 << i
	AND.l !ss_gbits : BNE +
	JMP .next
+	TXA : BEQ .goku
	; a companion: seen held captive first (CF0C+i = 8)
	PHX
	SEP #$20
	LDA.l $7ECF0C,X
	REP #$20
	PLX
	AND.w #$00FF : CMP.w #8 : BNE +
	LDA.l !ssw_tmp+6 : ASL : ASL : ASL : ASL : ORA.l !ss_gbits : STA.l !ss_gbits
	JMP .next
+	LDA.l !ssw_tmp+6 : ASL : ASL : ASL : ASL : AND.l !ss_gbits : BNE +
	JMP .next
+	TXA : XBA : ASL : TAY                   ; i * $200
	LDA.w $E000,Y : AND.w #1 : BNE .back
	JMP .next
.goku
	LDA.l !ss_flags : AND.w #!SSF_WRECK : BNE .back
	LDA.l !ssw_stage : CMP.w #12 : BCS .back
	JMP .next
.back
	; slots $1E0-$1E3 of member i
	TXA : ASL : ASL : TAY                   ; gear offset i*4
	TXA : XBA : ASL : TAX                   ; actor offset i*$200
	PHB
	PEA $3131 : PLB : PLB                   ; (gear lives in bank $31)
	LDA.w (!ss_gear)&$FFFF,Y : STA.l $7EE1E0,X
	LDA.w (!ss_gear+2)&$FFFF,Y : STA.l $7EE1E2,X
	PLB
	TXA : BNE .done_member
	; Goku: the armor ring marks the wearer in its top two bits
	LDA.l !ss_gear+1 : AND.w #$00FF : CMP.w #64 : BCS .done_member
	STA.l !ssw_tmp+4
	LDX.w #0
-	LDA.l $7ECC2C,X : AND.w #$00FF : CMP.l !ssw_tmp+4 : BNE +
	SEP #$20
	LDA.l !ssw_tmp+4 : ORA.b #$40 : STA.l $7ECC2C,X
	REP #$20
+	INX : CPX.w #12 : BCC -
.done_member
	LDA.l !ssw_tmp+6 : ORA.w #0 : STA.l !ssw_tmp+4
	ASL : ASL : ASL : ASL : ORA.l !ssw_tmp+4
	EOR.w #$FFFF : AND.l !ss_gbits : STA.l !ss_gbits
.next
	PLX
	INX : CPX.w #3 : BCS +
	JMP .member
+	RTS

; ---------------------------------------------------------------------------
; Story hooks (docs/agents/snes-port/story.md): JSL, M16/X16, DB = $7E.
; SANDSHIP_CAPTURE (entering 28B): stow the members' equipped gear.
destroy_ss_capture:
	PHP
	REP #$30
	LDA.l $7ECF28 : AND.w #$00FF : BNE .done
	LDA.l !ss_gbits : AND.w #$0007 : BNE .done
	LDA.w #0 : STA.l !ss_gbits
	LDX.w #0                                ; member i
.member
	TXA : XBA : ASL : TAY                   ; actor offset i*$200
	LDA.w $E000,Y : AND.w #1 : BEQ .next
	PHX
	TXA : ASL : ASL : TAX                   ; gear offset i*4
	LDA.w $E1E0,Y : STA.l !ss_gear,X
	LDA.w $E1E2,Y : STA.l !ss_gear+2,X
	PLX
	TXA : JSR ss_bit : ORA.l !ss_gbits : STA.l !ss_gbits
.next
	INX : CPX.w #3 : BCC .member
.done
	PLP
	RTL
; A = i -> A = 1 << i (X, Y kept)
ss_bit:
	PHX
	TAX
	LDA.w #1
-	DEX : BMI +
	ASL : BRA -
+	PLX
	RTS
; SANDSHIP_CRASH (entering 7D): the deck fight, then the reunion ending.
destroy_ss_crash:
	PHP
	REP #$30
	LDA.w #!SSF_BOSS|!SSF_CRASH : JSR ss_set
	PLP
	RTL
; SANDSHIP_WAVE (entering 75): the wave is offered; arm the hint.
destroy_ss_wave:
	PHP
	REP #$30
	JSR ss_captive : BCC +
	LDA.l !ss_flags : AND.w #!SSF_WRECK : BNE +
	LDA.w #!SSF_HINTED : JSR ss_clr
	LDA.w #!SSF_ARMED : JSR ss_set
+	PLP
	RTL
; SANDSHIP_DECK (entering 77): both captives are back, Geshtar next.
destroy_ss_deck:
	PHP
	REP #$30
	LDA.w #!SSF_BOSS : JSR ss_set
	PLP
	RTL

; Story queries (A16 = value). SANDSHIP_CRASH: the crash ending.
destroy_ss_q_crash:
	LDA.l !ss_flags : AND.w #!SSF_CRASH : BEQ +
	LDA.w #1
+	RTL
destroy_ss_q_wrecked:
	LDA.l !ss_flags : AND.w #!SSF_WRECK
	RTL
; SANDSHIP_PLANNED: cut.planned while a breakout cut runs, else the wreck's.
destroy_ss_q_planned:
	LDA.l !ss_cut : CMP.w #1 : BNE +
	LDA.l !ss_cbits : AND.w #!SSC_PLANNED : BEQ ++
	LDA.w #1
++	RTL
+	LDA.l !ss_flags : AND.w #!SSF_WPLAN : BEQ +
	LDA.w #1
+	RTL
; SANDSHIP_DOOR: 0 none, 1+i = door 1A0+i for the flight door slot (7A).
destroy_ss_q_door:
	LDA.l !ss_door : BEQ +
	SEC : SBC.w #!SS_DOOR_FIRST-1
+	RTL

; ---------------------------------------------------------------------------
; destroy_hit (beams): a full-power wave fired below deck while captive
; breaks out. A beam is considered once, on its first call.
ss_hit:
	LDA.l !persist_goku_active : AND.w #$00FF : BEQ .ret
	LDA.w !arg_kind : CMP.w #2 : BCC .ret
	LDA.w !arg_id : BEQ .ret
	CMP.l !ssw_beam : BEQ .ret
	STA.l !ssw_beam
	LDA.l !ss_cut : BNE .ret
	JSR ss_captive : BCC .ret
	LDA.l !ss_flags : AND.w #!SSF_WRECK : BNE .ret
	LDA.w !arg_str : CMP.w #218 : BCS ss_blast
	LDA.l !ss_flags : AND.w #!SSF_ARMED : BEQ .ret
	LDA.w #!SS_SAY_WEAK : JMP ss_say
.ret
	RTS

; blast(): the breach ahead of Goku along the wave, then the white-out.
ss_blast:
	JSR ss_find_breach
	LDA.w !arg_x : STA.l !ss_box
	LDA.w !arg_y : STA.l !ss_boy
	LDA.w $00DC : STA.l !ss_bmap : STA.l !ss_cmap
	LDA.w $E002 : LSR : LSR : LSR : LSR : STA.l !ss_ctx
	LDA.w $E004 : LSR : LSR : LSR : LSR : STA.l !ss_cty
	LDA.w $E00B : AND.w #$0080 : BEQ +
	LDA.w #1
+	STA.l !ss_clayer
	LDA.w #1 : STA.l !ss_cut
	LDA.w #0 : STA.l !ss_cage : STA.l !ss_cafter
	LDA.w #!SSC_FRESH : STA.l !ss_cbits
	LDA.l !ss_flags : AND.w #!SSF_ARMED : BEQ +
	LDA.w #!SSC_FRESH|!SSC_PLANNED : STA.l !ss_cbits
+	LDA.w #!SSF_ARMED : JSR ss_clr
	LDA.w #!SS_SAY_DISMISS : JMP ss_say

; findBreach(canLand, {x, y, dx, dy}, 34): walk out from Goku; the first
; 12 px of wall after floor is the edge the wave tore through.
ss_find_breach:
	LDA.w !arg_dir : AND.w #3 : ASL : TAX
	LDA.l ss_dir_dx,X : STA.l !ssw_tmp+4
	LDA.l ss_dir_dy,X : STA.l !ssw_tmp+6
	LDA.w #0 : STA.l !ssw_tmp+8             ; inside
	STA.l !ssw_tmp+10                       ; wall
	LDA.w #200 : STA.l !ss_breach_reach     ; edge ?? 200
	LDY.w #8                                ; d
.step
	JSR ss_ray_point                        ; X:A... -> ssw_tmp, ssw_tmp+2 = point
	LDA.l !ssw_tmp : JSR ss_floor_px : BCC .solid
	LDA.w #1 : STA.l !ssw_tmp+8
	LDA.w #0 : STA.l !ssw_tmp+10
	BRA .next
.solid
	LDA.l !ssw_tmp+8 : BEQ .next
	LDA.l !ssw_tmp+10 : CLC : ADC.w #4 : STA.l !ssw_tmp+10
	CMP.w #12 : BCC .next
	TYA : SEC : SBC.w #12 : STA.l !ss_breach_reach
	BRA .place
.next
	INY : INY : INY : INY
	CPY.w #261 : BCC .step
.place
	; d = max(44, min(dy > .5 ? 50 : 74, edge - 17))
	LDA.l !ss_breach_reach : SEC : SBC.w #17 : BPL +
	LDA.w #0
+	STA.l !ssw_tmp+8
	LDA.l !ssw_tmp+6 : CMP.w #1 : BEQ .down
	LDA.w #74 : BRA .cap
.down
	LDA.w #50                               ; keep a downward breach off the HUD
.cap
	CMP.l !ssw_tmp+8 : BCC +
	LDA.l !ssw_tmp+8
+	CMP.w #44 : BCS +
	LDA.w #44
+	TAY
	JSR ss_ray_point
	LDA.l !ssw_tmp : STA.l !ss_bx
	LDA.l !ssw_tmp+2 : STA.l !ss_by
	RTS
; Y = distance -> !ssw_tmp / +2 = Goku + (dx, dy) * Y
ss_ray_point:
	TYA : STA.l !ssw_ray_d
	LDA.l !ssw_tmp+4 : BEQ .x0
	BMI .xm
	LDA.w $E002 : CLC : ADC.l !ssw_ray_d : BRA .xs
.xm
	LDA.w $E002 : SEC : SBC.l !ssw_ray_d : BRA .xs
.x0
	LDA.w $E002
.xs
	STA.l !ssw_tmp
	LDA.l !ssw_tmp+6 : BEQ .y0
	BMI .ym
	LDA.w $E004 : CLC : ADC.l !ssw_ray_d : BRA .ys
.ym
	LDA.w $E004 : SEC : SBC.l !ssw_ray_d : BRA .ys
.y0
	LDA.w $E004
.ys
	STA.l !ssw_tmp+2
	RTS
ss_dir_dx:
	dw 0,1,-1,0
ss_dir_dy:
	dw 1,0,0,-1

; ss_floor_px: A = x, !ssw_tmp+2 = y (map pixels) on Goku's layer ->
; carry = landable ship floor. The flight module's canLand when present;
; otherwise the browser's shipHull walk(): no trigger wall, height below 3,
; no code or a stair/ledge code (2x/3x), or a walk-on trigger.
ss_floor_px:
	STA.l !ssw_fp_x
	BMI .no
	CMP.w $00C0 : BCS .no
	LDA.l !ssw_tmp+2 : BMI .no
	CMP.w $00C2 : BCS .no
	AND.w #$FFF0 : ASL : ASL : ASL : STA.l !ssw_fp_o   ; y/16*128
	LDA.l !ssw_fp_x : LSR : LSR : LSR : LSR
	ORA.l !ssw_fp_o
	PHA
	LDA.w $E00B : AND.w #$0080 : BEQ +
	PLA : ORA.w #$4000 : PHA
+	PLA
	PHX
	TAX
	LDA.l $7F0000,X : AND.w #$00FF
	ASL : ASL : CLC : ADC.w #$B800
	CPX.w #$4000 : BCC +
	CLC : ADC.w #$0400
+	TAX
	LDA.l $7F0000,X                         ; flags | behaviour << 8
	BIT.w #$0008 : BNE .no_x
	PHA : AND.w #$0007 : CMP.w #3 : PLA : BCS .no_x
	BMI .yes_x                              ; walk-on trigger
	LDA.l $7F0002,X : AND.w #$00FF : BEQ .yes_x
	AND.w #$00F0 : CMP.w #$0020 : BEQ .yes_x
	CMP.w #$0030 : BEQ .yes_x
.no_x
	PLX
.no
	CLC
	RTS
.yes_x
	PLX
	SEC
	RTS

; ---------------------------------------------------------------------------
; cutTick(): the breakout's white-out, the escape door and its fade.
ss_cut_tick:
	LDA.l !ss_cage : INC : STA.l !ss_cage
	LDA.l !ss_cut : CMP.w #2 : BNE +
	JMP ss_crash_tick
+	LDA.l !ss_cbits : BIT.w #!SSC_REQ : BNE .requested
	; let the beam read for a moment, then white out
	LDA.l !ss_cage : SEC : SBC.w #6 : LDX.w #18 : JSR ss_ramp
	LDA.l !ss_cage : CMP.w #24 : BCC .end
	LDA.l !ss_flags : AND.w #!SSF_WRECK : BNE +
	; the wreck begins
	LDA.w #0 : STA.l !ss_wage
	LDA.w #!SSF_WRECK : JSR ss_set
	LDA.w #!SSF_WPLAN : JSR ss_clr
	LDA.l !ss_cbits : AND.w #!SSC_PLANNED : BEQ +
	LDA.w #!SSF_WPLAN : JSR ss_set
+	LDA.w #!SS_EV_ESCAPE : LDX.w #0
	JSL story_api_request : BCC .end
	LDA.l !ss_cbits : ORA.w #!SSC_REQ : STA.l !ss_cbits
	BRA .end
.requested
	BIT.w #!SSC_LOADED : BEQ .white
	LDA.l !ss_cafter : INC : STA.l !ss_cafter
	CMP.w #17 : BCC .white
	SEC : SBC.w #16 : JSR ss_fade45
	BRA .end
.white
	LDA.w #256 : STA.l !ss_flash
.end
	LDA.l !ss_cafter : CMP.w #62 : BCS .over
	LDA.l !ss_cage : CMP.w #901 : BCC .ret
.over
	LDA.w #0 : STA.l !ss_cut : STA.l !ss_flash
.ret
	RTS

; crash(): too many broken bulkheads, or an unplanned way off: the ship
; comes apart around Goku and Geshtar meets him on deck.
ss_crash:
	LDA.l !ss_cut : BEQ +
	RTS
+	LDA.l !ss_flags : AND.w #!SSF_WRECK : BNE +
	LDA.w #0 : STA.l !ss_wage
	LDA.w #!SSF_WPLAN : JSR ss_clr
	LDA.w #!SSF_WRECK : JSR ss_set
	LDA.w #$FFFF : STA.l !ss_bmap
+	LDA.w #2 : STA.l !ss_cut
	LDA.w #0 : STA.l !ss_cage : STA.l !ss_cafter : STA.l !ss_cbits
	LDA.w #!SS_DECK : STA.l !ss_cmap
	LDA.w #!SS_SAY_DISMISS : JMP ss_say

; crashTick(): the crash event, then the white fades once the deck is up.
ss_crash_tick:
	LDA.l !ss_cbits : BIT.w #!SSC_REQ : BNE +
	LDA.w #!SS_CRASH_EVENT : LDX.w #0
	JSL story_api_request : BCC +
	LDA.l !ss_cbits : ORA.w #!SSC_REQ : STA.l !ss_cbits
	LDA.w #0 : STA.l !ss_cage
+	LDA.l !ss_cbits : AND.w #!SSC_REQ : BEQ .else
	LDA.l !ss_cage : CMP.w #130 : BCC .else
	LDA.w $00DC : CMP.l !ss_cmap : BNE .else
	JSR ss_screen_up : BCC .else
	LDA.l !ss_cafter : INC : STA.l !ss_cafter
	CMP.w #25 : BCC .end
	SEC : SBC.w #24 : JSR ss_fade45
	BRA .end
.else
	LDA.l !ss_cafter : BNE .end
	LDA.l !ss_cbits : AND.w #!SSC_REQ : BEQ .zero
	LDA.l !ss_cage : SEC : SBC.w #60 : LDX.w #56 : JSR ss_ramp
	BRA .end
.zero
	LDA.w #0 : STA.l !ss_flash
.end
	LDA.l !ss_cafter : CMP.w #70 : BCS .over
	LDA.l !ss_cage : CMP.w #1201 : BCC .ret
.over
	LDA.w #0 : STA.l !ss_cut : STA.l !ss_flash : STA.l !ss_breaks
.ret
	RTS

; The desert itself is on screen (mod.nativeField and no forced blank): the
; native field is running and its last INIDISP value is not blanking.
ss_screen_up:
	JSR ss_can_attack_field : BCC +
	SEP #$20
	LDA.l $7E00E6 : BMI .no8                ; INIDISP shadow (C0:C15F)
	REP #$20
	SEC
+	RTS
.no8
	REP #$20
	CLC
	RTS
; the field vectors only (mod.nativeField)
ss_can_attack_field:
	LDA.l $000100 : CMP.w #$A85C : BNE .no
	LDA.l $000104 : CMP.w #$CF5C : BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; ---------------------------------------------------------------------------
; escaping(): off the ship (flown past the hull, a map change, the roof
; takeoff): once Goku can be moved, the crash.
ss_escaping:
	LDA.l !ssw_stage : BEQ .ret
	CMP.w #10 : BCS .ret
	LDA.l !ss_cut : BNE .ret
	JSR ss_outside : BCC +
	LDA.w #!SSF_ESCAPED : JSR ss_set
+	LDA.l !ss_flags : AND.w #!SSF_ESCAPED : BEQ .ret
	JSR ss_can_attack : BCC .ret
	LDA.w #!SSF_ESCAPED : JSR ss_clr
	LDA.w #!SS_SAY_BROKE : JSR ss_say
	JMP ss_crash
.ret
	RTS

; outside(): flying more than four tiles from every stretch of ship floor.
; Needs the flight module's hover state (bound when it is present).
ss_outside:
	CLC
	RTS

; ---------------------------------------------------------------------------
; In the wreck, walking into the kitchen or cabin starts that captive's
; rescue (their walk-ons arm only in the original story order).
ss_rescues:
	LDA.l !ss_flags : AND.w #!SSF_WRECK : BEQ .ret
	LDA.l !ssw_stage : CMP.w #10 : BCS .ret
	JSR ss_can_attack : BCC .ret
	JSR ss_captives : STA.l !ssw_tmp+4
	LDA.w $00DC : CMP.w #!SS_KITCHEN : BNE +
	LDA.l !ssw_tmp+4 : AND.w #2 : BEQ .ret
	LDA.w #$0295 : BRA .request
+	CMP.w #!SS_CABIN : BNE .ret
	LDA.l !ssw_tmp+4 : AND.w #1 : BEQ .ret
	LDA.w #$029C
.request
	LDX.w #0
	JSL story_api_request
.ret
	RTS

; Both captives back: the deck starts Geshtar (77); otherwise one reminder.
ss_deck:
	LDA.l !ss_flags : AND.w #!SSF_WRECK|!SSF_DECKDONE : CMP.w #!SSF_WRECK : BNE .ret
	LDA.w $00DC : CMP.w #!SS_DECK_A : BEQ +
	CMP.w #!SS_DECK_B : BNE .ret
+	LDA.l !ssw_stage : CMP.w #10 : BCS .ret
	JSR ss_can_attack : BCC .ret
	JSR ss_captives : BNE .wait
	LDA.w #!SS_EV_DECK : LDX.w #0
	JSL story_api_request : BCC .ret
	LDA.w #!SSF_DECKDONE : JMP ss_set
.wait
	LDA.l !ss_flags : AND.w #!SSF_DECKHINT : BNE .ret
	LDA.w #!SSF_DECKHINT : JSR ss_set
	LDA.w #!SS_SAY_NOTYET : JMP ss_say
.ret
	RTS

; Stage 11 on the deck: Geshtar's fight (29E) with his own actor.
ss_boss:
	LDA.l !ss_flags : AND.w #!SSF_BOSS : BEQ .ret
	LDA.w $00DC : CMP.w #!SS_DECK : BNE .ret
	LDA.l !ssw_stage : CMP.w #11 : BNE .ret
	JSR ss_can_attack : BCC .ret
	LDX.w #0
-	LDA.w $E000,X : AND.w #1 : BEQ +
	LDA.w $E180,X : AND.w #$00FF : CMP.w #!SS_GESHTAR : BEQ .found
+	TXA : CLC : ADC.w #$0200 : TAX
	CPX.w #$1800 : BCC -
.ret
	RTS
.found
	LDA.w #$029E
	JSL story_api_request : BCC .ret
	LDA.w #!SSF_BOSS : JMP ss_clr

; ---------------------------------------------------------------------------
; onDemolish (dst_row_outputs, a demolition row was applied): each strike
; that opens a bulkhead weakens the ship (one per strike, not per row).
ss_on_demolish:
	JSR ss_breakable : BCC .ret
	LDA.l !ss_cut : BNE .ret
	LDA.w !FRAME : SEC : SBC.l !ss_lastbrk : STA.l !ssw_tmp+4
	LDA.w !FRAME : STA.l !ss_lastbrk
	LDA.l !ssw_tmp+4 : CMP.w #41 : BCC .ret
	LDA.l !ss_breaks : INC : STA.l !ss_breaks
	CMP.w #!SS_BREAK_LIMIT-2 : BNE +
	PHA
	LDA.w #!SS_SAY_STOP : JSR ss_say
	PLA
+	CMP.w #!SS_BREAK_LIMIT : BCC .ret
	JMP ss_crash
.ret
	RTS

; breakable: aboard while the arc is unfinished (stage 1-9). Carry.
ss_breakable:
	LDA.l !persist_goku_active : AND.w #$00FF : BEQ .no
	LDA.w $00DC : JSR ss_ship_map : BCC .no
	LDA.l $7ECF28 : AND.w #$00FF : BEQ .no
	CMP.w #10 : BCS .no
	SEC
	RTS
.no
	CLC
	RTS

; destroy_ss_takeoff (JSL, for the flight/world takeoff): the roof takeoff
; off an unfinished ship blows it up instead. Carry set = consumed.
destroy_ss_takeoff:
	PHB
	PHP
	REP #$30
	PEA $7E7E : PLB : PLB
	JSR ss_breakable : BCC .no
	LDA.l !ss_cut : BNE .no
	LDA.w #!SSF_ESCAPED : JSR ss_set
	PLP
	PLB
	SEC
	RTL
.no
	PLP
	PLB
	CLC
	RTL

; ---------------------------------------------------------------------------
; OBJECT_LIST_SANDSHIP (story hook, per map load; the list is at
; !story_objlist_*): while wrecked, a copy with the enemy-map header byte,
; fled guards and crew hidden and the room's monsters appended.
destroy_ss_object_list:
	PHB
	PHP
	REP #$30
	PEA $7E7E : PLB : PLB
	LDA.l !ss_flags : AND.w #!SSF_WRECK : BNE +
	JMP .done
+	LDA.w $00DC : JSR ss_ship_map : BCS +
	JMP .done
+	; the escape reload: Goku's room is coming up
	LDA.l !ss_cut : CMP.w #1 : BNE +
	LDA.l !ss_cbits : BIT.w #!SSC_DOOR : BEQ +
	ORA.w #!SSC_LOADED : STA.l !ss_cbits
+	LDA.l !ssw_loads : INC : STA.l !ssw_loads
	; the room's monster count and spot order
	JSR ss_ship_entry : STA.l !ssw_tmp+12   ; count; X = directory entry
	TXA : STA.l !ssw_tmp+14
	; copy the list (bank C8)
	LDA.l !story_objlist_end : SEC : SBC.l !story_objlist_start
	CMP.w #8 : BCS +
	JMP .done
+	STA.l !ssw_tmp+8                        ; bytes
	LDA.l !ssw_tmp+12 : ASL : ASL : ASL : CLC : ADC.l !ssw_tmp+8
	CMP.w #!SS_LIST_MAX+1 : BCC +
	JMP .done                               ; no room: leave the list as is
+	LDA.l !story_objlist_start : TAX
	LDY.w #0
-	LDA.l $C80000,X
	PHX
	TYX
	STA.l !ssw_list,X
	PLX
	INX : INX
	INY : INY
	TYA : CMP.l !ssw_tmp+8 : BCC -
	; enemy-map palettes and stats (the desert's header byte)
	LDA.l !ssw_tmp+12 : BEQ +
	SEP #$20
	LDA.b #$FF : STA.l !ssw_list+7
	REP #$20
+	; fled guards and crew: an impossible visibility range
	LDX.w #8
.record
	TXA : CMP.l !ssw_tmp+8 : BCS .records_done
	LDA.l !ssw_list+5,X : AND.w #$00FF : JSR ss_is_fled : BCC +
	SEP #$20
	LDA.b #$F0 : STA.l !ssw_list+1,X
	REP #$20
+	TXA : CLC : ADC.w #8 : TAX
	BRA .record
.records_done
	; the monsters: placeholder records, placed per record once the room's
	; collision and Goku's arrival are in WRAM (destroy_ss_object)
	LDA.l !ssw_tmp+8 : SEC : SBC.w #8 : LSR : LSR : LSR : STA.l !ssw_norig
	LDA.l !ssw_tmp+12 : STA.l !ssw_mcount
	LDA.w #$FFFF : STA.l !sp_n
	LDA.l !ssw_tmp+14 : STA.l !ssw_mentry
	LDA.l !ssw_tmp+8 : TAX
	LDY.w #0
-	TYA : CMP.l !ssw_tmp+12 : BCS +
	LDA.w #$F000 : STA.l !ssw_list,X        ; hidden until placed
	LDA.w #0 : STA.l !ssw_list+2,X
	TYA : AND.w #1 : BEQ ++
	LDA.w #!SS_MONSTER_B<<8|$40 : BRA +++
++	LDA.w #!SS_MONSTER_A<<8|$40
+++	STA.l !ssw_list+4,X
	LDA.w #$C001 : STA.l !ssw_list+6,X
	TXA : CLC : ADC.w #8 : TAX
	INY
	BRA -
+	; point the loader at the copy
	LDA.w #(!ssw_list)&$FFFF : STA.l !story_objlist_start
	LDA.l !ssw_tmp+12 : ASL : ASL : ASL : CLC : ADC.l !ssw_tmp+8
	CLC : ADC.w #(!ssw_list)&$FFFF : STA.l !story_objlist_end
	SEP #$20
	LDA.b #(!ssw_list)>>16 : STA.l !story_objlist_bank
	REP #$20
.done
	PLP
	PLB
	RTL

; OBJECT_SANDSHIP (story hook, per record copied to $C808+X; A = record
; index): the appended monsters take their places now that the room's
; collision and Goku's arrival point are loaded (the browser places them
; when the loader first reads one of them).
destroy_ss_object:
	PHB
	PHP
	REP #$30
	PEA $7E7E : PLB : PLB
	PHX
	PHY
	STA.l !ssw_rec
	TXA : STA.l !ssw_slot
	JSR ss_monster_record : BCS +
	JMP .done
+	STA.l !ssw_k
	LDA.l !sp_n : CMP.w #$FFFF : BNE +
	JSR ss_choose_spots
+	LDA.l !ssw_slot : TAX
	LDA.l !ssw_k : CMP.l !sp_n : BCS .hidden
	; [0, $0F, x/16, y/16, $40, monsters[k%2], 1, $C0]
	ASL : TAY
	SEP #$20
	LDA.b #$0F : STA.w $C809,X
	REP #$20
	PHX
	TYX
	LDA.l !sp_cx,X : LSR : LSR : LSR : LSR : STA.l !ssw_tmp+4
	LDA.l !sp_cy,X : LSR : LSR : LSR : LSR : XBA : ORA.l !ssw_tmp+4
	PLX
	STA.w $C80A,X
	LDA.l !ssw_k : AND.w #1 : BEQ +
	SEP #$20
	LDA.b #!SS_MONSTER_B : STA.w $C80D,X
	REP #$20
	BRA .done
+	SEP #$20
	LDA.b #!SS_MONSTER_A : STA.w $C80D,X
	REP #$20
	BRA .done
.hidden
	SEP #$20
	LDA.b #$F0 : STA.w $C809,X
	LDA.b #!SS_MONSTER_A : STA.w $C80D,X
	REP #$20
.done
	PLY
	PLX
	PLP
	PLB
	RTL

; The current record (!ssw_rec) is one of the monsters this load appended:
; carry set, A = its k.
ss_monster_record:
	LDA.l !ss_flags : AND.w #!SSF_WRECK : BEQ .no
	LDA.w $00DC : JSR ss_ship_map : BCC .no
	LDA.l !story_objlist_bank : AND.w #$00FF : CMP.w #(!ssw_list)>>16 : BNE .no
	LDA.l !ssw_rec : SEC : SBC.l !ssw_norig : BMI .no
	CMP.l !ssw_mcount : BCS .no
	SEC
	RTS
.no
	CLC
	RTS

; A = species -> carry = fled (soldiers, guards and the freed engine crew)
ss_is_fled:
	PHX
	STA.l !ssw_tmp+4
	LDX.w #0
-	LDA.l ss_fled,X : AND.w #$00FF : BEQ .no
	CMP.l !ssw_tmp+4 : BEQ .yes
	INX
	BRA -
.no
	PLX
	CLC
	RTS
.yes
	PLX
	SEC
	RTS

; This ship map's directory entry: A = monster count, X = entry offset.
ss_ship_entry:
	LDX.w #0
-	LDA.l ss_ship_dir,X : CMP.w #$FFFF : BEQ .none
	CMP.w $00DC : BEQ .found
	TXA : CLC : ADC.w #12 : TAX
	BRA -
.found
	LDA.l ss_ship_dir+2,X
	RTS
.none
	LDA.w #0
	RTS

; placeMonsters(map, count): spread(floorSpots(map, 16, 72), count, 40) over
; the browser's hash order -> !sp_n spots in !sp_cx/!sp_cy (unplaced
; records stay hidden).
ss_choose_spots:
	LDA.l !ssw_mentry : TAX
	LDA.l ss_ship_dir+6,X : STA.l !sp_left
	LDA.l ss_ship_dir+4,X : STA.l !sp_k     ; spot list address (bank of the tables)
	LDA.w #0 : STA.l !sp_n
.spot
	LDA.l !sp_n : CMP.l !ssw_mcount : BCC +
	JMP .emit
+	LDA.l !sp_left : BNE +
	JMP .emit
+	DEC : STA.l !sp_left
	LDA.l !sp_k : TAX
	INC : INC : STA.l !sp_k
	LDA.l !DATA_DESTROY,X : PHA
	AND.w #$00FF : ASL : ASL : ASL : ASL : CLC : ADC.w #8 : STA.l !sp_x
	PLA : XBA : AND.w #$00FF : ASL : ASL : ASL : ASL : CLC : ADC.w #8 : STA.l !sp_y
	; canLand at the spot
	STA.l !ssw_tmp+2
	LDA.l !sp_x : JSR ss_floor_px : BCS +
	JMP .spot
+
	; at least 72 px from Goku
	LDA.l !sp_x : SEC : SBC.w $E002 : STA.l !ssw_tmp+4
	LDA.l !sp_y : SEC : SBC.w $E004 : STA.l !ssw_tmp+6
	LDA.w #5184 : JSR ss_far_enough : BCS +
	JMP .spot
+
	; 40 px from every chosen spot
	LDX.w #0
-	TXA : CMP.l !sp_n : BCS .take
	ASL : TAX
	LDA.l !sp_x : SEC : SBC.l !sp_cx,X : STA.l !ssw_tmp+4
	LDA.l !sp_y : SEC : SBC.l !sp_cy,X : STA.l !ssw_tmp+6
	TXA : LSR : TAX
	PHX
	LDA.w #1600 : JSR ss_far_enough
	PLX
	BCS +
	JMP .spot
+
	INX
	BRA -
.take
	LDA.l !sp_n : ASL : TAX
	LDA.l !sp_x : STA.l !sp_cx,X
	LDA.l !sp_y : STA.l !sp_cy,X
	LDA.l !sp_n : INC : STA.l !sp_n
	JMP .spot
.emit
	RTS

; !ssw_tmp+4 = dx, +6 = dy (signed px), A = minimum squared distance
; (< 16384). Carry set when dx^2 + dy^2 >= A.
ss_far_enough:
	STA.l !ssw_fe_min
	LDA.l !ssw_tmp+4 : BPL +
	EOR.w #$FFFF : INC
+	CMP.w #128 : BCS .yes
	ASL : TAX
	LDA.l ss_squares,X : STA.l !ssw_fe_sq
	LDA.l !ssw_tmp+6 : BPL +
	EOR.w #$FFFF : INC
+	CMP.w #128 : BCS .yes
	ASL : TAX
	LDA.l ss_squares,X : CLC : ADC.l !ssw_fe_sq
	CMP.l !ssw_fe_min
	RTS
.yes
	SEC
	RTS

; ---------------------------------------------------------------------------
; C1:E7DF (door event: map $DC, x $DE and $DF/$E0 from the door record
; C8:3000+4*door; M16/X16, X = 4*door, D = 0): the escape reloads the room
; Goku stands in through its own door, so guards leave and monsters arrive
; with the fade (sandship-wreck.js read view of C8:3000+4*1A9).
; !DOOR_RECORD_HOOK (define, optional): another module's JSL with X =
; 4*door, A = record bytes 0-1, Y = bytes 2-3; it returns A/Y.
destroy_door_record:
	LDA.l $C83000,X : PHA
	LDA.l $C83002,X : TAY
	PLA
	CPX.w #!SS_ESCAPE_DOOR*4 : BNE .other
	PHA
	LDA.l !ss_cut : CMP.w #1 : BEQ +
	PLA
	BRA .other
+	PLA
	LDA.l !ss_cbits : ORA.w #!SSC_DOOR : STA.l !ss_cbits
	; byte 0 map low, byte 1 x*2 | map bit 8, byte 2 y*2 | layer, byte 3 kept
	LDA.l !ss_cty : ASL : ORA.l !ss_clayer : AND.w #$00FF : STA.l !ssw_tmp+4
	TYA : AND.w #$FF00 : ORA.l !ssw_tmp+4 : TAY
	LDA.l !ss_cmap : XBA : AND.w #$0001 : STA.l !ssw_tmp+4
	LDA.l !ss_ctx : ASL : ORA.l !ssw_tmp+4 : XBA : AND.w #$FF00 : STA.l !ssw_tmp+4
	LDA.l !ss_cmap : AND.w #$00FF : ORA.l !ssw_tmp+4
.other
	; tests: a one-shot record for one door (the browser spec's enter())
	PHA
	TXA : LSR : LSR : CMP.l !ssw_dbgdoor : BNE +
	LDA.w #$FFFF : STA.l !ssw_dbgdoor
	PLA
	LDA.l !ssw_dbgrec+2 : TAY
	LDA.l !ssw_dbgrec
	PHA
+	PLA
if defined("DOOR_RECORD_HOOK")
	JSL !DOOR_RECORD_HOOK
endif
	; as the original: $DC map, $DE x, $DF/$E0 bytes 2-3
	PHA
	AND.w #$01FF : STA.l $7E00DC
	PLA
	XBA : AND.w #$00FF : LSR : STA.l $7E00DE
	TYA : STA.l $7E00DF
	RTL

; ---------------------------------------------------------------------------
; C3:0004 (JMP $0160, the sound driver entry; any P, DB, D): while wrecked,
; the room's own song (25h) becomes the boss battle alarm (01 04 04 FF), so
; the change lands with the room's fade (sandship-wreck.js).
destroy_song_hook:
	PHP
	REP #$30
	PHA
	PHX
	LDA.l $7E1E00 : CMP.w #!SS_SHIP_SONG<<8|1 : BNE .count
	LDA.l !ss_flags : AND.w #!SSF_WRECK : BEQ .count
	LDA.l $7E00DC : JSR ss_ship_map : BCC .count
	LDA.w #!SS_ALARM_SONG : STA.l $7E1E00
	LDA.w #!SS_ALARM_PARAMS : STA.l $7E1E02
.count
	LDA.l $7E1E00 : AND.w #$00FF : CMP.w #1 : BNE .out
	LDA.l $7E1E01 : AND.w #$00FF : STA.l !ssw_lastsong
	CMP.w #!SS_ALARM_SONG>>8 : BNE .out
	LDA.l !ss_flags : AND.w #!SSF_WRECK : BEQ .out
	LDA.l !ssw_songs : INC : STA.l !ssw_songs
.out
	PLX
	PLA
	PLP
	JML $C30160
