-- The finale end to end through the story's own events, with no ending
-- cues written: every button wait is advanced with B and the scripts run
-- the ending from event 42F on (frieza-events.js buildFriezaEnding,
-- ending-events.js buildBadEnding).
--   FINALE = 'beast' (finale): the scene select's beast preset from
--     power-on (title code, cursor, B), the fed Mana Beast killed through
--     the native damage consumer (HP lowered to 1, then 5 queued from Goku:
--     its native death and event 42F follow), the good ending to its end
--     card; then, from a checkpoint taken while the Beast dies, the same
--     kill as the ordinary Beast (unfed: the bad 'beast' ending) to its
--     end card.
--   FINALE = 'frieza' (finale-frieza): the battle preset's state, Frieza
--     at his last tier with 1 HP pinned beside Goku, a real punch, the
--     victory beat, event C7 and on to the Beast (429), the kill, and the
--     ending until Shenron is summoned.
--   FINALE = 'party' (finale-party): the fed Beast with Primm and Popoi in
--     the party, the kill, the good ending with Popoi's revival and the
--     reunion on the cliff, to the end card.
-- Prelude (run.mjs): FINALE, DBG_WORK, PRESET_BEAST, FZP_BEAST, FZP_STAGE,
-- for 'frieza' BATTLE_WRITES, FZF_X/Y/CLOCK, FZ_MUSIC, FZM_BATTLE,
-- FZST_BATTLE, for 'party' PARTY_BUNDLE, PARTY_WRITES.
local EV = 0x7EDA00                  -- story: the script last entered by redirect

local function beastActor()
  for x = 0x600, 0x17FF, 0x200 do
    local b = 0x7EE000 + x
    if (H.r8(b) & 1) == 1 and H.r8(b + 0x180) == 127 then return b end
  end
end
-- HP 1, then 5 damage from Goku (actor 0) through the queue the native
-- consumer (C0:4053) applies: the Beast's own death sequence follows.
local function killBeast()
  local b = beastActor()
  if not b then return false end
  H.w16(b + 0x182, 1)
  H.w8(b + 0x1F0, 0)
  H.w8(b + 0x1EC, 0)
  H.w16(b + 0x1F1, 5)
  return H.waitFor(function() return H.r16(b + 0x182) == 0 end, 30)
end

-- King Kai's planet: Bubbles' position for the end card's reference (as
-- kai.lua); the still once he rests.
local function bubbles()
  local bx = (E.sram16(0x80) + 0x80) >> 8
  local by = (E.sram16(0x82) + 0x80) >> 8
  return bx, by, E.sram16(0x88), E.sram16(0x8C)
end
local function cardShot(name)
  H.waitFor(function() local _, _, _, walk = bubbles() return walk == 0 end, 400)
  H.wait(8)
  local bx, by, dir, walk = bubbles()
  H.shot(name)
  H.result(name, string.format('%d,%d,%d,%d', bx, by, dir, walk))
end

