-- Helpers for the COMBAT module tests. run.mjs prepends IMPORT_ROOT (bundle
-- root) before this file.
C = {}
C.CB = 0x7ED800
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
    frame = r16(0x7ED700), vb = r16(C.CB + 0xC4), can = r8(C.CB + 0x12), fxmask = r16(C.CB + 0xBE), kb = r16(C.CB + 0xC2),
    deflected = r16(C.CB + 0x5A), recovered = r16(C.CB + 0x68), hits = r16(C.CB + 0x6A),
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
  return p
end
-- Run a script ("right:12,b:3,none:20"), one input per video frame. Probes
-- are taken once per field frame at 00:B07D (after the field loop's NMI
-- wait: the frame's logic, combat and vblank are complete), never mid-frame.
function C.run(script, trace)
  local id = emu.addMemoryCallback(function()
    trace[#trace + 1] = C.probe()
  end, emu.callbackType.exec, 0x00B07D, 0x00B07D)
  for part in script:gmatch('[^,]+') do
    local buttons, n = part:match('^([^:]+):(%d+)$')
    local input = nil
    if buttons ~= 'none' then
      input = {}
      for b in buttons:gmatch('[^+]+') do input[b] = true end
    end
    for _ = 1, tonumber(n) do
      H.input = input
      H.wait(1)
    end
  end
  H.input = nil
  emu.removeMemoryCallback(id, emu.callbackType.exec, 0x00B07D, 0x00B07D)
end
function C.import(name)
  local ok = H.importSnesJs(IMPORT_ROOT .. name)
  C.check(ok, 'import ' .. name)
  return ok
end
