-- Isolate reveal speed from auto-confirm (ff.lua tests actual B pulses).
-- Compare the first fully revealed native window with no R, R, and L+R.
local glyphs, first, last, start, durations = {}, nil, nil, nil, {}
local completeStart, completeDurations, completeLines, frameCpu = nil, {}, {}, {}
local delayed, delayedDone, stable = nil, false, true
local function source()
  local t = {}
  for a = 0x9000, 0x93ff do t[#t + 1] = string.char(H.wram(a)) end
  return table.concat(t)
end
-- Force the real queue's deferral path for three vblanks by temporarily
-- making this transfer too large to fit. Restore its size before DMA.
emu.addMemoryCallback(function()
  if not DEFER or delayedDone then return end
  if not delayed and (H.r16(0x337EF2) & 0xFFE0) == 0xF100 then
    for i = 0, H.r16(0x7ED70A) - 1 do
      local a = 0x3174E0 + i * 8
      if H.r16(a) >= 0x9000 and H.r16(a) < 0x9400 and H.r8(a + 2) == 0x7E then
        delayed = {frame = H.frame, a = a, size = H.r16(a + 6), src = source(), tile = H.r16(0x7EA17E)}
        H.w16(a + 6, 0x7fff)
        break
      end
    end
  end
  if delayed then
    stable = stable and source() == delayed.src and H.r16(0x7EA17E) == delayed.tile
    if H.frame >= delayed.frame + 3 then
      H.w16(delayed.a + 6, delayed.size); delayedDone = true
    end
  end
end, emu.callbackType.exec, SYM.core_flush_auto, SYM.core_flush_auto)
emu.addMemoryCallback(function()
  H.w16(0x7ED72A, 0) -- after fast-forward, before the input requests latch
end, emu.callbackType.exec, SYM.ui_sc_frame, SYM.ui_sc_frame)
emu.addMemoryCallback(function()
  glyphs[H.frame] = (glyphs[H.frame] or 0) + 1
  first = first or H.frame; last = H.frame
end, emu.callbackType.exec, 0xC013A0, 0xC013A0)
emu.addMemoryCallback(function() start = emu.getState().masterClock end,
  emu.callbackType.exec, SYM.ui_ff_text, SYM.ui_ff_text)
emu.addMemoryCallback(function()
  if start then
    local cost = (emu.getState().masterClock - start) / 1364
    durations[#durations + 1] = cost; frameCpu[H.frame] = (frameCpu[H.frame] or 0) + cost; start = nil
  end
end, emu.callbackType.exec, 0xC011CA, 0xC011CA)

emu.addMemoryCallback(function() local st = emu.getState(); completeStart = st.masterClock; completeLines[#completeLines + 1] = st['ppu.scanline'] end,
  emu.callbackType.exec, SYM.ui_ff_text_complete, SYM.ui_ff_text_complete)
emu.addMemoryCallback(function()
  local cost = (emu.getState().masterClock - completeStart) / 1364
  completeDurations[#completeDurations + 1] = cost
  frameCpu[H.frame] = (frameCpu[H.frame] or 0) + cost
end, emu.callbackType.exec, SYM.ui_ff_text_complete_end, SYM.ui_ff_text_complete_end)

local function raster()
  local out = {}
  for y = 8, 71 do for x = 0, 255 do
    local a = (0x5800 + (y >> 3) * 32 + (x >> 3)) * 2
    local e = H.vram(a) | (H.vram(a + 1) << 8)
    local py = (e & 0x8000) ~= 0 and 7 - (y & 7) or y & 7
    local bit = (e & 0x4000) ~= 0 and x & 7 or 7 - (x & 7)
    local b = (0x4000 + (e & 0x3ff) * 8) * 2 + py * 2
    local v = ((H.vram(b) >> bit) & 1) | (((H.vram(b + 1) >> bit) & 1) << 1)
    out[#out + 1] = string.char(65 + (v == 0 and 0 or v + ((e >> 10) & 7) * 4))
  end end
  return table.concat(out)
end

function test()
  H.wait(2)
  H.w8(0x316001, 1)
  H.w8(0x316040, 0); H.w8(0x316041, 0xff); H.w8(0x316042, 0xff)
  H.wait(10)
  check('queued', command(15, 0x134, 0) == 1)
  local frame = H.frame
  local ticks = H.r16(0x7ED700)
  for _ = 1, 1200 do
    local input = HOLD
    if HOLD == 'mid' then
      local n = 0; for _, count in pairs(glyphs) do n = n + count end
      input = n >= 8 and n < 30 and 'r' or nil
    end
    if input then H.hold(input, 1) else H.wait(1) end
    if H.r8(0x7E00D0) == 0x83 then break end
  end
  H.result('ready_frames', H.frame - frame)
  H.result('complete_lines', completeLines)
  H.result('lag_frames', H.frame - frame - ((H.r16(0x7ED700) - ticks) & 0xffff))
  check('prose_wait', H.r8(0x7E00D0) == 0x83)
  H.wait(10)
  local max, count = 0, 0
  for _, n in pairs(glyphs) do max = math.max(max, n); count = count + n end
  H.result('max_glyphs', max); H.result('glyphs', count)
  H.result('reveal_frames', (last or 0) - (first or 0) + 1)
  H.result('raster', raster())
  local sum, peak = 0, 0
  for _, n in ipairs(durations) do sum = sum + n; peak = math.max(peak, n) end
  H.result('text_cpu', {calls = #durations, mean = sum / math.max(1, #durations), max = peak})
  sum, peak = 0, 0
  for _, n in ipairs(completeDurations) do sum = sum + n; peak = math.max(peak, n) end
  H.result('reveal_cpu', {calls = #completeDurations, mean = sum / math.max(1, #completeDurations), max = peak})
  local frameMax = 0
  for _, cost in pairs(frameCpu) do frameMax = math.max(frameMax, cost) end
  H.result('text_frame_cpu_max', frameMax)
  if DEFER then check('deferred_source_and_map_stable', delayedDone and stable) end
  H.shot('window')
  finish()
end
