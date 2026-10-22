-- Default cartridge: frequent effects use resident SPC samples. No BRR
-- traffic, bounded requests, real audible hits, and charge pulses stop.
function test()
  -- This checkpoint contains the original driver. The default cartridge
  -- must work without installing the optional streaming extension.
  H.wait(40)
  local streams, commands = 0, {}
  local effectStart, maxEffectLines, clobbers = nil, 0, 0
  -- Native callers enter the driver at C3:0004. The module sends its own
  -- cues and beds straight to the ports (audio_native_send: A = command |
  -- p1<<8, X = p2 | p3<<8). Both are recorded as attempted commands, as the
  -- driver entry was; 'selector' marks the module's. A cue frame's whole
  -- audio_frame (selector and send) is timed from entry to audio_frame_done.
  -- Mailbox frames (the test's cmd()) add test_poll and an API call: time
  -- only cue frames requested as gameplay requests them (au_test clear).
  local frameStart, sent, maxCueLines, maxBedLines = nil, nil, 0, 0
  emu.addMemoryCallback(function()
    frameStart=H.r16(AU_TEST)==0 and emu.getState()['masterClock'] or nil;sent=nil
  end,emu.callbackType.exec,AUDIO_FRAME,AUDIO_FRAME)
  emu.addMemoryCallback(function()
    if sent and frameStart then
      local l=(emu.getState()['masterClock']-frameStart)/1364
      if sent==2 then maxCueLines=math.max(maxCueLines,l) else maxBedLines=math.max(maxBedLines,l) end
    end
    frameStart=nil
  end,emu.callbackType.exec,AUDIO_DONE,AUDIO_DONE)
  local streamWatch=emu.addMemoryCallback(function(_, v)
    if v == 0x8A then streams = streams + 1 end
  end, emu.callbackType.write, 0x002140, 0x002140)
  emu.addMemoryCallback(function()
    if (H.r8(0x7E1E00) == 2 or H.r8(0x7E1E00)==0x81) then
      commands[#commands+1] = {frame=H.frame, id=H.r8(0x7E1E01),cmd=H.r8(0x7E1E00),level=H.r8(0x7E1E02),rate=H.r8(0x7E1E03),selector=false}
      effectStart = emu.getState()['masterClock']
    end
  end, emu.callbackType.exec, 0xC30004, 0xC30004)
  if AUDIO_SEND~=0 then emu.addMemoryCallback(function()
    local s=emu.getState();local a,x=s['cpu.a'],s['cpu.x']
    commands[#commands+1] = {frame=H.frame, id=(a>>8)&255,cmd=a&255,level=x&255,rate=(x>>8)&255,selector=true}
    sent=a&255
  end, emu.callbackType.exec, AUDIO_SEND, AUDIO_SEND) end
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
  check('charge_requests_bounded',ROUND7 and pulses==1 or not ROUND7 and pulses>=6 and pulses<=8,pulses)
  check('charge_uses_rumble',commands[first+1] and commands[first+1].id==(ROUND7 and 0xED or 0xDD))
  cmd(6)
  H.wait(4)
  local stopped=#commands
  H.wait(60)
  check('charge_stops',#commands==stopped,#commands-stopped)
  cmd(5,AUDIO_LOOP_AURA);H.wait(60)
  check('aura_keeps_quieter_sweep',commands[stopped+1] and commands[stopped+1].id==(ROUND7 and 0xEE or 0xDF))
  cmd(6);H.wait(60);stopped=#commands
  cmd(5,AUDIO_LOOP_AIR)
  H.wait(120)
  check('air_does_not_stream_or_spam',#commands==stopped,#commands-stopped)
  cmd(6)
  if ROUND7 then
    -- A simultaneous swing/contact resolves to the contact and dispatches
    -- inside audio_frame, without a second end-of-frame ring/port visit
    -- and without the driver entry.
    H.wait(1) -- the loop-off mailbox op first: time this as a gameplay frame
    local first=#commands
    H.w8(AU+1,AUDIO_SFX_SWING);H.w8(AU+2,AUDIO_SFX_HIT)
    H.w8(AU,2);H.w8(AU+0x58,2);H.wait(5)
    check('contact_dispatches_in_selector',commands[first+1] and commands[first+1].id==0xE7 and commands[first+1].selector and #commands==first+1,
      commands[first+1] and string.format('%02X selector %s, %d commands',commands[first+1].id,tostring(commands[first+1].selector),#commands-first))
    H.wait(30)
    -- Combat keeps the same KICK cue. Audio selects F1 only for SSJ and
    -- must release either preceding swing before counting contact gain.
    local form=H.r8(0x7ED811)
    for _,f in ipairs({0,1,0}) do
      H.w8(0x7ED811,f)
      cmd(1,AUDIO_SFX_KICK_SWING);H.wait(1)
      local first=#commands
      cmd(1,AUDIO_SFX_KICK);H.wait(5)
      local id=f==1 and 0xF1 or 0xE8
      local owned,swing,audible=0,0,false
      for v=0,7 do if aram(0xAE)&(1<<v)~=0 then
        local cue=aram(0xFF80+v)
        if cue==id then owned=owned+1;audible=audible or dsp(v*16+8)>0 end
        if cue==0xE5 or cue==0xE6 then swing=swing+1 end
      end end
      check('kick_form_'..f,commands[first+1] and commands[first+1].id==id and owned>=1 and audible and swing==0,id)
      H.wait(30)
      local kicks=0
      for v=0,7 do if aram(0xAE)&(1<<v)~=0 and (aram(0xFF80+v)==0xE8 or aram(0xFF80+v)==0xF1) then kicks=kicks+1 end end
      check('kick_return_'..f,kicks==0,kicks) -- native ambient cues may still play
    end
    -- Ki keeps the same DE owner across forms. The existing reuse nibble
    -- carries the brighter, louder SSJ variant; no second voice or extra command.
    for i,f in ipairs({0,1,0,1,1,0}) do
      H.w8(0x7ED811,f)
      local first=#commands
      cmd(1,AUDIO_SFX_BLAST)
      local owned,audible=0,false
      -- Observe the whole interval: the native note key-off/key-on gap
      -- during the timbre handoff can fall on the fifth frame sample.
      for tick=1,5 do
        H.wait(1);local now=0
        for v=0,7 do if aram(0xAE)&(1<<v)~=0 and aram(0xFF80+v)==0xDE then
          now=now+1;audible=audible or dsp(v*16+8)>0
        end end
        owned=math.max(owned,now)
      end
      local p=aram(0x2F78)+256*aram(0x2F79)
      local c=commands[first+1]
      check('blast_form_'..i,c and c.id==0xDE and c.level==(f==1 and 0x0D or 0x0F) and aram(p+9)==2*f and owned==1 and audible,
        string.format('form %d, p2 %s, transpose %d, voices %d, audible %s',f,tostring(c and c.level),aram(p+9),owned,tostring(audible)))
    end
    H.wait(30)
    local launches=0
    for v=0,7 do if aram(0xAE)&(1<<v)~=0 and aram(0xFF80+v)==0xDE then launches=launches+1 end end
    check('blast_returns_music_voice',launches==0,launches)
    H.w8(0x7ED811,form)
    H.wait(20)
    local first=#commands
    -- Public loop-request ABI, with changing levels/rates and no test-loop
    -- refresh. Expiry must fade/release both voices after the final request.
    for f=1,120 do
      H.w8(AU+10,math.min(255,55+f));H.w8(AU+11,math.min(255,30+f))
      H.w8(AU+14,96+math.floor(f/4));H.w8(AU+15,104+math.floor(f/6))
      H.w16(AU+18,0)
      if H.r8(AU+0x58)==0 then H.w8(AU+0x58,1) end
      H.wait(1)
    end
    H.wait(30)
    local last,counts,updates,spaced,changed={},{},0,true,true
    for i=first+1,#commands do local c=commands[i]
      if c.cmd==0x81 and c.level>0 then
        updates=updates+1
        counts[c.id]=(counts[c.id] or 0)+1
        local p=last[c.id]
        if p then spaced=spaced and c.frame-p.frame>=8;changed=changed and (c.level~=p.level or c.rate~=p.rate) end
        last[c.id]=c
      end
    end
    local beds=0
    for v=0,7 do local id=aram(0xFF80+v);if aram(0xAE)&(1<<v)~=0 and (id==0xED or id==0xEE) then beds=beds+1 end end
    check('bed_updates_quantized',updates>=4 and updates<=16 and spaced and changed,updates)
    check('bed_updates_fair',counts[0xED]>=3 and counts[0xEE]>=3,'one bed starved')
    check('bed_expiry_releases_music_voices',beds==0,beds)
    first=#commands;cmd(5,AUDIO_LOOP_FRIEZA_CHARGE);H.wait(40)
    check('frieza_charge_uses_resident_bed',commands[first+1] and commands[first+1].id==0xED)
    cmd(6);H.wait(30)
  end
  -- Resident effects also remain asynchronous when requested by native
  -- callers; songs retain their complete synchronous load/restore contract.
  for i=1,30 do cmd(8,i%2==0 and 0x50 or 3); H.wait(1) end
  H.wait(4)
  check('effect_cpu_bounded',maxEffectLines<=(ROUND7 and 1.35 or 2),maxEffectLines)
  -- Round eight's cue frame: audio_frame 3.3-3.7 lines plus 1.8-1.9 in the
  -- core queue and driver entry (bed updates 3.6-4.9 in all). The direct
  -- send keeps the swing/contact frame below 3 lines and a bed update below 4.
  if AUDIO_SEND~=0 then
    check('cue_frame_bounded',maxCueLines>0 and maxCueLines<=3,maxCueLines)
    check('bed_frame_bounded',maxBedLines>0 and maxBedLines<=4,maxBedLines)
  end
  check('pending_effect_finished',H.r8(AU+0x5B)==0,H.r8(AU+0x5B))
  check('no_brr_commands',streams==0,streams)
  -- A native song upload uses incrementing handshake counters (including
  -- 8A); those are not the optional PCM stream command we counted above.
  emu.removeMemoryCallback(streamWatch,emu.callbackType.write,0x002140,0x002140)
  if CUSTOM then
    -- Stops and fades a module queues leave through the core's sound pump
    -- without the native driver's echo wait (audio_native_simple): at most
    -- ~3 lines of it, a late echo released by the next frame's poll; never
    -- the native dispatch (C3:0179). F0 keeps the native song bookkeeping,
    -- and a cue right after a stop still plays.
    local simple,dispatched,simpleStart={},0,nil
    local s1=emu.addMemoryCallback(function()
      local c=H.r8(0x7E1E00)
      simpleStart=(c~=1 and c~=2 and c~=0x81) and {cmd=c,clock=emu.getState()['masterClock'],frame=H.frame} or nil
    end,emu.callbackType.exec,0xC30004,0xC30004)
    local s2=emu.addMemoryCallback(function()
      if simpleStart then
        simpleStart.lines=(emu.getState()['masterClock']-simpleStart.clock)/1364
        simpleStart.pending=H.r8(AU+0x5B);simpleStart.song=H.r8(0x7E1E05);simpleStart.saved=H.r8(0x7E1E09)
        simple[#simple+1]=simpleStart;simpleStart=nil
      end
    end,emu.callbackType.exec,0xC30197,0xC30197)
    local s3=emu.addMemoryCallback(function() if simpleStart then dispatched=dispatched+1 end end,emu.callbackType.exec,0xC30179,0xC30179)
    local function owned(id) local n=0;for v=0,7 do if aram(0xAE)&(1<<v)~=0 and aram(0xFF80+v)==id then n=n+1 end end;return n end
    -- 80 0y sets the music volume ($84) at once: y times round nine's
    -- MUSIC_STEP (the operand of the driver's MOV Y,# at $1018).
    local volume,full=aram(0x84),15*aram(0x1019)
    cmd(7,0x00);H.wait(3)
    check('pump_fade_applied',volume>0 and aram(0x84)==0,string.format('%02X -> %02X',volume,aram(0x84)))
    cmd(7,0x0F);H.wait(3)
    check('pump_fade_restored',aram(0x84)==full,string.format('%02X, expected %02X',aram(0x84),full))
    cmd(5,AUDIO_LOOP_CHARGE);H.wait(40)
    local bed=owned(0xED)
    cmd(10,0xF2);H.wait(3)
    check('pump_stop_effects',bed>0 and aram(0xAE)==0 and aram(0xAD)~=0,string.format('bed %d, effect voices %02X, music %02X',bed,aram(0xAE),aram(0xAD)))
    cmd(6);H.wait(20)
    local first=#commands
    cmd(10,0xF2);H.wait(1);cmd(1,AUDIO_SFX_HIT);H.wait(4)
    check('cue_after_pump_stop',commands[first+1] and commands[first+1].id==0xE7 and owned(0xE7)>0,#commands-first)
    H.wait(60)
    local song,tracks=H.r8(0x7E1E05),aram(0xAD)
    cmd(10,0xF0);H.wait(1)
    local f0=simple[#simple]
    check('pump_stop_bookkeeping',f0 and f0.cmd==0xF0 and f0.song==0xFF and f0.saved==song,f0 and string.format('%02X: song %02X saved %02X (was %02X)',f0.cmd,f0.song,f0.saved,song))
    H.wait(3)
    check('pump_stop_music',aram(0xAD)==0 and aram(0xAE)==0,string.format('%02X %02X',aram(0xAD),aram(0xAE)))
    cmd(9)
    check('pump_song_restored',tracks~=0 and H.waitFor(function() return H.r8(0x7E1E05)==song and aram(0xAD)==tracks end,600),string.format('%02X %02X (%02X)',H.r8(0x7E1E05),aram(0xAD),tracks))
    emu.removeMemoryCallback(s1,emu.callbackType.exec,0xC30004,0xC30004)
    emu.removeMemoryCallback(s2,emu.callbackType.exec,0xC30197,0xC30197)
    emu.removeMemoryCallback(s3,emu.callbackType.exec,0xC30179,0xC30179)
    local maxLines,late=0,0
    for _,c in ipairs(simple) do maxLines=math.max(maxLines,c.lines);if c.pending~=0 then late=late+1 end end
    check('pump_simple_sent',#simple==5,#simple)
    check('pump_simple_bounded',maxLines<=6,maxLines)
    check('pump_simple_not_native',dispatched==0,dispatched)
    check('pump_simple_released',H.r8(AU+0x5B)==0,H.r8(AU+0x5B))
    H.result('pump_simple',simple);H.result('pump_simple_late',late)
  end
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
  check('custom_bank_intact',customDamage()==nil,customDamage())
  check('music_alive',aram(0xAD)~=0,aram(0xAD))
  H.result('commands',commands)
  H.result('maxEffectLines',maxEffectLines)
  H.result('maxCueLines',maxCueLines);H.result('maxBedLines',maxBedLines)
  finish()
end
