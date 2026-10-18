-- X (ring / Menu-back) closes every options page wherever the ring last
-- stopped (mana-mod.js panelBack: Start only for the window and controller
-- editors, recognised by the open option $1876, not the ring cursor
-- $180A). The same taps as the browser's test
-- (tests/browser/native-status.spec.mjs, commit f376330): from the party
-- state, X opens the ring, right rotates it, B opens an option, X backs out.
-- run.mjs prepends IMPORT_ROOT, PANEL_BUNDLE and lib.lua.
local MODE = 0x7ED720            -- core: mode of the last dispatched frame (1 field, 3 menu, 4 ring)
local function tap(button)
  H.input = {[button] = true}
  H.wait(2)
  H.input = nil
  H.wait(70)
end
-- mana-mod.js menuActive: a ring or menu session, or a menu screen
local function menuActive()
  return H.r16(MODE) ~= 1 or (H.r8(0x7E00EC) & 0x0C) ~= 0 or (H.r8(0x7E00ED) & 0x40) ~= 0
end
local function toOption(o)
  for _ = 1, 8 do
    if H.r8(0x7E1876) == o then return true end
    tap('right')
  end
  return H.r8(0x7E1876) == o
end
local function back()
  for _ = 1, 5 do
    if not menuActive() then return true end
    tap('x')
  end
  return not menuActive()
end

function test()
  H.wait(5)
  local rows = {}
  for _, pair in ipairs({{0, 2}, {3, 2}, {4, 2}, {4, 4}, {0, 5}, {5, 5}, {0, 6}, {2, 6}}) do
    local first, option = pair[1], pair[2]
    H.w8(0x316001, 1)
    H.w8(0x316200, 0)
    if not C.import(PANEL_BUNDLE) then break end
    H.w8(0x316001, 1)
    H.w8(0x316200, 0)
    H.wait(4)
    tap('x')
    toOption(first)
    tap('b')
    local reset = back()
    tap('x')
    local reached = toOption(option)
    local cursor = H.r8(0x7E180A)
    tap('b')
    local opened = H.r16(MODE) == 3
    local closed = back()
    rows[#rows + 1] = {first = first, option = option, cursor = cursor, reset = reset, reached = reached, opened = opened, closed = closed}
    H.log(string.format('first %d option %d cursor %d reset %s reached %s opened %s closed %s', first, option, cursor,
      tostring(reset), tostring(reached), tostring(opened), tostring(closed)))
    C.check(reset and reached and opened and closed,
      string.format('option %d after option %d (cursor %d): reset %s reached %s opened %s closed %s', option, first, cursor,
        tostring(reset), tostring(reached), tostring(opened), tostring(closed)))
  end
  H.result('rows', rows)
  H.result('failures', C.failures)
end
