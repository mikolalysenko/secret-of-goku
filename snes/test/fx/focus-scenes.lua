local rows,measuring,request,start,current={},false,false,nil,nil
local lag,unsafe,overflows,fxSum,fxN,fxMax,flightFrames,scouterFrames=0,0,0,0,0,0,0,0
local readoutFrames=0
local maxSprites,maxSlivers=0,0
local crowded=nil
local auraOverflowFrames=0
local addresses={0xE4,0xE5,0xE000,0xE02C,0xEC,0xED,0xD0,0xE190,0xE191}
emu.addMemoryCallback(function()
  if not measuring then return end
  request=false;start=emu.getState().masterClock
  local ram={};for _,a in ipairs(addresses) do ram[tostring(a)]=H.r8(0x7E0000+a) end
  current={ram=ram,clock=H.r16(0x7ED80C),act=H.r8(0x7ED814),power=H.r16(0x7ED82E),
    charging=H.r8(0x7ED828),charge=H.r16(0x7ED826),pose=H.r8(0x7EE011),menu=H.r8(0x7ED801)}
end,emu.callbackType.exec,SYM.fx_frame,SYM.fx_frame)
emu.addMemoryCallback(function() if measuring then request=true end end,emu.callbackType.exec,SYM.fx_k_aura_obj,SYM.fx_k_aura_obj)
emu.addMemoryCallback(function()
  if not measuring or not current then return end
  current.free=H.r16(0x317820);current.pal=H.r16(0x317822)
  current.x=H.r16(0x7EE020);current.y=H.r16(0x7EE022);current.lift=H.r16(0x7EE045)
end,emu.callbackType.exec,SYM.fx_finish,SYM.fx_finish)
emu.addMemoryCallback(function()
  if not measuring or not start then return end
  local d=(emu.getState().masterClock-start)/1364
  fxSum=fxSum+d;fxN=fxN+1;fxMax=math.max(fxMax,d);start=nil
end,emu.callbackType.exec,SYM.ui_sc_draw_frame,SYM.ui_sc_draw_frame)
emu.addMemoryCallback(function()
  if measuring and H.r8(0x7E00EC)&1==0 then lag=lag+1 end
end,emu.callbackType.exec,0x00C0A8,0x00C0A8)
local function dma(_,v)
  if not measuring or v==0 then return end
  local s=emu.getState()
  if s['cpu.k']~=0xAE then return end
  if s['ppu.scanline']<225 and (not s['ppu.forcedBlank'] or H.r8(0x7E002C)~=0) then unsafe=unsafe+1 end
end
for _,bank in ipairs({0,0x80}) do
  emu.addMemoryCallback(dma,emu.callbackType.write,(bank<<16)|0x420B,(bank<<16)|0x420B)
