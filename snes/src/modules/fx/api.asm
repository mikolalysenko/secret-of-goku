; Public entry points (docs/agents/snes-port/fx.md). JSL, M16/X16 in and
; out, DB = $7E, D = 0; DB and D preserved.

; One-time SRAM initialisation (power-on contents are undefined). M16/X16,
; any DB; preserves A, X and Y.
fx_ensure_init:
	PHA
	LDA.l !fx_magic
	CMP.w #!FX_MAGIC
	BNE .init
	LDA.w #$0001                 ; a request: the next fx_frame runs in full
	STA.l !fx_busy
	PLA
	RTS
.init
	PHX
	LDA.w #$0000
	LDX.w #$03FE
-	STA.l !FX_SRAM,X
	DEX
	DEX
	BPL -
	LDA.w #$FFFE                 ; cache entries unusable until a region is claimed
	LDX.w #$001E
-	STA.l !fx_ccell,X
	DEX
	DEX
	BPL -
	LDA.w #$FFFF
	STA.l !fx_dball_last
	STA.l !fx_dball_last+32
	STA.l !fx_map
	STA.l !fx_mode
	STA.l !fx_clspal : STA.l !fx_clspal+2 : STA.l !fx_clspal+4
	STA.l !fx_nmipal : STA.l !fx_nmipal+2 : STA.l !fx_nmipal+4
	SEP #$20
	STA.l !fx_clspal+6 : STA.l !fx_nmipal+6
	REP #$20
	LDA.w #12                    ; vblank lines per phase until measured
	STA.l !fx_vblp
	STA.l !fx_vblp+2
	STA.l !fx_vblp+4
	STA.l !fx_vblp+6
	STA.l !fx_vblp+8
	LDA.l !FX_DREC_SEQ           ; destroy's records from now on
	STA.l !fx_dseq
	LDA.w #$FFFF
	STA.l !fx_dshade
	LDA.w #!FX_MAGIC
	STA.l !fx_magic
	LDA.w #$0001
	STA.l !fx_hash_dirty         ; the separate hint block is undefined at boot
	STA.l !fx_busy
	PLX
	PLA
	RTS

; Title entry (power-on, soft reset, quit to title): the SRAM work area is
; battery backed, so a previous session's state is dropped here.
fx_title_boot:
	LDA.l !fx_magic
	CMP.w #!FX_MAGIC
	BNE +
	LDA.l !fx_poly_on            ; HDMA bits FX set in $2C go with it
	BEQ +
	SEP #$20
	LDA.w $002C
	AND.b #$F3
	STA.w $002C
	REP #$20
+	LDA.w #$0000
	STA.l !fx_magic
	STA.l !fx_busy
	RTL

; The destruction record producer calls before changing FX_DREC_SEQ.
; Preserve its A/X/Y and wake the frame driver without per-frame polling.
fx_destroy_wake:
	JSR fx_ensure_init
	RTL

; fx_spawn: A = kind | flags<<8, X = x, Y = y, request block.
; Out: C clear and A = handle (slot | generation<<8), or C set (no slot, or
; not a timed kind).
fx_spawn:
	PHA
	PHX
	PHY
	JSR fx_ensure_init
	LDA $05,S
	AND.w #$00FF
	BEQ .refuse
	CMP.w #!FX_HIT+1
	BCS .refuse                  ; continuous kinds are drawn with fx_draw
	LDX.w #$0000
.find
	LDA.l !fx_slots+!S_KIND,X
	AND.w #$00FF
	BEQ .found
	TXA
	CLC
	ADC.w #16
	TAX
	CPX.w #!FX_SLOTS*16
	BCC .find
.refuse
	PLY
	PLX
	PLA
	SEC
	RTL
.found
	LDA.l !fx_gen
	INC
	AND.w #$00FF
	BNE +
	INC
