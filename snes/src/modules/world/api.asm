; Public API of the world module (JSL entry points; see
; docs/agents/snes-port/world.md). All preserve DB, D and the caller's M/X
; unless noted; results come back in the carry or A.

; world_takeoff: take off into world flight from the current field map
; through the game's own $0C00|map event (the Drum's path: return map,
; landing, fade and Mode 7 loader stay native; C1:E833 skips the summon).
; Out: C clear = requested (starts at the end of a later idle field frame),
; C set = not possible now (Goku inactive, map forbids flight, field busy,
; another event pending, or !w_lock set).
world_takeoff:
	PHP
	PHB
	PHD
	REP #$30
	PEA $7E7E
	PLB
	PLB
	LDA.w #$0000
	TCD
	JSR world_takeoff_check
	BCS .no
	LDA $DC
	AND.w #$00FF
	ORA.w #$0C00
	JSL core_event_request
	BCS .no
	LDA.w #$0001
	STA.w !w_takeoff_req
	PLD
	PLB
	PLP
	CLC
	RTL
.no
	PLD
	PLB
	PLP
	SEC
	RTL

; world_takeoff_allowed: C clear when world_takeoff would succeed now
; (callers such as the ceiling escape use it to choose their route).
world_takeoff_allowed:
	PHP
	PHB
	PHD
	REP #$30
	PEA $7E7E
	PLB
	PLB
	LDA.w #$0000
	TCD
	JSR world_takeoff_check
	PLD
	PLB
	BCS .no
	PLP
	CLC
	RTL
.no
	PLP
	SEC
	RTL

; M16/X16, DB = $7E, D = 0. C clear = a takeoff can start from here.
world_takeoff_check:
	JSR world_goku
	BCC .no
	LDA.w !w_lock
	BNE .no
	LDA.w !core_event_req&$FFFF
	BNE .no
	LDA.w !core_mode&$FFFF
	CMP.w #!CORE_MODE_FIELD
	BNE .no
	SEP #$20
	LDA $D0
	BNE .no8
	LDA $EC
	AND.b #$FE
	BNE .no8
	LDA $E4
	CMP.b #$01
	BNE .no8
	LDA $E5
	CMP.b #$01
	BNE .no8
	LDA $FF
	BNE .no8
	LDA $E8
	AND.b #$04
	BNE .no8
	LDA.l $7EE02C                    ; player 1 controls Goku
	LSR
	BCC .no8
	REP #$20
	; the map header must allow flight (byte 4 bit 7; table C8:7000)
	LDA $DC
	AND.w #$01FF
	ASL
	TAX
	LDA.l $C87000,X
	TAX
	LDA.l $C80004,X
	AND.w #$0080
	BEQ .no
	CLC
	RTS
.no8
	REP #$20
.no
	SEC
	RTS

; world_fortress_destroyed: C set once Goku's wave destroyed the Mana
; Fortress (persistent; ending/story/frieza query it).
world_fortress_destroyed:
	PHP
	SEP #$20
	LDA.l !pw_flags
	AND.b #!PWF_FORTRESS
	BEQ .no
	PLP
	SEC
	RTL
.no
	PLP
	CLC
	RTL

; Story query FORTRESS_DESTROYED: A16 = 1 once Goku's wave destroyed the
; Fortress (routes 429 to the post-destruction scene, ending rules).
; M16/X16, DB = $7E.
world_query_fortress:
	LDA.l !pw_flags
	AND.w #!PWF_FORTRESS
	BEQ +
	LDA.w #$0001
+	RTL

; world_town_destroyed: A16 = map id -> C set when a crater covers that
; town (one of world_town_maps). Exit M16/X16.
world_town_destroyed:
	REP #$30
	LDX.w #!WORLD_TOWN_COUNT*2-2
.scan
	CMP.l world_town_maps,X
	BEQ .found
	DEX
	DEX
	BPL .scan
	CLC
	RTL
.found
	LDA.l world_bit,X
	AND.l !pw_towns
	BEQ .no
	SEC
	RTL
.no
	CLC
	RTL

; world_scar_count: A16 = craters on the world map (persistent). Exit M16.
world_scar_count:
	REP #$20
	LDA.l !pw_count
	AND.w #$00FF
	RTL

; world_wish_restore: the restoration wish repairs every crater and town
; (engine/dragon-quest.js wish(): worldScars.restore()). Any M/X.
world_wish_restore:
	PHP
	SEP #$20
	LDA.b #$00
	STA.l !pw_count
	STA.l !pw_towns
	STA.l !pw_towns+1
	PLP
	RTL

; ---------------------------------------------------------------------------
; Lifecycle (dispatch tables in snes/src/modules.asm).

; modules_title_boot: power-on, soft reset and quitting to the title clear
; the world block (core clears only $7E:D700-DDFF and its own block).
; M16/X16, DB = $7E.
world_title_boot:
	JSR world_ram_clear
	RTL

; modules_new_game: the mod starts with the Fly item in the former Drum
; slot (engine/rom-patches.js: item $27 into the first inventory slot
; $7E:CC48 after the native initializer). M16/X16, DB = $7E.
world_new_game:
	SEP #$20
	LDA.b #$27
	STA.l $7ECC48
	REP #$20
	RTL
