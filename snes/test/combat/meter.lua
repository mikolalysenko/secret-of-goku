-- A native weapon's percentage and charged sparkle can survive a load
-- even though combat makes Goku's stamina countdown zero. Exercise both
-- the pre-logic cleanup and a native write later in the same frame.
function test()
  H.wait(5)
  assert(C.import('animation-audit__native__rabite-field-b'))
  H.w8(0x316001,1)
  H.wait(8)
  local injected, checked = false, false
  local seed = emu.addMemoryCallback(function()
    if injected then return end
    injected=true
    H.w8(0x7EE1ED,50); H.w8(0x7EE063,0x40); H.w8(0x7EE01A,2)
    H.w8(0x7EE100,0x88)
    for i=0,4 do H.w8(0x7E0A50+i,0x14+i) end
    -- Neighboring HUD bytes belong to the companions.
    for i=0,4 do H.w8(0x7E0A60+i,0x24+i) end
  end,emu.callbackType.exec,0x00B073,0x00B073)
  local check = emu.addMemoryCallback(function()
    if not injected or checked then return end
    checked=true
    C.check(H.r8(0x7EE1ED)==0,'Goku stamina countdown cleared before upload')
    C.check(H.r8(0x7EE063)==0 and H.r8(0x7EE01A)==0,'native charge latch cleared')
    C.check(H.r8(0x7EE100)&8==0,'native charged sparkle retired')
    for i=0,4 do
      C.check(H.r8(0x7E0A50+i)==0,'stale meter byte '..i..' cleared')
      C.check(H.r8(0x7E0A60+i)==0x24+i,'companion meter byte '..i..' preserved')
    end
  end,emu.callbackType.exec,0x00B077,0x00B077)
  H.wait(5)
  emu.removeMemoryCallback(seed,emu.callbackType.exec,0x00B073,0x00B073)
  emu.removeMemoryCallback(check,emu.callbackType.exec,0x00B077,0x00B077)
  C.check(checked,'completed a seeded field frame')
  H.hold('l y',20)
  C.check(H.r8(C.CB+0x28)~=0 and H.r16(C.CB+0x26)>5,'Goku ki charge still builds')
  C.check(H.r8(0x7EE1ED)==0,'ki charging never charges the native weapon meter')
  H.wait(35)
  H.hold('b',20)
  C.check(H.r8(0x7EE1ED)==0,'punching never charges the native weapon meter')
  H.wait(25)
  -- No cleanup when Goku is inactive: the original hero keeps his weapon.
  H.w8(0x316001,0)
  H.wait(3)
  H.w8(0x7EE1ED,50)
  H.wait(3)
  C.check(H.r8(0x7EE1ED)>0,'native hero stamina remains enabled')
  H.result('failures',C.failures)
end
