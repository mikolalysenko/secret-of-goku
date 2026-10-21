; Impact frames of connected blows (engine/impact-art.js, mana-mod.js
; strike()): FX_HIT, the impact spark with its starburst, the kick's
; shockwave and the struck actor drawn white, and the camera kick (an API
; with its own vblank write). Renderers run inside fx_frame's direct-page
; frame (DB = $7E, M16/X16); fx_kick is a JSL entry point; fx_nmi_kick runs
; in fx_nmi (DB = $80).

; ---------------------------------------------------------------------------
; FX_HIT (C = FX_IMP_*): the impact spark (fx_k_impact) and the impact frame
; of the blow, timed in frames since the spawn through the contact hold
; (age + hold at the spawn - hold left): the starburst for 2 frames, in
; front of the natives and over the spark, and the finishing kick's
; shockwave for FX_SHOCK_FRAMES from FX_SHOCK_DELAY on, behind them. Both
; draw in the spark's own class (gold for FX_F_GOLD) from the shared cells
; of impact-art.js.
fx_k_hit:
	LDA !d_cur+!C_C               ; life | hold left << 8
	XBA
	AND.w #$00FF
	EOR.w #$FFFF
	SEC
	ADC !d_cur+!C_T               ; age - hold left
	CLC
	ADC !d_cur+!C_B               ; + hold at the spawn
	STA !d_ks+12                  ; frames since the spawn
	CMP.w #2
	BCS .shock
	LDA !d_cur+!C_A
	AND.w #!FX_IMP_STAR
	BEQ .shock
	DEC                           ; size 0-3
	STA !d_ks+10
	LDA !d_cur+!C_KIND
	AND.w #!FX_F_GOLD<<8
	BEQ +
	LDA.w #4
	TSB !d_ks+10
+	LDA.w #!FX_E_FRONT
	JSR fx_depth
	LDX.w #$0000
	LDY.w #$0000
	JSR fx_at
	LDA !d_ks+10                  ; sizes 1-3: one cell in four quadrants
	AND.w #$0003
	BEQ +
	LDA !d_ef
	BEQ +
	LDA.w #!FX_ASM_STAR
	CLC
	ADC !d_ks+10
	JSR fx_emit_quad
	BRA .shock
+	LDA.w #!FX_ASM_STAR
	CLC
	ADC !d_ks+10
	JSR fx_emit
.shock
	LDA !d_cur+!C_A
	AND.w #!FX_IMP_SHOCK
	BEQ .spark
	LDA !d_ks+12
	SEC
	SBC.w #!FX_SHOCK_DELAY
	CMP.w #!FX_SHOCK_FRAMES       ; (before the delay: negative, also past)
	BCS .spark
	STA !d_ks+10
	LDA !d_cur+!C_KIND
	AND.w #!FX_F_GOLD<<8
	BEQ +
	LDA !d_ks+10
	CLC
	ADC.w #!FX_SHOCK_FRAMES
	STA !d_ks+10
+	LDA.w #$0000
	JSR fx_depth
	LDA.w #!FX_ASM_SHOCK
	CLC
	ADC !d_ks+10
	JSR fx_emit_here
.spark
	JMP fx_k_impact

; ---------------------------------------------------------------------------
; fx_warm: A = blow (0 jab, 1 cross, 2 kick) | gold << 8, X = facing (0-3).
; Readies the cells of a coming contact (fx_warm_list: the impact spark's
; first picture, the starburst and, for the kick, the shockwave), so their
; uploads land before the contact's busy vblank. All resident, they count
; as used in this fx frame, the regions stay held and A = !fx_evict
; (nothing else happens: fx_frame stays idle). Otherwise an FX_PREP draw
; brings the missing ones in and A = $FFFF. A caller may skip the call while !fx_evict still equals the A
; of its last warm call. Combat calls it in a punch's wind-up. JSL,
; M16/X16, DB = $7E; X/Y clobbered.
fx_warm:
	PHA                           ; $03,S: blow | gold << 8
	TXA
	AND.w #$0003
	PHA                           ; $01,S: facing
	LDA $03,S
	AND.w #$00FF
	CMP.w #3
	BCS .none
	LDA $03,S                     ; record ((gold * 3 + blow) * 4 + facing) * 16
	AND.w #$0100
	BEQ +
	LDA.w #3
+	CLC
	ADC $03,S
	AND.w #$00FF
	ASL
	ASL
	ADC $01,S
	ASL
	ASL
	ASL
	ASL
	TAX
	LDA.l !fx_magic
	CMP.w #!FX_MAGIC
	BNE .prep
	LDA.l !fx_regions
	BEQ .prep
