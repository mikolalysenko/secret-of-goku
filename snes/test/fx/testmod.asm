; FX_TEST builds only: a mailbox the Lua tests fill to drive the public API
; as a client module would. It lives in the scene SRAM area ($32:6000),
; which no module uses in these tests. Called at the start of fx_frame
; (M16/X16, DB = $7E), i.e. as the last client of the frame.
;
; 8 entries of 16 bytes at $32:6000:
;   +0 op: 0 none, 1 spawn (once), 2 draw (every frame), 3 beam (every
;      frame), 4 flash (once, frames in +8), 5 quake (once), 6 kill all
;      (once), 7 draw (every frame, +E t held)
;   +1 kind / beam style   +2 flags   +3 dir   +4 x   +6 y
;   +8 a   +A b   +C c   +E t (draws and beams: advanced every frame)
; $32:6080: last handle; $32:6082..: stats of the previous fx frame;
; $32:60A0: style byte for the next spawns/draws; $32:60A2: rgb x3.

fx_test_frame:
	LDA.l !fx_sprites
	STA.l !FXT_BOX+$82
	LDA.l !fx_dropped
	STA.l !FXT_BOX+$84
	LDA.l !fx_front
	STA.l !FXT_BOX+$86
	LDA.l !fx_palfree
	AND.w #$00FF
	STA.l !FXT_BOX+$88
	LDA.l !fx_regions
	STA.l !FXT_BOX+$8A
	LDA.l !fx_nmipal
	STA.l !FXT_BOX+$8C
	LDA.l !fx_nmipal+2
	STA.l !FXT_BOX+$8E
	LDA.l !fx_nmipal+4
	STA.l !FXT_BOX+$90
	LDA.l !fx_cpend
	STA.l !FXT_BOX+$92
	LDA.l !fx_frame
	STA.l !FXT_BOX+$94
	LDA.l !fx_vbl
	STA.l !FXT_BOX+$96
	LDA.l !fx_vbl_end
	STA.l !FXT_BOX+$98
	LDA.l !fx_upl
	STA.l !FXT_BOX+$9A
	LDX.w #$0000
.loop
	LDA.l !FXT_BOX,X
	AND.w #$00FF
	BNE +
	JMP .next
+	PHX
	PHA
	SEP #$20
	LDA.l !FXT_BOX+3,X
	STA.l !fx_dir
	LDA.l !FXT_BOX+$A0
	STA.l !fx_style
	REP #$20
	LDA.l !FXT_BOX+8,X
	STA.l !fx_a
	LDA.l !FXT_BOX+$A,X
	STA.l !fx_b
	LDA.l !FXT_BOX+$C,X
	STA.l !fx_c
	LDA.l !FXT_BOX+$E,X
	STA.l !fx_t
	LDA.l !FXT_BOX+$A2
	STA.l !fx_rgb
	LDA.l !FXT_BOX+$A4
	STA.l !fx_rgb+2
	LDA.l !FXT_BOX+$A6
	STA.l !fx_rgb+4
	PLA
	CMP.w #1
	BEQ .spawn
	CMP.w #2
	BEQ .draw
	CMP.w #3
	BEQ .beam
	CMP.w #4
	BEQ .flash
	CMP.w #5
	BEQ .quake
	CMP.w #6
	BEQ .killall
	CMP.w #7
	BEQ .hold
	PLX
	BRA .next
.hold
	LDA $01,S
	TAX
	JSR .args
	JSL fx_draw
	PLX
	BRA .next
.spawn
	LDA $01,S
	TAX
	JSR .args
	JSL fx_spawn
	BCC +
	LDA.w #$FFFF
+	STA.l !FXT_BOX+$80
	BRA .once
.draw
	LDA $01,S
	TAX
	JSR .args
	JSL fx_draw
	BRA .tick
.beam
	LDA $01,S
	TAX
	JSR .args
	JSL fx_beam
	BRA .tick
.flash
	LDA.l !fx_a
	JSL fx_flash
	BRA .once
.quake
	LDA.l !fx_a
	JSL fx_quake
	BRA .once
.killall
	JSL fx_kill_all
.once
	PLX
	SEP #$20
	LDA.b #$00
	STA.l !FXT_BOX,X
	REP #$20
	BRA .next
.tick
	PLX
	LDA.l !FXT_BOX+$E,X
	INC
	STA.l !FXT_BOX+$E,X
.next
	TXA
	CLC
	ADC.w #16
	TAX
	CPX.w #$0080
	BCS +
	JMP .loop
+	RTS

; X = entry offset -> A = kind | flags<<8, X = x, Y = y.
.args
	LDA.l !FXT_BOX+6,X
	TAY
	LDA.l !FXT_BOX+1,X           ; kind (low) | flags (high)
	PHA
	LDA.l !FXT_BOX+4,X
	TAX
	PLA
	RTS

; Current scanline (0-261) in A16.
fx_test_vline:
	SEP #$20
	LDA.l $00213F
	LDA.l $002137
	LDA.l $00213D
	XBA
	LDA.l $00213D
	AND.b #$01
	XBA
	REP #$20
	RTS
