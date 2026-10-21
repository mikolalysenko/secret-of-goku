; Native effect cells (docs/agents/snes-port/fx.md, "Native effect cells").
; The cache's three OBJ VRAM regions are not free by construction: the
; game's actor streamer (C1:950D, every field vblank) writes actor slots'
; effect pieces there. Each piece is 32x16 (two cache entries; slot 5's
; first piece covers entry 0 only):
;   FIELD_OBJ_A $7220/$7320: slot 5 ($7E:EA00) pieces 1-4, $7200+$40*(k-1)
;   FIELD_OBJ_B $7840/$7940: slot 1 ($7E:E200) pieces 4-5, $7840 / $7880
;   FIELD_OBJ_C $7A80/$7B80: slot 2 ($7E:E400) pieces 4-5, $7A80 / $7AC0
; Piece k streams while the slot's cell count (+$84, byte) is at least 2k-1.
; The fifth piece also streams once per request (+$8D, low byte, cleared by
; the streamer, set with the weapon effect +$61 at C2:BF36/BF7C) and is
; shown while that effect runs. Damage numbers are actors too: in slot 5
; their digits replaced cells FX still believed resident, so the aura,
; which allocates first, showed white digits with black outlines.
;
; The streamer runs one phase per vblank, $56 (C1:9530), which the field
; loop advances only after a completed frame's vblank (C0:B07D): every
; vblank of a frame's logic, lag vblanks included, streams that phase.
; Slot 5's pieces stream in phase 2 (C1:A58B, or C1:9574 then A7B6), slots
; 1 and 2's in phase 4 (C1:99CB). Until its stream a claimed entry still
; holds FX's own cell.
;
; - Every FX frame (fx_begin, inlined) and for UI leases (fx_native_drop):
;   entries the coming vblank streams forget their cell (residency bit,
;   pending and failed upload; a UI lease its key). Slot 5's in phases 1-2
;   (phase 2, or a lag vblank of the next frame), slots 1-2's in phase 4.
; - FX's allocator checks the free entry it takes (fx_cache_candidate);
;   UI leases skip every claimed entry (fx_native_mask, once per frame).
; All: M16/X16, DB = $7E, any D (no direct page); X/Y lost unless noted.

; A = phase of the coming vblank (0-4).
fx_native_drop:
	CMP.w #4
	BEQ fx_native_drop12
	DEC
	CMP.w #2
	BCS .none
	SEP #$20
	LDA.w $EA84
	REP #$20
	BNE fx_native_drop5
.none
	RTS

; Slot 5's pieces (phases 1-2).
fx_native_drop5:
	JSR fx_native_slot5
	BRA fx_native_forget

; Slots 1 and 2's fourth and fifth pieces (phase 4).
fx_native_drop12:
	SEP #$20
	LDA.w $E284                  ; usually: no fourth piece and no fifth
	CMP.b #7
	BCS +
	LDA.w $E484
	CMP.b #7
	BCS +
	LDA.w $E28D
	ORA.w $E261
	ORA.w $E48D
	ORA.w $E461
	BNE +
	REP #$20
	RTS
+	REP #$20
	JSR fx_native_slots12
	; fall through
; A = entries whose cell is forgotten. Free and unheld entries are kept.
fx_native_forget:
	BEQ .done
	LDX.w #0                     ; entry * 2
.entry
	LSR
	BCC .next
	PHA                          ; the entries still to visit
	LDA.l !fx_ccell,X
	CMP.w #$FFFE
	BCS .kept                    ; free, or a region FX does not hold
	CMP.w #$0200
	BCS .forget                  ; a UI lease: only its key is dropped
	PHA                          ; cell id: clear its residency bit
	AND.w #7
	PHX
	TAX
	LDA.l fx_bit8,X
	EOR.w #$FFFF
	PLX
	PHA
	LDA $03,S
	LSR : LSR : LSR
	PHX
	TAX
	SEP #$20
	LDA.l !fx_rbits,X
	AND $03,S
	STA.l !fx_rbits,X
	REP #$20
	PLX
	PLA
	PLA
.forget
	LDA.w #$FFFF
	STA.l !fx_ccell,X
	LDA.l fx_entry_bit,X         ; its upload would overwrite the game's
	EOR.w #$FFFF
	PHA
	AND.l !fx_cpend
	STA.l !fx_cpend
	PLA
	AND.l !fx_cfail
	STA.l !fx_cfail
.kept
	PLA
.next
	INX
	INX
	CMP.w #$0000
	BNE .entry
.done
	RTS

; Out: A = every entry the game streams or shows (also !fx_native), computed
; once per FX frame.
fx_native_mask:
	LDA.l !fx_frame
	CMP.l !fx_native_at
	BNE +
	LDA.l !fx_native
	RTS
+	STA.l !fx_native_at
	JSR fx_native_slots12
	PHA
	JSR fx_native_slot5
	ORA $01,S
	STA.l !fx_native
	PLY
	RTS

; A = entries of slot 5's pieces (cell count $EA84).
fx_native_slot5:
	LDA.w $EA84
	AND.w #$00FF
	CMP.w #8
	BCC +
	LDA.w #7
+	ASL
	TAX
	LDA.l fx_native_a,X
	RTS

; A = entries of slots 1 and 2's fourth and fifth pieces.
fx_native_slots12:
	LDY.w #$0000
	LDA.w $E284                  ; slot 1: piece 4 at 7 cells, piece 5 at 9
	AND.w #$00FF
	CMP.w #7
	BCC .s1fifth
	LDY.w #$0180
	CMP.w #9
	BCS .s1busy
.s1fifth
	LDA.w $E28D                  ; fifth piece requested, or its effect runs
	ORA.w $E261
	AND.w #$00FF
	BEQ .s2
.s1busy
	TYA
	ORA.w #$0600
	TAY
.s2
	LDA.w $E484                  ; slot 2: the same layout, entries 11-14
	AND.w #$00FF
	CMP.w #7
	BCC .s2fifth
	TYA
	ORA.w #$1800
	TAY
	LDA.w $E484
	AND.w #$00FF
	CMP.w #9
	BCS .s2busy
.s2fifth
	LDA.w $E48D
	ORA.w $E461
	AND.w #$00FF
	BEQ .done
.s2busy
	TYA
	ORA.w #$6000
	TAY
.done
	TYA
	RTS

; Slot 5's cell count (0-7+) -> entries its pieces 1..(count+1)/2 cover.
fx_native_a:
	dw $0000, $0001, $0001, $0007, $0007, $001F, $001F, $007F
