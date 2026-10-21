-- Shipping voice admission, cancellation, menu/ring callback and song load.
function test()
  H.wait(40)
  local transfers, busyAddr, saved, pause = 0, nil, nil, false
  emu.addMemoryCallback(function(_,v)
    if v==0x8A and emu.getState()['cpu.k']==0xAA then transfers=transfers+1 end
  end,emu.callbackType.write,0x2140,0x2140)
  emu.addMemoryCallback(function()
    if busyAddr then saved=H.r8(busyAddr);H.w8(busyAddr,1) end
    -- Enter the real menu/ring callback with its documented M16/X16,
    -- DB=$7E contract and the caller's real RTL return address.
    if pause then
      emu.setState({['cpu.k']=pause>>16,['cpu.pc']=pause&0xFFFF})
      pause=false
    end
  end,emu.callbackType.exec,AUDIO_FRAME,AUDIO_FRAME)
  emu.addMemoryCallback(function()
    if busyAddr then H.w8(busyAddr,saved);busyAddr=nil end
  end,emu.callbackType.exec,AUDIO_DONE,AUDIO_DONE)

  local function start()
    cmd(1,AUDIO_SFX_FRIEZA_LAUGH)
    return H.waitFor(function() return aram(0xEC)~=0xFF end,30)
  end
  check('start_before_stop',start())
  cmd(4)
  check('stop_releases_voice',H.waitFor(function() return aram(0xEC)==0xFF end,8),aram(0xEC))
  check('start_before_pause',start())
  pause=AUDIO_PAUSE;H.wait(8)
  check('pause_releases_voice',aram(0xEC)==0xFF and H.r8(AU+0x23)==0,aram(0xEC))
  check('start_before_cancel',start())
  pause=AUDIO_CANCEL;H.wait(1)
  cmd(1,AUDIO_SFX_TRANSFORM);H.wait(8)
  check('cancel_releases_voice',aram(0xEC)==0xFF and H.r8(AU+0x23)==0,aram(0xEC))
  local fresh=false
  for v=0,7 do if aram(0xFF80+v)==0xE0 and dsp(v*16+8)>0 then fresh=true end end
  check('cancel_preserves_new_effect',fresh)

  -- Busy state exists only during the audio callback, leaving gameplay's
  -- own state intact. Requests must be dropped, not retried for 60 frames.
  for _,busy in ipairs({{'charge',0x7ED828},{'clash',0x7EDBEF}}) do
    local before=transfers
    busyAddr=busy[2];cmd(1,AUDIO_SFX_VEGETA_KAKAROT);H.wait(70)
    check('drop_'..busy[1],transfers==before and H.r8(AU+0x5A)==0,transfers-before)
  end

  check('start_before_song',start())
  cmd(3,4) -- Danger; its native loader keys off every voice.
  H.wait(180)
  check('song_selected',H.r8(0x7E1E05)==4,H.r8(0x7E1E05))
  check('song_cuts_voice',aram(0xEC)==0xFF and H.r8(AU+0x20)==0,aram(0xEC))
  check('song_alive',aram(0xAD)~=0,aram(0xAD))
  check('extension_intact',extensionDamage()==nil,extensionDamage())
  check('effect_samples_intact',effectSampleDamage()==nil,effectSampleDamage())
  check('custom_bank_intact',customDamage()==nil,customDamage())
  finish()
end
