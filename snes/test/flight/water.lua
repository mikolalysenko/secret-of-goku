-- Water Palace platform gap (flight-regressions.spec.mjs "Goku flies across
-- the Water Palace platform gap and hovers safely if released over it"):
-- same fixture (graphics-audit/party), same warp (map 139, tile 17,55), same
-- inputs for the first part: A+Up 14 frames over the gap, release (hover in
-- place for 45 frames). Then A+Up until Goku has crossed and landed on the
-- far platform (the browser needs 14 frames; the cartridge reports how many
-- it needed and its logic frame rate), and A+Down back across.
local logic = 0
local function count() logic = logic + 1 end
function test()
  F.import('graphics-audit__party')
  F.on()
  F.enter(139, 17, 55)
  local id = emu.addMemoryCallback(count, emu.callbackType.exec, 0x00B077, 0x00B077)
  local start = F.status()
  H.hold('a up', 14)
  local over = F.status()
  H.shot('over')
  H.wait(45)
  local hover = F.status()
  H.shot('hover')
  local frames, across = 0, nil
  repeat
    H.hold('a up', 1)
    frames = frames + 1
    across = F.status()
  until across.y <= 762 or frames >= 40
  H.wait(10)
  across = F.status()
  H.shot('across')
  local back = nil
  frames2 = 0
  repeat
    H.hold('a down', 1)
    frames2 = frames2 + 1
    back = F.status()
  until back.y > 850 or frames2 >= 80
  H.wait(10)
  back = F.status()
  H.shot('back')
  emu.removeMemoryCallback(id, emu.callbackType.exec, 0x00B077, 0x00B077)
  H.log('start', F.str(start)); H.log('over', F.str(over)); H.log('hover', F.str(hover))
  H.log('across after ' .. frames .. ' frames', F.str(across)); H.log('back after ' .. frames2 .. ' frames', F.str(back))
  H.log(string.format('logic frames %d in %d video frames', logic, H.frame))
  F.check(start.y > 848 and not start.fly, 'starts on the near platform: ' .. F.str(start))
  F.check(over.fly and over.y > 768 and over.y < 848, 'over the gap after 14 frames of A+Up: y ' .. over.y)
  F.check(hover.fly, 'still flying after release over the gap')
  F.check(math.abs(hover.y - over.y) <= 2, 'hover holds position: ' .. hover.y .. ' vs ' .. over.y)
  F.check(across.y < 768, 'crossed the gap: y ' .. across.y)
  F.check(not across.fly and across.lift == 0, 'landed on the far platform')
  F.check(across.map == 139, 'same map')
  F.check(back.y > 850 and not back.fly, 'flew back and landed: ' .. F.str(back))
  H.result('cross_frames', frames)
  H.result('back_frames', frames2)
  H.result('failures', F.fail)
  H.result('pass', #F.fail == 0)
end
