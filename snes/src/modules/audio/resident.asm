; Boot-resident effects: unused pointer space plus byte-identical retail
; tracks shared by the generator. The existing boot/song transfers carry
; every patch; no added upload or runtime instructions.
if not(defined("AUDIO_PCM"))
pushpc
if !AUDIO_CUSTOM_SAMPLES
incsrc "audio/resident-custom.asm"
; Original effect chunk length $05F1 + $5100 = $56F1. The chunk itself
; stays 1521 bytes. All cache resets/compaction derive from $1EF8/$1E48.
%orig2($C30134, $4800)
%patch($C30134, 2, audio)
org $C30134
dw !AUDIO_CUSTOM_FLOOR-$05F1
; Native lists contain 16 instruments, but the retail sender transmits 32
; entries (the extra half is stale WRAM). Stop at $2F so boot-uploaded
; $30-$33 tuning, DIR and ADSR survive every song load, including the title.
%orig2($C3054A, $0040)
%patch($C3054A, 2, audio)
org $C3054A
dw $1EEA
%orig1($C30549, $E0)
%patch($C30549, 1, audio)
org $C30549
db $EC ; CPX absolute: only this song's live metadata entries
%orig2($C3056C, $0080)
%patch($C3056C, 2, audio)
org $C3056C
dw $1EEC
%orig1($C3056B, $E0)
%patch($C3056B, 1, audio)
org $C3056B
db $EC
%orig2($C3058E, $0040)
%patch($C3058E, 2, audio)
org $C3058E
dw $1EEA
%orig1($C3058D, $E0)
%patch($C3058D, 1, audio)
org $C3058D
db $EC
else
incsrc "audio/resident.asm"
endif
pullpc
endif
