-- Debris in Potos: rubble chunks and ceiling dust in caller colours (DYN
-- palette), the brazier burst (three Exploder bursts), and destroy's
-- effect records (SRAM $33:77F8, docs/agents/snes-port/destroy.md) turned
-- into rubble in the room's own shades and brazier bursts.
local S = F.F.SCREEN
local DREC = 0x3377F8
local function shot(name, s)
  s = s or F.stats()
  H.log(name, F.statstr(s))
  F.grab(name)
  F.shotAfter(name)
  return s
end
local function dyn()
  return { H.r16(0x317886), H.r16(0x317888), H.r16(0x31788A) }
end
function test()
  F.clear()
  if not F.import('barrier-audit__potos-probe') then return F.finish() end
  F.gokuOn()
  H.wait(20)

  -- Rubble (4 chunks) and ceiling dust (20 chunks), grey-brown colours.
  F.rgb(0x7C1F, 0x03E0, 0x7FFF)       -- loud colours: easy to find on the forest
  F.style(0)
  F.spawn(0, F.K.DEBRIS, S, 0, 80, 110, 0, 0)
  F.waitFx(1)                          -- the mailbox applies the style per frame
  F.style(1)
  F.spawn(1, F.K.DEBRIS, S, 0, 170, 90, 0, 0)
  F.waitFx(1)
  F.style(0)
  local s = shot('debris_age6', F.waitFx(5))
  F.check('debris_sprites', s.sprites >= 18, F.statstr(s))
  local c = dyn()
  F.check('debris_colours', c[1] == 0x7C1F and c[2] == 0x03E0 and c[3] == 0x7FFF,
    string.format('%04X %04X %04X', c[1], c[2], c[3]))
  shot('debris_age20', F.waitFx(14))
  s = F.waitFx(30)
  F.check('debris_expires', s.sprites == 0, F.statstr(s))

  -- Brazier burst: Exploder at 0, 8 and 12 frames.
  F.style(2)
  F.spawn(0, F.K.EXPLODE, S, 0, 128, 110, 0, 0)
  F.waitFx(1)                          -- the mailbox reads the style when it spawns
  F.style(0)
  local a = F.waitFx(2).sprites
  local b = F.waitFx(11).sprites
  s = shot('brazier_age14', F.stats())
  H.log('brazier sprites', a, b)
  F.check('brazier_three_bursts', b > a and a > 0, a .. ' then ' .. b)
  s = F.waitFx(50)
  F.check('brazier_expires', s.sprites == 0, F.statstr(s))

  -- destroy's records: rubble in the room's shades, then a brazier burst.
  local gx, gy = F.goku()
  local seq = H.r16(DREC)
  H.w16(DREC + 2, 1)
  H.w16(DREC + 4, gx + 24)
  H.w16(DREC + 6, gy - 20)
  H.w16(DREC, (seq + 1) & 0xFFFF)
  s = F.waitFx(4)
  c = dyn()
  H.log('room shades', string.format('%04X %04X %04X', c[1], c[2], c[3]))
  F.check('record_rubble', s.sprites >= 2, F.statstr(s))
  F.check('record_shades', not (c[1] == 0x7C1F and c[2] == 0x03E0 and c[3] == 0x7FFF), 'still the caller colours')
  shot('record_rubble', s)
  s = F.waitFx(40)
  H.w16(DREC + 2, 2)
  H.w16(DREC + 4, gx - 30)
  H.w16(DREC + 6, gy - 10)
  H.w16(DREC, (seq + 2) & 0xFFFF)
  s = F.waitFx(16)
  F.check('record_brazier', s.sprites >= 2, F.statstr(s))
  shot('record_brazier', s)
  s = F.waitFx(60)
  F.check('records_expire', s.sprites == 0, F.statstr(s))
  F.finish()
end
