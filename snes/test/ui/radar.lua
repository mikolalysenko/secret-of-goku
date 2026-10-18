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
      -- the bearing on screen was computed from the state kept in
      -- !ui_s_gin (heading, position, target), up to two frames old
      local target = ui(0x62)
      local fx, fy = H.r16(0x7E0128), H.r16(0x7E012A)
      if target == 8 or target == 10 then fx, fy = H.r16(0x337F0E), H.r16(0x337F10) end
      local s = {
        name = name,
        fa = H.r16(0x337F0A), fc = H.r16(0x337F0C), f6 = H.r16(0x337F08),
        fx = fx, fy = fy,
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
  -- the world module's own flight state hides the radar (dragon-radar.js:
  -- no charge, aerial shot or explosion on screen): a Y ki shot, then an
  -- L+Y charge released into a weak wave. ui_world_frame runs before the
  -- world module's frame, so it sees the state of the frame before: the
  -- first frame of each busy stretch may still show the radar.
  local W = 0x7E7F00
  check('yield_shown', ui(0x68) == 1, 'radar not shown before the shot')
  H.hold('y', 2)
  local shot, hidden = 0, 0
  for _ = 1, 8 do
    H.wait(1)
    if H.r16(W + 0x46) ~= 0 then shot = shot + 1; if ui(0x68) == 0 then hidden = hidden + 1 end end
  end
  check('yield_shot', shot > 0 and hidden >= shot - 1, string.format('%d shot frames, %d hidden', shot, hidden))
  local back = 0
  for i = 1, 120 do H.wait(1); if ui(0x68) == 1 then back = i; break end end
  check('yield_back', back > 0, 'radar did not come back after the shot')
  H.input = { l = true, y = true }
  local charge, chidden = 0, 0
  for _ = 1, 16 do
    H.wait(1)
    if H.r16(W + 0x42) ~= 0 then charge = charge + 1; if ui(0x68) == 0 then chidden = chidden + 1 end end
  end
  H.input = nil
  check('yield_charge', charge > 0 and chidden >= charge - 1, string.format('%d charge frames, %d hidden', charge, chidden))
  local wave, whidden, back2 = 0, 0, 0
  for i = 1, 400 do
    H.wait(1)
    local busy = H.r16(W + 0x46) ~= 0 or H.r16(W + 0x5C) ~= 0xFFFF or H.r16(W + 0x64) ~= 0xFFFF
    if busy then wave = wave + 1; if ui(0x68) == 0 then whidden = whidden + 1 end
    elseif ui(0x68) == 1 then back2 = i; break end
  end
  check('yield_wave', wave > 0 and whidden == wave, string.format('%d wave/explosion frames, %d hidden', wave, whidden))
  H.result('yield_notes', string.format('shot %d, back after %d; charge %d; wave %d, back after %d', shot, back, charge, wave, back2))
  finish()
end
