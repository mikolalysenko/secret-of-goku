-- Floor holes (the !FLIGHT_MISSING_FLOOR contract Frieza's broken deck and
-- the Sandship wreck will use; FLIGHT_TEST provides a hole rectangle):
-- walking stops before a hole (native-local-flight.js's D651 supported()
-- check), flight crosses it, Goku released over it keeps hovering (canLand
-- is false there), and with the hole gone he walks on.
local HOLE = 0x337A96
local function hole(on, x0, x1, y0, y1)
  H.w16(HOLE + 2, x0 or 0); H.w16(HOLE + 4, x1 or 0); H.w16(HOLE + 6, y0 or 0); H.w16(HOLE + 8, y1 or 0)
  H.w16(HOLE, on and 1 or 0)
end
function test()
  F.import('graphics-audit__party')
  F.on()
  F.enter(131, 18, 22)
  F.clearActors()
  H.wait(10)
  local s0 = F.status()
  -- a hole two tiles west of Goku, on open ground
  local hx1 = s0.x - 28
  local hx0 = hx1 - 40
  hole(true, hx0, hx1, s0.y - 30, s0.y + 30)
  H.hold('left', 40)
  H.wait(5)
  local walked = F.status()
  H.hold('a left', 6)
  local over = F.status()
  H.wait(30)
  local hover = F.status()
  H.log(string.format('start %d,%d; hole x %d-%d; walked to %d; flew to %d (fly %s); after release %s',
    s0.x, s0.y, hx0, hx1, walked.x, over.x, tostring(over.fly), F.str(hover)))
  F.check(walked.x < s0.x, 'walked towards the hole')
  F.check(walked.x - 6 > hx1, 'walking stopped before the hole (x ' .. walked.x .. ')')
  F.check(over.x - 6 <= hx1 and over.fly, 'flight crosses over the hole')
  local inside = hover.x + 6 >= hx0 and hover.x - 6 <= hx1
  F.check(inside, 'released over the hole (x ' .. hover.x .. ')')
  F.check(hover.fly, 'released over the hole: still hovering')
  -- the hole closes: Goku lands where he hovers and walks on
  hole(false)
  H.wait(40)
  local landed = F.status()
  H.hold('left', 20)
  H.wait(5)
  local left = F.status()
  H.log('after the hole closed: ' .. F.str(landed) .. '; walked to ' .. left.x)
  F.check(not landed.fly and landed.lift == 0, 'landed once the hole is gone')
  F.check(left.x < landed.x - 10, 'walks on without the hole')
  H.result('failures', F.fail)
  H.result('pass', #F.fail == 0)
end
