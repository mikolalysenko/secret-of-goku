-- Fly's icon follows Goku's tracked palette slot on an ordinary map. The
-- waterfall case already covers slot 5; here slot 1 must retain its colors.
function test()
  W.import('barrier-audit__potos-probe')
  W.on(1)
  H.w8(0x7ECF00, 2)
  H.w8(0x7E0056, 2)
  H.w8(0x7ECC48, 0x27)
  local before = {}
  for i = 0, 15 do before[i] = W.cgram_word(128 + 16 + i) end
  H.tap('x', 4, 40)
  H.tap('up', 4, 70)
  H.shot('item_ring_potos')
  local icon, changed = nil, 0
  for i = 0, 127 do local e = W.oam(i); if W.visible(e) and e.tile == 0x0E0 then icon = e end end
  W.check('fly_icon_palette_potos', icon ~= nil and icon.pal == 1, icon and icon.pal or 'no icon')
  for i = 0, 15 do if W.cgram_word(128 + 16 + i) ~= before[i] then changed = changed + 1 end end
  W.check('fly_icon_colors_stable', changed == 0, changed)
  H.shot('item_ring_potos_after')
  for i = 0, 15 do if W.cgram_word(128 + 16 + i) ~= before[i] then changed = changed + 1 end end
  W.check('fly_icon_colors_stable_after', changed == 0, changed)
  W.finish()
end
