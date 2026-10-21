-- Every retail song, with its event $700+ canonical echo/volume parameters.
-- Cut the previous cue for comparable load timing. Test the real dispatcher,
-- sequence bytes, every BRR byte, DIR/tuning/ADSR and audible driver output.
local wanted, started, returned, loadClock
local function clock() return emu.getState().masterClock end
emu.addMemoryCallback(function()
  if wanted then
    H.w8(0x7E1E02, wanted.p2); H.w8(0x7E1E03, wanted.p3)
    started=false; returned=nil; loadClock=clock()
  end
end,emu.callbackType.exec,0xC30198,0xC30198)
emu.addMemoryCallback(function() if wanted then returned=clock() end end,
  emu.callbackType.exec,0xC3018D,0xC3018D)
emu.addMemoryCallback(function() if wanted and returned then started=clock() end end,
  emu.callbackType.exec,0x0DDD,0x0DDD,emu.cpuType.spc,emu.memType.spcMemory)
local function r24(a) return H.r16(a)|(H.r8(a+2)<<16) end
local function ar16(a) return aram(a)|(aram(a+1)<<8) end

function test()
  H.wait(40)
  local presets={}
  for e=0,58 do
    local p=0xCA0000+H.r16(0xCA0600+e*2)
    if H.r8(p)==0x40 and H.r8(p+1)==1 then
      presets[H.r8(p+2)]={p2=H.r8(p+3)&15,p3=H.r8(p+4)}
    end
  end
  local order={}
  for id=0,58 do order[#order+1]=id end
  for id=0x3B,0x3F do order[#order+1]=id end
  for _,id in ipairs(order) do
    local tag=string.format('load_%02X',id)
    wanted=presets[id] or {p2=0,p3=0xFF}
    started=false;returned=nil;loadClock=nil
    cmd(3,id)
    local ready=H.waitFor(function() return started end,600)
    check(tag..'_started',ready,'driver never started')
    if not ready then finish();return end
    H.result(tag..'_stall_frames',(returned-loadClock)/357366)
    H.result(tag..'_load_frames',(started-loadClock)/357366)
    wanted=nil
    local src,bad=r24(0xC33D39+3*id),nil
    for k=0,H.r16(src)-1 do
      if aram(0x1A00+k)~=H.r8(src+2+k) then bad=k;break end
    end
    check(tag..'_sequence',bad==nil,bad)
    bad=nil
    for k=0,15 do
      local ins=H.r16(0xC33F22+32*id+2*k)
      if ins~=0 then
        local p,dst=r24(0xC33DF9+3*(ins-1)),ar16(0x1980+4*k)
        for j=0,H.r16(p)-1 do
          if aram(dst+j)~=H.r8(p+2+j) then bad=string.format('instrument %d +%d at %04X',ins,j,dst);break end
        end
        if ar16(0x1982+4*k)~=dst+H.r16(0xC33E5C+2*(ins-1)) then bad='DIR loop' end
        if ar16(0x1840+2*k)~=H.r16(0xC33E9E+2*(ins-1)) then bad='tuning' end
        if ar16(0x18C0+2*k)~=H.r16(0xC33EE0+2*(ins-1)) then bad='ADSR' end
      end
    end
    check(tag..'_instruments',bad==nil,bad)
    check(tag..'_vectors',ar16(0x1420)==0x1263 and ar16(0x1426)==0x1270,'temporary vectors retained')
    check(tag..'_effect_samples',effectSampleDamage()==nil,effectSampleDamage())
    local peak=0
    -- $1A begins with more than a second of authored rests.
    for f=1,(id==0x1A and 180 or 60) do H.wait(1);for v=0,7 do peak=math.max(peak,dsp(v*16+8)) end end
    check(tag..'_audible',peak>0,peak)
  end
  finish()
end
