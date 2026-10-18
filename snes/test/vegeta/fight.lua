-- Records a whole sparring match for snes/test/vegeta/replay.mjs: the game
-- RAM the trial reads, captured at every entry of vg_tick (V_TICK), the
-- module's own state at that moment (= the result of the previous tick),
-- and the test events (story hook, mailbox hits). Inputs: V_SCRIPT, a list
-- of {frames, buttons} steps, and V_HITS, {frame offset, amount, melee}.
-- A step with buttons 'pilot' lets V.pilot() play Goku with the real combat
-- module: close in and punch, answer his beam with a Kamehameha
-- (V_PILOT_BEAM), mash B in a clash.
local recs = {}
local hookAt = {}
local function hex(mt, a, n)
  local t = {}
  for i = 0, n - 1 do t[#t + 1] = string.format('%02x', emu.read(a + i, mt)) end
  return table.concat(t)
end
local W = emu.memType.snesWorkRam
local S = emu.memType.snesSaveRam
local function record()
  recs[#recs + 1] = table.concat({
    tostring(H.frame),
    hex(W, 0x0000, 0x100),        -- direct page
    hex(W, 0xE000, 0x200),        -- Goku
    hex(W, 0xE600, 0x200),        -- slot 3
    hex(W, 0xE200, 1), hex(W, 0xE400, 1), hex(W, 0xCF3F, 1),
    hex(W, 0xD740, 0x10),         -- goku API block (form, act)
    hex(W, 0x0100, 8),            -- interrupt vectors
    hex(W, 0xDBC0, 0x40),         -- vegeta WRAM
    hex(S, 0x4000, 0x210),        -- vegeta SRAM record ($32:6000)
    string.format('%04x', emu.read(0x7ED702, emu.memType.snesMemory) | (emu.read(0x7ED703, emu.memType.snesMemory) << 8)), -- core_pad
    hex(S, 0x4210, 0xA0),         -- test log: hit ring, the tick's beam record
  }, ' ')
end
-- Goku's sparring (real combat input). Facing follows the last direction
-- pressed, so he lines up on the short axis first, then turns to Vegeta.
local P = {t = 0, beam = 'idle'}
local function towards(dx, dy)
  if math.abs(dx) >= math.abs(dy) then return dx < 0 and 'left' or 'right' end
  return dy < 0 and 'up' or 'down'
end
function V.pilot()
  P.t = P.t + 1
  local gx, gy = V.hero()
  local vx, vy = H.r16(0x7EDBC8), H.r16(0x7EDBCA)
  local dx, dy = vx - gx, vy - gy
  local face = towards(dx, dy)
  -- a clash: mash B
  if H.r8(0x7EDBEF) ~= 0 then P.beam = 'idle'; return (P.t % 6 < 2) and 'b' or '' end
  -- his beam: step back along his lane (the waves must meet more than 16 px
  -- past the palms), face him, charge (L+Y), release when his wave is out
  if V_PILOT_BEAM and H.r8(0x7EDBE0) == 3 then
    local bx = H.r8(0x7EDBE1); if bx >= 128 then bx = bx - 256 end
    local by = H.r8(0x7EDBE2); if by >= 128 then by = by - 256 end
    local age = H.r16(0x7EDBE4)
    local ahead = -dx * bx - dy * by          -- Goku ahead of him on the lane
    if P.beam == 'idle' or P.beam == 'back' then
      if ahead < 72 and age < 70 then P.beam = 'back'; return towards(bx, by) end
      P.beam = 'face'; return towards(-bx, -by)
    end
    if P.beam == 'face' then P.beam = 'charge' end
    if emu.read(0x4009, S) ~= 0 and P.beam == 'charge' then P.beam = 'fired'; return '' end
    if P.beam == 'charge' then return 'l y' end
    return ''
  end
  P.beam = 'idle'
  local adx, ady = math.abs(dx), math.abs(dy)
  local along, across = math.max(adx, ady), math.min(adx, ady)
  -- V_PILOT_HOLD_HP: below that HP (base form) stop punching (two punches
  -- in 100 frames provoke counters, which keep his cycle from the beam)
  -- and wait about 80 px away for his wave
  if V_PILOT_HOLD_HP and H.r8(0x7EDBC4) == 0 and H.r16(0x7EDBC6) <= V_PILOT_HOLD_HP then
    if along < 80 then return towards(-dx, -dy) end
    return ''
  end
  if along <= 34 and across <= 12 then
    if P.t % 12 == 0 then return face end
    if P.t % 12 == 2 then return 'b' end
    return ''
  end
  if across > 10 then
    if adx >= ady then return dy < 0 and 'up' or 'down' end
    return dx < 0 and 'left' or 'right'
  end
  return face
