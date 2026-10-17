; Module list and core dispatch tables. Each module owns one code bank and
; RAM block (core/layout.asm, core/ram.asm) and lives in
; snes/src/modules/<name>/. Add its include and its dispatch calls here:
; one `JSL <module>_<hook>` line before the RTL of each hook it needs.
; Contracts: docs/agents/snes-rom.md (core API) and
; docs/agents/snes-port/engine.md (what the game is doing at each hook).

; incsrc "modules/<name>/module.asm"
incsrc "modules/goku/module.asm"
incsrc "modules/story/module.asm"
incsrc "modules/ui/module.asm"

pushpc
org !CODE_CORE+$7000
; Field frame (also dialogue, events and Mode 7 boss arenas), after the game
; logic and OAM build, before the NMI handshake. M16/X16, DB = $7E, D = 0.
modules_field_frame:
	JSL goku_frame
	JSL story_field_frame
	JSL ui_field_frame
	RTL
; Field vblank, after the game's own uploads, still force-blanked (DB = $80).
modules_field_nmi:
	JSL goku_nmi
	JSL ui_field_nmi                  ; last: re-arms HDMA channel 5 after DMA on 4-7
	RTL
; World flight frame, after the world logic (DB = $7E).
modules_world_frame:
	JSL ui_world_frame
	RTL
; World vblank, after the game's uploads and HDMA setup; not force-blanked,
; so check core_vblank_lines before long uploads (DB = $80).
modules_world_nmi:
	JSL ui_world_nmi
	RTL
; Full-screen menu frame (file select, name entry, status, equipment,
; save), in vblank right after the menu's own uploads (DB = $7E).
modules_menu_frame:
	JSL ui_menu_frame
	RTL
; Ring menu frame, in vblank (DB = $7E).
modules_ring_frame:
	JSL ui_ring_frame
	RTL
; Title program entry (power-on, soft reset, quit to title), after module
; WRAM was cleared; the decompressed program is at 7E:8000 (DB = $7E).
modules_title_boot:
	JSL ui_title_boot
	RTL
; Before the game writes a GAME FILE: put persistent state into !SRAM_LIVE.
modules_save:
	RTL
; After a GAME FILE loaded and core restored (or cleared) !SRAM_LIVE.
modules_load:
	JSL story_load
	JSL ui_load
	RTL
; New game: !SRAM_LIVE was cleared and !persist_version set to 1.
modules_new_game:
	JSL story_new_game
	JSL ui_new_game
	RTL
pullpc

; Story hook and query tables (generated). Keep this last: modules fill story
; hooks/queries by defining !STORY_HOOK_<NAME> / !STORY_QUERY_<NAME> in their
; own module files, which must be included above it.
incsrc "story/hooks.asm"