.cell
	LDA.l fx_warm_list,X
	BMI .out
	AND.w #$01FF
	STA.l !fx_s+8                 ; cell id
	PHX
	AND.w #!FX_HASH_SIZE-1
	TAX
	LDA.l !fx_hash,X
	AND.w #$00FF
	CMP.w #30
	BCS .cold
	TAX
	LDA.l !fx_ccell,X
	CMP.l !fx_s+8
	BNE .cold
	LDA.l !fx_frame               ; used now: the last to be evicted
	STA.l !fx_cused,X
	PLX
	INX
	INX
	BRA .cell
.out
	LDA.w #$0000                  ; punching keeps the regions held
	STA.l !fx_idle
	LDA.l !fx_evict
	AND.w #$00FF
	PLY
	PLY
	RTL
.none
	PLA
	PLA
	LDA.w #$FFFF
	RTL
.cold
	PLX
.prep
	SEP #$20
	LDA $01,S
	STA.l !fx_dir
	REP #$20
	LDA $03,S
	AND.w #$00FF
	STA.l !fx_a
	LDA $03,S
	AND.w #$0100
	BEQ +
	LDA.w #!FX_F_GOLD<<8
+	ORA.w #!FX_PREP
	PLX
	PLX
	LDX.w #$0000
	LDY.w #$0000
	JSL fx_draw
	LDA.w #$FFFF
	RTL

