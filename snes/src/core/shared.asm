; Cross-module state contracts. Owned by integration; modules request
; additions in their docs/agents/snes-port/<module>.md "Core requests".
;
; Persistent block: !SRAM_LIVE ($31:6800, $400 bytes) is the live copy of all
; Goku-specific progress. Core copies it to/from per-slot sidecars when the
; native GAME FILE is saved/loaded and clears it for a new game. Modules keep
; their persistent fields inside their sub-range only.
!PERSIST_CORE    = !SRAM_LIVE+$000   ; $40  version, goku_active, options
!PERSIST_STORY   = !SRAM_LIVE+$040   ; $C0  quest ledger, crisis, ending rules, remark latches
!PERSIST_DESTROY = !SRAM_LIVE+$100   ; $80  craters, broken gates/barriers, demolished walls
!PERSIST_FRIEZA  = !SRAM_LIVE+$180   ; $80  Frieza / Vegeta / orbit progress
!PERSIST_COMBAT  = !SRAM_LIVE+$200   ; $80  form, power intro, Kai remark counters, scouter
!PERSIST_FLIGHT  = !SRAM_LIVE+$280   ; $80  flight / teleport progress
!PERSIST_MISC    = !SRAM_LIVE+$300   ; $100 title / arrival / audio / misc

; Shared persistent fields (byte unless noted).
!persist_version     = !PERSIST_CORE+$00 ; layout version, nonzero once initialised
!persist_goku_active = !PERSIST_CORE+$01 ; 1 once Goku has replaced the boy (arrival impact)
!persist_ssj_lock    = !PERSIST_CORE+$02 ; 1 after the permanent Frieza-story transformation
!persist_scouter     = !PERSIST_CORE+$03 ; bit0 owned (Sylphid), bit1 enabled

; Volatile SRAM work areas (contents undefined at boot; owners clear them).
!SRAM_WORK_CORE   = $317000   ; $1000 core / misc
!SRAM_WORK_SCENE  = $326000   ; $2000 set-piece scenes (Frieza, orbit, endings, Vegeta) — one scene at a time
!SRAM_WORK_STORY  = $336000   ; $1000 story runtime
!SRAM_WORK_DESTROY = $337000  ; $0800 destruction
!SRAM_WORK_FLIGHT = $337800   ; $0800 flight / traversal
