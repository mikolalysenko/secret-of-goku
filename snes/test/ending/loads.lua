-- Native map loads under the scenes, as the finale's scripts do them
-- (frieza-events.js): the bad ending's door 2F under the doomed globe (the
-- globe loads again and its clock goes on) and the good ending's reunion
-- (cue 176 holds the picture black over the flight's VRAM; door 3FF, the
-- script's next command, brings the cliff back with Dyluck's record and
-- gives the field the screen). A control run loads the cliff without a
-- scene. Doors go through core's event mailbox from the idle Potos field.
local MAILBOX = EVENT_MAILBOX        -- !core_event_req (run.mjs, core's defines): $8000 | event id
local function door(d) H.w16(MAILBOX, 0x8000 | 0x0800 | d) end
local function bright() return H.r8(0x7E00E6) end
local function actors()             -- live actor slots after the party
  local n = 0
  for i = 3, 15 do
    if (H.r8(0x7EE000 + i * 0x200) & 1) == 1 then n = n + 1 end
  end
  return n
end
-- The finale's story flag: Dyluck's record (and the cliff's) show while
-- $CF4E is 8-15, as after the Mana Beast (quick-start.js writes 8).
local function finale() H.w8(0x7ECF4E, 8) end
local function settle()             -- the native fade-in has finished
  H.waitFor(function() return bright() == 0x0F end, 300)
  H.wait(30)
end
function test()
  -- Control: the cliff as the native game loads it.
  E.import('emulator-probe__potos-state')
  H.wait(20)
  finale()
  door(0x3FF)
  H.result('control_map', H.waitFor(function() return H.r16(0x7E00DC) == 180 end, 300) and 180 or H.r16(0x7E00DC))
  H.waitFor(function() return bright() >= 0x80 end, 300)
  settle()
  H.result('control_actors', actors())
  H.shot('cliff-native')

  -- Doomed globe (night) over door 2F.
  E.import('emulator-probe__potos-state')
  H.wait(20)
  E.cue('doomed', 0x8021)
  H.result('doomed_loaded', E.waitLoaded('doomed', 120))
  H.wait(20)
  H.result('doomed_age_before', H.r16(E.age))
  door(0x2F)
  H.result('door_map', H.waitFor(function() return H.r16(0x7E00DC) == 246 end, 300) and 246 or H.r16(0x7E00DC))
  H.result('doomed_reloaded', H.waitFor(function() return (H.r8(E.status) & 0x80) ~= 0 end, 300))
  H.waitFor(function() return (H.r8(E.status) & 0x80) == 0 end, 120)
  settle()
  H.result('doomed_phase', H.r8(E.phase))
  local age = H.r16(E.age)
  H.result('doomed_age_after', age)
  E.still('doomed-load', age + 2)

  -- The reunion after the flight.
  E.import('emulator-probe__potos-state')
  H.wait(20)
  finale()
  E.cue('scatter', 0x8000)
  E.waitLoaded('scatter', 120)
  E.waitAge(80, 300)
  E.cue('reunion')
  H.wait(12)
  H.result('hold_phase', H.r8(E.phase))
  H.result('hold_bright', bright())
  H.shot('reunion-hold')
  door(0x3FF)
  H.result('reunion_released', H.waitFor(function() return H.r8(E.phase) == 0 end, 400))
  H.result('reunion_map', H.r16(0x7E00DC))
  settle()
  H.result('reunion_actors', actors())
  H.result('reunion_status', H.r8(E.status))
  H.shot('reunion-cliff')
end
