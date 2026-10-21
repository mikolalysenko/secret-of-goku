-- The FX cell cache shares OBJ VRAM with the game's actor effect pieces
-- (fx.md "Native effect cells"). Real input in an imported field, checked
-- frame by frame by snes/test/lua/cells-check.lua (prepended by
-- native-cells.mjs), whole flames included. Prelude: BUNDLE, SETUP,
-- SCRIPT, FORM, SYM, SHOTS; SWEEP_FROM / SWEEP_TO / SWEEP_HOLD: FX draws
-- the aura as if Goku stood at those screen lines in turn (his $E022 for
-- FX's frame, restored after it), so its top rows cross line 0.
local sweepY, saved = nil, nil
if SWEEP_FROM and SYM.fx_frame and SYM.fx_finish then
  emu.addMemoryCallback(function()
    if not Cells.measuring or not sweepY then return end
    saved = H.r16(0x7EE022)
    H.w16(0x7EE022, sweepY & 0xFFFF)
  end, emu.callbackType.exec, SYM.fx_frame, SYM.fx_frame)
  emu.addMemoryCallback(function()
    if saved then H.w16(0x7EE022, saved); saved = nil end
  end, emu.callbackType.exec, SYM.fx_finish, SYM.fx_finish)
end
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
  local frame = 0
  for buttons, n in SCRIPT:gmatch('([^,:]+):(%d+)') do
    for i = 1, tonumber(n) do
      frame = frame + 1
      if SWEEP_FROM then sweepY = SWEEP_FROM + (frame // (SWEEP_HOLD or 4)) % (SWEEP_TO - SWEEP_FROM + 1) end
      H.input = {}; for b in buttons:gmatch('[^+]+') do if b ~= 'none' then H.input[b] = true end end
      H.wait(1); Cells.frame()
    end
  end
  Cells.measuring = false; H.input = nil
  Cells.report()
end
