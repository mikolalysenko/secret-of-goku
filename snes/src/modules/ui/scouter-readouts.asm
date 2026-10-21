; Field-only overlay state aliases world-only UI storage. Never survives a
; world/menu transition; the radio, placement, STATUS and their buffers keep
; their own storage. All addresses below are in the existing UI allocation.
!sc_last = !RAM_UI+$4E            ; last prepared UI frame (world IRQ idle)
!sc_numbers = !RAM_UI+$50         ; actors whose complete number was emitted
!sc_corners = !RAM_UI+$52         ; actors whose reticles were emitted
!sc_lastfx = !RAM_UI+$80          ; detect an FX idle frame for cache aging
!sc_age = !RAM_UI+$58             ; 13 words: $FFFF absent, bit15 Analyzer
!sc_key0 = !RAM_UI+$72            ; Goku charge/form/gi signature
!sc_keyf = !RAM_UI+$74
!sc_map = !RAM_UI+$76
!sc_pal = !RAM_UI+$78             ; OBJ palette/priority attr bits, 0 hidden
!sc_mod = !RAM_UI+$7A             ; generic power multiplier
!sc_pending = !RAM_UI+$7C         ; FX entries with outstanding core DMA
!sc_on = !RAM_UI+$7E
!sc_fmt = !RAM_UI+$88             ; 13 words: offset in generated formats
!sc_shown = !RAM_UI+$A2           ; Goku number committed for display
!sc_stage = !RAM_UI+$A4           ; Goku number awaiting residency
!sc_keys = !SRAM_WORK_UI+$2FC     ; 11 max-HP signatures (world radar cache)

ui_sc_start:
	LDA.w !ui_sc&$FFFF
	BIT.w #!UISC_ACTIVE
	BNE .done
	ORA.w #!UISC_ACTIVE
	STA.w !ui_sc&$FFFF
	LDX.w #24
	LDA.w #$FFFF
-	STA.w !sc_age&$FFFF,X
	STA.w !sc_fmt&$FFFF,X
	DEX : DEX
	BPL -
	STA.w !sc_key0&$FFFF
	STA.w !sc_keyf&$FFFF
	STA.w !sc_shown&$FFFF
	STA.w !sc_stage&$FFFF
	STZ.w !sc_pending&$FFFF
	STZ.w !sc_pal&$FFFF
	STZ.w !sc_mod&$FFFF
	LDA.l !fx_frame
	STA.w !sc_lastfx&$FFFF
	LDA.w !ui_frame&$FFFF
	STA.w !sc_last&$FFFF
	LDA.w $00DC
	STA.w !sc_map&$FFFF
.done
	RTS

; Call before world code reuses its state (and before STATUS reuses SRAM).
ui_sc_leave:
	LDA.w !ui_sc&$FFFF
	AND.w #!UISC_ACTIVE|!UISC_DRAW
	BEQ .done
	JSR ui_sc_suspend
	STZ.w !ui_front_n&$FFFF
	LDA.w #!UISC_ACTIVE|!UISC_DRAW
	TRB.w !ui_sc&$FFFF
	LDX.w #$004C
-	STZ.w !RAM_UI&$FFFF,X
	INX : INX
	CPX.w #$0082
	BCC -
	LDX.w #$0088
-	STZ.w !RAM_UI&$FFFF,X
	INX : INX
	CPX.w #$00A6
	BCC -
.done
	RTS

; Ring menus preserve readout ages but retire all tile leases. Invalidate
; resident UI keys too: native menu/map uploads may replace their VRAM.
ui_sc_suspend:
	LDA.w !ui_sc&$FFFF
	AND.w #!UISC_RESIDENT|!UISC_DRAW
	ORA.w !sc_pending&$FFFF
	BEQ .done
	JSR ui_sc_cancel_uploads
	LDX.w #0
-	LDA.l !fx_ccell,X
	CMP.w #$8000
	BCC +
	CMP.w #$FFFE
	BCS +
	LDA.w #$FFFF
	STA.l !fx_ccell,X
+	INX : INX
	CPX.w #30
	BCC -
	STZ.w !sc_pal&$FFFF
	LDA.w #!UISC_DRAW|!UISC_RESIDENT
	TRB.w !ui_sc&$FFFF
.done
	RTS

