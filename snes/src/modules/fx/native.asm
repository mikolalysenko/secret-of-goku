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
; which allocates first, showed white digits with black outlines. A killed
; enemy becomes one (species $F9, +$180) at once; its count rises to 3
; five to ten frames later, so slot 5's first three entries are claimed
; from the kill on.
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
;   (phase 2, or a lag vblank of the next frame), slots 1-2's in phase 4
;   (also in phase 3 cost 3 more CPU misses per 240 charge frames).
; - Those entries then hold the game's pixels: !fx_cused = $FFFF marks
;   them (also while FX does not hold the region), and fx_cache_get draws
;   a cell taken there, or over a UI lease, only once its upload landed.
;   A late vblank that slips the upload then shows nothing, not digits.
; - FX's allocator checks the free entry it takes (fx_cache_candidate);
;   UI leases skip every claimed entry (fx_native_mask, once per frame).
; Cache routines below: M16/X16, DB = $7E, any D (no direct page); X/Y lost
; unless noted. The weapon-ready hook above has its own M8/X16 ABI.

; C2:BF7C has just prepared a weapon effect's fifth piece. The native
; streamer may not send it for four more vblanks, although its sprite is
; already visible. Send the prepared cells in the next pre-upload instead of
; competing with the full shared queue. Entered M8/X16, with the original
; helper's outputs.
%orig4($C2BF7C, $20E08DFE)
%hijack($C2BF7C, fx_native_weapon_ready, 4, fx)

fx_native_weapon_ready:
	; Remember the actor offset without changing the native helper's inputs.
	PHA
	PHB
	LDA.b #$31
	PHA
	PLB
	STX.w !fx_s&$FFFF
	PLB
	PLA
	INC $E08D,X
	; BF83 returns with RTS. Send it through C2:BF82's original RTL, with
	; our own bank/offset beneath that return for the continuation here.
	PHK
	PER .returned-1
	PEA $BF82-1
	JML $C2BF83
.returned
	PHP
	REP #$30
	PHA
	PHX
	PHY
	PHB
	PEA $7E7E : PLB : PLB          ; the lease/cache routines require DB = $7E
	LDA.l !fx_s
	CMP.w #$0200
	BNE +
	JMP .girl
+	CMP.w #$0400
	BEQ .sprite
	JMP .done
.sprite
	LDA.w #$6000                  ; native upload wins: forget any FX ownership
	JSR fx_native_forget
	LDA.l !fx_pbig
	ORA.w #$0050
	STA.l !fx_pbig
	JMP .done
.girl
	LDA.w #$0600                  ; native upload wins: forget any FX ownership
	JSR fx_native_forget
	LDA.l !fx_pbig
	ORA.w #$0028
	STA.l !fx_pbig
.done
	PLB
	PLY
	PLX
	PLA
	PLP
	RTL

; Required fifth-piece uploads, after the shared FX/core queues. Two pending
; bits in fx_pbig are free (polygon state uses only bits 0-2). Any DB, M16/X16.
macro fx_native_pre_cell(vram, source)
	LDA.w #<vram>
	STA $2116
	LDA.w #<source>
	STA $4372
	LDA.w #64
	STA $4375
	LDA.w #$0080
	STA $420B
endmacro

fx_preupload:
	LDA.l !fx_pbig
	AND.w #$0060
	BEQ .send
	LDA.l !fx_pbig
	AND.w #$FF9F
	STA.l !fx_pbig                 ; the crowded NMI hides this effect instead
	RTL
.send
	LDA.l !fx_pbig
	AND.w #$0018
	BEQ .done
	PHA
	LDA.l !fx_pbig
	AND.w #$FFE7
	STA.l !fx_pbig
	LDA.w #$1801
	STA $4370
	LDA.w #$007E
	STA $4374
	PLX
	TXA
	BIT.w #$0010
	BNE .sprite
	TXA
	BIT.w #$0008
	BEQ .done
	JMP .girl
.done
	RTL
.sprite
	%fx_native_pre_cell($7AC0, $4400)
	%fx_native_pre_cell($7BC0, $4440)
	%fx_native_pre_cell($7AE0, $4480)
	%fx_native_pre_cell($7BE0, $44C0)
	TXA
	BIT.w #$0008
	BEQ .finished
	JMP .girl
.finished
	RTL
.girl
	%fx_native_pre_cell($7880, $4200)
	%fx_native_pre_cell($7980, $4240)
	%fx_native_pre_cell($78A0, $4280)
	%fx_native_pre_cell($79A0, $42C0)
	RTL

; A = phase of the coming vblank (0-4).
fx_native_drop:
	CMP.w #4
	BEQ fx_native_drop12
	DEC
	CMP.w #2
	BCS .none
	SEP #$20
	LDA.w $EA84
	BNE .five
	LDA.w $EA80
	CMP.b #$F9
	BEQ .five
	REP #$20
.none
	RTS
.five
	REP #$20
	BRA fx_native_drop5

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
; A = entries the game streams over: each holds the game's pixels from now
; on (!fx_cused = $FFFF) and forgets its cell. Free and unheld entries
; stay free and unheld.
fx_native_forget:
	BEQ .done
	LDX.w #0                     ; entry * 2
.entry
	LSR
	BCC .next
	PHA                          ; the entries still to visit
	LDA.w #$FFFF
	STA.l !fx_cused,X
	LDA.l !fx_ccell,X
	CMP.w #$FFFE
	BCS .kept                    ; free, or a region FX does not hold
	CMP.w #$0200
	BCS .forget                  ; a UI lease: only its key is dropped
	CMP.w #!FX_RBITS_SIZE*8
	BCS .counted                 ; past the bitmap (impact cells): no bit
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
.counted
	SEP #$20
	LDA.l !fx_evict              ; a cell leaves (fx_warm's callers look again)
	INC
	STA.l !fx_evict
	REP #$20
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

; A = entries of slot 5's pieces (cell count $EA84; a damage-number object
; claims its three cells before its count rises).
fx_native_slot5:
	LDA.w $EA84
	AND.w #$00FF
	CMP.w #8
	BCC +
	LDA.w #7
+	ASL
	TAX
	LDA.w $EA80
	AND.w #$00FF
	CMP.w #$00F9
	BEQ +
	LDA.l fx_native_a,X
	RTS
+	LDA.l fx_native_a,X
	ORA.w #$0007
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
