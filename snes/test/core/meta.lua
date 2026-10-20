-- Meta-sprites (core_oam_meta / _front): pieces at anchor + (dx, dy), tile =
-- base + piece tile, size from the piece, mirror, culling, front staging, and
-- the cost per piece.
local BASE = 0x31C0
local function want(ax, ay, mirror)
  local p = { { 0, 0, 0x00, 0 }, { 16, 0, 0x02, 0 }, { 0, 16, 0x20, 0 }, { 16, 16, 0x22, 0 }, { -32, -8, 0x40, 1 } }
  local out = {}
  for i, q in ipairs(p) do
    local w = q[4] == 1 and 32 or 16
    local dx = mirror and (-q[1] - w) or q[1]
    out[i] = { x = ax + dx, y = ay + q[2], tile = BASE + q[3], size = q[4] }
  end
  return out
end
local function found(list)
  local n, missing = 0, {}
  for i, w in ipairs(list) do
    local slot = findOam(w.x, w.y & 0xFF, w.tile)
    if slot and oamEntry(slot).size == w.size then n = n + 1 else missing[#missing + 1] = i end
  end
  return n, table.concat(missing, ',')
end
local cost = { sum = 0, n = 0, t = nil }
function test()
  H.wait(4)
  emu.addMemoryCallback(function() cost.t = emu.getState().masterClock end, emu.callbackType.exec, META_CALL, META_CALL)
  emu.addMemoryCallback(function()
    if cost.t then cost.sum = cost.sum + (emu.getState().masterClock - cost.t); cost.n = cost.n + 1; cost.t = nil end
  end, emu.callbackType.exec, META_RET, META_RET)
  -- Behind the natives, plain.
  setct(0x52, 120); setct(0x54, 90); setct(0x56, BASE); setct(0x58, 5); setct(0x5A, 0); setct(0x50, 1)
  H.wait(3)
  local n, miss = found(want(120, 90, false))
  check('behind_all_pieces', n == 5, 'missing ' .. miss)
  check('behind_carry_clear', ct(0x5C) == 0, ct(0x5C))
  -- Mirrored.
  setct(0x5A, 1)
  H.wait(3)
  n, miss = found(want(120, 90, true))
  check('mirrored_all_pieces', n == 5, 'missing ' .. miss)
  -- In front of the natives through either hardware rotation or insertion.
  setct(0x5A, 0); setct(0x50, 2)
  H.wait(3)
  local w = want(120, 90, false)
  local slot = findOam(w[1].x, w[1].y, w[1].tile)
  n, miss = found(w)
  check('front_all_pieces', n == 5, 'missing ' .. miss)
  local first = OAM_ROTATED and (H.r8(CORE_SAFE+0x17)&0x7F) or 0
  check('front_in_front', slot ~= nil and slot == first, tostring(slot))
  -- Culling at the top edge: anchor y = -20 -> 16x16 pieces at dy 0 (y + 16 <= 0)
  -- vanish, those at dy 16 (y = -4) stay; the 32x32 at dy -8 (y = -28) stays.
  setct(0x50, 1); setct(0x54, -20 & 0xFFFF)
  H.wait(3)
  local top = want(120, -20, false)
  check('culled_above', findOam(top[1].x, top[1].y & 0xFF, top[1].tile) == nil and findOam(top[2].x, top[2].y & 0xFF, top[2].tile) == nil, 'drawn')
  check('kept_partly_visible', findOam(top[3].x, top[3].y & 0xFF, top[3].tile) ~= nil and findOam(top[5].x, top[5].y & 0xFF, top[5].tile) ~= nil, 'missing')
  setct(0x50, 0)
  H.wait(2)
  H.result('lines_per_call', cost.n > 0 and string.format('%.2f', cost.sum / cost.n / 1364) or 'n/a')
  H.result('lines_per_piece', cost.n > 0 and string.format('%.2f', cost.sum / cost.n / 1364 / 5) or 'n/a')
  finish()
end
