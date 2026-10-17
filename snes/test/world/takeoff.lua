-- L+R takeoff from the field (waterfall checkpoint, map 128): the native
-- $0C80 event path starts at an idle field frame, C1:E833 skips the Flammie
-- summon (no dragon, no E8=4 phase) and the fade goes straight to world
-- flight; Goku's takeoff pose runs on the goku module meanwhile. A lock
-- request from another module (world_lock) refuses the chord first. The Fly
-- ring item takes the same handoff (item.lua).
local function idle()
  return W.inField() and H.r8(0x7E00D0) == 0 and H.r8(0x7E00E4) == 1 and H.r8(0x7E00E5) == 1
end
function test()
  H.wait(4)
  W.fresh()
  W.check('field_start', H.waitFor(idle, 300), W.nmi())
  -- a lock request from another module refuses the chord
  H.w16(W.a.lock, 1)
  W.on(0)
  H.hold('l r', 4)
  H.wait(20)
  W.check('locked_no_takeoff', H.r16(W.a.takeoff_req) == 0 and W.inField(), H.r16(W.a.takeoff_req))
  H.w16(W.a.lock, 0)
  H.wait(4)
  -- the chord
  local t0 = H.frame
  H.hold('l r', 4)
  W.check('requested', H.r16(W.a.takeoff_req) == 1 or H.r16(W.a.trans_kind) == 1, H.r16(W.a.takeoff_req))
  local sawPose, sawE8, maxAge = false, false, 0
  local reached = H.waitFor(function()
    if H.r8(W.GOKU + 8) == 0x26 then sawPose = true; maxAge = math.max(maxAge, H.r16(W.GOKU + 10)) end
    if H.r8(0x7E00E8) == 4 then sawE8 = true end
    return W.inWorld()
  end, 600)
  local dt = H.frame - t0
  H.result('frames_to_world', dt)
  W.check('reached_world', reached, W.nmi())
  W.check('fast_handoff', dt < 140, dt)
  W.check('no_summon_phase', not sawE8, 'E8=4 seen')
  W.check('takeoff_pose', sawPose and maxAge >= 4, tostring(sawPose) .. ' age ' .. maxAge)
  W.check('event_id', H.r16(0x7ED73C) == 0x0C80, string.format('%04X', H.r16(0x7ED73C)))
  -- world flight running with Goku
  H.waitFor(function() return (H.r16(W.a.flags) & 1) == 1 and H.r16(W.a.frame) > 40 end, 600)
  W.check('goku_in_world', (H.r16(W.a.flags) & 1) == 1 and W.oam(0).size == 1 and W.oam(0).pal == 5, W.oam_dump(0, 8))
  W.check('pose_cleared', H.r8(W.GOKU + 8) == 0 and H.r16(W.a.trans_kind) == 0, H.r8(W.GOKU + 8))
  W.check('return_map', H.r16(0x7E00DC) == 128, H.r16(0x7E00DC))
  H.shot('world')
  W.finish()
end
