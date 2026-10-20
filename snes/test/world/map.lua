-- Start opens the native globe; it uses its own NMI/VRAM/palettes. Returning
-- must restore Goku and the radar, including when Super Saiyan is active.
local function palette_bad()
  local cell=H.r16(H.r16(W.a.show)==0 and W.a.buf0 or W.a.buf1)
  if cell==0xFFFF then return 16 end
  local pal=H.r8(SYM.goku_cell_pal+cell)
  local bad=0
  for c=1,15 do
    if W.cgram_word(208+c)~=W.romw(SYM.goku_palettes+pal*32+c*2) then bad=bad+1 end
  end
  return bad
end
function test()
  local globeReady,flatReady=false,false
  for _,bank in ipairs({0,0x800000}) do
    emu.addMemoryCallback(function() globeReady=true end,emu.callbackType.exec,bank+0xA750)
    emu.addMemoryCallback(function() flatReady=true end,emu.callbackType.exec,bank+0xAC5E)
  end
  local resumed=nil
  emu.addMemoryCallback(function()
    if not resumed or H.r16(W.a.flags)&1==0 then return end
    for i=0,63 do
      local o=W.oam(i)
      if W.visible(o) and o.size==1 and o.pal==5 and o.tile>=0x80 and o.tile<=0xB7 then
        resumed.visible=resumed.visible+1
        if palette_bad()~=0 then resumed.bad=resumed.bad+1 end
        break
      end
    end
  end,emu.callbackType.exec,SYM.core_world_nmi_return)
  H.wait(5)
  W.import('preset__flight')
  H.w8(0x316380,1)
  W.on(0)
  H.wait(90)
  for form=0,1 do
    W.form(form);H.wait(20)
    local tag=form==0 and 'base' or 'ssj'
    W.check(tag..'_before_palette',palette_bad()==0,palette_bad())
    globeReady=false
    H.hold('start',4)
    W.check(tag..'_globe_ready',H.waitFor(function() return globeReady end,900))
    W.check(tag..'_globe',H.r16(0x7E0101)==0xA64A,W.nmi())
    H.shot(tag..'_globe')
    if form==1 then
      flatReady=false
      H.hold('r',4)
      W.check('flat_ready',H.waitFor(function() return flatReady end,900))
      W.check('flat_map',H.r16(0x7E0101)==0xAC26,W.nmi())
      H.shot('flat_map')
    end
    H.hold('right',20)
    globeReady=false;flatReady=false
    W.check(tag..'_map_navigation',H.waitFor(function() return globeReady or flatReady end,900))
    resumed={visible=0,bad=0}
    H.hold('b',4)
    W.check(tag..'_returned',H.waitFor(W.inWorld,300),W.nmi())
    H.wait(30)
    local bad,wrongTiles=0,0
    for _=1,60 do
      H.wait(1)
      if palette_bad()~=0 then bad=bad+1 end
      local show=H.r16(W.a.show)
      local cell=H.r16(show==0 and W.a.buf0 or W.a.buf1)
      if W.vram_cell_bad(cell,show==0 and 0x80 or 0x84)~=0 then wrongTiles=wrongTiles+1 end
    end
    W.check(tag..'_restored_palette',bad==0,bad)
    W.check(tag..'_restored_tiles',wrongTiles==0,wrongTiles)
    W.check(tag..'_first_visible_palette',resumed.visible>30 and resumed.bad==0,resumed.bad..'/'..resumed.visible)
    resumed=nil
    local fxBad=0
    for c=1,15 do
      if W.cgram_word(224+c)~=W.romw(SYM.world_fx_palette+c*2) then fxBad=fxBad+1 end
    end
    W.check(tag..'_effects_palette',fxBad==0,fxBad)
    W.check(tag..'_radar_returns',H.r16(0x7E7EA8)==1,H.r16(0x7E7EA8))
    H.shot(tag..'_returned')
    H.hold('y',8)
    W.check(tag..'_ki_after_map',H.r16(W.a.shot)==1,H.r16(W.a.shot))
    H.wait(90)
  end
  W.finish()
end
