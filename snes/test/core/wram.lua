-- WRAM/SRAM claims: no original code may write the ranges the port took over
-- (module blocks 7E:D700-DDFF, core 7E:6E40-6FFF, UI/spare 7E:7E40-7FFF).
-- Runs from power-on through the title, name entry and the whole opening to
-- the waterfall, then imports busy scenes and walks around in each.
local hits = {}
local function watch(lo, hi)
  return emu.addMemoryCallback(function(addr)
    local s = emu.getState()
    local k = s['cpu.k']
    if k >= 0xA0 and k <= 0xAF then return end   -- port code banks
    local key = string.format('%06X<-%02X:%04X', addr, k, s['cpu.pc'])
    hits[key] = (hits[key] or 0) + 1
  end, emu.callbackType.write, lo, hi)
end
local ranges = { { 0x7ED700, 0x7EDDFF }, { 0x7E6E40, 0x7E6FFF }, { 0x7E7E40, 0x7E7FFF } }
-- Added SRAM pages: the game must never read or write them (no SRAM-size
-- or mirroring checks); only $30:6000-7FFF is the game's.
local sram = { { 0x316000, 0x317FFF }, { 0x326000, 0x327FFF }, { 0x336000, 0x337FFF },
  { 0xB16000, 0xB17FFF }, { 0xB26000, 0xB27FFF }, { 0xB36000, 0xB37FFF } }
local function watchRead(lo, hi)
  return emu.addMemoryCallback(function(addr)
    local st = emu.getState()
    local k = st['cpu.k']
    if k >= 0xA0 and k <= 0xAF then return end
    local key = string.format('%06X->%02X:%04X', addr, k, st['cpu.pc'])
    hits[key] = (hits[key] or 0) + 1
  end, emu.callbackType.read, lo, hi)
end
local function walkFor(frames)
  for i = 1, frames do
    local p = i % 160
    H.input = p < 40 and { left = true } or p < 80 and { down = true } or p < 120 and { right = true } or { up = true }
    if H.r8(0x7E00D0) == 0x83 then H.input = { b = true } end
    H.wait(1)
  end
  H.input = nil
end
function test()
  local ids = {}
  for _, r in ipairs(ranges) do ids[#ids + 1] = { watch(r[1], r[2]), r[1], r[2], emu.callbackType.write } end
  for _, r in ipairs(sram) do
    ids[#ids + 1] = { watch(r[1], r[2]), r[1], r[2], emu.callbackType.write }
    ids[#ids + 1] = { watchRead(r[1], r[2]), r[1], r[2], emu.callbackType.read }
  end
  -- Title and NEW GAME.
  H.wait(400)
  for i = 1, 60 do
    if inMenu() then break end
    if i % 3 == 0 then H.tap('start', 4, 4) else H.wait(20) end
  end
  H.wait(40)
  for _ = 1, 6 do                       -- B until a letter is typed
    if H.r8(0x7EA1CC) > 0 then break end
    H.tap('b', 4, 30)
  end
  H.wait(16)
  for _ = 1, 20 do
    if inField() then break end
    H.tap('start', 8, 30)
  end
  -- Opening to the waterfall.
  local reached = false
  for _ = 1, 2600 do
    if H.r8(0x7E00D0) == 0x83 then H.tap('b', 4, 4) else H.wait(4) end
    if idleField() and map() == 128 then reached = true break end
  end
  check('opening_reached_waterfall', reached, map())
  walkFor(240)
  local scenes = { 'emulator-probe__potos-state', 'preset__sandship', 'preset__beast', 'preset__fortress',
    'barrier-audit__bosses__488-0-state', 'preset__flight', 'preset__battle' }
  for _, name in ipairs(scenes) do
    if H.importSnesJs(IMPORT_DIR .. '/' .. name) then
      walkFor(300)
      H.result('scene_' .. name, map())
    else
      H.result('scene_' .. name, 'import failed')
    end
  end
  for _, c in ipairs(ids) do emu.removeMemoryCallback(c[1], c[4], c[2], c[3]) end
  local list = {}
  for k, v in pairs(hits) do list[#list + 1] = k .. ' x' .. v end
  table.sort(list)
  H.result('foreign_writes', list)
  check('no_foreign_writes', #list == 0, table.concat(list, ' '):sub(1, 400))
  finish()
end
