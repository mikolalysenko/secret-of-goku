; Save sidecars (included by core.asm in the core bank).
;
; Native GAME FILE records (C7:55D6 save, C7:557A load, C7:5F4A new game):
; slot s ($A211, 0-3) is $2BC bytes at SRAM $30:6000 + s*$400 with an
; identical backup at +$1000, written in the same pass. +0 = $C5, +1/+2 =
; checksum (C7:5CDC), +3.. data ($CC00 names/inventory, $CF00 flags packed
; to nibbles, $E180/$E380/$E580 party stats, ...), +$2B7 the slot's save
; sequence (1-99), +$2B8 the latest sequence of all slots, +$2B9/$2BA the
; $0108 word, +$2BB = $3A. Every save rewrites +$2B8 and the checksum of all
; valid slots (C7:5653), so a sidecar binds to a hash of the record that
; skips +$00-$02 and +$2B8. $30:7FFF holds the last used slot. The loader
; (C7:583C) uses the backup when the primary fails validation ($A215).
;
; Sidecar for slot s: !SRAM_SLOTS + s*!SRAM_SLOT_SIZE:
;   +$00 'GK' magic (word $4B47), +$02 version (1), +$04 slot,
;   +$06 record sequence (+$2B7), +$08 record hash, +$0A data hash,
;   +$0C data size ($400), +$0E..$1F zero, +$20 copy of !SRAM_LIVE.
; Written after the native save (magic last). On load the sidecar is used
; only if its header, data hash and record binding match the primary or the
; backup record; otherwise !SRAM_LIVE is cleared (legacy save: version 0).

!SIDE_MAGIC = $4B47
!SIDE_VERSION = 1

; C0:2E87: JSL $C755D6 (save to slot $A211). Caller: M8/X16, DB = $7E.
core_save:
	%core_enter()
if defined("CORE_TEST")
	JSL core_test_save
endif
	JSL modules_save
	%core_leave()
	JSL $C755D6
	%core_enter()
	JSR core_sidecar_store
	%core_leave()
	RTL

; C0:2EC1: JSL $C7557A (load slot $A211; $A212 bit 2 set on failure, after
; which the menu runs the new-game initializer).
core_load:
	JSL $C7557A
	%core_enter()
	LDA.w $A212
	AND.w #$0004
	BNE .failed
	JSR core_sidecar_restore
if defined("CORE_TEST")
	JSL core_test_load
endif
	JSL modules_load
.failed
	%core_leave()
	RTL

; C7:5F6F: JSL $C00030 (new game: inventory initializer C0:5745, after
; $CF00-$CFFF were cleared). Clears !SRAM_LIVE and marks it initialised.
core_new_game:
	JSL $C00030
	%core_enter()
	JSR core_live_clear
	SEP #$20
	LDA.b #!SIDE_VERSION
	STA.l !persist_version
	REP #$20
	LDA.w !core_flags&$FFFF
	AND.w #$FFFE
	STA.w !core_flags&$FFFF
if defined("CORE_TEST")
	JSL core_test_new_game
endif
	JSL modules_new_game
	%core_leave()
	RTL

core_live_clear:
	LDA.w #$0000
	LDX.w #!SRAM_LIVE_SIZE-2
.loop
	STA.l !SRAM_LIVE,X
	DEX : DEX
	BPL .loop
	RTS

; Slot offsets: !core_tmp0 = slot * $400 (record), X = slot * $420 (sidecar).
core_slot_offsets:
	LDA.w $A211
	AND.w #$0003
	PHA
	XBA : ASL : ASL                   ; * $400
	STA.w !core_tmp0&$FFFF
	PLA
	STA.w !core_tmp1&$FFFF
	ASL : ASL : ASL : ASL : ASL       ; * $20
	CLC : ADC.w !core_tmp0&$FFFF      ; * $420
	TAX
	RTS

; Hash of a native record: A16 = record offset (0-$1FFF) -> A16 = hash.
; Covers +$03..+$2B7 and +$2B9..+$2BA.
core_record_hash:
	TAX
	INX : INX : INX
	LDY.w #$02B5
	JSR core_hash_init
.a
	LDA.l $306000,X
	JSR core_hash_byte
	INX
	DEY
	BNE .a
	INX                               ; skip +$2B8
	LDY.w #$0002
.b
	LDA.l $306000,X
	JSR core_hash_byte
	INX
	DEY
	BNE .b
	JMP core_hash_result

; Hash of a sidecar's data: X16 = sidecar offset -> A16 = hash.
core_side_hash:
	LDY.w #!SRAM_LIVE_SIZE
	JSR core_hash_init
.loop
	LDA.l !SRAM_SLOTS+$20,X
	JSR core_hash_byte
	INX
	DEY
	BNE .loop
	JMP core_hash_result

