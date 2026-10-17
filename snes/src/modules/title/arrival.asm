; Goku's arrival at the Mana Sword (engine/arrival.js, arrival-event-data.js,
; saiyan-pod.js, native-crater.js).
;
; Event: when the sword event (103) pauses after the boy's grunt (D0 bit 7,
; D1:D3 = C9:269F, map 128, CF10 = 0) the event pointer is redirected to the
; arrival bytecode in the data bank; the native interpreter runs it (sounds,
; quake, flash, ghost, five dialogue pages). When it reaches its final WAIT
; the pointer goes to the original tail at C9:2790 with D0 = 1. Phases follow
; the pointer exactly as the browser's classify(). At the first impact /
; ghost / dialogue phase the hero slot becomes GOKU, !persist_goku_active and
; the crater bit are set.
;
; Pictures: OBJ sprites behind every native sprite (core_oam_add), OBJ
; priority 3 (above both map layers, below BG3 windows), palettes 2/6/7 and
; OBJ cells chosen in snes/gen/title-arrival.mjs. Descent and impact follow
; drawScene per age; afterwards the crater and the open pod stay on map 128
; whenever its fade has settled ($E4 = $E5 = 1), like the browser's
; craterOnScreen. Effect cells use core VRAM pool regions A/B, claimed only
; for the scene.
;
; Goku himself belongs to the goku module: while !title_hero_mode is 1 the
; hero is hidden (Goku is still in the pod); while it is 2 he hops from the
; pod and should be drawn as sheet column !title_hero_frame, row 0, 32x32 at
; (!title_hero_x, !title_hero_y). This module hides the native hero's OBJ
; entries (tiles $1C0-$1EF, held sword $144-$149) in both modes.

!TITLE_MAP      = 128
!TITLE_SWORD_X  = 500
!TITLE_SWORD_Y  = 948
!TITLE_OWNER    = $54            ; VRAM pool owner id ('T')

; ---------------------------------------------------------------------------
; modules_field_frame. M16/X16, DB=$7E, D=0.
title_field_frame:
	JSR title_arrival_state
	JSR title_arrival_draw
	REP #$30
	RTL

; ---------------------------------------------------------------------------
; Event redirect and phase tracking (arrival.js beforeFrame).
title_arrival_state:
	SEP #$20
	LDA.w !title_phase&$FFFF
	CMP.b #!TITLE_PH_COMPLETE
	BNE .notComplete
	REP #$20
	RTS
.notComplete
	CMP.b #!TITLE_PH_PROLOGUE
	BEQ .prologue
	JMP .running
.prologue
	; the boy's sword-pull pause: map 128, sword not taken, waiting at C9:269F
	REP #$20
	LDA.w $00DC
	CMP.w #!TITLE_MAP
	BNE .idle
	SEP #$20
	LDA.w $CF10
	BNE .idle
	LDA.w $00D0
	BPL .idle
	LDA.w $00D3
	CMP.b #!TITLE_EVENT_HOOK>>16
	BNE .idle
	REP #$20
	LDA.w $00D1
	CMP.w #!TITLE_EVENT_HOOK&$FFFF
	BNE .idle
	LDA.w #title_event_script
	STA.w $00D1
	SEP #$20
	LDA.b #title_event_script>>16
	STA.w $00D3
	LDA.b #!TITLE_PH_QUEUED
	STA.w !title_phase&$FFFF
	REP #$20
	STZ.w !title_ticks&$FFFF
.idle
	REP #$20
	RTS

.running
	; classify(D1:D3)
	SEP #$20
	LDA.w $00D3
	CMP.b #title_event_script>>16
	BNE .idle
	REP #$20
	LDA.w $00D1
	SEC
	SBC.w #title_event_script
	BCC .idle
	CMP.w #title_event_script_end-title_event_script
	BCS .idle
	CMP.w #!TITLE_EV_FINISH
	BCC .notFinish
	; finish: resume the original event tail with the interpreter running
	LDA.w #!TITLE_EVENT_RESUME&$FFFF
	STA.w $00D1
	SEP #$20
	LDA.b #!TITLE_EVENT_RESUME>>16
	STA.w $00D3
	LDA.b #$01
	STA.w $00D0
	LDA.b #!TITLE_PH_COMPLETE
	BRA .setPhase
.notFinish
	LDX.w #!TITLE_PH_DIALOGUE
	CMP.w #!TITLE_EV_DIALOGUE
	BCS .phase
	LDX.w #!TITLE_PH_GHOST
	CMP.w #!TITLE_EV_GHOST
	BCS .phase
	LDX.w #!TITLE_PH_IMPACT
	CMP.w #!TITLE_EV_IMPACT
	BCS .phase
	; descent starts once the native 60-frame pause is running
	CMP.w #!TITLE_EV_DESCENTWAIT
	BCC .idle
	LDX.w #!TITLE_PH_DESCENT
.phase
	TXA
	SEP #$20
.setPhase
	CMP.w !title_phase&$FFFF
	BEQ .same
	STA.w !title_phase&$FFFF
	REP #$20
	STZ.w !title_ticks&$FFFF
	SEP #$20
	LDA.w !title_phase&$FFFF
	CMP.b #!TITLE_PH_DESCENT
	BNE +
	LDA.b #$01
	STA.w !title_sfx&$FFFF
+	CMP.b #!TITLE_PH_IMPACT
	BNE .arrive
	LDA.b #$02
	STA.w !title_sfx&$FFFF
	BRA .arrive
.same
	REP #$20
	INC.w !title_ticks&$FFFF
.arrive
	SEP #$20
	LDA.w !title_phase&$FFFF
	CMP.b #!TITLE_PH_IMPACT
	BCC .done
	CMP.b #!TITLE_PH_COMPLETE
	BEQ .done
	LDA.l !persist_title_arrival
	LSR
	BCS .done
	; Goku arrives: name, identity and the crater
	JSR title_crown_goku
	SEP #$20
	LDA.b #$01
	STA.l !persist_goku_active
	LDA.l !persist_title_arrival
	ORA.b #$03
	STA.l !persist_title_arrival
.done
	REP #$20
	RTS

