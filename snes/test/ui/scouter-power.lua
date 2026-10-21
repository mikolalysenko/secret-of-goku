function test()
  enter(BUNDLE)
  local formats={}
  for _,c in ipairs(CASES) do
    command(19,c[1],c[2]|(c[3]<<8))
    H.waitFor(function() return ui(0x38)==0 end,30)
    formats[#formats+1]=ui(0x3C)
  end
  H.result('formats',formats)
  command(20,0,0)
  H.waitFor(function() return ui(0x38)==0 end,30)
  check('retire_preserves_other_uploads',ui(0x3A)==0)
  command(21,0,0)
  H.waitFor(function() return ui(0x38)==0 end,30)
  check('palette_requires_current_fx_owner',ui(0x3A)==0)
  finish()
end
