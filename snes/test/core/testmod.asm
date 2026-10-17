; CORE_TEST builds only (node snes/build.mjs -DCORE_TEST=1 ...): a test
; client of the core services, driven by Lua through a WRAM mailbox at
; !core_test (7E:6F40, 128 bytes). Included inside the core code bank.
;
; +$00 cmd (Lua writes; cleared when done)  +$02 result (carry -> 1)
; +$04 pad mask, +$06 pad inject (requested every frame while nonzero)
; +$08 back sprite on, +$0A x, +$0C y, +$0E tile, +$10 size
; +$12 front sprite on, +$14 x, +$16 y, +$18 tile, +$1A size
; +$1C bit0/bit1 = back/front add returned carry this frame
; +$1E vram region (cmd 6)
; +$20 vram word address (cmd 3), +$22 bytes (cmd 3, <= $100)
; +$24/+$26 sound A/X (cmd 4), +$28 event id (cmd 5)
; +$2A field NMI calls, +$2C world NMI calls, +$2E menu frames,
; +$30 ring frames, +$32 title boots, +$34 saves, +$36 loads, +$38 new games,
; +$3A world frames, +$3C field frames, +$3E lines left at the last field NMI
; +$40 busy-loop count per frame callback (lag tests)
; cmd 7: queue +$44 uploads of +$22 bytes from VRAM +$20 on; +$48 = accepted
!ct = (!core_test&$FFFF)

core_test_frame:
	LDA.w !ct+$40                    ; burn: spin this many loops (lag tests)
	BEQ .noBurn
	TAX
.burn
	DEX
	BNE .burn
.noBurn
	LDA.w !ct+$04
	ORA.w !core_pad_mask&$FFFF
	STA.w !core_pad_mask&$FFFF
	LDA.w !ct+$06
	ORA.w !core_pad_inject&$FFFF
	STA.w !core_pad_inject&$FFFF
	STZ.w !ct+$1C
	LDA.w !ct+$08
	BEQ .noBack
	LDA.w !ct+$0A : STA.w !core_spr_x&$FFFF
	LDA.w !ct+$0C : STA.w !core_spr_y&$FFFF
	LDA.w !ct+$0E : STA.w !core_spr_tile&$FFFF
	LDA.w !ct+$10 : STA.w !core_spr_size&$FFFF
	JSL core_oam_add
	BCC .noBack
	LDA.w #$0001 : TSB.w !ct+$1C
.noBack
	LDA.w !ct+$12
	BEQ .noFront
	LDA.w !ct+$14 : STA.w !core_spr_x&$FFFF
	LDA.w !ct+$16 : STA.w !core_spr_y&$FFFF
	LDA.w !ct+$18 : STA.w !core_spr_tile&$FFFF
	LDA.w !ct+$1A : STA.w !core_spr_size&$FFFF
	JSL core_oam_add_front
	BCC .noFront
	LDA.w #$0002 : TSB.w !ct+$1C
.noFront
	LDA.w !ct+$00
	BNE .cmd
	JMP .done
.cmd
	CMP.w #$0003
	BNE .notVram
	LDA.w #core_test_pattern>>16
	STA.w !core_scratch&$FFFF
	LDA.w !ct+$20
	LDX.w !ct+$22
	LDY.w #core_test_pattern&$FFFF
	JSL core_queue_vram
	BRA .ack
.notVram
	CMP.w #$0004
	BNE .notSound
	LDA.w !ct+$24
	LDX.w !ct+$26
	JSL core_sound_queue
	BRA .ack
.notSound
	CMP.w #$0005
	BNE .notEvent
	LDA.w !ct+$28
	JSL core_event_request
	BRA .ack
.notEvent
	CMP.w #$0006
	BNE .notClaim
	LDA.w !ct+$1E
	LDX.w #$0042
	JSL core_vram_claim
	STY.w !ct+$20
	BRA .ack
.notClaim
	CMP.w #$0007
	BNE .unknown
	LDA.w !ct+$44                    ; batch: count, from +$20 by +$22 bytes each
	STA.w !ct+$46
	STZ.w !ct+$48
.batch
	LDA.w #core_test_pattern>>16
	STA.w !core_scratch&$FFFF
	LDA.w !ct+$20
	LDX.w !ct+$22
	LDY.w #core_test_pattern&$FFFF
	JSL core_queue_vram
	BCS .ack
	INC.w !ct+$48
	LDA.w !ct+$22
	LSR
	CLC
	ADC.w !ct+$20
	STA.w !ct+$20
	DEC.w !ct+$46
	BNE .batch
	CLC
	BRA .ack
.unknown
	SEC
.ack
	LDA.w #$0000
	ROL
	STA.w !ct+$02
	STZ.w !ct+$00
.done
	RTL

core_test_field:
	INC.w !ct+$3C
	JMP core_test_frame
core_test_world:
	INC.w !ct+$3A
	JMP core_test_frame
core_test_menu:
	INC.w !ct+$2E
	JMP core_test_frame
core_test_ring:
	INC.w !ct+$30
	JMP core_test_frame

; NMI callbacks (DB = $80): long addressing.
core_test_field_nmi:
	LDA.l !core_test+$2A : INC : STA.l !core_test+$2A
	JSL core_vblank_lines
	STA.l !core_test+$3E
	RTL
core_test_world_nmi:
	LDA.l !core_test+$2C : INC : STA.l !core_test+$2C
	RTL

core_test_title_boot:
	LDA.l !SRAM_WORK_CORE           ; title boots survive the WRAM clear in SRAM
	INC
	STA.l !SRAM_WORK_CORE
	STA.w !ct+$32
	RTL
core_test_save:
	INC.w !ct+$34
	RTL
core_test_load:
	INC.w !ct+$36
	RTL
core_test_new_game:
	INC.w !ct+$38
	RTL

; 256 bytes: an 8x8 4bpp checkerboard of colors 1/2, repeated.
core_test_pattern:
for i = 0..8
	db $AA,$00,$55,$FF,$AA,$00,$55,$FF,$AA,$00,$55,$FF,$AA,$00,$55,$FF,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
endfor
