-- Debug: callers of selected routines (return address on the stack at
-- entry) per logic frame. TARGETS = {{name, addr}, ...}.
function test()
  F.import('graphics-audit__party')
  F.on()
  F.enter(139, 17, 55)
  H.hold('a up', 2)
  local logic = 0
  local hist = {}
  local ids = {}
  for _, t in ipairs(TARGETS) do
    local name, a = t[1], t[2]
    ids[#ids + 1] = {emu.addMemoryCallback(function()
      local st = emu.getState()
      local sp = st['cpu.sp']
      local lo = emu.read(sp + 1, emu.memType.snesMemory)
      local hi = emu.read(sp + 2, emu.memType.snesMemory)
      local key = name .. ' <- ' .. string.format('%04X', ((hi << 8) | lo) - 2)
      hist[key] = (hist[key] or 0) + 1
    end, emu.callbackType.exec, a, a), a}
  end
  local id2 = emu.addMemoryCallback(function() logic = logic + 1 end, emu.callbackType.exec, 0x00B077, 0x00B077)
  for i = 1, 20 do H.input = {a = true, up = true}; H.wait(1) end
  H.input = nil
  for _, id in ipairs(ids) do emu.removeMemoryCallback(id[1], emu.callbackType.exec, id[2], id[2]) end
  emu.removeMemoryCallback(id2, emu.callbackType.exec, 0x00B077, 0x00B077)
  local keys = {}
  for k in pairs(hist) do keys[#keys + 1] = k end
  table.sort(keys, function(a, b) return hist[a] > hist[b] end)
  for _, k in ipairs(keys) do H.log(string.format('%-40s %6.2f', k, hist[k] / math.max(1, logic))) end
  H.result('pass', true)
end
