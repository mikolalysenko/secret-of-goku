-- Title, credit and name editor from power-on (inputs as the browser's
-- ?start=title preset: 960 frames, Start, 180, B, 180).
function test()
  for _, f in ipairs({700, 760, 800, 940}) do
    H.wait(f - H.frame)
    H.shot(string.format('title-%04d', f))
  end
  H.result('program_patched', (H.wram(0xDD9E) & 2) ~= 0)
  H.wait(960 - H.frame)
  H.hold('start', 2)
  H.wait(180)
  H.hold('b', 2)
  H.wait(180)
  H.shot('name')
  H.result('name_len', H.wram(0xA1CC))
  H.result('name_cursor', H.wram(0xA157))
  H.result('prefilled', (H.wram(0xDD80) & 1) ~= 0)
  -- Start commits the editable default through the original code.
  H.hold('start', 2)
  H.wait(240)
  local n = {}
  for i = 0, 5 do n[#n + 1] = H.wram(0xCC00 + i) end
  H.result('hero_name', n)
  H.result('inventory_cc48', H.wram(0xCC48))
end