; Native incoming spell store, C0:3FAD (M8, X16; Y=target offset).
; Detect the write itself, including two Analyzer casts to the same target.
ui_sc_analyzer_hook:
	STA.w $E181,Y
	REP #$20
	PHP : PHA : PHX : PHY : PHB : PHD
	PEA $7E7E : PLB : PLB
	PEA $0000 : PLD
	JSR ui_sc_analyzer_hit
	PLD : PLB : PLY : PLX : PLA : PLP
	JML $C03FB2

; Shared hit handler also exercised by the UI test client (A=spell,Y=slot).
ui_sc_analyzer_hit:
	AND.w #$00FF
	CMP.w #$0017
	BNE .done
	JSR ui_sc_owned
	BCC .done
	CPY.w #$1800
	BCS .done
	JSR ui_ram_check
	JSR ui_sc_start
	TYA : XBA : AND.w #$001E : TAX
	LDA.w #$8000
	STA.w !sc_age&$FFFF,X
	LDA.w #!UIS_IDLE
	TRB.w !ui_state&$FFFF
.done
	RTS
%orig3($C03FAD, $E18199)
%orig2($C03FB0, $20C2)
%hijack($C03FAD, ui_sc_analyzer_hook, 5, ui)

; C set if actor X (native offset, $1800 = Frieza) is living/on screen.
; Returns Y=record byte offset and signed screen coordinates in tmp0/1.
ui_sc_actor:
	CPX.w #$1800
	BEQ .frieza
	LDA.w $E000,X
	LSR
	BCC .no
	LDA.w $E182,X
	BEQ .no
	LDA.w $E180,X
	AND.w #$00FF
	CMP.w #$0055
	BEQ .no
	CPX.w #$0600
	BCC +
	CMP.w #$0080
	BCS .no
+	LDA.w $E020,X
	STA.w !ui_tmp0&$FFFF
	LDA.w $E022,X
	BRA .position
.frieza
	PHX
	JSL frieza_virtual_target
	BCC .noPop
	TXA
	SEC : SBC.w $E002 : CLC : ADC.w $E020
	STA.w !ui_tmp0&$FFFF
	TYA
	SEC : SBC.w $E004 : CLC : ADC.w $E022
	PLX
.position
	STA.w !ui_tmp1&$FFFF
	CLC : ADC.w #15
	CMP.w #255
	BCS .no
	LDA.w !ui_tmp0&$FFFF
	CLC : ADC.w #15
	CMP.w #287
	BCS .no
	TXA : XBA : AND.w #$001E : TAY
	SEC
	RTS
.noPop
	PLX
.no
	CLC
	RTS

; Called by the late renderer after FX, once a frame has spare CPU time.
; Off/empty callers take only the active-bit fast path. Analyzer wakes it
; directly at the native store; deferred frames are included in age deltas.
ui_sc_prepare:
	LDA.w !ui_sc&$FFFF
	BIT.w #!UISC_ACTIVE
	BNE +
	RTS
+	LDA.w #!UISC_DRAW
	TRB.w !ui_sc&$FFFF
	JSR ui_sc_owned
	BCS +
	JMP ui_sc_leave
+	LDA.l !ui_p_flags
	AND.w #!UIF_SCOUTER
	STA.w !sc_on&$FFFF
	LDA.w !ui_frame&$FFFF
	SEC : SBC.w !sc_last&$FFFF
	STA.w !ui_tmp0&$FFFF
	LDA.w !ui_frame&$FFFF
	STA.w !sc_last&$FFFF
	; Account for deferred frames without changing the 24/240-frame timers.
	LDX.w #24
.age
	LDA.w !sc_age&$FFFF,X
	CMP.w #$FFFF
	BEQ .nextAge
	BIT.w #$8000
	BNE .temporary
	LDY.w !sc_on&$FFFF
	BEQ .expire
	CMP.w #24
	BCS .nextAge
	CLC : ADC.w !ui_tmp0&$FFFF
	CMP.w #24
	BCC .storeAge
	LDA.w #24
	BRA .storeAge
.temporary
	CLC : ADC.w !ui_tmp0&$FFFF
	CMP.w #$8000+!UI_SC_LIFETIME+1
	BCC .storeAge
.expire
	LDA.w #$FFFF
.storeAge
	STA.w !sc_age&$FFFF,X
.nextAge
	DEX : DEX
	BPL .age
	; visibleState: field, no menu/transition/forced blank or set piece.
	LDA.w !ui_block&$FFFF
	BNE .hidden
	LDA.w $00E4
	CMP.w #$0101
	BNE .hidden
	LDA.w $0100
	CMP.w #$A85C
	BNE .hidden
	LDA.w !RAM_FRIEZA+$08&$FFFF       ; cinematic scene (public fz_scene)
	AND.w #$00FF
	BNE .hidden
	BRA .visible
