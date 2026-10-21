-- Real input from the flight preset; sample the completed OAM/VRAM picture
-- after the same NMI that consumes it. JS runs sprite-layer.js as the oracle.
local CB=0x7ED800
local current,start,worldStart,auraStart,nmiAuraStart,prepareStart,nmiStart
local rows,stats={},{}
local tiles={}
for i=0x60,0x6B do tiles[i]=true;tiles[i+16]=true end
for _,i in ipairs({0x6E,0x6F,0x7E,0x7F,0xCE,0xCF,0xDE,0xDF}) do tiles[i]=true end
local function hash(p)
  local h=2166136261
  for i=1,3072 do h=((h ~ (p[i] or 0))*16777619)&0xFFFFFFFF end
  return h
end
local function picture()
  local clock=H.r16(CB+12)
  local bob=({0,-1,0,1})[((H.r16(W.a.anim)>>3)&3)+1]
  local bank=H.r16(W.a.bank);if bank>=32768 then bank=bank-65536 end
  local ox,oy=104+bank*2,36+bob
  local pixels,lines,slivers={},{},{}
  local count,badSize,bodyAfter=0,0,0
  local first=128
  for i=0,127 do
    local e=W.oam(i)
    local size=e.size==0 and 8 or 16
    local y=e.y;if y>=256-size then y=y-256 end
    local cols=0
    for x=e.x,e.x+size-1,8 do if x+8>0 and x<256 then cols=cols+1 end end
    if cols>0 then for yy=math.max(0,y),math.min(223,y+size-1) do
      lines[yy]=(lines[yy] or 0)+1;slivers[yy]=(slivers[yy] or 0)+cols
    end end
    if W.visible(e) and e.pal==7 and tiles[e.tile] then
      count=count+1;first=math.min(first,i)
      if size~=8 then badSize=badSize+1 end
      local at=0xC000+e.tile*32
      for yy=0,7 do
        local a,b,c,d=H.vram(at+yy*2),H.vram(at+yy*2+1),H.vram(at+16+yy*2),H.vram(at+17+yy*2)
        for xx=0,7 do
          local bit=7-xx
          local v=((a>>bit)&1)|(((b>>bit)&1)<<1)|(((c>>bit)&1)<<2)|(((d>>bit)&1)<<3)
          if v~=0 then
            local x0,y0=e.x+xx-ox,y+yy-oy
            if x0>=0 and x0<48 and y0>=0 and y0<64 then pixels[y0*48+x0+1]=W.cgram_word(240+v)+1
            else current.outside=current.outside+1 end
          end
        end
      end
    elseif W.visible(e) and e.pal==5 and i>first then bodyAfter=bodyAfter+1 end
  end
  for yy,n in pairs(lines) do
    current.maxSprites=math.max(current.maxSprites,n)
    current.maxSlivers=math.max(current.maxSlivers,slivers[yy])
    if n>32 or slivers[yy]>34 then current.overflow=current.overflow+1 end
  end
  local r={case=current.name,clock=clock,act=H.r8(CB+0x14),age=H.r16(CB+0x16),duration=H.r16(CB+0x18),
    power=H.r16(CB+0x2E),charge=H.r16(CB+0x26),charging=H.r8(CB+0x28)~=0,
    form=H.r8(W.GOKU),bank=bank,bob=bob,docking=H.r16(W.a.dock)~=0,count=count,hash=hash(pixels),
    badSize=badSize,bodyAfter=bodyAfter}
  rows[#rows+1]=r
  -- Pictures at early/middle/full power and different phases, plus ignition.
  if count>0 and (current.frames%24<2 or r.act==21 and (r.age==12 or r.age==26) or r.act==22) then
    r.picture=current.name..'-'..current.frames
    local f=assert(io.open(H_OUT..'/'..r.picture..'.aura','wb'))
    for i=1,3072 do local c=pixels[i] or 0;f:write(string.char(c&255,c>>8)) end;f:close()
    current.shot=r.picture
  end
end
emu.addMemoryCallback(function()
  if not current then return end
  current.frames=current.frames+1
  if H.r8(0x7E00EC)&1==0 then current.misses=current.misses+1 end
  start=emu.getState().masterClock
end,emu.callbackType.exec,0x0088CF)
emu.addMemoryCallback(function()
  if not current or not start then return end
  local s=emu.getState();local elapsed=(s.masterClock-start)/1364
  current.nmiMax=math.max(current.nmiMax,elapsed)
  if s['ppu.scanline']<225 or elapsed>=37 then current.overruns=current.overruns+1 end
  picture();start=nil
end,emu.callbackType.exec,SYM.core_world_nmi_return)
emu.addMemoryCallback(function() if current then worldStart=emu.getState().masterClock end end,emu.callbackType.exec,SYM.world_world_frame)
emu.addMemoryCallback(function() if current then prepareStart=emu.getState().masterClock end end,emu.callbackType.exec,SYM.world_prepare_frame)
emu.addMemoryCallback(function()
  if current and prepareStart then
    current.prepareSum=current.prepareSum+(emu.getState().masterClock-prepareStart)/1364;prepareStart=nil
  end
end,emu.callbackType.exec,SYM.combat_world_frame)
emu.addMemoryCallback(function() if current then nmiStart=emu.getState().masterClock end end,emu.callbackType.exec,SYM.world_world_nmi)
emu.addMemoryCallback(function()
  if current and nmiStart then
    current.nmiSum=current.nmiSum+(emu.getState().masterClock-nmiStart)/1364;nmiStart=nil
  end
end,emu.callbackType.exec,SYM.fx_world_nmi)
emu.addMemoryCallback(function()
  if current and worldStart then
    local d=(emu.getState().masterClock-worldStart)/1364
    current.worldSum=current.worldSum+d;current.worldN=current.worldN+1;current.worldMax=math.max(current.worldMax,d);worldStart=nil
  end
end,emu.callbackType.exec,SYM.debug_world_frame)
if SYM.world_aura_draw then
  emu.addMemoryCallback(function() if current then auraStart=emu.getState().masterClock end end,emu.callbackType.exec,SYM.world_aura_draw)
  emu.addMemoryCallback(function()
    if current and auraStart then
      current.auraMax=math.max(current.auraMax,(emu.getState().masterClock-auraStart)/1364);auraStart=nil
    end
  end,emu.callbackType.exec,SYM.world_draw_finish)
  emu.addMemoryCallback(function() if current then nmiAuraStart=emu.getState().masterClock end end,emu.callbackType.exec,SYM.world_nmi_aura)
  emu.addMemoryCallback(function()
    if current and nmiAuraStart then
      current.uploadMax=math.max(current.uploadMax,(emu.getState().masterClock-nmiAuraStart)/1364);nmiAuraStart=nil
    end
  end,emu.callbackType.exec,SYM.world_nmi_cell)
end
for _,bank in ipairs({0,0x80}) do
  emu.addMemoryCallback(function(_,value)
    if not current or value==0 then return end
    local s=emu.getState()
    if s['cpu.k']==0xAD and s['ppu.scanline']<225 then current.unsafe=current.unsafe+1 end
  end,emu.callbackType.write,(bank<<16)|0x420B)
end
function test()
  H.wait(5);W.import('preset__flight');H.w8(0x316380,1);W.on(0);H.wait(90);H.save('ready')
  local cases={
    {'idle',0,{{'',180}}},
    {'focus-base',0,{{'l',55},{'l left',55},{'l right',55},{'',12}}},
    {'focus-cold',0,{{'l',100},{'',12}}},
    {'charge-base',0,{{'l y',125},{'',100}}},
    {'focus-ssj',1,{{'l',165},{'',12}}},
    {'charge-ssj',1,{{'l y',95}}}, -- keep charging: release destroys the Fortress here
    {'focus-travel',0,{{'l up',120},{'l left up',60},{'l right up',60}}},
    {'charge-travel',1,{{'l y up',120},{'l y left up',60},{'l y right up',60}}},
    {'transform-first',0,{{'l a',185},{'',12},{'l a',4},{'',25}}},
    {'transform-repeat',0,{{'l a',140},{'',12},{'l a',4},{'',25}}},
    {'revert-api',0,{{'',24}}}, -- configure()/API uses 20; the L+A chord uses 10
  }
  for _,case in ipairs(cases) do
    H.load(H_OUT..'/ready.mss');H.wait(4);W.form(case[2]);H.wait(12)
    H.w8(0x316200,case[1]=='transform-repeat' and 1 or 0)
    if case[1]=='focus-cold' then H.w16(W.a.mode_prev,0) end
    if case[1]=='revert-api' then H.w8(CB+0x14,22);H.w16(CB+0x16,0);H.w16(CB+0x18,20) end
    current={name=case[1],frames=0,misses=0,overruns=0,nmiMax=0,overflow=0,maxSprites=0,maxSlivers=0,
      unsafe=0,outside=0,worldSum=0,prepareSum=0,nmiSum=0,worldN=0,worldMax=0,auraMax=0,uploadMax=0}
    local pendingShot=nil -- NMI's OAM is displayed during the following video frame
    for _,part in ipairs(case[3]) do
      H.input={};for b in part[1]:gmatch('%S+') do H.input[b]=true end
      for _=1,part[2] do
        H.wait(1)
        if pendingShot then H.shot(pendingShot) end
        pendingShot=current.shot;current.shot=nil
      end
    end
    H.input=nil
    local s=current;current=nil;stats[#stats+1]=s
    for _,key in ipairs({'misses','overruns','overflow','unsafe','outside'}) do W.check(s.name..'_'..key,s[key]==0,s[key]) end
  end
  H.result('rows',rows);H.result('stats',stats);W.finish()
end
