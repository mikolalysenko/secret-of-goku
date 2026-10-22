-- Round-eight power auditions: actual cartridge commands and raw DAC.
-- Input contexts use controllers; follow-up pairs use the cue mailbox.
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
 recording=name;files[#files+1]={name=name,description=description,bank=EXTENDED and {base=H.r16(0x7EDD46),state=H.r8(0x7EDD55)} or nil}
 emu.recordAudio(H_OUT..'/'..name..'.pcm');fn();emu.stopAudio();recording=nil
end
local function native(id) cmd(8,id);H.wait(1) end
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
local function solo(compact)
 H.load(H_OUT..'/waterfall.mss');freshBank();H.wait(40);H.w8(0x316001,0)
 -- Solo extended auditions start with an empty music cache. The normal
 -- song loader and bounded prefetch still perform every byte transfer.
 if not compact and EXTENDED then for i=0,15 do H.w16(0x7E1E28+i*2,0) end end
 song(compact and 0x3C or 7,compact and 0 or 4);settleBank();cut();H.wait(60)
 if EXTENDED and not compact then assert(H.r8(0x7EDD55)==3,'extended solo audition must use the full bank') end
 emu.write(0x2C,0,emu.memType.spcDspRegisters);emu.write(0x3C,0,emu.memType.spcDspRegisters)
end
local function field(form,music)
 H.load(H_OUT..'/waterfall.mss');freshBank();H.wait(5)
 assert(H.importSnesJs(IMPORT..'animation-audit__native__rabite-field-a'));freshBank()
 H.w8(0x316001,1);H.wait(45);W.form(form or 0);song(music,music==0x1C and 10 or 0);settleBank()
end
local function cue(id) cmd(1,id);H.wait(1) end
local function meleeRange()
 -- Song-load timing changes how far enemies have wandered. Place the
 -- player beside a live enemy once, then let normal AI/input/contact run.
 local gx,gy=H.r16(0x7EE002),H.r16(0x7EE004)
 local target,nearest=nil,math.huge
 for i=3,11 do
  local a=0x7EE000+i*0x200
  if H.r8(a)&1~=0 and H.r16(a+0x182)>0 and H.r8(a+0x191)&0x80==0 then
   local dx,dy=H.r16(a+2)-gx,H.r16(a+4)-gy
   if dx*dx+dy*dy<nearest then target=a;nearest=dx*dx+dy*dy end
  end
 end
 assert(target,'melee audition needs a live enemy')
 H.w16(0x7EE002,H.r16(target+2)-18);H.w16(0x7EE004,H.r16(target+4))
 H.hold('right',1)
end
local function combo()
 for i=1,6 do cue(i%3==0 and 2 or 1);cue(i%3==0 and 4 or 3);H.wait(12) end
end
function test()
 bootToField();H.wait(40)
 for _,c in ipairs({{'hit',0xE7},{'kick',0xE8},{'kick-ssj',0xF1}}) do
  solo();record('solo-'..c[1],'Isolated '..c[1]..'; three pitches for HIT, no music/echo',function()
   for i=1,3 do native(c[2]);H.wait(44) end;H.wait(60)
  end)
 end
 for _,compact in ipairs({true,false}) do
  for _,c in ipairs({{'beam',0xEA},{'beam-ssj',0xF0}}) do
   solo(compact);record('solo-'..c[1]..(compact and '-compact' or '-extended'),'Isolated '..c[1]..'; '..(compact and 'tight-song fallback' or 'resident extended bank where supported')..'; no music/echo',function() native(c[2]);H.wait(180) end)
  end
 end
 for _,s in ipairs({{'battle',0,0x3C},{'full-power',1,0x3F}}) do
  solo(true);song(s[3],0);H.w8(0x7ED811,s[2])
  record('combo-'..s[1],'Two public-cue combos, one-frame swing-to-contact gap, over '..s[1]..' music',function() combo();H.wait(120) end)
  field(s[2],s[3]);record('fight-melee-'..s[1],'Player placed once in melee range; real B-held melee and normal enemy AI for three seconds over '..s[1]..' music',function() meleeRange();H.hold('b',180);H.wait(108) end)
  local hit=false
  for _,c in ipairs(commands) do if c.file=='fight-melee-'..s[1] and c.cmd==2 and c.id==0xE7 then hit=true end end
  assert(hit,'real melee audition must contain a punch contact')
  field(s[2],s[3]);record('fight-beam-'..s[1],'Real L+Y charge for three seconds, then wave release into enemies over '..s[1]..' music',function() H.hold('l y',180);H.wait(180) end)
  solo(true);song(s[3],0);H.w8(0x7ED811,s[2])
  record('stress-'..s[1],'Beams with rapid HIT/KICK contacts at 2/3/5/8-frame gaps, over '..s[1]..' music',function()
   for _,gap in ipairs({2,3,5,8}) do cue(8);for i=1,18 do cue(i%2==0 and 4 or 3);H.wait(gap-1) end;H.wait(30) end;H.wait(120)
  end)
 end
 if not CANDIDATES_ONLY then
  for _,c in ipairs({{'swing',0xE5},{'kick-swing',0xE6},{'ki',0xDE},{'charged',0xDF},{'transform',0xE0},{'power-burst',0xE1},{'revert',0xE3},{'flight',0xEC}}) do
   solo();record('solo-'..c[1],'Isolated '..c[1]..'; no music/echo',function() for i=1,3 do native(c[2]);H.wait(89) end;H.wait(60) end)
  end
  for _,compact in ipairs({true,false}) do for _,c in ipairs({{'teleport-out',0xEB},{'teleport-in',0xEF}}) do
   solo(compact);record('solo-'..c[1]..(compact and '-compact' or '-extended'),'Isolated '..c[1]..'; '..(compact and 'compact sustained tail' or 'whole clip where extended bank is supported'),function() native(c[2]);H.wait(180) end)
  end end
  for _,kind in ipairs({'charge','focus','aura'}) do
   solo();record('solo-'..kind,'Continuous '..kind..' bed with smooth level/rate envelope and release; no music',function()
    local start=H.frame;local length=kind=='focus' and 240 or 180
    loopRequest=function(f)
     local strength=math.min(1,(f-start)/(kind=='charge' and 90 or 96))
     if kind=='charge' then return .48+.52*strength,0,.94+.12*strength,1 end
     if kind=='aura' then return 0,strength,1,.8+.2*strength end
     return .22+.85*strength,strength>.4 and strength or 0,.72+.30*strength,.8+.2*strength
    end
    H.wait(length);loopRequest=nil;H.wait(90)
   end)
  end
  field(0,0x1C);record('field-focus','Real four-second L power-up hold over field music',function() H.hold('l',240);H.wait(120) end)
  field(0,0x1C);record('field-flight','Takeoff, three seconds of field flight, landing',function() for i=1,11 do H.hold('a right',8);H.hold('a left',8) end;H.hold('a right',4);H.wait(120) end)
  field(0,0x1C);record('field-teleport','Real L+B Instant Transmission out and in, over field music',function() H.hold('l b',2);H.wait(178) end)
  field(0,0x1C);record('field-transform-revert','Real focus, transformation and revert over field music',function() H.hold('l',120);H.hold('l a',4);H.wait(180);H.hold('l a',4);H.wait(180) end)
  for _,s in ipairs({{'battle',0,0x3C},{'full-power',1,0x3F}}) do
   field(s[2],s[3]);record('fight-ki-'..s[1],'Real Y volley into enemies for three seconds over '..s[1]..' music',function() H.hold('right',4);H.hold('y',180);H.wait(120) end)
   solo(true);song(s[3],0);H.w8(0x7ED811,s[2]);record('volley-'..s[1],'Eighteen launches at five-frame spacing with retained $38 contacts two frames later, then another volley over a wave',function()
    for burst=1,2 do if burst==2 then cue(8) end;for i=1,18 do cue(5);H.wait(1);cue(6);H.wait(2) end;H.wait(30) end;H.wait(120)
   end)
  end
  for _,s in ipairs({{'field',0x1C},{'orbit',0x3D}}) do
   solo();song(s[2],s[2]==0x1C and 10 or 0);settleBank();H.w8(0x7ED811,0)
   record('mix-'..s[1],'Wave then two combos over '..s[1]..' music; extended samples where present',function() cue(8);H.wait(120);combo();H.wait(120) end)
  end
 end
 H.result('files',files);H.result('commands',commands);H.result('captured',true)
end
