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
-- FastROM cartridges (the default; header map mode $31; -DCORE_SLOWROM=1
-- builds $21) run banks $80-$FF at 3.58 MHz with MEMSEL set (the core sets
-- it every frame). Browser bundles come from the original SlowROM game and
-- restore $420D = 0: set it again at once. Read lazily: emulator memory is
-- not readable while the script loads (Mesen stalls).
function G.fastrom()
  if G._fastrom == nil then G._fastrom = H.r8(0x00FFD5) == 0x31 end
  return G._fastrom
end
function G.import(name)
  local ok = H.importSnesJs(GOKU_IMPORT .. name)
  G.check(ok, 'import ' .. name)
  if G.fastrom() then H.w8(0x00420D, 1) end
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
G.romw = romw
-- Compare the 16 tiles of `cell` against VRAM: the boy's field slot, or the
-- slot at word `base` (tiles base, +$100, +$40, +$140). Returns mismatches.
function G.vram_matches(cell, base)
  base = base or 0x7C00
  local rows = {base, base + 0x100, base + 0x40, base + 0x140}
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
-- Full-screen menus (menu.asm): OAM entries of the PPU and of the menu's own
-- buffer (7E:9C00); the menu state lives in pal_work (G.RAM + $90).
G.MENU = {idle = G.RAM + 0x96, blink = G.RAM + 0x98, entry = G.RAM + 0xA1, blink_clock = G.RAM + 0xBF}
local function hi_bits(i) return (H.oam(512 + (i >> 2)) >> ((i & 3) * 2)) & 3 end
function G.oam_entry(i) return {x = H.oam(i * 4), y = H.oam(i * 4 + 1), tile = H.oam(i * 4 + 2), attr = H.oam(i * 4 + 3), hi = hi_bits(i)} end
function G.menu_buf(i) return {x = H.r8(0x7E9C00 + i * 4), y = H.r8(0x7E9C01 + i * 4), tile = H.r8(0x7E9C02 + i * 4), attr = H.r8(0x7E9C03 + i * 4)} end
function G.menu_same(i)
  local o, b = G.oam_entry(i), G.menu_buf(i)
  return o.x == b.x and o.y == b.y and o.tile == b.tile and o.attr == b.attr
