; Services for other modules (flight.md "API for other modules"): the
; browser's mod.localFlightHook.canLand(x, y, layer, terrain), which
; frieza.js, frieza-arena.js, fortress-collapse.js and sandship-wreck.js call,
; and a scene's camera target through the camera dispatcher this module
; hooks (frieza-intro.js installAltarCamera).

; Shared takeoff restriction, including Frieza and Vegeta's custom targets.
; Any DB/D/M/X; preserves A/X/Y/DB/D, returns C set while a boss is alive.
flight_api_boss_active:
	PHP
	REP #$30
	PHB
	PHD
	PHA
	PHX
	PHY
	PEA $7E7E
	PLB
	PLB
	LDA.w #$0000
	TCD
	JSR fl_ce_boss
	PLY
	PLX
	PLA
	PLD
	PLB
	BCS fl_api_yes
	BRA fl_api_no

; !FLIGHT_API_CAN_LAND: JSL, M16/X16, any DB and D. A16 = x, X16 = y (map
; pixels, the centre of the 12x8 footprint), at Goku's layer and terrain
; (E00B). C = canLand: no floor hole (!FLIGHT_MISSING_FLOOR) under the
; footprint and all its sample tiles are floor at that terrain. A, X, Y,
; DB and D are kept. About 150-450 instructions a call (more for tiles the
; tile cache has not seen): spread wide searches over frames.
flight_api_can_land:
	PHP
	REP #$30
	PHY
	PHA
	LDA.l $7EE00B
	TAY                          ; Goku's terrain byte
	PLA
	JSR fl_api_land
	PLY
	BCS fl_api_yes
fl_api_no:
	PLP
	CLC
	RTL
fl_api_yes:
	PLP
	SEC
	RTL

; !FLIGHT_API_CAN_LAND_T: the same at Y16 = a terrain byte (bit 7 = layer 1,
; bits 0-1 = terrain), as frieza.js passes the terrain it recorded when the
; fight began.
flight_api_can_land_t:
	PHP
	REP #$30
	JSR fl_api_land
	BCS fl_api_yes
	BRA fl_api_no

; A = x, X = y, Y = terrain byte; M16/X16, any DB and D. C = canLand.
; Keeps X, Y, DB and D.
fl_api_land:
	PHB
	PHD
	PHX
	PHY
	PHA
	PEA $7E7E
	PLB
	PLB
	LDA.w #$0000
	TCD
	LDA.w !fl_magic
	CMP.w #!FL_MAGIC
	BEQ +
	JSR fl_init_work
+	JSR fl_ctx_update            ; the map's context, also outside flight's frames
	PLA                          ; [Y terrain][X y][D][B]
	STA.w !fl_q_x
	LDA $03,S
	STA.w !fl_q_y
	LDA $01,S
	AND.w #$0003
	STA.w !fl_q_t
	LDA $01,S
	AND.w #$0080
	BEQ +
	LDA.w #$0001
+	STA.w !fl_q_l
	LDA.w #$0000
	STA.l !fl_g_chk              ; another module's call: the grid's tiles are checked again
	JSR fl_can_land
	PLY
	PLX
	PLD
	PLB
	RTS

; !FLIGHT_API_CAMERA (frieza-intro.js installAltarCamera): JSL, M16/X16, any
; DB. A16 = camera x, X16 = camera y (the tile-stream origin $A8/$AA) the
; scene wants. Post it every field frame the scene holds the camera: during
; the next frame's movement the dispatcher (C0:D651/DA6E) moves the camera
; one pixel per axis per video frame toward it, runs even while Goku stands,
; and other actors' steps give it no deltas, so rows stream as for a walk
; and NPCs stay in the room. A frame without a post ends it (the camera
; stays where it got to). It takes precedence over a teleport's camera
; follow. A, X, Y and DB are kept.
flight_api_camera:
	PHP
	REP #$30
	STA.l !fl_scam_x
	PHA
	TXA
	STA.l !fl_scam_y
	LDA.l $7E0000|!fl_hook
	ORA.w #!FLH_SCRIPT
	STA.l $7E0000|!fl_hook       ; fl_publish clears it at the end of each flight frame
	PLA
	PLP
	RTL
