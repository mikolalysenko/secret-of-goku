-- Mesen reference for snes/test/emulators: the same power-on scenario as
-- scenario.mjs plays on the libretro cores (boot checks, title shots at
-- fixed frames, name editor, opening to map 128, CPU-bus probe, save, reset
-- and load). run.mjs prepends PROBE_CODE (bytes, JML target patched here),
-- TITLE_FRAMES and the addresses below.
local A = { tramp = 0x7E0100, d0 = 0x7E00D0, map = 0x7E00DC, heroX = 0x7EE002, heroY = 0x7EE004,
  menuPage = 0x7EA202, menuCursor = 0x7EA211, nameLen = 0x7EA1CC, coreFrame = 0x7ED700,
  coreFlags = 0x7ED73A, titleFlags = 0x7EDD9E, eventReq = 0x317490, probeCode = 0x7E6F40,
  probeOut = 0x7E6FC0 }
local events = {}
local function tramp() return { H.r8(A.tramp), H.r8(A.tramp + 1), H.r8(A.tramp + 2), H.r8(A.tramp + 3) } end
local function inField() local t = tramp() return t[1] == 0x5C and t[2] == 0xA8 and t[3] == 0xC0 and t[4] == 0x00 end
local function inMenu() local t = tramp() return t[1] == 0x5C and t[2] == 0xA7 and t[3] == 0x20 and t[4] == 0xC0 end
local function idle() return H.r8(A.d0) == 0 and H.r8(0x7E00E4) == 1 and H.r8(0x7E00E5) == 1 end
local function bytes(addr, n) local t = {} for i = 0, n - 1 do t[#t + 1] = H.r8(addr + i) end return t end
local function sramBytes(off, n) local t = {} for i = 0, n - 1 do t[#t + 1] = H.sram(off + i) end return t end
local function waitFor(fn, frames, every)
  every = every or 1
  for _ = 1, frames, every do
    if fn() then return true end
    H.wait(every)
  end
  return fn()
end

local function scenario()
  -- 1. power-on
  H.wait(120 - H.frame)
  H.result('tramp', bytes(A.tramp, 8))
  H.result('live_magic', H.sram(0x203E) | (H.sram(0x203F) << 8))
  H.result('title_flags', H.r8(A.titleFlags))
  -- 2. title at fixed frames
  for _, f in ipairs(TITLE_FRAMES) do
    H.wait(f - H.frame)
    H.shot('title-' .. f)
  end
  -- 3. name editor
  if H.frame < 960 then H.wait(960 - H.frame) end
  local editor = false
  for _ = 1, 60 do
    if inMenu() and H.r8(A.menuPage) == 3 then editor = true break end
    H.tap('start', 4, 20)
  end
  events.editor = H.frame
  local prefilled = waitFor(function() return H.r8(A.nameLen) == 3 end, 240, 2)
  events.prefilled = H.frame
  H.result('name_prefilled', prefilled)
  H.wait(30)
  H.shot('name')
  H.result('name_scroll', H.r8(0x7EA20B))
  events.name = H.frame
  H.wait(2) -- the cores shoot F-2..F+2 here
  if not editor then return end
  -- 4. opening
  H.wait(8)
  H.tap('start', 8, 8)
  waitFor(inField, 600, 2)
  local control = false
  for _ = 1, 2400 do
    if H.r8(A.d0) == 0x83 then H.tap('b', 4, 4) else H.wait(4) end
    if H.r16(A.map) == 128 and idle() and inField() then control = true break end
  end
  events.control = H.frame
  H.result('waterfall_reached', control)
  if not control then return end
  H.wait(30)
  H.shot('waterfall')
  events.waterfall = H.frame
  H.wait(2)
  local cf0 = H.r16(A.coreFrame)
  H.wait(60)
  H.result('field_frames_60', H.r16(A.coreFrame) - cf0)
  H.result('map', H.r16(A.map))
  H.result('hero', { H.r16(A.heroX), H.r16(A.heroY) })
  -- 5. bus probe (same routine as scenario.mjs), borrowed WRAM restored
  local t = tramp()
  local n = #PROBE_CODE
  PROBE_CODE[n - 2], PROBE_CODE[n - 1], PROBE_CODE[n] = t[2], t[3], t[4]
  local saved = bytes(A.probeCode, 0xC0)
  for i = 0, 0xBF do H.w8(A.probeCode + i, PROBE_CODE[i + 1] or 0) end
  H.w8(A.tramp + 1, A.probeCode & 0xFF); H.w8(A.tramp + 2, (A.probeCode >> 8) & 0xFF); H.w8(A.tramp + 3, A.probeCode >> 16)
  H.wait(3)
  H.w8(A.tramp + 1, t[2]); H.w8(A.tramp + 2, t[3]); H.w8(A.tramp + 3, t[4])
  H.result('probe', bytes(A.probeOut, 0x40))
  H.result('probe_sram', { H.sram(0), H.sram(0x203E), H.sram(0x7FFF) })
  for i = 0, 0xBF do H.w8(A.probeCode + i, saved[i + 1]) end
  H.wait(2)
  -- 6. save through the save point's event (!core_event_req, battery RAM)
  H.w16(A.eventReq, 0x8000 | 0x05D8)
  if not waitFor(inMenu, 300, 2) then H.result('save_menu', false) return end
  H.wait(30)
  for _ = 1, 8 do
    if H.r8(A.menuCursor) == 0 then break end
    H.tap('up', 6, 24)
  end
  H.tap('b', 6, 60)
  H.tap('b', 6, 60)
  waitFor(function() return inField() and H.r8(A.d0) == 0 end, 600, 2)
  H.result('sram_after_save', sramBytes(0, 16))
  H.result('sidecar0', H.sram(0x2400) | (H.sram(0x2401) << 8))
  H.result('saved_hero', { H.r16(A.heroX), H.r16(A.heroY) })
  events.saved = H.frame
  -- 7. console reset (Mesen keeps battery RAM), GAME FILE, slot 1
  local done = false
  local id = emu.addMemoryCallback(function()
    if not done then done = true; emu.reset() end
  end, emu.callbackType.exec, 0x000000, 0xFFFFFF)
  for _ = 1, 10 do if done then break end; coroutine.yield() end
  emu.removeMemoryCallback(id, emu.callbackType.exec, 0x000000, 0xFFFFFF)
  events.reset = H.frame
  local sel = false
  for i = 1, 60 do
    if inMenu() then sel = true break end
    if i % 3 == 0 then H.tap('start', 4, 4) else H.wait(20) end
  end
  if not sel then H.result('game_select', false) return end
  H.wait(40)
  local function choose(v)
    for _ = 1, 8 do
      if H.r8(A.menuCursor) == v then return true end
      H.tap(H.r8(A.menuCursor) < v and 'down' or 'up', 6, 24)
    end
    return H.r8(A.menuCursor) == v
  end
  H.result('file_default', H.r8(A.menuCursor))
  choose(1)
  H.tap('b', 6, 60)
  choose(0)
  H.tap('b', 6, 60)
  local loaded = waitFor(function() return inField() and H.r8(A.d0) == 0 end, 900, 2)
  H.wait(30)
  H.shot('loaded')
  events.loaded = H.frame
  H.wait(2)
  H.result('loaded', loaded)
  H.result('loaded_map', H.r16(A.map))
  H.result('loaded_hero', { H.r16(A.heroX), H.r16(A.heroY) })
  H.result('loaded_core_flags', H.r16(A.coreFlags))
end

function test()
  scenario()
  H.result('events', events)
end
