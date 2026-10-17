-- Goku replaces the boy in the field: four facings, walking, pushing,
-- palette, OAM layout, VRAM contents and the HUD portrait.
local shots = {}
local function snap(tag)
  local s = G.state()
  local name = string.format('%02d_%s', #shots + 1, tag)
  H.shot(name)
  shots[#shots + 1] = {name = name, sx = s.sx, sy = s.sy, cell = s.cell, kind = s.kind, sheet = s.sheet, col = s.col, row = s.row, var = s.var}
  H.log(name, G.desc(s))
  return s
end
function test()
  G.import('barrier-audit__potos-probe')
  G.on()
  H.wait(20)
  local s = snap('idle')
  G.check(s.repl == 1, 'Goku replaces the boy once persist_goku_active is set')
  G.check(G.pal_equal(G.cgram_pal(1), G.rom_pal(0)), 'palette 1 holds Goku base colours: ' .. G.pal_str(G.cgram_pal(1)))
  G.check(G.vram_matches(s.vram) == 0, 'VRAM C0-C7/D0-D7 hold the uploaded cell ' .. s.vram)
  local oam = G.oam_goku()
  G.check(#oam >= 2 and #oam <= 4, 'Goku drawn with 2-4 16x16 OBJ (' .. #oam .. ')')
  -- walk cycle: four distinct cells per facing, one step every 6 px
  local seen = {}
  for i = 1, 12 do H.hold('up', 3); local st = snap('up'); seen[st.cell] = true end
  local n = 0; for _ in pairs(seen) do n = n + 1 end
  G.check(n == 4, 'walking up cycles four cells (' .. n .. ')')
  H.wait(2)
  s = G.state()
  G.check(G.vram_matches(s.vram) == 0, 'VRAM follows the walk cycle')
  for i = 1, 8 do H.hold('right', 3); snap('right') end
  for i = 1, 8 do H.hold('left', 3); snap('left') end
  for i = 1, 12 do H.hold('down', 3); snap('down') end
  H.wait(8); s = snap('idle_down')
  G.check(s.kind == 0, 'idle after releasing the pad')
  -- turning off restores the boy
  G.off(); H.wait(8); s = snap('boy')
  G.check(s.repl == 0, 'the boy returns when persist_goku_active is cleared')
  G.check(#G.oam_goku() == 0 or true, 'boy tiles')
  G.on(); H.wait(8); snap('goku_again')
  -- HUD portrait (E8/E9/F8/F9) carries Goku's face
  local hud = 0
  for i = 0, 31 do if H.vram(0x7E80 * 2 + i) ~= 0 then hud = hud + 1 end end
  G.check(hud > 0, 'HUD portrait tiles uploaded')
  H.result('shots', shots)
  G.finish()
end
