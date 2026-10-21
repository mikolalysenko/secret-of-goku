; Nine single-voice effects using the boot-resident instruments.
; DC-E4 were empty effect slots. E5-FF's unused pointer space holds the
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
incsrc "audio/resident.asm"
assert pc() <= !resident_rom+$400, "resident effects overlap native sequences"
pullpc
endif
