-- Extra OAM: a sprite behind the native ones, one in front of them, large
-- size and signed X, and cleanup when the module stops drawing.
local BACK_TILE = 0x31C0   -- hero tile $1C0 (second table), palette 0, priority 3
local FRONT_TILE = 0x31C2
function test()
  H.wait(4)
  local native = H.r16(CORE + 0x38)
  H.result('native_slots_before', native)
  -- Behind the natives.
  setct(0x0A, 100); setct(0x0C, 80); setct(0x0E, BACK_TILE); setct(0x10, 0); setct(0x08, 1)
  H.wait(3)
  local nb = H.r16(CORE + 0x38)
  local ib = findOam(100, 80, BACK_TILE)
  check('back_sprite_in_ppu_oam', ib ~= nil, 'not found')
  check('back_after_natives', ib ~= nil and ib == nb, tostring(ib) .. ' native ' .. nb)
  check('back_carry_clear', ct(0x1C) & 1 == 0, ct(0x1C))
  H.shot('back')
  -- In front of everything: either rotation or the comparison build's shift.
  setct(0x14, 140); setct(0x16, 90); setct(0x18, FRONT_TILE); setct(0x1A, 1); setct(0x12, 1)
  H.wait(3)
  local nf = H.r16(CORE + 0x38)
  local iff = findOam(140, 90, FRONT_TILE)
  local ib2 = findOam(100, 80, BACK_TILE)
  check('front_sprite_first', iff == (OAM_ROTATED and nf+1 or 0), tostring(iff))
  check('front_large', iff ~= nil and oamEntry(iff).size == 1, iff and oamEntry(iff).size)
  check('back_keeps_order', ib2 ~= nil and ib2 == nf + (OAM_ROTATED and 0 or 4), tostring(ib2) .. ' native ' .. nf)
  local first = OAM_ROTATED and nf+1 or 0
  check('front_padding_hidden', oamEntry(first+1).y == 0xE0 and oamEntry(first+2).y == 0xE0 and oamEntry(first+3).y == 0xE0,
    oamEntry(first+1).y .. ' ' .. oamEntry(first+2).y .. ' ' .. oamEntry(first+3).y)
  check('front_carry_clear', ct(0x1C) & 2 == 0, ct(0x1C))
  H.shot('front')
  -- Signed X: -8 sets the high X bit.
  setct(0x0A, 0xFFF8)
  H.wait(3)
  check('negative_x', findOam(-8, 80, BACK_TILE) ~= nil, 'not found')
  -- Offscreen parameters are dropped (no slot used, carry clear).
  setct(0x0A, 300)
  H.wait(3)
  check('offscreen_dropped', findOam(300 - 512, 80, BACK_TILE) == nil and ct(0x1C) & 1 == 0, ct(0x1C))
  -- Stop drawing: both disappear on the next frames (native C0:BCAB cleanup).
  setct(0x08, 0); setct(0x12, 0)
  H.wait(4)
  check('removed_back', findOam(100, 80, BACK_TILE) == nil and findOam(-8, 80, BACK_TILE) == nil, 'still visible')
  check('removed_front', findOam(140, 90, FRONT_TILE) == nil, 'still visible')
  -- Native sprites unaffected: the hero is still drawn somewhere.
  local visible = 0
  for i = 0, 127 do if oamEntry(i).y ~= 0xE0 then visible = visible + 1 end end
  check('natives_visible', visible >= 2, visible)
  H.shot('after')
  finish()
end
