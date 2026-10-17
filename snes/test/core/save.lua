-- Persistence: native GAME FILE saves carry the live block in per-slot
-- sidecars; loading restores it; a damaged/missing sidecar clears it; a new
-- game clears it; saving another slot (which rewrites every slot's native
-- checksum) keeps older sidecars valid.
local function saveTo(slot)
  local r = command(5, { [0x28] = 0x05D8 })   -- save point event: 2A F8 1F 06 02 00
  if r ~= 0 or not H.waitFor(inMenu, 300) then return false end
  H.wait(30)
  for _ = 1, 8 do
    if H.r8(0x7EA211) == slot then break end
    H.tap(H.r8(0x7EA211) < slot and 'down' or 'up', 6, 24)
  end
  if H.r8(0x7EA211) ~= slot then return false end
  local saves = ct(0x34)
  H.tap('b', 6, 60)
  H.tap('b', 6, 60)
  return ct(0x34) == saves + 1 and H.waitFor(function() return inField() and H.r8(0x7E00D0) == 0 end, 600)
end
-- After a reset: Start through the title until the game-select menu runs.
-- With valid saves the menu is $A202 = 0 with $A211 = 1 on GAME FILE
-- (0 = NEW GAME); the file list is $A202 = 2 with $A211 = slot cursor.
local function toGameSelect()
  for i = 1, 60 do
    if inMenu() then break end
    if i % 3 == 0 then H.tap("start", 4, 4) else H.wait(20) end
  end
  if not inMenu() then return false end
  H.wait(40)
  return true
end
local function choose(value)
  for _ = 1, 8 do
    if H.r8(0x7EA211) == value then return true end
    H.tap(H.r8(0x7EA211) < value and "down" or "up", 6, 24)
  end
  return H.r8(0x7EA211) == value
end
local function loadSlot(slot)
  if not toGameSelect() then return false end
  if not choose(1) then return false end
  H.tap("b", 6, 60)
  if H.r8(0x7EA202) ~= 2 or not choose(slot) then return false end
  H.tap("b", 6, 60)
  return H.waitFor(function() return inField() and H.r8(0x7E00D0) == 0 end, 900)
end
local function side(slot, off) return SLOTS + slot * 0x420 + off end
function test()
  H.wait(4)
  check('new_game_version', H.r8(LIVE) == 1, H.r8(LIVE))
  H.w8(LIVE + 0x300, 0xA5); H.w8(LIVE + 0x3FF, 0x5A); H.w16(LIVE + 0x100, 0x1234)
  check('saved_slot0', saveTo(0), 'save failed ' .. nmi())
  check('sidecar0_magic', H.r16(side(0, 0)) == 0x4B47, string.format('%04X', H.r16(side(0, 0))))
  check('sidecar0_copy', H.r8(side(0, 0x20 + 0x300)) == 0xA5 and H.r8(side(0, 0x20 + 0x3FF)) == 0x5A, 'copy mismatch')
  -- A second slot with a different marker; the game rewrites slot 0's checksum.
  H.w8(LIVE + 0x300, 0xB6)
  local sum0 = H.r16(0x306001)
  check('saved_slot1', saveTo(1), 'save failed ' .. nmi())
  H.result('slot0_checksum_rewritten', sum0 ~= H.r16(0x306001))
  -- Keep playing: the live block changes after the saves.
  H.w8(LIVE + 0x300, 0x00); H.w16(LIVE + 0x100, 0x9999)
  resetConsole()
  check('loaded_slot0', loadSlot(0), nmi())
  check('load_hook_ran', ct(0x36) == 1, ct(0x36))
  check('slot0_restored', H.r8(LIVE + 0x300) == 0xA5 and H.r8(LIVE + 0x3FF) == 0x5A and H.r16(LIVE + 0x100) == 0x1234,
    string.format('%02X %02X %04X', H.r8(LIVE + 0x300), H.r8(LIVE + 0x3FF), H.r16(LIVE + 0x100)))
  check('restored_flag', H.r16(CORE + 0x3A) & 1 == 1, H.r16(CORE + 0x3A))
  H.result('map_after_load', map())
  H.shot('loaded')
  resetConsole()
  check('loaded_slot1', loadSlot(1), nmi())
  check('slot1_restored', H.r8(LIVE + 0x300) == 0xB6, string.format('%02X', H.r8(LIVE + 0x300)))
  -- Damaged sidecar (data hash): treated as a legacy save, live cleared.
  H.w8(side(0, 0x20 + 0x10), H.r8(side(0, 0x20 + 0x10)) ~ 0xFF)
  resetConsole()
  check('loaded_damaged', loadSlot(0), nmi())
  check('damaged_cleared', H.r8(LIVE) == 0 and H.r8(LIVE + 0x300) == 0 and H.r16(LIVE + 0x100) == 0,
    string.format('%02X %02X %04X', H.r8(LIVE), H.r8(LIVE + 0x300), H.r16(LIVE + 0x100)))
  check('damaged_flag_clear', H.r16(CORE + 0x3A) & 1 == 0, H.r16(CORE + 0x3A))
  -- New game clears the live block and marks version 1.
  H.w8(LIVE + 0x200, 0x77)
  resetConsole()
  check('game_select', toGameSelect(), nmi())
  check('new_game_selected', choose(0), H.r8(0x7EA211))
  H.tap('b', 6, 60)
  check('new_game_hook', ct(0x38) == 1, ct(0x38))
  check('new_game_cleared', H.r8(LIVE + 0x200) == 0 and H.r8(LIVE) == 1,
    string.format('%02X %02X', H.r8(LIVE + 0x200), H.r8(LIVE)))
  H.shot('new-game')
  finish()
end
