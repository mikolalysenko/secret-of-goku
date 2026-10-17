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

!OS_OFF     = $00
!OS_LOADING = $01                 ; art uploads; picture held black
!OS_LIVE    = $02
!OS_STOP    = $03                 ; restore the field on the next vblank

!OC_NONE      = $00
!OC_TEST_GLOBE = $01              ; tests: show the globe with the camera in the scene block
!OC_STOP      = $02

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
!g_r        = !SB+$010            ; (spare)
!g_x0       = !SB+$012            ; Mode 7 texel column at the disc centre
!g_ybase    = !SB+$014            ; texel row at the disc centre
!g_top      = !SB+$016            ; first globe line on screen
!g_bot      = !SB+$018            ; last globe line on screen
!g_cx       = !SB+$01E            ; centre column the window block holds
!g_cy       = !SB+$022            ; (spare)
!g_hofs     = !SB+$024            ; M7HOFS for the NMI
!g_m7x      = !SB+$026            ; M7X for the NMI
!g_ytab     = !SB+$028            ; (spare)
!g_tmp      = !SB+$030            ; 16 bytes scratch ($30-$3F)
!g_text     = !SB+$040            ; byte: lines 0..g_text-1 are Mode 1 (BG3 panel)
!g_textset  = !SB+$041            ; byte: g_text the BGMODE table holds ($FF none)
; Starfield (stars.asm). Per-depth words are indexed by depth*2 (2, 4, 6).
!o_slot     = !SB+$090            ; word: next OAM byte offset
!o_tmp      = !SB+$092            ; 6 bytes
!s_tmp      = !SB+$050            ; 16 bytes scratch ($50-$5F)
!st_ax      = !SB+$060            ; 4 bytes: x travel term of depth 1, 16.16 px
!st_ay      = !SB+$064            ; 4 bytes: y travel term, integer kept in 0..223
!st_age240  = !SB+$068            ; sky clock modulo 240
!st_rr      = !SB+$06A            ; r^2 of the culling globe
!s_kgen     = !SB+$06C            ; culling generation (bumped when the square moves)
!s_kx       = !SB+$06E            ; globe the culling square was set for
!s_ky       = !SB+$070
!s_kr       = !SB+$072
!s_cxb      = !SB+$074            ; culling centre and half side (0: no culling)
!s_cyb      = !SB+$076
!s_qb       = !SB+$078
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

; Window blocks (4 bytes per row, rows -R..R, R <= 108) and the empty record.
!gb_empty = !SB+$0F8              ; 4 bytes: empty windows
!gb_wina  = !SB+$100              ; 868 bytes
!gb_winb  = !SB+$480              ; 868 bytes (ends $7E4 < $800)
!GB_WIN_MAX = 217
; Indirect HDMA tables: per set M7A, M7D, windows (16 bytes each).
!IT_BASE  = !SB+$800
!IT_SIZE  = $30
!it_m7a   = $00
!it_m7d   = $10
!it_win   = $20

!hb_mode    = !SB+$860            ; BGMODE ($2105) table, 16 bytes (static per text band)
!SB_STARS   = !SB+$870            ; star lists: 3 count words, then the entries
!s_lists    = !SB_STARS           ; bytes in list d at s_lists + d*2 - 2
!s_list1    = !SB_STARS+$008      ; depth 1 (44 x 4)
!s_list2    = !SB_STARS+$0C0      ; depth 2 (53 x 4)
!s_list3    = !SB_STARS+$1A0      ; depth 3 (3 x 4, bright)
!SB_END     = !SB+$A80            ; the fight's state follows
assert !SB_END <= $8000, "orbit scene block overflow"

; HDMA channels the scene programs (bits in the game's shadow $2C).
!ORBIT_HDMA = $5C                  ; channels 2 (BGMODE), 3 (M7A), 4 (M7D), 6 (windows)

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
orbit_star_tiles:
	; 32 tiles (OBJ rows $16x and $17x): dots of shades 0-3 at even columns
	; 0-6, twinkle crosses at 8-14 (centre at 1,1); odd columns and the second
	; row stay empty so each 16x16 sprite shows only its own star.
	incbin "orbit/star_tiles.bin"
orbit_data_end:
assert orbit_data_end <= !DATA_ORBIT+$8000, "orbit data bank overflow"
org $F60000
orbit_globe_vram: incbin "orbit/globe_vram.bin"
org $F70000
orbit_fight_lines: incbin "orbit/fight_lines.bin"
pullpc

pushpc
org !CODE_ORBIT
orbit_code_start:
incsrc "scene.asm"
incsrc "globe.asm"
incsrc "stars.asm"
orbit_code_end:
assert orbit_code_end <= !CODE_ORBIT+$8000, "orbit code bank overflow"
pullpc
