; FX module: the shared effects library (docs/agents/snes-port/fx.md).
; Renders native spell cells, beams, auras, lightning, explosions and screen
; flashes for combat, flight and the scene modules; never decides gameplay.
;
; Resources:
;   code  $AE:8000-FFFF (!CODE_FX, upper half only)
;   SRAM  $31:7800-7BFF (!SRAM_WORK_FX)
;   VRAM  core regions FIELD_OBJ_A/B/C while effects are active (owner $0E)
;
; Calling convention: JSL, M16/X16, DB = $7E, D = 0 on entry and exit;
; DB and D preserved, A/X/Y clobbered unless noted.

incsrc "defs.asm"
assert !FX_SRAM == !SRAM_WORK_FX, "fx request block must sit at !SRAM_WORK_FX"

pushpc
org !CODE_FX
fx_code_start:

; ---------------------------------------------------------------------------
; Public entry points (stubs until the renderers land; see fx.md Status).

; fx_spawn: A = kind | flags<<8, X = x, Y = y. C clear: A = handle.
fx_spawn:
	SEC
	RTL

; fx_draw: one frame of a continuous kind. C set if dropped.
fx_draw:
	SEC
	RTL

; fx_beam: A = style | flags<<8, X/Y = palms. C set if dropped.
fx_beam:
	SEC
	RTL

; fx_flash: A = frames.
fx_flash:
	RTL

; fx_quake: A = frames.
fx_quake:
	RTL

; fx_kill: A = handle.
fx_kill:
	RTL

; fx_kill_all: ends every spawned effect, the flash and the quake.
fx_kill_all:
	RTL

; fx_move: A = handle, X/Y = new position.
fx_move:
	RTL

; fx_info: A = handle. C clear while alive: A = age, X/Y = position.
fx_info:
	SEC
	RTL

; ---------------------------------------------------------------------------
; Core dispatch (modules.asm): last in each list.
fx_frame:
	RTL
fx_nmi:
	RTL
fx_world_frame:
	RTL
fx_world_nmi:
	RTL

fx_code_end:
assert fx_code_end <= !CODE_FX+$8000, "fx code bank overflow"
pullpc
