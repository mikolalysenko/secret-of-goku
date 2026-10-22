-- Earth Palace end to end (see snes/test/story/run.mjs, earth-gnome-*):
-- the stage room (map 314) through its own door, Gnome's scene (23B ->
-- 236), Fire Gigas's arena (495), the defeat (237), Gnome's thanks (22E ->
-- 580) and the Earth seed (58B -> 592). The prelude defines
-- CASE = {
--   bundle, writes = {{addr, value, width}, ...},
--   remove = {member, ...} (native REMOVE_CHARACTER 2C, run from `stream`),
--   stream = <SRAM address for that script>, ram = <!RAM_STORY>,
--   persist = <!PERSIST_STORY>, resolve = <story_resolve_done PC>
-- }
local function u8(a) return emu.read(a, emu.memType.snesMemory) end
local function u16(a) return u8(a) | (u8(a + 1) << 8) end
local function s16(a) local v = u16(a) if v >= 0x8000 then v = v - 0x10000 end return v end
local function map() return u16(0x7E00DC) & 0x1FF end
local function flag(n) return u8(0x7ECF00 + n) end
local function apply(list)
  for _, w in ipairs(list or {}) do
    if w[3] == 2 then H.w16(w[1], w[2]) else H.w8(w[1], w[2]) end
  end
end
-- First active actor of a species among the NPC/enemy slots (3-11).
local function actor(species)
  for s = 3, 11 do
    local b = 0x7EE000 + s * 0x200
    if (u8(b) & 1) == 1 and u8(b + 0x180) == species then return b end
  end
end
local GIGAS, GNOME, SEED = 0x74, 0x90, 0xDF
-- Visible OAM entries in the boss's box: its 64 px picture stands above its
-- screen position (with some slack); Goku arrives below it.
local function drawn(b)
  local sx, sy, n = s16(b + 0x20), s16(b + 0x22), 0
  for i = 0, 127 do
    local x, y = H.oam(i * 4), H.oam(i * 4 + 1)
    if (H.oam(0x200 + (i >> 2)) >> ((i & 3) * 2)) & 1 == 1 then x = x - 256 end
    if y < 224 and x >= sx - 48 and x <= sx + 40 and y >= sy - 80 and y < sy - 4 then n = n + 1 end
  end
  return n
end
local function idle() return u8(0xD0) == 0 and u8(CASE.ram + 0x06) == 0 end
-- story_api_request's queue, as story.lua drives it (actor = its slot).
local function request(id, b)
  local slot = b and (b - 0x7EE000) or 0
  H.w16(CASE.ram + 0x08, id)
  H.w16(CASE.ram + 0x0A, slot)
  if slot ~= 0 then
    H.w16(CASE.ram + 0x0C, u16(0x7E00DC))
    H.w16(CASE.ram + 0x0E, u16(b + 0x3E))
  end
  H.w8(CASE.ram + 0x06, 1)
end
-- B on every 16th frame (pages, punches) until done() or `limit` frames.
local function mash(limit, done, each)
  for i = 1, limit do
    if done() then return true end
    if each then each(i) end
    if i % 16 == 0 then H.hold('b', 2) else H.wait(1) end
  end
  return done()
end

local trace, events = {}, {}
local function finish(shot)
  H.shot(shot)
  local flags, persist = {}, {}
  for i = 0, 255 do flags[i + 1] = flag(i) end
  for i = 0, 0x17 do persist[i + 1] = u8(CASE.persist + i) end
  H.result('flags', flags)
  H.result('persist', persist)
  H.result('map', map())
  H.result('d0', u8(0xD0))
  H.result('trace', trace)
  H.result('events', events)
end

