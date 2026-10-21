-- The Fortress cutaway (planet-view.js with a world-ki.js shot) from a native
-- session: the waterfall checkpoint, Super Saiyan, L+R takeoff, the camera
-- moved so that the Fortress stands 400 px ahead at planet-view's default
-- target (2432, 3024), the full wave. The world module counts the cutaway
-- (!w_cut_age, 186 frames); a first pass measures it untouched (vblank work,
-- the footprint keeping up), then the deck landing; a second pass from the
-- same checkpoint holds the age for each still.
local CUT = 0x7E7F64                       -- !w_cut_age
-- The scatter loader must finish before another native NMI, and all its
-- CPU/PPU writes must stay in forced blank or vblank. Also watch the real
-- HDMAEN writes, including the native world's, for revision-1 CPU safety.
local function watchLoad()
  local started, worst, bad, hdma, unsafe = nil, 0, 0, 0, {}
  emu.addMemoryCallback(function() started = emu.getState().masterClock end,
    emu.callbackType.exec, LOAD_IN, LOAD_IN)
  emu.addMemoryCallback(function()
    if started then worst = math.max(worst, (emu.getState().masterClock - started) / 1364); started = nil end
  end, emu.callbackType.exec, NMI_OUT, NMI_OUT)
  for _, bank in ipairs({0x00, 0x32, 0x80, 0xAA}) do
    emu.addMemoryCallback(function(_, value) hdma = value end,
      emu.callbackType.write, (bank << 16) | 0x420C, (bank << 16) | 0x420C)
    emu.addMemoryCallback(function(_, value)
      local state = emu.getState()
      if state['cpu.k'] ~= 0xAA or state['cpu.pc'] < 0xC000 or value & 0x80 == 0 then return end
      local visible = state['ppu.scanline'] >= 1 and state['ppu.scanline'] <= 224
      local ppu = H.r8(0x4371)
      if visible and (hdma ~= 0 or (not state['ppu.forcedBlank'] and (ppu == 0x18 or ppu == 0x19 or ppu == 0x22))) then
        bad = bad + 1
        if #unsafe < 32 then unsafe[#unsafe + 1] = string.format('DMA %02X:%04X line %d blank %s hdma %02X dest %02X', state['cpu.k'], state['cpu.pc'], state['ppu.scanline'], tostring(state['ppu.forcedBlank']), hdma, ppu) end
      end
    end, emu.callbackType.write, (bank << 16) | 0x420B, (bank << 16) | 0x420B)
  end
  emu.addMemoryCallback(function()
    local state = emu.getState()
    if not state['ppu.forcedBlank'] and state['ppu.scanline'] >= 1 and state['ppu.scanline'] <= 224 then bad = bad + 1 end
  end, emu.callbackType.write, 0xAA2118, 0xAA2119)
  return function()
    H.result('load_lines_max', worst)
    H.result('unsafe_ppu_dma', bad)
    H.result('unsafe_ppu_dma_at', table.concat(unsafe, '; '))
  end
end
local function profile()
  local enabled, costs = true, {}
  local function watch(first, last, mode)
    if not first or not last then return end
    local started, key
    emu.addMemoryCallback(function()
      if enabled then started = emu.getState().masterClock; key = mode() end
    end, emu.callbackType.exec, first, first)
    emu.addMemoryCallback(function()
      if not enabled or not started then return end
      local lines = (emu.getState().masterClock - started) / 1364
      local c = costs[key] or { sum = 0, n = 0, max = 0 }
      c.sum = c.sum + lines; c.n = c.n + 1; c.max = math.max(c.max, lines)
      costs[key] = c; started = nil
    end, emu.callbackType.exec, last, last)
  end
  watch(FRAME_IN, FRAME_OUT, function()
    return H.r16(CUT) == 0xFFFF and 'frame_idle' or H.r8(0x7EDCA3) == 0 and 'frame_start' or 'frame_live'
  end)
  watch(NMI_IN, NMI_OUT, function()
    return H.r8(0x7EDCA3) == 0 and 'nmi_idle' or H.r8(0x7EDCA4) ~= 0 and 'nmi_load' or 'nmi_live'
  end)
  return function()
    enabled = false
    for key, c in pairs(costs) do
      H.result('cpu_' .. key .. '_mean', c.sum / c.n)
      H.result('cpu_' .. key .. '_max', c.max)
    end
  end
