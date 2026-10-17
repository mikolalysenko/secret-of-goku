; Module list and core dispatch tables. Each module owns one code bank and
; RAM block (core/layout.asm, core/ram.asm) and lives in
; snes/src/modules/<name>/. Add its include and its dispatch calls here:
; one `JSL <module>_<hook>` line before the RTL of each hook it needs.
; Contracts: docs/agents/snes-rom.md (core API) and
; docs/agents/snes-port/engine.md (what the game is doing at each hook).

; incsrc "modules/<name>/module.asm"
incsrc "modules/goku/module.asm"
incsrc "modules/fx/module.asm"         ; before its clients (they use the !FX_* defines)
incsrc "modules/world/module.asm"
incsrc "modules/title/module.asm"
incsrc "modules/story/module.asm"
incsrc "modules/flight/module.asm"
incsrc "modules/debug/module.asm"
incsrc "modules/destroy/module.asm"
incsrc "modules/combat/module.asm"
incsrc "modules/audio/module.asm"           ; after the modules whose sound flags it reads

pushpc
org !CODE_CORE+$7000
; Field frame (also dialogue, events and Mode 7 boss arenas), after the game
; logic and OAM build, before the NMI handshake. M16/X16, DB = $7E, D = 0.
modules_field_frame:
	JSL title_field_frame
	JSL story_field_frame
	JSL debug_field_frame
	JSL combat_field_frame     ; before goku: poses and form apply this frame
	JSL flight_frame           ; before goku: hover pose and lift requests
	JSL world_field_frame
	JSL goku_frame
	JSL destroy_field_frame          ; last: its planner uses the frame time left
	JSL fx_frame               ; after every module that draws effects: shows this frame's requests
	JSL audio_frame                 ; last: sends what other modules requested this frame
	RTL
; Field vblank, after the game's own uploads, still force-blanked (DB = $80).
modules_field_nmi:
	JSL goku_nmi
	JSL fx_nmi                 ; keep last: programs HDMA channels 2/3 after all vblank DMA
	RTL
; World flight frame, after the world logic (DB = $7E).
modules_world_frame:
	JSL destroy_world_frame
	JSL world_world_frame
	JSL debug_world_frame
	JSL combat_world_frame
	JSL flight_world_frame     ; a ceiling escape completes in world flight
	JSL fx_world_frame         ; after the modules that draw effects
	JSL audio_frame
	RTL
; World vblank, after the game's uploads and HDMA setup; not force-blanked,
; so check core_vblank_lines before long uploads (DB = $80).
modules_world_nmi:
	JSL world_world_nmi
	JSL fx_world_nmi           ; keep last
	RTL
; Full-screen menu frame (file select, name entry, status, equipment,
; save), in vblank right after the menu's own uploads (DB = $7E).
modules_menu_frame:
	JSL goku_menu_frame
	JSL title_menu_frame
	JSL debug_menu_frame
	JSL combat_menu_frame
	JSL audio_pause
	RTL
; Ring menu frame, in vblank (DB = $7E).
modules_ring_frame:
	JSL fx_ring_frame          ; first: puts PPU registers back inside vblank
	JSL combat_menu_frame
	JSL audio_pause
	RTL
; Title program entry (power-on, soft reset, quit to title), after module
; WRAM was cleared; the decompressed program is at 7E:8000 (DB = $7E).
modules_title_boot:
	JSL title_title_boot
	JSL debug_title_boot
	JSL world_title_boot
	JSL fx_title_boot
	RTL
; Before the game writes a GAME FILE: put persistent state into !SRAM_LIVE.
modules_save:
	RTL
; After a GAME FILE loaded and core restored (or cleared) !SRAM_LIVE.
modules_load:
	JSL title_load
	JSL combat_load
	JSL story_load
	JSL destroy_reset
	RTL
; New game: !SRAM_LIVE was cleared and !persist_version set to 1.
modules_new_game:
	JSL title_new_game
	JSL combat_new_game
	JSL story_new_game
	JSL debug_new_game
	JSL destroy_reset
	RTL
pullpc

; Flight's bindings to optional modules (combat, audio, ui, world): after
; every module so their defines are visible.
incsrc "modules/flight/bind.asm"

; Combat bindings to optional modules: after every module include (its
; defined() checks see them), before the story tables.
incsrc "modules/combat/bind.asm"

; Debug preset hook table (generated): modules fill it by defining
; !DEBUG_PRESET_HOOK_<NAME> / _ANY in their own files (included above).
incsrc "debug/hooks.asm"

; Story hook and query tables (generated). Keep this last: modules fill story
; hooks/queries by defining !STORY_HOOK_<NAME> / !STORY_QUERY_<NAME> in their
; own module files, which must be included above it.
incsrc "story/hooks.asm"
