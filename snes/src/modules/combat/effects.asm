; Combat's effect list (mana-mod.js this.effects) and its presentation.
; Gameplay (ki fronts, beam pulses, life and hold) lives here; drawing goes
; to the fx module (bind.asm), with minimal placeholder sprites while fx
; draws nothing (!COMBAT_FX_PLACEHOLDER).

; Records are tracked by cb_fx_mask (bit i = record i live), so idle frames
; never touch SRAM.

; X = free record offset, C clear; C set when full (an impact is evicted
; first, as impacts are only decoration).
cb_effect_alloc:
	LDX.w #$0000
	LDA.w #$0001
.find
	BIT !cb_fx_mask
	BEQ .found
	ASL
	PHA
	TXA
	CLC
	ADC.w #!ER_SIZE
	TAX
	PLA
	CPX.w #!ER_N*!ER_SIZE
	BCC .find
	; full: evict an impact
	LDX.w #$0000
.evict
	LDA.l !ER+!er_kind,X
	AND.w #$00FF
	CMP.w #!ERK_IMPACT
	BEQ .take
	TXA
	CLC
	ADC.w #!ER_SIZE
	TAX
	CPX.w #!ER_N*!ER_SIZE
	BCC .evict
	SEC
	RTS
.take
	JSR cb_fx_bit
.found
	TSB !cb_fx_mask
	LDA.w #$0000
	STA.l !ER+$00,X
	STA.l !ER+$02,X
	STA.l !ER+$04,X
	STA.l !ER+$06,X
	STA.l !ER+$08,X
	STA.l !ER+$0A,X
	STA.l !ER+$0C,X
	LDA.w #$FFFF
	STA.l !ER+$0E,X               ; no fx handle
	CLC
	RTS

; X = record offset -> A16 = its mask bit. Preserves X.
cb_fx_bit:
	PHX
	TXA
	LSR : LSR : LSR : LSR
	TAX
	LDA.w #$0001
-	DEX
	BMI +
	ASL
	BRA -
+	PLX
	RTS

; Free record X (kind 0, bit cleared). Preserves X.
cb_effect_free:
	SEP #$20
	LDA.b #$00
	STA.l !ER+!er_kind,X
	REP #$20
	JSR cb_fx_bit
	TRB !cb_fx_mask
	RTS

; The beam record: the live one, or a new one.
cb_effect_beam_slot:
	LDA !cb_fx_mask
	BEQ .new
	LDX.w #$0000
.find
	LDA.l !ER+!er_kind,X
	AND.w #$00FF
	CMP.w #!ERK_BEAM
	BEQ .found
	TXA
	CLC
	ADC.w #!ER_SIZE
	TAX
	CPX.w #!ER_N*!ER_SIZE
	BCC .find
.new
	JSR cb_effect_alloc
	BCC .out
	LDX.w #$0000                  ; full of ki: the first record
	JSR cb_fx_bit
	TSB !cb_fx_mask
.found
	LDA.w #$FFFF
	STA.l !ER+$0E,X
.out
	RTS

; Every effect ends (cancelCombat).
cb_effects_clear:
	LDA !cb_fx_mask
	BEQ .fx
	LDA.w #$0000
	LDX.w #!ER_N*!ER_SIZE-2
-	STA.l !ER,X
	DEX : DEX
	BPL -
	STZ !cb_fx_mask
.fx
	JMP cb_bind_fx_kill_all

; One frame of life: held effects wait, the others age and expire.
cb_effects_tick:
	LDA !cb_fx_mask
	STA !cb_fx_iter
	LDX.w #$0000
.loop
	LSR !cb_fx_iter
	BCC .next
	SEP #$20
	LDA.l !ER+!er_hold,X
	BEQ .life
	DEC
	STA.l !ER+!er_hold,X
	BRA .next8
.life
	LDA.l !ER+!er_life,X
	DEC
	STA.l !ER+!er_life,X
	BNE .next8
	REP #$20
	JSR cb_effect_free
.next8
	REP #$20
.next
	TXA
	CLC
	ADC.w #!ER_SIZE
	TAX
	LDA !cb_fx_iter
	BNE .loop
	RTS

; Impact spark: cb_t4/cb_t5 position (map), cb_t6 hold, cb_t7 life, cb_t8
; facing, cb_t9 super. Preserves cb_t0-cb_t3, cb_td-cb_tf, ag_*.
cb_effect_impact:
	JSR cb_effect_alloc
	BCC +
	RTS
+	SEP #$20
	LDA.b #!ERK_IMPACT
	STA.l !ER+!er_kind,X
	LDA !cb_t6
	STA.l !ER+!er_hold,X
	LDA !cb_t7
	STA.l !ER+!er_life,X
	STA.l !ER+!er_max,X
	LDA !cb_t8
	AND.b #$03
	STA.l !ER+!er_dir,X
	LDA !cb_t9
	BEQ +
	LDA.b #!ERF_SUPER
