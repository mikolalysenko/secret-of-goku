-- Native sound commands through C3:0004 and native events through C1:E76D.
function test()
  H.wait(4)
  local calls = 0
  local id = emu.addMemoryCallback(function() calls = calls + 1 end, emu.callbackType.exec, 0xC30160, 0xC30160)
  H.wait(2)
  local before = calls
  local r = command(4, { [0x24] = 0x5002, [0x26] = 0x880F })   -- 02 50 0F 88: hit
  check('sound_queued', r == 0, r)
  H.wait(2)
  check('sound_dispatched', calls > before, calls - before)
  check('sound_queue_empty', H.r16(CORE_EXT + 0x4A) == H.r16(CORE_EXT + 0x4C),
    H.r16(CORE_EXT + 0x4A) .. ' ' .. H.r16(CORE_EXT + 0x4C))
  check('driver_command_consumed', H.r8(0x7E1E00) == 0, H.r8(0x7E1E00))
  emu.removeMemoryCallback(id, emu.callbackType.exec, 0xC30160, 0xC30160)
  -- Event: door 3 ($0800 | door), started at an idle field boundary.
  local r2 = command(5, { [0x28] = 0x0803 })
  check('event_queued', r2 == 0, r2)
  local r3 = command(5, { [0x28] = 0x0804 })
  check('second_request_refused_or_started', r3 ~= nil, r3)
  check('event_started', H.waitFor(function() return H.r16(CORE + 0x3C) == 0x0803 end, 120),
    string.format('%04X', H.r16(CORE + 0x3C)))
  -- The dispatcher sets the destination map at once; the fade and load
  -- follow. Wait for the transition to start and finish.
  check('door_changed_map', H.waitFor(function() return map() ~= 128 end, 600), map())
  check('door_transition', H.waitFor(function() return not idleField() end, 300), 'no fade')
  check('idle_after_door', H.waitFor(idleField, 900), nmi())
  H.wait(30)
  H.result('door_map', map())
  H.shot('door')
  finish()
end
