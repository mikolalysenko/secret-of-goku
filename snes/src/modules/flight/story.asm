; Story hooks and queries owned by flight (docs/agents/snes-port/story.md).
; JSL, M16/X16, DB = $7E, D = 0; preserve DB/D; RTL.

; FLIGHT_LAND (the Potos gatekeeper's banishment, potos-story.js): cancel
; combat, land at once, hide the pad this frame, 'landing'.
fl_story_land:
	JSR fl_bind_cancel
	JSR fl_land_now
	LDA.w !core_pad_mask&$FFFF
	ORA.w #$FFF0
	STA.w !core_pad_mask&$FFFF
	LDA.w #!FL_SFX_LANDING
	JSR fl_bind_sfx
	RTL

; QUEST_WISH_CEILING (the wish): the browser's ceiling.repair() is empty,
; since escapes leave no holes behind.
fl_story_wish_ceiling:
	RTL

; LOCAL_FLIGHT: A16 = 1 while Goku hovers in local flight.
fl_story_local_flight:
	LDA.w !fl_state
	AND.w #!FLS_FLY
	RTL