+	STA.l !ER+!er_flags,X
	REP #$20
	LDA !cb_t4
	STA.l !ER+!er_x,X
	LDA !cb_t5
	STA.l !ER+!er_y,X
	JMP cb_fx_spawn_impact

; The transformation ring (life 14) at cb_t4/cb_t5.
cb_effect_burst:
	JSR cb_effect_alloc
	BCC +
	RTS
+	SEP #$20
	LDA.b #!ERK_BURST
	STA.l !ER+!er_kind,X
	LDA.b #14
	STA.l !ER+!er_life,X
	STA.l !ER+!er_max,X
	LDA.b #!ERF_SUPER
	STA.l !ER+!er_flags,X
	REP #$20
	LDA !cb_t4
	STA.l !ER+!er_x,X
	LDA !cb_t5
	STA.l !ER+!er_y,X
	JMP cb_fx_spawn_burst

; ---------------------------------------------------------------------------
; Frame presentation: continuous draws (charge orb, aura, lightning) and the
; placeholder renderer. Runs after the frame's logic.
cb_effects_draw:
	JSR cb_goku_active
	BNE +
	RTS
+	LDA.l !bd_on
	BEQ +
	JSR cb_fx_beam_draw
	LDA.w #$0000
	STA.l !bd_on
+	JSR cb_fx_continuous
if !COMBAT_FX_PLACEHOLDER
	JSR cb_placeholder_draw
endif
	RTS

; Charge orb at the palms, aura and Super Saiyan lightning
; (sprite-layer.js composite(): only while Goku can act).
cb_fx_continuous:
	LDA !cb_can
	AND.w #$00FF
	BNE +
	RTS
+	; aura: focus, charging or the form change
	SEP #$20
	LDA !cb_act
	CMP.b #!GOKU_K_FOCUS
	BEQ .aura
	CMP.b #!GOKU_K_TRANSFORM
	BEQ .aura
	CMP.b #!GOKU_K_REVERT
	BEQ .aura
	LDA !cb_charging
	BEQ .noAura
.aura
	REP #$20
	JSR cb_fx_aura
	SEP #$20
.noAura
	LDA !cb_charging
	REP #$20
	BEQ .out
	JSR cb_fx_orb
	LDA !cb_form
	AND.w #$00FF
	BEQ .out
	JSR cb_fx_lightning
.out
	RTS

; ---------------------------------------------------------------------------
; Placeholder sprites (until the fx renderers land): 16x16 cells in OBJ
; region FIELD_OBJ_B, palette 0, priority 3, behind the native sprites.
if !COMBAT_FX_PLACEHOLDER
!PH_TILE = $3184                     ; tile $184 | priority 3 | palette 0
cb_placeholder_draw:
	; any live effect?
	LDA !cb_charging
	AND.w #$00FF
	ORA !cb_fx_mask
	BNE +
	RTS
+	JSR cb_placeholder_vram
	BCC +
	RTS
+	; camera: actor 0's map minus screen position
	LDA $E002
	SEC
	SBC $E020
	STA !cb_t1                    ; camera x
	LDA $E004
	SEC
	SBC $E022
	STA !cb_t2                    ; camera y
	LDX.w #$0000
.loop
	STX !cb_t3
	LDA.l !ER+!er_kind,X
	AND.w #$00FF
	BEQ .next
	CMP.w #!ERK_IMPACT
	BEQ .impact
	CMP.w #!ERK_KI
	BEQ .ki
	CMP.w #!ERK_BEAM
	BEQ .beam
	CMP.w #!ERK_BURST
	BEQ .burst
	BRA .next
.impact
	LDA.l !ER+!er_flags,X
	AND.w #!ERF_SUPER
	BEQ +
	LDA.w #!PH_TILE+6             ; gold spark
	BRA ++
+	LDA.w #!PH_TILE+2             ; spark
++	STA !cb_t6
	LDA.l !ER+!er_x,X
	STA !cb_t4
	LDA.l !ER+!er_y,X
	STA !cb_t5
	JSR cb_ph_put
	BRA .next
.ki
	JSR cb_ph_ki
	BRA .next
.beam
	JSR cb_ph_beam
	BRA .next
.burst
	JSR cb_ph_burst
.next
	LDX !cb_t3
	TXA
	CLC
	ADC.w #!ER_SIZE
	TAX
	CPX.w #!ER_N*!ER_SIZE
	BCC .loop
	; the charge orb at the palms
	LDA !cb_charging
	AND.w #$00FF
	BEQ .done
	LDA !cb_facing
	AND.w #$0003
	STA !cb_t8
	LDA.w #$0003
	JSR cb_hand_origin
	LDA.w #!PH_TILE
	STA !cb_t6
	JSR cb_ph_put
.done
	RTS

; One cell centred on map point cb_t4/cb_t5, tile word cb_t6.
cb_ph_put:
	LDA !cb_t4
	SEC
	SBC !cb_t1
	SEC
	SBC.w #8
	STA.w !core_spr_x&$FFFF
	LDA !cb_t5
	SEC
	SBC !cb_t2
	SEC
	SBC.w #8
	STA.w !core_spr_y&$FFFF
	LDA !cb_t6
	STA.w !core_spr_tile&$FFFF
	STZ.w !core_spr_size&$FFFF
	JSL core_oam_add
	RTS

