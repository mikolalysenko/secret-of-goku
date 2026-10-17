-- Pad 1 filter: mask hides held buttons from the game, inject adds buttons.
local function walk(buttons, n)
  local x, y = heroX(), heroY()
  if buttons then H.hold(buttons, n) else H.wait(n) end
  H.wait(8)
  return heroX() - x, heroY() - y
end
function test()
  H.wait(4)
  -- Baseline: physical left/right move the hero.
  local dxl = walk('left', 30)
  local dxr = walk('right', 30)
  check('baseline_moves', dxl < 0 and dxr > 0, dxl .. ' ' .. dxr)
  -- Mask right: holding right does nothing; core still sees it physically.
  setct(0x04, PAD.right)
  H.wait(2)
  local seenPhysical, seenGame = false, false
  local x0 = heroX()
  H.input = { right = true }
  for _ = 1, 30 do
    H.wait(1)
    if H.r16(CORE + 0x02) & PAD.right ~= 0 then seenPhysical = true end
    if H.r16(CORE_EXT + 0x46) & PAD.right ~= 0 then seenGame = true end
  end
  H.input = nil
  H.wait(8)
  check('mask_blocks_move', heroX() == x0, heroX() - x0)
  check('core_pad_physical', seenPhysical, 'core_pad never had right')
  check('game_did_not_see', not seenGame, 'core_pad_seen had right')
  setct(0x04, 0)
  H.wait(2)
  -- Inject left with no physical input.
  setct(0x06, PAD.left)
  local dxi = walk(nil, 30)
  setct(0x06, 0)
  H.wait(4)
  check('inject_moves', dxi < 0, dxi)
  check('inject_not_physical', H.r16(CORE + 0x02) & PAD.left == 0, H.r16(CORE + 0x02))
  -- Requests expire: nothing is applied after the module stops asking.
  local dxs = walk(nil, 20)
  check('no_stale_inject', dxs == 0, dxs)
  local dxr2 = walk('right', 20)
  check('no_stale_mask', dxr2 > 0, dxr2)
  finish()
end
