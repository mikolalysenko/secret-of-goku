; Handlers for the patches in patches.asm. Each one keeps the original
; behaviour while Goku is not active (!persist_goku_active = 0).

; ---------------------------------------------------------------------------
; C1:E833 (JSL, replaced JSL $01CBCB). Every world takeoff (Drum, Fly, L+R,
; scripted Flammie departures through event opcode 1C) passes here after the
; native $0Cxx path stored the takeoff position, heading and return map.
; With Goku, skip the Flammie summon: request the fade straight to world
; flight as C0:A4E1-A4EC + C0:8B16 do when the dragon has arrived.
; Entry: M8 X16, DB = $7E, D = 0.
world_takeoff_hook:
	JSL $01CBCB
	PHP
	SEP #$20
	JSR world_goku
	BCC .done
	LDA.l $7E00E8
	CMP.b #$04                     ; set by the $0Cxx path just before
	BNE .done
	LDA.b #$00
	STA.l $7E00E8
	STA.l $7E00E0
	STA.l $7E00E7
	LDA.b #$80
	STA.l $7E00FF
	LDA.b #$01
	STA.l $7E00E4
	LDA.b #$04
	STA.l $7E00E5
	LDA.l $7E00E2
	ORA.b #$01
	STA.l $7E00E2
	REP #$20
	LDA.w #!TRANS_TAKEOFF
	STA.l $7E0000|!w_trans_kind
	LDA.w #$0000
	STA.l $7E0000|!w_trans_age
	STA.l $7E0000|!w_takeoff_req
	JSR world_sfx_takeoff
.done
	PLP
	RTL

; ---------------------------------------------------------------------------
; C1:DBCD (JSL, 5 bytes, replaced LDA $19F2 / AND #$03): the Drum handler
; of the item ring, reached after the ring's own availability checks. With
; Goku, skip the drum animation and its sound and go straight to the native
; takeoff request at C1:DC22. Entry: M8 X16.
world_fly_item_hook:
	JSR world_goku
	BCC .native
	REP #$20
	LDA.w #$DC21                    ; RTL lands on C1:DC22 (same bank)
	STA $01,S
	SEP #$20
	RTL
.native
	LDA $19F2
	AND.b #$03
	RTL

; ---------------------------------------------------------------------------
; C0:BC0B (JSL, 6 bytes, replaced JSR $BC85 / JSR $C481): start of the
; ground loader. A world landing still has request bit 0 of $E8 set, which
; asks for the BG3 Flammie fly-by that hides the party. Clear it so the
; ordinary loader places the party (door, collision, music, fade); bit 1
; (cannon) is untouched. Fortress landing record 10 stages the party 64
; tiles east for the fly-by (C0:C059 / C1:FD37 take it back afterwards);
; undo that offset here. Entry: M16 X8 (as traced), D = 0.
world_land_hook:
	PHP
	PHB
	PHD
	REP #$30
	PHA
	PHX
	PHY
	PEA $7E7E
	PLB
	PLB
	LDA.w #$0000
	TCD
	JSR world_goku
	BCC .restore
	JSR world_vectors
	BNE .restore                   ; an ordinary door, not a landing
	LDA $E8
	AND.w #$0001
	BEQ .restore
	SEP #$20
	LDA $E8
	AND.b #$FE
	STA $E8
	STZ $52
	REP #$20
	LDA.w #!TRANS_LANDING
	STA.w !w_trans_kind
	STZ.w !w_trans_age
	LDA.w #!WF_FORT_LAND
	TRB.w !w_flags
	LDA $010E
	CMP.w #$80FF                    ; landing record 10: the Fortress deck
	BNE .restore
	LDA.w #!WF_FORT_LAND
	TSB.w !w_flags
	SEP #$20
	LDA $DE
	SEC
	SBC.b #$40
	STA $DE
.restore
	REP #$30
	PLY
	PLX
	PLA
	PLD
	PLB
	PLP
	%call00($BC85)
	%call00($C481)
	RTL

; ---------------------------------------------------------------------------
; 00:88FB (JML, replaced LDA $EC / LSR / BCC $8903 / JSR $890B) in the
; world NMI, after the game's uploads. Entry: M8 X8, DB = $00, D = 0.
; - Flammie's terrain shadow is a BG1 window (HDMA channel 7, enabled by
;   C0:8AD1 on odd $2D); Goku has a small OBJ shadow, so keep TMW clear.
; - The horizon IRQ switches to Mode 7 and the ground scroll. When the
;   frame was not finished (lag) or the next world buffer was not ready
;   ($60 bit 7), C0:890B skips the sky setup and Mode 7 would cover the sky
;   for a whole frame. Restore Mode 1 and the cached sky scroll (as
;   C0:89EE-89FD) unless the overhead map (Mode 7 throughout) is shown.
world_nmi_sky_hook:
	LDA.l !persist_goku_active
	BEQ .native
	STZ $212E
	LDA $EC
	LSR
	BCC .skipped
	LDA $60
	BMI .call
	LDA.b #$13                      ; C0:890B's TM write before its early RTS
	STA $212C
