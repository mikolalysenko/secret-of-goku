-- Beam struggle and victory test. Prelude globals (snes/test/orbit/run.mjs):
--   BUNDLE  import bundle (a map 246 state)
--   PADS    pad word per frame (core $4218 layout), frame 0 first
--   SHOTS   frames to screenshot
--   HP      Frieza's HP at the start (6000: the clash begins at once)
-- Starts the fight (OC_TEST_FIGHT) and logs the clash every frame.
local SB = 0x326000
local FB = SB + 0xA80
local FN = SB + 0x1500
local function s16(a) local v = H.r16(a); if v >= 0x8000 then v = v - 0x10000 end; return v end
local function u32(a) return H.r16(a) + H.r16(a + 2) * 65536 end
local keys = {
  {0x8000, 'b'}, {0x4000, 'y'}, {0x0800, 'up'}, {0x0400, 'down'}, {0x0200, 'left'}, {0x0100, 'right'},
  {0x0080, 'a'}, {0x0040, 'x'}, {0x0020, 'l'}, {0x0010, 'r'},
}
local function input(pad)
  if pad == 0 then return nil end
  local t = {}
  for _, k in ipairs(keys) do if pad & k[1] ~= 0 then t[k[2]] = true end end
  return t
end
local function state()
  return string.format('%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d',
    H.r16(FB + 0x36), H.r16(FN + 0x1E), H.r16(FN + 0x00), H.r16(FN + 0x02),
    u32(FN + 0x04), u32(FN + 0x08), H.r16(FN + 0x0C),
    s16(FB + 0x04), s16(FB + 0x06), s16(FB + 0x30), s16(FB + 0x32), H.r16(FB + 0x34), H.r16(FB + 0x0A),
    s16(SB + 0x00), s16(SB + 0x02), H.r16(SB + 0x04), H.r16(SB + 0x06),
    H.r16(0x7EE182), H.r16(FB + 0x1A), H.r16(FN + 0x20), H.r16(FB + 0x00), H.r16(FB + 0x1E), H.r16(SB + 0xDB0))
end
function test()
  H.wait(20)
  H.result('imported', H.importSnesJs(BUNDLE))
  H.wait(10)
  H.w16(SB + 0x06, LON or 1848)
  H.w16(SB + 0x08, LAT or 3527)
  H.w16(0x7EDC0E, HP or 6000)
  H.w8(0x7ED740, 1)              -- goku_form: Super Saiyan
  H.w8(0x7EDC09, 0)
  H.w8(0x7EDC01, 3)              -- OC_TEST_FIGHT
  local live = H.waitFor(function() return H.r8(0x7EDC00) == 2 end, 60)
  H.result('live', live)
  local shots = {}
  for _, f in ipairs(SHOTS or {}) do shots[f] = true end
  local log = {}
  local lagged = 0
  local lastFrame = H.r16(0x7EDC04)
  local cmds = {}
  for f = 0, #PADS - 1 do
    H.input = input(PADS[f + 1])
    H.wait(1)
    log[#log + 1] = state()
    if shots[f] then H.shot(string.format('clash%04d', f)) end
    local fr = H.r16(0x7EDC04)
    if fr == lastFrame then lagged = lagged + 1 end
    lastFrame = fr
  end
  H.input = nil
  H.result('states', log)
  H.result('lagged', lagged)
end
