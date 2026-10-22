-- Elinee's throne room to her surrender (see snes/test/story/run.mjs,
-- spikey-*): the throne room (309) through its own door (130) runs 1E7,
-- Spikey Tiger's arena (310), its defeat (1E2), then Elinee in the room
-- before (306, door 12E) yields (1E3 -> 1ED). The prelude defines CASE as
-- for earth.lua: bundle, writes, remove, stream, ram, persist, resolve.
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
local function actor(species)
  for s = 3, 11 do
    local b = 0x7EE000 + s * 0x200
    if (u8(b) & 1) == 1 and u8(b + 0x180) == species then return b end
  end
end
local SPIKEY, ELINEE = 0x5B, 0xBA
-- Spikey's sprites use enemy palettes (4-7; Goku and the HUD use 0-3) and
-- stand within 64 px of its screen position, which can sit on Goku's.
local function drawn(b)
  local sx, sy, n = s16(b + 0x20), s16(b + 0x22), 0
  for i = 0, 127 do
    local x, y = H.oam(i * 4), H.oam(i * 4 + 1)
    if (H.oam(0x200 + (i >> 2)) >> ((i & 3) * 2)) & 1 == 1 then x = x - 256 end
    if y < 224 and (H.oam(i * 4 + 3) >> 1) & 7 >= 4 and math.abs(x - sx) <= 64 and y >= sy - 80 and y <= sy + 16 then n = n + 1 end
  end
  return n
end
local function idle() return u8(0xD0) == 0 and u8(CASE.ram + 0x06) == 0 end
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
local function mash(limit, done, each)
  for i = 1, limit do
    if done() then return true end
    if each then each(i) end
    if i % 16 == 0 then H.hold('b', 2) else H.wait(1) end
  end
  return done()
end

local trace = {}
local function finish(shot)
  H.shot(shot)
  local flags = {}
  for i = 0, 255 do flags[i + 1] = flag(i) end
  H.result('flags', flags)
  H.result('map', map())
  H.result('party', {u8(0x7EE000) & 1, u8(0x7EE200) & 1, u8(0x7EE400) & 1})
  H.result('trace', trace)
end

function test()
  H.wait(5)
  if not H.importSnesJs(CASE.bundle) then H.result('error', 'import failed'); return end
  emu.addMemoryCallback(function()
    local id = u16(CASE.ram + 0x78)
    trace[#trace + 1] = {id, u8(0xD1) | (u8(0xD2) << 8) | (u8(0xD3) << 16), H.frame}
    if id == 0x1E7 then H.result('scene_stage', flag(0x17)) end
  end, emu.callbackType.exec, CASE.resolve, CASE.resolve)
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
  H.result('party_before', {u8(0x7EE000) & 1, u8(0x7EE200) & 1, u8(0x7EE400) & 1})

  -- 1. The throne room's own door: Elinee's scene, then the arena.
  request(0x800 | 0x130)
  local elinee = -1
  local reached = mash(3000, function() return map() == 310 end, function()
    if map() == 309 and elinee < 0 and actor(ELINEE) then elinee = flag(0x17) end
  end)
  H.result('arena', reached)
  H.result('elinee_stage', elinee)
  H.result('arena_stage', flag(0x17))
  if not reached then finish('no-arena'); return end

  -- 2. Spikey Tiger: created and drawn on the lit screen.
  local boss
  H.waitFor(function() boss = actor(SPIKEY); return boss ~= nil end, 600)
  H.result('boss', boss ~= nil)
  if not boss then H.wait(120); finish('empty-arena'); return end
  H.result('boss_hp', {u16(boss + 0x182), u16(boss + 0x184)})
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

  -- 3. Instant Transmission (L+B) and punches until it is hurt, then until
  -- its defeat (1E2) returns Goku to the throne room at stage 6.
  local full = u16(boss + 0x184)
  local function gone() return (u8(boss) & 1) == 0 or u8(boss + 0x180) ~= SPIKEY end
  local function attack() H.hold('l b', 3); H.wait(30); for _ = 1, 8 do H.hold('b', 2); H.wait(6) end end
  local hurt = false
  for _ = 1, 20 do
    if gone() or u16(boss + 0x182) < full then hurt = true; break end
    if idle() then attack() else H.wait(30) end
  end
  H.result('boss_hurt', hurt)
  H.result('boss_hp_after', gone() and 0 or u16(boss + 0x182))
  local function back() return map() == 309 and idle() and flag(0x17) >= 6 end
  local returned = false
  for _ = 1, 60 do
    if back() then returned = true; break end
    if map() == 310 and idle() and not gone() and u16(boss + 0x182) > 0 then attack()
    else returned = mash(120, back); if returned then break end end
  end
  H.result('defeated', returned)
  H.result('stage_after', flag(0x17))
  if not returned then finish('after-boss'); return end
  H.shot('throne-room')

  -- 4. The story goes on: Elinee, beaten, yields in the room before (1ED:
  -- stage 7, her chests).
  request(0x800 | 0x12E)
  local yielding
  H.waitFor(function() yielding = map() == 306 and idle() and actor(ELINEE); return yielding end, 900)
  H.result('elinee', yielding and true or false)
  if not yielding then finish('no-elinee'); return end
  H.wait(30)
  request(0x1E3, yielding)
  H.result('yielded', mash(4000, function() return flag(0x17) >= 7 and idle() end))
  finish('surrender')
end