+	STA.l !fx_gen
	SEP #$20
	STA.l !fx_slots+!S_GEN,X
	LDA.l !fx_dir
	STA.l !fx_slots+!S_DIR,X
	LDA.b #$00
	STA.l !fx_slots+!S_HOLD,X
	REP #$20
	PLA
	STA.l !fx_slots+!S_Y,X
	PLA
	STA.l !fx_slots+!S_X,X
	PLA
	STA.l !fx_slots+!S_KIND,X    ; kind | flags
	LDA.w #$FFFF
	STA.l !fx_slots+!S_AGE,X
	LDA.l !fx_a
	STA.l !fx_slots+!S_A,X
	LDA.l !fx_b
	STA.l !fx_slots+!S_B,X
	JSR fx_spawn_init
	LDA.l !fx_nlive
	INC
	STA.l !fx_nlive
	TXA
	CLC
	ADC.w #16
	CMP.l !fx_hiwater
	BCC +
	STA.l !fx_hiwater
+
	TXA
	LSR
	LSR
	LSR
	LSR
	STA.l !fx_s
	LDA.l !fx_slots+!S_GEN-1,X   ; generation in the high byte
	AND.w #$FF00
	ORA.l !fx_s
	CLC
	RTL

; Kind defaults at spawn. X = slot offset. M16/X16.
fx_spawn_init:
	LDA.l !fx_slots+!S_KIND,X
	AND.w #$00FF
	ASL
	PHX
	TAX
	LDA.l fx_life_default,X      ; default life
	PLX
	STA.l !fx_s
	LDA.l !fx_slots+!S_KIND,X
	AND.w #$00FF
	CMP.w #!FX_HIT
	BEQ .impact
	CMP.w #!FX_IMPACT
	BNE .notImpact
.impact
	LDA.l !fx_slots+!S_A,X       ; a = life (0 = 10), b = hold
	BEQ +
	STA.l !fx_s
+	SEP #$20
	LDA.l !fx_slots+!S_B,X
	STA.l !fx_slots+!S_HOLD,X
	REP #$20
	LDA.l !fx_slots+!S_KIND,X
	AND.w #$00FF
	CMP.w #!FX_HIT
	BNE +
	LDA.l !fx_c                  ; FX_HIT: a becomes the impact frame (FX_IMP_*)
	STA.l !fx_slots+!S_A,X
	AND.w #!FX_IMP_ACTOR
	BEQ +
	SEP #$20
	LDA.l !fx_wdue               ; its actor is white in this fx frame and the next
	AND.b #!FX_SEEN
	ORA.b #2
	STA.l !fx_wdue
	REP #$20
+	JMP .life
.notImpact
	CMP.w #!FX_EXPLODE
	BNE .notExplode0
	LDA.l !fx_style
	AND.w #$0003
	STA.l !fx_slots+!S_A,X       ; bit 0 mirror, bit 1 brazier (three bursts)
	AND.w #$0002
	BNE +
	JMP .life
+	LDA.w #54                    ; dungeon-demolition.js brazierBurst
	STA.l !fx_s
	JMP .life
.notExplode0
	CMP.w #!FX_KI
	BNE .notKi
	LDA.l !fx_slots+!S_A,X       ; range (0 = 256)
	BEQ +
	JMP .life
+
	LDA.w #256
	STA.l !fx_slots+!S_A,X
	JMP .life
.notKi
	CMP.w #!FX_BURST
	BNE .notBurst
	LDA.l !fx_slots+!S_A,X       ; radius (0 = 56; 16 uses the status ring)
	BEQ +
	JMP .life
+
	LDA.w #56
	STA.l !fx_slots+!S_A,X
	JMP .life
.notBurst
	CMP.w #!FX_EXPLODE
	BNE .notExplode
	LDA.l !fx_style
	AND.w #$0001
	STA.l !fx_slots+!S_A,X       ; mirror flag
	JMP .life
.notExplode
	CMP.w #!FX_EMBER
	BNE .notEmber
	LDA.l !fx_slots+!S_B,X       ; life (0 = 26 - dir)
	BNE +
	LDA.l !fx_slots+!S_DIR,X
	AND.w #$0007
	EOR.w #$FFFF
	SEC
	ADC.w #26
