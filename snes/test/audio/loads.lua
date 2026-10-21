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
  local bankWrites={}
  local stackLow=0x200
  emu.addMemoryCallback(function(a) stackLow=math.min(stackLow,a) end,
    emu.callbackType.write,0x01C0,0x01FF,emu.cpuType.spc,emu.memType.spcRam)
  if CUSTOM then
    for _,range in ipairs({{0x4DF1,FLOOR-1},{0x0180,0x01BF},{0x1860,0x187B},{0x18E0,0x18FF},{0x19C0,ROUND7 and 0x19FF or 0x19CF}}) do
      emu.addMemoryCallback(function(a,v)
        if #bankWrites<20 then bankWrites[#bankWrites+1]={a=a,v=v,pc=emu.getState()['spc.pc']} end
      end,emu.callbackType.write,range[1],range[2],emu.cpuType.spc,emu.memType.spcRam)
    end
  end
  local presets={}
  for e=0,58 do
    local p=0xCA0000+H.r16(0xCA0600+e*2)
    if H.r8(p)==0x40 and H.r8(p+1)==1 then
      presets[H.r8(p+2)]={p2=H.r8(p+3)&15,p3=H.r8(p+4)}
    end
  end
  local order={}
  for id=0,63 do order[#order+1]={id=id} end
  if LOAD_NONCANONICAL then
    for _,preset in ipairs({11,14}) do for id=0,63 do order[#order+1]={id=id,preset=preset} end end
  end
  for _,row in ipairs(order) do
    local id=row.id
    local tag=string.format('load_%02X',id)..(row.preset and '_preset_'..row.preset or '')
    wanted=row.preset and {p2=row.preset,p3=0xFF} or presets[id] or {p2=0,p3=0xFF}
    started=false;returned=nil;loadClock=nil
    cmd(3,id)
    local ready=H.waitFor(function() return started end,600)
    check(tag..'_started',ready,'driver never started')
    if not ready then finish();return end
    -- Mesen's exposed masterClock wraps at 32 bits in long/imported runs.
    H.result(tag..'_stall_frames',((returned-loadClock)%0x100000000)/357366)
    H.result(tag..'_load_frames',((started-loadClock)%0x100000000)/357366)
    local preset=wanted.p2&15;wanted=nil
    local src,bad=r24(0xC33D39+3*id),nil
    for k=0,H.r16(src)-1 do
      if aram(0x1A00+k)~=H.r8(src+2+k) then bad=k;break end
    end
    check(tag..'_sequence',bad==nil,bad)
    bad=nil
    local unique,required={},0
    for k=0,15 do
      local ins=H.r16(0xC33F22+32*id+2*k)
      if ins~=0 then
        local p,dst=r24(0xC33DF9+3*(ins-1)),ar16(0x1980+4*k)
        if not unique[ins] then required=required+H.r16(p);unique[ins]=true end
        if CUSTOM and dst<FLOOR then bad='sample below reserved floor' end
        for j=0,H.r16(p)-1 do
          if aram(dst+j)~=H.r8(p+2+j) then bad=string.format('instrument %d +%d at %04X',ins,j,dst);break end
        end
        -- Retail one-shots can have an unused loop offset beyond the BRR;
        -- the real loader adds it with 16-bit wrap, even high in the cache.
        local loop=(dst+H.r16(0xC33E5C+2*(ins-1)))&0xFFFF
        if ar16(0x1982+4*k)~=loop then bad=string.format('DIR loop instrument %d slot %d: %04X expected %04X',ins,k,ar16(0x1982+4*k),loop) end
        if ar16(0x1840+2*k)~=H.r16(0xC33E9E+2*(ins-1)) then bad='tuning' end
        if ar16(0x18C0+2*k)~=H.r16(0xC33EE0+2*(ins-1)) then bad='ADSR' end
      end
    end
    check(tag..'_instruments',bad==nil,bad)
    local edl,evol,efb=H.r8(0xC30708+4*preset),H.r8(0xC30709+4*preset),H.r8(0xC3070A+4*preset)
    if id>=0x3B then local s=SONGS[id-0x3A];edl=s.edl;evol=s.evol;efb=s.efb end
    if CUSTOM then edl=math.min(edl,math.floor((0xFA00-1-FLOOR-required)/0x800)) end
    check(tag..'_echo',dsp(0x7D)==edl and dsp(0x2C)==evol and dsp(0x0D)==efb)
    local fir={};for v=0,7 do fir[#fir+1]=dsp(0x0F+16*v) end
    H.result(tag..'_echo_values',{edl=dsp(0x7D),evol=dsp(0x2C),efb=dsp(0x0D),fir=fir})
    check(tag..'_vectors',ar16(0x1420)==0x1263 and ar16(0x1426)==0x1270,'temporary vectors retained')
    check(tag..'_effect_samples',effectSampleDamage()==nil,effectSampleDamage())
    check(tag..'_custom_bank',customDamage()==nil,customDamage())
    if CUSTOM then check(tag..'_cache_floor',H.r16(0x7E1EF8)==FLOOR and H.r16(0x7E1E48)==FLOOR) end
    local peak=0
    -- $1A begins with more than a second of authored rests.
    for f=1,(id==0x1A and 180 or 60) do H.wait(1);for v=0,7 do peak=math.max(peak,dsp(v*16+8)) end end
    check(tag..'_audible',peak>0,peak)
    check(tag..'_custom_after_playback',customDamage()==nil,customDamage())
  end
  check('no_postboot_bank_writes',#bankWrites==0,#bankWrites)
  H.result('bank_writes',bankWrites)
  H.result('spc_stack_low_address',stackLow)
  finish()
end
