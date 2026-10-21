-- Snapshots are taken at the end of the field NMI: OAM and VRAM belong to
-- the same completed field frame. Actor inputs are sampled at UI drawing.
local capture, inputs, snapshots, needFull = nil, nil, {}, 0
local cpuStart, cpu={},{}
local function clockNow() return emu.getState().masterClock end
local function beginCost(name) cpuStart[name]=clockNow() end
local function endCost(name)
  if not cpuStart[name] then return end
  local d=(clockNow()-cpuStart[name])/1364
  cpu[name]=cpu[name] or {n=0,sum=0,max=0}
  local c=cpu[name];c.n=c.n+1;c.sum=c.sum+d;c.max=math.max(c.max,d)
end

local function snapshotInputs()
  local a={}
  local cells={}
  local tiles={0x122,0x124,0x126,0x128,0x12A,0x12C,0x12E,0x184,0x186,0x188,0x18A,0x1A8,0x1AA,0x1AC,0x1AE}
  for i=0,14 do cells[#cells+1]={key=H.r16(0x317840+i*2),tile=tiles[i+1]} end
  for i=0,11 do
    local b=0x7EE000+i*0x200
    a[#a+1]={index=i,active=(H.r8(b)&1)~=0,species=H.r8(b+0x180),hp=H.r16(b+0x182),maxHp=H.r16(b+0x184),screenX=H.r16(b+0x20),screenY=H.r16(b+0x22),age=ui(0x58+i*2),fmt=ui(0x88+i*2)}
  end
  inputs={actors=a,cells=cells,map=H.r16(0x7E00DC),charge=H.r16(0x7ED826),charging=H.r8(0x7ED828)~=0,superSaiyan=H.r8(0x7ED740)~=0,weighted=H.r8(0x7EE1E1)==22,radio=ui(0x22)~=0,pal=ui(0x78),sc=ui(0xAE),shown=ui(0xA2),first=H.r8(0x317497)&127,numbers=ui(0x50),corners=ui(0x52),frame=H.frame}
end
local function nmiDone()
  if not capture or not inputs or (H.r8(0x7E00EC)&1)==0 then return end
  if needFull~=0 and (inputs.numbers&needFull~=needFull or inputs.corners&needFull~=needFull) then return end
  local name=capture;capture=nil
  H.dumpfile(name..'-oam.bin',emu.memType.snesSpriteRam,0,544)
  H.dumpfile(name..'-vram.bin',emu.memType.snesVideoRam,0,65536)
  H.dumpfile(name..'-cgram.bin',emu.memType.snesCgRam,0,512)
  inputs.pending=ui(0x7C)
  snapshots[name]=inputs
end
local function take(name,full)
  capture=name;needFull=full or 0
  for _=1,60 do if not capture then break end H.wait(1) end
  check(name..'_captured',not capture)
  H.shot(name)
end
function test()
  enter(BUNDLE)
  H.w8(0x7ECFAB,2)
  H.w8(0x316380,0x78) -- on, all three one-time jokes already heard
  setui(0,ui(0)&~0x10)
  local f=emu.addMemoryCallback(snapshotInputs,emu.callbackType.exec,0x00B077,0x00B077)
  local n=emu.addMemoryCallback(nmiDone,emu.callbackType.exec,SYM.core_field_nmi_done,SYM.core_field_nmi_done)
  local timers={}
  for _,t in ipairs({{'draw',SYM.ui_sc_draw_frame,SYM.destroy_late_frame}}) do
    timers[#timers+1]={emu.addMemoryCallback(function() beginCost(t[1]) end,emu.callbackType.exec,t[2],t[2]),t[2]}
    timers[#timers+1]={emu.addMemoryCallback(function() endCost(t[1]) end,emu.callbackType.exec,t[3],t[3]),t[3]}
  end
  local hits=0
  local hit=emu.addMemoryCallback(function()
    if H.r8(0x7EE181)==0x17 and ui(0x38)==18 then
      local st=emu.getState();hits=hits+1
      check('native_hit_'..hits,(ui(0x58)&0x8000)~=0 and st['cpu.y']==0 and st['cpu.dbr']==0x7E and st['cpu.d']==0)
      st['cpu.pc']=SYM.ui_t_analyzer_return&0xFFFF;st['cpu.k']=SYM.ui_t_analyzer_return>>16
      emu.setState(st)
    end
  end,emu.callbackType.exec,0xC03FB2,0xC03FB2)
  H.wait(70)
  take('scan',7)
  -- A solo charge isolates the changing reading from the crowded-field
  -- cache/CPU pressure covered separately by readoutBudget.
  local party={H.r8(0x7EE200),H.r8(0x7EE400)}
  H.w8(0x7EE200,party[1]&~1);H.w8(0x7EE400,party[2]&~1)
  H.wait(3)
  H.input={l=true,y=true}
  H.wait(14);take('charge_early',1)
  H.wait(18);take('charge_late',1)
  H.wait(65);take('charge_full',1)
  H.input=nil
  H.w8(0x7EE200,party[1]);H.w8(0x7EE400,party[2])
  H.wait(90)
  -- Radio's exact y<72 pixel mask, including partial glyphs/corners.
  command(2,MSG,0)
  H.waitFor(function() return ui(0x22)~=0 end,180)
  H.wait(20);take('radio')
  check('radio_visible',ui(0x22)~=0)
  command(5,0,0)
  H.wait(20)
  command(11,0x4000,0)
  H.wait(4);take('setpiece')
  check('setpiece_hidden',(ui(0xAE)&4)==0)
  command(12,0x4000,0);H.wait(20)
  -- Off removes continuous readings; an Analyzer hit still has its lifetime.
  H.w8(0x316380,0x38)
  H.wait(5);take('off')
  command(18,0,0)
  take('blink_0')
  H.wait(2);take('blink_4')
  H.wait(2);take('blink_8')
  H.wait(4);take('blink_14')
  H.wait(12);take('analyzer')
  check('analyzer_source',(ui(0x58)&0x8000)~=0 and ui(0x58)~=0xFFFF)
  command(18,0,0)
  H.waitFor(function() return ui(0x38)==0 end,30)
  check('repeat_restarts',(ui(0x58)&0x7FFF)<4)
  local untilFrame=ui(0x36)+241
  while ui(0x36)<untilFrame do H.wait(1) end
  take('expired')
  check('analyzer_expired',(ui(0xAE)&2)==0)
  emu.removeMemoryCallback(hit,emu.callbackType.exec,0xC03FB2,0xC03FB2)
  check('native_hits',hits==2)
  H.result('snapshots',snapshots)
  for _,c in pairs(cpu) do c.mean=c.sum/c.n end
  H.result('cpu',cpu)
  for _,t in ipairs(timers) do emu.removeMemoryCallback(t[1],emu.callbackType.exec,t[2],t[2]) end
  emu.removeMemoryCallback(f,emu.callbackType.exec,0x00B077,0x00B077)
  emu.removeMemoryCallback(n,emu.callbackType.exec,SYM.core_field_nmi_done,SYM.core_field_nmi_done)
  finish()
end
