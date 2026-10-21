-- Per-frame watches for the orbit's picture (prepended to the fight and
-- clash tests by run.mjs). Prelude globals: SCENE_RAM, ORBIT_RAM and the
-- ROM addresses of the colours the scene sends (GLOBE_PAL: light level 3;
-- OBJ01, OBJ01B, OBJ67, TEXT_PAL; the victory's FRED, FWHITE and WASH,
-- extended data orbit_wash, with its layout OW_*).
--   W.cgram()   the colours the orbit owns as CGRAM holds them for the
--               frame just shown (endFrame comes before the next vblank)
--               against what the scene sends: 'ok', or the ranges that
--               differ ('sky', 'globe', 'obj01', 'obj45', 'obj67', 'text').
--               In the victory the scene sends what its frame decided
--               (wash.asm: the whiteout's level, Frieza's palette): the
--               state the last call saw (the frame that vblank showed)
--               or, after a lag frame, the one there now.
--   W.globe()   the globe's published state: centre column, M7HOFS,
--               radius, a block building, the indirect set published and
--               taken, the rebuild flag, our vblank's and frame's last
--               lines
--   W.oam()     the PPU's per-line limits on the OAM just shown
--   W.marks()   the scanlines at the frame's stages
--   W.install() (once, before the frames) and W.writes(): while the orbit
--               is live, the frame's CPU writes to CGRAM ($2121/$2122)
--               and general DMA starts ($420B) with HDMA enabled, made on
--               the visible lines: 'cgram,dma' counts since the last call
W = {}
local SB = SCENE_RAM
local function cg(i) return emu.read(i * 2, emu.memType.snesCgRam) | (emu.read(i * 2 + 1, emu.memType.snesCgRam) << 8) end
local function rom(a, i) return H.r8(a + i * 2) | (H.r8(a + i * 2 + 1) << 8) end
local function differ(first, n, a)
  for i = 0, n - 1 do if cg(first + i) & 0x7FFF ~= rom(a, i) & 0x7FFF then return true end end
  return false
end
-- the colours the frame decided: the victory's (wash.asm wv_*: SB+$CF8-
-- $CFF) and the image of palettes 4-5 (SB+$17A0)
local function wash()
  local img = {}
  for i = 0, 31 do img[i] = H.r8(SB + 0x17A0 + i * 2) | (H.r8(SB + 0x17A0 + i * 2 + 1) << 8) end
  return {white = H.r16(SB + 0xCF8), base = (WASH & 0xFF0000) | H.r16(SB + 0xCFA),
    sky = H.r16(SB + 0xCFC), p6 = H.r16(SB + 0xCFE), img = img}