; ---------------------------------------------------------------------------
; modules_load: a GAME FILE was loaded and core restored (or cleared) the
; persistent block. Files saved past the sword pull without our sidecar
; (CF10 != 0, arrival bit clear) already belong to Goku, as the browser's
; arrival.restore() decides from nativeProgress(): Goku active, no crater.
title_load:
	PHP
	SEP #$20
	LDA.l $7ECF10
	BEQ .done
	LDA.l !persist_title_arrival
	BIT.b #$01
	BNE .done
	ORA.b #$01
	STA.l !persist_title_arrival
	LDA.b #$01
	STA.l !persist_goku_active
.done
	PLP
	RTL

; ---------------------------------------------------------------------------
; Pictures on map 128.
title_arrival_draw:
	REP #$30
	; tiles in our OBJ cells survive only uninterrupted field frames on map 128
	LDA.w !core_tick&$FFFF
	DEC
	CMP.w !title_last_tick&$FFFF
	BEQ +
	JSR title_vram_invalidate
+	LDA.w !core_tick&$FFFF
	STA.w !title_last_tick&$FFFF
	LDA.w $00DC
	CMP.w !title_last_map&$FFFF
	BEQ +
	STA.w !title_last_map&$FFFF
	JSR title_vram_invalidate
+	LDA.w $00DC
	CMP.w #!TITLE_MAP
	BEQ +
	JSR title_hero_release
	JMP title_release_claims
+	; last frame's queued uploads are in VRAM now
	SEP #$20
	LDA.w !title_vram_queued&$FFFF
	ORA.w !title_vram_ready&$FFFF
	STA.w !title_vram_ready&$FFFF
	STZ.w !title_vram_queued&$FFFF
	LDA.w !title_pod_queued&$FFFF
	BMI +
	STA.w !title_pod_ready&$FFFF
	LDA.b #$FF
	STA.w !title_pod_queued&$FFFF
+	REP #$20
	; the sword's screen position (cx, cy): sword world point minus camera
	LDA.w #!TITLE_SWORD_X
	SEC
	SBC.w $E002
	CLC
	ADC.w $E020
	STA.w !title_scr_x&$FFFF
	LDA.w #!TITLE_SWORD_Y
	SEC
	SBC.w $E004
	CLC
	ADC.w $E022
	STA.w !title_scr_y&$FFFF
	JSR title_map_origin
	JSR title_oam_open
	BCC +
	JMP .done
+	SEP #$20
	LDA.w !title_phase&$FFFF
	CMP.b #!TITLE_PH_DESCENT
	BEQ .descent
	CMP.b #!TITLE_PH_IMPACT
	BEQ .impact
	JSR title_hero_release
	JSR title_release_claims
	BRA .scenery
.descent
	JSR title_scene_palettes
	JSR title_draw_descent
	BRA .scenery
.impact
	JSR title_scene_palettes
	JSR title_draw_impact
.scenery
	SEP #$20
	LDA.l !persist_title_arrival
	AND.b #$02
	BEQ .close
	LDA.w $00E4
	CMP.b #$01
	BNE .close
	LDA.w $00E5
	CMP.b #$01
	BNE .close
	LDA.w !title_phase&$FFFF
	CMP.b #!TITLE_PH_DESCENT
	BEQ .crater
	CMP.b #!TITLE_PH_IMPACT
	BEQ .crater
	JSR title_crater_palette
	; the open pod stays in the crater once the scene is over; like the
	; crater it is composed per scanline in the browser, one row above the
	; scene's pod (cy - 58)
	REP #$30
	LDA.w #$0003
	JSR title_pod_load
	BCS .crater
	LDA.w !title_map_x&$FFFF
	STA.w !title_ox&$FFFF
	LDA.w !title_map_y&$FFFF
	SEC
	SBC.w #59
	STA.w !title_oy&$FFFF
	JSR title_draw_pod
.crater
	JSR title_draw_crater
.close
	JSR title_oam_close
.done
	REP #$30
	RTS

; The crater and the resting pod are map decoration (arrival.js
; placeCrater): placed from BG1's scroll as the coming NMI writes it (C0:C170:
; $B0/$B2 with bit 1 flipped by the quake bits $5E/$5F) and the tile stream's
; origin ($A8/$AA): the camera is the origin plus the scroll's offset from it
; modulo 16, in -8..7. The scene itself (pods in flight, effects, Goku) stays
; on the hero's camera like drawScene. M16/X16.
title_map_origin:
	LDA.w $005E
	AND.w #$0002
	EOR.w $00B0                     ; BG1HOFS
	SEC
	SBC.w $00A8
	CLC
	ADC.w #8
	AND.w #$000F
	SEC
	SBC.w #8
	CLC
	ADC.w $00A8                     ; camera x
	EOR.w #$FFFF
	SEC
	ADC.w #!TITLE_SWORD_X           ; sword x - camera x
	STA.w !title_map_x&$FFFF
	LDA.w $005F
	AND.w #$0002
	EOR.w $00B2                     ; BG1VOFS
	SEC
	SBC.w $00AA
	CLC
	ADC.w #8
	AND.w #$000F
	SEC
	SBC.w #8
	CLC
	ADC.w $00AA                     ; camera y
	EOR.w #$FFFF
	SEC
	ADC.w #!TITLE_SWORD_Y
	STA.w !title_map_y&$FFFF
	RTS

; Forget what is in our OBJ cells.
title_vram_invalidate:
	PHP
	SEP #$20
	STZ.w !title_palstate&$FFFF
	STZ.w !title_vram_ready&$FFFF
	STZ.w !title_vram_queued&$FFFF
	LDA.b #$FF
	STA.w !title_pod_ready&$FFFF
	STA.w !title_pod_queued&$FFFF
	PLP
	RTS

; Give back VRAM pool regions A/B. M any.
title_release_claims:
	PHP
	SEP #$20
	LDA.w !title_claims&$FFFF
	AND.b #$03
	BEQ .done
	REP #$30
	AND.w #$0003
	LSR
	BCC +
	PHA
	LDA.w #!VRAM_FIELD_OBJ_A
	LDX.w #!TITLE_OWNER
	JSL core_vram_release
	PLA
+	LSR
	BCC +
	LDA.w #!VRAM_FIELD_OBJ_B
	LDX.w #!TITLE_OWNER
	JSL core_vram_release
