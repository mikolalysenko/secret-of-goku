-- Beams in Potos at fixed screen points: the full-screen waves (colour-math
-- polygon, snes/src/modules/fx/poly.asm) in four directions and three
-- palettes, then the Kamehameha strips and the charge orb at Goku's palm.
-- run.mjs samples the screenshots (see BEAM_CHECKS there); this script
-- checks the hardware state: HDMA bits in $2C, the polygon flags, the BG
-- palettes untouched, the registers given back, and the frame cost.
local S = F.F.SCREEN
local function cg()
  local t = {}
  for i = 0, 127 do t[#t + 1] = H.cgram(i * 2) | (H.cgram(i * 2 + 1) << 8) end
  return t
end
local base
local function bgSame()
  local now, n = cg(), 0
  for i = 2, 128 do if now[i] ~= base[i] then n = n + 1 end end
  return n
end
local function lines(s)
  local d = s.line1 - s.line0
  if d < 0 then d = d + 262 end
  return d
end
-- Hold the beams for `n` fx frames; log the first (build) frame's cost and
-- the median of the others (tables shown again). A frame that an NMI
-- interrupted reads its lines across the wrap, hence the median.
local function hold(name, n)
  local first = F.waitFx(1)
  local costs = {}
  for _ = 2, n do costs[#costs + 1] = lines(F.waitFx(1)) end
  table.sort(costs)
  local steady = costs[(#costs + 1) // 2]
  local s = F.stats()
  H.log(name, F.statstr(s), string.format('build=%d steady=%d (%s) 2C=%02X on=%d', lines(first), steady,
    table.concat(costs, ','), H.r8(0x7E002C), H.r16(0x317890)))
  H.result(name .. '_lines', { build = lines(first), steady = steady })
  F.shotAfter(name)
  return s, steady
end
function test()
  F.clear()
  if not F.import('barrier-audit__potos-probe') then return F.finish() end
  F.gokuOn()
  H.wait(20)
  base = cg()
  F.shotAfter('before')

  local waves = {
    { 'wave_right', F.B.WAVE, F.DIR.right, 40, 100, 220, 80, 2 },
    { 'wave_down', F.B.WAVE, F.DIR.down, 128, 20, 200, 60, 1 },
    { 'wave_up', F.B.WAVE, F.DIR.up, 128, 190, 200, 60, 1 },
    { 'final_left', F.B.FINAL, F.DIR.left, 220, 110, 200, 50, 2 },
    { 'galick_right', F.B.GALICK, F.DIR.right, 30, 110, 200, 40, 2 },
  }
  for _, w in ipairs(waves) do
    F.beam(0, w[2], S, w[3], w[4], w[5], w[6], w[7], 0, 20)
    local _, steady = hold(w[1], 12)
    F.check(w[1] .. '_hdma', (H.r8(0x7E002C) & 0x0C) == 0x0C, string.format('$2C=%02X', H.r8(0x7E002C)))
    F.check(w[1] .. '_kind', H.r16(0x317890) == w[8], 'poly_on=' .. H.r16(0x317890))
    F.check(w[1] .. '_bg_palettes', bgSame() == 0, bgSame() .. ' BG colours changed')
    F.check(w[1] .. '_steady_cost', steady < 100, steady .. ' lines')
  end
  F.stop(0)
  F.waitFx(3)
  F.check('wave_off_hdma', (H.r8(0x7E002C) & 0x0C) == 0, string.format('$2C=%02X', H.r8(0x7E002C)))
  F.check('wave_off_flag', H.r16(0x317890) == 0, 'poly_on=' .. H.r16(0x317890))
  F.check('wave_off_backdrop', H.cgram(0) == (base[1] & 0xFF) and H.cgram(1) == (base[1] >> 8), 'CGRAM 0')
  F.check('wave_off_bg_palettes', bgSame() == 0, bgSame() .. ' BG colours changed')
  F.shotAfter('wave_after')

  -- Two waves in one frame: the second falls back to OBJ strips.
  F.beam(0, F.B.WAVE, S, F.DIR.right, 40, 60, 200, 40, 0, 20)
  F.beam(1, F.B.WAVE, S, F.DIR.left, 220, 160, 200, 40, 0, 20)
  local s = hold('wave_two', 6)
  F.check('wave_two_fallback', s.sprites >= 20, F.statstr(s))
  F.stop(0); F.stop(1)
  F.waitFx(3)

  -- Kamehameha strips (3 bands; Super Saiyan 7) in four directions.
  F.beam(0, F.B.KAME, S, F.DIR.right, 40, 60, 160, 12, 0, 0)
  F.beam(1, F.B.KAME, S | F.F.SSJ, F.DIR.left, 220, 150, 160, 19, 0, 0)
  F.beam(2, F.B.KAME, S, F.DIR.down, 60, 20, 120, 12, 0, 0)
  F.beam(3, F.B.KAME, S, F.DIR.up, 200, 190, 120, 12, 0, 0)
  s = hold('kame', 6)
  F.check('kame_sprites', s.sprites >= 40, F.statstr(s))
  F.check('kame_no_polygon', (H.r8(0x7E002C) & 0x0C) == 0, string.format('$2C=%02X', H.r8(0x7E002C)))
  for i = 0, 3 do F.stop(i) end
  F.waitFx(3)

  -- Charge orb anchored at Goku (FX_F_GOKU): the idle pose has no hand
  -- socket (goku_api_hand), so nothing is drawn; combat shows it in the
  -- charge pose.
  F.draw(0, F.K.ORB, F.F.GOKU, 0, 0, 0, 4)
  s = F.waitFx(3)
  F.check('orb_no_socket', s.sprites == 0, F.statstr(s))
  F.stop(0)
  F.waitFx(2)
  F.finish()
end
