-- The ready word can be published before native TSB $EC. Force that NMI
-- boundary with a different pending palette map, then let the same frame
-- complete. The old OAM's colours must remain until its replacement lands.
function test()
  F.clear(); assert(F.import('barrier-audit__potos-probe')); F.gokuOn(); H.wait(30)
  F.style(0); F.drawHold(0,F.K.AURA,F.F.SCREEN,0,60,124,256,32,0,0)
  F.waitFx(20)
  local shown=H.r8(0x317829)
  F.check('resident_aura',F.oamFx()==6)
  local colours={}; for i=2,31 do colours[i]=H.cgram(256+shown*32+i) end
  local inject, count, errors=false,0,0
  local hook=emu.addMemoryCallback(function()
    if inject then
      H.w8(0x7E00EC,4)              -- native palette refresh, old OAM
      H.w16(0x7E6E4C,1)             -- core's hook already returned
      H.w8(0x317822,(shown+1)%8)    -- next frame's BLUE allocation
      count=count+1
    end
  end,emu.callbackType.exec,0x00C0A8,0x00C0A8)
  inject=true
  for i=1,5 do
    H.wait(1)
    if H.r8(0x317829)~=shown then errors=errors+1 end
    for j=2,31 do if H.cgram(256+shown*32+j)~=colours[j] then errors=errors+1;break end end
  end
  inject=false
  emu.removeMemoryCallback(hook,emu.callbackType.exec,0x00C0A8,0x00C0A8)
  F.check('handshake_gap_exercised',count>=4,count)
  F.check('handshake_gap_keeps_displayed_map',errors==0,errors)
  -- Restore the queued map to the OAM that the real frame built.
  H.w8(0x317822,shown)
  F.waitFx(4)
  F.check('completed_frame_latches_again',H.r8(0x317829)==shown and F.oamFx()==6)
  F.stop(0);F.waitFx(4)
  F.check('completed_release',H.r16(0x31789E)==0 and F.oamFx()==0)
  F.finish()
end
