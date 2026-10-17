; ENDING module: finale cinematics and planet views.
; Browser sources: engine/shenron-ending.js, wish-flight.js, ending-departure.js,
; kai-planet.js, planet-view.js, planet-fragments.js, boss-rush-death.js.
; Design, budgets and the story-module contract: docs/agents/snes-port/ending.md.
;
; Scenes run inside the native field loop: ending_frame after the game's
; logic, ending_nmi in vblank after the game's uploads. Native dialogue on
; BG3, the event interpreter and its waits keep working. A full-screen scene
; owns BG1, BG2, OBJ (relocated into VRAM it owns), the CGRAM ranges it
; declares, and VRAM $0000-$3FFF/$5000-$57FF (native BG streaming and tile
; animation requests are dropped meanwhile). BG3 is never touched.
;
; Internal code runs with DB = $32 (SRAM work bank: low WRAM mirror at
; $0000-$1FFF, I/O at $2100-$43FF, scene work area at $6000-$7FFF are all
; absolute). Every immediate carries an explicit width.

; ---------------------------------------------------------------------------
; Public WRAM block (!RAM_ORBIT+$80..$FF, long addresses).
!ending_request = !RAM_ORBIT+$80   ; byte  phase requested (0 none, $FF stop), applied next frame
!ending_phase   = !RAM_ORBIT+$81   ; byte  current phase (!EP_*), 0 = idle
!ending_age     = !RAM_ORBIT+$82   ; word  frames in the current phase (held while loading)
!ending_flags   = !RAM_ORBIT+$84   ; word  !EF_* outcome/presentation flags
!ending_done    = !RAM_ORBIT+$86   ; word  bit n set once phase n's timeline has finished
!ending_status  = !RAM_ORBIT+$88   ; byte  !ES_* live status for other modules
!ending_sfx     = !RAM_ORBIT+$89   ; byte  last sound cue (!ESFX_*); the audio module clears it
!ending_target_x = !RAM_ORBIT+$8C  ; word  globe target (planet-view target), 0 = default
!ending_target_y = !RAM_ORBIT+$8E  ; word
!ending_map0    = !RAM_ORBIT+$90   ; word  native map when the scene took the screen
!ending_live    = !RAM_ORBIT+$92   ; byte  bit0: vblank work active, bit1: restore field registers once

