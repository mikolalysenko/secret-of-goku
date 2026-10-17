; Handwritten tables in the title data bank (!DATA_MISC).

; WRAM title-program patches (see boot.asm). Entry: dw WRAM address in bank
; $7E, db length n, n original bytes (generated from the verified ROM), n new
; bytes. Terminated by dw 0.
title_program_patches:
	dw $ADFD : db 4
	%title_orig_logo()
	db $22 : dl title_logo_load
	dw $8869 : db 5
	%title_orig_writer()
	db $5C : dl title_credit_tail : db $60
	dw $92DD : db 7
	%title_orig_hdma()
	db $22 : dl title_vblank_hdma : db $EA,$EA,$EA
	dw $0000
