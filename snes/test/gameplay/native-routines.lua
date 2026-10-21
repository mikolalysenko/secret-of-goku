-- Optional per-call native profile and private inputs for assembled replay.
-- Master clocks include nested calls/interrupts, just like the main spans.
-- Records contain CPU state and the two WRAM regions these helpers access;
-- no ROM/state/recording is checked in. --record-native enables capture.
function profileNative(measuring)
  local totals,frames,active,returns,records,counts = {},{},{},{},{},{}
  local field=0
  local misses={}
  local function exec(address,fn)
    emu.addMemoryCallback(fn,emu.callbackType.exec,address,address)
  end
  exec(0x00B08C,function() if measuring() then field=H.frame end end)
  exec(0x00C0A8,function()
    if measuring() and H.r8(0x7E00EC)&1==0 then misses[#misses+1]={videoFrame=H.frame,field=field} end
  end)
  local function finish(name)
    local a=active[name];if not a then return end
    local state=emu.getState()
    local clocks=state.masterClock-a.clock
    local cycles=state['cpu.cycleCount']-a.cycles
    local t=totals[name] or {calls=0,clocks=0,max=0,cycles=0,maxCycles=0,callers={}}
    t.calls=t.calls+1;t.clocks=t.clocks+clocks;t.max=math.max(t.max,clocks)
    t.cycles=t.cycles+cycles;t.maxCycles=math.max(t.maxCycles,cycles)
    t.callers[a.caller]=(t.callers[a.caller] or 0)+1;totals[name]=t
    local f=frames[tostring(a.field)] or {};frames[tostring(a.field)]=f
    f[name]=(f[name] or 0)+clocks
    active[name]=nil
  end
  local function record(name,s)
    if not RECORD_NATIVE or (name~='emitter' and name~='contact' and name~='body' and name~='overlap') then return end
    counts[name]=(counts[name] or 0)+1
    -- Sample throughout long runs, as well as the initial crowded frames.
    if counts[name]>128 and counts[name]%37~=0 then return end
    if (counts[name]-128)//37>384 then return end
    local n=#records+1
    local file=assert(io.open(H_OUT..'/native-'..n..'.bin','wb'))
    for _,base in ipairs({0,0xE000}) do
      local bytes={};for i=0,0x1FFF do bytes[#bytes+1]=string.char(H.r8(0x7E0000+base+i)) end
      file:write(table.concat(bytes))
    end
    file:close()
    local cpu={};for k,v in pairs(s) do if k:sub(1,4)=='cpu.' then cpu[k:sub(5)]=v end end
    records[n]={kind=name,cpu=cpu,frame=H.frame,file='native-'..n..'.bin'}
  end
  local function start(name,address,stop,returnBank)
    exec(address,function()
      if not measuring() or active[name] then return end
      local s=emu.getState()
      local ret=((returnBank or s['cpu.k'])<<16)|((H.r16(s['cpu.sp']+1)+1)&0xFFFF)
      local caller=string.format('%06X',ret)
      active[name]={clock=s.masterClock,cycles=s['cpu.cycleCount'],field=field,caller=caller}
      record(name,s)
      local target=stop or ret
      returns[target]=returns[target] or {}
      if not returns[target][name] then
        returns[target][name]=true;exec(target,function() finish(name) end)
      end
    end)
  end
  start('actors',0x80E38E)
  start('actor',0x80E3CF)
  start('actor_setup',0x80E40E)
  start('body_caller',0x80E5CE)
  start('body',NATIVE_BODY,nil,0x80)
  start('emitter',0x80E640)
  -- The body fallback has already checked capacity and now enters here.
  -- An active invocation ignores subsequent visits within the same loop.
  start('emitter',0x80E649)
  start('contact',0x81CE72,0x81CF19)
  start('contact_full',0x81CE62)
  start('contact_party',0x81CE59)
  start('overlap',0x81D14A)
  return function()
    H.result('nativeRoutines',totals);H.result('nativeRoutineFrames',frames)
    H.result('nativeRoutineMisses',misses)
    if RECORD_NATIVE then
      local f=assert(io.open(H_OUT..'/native-inputs.json','wb'));f:write(H.json(records));f:close()
      H.result('nativeInputCount',#records)
    end
  end
end
