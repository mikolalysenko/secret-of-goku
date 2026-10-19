; Every patch of original code made by core, with the original bytes asserted.
; See docs/agents/snes-port/engine.md for what each site does.

; Reset continuation (C0:8008 JML $C10010).
%orig4($C08008, $C100105C)
%hijack($C08008, core_boot, 4, core)

; Title program entries (C1:4CF6 JML $7EAF0B, C1:4D0B JML $7EAF28).
%orig4($C14CF6, $7EAF0B5C)
%hijack($C14CF6, core_title_boot, 4, core)
%orig4($C14D0B, $7EAF285C)
%hijack($C14D0B, core_title_boot_alt, 4, core)

; Field loop frame end (00:B073 SEP #$20 / LDA #$01).
%orig4($C0B073, $01A920E2)
%hijack_jsl($C0B073, core_field_frame, 4, core)

; Run native scrolling and actor/OBJ passes through FastROM.
; The same low WRAM and I/O mirrors retain the native return contracts.
%orig4($C0B0B8, $22C59F20)
%orig3($C0B0BC, $01B033)
%hijack_jsl($C0B0B8, core_field_scroll, 7, core)

; Run the native actor preparation/OBJ pass through FastROM. The outer
; field loop and interrupts keep their original bank and timing contract.
%orig3($C0B0C7, $EB0620)
%orig4($C0B0CA, $20B0D320)
%orig2($C0B0CE, $E38E)
%hijack_jsl($C0B0C7, core_field_actors, 9, core)

; Spread companion status/AI/animation across the existing five phases.
; The original phase-3 pair is retained while the boy is still native.
if not(defined("CORE_PARTY_SYNC"))
%orig4($C0F4BA, $200200A2)
%orig4($C0F4BE, $00A2F4CB)
%orig4($C0F4C2, $F4CB2004)
%hijack_jsl($C0F4BA, core_party_pair, 12, core)
endif

; The same ROM and low WRAM/IO mappings in banks $81/$82, with fast
; instruction fetches for the field's interaction, HUD and status passes.
%orig4($C0D5CC, $01CD4E22)
%hijack_jsl($C0D5CC, $81CD4E, 4, core)
%orig4($C0E38E, $01E61D22)
%hijack_jsl($C0E38E, $81E61D, 4, core)
%orig4($C0B0BF, $01BFE022)
%hijack_jsl($C0B0BF, $81BFE0, 4, core)
%orig4($C0B08C, $02C78622)
%hijack_jsl($C0B08C, $82C786, 4, core)
%orig4($C0B0C3, $02BAD622)
%hijack_jsl($C0B0C3, $82BAD6, 4, core)

; Hot native actor and collision calls (verified instruction sites).
if not(defined("CORE_NATIVE_DISTANCE_SLOW"))
%orig4($C10358, $20C2080B)
%hijack($C10358, core_native_distance, 4, core)
endif

if not(defined("CORE_NATIVE_SPRITES_SLOW"))
; Body/weapon anchor path only. Calls directly into E640 (shadows and
; smaller attachments) retain the original emitter without an entry probe.
%orig4($C0E60D, $20E20685)
%hijack($C0E60D, core_native_body_anchor, 4, core)
endif

; Field HP-number refreshes must not wait for vblank inside status/AI.
%orig4($C1E326, $A98B20E2)
%orig1($C1E32A, $00)
%hijack($C1E326, core_native_hp_request, 5, core)

; Native message graphics: copy the same WRAM bytes with interruptible MVN.
if not(defined("CORE_NATIVE_TEXT_SLOW"))
%orig4($C014C6, $B9EB10A9)
%orig2($C014CA, $0000)
%hijack($C014C6, core_native_text_copy, 6, core)
%orig4($C015B9, $A00000A2)
%orig2($C015BD, $0000)
%hijack($C015B9, core_native_text_glyphs, 6, core)
%orig4($C0162C, $A00000A2)
%orig2($C01630, $0000)
%hijack($C0162C, core_native_text_outline, 6, core)
endif

; Common death and weapon sheets are already expanded in ROM. Other
; graphics and unusual calling contexts retain the original decoder.
if not(defined("CORE_NATIVE_TILES_SLOW"))
%orig4($C1C599, $488B20E2)
%orig1($C1C59D, $AB)
%hijack($C1C599, core_native_tiles, 5, core)
endif

%orig4($C12710, $30C2080B)
%orig1($C12714, $8A)
%patch($C12710, 5, core)
pushpc
org $C12710
	JSL core_native_high_bit
	RTS
pullpc

%orig4($C0F509, $01808922)
%hijack_jsl($C0F509, $818089, 4, core)
%orig4($C0F9CA, $01D5C022)
%hijack_jsl($C0F9CA, $81D5C0, 4, core)
%orig4($C0D7AA, $01B93E22)
%hijack_jsl($C0D7AA, $81B93E, 4, core)
%orig4($C0F8E9, $01D94222)
%hijack_jsl($C0F8E9, $81D942, 4, core)
%orig4($C0F1EC, $01818F22)
%hijack_jsl($C0F1EC, $81818F, 4, core)
%orig4($C0F9E5, $01D52A22)
%hijack_jsl($C0F9E5, $81D52A, 4, core)

; Field NMI before HDMA enable (00:C158 SEP #$20 / LDA $2C / STA $420C).
%orig4($00C158, $2CA520E2)
%orig3($00C15C, $420C8D)
%hijack_jsl($00C158, core_field_nmi, 7, core)

; Pad read (C0:951D JSL $CFFE00, the MULTI5 BIOS).
%orig4($C0951D, $CFFE0022)
%hijack_jsl($C0951D, core_pad_bios, 4, core)

; World flight frame end (00:8085 SEP #$20 / LDA #$81).
; The native compass/object pass has the same low WRAM/IO mappings in $81.
%orig4($C08078, $01FDE422)
%hijack_jsl($C08078, $81FDE4, 4, core)

%orig4($C08085, $81A920E2)
%hijack_jsl($C08085, core_world_frame, 4, core)

; World NMI tail (00:8903 REP #$30 / PLB / PLD; core_world_nmi finishes it).
%orig4($C08903, $2BAB30C2)
%orig4($C08907, $4068FA7A)
%hijack($C08903, core_world_nmi, 4, core)

; Full-screen menu frame (C0:1E08 LDA $A201 / INC).
%orig4($C01E08, $1AA201AD)
%hijack_jsl($C01E08, core_menu_frame, 4, core)

; Ring menu frame (C0:694F LDA #$08 / TSB $EC).
%orig4($C0694F, $EC0408A9)
%hijack_jsl($C0694F, core_ring_frame, 4, core)

; GAME FILE save / load (C0:2E87 JSL $C755D6, C0:2EC1 JSL $C7557A).
%orig4($C02E87, $C755D622)
%hijack_jsl($C02E87, core_save, 4, core)
%orig4($C02EC1, $C7557A22)
%hijack_jsl($C02EC1, core_load, 4, core)

; New game (C7:5F6F JSL $C00030, the inventory initializer C0:5745).
%orig4($C75F6F, $C0003022)
%hijack_jsl($C75F6F, core_new_game, 4, core)
