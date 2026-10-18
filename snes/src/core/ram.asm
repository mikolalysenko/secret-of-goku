; RAM allocation. Original WRAM is almost fully used; the only regions never
; touched across 321 replayed states (snes/tools/wram-usage.mjs) are
; 7E:D6D3-DDFF, 7E:6E40-6FFF and 7E:7E40-7FFF. snes/test/core re-checks them
; with write watches from power-on through the opening.
; Large buffers and persistent mod state live in the added SRAM.
;
; WRAM 7E:D700-DDFF (1792 bytes): hot runtime state, per module:
!WRAM_BASE    = $7ED700
!RAM_CORE     = $7ED700   ; 0x40  core flags, frame counters, input edges
!RAM_GOKU     = $7ED740   ; 0xC0  sprite/animation
!RAM_COMBAT   = $7ED800   ; 0x100 combat
!RAM_FLIGHT   = $7ED900   ; 0x80  flight / traversal
!RAM_DESTROY  = $7ED980   ; 0x80  destruction
!RAM_STORY    = $7EDA00   ; 0x100 story runtime
!RAM_FRIEZA   = $7EDB00   ; 0x0C0 Frieza fights / scenes
!RAM_VEGETA   = $7EDBC0   ; 0x040 Vegeta trial (plus !SRAM_WORK_SCENE while it runs)
!RAM_ORBIT    = $7EDC00   ; 0x100 orbit / cinematics ($00-$7F) and endings ($80-$FF)
!RAM_AUDIO    = $7EDD00   ; 0x80  audio
!RAM_MISC     = $7EDD80   ; 0x80  title / arrival / misc
!WRAM_END     = $7EDE00
;
; WRAM 7E:6E40-6FFF (448 bytes): core queues and staging (core/core.asm).
!RAM_CORE_EXT = $7E6E40
!RAM_CORE_EXT_END = $7E7000
; WRAM 7E:7E40-7FFF (448 bytes): UI block, then spare.
!RAM_UI       = $7E7E40   ; 0xC0 telepathy box, radar, scouter, status, fast-forward
!RAM_WORLD    = $7E7F00   ; 0x100 world-flight module (Mode 7 powers)
!RAM_SPARE    = $7E7F00   ; (alias kept for older references; owned by world)
!RAM_SPARE_END = $7E8000
;
; SRAM (battery backed, 32 KiB total, HiROM banks 30-33:6000-7FFF):
;   $30:6000-7FFF original saves: 4 records of $2BC at $400 strides, their
;                 backups at +$1000, last slot at $30:7FFF. Never touched.
;   $31:6000-747F persistent Goku state: live block + one sidecar per slot.
;   $31:7480-$33:7FFF volatile work buffers (contents undefined at boot).
!SRAM_PERSIST   = $316000
!SRAM_LIVE      = $316000   ; $400 live persistent story state (copied to a slot sidecar on save)
!SRAM_LIVE_SIZE = $400
!SRAM_SLOTS     = $316400   ; 4 x !SRAM_SLOT_SIZE sidecars, one per native GAME FILE slot
!SRAM_SLOT_SIZE = $420      ; $20 header + $400 copy of !SRAM_LIVE
!SRAM_PERSIST_END = $317480
!SRAM_WORK      = $317480   ; volatile work area through $337FFF
!SRAM_WORK_END  = $338000
