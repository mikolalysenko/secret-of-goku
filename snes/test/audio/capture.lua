-- Prepended after checkpoints.lua: reach the field from cartridge power-on.
-- No imported audio state, RAM sample installation, or stream prototype.
local bootToField=test
local started=false
local wanted=nil
local volumeSaturations=0
if SATURATION>0 then emu.addMemoryCallback(function() volumeSaturations=volumeSaturations+1 end,emu.callbackType.exec,SATURATION,SATURATION,emu.cpuType.spc,emu.memType.spcMemory) end
emu.addMemoryCallback(function()
 if wanted then H.w8(0x7E1E02,wanted);H.w8(0x7E1E03,0xFF) end
end,emu.callbackType.exec,0xC30198,0xC30198)
emu.addMemoryCallback(function() started=true end,emu.callbackType.exec,0x0DDD,0x0DDD,emu.cpuType.spc,emu.memType.spcMemory)
local function cmd(op,arg) H.w8(0x7EDD17,arg);H.w8(0x7EDD16,op) end
local function song(id,preset)
 if H.r8(0x7E1E05)==id then
  started=false;wanted=0;cmd(3,7==id and 6 or 7)
  assert(H.waitFor(function() return started end,600),'interlude song timeout')
  H.wait(20)
 end
 started=false;wanted=preset or 0;cmd(3,id)
 assert(H.waitFor(function() return started end,600),'song timeout '..id)
 wanted=nil;H.wait(18)
end
local function cut()
 emu.write(0xAD,0,emu.memType.spcRam);emu.write(0xAF,0,emu.memType.spcRam);emu.write(0xB0,255,emu.memType.spcRam)
 emu.write(0x5C,255,emu.memType.spcDspRegisters)
end
local function record(name,fn)
 emu.recordAudio(H_OUT..'/'..name..'.pcm');fn();emu.stopAudio()
end
local function effect(cue) cmd(8,IDS[cue]);H.wait(1) end
function test()
 bootToField();H.wait(40)
 for _,cue in ipairs({'hit','kick','impact','beam'}) do
  song(7,4);cut();H.wait(60)
  if cue~='beam' then emu.write(0x2C,0,emu.memType.spcDspRegisters);emu.write(0x3C,0,emu.memType.spcDspRegisters) end
  record(cue,function() effect(cue);H.wait(210) end)
 end
 for _,id in ipairs({0x3C,0x3F}) do
  local key=id==0x3C and 'battle' or 'full-power'
  -- Each take measured in both full music contexts, same authored phrase.
  for _,cue in ipairs({'hit','kick','impact','beam'}) do
   song(id,0)
   record(key..'-'..cue,function() effect(cue);H.wait(210) end)
  end
  song(id,0)
  record('mix-'..key,function()
   for cycle=1,4 do
    for _,cue in ipairs({'hit','kick','impact','hit','kick'}) do effect(cue);H.wait(5) end
    effect('beam')
    for i=1,9 do H.wait(5);effect('impact') end
    H.wait(42)
   end
   H.wait(60)
  end)
 end
 if SONG_PAIRS then
  for _,s in ipairs({{2,13},{11,7},{44,15},{4,4},{12,6},{60,0}}) do
   song(s[1],s[2])
   record(string.format('song-%02X',s[1]),function() H.wait(481);cut();H.wait(241) end)
  end
 end
 H.result('captured',true)
 H.result('volume_saturations',volumeSaturations)
end
