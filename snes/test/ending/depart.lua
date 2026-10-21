-- Good ending in Potos: Goku beside the native Randi (village), then the
-- departure: stand, power up, launch, the whiteout, the distant day globe
-- and the fade. A first take-off runs the timeline untouched (status, the
-- sound cue, lag, vblank, the done flag, the release); a second one, from
-- the same state imported again, holds the clock for each still. run.mjs
-- checks Goku's pixels against the browser atlas, the cloud against the
-- whitened village and the space half against planet-view's depart view.
local function boy()
  local x, y = H.r16(0x7EE020), H.r16(0x7EE022)
  if x >= 0x8000 then x = x - 0x10000 end
  if y >= 0x8000 then y = y - 0x10000 end
  return x, y
end
local function takeOff()
  E.cue('depart', 0x8000)
  H.waitFor(function() return H.r8(E.phase) == E.P.depart end, 10)
end
function test()
  local bundle = BUNDLE or 'emulator-probe__potos-state'
  E.import(bundle)
  E.watchVblank(0)
  H.wait(20)
  E.cue('village', 0x8000)
  H.wait(16)
  local x, y = boy()
  H.result('village_boy', x .. ',' .. y)
  H.result('village_suppress', H.r8(0x7ED741) & 1)
  H.result('village_status', H.r8(E.status))
  E.still('village', 15)
  H.wait(4)

  E.arm(true)
  E.watchAudio()
  local f0, c0 = H.frame, H.r16(0x7ED700)
  takeOff()
  H.result('depart_origin', H.r16(0x7EDC96) .. ',' .. H.r16(0x7EDC98))
  E.waitAge(30, 400)
  H.result('status_30', H.r8(E.status))
  E.waitAge(70, 400)
  H.result('status_70', H.r8(E.status))
  H.result('sfx_70', H.r8(E.sfx))
  E.waitAge(200, 400)
  H.result('status_200', H.r8(E.status))
  E.waitAge(300, 400)
  H.result('lag_frames', (H.frame - f0) - (H.r16(0x7ED700) - c0))
  H.result('done', (H.r16(E.done) >> 8) & 1)
  H.result('status_end', H.r8(E.status))
  H.result('overruns', E.overruns)
  H.result('overrun_at', table.concat(E.overrunAt, ' '))
  E.arm(false)
  E.audioArmed = false
  E.audioResult()
  -- an explicit stop gives the field back
  H.w8(E.request, 0xFF)
  H.wait(8)
  H.result('after_phase', H.r8(E.phase))
  H.result('after_suppress', H.r8(0x7ED741) & 1)
  H.result('after_status', H.r8(E.status))

  E.import(bundle)
  H.wait(20)
  takeOff()
  for _, a in ipairs({ 6, 30, 50, 70, 100, 113, 120, 129, 138, 146, 152, 160, 174, 200, 240, 280 }) do
    E.still('depart-' .. a, a)
  end
end
