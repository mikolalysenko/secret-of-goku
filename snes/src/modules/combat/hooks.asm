; Every patch of original code made by combat, with the original bytes
; asserted (native.asm has the handlers; bind.asm the movement hooks).

; Field vblank counter and per-vblank pad (the browser's 60 Hz combat clock
; and input in lagging scenes).
%orig4($C0C164, $EC14FFA9)           ; LDA #$FF / TRB $EC
%hijack_jsl($C0C164, cb_nmi_vblank, 4, combat)

; Combat runs inside the field frame logic, after the pad read (C0:B0AC
; JSR $93B9 / JSR $B69C), as the browser runs it before each frame's logic.
%orig4($C0B0AC, $2093B920)
%orig2($C0B0B0, $B69C)
%hijack_jsl($C0B0AC, cb_hook_logic, 6, combat)

; Weapon attacks for Goku (native-interaction.js).
%orig4($C0B224, $7EE060BF)           ; LDA $7EE060,X
%hijack_jsl($C0B224, cb_hook_weapon_charged, 4, combat)
%orig4($C0B2A7, $7EE01CBF)           ; LDA $7EE01C,X
%hijack_jsl($C0B2A7, cb_hook_weapon_normal, 4, combat)

; Impact sound of the damage consumer (native-combat-sound.js).
%orig4($C04157, $008D02A9)           ; LDA #$02 / STA $1E00
%orig1($C0415B, $1E)
%hijack_jsl($C04157, cb_hook_hit_sound, 5, combat)

; Goku's incoming damage (native-hit-recovery.js receive()).
%orig4($C04053, $F1BD20C2)           ; REP #$20 / LDA $E1F1,X
%orig1($C04057, $E1)
%hijack_jsl($C04053, cb_hook_receive, 5, combat)

; Physical resolver -> retail dodge for Super Saiyan deflections.
%orig4($C0514B, $85E1BFBD)           ; LDA $E1BF,X / STA $90
%orig1($C0514F, $90)
%hijack_jsl($C0514B, cb_hook_parry, 5, combat)

; End of the DEF rebuild (C0:4A75): Saiyan defense.
%orig4($C04AF9, $E2E1AA9D)           ; STA $E1AA,X / SEP #$20
%orig1($C04AFD, $20)
%hijack_jsl($C04AF9, cb_hook_defense, 5, combat)

; Shortened recovery: hurt timer and damage-number fade.
%orig4($C0F590, $F0E012BD)           ; LDA $E012,X / BEQ $F59A
%orig1($C0F594, $05)
%hijack_jsl($C0F590, cb_hook_hurt_timer, 5, combat)
%orig4($C18355, $D0E11FBD)           ; LDA $E11F,X / BNE $8376
%orig1($C18359, $1C)
%hijack_jsl($C18355, cb_hook_number_fade, 5, combat)

; Heavy Gi (native-equipment.js): fresh level-table read, attribute clamp,
; end of the rebuild.
%orig4($C04699, $D04215BF)           ; LDA $D04215,X
%hijack_jsl($C04699, cb_hook_level_read, 4, combat)
%orig4($C04BF2, $BDA6E7D0)           ; BNE $4BDB / LDX $BD
%hijack_jsl($C04BF2, cb_hook_attr_clamp, 4, combat)
%orig4($C04576, $6B2BAB28)           ; PLP / PLB / PLD / RTL
%hijack($C04576, cb_hook_rebuild_end, 4, combat)

; Goku's weapon ring tier and weapon / sword-dust equips.
%orig4($D0D1CF, $8D0063A9)           ; LDA #$0063 / STA $182A
%orig2($D0D1D3, $182A)
%hijack_jsl($D0D1CF, cb_hook_weapon_tier, 6, combat)
%orig4($C074B6, $5DAD30E2)           ; SEP #$30 / LDA $185D
%orig1($C074BA, $18)
%hijack_jsl($C074B6, cb_hook_equip, 5, combat)

; Senzu Bean targets (native-senzu.js).
%orig4($D0DB2A, $7E0191BF)           ; LDA $7E0191,X
%hijack_jsl($D0DB2A, cb_hook_item_target, 4, combat)

; Item names: Senzu Bean, Heavy Gi, DUST BAG (the nine swords).
incsrc "combat/patches.asm"
