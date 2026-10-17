-- Goku's arrival end to end, from a waterfall checkpoint made from power-on
-- with this build (snes/test/checkpoints.mjs): walk to the Mana Sword along
-- WAYPOINTS ({x, y, dir}: hold dir until that coordinate is reached, with
-- sideways nudges when blocked), pull it (Down, B), confirm every page, and
-- follow the original tail until control returns. Then: the stable
-- checkpoint after-arrival.mss (field loop, 00:B079), the scenery checks, a
-- ring menu round trip; MODE = "doors" (CORE_TEST build, from that checkpoint):
-- a door round trip to Potos and back.
-- Prelude: MODE ('arrival' | 'doors'); arrival: WAYPOINTS, SCRIPT (event
-- script address), PAGE_WAITS (offsets), SHOTS ({phase, ticks, name});
-- doors: DOOR_OUT, DOOR_BACK.
local function r16(a) return H.wram(a) | (H.wram(a + 1) << 8) end
local function ptr() return H.wram(0xD1) | (H.wram(0xD2) << 8) | (H.wram(0xD3) << 16) end
local function idle() return H.wram(0xD0) == 0 and H.wram(0xE4) == 1 and H.wram(0xE5) == 1 end
local function settle(maxf)
  for i = 1, maxf or 900 do
    if H.wram(0xD0) == 0 then H.input = nil return true end
    if H.wram(0xD0) == 0x83 and (i % 30) < 3 then H.input = {b = true} else H.input = nil end
    H.wait(1)
  end
  H.input = nil
  return H.wram(0xD0) == 0
end
local function go(tx, ty, dir, maxf)
  local stuck, lastx, lasty, nudges = 0, -1, -1, 0
  local key = ({U = 'up', D = 'down', L = 'left', R = 'right'})[dir]
  for _ = 1, maxf or 120 do
    if H.wram(0xD0) ~= 0 then settle(900) end
    local x, y = r16(0xE002), r16(0xE004)
    if (dir == 'D' and y >= ty - 1) or (dir == 'U' and y <= ty + 1)
      or (dir == 'R' and x >= tx - 1) or (dir == 'L' and x <= tx + 1) then H.input = nil return true end
    if stuck >= 6 then
      local perp
      if dir == 'U' or dir == 'D' then
        perp = (tx > x + 1) and 'right' or (tx < x - 1) and 'left' or ((nudges % 2 == 0) and 'right' or 'left')
      else
        perp = (ty > y + 1) and 'down' or (ty < y - 1) and 'up' or ((nudges % 2 == 0) and 'down' or 'up')
      end
      H.input = {[perp] = true, [key] = true}
      H.wait(4)
      nudges = nudges + 1
      stuck = 0
      if nudges > 8 then H.input = nil return false end
    else
      H.input = {[key] = true}
      H.wait(1)
    end
    local nx, ny = r16(0xE002), r16(0xE004)
    if nx == lastx and ny == lasty then stuck = stuck + 1 else stuck = 0 end
    lastx, lasty = nx, ny
  end
  H.input = nil
  return false
end
-- Our OBJ entries in the OAM buffer: crater (palette 6) and pod (palette 7).
local function scenery()
  local crater, pod = 0, 0
  for s = 0, 127 do
    local y = H.wram(0x0801 + s * 4)
    local attr = H.wram(0x0803 + s * 4)
    local tile = H.wram(0x0802 + s * 4) | ((attr & 1) << 8)
    if y < 224 then
      local pal = (attr >> 1) & 7
      if pal == 6 and ((tile >= 0x0C0 and tile < 0x0F0) or tile == 0x080) then crater = crater + 1 end
      if pal == 7 and ((tile >= 0x088 and tile < 0x090) or (tile >= 0x106 and tile < 0x110)) then pod = pod + 1 end
    end
  end
  return crater, pod
