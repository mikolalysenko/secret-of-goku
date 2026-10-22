-- Round-nine auditions: actual cartridge commands and the raw DAC. Every
-- cue alone over the field song and dry, then real Rabite-field play.
local bootToField=test
local started,wanted,recording=false,nil,nil
local commands,files={},{}
emu.addMemoryCallback(function()
 if wanted then H.w8(0x7E1E02,wanted);H.w8(0x7E1E03,255) end
end,emu.callbackType.exec,0xC30198,0xC30198)
emu.addMemoryCallback(function() started=true end,emu.callbackType.exec,0x0DDD,0x0DDD,emu.cpuType.spc,emu.memType.spcMemory)
emu.addMemoryCallback(function()
 if recording then local c=H.r8(0x7E1E00)
  if c==2 or c==0x81 then commands[#commands+1]={file=recording,frame=H.frame,cmd=c,id=H.r8(0x7E1E01),level=H.r8(0x7E1E02),rate=H.r8(0x7E1E03)} end
 end
end,emu.callbackType.exec,0xC30160,0xC30160)
local function cmd(op,arg) H.w8(0x7EDD17,arg or 0);H.w8(0x7EDD16,op) end
local function song(id,preset)
 if H.r8(0x7E1E05)==id then
  started=false;wanted=0;cmd(3,id==7 and 6 or 7)
  assert(H.waitFor(function() return started end,600),'interlude timeout');H.wait(20)
 end
 started=false;wanted=preset or 0;cmd(3,id)
 assert(H.waitFor(function() return started end,600),'song timeout '..id)
 wanted=nil;H.wait(40)
end
local function cut()
 emu.write(0xAD,0,emu.memType.spcRam);emu.write(0xAF,0,emu.memType.spcRam);emu.write(0xB0,255,emu.memType.spcRam)
 emu.write(0x5C,255,emu.memType.spcDspRegisters)
end
local function record(name,description,fn)
 recording=name
 files[#files+1]={name=name,description=description,bank=EXTENDED and {base=H.r16(0x7EDD46),state=H.r8(0x7EDD55)} or nil,songVolume=emu.read(0x84,emu.memType.spcRam)}
 emu.recordAudio(H_OUT..'/'..name..'.pcm');fn();emu.stopAudio();recording=nil
end
local loopRequest=nil
emu.addMemoryCallback(function()
 if not loopRequest then return end
 local charge,aura,rate,arate=loopRequest(H.frame)
 H.w8(0x7EDD0A,math.min(255,math.floor(charge*255+.5)));H.w8(0x7EDD0B,math.min(255,math.floor(aura*255+.5)))
 H.w8(0x7EDD0E,math.floor(rate*128+.5));H.w8(0x7EDD0F,math.floor(arate*128+.5))
 H.w16(0x7EDD12,0)
 if H.r8(0x7EDD58)==0 then H.w8(0x7EDD58,1) end
end,emu.callbackType.exec,AUDIO_FRAME,AUDIO_FRAME)
local function settleBank()
 if EXTENDED and H.r16(0x7EDD46)~=0 then
  assert(H.waitFor(function() return H.r8(0x7EDD55)==3 end,3600),'resident bank never ready')
 end
end
local function freshBank()
 if not EXTENDED then return end
 H.w16(0x7EDD46,0);H.w16(0x7EDD48,0);H.w16(0x7EDD50,0);H.w8(0x7EDD55,0)
 if H.r8(0x7EDD58)==0x40 then H.w8(0x7EDD58,0) end
end
-- The field song from an empty music cache (bank admission as on a fresh
-- field entry), or the same state silenced for a dry take.
local function stage(music,form)
 H.load(H_OUT..'/waterfall.mss');freshBank();H.wait(40);H.w8(0x316001,0)
 if EXTENDED then for i=0,15 do H.w16(0x7E1E28+i*2,0) end end
 song(0x1C,10);settleBank()
 if not music then cut();H.wait(30);emu.write(0x2C,0,emu.memType.spcDspRegisters);emu.write(0x3C,0,emu.memType.spcDspRegisters) end
 H.w8(0x7ED811,form or 0);H.wait(20)
end
-- settle: wait for the optional bank (the wave's full sample). Melee and
-- volley takes start at once: while the bank fills on idle frames the
-- Rabites close in and knock Goku back, so his blows would whiff.
local function field(form,settle)
 H.load(H_OUT..'/waterfall.mss');freshBank();H.wait(5)
 assert(H.importSnesJs(IMPORT..'animation-audit__native__rabite-field-a'));freshBank()
 H.w8(0x316001,1);H.wait(45);W.form(form or 0);song(0x1C,10);if settle then settleBank() end
end
local function cue(id) cmd(1,id);H.wait(1) end
-- Goku's blows queue 999 damage, so a Rabite always dies to the first one
-- (the PC behaves alike). For listening, the nearest live Rabite becomes a
-- training dummy held a fixed distance ahead of Goku, its HP restored and
-- queued damage cleared at each frame's end: every blow of a string, every
-- shot of a volley and the wave's pulses connect. Input, combat logic,
-- push-back requests and every sound command are the game's own.
local dummy,pin=nil,nil
emu.addEventCallback(function()
 if not dummy then return end
 H.w16(dummy+0x182,999);H.w16(dummy+0x1F1,0)
 H.w16(dummy+2,H.r16(0x7EE002)+pin);H.w16(dummy+4,H.r16(0x7EE004))
end,emu.eventType.endFrame)
local function target(distance)
 local gx,gy=H.r16(0x7EE002),H.r16(0x7EE004)
 local best,nearest=nil,math.huge
 for i=3,11 do
  local a=0x7EE000+i*0x200
  if H.r8(a)&1~=0 and H.r16(a+0x182)>0 and H.r8(a+0x191)&0x80==0 then
   local dx,dy=H.r16(a+2)-gx,H.r16(a+4)-gy
   if dx*dx+dy*dy<nearest then best=a;nearest=dx*dx+dy*dy end
  end
 end
 assert(best,'audition needs a live Rabite')
 H.w16(0x7EE002,H.r16(best+2)-distance);H.w16(0x7EE004,H.r16(best+4))
 dummy,pin=best,distance
 H.hold('right',1)
end
local function charge(ssj,frames)
 local start=H.frame
 loopRequest=function(f)
  local s=math.min(1,(f-start)/(ssj and 45 or 90))
  return .48+.52*s,(ssj and s>.35) and s or 0,.94+.12*s,1
 end
 H.wait(frames);loopRequest=nil
end
local function count(name,ids)
 local n=0
 for _,c in ipairs(commands) do if c.file==name and c.cmd==2 then for _,id in ipairs(ids) do if c.id==id then n=n+1 end end end end
 return n
end
function test()
 bootToField();H.wait(40)
 -- Public cue ids: HIT 3, KICK 4, BLAST 5, IMPACT 6, BEAM 8. Each build
 -- maps them itself (main: IMPACT is retail $38; round nine: $7E).
 local CUES={{'hit',3,0,'Punch contact (HIT)'},{'kick',4,0,'Finishing kick (KICK)'},{'kick-ssj',4,1,'Super Saiyan finishing kick (KICK in SSJ)'},
  {'ki',5,0,'Ki shot launch (BLAST)'},{'ki-ssj',5,1,'Super Saiyan ki shot launch'},{'ki-contact',6,0,'Ki shot contact (IMPACT)'},
  {'kamehameha-release',8,0,'Kamehameha release and sustained wave (BEAM)'},{'kamehameha-release-ssj',8,1,'Super Saiyan Kamehameha release and wave'}}
 for _,music in ipairs({true,false}) do
  local prefix,context=music and 'mix-' or 'dry-',music and 'over the Rabite-field song ($1C, preset 10), 0.7 s of music first' or 'alone, music and echo silenced'
  for _,c in ipairs(CUES) do
   stage(music,c[3])
   record(prefix..c[1],c[4]..', '..context,function() H.wait(music and 42 or 6);cue(c[2]);H.wait(c[2]==8 and (music and 200 or 110) or 100) end)
  end
  for _,ssj in ipairs({false,true}) do
   stage(music,ssj and 1 or 0)
   record(prefix..'kamehameha-start'..(ssj and '-ssj' or ''),(ssj and 'Super Saiyan ' or '')..'Kamehameha start: the charge from rest, 1.5 s of the in-game level/rate ramp, then its release, '..context,
    function() H.wait(music and 42 or 6);charge(ssj,90);H.wait(60) end)
  end
 end
 -- Real play in the Rabite field over its song: inputs, AI and contacts.
 for _,form in ipairs({0,1}) do
  local f=form==1 and 'ssj' or 'base'
  -- B taps chain once the combo buffer opens (frame 9 base, 4 SSJ).
  local gap=form==1 and 7 or 11
  field(form)
  record('game-punch-string-'..f,'Rabite field, '..f..' form, field song: a three-hit string (B tapped every '..gap..' frames: jab, cross, finishing kick) on a training-dummy Rabite 18 px ahead',function()
   target(18);H.wait(2);for k=1,3 do H.hold('b',1);H.wait(gap-1) end;H.wait(110);dummy=nil
  end)
  field(form)
  record('game-ki-volley-'..f,'Rabite field, '..f..' form, field song: Y held for two seconds, a ki volley into a training-dummy Rabite 70 px ahead',function()
   target(70);H.hold('y',120);H.wait(110);dummy=nil
  end)
  field(form,true)
  record('game-kamehameha-'..f,'Rabite field, '..f..' form, field song: a full Kamehameha (L+Y held three seconds: activation, charge, release, the wave striking a training-dummy Rabite 90 px ahead, the duck recovering)',function()
   target(90);H.hold('l y',180);H.wait(240);dummy=nil
  end)
 end
 H.result('contacts',{
  punch_base=count('game-punch-string-base',{0xE7,0xE8,0xF1}),punch_ssj=count('game-punch-string-ssj',{0xE7,0xE8,0xF1}),
  volley_base=count('game-ki-volley-base',{0x38,0x7E}),volley_ssj=count('game-ki-volley-ssj',{0x38,0x7E}),
  wave_base=count('game-kamehameha-base',{0x38,0x7E}),wave_ssj=count('game-kamehameha-ssj',{0x38,0x7E})})
 H.result('files',files);H.result('commands',commands);H.result('captured',true)
end
