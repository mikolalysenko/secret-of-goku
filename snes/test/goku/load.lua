-- The title's GAME FILE (load) shows Goku's face beside a validated GOKU
-- record (engine/sprite-layer.js savePortrait), from a reset with saved
-- games in SRAM; no state import (see file.lua).
function test()
  G.copy_sram('power-flight-fixes__save-3')  -- slot 0: Goku's record
  emu.reset()
  H.wait(960)
  H.tap('start', 6, 180)                   -- GAME SELECT, GAME FILE preselected
  H.tap('b', 6, 150)
  G.check_faces('load file', {[0] = true})
  G.check(G.pal_equal(G.cgram_pal(1), G.rom_pal(0)), 'load file: palette 1 = base Goku')
  H.shot('load_file')
  G.finish()
end
