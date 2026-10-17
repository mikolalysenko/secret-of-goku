-- An imported browser state carries the browser's sound driver, without the
-- stream extension. The module finds out at its first transfer (the end
-- group comes back as the plain counter, not counter|$80), switches streams
-- off and stays cheap; native effects keep working. IMPORT = bundle dir.
local function srcnOurs()
  for v = 0, 7 do
    local s = dsp(v * 16 + 4)
    if (s == 12 or s == 13) and dsp(v * 16 + 8) > 0 then return v end
  end
  return nil
end
function test()
  H.wait(30)
  check('imported', H.importSnesJs(IMPORT), 'import failed')
  -- the module's state as the browser left it: zero (first service syncs)
  for a = 0, 0x7F do H.w8(AU + a, 0) end
  H.wait(40)                 -- song hold-off, then the sync STOP
  check('streams_off_without_extension', (H.r8(AU + 0x09) & 0x40) == 0x40, string.format('flags %02X', H.r8(AU + 0x09)))
  cmd(1, AUDIO_SFX_HIT)
  local ours = nil
  for f = 1, 30 do H.wait(1); ours = ours or srcnOurs() end
  check('no_stream_voice', ours == nil, tostring(ours))
  -- the game's own sound still answers (native effect through core_sound_queue)
  cmd(8, 0x50)
  H.wait(20)
  local k = emu.getState()['cpu.k']
  check('native_effect_answers', H.r8(0x7E1E00) == 0 and k ~= 0xC3, string.format('command byte %02X, CPU in bank %02X', H.r8(0x7E1E00), k))
  finish()
end
