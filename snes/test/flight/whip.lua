-- Whip-pad crossings in the Earth Palace (map 313), as the browser specs:
--  1. whip-flight.spec.mjs: from the tile before each pad Goku flies (A held
--     while more than 16 px remain) to five tiles past the pad and back;
--     the pad's event never starts ($D0 stays 0), he lands within 14 px on
--     landable ground, on screen, with the companions within 64 px, and the
--     native crossing never ran.
--  2. ki-world.spec.mjs: walking onto the pad (10 frames right) floats the
--     whole party across without a whip: the gap-flight pose (goku mode $23)
--     shows, every member ends more than 80 px further on the same row, the
--     event ends and CF01/CF03 are clear.
local PADS = {{17, 37, -1, 0}, {13, 38, 1, 0}}
local function status() return F.status() end
local function party()
  local out = {}
  for _, b in ipairs({0x7EE200, 0x7EE400}) do
    if (H.r8(b) & 1) == 1 then out[#out + 1] = {x = H.r16(b + 2), y = H.r16(b + 4)} end
  end
  return out
end
local function walk(dest, vx, vy)
  local maxEvent, hovered, frames = 0, false, 0
  while frames < 100 do
    frames = frames + 1
    local s = status()
    local remaining = (dest.x - s.x) * vx + (dest.y - s.y) * vy
    if remaining <= 0 then break end
    local keys = {}
    if remaining > 16 then keys.a = true end
    if vx > 0 then keys.right = true elseif vx < 0 then keys.left = true elseif vy > 0 then keys.down = true else keys.up = true end
    H.input = keys
    H.wait(1)
    maxEvent = math.max(maxEvent, H.r8(0x7E00D0))
    hovered = hovered or status().fly
  end
  H.input = nil
  H.wait(12)
  return {frames = frames, maxEvent = maxEvent, hovered = hovered, s = status(), party = party()}
end
local function screen()
  local sx, sy = H.r16(0x7EE020), H.r16(0x7EE022)
  if sx >= 0x8000 then sx = sx - 0x10000 end
  if sy >= 0x8000 then sy = sy - 0x10000 end
  return sx, sy
end
local function check(name, r, dest)
  local s = r.s
  local sx, sy = screen()
  H.log(string.format('%s: %d frames, max $D0 %d, hovered %s, end %s (dest %d,%d) screen %d,%d', name, r.frames, r.maxEvent, tostring(r.hovered), F.str(s), dest.x, dest.y, sx, sy))
  F.check(r.maxEvent == 0, name .. ': the pad event never started')
  F.check(s.map == 313, name .. ': same map')
  F.check(r.frames < 100, name .. ': arrived')
  F.check(s.can, name .. ': Goku can act')
  F.check(not s.fly and s.lift == 0, name .. ': landed')
  F.check(r.hovered, name .. ': flew')
  F.check(math.sqrt((s.x - dest.x) ^ 2 + (s.y - dest.y) ^ 2) < 14, name .. ': within 14 px of the destination')
  F.check(sx > 8 and sx < 248 and sy > 8 and sy < 216, name .. ': on screen')
  for _, p in ipairs(r.party) do
    F.check(math.sqrt((p.x - s.x) ^ 2 + (p.y - s.y) ^ 2) < 64, name .. ': companion within 64 px')
  end
end
function test()
  F.import('graphics-audit__party')
  F.on()
  F.enter(313, 12, 38)
  H.save('whip-start')
  for i, pad in ipairs(PADS) do
    H.load(H_OUT .. '/whip-start.mss')
    H.wait(1)
    local x, y, dx, dy = pad[1], pad[2], pad[3], pad[4]
    local start = {x = (x - dx) * 16 + 8, y = (y - dy) * 16 + 8}
    local target = {x = (x + dx * 5) * 16 + 8, y = (y + dy * 5) * 16 + 8}
    local tile = H.r8(0x7F0000 + (start.y >> 4) * 128 + (start.x >> 4))
    H.w16(0x7EE002, start.x); H.w16(0x7EE004, start.y)
    H.w8(0x7EE00B, H.r8(0x7FB800 + tile * 4) & 3)
    F.follow(start.x, start.y)
    for n = 1, 30 do
      H.wait(10)
      local s = status()
      if s.can and not s.pend then break end
    end
    local cf = H.r8(0x7ECF01) * 256 + H.r8(0x7ECF03)
    check(string.format('pad %d,%d across', x, y), walk(target, dx, dy), target)
    check(string.format('pad %d,%d back', x, y), walk(start, -dx, -dy), start)
    F.check(H.r8(0x7ECF01) * 256 + H.r8(0x7ECF03) == cf, 'pad flags unchanged')
  end
  -- 2. walking onto the pad
  H.load(H_OUT .. '/whip-start.mss')
  H.wait(1)
  local start = status()
  local gap, seenEvent, landed = false, 0, nil
  for f = 1, 240 do
    if f <= 10 then H.input = {right = true} else H.input = nil end
    H.wait(1)
    gap = gap or H.r8(0x7ED748) == 0x23
    seenEvent = math.max(seenEvent, H.r8(0x7E00D0))
    if gap and H.r8(0x7E00D0)==0 and not landed then landed={hero=status(),party=party(),frame=f} end
  end
  H.input = nil
  H.result('landing',landed)
  local s = status()
  H.log(string.format('walked onto the pad: start %d,%d end %s, gap pose %s, event seen %d, $D0 %d, CF01 %d CF03 %d',
    start.x, start.y, F.str(s), tostring(gap), seenEvent, H.r8(0x7E00D0), H.r8(0x7ECF01), H.r8(0x7ECF03)))
  F.check(gap, 'pad: the gap-flight pose showed')
  F.check(seenEvent ~= 0 and H.r8(0x7E00D0) == 0, 'pad: the crossing event ran and ended')
  F.check(H.r8(0x7ECF01) == 0 and H.r8(0x7ECF03) == 0, 'pad: CF01/CF03 clear')
  F.check(s.x - start.x > 80 and s.y == start.y, 'pad: Goku crossed (' .. s.x - start.x .. ' px)')
  -- Check the actual landing, before companion AI resumes. At frame 240
  -- a companion can legitimately walk sideways to engage a nearby enemy.
  F.check(landed~=nil,'pad: landing observed')
  for _, p in ipairs(landed and landed.party or {}) do
    F.check(p.x - start.x > 80 and p.y == start.y, string.format('pad: companion crossed (%d,%d from %d,%d)',p.x,p.y,start.x,start.y))
  end
  for _, p in ipairs(party()) do
    F.check(math.sqrt((p.x-s.x)^2+(p.y-s.y)^2)<64,'pad: companion remains with party after landing')
  end
  F.check(H.r8(0x7ED748) ~= 0x23, 'pad: the pose ended')
  H.result('failures', F.fail)
  H.result('pass', #F.fail == 0)
end
