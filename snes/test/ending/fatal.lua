-- Finale death (boss-rush-death.js): the native collapse (0-300), the fade
-- (300-360), black while the stage loads, the night globe (408), its
-- explosion (576), the sky's fade (780-840) and GAME OVER (900); Start then
-- returns to the title. Stills at recorded ages; run.mjs compares the
-- planet-view stills with planet-view.js's own fatal view.
function test()
  E.import(BUNDLE or 'preset__bad-ending')
  E.watchVblank(1)
  E.watchAudio()
  E.cue('fatal', 0x8001)
  E.waitAge(200 + E.SHOT_LAG, 400)
  E.shot('fatal-200')
  H.result('status_200', H.r8(E.status))
  E.waitAge(330 + E.SHOT_LAG, 400)
  E.shot('fatal-330')
  E.waitAge(390 + E.SHOT_LAG, 400)
  E.shot('fatal-390')
  E.waitAge(500 + E.SHOT_LAG, 400)
  E.arm(true)
  local f0, c0 = H.frame, H.r16(0x7ED700)
  E.shot('fatal-500')
  for _, a in ipairs({ 560, 600, 650, 700, 810 }) do
    E.waitAge(a + E.SHOT_LAG, 400)
    E.shot('fatal-' .. a)
  end
  E.waitAge(905 + E.SHOT_LAG, 400)
  H.result('lag_frames', (H.frame - f0) - (H.r16(0x7ED700) - c0))
  E.shot('fatal-905')
  H.result('status_905', H.r8(E.status))
  H.result('done', (H.r16(E.done) >> 14) & 1)
  H.result('overruns', E.overruns)
  H.result('overrun_at', table.concat(E.overrunAt, ' '))
  E.arm(false)
  E.audioArmed = false
  E.audioResult()
  -- Start returns to the title: the module WRAM is cleared at title entry
  H.hold('start', 4)
  H.wait(90)
  H.result('after_phase', H.r8(E.phase))
  H.result('after_status', H.r8(E.status))
  H.result('after_frame', H.r16(0x7ED700))
  H.shot('after-start')
end
