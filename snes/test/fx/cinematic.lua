-- Cinematic Death Ball: all twelve OBJ frames, animated/held polygons,
-- even sizing and clipping, then the violet style at the same parameters.
local function capture(name)
  for i = 0, 2 do
    H.wait(1)
    F.grab(name .. (i == 0 and '' or '_' .. i))
  end
  H.shot(name)
  local boxes={}
  for i=0,H.r16(0x7ED738)-1 do
    local hi=(H.oam(512+i//4) >> ((i%4)*2))&3
    local x=H.oam(i*4); if (hi&1)~=0 then x=x-256 end
    local y=H.oam(i*4+1)+1
    local size=(hi&2)~=0 and 32 or 16
    if y<224 then boxes[#boxes+1]={x=x,y=y,size=size} end
  end
  H.result(name .. '_native',boxes)
end
function test()
  F.clear()
  if not F.import('barrier-audit__potos-probe') then return F.finish() end
  F.gokuOn()
  H.wait(20)
  F.style(1)
  for _, size in ipairs({16,32}) do
    for frame = 0, 11 do
      F.drawHold(0,F.K.DEATHBALL,F.F.SCREEN,0,60,100,size,0,0,frame)
      F.waitFx(8)
      capture(string.format('red_%d_%d',size,frame))
    end
  end
  F.stop(0); F.waitFx(4)
  capture('plain')
  for _, size in ipairs({24,54,80,128,224}) do
    F.drawHold(0,F.K.DEATHBALL,F.F.SCREEN,0,size == 24 and 60 or 128,size == 24 and 100 or 110,size,0,0,4)
    F.waitFx(8)
    capture('red_' .. size)
    F.check('red_' .. size .. '_polygon',H.r16(0x317890)==3,'on=' .. H.r16(0x317890))
  end
  F.drawHold(0,F.K.DEATHBALL,F.F.SCREEN,0,4,2,80,0,0,4)
  F.waitFx(8)
  capture('red_clip')
  F.check('red_clip_polygon',H.r16(0x317890)==3)
  -- Run changing art and size, measuring the complete FX callback in lines.
  local costs={}
  for i = 1, 60 do
    F.drawHold(0,F.K.DEATHBALL,F.F.SCREEN,0,128,110,64+2*i,0,0,i%12)
    local s=F.waitFx(1)
    costs[#costs+1]=(s.line1-s.line0+262)%262
  end
  table.sort(costs)
  H.result('red_animated_lines',{median=costs[30],p90=costs[54],max=costs[60]})
  F.check('red_animated_budget',costs[54]<65,costs[54] .. ' lines p90')
  F.drawHold(0,F.K.DEATHBALL,F.F.SCREEN,0,128,110,80,0,0,4)
  F.waitFx(8)
  costs={}
  for i = 1, 30 do local s=F.waitFx(1); costs[#costs+1]=(s.line1-s.line0+262)%262 end
  table.sort(costs)
  H.result('red_held_lines',{median=costs[15],p90=costs[27],max=costs[30]})
  F.style(0); F.waitFx(8)
  capture('violet_after_red')
  F.stop(0); F.waitFx(4)
  H.waitFor(function() return H.r16(0x317890)==0 end,12)
  F.check('red_hdma_released',H.r16(0x317890)==0 and (H.r8(0x7E002C)&12)==0)
  F.finish()
end
