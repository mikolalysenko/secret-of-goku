; Every patch of original code made by the flight module, with the original
; bytes asserted. Each site's role: move.asm. None of the replaced ranges is
; a branch target of the original code (snes/test/flight/branchcheck.mjs).

; Hero movement step: velocity after C0:D2E0 (SEP #$20 / LDA $1F)
%orig4($C0D651, $1FA520E2)
%hijack($C0D651, fl_hook_d651, 4, flight)
; Collision routine D74F: airborne steps over low obstacles (SEP #$20 / LDA $11)
%orig4($C0D778, $11A520E2)
%hijack($C0D778, fl_hook_d778, 4, flight)
; Stair and current guidance (LDA $E048,X / STA $00 / AND #$F0)
%orig4($C0D359, $85E048BD)
%orig3($C0D35D, $F02900)
%hijack($C0D359, fl_hook_d359, 7, flight)
; Leader tether, horizontal and vertical (SEP #$20 / LDA $E000,X)
%orig4($C0D9AE, $00BD20E2)
%orig1($C0D9B2, $E0)
%hijack($C0D9AE, fl_hook_d9ae, 5, flight)
%orig4($C0DA34, $00BD20E2)
%orig1($C0DA38, $E0)
%hijack($C0DA34, fl_hook_da34, 5, flight)
; Camera dispatcher (SEP #$30 / LDA $FF): follow and Beast-arena deltas
%orig4($C0DA6E, $FFA530E2)
%hijack($C0DA6E, fl_hook_da6e, 4, flight)
