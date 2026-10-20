-- Production quest providers, not the UI_TEST stub: follow the route,
-- theft / Tree pursuit, Dryad, crisis, destroyed Fortress and final wish.
local UI, STORY, FZ = 0x7E7E40, 0x316040, 0x316180
function test()
  H.wait(5)
  W.import('preset__flight')
  H.w8(0x316380,1)             -- first-flight banter already delivered
  W.on(0)
  H.wait(90)
  H.save('ready')
  local cases = {
    {name='water',mask=0,seeds=0,dormant=true},
    {name='earth',mask=1,seeds=1,dormant=true},
    {name='wind',mask=3,seeds=3,dormant=true},
    {name='fire',mask=7,seeds=7,dormant=true},
    {name='shade_before_light',mask=15,seeds=15,dormant=true},
    {name='light',mask=47,seeds=47,dormant=true},
    {name='moon',mask=63,seeds=63,dormant=true},
    {name='dryad_eligible',mask=127,seeds=127,dormant=true,eligible=true},
    {name='dryad_dormant',mask=127,seeds=127,dormant=true,gone=true},
    {name='tree_pursuit',mask=127,seeds=127,stolen=true,needsTree=true},
    {name='fortress_stolen',mask=127,seeds=127,stolen=true,tree=4},
    {name='fortress',mask=127,seeds=127,tree=4},
    {name='beast',mask=127,seeds=127,tree=4,gone=true,continue=true},
    {name='crisis',mask=127,seeds=127,tree=4,crisis=true},
    {name='wished',mask=127,seeds=127,tree=4,wished=true},
  }
  local samples={}
  for _,c in ipairs(cases) do
    if not c.continue then H.load(H_OUT .. '/ready.mss'); H.wait(4) end
    H.w8(STORY,1); H.w8(STORY+1,c.mask); H.w8(STORY+2,c.seeds); H.w8(STORY+4,c.wished and 1 or 0)
    H.w8(FZ,1); H.w8(FZ+1,c.dormant and 0 or 3); H.w8(FZ+2,c.tree or 0)
    H.w16(FZ+3,c.stolen and 4 or 0); H.w8(FZ+5,c.stolen and 127 or 0)
    H.w8(FZ+6,c.crisis and 11 or 0) -- crisis active, notification already delivered
    H.w8(0x7EDB00,0xA5)          -- load hook already validated this saved block
    H.w8(0x7ECF4E,0); H.w8(0x7ECFAF,0)
    H.w8(W.PW,c.gone and 1 or 0)
    H.w8(0x316380,1)             -- skip first-flight banter
    H.wait(60)                   -- real refresh cadence and staged text upload
    c.on=H.r16(UI+0x68)~=0; c.target=H.r16(UI+0x62)
    c.tx=H.r16(UI+0x6E); c.ty=H.r16(UI+0x70)
    c.fx=H.r16(0x7E0128); c.fy=H.r16(0x7E012A)
    c.flags=H.r16(UI+0x6A); c.text={}
    for i=0,83 do c.text[#c.text+1]=H.r16(0x337E40+i*2)/2+0x80 end
    local expected=(c.wished and 1 or 0)|(c.needsTree and 2 or 0)|(c.stolen and 4 or 0)|
      (c.eligible and 8 or 0)|(c.dormant and 16 or 0)|(c.crisis and 32 or 0)|(c.gone and 64 or 0)
    W.check(c.name .. '_flags',c.flags==expected,string.format('%04X expected %04X',c.flags,expected))
    samples[#samples+1]=c
    H.shot(c.name)
  end
  H.result('samples',samples)
  W.finish()
end
