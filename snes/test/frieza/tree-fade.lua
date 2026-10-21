-- Observe the final INIDISP value, after the game's last brightness write.
-- Compare the return/wake ramps with the browser scene clocks, keep native
-- forced blank/darker fades, and check that the native shadow is untouched.
function F.treeFadeStart(sym, d)
  local scene, age = 0, 0
  local stats={returnFrames=0,wakeFrames=0,returnLevels={},wakeLevels={},bad=0,nativeBad=0,shadowBad=0,restored=0}
  local native, requested
  emu.addMemoryCallback(function()
    scene=H.r8(d.scene);age=H.r16(d.age)
  end,emu.callbackType.exec,sym.frieza_field_nmi)
  local function entry()
    native=H.r8(0x7E00E6)
    requested=nil
    if scene==d.returnScene then requested=math.max(0,math.floor(15*(48-age)/48+.5)) end
    if scene==d.wakeScene then requested=math.min(15,math.floor(15*age/40+.5)) end
  end
  for _,bank in ipairs({0,0x800000}) do
    emu.addMemoryCallback(entry,emu.callbackType.exec,bank+0xC15F)
    emu.addMemoryCallback(function()
      if native==nil then return end
      local st=emu.getState()
      if H.r8(0x7E00E6)~=native then stats.shadowBad=stats.shadowBad+1 end
      if native&0x80~=0 then
        if not st['ppu.forcedBlank'] then stats.nativeBad=stats.nativeBad+1 end
      elseif requested then
        local want=math.min(native&15,requested)
        if st['ppu.forcedBlank'] or st['ppu.screenBrightness']~=want then stats.bad=stats.bad+1 end
        local returning=scene==d.returnScene
        local field=returning and 'returnFrames' or 'wakeFrames'
        stats[field]=stats[field]+1
        stats[returning and 'returnLevels' or 'wakeLevels'][st['ppu.screenBrightness']]=true
      elseif scene==0 then
        stats.restored=stats.restored+1
        if st['ppu.forcedBlank'] or st['ppu.screenBrightness']~=(native&15) then stats.nativeBad=stats.nativeBad+1 end
      end
      native=nil
    end,emu.callbackType.exec,bank+0xC164)
  end
  return function()
    local function levels(a) local n=0;for _ in pairs(a) do n=n+1 end;return n end
    H.result('fades',stats)
    F.check(stats.returnFrames>=48 and stats.wakeFrames>=40,'both Tree fades exercised')
    F.check(levels(stats.returnLevels)>=12 and levels(stats.wakeLevels)>=12,'Tree fades show intermediate brightness levels')
    F.check(stats.bad==0,'final INIDISP follows both Tree fades ('..stats.bad..' wrong frames)')
    F.check(stats.nativeBad==0 and stats.restored>0,'native blank/fades and post-Tree brightness preserved')
    F.check(stats.shadowBad==0,'Tree ceiling leaves native brightness shadow unchanged')
  end
end
