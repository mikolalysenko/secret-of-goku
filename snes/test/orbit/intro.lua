-- Orbit intro through the public API (OC_API_INTRO: orbit_api_defaults +
-- orbit_api_enter with the intro). Prelude globals (snes/test/orbit/run.mjs):
--   BUNDLE  import bundle (a map 246 state)
--   MARKS   frames after the scene went live to log and screenshot
local SB = 0x326000
local FB = SB + 0xA80
function test()
  H.wait(20)
  H.result('imported', H.importSnesJs(BUNDLE))
  H.wait(10)
  H.w8(0x7ED740, 1)              -- goku_form: Super Saiyan
  H.w8(0x7EDC01, 4)              -- OC_API_INTRO
  local live = H.waitFor(function() return H.r8(0x7EDC00) == 2 end, 60)
  H.result('live', live)
  local marks = {}
  local last = 0
  for _, m in ipairs(MARKS) do marks[m] = true; if m > last then last = m end end
  local log = {}
  for f = 0, last do
    H.wait(1)
    if marks[f] then
      H.shot(string.format('intro%04d', f))
      log[#log + 1] = string.format('%d,%d,%d,%d,%d,%d', f, H.r16(FB + 2), H.r16(SB + 0xDB0), H.r16(SB + 0xDB2), H.r16(FB + 0x30), H.r16(FB + 0x38))
    end
  end
  H.result('states', log)
end