end

-- V_SHOTS: one screenshot at the first frame of each moment (the effects
-- drawn through fx: volley orbs, his waves, the clash, the transformation's
-- aura, a rush)
local taken = {}
local function shotOnce(name, cond)
  if not taken[name] and cond() then taken[name] = H.frame; H.shot(name); H.result('shot_' .. name, H.frame) end
end
function V.shots()
  local act, age = H.r8(0x7EDBE0), H.r16(0x7EDBE4)
  local tier, phase, phaseAge = H.r8(0x7EDBC4), H.r8(0x7EDBC1), H.r16(0x7EDBD4)
  local beamOn = emu.read(0x4009, S) ~= 0
  shotOnce('volley', function()
    if act ~= 2 then return false end
    local n = 0
    for i = 0, 7 do if emu.read(0x4020 + i * 8 + 7, S) ~= 0xFF then n = n + 1 end end
    return n >= 3
  end)
  shotOnce('rush', function() return act == 1 and age == 30 end)
  shotOnce('galick', function() return tier == 0 and act == 3 and beamOn and age >= 130 end)
  shotOnce('galick2', function() return tier == 0 and act == 3 and beamOn and age >= 150 end)
  shotOnce('final', function() return tier == 1 and act == 3 and beamOn and age >= 100 end)
  shotOnce('final2', function() return tier == 1 and act == 3 and beamOn and age >= 125 end)
  if V_FX_LOG and act == 3 and beamOn then
    -- the field's HDMA enable shadow, fx's polygon state and CGRAM 0
    H.log(string.format('beam f%d age %d tier %d $2C=%02X poly_req=%04X poly_on=%04X', H.frame, age, tier, H.r8(0x7E002C), H.r16(0x31788E), H.r16(0x317890)))
  end
  shotOnce('charge', function() return act == 3 and age == 60 end)
  shotOnce('clash', function() return H.r8(0x7EDBEF) ~= 0 and emu.read(0x6100 - 0x6000 + 0x4000, S) == 2 and H.r16(0x7EDBEF) ~= 0 and emu.read(0x4102, S) == 60 end)
  shotOnce('clash-lock', function() return H.r8(0x7EDBEF) ~= 0 and emu.read(0x4100, S) == 0 and emu.read(0x4102, S) == 20 end)
  shotOnce('transform', function() return phase == 2 and phaseAge == 120 end)
end

