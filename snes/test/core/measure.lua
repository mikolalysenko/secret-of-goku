-- Timing probe (snes/test/core/measure.mjs): scanlines of the main-loop
-- frame end and of the native NMI work per mode, DMA/HDMA channel use and
-- native OAM counts. MEASURE_IMPORT (bundle dir) or a start state selects
-- the scene; MEASURE_FRAMES frames are sampled.
local function line() return emu.getState()['ppu.scanline'] end
local samples = { fieldEnd = {}, fieldNmiEnd = {}, worldEnd = {}, worldNmiEnd = {}, nmiStart = {}, oam = {}, dmaBytes = {} }
local mdmaen, hdmaen, dmaChannels = {}, {}, {}
local frameBytes = 0
local function add(t, v) t[#t + 1] = v end
local function stats(t)
  if #t == 0 then return nil end
  local s = {}
  for i, v in ipairs(t) do s[i] = v end
  table.sort(s)
  local function q(p) return s[math.max(1, math.min(#s, math.floor(p * #s + 0.5)))] end
  return { n = #s, min = s[1], p50 = q(0.5), p90 = q(0.9), max = s[#s] }
end
function test()
  if MEASURE_IMPORT then
    if not H.importSnesJs(MEASURE_IMPORT) then H.result('error_import', MEASURE_IMPORT) return end
  end
  if MEASURE_FASTROM then emu.write(0x420D, 1, emu.memType.snesMemory) end
  H.wait(30)
  local ids = {}
  local function on(kind, lo, hi, fn)
    ids[#ids + 1] = { emu.addMemoryCallback(fn, kind, lo, hi), kind, lo, hi }
  end
  -- Main-loop frame ends (before the original instruction runs).
  on(emu.callbackType.exec, 0x00B073, 0x00B073, function() add(samples.fieldEnd, line()); add(samples.oam, H.r16(0x7C) >> 2) end)
  on(emu.callbackType.exec, 0x008085, 0x008085, function() add(samples.worldEnd, line()) end)
  -- NMI work: field reaches 00:C15F (after core) / world 00:8907.
  on(emu.callbackType.exec, 0x00C0A8, 0x00C0A8, function() add(samples.nmiStart, line()) end)
  on(emu.callbackType.exec, 0x00C15F, 0x00C15F, function() add(samples.fieldNmiEnd, line()) end)
  on(emu.callbackType.exec, 0x008907, 0x008907, function() add(samples.worldNmiEnd, line()) end)
  on(emu.callbackType.write, 0x00420B, 0x00420B, function(addr, value)
    mdmaen[value] = (mdmaen[value] or 0) + 1
    for c = 0, 7 do
      if value & (1 << c) ~= 0 then
        local size = emu.read(0x4305 + c * 16, emu.memType.snesMemory) | (emu.read(0x4306 + c * 16, emu.memType.snesMemory) << 8)
        if size == 0 then size = 0x10000 end
        frameBytes = frameBytes + size
        local bb = emu.read(0x4301 + c * 16, emu.memType.snesMemory)
        local key = 'ch' .. c .. '->21' .. string.format('%02X', bb)
        dmaChannels[key] = (dmaChannels[key] or 0) + 1
      end
    end
  end)
  on(emu.callbackType.write, 0x00420C, 0x00420C, function(addr, value) hdmaen[value] = (hdmaen[value] or 0) + 1 end)
  local frames = MEASURE_FRAMES or 240
  for i = 1, frames do
    frameBytes = 0
    if MEASURE_WALK then
      local p = i % 120
      H.input = p < 30 and { left = true } or p < 60 and { down = true } or p < 90 and { right = true } or { up = true }
    end
    H.wait(1)
    add(samples.dmaBytes, frameBytes)
  end
  H.input = nil
  for _, c in ipairs(ids) do emu.removeMemoryCallback(c[1], c[2], c[3], c[4]) end
  local out = {}
  for k, t in pairs(samples) do out[k] = stats(t) end
  H.result('stats', out)
  local m, h = {}, {}
  for k, v in pairs(mdmaen) do m[string.format('%02X', k)] = v end
  for k, v in pairs(hdmaen) do h[string.format('%02X', k)] = v end
  H.result('mdmaen', m)
  H.result('hdmaen', h)
  H.result('dma_channels', dmaChannels)
  local regs = {}
  for _, r in ipairs({ 'ppu.bgMode', 'ppu.oamMode', 'ppu.oamBaseAddress', 'ppu.oamAddressOffset' }) do regs[r] = emu.getState()[r] end
  H.result('ppu', regs)
  H.result('map', H.r16(0x7E00DC))
  H.result('nmi', string.format('%02X:%02X%02X%02X', H.r8(0x100), H.r8(0x103), H.r8(0x102), H.r8(0x101)))
  H.shot('scene')
end
