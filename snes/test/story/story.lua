-- Story module scenario (see snes/test/story/run.mjs). The prelude defines
-- CASE = {
--   bundle = '<import bundle dir>', writes = {{addr, value, width}, ...},
--   request = {event, actor} or nil, frames = n, mash = k (tap B every k
--   frames, 0 = never), shots = {frame, ...}, resolve = <story_resolve.done PC>,
--   fetch = <story_fetch PC>, before = {{addr, value, width}} (applied right
--   before the request), rom_writes = {{addr, value}} (test-only ROM patches)
-- }
local function u8(a) return emu.read(a, emu.memType.snesMemory) end
local function u16(a) return u8(a) | (u8(a + 1) << 8) end
local trace, reads, events = {}, {}, {}
local function apply(list)
  for _, w in ipairs(list or {}) do
    if w[3] == 2 then H.w16(w[1], w[2]) else H.w8(w[1], w[2]) end
  end
end
local function ranges(set)
  local keys = {}
  for k in pairs(set) do keys[#keys + 1] = k end
  table.sort(keys)
  local out, s, p = {}, nil, nil
  for _, k in ipairs(keys) do
    if s and k == p + 1 then p = k
    else
      if s then out[#out + 1] = {s, p} end
      s, p = k, k
    end
  end
  if s then out[#out + 1] = {s, p} end
  return out
end
function test()
  H.wait(5)
  if CASE.bundle and not H.importSnesJs(CASE.bundle) then H.result('error', 'import failed'); return end
  for _, w in ipairs(CASE.rom_writes or {}) do emu.write(w[1], w[2], emu.memType.snesPrgRom) end
  apply(CASE.writes)
  if CASE.log then
    H.w16(CASE.log, 0)
    for i = 0, 127 do H.w8(CASE.queries + i, 0) end
    for _, q in ipairs(CASE.test_queries or {}) do H.w8(CASE.queries + q[1], q[2]) end
  end
  H.wait(CASE.settle or 4)
  -- every native event resolution: requested id -> first script pointer
  emu.addMemoryCallback(function()
    trace[#trace + 1] = {u16(CASE.ram + 0x78), u8(0xD1) | (u8(0xD2) << 8) | (u8(0xD3) << 16), H.frame}
  end, emu.callbackType.exec, CASE.resolve, CASE.resolve)
  -- every byte the interpreter or text engine reads from compiled scripts
  emu.addMemoryCallback(function(addr) reads[addr] = true end, emu.callbackType.read, 0xF00000, 0xF7FFFF)
  emu.addMemoryCallback(function(addr) reads[addr] = true end, emu.callbackType.read, CASE.water, CASE.water + 0x1FF)
  -- redirect bookkeeping (story_last_event high byte write completes a word)
  emu.addMemoryCallback(function(addr, value)
    -- the callback runs before the byte is stored: use its value
    events[#events + 1] = {u8(CASE.ram) | ((value or 0) << 8), H.frame}
  end, emu.callbackType.write, CASE.ram + 1, CASE.ram + 1)
  apply(CASE.before)
  if CASE.script then
    -- run a raw event stream (e.g. the 3D opcode) from SRAM once idle
    for k, b in ipairs(CASE.script[2]) do H.w8(CASE.script[1] + k - 1, b) end
    H.waitFor(function() return u8(0xD0) == 0 end, 120)
    H.w8(0xD1, CASE.script[1] & 0xFF); H.w8(0xD2, (CASE.script[1] >> 8) & 0xFF); H.w8(0xD3, (CASE.script[1] >> 16) & 0xFF)
    H.w8(0xD0, 1)
  end
  if CASE.request then
    H.w16(CASE.ram + 0x08, CASE.request[1])
    H.w16(CASE.ram + 0x0A, CASE.request[2] or 0)
    if (CASE.request[2] or 0) ~= 0 then
      H.w16(CASE.ram + 0x0C, u16(0x7E00DC))
      H.w16(CASE.ram + 0x0E, u16(0x7EE03E + CASE.request[2]))
    end
    H.w8(CASE.ram + 0x06, 1)
  end
  local shots = {}
  for _, f in ipairs(CASE.shots or {}) do shots[f] = true end
  local timed = {}
  for _, t in ipairs(CASE.timed or {}) do timed[t[1]] = t[2] end
  local snapshots = {}
  local started = H.frame
  for i = 1, CASE.frames do
    if shots[i] then H.shot(string.format('f%04d', i)) end
    if timed[i] then
      local snap = {}
      for _, d in ipairs(CASE.dump or {}) do
        local bytes = {}
        for k = 0, d[2] - 1 do bytes[k + 1] = u8(d[1] + k) end
        snap[#snap + 1] = bytes
      end
      snapshots[#snapshots + 1] = {i, snap}
      apply(timed[i])
    end
    if CASE.hold then H.hold(CASE.hold, 1)
    elseif CASE.mash and CASE.mash > 0 and i % CASE.mash == 0 then H.hold('b', 2) else H.wait(1) end
    if CASE.stop_idle and i > 30 and u8(0xD0) == 0 and u8(CASE.ram + 0x06) == 0 then
      local idle = true
      for _ = 1, 20 do H.wait(1); if u8(0xD0) ~= 0 then idle = false; break end end
      if idle then break end
    end
  end
  H.shot('final')
  H.result('frames_run', H.frame - started)
  H.result('snapshots', snapshots)
  local dumps = {}
  for _, d in ipairs(CASE.dump or {}) do
    local bytes = {}
    for k = 0, d[2] - 1 do bytes[k + 1] = u8(d[1] + k) end
    dumps[#dumps + 1] = bytes
  end
  H.result('dumps', dumps)
  if CASE.log then
    local n, log = u16(CASE.log), {}
    for i = 0, math.min(n, 255) - 1 do
      local a = CASE.log + 2 + i * 6
      log[#log + 1] = {u16(a), u16(a + 2), u16(a + 4)}
    end
    H.result('hooklog', log)
  end
  H.result('trace', trace)
  H.result('events', events)
  H.result('reads', ranges(reads))
  local flags, ram, persist = {}, {}, {}
  for i = 0, 255 do flags[i + 1] = u8(0x7ECF00 + i) end
  for i = 0, 255 do ram[i + 1] = u8(CASE.ram + i) end
  for i = 0, 0xBF do persist[i + 1] = u8(CASE.persist + i) end
  H.result('flags', flags)
  H.result('ram', ram)
  H.result('persist', persist)
  if CASE.dump_water then
    local water = {}
    for i = 0, 0x1FF do water[i + 1] = u8(CASE.water + i) end
    H.result('water', water)
  end
  local party = {}
  for i = 0, 2 do party[i + 1] = u8(0x7EE000 + i * 0x200) end
  H.result('party', party)
  H.result('map', u16(0x7E00DC))
  H.result('d0', u8(0xD0))
  H.result('pointer', u8(0xD1) | (u8(0xD2) << 8) | (u8(0xD3) << 16))
  H.result('core_frame', u16(0x7ED700))
  local st = emu.getState()
  H.result('cpu', {st['cpu.k'] or -1, st['cpu.pc'] or -1})
end
