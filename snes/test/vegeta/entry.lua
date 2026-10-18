-- Joch's trial from the door: the native Doppelganger slot becomes Vegeta,
-- the walk-on event (3DB) introduces the trial, the entrance settles under
-- black, the reveal ramps the brightness, the dialogue runs, the battle starts.
local function snap(tag)
  local st = {
    tag = tag, frame = H.frame, map = V.map(),
    on = H.r8(0x7EDBC0), phase = H.r8(0x7EDBC1), flags = H.r8(0x7EDBC2), mask = H.r8(0x7EDBC3),
    tier = H.r8(0x7EDBC4), facing = H.r8(0x7EDBC5), hp = H.r16(0x7EDBC6),
    x = H.r16(0x7EDBC8), y = H.r16(0x7EDBCA), act = H.r8(0x7EDBE0), clock = H.r16(0x7EDBD0),
    hero = {V.hero()}, cam = {V.camera()}, e6 = H.r8(0x7E00E6), d0 = H.r8(0x7E00D0),
    e600 = H.r8(0x7EE600), front = H.r8(0x7EDBF0), back = H.r8(0x7EDBF1),
  }
  return st
end
function test()
  H.wait(5)
  H.importSnesJs(V.IMPORT .. '/graphics-audit__party')
  H.wait(20)
  V.gokuActive(true)
  H.w8(0x7ECF3F, 4)
  V.door(0x304)
  local trace = {}
  local revealed = nil
  for i = 1, 700 do
    H.wait(1)
    local s = snap('f')
    if i % 10 == 0 then trace[#trace + 1] = s end
    if revealed == nil and (s.flags & 0x04) ~= 0 then revealed = H.frame; H.log('revealed at', H.frame) end
    if i == 200 or i == 260 or i == 320 or i == 400 then H.shot(string.format('entry-%03d', i)) end
  end
  H.result('trace', trace)
  -- Advance the dialogue; the battle starts afterwards.
  V.finishEvent(2400)
  H.wait(10)
  H.result('after_dialogue', snap('dialogue'))
  H.shot('battle-0')
  for i = 1, 6 do
    H.wait(30)
    H.shot(string.format('battle-%d', i))
    H.result('battle_' .. i, snap('b'))
  end
end