+	SEP #$20
	STZ.w !title_claims&$FFFF
	; their cells now belong to the pool again
	LDA.w !title_vram_ready&$FFFF
	AND.b #$F9
	STA.w !title_vram_ready&$FFFF
.done
	PLP
	RTS

; Claim regions A/B for the effects. Carry set when unavailable.
title_claim_fx:
	REP #$30
	LDA.w !title_claims&$FFFF
	AND.w #$0003
	CMP.w #$0003
	BEQ .ok
	LDA.w #!VRAM_FIELD_OBJ_A
	LDX.w #!TITLE_OWNER
	JSL core_vram_claim
	BCS .refused
	SEP #$20
	LDA.w !title_claims&$FFFF
	ORA.b #$01
	STA.w !title_claims&$FFFF
	REP #$20
	LDA.w #!VRAM_FIELD_OBJ_B
	LDX.w #!TITLE_OWNER
	JSL core_vram_claim
	BCS .refused
	SEP #$20
	LDA.w !title_claims&$FFFF
	ORA.b #$02
	STA.w !title_claims&$FFFF
	REP #$20
.ok
	CLC
	RTS
.refused
	SEP #$20
	LDA.w !title_claims&$FFFF
	ORA.b #$80
	STA.w !title_claims&$FFFF
	REP #$20
	SEC
	RTS

; ---------------------------------------------------------------------------
; VRAM uploads. title_upload: X = list address (data bank). Queues every
; entry with core_queue_vram if the whole list fits this frame's queue.
; Carry set if it did not fit (try again next frame). M16/X16.
title_upload:
	REP #$30
	LDA.l title_up_crater&$FF0000,X       ; entries (low byte)
	AND.w #$00FF
	STA.w !title_tmp&$FFFF
	CLC
	ADC.w !core_dma_count&$FFFF
	CMP.w #!CORE_DMA_MAX+1
	BCS .full
	LDA.l (title_up_crater&$FF0000)+1,X   ; total bytes
	CLC
	ADC.w !core_dma_bytes&$FFFF
	CMP.w #!CORE_DMA_BUDGET+1
	BCS .full
	INX
	INX
	INX
.entry
	; dw vram, dw bytes, dl source
	SEP #$20
	LDA.l (title_up_crater&$FF0000)+6,X
	STA.w !core_scratch&$FFFF
	REP #$20
	PHX
	LDA.l (title_up_crater&$FF0000)+4,X
	TAY
	LDA.l (title_up_crater&$FF0000)+2,X
	PHA
	LDA.l title_up_crater&$FF0000,X
	PLX
	JSL core_queue_vram
	PLX
	BCS .full
	TXA
	CLC
	ADC.w #$0007
	TAX
	DEC.w !title_tmp&$FFFF
	BNE .entry
	CLC
	RTS
.full
	SEC
	RTS

; Pod frame A (0 airborne, 1 closed, 2 half open, 3 open) into its cells.
; Carry clear when the cells show a pod frame this frame (ready, or a new
; frame replacing a ready one in the same vblank).
title_pod_load:
	REP #$30
	AND.w #$0003
	STA.w !title_tmp2&$FFFF
	SEP #$20
	CMP.w !title_pod_ready&$FFFF
	BEQ .ready
	CMP.w !title_pod_queued&$FFFF
	BEQ .stale
	REP #$20
	ASL
	TAX
	LDA.l title_up_pods,X
	TAX
	JSR title_upload
	BCS .stale
	SEP #$20
	LDA.w !title_tmp2&$FFFF
	STA.w !title_pod_queued&$FFFF
.stale
	; usable if any frame was already in the cells
	SEP #$20
	LDA.w !title_pod_ready&$FFFF
	BMI .wait
.ready
	REP #$20
	CLC
	RTS
.wait
	REP #$20
	SEC
	RTS

; Crater cells (bit0). Carry clear when ready.
title_crater_load:
	SEP #$20
	LDA.w !title_vram_ready&$FFFF
	LSR
	BCS .ready
	LDA.w !title_vram_queued&$FFFF
	LSR
	BCS .wait
	REP #$30
	LDX.w #title_up_crater
	JSR title_upload
	BCS .wait
	SEP #$20
	LDA.w !title_vram_queued&$FFFF
	ORA.b #$01
	STA.w !title_vram_queued&$FFFF
.wait
	REP #$20
	SEC
	RTS
.ready
	REP #$20
	CLC
	RTS

; Effect cells (bits 1-2, pool regions claimed). Carry clear when ready.
title_fx_load:
	SEP #$20
	LDA.w !title_vram_ready&$FFFF
	AND.b #$06
	CMP.b #$06
	BEQ .ready
	JSR title_claim_fx
	BCS .wait
	SEP #$20
	LDA.w !title_vram_ready&$FFFF
	ORA.w !title_vram_queued&$FFFF
	AND.b #$02
	BNE .second
	REP #$30
	LDX.w #title_up_fx1
	JSR title_upload
	BCS .wait
	SEP #$20
	LDA.w !title_vram_queued&$FFFF
	ORA.b #$02
	STA.w !title_vram_queued&$FFFF
.second
	SEP #$20
	LDA.w !title_vram_ready&$FFFF
	ORA.w !title_vram_queued&$FFFF
	AND.b #$04
	BNE .wait
	REP #$30
	LDX.w #title_up_fx2
	JSR title_upload
	BCS .wait
	SEP #$20
	LDA.w !title_vram_queued&$FFFF
	ORA.b #$04
	STA.w !title_vram_queued&$FFFF
.wait
	REP #$20
	SEC
	RTS
.ready
	REP #$20
	CLC
	RTS

