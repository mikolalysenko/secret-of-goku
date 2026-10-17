-- Docking (native-flight.js, sprite-layer.js): from a native session, hover
-- high next to the Mana Fortress. The native approach counter $CF reaches
-- $5C and the docking timer $BF starts; Goku's ki boost (+5 per frame)
-- replaces the four-second miniature dragon approach, the native dragon is
-- not submitted (C2:B230), and Goku flies a curve into the projected Fortress,
-- shrinking to the 16x16 miniature. The Fortress's own docking ABI (C2:B1CA)
-- then lands on its deck (map 255).
local function idle()
  return W.inField() and H.r8(0x7E00D0) == 0 and H.r8(0x7E00E4) == 1 and H.r8(0x7E00E5) == 1
end
local function interactive()
  return W.inWorld() and H.r8(0x7E00EC) & 0x80 ~= 0 and H.r8(0x7E00FE) == 0 and H.r8(0x7E00F2) & 0x83 == 0
end
-- Goku's OBJ (palette 5) in slots 0-15: count and bounding box
local function goku_box()
  local n, x0, y0, x1, y1 = 0, 999, 999, -999, -999
  for i = 0, 15 do
    local e = W.oam(i)
    if W.visible(e) and e.pal == 5 then
      local s = e.size == 1 and 16 or 8
      n = n + 1
      x0, y0 = math.min(x0, e.x), math.min(y0, e.y)
      x1, y1 = math.max(x1, e.x + s), math.max(y1, e.y + s)
    end
  end
  return n, x0, y0, x1, y1
end
function test()
  H.wait(4)
  W.fresh()
  W.on(1)
  W.check('field_start', H.waitFor(idle, 300), W.nmi())
  H.hold('l r', 4)
  W.check('world', H.waitFor(interactive, 900), W.nmi())
  H.wait(20)
  -- climb to docking altitude ($F8 >= $B8) with A
  H.hold('a', 120)
  H.result('altitude', H.r8(0x7E00F8))
  -- the Fortress just ahead of the camera (heading 0: north)
  H.w16(0x7E0128, H.r16(0x7E00FA) & 0x0FFF)
  H.w16(0x7E012A, (H.r16(0x7E00FC) - 24) & 0x0FFF)
  W.check('approach', H.waitFor(function() return H.r8(0x7E00BF) ~= 0 end, 200), 'CF ' .. H.r8(0x7E00CF) .. ' F8 ' .. H.r8(0x7E00F8))
  H.wait(1)
  W.check('dock_active', H.r16(W.a.dock) ~= 0, H.r16(W.a.dock))
  W.check('dock_sfx', H.r16(W.a.sfx) == 1, H.r16(W.a.sfx))
  local bf0 = H.r8(0x7E00BF)
  H.wait(4)
  -- the ki boost: +5 per frame on top of the native +1
  W.check('boost', H.r8(0x7E00BF) - bf0 >= 20, bf0 .. ' -> ' .. H.r8(0x7E00BF))
  -- early in the curve Goku's full cell is drawn
  local n, x0, y0, x1, y1 = goku_box()
  W.check('dock_cell', n >= 4 and x1 - x0 >= 24, string.format('%d obj %d,%d-%d,%d', n, x0, y0, x1, y1))
  -- no second (native) dragon: palette 5 only from Goku
  H.shot('dock_early')
  -- later: the 16x16 miniature (one OBJ) near the Fortress
  W.check('mini_phase', H.waitFor(function() return H.r8(0x7E00BF) >= 90 end, 60), H.r8(0x7E00BF))
  H.wait(1)
  n, x0, y0, x1, y1 = goku_box()
  W.check('dock_mini', n == 1 and x1 - x0 == 16, string.format('%d obj %d,%d-%d,%d', n, x0, y0, x1, y1))
  H.shot('dock_mini')
  -- the native fade lands on the deck (record 10, map 255)
  W.check('landed', H.waitFor(function() return W.inField() end, 400), W.nmi())
  W.check('deck_map', H.r16(0x7E00DC) == 255, H.r16(0x7E00DC))
  W.check('dock_cleared', H.r16(W.a.dock) == 0 or not W.inWorld(), H.r16(W.a.dock))
  H.wait(90)
  H.shot('deck')
  W.finish()
end
