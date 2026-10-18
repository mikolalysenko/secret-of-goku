-- Resident aura over the retail layers, including grass cut by real punches.
-- Sprite colours must not leak into BG palettes; animation reuses its cells.
local function palette()
  local p={};for i=0,255 do p[i]=H.cgram(i) end;return p
end
local function same(p)
  for i=0,255 do if H.cgram(i)~=p[i] then return false end end;return true
end
function test()
  F.clear();assert(F.import('barrier-audit__potos-probe'));F.gokuOn();H.wait(30)
  local base=palette()
  for tone=0,2 do for size=0,1 do
    local name='aura_'..tone..'_'..size
    F.style(tone);F.drawHold(0,F.K.AURA,F.F.SCREEN,0,60,124,256,size==0 and 16 or 32,0,0)
    F.waitFx(12)
    local s=F.stats()
    F.check(name..'_complete',s.sprites==(size==0 and 2 or 6),F.statstr(s))
    F.check(name..'_no_hdma',H.r16(0x317890)==0 and H.r8(0x7E002C)&12==0)
    F.check(name..'_background',same(base),'BG palette changed')
    for i=0,2 do F.grab(name..'_'..i);H.wait(1) end
    F.stop(0);F.waitFx(3)
  end end
  F.clear();assert(F.import('animation-audit__native__rabite-field-b'));F.gokuOn();H.wait(30)
  local grid={};for i=0,0x3FFF do grid[i]=H.r8(0x7F0000+i) end
  H.hold('down',2);H.hold('b',60);H.wait(15);H.hold('down',24);H.wait(15)
  local cuts=0;for i=0,0x3FFF do if grid[i]~=0 and H.r8(0x7F0000+i)==0 then cuts=cuts+1 end end
  F.check('grass_was_cut',cuts>0,cuts)
  -- Isolate background/OBJ composition after the gameplay cut. The crowded
  -- gameplay suite separately retains every party member and enemy.
  for i=1,11 do H.w8(0x7EE000+i*512,0) end
  H.wait(15)
  local sx,sy=H.r16(0x7EE020),H.r16(0x7EE022)-15
  -- The grass scene animates BG palette 6. Watch the writer rather than
  -- treating legitimate native palette animation as aura corruption.
  local leaks=0
  emu.addMemoryCallback(function()
    local s=emu.getState()
    if s['cpu.k']==0xAE and s['ppu.cgramAddress']<128 then leaks=leaks+1 end
  end,emu.callbackType.write,0x002122,0x002122)
  F.style(0);F.drawHold(0,F.K.AURA,F.F.SCREEN,0,sx,sy,256,32,0,0);F.waitFx(12)
  F.check('cut_grass_complete',F.stats().sprites==6,F.statstr(F.stats()))
  F.check('cut_grass_no_backdrop_hdma',H.r16(0x317890)==0 and H.r8(0x7E002C)&12==0)
  F.grab('cut_grass')
  local uploads=0
  for i=1,24 do
    -- The two poses only flip/reposition resident cells.
    F.drawHold(0,F.K.AURA,F.F.SCREEN,0,sx,sy,256,32,0,(i%2)*4)
    local s=F.waitFx(1);uploads=uploads+s.upl
  end
  F.check('aura_animation_no_uploads',uploads==0,uploads)
  F.stop(0);F.waitFx(3)
  F.check('aura_never_writes_background_palette',leaks==0,leaks)
  F.finish()
end
