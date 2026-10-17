; Bank layout of the expanded 32 Mbit HiROM image.
; Original game: C0-DF (ROM 0x000000-0x1FFFFF), untouched except hijacks.
; Code is assembled at the 80-BF mirror of each bank's upper half
; ($A0:8000 = ROM 0x208000), so it runs with low WRAM and I/O visible when
; DB is a mirror bank. Lower halves ($E0:0000-7FFF) hold data read through
; long addressing.
;
; bank  code ($Bx:8000-FFFF)      data ($Fx:0000-7FFF)
; E0    core runtime              core tables
; E1    Goku sprite/animation     animation tables
; E2    combat                    combat tables
; E3    flight / traversal        traversal tables
; E4    destruction               destruction tables
; E5    story runtime             story tables
; E6    Frieza ground fight       Frieza tables
; E7    Frieza space/cinematics   orbit tables
; E8    Vegeta / Time Chamber     Vegeta tables
; E9    endings                   ending tables
; EA    audio                     audio tables
; EB    title / arrival / misc    misc tables
; EC    UI code (upper half)        ending art (lower half)
; ED    world-flight code (upper)     ending art (lower half)
; EE    effects library code (upper)  ending art (lower half)
; EF    reserved code                 ending art (lower half)
; F0-F7 story events and dialogue (whole banks)
; F8-FF graphics and samples (whole banks, packed by snes/gen)
!CODE_CORE    = $A08000
!CODE_GOKU    = $A18000
!CODE_COMBAT  = $A28000
!CODE_FLIGHT  = $A38000
!CODE_DESTROY = $A48000
!CODE_STORY   = $A58000
!CODE_FRIEZA  = $A68000
!CODE_ORBIT   = $A78000
!CODE_VEGETA  = $A88000
!CODE_ENDING  = $A98000
!CODE_AUDIO   = $AA8000
!CODE_MISC    = $AB8000
!CODE_UI      = $AC8000   ; UI module (upper half only; $EC-$EF lower halves hold ending art)
!CODE_SPARE0  = $AC8000
!CODE_WORLD   = $AD8000   ; world-flight module (upper half only)
!CODE_SPARE1  = $AD8000
!CODE_FX      = $AE8000   ; effects library (upper half only)
!CODE_SPARE2  = $AE8000
!CODE_SPARE3  = $AF8000

!DATA_CORE    = $E00000
!DATA_GOKU    = $E10000
!DATA_COMBAT  = $E20000
!DATA_FLIGHT  = $E30000
!DATA_DESTROY = $E40000
!DATA_STORY   = $E50000
!DATA_FRIEZA  = $E60000
!DATA_ORBIT   = $E70000
!DATA_VEGETA  = $E80000
!DATA_ENDING  = $E90000
!DATA_AUDIO   = $EA0000
!DATA_MISC    = $EB0000

!BANK_EVENTS  = $F0     ; F0-F7
!BANK_ASSETS  = $F8     ; F8-FF