; Phases (match the browser's state.phase).
!EP_TRANSITION = $01   ; good: whole-screen fade to black over 48 frames, then black
!EP_SUMMON     = $02   ; Shenron vista, Balls, fallout (event 6B)
!EP_DRAGON     = $03   ; Shenron rises, parallax reveal (A3)
!EP_WISH       = $04   ; Tree restored with a glow (A4)
!EP_SCATTER    = $05   ; night ascent, held apex, Balls scatter (14F, 480 frames)
!EP_REUNION    = $06   ; native cliff scene: screen released (176)
!EP_VILLAGE    = $07   ; Potos: extra Goku beside the native Randi (A5)
!EP_DEPART     = $08   ; power-up, launch, whiteout, distant planet, fade (DE, 300 frames)
!EP_KAI        = $09   ; King Kai's planet (E4 / A5 bad)
!EP_COMPLETE   = $0A   ; end card on King Kai's planet (A6)
!EP_DOOMED     = $0B   ; bad: night globe under dialogue (42F)
!EP_EXPLODE    = $0C   ; bad: cracks, flash and fragments (A3 bad)
!EP_ESCAPE     = $0D   ; bad: fragments fade, Goku teleports out (A4 bad)
!EP_FATAL      = $0E   ; finale death -> black -> planet explodes -> GAME OVER
!EP_MAX        = $0E

!EF_BAD     = $0001    ; bad outcome (doomed planet)
!EF_EIGHTH  = $0002    ; Dryad's eighth Ball beside the seven
!EF_SSJ     = $0004    ; Goku stays Super Saiyan (bad ending: permanent form)
!EF_GOLD    = $0008    ; death started in Super Saiyan (revert cue at 18)
!EF_ORBIT   = $0010    ; death in orbit: the orbit module draws until black

!ES_ACTIVE    = $01    ; a scene owns the picture
!ES_NATIVEBOY = $02    ; the native boy actor is Randi: do not substitute Goku
!ES_MUTED     = $04    ; native music should be silent
!ES_AIRBORNE  = $08    ; Goku is airborne in the scene
!ES_CHARGING  = $10    ; departure power-up (charge sound/aura)
!ES_COMPLETE  = $20    ; end card / game over reached
!ES_DEFEATED  = $40    ; fatal sequence running
!ES_LOADING   = $80    ; scene art is being uploaded (picture held black)

!ESFX_POWERBURST = $01
!ESFX_CHARGED    = $02
!ESFX_FLIGHT     = $03
!ESFX_TELEPORT   = $04
!ESFX_TELEPORTIN = $05
!ESFX_REVERT     = $06
!ESFX_FRIEZAORB  = $07
!ESFX_FORTRESS   = $08

; ---------------------------------------------------------------------------
; Scene work area: !SRAM_WORK_SCENE ($32:6000-$7FFF), absolute with DB = $32.
!SW = $6000
!s_family   = !SW+$00   ; byte  !FAM_*
!s_loading  = !SW+$01   ; byte  nonzero while the load script runs
!s_ldptr    = !SW+$02   ; long  next script entry
!s_cur      = !SW+$06   ; 8 bytes current transfer: src.l mode dest.w size.w
!s_curoff   = !SW+$0E   ; word  bytes done of s_cur
!s_dqhead   = !SW+$10   ; word  dynamic queue read offset
!s_dqtail   = !SW+$12   ; word  dynamic queue write offset
!s_fadew    = !SW+$14   ; word  white mix 0..256
!s_fadeb    = !SW+$16   ; word  black mix 0..256
!s_fadekey  = !SW+$18   ; word  black mix of the current fade tables ($FFFF: rebuild)
!s_paldirty = !SW+$1A   ; byte  base palette changed
!s_regson   = !SW+$1B   ; byte  1: NMI writes the shadow block, 2: restore native once
!s_oamslot  = !SW+$1C   ; word  next OAM byte offset (full-screen families)
!s_budget   = !SW+$1E   ; word  NMI transfer budget left
!s_tmp      = !SW+$20   ; 16 bytes scratch (frame code)
!s_nmitmp   = !SW+$30   ; 16 bytes scratch (NMI code)
!s_bgmode   = !SW+$40   ; PPU shadow block
!s_bg1sc    = !SW+$41
!s_bg2sc    = !SW+$42
!s_bg12nba  = !SW+$43
!s_objsel   = !SW+$44
!s_tm       = !SW+$45
!s_ts       = !SW+$46
!s_cgwsel   = !SW+$47
!s_cgadsub  = !SW+$48
!s_w12sel   = !SW+$49
!s_wobjsel  = !SW+$4A
!s_tmw      = !SW+$4B
!s_tsw      = !SW+$4C
!s_wbglog   = !SW+$4D
!s_wobjlog  = !SW+$4E
!s_m7sel    = !SW+$4F
!s_coldr    = !SW+$50   ; COLDATA bytes with channel bits
!s_coldg    = !SW+$51
!s_coldb    = !SW+$52
!s_hdma     = !SW+$53   ; HDMA channel bits we own (ORed into $2C)
!s_wh0      = !SW+$54   ; window positions
!s_wh1      = !SW+$55
!s_wh2      = !SW+$56
!s_wh3      = !SW+$57
!s_bg1h     = !SW+$58   ; words
!s_bg1v     = !SW+$5A
!s_bg2h     = !SW+$5C
!s_bg2v     = !SW+$5E
!s_m7a      = !SW+$60
!s_m7b      = !SW+$62
!s_m7c      = !SW+$64
!s_m7d      = !SW+$66
!s_m7x      = !SW+$68
!s_m7y      = !SW+$6A
!s_mode7    = !SW+$6C   ; byte  write Mode 7 registers
!s_palcount = !SW+$6D   ; byte  number of CGRAM ranges
!s_palrange = !SW+$6E   ; 4 x (start colour byte, count byte; count 0 = 256)
!s_ebright  = !SW+$76   ; word  brightness ceiling 0..15 ($FF: native)
!s_frame    = !SW+$78   ; word  scene frame counter
!s_prevphase = !SW+$7A  ; byte
!s_fullscreen = !SW+$7B ; byte  family owns the whole picture
!s_bg3cut   = !SW+$7C   ; byte  BG3 (dialogue/HUD) hidden from line 170 down (HDMA ch5 on TM)
!s_tmcut    = !SW+$7D   ; byte  TM value from line 170 down
!s_var      = !SW+$80   ; $5E bytes per-scene variables (SW+$80..$DD)
!s_palbase  = !SW+$100  ; 256 colours (scene base)
!s_palout   = !SW+$300  ; 256 colours after fades
!s_compr    = !SW+$500  ; 256 words: red*2 of each base colour
!s_compg    = !SW+$700  ; 256 words: green*2
!s_compb    = !SW+$900  ; 256 words: blue*2
!s_fader    = !SW+$B00  ; 32 words: faded red
!s_fadeg    = !SW+$B40  ; 32 words: faded green << 5
!s_fadebt   = !SW+$B80  ; 32 words: faded blue << 10
!s_dq       = !SW+$C00  ; dynamic transfer queue: 16 x 8 bytes
!DQ_SIZE    = $80
!s_hdmabuf  = !SW+$C80  ; HDMA tables (352 bytes, to $DDF)
!s_big      = !SW+$1000 ; 4 KiB scene buffers

!FAM_NONE    = $00
!FAM_BLACK   = $01      ; brightness ceiling only (transition hold)
!FAM_OVERLAY = $02      ; native picture visible, our sprites in front
!FAM_KAI     = $03
!FAM_SPACE   = $04
!FAM_VISTA   = $05
!FAM_FLIGHT  = $06

; Load scripts: src.l (3) mode (1) dest.w (2) size.w (2); mode $FF ends.
!LD_VRAM   = $00        ; linear VRAM words
!LD_M7MAP  = $01        ; Mode 7 map (low bytes)
!LD_M7CHR  = $02        ; Mode 7 characters (high bytes)
!LD_CELL32 = $03        ; 32x32 OBJ cell: 4 rows of 128 bytes, VRAM stride $100 words
!LD_CELL16 = $04        ; 16x16 OBJ cell: 2 rows of 64 bytes, stride $100 words
!LD_CGRAM  = $05        ; CGRAM bytes (dest = colour index)
!LD_FILL   = $06        ; VRAM fill with the byte at src (both bytes of each word)
!LD_GOKU   = $07        ; Goku cell (src.w = goku module cell id) into four scene 16x16 cells
!LD_END    = $FF

macro ld(src, mode, dest, size)
	dl <src>
	db <mode>
	dw <dest>
	dw <size>
endmacro
macro ld_end()
	dl $000000
	db !LD_END
	dw $0000,$0000
endmacro

; Native WRAM (bank $7E; with DB = $32 the low 8 KiB are absolute).
!N_OAM      = $0800     ; OAM low table, DMAed by the field NMI
!N_OAMHI    = $0A00     ; OAM high table
!N_OAMEND   = $0120     ; native: next frame hides slots up to here
!N_TM       = $0021     ; TM shadow (map loader)
!N_TS       = $0022
!N_CGADSUB  = $0023
!N_MOSAIC   = $0020
!N_OBJSEL   = $0091
!N_HDMA     = $002C     ; HDMA enable shadow
!N_BRIGHT   = $00E6     ; INIDISP shadow written at the end of the field NMI
!N_MAP      = $00DC     ; current map id
!N_E8       = $00E8     ; bit 0: BG3 map at $5C00
!N_ROWREQ   = $002E     ; BG row streaming requests (C0:C692)
!N_COLREQ   = $002F     ; BG column streaming requests
!N_ANIM1    = $0090     ; bit 7: animated tile upload (C0:C306)
!N_ANIM2    = $009A     ; bit 7: animated tile table upload (C0:C339)

; Generated art (data banks) and its size/count defines.
incsrc "ending/ending_data.asm"

pushpc
org !CODE_ENDING
ending_code_start:

; ===========================================================================
; Public API (JSL, any M/X; registers preserved except where noted)
; ===========================================================================

; Request phase A (low byte), applied at the next field frame.
ending_cue:
	PHP
	SEP #$20
	STA.l !ending_request
	PLP
	RTL

; Map a native event id (A, 16-bit) to a phase as native-story.js does:
; 6B summon, A3 dragon/explode, A4 wish/escape, A5 village/kai, A6 complete,
; 14F scatter, 176 reunion, DE depart, E4 kai. Unknown ids are ignored.
ending_event:
	PHP
	REP #$30
	PHX
	PHA
	LDX.w #$0000
.find
	LDA $01,S
	CMP.l ending_event_ids,X
	BEQ .hit
	INX : INX : INX : INX
	CPX.w #ending_event_ids_end-ending_event_ids
	BCC .find
	BRA .out
.hit
	LDA.l !ending_flags
	AND.w #!EF_BAD
	BEQ .good
	LDA.l ending_event_ids+3,X
	BRA .set
.good
	LDA.l ending_event_ids+2,X
.set
	AND.w #$00FF
	BEQ .out
	SEP #$20
	STA.l !ending_request
.out
	REP #$30
	PLA
	PLX
	PLP
	RTL
ending_event_ids:     ; id.w, good phase, bad phase
	dw $006B : db !EP_SUMMON, $00
	dw $00A3 : db !EP_DRAGON, !EP_EXPLODE
	dw $00A4 : db !EP_WISH, !EP_ESCAPE
	dw $00A5 : db !EP_VILLAGE, !EP_KAI
	dw $00A6 : db !EP_COMPLETE, !EP_COMPLETE
	dw $014F : db !EP_SCATTER, $00
	dw $0176 : db !EP_REUNION, $00
	dw $00DE : db !EP_DEPART, $00
	dw $00E4 : db !EP_KAI, !EP_KAI
ending_event_ids_end:

; Begin the finale (event 42F). A (low byte) = !EF_* flags (bit 0 bad).
; Good starts the 48-frame transition, bad the doomed globe.
ending_begin:
	PHP
	REP #$30
	PHA
	AND.w #$00FF
	STA.l !ending_flags
	LDA.w #$0000
	STA.l !ending_done
	SEP #$20
	LDA.l !ending_flags
	AND.b #!EF_BAD
	BEQ .good
	LDA.b #!EP_DOOMED
	BRA .go
.good
	LDA.b #!EP_TRANSITION
.go
	STA.l !ending_request
	REP #$30
	PLA
	PLP
	RTL

; Finale death (boss-rush-death.js). A (low byte): !EF_GOLD / !EF_ORBIT.
ending_lose:
	PHP
	REP #$30
	PHA
	AND.w #!EF_GOLD|!EF_ORBIT
	ORA.w #!EF_BAD
	STA.l !ending_flags
	SEP #$20
	LDA.b #!EP_FATAL
	STA.l !ending_request
	REP #$30
	PLA
	PLP
	RTL

; Release the picture and go idle.
ending_stop:
	PHP
	SEP #$20
	PHA
	LDA.b #$FF
	STA.l !ending_request
	PLA
	PLP
	RTL

; ===========================================================================
; Frame hook (field frame, after the game's logic and OAM build).
; P = M16/X16, DB = $7E, D = 0.
; ===========================================================================
ending_frame:
	PHB
	PEA $3232 : PLB : PLB
	REP #$30
	LDA.l !ending_request
	AND.w #$00FF
	BEQ .noreq
	PHA
	SEP #$20
	LDA.b #$00
	STA.l !ending_request
	REP #$30
	PLA
	JSR start_phase
.noreq
	REP #$30
	LDA.l !ending_phase
	AND.w #$00FF
	BNE .run
	PLB
	RTL
.run
	INC.w !s_frame
	; A native map load since the scene took the screen ends it: the
	; loader has already set every PPU register for the new map.
	JSR check_map_change
	REP #$30
	LDA.l !ending_phase
	AND.w #$00FF
	BEQ .out
	SEP #$20
	LDA.w !s_loading
	BEQ .live
	REP #$30
	JSR loading_frame
	BRA .post
.live
	REP #$30
	LDA.l !ending_phase
	AND.w #$00FF
	ASL
	TAX
	JSR (phase_frame_table,X)
	REP #$30
	LDA.l !ending_age
	INC
	STA.l !ending_age
.post
	REP #$30
	JSR palette_build
	JSR brightness_apply
	JSR suppress_native
	JSR oam_finish
	JSR status_loading
.out
	REP #$30
	PLB
	RTL

check_map_change:
	REP #$30
	SEP #$20
	LDA.w !s_family
	CMP.b #!FAM_BLACK
	BEQ .keep
	CMP.b #!FAM_NONE
	BEQ .keep
	REP #$20
	LDA.w !N_MAP
	CMP.l !ending_map0
	BEQ .keep
	JSR release_quiet
.keep
	REP #$30
	RTS

status_loading:
	SEP #$20
	LDA.w !s_loading
	BEQ .clear
	LDA.l !ending_status
	ORA.b #!ES_LOADING
	BRA .store
.clear
	LDA.l !ending_status
	AND.b #~!ES_LOADING
.store
	STA.l !ending_status
	REP #$30
	RTS

; Start phase A (16-bit; $FF = stop).
start_phase:
	REP #$30
	CMP.w #$00FF
	BNE .phase
	JMP release_screen
.phase
	CMP.w #!EP_MAX+1
	BCC .valid
	RTS
.valid
	PHA
	; Nothing live: the shared SRAM work area holds another module's data.
	SEP #$20
	LDA.l !ending_live
	AND.b #$01
	BNE .keep
	JSR scene_init
.keep
	SEP #$20
	LDA.l !ending_phase
	STA.w !s_prevphase
	REP #$30
	PLA
	SEP #$20
	STA.l !ending_phase
	REP #$30
	LDA.w #$0000
	STA.l !ending_age
	LDA.l !ending_phase
	AND.w #$00FF
	ASL
	TAX
	JMP (phase_start_table,X)

; Reset the scene work area (SRAM is shared and not cleared at boot).
scene_init:
	SEP #$20
	LDA.b #$00
	STA.w !s_family
	STA.w !s_loading
	STA.w !s_regson
	STA.w !s_fullscreen
	STA.w !s_palcount
	STA.w !s_mode7
	STA.w !s_hdma
	STA.w !s_paldirty
	STA.w !s_ldptr+2
	STA.w !s_bg3cut
	REP #$30
	STZ.w !s_dqhead
	STZ.w !s_dqtail
	STZ.w !s_cur+6
	STZ.w !s_curoff
	STZ.w !s_fadew
	STZ.w !s_fadeb
	STZ.w !s_frame
	LDA.w #$FFFF
	STA.w !s_fadekey
	LDA.w #$00FF
	STA.w !s_ebright
	RTS

; Mark the current phase's timeline as finished.
mark_done:
	PHP
	REP #$30
	LDA.l !ending_phase
	AND.w #$000F
	ASL
	TAX
	LDA.l bit_table,X
	ORA.l !ending_done
	STA.l !ending_done
	PLP
	RTS
bit_table:
	dw $0001,$0002,$0004,$0008,$0010,$0020,$0040,$0080
	dw $0100,$0200,$0400,$0800,$1000,$2000,$4000,$8000

phase_start_table:
	dw start_none, start_transition, start_vista, start_vista, start_vista
	dw start_scatter, start_reunion, start_village, start_depart, start_kai
	dw start_complete, start_space, start_space, start_space, start_fatal
phase_frame_table:
	dw frame_none, frame_transition, frame_summon, frame_dragon, frame_wish
	dw frame_scatter, frame_none, frame_village, frame_depart, frame_kai
	dw frame_kai, frame_doomed, frame_explode, frame_escape, frame_fatal

start_none:
frame_none:
	RTS

; Not yet ported phases fall back to a held black picture so the event
; script still runs; replaced as each scene lands.
start_reunion:
	JMP release_screen

; ---------------------------------------------------------------------------
; Releasing the picture.

; Explicit stop on the same map: put the field's own register values back
; (from the map loader's shadows) once, in the next vblank.
release_screen:
	REP #$30
	SEP #$20
	LDA.w !s_family
	CMP.b #!FAM_NONE
	BEQ .idle
	CMP.b #!FAM_BLACK
	BEQ .quiet
	CMP.b #!FAM_OVERLAY
	BEQ .quiet
	LDA.b #$02                ; restore the field registers next vblank
	BRA .common
.quiet
	LDA.b #$00
.common
	STA.l !ending_live
	LDA.b #$00
	STA.w !s_regson
	JSR release_common
.idle
	SEP #$20
	LDA.b #$00
	STA.l !ending_phase
	REP #$30
	RTS

; After a native map load: nothing to restore.
release_quiet:
	SEP #$20
	LDA.b #$00
	STA.w !s_regson
	STA.l !ending_live
	JSR release_common
	SEP #$20
	LDA.b #$00
	STA.l !ending_phase
	REP #$30
	RTS

release_common:
	SEP #$20
	LDA.b #$00
	STA.w !s_loading
	STA.w !s_palcount
	STA.w !s_fullscreen
	LDA.b #!FAM_NONE
	STA.w !s_family
	LDA.l !ending_status
	AND.b #!ES_COMPLETE|!ES_DEFEATED
	STA.l !ending_status
	; Our HDMA channels off.
	LDA.w !s_hdma
	EOR.b #$FF
	AND.w !N_HDMA
	STA.w !N_HDMA
	LDA.b #$00
	STA.w !s_hdma
	REP #$30
	LDA.w #$00FF
	STA.w !s_ebright
	LDA.w !s_dqtail
	STA.w !s_dqhead
	RTS

; ---------------------------------------------------------------------------
; Scene setup helpers.

; Take the whole picture: A (8-bit) = family. Our layers stay off until the
; load script (set_script) and the dynamic queue have been uploaded.
begin_fullscreen:
	SEP #$20
	STA.w !s_family
	LDA.b #$01
	STA.l !ending_live
	STA.w !s_loading
	STA.w !s_regson
	STA.w !s_fullscreen
	LDA.b #$00
	STA.w !s_tm
	STA.w !s_ts
	STA.w !s_cgadsub
	STA.w !s_w12sel
	STA.w !s_wobjsel
	STA.w !s_tmw
	STA.w !s_tsw
	STA.w !s_wbglog
	STA.w !s_wobjlog
	STA.w !s_m7sel
	STA.w !s_mode7
	STA.w !s_palcount
	STA.w !s_bg3cut
	STA.w !s_wh0
	STA.w !s_wh2
	LDA.b #$FF
	STA.w !s_wh1
	STA.w !s_wh3
	LDA.b #$02
	STA.w !s_cgwsel
	LDA.b #$20 : STA.w !s_coldr
	LDA.b #$40 : STA.w !s_coldg
	LDA.b #$80 : STA.w !s_coldb
	LDA.b #$09
	STA.w !s_bgmode
	; Our HDMA channels (if a previous scene had some) off.
	LDA.w !s_hdma
	EOR.b #$FF
	AND.w !N_HDMA
	STA.w !N_HDMA
	LDA.b #$00
	STA.w !s_hdma
	LDA.l !ending_status
	ORA.b #!ES_ACTIVE
	STA.l !ending_status
	REP #$30
	LDA.w #$0000
	STA.w !s_curoff
	STA.w !s_cur+6
	STA.w !s_bg1h
	STA.w !s_bg2h
	LDA.w #$FFFF              ; screen line 0 shows picture row 0
	STA.w !s_bg1v
	STA.w !s_bg2v
	LDA.w #$0100              ; black until loaded
	STA.w !s_fadeb
	LDA.w #$0000
	STA.w !s_fadew
	LDA.w #$FFFF
	STA.w !s_fadekey
	LDA.w #$00FF
	STA.w !s_ebright
	LDA.w !s_dqtail
	STA.w !s_dqhead
	LDA.l $7E0000+!N_MAP
	STA.l !ending_map0
	; Backdrop colour 0 black.
	LDA.w #$0000
	LDX.w #$0000
	JSR pal_store
	LDA.w #$0000
	LDX.w #$0001
	JSR pal_range
	RTS

; Set the load script: A = address in the code bank.
set_script:
	REP #$30
	STA.w !s_ldptr
	SEP #$20
	LDA.b #(!CODE_ENDING>>16)
	STA.w !s_ldptr+2
	LDA.b #$01
	STA.w !s_loading
	REP #$30
	LDA.w #$0000
	STA.w !s_curoff
	STA.w !s_cur+6
	RTS

; While loading, our layers are off (TM = 0: the black backdrop shows).
loading_frame:
	SEP #$20
	LDA.b #$00
	STA.w !s_tm
	REP #$30
	JSR oam_begin
	RTS

incsrc "lib.asm"
incsrc "kai.asm"
incsrc "stubs.asm"

; Generated palettes and small tables.
incsrc "ending/ending_tables.asm"

ending_code_end:
assert ending_code_end <= !CODE_ENDING+$8000, "ending code bank overflow"
pullpc
