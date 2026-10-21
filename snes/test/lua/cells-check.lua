-- Per-frame check of the cells behind every displayed sprite on the FX
-- cache tiles (fx.md "Native effect cells"). Shared by fx/native-cells.lua
-- and ui/analyzer-charge.lua. For every completed field frame, the VRAM
-- behind each displayed sprite must hold what its owner drew:
--   FX sprites: the ROM cell the cache said was resident when the frame
--     was built (the aura used to show the game's damage digits);
--   UI lease sprites: last written by their own core-queue upload;
--   native sprites on cache tiles: never written by FX or UI while the
--     game claimed them (its effect counts, requests and weapon effects).
-- Checked at the end of each field NMI (all uploads done, before display),
-- against the frame whose OAM that vblank uploaded. An effect that draws a
-- cell in the frame it allocates it shows that entry's old contents when a
-- late vblank leaves no time for the upload: counted as fxLate, reported
-- but not a failure (the aura never draws a cell before it is resident).
-- Likewise the game shows a new effect's sprite from its first frame but
-- streams the piece only in the slot's round-robin phase, up to four
-- frames later; tiles FX wrote before the game claimed them show until
-- then: nativeLate, reported only.
-- Needs SYM: core_field_frame, core_field_nmi_done, fx_k_aura_obj,
-- fx_draw_current, fx_run_slots, fx_entry_tile, fx_entry_vram, fx_cell_dma.
-- Use: Cells.init() once emulation runs, Cells.measuring = true/false,
-- Cells.frame() after each H.wait(1) (screenshots), Cells.report().
Cells = {measuring = false}
local CCELL, CPEND, CFAIL = 0x317840, 0x317880, 0x317A28
local entryTile, entryVram, tileEntry = {}, {}, {}
local cellData = {}
local lastWriter, lastWrite = {}, {}   -- 8x8 tile -> 'native'|'fx'|'ui', frame
local busyFrom = {}                     -- cache entry -> first frame of its current claim
local pending, displayed = nil, nil
local auraStart, auraOpen, auraTiles = nil, false, {}
local stats = {frames=0,checked=0,auraFrames=0,auraBad=0,fxBad=0,fxLate=0,uiBad=0,
  uiFrames=0,bothFrames=0,nativeBad=0,nativeLate=0,freeRefs=0,nativeWrites=0,nativeWritesHeld=0,
  regionAWrites=0,lag=0,shots=0}
local details = {}
local shotNext = nil
Cells.stats = stats
local function hook(addr, fn) emu.addMemoryCallback(fn, emu.callbackType.exec, addr, addr) end
local function regionTile(t)
  return (t>=0x120 and t<=0x13F) or (t>=0x184 and t<=0x18B) or (t>=0x194 and t<=0x19B)
    or (t>=0x1A8 and t<=0x1AF) or (t>=0x1B8 and t<=0x1BF)
end
-- The game's claims, read from its own actor fields: slot 5's pieces 1-4
-- by cell count, slots 1 and 2's fourth piece at 7 cells and fifth at 9,
-- on a request or while its weapon effect runs.
local function claims()
  local c5, c1, c2 = H.r8(0x7EEA84), H.r8(0x7EE284), H.r8(0x7EE484)
  local m = 0
  if c5 >= 1 then m = m | 0x0001 end
  if c5 >= 3 then m = m | 0x0006 end
  if c5 >= 5 then m = m | 0x0018 end
  if c5 >= 7 then m = m | 0x0060 end
  if c1 >= 7 then m = m | 0x0180 end
  if c1 >= 9 or H.r8(0x7EE28D) ~= 0 or H.r8(0x7EE261) ~= 0 then m = m | 0x0600 end
  if c2 >= 7 then m = m | 0x1800 end
  if c2 >= 9 or H.r8(0x7EE48D) ~= 0 or H.r8(0x7EE461) ~= 0 then m = m | 0x6000 end
  return m
end
local function cellBytes(c)
  if cellData[c] then return cellData[c] end
  local p = SYM.fx_cell_dma + c * 4
  local src = H.r16(p) | (H.r8(p + 2) << 16)
  local t = {}
  for i = 0, 127 do t[i] = H.r8(src + i) end
  cellData[c] = t
  return t
end
local function vramMatches(e, want)
  local a = entryVram[e] * 2
  for i = 0, 63 do if H.vram(a + i) ~= want[i] then return false end end
  local b = (entryVram[e] + 0x100) * 2
  for i = 0, 63 do if H.vram(b + i) ~= want[64 + i] then return false end end
  return true
end
local function note(kind, t)
  if #details < 40 then t.kind = kind; t.frame = H.frame; details[#details + 1] = t end
  if not shotNext and stats.shots < (SHOTS or 4) then shotNext = kind .. '-' .. H.frame end
end
-- Last writer of every 8x8 tile in the cache regions, from each DMA's
-- VRAM range (VMAIN $80 word writes through $2118/$2119). FX uploads its
-- cells from its own bank, UI leases go through the core queue (bank $A0);
-- everything else writing these tiles is the game.
local function dmaWrite(_, value)
  if not Cells.measuring or value == 0 then return end
  local s = emu.getState()
  local bank = s['cpu.k']
  local who = (bank == 0xAE and 'fx') or (bank == 0xA0 and 'ui') or 'native'
  local va = s['ppu.vramAddress'] or 0
  for ch = 0, 7 do
    if value & (1 << ch) ~= 0 then
      local size = H.r16(0x4305 + ch * 16); if size == 0 then size = 0x10000 end
      if H.r8(0x4301 + ch * 16) == 0x18 then
        for w = va, va + size // 2 - 1, 16 do
          local t = (w - 0x6000) >> 4
          if t >= 0 and t < 512 and regionTile(t) then
            lastWriter[t] = who; lastWrite[t] = H.frame
            if who == 'native' then
              stats.nativeWrites = stats.nativeWrites + 1
              if H.r16(0x317830) ~= 0 then stats.nativeWritesHeld = stats.nativeWritesHeld + 1 end
              if t < 0x140 then stats.regionAWrites = stats.regionAWrites + 1 end
            end
          end
        end
        va = va + size // 2
      end
    end
  end
end
for b = 0, 0x3F do
  for _, base in ipairs({b * 0x10000, (b + 0x80) * 0x10000}) do
    emu.addMemoryCallback(dmaWrite, emu.callbackType.write, base + 0x420B, base + 0x420B)
  end
end
hook(SYM.fx_k_aura_obj, function()
  if Cells.measuring then auraStart = H.r16(0x7E6E90); auraOpen = true end
end)
local function closeAura()
  if not auraOpen then return end
  auraOpen = false
  for off = auraStart, H.r16(0x7E6E90) - 4, 4 do auraTiles[H.r16(0x7E0802 + off) & 0x1FF] = true end
end
hook(SYM.fx_draw_current, function() if Cells.measuring then closeAura() end end)
hook(SYM.fx_run_slots, function() if Cells.measuring then closeAura() end end)
hook(SYM.core_field_frame, function() if Cells.measuring then auraTiles = {} end end)
-- The frame is complete: who owns each cache entry, and where natives end.
hook(0x00B077, function()
  if not Cells.measuring then return end
  closeAura()
  local owner = {}
  for e = 0, 14 do owner[e] = H.r16(CCELL + e * 2) end
  local mask = claims()
  for e = 0, 14 do
    if (mask >> e) & 1 ~= 0 then busyFrom[e] = busyFrom[e] or H.frame else busyFrom[e] = nil end
  end
  pending = {owner=owner, native=H.r16(0x7ED738), aura=auraTiles, cpend=H.r16(CPEND), cfail=H.r16(CFAIL), built=H.frame}
end)
hook(0x00C0A8, function()
  if not Cells.measuring then return end
  local ec = H.r8(0x7E00EC)
  if ec & 1 ~= 0 then displayed = pending; pending = nil
  else
    stats.lag = stats.lag + 1
    if ec & 8 ~= 0 then displayed = nil end
  end
end)
hook(SYM.core_field_nmi_done, function()
  if not Cells.measuring or not displayed then return end
  stats.checked = stats.checked + 1
  local aura, ui = false, false
  for i = 0, 127 do
    local y = H.oam(i * 4 + 1)
    if y < 224 or y >= 240 then
      local attr = H.oam(i * 4 + 3)
      local t = H.oam(i * 4 + 2) | ((attr & 1) << 8)
      if i < displayed.native then
        if regionTile(t) then
          local big = (H.oam(512 + (i >> 2)) >> ((i & 3) * 2)) & 2 ~= 0
          local n = big and 4 or 2
          for dy = 0, n - 1 do for dx = 0, n - 1 do
            local tt = t + dy * 16 + dx
            local w = lastWriter[tt]
            if regionTile(tt) and w and w ~= 'native' then
              local e = tileEntry[(tt & 0x1FE)] or tileEntry[((tt - 16) & 0x1FE)]
              local from = e and busyFrom[e]
              if from and lastWrite[tt] < from then stats.nativeLate = stats.nativeLate + 1
              else
                stats.nativeBad = stats.nativeBad + 1
                note('native', {slot=i, tile=tt, writer=w, entry=e, claimed=from, written=lastWrite[tt]})
              end
            end
          end end
        end
      else
        local e = tileEntry[t]
        if e then
          local c = displayed.owner[e]
          if c >= 0xFFFE then
            stats.freeRefs = stats.freeRefs + 1
            note('free', {slot=i, entry=e, cell=c})
          elseif c < 0x200 then
            local isAura = displayed.aura[t] and true or false
            if isAura then aura = true end
            if not vramMatches(e, cellBytes(c)) then
              local late = (displayed.cpend >> e) & 1 ~= 0
              local d = {slot=i, entry=e, cell=c, aura=isAura, writer=lastWriter[t], now=H.r16(CCELL + e * 2), late=late, line=emu.getState()['ppu.scanline']}
              if isAura then stats.auraBad = stats.auraBad + 1; note('aura', d)
              elseif late then stats.fxLate = stats.fxLate + 1
              else stats.fxBad = stats.fxBad + 1; note('fx', d) end
            end
          else
            ui = true
            if lastWriter[t] ~= nil and lastWriter[t] ~= 'ui' then
              stats.uiBad = stats.uiBad + 1
              note('ui', {slot=i, entry=e, key=c, writer=lastWriter[t]})
            end
          end
        end
      end
    end
  end
  if aura then stats.auraFrames = stats.auraFrames + 1 end
  if ui then stats.uiFrames = stats.uiFrames + 1 end
  if aura and ui then stats.bothFrames = stats.bothFrames + 1 end
end)
function Cells.init()
  for e = 0, 14 do
    entryTile[e] = H.r16(SYM.fx_entry_tile + e * 2)
    entryVram[e] = H.r16(SYM.fx_entry_vram + e * 2)
    tileEntry[entryTile[e]] = e
  end
end
-- After each H.wait(1) while measuring: the picture with bad VRAM is the
-- next one rendered; take two.
function Cells.frame()
  stats.frames = stats.frames + 1
  if shotNext then
    local name = shotNext; shotNext = nil; stats.shots = stats.shots + 1
    H.shot(name .. '-a'); H.wait(1); stats.frames = stats.frames + 1; H.shot(name .. '-b')
  end
end
function Cells.report()
  for k, v in pairs(stats) do H.result(k, v) end
  H.result('details', details)
end
