-- Dwarf Village quake to Popoi's recruitment (see snes/test/story/run.mjs,
-- tropicallo-*): the village through its own door (149) at CF15 5 starts
-- the quake (1BE), Tropicallo's arena (290), its defeat (1B9), the sprite's
-- naming (1D3 -> 41) and the Elder (1D4). The prelude defines CASE as for
-- earth.lua: bundle, writes, remove, stream, ram, persist, resolve.
local function u8(a) return emu.read(a, emu.memType.snesMemory) end
local function u16(a) return u8(a) | (u8(a + 1) << 8) end
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
local TROPICALLO, SPRITE, ELDER = 0x59, 0x8C, 0x9B
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
-- B on every 16th frame (pages, the default Yes) until done(). A script
-- stalled at the naming screen gets a letter (B), Start and B.
local function mash(limit, done)
  for i = 1, limit do
    if done() then return true end
    if i % 240 == 120 and u8(0xD0) == 1 then
      if u8(0x7EA1CC) == 0 then H.hold('b', 2); H.wait(12) end
      H.hold('start', 2); H.wait(20); H.hold('b', 2); H.wait(30)
    elseif i % 16 == 0 then H.hold('b', 2) else H.wait(1) end
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
    trace[#trace + 1] = {u16(CASE.ram + 0x78), u8(0xD1) | (u8(0xD2) << 8) | (u8(0xD3) << 16), H.frame}
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

  -- 1. Into the village: the quake takes the party to the arena.
  request(0x800 | 0x149)
  local boss
  local reached = mash(2400, function() boss = map() == 290 and idle() and actor(TROPICALLO); return boss end)
  H.result('arena_map', map())
  H.result('arena_stage', flag(0x14))
  H.result('boss', reached and true or false)
  if not reached then H.wait(120); finish('empty-arena'); return end
  H.result('boss_hp', {u16(boss + 0x182), u16(boss + 0x184)})
  H.shot('arena')

  -- 2. Instant Transmission (L+B) to it, then punches, until it is hurt;
  -- then until its defeat (1B9) hands control back beside the sprite.
  local full = u16(boss + 0x184)
  local function gone() return (u8(boss) & 1) == 0 or u8(boss + 0x180) ~= TROPICALLO end
  local hurt = false
  for _ = 1, 16 do
    if gone() or u16(boss + 0x182) < full then hurt = true; break end
    if idle() then
      H.hold('l b', 3); H.wait(40)
      for _ = 1, 10 do H.hold('b', 2); H.wait(6) end
    else H.wait(30) end
  end
  H.result('boss_hurt', hurt)
  H.result('boss_hp_after', gone() and 0 or u16(boss + 0x182))
  local function done() return map() == 290 and idle() and flag(0x14) >= 4 and actor(SPRITE) end
  local back = false
  for _ = 1, 60 do
    if done() then back = true; break end
    if idle() and not gone() and u16(boss + 0x182) > 0 then
      H.hold('l b', 3); H.wait(40); for _ = 1, 10 do H.hold('b', 2); H.wait(6) end
    else back = mash(120, done); if back then break end end
  end
  H.result('defeated', back and true or false)
  H.result('stage_after', flag(0x14))
  if not back then finish('after-boss'); return end
  H.shot('aftermath')

  -- 3. The sprite asks to be named and joins (41: stage 6); the Elder
  -- explains the palace (CF18 + 1) and sends the party to the village.
  request(0x1D3, actor(SPRITE))
  H.result('named', mash(6000, function() return flag(0x14) >= 6 and idle() end))
  H.result('stage_named', flag(0x14))
  H.result('popoi', u8(0x7EE400) & 1)
  local elder
  H.waitFor(function() elder = idle() and actor(ELDER); return elder end, 300)
  H.result('elder', elder and true or false)
  if not elder then finish('no-elder'); return end
  request(0x1D4, elder)
  H.result('left', mash(4000, function() return map() ~= 290 and idle() end))
  finish('village')
end
