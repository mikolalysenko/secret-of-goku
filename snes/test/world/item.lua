-- Fly (the renamed Drum, item $27) from the item ring (native-flight.js:
-- Goku flies himself). The waterfall checkpoint is before the sword, so the
-- test opens the rings (story flag CF00, field mode $56 = 2) and gives the
-- item. Y opens the rings, Up selects the item ring, B uses Fly: the drum
-- animation and its sound (C1:DBD2-DC21) are skipped at C1:DBCD, the native
-- takeoff request $0C00|map (C1:DC22) runs, C1:E833 skips the Flammie
-- summon and world flight starts with Goku.
local function idle()
  return W.inField() and H.r8(0x7E00D0) == 0 and H.r8(0x7E00E4) == 1 and H.r8(0x7E00E5) == 1
end
function test()
  H.wait(4)
  W.fresh()
  W.on(1)
  W.check('field_start', H.waitFor(idle, 300), W.nmi())
  H.w8(0x7ECF00, 2)
  H.w8(0x7E0056, 2)
  H.w8(0x7ECC48, 0x27)
  -- the ring code runs in bank $01 (the C1 mirror)
  local drum, request, event, sawE8 = 0, 0, nil, false
  for _, bank in ipairs({ 0x010000, 0xC10000 }) do
    emu.addMemoryCallback(function() drum = drum + 1 end, emu.callbackType.exec, bank + 0xDBD2, bank + 0xDBD2)
    emu.addMemoryCallback(function() request = request + 1 end, emu.callbackType.exec, bank + 0xDC22, bank + 0xDC22)
    emu.addMemoryCallback(function() event = emu.getState()['cpu.a'] end, emu.callbackType.exec, bank + 0xDC2C, bank + 0xDC2C)
  end
  H.tap('y', 4, 40)
  W.check('ring_open', H.r8(0x7E00CC) == 0 and W.inField(), H.r8(0x7E00CC))
  H.tap('up', 4, 70)
  H.shot('item_ring')
  -- the Fly icon (slot 0, tiles $E0/$E1/$F0/$F1): Goku's Super Saiyan hover
  -- cell (column 34, row 0) at half size, drawn with palette 5
  local icon
  for i = 0, 127 do local e = W.oam(i); if W.visible(e) and e.tile == 0x0E0 then icon = e end end
  W.check('fly_icon_palette', icon ~= nil and icon.pal == 5, icon and icon.pal or 'no icon')
  local base = W.romw(SYM.goku_sheet_base + 2)
  local cell = W.romw(SYM.goku_cell_index + (base + 34 * 4) * 2)
  local bad = 0
  for k = 0, 3 do
    local t = W.romw(SYM.goku_cell_mini + cell * 8 + k * 2)
    local src = ((0xF8 + (t >> 11)) << 16) | ((t & 0x7FF) << 5)
    local word = 0x6E00 + (k & 1) * 16 + (k >> 1) * 256
    for b = 0, 31 do if H.vram(word * 2 + b) ~= H.r8(src + b) then bad = bad + 1 end end
  end
  W.check('fly_icon_tiles', bad == 0, bad)
  local t0 = H.frame
  H.tap('b', 4, 1)
  local reached = H.waitFor(function()
    if H.r8(0x7E00E8) == 4 then sawE8 = true end
    return W.inWorld()
  end, 600)
  local dt = H.frame - t0
  H.result('frames_to_world', dt)
  W.check('takeoff_request', request == 1, request)
  W.check('no_drum', drum == 0, drum)
  W.check('event_id', event == 0x0C80, string.format('%04X', event or 0))
  W.check('reached_world', reached, W.nmi())
  W.check('no_summon_phase', not sawE8, 'E8=4 seen')
  W.check('fast_handoff', dt < 160, dt)
  H.waitFor(function() return (H.r16(W.a.flags) & 1) == 1 and H.r16(W.a.frame) > 40 end, 600)
  W.check('goku_in_world', (H.r16(W.a.flags) & 1) == 1 and W.oam(0).size == 1 and W.oam(0).pal == 5, W.oam_dump(0, 8))
  H.shot('world')
  W.finish()
end