; ---------------------------------------------------------------------------
; OAM. Same rules as core_oam_add (behind the native sprites, after the
; core cursor, leaving room for staged front sprites), written directly for
; speed: 16x16 sprites, size bit 0, X bit 8 for negative x, culled outside
; x in [-15, 256), y in [-15, 224) (lower y would wrap onto the screen).
title_oam_open:
	REP #$30
	LDA.w !core_oam_limit&$FFFF
	BEQ .none
	LDA.w !core_oam_front_n&$FFFF
	CLC
	ADC.w #$0003
	AND.w #$FFFC
	ASL
	ASL
	EOR.w #$FFFF
	SEC
	ADC.w !core_oam_limit&$FFFF
	STA.w !title_oam_end&$FFFF
	LDA.w !core_oam_cursor&$FFFF
	STA.w !title_oam_cur&$FFFF
	STA.w !title_oam_first&$FFFF
	STZ.w !title_negx_n&$FFFF
	CLC
	RTS
.none
	SEC
	RTS

; Sprite lists (data bank): db count, min x, max x, min y, max y, then the
; entries db x+128, y+128 : dw OAM word (offsets biased by 128), drawn at the
; origin (!title_ox, !title_oy). M16/X16, DB=$7E.
;
; title_list_fits: X = list. Carry clear when every sprite's top-left lies
; inside x 0-255, y 0-223 and all of them fit: then !title_tmp3 = packed
; origin ((oy << 8) + ox - $8080, added to each packed entry), !title_count =
; count and Y = OAM cursor. Lists that fit take a fast path (generated
; unrolled emitters for the fixed lists, a 4x unrolled loop for the rest);
; others are clipped sprite by sprite (title_emit_slow).
title_list_fits:
	LDA.l title_crater_sprites&$FF0000,X
	AND.w #$00FF
	BEQ .no
	STA.w !title_count&$FFFF
	ASL
	ASL
	CLC
	ADC.w !title_oam_cur&$FFFF
	CMP.w !title_oam_end&$FFFF
	BEQ +
	BCS .no
+	LDA.l (title_crater_sprites&$FF0000)+1,X  ; min x
	AND.w #$00FF
	CLC
	ADC.w !title_ox&$FFFF
	SEC
	SBC.w #128
	CMP.w #256
	BCS .no
	LDA.l (title_crater_sprites&$FF0000)+2,X  ; max x
	AND.w #$00FF
	CLC
	ADC.w !title_ox&$FFFF
	SEC
	SBC.w #128
	CMP.w #256
	BCS .no
	LDA.l (title_crater_sprites&$FF0000)+3,X  ; min y
	AND.w #$00FF
	CLC
	ADC.w !title_oy&$FFFF
	SEC
	SBC.w #128
	CMP.w #224
	BCS .no
	LDA.l (title_crater_sprites&$FF0000)+4,X  ; max y
	AND.w #$00FF
	CLC
	ADC.w !title_oy&$FFFF
	SEC
	SBC.w #128
	CMP.w #224
	BCS .no
	LDA.w !title_oy&$FFFF
	XBA
	AND.w #$FF00
	CLC
	ADC.w !title_ox&$FFFF
	SEC
	SBC.w #$8080
	STA.w !title_tmp3&$FFFF
	LDY.w !title_oam_cur&$FFFF
	CLC
	RTS
.no
	SEC
	RTS

; Fixed lists: X = list, then the matching generated emitter.
title_emit_crater:
	LDX.w #title_crater_sprites
	JSR title_list_fits
	BCS +
	LDX.w !title_tmp3&$FFFF
	JMP title_fast_crater
+	LDX.w #title_crater_sprites
	JMP title_emit_slow
title_emit_pod:
	LDX.w #title_pod_sprites
	JSR title_list_fits
	BCS +
	LDX.w !title_tmp3&$FFFF
	JMP title_fast_pod
+	LDX.w #title_pod_sprites
	JMP title_emit_slow
title_emit_trail:
	LDX.w #title_trail_sprites
	JSR title_list_fits
	BCS +
	LDX.w !title_tmp3&$FFFF
	JMP title_fast_trail
+	LDX.w #title_trail_sprites
	JMP title_emit_slow

; Any list (the effects): X = list.
title_emit_list:
	PHX
	JSR title_list_fits
	PLX
	BCC +
	JMP title_emit_slow
+	INX
	INX
	INX
	INX
	INX
	; singles until the rest is a multiple of four
	LDA.w !title_count&$FFFF
	AND.w #$0003
	BEQ .quads
	STA.w !title_tmp&$FFFF
.single
	LDA.l title_crater_sprites&$FF0000,X
	CLC
	ADC.w !title_tmp3&$FFFF
	STA.w $0800,Y
	LDA.l (title_crater_sprites&$FF0000)+2,X
	STA.w $0802,Y
	INX
	INX
	INX
	INX
	INY
	INY
	INY
	INY
	DEC.w !title_tmp&$FFFF
	BNE .single
.quads
	LDA.w !title_count&$FFFF
	LSR
	LSR
	BEQ .end
	STA.w !title_count&$FFFF
.quad
	LDA.l title_crater_sprites&$FF0000,X
	CLC
	ADC.w !title_tmp3&$FFFF
	STA.w $0800,Y
	LDA.l (title_crater_sprites&$FF0000)+2,X
	STA.w $0802,Y
	LDA.l (title_crater_sprites&$FF0000)+4,X
	CLC
	ADC.w !title_tmp3&$FFFF
	STA.w $0804,Y
	LDA.l (title_crater_sprites&$FF0000)+6,X
	STA.w $0806,Y
	LDA.l (title_crater_sprites&$FF0000)+8,X
	CLC
	ADC.w !title_tmp3&$FFFF
	STA.w $0808,Y
	LDA.l (title_crater_sprites&$FF0000)+10,X
	STA.w $080A,Y
	LDA.l (title_crater_sprites&$FF0000)+12,X
	CLC
	ADC.w !title_tmp3&$FFFF
	STA.w $080C,Y
	LDA.l (title_crater_sprites&$FF0000)+14,X
	STA.w $080E,Y
	TXA
	CLC
	ADC.w #16
	TAX
	TYA
	CLC
	ADC.w #16
	TAY
	DEC.w !title_count&$FFFF
	BNE .quad
.end
	STY.w !title_oam_cur&$FFFF
	RTS

; Clipped path: x in [-15, 256), y in [-15, 224) (lower y would wrap onto
; the screen), X bit 8 for negative x, as many sprites as fit.
title_emit_slow:
	LDA.l title_crater_sprites&$FF0000,X
	AND.w #$00FF
	BNE +
	RTS
