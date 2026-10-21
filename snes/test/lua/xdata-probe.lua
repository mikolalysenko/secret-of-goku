-- Extended-ROM probe (SNES_LUA_PRELUDE): the upper halves of the second
-- 4 MiB's banks $60-$7D (also visible at $20-$3D:8000-FFFF) held a copy of
-- $E0-$FD's upper halves that the cartridge reaches only through its fast
-- $A0-$BD mirrors; the build places extended data there once the lower
-- halves are full. Every CPU read or instruction fetch there (Mesen reports
-- DMA and HDMA reads the same way, at the interrupted instruction) is
-- appended to the file named by XDATA_PROBE_LOG (set by the caller ahead of
-- this text), with the address, the program counter and the test's output
-- folder. Reads of the blobs placed there, through $60-$7D, are left out:
-- XDATA_ASM (optional) names the build's dist/snes/gen/xdata.asm, whose
-- !XDATA_<NAME> and !XDATA_<NAME>_SIZE lines give them.
local probeLog = XDATA_PROBE_LOG
local seen = 0
local function note(kind)
  return function(address)
    if seen >= 20 then return end
    seen = seen + 1
    local st = emu.getState()
    local f = io.open(probeLog, 'a')
    if f then
      f:write(string.format('%s %06X pc=%02X:%04X %s\n', kind, address,
        st['cpu.k'] or 0, st['cpu.pc'] or 0, H_OUT or '?'))
      f:close()
    end
  end
end
-- placed blobs in the upper halves of $60-$7D, by bank: { {lo, hi}, ... }
local placed = {}
if XDATA_ASM then
  local f = io.open(XDATA_ASM, 'r')
  if f then
    local addr, size = {}, {}
    for line in f:lines() do
      local n, v = line:match('^!XDATA_([%w_]+)_SIZE = (%d+)')
      if n then
        size[n] = tonumber(v)
      else
        n, v = line:match('^!XDATA_([%w_]+) = %$(%x+)')
        if n then addr[n] = tonumber(v, 16) end
      end
    end
    f:close()
    for n, a in pairs(addr) do
      local bank, off = a >> 16, a & 0xFFFF
      if size[n] and size[n] > 0 and bank >= 0x60 and bank <= 0x7D and off >= 0x8000 then
        placed[bank] = placed[bank] or {}
        table.insert(placed[bank], { off, off + size[n] - 1 })
      end
    end
  end
end
local function watch(bank, lo, hi)
  emu.addMemoryCallback(note('read'), emu.callbackType.read, bank * 0x10000 + lo, bank * 0x10000 + hi)
  emu.addMemoryCallback(note('exec'), emu.callbackType.exec, bank * 0x10000 + lo, bank * 0x10000 + hi)
end
for bank = 0x20, 0x3D do watch(bank, 0x8000, 0xFFFF) end
for bank = 0x60, 0x7D do
  local blobs = placed[bank] or {}
  table.sort(blobs, function(a, b) return a[1] < b[1] end)
  local at = 0x8000
  for _, r in ipairs(blobs) do
    if r[1] > at then watch(bank, at, r[1] - 1) end
    if r[2] + 1 > at then at = r[2] + 1 end
  end
  if at <= 0xFFFF then watch(bank, at, 0xFFFF) end
end
