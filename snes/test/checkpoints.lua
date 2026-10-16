-- Plays the original opening from power-on with scripted input and saves
-- stable Mesen checkpoints (see snes/test/checkpoints.mjs). A checkpoint is
-- written only while a main loop of original code waits for vblank, so no
-- cartridge-added code is on the stack and it loads into later builds:
--   name-entry  menu loop (C0:1DEF-1DFD), empty name editor of a NEW GAME
--   waterfall   field loop (00:B079), first moment the hero is controllable
--   potos       field loop, Potos (map 131) reached through the native door
--               event from the waterfall when CP_POTOS_DOOR is set
-- CP_STOP (optional) names the last checkpoint to make.
local results = {}
local function info()
  return {
    frame = H.frame, map = H.r16(0x7E00DC), d0 = H.r8(0x7E00D0),
    x = H.r16(0x7EE002), y = H.r16(0x7EE004),
    nmi = string.format('%02X%02X%02X', H.r8(0x103), H.r8(0x102), H.r8(0x101)),
  }
end
local function writeState(name)
  local f = assert(io.open(H_OUT .. '/' .. name .. '.mss', 'wb'))
  f:write(emu.createSavestate())
  f:close()
end
-- Save at the next execution of an address in [lo, hi].
local function saveAt(name, lo, hi, frames)
  local done = false
  local id = emu.addMemoryCallback(function()
    if not done then
      done = true
      writeState(name)
    end
  end, emu.callbackType.exec, lo, hi)
  for _ = 1, (frames or 120) do
    if done then break end
    coroutine.yield()
  end
  emu.removeMemoryCallback(id, emu.callbackType.exec, lo, hi)
  if done then
    local i = info()
    i.name = name
    results[#results + 1] = i
    H.shot(name)
    H.log('checkpoint', name, 'frame', i.frame, 'map', i.map, 'x', i.x, 'y', i.y)
  end
  return done
end
local function menuNmi() return H.r8(0x100) == 0x5C and H.r8(0x101) == 0xA7 and H.r8(0x102) == 0x20 and H.r8(0x103) == 0xC0 end
local function fieldNmi() return H.r8(0x100) == 0x5C and H.r8(0x101) == 0xA8 and H.r8(0x102) == 0xC0 and H.r8(0x103) == 0x00 end
local function nameLen() return H.r8(0x7EA1CC) end
local function fail(msg)
  H.result('error_step', msg)
  H.result('checkpoints', results)
  error(msg)
end
local function stopAfter(name)
  return CP_STOP ~= nil and CP_STOP == name
end

-- Letter grid cursor: $A159 = $13 + 8 * index (A..Z on one row).
local function typeLetter(ch)
  local target = string.byte(ch) - 65
  for _ = 1, 40 do
    local cur = (H.r8(0x7EA159) - 0x13) // 8
    if cur == target then break end
    H.tap(cur < target and 'right' or 'left', 8, 8)
  end
  if (H.r8(0x7EA159) - 0x13) // 8 ~= target then fail('cursor did not reach ' .. ch) end
  local len = nameLen()
  H.tap('b', 8, 8)
  if not H.waitFor(function() return nameLen() == len + 1 end, 60) then fail('letter ' .. ch .. ' not entered') end
end

function test()
  -- Title: Start until the game-select menu is up.
  H.wait(300)
  for _ = 1, 60 do
    if menuNmi() and H.r8(0x7EA202) == 3 then break end
    H.tap('start', 4, 20)
  end
  if not menuNmi() then fail('game select not reached') end
  H.wait(30)
  -- NEW GAME (default without saves). B opens the editor and types an A.
  H.tap('b', 4, 4)
  if not H.waitFor(function() return nameLen() == 1 end, 120) then fail('name editor not opened') end
  H.wait(8)
  H.tap('y', 8, 8)
  if not H.waitFor(function() return nameLen() == 0 end, 60) then fail('could not clear the name') end
  H.wait(16)
  if not saveAt('name-entry', 0xC01DEF, 0xC01DFE, 120) then fail('name-entry save') end
  if stopAfter('name-entry') then H.result('checkpoints', results) return end

  for ch in string.gmatch(CP_NAME or 'BOY', '.') do typeLetter(ch) end
  H.wait(8)
  H.tap('start', 8, 8)
  if not H.waitFor(fieldNmi, 600) then fail('opening did not start') end

  -- Opening: legend, world fly-over, bridge, fall, waterfall. Confirm text.
  local controllable = false
  for _ = 1, 2400 do
    local d0 = H.r8(0x7E00D0)
    if d0 == 0x83 then
      H.tap('b', 4, 4)
    else
      H.wait(4)
    end
    if fieldNmi() and H.r16(0x7E00DC) == 128 and H.r8(0x7E00D0) == 0
      and H.r8(0x7E00E4) == 1 and H.r8(0x7E00E5) == 1 then
      controllable = true
      break
    end
  end
  if not controllable then fail('waterfall control not reached') end
  H.wait(30)
  if not saveAt('waterfall', 0x00B079, 0x00B079, 120) then fail('waterfall save') end
  if stopAfter('waterfall') then H.result('checkpoints', results) return end

  if CP_POTOS_DOOR then
    -- Native door event (C1:E76D id $0800|door) from the idle field; needs a
    -- CORE_TEST build (core_event_request through the test mailbox).
    H.w16(0x7E6F40 + 0x28, 0x0800 | CP_POTOS_DOOR)
    H.w16(0x7E6F40, 5)
    if not H.waitFor(function() return H.r16(0x7E00DC) == 131 end, 600) then fail('Potos door did not load') end
    for _ = 1, 600 do
      if H.r8(0x7E00D0) == 0x83 then H.tap('b', 4, 4) else H.wait(4) end
      if H.r8(0x7E00D0) == 0 and H.r8(0x7E00E4) == 1 and H.r8(0x7E00E5) == 1 then break end
    end
    H.wait(30)
    if not saveAt('potos', 0x00B079, 0x00B079, 120) then fail('potos save') end
  end
  H.result('checkpoints', results)
end
