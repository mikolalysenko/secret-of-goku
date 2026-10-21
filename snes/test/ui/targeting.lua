-- The cartridge has no scouter switch (cut for resources; the browser keeps
-- it). With Sylphid's powers and an old save whose retired switch bit is
-- on, Goku's configuration ring keeps the native Targeting item: its title
-- is the game's own string, confirming it runs the native option
-- (C0:73F4's dispatch reaches C0:73F9, the switch returned to C0:7275) and
-- leaves the saved flags alone, and no scan, joke or reading follows.
local FLAGS = 0x316380           -- !ui_p_flags (bit 6: the retired switch)
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
function test()
  enter(BUNDLE)
  H.w8(0x7ECFAB, 2)              -- Sylphid's powers (Analyzer)
  H.w8(FLAGS, 0x40)              -- an old save: the retired switch on
  H.wait(10)
  local id = title_hook()
  open_targeting()
  H.result('ring', string.format('%02X %02X %02X', H.r8(0x7E1808), H.r8(0x7E1809), H.r8(0x7E1876)))
  H.result('title', titles[#titles] or '')
  H.wait(20)
  H.shot('title')
  local menu = H.r16(0x7ED724)   -- !core_frame_menu
  local native, kept = 0, 0
  local a = emu.addMemoryCallback(function() native = native + 1 end, emu.callbackType.exec, 0xC073F9, 0xC073F9)
  local b = emu.addMemoryCallback(function() kept = kept + 1 end, emu.callbackType.exec, 0xC07275, 0xC07275)
  H.tap('b', 4, 60)
  emu.removeMemoryCallback(a, emu.callbackType.exec, 0xC073F9, 0xC073F9)
  emu.removeMemoryCallback(b, emu.callbackType.exec, 0xC07275, 0xC07275)
  H.result('native_option', native)
  H.result('ring_resumed', kept)
  H.result('flags_after', H.r8(FLAGS))
  H.result('item_after', string.format('%02X %02X', H.r8(0x7E1809), H.r8(0x7E1876)))
  H.result('menu_frames', (H.r16(0x7ED724) - menu) & 0xFFFF)
  H.shot('confirmed')
  -- leave every menu and give Goku time to act: no scan follows
  for _ = 1, 6 do H.tap('y', 4, 40) end
  local said = 0
  for _ = 1, 240 do
    H.wait(1)
    if ui(0x04) ~= 0 then said = ui(0x04) end
  end
  H.result('said', said)
  H.result('sc', ui(0xAE))
  emu.removeMemoryCallback(id, emu.callbackType.exec, 0xC01935, 0xC01935)
  finish()
end
