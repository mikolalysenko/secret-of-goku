-- World flight: the game's own takeoff event ($0C00 | map, the Drum's path)
-- from the waterfall, then world frame/vblank dispatch and world OAM slots.
function test()
  H.wait(4)
  local r = command(5, { [0x28] = 0x0C80 })
  check('takeoff_requested', r == 0, r)
  check('world_entered', H.waitFor(inWorld, 1800), nmi())
  -- Wait out the summon / fade until the world loop runs.
  H.waitFor(function() return ct(0x3A) > 30 end, 1800)
  for _ = 1, 30 do
    if H.r8(0x7E00D0) == 0x83 then H.tap('b', 4, 4) else H.wait(4) end
  end
  local w0, n0 = ct(0x3A), ct(0x2C)
  H.wait(120)
  local w1, n1 = ct(0x3A), ct(0x2C)
  H.result('world_frames_per_120', w1 - w0)
  H.result('world_nmi_per_120', n1 - n0)
  check('world_frames', w1 - w0 >= 55, w1 - w0)
  check('world_nmi', n1 - n0 >= 55 and n1 - n0 <= w1 - w0 + 1, (n1 - n0) .. ' vs ' .. (w1 - w0))
  check('world_mode', H.r16(CORE + 0x20) == 2, H.r16(CORE + 0x20))
  setct(0x0A, 120); setct(0x0C, 100); setct(0x0E, 0x3100); setct(0x10, 1); setct(0x08, 1)
  H.wait(3)
  local i = findOam(120, 100, 0x3100)
  check('world_sprite_slot', i ~= nil and i >= 88, tostring(i))
  check('world_sprite_large', i ~= nil and oamEntry(i).size == 1, i and oamEntry(i).size)
  H.shot('world')
  setct(0x08, 0)
  H.wait(3)
  check('world_sprite_removed', findOam(120, 100, 0x3100) == nil, 'still there')
  -- Steering input still reaches the world code through the filter.
  local h0 = H.r16(0x7E00F6)
  H.hold('left', 40)
  H.result('heading_change', (H.r16(0x7E00F6) - h0) & 0xFFFF)
  check('steering_works', (H.r16(0x7E00F6) - h0) & 0xFFFF ~= 0, 'no turn')
  -- Let the turn settle, then the masked hold must behave like no input.
  H.wait(90)
  local h1 = H.r16(0x7E00F6)
  H.wait(40)
  local idle = (H.r16(0x7E00F6) - h1) & 0xFFFF
  setct(0x04, PAD.left | PAD.right)
  H.wait(2)   -- a request applies from the game's next pad read
  local h2 = H.r16(0x7E00F6)
  H.hold('left', 40)
  local masked = (H.r16(0x7E00F6) - h2) & 0xFFFF
  setct(0x04, 0)
  H.result('heading_idle_vs_masked', idle .. ' ' .. masked)
  check('mask_blocks_steering', masked == idle, idle .. ' vs ' .. masked)
  finish()
end
