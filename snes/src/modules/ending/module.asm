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
!ending_sfx     = !RAM_ORBIT+$89   ; byte  last sound cue (!ESFX_*), also sent to audio_sfx
!ending_target_x = !RAM_ORBIT+$8C  ; word  globe target (planet-view target), 0 = default
!ending_target_y = !RAM_ORBIT+$8E  ; word
!ending_map0    = !RAM_ORBIT+$90   ; word  native map when the scene took the screen
!ending_live    = !RAM_ORBIT+$92   ; byte  bit0: vblank work active, bit1: restore field registers once
!ending_reason  = !RAM_ORBIT+$94   ; word  endingResult: 0 good, 1 fortress, 2 balls, 3 frieza, 4 beast
!ending_depart_x = !RAM_ORBIT+$96  ; word  departure take-off point (cue 'depart': boy x + 26)
!ending_depart_y = !RAM_ORBIT+$98  ; word
!ending_tmp     = !RAM_ORBIT+$9A   ; word  scratch (hooks)
!ending_tmp2    = !RAM_ORBIT+$9C   ; word
!ending_gokuctl = !RAM_ORBIT+$9E   ; byte  we set the goku module's SUPPRESS for a full-screen scene
!ending_reload  = !RAM_ORBIT+$9F   ; byte  a native map load ran under a full-screen scene
!ending_pulse   = !RAM_ORBIT+$A0   ; word  explosion preset: prose advance pulse (debug hook)
!ending_mute    = !RAM_ORBIT+$A2   ; byte  native music silenced for ES_MUTED (frames, 0 = not)

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
!EF_NIGHT   = $0020    ; Frieza's crisis was active: the doomed globe shows its night side
!EF_BEGUN   = $8000    ; the finale has begun (begin/lose); cues need it

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
!s_paldirty = !SW+$1A   ; byte  base colours changed: bit 0 group-0 ranges, bit 1 group-1 ranges
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
!s_palsave  = !SW+$100  ; 512 bytes: the game's palette buffer 7E:0600 while a scene owns it
!s_palout   = !SW+$300  ; 256 colours after fades (committed into 7E:0600 every frame)
!s_compr    = !SW+$500  ; 256 words: red*2 of each base colour
!s_compg    = !SW+$700  ; 256 words: green*2
!s_compb    = !SW+$900  ; 256 words: blue*2
!s_fader    = !SW+$B00  ; fade curves, group 0: 32 words red
!s_fadeg    = !SW+$B40  ; 32 words green << 5
!s_fadebt   = !SW+$B80  ; 32 words blue << 10
!s_fader2   = !SW+$BC0  ; group 1 (global and group fade combined)
!s_fadeg2   = !SW+$C00
!s_fadebt2  = !SW+$C40
!s_dq       = !SW+$C80  ; dynamic transfer queue: 16 x 8 bytes
!DQ_SIZE    = $80
!s_hdmabuf  = !SW+$D00  ; small HDMA tables (240 bytes)
!s_x        = !SW+$E00  ; second state block (256 bytes)
!s_stage    = !SW+$F00  ; 256-byte staging buffer (VRAM writes from the frame side)
!s_big      = !SW+$1000 ; 4 KiB scene buffers

