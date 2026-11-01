-- Frieza's pointer/facing pose: no laser, then every laser heading. The
-- callback runs before fd_beam_wants so both its cache and fd_frieza see the
-- same shot. POSE_FRAME is just after fd_frieza stores v_frieza.
local SB = SCENE_RAM
local FB = SB + 0xA80
function test()
  H.wait(20)
  H.result('imported', H.importSnesJs(BUNDLE))
  H.wait(10)
  H.w16(SB + 0x06, 1848)
  H.w16(SB + 0x08, 3527)
  H.w16(ORBIT_RAM + 0x0E, 32000)
  H.w8(GOKU_FORM, 1)
  H.w8(ORBIT_RAM + 0x09, 0)
  H.w8(ORBIT_RAM + 0x01, 3)
  local live = H.waitFor(function() return H.r8(ORBIT_RAM) == 2 end, 60)
  H.result('live', live)
  local heading = -1
  local values, keys, signs, flips = {}, {}, {}, {}
  emu.addMemoryCallback(function()
    for i = 0, 11 do H.w16(FB + 0xB0 + i * 16, 0) end
    H.w16(FB + 0x14, 0) -- duel
    H.w16(FB + 0x3E, 0) -- hurt
    H.w16(FB + 0x40, 0) -- blink
    H.w16(FB + 0x42, 0) -- dash
    H.w16(FB + 0x4A, 0) -- evade
    H.w16(FB + 0x5A, 0) -- warning
    if heading >= 0 then
      local shot = FB + 0xB0
      H.w16(shot, 2)
      H.w16(shot + 2, 114)
      H.w16(shot + 4, 100)
      H.w16(shot + 6, heading)
      H.w16(shot + 0x0A, 0)
    end
  end, emu.callbackType.exec, POSE_BEAM, POSE_BEAM)
  emu.addMemoryCallback(function()
    values[#values + 1] = H.r16(SB + 0xD20)
    keys[#keys + 1] = H.r16(SB + 0xD42)
    signs[#signs + 1] = H.r16(SB + 0xD56)
    flips[#flips + 1] = H.r16(SB + 0xD08)
  end, emu.callbackType.exec, POSE_FRAME, POSE_FRAME)
  for f = 0, 16 do
    heading = f - 1
    H.wait(1)
  end
  H.result('values', values)
  H.result('keys', keys)
  H.result('signs', signs)
  H.result('flips', flips)
end
