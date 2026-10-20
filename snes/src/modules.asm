; Module list and core dispatch tables. Each module owns one code bank and
; RAM block (core/layout.asm, core/ram.asm) and lives in
; snes/src/modules/<name>/. Add its include and its dispatch calls here:
; one `JSL <module>_<hook>` line before the RTL of each hook it needs.
; Contracts: docs/agents/snes-rom.md (core API) and
; docs/agents/snes-port/engine.md (what the game is doing at each hook).

!DOOR_RECORD_HOOK = frieza_door_record   ; destroy's door record (C1:E7DF) -> door 3FC beside the Emperor

; incsrc "modules/<name>/module.asm"
incsrc "modules/goku/module.asm"
incsrc "modules/fx/module.asm"         ; before its clients (they use the !FX_* defines)
incsrc "modules/world/module.asm"
incsrc "modules/title/module.asm"
incsrc "modules/story/module.asm"
incsrc "modules/flight/module.asm"
incsrc "modules/ui/module.asm"
incsrc "modules/debug/module.asm"
incsrc "modules/destroy/module.asm"
incsrc "modules/ending/module.asm"
incsrc "modules/frieza/module.asm"
incsrc "modules/combat/module.asm"
incsrc "modules/orbit/module.asm"           ; after combat (reads its public !cb_vblanks)
incsrc "modules/vegeta/module.asm"
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
	JSL ui_field_frame
	JSL world_field_frame
	JSL flight_pose_frame      ; after world: the ceiling escape's pose wins over its takeoff pose
	JSL frieza_field_frame
	JSL orbit_field_frame
	JSL vegeta_field_frame
	JSL goku_frame
	JSL destroy_field_frame          ; last: its planner uses the frame time left
	JSL fx_frame               ; after every module that draws effects: shows this frame's requests
	JSL destroy_late_frame
	JSL ending_frame          ; after the modules that draw sprites: a full-screen scene takes the whole OAM
	JSL audio_frame                 ; last: sends what other modules requested this frame
	RTL
; C clear after an NMI interrupted this combat update. A low scanline
; after wrapping is not spare time for optional end-of-frame work.
modules_field_current:
	LDA.w !cb_vblanks
	CMP.w !cb_vb_last
	BEQ +
	CLC
	RTL
+	SEC
	RTL
; Field vblank, after the game's own uploads, still force-blanked (DB = $80).
modules_field_nmi:
	JSL ui_field_nmi                  ; channels 0/1 for a moved native window; re-arms channel 5 after the game's DMA on 4-7
	JSL destroy_field_nmi            ; first: switches the breach's HDMA on while vblank lasts
	JSL goku_nmi
	JSL frieza_field_nmi
	JSL orbit_field_nmi
	JSL vegeta_nmi
	JSL ending_nmi
	JSL fx_nmi                 ; keep last: programs HDMA channels 2/3 after all vblank DMA
	RTL
; World flight frame, after the world logic (DB = $7E).
modules_world_frame:
	JSL world_prepare_frame          ; enter/reset before combat consumes the pad
	JSL combat_world_frame           ; shared charge/form state before world effects and drawing
	JSL ui_world_frame               ; first OAM producer; sees this frame's charge/shot/docking
	JSL destroy_world_frame
	JSL world_world_frame
	JSL debug_world_frame
	JSL flight_world_frame     ; a ceiling escape completes in world flight
	JSL frieza_world_frame     ; the Death Ball flyby (1F04), the crisis's flight warning
	JSL fx_world_frame         ; after the modules that draw effects
	JSL ending_world_frame     ; after fx: the Fortress cutaway takes the whole OAM
	JSL audio_frame
	RTL
; World vblank, after the game's uploads and HDMA setup; not force-blanked,
; so check core_vblank_lines before long uploads (DB = $80).
modules_world_nmi:
	JSL ending_world_nmi       ; the Fortress cutaway's picture
	JSL ui_world_nmi                  ; first: a few register and CGRAM writes
	JSL world_world_nmi
	JSL fx_world_nmi           ; keep last
	RTL
; Full-screen menu frame (file select, name entry, status, equipment,
; save), in vblank right after the menu's own uploads (DB = $7E).
modules_menu_frame:
	JSL goku_menu_frame
	JSL title_menu_frame
	JSL ui_menu_frame
	JSL debug_menu_frame
	JSL combat_menu_frame
	JSL audio_pause
	RTL
