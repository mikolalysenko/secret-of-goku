-- The wish flight (scatter): the vista fades out (0-30), the flight stage
-- loads under black, then the night world under the rising Balls, the
-- turn, the scatter's flash and trails. A first run measures the timeline
-- untouched (load frames, lag, vblank, status, done); a second, from the
-- same state imported again, holds the clock for each still.
function test()
  local bundle = BUNDLE or 'ending-fix__end-20'
  E.import(bundle)
  E.watchVblank(1)
  H.wait(20)
  E.watchAudio()
  E.cue('scatter', 0x8000)
  H.result('vista_loaded', E.waitLoaded('scatter', 120))
  E.waitAge(31, 120)
  local t0 = H.frame
  H.wait(2)
  H.waitFor(function() return (H.r8(E.status) & 0x80) == 0 end, 200)
  H.result('flight_load_frames', H.frame - t0)
  H.wait(2)
  E.arm(true)
  local f0, c0 = H.frame, H.r16(0x7ED700)
  E.waitAge(100, 400)
  H.result('status_100', H.r8(E.status))
  E.waitAge(310, 400)
  H.result('sfx_310', H.r8(E.sfx))
  E.waitAge(479, 400)
  H.wait(2)
  H.result('lag_frames', (H.frame - f0) - (H.r16(0x7ED700) - c0))
  H.result('done', (H.r16(E.done) >> 5) & 1)
  H.result('status_end', H.r8(E.status))
  H.result('overruns', E.overruns)
  H.result('overrun_at', table.concat(E.overrunAt, ' '))
  E.arm(false)
  -- letting go of the picture gives the native music its volume back
  H.w8(E.request, 0xFF)
  H.wait(4)
  E.audioArmed = false
  E.audioResult()

  E.import(bundle)
  H.wait(20)
  E.cue('scatter', 0x8000)
  E.waitLoaded('scatter', 120)
  for _, a in ipairs({ 40, 60, 120, 180, 230, 280, 301, 320, 360, 400, 450 }) do
    E.still('flight-' .. a, a)
  end
end
