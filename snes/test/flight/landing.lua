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
  -- the ceiling escape's roof colours from the same palette (command 5),
  -- with the 128 colours it read
  local done = H.r16(MAIL + 6)
  local base = (H.r8(0x7E002A) ~= 0) and 0x7EBE00 or 0x7E0600
  local pal = {}
  for i = 0, 127 do pal[#pal + 1] = H.r16(base + i * 2) end
  H.w16(MAIL, 5)
  if not H.waitFor(function() return H.r16(MAIL + 6) ~= done end, 60) then error('roof colours timed out') end
  -- the palette must not have changed meanwhile (animated palettes)
  local same = true
  for i = 0, 127 do if H.r16(base + i * 2) ~= pal[i + 1] then same = false end end
  local r = assert(io.open(H_OUT .. '/roof.json', 'w'))
  r:write(H.json({palette = pal, stone = H.r16(MAIL + 2), highlight = H.r16(MAIL + 4), stable = same}))
  r:close()
  -- opening exits (maps 128-131): every position on a 4-px grid around each
  -- exit with each of the 8 unit directions at speeds 1, 6 and 8
  local exits = {}
  if EXITS then
    local map = H.r16(0x7E00DC)
    for _, e in ipairs(EXITS) do
      if e.map == map then
        for y = e.y * 16 - 48, e.y * 16 + 63, 4 do
          for x = e.x * 16 - 48, e.x * 16 + e.n * 16 + 47, 4 do
            for _, v in ipairs({{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {-1, -1}, {6, 0}, {0, 6}, {-6, 0}, {0, -6}, {8, 8}, {-8, 8}}) do
              if x >= 0 and y >= 0 then
                local function sm(n) if n < 0 then return 0x80 | -n end return n end
                exits[#exits + 1] = {x = x, y = y, vx = v[1], vy = v[2], vel = sm(v[1]) | (sm(v[2]) << 8)}
              end
            end
          end
        end
      end
    end
    for i = 1, #exits, 16 do
      local n = math.min(16, #exits - i + 1)
      for j = 0, n - 1 do
        local q, b = exits[i + j], MAIL + 0x10 + j * 8
        H.w16(b, q.x); H.w16(b + 2, q.y); H.w16(b + 4, q.vel)
      end
      local done2 = H.r16(MAIL + 6)
      H.w16(MAIL + 2, n)
      H.w16(MAIL, 6)
      if not H.waitFor(function() return H.r16(MAIL + 6) ~= done2 end, 600) then error('exit queries timed out') end
      for j = 0, n - 1 do
        local q = exits[i + j]
        local v = H.r16(MAIL + 0x10 + j * 8 + 6)
        q.exit = (v == 0xFFFF) and -1 or v
      end
    end
  end
  -- sweeps (the step's swept footprints) from a grid of starts in eight
  -- directions at flight speeds, each from a hero grid anchored at the start
  local sweeps = {}
  local DIRS = {{8, 0}, {-8, 0}, {0, 8}, {0, -8}, {6, 6}, {-6, 6}, {6, -6}, {-6, -6}, {7, 0}, {0, -7}, {3, 8}, {-8, 2}}
  local k2 = 0
  for ty = 1, Hh - 2, 3 do
    for tx = 1, W - 2, 3 do
      local x = tx * 16 + ((tx * 5) % 16)
      local y = ty * 16 + ((ty * 7) % 16)
      for _, d in ipairs(DIRS) do
        local layer = ((k2 % 5) == 4) and 1 or 0
        k2 = k2 + 1
        sweeps[#sweeps + 1] = {x = x, y = y, dx = d[1], dy = d[2], l = layer}
      end
    end
  end
  for i = 1, #sweeps, 16 do
    local n = math.min(16, #sweeps - i + 1)
    for j = 0, n - 1 do
      local q, b = sweeps[i + j], MAIL + 0x10 + j * 8
      H.w16(b, q.x); H.w16(b + 2, q.y); H.w8(b + 4, q.dx & 0xFF); H.w8(b + 5, q.dy & 0xFF); H.w8(b + 6, q.l)
    end
    local done3 = H.r16(MAIL + 6)
    H.w16(MAIL + 2, n)
    H.w16(MAIL, 7)
    if not H.waitFor(function() return H.r16(MAIL + 6) ~= done3 end, 600) then error('sweep queries timed out') end
    for j = 0, n - 1 do sweeps[i + j].pass = H.r8(MAIL + 0x10 + j * 8 + 7) == 1 end
  end
  local fs = assert(io.open(H_OUT .. '/sweeps.json', 'w'))
  fs:write(H.json(sweeps))
  fs:close()
  -- the canLand services other modules call (!FLIGHT_API_CAN_LAND and _T,
  -- command 8): points off the tile centres, both layers, every terrain,
  -- every fifth one at Goku's own terrain byte
  local lands = {}
  local k3 = 0
  for ty = 1, Hh - 2, 3 do
    for tx = 1, W - 2, 3 do
      local x = tx * 16 + ((tx * 3 + ty) % 16)
      local y = ty * 16 + ((ty * 11 + tx) % 16)
      for _, t in ipairs({0, 1, 2, 3, 0x80, 0x82}) do
        if t < 0x80 or (tx + ty) % 2 == 0 then
          lands[#lands + 1] = {x = x, y = y, t = t, own = (k3 % 5 == 2) and 1 or 0}
          k3 = k3 + 1
        end
      end
    end
  end
  local own = H.r8(0x7EE00B)
  for i = 1, #lands, 12 do
    local n = math.min(12, #lands - i + 1)
    for j = 0, n - 1 do
      local q, b = lands[i + j], MAIL + 0x10 + j * 8
      H.w16(b, q.x); H.w16(b + 2, q.y); H.w8(b + 4, q.t); H.w8(b + 5, q.own)
    end
    local done4 = H.r16(MAIL + 6)
    H.w16(MAIL + 2, n)
    H.w16(MAIL, 8)
    if not H.waitFor(function() return H.r16(MAIL + 6) ~= done4 end, 600) then error('canLand service queries timed out') end
    for j = 0, n - 1 do
      local q, b = lands[i + j], MAIL + 0x10 + j * 8
      q.pass = H.r8(b + 6) == 1
      q.intact = H.r8(b + 7) == 1
      if q.own == 1 then q.t = own end
    end
  end
  local fl = assert(io.open(H_OUT .. '/apiland.json', 'w'))
  fl:write(H.json(lands))
  fl:close()
  -- a walk (command 9): settle()'s on-foot canLand and canFly at the hero
  -- along rows and columns in steps of a few pixels, so the hero grid
  -- moves one cell at a time and keeps the cells it shares
  local walk = {}
  local function step(x, y, layer)
    local tile = H.r8(0x7F0000 + layer * 0x4000 + (y >> 4) * 128 + (x >> 4))
    local flags = H.r8(0x7FB800 + layer * 0x400 + tile * 4) & 3
    walk[#walk + 1] = {x = x, y = y, t = ((flags == 1 or flags == 2) and flags or 0) | (layer * 0x80)}
  end
  for ty = 2, Hh - 3, 7 do
    local layer = ((ty // 7) % 3 == 2) and 1 or 0
    local y0 = ty * 16 + 8
    if (ty // 7) % 2 == 0 then
      for x = 16, W * 16 - 16, 6 do step(x, y0 + ((x // 6) % 7) - 3, layer) end
    else
      for x = W * 16 - 16, 16, -6 do step(x, y0 + ((x // 6) % 7) - 3, layer) end
    end
  end
  for tx = 3, W - 4, 11 do
    for y = 16, Hh * 16 - 16, 5 do step(tx * 16 + 8 + ((y // 5) % 5) - 2, y, 0) end
  end
  for i = 1, #walk, 12 do
    local n = math.min(12, #walk - i + 1)
    for j = 0, n - 1 do
      local q, b = walk[i + j], MAIL + 0x10 + j * 8
      H.w16(b, q.x); H.w16(b + 2, q.y); H.w8(b + 4, q.t)
    end
    local done5 = H.r16(MAIL + 6)
    H.w16(MAIL + 2, n)
    H.w16(MAIL, 9)
    if not H.waitFor(function() return H.r16(MAIL + 6) ~= done5 end, 600) then error('walk queries timed out') end
    for j = 0, n - 1 do
      local v = H.r8(MAIL + 0x10 + j * 8 + 6)
      walk[i + j].land = (v & 1) == 1
      walk[i + j].fly = (v & 2) == 2
    end
  end
  local fw = assert(io.open(H_OUT .. '/walk.json', 'w'))
  fw:write(H.json(walk))
  fw:close()
  local fe = assert(io.open(H_OUT .. '/exits.json', 'w'))
  fe:write(H.json(exits))
  fe:close()
  H.dumpfile('wram_end.bin', emu.memType.snesWorkRam, 0, 0x20000)
  H.result('queries', #queries)
  H.result('map', H.r16(0x7E00DC))
  H.result('pass', true)
end
