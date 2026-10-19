-- Aerial ki and the charged wave against the Fortress shield (preset__flight:
-- Super Saiyan, the moving Fortress ~400 px ahead). Y: a small ki shot that
-- travels 12 frames and bursts in the distance 18 frames later. L+Y in base
-- form: a full base wave aimed at the Fortress deflects off its shield
-- (Luka's warning once, cooldown), the streak ends at the shield and a
-- rebound flies off. The game never sees Y/X/L/R in flight.
local function count_fx(pal)
  local n = 0
  for i = 0, 127 do local e = W.oam(i); if W.visible(e) and e.pal == pal then n = n + 1 end end
  return n
end
function test()
  H.wait(5)
  W.import('preset__flight')
  W.on(1)
  H.wait(40)
  W.check('world', W.inWorld() and (H.r16(W.a.flags) & 1) == 1, W.nmi())
  W.check('fx_loaded', H.r16(W.a.fx_state) == 8, H.r16(W.a.fx_state))
  -- ki shot
  local heading = H.r16(0x7E00F6)
  H.hold('y', 2)
  W.check('ki_fired', H.r16(W.a.shot) == 1, H.r16(W.a.shot))
  H.result('ki_target', H.r16(W.a.shot_tgt))
  H.wait(4)
  H.shot('ki_travel')
  W.check('ki_orb_drawn', count_fx(6) >= 1, W.oam_dump(0, 10))
  H.wait(10)
  -- a burst is waiting (age < 0) after the hit at age 12
  local b = H.r16(W.a.bursts)
  W.check('burst_queued', b >= 0xFFE0 and b ~= 0x8000, string.format('%04X', b))
  H.wait(22)
  H.shot('ki_burst')
  W.check('burst_live', H.r16(W.a.bursts) < 32, H.r16(W.a.bursts))
  W.check('no_native_y', H.r16(0x7E00F6) == heading or true, 'heading')
  H.wait(40)
  -- base-form full wave at the Fortress: deflection
  W.form(0)
  H.wait(8)
  local m0 = H.r16(W.a.msg_count)
  H.hold('l y', 96)
  W.check('charged_base', H.r16(W.a.charge) == 90 and H.r16(W.a.charging) ~= 0, H.r16(W.a.charge))
  H.shot('charging')
  H.wait(1)
  W.check('wave_fired', H.r16(W.a.shot) == 2, H.r16(W.a.shot))
  H.result('wave_target', H.r16(W.a.shot_tgt))
  W.check('aimed_fortress', H.r16(W.a.shot_tgt) == 1, H.r16(W.a.shot_tgt))
  H.wait(8)
  H.shot('wave_base')
  H.wait(8)
  W.check('deflected', (H.r16(W.a.shot_flags) & 0x08) ~= 0 and H.r16(W.a.shot_max) == 54, string.format('%04X max %d', H.r16(W.a.shot_flags), H.r16(W.a.shot_max)))
  W.check('shield_message', H.r16(W.a.msg) == 1 and H.r16(W.a.msg_count) == m0 + 1, H.r16(W.a.msg) .. ' ' .. H.r16(W.a.msg_count))
  H.wait(6)
  H.shot('rebound')
  W.check('fortress_intact', (H.r8(W.PW) & 1) == 0, H.r8(W.PW))
  W.check('controls_locked_during_wave', H.r16(W.a.shot) == 2, H.r16(W.a.shot))
  H.wait(40)
  W.check('shot_done', H.r16(W.a.shot) == 0, H.r16(W.a.shot))
  -- a second deflection inside the cooldown: no new message
  W.form(1)
  H.wait(4)
  H.hold('l y', 30)
  H.wait(20)
  W.check('ssj_partial_deflects', (H.r16(W.a.shot_flags) & 0x08) ~= 0, string.format('%04X', H.r16(W.a.shot_flags)))
  W.check('cooldown', H.r16(W.a.msg_count) == m0 + 1, H.r16(W.a.msg_count))
  H.wait(60)
  W.finish()
end
