; Seven short, single-voice effects using the boot-resident instruments.
; DC-E2 were empty effect slots. E3-FF's unused pointer space holds the
; sequences; the existing boot/song loaders transfer these bytes for free.
; Each sequence ends with F2: no infinite loops or CPU-side stop timer.
if not(defined("AUDIO_PCM"))
pushpc
!resident_rom = $C32139
!resident_aram = $2C00
for i = $DC..$100
  %orig4(!resident_rom+(!i*4), $00000000)
endfor
%patch(!resident_rom+($DC*4), $90, audio)
org !resident_rom+($DC*4)
  dw resident_swing-!resident_rom+!resident_aram, 0
  dw resident_hit-!resident_rom+!resident_aram, 0
  dw resident_ki-!resident_rom+!resident_aram, 0
  dw resident_charge-!resident_rom+!resident_aram, 0
  dw resident_transform-!resident_rom+!resident_aram, 0
  dw resident_teleport-!resident_rom+!resident_aram, 0
  dw resident_beam-!resident_rom+!resident_aram, 0
resident_swing:
  db $D2,$88,$EA,$08,$E4,$03,$D6,$0C,$20,$55,$F2
resident_hit:
  db $D2,$F0,$EA,$08,$E4,$03,$EE,$14,$D6,$0C,$04,$55,$F2
resident_ki:
  db $D2,$C0,$EA,$03,$E4,$06,$D6,$0C,$DC,$55,$F2
resident_charge:
  db $D2,$58,$EA,$03,$E4,$04,$EE,$13,$D6,$18,$50,$53,$F2
resident_transform:
  db $D2,$E0,$EA,$00,$E4,$02,$D6,$30,$0C,$D3,$30,$00,$50,$F2
resident_teleport:
  db $D2,$A0,$EA,$05,$E4,$07,$D6,$0C,$24,$56,$F2
resident_beam:
  db $D2,$D0,$EA,$08,$E4,$02,$D6,$30,$0C,$D3,$30,$00,$50,$F2
assert pc() <= !resident_rom+$400, "resident effects overlap native sequences"
pullpc
endif
