; Screen-space world flyby. No field FX entry is called here: world owns
; HDMA 0-5; channels 6/7 are borrowed only while 1F04 hides the UI band.
; The eight-frame checker uses a temporary 8/32 OBJ layout, with Goku,
; Frieza and the first explosions composited into the checker cells.
; Thus the full-width picture is exactly 32 slivers, with no OBJ overflow.
!FZY_MAGIC = $F17B
!fzy_magic = !fz_spr_id
!fzy_ready = !fz_spr_cnt
!fzy_ptr = !fz_spr_x                 ; long pointer, world-only aliases
!fzy_mode = !fz_spr_fl
!fzy_prev = !fz_spr_pend
!fzy_goku = !fz_spr_res0             ; checker Goku record index
!FZY_CACHE = !SRAM_WORK_SCENE+$1400  ; 64 asset tags; scene claim required
!FZY_MISSES = !FZY_CACHE+$80         ; deferred uploads (test diagnostic)

fz_flyby_prepare:
if defined("FRIEZA_FLYBY_HIDE")
	RTS                              ; paired test capture: native world without flyby art
endif
	LDA.l !fzp_flags
	AND.w #!FZFL_FLYBY_GO
	BEQ .off
	LDA.l !fzp_flyby
	CMP.w #550
	BCS .off
	LDA !fzy_magic
	CMP.w #!FZY_MAGIC
	BEQ .frame
	LDA.w #!SCENE_FRIEZA
	JSL core_scene_claim
	BCS .out
	; On an interrupted/imported flight, discard hidden UI residency before
	; borrowing B/C. 1F04's $8C guard already forbids the band and the dial.
if defined("UI_VRAM_OWNER")
	JSL ui_world_reload
endif
	LDA.w #!VRAM_WORLD_OBJ_B
	LDX.w #!FZ_VRAM_OWNER
	JSL core_vram_claim
	BCS .release
	LDA.w #!VRAM_WORLD_OBJ_C
	LDX.w #!FZ_VRAM_OWNER
	JSL core_vram_claim
	BCS .release
	LDX.w #126
	LDA.w #0
-	STA.l !FZY_CACHE,X
	DEX : DEX
	BPL -
	STA.l !FZY_MISSES
	STA !fzy_prev
	LDA.w #!FZY_MAGIC
	STA !fzy_magic
.frame
	LDA.l !fzp_flyby
	ASL : ASL
	TAX
	LDA.l frieza_flyby_frames,X
	STA !fzy_ptr
	LDA.l frieza_flyby_frames+2,X
	SEP #$20
	STA !fzy_ptr+2
	LDA.b #1
	STA !fzy_ready
	REP #$20
.out
	RTS
.off
	LDA !fzy_magic
	CMP.w #!FZY_MAGIC
	BNE .out
	SEP #$20
	STZ !fzy_ready
	REP #$20
	LDA.w #1
	STA.w !w_pal_dirty                ; world restores palettes 5/6 before this frame's NMI cleanup
	LDA.w #!VRAM_WORLD_OBJ_C
	LDX.w #!FZ_VRAM_OWNER
	JSL core_vram_release
.release
	LDA.w #!VRAM_WORLD_OBJ_B
	LDX.w #!FZ_VRAM_OWNER
	JSL core_vram_release
	JSR fz_scene_free                 ; field SRAM residency must be rebuilt after these aliases
	RTS

; Called inside world_draw, before Goku. C set: checker owns the whole
; picture and includes Goku. Otherwise w_cursor leaves five world slots
; for his ordinary body/shadow; excess flyby pieces use the core run.
frieza_world_draw:
	LDA !fzy_magic
	CMP.w #!FZY_MAGIC
	BNE .idle
	LDA !fzy_ready
	AND.w #$00FF
	BNE .work
.idle
	CLC
	RTL
.work
	PHD
	TSC : SEC : SBC.w #16 : TCS : INC : TCD
	LDA !fzy_ptr : STA $00
	LDA !fzy_ptr+2 : STA $02
	LDY.w #10
	LDA [$00],Y
	STA !fzy_mode
	CMP.w #2
	BNE .normal
	; No native sprite is allowed to consume extra slivers in the checker.
	LDA.w #$E0FF
	LDX.w #$0000
-	STA.w $0800,X
	INX : INX : INX : INX
	CPX.w #$0200
	BCC -
	LDX.w #0
	LDA.w #$AAAA
