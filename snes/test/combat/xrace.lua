-- X (ring / back) never reaches the game as native X, also while Goku is
-- inactive (the native boy): combat hides X up front and injects native Y
-- (mana-mod.js routes X to Y before every frame), so the ring of the
-- controlled character opens ($1808 = 0), never member 1's. The press lands
-- at every offset 8..32 frames after the import (goku.md measured member
-- 1's ring on one press frame in five when X was masked only after combat
-- saw the press). run.mjs prepends IMPORT_ROOT, XRACE_BUNDLE and lib.lua.
local MODE = 0x7ED720            -- core: mode of the last dispatched frame (4 ring)
function test()
  H.wait(5)
  local rows = {}
  for offset = 8, 32 do
    H.w8(0x316001, 0)            -- !persist_goku_active: the native boy
    H.w8(0x316200, 0)
    if not C.import(XRACE_BUNDLE) then break end
    H.w8(0x316001, 0)
    H.wait(offset)
    H.input = {x = true}
    H.wait(6)
    H.input = nil
    local opened, owner = false, -1
    for _ = 1, 60 do
      H.wait(1)
      if H.r16(MODE) == 4 then opened = true; owner = H.r8(0x7E1808); break end
    end
    rows[#rows + 1] = {offset = offset, opened = opened, owner = owner}
    C.check(opened and owner == 0, string.format('X %d frames after the import: %s', offset,
      opened and ('ring of member ' .. owner) or 'no ring'))
  end
  H.result('rows', rows)
  H.result('failures', C.failures)
end