end
emu.addMemoryCallback(function()
  if not measuring or not current then return end
  local tiles={}
  for i=0,14 do
    if AURA_CELLS[H.r16(0x317840+i*2)] then tiles[H.r16(SYM.fx_entry_tile+i*2)&511]=true end
  end
  local count,palette=0,true
  local sprites,slivers,auraRows,entriesByLine={},{},{},{}
  for i=0,127 do
    local a,t=H.oam(i*4+3),H.oam(i*4+2)
    local hi=(H.oam(512+(i>>2))>>((i&3)*2))&3
    local x=H.oam(i*4)-((hi&1)~=0 and 256 or 0)
    local y=H.oam(i*4+1);if y>=224 then y=y-256 end
    local size=(hi&2)~=0 and 32 or 16 -- field OBJSEL $63
    local isAura=H.oam(i*4+1)<224 and tiles[t|((a&1)<<8)]
    local columns=0
    for xx=x,x+size-1,8 do if xx+8>0 and xx<256 then columns=columns+1 end end
    if columns>0 then for yy=math.max(0,y),math.min(223,y+size-1) do
      sprites[yy]=(sprites[yy] or 0)+1;slivers[yy]=(slivers[yy] or 0)+columns
      entriesByLine[yy]=entriesByLine[yy] or {}
      entriesByLine[yy][#entriesByLine[yy]+1]={columns=columns,aura=isAura}
    end end
    if isAura then
      count=count+1
      for yy=math.max(0,y),math.min(223,y+15) do auraRows[yy]=true end
      local p=(a>>1)&7
      local class=H.r8(0x7ED811)==0 and 0 or 2
      for c=2,31 do if H.cgram(256+p*32+c)~=H.r8(SYM.fx_class_palettes+class*32+c) then palette=false;break end end
    end
  end
  -- Native HUD/boss rows away from the flame are not an aura overflow.
  local overflow=false
  for yy in pairs(auraRows) do
    maxSprites=math.max(maxSprites,sprites[yy] or 0);maxSlivers=math.max(maxSlivers,slivers[yy] or 0)
    -- Evaluation retains the first 32 objects; sliver fetch runs in the
    -- opposite order and keeps 34. Count loss of the aura itself, not an
    -- unrelated native sprite earlier in OAM on an already crowded row.
    local entries=entriesByLine[yy] or {}
    for i=33,#entries do if entries[i].aura then overflow=true end end
    local left=34
    for i=math.min(32,#entries),1,-1 do
      if entries[i].aura and left<entries[i].columns then overflow=true end
      left=math.max(0,left-entries[i].columns)
    end
    if not crowded and (slivers[yy] or 0)>34 then
      local entries={}
      for i=0,127 do
        local hi=(H.oam(512+(i>>2))>>((i&3)*2))&3
        local y=H.oam(i*4+1);if y>=224 then y=y-256 end
        local size=(hi&2)~=0 and 32 or 16
        if yy>=y and yy<y+size then entries[#entries+1]={i=i,x=H.oam(i*4),y=y,hi=hi,tile=H.oam(i*4+2),attr=H.oam(i*4+3)} end
      end
      crowded={clock=current.clock,y=yy,entries=entries}
    end
  end
  current.auraOverflow=overflow
  if overflow then auraOverflowFrames=auraOverflowFrames+1 end
  current.sprites=count;current.palette=palette;current.request=request
  current.pending=H.r16(0x317880)
  rows[#rows+1]=current;current=nil
  if H.r8(0x00213E)&0xC0~=0 then overflows=overflows+1 end
  if H.r8(0x7ED900)&1~=0 then flightFrames=flightFrames+1 end
  if H.r16(0x7E7EEE)&2~=0 then scouterFrames=scouterFrames+1 end
  if H.r16(0x7E7E90)~=0 then readoutFrames=readoutFrames+1 end
end,emu.callbackType.exec,0x00B07D,0x00B07D)
function test()
  H.wait(5);assert(H.importSnesJs(BUNDLE),'import failed')
  H.w8(0x316001,1);H.wait(45)
  H.w8(0x7ED811,FORM);H.w8(0x7ED740,FORM)
  if SCOUTER==1 then
    H.w8(0x7ECFAB,2);H.w8(0x316380,0x78)
    H.w16(0x7E7E40,H.r16(0x7E7E40)&~0x10) -- wake as the real ring switch does
    H.wait(40)
  end
  if WRECK then H.w16(0x316110,1);H.wait(60) end
  for buttons,n in SETUP:gmatch('([^,:]+):(%d+)') do
    H.input={};for b in buttons:gmatch('[^+]+') do if b~='none' then H.input[b]=true end end;H.wait(tonumber(n))
  end
  measuring=true
  for i=1,180 do
    H.input={l=true}
    if WALK==1 then H.input[(i//8)%2==0 and 'left' or 'right']=true end
    H.wait(1)
    if i>=150 and i<=152 then H.shot('focus-'..i) end
  end
  measuring=false;H.input=nil
  H.result('rows',rows);H.result('heldFrames',180);H.result('lag',lag);H.result('unsafe',unsafe)
  H.result('overflows',overflows);H.result('flightFrames',flightFrames)
  H.result('scouterFrames',scouterFrames)
  H.result('readoutFrames',readoutFrames)
  H.result('maxSprites',maxSprites);H.result('maxSlivers',maxSlivers)
  H.result('crowded',crowded)
  H.result('auraOverflowFrames',auraOverflowFrames)
  H.result('fxMean',fxSum/math.max(1,fxN));H.result('fxMax',fxMax)
end
