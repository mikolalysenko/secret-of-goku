-- Replays the generated frame script (run.mjs) and records the current
-- message after every frame for comparison with native-radio.js.
function test()
  enter(BUNDLE)
  -- a fresh session: persistent UI fields as after a new game
  for a = 0x316380, 0x3163DF do H.w8(a, 0) end
  H.result('trace', replay(SCRIPT))
  H.shot('end')
  finish()
end