-	STA.w $0A00,X
	INX : INX
	CPX.w #$0020
	BCC -
	; (form * 4 + flight clip) * 9 + bob * 3 + bank; 72 variants.
	; World draws the resident cell, one frame behind a newly requested clip.
	LDA.w !w_anim_frame
	LDX.w !w_anim_tick
	BNE +
	DEC : AND.w #3
+	STA $04
	LDA.w !w_form : ASL : ASL
	CLC : ADC $04
	STA $04
	ASL : ASL : ASL
	CLC : ADC $04
	STA $04
	LDA.w !w_anim_age
	LSR : LSR : LSR
	AND.w #3
	LDX.w #3                         ; y = 68
	CMP.w #1
	BNE +
	LDX.w #0                         ; y = 67
+	CMP.w #3
	BNE +
	LDX.w #6                         ; y = 69
+	TXA : CLC : ADC $04
	CLC : ADC.w !w_bank
	INC
	ASL : ASL
	STA !fzy_goku
	BRA .copy
.normal
	; Checker used some ordinary sprite cells. Forget their tags when the
	; normal 8/16 layout returns, and let world reload its idle effect art.
	LDA !fzy_prev
	CMP.w #2
	BNE .copy
	LDA.w #0
	STA.l !FZY_CACHE
	STA.l !FZY_CACHE+16               ; B's first Exploder group was checker/Goku
	STA.l !FZY_CACHE+18               ; the second holds the preloaded exit pose
	STA.l !FZY_CACHE+20               ; C's first two groups were the checker burst
	STA.l !FZY_CACHE+22
	STA !fzy_prev
	INC : STA.w !w_pal_dirty          ; normal Goku palette after the checker
	; Idle world effect tiles are restored after the flyby releases B/C.
.copy
	LDY.w #0
	LDA [$00],Y : STA $04             ; sprite count
	LDY.w #12
	LDX.w !w_cursor
.next
	LDA $04
	BEQ .done
	LDA !fzy_mode
	CMP.w #2
	BEQ .put
	CPX.w #!WORLD_FX_SLOTS_END
	BCC .put
	; Use a contiguous core run instead of calling core_oam_add per cell.
	STX.w !w_cursor
	LDX.w !core_oam_cursor&$FFFF
	CPX.w #$0200
	BCS .done
	LDA.w #$AAAA
	STA.w $0A16 : STA.w $0A18 : STA.w $0A1A
	STA.w $0A1C : STA.w $0A1E
.back
	LDA [$00],Y : STA.w $0800,X
	INY : INY
	LDA [$00],Y : STA.w $0802,X
	INY : INY
	INX : INX : INX : INX
	DEC $04
	BEQ .backDone
	CPX.w #$0200
	BCC .back
.backDone
	STX.w !core_oam_cursor&$FFFF
	LDX.w !w_cursor
	BRA .done
.put
	LDA [$00],Y : STA.w $0800,X
	INY : INY
	LDA [$00],Y : STA.w $0802,X
	INY : INY
	INX : INX : INX : INX
	DEC $04
	BRA .next
.done
	STX.w !w_cursor
	LDA !fzy_mode
	CMP.w #2
	TSC : CLC : ADC.w #16 : TCS
	PLD
	; CMP's carry alone distinguishes 2 from 0/1; Z isn't needed.
	LDA !fzy_mode
	CMP.w #2
	RTL

; Suppress normal Goku uploads until the last three checker frames; its
; ordinary cell is preloaded before we restore the 8/16 layout.
frieza_world_body:
	LDA.l $7E0000|!fzy_magic
	CMP.w #!FZY_MAGIC
	BNE .no
	LDA.l $7E0000|!fzy_mode
	CMP.w #2
	BNE .no
	LDA.l $7E0000|!w_form
	BNE .super
	LDA.l !fzp_flyby
	CMP.w #409                       ; preload normal Goku before the checker ends
	BCC .yes
	BRA .no
.super
	LDA.l !fzp_flyby
	CMP.w #411                       ; SSJ changes clip at 410; leave that vblank to the burst
	BCC .yes
.no
	CLC
	RTL
.yes
	SEC
	RTL

; World NMI after world/FX. HDMA tables are immutable ROM (no torn frame).
frieza_world_nmi:
	LDA.l $7E0000|!fzy_magic
	CMP.w #!FZY_MAGIC
	BEQ +
	RTL
