; Secret of Goku — standalone SNES cartridge.
; Assembled by snes/build.mjs with asar onto the verified Secret of Mana (US)
; image expanded to 32 Mbit HiROM. Original code lives in banks C0-DF; all
; additions live in E0-FF (see core/layout.asm).
hirom
incsrc "core/layout.asm"
incsrc "core/macros.asm"
incsrc "core/header.asm"
incsrc "core/ram.asm"
incsrc "core/core.asm"
incsrc "modules.asm"
