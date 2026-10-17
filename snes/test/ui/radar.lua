-- Dragon Radar in world flight: screenshots with the state that built them
-- (RAM read at the end of the previous frame: the OAM and band uploaded in
-- that vblank show in the next frame). run.mjs renders the browser's radar
-- for each sample and compares.
function sample(name)
  H.wait(12)                     -- let the heading settle after steering
  -- a sample needs two consecutive completed world frames (lag frames
  -- upload a half-built OAM), so retry until the UI frame counter moves by
  -- one per video frame across the screenshot
  for _ = 1, 30 do
    local f0 = ui(0x36)
    H.wait(1)
    local f1 = ui(0x36)
    if f1 == f0 + 1 then
      local s = {
        name = name,
        fa = H.r16(0x7E00FA), fc = H.r16(0x7E00FC), f6 = H.r16(0x7E00F6),
        fx = H.r16(0x7E0128), fy = H.r16(0x7E012A),
        sweep = ui(0x5A) - 1, uiframe = ui(0x36), guide = ui(0x60), target = ui(0x62),
        bx = ui(0x5C), by = ui(0x5E), dist = ui(0x64), across8 = ui(0x88), along8 = ui(0x8A),
        qcount = H.r16(0x7ED70A), vline = H.r16(0x7ED73E), phase = ui(0x58), front = ui(0x86),
      }
      H.wait(1)
      if ui(0x36) == f1 + 1 then
        H.shot(name)
        return s
      end
    end
  end
  error('no lag-free frames for ' .. name)
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
