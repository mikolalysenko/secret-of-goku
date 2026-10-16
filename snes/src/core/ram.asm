; RAM allocation. Original WRAM is almost fully used; the only regions never
; touched across 321 replayed states (snes/tools/wram-usage.mjs) are
; 7E:D6D3-DDFF, 7E:6E40-6FFF and 7E:7E40-7FFF. We claim 7E:D700-DDFF.
; Large buffers and persistent mod state live in the added SRAM.
;
; WRAM 7E:D700-DDFF (1792 bytes): hot runtime state, per module:
!WRAM_BASE    = $7ED700
!RAM_CORE     = $7ED700   ; 0x40  core flags, frame counter, input edges
!RAM_GOKU     = $7ED740   ; 0xC0  sprite/animation
!RAM_COMBAT   = $7ED800   ; 0x100 combat
!RAM_FLIGHT   = $7ED900   ; 0x80  flight / traversal
!RAM_DESTROY  = $7ED980   ; 0x80  destruction
!RAM_STORY    = $7EDA00   ; 0x100 story runtime
!RAM_FRIEZA   = $7EDB00   ; 0x100 Frieza / Vegeta fights (shared, never concurrent)
!RAM_ORBIT    = $7EDC00   ; 0x100 orbit / cinematics / endings
!RAM_AUDIO    = $7EDD00   ; 0x80  audio
!RAM_MISC     = $7EDD80   ; 0x80  title / arrival / misc
!WRAM_END     = $7EDE00
;
; SRAM (battery backed, 32 KiB total, HiROM banks 30-33:6000-7FFF):
;   $30:6000-7FFF original saves (4 x $400 + backups) — untouched.
;   $31:6000-6FFF persistent Goku state: per save slot sidecars + options.
;   $31:7000-$33:7FFF volatile work buffers (cleared at boot).
!SRAM_PERSIST = $316000
!SRAM_SLOTS   = $316000   ; 8 x $100 (4 slots + 4 backups)
!SRAM_LIVE    = $316800   ; $400 live persistent story state (copied to slots on save)
!SRAM_WORK    = $317000   ; volatile work area through $337FFF
!SRAM_WORK_END = $338000
