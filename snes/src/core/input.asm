; Pad 1 filter (included by core.asm inside the core code bank).
;
; Every pad read of the game goes through C0:93B9 -> C0:951C -> JSL $CFFE00
; (Nintendo's MULTI5 multitap BIOS), which leaves pads 1-3 at $7E:0042/44/46
; in $4218 layout. C0:93B9 then zeroes non-standard controllers, soft-resets
; on Start+Select+L+R, applies the controller-config remap ($EE-$F0) and
; folds the result into $E9-$EB (held) and $CC-$CE (new presses). Field
; movement (C0:B69C, pad of the member in $D9), rings, dialogue, menus and
; world flight all read those bytes, so filtering $42 right after the BIOS
; applies to all of them. The title/intro program in WRAM reads no pads
; through this path and is not filtered.
;
; Modules request per frame (in any frame callback):
;   ORA into !core_pad_mask   - buttons the game must not see,
;   ORA into !core_pad_inject - buttons the game sees as held.
; Requests are cleared before each frame dispatch and latched after it.
; The mask applies to the game's next reads (at most two, so a mode without
; core callbacks never keeps a stale mask). Injected buttons accumulate until
; one read consumes them, so a one-frame request survives the menus' slower
; poll (every 4th frame). Keep requesting every frame to hold a button.
; !core_pad stays the physical pad; !core_pad_seen is what the game got.

; C0:951D: JSL $CFFE00 -> JSL core_pad_bios. Caller state: D = 0, M8;
; returns A from the BIOS (low byte $FF = multitap present) and P unchanged.
core_pad_bios:
	JSL $CFFE00
	PHP
	REP #$30
	PHA
	LDA.l $7E0042
	STA.l !core_pad_bios
	LDA.l !core_pad_reads
	BEQ .seen
	DEC
	STA.l !core_pad_reads
	LDA.l !core_pad_mask_live
	EOR.w #$FFFF
	AND.l $7E0042
	ORA.l !core_pad_inject_live
	STA.l $7E0042
	LDA.w #$0000
	STA.l !core_pad_inject_live
.seen
	LDA.l $7E0042
	STA.l !core_pad_seen
	PLA
	PLP
	RTL

; Latch this frame's requests (core_frame_end). M16/X16, DB = $7E.
core_pad_latch:
	LDA.w !core_pad_mask&$FFFF
	STA.l !core_pad_mask_live
	LDA.w !core_pad_inject&$FFFF
	AND.w #$FFF0                       ; bits 0-3 are the controller ID
	ORA.l !core_pad_inject_live
	STA.l !core_pad_inject_live
	LDA.w #$0002
	STA.l !core_pad_reads
	RTS
