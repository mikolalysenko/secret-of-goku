-- Services scene modules use (FLIGHT_TEST build; testmod.asm posts after
-- flight's frame, as a scene module later in the field frame does):
--  1. a custom Instant Transmission target (!fl_tp_custom, as vegeta's
--     vb_flight_target posts Vegeta and frieza will post Frieza): L+B picks
--     it, Goku lands where findLanding (command 4) says, facing it; a post
--     that stops before the arrival leaves Goku where he was; an airborne
--     target over open ground leaves him hovering when no spot is landable.
--  2. a scene's camera target (flight_api_camera, frieza-intro.js
--     installAltarCamera): the camera origin ($A8/$AA) moves exactly one
--     pixel per axis per frame toward it while Goku stands, holds it, and
--     the native camera takes over again when the posts stop.
local POST = 0x337B40
local function postTarget(kind, species, x, y, terrain, air, frames)
  H.w8(POST + 8, kind); H.w8(POST + 9, species); H.w16(POST + 10, x); H.w16(POST + 12, y)
  H.w8(POST + 14, terrain); H.w8(POST + 15, air); H.w16(POST + 6, frames)
end
local function postCamera(x, y, frames)
  H.w16(POST + 2, x); H.w16(POST + 4, y); H.w16(POST, frames)
end
local function camera() return H.r16(0x7E00A8), H.r16(0x7E00AA) end
-- findLanding for a custom target from Goku's position (command 4)
local function landingFor(x, y, terrain, air)
  local b = F.MAIL + 0x10
  H.w16(b, x); H.w16(b + 2, y); H.w16(b + 4, H.r16(0x7EE002)); H.w16(b + 6, H.r16(0x7EE004))
  H.w8(b + 8, terrain); H.w8(b + 9, air)
  local done = H.r16(F.MAIL + 6)
  H.w16(F.MAIL + 2, 1)
  H.w16(F.MAIL, 4)
  assert(H.waitFor(function() return H.r16(F.MAIL + 6) ~= done end, 60), 'landing query timed out')
  local f = H.r8(b + 15)
  if (f & 1) == 0 then return nil end
  return {x = H.r16(b + 10), y = H.r16(b + 12), t = H.r8(b + 14), facing = (f >> 1) & 3, hover = (f & 8) == 8}
end
local function waitAction()
  for i = 1, 60 do
    if H.r16(F.TP) == 0 then return end
    H.wait(1)
  end
end
local function custom(tag, kind, species, dx, dy, air, postFrames)
  local gx, gy, gt = H.r16(0x7EE002), H.r16(0x7EE004), H.r8(0x7EE00B)
  local tx, ty = gx + dx, gy + dy
  local want = landingFor(tx, ty, gt, air)
  postTarget(kind, species, tx, ty, gt, air, postFrames or 200)
  H.wait(2)
  local ran = false
  for i = 1, 2 do
    H.hold('l b', 1)
    if H.r16(F.TP) ~= 0 then ran = true end
  end
  for i = 1, 60 do
    if H.r16(F.TP) == 0 then break end
    ran = true
    H.wait(1)
  end
  local s = F.status()
  s.ran = ran
  local slot = (kind == 2) and 12 or 3
  H.log(string.format('%s: target %d,%d (kind %d) from %d,%d; findLanding %s; landed %s, target slot %d',
    tag, tx, ty, kind, gx, gy, want and string.format('%d,%d t %02x facing %d hover %s', want.x, want.y, want.t, want.facing, tostring(want.hover)) or 'none',
    F.str(s), s.tg))
  return s, want, gx, gy, slot
end
local function teleports()
  F.import('animation-audit__native__rabite-field-b')
  F.on()
  H.wait(1)
  F.clearActors()
  F.restore()
  H.wait(2)
  H.save('scene-start')
  -- Vegeta (kind 3, species 46, in place of slot 3)
  local s, want, gx, gy, slot = custom('vegeta', 3, 46, 70, 0, 0)
  F.check(s.tg == slot, 'vegeta: targeted slot 3 (got ' .. s.tg .. ')')
  F.check(want ~= nil, 'vegeta: findLanding found a spot')
  if want then
    F.check(s.x == want.x and s.y == want.y, string.format('vegeta: landed at findLanding %d,%d (got %d,%d)', want.x, want.y, s.x, s.y))
    F.check(s.terrain == want.t, 'vegeta: terrain from the landing')
    F.check(H.r8(0x7EE010) & 3 == want.facing, 'vegeta: facing the target')
  end
  -- a post that stops right after the press: the arrival finds no target
  H.load(H_OUT .. '/scene-start.mss')
  H.wait(1)
  local s2, _, gx2, gy2 = custom('gone', 3, 46, 70, 0, 0, 3)
  F.check(s2.ran, 'gone: the action started')
  F.check(s2.x == gx2 and s2.y == gy2, string.format('gone: Goku stayed at %d,%d (got %d,%d)', gx2, gy2, s2.x, s2.y))
  -- Frieza (kind 2, species 121, slot 12), airborne
  H.load(H_OUT .. '/scene-start.mss')
  H.wait(1)
  local s3, want3, _, _, slot3 = custom('frieza', 2, 121, -60, 40, 1)
  if want3 then
    F.check(s3.tg == slot3, 'frieza: targeted slot 12 (got ' .. s3.tg .. ')')
    F.check(s3.x == want3.x and s3.y == want3.y, string.format('frieza: landed at findLanding %d,%d (got %d,%d)', want3.x, want3.y, s3.x, s3.y))
    F.check(s3.fly == want3.hover, 'frieza: hovering as findLanding says (' .. tostring(want3.hover) .. ')')
  else
    F.check(s3.tg == -1, 'frieza: no spot, no teleport (got slot ' .. s3.tg .. ')')
  end
  postTarget(0, 0, 0, 0, 0, 0, 0)
