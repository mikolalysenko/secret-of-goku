-- GAME FILE and the save confirmation (engine/sprite-layer.js savePortrait
-- and menuBody): each slot holding a validated GOKU record shows his face,
-- whether or not Goku is active; the confirmation shows Goku in the boy's
-- place. The title's load screen is load.lua. One state import only, and no
-- reset: after a reset or a few imports in one session the imported sound
-- CPU stops answering, and the save dialog waits on it (C3:05D3).
local function face_tiles_differ()
  local bad = 0
  local dst = {0x5C80, 0x5C90, 0x5D80, 0x5D90}
  for k = 0, 3 do
    local t = G.romw(SYM.goku_portrait_tiles + k * 2)
    local src = ((0xF8 + (t >> 11)) << 16) | ((t & 0x7FF) << 5)
    for i = 0, 31 do if H.r8(src + i) ~= H.vram(dst[k + 1] * 2 + i) then bad = bad + 1 end end
  end
  return bad
end
function test()
  local results = {}
  -- GAME FILE when saving in Potos ("Save your game?" -> Yes)
  G.import('power-flight-fixes__save-0')
  G.on()
  G.copy_sram('power-flight-fixes__save-3')
  H.wait(5)
  G.menu_lines_start()
  H.tap('b', 4, 150)
  results.lines = G.menu_lines_stop('file')
  G.check_faces('file', {[0] = true})
  G.check(face_tiles_differ() == 0, 'file: face tiles (base-form HUD portrait) in VRAM table 2 C8/C9/D8/D9')
  G.check(G.pal_equal(G.cgram_pal(1), G.rom_pal(0)), 'file: palette 1 = base Goku')
  results.face = {x = 94, y = G.oam_entry(124).y + 1}
  H.shot('file_goku')
  -- the faces do not depend on Goku being active
  G.off()
  H.wait(4)
  G.check_faces('file (Goku inactive)', {[0] = true})
  G.on()
  -- save confirmation: Goku in the boy's place, Primm and Popoi native
  H.tap('b', 4, 150)
  results.confirm = G.check_figure('confirm', 0)
  local party = true
  for i = 12, 27 do if not G.menu_same(i) then party = false end end
  G.check(party, "confirm: the girl's and the sprite's figures stay native")
  H.shot('confirm_goku')
  -- back to GAME FILE (Y); a record with another name shows no face
  H.tap('y', 4, 120)
  G.check_faces('file again', {[0] = true})
  emu.write(0x0003, 0xA2, emu.memType.snesSaveRam)
  H.wait(4)
  G.check_faces('file (other name)', {})
  emu.write(0x0003, 0xA1, emu.memType.snesSaveRam)
  H.result('file', results)
  G.finish()
end
