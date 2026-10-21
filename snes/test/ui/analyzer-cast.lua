-- A real Analyzer cast. In a Rabite field Primm learns Sylphid's spells
-- exactly as native event 583 grants them (+$1CB |= $38, $CFAB = 2), then
-- the player switches to her (Select), opens her magic ring (X, up to ring
-- 1), picks Sylphid and Analyzer (B, left twice, B) and confirms the target
-- (B). The game's spell landing (C0:3F94) must give that target a reading:
-- the hook formerly sat on the +$181 store at C0:3FAD, which only event
-- objects (crystal orbs) reach, so a real cast never showed one. Snapshots
-- are taken at the end of the field NMI, as in readouts.lua.
local capture, inputs, snapshots, needFull = nil, nil, {}, 0
local function snapshotInputs()
  local a, cells = {}, {}
  local tiles = {0x122,0x124,0x126,0x128,0x12A,0x12C,0x12E,0x184,0x186,0x188,0x18A,0x1A8,0x1AA,0x1AC,0x1AE}
  for i = 0, 14 do cells[#cells + 1] = {key = H.r16(0x317840 + i * 2), tile = tiles[i + 1]} end
  for i = 0, 11 do
    local b = 0x7EE000 + i * 0x200
    a[#a + 1] = {index = i, active = (H.r8(b) & 1) ~= 0, species = H.r8(b + 0x180), hp = H.r16(b + 0x182), maxHp = H.r16(b + 0x184),
      screenX = H.r16(b + 0x20), screenY = H.r16(b + 0x22), age = ui(0x58 + i * 2), fmt = ui(0x88 + i * 2)}
  end
  inputs = {actors = a, cells = cells, map = H.r16(0x7E00DC), charge = H.r16(0x7ED826), charging = H.r8(0x7ED828) ~= 0,
    superSaiyan = H.r8(0x7ED740) ~= 0, weighted = H.r8(0x7EE1E1) == 22, radio = ui(0x22) ~= 0, pal = ui(0x78), sc = ui(0xAE),
    shown = ui(0xA2), first = H.r8(0x317497) & 127, numbers = ui(0x50), corners = ui(0x52), frame = H.frame}
end
local function nmiDone()
  if not capture or not inputs or (H.r8(0x7E00EC) & 1) == 0 then return end
  if needFull ~= 0 and (inputs.numbers & needFull ~= needFull or inputs.corners & needFull ~= needFull) then return end
  local name = capture; capture = nil
  H.dumpfile(name .. '-oam.bin', emu.memType.snesSpriteRam, 0, 544)
  H.dumpfile(name .. '-vram.bin', emu.memType.snesVideoRam, 0, 65536)
  H.dumpfile(name .. '-cgram.bin', emu.memType.snesCgRam, 0, 512)
  snapshots[name] = inputs
end
function test()
  enter(BUNDLE)
  -- Sylphid's grant, as event 583 performs it (39 02 CB 38, 39 03 CB 07, 30 AB 02)
  H.w8(0x7EE3CB, H.r8(0x7EE3CB) | 0x38)
  H.w8(0x7EE5CB, H.r8(0x7EE5CB) | 0x07)
  H.w8(0x7ECFAB, 2)
  local f = emu.addMemoryCallback(snapshotInputs, emu.callbackType.exec, 0x00B077, 0x00B077)
  local n = emu.addMemoryCallback(nmiDone, emu.callbackType.exec, SYM.core_field_nmi_done, SYM.core_field_nmi_done)
  local landings, hits, target, landedAt, landedUi = {}, 0, nil, nil, nil
  local l = emu.addMemoryCallback(function()
    local s = emu.getState()
    -- entry: X = target, Y = caster (C0:395E swaps them)
    landings[#landings + 1] = string.format('%04X<-%04X:%02X', s['cpu.x'], s['cpu.y'], H.r8(0x7EE170 + s['cpu.y']))
    if H.r8(0x7EE170 + s['cpu.y']) == 0x17 then target = s['cpu.x']; landedAt = H.frame; landedUi = ui(0x36) end
  end, emu.callbackType.exec, 0xC03F94, 0xC03F94)
  local h = emu.addMemoryCallback(function() hits = hits + 1 end, emu.callbackType.exec, SYM.ui_sc_analyzer_hit, SYM.ui_sc_analyzer_hit)
  -- the late readout pass (draw to the next late callback), in scanlines
  local drawing, from, cost = false, nil, {n = 0, sum = 0, max = 0}
  local d0 = emu.addMemoryCallback(function() if drawing then from = emu.getState().masterClock end end,
    emu.callbackType.exec, SYM.ui_sc_draw_frame, SYM.ui_sc_draw_frame)
  local d1 = emu.addMemoryCallback(function()
    if not from then return end
    local d = (emu.getState().masterClock - from) / 1364; from = nil
    cost.n = cost.n + 1; cost.sum = cost.sum + d; cost.max = math.max(cost.max, d)
  end, emu.callbackType.exec, SYM.destroy_late_frame, SYM.destroy_late_frame)
  H.wait(20)
  -- Primm's ring: Select switches to her, X opens it, up reaches magic.
  H.tap('select', 4, 40)
  H.tap('x', 6, 50)
  for _ = 1, 4 do
    if H.r8(0x7E1809) == 1 then break end
    H.tap('up', 4, 60)
  end
  check('magic_ring', H.r8(0x7E1808) == 1 and H.r8(0x7E1809) == 1, string.format('%02X %02X', H.r8(0x7E1808), H.r8(0x7E1809)))
  H.tap('b', 4, 50)                   -- Sylphid
  H.tap('left', 4, 40); H.tap('left', 4, 40)
  H.tap('b', 4, 40)                   -- Analyzer
  H.shot('target')
  H.tap('b', 4, 4)                    -- the target the cursor offers
  check('analyzer_cast', H.r8(0x7EE370) == 0x17, H.r8(0x7EE370))  -- Primm's spell
  H.waitFor(function() return target ~= nil end, 400)
  H.result('landings', landings)
  check('native_landing', target ~= nil, table.concat(landings, ' '))
  if target then
    local bit = 1 << (target >> 9)
    H.result('target', target)
    check('reading_started', (ui(0x58 + (target >> 8)) & 0x8000) ~= 0 and hits >= 1, string.format('age %04X hits %d', ui(0x58 + (target >> 8)), hits))
    -- past the 24-frame blink-in, a complete number and reticle on the target
    H.wait(30)
    capture = 'cast'; needFull = bit
    for _ = 1, 120 do if not capture then break end H.wait(1) end
    check('reading_drawn', not capture)
    capture = nil
    H.shot('cast')
    -- one reading per landing, and it expires after 240 frames
    local seen = 0
    drawing = true
    while ui(0x58 + (target >> 8)) ~= 0xFFFF and (ui(0xAE) & 2) ~= 0 and H.frame - landedAt < 400 do
      if ui(0x50) & bit ~= 0 then seen = seen + 1 end
      H.wait(1)
    end
    drawing = false
    H.result('draw', {mean = cost.sum / math.max(1, cost.n), max = cost.max, n = cost.n})
    H.result('expired_after', H.frame - landedAt)
    H.result('expired_after_ui', (ui(0x36) - landedUi) & 0xFFFF)
    H.result('shown_frames', seen)
    -- the lifetime counts field frames (!ui_frame), lag frames excluded
    local lived = (ui(0x36) - landedUi) & 0xFFFF
    check('expired', lived >= 240 and lived <= 244, lived)
  end
  H.result('hits', hits)
  H.result('snapshots', snapshots)
  emu.removeMemoryCallback(f, emu.callbackType.exec, 0x00B077, 0x00B077)
  emu.removeMemoryCallback(n, emu.callbackType.exec, SYM.core_field_nmi_done, SYM.core_field_nmi_done)
  emu.removeMemoryCallback(l, emu.callbackType.exec, 0xC03F94, 0xC03F94)
  emu.removeMemoryCallback(h, emu.callbackType.exec, SYM.ui_sc_analyzer_hit, SYM.ui_sc_analyzer_hit)
  emu.removeMemoryCallback(d0, emu.callbackType.exec, SYM.ui_sc_draw_frame, SYM.ui_sc_draw_frame)
  emu.removeMemoryCallback(d1, emu.callbackType.exec, SYM.destroy_late_frame, SYM.destroy_late_frame)
  finish()
end
