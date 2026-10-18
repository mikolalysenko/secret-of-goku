-- Default cartridge: frequent effects use resident SPC samples. No BRR
-- traffic, bounded requests, real audible hits, and charge pulses stop.
function test()
  -- This checkpoint contains the original driver. The default cartridge
  -- must work without installing the optional streaming extension.
  H.wait(40)
  local streams, commands = 0, {}
  emu.addMemoryCallback(function(_, v)
    if v == 0x8A then streams = streams + 1 end
  end, emu.callbackType.write, 0x002140, 0x002140)
  emu.addMemoryCallback(function()
    if H.r8(0x7E1E00) == 2 then commands[#commands+1] = {frame=H.frame, id=H.r8(0x7E1E01)} end
  end, emu.callbackType.exec, 0xC30004, 0xC30004)
  for _, cue in ipairs({{AUDIO_SFX_HIT,0x50},{AUDIO_SFX_SWING,3},{AUDIO_SFX_BLAST,3},
    {AUDIO_SFX_TELEPORT,3},{AUDIO_SFX_LANDING,0x50},{AUDIO_SFX_BEAM,0xB0}}) do
    local first, heard = #commands, false
    cmd(1,cue[1])
    for f=1,45 do
      H.wait(1)
      for v=0,7 do
        if aram(0xFF80+v)==cue[2] and dsp(v*16+8)>0 then heard=true end
      end
    end
    check('native_cue_'..cue[1], #commands>first and commands[first+1].id==cue[2] and heard,
      'effect was not sent/audible')
  end
  local first=#commands
  cmd(5,AUDIO_LOOP_CHARGE)
  H.wait(180)
  local pulses=#commands-first
  check('charge_pulses_bounded',pulses>=6 and pulses<=8,pulses)
  cmd(6)
  H.wait(4)
  local stopped=#commands
  H.wait(60)
  check('charge_stops',#commands==stopped,#commands-stopped)
  cmd(5,AUDIO_LOOP_AIR)
  H.wait(120)
  check('air_does_not_stream_or_spam',#commands==stopped,#commands-stopped)
  cmd(6)
  check('no_brr_commands',streams==0,streams)
  check('sample_bank_intact',effectSampleDamage()==nil,effectSampleDamage())
  check('music_alive',aram(0xAD)~=0,aram(0xAD))
  H.result('commands',commands)
  finish()
end
