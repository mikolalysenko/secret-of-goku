-- Destroy module test helpers. run.mjs prepends ABI (addresses from
-- abi.mjs) and SCN (the scenario), then this file and the harness.
D = {}
local WRAM = emu.memType.snesWorkRam
-- Fill destroy_hit's arguments and fire the debug trigger.
function D.hit(a)
  H.w16(ABI.arg_x, a.x); H.w16(ABI.arg_y, a.y); H.w16(ABI.arg_dir, a.dir)
  H.w16(ABI.arg_len, a.length); H.w16(ABI.arg_half, a.halfWidth); H.w16(ABI.arg_taper, a.taper or 0)
  H.w16(ABI.arg_kind, a.code); H.w16(ABI.arg_str, a.str or 256); H.w16(ABI.arg_id, a.id or 0)
  H.w16(ABI.arg_layer, a.layer or 0xFFFF)
  local n = H.r16(ABI.dbg_n)
  H.w16(ABI.dbg_cmd, 1)
  H.waitFor(function() return H.r16(ABI.dbg_n) ~= n end, 30)
  return H.r16(ABI.dbg_res)
end
-- Start a native event (or $800|door) through the module.
function D.event(id)
  local n = H.r16(ABI.dbg_n)
  H.w16(ABI.dbg_arg, id)
  H.w16(ABI.dbg_cmd, 2)
  H.waitFor(function() return H.r16(ABI.dbg_n) ~= n end, 30)
  return H.r16(ABI.dbg_res)
end
function D.orb(actor)
  local n = H.r16(ABI.dbg_n)
  H.w16(ABI.dbg_arg, actor)
  H.w16(ABI.dbg_cmd, 3)
  H.waitFor(function() return H.r16(ABI.dbg_n) ~= n end, 30)
  return H.r16(ABI.dbg_res)
end
function D.grid(name) H.dumpfile(name, WRAM, 0x10000, 0x8000) end
function D.pos() return {x = H.r16(0x7EE002), y = H.r16(0x7EE004), map = H.r16(0x7E00DC)} end
-- Log native redraw requests and cut sounds as the CPU writes them.
D.writes = {}
function D.watch()
  local function log(name)
    return function(address, value)
      if value ~= 0 then D.writes[#D.writes + 1] = {f = H.frame, k = name, v = value} end
    end
  end
  emu.addMemoryCallback(log('r82'), emu.callbackType.write, 0x000082, 0x000082)
  emu.addMemoryCallback(log('r83'), emu.callbackType.write, 0x000083, 0x000083)
  emu.addMemoryCallback(log('r95'), emu.callbackType.write, 0x000095, 0x000095)
end
