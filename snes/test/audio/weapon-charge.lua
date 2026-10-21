-- Trace sources, the actor queue and EVERY final effect/bed dispatch. WRAM
-- callbacks see every bus mirror; native code executes through 00/80/C0.
-- The dispatcher's X is often a queue cursor, not an actor. Attribute $95
-- requests at their source instead of reporting that cursor as the hero.
local phase='setup'
local commands,requests,queued,phases,checks={},{},{},{},{}
local queueCosts={}
local queueStart=nil
local source,mail,actorQueue=nil,nil,nil
local extraPad=nil
local legacyPadArgument=nil
local function pc(s) return (s['cpu.k']<<16)|s['cpu.pc'] end
local function snapshot()
  return {map=H.r16(0x7E00DC),owners={H.r8(0x7EE02C),H.r8(0x7EE22C),H.r8(0x7EE42C)},
    can=H.r8(0x7ED812),active=H.r8(0x316001),ctl=H.r8(0x7ED741),form=H.r8(0x7ED811)}
end
local function request(id,at)
  local s=emu.getState();local x=s['cpu.x']
  local q={phase=phase,frame=H.frame,id=id,pc=pc(s),source=at,actor=x,
    caller=(s['cpu.k']<<16)|((H.r16(s['cpu.sp']+1)-2)&65535),
    owner=H.r8(0x7EE02C+x),meter=H.r16(0x7EE01A+x),can=H.r8(0x7ED812),
    goku=x==0 and H.r8(0x316001)~=0 and H.r8(0x7ED741)&1==0}
  requests[#requests+1]=q;source=q
end
for _,bank in ipairs({0,0x80,0xC0}) do
  for _,q in ipairs({{0xB3ED,0x27},{0xB3CB,0x28},{0xEC02,0x26}}) do
    local at=(bank<<16)|q[1]
    emu.addMemoryCallback(function() request(q[2],at) end,emu.callbackType.exec,at,at)
  end
  local queueAt=(bank<<16)|0xBB11
  emu.addMemoryCallback(function()
    local s=emu.getState();local id=s['cpu.a']&127
    queueStart={clock=s.masterClock,id=id,actor=s['cpu.x']}
    if source and source.frame==H.frame and source.id==id and source.actor==s['cpu.x'] then actorQueue=source
    else
      actorQueue={phase=phase,frame=H.frame,id=id,pc=queueAt,actor=s['cpu.x'],
        caller=(bank<<16)|((H.r16(s['cpu.sp']+1)-2)&65535),goku=false}
    end
  end,emu.callbackType.exec,queueAt,queueAt)
  local returnAt=(bank<<16)|0xBB26
  emu.addMemoryCallback(function()
    if not queueStart then return end
    local q=queueStart;queueStart=nil
    local key=string.format('%02X:%04X',q.id,q.actor)
    local c=queueCosts[key] or {calls=0,sum=0,max=0}
    local lines=(emu.getState().masterClock-q.clock)/1364
    c.calls=c.calls+1;c.sum=c.sum+lines;c.max=math.max(c.max,lines);queueCosts[key]=c
  end,emu.callbackType.exec,returnAt,returnAt)
end
emu.addMemoryCallback(function(_,v)
  if v&128==0 then return end
  local s=emu.getState()
  -- The old five-byte filter writes $95 itself, without entering BB11.
  local origin=actorQueue
  if source and source.frame==H.frame and source.id==(v&127) and source.actor==s['cpu.x'] then origin=source end
  queued[#queued+1]={phase=phase,frame=H.frame,id=v&127,writer=pc(s),origin=origin}
end,emu.callbackType.write,0x95,0x95,emu.cpuType.snes,emu.memType.snesWorkRam)
emu.addMemoryCallback(function(_,v)
  local s=emu.getState();local p=pc(s)
  mail={id=v,writer=p,cpuX=s['cpu.x']}
  if (p&65535)==0xB578 and #queued>0 then mail.origin=queued[#queued].origin end
  if not mail.origin then
    local x=s['cpu.x'];local native=(p>>16)&0x3F
    mail.origin={actor=native<3 and x%0x200==0 and x<=0x1600 and x or 'module',pc=p,goku=false}
  end
end,emu.callbackType.write,0x1E01,0x1E01,emu.cpuType.snes,emu.memType.snesWorkRam)
for _,bank in ipairs({3,0x83,0xC3}) do
  local at=(bank<<16)|0x0160
  emu.addMemoryCallback(function()
    local cmd=H.r8(0x7E1E00)
    if cmd~=2 and cmd~=0x81 then return end
    local s=emu.getState();local sp=s['cpu.sp'];local id=H.r8(0x7E1E01)
    commands[#commands+1]={phase=phase,frame=H.frame,cmd=cmd,id=id,p2=H.r8(0x7E1E02),p3=H.r8(0x7E1E03),
      pc=pc(s),caller=(H.r8(sp+3)<<16)|((H.r16(sp+1)-3)&65535),cpuX=s['cpu.x'],
      writer=mail and mail.writer or 0,origin=mail and mail.id==id and mail.origin or nil,state=snapshot()}
  end,emu.callbackType.exec,at,at)
end
emu.addEventCallback(function()
  if not extraPad then return end
  if legacyPadArgument==nil then
    -- Some Mesen2 builds' SetInput pushes a fourth Lua argument, then
    -- reads port from argument 3 instead of 2. Detect that with GetInput;
    -- do not silently test pad 1 twice. No global settings are modified.
    -- SourMesen/Mesen2 Core/Debugger/LuaApi.cpp, SetInput (lua_settop(4)).
    emu.setInput({b=true},1)
    legacyPadArgument=not emu.getInput(1).b
    emu.setInput({b=false},0)
  end
  if legacyPadArgument then emu.setInput(extraPad,1,1) else emu.setInput(extraPad,1) end
end,emu.eventType.inputPolled)
local function mark(name)
  phase=name;local p=snapshot();p.name=name;p.frame=H.frame;phases[#phases+1]=p
end
local function fresh(bundle,settle)
  phase='setup';extraPad=nil;source=nil;mail=nil;actorQueue=nil
  H.load(CHECKPOINT);H.wait(5)
  assert(H.importSnesJs(IMPORT..(bundle or 'animation-audit__native__rabite-field-a')))
  H.w8(0x316001,1);H.wait(settle or 40)
end
local function hold(name,n,buttons)
  mark(name);H.hold(buttons or 'b',n or 300);H.wait(12)
  phases[#phases].finish=snapshot()
end
-- Loaded/late native writes that the normal canAttack cleanup would hide.
-- Seed just before the REAL meter/stamina logic, never jump the CPU or
-- send a sound from the test. These hit both level and full-charge edges.
local function seedMeter(actor,level)
  local done=false;local ids={}
  for _,bank in ipairs({0,0x80,0xC0}) do
    local at=(bank<<16)|0xB348
    ids[#ids+1]={at,emu.addMemoryCallback(function()
      if done or emu.getState()['cpu.x']~=actor then return end
      done=true;H.w16(0x7EE01A+actor,(level<<8)|0x2C);H.w8(0x7EE01F+actor,0)
    end,emu.callbackType.exec,at,at)}
  end
  H.hold('b',24)
  for _,q in ipairs(ids) do emu.removeMemoryCallback(q[2],emu.callbackType.exec,q[1],q[1]) end
  H.wait(12);return done
end
local function seedReady(actor)
  local done=false;local ids={}
  for _,bank in ipairs({0,0x80,0xC0}) do
    local at=(bank<<16)|0xEB4F
    ids[#ids+1]={at,emu.addMemoryCallback(function()
      if done or emu.getState()['cpu.x']~=actor then return end
      done=true;H.w8(0x7EE1ED+actor,1);H.w8(0x7EE063+actor,0xF0)
    end,emu.callbackType.exec,at,at)}
  end
  H.hold('b',24)
  for _,q in ipairs(ids) do emu.removeMemoryCallback(q[2],emu.callbackType.exec,q[1],q[1]) end
  H.wait(12);return done
end
function test()
  fresh('danger-progress__waterfall');hold('field-empty')
  fresh();hold('field-enemies')
  fresh();H.hold('right',12);H.hold('b',80);H.wait(3);hold('after-combo')
  fresh();H.w16(0x7EE1F1,60);H.w8(0x7EE1F0,3);hold('after-hit')
  hold('repress-after-hit')
  fresh();mark('walking');for i=1,12 do H.hold('left b',10);H.hold('right b',10) end
  fresh('barrier-audit__potos-probe');hold('town-potos')
  fresh('preset__late');hold('dungeon')
  fresh();H.w8(0x7ED740,1);H.w8(0x7ED811,1);H.w8(0x7ED8A9,1);hold('super-saiyan')
  for i,name in ipairs({'companion-primm','companion-popoi'}) do
    fresh();for _=1,i do H.tap('select',4,20) end
    local actor=i*0x200
    checks[name..'_leads']=H.r8(0x7EE02C)==0 and H.r8(0x7EE02C+actor)==1
    -- Fixtures have zero weapon skill; give the companion a normal level
    -- cap so the real meter reaches its level and full-charge sounds.
    H.w8(0x7EE19C+actor,2);hold(name,520)
  end
  fresh();H.tap('select',4,20)
  -- Native two-player assignment: Primm on pad 1, Goku on pad 2. His
  -- actor slot does not move. The second controller holds its own B.
  H.w8(0x7EE02C,2);H.w8(0x7E00DA,1)
  extraPad={b=true};mark('goku-second-controller');H.wait(740)
  checks.second_pad_read=H.r16(0x7E0044)&0x8000~=0
  extraPad={b=false};H.wait(2);extraPad=nil;H.wait(12)
  checks.goku_second_controller=H.r8(0x7EE02C)==2 and H.r8(0x7EE22C)==1
  fresh();mark('menu');H.tap('x',4,100);H.tap('x',4,100)
  checks.menu_closed=H.r8(0x7ED812)~=0;hold('after-menu')
  fresh('barrier-audit__potos-probe');mark('map-change');H.w16(0x317490,0x8800|1)
  local stable=0;H.input={b=true}
  for _=1,600 do
    H.wait(1)
    if H.r16(0x7E00DC)==129 and H.r8(0x7E00D0)==0 and H.r8(0x7E00E4)==1 and H.r8(0x7E00E5)==1 then stable=stable+1 else stable=0 end
    if stable>=60 then break end
  end
  H.input=nil;H.wait(12);checks.map_change=stable>=60
  hold('after-map-change')
  fresh();assert(H.saveStable('held-load'));mark('state-load');H.load(H_OUT..'/held-load.mss');hold('after-state-load')
  -- A native GAME FILE save and reset/load, including its Goku sidecar.
  -- The save and private ROM's battery RAM belong only to this test run.
  fresh('barrier-audit__potos-probe');mark('native-save');H.w16(0x317490,0x85D8);H.wait(150)
  H.tap('b',6,60);H.tap('b',6,120)
  checks.native_saved=H.r16(0x316400)==0x4B47 and H.r8(0x7E00D0)==0
  mark('native-load');emu.reset();H.wait(1000);H.tap('start',6,180);H.tap('b',6,180)
  mark('after-native-load');H.hold('b',420);H.wait(12)
  checks.native_loaded=H.r8(0x316001)==1 and H.r16(0x7E0101)==0xC0A8 and H.r8(0x7ED812)==1
  hold('loaded-first-attack')
  fresh();mark('flight');for _=1,10 do H.hold('a left b',12);H.hold('a right b',12) end
  checks.flight_exercised=H.r8(0x7ED900)&1~=0
  fresh('danger-progress__waterfall');mark('world-takeoff');H.hold('l r',4)
  checks.world_flight=H.waitFor(function() return H.r16(0x7E0101)==0x88CF end,900)
  hold('world-flight-land',300)
  fresh('graphics-audit__party');H.w8(0x7ECF3F,4);mark('vegeta-entry');H.w16(0x317490,0x8800|0x304)
  H.waitFor(function() return H.r8(0x7EDBC0)==0x5A end,900)
  for _=1,400 do
    if H.r8(0x7E00D0)==0 and H.r8(0x7EDBC1)==1 then break end
    if H.r8(0x7E00D0)~=0 then H.tap('a',2,6) else H.wait(1) end
  end
  checks.vegeta_battle=H.r8(0x7EDBC1)==1;hold('vegeta-fight',600)
  fresh('preset__battle',1)
  for _,w in ipairs(FRIEZA_WRITES) do if w[3]==2 then H.w16(w[1],w[2]) else H.w8(w[1],w[2]) end end
  mark('frieza-setup');H.wait(100);hold('frieza-fight',600)
  fresh();mark('goku-level-edge');checks.seed_level=seedMeter(0,0)
  mark('goku-full-edge');checks.seed_full=seedMeter(0,7)
  mark('goku-ready-edge');checks.seed_ready=seedReady(0)
  fresh();H.w8(0x316001,0);H.w8(0x7EE19C,2);hold('native-boy',520)
  fresh();H.w8(0x7ED741,1);H.w8(0x7EE19C,2);hold('ending-randi',520)
  H.result('commands',commands);H.result('requests',requests);H.result('queued',queued)
  H.result('phases',phases);H.result('checks',checks);H.result('queueCosts',queueCosts)
end
