-- fx_flash, the transformation's warm flash (native-feedback.js burst):
-- fixed-colour addition on BG1, BG2, OBJ palettes 4-7 and the backdrop. It
-- shows where the game runs no colour math of its own (Potos, $23 = 0),
-- and the field's values come back after it. Where the game blends layers
-- itself (the Potos approach, map 128: CGADSUB $42 blends BG2, the water,
-- with the subscreen) FX writes no colour math at all: the addition took
-- the game's blend away and the water turned cyan (reported 2026-10-22).
local REGS = {0x2130, 0x2131, 0x2132}
local log = {}
local function watch()
  local hooks = {}
  for _, reg in ipairs(REGS) do
    for _, bank in ipairs({0x000000, 0x800000}) do
      local a = bank + reg
      hooks[#hooks + 1] = {emu.addMemoryCallback(function(_, value) log[#log + 1] = {reg, value} end,
        emu.callbackType.write, a, a), a}
    end
  end
  return hooks
end
local function unwatch(hooks)
  for _, h in ipairs(hooks) do emu.removeMemoryCallback(h[1], emu.callbackType.write, h[2], h[2]) end
end
local function writes(reg)
  local out = {}
  for _, w in ipairs(log) do if w[1] == reg then out[#out + 1] = w[2] end end
  return out
end
local function hex(list)
  local out = {}
  for _, v in ipairs(list) do out[#out + 1] = string.format('%02X', v) end
  return table.concat(out, ' ')
end
local function regs()
  return 'CGWSEL ' .. hex(writes(0x2130)) .. ' / CGADSUB ' .. hex(writes(0x2131)) .. ' / COLDATA ' .. hex(writes(0x2132))
end
-- The seven-frame flash in `bundle`'s field, its register writes logged
-- until well after it; returns the game's $23.
local function flash(bundle)
  F.clear()
  if not F.import(bundle) then return nil end
  F.gokuOn(); H.wait(30)
  log = {}
  local hooks = watch()
  F.flash(7)
  H.wait(24)
  unwatch(hooks)
  return H.r8(0x7E0023)
end

function test()
  local m = flash('barrier-audit__potos-probe')
  if m then
    local cg, add, fixed = writes(0x2130), writes(0x2131), writes(0x2132)
    F.check('potos_no_game_math', m == 0, string.format('$23 = %02X', m))
    F.check('potos_flash_shows', add[1] == 0x33 and #fixed >= 2 and fixed[1] > 0x60, regs())
    F.check('potos_flash_restores', cg[#cg] == 0x02 and add[#add] == m and fixed[#fixed] == 0xE0, regs())
  end
  m = flash('emulator-probe__main-before-grass')
  if m then
    F.check('approach_game_math', m ~= 0, string.format('$23 = %02X', m))
    F.check('approach_no_flash', #log == 0, regs())
  end
  F.finish()
end