end
-- Cartridge SRAM (saved games, first 8 KiB) from another import bundle
function G.copy_sram(name)
  local f = io.open(GOKU_IMPORT .. name .. '/sram.bin', 'rb')
  local data = f:read('*a'); f:close()
  for i = 1, math.min(#data, 0x2000) do emu.write(i - 1, data:byte(i), emu.memType.snesSaveRam) end
end
function G.boy_pal()
  local t = {}
  for i = 0, 15 do t[i] = romw(0xC81EFE + i * 2) end
  return t
end
-- Goku's menu figure in place of the native one: entries e..e+7 hidden in
-- the PPU's OAM (kept in the menu buffer), entries 120-123 his 16x16 cells
-- at (x - 8, y), both cells of the form in VRAM, palette 1 = his.
function G.check_figure(tag, form)
  -- The menu changes its buffer after its own upload (the Action Grid's
  -- flash toggles priorities); OAM, Goku's edits included, catches up at the
  -- next upload. Compare once both agree.
  for _ = 1, 3 do
    local e0 = H.r8(G.MENU.entry)
    local b0 = G.menu_buf(e0)
    local o0 = G.oam_entry(120)
    if (o0.attr & 0x30) == (b0.attr & 0x30) and o0.y == b0.y then break end
    H.wait(1)
  end
  local e = H.r8(G.MENU.entry)
  local b = G.menu_buf(e)
  local hidden, kept = true, true
  for k = 0, 7 do
    if G.oam_entry(e + k).y ~= 0xF0 then hidden = false end
    if G.menu_buf(e + k).tile ~= 0x30 + k then kept = false end
  end
  G.check(hidden and kept, tag .. ": the boy's cells hidden in OAM, kept in the menu buffer")
  local base = G.oam_entry(120).tile
  G.check(base == 0xC0 or base == 0xE0, tag .. ': slot C0 (idle) or E0 (blink) shown')
  local x0 = (b.x - 8) & 0x1FF
  for q = 0, 3 do
    local o = G.oam_entry(120 + q)
    local ex = (x0 + (q & 1) * 16) & 0x1FF
    local ok = o.x == (ex & 0xFF) and (o.hi & 1) == (ex >> 8) and o.y == b.y + (q >> 1) * 16 and
      o.tile == base + q * 2 and (o.attr & 0xCF) == 0x03 and (o.attr & 0x30) == (b.attr & 0x30) and (o.hi & 2) == 2
    G.check(ok, string.format('%s: quadrant %d at %d,%d tile %02X attr %02X hi %d', tag, q, o.x, o.y, o.tile, o.attr, o.hi))
  end
  local sheet = form == 1 and 252 or 0
  local idle, blink = H.r16(G.MENU.idle) - 1, H.r16(G.MENU.blink) - 1
  G.check(idle == romw(SYM.goku_cell_index + sheet * 2), tag .. ': idle cell is the front idle ' .. idle)
  G.check(blink == romw(SYM.goku_cell_index + (sheet + 4) * 2), tag .. ': blink cell is the front blink ' .. blink)
  G.check(G.vram_matches(idle, 0x5C00) == 0, tag .. ': idle cell tiles in VRAM (table 2 C0-C7/D0-D7)')
  G.check(G.vram_matches(blink, 0x5E00) == 0, tag .. ': blink cell tiles in VRAM (table 2 E0-E7/F0-F7)')
  G.check(G.pal_equal(G.cgram_pal(1), G.rom_pal(form)), tag .. ': OBJ palette 1 holds Goku colours: ' .. G.pal_str(G.cgram_pal(1)))
  return {x = (x0 >= 256) and x0 - 512 or x0, y = b.y, sheet = form == 1 and 'ssj' or 'goku', column = base == 0xC0 and 0 or 1}
end
function G.check_native(tag)
  local e
  for i = 0, 112, 4 do if G.menu_buf(i).tile == 0x30 and G.menu_buf(i).y < 224 then e = i; break end end
  G.check(e ~= nil, tag .. ': the menu shows the boy')
  if not e then return end
  local same = true
  for k = 0, 7 do if not G.menu_same(e + k) then same = false end end
  for i = 120, 127 do if not G.menu_same(i) then same = false end end
  G.check(same, tag .. ': OAM equals the menu buffer (native boy)')
  G.check(G.pal_equal(G.cgram_pal(1), G.boy_pal()), tag .. ': the boy palette')
end
-- GAME FILE faces (menu.asm): OAM entry 124+slot for each slot in `slots`
function G.check_faces(tag, slots)
  for s = 0, 3 do
    local f = G.oam_entry(124 + s)
    if slots[s] then
      G.check(f.x == 94 and f.y == 30 + 48 * s and f.tile == 0xC8 and f.attr == 0x33 and f.hi == 2,
        string.format('%s: slot %d face 16x16 at 94,%d (rows %d-%d) tile C8 attr 33 (%d,%d %02X %02X %d)',
          tag, s, 30 + 48 * s, 31 + 48 * s, 46 + 48 * s, f.x, f.y, f.tile, f.attr, f.hi))
    else
      G.check(G.menu_same(124 + s), tag .. ': no face for slot ' .. s)
    end
  end
end
-- Scanline at which goku_menu_frame finishes (its vblank work), per call
function G.menu_lines_start()
  G.menu_lines = {}
  G.menu_lines_id = emu.addMemoryCallback(function()
    G.menu_lines[#G.menu_lines + 1] = emu.getState()['ppu.scanline']
  end, emu.callbackType.exec, SYM.goku_menu_frame_done, SYM.goku_menu_frame_done)
end
function G.menu_lines_stop(tag)
  emu.removeMemoryCallback(G.menu_lines_id, emu.callbackType.exec, SYM.goku_menu_frame_done, SYM.goku_menu_frame_done)
  local max, sum = 0, 0
  for _, v in ipairs(G.menu_lines) do if v > max then max = v end; sum = sum + v end
  local n = #G.menu_lines
  H.log(tag, 'menu hook ends: frames', n, 'max line', max, 'mean', n > 0 and string.format('%.1f', sum / n) or '-')
  G.check(n > 0 and max >= 225 and max < 258, tag .. ': menu work ends inside vblank (max line ' .. max .. ')')
  return max
end
function G.finish()
  H.result('failures', G.failures)
  H.result('pass', #G.failures == 0)
end
