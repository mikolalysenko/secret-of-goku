; World-flight frame: Goku replaces Flammie (pose, shadow, docking approach)
; and runs the aerial powers. modules_world_frame, after the world logic and
; OAM build. M16/X16, DB = $7E, D = 0.

world_world_frame:
if defined("GOKU_TRACE")
	RTL                              ; goku's test trace overwrites $7E:7F00
endif
	JSR world_ram_check
	JSR world_goku
	BCS +
	RTL
+	LDA.w !w_mode_prev
	CMP.w #!CORE_MODE_WORLD
	BEQ +
	JSR world_enter
+	LDA.w #!CORE_MODE_WORLD
	STA.w !w_mode_prev
	INC.w !w_frame
	LDA.w !core_pad&$FFFF
	STA.w !w_input
	JSR world_fx_upload
	JSR world_shadow
	JSR world_dock_track
	JSR world_ki
	JSR world_pose
	JSR world_palettes
	JSR world_draw
	RTL

; First world frame of a flight: claim the OBJ region, reset the session.
world_enter:
	LDA.w #!VRAM_WORLD_OBJ_A
	LDX.w #!WORLD_VRAM_OWNER
	JSL core_vram_claim
	LDA.w #$0000
	ROL                              ; carry set = held by another owner
	EOR.w #$0001
	STA.w !w_vram_ok
	STZ.w !w_fx_state
	STZ.w !w_frame
	STZ.w !w_anim_age
	STZ.w !w_anim_tick
	STZ.w !w_anim_frame
	STZ.w !w_shadow_t
	STZ.w !w_dock
	STZ.w !w_cell_show
	LDA.w #$FFFF
	STA.w !w_cell_buf0
	STA.w !w_cell_buf1
	STA.w !w_mini
	STA.w !w_pal_form
	STA.w !w_cell_want
	STA.w !w_cell_key
	LDA.w #$0003
	STA.w !w_pal_dirty
	LDA.w #!WF_ACTIVE
	TSB.w !w_flags
	JSR world_ki_reset
	; the takeoff pose ends with the world on screen (mana-mod.js)
	STZ.w !w_trans_kind
	STZ.w !w_trans_age
	STZ.w !w_takeoff_req
	JSR wf_release_mode
	RTS

; Effect tiles into OBJ region A over the first frames (they share VRAM with
; field sprites, so every flight reloads them). Four transfers per frame.
world_fx_upload:
	LDA.w !w_vram_ok
	BEQ .done
	LDA.w !w_fx_state
	CMP.w #8
	BCS .done
	ASL
	ASL
	ASL
	TAX                              ; chunk * 8
	LDA.w #world_fx_tiles>>16
	STA.w !core_scratch&$FFFF
	LDA.l world_fx_chunks+4,X        ; bytes
	PHA
	LDA.l world_fx_chunks+2,X        ; source offset
	CLC
	ADC.w #world_fx_tiles
	TAY
	LDA.l world_fx_chunks,X          ; VRAM word address
	PLX
	JSL core_queue_vram
	BCS .done                        ; queue full: retry next frame
	INC.w !w_fx_state
	LDA.w !w_fx_state
	AND.w #$0003
	BNE world_fx_upload              ; up to four per frame
.done
	RTS
; VRAM word address, offset in fx.bin (tile rows from $060), bytes.
world_fx_chunks:
	dw $6000+($088*16), ($88-$60)*32, 256, 0
	dw $6000+($098*16), ($98-$60)*32, 256, 0
	dw $6000+($0A8*16), ($A8-$60)*32, 256, 0
	dw $6000+($0B8*16), ($B8-$60)*32, 256, 0
	dw $6000+($0C0*16), ($C0-$60)*32, 512, 0
	dw $6000+($0D0*16), ($D0-$60)*32, 512, 0
	dw $6000+($0E0*16), ($E0-$60)*32, 512, 0
	dw $6000+($0F0*16), ($F0-$60)*32, 512, 0
assert world_fx_tiles_end-world_fx_tiles == ($100-$60)*32, "fx.bin layout"

; Flammie's terrain shadow: C0:95A0 builds its window table when flying low
; (sets $2D = 1; the NMI enables it on odd $2D). Take its centre line and
; keep the window itself off ($2D = 0, so the builder runs again next frame
; and HDMA channel 7 stays free); Goku gets a small pixel shadow instead.
world_shadow:
	SEP #$20
	LDA $2D
	CMP.b #$01
	BNE .notBuilt
	STZ $2D
	REP #$20
	LDA $4E                          ; centre = 127 + ($4E - $8F) + 8
	SEC
	SBC.w #$008F
	AND.w #$00FF
	CLC
	ADC.w #135
	STA.w !w_shadow_y
	LDA.w #$0002
	STA.w !w_shadow_t
	RTS
.notBuilt
	REP #$20
	LDA.w !w_shadow_t
	BEQ +
	DEC.w !w_shadow_t
+	RTS

; Docking approach: the native counter $BF runs while the Fortress pulls
; Goku in (C2:B1C2) and its fade ends in landing record 10 (C2:B1CA). A
; short ki boost replaces the four-second miniature dragon approach
; (native-flight.js: +5 per frame); Goku flies a curve into the projected
; Fortress, shrinking (sprite-layer.js docking).
world_dock_track:
	LDA $BF
	AND.w #$00FF
	BNE .docking
	STZ.w !w_dock
	RTS
.docking
	PHA
	LDA.w !w_dock
	BNE +
	INC.w !w_dock
	LDA.w #128                       ; native-flight.js docking = {x:128, y:40}
	STA.w !w_dock_x
	LDA.w #40
	STA.w !w_dock_y
	JSR world_sfx_takeoff            ; onDock: 'flight'
+	PLA
	CMP.w #250
	BCS +
	CLC
	ADC.w #5
	SEP #$20
	STA $BF
	REP #$20
+	; follow the Fortress on screen (C2:B1F7 records it each frame)
	JSR world_fort_fresh
	BCS .done
	LDA.w !w_fort_x
	STA.w !w_dock_x
	LDA.w !w_fort_y
	STA.w !w_dock_y
.done
	RTS

