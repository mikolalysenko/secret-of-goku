-- Shared helpers for the FRIEZA module's Mesen tests (snes/test/frieza).
F = F or {}
F.fails = {}
function F.check(cond, msg)
  if not cond then F.fails[#F.fails + 1] = msg; H.log('FAIL', msg) end
  return cond
end
function F.apply(writes)
  for _, w in ipairs(writes) do
    if w[3] == 2 then H.w16(w[1], w[2]) else H.w8(w[1], w[2]) end
  end
end
function F.done()
  H.result('failures', F.fails)
  H.result('pass', #F.fails == 0)
end
-- OAM entries whose tile lies in Frieza's buffers ($0C0-$0FF, table 0).
function F.friezaSprites()
  local out = {}
  for e = 0, 127 do
    local x = H.oam(e * 4)
    local y = H.oam(e * 4 + 1)
    local t = H.oam(e * 4 + 2)
    local a = H.oam(e * 4 + 3)
    local hi = H.oam(512 + (e >> 2))
    local sh = (e & 3) * 2
    local xhi = (hi >> sh) & 1
    local tile = t | ((a & 1) << 8)
    if y ~= 0xE0 and tile >= 0x0C0 and tile < 0x100 then
      local sx = x + xhi * 256
      if sx >= 256 then sx = sx - 512 end
      out[#out + 1] = {slot = e, x = sx, y = y, tile = tile, pal = (a >> 1) & 7, prio = (a >> 4) & 3, flip = (a >> 6) & 1}
    end
  end
  return out
end
-- Bounding box of Frieza's sprites, or nil.
function F.box()
  local s = F.friezaSprites()
  if #s == 0 then return nil end
  local x0, y0, x1, y1 = 999, 999, -999, -999
  for _, p in ipairs(s) do
    x0 = math.min(x0, p.x); y0 = math.min(y0, p.y)
    x1 = math.max(x1, p.x + 16); y1 = math.max(y1, p.y + 16)
  end
  return {x0 = x0, y0 = y0, x1 = x1, y1 = y1, n = #s, pal = s[1].pal}
end
function F.ram(addr) return H.r8(addr) end
function F.ram16(addr) return H.r16(addr) end
