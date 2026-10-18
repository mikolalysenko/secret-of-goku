-- Debug: flight-bank instructions per video frame while a scenario plays
-- (scenarios.mjs, passed as SC), with the top routines of the costliest
-- frames. BUCKETS = {{name, lo, hi}, ...}.
function test()
  F.import(SC.fixture)
  F.on()
  if SC.enter then F.enter(SC.enter.map, SC.enter.x, SC.enter.y, SC.enter.layer or 0, SC.enter.flags) else H.wait(3) end
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
  local count, per = 0, {}
  local id = emu.addMemoryCallback(function(addr)
    count = count + 1
    for _, b in ipairs(BUCKETS) do
      if addr >= b[2] and addr < b[3] then per[b[1]] = (per[b[1]] or 0) + 1 break end
    end
  end, emu.callbackType.exec, 0xA38000, 0xA3FFFF)
  local logic = 0
  local id2 = emu.addMemoryCallback(function() logic = logic + 1 end, emu.callbackType.exec, 0x00B077, 0x00B077)
  local frames = {}
  local n = 0
  for _, st in ipairs(SC.steps) do
    local input = nil
    if st.b and #st.b > 0 then input = {}; for _, k in ipairs(st.b) do input[k] = true end end
    for i = 1, st.n do
      count, per, logic = 0, {}, 0
      H.input = input
      H.wait(1)
      n = n + 1
      frames[#frames + 1] = {n = n, count = count, per = per, logic = logic}
    end
  end
  H.input = nil
  emu.removeMemoryCallback(id, emu.callbackType.exec, 0xA38000, 0xA3FFFF)
  emu.removeMemoryCallback(id2, emu.callbackType.exec, 0x00B077, 0x00B077)
  local line = {}
  for _, f in ipairs(frames) do line[#line + 1] = string.format('%d:%d%s', f.n, f.count, f.logic == 0 and '*' or '') end
  H.log('per frame (instructions; * = no logic frame ended): ' .. table.concat(line, ' '))
  local pick = {}
  if SHOW then
    for _, f in ipairs(frames) do if SHOW[f.n] then pick[#pick + 1] = f end end
  else
    table.sort(frames, function(a, b) return a.count > b.count end)
    for k = 1, math.min(4, #frames) do pick[#pick + 1] = frames[k] end
  end
  for k = 1, #pick do
    local f = pick[k]
    local names = {}
    for name in pairs(f.per) do names[#names + 1] = name end
    table.sort(names, function(a, b) return f.per[a] > f.per[b] end)
    local top = {}
    for j = 1, math.min(14, #names) do top[#top + 1] = string.format('%s %d', names[j], f.per[names[j]]) end
    H.log(string.format('frame %d: %d  %s', f.n, f.count, table.concat(top, ', ')))
  end
  H.result('pass', true)
end
