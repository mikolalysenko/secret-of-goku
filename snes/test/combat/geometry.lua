-- Check the cartridge against the attack definition (along/across), with
-- inclusive edges, all four facings, short/long ranges and native filters.
function test()
  H.wait(5)
  assert(C.import('animation-audit__native__rabite-field-b'))
  H.w8(0x316001,1)
  H.wait(5)
  local queries=0
  local dirs={{0,1},{1,0},{-1,0},{0,-1}}
  for face=0,3 do
    local dx,dy=table.unpack(dirs[face+1])
    for shape=0,3 do
      local range=({0,32,256,512})[shape+1]
      local width=({0,16,40,64})[shape+1]
      local behind=({0,8,16,40})[shape+1]
      for sample=0,11 do
        local ox,oy=600,600
        local cy=sample%2==0 and 12 or 0
        local alongs={-behind-1,-behind,0,range,range+1}
        local acrosses={-width-1,-width,0,width,width+1}
        local want=0
        for slot=3,11 do
          local j=slot-3
          local along=alongs[(j+sample)%5+1]
          local across=acrosses[(j*2+sample)%5+1]
          local x=ox+dx*along+dy*across
          local y=oy+cy+dy*along-dx*across
          local active,sp,hp,status=1,0,40,0
          if sample>=6 then
            if j==sample-6 then active=0
            elseif j==(sample-5)%9 then sp=128
            elseif j==(sample-4)%9 then hp=0
            elseif j==(sample-3)%9 then status=0x80 end
          end
          local a=0x7EE000+slot*0x200
          H.w8(a,active); H.w16(a+2,x); H.w16(a+4,y)
          H.w8(a+0x180,sp); H.w16(a+0x182,hp); H.w8(a+0x191,status)
          if active==1 and sp<128 and hp>0 and status&0x80==0 and along>=-behind and along<=range and math.abs(across)<=width then
            want=want|(1<<j)
          end
        end
        for i,v in ipairs({ox,oy,face,range,width,behind,cy}) do H.w16(C.CB+0x90+(i-1)*2,v) end
        H.w16(0x317F00,4)
        assert(H.waitFor(function() return H.r16(0x317F00)==0 end,10),'query timed out')
        local got=H.r16(0x317F02)&0x1FF
        C.check(got==want,string.format('geometry facing %d shape %d sample %d: %03X != %03X',face,shape,sample,got,want))
        queries=queries+1
      end
    end
  end
  H.result('queries',queries)
  H.result('failures',C.failures)
end
