-- Debug: calls (entries) of chosen flight routines per video frame while a
-- scenario plays (scenarios.mjs, passed as SC). TARGETS = {{name, addr}}.
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
  local counts = {}
  local ids = {}
  for i, t in ipairs(TARGETS) do
    counts[i] = 0
    ids[i] = emu.addMemoryCallback(function() counts[i] = counts[i] + 1 end, emu.callbackType.exec, t[2], t[2])
  end
  local n = 0
  local rows = {}
  for _, st in ipairs(SC.steps) do
    local input = nil
    if st.b and #st.b > 0 then input = {}; for _, k in ipairs(st.b) do input[k] = true end end
    for i = 1, st.n do
      for j = 1, #counts do counts[j] = 0 end
      H.input = input
      H.wait(1)
      n = n + 1
      if SHOW == nil or SHOW[n] then
        local line = {}
        for j, t in ipairs(TARGETS) do if counts[j] > 0 then line[#line + 1] = t[1] .. ' ' .. counts[j] end end
        rows[#rows + 1] = string.format('%3d: %s', n, table.concat(line, ', '))
      end
    end
  end
  H.input = nil
  for i, t in ipairs(TARGETS) do emu.removeMemoryCallback(ids[i], emu.callbackType.exec, t[2], t[2]) end
  for _, r in ipairs(rows) do H.log(r) end
  H.result('pass', true)
end
