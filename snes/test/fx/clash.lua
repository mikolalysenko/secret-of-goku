-- Paired horizontal waves through the public API, native sprites/HUD in
-- front, bounded HDMA tables, cache changes, and release to a single wave.
function test()
  F.clear()
  if not F.import('barrier-audit__potos-probe') then return F.finish() end
  F.gokuOn(); H.wait(20)
  local x,y,sx,sy=F.goku()
  local cx,cy=x-sx,y-sy
  local writes={}
  local function written(addr,value) writes[addr&0xFFFF]=value end
  local cb=emu.addMemoryCallback(written,
    emu.callbackType.write,0x2123,0x2132)
  local cb80=emu.addMemoryCallback(written,
    emu.callbackType.write,0x802123,0x802132)
  local function pair(enemy,width,flip)
    F.beam(0,F.B.WAVE,0,flip and F.DIR.left or F.DIR.right,cx+(flip and 220 or 40),cy+100,90,width,36,20)
    F.beam(1,enemy,0,flip and F.DIR.right or F.DIR.left,cx+(flip and 40 or 220),cy+102,90,width+2,36,20)
  end
  local function tableEnd(p)
    for _=1,40 do
      if H.r8(0x310000+p)==0 then return p+1 end
      p=p+5
    end
    return 0xFFFF
  end
  for i,c in ipairs({{F.B.GALICK,54,false},{F.B.FINAL,80,true},{F.B.GALICK,12,true}}) do
    pair(c[1],c[2],c[3]); F.waitFx(8)
    local name='pair_' .. i
    F.check(name .. '_polygon',H.r16(0x317890)==5)
    local p2,p3=H.r16(0x317A3A),H.r16(0x317A3C)
    local base=0x7A92+((p3-0x7A92)//183)*183
    local last=math.max(tableEnd(p2),tableEnd(p3))
    F.check(name .. '_buffer',last<=base+183,'bytes=' .. (last-base))
    H.result(name .. '_bytes',last-base)
    local snapshot={};for a,v in pairs(writes) do snapshot[a]=v end
    H.result(name .. '_registers',snapshot)
    local samples,partial={},{}
    for k=1,12 do
      local s=F.waitFx(1);samples[#samples+1]=(s.line1-s.line0+262)%262
      if writes[0x2124]==8 and ((writes[0x212E] or 0)&0x14)~=0 then
        if writes[0x2130]~=0x92 or ((writes[0x212D] or 0)&0x14)~=0x14 or writes[0x2131]~=0x20 then
          partial[#partial+1]={tmw=writes[0x212E],ts=writes[0x212D],cgwsel=writes[0x2130],cgadsub=writes[0x2131]}
        end
      end
    end
    H.result(name .. '_partial_mirror',partial)
    F.check(name .. '_native_mirror_consistent',#partial==0)
    table.sort(samples);H.result(name .. '_held_lines',{median=samples[6],p90=samples[11],max=samples[12]})
    F.check(name .. '_cache_reused',H.r16(0x317A60)~=0)
    local colours={}
    for k=1,3 do
      H.wait(1); F.grab(name .. '_' .. k)
      local pixels=emu.getScreenBuffer()
      local blue,enemy=0,0
      local ec=c[1]==F.B.FINAL and 0x1BD or 0x6D3B
      for py=50,159 do for px=40,220 do
        local v=pixels[(py+7)*256+px+1]
        local rgb=((v>>19)&31)|(((v>>11)&31)<<5)|(((v>>3)&31)<<10)
        if rgb==0x7E24 then blue=blue+1 end
        if rgb==ec then enemy=enemy+1 end
      end end
      colours[#colours+1]={blue=blue,enemy=enemy}
    end
    H.result(name .. '_colours',colours)
    local visible=0;for _,v in ipairs(colours) do if v.blue>250 and v.enemy>250 then visible=visible+1 end end
    F.check(name .. '_both_colours',visible>=2)
    H.shot(name)
  end
  F.stop(0);F.waitFx(8)
  F.check('single_after_pair',H.r16(0x317890)==2)
  F.check('subscreen_restored',writes[0x2124]==0 and writes[0x212D]==H.r8(0x7E0022))
  F.stop(1);F.waitFx(8)
  F.check('pair_hdma_released',H.r16(0x317890)==0 and (H.r8(0x7E002C)&12)==0)
  emu.removeMemoryCallback(cb,emu.callbackType.write,0x2123,0x2132)
  emu.removeMemoryCallback(cb80,emu.callbackType.write,0x802123,0x802132)
  F.finish()
end
