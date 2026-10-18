-- goku_api_scripted (a scene draws Goku's own cell at a screen spot, as
-- frieza.js introHero) and goku_api_socket, through the test-build caller
-- in goku_frame (mailbox 7E:7F40, -DGOKU_TRACE). Potos import, Goku idle;
-- a native flash (arrival ghost bundle) for the unflashed colours.
local MB = 0x7E7F40
local function cell(sheet, col, row)
  local base = sheet == 1 and 252 or 0
  return G.romw(SYM.goku_cell_index + (base + col * 4 + row) * 2)
end
-- request(nil) releases: the caller stops calling goku_api_scripted
local function request(c, x, y, prio)
  if c then H.w16(MB + 2, x & 0xFFFF); H.w16(MB + 4, y & 0xFFFF); H.w8(MB + 6, prio or 3) end
  H.w16(MB, c and c + 1 or 0)
end
-- Visible OAM entries with Goku's hero tiles (C0/C2/C4/C6, name table 2)
local function hero_entries()
  local t = {}
  for i = 0, 127 do
    local o = G.oam_entry(i)
    if o.y < 224 and (o.attr & 1) == 1 and o.tile >= 0xC0 and o.tile <= 0xC6 and (o.tile & 1) == 0 then
      o.slot = i; t[#t + 1] = o
    end
  end
  return t
end
local function native()
  return string.format('%04X %04X %02X %02X %04X %04X', H.r16(0x7EE002), H.r16(0x7EE004), H.r8(0x7EE010), H.r8(0x7EE011), H.r16(0x7EE020), H.r16(0x7EE022))
end
-- Goku's cell c drawn as front OBJ with its anchor at (x, y)
local function check_drawn(tag, c, x, y, prio, pal)
  G.check(H.r8(MB + 8) == 1, tag .. ': goku_api_scripted returned C set')
  local mask = H.r8(SYM.goku_cell_mask + c)
  local list = hero_entries()
  local n = 0
  for q = 0, 3 do if (mask >> q) & 1 == 1 then n = n + 1 end end
  G.check(#list == n, string.format('%s: only the scripted %d OBJ show the hero tiles (%d)', tag, n, #list))
  local k = 0
  for q = 0, 3 do
    if (mask >> q) & 1 == 1 then
      local o = G.oam_entry(k)
      local ex, ey = (x - 16 + (q & 1) * 16) & 0x1FF, (y - 31 + (q >> 1) * 16) & 0xFF
      local attr = 1 | (pal << 1) | (prio << 4)
      G.check(o.x == (ex & 0xFF) and (o.hi & 1) == (ex >> 8) and o.y == ey and o.tile == 0xC0 + (q & 1) * 2 + (q >> 1) * 4
        and o.attr == attr and (o.hi & 2) == 0,
        string.format('%s: front slot %d quadrant %d at %d,%d tile %02X attr %02X hi %d (want %d,%d attr %02X)', tag, k, q, o.x, o.y, o.tile, o.attr, o.hi, ex & 0xFF, ey, attr))
      k = k + 1
    end
  end
  G.check(G.vram_matches(c) == 0, tag .. ': the cell is in the hero OBJ tiles')
end
function test()
  local results = {}
  G.import('barrier-audit__potos-probe')
  G.on()
  H.wait(20)
  local before = hero_entries()
  local shadow = G.oam_entry(H.r8(G.RAM + 0x4F))
  G.check(#before >= 2 and shadow.tile == 0x00 and shadow.y < 224, 'field: Goku and his shadow drawn (' .. #before .. ' OBJ)')
  local state0 = native()
  H.shot('field')

  -- the browser's temple / deck follower: knee pose seen from behind
  local hover = cell(0, 38, 3)
  request(hover, 112, 172, 3)
  H.wait(12)
  check_drawn('hover', hover, 112, 172, 3, H.r8(G.addr.pal_slot))
  local still = true
  for i = 0, 127 do
    local o = G.oam_entry(i)
    if o.y == shadow.y and o.x == shadow.x and o.tile == shadow.tile and o.attr == shadow.attr then still = false end
  end
  G.check(still, "hover: actor 0's shadow hidden")
  local hud = 0
  for i = 0, 127 do local o = G.oam_entry(i); if o.y < 224 and o.tile >= 0xE8 and o.tile <= 0xEC then hud = hud + 1 end end
  G.check(hud >= 3, 'hover: the HUD portraits stay (' .. hud .. ')')
  G.check(native() == state0, "hover: actor 0's game state untouched (" .. native() .. ' vs ' .. state0 .. ')')
  G.check(G.pal_equal(G.cgram_pal(H.r8(G.addr.pal_slot)), G.rom_pal(0)), 'hover: Goku colours in his palette slot')
  results.hover = {x = 112, y = 172, column = 38, row = 3}
  H.shot('hover')

  -- following a moving point, priority 1, off the left edge
  request(hover, 40, 120, 1)
  H.wait(2)
  for step = 1, 4 do
    request(hover, 40 - step * 8, 120 + step * 4, 1)
    H.wait(2)
    check_drawn('moving ' .. step, hover, 40 - step * 8, 120 + step * 4, 1, H.r8(G.addr.pal_slot))
  end

  -- Super Saiyan cell, with its palette
  H.w8(G.addr.form, 1)
  local ssj = cell(1, 34, 3)
  request(ssj, 128, 112, 3)
  H.wait(12)
  check_drawn('ssj', ssj, 128, 112, 3, H.r8(G.addr.pal_slot))
  G.check(G.pal_equal(G.cgram_pal(H.r8(G.addr.pal_slot)), G.rom_pal(1)), 'ssj: Super Saiyan colours')
  H.shot('ssj')

  -- release: stop calling; the next frames are the field Goku again
  request(nil)
  H.w8(G.addr.form, 0)
  H.wait(12)
  local after = hero_entries()
  local back = false
  for i = 0, 127 do
    local o = G.oam_entry(i)
    if o.y == shadow.y and o.x == shadow.x and o.tile == shadow.tile then back = true end
  end
  G.check(#after == #before and after[1].x == before[1].x and after[1].y == before[1].y, 'release: Goku back at the native anchor')
  G.check(back, 'release: the shadow is back')
  G.check(native() == state0, "release: actor 0's game state untouched")
  H.shot('released')

  -- Goku inactive: nothing drawn, the boy untouched
  G.off()
  H.wait(8)
  request(hover, 112, 172, 3)
  H.wait(4)
  G.check(H.r8(MB + 8) == 0, 'inactive: goku_api_scripted returns C clear')
  G.check(#hero_entries() >= 1, 'inactive: the native boy is drawn')
  request(nil)

  -- native flash ($2A): the scripted cell keeps the browser's unflashed
  -- colours, as a scene cell; entry 1, every actor's shadow, stays flashed.
  -- The flash rebuilds BE00 every fifth frame here and the scene overruns
  -- some frames: when the NMI falls between a rebuild and goku_frame, that
  -- one frame shows the flashed copy (scene cells alike), so 8 frames are
  -- sampled: at most two such single frames.
  G.import('arrival-research__browser-ghost')
  request(nil); H.w8(MB + 13, 0)
  G.on()
  H.wait(12)
  local slot = H.r8(G.addr.pal_slot)
  local goku = G.rom_pal(H.r8(SYM.goku_cell_pal + hover))
  local function frames()
    local un, runs, shadow, s, prev = 0, 0, true, {}, true
    for _ = 1, 8 do
      H.wait(1)
      local cg = G.cgram_pal(slot)
      local u = G.pal_equal(cg, goku, 2)
      if u then un = un + 1 elseif not prev then runs = runs + 1 end
      if cg[1] == 0x10A6 then shadow = false end
      prev = u
      s[#s + 1] = (u and 'u' or 'f') .. string.format('%04X', cg[2])
    end
    return un, runs, shadow, table.concat(s, ' ')
  end
  G.check(H.r8(0x7E002A) ~= 0, 'flash: native flash active')
  local un, runs, shadow, s = frames()
  G.check(un == 0, 'flash: on the field Goku follows the flash: ' .. s)
  request(hover, 112, 172, 3)
  H.wait(6)
  un, runs, shadow, s = frames()
  G.check(H.r8(MB + 8) == 1 and un >= 6 and runs == 0, 'flash: the scripted cell unflashed in palette ' .. slot .. ': ' .. s)
  G.check(shadow, 'flash: the shadow colour keeps the native flash')
  H.log('flash', 'scripted', s)
  H.shot('flash')
  request(nil)
  H.wait(6)
  un, runs, shadow, s = frames()
  G.check(H.r8(0x7E002A) ~= 0 and un == 0, 'flash: released, Goku follows the flash again: ' .. s)

  -- hand sockets for scenes that place a cell themselves
  local sockets = {}
  for _, q in ipairs({{0, 22, 0}, {0, 22, 2}, {0, 30, 3}, {1, 18, 1}, {1, 26, 0}, {0, 0, 0}, {1, 38, 0}}) do
    H.w8(MB + 10, q[1]); H.w8(MB + 11, q[2]); H.w8(MB + 12, q[3]); H.w8(MB + 13, 1)
    H.wait(2)
    local dx, dy = H.r16(MB + 14), H.r16(MB + 16)
    if dx >= 0x8000 then dx = dx - 0x10000 end
    if dy >= 0x8000 then dy = dy - 0x10000 end
    sockets[#sockets + 1] = {sheet = q[1], column = q[2], row = q[3], c = H.r8(MB + 18), dx = dx, dy = dy}
  end
  results.sockets = sockets
  H.result('scripted', results)
  G.finish()
end
