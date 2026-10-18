-- ExHiROM: the generator probe in $40-$7D reads back through the CPU bus;
-- banks 00-3F:8000-FFFF and the upper halves of 40-7D mirror C0-FF; both
-- header copies say ExHiROM; save RAM still answers at $30-$33 and $B0-$B3.
local function hex(v) return string.format('%02X', v) end
function test()
  H.wait(2)
  local sig = 'SECRET OF GOKU XDATA PROBE'
  local got = {}
  for i = 1, #sig do got[i] = string.char(H.r8(XPROBE + i - 1)) end
  check('probe_bank', (XPROBE >> 16) >= 0x40 and (XPROBE >> 16) <= 0x7D and (XPROBE & 0xFFFF) < 0x8000, string.format('%06X', XPROBE))
  check('probe_text', table.concat(got) == sig, table.concat(got))
  check('probe_tail', H.r8(XPROBE + 30) == 0x5A and H.r8(XPROBE + 31) == 0xA5, hex(H.r8(XPROBE + 30)) .. hex(H.r8(XPROBE + 31)))
  check('prg_size', emu.getMemorySize(emu.memType.snesPrgRom) == 0x800000, emu.getMemorySize(emu.memType.snesPrgRom))
  local bad = nil
  for _, b in ipairs({ 0x00, 0x01, 0x02, 0x10, 0x20, 0x2B, 0x3F }) do
    for _, a in ipairs({ 0x8000, 0xB070, 0xC0A8, 0xFFC0, 0xFFFC }) do
      if H.r8(b * 0x10000 + a) ~= H.r8((0xC0 + b) * 0x10000 + a) then bad = string.format('%02X:%04X', b, a) end
    end
  end
  for _, b in ipairs({ 0x40, 0x5F, 0x7D }) do
    for _, a in ipairs({ 0x8000, 0xC000, 0xFFFF }) do
      if H.r8(b * 0x10000 + a) ~= H.r8((b + 0x80) * 0x10000 + a) then bad = string.format('%02X:%04X', b, a) end
    end
  end
  check('mirrors', bad == nil, bad)
  check('map_mode', H.r8(0x00FFD5) == 0x35 and H.r8(0xC0FFD5) == 0x35, hex(H.r8(0x00FFD5)) .. ' ' .. hex(H.r8(0xC0FFD5)))
  check('rom_size', H.r8(0x00FFD7) == 0x0D and H.r8(0x00FFD8) == 0x05, hex(H.r8(0x00FFD7)) .. ' ' .. hex(H.r8(0x00FFD8)))
  local srams = {}
  for p = 0, 3 do emu.write(p * 0x2000 + 0x1FF0, 0xC0 + p, emu.memType.snesSaveRam) end
  for p = 0, 3 do
    local lo, hi = H.r8((0x30 + p) * 0x10000 + 0x7FF0), H.r8((0xB0 + p) * 0x10000 + 0x7FF0)
    if lo ~= 0xC0 + p or hi ~= 0xC0 + p then srams[#srams + 1] = string.format('%d:%02X/%02X', p, lo, hi) end
  end
  check('sram_banks', #srams == 0, table.concat(srams, ' '))
  finish()
end
