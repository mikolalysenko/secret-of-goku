-- Helpers for the WORLD module tests. run.mjs prepends SYM (world_/goku_
-- symbols from the .sym file) and IMPORT (bundle root) before this file.
W = {}
W.RAM = 0x7E7F00
local function ram(off) return W.RAM + off end
W.a = {
  mode_prev = ram(0x00), trans_kind = ram(0x04), trans_age = ram(0x06), frame = ram(0x08),
  fx_state = ram(0x0A), vram_ok = ram(0x0C), cell_want = ram(0x0E), buf0 = ram(0x10), buf1 = ram(0x12),
  show = ram(0x14), mini = ram(0x16), oam_used = ram(0x18), reserve = ram(0x1A), shadow_t = ram(0x1C),
  shadow_y = ram(0x1E), anim = ram(0x20), form = ram(0x22), flags = ram(0x24), takeoff_req = ram(0x26),
  lock = ram(0x28), bank = ram(0x2A), dock = ram(0x2C), dock_x = ram(0x2E), dock_y = ram(0x30),
  fort_x = ram(0x34), fort_y = ram(0x36), pal_form = ram(0x38),
  charge = ram(0x40), charging = ram(0x42), shot = ram(0x46), shot_age = ram(0x48), shot_max = ram(0x4A),
  shot_str = ram(0x4C), shot_flags = ram(0x4E), shot_tgt = ram(0x50), shot_tx = ram(0x52), shot_ty = ram(0x54),
  expl_age = ram(0x5C), cut_age = ram(0x64), land_queued = ram(0x66), warn_cd = ram(0x68), aim = ram(0x6A),
  msg = ram(0x76), msg_count = ram(0x78), action_age = ram(0x7A), sfx = ram(0x3E), barrier_req = ram(0x3A),
  expl_x = ram(0x5E), expl_y = ram(0x60), expl_flags = ram(0x62), shot_ex = ram(0x56), shot_ey = ram(0x58), shot_side = ram(0x5A),
  bursts = ram(0x80), combat_owns = ram(0x74),
}
W.GOKU = 0x7ED740                 -- goku module RAM (form at +0, mode at +8, mode age at +A)
W.PERSIST_ACTIVE = 0x316001
W.PW = 0x316280                   -- !PERSIST_WORLD
W.failures = 0
function W.check(name, ok, detail)
  if ok then H.result(name, 'pass') else W.failures = W.failures + 1; H.result(name, 'FAIL ' .. tostring(detail or '')) end
  return ok
end
function W.finish() H.result('failures', W.failures) end
-- Checkpoints made by other builds carry their WRAM: zero the world block
-- and core's VRAM-region owners as power-on / the title would.
function W.fresh()
  for a = 0x7E7F00, 0x7E7FFF do H.w8(a, 0) end
  for a = 0x7E6F20, 0x7E6F3F do H.w8(a, 0) end
end
function W.on(form)
  H.w8(W.PERSIST_ACTIVE, 1)
  H.w8(W.GOKU, form or 0)
  -- Let the newly activated character enter the input pipeline with no
  -- held buttons, as normal play does after the opening scene.
  H.wait(3)
end
function W.import(name)
  local ok = H.importSnesJs(IMPORT .. name)
  W.check('import_' .. name, ok, 'import failed')
  return ok
end
-- NMI trampoline at $0100: JML (5C) target
function W.nmi() return string.format('%02X:%02X%02X%02X', H.r8(0x100), H.r8(0x103), H.r8(0x102), H.r8(0x101)) end
function W.inWorld() return W.nmi() == '5C:0088CF' end
function W.inField() return W.nmi() == '5C:00C0A8' end
-- PPU OAM entry i
function W.oam(i)
  local x = H.oam(i * 4)
  local y = H.oam(i * 4 + 1)
  local tile = H.oam(i * 4 + 2) | (H.oam(i * 4 + 3) << 8)
  local hi = (H.oam(512 + (i >> 2)) >> ((i & 3) * 2)) & 3
  if hi & 1 == 1 then x = x - 256 end
  return { x = x, y = y, tile = tile & 0x1FF, pal = (tile >> 9) & 7, prio = (tile >> 12) & 3, size = (hi >> 1) & 1, attr = tile >> 8 }
end
function W.visible(e) return e.y < 224 or e.y >= 240 end
-- Count visible OBJ in slots [a, b] with palette p
function W.count_pal(p, a, b)
  local n = 0
  for i = a or 0, b or 127 do local e = W.oam(i); if W.visible(e) and e.pal == p then n = n + 1 end end
  return n
end
function W.oam_dump(a, b)
  local t = {}
  for i = a, b do
    local e = W.oam(i)
    if W.visible(e) then t[#t + 1] = string.format('%d:%d,%d t%03X p%d s%d', i, e.x, e.y, e.tile, e.pal, e.size) end
  end
  return table.concat(t, ' ')
end
local function romw(a) return H.r8(a) | (H.r8(a + 1) << 8) end
W.romw = romw
-- Compare goku `cell` with a 4x4 tile buffer at OBJ tile `base` (name table 0, VRAM $6000)
function W.vram_cell_bad(cell, base)
  local bad = 0
  for r = 0, 3 do
    for c = 0, 3 do
      local t = romw(SYM.goku_cell_tiles + (cell * 16 + r * 4 + c) * 2)
      local src = ((0xF8 + (t >> 11)) << 16) | ((t & 0x7FF) << 5)
      local dst = (0x6000 + (base + r * 16 + c) * 16) * 2
      for i = 0, 31 do if H.r8(src + i) ~= H.vram(dst + i) then bad = bad + 1 end end
    end
  end
  return bad
end
function W.cgram_word(i) return H.cgram(i * 2) | (H.cgram(i * 2 + 1) << 8) end
-- goku_api_cell equivalent: sheet base (goku 0, ssj 252) + column*4 + row
function W.cell_id(form, column, row)
  local base = form == 1 and 252 or 0
  return romw(SYM.goku_cell_index + (base + column * 4 + row) * 2)
end