-- Follow the story from now on: B on every button wait ($D0 = $83), until
-- `stop(phase)` holds, or the end card has shown for 60 frames, or
-- `limit` frames, or 900 black frames in a row. Recorded under `tag`:
-- every nonzero ending phase in order, every entered script (story's
-- last event), the longest run of black pictures after 42F began (INIDISP
-- brightness 0 or forced blank), the transition's hold (the displayed
-- picture must stay black while the game's own fade shadow $E6 is free to
-- reach full brightness: door 2F's fade-in has to finish before the
-- script can reach the summon, 6B), and the frames from 42F to the end.
local function follow(tag, limit, stop)
  local phases, events = {}, {}
  local lastPhase, lastEvent = 0, -1
  local began, completeAt
  local black, blackMax, blackAt = 0, 0, ''
  local holdFrames, holdLit, holdNative = 0, 0, 0
  local tap = 0
  local reason = -1
  local why = 'limit'
  for f = 1, limit do
    H.wait(1)
    local ph = H.r8(E.phase)
    local ev = H.r16(EV)
    if ev ~= lastEvent then
      if #events < 64 then events[#events + 1] = string.format('%03X', ev) end
      lastEvent = ev
    end
    if ph ~= 0 and ph ~= lastPhase then
      if #phases < 32 then phases[#phases + 1] = ph end
      if ph == E.P.summon then
        H.result(tag .. '_summon_e6', H.r8(0x7E00E6))
        H.result(tag .. '_summon_map', H.r16(0x7E00DC))
      end
    end
    if ph ~= 0 then lastPhase = ph end
    if not began and (H.r16(E.flags) & 0x8000) ~= 0 then
      began = f
      reason = H.r16(0x7EDC94)
      H.result(tag .. '_flags', H.r16(E.flags))
    end
    local st = emu.getState()
    local dark = st['ppu.forcedBlank'] or st['ppu.screenBrightness'] == 0
    if began then
      if dark then
        black = black + 1
        if black > blackMax then
          blackMax = black
          blackAt = string.format('+%d phase %d age %d map %d e2 %02X e6 %02X', f - began, ph, H.r16(E.age), H.r16(0x7E00DC), H.r8(0x7E00E2), H.r8(0x7E00E6))
        end
        if black == 300 then H.shot(tag .. '-black-300') end
      else
        black = 0
      end
    end
    if ph == E.P.transition and H.r16(E.age) >= 50 then
      holdFrames = holdFrames + 1
      if not dark then holdLit = holdLit + 1 end
      local e6 = H.r8(0x7E00E6)
      if e6 < 0x80 and e6 > holdNative then holdNative = e6 end
    end
    tap = tap - 1
    if H.r8(0x7E00D0) == 0x83 and tap <= 0 then
      H.input = {b = true}
      tap = 12
    elseif tap == 9 then
      H.input = nil
    end
    if stop and stop(ph) then why = 'stop' break end
    if not completeAt and (H.r8(E.status) & 0x20) ~= 0 then
      completeAt = f
      H.result(tag .. '_complete_frames', f - (began or f))
    end
    if completeAt and f - completeAt >= 60 then why = 'complete' break end
    if black > 900 then why = 'black' H.shot(tag .. '-stuck') break end
  end
  H.input = nil
  H.result(tag .. '_phases', phases)
  H.result(tag .. '_events', events)
  H.result(tag .. '_began', began ~= nil)
  H.result(tag .. '_reason', reason)
  H.result(tag .. '_black_max', blackMax)
  H.result(tag .. '_black_at', blackAt)
  H.result(tag .. '_hold_frames', holdFrames)
  H.result(tag .. '_hold_lit', holdLit)
  H.result(tag .. '_hold_native', holdNative)
  H.result(tag .. '_stop', why)
  H.result(tag .. '_status', H.r8(E.status))
  H.result(tag .. '_phase', H.r8(E.phase))
  H.result(tag .. '_done', H.r16(E.done))
  return why
end

local function startPreset(index)
  local W = DBG_WORK
  H.wait(200)
  for _, b in ipairs({'up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'}) do H.tap(b, 4, 8) end
  if not H.waitFor(function() return H.r8(W + 0x1D) == 1 end, 60) then error('scene select did not open') end
  H.wait(10)
  local function cursor() return H.r8(W + 0x18) end
  if (cursor() >= 11) ~= (index >= 11) then H.tap('right', 4, 8) end
  for _ = 1, 11 do
    if cursor() == index then break end
    H.tap('down', 4, 8)
  end
  if cursor() ~= index then error(string.format('scene select cursor %d, wanted %d', cursor(), index)) end
  H.tap('b', 4, 4)
  if not H.waitFor(function() return H.r16(W) == 0x4244 end, 120) then error('preset not armed') end
  H.waitFor(function() return H.r8(W + 0x0C) ~= 1 end, 16000)
  return H.r8(W + 0x0C)
end

