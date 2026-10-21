; ORBIT module: the second surge's collateral cinematics, the space fight
; above the globe and the beam-struggle finale (engine/frieza-orbit*.js,
; orbit-*.js, frieza-cinematic.js, aerial-melee.js, frieza-finale*.js).
; Spoilers and design: docs/agents/snes-port/orbit.md.
;
; Code $A7:8000 (bank E7 upper half), tables $E7:0000-7FFF, art in F6/F7/
; FA-upper/FB. WRAM !RAM_ORBIT+$00..$7F (hot flags other modules read);
; everything else lives in the shared scene work area !SRAM_WORK_SCENE
; ($32:6000-7FFF), addressed absolutely with DB = $32 (I/O and low WRAM
; stay visible in that bank).

incsrc "orbit/defines.asm"
incsrc "orbit-sprites/sprites.asm"
incsrc "orbit-fx/defines.asm"
incsrc "orbit-montage/defines.asm"
incsrc "orbit-scenery/scenery.asm"
incsrc "debug/defines.asm"
incsrc "audio/ids.asm"

; ---------------------------------------------------------------------------
; WRAM (bank $7E, long addressing).
!orbit_state   = !RAM_ORBIT+$00   ; byte: !OS_* scene state
!orbit_cmd     = !RAM_ORBIT+$01   ; byte: request (!OC_*), consumed next field frame
!orbit_flags   = !RAM_ORBIT+$02   ; byte: !OF_* status other modules may read
!orbit_load    = !RAM_ORBIT+$03   ; byte: load step (NMI side)
!orbit_frame   = !RAM_ORBIT+$04   ; word: frames since the scene started
!orbit_nmi_buf = !RAM_ORBIT+$06   ; word: HDMA buffer offset the NMI programs (0 / !OB_SIZE)
!orbit_ready   = !RAM_ORBIT+$08   ; byte: a table set is complete for the NMI
!orbit_test    = !RAM_ORBIT+$09   ; byte: test scene options (!OT_*)
!orbit_vline   = !RAM_ORBIT+$0A   ; word: scanline at which the last NMI hook ended (tests)
!orbit_fline   = !RAM_ORBIT+$0C   ; word: scanline at which the last frame hook ended (tests)
!orbit_arg     = !RAM_ORBIT+$0E   ; word: command argument
; orbit_api_enter inputs (written by the caller, frieza: its boss state).
!orbit_in_hp    = !RAM_ORBIT+$10  ; Frieza's HP
!orbit_in_tx    = !RAM_ORBIT+$12  ; the strike target ($128): the globe's longitude
!orbit_in_ty    = !RAM_ORBIT+$14  ; ($12A): latitude
!orbit_in_age   = !RAM_ORBIT+$16  ; b.age (patrol nodes every 105)
!orbit_in_cycle = !RAM_ORBIT+$18  ; b.cycle (attack pattern position)
!orbit_in_limp  = !RAM_ORBIT+$1A  ; b.lastImpact (an age; -100 when none)
!orbit_in_lmel  = !RAM_ORBIT+$1C  ; b.lastMelee (-200 when none)
!orbit_in_mhits = !RAM_ORBIT+$1E  ; b.meleeHits
!orbit_in_dodge = !RAM_ORBIT+$20  ; b.dodgeCooldown
!orbit_in_stun  = !RAM_ORBIT+$22  ; b.stun
!orbit_land     = !RAM_ORBIT+$24  ; word: the landing clock, 1 + frames since the return to the deck (0: none)
!orbit_enter    = !RAM_ORBIT+$26  ; byte: orbit_api_enter's mode + 1, waiting for the orbit's own frame (0: none)
!orbit_rstep    = !RAM_ORBIT+$27  ; byte: the return to the deck (scene.asm, !RS_*; 0: none) (+$26 is read with it as a word)
!orbit_lx       = !RAM_ORBIT+$28  ; word: the landing spot (map pixels; returnToFortress's nearest landable floor)
!orbit_ly       = !RAM_ORBIT+$2A  ; word
!orbit_lfound   = !RAM_ORBIT+$2C  ; word: the search's state: 0 searching, 1 found, 2 none (Goku keeps hovering)
!orbit_li       = !RAM_ORBIT+$2E  ; word: the search's next candidate (x2)
!orbit_lhx      = !RAM_ORBIT+$30  ; word: Goku's place on the deck it searches around
!orbit_lhy      = !RAM_ORBIT+$32  ; word
; The second surge's cinematic (montage.asm: the cosmic montage, the pullback).
!orbit_mt       = !RAM_ORBIT+$34  ; word: nonzero while it runs (before the orbit's intro)
!orbit_mage     = !RAM_ORBIT+$36  ; word: its clock (frieza.js b.surge.age, from collateralStart)
!orbit_mshot    = !RAM_ORBIT+$38  ; word: the shot (0-5 cosmicShots, !MT_SHOTS on: the pullback; $FFFF before)
!orbit_msage    = !RAM_ORBIT+$3A  ; word: the shot's age
!orbit_mpic     = !RAM_ORBIT+$3C  ; byte: its picture (0: the globe's, or black; !MT_PIC_TOWN, !MT_PIC_AERIAL)
!orbit_mcut     = !RAM_ORBIT+$3D  ; byte: a cut's load step (0: the picture shows)
!orbit_me6      = !RAM_ORBIT+$3E  ; byte: the field's brightness ($E6), kept over the cinematic's force blank
!MT_TOWN        = 0               ; cosmicShots kinds (orbit_mt_shots)
!MT_AERIAL      = 1
!MT_PIC_TOWN    = 1               ; !orbit_mpic: a town shot
!MT_PIC_AERIAL  = 2               ;   an aerial cut
!orbit_marks    = !RAM_ORBIT+$40  ; 8 words (ORBIT_TIMING builds): scanlines at the frame's stages
; The scene's loads (scene.asm orbit_nmi_load): the Mode 7 image's 512-byte
; chunks already in VRAM (the second aerial cut sends some ahead for the
; pullback: montage.asm mt_preload); the uploads the pullback's load
; leaves to its vblanks (pull.asm).
!orbit_m7have   = !RAM_ORBIT+$50  ; 8 bytes: a bit per chunk (64) of the Mode 7 image in VRAM
!orbit_m7next   = !RAM_ORBIT+$58  ; word: the preload's next chunk (x2, in orbit_mt_m7pre)
!orbit_pdef     = !RAM_ORBIT+$5A  ; word: the pullback's next deferred upload (x8, in pull_defer; $FFFF none)
!orbit_pball    = !RAM_ORBIT+$5C  ; word: nonzero once the pullback's Death Ball is gone

; ORBIT_TIMING builds: the scanline at stage n of the frame (orbit_marks).
macro orbit_mark(n)
if defined("ORBIT_TIMING")
	JSR orbit_vcount
	STA.l !orbit_marks+(<n>*2)
	REP #$30
endif
endmacro
!OE_SURGE = 0                     ; orbit_api_enter modes: the second surge's cinematic first
!OE_INTRO = 1                     ; the orbit with its intro
!OE_FIGHT = 2                     ; straight into the fight
!ORBIT_INTRO_FRAMES = 855         ; frieza-cinematic.js orbitIntroFrames
!DEBUG_PRESET_HOOK_ORBIT = orbit_debug_orbit
!DEBUG_PRESET_HOOK_SPACE = orbit_debug_space

!OS_OFF     = $00
!OS_LOADING = $01                 ; art uploads; picture held black
!OS_LIVE    = $02
!OS_STOP    = $03                 ; restore the field on the next vblank

; The return to the deck (frieza.js returnToFortress; scene.asm orbit_return).
!RS_DOOR    = $01                 ; the deck's door is wanted (core_event_request while busy)
!RS_ASKED   = $02                 ; requested: the event pump starts it at the end of an idle frame
!RS_FADE    = $03                 ; it started: the field's fade-out over the picture, still the orbit's
!RS_LOAD    = $04                 ; the picture given back: the field reloads the deck
!RS_LAND    = $05                 ; on the deck: the landing clock (orbit_land) to victoryTiming.landed
!ORBIT_DECK_DOOR = $002F          ; the door into map 246 (C8:30BC: tile 17, 26)
!ORBIT_DECK_MAP  = 246

!OC_NONE      = $00
!OC_TEST_GLOBE = $01              ; tests: show the globe with the camera in the scene block
!OC_STOP      = $02
!OC_API_INTRO  = $04              ; tests: orbit_api_enter(!OE_INTRO) with orbit_api_defaults
!OC_API_FIGHT  = $05              ; tests: orbit_api_enter(!OE_FIGHT) with orbit_api_defaults
!OC_TEST_FIGHT = $03              ; tests: the space fight from its first combat frame
                                  ; (Frieza's HP in !orbit_arg, globe target in !cam_lon/lat)

!OF_ACTIVE  = $01                 ; the orbit owns the picture
!OF_LIVE    = $02

!OT_SPIN    = $01                 ; test scene: advance longitude +2 per frame (tickOrbit)

; ---------------------------------------------------------------------------
; Scene work area (!SRAM_WORK_SCENE = $32:6000, 8 KiB; DB = $32).
!SB = $6000
; Camera (planet-view / orbit-camera units; words).
!cam_x      = !SB+$000            ; globe centre on screen
!cam_y      = !SB+$002
!cam_r      = !SB+$004            ; radius in pixels (1-240)
!cam_lon    = !SB+$006            ; longitude 0-4095 (world px)
!cam_lat    = !SB+$008            ; latitude 0-4095
!cam_tdx    = !SB+$00A            ; travelX change this frame (signed)
!cam_tdy    = !SB+$00C            ; travelY change this frame (signed)
!cam_age    = !SB+$00E            ; sky clock (twinkles)
; Derived.
!sc_ly      = !SB+$010            ; the bodies' projection (scenery.asm): the camera's y it has applied
!g_x0       = !SB+$012            ; Mode 7 texel column at the disc centre
!g_ybase    = !SB+$014            ; texel row at the disc centre
!g_top      = !SB+$016            ; first globe line on screen
!g_bot      = !SB+$018            ; last globe line on screen
!g_cx       = !SB+$01E            ; centre column the window block holds
!sc_ax      = !SB+$022            ;   the frame's travelX (cam_tdx) it has applied
!g_hofs     = !SB+$024            ; M7HOFS for the NMI
!g_m7x      = !SB+$026            ; M7X for the NMI
!sc_ay      = !SB+$028            ;   and travelY (cam_tdy)
!g_tmp      = !SB+$030            ; 16 bytes scratch ($30-$3F)
!g_text     = !SB+$040            ; byte: lines 0..g_text-1 are Mode 1 (BG3 panel)
!g_textset  = !SB+$041            ; byte: g_text the BGMODE table holds ($FF none)
!g_shown_it = !SB+$042            ; the indirect table set the last vblank gave the HDMA
!g_itband   = !SB+$044            ; 2 words: the band window table each set points at (0: none)
!bd_shown   = !SB+$048            ; the band window table the HDMA reads now (0: none)
!g_itend    = !SB+$04A            ; 2 words: the band lines each set gives them (0: none)
!bd_sline   = !SB+$04E            ; the band lines the HDMA shows now
; Starfield (stars.asm). Per-depth words are indexed by depth*2 (2, 4, 6).
!o_slot     = !SB+$090            ; word: next OAM byte offset
!o_tmp      = !SB+$092            ; 6 bytes
!s_tmp      = !SB+$050            ; 16 bytes scratch ($50-$5F)
!st_ax      = !SB+$060            ; 4 bytes: x travel term of depth 1, 16.16 px
!st_ay      = !SB+$064            ; 4 bytes: y travel term, integer kept in 0..223
!st_age240  = !SB+$068            ; sky clock modulo 240
!s_left     = !SB+$06A            ; stars left in this frame's rebuild step
!s_kgen     = !SB+$06C            ; culling generation (bumped when the globe changes)
!s_bpos     = !SB+$06E            ; rebuild: next star (x4)
!s_bend     = !SB+$070            ;   end of the depth's stars (x4)
!s_bout     = !SB+$072            ;   next list entry
!s_ctop     = !SB+$074            ;   culling: line of the first rim row
!s_cn       = !SB+$076            ;   rows (0: none)
!s_cblk     = !SB+$078            ;   window block (bank !s_cbank)
!s_tw       = !SB+$07A            ; twinkle bits of the bright stars
!s_twhave   = !SB+$07C            ; twinkle bits of the built depth-3 list
!s_bd       = !SB+$07E            ; depth being built (d*2)
!s_tile     = !SB+$098            ; tile byte of the star being written
!sx_want    = !SB+$0A0            ; 4 words: O_x per depth
!sy_want    = !SB+$0A8            ; 4 words: O_y
!sz_want    = !SB+$0B0            ; 4 words: zoom delta
!sx_have    = !SB+$0B8            ; 4 words: what each built list used
!sy_have    = !SB+$0C0
!sz_have    = !SB+$0C8
!sk_have    = !SB+$080            ; 4 words: culling generation of each list
; ($0D0-$0FF: globe.asm; $100-$7E3 window blocks; $800-$85F indirect HDMA
; tables, see globe.asm.)
; Globe (globe.asm).
!FL = $F70000                     ; fight line tables (index: 8 bytes per radius)
!g_lr    = !SB+$0D0               ; radius of the published blocks
!g_lR    = !SB+$0D2               ; their rim half height (rows -R..R)
!g_la    = !SB+$0D4               ; M7A block (offset in bank F7)
!g_ld    = !SB+$0D6               ; M7D block
!g_lw    = !SB+$0D8               ; window block (offset in bank $32)
!g_icy   = !SB+$0DA               ; centre line the indirect tables were built for
!g_ichg  = !SB+$0DC               ; nonzero: rebuild the indirect tables
!g_l     = !SB+$0DE               ; scratch
!g_vofs  = !SB+$0E0               ; M7VOFS for the NMI
!g_bR    = !SB+$0E2               ; building: rim half height
!g_bww   = !SB+$0E4               ; building: chord block
!g_bw    = !SB+$0E6               ; building: window block
!g_it    = !SB+$0E8               ; indirect table set being written
!g_cur_it = !SB+$0EA              ; indirect table set for the NMI (0 / !IT_SIZE)
!g_bld    = !SB+$0EC              ; nonzero: a window block is being built
!g_bld_r  = !SB+$0EE              ; its radius
!g_bld_cx = !SB+$0F0              ; its centre column
!g_bld_a  = !SB+$0F2              ; next row (0..R)
!g_bld_n  = !SB+$0F4              ; rows per frame
!ORBIT_DEADLINE = 196             ; spare-time work stops at this scanline

; Window blocks (4 bytes per row, rows -R..R, R <= 108) and the empty record.
!gb_empty = !SB+$0F8              ; 4 bytes: empty windows
!gb_wina  = !SB+$100              ; 868 bytes
!gb_winb  = !SB+$480              ; 868 bytes (ends $7E4 < $800)
!GB_WIN_MAX = 217
; The cosmic montage (montage.asm): a shot's working state over the window
; blocks (the pullback rebuilds them).
!MW = !SB+$100
!mw_town  = !MW+$00               ; the town (0-3)
!mw_tent  = !MW+$02               ; its entry in orbit_mt_towns
!mw_dt    = !MW+$04               ; age - hit (signed)
!mw_pan   = !MW+$06               ; min(12, age / 24)
!mw_shake = !MW+$08               ; -2 / +2 over the hit's first 12 frames
!mw_hitx  = !MW+$0A               ; the hit on the screen (blast - pan)
!mw_hity  = !MW+$0C
!mw_red   = !MW+$0E               ; the tint (0, 5, 2)
!mw_ruin  = !MW+$10               ; the ruin: 1 due, 3 under way (vblank), 2 shown
!mw_np    = !MW+$12               ; people
!mw_pdue  = !MW+$14               ; 3 words: a person's pose due in the slot not shown ($FFFF none)
!mw_pa    = !MW+$1A               ; 3 words: the pose each person's slot A holds ($FFFF none)
!mw_px    = !MW+$20               ; 3 words: the person's picture top left
!mw_py    = !MW+$26               ; 3 words
!mw_pcell = !MW+$2C               ; 3 words: y | cell << 8 | flip << 15
!mw_laser = !MW+$32               ; nonzero: the laser's windows this frame
!mw_wset  = !MW+$34               ; the window table written (0 / 1)
!mw_wshow = !MW+$36               ; the one the HDMA reads
!mw_rows  = !MW+$3A               ; the laser's rows left to enter
!mw_ptr   = !MW+$3E               ; 4 bytes: a long read pointer (address, bank)
!mw_dmap  = !MW+$42               ; DMA: DMAP and B-bus register
!mw_dbank = !MW+$44               ;   source bank
!mw_vmain = !MW+$46               ;   VMAIN
!mw_tmtab = !MW+$48               ; 8 bytes: the HDMA TM table
!mw_tmp   = !MW+$50               ; 16 bytes scratch
!mw_ostart = !MW+$60              ; the OAM offset a run of 16x16 sprites starts at
!mw_lbank = !MW+$62               ; the laser's rows: bank (HDMA indirect)
!mw_loff  = !MW+$64               ;   the windows-off row's address
!mw_rleft = !MW+$66               ; the ruin's blocks left to write
!mw_rnext = !MW+$68               ;   the next one's record (offset in the tables)
!mw_pb    = !MW+$6A               ; 3 words: the pose each person's slot B holds
!mw_pf    = !MW+$70               ; 3 words: the slot shown (0: A, 1: B)
!MW_WIN0  = !SB+$180              ; the laser's window tables (HDMA indirect, mode 4), 32 bytes each
!MW_WIN1  = !SB+$1A0
assert !mw_pf+6 <= !MW_WIN0, "the montage's working state runs into its window tables"
; The pullback's Death Ball (pull.asm), over the same blocks (its globe's
; rows are in extended data; the fight's first block after it is built at
; its end): two buffers of four 32x32 cells.
!PB = !SB+$100
!pb_have  = !PB+$00               ; 2 words: the picture each buffer holds whole ($FFFF none)
!pb_fill  = !PB+$04               ; the picture the back buffer takes ($FFFF none)
!pb_cells = !PB+$06               ;   its cells sent (0-4)
!pb_used  = !PB+$08               ; nonzero: the ball has shown
; An aerial cut (montage.asm): its frame's record, the fighters' cell slots
; and the clouds' scroll tables (HDMA), after the town shot's block.
!MA = !SB+$200
!ma_cut   = !MA+$00               ; the cut (0, 1)
!ma_first = !MA+$02               ; its first record (index in orbit_mta_rec)
!ma_imp   = !MA+$04               ; its explosion's age
!ma_int   = !MA+$06               ; its intensity (1: four more bursts)
!ma_flash = !MA+$08               ; the flash level the palette shows (0-5)
!ma_tset  = !MA+$0A               ; the scroll tables written (0 / 1)
!ma_tshow = !MA+$0C               ; the ones the HDMA reads
!ma_cur   = !MA+$0E               ; table building: the next line
!ma_lay   = !MA+$1A               ;   the layer's copies: left (6 words)
!ma_top   = !MA+$32               ;   top (6 words)
!ma_ord   = !MA+$4A               ;   in top order (6 words)
!ma_r     = !MA+$56               ; the frame's record (20 bytes, orbit-montage.mjs)
!MA_FS    = !MA+$6A               ; the fighters' slots: Goku, Frieza (12 bytes each:
                                  ; cell A, cell B, shown, due, rows sent, -)
!ma_tmp   = !MA+$82               ; 16 bytes scratch
!ma_rec   = !MA+$92               ; this frame's record (offset in the records)
!ma_s     = !MA+$96               ; table building: the layer's scroll mod 416
!ma_tall  = !MA+$98               ;   its copies' lines
!ma_row   = !MA+$9A               ;   its strip's map row - 1
!ma_h     = !MA+$9C               ;   an entry's HOFS, VOFS
!ma_v     = !MA+$9E
!ma_pairok = !MA+$A0              ;   nonzero: the 2x layer (its copies 5 and 0)
!MA_T1A   = !SB+$2B0              ; BG1 scroll tables (HDMA mode 3), 80 bytes each
!MA_T1B   = !SB+$300
!MA_T2A   = !SB+$350              ; BG2's
!MA_T2B   = !SB+$3A0
assert !ma_pairok+2 <= !MA_T1A, "the aerial cut's working state runs into its tables"
; Indirect HDMA tables: per set M7A, M7D, windows (16 bytes each).
!IT_BASE  = !SB+$800
!IT_SIZE  = $30
!it_m7a   = $00
!it_m7d   = $10
!it_win   = $20

!hb_mode    = !SB+$860            ; BGMODE ($2105) table of indirect set 0, 16 bytes (hb_mode1: set 1's)
!SB_STARS   = !SB+$870            ; star lists: 3 count words, then the entries
!s_lists    = !SB_STARS           ; bytes in list d at s_lists + d*2 - 2
!s_list1    = !SB_STARS+$008      ; depth 1 (44 x 4)
!s_list2    = !SB_STARS+$0C0      ; depth 2 (53 x 4)
!s_list3    = !SB_STARS+$1A0      ; depth 3 (3 x 4, bright)
; The stars' limits under the beams (stars.asm stars_limits): per 8-line
; row the stars of lists 1-2 that may cover it, and per list the stars
; its last build kept on each row.
!sc_k       = !SB+$A1C            ; 28 bytes: per row, stars allowed (!SC_FREE: no beam)
!sc_cnt     = !SB+$A38            ; 28 bytes: per row, list 1's stars
!sc_cnt2    = !SB+$A54            ; 28 bytes: per row, list 2's stars (sc_cnt + 28)
!sc_sig     = !SB+$A70            ; 2 x 4 bytes: per group slivers, top row, bottom row (0: none)
!sc_on      = !SB+$A78            ; nonzero while any row has a limit
!s_bnext    = !SB+$A7A            ; the stale depths are looked at from this one (2, 4, 6)
!sc_hot     = !SB+$A7C            ; nonzero: the limits changed, the depths' rebuilds go first
assert !s_list3+12 <= !sc_k, "the star lists run into their limits"
assert !sc_cnt2 == !sc_cnt+28, "the stars' row counts are one array per list"
assert !sc_hot+2 <= !SB+$A80, "the stars' limits run into the fight's state"
!SC_FREE    = 254                 ; no limit on the row
!SC_SPARE   = 2                   ; slivers a line keeps for the sprites besides beams and stars
!SB_END     = !SB+$A80            ; the fight's state follows
assert !SB_END <= $8000, "orbit scene block overflow"

; ---------------------------------------------------------------------------
; Fight state (engine/frieza-orbit.js space, frieza.js boss), words.
!FB = !SB+$A80
!f_age      = !FB+$00              ; space.age
!f_intro    = !FB+$02              ; intro frames left
!f_hx       = !FB+$04              ; hero (screen pixels)
!f_hy       = !FB+$06
!f_heading  = !FB+$08              ; 0-15
!f_charge   = !FB+$0A              ; 0-45
!f_cooldown = !FB+$0C
!f_teleport = !FB+$0E
!f_punch    = !FB+$10
!f_duelcd   = !FB+$12
!f_duel     = !FB+$14              ; exchange age (0: none)
!f_moving   = !FB+$16              ; camera.moving
!f_menureq  = !FB+$18
!f_pad      = !FB+$1A              ; physical pad this frame (core layout)
!f_padprev  = !FB+$1C
!f_grace    = !FB+$1E              ; boss.grace (Goku's invulnerability after a hit)
!fb_on      = !FB+$20              ; Goku's beam: active
!fb_x       = !FB+$22
!fb_y       = !FB+$24
!fb_head    = !FB+$26
!fb_age     = !FB+$28
!fb_max     = !FB+$2A
!fb_width   = !FB+$2C              ; 8.8 pixels (8 + 24 strength)
!fb_damage  = !FB+$2E
!b_x        = !FB+$30              ; Frieza
!b_y        = !FB+$32
!b_hp       = !FB+$34
!b_age      = !FB+$36
!b_clock    = !FB+$38
!b_cycle    = !FB+$3A
!b_stun     = !FB+$3C
!b_hurt     = !FB+$3E
!b_blink    = !FB+$40
!b_dash     = !FB+$42
!b_windup   = !FB+$44
!b_node     = !FB+$46
!b_evh      = !FB+$48              ; evade heading
!b_evn      = !FB+$4A              ; evade frames left (0: none)
!b_dodgecd  = !FB+$4C
!b_guard    = !FB+$4E
!b_counter  = !FB+$50
!b_recoil   = !FB+$52
!b_lastimp  = !FB+$54              ; age of the last impact cue
!b_mhits    = !FB+$56              ; melee hits in the current window
!b_lastmel  = !FB+$58
!w_kind     = !FB+$5A              ; warning: 0 none, !WK_*
!w_age      = !FB+$5C
!w_wait     = !FB+$5E
!w_tx       = !FB+$60              ; target (the hero when it started)
!w_ty       = !FB+$62
!f_hits     = !FB+$64              ; Goku hit count (browser playerHits)
!f_shake    = !FB+$66              ; feedback pulse request (frames)
!f_tmp      = !FB+$68              ; 16 bytes scratch
!sc_dead    = !FB+$78              ; the distant bodies (scenery.asm): bits 0-2 shattered, bit 15 Luna has spoken
!f_firing   = !FB+$7A              ; a laser is out (frieza.js firing)
!f_evading  = !FB+$7C              ; Frieza side-steps this frame
; Arrays.
!FS_SHOTS   = !FB+$80              ; Goku's ki: 6 x 8 (x, y, heading, age; age $FF.. = free)
!FS_N       = 6
!FS_BOSS    = !FB+$B0              ; Frieza's shots: 12 x 16
!BS_N       = 12
!bs_kind    = $00                  ; 0 free, !WK_* kind
!bs_x       = $02
!bs_y       = $04
!bs_head    = $06
!bs_speed   = $08
!bs_age     = $0A
!bs_px      = $0C                  ; previous position
!bs_py      = $0E
!FS_RIC     = !FB+$170             ; ricochets: 8 x 8 (x, y, heading, owner<<8 | age; age >= 45 free)
!RIC_N      = 8
!FS_HITS    = !FB+$1B0             ; hit bursts: 8 x 6 (x, y, age; >= 54 free)
!HIT_N      = 8
!FS_AFTER   = !FB+$1E0             ; afterimages: 4 x 6 (x, y, age; >= 16 free)
!sc_expo    = !FB+$1F8             ; the distant bodies (strike.asm): bits 0-2 shown (on the screen, off the globe), 8-10 known
!sc_pend    = !FB+$1FA             ;   steps of travelX + 2 not yet in their remainders (scenery.asm)
!sc_room    = !FB+$1FC             ;   steps every place takes before it moves
!sc_wkey    = !FB+$1FE             ;   the wanted pictures' key (scdraw.asm sc_wants: radius, bodies, Death Ball, phase)
; Maths scratch (math.asm).
!m_t0       = !FB+$200
!m_t1       = !FB+$202
!m_t2       = !FB+$204
!m_t3       = !FB+$206
!m_t4       = !FB+$208
!m_t5       = !FB+$20A
!m_t6       = !FB+$20C
!m_t7       = !FB+$20E
!sw_px      = !FB+$210
!sw_py      = !FB+$212
!sw_ax      = !FB+$214
!sw_ay      = !FB+$216
!sw_bx      = !FB+$218
!sw_by      = !FB+$21A
!sw_r       = !FB+$21C
!sw_len     = !FB+$21E
!sw_dx      = !FB+$220
!sw_dy      = !FB+$222
!sw_along   = !FB+$224
!f_on       = !FB+$226             ; the fight runs and draws (tests, frieza hand-off)
!f_power    = !FB+$228             ; focus power (mana-mod powerCharge, 0-96)
!f_focus    = !FB+$22A             ; L alone held this frame (focus stance)
!f_disc     = !FB+$22C             ; hurt: the hit is Frieza's own disc
!f_exact    = !FB+$22E             ; hurt: the amount is already weighted
!fb_damage9 = !FB+$230             ; the wave's damage under the training gi
!f_gi       = !FB+$232             ; the hero's armor this frame ($E1E1)
; (kept by fight_start: the step clock)
!sc_aside   = !FB+$7E              ; Luna's remark: 0 none, else its age + 91
!sc_imp     = !FB+$234             ; 3 x 4 bytes: an impact's age + 1 (0: none), its copy's x and y offsets (signed bytes)
!FIGHT_END  = !FB+$240
!f_vbl      = !FB+$240             ; combat's field vblank count at the last step
!f_steps    = !FB+$242             ; fight steps this frame
!f_menus    = !FB+$244             ; ring + menu frames seen (a change: no catch-up)
!ORBIT_COMBAT_OWNER = $0100        ; owner bit for combat's input lock and danger
assert !FIGHT_END <= !SB+$D00, "orbit fight block overflow"
; (after the fight's block: the BGMODE table of the second indirect set,
; and what each set's table holds: g_text | $100 in the pullback)
!hb_mode1   = !SB+$CC6             ; 16 bytes (hb_mode: the first set's)
!hb_have    = !SB+$CD6             ; 2 words ($FFFF: nothing yet)
; (the beams the stars' limits were made for, per group class | on,
; chains, x, y, signs, the band layers' line)
!sc_in      = !SB+$CDA             ; 2 x 12 bytes
; (the ki auras' pictures wanted this frame, aura.asm: Goku's, Frieza's)
!au_want    = !SB+$CF2             ; 2 words ($FFFF: none)
!au_tmp     = !SB+$CF6
; (the distant bodies' projection, scenery.asm: N_x, N_y per body, 32 bits
; each, then the camera's radius and x it has applied)
!sc_n       = !SB+$7E4             ; 3 x 8 bytes (after the second window block)
!sc_lr      = !SB+$7FC
!sc_lx      = !SB+$7FE
assert !gb_winb+868 <= !sc_n, "the bodies' projection runs into the window block"
; (WRAM: their places and the pictures their homes want and hold, read by
; the vblank)
!sc_pos     = !RAM_ORBIT+$5E       ; x[3], y[3], r[3] (words)
!sc_want    = !RAM_ORBIT+$70       ; 3 words: home A (the outer planet at $004), B (the planetoid), C (the moon in the clash)
!sc_have    = !RAM_ORBIT+$76
!sc_nwant   = !RAM_ORBIT+$7C       ; nonzero: a home may lack its wanted picture (the vblank looks)
; Frame-side scratch. The projection's: the drawing's (idle while the
; fight steps and before the drawing).
!sc_kb = !d_t0
!sc_k4 = !d_t1
!sc_dn = !d_t2                     ; 32 bits
!sc_t  = !d_t4                     ; 8 bytes
; The strikes' (in the fight's tick, only outside the clash): the finale's
; drawing, mix and logic scratch, all idle until the clash begins.
!sc_own   = !fn_d+0                ; owner (0 Goku, 1 Frieza, 2 countered), bit 15 a beam
!sc_w     = !fn_d+2                ; the line's width
!sc_ray   = !fn_d+4                ; nonzero: a ray (else a step)
!sc_h     = !fn_d+6                ; the ray's heading and length
!sc_ex2   = !fn_d+8                ; (the exact ray test's scratch)
!sc_d1    = !fn_d+10
!sc_vx    = !fn_d+12               ; its 8.8 vector
!sc_vy    = !fn_d+14
!sc_ey2   = !fn_d+16
!sc_rr    = !fn_d+18               ; 256 R
!sc_best  = !fn_d+20               ; nearest struck so far (squared distance), its body
!sc_bestk = !fn_d+22
!sc_hits  = !fn_d+24
!sc_kk    = !fn_d+26               ; the body tested (* 2)
!sc_r     = !fn_d+28               ; its radius + the width
!sc_ex    = !fn_d+30               ; its centre from the line's start
!sc_ey    = !fn_m+0
!sc_dx    = !fn_m+2                ; the step
!sc_dy    = !fn_m+4
!sc_dot   = !fn_m+6
!sc_dd    = !fn_m+8
!sc_tt    = !fn_m+10
!sc_sq    = !fn_m+12               ; 4 bytes
!sc_p     = !fn_q+0                ; 32-bit products
!sc_mu    = !fn_q+4                ; their operands
!sc_q     = !d_t0                  ; 32 bits (the projection's scratch is idle here)
!sc_bx0   = !d_t2                  ; the line's box: x from, width
!sc_bxs   = !d_t3
!sc_by0   = !d_t4                  ;   y from, height
!sc_bys   = !d_t5
!sc_m2    = !d_t6                  ;   twice its margin + 1
; (the fast ray test's: the ray's |vx|, |vy|, their signs, the heading's
; class h & 3; the centre's |ex|, |ey|; a product's sign. The fight's math
; scratch, free across a strike)
!sc_avx   = !m_t0
!sc_avy   = !m_t1
!sc_svx   = !m_t2
!sc_svy   = !m_t3
!sc_vcls  = !m_t4
!sc_aex   = !m_t5
!sc_aey   = !m_t6
!sc_sg    = !m_t7
; The projection's update (sc_update, never during a strike): the changes
; since the last.
!sc_dtx   = !fn_m+0
!sc_dty   = !fn_m+2
!sc_dr    = !fn_m+4
!sc_dcx   = !fn_m+6
!sc_dcy   = !fn_m+8
!sc_sx    = !fn_q+0                ; the travel's shared products (32 bits)
!sc_sy    = !fn_q+4
; (the victory's colours for the vblank, wash.asm: the whiteout's level w,
; its colours in extended data, the backdrop, palette 6's place in a level)
!wv_white   = !SB+$CF8
!wv_base    = !SB+$CFA
!wv_sky     = !SB+$CFC
!wv_p6      = !SB+$CFE
assert !FIGHT_END+6 <= !hb_mode1, "the second BGMODE table runs into the fight's state"
assert !sc_in+24 <= !au_want, "the stars' beam inputs run into the auras' state"
assert !au_tmp+2 <= !wv_white, "the auras' state runs into the victory's colours"
assert !wv_p6+2 <= !SB+$D00, "the victory's colours run into the drawing block"

; ---------------------------------------------------------------------------
; Drawing and dynamic VRAM (draw.asm, scene.asm).
!DB = !SB+$D00
!d_x        = !DB+$00              ; ofx_put: x, y (signed), tile|attr word, large (0/1)
!d_y        = !DB+$02
!d_ta       = !DB+$04
!d_big      = !DB+$06
!d_t0       = !DB+$08              ; draw scratch
!d_t1       = !DB+$0A
!d_t2       = !DB+$0C
!d_t3       = !DB+$0E
!d_t4       = !DB+$10
!d_t5       = !DB+$12
!d_t6       = !DB+$14
!d_t7       = !DB+$16
!d_hit      = !DB+$18              ; hit entry being drawn
!d_sx       = !DB+$1A              ; burst scratch (fd_burst: the mirrored frame's offset)
!d_pri      = !DB+$1C              ; fd_burst_at's priority bits (fd_burst: over the globe)
; Wanted (frame side) and uploaded (NMI side) dynamic cells; $FFFF = none.
!v_frieza   = !DB+$20              ; bank FA offset of Frieza's 32x32 frame
!v_frieza_h = !DB+$22
!v_goku     = !DB+$24              ; bank FA offset of Goku's 16x16 pose
!v_goku_h   = !DB+$26
!v_d32      = !DB+$28              ; Death Ball 32 frame (0-11)
!v_d32_h    = !DB+$2A
!v_d16      = !DB+$2C              ; Death Ball 16 frame (0-11)
!v_d16_h    = !DB+$2E
!v_band     = !DB+$30              ; beam band colour frame (0/1)
!n_src      = !DB+$32              ; NMI cell upload: source, bank, VRAM, rows, row bytes
!n_bank     = !DB+$34
!n_vram     = !DB+$36
!n_rows     = !DB+$38
!n_len      = !DB+$3A
!v_pband    = !DB+$3C              ; pink band colour frame (0/1)
!v_pmode    = !DB+$3E              ; pink band layout: 0 beam (2 A, 3 B), 1 laser (1 A, 2 B, 3 white)
!DRAW_END   = !DB+$40
assert !DRAW_END <= $8000, "orbit draw block overflow"
!BB = !SB+$D40                     ; beam bands (beam.asm), to !BB_END
!BEAM_ROWS = 16                    ; picture rows generated per call at most
; Key: R (bits 0-5) | class (6-8) | chain (9-10) | laser (11).
!BK_LASER = $0800

; Per group (word arrays indexed by group*2).
!bw_key    = !BB+$00               ; wanted key of chain 0 ($FFFF: group off)
!bw_j      = !BB+$04               ; chains each side (0-2)
!bw_x      = !BB+$08               ; origin
!bw_y      = !BB+$0C
!bw_flip   = !BB+$10               ; OAM flips of the mirror ($4000 h, $8000 v)
!bw_sx     = !BB+$14               ; $FFFF when x is mirrored
!bw_sy     = !BB+$18
!bw_len    = !BB+$1C               ; cells along the axis (length / period)
!bw_pal    = !BB+$20               ; palette << 9 | priority
; Slots (6).
!bs_have   = !BB+$24               ; key the slot's VRAM holds ($FFFF none)
; Generation.
!bg_on     = !BB+$30               ; nonzero: rows left to make
!bg_ready  = !BB+$32               ; slot + 1 when the buffer waits for the NMI
!bg_slot   = !BB+$34
!bg_key    = !BB+$36
!bg_row    = !BB+$38
!bg_cls    = !BB+$3A               ; class * 28 (table offset)
!bg_vr     = !BB+$3C               ; V of the row (class 0 and 4)
!bg_q      = !BB+$40               ; 4 words: floor((V_row - t) / vy), thresholds
!bg_m      = !BB+$48               ; 4 words: remainders
!bg_t      = !BB+$50               ; 4 words: thresholds (lo1, hi1, lo0, hi0)
!bg_tmp    = !SB+$E00              ; 16 bytes (beam_want arguments, scratch)
!bg_mask   = !BB+$60               ; 8 bytes: plane 1 (outer) then plane 0 masks
!bg_ct     = !BB+$68               ; beam_class_offset scratch
!bg_src    = !BB+$6A               ; the waiting picture: source (offset, bank)
!bg_bank   = !BB+$6C
!bq_n      = !SB+$1770             ; class-1 pictures for the vblank: count,
!bq_i      = !SB+$1772             ;   next to send,
!BQ_E      = !SB+$1774             ;   4 x (slot * 2, source, bank, key) (to $1793)
!bc_wait   = !SB+$1794             ; 2 words: frames each group's rebuild has waited (beam_defer)
!n_cost    = !SB+$1798             ; orbit_nmi_room: the upload's lines
!vb_want   = !SB+$179A             ; 2 words: the boss bursts' pictures wanted in slots 3 and 4 ($FFFF none; bursts.asm)
!vb_t      = !SB+$179E             ;   their clock (deathAge)
assert !vb_t+2 <= !SB+$17A0, "the bursts' state runs into OBJ palettes 4-5"
!OBJ_PALS45 = !SB+$17A0           ; OBJ palettes 4-5 (blue, pink) with this frame's band colours, as sent (to $77DF)
!n_static  = !SB+$17E0             ; nonzero: the vblank wrote the scene's fixed registers
!n_turn    = !SB+$17E2             ; nonzero: the beam pictures' turn before the band map (vblank)
; The descent's globe (globe.asm globe_descent): tables in extended data.
!g_desc    = !SB+$17E4             ; nonzero: the descent's camera (finale_camera), its generated tables
!g_lbank   = !SB+$17E6             ; bank of the published M7A / M7D rows (F7: the fight's)
!g_wbank   = !SB+$17E8             ; bank of the published window rows ($32: the fight's blocks)
!g_wempty  = !SB+$17EA             ; an empty window record in that bank
!g_itbank  = !SB+$17EC             ; 2 words: the M7A / M7D bank each indirect set reads
!g_itwbank = !SB+$17F0             ; 2 words: the window bank each set reads
!g_dk      = !SB+$17F4             ; the frame the published tables show (descent x8, pullback $8000 | t; $FFFF none)
!s_cbank   = !SB+$17F6             ; stars: the culling rows' bank
; The second surge's pullback (pull.asm).
!g_pull    = !SB+$17F8             ; nonzero: the pullback's camera and tables, its globe to line 223
!g_mend    = !SB+$17FA             ; the line after the globe's Mode 7 lines (196; 224 in the pullback)
!v_dbig    = !SB+$17FC             ; its Death Ball picture wanted (0-11 at 64 px, 12-23 at 48; $FFFF none)
!pb_shown  = !SB+$17FE             ;   the buffer its sprites show (0 / 2)
; $32:7800-7FFF stays the frieza module's (his fight block !FZSB and the
; deck's hole bitmap): frieza_orbit_won clears his shots there, and his
; arena could outlive the orbit.
assert !pb_shown+2 <= !SB+$1800, "orbit scene work past $32:77FF (the frieza module's block)"
!ORBIT_NMI_END = 257               ; the scene's vblank uploads end by this scanline
!ORBIT_NMI_LATE = 244              ; a vblank of ours starting this late keeps the fixed registers
!BEAM_LATE = 180                   ; a build that can wait ends by this scanline
!BB_END    = !BB+$70
!BEAM_BUF  = !SB+$1000             ; 512-byte picture buffer ($7000-$71FF)

; Cached beam runs (beam.asm beam_draw): per group (index group*2).
!bc_sig   = !SB+$DC0               ; 8 words: this frame's signature
!bc_tmp   = !SB+$DD0
!bp_n     = !SB+$DD2               ; build: chains (x2)
!bp_i     = !SB+$DD4               ;   cell index
!bp_dx    = !SB+$DD6               ;   step along the axis
!bp_dy    = !SB+$DD8
!bp_ptr   = !SB+$DDA               ;   write pointer (bank $32)
!bp_base  = !SB+$DDC
!bp_hib   = !SB+$DDE
!bp_tile  = !SB+$DE0               ;   5 words: chain tile words
!bp_x     = !SB+$DEA               ;   5 words: chain cell x
!bp_y     = !SB+$DF4               ;   5 words: chain cell y
!BC_SIG   = !SB+$1200              ; 2 x 8 words: the cached runs' signatures
!BC_BYTES = !SB+$1220              ; 2 words: OAM bytes in each cached run (0: none)
!BC_BND   = !SB+$1224              ; 2 x 12 words: run bytes after each cell index
!BC_HI    = !SB+$1260              ; 2 x 16 bytes: the high-table bytes
!BC_OAM   = !SB+$1300              ; 2 x 256 bytes: the entries (60 at most)
!t_want = !SB+$DB0                 ; text panel wanted (0: none, !OTXT_*)
!t_have = !SB+$DB2                 ; text panel in BG3 now

; The beam struggle and the victory (finale.asm, fdraw.asm), after the
; beam cache in the orbit's part of the Frieza fight's hole-drawing cache
; ($32:7000-77FF, borrowed while the orbit owns the picture: see orbit.md).
!FN = !SB+$1500
!FN_GATHER   = 1                   ; clash phases (frieza-finale.js)
!FN_CHARGE   = 2
!FN_LAUNCH   = 3
!FN_STRUGGLE = 4
!FN_RECOIL   = 5
!FN_WIN      = 6
!fn_phase = !FN+$00                ; 0 none, !FN_GATHER .. !FN_WIN
!fn_age   = !FN+$02                ; clash.age
!fn_p     = !FN+$04                ; pressure (Q31, 4 bytes)
!fn_s     = !FN+$08                ; shown (Q31, 4 bytes)
!fn_taps  = !FN+$0C
!fn_last  = !FN+$0E                ; lastTap (signed)
!fn_hx0   = !FN+$10                ; clash.from: hero, boss, camera
!fn_hy0   = !FN+$12
!fn_bx0   = !FN+$14
!fn_by0   = !FN+$16
!fn_cx0   = !FN+$18
!fn_cy0   = !FN+$1A
!fn_cr0   = !FN+$1C
!fn_bage  = !FN+$1E                ; b.age since the win
!fn_ret   = !FN+$20                ; nonzero: back on the deck
!fn_shout = !FN+$22                ; the release shout this frame (audio)
!fn_px    = !FN+$24                ; the struggle's meeting point (screen)
!fn_py    = !FN+$26
!fn_t     = !FN+$28                ; ease (32-bit fraction)
!fn_m     = !FN+$2C                ; 16 bytes: mix scratch
!fn_q     = !FN+$3C                ; 8 bytes: |d| * t
!fn_d     = !FN+$44                ; 32 bytes: drawing scratch
!fr_x     = !FN+$64                ; this frame's rays (fdraw.asm fc_rays), per
!fr_y     = !FN+$68                ; group (0 Goku's, 1 Frieza's): origin,
!fr_head  = !FN+$6C                ; heading, band radius (0: none), length,
!fr_r     = !FN+$70                ; the end's x offset (Frieza's)
!fr_len   = !FN+$74
!fr_ex    = !FN+$78
!od_on    = !FN+$7C                ; the orbital death (death.asm): running
!od_age   = !FN+$7E                ;   its clock
!od_fx    = !FN+$80                ;   Goku's place at the fatal hit
!od_fy    = !FN+$82
!od_dx    = !FN+$84                ;   the fall's target minus that place
!od_dy    = !FN+$86
!od_gold  = !FN+$88                ;   died a Super Saiyan
!od_base  = !FN+$8A                ;   OBJ palette 1 holds the base form's colours
!od_t     = !FN+$8C                ;   scratch
!od_q     = !FN+$8E
!od_q2    = !FN+$90
!od_m     = !FN+$92
!od_lo    = !FN+$94
!od_cam   = !FN+$96                ;   the camera at the fatal hit (x, y, r, longitude, latitude)
!FN_END   = !FN+$A0
assert !FN_END <= !SB+$15A0, "orbit finale block overflow"

; The band layers (bands.asm): two window tables (lines 0-105, 4 bytes a
; line: W1 left/right, W2 left/right), the BG1 scroll split, state.
!BD_TAB_A  = !SB+$E10              ; $6E10-$6FB7
!BD_TAB_B  = !SB+$15A0             ; $75A0-$7747
!BD_SCROLL = !SB+$1750             ; HDMA tables: +0 $210D/$210E (11 bytes), +12 $2131 (5 bytes)
!bd_on     = !SB+$FB8              ; 2 words: group drawn by its layer this frame
!bd_mr     = !SB+$FBC              ; 2 words: the radius its map holds (0: none)
!bd_key    = !SB+$FC0              ; 4 words: the column each table holds (table * 4 + group * 2)
!bd_rch    = !SB+$FC8              ; 2 words: the column's far end (reach)
!bd_q      = !SB+$FCC              ; far end DDA: quotient (screen x)
!bd_rm     = !SB+$FCE              ;   remainder (0-228)
!bd_src    = !SB+$FD0              ; static rows (offset in the band data)
!bd_end    = !SB+$FD2              ; lines the layers cover (0: none)
!bd_tab    = !SB+$FD4              ; the published window table (0: none)
!bd_up     = !SB+$FD6              ; map upload wanted: group * 2 + 2 (0: none)
!bd_upr    = !SB+$FD8              ;   its radius
!bd_lines  = !SB+$FDA
!bd_out    = !SB+$FDC
!bd_n      = !SB+$FDE
!bd_kofs   = !SB+$FE0
!bd_wrote  = !SB+$FE2
!bd_t      = !SB+$FE4              ; 10 bytes scratch (to $FED)
!bd_to1    = !SB+$FEE              ; 2 words: the rays' cross-section bounds (x + 2y)
!bd_to2    = !SB+$FF2
!bd_ulo    = !SB+$FF6              ; 2 words: their ends (2x - y), for the stars
!bd_uhi    = !SB+$FFA
!bd_g      = !SB+$FFE              ; (to $FFF)
!BD_TILES  = $5000                 ; VRAM: the band tiles (orbit-fx band.bin)
!BD_MAP1   = $5400                 ;   BG1 map (Frieza's band; the field's BG1 map area)
!BD_MAP2   = $5C00                 ;   BG2 map (Goku's)
!bw_ymin   = !SB+$DB4              ; 2 words: beam cells above this line are the layers'


; OBJ VRAM the scene owns while it shows (name base $6000, 16/32 sizes).
!OV_FRIEZA = $000                  ; 32x32, dynamic
!OV_D32    = $004                  ; 32x32, dynamic
!OV_GOKU   = $088                  ; 16x16, dynamic
!OV_D16    = $08A                  ; 16x16, dynamic
; Sprite attributes (high byte of the OAM tile word): palette << 9, priority << 12.
!OA_PRI    = $2000                 ; priority 2 (over the Mode 7 globe)
!OA_PRI1   = $1000                 ; priority 1 (over the globe, under the finale's band layers)
!OA_HFLIP  = $4000
!OA_VFLIP  = $8000

!WK_BEAM  = 1
!WK_LASER = 2
!WK_DISC  = 3
!WK_ORB   = 4

; HDMA channels the scene programs (bits in the game's shadow $2C).
!ORBIT_HDMA = $7F                  ; channels 0 ($2131 colour math), 1 ($210D/E: BG1 / Mode 7 scroll), 2 (BGMODE), 3 (M7A), 4 (M7D), 5 (BG3VOFS), 6 (windows)

; VRAM / OAM / CGRAM.
!ORBIT_STAR_TILE  = $160           ; OBJ tiles $160-$17F (VRAM $7600-$77FF): star cells
!ORBIT_STAR_VRAM  = $7600
!ORBIT_STAR_PAL   = 7              ; OBJ palette 7 (CGRAM 240-255)
!ORBIT_SKY        = $0800          ; planet-view sky rgb(0,0,2)
; planet-view rim blue[1] rgb(6,17,30) = sky + COLDATA (6,17,28).
!ORBIT_RIM_R = 6
!ORBIT_RIM_G = 17
!ORBIT_RIM_B = 28

; Native field addresses (bank $7E / direct page 0).
!N_TM       = $0021
!N_TS       = $0022
!N_CGADSUB  = $0023
!N_HDMA     = $002C
!N_ROWREQ   = $002E
!N_COLREQ   = $002F
!N_ANIM1    = $0090
!N_ANIM2    = $009A
!N_MAP      = $00DC

; Generated tables and art.
pushpc
org !DATA_ORBIT
orbit_stars:     incbin "orbit/stars.bin"
orbit_asin:      incbin "orbit/asin.bin"
orbit_recip:     incbin "orbit/recip.bin"
orbit_rimsq:     incbin "orbit/rimsq.bin"
orbit_rimw:      incbin "orbit/rimw.bin"
orbit_globe_pal: incbin "orbit/globe_pal.bin"
incsrc "orbit-sprites/palettes.asm"
incsrc "orbit/victory.asm"
orbit_star_tiles:
	; 32 tiles (OBJ rows $16x and $17x): dots of shades 0-3 at even columns
	; 0-6, twinkle crosses at 8-14 (centre at 1,1); odd columns and the second
	; row stay empty so each 16x16 sprite shows only its own star.
	incbin "orbit/star_tiles.bin"
incsrc "orbit-fx/data.asm"
incsrc "orbit-text/text.asm"
incsrc "orbit-finale/finale.asm"
orbit_data_end:
assert orbit_data_end <= !DATA_ORBIT+$8000, "orbit data bank overflow"
org $F60000
orbit_globe_vram: incbin "orbit/globe_vram.bin"
org $F70000
orbit_fight_lines: incbin "orbit/fight_lines.bin"
orbit_fx_vram_a:  incbin "orbit-fx/vram_a.bin"   ; OBJ tiles $080-$0FF
orbit_fx_vram_b:  incbin "orbit-fx/vram_b.bin"   ; $100-$13F
orbit_fx_vram_c:  incbin "orbit-fx/vram_c.bin"   ; $180-$1BF
orbit_fx_vram_d:  incbin "orbit-fx/vram_d.bin"   ; $000-$03F (resident cells beside the dynamic ones)
orbit_fx_death:   incbin "orbit-fx/death.bin"    ; Death Balls: 12 x 32x32, 12 x 16x16
orbit_text_tiles: incbin "orbit-text/tiles.bin"  ; BG3 text panel tiles
orbit_band_tiles: incbin "orbit-fx/band.bin"     ; the finale's band layer tiles (BG1/BG2)
orbit_f7_end:
assert orbit_f7_end <= $F80000, "orbit bank F7 overflow"
org $FA8000
orbit_sprites: incbin "orbit-sprites/sprites.bin"
pullpc

pushpc
org !CODE_ORBIT
orbit_code_start:
incsrc "scene.asm"
incsrc "globe.asm"
incsrc "stars.asm"
incsrc "math.asm"
incsrc "fight.asm"
incsrc "draw.asm"
incsrc "beam.asm"
incsrc "aura.asm"
incsrc "scdraw.asm"
incsrc "wash.asm"
incsrc "bursts.asm"
incsrc "text.asm"
incsrc "finale.asm"
incsrc "fdraw.asm"
incsrc "bands.asm"
incsrc "death.asm"
incsrc "api.asm"
incsrc "pull.asm"
orbit_code_end:
assert orbit_code_end <= !CODE_ORBIT+$7C00, "orbit code bank overflow (bind.asm sits at $FC00)"
pullpc

; The second code area: goku's spare quarter (core/layout.asm, free; orbit.md
; asks core to note it there): the second surge's cinematic and its tables.
!CODE_ORBIT2 = !CODE_QUARTER_GOKU
pushpc
org !CODE_ORBIT2
orbit_code2_start:
incsrc "montage.asm"
incsrc "orbit-montage/montage.asm"
incsrc "scenery.asm"
orbit_code2_end:
assert orbit_code2_end <= !CODE_ORBIT2+$4000, "orbit second code area overflow"
pullpc

; The third code area: title's spare quarter (core/layout.asm notes it):
; the distant bodies' strikes.
!CODE_ORBIT3 = !CODE_QUARTER_MISC
pushpc
org !CODE_ORBIT3
orbit_code3_start:
incsrc "strike.asm"
orbit_code3_end:
assert orbit_code3_end <= !CODE_ORBIT3+$4000, "orbit third code area overflow"
pullpc
