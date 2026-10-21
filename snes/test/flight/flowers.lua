-- Potos flower bed beside a tree ("flew over the flowers in Potos and got
-- stuck in a tree"). The pink bed east of the inn (tiles 35-37 x 24-27) has
-- a tree's base (tile 38,26, code $17) on its east side. Two approaches, each
-- from a door warp: A+right along row 26 from tile 32,26, and A+down-right
-- across the bed from tile 34,23 followed by right into the tree. Every frame
-- goes to path; run.mjs checks each airborne one against the browser's
-- canFly/canLand on the WRAM dumped here (wram.bin): an airborne Goku is
-- always over ground he can fly over or land on. From where he ends, some
-- direction moves him, and flying left off the bed he lands. Last, Goku
-- hovering over the bed is put where the old blocked steps left him
-- (604,424: centre over the flowers, footprint in the tree base) and has to
-- return to his last landing (settle()'s embedded check).
local function dist(a, b) return math.abs(a.x - b.x) + math.abs(a.y - b.y) end
local CASES = {
  {name = 'right along row 26', tx = 32, ty = 26, steps = {{{a = true, right = true}, 30}, {nil, 20}}},
  {name = 'down-right across, then right', tx = 34, ty = 23,
    steps = {{{a = true, down = true, right = true}, 24}, {{right = true}, 60}, {nil, 10}}},
}
function test()
  F.import('graphics-audit__party')
  F.on()
  local path = {}
  for k, c in ipairs(CASES) do
    F.enter(131, c.tx, c.ty)
    F.clearActors()
    H.wait(4)
    local start = F.status()
    F.check(start.map == 131 and not start.fly, c.name .. ': starts on foot in Potos: ' .. F.str(start))
    for _, step in ipairs(c.steps) do
      H.input = step[1]
      for _ = 1, step[2] do
        H.wait(1)
        local s = F.status()
        path[#path + 1] = {case = k, x = s.x, y = s.y, fly = s.fly, lift = s.lift, t = s.terrain, map = s.map}
      end
    end
    H.input = nil
    local s1 = F.status()
    H.shot('end-' .. k)
    if k == 1 then H.dumpfile('wram.bin', emu.memType.snesWorkRam, 0, 0x20000) end
    F.check(s1.map == 131 and s1.fly, c.name .. ': hovering over the bed in Potos: ' .. F.str(s1))
    -- some direction moves him (each from the same state)
    H.save('end')
    local moved, free = {}, false
    for _, d in ipairs({'up', 'down', 'left', 'right'}) do
      H.load(H_OUT .. '/end.mss')
      H.hold(d, 16)
      H.wait(2)
      local s = F.status()
      moved[#moved + 1] = string.format('%s %+d,%+d', d, s.x - s1.x, s.y - s1.y)
      if dist(s, s1) >= 4 then free = true end
    end
    F.check(free, c.name .. ': a direction moves Goku from ' .. F.str(s1) .. ' (' .. table.concat(moved, ', ') .. ')')
    -- flying left off the bed he reaches the grass and lands
    H.load(H_OUT .. '/end.mss')
    H.hold('left', 40)
    H.wait(30)
    local landed = F.status()
    F.check(not landed.fly and landed.lift == 0 and dist(landed, s1) >= 16, c.name .. ': left off the bed Goku lands: ' .. F.str(landed))
    -- embedded beside the bed: back to the last landing
    H.load(H_OUT .. '/end.mss')
    local recovered = false
    H.w16(0x7EE002, 604)
    H.w16(0x7EE004, 424)
    for _ = 1, 6 do
      H.wait(1)
      local s = F.status()
      if s.x ~= 604 or s.y ~= 424 then recovered = true break end
    end
    local after = F.status()
    F.check(recovered, c.name .. ': Goku embedded at 604,424 returns to a landing: ' .. F.str(after))
    H.wait(30)
    local settled = F.status()
    F.check(not settled.fly and settled.lift == 0, c.name .. ': after the recovery he stands: ' .. F.str(settled))
    H.log(c.name .. ':', 'from', F.str(start), 'to', F.str(s1), '|', table.concat(moved, ', '))
    H.log('   left off the bed:', F.str(landed), '| embedded at 604,424 ->', F.str(after), 'then', F.str(settled))
  end
  H.result('path', path)
  H.result('failures', F.fail)
  H.result('pass', #F.fail == 0)
end