end
local function still(age, name)
  -- Large age jumps may need several DMA budgets to catch up. Render
  -- every frame and wait for the footprint as well as the screenshot.
  for _ = 1, 120 do
    H.w16(CUT, age - 1); H.wait(1)
    if H.r16(0x7EDCA7) >= age then break end
  end
  for _ = 1, 16 do H.w16(CUT, age - 1); H.wait(1) end
  H.shot(name)
  H.result(name, age)
  H.result(name .. '-shown', H.r16(0x7EDCA7))
end
local function nmi() return string.format('%02X:%02X%02X%02X', H.r8(0x100), H.r8(0x103), H.r8(0x102), H.r8(0x101)) end
local function inWorld() return nmi() == '5C:0088CF' end
local function inField() return nmi() == '5C:00C0A8' end
local function idle() return inField() and H.r8(0x7E00D0) == 0 and H.r8(0x7E00E4) == 1 and H.r8(0x7E00E5) == 1 end
local function interactive()
  return inWorld() and H.r8(0x7E00EC) & 0x80 ~= 0 and H.r8(0x7E00FE) == 0 and H.r8(0x7E00F2) & 0x83 == 0
end
local function toCutaway(target, night)
  target = target or { 2432, 3024 }
  for a = 0x7E7F00, 0x7E7FFF do H.w8(a, 0) end      -- world block as power-on
  for a = 0x7E6F20, 0x7E6F3F do H.w8(a, 0) end      -- core's VRAM region owners
  H.w8(0x316001, 1)                                  -- Goku active
  H.w8(0x7ED740, 1)                                  -- Super Saiyan: the full wave
  H.w8(0x7ED811, 1)                                  -- combat owns the shared form
  H.w8(0x7ED8A9, 1)                                  -- published form (set-form ABI)
  H.wait(3)                                          -- activate the controller pipeline
  if not H.waitFor(idle, 300) then return false end
  H.hold('l r', 4)
  if not H.waitFor(interactive, 900) then return false end
  H.wait(20)
  H.w16(0x7E00FA, target[1])                         -- camera 400 px south
  H.w16(0x7E00FC, (target[2] + 400) & 4095)
  H.wait(40)
  H.w16(0x7E0128, target[1])
  H.w16(0x7E012A, target[2])
  H.w8(0x316186, night and 3 or 0)                   -- Frieza crisis query
  H.wait(4)
  H.hold('l y', 50)
  if not H.waitFor(function() return H.r16(0x7E7F46) ~= 0 end, 10) then return false end
  -- The shot has latched its target, but the cutaway has not started yet.
  -- A renderer reading the live Fortress at cutaway start would be wrong.
  H.w16(0x7E0128, (target[1] + 1024) & 4095)
  H.w16(0x7E012A, (target[2] + 1024) & 4095)
  return H.waitFor(function() return H.r16(CUT) ~= 0xFFFF end, 90)
end

