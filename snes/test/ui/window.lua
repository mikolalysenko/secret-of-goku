-- The telepathy window on the ground: drawn, pixel-checked by run.mjs
-- against radioPixels(), removed cleanly with the HUD colours restored.
function test()
  enter(BUNDLE)
  H.shot('before')
  local hud = {}
  for i = 9, 15 do hud[i] = cgram(i) end
  check('say_accepted', command(1, MSG, 0) == 0)
  H.wait(12)
  H.shot('window')
  check('drawn', (ui(0x00) & 7) == 7, string.format('state %04X', ui(0x00)))
  check('hdma_enabled', (H.r8(0x7E002C) & 0x20) ~= 0, H.r8(0x7E002C))
  check('frame_corner', bg3(1, 1) == 0x2D10, string.format('%04X', bg3(1, 1)))
  check('frame_edge_right', bg3(1, 29) == 0x6D11, string.format('%04X', bg3(1, 29)))
  check('bottom_corner', bg3(8, 30) == 0xED10, string.format('%04X', bg3(8, 30)))
  -- HUD palettes 2/3 back to the game's colours below the window
  local ok = true
  for i = 9, 15 do if cgram(i) ~= hud[i] then ok = false end end
  check('hud_colours_restored', ok)
  -- expiry (220 frames) removes the box and the HDMA
  H.waitFor(function() return ui(0x04) == 0 end, 400)
  H.wait(3)
  H.shot('cleared')
  local blank = true
  for r = 1, 8 do for c = 0, 31 do if bg3(r, c) ~= 0 then blank = false end end end
  check('rows_blank', blank)
  check('hdma_off', (H.r8(0x7E002C) & 0x20) == 0, H.r8(0x7E002C))
  -- the lower placement (Frieza's full-power cutscene lines)
  check('interrupt_accepted', command(2, LOWER, 0) == 0)
  H.wait(12)
  H.shot('lower')
  check('lower_corner', bg3(17, 1) == 0x2D10, string.format('%04X', bg3(17, 1)))
  check('top_rows_blank', bg3(1, 1) == 0, string.format('%04X', bg3(1, 1)))
  finish()
end