end
local function check(v)
  local bad = {}
  if cg(0) & 0x7FFF ~= v.sky & 0x7FFF then bad[#bad + 1] = 'sky' end
  if differ(32, 81, v.white == 0 and GLOBE_PAL or v.base) then bad[#bad + 1] = 'globe' end
  if differ(128, 32, OBJ01) and differ(128, 32, OBJ01B) then bad[#bad + 1] = 'obj01' end
  -- palettes 4-5: the scene's image of them (SRAM), or level w's, but for
  -- the band colours (palette 4 entries 2-3, palette 5 entries 1-3 but in
  -- the win's)
  for i = 0, 31 do
    if i ~= 2 and i ~= 3 and (v.white ~= 0 or (i ~= 17 and i ~= 18 and i ~= 19)) then
      local want = v.img[i]
      if v.white ~= 0 then want = rom(v.base + (i < 16 and OW_BLUE0 or OW_SSJ - 32), i) end
      if cg(192 + i) & 0x7FFF ~= want & 0x7FFF then bad[#bad + 1] = 'obj45'; break end
    end
  end
  if v.white ~= 0 then
    if differ(224, 16, v.base + v.p6) or differ(240, 16, v.base + OW_GOLD) then bad[#bad + 1] = 'obj67' end
  elseif v.p6 ~= OW_FRIEZA then
    if differ(224, 16, v.p6 == OW_RED and FRED or FWHITE) or differ(240, 16, OBJ67 + 32) then bad[#bad + 1] = 'obj67' end
  elseif differ(224, 32, OBJ67) then bad[#bad + 1] = 'obj67' end
  if H.r16(SB + 0xDB2) ~= 0 and differ(4, 8, TEXT_PAL) then bad[#bad + 1] = 'text' end
  return bad
end
local shownWash = nil
function W.cgram()
  -- (only while the globe picture shows: the orbit live, no montage shot)
  if H.r8(ORBIT_RAM) ~= 2 or H.r8(ORBIT_RAM + 0x3C) ~= 0 then shownWash = nil; return 'off' end
  local now = wash()
  local bad = check(shownWash or now)
  if #bad > 0 and shownWash then bad = check(now) end
  shownWash = now
  if #bad == 0 then return 'ok' end
  return table.concat(bad, '+')
end
-- The sprites the PPU drops on a line: per line the OAM's sprites (32 at
-- most) and their 8-pixel slivers on the screen (34 at most), from the OAM
-- the frame just shown used (16x16 and 32x32: the orbit's OBJ sizes).
-- Returns 'sprites,slivers,lines over' of the worst line.
function W.oam()
  local count, slivers = {}, {}
  for i = 0, 127 do
    local x = emu.read(i * 4, emu.memType.snesSpriteRam)
    local y = emu.read(i * 4 + 1, emu.memType.snesSpriteRam)
    local hi = emu.read(512 + (i >> 2), emu.memType.snesSpriteRam) >> ((i & 3) * 2)
    if hi & 1 ~= 0 then x = x - 256 end
    local size = (hi & 2 ~= 0) and 32 or 16
    if x > -size and x < 256 then
      local tiles = 0
      for t = 0, size // 8 - 1 do local tx = x + t * 8; if tx > -8 and tx < 256 then tiles = tiles + 1 end end
      for dy = 0, size - 1 do
        local line = (y + dy) & 255
        if line < 224 then
          count[line] = (count[line] or 0) + 1
          slivers[line] = (slivers[line] or 0) + tiles
        end
      end
    end
  end
  local ms, mt, over = 0, 0, 0
  for line = 0, 223 do
    local c, t = count[line] or 0, slivers[line] or 0
    if c > ms then ms = c end
    if t > mt then mt = t end
    if c > 32 or t > 34 then over = over + 1 end
  end
  return ms .. ',' .. mt .. ',' .. over
end
-- Writes on the visible lines (0-224) while the orbit is live, through the
-- banks the core ($00, $80) and the orbit ($32) write I/O from: CGRAM
-- address and data, and $420B with HDMA on (the last $420C value): a
-- general DMA can meet an HDMA transfer there, which hangs revision-1
-- S-CPUs. And the scene's own HDMA channels (0-6) missing from a frame's
-- enable while its globe picture shows (a vblank that skipped the modules
-- once left channels 0-1, the band lines' colour math and BG1 scroll, off).
local bad = {cgram = 0, dma = 0, hdma = 0}
local hdmaen = 0
local function visible()
  local l = emu.getState()['ppu.scanline']
  return l < 225 and H.r8(ORBIT_RAM) == 2
end
function W.install()
  for _, b in ipairs({0x00, 0x80, 0x32}) do
    local base = b * 0x10000
    emu.addMemoryCallback(function() if visible() then bad.cgram = bad.cgram + 1 end end,
      emu.callbackType.write, base + 0x2121, base + 0x2122)
    emu.addMemoryCallback(function(a, v)
      hdmaen = v
      if v ~= 0 and v & 0x7F ~= 0x7F and H.r8(ORBIT_RAM) == 2 and H.r8(ORBIT_RAM + 0x3C) == 0 then bad.hdma = bad.hdma + 1 end
    end, emu.callbackType.write, base + 0x420C, base + 0x420C)
    emu.addMemoryCallback(function(a, v) if v ~= 0 and hdmaen ~= 0 and visible() then bad.dma = bad.dma + 1 end end,
      emu.callbackType.write, base + 0x420B, base + 0x420B)
  end
end
function W.writes()
  local s = bad.cgram .. ',' .. bad.dma .. ',' .. bad.hdma
  bad.cgram, bad.dma, bad.hdma = 0, 0, 0
  return s
end
-- The band lines (the finale's rays above the globe: SB+$04E, the lines of
-- the set the HDMA takes) at and after a repeated picture (the scene's
-- frame counter unchanged): their pixels in the rim's colour (the sky plus
-- the rim's colour math, (6, 17, 30)), which the bands never use; '-' on
-- other frames.
local bandLast, bandNext = -1, false
function W.bandrim()
  local fr = H.r16(ORBIT_RAM + 0x04)
  local rep = fr == bandLast
  bandLast = fr
  local scan = rep or bandNext
  bandNext = rep
  if not scan or H.r8(ORBIT_RAM) ~= 2 or H.r8(ORBIT_RAM + 0x3C) ~= 0 then return '-' end
  local lines = H.r16(SB + 0x04E)
  if lines == 0 then return '0' end
  if lines > 224 then lines = 224 end
  local buf = emu.getScreenBuffer()
  local n = 0
  for i = 1, lines * 256 do if (buf[i] or 0) & 0xFFFFFF == 0x318CF7 then n = n + 1 end end
  return tostring(n)
end
-- The scanlines at the frame's stages (ORBIT_TIMING builds: module.asm
-- orbit_mark, 0-7), as left by the frame just shown.
function W.marks()
  local t = {}
  for i = 0, 7 do t[#t + 1] = H.r16(ORBIT_RAM + 0x40 + i * 2) end
  return table.concat(t, ',')
end
function W.globe()
  return string.format('%d,%d,%d,%d,%d,%d,%d,%d,%d', H.r16(SB + 0x01E), H.r16(SB + 0x024), H.r16(SB + 0x0D0), H.r16(SB + 0x0EC),
    H.r16(SB + 0x0EA), H.r16(SB + 0x042), H.r16(SB + 0x0DC), H.r16(ORBIT_RAM + 0x0A), H.r16(ORBIT_RAM + 0x0C))
end
