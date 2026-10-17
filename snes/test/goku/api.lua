-- Pose request API (combat, flight, story): drives goku_act / goku_mode /
-- goku_lift / goku_ctl the way those modules will, and records the native
-- inputs (GOKU_TRACE build) plus the requests and the chosen pose for
-- difftest.mjs, which replays them through engine/goku-animation.js with
-- the equivalent mod.action / flightTransition / ceiling / reaction state.
local TRACE = 0x7E7F00
local trace = {}
local lastCount = -1
local A = G.addr
local function rec(tag, form)
  local count = H.r8(TRACE + 26)
  if count == lastCount then return end
  lastCount = count
  local s = G.state()
  local row = {tag, form,
    H.r16(TRACE + 0), H.r16(TRACE + 2), H.r16(TRACE + 4), H.r8(TRACE + 12), H.r8(TRACE + 13), H.r16(TRACE + 6),
    H.r16(TRACE + 8), H.r8(TRACE + 14), H.r8(TRACE + 15), H.r8(TRACE + 16), H.r8(TRACE + 17), H.r8(TRACE + 18),
    H.r16(TRACE + 10), H.r8(TRACE + 19), H.r8(TRACE + 20), H.r8(TRACE + 21), H.r8(TRACE + 22), H.r8(TRACE + 23),
    H.r8(TRACE + 24), H.r8(TRACE + 25),
    s.kind, s.sheet, s.col, s.row, s.var, s.flags, H.r16(A.p_lift), s.cell, H.r8(0x7EE083),
    H.r8(A.act), H.r8(A.act_facing), H.r16(A.act_age), H.r8(A.act_arg), H.r8(A.act_dur),
    H.r8(A.mode), H.r8(A.mode_facing), H.r16(A.mode_age), H.r16(A.lift), H.r8(A.ctl)}
  trace[#trace + 1] = table.concat(row, ',')
end
local function clear()
  H.w8(A.act, 0); H.w8(A.mode, 0); H.w16(A.lift, 0); H.w8(A.ctl, 0); H.w16(A.act_age, 0); H.w16(A.mode_age, 0)
end
-- run an action request for n frames, advancing its age like its owner would
local function action(tag, form, kind, facing, arg, dur, n)
  H.w8(A.act, kind); H.w8(A.act_facing, facing); H.w8(A.act_arg, arg); H.w8(A.act_dur, dur)
  for age = 0, n - 1 do
    H.w16(A.act_age, age)
    H.wait(1); rec(tag, form)
  end
  clear()
  for i = 1, 4 do H.wait(1); rec(tag, form) end
end
local function mode(tag, form, kind, facing, n, lift, ctl)
  H.w8(A.mode, kind); H.w8(A.mode_facing, facing); H.w16(A.lift, lift or 0); H.w8(A.ctl, ctl or 0)
  for age = 0, n - 1 do
    H.w16(A.mode_age, age)
    H.wait(1); rec(tag, form)
  end
  clear()
  for i = 1, 4 do H.wait(1); rec(tag, form) end
end
local shots = 0
local function shot(tag) shots = shots + 1; H.shot(string.format('%02d_%s', shots, tag)) end
function test()
  for _, form in ipairs({0, 1}) do
    G.import('barrier-audit__potos-probe')
    lastCount = H.r8(TRACE + 26)
    G.on()
    H.w8(A.form, form)
    for i = 1, 6 do H.wait(1); rec('settle', form) end
    local sup = form == 1 and 0x80 or 0
    for facing = 0, 3 do
      for combo = 0, 2 do action('punch', form, 0x10, facing, sup | combo, 0, 10) end
      action('charge', form, 0x11, facing, sup, 0, 12)
      action('beam', form, 0x12, facing, sup, 24, 24)
      action('blast', form, 0x13, facing, sup | (facing & 1), 0, 10)
      action('teleport', form, 0x14, facing, sup, 0, 12)
      action('ready', form, 0x17, facing, sup, 0, 8)
      action('focus', form, 0x18, facing, sup, 0, 8)
    end
    -- transformation / reversion (front, base->gold sequence)
    action('transform', form, 0x15, 0, 0x80, 32, 32)
    action('revert', form, 0x16, 0, 0, 20, 20)
    mode('deflect', form, 0x20, 2, 10)
    mode('resist', form, 0x21, 0, 10)
    mode('hover', form, 0, 0, 30, 16, 0x08)
    mode('gapflight', form, 0x23, 0, 20)
    mode('ceiling', form, 0x25, 0, 60)
    mode('takeoff', form, 0x26, 0, 40)
    mode('landing', form, 0x27, 0, 34)
    -- screenshots of a few requests
    H.w8(A.act, 0x10); H.w8(A.act_facing, 1); H.w8(A.act_arg, sup | 1); H.w16(A.act_age, 3)
    H.wait(2); shot('punch' .. form)
    H.w8(A.act, 0x12); H.w8(A.act_dur, 24); H.w16(A.act_age, 10); H.wait(2); shot('beam' .. form)
    H.w8(A.act, 0x11); H.w8(A.act_facing, 0); H.w16(A.act_age, 5); H.wait(2); shot('charge' .. form)
    clear(); H.w8(A.mode, 0x26); H.w16(A.mode_age, 20); H.wait(2); shot('takeoff' .. form)
    clear(); H.w16(A.lift, 16); H.w8(A.ctl, 0x08); H.wait(2); shot('hover' .. form)
    clear(); H.wait(4)
  end
  local f = assert(io.open(H_OUT .. '/trace.csv', 'w'))
  f:write('tag,form,map,x,y,anim,latched,seq,gframe,facing,lift,st1,st2,species,pad,e4,e5,e000,e02c,ec,ed,d0,kind,sheet,col,row,var,flags,lift_out,cell,count,act,act_facing,act_age,act_arg,act_dur,mode,mode_facing,mode_age,glift,ctl\n')
  f:write(table.concat(trace, '\n'))
  f:write('\n')
  f:close()
  H.result('rows', #trace)
  G.check(#trace > 500, 'trace recorded (' .. #trace .. ' rows)')
  G.finish()
end
