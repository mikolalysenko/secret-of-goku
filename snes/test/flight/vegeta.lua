-- Instant Transmission to Vegeta in the Time Chamber (map 72), live: the
-- vegeta module's vb_flight_target posts !fl_tp_custom (kind 3, species 46,
-- his position and terrain) every field frame after flight's frame. Run by
-- run.mjs only on builds with the vegeta module. The trial is entered as
-- snes/test/vegeta/fight.lua does (Goku active, CF3F = 4, door 304, the
-- dialogue advanced until the battle runs). The WRAM at the press goes to
-- wram.bin, so run.mjs can ask the browser's findLanding() whether the
-- press should start a teleport, and where it should land.
local CUSTOM = F.TP + 0x18
local function posted()
  return H.r8(CUSTOM) == 3 and H.r8(CUSTOM + 1) == 46
end
function test()
  F.import('graphics-audit__party')
  H.wait(20)
  F.on()
  H.w8(0x7ECF3F, 4)
  H.w16(0x7E6E8E, 0x8000 | 0x0800 | 0x304)
  F.check(H.waitFor(function() return H.r16(0x7E00DC) == 72 end, 900), 'entered the Time Chamber (map ' .. H.r16(0x7E00DC) .. ')')
  -- advance the trial's dialogue until Goku can act and Vegeta is posted
  local ready = false
  for i = 1, 900 do
    if H.r8(0x7E00D0) == 0 and posted() and F.status().can then ready = true break end
    if H.r8(0x7E00D0) ~= 0 then H.tap('a', 2, 6) else H.wait(1) end
  end
  F.check(ready, 'Vegeta is posted as a teleport target while Goku can act')
  if not ready then H.result('failures', F.fail); H.result('pass', false); return end
  H.wait(10)
  local gx, gy = H.r16(0x7EE002), H.r16(0x7EE004)
  local vx, vy, vt = H.r16(CUSTOM + 2), H.r16(CUSTOM + 4), H.r8(CUSTOM + 6)
  H.dumpfile('wram.bin', emu.memType.snesWorkRam, 0, 0x20000)
  H.shot('before')
  local ran = false
  for i = 1, 2 do
    H.hold('l b', 1)
    if H.r16(F.TP) ~= 0 then ran = true end
  end
  local ax, ay = vx, vy
  for i = 1, 60 do
    if H.r16(F.TP) == 0 then break end
    ran = true
    if H.r16(F.TP + 2) <= 4 and posted() then ax, ay = H.r16(CUSTOM + 2), H.r16(CUSTOM + 4) end
    H.wait(1)
  end
  local s = F.status()
  H.shot('after')
  H.log(string.format('Goku %d,%d t %02x -> %s; Vegeta posted at %d,%d t %02x (%d,%d at the arrival); teleport %s, target slot %d',
    gx, gy, H.r8(0x7EE00B), F.str(s), vx, vy, vt, ax, ay, tostring(ran), s.tg))
  H.result('press', {gx = gx, gy = gy, vx = vx, vy = vy, vt = vt, ran = ran, x = s.x, y = s.y, tg = s.tg, ax = ax, ay = ay})
  H.result('failures', F.fail)
  H.result('pass', #F.fail == 0)
end
