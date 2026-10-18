-- Shared helpers for the flight tests (prepended by run.mjs after the
-- harness globals). IMPORT = import root, SYM = flight symbols.
F = {}
F.MAIL = 0x337AA0
F.RAM = 0x7ED900
function F.import(name)
  H.wait(5)
  assert(H.importSnesJs(IMPORT .. name), 'import failed: ' .. name)
  H.wait(2)
end
-- Goku stands in for the boy (the arrival flag; the browser state had it).
function F.on() emu.write(0x316001, 1, emu.memType.snesMemory) end
local function setRom(pc, bytes)
  local old = {}
  for i, b in ipairs(bytes) do
    old[i] = emu.read(pc + i - 1, emu.memType.snesPrgRom)
    emu.write(pc + i - 1, b, emu.memType.snesPrgRom)
  end
  return old
end
-- The browser tests' enter(map, x, y, layer): a scratch event (door 3 with
-- its destination rewritten) run by the native interpreter, then the ROM
-- bytes restored.
function F.enter(map, x, y, layer, flags, frames)
  layer = layer or 0
  local oldEvent = setRom(0x0742B0, {4, 24, 3, 5, 0})
  local oldDoor = setRom(0x08300C, {map & 255, x * 2 + (map >> 8), y * 2 + layer, 0})
  for k, v in pairs(flags or {}) do H.w8(0x7ECF00 + k, v) end
  H.w8(0x7E00D1, 0xB0); H.w8(0x7E00D2, 0x42); H.w8(0x7E00D3, 0xC7); H.w8(0x7E00D0, 1)
  H.wait(frames or 240)
  setRom(0x0742B0, oldEvent)
  setRom(0x08300C, oldDoor)
end
F.TP = 0x337B50
local function s16(v) if v >= 0x8000 then return v - 0x10000 end return v end
-- Enter a room through its real door n (a scratch DOOR event run by the
-- native interpreter, as story.travel(n) does), then the ROM bytes restored.
function F.door(n, frames)
  local oldEvent = setRom(0x0742B0, {4, 0x18 + (n >> 8), n & 0xFF, 5, 0})
  H.w8(0x7E00D1, 0xB0); H.w8(0x7E00D2, 0x42); H.w8(0x7E00D3, 0xC7); H.w8(0x7E00D0, 1)
  H.wait(frames or 240)
  setRom(0x0742B0, oldEvent)
end
F.CE = 0x337BF0
function F.status()
  local x, y = H.r16(0x7EE002), H.r16(0x7EE004)
  local last = H.r16(F.TP + 0x14)
  return {
    map = H.r16(0x7E00DC), x = x, y = y,
    terrain = H.r8(0x7EE00B), fly = (H.r8(F.RAM) & 1) == 1, lift = H.r8(F.RAM + 1),
    can = (H.r8(F.RAM) & 4) == 4,
    -- Instant Transmission: the published Goku action, its age, the camera
    -- (hero map position minus screen position), the last target slot
    act = H.r8(0x7ED742) == 0x14, age = H.r16(0x7ED744),
    cx = x - s16(H.r16(0x7EE020)), cy = y - s16(H.r16(0x7EE022)),
    tg = (last == 0xFFFF) and -1 or last,
    pend = (H.r8(F.RAM + 0x32) & 4) == 4,
    en = F.enemies(),
    gap = H.r8(0x7ED748) == 0x23, ev = H.r8(0x7E00D0),
  }
end
-- Active actors 3-11 as "slot:x,y" (teleport targets).
function F.enemies()
  local out = {}
  for i = 3, 11 do
    local b = 0x7EE000 + i * 0x200
    if (H.r8(b) & 1) == 1 then out[#out + 1] = string.format('%d:%d,%d', i, H.r16(b + 2), H.r16(b + 4)) end
  end
  return table.concat(out, ' ')
end
-- localFlightHook.restore() (FLIGHT_TEST mailbox command 3). Not waited
-- for: the next flight frame applies it before anything else, so the
-- scenario's first frame starts at once, as the browser's does.
function F.restore()
  H.w16(F.MAIL, 3)
end
function F.str(s)
  return string.format('map %d x %d y %d t %02x fly %s lift %d can %s', s.map, s.x, s.y, s.terrain, tostring(s.fly), s.lift, tostring(s.can))
end
-- Remove other actors (the browser tests' write8(0xe000+i*512,0) loop).
function F.clearActors()
  for i = 1, 11 do H.w8(0x7EE000 + i * 512, 0) end
end
F.fail = {}
function F.check(cond, msg)
  if not cond then F.fail[#F.fail + 1] = msg; H.log('FAIL ' .. msg) end
end
-- teleport.follow() at the hero's position (FLIGHT_TEST mailbox command 2).
function F.follow(x, y)
  local done = H.r16(F.MAIL + 6)
  H.w16(F.MAIL, 2)
  H.waitFor(function() return H.r16(F.MAIL + 6) ~= done end, 30)
end