+	STA.w !title_count&$FFFF
	; biased origins: t = entry + origin - 128 + 15 = screen + 15
	LDA.w !title_ox&$FFFF
	SEC
	SBC.w #128-15
	STA.w !title_tmp3&$FFFF
	LDA.w !title_oy&$FFFF
	SEC
	SBC.w #128-15
	STA.w !title_tmp4&$FFFF
	INX
	INX
	INX
	INX
	INX
	LDY.w !title_oam_cur&$FFFF
.next
	CPY.w !title_oam_end&$FFFF
	BCS .full
	LDA.l (title_crater_sprites&$FF0000)+1,X
	AND.w #$00FF
	CLC
	ADC.w !title_tmp4&$FFFF
	CMP.w #224+15
	BCS .skip
	SBC.w #14                       ; carry clear: -15 -> screen y
	XBA
	AND.w #$FF00
	STA.w !title_tmp&$FFFF
	LDA.l title_crater_sprites&$FF0000,X
	AND.w #$00FF
	CLC
	ADC.w !title_tmp3&$FFFF
	CMP.w #256+15
	BCS .skip
	SBC.w #14                       ; screen x
	BMI .negx
.xok
	AND.w #$00FF
	ORA.w !title_tmp&$FFFF
	STA.w $0800,Y
	LDA.l (title_crater_sprites&$FF0000)+2,X
	STA.w $0802,Y
	INY
	INY
	INY
	INY
.skip
	INX
	INX
	INX
	INX
	DEC.w !title_count&$FFFF
	BNE .next
.full
	STY.w !title_oam_cur&$FFFF
	RTS
.negx
	; record the slot for X bit 8 (at most 8 per frame; more are dropped)
	PHA
	LDA.w !title_negx_n&$FFFF
	CMP.w #8
	BCS .dropNeg
	PHX
	TAX
	TYA
	LSR
	LSR
	SEP #$20
	STA.w !title_negx&$FFFF,X
	REP #$20
	INC.w !title_negx_n&$FFFF
	PLX
	PLA
	BRA .xok
.dropNeg
	PLA
	BRA .skip