end
-- Savestate taken while the field loop waits for NMI (00:B079, original
-- code): no cartridge-added code on the stack, so it loads into later builds.
local function saveAtFieldLoop(name, frames)
  local done = false
  local id = emu.addMemoryCallback(function()
    if not done then
      done = true
      local f = assert(io.open(H_OUT .. '/' .. name .. '.mss', 'wb'))
      f:write(emu.createSavestate())
      f:close()
    end
  end, emu.callbackType.exec, 0x00B079, 0x00B079)
  for _ = 1, frames or 600 do
    if done then break end
    H.wait(1)
  end
  emu.removeMemoryCallback(id, emu.callbackType.exec, 0x00B079, 0x00B079)
  return done
end
local function vramSum(word, bytes)
  local s = 0
  for i = 0, bytes - 1 do s = (s + H.vram(word * 2 + i) * (i + 1)) % 1000003 end
  return s
end
local function craterVram()
  -- the crater's first eight cells: tiles $0C0-$0CF (top halves), $0D0-$0DF
  return vramSum(0x6000 + 0x0C0 * 16, 0x200) .. ':' .. vramSum(0x6000 + 0x0D0 * 16, 0x200)
end

local function arrival()
  H.wait(5)
  -- the walk
  local misses = {}
  for i, w in ipairs(WAYPOINTS) do
    if not go(w[1], w[2], w[3], 120) then
      misses[#misses + 1] = string.format('%d:%d,%d at %d,%d', i, w[1], w[2], r16(0xE002), r16(0xE004))
    end
  end
  H.input = nil
  H.wait(10)
  H.result('walk_misses', misses)
  H.result('at_sword', {r16(0xE002), r16(0xE004)})
  H.shot('at-sword')
  -- pull the sword, then the arrival and the original tail
  H.tap('down', 2, 6)
  H.tap('b', 3, 3)
  local before, late, lateNative, frames3, lateRows, fastOn = nil, 0, 0, 0, {}, 0
  local id1 = emu.addMemoryCallback(function() before = emu.getState()['ppu.scanline'] end, emu.callbackType.exec, 0x00B073, 0x00B073)
  local id2 = emu.addMemoryCallback(function()
    local st = emu.getState()
    local after = st['ppu.scanline']
    if H.wram(0xDD86) == 3 and before then
      frames3 = frames3 + 1
      -- MEMSEL ($420D bit 0): FastROM actually in effect this frame
      if st['internalRegisters.enableFastRom'] then fastOn = fastOn + 1 end
      if before >= 225 then lateNative = lateNative + 1
      elseif after >= 225 or after < before then
        late = late + 1
        if #lateRows < 10 then lateRows[#lateRows + 1] = string.format('age %d: %d-%d', r16(0xDD88), before, after) end
      end
    end
  end, emu.callbackType.exec, 0x00B077, 0x00B077)
  local phases, last, shot, pages = {}, -1, {}, {}
  for _, s in ipairs(SHOTS) do shot[s[1] .. ':' .. s[2]] = s[3] end
  local done = false
  -- an arrival page is confirmed only after its shot, taken a few frames
  -- into the wait (the last glyphs reach VRAM after D0 becomes $83)
  local waitSince = {}
  local function page()
    for i, off in ipairs(PAGE_WAITS) do if ptr() == SCRIPT + off then return 'page-' .. i end end
    return nil
  end
  for f = 1, 4000 do
    local d0 = H.wram(0xD0)
    local p = d0 == 0x83 and page() or nil
    if d0 == 0x83 and (f % 40) < 3 and (not p or pages[p]) then H.input = {b = true} else H.input = nil end
    H.wait(1)
    local ph, ticks = H.wram(0xDD86), r16(0xDD88)
    if ph ~= last then
      phases[#phases + 1] = {phase = ph, frame = f, ptr = string.format('%06X', ptr()), d0 = H.wram(0xD0)}
      last = ph
    end
    local name = shot[ph .. ':' .. ticks]
    if name and not pages[name] then pages[name] = true; H.shot(name) end
    local q = H.wram(0xD0) == 0x83 and page() or nil
    if q and not pages[q] then
      waitSince[q] = waitSince[q] or f
      if f - waitSince[q] >= 6 then pages[q] = true; H.shot(q) end
    end
    if ph == 6 and idle() and H.wram(0xCF00) == 1 then done = true break end
  end
  emu.removeMemoryCallback(id1, emu.callbackType.exec, 0x00B073, 0x00B073)
  emu.removeMemoryCallback(id2, emu.callbackType.exec, 0x00B077, 0x00B077)
  H.input = nil
  H.result('control', done)
  H.result('phases', phases)
  H.result('impact_frames', frames3)
  H.result('impact_late', late)
  H.result('impact_late_native', lateNative)
  H.result('impact_late_rows', lateRows)
  H.result('impact_fastrom', fastOn)
  local captured = {}
  for k in pairs(pages) do captured[#captured + 1] = k end
  table.sort(captured)
  H.result('shots', captured)
  H.result('flags', {H.wram(0xCF00), H.wram(0xCF10), H.wram(0xCF0A), H.wram(0xCFC1)})
  local n = {}
  for i = 0, 11 do n[#n + 1] = H.wram(0xCC00 + i) end
  H.result('hero_slot', n)
  H.result('goku_active', H.r8(0x316001))
  H.result('arrival_bits', H.r8(0x316300))
  H.result('inventory_cc48', H.wram(0xCC48))
  H.result('claims', H.wram(0xDD9D))
  H.result('hero_mode', H.wram(0xDD8A))
  H.result('cell_req', r16(0xD74E))
  H.wait(30)
  H.shot('control')
  -- stable checkpoint after the arrival (field loop at 00:B079)
  H.result('saved', saveAtFieldLoop('after-arrival', 600))
  H.wait(2)
  local c, p = scenery()
  H.result('scenery', {c, p})
  H.result('crater_vram', craterVram())
  H.result('pos', {r16(0xE002), r16(0xE004)})
  -- ring menu round trip: OBJ VRAM is the ring's meanwhile. X is ring /
  -- back for Goku (combat's input layer turns it into the native Y, which
  -- is his ki), as the browser mod's player presses it.
  for _ = 1, 3 do
    if H.r16(0x7ED720) == 4 then break end
    H.tap('x', 6, 40)
  end
  H.result('ring_open', H.r16(0x7ED720) == 4)
  H.shot('ring')
  for _ = 1, 4 do
    if H.r16(0x7ED720) == 1 then break end
    H.tap('x', 6, 40)
  end
  H.wait(30)
  local c2, p2 = scenery()
  H.result('scenery_after_ring', {c2, p2})
  H.result('crater_vram_after_ring', craterVram())
  H.shot('after-ring')
end

-- From after-arrival.mss in a CORE_TEST build: door to Potos and back
-- through the test mailbox (core_event_request), checking the scenery.
local function door(id, map)
  H.w16(0x7E6F40 + 0x28, 0x0800 | id)
  H.w16(0x7E6F40, 5)
  if not H.waitFor(function() return r16(0xDC) == map end, 600) then return false end
  H.waitFor(function() return not idle() end, 300)
  local still = 0
  for _ = 1, 1200 do
    if H.wram(0xD0) == 0x83 then H.tap('b', 4, 4) still = 0 else H.wait(1) end
    if idle() then still = still + 1 else still = 0 end
    if still >= 60 then return true end
  end
  return false
end
local function doors()
  H.wait(20)
  local c0, p0 = scenery()
  H.result('scenery_start', {c0, p0})
  H.result('crater_vram_start', craterVram())
  H.result('door_out', door(DOOR_OUT, 131))
  local c3, p3 = scenery()
  H.result('scenery_potos', {c3, p3})
  H.result('claims_potos', H.wram(0xDD9D))
  H.shot('potos')
  H.result('door_back', door(DOOR_BACK, 128))
  H.wait(10)
  local c4, p4 = scenery()
  H.result('scenery_back', {c4, p4})
  H.result('crater_vram_back', craterVram())
  H.result('pos_back', {r16(0xE002), r16(0xE004)})
  H.shot('back')
end

function test()
  if MODE == 'doors' then doors() else arrival() end
end
