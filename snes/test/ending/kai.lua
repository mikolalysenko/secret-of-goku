-- King Kai's planet: bad outcome (instant, Super Saiyan Goku, scolding pose)
-- and good outcome (32-frame fade-in, base Goku), then the end card.
-- Bubbles' state is recorded with each still for the reference picture.
local function bubbles()
  local bx = (E.sram16(0x80) + 0x80) >> 8
  local by = (E.sram16(0x82) + 0x80) >> 8
  return bx, by, E.sram16(0x88), E.sram16(0x8C)
end
-- Wait until Bubbles rests, then let the screenshot pipeline catch up.
local function stillShot(name)
  H.wait(8)
  H.waitFor(function() local _, _, _, walk = bubbles() return walk == 0 end, 400)
  H.wait(6)
  local bx, by, dir, walk = bubbles()
  H.shot(name)
  H.result(name, string.format('%d,%d,%d,%d', bx, by, dir, walk))
end
function test()
  E.import(BUNDLE or 'preset__bad-ending')
  E.watchVblank(1)
  local t0 = H.frame
  local core0 = H.r16(0x7ED700)
  E.cue('kai', 0x0005)          -- bad + permanent SSJ
  local loaded = E.waitLoaded('kai', 120)
  H.result('bad_loaded', loaded)
  H.result('bad_load_frames', H.frame - t0)
  H.wait(2)
  E.arm(true)
  H.shot('bad-kai-0')
  local path = {}
  local f0, c0 = H.frame, H.r16(0x7ED700)
  for i = 1, 12 do
    H.wait(50)
    local bx, by, dir, walk = bubbles()
    path[#path + 1] = string.format('%d,%d,%d', bx, by, walk)
    if i == 4 then H.shot('bad-kai-200') end
  end
  H.result('lag_frames', (H.frame - f0) - (H.r16(0x7ED700) - c0))
  H.result('bubbles_path', table.concat(path, ' '))
  H.result('kai_done', (H.r16(E.done) >> 9) & 1)
  E.cue('complete')
  stillShot('bad-complete')
  H.result('complete_status', H.r8(E.status))
  -- Good outcome from scratch.
  E.arm(false)
  E.cue('kai', 0x0000)
  loaded = E.waitLoaded('kai', 120)
  H.wait(2)
  E.arm(true)
  H.result('good_loaded', loaded)
  H.wait(8)
  H.shot('good-kai-8')
  f0, c0 = H.frame, H.r16(0x7ED700)
  H.wait(40)
  H.result('fade_lag_frames', (H.frame - f0) - (H.r16(0x7ED700) - c0))
  H.shot('good-kai-48')
  E.cue('complete')
  stillShot('good-complete')
  H.result('overruns', E.overruns)
  H.result('overrun_max', E.overrunMax)
end
