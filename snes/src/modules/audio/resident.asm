; Boot-resident effects: unused pointer space plus byte-identical retail
; tracks shared by the generator. The existing boot/song transfers carry
; every patch; no added upload or runtime instructions.
if not(defined("AUDIO_PCM"))
pushpc
incsrc "audio/resident.asm"
pullpc
endif
