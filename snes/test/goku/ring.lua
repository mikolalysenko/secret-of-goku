-- Ring menu: the boy's party marker (bank-1 tiles 0A/0B/1A/1B, palette 1,
-- uploaded by D0:CDF9 when a ring opens) becomes Goku's head in the current
-- form; the girl's and the sprite's markers stay native.
local function romw(a) return H.r8(a) | (H.r8(a + 1) << 8) end
local function marker_bytes_differ(form)
  local bad = 0
  local dst = {0x70A0, 0x70B0, 0x71A0, 0x71B0}
  for k = 0, 3 do
    local t = romw(SYM.goku_portrait_tiles + 16 + form * 8 + k * 2)
    local src = ((0xF8 + (t >> 11)) << 16) | ((t & 0x7FF) << 5)
    for i = 0, 31 do if H.r8(src + i) ~= H.vram(dst[k + 1] * 2 + i) then bad = bad + 1 end end
  end
  return bad
end
-- bytes of native marker i (tiles t, t+1, t+16, t+17 from D2:C680 + i*$80;
-- i = 0..4 for tiles 08, 0A (boy), 0C (girl), 0E (sprite), 20)
local function native_marker_differ(i, t)
  local bad = 0
  for row = 0, 1 do
    for b = 0, 63 do
      if H.r8(0xD2C680 + i * 0x80 + row * 0x40 + b) ~= H.vram((0x7000 + (t + row * 16) * 16) * 2 + b) then bad = bad + 1 end
    end
  end
  return bad
end
-- the boy's marker OBJ: tile 0A, bank 1
local function marker_pos()
  for i = 0, 127 do
    local y, tile, attr = H.oam(i * 4 + 1), H.oam(i * 4 + 2), H.oam(i * 4 + 3)
    if y < 224 and tile == 0x0A and (attr & 1) == 1 then return H.oam(i * 4) .. ',' .. y end
  end
end
-- Open the weapon ring (X) and wait until the marker has stopped moving.
local function open_ring(on, form)
  G.import('barrier-audit__potos-probe')
  if on then G.on() else G.off() end
  H.w8(G.addr.form, form)
  H.wait(10)
  H.tap('x', 6, 0)
  local last, still = nil, 0
  for _ = 1, 120 do
    H.wait(1)
    local p = marker_pos()
    if p and p == last then still = still + 1 else still = 0 end
    last = p
    if still >= 8 then break end
  end
  H.wait(2)
  return still >= 8
end
function test()
  G.check(open_ring(true, 0), 'ring opened with the marker at rest')
  local d = marker_bytes_differ(0)
  G.check(d == 0, 'ring marker is base Goku (' .. d .. ' bytes differ)')
  G.check(native_marker_differ(2, 0x0C) == 0, "the girl's marker stays native")
  G.check(native_marker_differ(3, 0x0E) == 0, "the sprite's marker stays native")
  H.shot('ring_base')
  G.check(open_ring(true, 1), 'ring opened (Super Saiyan)')
  d = marker_bytes_differ(1)
  G.check(d == 0, 'ring marker is Super Saiyan Goku (' .. d .. ' bytes differ)')
  H.shot('ring_ssj')
  -- the native boy keeps his own marker
  G.check(open_ring(false, 0), 'ring opened (native boy)')
  G.check(native_marker_differ(1, 0x0A) == 0, 'native boy marker when Goku is not active')
  H.shot('ring_boy')
  G.finish()
end
