function test()
  H.wait(5)
  assert(H.importSnesJs(BUNDLE), 'scene import failed')
  H.w8(0x316001, 1)
  if PCM then assert(injectExtension(), 'audio extension injection failed') end
  H.wait(45)
  local grid={};for i=0,0x3FFF do grid[i]=H.r8(0x7F0000+i) end
  for buttons,n in SETUP:gmatch('([^,:]+):(%d+)') do
    H.input={};for b in buttons:gmatch('[^+]+') do if b~='none' then H.input[b]=true end end
    H.wait(tonumber(n))
  end
  H.input=nil
  local grassCuts=0
  for i=0,0x3FFF do if grid[i]~=0 and H.r8(0x7F0000+i)==0 then grassCuts=grassCuts+1 end end
  local measuring = false
  local done, frames, paletteErrors, staminaFrames = 0, 0, 0, 0
  local started, maxLogic = nil, 0
  local timing, active, writes = {}, {}, {}
  local parts = {}
  local hot, inside = {}, false
  local misses, overflows = {}, 0
  local nmiStart, nmiOverruns, maxNmi = nil, 0, 0
  local nmiParts, lateNmis = {}, {}
  local nmiFrames, visibleFrames, flightFrames = 0, 0, 0
  local actions, maps = {}, {}
  local forms,sounds={},{}
  local maxPower,auraFrames,maxAuraSprites,auraBgWrites=0,0,0,0
  local x0,y0=H.r16(0x7EE002),H.r16(0x7EE004)
  local maxTravel=0
  if SETUP~="" then emu.addMemoryCallback(function()
    if not measuring then return end
    local act=H.r8(0x7ED814)
    local s=emu.getState()
    if (act==24 or act==21) and s['cpu.k']==0xAE and s['ppu.cgramAddress']<128 then auraBgWrites=auraBgWrites+1 end
  end,emu.callbackType.write,0x002122,0x002122) end
  emu.addMemoryCallback(function()
    if measuring then nmiStart=emu.getState()['masterClock']; nmiParts={}; nmiFrames=nmiFrames+1 end
    if measuring and H.r8(0x7E00EC)&1==0 then
      local s=emu.getState(); local sp=s['cpu.sp'] or s['cpu.s']
      misses[#misses+1]={frame=H.frame, ec=H.r8(0x7E00EC), phase=H.r8(0x7E0056), sp=sp, parts=parts,
        pc=sp and H.r16(sp+2) or 0, bank=sp and H.r8(sp+4) or 0}
    end
  end,emu.callbackType.exec,0x00C0A8,0x00C0A8)
  emu.addMemoryCallback(function()
    if not measuring or not nmiStart then return end
    local s=emu.getState()
    local lines=(s['masterClock']-nmiStart)/1364
    maxNmi=math.max(maxNmi,lines)
    if s['ppu.scanline']<225 or lines>=37 then
      nmiOverruns=nmiOverruns+1
      lateNmis[#lateNmis+1]={frame=H.frame,phase=H.r8(0x7E0056),parts=nmiParts,line=s['ppu.scanline'],duration=lines}
    end
    nmiStart=nil
  end,emu.callbackType.exec,0x00C16F,0x00C16F) -- final RTI, including the joypad/clock hook
  if PROFILE_NATIVE then
    emu.addMemoryCallback(function() inside=measuring end,emu.callbackType.exec,0x00B08C,0x00B08C)
    emu.addMemoryCallback(function() inside=false end,emu.callbackType.exec,0x00B077,0x00B077)
    emu.addMemoryCallback(function(addr)
      if inside then local k=string.format('%06X',addr); hot[k]=(hot[k] or 0)+1 end
    end,emu.callbackType.exec,0,0xFFFFFF)
  end
  for _, p in ipairs(SPANS) do
    timing[p[1]] = {sum=0, n=0, max=0}
    emu.addMemoryCallback(function()
      if measuring then active[p[1]] = emu.getState()['masterClock'] end
    end, emu.callbackType.exec, p[2], p[2])
    emu.addMemoryCallback(function()
      local t = active[p[1]]
      if t then
        local lines = (emu.getState()['masterClock'] - t) / 1364
        local a = timing[p[1]]; a.sum=a.sum+lines; a.n=a.n+1; a.max=math.max(a.max,lines)
        parts[p[1]]=lines
        if p[1]:sub(1,4)=='nmi_' then nmiParts[p[1]]=lines end
        active[p[1]] = nil
      end
    end, emu.callbackType.exec, p[3], p[3])
  end
  emu.addMemoryCallback(function()
    if measuring then started = emu.getState()['masterClock']; parts={} end
  end, emu.callbackType.exec, 0x00B08C, 0x00B08C)
  emu.addMemoryCallback(function()
    if not measuring then return end
    done = done + 1
    if started then maxLogic=math.max(maxLogic,(emu.getState()['masterClock']-started)/1364) end
  end, emu.callbackType.exec, 0x00B077, 0x00B077)
  emu.addMemoryCallback(function(addr,value)
    if not measuring or value == 0 then return end
    local s=emu.getState(); local key=string.format('%02X:%04X',s['cpu.k'],s['cpu.pc'])
    writes[key]=(writes[key] or 0)+1
  end, emu.callbackType.write, 0x7EE1ED, 0x7EE1ED)
  -- The completed frame has uploaded both native and module OAM/palettes.
  emu.addMemoryCallback(function()
    if not measuring then return end
    local act=H.r8(0x7ED742)
    actions[tostring(act)]=(actions[tostring(act)] or 0)+1
    local form=tostring(H.r8(0x7ED811));forms[form]=(forms[form] or 0)+1
    maxPower=math.max(maxPower,H.r16(0x7ED82E))
    if SETUP~="" then
      local auraTiles={}
      for i=0,14 do
        local cell=H.r16(0x317840+i*2)
        if AURA_CELLS[cell] then auraTiles[H.r16(FX_TILES+i*2)&0x1FF]=true end
      end
      local aura=0
      for i=0,127 do
        if H.oam(i*4+1)<224 and auraTiles[(H.oam(i*4+2)|(H.oam(i*4+3)<<8))&0x1FF] then aura=aura+1 end
      end
      if aura>0 then auraFrames=auraFrames+1;maxAuraSprites=math.max(maxAuraSprites,aura) end
    end
    maps[tostring(H.r16(0x7E00DC))]=true
    if H.r8(0x7ED900)&1~=0 then flightFrames=flightFrames+1 end
    maxTravel=math.max(maxTravel,math.abs(H.r16(0x7EE002)-x0)+math.abs(H.r16(0x7EE004)-y0))
    if H.r8(0x7EE1ED) ~= 0 then staminaFrames=staminaFrames+1 end
    if H.r8(0x7ED786)==0 then return end
    local bad,visible=false,false
    for i=0,127 do
      local t=H.oam(i*4+2); local a=H.oam(i*4+3)
      if a & 1 ~= 0 and ((t>=0xC0 and t<=0xC7) or (t>=0xD0 and t<=0xD7)) and H.oam(i*4+1)<224 then
        visible=true
        local pal=(a>>1)&7
        for c=4,31 do
          if H.cgram(256+pal*32+c)~=H.r8(0x7ED7B0+c) then bad=true break end
        end
      end
    end
    if visible then visibleFrames=visibleFrames+1 end
    if bad then paletteErrors=paletteErrors+1 end
  end, emu.callbackType.exec, 0x00B07D, 0x00B07D)
  measuring=true
  for buttons,n in SCRIPT:gmatch('([^,:]+):(%d+)') do
    H.input={}; for b in buttons:gmatch('[^+]+') do if b~='none' then H.input[b]=true end end
    for i=1,tonumber(n) do
      H.wait(1); frames=frames+1
      if H.r8(0x00213E)&0xC0~=0 then overflows=overflows+1 end
      for v=0,7 do
        if aram(0xAE)&(1<<v)~=0 and dsp(v*16+8)>0 then
          local id=tostring(aram(0xFF80+v));sounds[id]=(sounds[id] or 0)+1
        end
      end
    end
  end
  H.input=nil; measuring=false
  local chargeTailVoices=0
  for v=0,7 do
    local id=aram(0xFF80+v)
    if aram(0xAE)&(1<<v)~=0 and (id==0xDF or id==0xE0) then chargeTailVoices=chargeTailVoices+1 end
  end
  local profile={}
  for k,v in pairs(timing) do profile[k]={mean=v.sum/math.max(1,v.n), max=v.max, calls=v.n} end
  H.result('videoFrames',frames); H.result('completed',done); H.result('lag',frames-done)
  H.result('maxLogic',maxLogic); H.result('paletteErrors',paletteErrors); H.result('staminaFrames',staminaFrames)
  H.result('staminaWriters',writes); H.result('profile',profile)
  H.result('nativeHot',hot)
  H.result('misses',misses); H.result('spriteOverflowFrames',overflows)
  H.result('missedVblanks',#misses); H.result('nmiOverruns',nmiOverruns); H.result('maxNmiLines',maxNmi)
  H.result('lateNmis',lateNmis)
  H.result('nmiFrames',nmiFrames); H.result('visibleFrames',visibleFrames)
  H.result('flightFrames',flightFrames); H.result('actions',actions)
  H.result('maps',maps); H.result('maxTravel',maxTravel)
  H.result('forms',forms);H.result('sounds',sounds);H.result('maxPower',maxPower)
  H.result('grassCuts',grassCuts);H.result('auraFrames',auraFrames);H.result('maxAuraSprites',maxAuraSprites)
  H.result('auraBgWrites',auraBgWrites);H.result('chargeTailVoices',chargeTailVoices)
  H.result('bank',emu.getState()['cpu.k'])
  H.shot('end')
end
