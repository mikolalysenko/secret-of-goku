-- Landing: B descends; the native landing check picks the map and C0:BC0B
-- clears request bit 0 of $E8 so the ordinary ground loader places the
-- party (no BG3 Flammie fly-by, $52 = 0), and Goku's landing pose (goku
-- mode $27) plays during the ground fade-in, ending after 32 visible frames.
local function idle()
  return W.inField() and H.r8(0x7E00D0) == 0 and H.r8(0x7E00E4) == 1 and H.r8(0x7E00E5) == 1
end
local function interactive()
  return W.inWorld() and H.r8(0x7E00EC) & 0x80 ~= 0 and H.r8(0x7E00FE) == 0 and H.r8(0x7E00F2) & 0x83 == 0
end
function test()
  H.wait(4)
  W.fresh()
  W.on(0)
  W.check('field_start', H.waitFor(idle, 300), W.nmi())
  H.hold('l r', 4)
  W.check('world', H.waitFor(interactive, 900), W.nmi() .. ' F2=' .. H.r8(0x7E00F2))
  H.wait(30)
  H.shot('flying')
  -- descend (B) until the landing starts
  local t0 = H.frame
  local fe = false
  for i = 1, 600 do
    H.hold('b', 1)
    if H.r8(0x7E00E8) & 1 == 1 or not W.inWorld() then fe = true; break end
  end
  W.check('landing_started', fe, string.format('E8=%02X F8=%d', H.r8(0x7E00E8), H.r8(0x7E00F8)))
  local sawPose, maxAge, flyby = false, 0, false
  local landed = H.waitFor(function()
    if W.inField() and H.r8(0x7E0052) ~= 0 then flyby = true end
    return idle()
  end, 900)
  H.result('frames_to_ground', H.frame - t0)
  W.check('landed', landed, W.nmi())
  H.shot('landed')
  -- the pose ages with visible field frames (the map's music upload can
  -- stall the field loop for a while) and ends after 32
  local done = H.waitFor(function()
    if H.r8(W.GOKU + 8) == 0x27 then sawPose = true; maxAge = math.max(maxAge, H.r16(W.GOKU + 10)) end
    if W.inField() and H.r8(0x7E0052) ~= 0 then flyby = true end
    return sawPose and H.r16(W.a.trans_kind) == 0
  end, 600)
  W.check('no_flyby', not flyby, '$52 set')
  W.check('landing_pose', sawPose and maxAge == 32, 'max age ' .. maxAge)
  W.check('pose_done', done and H.r8(W.GOKU + 8) == 0, H.r8(W.GOKU + 8) .. ' ' .. H.r16(W.a.trans_kind))
  W.check('landing_sound', H.r16(W.a.sfx) == 2, H.r16(W.a.sfx))
  H.result('map', H.r16(0x7E00DC))
  W.finish()
end
