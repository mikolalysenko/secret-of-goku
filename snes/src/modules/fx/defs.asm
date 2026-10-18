; FX module public definitions (docs/agents/snes-port/fx.md). Defines only,
; no code or labels: clients may incsrc this file themselves. !FX_DRAWS
; (draw entries per frame) is defined by module.asm, so it also tells a
; client that the real library is in the build.

; Request block (SRAM, write with long addressing before fx_spawn / fx_draw /
; fx_beam; read by the next call, never cleared).
!FX_SRAM   = $317800        ; == !SRAM_WORK_FX
!fx_dir    = !FX_SRAM+$00   ; byte: facing 0 down,1 right,2 left,3 up; heading 0-15 with FX_F_HEADING
!fx_style  = !FX_SRAM+$01   ; byte: kind-specific style / tone / variant
!fx_a      = !FX_SRAM+$02   ; word: kind argument A
!fx_b      = !FX_SRAM+$04   ; word: kind argument B
!fx_c      = !FX_SRAM+$06   ; word: kind argument C
!fx_t      = !FX_SRAM+$08   ; word: client clock / age for continuous draws and beams
!fx_rgb    = !FX_SRAM+$0A   ; 3 words: caller colours (BGR555) for FX_DEBRIS: dark, mid, light

; Flags (high byte of A)
!FX_F_SCREEN  = $01         ; X/Y are screen pixels (default: map pixels)
!FX_F_GOLD    = $02         ; Lucid Barrier gold variant
!FX_F_FRONT   = $04         ; in front of native sprites
!FX_F_BACK    = $08         ; force behind native sprites
!FX_F_HEADING = $10         ; !fx_dir is a 16-step heading
!FX_F_SSJ     = $20         ; Super Saiyan geometry (beam bands +2)
!FX_F_PINK    = $40         ; Frieza's magenta ramp
!FX_F_GOKU    = $80         ; anchor at Goku (hand socket / body); X/Y = offset

; Timed kinds (fx_spawn)
!FX_IMPACT    = $01         ; impact spark
!FX_KI        = $02         ; ki shot
!FX_BURST     = $03         ; transformation blast ring
!FX_EXPLODE   = $04         ; Exploder burst
!FX_EMBER     = $05         ; Fireball ember
!FX_DETONATE  = $06         ; beam detonation cluster
!FX_STATUS    = $07         ; status recovery burst (style 0 plain,1 fire,2 ice,3 balloon)
!FX_DEBRIS    = $08         ; rubble chunks in caller colours
!FX_SPARKS    = $09         ; ring of impact sparks
; Continuous kinds (fx_draw)
!FX_ORB       = $10         ; charge orb
!FX_AURA      = $11         ; ki aura (style 0 blue,1 gold,2 pink)
!FX_LIGHTNING = $12         ; SSJ charge lightning
!FX_DEATHBALL = $13         ; Death Ball (FX_DBALL_BATTLE / FX_DBALL_CINEMATIC)
!FX_DISC      = $14         ; Frieza's Death Disc
!FX_FINGER    = $15         ; finger-laser charge glint
!FX_CELL      = $16         ; any native spell cell
!FX_DBALL_BATTLE = 0
!FX_DBALL_CINEMATIC = 1     ; red planet killer, browser cinematic 64 px art
; FX_CELL groups (!fx_a)
!FX_G_ORB       = 0
!FX_G_BODY      = 1
!FX_G_HEAD      = 2
!FX_G_IMPACT    = 3
!FX_G_LIGHTNING = 4
!FX_G_LIMPACT   = 5
!FX_G_GSPARK    = 6
!FX_G_GARC      = 7
!FX_G_AARC      = 8
!FX_G_BURST     = 9
!FX_G_EMBER     = 10
; Beam styles (fx_beam)
!FX_BEAM_KAME   = $00
!FX_BEAM_WAVE   = $01
!FX_BEAM_FINAL  = $02
!FX_BEAM_GALICK = $03
!FX_BEAM_FRIEZA = $04
!FX_BEAM_LASER  = $05
!FX_BEAM_FIRE   = $06

!FX_OWNER = $0E             ; core_vram_claim owner id (module bank EE)