+	PHB : PHD
	PEA $7E7E : PLB : PLB
	TSC : SEC : SBC.w #32 : TCS : INC : TCD
	JSL core_vblank_lines
	CMP.w #4
	BCS +
	JMP .exit
+	LDA !fzy_ready
	AND.w #$00FF
	BNE .active
	JSR fzy_restore
	STZ !fzy_magic
	STZ.w !w_fx_state
	JMP .exit
.active
	LDA !fzy_ptr : STA $00
	LDA !fzy_ptr+2 : STA $02
	; Uploaded assets are tagged by logical slot. Only a changed cell moves.
	LDY.w #0
	LDA [$00],Y
	ASL : ASL
	CLC : ADC.w #12
	STA $06                          ; request offset
	LDY.w #2
	LDA [$00],Y : STA $04
.upload
	LDA $04
	BEQ .goku
	LDY $06
	JSR fzy_upload
	BCS .goku
	LDA $06 : CLC : ADC.w #12 : STA $06
	DEC $04
	BRA .upload
.goku
	LDA !fzy_mode
	CMP.w #2
	BNE .palettes
	LDX !fzy_goku
	LDA.l !fzp_flyby
	CMP.w #404
	BNE .gokuMiddle
	LDA.l frieza_flyby_goku_first,X : STA $00
	LDA.l frieza_flyby_goku_first+2,X : STA $02
	BRA .gokuUpload
.gokuMiddle
	LDA.l frieza_flyby_goku,X : STA $00
	LDA.l frieza_flyby_goku+2,X : STA $02
.gokuUpload
	LDY.w #0
	JSR fzy_upload
.palettes
	LDX.w #2                         ; palettes + OBSEL; core also keeps its late-line margin
	LDA !fzy_mode
	CMP.w #1
	BNE +
	LDX.w #5                         ; window/HDMA setup needs more finishing time
+	STX $18
	JSL core_vblank_lines
	CMP $18
	BCS +
	JMP .exit
+	LDA.w #frieza_palettes
	LDX.w #frieza_palettes>>16
	LDY.w #240
	JSR fzy_palette
	LDA.w #frieza_flyby_palette
	LDX.w #frieza_flyby_palette>>16
	LDY.w #224
	JSR fzy_palette
	LDA !fzy_mode
	CMP.w #2
	BNE .ppu
	LDA.w !w_form
	ASL : ASL : ASL : ASL : ASL
	CLC : ADC.w #frieza_flyby_goku_pal
	LDX.w #frieza_flyby_goku_pal>>16
	LDY.w #208
	JSR fzy_palette
.ppu
	LDA !fzy_mode
	CMP.w #1
	BEQ .ball
	LDA !fzy_prev
	CMP.w #1
	BNE +
	JSR fzy_restore
+	SEP #$20
	LDA.b #$03
	LDX !fzy_mode
	CPX.w #2
	BNE +
	LDA.b #$23                       ; 8/32 OBJ during the checker only
+	STA.l $002101
	REP #$20
	JMP .remember
.ball
	LDA !fzy_ptr : STA $00
	LDA !fzy_ptr+2 : STA $02
	LDY.w #4
	JSR fzy_pointer
	STA.l $004362
	TXA
	SEP #$20
	STA.l $004364
	LDA.b #$01 : STA.l $004360
	LDA.b #$26 : STA.l $004361
	REP #$20
	LDY.w #7
	JSR fzy_pointer
	STA.l $004372
	TXA
	SEP #$20
	STA.l $004374
	LDA.b #$02 : STA.l $004370
	LDA.b #$32 : STA.l $004371
	LDA.b #$22 : STA.l $002123       ; mask BG1/2 inside the sphere on both screens
	LDA.b #$03 : STA.l $00212E
	STA.l $00212F
	LDA.b #0 : STA.l $002125
	LDA.b #0 : STA.l $00212B
	LDA.b #$02 : STA.l $002130
	LDA.b #$21 : STA.l $002131       ; native BG1/backdrop math; masked sub uses COLDATA
	LDA.w $002C
	ORA.b #$C0 : STA.w $002C
	REP #$20
	LDA.l !fzp_flyby
	CMP.w #380
	BCC .skyColour
	ASL : TAX
	LDA.l frieza_flyby_colours,X
	PHA
	SEP #$20
	LDA.b #0 : STA.l $002121
	PLA : STA.l $002122
	PLA : STA.l $002122
	LDA.b #$01 : STA.l $002131       ; keep native fog; the distant sphere is a solid backdrop
	LDA.w $002C : AND.b #$7F : STA.w $002C
	BRA .enable
