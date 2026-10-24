-- Let the retail engine remove control and apply each status before L.
-- The party case catches the regression hidden by solo-only recovery tests.
function test()
  H.wait(5)
  local rows = {}
  for _, c in ipairs({{'stone-solo',0x40,true},{'stone-party',0x40,false},
      {'sleep',0x10,false},{'frosty',0x20,false},{'balloon',0x100,false},{'engulf',0x4000,false}}) do
    H.w8(0x316001,1); H.w8(0x316200,0)
    assert(C.import('graphics-audit__party'))
    H.w8(0x316001,1); H.w8(0x316200,0); H.wait(4)
    if c[3] then H.w8(0x7EE200,0); H.w8(0x7EE400,0) end
    H.w16(0x7EE184,999); H.w16(0x7EE182,700)
    H.w16(0x7EE190,c[2]); H.wait(90)
    C.check(H.r16(0x7EE190)&c[2]~=0,c[1]..': status took effect')
    C.check(H.r8(C.CB+0x12)==0,c[1]..': native status prevents attacking')
    if c[2]==0x40 then
      C.check(H.r8(0x7EE02C)&1==0,c[1]..': native engine removed controller')
      C.check((H.r8(0x7EE22C)|H.r8(0x7EE42C))&1==0,c[1]..': nobody else owns player 1')
    end
    if not c[3] then C.check((H.r8(0x7EE200)|H.r8(0x7EE400))&1~=0,c[1]..': companions are present') end
    local hp = H.r16(0x7EE182)
    H.hold('l',2)
    C.check(H.r16(0x7EE190)&0x4170==0,c[1]..': Focus clears the status')
    local waited = 0
    while (H.r8(C.CB+0x12)==0 or H.r8(C.CB+0x3A)~=0) and waited<90 do
      H.hold('l',1); waited=waited+1
    end
    C.check(H.r8(C.CB+0x12)==1 and H.r8(0x7EE02C)&1==1,c[1]..': native cleanup restores control')
    C.check(H.r16(C.CB+0x3C)&c[2]~=0,c[1]..': recovery recorded the broken status')
    for i=1,40 do
      H.w16(0x7EE190,c[2])
      -- The probe may land before combat in a video frame; wait for the
      -- field update to consume the injected status, not just one vblank.
      H.waitFor(function() return H.r16(0x7EE190)&0x4170==0 end,4)
      C.check(H.r16(0x7EE190)&0x4170==0,c[1]..': resistance at frame '..i)
    end
    C.check(H.r16(0x7EE182)<=hp,c[1]..': recovery does not heal')
    H.wait(140); H.w16(0x7EE190,c[2]); H.wait(8)
    C.check(H.r16(0x7EE190)&c[2]~=0,c[1]..': resistance expires')
    H.hold('l a',4)
    C.check(H.r16(0x7EE190)&0x4170==0,c[1]..': transform chord also recovers')
    rows[#rows+1]={name=c[1],waited=waited}
  end
  H.result('rows',rows)
  H.result('failures',C.failures)
end
