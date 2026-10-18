-- Terrain classification dump (FLIGHT_TEST build): imports one browser-mod
-- state, saves its WRAM, then asks the cartridge to classify every tile of
-- both layers (snes/test/flight/testmod.asm) and writes one byte per tile to
-- rows.bin (layer 0 rows, then layer 1 rows; 128 bytes per row). WRAM is
-- saved again at the end so the driver can verify that the map did not
-- change while the rows were classified. Globals set by the driver:
-- BUNDLE (import directory).
local MAIL = 0x337AA0
local function r16(a) return H.r16(a) end
function test()
  H.wait(5)
  assert(H.importSnesJs(BUNDLE), 'import failed')
  H.wait(3)
  H.dumpfile('wram.bin', emu.memType.snesWorkRam, 0, 0x20000)
  local out = {}
  local W, Hh = 0, 0
  for layer = 0, 1 do
    local row = 0
    while true do
      local done = r16(MAIL + 6)
      H.w16(MAIL + 2, layer)
      H.w16(MAIL + 4, row)
      H.w16(MAIL + 0, 1)
      local ok = H.waitFor(function() return r16(MAIL + 6) ~= done end, 600)
      if not ok then error('classification timed out at layer ' .. layer .. ' row ' .. row) end
      W = r16(MAIL + 8); Hh = r16(MAIL + 10)
      local bytes = {}
      for x = 0, 127 do
        bytes[#bytes + 1] = string.char(x < W and H.r8(MAIL + 0x10 + x) or 0)
      end
      out[#out + 1] = table.concat(bytes)
      row = row + 1
      if row >= Hh then break end
    end
  end
  local f = assert(io.open(H_OUT .. '/rows.bin', 'wb'))
  f:write(table.concat(out))
  f:close()
  H.dumpfile('wram_end.bin', emu.memType.snesWorkRam, 0, 0x20000)
  H.result('width', W)
  H.result('height', Hh)
  H.result('map', H.r16(0x7E00DC))
  H.result('pass', true)
end
