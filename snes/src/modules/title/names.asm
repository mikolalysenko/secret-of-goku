; Names (engine/native-names.js and the name prefill in engine/lab.js).
;
; Name editor prefill: the original editor shows an empty field. The first
; time this boot that the editor state matches the native new-game editor
; (field empty, cursor at the start, letter grid in place, $E4=$E5=0), BOY is
; written into the field exactly as the browser does: tiles at $90D2/$9112,
; length $A1CC=3, cursor $A157=$18, redraw bit 1 of $A20A. It never runs
; again until reset, so later edits are untouched; Start commits the name
; through the original code.
;
; Names in dialogue (code 57 n, displayName) are the story module's view at
; C0:1866 (story_name_byte); this module only crowns Goku at the impact.
!title_namebuf  = !RAM_MISC+$20   ; 6 bytes: name being moved by the crown
!title_namelen  = !RAM_MISC+$26   ; word

; ---------------------------------------------------------------------------
; modules_menu_frame (C0:1E08, the menu loop once per frame, in vblank after
; the menu's own uploads). M16/X16, DB=$7E, D=0.
title_menu_frame:
	PHP
	JSR title_prefill_name
	PLP
	RTL

title_prefill_name:
	SEP #$20
	LDA.l !title_flags
	LSR
	BCS .done                    ; already prefilled this boot
	LDA.l $7E00E4
	ORA.l $7E00E5
	BNE .done
	LDA.l $7EA156
	CMP.b #$03
	BNE .done
	LDA.l $7EA157
	CMP.b #$12
	BNE .done
	LDA.l $7EA1CC
	BNE .done
	REP #$20
	LDA.l $7E90D0
	CMP.w #$2022
	BNE .done
	LDA.l $7E9306
	CMP.w #$2058
	BNE .done
	LDA.l $7E9308
	CMP.w #$205C
	BEQ .write
.done
	RTS
.write
	; B, O, Y: top halves in the field row, bottom halves (tile+2) below.
	LDA.w #$205C
	STA.l $7E90D2
	INC
	INC
	STA.l $7E9112
	LDA.w #$2090
	STA.l $7E90D4
	INC
	INC
	STA.l $7E9114
	LDA.w #$20B8
	STA.l $7E90D6
	INC
	INC
	STA.l $7E9116
	SEP #$20
	LDA.b #$03
	STA.l $7EA1CC
	LDA.b #$18
	STA.l $7EA157
	LDA.l $7EA20A
	ORA.b #$02
	STA.l $7EA20A
	LDA.l !title_flags
	ORA.b #$01
	STA.l !title_flags
	RTS

; ---------------------------------------------------------------------------
; At Goku's impact: hero slot $CC00 becomes GOKU and the name it held moves to
; the slot's unused tail $CC06 (crownGoku). Safe to call twice. Any M/X; all
; registers preserved.
title_crown_goku:
	PHP
	PHB
	REP #$30
	PHA
	PHX
	PHY
	PEA $7E7E
	PLB
	PLB
	; name currently in slot 0
	LDX.w #$0000
	JSR .take
	; already GOKU? then keep the tail's name instead
	CPY.w #$0004
	BNE .crown
	SEP #$20
	LDX.w #$0000
.same
	LDA.w !title_namebuf&$FFFF,X
	CMP.l title_name_goku,X
	BNE .crown16
	INX
	CPX.w #$0004
	BNE .same
	REP #$20
	LDX.w #$0006
	JSR .take
	BRA .crown
.crown16
	REP #$20
.crown
	; clear the 12-byte slot, write GOKU and the moved name
	SEP #$20
	LDX.w #$000B
	LDA.b #$00
.clear
	STA $CC00,X
	DEX
	BPL .clear
	LDX.w #$0000
.goku
	LDA.l title_name_goku,X
	STA $CC00,X
	INX
	CPX.w #$0004
	BNE .goku
	LDX.w #$0000
.tail
	CPX.w !title_namelen&$FFFF
	BEQ .done
	LDA.w !title_namebuf&$FFFF,X
	STA $CC06,X
	INX
	BRA .tail
.done
	REP #$30
	PLY
	PLX
	PLA
	PLB
	PLP
	RTS

; Read up to 6 name bytes from $CC00+X into !title_namebuf. M16 X16 in/out;
; returns Y = length (also in !title_namelen).
.take
	LDY.w #$0000
.tloop
	CPY.w #$0006
	BEQ .tend
	SEP #$20
	LDA $CC00,X
	BEQ .tend16
	CMP.b #$FF
	BEQ .tend16
	PHX
	TYX
	STA.w !title_namebuf&$FFFF,X
	PLX
	REP #$20
	INX
	INY
	BRA .tloop
.tend16
	REP #$20
.tend
	STY.w !title_namelen&$FFFF
	RTS
