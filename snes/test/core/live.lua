-- Power-on validation of the live block: battery RAM without the 'GK' magic
-- (a new cartridge) is cleared to the legacy state at reset; a block with
-- the magic (the previous session's) is kept.
local MAGIC = LIVE + 0x3E
local function fill(v)
  for i = 0, 0x3FF do emu.write(0x2000 + i, v, emu.memType.snesSaveRam) end
end
local function live(off) return emu.read(0x2000 + off, emu.memType.snesSaveRam) end
function test()
  H.wait(30)
  -- Noise everywhere, no magic.
  fill(0xA5)
  emu.write(0x2000 + 0x3E, 0x12, emu.memType.snesSaveRam)
  check('reset_noise', resetConsole(), 'no reset')
  H.wait(60)
  local nonzero = 0
  for i = 0, 0x3FF do if i ~= 0x3E and i ~= 0x3F and live(i) ~= 0 then nonzero = nonzero + 1 end end
  check('noise_cleared', nonzero == 0, nonzero .. ' bytes left')
  check('noise_magic', H.r16(MAGIC) == 0x4B47, string.format('%04X', H.r16(MAGIC)))
  check('noise_version0', H.r8(LIVE) == 0, H.r8(LIVE))
  -- A valid block survives a reset untouched.
  H.w8(LIVE + 0x02, 0x01); H.w8(LIVE + 0x300, 0x77); H.w16(LIVE + 0x100, 0xBEEF)
  check('reset_valid', resetConsole(), 'no reset')
  H.wait(60)
  check('valid_kept', H.r8(LIVE + 0x02) == 1 and H.r8(LIVE + 0x300) == 0x77 and H.r16(LIVE + 0x100) == 0xBEEF,
    string.format('%02X %02X %04X', H.r8(LIVE + 0x02), H.r8(LIVE + 0x300), H.r16(LIVE + 0x100)))
  finish()
end
