-- Dragon Radar in world flight: screenshots with the state that built them
-- (RAM read at the end of the previous frame: the OAM and band uploaded in
-- that vblank show in the next frame). run.mjs renders the browser's radar
-- for each sample and compares.
function sample(name)
  local s = {
    name = name,
    fa = H.r16(0x7E00FA), fc = H.r16(0x7E00FC), f6 = H.r16(0x7E00F6),
    fx = H.r16(0x7E0128), fy = H.r16(0x7E012A),
    sweep = ui(0x5A) - 1, uiframe = ui(0x36), guide = ui(0x60), target = ui(0x62),
    bx = ui(0x5C), by = ui(0x5E), dist = ui(0x64), rel = ui(0x72),
  }
  H.wait(1)
  H.shot(name)
  return s
end
function test()
  enter(BUNDLE, function()
    H.w16(UI + 0x40, QUEST)
    H.w16(UI + 0x74, FLAGS)
    H.w8(0x316380, 1)            -- first-flight banter given
  end)
  H.wait(10)
  local out = {}
  out[#out + 1] = sample('r1')
  for i, b in ipairs(STEER) do
    H.hold(b[1], b[2])
    out[#out + 1] = sample('r' .. (i + 1))
  end
  H.result('samples', out)
  finish()
end
