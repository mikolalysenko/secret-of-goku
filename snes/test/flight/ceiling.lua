-- Ceiling escape (indoor-flight.spec.mjs): in the Water Palace, Potos
-- houses, Gaia's Navel, the Matango inn and a Gold City house (entered
-- through their real doors, no flags patched) L+R punches through the roof:
-- the escape starts, Goku shows the ceiling pose, the room's exterior loads
-- and world flight starts from there with the whole party; Goku never shows
-- on the exterior's ground (pose age 80 = above the roof) and the escape
-- completes. Without the world module in the build (WORLD = false) the
-- native $0C00 request (the Drum's path with Flammie's summon) takes off
-- instead; where the summon cannot finish (the Water Palace exterior) the
-- escape must still reach its takeoff phase on the exterior map.
local ROOMS = {{9, 137, 136}, {151, 139, 136}, {88, 257, 131}, {92, 259, 131}, {250, 293, 25}, {596, 282, 224}, {650, 125, 113}}
local function world()
  local sig = {0x5C, 0xCF, 0x88, 0x00, 0x5C, 0x4B, 0x8A, 0x00}
  for i = 1, 8 do if H.r8(0x7E0100 + i - 1) ~= sig[i] then return false end end
  return true
end
local function phase() return H.r16(F.CE) end
-- ceiling-escape.test.mjs: a live boss (species 87-127) keeps the lock, a
-- dying one does not.
local function bossLock()
  F.door(88)
  for i = 1, 20 do
    if F.status().can then break end
    H.hold('b', 2)
    H.wait(120)
  end
  local slot = 0x7EE600
  H.w8(slot, H.r8(slot) | 1); H.w8(slot + 0x180, 100); H.w16(slot + 0x182, 1000); H.w8(slot + 0x191, H.r8(slot + 0x191) & 0x7F)
  H.wait(2)
  H.hold('l r', 1)
  H.wait(2)
  local locked = phase() == 0
  H.w8(slot + 0x191, H.r8(slot + 0x191) | 0x80)
  H.wait(2)
  H.hold('l r', 1)
  H.wait(2)
  local freed = phase() == 1
  H.log(string.format('boss lock: live boss keeps the lock %s, dying boss frees it %s', tostring(locked), tostring(freed)))
  F.check(locked, 'a live boss keeps the roof locked')
  F.check(freed, 'a dying boss does not')
end
function test()
  F.import('graphics-audit__party')
  F.on()
  H.wait(1)
  H.save('ceiling-start')
  bossLock()
  for _, room in ipairs(ROOMS) do
    local door, inside, outside = room[1], room[2], room[3]
    H.load(H_OUT .. '/ceiling-start.mss')
    H.wait(1)
    F.door(door)
    for i = 1, 20 do
      if F.status().can then break end
      H.hold('b', 2)
      H.wait(120)
    end
    local s = F.status()
    local name = string.format('door %d (map %d)', door, inside)
    F.check(s.map == inside and s.can, name .. ': entered and controllable (' .. F.str(s) .. ')')
    H.hold('l r', 1)
    H.wait(1)
    local started = phase() == 1
    H.wait(27)
    local pose = H.r8(0x7ED748) == 0x25
    local flashes, frames, maxPhase = 0, 0, 0
    while frames < 1200 and not world() do
      H.wait(1)
      frames = frames + 1
      local p = phase()
      if p > maxPhase then maxPhase = p end
      -- after the punch Goku stays above the roof on every field frame
      if p >= 2 and H.r8(0x7ED748) == 0x25 and H.r16(0x7ED74A) ~= 80 then flashes = flashes + 1 end
      if p >= 2 and H.r8(0x7ED748) ~= 0x25 and not world() then flashes = flashes + 1 end
    end
    local inWorld = world()
    H.wait(100)
    local party = {}
    for _, b in ipairs({0x7EE000, 0x7EE200, 0x7EE400}) do party[#party + 1] = (H.r8(b) & 1) == 1 end
    H.log(string.format('%s: started %s, pose %s, phases up to %d, world flight after %d frames (%s), map %d, escape phase %d, flashes %d, party %s %s %s',
      name, tostring(started), tostring(pose), maxPhase, frames, tostring(inWorld), H.r16(0x7E00DC), phase(), flashes,
      tostring(party[1]), tostring(party[2]), tostring(party[3])))
    F.check(started, name .. ': L+R started the escape')
    F.check(pose, name .. ': ceiling pose')
    F.check(maxPhase >= 3, name .. ': through the exterior')
    F.check(H.r16(0x7E00DC) == outside, name .. ': exterior map ' .. outside .. ' (got ' .. H.r16(0x7E00DC) .. ')')
    if WORLD or outside ~= 136 then
      F.check(inWorld, name .. ': world flight')
      F.check(phase() == 0, name .. ': escape completed')
    end
    F.check(flashes == 0, name .. ': Goku never back on the ground (' .. flashes .. ')')
    F.check(party[1] and party[2] and party[3], name .. ': whole party')
  end
  H.result('failures', F.fail)
  H.result('pass', #F.fail == 0)
end
