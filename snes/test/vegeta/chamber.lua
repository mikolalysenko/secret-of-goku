-- Time Chamber: enter map 72 through door 304 and check the BG data the
-- module installed during the native load, then walk to scroll the view.
function test()
  H.wait(5)
  H.importSnesJs(V.IMPORT .. '/graphics-audit__party')
  H.wait(20)
  V.gokuActive(true)
  H.w8(0x7ECF3F, 5)          -- trial stage without the native Doppelganger records
  V.door(0x304)
  local ok = H.waitFor(function() return V.map() == 72 and H.r16(0x7E00C0) == 1024 end, 600)
  H.result('loaded', ok)
  H.wait(150)
  -- Dialogue of the walk-on event (3DB): advance it.
  V.finishEvent(1500)
  H.wait(30)
  H.result('event_done', H.r8(0x7E00D0) == 0)
  H.dumpfile('vram.bin', emu.memType.snesVideoRam, 0, 0x10000)
  H.dumpfile('cgram.bin', emu.memType.snesCgRam, 0, 0x200)
  H.dumpfile('wram.bin', emu.memType.snesWorkRam, 0, 0x20000)
  V.dumpView('view0')
  -- Into the pavilion's front wall (the steps lead up to the doorway).
  local x0, y0 = V.hero()
  H.hold('up', 90)
  local x1, y1 = V.hero()
  H.result('north', {x0, y0, x1, y1})
  V.dumpView('view1')
  -- East across the floor: the camera scrolls and BG2 streams new columns.
  H.hold('right', 200)
  H.hold('down', 120)
  V.dumpView('view2')
  H.dumpfile('wram2.bin', emu.memType.snesWorkRam, 0, 0x20000)
  -- To the east border wall.
  H.hold('right', 400)
  local x3, y3 = V.hero()
  H.result('east', {x3, y3})
  V.dumpView('view3')
  H.dumpfile('wram3.bin', emu.memType.snesWorkRam, 0, 0x20000)
end
