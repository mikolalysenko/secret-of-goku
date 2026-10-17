-- Plays one flight scenario (scenarios.mjs, passed as SC) on the cartridge
-- and writes the per-frame trace to trace.json (same fields as
-- browser-ref.mjs: map, x, y, t, fly, lift, can).
local function rec()
  local s = F.status()
  return {map = s.map, x = s.x, y = s.y, t = s.terrain, fly = s.fly, lift = s.lift, can = s.can}
end
function test()
  F.import(SC.fixture)
  F.on()
  F.enter(SC.enter.map, SC.enter.x, SC.enter.y, SC.enter.layer or 0, SC.enter.flags)
  for _, p in ipairs(SC.prep or {}) do
    if p == 'clearActors' then F.clearActors() end
    if p == 'clearSupport' then for a = 0x7EE200, 0x7EE5FF do H.w8(a, 0) end end
    if p == 'ssj' then H.w8(0x7ED740, 1) end
    if type(p) == 'table' then
      H.w16(0x7EE002, p.x); H.w16(0x7EE004, p.y)
      -- teleport.follow(): companions join and the camera scrolls there
      F.follow(p.x, p.y)
    end
  end
  local frames = {rec()}
  for _, st in ipairs(SC.steps) do
    local input = nil
    if st.b and #st.b > 0 then
      input = {}
      for _, k in ipairs(st.b) do input[k] = true end
    end
    for i = 1, st.n do
      H.input = input
      H.wait(1)
      frames[#frames + 1] = rec()
    end
  end
  H.input = nil
  local f = assert(io.open(H_OUT .. '/trace.json', 'w'))
  f:write(H.json(frames))
  f:close()
  H.result('frames', #frames)
  H.result('pass', true)
end
