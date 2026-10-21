-- Analyzer readings while Goku charges, releases and focuses in a Rabite
-- field: readouts and the ki aura share FX's cell cache, the game's actor
-- effects stream into it. Every displayed FX, UI and native sprite must show
-- its owner's pixels (snes/test/lua/cells-check.lua, prepended by run.mjs).
-- Each Analyzer runs the game's spell landing (snes/test/lua/analyzer.lua).
function test()
  Cells.init()
  enter(BUNDLE)
  H.w8(0x7ECFAB, 2)                -- Sylphid's powers: Analyzer exists
  local hits = 0
  local h = emu.addMemoryCallback(function() hits = hits + 1 end, emu.callbackType.exec, SYM.ui_sc_analyzer_hit, SYM.ui_sc_analyzer_hit)
  H.wait(30)
  local readings = 0
  Cells.measuring = true
  for cycle = 1, 4 do
    Analyzer.crowd()
    for _, step in ipairs({{'l y', 90}, {'', 20}, {'l', 60}, {'', 20}}) do
      for _ = 1, step[2] do
        H.input = {}; for b in step[1]:gmatch('%S+') do H.input[b] = true end
        H.wait(1); Cells.frame()
        if ui(0x50) ~= 0 then readings = readings + 1 end
      end
    end
  end
  Cells.measuring = false; H.input = nil
  emu.removeMemoryCallback(h, emu.callbackType.exec, SYM.ui_sc_analyzer_hit, SYM.ui_sc_analyzer_hit)
  H.result('hits', hits); H.result('readingFrames', readings)
  Cells.report()
  local s = Cells.stats
  check('analyzer_hits', hits >= 4, hits)
  -- Busy charge frames may defer the readout (ui.md, Shared FX cells); the
  -- case must still show readings and the aura together on some frames.
  check('readings_shown', s.uiFrames >= 30, readings .. ' / ' .. s.uiFrames)
  check('aura_shown', s.auraFrames >= 100, s.auraFrames)
  check('readings_with_aura', s.bothFrames >= 10, s.bothFrames)
  check('aura_pixels', s.auraBad == 0, s.auraBad)
  check('fx_resident_pixels', s.fxBad == 0, s.fxBad)
  check('readout_pixels', s.uiBad == 0, s.uiBad)
  check('native_pixels', s.nativeBad == 0, s.nativeBad)
  check('no_free_entry_drawn', s.freeRefs == 0, s.freeRefs)
  finish()
end
