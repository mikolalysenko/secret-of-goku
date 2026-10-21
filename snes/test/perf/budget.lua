-- CPU budget probe: the scanline at which each frame's game logic finishes
-- (00:B077 field / 00:8089 world, the instruction after the frame's work;
-- the loops may also run through their FastROM mirrors 80:B077 / 80:8089).
-- Scanlines wrap at 262; logic starts after the NMI handler (~line 240).
-- `reached` < frames means lag (logic finished fewer times than frames ran).
local BUNDLE = BUNDLE_PATH
local lines = {}
local lastFrame = -1
local function onWait()
  local st = emu.getState()
  lines[#lines + 1] = st['ppu.scanline']
end
function test()
  if MAKE_STATE then
    -- Phase 1 (original cartridge): import the bundle, settle, then save a
    -- full Mesen state at the field/world wait loop for both cartridges.
    H.wait(5)
    assert(H.importSnesJs(BUNDLE), 'import failed')
    H.wait(30)
    local ok = H.saveStable('scene', 120)
    if not ok then
      local done = false
      local function save()
        if not done then done = true; local f = io.open(H_OUT .. '/scene.mss', 'wb'); f:write(emu.createSavestate()); f:close() end
      end
      local id = emu.addMemoryCallback(save, emu.callbackType.exec, 0x00808D, 0x00808D)
      local fast = emu.addMemoryCallback(save, emu.callbackType.exec, 0x80808D, 0x80808D)
      for _ = 1, 120 do if done then break end coroutine.yield() end
      emu.removeMemoryCallback(id, emu.callbackType.exec, 0x00808D, 0x00808D)
      emu.removeMemoryCallback(fast, emu.callbackType.exec, 0x80808D, 0x80808D)
      ok = done
    end
    H.result('saved', ok)
    return
  end
  H.wait(2)
  local id1 = emu.addMemoryCallback(onWait, emu.callbackType.exec, 0x00B077, 0x00B077)
  local id2 = emu.addMemoryCallback(onWait, emu.callbackType.exec, 0x008089, 0x008089)
  local id3 = emu.addMemoryCallback(onWait, emu.callbackType.exec, 0x80B077, 0x80B077)
  local id4 = emu.addMemoryCallback(onWait, emu.callbackType.exec, 0x808089, 0x808089)
  local start = H.frame
  for i = 1, 300 do
    if i % 60 < 30 then H.hold('left', 1) else H.hold('right', 1) end
  end
  emu.removeMemoryCallback(id1, emu.callbackType.exec, 0x00B077, 0x00B077)
  emu.removeMemoryCallback(id2, emu.callbackType.exec, 0x008089, 0x008089)
  emu.removeMemoryCallback(id3, emu.callbackType.exec, 0x80B077, 0x80B077)
  emu.removeMemoryCallback(id4, emu.callbackType.exec, 0x808089, 0x808089)
  table.sort(lines)
  H.result('frames', H.frame - start)
  H.result('reached', #lines)
  H.result('median', lines[math.floor(#lines / 2) + 1] or -1)
  H.result('p90', lines[math.floor(#lines * 0.9) + 1] or -1)
  H.result('max', lines[#lines] or -1)
  H.shot('scene')
end