function test()
  H.wait(5)
  if not H.importSnesJs(CASE.bundle) then H.result('error', 'import failed'); return end
  emu.addMemoryCallback(function()
    local id = u16(CASE.ram + 0x78)
    trace[#trace + 1] = {id, u8(0xD1) | (u8(0xD2) << 8) | (u8(0xD3) << 16), H.frame}
    if id == 0x236 then H.result('scene_stage', flag(0x18)) end
  end, emu.callbackType.exec, CASE.resolve, CASE.resolve)
  -- story_last_event: its high byte completes the word (stored after this)
  emu.addMemoryCallback(function(_, value)
    events[#events + 1] = u8(CASE.ram) | ((value or 0) << 8)
  end, emu.callbackType.write, CASE.ram + 1, CASE.ram + 1)
  apply(CASE.writes)
  H.wait(4)
  if #CASE.remove > 0 then
    local bytes = {}
    for _, m in ipairs(CASE.remove) do bytes[#bytes + 1] = 0x2C; bytes[#bytes + 1] = m end
    bytes[#bytes + 1] = 0
    for k, v in ipairs(bytes) do H.w8(CASE.stream + k - 1, v) end
    H.waitFor(function() return u8(0xD0) == 0 end, 120)
    H.w8(0xD1, CASE.stream & 0xFF); H.w8(0xD2, (CASE.stream >> 8) & 0xFF); H.w8(0xD3, (CASE.stream >> 16) & 0xFF)
    H.w8(0xD0, 1)
    H.waitFor(function() return u8(0xD0) == 0 end, 120)
    H.wait(4)
  end
  H.result('party', {u8(0x7EE000) & 1, u8(0x7EE200) & 1, u8(0x7EE400) & 1})
  H.result('cf18_before', flag(0x18))

  -- 1. The stage room's own door from the palace transitions (ED).
  request(0x800 | 0xED)
  local gnomeStage = -1
  local reached = mash(3000, function() return map() == 495 end, function()
    if map() == 314 and gnomeStage < 0 and actor(GNOME) then gnomeStage = flag(0x18) end
  end)
  H.result('arena', reached)
  H.result('gnome_stage', gnomeStage)
  H.result('cf18_arena', flag(0x18))
  if not reached then finish('no-arena'); return end

  -- 2. Fire Gigas: created and drawn, before any button is pressed.
  local boss
  H.waitFor(function() boss = actor(GIGAS); return boss ~= nil end, 600)
  H.result('boss', boss ~= nil)
  if not boss then H.wait(120); finish('empty-arena'); return end
  H.result('boss_hp', {u16(boss + 0x182), u16(boss + 0x184)})
  -- Drawn: its sprites are in OAM while the picture is lit (the door's
  -- fade-in has finished).
  local cells, lit = 0, false
  H.waitFor(function()
    local st = emu.getState()
    cells = drawn(boss)
    lit = not st['ppu.forcedBlank'] and st['ppu.screenBrightness'] == 15
    return cells >= 4 and lit
  end, 600)
  H.result('boss_cells', cells)
  H.result('boss_lit', lit)
  H.wait(2)
  H.shot('boss')

  -- 3. Punches (B) until it is hurt, then until its defeat event has
  -- returned Goku to the stage room with control.
  local full = u16(boss + 0x184)
  H.result('boss_hurt', mash(900, function()
    return (u8(boss) & 1) == 0 or u8(boss + 0x180) ~= GIGAS or u16(boss + 0x182) < full
  end))
  H.result('boss_hp_after', u16(boss + 0x182))
  local back = mash(4000, function() return map() == 314 and flag(0x18) >= 6 and idle() end)
  H.result('defeated', back)
  H.result('cf18_after', flag(0x18))
  H.result('cfa8_after', flag(0xA8))
  if not back then finish('after-boss'); return end
  H.shot('stage-room')

  -- 4. The story goes on: Gnome waits beside the seed (door 136), thanks
  -- Goku (22E) and grants his magic (580); then the Earth seed (58B).
  request(0x800 | 0x136)
  -- $DC changes as the door starts loading; wait for the room's actors.
  local gnome
  H.waitFor(function() gnome = map() == 276 and idle() and actor(GNOME); return gnome end, 900)
  H.result('gnome', gnome ~= nil and gnome ~= false)
  if not gnome then finish('no-gnome'); return end
  H.wait(30)
  request(0x22E, gnome)
  H.result('thanked', mash(4000, function() return flag(0xA8) >= 2 and idle() end))
  H.result('cf18_thanks', flag(0x18))
  local seed
  H.waitFor(function() seed = idle() and actor(SEED); return seed end, 300)
  H.wait(30)
  H.result('seed', seed ~= nil and seed ~= false)
  if not seed then finish('no-seed'); return end
  request(0x58B, seed)
  H.result('seeded', mash(4000, function() return flag(0x91) == 1 and flag(0x18) >= 8 and idle() end))
  finish('seed')
end
