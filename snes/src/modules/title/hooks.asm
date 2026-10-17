; Patches of original cartridge bytes owned by the title module. The title
; boot, menu frame and new-game entry points are core hooks (modules.asm).

; Dialogue name copy for code 57 n (LDA.b #$0C / LDY.w #$0000).
%orig4($C01860, $00A00CA9)
%orig1($C01864, $00)
%hijack($C01860, title_name_copy, 5, title)

; Player text: four bounded spans (sword departure, Elliott, aftermath and
; sword concern). The sword-pull grunt stays original, as in the browser.
%title_text_patches()
