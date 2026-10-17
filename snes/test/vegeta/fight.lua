-- Records a whole sparring match for snes/test/vegeta/replay.mjs: the game
-- RAM the trial reads, captured at every entry of vg_tick (V_TICK), the
-- module's own state at that moment (= the result of the previous tick),
-- and the test events (story hook, mailbox hits). Inputs: V_SCRIPT, a list
-- of {frames, buttons} steps, and V_HITS, {frame offset, amount, melee}.
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
  }, ' ')
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
      local mash = V_MASH and H.r8(0x7EDBEF) ~= 0 and (H.frame % V_MASH) < 2
      if mash then H.hold('b', 1)
      elseif buttons ~= '' then H.hold(buttons, 1) else H.wait(1) end
      if V_UNTIL and V_UNTIL() then break end
    end
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
