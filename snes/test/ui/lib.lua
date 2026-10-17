-- Shared helpers for snes/test/ui/*.lua (prepended by run.mjs after a
-- generated prelude with BUNDLE, SCRIPT and friends).
UI = 0x7E7E40
local failures = 0
function check(name, ok, detail)
  if ok then H.result(name, 'pass') else
    failures = failures + 1
    H.result(name, 'FAIL ' .. tostring(detail or ''))
  end
  return ok
end
function finish() H.result('failures', failures) end
function ui(off) return H.r16(UI + off) end
function setui(off, v) H.w16(UI + off, v & 0xFFFF) end
-- Run a test-mailbox command now (processed by the next field frame).
function command(cmd, a, x)
  setui(0x3A, a or 0); setui(0x3C, x or 0); setui(0x38, cmd)
  H.wait(1)
  return ui(0x3A)
end
-- Import a browser-mod scene and stand Goku in (the bundle has no sidecar).
-- setup(), when given, runs right after the import (before any UI frame).
function enter(bundle, setup)
  H.wait(5)
  H.importSnesJs(bundle)
  H.w8(0x316001, 1)
  for a = 0x316380, 0x3163DF do H.w8(a, 0) end   -- UI persistent fields: a new game
  -- the imported WRAM has no UI block: set it up as a title entry would
  -- (else the first UI frame clears it, and with it the setup below)
  for a = 0, 0xBF do H.w8(UI + a, 0) end
  H.w16(UI + 0x00, 0x0008)
  H.w16(UI + 0x82, 0x4B41)
  for a = 0x337EF8, 0x337EFB do H.w8(a, 0) end   -- nothing staged (!ui_s_bmode/bstep)
  H.w16(0x337EE8, 0)                               -- no cached radar heading (!ui_s_trig)
  if setup then setup() end
  H.wait(20)
end
-- Replay a generated frame script; returns the current message (id + 1)
-- after each frame, comma separated.
-- One script record per UI frame (!ui_frame), so lag frames (no field
-- frame completed) do not shift the cartridge against the model.
function replay(script)
  local out = {}
  local lags = 0
  for _, f in ipairs(script) do
    setui(0x48, f.charge or 0)
    setui(0x1C, f.hidden and 0x8000 or 0)
    if f.cmd then setui(0x3A, f.a or 0); setui(0x3C, f.x or 0); setui(0x38, f.cmd) end
    local n = ui(0x36)
    H.wait(1)
    while ui(0x36) == n do lags = lags + 1; H.wait(1) end
    out[#out + 1] = tostring(ui(0x04))
  end
  H.result('lag_frames', lags)
  setui(0x48, 0); setui(0x1C, 0)
  return table.concat(out, ',')
end
-- BG3 tilemap word at row r, column c.
function bg3(r, c) local a = (0x5800 + r * 32 + c) * 2; return H.vram(a) | (H.vram(a + 1) << 8) end
function cgram(i) return H.cgram(i * 2) | (H.cgram(i * 2 + 1) << 8) end
