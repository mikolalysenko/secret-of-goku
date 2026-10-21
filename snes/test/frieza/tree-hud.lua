-- Actual TM writes and entry/exit evidence, including the first frame
-- returning to the field. The screenshot check compares the cliff itself.
function F.treeHudStart(sym)
  local owned, entry, tm = false, nil, nil
  local stats = {armed = 0, restored = 0, cutoffs = 0, conflicts = 0,
    collateral = 0, badCutoffs = 0, badRestore = 0, late = 0, uiFrames = 0, maxLines = 0}
  local function hud()
    local bytes = {}
    for a = (0x5800 + 25 * 32) * 2, (0x5800 + 28 * 32) * 2 - 1 do
      bytes[#bytes + 1] = string.char(H.vram(a))
    end
    return table.concat(bytes)
  end
  local function channel5()
    local bytes = {}
    for a = 0x4350, 0x4354 do bytes[#bytes + 1] = string.char(H.r8(a)) end
    return table.concat(bytes)
  end
  local function begin()
    local st = emu.getState()
    entry = {mask = H.r8(0x7E002C), ui = channel5(), hud = hud(), clock = st.masterClock}
    if st['ppu.scanline'] < 225 then stats.late = stats.late + 1 end
  end
  local function finish(on)
    local mask = H.r8(0x7E002C)
    if (mask & 0xBF) ~= (entry.mask & 0xBF) or channel5() ~= entry.ui or hud() ~= entry.hud then
      stats.collateral = stats.collateral + 1
    end
    F.check((mask & 0x40 ~= 0) == on, 'Tree HUD channel follows the vista')
    if tm ~= H.r8(0x7E0021) then stats.badRestore = stats.badRestore + 1 end
    stats.maxLines = math.max(stats.maxLines, (emu.getState().masterClock - entry.clock + 72) / 1364) -- JSR/RTS
    owned = on
  end
  local function hook(name, fn)
    emu.addMemoryCallback(fn, emu.callbackType.exec, sym[name], sym[name])
  end
  local function written(_, value)
    tm = value
    local line = emu.getState()['ppu.scanline']
    if owned and line == 199 then
      stats.cutoffs = stats.cutoffs + 1
      if (value & 4) ~= 0 or value ~= (H.r8(0x7E0021) & 0xFB) then stats.badCutoffs = stats.badCutoffs + 1 end
    end
  end
  for _, addr in ipairs({0x00212C, 0x80212C}) do
    emu.addMemoryCallback(written, emu.callbackType.write, addr, addr)
  end
  hook('fz_tree_hud_on', function()
    begin()
    if not owned and (entry.mask & 0x40) ~= 0 then stats.conflicts = stats.conflicts + 1 end
    if (entry.mask & 0x20) ~= 0 then stats.uiFrames = stats.uiFrames + 1 end
  end)
  hook('fz_tree_hud_on_done', function() finish(true); stats.armed = stats.armed + 1 end)
  hook('fz_tree_hud_off', begin)
  hook('fz_tree_hud_off_done', function() finish(false); stats.restored = stats.restored + 1 end)
  return function()
    H.result('hud', stats)
    F.check(stats.armed > 500 and stats.cutoffs >= stats.armed, 'BG3 cutoff runs throughout the vista, including lag frames')
    F.check(stats.restored > 0 and not owned and (H.r8(0x7E002C) & 0x40) == 0, 'HUD returns when the vista ends')
    F.check(stats.conflicts == 0, 'Tree channel 6 was free')
    F.check(stats.collateral == 0, 'native/UI HDMA and HUD tilemap preserved')
    F.check(stats.badCutoffs == 0, 'only BG3 removed before visible line 200')
    F.check(stats.badRestore == 0, 'native main-screen layers restored in vblank')
    F.check(stats.late == 0, 'HUD setup stays in vblank')
    F.check(stats.maxLines < 1, 'HUD setup below one scanline')
  end
end