; Fletcher-style 16-bit sums in !core_tmp1/!core_tmp2 (low bytes count).
core_hash_init:
	LDA.w #$0000
	STA.w !core_tmp1&$FFFF
	LDA.w #$0055
	STA.w !core_tmp2&$FFFF
	RTS
core_hash_byte:
	AND.w #$00FF
	CLC : ADC.w !core_tmp1&$FFFF
	STA.w !core_tmp1&$FFFF
	CLC : ADC.w !core_tmp2&$FFFF
	STA.w !core_tmp2&$FFFF
	RTS
core_hash_result:
	LDA.w !core_tmp1&$FFFF
	XBA
	EOR.w !core_tmp2&$FFFF
	RTS

core_sidecar_store:
	JSR core_slot_offsets
	STX.w !core_scratch&$FFFF         ; sidecar offset
	; Invalidate, copy the live block, then write the header, magic last.
	LDA.w #$0000
	STA.l !SRAM_SLOTS+$00,X
	TXA
	CLC : ADC.w #(!SRAM_SLOTS&$FFFF)+$20
	TAY                               ; destination
	LDX.w #!SRAM_LIVE&$FFFF           ; source
	LDA.w #!SRAM_LIVE_SIZE-1
	PHB
	MVN (!SRAM_SLOTS>>16),(!SRAM_LIVE>>16)
	PLB
	LDA.w !core_tmp0&$FFFF
	JSR core_record_hash
	LDX.w !core_scratch&$FFFF
	STA.l !SRAM_SLOTS+$08,X
	JSR core_side_hash
	LDX.w !core_scratch&$FFFF
	STA.l !SRAM_SLOTS+$0A,X
	LDA.w #!SIDE_VERSION
	STA.l !SRAM_SLOTS+$02,X
	LDA.w $A211
	AND.w #$0003
	STA.l !SRAM_SLOTS+$04,X
	LDA.w !core_tmp0&$FFFF
	TAX
	LDA.l $3062B7,X
	AND.w #$00FF
	LDX.w !core_scratch&$FFFF
	STA.l !SRAM_SLOTS+$06,X
	LDA.w #!SRAM_LIVE_SIZE
	STA.l !SRAM_SLOTS+$0C,X
	LDA.w #$0000
	STA.l !SRAM_SLOTS+$0E,X
	STA.l !SRAM_SLOTS+$10,X
	STA.l !SRAM_SLOTS+$12,X
	STA.l !SRAM_SLOTS+$14,X
	STA.l !SRAM_SLOTS+$16,X
	STA.l !SRAM_SLOTS+$18,X
	STA.l !SRAM_SLOTS+$1A,X
	STA.l !SRAM_SLOTS+$1C,X
	STA.l !SRAM_SLOTS+$1E,X
	LDA.w #!SIDE_MAGIC
	STA.l !SRAM_SLOTS+$00,X
	RTS

core_sidecar_restore:
	JSR core_slot_offsets
	STX.w !core_scratch&$FFFF
	LDA.l !SRAM_SLOTS+$00,X
	CMP.w #!SIDE_MAGIC
	BNE .reject
	LDA.l !SRAM_SLOTS+$02,X
	CMP.w #!SIDE_VERSION
	BNE .reject
	LDA.l !SRAM_SLOTS+$04,X
	CMP.w !core_tmp1&$FFFF            ; slot
	BNE .reject
	LDA.l !SRAM_SLOTS+$0C,X
	CMP.w #!SRAM_LIVE_SIZE
	BNE .reject
	JSR core_side_hash
	LDX.w !core_scratch&$FFFF
	CMP.l !SRAM_SLOTS+$0A,X
	BNE .reject
	; Bind to the record the game loaded: primary or backup.
	LDA.w !core_tmp0&$FFFF
	PHA
	JSR core_record_hash
	LDX.w !core_scratch&$FFFF
	CMP.l !SRAM_SLOTS+$08,X
	BEQ .bound
	PLA
	PHA
	CLC : ADC.w #$1000
	JSR core_record_hash
	LDX.w !core_scratch&$FFFF
	CMP.l !SRAM_SLOTS+$08,X
	BNE .rejectPop
.bound
	PLA
	TXA
	CLC : ADC.w #(!SRAM_SLOTS&$FFFF)+$20
	TAX                               ; source
	LDY.w #!SRAM_LIVE&$FFFF           ; destination
	LDA.w #!SRAM_LIVE_SIZE-1
	PHB
	MVN (!SRAM_LIVE>>16),(!SRAM_SLOTS>>16)
	PLB
	LDA.w !core_flags&$FFFF
	ORA.w #$0001
	STA.w !core_flags&$FFFF
	RTS
.rejectPop
	PLA
.reject
	JSR core_live_clear
	LDA.w !core_flags&$FFFF
	AND.w #$FFFE
	STA.w !core_flags&$FFFF
	RTS
