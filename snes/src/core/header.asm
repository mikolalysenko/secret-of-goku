; Cartridge header: 32 Mbit HiROM, 32 KiB battery SRAM.
; The original 8 KiB save area stays at $30:6000-$30:7FFF (SRAM 0x0000-0x1FFF);
; SRAM 0x2000-0x7FFF ($31-$33:6000-7FFF) is new (see core/ram.asm).
pushpc
org $00FFC0
	db "SECRET OF GOKU       "  ; 21 bytes
org $00FFD7
	db $0C                      ; ROM size: 4 MiB
	db $05                      ; SRAM size: 32 KiB
if defined("CORE_FASTROM")
; Opt-in FastROM (docs/agents/snes-port/engine.md): map mode HiROM+FastROM;
; core_title_boot sets MEMSEL after the game's own register clear.
org $00FFD5
	db $31
endif
pullpc
