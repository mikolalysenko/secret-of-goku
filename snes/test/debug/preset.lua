-- Starts one scene-select preset from power-on, exactly as a player would:
-- the title code (Up Up Down Down Left Right Left Right), the cursor, B.
-- Then follows the debug module's autopilot to the end of the preset's
-- recipe and records the resulting state and screenshots.
-- Prelude (run.mjs): DBG_WORK (SRAM work address), PRESET (index),
-- MAXF (frame limit), SHOTS (frames after the end to screenshot).
local W = DBG_WORK
local function hexdump(addr, n)
  local t = {}
  for i = 0, n - 1 do t[#t + 1] = string.format('%02X', H.r8(addr + i)) end
  return table.concat(t)
end
local function phase() return H.r8(W + 3) end
local function status() return H.r8(W + 0x0C) end
function test()
  -- The title program runs from frame ~10; the code works on the logo too.
  H.wait(200)
  for _, b in ipairs({'up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'}) do H.tap(b, 4, 8) end
  if not H.waitFor(function() return H.r8(W + 0x1D) == 1 end, 60) then error('scene select did not open') end
  H.wait(10)
  H.shot('menu')
  -- The menu opens on the last launched preset (!dbg_last in battery RAM,
  -- whatever a fresh battery holds when its $A5 mark happens to match), so
  -- steer from where the cursor actually is: columns of 11, Right switches
  -- column, Down wraps inside it.
  local function cursor() return H.r8(W + 0x18) end
  H.result('cursor_start', cursor())
  if (cursor() >= 11) ~= (PRESET >= 11) then H.tap('right', 4, 8) end
  for _ = 1, 11 do
    if cursor() == PRESET then break end
    H.tap('down', 4, 8)
  end
  if cursor() ~= PRESET then error(string.format('scene select cursor %d, wanted %d', cursor(), PRESET)) end
  H.result('cursor', cursor())
  H.shot('menu-cursor')
  H.tap('b', 4, 4)
  -- The launch waits for the release and fades out, then arms the autopilot
  -- (the work area holds whatever the battery held until then).
  if not H.waitFor(function() return H.r16(W) == 0x4244 end, 120) then error('preset not armed') end
  local trace = {}
  local lastPh, lastPc = -1, -1
  local started = H.frame
  local selects = {}
  for i = 1, MAXF do
    H.wait(1)
    -- game select cursor ($A211: 1 GAME FILE, 0 NEW GAME) while the menu runs
    if phase() == 1 and H.r8(0x101) == 0xA7 and H.r8(0x7EA202) == 0 and #selects < 8 then
      local c = H.r8(0x7EA211)
      if selects[#selects] ~= c then selects[#selects + 1] = c end
    end
    local ph, pc = phase(), H.r16(W + 4)
    if ph ~= lastPh or pc ~= lastPc then
      if #trace < 400 then
        trace[#trace + 1] = string.format('f%d ph%d pc%04X map%d d0%02X', H.frame - started, ph, pc, H.r16(0x7E00DC), H.r8(0x7E00D0))
      end
      lastPh, lastPc = ph, pc
    end
    if status() ~= 1 then break end
  end
  H.result('trace', trace)
  H.result('select_cursor', selects)
  H.result('status', status())
  H.result('error', H.r8(W + 0x0D))
  H.result('err_pc', H.r16(W + 0x0E))
  H.result('frames', H.r16(W + 0x0A))
  H.result('boot_frame', H.r16(W + 0x36))
  H.result('marks', H.r16(W + 0x10))
  H.result('newgame', H.r8(W + 0x38))
  H.result('soft', H.r16(W + 0x3A))
  H.result('soft_pc', H.r16(W + 0x3C))
  H.result('wall_frames', H.frame - started)
  -- State at the browser's capture point.
  local s = {}
  s.map = H.r16(0x7E00DC)
  s.d0 = H.r8(0x7E00D0)
  s.ptr = string.format('%02X:%04X', H.r8(0x7E00D3), H.r16(0x7E00D1))
  s.mode = H.r16(0x7ED720)
  s.nmi = string.format('%02X%02X%02X', H.r8(0x103), H.r8(0x102), H.r8(0x101))
  s.flags = hexdump(0x7ECF00, 256)
  s.names = hexdump(0x7ECC00, 48)
  s.items = hexdump(0x7ECC48, 24)
  s.persist = hexdump(0x316000, 0x60)
  s.title_arrival = H.r8(0x316300)
  s.goku_form = H.r8(0x7ED740)
  s.party = {}
  for i = 0, 2 do
    local b = 0x7EE000 + i * 0x200
    s.party[#s.party + 1] = {active = H.r8(b) & 1, x = H.r16(b + 2), y = H.r16(b + 4), species = H.r8(b + 0x180),
      level = H.r8(b + 0x181), hp = H.r16(b + 0x182), maxhp = H.r16(b + 0x184), status = H.r16(b + 0x190)}
  end
  s.world = {fa = H.r16(0x7E00FA), fc = H.r16(0x7E00FC), f6 = H.r16(0x7E00F6), f8 = H.r8(0x7E00F8)}
  H.result('state', s)
  H.dumpfile('sram-saves.bin', emu.memType.snesSaveRam, 0, 0x2000)
  H.result('hooklog', hexdump(W + 0x100, 0x100))   -- test builds (-DDEBUG_TEST)
  H.shot('frame-00000')
  local at = 0
  for _, f in ipairs(SHOTS or {}) do
    H.wait(f - at)
    at = f
    H.shot(string.format('frame-%05d', f))
  end
end
