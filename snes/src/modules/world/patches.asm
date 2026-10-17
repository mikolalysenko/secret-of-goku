; Every patch of original bytes made by the world module (handlers in
; hooks.asm). Original bytes are asserted; build.mjs rejects overlaps.
; JSL hijacks return to the original bank (01/02 mirrors where the game runs
; that code); handlers redirect by rewriting their own return address.

; Takeoff: C1:E833 JSL $01CBCB, the shared $0Cxx (Drum, Fly, event opcode
; 1C) handoff right after the native return-map bookkeeping.
%orig4($C1E833, $01CBCB22)
%hijack_jsl($C1E833, world_takeoff_hook, 4, world)

; Fly ring item: C1:DBCD LDA $19F2 / AND #$03 (Drum handler, before the
; summon animation and sound).
%orig4($C1DBCD, $2919F2AD)
%orig1($C1DBD1, $03)
%hijack_jsl($C1DBCD, world_fly_item_hook, 5, world)

; Landing: C0:BC0B JSR $BC85 / JSR $C481, start of the ground loader.
%orig4($C0BC0B, $20BC8520)
%orig2($C0BC0F, $C481)
%hijack_jsl($C0BC0B, world_land_hook, 6, world)

; World NMI: C0:88FB LDA $EC / LSR / BCC $8903 / JSR $890B (sky setup).
%orig4($C088FB, $904AECA5)
%orig4($C088FF, $890B2003)
%hijack($C088FB, world_nmi_sky_hook, 8, world)

; World loop top: C0:8064 SEP #$20 / JSR $8B5E.
%orig4($C08064, $5E2020E2)
%orig1($C08068, $8B)
%hijack($C08064, world_loop_hook, 5, world)

; Flammie OAM builder: C0:9AD0 LDA $BF / BNE $9ACB.
%orig4($C09AD0, $F7D0BFA5)
%hijack($C09AD0, world_flammie_hook, 4, world)

; Fortress object: C2:B112 LDA $E3 / BIT #$40 / BNE $B119.
%orig4($C2B112, $4089E3A5)
%orig2($C2B116, $01D0)
%hijack_jsl($C2B112, world_fortress_hook, 6, world)

; Fortress approach: C2:B230 REP #$20 / LDA $F4 / LSR / AND #$0006 (the
; miniature dragon's OBJ submission).
%orig4($C2B230, $F4A520C2)
%orig4($C2B234, $0006294A)
%hijack_jsl($C2B230, world_dock_hook, 8, world)

; Fortress drawn: C2:B1F7 SEP #$20 / LDA $C20000,X / INX, right after the
; native projection left its screen position in $08/$09 (world-ki.js
; fortScreen, native-flight.js docking target).
%orig4($C2B1F7, $00BF20E2)
%orig2($C2B1FB, $C200)
%orig1($C2B1FD, $E8)
%hijack_jsl($C2B1F7, world_fort_seen_hook, 7, world)

; Event sound opcode: C1:F109 JSL $C30004. After the Fortress fell, the
; deck's cue $26 becomes the crisis cue (fortress-collapse.js).
%orig4($C1F109, $C3000422)
%hijack_jsl($C1F109, world_event_sound_hook, 4, world)

; World rows: C0:98FD JSR $99F3 / REP #$20, the RLE row decompressor into the
; 7F ring (the row number was pushed at C0:98FC): craters are drawn into it.
%orig4($C098FD, $C299F320)
%orig1($C09901, $20)
%hijack_jsl($C098FD, world_scar_row_hook, 5, world)

; Landing check: C0:8190 LDA $7F0000,X / AND #$00FF, the world tile under
; the camera; a crater cell lands as its original terrain.
%orig4($C08190, $7F0000BF)
%orig3($C08194, $00FF29)
%hijack_jsl($C08190, world_land_tile_hook, 7, world)
