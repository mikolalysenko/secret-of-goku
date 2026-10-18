-- Every OBJ kind at fixed screen points in Potos, with screenshots at a few
-- ages. Screen coordinates (FX_F_SCREEN) keep the pictures comparable.
-- Waits count FX frames (F.waitFx), so lagging frames do not shift ages.
local S = F.F.SCREEN
local function shot(name, s)
  s = s or F.stats()
  H.log(name, F.statstr(s))
  F.shotAfter(name)
  return s
end
function test()
  F.clear()
  if not F.import('barrier-audit__potos-probe') then return F.finish() end
  F.gokuOn()
  H.wait(20)
  local gx, gy, sx, sy = F.goku()
  H.log('goku map', gx, gy, 'screen', sx, sy)

  -- Four compact impact sparks (one assembly each), plain and gold.
  F.spawn(0, F.K.IMPACT, S, F.DIR.right, 60, 60)
  F.spawn(1, F.K.IMPACT, S, F.DIR.down, 100, 60)
  F.spawn(2, F.K.IMPACT, S | F.F.GOLD, F.DIR.left, 140, 60)
  F.spawn(3, F.K.IMPACT, S | F.F.GOLD, F.DIR.up, 180, 60)
  local s = shot('impact_age2', F.waitFx(2))
  F.check('impact_sprites', s.sprites >= 4, F.statstr(s))
  F.check('regions_claimed', s.regions == 7, F.statstr(s))
  shot('impact_age5', F.waitFx(3))
  s = F.waitFx(8)
  shot('impact_gone', s)
  F.check('impact_expires', s.sprites == 0, F.statstr(s))

  -- Charge orb frames 0-4 (continuous draws), plain / gold / pink.
  for f = 0, 4 do F.draw(f, F.K.ORB, S, 1, 40 + f * 40, 100, f) end
  s = F.waitFx(3)
  -- Five different cold-cache cells may span a native five-phase upload
  -- cycle. Wait for residency; all five must appear, without relaxing the
  -- actual sprite-count assertion below.
  for i=1,5 do if s.sprites==5 then break end s=F.waitFx(1) end
  s = shot('orb_frames', s)
  F.check('orb_sprites', s.sprites == 5, F.statstr(s))
  for f = 0, 4 do F.draw(f, F.K.ORB, S | F.F.GOLD, 1, 40 + f * 40, 100, f) end
  shot('orb_gold', F.waitFx(3))
  for f = 0, 4 do F.draw(f, F.K.ORB, S | F.F.PINK, 1, 40 + f * 40, 100, f) end
  shot('orb_pink', F.waitFx(3))
  for f = 0, 4 do F.stop(f) end
  F.waitFx(2)

  -- Ki shots in four directions, plain and gold.
  F.spawn(0, F.K.KI, S, F.DIR.right, 40, 40)
  F.spawn(1, F.K.KI, S, F.DIR.down, 128, 30)
  F.spawn(2, F.K.KI, S | F.F.GOLD, F.DIR.left, 220, 150)
  F.spawn(3, F.K.KI, S | F.F.GOLD, F.DIR.up, 60, 180)
  shot('ki_age1', F.waitFx(2))
  shot('ki_age5', F.waitFx(4))
  shot('ki_age12', F.waitFx(7))
  s = F.waitFx(12)
  shot('ki_gone', s)
  F.check('ki_expires', s.sprites == 0, F.statstr(s))

  -- Transformation ring (gold) and the blue variant.
  F.spawn(0, F.K.BURST, S | F.F.GOLD, 0, 80, 100)
  F.spawn(1, F.K.BURST, S, 0, 190, 100)
  s = F.waitFx(2)
  -- Both cold-cache rings may need the next streaming phase.
  local burstMin=FX_DETAIL and 40 or 20
  for i=1,5 do if s.sprites>=burstMin then break end s=F.waitFx(1) end
  s = shot('burst_ready', s)
  F.check('burst_sprites',s.sprites>=burstMin and (FX_DETAIL or s.sprites<=24),F.statstr(s))
  shot('burst_age4', F.waitFx(3))
  shot('burst_age9', F.waitFx(5))
  F.waitFx(6)

  -- Exploder burst frames (four turns) and embers.
  F.spawn(0, F.K.EXPLODE, S, 0, 50, 80)
  F.spawn(1, F.K.EXPLODE, S, 1, 110, 80)
  F.spawn(2, F.K.EXPLODE, S, 2, 170, 80)
  F.spawn(3, F.K.EXPLODE, S, 3, 230, 80)
  for i = 0, 3 do F.spawn(4 + i, F.K.EMBER, S, i * 2, 128, 160) end
  shot('explode_age1', F.waitFx(2))
  shot('explode_age12', F.waitFx(11))
  shot('explode_age24', F.waitFx(12))
  F.waitFx(20)

  -- Status bursts: fire, ice, balloon, plain gold.
  F.style(1); F.spawn(0, F.K.STATUS, S, 0, 50, 110)
  F.style(2); F.spawn(1, F.K.STATUS, S, 0, 110, 110)
  F.style(3); F.spawn(2, F.K.STATUS, S, 0, 170, 110)
  F.style(0); F.spawn(3, F.K.STATUS, S | F.F.GOLD, 0, 220, 110)
  shot('status_age1', F.waitFx(2))
  shot('status_age5', F.waitFx(4))
  shot('status_age15', F.waitFx(10))
  F.waitFx(16)

  -- Death Balls (16 / 32), discs (tilts), finger glints, sparks ring.
  for f = 0, 2 do F.draw(f, F.K.DEATHBALL, S, 0, 40 + f * 30, 60, 16, 0, 0, f * 4) end
  F.draw(3, F.K.DEATHBALL, S, 0, 150, 60, 32, 0, 0, 0)
  F.draw(4, F.K.DISC, S, 0, 60, 120, 0, 0, 0, 0)
  F.draw(5, F.K.DISC, S, 0, 120, 120, 0, 0, 0, 8)
  F.draw(6, F.K.FINGER, S, 0, 180, 120, 0, 0, 0, 0)
  shot('frieza_bits', F.waitFx(3))
  for i = 0, 7 do F.stop(i) end
  F.spawn(0, F.K.SPARKS, S, 0, 128, 100)
  shot('sparks_age1', F.waitFx(2))
  shot('sparks_age6', F.waitFx(5))
  F.waitFx(8)

  -- Super Saiyan charge lightning: three bolts of Thunderbolt cells around
  -- a charge point, clock held (the same bolts while the phase stays).
  F.drawHold(0, F.K.LIGHTNING, S, 0, 128, 100, 3, 0, 0, 30)
  s = F.waitFx(4)
  F.check('lightning_cells', s.sprites >= 6, F.statstr(s))
  shot('lightning', s)
  F.drawHold(0, F.K.LIGHTNING, S, 0, 128, 100, 2, 0, 0, 33)
  local s2 = F.waitFx(4)
  F.check('lightning_two_bolts', s2.sprites >= 3 and s2.sprites < s.sprites + 6, F.statstr(s2))
  shot('lightning_next', s2)
  F.stop(0)
  F.waitFx(3)

  -- Native cells through FX_CELL: lightning (three frames) and gold arcs in
  -- quarter turns.
  for f = 0, 2 do F.draw(f, F.K.CELL, S, 0, 40 + f * 30, 60, 4, f) end
  for t = 0, 3 do F.draw(3 + t, F.K.CELL, S, t, 40 + t * 30, 120, 7, 0) end
  shot('cells', F.waitFx(3))
  for i = 0, 7 do F.stop(i) end
  s = F.waitFx(3)
  F.check('idle_after_gallery', s.sprites == 0, F.statstr(s))
  F.finish()
end
