-- Goku's STATUS page (native-status.js): the config ring's Status item
-- (2) for Goku; once the UI has replaced the page's BG2 layer, BG2 as the
-- PPU shows it (from VRAM and CGRAM), a screenshot, the values
-- statusPixels() needs, the menu's frame rate while the page is built, and
-- leaving the page (X: the combat module's ring/back button) ends the
-- session. Prelude: SET_FORM (0/1/nil), BUNDLE.
local function open_status()
  H.tap('x', 6, 50)
  for _ = 1, 4 do
    if H.r8(0x7E1809) == 2 then break end
    H.tap('down', 4, 40)
  end
  for _ = 1, 8 do
    if H.r8(0x7E1876) == 2 then break end
    H.tap('left', 4, 40)
  end
  H.tap('b', 4, 10)
end
local function cgram(lo, hi)
  local t = {}
  for i = lo, hi do t[#t + 1] = string.format('%04X', H.cgram(i * 2) | (H.cgram(i * 2 + 1) << 8)) end
  return table.concat(t, ' ')
end
-- BG2 in Mode 5: 16x8 cells (tiles n, n + 1; swapped when flipped), 2bpp,
-- chr $6000, map $5800. Per hi-res pixel its CGRAM index (palette * 4 +
-- colour) as one character, '.' transparent.
local CH = '0123456789abcdefghijklmnopqrstuv'
local function bg2()
  local out = {}
  for cy = 0, 27 do
    local rows = {}
    for r = 0, 7 do rows[r] = {} end
    for cx = 0, 31 do
      local a = (0x5800 + cy * 32 + cx) * 2
      local e = H.vram(a) | (H.vram(a + 1) << 8)
      local tile, pal = e & 0x3FF, (e >> 10) & 7
      local fx, fy = (e & 0x4000) ~= 0, (e & 0x8000) ~= 0
      for r = 0, 7 do
        local tr = fy and (7 - r) or r
        for half = 0, 1 do
          local t = (tile + (fx and (1 - half) or half)) & 0x3FF
          local b = ((0x6000 + t * 8) * 2 + tr * 2) & 0xFFFF
          local p0, p1 = H.vram(b), H.vram(b + 1)
          local row = rows[r]
          for px = 0, 7 do
            local bit = fx and px or (7 - px)
            local v = ((p0 >> bit) & 1) | (((p1 >> bit) & 1) << 1)
            row[#row + 1] = v == 0 and '.' or CH:sub(pal * 4 + v + 1, pal * 4 + v + 1)
          end
        end
      end
    end
    for r = 0, 7 do out[#out + 1] = table.concat(rows[r]) end
  end
  return table.concat(out)
end
function test()
  enter(BUNDLE)
  if SET_FORM then H.w8(0x7ED740, SET_FORM) end
  H.wait(10)
  local weighted = command(17, 0, 0)
  local before = cgram(16, 31)
  open_status()
  -- the menu's own loop (C0:1E08) per frame while the page is built
  local hooks, frames, started = 0, 0, nil
  local id = emu.addMemoryCallback(function() hooks = hooks + 1 end, emu.callbackType.exec, 0xC01E08, 0xC01E08)
  local phases, built, menu = {}, nil, 0
  for i = 1, 400 do
    H.wait(1)
    local st = ui(0xB0)
    phases[#phases + 1] = st
    if st == 2 and not started then started = i; hooks = 0 end
    if started and not built then frames = frames + 1 end
    if st == 3 and not built then built = i; menu = hooks end
    if built and i >= built + 30 then break end
  end
  emu.removeMemoryCallback(id, emu.callbackType.exec, 0xC01E08, 0xC01E08)
  H.result('built', built and started and (built - started) or -1)
  H.result('build_frames', frames)
  H.result('build_hooks', menu)
  local p = {}
  for i = 1, #phases, 10 do p[#p + 1] = phases[i] end
  H.result('phases', table.concat(p, ''))
  H.shot('status')
  H.result('bg2', bg2())
  H.result('cgram', cgram(0, 31))
  -- the values gokuStats() reads (combat answers the weights)
  local name = {}
  for a = 0x7ECC00, 0x7ECC05 do
    local b = H.r8(a)
    if b == 0 then break end
    name[#name + 1] = b
  end
  local r16 = function(a) return H.r16(a) end
  local mana = 0
  for a = 0x7ECF90, 0x7ECF97 do if H.r8(a) == 1 then mana = mana + 1 end end
  H.result('stats', {
    name = table.concat(name, ','), form = H.r8(0x7ED740), weighted = weighted,
    level = H.r8(0x7EE181) + 1, hp = r16(0x7EE182), maxHp = r16(0x7EE184),
    strength = H.r8(0x7EE188), agility = H.r8(0x7EE189), constitution = H.r8(0x7EE18A),
    intelligence = H.r8(0x7EE18B), wisdom = H.r8(0x7EE18C), hit = H.r8(0x7EE197),
    defense = r16(0x7EE1A5), evade = H.r8(0x7EE1A4), magicDefense = r16(0x7EE1A8),
    mana = mana, money = r16(0x7ECC6A) | (H.r8(0x7ECC6C) << 16),
  })
  -- leaving the page (back to the ring: the game reloads the field's
  -- colours) ends the session
  H.result('cgram_before', before)
  H.result('cgram_page', cgram(16, 31))
  H.tap('x', 4, 60)
  H.result('phase_after', ui(0xB0))
  H.result('cgram_after', cgram(16, 31))
  H.result('mode_after', H.r8(0x7E1809) .. ',' .. H.r8(0x7E1876) .. ',' .. H.r8(0x7E002C))
  -- the same round trip with the page native (the endings' hide bit)
  setui(0x1C, 0x4000)
  open_status()
  H.wait(60)
  H.result('native_phase', ui(0xB0))
  H.tap('x', 4, 60)
  H.result('cgram_native', cgram(16, 31))
  setui(0x1C, 0)
  finish()
end
