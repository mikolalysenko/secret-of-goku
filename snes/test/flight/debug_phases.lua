-- Debug: flight-bank instructions per video frame split by phase while a
-- scenario plays (scenarios.mjs, passed as SC). PHASES = {{name, addr}}:
-- executing addr switches the phase; every instruction in bank A3 counts
-- for the current phase.
function test()
  F.import(SC.fixture)
  F.on()
  if SC.enter then F.enter(SC.enter.map, SC.enter.x, SC.enter.y, SC.enter.layer or 0, SC.enter.flags) else H.wait(1) end
  for _, p in ipairs(SC.prep or {}) do
    if p == 'clearActors' then F.clearActors() end
    if p == 'restore' then F.restore() end
    if p == 'ssj' then H.w8(0x7ED740, 1) end
    if type(p) == 'table' and p.w then
      for _, e in ipairs(p.w) do
        if e[3] == 2 then H.w16(0x7E0000 + e[1], e[2]) else H.w8(0x7E0000 + e[1], e[2]) end
      end
    elseif type(p) == 'table' then
      H.w16(0x7EE002, p.x); H.w16(0x7EE004, p.y); F.follow(p.x, p.y)
    end
  end
  local phase = 'other'
  local per = {}
  local pids = {}
  for _, p in ipairs(PHASES) do
    pids[#pids + 1] = {emu.addMemoryCallback(function() phase = p[1] end, emu.callbackType.exec, p[2], p[2]), p[2]}
  end
  local focus, ffocus = {}, {}
  local id = emu.addMemoryCallback(function(addr)
    per[phase] = (per[phase] or 0) + 1
    if FOCUS and phase == FOCUS then
      for _, b in ipairs(BUCKETS) do
        if addr >= b[2] and addr < b[3] then ffocus[b[1]] = (ffocus[b[1]] or 0) + 1 break end
      end
    end
  end, emu.callbackType.exec, 0xA38000, 0xA3FFFF)
  local n = 0
  local rows = {}
  local total = {}
  local frames = 0
  for _, st in ipairs(SC.steps) do
    local input = nil
    if st.b and #st.b > 0 then input = {}; for _, k in ipairs(st.b) do input[k] = true end end
    for i = 1, st.n do
      per = {}
      ffocus = {}
      H.input = input
      H.wait(1)
      n = n + 1
      if SHOW == nil or SHOW[n] then
        frames = frames + 1
        for k, v in pairs(ffocus) do focus[k] = (focus[k] or 0) + v end
        local names = {}
        local sum = 0
        for k, v in pairs(per) do names[#names + 1] = k; sum = sum + v; total[k] = (total[k] or 0) + v end
        table.sort(names, function(a, b) return per[a] > per[b] end)
        local line = {}
        for _, k in ipairs(names) do line[#line + 1] = k .. ' ' .. per[k] end
        rows[#rows + 1] = string.format('%3d: %5d  %s', n, sum, table.concat(line, ', '))
      end
    end
  end
  H.input = nil
  emu.removeMemoryCallback(id, emu.callbackType.exec, 0xA38000, 0xA3FFFF)
  for _, p in ipairs(pids) do emu.removeMemoryCallback(p[1], emu.callbackType.exec, p[2], p[2]) end
  for _, r in ipairs(rows) do H.log(r) end
  local names = {}
  for k in pairs(total) do names[#names + 1] = k end
  table.sort(names, function(a, b) return total[a] > total[b] end)
  local line = {}
  for _, k in ipairs(names) do line[#line + 1] = string.format('%s %.0f', k, total[k] / math.max(1, frames)) end
  H.log('mean over the shown frames: ' .. table.concat(line, ', '))
  if FOCUS then
    local fn = {}
    for k in pairs(focus) do fn[#fn + 1] = k end
    table.sort(fn, function(a, b) return focus[a] > focus[b] end)
    local fl = {}
    for j = 1, math.min(24, #fn) do fl[#fl + 1] = string.format('%s %.0f', fn[j], focus[fn[j]] / math.max(1, frames)) end
    H.log('inside ' .. FOCUS .. ' (mean per shown frame): ' .. table.concat(fl, ', '))
  end
  H.result('pass', true)
end
