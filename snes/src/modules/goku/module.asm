; GOKU module: Goku's field sprite, animation, palettes, portraits and forms.
; Replaces the boy (actor 0, WRAM $7E:E000) once !persist_goku_active is set.
;
; Resources (see docs/agents/snes-port/goku.md):
;   code  $A1:8000-FFFF (!CODE_GOKU)      data  $E1:0000-7FFF (!DATA_GOKU)
;   tiles $F8-$FA:0000 (deduplicated 8x8 4bpp), plus packed DMA rows in xdata
;   WRAM  $7E:D740-D7FF (!RAM_GOKU, $C0 bytes)
;   VRAM  OBJ tiles C0-C7/D0-D7 (word $7C00-$7D7F, the boy's own slot),
;         HUD portrait E8/E9/F8/F9 (word $7E80/$7F80), ring marker 0A/0B/1A/1B;
;         in full-screen menus, OBJ table 2 tiles C0-C9/D0-D9 (word $5C00-$5D9F)
;   CGRAM OBJ palette 1 (and 5 when it carries the boy's water copy), via
;         the game's own palette buffer at $7E:0600.
;   DMA   channel 7 for packed cells in field NMI; channels 4-7 when
;         restoring the boy and for menu figures (menu.asm).
;   OAM   menus: entries 120-127 and the native figure's, edited in the PPU.

; ---------------------------------------------------------------------------
; WRAM (!RAM_GOKU = $7ED740, $C0 bytes). The defines below are 16-bit bank
; $7E addresses (module code runs with DB = $7E); other modules may use them
; the same way or with long addressing as $7E0000|<define>.
!GOKU_RAM = $D740             ; plain literal so asar picks absolute addressing
assert !RAM_GOKU == $7E0000|!GOKU_RAM, "!GOKU_RAM must match !RAM_GOKU"
; Public fields (written by other modules; see api.asm):
!goku_form        = !GOKU_RAM+$00   ; byte: 0 base, 1 Super Saiyan
!goku_ctl         = !GOKU_RAM+$01   ; byte: GOKU_CTL_* bits
!goku_act         = !GOKU_RAM+$02   ; byte: current action kind (GOKU_K_*), 0 = none
!goku_act_facing  = !GOKU_RAM+$03   ; byte: action facing 0 down,1 right,2 left,3 up
!goku_act_age     = !GOKU_RAM+$04   ; word: action age in frames (owner advances it)
!goku_act_arg     = !GOKU_RAM+$06   ; byte: combo (punch), hand (blast); bit7 = Super Saiyan art
!goku_act_dur     = !GOKU_RAM+$07   ; byte: action duration (beam, transform, revert)
!goku_mode        = !GOKU_RAM+$08   ; byte: traversal/reaction mode (GOKU_K_*), 0 = none
!goku_mode_facing = !GOKU_RAM+$09   ; byte: facing for reaction modes
!goku_mode_age    = !GOKU_RAM+$0A   ; word: mode age (owner advances it)
!goku_lift        = !GOKU_RAM+$0C   ; word: extra lift in pixels (local hover)
!goku_cell_req    = !GOKU_RAM+$0E   ; word: explicit cell override, cell id + 1 (0 = none)
; Pose state (engine/goku-animation.js state)
!st_frame         = !GOKU_RAM+$10   ; word
!st_map           = !GOKU_RAM+$12   ; word
!st_x             = !GOKU_RAM+$14   ; word
!st_y             = !GOKU_RAM+$16   ; word
!st_acc6          = !GOKU_RAM+$18   ; word 8.8: distance modulo 6 px
!st_acc16         = !GOKU_RAM+$1A   ; word 8.8: distance modulo 16 px
!st_step4         = !GOKU_RAM+$1C   ; byte: floor(distance/6) & 3
!st_step2         = !GOKU_RAM+$1D   ; byte: floor(distance/16) & 1
!st_moved         = !GOKU_RAM+$1E   ; byte: accumulated distance > 0
!st_kind          = !GOKU_RAM+$1F   ; byte
!st_age           = !GOKU_RAM+$20   ; word
!st_stat          = !GOKU_RAM+$22   ; word: stationary frames (saturating)
!st_blocked       = !GOKU_RAM+$24   ; byte
!st_facing        = !GOKU_RAM+$25   ; byte
; Per-frame pose result
!p_facing         = !GOKU_RAM+$26   ; byte: m.facing
!p_row            = !GOKU_RAM+$27   ; byte: source row for the facing
!p_kind           = !GOKU_RAM+$28   ; byte
!p_flags          = !GOKU_RAM+$29   ; byte: GOKU_PF_*
!p_cell           = !GOKU_RAM+$2A   ; word
!p_lift           = !GOKU_RAM+$2C   ; word: extra lift (signed)
!p_sheet          = !GOKU_RAM+$2E   ; byte
!p_col            = !GOKU_RAM+$2F   ; byte
!p_rowout         = !GOKU_RAM+$30   ; byte
!p_var            = !GOKU_RAM+$31   ; byte: 0 plain, 1 shuffle, 2 legs, $80|beat push
!p_dist           = !GOKU_RAM+$32   ; word 8.8 distance this frame
!p_native         = !GOKU_RAM+$34   ; byte: native action id+1 when validated, 0 none
!p_newframe       = !GOKU_RAM+$35   ; byte
!p_age            = !GOKU_RAM+$36   ; word
!p_use_native     = !GOKU_RAM+$38   ; byte
!p_can_attack     = !GOKU_RAM+$39   ; byte
!p_tmp            = !GOKU_RAM+$3A   ; 6 bytes scratch
; Upload state
!vram_cell        = !GOKU_RAM+$40   ; word: cell in the boy's VRAM slot, $FFFF unknown
!up_cell          = !GOKU_RAM+$42   ; word: cell to upload in this vblank, $FFFF none
!up_small         = !GOKU_RAM+$44   ; byte: upload the 16x16 miniature
!up_flags         = !GOKU_RAM+$45   ; byte: GOKU_UP_*
!replacing        = !GOKU_RAM+$46   ; byte: Goku stands in for the boy (this frame)
!was_replacing    = !GOKU_RAM+$47   ; byte
!cur_pal          = !GOKU_RAM+$48   ; byte: palette id of the displayed cell
!hud_form         = !GOKU_RAM+$49   ; byte: form+1 drawn into the HUD portrait, 0 = the game's
!vram_small       = !GOKU_RAM+$4A   ; byte: VRAM slot holds the miniature
!pal_valid        = !GOKU_RAM+$4B   ; byte: shadow palette tracking valid
!pal_id_out       = !GOKU_RAM+$4C   ; byte: palette id last substituted
!pal_status       = !GOKU_RAM+$4D   ; byte: status code last substituted
!shadow_hidden    = !GOKU_RAM+$4E   ; byte: hide actor 0's shadow this frame
!rec_shadow       = !GOKU_RAM+$4F   ; byte: OAM slot of actor 0's shadow this frame ($FF none)
!pal_native       = !GOKU_RAM+$50   ; 16 words: what the game wrote to palette 1 (entry 0 unused:)
!rec_body0        = !GOKU_RAM+$50   ;   byte: first OAM slot of Goku's body this frame
!rec_body1        = !GOKU_RAM+$51   ;   byte: slot after it
!pal_out          = !GOKU_RAM+$70   ; 16 words: what we last wrote to palette 1 (entry 0 unused:)
!rec_stamp        = !GOKU_RAM+$70   ;   byte: !core_frame (low) when the slots were recorded
!scr_shown        = !GOKU_RAM+$71   ;   byte: goku_api_scripted drew this frame (goku_frame clears it)
!pal_work         = !GOKU_RAM+$90   ; 16 words: scratch (palette build; OAM emit; menu state, menu.asm)
; Scratch shared by pose, emit and palette code (never live across calls)
!t_age            = !p_tmp+0        ; word: age argument for pose_track
!t_row            = !p_tmp+2        ; byte: caller row for pose_track / native phases
!t_clip           = !p_tmp+3        ; byte
!t_a              = !p_tmp+4        ; word
!t_b              = !GOKU_RAM+$B0   ; word
!t_c              = !GOKU_RAM+$B2   ; word
!t_ptr            = !GOKU_RAM+$B4   ; word: offset of the native action in goku_action_data
!t_d              = !GOKU_RAM+$B6   ; word
!div_d            = !GOKU_RAM+$B8   ; word: goku_div16 divisor
!div_r            = !GOKU_RAM+$BA   ; word: goku_div16 remainder
!goku_inited      = !GOKU_RAM+$BC   ; byte: state initialised
!pal_slot         = !GOKU_RAM+$BD   ; byte: OBJ palette tracked (1, or 5 on water maps), 0 none
!pal_stone        = !GOKU_RAM+$BE   ; byte: petrify bit at the last palette build
!st_blink         = !GOKU_RAM+$BF   ; byte: pose age modulo 180 (idle blink clock)
!GOKU_RAM_END     = !GOKU_RAM+$C0
!pal_air_native  = !SRAM_WORK_GOKU
!pal_air_out     = !SRAM_WORK_GOKU+$20
!pal_air_valid   = !SRAM_WORK_GOKU+$40
assert !GOKU_RAM_END <= !GOKU_RAM+$C0, "goku RAM overflow"
; goku_emit scratch (aliases pal_work: never live at the same time)
!e_attr = !pal_work+$00
!e_feet = !pal_work+$02
!e_y    = !pal_work+$04
!e_x    = !pal_work+$06
!e_tile = !pal_work+$08
!e_mask = !pal_work+$0A
!e_top  = !pal_work+$0C
!e_q    = !pal_work+$0E

; goku_ctl bits (other modules set these)
!GOKU_CTL_SUPPRESS  = $01   ; keep the native boy (e.g. ending's revived Randi)
!GOKU_CTL_AIRBORNE  = $02   ; airborne: priority 3, palette 1 (no water colour math)
!GOKU_CTL_HIDE      = $04   ; hide Goku's body (and his shadow)
!GOKU_CTL_LOCALFLY  = $08   ; local flight active (hover pose rules)
!GOKU_CTL_HIDESHADOW = $10  ; hide only the shadow

; p_flags
!GOKU_PF_HIDDEN = $01
!GOKU_PF_SMALL  = $02

; up_flags
!GOKU_UP_HUD     = $01  ; re-upload the HUD portrait
!GOKU_UP_NATIVE  = $02  ; restore the boy's native tiles (replacement ended)
!GOKU_UP_REFRESH = $04  ; every eighth party refresh: re-send the cell (safety net)
!GOKU_UP_WAITED  = $08  ; the pending cell already waited a frame for vblank room
!GOKU_UP_COMPAT  = $10  ; main thread proved the pending pose has the resident size/palette
!GOKU_UP_COUNT1  = $20  ; bits 5-7 count the game's 5-frame party refreshes

; Pose kinds (engine/goku-animation.js kind strings). Native action keys
; that are not generic kinds use $80 | key index (see goku_action_data).
!GOKU_K_IDLE       = $00
!GOKU_K_WALK       = $01
!GOKU_K_RUN        = $02
!GOKU_K_PUSH       = $03
!GOKU_K_GUARD      = $04
!GOKU_K_FALL       = $05
!GOKU_K_RECOVER    = $06
!GOKU_K_CELEBRATE  = $07
!GOKU_K_JUMP       = $08
!GOKU_K_SWORDPULL  = $09
!GOKU_K_DEAD       = $0A
!GOKU_K_SLEEP      = $0B
!GOKU_K_HURT       = $0C
; action kinds (goku_act)
!GOKU_K_PUNCH      = $10   ; arg: combo 0-2 (+$80 SSJ art), age: action age
!GOKU_K_CHARGE     = $11
!GOKU_K_BEAM       = $12   ; dur: beam duration
!GOKU_K_BLAST      = $13   ; arg: hand 0/1
!GOKU_K_TELEPORT   = $14
!GOKU_K_TRANSFORM  = $15   ; dur: transformation length (32)
!GOKU_K_REVERT     = $16   ; dur: reversion length (20)
!GOKU_K_READY      = $17
!GOKU_K_FOCUS      = $18
!GOKU_K_AIRBEAM    = $19   ; world flight only (no field pose: the flight module requests cells)
; mode kinds (goku_mode)
!GOKU_K_DEFLECT    = $20   ; reaction, facing = goku_mode_facing
!GOKU_K_RESIST     = $21
!GOKU_K_HOVER      = $22
!GOKU_K_GAPFLIGHT  = $23
!GOKU_K_RESCUEDIVE = $24
!GOKU_K_CEILING    = $25   ; age: ceiling escape pose age
!GOKU_K_TAKEOFF    = $26   ; age: transition age
!GOKU_K_LANDING    = $27
!GOKU_K_ALTARRUN   = $28

!GOKU_NONE = $FFFF
!GOKU_OWNER = $01        ; owner id for core_vram_claim (module bank E1)

; Generated tables and tiles
pushpc
org !DATA_GOKU
incsrc "goku/data.asm"
goku_data_end:
assert goku_data_end <= !DATA_GOKU+$8000, "goku data bank overflow"
org $F80000
goku_tiles0:
incbin "goku/tiles0.bin"
if !GOKU_TILE_BANKS > 1
org $F90000
incbin "goku/tiles1.bin"
endif
if !GOKU_TILE_BANKS > 2
org $FA0000
incbin "goku/tiles2.bin"
endif
if !GOKU_TILE_BANKS > 3
org $FB0000
incbin "goku/tiles3.bin"
endif
assert !GOKU_TILE_BANKS <= 4, "goku tiles exceed banks F8-FB"
pullpc

pushpc
org !CODE_GOKU
goku_code_start:
incsrc "body.asm"
incsrc "pose.asm"
incsrc "palette.asm"
incsrc "upload.asm"
incsrc "api.asm"
incsrc "menu.asm"
goku_code_end:
assert goku_code_end <= !CODE_QUARTER_GOKU, "goku code overflow (E1:C000-FFFF is a spare quarter, core/layout.asm)"
pullpc

; ---------------------------------------------------------------------------
; Original-code hooks
; Body OAM for every actor (C0:E5E0, actor offset in X, M8/X16, DB=$7E):
;   REP #$20 / LDA $E083,X / AND #$000F / STA $02 / BEQ $E5DF
%orig4($C0E5E0, $83BD20C2)
%orig4($C0E5E4, $000F29E0)
%orig4($C0E5E8, $F3F00285)
%hijack($C0E5E0, goku_body_hook, 12, goku)
; Attachments (C0:E553): LDA $E024,X / BPL $E565
%orig4($C0E553, $10E024BD)
%orig1($C0E557, $0D)
%hijack($C0E553, goku_attach_hook, 5, goku)
; Shadow (C0:E760): SEP #$20 / LDY #$FFF8
%orig4($C0E760, $F8A020E2)
%orig1($C0E764, $FF)
%hijack($C0E760, goku_shadow_hook, 5, goku)
; Party tile upload in the field NMI, boy part (C1:95BC): LDA $7EE083
%orig4($C195BC, $7EE083AF)
%hijack($C195BC, goku_upload_hook, 4, goku)
; Ring set-up graphics (C0:66BD): JSL $D0CDF9, then Goku's ring marker
%orig4($C066BD, $D0CDF922)
%hijack_jsl($C066BD, goku_ring_setup, 4, goku)
; HUD portrait upload, boy part (C1:E6C4): LDA $7EE180
%orig4($C1E6C4, $7EE180AF)
%hijack($C1E6C4, goku_hud_hook, 4, goku)
