-- The native status path queues HP-number redraws during ordinary field
-- play. Verify actual HUD tiles, bounded NMI work, coalescing and the
-- original synchronous path before Goku arrives.
function test()
  check('import',H.importSnesJs(IMPORT_DIR..'/graphics-audit__party'),'party fixture')
  H.w8(LIVE+1,1)
  H.wait(20)
  for i=3,11 do H.w8(0x7EE000+i*512,0) end
  local waits,draws,late=0,0,0
  local longest,start=0,nil
  local scratch,badScratch=nil,0
  local cb={}
  local function watch(pc,fn)
    cb[#cb+1]={emu.addMemoryCallback(fn,emu.callbackType.exec,pc,pc),pc}
  end
  watch(0x81E0F9,function() waits=waits+1 end)
  watch(0x81E339,function() start=emu.getState().masterClock;draws=draws+1 end)
  watch(0x81E368,function()
    if start then longest=math.max(longest,(emu.getState().masterClock-start)/1364);start=nil end
  end)
  watch(HP_NMI,function() scratch=H.dump(emu.memType.snesWorkRam,0,0x108) end)
  watch(HP_NMI_END,function()
    if scratch~=H.dump(emu.memType.snesWorkRam,0,0x108) then badScratch=badScratch+1 end
  end)
  local writes=emu.addMemoryCallback(function()
    local s=emu.getState()
    if s['cpu.k']==0x81 and s['cpu.pc']>=0xE369 and s['cpu.pc']<=0xE3F9
      and (s['ppu.scanline']<225 or s['ppu.scanline']>=262) then late=late+1 end
  end,emu.callbackType.write,0x002118,0x002118)
  local function numbers(values)
    for i,v in ipairs(values) do
      H.w16(0x7EE182+(i-1)*512,v[1]);H.w16(0x7EE184+(i-1)*512,v[2])
    end
  end
  local function tiles(tag,values)
    for i,v in ipairs(values) do
      local offset=H.r8(0x7E0A55+(i-1)*16)
      local a=(0x5B00+offset-0x20)*2
      local text=string.format('%3d/%-3d',v[1],v[2])
      local bad={}
      for j=1,7 do
        local c=text:sub(j,j)
        local want=c==' ' and 0x13 or c=='/' and 0x12 or tonumber(c)+8
        local got=H.vram(a+(j-1)*2)
        if got~=want then bad[#bad+1]=j..':'..got..'/'..want end
      end
      check(tag..'_actor'..i,offset~=0 and #bad==0,table.concat(bad,','))
    end
  end
  local values={{1,999},{42,321},{100,500}}
  numbers(values)
  check('queued',command(8)==0,'refresh entry returned')
  check('published',H.waitFor(function() return H.r8(CORE_SAFE+0x1E)==0 end,8),'pending HP redraw')
  tiles('queued',values)
  check('no_wait',waits==0,waits)
  check('one_draw',draws==1,draws)

  -- Leave insufficient headroom for the redraw: it must remain pending
  -- instead of writing into the visible frame, then publish when free.
  setct(0x4A,500)
  H.wait(2)
  values={{9,999},{99,100},{999,999}}
  numbers(values)
  check('late_queued',command(8)==0,'refresh entry returned')
  H.wait(2)
  check('late_deferred',H.r8(CORE_SAFE+0x1E)==1,'late NMI consumed redraw')
  check('coalesced',command(8)==0,'repeated request returned')
  setct(0x4A,0)
  check('retry',H.waitFor(function() return H.r8(CORE_SAFE+0x1E)==0 end,8),'redraw did not retry')
  tiles('retry',values)
  check('no_late_writes',late==0,late)
  check('redraw_budget',longest<12,'redraw '..longest..' scanlines')
  check('scratch_preserved',badScratch==0,'NMI changed DP/interrupt vectors '..badScratch..' times')

  H.w8(LIVE+1,0)
  values={{12,999},{7,89},{88,900}}
  numbers(values)
  check('native',command(8)==0,'retail refresh returned')
  tiles('native',values)
  check('native_wait',waits>0,'retail wait not exercised')
  for _,c in ipairs(cb) do emu.removeMemoryCallback(c[1],emu.callbackType.exec,c[2],c[2]) end
  emu.removeMemoryCallback(writes,emu.callbackType.write,0x002118,0x002118)
  H.result('maxRedrawLines',longest);H.result('draws',draws);H.result('waits',waits)
  finish()
end
