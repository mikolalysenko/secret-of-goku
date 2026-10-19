-- Render overlapping, solid test sprites in Mesen. Verify actual foreground
-- pixels, incomplete-frame persistence, and the field-to-ring handoff.
local back, front = 0x31A0, 0x31A2
local function pixel()
  return emu.getScreenBuffer()[(64+7)*256+104+1] & 0xFFFFFF
end
local function priority()
  local s=emu.getState()
  return s['ppu.enableOamPriority'] and ((s['ppu.oamRamAddress']>>1)&127) or 0
end
function test()
  check('import',H.importSnesJs(IMPORT_DIR..'/emulator-probe__potos-state'),'Potos fixture')
  H.waitFor(idleField,300);H.wait(30)
  -- Supply two fully opaque 16x16 patterns at the actual OBJ tile address.
  -- Test-only direct writes at the end of NMI keep retail palette uploads
  -- from changing their red/green reference colours.
  local function paint()
    local s=emu.getState()
    local base=s['ppu.oamBaseAddress']+s['ppu.oamAddressOffset']
    for j,tile in ipairs({0xA0,0xA2}) do
      for _,part in ipairs({0,1,16,17}) do
        local a=((base+(tile+part)*16)&0x7FFF)*2
        for k=0,31 do
          local v=k<16 and k%2==j-1 and 255 or 0
          emu.write(a+k,v,emu.memType.snesVideoRam)
        end
      end
    end
    emu.write(0x102,0x1F,emu.memType.snesCgRam);emu.write(0x103,0,emu.memType.snesCgRam)
    emu.write(0x104,0xE0,emu.memType.snesCgRam);emu.write(0x105,3,emu.memType.snesCgRam)
  end
  local cb={}
  for _,pc in ipairs({0x00C16F,0x80C16F}) do
    cb[#cb+1]={emu.addMemoryCallback(paint,emu.callbackType.exec,pc,pc),pc}
  end
  setct(0x0A,100);setct(0x0C,60);setct(0x0E,back);setct(0x10,0)
  setct(0x14,100);setct(0x16,60);setct(0x18,front);setct(0x1A,0)
  setct(0x12,1);H.wait(5)
  local f=pixel()
  check('front_reference',((f>>8)&255)>((f>>16)&255)*2,string.format('%06X',f))
  setct(0x12,0);setct(0x08,1);H.wait(5)
  local b=pixel()
  check('back_reference',((b>>16)&255)>((b>>8)&255)*2,string.format('%06X',b))
  setct(0x12,1);H.wait(5)
  check('foreground_wins_overlap',pixel()==f,string.format('%06X != %06X',pixel(),f))
  check('ppu_first_sprite',priority()==findOam(100,60,front),priority())
  setct(0x40,12000);H.wait(15)
  check('foreground_survives_lag',pixel()==f,string.format('%06X',pixel()))
  check('priority_survives_lag',priority()==findOam(100,60,front),priority())
  setct(0x40,0);H.wait(6)
  for _=1,3 do
    if H.r16(CORE+0x20)==4 then break end
    H.tap('y',6,40)
  end
  check('ring_open',H.r16(CORE+0x20)==4,H.r16(CORE+0x20))
  check('ring_retires_field_effects',findOam(100,60,front)==nil and findOam(100,60,back)==nil,'field effects remain')
  check('ring_normal_priority',priority()==0,priority())
  H.shot('ring-order')
  for _=1,4 do
    if H.r16(CORE+0x20)==1 then break end
    H.tap('y',6,40)
  end
  H.wait(6)
  check('field_resumes',H.r16(CORE+0x20)==1,H.r16(CORE+0x20))
  check('foreground_after_ring',pixel()==f,string.format('%06X',pixel()))
  setct(0x08,0);setct(0x12,0);H.wait(5)
  check('rotation_cleared',not emu.getState()['ppu.enableOamPriority'],'still enabled')
  check('no_stale_front',findOam(100,60,front)==nil,'front remains')
  for _,p in ipairs(cb) do emu.removeMemoryCallback(p[1],emu.callbackType.exec,p[2],p[2]) end
  finish()
end
