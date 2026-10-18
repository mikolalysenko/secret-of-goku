-- Native map loads decode BG tiles into 7E:2000-77FF (C1:C5D1-C9FF); on some
-- maps that reaches the core's WRAM block (map 153 wrote $C828 at 7E:6E8E,
-- which the old layout read as a pending event request). Core state that must
-- survive a load lives in battery RAM: scribbling over 7E:6E40-6F3F (the test
-- mailbox at 6F40 is spared) must not start an event, drop a claim or stop
-- the frame loop.
function test()
  H.wait(4)
  local c1 = command(6, { [0x1E] = 2 })
  check('claimed', c1 == 0, c1)
  local last = H.r16(CORE + 0x3C)
  for a = 0x7E6E40, 0x7E6F3F do H.w8(a, ((a * 37) & 0x7F) | 0x80) end
  H.w16(0x7E6E8E, 0xC828)
  local f0 = H.r16(CORE)
  H.wait(40)
  check('no_spurious_event', H.r16(CORE + 0x3C) == last and H.r16(CORE_SAFE + 0x10) == 0,
    string.format('last %04X req %04X', H.r16(CORE + 0x3C), H.r16(CORE_SAFE + 0x10)))
  check('claim_kept', H.r16(CORE_SAFE + 0x40 + 2 * 2) == 0x0042, string.format('%04X', H.r16(CORE_SAFE + 0x44)))
  check('reclaim_same_owner', command(6, { [0x1E] = 2 }) == 0, 'refused')
  check('frames_run', H.r16(CORE) - f0 >= 35, H.r16(CORE) - f0)
  check('field_idle', idleField(), nmi())
  finish()
end