function test()
  H.wait(5)
  H.importSnesJs(V.IMPORT .. '/' .. (V_BUNDLE or 'graphics-audit__party'))
  H.wait(20)
  V.gokuActive(true)
  H.w8(0x7ECF3F, 4)
  local tickId = emu.addMemoryCallback(record, emu.callbackType.exec, V_TICK, V_TICK)
  local hookId = emu.addMemoryCallback(function() hookAt[#hookAt + 1] = #recs end, emu.callbackType.exec, V_HOOK, V_HOOK)
  V.door(0x304)
  -- wait for the trial to reach the battle (dialogue advanced with A)
  H.waitFor(function() return H.r8(0x7EDBC0) == 0x5A end, 900)
  H.waitFor(function() return (H.r8(0x7EDBC2) & 0x08) ~= 0 end, 900)
  for i = 1, 400 do
    if H.r8(0x7E00D0) == 0 and H.r8(0x7EDBC1) == 1 then break end
    if H.r8(0x7E00D0) ~= 0 then H.tap('a', 2, 6) else H.wait(1) end
  end
  -- V_PROFILE = {address, ...}: the scanline at each address, per frame
  -- (profile.txt: frame, then one line per address, -1 when not reached)
  local prof, profIds, profRow = {}, {}, nil
  if V_PROFILE then
    for k, a in ipairs(V_PROFILE) do
      profIds[k] = emu.addMemoryCallback(function()
        if profRow and profRow[k] == -1 then profRow[k] = emu.getState()['ppu.scanline'] end
      end, emu.callbackType.exec, a, a)
    end
  end
  local start = H.frame
  local hits = V_HITS or {}
  local nextHit = 1
  for _, step in ipairs(V_SCRIPT or {{600, ''}}) do
    local n, buttons = step[1], step[2]
    for f = 1, n do
      local t = H.frame - start
      while hits[nextHit] and hits[nextHit][1] <= t do
        local h = hits[nextHit]
        emu.write(0x4200, h[2] & 0xff, S); emu.write(0x4201, (h[2] >> 8) & 0xff, S)
        emu.write(0x4202, h[3] or 0, S); emu.write(0x4203, 0, S)
        emu.write(0x41FC, 1, S)
        nextHit = nextHit + 1
      end
      -- Goku's beam stand-in (no combat module): opposite to Vegeta's lane
      -- from Goku's chest when Vegeta's beam action reaches V_BEAM_AGE.
      if V_BEAM_AGE and H.r8(0x7EDBE0) == 3 and H.r16(0x7EDBE4) == V_BEAM_AGE and emu.read(0x41F0, S) == 0 then
        local hx, hy = V.hero()
        local dx = H.r8(0x7EDBE1); if dx >= 128 then dx = dx - 256 end
        local dy = H.r8(0x7EDBE2); if dy >= 128 then dy = dy - 256 end
        local function w16(a, v) v = v & 0xffff; emu.write(a, v & 0xff, S); emu.write(a + 1, v >> 8, S) end
        w16(0x41E0, hx); w16(0x41E2, hy - 12)
        w16(0x41E4, -dx); w16(0x41E6, -dy)
        w16(0x41E8, V_BEAM_LEN or 200); w16(0x41EA, (V_BEAM_HALF or 12) * 256)
        emu.write(0x41EC, V_BEAM_SUPER and 1 or 0, S); emu.write(0x41ED, 0, S)
        emu.write(0x41F0, 1, S)
        H.log('beam stand-in at', H.frame, hx, hy, -dx, -dy)
      end
      -- the stand-in ends when the clash takes it (browser: cancelCombat)
      if H.r8(0x7EDBEF) ~= 0 and emu.read(0x41F0, S) ~= 0 then emu.write(0x41F0, 0, S) end
      if V_SHOTS then V.shots() end
      if V_PROFILE then
        if profRow then prof[#prof + 1] = H.frame .. ' ' .. H.r8(0x7EDBE0) .. ' ' .. table.concat(profRow, ' ') end
        profRow = {}
        for k = 1, #V_PROFILE do profRow[k] = -1 end
      end
      local mash = V_MASH and H.r8(0x7EDBEF) ~= 0 and (H.frame % V_MASH) < 2
      if buttons == 'pilot' then
        local b = V.pilot()
        if b ~= '' then H.hold(b, 1) else H.wait(1) end
      elseif mash then H.hold('b', 1)
      elseif buttons ~= '' then H.hold(buttons, 1) else H.wait(1) end
      if V_UNTIL and V_UNTIL() then break end
    end
  end
  if V_PROFILE then
    for k, a in ipairs(V_PROFILE) do emu.removeMemoryCallback(profIds[k], emu.callbackType.exec, a, a) end
    local pf = assert(io.open(H_OUT .. '/profile.txt', 'w'))
    pf:write(table.concat(prof, '\n'))
    pf:close()
  end
  emu.removeMemoryCallback(tickId, emu.callbackType.exec, V_TICK, V_TICK)
  emu.removeMemoryCallback(hookId, emu.callbackType.exec, V_HOOK, V_HOOK)
  local f = assert(io.open(H_OUT .. '/fight.txt', 'w'))
  f:write(table.concat(recs, '\n'))
  f:close()
  H.result('records', #recs)
  H.result('hook', hookAt)
  H.result('start', start)
  H.shot('end')
end
