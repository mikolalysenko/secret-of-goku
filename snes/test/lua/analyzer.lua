-- Analyzer landings for tests on any build, through the game's own spell
-- landing (C0:3F94, which the spell scripts reach through C0:3806 when a
-- cast lands on its target). The call runs as a JSL from the field loop's
-- boundary before its frame call (00:B073, where engine/native-orbs.js
-- starts orb events) and returns there. The caster's spell byte (+$170)
-- holds Analyzer ($17) for the call only; the registers and that byte are
-- restored when the RTL comes back, so the UI hook (ui.md, Analyzer
-- readouts) sees exactly what a cast gives it. ui/analyzer-cast.lua casts
-- for real from Primm's ring instead.
--   Analyzer.land(target[, caster])  queue a landing (native actor offsets;
--                                    the caster defaults to Goku's slot)
--   Analyzer.wait([frames])          run frames until every queued landing ran
--   Analyzer.crowd()                 land on each living actor in slots 0-5
--   Analyzer.landed                  completed landings
Analyzer = {queue = {}, landed = 0}
local KEEP = {'cpu.a', 'cpu.x', 'cpu.y', 'cpu.ps', 'cpu.d', 'cpu.dbr'}
local active
local function boundary()
  local s = emu.getState()
  if active then
    if s['cpu.sp'] ~= active.sp then return end
    for _, k in ipairs(KEEP) do s[k] = active.regs[k] end
    emu.setState(s)
    H.w8(0x7EE170 + active.caster, active.spell)
    active = nil
    Analyzer.landed = Analyzer.landed + 1
    return
  end
  local job = table.remove(Analyzer.queue, 1)
  if not job then return end
  local sp, pc, regs = s['cpu.sp'], s['cpu.pc'], {}
  if sp < 0x100 or sp >= 0x2000 then Analyzer.error = 'stack outside low WRAM'; return end
  for _, k in ipairs(KEEP) do regs[k] = s[k] end
  active = {sp = sp, regs = regs, caster = job.caster, spell = H.r8(0x7EE170 + job.caster)}
  H.w8(0x7EE170 + job.caster, 0x17)
  -- JSL $C03F94 here: the RTL resumes at this instruction
  H.w8(0x7E0000 + sp, s['cpu.k'])
  H.w8(0x7E0000 + sp - 1, ((pc - 1) >> 8) & 0xFF)
  H.w8(0x7E0000 + sp - 2, (pc - 1) & 0xFF)
  s['cpu.sp'] = sp - 3
  s['cpu.k'] = 0xC0; s['cpu.pc'] = 0x3F94
  s['cpu.x'] = job.target; s['cpu.y'] = job.caster   -- C0:395E swaps them
  s['cpu.ps'] = s['cpu.ps'] & ~0x10                   -- 16-bit index
  emu.setState(s)
end
for _, bank in ipairs({0x00, 0xC0}) do
  emu.addMemoryCallback(boundary, emu.callbackType.exec, (bank << 16) | 0xB073, (bank << 16) | 0xB073)
end
function Analyzer.land(target, caster)
  Analyzer.queue[#Analyzer.queue + 1] = {target = target, caster = caster or 0}
end
function Analyzer.wait(frames)
  local want = Analyzer.landed + #Analyzer.queue + (active and 1 or 0)
  for _ = 1, frames or 30 do
    if Analyzer.landed >= want then return true end
    H.wait(1)
  end
  return Analyzer.landed >= want
end
function Analyzer.crowd()
  for i = 0, 5 do
    if H.r8(0x7EE000 + i * 0x200) & 1 ~= 0 then Analyzer.land(i * 0x200) end
  end
  return Analyzer.wait()
end
