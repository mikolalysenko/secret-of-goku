; Module list and core dispatch tables. Each module owns one code bank and
; RAM block (core/layout.asm, core/ram.asm) and lives in
; snes/src/modules/<name>/. Add its include and its dispatch calls here:
; one `JSL <module>_<hook>` line before the RTL of each hook it needs.
; Contracts: docs/agents/snes-rom.md (core API) and
; docs/agents/snes-port/engine.md (what the game is doing at each hook).

; incsrc "modules/<name>/module.asm"
incsrc "modules/goku/module.asm"
incsrc "modules/fx/module.asm"         ; before its clients (they use the !FX_* defines)
incsrc "modules/combat/module.asm"

pushpc
org !CODE_CORE+$7000
; Field frame (also dialogue, events and Mode 7 boss arenas), after the game
; logic and OAM build, before the NMI handshake. M16/X16, DB = $7E, D = 0.
modules_field_frame:
	JSL combat_field_frame     ; before goku: poses and form apply this frame
	JSL goku_frame
	JSL fx_frame               ; keep last: draws what clients requested this frame
	RTL
; Field vblank, after the game's own uploads, still force-blanked (DB = $80).
modules_field_nmi:
	JSL goku_nmi
	JSL fx_nmi                 ; keep last: programs HDMA channels 2/3 after all vblank DMA
	RTL
; World flight frame, after the world logic (DB = $7E).
modules_world_frame:
	JSL combat_world_frame
	JSL fx_world_frame         ; keep last
	RTL
; World vblank, after the game's uploads and HDMA setup; not force-blanked,
; so check core_vblank_lines before long uploads (DB = $80).
modules_world_nmi:
	JSL fx_world_nmi           ; keep last
	RTL
; Full-screen menu frame (file select, name entry, status, equipment,
; save), in vblank right after the menu's own uploads (DB = $7E).
modules_menu_frame:
	JSL combat_menu_frame
	RTL
; Ring menu frame, in vblank (DB = $7E).
modules_ring_frame:
	JSL combat_menu_frame
	RTL
; Title program entry (power-on, soft reset, quit to title), after module
; WRAM was cleared; the decompressed program is at 7E:8000 (DB = $7E).
modules_title_boot:
	RTL
; Before the game writes a GAME FILE: put persistent state into !SRAM_LIVE.
modules_save:
	RTL
; After a GAME FILE loaded and core restored (or cleared) !SRAM_LIVE.
modules_load:
	JSL combat_load
	RTL
; New game: !SRAM_LIVE was cleared and !persist_version set to 1.
modules_new_game:
	JSL combat_new_game
	RTL
pullpc

; Combat bindings to optional modules: keep after every module include.
incsrc "modules/combat/bind.asm"