; Clear the high-table bits of our slots (size small, X bit 8 clear), set X
; bit 8 for the negative ones, and hand the cursor back to core. Bits of
; slots after ours in the last byte are cleared too: those slots are hidden
; (the game's C0:BCAB hides up to the end core records in $0120).
title_oam_close:
	REP #$30
	LDA.w !title_oam_first&$FFFF
	LSR
	LSR
	STA.w !title_tmp&$FFFF          ; slot
	LDA.w !title_oam_cur&$FFFF
	LSR
	LSR
	STA.w !title_tmp2&$FFFF         ; end slot
.lead
	; single slots up to a byte boundary (the byte's other slots are native)
	LDA.w !title_tmp&$FFFF
	CMP.w !title_tmp2&$FFFF
	BCS .negs
	AND.w #$0003
	BEQ .bytes
	TAX
	LDA.w !title_tmp&$FFFF
	LSR
	LSR
	TAY
	SEP #$20
	LDA.w $0A00,Y
	AND.l title_hi_clear,X
	STA.w $0A00,Y
	REP #$20
	INC.w !title_tmp&$FFFF
	BRA .lead
.bytes
	; whole bytes through the one holding the last slot
	LDA.w !title_tmp&$FFFF
	LSR
	LSR
	TAX
	LDA.w !title_tmp2&$FFFF
	CLC
	ADC.w #$0003
	LSR
	LSR
	STA.w !title_tmp&$FFFF          ; end byte
	SEP #$20
-	STZ.w $0A00,X
	INX
	CPX.w !title_tmp&$FFFF
	BCC -
	REP #$20
.negs
	LDY.w !title_negx_n&$FFFF
	BEQ .done
.neg
	DEY
	LDA.w !title_negx&$FFFF,Y
	AND.w #$00FF
	PHA
	AND.w #$0003
	TAX
	PLA
	LSR
	LSR
	PHY
	TAY
	SEP #$20
	LDA.w $0A00,Y
	ORA.l title_hi_x8,X
	STA.w $0A00,Y
	REP #$20
	PLY
	BNE .neg
.done
	LDA.w !title_oam_cur&$FFFF
	STA.w !core_oam_cursor&$FFFF
	RTS

; Pod (current cells) with top-left (!title_ox, !title_oy).
title_draw_pod:
	REP #$30
	JMP title_emit_pod

; Crater around the sword on BG1 (!title_map_x/y): 20 sprites from its
; deduplicated cells.
title_draw_crater:
	JSR title_crater_load
	BCS .done
	REP #$30
	LDA.w !title_map_x&$FFFF
	STA.w !title_ox&$FFFF
	LDA.w !title_map_y&$FFFF
	STA.w !title_oy&$FFFF
	JSR title_emit_crater
.done
	REP #$30
	RTS

; Descent (age = ticks, clamped to 59): the entry trail in front of the
; airborne pod.
title_draw_descent:
	REP #$30
	JSR title_hero_release
	LDA.w !title_ticks&$FFFF
	CMP.w #!TITLE_DESCENT_LAST
	BCC +
	LDA.w #!TITLE_DESCENT_LAST
+	ASL
	ASL
	TAX
	LDA.l title_descent,X
	CLC
	ADC.w !title_scr_x&$FFFF
	STA.w !title_ox&$FFFF
	LDA.l title_descent+2,X
	CLC
	ADC.w !title_scr_y&$FFFF
	STA.w !title_oy&$FFFF
	JSR title_fx_load
	BCS .pod
	JSR title_emit_trail
.pod
	REP #$30
	LDA.w #$0000
	JSR title_pod_load
	BCS .done
	JSR title_draw_pod
.done
	REP #$30
	RTS

; Impact (age = ticks): effects, Goku hopping out, the pod.
title_draw_impact:
	REP #$30
	LDA.w !title_ticks&$FFFF
	CMP.w #!TITLE_IMPACT_AGES
	BCC +
	LDA.w #!TITLE_IMPACT_AGES-1
+	STA.w !title_age&$FFFF          ; table age (clamped)
	; effects (in front), for ages below the table end
	LDA.w !title_ticks&$FFFF
	CMP.w #!TITLE_IMPACT_AGES
	BCS .hero
	JSR title_fx_load
	BCS .hero
	REP #$30
	LDA.w !title_age&$FFFF
	ASL
	TAX
	LDA.l title_impact_fx_index,X
	TAX
	LDA.w !title_scr_x&$FFFF
	STA.w !title_ox&$FFFF
	LDA.w !title_scr_y&$FFFF
	STA.w !title_oy&$FFFF
	JSR title_emit_list
.hero
	JSR title_hero_update
	; pod position and frame (settles by age 42)
	REP #$30
	LDA.w !title_age&$FFFF
	ASL
	CLC
	ADC.w !title_age&$FFFF          ; 3 bytes per age
	TAX
	STX.w !title_count&$FFFF
	LDA.l title_impact_pod+2,X
	JSR title_pod_load
	BCS .done
	LDX.w !title_count&$FFFF
	LDA.l title_impact_pod,X
	AND.w #$00FF
	SEC
	SBC.w #128
	CLC
	ADC.w !title_scr_x&$FFFF
	STA.w !title_ox&$FFFF
	LDA.l title_impact_pod+1,X
	AND.w #$00FF
	SEC
	SBC.w #128
	CLC
	ADC.w !title_scr_y&$FFFF
	STA.w !title_oy&$FFFF
	JSR title_draw_pod
.done
	REP #$30
	RTS

; Hero during the impact (arrival.js drawScene): hidden until age 78 (Goku
; is in the pod; his shadow stays), then a 32x32 Goku cell hopping from the
; pod to the native actor position. The goku module uploads the requested
; cell (!goku_cell_req, base sheet row 0, column 37 in the air, 36 landed)
; into the hero's OBJ tiles; its native body entries are hidden here and
; the hop is drawn from those tiles with the body's palette.
title_hero_update:
	REP #$30
	LDA.w !title_ticks&$FFFF
	CMP.w #78-1
	BCS .hop
	SEP #$20
	LDA.b #$01
	STA.w !title_hero_mode&$FFFF
	STZ.w !title_hero_col&$FFFF
	REP #$20
	STZ.w !goku_cell_req&$FFFF
	JMP title_hide_hero
.hop
	; request next frame's cell (requests apply when the body is drawn);
	; goku_api_cell runs only when the column changes
	LDA.w !title_ticks&$FFFF
	INC
	SEC
	SBC.w #78
	CMP.w #32
	LDA.w #37
	BCC +
	LDA.w #36
+	SEP #$20
	CMP.w !title_hero_col&$FFFF
	BEQ .cached
	STA.w !title_hero_col&$FFFF
	REP #$20
	AND.w #$00FF
	TAX
	LDA.w #$0000
	LDY.w #$0000
	JSL goku_api_cell
	INC                             ; id + 1; $FFFF (no art) -> 0
	STA.w !title_hero_cell&$FFFF
.cached
	REP #$30
	LDA.w !title_hero_cell&$FFFF
	STA.w !goku_cell_req&$FFFF
	LDA.w !title_ticks&$FFFF
	CMP.w #78
	BCS +
	JMP title_hide_hero             ; age 77: still inside
+	SEC
	SBC.w #78
	CMP.w #32
	BCC +
	LDA.w #32
+	STA.w !title_tmp&$FFFF          ; k = hop step 0..32
	; x = a + floor(((b-a)k + 16) / 32), a = cx + 8, b = hero screen x - 16
	LDA.w $E020
	SEC
	SBC.w !title_scr_x&$FFFF
	SEC
	SBC.w #16+8                     ; b - a
	JSR .mulk
	CLC
	ADC.w #16
	CMP.w #$8000 : ROR              ; arithmetic shifts: floor(/32)
	CMP.w #$8000 : ROR
	CMP.w #$8000 : ROR
	CMP.w #$8000 : ROR
	CMP.w #$8000 : ROR
	CLC
	ADC.w !title_scr_x&$FFFF
	CLC
	ADC.w #8
	STA.w !title_hero_x&$FFFF
	; y = c + floor(((d-c)k*8 - sine[k] + 128) / 256), c = cy - 45, d = hero screen y - 31
	LDA.w $E022
	SEC
	SBC.w !title_scr_y&$FFFF
	CLC
	ADC.w #45-31                    ; d - c
	JSR .mulk
	ASL
	ASL
	ASL                             ; (d-c)k*8
	PHA
	LDA.w !title_tmp&$FFFF
	ASL
	TAX
	PLA
	SEC
	SBC.l title_hop_sine,X
	CLC
	ADC.w #128
	XBA                             ; floor(/256): high byte, sign extended
	AND.w #$00FF
	CMP.w #$0080
	BCC +
	ORA.w #$FF00
+	CLC
	ADC.w !title_scr_y&$FFFF
	SEC
	SBC.w #45
	STA.w !title_hero_y&$FFFF
	SEP #$20
	LDA.b #37
	LDX.w !title_tmp&$FFFF
	CPX.w #32
	BCC +
	LDA.b #36
+	STA.w !title_hero_frame&$FFFF
	LDA.b #$02
	STA.w !title_hero_mode&$FFFF
	REP #$20
	JSR title_hide_hero             ; A = the body's palette/priority bits (or 0)
	; the hop cell: quadrants C0/C2/C4/C6 of name table 1, priority 3
	AND.w #$0E00                    ; palette bits of the hidden body
	BNE +
	LDA.w #$0200                    ; palette 1 when no body was drawn
+	ORA.w #$31C0                    ; priority 3, tile $1C0
	STA.w !title_count&$FFFF        ; OAM word of the top-left quadrant
	; fast path: the whole 32x32 cell on screen and four slots free
	LDA.w !title_hero_x&$FFFF
	CMP.w #256-32+1
	BCS .slow
	LDA.w !title_hero_y&$FFFF
	CMP.w #224-32+1
	BCS .slow
	LDA.w !title_oam_cur&$FFFF
	CLC
	ADC.w #16
	CMP.w !title_oam_end&$FFFF
	BEQ +
	BCS .slow
+	LDY.w !title_oam_cur&$FFFF
	STA.w !title_oam_cur&$FFFF
	LDA.w !title_hero_y&$FFFF
	XBA
	ORA.w !title_hero_x&$FFFF       ; (y << 8) | x
	STA.w $0800,Y
	CLC
	ADC.w #$0010                    ; no carries: x <= 224, y <= 192
	STA.w $0804,Y
	ADC.w #$1000-$0010
	STA.w $0808,Y
	ADC.w #$0010
	STA.w $080C,Y
	LDA.w !title_count&$FFFF
	STA.w $0802,Y
	INC
	INC
	STA.w $0806,Y
	INC
	INC
	STA.w $080A,Y
	INC
	INC
	STA.w $080E,Y
	RTS
.slow
	; one quadrant at a time, clipped
	LDX.w #$0000
.quadrant
	LDA.w !title_hero_x&$FFFF
	CLC
	ADC.l title_hop_dx,X
	STA.w !title_tmp3&$FFFF
	LDA.w !title_hero_y&$FFFF
	CLC
	ADC.l title_hop_dy,X
	STA.w !title_tmp4&$FFFF
	TXA
	LSR
	CLC
	ADC.w !title_count&$FFFF        ; tiles +0/+2/+4/+6
	PHX
	JSR title_oam_one
	PLX
	INX
	INX
	INX
	INX
	CPX.w #16
	BCC .quadrant
	RTS

; A16 signed * k (0-32, in !title_tmp) -> A16 (shift and add).
.mulk
	STA.w !title_tmp2&$FFFF
	LDA.w !title_tmp&$FFFF
	STA.w !title_tmp4&$FFFF
	LDA.w #$0000
	LDY.w #6
-	LSR.w !title_tmp4&$FFFF
	BCC +
	CLC
	ADC.w !title_tmp2&$FFFF
+	ASL.w !title_tmp2&$FFFF
	DEY
	BNE -
	RTS

; One 16x16 sprite at (!title_tmp3, !title_tmp4), A = OAM word.
title_oam_one:
	STA.w !title_tmp&$FFFF
	LDA.w !title_tmp4&$FFFF
	CLC
	ADC.w #15
	CMP.w #224+15
	BCS .out
	LDA.w !title_tmp3&$FFFF
	CLC
	ADC.w #15
	CMP.w #256+15
	BCS .out
	LDY.w !title_oam_cur&$FFFF
	CPY.w !title_oam_end&$FFFF
	BCS .out
	LDA.w !title_tmp4&$FFFF
	XBA
	AND.w #$FF00
	STA.w !title_tmp2&$FFFF
	LDA.w !title_tmp3&$FFFF
	BPL +
	; negative x: X bit 8
	LDA.w !title_negx_n&$FFFF
	CMP.w #8
	BCS .out
	TAX
	TYA
	LSR
	LSR
	SEP #$20
	STA.w !title_negx&$FFFF,X
	REP #$20
	INC.w !title_negx_n&$FFFF
	LDA.w !title_tmp3&$FFFF
+	AND.w #$00FF
	ORA.w !title_tmp2&$FFFF
	STA.w $0800,Y
	LDA.w !title_tmp&$FFFF
	STA.w $0802,Y
	TYA
	CLC
	ADC.w #$0004
	STA.w !title_oam_cur&$FFFF
.out
	RTS

; Hide the hero's native body entries (Goku's quadrants C0-C6 of name table
; 1 or the boy's cells, and a held sword) among this frame's native sprites.
; Returns A16 = OAM bytes 2-3 of the first hidden body entry, or 0.
title_hide_hero:
	REP #$30
	STZ.w !title_tmp4&$FFFF
	LDA.w !core_oam_native&$FFFF
	ASL
	ASL
	STA.w !title_tmp3&$FFFF
	LDX.w #$0000
.slot
	CPX.w !title_tmp3&$FFFF
	BCS .done
	LDA.w $0802,X                   ; tile, attr
	AND.w #$01FF
	CMP.w #$01C0
	BCC .notBody
	CMP.w #$01F0
	BCS .keep
	LDA.w !title_tmp4&$FFFF
	BNE .hide
	LDA.w $0802,X
	STA.w !title_tmp4&$FFFF
	BRA .hide
.notBody
	CMP.w #$0144
	BCC .keep
	CMP.w #$014A
	BCS .keep
.hide
	LDA.w #$E0FF
	STA.w $0800,X
.keep
	INX
	INX
	INX
	INX
	BRA .slot
.done
	LDA.w !title_tmp4&$FFFF
	RTS

; Outside the impact: hand the hero back to the goku module.
title_hero_release:
	PHP
	SEP #$20
	LDA.w !title_hero_mode&$FFFF
	BEQ .done
	STZ.w !title_hero_mode&$FFFF
	REP #$20
	STZ.w !goku_cell_req&$FFFF
.done
	PLP
	RTS

; ---------------------------------------------------------------------------
; Palettes. The field NMI uploads 7E:0600, or 7E:BE00 while $2A is set. The
; sword flash (C2:C820, before this hook) rebuilds BE00 from 0600 whenever
; its level steps (every fifth frame in the arrival), adding one clamped
; amount per channel to palettes 1-15 (OBJ palettes too while $2A bit 6 is
; set). Our colours go into 0600 once per visit
; (!title_palstate bit0; the game does not touch OBJ palettes 2/6/7 on map
; 128). On flash frames the pod and effect colours are put back into BE00
; (the browser draws them unflashed); the crater keeps the flash, which is
; exactly the browser's craterColors tint (the largest per-channel offset of
; BG palettes 1-5 over the map's own colours). Outside the flash that tint is
; derived from 0600 and written there (title_crater_tint).
; title_write_pal: X = source address (data bank), Y = CGRAM byte offset of
; palette entry 1, A = destination buffer ($0600 or $BE00); 15 colours.
title_write_pal:
	REP #$30
	PHB
	STA.w !title_tmp&$FFFF
	TYA
	CLC
	ADC.w !title_tmp&$FFFF
	TAY
	LDA.w #29
	db $54,$7E,title_pal_pod>>16     ; MVN data bank -> 7E
	PLB
	RTS

; Scene palettes (descent, impact): pod (7), effects (2: the lightning set
; before impact age 36, the dark impact sparks from then on), crater (6).
title_scene_palettes:
	REP #$30
	LDX.w #title_pal_fxa
	SEP #$20
	LDA.w !title_phase&$FFFF
	CMP.b #!TITLE_PH_IMPACT
	REP #$20
	BNE +
	LDA.w !title_ticks&$FFFF
	CMP.w #36
	BCC +
	LDX.w #title_pal_fxb
+	STX.w !title_tmp2&$FFFF
	CPX.w !title_palfx&$FFFF
	BEQ +
	STX.w !title_palfx&$FFFF
	SEP #$20
	LDA.w !title_palstate&$FFFF
	AND.b #$FE                      ; rewrite 0600
	STA.w !title_palstate&$FFFF
	REP #$20
+	SEP #$20
	LDA.w !title_palstate&$FFFF
	REP #$20
	LSR
	BCS .flash
	LDA.w #$0600
	LDX.w !title_tmp2&$FFFF
	LDY.w #!TITLE_CG_FX
	JSR title_write_pal
	JSR title_base_palettes
.flash
	SEP #$20
	LDA.w $002A
	REP #$20
	BNE +
	JMP title_crater_tint
+	LDA.w #$BE00
	LDX.w #title_pal_pod
	LDY.w #!TITLE_CG_POD
	JSR title_write_pal
	; effects (none after the impact table), lightning frames 1-2 in crater
	; entries 8-14 (impact ages 0-35)
	SEP #$20
	LDA.w !title_phase&$FFFF
	CMP.b #!TITLE_PH_IMPACT
	REP #$20
	BNE .fx
	LDA.w !title_ticks&$FFFF
	CMP.w #!TITLE_IMPACT_AGES
	BCS .done
	CMP.w #36
	BCS .fx
	PHB
	LDX.w #title_pal_crater+14
	LDY.w #$BE00+!TITLE_CG_CRATER+14
	LDA.w #13                        ; 7 colours
	db $54,$7E,title_pal_pod>>16     ; MVN data bank -> 7E
	PLB
.fx
	LDA.w #$BE00
	LDX.w !title_tmp2&$FFFF
	LDY.w #!TITLE_CG_FX
	JMP title_write_pal
.done
	RTS

; Pod and crater (plain) into 0600; the tint there is then zero.
title_base_palettes:
	LDA.w #$0600
	LDX.w #title_pal_pod
	LDY.w #!TITLE_CG_POD
	JSR title_write_pal
	LDA.w #$0600
	LDX.w #title_pal_crater
	LDY.w #!TITLE_CG_CRATER
	JSR title_write_pal
	STZ.w !title_tint&$FFFF
	SEP #$20
	LDA.w !title_palstate&$FFFF
	ORA.b #$01
	STA.w !title_palstate&$FFFF
	REP #$20
	RTS

; Crater and pod palettes outside the scene.
title_crater_palette:
	REP #$30
	SEP #$20
	LDA.w !title_palstate&$FFFF
	REP #$20
	LSR
	BCS +
	JSR title_base_palettes
+	SEP #$20
	LDA.w $002A
	REP #$20
	BEQ title_crater_tint
	LDA.w #$BE00
	LDX.w #title_pal_pod
	LDY.w #!TITLE_CG_POD
	JMP title_write_pal

; Without the flash: crater colours 1-7 in 0600 offset per channel by what
; the map's own reference colours (!TITLE_REF_*, the smallest ground value in
; each channel) show over their ground values, clamped. Written only when
; the offsets change.
title_crater_tint:
	REP #$30
	LDA.w $0600+!TITLE_REF_B
	AND.w #$7C00
	SEC
	SBC.w #!TITLE_REF_B_GROUND
	BPL +
	LDA.w #$0000
+	STA.w !title_tmp3&$FFFF
	LDA.w $0600+!TITLE_REF_G
	AND.w #$03E0
	SEC
	SBC.w #!TITLE_REF_G_GROUND
	BPL +
	LDA.w #$0000
+	ORA.w !title_tmp3&$FFFF
	STA.w !title_tmp3&$FFFF
	LDA.w $0600+!TITLE_REF_R
	AND.w #$001F
	SEC
	SBC.w #!TITLE_REF_R_GROUND
	BPL +
	LDA.w #$0000
+	ORA.w !title_tmp3&$FFFF
	CMP.w !title_tint&$FFFF
	BNE +
	RTS
+	STA.w !title_tint&$FFFF
	LDY.w #$0600+!TITLE_CG_CRATER
	LDX.w #$0000
.colour
	LDA.l title_pal_crater,X
	STA.w !title_tmp&$FFFF
	AND.w #$001F
	STA.w !title_tmp2&$FFFF
	LDA.w !title_tint&$FFFF
	AND.w #$001F
	CLC
	ADC.w !title_tmp2&$FFFF
	CMP.w #$0020
	BCC +
	LDA.w #$001F
+	STA.w !title_tmp2&$FFFF
	LDA.w !title_tmp&$FFFF
	AND.w #$03E0
	STA.w !title_tmp4&$FFFF
	LDA.w !title_tint&$FFFF
	AND.w #$03E0
	CLC
	ADC.w !title_tmp4&$FFFF
	CMP.w #$0400
	BCC +
	LDA.w #$03E0
+	ORA.w !title_tmp2&$FFFF
	STA.w !title_tmp2&$FFFF
	LDA.w !title_tmp&$FFFF
	AND.w #$7C00
	STA.w !title_tmp4&$FFFF
	LDA.w !title_tint&$FFFF
	AND.w #$7C00
	CLC
	ADC.w !title_tmp4&$FFFF
	CMP.w #$8000
	BCC +
	LDA.w #$7C00
+	ORA.w !title_tmp2&$FFFF
	STA.w $0000,Y
	INX
	INX
	INY
	INY
	CPX.w #!TITLE_CRATER_COLORS*2
	BCC .colour
	RTS

; High-table masks per slot within a byte; offsets of the hop quadrants.
title_hi_clear:
	db $FC,$F3,$CF,$3F
title_hi_x8:
	db $01,$04,$10,$40
title_hop_dx:
	dw 0,0,16,0,0,0,16,0
title_hop_dy:
	dw 0,0,0,0,16,0,16,0
