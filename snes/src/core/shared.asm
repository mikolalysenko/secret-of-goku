; Cross-module state contracts. Owned by integration; modules request
; additions in their docs/agents/snes-port/<module>.md "Core requests".
;
; Persistent block: !SRAM_LIVE ($31:6000, $400 bytes) is the live copy of all
; Goku-specific progress. Core copies it to/from per-slot sidecars when the
; native GAME FILE is saved/loaded and clears it for a new game. Modules keep
; their persistent fields inside their sub-range only. After a load from a
; save without a valid sidecar (older or foreign saves), the block is all
; zero, so !persist_version = 0 marks "derive what you can from native flags".
!PERSIST_CORE    = !SRAM_LIVE+$000   ; $40  version, goku_active, options
!PERSIST_STORY   = !SRAM_LIVE+$040   ; $C0  quest ledger, crisis, ending rules, remark latches
!PERSIST_DESTROY = !SRAM_LIVE+$100   ; $80  craters, broken gates/barriers, demolished walls
!PERSIST_FRIEZA  = !SRAM_LIVE+$180   ; $80  Frieza / Vegeta / orbit progress
!PERSIST_COMBAT  = !SRAM_LIVE+$200   ; $80  form, power intro, Kai remark counters, scouter
!PERSIST_FLIGHT  = !SRAM_LIVE+$280   ; $80  flight / teleport progress:
!PERSIST_WORLD   = !SRAM_LIVE+$280   ;   $40 world-flight module (craters, cloud barrier, Fortress)
!PERSIST_GROUND  = !SRAM_LIVE+$2C0   ;   $40 ground flight / teleport / escapes
!PERSIST_MISC    = !SRAM_LIVE+$300   ; $100 title / arrival / audio / misc

; Shared persistent fields (byte unless noted).
!persist_version     = !PERSIST_CORE+$00 ; layout version: 1 after a new game; 0 = legacy save without sidecar
!persist_goku_active = !PERSIST_CORE+$01 ; 1 once Goku has replaced the boy (arrival impact)
!persist_ssj_lock    = !PERSIST_CORE+$02 ; 1 after the permanent Frieza-story transformation
!persist_scouter     = !PERSIST_CORE+$03 ; bit0 owned (Sylphid), bit1 enabled
!persist_magic       = !PERSIST_CORE+$3E ; word 'GK' ($4B47): written by this cartridge; boot clears a block without it

; Volatile SRAM work areas (contents undefined at boot; owners clear them).
!SRAM_WORK_CORE   = $317480   ; $0180 core / misc (through $3175FF)
!SRAM_WORK_GOKU   = $317520   ; $0043 secondary water-flight palette, after core's $A0-byte block;
                              ;   +$42 the scripted-pose latch
!SRAM_WORK_PARTY  = $317564   ; $0008 deferred companion work, after the water palette
!SRAM_WORK_FX_HASH = $31756C  ; $0080 resident-cell hints, after the companion queue
!SRAM_WORK_ENEMY = $3175EC   ; $0008 deferred airborne enemy AI/animation
!SRAM_WORK_ACTOR_HOLD = $3175F4 ; $0002 the field frame whose vblank skips the game's actor cells (core_actor_cells)
!SRAM_WORK_FRIEZA_CG = $3175F6  ; $000A Frieza's OBJ colours for the palette transfer: the set the last
                                ;   field frame published and its frame, the set on screen and its
                                ;   frame, and whether either is set (frieza_cgram_upload)
!SRAM_WORK_DEBUG  = $317600   ; $0200 debug scene select (through $3177FF)
assert !SRAM_WORK_GOKU+$43 <= !SRAM_WORK_PARTY, "companion queue overlaps Goku's water palette"
assert !SRAM_WORK_PARTY+8 <= !SRAM_WORK_FX_HASH, "companion queue overlaps FX hints"
assert !SRAM_WORK_FX_HASH+$80 <= !SRAM_WORK_ENEMY, "FX hints overlap enemy queue"
assert !SRAM_WORK_ENEMY+8 <= !SRAM_WORK_ACTOR_HOLD, "enemy queue overlaps the actor hold"
assert !SRAM_WORK_ACTOR_HOLD+2 <= !SRAM_WORK_FRIEZA_CG, "actor hold overlaps Frieza's colours"
assert !SRAM_WORK_FRIEZA_CG+10 <= !SRAM_WORK_DEBUG, "Frieza's colours overlap debug state"
!SRAM_WORK_FX     = $317800   ; $0400 effects library slots (beams, sparks, orbs, auras)
!SRAM_WORK_COMBAT = $317C00   ; $0400 combat tables (projectiles, launches, per-target timers)
!SRAM_WORK_SCENE  = $326000   ; $2000 set-piece scenes (Frieza, orbit, endings, Vegeta, the Sandship's
                               ; $32:7600-7FFF) — one scene at a time: core_scene_claim / _release
; Scene work owner ids (core_scene_claim).
!SCENE_FRIEZA   = 1
!SCENE_ORBIT    = 2
!SCENE_ENDING   = 3
!SCENE_VEGETA   = 4
!SCENE_SANDSHIP = 5
!SRAM_WORK_STORY  = $336000   ; $1000 story runtime
!SRAM_WORK_DESTROY = $337000  ; $0800 destruction
!SRAM_WORK_FLIGHT = $337800   ; $0400 flight / traversal
!SRAM_WORK_UI     = $337C00   ; $0400 UI text staging (telepathy, radar, scouter, status)
