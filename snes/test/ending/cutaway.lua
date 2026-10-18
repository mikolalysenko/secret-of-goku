-- The Fortress cutaway (planet-view.js with a world-ki.js shot) from a native
-- session: the waterfall checkpoint, Super Saiyan, L+R takeoff, the camera
-- moved so that the Fortress stands 400 px ahead at planet-view's default
-- target (2432, 3024), the full wave. The world module counts the cutaway
-- (!w_cut_age, 186 frames); a first pass measures it untouched (vblank work,
-- the footprint keeping up), then the deck landing; a second pass from the
-- same checkpoint holds the age for each still.
local CUT = 0x7E7F64                       -- !w_cut_age
local function nmi() return string.format('%02X:%02X%02X%02X', H.r8(0x100), H.r8(0x103), H.r8(0x102), H.r8(0x101)) end
local function inWorld() return nmi() == '5C:0088CF' end
local function inField() return nmi() == '5C:00C0A8' end
local function idle() return inField() and H.r8(0x7E00D0) == 0 and H.r8(0x7E00E4) == 1 and H.r8(0x7E00E5) == 1 end
local function interactive()
  return inWorld() and H.r8(0x7E00EC) & 0x80 ~= 0 and H.r8(0x7E00FE) == 0 and H.r8(0x7E00F2) & 0x83 == 0
end
local function toCutaway()
  for a = 0x7E7F00, 0x7E7FFF do H.w8(a, 0) end      -- world block as power-on
  for a = 0x7E6F20, 0x7E6F3F do H.w8(a, 0) end      -- core's VRAM region owners
  H.w8(0x316001, 1)                                  -- Goku active
  H.w8(0x7ED740, 1)                                  -- Super Saiyan: the full wave
  if not H.waitFor(idle, 300) then return false end
  H.hold('l r', 4)
  if not H.waitFor(interactive, 900) then return false end
  H.wait(20)
  H.w16(0x7E00FA, 2432)                              -- the camera 400 px south of
  H.w16(0x7E00FC, 3424)                              -- the default target
  H.wait(40)
  H.w16(0x7E0128, 2432)                              -- the Fortress on it
  H.w16(0x7E012A, 3024)
  H.wait(4)
  H.hold('l y', 50)
  return H.waitFor(function() return H.r16(CUT) ~= 0xFFFF end, 90)
end

function test()
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

  -- Stills: the age held (the world adds one each frame before our hook).
  H.load(H_STATE)
  H.wait(4)
  if not toCutaway() then H.result('still_reached', false) return end
  H.result('still_reached', true)
  for _, a in ipairs({ 2, 6, 12, 30, 60, 85, 95, 110, 140, 170, 180 }) do
    for _ = 1, 16 do H.w16(CUT, a - 1); H.wait(1) end
    H.w16(CUT, a - 1)
    H.shot('cut-' .. a)
    H.result('cut-' .. a, a)
  end
end
