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
  local recorded = {}
  for buttons, n in SCRIPT:gmatch('([^,:]+):(%d+)') do
    for i = 1, tonumber(n) do
      frame = frame + 1
      if SWEEP_FROM then sweepY = SWEEP_FROM + (frame // (SWEEP_HOLD or 4)) % (SWEEP_TO - SWEEP_FROM + 1) end
      H.input = {}; for b in buttons:gmatch('[^+]+') do if b ~= 'none' then H.input[b] = true end end
      H.wait(1); Cells.frame()
      if RECORD_FRAMES then
        H.shot(string.format('t%05d', frame))
        local o = {}
        for e = 0, 127 do
          local y = H.oam(e * 4 + 1)
          if y ~= 0xE0 then
            local a = H.oam(e * 4 + 3)
            local hi = (H.oam(512 + (e >> 2)) >> ((e & 3) * 2)) & 3
            o[#o + 1] = string.format('%03x%02x%03x%02x%d', H.oam(e * 4) | ((hi & 1) << 8), y, H.oam(e * 4 + 2) | ((a & 1) << 8), a, hi >> 1)
          end
        end
        recorded[#recorded + 1] = {f=frame, f4=H.r8(0x7E00F4), w=0, sig='', oam=table.concat(o, ','), cg='', orbs={}}
      end
    end
  end
  Cells.measuring = false; H.input = nil
  if RECORD_FRAMES then H.result('actorMeta', recorded) end
  Cells.report()
end
