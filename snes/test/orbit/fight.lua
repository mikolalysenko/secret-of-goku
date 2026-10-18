-- Space fight logic test. Prelude globals (snes/test/orbit/run.mjs):
--   BUNDLE  import bundle (a map 246 state)
--   PADS    pad word per frame (core $4218 layout), frame 0 first
--   SHOTS   frames to screenshot
-- Starts the fight (OC_TEST_FIGHT) and logs its state every frame.
local SB = 0x326000
local FB = SB + 0xA80
local function s16(a) local v = H.r16(a); if v >= 0x8000 then v = v - 0x10000 end; return v end
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
  local p = {}
  -- hero, heading, charge, teleport, punch
  p[#p + 1] = string.format('%d,%d,%d,%d,%d,%d', s16(FB + 0x04), s16(FB + 0x06), H.r16(FB + 0x08), H.r16(FB + 0x0A), H.r16(FB + 0x0E), H.r16(FB + 0x10))
  -- boss x, y, hp, clock, cycle, node, dash, stun, age
  p[#p + 1] = string.format('%d,%d,%d,%d,%d,%d,%d,%d,%d', s16(FB + 0x30), s16(FB + 0x32), H.r16(FB + 0x34), s16(FB + 0x38),
    H.r16(FB + 0x3A), H.r16(FB + 0x46), H.r16(FB + 0x42), H.r16(FB + 0x3C), H.r16(FB + 0x36))
  -- warning kind, age; Goku HP; camera
  p[#p + 1] = string.format('%d,%d,%d', H.r16(FB + 0x5A), H.r16(FB + 0x5C), H.r16(0x7EE182))
  p[#p + 1] = string.format('%d,%d,%d,%d,%d', H.r16(SB), H.r16(SB + 2), H.r16(SB + 4), H.r16(SB + 6), H.r16(SB + 8))
  -- wave: on, age; the pad the fight read this frame
  p[#p + 1] = string.format('%d,%d,%d', H.r16(FB + 0x20), H.r16(FB + 0x28), H.r16(FB + 0x1A))
  -- Frieza's shots: kind:x:y:age
  local shots = {}
  for i = 0, 11 do
    local e = FB + 0xB0 + i * 16
    local k = H.r16(e)
    local age = H.r16(e + 0x0A)
    if k ~= 0 and age < 330 then shots[#shots + 1] = string.format('%d:%d:%d:%d', k, s16(e + 2), s16(e + 4), age) end
  end
  table.sort(shots)
  p[#p + 1] = table.concat(shots, ' ')
  -- Goku's ki: x:y:age
  local kis = {}
  for i = 0, 5 do
    local e = FB + 0x80 + i * 8
    local age = H.r16(e + 6)
    if age < 31 then kis[#kis + 1] = string.format('%d:%d:%d', s16(e), s16(e + 2), age) end
  end
  table.sort(kis)
  p[#p + 1] = table.concat(kis, ' ')
  -- hits x:y:age
  local hits = {}
  for i = 0, 7 do
    local e = FB + 0x1B0 + i * 6
    local age = H.r16(e + 4)
    if age < 54 then hits[#hits + 1] = string.format('%d:%d:%d', s16(e), s16(e + 2), age) end
  end
  table.sort(hits)
  p[#p + 1] = table.concat(hits, ' ')
  return table.concat(p, '|')
end
function test()
  H.wait(20)
  H.result('imported', H.importSnesJs(BUNDLE))
  H.wait(10 + (EXTRA or 0))
  H.w16(SB + 0x06, LON or 1848)
  H.w16(SB + 0x08, LAT or 3527)
  H.w16(0x7EDC0E, HP or 32000)
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
  for f = 0, #PADS - 1 do
    H.input = input(PADS[f + 1])
    H.wait(1)
    log[#log + 1] = state()
    if shots[f] then H.shot(string.format('fight%04d', f)) end
    local fr = H.r16(0x7EDC04)
    if fr == lastFrame then lagged = lagged + 1 end
    lastFrame = fr
  end
  H.input = nil
  H.result('states', log)
  H.result('lagged', lagged)
end