.hidden
	RTS
.visible
	; Browser modifiers are story providers, not duplicate progress flags.
	LDA.w #1
	STA.w !ui_tmp4&$FFFF
	LDA.w $00DC
	CMP.w #253
	BNE +
	LDA.w #!STORY_Q_BEAST_FED
	JSR ui_story_query
	BEQ +
	LDA.w #4
	STA.w !ui_tmp4&$FFFF
+	LDA.w #!STORY_Q_FRIEZA_TRIAL
	JSR ui_story_query
	BEQ +
	LDA.w !ui_tmp4&$FFFF
	ASL : ASL : CLC : ADC.w !ui_tmp4&$FFFF : ASL
	STA.w !ui_tmp4&$FFFF
+	LDA.w !ui_tmp4&$FFFF
	CMP.w !sc_mod&$FFFF
	BEQ .actors
	STA.w !sc_mod&$FFFF
	LDX.w #20
	LDA.w #$FFFF
-	STA.l !sc_keys,X
	DEX : DEX
	BPL -
.actors
	STZ.w !sc_keyf&$FFFF
	STZ.w !ui_tmp5&$FFFF
	LDX.w #0
.loop
	PHX
	JSR ui_sc_actor
	BCC .absent
	LDA.w !sc_age&$FFFF,Y
	CMP.w #$FFFF
	BNE .reading
	LDA.w !sc_on&$FFFF
	BEQ .next
	LDA.w #0
	STA.w !sc_age&$FFFF,Y
	LDA.w #$FFFF
	STA.w !sc_fmt&$FFFF,Y
.reading
	INC.w !ui_tmp5&$FFFF
	JSR ui_sc_power
	BRA .next
.absent
	TXA : XBA : AND.w #$001E : TAY
	LDA.w #$FFFF
	STA.w !sc_age&$FFFF,Y
.next
	PLX
	TXA : CLC : ADC.w #$0200 : TAX
	CPX.w #$1A00
	BCC .loop
	LDA.w !ui_tmp5&$FFFF
	BNE +
	; With the switch off and no temporary targets, return to the idle path.
	LDA.w !sc_on&$FFFF
	BNE .done
	JMP ui_sc_leave
+	LDA.w #!UISC_DRAW
	TSB.w !ui_sc&$FFFF
.done
	RTS

; Recompute only when max HP / modifiers or charge / form / weights change.
; The generated charge table is powerLevel() for all 91 input ticks.
ui_sc_power:
	CPX.w #$0000
	BNE +
	JMP .goku
+
	CPX.w #$1800
	BNE +
	JMP .frieza
+	LDA.w $E184,X
	PHX
	TYX
	CMP.l !sc_keys-2,X
	BNE +
	LDA.w !sc_fmt&$FFFF,X
	CMP.w #$FFFF
	BEQ +
	PLX
	RTS
+	LDA.w !sc_keyf&$FFFF
	BEQ +
	PLX
	RTS
+	INC.w !sc_keyf&$FFFF
	LDA $01,S
	TAX
	LDA.w $E184,X
	PHA
	TYX
	PLA
	STA.l !sc_keys-2,X
	PLX
	CMP.w #1
	BCS +
	LDA.w #1
+	STA.w !ui_tmp0&$FFFF
	LDA.w !sc_mod&$FFFF
	ASL
	STA.w !ui_tmp2&$FFFF
	CPX.w #$0600
	BCS +
	CLC : ADC.w !sc_mod&$FFFF
	BRA ++
+	ASL
++	STA.w !ui_tmp2&$FFFF              ; 3/4 times Beast/trial factor
	STZ.w !ui_tmp1&$FFFF
	STZ.w !ui_tmp3&$FFFF
	STZ.w !ui_tmp4&$FFFF
	; Exact 16*8 -> 32 product, at most eight iterations.
.mul
	LSR.w !ui_tmp2&$FFFF
	BCC +
	LDA.w !ui_tmp1&$FFFF
	CLC : ADC.w !ui_tmp0&$FFFF
	STA.w !ui_tmp1&$FFFF
	LDA.w !ui_tmp3&$FFFF
	ADC.w !ui_tmp4&$FFFF
	STA.w !ui_tmp3&$FFFF
