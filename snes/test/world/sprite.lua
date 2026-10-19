-- Goku replaces Flammie in Mode 7 world flight: no Flammie OBJ, Goku's
-- 32x32 rear-view flight cell from the goku module at (112 + 2*bank, 68 +
-- bob) in slots 0-3, palette 5 = the goku palette, banking with the D-pad,
-- the pixel shadow when flying low, both forms.
local function goku_slots()
  local t = {}
  for i = 0, 3 do t[#t + 1] = W.oam(i) end
  return t
end
local function flammie_visible()
  local n = 0
  for i = 0, 63 do
    local e = W.oam(i)
    if W.visible(e) and e.pal == 5 and e.size == 0 then n = n + 1 end
  end
  return n
end
local function check_cell(tag)
  local show = H.r16(W.a.show)
  local cell = H.r16(show == 0 and W.a.buf0 or W.a.buf1)
  local base = show == 0 and 0x080 or 0x084
  W.check(tag .. '_vram', W.vram_cell_bad(cell, base) == 0, 'cell ' .. cell .. ' bad bytes ' .. W.vram_cell_bad(cell, base))
  return cell
end
local function check_palette(tag)
  local pal = H.r16(W.a.pal_form)
  local bad = 0
  for i = 1, 15 do
    if W.cgram_word(128 + 5 * 16 + i) ~= W.romw(SYM.goku_palettes + pal * 32 + i * 2) then bad = bad + 1 end
  end
  W.check(tag .. '_palette5', bad == 0, 'pal ' .. pal .. ' mismatches ' .. bad)
end

function test()
  H.wait(5)
  W.import('preset__flight')
  W.on(1)
  H.wait(40)
  W.check('in_world', W.inWorld(), W.nmi())
  W.check('active', (H.r16(W.a.flags) & 1) == 1, H.r16(W.a.flags))
  W.check('vram_claimed', H.r16(W.a.vram_ok) == 1, H.r16(W.a.vram_ok))
  W.check('no_flammie', flammie_visible() == 0, W.oam_dump(0, 63))
  local s = goku_slots()
  W.check('goku_tl', s[1].x >= 110 and s[1].x <= 114 and s[1].y >= 67 and s[1].y <= 69 and s[1].size == 1 and s[1].pal == 5 and s[1].prio == 3,
    W.oam_dump(0, 7))
  local cell = check_cell('ssj')
  local col = nil
  for c = 36, 39 do if W.cell_id(1, c, 3) == cell then col = c end end
  W.check('ssj_flight_cell', col ~= nil, 'cell ' .. cell)
  check_palette('ssj')
  H.shot('ssj')
  -- the clip advances (5 ticks per frame in SSJ)
  local seen = {}
  for i = 1, 24 do
    H.wait(1)
    local show = H.r16(W.a.show)
    seen[H.r16(show == 0 and W.a.buf0 or W.a.buf1)] = true
  end
  local n = 0
  for _ in pairs(seen) do n = n + 1 end
  W.check('flight_clip_cycles', n == 4, n .. ' cells')
  -- banking: 2 px per held direction
  H.hold('left', 12)
  local xl = W.oam(0).x
  H.hold('right', 12)
  local xr = W.oam(0).x
  H.wait(4)
  local xc = W.oam(0).x
  H.result('bank_x', xl .. ' ' .. xc .. ' ' .. xr)
  W.check('banking', xl == 110 and xr == 114 and xc == 112, xl .. ' ' .. xc .. ' ' .. xr)
  -- base form
  W.form(0)
  H.wait(12)
  cell = check_cell('base')
  col = nil
  for c = 40, 43 do if W.cell_id(0, c, 3) == cell then col = c end end
  W.check('base_flight_cell', col ~= nil, 'cell ' .. cell)
  check_palette('base')
  H.shot('base')
  -- low flight: the native shadow window becomes Goku's small pixel shadow
  W.import('emulator-probe__flight-baseline')
  W.on(0)
  H.wait(30)
  local shadow = nil
  for i = 0, 15 do
    local e = W.oam(i)
    if W.visible(e) and e.pal == 6 and e.tile == W.romw(SYM.world_fx_tile + 15 * 2) then shadow = e end
  end
  W.check('shadow_sprite', shadow ~= nil and shadow.x == 120, W.oam_dump(0, 15))
  H.result('shadow_y', shadow and shadow.y or -1)
  W.check('no_window', H.r8(0x7E002D) == 0, H.r8(0x7E002D))
  H.shot('low')
  W.finish()
end
