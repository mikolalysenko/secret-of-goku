-- A window's lag vblank uploads CGRAM but retains the previous OAM. Force
-- that native NMI branch after the resident flame has reached the PPU.
-- No PPU state is fabricated: the native/core/FX upload handlers run.
function test()
  F.clear();assert(F.import('barrier-audit__potos-probe'));F.gokuOn();H.wait(30)
  F.style(0);F.drawHold(0,F.K.AURA,F.F.SCREEN,0,60,124,256,32,0,0)
  F.waitFx(20)
  F.check('resident_before_lag',F.oamFx()==6)
  local palette={};for i=256,511 do palette[i]=H.cgram(i) end
  local inject,lag=false,0
  local hook=emu.addMemoryCallback(function()
    if inject then
      H.w8(0x7E00EC,4)          -- palette/window work, no completed OAM
      H.w16(0x7E6E4C,0)        -- no completed module frame either
      lag=lag+1
    end
  end,emu.callbackType.exec,0x00C0A8,0x00C0A8)
  inject=true
  local corrupt=0
  for f=1,8 do
    H.wait(1)
    local pal=H.r8(0x317829)
    for i=2,31 do local at=256+pal*32+i;if H.cgram(at)~=palette[at] then corrupt=corrupt+1;break end end
  end
  inject=false
  emu.removeMemoryCallback(hook,emu.callbackType.exec,0x00C0A8,0x00C0A8)
  F.check('lag_vblanks_exercised',lag>=7,lag)
  F.check('lag_keeps_aura_colours',corrupt==0,corrupt)
  F.check('lag_keeps_aura_oam',F.oamFx()==6,F.oamFx())
  F.waitFx(5);F.stop(0);F.waitFx(4)
  F.check('aura_releases_after_lag',F.oamFx()==0,F.oamFx())
  F.finish()
end
