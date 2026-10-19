-- CPU companions ride local flight, keeping native status timers but no
-- ground movement, attacks or sprites. Landing and controller reassignment
-- release the same actors; no party slot is disabled to save CPU work.
function test()
  F.import('animation-audit__native__rabite-field-b')
  F.on()
  for i=3,11 do H.w8(0x7EE000+i*512,0) end
  H.wait(45)
  local function snapshot(tag)
    local v={flight=F.status(),mask=H.r16(0x7ED96C),actors={}}
    for _,b in ipairs({0x7EE000,0x7EE200,0x7EE400}) do
      v.actors[#v.actors+1]={active=H.r8(b),owner=H.r8(b+0x2C),hidden=H.r8(b+0xE),x=H.r16(b+2),y=H.r16(b+4),status=H.r16(b+0x190)}
    end
    H.log(tag,H.json(v))
  end
  snapshot('start')
  local phase='setup'
  local counts={}
  local callbacks={}
  local function watch(name,pc)
    local id=emu.addMemoryCallback(function()
      local x=emu.getState()['cpu.x']
      if x~=0x200 and x~=0x400 then return end
      local key=phase..'_'..name..'_'..x
      counts[key]=(counts[key] or 0)+1
    end,emu.callbackType.exec,pc,pc)
    callbacks[#callbacks+1]={id,pc}
  end
  watch('status',0x80F509)
  watch('ai',0x80F52A)
  watch('move',0x80D5F3)
  watch('contact',0x81CDD2)
  watch('body',0x80E40E)
  local followed,wrong=0,0
  local follow=emu.addMemoryCallback(function()
    if phase~='flying' then return end
    followed=followed+1
    if H.r16(0x7ED96C)~=3 then wrong=wrong+1 end
    for _,b in ipairs({0x7EE200,0x7EE400}) do
      if H.r16(b+2)~=H.r16(0x7EE002) or H.r16(b+4)~=H.r16(0x7EE004)
        or H.r8(b+0xB)~=H.r8(0x7EE00B) or H.r8(b)&1==0 then wrong=wrong+1 end
    end
  end,emu.callbackType.exec,0x00B077,0x00B077)
  H.hold('a left',8) -- stay inside this map, away from its eastern exit
  snapshot('takeoff')
  F.check(F.status().fly and H.r16(0x7ED96C)==3,'ordinary flight carries both CPU companions')
  for _,b in ipairs({0x7EE200,0x7EE400}) do H.w8(b+0x41,100) end
  phase='flying'
  for i=1,5 do H.hold('a right',8);H.hold('a left',8) end
  F.check(followed>60 and wrong==0,'carried actors follow Goku without changing slots: '..wrong..'/'..followed)
  for _,x in ipairs({0x200,0x400}) do
    F.check((counts['flying_status_'..x] or 0)>=12,'status update continues for '..x)
    F.check(H.r8(0x7EE041+x)<90,'native timer advances for '..x)
    for _,name in ipairs({'ai','move','contact','body'}) do
      F.check((counts['flying_'..name..'_'..x] or 0)==0,'carried '..x..' has no '..name..' work')
    end
  end
  phase='landing';H.wait(20)
  snapshot('landing')
  F.check(not F.status().fly and H.r16(0x7ED96C)==0,'landing releases the party')
  phase='landed';H.wait(40)
  for _,x in ipairs({0x200,0x400}) do
    for _,name in ipairs({'status','ai','move','contact','body'}) do
      F.check((counts['landed_'..name..'_'..x] or 0)>0,'landed '..x..' resumes '..name)
    end
  end
  phase='setup';H.hold('a left',8)
  H.w8(0x7EE22C,2) -- a second player joins an already-carried companion
  phase='player';H.hold('a left',8)
  snapshot('player')
  F.check(H.r8(0x7EE22C)==2 and H.r16(0x7ED96C)==2,'human ownership releases only that companion')
  F.check((counts.player_body_512 or 0)>0 and (counts.player_move_512 or 0)>0,'human companion renders and moves immediately')
  F.check((counts.player_body_1024 or 0)==0 and (counts.player_ai_1024 or 0)==0,'other companion remains carried')
  H.input=nil
  for _,c in ipairs(callbacks) do emu.removeMemoryCallback(c[1],emu.callbackType.exec,c[2],c[2]) end
  emu.removeMemoryCallback(follow,emu.callbackType.exec,0x00B077,0x00B077)
  H.result('counts',counts);H.result('followed',followed)
  H.result('failures',F.fail);H.result('pass',#F.fail==0)
  H.shot('party')
end
