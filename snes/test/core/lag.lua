-- Lag frames: a module callback that overruns the frame. The game and core
-- must keep running: vblank work only for completed frames, sprites and
-- uploads still correct, input still reaches the hero.
local PATTERN = { 0xAA, 0x00, 0x55, 0xFF }
function test()
  H.wait(4)
  setct(0x0A, 100); setct(0x0C, 80); setct(0x0E, 0x31C0); setct(0x10, 0); setct(0x08, 1)
  H.wait(3)
  local f0, n0 = H.r16(CORE), ct(0x2A)
  setct(0x40, 12000)
  H.wait(120)
  local f1, n1 = H.r16(CORE), ct(0x2A)
  H.result('field_frames_per_120_lagging', f1 - f0)
  check('lagging', f1 - f0 < 100 and f1 - f0 >= 20, f1 - f0)
  check('vblank_only_completed', n1 - n0 <= f1 - f0 + 1 and n1 - n0 >= f1 - f0 - 1, (n1 - n0) .. ' vs ' .. (f1 - f0))
  check('sprite_kept', findOam(100, 80, 0x31C0) ~= nil, 'missing')
  local r = command(3, { [0x20] = 0x7FC0, [0x22] = 0x40 })
  H.wait(8)
  local ok = r == 0
  for i = 0, 0x3F do
    local want = (i % 32) < 16 and PATTERN[(i % 4) + 1] or 0
    if H.vram(0xFF80 + i) ~= want then ok = false end
  end
  check('upload_while_lagging', ok, r)
  local x = heroX()
  H.hold('left', 40)
  H.wait(10)
  check('moves_while_lagging', heroX() < x, heroX() - x)
  setct(0x40, 0)
  H.wait(30)
  local f2 = H.r16(CORE)
  H.wait(60)
  check('recovers_full_rate', H.r16(CORE) - f2 >= 58, H.r16(CORE) - f2)
  H.shot('lag')
  finish()
end
