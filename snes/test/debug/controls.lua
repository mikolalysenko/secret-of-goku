-- Scene-select controls from power-on (prelude: DBG_WORK, LATE = preset index):
--  1. a wrong D-pad sequence leaves the title alone and does not open it;
--  2. the code opens it; Y returns to the title, whose Start still reaches
--     the game select with nothing armed;
--  3. a preset can be aborted with Start+Select+L+R (status ABORTED, the
--     game soft-resets to the title as usual).
local W = DBG_WORK
local function menuOpen() return H.r8(W + 0x1D) == 1 end
local function titleRunning() return H.r8(0x104) == 0x5C and H.r8(0x105) == 0x66 and H.r8(0x106) == 0xA2 and H.r8(0x107) == 0x7E end
local function gameSelect() return H.r8(0x101) == 0xA7 and H.r8(0x102) == 0x20 and H.r8(0x103) == 0xC0 end
local function code(seq) for _, b in ipairs(seq) do H.tap(b, 4, 8) end end
local CODE = {'up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'}
function test()
  H.wait(200)
  -- 1. wrong sequences
  code({'up', 'down', 'up', 'down', 'left', 'right', 'left', 'right'})
  code({'up', 'up', 'down', 'down', 'right', 'left', 'right', 'left'})
  H.wait(30)
  H.result('wrong_code_menu', menuOpen())
  H.result('wrong_code_title', titleRunning())
  -- a correct code after a two-second pause in the middle does not count
  code({'up', 'up', 'down', 'down'})
  H.wait(150)
  code({'left', 'right', 'left', 'right'})
  H.wait(30)
  H.result('slow_code_menu', menuOpen())
  -- 2. code, then Y back to the title, then a normal Start
  code(CODE)
  H.result('code_menu', H.waitFor(menuOpen, 60))
  H.wait(20)
  H.tap('y', 4, 4)
  H.result('back_to_title', H.waitFor(function() return not menuOpen() and titleRunning() end, 300))
  H.wait(60)
  H.result('patched_again', H.r8(0x7EA266) == 0x5C)
  H.wait(400)
  H.tap('start', 4, 4)
  H.result('start_game_select', H.waitFor(gameSelect, 300))
  H.result('armed_after_start', H.r16(W) == 0x4244)
  -- 3. abort a running preset: soft reset, then the code again
  emu.reset()
  H.wait(200)
  code(CODE)
  if not H.waitFor(menuOpen, 60) then error('menu did not open after reset') end
  H.wait(20)
  for _ = 1, LATE % 11 do H.tap('down', 4, 8) end
  H.tap('b', 4, 4)
  H.waitFor(function() return H.r16(W) == 0x4244 end, 120)
  H.waitFor(function() return H.r8(W + 3) >= 3 end, 2000)        -- boot script running
  H.result('abort_phase', H.r8(W + 3))
  H.hold('start select l r', 8)
  H.wait(30)
  H.result('abort_status', H.r8(W + 0x0C))
  H.result('abort_title', H.waitFor(titleRunning, 300))
end
