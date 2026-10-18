-- R fast-forward from the Potos checkpoint (a NEW GAME, Goku made active as
-- the arrival does): Luka's menu (event $134) runs the one-time spear gift's
-- prose, then waits on the menu's choice. With R held the prose is
-- confirmed by the UI's B pulses and the choice is left to the player.
-- Prelude: HOLD ('r' or nil), FRAMES.
local function u8(a) return H.r8(a) end
function test()
  H.wait(2)
  -- the story test's "fresh" writes: Goku active, ledger re-initialised
  H.w8(0x316001, 1)
  H.w8(PERSIST_STORY + 0, 0)
  H.w8(PERSIST_STORY + 1, 0xff)
  H.w8(PERSIST_STORY + 2, 0xff)
  H.wait(10)
  -- queue the event through the story API (test command 15)
  local queued = 0
  for _ = 1, 30 do
    queued = command(15, 0x134, 0)
    if queued == 1 then break end
    H.wait(2)
  end
  H.result('queued', queued)
  local started = false
  for i = 1, FRAMES do
    if HOLD then H.hold(HOLD, 1) else H.wait(1) end
    if u8(0x7E00D0) ~= 0 then started = true end
  end
  H.result('started', started)
  H.result('d0', u8(0x7E00D0))
  H.result('gift', u8(0x7ECFC3))
  H.result('choice', command(16, 0, 0))
  H.shot('final')
end