; Ring menu frame, in vblank (DB = $7E).
modules_ring_frame:
	JSL fx_ring_frame          ; first: puts PPU registers back inside vblank
	JSL ui_ring_frame
	JSL combat_menu_frame
	JSL destroy_ring_frame
	JSL audio_pause
	RTL
; Title program entry (power-on, soft reset, quit to title), after module
; WRAM was cleared; the decompressed program is at 7E:8000 (DB = $7E).
modules_title_boot:
	JSL title_title_boot
	JSL debug_title_boot
	JSL frieza_title_boot
	JSL world_title_boot
	JSL fx_title_boot
	JSL ui_title_boot
	JSL destroy_title_boot
	RTL
; Before the game writes a GAME FILE: put persistent state into !SRAM_LIVE.
modules_save:
	RTL
; After a GAME FILE loaded and core restored (or cleared) !SRAM_LIVE.
modules_load:
	JSL title_load
	JSL combat_load
	JSL story_load
	JSL frieza_load
	JSL ui_load
	JSL destroy_reset
	JSL vegeta_reset
	RTL
; New game: !SRAM_LIVE was cleared and !persist_version set to 1.
modules_new_game:
	JSL title_new_game
	JSL combat_new_game
	JSL story_new_game
	JSL frieza_new_game
	JSL ui_new_game
	JSL debug_new_game
	JSL destroy_reset
	JSL vegeta_reset
	RTL

; ---------------------------------------------------------------------------
; Combat's extension lists (contracts: docs/agents/snes-port/combat.md, API).
; Add a line for your module; the order inside a list carries no meaning.
;
; Virtual targets: enemies that are not native actors (the browser's
; entities() extras). One entry each, at most 7:
;   dl <query>, <hit> : db <browser entity index>, <flags (!CVT_*)>
; query (C set while it can be struck: A16 = species | terrain << 8, X16 =
; x, Y16 = y) and hit (A16 = damage, X16 = 1 while combat's action is a
; punch -> A16 = HP taken) are JSL, DB = $7E, D = 0, M16/X16.
modules_combat_targets:
	dl frieza_virtual_target, frieza_virtual_hit : db 12, !CVT_AIRBORNE
modules_combat_targets_end:
assert (modules_combat_targets_end-modules_combat_targets) <= 56, "combat: at most 7 virtual targets (8 bytes each)"
; Damage hooks: Goku's damage A16 on native actor X16 (offset), JSL each,
; DB = $7E, D = 0, M16/X16; each returns A16 = the damage and keeps X.
modules_combat_damage:
	JSL frieza_combat_damage   ; the Mana Beast, the empowered Dark Lich
	JSL vegeta_combat_damage   ; Vegeta in slot 3 while the trial shows him to combat
	RTL
; Receive hooks: damage queued on Goku at the native consumer (C0:4053),
; before combat's Saiyan resilience: A16 = $E1F1 (nonzero, not a heal),
; JSL each, DB = $7E, D = 0, M16/X16; each returns A16 = the damage to
; apply (0 = none).
modules_combat_receive:
if defined("COMBAT_TEST")
	JSL combat_test_receive    ; snes/test/combat (receive cases)
endif
	JSL frieza_combat_receive  ; the fed Mana Beast's cap and grace
	RTL
pullpc

; Flight's bindings to optional modules (combat, audio, ui, world): after
; every module so their defines are visible.
incsrc "modules/flight/bind.asm"

; Orbit bindings to optional modules (after every module's defines; before
; frieza's, which test its !FRIEZA_ORBIT_* entries).
incsrc "modules/orbit/bind.asm"
; Frieza bindings to optional modules (after every module's defines).
incsrc "modules/frieza/bind.asm"
; Combat bindings to optional modules: after every module include (its
; defined() checks see them), before the story tables.
incsrc "modules/combat/bind.asm"
; Vegeta's bindings to optional modules (audio, ui, fx, combat).
incsrc "modules/vegeta/bind.asm"

; Debug preset hook table (generated): modules fill it by defining
; !DEBUG_PRESET_HOOK_<NAME> / _ANY in their own files (included above).
incsrc "debug/hooks.asm"

; Story hook and query tables (generated). Keep this last: modules fill story
; hooks/queries by defining !STORY_HOOK_<NAME> / !STORY_QUERY_<NAME> in their
; own module files, which must be included above it.
incsrc "story/hooks.asm"
