-- Helpers for the GOKU module tests. run.mjs prepends SYM (symbol table from
-- the .sym file) and GOKU_IMPORT (bundle root) before this file.
G = {}
G.RAM = 0x7ED740
local function ram(off) return G.RAM + off end
G.addr = {
  form = ram(0x00), ctl = ram(0x01), act = ram(0x02), act_facing = ram(0x03), act_age = ram(0x04),
  act_arg = ram(0x06), act_dur = ram(0x07), mode = ram(0x08), mode_facing = ram(0x09), mode_age = ram(0x0A),
  lift = ram(0x0C), cell_req = ram(0x0E),
  p_kind = ram(0x28), p_flags = ram(0x29), p_cell = ram(0x2A), p_lift = ram(0x2C), p_sheet = ram(0x2E),
  p_col = ram(0x2F), p_row = ram(0x30), p_var = ram(0x31),
  vram_cell = ram(0x40), up_cell = ram(0x42), vram_small = ram(0x4A), replacing = ram(0x46),
  hud_form = ram(0x49),
}
G.addr.pal_slot = ram(0xBD)
G.PERSIST_ACTIVE = 0x316001
G.failures = {}
function G.fail(msg) G.failures[#G.failures + 1] = msg; H.log('FAIL', msg) end
function G.check(cond, msg) if not cond then G.fail(msg) end return cond end
function G.on() H.w8(G.PERSIST_ACTIVE, 1) end
function G.off() H.w8(G.PERSIST_ACTIVE, 0) end
function G.import(name)
  local ok = H.importSnesJs(GOKU_IMPORT .. name)
  G.check(ok, 'import ' .. name)
  return ok
end
function G.state()
  return {
    kind = H.r8(G.addr.p_kind), cell = H.r16(G.addr.p_cell), flags = H.r8(G.addr.p_flags),
    sheet = H.r8(G.addr.p_sheet), col = H.r8(G.addr.p_col), row = H.r8(G.addr.p_row), var = H.r8(G.addr.p_var),
    vram = H.r16(G.addr.vram_cell), repl = H.r8(G.addr.replacing), sx = H.r16(0x7EE020), sy = H.r16(0x7EE022),
    anim = H.r8(0x7EE011), facing = H.r8(0x7EE010), gframe = H.r16(0x7EE026),
  }
end
function G.desc(s)
  return string.format('kind=%02X cell=%d %d:%d:%d var=%02X vram=%d repl=%d anim=%02X face=%02X gf=%d @%d,%d',
    s.kind, s.cell, s.sheet, s.col, s.row, s.var, s.vram, s.repl, s.anim, s.facing, s.gframe, s.sx, s.sy)
end
-- ROM word at a 24-bit address
local function romw(a) return H.r8(a) | (H.r8(a + 1) << 8) end
-- Compare the 16 tiles of `cell` against VRAM (the boy's slot). Returns mismatch count.
function G.vram_matches(cell)
  local rows = {0x7C00, 0x7D00, 0x7C40, 0x7D40}
  local bad = 0
  for r = 0, 3 do
    for c = 0, 3 do
      local t = romw(SYM.goku_cell_tiles + (cell * 16 + r * 4 + c) * 2)
      local src = ((0xF8 + (t >> 11)) << 16) | ((t & 0x7FF) << 5)
      local dst = (rows[r + 1] + c * 16) * 2
      for i = 0, 31 do
        if H.r8(src + i) ~= H.vram(dst + i) then bad = bad + 1 end
      end
    end
  end
  return bad
end
-- Palette words of OBJ palette p (CGRAM)
function G.cgram_pal(p)
  local t = {}
  for i = 0, 15 do t[i] = H.cgram(0x100 + p * 32 + i * 2) | (H.cgram(0x101 + p * 32 + i * 2) << 8) end
  return t
end
function G.rom_pal(id)
  local t = {}
  for i = 0, 15 do t[i] = romw(SYM.goku_palettes + id * 32 + i * 2) end
  return t
end
function G.pal_str(t)
  local s = {}
  for i = 0, 15 do s[#s + 1] = string.format('%04X', t[i]) end
  return table.concat(s, ' ')
end
function G.pal_equal(a, b, from)
  for i = from or 1, 15 do if a[i] ~= b[i] then return false end end
  return true
end
-- Goku's OAM entries (tiles C0-C7, name select 1) in the PPU's OAM
function G.oam_goku()
  local list = {}
  for i = 0, 127 do
    local y = H.oam(i * 4 + 1)
    local tile = H.oam(i * 4 + 2)
    local attr = H.oam(i * 4 + 3)
    if y < 224 and (attr & 1) == 1 and tile >= 0xC0 and tile <= 0xC6 and (tile & 1) == 0 then
      list[#list + 1] = {slot = i, x = H.oam(i * 4), y = y, tile = tile, attr = attr}
    end
  end
  return list
end
function G.finish()
  H.result('failures', G.failures)
  H.result('pass', #G.failures == 0)
end
