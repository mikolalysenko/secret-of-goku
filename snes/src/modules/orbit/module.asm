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

!OS_OFF     = $00
!OS_LOADING = $01                 ; art uploads; picture held black
!OS_LIVE    = $02
!OS_STOP    = $03                 ; restore the field on the next vblank

!OC_NONE      = $00
!OC_TEST_GLOBE = $01              ; tests: show the globe with the camera in the scene block
!OC_STOP      = $02
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
!s_left     = !SB+$06A            ; stars left in this frame's rebuild step
!s_kgen     = !SB+$06C            ; culling generation (bumped when the globe changes)
!s_bpos     = !SB+$06E            ; rebuild: next star (x4)
!s_bend     = !SB+$070            ;   end of the depth's stars (x4)
!s_bout     = !SB+$072            ;   next list entry
!s_ctop     = !SB+$074            ;   culling: line of the first rim row
!s_cn       = !SB+$076            ;   rows (0: none)
!s_cblk     = !SB+$078            ;   window block (bank $32)
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
!f_won      = !FB+$78              ; clash requested (HP at the 6,000 floor)
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
!FIGHT_END  = !FB+$240
!f_vbl      = !FB+$240             ; combat's field vblank count at the last step
!f_steps    = !FB+$242             ; fight steps this frame
!f_menus    = !FB+$244             ; ring + menu frames seen (a change: no catch-up)
!ORBIT_COMBAT_OWNER = $0100        ; owner bit for combat's input lock and danger
assert !FIGHT_END <= !SB+$D00, "orbit fight block overflow"

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
!d_sx       = !DB+$1A              ; burst mirror flags (bit 0: x mirrored, bit 1: y)
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
!DRAW_END   = !DB+$40
assert !DRAW_END <= $8000, "orbit draw block overflow"

; OBJ VRAM the scene owns while it shows (name base $6000, 16/32 sizes).
!OV_FRIEZA = $000                  ; 32x32, dynamic
!OV_D32    = $004                  ; 32x32, dynamic
!OV_GOKU   = $088                  ; 16x16, dynamic
!OV_D16    = $08A                  ; 16x16, dynamic
; Sprite attributes (high byte of the OAM tile word): palette << 9, priority << 12.
!OA_PRI    = $2000                 ; priority 2 (over the Mode 7 globe)
!OA_HFLIP  = $4000
!OA_VFLIP  = $8000

!WK_BEAM  = 1
!WK_LASER = 2
!WK_DISC  = 3
!WK_ORB   = 4

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
incsrc "orbit-sprites/palettes.asm"
orbit_star_tiles:
	; 32 tiles (OBJ rows $16x and $17x): dots of shades 0-3 at even columns
	; 0-6, twinkle crosses at 8-14 (centre at 1,1); odd columns and the second
	; row stay empty so each 16x16 sprite shows only its own star.
	incbin "orbit/star_tiles.bin"
incsrc "orbit-fx/data.asm"
orbit_data_end:
assert orbit_data_end <= !DATA_ORBIT+$8000, "orbit data bank overflow"
org $F60000
orbit_globe_vram: incbin "orbit/globe_vram.bin"
org $F70000
orbit_fight_lines: incbin "orbit/fight_lines.bin"
orbit_fx_vram_a:  incbin "orbit-fx/vram_a.bin"   ; OBJ tiles $080-$0FF
orbit_fx_vram_b:  incbin "orbit-fx/vram_b.bin"   ; $100-$13F
orbit_fx_vram_c:  incbin "orbit-fx/vram_c.bin"   ; $180-$1BF
orbit_fx_death:   incbin "orbit-fx/death.bin"    ; Death Balls: 12 x 32x32, 12 x 16x16
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
orbit_code_end:
assert orbit_code_end <= !CODE_ORBIT+$8000, "orbit code bank overflow"
pullpc