; Ki: three orbs trailing the front by 7 px.
cb_ph_ki:
	LDA.l !ER+!er_max,X
	SEC
	SBC.l !ER+!er_life,X
	AND.w #$00FF
	INC
	ASL
	STA !cb_t7
	ASL : ASL : ASL
	SEC
	SBC !cb_t7                    ; (age+1)*14
	CMP.w #256
	BCC +
	LDA.w #256
+	STA !cb_t7                    ; distance
	LDA.l !ER+!er_dir,X
	AND.w #$0003
	STA !cb_t8
	LDA.w #!PH_TILE
	STA !cb_t6
	LDA.w #3
	STA !cb_t9
.orb
	LDX !cb_t3
	LDA !cb_t7
	JSR cb_ph_along
	JSR cb_ph_put
	LDA !cb_t7
	SEC
	SBC.w #7
	STA !cb_t7
	DEC !cb_t9
	BNE .orb
	RTS

; cb_t4/cb_t5 = record X origin + distance A along facing cb_t8.
cb_ph_along:
	STA !cb_t0
	LDA.l !ER+!er_x,X
	STA !cb_t4
	LDA.l !ER+!er_y,X
	STA !cb_t5
	LDA !cb_t8
	BEQ .down
	CMP.w #$0001
	BEQ .right
	CMP.w #$0002
	BEQ .left
	LDA !cb_t5
	SEC
	SBC !cb_t0
	STA !cb_t5
	RTS
.down
	LDA !cb_t5
	CLC
	ADC !cb_t0
	STA !cb_t5
	RTS
.right
	LDA !cb_t4
	CLC
	ADC !cb_t0
	STA !cb_t4
	RTS
.left
	LDA !cb_t4
	SEC
	SBC !cb_t0
	STA !cb_t4
	RTS

; Beam: a body cell every 16 px (4 at most behind the head) and the head.
cb_ph_beam:
	LDA.l !ER+!er_dir,X
	AND.w #$0003
	STA !cb_t8
	LDA.l !ER+!er_max,X
	SEC
	SBC.l !ER+!er_life,X
	AND.w #$00FF
	INC
	STA !cb_mq
	LDA !bm_speed
	JSR cb_mul16
	LDA !cb_mq1
	CMP !bm_range
	BCC +
	LDA !bm_range
+	STA !cb_t7                    ; length
	LDA.w #!PH_TILE+4
	STA !cb_t6
	LDA.w #10
	STA !cb_t9                    ; sprite budget
.cell
	LDX !cb_t3
	LDA !cb_t7
	JSR cb_ph_along
	JSR cb_ph_put
	LDA !cb_t7
	SEC
	SBC.w #16
	BMI .done
	STA !cb_t7
	DEC !cb_t9
	BNE .cell
.done
	RTS

; Burst ring: eight gold sparks on the growing radius.
cb_ph_burst:
	LDA.l !ER+!er_max,X
	SEC
	SBC.l !ER+!er_life,X
	AND.w #$00FF
	STA !cb_t7
	LSR
	CLC
	ADC !cb_t7
	CLC
	ADC.w #56                     ; radius + 1.5 * age
	STA !cb_t7
	LDA.w #!PH_TILE+6
	STA !cb_t6
	LDA.w #3
	STA !cb_t9
.dir
	LDX !cb_t3
	LDA !cb_t9
	STA !cb_t8
	LDA !cb_t7
	JSR cb_ph_along
	JSR cb_ph_put
	DEC !cb_t9
	BPL .dir
	RTS

; Claim FIELD_OBJ_B and keep the placeholder cells uploaded. C set when the
; region is not ours.
cb_placeholder_vram:
	LDA.w #!VRAM_FIELD_OBJ_B
	LDX.w #!COMBAT_OWNER
	JSL core_vram_claim
	BCC +
	RTS
+	; refresh: on claim and every 32 frames (crowded scenes may overwrite)
	SEP #$20
	LDA !cb_fx_round
	INC
	AND.b #$1F
	STA !cb_fx_round
	REP #$20
	BEQ .upload
	LDA !cb_fx_vram
	CMP.w #$A5A5
	BEQ .ok
.upload
	SEP #$20
	LDA.b #combat_fxstub_tiles>>16
	STA.w !core_scratch&$FFFF
	REP #$20
	LDA.w #$7840
	LDX.w #256
	LDY.w #combat_fxstub_tiles&$FFFF
	JSL core_queue_vram
	BCS .ok
	SEP #$20
	LDA.b #combat_fxstub_tiles>>16
	STA.w !core_scratch&$FFFF
	REP #$20
	LDA.w #$7940
	LDX.w #256
	LDY.w #(combat_fxstub_tiles+256)&$FFFF
	JSL core_queue_vram
	BCS .ok
	LDA.w #$A5A5
	STA !cb_fx_vram
.ok
	CLC
	RTS
endif
