; Round-seven state aliases unused stream channel 1; rare lines use channel 0.

; M16/X16, DB=$7E: combat's already gated loop binding. Same browser levels
; as PCM, in generated lookup tables; no per-frame multiplies or new calls
; to the audio_loop prologue. Other modules keep using the public loop API.
audio_combat_loops:
	; Focus/transformation cancel charging first. Byte gates keep the usual
	; held-charge ownership refresh cheap without changing its envelope.
	SEP #$20
	LDA.w !cb_charging
	BEQ .action
	; The dispatcher cannot use a new quantized value during its cooldown.
	; Refresh ownership only; read the envelope table when an update is due.
	LDA.w !au_bed_wait
	BEQ .charge
	LDA.w !au_lvl
	BEQ .charge
	REP #$20
	STZ.w !au_age
	RTL
.action
	LDA.w !cb_act
	CMP.b #!GOKU_K_TRANSFORM
	BEQ .transform
	CMP.b #!GOKU_K_FOCUS
	BEQ .focus
	REP #$20
	RTL
.charge
	REP #$20
	LDA.w !cb_charge
	ASL : ASL
	TAX
	LDA.w !cb_form
	AND.w #$00FF
	BNE .super
	LDA.l audio_charge_levels,X
	STA.w !au_lvl
	LDA.l audio_charge_levels+2,X
	BRA .rates
.super
	LDA.l audio_super_levels,X
	STA.w !au_lvl
	LDA.l audio_super_levels+2,X
	BRA .rates
.focus
	REP #$20
	LDA.w !cb_power
	CMP.w #96
	BCC +
	LDA.w #96
+	ASL : ASL
	TAX
	LDA.l audio_focus_levels,X
	STA.w !au_lvl
	LDA.l audio_focus_levels+2,X
	BRA .rates
.transform
	REP #$20
	LDA.w #$FFD9
	STA.w !au_lvl
	LDA.w #$8080
.rates
	STA.w !au_rate
	STZ.w !au_age
	SEP #$20
	LDA.w !au_wake
	BNE +
	LDA.b #1
	STA.w !au_wake
+	REP #$20
.out
	RTL

; M8/X16. Called only by the existing selector, once after any one-shot.
; Changes share the native queue/async dispatcher. Stops bypass the 12-frame
; throttle; levels/rates are quantized to steps of 16/4, unchanged values do
; not send anything. AIR is intentionally silent (music voice budget).
audio_beds_age:
	REP #$20
	LDA.w !au_age
	AND.w #$FEFE
	BNE .old
	LDA.w !au_age
	CLC
	ADC.w #$0101
	STA.w !au_age
	SEP #$20
	BRA .aged
.old
	SEP #$20
	LDX.w #0
.loop
	LDA.w !au_age,X
	CMP.b #2
	BCC +
	LDA.w !au_lvl,X
	BEQ ++
	STZ.w !au_lvl,X
	STZ.w !au_bed_wait
	BRA ++
+	INC.w !au_age,X
++	INX
	CPX.w #2
	BNE .loop
.aged
	LDA.w !au_bed_wait
	BEQ +
	DEC.w !au_bed_wait
+	LDA.w !au_lvl
	ORA.w !au_lvl+1
	ORA.w !au_bed_level
	ORA.w !au_bed_level+1
	STA.w !au_bed
	RTS

audio_beds_service:
	LDA.w !au_bed
	BEQ .out
	LDA.w !au_lvl
	ORA.w !au_lvl+1
	BEQ .stop
	LDA.w !au_bed_wait
	BNE .out
.stop
	LDA.w !au_backoff
	ORA.w !au_pending
	ORA.w $1E00
	ORA.l $002140
	BNE .out
	REP #$20
	LDA.l !core_snd_head
	CMP.l !core_snd_tail
	SEP #$20
	BNE .out
	LDA.w !au_bed_index
	AND.b #1
	TAX
	LDY.w #2                  ; round robin: rising charge must not starve aura
.next
	LDA.w !au_lvl,X
	AND.b #$F0
	STA.w !au_tmp+2
	BEQ .check             ; stop promptly even after a recent update
	LDA.w !au_bed_wait
	BNE .skip
.check
	LDA.w !au_rate,X
	AND.b #$FC
	STA.w !au_tmp+3
	LDA.w !au_tmp+2
	CMP.w !au_bed_level,X
	BNE .send
	CMP.b #0
	BEQ .skip
	LDA.w !au_tmp+3
	CMP.w !au_bed_rate,X
	BNE .send
.skip
	TXA
	EOR.b #1
	TAX
	DEY
	BNE .next
	LDA.b #12
	STA.w !au_bed_wait
.out
	RTS
.send
	LDA.b #12
	STA.w !au_bed_wait
	TXA
	EOR.b #1
	STA.w !au_bed_index
	LDA.w !au_tmp+3
	STA.w $1E03
	LDA.w !au_tmp+2
	STA.w $1E02
	TXA
	CLC
	ADC.b #$ED
	XBA
	LDA.b #$81
	REP #$20
	STA.w $1E00
	; The queue and native mailbox were both checked idle above. Dispatch
	; the bed now, avoiding a round trip through the core's SRAM ring. Shots
	; and songs still take precedence; this is the same bounded async driver.
	JSL $C30004
	SEP #$20
	RTS

; Native weapon-charge tick at C0:B3ED. Filter the actor at its source,
; leaving the original game's companions and native hero unchanged. The
; displaced LDA #$A7 / JSR $BB27 and $BB11 are replayed for those actors.
audio_weapon_charge:
	CPX.w #0
	BNE .native
	LDA.l !persist_goku_active
	BEQ .native
	LDA.l $7E0000|!goku_ctl
	AND.b #!GOKU_CTL_SUPPRESS
	BNE .native
	RTL
.native
	LDA.l $7EE02C,X
	BEQ .out
	LDA.b #$A7
	STA $95
	LDA.l $7EE020,X
	AND.b #$F0
	STA.w $0118
	LSR : LSR : LSR : LSR
	ORA.w $0118
	STA.w $0119
.out
	RTL

; World takeoff hands off to a loader before the next field selector. Queue
; its resident command now, so the menu/pause callback cannot discard it.
; Main thread only; same asynchronous dispatcher as every other effect.
audio_world_takeoff:
	PHP
	REP #$30
	PHA
	PHX
	LDA.w #$EC02
	LDX.w #$880F
	JSL core_sound_queue
	PLX
	PLA
	PLP
	RTL