function test()
  E.watchDma()
  local finishProfile = profile()
  local finishLoad = watchLoad()
  H.wait(4)
  local ok = toCutaway()
  H.result('reached', ok)
  if not ok then return end
  H.result('target', H.r16(0x7E7F52) .. ',' .. H.r16(0x7E7F54))
  -- Untouched: where our vblank work ends, how far the footprint trails.
  local lines, worst, trail, seen = {}, 0, 0, 0
  if NMI_OUT then
    emu.addMemoryCallback(function()
      if H.r8(0x7EDCA3) == 1 then
        seen = seen + 1
        local l = emu.getState()['ppu.scanline']
        if l < 225 then l = l + 262 end
        if seen > 1 and l > worst then worst = l end         -- not the load
        if #lines < 24 then lines[#lines + 1] = string.format('%d:%d/%d', l, H.r16(0x7EDCA5), H.r16(0x7EDCA7)) end
      end
    end, emu.callbackType.exec, NMI_OUT, NMI_OUT)
  end
  local dmaEnd = 0
  if NMI_DMA then
    emu.addMemoryCallback(function()
      local l = emu.getState()['ppu.scanline']
      if l < 225 then l = l + 262 end
      if l > dmaEnd then dmaEnd = l end
    end, emu.callbackType.exec, NMI_DMA, NMI_DMA)
  end
  if NMI_IN then
    emu.addMemoryCallback(function()
      if H.r8(0x7EDCA3) == 1 and #lines < 48 then lines[#lines + 1] = 'in' .. emu.getState()['ppu.scanline'] end
    end, emu.callbackType.exec, NMI_IN, NMI_IN)
  end
  local frames = 0
  while H.r16(CUT) ~= 0xFFFF and frames < 260 do
    H.wait(1)
    frames = frames + 1
    local behind = H.r16(0x7EDCA5) - H.r16(0x7EDCA7)
    if H.r8(0x7EDCA3) == 1 and H.r8(0x7EDCA4) == 0 and behind > trail then trail = behind end
  end
  H.result('cut_frames', frames)
  H.result('nmi_end_max', worst)
  H.result('dma_end_max', dmaEnd)
  H.result('footprint_trail', trail)
  H.result('nmi_lines', table.concat(lines, ' '))
  if NMI_RESTORE then
    RESTORES = 0
    emu.addMemoryCallback(function() RESTORES = RESTORES + 1 end, emu.callbackType.exec, NMI_RESTORE, NMI_RESTORE)
  end
  H.result('after_cut', string.format('on=%d end=%d load=%d', H.r8(0x7EDCA3), H.r8(0x7EDCAA), H.r8(0x7EDCA4)))
  -- The deck landing: the field's own IRQ (HUD split) line must be back
  -- below 256 (VTIME's high bit cleared when the cutaway ends).
  H.result('landed', H.waitFor(function() return inField() and H.r16(0x7E00DC) == 255 end, 600))
  H.wait(60)
  H.result('field_vtime', emu.getState()['internalRegisters.verticalTimer'])
  H.result('restores', RESTORES or -1)
  H.shot('deck')
  finishProfile()

  -- Stills: the age held (the world adds one each frame before our hook).
  H.load(H_STATE)
  H.wait(4)
  if not toCutaway() then H.result('still_reached', false) return end
  H.result('still_reached', true)
  H.wait(1)
  H.result('default_globe', H.r16(0x7EDCB4))
  for _, a in ipairs({ 2, 6, 12, 30, 60, 85, 95, 110, 140, 170, 180 }) do
    still(a, 'cut-' .. a)
  end

  -- Camera-relative placement means these are all reachable (C2:B0D7),
  -- including wrapped coordinates. Exercise actual shots, the crisis
  -- query, and repeated selection after a fresh cutaway, in both palettes.
  for _, target in ipairs({ { 0, 0 }, { 4095, 4095 }, { 1848, 3527 },
      { 400, 800 }, { 1400, 2000 }, { 3100, 1200 } }) do
    for _, night in ipairs({ false, true }) do
      local key = 'at-' .. target[1] .. '-' .. target[2] .. (night and '-night' or '-day')
      H.load(H_STATE)
      H.wait(4)
      local reached = toCutaway(target, night)
      H.result(key .. '-reached', reached)
      if reached then
        H.result(key .. '-target', H.r16(0x7E7F52) .. ',' .. H.r16(0x7E7F54))
        H.wait(2)
        H.result(key .. '-night', H.r8(0x7EDCA9))
        H.result(key .. '-globe', H.r16(0x7EDCB4))
        -- Move the live Fortress after the hit. The orientation must use
        -- the shot's latched target, not the current native coordinates.
        H.w16(0x7E0128, 2432)
        H.w16(0x7E012A, 3024)
        for _, a in ipairs({ 2, 60, 140, 180 }) do
          still(a, key .. '-' .. a)
        end
      end
    end
  end
  -- Exercise the packed data and bank boundaries of every orientation,
  -- including those not used by the sampled full-wave shots. Compare the
  -- VRAM bytes with the generator's uncompressed atlas in run.mjs.
  for i = 0, GLOBE_COUNT - 1 do
    H.w16(0x7EDCB4, i)
    H.w8(0x7EDCA4, 1)
    H.w8(0x7EDCB1, 0xFF)
    for _ = 1, 3 do H.w16(CUT, 0); H.wait(1) end
    H.dumpfile('atlas-' .. i .. '-tiles.bin', emu.memType.snesVideoRam, 0x6000, GLOBE_TILES * 32)
    H.dumpfile('atlas-' .. i .. '-map.bin', emu.memType.snesVideoRam, 0x9800, 2048)
  end
  finishLoad()
end
