-- The FX cell cache shares OBJ VRAM with the game's actor effect pieces
-- (fx.md "Native effect cells"). Real input in an imported field, checked
-- frame by frame by snes/test/lua/cells-check.lua (prepended by
-- native-cells.mjs). Prelude: BUNDLE, SETUP, SCRIPT, FORM, SYM, SHOTS.
function test()
  Cells.init()
  H.wait(5)
  assert(H.importSnesJs(BUNDLE), 'import failed')
  H.w8(0x316001, 1)
  H.wait(45)
  if FORM == 1 then H.w8(0x7ED811, 1); H.w8(0x7ED740, 1) end
  for buttons, n in SETUP:gmatch('([^,:]+):(%d+)') do
    H.input = {}; for b in buttons:gmatch('[^+]+') do if b ~= 'none' then H.input[b] = true end end
    H.wait(tonumber(n))
  end
  Cells.measuring = true
  for buttons, n in SCRIPT:gmatch('([^,:]+):(%d+)') do
    for i = 1, tonumber(n) do
      H.input = {}; for b in buttons:gmatch('[^+]+') do if b ~= 'none' then H.input[b] = true end end
      H.wait(1); Cells.frame()
    end
  end
  Cells.measuring = false; H.input = nil
  Cells.report()
end
