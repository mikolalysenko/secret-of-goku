; Goku's scouter (engine/scouter.js). Included in the UI code bank.
;
; Owned once Sylphid's powers are granted ($7E:CFAB >= 2); owning it does
; not switch it on. In Goku's configuration ring (character 0, ring 2) the
; Targeting item becomes a Scouter ON/OFF switch: its title reads
; "Scouter: ON" / "Scouter: OFF" and confirming it toggles the persistent
; bit instead of opening the native screen. Switching it on (or loading a
; game with it on) scans the next time Goku can act: the teleport sound and
; King Kai's one-time joke for the current form.
;
; Patched native code:
;   C0:73F4 LDA $1876 / BEQ   ring option dispatch (M8 X16, DB $00)
;   C0:1926 LDA $CA0000,X     text engine string pointer (M16 X16, DB $00)

if getfilestatus("audio/ids.asm") == 0
	incsrc "audio/ids.asm"
endif

!UISC_SCANS   = $FF00         ; scans so far (high byte, wraps; tests)

!UIF_SCOUTER = $40            ; !ui_p_flags: switched on

!UI_SC_SYLPHID = $CFAB        ; Sylphid's powers: >= 2 owns the scouter
!UI_SC_TITLE_X = $098E        ; Targeting in the ring title table (base $0864)

; ---------------------------------------------------------------------------
; Scouter owned (Z clear) and Goku active: carry set when it is available
; to the ring. Any DB (long addressing), M16; keeps X/Y.
ui_sc_owned:
	LDA.l $7E0000|!UI_SC_SYLPHID
	AND.w #$00FF
	CMP.w #$0002
	BCC .no
	LDA.l !persist_goku_active
	AND.w #$00FF
	BEQ .no
	SEC
	RTS
.no
	CLC
	RTS

; The ring's selected item is Goku's Targeting (scouter.js ringItem): config
; ring of character 0, option 1, the scouter owned. Carry set = yes. M16.
ui_sc_ring_item:
	LDA.l $7E1808
	AND.w #$00FF
	BNE .no
	LDA.l $7E1809
	AND.w #$00FF
	CMP.w #$0002
	BNE .no
	LDA.l $7E1876
	AND.w #$00FF
	CMP.w #$0001
	BNE .no
	BRA ui_sc_owned
.no
	CLC
	RTS

; C0:73F4 (ring option dispatch, M8 X16, DB $00): the Targeting item
; toggles the scouter, asks for a title redraw ($1812) and resumes the ring
; at C0:7275 instead of opening the native screen.
ui_sc_ring_hook:
	PHP
	REP #$20
	JSR ui_sc_ring_item
	BCC .native
	LDA.l !ui_p_flags
	EOR.w #!UIF_SCOUTER
	STA.l !ui_p_flags
	AND.w #!UIF_SCOUTER
	BEQ +
	LDA.l !ui_sc                      ; switched on: scan when Goku can act
	ORA.w #!UISC_PENDING
	STA.l !ui_sc
	BRA ++
+	LDA.l !ui_sc
	AND.w #!UISC_PENDING^$FFFF
	STA.l !ui_sc
++	SEP #$20
	LDA.b #$01
	STA.l $7E1812
	LDA.b #$00
	STA.l $7E1813
	PLP
	JML $C07275
.native
	PLP
	LDA.l $001876                     ; LDA $1876 / BEQ $7417
	BNE +
	JML $C07417
+	JML $C073F9

; C0:1926 (text engine string reference, M16 X16, DB $00, X = table
; offset): the Targeting title of Goku's config ring reads the scouter's
; switch title from this bank.
ui_sc_title_hook:
	LDA.l $CA0000,X                   ; the game's pointer
	CPX.w #!UI_SC_TITLE_X
	BNE .native
	PHA
	LDA.l $7EA1D5                     ; ring title table base
	CMP.w #$0864
	BNE .nativePla
	JSR ui_sc_ring_item
	BCC .nativePla
	PLA
	LDA.l !ui_p_flags
	AND.w #!UIF_SCOUTER
	BEQ +
	LDA.w #ui_sc_title_on
	BRA ++