+	LDA.w !ui_tmp2&$FFFF
	BEQ .rounded
	ASL.w !ui_tmp0&$FFFF
	ROL.w !ui_tmp4&$FFFF
	BRA .mul
.rounded
	; Select scale by thresholds 100,1000,...; round with half the divisor.
	PHY
	LDX.w #0
.scale
	LDA.w !ui_tmp3&$FFFF
	CMP.l ui_sc_thresholds+2,X
	BCC .scaleFound
	BNE .larger
	LDA.w !ui_tmp1&$FFFF
	CMP.l ui_sc_thresholds,X
	BCC .scaleFound
.larger
	INX : INX : INX : INX
	CPX.w #24
	BCC .scale
.scaleFound
	TXA : LSR : TAY
	LDA.w !ui_tmp1&$FFFF
	CLC : ADC.l ui_sc_halves,X
	STA.w !ui_tmp1&$FFFF
	LDA.w !ui_tmp3&$FFFF
	ADC.l ui_sc_halves+2,X
	STA.w !ui_tmp3&$FFFF
	STZ.w !ui_tmp2&$FFFF
.divide
	LDA.w !ui_tmp1&$FFFF
	SEC : SBC.l ui_sc_divisors,X
	STA.w !ui_tmp0&$FFFF
	LDA.w !ui_tmp3&$FFFF
	SBC.l ui_sc_divisors+2,X
	BCC .quotient
	STA.w !ui_tmp3&$FFFF
	LDA.w !ui_tmp0&$FFFF
	STA.w !ui_tmp1&$FFFF
	INC.w !ui_tmp2&$FFFF
	BRA .divide
.quotient
	LDA.w !ui_tmp2&$FFFF
	CMP.w #100
	BCC +
	LDA.w #10
	INY : INY
+	TYX
	CLC : ADC.l ui_sc_scale_base,X
	ASL : STA.w !ui_tmp0&$FFFF
	ASL : ASL : CLC : ADC.w !ui_tmp0&$FFFF
	PLY
	STA.w !sc_fmt&$FFFF,Y
	RTS
.goku
	LDA.w !RAM_COMBAT+$26&$FFFF       ; cb_charge
	CMP.w #91
	BCC +
	LDA.w #90
+	STA.w !ui_tmp0&$FFFF
	LDA.w !RAM_COMBAT+$28&$FFFF       ; cb_charging
	AND.w #$00FF
	BNE +
	STZ.w !ui_tmp0&$FFFF
+	LDA.w !goku_form
	AND.w #$00FF
	BEQ +
	LDA.w !ui_tmp0&$FFFF
	CLC : ADC.w #182
	STA.w !ui_tmp0&$FFFF
+	LDA.w $E1E1
	AND.w #$00FF
	CMP.w #!UI_SC_GI
	BNE +
	LDA.w !ui_tmp0&$FFFF
	CLC : ADC.w #91
	STA.w !ui_tmp0&$FFFF
+	LDA.w !ui_tmp0&$FFFF
	CMP.w !sc_key0&$FFFF
	BNE +
	LDA.w !sc_fmt&$FFFF
	CMP.w #$FFFF
	BNE .done
+	LDA.w !ui_tmp0&$FFFF
	STA.w !sc_key0&$FFFF
	ASL : TAX
	LDA.l ui_sc_charge,X
	STA.w !sc_fmt&$FFFF
.done
	RTS
.frieza
	LDA.w !RAM_FRIEZA+$6F&$FFFF
	AND.w #2
	TAX
	LDA.l ui_sc_frieza,X
	STA.w (!sc_fmt&$FFFF)+24
	RTS
ui_sc_thresholds:
	dd 100,1000,10000,100000,1000000,10000000,100000000
ui_sc_divisors:
	dd 1,10,100,1000,10000,100000,1000000
ui_sc_halves:
	dd 0,5,50,500,5000,50000,500000
ui_sc_scale_base:
	dw 0,100,200,300,400,500,600,700

; Allocate AFTER FX: first a free palette, otherwise the two unused tail
; colours of an FX palette whose generated metadata proves them spare.
ui_sc_palette:
	STZ.w !sc_pal&$FFFF
	LDA.w !ui_tmp0&$FFFF
	EOR.w #$00FC
	AND.w #$00FC
	STA.w !ui_tmp0&$FFFF
.choose
	LDX.w #0
