; Whip-pad gap crossings (native-gap-flight.js). The whip pads (floor event
; 6D8) and post hits (6FA) share the native 6F9 crossing; both scripts start
; with `4E 00 E4 04`: "the hero holds the whip".
;  - C0:B683 dispatches a resolved floor event: while Goku flies, a whip pad
;    under any party member is dropped (→ B678, the next member), before it
;    locks input, ends flight or gathers the party for a jump.
;  - C1:F1F1 runs the conditionals 49-4E: at the start of 6D8 (CA:90DA) or
;    6FA (CA:927A) with Goku in play, the condition becomes END when Goku
;    flies or steers (A + a direction) or when no post stands 4 tiles away,
;    else Goku faces the post and the script JUMPs to 6F9: the party floats
;    across with the native gathering, movement, camera and the CF01
;    collision flag, without an equipped whip. Goku shows the gap-flight
;    hover (goku mode $23); 'flight' sounds at the start, 'landing' when the
;    event ends on the same map.

; 00:B683 (replaced REP #$20 / LDA #$0000), M16 X16 (X = the member), D = 0,
; any DB. $00 = the resolved event.
fl_hook_b683:
	REP #$20
	LDA.l $7E0000|!fl_state
	AND.w #!FLS_FLY
	BEQ .native
	LDA $00
	AND.w #$0FFF
	CMP.w #$06D8
	BNE .native
	JSR fl_gap_enabled
	BCC .native
	JML $00B678                  ; drop the pad: next party member
.native
	LDA.w #$0000
	JML $00B688

; enabled(): Goku in play and controlled, nobody talking ($D4). Any DB.
; Carry set when enabled. Preserves X/Y.
fl_gap_enabled:
	LDA.l $7E0000|!fl_state
	AND.w #!FLS_ON
	BEQ .no
	LDA.l $7EE000
	AND.w #$0001
	BEQ .no
	LDA.l $7EE02C
	AND.w #$0001
	BEQ .no
	LDA.l $7E00D4
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS

; 01:F1F1 (replaced LDY #$02 / REP #$20), M8 X8, DB = $7E, D = 0:
; $04 = opcode, $05 = first operand, [$D1] = the opcode's address.
fl_hook_f1f1:
	LDA $04
	CMP.b #$4E
	BNE .native
	LDA $D3
	CMP.b #$CA
	BNE .native
	REP #$20
	LDA $D1
	CMP.w #$90DA
	BEQ .whip
	CMP.w #$927A
	BEQ .whip
	SEP #$20
.native
	LDY.b #$02
	REP #$20
	JML $01F1F5
.whip
	REP #$30
	JSR fl_gap_enabled
	BCC .back
	; held local flight keeps steering live across the real gap
	LDA.w !fl_state
	AND.w #!FLS_FLY
	BNE .end
	LDA.w !fl_pad
	AND.w #!PAD_A
	BEQ +
	LDA.w !fl_pad
	AND.w #!PAD_UP|!PAD_DOWN|!PAD_LEFT|!PAD_RIGHT
	BNE .end
+	JSR fl_gap_post
	BCC .end                     ; no matching post: never jump blindly
	SEP #$20
	STA $E010
	REP #$20
	LDA $DC
	INC
	STA.w !fl_gap                ; the crossing runs on this map
	JSR fl_bind_cancel
	JSR fl_land_now
	LDA.w #!FL_SFX_FLIGHT
	JSR fl_bind_sfx
	; the script continues as `16 F9`: JUMP to event 6F9
	SEP #$30
	LDA.b #$16
	STA $04
	LDA.b #$F9
	STA $05
	LDX.b #$16*2
	JML $01EAF0
.end
	; the script reads as `00`: END
	SEP #$30
	STZ $04
	LDX.b #$00
	JML $01E9C4
.back
	SEP #$30
	BRA .native

; direction(): the post (descriptor bytes 2-3 = F8 6F) 4 tiles away from
; Goku, trying first the way he faces ($E010), then up, down, right, left.
; Carry set with A = that facing byte. M16 X16, DB = $7E.
fl_gap_post:
	LDA $E00B
	AND.w #$0080
	BEQ +
	LDA.w #$4000
+	STA.w !fl_t2                 ; layer base
	LDA $E002
	LSR : LSR : LSR : LSR
	STA.w !fl_t0
	LDA $E004
	LSR : LSR : LSR : LSR
	STA.w !fl_t1
	LDA $E010
	AND.w #$00FF
	STA.w !fl_t3
	LDX.w #$0000
.first
	LDA.l fl_gap_dirs+2,X
	AND.w #$00FF
	CMP.w !fl_t3
	BNE +
	JSR fl_gap_test
	BCS .found
+	INX : INX : INX : INX
	CPX.w #16
	BCC .first
	LDX.w #$0000
.rest
	LDA.l fl_gap_dirs+2,X
	AND.w #$00FF
	CMP.w !fl_t3
	BEQ +
	JSR fl_gap_test
	BCS .found
+	INX : INX : INX : INX
	CPX.w #16
	BCC .rest
	CLC
	RTS
.found
	LDA.l fl_gap_dirs+2,X
	AND.w #$00FF
	SEC
	RTS
; X = entry offset: is the tile (tx + dx, ty + dy) inside 0-127 a post?
fl_gap_test:
	LDA.l fl_gap_dirs,X
	AND.w #$00FF
	BIT.w #$0080
	BEQ +
	ORA.w #$FF00
+	CLC
	ADC.w !fl_t0
	CMP.w #128
	BCS .no
	STA.w !fl_t4
	LDA.l fl_gap_dirs+1,X
	AND.w #$00FF
	BIT.w #$0080
	BEQ +
	ORA.w #$FF00
+	CLC
	ADC.w !fl_t1
	CMP.w #128
	BCS .no
	XBA
	LSR
	ORA.w !fl_t4
	ORA.w !fl_t2
	PHX
	TAX
	JSR fl_fetch
	PLX
	LDA.w !fl_d_code
	CMP.w #$00F8
	BNE .no
	LDA.w !fl_d_rep
	CMP.w #$006F
	BNE .no
	SEC
	RTS
.no
	CLC
	RTS
; dx, dy (tiles), facing byte, pad: up, down, right, left
fl_gap_dirs:
	db $00, $FC, $00, $00
	db $00, $04, $01, $00
	db $04, $00, $02, $00
	db $FC, $00, $82, $00

; tick() at the start of the frame logic: the crossing ends when its event
; does ($D0 = 0; 'landing' on the same map), on another map or without Goku.
fl_gap_tick:
	LDA.w !fl_state
	AND.w #!FLS_ON
	BEQ .quiet
	LDA $DC
	INC
	CMP.w !fl_gap
	BNE .quiet
	LDA $D0
	AND.w #$00FF
	BNE .done
	LDA.w !fl_events
	ORA.w #!FLE_LANDING
	STA.w !fl_events
.quiet
	STZ.w !fl_gap
.done
	RTS
