-- Full-screen menu dispatch and the pad filter in the name editor (polled
-- every 4th frame by the game).
local function cursor() return H.r8(0x7EA159) end
local function len() return H.r8(0x7EA1CC) end
function test()
  H.wait(4)
  check('starts_in_menu', inMenu(), nmi())
  local m0 = H.r16(CORE + 0x24)
  H.wait(60)
  check('menu_frames', H.r16(CORE + 0x24) - m0 >= 58, H.r16(CORE + 0x24) - m0)
  check('menu_mode', H.r16(CORE + 0x20) == 3, H.r16(CORE + 0x20))
  -- One-frame inject survives the slower poll.
  local c0 = cursor()
  setct(0x06, PAD.right)
  H.wait(1)
  setct(0x06, 0)
  H.wait(20)
  check('inject_one_frame_moves_cursor', cursor() == c0 + 8, string.format('%02X -> %02X', c0, cursor()))
  -- Mask B: holding B types nothing.
  setct(0x04, PAD.b)
  local l0 = len()
  H.hold('b', 16)
  H.wait(16)
  check('mask_b_blocks_letter', len() == l0, len() - l0)
  setct(0x04, 0)
  H.wait(4)
  H.hold('b', 8)
  H.wait(16)
  check('b_types_after_unmask', len() == l0 + 1, len() - l0)
  H.shot('menu')
  finish()
end
