-- HDMAEN guard (core_hdmaen_write): a channel switched on in a vblank that
-- ran into the next frame's display would run from stale table pointers, so
-- the core keeps only channels running at the frame start; on time, it is
-- written as is. The native NMI's STZ $420C (C0:C0BF) stops every channel,
-- so in a late vblank even one that ran last frame stays off.
local HDMAEN = CORE_SAFE + 0x16
local function on7() return (H.r8(HDMAEN) & 0x80) ~= 0 end
function test()
  H.wait(4)
  setct(0x4C, 0x80); setct(0x4E, 0)
  H.wait(4)
  check('on_time_enables', on7(), string.format('%02X', H.r8(HDMAEN)))
  setct(0x4C, 0); setct(0x4E, 0x80)
  H.wait(4)
  check('cleared', not on7(), string.format('%02X', H.r8(HDMAEN)))
  -- Overrun every vblank by ~150 lines, then ask for channel 7.
  setct(0x4A, 6000)
  H.wait(4)
  setct(0x4E, 0); setct(0x4C, 0x80)
  local late, n0 = 0, ct(0x2A)
  for _ = 1, 30 do
    H.wait(1)
    if on7() then late = late + 1 end
  end
  check('late_not_enabled', late == 0, late .. ' frames enabled late')
  check('vblanks_ran_late', ct(0x2A) - n0 >= 5, (ct(0x2A) - n0) .. ' field vblanks')
  -- Back on time: the channel starts with the next vblank.
  setct(0x4A, 0)
  H.wait(6)
  check('on_time_again', on7(), string.format('%02X', H.r8(HDMAEN)))
  -- Already on, then every vblank runs late: the native STZ stopped it before
  -- the frame start, so it is not switched back on mid-frame.
  setct(0x4A, 6000)
  H.wait(4)
  local kept, n1 = 0, ct(0x2A)
  for _ = 1, 30 do
    H.wait(1)
    if on7() then kept = kept + 1 end
  end
  check('late_running_off', kept == 0, kept .. ' late frames kept it on')
  check('vblanks_ran_late_again', ct(0x2A) - n1 >= 5, (ct(0x2A) - n1) .. ' field vblanks')
  setct(0x4A, 0)
  H.wait(6)
  check('on_after_overrun', on7(), string.format('%02X', H.r8(HDMAEN)))
  setct(0x4C, 0); setct(0x4E, 0x80)
  H.wait(4)
  setct(0x4E, 0)
  finish()
end
