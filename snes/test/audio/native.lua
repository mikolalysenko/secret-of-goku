-- Default cartridge: frequent effects use resident SPC samples. No BRR
-- traffic, bounded requests, real audible hits, and charge pulses stop.
function test()
  -- This checkpoint contains the original driver. The default cartridge
  -- must work without installing the optional streaming extension.
  H.wait(40)
  local streams, commands = 0, {}
  local effectStart, maxEffectLines, clobbers = nil, 0, 0
  local streamWatch=emu.addMemoryCallback(function(_, v)
    if v == 0x8A then streams = streams + 1 end
  end, emu.callbackType.write, 0x002140, 0x002140)
  emu.addMemoryCallback(function()
    if H.r8(0x7E1E00) == 2 then
      commands[#commands+1] = {frame=H.frame, id=H.r8(0x7E1E01)}
      effectStart = emu.getState()['masterClock']
    end
  end, emu.callbackType.exec, 0xC30004, 0xC30004)
  emu.addMemoryCallback(function()
    if effectStart then
      maxEffectLines=math.max(maxEffectLines,(emu.getState()['masterClock']-effectStart)/1364)
      effectStart=nil
    end
  end, emu.callbackType.exec, 0xC30197, 0xC30197)
  emu.addMemoryCallback(function()
    if H.r8(AU+0x5B)~=0 then clobbers=clobbers+1 end
  end, emu.callbackType.write, 0x002141, 0x002143)
  for _, cue in ipairs(NATIVE_CUES) do
    local first, heard, maxVoices = #commands, false, 0
    cmd(1,cue[1])
    for f=1,180 do
      H.wait(1)
      local voices=0
      for v=0,7 do
        if aram(0xAE)&(1<<v)~=0 and aram(0xFF80+v)==cue[2] then
          voices=voices+1
          if dsp(v*16+8)>0 then heard=true end
        end
      end
      maxVoices=math.max(maxVoices,voices)
    end
    check('native_cue_'..cue[1], #commands>first and commands[first+1].id==cue[2] and heard,
      'effect was not sent/audible')
    check('voice_budget_'..cue[1],maxVoices==cue[3],maxVoices)
    local playing=false
    for v=0,7 do if aram(0xAE)&(1<<v)~=0 and aram(0xFF80+v)==cue[2] then playing=true end end
    check('cue_ends_'..cue[1],not playing,'effect still owns a voice after 180 frames')
  end
  local first=#commands
  cmd(5,AUDIO_LOOP_CHARGE)
  H.wait(180)
  local pulses=#commands-first
  check('charge_pulses_bounded',pulses>=6 and pulses<=8,pulses)
  check('charge_uses_rumble',commands[first+1] and commands[first+1].id==0xDD)
  cmd(6)
  H.wait(4)
  local stopped=#commands
  H.wait(60)
  check('charge_stops',#commands==stopped,#commands-stopped)
  cmd(5,AUDIO_LOOP_AURA);H.wait(60)
  check('aura_keeps_quieter_sweep',commands[stopped+1] and commands[stopped+1].id==0xDF)
  cmd(6);H.wait(60);stopped=#commands
  cmd(5,AUDIO_LOOP_AIR)
  H.wait(120)
  check('air_does_not_stream_or_spam',#commands==stopped,#commands-stopped)
  cmd(6)
  -- Resident effects also remain asynchronous when requested by native
  -- callers; songs retain their complete synchronous load/restore contract.
  for i=1,30 do cmd(8,i%2==0 and 0x50 or 3); H.wait(1) end
  H.wait(4)
  check('effect_cpu_bounded',maxEffectLines<2,maxEffectLines)
  check('pending_effect_finished',H.r8(AU+0x5B)==0,H.r8(AU+0x5B))
  check('no_brr_commands',streams==0,streams)
  -- A native song upload uses incrementing handshake counters (including
  -- 8A); those are not the optional PCM stream command we counted above.
  emu.removeMemoryCallback(streamWatch,emu.callbackType.write,0x002140,0x002140)
  local original=H.r8(0x7E1E05)
  cmd(1,AUDIO_SFX_HIT); H.wait(1)
  cmd(3,0x3B)
  check('new_song_selected',H.waitFor(function() return H.r8(0x7E1E05)==0x3B end,120))
  check('song_after_effect',H.waitFor(function() return aram(0xAD)==0xFF and dsp(0x2C)==SONGS[1].evol end,600),aram(0xAD))
  H.wait(30)
  cmd(9)
  check('native_song_restored',H.waitFor(function() return H.r8(0x7E1E05)==original end,600),H.r8(0x7E1E05))
  H.wait(180)
  check('pending_parameters_intact',clobbers==0,clobbers)
  check('sample_bank_intact',effectSampleDamage()==nil,effectSampleDamage())
  check('music_alive',aram(0xAD)~=0,aram(0xAD))
  H.result('commands',commands)
  H.result('maxEffectLines',maxEffectLines)
  finish()
end
