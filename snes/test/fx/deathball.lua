-- A continuous Death Ball must keep its old complete picture while a new
-- size/animation is waiting for VRAM. Exercise zero and partial budgets,
-- and actual deferred vblank uploads, for both browser palette styles.
function test()
  F.clear(); assert(F.import('barrier-audit__potos-probe')); F.gokuOn(); H.wait(30)
  local budget, defer = nil, false
  emu.addMemoryCallback(function()
    if budget then H.w16(0x317882, budget) end
  end, emu.callbackType.exec, SYM.fx_k_deathball, SYM.fx_k_deathball)
  emu.addMemoryCallback(function()
    if defer then H.w16(0x317A2A, 0) end -- no cell upload this vblank
  end, emu.callbackType.exec, SYM.fx_nmi, SYM.fx_nmi)
  local trace = {}
  local function watch(label, n, expected)
    for i=1,n do
      F.waitFx(1)
      local sprites=F.oamFx()
      trace[#trace+1]={label=label,frame=H.r16(0x317884),sprites=sprites,pending=H.r16(0x317880)}
      F.check(label..'_'..i, sprites==expected, sprites..' sprites, wanted '..expected)
    end
  end
  for style=0,1 do
    F.style(style)
    F.drawHold(0,F.K.DEATHBALL,F.F.SCREEN,0,60,100,16,0,0,3)
    F.waitFx(10)
    watch('small_'..style,2,1)
    budget=0
    F.drawHold(0,F.K.DEATHBALL,F.F.SCREEN,0,60,100,32,0,0,4)
    watch('grow_no_budget_'..style,3,1)
    budget=2; defer=true
    watch('grow_partial_'..style,4,1)
    defer=false; budget=nil
    F.waitFx(8)
    watch('grown_'..style,3,4)
    defer=true
    F.drawHold(0,F.K.DEATHBALL,F.F.SCREEN,0,60,100,32,0,0,5)
    watch('animate_deferred_'..style,4,4)
    defer=false
    F.waitFx(8)
    watch('animated_'..style,3,4)
    F.stop(0); F.waitFx(4)
  end
  H.result('trace',trace)
  F.finish()
end
