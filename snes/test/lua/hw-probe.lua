-- Hardware-rule probe (SNES_LUA_PRELUDE; HW_PROBE_LOG names the log file).
-- Emulators forgive what a real SNES does not. Logged, once per kind and
-- writing instruction per test:
--   vram/oam   CPU writes to VMDATA ($2118/$2119) or OAMDATA ($2104) on
--              lines 0-224 with forced blank off (the PPU ignores them or,
--              for OAM, corrupts the address)
--   dma-hdma   a general DMA started ($420B) on lines 0-224 while HDMA
--              channels are enabled (revision-1 S-CPUs can hang)
--   dma-ppu    a general DMA into VRAM/OAM/CGRAM started on lines 0-224
--              with forced blank off
local seen, hdmaen, inidisp = {}, 0, 0x80
local function log(kind, reg, value, extra)
  local st = emu.getState()
  local pc = ((st['cpu.k'] or 0) << 16) | (st['cpu.pc'] or 0)
  local key = kind .. ':' .. pc
  if seen[key] then return end
  seen[key] = true
  local f = io.open(HW_PROBE_LOG, 'a')
  if f then
    f:write(string.format('%s pc=%06X reg=%04X val=%02X line=%d fb=%s %s %s\n', kind, pc, reg, value,
      st['ppu.scanline'] or -1, tostring(st['ppu.forcedBlank']), extra or '', H_OUT or '?'))
    f:close()
  end
end
local function visible()
  local l = emu.getState()['ppu.scanline']
  return l ~= nil and l >= 0 and l <= 224
end
local function ppu(addr, value)
  local reg = addr & 0xFFFF
  if reg == 0x2100 then inidisp = value; return end
  if inidisp & 0x80 ~= 0 or not visible() then return end
  if reg == 0x2118 or reg == 0x2119 then log('vram', reg, value)
  elseif reg == 0x2104 then log('oam', reg, value) end
end
local function dma(addr, value)
  local reg = addr & 0xFFFF
  if reg == 0x420C then hdmaen = value; return end
  if value == 0 or not visible() then return end
  local targets = {}
  for ch = 0, 7 do
    if value & (1 << ch) ~= 0 then
      targets[#targets + 1] = string.format('%02X', emu.read(0x4301 + ch * 16, emu.memType.snesMemory))
    end
  end
  local list = table.concat(targets, '/')
  if hdmaen ~= 0 then log('dma-hdma', reg, value, string.format('hdma=%02X b=%s', hdmaen, list)) end
  if inidisp & 0x80 == 0 then
    for _, t in ipairs(targets) do
      if t == '04' or t == '18' or t == '19' or t == '22' then log('dma-ppu', reg, value, 'b=' .. list); break end
    end
  end
end
for b = 0, 0x3F do
  for _, base in ipairs({b * 0x10000, (b + 0x80) * 0x10000}) do
    -- (CGDATA is left out: the game's HDMA writes it on every line and
    -- the callback cannot tell HDMA from CPU writes)
    emu.addMemoryCallback(ppu, emu.callbackType.write, base + 0x2100, base + 0x2100)
    emu.addMemoryCallback(ppu, emu.callbackType.write, base + 0x2104, base + 0x2104)
    emu.addMemoryCallback(ppu, emu.callbackType.write, base + 0x2118, base + 0x2119)
    emu.addMemoryCallback(dma, emu.callbackType.write, base + 0x420B, base + 0x420C)
  end
end
