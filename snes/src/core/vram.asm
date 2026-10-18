; OBJ VRAM regions for module graphics (included by core.asm).
;
; The game streams every actor's current animation cells into fixed OBJ
; VRAM per actor slot (C1:950D, NMI, 5-phase round robin) and loads the
; HUD/ring/shadow/number cells into the low tiles, so the field has no OBJ
; VRAM that is free by construction. The regions below were never displayed
; or written in 299 sampled field states / 19 world-flight states (see
; engine.md); a module claims one before streaming into it with
; core_queue_vram, which keeps two modules apart. The field regions belong
; to actor slots that are rarely active (verify in crowded scenes); the
; hero region is for a module that also redirects the hero's own streaming.
;
; core_vram_claim:   A16 = region, X16 = owner id (1-255). Carry set if
;                    another owner holds it. Returns Y16 = VRAM word address.
; core_vram_release: A16 = region, X16 = owner id.
; Claims survive mode changes and are cleared at the title.

!VRAM_WORLD_OBJ_A = 0   ; world: OBJ tiles $060-$0FF, VRAM $6600-$6FFF (160 8x8 tiles)
!VRAM_WORLD_OBJ_B = 1   ; world: OBJ tiles $110-$17F, VRAM $7100-$77FF (112 tiles)
!VRAM_FIELD_OBJ_A = 2   ; field: tiles $122-$12F + $132-$13F, VRAM $7220/$7320 (7 16x16 cells)
!VRAM_FIELD_OBJ_B = 3   ; field: tiles $184-$18B + $194-$19B, VRAM $7840/$7940 (4 cells)
!VRAM_FIELD_OBJ_C = 4   ; field: tiles $1A8-$1AF + $1B8-$1BF, VRAM $7A80/$7B80 (4 cells)
!VRAM_FIELD_HERO  = 5   ; field: hero cells $1C0-$1C7 + $1D0-$1D7, VRAM $7C00/$7D00 (4 cells)
!VRAM_WORLD_OBJ_C = 6   ; world: OBJ tiles $190-$1FF, VRAM $7900-$7FFF (112 tiles)
; Scene-scoped regions: free only inside the set pieces named here. The
; claimer holds them from its first upload until its scene ends or the map
; changes (then releases), and re-uploads after every map load.
!VRAM_SCENE_OBJ   = 7   ; field set pieces: OBJ tiles $0C0-$0FF, VRAM $6C00-$6FFF (64 tiles).
                        ; Native actor slots other than the hero's stream here (C1:9FB4-A3E4,
                        ; C1:A709-A78D/AF7F-AFDF); idle in the Frieza scenes on maps 246, 255,
                        ; 418, 431, 237, 253, 195 and the Tree vista (236). Not a general field region.
!VRAM_SCENE_BG    = 8   ; maps 246 and 255 only: BG1/BG2 tiles $1C0-$1CF (char base $0000),
                        ; VRAM $1C00-$1CFF; unused by graphics set 21 and map 255's set, safe once
                        ; the map's own load finished.
!VRAM_REGIONS     = 9

core_vram_base:
	dw $6600, $7100, $7220, $7840, $7A80, $7C00, $7900, $6C00, $1C00

core_vram_claim:
	CMP.w #!VRAM_REGIONS
	BCS .no
	ASL
	PHX
	TAX
	LDA.w !core_vram_owner&$FFFF,X
	BEQ .take
	CMP $01,S
	BEQ .mine
	PLX
.no
	SEC
	RTL
.take
	LDA $01,S
	STA.w !core_vram_owner&$FFFF,X
.mine
	LDA.l core_vram_base,X
	TAY
	PLX
	CLC
	RTL

core_vram_release:
	CMP.w #!VRAM_REGIONS
	BCS .done
	ASL
	PHX
	TAX
	LDA.w !core_vram_owner&$FFFF,X
	CMP $01,S
	BNE .notMine
	STZ.w !core_vram_owner&$FFFF,X
.notMine
	PLX
.done
	RTL