+	STA.l !fx_s
	JMP .life
.notEmber
	CMP.w #!FX_STATUS
	BNE .notStatus
	LDA.l !fx_style
	AND.w #$0003
	STA.l !fx_slots+!S_A,X       ; shell
	BNE +
	JMP .life                    ; plain: 14
+
	LDA.w #28
	STA.l !fx_s
	JMP .life
.notStatus
	CMP.w #!FX_DEBRIS
	BEQ +
	JMP .life
+	LDA.l !fx_rgb                ; debris colours are shared by all debris
	STA.l !fx_dyn
	LDA.l !fx_rgb+2
	STA.l !fx_dyn+2
	LDA.l !fx_rgb+4
	STA.l !fx_dyn+4
	LDA.w #$FFFF                 ; no longer a room's cached shades
	STA.l !fx_dshade
	LDA.l !fx_slots+!S_A,X       ; chunks (0 = 4) in the high byte
	AND.w #$00FF
	BNE +
	LDA.w #4
+	CMP.w #9
	BCC +
	LDA.w #8
+	XBA
	STA.l !fx_e
	LDA.l !fx_style
	AND.w #$0001
	ORA.l !fx_e
	STA.l !fx_slots+!S_A,X       ; style (0 rubble, 1 ceiling dust) | chunks << 8
	AND.w #$0001
	BEQ +
	LDA.w #46                    ; ceiling dust: ceiling-escape.js phase 22-68
	STA.l !fx_s
+	LDA.l !fx_slots+!S_B,X       ; life (0 = default)
	BEQ +
	STA.l !fx_s
+	LDA.l !fx_slots+!S_X,X       ; seed (sprite-layer.js e.seed)
	ASL
	ASL
	ASL
	ASL
	CLC
	ADC.l !fx_slots+!S_X,X
	CLC
	ADC.l !fx_slots+!S_Y,X
	CLC
	ADC.l !fx_frame
	STA.l !fx_slots+!S_B,X
.life
	SEP #$20
	LDA.l !fx_s
	STA.l !fx_slots+!S_LIFE,X
	REP #$20
	RTS

; Life in frames per timed kind (index = kind).
fx_life_default:
	dw 1, 10, 22, 14, 42, 26, 132, 14, 32, 12, 10

; Handle in A -> X = slot offset, C clear when it names a live effect.
fx_handle_slot:
	PHA
	AND.w #$00FF
	CMP.w #!FX_SLOTS
	BCS .bad
	ASL
	ASL
	ASL
	ASL
	TAX
	LDA.l !fx_slots+!S_KIND,X
	AND.w #$00FF
	BEQ .bad
	LDA.l !fx_slots+!S_GEN-1,X
	EOR $01,S
	AND.w #$FF00
	BNE .bad
	PLA
	CLC
	RTS
.bad
	PLA
	SEC
	RTS

; fx_kill: A = handle.
fx_kill:
	JSR fx_ensure_init
	JSR fx_handle_slot
	BCS +
	SEP #$20
	LDA.b #$00
	STA.l !fx_slots+!S_KIND,X
	REP #$20
	LDA.l !fx_nlive
	DEC
	STA.l !fx_nlive
+	RTL

; fx_move: A = handle, X/Y = new position.
fx_move:
	PHX
	PHY
	JSR fx_ensure_init
	JSR fx_handle_slot
	BCS .stale
	PLA
	STA.l !fx_slots+!S_Y,X
	PLA
	STA.l !fx_slots+!S_X,X
	RTL
.stale
	PLY
	PLX
	RTL

; fx_info: A = handle. C clear while alive: A = age, X/Y = position (the
; front of a ki shot).
fx_info:
	JSR fx_ensure_init
	JSR fx_handle_slot
	BCC +
	RTL
