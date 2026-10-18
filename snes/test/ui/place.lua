-- Dialogue window placement (window-placement.js): event $134 (Luka's
-- menu) requested through the story API (test command 15), screenshots once
-- its first page waits for a button. Prelude: BUNDLE (an imported scene) or
-- a savestate (POTOS), NOPLACE (reference run: the ending's ui_hide bit
-- keeps every window native), BACK (switch placement off and on again, then
-- play the scene to its end with B).
local WP = 0xAA
-- Opaque pixels of BG3 rows 1-8 (the native window), 256 x 64, from VRAM:
-- chr base $4000, map $5800.
function window_mask()
  local t = {}
  for y = 0, 63 do
    local row, py = 1 + (y >> 3), y & 7
    for x = 0, 255 do
      local a = (0x5800 + row * 32 + (x >> 3)) * 2
      local e = H.vram(a) | (H.vram(a + 1) << 8)
      local r = (e & 0x8000) ~= 0 and (7 - py) or py
      local b = (0x4000 + (e & 0x3FF) * 8) * 2 + r * 2
      local bit = (e & 0x4000) ~= 0 and (x & 7) or (7 - (x & 7))
      local v = ((H.vram(b) >> bit) & 1) | (((H.vram(b + 1) >> bit) & 1) << 1)
      t[#t + 1] = v ~= 0 and '1' or '0'
    end
  end
  return table.concat(t)
end
-- Boxes of the sprites on screen (x, y, size: small 16, large 32; the
-- reference run's ambient creatures move with the game's RNG).
local function sprite_boxes()
  local t = {}
  for i = 0, 127 do
    local hi = (H.oam(512 + (i >> 2)) >> ((i & 3) * 2)) & 3
    local x = H.oam(i * 4) | ((hi & 1) << 8)
    if x >= 256 then x = x - 512 end
    local y = H.oam(i * 4 + 1)
    if y < 224 or y > 240 then
      if y > 240 then y = y - 256 end
      t[#t + 1] = string.format('%d,%d,%d', x, y, (hi & 2) ~= 0 and 32 or 16)
    end
  end
  return table.concat(t, ' ')
end
local function regs()
  local t = {}
  for _, a in ipairs({0x4300, 0x4301, 0x4302, 0x4303, 0x4304, 0x4307, 0x4310, 0x4311, 0x4312, 0x4313, 0x4314, 0x4317}) do
    t[#t + 1] = string.format('%02X', H.r8(a))
  end
  return table.concat(t, ' ')
end
local function faces()
  local t = {}
  for i = 0, 11 do
    local b = 0x7EE000 + i * 0x200
    if (H.r8(b) & 1) ~= 0 then
      local sx, sy = H.r16(b + 0x20), H.r16(b + 0x22)
      if sx >= 0x8000 then sx = sx - 0x10000 end
      if sy >= 0x8000 then sy = sy - 0x10000 end
      t[#t + 1] = string.format('%d:%d,%d', i, sx, sy - 24)
    end
  end
  return table.concat(t, ' ')
end
-- Per displayed frame: did the scroll channel run (a BG3VOFS write on line
-- 7), and did the vblank before it end late (an HDMAEN write after the
-- frame's HDMA started: no channel can run that frame, native or ours)?
local fs = {vofs = false, late = false}
local hooks = {}
local function hook()
  hooks[#hooks + 1] = {0x2112, emu.addMemoryCallback(function()
    if emu.getState()['ppu.scanline'] == 7 then fs.vofs = true end
  end, emu.callbackType.write, 0x2112, 0x2112)}
  hooks[#hooks + 1] = {0x420C, emu.addMemoryCallback(function()
    if emu.getState()['ppu.scanline'] < 225 then fs.late = true end
  end, emu.callbackType.write, 0x420C, 0x420C)}
end
local function unhook()
  for _, h in ipairs(hooks) do emu.removeMemoryCallback(h[2], emu.callbackType.write, h[1], h[1]) end
  hooks = {}
end
local function shown()
  for a = 0x5820 * 2, (0x5820 + 8 * 32) * 2 - 2, 2 do
    if ((H.vram(a) | (H.vram(a + 1) << 8)) & 0xDFFF) ~= 0 then return true end
  end
  return false
end
-- After one frame: the frame just shown had a window tile on rows 1-8 (the
-- browser's windowPresent) in a scene that goes lower: it must have been
-- scrolled down unless its vblank ran late (the core then starts no new
-- channel; one already running keeps going).
local stats = {shown = 0, moved = 0, late = 0, top = 0}
local function check(i)
  local wp = ui(WP)
  if (wp & 2) ~= 0 and shown() then
    stats.shown = stats.shown + 1
    if fs.vofs then stats.moved = stats.moved + 1
    elseif fs.late then stats.late = stats.late + 1
    else
      stats.top = stats.top + 1
      H.log('top', i, string.format('wp %04X 2C %02X D0 %02X 1D04 %02X regs %s', wp, H.r8(0x7E002C), H.r8(0x7E00D0), H.r8(0x7E1D04), regs()))
    end
  end
  fs.vofs, fs.late = false, false
  return wp
end
function test()
  if POTOS then
    H.wait(2)
    H.w8(0x316001, 1)
    H.w8(0x316040, 0); H.w8(0x316041, 0xff); H.w8(0x316042, 0xff)
    H.wait(10)
  else
    enter(BUNDLE)
  end
  if NOPLACE then setui(0x1C, 0x4000) end
  H.wait(30)                     -- (screenshots settle: they can trail a frame or two)
  H.shot('before')
  local queued = 0
  for _ = 1, 30 do
    queued = command(15, 0x134, 0)
    if queued == 1 then break end
    H.wait(2)
  end
  H.result('queued', queued)
  hook()
  local decided, waits = nil, false
  for i = 1, 600 do
    H.wait(1)
    local wp = check(i)
    if decided == nil and (wp & 1) ~= 0 then decided = i; H.result('faces', faces()) end
    if H.r8(0x7E00D0) == 0x83 then waits = true; break end
  end
  H.result('waits', waits)
  H.result('decided', decided or -1)
  unhook()
  H.wait(30)                     -- the page waits for a button: a still frame
  H.shot('window')
  H.result('objs', sprite_boxes())
  H.result('wp', ui(WP))
  H.result('regs', regs())
  H.result('mask', window_mask())
  if BACK then
    -- the ending's hide bit: the window goes back to its native place and
    -- the game's channel setup comes back
    setui(0x1C, 0x4000)
    H.wait(30)
    H.result('wp_back', ui(WP))
    H.result('regs_back', regs())
    H.shot('back')
    setui(0x1C, 0)
    H.wait(30)
    -- the rest of the scene (pages, Luka's menu, its choice box, closing
    -- windows), B every 40 frames, until the interpreter idles
    hook()
    local idle = 0
    for i = 1, 4000 do
      H.input = (i % 40 < 2) and {b = true} or nil
      H.wait(1)
      check(i)
      if H.r8(0x7E00D0) == 0 then idle = idle + 1 else idle = 0 end
      if idle > 40 then break end
    end
    H.input = nil
    unhook()
    H.result('ended', idle > 40)
    H.wait(40)
    H.result('wp_end', ui(WP))
    H.result('regs_end', regs())
    H.result('c2c_end', H.r8(0x7E002C))
  end
  H.result('shown_frames', stats.shown)
  H.result('moved_frames', stats.moved)
  H.result('late_frames', stats.late)
  H.result('top_frames', stats.top)
  finish()
end
