-- Paired runs of the same live five-actor Rabite field, without readings
-- and with an Analyzer reading on every actor. The native RNG depends on
-- idle CPU time, so the lag comparison uses perf/run.mjs's 3% tolerance;
-- separately forbid any vblank crossing during readout work. Each reading
-- comes from the game's spell landing (snes/test/lua/analyzer.lua), without
-- the cast itself: the game's own Analyzer window is not part of the budget.
local active,count,start,before,current,worked=false,0,0,0,0,false
local costs,lines={},{}
local visible,full,numbers,overruns,maxActors,maxSprites,maxSlivers=0,0,0,0,0,0,0
local function finalOam()
  if not active then return end
  count=count+1
  local sprites,slivers={},{}
  for i=0,127 do
    local at=0x7E0800+i*4
    local hi=(H.r8(0x7E0A00+(i>>2))>>((i&3)*2))&3
    local x=H.r8(at)-((hi&1)~=0 and 256 or 0)
    local y=H.r8(at+1);if y>=224 then y=y-256 end
    local size=(hi&2)~=0 and 32 or 16
    if x+size>0 and x<256 then for yy=math.max(0,y),math.min(223,y+size-1) do
      sprites[yy]=(sprites[yy] or 0)+1;slivers[yy]=(slivers[yy] or 0)+size//8
      maxSprites=math.max(maxSprites,sprites[yy]);maxSlivers=math.max(maxSlivers,slivers[yy])
    end end
  end
end
function test()
  enter(BUNDLE)
  H.w8(0x7ECFAB,2)
  H.wait(40)
  assert(H.saveStable('crowd',120),'no stable crowd state')
  local hooks={}
  local function hook(addr,fn)
    hooks[#hooks+1]={emu.addMemoryCallback(fn,emu.callbackType.exec,addr,addr),addr}
  end
  hook(0x00B077,finalOam)
  hook(SYM.ui_sc_draw_frame,function()
    start=emu.getState().masterClock;before=H.r16(0x7ED8C4);current=H.r16(0x7ED8C6);worked=false
    if active then lines[#lines+1]=emu.getState()['ppu.scanline'] end
  end)
  hook(SYM.ui_sc_draw_frame_prepared,function() worked=true end)
  hook(SYM.destroy_late_frame,function()
    if not active then return end
    costs[#costs+1]=(emu.getState().masterClock-start)/1364
    if worked and before==current and H.r16(0x7ED8C4)~=before then overruns=overruns+1 end
    local n=ui(0x50);if n~=0 then visible=visible+1 end
    if n&0x1F==0x1F then full=full+1 end
    local actors=0;for i=0,12 do if n&(1<<i)~=0 then actors=actors+1 end end
    numbers=numbers+actors;maxActors=math.max(maxActors,actors)
  end)
  local hits=0
  local h=emu.addMemoryCallback(function() hits=hits+1 end,emu.callbackType.exec,SYM.ui_sc_analyzer_hit,SYM.ui_sc_analyzer_hit)
  local result={}
  for _,charge in ipairs({false,true}) do for _,on in ipairs({false,true}) do
    H.load(H_OUT..'/crowd.mss');H.wait(3)
    setui(0,ui(0)&~0x10)
    if on then Analyzer.crowd() end
    H.wait(30)
    count=0;costs={};lines={};visible=0;full=0;numbers=0;overruns=0;maxActors=0;maxSprites=0;maxSlivers=0;active=true
    if charge then H.hold('l y',200) else H.wait(200) end
    active=false
    local sum,max=0,0;for _,d in ipairs(costs) do sum=sum+d;max=math.max(max,d) end
    table.sort(lines)
    result[(charge and 'charge_' or 'idle_')..(on and 'on' or 'off')]={frames=200,reached=count,lag=200-count,visible=visible,full=full,numbers=numbers,maxActors=maxActors,overruns=overruns,maxSprites=maxSprites,maxSlivers=maxSlivers,mean=sum/math.max(1,#costs),max=max,start=lines[math.max(1,#lines//2)]}
  end end
  emu.removeMemoryCallback(h,emu.callbackType.exec,SYM.ui_sc_analyzer_hit,SYM.ui_sc_analyzer_hit)
  H.result('budget',result)
  check('analyzer_hits',hits>=10,hits)
  for _,h in ipairs(hooks) do emu.removeMemoryCallback(h[1],emu.callbackType.exec,h[2],h[2]) end
  finish()
end
