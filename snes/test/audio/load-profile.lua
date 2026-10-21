-- Optional, read-only timing prelude for any Mesen suite:
-- SNES_LUA_PRELUDE=snes/test/audio/load-profile.lua node snes/test/audio/run.mjs songs loads
-- All times are NTSC frames (357366 master clocks), including fractions.
local rows, row, stage, stamp = {}, nil, nil, nil
local function now() return emu.getState().masterClock end
local function mark(nextStage)
  local t=now()
  if row and stamp then row[stage]=(row[stage] or 0)+(t-stamp)/357366 end
  stage=nextStage;stamp=t
end
emu.addMemoryCallback(function()
  if H.r8(0x7E1E01)==H.r8(0x7E1E05) then return end
  row={song=H.r8(0x7E1E01),moves={},uploads={}}
  rows[#rows+1]=row;stage='fade';stamp=now()
end,emu.callbackType.exec,0xC30198,0xC30198)
for _,t in ipairs({{0xC30200,'echo_setup'},{0xC30203,'sequence'},
    {0xC3028D,'cache_plan'},{0xC30379,'compact'},{0xC304C2,'tables'},
    {0xC30592,'finish'},{0xC3018D,'driver_start'}}) do
  emu.addMemoryCallback(function() if row then mark(t[2]) end end,emu.callbackType.exec,t[1],t[1])
end
-- Mode 7 acknowledges a length BEFORE copying. Its last copy finishes while
-- the CPU waits at C3:0423 for the instrument-transfer header. End the compact
-- phase only at the first sample's payload, not at C3:0400.
emu.addMemoryCallback(function()
  if row then mark('instruments');row.uploads[#row.uploads+1]=emu.getState()['cpu.x'] end
end,emu.callbackType.exec,0xC30487,0xC30487)
emu.addMemoryCallback(function()
  if row then
    local x,y=emu.getState()['cpu.x'],emu.getState()['cpu.y']
    row.moves[#row.moves+1]={id=H.r16(0x7E1E28+y),src=H.r16(0x7E1E48+x),
      dst=H.r16(0x7E1E48+y),bytes=H.r16(0x7E1E6A+x)}
  end
end,emu.callbackType.exec,0xC303AA,0xC303AA)
emu.addMemoryCallback(function()
  if row and stage=='driver_start' then
    mark('playing');H.result('song_load_profile',rows);row=nil
  end
end,emu.callbackType.exec,0x0DDD,0x0DDD,emu.cpuType.spc,emu.memType.spcMemory)
