; Native sound and event requests (included by core.asm in the core bank).

; ---------------------------------------------------------------------------
; Sound. The game's driver interface is C3:0004 (JMP C3:0160): it consumes
; the 4-byte command at $7E:1E00 (byte 0 = command, 0 means none), talks to
; the SPC700 through $2140-$2143 with busy-wait handshakes, preserves every
; register and returns with RTL. Commands seen in the game and the browser
; mod: 01 ss xx xx music (song ss), 02 ee vv 88 sound effect ee at volume vv
; (e.g. 02 50 0F 88 hit, 02 2A 0F 88 charge, 02 12 00 88 transform), 02 94
; 0F 80 boss death, 02 D8 00 88 item acquire. Call sites run on the main
; loop (field, world, menus), never in NMI.
;
; core_sound_queue: A16 = bytes 0-1 (command | param1<<8), X16 = bytes 2-3.
;   Carry set when the queue (7 commands) is full. One queued command is
;   sent per dispatched frame (any mode), from the frame hook after modules,
;   and only while $1E00 is idle.
core_sound_queue:
	PHA
	PHX
	LDA.w !core_snd_tail&$FFFF
	INC
	AND.w #$0007
	CMP.w !core_snd_head&$FFFF
	BEQ .full
	PHA                               ; next tail
	LDA.w !core_snd_tail&$FFFF
	ASL : ASL : TAX
	LDA $05,S                         ; caller A
	STA.w !core_snd_queue&$FFFF,X
	LDA $03,S                         ; caller X
	STA.w (!core_snd_queue&$FFFF)+2,X
	PLA
	STA.w !core_snd_tail&$FFFF
	PLX
	PLA
	CLC
	RTL
.full
	PLX
	PLA
	SEC
	RTL

; Send one queued command (core_frame_end). M16/X16, DB = $7E, D = 0.
core_sound_pump:
	LDA.w !core_snd_head&$FFFF
	CMP.w !core_snd_tail&$FFFF
	BEQ .none
	LDA.w $1E00
	AND.w #$00FF
	BNE .none                         ; a native command is still pending
	LDA.w !core_snd_head&$FFFF
	ASL : ASL : TAX
	LDA.w (!core_snd_queue&$FFFF)+2,X
	STA.w $1E02
	LDA.w !core_snd_queue&$FFFF,X
	STA.w $1E00
	LDA.w !core_snd_head&$FFFF
	INC
	AND.w #$0007
	STA.w !core_snd_head&$FFFF
	JSL $C30004
	REP #$30
.none
	RTS

; ---------------------------------------------------------------------------
; Native events. C1:E76D is the game's event dispatcher (JSL with A16 = event
; id; D = 0): ids < $800 start script events (tables C9:0000 / CA:0000, sets
; $D0 = 1), $800-$BFF door/map transitions, $C00+ world-map requests (e.g.
; $0C00 | map = take off to world flight from that map; the Drum's path).
; $D4 = triggering actor offset (0 = the hero). The browser mod calls it the
; same way at the field loop boundary for takeoff, orb puzzles and story.
;
; core_event_request: A16 = event id. Carry set if a request is pending.
;   The event starts at the end of a later field frame hook (after modules)
;   once the field is idle: $D0 = 0, ($EC & $FE) = 0, $E4 = $E5 = 1 (no
;   fade), $FF = 0, ($E8 & 4) = 0. !core_event_req holds $8000|id until then
;   (write 0 to cancel); !core_event_last is the last id started.
core_event_request:
	PHA
	LDA.w !core_event_req&$FFFF
	BNE .busy
	PLA
	AND.w #$0FFF
	ORA.w #$8000
	STA.w !core_event_req&$FFFF
	CLC
	RTL
.busy
	PLA
	SEC
	RTL

core_event_pump:
	LDA.w !core_event_req&$FFFF
	BEQ .none
	SEP #$20
	LDA $D0
	BNE .wait
	LDA $EC
	AND.b #$FE
	BNE .wait
	LDA $E4
	CMP.b #$01
	BNE .wait
	LDA $E5
	CMP.b #$01
	BNE .wait
	LDA $FF
	BNE .wait
	LDA $E8
	AND.b #$04
	BNE .wait
	REP #$20
	LDA.w !core_event_req&$FFFF
	AND.w #$0FFF
	STA.w !core_event_last&$FFFF
	STZ.w !core_event_req&$FFFF
	STZ $D4
	JSL $C1E76D
	REP #$30
	LDA.w #$0000 : TCD
	PEA $7E7E : PLB : PLB
	RTS
.wait
	REP #$20
.none
	RTS
