-- Frame and vblank dispatch in the field and in ring menus.
function test()
  H.wait(4)
  check('starts_in_field', idleField(), nmi())
  local f0, n0, m0 = H.r16(CORE), ct(0x2A), ct(0x3C)
  H.wait(120)
  local f1, n1, m1 = H.r16(CORE), ct(0x2A), ct(0x3C)
  check('field_frames', f1 - f0 >= 115 and f1 - f0 <= 121, f1 - f0)
  check('field_module_calls', m1 - m0 == f1 - f0, (m1 - m0) .. ' vs ' .. (f1 - f0))
  check('field_nmi_calls', n1 - n0 >= 115 and n1 - n0 <= 121, n1 - n0)
  check('field_mode', H.r16(CORE + 0x20) == 1, H.r16(CORE + 0x20))
  H.result('vblank_lines_left_field', ct(0x3E))
  -- Ring menu (Y) needs a later game: rings are disabled before the sword.
  -- Import a Potos scene from the browser mod. Its own loop dispatches once
  -- per vblank; the field loop is paused meanwhile.
  check("import_potos", H.importSnesJs(IMPORT_DIR .. "/emulator-probe__potos-state"), "import failed")
  H.waitFor(idleField, 300)
  H.wait(30)
  for _ = 1, 3 do
    if H.r16(CORE + 0x20) == 4 then break end
    H.tap("y", 6, 40)
  end
  local r0, fr0 = H.r16(CORE + 0x26), H.r16(CORE)
  H.wait(60)
  local r1, fr1 = H.r16(CORE + 0x26), H.r16(CORE)
  check("ring_frames", r1 - r0 >= 55 and r1 - r0 <= 61, r1 - r0)
  check("ring_mode", H.r16(CORE + 0x20) == 4, H.r16(CORE + 0x20))
  check("field_paused_in_ring", fr1 == fr0, fr1 - fr0)
  H.shot('ring')
  for _ = 1, 4 do
    if H.r16(CORE + 0x20) == 1 then break end
    H.tap('y', 6, 40)
  end
  local f2 = H.r16(CORE)
  H.wait(60)
  check('back_in_field', H.r16(CORE) - f2 >= 55 and H.r16(CORE + 0x20) == 1, (H.r16(CORE) - f2) .. ' mode ' .. H.r16(CORE + 0x20))
  finish()
end
