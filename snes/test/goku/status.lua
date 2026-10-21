-- Status conditions and palette slots (browser-mod graphics-audit states):
-- poison/ghost tint Goku's colours, petrify uses the native stone shades,
-- moogle and snowman keep the native sprite and palette, sleep and death
-- use the prone cells, pygmy draws the 16x16 miniature, barrel keeps its
-- native overlay, the waterfall substitutes palette 5 instead of 1, and a
-- native flash leaves Goku unflashed in both field and scene cells.
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
  local costs, started, bucket = {}, nil, nil
  emu.addMemoryCallback(function()
    bucket = H.r8(0x7E002A) == 0 and 'idle' or 'flash'
    started = emu.getState().masterClock
  end, emu.callbackType.exec, SYM.goku_preupload, SYM.goku_preupload)
  emu.addMemoryCallback(function()
    if not started then return end
    local cost = (emu.getState().masterClock - started + 36 + 48) / 1364 -- RTL + dispatch JSL
    local v = costs[bucket] or {calls = 0, sum = 0, max = 0}
    v.calls = v.calls + 1; v.sum = v.sum + cost; v.max = math.max(v.max, cost)
    costs[bucket] = v; started = nil
  end, emu.callbackType.exec, SYM.goku_preupload_done, SYM.goku_preupload_done)
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

  -- Airborne water sprites deliberately select palette 1, while their
  -- native body descriptor still selects 5. Check the displayed OAM,
  -- including takeoff and landing; flight's flags describe the next frame.
  local seenAir, badAir = 0, 0
  local probe = emu.addMemoryCallback(function()
    for _, e in ipairs(oam_tiles()) do
      if (e.attr & 1) ~= 0 and ((e.tile >= 0xC0 and e.tile <= 0xC7) or (e.tile >= 0xD0 and e.tile <= 0xD7)) then
        local pal = (e.attr >> 1) & 7
        if pal == 1 then seenAir = seenAir + 1 end
        local want = G.rom_pal(H.r8(G.RAM + 0x48))
        if not G.pal_equal(G.cgram_pal(pal), want, 2) then badAir = badAir + 1 end
      end
    end
  end, emu.callbackType.exec, 0x00B07D, 0x00B07D)
  for _, dir in ipairs({'right', 'left', 'up', 'down'}) do
    H.hold('a ' .. dir, 24)
    H.wait(16)
  end
  emu.removeMemoryCallback(probe, emu.callbackType.exec, 0x00B07D, 0x00B07D)
  G.check(seenAir > 0, 'water flight exercised airborne palette 1')
  G.check(badAir == 0, 'water takeoff/flight/landing palette mismatches: ' .. badAir)

  -- Real arrival flash: sample every displayed frame, including native
  -- lag frames. Goku stays unflashed while BG colours and shared shadows
  -- retain the game's flash. Scene pose requests must not affect this.
  s = case('arrival-research__browser-ghost')
  local slot = H.r8(A.pal_slot)
  local goku = G.rom_pal(H.r8(G.RAM + 0x48))
  G.check(H.r8(0x7E002A) ~= 0 and s.repl == 1, 'flash: native flash active with Goku')
  local flashFrames, sceneFlashes, errors = 0, 0, 0
  for _, scene in ipairs({false, true, false}) do
    H.w16(A.cell_req, scene and H.r16(A.p_cell) + 1 or 0)
    for _ = 1, 24 do
      H.wait(1)
      if H.r8(0x7E002A) ~= 0 then
        flashFrames = flashFrames + 1
        local cg = G.cgram_pal(slot)
        if not G.pal_equal(cg, goku, 2) then errors = errors + 1 end
        local bg = H.cgram(0x22) | (H.cgram(0x23) << 8)
        if bg ~= H.r16(0x7E0622) and cg[1] ~= 0x10A6 then sceneFlashes = sceneFlashes + 1 end
      end
    end
  end
  G.check(flashFrames == 72 and errors == 0, 'flash: every CGRAM body palette unflashed (' .. errors .. '/' .. flashFrames .. ')')
  G.check(sceneFlashes > 0, 'flash: the background and shared shadows still flash')
  H.result('flash', {frames = flashFrames, errors = errors, sceneFlashes = sceneFlashes})
  -- Disabling Goku restores the native flash on the same slot.
  G.off(); H.wait(12)
  G.check(not G.pal_equal(G.cgram_pal(slot), goku, 2), 'flash: inactive Goku leaves native colours')
  H.result('preuploadCost', costs)
  G.check(costs.idle.max <= 0.3, 'flash repair idle cost at most 0.3 scanlines')
  G.check(costs.flash.max <= 2, 'flash repair costs at most 2 scanlines')
  G.finish()
end