local function beastFinale()
  E.watchDma()
  H.result('preset_status', startPreset(PRESET_BEAST))
  H.result('beast_state', H.r8(FZP_BEAST))
  H.wait(30)
  H.shot('beast')
  H.result('killed', killBeast())
  H.wait(30)
  -- the Beast dies natively for about 3,200 frames before 42F: both
  -- outcomes start from here
  local cp = H.saveStable('dying', 600)
  H.result('checkpoint', cp)
  if follow('good', 9000) == 'complete' then cardShot('good-complete') end
  if not cp then return end
  H.load(H_OUT .. '/dying.mss')
  H.wait(1)
  -- the ordinary Beast: neither fed nor started (beast-challenge.js
  -- choose(false)); 42F's BEAST_VICTORY cannot mark it won
  H.w8(FZP_BEAST, 0)
  if follow('bad', 7000) == 'complete' then cardShot('bad-complete') end
end

local function friezaFinale()
  E.import('preset__battle')
  for _, w in ipairs(BATTLE_WRITES) do
    if w[3] == 2 then H.w16(w[1], w[2]) else H.w8(w[1], w[2]) end
  end
  H.w8(0x316040, 1)                  -- story ledger: version 1, all seven held
  H.w8(0x316041, 127)                -- and personally collected (the
  H.w8(0x316042, 127)                -- browser state's quest ledger)
  H.w8(0x316002, 1)                  -- !persist_ssj_lock: the permanent form
  H.w8(FZ_MUSIC, FZM_BATTLE)         -- the battle theme counts as playing
  -- Frieza at his last tier with 1 HP, held beside Goku with no attack due
  -- (the combat suite's frieza-punch setup) until a real punch lands
  local pin = emu.addMemoryCallback(function()
    H.w16(FZF_X, 310) H.w16(FZF_Y, 414) H.w16(FZF_CLOCK, 9999)
  end, emu.callbackType.exec, 0x00B0AC, 0x00B0AC)
  H.wait(4)
  H.hold('right', 2)
  local punches = 0
  for _ = 1, 12 do
    if H.r8(FZP_STAGE) ~= FZST_BATTLE then break end
    H.hold('b', 1)
    H.wait(5)
    punches = punches + 1
  end
  emu.removeMemoryCallback(pin, emu.callbackType.exec, 0x00B0AC, 0x00B0AC)
  H.result('punches', punches)
  H.result('stage_after_punch', H.r8(FZP_STAGE))
  local killed = false
  -- on to the Beast: kill it once its challenge has started (fed, as all
  -- seven seeds were collected), then into the ending up to the summon
  follow('frieza', 12000, function(ph)
    if not killed and H.r16(0x7E00DC) == 253 and (H.r8(FZP_BEAST) & 2) ~= 0 then
      H.result('beast_state', H.r8(FZP_BEAST))
      killed = killBeast()
      H.result('killed', killed)
    end
    return ph == E.P.summon and H.r16(E.age) >= 120
  end)
  H.shot('frieza-summon')
end

-- The full party at the fed Beast (a browser state with Primm and Popoi,
-- the beast reference's Frieza and challenge state, both recruited at the
-- showdown): Popoi revived by the wish, Primm's reunion with Dyluck on the
-- cliff (cue 176, door 3FF under the black hold), Potos, the end card.
local function partyFinale()
  E.import(PARTY_BUNDLE)
  for _, w in ipairs(PARTY_WRITES) do
    if w[3] == 2 then H.w16(w[1], w[2]) else H.w8(w[1], w[2]) end
  end
  H.w8(0x316040, 1)                  -- story ledger: version 1, all seven held
  H.w8(0x316041, 127)                -- and personally collected
  H.w8(0x316042, 127)
  H.w8(0x316002, 1)                  -- !persist_ssj_lock: the permanent form
  H.wait(10)
  H.result('party', (H.r8(0x7EE200) & 1) + 2 * (H.r8(0x7EE400) & 1))
  H.result('beast_state', H.r8(FZP_BEAST))
  H.result('killed', killBeast())
  if follow('party', 10000) == 'complete' then cardShot('party-complete') end
end

function test()
  if FINALE == 'frieza' then friezaFinale()
  elseif FINALE == 'party' then partyFinale()
  else beastFinale() end
end
