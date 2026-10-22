-- Audio dispatch profile for gameplay offset runs (dispatch-profile.mjs
-- prepends S, the measured cartridge's symbols). Read-only hooks: one row
-- per field update, even one that crosses NMIs. Every span excludes NMI
-- time. 'audio' is audio_frame; 'queue' core's sound pump; 'native' a
-- C3:0004 call; 'event' the event pump. Busy-waits are measured directly:
-- consecutive CPU reads of $2140-$2143 at one PC, closer than 400 master
-- clocks, are a polling loop, whichever routine runs it.
local rows,row,active={},nil,{}
local nmiStart,nmiTime=nil,0
local lastPc,lastClock=-1,0
local AU=0x7EDD00
local function clock() return emu.getState().masterClock end
local function hook(a,fn) if a then emu.addMemoryCallback(fn,emu.callbackType.exec,a,a) end end
local function begin(name)
 if row then active[name]={clock=clock(),nmi=nmiTime} end
end
local function ending(name)
 local t=active[name]
 if row and t then
  local elapsed=(clock()-t.clock)%0x100000000
  local irq=nmiTime-t.nmi
  row.lines[name]=(row.lines[name] or 0)+(elapsed-irq)/1364
  row.nmi[name]=(row.nmi[name] or 0)+irq/1364
  active[name]=nil
 end
end
hook(0x00B08C,function()
 if not H then return end
 row={frame=H.frame,lines={},nmi={},commands={},ports={},waits={},reads=0}
 active={};rows[#rows+1]=row;H.result('audio_dispatch_trace',rows)
end)
hook(0x00B077,function() if row then row.endFrame=H.frame end end)
for _,a in ipairs({0x00C0A8,0x80C0A8}) do hook(a,function()
 nmiStart=clock()
 if row and H.r8(0x7E00EC)&1==0 then row.missFrame=H.frame end
end) end
for _,a in ipairs({0x00C16F,0x80C16F}) do hook(a,function()
 if nmiStart then nmiTime=nmiTime+(clock()-nmiStart)%0x100000000;nmiStart=nil end
end) end
hook(S.core_frame_end,function() begin('tail');begin('pad') end)
hook(S.core_sound_pump,function() ending('pad');begin('queue') end)
hook(S.core_event_pump,function() ending('queue');ending('tail');begin('event') end)
hook(S.core_event_pump_none,function() ending('event') end)
-- The module table's return PC catches every early RTL, not just .done.
local installed=false
hook(S.audio_frame,function()
 if not installed then
  for _,p in ipairs(SPANS or {}) do if p[1]=='audio_frame' then hook(p[3],function() ending('audio') end) end end
  installed=true
 end
 if row then
  local n=H.r8(AU)
  row.requests=n<=4 and {H.r8(AU+1),H.r8(AU+2),H.r8(AU+3),H.r8(AU+4)} or nil
  if row.requests then for i=n+1,4 do row.requests[i]=nil end end
 end
 begin('audio')
end)
-- A debugger read of $2140 does not show the SPC's port; 'reads' keeps the
-- values the call itself read from port 0 (first: the echo it polled).
local call=nil
hook(0xC30004,function()
 begin('native')
 if row then
  local s=emu.getState()
  call={cmd=H.r8(0x7E1E00),id=H.r8(0x7E1E01),p2=H.r8(0x7E1E02),p3=H.r8(0x7E1E03),
   pending=H.r8(0x7EDD5B),reads={},line=s['ppu.scanline'],insideAudio=active.audio~=nil,fromQueue=active.queue~=nil}
  row.commands[#row.commands+1]=call
 end
end)
hook(0xC30197,function() ending('native');call=nil end)
-- The module's own cues and beds go straight to the ports (A = command |
-- p1<<8, X = p2 | p3<<8); recorded like driver calls, without a span.
hook(S.audio_native_send,function()
 if row then
  local s=emu.getState();local a,x=s['cpu.a'],s['cpu.x']
  row.commands[#row.commands+1]={cmd=a&255,id=(a>>8)&255,p2=x&255,p3=(x>>8)&255,
   pending=H.r8(0x7EDD5B),reads={},line=s['ppu.scanline'],insideAudio=true,direct=true}
 end
end)
-- Port 0 writes with the data ports' latest CPU values: the exact command
-- stream (and order) the SPC can see, for before/after comparisons.
local data={0,0,0}
emu.addMemoryCallback(function(a,v) data[a-0x2140]=v end,emu.callbackType.write,0x2141,0x2143)
emu.addMemoryCallback(function(_,v)
 if row then
  local s=emu.getState()
  row.ports[#row.ports+1]={value=v,p1=data[1],p2=data[2],p3=data[3],line=s['ppu.scanline'],pc=s['cpu.k']*65536+s['cpu.pc']}
 end
end,emu.callbackType.write,0x2140,0x2140)
emu.addMemoryCallback(function(a,v)
 if call and a==0x2140 and #call.reads<4 then call.reads[#call.reads+1]=v end
 if not row or nmiStart then return end
 local s=emu.getState()
 local pc,now=s['cpu.k']*65536+s['cpu.pc'],s.masterClock
 row.reads=row.reads+1
 if pc==lastPc and now-lastClock<400 then
  local k=string.format('%06X',pc)
  row.waits[k]=(row.waits[k] or 0)+(now-lastClock)/1364
 end
 lastPc,lastClock=pc,now
end,emu.callbackType.read,0x2140,0x2143)
