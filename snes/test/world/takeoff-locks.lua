-- L+R must use the same gate outdoors and indoors. World used to read the
-- chord a second time after flight rejected a boss/status/scene lock.
function test()
  H.wait(4)
  W.fresh()
  W.on(0)
  H.wait(20)
  W.check('ready', W.inField() and (H.r8(0x7ED900) & 4) ~= 0, H.r8(0x7ED900))
  H.saveStable('ready')
  local function reset()
    H.load(H_OUT .. '/ready.mss')
    H.wait(3)
  end
  local function blocked(name, write)
    reset()
    -- Keep the condition live at each flight gate; native status/actor
    -- work may otherwise remove a synthetic fixture before the pad latches.
    local id = emu.addMemoryCallback(write, emu.callbackType.exec, SYM.flight_frame)
    H.hold('l r', 8)
    emu.removeMemoryCallback(id, emu.callbackType.exec, SYM.flight_frame)
    W.check(name, W.inField() and H.r16(W.a.takeoff_req) == 0 and
      H.r16(W.a.trans_kind) == 0 and H.r16(0x337BF0) == 0, W.nmi())
  end
  blocked('live_boss', function()
    H.w8(0x7EE600, 1); H.w8(0x7EE780, 100)
    H.w16(0x7EE782, 1000); H.w8(0x7EE791, 0)
  end)
  blocked('custom_trial_boss', function() H.w8(0x337B68, 3) end)
  blocked('flight_scene_lock', function() H.w16(0x7ED976, 1) end)
  blocked('sleep', function() H.w8(0x7EE190, 0x10) end)
  blocked('dying_hero', function() H.w8(0x7EE191, 0x80) end)
  blocked('recovery_camera', function() H.w16(0x7ED932, H.r16(0x7ED932) | 4) end)
  -- Dying enemies no longer hold the escape lock; release/repress works.
  reset()
  local id = emu.addMemoryCallback(function()
    H.w8(0x7EE600, 1); H.w8(0x7EE780, 100)
    H.w16(0x7EE782, 1000); H.w8(0x7EE791, 0x80)
  end, emu.callbackType.exec, SYM.flight_frame)
  H.hold('l r', 4)
  emu.removeMemoryCallback(id, emu.callbackType.exec, SYM.flight_frame)
  W.check('dying_boss_releases', H.waitFor(W.inWorld, 180), W.nmi())
  W.finish()
end
