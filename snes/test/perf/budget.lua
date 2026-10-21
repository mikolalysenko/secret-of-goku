-- CPU budget probe: the scanline at which each frame's game logic finishes
-- (00/80:B077 field / 00/80:8089 world, after the frame's work).
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
      local id = emu.addMemoryCallback(function()
        if not done then done = true; local f = io.open(H_OUT .. '/scene.mss', 'wb'); f:write(emu.createSavestate()); f:close() end
      end, emu.callbackType.exec, 0x00808D, 0x00808D)
      for _ = 1, 120 do if done then break end coroutine.yield() end
      emu.removeMemoryCallback(id, emu.callbackType.exec, 0x00808D, 0x00808D)
      ok = done
    end
    H.result('saved', ok)
    return
  end
  H.wait(2)
  -- FastROM continuations can leave the native loop in bank $80. Watching
  -- only $00 reports a running world scene as 100% lag. These are alternate
  -- CPU addresses, so a completed frame triggers exactly one callback.
  local hooks = {}
  for _,at in ipairs({0x00B077,0x80B077,0x008089,0x808089}) do
    hooks[#hooks+1] = {emu.addMemoryCallback(onWait,emu.callbackType.exec,at,at),at}
  end
  local start = H.frame
  for i = 1, 300 do
    if i % 60 < 30 then H.hold('left', 1) else H.hold('right', 1) end
  end
  for _,h in ipairs(hooks) do emu.removeMemoryCallback(h[1],emu.callbackType.exec,h[2],h[2]) end
  table.sort(lines)
  H.result('frames', H.frame - start)
  H.result('reached', #lines)
  H.result('median', lines[math.floor(#lines / 2) + 1] or -1)
  H.result('p90', lines[math.floor(#lines * 0.9) + 1] or -1)
  H.result('max', lines[#lines] or -1)
  H.shot('scene')
end
