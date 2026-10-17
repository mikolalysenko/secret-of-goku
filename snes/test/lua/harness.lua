-- Mesen2 test-runner harness. snes/test/mesen.mjs prepends a prelude that sets
-- H_OUT (output directory) and optional H_STATE (savestate file to load),
-- then appends the test body, which must define `function test()`.
-- test() runs as a coroutine resumed once per frame (endFrame).
H = H or {}
H.frame = 0
H.input = nil
local results = {}
local logs = {}
local function esc(s)
  return (tostring(s):gsub('[%c"\\]', function(c)
    if c == '"' then return '\\"' elseif c == '\\' then return '\\\\' end
    return string.format('\\u%04x', string.byte(c))
  end))
end
local function json(v)
  local t = type(v)
  if t == 'table' then
    if #v > 0 or next(v) == nil then
      local parts = {}
      for i = 1, #v do parts[#parts + 1] = json(v[i]) end
      if #parts > 0 or next(v) == nil then return '[' .. table.concat(parts, ',') .. ']' end
    end
    local parts = {}
    for k, val in pairs(v) do parts[#parts + 1] = '"' .. esc(k) .. '":' .. json(val) end
    return '{' .. table.concat(parts, ',') .. '}'
  elseif t == 'number' then return tostring(v)
  elseif t == 'boolean' then return v and 'true' or 'false'
  elseif t == 'nil' then return 'null'
  else return '"' .. esc(v) .. '"' end
end
local function writefile(path, data)
  local f = assert(io.open(path, 'wb'))
  f:write(data)
  f:close()
end
local function readfile(path)
  local f = assert(io.open(path, 'rb'))
  local d = f:read('*a')
  f:close()
  return d
end
H.json = json
function H.log(...)
  local parts = {}
  for i = 1, select('#', ...) do parts[#parts + 1] = tostring(select(i, ...)) end
  logs[#logs + 1] = table.concat(parts, ' ')
end
function H.result(k, v) results[k] = v end
function H.wait(n) for _ = 1, (n or 1) do coroutine.yield() end end
-- Wait until fn() is true or n frames pass; returns true on success.
function H.waitFor(fn, n)
  for _ = 1, (n or 600) do
    if fn() then return true end
    coroutine.yield()
  end
  return fn()
end
-- buttons: table such as {a=true,b=true} or a string "a b up".
local function parseButtons(b)
  if type(b) == 'string' then
    local t = {}
    for w in b:gmatch('%S+') do t[w] = true end
    return t
  end
  return b
end
function H.hold(buttons, n) H.input = parseButtons(buttons); H.wait(n or 1); H.input = nil end
function H.tap(buttons, n, gap) H.hold(buttons, n or 3); H.wait(gap or 3) end
function H.r8(a) return emu.read(a, emu.memType.snesMemory) end
function H.r16(a) return emu.read(a, emu.memType.snesMemory) | (emu.read(a + 1, emu.memType.snesMemory) << 8) end
function H.w8(a, v) emu.write(a, v, emu.memType.snesMemory) end
function H.w16(a, v) emu.write(a, v & 0xff, emu.memType.snesMemory); emu.write(a + 1, (v >> 8) & 0xff, emu.memType.snesMemory) end
function H.wram(a) return emu.read(a & 0x1ffff, emu.memType.snesWorkRam) end
function H.vram(a) return emu.read(a, emu.memType.snesVideoRam) end
function H.cgram(a) return emu.read(a, emu.memType.snesCgRam) end
function H.oam(a) return emu.read(a, emu.memType.snesSpriteRam) end
function H.sram(a) return emu.read(a, emu.memType.snesSaveRam) end
function H.dump(memtype, start, len)
  local t = {}
  for i = 0, len - 1 do t[#t + 1] = string.char(emu.read(start + i, memtype)) end
  return table.concat(t)
end
function H.dumpfile(name, memtype, start, len) writefile(H_OUT .. '/' .. name, H.dump(memtype, start, len)) end
function H.shot(name)
  writefile(H_OUT .. '/' .. name .. '.png', emu.takeScreenshot())
  H.log('shot', name, H.frame)
end
-- Savestates can only be created/loaded inside an exec memory callback, so
-- both arm a one-shot callback and finish on the next executed instruction.
local function onNextInstruction(fn, lo, hi)
  lo = lo or 0x000000
  hi = hi or 0xFFFFFF
  local done = false
  local id
  id = emu.addMemoryCallback(function()
    if not done then
      done = true
      fn()
    end
  end, emu.callbackType.exec, lo, hi)
  while not done do coroutine.yield() end
  emu.removeMemoryCallback(id, emu.callbackType.exec, lo, hi)
end
function H.save(name)
  onNextInstruction(function() writefile(H_OUT .. '/' .. name .. '.mss', emu.createSavestate()) end)
end
-- Portable checkpoint: saved while the field main loop waits for NMI
-- (00:B079, original code that never moves), so it loads into later builds.
-- Waits up to `frames` frames for the field loop; returns false if not reached.
function H.saveStable(name, frames)
  local done = false
  local id = emu.addMemoryCallback(function()
    if not done then
      done = true
      writefile(H_OUT .. '/' .. name .. '.mss', emu.createSavestate())
    end
  end, emu.callbackType.exec, 0x000000, 0xFFFFFF)
  for _ = 1, (frames or 600) do
    if done then break end
    coroutine.yield()
  end
  emu.removeMemoryCallback(id, emu.callbackType.exec, 0x000000, 0xFFFFFF)
  return done
end
function H.load(path)
  local data = readfile(path)
  onNextInstruction(function() emu.loadSavestate(data) end)
end
function H.state() return emu.getState() end
-- Import a bundle written by snes/tools/snesjs-export.mjs (a browser-mod
-- savestate advanced to an NMI wait loop). Applied at the next executed
-- instruction of the running cartridge: memory, PPU/DMA/IRQ registers, the
-- CPU context including PC/K/SP and the SPC state are all replaced.
local function blit(path, memtype, limit)
  local data = readfile(path)
  local n = #data
  if limit and n > limit then n = limit end
  for i = 1, n do emu.write(i - 1, string.byte(data, i), memtype) end
  return n
end
function H.importSnesJs(dir, frames)
  local regs = dofile(dir .. '/regs.lua')
  local done = false
  local id = emu.addMemoryCallback(function()
    if done then return end
    -- Apply on the scanline the state was captured at, so frame-phase
    -- sensitive scenes (IRQ splits, 30 Hz loops) resume in step.
    if regs.line and emu.getState()['ppu.scanline'] ~= regs.line then return end
    done = true
    blit(dir .. '/wram.bin', emu.memType.snesWorkRam)
    blit(dir .. '/vram.bin', emu.memType.snesVideoRam)
    blit(dir .. '/cgram.bin', emu.memType.snesCgRam)
    blit(dir .. '/oam.bin', emu.memType.snesSpriteRam)
    blit(dir .. '/sram.bin', emu.memType.snesSaveRam, 0x2000)
    blit(dir .. '/aram.bin', emu.memType.spcRam)
    blit(dir .. '/dsp.bin', emu.memType.spcDspRegisters)
    for _, w in ipairs(regs.ppu) do emu.write(w[1], w[2], emu.memType.snesMemory) end
    for _, w in ipairs(regs.io) do emu.write(w[1], w[2], emu.memType.snesMemory) end
    local st = {}
    st['cpu.a'] = regs.cpu.a; st['cpu.x'] = regs.cpu.x; st['cpu.y'] = regs.cpu.y
    st['cpu.sp'] = regs.cpu.sp; st['cpu.d'] = regs.cpu.d; st['cpu.dbr'] = regs.cpu.dbr; st['cpu.ps'] = regs.cpu.ps
    st['cpu.pc'] = regs.cpu.pc; st['cpu.k'] = regs.cpu.k; st['cpu.emulationMode'] = regs.cpu.e
    local sp = regs.spc
    st['spc.a'] = sp.a; st['spc.x'] = sp.x; st['spc.y'] = sp.y; st['spc.sp'] = sp.sp; st['spc.pc'] = sp.pc; st['spc.ps'] = sp.ps
    st['spc.dspReg'] = sp.dspAdr; st['spc.romEnabled'] = sp.romReadable
    for i = 0, 3 do
      st['spc.cpuRegs[' .. i .. ']'] = sp.cpuToApu[i + 1]
      st['spc.outputReg[' .. i .. ']'] = sp.apuToCpu[i + 1]
    end
    for i = 0, 2 do
      local t = sp.timers[i + 1]
      st['spc.timer' .. i .. '.enabled'] = t.enabled
      st['spc.timer' .. i .. '.target'] = t.target
      st['spc.timer' .. i .. '.stage1'] = t.stage1
      st['spc.timer' .. i .. '.output'] = t.output
    end
    emu.setState(st)
    -- Browser states carry pointers into the browser's own, dynamically
    -- allocated story banks (F0-F7). The cartridge's compiled events use a
    -- different layout, so an idle text pointer ($1D01-$1D03, read every
    -- frame at C0:01AD) could land mid-sentence and redraw stale text each
    -- frame. When no window is open ($A170 = 0) and the pointer targets
    -- printable text, point it at F0:0000, which the story banks keep zero.
    local bank = emu.read(0x1D03, emu.memType.snesWorkRam)
    if bank >= 0xF0 and bank <= 0xF7 and emu.read(0xA170, emu.memType.snesWorkRam) == 0 then
      local ptr = (bank << 16) | emu.read(0x1D01, emu.memType.snesWorkRam) | (emu.read(0x1D02, emu.memType.snesWorkRam) << 8)
      if emu.read(ptr, emu.memType.snesMemory) >= 0x50 then
        emu.write(0x1D01, 0, emu.memType.snesWorkRam)
        emu.write(0x1D02, 0, emu.memType.snesWorkRam)
        emu.write(0x1D03, 0xF0, emu.memType.snesWorkRam)
      end
    end
  end, emu.callbackType.exec, 0x000000, 0xFFFFFF)
  for _ = 1, (frames or 600) do
    if done then break end
    coroutine.yield()
  end
  emu.removeMemoryCallback(id, emu.callbackType.exec, 0x000000, 0xFFFFFF)
  return done
end
function H.finish(code)
  results.frames = H.frame
  results.log = logs
  writefile(H_OUT .. '/results.json', json(results))
  emu.stop(code or 0)
end
local co
emu.addEventCallback(function()
  if H.input then emu.setInput(H.input, 0) end
end, emu.eventType.inputPolled)
emu.addEventCallback(function()
  H.frame = H.frame + 1
  if not co then
    co = coroutine.create(function()
      if H_STATE then H.load(H_STATE) end
      test()
      H.finish(0)
    end)
  end
  if coroutine.status(co) == 'dead' then return end
  local ok, err = coroutine.resume(co)
  if not ok then
    results.error = tostring(err)
    H.finish(2)
  end
end, emu.eventType.endFrame)
