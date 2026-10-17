-- Boots from power-on through the title into the opening's first field
-- scene and checks the core field-frame hook runs.
function test()
  H.wait(600)
  for i = 1, 8 do H.tap('start', 4, 30) end
  for i = 1, 6 do H.tap('b', 4, 30) end
  H.tap('start', 4, 60)
  local reached = H.waitFor(function() return H.r16(0x7ed700) > 120 end, 3000)
  H.result('core_frame', H.r16(0x7ed700))
  H.result('map', H.r16(0x7e00dc))
  H.result('reached_field', reached)
  H.shot('field')
end