.skipped
	LDA $F2
	BMI .done
	LDA $EC
	BPL .done
	LDA.b #$01
	STA $2105
	LDA $A9
	STA $210D
	LDA $AA
	STA $210D
	LDA.l $7E0000|!w_flags
	ORA.b #!WF_SKY_FIX
	STA.l $7E0000|!w_flags
.done
	JML $008903
.call
	PEA $8902                       ; C0:890B returns to 00:8903
	JML $00890B
.native
	LDA $EC
	LSR
	BCC .done
	PEA $8902
	JML $00890B

; ---------------------------------------------------------------------------
; 00:8064 (JML, replaced SEP #$20 / JSR $8B5E): top of the world loop, right
; after the vblank wait. A Fortress landing queued by the destruction route
; leaves through the Fortress's own docking ABI here.
world_loop_hook:
	PHP
	REP #$20
	LDA.l $7E0000|!w_magic
	CMP.w #!WORLD_MAGIC
	BNE .native
	LDA.l !persist_goku_active
	AND.w #$00FF
	BEQ .native
	LDA.l $7E0000|!w_land_queued
	BNE .land
.native
	PLP
	SEP #$20
	PEA $8068                       ; JSR $8B5E returns to 00:8069
	JML $008B5E
.land
	PLP
	JML world_fortress_landing

; ---------------------------------------------------------------------------
; 00:9AD0 (JML, replaced LDA $BF / BNE $9ACB): Flammie's OAM builder, after
; its cut-scene checks (only reached when Flammie would be drawn). With Goku,
; build nothing: leave slots 0..reserve-1 to world_world_frame (so Goku stays
; drawn through lag frames) and let C0:9DE9 hide the rest of slots 0-63.
; Entry: M8 X8, D = 0.
world_flammie_hook:
	LDA.l !persist_goku_active
	BEQ .native
	LDA.l $7E0000|!w_oam_reserve
	STA $7C
	STZ $7D
	JML $009DE9                     ; RTS returns to the world loop
.native
	LDA $BF
	BNE .dock
	JML $009AD4
.dock
	JML $009ACB

; ---------------------------------------------------------------------------
; C2:B112 (JSL, 6 bytes, replaced LDA $E3 / BIT #$40 / BNE $B119): the Mana
; Fortress world object. With Goku the real moving Fortress is drawn from
; the first flight (without unlocking the Pure Land landing test that shares
; $E3 bit 6) until Goku destroys it. Return to C2:B119 = draw, B118 = RTL.
; Entry: M8 X16, D = 0.
world_fortress_hook:
	JSR world_goku
	BCC .native
	LDA.l !pw_flags
	AND.b #!PWF_FORTRESS
	BNE .hidden
.draw
	REP #$20
	LDA.w #$B118
	STA $01,S
	SEP #$20
.hidden
	RTL
.native
	LDA $E3
	BIT.b #$40
	BNE .draw
	RTL

; ---------------------------------------------------------------------------
; C2:B230 (JSL, 8 bytes, replaced REP #$20 / LDA $F4 / LSR / AND #$0006):
; the docking approach's miniature dragon (C2:B7B4 data, a second Flammie in
; another palette). With Goku, skip only its OBJ submission (RTL at C2:B246);
; the Fortress, its docking timer and fade stay native, and world_world_frame
; draws Goku's own approach. Entry: M8 X16.
world_dock_hook:
	JSR world_goku
	BCC .native
	REP #$20
	LDA.w #$B245
	STA $01,S
	SEP #$20
	RTL
.native
	REP #$20
	LDA $F4
	LSR
	AND.w #$0006
	RTL
