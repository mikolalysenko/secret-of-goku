-- Shenron's vista (good ending): the summon's fade-in and fallout, the
-- dragon rising between the Tree and the cliff, the wish (the Tree whole,
-- the white flash, sparks), the scatter's fade-out. Stills at held ages;
-- run.mjs compares them with shenron-ending.js's own composition.
function test()
  E.import(BUNDLE or 'ending-fix__end-20')
  E.watchVblank(1)
  H.wait(20)
  local t0 = H.frame
  E.cue('summon', 0x8002)       -- with Dryad's eighth Ball
  H.result('summon_loaded', E.waitLoaded('summon', 120))
  H.result('summon_load_frames', H.frame - t0)
  E.arm(true)
  local f0, c0 = H.frame, H.r16(0x7ED700)
  for _, a in ipairs({ 24, 60 }) do E.still('summon-' .. a, a) end
  H.result('summon_done', H.r16(E.done) >> 2 & 1)

  E.cue('dragon')
  H.waitFor(function() return H.r8(E.phase) == E.P.dragon end, 10)
  local d0, dc0 = H.frame, H.r16(0x7ED700)
  E.waitAge(100, 200)
  H.result('dragon_lag', (H.frame - d0) - (H.r16(0x7ED700) - dc0))
  H.result('dragon_reloaded', H.r8(E.status) & 0x80)
  H.result('dragon_done', H.r16(E.done) >> 3 & 1)

  E.cue('dragon')
  H.waitFor(function() return H.r8(E.phase) == E.P.dragon and H.r16(E.age) < 5 end, 10)
  for _, a in ipairs({ 10, 40, 70, 100 }) do E.still('dragon-' .. a, a) end

  E.cue('wish')
  H.waitFor(function() return H.r8(E.phase) == E.P.wish end, 10)
  for _, a in ipairs({ 4, 30, 50, 80 }) do E.still('wish-' .. a, a) end
  H.result('wish_done', H.r16(E.done) >> 4 & 1)

  E.cue('scatter')
  H.waitFor(function() return H.r8(E.phase) == E.P.scatter end, 10)
  for _, a in ipairs({ 6, 20 }) do E.still('scatter-' .. a, a) end
  H.result('lag_frames', (H.frame - f0) - (H.r16(0x7ED700) - c0))
  H.result('overruns', E.overruns)
  H.result('overrun_at', table.concat(E.overrunAt, ' '))
  E.arm(false)
end
