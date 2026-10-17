; Core runtime: boot, per-mode frame dispatch, vblank VRAM queue, input
; filter, OAM additions, native sound/event requests and save sidecars.
; Engine facts behind every hook: docs/agents/snes-port/engine.md.
;
; Module calling convention (all core callbacks):
;   entered with JSL, P = M16/X16 (REP #$30), DB = $7E, D = $0000.
;   Preserve DB and D; A/X/Y may be clobbered; return with RTL.
;   I/O registers need long addressing ($00:21xx/$00:42xx) or a temporary
;   PHB/PLB to a 00-3F/80-BF bank.
; NMI callbacks (modules_field_nmi, modules_world_nmi) are the exception:
;   DB = $80 so I/O is directly addressable; they run in vblank, after the
;   game's own uploads, and must stay short.
; Core services are called with JSL from module code under the same
; convention (M16/X16, DB = $7E, D = 0) unless a routine says otherwise.

; ---------------------------------------------------------------------------
; Core WRAM (!RAM_CORE, $40 bytes; absolute with DB = $7E: LDA.w x&$FFFF)
!core_frame        = !RAM_CORE+$00   ; word: field frames completed since boot
!core_pad          = !RAM_CORE+$02   ; word: pad 1 held, physical ($4218 layout)
!core_pad_prev     = !RAM_CORE+$04   ; word: previous held
!core_pad_new      = !RAM_CORE+$06   ; word: pressed this frame
!core_pad_rel      = !RAM_CORE+$08   ; word: released this frame
!core_dma_count    = !RAM_CORE+$0A   ; word: queued VRAM transfers
!core_dma_ready    = !RAM_CORE+$0C   ; word: set by a frame hook, consumed by vblank
!core_dma_bytes    = !RAM_CORE+$0E   ; word: bytes queued this frame
!core_scratch      = !RAM_CORE+$10   ; 16 bytes of call-local scratch
!core_mode         = !RAM_CORE+$20   ; word: mode of the last dispatched frame (!CORE_MODE_*)
!core_frame_world  = !RAM_CORE+$22   ; word: world-flight frames completed
!core_frame_menu   = !RAM_CORE+$24   ; word: full-screen menu frames
!core_frame_ring   = !RAM_CORE+$26   ; word: ring-menu frames
!core_pad_mask     = !RAM_CORE+$28   ; word: request, buttons hidden from the game (cleared per frame)
!core_pad_inject   = !RAM_CORE+$2A   ; word: request, buttons added for the game (cleared per frame)
!core_tick         = !RAM_CORE+$2C   ; word: dispatched frames of any mode
!core_title_entry  = !RAM_CORE+$2E   ; word: 0 power-on title entry, 1 alternate entry
!core_spr_x        = !RAM_CORE+$30   ; word: core_oam_add parameter, screen X (signed)
!core_spr_y        = !RAM_CORE+$32   ; word: screen Y (signed)
!core_spr_tile     = !RAM_CORE+$34   ; word: OAM bytes 2-3 (tile | pal<<9 | prio<<12 | h<<14 | v<<15)
!core_spr_size     = !RAM_CORE+$36   ; word: 0 small, 1 large
!core_oam_native   = !RAM_CORE+$38   ; word: first OAM slot after the native sprites this frame
!core_flags        = !RAM_CORE+$3A   ; word: bit0 = sidecar restored on the last load
!core_event_last   = !RAM_CORE+$3C   ; word: last native event started by core_event_request
!core_vline        = !RAM_CORE+$3E   ; word: scanline when the last vblank flush started

; Extended core WRAM (!RAM_CORE_EXT, 7E:6E40-6FFF)
!core_dma_table    = !RAM_CORE_EXT+$000 ; !CORE_DMA_MAX x 8: src.w bank.w vram.w size.w
!core_pad_mask_live   = !RAM_CORE_EXT+$040 ; word: mask applied at the game's pad reads
!core_pad_inject_live = !RAM_CORE_EXT+$042 ; word: buttons added at the next pad read
!core_pad_reads       = !RAM_CORE_EXT+$044 ; word: pad reads left for the latched mask
!core_pad_seen        = !RAM_CORE_EXT+$046 ; word: pad 1 as last delivered to the game
!core_pad_bios        = !RAM_CORE_EXT+$048 ; word: pad 1 from the game's last read, before filtering
!core_snd_head        = !RAM_CORE_EXT+$04A ; word: next queued sound command (0-7)
!core_snd_tail        = !RAM_CORE_EXT+$04C ; word: next free sound slot (0-7)
!core_event_req       = !RAM_CORE_EXT+$04E ; word: $8000|event id while a request is pending
!core_oam_cursor      = !RAM_CORE_EXT+$050 ; word: byte offset of the next back sprite
!core_oam_limit       = !RAM_CORE_EXT+$052 ; word: byte offset end of the module area
!core_oam_front_n     = !RAM_CORE_EXT+$054 ; word: staged front sprites (field)
!core_oam_world_hw    = !RAM_CORE_EXT+$056 ; word: byte offset end of module sprites drawn in world mode
!core_oam_field_hw    = !RAM_CORE_EXT+$058 ; word: byte offset end of module sprites drawn in the field
!core_tmp0            = !RAM_CORE_EXT+$05A ; word: internal scratch
!core_tmp1            = !RAM_CORE_EXT+$05C ; word: internal scratch
!core_tmp2            = !RAM_CORE_EXT+$05E ; word: internal scratch
!core_snd_queue       = !RAM_CORE_EXT+$060 ; 8 x 4 bytes
!core_oam_front       = !RAM_CORE_EXT+$080 ; 16 x 4 bytes staged front sprites
!core_oam_front_hi    = !RAM_CORE_EXT+$0C0 ; 16 x 2 bytes: size/xhi bits (bit0 xhi, bit1 size)
!core_vram_owner      = !RAM_CORE_EXT+$0E0 ; 32 bytes: VRAM pool cell owners (core/vram.asm)
!core_test            = !RAM_CORE_EXT+$100 ; 128 bytes: CORE_TEST mailbox (test builds only)
; !RAM_CORE_EXT+$180-$1BF reserved for core.

!CORE_DMA_MAX      = 8
!CORE_DMA_BUDGET   = $0C00           ; bytes per frame accepted by core_queue_vram
!CORE_VBLANK_LAST  = 258             ; no transfer may start after this scanline
!CORE_LINE_BYTES   = 160             ; conservative DMA bytes per scanline

!CORE_MODE_NONE  = 0
!CORE_MODE_FIELD = 1
!CORE_MODE_WORLD = 2
!CORE_MODE_MENU  = 3
!CORE_MODE_RING  = 4

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

; Save P/DB/D/A/X/Y and set the callback environment (M16/X16, DB=$7E, D=0).
macro core_enter()
	PHP
	PHB
	PHD
	REP #$30
	PHA
	PHX
	PHY
	LDA.w #$0000
	TCD
	PEA $7E7E
	PLB
	PLB
endmacro
macro core_leave()
	REP #$30
	PLY
	PLX
	PLA
	PLD
	PLB
	PLP
endmacro

pushpc
org !CODE_CORE
core_code_start:

; ---------------------------------------------------------------------------
; Reset path: C0:8008 originally JML $C10010 (after CLC/XCE/SEP #$30).
core_boot:
	PHP
	REP #$30
	JSR core_clear_wram
	PLP
	JML $C10010

; FastROM (CORE_FASTROM builds): C1:4D0F clears $4200-$420D on every title
; entry, so MEMSEL is set again here. Banks $80-$FF then run at 3.58 MHz.
core_fastrom:
if defined("CORE_FASTROM")
	SEP #$20
	LDA.b #$01
	STA.l $00420D
	REP #$20
endif
	RTS

; Clear the module WRAM block and core's extended block. M16/X16 expected.
core_clear_wram:
	LDA.w #$0000
	LDX.w #(!WRAM_END-!WRAM_BASE-2)
.mod
	STA.l !WRAM_BASE,X
	DEX : DEX
	BPL .mod
	LDX.w #(!RAM_CORE_EXT_END-!RAM_CORE_EXT-2)
.ext
	STA.l !RAM_CORE_EXT,X
	DEX : DEX
	BPL .ext
	RTS

; Title program entries (C1:4CF6 JML $7EAF0B, C1:4D0B JML $7EAF28). Every way
; back to the title (power-on, Start+Select+L+R, quit) passes here after
; the program is decompressed to 7E:8000. Clears module/core WRAM, then
; modules_title_boot may patch the decompressed program.
core_title_boot:
	PHP : PHB : PHD
	REP #$30
	PHA : PHX : PHY
	JSR core_fastrom
	JSR core_clear_wram
	LDA.w #$0000 : TCD
	PEA $7E7E : PLB : PLB
	STZ.w !core_title_entry&$FFFF
if defined("CORE_TEST")
	JSL core_test_title_boot
endif
	JSL modules_title_boot
	%core_leave()
	JML $7EAF0B
core_title_boot_alt:
	PHP : PHB : PHD
	REP #$30
	PHA : PHX : PHY
	JSR core_fastrom
	JSR core_clear_wram
	LDA.w #$0000 : TCD
	PEA $7E7E : PLB : PLB
	LDA.w #$0001 : STA.w !core_title_entry&$FFFF
if defined("CORE_TEST")
	JSL core_test_title_boot
endif
	JSL modules_title_boot
	%core_leave()
	JML $7EAF28

; ---------------------------------------------------------------------------
; Shared frame bookkeeping. A = mode. M16/X16, DB = $7E, D = 0.
core_frame_begin:
	CMP.w !core_mode&$FFFF
	BEQ .same
	STA.w !core_mode&$FFFF
	JSR core_oam_mode_changed
.same
	INC.w !core_tick&$FFFF
	JSR core_read_pad
	STZ.w !core_pad_mask&$FFFF
	STZ.w !core_pad_inject&$FFFF
	JSR core_oam_begin
	RTS

; Physical pad 1 with edges. Waits out an auto-joypad read in progress.
core_read_pad:
	SEP #$20
.busy
	LDA.l $004212
	AND.b #$01
	BNE .busy
	REP #$20
	LDA.w !core_pad&$FFFF : STA.w !core_pad_prev&$FFFF
	LDA.l $004218
	STA.w !core_pad&$FFFF
	EOR.w !core_pad_prev&$FFFF : AND.w !core_pad&$FFFF
	STA.w !core_pad_new&$FFFF
	LDA.w !core_pad&$FFFF : EOR.w !core_pad_prev&$FFFF : AND.w !core_pad_prev&$FFFF
	STA.w !core_pad_rel&$FFFF
	RTS

; Work shared by every mode after its modules ran.
core_frame_end:
	JSR core_pad_latch
	JSR core_sound_pump
	RTS

; ---------------------------------------------------------------------------
; Field main loop, 00:B073 (bank 00 mirror of C0): after the frame's game
; logic and OAM build (JSR $B08C), before signalling NMI. Replaced bytes:
; SEP #$20 / LDA #$01. Also runs for Mode 7 boss arenas, dialogue and
; scripted events (they use the field loop).
core_field_frame:
	%core_enter()
	INC.w !core_frame&$FFFF
	LDA.w #!CORE_MODE_FIELD
	JSR core_frame_begin
if defined("CORE_TEST")
	JSL core_test_field
endif
	JSL modules_field_frame
	REP #$30
	LDA.w #$0000 : TCD
	PEA $7E7E : PLB : PLB
	JSR core_oam_commit_field
	JSR core_frame_end
	JSR core_event_pump
	LDA.w #$0001 : STA.w !core_dma_ready&$FFFF
	%core_leave()
	SEP #$20
	LDA.b #$01
	RTL

; Field NMI, 00:C158, after the game's own vblank work and while the screen
; is still force-blanked. Replaced bytes: SEP #$20 / LDA $2C / STA $420C.
; Module NMI work and the VRAM queue run only for frames the field loop
; completed (core_dma_ready), so lag frames are skipped as the game does.
core_field_nmi:
	PHP
	PHB
	REP #$30
	PEA $8080 : PLB : PLB          ; I/O visible through bank $80
	LDA.l !core_dma_ready
	BEQ .done
	LDA.w #$0000 : STA.l !core_dma_ready
if defined("CORE_TEST")
	JSL core_test_field_nmi
endif
	JSL modules_field_nmi
	REP #$30
	JSR core_flush_auto
.done
	PLB
	PLP
	SEP #$20
	LDA $2C
	STA $420C
	RTL

; ---------------------------------------------------------------------------
; World flight (Mode 7 overworld), 00:8085: after the world frame's logic,
; before EC=$81 hands the frame to NMI. Replaced: SEP #$20 / LDA #$81.
core_world_frame:
	%core_enter()
	INC.w !core_frame_world&$FFFF
	LDA.w #!CORE_MODE_WORLD
	JSR core_frame_begin
if defined("CORE_TEST")
	JSL core_test_world
endif
	JSL modules_world_frame
	REP #$30
	LDA.w #$0000 : TCD
	PEA $7E7E : PLB : PLB
	JSR core_oam_commit_world
	JSR core_frame_end
	LDA.w #$0001 : STA.w !core_dma_ready&$FFFF
	%core_leave()
	SEP #$20
	LDA.b #$81
	RTL

; World NMI tail, 00:8903 (JML; replaced REP #$30 / PLB / PLD, the handler
; then ends with PLY/PLX/PLA/RTI which we execute here). Reached on every
; world NMI after the game's uploads and HDMA setup. The world NMI does not
; force-blank, so the VRAM queue stops at the end of vblank; it uses DMA
; channel 6 because the world's HDMA owns channels 0-5 and 7.
core_world_nmi:
	REP #$30
	PHB
	PEA $8080 : PLB : PLB
	LDA.l !core_dma_ready
	BEQ .done
	LDA.w #$0000 : STA.l !core_dma_ready
if defined("CORE_TEST")
	JSL core_test_world_nmi
endif
	JSL modules_world_nmi
	REP #$30
	JSR core_flush_auto
.done
	PLB
	REP #$30
	PLB
	PLD
	PLY
	PLX
	PLA
	RTI

; ---------------------------------------------------------------------------
; Full-screen menus (file select, name entry, status/equipment/save
; screens; Mode 5), C0:1E08: the menu loop polls $4212 for vblank, runs its
; own uploads (C0:1DFF-1E05), then reaches here, still in vblank. Replaced:
; LDA $A201 / INC (DB = $7E, M8). Modules may touch VRAM/CGRAM here; the
; core VRAM queue is flushed right after them. Menu OAM is $7E:9C00.
core_menu_frame:
	%core_enter()
	INC.w !core_frame_menu&$FFFF
	LDA.w #!CORE_MODE_MENU
	JSR core_frame_begin
if defined("CORE_TEST")
	JSL core_test_menu
endif
	JSL modules_menu_frame
	REP #$30
	LDA.w #$0000 : TCD
	PEA $7E7E : PLB : PLB
	JSR core_frame_end
	JSR core_flush_main
	%core_leave()
	LDA $A201
	INC
	RTL

; Ring menus, C0:694F: the ring loop's wait-for-vblank returns here once per
; frame, after the field NMI uploaded OAM/CGRAM. Replaced: LDA #$08 / TSB
; $EC (M8). Field sprites stay frozen in the OAM buffer while a ring is open.
core_ring_frame:
	%core_enter()
	INC.w !core_frame_ring&$FFFF
	LDA.w #!CORE_MODE_RING
	JSR core_frame_begin
if defined("CORE_TEST")
	JSL core_test_ring
endif
	JSL modules_ring_frame
	REP #$30
	LDA.w #$0000 : TCD
	PEA $7E7E : PLB : PLB
	JSR core_frame_end
	JSR core_flush_main
	%core_leave()
	LDA.b #$08
	TSB $EC
	RTL

; ---------------------------------------------------------------------------
; Queue a VRAM upload for the next vblank of the current mode.
;   in: A16 = VRAM word address, X16 = size in bytes (even, > 0),
;       Y16 = source low word, core_scratch+0 (byte) = source bank. DB = $7E.
;   out: carry clear = queued, carry set = queue or budget full.
; Transfers run in queue order; one that would not finish inside vblank is
; deferred to the next frame (see core_flush_vram).
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

; Current scanline (0-261) in A16. Any DB; M16 on entry and exit.
; $4201 bit 7 stays set (the game writes $FF; the multitap BIOS restores $80).
core_vcount:
	SEP #$20
	LDA.l $00213F                  ; reset the OPHCT/OPVCT flip-flops
	LDA.l $002137                  ; latch H/V
	LDA.l $00213D                  ; V low
	XBA
	LDA.l $00213D                  ; V bit 8 (bits 1-7 open bus)
	AND.b #$01
	XBA
	REP #$20
	RTS

; Lines left before !CORE_VBLANK_LAST (0 outside vblank) in A16; for
; modules' own vblank work. Callable from NMI callbacks (any DB).
core_vblank_lines:
	PHP
	REP #$30
	JSR core_vcount
	CMP.w #225
	BCC .none
	CMP.w #!CORE_VBLANK_LAST
	BCS .none
	EOR.w #$FFFF : SEC : ADC.w #!CORE_VBLANK_LAST
	PLP
	RTL
.none
	LDA.w #$0000
	PLP
	RTL

; Flush the VRAM queue. A16 = DMA channel (0-7). DB must be an I/O bank.
; Each transfer starts only if it ends by !CORE_VBLANK_LAST (scanline from
; the latched V counter, !CORE_LINE_BYTES per line); the rest stay queued in
; order for the next vblank.
core_flush_vram:
	REP #$30
	AND.w #$0007
	TAX
	LDA.l core_dma_bit,X
	AND.w #$00FF
	STA.l !core_tmp1                ; MDMAEN bit
	TXA
	ASL : ASL : ASL : ASL
	STA.l !core_tmp2                ; channel register offset
	JSR core_vcount
	STA.l !core_vline
	SEP #$20
	LDA.b #$80 : STA.l $002115
	REP #$20
	LDX.w #$0000                      ; table offset of the next entry
.next
	LDA.l !core_dma_count
	BNE +
	JMP .end
+
	LDA.l !core_dma_table+6,X       ; scanlines needed: size/160 + 1
	LDY.w #$0000
.div
	INY
	SEC : SBC.w #!CORE_LINE_BYTES
	BCS .div
	TYA
	STA.l !core_tmp0
	JSR core_vcount
	CMP.w #225
	BCC .defer                      ; not in vblank
	CLC : ADC.l !core_tmp0
	CMP.w #!CORE_VBLANK_LAST+1
	BCS .defer
	PHX
	LDA.l !core_tmp2
	TAY                             ; Y = channel register offset
	LDA.l !core_dma_table+4,X : STA.l $002116
	LDA.l !core_dma_table+0,X : STA $4302,Y
	LDA.l !core_dma_table+6,X : STA $4305,Y
	LDA.l !core_dma_bytes
	SEC : SBC.l !core_dma_table+6,X
	BCS +
	LDA.w #$0000
+	STA.l !core_dma_bytes
	LDA.w #$1801 : STA $4300,Y        ; 2 registers ($2118/9), A -> B
	SEP #$20
	LDA.l !core_dma_table+2,X : STA $4304,Y
	LDA.l !core_tmp1 : STA.l $00420B
	REP #$20
	PLX
	LDA.l !core_dma_count : DEC : STA.l !core_dma_count
	TXA : CLC : ADC.w #$0008 : TAX
	JMP .next
.defer
	TXA
	BEQ .end                        ; nothing sent: the table is in place
	CLC : ADC.w #!core_dma_table&$FFFF
	TAX                             ; first remaining entry
	LDY.w #!core_dma_table&$FFFF
	LDA.l !core_dma_count
	ASL : ASL : ASL : DEC
	PHB
	MVN $7E,$7E
	PLB
	RTS
.end
	LDA.l !core_dma_count
	BNE +
	LDA.w #$0000 : STA.l !core_dma_bytes
+	RTS

core_dma_bit:
	db $01,$02,$04,$08,$10,$20,$40,$80

; Flush on a DMA channel no HDMA channel uses: 7, 6, 5 or 4, checked against
; the game's HDMA mask $2C (world flight also runs HDMA on channels 0-5).
; Skips the flush (entries wait) when none is free. DB = an I/O bank.
core_flush_auto:
	REP #$30
	LDA.l !core_dma_count
	BEQ .none
	LDA.l $7E002C
	AND.w #$00FF
	STA.l !core_tmp0
	LDA.l !core_mode
	CMP.w #!CORE_MODE_WORLD
	BNE .mask
	LDA.l !core_tmp0
	ORA.w #$003F
	STA.l !core_tmp0
.mask
	LDX.w #$0007
.try
	LDA.l core_dma_bit,X
	AND.w #$00FF
	AND.l !core_tmp0
	BEQ .found
	DEX
	CPX.w #$0004
	BCS .try
.none
	RTS
.found
	TXA
	JMP core_flush_vram

; Flush from a main-loop hook that runs in vblank (menus, rings). DB = $7E.
core_flush_main:
	LDA.w !core_dma_count&$FFFF
	BEQ .none
	PHB
	PEA $8080 : PLB : PLB
	JSR core_flush_auto
	PLB
.none
	RTS

incsrc "input.asm"
incsrc "oam.asm"
incsrc "services.asm"
incsrc "save.asm"
incsrc "vram.asm"
if defined("CORE_TEST")
	incsrc "../../test/core/testmod.asm"
endif

core_code_end:
assert core_code_end <= !CODE_CORE+$7000, "core code bank overflow (dispatch tables start at +$7000)"
pullpc

incsrc "hooks.asm"
