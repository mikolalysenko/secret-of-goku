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
-- Power-on SRAM is arbitrary on hardware: fill the module's work area
-- ($800 bytes) with a fixed pseudo-random pattern before importing, which
-- also keeps runs independent of the emulator's saved SRAM.
function D.garbage()
  local seed = 20261017
  for a = ABI.DQ, ABI.DQ + 0x7FF do
    seed = (seed * 1103515245 + 12345) % 2147483648
    H.w8(a, (seed // 65536) % 256)
  end
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
-- Native field play with control (mana-mod.js canAttack, RAM part).
function D.ground()
  return H.r8(0x7E00E4) == 1 and H.r8(0x7E00E5) == 1 and H.r8(0x7E00D0) == 0
    and (H.r8(0x7E00EC) & 0xFE) == 0 and (H.r8(0x7E00ED) & 0x40) == 0
end
-- Load a map through the native door dispatcher from the current scene.
-- The browser QA tools' loader: event script 04 18+hi lo 05 00 (fade, door,
-- restore) run through the field dispatcher by debug command 4.
function D.door(door, map, flags)
  for k, v in pairs(flags or {}) do H.w8(0x7ECF00 + k, v) end
  local script = {0x04, 0x18 + (door >> 8), door & 0xFF, 0x05, 0x00}
  for i, b in ipairs(script) do H.w8(ABI.dbg_script + i - 1, b) end
  local n = H.r16(ABI.dbg_n)
  H.w16(ABI.dbg_cmd, 4)
  H.waitFor(function() return H.r16(ABI.dbg_n) ~= n end, 60)
  local started = H.r16(ABI.dbg_res)
  H.wait(10)
  local ok = H.waitFor(function() return H.r16(0x7E00DC) == map and D.ground() end, 900)
  H.wait(30)
  return started == 1 and ok
end
-- Wait while native events run, confirming dialogue windows.
function D.settle(frames, confirm)
  local busy = 0
  for i = 1, frames do
    if H.r8(0x7E00D0) ~= 0 then
      busy = busy + 1
      if confirm and i % 12 == 0 then H.tap('b', 2, 2) else H.wait(1) end
    else
      H.wait(1)
    end
  end
  return busy
end
-- Move the hero like the browser mod's Instant Transmission landing
-- (mana-mod.js finishTeleport): position, layer/terrain, motion, height.
function D.teleport(x, y, terrain)
  H.w16(0x7EE002, x); H.w16(0x7EE004, y)
  if terrain then H.w8(0x7EE00B, terrain) end
  H.w8(0x7EE006, 0); H.w8(0x7EE007, 0); H.w8(0x7EE045, 0)
  H.wait(90)
end