+	LDA.l !fx_slots+!S_AGE,X
	CMP.w #$FFFF
	BNE +
	LDA.w #$0000
+	STA.l !fx_s+2                ; age
	LDA.l !fx_slots+!S_X,X
	STA.l !fx_s+4
	LDA.l !fx_slots+!S_Y,X
	STA.l !fx_s+6
	LDA.l !fx_slots+!S_KIND,X
	AND.w #$00FF
	CMP.w #!FX_KI
	BNE .done
	JSR fx_ki_distance           ; A = front distance for slot X
	STA.l !fx_s+8
	LDA.l !fx_slots+!S_DIR,X
	AND.w #$0003
	ASL
	TAX
	LDA.l fx_dir_dx,X
	BEQ +
	BMI .neg
	LDA.l !fx_s+8
	BRA .addx
.neg
	LDA.w #$0000
	SEC
	SBC.l !fx_s+8
.addx
	CLC
	ADC.l !fx_s+4
	STA.l !fx_s+4
	BRA .done
+	LDA.l fx_dir_dy,X
	BMI .negy
	LDA.l !fx_s+8
	BRA .addy
.negy
	LDA.w #$0000
	SEC
	SBC.l !fx_s+8
.addy
	CLC
	ADC.l !fx_s+6
	STA.l !fx_s+6
.done
	LDA.l !fx_s+4
	TAX
	LDA.l !fx_s+6
	TAY
	LDA.l !fx_s+2
	CLC
	RTL

; Ki front distance for slot X (age 0 before the first frame): min(range,
; (age+1)*14). Preserves X.
fx_ki_distance:
	LDA.l !fx_slots+!S_AGE,X
	CMP.w #$FFFF
	BNE +
	LDA.w #$0000
+	INC
	STA.l !fx_s+10
	ASL                          ; *14 = *16 - *2
	ASL
	ASL
	ASL
	SEC
	SBC.l !fx_s+10
	SBC.l !fx_s+10
	CMP.l !fx_slots+!S_A,X
	BCC +
	LDA.l !fx_slots+!S_A,X
+	RTS

; Reserve a draw-list entry for this frame: X = offset, C set when full.
fx_draw_entry:
	LDA.l !fx_tick
	CMP.w !core_tick&$FFFF
	BEQ +
	LDA.w !core_tick&$FFFF
	STA.l !fx_tick
	LDA.w #$0000
	STA.l !fx_ndraw
+	LDA.l !fx_ndraw
	CMP.w #!FX_DRAWS*16
	BCS .full
	TAX
	CLC
	ADC.w #16
	STA.l !fx_ndraw
	CLC
	RTS
.full
	SEC
	RTS

; fx_draw: A = kind | flags<<8, X = x, Y = y, request block. C set if the
; frame's draw list is full.
fx_draw:
	PHA
	PHX
	PHY
	JSR fx_ensure_init
	LDA $05,S
	AND.w #$00FF
	CMP.w #!FX_AURA
	BEQ .aura
	JSR fx_draw_entry
	BCC +
	JMP fx_draw_full
+
	BRA .store
.aura
	; A focus flame has priority over the last optional continuous effect.
	; Put it first so neither particles nor other draws consume its cells.
	JSR fx_draw_entry
	BCC +
	LDX.w #(!FX_DRAWS-1)*16
+	CPX.w #0
	BEQ .store
	for word = 0..8
		LDA.l !fx_draws+(!word*2)
		STA.l !fx_draws+(!word*2),X
	endfor
	LDX.w #0
.store
	PLA
	STA.l !fx_draws+!D_Y,X
	PLA
	STA.l !fx_draws+!D_X,X
	PLA
	STA.l !fx_draws+!D_KIND,X
