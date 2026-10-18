-- Shared helpers for snes/test/core/*.lua (prepended by run.mjs).
-- CORE_TEST builds expose a mailbox at 7E:6F40 (snes/test/core/testmod.asm).
CT = 0x7E6F40
CORE = 0x7ED700
CORE_EXT = 0x7E6E40
CORE_SAFE = 0x317480   -- core state kept in battery RAM (!CORE_SAFE)
LIVE = 0x316000
SLOTS = 0x316400
PAD = { b = 0x8000, y = 0x4000, select = 0x2000, start = 0x1000, up = 0x0800, down = 0x0400,
        left = 0x0200, right = 0x0100, a = 0x0080, x = 0x0040, l = 0x0020, r = 0x0010 }
local failures = 0
function check(name, ok, detail)
  if ok then
    H.result(name, 'pass')
  else
    failures = failures + 1
    H.result(name, 'FAIL ' .. tostring(detail or ''))
  end
  return ok
end
function finish() H.result('failures', failures) end
function ct(off) return H.r16(CT + off) end
function setct(off, v) H.w16(CT + off, v & 0xFFFF) end
-- Run a mailbox command; returns the carry result (0/1) or nil on timeout.
function command(cmd, params)
  for off, v in pairs(params or {}) do setct(off, v) end
  setct(0, cmd)
  if not H.waitFor(function() return ct(0) == 0 end, 120) then return nil end
  return ct(2)
end
-- NMI trampoline at $0100: JML (5C) target, or RTI (40) in the title program.
function nmi() return string.format('%02X:%02X%02X%02X', H.r8(0x100), H.r8(0x103), H.r8(0x102), H.r8(0x101)) end
function inField() return nmi() == '5C:00C0A8' end
function inWorld() return nmi() == '5C:0088CF' end
function inMenu() return nmi() == '5C:C020A7' end
-- Console reset (the Reset button); must run inside a CPU callback.
function resetConsole()
  local done = false
  local id = emu.addMemoryCallback(function()
    if not done then done = true; emu.reset() end
  end, emu.callbackType.exec, 0x000000, 0xFFFFFF)
  for _ = 1, 10 do if done then break end; coroutine.yield() end
  emu.removeMemoryCallback(id, emu.callbackType.exec, 0x000000, 0xFFFFFF)
  H.wait(2)
  return done
end
function map() return H.r16(0x7E00DC) end
function heroX() return H.r16(0x7EE002) end
function heroY() return H.r16(0x7EE004) end
function idleField()
  return inField() and H.r8(0x7E00D0) == 0 and H.r8(0x7E00E4) == 1 and H.r8(0x7E00E5) == 1
end
-- PPU OAM entry i: x (9-bit), y, tile word, size bit.
function oamEntry(i)
  local x = H.oam(i * 4)
  local y = H.oam(i * 4 + 1)
  local tile = H.oam(i * 4 + 2) | (H.oam(i * 4 + 3) << 8)
  local hi = (H.oam(512 + (i >> 2)) >> ((i & 3) * 2)) & 3
  if hi & 1 == 1 then x = x - 256 end
  return { x = x, y = y, tile = tile, size = (hi >> 1) & 1 }
end
function findOam(x, y, tile)
  for i = 0, 127 do
    local e = oamEntry(i)
    if e.x == x and e.y == y and e.tile == tile then return i end
  end
  return nil
end
-- Title -> game select -> GAME FILE slot 1 (cursor already on GAME FILE when
-- a valid save exists). Returns true once the field loop runs again.
function loadSlot1()
  for _ = 1, 80 do
    if inMenu() and H.r8(0x7EA202) == 3 then break end
    H.tap('start', 4, 20)
  end
  if not inMenu() then return false end
  H.wait(30)
  H.tap('b', 6, 60)   -- GAME FILE -> file list
  H.tap('b', 6, 60)   -- slot 1
  return H.waitFor(idleField, 900)
end
