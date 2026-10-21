-- Round-seven listening package: real cartridge dispatcher and raw DAC tap.
-- Only solo auditions drive loop-request RAM directly; contexts use input.
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
 recording=name;files[#files+1]={name=name,description=description}
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
local function solo()
 H.load(H_OUT..'/waterfall.mss');H.wait(40);H.w8(0x316001,0)
 song(7,4);cut();H.wait(60)
 emu.write(0x2C,0,emu.memType.spcDspRegisters);emu.write(0x3C,0,emu.memType.spcDspRegisters)
end
local function field(form,music)
 H.load(H_OUT..'/waterfall.mss');H.wait(5)
 assert(H.importSnesJs(IMPORT..'animation-audit__native__rabite-field-a'))
 H.w8(0x316001,1);H.wait(45);W.form(form or 0);song(music,0)
end
function test()
 bootToField();H.wait(40)
 if ONLY=='melee' then
  field(0,0x3C)
  record('context-melee-hold','Battle music; real B hold for 180 frames, including the removed native weapon buzz and retained punch/kick cues',function() H.hold('b',180);H.wait(120) end)
  H.result('files',files);H.result('commands',commands);H.result('captured',true);return
 end
 for _,c in ipairs({{'beam',0xEA},{'beam-full',ROUND7 and 0xF0 or 0xEA},{'charged',0xDF},{'transform',0xE0},{'power-burst',0xE1},{'revert-landing',0xE3},{'flight',0xEC},{'teleport-out',0xEB},{'teleport-in',ROUND7 and 0xEF or 0xEB}}) do
  solo();record('solo-'..c[1],'Isolated native effect, music and echo muted',function() native(c[2]);H.wait(210) end)
 end
 for _,kind in ipairs({'charge','focus','aura'}) do
  solo();record('solo-'..kind,'Continuous loop request with browser level/rate envelope; music muted',function()
   local begin=H.frame;local length=kind=='focus' and 240 or 180
   loopRequest=function(f)
    local strength=math.min(1,(f-begin)/(kind=='charge' and 90 or 96))
    if kind=='charge' then return .48+.52*strength,0,.94+.12*strength,1 end
    if kind=='aura' then return 0,strength,1,.8+.2*strength end
    return .22+.85*strength,strength>.4 and strength or 0,.72+.30*strength,.8+.2*strength
   end
   H.wait(length);loopRequest=nil;H.wait(90)
  end)
 end
 field(1,0x3C)
 record('context-charge-beam','Battle music; real L+Y hold for 180 video frames, then full Super Saiyan release and contacts',function() H.hold('l y',180);H.wait(180) end)
 field(0,7)
 record('context-focus','Field music; real L power-up hold for 240 video frames, then release',function() H.hold('l',240);H.wait(120) end)
 field(0,7)
 record('context-transform-revert','Field music; focus, transformation, power burst and revert through real inputs',function() H.hold('l',120);H.hold('l a',4);H.wait(180);H.hold('l a',4);H.wait(180) end)
 field(0,7)
 record('context-flight','Field music; takeoff, 180 frames of local flight with short steering reversals, landing',function()
  for i=1,11 do H.hold('a right',8);H.hold('a left',8) end
  H.hold('a right',4);H.wait(120)
 end)
 field(0,7)
 record('context-teleport','Field music; real L+B Instant Transmission, out and in',function() H.hold('l b',2);H.wait(178) end)
 field(0,0x3C)
 record('context-ki-volley','Battle music; real Y volley into enemies, including retained DE launch and 38 contacts',function() H.hold('right',4);H.hold('y',180);H.wait(120) end)
 H.load(H_OUT..'/waterfall.mss');H.wait(5);W.fresh();W.on(0);H.wait(10)
 record('context-world-flight','World takeoff through L+R, 180 frames of world flight after load, B landing',function()
  H.hold('l r',4);assert(H.waitFor(W.inWorld,900));H.wait(180);H.hold('b',350);H.wait(300)
 end)
 for _,s in ipairs(ECHO_PAIRS) do
  solo();song(s[1],s[2]);record(string.format('echo-%02X',s[1]),'Canonical song echo: 8 s of music, key off, 4 s tail',function() H.wait(481);cut();H.wait(241) end)
 end
 H.result('files',files);H.result('commands',commands);H.result('captured',true)
end
