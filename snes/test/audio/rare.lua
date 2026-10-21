-- Shipping hybrid: exactly three low-rate lines, beside resident effects.
function test()
  H.wait(40)
  check('extension_installed',extensionDamage()==nil,extensionDamage())
  local transfers, start, maxLines, latest, streaming = 0, nil, 0, 0, false
  local cpu={}
  emu.addMemoryCallback(function(_,v)
    if v==0x8A and emu.getState()['cpu.k']==0xAA then transfers=transfers+1;streaming=true end
  end,emu.callbackType.write,0x2140,0x2140)
  emu.addMemoryCallback(function() start=emu.getState().masterClock;streaming=false end,emu.callbackType.exec,AUDIO_FRAME,AUDIO_FRAME)
  emu.addMemoryCallback(function()
    if start and streaming then
      local cue=H.r8(AU+0x21)
      local v=cpu[cue] or {frames=0,sum=0,max=0}
      local lines=(emu.getState().masterClock-start)/1364
      v.frames=v.frames+1;v.sum=v.sum+lines;v.max=math.max(v.max,lines);cpu[cue]=v
    end
    if start and H.r8(AU+0x20)~=0 then
      local s=emu.getState();maxLines=math.max(maxLines,(s.masterClock-start)/1364)
      latest=math.max(latest,s['ppu.scanline'])
    end
    start=nil
  end,emu.callbackType.exec,AUDIO_DONE,AUDIO_DONE)
  local sampleStart=0x4DF1
  local sampleEnd=dsp(0x6D)*256
  local samples={}
  for a=sampleStart,sampleEnd-1 do samples[a]=aram(a) end
  local first=transfers
  cmd(2,1);H.wait(30);cmd(2,2);H.wait(60)
  check('kamehameha_off',transfers==first,transfers-first)
  for _,cue in ipairs({AUDIO_SFX_FRIEZA_LAUGH,AUDIO_SFX_VEGETA_FINAL_FLASH,AUDIO_SFX_VEGETA_KAKAROT}) do
    local heard,pitched,frames,played = false,false,0,transfers
    cmd(1,cue)
    for f=1,300 do
      H.wait(1)
      -- A native effect during the line must keep its asynchronous ports.
      if f==20 then cmd(1,AUDIO_SFX_HIT) end
      for v=0,7 do
        if dsp(v*16+4)==12 and dsp(v*16+8)>0 then
          heard=true;frames=frames+1
          pitched=pitched or (dsp(v*16+2)|(dsp(v*16+3)<<8))==0x0300
        end
      end
    end
    check('voice_'..cue,heard and pitched and transfers>played,frames)
    check('voice_ends_'..cue,H.r8(AU+0x20)==0 and aram(0xE3)==0,H.r8(AU+0x20))
    H.result('audible_frames_'..cue,frames)
  end
  local damage=nil
  for a=sampleStart,sampleEnd-1 do if aram(a)~=samples[a] then damage=a;break end end
  check('song_samples_intact',damage==nil,damage)
  check('effect_samples_intact',effectSampleDamage()==nil,effectSampleDamage())
  check('extension_intact',extensionDamage()==nil,extensionDamage())
  check('native_music_alive',aram(0xAD)~=0,aram(0xAD))
  check('deadline',latest<=200,latest)
  check('no_pending_native',H.r8(AU+0x5B)==0,H.r8(AU+0x5B))
  H.result('maxVoiceLines',maxLines);H.result('latestVoiceLine',latest)
  H.result('transfers',transfers)
  for cue,v in pairs(cpu) do
    H.result('voice_cpu_'..cue,{frames=v.frames,mean=v.sum/v.frames,max=v.max})
  end
  finish()
end
