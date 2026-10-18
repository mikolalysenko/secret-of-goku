-- Status conditions and palette slots (browser-mod graphics-audit states):
-- poison/ghost tint Goku's colours, petrify uses the native stone shades,
-- moogle and snowman keep the native sprite and palette, sleep and death
-- use the prone cells, pygmy draws the 16x16 miniature, barrel keeps its
-- native overlay, the waterfall substitutes palette 5 instead of 1, and a
-- native flash leaves Goku's colours unflashed.
local A = G.addr
local function set(t) local s = {} for _, v in ipairs(t) do s[v] = true end return s end
local function case(name, frames)
  G.import(name)
  G.on()
  H.wait(frames or 12)
  local s = G.state()
  H.shot(name)
  H.log(name, G.desc(s), 'pal1', G.pal_str(G.cgram_pal(1)))
  return s
end
local function oam_tiles()
  local t = {}
  for i = 0, 127 do
    local y = H.oam(i * 4 + 1)
    if y < 224 then t[#t + 1] = {tile = H.oam(i * 4 + 2), attr = H.oam(i * 4 + 3), x = H.oam(i * 4), y = y} end
  end
  return t
end
function test()
  local base = G.rom_pal(0)
  local s = case('graphics-audit__status__normal')
  G.check(s.repl == 1 and G.pal_equal(G.cgram_pal(1), base), 'normal: base palette')

  s = case('graphics-audit__status__poison')
  local p = G.cgram_pal(1)
  G.check(s.repl == 1, 'poison: Goku shown')
  G.check(not G.pal_equal(p, base), 'poison: tinted palette')
  G.check(p[1] == 0x10A6, 'poison: shadow colour kept')

  s = case('graphics-audit__status__petrify')
  p = G.cgram_pal(1)
  local stone = set({0x1D09, 0x7FFF, 0x739D, 0x5AD7, 0x4211, 0x294B, 0x3AAB})
  local allStone = true
  for i = 1, 15 do if not stone[p[i]] then allStone = false end end
  G.check(s.repl == 1 and allStone, 'petrify: Goku in the native stone shades: ' .. G.pal_str(p))

  s = case('graphics-audit__status__dead')
  G.check(s.repl == 1 and s.kind == 0x0A, 'ghost: dead pose')
  G.check(not G.pal_equal(G.cgram_pal(1), base), 'ghost: tinted palette')

  s = case('graphics-audit__status__moogle')
  G.check(s.repl == 0, 'moogle: native sprite kept')
  G.check(G.cgram_pal(1)[2] == 0x50B6, 'moogle: native palette kept')

  s = case('graphics-audit__status__snowman')
  G.check(s.repl == 0, 'snowman: native sprite kept')
  G.check(G.cgram_pal(1)[1] == 0x3128, 'snowman: native palette kept')

  s = case('graphics-audit__status__shrink')
  G.check(s.repl == 1 and s.kind == 0x0B, 'sleep: prone sleeping pose')

  s = case('effects-research__pygmy-walking-state')
  G.check(s.repl == 1 and (s.flags & 2) == 2, 'pygmy: miniature flag')
  local n = 0
  for _, e in ipairs(oam_tiles()) do if e.tile >= 0xC0 and e.tile <= 0xC6 and (e.attr & 1) == 1 then n = n + 1 end end
  G.check(n == 1, 'pygmy: one 16x16 OBJ (' .. n .. ')')
  G.check(H.r8(A.vram_small) == 1, 'pygmy: miniature tiles in VRAM')

  s = case('effects-research__barrel-walking-state')
  local barrel = 0
  for _, e in ipairs(oam_tiles()) do if e.tile >= 0x44 and e.tile <= 0x4E and (e.attr & 1) == 1 then barrel = barrel + 1 end end
  G.check(s.repl == 1 and barrel > 0, 'barrel: native overlay kept over Goku (' .. barrel .. ')')

  s = case('danger-progress__waterfall')
  G.check(H.r8(A.pal_slot) == 5, 'waterfall: palette slot 5 tracked')
  G.check(G.pal_equal(G.cgram_pal(5), base), 'waterfall: Goku colours in palette 5')
  G.check(G.cgram_pal(1)[1] == 0x7FFF, 'waterfall: the map palette 1 untouched')

  -- native flash ($2A: CGRAM from 7E:BE00, rebuilt with an offset every
  -- frame): Goku stays unflashed as in the browser; entry 1, every actor's
  -- shadow, keeps the flash
  s = case('arrival-research__browser-ghost')
  local slot = H.r8(A.pal_slot)
  local cg = G.cgram_pal(slot)
  G.check(H.r8(0x7E002A) ~= 0 and s.repl == 1, 'flash: native flash active with Goku')
  G.check(G.pal_equal(cg, G.rom_pal(H.r8(G.RAM + 0x48)), 2), 'flash: Goku colours 2-15 unflashed in palette ' .. slot .. ': ' .. G.pal_str(cg))
  G.check(cg[1] ~= 0x10A6, 'flash: the shadow colour keeps the native flash')
  G.finish()
end
