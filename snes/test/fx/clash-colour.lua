-- Hardware feasibility probe, not a shipped renderer. One HDMA window pair
-- can select arbitrary colours via main-screen black clipping + fixed add,
-- but clipping also erases native OBJ/BG3. A subscreen copy restores them:
-- mask their main pixels in W2, leave their subscreen pixels unmasked, and
-- add them to the black backdrop. Compare all three cases in Mesen.
function test()
  F.clear()
  if not F.import('barrier-audit__potos-probe') then return F.finish() end
  F.gokuOn(); H.wait(20)
  local backdrop=H.r16(0x7E0600)
  local blue,purple=0x5CA3,0x6D3B
  local function tableAt(addr,rows)
    H.w8(addr-1,0)
    for _, row in ipairs(rows) do for _, b in ipairs(row) do H.w8(addr,b);addr=addr+1 end end
    H.w8(addr,0)
  end
  tableAt(0x326400,{{80,255,0,255,0},{80,20,99,100,190},{64,255,0,255,0},{127,255,0,255,0}})
  tableAt(0x326440,{{80,0,0,backdrop&255,backdrop>>8},{80,0,0,blue&255,blue>>8},{64,0,0,backdrop&255,backdrop>>8},{127,0,0,backdrop&255,backdrop>>8}})
  local clipping=false
  local mirror=false
  local cb=emu.addMemoryCallback(function()
    H.w8(0x4320,4);H.w8(0x4321,0x26);H.w16(0x4322,0x6400);H.w8(0x4324,0x32)
    H.w8(0x4330,3);H.w8(0x4331,0x21);H.w16(0x4332,0x6440);H.w8(0x4334,0x32)
    H.w8(0x2123,0xAA);H.w8(0x2124,mirror and 8 or 0);H.w8(0x2125,mirror and 0x88 or 0x80);H.w8(0x212E,mirror and 0x17 or 3)
    if mirror then H.w8(0x212D,0x14);H.w8(0x212F,0) end
    H.w8(0x2130,mirror and 0x92 or (clipping and 0x90 or 0x10));H.w8(0x2131,0x20)
    H.w8(0x2132,0x20|(purple&31));H.w8(0x2132,0x40|((purple>>5)&31));H.w8(0x2132,0x80|((purple>>10)&31))
  end,emu.callbackType.exec,SYM.fx_nmi_poly_enable,SYM.fx_nmi_poly_enable)
  F.beam(0,F.B.WAVE,F.F.SCREEN,F.DIR.right,20,120,170,40,36,0)
  F.waitFx(8);H.wait(3)
  F.grab('unclipped');H.shot('unclipped')
  local plain=emu.getScreenBuffer()
  clipping=true
  F.waitFx(8);H.wait(3)
  F.grab('black-clipped');H.shot('black-clipped')
  local clipped=emu.getScreenBuffer()
  local lost,blueCount,purpleCount=0,0,0
  local function c(v) return ((v>>16)&255)>>3 | ((((v>>8)&255)>>3)<<5) | (((v&255)>>3)<<10) end
  for y=80,159 do for x=20,190 do
    local i=(y+7)*256+x+1
    if x>=100 and c(clipped[i])==0 and c(plain[i])~=0 then lost=lost+1 end
    if x<100 and c(clipped[i])==blue then blueCount=blueCount+1 end
    if x>=100 and c(clipped[i])==purple then purpleCount=purpleCount+1 end
  end end
  H.result('native_pixels_blackened',lost)
  H.result('blue_pixels',blueCount);H.result('purple_pixels',purpleCount)
  F.check('independent_colours',blueCount>4000 and purpleCount>3000)
  F.check('black_clip_erases_native_pixels',lost>100,'lost=' .. lost)
  mirror=true
  F.waitFx(8);H.wait(3)
  F.grab('subscreen-mirror');H.shot('subscreen-mirror')
  local mirrored=emu.getScreenBuffer()
  local black,restored=0,0
  for y=80,159 do for x=100,190 do
    local i=(y+7)*256+x+1
    if c(clipped[i])==0 and c(plain[i])~=0 then
      if c(mirrored[i])==0 then black=black+1 end
      if c(mirrored[i])==c(plain[i]) then restored=restored+1 end
    end
  end end
  H.result('subscreen_black_pixels',black)
  H.result('subscreen_restored_pixels',restored)
  F.check('subscreen_preserves_native_pixels',restored==lost and black==0)
  emu.removeMemoryCallback(cb,emu.callbackType.exec,SYM.fx_nmi_poly_enable,SYM.fx_nmi_poly_enable)
  H.w8(0x2124,0);H.w8(0x212D,H.r8(0x7E0022));H.w8(0x212F,0)
  F.stop(0);F.waitFx(4)
  F.finish()
end
