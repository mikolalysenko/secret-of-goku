-- Force incomplete world NMIs while each flyby picture type is up.
-- Alternate the two native palette buffers and core's ready word, including
-- its ready-before-$EC handshake gap. Observe CGRAM before/after the actual
-- native transfer; restore the test-only request bits at the NMI return.
function F.flybyLagStart(d)
  local ages={[80]=true,[180]=true,[330]=true,[360]=true,[376]=true,[398]=true,[406]=true,[408]=true,[438]=true,[476]=true,[510]=true}
  local seen, pending, palette = {}, nil, nil
  local stats={forced=0,checked=0,objBad=0,bgBad=0,skyBad=0,readyGap=0,base=0,alternate=0}
  emu.addMemoryCallback(function()
    local age=H.r16(d.age)
    if not ages[age] or seen[age] or H.r16(d.magic)~=0xF17B then return end
    seen[age]=true
    pending={age=age,ec=H.r8(0x7E00EC),ready=H.r16(d.ready)}
    stats.forced=stats.forced+1
    H.w8(0x7E00EC,pending.ec&0xFE)
    local ready=stats.forced%2
    H.w16(d.ready,ready)
    stats.readyGap=stats.readyGap+ready
  end,emu.callbackType.exec,0x0088CF)
  emu.addMemoryCallback(function()
    if not pending then return end
    pending.e3=H.r8(0x7E00E3);pending.f4=H.r8(0x7E00F4);pending.f5=H.r8(0x7E00F5)
    local base=stats.forced%2==0
    H.w8(0x7E00E3,pending.e3|0x40)
    H.w8(0x7E00F4,base and 2 or 0)
    H.w8(0x7E00F5,pending.f5&0xFE)
    pending.src=base and 0x7E0600 or 0x7EDE00
    stats[base and 'base' or 'alternate']=stats[base and 'base' or 'alternate']+1
    palette={}
    for i=0,511 do palette[i]=H.cgram(i) end
  end,emu.callbackType.exec,0x008A79)
  emu.addMemoryCallback(function()
    if not palette then return end
    for i=416,511 do
      if H.cgram(i)~=palette[i] then stats.objBad=stats.objBad+1;break end
    end
    local sky=pending.age>=380 and pending.age<404
    if sky and (H.cgram(0)~=palette[0] or H.cgram(1)~=palette[1]) then stats.skyBad=stats.skyBad+1 end
    for i=sky and 2 or 0,255 do
      local want=H.r8(pending.src+i)&(i%2==0 and 255 or 127)
      if H.cgram(i)~=want then
        stats.bgBad=stats.bgBad+1
        stats.firstBg=stats.firstBg or {age=pending.age,at=i,got=H.cgram(i),want=want,src=pending.src}
        break
      end
    end
    stats.checked=stats.checked+1
    H.w8(0x7E00E3,pending.e3);H.w8(0x7E00F4,pending.f4);H.w8(0x7E00F5,pending.f5)
    palette=nil
  end,emu.callbackType.exec,0x008AC1)
  emu.addMemoryCallback(function()
    if not pending then return end
    H.w8(0x7E00EC,pending.ec);H.w16(d.ready,pending.ready)
    pending=nil
  end,emu.callbackType.exec,d.nmiReturn)
  return function()
    H.result('lagPalette',stats)
    F.check(stats.forced==11 and stats.checked==11,'all flyby lag palette probes ran')
    F.check(stats.base>0 and stats.alternate>0 and stats.readyGap>0,'both native sources and ready gap exercised')
    F.check(stats.objBad==0,'flyby OBJ palettes survive incomplete world frames ('..stats.objBad..' wrong transfers)')
    F.check(stats.skyBad==0,'distant ball backdrop survives incomplete world frames')
    F.check(stats.bgBad==0,'native world BG palette transfer remains current')
  end
end
