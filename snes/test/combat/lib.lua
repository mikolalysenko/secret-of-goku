-- Helpers for the COMBAT module tests. run.mjs prepends IMPORT_ROOT (bundle
-- root) before this file.
C = {}
C.CB = 0x7ED800
C.ER = 0x317C00            -- combat's effect records (module.asm !ER)
C.VT_HITS = 0x317E38       -- !vt_hits (module.asm asserts these addresses)
C.VT_LOG = 0x317E72        -- !VT_LOG: the last 8 virtual hits x 8 bytes
C.failures = {}
function C.fail(msg) C.failures[#C.failures + 1] = msg; H.log('FAIL', msg) end
function C.check(cond, msg) if not cond then C.fail(msg) end return cond end
local KIND = {[0x10] = 'punch', [0x11] = 'charge', [0x12] = 'beam', [0x13] = 'blast', [0x15] = 'transform', [0x16] = 'revert', [0x17] = 'ready', [0x18] = 'focus'}
local function r8(a) return H.r8(a) end
local function r16(a) return H.r16(a) end
-- The probe of jsref.mjs (same fields), plus combat's state and the field
-- vblank count (the browser's frame index).
function C.probe()
  local act = r8(C.CB + 0x14)
  local p = {
    act = KIND[act], age = act ~= 0 and r16(C.CB + 0x16) or nil,
    combo = act == 0x10 and r8(C.CB + 0x1A) or nil, pause = r8(C.CB + 0x1E),
    charge = r16(C.CB + 0x26), charging = r8(C.CB + 0x28) ~= 0, ssj = r8(C.CB + 0x11) ~= 0, power = r16(C.CB + 0x2E),
    map = r16(0x7E00DC), gx = r16(0x7EE002), gy = r16(0x7EE004), gface = r8(0x7EE010), ghp = r16(0x7EE182), gq = r16(0x7EE1F1),
    gp = r16(0x7ECC6A) | (r8(0x7ECC6C) << 16), xp = r16(0x7EE18D) | (r8(0x7EE18F) << 16),
    frame = r16(0x7ED700), vb = r16(C.CB + 0xC4), vbl = r16(C.CB + 0xC6), hurt = r8(0x7EE011), can = r8(C.CB + 0x12), fxmask = r16(C.CB + 0xBE), kb = r16(C.CB + 0xC2),
    deflected = r16(C.CB + 0x5A), recovered = r16(C.CB + 0x68), hits = r16(C.CB + 0x6A), d0 = r8(0x7E00D0),
    str = r8(0x7EE188), agi = r8(0x7EE189), armor = r8(0x7EE1E1), ring = r8(0x7E00EC), pdef = r16(0x7EE1A5), mdef = r16(0x7EE1A8), lvl = r8(0x7EE181), maxhp = r16(0x7EE184),
    e = {},
  }
  p.k0 = {}
  for i = 0, 8 do
    if (p.kb >> i) & 1 == 1 then
      local k = 0x317D00 + i * 16
      p.k0[tostring(i)] = {r16(k + 2), r16(k + 4)}
    end
  end
  for i = 3, 11 do
    local b = 0x7EE000 + i * 0x200
    if (r8(b) & 1) == 0 then p.e[#p.e + 1] = false
    else
      p.e[#p.e + 1] = {sp = r8(b + 0x180), hp = r16(b + 0x182), q = r16(b + 0x1F1), x = r16(b + 2), y = r16(b + 4), h = r8(b + 0x45), dead = r8(b + 0x191) >> 7}
    end
  end
  -- combat's step counter, its ki and impact records, and the virtual
  -- hits logged since the last probe (cb_frame, damage, melee, HP taken)
  p.cbf = r16(C.CB + 0x0C)
  p.kis = 0
  local sparks = {}
  for i = 0, 15 do
    if (p.fxmask >> i) & 1 == 1 then
      local base = C.ER + i * 16
      local k = r8(base)
      if k == 3 then p.kis = p.kis + 1
      elseif k == 1 then sparks[#sparks + 1] = r16(base + 2) .. ',' .. r16(base + 4) end
    end
  end
  table.sort(sparks)
  p.sparks = table.concat(sparks, ' ')
  local n = r16(C.VT_HITS)
  C.vtSeen = C.vtSeen or n
  if n ~= C.vtSeen then
    p.vt = {}
    local h = C.vtSeen
    if (n - h) & 0xFFFF > 8 then h = (n - 8) & 0xFFFF end
    while h ~= n do
      local e = C.VT_LOG + (h % 8) * 8
      p.vt[#p.vt + 1] = {f = r16(e), dmg = r16(e + 2), entry = r8(e + 4), melee = r8(e + 5) ~= 0, taken = r16(e + 6)}
      h = (h + 1) & 0xFFFF
    end
    C.vtSeen = n
  end
  -- test builds (-DCOMBAT_TEST): the receive hook's log and combat_api_beam
  -- at the frame end (module.asm !CBT)
  if C.TEST then
    local t = 0x317F00
    p.rx = {n = r16(t + 0x0A), seen = r16(t + 0x08)}
    if r16(t + 0x0C) == 1 then
      local b = t + 0x10
      local function s16(v) if v >= 0x8000 then return v - 0x10000 end return v end
      p.beam = {x = r16(b), y = r16(b + 2), dx = s16(r16(b + 4)), dy = s16(r16(b + 6)), len = r16(b + 8), half = r16(b + 10),
        super = r8(b + 12), mega = r8(b + 13), age = r16(b + 14), life = r16(b + 16), taper = r16(b + 18), a = r16(t + 0x0E)}
    end
  end
  if C.extra then C.extra(p) end
  if C.profile then p.prof = C.profile() end
  return p
end
-- --profile (run.mjs): master clocks spent between each {entry, exit} pair
-- of addresses (summed over the calls of a field frame) and the calls;
-- C.profile() hands the frame's row to the probe and starts the next
function C.spansAt(pairs)
  local acc, cnt, start = {}, {}, {}
  for k, p in ipairs(pairs) do
    acc[k], cnt[k] = 0, 0
    emu.addMemoryCallback(function() start[k] = emu.getState()['masterClock'] end, emu.callbackType.exec, p[1], p[1])
    emu.addMemoryCallback(function()
      if start[k] then acc[k] = acc[k] + emu.getState()['masterClock'] - start[k]; cnt[k] = cnt[k] + 1; start[k] = nil end
    end, emu.callbackType.exec, p[2], p[2])
  end
  C.profile = function()
    local out = {}
    for k = 1, #pairs do out[#out + 1] = acc[k]; out[#out + 1] = cnt[k]; acc[k], cnt[k] = 0, 0 end
    return out
  end
end
-- Run a script ("right:12,b:3,none:20"), one input per video frame. Probes
-- are taken once per field frame at 00:B07D (after the field loop's NMI
-- wait: the frame's logic, combat and vblank are complete), never mid-frame.
-- POKES = {{frame, address, value, bytes}, ...}: RAM writes before a frame.
function C.run(script, trace, pokes)
  C.n = 0
  local id = emu.addMemoryCallback(function()
    trace[#trace + 1] = C.probe()
  end, emu.callbackType.exec, 0x00B07D, 0x00B07D)
  -- ring menus pause the field loop: probe their frames too (C0:694F)
  local ringFrame = -1
  local ringProbe = function()
    if H.frame ~= ringFrame then
      ringFrame = H.frame
      local p = C.probe()
      p.inRing = true
      trace[#trace + 1] = p
    end
  end
  local id2 = emu.addMemoryCallback(ringProbe, emu.callbackType.exec, 0xC0694F, 0xC0694F)
  local id3 = emu.addMemoryCallback(ringProbe, emu.callbackType.exec, 0x00694F, 0x00694F)
  for part in script:gmatch('[^,]+') do
    local buttons, n = part:match('^([^:]+):(%d+)$')
    local input = nil
    if buttons ~= 'none' then
      input = {}
      for b in buttons:gmatch('[^+]+') do input[b] = true end
    end
    for _ = 1, tonumber(n) do
      for _, p in ipairs(pokes or {}) do
        if p[1] == C.n then
          if (p[4] or 1) == 2 then H.w16(p[2], p[3]) else H.w8(p[2], p[3]) end
        end
      end
      C.n = C.n + 1
      H.input = input
      H.wait(1)
    end
  end
  H.input = nil
  emu.removeMemoryCallback(id, emu.callbackType.exec, 0x00B07D, 0x00B07D)
  emu.removeMemoryCallback(id2, emu.callbackType.exec, 0xC0694F, 0xC0694F)
  emu.removeMemoryCallback(id3, emu.callbackType.exec, 0x00694F, 0x00694F)
end
function C.import(name)
  local ok = H.importSnesJs(IMPORT_ROOT .. name)
  C.check(ok, 'import ' .. name)
  return ok
end
