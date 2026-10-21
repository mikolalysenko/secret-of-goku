-- Extended-ROM probe (SNES_LUA_PRELUDE): the upper halves of the second
-- 4 MiB's banks $60-$7D (also visible at $20-$3D:8000-FFFF) hold a copy of
-- $E0-$FD's upper halves that the cartridge reaches only through its fast
-- $A0-$BD mirrors. Before that space takes extended data, every CPU read or
-- instruction fetch there must be accounted for: each one is appended to
-- the file named by XDATA_PROBE_LOG (set by the caller ahead of this text),
-- with the address, the program counter and the test's output folder.
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
for bank = 0x20, 0x3D do
  local lo, hi = bank * 0x10000 + 0x8000, bank * 0x10000 + 0xFFFF
  emu.addMemoryCallback(note('read'), emu.callbackType.read, lo, hi)
  emu.addMemoryCallback(note('exec'), emu.callbackType.exec, lo, hi)
end
for bank = 0x60, 0x7D do
  local lo, hi = bank * 0x10000 + 0x8000, bank * 0x10000 + 0xFFFF
  emu.addMemoryCallback(note('read'), emu.callbackType.read, lo, hi)
  emu.addMemoryCallback(note('exec'), emu.callbackType.exec, lo, hi)
end
