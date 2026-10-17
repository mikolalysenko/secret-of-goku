-- Helpers for the FX module tests (prepended by run.mjs after SYM and
-- FX_IMPORT). FX_TEST cartridges read a mailbox at $32:6000
-- (snes/test/fx/testmod.asm) and call the public API like a client.
F = {}
F.BOX = 0x326000
F.REQ = 0x317800
F.K = { IMPACT = 1, KI = 2, BURST = 3, EXPLODE = 4, EMBER = 5, DETONATE = 6, STATUS = 7, DEBRIS = 8,
        SPARKS = 9, ORB = 0x10, AURA = 0x11, LIGHTNING = 0x12, DEATHBALL = 0x13, DISC = 0x14,
        FINGER = 0x15, CELL = 0x16 }
F.B = { KAME = 0, WAVE = 1, FINAL = 2, GALICK = 3, FRIEZA = 4, LASER = 5, FIRE = 6 }
F.F = { SCREEN = 1, GOLD = 2, FRONT = 4, BACK = 8, HEADING = 0x10, SSJ = 0x20, PINK = 0x40, GOKU = 0x80 }
F.DIR = { down = 0, right = 1, left = 2, up = 3 }
local failures = 0
function F.check(name, ok, detail)
  if ok then H.result(name, 'pass') else
    failures = failures + 1
    H.result(name, 'FAIL ' .. tostring(detail or ''))
    H.log('FAIL', name, tostring(detail or ''))
  end
  return ok
end
function F.finish() H.result('failures', failures) end
-- Mailbox entry `slot` (0-7). op 1 spawn, 2 draw (every frame), 3 beam
-- (every frame), 4 flash, 5 quake, 6 kill all. The op byte is written last.
function F.post(slot, op, kind, flags, dir, x, y, a, b, c, t)
  local base = F.BOX + slot * 16
  H.w8(base + 1, kind or 0); H.w8(base + 2, flags or 0); H.w8(base + 3, dir or 0)
  H.w16(base + 4, (x or 0) & 0xFFFF); H.w16(base + 6, (y or 0) & 0xFFFF)
  H.w16(base + 8, (a or 0) & 0xFFFF); H.w16(base + 10, (b or 0) & 0xFFFF)
  H.w16(base + 12, (c or 0) & 0xFFFF); H.w16(base + 14, (t or 0) & 0xFFFF)
  H.w8(base, op)
end
function F.stop(slot) H.w8(F.BOX + slot * 16, 0) end
function F.clear()
  for i = 0, 0xBF do H.w8(F.BOX + i, 0) end
end
function F.style(v) H.w8(F.BOX + 0xA0, v) end
function F.rgb(a, b, c) H.w16(F.BOX + 0xA2, a); H.w16(F.BOX + 0xA4, b); H.w16(F.BOX + 0xA6, c) end
function F.spawn(slot, kind, flags, dir, x, y, a, b) F.post(slot, 1, kind, flags, dir, x, y, a, b) end
function F.draw(slot, kind, flags, dir, x, y, a, b, c, t) F.post(slot, 2, kind, flags, dir, x, y, a, b, c, t) end
function F.beam(slot, style, flags, dir, x, y, len, width, taper, t) F.post(slot, 3, style, flags, dir, x, y, len, width, taper, t) end
function F.flash(frames) F.post(7, 4, 0, 0, 0, 0, 0, frames) end
function F.quake(frames) F.post(7, 5, 0, 0, 0, 0, 0, frames) end
function F.killAll() F.post(7, 6, 0, 0, 0, 0, 0) end
function F.handle() return H.r16(F.BOX + 0x80) end
-- Stats of the previous fx frame (written by the test mailbox).
function F.stats()
  return {
    sprites = H.r16(F.BOX + 0x82), dropped = H.r16(F.BOX + 0x84), front = H.r16(F.BOX + 0x86),
    palfree = H.r16(F.BOX + 0x88), regions = H.r16(F.BOX + 0x8A),
    pal = { H.r8(F.BOX + 0x8C), H.r8(F.BOX + 0x8D), H.r8(F.BOX + 0x8E), H.r8(F.BOX + 0x8F), H.r8(F.BOX + 0x90), H.r8(F.BOX + 0x91) },
    pend = H.r16(F.BOX + 0x92), frame = H.r16(F.BOX + 0x94),
    vbl = H.r16(F.BOX + 0x96), vblEnd = H.r16(F.BOX + 0x98), upl = H.r16(F.BOX + 0x9A),
    line0 = H.r16(F.BOX + 0x9C), line1 = H.r16(F.BOX + 0x9E),
  }
end
function F.statstr(s)
  return string.format('spr=%d drop=%d front=%d free=%02X reg=%X pal=%02X,%02X,%02X,%02X,%02X,%02X pend=%04X vbl=%d->%d upl=%d lines=%d->%d fxf=%d',
    s.sprites, s.dropped, s.front, s.palfree, s.regions, s.pal[1], s.pal[2], s.pal[3], s.pal[4], s.pal[5], s.pal[6], s.pend,
    s.vbl, s.vblEnd, s.upl, s.line0, s.line1, s.frame)
end
local function s16(v) if v >= 0x8000 then return v - 0x10000 end return v end
-- Goku: map position, screen position.
function F.goku()
  return H.r16(0x7EE002), H.r16(0x7EE004), s16(H.r16(0x7EE020)), s16(H.r16(0x7EE022))
end
-- Wait until n more FX frames ran (frames can lag while effects are heavy).
-- Returns the stats of the last completed FX frame, read right away.
function F.waitFx(n)
  local f0 = F.stats().frame
  H.waitFor(function() return F.stats().frame >= f0 + n end, 40 * n + 20)
  return F.stats()
end
-- Mesen's screenshot shows the picture about two frames behind the PPU
-- state read at endFrame: take it after the stats were read.
function F.shotAfter(name)
  H.wait(4)
  H.shot(name)
end
-- The PPU picture of the frame that just ended, as raw RGB (256x224, the
-- visible rows 7-230 of Mesen's 239-row buffer) in H_OUT/<name>.rgb.
-- Unlike the screenshot (the video decoder's last frame, which can lag a
-- varying number of frames), this is exact.
function F.grab(name)
  local b = emu.getScreenBuffer()
  local f = io.open(H_OUT .. '/' .. name .. '.rgb', 'wb')
  for y = 7, 230 do
    local row = {}
    local base = y * 256
    for x = 0, 255 do
      local v = b[base + x + 1] or 0
      row[#row + 1] = string.char((v >> 16) & 255, (v >> 8) & 255, v & 255)
    end
    f:write(table.concat(row))
  end
  f:close()
end
function F.import(name)
  local ok = H.importSnesJs(FX_IMPORT .. name)
  F.check('import_' .. name, ok, 'import failed')
  return ok
end
function F.gokuOn() H.w8(0x316001, 1) end
-- OAM entries using the FX cache tiles (OBJ table 1, tiles $122-$1AF).
function F.oamFx()
  local n = 0
  for i = 0, 127 do
    local y = H.oam(i * 4 + 1)
    local t = H.oam(i * 4 + 2) | ((H.oam(i * 4 + 3) & 1) << 8)
    if y ~= 0xE0 and ((t >= 0x122 and t <= 0x13F) or (t >= 0x184 and t <= 0x19B) or (t >= 0x1A8 and t <= 0x1BF)) then n = n + 1 end
  end
  return n
end
