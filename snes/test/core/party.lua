-- Native party status/AI/animation keeps its once-per-five-frame cadence.
-- Goku spreads the expensive CPU companions across phases 1 and 2; before
-- his arrival all three retain phase 3. Human players keep the same rate.
local function run(tag,on,player2,event)
  check(tag..'_import',H.importSnesJs(IMPORT_DIR..'/graphics-audit__party'),'party fixture')
  H.w8(LIVE+1,on and 1 or 0)
  H.wait(10)
  for i=3,11 do H.w8(0x7EE000+i*512,0) end
  H.w8(0x7EE22C,player2 and 2 or 0)
  H.w8(0x7EE42C,0)
  local measuring,finished=false,false
  local frames=0
  local calls={{},{},{}}
  local timers={}
  local frame=emu.addMemoryCallback(function()
    if finished then return end
    local phase=H.r8(0x7E0056)
    if not measuring then
      if phase~=0 then return end
      measuring=true
      for i=0,2 do H.w8(0x7EE041+i*512,100) end
    elseif frames==100 then
      for i=1,3 do timers[i]=H.r8(0x7EE041+(i-1)*512) end
      finished=true; measuring=false; return
    end
    frames=frames+1
    if event then H.w8(0x7E00D0,1) end
  end,emu.callbackType.exec,0x00B0C7,0x00B0C7)
  -- Exercise the scheduling gate without asking the event interpreter to
  -- follow a synthetic pointer: restore idle after the actor/OBJ pass.
  local restore=emu.addMemoryCallback(function()
    if event then H.w8(0x7E00D0,0) end
  end,emu.callbackType.exec,0x00B0D0,0x00B0D0)
  local function count()
    if not measuring then return end
    local x=emu.getState()['cpu.x']
    if x>0x400 or x%0x200~=0 then return end
    local a=calls[x//0x200+1]
    local phase=H.r8(0x7E0056)
    a[phase]=(a[phase] or 0)+1
  end
  local fast=emu.addMemoryCallback(count,emu.callbackType.exec,0x80F4CB,0x80F4CB)
  local slow=emu.addMemoryCallback(count,emu.callbackType.exec,0x00F4CB,0x00F4CB)
  check(tag..'_running',H.waitFor(function() return finished end,400),frames)
  emu.removeMemoryCallback(frame,emu.callbackType.exec,0x00B0C7,0x00B0C7)
  emu.removeMemoryCallback(restore,emu.callbackType.exec,0x00B0D0,0x00B0D0)
  emu.removeMemoryCallback(fast,emu.callbackType.exec,0x80F4CB,0x80F4CB)
  emu.removeMemoryCallback(slow,emu.callbackType.exec,0x00F4CB,0x00F4CB)
  for i=1,3 do
    local total,phases=0,0
    for _,n in pairs(calls[i]) do total=total+n; phases=phases+1 end
    local expected=on and not event and ({3,1,2})[i] or 3
    check(tag..'_actor'..i,total==20 and phases==1 and calls[i][expected]==20,
      'calls '..total..', expected phase '..expected)
    check(tag..'_active'..i,H.r8(0x7EE000+(i-1)*512)&1==1,'actor disabled')
    check(tag..'_timer'..i,timers[i]==80,'native actor timer '..tostring(timers[i])..', expected 80')
  end
  if player2 then check(tag..'_owner',H.r8(0x7EE22C)==2,'player assignment changed') end
end
function test()
  run('native',false,false)
  run('goku',true,false)
  run('player2',true,true)
  run('script',true,false,true)
  finish()
end
