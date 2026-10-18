-- Debug: logic finish scanline and frame rate, walking vs flying.
local lines = {}
local function onWait() lines[#lines + 1] = emu.getState()['ppu.scanline'] end
local function measure(tag, input, n)
  lines = {}
  local f0 = H.r8(0x7E00F4)
  local id = emu.addMemoryCallback(onWait, emu.callbackType.exec, 0x00B077, 0x00B077)
  for i = 1, n do H.input = input; H.wait(1) end
  H.input = nil
  emu.removeMemoryCallback(id, emu.callbackType.exec, 0x00B077, 0x00B077)
  table.sort(lines)
  H.log(string.format('%s: %d logic frames in %d video frames, F4 +%d, line p50 %d max %d', tag, #lines, n,
    (H.r8(0x7E00F4) - f0) & 255, lines[math.floor(#lines / 2) + 1] or -1, lines[#lines] or -1))
end
function test()
  F.import('graphics-audit__party')
  F.on()
  F.enter(139, 17, 55)
  measure('idle', nil, 30)
  measure('walk', {up = true}, 30)
  measure('fly', {a = true, up = true}, 20)
  H.result('pass', true)
end
