; Secret of Goku — standalone SNES cartridge.
; Assembled by snes/build.mjs with asar onto the verified Secret of Mana (US)
; image expanded to 32 Mbit HiROM. Original code lives in banks C0-DF; all
; additions live in E0-FF (see core/layout.asm). The build then widens the
; image to 64 Mbit ExHiROM; generator xdata fills banks $40-$7D:0000-7FFF.
hirom
incsrc "core/layout.asm"
incsrc "xdata.asm"            ; generated: extended-data addresses (ExHiROM builds)
incsrc "core/macros.asm"
incsrc "core/header.asm"
incsrc "core/ram.asm"
incsrc "core/shared.asm"
incsrc "core/core.asm"
incsrc "modules.asm"
