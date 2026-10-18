-- Songs $3B-$3F on the cartridge: the native song command loads each one
-- (sequence to $1A00, instruments, echo from audio_echo_table), the driver
-- plays all eight tracks with the voices the APU harness predicts, the game's
-- fade command works, and a native song plays again afterwards.
-- SONGS (prelude): { {id, edl, evol, efb, voices, file}, … }.
local function readBin(path)
  local f = assert(io.open(path, 'rb')); local d = f:read('*a'); f:close(); return d
end
local function songNow() return H.r8(0x7E1E05) end
local function serviced() return H.r8(0x7EDD1D) end   -- audio_service runs (one per game frame)
local function uploaded(blob)
  for i = 1, #blob do if aram(0x1A00 + i - 1) ~= blob:byte(i) then return false, i - 1 end end
  return true, -1
end

function test()
  check('extension_injected', injectExtension(), 'injection failed')
  H.wait(10)
  local native, preset, p3 = songNow(), H.r8(0x7E1E06), H.r8(0x7E1E07)
  H.result('native_song', string.format('%02X preset %X p3 %02X', native, preset, p3))
  for _, s in ipairs(SONGS) do
    local tag = string.format('song_%02X', s.id)
    local blob = readBin(s.file)
    local f0, a0 = H.frame, serviced()
    cmd(3, s.id)
    check(tag .. '_selected', H.waitFor(function() return songNow() == s.id end, 120), string.format('current %02X', songNow()))
    -- the loader first lets the previous song fade out, then uploads
    local t0 = H.frame
    local ok = H.waitFor(function() return (uploaded(blob)) end, 600)
    local _, bad = uploaded(blob)
    check(tag .. '_sequence_uploaded', ok, 'first mismatch at +' .. bad)
    -- instruments follow; the driver starts the tracks once its echo ring is clear
    local started = H.waitFor(function() return aram(0xAD) == 0xFF and dsp(0x2C) == s.evol end, 600)
    check(tag .. '_started', started, string.format('tracks %02X EVOL %02X', aram(0xAD), dsp(0x2C)))
    H.result(tag .. '_load_frames', H.frame - t0)
    -- frames the game loop stood still in the native loader (fade wait + upload)
    H.result(tag .. '_stall_frames', (H.frame - f0) - ((serviced() - a0) & 0xFF))
    H.wait(10)
    check(tag .. '_echo', (dsp(0x7D) & 15) == s.edl and dsp(0x2C) == s.evol and dsp(0x0D) == s.efb,
      string.format('EDL %d EVOL %02X EFB %02X', dsp(0x7D) & 15, dsp(0x2C), dsp(0x0D)))
    check(tag .. '_esa', dsp(0x6D) == 0xFA - 8 * s.edl, string.format('%02X', dsp(0x6D)))
    local d0 = aram(0x1980) | (aram(0x1981) << 8)
    check(tag .. '_instruments_after_effects', d0 >= 0x4DF1 and d0 < 0xFA00 - 0x800 * s.edl, string.format('%04X', d0))
    -- every voice the APU harness hears in these 4 s sounds here too (the
    -- scene's ambient effects may add voices, never remove one)
    local tracks, keyed = 0xFF, 0
    for f = 1, 240 do
      H.wait(1)
      tracks = tracks & aram(0xAD)
      for v = 0, 7 do if dsp(v * 16 + 8) > 0 then keyed = keyed | (1 << v) end end
    end
    check(tag .. '_tracks', tracks == 0xFF, string.format('%02X', tracks))
    check(tag .. '_voices_sound', keyed & s.voices == s.voices, string.format('heard %02X expected %02X', keyed, s.voices))
    H.result(tag .. '_voices', string.format('heard %02X expected %02X', keyed, s.voices))
    -- the upload and 4 s of echo left the effect samples and the extension alone
    local hurt = effectSampleDamage()
    check(tag .. '_effect_samples_intact', hurt == nil, string.format('%04X', hurt or 0))
    hurt = extensionDamage()
    check(tag .. '_extension_intact', hurt == nil, string.format('%04X', hurt or 0))
  end
  -- a song change while a loop plays: the song start keys every voice off,
  -- the module drops its streams and waits out the driver's echo clear, and
  -- the held loop comes back on a voice the new song's tracks leave alone
  cmd(5, AUDIO_LOOP_CHARGE)
  H.wait(30)
  local v0 = aram(0xED)                 -- loops stream on channel 1
  check('loop_before_song_change', v0 ~= 0xFF and dsp(v0 * 16 + 8) > 0, v0)
  cmd(3, 0x3E)
  H.waitFor(function() return songNow() == 0x3E end, 120)
  check('song_start_seen', H.waitFor(function() return aram(0xAD) == 0 end, 600), 'tracks never cleared')
  local gone = aram(0xED) == 0xFF or dsp(aram(0xED) * 16 + 8) == 0
  H.waitFor(function() return aram(0xAD) == 0xFF end, 600)
  check('loop_silenced_by_song_start', gone, aram(0xED))
  local t1 = H.frame
  local back = H.waitFor(function() local v = aram(0xED); return v ~= 0xFF and dsp(v * 16 + 8) > 0 end, 120)
  local v1 = aram(0xED)
  check('loop_back_after_song_change', back and (aram(0xAE) >> v1) & 1 == 1, string.format('voice %02X SFX mask %02X', v1, aram(0xAE)))
  H.result('loop_back_frames', H.frame - t1)
  check('song_tracks_beside_loop', aram(0xAD) == 0xFF, string.format('%02X', aram(0xAD)))
  cmd(6, 0)
  H.wait(15)
  check('loop_released', aram(0xED) == 0xFF and (aram(0xAE) >> v1) & 1 == 0, string.format('voice %02X SFX mask %02X', aram(0xED), aram(0xAE)))
  -- the game's fade-out command on the last new song (128 steps, one every
  -- 7 driver ticks: about 4 s)
  local before = aram(0x84)
  cmd(7, 0x80)
  H.wait(300)
  check('fade_out', aram(0x84) < before and aram(0x84) < 0x20, string.format('%02X -> %02X', before, aram(0x84)))
  -- and back to the scene's own music (audio_song_restore)
  cmd(9, 0)
  check('native_song_again', H.waitFor(function() return songNow() == native end, 600), songNow())
  check('native_song_parameters', H.r8(0x7E1E06) == preset and H.r8(0x7E1E07) == p3,
    string.format('preset %X p3 %02X', H.r8(0x7E1E06), H.r8(0x7E1E07)))
  H.wait(120)
  local env = 0
  for f = 1, 60 do H.wait(1); for v = 0, 7 do env = math.max(env, dsp(v * 16 + 8)) end end
  check('native_music_plays', env > 0, env)
  finish()
end
