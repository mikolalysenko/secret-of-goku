-- Appended after a Mesen test by `run.mjs --dma-watch`: every DMA start
-- (MDMAEN, $420B) whose channel writes VRAM ($2118/$2119), OAM ($2104) or
-- CGRAM ($2122) while the screen is not force-blanked and the scanline is in
-- the active display, and every HDMA enable ($420C) of a channel that
-- targets VRAM or OAM. Real hardware ignores those VRAM and OAM writes and
-- misplaces CGRAM ones; brightness 0 is not forced blank. Watched banks:
-- $00, $80 and the module code banks $A0-$AF (their I/O mirrors answer
-- STA.w $420B). Module code writes the data ports only through DMA.
local found, seen = {}, {}
local names = { [0x04] = 'OAM', [0x18] = 'VRAM', [0x19] = 'VRAM', [0x22] = 'CGRAM' }
local function note(kind, s, extra)
  local pc = string.format('%02X:%04X', s['cpu.k'], s['cpu.pc'])
  local key = kind .. ' ' .. pc
  if not seen[key] then
    seen[key] = 0
    found[#found + 1] = { kind = kind, pc = pc, frame = H.frame, line = s['ppu.scanline'],
      brightness = s['ppu.screenBrightness'], extra = extra }
  end
  seen[key] = seen[key] + 1
end
local function active(s)
  local last = s['ppu.overscanMode'] and 239 or 224
  return (not s['ppu.forcedBlank']) and s['ppu.scanline'] >= 1 and s['ppu.scanline'] <= last
end
local function chan(ch)
  return emu.read(0x4300 + ch * 16, emu.memType.snesMemory), emu.read(0x4301 + ch * 16, emu.memType.snesMemory)
end
local banks = { 0x00, 0x80 }
for b = 0xA0, 0xAF do banks[#banks + 1] = b end
for _, bank in ipairs(banks) do
  local a = bank << 16
  emu.addMemoryCallback(function(addr, value)
    local s = emu.getState()
    if not active(s) then return end
    for ch = 0, 7 do
      if value & (1 << ch) ~= 0 then
        local ctrl, dest = chan(ch)
        if ctrl & 0x80 == 0 and names[dest] then
          local size = emu.read(0x4305 + ch * 16, emu.memType.snesMemory) | (emu.read(0x4306 + ch * 16, emu.memType.snesMemory) << 8)
          note('dma ' .. names[dest], s, string.format('channel %d, %d bytes', ch, size == 0 and 0x10000 or size))
        end
      end
    end
  end, emu.callbackType.write, a | 0x420B, a | 0x420B)
  emu.addMemoryCallback(function(addr, value)
    local s = emu.getState()
    for ch = 0, 7 do
      if value & (1 << ch) ~= 0 then
        local _, dest = chan(ch)
        if dest == 0x18 or dest == 0x19 or dest == 0x04 then note('hdma ' .. names[dest], s, string.format('channel %d', ch)) end
      end
    end
  end, emu.callbackType.write, a | 0x420C, a | 0x420C)
end
local inner = test
function test()
  inner()
  for _, f in ipairs(found) do f.count = seen[f.kind .. ' ' .. f.pc] end
  H.result('dma_watch', found)
end