fx_draw_fill:
	SEP #$20
	LDA.l !fx_dir
	STA.l !fx_draws+!D_DIR,X
	LDA.l !fx_style
	STA.l !fx_draws+!D_STYLE,X
	REP #$20
	LDA.l !fx_a
	STA.l !fx_draws+!D_A,X
	LDA.l !fx_b
	STA.l !fx_draws+!D_B,X
	LDA.l !fx_c
	STA.l !fx_draws+!D_C,X
	LDA.l !fx_t
	STA.l !fx_draws+!D_T,X
	CLC
	RTL

; fx_beam: A = style | flags<<8, X/Y = palms, request block (dir, a length,
; b width, c taper, t age). C set if the draw list is full.
fx_beam:
	PHA
	PHX
	PHY
	JSR fx_ensure_init
	JSR fx_draw_entry
	BCS fx_draw_full
	PLA
	STA.l !fx_draws+!D_Y,X
	PLA
	STA.l !fx_draws+!D_X,X
	PLA
	AND.w #$FF7F
	ORA.w #$0080
	STA.l !fx_draws+!D_KIND,X
	JMP fx_draw_fill
fx_draw_full:
	PLY
	PLX
	PLA
	SEC
	RTL

; fx_flash: A = frames (1-7; the transformation uses 7, the finishing kick
; 3). A flash already running longer keeps going.
fx_flash:
	JSR fx_ensure_init
	CMP.w #8
	BCC +
	LDA.w #7
+	CMP.l !fx_flash
	BCC +
	STA.l !fx_flash
+	RTL

; fx_quake: A = frames. The native BG quake byte $49 gets $E0 for that many
; frames unless an event already uses it; a native write takes it back.
; Ignored in Mode 7 arenas ($29 bit 2).
fx_quake:
	JSR fx_ensure_init
	PHA
	SEP #$20
	LDA.w $0029
	AND.b #$04
	REP #$20
	BNE .skip
	LDA.l !fx_quake
	BEQ .start
	PLA
	CMP.l !fx_quake
	BCC +
	STA.l !fx_quake
+	RTL
.start
	SEP #$20
	LDA.w $0049
	REP #$20
	BNE .skip                    ; an event shakes the screen already
	PLA
	BEQ +
	STA.l !fx_quake
	SEP #$20
	LDA.b #$00
	STA.l !fx_quakeprev           ; a byte: the camera kick follows it
	LDA.b #$E0
	STA.w $0049
	REP #$20
+	RTL
.skip
	PLA
	RTL

; fx_kill_all: every spawned effect, the flash, the quake and the camera
; kick end.
fx_kill_all:
	JSR fx_ensure_init
	JSR fx_clear_slots
	LDA.w #$0000
	STA.l !fx_flash
	STA.l !fx_ndraw
	JSR fx_quake_stop
	JSR fx_kick_stop
	RTL

; End a camera kick: the next field NMI writes the plain scroll values.
fx_kick_stop:
	LDA.w #$0000
	STA.l !fx_kickd
	SEP #$20
	STA.l !fx_kick
	REP #$20
	RTS

; Clear all spawned effects. Preserves nothing.
fx_clear_slots:
	SEP #$20
	LDX.w #(!FX_SLOTS-1)*16
-	LDA.b #$00
	STA.l !fx_slots+!S_KIND,X
	REP #$20
	TXA
	SEC
	SBC.w #16
	TAX
	SEP #$20
	BPL -
	REP #$20
	LDA.w #$0000
	STA.l !fx_nlive
	STA.l !fx_hiwater
	RTS

; End a quake pulse: restore $49 if it still holds our value.
fx_quake_stop:
	LDA.l !fx_quake
	BEQ .done
	LDA.w #$0000
	STA.l !fx_quake
	SEP #$20
	LDA.w $0049
	CMP.b #$E0
	BNE +
	LDA.l !fx_quakeprev
	STA.w $0049
+	REP #$20
.done
	RTS

; Facing (0 down, 1 right, 2 left, 3 up) -> unit vector and quarter turn.
fx_dir_dx:
	dw 0, 1, -1, 0
fx_dir_dy:
	dw 1, 0, 0, -1
fx_dir_turn:
	dw 1, 0, 2, 3