end
local function pan()
  F.import('animation-audit__native__rabite-field-b')
  F.on()
  H.wait(1)
  F.clearActors()
  H.wait(2)
  local gx, gy = H.r16(0x7EE002), H.r16(0x7EE004)
  local cx, cy = camera()
  -- toward the map's inside: the camera spans 0..width-256, 0..height-224
  local sy = (cy >= 40) and -1 or 1
  local sx = (cx + 256 + 20 <= H.r16(0x7E00C0)) and 1 or -1
  -- 30 px vertically, held 20 frames longer
  postCamera(cx, cy + 30 * sy, 50)
  local steps, bad, last = 0, 0, cy
  local track = {}
  for i = 1, 52 do
    H.wait(1)
    local x, y = camera()
    track[#track + 1] = y
    if x ~= cx then bad = bad + 1 end
    if y ~= last then
      steps = steps + 1
      if y - last ~= sy then bad = bad + 1 end
    end
    last = y
  end
  local ax, ay = camera()
  H.log(string.format('pan vertical: camera %d,%d -> %d,%d in %d steps (bad %d): %s', cx, cy, ax, ay, steps, bad, table.concat(track, ' ', 1, math.min(#track, 36))))
  F.check(ay == cy + 30 * sy and ax == cx, string.format('pan vertical: reached %d,%d (got %d,%d)', cx, cy + 30 * sy, ax, ay))
  F.check(steps == 30 and bad == 0, 'pan vertical: one pixel a frame (' .. steps .. ' steps, ' .. bad .. ' off)')
  -- diagonal: 12 px across and 8 back together, each one pixel a frame
  local bx, by = camera()
  postCamera(bx + 12 * sx, by - 8 * sy, 20)
  local xs, ys, off = 0, 0, 0
  local lx, ly = bx, by
  local firstX, firstY
  for i = 1, 22 do
    H.wait(1)
    local x, y = camera()
    if x ~= lx then xs = xs + 1; firstX = firstX or i; if x - lx ~= sx then off = off + 1 end end
    if y ~= ly then ys = ys + 1; firstY = firstY or i; if y - ly ~= -sy then off = off + 1 end end
    -- both axes start together and step every frame until each arrives
    if firstX and i < firstX + 12 and x == lx then off = off + 1 end
    if firstY and i < firstY + 8 and y == ly then off = off + 1 end
    lx, ly = x, y
  end
  if firstX ~= firstY then off = off + 1 end
  local dx, dy = camera()
  H.log(string.format('pan diagonal: %d,%d -> %d,%d (%d x steps, %d y steps, %d off)', bx, by, dx, dy, xs, ys, off))
  F.check(dx == bx + 12 * sx and dy == by - 8 * sy, string.format('pan diagonal: reached %d,%d (got %d,%d)', bx + 12 * sx, by - 8 * sy, dx, dy))
  F.check(xs == 12 and ys == 8 and off == 0, 'pan diagonal: both axes one pixel a frame')
  local hx, hy = H.r16(0x7EE002), H.r16(0x7EE004)
  F.check(hx == gx and hy == gy, string.format('pan: Goku stayed at %d,%d (got %d,%d)', gx, gy, hx, hy))
  -- the posts end: the camera holds, and walking moves it natively again
  H.wait(10)
  local hx2, hy2 = camera()
  F.check(hx2 == dx and hy2 == dy, 'after the pan: the camera holds')
  H.hold('down', 40)
  local wx, wy = camera()
  H.log(string.format('walk after the pan: camera %d,%d -> %d,%d', hx2, hy2, wx, wy))
  F.check(wx ~= hx2 or wy ~= hy2, 'after the pan: the native camera follows Goku again')
  H.shot('pan')
end
local function recoveryCamera()
  -- Recovery uses the same camera follower without a teleport action.
  -- L+Y during the scroll must not start a charge or spend time on its FX.
  F.import('animation-audit__native__rabite-field-b')
  F.on()
  H.wait(3)
  F.clearActors()
  H.w16(0x7EE002, math.max(40, H.r16(0x7EE002) - 192))
  F.follow()
  local pending, bad = 0, 0
  for i=1,90 do
    if not F.status().pend then break end
    pending=pending+1
    H.hold('l y',1)
    if H.r8(0x7ED828)~=0 or H.r16(0x7ED82E)~=0 then bad=bad+1 end
  end
  H.wait(4)
  F.check(pending>4, 'recovery camera scroll exercised')
  F.check(bad==0, 'no charge/focus during recovery camera scroll: '..bad)
  F.check(not F.status().pend, 'recovery camera completed')
  H.hold('l y',6)
  F.check(H.r8(0x7ED828)~=0, 'charging works after recovery camera arrives')
  H.wait(6)
end
local function passengers()
  F.import('graphics-audit__party')
  F.on()
  H.wait(8)
  local mode='carried'
  local shown={carried=0,landed=0,player=0}
  -- Exercise the renderer contract with settle's published mask, after
  -- movement and before OBJ construction. Actors remain active throughout.
  local setup=emu.addMemoryCallback(function()
    H.w16(0x7ED96C,mode=='landed' and 0 or 3)
    H.w8(0x7ED900,H.r8(0x7ED900)|3)
    H.w8(0x7EE22C,mode=='player' and 2 or 0)
    H.w8(0x7EE42C,0)
  end,emu.callbackType.exec,0x00B0CA,0x00B0CA)
  local body=emu.addMemoryCallback(function()
    local x=emu.getState()['cpu.x']
    if x==0x200 or x==0x400 then shown[mode]=shown[mode]+1 end
  end,emu.callbackType.exec,0x80E40E,0x80E40E)
  H.wait(8)
  F.check(shown.carried==0,'carried companions have no body/attachment/shadow pass')
  F.check(H.r8(0x7EE200)&1==1 and H.r8(0x7EE400)&1==1,'carried actors remain active')
  mode='landed'; H.wait(8)
  F.check(shown.landed>=8,'companions render again after landing')
  mode='player'; H.wait(8)
  F.check(shown.player>=4,'a human-controlled companion stays visible')
  emu.removeMemoryCallback(setup,emu.callbackType.exec,0x00B0CA,0x00B0CA)
  emu.removeMemoryCallback(body,emu.callbackType.exec,0x80E40E,0x80E40E)
  H.w8(0x7EE22C,0)
  H.w16(0x7ED96C,0)
  H.wait(2)
end
local function teleportClock()
  F.import('animation-audit__native__rabite-field-b')
  F.on()
  H.wait(2)
  F.clearActors()
  F.restore()
  H.wait(2)
  local gx,gy=H.r16(0x7EE002),H.r16(0x7EE004)
  postTarget(3,46,gx+40,gy,H.r8(0x7EE00B),0,200)
  H.wait(2)
  -- Start next to the 16-bit video-clock wrap; the subtraction must work
  -- across zero as well as across the deliberately missed frames.
  H.w16(0x7ED8C4,0xFFFD)
  H.w16(0x7ED8C6,0xFFFD)
  H.hold('l b',1)
  H.input=nil
  F.check(H.r16(F.TP)~=0,'video clock: teleport starts')
  local before=H.r16(F.TP+2)
  local done=H.r16(F.MAIL+6)
  H.w16(F.MAIL,10)
  F.check(H.waitFor(function() return H.r16(F.MAIL+6)~=done end,12),'video clock: injected lag completed')
  -- The completion mailbox is written before the ordinary flight step.
  -- At the next video boundary that step has advanced by all three NMIs.
  local after=H.r16(F.TP+2)
  F.check(after>=before+3,'video clock: teleport catches up after three missed frames ('..before..' -> '..after..')')
  F.check(H.r16(0x7ED8C4)<10,'video clock: regression crossed the counter wrap')
  local sounds=0
  for i=1,32 do
    H.wait(1)
    if H.r16(F.TP+0x10)~=0 then sounds=sounds+1 end
    if H.r16(F.TP)==0 then break end
  end
  F.check(H.r16(F.TP)==0,'video clock: teleport recovers after lag')
  F.check(sounds>0,'video clock: arrival cue survives skipped ages')
  postTarget(0,0,0,0,0,0,0)
end
function test()
  passengers()
  recoveryCamera()
  teleportClock()
  teleports()
  pan()
  H.result('failures', F.fail)
  H.result('pass', #F.fail == 0)
end
