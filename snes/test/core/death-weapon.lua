-- The ordinary F9 death animation never consumes its weapon sheet.
-- Poison that unused buffer, watch actual CPU/DMA reads, and follow the
-- native reward/death/treasure path until the actor is removed or reused.
local function r24(a) return H.r16(a)|(H.r8(a+2)<<16) end
local function run(tag,drop)
  check(tag..'_import',H.importSnesJs(IMPORT_DIR..'/animation-audit__native__rabite-field-a'),'Rabite fixture')
  H.w8(LIVE+1,1)
  H.input=nil
  H.wait(45)
  local gp,xp=r24(0x7ECC6A),r24(0x7EE18D)
  local pending,skips,reads,bodyReads,reloads=false,0,0,0,0
  local rewardGp,rewardXp
  local force=emu.addMemoryCallback(function()
    if drop and emu.getState()['cpu.x']==0x600 then
      H.w8(0x7EE7CE,H.r8(0x7EE7CE)|0x40)
    end
  end,emu.callbackType.exec,0xC04286,0xC04286)
  local skip=emu.addMemoryCallback(function()
    if H.r16(0x7E0002)~=0x600 then return end
    pending=true;skips=skips+1
    rewardGp=r24(0x7ECC6A)-gp;rewardXp=r24(0x7EE18D)-xp
    for i=0,2047 do H.w8(0x7E5000+i,(i*61+0xA5)&255) end
  end,emu.callbackType.exec,DEATH_WEAPON_SKIP,DEATH_WEAPON_SKIP)
  local reload=emu.addMemoryCallback(function()
    local s=emu.getState()
    if pending and s['cpu.x']==0x600 and H.r16(s['cpu.d'])==0 and H.r8(0x7EE780)~=0xF9 then
      pending=false;reloads=reloads+1
    end
  end,emu.callbackType.exec,GRAPHICS_ENTRY,GRAPHICS_ENTRY)
  local read=emu.addMemoryCallback(function(a)
    if a<0x7E5800 then
      if pending then reads=reads+1 end
    elseif H.r8(0x7EE780)==0xF9 then
      bodyReads=bodyReads+1
    end
  end,emu.callbackType.read,0x7E5000,0x7E5FFF)
  H.input={right=true};H.wait(12)
  H.input={b=true};H.wait(180)
  H.input=nil;H.wait(48)
  emu.removeMemoryCallback(force,emu.callbackType.exec,0xC04286,0xC04286)
  emu.removeMemoryCallback(skip,emu.callbackType.exec,DEATH_WEAPON_SKIP,DEATH_WEAPON_SKIP)
  emu.removeMemoryCallback(reload,emu.callbackType.exec,GRAPHICS_ENTRY,GRAPHICS_ENTRY)
  emu.removeMemoryCallback(read,emu.callbackType.read,0x7E5000,0x7E5FFF)
  check(tag..'_skipped',skips==1,skips)
  check(tag..'_unused',reads==0,'read poisoned weapon bytes '..reads..' times')
  check(tag..'_body',bodyReads>0,'native death body was never uploaded')
  check(tag..'_reward',rewardGp==2 and rewardXp==1,'GP '..tostring(rewardGp)..', XP '..tostring(rewardXp))
  if drop then
    check(tag..'_treasure',H.r8(0x7EE780)==0xEA,'treasure species '..H.r8(0x7EE780))
    check(tag..'_reload',reloads==1 and not pending,'reloaded '..reloads..' times')
  else
    check(tag..'_removed',H.r8(0x7EE600)==0,'dead actor is still active')
  end
end
function test()
  check('skip_symbol',DEATH_WEAPON_SKIP>0,'missing death optimization')
  run('ordinary',false)
  run('treasure',true)
  finish()
end
