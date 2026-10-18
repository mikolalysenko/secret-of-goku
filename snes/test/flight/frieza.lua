-- Instant Transmission to Frieza (index 12) through combat's virtual
-- targets (combat_api_vtarget): the battle preset with the browser's Frieza
-- state written (FRIEZA_WRITES and FRIEZA_MUSIC from run.mjs, as
-- snes/test/frieza does), then L+B. The WRAM at the press goes to wram.bin,
-- so run.mjs can ask the browser's findLanding() (custom 'frieza': a hover
-- may end it) whether the press should start a teleport, and where to.
-- Off map 246 the same press must not pick index 12.
local TARGET, E, L = F.TP + 0x04, F.TP + 0x20, F.TP + 0x56
local function press()
  local ran, tg = false, -1
  for i = 1, 2 do
    H.hold('l b', 1)
    if H.r16(F.TP) ~= 0 then ran = true; tg = H.r16(TARGET) end
  end
  return ran, tg
end
local function apply(writes)
  for _, w in ipairs(writes) do
    if w[3] == 2 then H.w16(w[1], w[2]) else H.w8(w[1], w[2]) end
  end
end
function test()
  F.import('preset__battle')
  F.on()
  apply(FRIEZA_WRITES)
  H.w8(FRIEZA_MUSIC[1], FRIEZA_MUSIC[2])
  local ready = H.waitFor(function() return H.r16(0x7E00DC) == 246 and H.r8(0x7E00D0) == 0 and F.status().can end, 120)
  F.check(ready, 'Goku can act in the arena (map ' .. H.r16(0x7E00DC) .. ')')
  if not ready then H.result('failures', F.fail); H.result('pass', false); return end
  H.wait(4)
  local gx, gy = H.r16(0x7EE002), H.r16(0x7EE004)
  H.dumpfile('wram.bin', emu.memType.snesWorkRam, 0, 0x20000)
  H.shot('before')
  local ran, tg = press()
  -- the target as flight saw it at the press (fl_tp_entity's fields) and
  -- the landing it found
  local ex, ey, et, es, ea = H.r16(E), H.r16(E + 2), H.r16(E + 4), H.r16(E + 6), H.r16(E + 8)
  local lx, ly = H.r16(L), H.r16(L + 2)
  for i = 1, 60 do
    if H.r16(F.TP) == 0 then break end
    H.wait(1)
  end
  local s = F.status()
  H.shot('after')
  H.log(string.format('Goku %d,%d -> %s; target %d species %d at %d,%d t %02x air %d; landing %d,%d; teleport %s',
    gx, gy, F.str(s), tg, es, ex, ey, et, ea, lx, ly, tostring(ran)))
  H.result('press', {gx = gx, gy = gy, ex = ex, ey = ey, et = et, es = es, ea = ea, lx = lx, ly = ly,
    ran = ran, tg = tg, x = s.x, y = s.y, last = s.tg})
  -- off map 246: index 12 is no target (frieza_virtual_target leaves at once)
  F.import('barrier-audit__potos-probe')
  F.on()
  H.waitFor(function() return H.r8(0x7E00D0) == 0 and F.status().can end, 120)
  local ran2, tg2 = press()
  H.wait(20)
  F.check(tg2 ~= 12 and F.status().tg ~= 12, 'off map 246 (map ' .. H.r16(0x7E00DC) .. ') L+B does not pick Frieza (target ' .. tg2 .. ')')
  H.result('off', {map = H.r16(0x7E00DC), ran = ran2, tg = tg2})
  H.result('failures', F.fail)
  H.result('pass', #F.fail == 0)
end
