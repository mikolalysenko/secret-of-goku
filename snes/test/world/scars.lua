-- Craters (world-scars.js): from a native session (waterfall), face south
-- toward Pandora and fire the full Super Saiyan wave. The town is aimed,
-- destroyed (persistent town bit, King Kai's message) and a 224-px crater
-- record is stored; its world rows in the 7F ring and the Mode 7 tilemap
-- get the crater characters ($E0-$FF) uploaded on entry. After landing and
-- taking off again the crater is redrawn from the persistent record as the
-- world rows stream in. The restoration wish clears it.
local function idle()
  return W.inField() and H.r8(0x7E00D0) == 0 and H.r8(0x7E00E4) == 1 and H.r8(0x7E00E5) == 1
end
local function interactive()
  return W.inWorld() and H.r8(0x7E00EC) & 0x80 ~= 0 and H.r8(0x7E00FE) == 0 and H.r8(0x7E00F2) & 0x83 == 0
end
local function ring_tile(col, row)
  return H.r8(0x7F0000 + ((row & 127) << 9) + (col & 511))
end
local function vram_tile(col, row)
  return H.vram((((row & 127) << 7) | (col & 127)) * 2)
end
local function crater_char(v) return v >= 0xE0 end
function test()
  H.wait(4)
  W.fresh()
  for a = W.PW, W.PW + 0x3F do H.w8(a, 0) end
  W.on(1)
  W.check('field_start', H.waitFor(idle, 300), W.nmi())
  H.hold('l r', 4)
  W.check('world', H.waitFor(interactive, 900), W.nmi())
  W.check('crater_chars', H.waitFor(function() return H.r16(W.a.frame) > 8 end, 60) and H.r16(0x7E7F9E) == 4, H.r16(0x7E7F9E))
  -- crater characters in VRAM (high bytes of words $3800-$3FFF)
  local bad = 0
  for i = 0, 2047, 61 do
    if H.vram((0x3800 + i) * 2 + 1) ~= H.r8(SYM.world_crater_chars + i) then bad = bad + 1 end
  end
  W.check('crater_chars_vram', bad == 0, bad)
  -- face south (heading 512) toward Pandora (map 144, 432 px south)
  H.w16(0x7E00F6, 512)
  H.wait(20)
  H.hold('l y', 50)
  H.wait(1)
  W.check('mega', (H.r16(W.a.shot_flags) & 1) == 1, string.format('%04X', H.r16(W.a.shot_flags)))
  W.check('aimed_pandora', H.r16(W.a.shot_tgt) == 0x81, string.format('%04X', H.r16(W.a.shot_tgt)))
  H.wait(16)
  W.check('crater_recorded', H.r8(W.PW + 1) == 1, H.r8(W.PW + 1))
  W.check('town_destroyed', (H.r16(W.PW + 2) & 2) == 2, H.r16(W.PW + 2))
  W.check('town_message', H.r16(W.a.msg) == 2 and H.r16(0x7E7FE4) == 1, H.r16(W.a.msg) .. ' arg ' .. H.r16(0x7E7FE4))
  local cx = H.r16(W.PW + 4) & 0x0FFF
  local cy = H.r16(W.PW + 6) & 0x0FFF
  H.result('crater_xy', cx .. ',' .. cy .. ' size ' .. (H.r16(W.PW + 4) >> 12))
  -- the refresh patches the ring rows and rewrites the tilemap window
  W.check('refresh_done', H.waitFor(function() return H.r16(0x7E7FA0) == 0xFFFF and H.r16(0x7E7F7C) == 0 end, 400), H.r16(0x7E7FA0))
  local col, row = cx >> 3, cy >> 3
  local rt, vt = ring_tile(col, row), vram_tile(col, row)
  H.result('centre_tiles', string.format('ring %02X vram %02X', rt, vt))
  W.check('ring_patched', crater_char(rt), string.format('%02X', rt))
  W.check('tilemap_patched', crater_char(vt), string.format('%02X', vt))
  H.wait(60)
  H.shot('crater')
  -- land (B) and take off again: the crater is redrawn from the record
  for i = 1, 600 do
    H.hold('b', 1)
    if not W.inWorld() then break end
  end
  W.check('landed', H.waitFor(idle, 900), W.nmi())
  H.result('landed_map', H.r16(0x7E00DC))
  -- take off again once the field is idle (an arrival scene may run first)
  local up = false
  for i = 1, 20 do
    H.waitFor(idle, 600)
    H.hold('l r', 4)
    if H.waitFor(function() return W.inWorld() end, 200) then up = true; break end
    H.tap('b', 4, 20)
  end
  W.check('world_again', up and H.waitFor(interactive, 900), W.nmi())
  H.w16(0x7E00F6, 512)
  H.wait(60)
  -- the takeoff point (the waterfall/Potos) is ~430 px north of Pandora:
  -- the crater rows are in the ring and the tilemap after the world init
  rt, vt = ring_tile(col, row), vram_tile(col, row)
  H.result('centre_tiles_again', string.format('ring %02X vram %02X', rt, vt))
  W.check('persistent_ring', crater_char(rt), string.format('%02X', rt))
  W.check('persistent_tilemap', crater_char(vt), string.format('%02X', vt))
  H.shot('crater_again')
  W.finish()
end
