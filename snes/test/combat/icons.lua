-- Native icon loader in all twelve inventory positions; rotate the ring,
-- then open a companion's weapons. Same import and inputs as icons.mjs.
local shots = {}
local function capture(name)
  local icons = {}
  for i = 18, 29 do
    local x, y = H.oam(i * 4), H.oam(i * 4 + 1)
    local attr = H.oam(i * 4 + 3)
    icons[#icons + 1] = {slot = i - 18, x = x, y = y, attr = attr,
      tile = H.oam(i * 4 + 2), record = H.r16(0x7E1880 + (i - 18) * 2)}
  end
  H.shot(name)
  shots[#shots + 1] = {name = name, icons = icons, ring = H.r8(0x7E1809)}
end
function test()
  for offset = 0, 11 do
    C.import('graphics-audit__party')
    H.w8(0x316001, 1)
    for i = 0, 11 do H.w8(0x7ECC48 + i, 0x60 | ((i + offset) % 12)) end
    H.wait(12)
    H.tap('x', 4, 60)
    for _ = 1, 4 do
      if H.r8(0x7E1809) == 0 then break end
      H.tap('up', 4, 60)
    end
    C.check(H.r8(0x7E1809) == 0, 'item ring opened')
    capture('items-' .. offset)
    H.tap('right', 4, 60)
    capture('rotated-' .. offset)
  end
  C.import('graphics-audit__party')
  H.w8(0x316001, 1)
  -- Keep the party's equipped-item markers off the bag for its raster
  -- comparison (the browser overlay draws over those native markers).
  H.w8(0x7ECC55, H.r8(0x7ECC55) & 0x3F)
  H.wait(12)
  H.tap('select', 4, 60)
  H.tap('x', 4, 60)
  for _ = 1, 4 do
    if H.r8(0x7E1809) == 3 then break end
    H.tap('up', 4, 60)
  end
  C.check(H.r8(0x7E1809) == 3, 'companion weapon ring opened')
  capture('weapons')
  H.result('shots', shots)
  H.result('failures', C.failures)
end
