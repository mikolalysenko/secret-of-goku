; Core runtime: boot, per-frame dispatch, NMI DMA queue and input edges.
;
; asar does not track REP/SEP: always write immediates as #.b / #.w (or
; LDA.w #$xx) so their width matches the M/X state at that instruction.
;
; Module calling convention (all core callbacks):
;   entered with JSL, P = M16/X16 (REP #$30), DB = $7E, D = $0000.
;   Preserve DB and D; A/X/Y may be clobbered; return with RTL.
;   I/O registers need long addressing ($00:21xx/$00:42xx) or a temporary
;   PHB/PLB to a 00-3F/80-BF bank.
; NMI callbacks (modules_field_nmi) are the exception: DB = $80 so I/O is
; directly addressable; they run in vblank and must stay short.

; ---------------------------------------------------------------------------
; Core WRAM (!RAM_CORE, 0x40 bytes)
!core_frame        = !RAM_CORE+$00   ; word: field frames since boot
!core_pad          = !RAM_CORE+$02   ; word: pad 1 held ($4218 layout)
!core_pad_prev     = !RAM_CORE+$04   ; word: previous held
!core_pad_new      = !RAM_CORE+$06   ; word: pressed this frame
!core_pad_rel      = !RAM_CORE+$08   ; word: released this frame
!core_dma_count    = !RAM_CORE+$0A   ; word: queued VRAM transfers
!core_dma_ready    = !RAM_CORE+$0C   ; word: set by frame hook, consumed by NMI
!core_dma_bytes    = !RAM_CORE+$0E   ; word: bytes queued this frame
!core_scratch      = !RAM_CORE+$10   ; 16 bytes of call-local scratch
; VRAM upload queue in the spare WRAM at 7E:6E40 (never used by the game).
!CORE_DMA_MAX      = 8
!core_dma_table    = $7E6E40         ; !CORE_DMA_MAX x 8 bytes: src.w(2) bank(2) vram.w(2) size.w(2)
!CORE_DMA_BUDGET   = $0C00           ; bytes per vblank for module uploads

; Pad bits ($4218 layout)
!PAD_B      = $8000
!PAD_Y      = $4000
!PAD_SELECT = $2000
!PAD_START  = $1000
!PAD_UP     = $0800
!PAD_DOWN   = $0400
!PAD_LEFT   = $0200
!PAD_RIGHT  = $0100
!PAD_A      = $0080
!PAD_X      = $0040
!PAD_L      = $0020
!PAD_R      = $0010

pushpc
org !CODE_CORE
core_code_start:

; ---------------------------------------------------------------------------
; Reset path: C0:8008 originally JML $C10010 (after CLC/XCE/SEP #$30).
; Clear our WRAM block, then continue with the original boot.
core_boot:
	PHP
	REP #$30
	LDA.w #$0000
	LDX.w #(!WRAM_END-!WRAM_BASE-2)
.clear
	STA.l !WRAM_BASE,X
	DEX : DEX
	BPL .clear
	PLP
	JML $C10010

; ---------------------------------------------------------------------------
; Field main loop, C0:B073: after the frame's game logic (JSR $B08C) and
; before signalling NMI. Replaced bytes: SEP #$20 / LDA #$01.
core_field_frame:
	PHP
	PHB
	PHD
	REP #$30
	LDA.w #$0000 : TCD
	PEA $7E7E : PLB : PLB
	INC.w !core_frame&$FFFF
	JSR core_read_pad
	JSL modules_field_frame
	REP #$30
	LDA.w #$0001 : STA.w !core_dma_ready&$FFFF
	PLD
	PLB
	PLP
	SEP #$20
	LDA.b #$01
	RTL

core_read_pad:
	LDA.w !core_pad&$FFFF : STA.w !core_pad_prev&$FFFF
	LDA.l $004218
	STA.w !core_pad&$FFFF
	EOR.w !core_pad_prev&$FFFF : AND.w !core_pad&$FFFF
	STA.w !core_pad_new&$FFFF
	LDA.w !core_pad&$FFFF : EOR.w !core_pad_prev&$FFFF : AND.w !core_pad_prev&$FFFF
	STA.w !core_pad_rel&$FFFF
	RTS

; ---------------------------------------------------------------------------
; Queue a VRAM upload for the next field vblank.
;   in: A16 = VRAM word address, X16 = size in bytes, Y16 = source low word,
;       core_scratch+0 (byte) = source bank. DB = $7E.
;   out: carry clear = queued, carry set = queue or budget full.
core_queue_vram:
	PHA
	LDA.w !core_dma_count&$FFFF
	CMP.w #!CORE_DMA_MAX
	BCS .full
	TXA : CLC : ADC.w !core_dma_bytes&$FFFF
	CMP.w #!CORE_DMA_BUDGET+1
	BCS .full
	STA.w !core_dma_bytes&$FFFF
	LDA.w !core_dma_count&$FFFF
	ASL : ASL : ASL
	PHX
	TAX
	TYA : STA.l !core_dma_table+0,X
	LDA.w !core_scratch&$FFFF : AND.w #$00FF : STA.l !core_dma_table+2,X
	PLA : STA.l !core_dma_table+6,X
	PLA : STA.l !core_dma_table+4,X
	INC.w !core_dma_count&$FFFF
	CLC
	RTL
.full
	PLA
	SEC
	RTL

; ---------------------------------------------------------------------------
; Field NMI, 00:C158, after the game's own vblank work. Replaced bytes:
; SEP #$20 / LDA $2C / STA $420C. Runs module NMI work and our VRAM queue
; only for frames the main loop completed (core_dma_ready).
core_field_nmi:
	PHB
	REP #$30
	PEA $8080 : PLB : PLB          ; I/O visible through bank $80
	LDA.l !core_dma_ready
	BEQ .done
	LDA.w #$0000 : STA.l !core_dma_ready
	JSL modules_field_nmi
	JSR core_flush_vram
.done
	PLB
	SEP #$20
	LDA $2C
	STA $420C
	RTL

; DB = $80 here. Channel 7 is the game's own NMI DMA channel.
core_flush_vram:
	SEP #$20
	LDA.b #$80 : STA $2115
	REP #$20
	LDX.w #$0000
.next
	LDA.l !core_dma_count
	BEQ .end
	DEC : STA.l !core_dma_count
	LDA.l !core_dma_table+4,X : STA $2116
	LDA.l !core_dma_table+0,X : STA $4372
	LDA.l !core_dma_table+6,X : STA $4375
	LDA.w #$1801 : STA $4370
	SEP #$20
	LDA.l !core_dma_table+2,X : STA $4374
	LDA.b #$80 : STA $420B
	REP #$20
	TXA : CLC : ADC.w #$0008 : TAX
	BRA .next
.end
	LDA.w #$0000 : STA.l !core_dma_bytes
	RTS

core_code_end:
assert core_code_end <= !CODE_CORE+$8000, "core code bank overflow"
pullpc

%orig4($C08008, $C100105C)
%hijack($C08008, core_boot, 4, core)
%orig4($C0B073, $01A920E2)
%hijack_jsl($C0B073, core_field_frame, 4, core)
%orig4($00C158, $2CA520E2)
%hijack_jsl($00C158, core_field_nmi, 7, core)
