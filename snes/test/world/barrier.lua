-- Mana Tree cloud barrier (world-ki.js 'mana-tree-barrier'): the AF landing
-- patch around the Pure Land entry (takeoff table entry of map 198, radius
-- 44) is a target while $E3 bit 6 is clear. A full Super Saiyan wave that
-- ends on it explodes there, leaves no crater, calls the barrier break (the
-- destroy stream's destroy_tree_barrier_break; local stand-in records the
-- request) and posts the tree-blast message. With $E3 bit 6 set it is not
-- a target any more.
local function idle()
  return W.inField() and H.r8(0x7E00D0) == 0 and H.r8(0x7E00E4) == 1 and H.r8(0x7E00E5) == 1
end
local function interactive()
  return W.inWorld() and H.r8(0x7E00EC) & 0x80 ~= 0 and H.r8(0x7E00FE) == 0 and H.r8(0x7E00F2) & 0x83 == 0
end
function test()
  H.wait(4)
  W.fresh()
  for a = W.PW, W.PW + 0x3F do H.w8(a, 0) end
  W.on(1)
  W.check('field_start', H.waitFor(idle, 300), W.nmi())
  H.hold('l r', 4)
  W.check('world', H.waitFor(interactive, 900), W.nmi())
  H.wait(20)
  -- 320 px south of the barrier, heading north (the Fortress far away)
  local bx = H.r8(0xC67A80 + 198 * 2) * 16
  local by = H.r8(0xC67A81 + 198 * 2) * 16
  H.result('barrier_xy', bx .. ',' .. by)
  H.w8(0x7E00E3, H.r8(0x7E00E3) & 0xBF)
  H.w16(0x7E0128, (bx + 2048) & 0x0FFF)
  H.w16(0x7E00FA, bx)
  H.w16(0x7E00FC, (by + 320) & 0x0FFF)
  H.w16(0x7E00F6, 0)
  H.wait(4)
  H.hold('l y', 50)
  H.wait(1)
  W.check('mega', (H.r16(W.a.shot_flags) & 1) == 1, string.format('%04X', H.r16(W.a.shot_flags)))
  W.check('aimed_barrier', H.r16(W.a.shot_tgt) == 2, string.format('%04X', H.r16(W.a.shot_tgt)))
  H.wait(16)
  W.check('barrier_break', H.r16(W.a.barrier_req) == 1, H.r16(W.a.barrier_req))
  W.check('tree_message', H.r16(W.a.msg) == 3, H.r16(W.a.msg))
  W.check('explosion', H.r16(W.a.expl_age) ~= 0xFFFF, H.r16(W.a.expl_age))
  W.check('no_crater', H.r8(W.PW + 1) == 0, H.r8(W.PW + 1))
  W.check('fortress_intact', (H.r8(W.PW) & 1) == 0, H.r8(W.PW))
  H.shot('barrier_hit')
  -- once open ($E3 bit 6) the barrier is no target: the next wave flies on
  H.waitFor(function() return H.r16(W.a.shot) == 0 and H.r16(W.a.action_age) == 0 end, 200)
  H.w8(0x7E00E3, H.r8(0x7E00E3) | 0x40)
  H.w16(W.a.barrier_req, 0)
  H.wait(30)
  H.hold('l y', 50)
  H.wait(1)
  W.check('open_no_target', H.r16(W.a.shot) ~= 0 and H.r16(W.a.shot_tgt) ~= 2, string.format('%04X', H.r16(W.a.shot_tgt)))
  H.wait(40)
  W.check('open_no_break', H.r16(W.a.barrier_req) == 0, H.r16(W.a.barrier_req))
  W.finish()
end
