; Core runtime: boot initialisation and shared services.
pushpc
org !CODE_CORE
core_code_start:

; Reset path: C0:8008 originally JML $C10010 (after CLC/XCE/SEP #$30).
; Clear our WRAM block, then continue with the original boot.
core_boot:
	PHP
	REP #$30
	LDA #$0000
	LDX #(!WRAM_END-!WRAM_BASE-2)
.clear
	STA.l !WRAM_BASE,X
	DEX : DEX
	BPL .clear
	PLP
	JML $C10010

core_code_end:
pullpc
%orig4($C08008, $C100105C)
%hijack($C08008, core_boot, 4, core)
