-- Orbit globe + starfield test scene. Prelude globals (snes/test/orbit/run.mjs):
--   BUNDLE  import bundle directory (a map 246 state)
--   CAMS    list of cameras {x, y, r, lon, lat, age, name}
--   SPIN    frames to run with the longitude advancing (0 = none)
local SB = 0x326000
local function cam(c)
  H.w16(SB + 0x00, c.x & 0xFFFF)
  H.w16(SB + 0x02, c.y & 0xFFFF)
  H.w16(SB + 0x04, c.r)
  H.w16(SB + 0x06, c.lon)
  H.w16(SB + 0x08, c.lat)
  H.w16(SB + 0x0E, c.age or 0)
end
local function line(addr) return H.r16(addr) end
function test()
  H.wait(20)
  H.result('imported', H.importSnesJs(BUNDLE))
  H.wait(10)
  cam(CAMS[1])
  H.w8(0x7EDC09, 0)              -- orbit_test options
  H.w8(0x7EDC01, 1)              -- OC_TEST_GLOBE
  local live = H.waitFor(function() return H.r8(0x7EDC00) == 2 end, 60)
  H.result('live', live)
  H.wait(4)
  for i, c in ipairs(CAMS) do
    cam(c)
    H.wait(12)
    H.shot(c.name)
    local ln = {}
    for k = 1, 6 do H.wait(1); ln[#ln + 1] = line(0x7EDC0A) .. '/' .. line(0x7EDC0C) end
    H.result('lines_' .. c.name, table.concat(ln, ' '))
  end
  if SPIN and SPIN > 0 then
    cam(CAMS[1])
    H.wait(12)
    H.w8(0x7EDC09, 1)
    local f0 = H.r16(0x7EDC04)
    local worst = 0
    for f = 1, SPIN do
      H.wait(1)
      if f % 60 == 0 then H.shot('spin' .. f) end
      local fl = H.r16(0x7EDC0C)
      if fl > worst and fl < 262 then worst = fl end
    end
    H.result('spin_frames', H.r16(0x7EDC04) - f0)
    H.result('spin_worst_line', worst)
    H.result('lon_after_spin', H.r16(SB + 0x06))
  end
  H.result('state', H.r8(0x7EDC00))
end
