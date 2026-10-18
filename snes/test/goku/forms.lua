-- Forms: base and Super Saiyan art/palette/HUD portrait, and the
-- transformation and reversion sequences with their per-frame palettes.
local A = G.addr
local function romw(a) return H.r8(a) | (H.r8(a + 1) << 8) end
local function cell_pal(cell) return H.r8(SYM.goku_cell_pal + cell) end
-- HUD portrait in VRAM (E8/E9 at $7E80, F8/F9 at $7F80) vs the form's tiles
local function hud_matches(form)
  local bad = 0
  local dst = {0x7E80, 0x7E90, 0x7F80, 0x7F90}
  for k = 0, 3 do
    local t = romw(SYM.goku_portrait_tiles + form * 8 + k * 2)
    local src = ((0xF8 + (t >> 11)) << 16) | ((t & 0x7FF) << 5)
    for i = 0, 31 do if H.r8(src + i) ~= H.vram(dst[k + 1] * 2 + i) then bad = bad + 1 end end
  end
  return bad
end
local shots = 0
local function shot(tag) shots = shots + 1; H.shot(string.format('%02d_%s', shots, tag)) end
function test()
  G.import('barrier-audit__potos-probe')
  G.on()
  H.w8(A.form, 0)
  H.hold('up', 30)
  H.wait(12)
  local s = G.state()
  G.check(s.sheet == 0, 'base form uses the base sheet')
  G.check(G.pal_equal(G.cgram_pal(1), G.rom_pal(0)), 'base palette in CGRAM')
  G.check(hud_matches(0) == 0, 'HUD portrait is base Goku')
  shot('base')
  -- Super Saiyan: art, palette and HUD portrait follow the form flag
  H.w8(A.form, 1)
  H.wait(4)
  s = G.state()
  G.check(s.sheet == 1, 'Super Saiyan form uses the ssj sheet')
  G.check(G.pal_equal(G.cgram_pal(1), G.rom_pal(1)), 'Super Saiyan palette in CGRAM: ' .. G.pal_str(G.cgram_pal(1)))
  G.check(hud_matches(1) == 0, 'HUD portrait switched to Super Saiyan')
  H.wait(3)
  G.check(G.vram_matches(s.vram) == 0, 'Super Saiyan cell in VRAM')
  shot('ssj')
  -- transformation (combat owns the timing: 32 frames, front-facing source frames)
  H.w8(A.form, 1)
  H.w8(A.act, 0x15); H.w8(A.act_facing, 0); H.w8(A.act_arg, 0x80); H.w8(A.act_dur, 32)
  -- The Lua frame hook runs at scanline 225, before that frame's NMI: CGRAM
  -- and VRAM then show the previous frame's cell (uploaded together).
  local seenPals = {}
  local prev = s.cell
  local prev2 = prev
  for age = 0, 31 do
    H.w16(A.act_age, age)
    H.wait(1)
    s = G.state()
    local want = G.rom_pal(cell_pal(prev))
    seenPals[cell_pal(s.cell)] = true
    G.check(G.pal_equal(G.cgram_pal(1), want), string.format('transform age %d: palette %d of cell %d in CGRAM', age, cell_pal(prev), prev))
    -- a cell with the same palette may wait one frame for vblank room
    G.check(s.vram == prev or s.vram == s.cell or (s.vram == prev2 and cell_pal(prev2) == cell_pal(prev)),
      string.format('transform age %d: cell %d uploaded with its palette (VRAM %d)', age, prev, s.vram))
    prev2 = prev
    prev = s.cell
    if age == 2 or age == 12 or age == 20 or age == 30 then shot('transform' .. age) end
  end
  local n = 0; for _ in pairs(seenPals) do n = n + 1 end
  G.check(n >= 3, 'transformation steps through its transition palettes (' .. n .. ')')
  -- reversion back to base
  H.w8(A.form, 0)
  H.w8(A.act, 0x16); H.w8(A.act_arg, 0); H.w8(A.act_dur, 20)
  for age = 0, 19 do
    H.w16(A.act_age, age)
    H.wait(1)
    s = G.state()
    G.check(G.pal_equal(G.cgram_pal(1), G.rom_pal(cell_pal(prev))), string.format('revert age %d palette', age))
    prev = s.cell
    if age == 4 or age == 14 then shot('revert' .. age) end
  end
  H.w8(A.act, 0)
  H.wait(4)
  G.check(G.pal_equal(G.cgram_pal(1), G.rom_pal(0)), 'back to the base palette')
  G.check(hud_matches(0) == 0, 'HUD portrait back to base Goku')
  -- teleport: the absent frames hide body and shadow (shadow hook at C0:E760)
  local function shadows()
    local n = 0
    for i = 0, 127 do
      local y = H.oam(i * 4 + 1)
      if y < 224 and H.oam(i * 4 + 2) == 0x00 and (H.oam(i * 4 + 3) & 1) == 0 and math.abs(H.oam(i * 4) - (H.r16(0x7EE020) - 8)) <= 2 then n = n + 1 end
    end
    return n
  end
  local before = shadows()
  H.w8(A.act, 0x14); H.w8(A.act_facing, 0); H.w8(A.act_arg, 0)
  H.w16(A.act_age, 4); H.wait(3)
  G.check((H.r8(A.p_flags) & 1) == 1, 'teleport age 4: Goku hidden')
  G.check(#G.oam_goku() == 0, 'teleport age 4: no body OBJ')
  G.check(before > 0 and shadows() < before, 'teleport age 4: shadow hidden (' .. shadows() .. ' of ' .. before .. ')')
  H.w16(A.act_age, 7); H.wait(3)
  G.check(#G.oam_goku() > 0, 'teleport age 7: Goku reappears')
  H.w8(A.act, 0)
  H.wait(2)
  -- explicit cell override (scenes): goku_cell_req = cell + 1
  H.w16(A.cell_req, 1 + 3)
  H.wait(3)
  G.check(H.r16(A.p_cell) == 3, 'cell override shown')
  H.w16(A.cell_req, 0)
  -- api: hand socket during a beam pose
  G.finish()
end
