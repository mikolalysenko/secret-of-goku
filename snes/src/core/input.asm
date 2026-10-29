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
	PHP
	; Once no multitap is present, ordinary polls can use the same auto-read
	; registers as the BIOS's no-multitap branch. Probe again after 255 polls
	; for hotplugging; a present multitap always takes the original serial
	; path so pads 2/3 stay current on every poll.
	LDA.l !core_pad_probe
	BEQ .bios
	DEC
	STA.l !core_pad_probe
.wait_ready
	LDA.l $004212                  ; as FE70: never sample an active auto-read
	AND.b #1
	BNE .wait_ready
	REP #$20
	LDA.l $004218
	STA.l $7E0042
	LDA.l $00421A
	STA.l $7E0044
	LDA.w #$0000
	STA.l $7E0046
	PLP
	BRA .filter
.bios
	PLP
	JSL $CFFE00
	PHP
	CMP.b #$FF
	BEQ .present
	LDA.b #255
	BRA .probe
.present
	LDA.b #0
.probe
	STA.l !core_pad_probe
	PLP
.filter
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
	ORA.l !core_pad_inject_live
	BEQ .filtered
	LDA.l !core_pad_mask_live
	EOR.w #$FFFF
	AND.l $7E0042
	ORA.l !core_pad_inject_live
	STA.l $7E0042
	LDA.w #$0000
	STA.l !core_pad_inject_live
.seen
.filtered
	; Flight chords must hide altitude buttons on their very first read.
	; A frame-latched mask alone arrives after native descent/landing has
	; already consumed L+B (or ascent has consumed L+A).
	LDA.l !core_pad_bios
	BIT.w #!PAD_L
	BEQ .record
	LDA.l !persist_goku_active
	AND.w #$00FF
	BEQ .record
	LDA.l $7E0100
	CMP.w #$CF5C                   ; native world-flight NMI, not a field/menu
	BNE .record
	LDA.l $7E0102
	CMP.w #$0088
	BNE .record
	LDA.l $7E0042
	AND.w #$FFFF^(!PAD_A|!PAD_B)
	STA.l $7E0042
.record
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
