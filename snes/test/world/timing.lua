-- Real video-frame measurements, including NMI return and form changes.
-- Imported world scene; ordinary controller inputs drive movement/attacks.
function test()
  H.wait(5)
  W.import(TIMING_SCENE)
  H.w8(0x316380, 1)              -- radar visible throughout ordinary cruise
  W.on(0)
  H.wait(90)
  H.save('ready')
  local current, start, cellStart = nil, nil, nil
  emu.addMemoryCallback(function()
    if not current then return end
    current.frames = current.frames + 1
    if H.r8(0x7E00EC) & 1 == 0 then current.misses = current.misses + 1 end
    start = emu.getState()['masterClock']
  end, emu.callbackType.exec, 0x0088CF)
  emu.addMemoryCallback(function()
    if not current or not start then return end
    local s = emu.getState()
    local lines = (s['masterClock'] - start) / 1364
    current.nmiMax = math.max(current.nmiMax, lines)
    if s['ppu.scanline'] < 225 or lines >= 37 then current.overruns = current.overruns + 1 end
    local form,act=H.r8(W.GOKU),H.r8(0x7ED814)
    current.forms[form]=(current.forms[form] or 0)+1
    current.actions[act]=(current.actions[act] or 0)+1
    if H.r16(W.a.shot)==1 then current.ki=current.ki+1 end
    if H.r16(W.a.shot)==2 then current.wave=current.wave+1 end
    if H.r16(W.a.charging)~=0 then current.charging=current.charging+1 end
    if H.r16(0x7E7EA8)~=0 then current.radar=current.radar+1 end
    local dx=((H.r16(0x7E00FA)-current.x+2048)&4095)-2048
    local dy=((H.r16(0x7E00FC)-current.y+2048)&4095)-2048
    current.travel=math.max(current.travel,math.abs(dx)+math.abs(dy))
    local bad, visible = false, false
    for i = 0, 63 do
      local o = W.oam(i)
      local tile = o.tile & 0xFF
      if W.visible(o) and o.pal == 5 and tile >= 0x80 and tile <= 0xB7 then
        local cell = H.r16((tile & 4) == 0 and W.a.buf0 or W.a.buf1)
        if cell ~= 0xFFFF then
          visible = true
          local pal = H.r8(SYM.goku_cell_pal + cell)
          for c = 1, 15 do
            if W.cgram_word(208+c) ~= W.romw(SYM.goku_palettes+pal*32+c*2) then bad = true end
          end
        end
      end
    end
    if bad then current.palette = current.palette + 1 end
    if visible then current.visible = current.visible + 1 end
    start = nil
  end, emu.callbackType.exec, SYM.core_world_nmi_return)
  emu.addMemoryCallback(function()
    if current then cellStart = emu.getState()['masterClock'] end
  end, emu.callbackType.exec, SYM.world_nmi_cell)
  emu.addMemoryCallback(function()
    if current and cellStart then
      current.cellMax = math.max(current.cellMax, (emu.getState()['masterClock']-cellStart)/1364)
      cellStart = nil
    end
  end, emu.callbackType.exec, SYM.world_nmi_mini)
  local cases = {
    {'cruise', {{'up',240},{'left up',120},{'right up',120}}},
    {'ki', {{'y',240}}},
    {'charge', {{'l y',120},{'',100}}},
    {'transform', {{'l a',140},{'',30},{'l a',4},{'',40}}},
  }
  for _, case in ipairs(cases) do
    H.load(H_OUT .. '/ready.mss'); H.wait(4)
    current = {frames=0, misses=0, overruns=0, nmiMax=0, cellMax=0, palette=0, visible=0, overflow=0, segments={},
      forms={},actions={},ki=0,wave=0,charging=0,radar=0,travel=0,x=H.r16(0x7E00FA),y=H.r16(0x7E00FC)}
    for _ = 1, REPEAT do
    for _, part in ipairs(case[2]) do
      local before = current.misses
      H.input = {}; for button in part[1]:gmatch('%S+') do H.input[button] = true end
      for _ = 1, part[2] do
        H.wait(1)
        if H.r8(0x00213E) & 0xC0 ~= 0 then current.overflow = current.overflow + 1 end
      end
      current.segments[#current.segments+1] = {buttons=part[1],frames=part[2],misses=current.misses-before}
    end
    end
    H.input = nil
    local result = current; current = nil
    H.result(case[1], result)
    W.check(case[1] .. '_world', W.inWorld(), W.nmi())
    W.check(case[1] .. '_visible', result.visible > result.frames * 0.9, result.visible)
    W.check(case[1] .. '_palette', result.palette == 0, result.palette)
    W.check(case[1] .. '_nmi', result.overruns == 0, result.overruns)
    W.check(case[1] .. '_sprites', result.overflow == 0, result.overflow)
    W.check(case[1] .. '_timing', result.misses == 0, result.misses)
    if case[1]=='cruise' then
      W.check('cruise_moves',result.travel>200,result.travel)
      W.check('cruise_radar',result.radar>result.frames/2,result.radar)
    elseif case[1]=='ki' then W.check('ki_fires',result.ki>10,result.ki)
    elseif case[1]=='charge' then W.check('charge_fires_wave',result.charging>60 and result.wave>10,result.charging .. '/' .. result.wave)
    else W.check('transform_changes_form',(result.actions[0x15] or 0)>20 and (result.forms[0] or 0)>0 and (result.forms[1] or 0)>0,result.forms) end
  end
  W.finish()
end
