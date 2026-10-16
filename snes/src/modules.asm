; Module list and core dispatch tables. Each module owns one code bank and
; RAM block (core/layout.asm, core/ram.asm) and lives in
; snes/src/modules/<name>/. Add its include and its dispatch calls here.

; incsrc "modules/<name>/module.asm"

pushpc
org !CODE_CORE+$7000
; Field frame, after game logic and before the NMI handshake.
modules_field_frame:
	RTL
; Field vblank, after the game's own uploads (DB = $80).
modules_field_nmi:
	RTL
pullpc
