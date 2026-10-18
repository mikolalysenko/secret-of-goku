-- Full-screen menus (Mode 5) as engine/sprite-layer.js draws them (menuBody):
-- the boy's figure in Status and the Action Grid becomes Goku's front idle
-- cell with its blink, in either form; with Goku inactive the boy stays. The
-- menu's own OAM buffer (7E:9C00) is never changed. GAME FILE and the save
-- confirmation are in file.lua (a fresh emulator: the save dialog of an
-- imported state stops answering after several imports in one session).
-- Field (Potos, the boy in control) -> X: his ring (combat maps the
-- player's X to native Y, as the browser mod; combat.md) -> config ring ->
-- item `rot` (2 Status, 4 Action Grid) -> B. Goku's ring opens on the
-- config ring; the native boy's opens on his weapon ring, one ring above.
-- With Goku inactive the player's Y is the game's own ring button (combat
-- remaps it to ki only while Goku is player 1's character). X would go
-- through combat's remap, which then masks X only after its frame has seen
-- the press: when the game polls the ring button first, the press arrives
-- as native X and opens member 1's ring (one press frame in five; goku.md,
-- Requests). With Goku active X is masked up front.
local function ring_item(rot, on, form)
  G.import('barrier-audit__potos-probe')
  if on then G.on() else G.off() end
  H.w8(G.addr.form, form or 0)
  H.wait(10)
  H.tap(on and 'x' or 'y', 6, 50)
  G.check(H.r8(0x7E1808) == 0, "the boy's ring")
  if not on then H.tap('down', 4, 40) end
  for _ = 1, rot do H.tap('left', 4, 30) end
  H.tap('b', 4, 150)
end
function test()
  local results = {}
  -- Status, base form (vblank use measured from the ring onwards: the first
  -- frames upload both cells)
  G.menu_lines_start()
  ring_item(2, true, 0)
  results.lines = G.menu_lines_stop('status')
  results.status = G.check_figure('status', 0)
  H.shot('status_goku')
  -- the idle blink: 5 frames every 180 (age % 180 in 150..154)
  H.w8(G.MENU.blink_clock, 140)
  local seen, run, best = {}, 0, 0
  for _ = 1, 24 do
    H.wait(1)
    local t = G.oam_entry(120).tile
    seen[#seen + 1] = string.format('%02X', t)
    if t == 0xE0 then run = run + 1; if run > best then best = run end else run = 0 end
  end
  G.check(best == 5, 'status: the blink cell shows for 5 frames (' .. table.concat(seen, ' ') .. ')')
  -- Status, Super Saiyan
  ring_item(2, true, 1)
  results.status_ssj = G.check_figure('status ssj', 1)
  H.shot('status_ssj')
  -- Goku not active: the native boy and his palette
  ring_item(2, false, 0)
  G.check_native('status off')
  H.shot('status_boy')
  -- Action Grid: Goku follows the native figure around the grid
  ring_item(4, true, 0)
  results.grid = G.check_figure('grid', 0)
  H.shot('grid_goku')
  H.tap('left', 6, 40)
  local moved = G.check_figure('grid moved', 0)
  G.check(moved.x ~= results.grid.x or moved.y ~= results.grid.y, 'grid: Goku moved with the native figure')
  H.shot('grid_moved')
  H.result('menu', results)
  G.finish()
end
