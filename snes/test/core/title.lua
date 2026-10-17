-- Power-on and soft reset: the title boot hook runs on every entry to the
-- title program and clears module/core WRAM; the menu hook dispatches.
function test()
  H.wait(120)
  local boots0 = ct(0x32)
  check('boot_hook_ran', boots0 ~= 0, boots0)
  check('title_entry_power_on', H.r16(CORE + 0x2E) == 0, H.r16(CORE + 0x2E))
  for _ = 1, 80 do
    if inMenu() and H.r8(0x7EA202) == 3 then break end
    H.tap('start', 4, 20)
  end
  check('game_select', inMenu(), nmi())
  local m0 = H.r16(CORE + 0x24)
  H.wait(60)
  local m1 = H.r16(CORE + 0x24)
  check('menu_frames', m1 - m0 >= 55 and m1 - m0 <= 61, m1 - m0)
  check('menu_mode', H.r16(CORE + 0x20) == 3, H.r16(CORE + 0x20))
  -- Markers in module WRAM must not survive a soft reset.
  H.w16(0x7EDD80, 0xBEEF)
  H.w16(0x7ED740, 0x1234)
  H.hold('start select l r', 12)
  H.wait(120)
  local boots1 = ct(0x32)
  check('soft_reset_rebooted_title', (boots1 - boots0) & 0xFFFF == 1, boots1 - boots0)
  check('module_wram_cleared', H.r16(0x7EDD80) == 0 and H.r16(0x7ED740) == 0,
    string.format('%04X %04X', H.r16(0x7EDD80), H.r16(0x7ED740)))
  H.shot('after-reset')
  finish()
end
