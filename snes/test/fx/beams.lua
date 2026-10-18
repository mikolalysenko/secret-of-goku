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
  -- Three consecutive frames of the PPU picture (F.grab): when the field
  -- NMI's own work runs past the end of vblank, the frame after it may
  -- legitimately lose the wave, so run.mjs passes a check when two of the
  -- three show it. The screenshot is for people.
  F.grab(name)
  H.wait(1)
  F.grab(name .. '_1')
  H.wait(1)
  F.grab(name .. '_2')
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
  F.grab('wave_after')
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
  -- The first left/right beam is a polygon (its strip rows are one colour
  -- each); the second one, and up/down beams, are OBJ strips.
  F.check('kame_sprites', s.sprites >= 20, F.statstr(s))
  F.check('kame_polygon', (H.r8(0x7E002C) & 0x0C) == 0x0C and H.r16(0x317890) == 2,
    string.format('$2C=%02X on=%d', H.r8(0x7E002C), H.r16(0x317890)))
  for i = 0, 3 do F.stop(i) end
  F.waitFx(3)

  -- The polygon strip against the OBJ strips: a left/right Kamehameha
  -- alone is a polygon; behind another left/right beam (which takes the
  -- polygon) the same beam is OBJ strips. Their lines must match between
  -- the orb and the head, two lines around them included. The mailbox
  -- advances the beam's age, so the strips alternate between two band
  -- frames every two frames, and FX skips its sprites in the vblanks it
  -- predicts late: each polygon frame is compared with four OBJ frames.
  local function diff(a, b)
    local n = 0
    for i = 1, #a do if a[i] ~= b[i] then n = n + 1 end end
    return n
  end
  local function polyRows(name, flags, dir, kx, ky, width)
    local x0 = dir == F.DIR.left and kx - 79 or kx + 16
    local function region()
      local b, t = emu.getScreenBuffer(), {}
      for y = ky - 10, ky + 9 do
        for x = x0, x0 + 63 do t[#t + 1] = b[(y + 7) * 256 + x + 1] or 0 end
      end
      return t
    end
    local function frames(n, costs)
      local t = {}
      for i = 1, n do
        H.wait(1)
        t[i] = region()
        if costs then costs[#costs + 1] = lines(F.stats()) end
      end
      return t
    end
    local plain = frames(1)[1]
    F.beam(0, F.B.KAME, S | flags, dir, kx, ky, 160, width, 0, 0)
    F.waitFx(4)
    local pc, oc = {}, {}
    local poly = frames(4, pc)
    local pon = H.r16(0x317890)
    F.grab(name .. '_poly')
    F.beam(0, F.B.KAME, S, F.DIR.right, 40, 200, 160, 12, 0, 0)
    F.beam(1, F.B.KAME, S | flags, dir, kx, ky, 160, width, 0, 0)
    F.waitFx(4)
    local obj = frames(4, oc)
    F.grab(name .. '_obj')
    F.stop(0); F.stop(1)
    F.waitFx(3)
    local matched, drawn = 0, 0
    for _, p in ipairs(poly) do
      drawn = math.max(drawn, diff(p, plain))
      local best = #plain
      for _, o in ipairs(obj) do best = math.min(best, diff(p, o)) end
      if best == 0 then matched = matched + 1 end
    end
    local detail = string.format('on=%d drawn=%d/%d matched=%d/%d lines poly=%s obj+other=%s', pon, drawn, #plain,
      matched, #poly, table.concat(pc, ','), table.concat(oc, ','))
    H.log(name, detail)
    F.check(name, pon == 2 and drawn >= #plain // 3 and matched >= 3, detail)
  end
  polyRows('kame_rows_right', 0, F.DIR.right, 40, 60, 12)
  polyRows('kame_rows_left_ssj', F.F.SSJ, F.DIR.left, 216, 120, 19)

  -- Death Beam in 16 headings against the browser's pixels (orbit-effects.js
  -- beam(), width 1, pink): |v| <= 1 across, u along, from orbitVectors.
  -- The core (v = 0) is white, the sides are pinks of the beam ramp (two
  -- colour frames). Headings 0/2 mod 4 are exact; 1/3 repeat one window
  -- (fx.mjs) and may sit a pixel off the browser's line further out, so
  -- they only need their pixels within the band's neighbourhood. Natives
  -- stand in front of the beam, hence the margins.
  local OV = { { 256, 0 }, { 229, 114 }, { 181, 181 }, { 114, 229 }, { 0, 256 }, { -114, 229 }, { -181, 181 },
    { -229, 114 }, { -256, 0 }, { -229, -114 }, { -181, -181 }, { -114, -229 }, { 0, -256 }, { 114, -229 },
    { 181, -181 }, { 229, -114 } }
  local PINKS = { [0x4479] = true, [0x5D1F] = true, [0x727F] = true, [0x7FFF] = true }
  local function c555(v)
    local r, g, b = (v >> 16) & 255, (v >> 8) & 255, v & 255
    return ((b >> 3) << 10) | ((g >> 3) << 5) | (r >> 3)
  end
  local LX, LY, REACH = 60, 112, 56     -- clear of the natives and the HUD
  for h = 0, 15 do
    F.beam(0, F.B.LASER, S | F.F.HEADING, h, LX, LY, REACH, 0, 0, 0)
    F.waitFx(5)
    local best, detail = -1, ''
    for _ = 1, 3 do
      H.wait(1)
      local buf = emu.getScreenBuffer()
      local vx, vy = OV[h + 1][1], OV[h + 1][2]
      local band, ok, core, coreOk, spill, near = 0, 0, 0, 0, 0, 0
      for y = 0, 223 do
        for x = 0, 255 do
          local ox, oy = x - LX, y - LY
          local u, v = (ox * vx + oy * vy) >> 8, (-ox * vy + oy * vx) >> 8
          if u >= 8 and u <= REACH - 16 and v >= -4 and v <= 4 then
            local c = c555(buf[(y + 7) * 256 + x + 1] or 0)
            if v >= -1 and v <= 1 then
              band = band + 1
              if PINKS[c] then ok = ok + 1 end
              if v == 0 then core = core + 1; if c == 0x7FFF then coreOk = coreOk + 1 end end
            elseif v == 2 or v == -2 then
              if PINKS[c] then near = near + 1 end
            elseif PINKS[c] then
              spill = spill + 1
            end
          end
        end
      end
      local exact = h % 2 == 0
      local score = ok / math.max(1, band)
      local pass
      if exact then
        pass = score >= 0.85 and coreOk >= core * 0.85 and near + spill <= band * 0.03
      else
        pass = score >= 0.6 and spill <= band * 0.03
      end
      local d = string.format('band=%d ok=%d core=%d/%d near=%d spill=%d', band, ok, coreOk, core, near, spill)
      if pass and best < 1 then best, detail = 1, d elseif best < 0 then best, detail = 0, d end
    end
    H.log('laser_h' .. h, detail)
    F.check('laser_h' .. h, best == 1, detail)
    if h == 1 or h == 2 or h == 4 or h == 8 or h == 12 then F.grab('laser_h' .. h) end
  end
  F.stop(0)
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
