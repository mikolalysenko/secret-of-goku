-- Instant Transmission (teleport.spec.mjs) on the rabite river field
-- (animation-audit/native/rabite-field-b, imported, no warp):
--  1. riverbank: Goku at (312,248) on the low bank, a Rabite at (352,248) on
--     the high one; L+B lands him on the Rabite's far side at its height,
--     on clear ground, close enough to punch.
--  2. offscreen target (slot 5 after clearing 3 and 4): the camera streams
--     there in 15 px steps while the action holds its absent frame (age 4),
--     Goku lands on screen, walks afterwards and the ring still opens; the
--     'teleport' cue sounds at the press and 'teleportIn' once, at age 6.
-- SFX = address of fl_bind_sfx (cue log).
local cues = {}
local function onSfx()
  local a = emu.getState()['cpu.a'] & 0xFF
  cues[#cues + 1] = {id = a, age = H.r16(F.TP + 2), act = H.r16(F.TP)}
end
local function screen(slot)
  local b = 0x7EE000 + slot * 0x200
  local sx, sy = H.r16(b + 0x20), H.r16(b + 0x22)
  if sx >= 0x8000 then sx = sx - 0x10000 end
  if sy >= 0x8000 then sy = sy - 0x10000 end
  return sx, sy
end
local function riverbank()
  H.w16(0x7EE002, 312); H.w16(0x7EE004, 248); H.w8(0x7EE00B, 1)
  H.w16(0x7EE602, 352); H.w16(0x7EE604, 248); H.w8(0x7EE60B, 2)
  H.w8(0x7EE800, 0); H.w8(0x7EEA00, 0)
  F.restore()
  H.hold('l b', 4)
  -- until the action ends (lag frames stretch it)
  for i = 1, 60 do
    if H.r16(F.TP) == 0 then break end
    H.wait(1)
  end
  local s = F.status()
  local tx, ty = H.r16(0x7EE602), H.r16(0x7EE604)
  H.log('bank: landed ' .. F.str(s) .. string.format(' target %d,%d t %02x', tx, ty, H.r8(0x7EE60B)))
  F.check(s.tg == 3, 'bank: targeted slot 3 (got ' .. s.tg .. ')')
  F.check(s.x > tx, 'bank: landed on the far side of the Rabite: x ' .. s.x .. ' vs ' .. tx)
  F.check(math.sqrt((s.x - tx) ^ 2 + (s.y - ty) ^ 2) < 40, 'bank: within punching reach')
  F.check(s.terrain == H.r8(0x7EE60B), 'bank: copied the target terrain height')
end
local function offscreen()
  H.w8(0x7EE600, 0); H.w8(0x7EE800, 0)
  local sx0 = screen(5)
  local id = emu.addMemoryCallback(onSfx, emu.callbackType.exec, SFX, SFX)
  local held, absent, scrolls, lastcx = 0, 0, 0, nil
  for i = 1, 80 do
    H.hold('l b', 1)
    local st = F.status()
    if st.pend then
      held = held + 1
      if st.act and st.age == 4 then absent = absent + 1 end
      if lastcx and st.cx ~= lastcx then scrolls = scrolls + 1 end
    end
    lastcx = st.cx
  end
  local landed = F.status()
  local lsx, lsy = screen(0)
  H.shot('landed')
  H.wait(1)
  H.hold('down', 6)
  H.wait(2)
  local walked = F.status()
  H.hold('x', 2)
  H.wait(90)
  local ring = H.r8(0x7E00EC)
  H.shot('ring')
  emu.removeMemoryCallback(id, emu.callbackType.exec, SFX, SFX)
  H.log(string.format('offscreen: target screen x %d; pending %d frames (%d absent, %d camera moves); landed %s on screen %d,%d; walked to %d,%d; ring $EC=%02x',
    sx0, held, absent, scrolls, F.str(landed), lsx, lsy, walked.x, walked.y, ring))
  local seq = {}
  for _, c in ipairs(cues) do seq[#seq + 1] = string.format('%d@%d', c.id, c.age) end
  H.log('cues (id@age): ' .. table.concat(seq, ' '))
  F.check(sx0 < 0, 'offscreen: the target starts left of the screen (' .. sx0 .. ')')
  F.check(landed.tg == 5, 'offscreen: targeted slot 5 (got ' .. landed.tg .. ')')
  F.check(scrolls > 4, 'offscreen: the camera streamed in steps (' .. scrolls .. ')')
  F.check(held == absent, 'offscreen: absent (age 4) for the whole camera follow')
  F.check(not landed.pend, 'offscreen: the camera arrived')
  F.check(lsx > 48 and lsx < 208 and lsy > 40 and lsy < 192, 'offscreen: Goku on screen at ' .. lsx .. ',' .. lsy)
  F.check(math.sqrt((walked.x - landed.x) ^ 2 + (walked.y - landed.y) ^ 2) > 3, 'offscreen: walking works afterwards')
  F.check((ring & 0xFE) ~= 0, 'offscreen: the ring opens afterwards')
  local tp, tin = 0, 0
  for _, c in ipairs(cues) do
    if c.id == 16 then tp = tp + 1 end
    if c.id == 17 then tin = tin + 1; F.check(c.age == 6, 'teleportIn at age 6 (got ' .. c.age .. ')') end
  end
  F.check(tp == 1 and tin == 1, 'one teleport and one teleportIn cue (' .. tp .. ', ' .. tin .. ')')
end
function test()
  F.import('animation-audit__native__rabite-field-b')
  F.on()
  H.wait(1)
  H.save('teleport-start')
  riverbank()
  H.load(H_OUT .. '/teleport-start.mss')
  H.wait(1)
  offscreen()
  H.result('failures', F.fail)
  H.result('pass', #F.fail == 0)
end
