; Additive starting inventory (engine/rom-patches.js originalGamePatch): the
; browser appends one store to the new-game inventory initializer (C0:5745,
; called from C7:5F6F). Core's new-game hook runs right after that
; initializer, so the Drum (Goku's Fly item, $27) is stored into the
; inventory slot $7ECC48 there. Item and address come from the browser patch.
; modules_new_game: M16/X16, DB=$7E, D=0.
title_new_game:
	SEP #$20
	LDA.b #!TITLE_INV_ITEM
	STA.l !TITLE_INV_ADDR
	REP #$20
	RTL
