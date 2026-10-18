-- Saved Super Saiyan charge state: preset attempts / xorshift state /
-- rotation in the persistent block, then replay charges (run.mjs roll).
function test()
  enter(BUNDLE)
  for a = 0x316380, 0x3163DF do H.w8(a, 0) end
  H.w8(0x316381, WARNING)
  H.w16(0x316382, ATTEMPTS)
  H.w16(0x316384, ROLL & 0xFFFF)
  H.w16(0x316386, (ROLL >> 16) & 0xFFFF)
  H.result('trace', replay(SCRIPT))
  H.result('attempts', H.r16(0x316382))
  finish()
end