; Library scratch (s_lib, SW+$E0..$FF); scenes own s_var (SW+$80..$DF).
!l_cell     = !SW+$E0
!l_qcell    = !SW+$E2
!l_quadc    = !SW+$E4
!l_quadx    = !SW+$E6
!l_quady    = !SW+$E8
!l_quadi    = !SW+$EA
!l_bits     = !SW+$EC
!l_sqn      = !SW+$EE
!l_m0       = !SW+$F0
!l_m1       = !SW+$F2
!l_m2       = !SW+$F4
!l_sqr      = !SW+$F6
!l_palc     = !SW+$F8
!l_fadew    = !SW+$DE           ; word  white mix of the current tables (s_fadekey holds black)
!s_rng      = !SW+$FA           ; word  LCG state
!s_cellvram = !SW+$FC           ; word  VRAM word address of 16x16 cell 0
!s_celltile = !SW+$FE           ; word  OAM tile number of cell 0
hi_bits_ram = !SW+$DF0             ; 16 bytes (oam_put's high-table patterns)
; Second state block (s_x).
!s_palgrp   = !s_x+$00          ; 4 bytes: fade group of each CGRAM range
!s_fadeb2   = !s_x+$04          ; word  extra black mix for group-1 ranges
!l_fadeb2   = !s_x+$06          ; word  group-1 black of the current tables
!s_vwcount  = !s_x+$08          ; word  queued single-word VRAM writes (s_stage)
!s_win      = !s_x+$0A          ; byte  window HDMA active (channel 6)
!s_band_top = !s_x+$0C          ; byte  TM band (bg3cut table): first line
!s_band_bot = !s_x+$0D          ; byte  end line (band off when top >= bot)
!s_band_bits = !s_x+$0E         ; byte  layers added to TM inside the band
!s_winptr   = !s_x+$10          ; word  window HDMA table (bank $32) for the next frame
!s_glowr    = !s_x+$14          ; word  group-1 heat glow per channel (x2), added before the fade curve
!s_glowg    = !s_x+$16
!s_glowb    = !s_x+$18
!l_glowr    = !s_x+$1A          ; glow of the current group-1 tables
!l_glowg    = !s_x+$1C
!l_glowb    = !s_x+$1E
!l_curve    = !s_x+$20          ; 32 words: fade curve scratch
!l_cy       = !s_x+$60          ; word
!s_cutptr   = !s_x+$64          ; word  TM table (s_hdmabuf half) for the next vblank
!s_palsaved = !s_x+$68          ; byte  s_palsave holds the game's palette buffer
!s_ovclaim  = !s_x+$69          ; byte  the overlay holds core's OBJ VRAM region FIELD_OBJ_A
!s_ldvis    = !s_x+$6A          ; byte  loading under a visible picture: vblank budget, the clock runs
!s_goku_dma = !s_x+$70          ; 80 bytes: queue_goku's 16 tile DMAs (address, bank, VRAM)
!s_pbmask   = !s_x+$D4          ; byte  colour groups of the palette pass in progress
!s_pbnow    = !s_x+$D5          ; byte  rebuild everything at once next time
!s_pbleft   = !s_x+$D6          ; word  colours left in the pass
!s_pbrange  = !s_x+$D8          ; word  cursor: range offset
!s_pbcol    = !s_x+$DA          ; word  cursor: colour * 2
!l_pbjump   = !s_x+$DC          ; word  scratch (palette_build)
!l_pbbudget = !s_x+$DE
!l_pbfirst  = !s_x+$E0
!l_pbend    = !s_x+$E2
!l_pbn      = !s_x+$E4
!l_pbgrp    = !s_x+$E6
!l_pbstop   = !s_x+$E8
!l_pcbase   = !s_x+$EA          ; word  pal_commit: the game's palette buffer
!s_dirsrc   = !s_x+$C0          ; word  code-bank palette of the direct range (group 2)
!s_edgeon   = !s_x+$C2          ; word  s_edge colours go over the direct range
!s_edge     = !s_x+$C4          ; 16 bytes: 4 x (colour 14, colour 15) of OBJ palettes 4-7
!l_cutnew   = !s_x+$66          ; word
!s_objlist  = !s_x+$F0          ; 16 bytes: reunion object list copy (header + Dyluck)

; Parameter blocks in s_tmp (frame side).
!o_x    = !s_tmp+0              ; oam_put / draw_quad: x (signed)
!o_y    = !s_tmp+2              ; y (signed)
!o_size = !s_tmp+4              ; 0 small, 2 large
!q_attr = !s_tmp+6              ; draw_quad attributes
!q_src  = !s_tmp+8              ; queue_add: source (long)
!q_mode = !s_tmp+11
!q_dest = !s_tmp+12
!q_size = !s_tmp+14

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
!LD_GOKU   = $07        ; Goku tiles: src = the DMA table queue_goku built (bank $32), dest = its length
!LD_M7TILES = $08       ; the flight's Mode 7 characters from the world data (size = tiles)
!LD_M7ROWS  = $09       ; the flight's Mode 7 map window from the world RLE (size = rows)
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
incsrc "audio/ids.asm"

; Second code area: the lower half of $ED (FastROM), after the art moved to
; extended data. Its code runs with PB = $ED, sets DB itself and reads its
; tables with long addressing; it reaches the main bank's routines through
; JSL entries.
!CODE_ENDING_X = $ED0000

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

; A native event id starts (A16): 6B summon, A3 dragon, A4 wish, A5 village,
; A6 complete, 14F scatter, 176 reunion, DE depart, E4 kai cue the phase as
; shenron-ending.js cue() does once the finale has begun (the bad outcome
; plays explode, escape and kai for A3-A5). Unknown ids are ignored.
ending_event:
	PHB
	PHP
	REP #$30
	PHX
	PHY
	PHA
	PEA $7E7E : PLB : PLB
	JSR cue_event
	REP #$30
	PLA
	PLY
	PLX
	PLP
	PLB
	RTL

; Event id A16 -> phase; side effects of cue(). DB = $7E. Clobbers A/X/Y.
cue_event:
	REP #$30
	STA.l !ending_tmp
	LDA.l !ending_flags
	AND.w #!EF_BEGUN
	BNE .begun
	RTS                           ; browser: cue() needs a live state
.begun
	LDX.w #$0000
.find
	LDA.l !ending_tmp
	CMP.l ending_event_ids,X
	BEQ .hit
	INX : INX : INX : INX
	CPX.w #ending_event_ids_end-ending_event_ids
	BCC .find
	RTS
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
	STA.l !ending_tmp
	SEP #$20
	STA.l !ending_request
	REP #$30
	ASL
	TAX
	JMP (cue_effect_table,X)
ending_event_ids:     ; id.w, good phase, bad phase (cue(): dragon, wish and
                      ; village become explode, escape and kai when bad)
	dw $006B : db !EP_SUMMON, !EP_SUMMON
	dw $00A3 : db !EP_DRAGON, !EP_EXPLODE
	dw $00A4 : db !EP_WISH, !EP_ESCAPE
	dw $00A5 : db !EP_VILLAGE, !EP_KAI
	dw $00A6 : db !EP_COMPLETE, !EP_COMPLETE
	dw $014F : db !EP_SCATTER, !EP_SCATTER
	dw $0176 : db !EP_REUNION, !EP_REUNION
	dw $00DE : db !EP_DEPART, !EP_DEPART
	dw $00E4 : db !EP_KAI, !EP_KAI
ending_event_ids_end:
cue_effect_table:
	dw cue_none, cue_none, cue_summon, cue_dragon, cue_wish
	dw cue_none, cue_none, cue_village, cue_depart, cue_kai
	dw cue_none, cue_none, cue_none, cue_escape, cue_none
cue_none:
	RTS
; summon: mod.options.superSaiyan = false.
cue_summon:
	LDA.w #$0000
	JSL goku_api_set_form
	RTS
cue_dragon:
	LDA.w #!ESFX_POWERBURST
	BRA cue_sfx
; wish: quest.wish() (story grants it only for a good ending).
cue_wish:
	JSL story_api_quest_wish
	REP #$30
	LDA.w #!ESFX_CHARGED
	BRA cue_sfx
cue_kai:
	LDA.w #!ESFX_TELEPORTIN
	BRA cue_sfx
cue_escape:
	LDA.w #!ESFX_TELEPORT
cue_sfx:
	JMP ending_sound

; Sound cue A16 = !ESFX_*: recorded in !ending_sfx and played through the
; audio module (audio_sfx, at the end of this frame). Main-loop code only.
; Returns M16/X16; preserves X and Y.
ending_sound:
	SEP #$20
	STA.l !ending_sfx
	REP #$30
	PHX
	AND.w #$000F
	TAX
	LDA.l ending_sound_ids-1,X
	AND.w #$00FF
	JSL audio_sfx
	REP #$30
	PLX
	RTS
ending_sound_ids:                 ; !ESFX_* 1-8 -> !AUDIO_SFX_*
	db !AUDIO_SFX_POWER_BURST, !AUDIO_SFX_CHARGED, !AUDIO_SFX_FLIGHT, !AUDIO_SFX_TELEPORT
	db !AUDIO_SFX_TELEPORT_IN, !AUDIO_SFX_REVERT, !AUDIO_SFX_FRIEZA_ORB, !AUDIO_SFX_FORTRESS_BREAK
; village: end with a living Randi, never a ghost left by the battle
; state ($E190/$E191 = 0, HP = max).
cue_village:
	SEP #$20
	LDA.b #$00
	STA.l $7EE190
	STA.l $7EE191
	REP #$20
	LDA.l $7EE184
	STA.l $7EE182
	RTS
; depart: Goku's take-off point beside the boy (x + 26, y).
cue_depart:
	LDA.l $7EE020
	CLC
	ADC.w #26
	STA.l !ending_depart_x
	LDA.l $7EE022
	STA.l !ending_depart_y
	RTS

; Begin the finale (event 42F). A (low byte) = !EF_* flags (bit 0 bad).
; Good starts the 48-frame transition, bad the doomed globe. Ignored once
; the finale has begun (shenron-ending.js begin()).
ending_begin:
	PHP
	REP #$30
	PHA
	LDA.l !ending_flags
	AND.w #!EF_BEGUN
	BNE .out
	LDA $01,S
	AND.w #$00FF
	ORA.w #!EF_BEGUN
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
.out
	REP #$30
	PLA
	PLP
	RTL

; Finale death (boss-rush-death.js). A (low byte): !EF_GOLD / !EF_ORBIT.
; Ignored once the finale has begun (shenron-ending.js lose()).
ending_lose:
	PHP
	REP #$30
	PHA
	LDA.l !ending_flags
	AND.w #!EF_BEGUN
	BNE .out
	LDA $01,S
	AND.w #!EF_GOLD|!EF_ORBIT
	ORA.w #!EF_BAD|!EF_BEGUN
	STA.l !ending_flags
	SEP #$20
	LDA.b #!EP_FATAL
	STA.l !ending_request
.out
	REP #$30
	PLA
	PLP
	RTL

; ---------------------------------------------------------------------------
; Story hooks and queries (docs/agents/snes-port/story.md): JSL with
; P = M16/X16, DB = $7E, D = 0; A = the entered event id (the map for the
; object list). The table in story/hooks.asm picks these labels up. Story's
; test builds (-DSTORY_TEST) log every hook instead.
if not(defined("STORY_TEST"))
!STORY_HOOK_ENDING_BEGIN        = ending_hook_begin
!STORY_HOOK_ENDING_CUE_DRAGON   = ending_hook_cue
!STORY_HOOK_ENDING_CUE_WISH     = ending_hook_cue
!STORY_HOOK_ENDING_CUE_VILLAGE  = ending_hook_cue
!STORY_HOOK_ENDING_CUE_COMPLETE = ending_hook_cue
!STORY_HOOK_ENDING_CUE_DEPART   = ending_hook_cue
!STORY_HOOK_ENDING_CUE_KAI      = ending_hook_cue
!STORY_HOOK_ENDING_CUE_SCATTER  = ending_hook_cue
!STORY_HOOK_ENDING_CUE_REUNION  = ending_hook_cue
!STORY_HOOK_ENDING_CUE_SUMMON   = ending_hook_cue
!STORY_HOOK_OBJECT_LIST_ENDING  = ending_hook_object_list
!STORY_QUERY_ENDING_ACTIVE      = ending_query_active
endif

; Debug scene select (docs/agents/snes-port/debug.md): the ending presets'
; SCENE waits (debug.mjs: 42F until phase 'open', or 'explode' for the
; explosion preset). Carry clear = reached.
incsrc "debug/defines.asm"
if not(defined("DEBUG_TEST"))
!DEBUG_PRESET_HOOK_GOOD_ENDING = ending_debug_open
!DEBUG_PRESET_HOOK_BAD_ENDING  = ending_debug_open
!DEBUG_PRESET_HOOK_EXPLOSION   = ending_debug_explode
endif
ending_debug_open:
	CMP.w #!DEBUG_HOOK_SCENE
	BNE .reached
	LDA.l !ending_phase
	AND.w #$00FF
	BNE .reached
	SEC
	RTL
.reached
	CLC
	RTL
; The explosion preset holds R (the browser's prose fast-forward) until the
; bad ending's A3 cue starts the explosion; on the cartridge that is a B
; pulse on a button wait ($D0 = $83) unless the window holds a choice, as
; the debug module's ADVANCE waits (core input injection).
ending_debug_explode:
	CMP.w #!DEBUG_HOOK_SCENE
	BNE .reached
	LDA.l !ending_phase
	AND.w #$00FF
	CMP.w #!EP_EXPLODE
	BEQ .reached
	SEP #$20
	LDA.l $7E00D0
	CMP.b #$83
	REP #$20
	BNE .wait
	JSL story_api_window_has_choice
	BCS .wait
	LDA.l !ending_pulse
	INC
	STA.l !ending_pulse
	AND.w #$0007
	BNE .wait
	LDA.l !core_pad_inject
	ORA.w #!PAD_B
	STA.l !core_pad_inject
.wait
	SEC
	RTL
.reached
	CLC
	RTL

; Entering 42F: endingResult() picks the outcome; Frieza's five-minute
; crisis puts the doomed globe on its night side (planet-view crisisActive).
; Presentation bits other modules set beforehand (!EF_SSJ, !EF_EIGHTH) stay.
ending_hook_begin:
	REP #$30
	LDA.l !ending_flags
	AND.w #!EF_BEGUN
	BNE .out
	JSL story_api_ending_result
	REP #$30
	STA.l !ending_reason
	LDA.l !ending_flags
	AND.w #!EF_SSJ|!EF_EIGHTH
	STA.l !ending_tmp
	LDA.l !ending_reason
	BEQ .begin
	LDA.l !ending_tmp
	ORA.w #!EF_BAD
	STA.l !ending_tmp
	LDA.w #!STORY_Q_FRIEZA_CRISIS
	JSR story_query_call
	BEQ .begin
	LDA.l !ending_tmp
	ORA.w #!EF_NIGHT
	STA.l !ending_tmp
.begin
	LDA.l !ending_tmp
	JSL ending_begin
.out
	RTL

ending_hook_cue:
	REP #$30
	JSR cue_event
	RTL

; Is the finale running (mana-mod canAttack gate: ending.active)?
ending_query_active:
	REP #$30
	LDA.l !ending_flags
	AND.w #!EF_BEGUN
	BEQ .no
	LDA.w #$0001
.no
	RTL

; Every native map load passes here (C0:C487, inside the loader's blocking
; pass): under a scene it notes that VRAM, CGRAM and the registers now hold
; the new map (check_map_change). The reunion cliff (map 180) has no NPCs;
; when it loads for the good reunion its object list gains Dyluck's record
; (native-story.js storyRead), so the native loader brings him back with
; his graphics, palette and actor slot. The list is copied to the scene
; work area (header + one record).
!ENDING_REUNION_MAP = 180
ending_hook_object_list:
	REP #$30
	PHA
	LDA.l !ending_phase
	AND.w #$00FF
	BEQ .seen
	SEP #$20
	LDA.b #$01
	STA.l !ending_reload
	REP #$20
.seen
	PLA
	CMP.w #!ENDING_REUNION_MAP
	BNE .out
	LDA.l !ending_flags
	AND.w #!EF_BEGUN|!EF_BAD
	CMP.w #!EF_BEGUN
	BNE .out
	LDA.l !ending_request
	AND.w #$00FF
	CMP.w #!EP_REUNION
	BEQ .copy
	JSR reunion_due
	BCC .out
.copy
	LDA.l !story_objlist_start
	TAX
	LDY.w #$0000
.header
	LDA.l $C80000,X
	PHX
	TYX
	STA.l (!SRAM_WORK_SCENE&$FF0000)|!s_objlist,X
	PLX
	INX : INX
	INY : INY
	CPY.w #$0008
	BCC .header
	LDX.w #$0000
.record
	LDA.l ending_dyluck_record,X
	STA.l (!SRAM_WORK_SCENE&$FF0000)|!s_objlist+8,X
	INX : INX
	CPX.w #$0008
	BCC .record
	LDA.w #!s_objlist
	STA.l !story_objlist_start
	LDA.w #!s_objlist+16
	STA.l !story_objlist_end
	SEP #$20
	LDA.b #!SRAM_WORK_SCENE>>16
	STA.l !story_objlist_bank
	REP #$20
.out
	RTL
ending_dyluck_record:
	db $4E,$8F,$8B,$88,$40,$AC,$00,$00

; Carry set when a native map load now ends the flight: the script's next
; door after the scatter's 480 frames is the reunion's cliff (3FF, after
; cue 176) or Potos (08E); the flight never spans maps.
reunion_due:
	LDA.l !ending_phase
	AND.w #$00FF
	CMP.w #!EP_REUNION
	BEQ .yes
	CMP.w #!EP_SCATTER
	BEQ .yes
	CLC
	RTS
.yes
	SEC
	RTS

; Query id A16 through story's table (same contract as story_query):
; A16 = value, Z set when 0. DB = $7E.
story_query_call:
	PHX
	AND.w #$007F
	STA.l !ending_tmp2
	ASL
	CLC
	ADC.l !ending_tmp2
	TAX
	PHK
	PER .back-1
	SEP #$20
	LDA.l story_query_table+2,X
	PHA
	REP #$20
	LDA.l story_query_table,X
	DEC
	PHA
	RTL
.back
	REP #$30
	PLX
	AND.w #$00FF
	RTS

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
	JML ending_music_sync
.run
	INC.w !s_frame
	; A native map load since the scene took the screen: the loader has
	; already set every PPU register for the new map (the overlay follows
	; the boy; a full-screen phase loads its stage again).
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
	SEP #$20
	LDA.w !s_ldvis
	BEQ .post
	REP #$30
	LDA.l !ending_age             ; a visible load keeps the browser's clock
	INC
	STA.l !ending_age
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
	JSR cut_build
	JSR palette_build
	JSR pal_commit
	JSR brightness_apply
	JSR suppress_native
	JSR oam_finish
	JSR goku_quiet
	JSR status_loading
.out
	REP #$30
	PLB
	JML ending_music_sync

; A full-screen scene stays up over native map loads, as the browser's
; picture does. A door changes $DC at once and fades the field (and the
; scene) out; the loader then rewrites VRAM, CGRAM and the registers in one
; blocking pass with no frame or vblank hook (ending_hook_object_list notes
; it). The phase then loads its stage again and its clock goes on; the
; reunion's load gives the field the screen back. The overlay follows the
; new map ($DC) instead.
check_map_change:
	REP #$30
	SEP #$20
	LDA.l !ending_reload
	STA.w !s_tmp
	LDA.b #$00
	STA.l !ending_reload
	LDA.w !s_family
	CMP.b #!FAM_NONE
	BEQ .keep
	CMP.b #!FAM_OVERLAY
	BNE .loads
	REP #$20
	LDA.w !N_MAP
	CMP.l !ending_map0
	BEQ .keep
	JMP overlay_map_change
.loads
	LDA.w !s_tmp
	BEQ .keep
	REP #$20
	JSR reunion_due
	BCC .stage
	JMP release_quiet
.stage
	SEP #$20
	LDA.w !s_fullscreen
	BEQ .keep                     ; black: the picture under it is native
	REP #$20
	LDA.l !ending_age
	PHA
	LDA.l !ending_phase
	AND.w #$00FF
	PHA
	JSR release_quiet
	REP #$30
	PLA
	JSR start_phase
	REP #$30
	PLA
	STA.l !ending_age
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
	LDA.l !ending_status
	AND.b #~(!ES_NATIVEBOY|!ES_AIRBORNE|!ES_CHARGING|!ES_MUTED)
	STA.l !ending_status
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
	STA.w !s_win
	STA.w !s_band_top
	STA.w !s_band_bot
	STA.w !s_palsaved
	STA.w !s_ovclaim
	STA.w !s_ldvis
	REP #$30
	STZ.w !s_vwcount
	LDA.w #!s_hdmabuf
	STA.w !s_cutptr
	STZ.w !s_dqhead
	STZ.w !s_dqtail
	STZ.w !s_cur+6
	STZ.w !s_curoff
	STZ.w !s_fadew
	STZ.w !s_fadeb
	STZ.w !s_fadeb2
	STZ.w !s_glowr
	STZ.w !s_glowg
	STZ.w !s_glowb
	STZ.w !s_edgeon
	STZ.w !s_pbleft
	STZ.w !s_pbrange
	STZ.w !s_pbcol
	SEP #$20
	STZ.w !s_pbmask
	STZ.w !s_pbnow
	REP #$20
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
	dw frame_scatter, frame_reunion, frame_village, frame_depart, frame_kai
	dw frame_kai, frame_doomed, frame_explode, frame_escape, frame_fatal

start_none:
frame_none:
	RTS

; The reunion is the native cliff scene (map 180, Dyluck from
; ending_hook_object_list): the field gets the screen back. After a
; full-screen scene the field's VRAM holds our stage, so the picture stays
; black until the reunion's map load (door 3FF right after the cue;
; check_map_change), at most 300 frames.
start_reunion:
	SEP #$20
	LDA.w !s_fullscreen
	PHA
	JSR release_screen
	SEP #$20
	PLA
	BEQ .out
	LDA.b #!EP_REUNION
	STA.l !ending_phase
	LDA.b #!FAM_BLACK
	STA.w !s_family
	REP #$20
	STZ.w !s_ebright
.out
	REP #$30
	RTS
frame_reunion:
	LDA.l !ending_age
	CMP.w #300
	BCC .out
	JMP release_screen
.out
	RTS

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
	LDA.w !s_palsaved
	BEQ .noPal
	LDA.b #$00
	STA.w !s_palsaved
	LDA.b #$01
	JSR pal_native            ; the game's palette back
.noPal
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
	STA.w !s_palsaved         ; the map load rebuilt the game's palette
	STA.l !ending_live
	JSR release_common
	SEP #$20
	LDA.b #$00
	STA.l !ending_phase
	REP #$30
	RTS

release_common:
	JSR end_overlay
	SEP #$20
	LDA.b #$00
	STA.w !s_loading
	STA.w !s_ldvis
	STA.w !s_palcount
	STA.w !s_fullscreen
	LDA.b #!FAM_NONE
	STA.w !s_family
	LDA.l !ending_status
	AND.b #!ES_COMPLETE|!ES_DEFEATED
	STA.l !ending_status
	JSR goku_quiet            ; after the status: Randi is no longer kept
	SEP #$20
	; Our HDMA channels off.
	LDA.w !s_hdma
	EOR.b #$FF
	AND.w !N_HDMA
	STA.w !N_HDMA
	LDA.b #$00
	STA.w !s_hdma
	STA.w !s_win
	REP #$30
	LDA.w #$00FF
	STA.w !s_ebright
	LDA.w !s_dqtail
	STA.w !s_dqhead
	STZ.w !s_vwcount
	RTS

; ---------------------------------------------------------------------------
; Scene setup helpers.

; Take the whole picture: A (8-bit) = family. Our layers stay off until the
; load script (set_script) and the dynamic queue have been uploaded.
begin_fullscreen:
	SEP #$20
	PHA
	LDA.w !s_palsaved
	BNE .saved
	LDA.b #$01
	STA.w !s_palsaved
	LDA.b #$00
	JSR pal_native            ; keep the game's palette buffer
.saved
	SEP #$20
	PLA
	STA.w !s_family
	LDA.b #$01
	STA.l !ending_live
	STA.w !s_loading
	STA.w !s_regson
	STA.w !s_fullscreen
	LDA.b #$00
	STA.w !s_ldvis
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
	STA.w !s_win
	STA.w !s_band_top
	STA.w !s_band_bot
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
	STA.w !s_fadeb2
	STA.w !s_glowr
	STA.w !s_glowg
	STA.w !s_glowb
	STA.w !s_edgeon
	STA.w !s_pbleft
	STA.w !s_pbrange
	STA.w !s_pbcol
	SEP #$20
	STA.w !s_pbmask
	REP #$20
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

; While a full-screen scene hides the field, the goku module keeps the
; native boy (GOKU_CTL_SUPPRESS): his cells, palette and portrait work
; would cost the frame ~60 lines for a hidden sprite. The village and the
; departure keep Randi native the same way (shenron-ending nativeBoy).
; Released with the screen; never clears a SUPPRESS another module set.
goku_quiet:
	SEP #$20
	LDA.w !s_fullscreen
	BNE .quiet
	LDA.l !ending_status
	AND.b #!ES_NATIVEBOY
	BEQ .release
.quiet
	LDA.l !ending_gokuctl
	BNE .done
	LDA.l $7E0000|!goku_ctl
	BIT.b #!GOKU_CTL_SUPPRESS
	BNE .done                 ; someone else's
	ORA.b #!GOKU_CTL_SUPPRESS
	STA.l $7E0000|!goku_ctl
	LDA.b #$01
	STA.l !ending_gokuctl
	BRA .done
.release
	LDA.l !ending_gokuctl
	BEQ .done
	LDA.l $7E0000|!goku_ctl
	AND.b #~!GOKU_CTL_SUPPRESS
	STA.l $7E0000|!goku_ctl
	LDA.b #$00
	STA.l !ending_gokuctl
.done
	REP #$30
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
	LDA.w !s_family
	CMP.b #!FAM_FLIGHT
	REP #$30
	BNE .oam
	JSR flight_loading
.oam
	JSR oam_begin
	RTS

incsrc "lib.asm"
incsrc "kai.asm"
incsrc "space.asm"
incsrc "fatal.asm"
incsrc "village.asm"
incsrc "vista.asm"
incsrc "flight.asm"
incsrc "transition.asm"

; Generated palettes and small tables.
incsrc "ending/ending_tables.asm"

ending_code_end:
assert ending_code_end <= !CODE_ENDING+$8000, "ending code bank overflow"
pullpc

pushpc
org !CODE_ENDING_X
incsrc "sound.asm"
ending_x_end:
assert ending_x_end <= !CODE_ENDING_X+$8000, "ending second code area overflow"
pullpc