+	LDA.w #ui_sc_title_off
++	STA.l $001D01                     ; as C0:192A-1934, from this bank
	TAY
	SEP #$20
	LDA.b #ui_sc_title_on>>16
	PHA
	PLB
	JML $C01935                       ; RTS
.nativePla
	PLA
.native
	JML $C0192A

; ---------------------------------------------------------------------------
; Field frame (after the radio tick). DB = $7E, M16/X16.
ui_sc_frame:
	JSR ui_sc_owned
	BCC .off
	LDA.l !ui_p_flags
	AND.w #!UIF_SCOUTER
	BEQ .off
	LDA.w !ui_sc&$FFFF
	AND.w #!UISC_PENDING
	BEQ .start
	JSR ui_can_attack
	BCC .done
	LDA.w #!UISC_PENDING
	TRB.w !ui_sc&$FFFF
	JSR ui_sc_scan
.start
	JMP ui_sc_start
.off
.done
	RTS

; scan(): the teleport sound, one scan counted, and King Kai's joke for
; Goku's form (once each, saved): gold when Super Saiyan, else the OVER
; 9000 line for the weighted gi or without it; Frieza takes precedence in
; base form while his virtual actor is present.
ui_sc_scan:
	JSR ui_sc_leave                   ; a new scan restarts the blink
	LDA.w !ui_sc&$FFFF
	CLC
	ADC.w #$0100
	STA.w !ui_sc&$FFFF
if defined("AUDIO_SFX_TELEPORT")
	LDA.w #!AUDIO_SFX_TELEPORT
	JSL audio_sfx
	REP #$30
endif
if defined("goku_form")
	LDA.w !goku_form                  ; Goku's form (goku module): 1 Super Saiyan
	AND.w #$00FF
	BEQ .base
else
	BRA .base
endif
	LDA.w #!UIF_JOKE_GOLD
	LDY.w #!UI_MSG_SCOUTER_GOLD
	BRA .joke
.base
	JSL frieza_virtual_target
	BCC +
	LDA.w #!UIF_JOKE_FRIEZA
	LDY.w #!UI_MSG_SCOUTER_FRIEZA
	BRA .joke
+	LDY.w #!UI_MSG_SCOUTER_GOKU_1     ; "It says NINETY THOUSAND"
if defined("STORY_Q_EQUIP_WEIGHTED")
	LDA.w #!STORY_Q_EQUIP_WEIGHTED
	JSR ui_story_query
	BEQ +
	LDY.w #!UI_MSG_SCOUTER_GOKU_0     ; "with your training weights on"
+
endif
	LDA.w #!UIF_JOKE_GOKU
.joke
	STA.w !ui_tmp0&$FFFF
	SEP #$20
	LDA.l !ui_p_flags
	AND.w !ui_tmp0&$FFFF
	REP #$20
	BNE .told
	SEP #$20
	LDA.l !ui_p_flags
	ORA.w !ui_tmp0&$FFFF
	STA.l !ui_p_flags
	REP #$20
	TYA
	LDX.w #$0000
	JSL ui_say
	REP #$30
.told
	RTS

; New game / load: the switch is saved (!UIF_SCOUTER); switched on, it
; scans again once Goku can act (scouter.js restore: pending = enabled).
ui_sc_load:
	JSR ui_sc_leave
	STZ.w !ui_sc&$FFFF
	LDA.l !ui_p_flags
	AND.w #!UIF_SCOUTER
	BEQ +
	LDA.w #!UISC_PENDING
	STA.w !ui_sc&$FFFF
+	RTS

; ---------------------------------------------------------------------------
%orig3($C073F4, $1876AD)
%orig2($C073F7, $1EF0)
%hijack($C073F4, ui_sc_ring_hook, 5, ui)
%orig4($C01926, $CA0000BF)
%hijack($C01926, ui_sc_title_hook, 4, ui)
