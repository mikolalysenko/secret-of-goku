-- Instant Transmission landing table (FLIGHT_TEST build): imports one
-- browser-mod state, saves its WRAM, then asks the cartridge for
-- findLanding() over a grid of targets and origins (mailbox command 4,
-- snes/test/flight/testmod.asm) and writes every query with its answer to
-- landing.json. Globals set by the driver: BUNDLE (import directory).
local MAIL = 0x337AA0
function test()
  H.wait(5)
  assert(H.importSnesJs(BUNDLE), 'import failed')
  H.wait(3)
  H.dumpfile('wram.bin', emu.memType.snesWorkRam, 0, 0x20000)
  local W = math.min(128, H.r16(0x7E00C0) >> 4)
  local Hh = math.min(128, H.r16(0x7E00C2) >> 4)
  local queries = {}
  local k = 0
  for ty = 1, Hh - 2, 3 do
    for tx = 1, W - 2, 3 do
      local x = tx * 16 + 8 + ((tx * 7) % 13) - 6
      local y = ty * 16 + 8 + ((ty * 5) % 9) - 4
      local function add(layer)
        local tile = H.r8(0x7F0000 + layer * 0x4000 + ty * 128 + tx)
        local flags = H.r8(0x7FB800 + layer * 0x400 + tile * 4) & 3
        local terr = ((flags == 1 or flags == 2) and flags or 0) | (layer * 0x80)
        local o = k % 4
        local ox, oy = x, y
        if o == 0 then ox = x - 60 elseif o == 1 then ox = x + 60 elseif o == 2 then oy = y - 50 else oy = y + 50 end
        if ox < 0 then ox = 0 end
        if oy < 0 then oy = 0 end
        queries[#queries + 1] = {x = x, y = y, ox = ox, oy = oy, t = terr, air = (k % 7 == 3) and 1 or 0}
        k = k + 1
      end
      add(0)
      if (tx + ty) % 4 == 0 then add(1) end
    end
  end
  for i = 1, #queries, 8 do
    local n = math.min(8, #queries - i + 1)
    for j = 0, n - 1 do
      local q, b = queries[i + j], MAIL + 0x10 + j * 16
      H.w16(b, q.x); H.w16(b + 2, q.y); H.w16(b + 4, q.ox); H.w16(b + 6, q.oy)
      H.w8(b + 8, q.t); H.w8(b + 9, q.air)
    end
    local done = H.r16(MAIL + 6)
    H.w16(MAIL + 2, n)
    H.w16(MAIL, 4)
    if not H.waitFor(function() return H.r16(MAIL + 6) ~= done end, 600) then error('landing queries timed out at ' .. i) end
    for j = 0, n - 1 do
      local q, b = queries[i + j], MAIL + 0x10 + j * 16
      local f = H.r8(b + 15)
      q.found = (f & 1) == 1
      if q.found then
        q.lx = H.r16(b + 10); q.ly = H.r16(b + 12); q.lt = H.r8(b + 14)
        q.facing = (f >> 1) & 3; q.hover = (f & 8) == 8
      end
    end
  end
  local f = assert(io.open(H_OUT .. '/landing.json', 'w'))
  f:write(H.json(queries))
  f:close()
  H.dumpfile('wram_end.bin', emu.memType.snesWorkRam, 0, 0x20000)
  H.result('queries', #queries)
  H.result('map', H.r16(0x7E00DC))
  H.result('pass', true)
end
