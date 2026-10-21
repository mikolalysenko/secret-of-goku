-- Shipping cartridge: every resident cue beside each arrangement. Music
-- tracks keep running; stolen voices, NON/EON/PMON and samples are restored.
function test()
  H.wait(30)
  for _,s in ipairs(SONGS) do
    local tag=string.format('music_%02X',s.id)
    cmd(3,s.id)
    check(tag..'_selected',H.waitFor(function() return H.r8(0x7E1E05)==s.id end,120))
    check(tag..'_started',H.waitFor(function() return aram(0xAD)==0xFF and dsp(0x2C)==s.evol end,600))
    H.wait(30)
    local samples={}
    for a=0x4DF1,(0xFA00-0x800*s.edl)-1 do samples[a]=aram(a) end
    local maxVoices,alive,release,heard=0,true,true,0
    for _,cue in ipairs(NATIVE_CUES) do
      cmd(1,cue[1])
      for f=1,180 do
        H.wait(1)
        alive=alive and aram(0xAD)==0xFF
        local owned=0
        for v=0,7 do
          if aram(0xAE)&(1<<v)~=0 and aram(0xFF80+v)==cue[2] then owned=owned+1 end
          if aram(0xAE)&(1<<v)==0 and dsp(v*16+8)>0 then heard=heard|(1<<v) end
        end
        maxVoices=math.max(maxVoices,owned)
      end
      for v=0,7 do
        if aram(0xAE)&(1<<v)~=0 and aram(0xFF80+v)==cue[2] then release=false end
      end
    end
    local damage=nil
    for a,value in pairs(samples) do if aram(a)~=value then damage=a;break end end
    check(tag..'_tracks_alive',alive)
    check(tag..'_one_effect_voice',maxVoices==1,maxVoices)
    check(tag..'_voices_returned',release)
    check(tag..'_music_audible',heard~=0,heard)
    check(tag..'_song_samples_intact',damage==nil,damage)
    check(tag..'_effect_samples_intact',effectSampleDamage()==nil,effectSampleDamage())
    check(tag..'_extension_intact',extensionDamage()==nil,extensionDamage())
    check(tag..'_noise_restored',aram(0xBF)==0 and (dsp(0x6C)&31)==aram(0xC5))
    check(tag..'_echo_parameters',dsp(0x2C)==s.evol and (dsp(0x7D)&15)==s.edl and dsp(0x0D)==s.efb)
    H.result(tag..'_max_stolen_voices',maxVoices)
  end
  finish()
end