; FX_PREP (fx_warm; !C_A blow, !C_DIR facing, FX_F_GOLD): nothing is
; drawn. The contact's cells are resolved, so the missing ones upload in
; this vblank; at most two new ones per fx frame (the next wind-up frame
; brings the rest). The palettes their classes took are given back: no
; sprite shows them.
fx_k_prep:
	LDA.l !fx_palfree
	STA !d_ks+0
	LDA.l !fx_clspal
	STA !d_ks+2
	LDA.l !fx_clspal+2
	STA !d_ks+4
	LDA.l !fx_clspal+4
	STA !d_ks+6
	LDA.l !fx_clspal+6            ; (and nmipal's first byte, unchanged)
	STA !d_ks+8
	JSR .cells
	LDA !d_ks+0
	STA.l !fx_palfree
	LDA !d_ks+2
	STA.l !fx_clspal
	LDA !d_ks+4
	STA.l !fx_clspal+2
	LDA !d_ks+6
	STA.l !fx_clspal+4
	LDA !d_ks+8
	STA.l !fx_clspal+6
	LDA.w #$FFFF                  ; its OAM words named those palettes
	STA !d_lastc
	RTS
.cells
	LDA !d_cur+!C_A
	AND.w #$00FF
	CMP.w #3
	BCS .out
	STA !d_ks+12
	LDA !d_cur+!C_KIND
	AND.w #!FX_F_GOLD<<8
	BEQ +
	LDA.w #3
	CLC
	ADC !d_ks+12
	STA !d_ks+12
+	LDA !d_ks+12                  ; ((gold * 3 + blow) * 4 + facing) * 16
	ASL
	ASL
	STA !d_ks+12
	LDA !d_cur+!C_DIR
	AND.w #$0003
	ORA !d_ks+12
	ASL
	ASL
	ASL
	ASL
	TAX
	LDA.l !fx_cbudget             ; two new cells at most
	SEC
	SBC.w #2
	BPL +
	LDA.w #$0000
+	STA !d_ks+14
.cell
	LDA.l fx_warm_list,X
	BMI .out
	PHX
	JSR fx_resolve
	PLX
	LDA.l !fx_cbudget
	CMP !d_ks+14
	BEQ .out
	BCC .out
	INX
	INX
	BRA .cell
.out
	RTS

; ---------------------------------------------------------------------------
; The struck actor of an FX_HIT (C bits 4-7) draws white in the spawn's fx
; frame and the next: its body, as the native OAM build placed it this
; frame, takes the all-white palette class. Served before every other
; draw, so the white class gets its palette first; only while !fx_wdue
; runs (fx_frame_body, with the palette scan's counts). When the palette
; scan finds no more sprites in the actor's palette than it has body parts,
; that palette is the actor's alone and its CGRAM row turns white for this
; frame (the game's next upload restores it): no OAM entry changes.
; Otherwise (shared palette, or a second flash in the frame) the body's
; entries move to the white class's palette, found by the first part's
; tile and attribute. Nothing is drawn when no palette is left. Only the
; struck actor flashes, never every actor of its species.
!wh_act  = !d_ks+0             ; actor offset
!wh_n    = !d_ks+2             ; its descriptor parts
!wh_end  = !d_ks+4             ; end of the native OAM entries (bytes)
!wh_run0 = !d_ks+6             ; its first OAM entry (byte offset)
!wh_pal  = !d_ks+10            ; its attribute palette bits (palette * 2)
!wh_w    = !d_ks+12            ; word matched / palette bits written

fx_whiten_pass:
	SEP #$20                      ; one of its frames gone
	LDA.l !fx_wdue
	DEC
	STA.l !fx_wdue
	REP #$20
	LDX.w #$0000
.loop
	TXA
	CMP.l !fx_hiwater
	BCS .done
	LDA.l !fx_slots+!S_KIND,X
	AND.w #$00FF
	CMP.w #!FX_HIT
	BNE .next
	LDA.l !fx_slots+!S_A,X
	AND.w #!FX_IMP_ACTOR
	BEQ .next
	LDA.l !fx_slots+!S_AGE,X
	INC
	BEQ .white                    ; spawned this frame
	DEC
	BNE .next
	LDA.l !fx_slots+!S_LIFE,X     ; age 0 with its hold untouched: the
	EOR.l !fx_slots+!S_B-1,X      ; frame after the spawn
	AND.w #$FF00
	BNE .next
.white
	PHX
	LDA.l !fx_slots+!S_A,X
	AND.w #!FX_IMP_ACTOR
	XBA                           ; slot << 12
	LSR
	LSR
	LSR                           ; slot << 9: the actor's offset
	JSR fx_whiten_actor
	PLX
.next
	TXA
	CLC
	ADC.w #16
	TAX
	BRA .loop
.done
	RTS

fx_whiten_actor:
	STA !wh_act
	CMP.w #$0600
	BCC .out
	CMP.w #$1800
	BCS .out
	AND.w #$01FF
	BNE .out
	LDX !wh_act
	LDA.w $E083,X
	AND.w #$000F
	BEQ .out
	STA !wh_n
	LDA.w $E093,X                 ; the first part's palette
	AND.w #$000E
	STA !wh_pal
	LDA.l !fx_clspal+!FX_CLASS_WHITE
	AND.w #$00FF
	CMP.w #$00FF
	BNE .move
	LDX !wh_pal                   ; its users (the palette scan's count)
	LDA !d_tiles,X
	INC
	AND.w #$00FF
	BEQ .out                      ; nothing on screen shows it
	CMP !wh_n
	BEQ .own
	BCS .alloc
.own
	LDA !wh_pal                   ; the actor's own row turns white
	LSR
	SEP #$20
	STA.l !fx_clspal+!FX_CLASS_WHITE
	REP #$20
	LDA.l !fx_palfree
	ORA.w #$0100                  ; palette work for the upload hook
	STA.l !fx_palfree
.out
	RTS
.alloc
	LDA.w #!FX_CLASS_WHITE
	JSR fx_class_pal
	BCS .out
.move
	ASL
	STA !wh_w
	CMP !wh_pal
	BEQ .out
	; its entries: from the first part's tile and attribute, while they
	; keep showing its parts (parts off the screen are left out)
	LDA.w !core_oam_native&$FFFF
	ASL
	ASL
	STA !wh_end
	LDX !wh_act
	LDA.w $E092,X
	LDY.w #$0000
.find
	CPY !wh_end
	BCS .out
	CMP.w $0802,Y
	BEQ .found
	INY
	INY
	INY
	INY
	BRA .find
.found
	STY !wh_run0
.recolour
	SEP #$20
	LDA.w $0803,Y
	AND.b #$F1
	ORA !wh_w
	STA.w $0803,Y
	REP #$20
	INY
	INY
	INY
	INY
	CPY !wh_end
	BCS .out
	LDA.w $0802,Y                 ; (not recoloured yet)
	JSR fx_wh_part
	BCS .recolour
	RTS

; A = OAM word (tile | attribute << 8): C set when it is one of the actor's
; body parts. Preserves Y.
fx_wh_part:
	STA !d_tmp+2
	LDX !wh_act
	LDA !wh_n
	STA !d_tmp
-	LDA.w $E092,X
	CMP !d_tmp+2
	BEQ .yes
	INX
	INX
	INX
	INX
	DEC !d_tmp
	BNE -
	CLC
	RTS
.yes
	SEC
	RTS

; ---------------------------------------------------------------------------
; fx_kick: A = facing (0 down, 1 right, 2 left, 3 up) | blow << 8 (0 jab,
; 1 cross, 2 kick). The camera kicks along the blow and springs back over
; the blow's steps (fx_kick_steps, native-feedback.js KICK_PROFILES): BG1
; and BG2 move; BG3 (text, the HUD) and the sprites stay. The step of each
; fx frame is written in its vblank. Ignored in Mode 7 arenas.
; !fx_kick holds 1 + the index of the next step in fx_kick_steps and the
; facing (bits 5-6); 0 none.
fx_kick:
	JSR fx_ensure_init
	PHA
	SEP #$20
	LDA.w $0029
	AND.b #$04
	BNE .skip
	LDA $02,S                     ; blow
	CMP.b #3
	BCS .skip
	ASL
	ASL
	ASL
	INC                           ; the next fx frame shows its first step
	STA.l !fx_s+12
	LDA $01,S                     ; facing in bits 5-6
	AND.b #$03
	ASL
	ASL
	ASL
	ASL
	ASL
	ORA.l !fx_s+12
	STA.l !fx_kick
.skip
	REP #$20
	PLA
	RTL

; Once per fx frame (fx_finish): the kick's next step becomes its offset
; for the coming vblank, !fx_kickd = offset << 1 | axis (0 x, 1 y; left
; and up negative); a zero step ends it. Out: A16 nonzero (and positive)
; while it runs.
fx_kick_advance:
	LDA.l !fx_kick
	AND.w #$00FF
	BNE +
	RTS
+	STA !d_tmp
	AND.w #$001F
	TAX
	LDA.l fx_kick_steps-1,X
	AND.w #$00FF
	BEQ .over
	ASL
	STA !d_tmp+4                  ; pixels << 1
	SEP #$20
	INC !d_tmp                    ; the next step (below bit 5)
	LDA !d_tmp
	STA.l !fx_kick
	REP #$20
	LDA !d_tmp
	AND.w #$0060
	LSR
	LSR
	LSR
	LSR
	TAX                           ; facing * 2: 0 down, 1 right, 2 left, 3 up
	LDA !d_tmp+4
	CPX.w #4
	BCC +
	EOR.w #$FFFF
	INC
+	ORA.l fx_kick_axis,X
	STA.l !fx_kickd
	LDA !d_tmp
	RTS
.over
	SEP #$20
	STA.l !fx_kick                ; (A = 0)
	REP #$20
	STA.l !fx_kickd
	RTS

fx_kick_axis:                     ; by facing: 1 the vertical scroll
	dw 1, 0, 0, 1

; Vblank (fx_nmi, inside its time window; DB = $80): BG1/BG2 scroll as the
; field NMI's C0:C170 just wrote it from the game's shadows ($B0-$B6, the
; quake bits $5E/$5F, $B9), moved by the kick's offset along its axis.
; BG2's vertical scroll stays an 8-bit value, as the game writes it.
fx_nmi_kick:
	LDA.l !fx_kickd
	BNE +
	RTS
+	LSR                           ; C: the vertical scroll
	PHP
	CMP.w #$4000
	BCC +
	ORA.w #$8000                  ; the offset's sign
+	PLP
	PHA                           ; $01,S: the offset
	BCS .y
	LDA.w $005E                   ; BG1 H: ($B0 ^ ($5E & 2)) | $B1 << 8
	AND.w #$0002
	EOR.w $00B0
	CLC
	ADC $01,S
	SEP #$20
	STA.w $210D
	XBA
	STA.w $210D
	REP #$20
	LDA.w $00B9                   ; BG2 takes the quake only with $B9 set
	AND.w #$00FF
	BEQ +
	LDA.w $005E
	AND.w #$0004
	LSR
+	EOR.w $00B4                   ; BG2 H
	CLC
	ADC $01,S
	SEP #$20
	STA.w $210F
	XBA
	STA.w $210F
	REP #$20
	PLA
	RTS
.y
	LDA.w $005F                   ; BG1 V: ($B2 ^ ($5F & 2)) | $B3 << 8
	AND.w #$0002
	EOR.w $00B2
	CLC
	ADC $01,S
	SEP #$20
	STA.w $210E
	XBA
	STA.w $210E
	REP #$20
	LDA.w $00B9
	AND.w #$00FF
	BEQ +
	LDA.w $005F
	AND.w #$0004
	LSR
+	EOR.w $00B6                   ; BG2 V: the low byte, high byte 0
	CLC
	ADC $01,S
	SEP #$20
	STA.w $2110
	STZ.w $2110
	REP #$20
	PLA
	RTS
