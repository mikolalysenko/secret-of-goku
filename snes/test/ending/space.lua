-- Bad ending in space: the doomed globe, the explosion (seams, flash,
-- fragments, sparks, shock ring) and Goku's escape. Stills are taken at
-- recorded scene ages; run.mjs compares them with planet-view.js itself.
local FLAGS = 0x8021            -- begun, bad, night globe (Frieza's crisis)
local shot = E.shot
local function waitAge(n, limit)
  return H.waitFor(function() return H.r16(E.age) >= n end, limit or 400)
end
-- Sprite time-over / range-over flags as Mesen reports them (any key).
local function overflowKeys()
  local st = emu.getState()
  local found = {}
  for k, v in pairs(st) do
    local lk = string.lower(k)
    if string.find(lk, 'timeover') or string.find(lk, 'rangeover') then
      found[#found + 1] = k .. '=' .. tostring(v)
    end
  end
  return table.concat(found, ' ')
end
function test()
  E.import(BUNDLE or 'preset__bad-ending')
  E.watchVblank(1)
  local t0 = H.frame
  E.cue('doomed', FLAGS)
  local loaded = E.waitLoaded('doomed', 120)
  H.result('doomed_loaded', loaded)
  H.result('doomed_load_frames', H.frame - t0)
  H.wait(12)
  E.arm(true)
  shot('doomed')
  H.result('overflow_keys', overflowKeys())
  -- Explosion, from the live globe (no reload).
  E.cue('explode')
  H.wait(1)
  H.result('explode_reloaded', (H.r8(E.status) & 0x80) ~= 0)
  local f0, c0 = H.frame, H.r16(0x7ED700)
  local over = 0
  local ages = { 9, 20, 32, 41, 52, 60, 70, 90, 120, 150 }
  for _, a in ipairs(ages) do
    waitAge(a + E.SHOT_LAG)
    local st = emu.getState()
    if st['ppu.timeOver'] or st['ppu.rangeOver'] then over = over + 1 end
    shot('explode-' .. a)
  end
  H.result('explode_lag', (H.frame - f0) - (H.r16(0x7ED700) - c0))
  H.result('explode_frames', H.frame - f0)
  waitAge(165)
  H.result('explode_done', (H.r16(E.done) >> 12) & 1)
  -- Escape: Goku and the teleport lines over the drifting fragments.
  E.cue('escape')
  H.wait(1)
  H.result('escape_reloaded', (H.r8(E.status) & 0x80) ~= 0)
  f0, c0 = H.frame, H.r16(0x7ED700)
  waitAge(4 + E.SHOT_LAG)
  shot('escape-4')
  waitAge(10 + E.SHOT_LAG)
  shot('escape-10')
  waitAge(24 + E.SHOT_LAG)
  shot('escape-24')
  H.result('escape_lag', (H.frame - f0) - (H.r16(0x7ED700) - c0))
  H.result('escape_sfx', H.r8(E.sfx))
  H.result('overruns', E.overruns)
  H.result('overrun_max', E.overrunMax)
  H.result('overrun_at', table.concat(E.overrunAt, ' '))
  -- A doomed globe without the crisis shows the day side (fresh start).
  E.arm(false)
  E.cue('doomed', 0x8001)
  E.waitLoaded('doomed', 120)
  H.wait(12)
  shot('doomed-day')
end
