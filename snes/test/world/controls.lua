-- Shared field/world combat state, real controller chords and held-input
-- suppression. A world-only charge used to ignore combat's transform and
-- scene locks, and never produced the native charge pulses.
local CB = 0x7ED800
function test()
  H.wait(5)
  W.import('preset__flight')
  W.on(0)
  H.wait(90)
  H.save('ready')
  local function reset()
    H.load(H_OUT .. '/ready.mss'); H.wait(4)
  end
  H.hold('l y', 30)
  W.check('shared_charge', H.r8(CB+0x28) == 1 and H.r16(CB+0x26) >= 25 and
    H.r16(CB+0x26) == H.r16(W.a.charge), H.r16(CB+0x26) .. '/' .. H.r16(W.a.charge))
  W.check('combat_owns_charge', H.r16(W.a.combat_owns) == 1, H.r16(W.a.combat_owns))
  H.hold('y', 3)
  W.check('release_l_fires', H.r16(W.a.shot) == 2 and H.r8(CB+0x28) == 0, H.r16(W.a.shot))
  H.hold('y', 100)
  W.check('held_y_no_extra_shot', H.r16(W.a.shot) == 0 and H.r8(CB+0x2B) ~= 0, H.r16(W.a.shot))
  H.wait(4); H.hold('y', 3)
  W.check('fresh_y_fires', H.r16(W.a.shot) == 1, H.r16(W.a.shot))
  reset()
  H.hold('l a', 100)
  H.result('focus_state', {power=H.r16(CB+0x2E), act=H.r8(CB+0x14), form=H.r8(CB+0x11),
    input=H.r16(CB+2), blocked=H.r8(CB+0x2C), status=H.r16(0x7EE190)})
  W.check('transform_running', H.r8(CB+0x14) == 0x15, H.r8(CB+0x14))
  H.hold('l y', 4)
  W.check('no_charge_during_transform', H.r8(CB+0x28) == 0 and H.r16(W.a.charging) == 0, H.r16(W.a.charging))
  H.hold('l y', 120)
  W.check('ssj_cap', H.r16(W.a.charge) == 45 and H.r8(W.GOKU) == 1, H.r16(W.a.charge))
  -- Scene input ownership cancels a held charge without firing its wave.
  local id = emu.addMemoryCallback(function() H.w16(CB+0x64, 1) end,
    emu.callbackType.exec, SYM.combat_world_frame)
  H.wait(4)
  W.check('scene_cancels_charge', H.r8(CB+0x28) == 0 and H.r16(W.a.charge) == 0 and
    H.r16(W.a.shot) == 0, H.r16(W.a.shot))
  H.hold('l y', 8)
  W.check('scene_blocks_new_charge', H.r8(CB+0x28) == 0 and H.r16(W.a.shot) == 0, H.r16(W.a.shot))
  emu.removeMemoryCallback(id, emu.callbackType.exec, SYM.combat_world_frame)
  reset()
  local altitude = H.r8(0x7E00F8)
  H.result('altitude_start', altitude)
  H.hold('l b', 20)
  W.check('teleport_chord_does_not_descend', H.r8(0x7E00F8) == altitude and W.inWorld(), H.r8(0x7E00F8))
  H.wait(3); H.hold('b', 20)
  W.check('b_still_descends', H.r8(0x7E00F8) < altitude, H.r8(0x7E00F8))
  W.finish()
end
