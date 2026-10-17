-- Native actions: plays every standard player animation (D1:37CC, ids 0-50)
-- on the hero through the game's own event opcode 31 (set actor animation),
-- as tools/qa/pose-audit.mjs does in the browser, and records per frame the
-- native inputs the pose read (the GOKU_TRACE build snapshots them at
-- $7E:7F00 inside goku_pose) plus the pose the cartridge chose. difftest.mjs
-- replays the trace through engine/goku-animation.js.
-- One import per form; the actions then run back to back in one session
-- (event: animation, wait, idle animation), like play, so the pose state
-- machine carries over between them exactly as it does in the browser.
-- The scratch event lives in the cartridge copy Mesen runs (test only).
ACTION_IDS = ACTION_IDS or nil
ACTION_FRAMES = ACTION_FRAMES or 120
FORMS = FORMS or {0, 1}
local SCRATCH_PC = 0x217F00      -- E1:7F00, free tail of the goku data bank
local SCRATCH = 0xE17F00
local TRACE = 0x7E7F00
local function setRom(pc, bytes)
  for i, b in ipairs(bytes) do emu.write(pc + i - 1, b, emu.memType.snesPrgRom) end
end
local trace = {}
local lastCount = -1
local function rec(tag, form)
  local count = H.r8(TRACE + 26)
  if count == lastCount then return end   -- no pose this frame (body not drawn)
  lastCount = count
  local s = G.state()
  local row = {tag, form,
    H.r16(TRACE + 0), H.r16(TRACE + 2), H.r16(TRACE + 4), H.r8(TRACE + 12), H.r8(TRACE + 13), H.r16(TRACE + 6),
    H.r16(TRACE + 8), H.r8(TRACE + 14), H.r8(TRACE + 15), H.r8(TRACE + 16), H.r8(TRACE + 17), H.r8(TRACE + 18),
    H.r16(TRACE + 10), H.r8(TRACE + 19), H.r8(TRACE + 20), H.r8(TRACE + 21), H.r8(TRACE + 22), H.r8(TRACE + 23),
    H.r8(TRACE + 24), H.r8(TRACE + 25),
    s.kind, s.sheet, s.col, s.row, s.var, s.flags, H.r16(G.addr.p_lift), s.cell, H.r8(0x7EE083)}
  trace[#trace + 1] = table.concat(row, ',')
end
local function play(id, form, base)
  local tag = string.format('a%02d', id)
  H.load(base)                     -- same starting state for every action
  lastCount = H.r8(TRACE + 26)
  for i = 1, 6 do H.wait(1); rec(tag, form) end
  -- 31 00 <anim>: hero animation; 28 FF: wait; 00: end
  setRom(SCRATCH_PC, {0x31, 0x00, 0x80 | id, 0x28, 0xFF, 0x00})
  H.w8(0x7E00D1, SCRATCH & 0xFF); H.w8(0x7E00D2, (SCRATCH >> 8) & 0xFF); H.w8(0x7E00D3, SCRATCH >> 16)
  H.w8(0x7E00D0, 1)
  for f = 1, ACTION_FRAMES do
    H.wait(1)
    rec(tag, form)
    if f == 3 or f == 14 or f == 40 then H.shot(string.format('%s_f%d_%d', tag, form, f)) end
  end
end
-- free movement (walk, run, push) for the pose state machine
local function roam(form)
  local pads = {{'', 6}, {'up', 36}, {'right', 30}, {'left', 30}, {'down', 36}, {'', 20}}
  for _, p in ipairs(pads) do
    for f = 1, p[2] do
      H.input = (p[1] ~= '' and {[p[1]] = true}) or nil
      H.wait(1)
      rec('roam', form)
    end
  end
  H.input = nil
end
function test()
  for _, form in ipairs(FORMS) do
    G.import('barrier-audit__potos-probe')
    lastCount = H.r8(TRACE + 26)
    G.on()
    H.w8(G.addr.form, form)
    H.wait(4)
    local base = string.format('base%d', form)
    H.save(base)
    roam(form)
    local ids = ACTION_IDS or {}
    if not ACTION_IDS then for i = 0, 50 do ids[#ids + 1] = i end end
    for _, id in ipairs(ids) do play(id, form, H_OUT .. '/' .. base .. '.mss') end
  end
  local f = assert(io.open(H_OUT .. '/trace.csv', 'w'))
  f:write('tag,form,map,x,y,anim,latched,seq,gframe,facing,lift,st1,st2,species,pad,e4,e5,e000,e02c,ec,ed,d0,kind,sheet,col,row,var,flags,lift_out,cell,count\n')
  f:write(table.concat(trace, '\n'))
  f:write('\n')
  f:close()
  H.result('rows', #trace)
  G.check(#trace > 1000, 'trace recorded (' .. #trace .. ' rows)')
  G.finish()
end