.skyColour
	SEP #$20
.enable
	LDX.w #0
	LDA.w $00F2
	BMI +
	LDX.w #$003F
+	TXA : ORA.w $002C : STA.l $00420C
	REP #$20
.remember
	LDA !fzy_mode : STA !fzy_prev
.exit
	TSC : CLC : ADC.w #32 : TCS
	PLD : PLB
	RTL

; A bank-local virtual pointer in [00]+Y -> A=address, X=bank. Y kept.
fzy_pointer:
	LDA [$00],Y : STA $14
	INY : INY
	LDA [$00],Y
	AND.w #$00FF
	ASL : ASL
	TAX
	DEY : DEY
	LDA.l frieza_flyby_banks,X
	CLC : ADC $14
	PHA
	LDA.l frieza_flyby_banks+2,X
	AND.w #$00FF
	TAX
	PLA
	RTS

; Request: VRAM word, bytes/row, virtual source (3), rows (1), cache
; byte index, tag. Gated before the entire upload; no partial visible cell.
fzy_upload:
	STY $08
	TYA : CLC : ADC.w #8 : TAY
	LDA [$00],Y : TAX
	INY : INY
	LDA [$00],Y
	CMP.l !FZY_CACHE,X
	BNE +
	CLC
	RTS
+	STA $0A : STX $0C
	LDY $08
	LDA [$00],Y : STA $0E
	INY : INY
	LDA [$00],Y : STA $10
	INY : INY
	JSR fzy_pointer
	STA $12 : STX $14
	LDY $08
	TYA : CLC : ADC.w #7 : TAY
	LDA [$00],Y : AND.w #$00FF : STA $16
	; ceil(bytes * 3 / 512) scanlines of DMA, plus three for row setup,
	; palettes/return (four with HDMA setup). Core keeps a late-line margin.
	; 8 master clocks/byte, 1364/scanline.
	LDA $10
	LDX $16
	CPX.w #1
	BEQ +
	ASL
	CPX.w #4
	BNE +
	ASL
+	STA $18
	ASL : CLC : ADC $18
	CLC : ADC.w #511
	XBA : AND.w #$00FF : LSR
	CLC : ADC.w #3 : STA $18
	LDA !fzy_mode
	CMP.w #1
	BNE +
	INC $18
+
	JSL core_vblank_lines
	CMP $18
	BCS .copy
	LDA.l !FZY_MISSES : INC : STA.l !FZY_MISSES
	SEC
	RTS
.copy
	SEP #$20
	LDA.b #$80 : STA.l $002115
	REP #$20
	LDA.w #$1801 : STA.l $004370
	LDA $12 : STA.l $004372
	LDA $14 : STA.l $004374
.row
	LDA $0E : STA.l $002116
	LDA $10 : STA.l $004375
	SEP #$20
	LDA.b #$80 : STA.l $00420B
	REP #$20
	LDA $0E : CLC : ADC.w #$0100 : STA $0E
	DEC $16
	BNE .row
	LDX $0C
	LDA $0A : STA.l !FZY_CACHE,X
	CLC
	RTS

fzy_palette:
	STA.l $004372
	TXA
	SEP #$20
	STA.l $004374
	TYA : STA.l $002121
	REP #$20
	LDA.w #$2200 : STA.l $004370
	LDA.w #32 : STA.l $004375
	SEP #$20
	LDA.b #$80 : STA.l $00420B
	REP #$20
	RTS

fzy_restore:
	SEP #$20
	LDA.b #0
	STA.l $002123 : STA.l $002125 : STA.l $00212B : STA.l $00212E : STA.l $00212F
	LDA.b #2 : STA.l $002130
	LDA.b #$21 : STA.l $002131       ; world fog, not the field $23 shadow
	LDA.b #$E0 : STA.l $002132
	LDA.b #$03 : STA.l $002101
	LDA.b #0 : STA.l $002121
	LDA $0600 : STA.l $002122
	LDA $0601 : STA.l $002122
	; UI has already rebuilt its own channel-6 request this vblank.
	LDA.w $002C : AND.b #$3F : STA.w $002C
	LDX.w #0
	LDA.w $00F2 : BMI +
	LDX.w #$003F
+	TXA : ORA.w $002C : STA.l $00420C
	REP #$20
	RTS
