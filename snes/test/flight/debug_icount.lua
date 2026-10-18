-- Debug: instructions executed in the flight bank per logic frame, by
-- routine bucket (dev aid). BUCKETS = {{name, lo, hi}, ...} from profile.
local total, logic = 0, 0
local per = {}
function test()
  F.import('graphics-audit__party')
  F.on()
  F.enter(139, 17, 55)
  if ICOUNT_INPUT then H.wait(20) else H.hold('a up', 2) end
  local phase = 'other'
  local phases = {}
  local pids = {}
  for _, p in ipairs(PHASES or {}) do
    pids[#pids + 1] = {emu.addMemoryCallback(function() phase = p[1] end, emu.callbackType.exec, p[2], p[2]), p[2]}
  end
  local id = emu.addMemoryCallback(function(addr)
    total = total + 1
    phases[phase] = (phases[phase] or 0) + 1
    for _, b in ipairs(BUCKETS) do
      if addr >= b[2] and addr < b[3] then local k = phase .. ':' .. b[1]; per[k] = (per[k] or 0) + 1 break end
    end
  end, emu.callbackType.exec, 0xA38000, 0xA3FFFF)
  local id2 = emu.addMemoryCallback(function() logic = logic + 1 end, emu.callbackType.exec, 0x00B077, 0x00B077)
  for i = 1, 20 do H.input = ICOUNT_INPUT or {a = true, up = true}; H.wait(1) end
  H.input = nil
  emu.removeMemoryCallback(id, emu.callbackType.exec, 0xA38000, 0xA3FFFF)
  emu.removeMemoryCallback(id2, emu.callbackType.exec, 0x00B077, 0x00B077)
  for _, p in ipairs(pids) do emu.removeMemoryCallback(p[1], emu.callbackType.exec, p[2], p[2]) end
  for k, v in pairs(phases) do H.log(string.format('phase %-10s %7.0f', k, v / math.max(1, logic))) end
  H.log(string.format('logic frames %d, flight-bank instructions per logic frame %.0f', logic, total / math.max(1, logic)))
  local names = {}
  for k in pairs(per) do names[#names + 1] = k end
  table.sort(names, function(a, b) return per[a] > per[b] end)
  for _, k in ipairs(names) do H.log(string.format('  %-24s %7.0f', k, per[k] / math.max(1, logic))) end
  H.result('pass', true)
end