.try
	LDA.l fx_pal_pref_bit,X
	AND.w !ui_tmp0&$FFFF
	BNE .free
	INX : INX
	CPX.w #12
	BCC .try
	; An idle FX callback leaves its previous palette map untouched. Only
	; this frame's allocations establish ownership of spare colours.
	LDA.l !fx_tick
	CMP.w !core_tick&$FFFF
	BEQ +
	RTS
+	LDX.w #0
.share
	LDA.l fx_overlay_spare,X
	AND.w #$00FF
	BEQ .next
	LDA.l !fx_clspal,X          ; this frame; nmipal is the last uploaded OAM
	AND.w #$00FF
	CMP.w #8
	BCC .got
.next
	INX
	CPX.w #!FX_CLASS_COUNT
	BCC .share
	RTS
.free
	LDA.l fx_pal_pref_num,X
.got
	ASL : XBA : ORA.w #$3000
	STA.w !sc_pal&$FFFF
	RTS

; Tiny vblank palette update, no DMA; UI owns these two entries only while
; this completed frame uses the selected free/shared OBJ palette.
ui_sc_field_nmi:
	LDA.l !ui_sc
	BIT.w #!UISC_DRAW
	BEQ .done
	LDA.l !sc_pal
	BEQ .done
	XBA : AND.w #$000E
	ASL : ASL : ASL
	ORA.w #$008E
	SEP #$20
	STA $2121
	LDA.b #!UI_SC_SHADOW&$FF : STA $2122
	LDA.b #!UI_SC_SHADOW>>8 : STA $2122
	LDA.b #!UI_SC_GREEN&$FF : STA $2122
	LDA.b #!UI_SC_GREEN>>8 : STA $2122
	REP #$20
.done
	RTL

; Retire only this module's deferred transfers before menus/map loads reuse
; OBJ VRAM. Match a pending leased cell's two 64-byte rows; leave every
; other core queue entry, its order, and its byte budget intact. The field
; frame is not published yet (or this is the menu/ring vblank callback).
ui_sc_cancel_uploads:
	LDA.w !sc_pending&$FFFF
	BNE +
	RTS
+	STZ.w !ui_tmp0&$FFFF              ; read offset
	STZ.w !ui_tmp1&$FFFF              ; write offset
	LDA.l !core_dma_count
	STA.w !ui_tmp2&$FFFF
.loop
	LDA.w !ui_tmp2&$FFFF
	BNE +
	JMP .invalidate
+
	LDX.w !ui_tmp0&$FFFF
	LDA.l !core_dma_table+6,X
	CMP.w #64
	BNE .keep
	LDA.l !core_dma_table+4,X
	AND.w #$FEFF
	STA.w !ui_tmp4&$FFFF
	LDX.w #0
.match
	LDA.l fx_entry_bit,X
	AND.w !sc_pending&$FFFF
	BEQ .next
	LDA.l fx_entry_vram,X
	CMP.w !ui_tmp4&$FFFF
	BEQ .remove
.next
	INX : INX
	CPX.w #30
	BCC .match
.keep
	LDX.w !ui_tmp0&$FFFF
	LDA.l !core_dma_table,X : PHA
	LDA.l !core_dma_table+2,X : PHA
	LDA.l !core_dma_table+4,X : PHA
	LDA.l !core_dma_table+6,X : PHA
	LDX.w !ui_tmp1&$FFFF
	PLA : STA.l !core_dma_table+6,X
	PLA : STA.l !core_dma_table+4,X
	PLA : STA.l !core_dma_table+2,X
	PLA : STA.l !core_dma_table,X
	TXA : CLC : ADC.w #8 : STA.w !ui_tmp1&$FFFF
	BRA .advance
.remove
	LDA.l !core_dma_bytes
	SEC : SBC.w #64
	STA.l !core_dma_bytes
	LDA.l !core_dma_count
	DEC
	STA.l !core_dma_count
.advance
	LDA.w !ui_tmp0&$FFFF
	CLC : ADC.w #8 : STA.w !ui_tmp0&$FFFF
	DEC.w !ui_tmp2&$FFFF
	JMP .loop
.invalidate
	LDX.w #0
-	LDA.l fx_entry_bit,X
	AND.w !sc_pending&$FFFF
	BEQ +
	LDA.l !fx_ccell,X
	CMP.w #$8000
	BCC +
	CMP.w #$FFFE
	BCS +
	LDA.w #$FFFF
	STA.l !fx_ccell,X
+	INX : INX
	CPX.w #30
	BCC -
	STZ.w !sc_pending&$FFFF
	RTS
