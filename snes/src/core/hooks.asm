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

; Run the native actor/OBJ pass through the FastROM mirror. The outer
; field loop and interrupts keep their original bank and timing contract.
%orig4($C0B0CA, $20B0D320)
%orig2($C0B0CE, $E38E)
%hijack_jsl($C0B0CA, core_field_actors, 6, core)

; The same ROM and low WRAM/IO mappings in banks $81/$82, with fast
; instruction fetches for the field's interaction, HUD and status passes.
%orig4($C0D5CC, $01CD4E22)
%hijack_jsl($C0D5CC, $81CD4E, 4, core)
%orig4($C0E38E, $01E61D22)
%hijack_jsl($C0E38E, $81E61D, 4, core)
%orig4($C0B0BB, $01B03322)
%hijack_jsl($C0B0BB, $81B033, 4, core)
%orig4($C0B0BF, $01BFE022)
%hijack_jsl($C0B0BF, $81BFE0, 4, core)

; Hot native actor and collision calls (verified instruction sites).
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
