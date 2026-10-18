-- Scouter switch (scouter.js): Sylphid's powers granted ($CFAB = 2), Goku's
-- configuration ring, the Targeting item. Its title is read from the UI
-- bank ("Scouter: OFF" / "Scouter: ON"), B toggles the saved switch without
-- opening the native screen, and once the ring closes the scan says King
-- Kai's joke once. Prelude: SYM (ui_sc_title_off/on addresses).
local FLAGS = 0x316380           -- !ui_p_flags
local titles = {}
local function title_hook()
  return emu.addMemoryCallback(function()
    local s = emu.getState()
    titles[#titles + 1] = string.format('%02X:%04X', s['cpu.dbr'], s['cpu.y'])
  end, emu.callbackType.exec, 0xC01935, 0xC01935)
end
-- X opens the ring last used; down cycles the rings, left rotates items
local function open_targeting()
  H.tap('x', 6, 50)
  for _ = 1, 4 do
    if H.r8(0x7E1809) == 2 then break end
    H.tap('down', 4, 40)
  end
  for _ = 1, 8 do
    if H.r8(0x7E1876) == 1 then break end
    H.tap('left', 4, 40)
  end
end
local function last_title() return titles[#titles] or '' end
function test()
  enter(BUNDLE)
  H.w8(0x7ECFAB, 2)              -- the scouter is owned
  H.wait(10)
  local id = title_hook()
  open_targeting()
  H.result('ring', string.format('%02X %02X %02X', H.r8(0x7E1808), H.r8(0x7E1809), H.r8(0x7E1876)))
  H.result('title_off', last_title())
  H.wait(20)
  H.shot('title_off')
  titles = {}
  H.tap('b', 4, 60)
  H.result('flags_on', H.r8(FLAGS))
  H.result('ring_after', string.format('%02X %02X D0 %02X', H.r8(0x7E1809), H.r8(0x7E1876), H.r8(0x7E00D0)))
  H.result('title_on', last_title())
  H.wait(20)
  H.shot('title_on')
  -- close the ring; the scan waits for Goku to be able to act
  H.tap('y', 4, 90)
  local said = 0
  for _ = 1, 240 do
    H.wait(1)
    if ui(0x04) ~= 0 then said = ui(0x04); break end
  end
  H.result('said', said)
  H.result('form', H.r8(0x7ED740))   -- goku_form: 1 Super Saiyan (the gold joke)
  H.result('weighted', command(17, 0, 0))
  H.result('scans', ui(0xAE) >> 8)
  H.result('jokes', H.r8(FLAGS))
  H.wait(30)
  H.shot('joke')
  -- the second scan (switched off and on again) does not repeat the joke
  open_targeting()
  H.tap('b', 4, 60)
  H.result('flags_off', H.r8(FLAGS))
  H.result('title_back', last_title())
  H.tap('b', 4, 60)
  H.tap('y', 4, 90)
  for _ = 1, 200 do H.wait(1) end
  H.result('scans2', ui(0xAE) >> 8)
  emu.removeMemoryCallback(id, emu.callbackType.exec, 0xC01935, 0xC01935)
  finish()
end
